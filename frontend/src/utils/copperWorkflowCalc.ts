import {
  calculateCopperHeatBalance,
  calculateCopperProducts,
  type CopperFuelMaterial,
  type CopperHeatBalanceResult,
  type CopperProductResult,
} from './copperProcessCalc.ts'
import { atomicMass, COMPOUND_MOLAR_MASS, ELEMENT_N_TO_N2, ELEMENT_O_TO_O2 } from './atomicMass.ts'
import {
  AL_TO_AL2O3,
  CA_TO_CAO,
  COPPER_BUILTIN_PHASE_FRACTIONS,
  COPPER_PHASE_O2_FACTORS,
  COPPER_PHASE_SULFUR_FRACTIONS,
  SI_TO_SIO2,
} from './copperPhaseStoichiometry.ts'
import {
  COPPER_BUILTIN_PHASE_DISPLAY_ORDER,
  COPPER_ELEMENT_DISPLAY_ORDER,
} from './copperDisplayOrder.ts'
import { solvePhaseDistribution, type PhaseSolverResult } from './copperPhaseSolver.ts'

export const COPPER_ELEMENT_KEYS = [...COPPER_ELEMENT_DISPLAY_ORDER] as const

export type CopperElementKey = (typeof COPPER_ELEMENT_KEYS)[number]
export type CopperRatios = Partial<Record<CopperElementKey, number>>

export interface CopperMaterialColumn {
  id: string
  name: string
  kind: 'raw' | 'solvent' | 'fuel' | 'gas'
  weight: number
  /** 干基水分 %，不计入元素 100%；湿质量 = weight × (1 + moisture/100) */
  moisture?: number
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
  oxygenSupplyCoefficient?: number
}

export interface CopperOxygenAirCalculation {
  phaseOxygenKmolh: number
  fuelOxygenKmolh: number
  theoreticalOxygenKmolh: number
  actualOxygenKmolh: number
  airVolumeNm3h: number
  oxygenMass: number
  nitrogenMass: number
  airWeight: number
  oxygenMassPct: number
  nitrogenMassPct: number
  oxygenSupplyCoefficient: number
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
  finalOxygenAirCalculation: CopperOxygenAirCalculation
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
    }

const MOLAR_MASS_KG_PER_KMOL = {
  C: atomicMass('C'),
  S: atomicMass('S'),
  O2: COMPOUND_MOLAR_MASS.O2,
  N2: COMPOUND_MOLAR_MASS.N2,
  Cu2S: COMPOUND_MOLAR_MASS.Cu2S,
  FeS: COMPOUND_MOLAR_MASS.FeS,
}
const OXYGEN_DEMAND_COEFFICIENTS = {
  // Cu2S + 1.5O2 -> Cu2O + SO2; FeS + 1.5O2 -> FeO + SO2.
  Cu2S: 1.5,
  FeS: 1.5,
  S: 1,
  C: 1,
}

export const COPPER_PHASE_ASSIGNMENT_KEYS = [...COPPER_BUILTIN_PHASE_DISPLAY_ORDER] as const
export type CopperPhaseAssignmentKey = (typeof COPPER_PHASE_ASSIGNMENT_KEYS)[number]

export const COPPER_PHASE_OXYGEN_FACTORS = COPPER_PHASE_O2_FACTORS

export const COPPER_PHASE_SULFUR_FACTORS = COPPER_PHASE_SULFUR_FRACTIONS

const NORMAL_M3_PER_KMOL = 22.4
const DEFAULT_OXYGEN_SUPPLY_COEFFICIENT = 1.15

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

function parsePhaseNumeric(value: string | number | undefined, fallback = 0) {
  const n = typeof value === 'number' ? value : parseFloat(String(value ?? '').replace(',', '.'))
  return Number.isFinite(n) ? Math.max(0, n) : fallback
}

/** 西南铜案例：国内外购矿与边贸矿元素组成相同 */
const SW_DOMESTIC_BORDER_RATIOS: CopperRatios = {
  'Cu(铜)': 19.78,
  'FeO(氧化亚铁)': 36.1759945565563,
  'S (硫)': 26.69,
  'Pb(铅)': 0.704,
  'Zn(锌)': 1.212,
  'Ni(镍)': 0.028,
  'Se(硒)': 0.015,
  'Bi(铋)': 0.164,
  'As(砷)': 0.347,
  'Au(金)': 0.0005592,
  'Ag(银)': 0.02027,
  'SiO₂(二氧化硅)': 8.58,
  'CaO(氧化钙)': 1.80799999999999,
  'MgO(氧化镁)': 0.936999999999996,
  'Hg(汞)': 3e-5,
  'C (碳)': 0.399880430932686,
  'Other(其他)': 8.04492909495785,
  'Al₂O₃(三氧化二铝)': 1.98,
  'Sn(锡)': 0.003,
  'Te(碲)': 0.01,
  'Sb(锑)': 0.051,
  'Cd(镉)': 0.04,
}

export const COPPER_MATERIAL_LIBRARY: CopperLibraryMaterial[] = [
  {
    id: 'cu-conc-a',
    name: '铜精矿 A',
    category: 'concentrate',
    unitPrice: 62000,
    ratios: normalizeCopperRatios({
      'Al₂O₃(三氧化二铝)': 1.53,
      'CaO(氧化钙)': 0.75,
      'Cu(铜)': 32.22,
      'Fe(铁)': 25.95,
      'Other(其他)': 0.014,
      'Pb(铅)': 0.866,
      'S (硫)': 31.95,
      'SiO₂(二氧化硅)': 6.72,
    }),
  },
  {
    id: 'cu-conc-internal',
    name: '系统内精矿',
    category: 'concentrate',
    unitPrice: 62000,
    ratios: normalizeCopperRatios({
      'Cu(铜)': 19.38,
      'FeO(氧化亚铁)': 35.8543729833294,
      'S (硫)': 23.93,
      'Pb(铅)': 0.19,
      'Zn(锌)': 0.18,
      'Ni(镍)': 0.04,
      'Se(硒)': 0.015,
      'Bi(铋)': 0.011,
      'As(砷)': 0.15,
      'Au(金)': 0.0003064,
      'Ag(银)': 0.003374,
      'SiO₂(二氧化硅)': 11.58,
      'CaO(氧化钙)': 2.708,
      'MgO(氧化镁)': 1.13400000000002,
      'Hg(汞)': 3e-5,
      'C (碳)': 0.550761250819715,
      'Other(其他)': 8.26923177830951,
      'Al₂O₃(三氧化二铝)': 2.44,
      'Sn(锡)': 0.003,
      'Te(碲)': 0.01,
      'Sb(锑)': 0.028,
      'Cd(镉)': 0.04,
    }),
  },
  {
    id: 'cu-conc-domestic',
    name: '国内外购矿',
    category: 'concentrate',
    unitPrice: 60000,
    ratios: normalizeCopperRatios(SW_DOMESTIC_BORDER_RATIOS),
  },
  {
    id: 'cu-conc-import',
    name: '进口铜精矿',
    category: 'concentrate',
    unitPrice: 65000,
    ratios: normalizeCopperRatios({
      'Cu(铜)': 24.92,
      'FeO(氧化亚铁)': 35.1725352480885,
      'S (硫)': 30.16,
      'Pb(铅)': 0.659999999999999,
      'Zn(锌)': 2.54,
      'Ni(镍)': 0.00700000000000002,
      'Se(硒)': 0.015,
      'Bi(铋)': 0.047,
      'As(砷)': 0.3,
      'Au(金)': 0.0002769,
      'Ag(银)': 0.02259,
      'SiO₂(二氧化硅)': 7.05,
      'CaO(氧化钙)': 0.954000000000004,
      'MgO(氧化镁)': 0.644000000000005,
      'Hg(汞)': 3e-5,
      'C (碳)': 0.237745724041993,
      'Other(其他)': 2.58397315528736,
      'Al₂O₃(三氧化二铝)': 1.795,
      'Sn(锡)': 0.003,
      'Te(碲)': 0.01,
      'Sb(锑)': 0.037,
      'Cd(镉)': 0.04,
    }),
  },
  {
    id: 'cu-conc-border',
    name: '边贸矿',
    category: 'concentrate',
    unitPrice: 58000,
    ratios: normalizeCopperRatios(SW_DOMESTIC_BORDER_RATIOS),
  },
]

export const COPPER_SW_CONCENTRATE_LIBRARY_IDS = [
  'cu-conc-internal',
  'cu-conc-domestic',
  'cu-conc-import',
  'cu-conc-border',
] as const

export function emptyCopperRatios(): Record<CopperElementKey, number> {
  return Object.fromEntries(COPPER_ELEMENT_KEYS.map((element) => [element, 0])) as Record<CopperElementKey, number>
}

export function migrateLegacyCopperRatios(ratios: CopperRatios): CopperRatios {
  const r = { ...ratios } as Record<string, number>
  const si = r['Si(硅)'] ?? 0
  const ca = r['Ca(钙)'] ?? 0
  const al = r['Al(铝)'] ?? 0
  const o = r['O (氧)'] ?? 0
  const n = r['N (氮)'] ?? 0
  if (si > 0 && (r['SiO₂(二氧化硅)'] ?? 0) <= 0) r['SiO₂(二氧化硅)'] = si * SI_TO_SIO2
  if (ca > 0 && (r['CaO(氧化钙)'] ?? 0) <= 0) r['CaO(氧化钙)'] = ca * CA_TO_CAO
  if (al > 0 && (r['Al₂O₃(三氧化二铝)'] ?? 0) <= 0) r['Al₂O₃(三氧化二铝)'] = al * AL_TO_AL2O3
  const legacyO2 = r['O₂(氧气)'] ?? 0
  const legacyN2 = r['N₂(氮气)'] ?? 0
  const gasStyle = legacyN2 > 0 && Math.abs(legacyO2 + legacyN2 - 100) < 0.01
  if (legacyO2 > 0 && (r['O(氧)'] ?? 0) <= 0) {
    r['O(氧)'] = gasStyle ? legacyO2 : legacyO2 / ELEMENT_O_TO_O2
  }
  if (legacyN2 > 0 && (r['N(氮)'] ?? 0) <= 0) {
    r['N(氮)'] = gasStyle ? legacyN2 : legacyN2 / ELEMENT_N_TO_N2
  }
  if (o > 0 && (r['O(氧)'] ?? 0) <= 0) r['O(氧)'] = o
  if (n > 0 && (r['N(氮)'] ?? 0) <= 0) r['N(氮)'] = n
  return r
}

export type CloseCopperRatiosOptions = {
  /** 是否将不足 100% 的差额补入 Other；原料总表输入阶段应为 false */
  fillOther?: boolean
}

/** 迁移/非负化化验数据；可选将差额补入 Other 以闭合 100% */
export function closeCopperRatios(
  ratios: CopperRatios,
  options: CloseCopperRatiosOptions = {}
): Record<CopperElementKey, number> {
  const fillOther = options.fillOther ?? false
  const migrated = migrateLegacyCopperRatios(ratios)
  const feo = Number(migrated['FeO(氧化亚铁)'] ?? 0)
  if (Number.isFinite(feo) && feo > 0) {
    migrated['Fe(铁)'] = (migrated['Fe(铁)'] ?? 0) + feo * (atomicMass('Fe') / COMPOUND_MOLAR_MASS.FeO)
    migrated['FeO(氧化亚铁)'] = 0
  }
  const out = emptyCopperRatios()
  for (const element of COPPER_ELEMENT_KEYS) {
    const value = Number.isFinite(migrated[element]) ? Number(migrated[element]) : 0
    out[element] = Math.max(0, value)
  }
  const knownTotal = calculateKnownTotal(out)
  if (knownTotal > 100 + 1e-3) {
    const k = 100 / knownTotal
    for (const element of COPPER_ELEMENT_KEYS) {
      if (element === 'Other(其他)') continue
      out[element] = out[element] * k
    }
    out['Other(其他)'] = 0
  } else if (fillOther) {
    out['Other(其他)'] = Math.max(0, 100 - calculateKnownTotal(out))
  }
  return out
}

export function normalizeCopperRatios(ratios: CopperRatios): Record<CopperElementKey, number> {
  return closeCopperRatios(ratios, { fillOther: true })
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
  al2o3: 'Al₂O₃(三氧化二铝)',
  '三氧化二铝': 'Al₂O₃(三氧化二铝)',
  al: 'Al₂O₃(三氧化二铝)',
  铝: 'Al₂O₃(三氧化二铝)',
  as: 'As(砷)',
  砷: 'As(砷)',
  au: 'Au(金)',
  金: 'Au(金)',
  bi: 'Bi(铋)',
  铋: 'Bi(铋)',
  c: 'C (碳)',
  碳: 'C (碳)',
  cao: 'CaO(氧化钙)',
  氧化钙: 'CaO(氧化钙)',
  ca: 'CaO(氧化钙)',
  钙: 'CaO(氧化钙)',
  cd: 'Cd(镉)',
  镉: 'Cd(镉)',
  cu: 'Cu(铜)',
  铜: 'Cu(铜)',
  fe: 'Fe(铁)',
  铁: 'Fe(铁)',
  feo: 'FeO(氧化亚铁)',
  氧化亚铁: 'FeO(氧化亚铁)',
  h: 'H(氢)',
  氢: 'H(氢)',
  hg: 'Hg(汞)',
  汞: 'Hg(汞)',
  mgo: 'MgO(氧化镁)',
  氧化镁: 'MgO(氧化镁)',
  mg: 'MgO(氧化镁)',
  镁: 'MgO(氧化镁)',
  ni: 'Ni(镍)',
  镍: 'Ni(镍)',
  n2: 'N(氮)',
  氮气: 'N(氮)',
  n: 'N(氮)',
  氮: 'N(氮)',
  o2: 'O(氧)',
  氧气: 'O(氧)',
  o: 'O(氧)',
  氧: 'O(氧)',
  'o₂': 'O(氧)',
  'n₂': 'N(氮)',
  other: 'Other(其他)',
  其他: 'Other(其他)',
  pb: 'Pb(铅)',
  铅: 'Pb(铅)',
  s: 'S (硫)',
  硫: 'S (硫)',
  sb: 'Sb(锑)',
  锑: 'Sb(锑)',
  se: 'Se(硒)',
  硒: 'Se(硒)',
  sio2: 'SiO₂(二氧化硅)',
  二氧化硅: 'SiO₂(二氧化硅)',
  si: 'SiO₂(二氧化硅)',
  硅: 'SiO₂(二氧化硅)',
  sn: 'Sn(锡)',
  锡: 'Sn(锡)',
  te: 'Te(碲)',
  碲: 'Te(碲)',
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
    .reduce((sum, element) => sum + Math.max(0, Number.isFinite(ratios[element]) ? Number(ratios[element]) : 0), 0)
}

/** 化验行合计（非负闭合后含 Other），用于原料库校验 */
export function calculateAssayDisplayTotal(ratios: CopperRatios): number {
  const normalized = normalizeCopperRatios(ratios)
  return calculateKnownTotal(normalized) + (normalized['Other(其他)'] ?? 0)
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
  out['SiO₂(二氧化硅)'] = composition['SiO₂(二氧化硅)'] ?? 0
  out['CaO(氧化钙)'] = composition['CaO(氧化钙)'] ?? 0
  out['Other(其他)'] = Math.max(0, 100 - calculateKnownTotal(out))
  return out
}

export function elementRatiosToSolventComposition(ratios: CopperRatios): CopperSolvent['composition'] {
  return {
    'Fe(铁)': ratios['Fe(铁)'] ?? 0,
    'SiO₂(二氧化硅)': ratios['SiO₂(二氧化硅)'] ?? 0,
    'CaO(氧化钙)': ratios['CaO(氧化钙)'] ?? 0,
  }
}

export function createDefaultCopperMaterials(): CopperMaterialColumn[] {
  return [0, 1].map((index) => ({
    id: `raw-${index + 1}`,
    name: '',
    kind: 'raw',
    weight: 0,
    moisture: 0,
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
    moisture: 0,
    ratios: solventOxidesToElements(solvent.composition),
    unitPrice: solvent.unitPrice,
  }))
}

/** 按干料投料量加权的水分 % */
export function calculateWeightedMoisture(materials: CopperMaterialColumn[]): number {
  const totalDry = materials.reduce((sum, m) => sum + Math.max(0, m.weight), 0)
  if (totalDry <= 0) return 0
  return (
    materials.reduce((sum, m) => sum + Math.max(0, m.weight) * Math.max(0, m.moisture ?? 0), 0) / totalDry
  )
}

/** 干基质量分数 % → 湿基（计入水分稀释） */
export function dryPercentToWetBasis(dryPercent: number, moisturePercent: number): number {
  const m = Math.max(0, moisturePercent)
  const denom = 1 + m / 100
  if (denom <= 0) return dryPercent
  return dryPercent / denom
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
      'O(氧)': normalizedOxygen,
      'N(氮)': normalizedNitrogen,
    },
    unitPrice: 0,
  }
}

function parsePhaseContent(value: CopperPhaseInput | undefined) {
  if (value && typeof value === 'object') {
    return parsePhaseNumeric(value.value ?? value.x)
  }
  return parsePhaseNumeric(value)
}

const POOL_EXCLUDED_ELEMENTS = new Set<CopperElementKey>(['O(氧)', 'C (碳)', 'N(氮)', 'Other(其他)'])

/** 自动反推路径：不含 Cu/Fe 氧化物，避免 Cu/Fe/S 欠定 */
const AUTO_DERIVE_PHASE_KEYS: CopperPhaseAssignmentKey[] = [
  'Cu2S',
  'FeS',
  'S',
  'SiO2',
  'CaO',
  'Al2O3',
  'PbO',
  'As2O3',
  'Sb2O3',
  'ZnO',
]

function buildAssayPool(ratios: CopperRatios): Partial<Record<CopperElementKey, number>> {
  const normalized = normalizeCopperRatios(ratios)
  const pool: Partial<Record<CopperElementKey, number>> = {}
  for (const element of COPPER_ELEMENT_KEYS) {
    if (POOL_EXCLUDED_ELEMENTS.has(element)) continue
    const amount = normalized[element] ?? 0
    if (Number.isFinite(amount) && amount > 0) pool[element] = amount
  }
  return pool
}

function phaseSpecsFromKeys(keys: CopperPhaseAssignmentKey[]): Array<{ id: string; fractions: Partial<Record<CopperElementKey, number>> }> {
  return keys.map((key) => ({
    id: key,
    fractions: COPPER_BUILTIN_PHASE_FRACTIONS[key] ?? {},
  }))
}

function filterActivePhaseKeys(
  keys: CopperPhaseAssignmentKey[],
  pool: Partial<Record<CopperElementKey, number>>
): CopperPhaseAssignmentKey[] {
  return keys.filter((key) => {
    const fractions = COPPER_BUILTIN_PHASE_FRACTIONS[key] ?? {}
    return (Object.entries(fractions) as [CopperElementKey, number][]).some(
      ([element, fraction]) => !POOL_EXCLUDED_ELEMENTS.has(element) && fraction > 0 && (pool[element] ?? 0) > 0
    )
  })
}

function applySolverAmountsToBuiltinRecord(
  amounts: Record<string, number>,
  keys: CopperPhaseAssignmentKey[] = [...COPPER_PHASE_ASSIGNMENT_KEYS]
): Record<CopperPhaseAssignmentKey, number> {
  const contents = Object.fromEntries(keys.map((key) => [key, 0])) as Record<CopperPhaseAssignmentKey, number>
  for (const key of keys) {
    contents[key] = Math.max(0, amounts[key] ?? 0)
  }
  return contents
}

export type { PhaseSolverResult }

export function derivePhaseContentsFromElements(
  ratios: CopperRatios,
  _phaseInputs: Record<string, CopperPhaseInput> = {}
): Record<CopperPhaseAssignmentKey, number> {
  const normalized = normalizeCopperRatios(ratios)
  const pool = buildAssayPool(ratios)
  const activeKeys = filterActivePhaseKeys(AUTO_DERIVE_PHASE_KEYS, pool)
  const solver = solvePhaseDistribution(phaseSpecsFromKeys(activeKeys), pool)
  const contents = applySolverAmountsToBuiltinRecord(
    solver.valid ? solver.amounts : {},
    [...COPPER_PHASE_ASSIGNMENT_KEYS]
  )
  contents.C = Math.max(0, normalized['C (碳)'] ?? 0)
  contents.Cu2O = 0
  contents.FeO = 0
  contents.Fe2O3 = 0
  contents.Fe3O4 = 0
  return contents
}

export type PhaseAssistRowSpec = {
  id: string
  kind: 'builtin' | 'custom' | 'other'
  builtinKey?: CopperPhaseAssignmentKey
  fractions?: Partial<Record<CopperElementKey, number>>
}

function rowFractions(row: PhaseAssistRowSpec): Partial<Record<CopperElementKey, number>> {
  if (row.fractions && Object.keys(row.fractions).length > 0) return row.fractions
  if (row.kind === 'builtin' && row.builtinKey) return COPPER_BUILTIN_PHASE_FRACTIONS[row.builtinKey] ?? {}
  return {}
}

function assignDirectCarbonRows(
  rows: PhaseAssistRowSpec[],
  ratios: CopperRatios,
  byRowId: Record<string, number>,
  byBuiltinKey: Record<CopperPhaseAssignmentKey, number>
) {
  const carbonKnown = Math.max(0, normalizeCopperRatios(ratios)['C (碳)'] ?? 0)
  for (const row of rows) {
    const fractions = rowFractions(row)
    const carbonFraction = fractions['C (碳)'] ?? 0
    if (carbonFraction <= 0) continue
    const assayPairs = (Object.entries(fractions) as [CopperElementKey, number][]).filter(
      ([element, fraction]) => element !== 'O(氧)' && element !== 'Other(其他)' && fraction > 0
    )
    if (assayPairs.length !== 1 || assayPairs[0]?.[0] !== 'C (碳)') continue
    const amount = carbonKnown > 0 ? carbonKnown / carbonFraction : 0
    byRowId[row.id] = amount
    if (row.kind === 'builtin' && row.builtinKey) byBuiltinKey[row.builtinKey] = amount
  }
}

function builtinPhaseElementConsumption(
  byBuiltinKey: Record<CopperPhaseAssignmentKey, number>
): Partial<Record<CopperElementKey, number>> {
  const consumed: Partial<Record<CopperElementKey, number>> = {}
  for (const phaseKey of COPPER_PHASE_ASSIGNMENT_KEYS) {
    const pct = byBuiltinKey[phaseKey] ?? 0
    if (pct <= 0) continue
    const fractions = COPPER_BUILTIN_PHASE_FRACTIONS[phaseKey] ?? {}
    for (const [element, fraction] of Object.entries(fractions) as [CopperElementKey, number][]) {
      if (!fraction || fraction <= 0) continue
      consumed[element] = (consumed[element] ?? 0) + pct * fraction
    }
  }
  return consumed
}

export function deriveOrderedPhaseContents(
  ratios: CopperRatios,
  rows: PhaseAssistRowSpec[],
  _phaseInputs: Record<string, CopperPhaseInput> = {}
): {
  byRowId: Record<string, number>
  byBuiltinKey: Record<CopperPhaseAssignmentKey, number>
  solver: PhaseSolverResult
} {
  const stoichRows = rows.filter((row) => row.kind === 'builtin' || row.kind === 'custom')
  const byRowId: Record<string, number> = {}
  const byBuiltinKey = Object.fromEntries(COPPER_PHASE_ASSIGNMENT_KEYS.map((key) => [key, 0])) as Record<
    CopperPhaseAssignmentKey,
    number
  >

  const carbonOnlyRows = stoichRows.filter((row) => {
    const fractions = rowFractions(row)
    const pairs = (Object.entries(fractions) as [CopperElementKey, number][]).filter(
      ([element, fraction]) => element !== 'O(氧)' && element !== 'Other(其他)' && fraction > 0
    )
    return pairs.length === 1 && pairs[0]?.[0] === 'C (碳)'
  })
  assignDirectCarbonRows(carbonOnlyRows, ratios, byRowId, byBuiltinKey)

  const pool = buildAssayPool(ratios)
  const solverRows = stoichRows
    .filter((row) => !carbonOnlyRows.includes(row))
    .filter((row) => {
      const fractions = rowFractions(row)
      return (Object.entries(fractions) as [CopperElementKey, number][]).some(
        ([element, fraction]) =>
          !POOL_EXCLUDED_ELEMENTS.has(element) && fraction > 0 && (pool[element] ?? 0) > 0
      )
    })
  const specs = solverRows.map((row) => ({
    id: row.id,
    fractions: rowFractions(row),
  }))
  const solver = solvePhaseDistribution(specs, pool)

  if (solver.valid) {
    for (const row of solverRows) {
      const amount = Math.max(0, solver.amounts[row.id] ?? 0)
      byRowId[row.id] = amount
      if (row.kind === 'builtin' && row.builtinKey) byBuiltinKey[row.builtinKey] = amount
    }
  }

  return { byRowId, byBuiltinKey, solver }
}

export function calculateOrderedPhaseElementCompletion(
  ratios: CopperRatios,
  rows: PhaseAssistRowSpec[],
  phaseInputs: Record<string, CopperPhaseInput> = {}
) {
  const normalized = normalizeCopperRatios(ratios)
  const calcRows = rows.filter((row) => row.kind === 'builtin' || row.kind === 'custom' || row.kind === 'other')
  const stoichRows = calcRows.filter((row) => row.kind === 'builtin' || row.kind === 'custom')
  const { byRowId, byBuiltinKey, solver } = deriveOrderedPhaseContents(ratios, stoichRows, phaseInputs)

  if (!solver.valid) {
    return {
      valid: false as const,
      status: solver.status,
      message: solver.message,
      phaseContents: Object.fromEntries(calcRows.map((row) => [row.id, 0])),
      unknowns: { 'O(氧)': 0, 'C (碳)': 0, 'Other(其他)': 0 },
      solver,
    }
  }

  const phasesForCalc = Object.fromEntries(
    COPPER_PHASE_ASSIGNMENT_KEYS.map((key) => [key, byBuiltinKey[key] ?? 0])
  ) as Record<string, CopperPhaseInput>
  const baseUnknowns = calculateUnknownsFromPhases(phasesForCalc, ratios)

  let extraOxygen = 0
  let extraCarbon = 0
  let extraKnownMass = 0

  for (const row of calcRows) {
    if (row.kind !== 'custom') continue
    const w = byRowId[row.id] ?? 0
    if (w <= 0 || !row.fractions) continue
    extraOxygen += w * (row.fractions['O(氧)'] ?? 0)
    extraCarbon += w * (row.fractions['C (碳)'] ?? 0)
    for (const [element, fraction] of Object.entries(row.fractions) as [CopperElementKey, number][]) {
      if (element === 'O(氧)' || element === 'C (碳)' || element === 'Other(其他)') continue
      extraKnownMass += w * fraction
    }
  }

  const representedElements = () => {
    const consumed = builtinPhaseElementConsumption(byBuiltinKey)
    for (const row of calcRows) {
      if (row.kind !== 'custom') continue
      const w = byRowId[row.id] ?? 0
      if (w <= 0 || !row.fractions) continue
      for (const [element, fraction] of Object.entries(row.fractions) as [CopperElementKey, number][]) {
        if (element === 'O(氧)' || element === 'C (碳)' || element === 'Other(其他)') continue
        if (!fraction || fraction <= 0) continue
        consumed[element] = (consumed[element] ?? 0) + w * fraction
      }
    }
    return consumed
  }
  const unassignedKnownMass = () => {
    const consumed = representedElements()
    return COPPER_ELEMENT_KEYS.reduce((sum, element) => {
      if (element === 'O(氧)' || element === 'C (碳)' || element === 'Other(其他)') return sum
      return sum + Math.max(0, (normalized[element] ?? 0) - (consumed[element] ?? 0))
    }, 0)
  }
  const withOtherRows = (phaseContents: Record<string, number>, other: number) => {
    const next = { ...phaseContents }
    const visibleOther = Math.max(0, other + unassignedKnownMass())
    for (const row of calcRows) {
      if (row.kind === 'other') next[row.id] = visibleOther
    }
    return next
  }

  if (extraOxygen <= 0 && extraCarbon <= 0 && extraKnownMass <= 0) {
    return {
      valid: true as const,
      status: solver.status,
      message: solver.message,
      phaseContents: withOtherRows(byRowId, baseUnknowns['Other(其他)'] ?? 0),
      unknowns: baseUnknowns,
      solver,
    }
  }

  const carbon = (baseUnknowns['C (碳)'] ?? 0) + extraCarbon
  const assayExclusive = calculateKnownTotal({ ...normalized, 'O(氧)': 0, 'C (碳)': 0 })
  const oxygenRaw = (baseUnknowns['O(氧)'] ?? 0) + extraOxygen
  const oxygenBudget = Math.max(0, 100 - assayExclusive - carbon)
  const oxygen = Math.min(oxygenRaw, oxygenBudget)
  const other = Math.max(0, 100 - assayExclusive - oxygen - carbon)

  return {
    valid: true as const,
    status: solver.status,
    message: solver.message,
    phaseContents: withOtherRows(byRowId, other),
    unknowns: { 'O(氧)': oxygen, 'C (碳)': carbon, 'Other(其他)': other },
    solver,
  }
}

export function calculatePhaseElementCompletion(
  ratios: CopperRatios,
  phaseInputs: Record<string, CopperPhaseInput> = {}
) {
  const phaseContents = derivePhaseContentsFromElements(ratios, phaseInputs)
  return {
    phaseContents,
    unknowns: calculateUnknownsFromPhases(phaseContents, ratios),
  }
}

export function calculatePhaseElementCompletionWithCustom(
  ratios: CopperRatios,
  phaseInputs: Record<string, CopperPhaseInput>,
  customRows: Array<{ id: string; fractions: Partial<Record<CopperElementKey, number>> }>,
  customPhaseInputs: Record<string, CopperPhaseInput>
) {
  const normalized = normalizeCopperRatios(ratios)
  const base = calculatePhaseElementCompletion(ratios, phaseInputs)
  if (customRows.length === 0) return base

  let extraOxygen = 0
  let extraCarbon = 0
  let extraKnownMass = 0

  for (const row of customRows) {
    const key = `custom:${row.id}`
    const input = customPhaseInputs[key]
    const w = parsePhaseContent(input)
    if (w <= 0) continue
    extraOxygen += w * (row.fractions['O(氧)'] ?? 0)
    extraCarbon += w * (row.fractions['C (碳)'] ?? 0)
    for (const [element, fraction] of Object.entries(row.fractions) as [CopperElementKey, number][]) {
      if (element === 'O(氧)' || element === 'C (碳)' || element === 'Other(其他)') continue
      extraKnownMass += w * fraction
    }
  }

  if (extraOxygen <= 0 && extraCarbon <= 0 && extraKnownMass <= 0) return base

  const baseUnknowns = base.unknowns
  const carbon = (baseUnknowns['C (碳)'] ?? 0) + extraCarbon
  const assayExclusive = calculateKnownTotal({ ...normalized, 'O(氧)': 0, 'C (碳)': 0 }) + extraKnownMass
  const oxygenRaw = (baseUnknowns['O(氧)'] ?? 0) + extraOxygen
  const oxygenBudget = Math.max(0, 100 - assayExclusive - carbon)
  const oxygen = Math.min(oxygenRaw, oxygenBudget)
  const other = Math.max(0, 100 - assayExclusive - oxygen - carbon)

  return {
    phaseContents: base.phaseContents,
    unknowns: { 'O(氧)': oxygen, 'C (碳)': carbon, 'Other(其他)': other },
  }
}

export function calculateUnknownsFromPhases(
  phases: Record<string, CopperPhaseInput>,
  currentRatios: CopperRatios
): Pick<Record<CopperElementKey, number>, 'O(氧)' | 'C (碳)' | 'Other(其他)'> {
  const normalizedRatios = normalizeCopperRatios(currentRatios)
  const phase = (name: string) => parsePhaseContent(phases[name])
  // SiO₂/CaO/Al₂O₃ 中的氧不计入 O₂ 列
  const o2Raw =
    phase('Cu2O') * (COPPER_PHASE_O2_FACTORS.Cu2O ?? 0) +
    phase('FeO') * (COPPER_PHASE_O2_FACTORS.FeO ?? 0) +
    phase('Fe2O3') * (COPPER_PHASE_O2_FACTORS.Fe2O3 ?? 0) +
    phase('Fe3O4') * (COPPER_PHASE_O2_FACTORS.Fe3O4 ?? 0) +
    phase('PbO') * (COPPER_PHASE_O2_FACTORS.PbO ?? 0) +
    phase('As2O3') * (COPPER_PHASE_O2_FACTORS.As2O3 ?? 0) +
    phase('Sb2O3') * (COPPER_PHASE_O2_FACTORS.Sb2O3 ?? 0) +
    phase('ZnO') * (COPPER_PHASE_O2_FACTORS.ZnO ?? 0)
  const carbon = phase('C')
  const hasOtherInput = Object.prototype.hasOwnProperty.call(phases, 'Other')
  const otherInput = hasOtherInput ? phase('Other') : 0
  const assayExclusiveOfOC = calculateKnownTotal({
    ...normalizedRatios,
    'O(氧)': 0,
    'C (碳)': 0,
  })
  const otherBudget = Math.max(0, 100 - assayExclusiveOfOC - carbon)
  const reservedOther = hasOtherInput ? Math.min(Math.max(0, otherInput), otherBudget) : 0
  const oxygenBudget = Math.max(0, otherBudget - reservedOther)
  const oxygen = Math.min(o2Raw, oxygenBudget)
  const other = hasOtherInput ? Math.max(reservedOther, otherBudget - oxygen) : Math.max(0, otherBudget - oxygen)
  return { 'O(氧)': oxygen, 'C (碳)': carbon, 'Other(其他)': other }
}

/** 每吨熔剂折算为参与炉渣指标的 Fe / SiO₂ / CaO 质量 (t/t 熔剂)。 */
function solventCompositionSlagBasisPerMetricTon(composition: CopperSolvent['composition']) {
  const r = solventOxidesToElements(composition)
  return {
    fe: (r['Fe(铁)'] ?? 0) / 100,
    sio2: (r['SiO₂(二氧化硅)'] ?? 0) / 100,
    cao: (r['CaO(氧化钙)'] ?? 0) / 100,
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
  if (solvents.length < 2) {
    return {
      valid: false,
      solventWeights: {},
      feSiO2: 0,
      caOSiO2: 0,
      message: '渣型迭代需要 2 个熔剂，请在配料总表添加熔剂行',
    }
  }
  const [lime, ironOre] = solvents
  if (!lime || !ironOre) {
    return { valid: false, solventWeights: {}, feSiO2: 0, caOSiO2: 0, message: '缺少熔剂配置' }
  }
  const blend = calculateWeightedComposition(rawMaterials)
  const baseSlag = calculateCopperProducts(blend).products.slag
  const fe0 = baseSlag.elementWeights['Fe(铁)'] ?? 0
  const sio20 = baseSlag.elementWeights['SiO₂(二氧化硅)'] ?? 0
  const cao0 = baseSlag.elementWeights['CaO(氧化钙)'] ?? 0

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

function emptyOxygenAirCalculation(settings: CopperOxygenAirSettings): CopperOxygenAirCalculation {
  const oxygenSupplyCoefficient = Math.max(0, settings.oxygenSupplyCoefficient ?? DEFAULT_OXYGEN_SUPPLY_COEFFICIENT)
  return {
    phaseOxygenKmolh: 0,
    fuelOxygenKmolh: 0,
    theoreticalOxygenKmolh: 0,
    actualOxygenKmolh: 0,
    airVolumeNm3h: 0,
    oxygenMass: 0,
    nitrogenMass: 0,
    airWeight: 0,
    oxygenMassPct: 0,
    nitrogenMassPct: 0,
    oxygenSupplyCoefficient,
  }
}

function phaseOxygenDemandKmolh(
  rawMaterials: CopperMaterialColumn[],
  phaseInputsByMaterialId: Record<string, Record<string, CopperPhaseInput>> = {}
) {
  return rawMaterials.reduce((sum, material) => {
    const phaseContents = derivePhaseContentsFromElements(material.ratios, phaseInputsByMaterialId[material.id] ?? {})
    const phaseMass = (phaseKey: CopperPhaseAssignmentKey) => material.weight * ((phaseContents[phaseKey] ?? 0) / 100)
    const cu2s = (phaseMass('Cu2S') * 1000) / MOLAR_MASS_KG_PER_KMOL.Cu2S
    const fes = (phaseMass('FeS') * 1000) / MOLAR_MASS_KG_PER_KMOL.FeS
    const sulfur = (phaseMass('S') * 1000) / MOLAR_MASS_KG_PER_KMOL.S
    const carbon = (phaseMass('C') * 1000) / MOLAR_MASS_KG_PER_KMOL.C
    return (
      sum +
      cu2s * OXYGEN_DEMAND_COEFFICIENTS.Cu2S +
      fes * OXYGEN_DEMAND_COEFFICIENTS.FeS +
      sulfur * OXYGEN_DEMAND_COEFFICIENTS.S +
      carbon * OXYGEN_DEMAND_COEFFICIENTS.C
    )
  }, 0)
}

function fuelOxygenDemandKmolh(fuel: CopperFuelMaterial) {
  const fuelWeight = Math.max(0, fuel.weight)
  const carbon = fuelWeight * ((fuel.ratios['C (碳)'] ?? 0) / 100)
  const sulfur = fuelWeight * ((fuel.ratios['S (硫)'] ?? 0) / 100)
  const o2 = fuelWeight * ((fuel.ratios['O(氧)'] ?? 0) / 100)
  const carbonDemand = (carbon * 1000) / MOLAR_MASS_KG_PER_KMOL.C
  const sulfurDemand = (sulfur * 1000) / MOLAR_MASS_KG_PER_KMOL.S
  const oxygenCredit = (o2 * 1000) / MOLAR_MASS_KG_PER_KMOL.O2
  return Math.max(0, carbonDemand + sulfurDemand - oxygenCredit)
}

function solveOxygenAirCalculation({
  rawMaterials,
  fuel,
  settings,
  phaseInputsByMaterialId,
}: {
  rawMaterials: CopperMaterialColumn[]
  fuel: CopperFuelMaterial
  settings: CopperOxygenAirSettings
  phaseInputsByMaterialId?: Record<string, Record<string, CopperPhaseInput>>
}): CopperOxygenAirCalculation {
  const oxygen = Math.max(0, settings.oxygenPct)
  const nitrogen = Math.max(0, settings.nitrogenPct)
  const total = oxygen + nitrogen
  if (total <= 0) return emptyOxygenAirCalculation(settings)

  const oxygenMoleFraction = oxygen / total
  if (oxygenMoleFraction <= 0) return emptyOxygenAirCalculation(settings)

  const oxygenSupplyCoefficient = Math.max(0, settings.oxygenSupplyCoefficient ?? DEFAULT_OXYGEN_SUPPLY_COEFFICIENT)
  const phaseOxygenKmolh = phaseOxygenDemandKmolh(rawMaterials, phaseInputsByMaterialId)
  const fuelOxygenKmolh = fuelOxygenDemandKmolh(fuel)
  const theoreticalOxygenKmolh = phaseOxygenKmolh + fuelOxygenKmolh
  const actualOxygenKmolh = theoreticalOxygenKmolh * oxygenSupplyCoefficient
  const totalAirKmolh = actualOxygenKmolh / oxygenMoleFraction
  const nitrogenKmolh = Math.max(0, totalAirKmolh - actualOxygenKmolh)
  const oxygenMass = (actualOxygenKmolh * MOLAR_MASS_KG_PER_KMOL.O2) / 1000
  const nitrogenMass = (nitrogenKmolh * MOLAR_MASS_KG_PER_KMOL.N2) / 1000
  const airWeight = oxygenMass + nitrogenMass
  return {
    phaseOxygenKmolh,
    fuelOxygenKmolh,
    theoreticalOxygenKmolh,
    actualOxygenKmolh,
    airVolumeNm3h: totalAirKmolh * NORMAL_M3_PER_KMOL,
    oxygenMass,
    nitrogenMass,
    airWeight,
    oxygenMassPct: airWeight > 0 ? (oxygenMass / airWeight) * 100 : 0,
    nitrogenMassPct: airWeight > 0 ? (nitrogenMass / airWeight) * 100 : 0,
    oxygenSupplyCoefficient,
  }
}

function emptyIterativeBalanceResult(
  input: {
    rawMaterials: CopperMaterialColumn[]
    solventColumns: CopperMaterialColumn[]
    fuel: CopperFuelMaterial
    heatSettings: CopperIterativeHeatSettings
    oxygenAirSettings?: CopperOxygenAirSettings
    phaseInputsByMaterialId?: Record<string, Record<string, CopperPhaseInput>>
  },
  message: string
): CopperIterativeBalanceResult {
  const oxygenAirSettings = input.oxygenAirSettings ?? { oxygenPct: 70, nitrogenPct: 30 }
  const finalSolventColumns = input.solventColumns.map((column) => ({ ...column, ratios: { ...column.ratios } }))
  const finalFuel = { ...input.fuel, ratios: { ...input.fuel.ratios } }
  const finalOxygenAirCalculation = solveOxygenAirCalculation({
    rawMaterials: input.rawMaterials,
    fuel: finalFuel,
    settings: oxygenAirSettings,
    phaseInputsByMaterialId: input.phaseInputsByMaterialId,
  })
  const finalOxygenAirColumn = createOxygenAirColumn(finalOxygenAirCalculation.airWeight, oxygenAirSettings)
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
    finalOxygenAirCalculation,
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
  phaseInputsByMaterialId = {},
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
  phaseInputsByMaterialId?: Record<string, Record<string, CopperPhaseInput>>
  maxIterations?: number
  tolerance?: number
}): CopperIterativeBalanceResult {
  if (rawMaterials.length === 0 || rawMaterials.every((material) => material.weight <= 0)) {
    return emptyIterativeBalanceResult({ rawMaterials, solventColumns, fuel, heatSettings, oxygenAirSettings, phaseInputsByMaterialId }, '请先输入有效的原料投料量。')
  }

  const solvents = buildSolventConfigsFromColumns(solventColumns)
  let previousSolventColumns = solventColumns.map((column) => ({ ...column, ratios: { ...column.ratios } }))
  let previousFuelWeight = Math.max(0, fuel.weight)
  let finalSolventSolution: CopperSolventSolution | null = null
  let finalSolventColumns = previousSolventColumns
  let finalFuel = { ...fuel, weight: previousFuelWeight, ratios: { ...fuel.ratios } }
  let finalOxygenAirColumn = createOxygenAirColumn(0, oxygenAirSettings)
  let finalOxygenAirCalculation = emptyOxygenAirCalculation(oxygenAirSettings)
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
        finalOxygenAirCalculation,
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
    const nextOxygenAirCalculation = solveOxygenAirCalculation({
      rawMaterials,
      fuel: nextFuel,
      settings: oxygenAirSettings,
      phaseInputsByMaterialId,
    })
    const nextOxygenAirColumn = createOxygenAirColumn(nextOxygenAirCalculation.airWeight, oxygenAirSettings)
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
    finalOxygenAirCalculation = nextOxygenAirCalculation
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
        finalOxygenAirCalculation,
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
    finalOxygenAirCalculation,
    finalFeedWithoutFuel,
    finalFeed,
    finalProducts,
    finalHeatBalance,
  }
}
