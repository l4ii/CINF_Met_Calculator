import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import {
  buildElementBalanceSheet,
  buildInputMaterialElementSheet,
} from '../src/utils/copperReportSheetBuilders.ts'
import { prepareReferenceBatchSheets } from '../src/utils/referenceBatchWorkbook.ts'
import {
  copperStageExportProfile,
  copperStageExportSheetKeys,
} from '../src/utils/copperStageExportProfile.ts'
import { OXY_SIDE_BLOW_PRODUCT_KEYS } from '../src/utils/copperConstraintConfig.ts'
import { oxyProductTableColumns } from '../src/utils/copperOxyProductBridge.ts'

const format = (value) => String(Number(value.toFixed(6)))

const elements = [
  { key: 'Cu(铜)', label: 'Cu' },
  { key: 'H(氢)', label: 'H' },
  { key: 'O(氧)', label: 'O' },
]

const materials = [
  {
    header: '原料1',
    name: '吹炼投入',
    dryWeightTh: 10,
    waterWeightTh: 1,
    composition: { 'Cu(铜)': 80, 'H(氢)': 0, 'O(氧)': 20 },
    compositionTotal: 100,
  },
]

const inputSheet = buildInputMaterialElementSheet({
  materials,
  blend: {
    dryWeightTh: 10,
    waterWeightTh: 1,
    composition: { 'Cu(铜)': 80, 'H(氢)': 0, 'O(氧)': 20 },
    compositionTotal: 100,
  },
  elements,
  format,
})

assert.deepEqual(inputSheet.columns.at(-2), { header: '汇总', subHeader: '混料' })
assert.equal(inputSheet.rows.find((row) => row.label === '干基量').values.at(-2), '10')
assert.match(inputSheet.unitNote, /流量 t\/h/)
assert.doesNotMatch(inputSheet.unitNote, /年量/)

const convertingInputSheet = buildInputMaterialElementSheet({
  materials,
  blend: {
    dryWeightTh: 10,
    waterWeightTh: 1,
    composition: { 'Cu(铜)': 80, 'H(氢)': 0, 'O(氧)': 20 },
    compositionTotal: 100,
  },
  elements,
  format,
  includeSummary: false,
})
assert.equal(
  convertingInputSheet.columns.some((column) => column.header === '汇总'),
  false,
  'converting input element export omits blend summary columns'
)

const smeltingProfile = copperStageExportProfile('cu_smelting')
assert.equal(smeltingProfile.includeInputSummary, true)
assert.equal(smeltingProfile.includeBlendResult, true)
assert.equal(smeltingProfile.includeFuel, true)

const convertingProfile = copperStageExportProfile('cu_converting')
assert.equal(convertingProfile.includeInputSummary, false)
assert.equal(convertingProfile.includeBlendResult, false)
assert.equal(convertingProfile.includeFuel, false)
assert.deepEqual(
  copperStageExportSheetKeys('cu_converting', ['element', 'materialPhase', 'inputPhase', 'blendResult']),
  ['element', 'materialPhase', 'inputPhase'],
  'converting export selection omits blend result sheets'
)

const balanceSheet = buildElementBalanceSheet({
  inputs: materials,
  outputs: [
    {
      productKey: 'smeltingSlag',
      name: '吹炼渣',
      massTh: 4,
      composition: { 'O(氧)': 100 },
    },
    {
      productKey: 'matte',
      name: '粗铜',
      massTh: 5,
      composition: { 'Cu(铜)': 100 },
    },
    {
      productKey: 'flueGas',
      name: '吹炼出炉烟气',
      massTh: 1,
      composition: { 'H(氢)': 100 },
    },
    {
      productKey: 'dust',
      name: '吹炼烟气含尘',
      massTh: 1,
      composition: { 'Cu(铜)': 100 },
    },
    {
      productKey: 'fugitive',
      name: '无组织排放',
      massTh: 0,
      composition: {},
    },
    {
      productKey: 'loss',
      name: '损失',
      massTh: 0,
      composition: {},
    },
  ],
  elements,
  format,
})

assert.ok(balanceSheet)
assert.ok(balanceSheet.rows.some((row) => row.values[0] === '无组织排放'))
assert.ok(balanceSheet.rows.some((row) => row.values[0] === '损失'))
const outputSectionIndex = balanceSheet.rows.findIndex((row) => row.label === '产出')
assert.deepEqual(
  balanceSheet.rows
    .slice(outputSectionIndex + 1)
    .filter((row) => row.label !== '' && row.role !== 'section')
    .map((row) => row.values[0]),
  ['吹炼渣', '粗铜', '吹炼出炉烟气', '吹炼烟气含尘', '无组织排放', '损失'],
  'converting element balance retains the six solver product rows and excludes display-only total'
)
const inputTotal = balanceSheet.rows.find((row) => row.label === '' && row.role === 'total')
assert.equal(inputTotal.values[1], '11')
assert.equal(inputTotal.values[3], '8')
assert.equal(inputTotal.values[5], '0.111907')
assert.doesNotMatch(balanceSheet.unitNote, /t\/a/)

const preparedSheets = prepareReferenceBatchSheets([balanceSheet])
const annualBalanceSheet = preparedSheets.find((sheet) => sheet.tableNumber === '6')
assert.ok(annualBalanceSheet, 'hourly-only element balance produces table 6')
const annualTotals = annualBalanceSheet.rows.filter((row) => row.role === 'total')
assert.equal(annualTotals[0].values[3], 11, 'table 6 input mass uses the t/h processing column')
assert.equal(annualTotals[1].values[3], 11, 'table 6 output mass uses the t/h processing column')
assert.ok(
  annualBalanceSheet.columns.some((column) => column.header === 'Cu' && column.subHeader === '%'),
  'table 6 keeps the first element pair'
)

for (const path of [
  '../src/components/modules/copper/shared/CopperOxySideBlowSession.tsx',
  '../src/components/modules/copper/converting/ConvertingEquipmentPage.tsx',
]) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8')
  assert.match(
    source,
    /header: '混料',\s*subHeader: isConvertingStage \? '混料' : '混合铜精矿'/,
    `${fileURLToPath(new URL(path, import.meta.url))}: converting summary uses 混料`
  )
}

const sharedSessionSource = await readFile(
  new URL('../src/components/modules/copper/shared/CopperOxySideBlowSession.tsx', import.meta.url),
  'utf8'
)
assert.match(sharedSessionSource, /copperStageExportProfile\(activeProcessStageId\)/)
assert.match(sharedSessionSource, /includeSummary: exportProfile\.includeInputSummary/)
assert.match(sharedSessionSource, /exportProfile\.includeFuel \? \[fuelColumn\] : \[\]/)
assert.match(sharedSessionSource, /copperStageExportSheetKeys\(activeProcessStageId, selectedKeys\)/)
assert.match(
  sharedSessionSource,
  /productTableColumns\s*\.filter\(\(product\) => product\.key !== 'total'\)/,
  'export product rows remove only the display total'
)

const elementTableSource = await readFile(
  new URL('../src/components/modules/CopperBatchElementTable.tsx', import.meta.url),
  'utf8'
)
assert.match(
  elementTableSource,
  /value=\{feedTotalWeight \+ furnaceBlendWaterWeight\}/,
  'bottom input summary displays one wet-basis total'
)
assert.match(
  elementTableSource,
  /value=\{displayRatioValue\(furnaceWetRatios, element\)\}/,
  'bottom input summary displays wet-basis element composition'
)
assert.doesNotMatch(
  elementTableSource,
  /renderMaterialWaterRow\('blend-water'/,
  'bottom input summary no longer renders a separate water row'
)

const productColumns = oxyProductTableColumns({
  products: Object.fromEntries(
    OXY_SIDE_BLOW_PRODUCT_KEYS.map((key) => [
      key,
      {
        key,
        name: key === 'fugitive' ? '无组织排放' : key,
        mass: key === 'fugitive' || key === 'loss' ? 0 : 1,
        elementMass: {},
        composition: {},
        phases: [],
      },
    ])
  ),
})
assert.deepEqual(
  productColumns.map((column) => column.key),
  OXY_SIDE_BLOW_PRODUCT_KEYS,
  'solver product table retains all six products, including zero-mass fugitive and loss'
)

console.log('copper report regressions passed')
