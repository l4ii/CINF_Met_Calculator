import type { AntimonyBatchExportColumn, AntimonyBatchExportRow, AntimonyBatchWorkbookSheet } from './antimonyBatchExport.ts'
import { formatBatchTableFull } from './batchTableNumeric.ts'
import { phaseStorageKeyToDisplayLabel } from './antimonyPhaseTableCalc.ts'
import {
  antimonyHeatPhaseMolarMass,
  type AntimonyHeatBalanceResult,
  type HeatComponentRow,
  type HeatFlowRow,
} from './antimonyHeatBalance.ts'

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

function buildHeatFlowHalfSheet(
  title: string,
  rows: HeatFlowRow[],
  side: 'income' | 'expenditure'
): AntimonyBatchWorkbookSheet {
  const columns: AntimonyBatchExportColumn[] = [
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
  let sequence = 0
  const exportRows: AntimonyBatchExportRow[] = displayRows.map((row) => {
    const isError = row.isBalanceError || row.material === '误差'
    const heatForPercent = isError ? row.heatMJh : Math.max(0, row.heatMJh)
    const percent = total !== 0 ? (heatForPercent / Math.abs(total)) * 100 : 0
    if (!row.isSubtotal) sequence += 1
    return {
      label: row.isSubtotal ? '小计' : String(sequence),
      values: [
        heatTypeLabel(row.type),
        row.material,
        row.temperature != null ? fmt(row.temperature) : '',
        fmt(row.heatMJh),
        fmt(percent),
      ],
      role: row.isSubtotal ? 'total' : 'data',
    }
  })
  exportRows.push({
    label: '合计',
    values: ['', '', '', fmt(total), '100'],
    role: 'total',
  })
  return {
    title,
    columns,
    rows: exportRows,
    rowHeaderLabel: '序号',
    columnWidthWeights: [0.6, 1.1, 2.4, 0.85, 1.05, 0.75],
  }
}

type ComponentHeatGroup = {
  section: string
  rows: Array<{ component: string; heatMJh: number; orderIndex: number }>
  total: number
  orderIndex: number
}

const COMPONENT_HEAT_EPSILON = 1e-9

function normalizeComponentHeatSection(section: string, side: 'input' | 'output') {
  const name = section.trim() || '未命名'
  if (side !== 'input') return name
  if (name.endsWith('含水') && name.length > '含水'.length) return name.slice(0, -'含水'.length)
  if (name.includes('燃料煤') || name.includes('热平衡煤') || name === '煤') return '煤'
  return name
}

function inputComponentHeatPriority(section: string) {
  if (section.includes('石英') || section.includes('熔剂') || section.includes('石灰') || section.includes('硅石')) return 1
  if (section.includes('煤') || section.includes('燃料') || section.includes('焦')) return 2
  if (
    section.includes('空气') ||
    section.includes('氧气') ||
    section.includes('富氧') ||
    section.includes('风') ||
    section.includes('天然气') ||
    section.includes('煤气') ||
    section.includes('氮气') ||
    section.includes('蒸汽')
  ) return 3
  if (section.includes('冷却水')) return 4
  return 0
}

function outputComponentHeatPriority(section: string) {
  if (section.includes('熔炼渣') || section.includes('吹炼渣') || (section.includes('渣') && !section.includes('烟'))) return 0
  if (section.includes('锑锍') || section.includes('粗锑') || section.includes('金属锑')) return 1
  if (section.includes('烟气') && !section.includes('尘') && !section.includes('无组织')) return 2
  if (section.includes('烟气含尘') || (section.includes('尘') && section.includes('烟'))) return 3
  if (section.includes('无组织')) return 4
  if (section.includes('损失')) return 5
  return 6
}

function buildComponentHeatGroups(
  rows: HeatComponentRow[],
  side: 'input' | 'output'
): ComponentHeatGroup[] {
  const grouped = new Map<
    string,
    { components: Map<string, { component: string; heatMJh: number; orderIndex: number }>; orderIndex: number }
  >()
  rows.forEach((row, index) => {
    const keepZeroFugitive =
      side === 'output' && (row.productKey === 'fugitive' || row.section.includes('无组织排放'))
    if (row.massTh <= 0 && Math.abs(row.heatMJh) <= COMPONENT_HEAT_EPSILON && !keepZeroFugitive) return
    const section = normalizeComponentHeatSection(row.section, side)
    const group = grouped.get(section) ?? { components: new Map(), orderIndex: index }
    const current = group.components.get(row.component) ?? {
      component: row.component,
      heatMJh: 0,
      orderIndex: index,
    }
    current.heatMJh += row.heatMJh
    group.components.set(row.component, current)
    grouped.set(section, group)
  })
  return [...grouped.entries()]
    .map(([section, group]) => ({
      section,
      rows: [...group.components.values()].sort((a, b) => a.orderIndex - b.orderIndex),
      total: [...group.components.values()].reduce((sum, row) => sum + row.heatMJh, 0),
      orderIndex: group.orderIndex,
    }))
    .sort((a, b) => {
      const priorityA = side === 'input' ? inputComponentHeatPriority(a.section) : outputComponentHeatPriority(a.section)
      const priorityB = side === 'input' ? inputComponentHeatPriority(b.section) : outputComponentHeatPriority(b.section)
      return priorityA - priorityB || a.orderIndex - b.orderIndex
    })
}

function buildComponentPhysicalHeatSheet(
  title: string,
  rows: HeatComponentRow[],
  side: 'input' | 'output'
): AntimonyBatchWorkbookSheet {
  const groups = buildComponentHeatGroups(rows, side)
  const maxRowCount = Math.max(0, ...groups.map((group) => group.rows.length))
  const columns: AntimonyBatchExportColumn[] = [
    ...groups.flatMap((group) => [
      { header: group.section, subHeader: '组分' },
      { header: group.section, subHeader: 'MJ/h' },
    ]),
  ]
  const exportRows: AntimonyBatchExportRow[] = Array.from({ length: maxRowCount }).map((_, rowIndex) => ({
    label: String(rowIndex + 1),
    values: [
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
      ...groups.flatMap((group) => ['合计', fmt(group.total)]),
    ],
    role: 'total',
  })
  exportRows.push({
    label: '总计',
    values: [
      ...groups.flatMap((_, index) =>
        index === groups.length - 1 ? ['', fmt(grandTotal)] : ['', '']
      ),
    ],
    role: 'total',
  })
  return {
    title,
    columns,
    rows: exportRows,
    unitNote: '热量 MJ/h',
    rowHeaderLabel: '序号',
    columnWidthWeights: [0.55, ...groups.flatMap(() => [1.25, 0.9])],
    reportDensity: maxRowCount > 24 || groups.length > 4 ? 'compact' : 'normal',
  }
}

function buildReactionHeatSheet(title: string, result: AntimonyHeatBalanceResult): AntimonyBatchWorkbookSheet {
  const columns: AntimonyBatchExportColumn[] = [
    { header: '反应', subHeader: '反应' },
    { header: '基准相', subHeader: '基准相' },
    { header: '入炉量 kmol/h', subHeader: '入炉量 kmol/h' },
    { header: '实际反应 kmol/h', subHeader: '实际反应 kmol/h' },
    { header: 'kJ/mol', subHeader: 'kJ/mol' },
    { header: '热量 MJ/h', subHeader: '热量 MJ/h' },
  ]
  const rows = result.equations.filter((row) => Math.abs(row.heatMJh) > 1e-9)
  const exportRows: AntimonyBatchExportRow[] = rows.map((row, index) => ({
    label: String(index + 1),
    values: [
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
    values: ['', '', '', '', label, fmt(value)],
    role: 'total' as const,
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
  return {
    title,
    columns,
    rows: exportRows,
    unitNote: '物质的量 kmol/h；摩尔反应热 kJ/mol；热量 MJ/h',
    rowHeaderLabel: '序号',
    columnWidthWeights: [0.55, 2.8, 1.2, 1.1, 1.1, 0.95, 1.05],
    reportDensity: exportRows.length > 24 ? 'compact' : 'normal',
  }
}

type EnthalpyMatrixRow = {
  component: string
  kmolh: number
  enthalpy298KJmol: number | null
  enthalpyTKJmol: number | null
  enthalpy298MJh: number
  enthalpyTMJh: number
  orderIndex: number
}

type EnthalpyMatrixGroup = {
  section: string
  rows: EnthalpyMatrixRow[]
  temperature: number | null
  total298MJh: number
  totalTMJh: number
  orderIndex: number
}

type EnthalpySide = 'input' | 'output'

function normalizeEnthalpySection(section: string, side: EnthalpySide) {
  let name = section.trim() || '未命名'
  if (side !== 'input') return name
  if (name.endsWith('含水') && name.length > '含水'.length) name = name.slice(0, -'含水'.length)
  if (name.includes('燃料煤') || name.includes('热平衡煤') || name === '煤') return '煤'
  return name
}

function inputEnthalpySectionPriority(section: string) {
  if (
    section.includes('石英') ||
    section.includes('熔剂') ||
    section.includes('石灰') ||
    section.includes('硅石')
  ) return 1
  if (section.includes('煤') || section.includes('燃料') || section.includes('焦')) return 2
  if (
    section.includes('空气') ||
    section.includes('氧气') ||
    section.includes('富氧') ||
    section.includes('风') ||
    section.includes('天然气') ||
    section.includes('煤气') ||
    section.includes('氮气') ||
    section.includes('蒸汽')
  ) return 3
  if (section.includes('冷却水')) return 4
  return 0
}

function buildEnthalpyMatrixGroups(rows: HeatComponentRow[], side: EnthalpySide): EnthalpyMatrixGroup[] {
  const grouped = new Map<
    string,
    { components: Map<string, EnthalpyMatrixRow>; temperature: number | null; orderIndex: number }
  >()
  rows.forEach((row, index) => {
    const keepZeroFugitive =
      side === 'output' && (row.productKey === 'fugitive' || row.section.includes('无组织排放'))
    if (row.massTh <= 0 && Math.abs(row.heatMJh) <= COMPONENT_HEAT_EPSILON && !keepZeroFugitive) return
    const section = normalizeEnthalpySection(row.section, side)
    const group = grouped.get(section) ?? {
      components: new Map<string, EnthalpyMatrixRow>(),
      temperature: row.temperature,
      orderIndex: index,
    }
    if (group.temperature == null) group.temperature = row.temperature
    const molarMass = antimonyHeatPhaseMolarMass(row.component)
    const current = group.components.get(row.component) ?? {
      component: row.component,
      kmolh: 0,
      enthalpy298KJmol: row.enthalpy25KJmol,
      enthalpyTKJmol: row.enthalpyTKJmol,
      enthalpy298MJh: 0,
      enthalpyTMJh: 0,
      orderIndex: index,
    }
    const kmolh = molarMass > 0 ? (row.massTh * 1000) / molarMass : 0
    current.kmolh += kmolh
    if (current.enthalpy298KJmol == null && row.enthalpy25KJmol != null) {
      current.enthalpy298KJmol = row.enthalpy25KJmol
    }
    if (current.enthalpyTKJmol == null && row.enthalpyTKJmol != null) {
      current.enthalpyTKJmol = row.enthalpyTKJmol
    }
    current.enthalpy298MJh += row.enthalpy25KJmol == null ? 0 : kmolh * row.enthalpy25KJmol
    current.enthalpyTMJh += row.enthalpyTKJmol == null ? 0 : kmolh * row.enthalpyTKJmol
    group.components.set(row.component, current)
    grouped.set(section, group)
  })
  return [...grouped.entries()]
    .map(([section, group]) => ({
      section,
      temperature: group.temperature,
      rows: [...group.components.values()].sort((a, b) => a.orderIndex - b.orderIndex),
      total298MJh: [...group.components.values()].reduce((sum, row) => sum + row.enthalpy298MJh, 0),
      totalTMJh: [...group.components.values()].reduce((sum, row) => sum + row.enthalpyTMJh, 0),
      orderIndex: group.orderIndex,
    }))
    .sort((a, b) => {
      if (side === 'output') return a.orderIndex - b.orderIndex
      return inputEnthalpySectionPriority(a.section) - inputEnthalpySectionPriority(b.section)
        || a.orderIndex - b.orderIndex
    })
}

function enthalpyKelvinLabel(temperature: number | null): string {
  if (temperature == null || !Number.isFinite(temperature)) return 'T'
  return String(Math.round(temperature + 273.15))
}

function buildEnthalpySheet(title: string, rows: HeatComponentRow[], side: EnthalpySide): AntimonyBatchWorkbookSheet {
  const groups = buildEnthalpyMatrixGroups(rows, side)
  const maxRowCount = Math.max(0, ...groups.map((group) => group.rows.length))
  const columns: AntimonyBatchExportColumn[] = [
    ...groups.flatMap((group) => [
      { header: group.section, subHeader: '组分' },
      { header: group.section, subHeader: 'kmol/h' },
      { header: group.section, subHeader: 'n×ΔH298 (MJ/h)' },
      { header: group.section, subHeader: `n×ΔH${enthalpyKelvinLabel(group.temperature)} (MJ/h)` },
    ]),
  ]
  const exportRows: AntimonyBatchExportRow[] = Array.from({ length: maxRowCount }).map((_, rowIndex) => ({
    label: String(rowIndex + 1),
    values: [
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
  const total298MJh = groups.reduce((sum, group) => sum + group.total298MJh, 0)
  const totalTMJh = groups.reduce((sum, group) => sum + group.totalTMJh, 0)
  exportRows.push({
    label: '合计（各物料）',
    values: groups.flatMap((group) => ['', '', fmt(group.total298MJh), fmt(group.totalTMJh)]),
    role: 'total',
  })
  exportRows.push({
    label: '总计',
    values: groups.flatMap((_, index) =>
      index === groups.length - 1 ? ['', '', fmt(total298MJh), fmt(totalTMJh)] : ['', '', '', '']
    ),
    role: 'total',
  })
  exportRows.push({
    label: side === 'output' ? '产物物理热总计（Σn×ΔHT − Σn×ΔH298）' : '投入物理热总计（Σn×ΔHT）',
    values: groups.flatMap((_, index) =>
      index === groups.length - 1
        ? ['', '', '', fmt(side === 'output' ? totalTMJh - total298MJh : totalTMJh)]
        : ['', '', '', '']
    ),
    role: 'total',
  })
  return {
    title,
    columns,
    rows: exportRows,
    unitNote: '物质的量 kmol/h；n×摩尔焓 MJ/h',
    rowHeaderLabel: '序号',
    columnWidthWeights: [0.55, ...groups.flatMap(() => [1.2, 0.8, 0.9, 0.9])],
    reportDensity: maxRowCount > 24 || groups.length > 3 ? 'compact' : 'normal',
  }
}

function buildHeatBalanceSummarySheet(title: string, result: AntimonyHeatBalanceResult): AntimonyBatchWorkbookSheet {
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
    unitNote: '温度 ℃；热量 MJ/h；占比 %',
    rowHeaderLabel: '序号',
    columnWidthWeights: income.columnWidthWeights,
    reportDensity: 'compact',
    reportLayout: 'heatBalanceSummary',
    reportSections: [
      { title: '热收入', columns: income.columns, rows: income.rows, tone: 'income' },
      { title: '热支出', columns: expenditure.columns, rows: expenditure.rows, tone: 'expenditure' },
    ],
  }
}

/** 导出热平衡 UI 对应的明细表 */
export function buildHeatBalanceExportSheets(result: AntimonyHeatBalanceResult): AntimonyBatchWorkbookSheet[] {
  return [
    buildHeatBalanceSummarySheet('热量平衡总表', result),
    buildComponentPhysicalHeatSheet('热收入-投入组分物理热', result.inputPhysicalRows, 'input'),
    buildComponentPhysicalHeatSheet('热支出-产物组分物理热', result.outputPhysicalRows, 'output'),
    buildReactionHeatSheet('化学反应热', result),
    buildEnthalpySheet('热收入-投入组分热焓', result.inputPhysicalRows, 'input'),
    buildEnthalpySheet('热支出-产物组分热焓', result.outputPhysicalRows, 'output'),
  ]
}
