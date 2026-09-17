import ExcelJS from 'exceljs'
import type { EquipmentBomItem } from './copperEquipmentBom.ts'
import type { AnnualCostRow, AnnualMaterialCostResult } from './copperProjectCost.ts'
import {
  calculateProjectCost, compareCostScenario, parseCostNumber,
  type CalculatedCostRow, type CostLine, type ProjectCostWorkbookState,
} from './projectCostWorkbook.ts'

export type ProjectCostExcelInput = {
  caseName: string
  stageLabel: string
  bomItems: EquipmentBomItem[]
  state: ProjectCostWorkbookState
  result: AnnualMaterialCostResult
}

const MONEY = '#,##0.00;[Red](#,##0.00);0.00'
const INPUT_BLUE = 'FF2563EB'
const rounded = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100
const ref = (sheet: ExcelJS.Worksheet, address: string) => `'${sheet.name.replace(/'/g, "''")}'!${address}`
const formula = (cell: ExcelJS.Cell, expression: string, result: number | string | null) => {
  cell.value = { formula: expression, result: result == null || (typeof result === 'number' && !Number.isFinite(result)) ? '' : result }
}
function input(cell: ExcelJS.Cell, value: unknown) {
  const text = value == null ? '' : String(value)
  cell.value = !text.trim() ? null : Number.isFinite(Number(text)) ? Number(text) : text
  cell.font = { color: { argb: INPUT_BLUE } }
  cell.dataValidation = { type: 'decimal', operator: 'greaterThanOrEqual', formulae: [0], allowBlank: true,
    showErrorMessage: true, errorTitle: '请输入非负数', error: '留空表示未填写，0 表示已确认零值。' }
}
function listInput(cell: ExcelJS.Cell, value: string, options: string[]) {
  cell.value = value
  cell.font = { color: { argb: INPUT_BLUE } }
  cell.dataValidation = { type: 'list', formulae: [`"${options.join(',')}"`], showErrorMessage: true }
}
const validPair = (quantity: string, price: string) => `AND(ISNUMBER(${quantity}),ISNUMBER(${price}),${quantity}>=0,${price}>=0)`
function lineFormulas(row: ExcelJS.Row, quantity: string, price: string, amount: string, status: string,
  calculated: Pick<CalculatedCostRow, 'amount' | 'errors' | 'incomplete'>, scope?: string) {
  const condition = validPair(quantity, price)
  const calculation = `IFERROR(IF(${condition},ROUND(${quantity}*${price},2),""),"")`
  formula(row.getCell(amount), scope ? `IF(${scope}<>"计入",0,${calculation})` : calculation, calculated.amount)
  const label = `IF(OR(${quantity}="",${price}=""),"待补充",IF(AND(${condition},ISNUMBER(${row.getCell(amount).address})),"已计价","无效"))`
  formula(row.getCell(status), scope ? `IF(${scope}<>"计入","不计入",${label})` : label,
    scope && row.getCell(scope.replace(/\d+$/, '')).value !== '计入' ? '不计入' : calculated.errors.length ? '无效' : calculated.incomplete ? '待补充' : '已计价')
}

type SectionCells = { total: string; pending: string; totalValue: number; pendingCount: number }
function sectionTotals(sheet: ExcelJS.Worksheet, count: number, amountColumn: string, statusColumn: string,
  totalValue: number, pendingCount: number): SectionCells {
  const last = count + 4
  const total = sheet.getRow(last + 1)
  total.getCell(1).value = '已计价小计'
  formula(total.getCell(amountColumn), count ? `ROUND(SUM(${amountColumn}5:${amountColumn}${last}),2)` : '0', totalValue)
  const pending = sheet.getRow(last + 2)
  pending.getCell(1).value = '待补充或无效行数'
  formula(pending.getCell(amountColumn), count ? `COUNTIF(${statusColumn}5:${statusColumn}${last},"待补充")+COUNTIF(${statusColumn}5:${statusColumn}${last},"无效")` : '0', pendingCount)
  return { total: ref(sheet, total.getCell(amountColumn).address), pending: ref(sheet, pending.getCell(amountColumn).address), totalValue, pendingCount }
}

/** All formulas retain their current results; Excel recalculates editable assumptions on opening. */
export async function buildProjectCostExcelWorkbook({ caseName, stageLabel, bomItems, state, result }: ProjectCostExcelInput): Promise<ExcelJS.Workbook> {
  const costs = calculateProjectCost(bomItems, state, result)
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'CINF Met Calculator'
  workbook.created = new Date()
  workbook.calcProperties.fullCalcOnLoad = true
  const createSheet = (name: string, headers: string[], widths: number[], note: string) => {
    const sheet = workbook.addWorksheet(name, { properties: { defaultRowHeight: 24 },
      pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 } })
    sheet.views = [{ state: 'frozen', ySplit: 4, showGridLines: false }]
    sheet.mergeCells(1, 1, 1, headers.length)
    sheet.getCell('A1').value = name
    sheet.getCell('A2').value = `案例：${caseName}　工序：${stageLabel}`
    sheet.mergeCells(3, 1, 3, headers.length)
    sheet.getCell('A3').value = note
    sheet.getRow(3).height = 40
    sheet.getRow(4).values = headers
    sheet.getRow(4).height = 32
    widths.forEach((width, index) => { sheet.getColumn(index + 1).width = width })
    sheet.pageSetup.printTitlesRow = '1:4'
    return sheet
  }
  const summary = createSheet('费用汇总', ['项目', '数值', '单位', '计算口径'], [42, 23, 14, 82],
    '人民币；金额明细为元，汇总为万元。蓝字为可编辑输入；空白表示未填写，0 表示明确零值。建设投入与年度运行费用分别核算。')
  const equipment = createSheet('BOM设备', ['设备编码', '系统', '设备名称', '规格参数', '数量', '单位', '单价（元）', '是否计价', '金额（元）', '计价状态', '材质', '来源', '范围与备注'],
    [24, 18, 26, 38, 12, 9, 18, 12, 19, 14, 20, 20, 50], '成套已含部件及接口默认不计入；明确拆分采购时再调整计价范围，避免重复计价。')
  costs.equipmentRows.forEach((item, index) => {
    const number = index + 5
    const row = equipment.getRow(number)
    const draft = state.equipment[item.id] ?? {}
    row.values = [item.id, item.group ?? '', item.name, item.specification, null, item.unit, null, null, null, null,
      item.material, item.source ?? '', [item.pricingMode === 'included' ? '含在炉体报价' : item.pricingMode === 'interface' ? '接口预留' : '', item.note, ...item.errors].filter(Boolean).join('；')]
    input(row.getCell(5), draft.quantity ?? item.quantity)
    input(row.getCell(7), draft.unitPrice)
    listInput(row.getCell(8), item.included ? '计入' : '不计入', ['计入', '不计入'])
    lineFormulas(row, `E${number}`, `G${number}`, 'I', 'J', item, `H${number}`)
  })
  const equipmentCells = sectionTotals(equipment, costs.equipmentRows.length, 'I', 'J', costs.equipmentTotal, costs.sections.equipment.incompleteRows.length)
  const linesSheet = (name: string, drafts: CostLine[], rows: CalculatedCostRow[], total: number, annual = false) => {
    const sheet = createSheet(name, ['编码', '项目名称', '单位', annual ? '年用量' : '工程量', '单价（元）', annual ? '年费用（元）' : '金额（元）', '计价状态', '报价来源与备注'],
      [26, 30, 12, 18, 18, 22, 14, 65], annual ? '仅填写未包含在生产原料表中的公辅年用量，避免重复计费。' : '数量与报价需采用一致单位及税口径；未填单价保留为空，汇总只列已计价金额。')
    rows.forEach((item, index) => {
      const number = index + 5
      const row = sheet.getRow(number)
      row.values = [item.id, item.name, item.unit, null, null, null, null, [item.note, ...item.errors].filter(Boolean).join('；')]
      input(row.getCell(4), drafts[index].quantity)
      input(row.getCell(5), drafts[index].unitPrice)
      lineFormulas(row, `D${number}`, `E${number}`, 'F', 'G', item)
    })
    return sectionTotals(sheet, rows.length, 'F', 'G', total, rows.filter(row => row.incomplete).length)
  }
  const construction = linesSheet('建设材料', state.construction, costs.constructionRows, costs.constructionTotal)
  const installation = linesSheet('安装工程', state.installation, costs.installationRows, costs.installationTotal)
  const other = linesSheet('其他费用', state.other, costs.otherRows, costs.otherTotal)
  const annualSheet = (name: string, rows: AnnualCostRow[]) => {
    const sheet = createSheet(name, ['物料编码', '类别', '物料名称', '小时用量', '年用量', '单价', '单价单位', '年金额（元）', '计价状态', '价格来源'],
      [25, 15, 29, 17, 21, 20, 13, 24, 15, 28], '年用量＝小时用量×费用汇总中的年运行小时；单价单位决定数量单位。产出货值不是利润，缺价不视为零价。')
    let total = 0
    let pending = 0
    rows.forEach((item, index) => {
      const number = index + 5
      const row = sheet.getRow(number)
      const known = item.priceSource !== 'missing' && parseCostNumber(item.unitPrice) != null && parseCostNumber(item.hourlyWetTh) != null
        && parseCostNumber(item.annualCost) != null && parseCostNumber(item.annualTonnage) != null
      const amount = known ? item.annualCost : null
      row.values = [item.id, item.kindLabel, item.name, null, null, null, item.unitLabel, null, null,
        ({ override: '当前方案单价', material: '物料数据', catalog: '原有价格库参考', missing: '待补充价格' })[item.priceSource]]
      input(row.getCell(4), item.hourlyWetTh)
      input(row.getCell(6), item.priceSource === 'missing' ? state.priceOverrides?.[item.id] : item.unitPrice)
      formula(row.getCell(5), `IFERROR(IF(AND(ISNUMBER(D${number}),D${number}>=0,ISNUMBER('费用汇总'!$B$7)),D${number}*'费用汇总'!$B$7,""),"")`, item.annualTonnage)
      formula(row.getCell(8), `IFERROR(IF(${validPair(`E${number}`, `F${number}`)},E${number}*F${number},""),"")`, amount)
      formula(row.getCell(9), `IF(OR(D${number}="",F${number}=""),"待补充",IF(AND(${validPair(`E${number}`, `F${number}`)},ISNUMBER(H${number})),"已计价","无效"))`, known ? '已计价' : item.priceSource === 'missing' ? '待补充' : '无效')
      total += amount ?? 0
      if (!known) pending++
    })
    return sectionTotals(sheet, rows.length, 'H', 'I', rounded(total), pending)
  }
  const materials = annualSheet('生产原料', result.inputRows)
  const utilities = linesSheet('公辅能耗', state.utilities, costs.utilityRows, costs.utilitiesAnnualTotal, true)
  const outputs = annualSheet('产出货值', result.outputRows)
  const optimization = createSheet('原料优化', ['物料编码', '物料名称', '类别', '基准小时量', '候选小时量', '冻结单价（元）', '下限', '上限', '锁定', '基准年费用（元）', '候选年费用（元）', '费用差额（元）', '约束检查'],
    [25, 28, 13, 18, 18, 21, 14, 14, 10, 24, 24, 23, 36], '只比较冻结单价和年时基下的投入费用；总量一致也不代表元素、热量、炉容等工艺约束可行。此表不会回写生产配方。')
  if (state.baseline) {
    const comparison = compareCostScenario(state.baseline, state.scenario)
    optimization.getCell('A2').value = `基准：${state.baseline.capturedAt}`
    optimization.getCell('D2').value = '冻结年运行小时'
    optimization.getCell('E2').value = comparison.annualHours
    comparison.rows.forEach((item, index) => {
      const number = index + 5
      const row = optimization.getRow(number)
      const draft = state.scenario[item.id] ?? {}
      row.values = [item.id, item.name, item.kind, item.baselineQuantity, null, item.unitPrice]
      input(row.getCell(5), draft.quantity?.trim() ? draft.quantity : item.quantity)
      input(row.getCell(7), draft.min)
      input(row.getCell(8), draft.max)
      listInput(row.getCell(9), item.locked ? '是' : '否', ['是', '否'])
      formula(row.getCell(10), `ROUND(D${number}*F${number}*$E$2,2)`, item.baselineAnnualCost)
      formula(row.getCell(11), `IFERROR(IF(${validPair(`E${number}`, `F${number}`)},ROUND(E${number}*F${number}*$E$2,2),""),"")`, item.candidateAnnualCost)
      formula(row.getCell(12), `IF(ISNUMBER(K${number}),J${number}-K${number},"")`, item.candidateAnnualCost == null ? null : rounded(item.baselineAnnualCost - item.candidateAnnualCost))
      formula(row.getCell(13), `IFERROR(IF(AND(ISNUMBER(E${number}),E${number}>=0,OR(G${number}="",AND(ISNUMBER(G${number}),G${number}>=0,E${number}>=G${number})),OR(H${number}="",AND(ISNUMBER(H${number}),H${number}>=0,E${number}<=H${number})),OR(I${number}<>"是",E${number}=D${number})),"待工艺复核","无效"),"无效")`, item.errors.length ? '无效' : '待工艺复核')
    })
    const last = comparison.rows.length + 4
    const total = optimization.getRow(last + 1)
    total.getCell(1).value = '费用差额'
    formula(total.getCell(10), last >= 5 ? `ROUND(SUM(J5:J${last}),2)` : '0', comparison.baselineAnnualCost)
    formula(total.getCell(11), last >= 5 ? `IF(COUNT(K5:K${last})=${comparison.rows.length},ROUND(SUM(K5:K${last}),2),"")` : '0', comparison.candidateAnnualCost)
    formula(total.getCell(12), `IF(ISNUMBER(K${last + 1}),J${last + 1}-K${last + 1},"")`, comparison.saving)
    const flow = optimization.getRow(last + 2)
    flow.getCell(1).value = '小时总投入量'
    formula(flow.getCell(4), last >= 5 ? `SUM(D5:D${last})` : '0', comparison.baselineTotalFlow)
    formula(flow.getCell(5), last >= 5 ? `IF(COUNT(E5:E${last})=${comparison.rows.length},SUM(E5:E${last}),"")` : '0', comparison.candidateTotalFlow)
    formula(flow.getCell(13), `IF(AND(ISNUMBER(E${last + 2}),ABS(E${last + 2}-D${last + 2})<=MAX(0.000001,D${last + 2}*0.000001)),"总量一致，待工艺复核","总量不同，不能视为等产量节省")`, comparison.massConsistent ? '总量一致，待工艺复核' : '总量不同，不能视为等产量节省')
  } else optimization.getCell('A5').value = '未保存基准；请先在应用中保存基准，再编辑候选投入量。'

  const funding = createSheet('资金预备费', ['项目', '数值', '单位', '计算口径'], [40, 24, 13, 86],
    '本表金额为人民币元。预备费、建设期利息和流动资金独立列示；铺底比例为项目假设，历史参考值不代表当前报价。')
  const fundingRows = [
    ['基本预备费率', null, '%', '基数为设备、建设材料、安装和其他建设费用的已计价小计'],
    ['基本预备费', null, '元', '已计价基数×预备费率；范围未完整时为部分测算'],
    ['建设投资已计价小计', null, '元', '建设费用已计价小计＋已填写的基本预备费'],
    ['建设期利息', null, '元', '单独填写；不能同时重复列入其他建设费用'],
    ['流动资金', null, '元', '全额流动资金'],
    ['铺底流动资金比例', null, '%', '0–100%；不等同于全额流动资金'],
    ['铺底流动资金', null, '元', '全额流动资金×铺底比例'],
    ['项目总投资', null, '元', '完整建设投资＋建设期利息＋全额流动资金'],
    ['报批总投资', null, '元', '完整建设投资＋建设期利息＋铺底流动资金'],
    ['建设待补充或无效行数', null, '行', '建设范围不完整时，不输出完整总投资'],
    ['资金待补充或无效项数', null, '项', '明确零值有效；空白和无效输入均须补充'],
  ]
  fundingRows.forEach((values, index) => { funding.getRow(index + 5).values = values })
  input(funding.getCell('B5'), state.funding.reserveRate)
  input(funding.getCell('B8'), state.funding.constructionInterest)
  input(funding.getCell('B9'), state.funding.workingCapital)
  input(funding.getCell('B10'), state.funding.initialWorkingCapitalRate)
  funding.getCell('B10').dataValidation = { type: 'decimal', operator: 'between', formulae: [0, 100], allowBlank: true, showErrorMessage: true }
  const constructionSections = [equipmentCells, construction, installation, other]
  const capitalPending = constructionSections.reduce((sum, section) => sum + section.pendingCount, 0)
  const subtotalFormula = constructionSections.map(section => section.total).join('+')
  formula(funding.getCell('B6'), `IFERROR(IF(AND(ISNUMBER(B5),B5>=0),ROUND((${subtotalFormula})*B5/100,2),""),"")`, costs.reserveAmount)
  formula(funding.getCell('B7'), `ROUND(SUM(${constructionSections.map(section => section.total).join(',')},B6),2)`, costs.constructionInvestment)
  formula(funding.getCell('B11'), 'IFERROR(IF(AND(ISNUMBER(B9),B9>=0,ISNUMBER(B10),B10>=0,B10<=100),ROUND(B9*B10/100,2),""),"")', costs.initialWorkingCapital)
  formula(funding.getCell('B12'), 'IFERROR(IF(AND(B14=0,ISNUMBER(B6),ISNUMBER(B8),B8>=0,ISNUMBER(B9),B9>=0),ROUND(B7+B8+B9,2),""),"")', costs.projectTotalInvestment)
  formula(funding.getCell('B13'), 'IFERROR(IF(AND(B14=0,ISNUMBER(B6),ISNUMBER(B8),B8>=0,ISNUMBER(B11)),ROUND(B7+B8+B11,2),""),"")', costs.approvalTotalInvestment)
  formula(funding.getCell('B14'), constructionSections.map(section => section.pending).join('+'), capitalPending)
  formula(funding.getCell('B15'), 'IF(AND(ISNUMBER(B5),B5>=0),0,1)+IF(AND(ISNUMBER(B8),B8>=0),0,1)+IF(AND(ISNUMBER(B9),B9>=0),0,1)+IF(AND(ISNUMBER(B10),B10>=0,B10<=100),0,1)', costs.fundingIncompleteCount)

  const summaryLine = (number: number, label: string, expression: string, value: number | null, unit: string, note: string) => {
    summary.getRow(number).values = [label, null, unit, note]
    formula(summary.getCell(`B${number}`), expression, value)
  }
  summary.getRow(5).values = ['年处理天数', null, 'd/a', '当前工序时基，年用量引用本工作簿时基']
  summary.getRow(6).values = ['日运行小时', null, 'h/d', '当前年平衡时基']
  input(summary.getCell('B5'), result.annualDays)
  input(summary.getCell('B6'), result.hoursPerDay)
  summaryLine(7, '年运行小时', 'IFERROR(IF(AND(ISNUMBER(B5),B5>=0,ISNUMBER(B6),B6>=0),B5*B6,""),"")', result.annualHours, 'h/a', '年处理天数×日运行小时')
  const monetary = (number: number, label: string, expression: string, value: number | null, annual = false, note = '已计价金额；缺项见下方统计') =>
    summaryLine(number, label, `IF(AND(ISNUMBER(${expression}),${expression}>=0),(${expression})/10000,"")`, value == null ? null : value / 10000, annual ? '万元/a' : '万元', note)
  monetary(9, '设备购置已计价小计', equipmentCells.total, costs.equipmentTotal)
  monetary(10, '建设材料已计价小计', construction.total, costs.constructionTotal)
  monetary(11, '安装工程已计价小计', installation.total, costs.installationTotal)
  monetary(12, '其他建设费用已计价小计', other.total, costs.otherTotal)
  summaryLine(13, '建设费用已计价小计', 'SUM(B9:B12)', costs.constructionSubtotal / 10000, '万元', '设备＋建设材料＋安装＋其他；不含预备费与资金项')
  monetary(14, '基本预备费', "'资金预备费'!B6", costs.reserveAmount)
  monetary(15, '建设投资已计价小计', "'资金预备费'!B7", costs.constructionInvestment)
  monetary(16, '建设期利息', "'资金预备费'!B8", costs.constructionInterest)
  monetary(17, '流动资金', "'资金预备费'!B9", costs.workingCapital)
  monetary(18, '铺底流动资金', "'资金预备费'!B11", costs.initialWorkingCapital)
  monetary(19, '项目总投资', "'资金预备费'!B12", costs.projectTotalInvestment, false, '建设或资金必要数据缺失时留空')
  monetary(20, '报批总投资', "'资金预备费'!B13", costs.approvalTotalInvestment, false, '建设或资金必要数据缺失时留空')
  monetary(21, '生产原料年费用已计价小计', materials.total, materials.totalValue, true)
  monetary(22, '公辅能耗年费用已计价小计', utilities.total, utilities.totalValue, true)
  summaryLine(23, '物料与公辅年费用已计价小计', 'SUM(B21:B22)', rounded(materials.totalValue + utilities.totalValue) / 10000, '万元/a', '未包含人工、折旧、维修等完整运营成本；不与建设投资相加')
  monetary(24, '产出年货值已计价小计', outputs.total, outputs.totalValue, true)
  const operatingPending = materials.pendingCount + utilities.pendingCount
  summaryLine(25, '产出货值与物料公辅费用差额', 'IF(AND(B27=0,B29=0),B24-B23,"")',
    operatingPending || outputs.pendingCount ? null : rounded(outputs.totalValue - materials.totalValue - utilities.totalValue) / 10000,
    '万元/a', '仅为本表费用范围的差额，不是利润')
  summaryLine(26, '建设待补充或无效行数', "'资金预备费'!B14", capitalPending, '行', '设备、建设材料、安装及其他建设费用')
  summaryLine(27, '运营待补充或无效行数', `${materials.pending}+${utilities.pending}`, operatingPending, '行', '生产原料与额外公辅')
  summaryLine(28, '资金待补充或无效项数', "'资金预备费'!B15", costs.fundingIncompleteCount, '项', '预备费率、利息、流动资金及铺底比例')
  summaryLine(29, '产出待补充或无效行数', outputs.pending, outputs.pendingCount, '行', '产出价格缺失时不计算费用差额')
  const notes = [
    '计价口径：明细金额统一为人民币元；请使用一致的税口径和报价日期。未知价格保持空白，历史文件价格未预填。',
    '参考：赤峰云铜初设（2017年5月）表26-3，印刷561–565页/PDF573–577页；表26-18，印刷586页/PDF598页起：设备供货范围及工程分表。',
    '参考：水口山铅冶炼系统提质增效报告（封面2020年12月；文件名合并本20220811.doc）第十四、十五章：建设、资金与增量运营成本分开。',
    '来源核验：原表存在数量×单价不等于合价、费率及分类口径不一致等情况；参考数据需复核，不作为当前项目报价或可行性结论。',
    '原料优化：基准单价和年运行小时冻结；候选只供费用比较，需另做物料、元素、热量、设备能力及环保约束复核。',
  ]
  notes.forEach((note, index) => {
    const number = index + 31
    summary.mergeCells(number, 1, number, 4)
    summary.getCell(`A${number}`).value = note
    summary.getRow(number).height = 44
  })
  for (const sheet of workbook.worksheets) {
    sheet.eachRow(row => row.eachCell({ includeEmpty: true }, cell => {
      cell.font = { name: '微软雅黑', size: 10, color: { argb: 'FF172033' }, ...cell.font }
      cell.alignment = { vertical: 'middle', wrapText: true }
      if (typeof cell.value === 'number' || cell.formula) cell.numFmt = MONEY
      if (row.number === 4) {
        cell.font = { ...cell.font, bold: true, color: { argb: 'FFFFFFFF' } }
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF24476B' } }
      } else if (row.number > 4 && row.number % 2 === 1) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } }
      }
    }))
    sheet.getCell('A1').font = { name: '微软雅黑', size: 17, bold: true, color: { argb: 'FF172033' } }
    sheet.getRow(1).height = 32
  }
  return workbook
}

export async function exportProjectCostWorkbookXlsx(input: ProjectCostExcelInput): Promise<void> {
  const workbook = await buildProjectCostExcelWorkbook(input)
  const buffer = await workbook.xlsx.writeBuffer()
  const bytes = new Uint8Array(buffer)
  const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${input.caseName || '案例'}-${input.stageLabel}-工程造价.xlsx`.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
  document.body.appendChild(anchor)
  try { anchor.click() } finally {
    anchor.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}
