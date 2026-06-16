import { Fragment, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import {
  INPUT_PHASE_ROW_KEYS,
  phaseStorageKeyToDisplayLabel,
  type InputPhaseRowKey,
  type PhasePercentMap,
} from '../../utils/copperPhaseTableCalc'
import { PRODUCT_PHASE_ROWS } from '../../utils/copperProductPhaseCalc'
import { batchPhaseTableColWidths } from '../../utils/copperBatchTableLayout'
import { CopperBatchTableColGroup } from './CopperBatchTableColGroup'
import { BatchTableNumericCell, BatchTableNumericReadonly } from './BatchTableNumericCell'
import type { CopperProductKey } from '../../utils/copperProcessCalc'

type ColumnKind = 'raw' | 'solvent' | 'fuel' | 'oxygen' | 'blend' | 'product'

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
  oxygenAir?: { weightPct: { O2: number; N2: number }; volumePct: { O2: number; N2: number } }
  productKey?: string
  productPhases?: Partial<Record<string, number>>
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

function categoryRowSpanCellClass(dark: boolean, kind: ColumnKind) {
  return `sticky ${STICKY_CATEGORY} z-20 border-t px-2 py-1.5 align-middle text-center text-sm font-semibold ${rowToneClass(dark, kind)}`
}

function dataCellClass(dark: boolean, kind: ColumnKind) {
  return `border-t px-1 py-1.5 align-middle text-center text-sm ${rowToneClass(dark, kind)}`
}

function phaseTableColumnCount(phaseRowKeys: string[]) {
  return phaseRowKeys.length + 4
}

function columnPhaseKeys(column: PhaseTableColumn): string[] | undefined {
  if (column.applicablePhaseKeys && column.applicablePhaseKeys.length > 0) return column.applicablePhaseKeys
  if (column.materialPhaseRowKeys && column.materialPhaseRowKeys.length > 0) return column.materialPhaseRowKeys
  return undefined
}

function isBuiltinInputPhaseRowKey(rowKey: string) {
  return INPUT_PHASE_ROW_KEYS.includes(rowKey as InputPhaseRowKey)
}

function isInputPhaseRow(column: PhaseTableColumn, rowKey: string) {
  if (column.kind === 'oxygen') {
    return rowKey === 'O2' || rowKey === 'N2'
  }
  if (column.phaseReady === false) return false
  if (column.kind === 'blend') {
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

function isPhaseRowApplicable(column: PhaseTableColumn, rowKey: string) {
  return isInputPhaseRow(column, rowKey) || isOutputPhaseRow(column, rowKey)
}

function getCellValue(column: PhaseTableColumn, rowKey: string): number | null {
  if (column.kind === 'oxygen' || column.kind === 'blend') {
    if (rowKey === 'O2') return column.oxygenAir?.weightPct.O2 ?? null
    if (rowKey === 'N2') return column.oxygenAir?.weightPct.N2 ?? null
    if (column.kind === 'blend' && isInputPhaseRow(column, rowKey)) {
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
  if (!isInputPhaseRow(column, rowKey)) return null
  if (column.phaseContentsByKey) {
    return column.phaseContentsByKey[rowKey] ?? 0
  }
  if (isBuiltinInputPhaseRowKey(rowKey)) {
    return column.phases?.[rowKey as InputPhaseRowKey] ?? 0
  }
  return 0
}

function isCellEditable(column: PhaseTableColumn, rowKey: string) {
  if (column.readOnly || column.kind === 'blend') return false
  if (column.kind === 'product') return isOutputPhaseRow(column, rowKey)
  return isInputPhaseRow(column, rowKey)
}

export function columnTotal(column: PhaseTableColumn) {
  if (column.phaseReady === false) return 0
  if (column.phaseContentsByKey && column.kind !== 'product') {
    let total = Object.values(column.phaseContentsByKey).reduce((sum, value) => sum + (value ?? 0), 0)
    if (column.kind === 'blend') {
      total += (column.oxygenAir?.weightPct.O2 ?? 0) + (column.oxygenAir?.weightPct.N2 ?? 0)
    }
    return total
  }
  if (column.kind === 'oxygen' || column.kind === 'blend') {
    const gasTotal = (column.oxygenAir?.weightPct.O2 ?? 0) + (column.oxygenAir?.weightPct.N2 ?? 0)
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
    return Object.values(column.productPhases ?? {}).reduce<number>(
      (sum, value) => sum + (value ?? 0),
      0,
    )
  }
  return INPUT_PHASE_ROW_KEYS.reduce((sum, key) => sum + (column.phases?.[key] ?? 0), 0)
}

function isColumnTotalInvalid(column: PhaseTableColumn) {
  if (column.phaseReady === false) return false
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
  furnaceBlendWaterWeight,
  title = '投入-物料物相表（w%）',
  inputDrafts,
  outputDrafts,
  invalidInputColumns,
  invalidOutputColumns,
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
  onInputDraftChange: (columnId: string, key: string, value: string) => void
  onInputDraftCommit: (columnId: string) => void
  onOutputDraftChange: (columnId: string, key: string, value: string) => void
  onOutputDraftCommit: (columnId: string) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [viewportWidth, setViewportWidth] = useState(0)
  const theadCls = darkMode ? 'bg-gray-800 text-gray-300' : 'bg-gray-50 text-gray-600'
  const colCount = phaseTableColumnCount(phaseRowKeys)
  const { widths: colWidths, tableWidth: resolvedTableWidth } = batchPhaseTableColWidths(
    nameColWidth,
    phaseRowKeys.length,
    viewportWidth
  )
  const resolvedNameColWidth = colWidths[1] ?? nameColWidth

  const rawColumns = inputColumns.filter((column) => column.kind === 'raw')
  const solventColumns = inputColumns.filter((column) => column.kind === 'solvent')
  const fuelColumn = inputColumns.find((column) => column.kind === 'fuel')
  const airColumns = inputColumns.filter((column) => column.kind === 'oxygen')
  const blendColumn = inputColumns.find((column) => column.kind === 'blend')

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
    return fallback
  }

  const renderDashPhaseCells = (kind: ColumnKind) =>
    phaseRowKeys.map((rowKey) => (
      <td key={`dash-${kind}-${rowKey}`} className={dataCellClass(darkMode, kind)}>
        <BatchTableNumericReadonly darkMode={darkMode} value="—" applicable={false} />
      </td>
    ))

  const renderPhaseCells = (column: PhaseTableColumn) =>
    phaseRowKeys.map((rowKey) => {
      const applicable = isPhaseRowApplicable(column, rowKey)
      const fallback = getCellValue(column, rowKey) ?? 0
      const editable = isCellEditable(column, rowKey)
      const invalid = column.kind === 'product' ? invalidOutputColumns[column.id] : invalidInputColumns[column.id]
      return (
        <td key={`${column.id}-${rowKey}`} className={dataCellClass(darkMode, column.kind)}>
          <BatchTableNumericCell
            darkMode={darkMode}
            applicable={applicable}
            editable={editable}
            className={phaseBoxClass(invalid)}
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

  const renderTotalCell = (column: PhaseTableColumn) => (
    <td
      className={`${dataCellClass(darkMode, column.kind)} font-semibold ${
        isColumnTotalInvalid(column) ? 'text-red-500 ring-1 ring-inset ring-red-400' : ''
      }`}
    >
      {column.phaseReady === false ? (
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

  const renderWeightCell = (column: PhaseTableColumn, weight: number) => (
    <td className={dataCellClass(darkMode, column.kind)}>
      <BatchTableNumericCell
        darkMode={darkMode}
        applicable={column.weight > 0 || column.kind !== 'product'}
        value={weight > 0 || column.kind !== 'product' ? weight : '—'}
      />
    </td>
  )

  const renderMaterialGroup = (
    column: PhaseTableColumn,
    categoryLabel: string,
    waterWeight: number
  ) => (
    <Fragment key={`group-${column.id}`}>
      <tr>
        <td rowSpan={2} className={categoryRowSpanCellClass(darkMode, column.kind)}>
          {categoryLabel}
        </td>
        <td className={stickyCellClass(darkMode, column.kind, 'name')} style={nameColStyle(resolvedNameColWidth)}>
          <span className="block whitespace-nowrap text-center" title={column.subHeader || column.header}>
            {column.subHeader || column.header}
          </span>
        </td>
        {renderWeightCell(column, column.weight)}
        {renderPhaseCells(column)}
        {renderTotalCell(column)}
      </tr>
      <tr>
        <td className={stickyCellClass(darkMode, column.kind, 'name')} style={nameColStyle(resolvedNameColWidth)}>
          含水
        </td>
        <td className={dataCellClass(darkMode, column.kind)}>
          <BatchTableNumericReadonly
            darkMode={darkMode}
            value={waterWeight > 0 ? waterWeight : ''}
            className="text-sm"
          />
        </td>
        {renderDashPhaseCells(column.kind)}
        <td className={dataCellClass(darkMode, column.kind)}>
          <BatchTableNumericReadonly darkMode={darkMode} value="—" applicable={false} />
        </td>
      </tr>
    </Fragment>
  )

  const renderOutputRows = (): ReactNode[] => {
    if (outputColumns.length === 0) return []
    return outputColumns.map((column, index) => (
      <tr key={`phase-row-${column.id}`}>
        {index === 0 && (
          <td rowSpan={outputColumns.length} className={categoryRowSpanCellClass(darkMode, 'product')}>
            产出
          </td>
        )}
        <td className={stickyCellClass(darkMode, 'product', 'name')} style={nameColStyle(resolvedNameColWidth)}>
          <span className="block whitespace-nowrap text-center" title={column.subHeader || column.header}>
            {column.subHeader || column.header}
          </span>
        </td>
        {renderWeightCell(column, column.weight)}
        {renderPhaseCells(column)}
        {renderTotalCell(column)}
      </tr>
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
            <th className="px-1 py-1.5 text-center text-sm font-semibold">t/h</th>
            {phaseRowKeys.map((rowKey) => (
              <th key={`phase-head-${rowKey}`} className="px-0.5 py-1.5 text-center text-sm font-semibold">
                {phaseColLabel(rowKey)}
              </th>
            ))}
            <th className="px-1 py-1.5 text-center text-sm font-semibold">合计</th>
          </tr>
        </thead>
        <tbody>
          {rawColumns.map((column) =>
            renderMaterialGroup(column, column.header, column.waterWeight ?? 0)
          )}
          {solventColumns.map((column) =>
            renderMaterialGroup(column, column.header, column.waterWeight ?? 0)
          )}
          {fuelColumn && renderMaterialGroup(fuelColumn, '燃料', fuelColumn.waterWeight ?? 0)}
          {airColumns.map((column, index) => (
            <tr key={`phase-row-${column.id}`}>
              {index === 0 && (
                <td rowSpan={airColumns.length} className={stickyCellClass(darkMode, 'oxygen', 'category')}>
                  气
                </td>
              )}
              <td className={stickyCellClass(darkMode, 'oxygen', 'name')} style={nameColStyle(resolvedNameColWidth)}>
                {column.subHeader || column.header}
              </td>
              {renderWeightCell(column, column.weight)}
              {renderPhaseCells(column)}
              {renderTotalCell(column)}
            </tr>
          ))}
          {blendColumn &&
            renderMaterialGroup(blendColumn, '混料', blendColumn.waterWeight ?? furnaceBlendWaterWeight)}
          {renderOutputRows()}
        </tbody>
      </table>
    </div>
  )
}
