import { Fragment, useEffect, useMemo, useRef, useState } from 'react'

import type { OxyConstraintSolverResult } from '../../utils/copperConstraintSolver.ts'
import { loadOxySideBlowConstraints, OXY_PRODUCT_KEY_TO_CN, OXY_SIDE_BLOW_PRODUCT_KEYS } from '../../utils/copperConstraintConfig.ts'
import {
  assistColumnStripeClass,
  assistFirstDataRowClass,
  assistStickyHeadClass,
  assistStickyLabelClass,
  assistTotalCellClass,
  assistValueHighlightClass,
  computeProductResultTableLayout,
} from '../../utils/copperBatchTableLayout.ts'
import {
  buildProductResultPivotData,
  productResultColumnHeaders,
} from '../../utils/copperProductResultTable.ts'
import { phaseStorageKeyToDisplayLabel } from '../../utils/copperPhaseTableCalc.ts'
import { calculateGasVolumePercents } from '../../utils/copperProductPhaseCalc.ts'
import { formatBatchTableTooltip } from '../../utils/batchTableNumeric.ts'
import { BatchTableNumericReadonly } from './BatchTableNumericCell.tsx'
import { CopperBatchTableColGroup } from './CopperBatchTableColGroup'

function phaseLabel(key: string) {
  return phaseStorageKeyToDisplayLabel(key)
}

function pivotCellHasValue(kind: string, value: number | null | undefined): boolean {
  if (value == null) return false
  if (kind === 'mass') return value > 0
  if (kind === 'share' || kind === 'wClose' || kind === 'element') return Number.isFinite(value)
  return false
}

export function CopperProductionResultTable({
  darkMode,
  result,
  empty = false,
}: {
  darkMode: boolean
  result?: OxyConstraintSolverResult | null
  empty?: boolean
}) {
  const border = darkMode ? 'border-gray-600' : 'border-gray-200'
  const head = darkMode ? 'bg-gray-800 text-gray-300' : 'bg-gray-50 text-gray-600'
  const config = useMemo(() => loadOxySideBlowConstraints(), [])
  const showEmpty = empty || !result
  const columns = productResultColumnHeaders(config)
  const pivotRows = showEmpty ? [] : buildProductResultPivotData(result!, config)

  const containerRef = useRef<HTMLDivElement>(null)
  const [viewportWidth, setViewportWidth] = useState(0)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const update = () => setViewportWidth(el.clientWidth)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const labelSamples = ['t/h', '占比%', 'w%', ...columns.map((col) => col.label)]
  const { widths: colWidths, tableWidth: resolvedTableWidth } = computeProductResultTableLayout({
    labelSamples,
    productHeaders: columns.map((col) => col.label),
    containerWidth: viewportWidth,
  })

  const colCount = 2 + columns.length
  const warnPanel = darkMode ? 'bg-amber-950/40 text-amber-200 border-amber-800' : 'bg-amber-50 text-amber-900 border-amber-200'

  const renderPivotTable = () => (
    <div ref={containerRef} className={`overflow-auto rounded-lg border ${border}`}>
      <table className="table-fixed w-full border-collapse text-sm" style={{ width: resolvedTableWidth }}>
        <CopperBatchTableColGroup widths={colWidths} />
        <thead className={head}>
          <tr>
            <th colSpan={colCount} className={`p-0 ${head}`}>
              <div
                className="sticky left-0 px-2 py-1.5 text-center text-sm font-semibold"
                style={{ width: viewportWidth || undefined }}
              >
                产出元素组成
              </div>
            </th>
          </tr>
          <tr>
            <th className={assistStickyHeadClass(darkMode)}>项目</th>
            <th className={`px-0.5 py-1.5 text-center text-sm font-semibold ${assistTotalCellClass(darkMode)}`}>
              合计
            </th>
            {columns.map((col, index) => (
              <th
                key={col.key}
                className={`px-0.5 py-1.5 text-center text-sm font-semibold ${assistColumnStripeClass(darkMode, index)}`}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(showEmpty
            ? [
                { kind: 'mass' as const, label: 't/h', values: {}, total: null },
                { kind: 'share' as const, label: '占比%', values: {}, total: null },
                { kind: 'wClose' as const, label: 'w%', values: {}, total: null },
              ]
            : pivotRows
          ).map((row) => {
            const isWRow = row.kind === 'wClose'
            return (
              <tr key={`${row.kind}-${row.label}`}>
                <td
                  className={`${assistStickyLabelClass(darkMode)} border-t font-medium ${
                    isWRow ? assistFirstDataRowClass(darkMode) : ''
                  }`}
                >
                  {row.label}
                </td>
                <td
                  className={`border-t px-0.5 py-1.5 text-center align-middle text-sm font-mono font-semibold ${assistTotalCellClass(
                    darkMode
                  )} ${assistValueHighlightClass(darkMode, pivotCellHasValue(row.kind, row.total))} ${
                    isWRow ? assistFirstDataRowClass(darkMode) : ''
                  }`}
                >
                  {showEmpty ? (
                    '—'
                  ) : (
                    <BatchTableNumericReadonly
                      darkMode={darkMode}
                      value={row.total ?? '—'}
                      helpTitle={`${row.label} 合计`}
                      className="inline text-sm font-semibold"
                    />
                  )}
                </td>
                {columns.map((col, index) => {
                  const value = showEmpty ? null : row.values[col.key]
                  const hasValue = pivotCellHasValue(row.kind, value)
                  const cellCls = `border-t px-0.5 py-1.5 text-center align-middle text-sm font-mono ${
                    isWRow ? assistFirstDataRowClass(darkMode) : assistColumnStripeClass(darkMode, index)
                  } ${assistValueHighlightClass(darkMode, hasValue)}`
                  return (
                    <td key={`${row.kind}-${col.key}`} className={cellCls}>
                      {showEmpty || value == null ? (
                        '—'
                      ) : (
                        <BatchTableNumericReadonly
                          darkMode={darkMode}
                          value={value}
                          helpTitle={`${col.label} · ${row.label}`}
                          className="inline text-sm"
                        />
                      )}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )

  const maxPhaseCols = showEmpty
    ? 1
    : Math.max(...OXY_SIDE_BLOW_PRODUCT_KEYS.map((pk) => result!.products[pk].phases.length), 1)

  const phaseContainerRef = useRef<HTMLDivElement>(null)
  const [phaseViewportWidth, setPhaseViewportWidth] = useState(0)

  useEffect(() => {
    const el = phaseContainerRef.current
    if (!el) return
    const update = () => setPhaseViewportWidth(el.clientWidth)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const phaseLabelSamples = OXY_SIDE_BLOW_PRODUCT_KEYS.flatMap((pk) =>
    showEmpty ? [OXY_SIDE_BLOW_PRODUCT_KEYS.indexOf(pk) === 0 ? '物相' : ''] : result!.products[pk].phases.map((p) => phaseLabel(p.key))
  )
  const phaseColLayout = computeProductResultTableLayout({
    labelSamples: ['名称', ...phaseLabelSamples],
    productHeaders: Array.from({ length: maxPhaseCols }, (_, i) => `物相${i + 1}`),
    containerWidth: phaseViewportWidth,
  })

  const renderPhaseTables = () => (
    <div ref={phaseContainerRef} className={`overflow-auto rounded-lg border ${border}`}>
      <table className="table-fixed w-full border-collapse text-sm" style={{ width: phaseColLayout.tableWidth }}>
        <CopperBatchTableColGroup widths={phaseColLayout.widths} />
        <thead className={head}>
          <tr>
            <th colSpan={2 + maxPhaseCols} className={`p-0 ${head}`}>
              <div
                className="sticky left-0 px-2 py-1.5 text-center text-sm font-semibold"
                style={{ width: phaseViewportWidth || undefined }}
              >
                产物物相组成
              </div>
            </th>
          </tr>
          <tr>
            <th className={assistStickyHeadClass(darkMode)}>名称</th>
            <th className={`px-0.5 py-1.5 text-center text-sm font-semibold ${assistTotalCellClass(darkMode)}`}>
              t/h
            </th>
            <th colSpan={maxPhaseCols} className="px-0.5 py-1.5 text-center text-sm font-semibold">
              物相 w%
            </th>
          </tr>
        </thead>
        <tbody>
          {OXY_SIDE_BLOW_PRODUCT_KEYS.map((pk) => {
            const product = showEmpty
              ? { name: OXY_PRODUCT_KEY_TO_CN[pk], mass: 0, phases: [] as Array<{ key: string; pct: number; mass: number }> }
              : result!.products[pk]
            const phases = product.phases
            const showVolumeRow = pk === 'flueGas'
            const volumePercents =
              showVolumeRow && phases.length > 0
                ? calculateGasVolumePercents(Object.fromEntries(phases.map((phase) => [phase.key, phase.pct])))
                : null

            return (
              <Fragment key={pk}>
                <tr>
                  <td
                    rowSpan={showVolumeRow ? 3 : 2}
                    className={`${assistStickyLabelClass(darkMode)} border-t font-semibold`}
                  >
                    {product.name}
                  </td>
                  <td
                    rowSpan={showVolumeRow ? 3 : 2}
                    className={`border-t px-0.5 py-1.5 text-center align-middle text-sm font-mono ${assistTotalCellClass(
                      darkMode
                    )}`}
                  >
                    {showEmpty ? (
                      '—'
                    ) : (
                      <BatchTableNumericReadonly
                        darkMode={darkMode}
                        value={product.mass}
                        helpTitle={`${product.name} 总质量`}
                        className="inline text-sm"
                      />
                    )}
                  </td>
                  {Array.from({ length: maxPhaseCols }, (_, i) => {
                    const phase = phases[i]
                    return (
                      <td
                        key={`${pk}-label-${i}`}
                        className={`border-t px-0.5 py-1.5 text-center align-middle text-sm font-medium ${assistColumnStripeClass(
                          darkMode,
                          i
                        )}`}
                      >
                        {phase ? phaseLabel(phase.key) : '—'}
                      </td>
                    )
                  })}
                </tr>
                <tr>
                  {Array.from({ length: maxPhaseCols }, (_, i) => {
                    const phase = phases[i]
                    const hasValue = phase != null && phase.pct > 0
                    return (
                      <td
                        key={`${pk}-pct-${i}`}
                        className={`border-t px-0.5 py-1.5 text-center align-middle text-sm font-mono ${assistFirstDataRowClass(
                          darkMode
                        )} ${assistValueHighlightClass(darkMode, hasValue)}`}
                      >
                        {phase ? (
                          <BatchTableNumericReadonly
                            darkMode={darkMode}
                            value={phase.pct}
                            helpTitle={`${phaseLabel(phase.key)} w% · 质量 ${formatBatchTableTooltip(phase.mass)} t/h`}
                            className="inline text-sm"
                          />
                        ) : (
                          '—'
                        )}
                      </td>
                    )
                  })}
                </tr>
                {showVolumeRow && (
                  <tr>
                    {Array.from({ length: maxPhaseCols }, (_, i) => {
                      const phase = phases[i]
                      const volPct =
                        phase && volumePercents
                          ? volumePercents[phase.key as keyof typeof volumePercents]
                          : null
                      const volValue = volPct != null && volPct > 1e-12 ? volPct : phase ? 0 : null
                      return (
                        <td
                          key={`${pk}-vol-${i}`}
                          className={`border-t px-0.5 py-1.5 text-center align-middle text-sm font-mono ${assistColumnStripeClass(
                            darkMode,
                            i
                          )}`}
                        >
                          {phase && volValue != null ? (
                            <BatchTableNumericReadonly
                              darkMode={darkMode}
                              value={volValue}
                              helpTitle={`${phaseLabel(phase.key)} v%`}
                              className="inline text-sm"
                            />
                          ) : (
                            '—'
                          )}
                        </td>
                      )
                    })}
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )

  return (
    <div className="space-y-3">
      {result && !result.converged && (
        <div className={`rounded-lg border px-3 py-2 text-sm ${warnPanel}`}>
          部分自定义约束未收敛：{result.message ?? '请检查配料或约束配置。'}
        </div>
      )}
      {result && result.valid === false && result.converged && (
        <div className={`rounded-lg border px-3 py-2 text-sm ${warnPanel}`}>
          {result.message ?? '产物元素合计未闭合至 100%。'}
        </div>
      )}
      {renderPhaseTables()}
      {renderPivotTable()}
    </div>
  )
}
