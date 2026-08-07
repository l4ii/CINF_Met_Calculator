import type { CopperBatchExportColumn, CopperBatchExportRow, CopperBatchWorkbookSheet } from './copperBatchExport.ts'
import { formatBatchTableFull } from './batchTableNumeric.ts'
import { phaseStorageKeyToDisplayLabel } from './copperPhaseTableCalc.ts'
import type {
  CopperHeatBalanceResult,
  HeatComponentRow,
  HeatFlowRow,
} from './copperHeatBalance.ts'

function fmt(value: number | null | undefined): string {
  if (value == null) return ''
  return formatBatchTableFull(value)
}

function heatTypeLabel(type: HeatFlowRow['type']): string {
  if (type === 'physical') return '物理热'
  if (type === 'chemical') return '化学热'
  if (type === 'exchange') return '交换热'
  return '散热'
}

function displayHeatFlowRows(rows: HeatFlowRow[], side: 'income' | 'expenditure'): HeatFlowRow[] {
  return rows.flatMap((row) => {
    if (side === 'income' && row.material.includes('冷却水')) return []
    if (side === 'income' && (row.material === '燃料煤燃烧热' || row.material === '入炉燃料煤燃烧热')) return []
    if (side === 'income' && (row.material.includes('补充燃料煤') || row.material.includes('补充煤'))) return []
    return [row]
  })
}

function buildHeatFlowHalfSheet(title: string, rows: HeatFlowRow[], side: 'income' | 'expenditure'): CopperBatchWorkbookSheet {
  const columns: CopperBatchExportColumn[] = [
    { header: '序号', subHeader: '序号' },
    { header: '热类型', subHeader: '热类型' },
    { header: '物料', subHeader: '物料' },
    { header: '温度/℃', subHeader: '温度/℃' },
    { header: 'MJ/h', subHeader: 'MJ/h' },
    { header: '%', subHeader: '%' },
  ]
  const displayRows = displayHeatFlowRows(rows, side)
  const total = displayRows.reduce((sum, row) => {
    if (row.isSubtotal) return sum
    const isError = row.isBalanceError || row.material === '误差'
    return sum + (isError ? row.heatMJh : Math.max(0, row.heatMJh))
  }, 0)
  const exportRows: CopperBatchExportRow[] = displayRows.map((row, index) => {
    const isError = row.isBalanceError || row.material === '误差'
    const heatForPercent = isError ? row.heatMJh : Math.max(0, row.heatMJh)
    const percent = total !== 0 ? (heatForPercent / Math.abs(total)) * 100 : 0
    return {
      label: row.isSubtotal ? '小计' : String(index + 1),
      values: [
        row.isSubtotal ? '小计' : String(index + 1),
        heatTypeLabel(row.type),
        row.material,
        row.temperature != null ? fmt(row.temperature) : '',
        fmt(row.heatMJh),
        fmt(percent),
      ],
    }
  })
  exportRows.push({
    label: '合计',
    values: ['合计', '', '', '', fmt(total), '100'],
  })
  return { title, columns, rows: exportRows }
}

type ComponentHeatGroup = {
  section: string
  rows: HeatComponentRow[]
  total: number
  orderIndex: number
}

function buildComponentHeatGroups(rows: HeatComponentRow[]): ComponentHeatGroup[] {
  const grouped = new Map<string, { rows: HeatComponentRow[]; orderIndex: number }>()
  rows.forEach((row, index) => {
    const existing = grouped.get(row.section)
    if (existing) {
      existing.rows.push(row)
    } else {
      grouped.set(row.section, { rows: [row], orderIndex: index })
    }
  })
  return [...grouped.entries()]
    .map(([section, group]) => ({
      section,
      rows: group.rows,
      total: group.rows.reduce((sum, row) => sum + row.heatMJh, 0),
      orderIndex: group.orderIndex,
    }))
    .sort((a, b) => a.orderIndex - b.orderIndex)
}

function buildComponentPhysicalHeatSheet(title: string, rows: HeatComponentRow[]): CopperBatchWorkbookSheet {
  const groups = buildComponentHeatGroups(rows)
  const maxRowCount = Math.max(0, ...groups.map((group) => group.rows.length))
  const columns: CopperBatchExportColumn[] = [
    { header: '№', subHeader: '№' },
    ...groups.flatMap((group) => [
      { header: group.section, subHeader: '组分' },
      { header: group.section, subHeader: 'MJ/h' },
    ]),
  ]
  const exportRows: CopperBatchExportRow[] = Array.from({ length: maxRowCount }).map((_, rowIndex) => ({
    label: String(rowIndex + 1),
    values: [
      String(rowIndex + 1),
      ...groups.flatMap((group) => {
        const row = group.rows[rowIndex]
        return [row ? phaseStorageKeyToDisplayLabel(row.component) : '', row ? fmt(row.heatMJh) : '']
      }),
    ],
  }))
  const grandTotal = groups.reduce((sum, group) => sum + group.total, 0)
  exportRows.push({
    label: '合计',
    values: [
      '合计',
      ...groups.flatMap((group) => ['合计', fmt(group.total)]),
    ],
  })
  exportRows.push({
    label: '总计',
    values: [
      '总计',
      ...groups.flatMap((_, index) =>
        index === groups.length - 1 ? ['', fmt(grandTotal)] : ['', '']
      ),
    ],
  })
  return { title, columns, rows: exportRows }
}

function buildReactionHeatSheet(title: string, result: CopperHeatBalanceResult): CopperBatchWorkbookSheet {
  const columns: CopperBatchExportColumn[] = [
    { header: '序号', subHeader: '序号' },
    { header: '反应', subHeader: '反应' },
    { header: '基准相', subHeader: '基准相' },
    { header: '入炉量 kmol/h', subHeader: '入炉量 kmol/h' },
    { header: '实际反应 kmol/h', subHeader: '实际反应 kmol/h' },
    { header: 'kJ/mol', subHeader: 'kJ/mol' },
    { header: '热量 MJ/h', subHeader: '热量 MJ/h' },
  ]
  const rows = result.equations.filter((row) => Math.abs(row.heatMJh) > 1e-9)
  const exportRows: CopperBatchExportRow[] = rows.map((row, index) => ({
    label: String(index + 1),
    values: [
      String(index + 1),
      row.formula,
      phaseStorageKeyToDisplayLabel(row.limitingPhase),
      fmt(row.inputExtentKmolh),
      fmt(row.extentKmolh),
      fmt(row.reactionHeatKJmol),
      fmt(row.heatMJh),
    ],
  }))
  const releaseMJh = result.chemicalHeatReleaseMJh
  const absorptionMJh = result.chemicalHeatAbsorptionMJh
  const pathNetMJh = result.chemicalHeatPathMJh ?? releaseMJh - absorptionMJh
  const hessNetMJh = result.chemicalHeatHessMJh ?? result.chemicalHeatMJh
  const mode = result.chemicalHeatMode === 'reaction' ? 'reaction' : 'hess'
  const usesStream298 = result.chemicalHeatCalculationBasis === 'stream298'
  const summary = (label: string, value: number) => ({
    label,
    values: ['', '', '', '', '', label, fmt(value)],
  })
  exportRows.push(summary('放热合计', releaseMJh))
  exportRows.push(summary('吸热合计', absorptionMJh))
  if (usesStream298) {
    exportRows.push(summary('总表化学热（进出物流 298 K Σn×ΔH298）', hessNetMJh))
    exportRows.push(summary('反应方程明细净热（不计入总表）', pathNetMJh))
  } else if (mode === 'reaction') {
    exportRows.push(summary('总表化学热（化学反应）', pathNetMJh))
    exportRows.push(summary('对照：Hess', hessNetMJh))
  } else {
    exportRows.push(summary('总表化学热（Hess）', hessNetMJh))
    exportRows.push(summary('对照：反应路径净热', pathNetMJh))
  }
  return { title, columns, rows: exportRows }
}

type EnthalpyMatrixRow = {
  component: string
  kmolh: number
  enthalpy298MJh: number
  enthalpyTMJh: number
}

type EnthalpyMatrixGroup = {
  section: string
  rows: EnthalpyMatrixRow[]
  temperature: number | null
}

function buildEnthalpyMatrixGroups(rows: HeatComponentRow[]): EnthalpyMatrixGroup[] {
  const grouped = new Map<string, { rows: HeatComponentRow[]; orderIndex: number }>()
  rows.forEach((row, index) => {
    const existing = grouped.get(row.section)
    if (existing) {
      existing.rows.push(row)
    } else {
      grouped.set(row.section, { rows: [row], orderIndex: index })
    }
  })
  return [...grouped.entries()]
    .map(([section, group]) => ({
      section,
      temperature: group.rows[0]?.temperature ?? null,
      rows: group.rows.map((row) => ({
        component: row.component,
        kmolh: row.massTh,
        enthalpy298MJh: row.enthalpy25KJmol ?? 0,
        enthalpyTMJh: row.enthalpyTKJmol ?? 0,
      })),
    }))
    .sort((a, b) => a.section.localeCompare(b.section, 'zh-CN'))
}

function enthalpyKelvinLabel(temperature: number | null): string {
  if (temperature == null || !Number.isFinite(temperature)) return 'T'
  return String(Math.round(temperature + 273.15))
}

function buildEnthalpySheet(title: string, rows: HeatComponentRow[]): CopperBatchWorkbookSheet {
  const groups = buildEnthalpyMatrixGroups(rows)
  const maxRowCount = Math.max(0, ...groups.map((group) => group.rows.length))
  const columns: CopperBatchExportColumn[] = [
    { header: '№', subHeader: '№' },
    ...groups.flatMap((group) => [
      { header: group.section, subHeader: '组分' },
      { header: group.section, subHeader: 'kmol/h' },
      { header: group.section, subHeader: 'ΔH298' },
      { header: group.section, subHeader: `ΔH${enthalpyKelvinLabel(group.temperature)}` },
    ]),
  ]
  const exportRows: CopperBatchExportRow[] = Array.from({ length: maxRowCount }).map((_, rowIndex) => ({
    label: String(rowIndex + 1),
    values: [
      String(rowIndex + 1),
      ...groups.flatMap((group) => {
        const row = group.rows[rowIndex]
        return row
          ? [
              phaseStorageKeyToDisplayLabel(row.component),
              fmt(row.kmolh),
              fmt(row.enthalpy298MJh),
              fmt(row.enthalpyTMJh),
            ]
          : ['', '', '', '']
      }),
    ],
  }))
  return { title, columns, rows: exportRows }
}

function buildHeatBalanceSummarySheet(title: string, result: CopperHeatBalanceResult): CopperBatchWorkbookSheet {
  const income = buildHeatFlowHalfSheet(`${title}-热收入`, result.heatIncomeRows, 'income')
  const expenditure = buildHeatFlowHalfSheet(`${title}-热支出`, result.heatExpenditureRows, 'expenditure')
  return {
    title,
    columns: income.columns,
    rows: [
      ...income.rows.map((row) => ({ ...row, label: row.label === '合计' ? '收入合计' : row.label })),
      { label: '', values: income.columns.map(() => '') },
      ...expenditure.rows.map((row) => ({ ...row, label: row.label === '合计' ? '支出合计' : row.label })),
    ],
  }
}

/** 导出热平衡 UI 对应的五张表 */
export function buildHeatBalanceExportSheets(result: CopperHeatBalanceResult): CopperBatchWorkbookSheet[] {
  return [
    buildHeatBalanceSummarySheet('热量平衡总表', result),
    buildComponentPhysicalHeatSheet('热收入-投入组分物理热', result.inputPhysicalRows),
    buildReactionHeatSheet('化学反应热', result),
    buildEnthalpySheet('热收入-投入组分热焓', result.inputPhysicalRows),
    buildEnthalpySheet('热支出-产物组分热焓', result.outputPhysicalRows),
  ]
}
