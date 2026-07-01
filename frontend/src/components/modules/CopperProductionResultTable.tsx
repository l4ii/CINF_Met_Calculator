import { Fragment, useEffect, useMemo, useRef, useState } from 'react'

import type { OxyConstraintSolverResult } from '../../utils/copperConstraintSolver.ts'
import {
  loadOxySideBlowConstraints,
  OXY_PRODUCT_KEY_TO_CN,
  OXY_SIDE_BLOW_PRODUCT_KEYS,
  type OxySideBlowConstraintConfig,
  type OxySideBlowProductKey,
} from '../../utils/copperConstraintConfig.ts'
import {
  computeProductResultTableLayout,
} from '../../utils/copperBatchTableLayout.ts'
import {
  buildProductResultPivotData,
} from '../../utils/copperProductResultTable.ts'
import {
  buildElementTableDisplayKeys,
  decomposeElementTableRatios,
  elementTableDisplaySourceKeys,
  elementTableHeaderLabel,
  type CopperElementDisplayMode,
} from '../../utils/copperElementDisplay.ts'
import { phaseStorageKeyToDisplayLabel } from '../../utils/copperPhaseTableCalc.ts'
import {
  calculateGasStandardVolumeNm3h,
  calculateGasVolumePercents,
} from '../../utils/copperProductPhaseCalc.ts'
import type { CopperElementKey } from '../../utils/copperWorkflowCalc.ts'
import { formatBatchTableTooltip } from '../../utils/batchTableNumeric.ts'
import { BatchTableNumericReadonly } from './BatchTableNumericCell.tsx'
import { CopperBatchTableColGroup } from './CopperBatchTableColGroup'

function phaseLabel(key: string) {
  return phaseStorageKeyToDisplayLabel(key)
}

function isGasProductKey(key: string) {
  return key === 'flueGas' || key === 'fugitive'
}

function productRowToneClass(dark: boolean, productKey: OxySideBlowProductKey) {
  if (productKey === 'flueGas' || productKey === 'fugitive') {
    return dark ? 'bg-sky-950/20 text-sky-50' : 'bg-sky-50/80 text-sky-950'
  }
  if (productKey === 'smeltingSlag' || productKey === 'loss') {
    return dark ? 'bg-amber-950/30 text-amber-50' : 'bg-amber-50/85 text-amber-950'
  }
  if (productKey === 'matte' || productKey === 'dust') {
    return dark ? 'bg-emerald-950/20 text-emerald-50' : 'bg-emerald-50/80 text-emerald-950'
  }
  return dark ? 'bg-gray-800/45 text-gray-100' : 'bg-white text-gray-900'
}

function resultHeadCellClass(dark: boolean) {
  return `px-2 py-1.5 text-center text-sm font-semibold ${dark ? 'text-gray-300' : 'text-gray-700'}`
}

function resultStickyHeadClass(dark: boolean) {
  return `sticky left-0 z-30 ${resultHeadCellClass(dark)} ${dark ? 'bg-gray-800' : 'bg-gray-50'}`
}

function resultCellClass(dark: boolean, productKey: OxySideBlowProductKey, extra = '') {
  const line = dark ? 'border-gray-700/70' : 'border-gray-200'
  return `border-t ${line} px-1 py-1.5 text-center align-middle text-sm ${productRowToneClass(dark, productKey)} ${extra}`
}

function resultStickyNameClass(dark: boolean, productKey: OxySideBlowProductKey) {
  return `sticky left-0 z-10 ${resultCellClass(dark, productKey, 'px-2 font-semibold')}`
}

function resultMutedTextClass(dark: boolean) {
  return dark ? 'text-gray-500' : 'text-gray-500'
}

export function CopperProductionResultTable({
  darkMode,
  result,
  empty = false,
  mode = 'both',
  phaseTitle = '产物物相组成',
  elementTitle = '产出元素组成',
  elementDisplayMode = 'compound',
  config,
}: {
  darkMode: boolean
  result?: OxyConstraintSolverResult | null
  empty?: boolean
  mode?: 'both' | 'phase' | 'element'
  phaseTitle?: string
  elementTitle?: string
  elementDisplayMode?: CopperElementDisplayMode
  config?: OxySideBlowConstraintConfig
}) {
  const border = darkMode ? 'border-gray-600' : 'border-gray-200'
  const head = darkMode ? 'bg-gray-800 text-gray-300' : 'bg-gray-50 text-gray-600'
  const resolvedConfig = useMemo(() => config ?? loadOxySideBlowConstraints(), [config])
  const showEmpty = empty || !result
  const pivotRows = showEmpty ? [] : buildProductResultPivotData(result!, resolvedConfig)
  const elementRows = pivotRows.filter((row) => row.kind === 'element')
  const elementSourceKeys = elementRows.map((row) => row.label as CopperElementKey)
  const displayElementKeys = buildElementTableDisplayKeys(elementSourceKeys, elementDisplayMode)
  const elementColumnCount = Math.max(displayElementKeys.length, 1)
  const elementRowByLabel = new Map(elementRows.map((row) => [row.label, row]))
  const productElementDisplayRatios = (productKey: OxySideBlowProductKey) => {
    const ratios: Partial<Record<CopperElementKey, number>> = {}
    for (const row of elementRows) {
      const value = row.values[productKey]
      if (value == null || !Number.isFinite(value)) continue
      ratios[row.label as CopperElementKey] = value
    }
    return decomposeElementTableRatios(ratios, elementDisplayMode)
  }

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
  const phaseMassLabelSamples = showEmpty
    ? labelSamples
    : [
        ...labelSamples,
        ...OXY_SIDE_BLOW_PRODUCT_KEYS.map((pk) => result!.products[pk].mass.toFixed(2)),
        ...(result?.products.flueGas?.phases
          ? [calculateGasStandardVolumeNm3h(result.products.flueGas.phases).toFixed(2), 'Nm³/h']
          : []),
      ]
  const { widths: colWidths, tableWidth: resolvedTableWidth } = computeProductResultTableLayout({
    labelSamples,
    productHeaders:
      displayElementKeys.length > 0
        ? displayElementKeys.map((key) => elementTableHeaderLabel(key, elementDisplayMode))
        : ['元素'],
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
            <th rowSpan={2} className={resultStickyHeadClass(darkMode)}>
              名称
            </th>
            <th
              rowSpan={2}
              className={resultHeadCellClass(darkMode)}
            >
              t/h
            </th>
            <th colSpan={elementColumnCount} className={resultHeadCellClass(darkMode)}>
              元素 w%
            </th>
          </tr>
          <tr>
            {Array.from({ length: elementColumnCount }, (_, index) => {
              const element = displayElementKeys[index]
              return (
                <th
                  key={`product-element-head-${index}`}
                  className={resultHeadCellClass(darkMode)}
                >
                  {element ? elementTableHeaderLabel(element, elementDisplayMode) : '—'}
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
                <td className={resultStickyNameClass(darkMode, pk)}>{product.name}</td>
                <td
                  className={resultCellClass(darkMode, pk, 'font-mono')}
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
                  const element = displayElementKeys[index]
                  const sourceRow = element ? elementRowByLabel.get(element) : undefined
                  const sourceRows = element
                    ? elementTableDisplaySourceKeys(element, elementSourceKeys, elementDisplayMode)
                        .map((key) => elementRowByLabel.get(key))
                        .filter((row): row is NonNullable<typeof row> => Boolean(row))
                    : []
                  const applicable = elementDisplayMode === 'compound'
                    ? sourceRow?.values[pk] != null
                    : sourceRows.some((row) => row.values[pk] != null)
                  const displayRatios = productElementDisplayRatios(pk)
                  const value = element
                    ? applicable
                      ? elementDisplayMode === 'compound'
                        ? sourceRow?.values[pk] ?? null
                        : displayRatios[element] ?? 0
                      : null
                    : null
                  return (
                    <td
                      key={`${pk}-element-value-${index}`}
                      className={resultCellClass(darkMode, pk, `font-mono ${!element || value == null ? resultMutedTextClass(darkMode) : ''}`)}
                    >
                      {showEmpty || !element || value == null ? (
                        '—'
                      ) : (
                        <BatchTableNumericReadonly
                          darkMode={darkMode}
                          value={value}
                          helpTitle={`${product.name} · ${elementTableHeaderLabel(element, elementDisplayMode)} w%`}
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
  const [flueGasTotalUnit, setFlueGasTotalUnit] = useState<'mass' | 'volume'>('mass')

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
    productHeaders: ['', ...Array.from({ length: maxPhaseCols }, (_, i) => `物相${i + 1}`)],
    containerWidth: phaseViewportWidth,
    totalSamples: phaseMassLabelSamples,
  })

  const renderPhaseTables = () => (
    <div ref={phaseContainerRef} className={`overflow-auto rounded-lg border ${border}`}>
      <table className="table-fixed w-full border-collapse text-sm" style={{ width: phaseColLayout.tableWidth }}>
        <CopperBatchTableColGroup widths={phaseColLayout.widths} />
        <thead className={head}>
          <tr>
            <th colSpan={3 + maxPhaseCols} className={`p-0 ${head}`}>
              <div
                className="sticky left-0 px-2 py-1.5 text-center text-sm font-semibold"
                style={{ width: phaseViewportWidth || undefined }}
              >
                {phaseTitle}
              </div>
            </th>
          </tr>
          <tr>
            <th className={resultStickyHeadClass(darkMode)}>名称</th>
            <th className={resultHeadCellClass(darkMode)}>
              t/h
            </th>
            <th className={resultHeadCellClass(darkMode)} aria-label="口径" />
            <th colSpan={maxPhaseCols} className={resultHeadCellClass(darkMode)}>
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
            const showGasVolumePct = isGasProductKey(pk)
            const volumePercents =
              showGasVolumePct && phases.length > 0
                ? calculateGasVolumePercents(Object.fromEntries(phases.map((phase) => [phase.key, phase.pct])))
                : null
            const rowSpan = showGasVolumePct ? 3 : 2
            const canToggleFlueGasVolume = pk === 'flueGas' && !showEmpty
            const flueGasVolumeNm3h = canToggleFlueGasVolume ? calculateGasStandardVolumeNm3h(phases) : 0
            const totalDisplayValue =
              canToggleFlueGasVolume && flueGasTotalUnit === 'volume' ? flueGasVolumeNm3h : product.mass
            const totalUnitLabel =
              canToggleFlueGasVolume && flueGasTotalUnit === 'volume' ? 'Nm³/h' : 't/h'

            return (
              <Fragment key={pk}>
                <tr>
                  <td
                    rowSpan={rowSpan}
                    className={resultStickyNameClass(darkMode, pk)}
                  >
                    {product.name}
                  </td>
                  <td
                    rowSpan={rowSpan}
                    className={resultCellClass(darkMode, pk, 'font-mono')}
                  >
                    {showEmpty ? (
                      '—'
                    ) : canToggleFlueGasVolume ? (
                      <div className="relative grid h-full min-h-[5.25rem] grid-rows-[1.15rem_minmax(1.5rem,1fr)_1.15rem] items-center">
                        <span className={`text-[11px] ${darkMode ? 'text-gray-300' : 'text-gray-500'}`}>
                          <button
                            type="button"
                            className={`absolute right-0 top-0 inline-flex h-5 w-5 items-center justify-center rounded text-xs font-semibold transition ${
                              darkMode ? 'text-blue-200 hover:bg-gray-700' : 'text-blue-700 hover:bg-blue-50'
                            }`}
                            title="切换出炉烟气显示单位"
                            aria-label="切换出炉烟气显示单位"
                            onClick={() => setFlueGasTotalUnit((unit) => (unit === 'mass' ? 'volume' : 'mass'))}
                          >
                            ⇆
                          </button>
                        </span>
                        <BatchTableNumericReadonly
                          darkMode={darkMode}
                          value={totalDisplayValue}
                          helpTitle={
                            flueGasTotalUnit === 'volume'
                              ? `${product.name} 标准体积`
                              : `${product.name} 总质量`
                          }
                          className="text-sm"
                        />
                        <span className={`text-[11px] leading-none ${darkMode ? 'text-gray-300' : 'text-gray-500'}`}>
                          {totalUnitLabel}
                        </span>
                      </div>
                    ) : (
                      <BatchTableNumericReadonly
                        darkMode={darkMode}
                        value={product.mass}
                        helpTitle={`${product.name} 总质量`}
                        className="inline text-sm"
                      />
                    )}
                  </td>
                  <td
                    className={resultCellClass(darkMode, pk, 'font-semibold')}
                  >
                    组分
                  </td>
                  {Array.from({ length: maxPhaseCols }, (_, i) => {
                    const phase = phases[i]
                    return (
                      <td
                        key={`${pk}-label-${i}`}
                        className={resultCellClass(darkMode, pk, 'font-medium')}
                      >
                        {phase ? phaseLabel(phase.key) : '—'}
                      </td>
                    )
                  })}
                </tr>
                <tr>
                  <td
                    className={resultCellClass(darkMode, pk, 'font-semibold')}
                  >
                    w%
                  </td>
                  {Array.from({ length: maxPhaseCols }, (_, i) => {
                    const phase = phases[i]
                    const displayPct = phase?.pct ?? 0
                    return (
                      <td
                        key={`${pk}-wpct-${i}`}
                        className={resultCellClass(darkMode, pk, `font-mono ${!phase ? resultMutedTextClass(darkMode) : ''}`)}
                      >
                        {phase ? (
                          <BatchTableNumericReadonly
                            darkMode={darkMode}
                            value={displayPct}
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
                {showGasVolumePct && (
                  <tr>
                    <td
                      className={resultCellClass(darkMode, pk, 'font-semibold')}
                    >
                      v%
                    </td>
                    {Array.from({ length: maxPhaseCols }, (_, i) => {
                      const phase = phases[i]
                      const displayPct =
                        phase && volumePercents
                          ? volumePercents[phase.key as keyof typeof volumePercents] ?? 0
                          : 0
                        return (
                        <td
                          key={`${pk}-vpct-${i}`}
                          className={resultCellClass(darkMode, pk, `font-mono ${!phase ? resultMutedTextClass(darkMode) : ''}`)}
                        >
                          {phase ? (
                            <BatchTableNumericReadonly
                              darkMode={darkMode}
                              value={displayPct}
                              helpTitle={`${phaseLabel(phase.key)} v% · w% ${formatBatchTableTooltip(phase.pct)} · 质量 ${formatBatchTableTooltip(phase.mass)} t/h`}
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
