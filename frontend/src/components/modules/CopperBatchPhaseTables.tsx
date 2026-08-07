import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import {
  INPUT_PHASE_ROW_KEYS,
  phaseStorageKeyToDisplayLabel,
  type InputPhaseRowKey,
  type PhasePercentMap,
} from '../../utils/copperPhaseTableCalc'
import { calculateGasMixtureStandardVolumeNm3h, PRODUCT_PHASE_ROWS } from '../../utils/copperProductPhaseCalc'
import { PhaseFormulaDisplay } from '../PhaseFormulaDisplay.tsx'
import {
  batchPhaseTableColWidths,
  batchTableDataColWidth,
  BATCH_TABLE_PCT_COL_WIDTH,
  BATCH_TABLE_PHASE_FORMULA_COL_MAX,
  phaseFormulaWidthSample,
} from '../../utils/copperBatchTableLayout'
import { CopperBatchTableColGroup } from './CopperBatchTableColGroup'
import { BatchTableNumericCell, BatchTableNumericReadonly } from './BatchTableNumericCell'
import type { CopperProductKey } from '../../utils/copperProcessCalc'
import { buildInputPhaseDisplayPlan } from '../../utils/copperInputPhaseTableDisplay'

type ColumnKind = 'raw' | 'other' | 'concentrate' | 'solvent' | 'fuel' | 'oxygen' | 'blend' | 'product'

export type PhaseTableColumn = {
  id: string
  kind: ColumnKind
  header: string
  subHeader: string
  weight: number
  phases?: PhasePercentMap
  /** 物相计算后按物相总表列键存放的 w% */
  phaseContentsByKey?: Record<string, number> | null
  /** 该列适用的物相键（原料自定义物相等） */
  materialPhaseRowKeys?: string[]
  /** 混料列等：全部适用物相键 */
  applicablePhaseKeys?: string[]
  /** false 表示该物料尚未完成物相回填，只展示质量/含水，不展示物相结果 */
  phaseReady?: boolean
  oxygenAir?: {
    weightPct: { O2: number; N2: number; H2O?: number }
    volumePct: { O2: number; N2: number; H2O?: number }
  }
  productKey?: string
  productPhases?: Partial<Record<string, number>>
  productPhaseMasses?: Partial<Record<string, number>>
  productPhaseRowKeys?: string[]
  productGasVolume?: Record<string, number>
  readOnly?: boolean
  moisture?: number
  waterWeight?: number
}

const STICKY_CATEGORY = 'left-0 min-w-[56px]'
const STICKY_NAME_LEFT = 'left-[56px]'

function nameColStyle(width: number): CSSProperties {
  return { width, minWidth: width }
}

function phaseColLabel(key: string) {
  return phaseStorageKeyToDisplayLabel(key)
}

function renderPhaseFormula(key: string) {
  return <PhaseFormulaDisplay formula={key} />
}

function rowToneClass(dark: boolean, kind: ColumnKind) {
  if (kind === 'concentrate') return dark ? 'border-amber-700 bg-amber-950/35 text-amber-50' : 'border-amber-200 bg-amber-100/80 text-amber-950'
  if (kind === 'other') return dark ? 'border-violet-700 bg-violet-950/35 text-violet-50' : 'border-violet-200 bg-violet-50 text-violet-950'
  if (kind === 'solvent') return dark ? 'border-gray-600 bg-emerald-950/20' : 'border-gray-200 bg-emerald-50/70'
  if (kind === 'fuel') return dark ? 'border-gray-600 bg-amber-950/20' : 'border-gray-200 bg-amber-50/70'
  if (kind === 'oxygen') return dark ? 'border-gray-600 bg-sky-950/20 text-sky-50' : 'border-gray-200 bg-sky-50 text-sky-950'
  if (kind === 'blend') return dark ? 'border-gray-600 bg-blue-950/30' : 'border-gray-200 bg-blue-50'
  if (kind === 'product') return dark ? 'border-gray-600 bg-indigo-950/20 text-indigo-100' : 'border-gray-200 bg-indigo-50 text-indigo-900'
  return dark ? 'border-gray-600 bg-gray-800/40' : 'border-gray-200 bg-white'
}

function rowFrameClass() {
  return 'border-t'
}

function spanFrameClass() {
  return 'border-t'
}

function stickyCellClass(dark: boolean, kind: ColumnKind, side: 'category' | 'name') {
  const left = side === 'category' ? STICKY_CATEGORY : STICKY_NAME_LEFT
  const align = side === 'category' ? 'text-center font-semibold' : 'text-center'
  return `sticky ${left} z-20 h-9 ${spanFrameClass()} px-2 py-0 align-middle text-sm ${align} ${rowToneClass(dark, kind)}`
}

function categoryRowSpanCellClass(dark: boolean, kind: ColumnKind) {
  return `sticky ${STICKY_CATEGORY} z-20 h-9 ${spanFrameClass()} px-2 py-0 align-middle text-center text-sm font-semibold ${rowToneClass(dark, kind)}`
}

function dataCellClass(dark: boolean, kind: ColumnKind, options?: { allowWrap?: boolean }) {
  const height = options?.allowWrap ? 'min-h-9 py-1' : 'h-9 py-0'
  return `${height} ${rowFrameClass()} px-0.5 align-middle text-center text-sm ${rowToneClass(dark, kind)}`
}

function phaseTableColumnCount(phaseDataColumnCount: number) {
  return phaseDataColumnCount + 4
}

function columnPhaseKeys(column: PhaseTableColumn): string[] | undefined {
  if (column.applicablePhaseKeys && column.applicablePhaseKeys.length > 0) return column.applicablePhaseKeys
  if (column.materialPhaseRowKeys && column.materialPhaseRowKeys.length > 0) return column.materialPhaseRowKeys
  return undefined
}

function uniquePhaseKeys(keys: string[]) {
  return [...new Set(keys.filter(Boolean))]
}

function columnDisplayPhaseKeys(column: PhaseTableColumn, alwaysShowGasWater = false): string[] {
  if (column.kind === 'oxygen') {
    const keys = ['O2', 'N2']
    if (
      alwaysShowGasWater ||
      (column.oxygenAir?.weightPct.H2O ?? 0) > 0 ||
      (column.oxygenAir?.volumePct.H2O ?? 0) > 0
    ) {
      keys.push('H2O')
    }
    return keys
  }
  if (column.kind === 'product') {
    if (column.productPhaseRowKeys && column.productPhaseRowKeys.length > 0) return column.productPhaseRowKeys
    if (column.productPhases) return Object.keys(column.productPhases)
    if (column.productKey && column.productKey in PRODUCT_PHASE_ROWS) {
      return PRODUCT_PHASE_ROWS[column.productKey as CopperProductKey]
    }
    return []
  }
  const declaredKeys = columnPhaseKeys(column)
  if (declaredKeys && declaredKeys.length > 0) {
    return declaredKeys.filter((key) => key !== 'O2' && key !== 'N2')
  }
  if (column.phaseContentsByKey) {
    return uniquePhaseKeys(Object.keys(column.phaseContentsByKey)).filter((key) => key !== 'O2' && key !== 'N2')
  }
  if (column.phases) {
    return INPUT_PHASE_ROW_KEYS.filter((key) => (column.phases?.[key] ?? 0) > 0)
  }
  return []
}

function columnUnitLabel(column: PhaseTableColumn, gasInputUnit: 'mass' | 'volume') {
  return column.kind === 'oxygen' && gasInputUnit === 'volume' ? 'Nm³/h' : 't/h'
}

function isBuiltinInputPhaseRowKey(rowKey: string) {
  return INPUT_PHASE_ROW_KEYS.includes(rowKey as InputPhaseRowKey)
}

function isInputPhaseRow(column: PhaseTableColumn, rowKey: string, allowUnreadyEdit = false) {
  if (column.kind === 'oxygen') {
    return rowKey === 'O2' || rowKey === 'N2' || rowKey === 'H2O'
  }
  if (column.phaseReady === false && !allowUnreadyEdit) return false
  if (column.kind === 'blend' || column.kind === 'concentrate') {
    if (rowKey === 'O2' || rowKey === 'N2') return false
    const keys = columnPhaseKeys(column)
    if (keys) return keys.includes(rowKey)
    return isBuiltinInputPhaseRowKey(rowKey)
  }
  if (column.kind === 'product') return false
  if (rowKey === 'O2' || rowKey === 'N2') return false
  const keys = columnPhaseKeys(column)
  if (keys) return keys.includes(rowKey)
  return isBuiltinInputPhaseRowKey(rowKey)
}

function isOutputPhaseRow(column: PhaseTableColumn, rowKey: string) {
  if (column.kind !== 'product' || !column.productKey || column.productKey === 'total') {
    return false
  }
  if (column.productPhaseRowKeys && column.productPhaseRowKeys.length > 0) {
    return column.productPhaseRowKeys.includes(rowKey)
  }
  if (column.productPhases && rowKey in column.productPhases) return true
  if (!(column.productKey in PRODUCT_PHASE_ROWS)) return false
  return PRODUCT_PHASE_ROWS[column.productKey as CopperProductKey].includes(rowKey)
}

function isPhaseRowApplicable(column: PhaseTableColumn, rowKey: string, allowUnreadyEdit = false) {
  return isInputPhaseRow(column, rowKey, allowUnreadyEdit) || isOutputPhaseRow(column, rowKey)
}

function getCellValue(column: PhaseTableColumn, rowKey: string, allowUnreadyEdit = false): number | null {
  if (column.kind === 'oxygen' || column.kind === 'blend' || column.kind === 'concentrate') {
    if (rowKey === 'O2') return column.oxygenAir?.weightPct.O2 ?? null
    if (rowKey === 'N2') return column.oxygenAir?.weightPct.N2 ?? null
    if (rowKey === 'H2O') return column.oxygenAir?.weightPct.H2O ?? null
    if ((column.kind === 'blend' || column.kind === 'concentrate') && isInputPhaseRow(column, rowKey, allowUnreadyEdit)) {
      if (column.phaseContentsByKey) {
        return column.phaseContentsByKey[rowKey] ?? 0
      }
      if (isBuiltinInputPhaseRowKey(rowKey)) {
        return column.phases?.[rowKey as InputPhaseRowKey] ?? 0
      }
      return 0
    }
    return null
  }
  if (column.kind === 'product') {
    if (!isOutputPhaseRow(column, rowKey)) return null
    return column.productPhases?.[rowKey] ?? 0
  }
  if (!isInputPhaseRow(column, rowKey, allowUnreadyEdit)) return null
  if (column.phaseContentsByKey) {
    return column.phaseContentsByKey[rowKey] ?? 0
  }
  if (isBuiltinInputPhaseRowKey(rowKey)) {
    return column.phases?.[rowKey as InputPhaseRowKey] ?? 0
  }
  return 0
}

function getDisplayCellValue(
  column: PhaseTableColumn,
  rowKey: string,
  allowUnreadyEdit = false
): number | null {
  if (column.kind === 'oxygen') {
    if (rowKey === 'O2') return column.oxygenAir?.weightPct.O2 ?? null
    if (rowKey === 'N2') return column.oxygenAir?.weightPct.N2 ?? null
    if (rowKey === 'H2O') return column.oxygenAir?.weightPct.H2O ?? 0
  }
  if (column.kind === 'product' && column.productGasVolume && rowKey in column.productGasVolume) {
    return column.productGasVolume[rowKey] ?? 0
  }
  return getCellValue(column, rowKey, allowUnreadyEdit)
}

function isCellEditable(column: PhaseTableColumn, rowKey: string, allowInputEdit = false) {
  if (column.readOnly || column.kind === 'blend' || column.kind === 'concentrate') return false
  if (column.kind === 'product') return isOutputPhaseRow(column, rowKey)
  if (column.kind === 'oxygen') {
    if (!allowInputEdit) return false
    return rowKey === 'O2' || rowKey === 'N2' || rowKey === 'H2O'
  }
  return isInputPhaseRow(column, rowKey, allowInputEdit)
}

export function columnTotal(column: PhaseTableColumn) {
  if (column.phaseReady === false && !column.phaseContentsByKey && !column.phases && column.kind !== 'oxygen') {
    return 0
  }
  if (column.phaseContentsByKey && column.kind !== 'product') {
    let total = Object.values(column.phaseContentsByKey).reduce((sum, value) => sum + (value ?? 0), 0)
    if (column.kind === 'blend') {
      total +=
        (column.oxygenAir?.weightPct.O2 ?? 0) +
        (column.oxygenAir?.weightPct.N2 ?? 0) +
        (column.oxygenAir?.weightPct.H2O ?? 0)
    }
    return total
  }
  if (column.kind === 'oxygen' || column.kind === 'blend') {
    const gasTotal =
      (column.oxygenAir?.weightPct.O2 ?? 0) +
      (column.oxygenAir?.weightPct.N2 ?? 0) +
      (column.oxygenAir?.weightPct.H2O ?? 0)
    if (column.kind === 'oxygen') return gasTotal
    const keys = columnPhaseKeys(column) ?? [...INPUT_PHASE_ROW_KEYS]
    const solidTotal = keys.reduce((sum, key) => {
      if (isBuiltinInputPhaseRowKey(key)) {
        return sum + (column.phases?.[key as InputPhaseRowKey] ?? 0)
      }
      return sum
    }, 0)
    return solidTotal + gasTotal
  }
  if (column.kind === 'product') {
    if (column.productGasVolume) {
      return Object.values(column.productGasVolume).reduce<number>(
        (sum, value) => sum + (value ?? 0),
        0,
      )
    }
    return Object.values(column.productPhases ?? {}).reduce<number>(
      (sum, value) => sum + (value ?? 0),
      0,
    )
  }
  if (column.phases) {
    return INPUT_PHASE_ROW_KEYS.reduce((sum, key) => sum + (column.phases?.[key] ?? 0), 0)
  }
  return 0
}

function isColumnTotalInvalid(column: PhaseTableColumn) {
  if (column.phaseReady === false && !column.phaseContentsByKey && !column.phases && column.kind !== 'oxygen') {
    return false
  }
  if (column.kind === 'product' && column.weight <= 0) return false
  return Math.abs(columnTotal(column) - 100) > 0.02
}

function phaseBoxClass(invalid: boolean) {
  return invalid ? 'border-red-500' : ''
}

export function CopperBatchPhaseTables({
  darkMode,
  phaseRowKeys,
  inputColumns,
  outputColumns,
  tableWidth: _tableWidth,
  nameColWidth,
  formatTableNumber: _formatTableNumber,
  furnaceBlendWaterWeight: _furnaceBlendWaterWeight,
  title = '投入-物料物相表（w%）',
  inputDrafts,
  outputDrafts,
  invalidInputColumns,
  invalidOutputColumns,
  expandRawGroupToken = 0,
  rawSummaryHeader = '混料',
  rawSummarySubHeader = '混合铜精矿',
  showFuel = true,
  weightEditable = false,
  weightDrafts = {},
  waterWeightDrafts = {},
  onWeightChange,
  onWeightBlur,
  onWaterWeightChange,
  onWaterWeightBlur,
  onInputDraftChange,
  onInputDraftCommit,
  onOutputDraftChange,
  onOutputDraftCommit,
}: {
  darkMode: boolean
  phaseRowKeys: string[]
  inputColumns: PhaseTableColumn[]
  outputColumns: PhaseTableColumn[]
  tableWidth: number
  nameColWidth: number
  formatTableNumber: (v: number) => string
  furnaceBlendWaterWeight: number
  title?: string
  rawColumnWidths?: Record<string, number>
  inputDrafts: Record<string, Record<string, string>>
  outputDrafts: Record<string, Record<string, string>>
  invalidInputColumns: Record<string, boolean>
  invalidOutputColumns: Record<string, boolean>
  expandRawGroupToken?: number
  rawSummaryHeader?: string
  rawSummarySubHeader?: string
  showFuel?: boolean
  /** 吹炼：投料量可在物相表编辑 */
  weightEditable?: boolean
  weightDrafts?: Record<string, string>
  waterWeightDrafts?: Record<string, string>
  onWeightChange?: (columnId: string, value: string) => void
  onWeightBlur?: (columnId: string) => void
  onWaterWeightChange?: (columnId: string, value: string) => void
  onWaterWeightBlur?: (columnId: string) => void
  onInputDraftChange: (columnId: string, key: string, value: string) => void
  onInputDraftCommit: (columnId: string) => void
  onOutputDraftChange: (columnId: string, key: string, value: string) => void
  onOutputDraftCommit: (columnId: string) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [viewportWidth, setViewportWidth] = useState(0)
  /** 吹炼（可编辑投料量）默认展开「投入」明细，避免折叠后输入投料量才突然变表 */
  const [rawExpanded, setRawExpanded] = useState(weightEditable)
  const [solventExpanded, setSolventExpanded] = useState(false)
  const [gasInputUnit, setGasInputUnit] = useState<'mass' | 'volume'>('mass')
  const theadCls = darkMode ? 'bg-gray-800 text-gray-300' : 'bg-gray-50 text-gray-600'
  const gasInputUnitLabel = gasInputUnit === 'volume' ? 'Nm³/h' : 't/h'
  const inputDisplayPlan = useMemo(
    () =>
      buildInputPhaseDisplayPlan({
        inputColumns,
        phaseRowKeys,
        rawExpanded,
        solventExpanded,
        rawSummaryHeader,
        rawSummarySubHeader,
        showFuel,
        alwaysShowRawSummary: weightEditable,
      }),
    [
      inputColumns,
      phaseRowKeys,
      rawExpanded,
      rawSummaryHeader,
      rawSummarySubHeader,
      showFuel,
      solventExpanded,
      weightEditable,
    ]
  )
  const { rawColumns, solventColumns, airColumns, materialRows } = inputDisplayPlan
  const visiblePhaseColumns = useMemo(
    () => [
      ...materialRows.map((row) => row.column as PhaseTableColumn),
      ...airColumns,
      ...outputColumns,
    ],
    [airColumns, materialRows, outputColumns]
  )
  const declaredSolidPhaseColumnCount = useMemo(
    () =>
      Math.max(
        1,
        phaseRowKeys.filter((key) => key !== 'O2' && key !== 'N2' && key !== 'H2O').length
      ),
    [phaseRowKeys]
  )
  const maxVisiblePhaseColumnCount = useMemo(
    () =>
      Math.max(
        1,
        ...visiblePhaseColumns.map((column) => columnDisplayPhaseKeys(column, weightEditable).length)
      ),
    [visiblePhaseColumns, weightEditable]
  )
  // 吹炼投入编辑时按已声明物相预留列槽，不能因某个原料从 0 变为有值而重排。
  const phaseDataColumnCount = weightEditable
    ? Math.max(declaredSolidPhaseColumnCount, maxVisiblePhaseColumnCount)
    : maxVisiblePhaseColumnCount
  const maxPhaseColumnCount = phaseDataColumnCount
  const colCount = phaseTableColumnCount(phaseDataColumnCount)
  const phaseColumnWidths = useMemo(() => {
    if (weightEditable) {
      return Array.from({ length: phaseDataColumnCount }, () => BATCH_TABLE_PCT_COL_WIDTH)
    }
    return Array.from({ length: phaseDataColumnCount }, (_, index) => {
      const phaseIndex = index
      const samples: Array<string | number> = []
      if (phaseIndex === 0) samples.push('H2O', 100)
      for (const column of visiblePhaseColumns) {
        const key = columnDisplayPhaseKeys(column, weightEditable)[phaseIndex]
        if (!key) continue
        samples.push(phaseFormulaWidthSample(phaseColLabel(key)))
        const value = getDisplayCellValue(column, key, weightEditable)
        if (value != null) samples.push(value)
      }
      return Math.min(
        BATCH_TABLE_PHASE_FORMULA_COL_MAX,
        batchTableDataColWidth('', samples, false, { max: BATCH_TABLE_PHASE_FORMULA_COL_MAX })
      )
    })
  }, [phaseDataColumnCount, visiblePhaseColumns, weightEditable])
  const { widths: colWidths, tableWidth: resolvedTableWidth } = batchPhaseTableColWidths(
    nameColWidth,
    phaseDataColumnCount,
    viewportWidth,
    phaseColumnWidths
  )
  const resolvedNameColWidth = colWidths[1] ?? nameColWidth

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const update = () => setViewportWidth(el.clientWidth)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    if (expandRawGroupToken > 0) setRawExpanded(true)
  }, [expandRawGroupToken])

  useEffect(() => {
    if (weightEditable) setRawExpanded(true)
  }, [weightEditable])

  const getDraft = (column: PhaseTableColumn, rowKey: string, fallback: number) => {
    const map = column.kind === 'product' ? outputDrafts : inputDrafts
    const text = map[column.id]?.[rowKey]
    if (text != null) return text
    return fallback
  }

  const renderGroupToggle = (
    expanded: boolean,
    onToggle: () => void,
    label: string,
    count: number,
    direction: 'up' | 'down' = 'down'
  ) => {
    const icon = direction === 'up' ? (expanded ? '▴' : '▵') : expanded ? '▾' : '▸'
    return (
      <button
        type="button"
        className={`mx-auto inline-flex max-w-full items-center justify-center gap-1.5 rounded px-1.5 py-1 text-xs font-semibold transition ${
          darkMode ? 'hover:bg-gray-900/45' : 'hover:bg-white/65'
        }`}
        title={`${expanded ? '折叠' : '展开'}${label}明细`}
        aria-expanded={expanded}
        onClick={onToggle}
      >
        <span className="text-sm leading-none" aria-hidden="true">
          {icon}
        </span>
        <span className="whitespace-nowrap">{label}</span>
        <span
          className={`rounded-full px-1.5 py-0.5 text-[10px] leading-none ${
            darkMode ? 'bg-gray-900/55 text-gray-300' : 'bg-white/75 text-gray-600'
          }`}
        >
          {count}项
        </span>
      </button>
    )
  }

  const renderTextCell = (
    kind: ColumnKind,
    value: ReactNode,
    key?: string,
    options?: { allowWrap?: boolean }
  ) => (
    <td key={key} className={dataCellClass(darkMode, kind, options)}>
      <span
        className={`block w-full text-center text-sm ${
          options?.allowWrap
            ? 'whitespace-normal break-words leading-tight'
            : 'truncate'
        }`}
        title={typeof value === 'string' ? value : undefined}
      >
        {value}
      </span>
    </td>
  )

  const renderBlankCell = (
    kind: ColumnKind,
    key?: string
  ) => (
    <td key={key} className={dataCellClass(darkMode, kind)}>
      <span className="block h-5" aria-hidden="true" />
    </td>
  )

  const renderPaddedBlankCells = (
    kind: ColumnKind,
    startIndex: number
  ) =>
    Array.from({ length: Math.max(0, maxPhaseColumnCount - startIndex) }, (_, index) =>
      renderBlankCell(kind, `blank-${startIndex + index}`)
    )

  const renderPhaseLabelCells = (
    column: PhaseTableColumn,
    phaseKeys: string[]
  ) => [
    ...phaseKeys.map((rowKey) =>
      renderTextCell(column.kind, renderPhaseFormula(rowKey), `${column.id}-label-${rowKey}`, {
        allowWrap: true,
      })
    ),
    ...renderPaddedBlankCells(column.kind, phaseKeys.length),
  ]

  const renderPhaseValueCells = (
    column: PhaseTableColumn,
    phaseKeys: string[]
  ) => [
    ...phaseKeys.map((rowKey) => {
      const applicable = isPhaseRowApplicable(column, rowKey, weightEditable)
      const fallback = getDisplayCellValue(column, rowKey, weightEditable) ?? 0
      const editable = isCellEditable(column, rowKey, weightEditable)
      const invalid = column.kind === 'product' ? invalidOutputColumns[column.id] : invalidInputColumns[column.id]
      const helpTitle =
        column.kind === 'product' && column.productGasVolume && column.productPhaseMasses
          ? (() => {
              const volumePct = column.productGasVolume?.[rowKey]
              const phaseMass = column.productPhaseMasses?.[rowKey]
              const massPct = column.productPhases?.[rowKey]
              if (volumePct == null && phaseMass == null && massPct == null) return undefined
              return `烟气 ${phaseColLabel(rowKey)}：v% ${volumePct != null ? _formatTableNumber(volumePct) : '0'}，对应质量 ${phaseMass != null ? _formatTableNumber(phaseMass) : '0'} t/h，质量分数 ${massPct != null ? _formatTableNumber(massPct) : '0'}%。`
            })()
          : column.kind === 'oxygen'
            ? (() => {
                const weightPct =
                  rowKey === 'O2'
                    ? column.oxygenAir?.weightPct.O2
                    : rowKey === 'N2'
                      ? column.oxygenAir?.weightPct.N2
                      : rowKey === 'H2O'
                        ? column.oxygenAir?.weightPct.H2O
                        : undefined
                const volumePct =
                  rowKey === 'O2'
                    ? column.oxygenAir?.volumePct.O2
                    : rowKey === 'N2'
                      ? column.oxygenAir?.volumePct.N2
                      : rowKey === 'H2O'
                        ? column.oxygenAir?.volumePct.H2O
                        : undefined
                if (weightPct == null && volumePct == null && rowKey !== 'H2O') return undefined
                return `${phaseColLabel(rowKey)}：w% ${weightPct != null ? _formatTableNumber(weightPct) : '0'}，v% ${volumePct != null ? _formatTableNumber(volumePct) : '0'}。`
              })()
          : undefined
      return (
        <td key={`${column.id}-${rowKey}`} className={dataCellClass(darkMode, column.kind)}>
          <BatchTableNumericCell
            darkMode={darkMode}
            applicable={applicable}
            editable={editable}
            className={phaseBoxClass(invalid)}
            helpTitle={helpTitle}
            value={applicable ? getDraft(column, rowKey, fallback) : '—'}
            onChange={(value) => {
              if (column.kind === 'product') onOutputDraftChange(column.id, rowKey, value)
              else onInputDraftChange(column.id, rowKey, value)
            }}
            onBlur={() => {
              if (column.kind === 'product') onOutputDraftCommit(column.id)
              else onInputDraftCommit(column.id)
            }}
          />
        </td>
      )
    }),
    ...renderPaddedBlankCells(column.kind, phaseKeys.length),
  ]

  const renderTotalCell = (column: PhaseTableColumn) => (
    <td
      className={`${dataCellClass(darkMode, column.kind)} font-semibold ${
        isColumnTotalInvalid(column) ? 'text-red-500 ring-1 ring-inset ring-red-400' : ''
      }`}
    >
      {column.phaseReady === false &&
      !weightEditable &&
      !column.phaseContentsByKey &&
      !column.phases &&
      column.kind !== 'oxygen' ? (
        <BatchTableNumericReadonly darkMode={darkMode} value="—" applicable={false} />
      ) : column.kind === 'product' && column.weight <= 0 ? (
        <BatchTableNumericReadonly darkMode={darkMode} value="" applicable={false} />
      ) : (
        <BatchTableNumericReadonly
          darkMode={darkMode}
          value={columnTotal(column)}
          helpTitle={isColumnTotalInvalid(column) ? '物相列合计应为 100%，请核对该行组成。' : undefined}
          className="text-sm font-semibold"
        />
      )}
    </td>
  )

  const renderGasCategoryCell = (rowSpan: number) => (
    <td rowSpan={rowSpan} className={`${categoryRowSpanCellClass(darkMode, 'oxygen')} relative`}>
      <div className="flex flex-col items-center justify-center gap-0.5 py-0.5">
        <span>气</span>
        <button
          type="button"
          className={`rounded px-1 py-0.5 text-[10px] font-semibold leading-none transition ${
            darkMode
              ? 'bg-sky-950/60 text-sky-200 hover:bg-sky-900/80'
              : 'bg-sky-100 text-sky-800 hover:bg-sky-200'
          }`}
          title={`切换气体投入显示单位（当前 ${gasInputUnitLabel}）`}
          aria-label="切换气体投入显示单位"
          onClick={() => setGasInputUnit((unit) => (unit === 'mass' ? 'volume' : 'mass'))}
        >
          {gasInputUnitLabel}
        </button>
      </div>
    </td>
  )

  const columnDisplayWeight = (column: PhaseTableColumn, weight: number) => {
    if (column.kind !== 'oxygen' || gasInputUnit === 'mass') return weight
    return calculateGasMixtureStandardVolumeNm3h(weight + (column.waterWeight ?? 0), column.oxygenAir?.weightPct ?? {})
  }

  const renderWeightCell = (
    column: PhaseTableColumn,
    weight: number
  ) => {
    const canEditWeight =
      weightEditable &&
      !column.readOnly &&
      (column.kind === 'raw' ||
        column.kind === 'other' ||
        column.kind === 'solvent' ||
        column.kind === 'oxygen')
    const draft = weightDrafts[column.id]
    const displayValue =
      draft != null
        ? draft
        : weight > 0 || column.kind !== 'product'
          ? columnDisplayWeight(column, weight)
          : '—'
    return (
      <td className={dataCellClass(darkMode, column.kind)}>
        {canEditWeight ? (
          <BatchTableNumericCell
            darkMode={darkMode}
            editable
            applicable
            value={displayValue}
            helpTitle={
              column.kind === 'oxygen' && gasInputUnit === 'volume'
                ? `${column.subHeader || column.header} 标准体积（由当前质量与 O2/N2/H2O 组成换算）`
                : '投料量（t/h）；改物相组成请编辑右侧物相格'
            }
            onChange={(value) => onWeightChange?.(column.id, value)}
            onBlur={() => onWeightBlur?.(column.id)}
          />
        ) : (
          <BatchTableNumericCell
            darkMode={darkMode}
            applicable={column.weight > 0 || column.kind !== 'product'}
            value={displayValue}
            helpTitle={
              column.kind === 'oxygen' && gasInputUnit === 'volume'
                ? `${column.subHeader || column.header} 标准体积（由当前质量与 O2/N2/H2O 组成换算）`
                : undefined
            }
          />
        )}
      </td>
    )
  }

  const renderWaterWeightCell = (column: PhaseTableColumn, waterWeight: number) => {
    const canEditWater =
      weightEditable &&
      !column.readOnly &&
      (column.kind === 'raw' || column.kind === 'other' || column.kind === 'solvent' || column.kind === 'fuel')
    const draft = waterWeightDrafts[column.id]
    const displayValue = draft != null ? draft : waterWeight
    return (
      <td className={dataCellClass(darkMode, column.kind)}>
        {canEditWater ? (
          <BatchTableNumericCell
            darkMode={darkMode}
            editable
            applicable
            value={displayValue}
            helpTitle="含水质量 t/h；湿基 = 干料 t/h + 含水 t/h"
            onChange={(value) => onWaterWeightChange?.(column.id, value)}
            onBlur={() => onWaterWeightBlur?.(column.id)}
          />
        ) : (
          <BatchTableNumericReadonly
            darkMode={darkMode}
            value={waterWeight}
            className="text-sm"
          />
        )}
      </td>
    )
  }

  const renderFormulaCell = (kind: ColumnKind, key: string, cellKey?: string) =>
    renderTextCell(kind, renderPhaseFormula(key), cellKey, { allowWrap: true })

  const renderMaterialGroup = (
    column: PhaseTableColumn,
    categoryLabel: ReactNode,
    waterWeight: number
  ) => (
    <Fragment key={`group-${column.id}`}>
      <tr>
        <td rowSpan={4} className={categoryRowSpanCellClass(darkMode, column.kind)}>
          {categoryLabel}
        </td>
        <td rowSpan={2} className={stickyCellClass(darkMode, column.kind, 'name')} style={nameColStyle(resolvedNameColWidth)}>
          <span className="block whitespace-nowrap text-center" title={column.subHeader || column.header}>
            {column.subHeader || column.header}
          </span>
        </td>
        {renderTextCell(column.kind, columnUnitLabel(column, gasInputUnit), `${column.id}-unit`)}
        {renderPhaseLabelCells(column, columnDisplayPhaseKeys(column, weightEditable))}
        {renderBlankCell(column.kind, `${column.id}-label-total`)}
      </tr>
      <tr>
        {renderWeightCell(column, column.weight)}
        {renderPhaseValueCells(column, columnDisplayPhaseKeys(column, weightEditable))}
        {renderTotalCell(column)}
      </tr>
      <tr>
        <td rowSpan={2} className={stickyCellClass(darkMode, column.kind, 'name')} style={nameColStyle(resolvedNameColWidth)}>
          含水
        </td>
        {renderTextCell(column.kind, columnUnitLabel(column, gasInputUnit), `${column.id}-water-unit`)}
        {renderFormulaCell(column.kind, 'H2O', `${column.id}-water-h2o`)}
        {renderPaddedBlankCells(column.kind, 1)}
        {renderBlankCell(column.kind, `${column.id}-water-label-total`)}
      </tr>
      <tr>
        {renderWaterWeightCell(column, waterWeight)}
        <td className={dataCellClass(darkMode, column.kind)}>
          <BatchTableNumericReadonly
            darkMode={darkMode}
            value={100}
            helpTitle="含水按 H2O 计，比例为 100%。"
            className="text-sm"
          />
        </td>
        {renderPaddedBlankCells(column.kind, 1)}
        <td className={dataCellClass(darkMode, column.kind)}>
          <BatchTableNumericReadonly
            darkMode={darkMode}
            value={100}
            className="text-sm"
          />
        </td>
      </tr>
    </Fragment>
  )

  const renderPhaseOnlyGroup = (
    column: PhaseTableColumn,
    categoryLabel: ReactNode | null,
    categoryRowSpan: number,
    options?: { gasCategory?: boolean }
  ) => {
    const phaseKeys = columnDisplayPhaseKeys(column, weightEditable)
    return (
      <Fragment key={`group-${column.id}`}>
        <tr>
          {categoryLabel != null &&
            (options?.gasCategory ? (
              renderGasCategoryCell(categoryRowSpan)
            ) : (
              <td rowSpan={categoryRowSpan} className={categoryRowSpanCellClass(darkMode, column.kind)}>
                {categoryLabel}
              </td>
            ))}
          <td
            rowSpan={2}
            className={stickyCellClass(darkMode, column.kind, 'name')}
            style={nameColStyle(resolvedNameColWidth)}
          >
            <span className="block whitespace-nowrap text-center" title={column.subHeader || column.header}>
              {column.subHeader || column.header}
            </span>
          </td>
          {renderTextCell(column.kind, columnUnitLabel(column, gasInputUnit), `${column.id}-unit`)}
          {renderPhaseLabelCells(column, phaseKeys)}
          {renderBlankCell(column.kind, `${column.id}-label-total`)}
        </tr>
        <tr>
          {renderWeightCell(column, column.weight)}
          {renderPhaseValueCells(column, phaseKeys)}
          {renderTotalCell(column)}
        </tr>
      </Fragment>
    )
  }

  const renderMaterialDisplayRow = (row: (typeof materialRows)[number]) => {
    const column = row.column as PhaseTableColumn
    if (row.collapsibleGroup === 'raw') {
      return renderMaterialGroup(
        column,
        renderGroupToggle(
          row.expanded ?? false,
          () => setRawExpanded((value) => !value),
          rawSummaryHeader,
          row.count ?? rawColumns.length,
          'up'
        ),
        column.waterWeight ?? 0
      )
    }
    if (row.collapsibleGroup === 'solvent') {
      return renderMaterialGroup(
        column,
        renderGroupToggle(
          row.expanded ?? false,
          () => setSolventExpanded((value) => !value),
          '熔剂',
          row.count ?? solventColumns.length
        ),
        column.waterWeight ?? 0
      )
    }
    return renderMaterialGroup(
      column,
      row.role === 'fuel' ? '燃料' : column.kind === 'other' ? '其他' : column.header,
      column.waterWeight ?? 0
    )
  }

  const renderOutputRows = (): ReactNode[] => {
    if (outputColumns.length === 0) return []
    return outputColumns.map((column, index) => (
      renderPhaseOnlyGroup(column, index === 0 ? '产出' : null, outputColumns.length * 2)
    ))
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
                {title}
              </div>
            </th>
          </tr>
          <tr>
            <th className={`sticky left-0 z-30 px-2 py-1.5 text-center text-sm font-semibold ${theadCls}`}>类型</th>
            <th
              className={`sticky left-[56px] z-30 px-2 py-1.5 text-center text-sm font-semibold ${theadCls}`}
              style={nameColStyle(resolvedNameColWidth)}
            >
              名称
            </th>
            <th className="px-1 py-1.5 text-center text-sm font-semibold">投入</th>
            {Array.from({ length: maxPhaseColumnCount }, (_, index) => (
              <th key={`phase-head-placeholder-${index}`} className="px-0.5 py-1.5 text-center text-sm font-semibold">
                &nbsp;
              </th>
            ))}
            <th className="px-1 py-1.5 text-center text-sm font-semibold">合计</th>
          </tr>
        </thead>
        <tbody>
          {materialRows.map((row) => renderMaterialDisplayRow(row))}
          {airColumns.map((column, index) =>
            renderPhaseOnlyGroup(
              column,
              index === 0 ? '气' : null,
              airColumns.length * 2,
              { gasCategory: index === 0 }
            )
          )}
          {renderOutputRows()}
        </tbody>
      </table>
    </div>
  )
}
