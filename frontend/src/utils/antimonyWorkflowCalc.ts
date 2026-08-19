import {
  calculateAntimonyProducts,
  type AntimonyProductModel,
} from './antimonyProcessCalc.ts'
import { atomicMass, COMPOUND_MOLAR_MASS, ELEMENT_N_TO_N2, ELEMENT_O_TO_O2 } from './atomicMass.ts'
import {
  AL_TO_AL2O3,
  CA_TO_CAO,
  ANTIMONY_BUILTIN_PHASE_FRACTIONS,
  ANTIMONY_PHASE_O2_FACTORS,
  ANTIMONY_PHASE_SULFUR_FRACTIONS,
  SI_TO_SIO2,
} from './antimonyPhaseStoichiometry.ts'
import {
  ANTIMONY_BUILTIN_PHASE_DISPLAY_ORDER,
  ANTIMONY_ELEMENT_DISPLAY_ORDER,
} from './antimonyDisplayOrder.ts'
import { solvePhaseDistribution, type PhaseSolverResult } from './antimonyPhaseSolver.ts'

export const ANTIMONY_ELEMENT_KEYS = [...ANTIMONY_ELEMENT_DISPLAY_ORDER] as const

export type AntimonyElementKey = (typeof ANTIMONY_ELEMENT_KEYS)[number]
export type AntimonyRatios = Partial<Record<AntimonyElementKey, number>>

export interface AntimonyMaterialColumn {
  id: string
  name: string
  kind: 'raw' | 'solvent' | 'fuel' | 'gas'
  airRole?: 'air' | 'oxygen' | 'secondary' | 'feed_leak'
  /**
   * 混料分组：精矿计入「混合锑精矿」；other（渣精矿/吹炼渣等）在混料下单列「其他」，不计入混合锑精矿加权。
   * 未设置时按精矿处理。
   */
  mixGroup?: 'concentrate' | 'other'
  weight: number
  /** 含水质量 t/h；湿基 = weight + waterWeight */
  waterWeight?: number
  /** 干基水分 %（派生缓存）；湿质量 = weight + waterWeight */
  moisture?: number
  ratios: AntimonyRatios
  unitPrice?: number
}

/** Flo 导入常见的混料「其他」固体名（无 mixGroup 时按名称回退识别） */
const MIX_OTHER_MATERIAL_NAME_FALLBACKS = new Set(['渣精矿', '吹炼渣'])

/** 是否为混料「其他」固体（不计入混合锑精矿） */
export function isMixOtherMaterial(
  material: Pick<AntimonyMaterialColumn, 'mixGroup' | 'name'>
): boolean {
  if (material.mixGroup === 'other') return true
  if (material.mixGroup === 'concentrate') return false
  return MIX_OTHER_MATERIAL_NAME_FALLBACKS.has(material.name?.trim() ?? '')
}

/** 拆分精矿 vs 混料其他 */
export function partitionRawMixMaterials<T extends Pick<AntimonyMaterialColumn, 'mixGroup' | 'name'>>(
  materials: T[]
): { concentrates: T[]; others: T[] } {
  const concentrates: T[] = []
  const others: T[] = []
  for (const material of materials) {
    if (isMixOtherMaterial(material)) others.push(material)
    else concentrates.push(material)
  }
  return { concentrates, others }
}

const H2O_ELEMENT_FRACTIONS = ANTIMONY_BUILTIN_PHASE_FRACTIONS.H2O ?? {}

/** H₂O 中 H、O 元素 w%（合计 100） */
export function waterElementRatios(): Pick<AntimonyRatios, 'H(氢)' | 'O(氧)'> {
  const hFrac = H2O_ELEMENT_FRACTIONS['H(氢)'] ?? 0
  const oFrac = H2O_ELEMENT_FRACTIONS['O(氧)'] ?? 0
  return {
    'H(氢)': hFrac * 100,
    'O(氧)': oFrac * 100,
  }
}

export function deriveDryBasisMoisturePercent(dryWeight: number, waterWeight: number): number {
  const dry = Math.max(0, dryWeight)
  const water = Math.max(0, waterWeight)
  if (dry <= 0) return 0
  return (water / dry) * 100
}

export function materialWaterWeight(
  material: Pick<AntimonyMaterialColumn, 'weight' | 'waterWeight' | 'moisture'> &
    Partial<Pick<AntimonyMaterialColumn, 'kind' | 'airRole'>>
): number {
  // 气体列水分必须随干基质量按 moisture% 缩放。
  // 若沿用固体的绝对 waterWeight，回填改干基气量后 H2O 不跟着变，
  // 富氧硬投影（按每吨干基摩尔分率）与验收求值会系统性偏离（如 85%→88.3%）。
  if (material.kind === 'gas' || material.airRole) {
    const dry = Math.max(0, material.weight)
    const m = Math.max(0, material.moisture ?? 0)
    return dry > 0 && m > 0 ? dry * (m / 100) : 0
  }
  if (material.waterWeight != null && Number.isFinite(material.waterWeight)) {
    return Math.max(0, material.waterWeight)
  }
  const dry = Math.max(0, material.weight)
  const m = Math.max(0, material.moisture ?? 0)
  return dry > 0 && m > 0 ? dry * (m / 100) : 0
}

export function materialWetWeight(material: Pick<AntimonyMaterialColumn, 'weight' | 'waterWeight' | 'moisture' | 'kind' | 'airRole'>): number {
  return Math.max(0, material.weight) + materialWaterWeight(material)
}

export function totalWaterWeight(materials: AntimonyMaterialColumn[]): number {
  return materials.reduce((sum, m) => sum + materialWaterWeight(m), 0)
}

export function totalWetFeedWeight(materials: AntimonyMaterialColumn[]): number {
  return materials.reduce((sum, m) => sum + materialWetWeight(m), 0)
}

/** 旧存档仅有 moisture% 时迁移为 waterWeight */
export function migrateMaterialWaterWeight(material: AntimonyMaterialColumn): AntimonyMaterialColumn {
  if (material.waterWeight != null && Number.isFinite(material.waterWeight)) {
    const waterWeight = Math.max(0, material.waterWeight)
    return {
      ...material,
      waterWeight,
      moisture: deriveDryBasisMoisturePercent(material.weight, waterWeight),
    }
  }
  const waterWeight = materialWaterWeight(material)
  return {
    ...material,
    waterWeight,
    moisture: deriveDryBasisMoisturePercent(material.weight, waterWeight),
  }
}

export function syncMaterialMoistureFromWater(
  patch: Partial<AntimonyMaterialColumn> & { weight?: number; waterWeight?: number }
): Partial<AntimonyMaterialColumn> {
  if (patch.waterWeight == null && patch.weight == null) return patch
  const dry = Math.max(0, patch.weight ?? 0)
  const water = Math.max(0, patch.waterWeight ?? 0)
  return { ...patch, moisture: deriveDryBasisMoisturePercent(dry, water) }
}

export interface AntimonyLibraryMaterial {
  id: string
  name: string
  category: 'concentrate' | 'return' | 'flux' | 'product'
  ratios: AntimonyRatios
  unitPrice: number
}

export interface AntimonySolvent {
  id: string
  name: string
  unitPrice: number
  composition: {
    'Fe(铁)': number
    'FeO(氧化亚铁)'?: number
    'SiO₂(二氧化硅)': number
    'CaO(氧化钙)': number
    'MgO(氧化镁)'?: number
    'Al₂O₃(三氧化二铝)'?: number
    'O(氧)'?: number
    'Other(其他)'?: number
  }
}

export interface WeightedComposition {
  totalWeight: number
  ratios: Record<AntimonyElementKey, number>
  elementWeights: Record<AntimonyElementKey, number>
}

export interface AntimonySolventSolution {
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

export interface AntimonyIterativeHeatSettings {
  feedTemperature: number
  matteTemperature: number
  slagTemperature: number
  gasTemperature: number
  dustTemperature: number
  heatLossMJh: number
  otherHeatMJh: number
}

export interface AntimonyOxygenAirSettings {
  oxygenPct: number
  nitrogenPct: number
  oxygenSupplyCoefficient?: number
}

export interface AntimonyOxygenAirCalculation {
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

export type AntimonyPhaseInput =
  | string
  | number
  | {
      value?: string | number
      x?: string | number
    }

export const ANTIMONY_PHASE_ASSIGNMENT_KEYS = [...ANTIMONY_BUILTIN_PHASE_DISPLAY_ORDER] as const
export type AntimonyPhaseAssignmentKey = (typeof ANTIMONY_PHASE_ASSIGNMENT_KEYS)[number]

export const ANTIMONY_PHASE_OXYGEN_FACTORS = ANTIMONY_PHASE_O2_FACTORS

export const ANTIMONY_PHASE_SULFUR_FACTORS = ANTIMONY_PHASE_SULFUR_FRACTIONS

export const DEFAULT_ANTIMONY_SOLVENTS: AntimonySolvent[] = [
  {
    id: 'lime',
    name: '石灰',
    unitPrice: 550,
    composition: { 'Fe(铁)': 0, 'SiO₂(二氧化硅)': 0, 'CaO(氧化钙)': 85, 'MgO(氧化镁)': 0, 'Other(其他)': 15 },
  },
  {
    id: 'iron-ore',
    name: '铁矿石',
    unitPrice: 750,
    composition: {
      'Fe(铁)': 59.9414110394872,
      'SiO₂(二氧化硅)': 6,
      'CaO(氧化钙)': 0,
      'MgO(氧化镁)': 0,
      'Al₂O₃(三氧化二铝)': 4,
      'O(氧)': 25.7585889605128,
      'Other(其他)': 4.3,
    },
  },
]

function parsePhaseNumeric(value: string | number | undefined, fallback = 0) {
  const n = typeof value === 'number' ? value : parseFloat(String(value ?? '').replace(',', '.'))
  return Number.isFinite(n) ? Math.max(0, n) : fallback
}

export const ANTIMONY_SW_CONCENTRATE_LIBRARY_IDS = [
  'sb-ref-concentrate',
  'sb-ref-gold-concentrate',
  'sb-ref-matte',
] as const

export function emptyAntimonyRatios(): Record<AntimonyElementKey, number> {
  return Object.fromEntries(ANTIMONY_ELEMENT_KEYS.map((element) => [element, 0])) as Record<AntimonyElementKey, number>
}

export function migrateLegacyAntimonyRatios(ratios: AntimonyRatios): AntimonyRatios {
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

export type CloseAntimonyRatiosOptions = {
  /** 是否将不足 100% 的差额补入 Other；原料总表输入阶段应为 false */
  fillOther?: boolean
  /** 已知元素合计超 100% 时是否按比例缩放回 100%；配料总表输入应为 false */
  scaleWhenOver100?: boolean
  /** 计算态是否将 FeO 拆成 Fe + O；化验录入/显示态应保持 false */
  splitFeO?: boolean
  /** 是否保留 O(氧) 的有符号闭合差额；化验库显示需要保留负 O，计算态必须关闭 */
  preserveSignedOxygen?: boolean
}

/** 迁移/非负化化验数据；可选将差额补入 Other 以闭合 100% */
export function closeAntimonyRatios(
  ratios: AntimonyRatios,
  options: CloseAntimonyRatiosOptions = {}
): Record<AntimonyElementKey, number> {
  const fillOther = options.fillOther ?? false
  const scaleWhenOver100 = options.scaleWhenOver100 ?? true
  const splitFeO = options.splitFeO ?? false
  const preserveSignedOxygen = options.preserveSignedOxygen ?? false
  const migrated = migrateLegacyAntimonyRatios(ratios)
  const feo = Number(migrated['FeO(氧化亚铁)'] ?? 0)
  if (splitFeO && Number.isFinite(feo) && feo > 0) {
    migrated['Fe(铁)'] = (migrated['Fe(铁)'] ?? 0) + feo * (atomicMass('Fe') / COMPOUND_MOLAR_MASS.FeO)
    migrated['O(氧)'] = (migrated['O(氧)'] ?? 0) + feo * (atomicMass('O') / COMPOUND_MOLAR_MASS.FeO)
    migrated['FeO(氧化亚铁)'] = 0
  }
  const out = emptyAntimonyRatios()
  for (const element of ANTIMONY_ELEMENT_KEYS) {
    const value = Number.isFinite(migrated[element]) ? Number(migrated[element]) : 0
    out[element] = preserveSignedOxygen && element === 'O(氧)' ? value : Math.max(0, value)
  }
  const knownTotal = calculateKnownTotal(out)
  if (knownTotal > 100 + 1e-3 && scaleWhenOver100) {
    const k = 100 / knownTotal
    for (const element of ANTIMONY_ELEMENT_KEYS) {
      if (element === 'Other(其他)') continue
      out[element] = out[element] * k
    }
    out['Other(其他)'] = 0
  } else if (fillOther) {
    out['Other(其他)'] = Math.max(0, 100 - calculateKnownTotal(out))
  }
  return out
}

export function normalizeAntimonyRatios(ratios: AntimonyRatios): Record<AntimonyElementKey, number> {
  return closeAntimonyRatios(ratios, { fillOther: true, splitFeO: true })
}

export function normalizeAntimonyAssayRatios(ratios: AntimonyRatios): Record<AntimonyElementKey, number> {
  return closeAntimonyRatios(ratios, {
    fillOther: false,
    scaleWhenOver100: false,
    preserveSignedOxygen: true,
  })
}

/** 精矿化验前处理：拆 FeO→Fe+O，闭合负 O；库与元素表只存 Fe。 */
export function preprocessConcentrateAssayRatios(ratios: AntimonyRatios): Record<AntimonyElementKey, number> {
  const migrated = migrateLegacyAntimonyRatios(ratios) as Record<string, number>
  const feo = Math.max(0, Number(migrated['FeO(氧化亚铁)'] ?? 0))
  const feFrac = atomicMass('Fe') / COMPOUND_MOLAR_MASS.FeO
  const oFrac = atomicMass('O') / COMPOUND_MOLAR_MASS.FeO
  const nonOxygenTotal = Object.entries(migrated).reduce((sum, [key, value]) => {
    if (key === 'O(氧)') return sum
    return sum + Math.max(0, Number.isFinite(value) ? Number(value) : 0)
  }, 0)
  const closureO = 100 - nonOxygenTotal
  const out = { ...migrated }
  if (feo > 0) {
    out['Fe(铁)'] = (out['Fe(铁)'] ?? 0) + feo * feFrac
    out['O(氧)'] = closureO + feo * oFrac
    out['FeO(氧化亚铁)'] = 0
  } else if ((out['O(氧)'] ?? 0) < 0) {
    out['O(氧)'] = Math.max(0, closureO)
  }
  return normalizeAntimonyAssayRatios(out)
}

export const ANTIMONY_MATERIAL_LIBRARY: AntimonyLibraryMaterial[] = [
  {
    id: 'sb-ref-concentrate',
    name: '锑金精矿',
    category: 'concentrate',
    unitPrice: 140000,
    ratios: normalizeAntimonyAssayRatios({
      'Sb(锑)': 61.0103092783505,
      'S (硫)': 24.6494845360825,
      'Fe(铁)': 1.37113402061856,
      'Pb(铅)': 0.34020618556701,
      'As(砷)': 0.587628865979381,
      'Zn(锌)': 0.0721649484536081,
      'Cu(铜)': 0.0206185567010309,
      'SiO₂(二氧化硅)': 7.16494845360825,
      'CaO(氧化钙)': 1.72164948453608,
      'Al₂O₃(三氧化二铝)': 1.35051546391753,
      'Ag(银)': 0.00381443298969072,
      'Au(金)': 0.00278350515463917,
      'Bi(铋)': 0.00824742268041237,
      // 氧化锑中的氧；SiO₂/CaO/Al₂O₃ 已按完整氧化物质量录入，不在此重复计氧。
      'O(氧)': 0.293372898641408,
      'Other(其他)': 1.40312194671941,
    }),
  },
  {
    id: 'sb-ref-gold-concentrate',
    name: '锑精矿',
    category: 'concentrate',
    unitPrice: 130000,
    ratios: normalizeAntimonyAssayRatios({ 'Sb(锑)': 55, 'S (硫)': 25, 'Fe(铁)': 5, 'SiO₂(二氧化硅)': 8, 'CaO(氧化钙)': 2, 'Other(其他)': 5 }),
  },
  {
    id: 'sb-ref-matte',
    name: '锑锍返料',
    category: 'concentrate',
    unitPrice: 90000,
    ratios: normalizeAntimonyAssayRatios({ 'Sb(锑)': 20, 'S (硫)': 20, 'Fe(铁)': 35, 'SiO₂(二氧化硅)': 10, 'CaO(氧化钙)': 5, 'Other(其他)': 10 }),
  },
]

/** 将默认熔剂转为锑原料库 flux 条目。 */
export function createFluxLibraryMaterialFromSolvent(solvent: AntimonySolvent): AntimonyLibraryMaterial {
  return {
    id: `flux-${solvent.id}`,
    name: solvent.name,
    category: 'flux',
    unitPrice: solvent.unitPrice,
    ratios: solventOxidesToElements(solvent.composition),
  }
}

/** 熔炼原料库：锑原料 + Excel 工况中的石灰、铁矿石熔剂。 */
export function createSmeltingMaterialLibrary(): AntimonyLibraryMaterial[] {
  return [
    ...ANTIMONY_MATERIAL_LIBRARY.map((item) => ({
      ...item,
      ratios: { ...item.ratios },
    })),
    ...DEFAULT_ANTIMONY_SOLVENTS.map(createFluxLibraryMaterialFromSolvent),
  ]
}

export function isLibraryFluxCategory(category: AntimonyLibraryMaterial['category']): boolean {
  return category === 'flux'
}

export function isLibraryRawCategory(category: AntimonyLibraryMaterial['category']): boolean {
  return category === 'concentrate' || category === 'return' || category === 'product'
}

export function libraryCategoryLabel(category: AntimonyLibraryMaterial['category']): string {
  if (category === 'flux') return '熔剂'
  if (category === 'return') return '回流'
  if (category === 'product') return '产物'
  return '原料'
}

export function filterLibraryByGroup(
  library: AntimonyLibraryMaterial[],
  group: 'all' | 'raw' | 'flux'
): AntimonyLibraryMaterial[] {
  if (group === 'flux') return library.filter((item) => isLibraryFluxCategory(item.category))
  if (group === 'raw') return library.filter((item) => isLibraryRawCategory(item.category))
  return library
}

function nearlyEqualRatio(a: number | undefined, b: number, tolerance = 1e-3) {
  return Math.abs((a ?? 0) - b) <= tolerance
}

function looksLikeLegacySplitFeOConcentrate(
  ratios: AntimonyRatios,
  referenceRatios: AntimonyRatios
): boolean {
  const normalized = normalizeAntimonyAssayRatios(ratios)
  const reference = normalizeAntimonyAssayRatios(referenceRatios)
  const expectedFe = reference['Fe(铁)'] ?? 0
  return (
    nearlyEqualRatio(normalized['FeO(氧化亚铁)'], 0, 0.02) &&
    expectedFe > 0 &&
    nearlyEqualRatio(normalized['Fe(铁)'], expectedFe, 0.2) &&
    nearlyEqualRatio(normalized['Cu(铜)'], reference['Cu(铜)'] ?? 0, 0.2) &&
    nearlyEqualRatio(normalized['S (硫)'], reference['S (硫)'] ?? 0, 0.2)
  )
}

/** 加载/选料时：旧 FeO 或负 O 化验前处理为 Fe+非负 O；已拆 Fe 的西南矿与库对齐 */
export function normalizeKnownAntimonyRawMaterialAssay(material: AntimonyMaterialColumn): AntimonyMaterialColumn {
  if (material.kind !== 'raw') {
    return { ...material, ratios: preprocessConcentrateAssayRatios(material.ratios) }
  }
  const assay = normalizeAntimonyAssayRatios(material.ratios)
  const needsPreprocess = (assay['FeO(氧化亚铁)'] ?? 0) > 0 || (assay['O(氧)'] ?? 0) < 0
  if (needsPreprocess) {
    return { ...material, ratios: preprocessConcentrateAssayRatios(material.ratios) }
  }
  const reference = ANTIMONY_MATERIAL_LIBRARY.find(
    (item) =>
      (ANTIMONY_SW_CONCENTRATE_LIBRARY_IDS as readonly string[]).includes(item.id) &&
      item.name === material.name.trim()
  )
  if (reference && looksLikeLegacySplitFeOConcentrate(assay, reference.ratios)) {
    return {
      ...material,
      ratios: { ...reference.ratios },
      unitPrice: material.unitPrice ?? reference.unitPrice,
    }
  }
  return { ...material, ratios: assay }
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

const SUBSCRIPT_TO_DIGIT: Record<string, string> = {
  '₀': '0',
  '₁': '1',
  '₂': '2',
  '₃': '3',
  '₄': '4',
  '₅': '5',
  '₆': '6',
  '₇': '7',
  '₈': '8',
  '₉': '9',
}

function normalizeElementInputName(value: string): string {
  let out = value
  for (const [sub, digit] of Object.entries(SUBSCRIPT_TO_DIGIT)) {
    out = out.split(sub).join(digit)
  }
  return normalizeHeader(out)
}

/** 将用户输入的元素/化合物名解析为 canonical 元素键；无法识别时返回 null */
export function resolveAntimonyElementKey(name: string): AntimonyElementKey | null {
  const trimmed = name.trim()
  if (!trimmed) return null
  return IMPORT_HEADER_TO_ELEMENT[normalizeElementInputName(trimmed)] ?? null
}

const LEGACY_FEO_ASSAY_KEY = 'FeO(氧化亚铁)'

const IMPORT_HEADER_TO_ELEMENT: Record<string, AntimonyElementKey | typeof LEGACY_FEO_ASSAY_KEY> = {
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
  feo: LEGACY_FEO_ASSAY_KEY,
  氧化亚铁: LEGACY_FEO_ASSAY_KEY,
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

export function parseAntimonyLibraryCsv(text: string): AntimonyLibraryMaterial[] {
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
    .filter((item): item is { element: AntimonyElementKey | typeof LEGACY_FEO_ASSAY_KEY; index: number } =>
      Boolean(item.element)
    )

  if (nameIndex < 0 || elementIndexes.length === 0) return []

  return rows.slice(1).flatMap((line, rowIndex) => {
    const cells = parseDelimitedLine(line, delimiter)
    const name = (cells[nameIndex] ?? '').trim()
    if (!name) return []
    const ratios: Record<string, number> = {}
    for (const { element, index } of elementIndexes) {
      const parsed = parseFloat(String(cells[index] ?? '').replace(',', '.'))
      if (!Number.isFinite(parsed)) continue
      if (element === LEGACY_FEO_ASSAY_KEY) {
        ratios[LEGACY_FEO_ASSAY_KEY] = (ratios[LEGACY_FEO_ASSAY_KEY] ?? 0) + parsed
      } else {
        ratios[element] = parsed
      }
    }
    const price = priceIndex >= 0 ? parseFloat(String(cells[priceIndex] ?? '').replace(',', '.')) : 0
    return [
      {
        id: `imported-${Date.now()}-${rowIndex}`,
        name,
        category: 'concentrate' as const,
        unitPrice: Number.isFinite(price) ? price : 0,
        ratios: preprocessConcentrateAssayRatios(ratios),
      },
    ]
  })
}

export function calculateKnownTotal(ratios: AntimonyRatios): number {
  return ANTIMONY_ELEMENT_KEYS
    .filter((element) => element !== 'Other(其他)')
    .reduce((sum, element) => sum + (Number.isFinite(ratios[element]) ? Number(ratios[element]) : 0), 0)
}

/** 化验行合计（非负闭合后含 Other），用于原料库校验 */
export function calculateAssayDisplayTotal(ratios: AntimonyRatios): number {
  const normalized = normalizeAntimonyRatios(ratios)
  return calculateKnownTotal(normalized) + (normalized['Other(其他)'] ?? 0)
}

export function calculateWeightedComposition(materials: AntimonyMaterialColumn[]): WeightedComposition {
  const totalWeight = totalWetFeedWeight(materials)
  const elementWeights = emptyAntimonyRatios()
  if (totalWeight <= 0) {
    return { totalWeight: 0, ratios: emptyAntimonyRatios(), elementWeights }
  }
  const waterRatios = waterElementRatios()
  for (const material of materials) {
    const dryWeight = Math.max(0, material.weight)
    const normalized = normalizeAntimonyRatios(material.ratios)
    for (const element of ANTIMONY_ELEMENT_KEYS) {
      elementWeights[element] += (normalized[element] / 100) * dryWeight
    }
    const water = materialWaterWeight(material)
    if (water > 0) {
      elementWeights['H(氢)'] += ((waterRatios['H(氢)'] ?? 0) / 100) * water
      elementWeights['O(氧)'] += ((waterRatios['O(氧)'] ?? 0) / 100) * water
    }
  }
  const ratios = emptyAntimonyRatios()
  for (const element of ANTIMONY_ELEMENT_KEYS) {
    ratios[element] = (elementWeights[element] / totalWeight) * 100
  }
  return { totalWeight, ratios, elementWeights }
}

export function solventOxidesToElements(composition: AntimonySolvent['composition']): Record<AntimonyElementKey, number> {
  const out = emptyAntimonyRatios()
  const feO = composition['FeO(氧化亚铁)'] ?? 0
  const feFromFeO =
    feO > 0 ? feO * (atomicMass('Fe') / COMPOUND_MOLAR_MASS.FeO) : 0
  const oFromFeO =
    feO > 0 ? feO * (atomicMass('O') / COMPOUND_MOLAR_MASS.FeO) : 0
  out['Fe(铁)'] = (composition['Fe(铁)'] ?? 0) + feFromFeO
  out['O(氧)'] = oFromFeO
  out['SiO₂(二氧化硅)'] = composition['SiO₂(二氧化硅)'] ?? 0
  out['CaO(氧化钙)'] = composition['CaO(氧化钙)'] ?? 0
  out['MgO(氧化镁)'] = composition['MgO(氧化镁)'] ?? 0
  out['Al₂O₃(三氧化二铝)'] = composition['Al₂O₃(三氧化二铝)'] ?? 0
  out['O(氧)'] += composition['O(氧)'] ?? 0
  out['Other(其他)'] = composition['Other(其他)'] ?? Math.max(0, 100 - calculateKnownTotal(out))
  return out
}

export function elementRatiosToSolventComposition(ratios: AntimonyRatios): AntimonySolvent['composition'] {
  return {
    'Fe(铁)': ratios['Fe(铁)'] ?? 0,
    'SiO₂(二氧化硅)': ratios['SiO₂(二氧化硅)'] ?? 0,
    'CaO(氧化钙)': ratios['CaO(氧化钙)'] ?? 0,
    'MgO(氧化镁)': ratios['MgO(氧化镁)'] ?? 0,
    'Al₂O₃(三氧化二铝)': ratios['Al₂O₃(三氧化二铝)'] ?? 0,
    'O(氧)': ratios['O(氧)'] ?? 0,
    'Other(其他)': ratios['Other(其他)'] ?? 0,
  }
}

export function createDefaultAntimonyMaterials(): AntimonyMaterialColumn[] {
  const defaults: AntimonyMaterialColumn[] = [{
    id: 'raw-1',
    name: '锑金精矿',
    kind: 'raw',
    weight: 4.85,
    waterWeight: 0.15,
    moisture: (0.15 / 4.85) * 100,
    ratios: { ...ANTIMONY_MATERIAL_LIBRARY[0]!.ratios },
    unitPrice: ANTIMONY_MATERIAL_LIBRARY[0]!.unitPrice,
  }]
  defaults.push({
    id: 'raw-2',
    name: '',
    kind: 'raw',
    weight: 0,
    waterWeight: 0,
    moisture: 0,
    ratios: emptyAntimonyRatios(),
    unitPrice: 0,
  } as AntimonyMaterialColumn)
  return defaults
}

export function createDefaultSolventColumns(weights: Record<string, number> = {}): AntimonyMaterialColumn[] {
  return DEFAULT_ANTIMONY_SOLVENTS.map((solvent) => ({
    id: `solvent-${solvent.id}`,
    name: solvent.name,
    kind: 'solvent',
    // 熔剂量是约束求解结果；新案例只预置成分，不预填 Excel 的答案。
    weight: weights[solvent.name] ?? 0,
    waterWeight: 0,
    moisture: 0,
    ratios: solventOxidesToElements(solvent.composition),
    unitPrice: solvent.unitPrice,
  }))
}

/** 按干料投料量加权的干基水分 % */
export function calculateWeightedMoisture(materials: AntimonyMaterialColumn[]): number {
  const totalDry = materials.reduce((sum, m) => sum + Math.max(0, m.weight), 0)
  if (totalDry <= 0) return 0
  return (
    materials.reduce(
      (sum, m) => sum + Math.max(0, m.weight) * deriveDryBasisMoisturePercent(m.weight, materialWaterWeight(m)),
      0
    ) / totalDry
  )
}

/** 干基质量分数 % → 湿基（计入水分稀释） */
export function dryPercentToWetBasis(dryPercent: number, moisturePercent: number): number {
  const m = Math.max(0, moisturePercent)
  const denom = 1 + m / 100
  if (denom <= 0) return dryPercent
  return dryPercent / denom
}

export const DEFAULT_ANTIMONY_OXYGEN_AIR_SETTINGS = { oxygenPct: 99.65, nitrogenPct: 0.35 } as const

/** 锑挥发熔炼采用干空气；Excel 富氧气体仅含 O₂/N₂，不计空气湿分。 */
export const DEFAULT_STANDARD_AIR_PHASE_COMPOSITION = {
  weightPct: { O2: 23.3009708737864, N2: 76.6990291262136, H2O: 0 },
  volumePct: { O2: 21, N2: 79, H2O: 0 },
} as const

/** 氧气干基质量分数（与 Flo V% 99.6 / 0.4 互算） */
export const DEFAULT_OXYGEN_AIR_PHASE_COMPOSITION = {
  weightPct: { O2: 99.65, N2: 0.35, H2O: 0 },
  volumePct: { O2: 99.6, N2: 0.4, H2O: 0 },
} as const

const STANDARD_AIR_DRY_WEIGHT_PCT =
  DEFAULT_STANDARD_AIR_PHASE_COMPOSITION.weightPct.O2 +
  DEFAULT_STANDARD_AIR_PHASE_COMPOSITION.weightPct.N2
const STANDARD_AIR_DRY_BASIS_MOISTURE =
  STANDARD_AIR_DRY_WEIGHT_PCT > 0
    ? (DEFAULT_STANDARD_AIR_PHASE_COMPOSITION.weightPct.H2O / STANDARD_AIR_DRY_WEIGHT_PCT) * 100
    : 0

const STANDARD_AIR_RATIOS = {
  'H(氢)': 0,
  'O(氧)': (DEFAULT_STANDARD_AIR_PHASE_COMPOSITION.weightPct.O2 / STANDARD_AIR_DRY_WEIGHT_PCT) * 100,
  'N(氮)': (DEFAULT_STANDARD_AIR_PHASE_COMPOSITION.weightPct.N2 / STANDARD_AIR_DRY_WEIGHT_PCT) * 100,
  'Other(其他)': 0,
} as const
const DEFAULT_OXYGEN_RATIOS = {
  'O(氧)': DEFAULT_ANTIMONY_OXYGEN_AIR_SETTINGS.oxygenPct,
  'N(氮)': DEFAULT_ANTIMONY_OXYGEN_AIR_SETTINGS.nitrogenPct,
  'Other(其他)': 0,
} as const

const LEGACY_STANDARD_AIR_RATIOS = [
  { 'H(氢)': 0, 'O(氧)': 21, 'N(氮)': 79, 'C (碳)': 0, 'Other(其他)': 0 },
  { 'H(氢)': 0, 'O(氧)': 24.456, 'N(氮)': 75.544, 'Other(其他)': 0 },
  { 'H(氢)': 0.19, 'O(氧)': 24.41, 'N(氮)': 75.4, 'Other(其他)': 0 },
  // 旧 weightPct 22.89/75.4 干基
  { 'H(氢)': 0, 'O(氧)': 23.288844, 'N(氮)': 76.711156, 'Other(其他)': 0 },
] as const
const LEGACY_OXYGEN_RATIOS = [
  { 'H(氢)': 0, 'O(氧)': 100, 'N(氮)': 0, 'C (碳)': 0, 'Other(其他)': 0 },
  { 'H(氢)': 0, 'O(氧)': 70, 'N(氮)': 30, 'C (碳)': 0, 'Other(其他)': 0 },
  { 'H(氢)': 0, 'O(氧)': 99.6, 'N(氮)': 0.4, 'Other(其他)': 0 },
] as const

function ratioValue(ratios: Record<string, number> | undefined, key: string): number {
  const value = ratios?.[key]
  return Number.isFinite(value) ? Number(value) : 0
}

function ratiosMatch(
  ratios: Record<string, number> | undefined,
  expected: Readonly<Record<string, number>>,
  tolerance = 0.0001
): boolean {
  return Object.entries(expected).every(([key, value]) => Math.abs(ratioValue(ratios, key) - value) <= tolerance)
}

function isLegacyDefaultGasRatios(
  airRole: AntimonyMaterialColumn['airRole'],
  ratios: Record<string, number> | undefined
): boolean {
  const expectedList = airRole === 'oxygen' ? LEGACY_OXYGEN_RATIOS : LEGACY_STANDARD_AIR_RATIOS
  return expectedList.some((expected) => ratiosMatch(ratios, expected))
}

/** @deprecated 保留兼容；新流程请用 createProcessAirColumns 中的「氧气」列 */
export function createOxygenAirColumn(
  weight = 0,
  settings: AntimonyOxygenAirSettings = DEFAULT_ANTIMONY_OXYGEN_AIR_SETTINGS
): AntimonyMaterialColumn {
  const oxygen = Math.max(0, settings.oxygenPct)
  const nitrogen = Math.max(0, settings.nitrogenPct)
  const total = oxygen + nitrogen
  const normalizedOxygen = total > 0 ? (oxygen / total) * 100 : DEFAULT_ANTIMONY_OXYGEN_AIR_SETTINGS.oxygenPct
  const normalizedNitrogen = total > 0 ? (nitrogen / total) * 100 : 0
  return {
    id: 'pure-oxygen',
    name: '氧气',
    kind: 'gas',
    airRole: 'oxygen',
    weight: Math.max(0, weight),
    ratios: {
      ...emptyAntimonyRatios(),
      ...DEFAULT_OXYGEN_RATIOS,
      'O(氧)': normalizedOxygen,
      'N(氮)': normalizedNitrogen,
    },
    unitPrice: 0,
  }
}

function createStandardAirColumn(
  id: string,
  name: string,
  airRole: 'air' | 'secondary' | 'feed_leak',
  weight = 0,
  ratios: Readonly<Record<string, number>> = STANDARD_AIR_RATIOS
): AntimonyMaterialColumn {
  return {
    id,
    name,
    kind: 'gas',
    airRole,
    weight: Math.max(0, weight),
    moisture: STANDARD_AIR_DRY_BASIS_MOISTURE,
    ratios: { ...emptyAntimonyRatios(), ...ratios },
    unitPrice: 0,
  }
}

/** 投入-物料元素表气体列：空气、氧气、二次风、加料口漏风（t/h 默认 0，类型为气） */
export function createProcessAirColumns(): AntimonyMaterialColumn[] {
  return [
    createStandardAirColumn('process-air', '空气', 'air', 0),
    createOxygenAirColumn(0),
    createStandardAirColumn('secondary-air', '二次风', 'secondary', 0),
    createStandardAirColumn('feed-leak-air', '加料口漏风', 'feed_leak', 0),
  ]
}

/** 吹炼气体列：无二次风（热收入通常大于热支出，不配二次风） */
export function createConvertingProcessAirColumns(): AntimonyMaterialColumn[] {
  return createProcessAirColumns().filter((column) => column.airRole !== 'secondary')
}

const LEGACY_OXYGEN_AIR_IDS = new Set(['oxygen-enriched-air', 'pure-oxygen'])

/** 旧案例迁移：oxygen-enriched-air → pure-oxygen；补全加料口漏风列 */
export function normalizeProcessAirColumns(
  airColumns?: AntimonyMaterialColumn[] | null,
  legacyOxygenAirColumn?: AntimonyMaterialColumn | null,
  options?: { includeSecondaryAir?: boolean }
): AntimonyMaterialColumn[] {
  const includeSecondaryAir = options?.includeSecondaryAir !== false
  const defaults = includeSecondaryAir ? createProcessAirColumns() : createConvertingProcessAirColumns()
  const provided = [...(airColumns ?? [])].filter(
    (column) => includeSecondaryAir || column.airRole !== 'secondary'
  )
  if (legacyOxygenAirColumn && !provided.some((c) => LEGACY_OXYGEN_AIR_IDS.has(c.id) || c.airRole === 'oxygen')) {
    provided.push(legacyOxygenAirColumn)
  }
  const legacyOxygen = provided.find(
    (c) => c.id === 'oxygen-enriched-air' || c.airRole === 'oxygen' || LEGACY_OXYGEN_AIR_IDS.has(c.id)
  )
  return defaults.map((defaultColumn) => {
    const match =
      provided.find((column) => column.airRole === defaultColumn.airRole) ??
      provided.find((column) => column.id === defaultColumn.id) ??
      (defaultColumn.airRole === 'oxygen' ? legacyOxygen ?? null : null)
    if (!match) return cloneProcessAirColumn(defaultColumn)
    const mergedWeight = Math.max(0, match.weight ?? 0)
    const mergedRatios = isLegacyDefaultGasRatios(defaultColumn.airRole, match.ratios)
      ? { ...defaultColumn.ratios }
      : { ...defaultColumn.ratios, ...match.ratios }
    return cloneProcessAirColumn({
      ...defaultColumn,
      weight: mergedWeight,
      ratios: mergedRatios,
    })
  })
}

function cloneProcessAirColumn(column: AntimonyMaterialColumn): AntimonyMaterialColumn {
  return {
    ...column,
    ratios: { ...column.ratios },
  }
}

function parsePhaseContent(value: AntimonyPhaseInput | undefined) {
  if (value && typeof value === 'object') {
    return parsePhaseNumeric(value.value ?? value.x)
  }
  return parsePhaseNumeric(value)
}

const POOL_EXCLUDED_ELEMENTS = new Set<AntimonyElementKey>(['O(氧)', 'C (碳)', 'N(氮)', 'Other(其他)'])

/** 自动反推路径：以 Sb₂S₃ 为主硫化物，不含金属氧化物以避免 Sb/Fe/S 欠定。 */
const AUTO_DERIVE_PHASE_KEYS: AntimonyPhaseAssignmentKey[] = [
  'Sb2S3',
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

function buildAssayPool(ratios: AntimonyRatios): Partial<Record<AntimonyElementKey, number>> {
  const normalized = normalizeAntimonyRatios(ratios)
  const pool: Partial<Record<AntimonyElementKey, number>> = {}
  for (const element of ANTIMONY_ELEMENT_KEYS) {
    if (POOL_EXCLUDED_ELEMENTS.has(element)) continue
    const amount = normalized[element] ?? 0
    if (Number.isFinite(amount) && amount > 0) pool[element] = amount
  }
  return pool
}

function phaseSpecsFromKeys(keys: AntimonyPhaseAssignmentKey[]): Array<{ id: string; fractions: Partial<Record<AntimonyElementKey, number>> }> {
  return keys.map((key) => ({
    id: key,
    fractions: ANTIMONY_BUILTIN_PHASE_FRACTIONS[key] ?? {},
  }))
}

function filterActivePhaseKeys(
  keys: AntimonyPhaseAssignmentKey[],
  pool: Partial<Record<AntimonyElementKey, number>>
): AntimonyPhaseAssignmentKey[] {
  return keys.filter((key) => {
    const fractions = ANTIMONY_BUILTIN_PHASE_FRACTIONS[key] ?? {}
    return (Object.entries(fractions) as [AntimonyElementKey, number][]).some(
      ([element, fraction]) => !POOL_EXCLUDED_ELEMENTS.has(element) && fraction > 0 && (pool[element] ?? 0) > 0
    )
  })
}

function applySolverAmountsToBuiltinRecord(
  amounts: Record<string, number>,
  keys: AntimonyPhaseAssignmentKey[] = [...ANTIMONY_PHASE_ASSIGNMENT_KEYS]
): Record<AntimonyPhaseAssignmentKey, number> {
  const contents = Object.fromEntries(keys.map((key) => [key, 0])) as Record<AntimonyPhaseAssignmentKey, number>
  for (const key of keys) {
    contents[key] = Math.max(0, amounts[key] ?? 0)
  }
  return contents
}

export type { PhaseSolverResult }

export function derivePhaseContentsFromElements(
  ratios: AntimonyRatios,
  _phaseInputs: Record<string, AntimonyPhaseInput> = {}
): Record<AntimonyPhaseAssignmentKey, number> {
  const normalized = normalizeAntimonyRatios(ratios)
  const pool = buildAssayPool(ratios)
  const activeKeys = filterActivePhaseKeys(AUTO_DERIVE_PHASE_KEYS, pool)
  const solver = solvePhaseDistribution(phaseSpecsFromKeys(activeKeys), pool)
  const contents = applySolverAmountsToBuiltinRecord(
    solver.valid ? solver.amounts : {},
    [...ANTIMONY_PHASE_ASSIGNMENT_KEYS]
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
  builtinKey?: AntimonyPhaseAssignmentKey
  fractions?: Partial<Record<AntimonyElementKey, number>>
}

function rowFractions(row: PhaseAssistRowSpec): Partial<Record<AntimonyElementKey, number>> {
  if (row.fractions && Object.keys(row.fractions).length > 0) return row.fractions
  if (row.kind === 'builtin' && row.builtinKey) return ANTIMONY_BUILTIN_PHASE_FRACTIONS[row.builtinKey] ?? {}
  return {}
}

function assignDirectCarbonRows(
  rows: PhaseAssistRowSpec[],
  ratios: AntimonyRatios,
  byRowId: Record<string, number>,
  byBuiltinKey: Record<AntimonyPhaseAssignmentKey, number>
) {
  const carbonKnown = Math.max(0, normalizeAntimonyRatios(ratios)['C (碳)'] ?? 0)
  for (const row of rows) {
    const fractions = rowFractions(row)
    const carbonFraction = fractions['C (碳)'] ?? 0
    if (carbonFraction <= 0) continue
    const assayPairs = (Object.entries(fractions) as [AntimonyElementKey, number][]).filter(
      ([element, fraction]) => element !== 'O(氧)' && element !== 'Other(其他)' && fraction > 0
    )
    if (assayPairs.length !== 1 || assayPairs[0]?.[0] !== 'C (碳)') continue
    const amount = carbonKnown > 0 ? carbonKnown / carbonFraction : 0
    byRowId[row.id] = amount
    if (row.kind === 'builtin' && row.builtinKey) byBuiltinKey[row.builtinKey] = amount
  }
}

function builtinPhaseElementConsumption(
  byBuiltinKey: Record<AntimonyPhaseAssignmentKey, number>
): Partial<Record<AntimonyElementKey, number>> {
  const consumed: Partial<Record<AntimonyElementKey, number>> = {}
  for (const phaseKey of ANTIMONY_PHASE_ASSIGNMENT_KEYS) {
    const pct = byBuiltinKey[phaseKey] ?? 0
    if (pct <= 0) continue
    const fractions = ANTIMONY_BUILTIN_PHASE_FRACTIONS[phaseKey] ?? {}
    for (const [element, fraction] of Object.entries(fractions) as [AntimonyElementKey, number][]) {
      if (!fraction || fraction <= 0) continue
      consumed[element] = (consumed[element] ?? 0) + pct * fraction
    }
  }
  return consumed
}

export function deriveOrderedPhaseContents(
  ratios: AntimonyRatios,
  rows: PhaseAssistRowSpec[],
  _phaseInputs: Record<string, AntimonyPhaseInput> = {}
): {
  byRowId: Record<string, number>
  byBuiltinKey: Record<AntimonyPhaseAssignmentKey, number>
  solver: PhaseSolverResult
} {
  const stoichRows = rows.filter((row) => row.kind === 'builtin' || row.kind === 'custom')
  const byRowId: Record<string, number> = {}
  const byBuiltinKey = Object.fromEntries(ANTIMONY_PHASE_ASSIGNMENT_KEYS.map((key) => [key, 0])) as Record<
    AntimonyPhaseAssignmentKey,
    number
  >

  const carbonOnlyRows = stoichRows.filter((row) => {
    const fractions = rowFractions(row)
    const pairs = (Object.entries(fractions) as [AntimonyElementKey, number][]).filter(
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
      return (Object.entries(fractions) as [AntimonyElementKey, number][]).some(
        ([element, fraction]) =>
          !POOL_EXCLUDED_ELEMENTS.has(element) && fraction > 0 && (pool[element] ?? 0) > 0
      )
    })
  for (const row of stoichRows) {
    if (carbonOnlyRows.includes(row) || solverRows.includes(row)) continue
    byRowId[row.id] = 0
  }

  const specs = solverRows.map((row) => ({
    id: row.id,
    fractions: rowFractions(row),
  }))

  if (specs.length === 0) {
    const solver: PhaseSolverResult = {
      valid: true,
      status: 'ok',
      amounts: {},
      residual: {},
      elementCount: 0,
      phaseCount: 0,
    }
    return { byRowId, byBuiltinKey, solver }
  }

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
  ratios: AntimonyRatios,
  rows: PhaseAssistRowSpec[],
  phaseInputs: Record<string, AntimonyPhaseInput> = {}
) {
  const normalized = normalizeAntimonyRatios(ratios)
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
    ANTIMONY_PHASE_ASSIGNMENT_KEYS.map((key) => [key, byBuiltinKey[key] ?? 0])
  ) as Record<string, AntimonyPhaseInput>
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
    for (const [element, fraction] of Object.entries(row.fractions) as [AntimonyElementKey, number][]) {
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
      for (const [element, fraction] of Object.entries(row.fractions) as [AntimonyElementKey, number][]) {
        if (element === 'O(氧)' || element === 'C (碳)' || element === 'Other(其他)') continue
        if (!fraction || fraction <= 0) continue
        consumed[element] = (consumed[element] ?? 0) + w * fraction
      }
    }
    return consumed
  }
  const unassignedKnownMass = () => {
    const consumed = representedElements()
    return ANTIMONY_ELEMENT_KEYS.reduce((sum, element) => {
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
  ratios: AntimonyRatios,
  phaseInputs: Record<string, AntimonyPhaseInput> = {}
) {
  const phaseContents = derivePhaseContentsFromElements(ratios, phaseInputs)
  return {
    phaseContents,
    unknowns: calculateUnknownsFromPhases(phaseContents, ratios),
  }
}

export function calculatePhaseElementCompletionWithCustom(
  ratios: AntimonyRatios,
  phaseInputs: Record<string, AntimonyPhaseInput>,
  customRows: Array<{ id: string; fractions: Partial<Record<AntimonyElementKey, number>> }>,
  customPhaseInputs: Record<string, AntimonyPhaseInput>
) {
  const normalized = normalizeAntimonyRatios(ratios)
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
    for (const [element, fraction] of Object.entries(row.fractions) as [AntimonyElementKey, number][]) {
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
  phases: Record<string, AntimonyPhaseInput>,
  currentRatios: AntimonyRatios
): Pick<Record<AntimonyElementKey, number>, 'O(氧)' | 'C (碳)' | 'Other(其他)'> {
  const normalizedRatios = normalizeAntimonyRatios(currentRatios)
  const phase = (name: string) => parsePhaseContent(phases[name])
  // SiO₂/CaO/Al₂O₃ 中的氧不计入 O₂ 列
  const o2Raw =
    phase('Cu2O') * (ANTIMONY_PHASE_O2_FACTORS.Cu2O ?? 0) +
    phase('FeO') * (ANTIMONY_PHASE_O2_FACTORS.FeO ?? 0) +
    phase('Fe2O3') * (ANTIMONY_PHASE_O2_FACTORS.Fe2O3 ?? 0) +
    phase('Fe3O4') * (ANTIMONY_PHASE_O2_FACTORS.Fe3O4 ?? 0) +
    phase('PbO') * (ANTIMONY_PHASE_O2_FACTORS.PbO ?? 0) +
    phase('As2O3') * (ANTIMONY_PHASE_O2_FACTORS.As2O3 ?? 0) +
    phase('Sb2O3') * (ANTIMONY_PHASE_O2_FACTORS.Sb2O3 ?? 0) +
    phase('ZnO') * (ANTIMONY_PHASE_O2_FACTORS.ZnO ?? 0)
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
function solventCompositionSlagBasisPerMetricTon(composition: AntimonySolvent['composition']) {
  const r = solventOxidesToElements(composition)
  return {
    fe: (r['Fe(铁)'] ?? 0) / 100,
    sio2: (r['SiO₂(二氧化硅)'] ?? 0) / 100,
    cao: (r['CaO(氧化钙)'] ?? 0) / 100,
  }
}

/** 按产出炉渣 Fe/SiO₂ 单指标求解当前熔剂行投料量。 */
export function solveAntimonySolvents({
  rawMaterials,
  targetFeSiO2,
  solvents = DEFAULT_ANTIMONY_SOLVENTS,
  productModel,
}: {
  rawMaterials: AntimonyMaterialColumn[]
  targetFeSiO2: number
  targetCaOSiO2?: number
  solvents?: AntimonySolvent[]
  productModel?: AntimonyProductModel
}): AntimonySolventSolution {
  if (solvents.length === 0) {
    return {
      valid: false,
      solventWeights: {},
      feSiO2: 0,
      caOSiO2: 0,
      message: '渣型迭代需要至少 1 个熔剂，请在配料总表添加熔剂行',
    }
  }
  if (!Number.isFinite(targetFeSiO2) || targetFeSiO2 <= 0) {
    return { valid: false, solventWeights: {}, feSiO2: 0, caOSiO2: 0, message: 'Fe/SiO₂ 目标值须为正数' }
  }
  const blend = calculateWeightedComposition(rawMaterials)
  const baseSlag = calculateAntimonyProducts(blend, productModel).products.slag
  const fe0 = baseSlag.elementWeights['Fe(铁)'] ?? 0
  const sio20 = baseSlag.elementWeights['SiO₂(二氧化硅)'] ?? 0
  const cao0 = baseSlag.elementWeights['CaO(氧化钙)'] ?? 0
  const baseFeSiO2 = sio20 > 0 ? fe0 / sio20 : 0
  const baseCaOSiO2 = sio20 > 0 ? cao0 / sio20 : 0
  const zeroWeights = Object.fromEntries(solvents.map((solvent) => [solvent.name, 0]))

  const finish = (solvent: AntimonySolvent | null, solventTon: number, message?: string): AntimonySolventSolution => {
    const weights = { ...zeroWeights }
    if (solvent) weights[solvent.name] = Math.max(0, solventTon)
    let totalFe = fe0
    let totalSio2 = sio20
    let totalCao = cao0
    for (const item of solvents) {
      const weight = weights[item.name] ?? 0
      const vec = solventCompositionSlagBasisPerMetricTon(item.composition)
      totalFe += weight * vec.fe
      totalSio2 += weight * vec.sio2
      totalCao += weight * vec.cao
    }
    return {
      valid: true,
      solventWeights: weights,
      feSiO2: totalSio2 > 0 ? totalFe / totalSio2 : 0,
      caOSiO2: totalSio2 > 0 ? totalCao / totalSio2 : 0,
      targetScope: 'slag',
      message,
    }
  }

  if (Math.abs(baseFeSiO2 - targetFeSiO2) <= 1e-8) {
    return finish(null, 0)
  }

  const candidates = solvents
    .map((solvent) => {
      const vec = solventCompositionSlagBasisPerMetricTon(solvent.composition)
      const denominator = vec.fe - targetFeSiO2 * vec.sio2
      if (Math.abs(denominator) <= 1e-12) return null
      const weight = (targetFeSiO2 * sio20 - fe0) / denominator
      if (!Number.isFinite(weight) || weight < -1e-8) return null
      return { solvent, weight: Math.max(0, weight) }
    })
    .filter((item): item is { solvent: AntimonySolvent; weight: number } => item != null)
    .sort((a, b) => a.weight - b.weight)

  const best = candidates[0]
  if (best) {
    return finish(best.solvent, best.weight)
  }

  return {
    valid: false,
    solventWeights: zeroWeights,
    feSiO2: baseFeSiO2,
    caOSiO2: baseCaOSiO2,
    message: `当前熔剂无法将产出炉渣 Fe/SiO₂ 从 ${baseFeSiO2.toFixed(3)} 调整至 ${targetFeSiO2}，请更换或添加含 SiO₂/Fe 的熔剂。`,
  }
}
