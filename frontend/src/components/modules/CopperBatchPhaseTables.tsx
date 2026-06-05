import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { inputSm } from '../../theme/uiTheme'
import { waterPhasePercent } from '../../utils/copperPhaseBatchCalc.ts'
import {
  INPUT_PHASE_DISPLAY,
  INPUT_PHASE_EXTRA_DISPLAY,
  INPUT_PHASE_ROW_KEYS,
  type InputPhaseRowKey,
  type PhasePercentMap,
} from '../../utils/copperPhaseTableCalc'
import { PRODUCT_PHASE_DISPLAY, PRODUCT_PHASE_ROWS } from '../../utils/copperProductPhaseCalc'
import {
  batchPhaseTableColWidths,
  batchTableDataColWidth,
  isSparseDataColumn,
} from '../../utils/copperBatchTableLayout'
import type { CopperPhaseAssignmentKey } from '../../utils/copperWorkflowCalc'
import { CopperBatchTableColGroup } from './CopperBatchTableColGroup'
import type { CopperProductKey } from '../../utils/copperProcessCalc'
type ColumnKind = 'raw' | 'solvent' | 'fuel' | 'oxygen' | 'blend' | 'product'

export type PhaseTableColumn = {
  id: string
  kind: ColumnKind
  header: string
  subHeader: string
  weight: number
  phases?: PhasePercentMap
  oxygenAir?: { weightPct: { O2: number; N2: number }; volumePct: { O2: number; N2: number } }
  productKey?: CopperProductKey | 'total' | 'loss'
  productPhases?: Partial<Record<string, number>>
  productGasVolume?: Record<string, number>
  readOnly?: boolean
  moisture?: number
}

const STICKY_CATEGORY = 'left-0 min-w-[56px]'
const STICKY_NAME_LEFT = 'left-[56px]'

function nameColStyle(width: number): CSSProperties {
  return { width, minWidth: width }
}

function phaseColLabel(key: string) {
  if (key === 'O2') return 'O'
  if (key === 'N2') return 'N'
  return (
    INPUT_PHASE_DISPLAY[key as CopperPhaseAssignmentKey] ??
    INPUT_PHASE_EXTRA_DISPLAY[key as 'H2O' | 'Other'] ??
    PRODUCT_PHASE_DISPLAY[key] ??
    key
  )
}

function rowToneClass(dark: boolean, kind: ColumnKind) {
  if (kind === 'solvent') return dark ? 'bg-emerald-950/20' : 'bg-emerald-50/70'
  if (kind === 'fuel') return dark ? 'bg-amber-950/20' : 'bg-amber-50/70'
  if (kind === 'oxygen') return dark ? 'bg-sky-950/20 text-sky-50' : 'bg-sky-50 text-sky-950'
  if (kind === 'blend') return dark ? 'bg-blue-950/30' : 'bg-blue-50'
  if (kind === 'product') return dark ? 'bg-indigo-950/20 text-indigo-100' : 'bg-indigo-50 text-indigo-900'
  return dark ? 'bg-gray-800/40' : 'bg-white'
}

function stickyCellClass(dark: boolean, kind: ColumnKind, side: 'category' | 'name') {
  const left = side === 'category' ? STICKY_CATEGORY : STICKY_NAME_LEFT
  const align = side === 'category' ? 'text-center font-semibold' : 'text-center'
  return `sticky ${left} z-20 border-t px-2 py-1.5 align-middle text-sm ${align} ${rowToneClass(dark, kind)}`
}

function dataCellClass(dark: boolean, kind: ColumnKind) {
  return `border-t px-1 py-1.5 align-middle text-center text-sm ${rowToneClass(dark, kind)}`
}

function opsCellClass(dark: boolean, kind: ColumnKind) {
  return `border-t px-1 py-1.5 align-middle text-center text-sm w-[64px] ${rowToneClass(dark, kind)}`
}

function deleteButtonClass(dark: boolean) {
  return `px-1 text-sm ${dark ? 'text-red-300 hover:underline' : 'text-red-600 hover:underline'}`
}

function formatCell(value: number) {
  return Number(value.toFixed(4)).toString()
}

function phaseTableColumnCount(phaseRowKeys: string[]) {
  return phaseRowKeys.length + 5
}

function isInputPhaseRow(column: PhaseTableColumn, rowKey: string) {
  if (column.kind === 'oxygen' || column.kind === 'blend') {
    return rowKey === 'O2' || rowKey === 'N2' || (column.kind === 'blend' && INPUT_PHASE_ROW_KEYS.includes(rowKey as InputPhaseRowKey))
  }
  if (column.kind === 'product') return false
  if (rowKey === 'O2' || rowKey === 'N2') return false
  return INPUT_PHASE_ROW_KEYS.includes(rowKey as InputPhaseRowKey)
}

function isOutputPhaseRow(column: PhaseTableColumn, rowKey: string) {
  if (column.kind !== 'product' || !column.productKey || column.productKey === 'total' || column.productKey === 'loss') {
    return false
  }
  return PRODUCT_PHASE_ROWS[column.productKey].includes(rowKey)
}

function isPhaseRowApplicable(column: PhaseTableColumn, rowKey: string) {
  return isInputPhaseRow(column, rowKey) || isOutputPhaseRow(column, rowKey)
}

function getCellValue(column: PhaseTableColumn, rowKey: string): number | null {
  if (column.kind === 'oxygen' || column.kind === 'blend') {
    if (rowKey === 'O2') return column.oxygenAir?.weightPct.O2 ?? null
    if (rowKey === 'N2') return column.oxygenAir?.weightPct.N2 ?? null
    if (column.kind === 'blend' && INPUT_PHASE_ROW_KEYS.includes(rowKey as InputPhaseRowKey)) {
      if (rowKey === 'H2O') {
        const m = column.moisture ?? 0
        return waterPhasePercent(column.weight, m)
      }
      return column.phases?.[rowKey as InputPhaseRowKey] ?? 0
    }
    return null
  }
  if (column.kind === 'product') {
    if (!isOutputPhaseRow(column, rowKey)) return null
    return column.productPhases?.[rowKey] ?? 0
  }
  if (rowKey === 'H2O') {
    if (!isInputPhaseRow(column, rowKey)) return null
    const m = column.moisture ?? 0
    return waterPhasePercent(column.weight, m)
  }
  if (!isInputPhaseRow(column, rowKey)) return null
  return column.phases?.[rowKey as InputPhaseRowKey] ?? 0
}

function isCellEditable(column: PhaseTableColumn, rowKey: string) {
  if (rowKey === 'H2O') return false
  if (column.readOnly || column.kind === 'blend') return false
  if (column.kind === 'product') return isOutputPhaseRow(column, rowKey)
  return isInputPhaseRow(column, rowKey)
}

function columnTotal(column: PhaseTableColumn) {
  if (column.kind === 'oxygen' || column.kind === 'blend') {
    const gasTotal = (column.oxygenAir?.weightPct.O2 ?? 0) + (column.oxygenAir?.weightPct.N2 ?? 0)
    if (column.kind === 'oxygen') return gasTotal
    const solidTotal = INPUT_PHASE_ROW_KEYS.reduce((sum, key) => {
      if (key === 'H2O') {
        const m = column.moisture ?? 0
        return sum + waterPhasePercent(column.weight, m)
      }
      return sum + (column.phases?.[key] ?? 0)
    }, 0)
    return solidTotal + gasTotal
  }
  if (column.kind === 'product') {
    return Object.values(column.productPhases ?? {}).reduce<number>(
      (sum, value) => sum + (value ?? 0),
      0,
    )
  }
  return INPUT_PHASE_ROW_KEYS.reduce((sum, key) => {
    if (key === 'H2O') return sum
    return sum + (column.phases?.[key] ?? 0)
  }, 0)
}

function phaseBoxClass(dark: boolean, invalid: boolean, muted = false) {
  return `${inputSm(dark)} flex h-7 w-full items-center justify-center px-1 py-0 text-center font-mono text-sm ${
    invalid ? 'border-red-500' : ''
  } ${muted ? (dark ? 'text-gray-500' : 'text-gray-400') : ''}`
}

function PhaseValueBox({
  darkMode,
  value,
  editable = false,
  invalid = false,
  applicable = true,
  onChange,
  onBlur,
}: {
  darkMode: boolean
  value: string
  editable?: boolean
  invalid?: boolean
  applicable?: boolean
  onChange?: (value: string) => void
  onBlur?: () => void
}) {
  const display = applicable ? value : '—'
  if (editable && applicable) {
    return (
      <input
        className={phaseBoxClass(darkMode, invalid)}
        value={value}
        onChange={(event) => onChange?.(event.target.value)}
        onBlur={() => onBlur?.()}
      />
    )
  }
  return (
    <div className={phaseBoxClass(darkMode, invalid, !applicable)} aria-readonly="true">
      {display}
    </div>
  )
}

function rowCategoryLabel(column: PhaseTableColumn, solventIndex: number) {
  if (column.kind === 'raw') return '原料'
  if (column.kind === 'solvent') return `熔剂${solventIndex + 1}`
  if (column.kind === 'fuel') return '燃料'
  if (column.kind === 'oxygen') return '富氧空气'
  if (column.kind === 'blend') return '混料'
  return '产出'
}

export function CopperBatchPhaseTables({
  darkMode,
  phaseRowKeys,
  inputColumns,
  outputColumns,
  tableWidth: _tableWidth,
  nameColWidth,
  inputDrafts,
  outputDrafts,
  invalidInputColumns,
  invalidOutputColumns,
  onInputDraftChange,
  onInputDraftCommit,
  onOutputDraftChange,
  onOutputDraftCommit,
  onRemoveMaterial,
  onRemoveSolvent,
}: {
  darkMode: boolean
  phaseRowKeys: string[]
  inputColumns: PhaseTableColumn[]
  outputColumns: PhaseTableColumn[]
  tableWidth: number
  nameColWidth: number
  rawColumnWidths?: Record<string, number>
  inputDrafts: Record<string, Record<string, string>>
  outputDrafts: Record<string, Record<string, string>>
  invalidInputColumns: Record<string, boolean>
  invalidOutputColumns: Record<string, boolean>
  onInputDraftChange: (columnId: string, key: string, value: string) => void
  onInputDraftCommit: (columnId: string) => void
  onOutputDraftChange: (columnId: string, key: string, value: string) => void
  onOutputDraftCommit: (columnId: string) => void
  onRemoveMaterial: (id: string) => void
  onRemoveSolvent: (id: string) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [viewportWidth, setViewportWidth] = useState(0)
  const allColumns = [...inputColumns, ...outputColumns]
  const theadCls = darkMode ? 'bg-gray-800 text-gray-300' : 'bg-gray-50 text-gray-600'
  const colCount = phaseTableColumnCount(phaseRowKeys)
  const phaseColWidths = useMemo(() => {
    return phaseRowKeys.map((rowKey) => {
      const header = phaseColLabel(rowKey)
      const samples: string[] = []
      for (const column of allColumns) {
        if (!isPhaseRowApplicable(column, rowKey)) continue
        const fallback = getCellValue(column, rowKey) ?? 0
        const map = column.kind === 'product' ? outputDrafts : inputDrafts
        const text = map[column.id]?.[rowKey]
        samples.push(text ?? formatCell(fallback))
      }
      return batchTableDataColWidth(header, samples, isSparseDataColumn(samples))
    })
  }, [allColumns, inputDrafts, outputDrafts, phaseRowKeys])
  const colWidths = batchPhaseTableColWidths(nameColWidth, phaseColWidths, viewportWidth)
  const resolvedTableWidth = colWidths.reduce((sum, width) => sum + width, 0)
  const solventColumns = inputColumns.filter((column) => column.kind === 'solvent')
  const opsDash = <span className="text-sm text-gray-400">—</span>

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const update = () => setViewportWidth(el.clientWidth)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const getDraft = (column: PhaseTableColumn, rowKey: string, fallback: number) => {
    const map = column.kind === 'product' ? outputDrafts : inputDrafts
    const text = map[column.id]?.[rowKey]
    if (text != null) return text
    return formatCell(fallback)
  }

  const renderOpsCell = (column: PhaseTableColumn, content: ReactNode) => (
    <td className={opsCellClass(darkMode, column.kind)}>{content}</td>
  )

  const renderOpsContent = (column: PhaseTableColumn) => {
    if (column.kind === 'raw') {
      return (
        <button type="button" className={deleteButtonClass(darkMode)} onClick={() => onRemoveMaterial(column.id)}>
          删除
        </button>
      )
    }
    if (column.kind === 'solvent') {
      return (
        <button type="button" className={deleteButtonClass(darkMode)} onClick={() => onRemoveSolvent(column.id)}>
          删除
        </button>
      )
    }
    return opsDash
  }

  const renderPhaseCells = (column: PhaseTableColumn) =>
    phaseRowKeys.map((rowKey) => {
      const applicable = isPhaseRowApplicable(column, rowKey)
      const fallback = getCellValue(column, rowKey) ?? 0
      const editable = isCellEditable(column, rowKey)
      const invalid = column.kind === 'product' ? invalidOutputColumns[column.id] : invalidInputColumns[column.id]
      return (
        <td key={`${column.id}-${rowKey}`} className={dataCellClass(darkMode, column.kind)}>
          <PhaseValueBox
            darkMode={darkMode}
            applicable={applicable}
            editable={editable}
            invalid={invalid}
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
    })

  return (
    <div
      ref={containerRef}
      className={`overflow-auto rounded-lg border ${darkMode ? 'border-gray-600' : 'border-gray-200'}`}
    >
      <table className="table-fixed text-sm" style={{ width: resolvedTableWidth, minWidth: resolvedTableWidth }}>
        <CopperBatchTableColGroup widths={colWidths} />
        <thead className={theadCls}>
          <tr>
            <th colSpan={colCount} className={`p-0 ${theadCls}`}>
              <div
                className="sticky left-0 px-2 py-1.5 text-center text-sm font-semibold"
                style={{ width: viewportWidth || undefined }}
              >
                物相组成表（w%）
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
            <th className="px-1 py-1.5 text-center text-sm font-semibold">t/h</th>
            {phaseRowKeys.map((rowKey) => (
              <th key={`phase-head-${rowKey}`} className="px-0.5 py-1.5 text-center text-sm font-semibold">
                {phaseColLabel(rowKey)}
              </th>
            ))}
            <th className="px-1 py-1.5 text-center text-sm font-semibold">合计</th>
            <th className="px-1 py-1.5 text-center text-sm font-semibold">操作</th>
          </tr>
        </thead>
        <tbody>
          {allColumns.map((column) => {
            const solventIndex =
              column.kind === 'solvent' ? solventColumns.findIndex((item) => item.id === column.id) : 0
            return (
              <tr key={`phase-row-${column.id}`}>
                <td className={stickyCellClass(darkMode, column.kind, 'category')}>
                  {rowCategoryLabel(column, solventIndex)}
                </td>
                <td className={stickyCellClass(darkMode, column.kind, 'name')} style={nameColStyle(nameColWidth)}>
                  <span
                    className="block whitespace-nowrap text-center"
                    title={column.subHeader || column.header}
                  >
                    {column.subHeader || column.header}
                  </span>
                </td>
                <td className={dataCellClass(darkMode, column.kind)}>
                  <PhaseValueBox
                    darkMode={darkMode}
                    applicable={column.weight > 0 || column.kind !== 'product'}
                    value={
                      column.weight > 0
                        ? formatCell(column.weight)
                        : column.kind === 'product'
                          ? '—'
                          : formatCell(column.weight)
                    }
                  />
                </td>
                {renderPhaseCells(column)}
                <td className={`${dataCellClass(darkMode, column.kind)} font-mono font-semibold`}>
                  {column.kind === 'product' && column.weight <= 0 ? '—' : formatCell(columnTotal(column))}
                </td>
                {renderOpsCell(column, renderOpsContent(column))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
