import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ExcelJS from 'exceljs'
import JSZip from 'jszip'
import { buildCopperBatchWorkbookXlsx } from '../src/utils/copperBatchExportXlsx.ts'
import { buildAntimonyBatchWorkbookXlsx } from '../src/utils/antimonyBatchExportXlsx.ts'
import { buildHeatBalanceExportSheets as buildCopperHeatSheets } from '../src/utils/copperHeatBalanceExport.ts'
import { buildHeatBalanceExportSheets as buildAntimonyHeatSheets } from '../src/utils/antimonyHeatBalanceExport.ts'
import { getAntimonyStageExportName } from '../src/utils/antimonyBatchExport.ts'
import { prepareReferenceBatchSheets } from '../src/utils/referenceBatchWorkbook.ts'
import { buildProcessTextExportDocx } from '../src/utils/processTextExportDocx.ts'

const annualHours = 24 * 330
const docxPageMargin = 720
const docxLandscapeTableWidth = 16838 - docxPageMargin * 2
const docxA3LandscapePageWidth = 23811
const docxA3LandscapeTableWidth = docxA3LandscapePageWidth - docxPageMargin * 2
const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const outputDir = path.resolve(process.argv[2] ?? path.join(scriptDir, '../../outputs/reference-batch-workbook'))

function round(value, digits = 8) {
  return Number(value.toFixed(digits))
}

function numericValue(value) {
  const parsed = typeof value === 'number' ? value : Number(String(value ?? '').replace(/,/g, ''))
  return Number.isFinite(parsed) ? parsed : 0
}

function normalizedPhaseKey(value) {
  const subscriptDigits = {
    '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4',
    '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9',
  }
  return String(value ?? '')
    .replace(/[₀-₉]/g, (digit) => subscriptDigits[digit] ?? digit)
    .replace(/[\s_\-—–·•()（）\[\]【】]/g, '')
    .toLowerCase()
}

const rawFormulaLabels = new Set([
  'H2O',
  'Fe3O4',
  'SO2',
  'CO2',
  'O2',
  'N2',
  'CuFeS2',
  'Cu2S',
  'FeS2',
  'SiO2',
  'As2O3',
  'Sb2S3',
  'Sb2O3',
])

function pairedGroupEntries(sheet, groupName) {
  const componentColumnIndex = sheet.columns.findIndex(
    (column) => column.header === groupName && column.subHeader === '组分'
  )
  assert.ok(componentColumnIndex >= 0, `${groupName}: component column`)
  return sheet.rows
    .filter((row) => row.role !== 'total')
    .map((row) => [row.values[componentColumnIndex], row.values[componentColumnIndex + 1]])
    .filter(([label]) => String(label ?? '').trim())
}

async function docxTableWidths(buffer) {
  const zip = await JSZip.loadAsync(buffer)
  const xml = await zip.file('word/document.xml')?.async('string')
  assert.ok(xml, 'docx document.xml exists')
  return [...xml.matchAll(/<w:tblW\b[^>]*\bw:w="(\d+)"/g)].map((match) => Number(match[1]))
}

async function docxPageSizes(buffer) {
  const zip = await JSZip.loadAsync(buffer)
  const xml = await zip.file('word/document.xml')?.async('string')
  assert.ok(xml, 'docx document.xml exists')
  return [...xml.matchAll(/<w:pgSz\b[^>]*\bw:w="(\d+)"[^>]*\bw:h="(\d+)"[^>]*\bw:orient="([^"]+)"/g)]
    .map((match) => ({ width: Number(match[1]), height: Number(match[2]), orientation: match[3] }))
}

async function docxTableCaptions(buffer) {
  const zip = await JSZip.loadAsync(buffer)
  const xml = await zip.file('word/document.xml')?.async('string')
  assert.ok(xml, 'docx document.xml exists')
  return [...xml.matchAll(/<w:t(?:\s[^>]*)?>(表[^<]+)<\/w:t>/g)].map((match) => match[1])
}

async function assertDocxReportTablePages({ name, buffer, preparedSheets }) {
  const tableWidths = await docxTableWidths(buffer)
  const pageSizes = await docxPageSizes(buffer)
  const captions = await docxTableCaptions(buffer)
  assert.equal(captions.length, tableWidths.length, `${name}: docx has one caption per report table`)
  const annualBalanceParts = captions.filter((caption) =>
    /^表6(?:（续\d+）)?\[.+\]-元素质量年平衡$/.test(caption)
  )
  const expectedTableCount = preparedSheets.length + annualBalanceParts.length - 1
  assert.ok(annualBalanceParts.length > 0, `${name}: table 6 annual element balance captions exist`)
  assert.equal(tableWidths.length, expectedTableCount, `${name}: docx has one table per prepared report sheet or table 6 continuation`)
  assert.ok(pageSizes.length >= expectedTableCount + 1, `${name}: docx has one page section per report table`)
  tableWidths.forEach((tableWidth, index) => {
    const page = pageSizes[index + 1]
    assert.ok(page, `${name}: report table ${index + 1} page section exists`)
    assert.equal(page.orientation, 'landscape', `${name}: report table ${index + 1} uses landscape page`)
    assert.ok(
      page.width >= tableWidth + docxPageMargin * 2,
      `${name}: report table ${index + 1} page width contains the complete table`
    )
  })
  const annualBalanceIndex = captions.findIndex((caption) => caption === annualBalanceParts[0])
  assert.ok(annualBalanceIndex >= 0, `${name}: table 6 annual element balance exists`)
  annualBalanceParts.forEach((caption, continuationIndex) => {
    const tableIndex = captions.indexOf(caption)
    const page = pageSizes[tableIndex + 1]
    assert.ok(page, `${name}: table 6 continuation ${continuationIndex + 1} page section exists`)
    assert.equal(page.orientation, 'landscape', `${name}: table 6 continuation ${continuationIndex + 1} is horizontal`)
    assert.ok(
      page.width <= docxA3LandscapePageWidth,
      `${name}: table 6 continuation ${continuationIndex + 1} page is no wider than A3 landscape`
    )
    assert.ok(
      tableWidths[tableIndex] <= docxA3LandscapeTableWidth,
      `${name}: table 6 continuation ${continuationIndex + 1} fits inside A3 landscape`
    )
  })
  preparedSheets.filter((sheet) => sheet.tableNumber !== '6').forEach((sheet) => {
    const tableIndex = captions.findIndex((caption) => caption.startsWith(`表${sheet.tableNumber}[`))
    assert.ok(tableIndex >= 0, `${name}: table ${sheet.tableNumber} caption exists`)
    const page = pageSizes[tableIndex + 1]
    assert.ok(page, `${name}: table ${sheet.tableNumber} page section exists`)
    assert.equal(page.orientation, 'landscape', `${name}: table ${sheet.tableNumber} uses landscape page`)
    assert.ok(
      page.width >= tableWidths[tableIndex] + docxPageMargin * 2,
      `${name}: table ${sheet.tableNumber} page width contains the complete table`
    )
  })
}

function makeElementBalanceSheet(inputs, outputs, elements) {
  const columns = [
    { header: '物料名称', subHeader: '' },
    { header: '处理量', subHeader: 't/a' },
    { header: '处理量', subHeader: 't/h' },
    ...elements.flatMap((element) => [
      { header: element, subHeader: '%' },
      { header: element, subHeader: 't/h' },
    ]),
  ]
  const rowsFor = (items) => items.map((item, index) => ({
    label: String(index + 1),
    values: [
      item.name,
      item.massTh * annualHours,
      item.massTh,
      ...elements.flatMap((element) => {
        const percentage = item.elements[element] ?? 0
        return [percentage, item.massTh * percentage / 100]
      }),
    ],
  }))
  return {
    title: '元素投入产出平衡表',
    columns,
    rows: [
      { label: '投入', values: [], role: 'section' },
      ...rowsFor(inputs),
      { label: '产出', values: [], role: 'section' },
      ...rowsFor(outputs),
    ],
    reportLayout: 'elementBalance',
  }
}

function waterMass(item) {
  return item.waterMass ?? 0
}

function wetMass(item) {
  return item.massTh + waterMass(item)
}

function makeInputElementSheet(inputs, elements, blendName, blendCompositionOverride = {}) {
  const columns = [
    ...inputs.map((item) => ({ header: item.kind, subHeader: item.name })),
    { header: '汇总', subHeader: '年投入量' },
    { header: '汇总', subHeader: '混合干基组成' },
  ]
  const dryTotal = inputs.reduce((sum, item) => sum + item.massTh, 0)
  const waterTotal = inputs.reduce((sum, item) => sum + waterMass(item), 0)
  const blendPct = (element) => {
    if (Object.hasOwn(blendCompositionOverride, element)) {
      return blendCompositionOverride[element]
    }
    if (dryTotal <= 0) return 0
    return inputs.reduce((sum, item) => sum + item.massTh * (item.elements[element] ?? 0) / 100, 0) / dryTotal * 100
  }
  return {
    title: '投入物料流量及元素组成表（干基）',
    columns,
    rows: [
      { label: '流量', values: columns.map(() => ''), role: 'section' },
      { label: '干基量', values: [...inputs.map((item) => item.massTh), dryTotal * annualHours, ''] },
      { label: '含水量', values: [...inputs.map((item) => waterMass(item)), waterTotal * annualHours, ''] },
      { label: '湿基量', values: [...inputs.map((item) => wetMass(item)), (dryTotal + waterTotal) * annualHours, ''] },
      { label: '元素组成（干基）', values: columns.map(() => ''), role: 'section' },
      ...elements.map((element) => ({
        label: element,
        values: [...inputs.map((item) => item.elements[element] ?? 0), '', blendPct(element)],
      })),
      { label: '合计', values: [...inputs.map(() => 100), '', 100], role: 'total' },
    ],
    unitNote: `混料：${blendName}`,
  }
}

function makeInputPhaseSheets(inputs) {
  const phases = [...new Set(inputs.flatMap((item) => Object.keys(item.phases)))]
  const columns = inputs.map((item) => ({ header: item.kind, subHeader: item.name }))
  const massRows = [
    { label: '投入量（湿基）', values: inputs.map((item) => wetMass(item)) },
    ...phases.map((phase) => ({
      label: phase,
      values: inputs.map((item) => item.phases[phase] ?? 0),
    })),
    { label: '游离水（固体含水）', values: inputs.map((item) => waterMass(item)) },
    { label: '合计', values: inputs.map((item) => wetMass(item)), role: 'total' },
  ]
  const percentageRows = [
    { label: 't/h（干基）', values: inputs.map((item) => item.massTh) },
    { label: '含水 t/h', values: inputs.map((item) => waterMass(item)) },
    { label: 't/h（湿基）', values: inputs.map((item) => wetMass(item)) },
    ...phases.map((phase) => ({
      label: phase,
      values: inputs.map((item) => item.massTh > 0 ? (item.phases[phase] ?? 0) / item.massTh * 100 : 0),
    })),
    { label: '合计', values: inputs.map(() => 100), role: 'total' },
  ]
  return [
    { title: '投入物相质量流量表', columns, rows: massRows },
    { title: '投入结果-物相表', columns, rows: percentageRows },
  ]
}

function makeBlendPhaseSheet(name, item) {
  return {
    title: '混料结果-物相表',
    columns: [{ header: '混料', subHeader: name }],
    rows: [
      { label: 't/h（干基）', values: [item.massTh] },
      ...Object.entries(item.phases).map(([phase, mass]) => ({
        label: phase,
        values: [item.massTh > 0 ? mass / item.massTh * 100 : 0],
      })),
      { label: '合计', values: [100], role: 'total' },
    ],
  }
}

function makeOutputPhaseSheet(outputs) {
  const phases = [...new Set(outputs.flatMap((item) => Object.keys(item.phases)))]
  return {
    title: '产出-产物物相表',
    columns: [
      { header: 't/h', subHeader: 't/h' },
      ...phases.map((phase) => ({ header: phase, subHeader: phase })),
      { header: '合计', subHeader: '合计' },
    ],
    rows: outputs.map((item) => ({
      label: item.name,
      productKey: item.name === '无组织排放' ? 'fugitive' : undefined,
      phaseRowKeys: Object.keys(item.phases),
      values: [
        item.massTh,
        ...phases.map((phase) => item.massTh > 0 ? (item.phases[phase] ?? 0) / item.massTh * 100 : 0),
        100,
      ],
    })),
  }
}

function makeMaterialDetailSheet(item, elements) {
  const phases = Object.entries(item.phases)
  return {
    title: `物相成分 ${item.name}`,
    columns: [
      { header: 'w%', subHeader: 'w%' },
      ...elements.map((element) => ({ header: element, subHeader: element })),
    ],
    rows: phases.map(([phase, mass]) => ({
      label: phase,
      values: [item.massTh > 0 ? mass / item.massTh * 100 : 0, ...elements.map(() => 0)],
    })),
  }
}

function makeHeatRows(items, temperature, side) {
  return items.flatMap((item) => Object.entries(item.phases)
    .filter(([, mass]) => mass > 0 || (side === 'output' && item.name === '无组织排放'))
    .map(([component, mass]) => ({
      section: item.name,
      productKey: side === 'output' && item.name === '无组织排放' ? 'fugitive' : undefined,
      component,
      massTh: mass,
      temperature,
      enthalpy25KJmol: component === 'N2' || component === 'O2' ? 0 : -100,
      enthalpyTKJmol: component === 'N2' || component === 'O2' ? 20 : side === 'output' ? -55 : -95,
      heatMJh: round(mass * (side === 'output' ? 180 : 8)),
    })))
}

function makeHeatResult(inputs, outputs, inputTemperature, outputTemperature) {
  const inputPhysicalRows = makeHeatRows(inputs, inputTemperature, 'input')
  const outputPhysicalRows = makeHeatRows(outputs, outputTemperature, 'output')
  const heatIncomeRows = [
    ...inputs.map((item) => ({
      type: 'physical',
      material: item.name,
      temperature: inputTemperature,
      heatMJh: round(item.massTh * 8),
      percent: 0,
    })),
    { type: 'physical', material: '二次风', temperature: inputTemperature, heatMJh: 0, percent: 0 },
    { type: 'physical', material: '加料口漏风', temperature: inputTemperature, heatMJh: 0, percent: 0 },
  ]
  const productPhysicalHeat = outputs.reduce((sum, item) => sum + round(item.massTh * 180), 0)
  const heatExpenditureRows = [
    ...outputs.map((item) => ({
      type: 'physical',
      material: item.name,
      temperature: outputTemperature,
      heatMJh: round(item.massTh * 180),
      percent: 0,
    })),
    {
      type: 'physical',
      material: '产物物理热合计',
      temperature: null,
      heatMJh: productPhysicalHeat,
      percent: 0,
      isSubtotal: true,
    },
  ]
  return {
    equations: [],
    chemicalAbsorptionRows: [],
    heatIncomeRows,
    heatExpenditureRows,
    inputPhysicalRows,
    outputPhysicalRows,
    inputPhysicalHeatMJh: inputPhysicalRows.reduce((sum, row) => sum + row.heatMJh, 0),
    outputPhysicalHeatMJh: outputPhysicalRows.reduce((sum, row) => sum + row.heatMJh, 0),
    chemicalHeatMJh: 0,
    chemicalHeatHessMJh: 0,
    chemicalHeatReleaseMJh: 0,
    chemicalHeatAbsorptionMJh: 0,
    chemicalHeatPathMJh: 0,
    chemicalHeatMode: 'hess',
    chemicalHeatCalculationBasis: 'stream298',
  }
}

function makeFixture({ inputs, outputs, elements, heatSheets, blendName }) {
  return [
    makeElementBalanceSheet(inputs, outputs, elements),
    makeInputElementSheet(inputs, elements, blendName),
    makeMaterialDetailSheet(inputs[0], elements),
    ...makeInputPhaseSheets(inputs),
    makeBlendPhaseSheet(blendName, inputs[0]),
    makeOutputPhaseSheet(outputs),
    ...heatSheets,
  ]
}

const copperInputs = [
  { name: '铜精矿', kind: '原料', massTh: 40, waterMass: 1, elements: { Cu: 25, S: 28, Fe: 22, Other: 25 }, phases: { CuFeS2: 30, FeS: 6, Other: 4, CuS: 0, FeS2: 0 } },
  { name: '石英砂', kind: '熔剂', massTh: 5, waterMass: 0.2, elements: { SiO2: 95, Other: 5 }, phases: { SiO2: 4.75, Other: 0.25 } },
  { name: '燃料煤', kind: '燃料', massTh: 2, waterMass: 0.1, elements: { C: 80, Other: 20 }, phases: { C: 1.6, Other: 0.4 } },
  { name: '工艺介质A', kind: '气', massTh: 30, waterMass: 0.5, elements: { O: 22.9, N: 75.4, Other: 1.7 }, phases: { O2: 6.87, N2: 22.62, H2O: 0.51 } },
  { name: '氧气', kind: '气', massTh: 5, elements: { O: 99.65, N: 0.35 }, phases: { O2: 4.9825, N2: 0.0175 } },
]
const copperOutputs = [
  { name: '熔炼铜锍', massTh: 37, elements: { Cu: 48, S: 25, Fe: 22, Other: 5 }, phases: { Cu2S: 20, FeS: 14, Other: 3 } },
  { name: '熔炼渣', massTh: 20, elements: { Fe: 30, SiO2: 35, Other: 35 }, phases: { FeO: 8, Fe3O4: 0.5, SiO2: 7, Other: 4.5 } },
  { name: '高温气相产物', massTh: 24.8, elements: { S: 20, O: 35, H: 1, N: 41, Other: 3 }, phases: { SO2: 8, CO2: 1, O2: 2, N2: 11, H2O: 1.8, Other: 1 } },
  { name: '熔炼烟气含尘', massTh: 2, elements: { Cu: 18, Fe: 12, Other: 70 }, phases: { As2O3: 0.1, Other: 1.9 } },
  { name: '无组织排放', massTh: 0, elements: { Other: 100 }, phases: { SO2: 0 } },
]
const copperHeatResult = makeHeatResult(copperInputs, copperOutputs, 25, 1250)
copperHeatResult.heatIncomeRows[0] = {
  ...copperHeatResult.heatIncomeRows[0],
  material: '混合铜精矿',
}
const copperSheets = makeFixture({
  inputs: copperInputs,
  outputs: copperOutputs,
  elements: ['Cu', 'S', 'Fe', 'H', 'O', 'N', 'C', 'SiO2', 'Other'],
  heatSheets: buildCopperHeatSheets(copperHeatResult),
  blendName: '混合铜精矿',
})

const antimonyInputs = [
  { name: '锑锍', kind: '原料', massTh: 42, waterMass: 1.1, elements: { Sb: 58, S: 24, Fe: 12, Other: 6 }, phases: { Sb2S3: 30, FeS: 8, Other: 4 } },
  { name: '空气', kind: '气', massTh: 24, waterMass: 0.4, elements: { O: 22.9, N: 75.4, Other: 1.7 }, phases: { O2: 5.496, N2: 18.096, H2O: 0.408 } },
  { name: '氧气', kind: '气', massTh: 6, elements: { O: 99.65, N: 0.35 }, phases: { O2: 5.979, N2: 0.021 } },
]
const antimonyOutputs = [
  { name: '粗锑', massTh: 28, elements: { Sb: 96, S: 1, Other: 3 }, phases: { Sb: 26.88, S: 0.28, Other: 0.84 } },
  { name: '吹炼渣', massTh: 14, elements: { Sb: 18, Fe: 24, Other: 58 }, phases: { Sb2O3: 3, FeO: 4, Other: 7 } },
  { name: '吹炼出炉烟气', massTh: 29.5, elements: { S: 16, O: 38, H: 1, N: 42, Other: 3 }, phases: { SO2: 8, CO2: 1, O2: 3, N2: 15, H2O: 1.5, Other: 1 } },
  { name: '吹炼烟气含尘', massTh: 2, elements: { Sb: 35, Other: 65 }, phases: { Sb2O3: 0.8, Other: 1.2 } },
  { name: '无组织排放', massTh: 0, elements: { Other: 100 }, phases: { SO2: 0 } },
]
const antimonyHeatResult = makeHeatResult(antimonyInputs, antimonyOutputs, 80, 1180)
const antimonySheets = makeFixture({
  inputs: antimonyInputs,
  outputs: antimonyOutputs,
  elements: ['Sb', 'S', 'Fe', 'H', 'O', 'N', 'Other'],
  heatSheets: buildAntimonyHeatSheets(antimonyHeatResult),
  blendName: '混合锑精矿',
})

function validatePreparedData(
  name,
  sheets,
  mainFeedName,
  expectedBlendWaterMass,
  expectedSummaryInputNames,
  expectedTable3InputNames,
  expectedDetailInputNames,
  excludedTable3InputNames,
  expectedTable7InputNames,
  excludedTable7InputNames,
  expectedTable7MainFeedEntries
) {
  const prepared = prepareReferenceBatchSheets(sheets)
  const table1 = prepared.find((sheet) => sheet.tableNumber === '1')
  const table2 = prepared.find((sheet) => sheet.tableNumber === '2')
  const table3 = prepared.find((sheet) => sheet.tableNumber === '3')
  const table4 = prepared.find((sheet) => sheet.tableNumber === '4')
  const table5 = prepared.find((sheet) => sheet.tableNumber === '5')
  const table6 = prepared.find((sheet) => sheet.tableNumber === '6')
  const table8 = prepared.find((sheet) => sheet.tableNumber === '8')
  const table11 = prepared.find((sheet) => sheet.tableNumber === '11')
  assert.ok(table1 && table2 && table3 && table4 && table5 && table6 && table8 && table11, `${name}: core prepared tables`)

  assert.equal(table3.title, '物相组成', `${name}: table 3 title`)
  const table3InputNames = table3.columns
    .filter((column) => column.header === '投入')
    .map((column) => column.subHeader)
  assert.deepEqual(table3InputNames, expectedTable3InputNames, `${name}: table 3 grouped inputs`)
  for (const inputName of excludedTable3InputNames) {
    assert.ok(!table3InputNames.includes(inputName), `${name}: table 3 excludes ${inputName}`)
  }
  const table3WaterColumnIndex = table3.columns.findIndex(
    (column) => column.header === '投入' && column.subHeader === '含水'
  )
  assert.ok(table3WaterColumnIndex >= 0, `${name}: table 3 water input column`)
  const table3WaterPhaseRow = table3.rows.find((row) => normalizedPhaseKey(row.label) === 'h2o')
  assert.ok(table3WaterPhaseRow, `${name}: table 3 H2O row`)
  assert.equal(table3WaterPhaseRow.label, 'H₂O', `${name}: table 3 H2O label uses subscript`)
  assert.ok(
    Math.abs(Number(table3WaterPhaseRow.values[table3WaterColumnIndex]) - expectedBlendWaterMass) < 1e-8,
    `${name}: table 3 reads blend water mass`
  )
  const table3PhaseLabels = table3.rows.map((row) => row.label)
  assert.ok(!table3PhaseLabels.includes('H2O'), `${name}: table 3 has no raw H2O label`)
  if (name.startsWith('copper')) {
    assert.ok(table3PhaseLabels.includes('Fe₃O₄'), `${name}: table 3 Fe3O4 label uses subscript`)
    assert.ok(!table3PhaseLabels.includes('Fe3O4'), `${name}: table 3 has no raw Fe3O4 label`)
  }
  const detailSheets = prepared.filter((sheet) => sheet.tableNumber.startsWith('3-'))
  const detailNames = detailSheets.map((sheet) =>
    sheet.title.replace(/^投入物料物相及元素组成-/, '')
  )
  assert.deepEqual(detailNames, expectedDetailInputNames, `${name}: blend material detail sheets only`)
  if (name.startsWith('copper')) {
    const copperDetail = detailSheets.find((sheet) => sheet.title.endsWith('-铜精矿'))
    assert.ok(copperDetail, `${name}: copper concentrate detail exists`)
    assert.ok(!copperDetail.rows.some((row) => normalizedPhaseKey(row.label) === 'cus'), `${name}: table 3-1 excludes zero CuS`)
    assert.ok(!copperDetail.rows.some((row) => normalizedPhaseKey(row.label) === 'fes2'), `${name}: table 3-1 excludes zero FeS2`)
  }
  const table7 = prepared.find((sheet) => sheet.tableNumber === '7')
  assert.ok(table7, `${name}: table 7 exists`)
  const table7InputNames = table7.columns
    .filter((_, index) => index % 2 === 0)
    .map((column) => column.header)
  assert.deepEqual(table7InputNames, expectedTable7InputNames, `${name}: table 7 grouped inputs`)
  for (const inputName of excludedTable7InputNames) {
    assert.ok(!table7InputNames.includes(inputName), `${name}: table 7 excludes ${inputName}`)
  }
  const table7WaterEntries = pairedGroupEntries(table7, '含水')
  assert.deepEqual(
    table7WaterEntries.map(([label]) => normalizedPhaseKey(label)),
    ['h2o'],
    `${name}: table 7 water has H2O only`
  )
  assert.equal(table7WaterEntries[0]?.[0], 'H₂O', `${name}: table 7 water label uses subscript`)
  assert.equal(Number(table7WaterEntries[0]?.[1]), 100, `${name}: table 7 water H2O is 100%`)
  const table8OutputNames = table8.columns
    .filter((_, index) => index % 2 === 0)
    .map((column) => column.header)
  assert.ok(table8OutputNames.includes('无组织排放'), `${name}: table 8 keeps zero fugitive output`)
  const table8FugitiveEntries = pairedGroupEntries(table8, '无组织排放')
  assert.deepEqual(
    table8FugitiveEntries.map(([label]) => normalizedPhaseKey(label)),
    ['so2'],
    `${name}: table 8 reads only fugitive SO2 phase`
  )
  assert.equal(table8FugitiveEntries[0]?.[0], 'SO₂', `${name}: table 8 fugitive SO2 label uses subscript`)
  assert.equal(Number(table8FugitiveEntries[0]?.[1]), 0, `${name}: table 8 fugitive SO2 is zero`)
  const table11FugitiveEntries = pairedGroupEntries(table11, '无组织排放')
  assert.deepEqual(
    table11FugitiveEntries.map(([label]) => normalizedPhaseKey(label)),
    ['so2'],
    `${name}: table 11 reads only fugitive SO2 phase`
  )
  assert.equal(table11FugitiveEntries[0]?.[0], 'SO₂', `${name}: table 11 fugitive SO2 label uses subscript`)
  assert.equal(Number(table11FugitiveEntries[0]?.[1]), 0, `${name}: table 11 fugitive SO2 heat is zero`)
  const table7MainFeedColumnIndex = table7.columns.findIndex(
    (column) => column.header === mainFeedName && column.subHeader === '组分'
  )
  assert.ok(table7MainFeedColumnIndex >= 0, `${name}: table 7 main feed composition column`)
  const table7MainFeedEntries = table7.rows
    .filter((row) => row.role !== 'total')
    .map((row) => [row.values[table7MainFeedColumnIndex], row.values[table7MainFeedColumnIndex + 1]])
    .filter(([label]) => label)
  assert.equal(table7MainFeedEntries.length, expectedTable7MainFeedEntries.length, `${name}: table 7 main feed component count`)
  expectedTable7MainFeedEntries.forEach(([expectedLabel, expectedValue], index) => {
    const [actualLabel, actualValue] = table7MainFeedEntries[index]
    assert.equal(actualLabel, expectedLabel, `${name}: table 7 main feed component ${index + 1}`)
    assert.ok(Math.abs(Number(actualValue) - expectedValue) < 1e-8, `${name}: table 7 main feed component value ${index + 1}`)
  })

  const table4InputNames = table4.columns
    .filter((column) => column.header === '投入 t/h' && column.subHeader !== '合计')
    .map((column) => column.subHeader)
  const table4OutputNames = table4.columns
    .filter((column) => column.header === '产出 t/h' && column.subHeader !== '合计')
    .map((column) => column.subHeader)
  assert.deepEqual(table4InputNames, expectedSummaryInputNames, `${name}: table 4 summarized inputs`)
  assert.ok(table4OutputNames.includes('无组织排放'), `${name}: table 4 keeps fugitive output`)
  const table2InputNames = table2.columns
    .filter((column) => column.header === '投入 /w%')
    .map((column) => column.subHeader)
  const table2OutputNames = table2.columns
    .filter((column) => column.header === '产出 /w%')
    .map((column) => column.subHeader)
  assert.deepEqual(table2InputNames, expectedSummaryInputNames, `${name}: table 2 summarized inputs`)
  assert.ok(table2OutputNames.includes('无组织排放'), `${name}: table 2 keeps fugitive output`)
  const table1InputNames = table1.rows
    .filter((row) => row.role !== 'total')
    .map((row) => row.values[0])
    .filter(Boolean)
  assert.deepEqual(table1InputNames, expectedSummaryInputNames, `${name}: table 1 summarized inputs`)
  const table1FugitiveRow = table1.rows.find((row) => row.values[7] === '无组织排放')
  assert.ok(table1FugitiveRow, `${name}: table 1 keeps zero fugitive output`)
  assert.equal(Number(table1FugitiveRow.values[11]), 0, `${name}: table 1 fugitive mass is zero`)
  assert.equal(Number(table1FugitiveRow.values[12]), 0, `${name}: table 1 fugitive actual gas volume is zero`)
  assert.equal(Number(table1FugitiveRow.values[13]), 0, `${name}: table 1 fugitive standard gas volume is zero`)
  assert.ok(table3.columns.some((column) => column.subHeader === '无组织排放'), `${name}: table 3 keeps fugitive output`)

  const inputCount = table4InputNames.length
  const outputCount = table4OutputNames.length
  table4.rows.slice(0, -1).forEach((massRow, index) => {
    const percentageRow = table2.rows[index]
    const distributionRow = table5.rows[index]
    assert.equal(percentageRow.values[0], massRow.values[0], `${name}: table 2/4 element label`)
    assert.equal(distributionRow.values[0], massRow.values[0], `${name}: table 4/5 element label`)
    const inputTotal = Number(massRow.values[1 + inputCount])
    const outputTotalIndex = 2 + inputCount + outputCount
    const outputTotal = Number(massRow.values[outputTotalIndex])
    for (let i = 0; i < inputCount; i += 1) {
      const expected = inputTotal ? Number(massRow.values[1 + i]) / inputTotal * 100 : 0
      assert.ok(Math.abs(Number(distributionRow.values[1 + i]) - expected) < 1e-8, `${name}: table 5 input reconciliation`)
    }
    for (let i = 0; i < outputCount; i += 1) {
      const massIndex = 2 + inputCount + i
      const expected = outputTotal ? Number(massRow.values[massIndex]) / outputTotal * 100 : 0
      assert.ok(Math.abs(Number(distributionRow.values[massIndex]) - expected) < 1e-8, `${name}: table 5 output reconciliation`)
    }
  })

  const table4TotalRow = table4.rows.at(-1)
  assert.ok(table4TotalRow)
  const inputMassTotal = Number(table4TotalRow.values[1 + inputCount])
  const outputMassTotal = Number(table4TotalRow.values[2 + inputCount + outputCount])
  assert.ok(Math.abs(inputMassTotal - outputMassTotal) < 1e-8, `${name}: table 4 total mass balance (${inputMassTotal} vs ${outputMassTotal})`)
  const mainFeedDetail = detailSheets.find((sheet) => sheet.title.endsWith(`-${mainFeedName}`))
  const mainFeedTable4Index = table4.columns.findIndex(
    (column) => column.header === '投入 t/h' && column.subHeader === mainFeedName
  )
  assert.ok(mainFeedDetail && mainFeedTable4Index >= 0, `${name}: main feed detail/table 4 columns exist`)
  const mainFeedMass = numericValue(table4TotalRow.values[mainFeedTable4Index])
  assert.ok(mainFeedMass > 0, `${name}: main feed table 4 total mass`)
  const mainFeedDetailElements = new Map(mainFeedDetail.rows
    .filter((row) => row.role !== 'total')
    .map((row) => [normalizedPhaseKey(row.values[2]), numericValue(row.values[3])])
    .filter(([key]) => key))
  for (const massRow of table4.rows.slice(0, -1)) {
    const elementKey = normalizedPhaseKey(massRow.values[0])
    const expectedPct = numericValue(massRow.values[mainFeedTable4Index]) / mainFeedMass * 100
    if (Math.abs(expectedPct) <= 1e-8 && !mainFeedDetailElements.has(elementKey)) continue
    assert.ok(mainFeedDetailElements.has(elementKey), `${name}: main feed detail includes ${massRow.values[0]}`)
    assert.ok(
      Math.abs((mainFeedDetailElements.get(elementKey) ?? 0) - expectedPct) < 1e-8,
      `${name}: main feed detail ${massRow.values[0]} matches table 4 percentage`
    )
  }

  const table6InputRows = table6.rows.filter((row) => row.label !== '' && table4InputNames.includes(String(row.values[0] ?? '')))
  assert.deepEqual(table6InputRows.map((row) => row.values[0]), expectedSummaryInputNames, `${name}: table 6 summarized inputs`)
  assert.ok(table6.rows.some((row) => row.values.includes('无组织排放')), `${name}: table 6 keeps fugitive output`)
  for (const annualRow of table6.rows.filter((row) => row.role !== 'section' && row.role !== 'total')) {
    const hourly = Number(annualRow.values[3])
    assert.equal(Number(annualRow.values[1]), hourly * annualHours, `${name}: table 6 annual mass`)
    assert.equal(Number(annualRow.values[2]), hourly * 24, `${name}: table 6 daily mass`)
  }
}

validatePreparedData(
  'copper smelting',
  copperSheets,
  '混合铜精矿',
  1,
  ['混合铜精矿', '含水', '石英砂', '燃料煤', '工艺介质A', '氧气'],
  ['混合铜精矿', '含水', '熔剂', '气', '煤'],
  ['铜精矿', '混合铜精矿'],
  ['铜精矿', '石英砂', '燃料煤', '工艺介质A', '氧气'],
  ['混合铜精矿', '含水', '石英砂', '燃料煤', '工艺介质A', '氧气'],
  ['铜精矿'],
  [['CuFeS₂', 75], ['FeS', 15], ['Other', 10]]
)
validatePreparedData(
  'antimony converting',
  antimonySheets,
  '混合锑精矿',
  1.1,
  ['混合锑精矿', '含水', '空气', '氧气'],
  ['混合锑精矿', '含水', '气'],
  ['锑锍', '混合锑精矿'],
  ['锑锍', '空气', '氧气'],
  ['混合锑精矿', '含水', '空气', '氧气'],
  ['锑锍'],
  [
    ['Sb₂S₃', 30 / 42 * 100],
    ['FeS', 8 / 42 * 100],
    ['Other', 4 / 42 * 100],
  ]
)

const summarySourceInputs = [
  { name: '测试精矿A', kind: '原料', massTh: 5, elements: { Cu: 50, Other: 50 }, phases: { CuFeS2: 5 } },
  { name: '测试精矿B', kind: '原料', massTh: 5, elements: { Cu: 50, Other: 50 }, phases: { CuFeS2: 5 } },
  { name: '测试熔剂', kind: '熔剂', massTh: 10, elements: { Cu: 10, Other: 90 }, phases: { SiO2: 10 } },
]
const summarySourceOutputs = [
  { name: '测试产物', massTh: 20, elements: { Cu: 25, Other: 75 }, phases: { Cu2S: 20 } },
]
const summarySourcePrepared = prepareReferenceBatchSheets([
  makeElementBalanceSheet(summarySourceInputs, summarySourceOutputs, ['Cu', 'Other']),
  makeInputElementSheet(
    summarySourceInputs,
    ['Cu', 'Other'],
    '测试混料',
    { Cu: 40, Other: 60 }
  ),
  makeBlendPhaseSheet('测试混料', { massTh: 10, phases: { CuFeS2: 10 } }),
])
const summarySourceTable2 = summarySourcePrepared.find((sheet) => sheet.tableNumber === '2')
const summarySourceTable4 = summarySourcePrepared.find((sheet) => sheet.tableNumber === '4')
const summarySourceTable5 = summarySourcePrepared.find((sheet) => sheet.tableNumber === '5')
assert.ok(summarySourceTable2 && summarySourceTable4 && summarySourceTable5)
const summarySourceTable2MixIndex = summarySourceTable2.columns.findIndex(
  (column) => column.header === '投入 /w%' && column.subHeader === '测试混料'
)
const summarySourceTable4MixIndex = summarySourceTable4.columns.findIndex(
  (column) => column.header === '投入 t/h' && column.subHeader === '测试混料'
)
const summarySourceTable5MixIndex = summarySourceTable5.columns.findIndex(
  (column) => column.header === '投入' && column.subHeader === '测试混料'
)
const summarySourceCuRow2 = summarySourceTable2.rows.find((row) => row.values[0] === 'Cu')
const summarySourceCuRow4 = summarySourceTable4.rows.find((row) => row.values[0] === 'Cu')
const summarySourceCuRow5 = summarySourceTable5.rows.find((row) => row.values[0] === 'Cu')
assert.equal(Number(summarySourceCuRow2?.values[summarySourceTable2MixIndex]), 40, 'table 2 reads blend summary composition')
assert.equal(Number(summarySourceCuRow4?.values[summarySourceTable4MixIndex]), 4, 'table 4 reads blend summary composition')
assert.equal(Number(summarySourceCuRow5?.values[summarySourceTable5MixIndex]), 80, 'table 5 reads blend summary composition')

const staleBlendInputs = [
  { name: '测试混料', kind: '原料', massTh: 10, elements: { Cu: 10, Other: 90 }, phases: { CuFeS2: 10 } },
]
const [, staleBlendPercentageSheet] = makeInputPhaseSheets(staleBlendInputs)
const staleBlendPrepared = prepareReferenceBatchSheets([
  makeElementBalanceSheet(staleBlendInputs, [], ['Cu', 'Other']),
  makeInputElementSheet(
    staleBlendInputs,
    ['Cu', 'Other'],
    '测试混料',
    { Cu: 40, Other: 60 }
  ),
  staleBlendPercentageSheet,
  makeBlendPhaseSheet('测试混料', { massTh: 10, phases: { CuFeS2: 10 } }),
])
const staleBlendTable4 = staleBlendPrepared.find((sheet) => sheet.tableNumber === '4')
const staleBlendDetail = staleBlendPrepared.find((sheet) => sheet.title.endsWith('-测试混料'))
assert.ok(staleBlendTable4 && staleBlendDetail)
const staleBlendTable4MixIndex = staleBlendTable4.columns.findIndex(
  (column) => column.header === '投入 t/h' && column.subHeader === '测试混料'
)
const staleBlendCuMass = staleBlendTable4.rows.find((row) => normalizedPhaseKey(row.values[0]) === 'cu')
const staleBlendCuDetail = staleBlendDetail.rows.find((row) => normalizedPhaseKey(row.values[2]) === 'cu')
assert.equal(Number(staleBlendCuMass?.values[staleBlendTable4MixIndex]), 4, 'table 4 overrides stale source blend composition')
assert.equal(Number(staleBlendCuDetail?.values[3]), 40, 'blend detail element composition matches table 4 percentage')

function tableNumbers(sheets) {
  return prepareReferenceBatchSheets(sheets).map((sheet) => sheet.tableNumber)
}

const [copperInputMassSheet, copperInputPercentageSheet] = makeInputPhaseSheets(copperInputs)
assert.deepEqual(
  tableNumbers([
    { ...makeElementBalanceSheet(copperInputs, [], ['Cu']), title: '投入物料流量及元素组成表（干基）' },
    makeMaterialDetailSheet(copperInputs[0], ['Cu']),
    copperInputMassSheet,
    copperInputPercentageSheet,
  ]),
  ['2', '3', '3-1', '7'],
  'input-only export keeps fixed numbering'
)
const [, solventOnlyPercentageSheet] = makeInputPhaseSheets([copperInputs[1]])
assert.deepEqual(
  tableNumbers([
    { ...makeElementBalanceSheet([copperInputs[1]], [], ['SiO2']), title: '投入物料流量及元素组成表（干基）' },
    makeMaterialDetailSheet(copperInputs[1], ['SiO2']),
    solventOnlyPercentageSheet,
  ]),
  ['2', '3', '7'],
  'non-blend phase sheets do not fall back to all material details'
)
assert.deepEqual(
  tableNumbers([
    { ...makeElementBalanceSheet([], copperOutputs, ['Cu']), title: '产出-产物元素表' },
    makeOutputPhaseSheet(copperOutputs),
  ]),
  ['2', '3', '8'],
  'output-only export keeps fixed numbering'
)
assert.deepEqual(
  tableNumbers(buildCopperHeatSheets(copperHeatResult)),
  ['9', '10', '11', '12', '13'],
  'heat-only export keeps fixed numbering and omits auxiliary detail'
)

async function validateWorkbook({
  name,
  buffer,
  outputGasName,
  mainFeedName,
  summaryInputNames,
  table3InputNames,
  detailInputNames,
  excludedTable3InputNames,
  table7InputNames,
  excludedTable7InputNames,
  detailCount,
}) {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)
  assert.equal(workbook.worksheets.length, 1)
  const sheet = workbook.getWorksheet('Sheet1')
  assert.ok(sheet)
  const rawFormulaCells = []
  sheet.eachRow((row) => {
    row.eachCell((cell) => {
      const text = String(cell.value ?? '').trim()
      if (rawFormulaLabels.has(text)) rawFormulaCells.push(`${cell.address}=${text}`)
    })
  })
  assert.deepEqual(rawFormulaCells, [], `${name}: workbook has no raw unsubscripted formula labels`)

  const captions = []
  sheet.eachRow((row) => {
    const value = String(row.getCell(1).value ?? '')
    if (value.startsWith('表')) captions.push({ row: row.number, value })
  })
  const blockText = (caption) => {
    const nextCaptionRow = captions.find((item) => item.row > caption.row)?.row ?? sheet.rowCount + 1
    const values = []
    for (let rowNumber = caption.row; rowNumber < nextCaptionRow; rowNumber += 1) {
      const row = sheet.getRow(rowNumber)
      for (let columnNumber = 1; columnNumber <= sheet.columnCount; columnNumber += 1) {
        values.push(String(row.getCell(columnNumber).value ?? ''))
      }
    }
    return values
  }
  const workbookPairedGroupEntries = (caption, groupName) => {
    const headerRow = sheet.getRow(caption.row + 1)
    const subHeaderRow = sheet.getRow(caption.row + 2)
    let componentColumn = 0
    for (let columnNumber = 2; columnNumber <= sheet.columnCount; columnNumber += 1) {
      if (
        String(headerRow.getCell(columnNumber).value ?? '') === groupName &&
        String(subHeaderRow.getCell(columnNumber).value ?? '') === '组分'
      ) {
        componentColumn = columnNumber
        break
      }
    }
    assert.ok(componentColumn > 0, `${name}: ${groupName} workbook component column`)
    const nextCaptionRow = captions.find((item) => item.row > caption.row)?.row ?? sheet.rowCount + 1
    const entries = []
    for (let rowNumber = caption.row + 3; rowNumber < nextCaptionRow; rowNumber += 1) {
      const row = sheet.getRow(rowNumber)
      const label = String(row.getCell(componentColumn).value ?? '').trim()
      if (!label || label === '合计' || label === '总计') continue
      entries.push([label, row.getCell(componentColumn + 1).value])
    }
    return entries
  }
  const actualNumbers = captions.map(({ value }) => value.match(/^表(\d+(?:-\d+)?)/)?.[1]).filter(Boolean)
  const expectedNumbers = [
    '1', '2', '3',
    ...Array.from({ length: detailCount }, (_, index) => `3-${index + 1}`),
    '4', '5', '6', '7', '8', '9', '10', '11', '12', '13',
  ]
  assert.deepEqual(actualNumbers, expectedNumbers, `${name}: table numbering`)
  assert.ok(!captions.some(({ value }) => value.includes('辅助计算')), `${name}: auxiliary table 9 removed`)
  assert.ok(captions.some(({ value }) => value.includes('表9[') && value.endsWith('投入产出-热量平衡')), `${name}: single heat balance table`)
  assert.ok(!captions.some(({ value }) => /投入产出-热量平衡\([QH]\)/.test(value)), `${name}: no duplicated Q/H heat balance captions`)
  assert.ok(captions.some(({ value }) => value.includes('表7[') && value.endsWith('投入组分含量')))
  assert.ok(captions.some(({ value }) => value.includes('表8[') && value.endsWith('产出组分含量')))

  const table3 = captions.find(({ value }) => value.startsWith('表3['))
  assert.ok(table3)
  const table3Text = blockText(table3)
  assert.ok(table3Text.includes('H₂O'), `${name}: workbook table 3 H2O label uses subscript`)
  assert.ok(!table3Text.includes('H2O'), `${name}: workbook table 3 has no raw H2O label`)
  if (name.startsWith('copper')) {
    assert.ok(table3Text.includes('Fe₃O₄'), `${name}: workbook table 3 Fe3O4 label uses subscript`)
    assert.ok(!table3Text.includes('Fe3O4'), `${name}: workbook table 3 has no raw Fe3O4 label`)
  }
  const table3Subheaders = sheet.getRow(table3.row + 2).values.map((value) => String(value ?? ''))
  for (const inputName of table3InputNames) {
    assert.ok(table3Subheaders.includes(inputName), `${name}: table 3 includes ${inputName}`)
  }
  for (const inputName of excludedTable3InputNames) {
    assert.ok(!table3Subheaders.includes(inputName), `${name}: table 3 excludes ${inputName}`)
  }
  const table7 = captions.find(({ value }) => value.startsWith('表7['))
  assert.ok(table7)
  const table7HeaderValues = [
    ...sheet.getRow(table7.row + 1).values,
    ...sheet.getRow(table7.row + 2).values,
  ].map((value) => String(value ?? ''))
  for (const inputName of table7InputNames) {
    assert.ok(table7HeaderValues.includes(inputName), `${name}: table 7 includes ${inputName}`)
  }
  for (const inputName of excludedTable7InputNames) {
    assert.ok(!table7HeaderValues.includes(inputName), `${name}: table 7 excludes ${inputName}`)
  }
  const table7WaterEntries = workbookPairedGroupEntries(table7, '含水')
  assert.deepEqual(
    table7WaterEntries.map(([label]) => normalizedPhaseKey(label)),
    ['h2o'],
    `${name}: workbook table 7 water has H2O only`
  )
  assert.equal(table7WaterEntries[0]?.[0], 'H₂O', `${name}: workbook table 7 water label uses subscript`)
  const table8 = captions.find(({ value }) => value.startsWith('表8['))
  assert.ok(table8)
  const table8FugitiveEntries = workbookPairedGroupEntries(table8, '无组织排放')
  assert.deepEqual(
    table8FugitiveEntries.map(([label]) => normalizedPhaseKey(label)),
    ['so2'],
    `${name}: workbook table 8 reads only fugitive SO2 phase`
  )
  assert.equal(table8FugitiveEntries[0]?.[0], 'SO₂', `${name}: workbook table 8 fugitive SO2 label uses subscript`)
  assert.equal(Number(table8FugitiveEntries[0]?.[1]), 0, `${name}: workbook table 8 fugitive SO2 is zero`)
  const table11 = captions.find(({ value }) => value.startsWith('表11['))
  assert.ok(table11)
  const table11FugitiveEntries = workbookPairedGroupEntries(table11, '无组织排放')
  assert.deepEqual(
    table11FugitiveEntries.map(([label]) => normalizedPhaseKey(label)),
    ['so2'],
    `${name}: workbook table 11 reads only fugitive SO2 phase`
  )
  assert.equal(table11FugitiveEntries[0]?.[0], 'SO₂', `${name}: workbook table 11 fugitive SO2 label uses subscript`)
  assert.equal(Number(table11FugitiveEntries[0]?.[1]), 0, `${name}: workbook table 11 fugitive SO2 heat is zero`)
  const actualDetailInputNames = captions
    .filter(({ value }) => /^表3-\d+\[/.test(value))
    .map(({ value }) => value.replace(/^.*-投入物料物相及元素组成-/, ''))
  assert.deepEqual(actualDetailInputNames, detailInputNames, `${name}: table 3 detail sheets`)

  if (name.startsWith('copper')) {
    const copperDetail = captions.find(({ value }) => value.startsWith('表3-1['))
    assert.ok(copperDetail, `${name}: workbook table 3-1 exists`)
    const detailText = blockText(copperDetail)
    const detailPhaseKeys = detailText.map((value) => normalizedPhaseKey(value))
    assert.ok(!detailPhaseKeys.includes('cus'), `${name}: workbook table 3-1 excludes zero CuS`)
    assert.ok(!detailPhaseKeys.includes('fes2'), `${name}: workbook table 3-1 excludes zero FeS2`)
  }

  const table1 = captions.find(({ value }) => value.startsWith('表1['))
  assert.ok(table1)
  assert.equal(sheet.views[0]?.showGridLines, false, `${name}: worksheet gridlines hidden`)
  assert.equal(sheet.getRow(table1.row + 1).getCell(2).fill?.fgColor?.argb, 'FFDCE6F1', `${name}: header fill`)
  assert.equal(sheet.getRow(table1.row + 3).getCell(2).border?.bottom?.color?.argb, 'FFDCE3EA', `${name}: light body border`)
  assert.equal(sheet.getRow(table1.row + 3).getCell(2).border?.right, undefined, `${name}: no body vertical border`)
  const firstInputRow = sheet.getRow(table1.row + 3)
  const secondInputRow = sheet.getRow(table1.row + 4)
  assert.equal(firstInputRow.getCell(2).value, mainFeedName, `${name}: table 1 main feed row`)
  assert.equal(secondInputRow.getCell(2).value, '含水', `${name}: table 1 water row`)
  assert.equal(firstInputRow.getCell(4).value, 101325)
  let table1TotalRow
  for (let rowNumber = table1.row + 3; rowNumber < table1.row + 30; rowNumber += 1) {
    const row = sheet.getRow(rowNumber)
    if (row.getCell(2).value === '合计' && row.getCell(9).value === '合计') {
      table1TotalRow = row
      break
    }
  }
  assert.ok(table1TotalRow, `${name}: table 1 total row`)
  const table1InputNames = []
  for (let rowNumber = table1.row + 3; rowNumber < table1TotalRow.number; rowNumber += 1) {
    const value = sheet.getRow(rowNumber).getCell(2).value
    if (value) table1InputNames.push(String(value))
  }
  assert.deepEqual(table1InputNames, summaryInputNames, `${name}: table 1 workbook summarized inputs`)
  let outputGasRow
  for (let rowNumber = table1.row + 3; rowNumber < table1TotalRow.number; rowNumber += 1) {
    const row = sheet.getRow(rowNumber)
    if (row.getCell(9).value === outputGasName) outputGasRow = row
  }
  assert.equal(sheet.getRow(table1.row + 3).getCell(3).value, name.startsWith('copper') ? 25 : 80)
  assert.ok(outputGasRow, `${name}: output gas row`)
  assert.equal(outputGasRow.getCell(11).value, 101325)
  assert.ok(Number(outputGasRow.getCell(12).value) > 0)
  assert.ok(Number(outputGasRow.getCell(14).value) > Number(outputGasRow.getCell(15).value))
  assert.ok(Number(table1TotalRow.getCell(14).value) > 0, `${name}: output gas volume total`)

  const table9 = captions.find(({ value }) => value.startsWith('表9['))
  assert.ok(table9)
  const nextAfterTable9 = captions.find((item) => item.row > table9.row)?.row ?? sheet.rowCount + 1
  let productPhysicalSubtotalRow
  let productPhysicalSubtotalWithLeftDetailRow
  for (let rowNumber = table9.row + 3; rowNumber < nextAfterTable9; rowNumber += 1) {
    const row = sheet.getRow(rowNumber)
    if (String(row.getCell(8).value ?? '') === '产物物理热合计') {
      productPhysicalSubtotalRow ??= row
      const leftMaterial = String(row.getCell(3).value ?? '').trim()
      const leftLabel = String(row.getCell(1).value ?? '').trim()
      if (leftMaterial && leftLabel !== '合计') productPhysicalSubtotalWithLeftDetailRow = row
    }
  }
  assert.ok(productPhysicalSubtotalRow, `${name}: table 9 product physical subtotal row`)
  assert.equal(productPhysicalSubtotalRow.getCell(8).font?.bold, true, `${name}: table 9 right subtotal label is bold`)
  assert.equal(productPhysicalSubtotalRow.getCell(10).font?.bold, true, `${name}: table 9 right subtotal heat is bold`)
  if (productPhysicalSubtotalWithLeftDetailRow) {
    assert.notEqual(productPhysicalSubtotalWithLeftDetailRow.getCell(3).font?.bold, true, `${name}: table 9 left detail side is not bolded by right subtotal`)
  }

  for (const tableNumber of ['12', '13']) {
    const caption = captions.find(({ value }) => value.startsWith(`表${tableNumber}[`))
    assert.ok(caption)
    const subheaders = sheet.getRow(caption.row + 2).values.map((value) => String(value ?? ''))
    assert.ok(subheaders.some((value) => value.includes('n×ΔH298 (MJ/h)')), `${name}: table ${tableNumber} enthalpy units`)
  }
  for (const tableNumber of ['9', '11', '13']) {
    const caption = captions.find(({ value }) => value.startsWith(`表${tableNumber}[`))
    assert.ok(caption)
    const heatText = blockText(caption)
    assert.ok(heatText.includes('无组织排放'), `${name}: table ${tableNumber} keeps zero fugitive output`)
  }
  return { captions: captions.map(({ value }) => value) }
}

await fs.mkdir(outputDir, { recursive: true })
const copperBuffer = await buildCopperBatchWorkbookXlsx(copperSheets, { stageName: '富氧侧吹熔炼' })
const antimonyBuffer = await buildAntimonyBatchWorkbookXlsx(antimonySheets, { stageName: '顶吹吹炼' })
const wideDocxColumns = Array.from({ length: 30 }, (_, index) => ({
  header: `宽表分组${index + 1}`,
  subHeader: `元素${index + 1}`,
}))
const wideDocxBuffer = await buildProcessTextExportDocx(
  { caseName: '宽表验证', stageName: '熔炼', date: new Date('2026-08-18') },
  [{
    title: '宽表溢出验证',
    columns: wideDocxColumns,
    rows: [
      { label: '1', values: wideDocxColumns.map((_, index) => index + 1) },
      { label: '', values: wideDocxColumns.map(() => 1), role: 'total' },
    ],
    rowHeaderLabel: '№',
    reportDensity: 'compact',
  }]
)
const copperDocxBuffer = await buildProcessTextExportDocx(
  { caseName: '铜熔炼验证', stageName: '富氧侧吹熔炼', date: new Date('2026-08-18') },
  copperSheets
)
const antimonyDocxBuffer = await buildProcessTextExportDocx(
  { caseName: '锑吹炼验证', stageName: '顶吹吹炼', date: new Date('2026-08-18') },
  antimonySheets
)
const copperPath = path.join(outputDir, 'copper-smelting-reference-export.xlsx')
const antimonyPath = path.join(outputDir, 'antimony-converting-reference-export.xlsx')
const wideDocxPath = path.join(outputDir, 'wide-table-overflow-reference.docx')
const copperDocxPath = path.join(outputDir, 'copper-smelting-reference-export.docx')
const antimonyDocxPath = path.join(outputDir, 'antimony-converting-reference-export.docx')
await fs.writeFile(copperPath, new Uint8Array(copperBuffer))
await fs.writeFile(antimonyPath, new Uint8Array(antimonyBuffer))
await fs.writeFile(wideDocxPath, new Uint8Array(wideDocxBuffer))
await fs.writeFile(copperDocxPath, new Uint8Array(copperDocxBuffer))
await fs.writeFile(antimonyDocxPath, new Uint8Array(antimonyDocxBuffer))
assert.ok(
  (await docxTableWidths(wideDocxBuffer)).some((width) => width > docxLandscapeTableWidth),
  'docx wide tables are allowed to exceed landscape page width'
)
const wideDocxTableWidth = Math.max(...await docxTableWidths(wideDocxBuffer))
const wideDocxPageSizes = await docxPageSizes(wideDocxBuffer)
assert.ok(
  wideDocxPageSizes.some((page) =>
    page.orientation === 'landscape' && page.width >= wideDocxTableWidth + docxPageMargin * 2
  ),
  'docx wide table section page width contains the complete table'
)

const copperValidation = await validateWorkbook({
  name: 'copper smelting',
  buffer: copperBuffer,
  outputGasName: '高温气相产物',
  mainFeedName: '混合铜精矿',
  summaryInputNames: ['混合铜精矿', '含水', '石英砂', '燃料煤', '工艺介质A', '氧气'],
  table3InputNames: ['混合铜精矿', '含水', '熔剂', '气', '煤'],
  detailInputNames: ['铜精矿', '混合铜精矿'],
  excludedTable3InputNames: ['铜精矿', '石英砂', '燃料煤', '工艺介质A', '氧气'],
  table7InputNames: ['混合铜精矿', '含水', '石英砂', '燃料煤', '工艺介质A', '氧气'],
  excludedTable7InputNames: ['铜精矿'],
  expectedTable7MainFeedEntries: [['CuFeS₂', 75], ['FeS', 15], ['Other', 10]],
  detailCount: 2,
})
await assertDocxReportTablePages({
  name: 'copper smelting',
  buffer: copperDocxBuffer,
  preparedSheets: prepareReferenceBatchSheets(copperSheets),
})
const antimonyValidation = await validateWorkbook({
  name: 'antimony converting',
  buffer: antimonyBuffer,
  outputGasName: '吹炼出炉烟气',
  mainFeedName: '混合锑精矿',
  summaryInputNames: ['混合锑精矿', '含水', '空气', '氧气'],
  table3InputNames: ['混合锑精矿', '含水', '气'],
  detailInputNames: ['锑锍', '混合锑精矿'],
  excludedTable3InputNames: ['锑锍', '空气', '氧气'],
  table7InputNames: ['混合锑精矿', '含水', '空气', '氧气'],
  excludedTable7InputNames: ['锑锍'],
  expectedTable7MainFeedEntries: [
    ['Sb₂S₃', 30 / 42 * 100],
    ['FeS', 8 / 42 * 100],
    ['Other', 4 / 42 * 100],
  ],
  detailCount: 2,
})
await assertDocxReportTablePages({
  name: 'antimony converting',
  buffer: antimonyDocxBuffer,
  preparedSheets: prepareReferenceBatchSheets(antimonySheets),
})
assert.equal(getAntimonyStageExportName('顶吹吹炼'), '锑顶吹吹炼')

console.log(JSON.stringify({
  outputDir,
  copperPath,
  antimonyPath,
  wideDocxPath,
  copperCaptions: copperValidation.captions,
  antimonyCaptions: antimonyValidation.captions,
}, null, 2))
