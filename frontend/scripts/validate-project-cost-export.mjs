import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import ExcelJS from 'exceljs'
import { createProjectCostWorkbook, createCostBaseline } from '../src/utils/projectCostWorkbook.ts'

const moduleUrl = new URL('../src/utils/projectCostWorkbookXlsx.ts', import.meta.url)
assert.ok(existsSync(moduleUrl), 'Project costs need an Excel workbook with formulas and missing-price guards')
const { buildProjectCostExcelWorkbook } = await import(moduleUrl.href)

const item = (id, quantity, pricingMode = 'separate') => ({
  id, quantity, name: id, specification: '工艺参数', unit: '台', material: '钢', note: '', group: '炉体', pricingMode, source: '选型计算',
})
const bomItems = [item('furnace', 2), item('jacket', 100, 'included'), item('zero', 1), item('unknown', 1)]
const row = (id, hourlyWetTh, unitPrice, side = 'input') => ({
  id, name: id, side, kind: side === 'output' ? 'product' : 'raw', kindLabel: '原料', hourlyWetTh,
  annualTonnage: hourlyWetTh * 240, unitPrice, unitLabel: '元/t', annualCost: hourlyWetTh * 240 * unitPrice,
  sharePct: 0, priceSource: 'override',
})
const result = {
  inputRows: [row('raw', 2, 100), row('fuel', 0.5, 200)], outputRows: [row('product', 1, 400, 'output')],
  inputAnnualCost: 72000, outputAnnualValue: 96000, inputAnnualTonnage: 600, outputAnnualTonnage: 240,
  netAnnualValue: 24000, annualHours: 240, annualDays: 10, hoursPerDay: 24,
  productName: '铜', productHourlyTh: 1, productAnnualTonnage: 240, costPerProductTonne: 300,
}
const line = (id, quantity, unitPrice) => ({ id, name: id, unit: '项', quantity: String(quantity), unitPrice: String(unitPrice), note: '现询价' })
const state = createProjectCostWorkbook()
state.equipment = { furnace: { unitPrice: '100.25' }, jacket: { unitPrice: '80' }, zero: { unitPrice: '0' } }
state.construction = [line('foundation', 1.5, 40)]
state.installation = [line('install', 2, 15)]
state.other = [line('design', 1, 9.5)]
state.utilities = [line('power', 100, 0.5)]
state.funding = { reserveRate: '4', constructionInterest: '8', workingCapital: '100', initialWorkingCapitalRate: '30' }
state.baseline = createCostBaseline(result)
state.scenario = { raw: { quantity: '2.1', min: '2', max: '3' }, fuel: { quantity: '0.4', min: '0', max: '1' } }
const input = { caseName: '=1+1', stageLabel: '熔炼', bomItems, state, result }
const before = structuredClone(input)
async function roundTrip(value) {
  const workbook = await buildProjectCostExcelWorkbook(value)
  const loaded = new ExcelJS.Workbook()
  await loaded.xlsx.load(await workbook.xlsx.writeBuffer())
  return loaded
}
const workbook = await roundTrip(input)
assert.deepEqual(input, before, 'Export must not change quotes, snapshots, or result state')
assert.deepEqual(workbook.worksheets.map(sheet => sheet.name), [
  '费用汇总', 'BOM设备', '建设材料', '安装工程', '其他费用', '生产原料', '公辅能耗', '产出货值', '原料优化', '资金预备费',
])
const sheet = name => workbook.getWorksheet(name)
const findRow = (ws, name, column = 1) => {
  let found
  ws.eachRow(row => { if (row.getCell(column).value === name) found = row })
  assert.ok(found, `${ws.name} must contain ${name}`)
  return found
}
const value = cell => cell.formula ? cell.result : cell.value
const empty = cell => assert.ok(value(cell) == null || value(cell) === '', `${cell.address} must stay unpriced`)
const formula = (cell, expected) => {
  assert.ok(cell.formula, `${cell.address} must retain its calculation`)
  assert.equal(value(cell), expected, `${cell.address} must preserve its cached result`)
}
const equipment = sheet('BOM设备')
formula(findRow(equipment, 'furnace').getCell(9), 200.5)
formula(findRow(equipment, 'jacket').getCell(9), 0)
formula(findRow(equipment, 'zero').getCell(9), 0)
empty(findRow(equipment, 'unknown').getCell(7))
empty(findRow(equipment, 'unknown').getCell(9))
assert.match(findRow(equipment, 'unknown').getCell(9).formula, /ISNUMBER/, 'Blank quantities or prices must not multiply into zero')
assert.equal(findRow(equipment, 'furnace').getCell(7).font.color.argb, 'FF2563EB', 'Editable inputs are blue')
for (const name of ['BOM设备', '建设材料', '安装工程', '生产原料', '原料优化']) {
  assert.equal(sheet(name).views[0].state, 'frozen')
  assert.ok(sheet(name).views[0].ySplit >= 4)
}
const summary = sheet('费用汇总')
formula(findRow(summary, '年运行小时').getCell(2), 240)
formula(findRow(summary, '建设费用已计价小计').getCell(2), 0.03)
formula(findRow(summary, '建设投资已计价小计').getCell(2), 0.0312)
formula(findRow(summary, '物料与公辅年费用已计价小计').getCell(2), 7.205)
formula(findRow(summary, '产出货值与物料公辅费用差额').getCell(2), 2.395)
empty(findRow(summary, '项目总投资').getCell(2))
empty(findRow(summary, '报批总投资').getCell(2))
const annual = findRow(sheet('生产原料'), 'raw')
formula(annual.getCell(5), 480)
assert.match(annual.getCell(5).formula, /'费用汇总'!\$B\$7/, 'Annual quantities must link to this workbook’s hours')
formula(annual.getCell(8), 48000)
const candidate = findRow(sheet('原料优化'), 'raw')
formula(candidate.getCell(10), 48000)
formula(candidate.getCell(11), 50400)
formula(findRow(sheet('原料优化'), '费用差额').getCell(12), 2400)
assert.ok(sheet('原料优化').getCell('A3').text.includes('工艺'), 'Cost comparison must carry its feasibility limitation')

const completeInput = structuredClone(input)
completeInput.state.equipment.unknown = { unitPrice: '0' }
const complete = await roundTrip(completeInput)
formula(findRow(complete.getWorksheet('费用汇总'), '项目总投资').getCell(2), 0.042)
formula(findRow(complete.getWorksheet('费用汇总'), '报批总投资').getCell(2), 0.035)

const missingInput = structuredClone(completeInput)
missingInput.result.inputRows[0].priceSource = 'missing'
missingInput.result.inputRows[0].unitPrice = 0
missingInput.result.inputRows[0].annualCost = 0
missingInput.result.inputAnnualCost = 24000
missingInput.result.outputRows[0].priceSource = 'missing'
missingInput.result.outputRows[0].unitPrice = 0
missingInput.result.outputRows[0].annualCost = 0
missingInput.result.outputAnnualValue = 0
missingInput.state.baseline = undefined
missingInput.state.funding.reserveRate = ''
const missing = await roundTrip(missingInput)
empty(findRow(missing.getWorksheet('生产原料'), 'raw').getCell(6))
empty(findRow(missing.getWorksheet('生产原料'), 'raw').getCell(8))
empty(findRow(missing.getWorksheet('产出货值'), 'product').getCell(8))
empty(findRow(missing.getWorksheet('费用汇总'), '产出货值与物料公辅费用差额').getCell(2))
empty(findRow(missing.getWorksheet('资金预备费'), '基本预备费').getCell(2))
empty(findRow(missing.getWorksheet('费用汇总'), '项目总投资').getCell(2))
assert.ok(missing.getWorksheet('原料优化').getCell('A5').text.includes('未保存'), 'No baseline must not create invented scenario rows')

const invalidFundingInput = structuredClone(completeInput)
invalidFundingInput.state.funding.constructionInterest = '-1'
invalidFundingInput.state.funding.initialWorkingCapitalRate = '101'
const invalidFunding = await roundTrip(invalidFundingInput)
const invalidSummary = invalidFunding.getWorksheet('费用汇总')
empty(findRow(invalidSummary, '建设期利息').getCell(2))
assert.match(findRow(invalidSummary, '建设期利息').getCell(2).formula, />=0/, 'Recalculation must not turn invalid negative funding into a valid summary amount')
empty(findRow(invalidSummary, '项目总投资').getCell(2))
empty(findRow(invalidSummary, '报批总投资').getCell(2))

const overflowInput = structuredClone(completeInput)
overflowInput.state.equipment.furnace = { quantity: '1e200', unitPrice: '1e200' }
const overflow = await roundTrip(overflowInput)
const overflowRow = findRow(overflow.getWorksheet('BOM设备'), 'furnace')
empty(overflowRow.getCell(9))
assert.match(overflowRow.getCell(10).formula, /ISNUMBER\(I5\)/, 'A failed amount formula must remain an invalid row after recalculation')
empty(findRow(overflow.getWorksheet('费用汇总'), '项目总投资').getCell(2))

console.log('Project cost Excel export validation passed: formulas, financial scopes, cached totals, missing vs zero, and frozen scenario')
