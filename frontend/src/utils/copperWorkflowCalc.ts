import {
  calculateCopperHeatBalance,
  calculateCopperProducts,
  type CopperFuelMaterial,
  type CopperHeatBalanceResult,
  type CopperProductResult,
} from './copperProcessCalc.ts'

export const COPPER_ELEMENT_KEYS = [
  'Ag(银)',
  'Al(铝)',
  'As(砷)',
  'Au(金)',
  'C (碳)',
  'Ca(钙)',
  'Cu(铜)',
  'Fe(铁)',
  'N (氮)',
  'O (氧)',
  'Other(其他)',
  'Pb(铅)',
  'S (硫)',
  'Sb(锑)',
  'Si(硅)',
  'Zn(锌)',
] as const

export type CopperElementKey = (typeof COPPER_ELEMENT_KEYS)[number]
export type CopperRatios = Partial<Record<CopperElementKey, number>>

export interface CopperMaterialColumn {
  id: string
  name: string
  kind: 'raw' | 'solvent' | 'fuel' | 'gas'
  weight: number
  ratios: CopperRatios
  unitPrice?: number
}

export interface CopperLibraryMaterial {
  id: string
  name: string
  category: 'concentrate' | 'return' | 'flux'
  ratios: CopperRatios
  unitPrice: number
}

export interface CopperSolvent {
  id: string
  name: '石灰' | '铁矿石'
  unitPrice: number
  composition: {
    'Fe(铁)': number
    'SiO₂(二氧化硅)': number
    'CaO(氧化钙)': number
  }
}

export interface WeightedComposition {
  totalWeight: number
  ratios: Record<CopperElementKey, number>
  elementWeights: Record<CopperElementKey, number>
}

export interface CopperSolventSolution {
  valid: boolean
  solventWeights: Record<string, number>
  /** 炉渣中 Fe 与 Si→SiO₂ 折算质量比（以产出炉渣为基准，非入炉混料比） */
  feSiO2: number
  /** 炉渣中 Ca→CaO 与 Si→SiO₂ 折算质量比 */
  caOSiO2: number
  message?: string
  /** 目标语义：现为炉渣折算比（历史案例可无此字段） */
  targetScope?: 'slag'
}

export interface CopperIterativeHeatSettings {
  feedTemperature: number
  matteTemperature: number
  slagTemperature: number
  gasTemperature: number
  dustTemperature: number
  heatLossMJh: number
  otherHeatMJh: number
}

export interface CopperOxygenAirSettings {
  oxygenPct: number
  nitrogenPct: number
}

export interface CopperIterationTrace {
  iteration: number
  limeWeight: number
  ironOreWeight: number
  fuelWeight: number
  oxygenAirWeight: number
  feSiO2: number
  caOSiO2: number
  totalProductMass: number
  maxDelta: number
}

export interface CopperIterativeBalanceResult {
  valid: boolean
  converged: boolean
  message?: string
  iterations: CopperIterationTrace[]
  finalSolventSolution: CopperSolventSolution | null
  finalSolventColumns: CopperMaterialColumn[]
  finalFuel: CopperFuelMaterial
  finalOxygenAirColumn: CopperMaterialColumn
  finalFeedWithoutFuel: WeightedComposition
  finalFeed: WeightedComposition
  finalProducts: CopperProductResult
  finalHeatBalance: CopperHeatBalanceResult
}

export type CopperPhaseInput =
  | string
  | number
  | {
      value?: string | number
      x?: string | number
      factor?: string | number
      coefficient?: string | number
    }

const SI_TO_SIO2 = 60.084 / 28.085
const CA_TO_CAO = 56.077 / 40.078

const O_IN_SIO2 = 32 / 60.084
const SI_IN_SIO2 = 28.085 / 60.084
const O_IN_CAO = 16 / 56.077
const CA_IN_CAO = 40.078 / 56.077
const CU_IN_CU2O = (2 * 63.546) / 143.09
const CU_IN_CU2S = (2 * 63.546) / 159.16
const FE_IN_FEO = 55.845 / 71.844
const FE_IN_FE2O3 = (2 * 55.845) / 159.688
const FE_IN_FE3O4 = (3 * 55.845) / 231.533
const FE_IN_FES = 55.845 / 87.91
const AL_IN_AL2O3 = (2 * 26.982) / 101.961
const S_IN_CU2S = 32.066 / 159.16
const S_IN_FES = 32.066 / 87.91

export const COPPER_PHASE_ASSIGNMENT_KEYS = [
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
] as const
export type CopperPhaseAssignmentKey = (typeof COPPER_PHASE_ASSIGNMENT_KEYS)[number]

export const COPPER_PHASE_OXYGEN_FACTORS: Partial<Record<CopperPhaseAssignmentKey, number>> = {
  Cu2O: 16 / 143.09,
  FeO: 16 / 71.844,
  Fe2O3: 48 / 159.688,
  Fe3O4: 64 / 231.533,
  SiO2: O_IN_SIO2,
  CaO: O_IN_CAO,
  Al2O3: 48 / 101.961,
}

export const COPPER_PHASE_SULFUR_FACTORS: Partial<Record<CopperPhaseAssignmentKey, number>> = {
  Cu2S: S_IN_CU2S,
  FeS: S_IN_FES,
  S: 1,
}

export const DEFAULT_COPPER_SOLVENTS: CopperSolvent[] = [
  {
    id: 'lime',
    name: '石灰',
    unitPrice: 550,
    composition: { 'Fe(铁)': 0, 'SiO₂(二氧化硅)': 0, 'CaO(氧化钙)': 85.05 },
  },
  {
    id: 'iron-ore',
    name: '铁矿石',
    unitPrice: 750,
    composition: { 'Fe(铁)': 59.94, 'SiO₂(二氧化硅)': 6, 'CaO(氧化钙)': 0 },
  },
]

export const COPPER_MATERIAL_LIBRARY: CopperLibraryMaterial[] = [
  {
    id: 'cu-conc-a',
    name: '铜精矿 A',
    category: 'concentrate',
    unitPrice: 62000,
    ratios: normalizeCopperRatios({
      'Ag(银)': 0.05,
      'Al(铝)': 1.2,
      'As(砷)': 0.12,
      'Au(金)': 0.002,
      'Ca(钙)': 0.8,
      'Cu(铜)': 24,
      'Fe(铁)': 28,
      'Pb(铅)': 0.3,
      'S (硫)': 31,
      'Sb(锑)': 0.05,
      'Si(硅)': 4.5,
      'Zn(锌)': 1.5,
    }),
  },
  {
    id: 'cu-conc-b',
    name: '铜精矿 B',
    category: 'concentrate',
    unitPrice: 58000,
    ratios: normalizeCopperRatios({
      'Ag(银)': 0.03,
      'Al(铝)': 1.8,
      'As(砷)': 0.08,
      'Au(金)': 0.001,
      'Ca(钙)': 0.5,
      'Cu(铜)': 20,
      'Fe(铁)': 32,
      'Pb(铅)': 0.2,
      'S (硫)': 33,
      'Sb(锑)': 0.03,
      'Si(硅)': 6,
      'Zn(锌)': 2.1,
    }),
  },
  {
    id: 'cu-conc-high-cu',
    name: '高品位铜精矿',
    category: 'concentrate',
    unitPrice: 70000,
    ratios: normalizeCopperRatios({
      'Ag(银)': 0.08,
      'Al(铝)': 0.9,
      'As(砷)': 0.05,
      'Au(金)': 0.004,
      'Ca(钙)': 0.4,
      'Cu(铜)': 30,
      'Fe(铁)': 24,
      'Pb(铅)': 0.18,
      'S (硫)': 29,
      'Sb(锑)': 0.02,
      'Si(硅)': 3.2,
      'Zn(锌)': 0.9,
    }),
  },
  {
    id: 'cu-conc-complex',
    name: '复杂铜精矿',
    category: 'concentrate',
    unitPrice: 52000,
    ratios: normalizeCopperRatios({
      'Ag(银)': 0.06,
      'Al(铝)': 2.4,
      'As(砷)': 0.55,
      'Au(金)': 0.002,
      'Ca(钙)': 0.8,
      'Cu(铜)': 18,
      'Fe(铁)': 30,
      'Pb(铅)': 1.1,
      'S (硫)': 32,
      'Sb(锑)': 0.12,
      'Si(硅)': 5.5,
      'Zn(锌)': 4.8,
    }),
  },
  {
    id: 'cu-return-dust',
    name: '铜烟尘返料',
    category: 'return',
    unitPrice: 8000,
    ratios: normalizeCopperRatios({
      'Ag(银)': 0.02,
      'Al(铝)': 1.5,
      'As(砷)': 1.2,
      'Ca(钙)': 2.5,
      'Cu(铜)': 18,
      'Fe(铁)': 10,
      'O (氧)': 22,
      'Pb(铅)': 5,
      'S (硫)': 7,
      'Sb(锑)': 0.3,
      'Si(硅)': 5,
      'Zn(锌)': 12,
    }),
  },
  {
    id: 'cu-return-slag',
    name: '铜渣返料',
    category: 'return',
    unitPrice: 1200,
    ratios: normalizeCopperRatios({
      'Al(铝)': 4.2,
      'Ca(钙)': 5,
      'Cu(铜)': 4.5,
      'Fe(铁)': 32,
      'O (氧)': 26,
      'S (硫)': 1.5,
      'Si(硅)': 13,
      'Zn(锌)': 1.2,
    }),
  },
]

export function emptyCopperRatios(): Record<CopperElementKey, number> {
  return Object.fromEntries(COPPER_ELEMENT_KEYS.map((element) => [element, 0])) as Record<CopperElementKey, number>
}

export function normalizeCopperRatios(ratios: CopperRatios): Record<CopperElementKey, number> {
  const out = emptyCopperRatios()
  for (const element of COPPER_ELEMENT_KEYS) {
    out[element] = Number.isFinite(ratios[element]) ? Number(ratios[element]) : 0
  }
  if (ratios['Other(其他)'] == null) {
    out['Other(其他)'] = Math.max(0, 100 - calculateKnownTotal(out))
  }
  return out
}

function parseDelimitedLine(line: string, delimiter: ',' | '\t'): string[] {
  const cells: string[] = []
  let current = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"'
        i += 1
      } else {
        quoted = !quoted
      }
    } else if (ch === delimiter && !quoted) {
      cells.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  cells.push(current.trim())
  return cells
}

function normalizeHeader(value: string): string {
  return value
    .replace(/^\uFEFF/, '')
    .replace(/\s+/g, '')
    .replace(/[（(].*?[）)]/g, '')
    .replace(/%/g, '')
    .toLowerCase()
}

const IMPORT_HEADER_TO_ELEMENT: Record<string, CopperElementKey> = {
  ag: 'Ag(银)',
  银: 'Ag(银)',
  al: 'Al(铝)',
  铝: 'Al(铝)',
  as: 'As(砷)',
  砷: 'As(砷)',
  au: 'Au(金)',
  金: 'Au(金)',
  c: 'C (碳)',
  碳: 'C (碳)',
  ca: 'Ca(钙)',
  钙: 'Ca(钙)',
  cu: 'Cu(铜)',
  铜: 'Cu(铜)',
  fe: 'Fe(铁)',
  铁: 'Fe(铁)',
  n: 'N (氮)',
  氮: 'N (氮)',
  o: 'O (氧)',
  氧: 'O (氧)',
  other: 'Other(其他)',
  其他: 'Other(其他)',
  pb: 'Pb(铅)',
  铅: 'Pb(铅)',
  s: 'S (硫)',
  硫: 'S (硫)',
  sb: 'Sb(锑)',
  锑: 'Sb(锑)',
  si: 'Si(硅)',
  硅: 'Si(硅)',
  zn: 'Zn(锌)',
  锌: 'Zn(锌)',
}

export function parseCopperLibraryCsv(text: string): CopperLibraryMaterial[] {
  const rows = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .filter((line) => line.trim().length > 0)
  if (rows.length <= 1) return []

  const delimiter: ',' | '\t' = (rows[0].match(/\t/g)?.length ?? 0) > (rows[0].match(/,/g)?.length ?? 0) ? '\t' : ','
  const headers = parseDelimitedLine(rows[0], delimiter)
  const normalizedHeaders = headers.map(normalizeHeader)
  const nameIndex = normalizedHeaders.findIndex((header) =>
    ['原料名称', '原料', '名称', 'material', 'materialname', 'name'].includes(header)
  )
  const priceIndex = normalizedHeaders.findIndex((header) =>
    ['单价', '价格', 'unitprice', 'price'].includes(header)
  )
  const elementIndexes = normalizedHeaders
    .map((header, index) => ({ element: IMPORT_HEADER_TO_ELEMENT[header], index }))
    .filter((item): item is { element: CopperElementKey; index: number } => Boolean(item.element))

  if (nameIndex < 0 || elementIndexes.length === 0) return []

  return rows.slice(1).flatMap((line, rowIndex) => {
    const cells = parseDelimitedLine(line, delimiter)
    const name = (cells[nameIndex] ?? '').trim()
    if (!name) return []
    const ratios: CopperRatios = {}
    for (const { element, index } of elementIndexes) {
      const parsed = parseFloat(String(cells[index] ?? '').replace(',', '.'))
      ratios[element] = Number.isFinite(parsed) ? parsed : 0
    }
    const price = priceIndex >= 0 ? parseFloat(String(cells[priceIndex] ?? '').replace(',', '.')) : 0
    return [
      {
        id: `imported-${Date.now()}-${rowIndex}`,
        name,
        category: 'concentrate' as const,
        unitPrice: Number.isFinite(price) ? price : 0,
        ratios: normalizeCopperRatios(ratios),
      },
    ]
  })
}

export function calculateKnownTotal(ratios: CopperRatios): number {
  return COPPER_ELEMENT_KEYS
    .filter((element) => element !== 'Other(其他)')
    .reduce((sum, element) => sum + (Number.isFinite(ratios[element]) ? Number(ratios[element]) : 0), 0)
}

export function calculateWeightedComposition(materials: CopperMaterialColumn[]): WeightedComposition {
  const totalWeight = materials.reduce((sum, material) => sum + Math.max(0, material.weight), 0)
  const elementWeights = emptyCopperRatios()
  if (totalWeight <= 0) {
    return { totalWeight: 0, ratios: emptyCopperRatios(), elementWeights }
  }
  for (const material of materials) {
    const normalized = normalizeCopperRatios(material.ratios)
    for (const element of COPPER_ELEMENT_KEYS) {
      elementWeights[element] += (normalized[element] / 100) * material.weight
    }
  }
  const ratios = emptyCopperRatios()
  for (const element of COPPER_ELEMENT_KEYS) {
    ratios[element] = (elementWeights[element] / totalWeight) * 100
  }
  return { totalWeight, ratios, elementWeights }
}

export function solventOxidesToElements(composition: CopperSolvent['composition']): Record<CopperElementKey, number> {
  const out = emptyCopperRatios()
  out['Fe(铁)'] = composition['Fe(铁)'] ?? 0
  out['Si(硅)'] = (composition['SiO₂(二氧化硅)'] ?? 0) * SI_IN_SIO2
  out['Ca(钙)'] = (composition['CaO(氧化钙)'] ?? 0) * CA_IN_CAO
  out['O (氧)'] = (composition['SiO₂(二氧化硅)'] ?? 0) * O_IN_SIO2 + (composition['CaO(氧化钙)'] ?? 0) * O_IN_CAO
  out['Other(其他)'] = Math.max(0, 100 - calculateKnownTotal(out))
  return out
}

export function elementRatiosToSolventComposition(ratios: CopperRatios): CopperSolvent['composition'] {
  return {
    'Fe(铁)': ratios['Fe(铁)'] ?? 0,
    'SiO₂(二氧化硅)': (ratios['Si(硅)'] ?? 0) * SI_TO_SIO2,
    'CaO(氧化钙)': (ratios['Ca(钙)'] ?? 0) * CA_TO_CAO,
  }
}

export function createDefaultCopperMaterials(): CopperMaterialColumn[] {
  return [0, 1].map((index) => ({
    id: `raw-${index + 1}`,
    name: '',
    kind: 'raw',
    weight: 0,
    ratios: emptyCopperRatios(),
    unitPrice: 0,
  }))
}

export function createDefaultSolventColumns(weights: Record<string, number> = {}): CopperMaterialColumn[] {
  return DEFAULT_COPPER_SOLVENTS.map((solvent) => ({
    id: `solvent-${solvent.id}`,
    name: solvent.name,
    kind: 'solvent',
    weight: weights[solvent.name] ?? 0,
    ratios: solventOxidesToElements(solvent.composition),
    unitPrice: solvent.unitPrice,
  }))
}

export function createOxygenAirColumn(weight = 0, settings: CopperOxygenAirSettings = { oxygenPct: 70, nitrogenPct: 30 }): CopperMaterialColumn {
  const oxygen = Math.max(0, settings.oxygenPct)
  const nitrogen = Math.max(0, settings.nitrogenPct)
  const total = oxygen + nitrogen
  const normalizedOxygen = total > 0 ? (oxygen / total) * 100 : 0
  const normalizedNitrogen = total > 0 ? (nitrogen / total) * 100 : 0
  return {
    id: 'oxygen-enriched-air',
    name: '富氧空气',
    kind: 'gas',
    weight: Math.max(0, weight),
    ratios: {
      ...emptyCopperRatios(),
      'O (氧)': normalizedOxygen,
      'N (氮)': normalizedNitrogen,
    },
    unitPrice: 0,
  }
}

function parsePhaseNumeric(value: string | number | undefined, fallback = 0) {
  const n = typeof value === 'number' ? value : parseFloat(String(value ?? '').replace(',', '.'))
  return Number.isFinite(n) ? Math.max(0, n) : fallback
}

export function parsePhaseActivityFactor(
  phases: Record<string, CopperPhaseInput>,
  phaseKey: string,
  fallback = 1
) {
  const value = phases[phaseKey]
  if (value && typeof value === 'object') {
    const factor = parsePhaseNumeric(value.factor ?? value.coefficient, fallback)
    return factor > 0 ? factor : fallback
  }
  return fallback
}

function phaseContentFromElement(elementAmount: number, elementFractionInPhase: number, activity: number) {
  if (elementAmount <= 0 || elementFractionInPhase <= 0 || activity <= 0) return 0
  return elementAmount / (elementFractionInPhase * activity)
}

function assignCoupledPhase(
  phaseKey: CopperPhaseAssignmentKey,
  pairs: Array<{ element: CopperElementKey; fraction: number }>,
  remaining: Partial<Record<CopperElementKey, number>>,
  phaseInputs: Record<string, CopperPhaseInput>,
  contents: Record<CopperPhaseAssignmentKey, number>
) {
  const activity = parsePhaseActivityFactor(phaseInputs, phaseKey)
  let limitingContent = Infinity
  for (const { element, fraction } of pairs) {
    const amount = remaining[element] ?? 0
    if (amount <= 0 || fraction <= 0) return
    limitingContent = Math.min(limitingContent, amount / (fraction * activity))
  }
  if (!Number.isFinite(limitingContent) || limitingContent <= 0) return
  contents[phaseKey] = limitingContent
  const effective = limitingContent * activity
  for (const { element, fraction } of pairs) {
    remaining[element] = Math.max(0, (remaining[element] ?? 0) - effective * fraction)
  }
}

export function derivePhaseContentsFromElements(
  ratios: CopperRatios,
  phaseInputs: Record<string, CopperPhaseInput>
): Record<CopperPhaseAssignmentKey, number> {
  const remaining: Partial<Record<CopperElementKey, number>> = {}
  for (const element of COPPER_ELEMENT_KEYS) {
    if (element === 'O (氧)' || element === 'C (碳)' || element === 'Other(其他)') continue
    const amount = ratios[element]
    if (Number.isFinite(amount) && amount > 0) remaining[element] = amount
  }

  const contents = Object.fromEntries(COPPER_PHASE_ASSIGNMENT_KEYS.map((key) => [key, 0])) as Record<
    CopperPhaseAssignmentKey,
    number
  >

  const assignSingle = (phaseKey: CopperPhaseAssignmentKey, element: CopperElementKey, fraction: number) => {
    const amount = remaining[element] ?? 0
    if (amount <= 0) return
    contents[phaseKey] = phaseContentFromElement(amount, fraction, parsePhaseActivityFactor(phaseInputs, phaseKey))
    remaining[element] = 0
  }

  assignCoupledPhase(
    'Cu2S',
    [
      { element: 'Cu(铜)', fraction: CU_IN_CU2S },
      { element: 'S (硫)', fraction: S_IN_CU2S },
    ],
    remaining,
    phaseInputs,
    contents
  )
  assignCoupledPhase(
    'FeS',
    [
      { element: 'Fe(铁)', fraction: FE_IN_FES },
      { element: 'S (硫)', fraction: S_IN_FES },
    ],
    remaining,
    phaseInputs,
    contents
  )
  assignSingle('S', 'S (硫)', 1)
  assignSingle('Cu2O', 'Cu(铜)', CU_IN_CU2O)

  const feRemaining = remaining['Fe(铁)'] ?? 0
  if (feRemaining > 0) {
    const ironPhases: Array<{ key: CopperPhaseAssignmentKey; fraction: number }> = [
      { key: 'FeO', fraction: FE_IN_FEO },
      { key: 'Fe2O3', fraction: FE_IN_FE2O3 },
      { key: 'Fe3O4', fraction: FE_IN_FE3O4 },
    ]
    const weights = ironPhases.map(({ key }) => {
      const value = phaseInputs[key]
      if (value && typeof value === 'object') {
        const weight = parsePhaseNumeric(value.factor ?? value.coefficient, 0)
        return weight > 0 ? weight : 0
      }
      return 1
    })
    const weightSum = weights.reduce((sum, weight) => sum + weight, 0)
    const normalizedWeights = weightSum > 0 ? weights : ironPhases.map(() => 1)
    const normalizedSum = normalizedWeights.reduce((sum, weight) => sum + weight, 0)
    ironPhases.forEach(({ key, fraction }, index) => {
      const feShare = feRemaining * (normalizedWeights[index] / normalizedSum)
      if (feShare > 0) {
        contents[key] = phaseContentFromElement(feShare, fraction, parsePhaseActivityFactor(phaseInputs, key))
      }
    })
    remaining['Fe(铁)'] = 0
  }

  assignSingle('SiO2', 'Si(硅)', SI_IN_SIO2)
  assignSingle('CaO', 'Ca(钙)', CA_IN_CAO)
  assignSingle('Al2O3', 'Al(铝)', AL_IN_AL2O3)

  const carbonKnown = ratios['C (碳)'] ?? 0
  contents.C = carbonKnown > 0
    ? phaseContentFromElement(carbonKnown, 1, parsePhaseActivityFactor(phaseInputs, 'C'))
    : 0

  return contents
}

export function calculatePhaseElementCompletion(
  ratios: CopperRatios,
  phaseInputs: Record<string, CopperPhaseInput>
) {
  const phaseContents = derivePhaseContentsFromElements(ratios, phaseInputs)
  const phasesForCalc = Object.fromEntries(
    Object.entries(phaseContents).map(([key, content]) => [
      key,
      { value: content, factor: parsePhaseActivityFactor(phaseInputs, key) },
    ])
  )
  return {
    phaseContents,
    unknowns: calculateUnknownsFromPhases(phasesForCalc, ratios),
  }
}

export function calculateUnknownsFromPhases(
  phases: Record<string, CopperPhaseInput>,
  currentRatios: CopperRatios
): Pick<Record<CopperElementKey, number>, 'O (氧)' | 'C (碳)' | 'Other(其他)'> {
  const phase = (name: string) => {
    const value = phases[name]
    if (value && typeof value === 'object') {
      return parsePhaseNumeric(value.value ?? value.x) * parsePhaseActivityFactor(phases, name)
    }
    return parsePhaseNumeric(value)
  }
  const oxygenRaw =
    phase('Cu2O') * (COPPER_PHASE_OXYGEN_FACTORS.Cu2O ?? 0) +
    phase('FeO') * (COPPER_PHASE_OXYGEN_FACTORS.FeO ?? 0) +
    phase('Fe2O3') * (COPPER_PHASE_OXYGEN_FACTORS.Fe2O3 ?? 0) +
    phase('Fe3O4') * (COPPER_PHASE_OXYGEN_FACTORS.Fe3O4 ?? 0) +
    phase('SiO2') * (COPPER_PHASE_OXYGEN_FACTORS.SiO2 ?? 0) +
    phase('CaO') * (COPPER_PHASE_OXYGEN_FACTORS.CaO ?? 0) +
    phase('Al2O3') * (COPPER_PHASE_OXYGEN_FACTORS.Al2O3 ?? 0)
  const carbon = phase('C')
  const assayExclusiveOfOC = calculateKnownTotal({
    ...currentRatios,
    'O (氧)': 0,
    'C (碳)': 0,
  })
  // 物相氧加总可能超出化验元素为 100% 时剩余空间；若仅用 Other=0 截断，合计会超过 100%。将 O 限制在闭包预算内。
  const oxygenBudget = Math.max(0, 100 - assayExclusiveOfOC - carbon)
  const oxygen = Math.min(oxygenRaw, oxygenBudget)
  const other = Math.max(0, 100 - assayExclusiveOfOC - oxygen - carbon)
  return { 'O (氧)': oxygen, 'C (碳)': carbon, 'Other(其他)': other }
}

/** 每吨熔剂折算为参与炉渣指标的 Fe / SiO₂ / CaO 质量 (t/t 熔剂)。 */
function solventCompositionSlagBasisPerMetricTon(composition: CopperSolvent['composition']) {
  const r = solventOxidesToElements(composition)
  return {
    fe: (r['Fe(铁)'] ?? 0) / 100,
    sio2: ((r['Si(硅)'] ?? 0) * SI_TO_SIO2) / 100,
    cao: ((r['Ca(钙)'] ?? 0) * CA_TO_CAO) / 100,
  }
}

/**
 * 按 **产出炉渣渣型** 求解石灰 + 铁矿石 (t/h)。
 * 起算量取产出炉渣中的 Fe、Si、Ca，再叠加熔剂自身带入炉渣的 Fe、SiO₂、CaO，
 * 使 M_Fe_s / M_SiO2_s = targetFeSiO2、M_CaO_s / M_SiO2_s = targetCaOSiO2。
 */
export function solveCopperSolvents({
  rawMaterials,
  targetFeSiO2,
  targetCaOSiO2,
  solvents = DEFAULT_COPPER_SOLVENTS,
}: {
  rawMaterials: CopperMaterialColumn[]
  targetFeSiO2: number
  targetCaOSiO2: number
  solvents?: CopperSolvent[]
}): CopperSolventSolution {
  const [lime, ironOre] = solvents
  if (!lime || !ironOre) {
    return { valid: false, solventWeights: {}, feSiO2: 0, caOSiO2: 0, message: '缺少熔剂配置' }
  }
  const blend = calculateWeightedComposition(rawMaterials)
  const baseSlag = calculateCopperProducts(blend).products.slag
  const fe0 = baseSlag.elementWeights['Fe(铁)'] ?? 0
  const sio20 = (baseSlag.elementWeights['Si(硅)'] ?? 0) * SI_TO_SIO2
  const cao0 = (baseSlag.elementWeights['Ca(钙)'] ?? 0) * CA_TO_CAO

  const iron = ironOre.composition
  const limeComp = lime.composition
  const oreVec = solventCompositionSlagBasisPerMetricTon(iron)
  const limeVec = solventCompositionSlagBasisPerMetricTon(limeComp)

  const a11 = oreVec.fe - targetFeSiO2 * oreVec.sio2
  const a12 = limeVec.fe - targetFeSiO2 * limeVec.sio2
  const a21 = oreVec.cao - targetCaOSiO2 * oreVec.sio2
  const a22 = limeVec.cao - targetCaOSiO2 * limeVec.sio2
  const b1 = targetFeSiO2 * sio20 - fe0
  const b2 = targetCaOSiO2 * sio20 - cao0
  const det = a11 * a22 - a12 * a21
  if (Math.abs(det) < 1e-10) {
    return { valid: false, solventWeights: {}, feSiO2: 0, caOSiO2: 0, message: '熔剂方程组不可解' }
  }

  const ironOreWeight = (b1 * a22 - a12 * b2) / det
  const limeWeight = (a11 * b2 - b1 * a21) / det

  const finish = (ironTon: number, limeTon: number, message?: string): CopperSolventSolution => {
    const solvedIronOre = Math.max(0, ironTon)
    const solvedLime = Math.max(0, limeTon)
    const totalFe = fe0 + solvedIronOre * oreVec.fe + solvedLime * limeVec.fe
    const totalSio2 = sio20 + solvedIronOre * oreVec.sio2 + solvedLime * limeVec.sio2
    const totalCao = cao0 + solvedIronOre * oreVec.cao + solvedLime * limeVec.cao
    return {
      valid: true,
      solventWeights: { [lime.name]: solvedLime, [ironOre.name]: solvedIronOre },
      feSiO2: totalSio2 > 0 ? totalFe / totalSio2 : 0,
      caOSiO2: totalSio2 > 0 ? totalCao / totalSio2 : 0,
      targetScope: 'slag',
      message,
    }
  }

  if (ironOreWeight >= -1e-8 && limeWeight >= -1e-8) {
    return finish(ironOreWeight, limeWeight)
  }

  // 边界：克莱姆解出现负铁矿石且石灰非负时，常见于产出炉渣已接近目标 Fe/SiO₂、仅需加石灰调 CaO/SiO₂
  if (ironOreWeight < 0 && limeWeight >= -1e-8) {
    const denLimeOnly = limeVec.cao - targetCaOSiO2 * limeVec.sio2
    if (Math.abs(denLimeOnly) > 1e-12) {
      const yOnly = (targetCaOSiO2 * sio20 - cao0) / denLimeOnly
      if (yOnly >= -1e-8) {
        const achievedFe = sio20 > 0 ? fe0 / sio20 : 0
        const hint =
          Math.abs(achievedFe - targetFeSiO2) > 0.08
            ? `已取铁矿石 0 t/h，仅用石灰满足 CaO/SiO₂；当前产出炉渣 Fe/SiO₂ ≈ ${achievedFe.toFixed(3)}，与目标 ${targetFeSiO2} 有偏差，可微调目标或原料。`
            : undefined
        return finish(0, yOnly, hint)
      }
    }
  }

  if (limeWeight < 0 && ironOreWeight >= -1e-8) {
    const denOreOnly = oreVec.fe - targetFeSiO2 * oreVec.sio2
    if (Math.abs(denOreOnly) > 1e-12) {
      const xOnly = (targetFeSiO2 * sio20 - fe0) / denOreOnly
      if (xOnly >= -1e-8) {
        const achievedCa = sio20 > 0 ? cao0 / sio20 : 0
        const hint =
          Math.abs(achievedCa - targetCaOSiO2) > 0.05
            ? `已取石灰 0 t/h，仅用铁矿石满足 Fe/SiO₂；当前产出炉渣 CaO/SiO₂ ≈ ${achievedCa.toFixed(3)}，与目标 ${targetCaOSiO2} 有偏差。`
            : undefined
        return finish(xOnly, 0, hint)
      }
    }
  }

  return {
    valid: false,
    solventWeights: { [lime.name]: Math.max(0, limeWeight), [ironOre.name]: Math.max(0, ironOreWeight) },
    feSiO2: 0,
    caOSiO2: 0,
    message: '当前目标渣型需要负熔剂量，请调整目标范围或熔剂成分',
  }
}

function buildSolventConfigsFromColumns(solventColumns: CopperMaterialColumn[]): CopperSolvent[] {
  return solventColumns.map((column, index) => {
    const fallback = DEFAULT_COPPER_SOLVENTS[index]
    return {
      id: fallback?.id ?? column.id,
      name: column.name as '石灰' | '铁矿石',
      unitPrice: column.unitPrice ?? fallback?.unitPrice ?? 0,
      composition: elementRatiosToSolventComposition(column.ratios),
    }
  })
}

function withSolvedSolventWeights(
  solventColumns: CopperMaterialColumn[],
  solution: CopperSolventSolution | null
): CopperMaterialColumn[] {
  return solventColumns.map((column) => ({
    ...column,
    weight: solution?.valid ? solution.solventWeights[column.name] ?? 0 : column.weight,
    ratios: { ...column.ratios },
  }))
}

function visibleCopperProductMass(products: CopperProductResult) {
  return products.products.matte.mass + products.products.slag.mass + products.products.gas.mass + products.products.dust.mass
}

function solveOxygenAirWeight({
  rawMaterials,
  solventColumns,
  fuel,
  settings,
}: {
  rawMaterials: CopperMaterialColumn[]
  solventColumns: CopperMaterialColumn[]
  fuel: CopperFuelMaterial
  settings: CopperOxygenAirSettings
}) {
  const dryFeed = calculateWeightedComposition([...rawMaterials, ...solventColumns, fuel])
  const baseVisibleProductMass = visibleCopperProductMass(calculateCopperProducts(dryFeed))
  const airUnit = createOxygenAirColumn(1, settings)
  const withOneTonAir = calculateWeightedComposition([...rawMaterials, ...solventColumns, fuel, airUnit])
  const visibleProductMassWithOneTonAir = visibleCopperProductMass(calculateCopperProducts(withOneTonAir))
  const visibleGainPerTonAir = visibleProductMassWithOneTonAir - baseVisibleProductMass
  const denominator = 1 - visibleGainPerTonAir
  if (denominator <= 1e-9) return 0
  const deficit = baseVisibleProductMass - dryFeed.totalWeight
  return Math.max(0, deficit / denominator)
}

function emptyIterativeBalanceResult(
  input: {
    rawMaterials: CopperMaterialColumn[]
    solventColumns: CopperMaterialColumn[]
    fuel: CopperFuelMaterial
    heatSettings: CopperIterativeHeatSettings
    oxygenAirSettings?: CopperOxygenAirSettings
  },
  message: string
): CopperIterativeBalanceResult {
  const finalSolventColumns = input.solventColumns.map((column) => ({ ...column, ratios: { ...column.ratios } }))
  const finalFuel = { ...input.fuel, ratios: { ...input.fuel.ratios } }
  const finalOxygenAirColumn = createOxygenAirColumn(
    solveOxygenAirWeight({
      rawMaterials: input.rawMaterials,
      solventColumns: finalSolventColumns,
      fuel: finalFuel,
      settings: input.oxygenAirSettings ?? { oxygenPct: 70, nitrogenPct: 30 },
    }),
    input.oxygenAirSettings ?? { oxygenPct: 70, nitrogenPct: 30 }
  )
  const finalFeedWithoutFuel = calculateWeightedComposition([...input.rawMaterials, ...finalSolventColumns, finalOxygenAirColumn])
  const finalProducts = calculateCopperProducts(calculateWeightedComposition([...input.rawMaterials, ...finalSolventColumns, finalFuel, finalOxygenAirColumn]))
  const finalHeatBalance = calculateCopperHeatBalance({
    feed: finalFeedWithoutFuel,
    products: calculateCopperProducts(finalFeedWithoutFuel),
    fuel: finalFuel,
    temperatures: {
      feed: input.heatSettings.feedTemperature,
      matte: input.heatSettings.matteTemperature,
      slag: input.heatSettings.slagTemperature,
      gas: input.heatSettings.gasTemperature,
      dust: input.heatSettings.dustTemperature,
    },
    heatLossMJh: input.heatSettings.heatLossMJh,
    otherHeatMJh: input.heatSettings.otherHeatMJh,
  })
  return {
    valid: false,
    converged: false,
    message,
    iterations: [],
    finalSolventSolution: null,
    finalSolventColumns,
    finalFuel,
    finalOxygenAirColumn,
    finalFeedWithoutFuel,
    finalFeed: calculateWeightedComposition([...input.rawMaterials, ...finalSolventColumns, finalFuel, finalOxygenAirColumn]),
    finalProducts,
    finalHeatBalance,
  }
}

export function calculateCopperIterativeBalance({
  rawMaterials,
  solventColumns,
  fuel,
  targetFeSiO2,
  targetCaOSiO2,
  heatSettings,
  oxygenAirSettings = { oxygenPct: 70, nitrogenPct: 30 },
  maxIterations = 12,
  tolerance = 0.001,
}: {
  rawMaterials: CopperMaterialColumn[]
  solventColumns: CopperMaterialColumn[]
  fuel: CopperFuelMaterial
  targetFeSiO2: number
  targetCaOSiO2: number
  heatSettings: CopperIterativeHeatSettings
  oxygenAirSettings?: CopperOxygenAirSettings
  maxIterations?: number
  tolerance?: number
}): CopperIterativeBalanceResult {
  if (rawMaterials.length === 0 || rawMaterials.every((material) => material.weight <= 0)) {
    return emptyIterativeBalanceResult({ rawMaterials, solventColumns, fuel, heatSettings, oxygenAirSettings }, '请先输入有效的原料投料量。')
  }

  const solvents = buildSolventConfigsFromColumns(solventColumns)
  let previousSolventColumns = solventColumns.map((column) => ({ ...column, ratios: { ...column.ratios } }))
  let previousFuelWeight = Math.max(0, fuel.weight)
  let finalSolventSolution: CopperSolventSolution | null = null
  let finalSolventColumns = previousSolventColumns
  let finalFuel = { ...fuel, weight: previousFuelWeight, ratios: { ...fuel.ratios } }
  let finalOxygenAirColumn = createOxygenAirColumn(0, oxygenAirSettings)
  let finalFeedWithoutFuel = calculateWeightedComposition([...rawMaterials, ...finalSolventColumns, finalOxygenAirColumn])
  let finalHeatBalance = calculateCopperHeatBalance({
    feed: finalFeedWithoutFuel,
    products: calculateCopperProducts(finalFeedWithoutFuel),
    fuel: finalFuel,
    temperatures: {
      feed: heatSettings.feedTemperature,
      matte: heatSettings.matteTemperature,
      slag: heatSettings.slagTemperature,
      gas: heatSettings.gasTemperature,
      dust: heatSettings.dustTemperature,
    },
    heatLossMJh: heatSettings.heatLossMJh,
    otherHeatMJh: heatSettings.otherHeatMJh,
  })
  let finalFeed = calculateWeightedComposition([...rawMaterials, ...finalSolventColumns, finalFuel, finalOxygenAirColumn])
  let finalProducts = calculateCopperProducts(finalFeed)
  const iterations: CopperIterationTrace[] = []

  for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
    const baseForSolvent = [...rawMaterials, { ...finalFuel, weight: previousFuelWeight }]
    const solution = solveCopperSolvents({
      rawMaterials: baseForSolvent,
      targetFeSiO2,
      targetCaOSiO2,
      solvents,
    })
    if (!solution.valid) {
      return {
        valid: false,
        converged: false,
        message: solution.message ?? '迭代计算中熔剂未能求解。',
        iterations,
        finalSolventSolution: solution,
        finalSolventColumns,
        finalFuel,
        finalOxygenAirColumn,
        finalFeedWithoutFuel,
        finalFeed,
        finalProducts,
        finalHeatBalance,
      }
    }

    const nextSolventColumns = withSolvedSolventWeights(solventColumns, solution)
    const feedWithoutFuel = calculateWeightedComposition([...rawMaterials, ...nextSolventColumns])
    const heatProducts = calculateCopperProducts(feedWithoutFuel)
    const heatFuel = { ...fuel, weight: previousFuelWeight, ratios: { ...fuel.ratios } }
    const heatBalance = calculateCopperHeatBalance({
      feed: feedWithoutFuel,
      products: heatProducts,
      fuel: heatFuel,
      temperatures: {
        feed: heatSettings.feedTemperature,
        matte: heatSettings.matteTemperature,
        slag: heatSettings.slagTemperature,
        gas: heatSettings.gasTemperature,
        dust: heatSettings.dustTemperature,
      },
      heatLossMJh: heatSettings.heatLossMJh,
      otherHeatMJh: heatSettings.otherHeatMJh,
    })
    const nextFuel = {
      ...fuel,
      weight: heatBalance.requiredFuelWeight,
      ratios: { ...fuel.ratios },
    }
    const nextOxygenAirColumn = createOxygenAirColumn(
      solveOxygenAirWeight({
        rawMaterials,
        solventColumns: nextSolventColumns,
        fuel: nextFuel,
        settings: oxygenAirSettings,
      }),
      oxygenAirSettings
    )
    const feed = calculateWeightedComposition([...rawMaterials, ...nextSolventColumns, nextFuel, nextOxygenAirColumn])
    const products = calculateCopperProducts(feed)
    const solventDelta = nextSolventColumns.reduce((max, column) => {
      const prev = previousSolventColumns.find((item) => item.id === column.id)?.weight ?? 0
      return Math.max(max, Math.abs(column.weight - prev))
    }, 0)
    const fuelDelta = Math.abs(nextFuel.weight - previousFuelWeight)
    const oxygenAirDelta = Math.abs(nextOxygenAirColumn.weight - finalOxygenAirColumn.weight)
    const maxDelta = Math.max(solventDelta, fuelDelta, oxygenAirDelta)

    iterations.push({
      iteration,
      limeWeight: solution.solventWeights['石灰'] ?? 0,
      ironOreWeight: solution.solventWeights['铁矿石'] ?? 0,
      fuelWeight: nextFuel.weight,
      oxygenAirWeight: nextOxygenAirColumn.weight,
      feSiO2: solution.feSiO2,
      caOSiO2: solution.caOSiO2,
      totalProductMass: products.totalProductMass,
      maxDelta,
    })

    finalSolventSolution = solution
    finalSolventColumns = nextSolventColumns
    finalFuel = nextFuel
    finalOxygenAirColumn = nextOxygenAirColumn
    finalFeedWithoutFuel = calculateWeightedComposition([...rawMaterials, ...nextSolventColumns, nextOxygenAirColumn])
    finalHeatBalance = heatBalance
    finalFeed = feed
    finalProducts = products

    if (maxDelta <= tolerance) {
      return {
        valid: true,
        converged: true,
        iterations,
        finalSolventSolution,
        finalSolventColumns,
        finalFuel,
        finalOxygenAirColumn,
        finalFeedWithoutFuel,
        finalFeed,
        finalProducts,
        finalHeatBalance,
      }
    }

    previousSolventColumns = nextSolventColumns
    previousFuelWeight = nextFuel.weight
  }

  return {
    valid: true,
    converged: false,
    message: `已达到最大迭代次数 ${maxIterations}，请复核收敛残差。`,
    iterations,
    finalSolventSolution,
    finalSolventColumns,
    finalFuel,
    finalOxygenAirColumn,
    finalFeedWithoutFuel,
    finalFeed,
    finalProducts,
    finalHeatBalance,
  }
}
