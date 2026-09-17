import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { normalizeEquipmentBomSnapshots } from '../src/utils/copperEquipmentBom.ts'
import { createProjectCostWorkbook, normalizeProjectCostWorkbooks } from '../src/utils/projectCostWorkbook.ts'

// Run the real page callbacks without mounting their unrelated metallurgy/3D UI.
// TypeScript's parser preserves complete callback bodies; this is a data round trip,
// not a check for particular source text or property spellings.
const fields = ['equipmentBomSnapshots', 'projectCostWorkbooks', 'materialPriceOverrides', 'costAnnualDays']
const pagePaths = ['shared/CopperOxySideBlowSession.tsx', 'smelting/SmeltingBatchCalcPage.tsx',
  'converting/ConvertingEquipmentPage.tsx', 'converting/ConvertingBatchCalcPage.tsx']
const parsePage = (path) => ts.createSourceFile(path,
  readFileSync(new URL(`../src/components/modules/copper/${path}`, import.meta.url), 'utf8'),
  ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
function findNode(page, name) {
  let found
  function visit(node) {
    if ((ts.isVariableDeclaration(node) || ts.isFunctionDeclaration(node)) && node.name?.getText(page) === name) found = node
    if (!found) ts.forEachChild(node, visit)
  }
  visit(page)
  assert.ok(found, `Page callback ${name} must be available`)
  return found
}
function evaluate(source, context) {
  const code = ts.transpileModule(`const extracted = ${source}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
  return new Function('scope', `with (scope) { ${code}; return extracted; }`)(context)
}
function callback(page, name, context) {
  const node = findNode(page, name)
  let expression = ts.isFunctionDeclaration(node) ? node : node.initializer
  if (ts.isCallExpression(expression) && expression.expression.getText(page) === 'useCallback') expression = expression.arguments[0]
  return evaluate(expression.getText(page).replace(/^export\s+/, ''), context)
}
const processState = { rawMaterials: [], solventColumns: [], airColumns: [], fuelColumn: {},
  customPhaseRows: {}, materialPhaseRows: {}, phaseAssistTabMaterialIds: [] }
function scopeFor(record) {
  const state = { initialActiveCaseRecord: record,
    normalizeEquipmentBomSnapshots, normalizeProjectCostWorkbooks,
    METCAL_COPPER_CASE_FILE_TYPE: 'metcal-copper-case', DEFAULT_COPPER_FUEL: {}, DEFAULT_OTHER_HEAT_MJH_TEXT: '0',
    COPPER_PROCESS_STAGE_IDS: ['cu_smelting', 'cu_converting', 'cu_refining'], activeSheet: 'cu_smelting',
    normalizedSmeltMethodId: 'oxy-side-blow', smeltMethodName: '富氧侧吹',
    processStagesCacheRef: { current: { cu_smelting: processState } }, loadedProcessStageIdRef: { current: 'cu_smelting' },
    smeltingDesign: { furnaceLengthM: 12, furnaceWidthM: 2.2, jacketCountTotal: 40, jacketCountOneSide: 20 },
    convertingDesign: { furnaceLengthM: 8, furnaceWidthM: 2.2, jacketCountTotal: 24, jacketCountOneSide: 12 },
    processStageIdForSheet: () => 'cu_smelting', isCopperCaseStageId: () => true,
    persistCurrentStageToCache: () => {}, createBlankProcessStageState: () => structuredClone(processState),
    createProcessStageStateForId: () => structuredClone(processState),
    applyProcessStageStateToUi: async () => {}, copperStageUnlockBlockReason: () => null,
    pendingMarkCaseCleanRef: { current: false }, cleanCaseFingerprintRef: { current: null }, onStageSelect: () => {},
    captureCurrentProcessStageState: () => structuredClone(processState), createCopperCaseId: () => 'imported-case',
    createDefaultSolventColumns: () => [], createOxygenAirColumn: () => ({}), createDefaultProductConstraintConfig: () => ({}),
    normalizeProcessAirColumns: (rows) => rows ?? [], normalizeOxygenAirText: () => ({ oxygen: '21', nitrogen: '79' }),
    normalizeCopperCaseStageId: (value) => value ?? 'cu_smelting', normalizeCopperSmeltMethodId: (value) => value,
    normalizeBatchTableView: (value) => value ?? 'element', normalizeOtherHeatMJhText: (value) => value,
    processParametersFromLegacyCase: () => ({}), resolveCaseProcessStages: (value) => value.processStages ?? {},
    toNumber: (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback,
    formatTableNumber: String,
  }
  const context = new Proxy(state, {
    has: (_target, key) => key !== 'extracted',
    get: (target, key) => {
      if (key === Symbol.unscopables) return undefined
      if (key in target) return target[key]
      if (key in globalThis) return globalThis[key]
      if (typeof key === 'string' && key.startsWith('set')) return (value) => {
        const field = key[3].toLowerCase() + key.slice(4)
        target[field] = typeof value === 'function' ? value(target[field]) : value
      }
      if (typeof key === 'string' && (key.startsWith('clone') || key.startsWith('normalizeOxy') || key === 'normalizeHeatBalanceResult')) return (value) => structuredClone(value)
      return undefined
    },
  })
  return { state, context }
}
function initialize(page, context) {
  const values = {}
  function visit(node) {
    if (ts.isVariableDeclaration(node) && ts.isArrayBindingPattern(node.name)) {
      const name = node.name.elements[0].name?.getText(page)
      if (fields.includes(name) && ts.isCallExpression(node.initializer)) {
        const initializer = evaluate(node.initializer.arguments[0].getText(page), context)
        values[name] = typeof initializer === 'function' ? initializer() : initializer
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(page)
  return values
}
const pickCosts = (record) => Object.fromEntries(fields.map((field) => [field, record[field]]))
const bom = { id: 'converting-furnace', name: '吹炼炉', specification: '8 × 2.2 m', quantity: 1,
  unit: '台', material: '钢壳', note: '用户已核对', pricingMode: 'separate', group: '炉体及冷却', source: '选型计算' }
const workbook = createProjectCostWorkbook()
workbook.equipment[bom.id] = { unitPrice: '123456.78', quantity: '2' }
workbook.priceOverrides = { ore: '321.5' }
workbook.annualDays = '312'
workbook.scenario = { ore: { quantity: '25', min: '20', max: '30', locked: true } }
let record = { id: 'case-1', name: '持久化验证', rawMaterials: [],
  equipmentBomSnapshots: { converting: [bom] }, projectCostWorkbooks: { converting: workbook },
  materialPriceOverrides: { legacyOre: '987.65' }, costAnnualDays: '305' }
const expected = JSON.parse(JSON.stringify(pickCosts(record)))
for (const path of pagePaths) {
  const page = parsePage(path)
  const { state, context } = scopeFor(record)
  const initial = initialize(page, context)
  assert.deepEqual(JSON.parse(JSON.stringify(initial)), expected, `${path}: mounting must preserve new and legacy cost data`)
  state.applyCaseEquipmentStateToUi = callback(page, 'applyCaseEquipmentStateToUi', context)
  await callback(page, 'openCopperCase', context)(record)
  assert.deepEqual(JSON.parse(JSON.stringify(pickCosts(state))), expected, `${path}: opening must restore cost data`)
  const saved = callback(page, 'buildCaseSnapshot', context)(record)
  assert.deepEqual(JSON.parse(JSON.stringify(pickCosts(saved))), expected, `${path}: saving after navigation must retain cost data`)
  const localData = new Map()
  state.COPPER_CASES_STORAGE_KEY = 'test.copper.cases'
  state.window = { localStorage: { setItem: (key, value) => localData.set(key, value), getItem: (key) => localData.get(key) ?? null } }
  state.allCaseRecords = [saved]
  state.caseRecords = [saved]
  state.activeCaseId = saved.id
  state.buildCaseSnapshot = callback(page, 'buildCaseSnapshot', context)
  state.writeCopperCaseRecords = callback(page, 'writeCopperCaseRecords', context)
  state.sortCopperCaseRecords = callback(page, 'sortCopperCaseRecords', context)
  state.persistCopperCases = callback(page, 'persistCopperCases', context)
  state.caseContentFingerprint = (value) => JSON.stringify(pickCosts(value))
  state.saveCurrentCase = callback(page, 'saveCurrentCase', context)
  state.getCopperStageUnlockBlockReason = () => null
  let selectedSheet
  state.onStageSelect = (sheet) => {
    selectedSheet = sheet
    const stored = callback(page, 'readCopperCaseRecords', context)()
    assert.equal(stored.length, 1)
    assert.deepEqual(pickCosts(stored[0]), expected, `${path}: navigation must write costs before leaving the page`)
  }
  callback(page, 'confirmSaveBeforeCaseNavigation', context)('cu_summary')
  assert.equal(selectedSheet, 'cu_summary')
  const exported = callback(page, 'buildCopperCaseExportPayload', context)(saved)
  record = callback(page, 'normalizeImportedCopperCase', context)(JSON.parse(JSON.stringify(exported)), '富氧侧吹')
  assert.deepEqual(JSON.parse(JSON.stringify(pickCosts(record))), expected, `${path}: .metcal export/import must round-trip costs`)
  const blank = callback(page, 'buildBlankCaseRecord', context)('新案例')
  assert.deepEqual(pickCosts(blank), { equipmentBomSnapshots: {}, projectCostWorkbooks: {}, materialPriceOverrides: {}, costAnnualDays: '' }, `${path}: new case must not inherit prior cost data`)

  state.equipmentBomGenerated = { smelting: true, converting: true, refining: true }
  state.equipmentBomSnapshots = { smelting: [], converting: [bom] }
  state.equipmentSizingRows = []
  state.buildCopperEquipmentBom = () => { throw new Error('Stored BOM must take precedence over recalculation') }
  const ready = callback(page, 'isEquipmentSizingReady', context)
  assert.equal(ready('converting'), true, `${path}: summary must recognize the actual stored converting BOM`)
  assert.equal(ready('smelting'), false, `${path}: an emptied BOM must not count as complete`)
  assert.equal(ready('refining'), false)
  state.equipmentBomSnapshots = {}
  state.equipmentSizingRows = [{ id: 'converting' }]
  state.buildCopperEquipmentBom = () => [bom]
  assert.equal(ready('converting'), true, `${path}: old cases without BOM snapshots must retain the generation fallback`)
}

const sharedPath = new URL('../src/utils/copperProcessStageState.ts', import.meta.url)
const shared = ts.createSourceFile(sharedPath.pathname, readFileSync(sharedPath, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
const { state, context } = scopeFor(record)
state.serializePersistedCaseContent = callback(shared, 'serializePersistedCaseContent', context)
state.normalizePersistedContentForDirtyCheck = callback(shared, 'normalizePersistedContentForDirtyCheck', context)
const buildPersisted = callback(shared, 'buildPersistedCaseContent', context)
const persisted = buildPersisted(record)
assert.deepEqual(JSON.parse(JSON.stringify(pickCosts(persisted))), expected, 'Persisted-content fingerprints must include all cost and BOM fields')
const changed = structuredClone(record)
changed.projectCostWorkbooks.converting.equipment[bom.id].unitPrice = '543210'
assert.equal(callback(shared, 'isPersistedCaseContentDirty', context)(buildPersisted(changed), persisted), true,
  'Changing only a cost quote must mark the saved case dirty')
console.log('Copper cost data survived all four page mount/open/save/navigation/export/import paths; summary and dirty tracking are consistent')
