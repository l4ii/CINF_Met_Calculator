import assert from 'node:assert/strict'
import { buildAnnualMaterialCost, resolveCostAnnualDays } from '../src/utils/copperProjectCost.ts'
import { createProjectCostWorkbook, normalizeProjectCostWorkbook, normalizeProjectCostWorkbooks,
  parseCostNumber, calculateProjectCost, createCostBaseline, compareCostScenario } from '../src/utils/projectCostWorkbook.ts'

// Blank amounts must remain unknown, while an explicit zero is a valid free quote.
assert.equal(parseCostNumber('  '), null)
assert.equal(parseCostNumber('0'), 0)
assert.equal(parseCostNumber('-1'), null)
assert.equal(parseCostNumber('Infinity'), null)
const state = createProjectCostWorkbook()
assert.ok(state.construction.length && state.installation.length && state.other.length && state.utilities.length)
assert.ok([...state.construction, ...state.installation, ...state.other, ...state.utilities]
  .every(row => row.quantity === '' && row.unitPrice === ''))
state.construction = [{ id: 'civil', name: '土建', unit: 'm³', quantity: '2.5', unitPrice: '100.125', note: '' }]
state.installation = [{ id: 'install', name: '安装', unit: '项', quantity: '1', unitPrice: '100', note: '' }]
state.other = [{ id: 'other', name: '设计', unit: '项', quantity: '1', unitPrice: '20', note: '' }]
state.utilities = [{ id: 'power', name: '电', unit: 'kWh', quantity: '100', unitPrice: '0.8', note: '' }]
state.equipment = { charged: { unitPrice: '12.345' }, free: { unitPrice: '0' },
  packaged: { unitPrice: '900', included: true }, excluded: { included: false } }
const bom = [
  { id: 'charged', name: '设备', specification: 'A', quantity: 2, unit: '台', material: '钢', note: '设计', pricingMode: 'separate' },
  { id: 'free', name: '免费备件', specification: '', quantity: 1, unit: '套', material: '', note: '' },
  { id: 'unknown', name: '询价中', specification: '', quantity: 1, unit: '台', material: '', note: '' },
  { id: 'packaged', name: '成套内件', specification: '', quantity: 1, unit: '套', material: '', note: '', pricingMode: 'included' },
  { id: 'interface', name: '接口', specification: '', quantity: 1, unit: '处', material: '', note: '', pricingMode: 'interface' },
  { id: 'excluded', name: '范围外', specification: '', quantity: 1, unit: '台', material: '', note: '' },
]
const annual = { inputRows: [
  { id: 'ore-a', name: '矿 A', kind: 'raw', hourlyWetTh: 2, unitPrice: 100, annualCost: 2000 },
  { id: 'ore-b', name: '矿 B', kind: 'raw', hourlyWetTh: 1, unitPrice: 50, annualCost: 500 },
], annualHours: 10, inputAnnualCost: 2500 }
const result = calculateProjectCost(bom, state, annual)
assert.equal(result.equipmentTotal, 24.69)
assert.equal(result.constructionTotal, 250.31)
assert.equal(result.constructionInvestment, 395)
assert.equal(result.utilitiesAnnualTotal, 80)
assert.equal(result.operatingAnnualCost, 2580, 'Annual operating costs must exclude construction investment')
assert.equal(result.missingPriceCount, 1)
assert.equal(result.invalidCount, 0)
assert.equal(result.equipmentRows.find(row => row.id === 'unknown').amount, null)
assert.equal(result.equipmentRows.find(row => row.id === 'free').amount, 0)
assert.equal(result.equipmentRows.find(row => row.id === 'packaged').included, false)
assert.equal(result.equipmentRows.find(row => row.id === 'interface').amount, 0)
assert.equal(result.equipmentRows.find(row => row.id === 'charged').specification, 'A')
assert.equal(result.reserveAmount, null)
assert.equal(result.projectTotalInvestment, null)
assert.equal(result.fundingIncompleteCount, 3)
// Funding is a separate layer; working capital and interest never enter construction fees.
state.equipment.unknown = { unitPrice: '0' }
state.funding = { reserveRate: '5', constructionInterest: '10', workingCapital: '100', initialWorkingCapitalRate: '30' }
const funded = calculateProjectCost(bom, state, annual)
assert.equal(funded.constructionSubtotal, 395)
assert.equal(funded.reserveAmount, 19.75)
assert.equal(funded.constructionInvestment, 414.75)
assert.equal(funded.initialWorkingCapital, 30)
assert.equal(funded.projectTotalInvestment, 524.75)
assert.equal(funded.approvalTotalInvestment, 454.75)
assert.equal(funded.otherTotal, 20)
assert.equal(funded.operatingAnnualCost, 2580)
state.funding.initialWorkingCapitalRate = '101'
assert.equal(calculateProjectCost(bom, state, annual).approvalTotalInvestment, null)
state.funding.initialWorkingCapitalRate = '30'
const overflowState = structuredClone(state)
overflowState.funding.reserveRate = '1e308'
const overflowFunding = calculateProjectCost(bom, overflowState, annual)
assert.equal(overflowFunding.reserveAmount, null)
assert.equal(overflowFunding.projectTotalInvestment, null)
assert.ok(overflowFunding.invalidCount > 0)

state.equipment.charged.quantity = '-2'
state.utilities[0].unitPrice = 'NaN'
const invalid = calculateProjectCost(bom, state, annual)
assert.equal(invalid.invalidCount, 2)
assert.equal(invalid.equipmentRows[0].amount, null)
assert.equal(invalid.sections.utilities.incompleteRows.length, 1)

// A frozen baseline must survive subsequent recalculation and editing.
const baseline = createCostBaseline(annual)
annual.inputRows[0].unitPrice = 1000
annual.annualHours = 20
assert.equal(baseline.rows[0].unitPrice, 100)
assert.equal(baseline.annualHours, 10)
const proposal = compareCostScenario(baseline, { 'ore-a': { quantity: '1' }, 'ore-b': { quantity: '2' } })
assert.equal(proposal.baselineAnnualCost, 2500)
assert.equal(proposal.candidateAnnualCost, 2000)
assert.equal(proposal.saving, 500)
assert.equal(proposal.savingPct, 20)
assert.equal(proposal.massConsistent, true)
assert.equal(proposal.valid, true)
assert.ok(proposal.warnings.length, 'A quantity-only screen must state that process feasibility is not established')
const locked = compareCostScenario(baseline, { 'ore-a': { quantity: '1', locked: true } })
assert.equal(locked.valid, false)
assert.ok(locked.rows[0].errors.length)
assert.equal(locked.massConsistent, false)
assert.equal(compareCostScenario(baseline, { 'ore-a': { quantity: '4', min: '5', max: '3' } }).valid, false)
assert.equal(compareCostScenario(baseline, { 'ore-a': { quantity: '1', min: '2' } }).valid, false)
assert.equal(compareCostScenario(baseline, { 'ore-a': { quantity: '-1' } }).candidateAnnualCost, null)
assert.equal(compareCostScenario({ capturedAt: baseline.capturedAt, annualHours: 10,
  rows: [{ id: 'zero', name: '免费', kind: 'raw', quantity: 0, unitPrice: 0 }] }, {}).savingPct, null)

// Imported JSON must never inject prototypes or retain malformed records.
const imported = normalizeProjectCostWorkbook(JSON.parse('{"equipment":{"__proto__":{"unitPrice":"9"},"safe":{"unitPrice":100,"included":"false"}},"construction":[null,{"id":"x","name":"土建","quantity":2,"unitPrice":"-1"}],"scenario":{"x":{"quantity":4,"locked":"true"}},"baseline":{"annualHours":-1,"rows":[]}}'))
assert.equal(Object.hasOwn(imported.equipment, '__proto__'), false)
assert.equal(imported.equipment.safe.unitPrice, '100')
assert.equal(imported.equipment.safe.included, undefined)
assert.equal(imported.construction.length, 1)
assert.equal(imported.construction[0].quantity, '2')
assert.equal(imported.scenario.x.locked, undefined)
assert.equal(imported.baseline, undefined)
assert.equal(imported.funding.workingCapital, '')
assert.equal(imported.funding.initialWorkingCapitalRate, '30')
assert.deepEqual(normalizeProjectCostWorkbooks([]), {})
assert.equal(Object.hasOwn(normalizeProjectCostWorkbooks(JSON.parse('{"__proto__":{},"case-1":{}}')), '__proto__'), false)

// Unknown/invalid quotes may not masquerade as free materials or mix kWh with tonnes.
const material = (id, name, unitPrice) => ({ id, name, kind: 'raw', weight: 2, waterWeight: 0,
  moisture: 0, ratios: {}, unitPrice })
const costParams = { rawMaterials: [material('unknown-ore', '未报价精矿', 0)], solventColumns: [],
  airColumns: [], fuelColumn: null, annualDays: 1 }
const missing = buildAnnualMaterialCost(costParams)
assert.equal(missing.inputRows[0].priceSource, 'missing')
assert.throws(() => createCostBaseline(missing), /单价|基准/)
assert.throws(() => createCostBaseline({ ...annual, annualHours: NaN }), /基准/)
assert.equal(calculateProjectCost([], createProjectCostWorkbook(), missing).missingMaterialPriceCount, 1)
assert.equal(buildAnnualMaterialCost({ ...costParams, priceOverrides: { 'unknown-ore': '0' } }).inputRows[0].priceSource, 'override')
assert.equal(buildAnnualMaterialCost({ ...costParams, priceOverrides: { 'unknown-ore': '-5' } }).inputRows[0].priceSource, 'missing')
assert.equal(buildAnnualMaterialCost({ ...costParams, priceOverrides: { 'unknown-ore': 'not-a-price' } }).inputRows[0].priceSource, 'missing')
const pricedParams = { ...costParams, rawMaterials: [material('known-ore', '测试精矿', 125)] }
assert.equal(buildAnnualMaterialCost({ ...pricedParams, priceOverrides: { 'known-ore': '' } }).inputAnnualCost, 6000)
assert.equal(buildAnnualMaterialCost({ ...costParams, rawMaterials: [material('power', '电', 0)] }).inputRows[0].priceSource, 'missing')
assert.equal(buildAnnualMaterialCost({ ...costParams, rawMaterials: [material('power', '电', 0)] }).inputRows[0].unitLabel, '元/t')
assert.ok(Number.isFinite(resolveCostAnnualDays('', NaN)))
assert.equal(resolveCostAnnualDays('9999', 300), 366)
assert.ok(Number.isFinite(buildAnnualMaterialCost({ ...pricedParams, annualDays: NaN, hoursPerDay: NaN }).inputAnnualCost))
console.log('Project cost workbook checks passed: quotes, exclusions, OPEX, scenarios and import normalization.')
