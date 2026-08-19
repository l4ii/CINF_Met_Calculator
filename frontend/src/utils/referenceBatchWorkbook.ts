import { COMPOUND_MOLAR_MASS, atomicMass } from './atomicMass.ts'
import { phaseFormulaDisplayTitle } from './chemicalFormula.ts'

export interface ReferenceBatchExportColumn {
  header: string
  subHeader?: string
}

export interface ReferenceBatchExportRow {
  label: string
  values: Array<string | number | null | undefined>
  role?: 'data' | 'section' | 'total'
  boldValueIndexes?: number[]
  productKey?: string
  phaseRowKeys?: string[]
}

export interface ReferenceBatchReportSection {
  title: string
  columns: ReferenceBatchExportColumn[]
  rows: ReferenceBatchExportRow[]
}

export interface ReferenceBatchWorkbookSheet {
  title: string
  columns: ReferenceBatchExportColumn[]
  rows: ReferenceBatchExportRow[]
  unitNote?: string
  rowHeaderLabel?: string
  columnWidthWeights?: number[]
  reportDensity?: 'normal' | 'compact'
  reportSections?: ReferenceBatchReportSection[]
}

export interface PreparedReferenceBatchSheet extends ReferenceBatchWorkbookSheet {
  tableNumber: string
  directCaption?: boolean
}

type BalanceElement = {
  label: string
  percentageIndex: number
  massIndex: number
}

type BalanceItem = {
  name: string
  annualMass: number
  hourlyMass: number
  values: ReferenceBatchExportRow['values']
}

type BalanceData = {
  elements: BalanceElement[]
  inputs: BalanceItem[]
  outputs: BalanceItem[]
}

const ANNUAL_OPERATING_DAYS = 330
const ANNUAL_OPERATING_HOURS = 24 * ANNUAL_OPERATING_DAYS
const EPSILON = 1e-9
const STANDARD_PRESSURE_PA = 101325
const STANDARD_TEMPERATURE_K = 273.15
const STANDARD_GAS_MOLAR_VOLUME_NM3_PER_KMOL = 22.4
const SUMMARY_INPUT_WATER_NAME = '含水'
const WATER_MOLAR_MASS = 2 * atomicMass('H') + atomicMass('O')
const WATER_H_PCT = WATER_MOLAR_MASS > 0 ? 2 * atomicMass('H') / WATER_MOLAR_MASS * 100 : 0
const WATER_O_PCT = WATER_MOLAR_MASS > 0 ? atomicMass('O') / WATER_MOLAR_MASS * 100 : 0
const GAS_PHASE_MOLAR_MASS: Record<string, number> = {
  so2: COMPOUND_MOLAR_MASS.SO2,
  so3: atomicMass('S') + 3 * atomicMass('O'),
  co2: COMPOUND_MOLAR_MASS.CO2,
  o2: COMPOUND_MOLAR_MASS.O2,
  n2: COMPOUND_MOLAR_MASS.N2,
  h2o: 2 * atomicMass('H') + atomicMass('O'),
  as2o3: COMPOUND_MOLAR_MASS.As2O3,
  hg: atomicMass('Hg'),
  other: 28,
}
const GAS_STREAM_INDICATOR_PHASES = new Set(['so2', 'so3', 'co2', 'o2', 'n2', 'h2o'])

function numberValue(value: string | number | null | undefined): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (typeof value !== 'string' || !value.trim()) return 0
  const parsed = Number(value.replace(/,/g, ''))
  return Number.isFinite(parsed) ? parsed : 0
}

function normalizedName(value: string) {
  return value
    .replace(/[\s_\-—–·•()（）\[\]【】]/g, '')
    .replace(/原料|熔剂|物相成分|投入物料物相及元素组成/g, '')
    .toLowerCase()
}

function normalizedPhaseKey(value: string) {
  const subscriptDigits: Record<string, string> = {
    '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4',
    '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9',
  }
  return value
    .replace(/[₀-₉]/g, (digit) => subscriptDigits[digit] ?? digit)
    .replace(/[\s_\-—–·•()（）\[\]【】]/g, '')
    .toLowerCase()
}

function normalizedElementToken(value: string) {
  const subscriptDigits: Record<string, string> = {
    '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4',
    '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9',
  }
  return value
    .replace(/[₀-₉]/g, (digit) => subscriptDigits[digit] ?? digit)
    .replace(/\(.+?\)|（.+?）/g, '')
    .replace(/[^A-Za-z0-9]/g, '')
    .toLowerCase()
}

function displayFormulaLabel(label: string) {
  const trimmed = String(label ?? '').trim()
  if (!trimmed) return trimmed
  if (!/[A-Za-z]/.test(trimmed) || !/[0-9₀-₉]/.test(trimmed)) return trimmed
  return phaseFormulaDisplayTitle(trimmed)
}

function standardGasVolumeNm3h(entries: Array<{ phase: string; massTh: number }>) {
  return entries.reduce((total, entry) => {
    const molarMass = GAS_PHASE_MOLAR_MASS[normalizedPhaseKey(entry.phase)]
    if (!(molarMass > 0) || !(entry.massTh > 0)) return total
    return total + entry.massTh * 1000 * STANDARD_GAS_MOLAR_VOLUME_NM3_PER_KMOL / molarMass
  }, 0)
}

function gasPhaseEntries(entries: Array<{ phase: string; massTh: number }>) {
  const hasGasPhase = entries.some((entry) =>
    entry.massTh > EPSILON && GAS_STREAM_INDICATOR_PHASES.has(normalizedPhaseKey(entry.phase))
  )
  if (!hasGasPhase) return []
  return entries.filter((entry) => GAS_PHASE_MOLAR_MASS[normalizedPhaseKey(entry.phase)] != null)
}

function buildInputGasVolumeMap(sheet: ReferenceBatchWorkbookSheet | undefined) {
  const volumes = new Map<string, number>()
  if (!sheet) return volumes
  sheet.columns.forEach((column, columnIndex) => {
    const materialName = column.subHeader || column.header
    const entries = gasPhaseEntries(sheet.rows
      .filter((row) => row.role !== 'section' && row.role !== 'total' && !phaseRowIsFlow(row.label))
      .map((row) => ({ phase: row.label, massTh: numberValue(row.values[columnIndex]) }))
    )
    const volume = standardGasVolumeNm3h(entries)
    if (volume > EPSILON) volumes.set(normalizedName(materialName), volume)
  })
  return volumes
}

function buildOutputGasVolumeMap(sheet: ReferenceBatchWorkbookSheet | undefined) {
  const volumes = new Map<string, number>()
  if (!sheet) return volumes
  const phases = sheet.columns
    .map((column, index) => ({ phase: column.subHeader || column.header, index }))
    .filter(({ index, phase }) => index > 0 && !phase.includes('合计'))
  for (const row of sheet.rows) {
    if (row.role === 'section' || row.role === 'total') continue
    const totalMass = numberValue(row.values[0])
    const entries = gasPhaseEntries(phases.map(({ phase, index }) => ({
      phase,
      massTh: totalMass * numberValue(row.values[index]) / 100,
    })))
    const volume = standardGasVolumeNm3h(entries)
    if (volume > EPSILON) volumes.set(normalizedName(row.label), volume)
  }
  return volumes
}

function buildInputPhysicalMassMap(sheet: ReferenceBatchWorkbookSheet | undefined) {
  const masses = new Map<string, number>()
  if (!sheet) return masses
  const amountRow = sheet.rows.find((row) => row.label.includes('投入量'))
  if (!amountRow) return masses
  sheet.columns.forEach((column, columnIndex) => {
    const materialName = column.subHeader || column.header
    const mass = numberValue(amountRow.values[columnIndex])
    if (materialName && mass > EPSILON) masses.set(normalizedName(materialName), mass)
  })
  return masses
}

function gasPhysicalValues(
  massTh: number | undefined,
  temperature: number | '',
  standardVolumeNm3h: number | undefined
) {
  if (massTh != null && Math.abs(massTh) <= EPSILON) {
    return [0, 0, 0] as const
  }
  if (!(massTh && massTh > EPSILON) || !(standardVolumeNm3h && standardVolumeNm3h > EPSILON)) {
    return ['', '', ''] as const
  }
  if (temperature === '') return ['', '', standardVolumeNm3h] as const
  const actualVolumeM3h = standardVolumeNm3h * (temperature + STANDARD_TEMPERATURE_K) / STANDARD_TEMPERATURE_K
  const densityGcm3 = actualVolumeM3h > EPSILON ? massTh / actualVolumeM3h : ''
  return [densityGcm3, actualVolumeM3h, standardVolumeNm3h] as const
}

function sum(items: number[]) {
  return items.reduce((total, value) => total + value, 0)
}

function nonZeroBalanceItems(items: BalanceItem[]) {
  return items.filter((item) => item.hourlyMass > EPSILON)
}

function parseBalanceSheet(sheet: ReferenceBatchWorkbookSheet | undefined): BalanceData | null {
  if (!sheet) return null
  const hourlyMassIndex = sheet.columns.findIndex((column) =>
    compactLabel(column.header).includes('处理量') &&
    compactLabel(column.subHeader ?? '').toLowerCase().includes('t/h')
  )
  if (hourlyMassIndex < 0) return null
  const annualMassIndex = sheet.columns.findIndex((column) =>
    compactLabel(column.header).includes('处理量') &&
    compactLabel(column.subHeader ?? '').toLowerCase().includes('t/a')
  )
  const materialNameIndex = sheet.columns.findIndex((column) =>
    compactLabel(column.header).includes('物料名称')
  )
  const elements: BalanceElement[] = []
  for (let index = 0; index < sheet.columns.length - 1; index += 1) {
    const column = sheet.columns[index]
    const nextColumn = sheet.columns[index + 1]
    if (!column || !nextColumn) continue
    if (column.header !== nextColumn.header) continue
    if (!(column.subHeader ?? '').includes('%')) continue
    if (!(nextColumn.subHeader ?? '').toLowerCase().includes('t/h')) continue
    elements.push({ label: column.header, percentageIndex: index, massIndex: index + 1 })
    index += 1
  }
  if (elements.length === 0) return null

  const inputs: BalanceItem[] = []
  const outputs: BalanceItem[] = []
  let side: 'input' | 'output' | null = null
  for (const row of sheet.rows) {
    if (row.role === 'section') {
      if (row.label.includes('投入')) side = 'input'
      else if (row.label.includes('产出')) side = 'output'
      continue
    }
    if (row.role === 'total' || !side) continue
    const name = String(row.values[materialNameIndex >= 0 ? materialNameIndex : 0] ?? '').trim()
    if (!name) continue
    const hourlyMass = numberValue(row.values[hourlyMassIndex])
    const item: BalanceItem = {
      name,
      annualMass: annualMassIndex >= 0
        ? numberValue(row.values[annualMassIndex])
        : hourlyMass * ANNUAL_OPERATING_HOURS,
      hourlyMass,
      values: row.values,
    }
    if (side === 'input') inputs.push(item)
    else outputs.push(item)
  }
  if (inputs.length === 0 && outputs.length === 0) return null
  return { elements, inputs, outputs }
}

function balanceElementByLabel(elements: BalanceElement[], label: string) {
  const token = normalizedElementToken(label)
  return elements.find((element) => normalizedElementToken(element.label) === token)
}

function ensureBalanceElements(
  elements: BalanceElement[],
  requiredLabels: string[]
): BalanceElement[] {
  const next = [...elements]
  let nextIndex = next.reduce((max, element) => Math.max(max, element.massIndex), 2) + 1
  for (const label of requiredLabels) {
    if (balanceElementByLabel(next, label)) continue
    next.push({ label, percentageIndex: nextIndex, massIndex: nextIndex + 1 })
    nextIndex += 2
  }
  return next
}

function findRowByLabel(sheet: ReferenceBatchWorkbookSheet | undefined, matcher: RegExp) {
  return sheet?.rows.find((row) => matcher.test(row.label.replace(/\s+/g, '')))
}

function columnLabel(column: ReferenceBatchExportColumn) {
  return `${column.header}${column.subHeader ?? ''}`.replace(/\s+/g, '')
}

function findColumnIndex(sheet: ReferenceBatchWorkbookSheet | undefined, matcher: RegExp) {
  return sheet?.columns.findIndex((column) => matcher.test(columnLabel(column))) ?? -1
}

type InputMaterialColumn = {
  column: ReferenceBatchExportColumn
  columnIndex: number
  name: string
  dryMass: number
  waterMass: number
  isBlendMember: boolean
  sourceItem?: BalanceItem
}

function compactLabel(value: string) {
  return value.replace(/\s+/g, '')
}

function isSummaryInputColumn(column: ReferenceBatchExportColumn) {
  const label = columnLabel(column)
  return /汇总|合计|年投入量|年处理量|年量|混合干基组成|混料.*组成|混合.*组成/.test(label)
}

function isNonBlendInputColumn(column: ReferenceBatchExportColumn) {
  const header = compactLabel(column.header)
  const name = compactLabel(column.subHeader || column.header)
  if (/^(其他|熔剂\d*|燃料.*|气\d*|气体.*|空气|氧气|富氧.*|一次风|二次风|漏风|加料口漏风|蒸汽|冷却水)/.test(header)) {
    return true
  }
  if (!/原料|主料|混料|混合/.test(header) && /熔剂|燃料|煤|焦|空气|氧气|富氧|漏风|蒸汽|冷却水|天然气|煤气/.test(name)) {
    return true
  }
  return false
}

function isBlendInputColumn(column: ReferenceBatchExportColumn) {
  if (isSummaryInputColumn(column) || isNonBlendInputColumn(column)) return false
  const header = compactLabel(column.header)
  return /^(原料|主料)\d*$/.test(header) || (/混料|混合/.test(header) && !/组成|汇总/.test(header))
}

function sourceElementRows(sheet: ReferenceBatchWorkbookSheet | undefined) {
  return (sheet?.rows ?? []).filter((row) => {
    const compact = compactLabel(row.label)
    if (row.role === 'section' || row.role === 'total') return false
    if (/流量|干基|湿基|含水|投入量|处理量|合计/.test(compact)) return false
    return row.label.trim()
  })
}

function inputMaterialColumnsFromSheet(inputElementSheet: ReferenceBatchWorkbookSheet | undefined) {
  const dryRow = findRowByLabel(inputElementSheet, /干基量|干基|t\/h.*干基/)
  if (!inputElementSheet || !dryRow) return []
  const waterRow = findRowByLabel(inputElementSheet, /含水量|含水/)
  return inputElementSheet.columns.flatMap((column, columnIndex): InputMaterialColumn[] => {
    const name = (column.subHeader || column.header).trim()
    if (!name || isSummaryInputColumn(column)) return []
    const dryMass = numberValue(dryRow.values[columnIndex])
    const waterMass = numberValue(waterRow?.values[columnIndex])
    if (dryMass <= EPSILON && waterMass <= EPSILON) return []
    return [{
      column,
      columnIndex,
      name,
      dryMass,
      waterMass,
      isBlendMember: isBlendInputColumn(column),
    }]
  })
}

function sourceInputLookup(items: BalanceItem[]) {
  const lookup = new Map<string, BalanceItem[]>()
  for (const item of items) {
    const key = normalizedName(item.name)
    const current = lookup.get(key) ?? []
    current.push(item)
    lookup.set(key, current)
  }
  return lookup
}

function takeSourceInputItem(lookup: Map<string, BalanceItem[]>, name: string) {
  const items = lookup.get(normalizedName(name))
  if (!items || items.length === 0) return undefined
  return items.shift()
}

function sourceColumnPercentage(
  inputElementSheet: ReferenceBatchWorkbookSheet | undefined,
  columnIndex: number,
  element: BalanceElement
) {
  const row = sourceElementRows(inputElementSheet).find(
    (item) => normalizedElementToken(item.label) === normalizedElementToken(element.label)
  )
  if (!row) return null
  const value = row.values[columnIndex]
  if (value == null || String(value).trim() === '') return null
  return numberValue(value)
}

function buildBalanceItemFromInputColumn(
  column: InputMaterialColumn,
  elements: BalanceElement[],
  inputElementSheet: ReferenceBatchWorkbookSheet | undefined
) {
  return buildBalanceItemFromPercentages({
    name: column.name,
    hourlyMass: column.dryMass,
    elements,
    percentageFor: (element) => sourceColumnPercentage(inputElementSheet, column.columnIndex, element) ?? 0,
  })
}

function buildWetBalanceItemFromInputColumn(
  column: InputMaterialColumn,
  sourceItem: BalanceItem | undefined,
  elements: BalanceElement[],
  inputElementSheet: ReferenceBatchWorkbookSheet | undefined
) {
  const dryMass = column.dryMass
  const waterMass = column.waterMass
  const hourlyMass = dryMass + waterMass
  if (waterMass <= EPSILON && sourceItem) return sourceItem
  return buildBalanceItemFromPercentages({
    name: column.name,
    hourlyMass,
    elements,
    percentageFor: (element) => {
      if (hourlyMass <= EPSILON) return 0
      const dryPercentage = sourceItem
        ? elementPercentage(sourceItem, element)
        : sourceColumnPercentage(inputElementSheet, column.columnIndex, element) ?? 0
      const dryElementMass = dryMass * dryPercentage / 100
      const waterElementMass = waterMass * waterPercentageForElement(element) / 100
      return (dryElementMass + waterElementMass) / hourlyMass * 100
    },
  })
}

function blendPhaseSheetMass(blendPhaseSheet: ReferenceBatchWorkbookSheet | undefined, matcher: RegExp) {
  if (!blendPhaseSheet) return 0
  const columnIndex = blendPhaseSheet.columns.findIndex((column) => (column.subHeader || column.header).trim())
  if (columnIndex < 0) return 0
  const row = findRowByLabel(blendPhaseSheet, matcher)
  return numberValue(row?.values[columnIndex])
}

function aggregateBlendColumnPercentage(
  inputElementSheet: ReferenceBatchWorkbookSheet | undefined,
  columns: InputMaterialColumn[],
  sourceItems: BalanceItem[],
  element: BalanceElement,
  blendDryMass: number
) {
  if (blendDryMass > EPSILON) {
    let hasColumnValue = false
    const elementMass = columns.reduce((total, column) => {
      const percentage = sourceColumnPercentage(inputElementSheet, column.columnIndex, element)
      if (percentage == null) return total
      hasColumnValue = true
      return total + column.dryMass * percentage / 100
    }, 0)
    if (hasColumnValue) return elementMass / blendDryMass * 100
  }
  const sourceDryMass = sum(sourceItems.map((item) => item.hourlyMass))
  if (sourceDryMass > EPSILON) {
    return sum(sourceItems.map((item) => elementMass(item, element))) / sourceDryMass * 100
  }
  return 0
}

function blendSummaryCompositionColumnIndex(inputElementSheet: ReferenceBatchWorkbookSheet | undefined) {
  return inputElementSheet?.columns.findIndex((column) =>
    /混料.*组成|混合.*组成/.test(columnLabel(column))
  ) ?? -1
}

function blendSummaryPercentage(
  inputElementSheet: ReferenceBatchWorkbookSheet | undefined,
  element: BalanceElement
) {
  const columnIndex = blendSummaryCompositionColumnIndex(inputElementSheet)
  return columnIndex < 0 ? null : sourceColumnPercentage(inputElementSheet, columnIndex, element)
}

function findSummaryBlendName(
  blendPhaseSheet: ReferenceBatchWorkbookSheet | undefined,
  inputElementSheet: ReferenceBatchWorkbookSheet | undefined
) {
  const blendColumn = blendPhaseSheet?.columns.find((column) => (column.subHeader || column.header).trim())
  const blendName = blendColumn ? (blendColumn.subHeader || blendColumn.header).trim() : ''
  if (blendName) return blendName
  const inputColumn = inputElementSheet?.columns.find((column) => /混料|混合/.test(columnLabel(column)))
  const inputName = inputColumn ? (inputColumn.subHeader || inputColumn.header).trim() : ''
  if (inputName && !/组成|汇总|年投入量/.test(inputName)) return inputName
  return '混料'
}

function waterPercentageForElement(element: BalanceElement) {
  const token = normalizedElementToken(element.label)
  if (token === 'h') return WATER_H_PCT
  if (token === 'o') return WATER_O_PCT
  return 0
}

function buildBalanceItemFromPercentages({
  name,
  hourlyMass,
  elements,
  percentageFor,
}: {
  name: string
  hourlyMass: number
  elements: BalanceElement[]
  percentageFor: (element: BalanceElement) => number
}): BalanceItem {
  const values: ReferenceBatchExportRow['values'] = [
    name,
    hourlyMass * ANNUAL_OPERATING_HOURS,
    hourlyMass,
  ]
  for (const element of elements) {
    const percentage = percentageFor(element)
    values[element.percentageIndex] = percentage
    values[element.massIndex] = hourlyMass * percentage / 100
  }
  return {
    name,
    annualMass: hourlyMass * ANNUAL_OPERATING_HOURS,
    hourlyMass,
    values,
  }
}

function buildOrderedSummaryInputs({
  balance,
  elements,
  inputElementSheet,
  blendPhaseSheet,
}: {
  balance: BalanceData
  elements: BalanceElement[]
  inputElementSheet: ReferenceBatchWorkbookSheet
  blendPhaseSheet: ReferenceBatchWorkbookSheet | undefined
}) {
  const columns = inputMaterialColumnsFromSheet(inputElementSheet)
  if (columns.length === 0) return balance.inputs

  const sourceLookup = sourceInputLookup(balance.inputs)
  const consumedSourceItems = new Set<BalanceItem>()
  const blendColumns = columns.filter((column) => column.isBlendMember)
  const blendSourceItems: BalanceItem[] = []
  for (const column of blendColumns) {
    const sourceItem = takeSourceInputItem(sourceLookup, column.name)
    if (sourceItem) {
      consumedSourceItems.add(sourceItem)
      blendSourceItems.push(sourceItem)
    } else {
      blendSourceItems.push(buildBalanceItemFromInputColumn(column, elements, inputElementSheet))
    }
  }

  const blendColumnDryMass = sum(blendColumns.map((column) => column.dryMass))
  const blendSourceDryMass = sum(blendSourceItems.map((item) => item.hourlyMass))
  const blendDryMass = blendColumnDryMass > EPSILON
    ? blendColumnDryMass
    : blendSourceDryMass > EPSILON
      ? blendSourceDryMass
      : blendPhaseSheetMass(blendPhaseSheet, /t\/h.*干基|干基量|投入量/)
  const blendWaterMass = sum(blendColumns.map((column) => column.waterMass))
  const hasBlendWater = blendColumns.length > 0 && (
    findRowByLabel(inputElementSheet, /含水量|含水/) != null ||
    blendWaterMass > EPSILON
  )
  const blendName = findSummaryBlendName(blendPhaseSheet, inputElementSheet)
  const blendItem = blendDryMass > EPSILON
    ? buildBalanceItemFromPercentages({
        name: blendName,
        hourlyMass: blendDryMass,
        elements,
        percentageFor: (element) =>
          blendSummaryPercentage(inputElementSheet, element) ??
          aggregateBlendColumnPercentage(
            inputElementSheet,
            blendColumns,
            blendSourceItems,
            element,
            blendDryMass
          ),
      })
    : null
  const waterItem = hasBlendWater
    ? buildBalanceItemFromPercentages({
        name: SUMMARY_INPUT_WATER_NAME,
        hourlyMass: blendWaterMass,
        elements,
        percentageFor: waterPercentageForElement,
      })
    : null

  const inputs: BalanceItem[] = []
  let blendInserted = false
  for (const column of columns) {
    if (column.isBlendMember) {
      if (!blendInserted) {
        if (blendItem) inputs.push(blendItem)
        if (waterItem) inputs.push(waterItem)
        blendInserted = true
      }
      continue
    }
    const sourceItem = takeSourceInputItem(sourceLookup, column.name)
    if (sourceItem) {
      consumedSourceItems.add(sourceItem)
      inputs.push(buildWetBalanceItemFromInputColumn(column, sourceItem, elements, inputElementSheet))
    } else {
      inputs.push(buildWetBalanceItemFromInputColumn(column, undefined, elements, inputElementSheet))
    }
  }

  if (!blendInserted) {
    if (blendItem) inputs.unshift(blendItem)
    if (waterItem) inputs.splice(blendItem ? 1 : 0, 0, waterItem)
  }

  for (const sourceItem of balance.inputs) {
    if (!consumedSourceItems.has(sourceItem)) inputs.push(sourceItem)
  }
  return inputs
}

function buildSummaryInputBalance(
  balance: BalanceData,
  inputElementSheet: ReferenceBatchWorkbookSheet | undefined,
  blendPhaseSheet: ReferenceBatchWorkbookSheet | undefined
): BalanceData {
  if (!inputElementSheet) return balance
  const columns = inputMaterialColumnsFromSheet(inputElementSheet)
  const hasBlendWater = columns.some((column) => column.isBlendMember && column.waterMass > EPSILON) ||
    (columns.some((column) => column.isBlendMember) && findRowByLabel(inputElementSheet, /含水量|含水/) != null)
  const hasAnyWater = hasBlendWater || columns.some((column) => column.waterMass > EPSILON)
  const elements = ensureBalanceElements(balance.elements, hasAnyWater ? ['H', 'O'] : [])
  const inputs = buildOrderedSummaryInputs({
    balance,
    elements,
    inputElementSheet,
    blendPhaseSheet,
  })
  return { ...balance, elements, inputs }
}

function buildInputOnlySummaryBalance(
  inputElementSheet: ReferenceBatchWorkbookSheet | undefined,
  blendPhaseSheet: ReferenceBatchWorkbookSheet | undefined
): BalanceData | null {
  if (!inputElementSheet) return null
  const elementRows = sourceElementRows(inputElementSheet)
  if (elementRows.length === 0) return null
  let elements = elementRows.map((row, index) => ({
    label: row.label,
    percentageIndex: 3 + index * 2,
    massIndex: 4 + index * 2,
  }))
  const columns = inputMaterialColumnsFromSheet(inputElementSheet)
  const hasBlendWater = columns.some((column) => column.isBlendMember && column.waterMass > EPSILON) ||
    (columns.some((column) => column.isBlendMember) && findRowByLabel(inputElementSheet, /含水量|含水/) != null)
  const hasAnyWater = hasBlendWater || columns.some((column) => column.waterMass > EPSILON)
  elements = ensureBalanceElements(elements, hasAnyWater ? ['H', 'O'] : [])
  const inputs = buildOrderedSummaryInputs({
    balance: { elements, inputs: [], outputs: [] },
    elements,
    inputElementSheet,
    blendPhaseSheet,
  })
  return { elements, inputs, outputs: [] }
}

function elementPercentage(item: BalanceItem, element: BalanceElement) {
  return numberValue(item.values[element.percentageIndex])
}

function elementMass(item: BalanceItem, element: BalanceElement) {
  const rawExplicit = item.values[element.massIndex]
  if (rawExplicit != null && String(rawExplicit).trim() !== '') return numberValue(rawExplicit)
  return item.hourlyMass * elementPercentage(item, element) / 100
}

function modalTemperature(values: number[]): number | '' {
  if (values.length === 0) return ''
  const counts = new Map<string, { value: number; count: number; firstIndex: number }>()
  values.forEach((value, index) => {
    const key = value.toFixed(6)
    const current = counts.get(key)
    if (current) current.count += 1
    else counts.set(key, { value, count: 1, firstIndex: index })
  })
  return [...counts.values()].sort((left, right) =>
    right.count - left.count || left.firstIndex - right.firstIndex
  )[0]?.value ?? ''
}

function heatSectionTemperatureData(section: ReferenceBatchReportSection | undefined) {
  const temperatures = new Map<string, number>()
  const physicalTemperatures: number[] = []
  for (const row of section?.rows ?? []) {
    const heatType = String(row.values[0] ?? '').trim()
    const material = String(row.values[1] ?? '').trim()
    const rawTemperature = row.values[2]
    if (
      !material ||
      (heatType && !heatType.includes('物理热')) ||
      rawTemperature == null ||
      String(rawTemperature).trim() === ''
    ) continue
    const temperature = numberValue(rawTemperature)
    temperatures.set(normalizedName(material), temperature)
    physicalTemperatures.push(temperature)
  }
  return { temperatures, fallback: modalTemperature(physicalTemperatures) }
}

function findTemperatureMaps(sheet: ReferenceBatchWorkbookSheet | undefined) {
  const sections = sheet?.reportSections ?? []
  const inputSection = sections.find((section) => /热收入|投入/.test(section.title)) ?? sections[0]
  const outputSection = sections.find((section) => /热支出|产出/.test(section.title)) ?? sections[1]
  return {
    input: heatSectionTemperatureData(inputSection),
    output: heatSectionTemperatureData(outputSection),
  }
}

function buildMaterialBalanceSheet(
  balance: BalanceData,
  heatSummary: ReferenceBatchWorkbookSheet | undefined,
  inputPhaseSheet: ReferenceBatchWorkbookSheet | undefined,
  outputPhaseSheet: ReferenceBatchWorkbookSheet | undefined
): PreparedReferenceBatchSheet {
  const temperatureData = findTemperatureMaps(heatSummary)
  const inputPhysicalMasses = buildInputPhysicalMassMap(inputPhaseSheet)
  const inputGasVolumes = buildInputGasVolumeMap(inputPhaseSheet)
  const outputGasVolumes = buildOutputGasVolumeMap(outputPhaseSheet)
  const outputs = balance.outputs
  const columns: ReferenceBatchExportColumn[] = [
    ...['名称', '℃', 'Pa', 'g/cm3', 't/h', 'm3/h', 'Nm3/h'].map((subHeader) => ({ header: '投入', subHeader })),
    ...['名称', '℃', 'Pa', 'g/cm3', 't/h', 'm3/h', 'Nm3/h'].map((subHeader) => ({ header: '产出', subHeader })),
  ]
  const rowCount = Math.max(balance.inputs.length, outputs.length)
  const rows: ReferenceBatchExportRow[] = Array.from({ length: rowCount }, (_, index) => {
    const input = balance.inputs[index]
    const output = outputs[index]
    const inputMass = input
      ? inputPhysicalMasses.get(normalizedName(input.name)) ?? input.hourlyMass
      : undefined
    const inputTemperature = input
      ? temperatureData.input.temperatures.get(normalizedName(input.name)) ?? temperatureData.input.fallback
      : ''
    const outputTemperature = output
      ? temperatureData.output.temperatures.get(normalizedName(output.name)) ?? temperatureData.output.fallback
      : ''
    const inputPhysical = gasPhysicalValues(
      inputMass,
      inputTemperature,
      input ? inputGasVolumes.get(normalizedName(input.name)) : undefined
    )
    const outputPhysical = gasPhysicalValues(
      output?.hourlyMass,
      outputTemperature,
      output ? outputGasVolumes.get(normalizedName(output.name)) : undefined
    )
    return {
      label: String(index + 1),
      values: [
        input?.name ?? '',
        inputTemperature,
        input ? STANDARD_PRESSURE_PA : '',
        inputPhysical[0],
        inputMass ?? '',
        inputPhysical[1],
        inputPhysical[2],
        output?.name ?? '',
        outputTemperature,
        output ? STANDARD_PRESSURE_PA : '',
        outputPhysical[0],
        output?.hourlyMass ?? '',
        outputPhysical[1],
        outputPhysical[2],
      ],
    }
  })
  const inputTotalMass = sum(balance.inputs.map((item) =>
    inputPhysicalMasses.get(normalizedName(item.name)) ?? item.hourlyMass
  ))
  const inputActualVolume = sum(rows.map((row) => numberValue(row.values[5])))
  const inputStandardVolume = sum(rows.map((row) => numberValue(row.values[6])))
  const outputActualVolume = sum(rows.map((row) => numberValue(row.values[12])))
  const outputStandardVolume = sum(rows.map((row) => numberValue(row.values[13])))
  rows.push({
    label: '',
    values: [
      '合计', '', '', '', inputTotalMass, inputActualVolume || '', inputStandardVolume || '',
      '合计', '', '', '', sum(outputs.map((item) => item.hourlyMass)), outputActualVolume || '', outputStandardVolume || '',
    ],
    role: 'total',
  })
  return {
    tableNumber: '1',
    directCaption: true,
    title: '投入产出物料平衡',
    columns,
    rows,
    rowHeaderLabel: '№',
    unitNote: '温度 ℃；压力 Pa；密度 g/cm³；质量流量 t/h；体积流量 m³/h、Nm³/h',
    columnWidthWeights: [0.55, 1.5, 0.72, 0.9, 0.9, 0.9, 1, 1, 1.5, 0.72, 0.9, 0.9, 0.9, 1, 1],
    reportDensity: 'compact',
  }
}

function buildElementPercentageSheet(balance: BalanceData): PreparedReferenceBatchSheet {
  const columns: ReferenceBatchExportColumn[] = [
    { header: '元素', subHeader: '元素' },
    ...balance.inputs.map((item) => ({ header: '投入 /w%', subHeader: item.name })),
    ...balance.outputs.map((item) => ({ header: '产出 /w%', subHeader: item.name })),
  ]
  const rows: ReferenceBatchExportRow[] = balance.elements.map((element, index) => ({
    label: String(index + 1),
    values: [
      displayFormulaLabel(element.label),
      ...balance.inputs.map((item) => elementPercentage(item, element)),
      ...balance.outputs.map((item) => elementPercentage(item, element)),
    ],
  }))
  rows.push({
    label: '',
    values: ['合计', ...balance.inputs.map(() => 100), ...balance.outputs.map(() => 100)],
    role: 'total',
  })
  return {
    tableNumber: '2',
    title: '元素百分含量',
    columns,
    rows,
    rowHeaderLabel: '№',
    unitNote: '元素组成 w%',
    reportDensity: 'compact',
  }
}

function phaseRowIsFlow(label: string) {
  const compact = label.replace(/\s+/g, '').toLowerCase()
  return compact.includes('t/h') || compact.includes('投入量') || compact === '合计'
}

type InputPhaseStream = {
  name: string
  mass: number
  phases: Array<{ label: string; mass: number }>
  sourceColumn?: ReferenceBatchExportColumn
}

function isMainFeedColumn(column: ReferenceBatchExportColumn) {
  const header = column.header.replace(/\s+/g, '')
  const name = (column.subHeader || column.header).replace(/\s+/g, '')
  if (/^其他|^气\d*$|熔剂|燃料|气体|空气|氧气|富氧|漏风|蒸汽|冷却水/.test(header)) return false
  if (/原料|混料|精矿/.test(header)) return true
  return !/熔剂|燃料|煤|焦|空气|氧气|富氧|漏风|蒸汽|冷却水|天然气|煤气/.test(name)
}

type InputPhaseGroup = 'blend' | 'solvent' | 'fuel' | 'gas' | 'other'

function inputPhaseGroup(column: ReferenceBatchExportColumn): InputPhaseGroup {
  const header = compactLabel(column.header)
  const name = compactLabel(column.subHeader || column.header)
  if (isBlendInputColumn(column)) return 'blend'
  if (/熔剂/.test(header) || /熔剂/.test(name)) return 'solvent'
  if (/燃料|煤|焦|天然气|煤气/.test(header) || /燃料|煤|焦|天然气|煤气/.test(name)) return 'fuel'
  if (
    /^气\d*$|气体|空气|氧气|富氧|一次风|二次风|漏风|蒸汽|冷却水/.test(header) ||
    /气体|空气|氧气|富氧|一次风|二次风|漏风|蒸汽|冷却水/.test(name)
  ) {
    return 'gas'
  }
  return 'other'
}

function phaseLabelForSummary(label: string) {
  const compact = compactLabel(label).toLowerCase()
  if (compact.includes('含水') || compact.includes('游离水') || compact === 'h2o') return 'H2O'
  return label
}

function mergeInputPhaseStreams(name: string, streams: InputPhaseStream[]): InputPhaseStream | null {
  const mass = sum(streams.map((stream) => stream.mass))
  if (mass <= EPSILON) return null
  const phases = new Map<string, { label: string; mass: number }>()
  for (const stream of streams) {
    for (const phase of stream.phases) {
      const label = phaseLabelForSummary(phase.label)
      const key = normalizedName(label)
      const current = phases.get(key)
      if (current) current.mass += phase.mass
      else phases.set(key, { label, mass: phase.mass })
    }
  }
  return {
    name,
    mass,
    phases: [...phases.values()].filter((phase) => Math.abs(phase.mass) > EPSILON),
  }
}

function blendPhaseStreams(
  blendSheet: ReferenceBatchWorkbookSheet | undefined,
  fallbackWaterMass: number
): InputPhaseStream[] {
  if (!blendSheet) return []
  const columnIndex = blendSheet.columns.findIndex((column) => (column.subHeader || column.header).trim())
  if (columnIndex < 0) return []
  const name = (blendSheet.columns[columnIndex].subHeader || blendSheet.columns[columnIndex].header).trim()
  if (!name) return []
  const dryMass = blendPhaseSheetMass(blendSheet, /t\/h.*干基|干基量|投入量/)
  const waterRow = findRowByLabel(blendSheet, /含水量|含水/)
  const waterMass = numberValue(waterRow?.values[columnIndex]) || fallbackWaterMass
  const phaseRows = blendSheet.rows.filter(
    (row) => row.role !== 'section' && row.role !== 'total' && !phaseRowIsFlow(row.label)
  )
  const streams: InputPhaseStream[] = []
  if (dryMass > EPSILON) {
    streams.push({
      name,
      mass: dryMass,
      phases: phaseRows
        .map((row) => ({
          label: row.label,
          mass: dryMass * numberValue(row.values[columnIndex]) / 100,
        }))
        .filter((phase) => Math.abs(phase.mass) > EPSILON),
    })
  }
  if (waterMass > EPSILON) {
    streams.push({
      name: SUMMARY_INPUT_WATER_NAME,
      mass: waterMass,
      phases: [{ label: 'H2O', mass: waterMass }],
    })
  }
  return streams
}

function splitBlendStreams(
  name: string,
  streams: InputPhaseStream[]
): InputPhaseStream[] {
  const merged = mergeInputPhaseStreams(name, streams)
  if (!merged) return []
  const waterMass = sum(merged.phases
    .filter((phase) => phaseLabelForSummary(phase.label) === 'H2O')
    .map((phase) => phase.mass))
  const dryMass = Math.max(0, merged.mass - waterMass)
  const results: InputPhaseStream[] = []
  if (dryMass > EPSILON) {
    results.push({
      name,
      mass: dryMass,
      phases: merged.phases.filter((phase) => phaseLabelForSummary(phase.label) !== 'H2O'),
    })
  }
  if (waterMass > EPSILON) {
    results.push({
      name: SUMMARY_INPUT_WATER_NAME,
      mass: waterMass,
      phases: [{ label: 'H2O', mass: waterMass }],
    })
  }
  return results
}

function phaseGroupLabel(group: InputPhaseGroup, streams: InputPhaseStream[]) {
  if (group === 'solvent') return '熔剂'
  if (group === 'gas') return '气'
  if (group === 'fuel') {
    return streams.length === 1 && /煤/.test(streams[0].name) ? '煤' : '燃料'
  }
  return streams.length === 1 ? streams[0].name : '其他'
}

function inputPhaseStreamsFromMassSheet(sheet: ReferenceBatchWorkbookSheet, mainFeedOnly = false) {
  const amountRow = sheet.rows.find((row) => row.label.includes('投入量'))
  const phaseRows = sheet.rows.filter(
    (row) => row.role !== 'section' && row.role !== 'total' && !phaseRowIsFlow(row.label)
  )
  return sheet.columns.flatMap((column, columnIndex): InputPhaseStream[] => {
    if (mainFeedOnly && !isMainFeedColumn(column)) return []
    const mass = numberValue(amountRow?.values[columnIndex])
    if (mass <= EPSILON) return []
    return [{
      name: column.subHeader || column.header,
      mass,
      sourceColumn: column,
      phases: phaseRows
        .map((row) => ({ label: row.label, mass: numberValue(row.values[columnIndex]) }))
        .filter((phase) => Math.abs(phase.mass) > EPSILON),
    }]
  })
}

function inputPhaseStreamsFromPercentageSheet(
  sheet: ReferenceBatchWorkbookSheet,
  balance: BalanceData | null,
  mainFeedOnly: boolean
) {
  const materialByName = new Map((balance?.inputs ?? []).map((item) => [normalizedName(item.name), item]))
  const amountRow = sheet.rows.find((row) => /t\/h.*干基|投入量/.test(row.label.replace(/\s+/g, '')))
  const phaseRows = sheet.rows.filter(
    (row) => row.role !== 'section' && row.role !== 'total' && !phaseRowIsFlow(row.label)
  )
  return sheet.columns.flatMap((column, columnIndex): InputPhaseStream[] => {
    if (mainFeedOnly && !isMainFeedColumn(column)) return []
    const name = column.subHeader || column.header
    const mass = numberValue(amountRow?.values[columnIndex]) || materialByName.get(normalizedName(name))?.hourlyMass || 0
    if (mass <= EPSILON) return []
    return [{
      name,
      mass,
      sourceColumn: column,
      phases: phaseRows
        .map((row) => ({ label: row.label, mass: mass * numberValue(row.values[columnIndex]) / 100 }))
        .filter((phase) => Math.abs(phase.mass) > EPSILON),
    }]
  })
}

function buildInputPhaseStreams(
  blendSheet: ReferenceBatchWorkbookSheet | undefined,
  massSheet: ReferenceBatchWorkbookSheet | undefined,
  percentageSheet: ReferenceBatchWorkbookSheet | undefined,
  balance: BalanceData | null
) {
  const sourceStreams = massSheet
    ? inputPhaseStreamsFromMassSheet(massSheet)
    : percentageSheet
      ? inputPhaseStreamsFromPercentageSheet(percentageSheet, balance, false)
      : []
  if (sourceStreams.length === 0 && !blendSheet) return []

  const grouped = new Map<InputPhaseGroup, InputPhaseStream[]>()
  for (const stream of sourceStreams) {
    const group = stream.sourceColumn ? inputPhaseGroup(stream.sourceColumn) : 'other'
    const current = grouped.get(group) ?? []
    current.push(stream)
    grouped.set(group, current)
  }

  const rawStreams = grouped.get('blend') ?? []
  const rawWaterMass = sum(rawStreams.flatMap((stream) =>
    stream.phases
      .filter((phase) => phaseLabelForSummary(phase.label) === 'H2O')
      .map((phase) => phase.mass)
  ))
  const blendStreams = blendPhaseStreams(blendSheet, rawWaterMass)
  const resolvedBlendStreams = blendStreams.length > 0
    ? blendStreams
    : splitBlendStreams(findSummaryBlendName(blendSheet, undefined), rawStreams)
  const inputs: InputPhaseStream[] = []
  inputs.push(...resolvedBlendStreams)
  for (const group of ['solvent', 'gas', 'fuel', 'other'] as const) {
    const streams = grouped.get(group) ?? []
    const merged = mergeInputPhaseStreams(phaseGroupLabel(group, streams), streams)
    if (merged) inputs.push(merged)
  }
  return inputs
}

function blendDryPhaseStream(
  blendSheet: ReferenceBatchWorkbookSheet | undefined,
  fallbackStreams: InputPhaseStream[]
): InputPhaseStream | null {
  if (!blendSheet) return mergeInputPhaseStreams('混料', fallbackStreams)
  const columnIndex = blendSheet.columns.findIndex((column) => (column.subHeader || column.header).trim())
  if (columnIndex < 0) return mergeInputPhaseStreams('混料', fallbackStreams)
  const name = (blendSheet.columns[columnIndex].subHeader || blendSheet.columns[columnIndex].header).trim()
  const dryMass = blendPhaseSheetMass(blendSheet, /t\/h.*干基|干基量|投入量/)
  if (!name || dryMass <= EPSILON) return mergeInputPhaseStreams(name || '混料', fallbackStreams)
  const phaseRows = blendSheet.rows.filter(
    (row) => row.role !== 'section' && row.role !== 'total' && !phaseRowIsFlow(row.label)
  )
  return mergeInputPhaseStreams(name, [{
    name,
    mass: dryMass,
    phases: phaseRows
      .map((row) => ({ label: row.label, mass: dryMass * numberValue(row.values[columnIndex]) / 100 }))
      .filter((phase) => Math.abs(phase.mass) > EPSILON),
  }])
}

function blendWaterPhaseStream(
  blendSheet: ReferenceBatchWorkbookSheet | undefined,
  fallbackWaterMass: number
): InputPhaseStream | null {
  if (!blendSheet) {
    return fallbackWaterMass > EPSILON
      ? { name: SUMMARY_INPUT_WATER_NAME, mass: fallbackWaterMass, phases: [{ label: 'H2O', mass: fallbackWaterMass }] }
      : null
  }
  const columnIndex = blendSheet.columns.findIndex((column) => (column.subHeader || column.header).trim())
  if (columnIndex < 0) return null
  const waterRow = findRowByLabel(blendSheet, /含水量|含水/)
  const waterMass = numberValue(waterRow?.values[columnIndex]) || fallbackWaterMass
  return waterMass > EPSILON
    ? { name: SUMMARY_INPUT_WATER_NAME, mass: waterMass, phases: [{ label: 'H2O', mass: waterMass }] }
    : null
}

function buildInputPhaseCompositionStreams(
  blendSheet: ReferenceBatchWorkbookSheet | undefined,
  percentageSheet: ReferenceBatchWorkbookSheet | undefined,
  balance: BalanceData | null
) {
  const sourceStreams = percentageSheet
    ? inputPhaseStreamsFromPercentageSheet(percentageSheet, balance, false)
    : []
  const grouped = new Map<InputPhaseGroup, InputPhaseStream[]>()
  for (const stream of sourceStreams) {
    const group = stream.sourceColumn ? inputPhaseGroup(stream.sourceColumn) : 'other'
    const current = grouped.get(group) ?? []
    current.push(stream)
    grouped.set(group, current)
  }

  const inputs: InputPhaseStream[] = []
  const blend = blendDryPhaseStream(blendSheet, grouped.get('blend') ?? [])
  if (blend) inputs.push(blend)
  const fallbackWaterMass = balance?.inputs.find(
    (item) => normalizedName(item.name) === normalizedName(SUMMARY_INPUT_WATER_NAME)
  )?.hourlyMass ?? 0
  const water = blendWaterPhaseStream(blendSheet, fallbackWaterMass)
  if (water) inputs.push(water)
  inputs.push(...sourceStreams.filter((stream) =>
    (stream.sourceColumn ? inputPhaseGroup(stream.sourceColumn) : 'other') !== 'blend'
  ))
  return inputs
}

function buildPhaseOverviewSheet({
  blendPhaseSheet,
  inputMassSheet,
  inputPercentageSheet,
  outputPhaseSheet,
  balance,
}: {
  blendPhaseSheet?: ReferenceBatchWorkbookSheet
  inputMassSheet?: ReferenceBatchWorkbookSheet
  inputPercentageSheet?: ReferenceBatchWorkbookSheet
  outputPhaseSheet?: ReferenceBatchWorkbookSheet
  balance: BalanceData | null
}): PreparedReferenceBatchSheet | null {
  const inputStreams = buildInputPhaseStreams(blendPhaseSheet, inputMassSheet, inputPercentageSheet, balance)
  const outputProducts = (outputPhaseSheet?.rows ?? [])
    .filter((row) => row.role !== 'section' && row.role !== 'total' && row.label.trim())
    .map((row) => ({ name: row.label, mass: numberValue(row.values[0]), values: row.values }))
  if (inputStreams.length === 0 && outputProducts.length === 0) return null

  const outputPhaseColumns = (outputPhaseSheet?.columns ?? [])
    .map((column, index) => ({ label: column.subHeader || column.header, index }))
    .filter((column) => column.index > 0 && !column.label.includes('合计'))
  const phaseLabels: string[] = []
  const addLabel = (label: string) => {
    if (!label || phaseLabels.some((item) => normalizedName(item) === normalizedName(label))) return
    phaseLabels.push(label)
  }
  inputStreams.forEach((stream) => stream.phases.forEach((phase) => addLabel(phase.label)))
  outputPhaseColumns.forEach((phase) => {
    if (outputProducts.some((product) => Math.abs(numberValue(product.values[phase.index])) > EPSILON)) addLabel(phase.label)
  })

  const outputPhaseIndex = new Map(outputPhaseColumns.map((phase) => [normalizedName(phase.label), phase.index]))
  const rows: ReferenceBatchExportRow[] = [
    { label: '物料量', values: [...inputStreams.map((stream) => stream.mass), ...outputProducts.map((product) => product.mass)] },
    ...phaseLabels.map((label) => ({
      label: displayFormulaLabel(label),
      values: [
        ...inputStreams.map((stream) =>
          stream.phases.find((phase) => normalizedName(phase.label) === normalizedName(label))?.mass ?? 0
        ),
        ...outputProducts.map((product) => {
          const index = outputPhaseIndex.get(normalizedName(label))
          return index == null ? 0 : product.mass * numberValue(product.values[index]) / 100
        }),
      ],
    })),
    {
      label: '合计',
      values: [...inputStreams.map((stream) => stream.mass), ...outputProducts.map((product) => product.mass)],
      role: 'total',
    },
  ]
  return {
    tableNumber: '3',
    title: '物相组成',
    columns: [
      ...inputStreams.map((stream) => ({ header: '投入', subHeader: stream.name })),
      ...outputProducts.map((product) => ({ header: '产出', subHeader: product.name })),
    ],
    rows,
    rowHeaderLabel: '物相',
    unitNote: '物料及物相质量 t/h',
    reportDensity: 'compact',
  }
}

function phaseEntriesForMaterial(sheet: ReferenceBatchWorkbookSheet | undefined, materialName: string) {
  if (!sheet) return []
  const columnIndex = sheet.columns.findIndex(
    (column) => normalizedName(column.subHeader ?? column.header) === normalizedName(materialName)
  )
  if (columnIndex < 0) return []
  return sheet.rows
    .filter((row) => row.role !== 'section' && row.role !== 'total' && !phaseRowIsFlow(row.label))
    .map((row) => ({ label: row.label, value: numberValue(row.values[columnIndex]) }))
    .filter((row) => Math.abs(row.value) > EPSILON)
}

function phaseEntriesForMaterialFromSheets(
  sheets: Array<ReferenceBatchWorkbookSheet | undefined>,
  materialName: string
) {
  for (const sheet of sheets) {
    const entries = phaseEntriesForMaterial(sheet, materialName)
    if (entries.length > 0) return entries
  }
  return []
}

function filterMaterialDetailSheet(sheet: ReferenceBatchWorkbookSheet): ReferenceBatchWorkbookSheet {
  const columns = sheet.columns.map((column) => ({
    header: displayFormulaLabel(column.header),
    subHeader: column.subHeader == null ? column.subHeader : displayFormulaLabel(column.subHeader),
  }))
  const phaseValueColumnIndex = sheet.columns.findIndex((column) => {
    const label = `${column.header} ${column.subHeader ?? ''}`.replace(/\s+/g, '').toLowerCase()
    return label.includes('w%')
  })
  if (phaseValueColumnIndex < 0) return { ...sheet, columns }
  const rows = sheet.rows.filter((row) => {
    if (row.role === 'section' || row.role === 'total') return true
    if (!row.label.trim()) return false
    return Math.abs(numberValue(row.values[phaseValueColumnIndex])) > EPSILON
  }).map((row) => row.role === 'section' || row.role === 'total'
    ? row
    : { ...row, label: displayFormulaLabel(row.label) })
  return { ...sheet, columns, rows }
}

function synthesizeMaterialDetailSheet(
  item: BalanceItem,
  elements: BalanceElement[],
  phaseSourceSheets: Array<ReferenceBatchWorkbookSheet | undefined>
): ReferenceBatchWorkbookSheet {
  const phases = phaseEntriesForMaterialFromSheets(phaseSourceSheets, item.name)
  const elementRows = elements
    .map((element) => ({ label: element.label, value: elementPercentage(item, element) }))
    .filter((row) => Math.abs(row.value) > EPSILON)
  const rowCount = Math.max(phases.length, elementRows.length)
  const rows: ReferenceBatchExportRow[] = Array.from({ length: rowCount }, (_, index) => ({
    label: String(index + 1),
    values: [
      phases[index] ? displayFormulaLabel(phases[index].label) : '',
      phases[index]?.value ?? '',
      elementRows[index] ? displayFormulaLabel(elementRows[index].label) : '',
      elementRows[index]?.value ?? '',
    ],
  }))
  rows.push({
    label: '',
    values: [
      '合计',
      phases.length > 0 ? sum(phases.map((phase) => phase.value)) : '',
      '合计',
      sum(elementRows.map((element) => element.value)),
    ],
    role: 'total',
  })
  return {
    title: `投入物料物相及元素组成-${item.name}`,
    columns: [
      { header: '物相组成', subHeader: '组分' },
      { header: '物相组成', subHeader: 'w%' },
      { header: '元素组成', subHeader: '元素' },
      { header: '元素组成', subHeader: 'w%' },
    ],
    rows,
    rowHeaderLabel: '№',
    unitNote: '物相及元素组成 w%',
    reportDensity: 'compact',
  }
}

function buildMaterialDetailSheets({
  detailedSheets,
  inputPercentageSheet,
  blendPhaseSheet,
  sourceBalance,
  balance,
}: {
  detailedSheets: ReferenceBatchWorkbookSheet[]
  inputPercentageSheet?: ReferenceBatchWorkbookSheet
  blendPhaseSheet?: ReferenceBatchWorkbookSheet
  sourceBalance: BalanceData | null
  balance: BalanceData | null
}): PreparedReferenceBatchSheet[] {
  const results: ReferenceBatchWorkbookSheet[] = []
  const selectedNames = new Map<string, string>()
  const addSelectedName = (name: string) => {
    if (!name.trim()) return
    selectedNames.set(normalizedName(name), name)
  }
  for (const column of inputPercentageSheet?.columns ?? []) {
    if (!isBlendInputColumn(column)) continue
    const name = column.subHeader || column.header
    addSelectedName(name)
  }
  for (const column of blendPhaseSheet?.columns ?? []) {
    const name = column.subHeader || column.header
    addSelectedName(name)
  }
  const detailByName = new Map(detailedSheets.map((sheet) => {
    const name = sheet.title.replace(/^物相成分\s*/, '')
    return [normalizedName(name), sheet] as const
  }))
  const materialByName = new Map<string, BalanceItem>()
  for (const item of sourceBalance?.inputs ?? []) materialByName.set(normalizedName(item.name), item)
  for (const item of balance?.inputs ?? []) {
    const key = normalizedName(item.name)
    materialByName.set(key, item)
  }
  const blendSummaryNames = new Set((blendPhaseSheet?.columns ?? [])
    .map((column) => normalizedName(column.subHeader || column.header))
    .filter(Boolean))
  const phaseSourceSheetsFor = (normalized: string) =>
    blendSummaryNames.has(normalized)
      ? [blendPhaseSheet, inputPercentageSheet]
      : [inputPercentageSheet, blendPhaseSheet]
  const hasStructuredDetailSource = inputPercentageSheet != null || blendPhaseSheet != null
  const namesToExport = selectedNames.size > 0
    ? [...selectedNames.entries()]
    : hasStructuredDetailSource
      ? []
      : detailedSheets.map((sheet) => {
          const name = sheet.title.replace(/^物相成分\s*/, '')
          return [normalizedName(name), name] as const
        })

  for (const [normalized, displayName] of namesToExport) {
    const exact = detailByName.get(normalized)
    const item = materialByName.get(normalized)
    const phaseSourceSheets = phaseSourceSheetsFor(normalized)
    if (exact && !blendSummaryNames.has(normalized)) {
      results.push({
        ...filterMaterialDetailSheet(exact),
        title: `投入物料物相及元素组成-${displayName}`,
      })
    } else if (item) {
      results.push(synthesizeMaterialDetailSheet(item, sourceBalance?.elements ?? balance?.elements ?? [], phaseSourceSheets))
    }
  }
  if (namesToExport.length === 0) {
    for (const item of balance?.inputs ?? []) {
      const phaseSourceSheets = phaseSourceSheetsFor(normalizedName(item.name))
      if (!phaseEntriesForMaterialFromSheets(phaseSourceSheets, item.name).length) continue
      results.push(synthesizeMaterialDetailSheet(item, balance?.elements ?? [], phaseSourceSheets))
    }
  }
  return results.map((sheet, index) => ({
    ...sheet,
    tableNumber: `3-${index + 1}`,
    title: sheet.title.replace(/^物相成分\s*/, '投入物料物相及元素组成-'),
  }))
}

function buildElementMassSheet(balance: BalanceData): PreparedReferenceBatchSheet {
  const columns: ReferenceBatchExportColumn[] = [
    { header: '元素', subHeader: '元素' },
    ...balance.inputs.map((item) => ({ header: '投入 t/h', subHeader: item.name })),
    { header: '投入 t/h', subHeader: '合计' },
    ...balance.outputs.map((item) => ({ header: '产出 t/h', subHeader: item.name })),
    { header: '产出 t/h', subHeader: '合计' },
  ]
  const rows: ReferenceBatchExportRow[] = balance.elements.map((element, index) => {
    const inputMasses = balance.inputs.map((item) => elementMass(item, element))
    const outputMasses = balance.outputs.map((item) => elementMass(item, element))
    return {
      label: String(index + 1),
      values: [displayFormulaLabel(element.label), ...inputMasses, sum(inputMasses), ...outputMasses, sum(outputMasses)],
    }
  })
  rows.push({
    label: '',
    values: [
      '合计',
      ...balance.inputs.map((item) => item.hourlyMass),
      sum(balance.inputs.map((item) => item.hourlyMass)),
      ...balance.outputs.map((item) => item.hourlyMass),
      sum(balance.outputs.map((item) => item.hourlyMass)),
    ],
    role: 'total',
  })
  return {
    tableNumber: '4',
    title: '元素质量平衡',
    columns,
    rows,
    rowHeaderLabel: '№',
    unitNote: '元素质量 t/h',
    reportDensity: 'compact',
  }
}

function buildElementDistributionSheet(balance: BalanceData): PreparedReferenceBatchSheet {
  const columns: ReferenceBatchExportColumn[] = [
    { header: '元素', subHeader: '元素' },
    ...balance.inputs.map((item) => ({ header: '投入', subHeader: item.name })),
    { header: '投入', subHeader: '合计' },
    ...balance.outputs.map((item) => ({ header: '产出', subHeader: item.name })),
    { header: '产出', subHeader: '合计' },
  ]
  return {
    tableNumber: '5',
    title: '元素分配系数(%)',
    columns,
    rows: balance.elements.map((element, index) => {
      const inputMasses = balance.inputs.map((item) => elementMass(item, element))
      const outputMasses = balance.outputs.map((item) => elementMass(item, element))
      const inputTotal = sum(inputMasses)
      const outputTotal = sum(outputMasses)
      return {
        label: String(index + 1),
        values: [
          displayFormulaLabel(element.label),
          ...inputMasses.map((mass) => inputTotal > EPSILON ? mass / inputTotal * 100 : 0),
          inputTotal > EPSILON ? 100 : 0,
          ...outputMasses.map((mass) => outputTotal > EPSILON ? mass / outputTotal * 100 : 0),
          outputTotal > EPSILON ? 100 : 0,
        ],
      }
    }),
    rowHeaderLabel: '№',
    unitNote: '元素分配系数 %',
    reportDensity: 'compact',
  }
}

function annualBalanceRows(
  side: '投入' | '产出',
  items: BalanceItem[],
  elements: BalanceElement[]
): ReferenceBatchExportRow[] {
  const rows: ReferenceBatchExportRow[] = [{ label: side, values: [], role: 'section' }]
  items.forEach((item, index) => {
    rows.push({
      label: String(index + 1),
      values: [
        item.name,
        item.hourlyMass * ANNUAL_OPERATING_HOURS,
        item.hourlyMass * 24,
        item.hourlyMass,
        ...elements.flatMap((element) => [
          elementPercentage(item, element),
          elementMass(item, element) * ANNUAL_OPERATING_HOURS,
        ]),
      ],
    })
  })
  const totalMass = sum(items.map((item) => item.hourlyMass))
  rows.push({
    label: '',
    values: [
      '合计',
      totalMass * ANNUAL_OPERATING_HOURS,
      totalMass * 24,
      totalMass,
      ...elements.flatMap((element) => {
        const mass = sum(items.map((item) => elementMass(item, element)))
        return [totalMass > EPSILON ? mass / totalMass * 100 : 0, mass * ANNUAL_OPERATING_HOURS]
      }),
    ],
    role: 'total',
  })
  return rows
}

function buildAnnualElementBalanceSheet(balance: BalanceData): PreparedReferenceBatchSheet {
  return {
    tableNumber: '6',
    title: '元素质量年平衡',
    columns: [
      { header: '物料名称', subHeader: '物料名称' },
      { header: '处理量', subHeader: 't/a' },
      { header: '处理量', subHeader: 't/d' },
      { header: '处理量', subHeader: 't/h' },
      ...balance.elements.flatMap((element) => [
        { header: displayFormulaLabel(element.label), subHeader: '%' },
        { header: displayFormulaLabel(element.label), subHeader: 't/a' },
      ]),
    ],
    rows: [
      ...annualBalanceRows('投入', balance.inputs, balance.elements),
      ...annualBalanceRows('产出', balance.outputs, balance.elements),
    ],
    rowHeaderLabel: '№',
    unitNote: '物料量 t/a、t/d、t/h；元素组成 w%；元素量 t/a',
    reportDensity: 'compact',
  }
}

function buildPairedPhaseSheet(
  source: ReferenceBatchWorkbookSheet,
  tableNumber: string,
  title: string,
  mode: 'input' | 'output',
  inputStreams?: InputPhaseStream[]
): PreparedReferenceBatchSheet {
  const outputPhaseEntries = (row: ReferenceBatchExportRow) => {
    const entries = source.columns
      .map((column, columnIndex) => ({
        label: column.subHeader || column.header,
        value: numberValue(row.values[columnIndex]),
        columnIndex,
      }))
      .filter((entry) => entry.columnIndex > 0 && !entry.label.includes('合计'))
    const nonZeroEntries = entries.filter((entry) => Math.abs(entry.value) > EPSILON)
    if (nonZeroEntries.length > 0) {
      return nonZeroEntries.map(({ label, value }) => ({ label, value }))
    }

    const declaredPhaseKeys = row.phaseRowKeys ?? []
    if (declaredPhaseKeys.length > 0) {
      const entriesByKey = new Map(entries.map((entry) => [normalizedPhaseKey(entry.label), entry]))
      const usedKeys = new Set<string>()
      return declaredPhaseKeys.flatMap((phaseKey) => {
        const normalizedKey = normalizedPhaseKey(phaseKey)
        if (!normalizedKey || usedKeys.has(normalizedKey)) return []
        usedKeys.add(normalizedKey)
        const entry = entriesByKey.get(normalizedKey)
        return [{ label: entry?.label ?? phaseKey, value: entry?.value ?? 0 }]
      })
    }

    if (row.productKey === 'fugitive' || row.label.includes('无组织排放')) {
      const sulfurDioxide = entries.find((entry) => normalizedPhaseKey(entry.label) === 'so2')
      return [{ label: sulfurDioxide?.label ?? 'SO2', value: sulfurDioxide?.value ?? 0 }]
    }

    return []
  }

  const groups = mode === 'input'
    ? inputStreams && inputStreams.length > 0
      ? inputStreams.map((stream) => ({
          name: stream.name,
          entries: stream.mass > EPSILON
            ? stream.phases
                .map((phase) => ({ label: phase.label, value: phase.mass / stream.mass * 100 }))
                .filter((entry) => Math.abs(entry.value) > EPSILON)
            : [],
        }))
      : source.columns.map((column, columnIndex) => ({
          name: column.subHeader || column.header,
          entries: source.rows
            .filter((row) => row.role !== 'section' && row.role !== 'total' && !phaseRowIsFlow(row.label))
            .map((row) => ({ label: row.label, value: numberValue(row.values[columnIndex]) }))
            .filter((row) => Math.abs(row.value) > EPSILON),
        }))
    : source.rows
        .filter((row) => row.role !== 'section' && row.role !== 'total' && row.label.trim())
        .map((row) => ({
          name: row.label,
          entries: outputPhaseEntries(row),
        }))
  const maxRows = Math.max(0, ...groups.map((group) => group.entries.length))
  const rows: ReferenceBatchExportRow[] = Array.from({ length: maxRows }, (_, rowIndex) => ({
    label: String(rowIndex + 1),
    values: groups.flatMap((group) => {
      const entry = group.entries[rowIndex]
      return entry ? [displayFormulaLabel(entry.label), entry.value] : ['', '']
    }),
  }))
  rows.push({
    label: '',
    values: groups.flatMap((group) => ['合计', sum(group.entries.map((entry) => entry.value))]),
    role: 'total',
  })
  return {
    tableNumber,
    title,
    columns: groups.flatMap((group) => [
      { header: group.name, subHeader: '组分' },
      { header: group.name, subHeader: 'w%' },
    ]),
    rows,
    rowHeaderLabel: '№',
    unitNote: '物相组成 w%',
    reportDensity: 'compact',
    directCaption: true,
  }
}

function buildSideBySideHeatSummary(
  source: ReferenceBatchWorkbookSheet,
  tableNumber: string
): PreparedReferenceBatchSheet {
  const [income, expenditure] = source.reportSections ?? []
  if (!income || !expenditure) {
    return {
      ...source,
      tableNumber,
      directCaption: true,
      title: '投入产出-热量平衡',
    }
  }
  const rowCount = Math.max(income.rows.length, expenditure.rows.length)
  return {
    tableNumber,
    directCaption: true,
    title: '投入产出-热量平衡',
    columns: [
      ...income.columns.map((column) => ({ header: '热收入', subHeader: column.subHeader || column.header })),
      ...expenditure.columns.map((column) => ({ header: '热支出', subHeader: column.subHeader || column.header })),
    ],
    rows: Array.from({ length: rowCount }, (_, index) => {
      const left = income.rows[index]
      const right = expenditure.rows[index]
      const leftTotal = left?.role === 'total'
      const rightTotal = right?.role === 'total'
      const boldValueIndexes = [
        ...(leftTotal ? income.columns.map((_, valueIndex) => valueIndex) : []),
        ...(rightTotal ? expenditure.columns.map((_, valueIndex) => income.columns.length + valueIndex) : []),
      ]
      return {
        label: left?.label || right?.label || String(index + 1),
        values: [
          ...(left?.values ?? income.columns.map(() => '')),
          ...(right?.values ?? expenditure.columns.map(() => '')),
        ],
        role: leftTotal || rightTotal ? 'total' : 'data',
        boldValueIndexes: boldValueIndexes.length > 0 ? boldValueIndexes : undefined,
      }
    }),
    rowHeaderLabel: '№',
    unitNote: source.unitNote,
    reportDensity: 'compact',
  }
}

function namedSheet(sheets: ReferenceBatchWorkbookSheet[], title: string) {
  return sheets.find((sheet) => sheet.title === title)
}

function sheetWithTitlePart(sheets: ReferenceBatchWorkbookSheet[], titlePart: string) {
  return sheets.find((sheet) => sheet.title.includes(titlePart))
}

export function prepareReferenceBatchSheets(
  sheets: ReferenceBatchWorkbookSheet[]
): PreparedReferenceBatchSheet[] {
  const richBalanceSheet = namedSheet(sheets, '元素投入产出平衡表')
  const inputElementSheet = sheetWithTitlePart(sheets, '投入物料流量及元素组成')
  const inputMassPhaseSheet = namedSheet(sheets, '投入物相质量流量表')
  const inputPercentagePhaseSheet = namedSheet(sheets, '投入结果-物相表')
  const blendPhaseSheet = namedSheet(sheets, '混料结果-物相表')
  const sourceBalance = parseBalanceSheet(richBalanceSheet)
  const balance = sourceBalance
    ? buildSummaryInputBalance(sourceBalance, inputElementSheet, blendPhaseSheet)
    : buildInputOnlySummaryBalance(inputElementSheet, blendPhaseSheet)
  const outputPhaseSheet = namedSheet(sheets, '产出-产物物相表')
  const outputElementSheet = namedSheet(sheets, '产出-产物元素表')
  const inputPhaseCompositionStreams = buildInputPhaseCompositionStreams(
    blendPhaseSheet,
    inputPercentagePhaseSheet,
    balance
  )
  const detailSheets = sheets.filter((sheet) => sheet.title.startsWith('物相成分 '))
  const heatSummary = namedSheet(sheets, '热量平衡总表')
  const inputPhysicalHeat = sheetWithTitlePart(sheets, '投入组分物理热')
  const outputPhysicalHeat = sheetWithTitlePart(sheets, '产物组分物理热')
  const inputEnthalpy = sheetWithTitlePart(sheets, '投入组分热焓')
  const outputEnthalpy = sheetWithTitlePart(sheets, '产物组分热焓')
  const prepared: PreparedReferenceBatchSheet[] = []

  if (sourceBalance && balance) {
    prepared.push(buildMaterialBalanceSheet(balance, heatSummary, inputMassPhaseSheet, outputPhaseSheet))
    prepared.push(buildElementPercentageSheet(balance))
  } else if (balance) {
    prepared.push(buildElementPercentageSheet(balance))
  } else if (inputElementSheet) {
    prepared.push({ ...inputElementSheet, tableNumber: '2', title: '元素百分含量' })
  } else if (outputElementSheet) {
    prepared.push({ ...outputElementSheet, tableNumber: '2', title: '元素百分含量' })
  }

  const phaseOverview = buildPhaseOverviewSheet({
    blendPhaseSheet,
    inputMassSheet: inputMassPhaseSheet,
    inputPercentageSheet: inputPercentagePhaseSheet,
    outputPhaseSheet,
    balance: sourceBalance ?? balance,
  })
  if (phaseOverview) prepared.push(phaseOverview)
  prepared.push(...buildMaterialDetailSheets({
    detailedSheets: detailSheets,
    inputPercentageSheet: inputPercentagePhaseSheet,
    blendPhaseSheet,
    sourceBalance,
    balance,
  }))

  if (sourceBalance && balance) {
    prepared.push(buildElementMassSheet(balance))
    prepared.push(buildElementDistributionSheet(balance))
    prepared.push(buildAnnualElementBalanceSheet(balance))
  }
  if (inputPercentagePhaseSheet) {
    prepared.push(buildPairedPhaseSheet(
      inputPercentagePhaseSheet,
      '7',
      '投入组分含量',
      'input',
      inputPhaseCompositionStreams
    ))
  }
  if (outputPhaseSheet) {
    prepared.push(buildPairedPhaseSheet(outputPhaseSheet, '8', '产出组分含量', 'output'))
  }
  if (heatSummary) {
    prepared.push(buildSideBySideHeatSummary(heatSummary, '9'))
  }
  if (inputPhysicalHeat) {
    prepared.push({ ...inputPhysicalHeat, tableNumber: '10', directCaption: true, title: '投入-组分明细物理热' })
  }
  if (outputPhysicalHeat) {
    prepared.push({ ...outputPhysicalHeat, tableNumber: '11', directCaption: true, title: '产出-组分明细物理热' })
  }
  if (inputEnthalpy) {
    prepared.push({ ...inputEnthalpy, tableNumber: '12', directCaption: true, title: '投入组分热焓ΔH(MJ/h)' })
  }
  if (outputEnthalpy) {
    prepared.push({ ...outputEnthalpy, tableNumber: '13', directCaption: true, title: '产出组分热焓ΔH(MJ/h)' })
  }

  if (prepared.length > 0) return prepared
  return sheets.map((sheet, index) => ({ ...sheet, tableNumber: String(index + 1) }))
}
