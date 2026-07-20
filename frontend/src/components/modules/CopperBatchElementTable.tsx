/**
 * 配料总表 · 元素总表（转置：元素为列，物料为行）
 */
import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import type {
  CopperElementKey,
  CopperLibraryMaterial,
  CopperMaterialColumn,
  CopperRatios,
} from '../../utils/copperWorkflowCalc'

export type DraftRatioKind = 'raw' | 'solvent' | 'fuel' | 'gas'
export type MoistureKind = 'raw' | 'solvent' | 'fuel'
export type SulfurInputStatus = 'ok' | 'missing' | 'not_required'
import {
  BATCH_TABLE_PCT_COL_WIDTH,
  BATCH_TABLE_SPARSE_COL_WIDTH,
  batchElementColumnWidthMeta,
  batchElementTableColWidths,
} from '../../utils/copperBatchTableLayout'
import {
  BatchTableNumericCell,
  BatchTableNumericMassCell,
  BatchTableNumericReadonly,
} from './BatchTableNumericCell'
import { batchTableSampleText, formatBatchTableTooltip } from '../../utils/batchTableNumeric'
import { calculateGasMixtureStandardVolumeNm3h, calculateGasVolumePercents } from '../../utils/copperProductPhaseCalc'
import {
  calculateKnownTotal,
  materialWaterWeight,
  waterElementRatios,
} from '../../utils/copperWorkflowCalc'
import { CopperBatchTableColGroup } from './CopperBatchTableColGroup'
import { CopperMaterialSelect } from './CopperMaterialSelect'
import {
  buildElementTableDisplayKeys,
  calculateElementTableDisplayTotal,
  decomposeElementTableRatios,
  elementTableDisplayEditTarget,
  elementTableDisplayValueToStorageValue,
  elementTableHeaderLabel,
  type CopperElementDisplayMode,
} from '../../utils/copperElementDisplay'

export type ElementTableTone = 'raw' | 'concentrate' | 'solvent' | 'fuel' | 'oxygen' | 'total' | 'product'
export type SolveInputStatus = 'none' | 'pending' | 'attention' | 'resolved'

const STICKY_CATEGORY = 'left-0 min-w-[56px]'
const STICKY_NAME_LEFT = 'left-[56px]'

function nameColStyle(width: number): CSSProperties {
  return { width, minWidth: width }
}

function elementTableToneClass(dark: boolean, tone: ElementTableTone) {
  if (tone === 'concentrate') return dark ? 'border-amber-700 bg-amber-950/35 text-amber-50' : 'border-amber-200 bg-amber-100/80 text-amber-950'
  if (tone === 'solvent') return dark ? 'border-gray-600 bg-emerald-950/20' : 'border-gray-200 bg-emerald-50/70'
  if (tone === 'fuel') return dark ? 'border-gray-600 bg-amber-950/20' : 'border-gray-200 bg-amber-50/70'
  if (tone === 'oxygen') return dark ? 'border-gray-600 bg-sky-950/20 text-sky-50' : 'border-gray-200 bg-sky-50 text-sky-950'
  if (tone === 'total') return dark ? 'border-gray-600 bg-blue-950/30' : 'border-gray-200 bg-blue-50'
  if (tone === 'product') return dark ? 'border-gray-600 bg-indigo-950/20 text-indigo-100' : 'border-gray-200 bg-indigo-50 text-indigo-900'
  return dark ? 'border-gray-600 bg-gray-800/40' : 'border-gray-200 bg-white'
}

function stickyCellClass(dark: boolean, tone: ElementTableTone, side: 'category' | 'name') {
  const left = side === 'category' ? STICKY_CATEGORY : STICKY_NAME_LEFT
  const align = side === 'category' ? 'text-center font-semibold' : 'text-center'
  return `sticky ${left} z-20 h-9 border-t px-2 py-0 align-middle text-sm ${align} ${elementTableToneClass(dark, tone)}`
}

function categoryRowSpanCellClass(dark: boolean, tone: ElementTableTone) {
  return `sticky ${STICKY_CATEGORY} z-20 border-t px-2 py-1.5 align-middle text-center text-sm font-semibold ${elementTableToneClass(dark, tone)}`
}

function elementDataCellClass(dark: boolean, tone: ElementTableTone) {
  return `border-t px-0.5 py-1.5 align-middle text-center text-sm ${elementTableToneClass(dark, tone)}`
}

function dataCellClass(dark: boolean, tone: ElementTableTone) {
  return `h-9 border-t px-1 py-0 align-middle text-center text-sm ${elementTableToneClass(dark, tone)}`
}

function gasMassInputClass(dark: boolean, status: SolveInputStatus) {
  const statusColor =
    status === 'resolved'
      ? dark
        ? '!text-sky-50'
        : '!text-sky-950'
      : dark
        ? '!text-sky-100'
        : '!text-sky-950'
  return `!h-6 !rounded-none !border-0 !bg-transparent !px-0.5 !shadow-none !ring-0 ${statusColor} focus:!border-0 focus:!ring-0`
}

function elementTableColumnCount(elementCount: number) {
  return elementCount + 4
}

const WATER_H_KEY = 'H(氢)' as const
const WATER_O_KEY = 'O(氧)' as const
const GAS_ATTENTION_ELEMENT_KEYS = new Set<CopperElementKey>(['H(氢)', 'O(氧)', 'C (碳)', 'N(氮)'])
const WATER_ELEMENT_RATIOS = waterElementRatios()

function gasPhaseWeightPct(ratios: CopperRatios, waterWeightPct = 0) {
  const dryShare = Math.max(0, 100 - Math.max(0, waterWeightPct))
  return {
    O2: (dryShare * Math.max(0, ratios['O(氧)'] ?? 0)) / 100,
    N2: (dryShare * Math.max(0, ratios['N(氮)'] ?? 0)) / 100,
    H2O: Math.max(0, waterWeightPct),
  }
}

function categoryCellWithDelete(label: string, onDelete?: () => void, dark = false) {
  return (
    <div className="relative h-full min-h-[4.75rem] w-full">
      <span className="flex min-h-[2.5rem] items-center justify-center px-1">{label}</span>
      {onDelete ? (
        <button
          type="button"
          className={`absolute bottom-0 right-0 flex h-5 w-5 items-center justify-center text-sm leading-none ${
            dark ? 'text-red-300 hover:bg-red-950/50' : 'text-red-600 hover:bg-red-50'
          }`}
          title="删除"
          onClick={onDelete}
        >
          ×
        </button>
      ) : null}
    </div>
  )
}

export type ProductPhaseColumn = {
  key: string
  label: string
  pct: number
  mass: number
}

export type ProductTableColumn = {
  key: string
  name: string
  mass: number
  composition: Record<string, number>
  displayMode?: 'phases' | 'elements'
  phases?: ProductPhaseColumn[]
}

type ProductOutputBlock =
  | { kind: 'phaseGrid'; product: ProductTableColumn; rowSpan: number }
  | { kind: 'elements'; product: ProductTableColumn }

function countProductOutputRows(products: ProductTableColumn[]) {
  return products.reduce((sum, product) => {
    if (product.displayMode === 'phases' && product.phases && product.phases.length > 0) {
      return sum + 2
    }
    return sum + 1
  }, 0)
}

function buildProductOutputBlocks(products: ProductTableColumn[]): ProductOutputBlock[] {
  const blocks: ProductOutputBlock[] = []
  for (const product of products) {
    if (product.displayMode === 'phases' && product.phases && product.phases.length > 0) {
      blocks.push({
        kind: 'phaseGrid',
        product,
        rowSpan: 2,
      })
    } else {
      blocks.push({ kind: 'elements', product })
    }
  }
  return blocks
}

function renderHorizontalPhaseCells(
  darkMode: boolean,
  product: ProductTableColumn,
  rowKind: 'label' | 'pct',
  productOutputCellClass: (
    dark: boolean,
    status: SolveInputStatus,
    side: 'single' | 'left' | 'right',
    boundary: 'top' | 'middle' | 'bottom'
  ) => string
) {
  const phases = product.phases ?? []
  const phaseCell = productOutputCellClass(darkMode, 'resolved', 'single', 'middle')
  const volumePercents =
    (product.key === 'flueGas' || product.key === 'fugitive') && rowKind === 'pct' && phases.length > 0
      ? calculateGasVolumePercents(Object.fromEntries(phases.map((phase) => [phase.key, phase.pct])))
      : null

  return (
    <table className="w-full min-w-full border-collapse text-sm">
      <tbody>
        <tr>
          {phases.map((phase) => {
            if (rowKind === 'label') {
              return (
                <td key={`${product.key}-label-${phase.key}`} className={`${phaseCell} whitespace-nowrap px-1 font-medium`}>
                  {phase.label}
                </td>
              )
            }
            if (rowKind === 'pct') {
              const displayPct = volumePercents?.[phase.key as keyof typeof volumePercents] ?? phase.pct
              const pctKind = product.key === 'flueGas' || product.key === 'fugitive' ? 'v%' : 'w%'
              const helpTitle = `${phase.label} ${pctKind} · 质量 ${formatBatchTableTooltip(phase.mass)} t/h`
              return (
                <td key={`${product.key}-pct-${phase.key}`} className={`${phaseCell} whitespace-nowrap px-1`}>
                  <BatchTableNumericReadonly
                    darkMode={darkMode}
                    value={displayPct}
                    helpTitle={helpTitle}
                    className="text-sm"
                  />
                </td>
              )
            }
            return null
          })}
        </tr>
      </tbody>
    </table>
  )
}

export function CopperBatchElementTable({
  darkMode,
  tableWidth: _tableWidth,
  nameColWidth,
  elementKeys,
  elementDisplayMode = 'compound',
  feedTotalWeight,
  rawConcentrateWeight,
  rawConcentrateRatios,
  rawConcentrateWaterWeight,
  rawMaterials,
  solventColumns,
  fuelColumn,
  airColumns,
  furnaceFeedRatios,
  furnaceBlendWaterWeight,
  productTableColumns,
  productTotalMass: _productTotalMass,
  productCalculated: _productCalculated,
  materialLibrary,
  formatTableNumber,
  solveInputClass,
  materialSelectClass,
  productOutputCellClass,
  ratioInputValue,
  rawWeightDrafts,
  waterWeightDrafts,
  ratioDrafts,
  phaseCellStatus,
  sulfurInputStatus,
  rawWeightStatus,
  solventWeightStatus,
  fuelWeightStatus,
  waterWeightStatus,
  oxygenAirInputStatus,
  phaseUnknownElements,
  phaseCompleted,
  rawTotalOverLimit,
  onRawWeightChange,
  onApplyLibraryMaterial,
  onRemoveMaterial,
  onRemoveSolvent,
  onSolventNameChange,
  onRawRatioChange,
  onRawRatioBlur,
  onSolventWeightChange,
  onSolventWeightBlur,
  onFuelWeightChange,
  onFuelWeightBlur,
  onSolventRatioChange,
  onSolventRatioBlur,
  onFuelRatioChange,
  onFuelRatioBlur,
  onGasRatioChange,
  onGasRatioBlur,
  onMaterialWaterWeightChange,
  onMaterialWaterWeightBlur,
  onFuelWaterWeightChange,
  onFuelWaterWeightBlur,
  showProductRows = false,
  onOpenElementAssist,
  onGasWeightChange,
  onGasWeightBlur,
}: {
  darkMode: boolean
  tableWidth: number
  nameColWidth: number
  elementKeys: CopperElementKey[]
  elementDisplayMode?: CopperElementDisplayMode
  feedTotalWeight: number
  rawConcentrateWeight: number
  rawConcentrateRatios: Record<CopperElementKey, number>
  rawConcentrateWaterWeight: number
  rawMaterials: CopperMaterialColumn[]
  solventColumns: CopperMaterialColumn[]
  fuelColumn: CopperMaterialColumn
  airColumns: CopperMaterialColumn[]
  furnaceFeedRatios: Record<string, number>
  furnaceBlendWaterWeight: number
  productTableColumns: ProductTableColumn[]
  productTotalMass: number
  productCalculated: boolean
  materialLibrary: CopperLibraryMaterial[]
  formatTableNumber: (v: number) => string
  solveInputClass: (dark: boolean, status: SolveInputStatus) => string
  materialSelectClass: (dark: boolean, status: SolveInputStatus) => string
  productOutputCellClass: (
    dark: boolean,
    status: SolveInputStatus,
    side: 'single' | 'left' | 'right',
    boundary: 'top' | 'middle' | 'bottom'
  ) => string
  ratioInputValue: (kind: DraftRatioKind, id: string, element: CopperElementKey, fallback: number) => string | number
  rawWeightDrafts: Record<string, string>
  waterWeightDrafts: Record<string, string>
  ratioDrafts: Record<string, string>
  phaseCellStatus: (material: CopperMaterialColumn, element: CopperElementKey) => SolveInputStatus
  sulfurInputStatus: (ratios: CopperRatios) => SulfurInputStatus
  rawWeightStatus: (id: string) => SolveInputStatus
  solventWeightStatus: (id: string) => SolveInputStatus
  fuelWeightStatus: () => SolveInputStatus
  waterWeightStatus: (kind: MoistureKind, id: string, waterWeight: number | undefined) => SolveInputStatus
  oxygenAirInputStatus: SolveInputStatus
  phaseUnknownElements: Set<CopperElementKey>
  phaseCompleted: boolean
  rawTotalOverLimit?: (id: string) => boolean
  onRawWeightChange: (id: string, value: string) => void
  onApplyLibraryMaterial: (id: string, libraryId: string) => void
  onRemoveMaterial: (id: string) => void
  onRemoveSolvent: (id: string) => void
  onSolventNameChange: (id: string, name: string) => void
  onRawRatioChange: (id: string, element: CopperElementKey, value: string) => void
  onRawRatioBlur: (id: string, element: CopperElementKey, value: number | undefined) => void
  onSolventWeightChange: (id: string, value: string) => void
  onSolventWeightBlur: (id: string) => void
  onFuelWeightChange: (value: string) => void
  onFuelWeightBlur: () => void
  onSolventRatioChange: (id: string, element: CopperElementKey, value: string) => void
  onSolventRatioBlur: (id: string, element: CopperElementKey, value: number | undefined) => void
  onFuelRatioChange: (element: CopperElementKey, value: string) => void
  onFuelRatioBlur: (element: CopperElementKey, value: number | undefined) => void
  onGasRatioChange: (id: string, element: CopperElementKey, value: string) => void
  onGasRatioBlur: (id: string, element: CopperElementKey, value: number | undefined) => void
  onMaterialWaterWeightChange: (kind: 'raw' | 'solvent', id: string, value: string) => void
  onMaterialWaterWeightBlur: (kind: 'raw' | 'solvent', id: string) => void
  onFuelWaterWeightChange: (value: string) => void
  onFuelWaterWeightBlur: () => void
  showProductRows?: boolean
  onOpenElementAssist: (materialId: string) => void
  onGasWeightChange: (id: string, value: string) => void
  onGasWeightBlur: (id: string) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [viewportWidth, setViewportWidth] = useState(0)
  const [gasInputUnit, setGasInputUnit] = useState<'mass' | 'volume'>('mass')
  const theadCls = darkMode ? 'bg-gray-800 text-gray-300' : 'bg-gray-50 text-gray-600'
  const gasInputUnitLabel = gasInputUnit === 'volume' ? 'Nm³/h' : 't/h'
  const displayElementKeys = useMemo(
    () => buildElementTableDisplayKeys(elementKeys, elementDisplayMode),
    [elementDisplayMode, elementKeys]
  )
  const colCount = elementTableColumnCount(displayElementKeys.length)
  const elementDisplayRatios = (ratios: Partial<Record<CopperElementKey, number>>) =>
    decomposeElementTableRatios(ratios, elementDisplayMode)
  const displayRatioValue = (ratios: Partial<Record<CopperElementKey, number>>, element: string) =>
    elementDisplayRatios(ratios)[element] ?? 0
  const displayDraftToStorageDraft = (
    displayElement: string,
    ratios: Partial<Record<CopperElementKey, number>>,
    value: string
  ) => {
    const normalized = value.trim().replace(',', '.')
    const numeric = normalized === '' ? Number.NaN : Number(normalized)
    if (!Number.isFinite(numeric)) return value
    const storageValue = elementTableDisplayValueToStorageValue(
      displayElement,
      Math.max(0, numeric),
      ratios,
      elementDisplayMode
    )
    return String(storageValue)
  }
  const elementAbsMinWidths = useMemo(() => {
    const collectSamples = (element: string) => {
      const samples: Array<string | number> = []
      for (const material of rawMaterials) {
        samples.push(
          elementDisplayMode === 'compound'
            ? ratioInputValue('raw', material.id, element as CopperElementKey, material.ratios[element as CopperElementKey] ?? 0)
            : formatTableNumber(displayRatioValue(material.ratios, element))
        )
      }
      samples.push(formatTableNumber(displayRatioValue(rawConcentrateRatios, element)))
      for (const material of solventColumns) {
        samples.push(
          elementDisplayMode === 'compound'
            ? ratioInputValue('solvent', material.id, element as CopperElementKey, material.ratios[element as CopperElementKey] ?? 0)
            : formatTableNumber(displayRatioValue(material.ratios, element))
        )
      }
      samples.push(
        elementDisplayMode === 'compound'
          ? ratioInputValue('fuel', fuelColumn.id, element as CopperElementKey, fuelColumn.ratios[element as CopperElementKey] ?? 0)
          : formatTableNumber(displayRatioValue(fuelColumn.ratios, element))
      )
      if (element === WATER_H_KEY || element === WATER_O_KEY) {
        samples.push(formatTableNumber(WATER_ELEMENT_RATIOS[element] ?? 0))
      }
      for (const material of airColumns) {
        samples.push(
          elementDisplayMode === 'compound'
            ? ratioInputValue('gas', material.id, element as CopperElementKey, material.ratios[element as CopperElementKey] ?? 0)
            : formatTableNumber(displayRatioValue(material.ratios, element))
        )
      }
      samples.push(formatTableNumber(displayRatioValue(furnaceFeedRatios, element)))
      return samples.filter((sample) => batchTableSampleText(sample) !== '')
    }
    return batchElementColumnWidthMeta(
      displayElementKeys,
      (element) => elementTableHeaderLabel(element, elementDisplayMode),
      collectSamples
    ).map((meta) =>
      meta.sparse ? BATCH_TABLE_SPARSE_COL_WIDTH : BATCH_TABLE_PCT_COL_WIDTH
    )
  }, [
    displayElementKeys,
    elementDisplayMode,
    rawMaterials,
    rawConcentrateRatios,
    solventColumns,
    fuelColumn,
    airColumns,
    furnaceFeedRatios,
    formatTableNumber,
    ratioInputValue,
  ])
  const { widths: colWidths, tableWidth: resolvedTableWidth } = batchElementTableColWidths(
    nameColWidth,
    displayElementKeys.length,
    viewportWidth,
    elementAbsMinWidths
  )

  const waterWeightInputValue = (
    key: string,
    material: Pick<CopperMaterialColumn, 'weight' | 'waterWeight' | 'moisture'>
  ) => {
    if (key in waterWeightDrafts) return waterWeightDrafts[key]
    const water = materialWaterWeight(material)
    return water > 0 ? formatTableNumber(water) : ''
  }

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const update = () => setViewportWidth(el.clientWidth)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const renderElementCells = (
    tone: ElementTableTone,
    ratios: Record<string, number>,
    options: {
      kind: 'raw' | 'solvent' | 'fuel' | 'gas' | 'readonly'
      id?: string
      material?: CopperMaterialColumn
      editable?: boolean
    }
  ): ReactNode[] =>
    displayElementKeys.map((element) => {
      const cellCls = elementDataCellClass(darkMode, tone)
      const storageElement = elementTableDisplayEditTarget(element, elementDisplayMode)
      const displayedValue = displayRatioValue(ratios, element)
      if (!storageElement || options.kind === 'readonly') {
        return (
          <td key={element} className={cellCls}>
            <BatchTableNumericReadonly darkMode={darkMode} value={displayedValue} className="text-sm" />
          </td>
        )
      }
      if (options.kind === 'gas') {
        const columnId = options.id
        const status: SolveInputStatus = GAS_ATTENTION_ELEMENT_KEYS.has(storageElement) ? 'attention' : 'none'
        return (
          <td key={element} className={cellCls}>
            <BatchTableNumericCell
              darkMode={darkMode}
              editable
              className={solveInputClass(darkMode, status)}
              helpTitle="步骤4：气体元素组成，可直接修改 H、O、C、N 等含量。"
              value={
                columnId
                  ? elementDisplayMode === 'compound'
                    ? ratioInputValue('gas', columnId, storageElement, ratios[storageElement] ?? 0)
                    : displayedValue
                  : ''
              }
              onChange={(next) => {
                if (columnId) onGasRatioChange(columnId, storageElement, displayDraftToStorageDraft(element, ratios, next))
              }}
              onBlur={() => {
                if (columnId) onGasRatioBlur(columnId, storageElement, ratios[storageElement])
              }}
            />
          </td>
        )
      }
      if (options.kind === 'raw' && options.material && options.id) {
        const material = options.material
        const sulfurStatus = storageElement === 'S (硫)' ? sulfurInputStatus(material.ratios) : null
        const helpTitle = phaseUnknownElements.has(storageElement)
          ? phaseCompleted
            ? '步骤2：物相成分。已回填有效物相成分结果；也可直接手动输入。'
            : storageElement === 'O(氧)' || storageElement === 'C (碳)'
              ? '双击进入物相计算（须先填写投料量）'
              : '步骤2：物相成分。可直接手动输入；O/C 可双击打开辅助计算。'
          : sulfurStatus === 'missing'
            ? '含 Cu/Fe 的原料须填写 S(硫) 元素含量。'
            : undefined
        let status = phaseCellStatus(material, storageElement)
        if (sulfurStatus === 'missing' && material.name.trim()) {
          status = 'attention'
        }
        const phaseEntryCell =
          phaseUnknownElements.has(storageElement) &&
          (storageElement === 'O(氧)' || storageElement === 'C (碳)') &&
          status === 'pending'
        return (
          <td key={element} className={cellCls}>
            <div>
              <BatchTableNumericCell
                darkMode={darkMode}
                editable
                className={`${solveInputClass(darkMode, status)}${phaseEntryCell ? ' cursor-pointer' : ''}`}
                helpTitle={helpTitle}
                onClick={(event) => event.stopPropagation()}
                onDoubleClick={() => {
                  if (storageElement === 'O(氧)' || storageElement === 'C (碳)') onOpenElementAssist(options.id!)
                }}
                value={
                  material.name.trim()
                    ? elementDisplayMode === 'compound'
                      ? ratioInputValue('raw', options.id, storageElement, material.ratios[storageElement] ?? 0)
                      : displayedValue
                    : ''
                }
                onChange={(next) =>
                  onRawRatioChange(options.id!, storageElement, displayDraftToStorageDraft(element, material.ratios, next))
                }
                onBlur={() => onRawRatioBlur(options.id!, storageElement, material.ratios[storageElement])}
              />
            </div>
          </td>
        )
      }
      if (options.kind === 'solvent' && options.id) {
        return (
          <td key={element} className={cellCls}>
            <BatchTableNumericCell
              darkMode={darkMode}
              editable
              value={
                elementDisplayMode === 'compound'
                  ? ratioInputValue('solvent', options.id, storageElement, ratios[storageElement] ?? 0)
                  : displayedValue
              }
              onChange={(next) =>
                onSolventRatioChange(options.id!, storageElement, displayDraftToStorageDraft(element, ratios, next))
              }
              onBlur={() => onSolventRatioBlur(options.id!, storageElement, ratios[storageElement])}
            />
          </td>
        )
      }
      if (options.kind === 'fuel') {
        return (
          <td key={element} className={cellCls}>
            <BatchTableNumericCell
              darkMode={darkMode}
              editable
              value={
                elementDisplayMode === 'compound'
                  ? ratioInputValue('fuel', fuelColumn.id, storageElement, ratios[storageElement] ?? 0)
                  : displayedValue
              }
              onChange={(next) => onFuelRatioChange(storageElement, displayDraftToStorageDraft(element, ratios, next))}
              onBlur={() => onFuelRatioBlur(storageElement, ratios[storageElement])}
            />
          </td>
        )
      }
      return (
        <td key={element} className={cellCls}>
          —
        </td>
      )
    })

  const renderTotalCell = (
    ratios: Record<string, number>,
    tone: ElementTableTone = 'raw',
    options?: { materialId?: string }
  ) => {
    const total =
      elementDisplayMode === 'element'
        ? calculateElementTableDisplayTotal(ratios as Partial<Record<CopperElementKey, number>>, elementDisplayMode)
        : calculateKnownTotal(ratios) + (ratios['Other(其他)'] ?? 0)
    const overLimit = options?.materialId ? rawTotalOverLimit?.(options.materialId) === true : false
    return (
      <td
        className={`${dataCellClass(darkMode, tone)} font-semibold ${
          overLimit ? 'text-red-500 ring-1 ring-inset ring-red-400' : ''
        }`}
      >
        <BatchTableNumericReadonly
          darkMode={darkMode}
          value={total}
          helpTitle={overLimit ? '元素合计已超过 100%，请核对各元素含量' : undefined}
          className={`text-sm font-semibold ${overLimit ? 'text-red-500' : ''}`}
        />
      </td>
    )
  }

  const renderWaterElementCells = (tone: ElementTableTone): ReactNode[] =>
    displayElementKeys.map((element) => {
      const cellCls = elementDataCellClass(darkMode, tone)
      if (element === WATER_H_KEY || element === WATER_O_KEY) {
        const value =
          element === WATER_H_KEY
            ? WATER_ELEMENT_RATIOS[WATER_H_KEY]
            : WATER_ELEMENT_RATIOS[WATER_O_KEY]
        return (
          <td key={element} className={cellCls}>
            <BatchTableNumericCell
              darkMode={darkMode}
              readOnly
              className={`${solveInputClass(darkMode, 'resolved')} cursor-default`}
              helpTitle="H₂O 化学计量分率，随含水 t/h 自动计算"
              value={value ?? 0}
            />
          </td>
        )
      }
      return <td key={element} className={cellCls} />
    })

  const renderMaterialWaterRow = (
    key: string,
    tone: ElementTableTone,
    options: {
      waterWeightInput?: ReactNode
      waterWeightDisplay?: string | number
      waterWeightHelpTitle?: string
      readOnly?: boolean
    }
  ) => {
    const waterTotal = (WATER_ELEMENT_RATIOS[WATER_H_KEY] ?? 0) + (WATER_ELEMENT_RATIOS[WATER_O_KEY] ?? 0)
    return (
      <tr key={key}>
        <td className={stickyCellClass(darkMode, tone, 'name')} style={nameColStyle(nameColWidth)}>
          含水
        </td>
        <td className={dataCellClass(darkMode, tone)}>
          {options.waterWeightInput ??
            (options.waterWeightDisplay != null ? (
              <BatchTableNumericReadonly
                darkMode={darkMode}
                value={options.waterWeightDisplay}
                helpTitle={options.waterWeightHelpTitle}
                className="text-sm"
              />
            ) : null)}
        </td>
        {renderWaterElementCells(tone)}
        <td className={`${dataCellClass(darkMode, tone)} font-semibold`}>
          <BatchTableNumericReadonly
            darkMode={darkMode}
            value={waterTotal}
            className="text-sm font-semibold"
          />
        </td>
      </tr>
    )
  }
  const annualInputFactor = 24 * 330
  const renderGasUnitToggle = () => (
    <button
      type="button"
      className={`absolute right-0.5 top-0.5 inline-flex h-5 w-5 items-center justify-center rounded text-xs font-semibold transition ${
        darkMode ? 'text-blue-200 hover:bg-gray-700' : 'text-blue-700 hover:bg-blue-50'
      }`}
      title={`切换气体投入显示单位（当前 ${gasInputUnitLabel}）`}
      aria-label="切换气体投入显示单位"
      onClick={() => setGasInputUnit((unit) => (unit === 'mass' ? 'volume' : 'mass'))}
    >
      ⇆
    </button>
  )

  const gasInputDisplayWeight = (column: CopperMaterialColumn) => {
    if (gasInputUnit === 'mass') return column.weight
    const waterWeight = materialWaterWeight(column)
    const totalMass = Math.max(0, column.weight) + waterWeight
    const waterWeightPct = totalMass > 0 ? (waterWeight / totalMass) * 100 : 0
    return calculateGasMixtureStandardVolumeNm3h(totalMass, gasPhaseWeightPct(column.ratios, waterWeightPct))
  }

  return (
    <div
      ref={containerRef}
      className={`overflow-auto rounded-lg border ${darkMode ? 'border-gray-600' : 'border-gray-200'}`}
    >
      <table className="table-fixed w-full text-sm" style={{ width: resolvedTableWidth }}>
        <CopperBatchTableColGroup widths={colWidths} />
        <thead className={theadCls}>
          <tr>
            <th colSpan={colCount} className={`p-0 ${theadCls}`}>
              <div
                className="sticky left-0 px-2 py-1.5 text-center text-sm font-semibold"
                style={{ width: viewportWidth || undefined }}
              >
                投入-物料元素表（w%）
              </div>
            </th>
          </tr>
          <tr>
            <th className={`sticky left-0 z-30 px-2 py-1.5 text-center text-sm font-semibold ${theadCls}`}>类型</th>
            <th
              className={`sticky left-[56px] z-30 px-2 py-1.5 text-center text-sm font-semibold ${theadCls}`}
              style={nameColStyle(nameColWidth)}
            >
              名称
            </th>
            <th className="px-1 py-1.5 text-center text-sm font-semibold">投入</th>
            {displayElementKeys.map((element) => (
              <th key={element} className="px-0.5 py-1.5 text-center text-sm font-semibold">
                {elementTableHeaderLabel(element, elementDisplayMode)}
              </th>
            ))}
            <th className="px-1 py-1.5 text-center text-sm font-semibold">合计</th>
          </tr>
        </thead>
        <tbody>
          {rawMaterials.map((material, index) => (
            <Fragment key={material.id}>
              <tr>
                <td rowSpan={2} className={`${categoryRowSpanCellClass(darkMode, 'raw')} relative p-0`}>
                  {categoryCellWithDelete(
                    `原料${index + 1}`,
                    rawMaterials.length > 1 ? () => onRemoveMaterial(material.id) : undefined,
                    darkMode
                  )}
                </td>
                <td className={`${stickyCellClass(darkMode, 'raw', 'name')}`} style={nameColStyle(nameColWidth)}>
                  <div>
                    <CopperMaterialSelect
                      darkMode={darkMode}
                      triggerClassName={materialSelectClass(
                        darkMode,
                        material.name.trim() ? 'resolved' : 'pending'
                      )}
                      title={
                        material.name.trim()
                          ? material.name
                          : '步骤1：请在名称下拉框中选择原料。'
                      }
                      value={
                        materialLibrary.some((item) => item.name === material.name)
                          ? materialLibrary.find((item) => item.name === material.name)?.id ?? ''
                          : ''
                      }
                      options={materialLibrary.map((item) => ({ id: item.id, label: item.name }))}
                      onChange={(libraryId) => onApplyLibraryMaterial(material.id, libraryId)}
                    />
                  </div>
                </td>
                <td className={dataCellClass(darkMode, 'raw')}>
                  <div>
                    <BatchTableNumericMassCell
                      darkMode={darkMode}
                      editable
                      className={solveInputClass(darkMode, rawWeightStatus(material.id))}
                      helpTitle="步骤1：输入投料量。可直接手动输入原料投料量，输入有效数字后标记为绿色。"
                      value={rawWeightDrafts[material.id] ?? ''}
                      onChange={(next) => onRawWeightChange(material.id, next)}
                    />
                  </div>
                </td>
                {renderElementCells('raw', material.ratios, { kind: 'raw', id: material.id, material })}
                {renderTotalCell(material.ratios, 'raw', { materialId: material.id })}
              </tr>
              {renderMaterialWaterRow(`${material.id}-water`, 'raw', {
                waterWeightInput: (
                  <BatchTableNumericMassCell
                    darkMode={darkMode}
                    editable
                    className={solveInputClass(
                      darkMode,
                      waterWeightStatus('raw', material.id, materialWaterWeight(material))
                    )}
                    helpTitle="含水质量 t/h；湿基 = 干料 t/h + 含水 t/h"
                    value={waterWeightInputValue(`raw:${material.id}`, material)}
                    onChange={(next) => onMaterialWaterWeightChange('raw', material.id, next)}
                    onBlur={() => onMaterialWaterWeightBlur('raw', material.id)}
                  />
                ),
              })}
            </Fragment>
          ))}
          <Fragment key="raw-concentrate-summary">
            <tr>
              <td rowSpan={2} className={categoryRowSpanCellClass(darkMode, 'concentrate')}>
                原料汇总
              </td>
              <td
                className={`${stickyCellClass(darkMode, 'concentrate', 'name')} font-semibold`}
                style={nameColStyle(nameColWidth)}
              >
                混合铜精矿
              </td>
              <td className={`${dataCellClass(darkMode, 'concentrate')} font-semibold`}>
                <BatchTableNumericReadonly
                  darkMode={darkMode}
                  value={rawConcentrateWeight}
                  helpTitle="所有原料干基投料量汇总；仅展示，不参与表内重复计算"
                  className="text-sm font-semibold"
                />
              </td>
              {renderElementCells('concentrate', rawConcentrateRatios, { kind: 'readonly' })}
              {renderTotalCell(rawConcentrateRatios, 'concentrate')}
            </tr>
            {renderMaterialWaterRow('raw-concentrate-water', 'concentrate', {
              waterWeightDisplay: rawConcentrateWaterWeight,
              waterWeightHelpTitle: '所有原料含水质量汇总；仅展示，不参与表内重复计算',
            })}
          </Fragment>
          {solventColumns.map((material, index) => (
            <Fragment key={material.id}>
              <tr>
                <td rowSpan={2} className={`${categoryRowSpanCellClass(darkMode, 'solvent')} relative p-0`}>
                  {categoryCellWithDelete(`熔剂${index + 1}`, () => onRemoveSolvent(material.id), darkMode)}
                </td>
                <td className={`${stickyCellClass(darkMode, 'solvent', 'name')}`} style={nameColStyle(nameColWidth)}>
                  <input
                    className={`h-8 w-full rounded border px-2 text-center text-sm outline-none transition ${
                      darkMode
                        ? 'border-gray-600 bg-gray-900 text-gray-100 placeholder:text-gray-500 focus:border-blue-500'
                        : 'border-gray-300 bg-white text-gray-900 placeholder:text-gray-400 focus:border-blue-500'
                    }`}
                    value={material.name}
                    placeholder="请输入熔剂名称"
                    title="熔剂名称，可自定义输入"
                    onChange={(event) => onSolventNameChange(material.id, event.target.value)}
                  />
                </td>
                <td className={dataCellClass(darkMode, 'solvent')}>
                  <BatchTableNumericMassCell
                    darkMode={darkMode}
                    editable
                    className={solveInputClass(darkMode, solventWeightStatus(material.id))}
                    helpTitle="步骤4：熔剂投料量，可直接手动输入。"
                    value={ratioDrafts[`solvent-weight:${material.id}`] ?? material.weight}
                    onChange={(next) => onSolventWeightChange(material.id, next)}
                    onBlur={() => onSolventWeightBlur(material.id)}
                  />
                </td>
                {renderElementCells('solvent', material.ratios, { kind: 'solvent', id: material.id })}
                {renderTotalCell(material.ratios, 'solvent')}
              </tr>
              {renderMaterialWaterRow(`${material.id}-water`, 'solvent', {
                waterWeightInput: (
                  <BatchTableNumericMassCell
                    darkMode={darkMode}
                    editable
                    className={solveInputClass(
                      darkMode,
                      waterWeightStatus('solvent', material.id, materialWaterWeight(material))
                    )}
                    helpTitle="含水质量 t/h"
                    value={waterWeightInputValue(`solvent:${material.id}`, material)}
                    onChange={(next) => onMaterialWaterWeightChange('solvent', material.id, next)}
                    onBlur={() => onMaterialWaterWeightBlur('solvent', material.id)}
                  />
                ),
              })}
            </Fragment>
          ))}
          <Fragment key="fuel-group">
            <tr>
              <td rowSpan={2} className={categoryRowSpanCellClass(darkMode, 'fuel')}>
                燃料
              </td>
              <td className={stickyCellClass(darkMode, 'fuel', 'name')} style={nameColStyle(nameColWidth)}>
                {fuelColumn.name}
              </td>
              <td className={dataCellClass(darkMode, 'fuel')}>
                <BatchTableNumericMassCell
                  darkMode={darkMode}
                  editable
                  className={solveInputClass(darkMode, fuelWeightStatus())}
                  helpTitle="步骤4：燃料煤投料量，可直接手动输入。"
                  value={ratioDrafts['fuel-weight:fuel-coal'] ?? fuelColumn.weight}
                  onChange={onFuelWeightChange}
                  onBlur={onFuelWeightBlur}
                />
              </td>
              {renderElementCells('fuel', fuelColumn.ratios, { kind: 'fuel' })}
              {renderTotalCell(fuelColumn.ratios, 'fuel')}
            </tr>
            {renderMaterialWaterRow('fuel-water', 'fuel', {
              waterWeightInput: (
                <BatchTableNumericMassCell
                  darkMode={darkMode}
                  editable
                  className={solveInputClass(
                    darkMode,
                    waterWeightStatus('fuel', fuelColumn.id, materialWaterWeight(fuelColumn))
                  )}
                  helpTitle="含水质量 t/h"
                  value={waterWeightInputValue(`fuel:${fuelColumn.id}`, fuelColumn)}
                  onChange={onFuelWaterWeightChange}
                  onBlur={onFuelWaterWeightBlur}
                />
              ),
            })}
          </Fragment>
          {airColumns.map((column, index) => (
            <tr key={column.id}>
              {index === 0 && (
                <td rowSpan={airColumns.length} className={stickyCellClass(darkMode, 'oxygen', 'category')}>
                  气
                </td>
              )}
              <td
                className={`${stickyCellClass(darkMode, 'oxygen', 'name')} relative`}
                style={nameColStyle(nameColWidth)}
              >
                <span>{column.name}</span>
                {index === 0 ? renderGasUnitToggle() : null}
              </td>
              <td className={dataCellClass(darkMode, 'oxygen')}>
                <div className="grid min-h-8 grid-rows-[minmax(1.5rem,1fr)_1rem] items-center">
                  {gasInputUnit === 'mass' ? (
                    <BatchTableNumericMassCell
                      darkMode={darkMode}
                      editable
                      className={gasMassInputClass(darkMode, oxygenAirInputStatus)}
                      helpTitle="步骤4：气体投料量，可直接手动输入（空气 t/h 可为 0）。"
                      value={ratioDrafts[`gas-weight:${column.id}`] ?? column.weight}
                      onChange={(next) => onGasWeightChange(column.id, next)}
                      onBlur={() => onGasWeightBlur(column.id)}
                    />
                  ) : (
                    <BatchTableNumericReadonly
                      darkMode={darkMode}
                      value={gasInputDisplayWeight(column)}
                      helpTitle={`${column.name} 标准体积（由当前质量与 O2/N2/H2O 组成换算）`}
                      className="text-sm"
                    />
                  )}
                  <span className={`text-[11px] leading-none ${darkMode ? 'text-gray-300' : 'text-gray-500'}`}>
                    {gasInputUnitLabel}
                  </span>
                </div>
              </td>
              {renderElementCells('oxygen', column.ratios, { kind: 'gas', id: column.id })}
              {renderTotalCell(column.ratios, 'oxygen')}
            </tr>
          ))}
          <Fragment key="blend-group">
            <tr>
              <td rowSpan={2} className={categoryRowSpanCellClass(darkMode, 'total')}>
                投入（年）
              </td>
              <td className={stickyCellClass(darkMode, 'total', 'name')} style={nameColStyle(nameColWidth)}>
                投入（年）
              </td>
              <td className={`${dataCellClass(darkMode, 'total')} font-semibold`}>
                <BatchTableNumericReadonly
                  darkMode={darkMode}
                  value={feedTotalWeight * annualInputFactor}
                  helpTitle={`投入（年） = 当前干基投料量 ${formatTableNumber(feedTotalWeight)} t/h × 24 × 330`}
                  className="text-sm font-semibold"
                />
              </td>
              {displayElementKeys.map((element) => (
                <td key={`blend-${element}`} className={dataCellClass(darkMode, 'total')}>
                  <BatchTableNumericReadonly
                    darkMode={darkMode}
                    value={displayRatioValue(furnaceFeedRatios, element)}
                    className="text-sm"
                  />
                </td>
              ))}
              <td className={`${dataCellClass(darkMode, 'total')} font-semibold`}>
                <BatchTableNumericReadonly
                  darkMode={darkMode}
                  value={
                    elementDisplayMode === 'element'
                      ? displayElementKeys.reduce(
                          (sum, element) => sum + Math.max(0, displayRatioValue(furnaceFeedRatios, element)),
                          0
                        )
                      : '100'
                  }
                  className="text-sm font-semibold"
                />
              </td>
            </tr>
            {renderMaterialWaterRow('blend-water', 'total', {
              waterWeightDisplay: furnaceBlendWaterWeight * annualInputFactor,
              waterWeightHelpTitle: `投入（年）含水 = 当前含水 ${formatTableNumber(furnaceBlendWaterWeight)} t/h × 24 × 330`,
            })}
          </Fragment>
          {showProductRows &&
            (() => {
              const outputBlocks = buildProductOutputBlocks(productTableColumns)
              const outputRowSpan = countProductOutputRows(productTableColumns)
              const phaseRegionColSpan = displayElementKeys.length + 1
              let categoryRendered = false
              return outputBlocks.flatMap((block, blockIndex) => {
                const showCategory = !categoryRendered
                if (showCategory) categoryRendered = true
                const product = block.product

                if (block.kind === 'phaseGrid') {
                  const rowKeyBase = `product-phase-grid-${product.key}-${blockIndex}`
                  const phaseRegionCell = `${productOutputCellClass(darkMode, 'resolved', 'single', 'middle')} p-0`
                  const rows = [
                    <tr key={`${rowKeyBase}-labels`}>
                      {showCategory && (
                        <td rowSpan={outputRowSpan} className={categoryRowSpanCellClass(darkMode, 'product')}>
                          产出
                        </td>
                      )}
                      <td
                        rowSpan={block.rowSpan}
                        className={`${stickyCellClass(darkMode, 'product', 'name')} font-semibold`}
                        style={nameColStyle(nameColWidth)}
                      >
                        {product.name}
                      </td>
                      <td rowSpan={block.rowSpan} className={productOutputCellClass(darkMode, 'resolved', 'single', 'top')}>
                        <BatchTableNumericReadonly
                          darkMode={darkMode}
                          value={product.mass}
                          className="text-sm"
                        />
                      </td>
                      <td colSpan={phaseRegionColSpan} className={phaseRegionCell}>
                        {renderHorizontalPhaseCells(
                          darkMode,
                          product,
                          'label',
                          productOutputCellClass
                        )}
                      </td>
                    </tr>,
                    <tr key={`${rowKeyBase}-pct`}>
                      <td colSpan={phaseRegionColSpan} className={phaseRegionCell}>
                        {renderHorizontalPhaseCells(
                          darkMode,
                          product,
                          'pct',
                          productOutputCellClass
                        )}
                      </td>
                    </tr>,
                  ]
                  return rows
                }

                const rowKey = `product-elements-${product.key}-${blockIndex}`
                return (
                  <tr key={rowKey}>
                    {showCategory && (
                      <td rowSpan={outputRowSpan} className={categoryRowSpanCellClass(darkMode, 'product')}>
                        产出
                      </td>
                    )}
                    <td className={stickyCellClass(darkMode, 'product', 'name')} style={nameColStyle(nameColWidth)}>
                      {product.name}
                    </td>
                    <td className={productOutputCellClass(darkMode, 'resolved', 'single', 'top')}>
                      <BatchTableNumericReadonly
                        darkMode={darkMode}
                        value={product.mass}
                        className="text-sm"
                      />
                    </td>
                    {displayElementKeys.map((element) => (
                      <td
                        key={`${rowKey}-${element}`}
                        className={productOutputCellClass(darkMode, 'resolved', 'single', 'middle')}
                      >
                        <BatchTableNumericReadonly
                          darkMode={darkMode}
                          value={displayRatioValue(product.composition as Partial<Record<CopperElementKey, number>>, element)}
                          className="text-sm"
                        />
                      </td>
                    ))}
                    <td className={productOutputCellClass(darkMode, 'resolved', 'single', 'bottom')}>
                      <BatchTableNumericReadonly
                        darkMode={darkMode}
                        value={
                          elementDisplayMode === 'element'
                            ? displayElementKeys.reduce(
                                (sum, element) =>
                                  sum +
                                  Math.max(
                                    0,
                                    displayRatioValue(
                                      product.composition as Partial<Record<CopperElementKey, number>>,
                                      element
                                    )
                                  ),
                                0
                              )
                            : calculateKnownTotal(product.composition) + (product.composition['Other(其他)'] ?? 0)
                        }
                        className="text-sm"
                      />
                    </td>
                  </tr>
                )
              })
            })()}
        </tbody>
      </table>
    </div>
  )
}
