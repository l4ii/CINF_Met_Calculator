import { Fragment, useEffect, useMemo, useRef, useState } from 'react'

import type { OxyConstraintSolverResult } from '../../../../utils/antimonyConstraintSolver.ts'
import {
  loadOxySideBlowConstraints,
  oxyProductDisplayName,
  OXY_SIDE_BLOW_PRODUCT_KEYS,
  type OxyProductDisplayStage,
  type OxySideBlowConstraintConfig,
  type OxySideBlowProductKey,
} from '../../../../utils/antimonyConstraintConfig.ts'
import {
  computeProductResultTableLayout,
} from '../../../../utils/antimonyBatchTableLayout.ts'
import {
  buildProductResultPivotData,
} from '../../../../utils/antimonyProductResultTable.ts'
import {
  buildElementTableDisplayKeys,
  decomposeElementTableRatios,
  elementTableDisplaySourceKeys,
  elementTableHeaderLabel,
  type AntimonyElementDisplayMode,
} from '../../../../utils/antimonyElementDisplay.ts'
import { normalizeMetcalPhaseFormula } from '../../../../utils/chemicalFormula.ts'
import { phaseStorageKeyToDisplayLabel } from '../../../../utils/antimonyPhaseTableCalc.ts'
import {
  calculateGasStandardVolumeNm3h,
  calculateGasVolumePercents,
} from '../../../../utils/antimonyProductPhaseCalc.ts'
import type { AntimonyElementKey } from '../../../../utils/antimonyWorkflowCalc.ts'
import { formatBatchTableDisplay, formatBatchTableTooltip } from '../../../../utils/batchTableNumeric.ts'
import { compareMetcalNumeric } from '../../../../utils/metcalFloResultExtract.ts'
import { PhaseFormulaDisplay } from '../../../PhaseFormulaDisplay.tsx'
import { BatchTableNumericReadonly } from '../../BatchTableNumericCell.tsx'
import { AntimonyBatchTableColGroup } from './AntimonyBatchTableColGroup'

function MetcalColoredNumber({
  darkMode,
  value,
  ours,
  helpTitle,
}: {
  darkMode: boolean
  value: number | null | undefined
  ours: number | null | undefined
  helpTitle: string
}) {
  if (value == null || !Number.isFinite(value)) {
    return <span className={darkMode ? 'text-gray-500' : 'text-gray-400'}>—</span>
  }
  const status = compareMetcalNumeric(ours, value)
  const colorClass =
    status === 'match'
      ? darkMode
        ? 'text-emerald-400'
        : 'text-emerald-600'
      : status === 'mismatch'
        ? darkMode
          ? 'text-rose-400'
          : 'text-rose-600'
        : darkMode
          ? 'text-gray-400'
          : 'text-gray-600'
  const title =
    status === 'match'
      ? `${helpTitle}（与本软件一致，相对偏差 ≤ 1%）`
      : status === 'mismatch'
        ? `${helpTitle}（与本软件偏差，相对偏差 > 1%）`
        : helpTitle
  return (
    <span className={`font-mono tabular-nums text-sm ${colorClass}`} title={title}>
      {formatBatchTableDisplay(value)}
    </span>
  )
}

function phaseLabel(key: string) {
  return phaseStorageKeyToDisplayLabel(key)
}

function PhaseFormulaCell({ formulaKey }: { formulaKey: string }) {
  return <PhaseFormulaDisplay formula={formulaKey} />
}

function isGasProductKey(key: string) {
  return key === 'flueGas' || key === 'fugitive'
}

function productRowToneClass(dark: boolean, productKey: OxySideBlowProductKey, neutral = false) {
  if (neutral) {
    return dark ? 'bg-gray-900 text-gray-100' : 'bg-white text-gray-900'
  }
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

function phaseCompareIdentity(key: string): string {
  return normalizeMetcalPhaseFormula(key) || key
}

function prioritizeProductPhases(
  productKey: OxySideBlowProductKey,
  phases: Array<{ key: string; pct: number; mass: number }>
) {
  const calciumSilicate = phaseCompareIdentity('CaO*SiO2')
  return [...phases].sort((a, b) => {
    const priority = (phase: { key: string; pct: number; mass: number }) => {
      const hasValue = phase.mass > 1e-10 || Math.abs(phase.pct) > 1e-10
      if (!hasValue) return 2
      if (productKey === 'flueGas' && phaseCompareIdentity(phase.key) === phaseCompareIdentity('H2O')) return 0
      if (productKey === 'smeltingSlag' && phaseCompareIdentity(phase.key) === calciumSilicate) return 0
      return 1
    }
    return priority(a) - priority(b)
  })
}

/** 按化学计量等价查找 MetCal 物相值（CaO*SiO2 ≡ CaSiO3） */
function metcalValueByPhaseIdentity(
  byKey: Record<string, number>,
  phaseKey: string
): number | undefined {
  if (Object.prototype.hasOwnProperty.call(byKey, phaseKey)) return byKey[phaseKey]
  const want = phaseCompareIdentity(phaseKey)
  for (const [key, value] of Object.entries(byKey)) {
    if (phaseCompareIdentity(key) === want) return value
  }
  return undefined
}

function hasMetcalPhaseIdentity(byKey: Record<string, number>, phaseKey: string): boolean {
  return metcalValueByPhaseIdentity(byKey, phaseKey) !== undefined
}

/** 对照时在本软件物相列后追加 MetCal 独有物相（如 Fe2SiO4），避免漏显 */
function mergePhasesForMetcalCompare(
  ours: Array<{ key: string; pct: number; mass: number }>,
  metcal: Array<{ key: string; pct: number; mass: number }>
) {
  const oursIds = new Set(ours.map((phase) => phaseCompareIdentity(phase.key)))
  const extras = metcal
    .filter(
      (phase) =>
        !oursIds.has(phaseCompareIdentity(phase.key)) &&
        (phase.mass > 1e-12 || Math.abs(phase.pct) > 1e-12)
    )
    .map((phase) => ({ key: phase.key, pct: 0, mass: 0 }))
  return [...ours, ...extras]
}

function resultHeadCellClass(dark: boolean) {
  return `px-2 py-1.5 text-center text-sm font-semibold ${dark ? 'text-gray-300' : 'text-gray-700'}`
}

function resultStickyHeadClass(dark: boolean) {
  return `sticky left-0 z-30 ${resultHeadCellClass(dark)} ${dark ? 'bg-gray-800' : 'bg-gray-50'}`
}

function resultCellClass(
  dark: boolean,
  productKey: OxySideBlowProductKey,
  extra = '',
  options?: { neutral?: boolean }
) {
  const line = dark ? 'border-gray-700/70' : 'border-gray-200'
  return `border-t ${line} px-1 py-1.5 text-center align-middle text-sm ${productRowToneClass(dark, productKey, options?.neutral)} ${extra}`
}

function resultStickyNameClass(
  dark: boolean,
  productKey: OxySideBlowProductKey,
  options?: { neutral?: boolean }
) {
  return `sticky left-0 z-10 ${resultCellClass(dark, productKey, 'px-2 font-semibold', options)}`
}

function resultMutedTextClass(dark: boolean) {
  return dark ? 'text-gray-500' : 'text-gray-500'
}

export function AntimonyProductionResultTable({
  darkMode,
  result,
  empty = false,
  mode = 'both',
  phaseTitle = '产物物相组成',
  elementTitle = '产出元素组成',
  elementDisplayMode = 'compound',
  config,
  metcalResult = null,
  showMetcalComparison = false,
  widthMode = 'fit',
  productDisplayStage = 'smelting',
  defaultFlueGasTotalUnit,
}: {
  darkMode: boolean
  result?: OxyConstraintSolverResult | null
  empty?: boolean
  mode?: 'both' | 'phase' | 'element'
  phaseTitle?: string
  elementTitle?: string
  elementDisplayMode?: AntimonyElementDisplayMode
  config?: OxySideBlowConstraintConfig
  metcalResult?: OxyConstraintSolverResult | null
  showMetcalComparison?: boolean
  /** fit：配料总表按视口；content：导入预览按内容宽可横滚 */
  widthMode?: 'fit' | 'content'
  /** 吹炼步骤用吹炼产物显示名 */
  productDisplayStage?: OxyProductDisplayStage
  /** 烟气总量默认单位；产出计算默认 Nm³/h，可切换 t/h */
  defaultFlueGasTotalUnit?: 'mass' | 'volume'
}) {
  const border = darkMode ? 'border-gray-600' : 'border-gray-200'
  const head = darkMode ? 'bg-gray-800 text-gray-300' : 'bg-gray-50 text-gray-600'
  const resolvedConfig = useMemo(() => config ?? loadOxySideBlowConstraints(), [config])
  const showMetcal = Boolean(showMetcalComparison && metcalResult)
  const showEmpty = empty || (!result && !showMetcal)
  const displayResult = result ?? (showMetcal ? metcalResult : null)
  const showMetcalRows = Boolean(showMetcal && result && metcalResult)
  const productName = (pk: OxySideBlowProductKey) =>
    oxyProductDisplayName(pk, productDisplayStage)
  const pivotRows = showEmpty || !displayResult ? [] : buildProductResultPivotData(displayResult, resolvedConfig)
  const elementRows = pivotRows.filter((row) => row.kind === 'element')
  const elementSourceKeys = elementRows.map((row) => row.label as AntimonyElementKey)
  const displayElementKeys = buildElementTableDisplayKeys(elementSourceKeys, elementDisplayMode)
  const elementColumnCount = Math.max(displayElementKeys.length, 1)
  const elementRowByLabel = new Map(elementRows.map((row) => [row.label, row]))
  const productElementDisplayRatios = (productKey: OxySideBlowProductKey) => {
    const ratios: Partial<Record<AntimonyElementKey, number>> = {}
    for (const row of elementRows) {
      const value = row.values[productKey]
      if (value == null || !Number.isFinite(value)) continue
      ratios[row.label as AntimonyElementKey] = value
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
    : OXY_SIDE_BLOW_PRODUCT_KEYS.map((pk) => productName(pk))
  const phaseTotalMassTh = showEmpty || !displayResult
    ? 0
    : (displayResult.totalProductMass ??
      OXY_SIDE_BLOW_PRODUCT_KEYS.reduce((sum, pk) => sum + displayResult.products[pk].mass, 0))
  const metcalPhaseTotalMassTh =
    showMetcalRows && metcalResult
      ? (metcalResult.totalProductMass ??
        OXY_SIDE_BLOW_PRODUCT_KEYS.reduce((sum, pk) => sum + metcalResult.products[pk].mass, 0))
      : null
  const phaseMassLabelSamples = showEmpty
    ? labelSamples
    : [
        ...labelSamples,
        ...OXY_SIDE_BLOW_PRODUCT_KEYS.map((pk) => displayResult!.products[pk].mass.toFixed(2)),
        phaseTotalMassTh.toFixed(2),
        '总计',
        ...(displayResult?.products.flueGas?.phases
          ? [calculateGasStandardVolumeNm3h(displayResult.products.flueGas.phases).toFixed(2), 'Nm³/h']
          : []),
      ]
  const { widths: colWidths, tableWidth: resolvedTableWidth } = computeProductResultTableLayout({
    labelSamples,
    productHeaders:
      displayElementKeys.length > 0
        ? displayElementKeys.map((key) => elementTableHeaderLabel(key, elementDisplayMode))
        : ['元素'],
    productSamples:
      displayElementKeys.length > 0
        ? displayElementKeys.map((key) => [elementTableHeaderLabel(key, elementDisplayMode)])
        : [['元素']],
    containerWidth: widthMode === 'content' ? 0 : viewportWidth,
    widthMode,
  })

  const colCount = 2 + elementColumnCount
  const warnPanel = darkMode ? 'bg-amber-950/40 text-amber-200 border-amber-800' : 'bg-amber-50 text-amber-900 border-amber-200'

  const totalElementSourceRatios = (() => {
    if (showEmpty || !displayResult || phaseTotalMassTh <= 0) {
      return {} as Partial<Record<AntimonyElementKey, number>>
    }
    const ratios: Partial<Record<AntimonyElementKey, number>> = {}
    for (const row of elementRows) {
      let elementMass = 0
      let hasValue = false
      for (const pk of OXY_SIDE_BLOW_PRODUCT_KEYS) {
        const pct = row.values[pk]
        if (pct == null || !Number.isFinite(pct)) continue
        hasValue = true
        elementMass += (displayResult.products[pk].mass * pct) / 100
      }
      if (!hasValue) continue
      ratios[row.label as AntimonyElementKey] = (elementMass / phaseTotalMassTh) * 100
    }
    return ratios
  })()
  const totalElementDisplayRatios = decomposeElementTableRatios(
    totalElementSourceRatios,
    elementDisplayMode
  )

  const renderProductElementTable = () => (
    <div ref={containerRef} className={`overflow-auto rounded-lg border ${border}`}>
      <table className="table-fixed w-full border-collapse text-sm" style={{ width: resolvedTableWidth }}>
        <AntimonyBatchTableColGroup widths={colWidths} />
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
              ? { name: productName(pk), mass: 0 }
              : { ...displayResult!.products[pk], name: productName(pk) }
            return (
              <tr key={`product-element-${pk}`}>
                <td className={resultStickyNameClass(darkMode, pk)}>{product.name}</td>
                <td className={resultCellClass(darkMode, pk, 'font-mono')}>
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
                  const applicable =
                    elementDisplayMode === 'compound'
                      ? sourceRow?.values[pk] != null
                      : sourceRows.some((row) => row.values[pk] != null)
                  const displayRatios = productElementDisplayRatios(pk)
                  const value = element
                    ? applicable
                      ? elementDisplayMode === 'compound'
                        ? (sourceRow?.values[pk] ?? null)
                        : (displayRatios[element] ?? 0)
                      : null
                    : null
                  return (
                    <td
                      key={`${pk}-element-value-${index}`}
                      className={resultCellClass(
                        darkMode,
                        pk,
                        `font-mono ${!element || value == null ? resultMutedTextClass(darkMode) : ''}`
                      )}
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
          <tr>
            <td className={resultStickyNameClass(darkMode, 'matte', { neutral: true })}>总计</td>
            <td className={resultCellClass(darkMode, 'matte', 'font-mono', { neutral: true })}>
              {showEmpty ? (
                '—'
              ) : (
                <BatchTableNumericReadonly
                  darkMode={darkMode}
                  value={phaseTotalMassTh}
                  helpTitle="产物总质量（各产物 t/h 合计）"
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
              const applicable =
                elementDisplayMode === 'compound'
                  ? sourceRow != null &&
                    OXY_SIDE_BLOW_PRODUCT_KEYS.some((pk) => sourceRow.values[pk] != null)
                  : sourceRows.some((row) =>
                      OXY_SIDE_BLOW_PRODUCT_KEYS.some((pk) => row.values[pk] != null)
                    )
              const value = element
                ? applicable
                  ? elementDisplayMode === 'compound'
                    ? (totalElementDisplayRatios[element] ?? null)
                    : (totalElementDisplayRatios[element] ?? 0)
                  : null
                : null
              return (
                <td
                  key={`product-element-total-${index}`}
                  className={resultCellClass(
                    darkMode,
                    'matte',
                    `font-mono ${!element || value == null ? resultMutedTextClass(darkMode) : ''}`,
                    { neutral: true }
                  )}
                >
                  {showEmpty || !element || value == null ? (
                    '—'
                  ) : (
                    <BatchTableNumericReadonly
                      darkMode={darkMode}
                      value={value}
                      helpTitle={`总计 · ${elementTableHeaderLabel(element, elementDisplayMode)} w%（质量加权）`}
                      className="inline text-sm"
                    />
                  )}
                </td>
              )
            })}
          </tr>
        </tbody>
      </table>
    </div>
  )

  const phaseContainerRef = useRef<HTMLDivElement>(null)
  const [phaseViewportWidth, setPhaseViewportWidth] = useState(0)
  const resolvedDefaultFlueGasUnit = defaultFlueGasTotalUnit ?? 'volume'
  const [flueGasTotalUnit, setFlueGasTotalUnit] = useState<'mass' | 'volume'>(resolvedDefaultFlueGasUnit)

  useEffect(() => {
    setFlueGasTotalUnit(resolvedDefaultFlueGasUnit)
  }, [resolvedDefaultFlueGasUnit])

  useEffect(() => {
    const el = phaseContainerRef.current
    if (!el) return
    const update = () => setPhaseViewportWidth(el.clientWidth)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [mode, showMetcalRows, displayResult])

  /** 各产物物相列（对照 MetCal 时含独有物相），列数取最大值统一对齐 */
  const phaseProducts = OXY_SIDE_BLOW_PRODUCT_KEYS.map((pk) => {
    const product = showEmpty
      ? { name: productName(pk), mass: 0, phases: [] as Array<{ key: string; pct: number; mass: number }> }
      : { ...displayResult!.products[pk], name: productName(pk) }
    const metcalProduct =
      showMetcalRows && result?.products[pk] ? (metcalResult?.products[pk] ?? null) : null
    const showMetcalBlock = Boolean(showMetcalRows && metcalProduct)
    const phases = prioritizeProductPhases(
      pk,
      showMetcalBlock && metcalProduct
        ? mergePhasesForMetcalCompare(product.phases, metcalProduct.phases)
        : product.phases
    )
    return { pk, product, metcalProduct, phases }
  })

  const maxPhaseCols = Math.max(1, ...phaseProducts.map(({ phases }) => phases.length))

  const phaseColLayout = computeProductResultTableLayout({
    labelSamples: ['名称', ...labelSamples],
    productHeaders: ['', ...Array.from({ length: maxPhaseCols }, (_, i) => `物相${i + 1}`)],
    productSamples: [
      ['组分', 'w%', 'v%'],
      ...Array.from({ length: maxPhaseCols }, (_, colIndex) =>
        phaseProducts.flatMap(({ phases }) => {
          const phase = phases[colIndex]
          return phase ? [phaseLabel(phase.key)] : []
        })
      ),
    ],
    // fit：按视口撑满；列数由物相最多的产物锁定
    containerWidth: widthMode === 'content' ? 0 : phaseViewportWidth,
    totalSamples: phaseMassLabelSamples,
    widthMode,
  })

  const renderPhaseProductBlock = (
    pk: OxySideBlowProductKey,
    product: { name: string; mass: number; phases: Array<{ key: string; pct: number; mass: number }> },
    metcalProduct: { name: string; mass: number; phases: Array<{ key: string; pct: number; mass: number }> } | null,
    phases: Array<{ key: string; pct: number; mass: number }>
  ) => {
    const showMetcalBlock = Boolean(showMetcalRows && metcalProduct)
    const showGasVolumePct = isGasProductKey(pk)
    const volumePercents =
      showGasVolumePct && phases.length > 0
        ? calculateGasVolumePercents(
            Object.fromEntries(
              phases.filter((phase) => phase.mass > 0 || phase.pct > 0).map((phase) => [phase.key, phase.pct])
            )
          )
        : null
    const metcalPctByKey = metcalProduct
      ? Object.fromEntries(metcalProduct.phases.map((p) => [p.key, p.pct]))
      : {}
    const metcalMassByKey = metcalProduct
      ? Object.fromEntries(metcalProduct.phases.map((p) => [p.key, p.mass]))
      : {}
    const metcalVolByKey =
      showMetcalBlock && showGasVolumePct && metcalProduct && metcalProduct.phases.length > 0
        ? calculateGasVolumePercents(
            Object.fromEntries(metcalProduct.phases.map((phase) => [phase.key, phase.pct]))
          )
        : null
    const oursVolByKey =
      showGasVolumePct && product.phases.length > 0
        ? calculateGasVolumePercents(
            Object.fromEntries(product.phases.map((phase) => [phase.key, phase.pct]))
          )
        : null
    const baseRows = showGasVolumePct ? 3 : 2
    const rowSpan = showMetcalBlock ? baseRows + (showGasVolumePct ? 2 : 1) : baseRows
    const canToggleFlueGasVolume = pk === 'flueGas' && !showEmpty
    const flueGasVolumeNm3h = canToggleFlueGasVolume
      ? calculateGasStandardVolumeNm3h(product.phases)
      : 0
    const totalDisplayValue =
      canToggleFlueGasVolume && flueGasTotalUnit === 'volume' ? flueGasVolumeNm3h : product.mass
    const totalUnitLabel =
      canToggleFlueGasVolume && flueGasTotalUnit === 'volume' ? 'Nm³/h' : 't/h'
    const metcalTotalDisplay =
      metcalProduct && pk === 'flueGas' && flueGasTotalUnit === 'volume'
        ? calculateGasStandardVolumeNm3h(metcalProduct.phases)
        : (metcalProduct?.mass ?? null)
    const oursTotalCompare =
      pk === 'flueGas' && flueGasTotalUnit === 'volume'
        ? calculateGasStandardVolumeNm3h(product.phases)
        : product.mass
    const cell = (extra = '') => resultCellClass(darkMode, pk, extra)
    const nameCell = resultStickyNameClass(darkMode, pk)

    const renderMetcalPctCells = (kind: 'w%' | 'v%') =>
      Array.from({ length: maxPhaseCols }, (_, i) => {
        const phase = phases[i]
        const metcalPct =
          kind === 'w%'
            ? phase && hasMetcalPhaseIdentity(metcalPctByKey, phase.key)
              ? (metcalValueByPhaseIdentity(metcalPctByKey, phase.key) ?? 0)
              : null
            : phase && metcalVolByKey && hasMetcalPhaseIdentity(metcalVolByKey, phase.key)
              ? (metcalValueByPhaseIdentity(metcalVolByKey, phase.key) ?? 0)
              : null
        const oursPct =
          kind === 'w%'
            ? (phase?.pct ?? null)
            : phase && oursVolByKey
              ? (oursVolByKey[phase.key] ?? null)
              : null
        return (
          <td
            key={`${pk}-metcal-${kind}-${i}`}
            className={resultCellClass(
              darkMode,
              pk,
              `font-mono ${metcalPct == null ? resultMutedTextClass(darkMode) : ''}`,
              { neutral: true }
            )}
          >
            {!phase || metcalPct == null ? (
              '—'
            ) : (
              <MetcalColoredNumber
                darkMode={darkMode}
                value={metcalPct}
                ours={oursPct}
                helpTitle={
                  kind === 'w%'
                    ? `${phaseLabel(phase.key)} MetCal w% · 质量 ${formatBatchTableTooltip(metcalValueByPhaseIdentity(metcalMassByKey, phase.key) ?? 0)} t/h`
                    : `${phaseLabel(phase.key)} MetCal v%`
                }
              />
            )}
          </td>
        )
      })

    return (
      <Fragment key={`phase-${pk}`}>
        <tr>
          <td rowSpan={rowSpan} className={nameCell}>
            {product.name}
          </td>
          <td rowSpan={rowSpan} className={`${cell('font-mono')} relative`}>
            {showEmpty ? (
              '—'
            ) : (
              <>
                {canToggleFlueGasVolume ? (
                  <button
                    type="button"
                    className={`absolute right-0.5 top-0.5 z-10 inline-flex h-5 w-5 items-center justify-center rounded text-xs font-semibold transition ${
                      darkMode ? 'text-blue-200 hover:bg-gray-700' : 'text-blue-700 hover:bg-blue-50'
                    }`}
                    title={
                      flueGasTotalUnit === 'volume'
                        ? '切换为质量 t/h（底部总计始终为各产物质量合计 t/h，含烟气质量）'
                        : '切换为标准体积 Nm³/h（底部总计仍为质量 t/h，含烟气质量）'
                    }
                    aria-label="切换出炉烟气显示单位"
                    onClick={() => setFlueGasTotalUnit((unit) => (unit === 'mass' ? 'volume' : 'mass'))}
                  >
                    ⇆
                  </button>
                ) : null}
                <div className="flex flex-col items-center justify-center gap-0.5 py-0.5">
                  {canToggleFlueGasVolume ? (
                    <>
                      <BatchTableNumericReadonly
                        darkMode={darkMode}
                        value={totalDisplayValue}
                        helpTitle={
                          flueGasTotalUnit === 'volume'
                            ? `${product.name} 标准体积（Nm³/h）；表底「总计」仍为质量 t/h（含本股烟气质量）`
                            : `${product.name} 总质量（t/h）`
                        }
                        className="text-sm"
                      />
                      {showMetcalBlock ? (
                        <MetcalColoredNumber
                          darkMode={darkMode}
                          value={metcalTotalDisplay}
                          ours={oursTotalCompare}
                          helpTitle={
                            flueGasTotalUnit === 'volume'
                              ? `${product.name} MetCal 标准体积`
                              : `${product.name} MetCal 总质量`
                          }
                        />
                      ) : null}
                      <span className={`text-[11px] leading-none ${darkMode ? 'text-gray-300' : 'text-gray-500'}`}>
                        {totalUnitLabel}
                      </span>
                    </>
                  ) : (
                    <>
                      <BatchTableNumericReadonly
                        darkMode={darkMode}
                        value={product.mass}
                        helpTitle={`${product.name} 总质量`}
                        className="inline text-sm"
                      />
                      {showMetcalBlock ? (
                        <MetcalColoredNumber
                          darkMode={darkMode}
                          value={metcalProduct!.mass}
                          ours={product.mass}
                          helpTitle={`${product.name} MetCal 总质量`}
                        />
                      ) : null}
                    </>
                  )}
                </div>
              </>
            )}
          </td>
          <td className={cell('font-semibold')}>组分</td>
          {Array.from({ length: maxPhaseCols }, (_, i) => {
            const phase = phases[i]
            return (
              <td key={`${pk}-label-${i}`} className={cell('font-medium')}>
                {phase ? <PhaseFormulaCell formulaKey={phase.key} /> : '—'}
              </td>
            )
          })}
        </tr>
        <tr>
          <td className={cell('font-semibold')}>w%</td>
          {Array.from({ length: maxPhaseCols }, (_, i) => {
            const phase = phases[i]
            const isMetcalOnly = phase ? !product.phases.some((item) => item.key === phase.key) : false
            const displayPct = phase?.pct ?? 0
            return (
              <td
                key={`${pk}-wpct-${i}`}
                className={cell(`font-mono ${!phase || isMetcalOnly ? resultMutedTextClass(darkMode) : ''}`)}
              >
                {!phase || isMetcalOnly ? (
                  '—'
                ) : (
                  <BatchTableNumericReadonly
                    darkMode={darkMode}
                    value={displayPct}
                    helpTitle={`${phaseLabel(phase.key)} w% · 质量 ${formatBatchTableTooltip(phase.mass)} t/h`}
                    className="inline text-sm"
                  />
                )}
              </td>
            )
          })}
        </tr>
        {showMetcalBlock ? (
          <tr>
            <td className={resultCellClass(darkMode, pk, '', { neutral: true })} aria-hidden />
            {renderMetcalPctCells('w%')}
          </tr>
        ) : null}
        {showGasVolumePct ? (
          <tr>
            <td className={cell('font-semibold')}>v%</td>
            {Array.from({ length: maxPhaseCols }, (_, i) => {
              const phase = phases[i]
              const isMetcalOnly = phase ? !product.phases.some((item) => item.key === phase.key) : false
              const displayPct =
                phase && volumePercents ? (volumePercents[phase.key as keyof typeof volumePercents] ?? 0) : 0
              return (
                <td
                  key={`${pk}-vpct-${i}`}
                  className={cell(`font-mono ${!phase || isMetcalOnly ? resultMutedTextClass(darkMode) : ''}`)}
                >
                  {!phase || isMetcalOnly ? (
                    '—'
                  ) : (
                    <BatchTableNumericReadonly
                      darkMode={darkMode}
                      value={displayPct}
                      helpTitle={`${phaseLabel(phase.key)} v% · w% ${formatBatchTableTooltip(phase.pct)} · 质量 ${formatBatchTableTooltip(phase.mass)} t/h`}
                      className="inline text-sm"
                    />
                  )}
                </td>
              )
            })}
          </tr>
        ) : null}
        {showMetcalBlock && showGasVolumePct ? (
          <tr>
            <td className={resultCellClass(darkMode, pk, '', { neutral: true })} aria-hidden />
            {renderMetcalPctCells('v%')}
          </tr>
        ) : null}
      </Fragment>
    )
  }

  const renderPhaseTables = () => (
    <div ref={phaseContainerRef} className={`overflow-auto rounded-lg border ${border}`}>
      <table
        className="table-fixed w-full border-collapse text-sm"
        style={{ width: phaseColLayout.tableWidth }}
      >
        <AntimonyBatchTableColGroup widths={phaseColLayout.widths} />
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
            <th className={resultHeadCellClass(darkMode)}>t/h</th>
            <th className={resultHeadCellClass(darkMode)} aria-label="口径" />
            <th colSpan={maxPhaseCols} className={resultHeadCellClass(darkMode)}>
              物相百分比
            </th>
          </tr>
        </thead>
        <tbody>
          {phaseProducts.map(({ pk, product, metcalProduct, phases }) =>
            renderPhaseProductBlock(pk, product, metcalProduct, phases)
          )}
          <tr>
            <td className={resultStickyNameClass(darkMode, 'matte', { neutral: true })}>总计</td>
            <td className={resultCellClass(darkMode, 'matte', 'font-mono', { neutral: true })}>
              {showEmpty ? (
                '—'
              ) : (
                <div className="flex flex-col items-center justify-center gap-0.5 py-0.5">
                  <BatchTableNumericReadonly
                    darkMode={darkMode}
                    value={phaseTotalMassTh}
                    helpTitle="产物总质量合计（t/h，含出炉烟气质量；与烟气行显示 Nm³/h 或 t/h 无关）"
                    className="text-sm"
                  />
                  {showMetcalRows && metcalPhaseTotalMassTh != null ? (
                    <MetcalColoredNumber
                      darkMode={darkMode}
                      value={metcalPhaseTotalMassTh}
                      ours={phaseTotalMassTh}
                      helpTitle="产物总质量 MetCal"
                    />
                  ) : null}
                  <span className={`text-[11px] leading-none ${darkMode ? 'text-gray-300' : 'text-gray-500'}`}>
                    t/h
                  </span>
                </div>
              )}
            </td>
            <td className={resultCellClass(darkMode, 'matte', '', { neutral: true })} aria-hidden />
            {Array.from({ length: maxPhaseCols }, (_, i) => (
              <td
                key={`phase-total-blank-${i}`}
                className={resultCellClass(darkMode, 'matte', resultMutedTextClass(darkMode), { neutral: true })}
              >
                —
              </td>
            ))}
          </tr>
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
