import { inputSm } from '../../theme/uiTheme'
import {
  INPUT_PHASE_DISPLAY,
  INPUT_PHASE_ROW_KEYS,
  type InputPhaseRowKey,
  type PhasePercentMap,
} from '../../utils/copperPhaseTableCalc'
import {
  PRODUCT_PHASE_DISPLAY,
  PRODUCT_PHASE_ROWS,
  type ProductPhasePercentMap,
} from '../../utils/copperProductPhaseCalc'
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
  productPhases?: ProductPhasePercentMap
  productGasVolume?: Record<string, number>
  readOnly?: boolean
}

/** 统一物相行：投入侧 + 产出侧并集，顺序与元素总表视觉习惯一致 */
const UNIFIED_PHASE_ROW_KEYS = [
  'O2',
  'N2',
  'Cu2S',
  'FeS',
  'S',
  'Cu2O',
  'FeO',
  'Fe2O3',
  'Fe3O4',
  'SiO2',
  'CaO',
  'Al2O3',
  'C',
  'PbO',
  'As2O3',
  'Sb2O3',
  'ZnO',
  'SO2',
  'CO2',
  'Other',
] as const

function phaseRowLabel(key: string) {
  if (key === 'O2' || key === 'N2') return key
  return INPUT_PHASE_DISPLAY[key as InputPhaseRowKey] ?? PRODUCT_PHASE_DISPLAY[key] ?? key
}

function cellClass(dark: boolean, tone: ColumnKind) {
  const base = 'border-t px-1 py-1 align-middle text-center'
  if (tone === 'solvent') return `${base} ${dark ? 'border-gray-600 bg-emerald-950/15' : 'border-gray-200 bg-emerald-50/70'}`
  if (tone === 'fuel') return `${base} ${dark ? 'border-gray-600 bg-amber-950/15' : 'border-gray-200 bg-amber-50/70'}`
  if (tone === 'oxygen') return `${base} ${dark ? 'border-gray-600 bg-sky-950/15' : 'border-gray-200 bg-sky-50/70'}`
  if (tone === 'blend') return `${base} ${dark ? 'border-gray-600 bg-blue-950/20 font-mono' : 'border-gray-200 bg-blue-50 font-mono'}`
  if (tone === 'product') return `${base} ${dark ? 'border-gray-600 bg-indigo-950/15' : 'border-gray-200 bg-indigo-50/70'}`
  return `${base} ${dark ? 'border-gray-600' : 'border-gray-200'}`
}

function labelCellClass(dark: boolean) {
  return `sticky left-[34px] z-10 border-t px-1 py-1 text-center font-medium ${dark ? 'border-gray-600 bg-gray-700 text-gray-200' : 'border-gray-200 bg-white text-gray-700'}`
}

function unitCellClass(dark: boolean) {
  return `sticky left-0 z-10 border-t px-1 py-1 text-center ${dark ? 'border-gray-600 bg-gray-800 text-gray-300' : 'border-gray-200 bg-gray-50 text-gray-600'}`
}

function outputDividerCellClass(dark: boolean) {
  return `border-t px-1 py-1 align-middle text-center ${dark ? 'border-gray-600 bg-indigo-950/20 text-indigo-100' : 'border-gray-200 bg-indigo-50 text-indigo-900'}`
}

function formatCell(value: number) {
  return Number(value.toFixed(2)).toString()
}

function isInputPhaseRow(column: PhaseTableColumn, rowKey: string) {
  if (column.kind === 'oxygen') return rowKey === 'O2' || rowKey === 'N2'
  if (column.kind === 'product' || column.kind === 'blend') return false
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
  if (column.kind === 'oxygen') {
    if (rowKey === 'O2') return column.oxygenAir?.weightPct.O2 ?? null
    if (rowKey === 'N2') return column.oxygenAir?.weightPct.N2 ?? null
    return null
  }
  if (column.kind === 'product') {
    if (!isOutputPhaseRow(column, rowKey)) return null
    return column.productPhases?.[rowKey] ?? 0
  }
  if (!isInputPhaseRow(column, rowKey)) return null
  return column.phases?.[rowKey as InputPhaseRowKey] ?? 0
}

function isCellEditable(column: PhaseTableColumn, rowKey: string) {
  if (column.readOnly || column.kind === 'blend') return false
  if (column.kind === 'product') return isOutputPhaseRow(column, rowKey)
  return isInputPhaseRow(column, rowKey)
}

function isVolumeRowApplicable(column: PhaseTableColumn) {
  return column.kind === 'oxygen' || column.productKey === 'gas'
}

function columnTotal(column: PhaseTableColumn) {
  if (column.kind === 'oxygen') {
    return (column.oxygenAir?.weightPct.O2 ?? 0) + (column.oxygenAir?.weightPct.N2 ?? 0)
  }
  if (column.kind === 'product') {
    return Object.values(column.productPhases ?? {}).reduce((sum, value) => sum + (value ?? 0), 0)
  }
  return INPUT_PHASE_ROW_KEYS.reduce((sum, key) => sum + (column.phases?.[key] ?? 0), 0)
}

function volumeCellText(column: PhaseTableColumn) {
  if (column.kind === 'oxygen' && column.oxygenAir) {
    const { O2, N2 } = column.oxygenAir.volumePct
    return `O₂ ${formatCell(O2)} / N₂ ${formatCell(N2)}`
  }
  if (column.productKey === 'gas' && column.productGasVolume) {
    const volume = column.productGasVolume
    return [
      `SO₂ ${formatCell(volume.SO2 ?? 0)}`,
      `CO₂ ${formatCell(volume.CO2 ?? 0)}`,
      `O₂ ${formatCell(volume.O2 ?? 0)}`,
      `N₂ ${formatCell(volume.N2 ?? 0)}`,
    ].join(' / ')
  }
  return '—'
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
  compact = false,
  onChange,
  onBlur,
}: {
  darkMode: boolean
  value: string
  editable?: boolean
  invalid?: boolean
  applicable?: boolean
  compact?: boolean
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
    <div
      className={`${phaseBoxClass(darkMode, invalid, !applicable)} ${compact ? 'text-xs leading-tight' : ''}`}
      aria-readonly="true"
    >
      {display}
    </div>
  )
}

export function CopperBatchPhaseTables({
  darkMode,
  inputColumns,
  outputColumns,
  tableWidth,
  rawColumnWidths,
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
  inputColumns: PhaseTableColumn[]
  outputColumns: PhaseTableColumn[]
  tableWidth: number
  rawColumnWidths: Record<string, number>
  inputDrafts: Record<string, Record<string, string>>
  outputDrafts: Record<string, Record<string, string>>
  invalidInputColumns: Record<string, boolean>
  invalidOutputColumns: Record<string, boolean>
  onInputDraftChange: (columnId: string, key: string, value: string) => void
  onInputDraftCommit: (columnId: string) => void
  onOutputDraftChange: (columnId: string, key: string, value: string) => void
  onOutputDraftCommit: (columnId: string) => void
}) {
  const weightRowSpan = UNIFIED_PHASE_ROW_KEYS.length + 2

  const getDraft = (column: PhaseTableColumn, rowKey: string, fallback: number) => {
    const map = column.kind === 'product' ? outputDrafts : inputDrafts
    const text = map[column.id]?.[rowKey]
    if (text != null) return text
    return formatCell(fallback)
  }

  const handleDraftChange = (column: PhaseTableColumn, rowKey: string, value: string) => {
    if (column.kind === 'product') onOutputDraftChange(column.id, rowKey, value)
    else onInputDraftChange(column.id, rowKey, value)
  }

  const handleDraftCommit = (column: PhaseTableColumn) => {
    if (column.kind === 'product') onOutputDraftCommit(column.id)
    else onInputDraftCommit(column.id)
  }

  const isInvalid = (column: PhaseTableColumn) =>
    column.kind === 'product' ? invalidOutputColumns[column.id] : invalidInputColumns[column.id]

  const renderPhaseCell = (column: PhaseTableColumn, rowKey: string) => {
    const applicable = isPhaseRowApplicable(column, rowKey)
    const fallback = getCellValue(column, rowKey) ?? 0
    const editable = isCellEditable(column, rowKey)
    return (
      <PhaseValueBox
        darkMode={darkMode}
        applicable={applicable}
        editable={editable}
        invalid={isInvalid(column)}
        value={applicable ? getDraft(column, rowKey, fallback) : '—'}
        onChange={(value) => handleDraftChange(column, rowKey, value)}
        onBlur={() => handleDraftCommit(column)}
      />
    )
  }

  return (
    <div className={`overflow-auto rounded-lg border ${darkMode ? 'border-gray-600' : 'border-gray-200'}`}>
      <table className="table-fixed text-sm" style={{ width: tableWidth }}>
        <colgroup>
          <col className="w-[30px]" />
          <col className="w-[68px]" />
          {inputColumns.map((column) => (
            <col
              key={`phase-col-${column.id}`}
              style={{
                width:
                  column.kind === 'raw'
                    ? rawColumnWidths[column.id] ?? 104
                    : column.kind === 'blend'
                    ? 90
                    : column.kind === 'fuel' || column.kind === 'oxygen'
                    ? 88
                    : 82,
              }}
            />
          ))}
          <col className="w-[30px]" />
          {outputColumns.map((column) => (
            <col key={`phase-product-col-${column.id}`} className="w-[88px]" />
          ))}
        </colgroup>
        <thead className={darkMode ? 'bg-gray-800 text-gray-300' : 'bg-gray-50 text-gray-600'}>
          <tr>
            <th rowSpan={2} className={`sticky left-0 z-30 px-1 py-2 ${darkMode ? 'bg-gray-800' : 'bg-gray-50'}`} />
            <th className={`sticky left-[34px] z-30 px-1 py-2 text-center font-semibold ${darkMode ? 'bg-gray-800' : 'bg-gray-50'}`} />
            {inputColumns.map((column) => (
              <th
                key={`phase-head-${column.id}`}
                className={`px-0.5 py-1.5 text-center font-semibold ${
                  column.kind === 'solvent'
                    ? darkMode
                      ? 'bg-emerald-950/20'
                      : 'bg-emerald-50'
                    : column.kind === 'fuel'
                    ? darkMode
                      ? 'bg-amber-950/20'
                      : 'bg-amber-50'
                    : column.kind === 'oxygen'
                    ? darkMode
                      ? 'bg-sky-950/20'
                      : 'bg-sky-50'
                    : column.kind === 'blend'
                    ? darkMode
                      ? 'bg-blue-950/30'
                      : 'bg-blue-50'
                    : ''
                }`}
              >
                {column.header}
              </th>
            ))}
            <th
              colSpan={outputColumns.length + 1}
              className={`px-0.5 py-1.5 text-center font-semibold ${darkMode ? 'bg-indigo-950/20' : 'bg-indigo-50'}`}
            >
              产出
            </th>
          </tr>
          <tr>
            <th className={`sticky left-[34px] z-30 px-1 py-2 text-center font-semibold ${darkMode ? 'bg-gray-800' : 'bg-gray-50'}`}>
              组分
            </th>
            {inputColumns.map((column) => (
              <th
                key={`phase-sub-${column.id}`}
                className={`px-1 py-2 text-center font-semibold ${
                  column.kind === 'solvent'
                    ? darkMode
                      ? 'bg-emerald-950/20'
                      : 'bg-emerald-50'
                    : column.kind === 'fuel'
                    ? darkMode
                      ? 'bg-amber-950/20'
                      : 'bg-amber-50'
                    : column.kind === 'oxygen'
                    ? darkMode
                      ? 'bg-sky-950/20'
                      : 'bg-sky-50'
                    : column.kind === 'blend'
                    ? darkMode
                      ? 'bg-blue-950/30'
                      : 'bg-blue-50'
                    : ''
                }`}
              >
                {column.subHeader}
              </th>
            ))}
            <th className={`px-1 py-2 text-center font-semibold ${darkMode ? 'bg-indigo-950/20' : 'bg-indigo-50'}`} />
            {outputColumns.map((column) => (
              <th
                key={`phase-product-head-${column.id}`}
                className={`px-0.5 py-1.5 text-center font-semibold ${darkMode ? 'bg-indigo-950/20' : 'bg-indigo-50'}`}
              >
                {column.subHeader}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className={unitCellClass(darkMode)} rowSpan={weightRowSpan}>
              <span className="[writing-mode:vertical-rl] mx-auto inline-block whitespace-nowrap font-semibold leading-none">w%</span>
            </td>
            <td className={labelCellClass(darkMode)}>t/h</td>
            {inputColumns.map((column) => (
              <td key={`phase-weight-${column.id}`} className={cellClass(darkMode, column.kind)}>
                <PhaseValueBox darkMode={darkMode} value={formatCell(column.weight)} />
              </td>
            ))}
            <td className={outputDividerCellClass(darkMode)} rowSpan={weightRowSpan + 1}>
              <span className="[writing-mode:vertical-rl] mx-auto inline-block whitespace-nowrap font-semibold leading-none">产出</span>
            </td>
            {outputColumns.map((column) => (
              <td key={`phase-product-weight-${column.id}`} className={cellClass(darkMode, 'product')}>
                <PhaseValueBox
                  darkMode={darkMode}
                  applicable={column.weight > 0}
                  value={column.weight > 0 ? formatCell(column.weight) : '—'}
                />
              </td>
            ))}
          </tr>
          {UNIFIED_PHASE_ROW_KEYS.map((rowKey) => (
            <tr key={`phase-row-${rowKey}`}>
              <td className={labelCellClass(darkMode)}>{phaseRowLabel(rowKey)}</td>
              {inputColumns.map((column) => (
                <td key={`phase-${column.id}-${rowKey}`} className={cellClass(darkMode, column.kind)}>
                  {renderPhaseCell(column, rowKey)}
                </td>
              ))}
              {outputColumns.map((column) => (
                <td key={`phase-product-${column.id}-${rowKey}`} className={cellClass(darkMode, 'product')}>
                  {renderPhaseCell(column, rowKey)}
                </td>
              ))}
            </tr>
          ))}
          <tr>
            <td className={unitCellClass(darkMode)}>
              <span className="[writing-mode:vertical-rl] mx-auto inline-block whitespace-nowrap font-semibold leading-none">v%</span>
            </td>
            <td
              className={labelCellClass(darkMode)}
              title="体积分数：气相各组分占混合气体体积的百分比（富氧空气、烟气列有效）"
            >
              体积分数
            </td>
            {inputColumns.map((column) => (
              <td key={`phase-vol-${column.id}`} className={cellClass(darkMode, column.kind)}>
                <PhaseValueBox
                  darkMode={darkMode}
                  compact
                  applicable={isVolumeRowApplicable(column)}
                  value={volumeCellText(column)}
                />
              </td>
            ))}
            {outputColumns.map((column) => (
              <td key={`phase-product-vol-${column.id}`} className={cellClass(darkMode, 'product')}>
                <PhaseValueBox
                  darkMode={darkMode}
                  compact
                  applicable={isVolumeRowApplicable(column)}
                  value={volumeCellText(column)}
                />
              </td>
            ))}
          </tr>
          <tr>
            <td className={labelCellClass(darkMode)}>合计</td>
            {inputColumns.map((column) => (
              <td key={`phase-total-${column.id}`} className={cellClass(darkMode, column.kind)}>
                <PhaseValueBox darkMode={darkMode} value={formatCell(columnTotal(column))} />
              </td>
            ))}
            {outputColumns.map((column) => (
              <td key={`phase-product-total-${column.id}`} className={cellClass(darkMode, 'product')}>
                <PhaseValueBox
                  darkMode={darkMode}
                  applicable={column.weight > 0}
                  value={column.weight > 0 ? formatCell(columnTotal(column)) : '—'}
                />
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  )
}
