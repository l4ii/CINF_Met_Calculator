import { Fragment, useEffect, useMemo, useRef, useState } from 'react'

import type { OxyConstraintSolverResult } from '../../utils/copperConstraintSolver.ts'
import {
  loadOxySideBlowConstraints,
  OXY_PRODUCT_KEY_TO_CN,
  OXY_SIDE_BLOW_PRODUCT_KEYS,
  type OxySideBlowConstraintConfig,
} from '../../utils/copperConstraintConfig.ts'
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
} from '../../utils/copperProductResultTable.ts'
import { elementSymbolLabel } from '../../utils/copperElementDisplay.ts'
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
  mode = 'both',
  phaseTitle = '产物物相组成',
  elementTitle = '产出元素组成',
  config,
}: {
  darkMode: boolean
  result?: OxyConstraintSolverResult | null
  empty?: boolean
  mode?: 'both' | 'phase' | 'element'
  phaseTitle?: string
  elementTitle?: string
  config?: OxySideBlowConstraintConfig
}) {
  const border = darkMode ? 'border-gray-600' : 'border-gray-200'
  const head = darkMode ? 'bg-gray-800 text-gray-300' : 'bg-gray-50 text-gray-600'
  const resolvedConfig = useMemo(() => config ?? loadOxySideBlowConstraints(), [config])
  const showEmpty = empty || !result
  const pivotRows = showEmpty ? [] : buildProductResultPivotData(result!, resolvedConfig)
  const elementRows = pivotRows.filter((row) => row.kind === 'element')
  const elementColumnCount = Math.max(elementRows.length, 1)

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

  const labelSamples = showEmpty
    ? ['名称']
    : OXY_SIDE_BLOW_PRODUCT_KEYS.map((pk) => result!.products[pk].name || OXY_PRODUCT_KEY_TO_CN[pk])
  const { widths: colWidths, tableWidth: resolvedTableWidth } = computeProductResultTableLayout({
    labelSamples,
    productHeaders: elementRows.length > 0 ? elementRows.map((row) => elementSymbolLabel(row.label)) : ['元素'],
    containerWidth: viewportWidth,
  })

  const colCount = 2 + elementColumnCount
  const warnPanel = darkMode ? 'bg-amber-950/40 text-amber-200 border-amber-800' : 'bg-amber-50 text-amber-900 border-amber-200'

  const renderProductElementTable = () => (
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
                {elementTitle}
              </div>
            </th>
          </tr>
          <tr>
            <th rowSpan={2} className={assistStickyHeadClass(darkMode)}>
              名称
            </th>
            <th
              rowSpan={2}
              className={`px-0.5 py-1.5 text-center text-sm font-semibold ${assistTotalCellClass(darkMode)}`}
            >
              t/h
            </th>
            <th colSpan={elementColumnCount} className="px-0.5 py-1.5 text-center text-sm font-semibold">
              元素 w%
            </th>
          </tr>
          <tr>
            {Array.from({ length: elementColumnCount }, (_, index) => {
              const row = elementRows[index]
              return (
                <th
                  key={`product-element-head-${index}`}
                  className={`border-l px-1 py-1.5 text-center text-sm font-semibold ${border}`}
                >
                  {row ? elementSymbolLabel(row.label) : '—'}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {OXY_SIDE_BLOW_PRODUCT_KEYS.map((pk) => {
            const product = showEmpty
              ? { name: OXY_PRODUCT_KEY_TO_CN[pk], mass: 0 }
              : result!.products[pk]
            return (
              <tr key={`product-element-${pk}`}>
                <td className={`${assistStickyLabelClass(darkMode)} border-t font-semibold`}>{product.name}</td>
                <td
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
                {Array.from({ length: elementColumnCount }, (_, index) => {
                  const row = elementRows[index]
                  const value = row ? row.values[pk] : null
                  const hasValue = pivotCellHasValue('element', value)
                  return (
                    <td
                      key={`${pk}-element-value-${index}`}
                      className={`border-t px-0.5 py-1.5 text-center align-middle text-sm font-mono ${assistFirstDataRowClass(
                        darkMode
                      )} ${assistValueHighlightClass(darkMode, hasValue)}`}
                    >
                      {showEmpty || !row || value == null ? (
                        '—'
                      ) : (
                        <BatchTableNumericReadonly
                          darkMode={darkMode}
                          value={value}
                          helpTitle={`${product.name} · ${elementSymbolLabel(row.label)} w%`}
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
                {phaseTitle}
              </div>
            </th>
          </tr>
          <tr>
            <th className={assistStickyHeadClass(darkMode)}>名称</th>
            <th className={`px-0.5 py-1.5 text-center text-sm font-semibold ${assistTotalCellClass(darkMode)}`}>
              t/h
            </th>
            <th colSpan={maxPhaseCols} className="px-0.5 py-1.5 text-center text-sm font-semibold">
              物相百分比
            </th>
          </tr>
        </thead>
        <tbody>
          {OXY_SIDE_BLOW_PRODUCT_KEYS.map((pk) => {
            const product = showEmpty
              ? { name: OXY_PRODUCT_KEY_TO_CN[pk], mass: 0, phases: [] as Array<{ key: string; pct: number; mass: number }> }
              : result!.products[pk]
            const phases = product.phases
            const showGasVolumePct = pk === 'flueGas'
            const volumePercents =
              showGasVolumePct && phases.length > 0
                ? calculateGasVolumePercents(Object.fromEntries(phases.map((phase) => [phase.key, phase.pct])))
                : null

            return (
              <Fragment key={pk}>
                <tr>
                  <td
                    rowSpan={2}
                    className={`${assistStickyLabelClass(darkMode)} border-t font-semibold`}
                  >
                    {product.name}
                  </td>
                  <td
                    rowSpan={2}
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
                    const displayPct =
                      phase && volumePercents
                        ? volumePercents[phase.key as keyof typeof volumePercents] ?? 0
                        : phase?.pct ?? 0
                    const pctKind = showGasVolumePct ? 'v%' : 'w%'
                    const hasValue = phase != null && displayPct > 0
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
                            value={displayPct}
                            helpTitle={`${phaseLabel(phase.key)} ${pctKind} · 质量 ${formatBatchTableTooltip(phase.mass)} t/h`}
                            className="inline text-sm"
                          />
                        ) : (
                          '—'
                        )}
                      </td>
                    )
                  })}
                </tr>
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )

  const showPhase = mode === 'both' || mode === 'phase'
  const showElement = mode === 'both' || mode === 'element'
  const showWarnings = mode === 'both'

  return (
    <div className="space-y-3">
      {showWarnings && result && !result.converged && (
        <div className={`rounded-lg border px-3 py-2 text-sm ${warnPanel}`}>
          部分自定义约束未收敛：{result.message ?? '请检查配料或约束配置。'}
        </div>
      )}
      {showWarnings && result && result.valid === false && result.converged && (
        <div className={`rounded-lg border px-3 py-2 text-sm ${warnPanel}`}>
          {result.message ?? '产物元素合计未闭合至 100%。'}
        </div>
      )}
      {showPhase && renderPhaseTables()}
      {showElement && renderProductElementTable()}
    </div>
  )
}
