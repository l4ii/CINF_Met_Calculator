import { phaseFractionsFromFormula } from './chemicalFormula.ts'

/**
 * 铜冶炼模块统一显示/排序规则。
 * 物相行按组成规律排序：Cu 硫化物 → 其他硫化物 → Cu 氧化物 → 其他氧化物 → C/气体 → Other。
 */

/** 元素列 canonical 顺序（配料总表、原料库、导出等统一引用） */
export const COPPER_ELEMENT_DISPLAY_ORDER = [
  'Cu(铜)',
  'S (硫)',
  'Fe(铁)',
  'FeO(氧化亚铁)',
  'SiO₂(二氧化硅)',
  'CaO(氧化钙)',
  'MgO(氧化镁)',
  'Ag(银)',
  'Au(金)',
  'Pb(铅)',
  'As(砷)',
  'Zn(锌)',
  'Al₂O₃(三氧化二铝)',
  'Sb(锑)',
  'Ni(镍)',
  'Se(硒)',
  'Bi(铋)',
  'Hg(汞)',
  'Sn(锡)',
  'Te(碲)',
  'Cd(镉)',
  'H(氢)',
  'O(氧)',
  'N(氮)',
  'C (碳)',
  'Other(其他)',
] as const

/** 未选原料时元素表占位列（约 13 列，便于铺满页面） */
export const COPPER_PLACEHOLDER_ELEMENT_KEYS = [
  'Cu(铜)',
  'S (硫)',
  'Fe(铁)',
  'FeO(氧化亚铁)',
  'SiO₂(二氧化硅)',
  'CaO(氧化钙)',
  'MgO(氧化镁)',
  'Al₂O₃(三氧化二铝)',
  'Pb(铅)',
  'Zn(锌)',
  'As(砷)',
  'Ag(银)',
  'Au(金)',
] as const

export type CopperElementDisplayKey = (typeof COPPER_ELEMENT_DISPLAY_ORDER)[number]

/** 未选原料时物相表占位列 */
export const COPPER_PLACEHOLDER_PHASE_ROW_KEYS = [
  'Cu2S',
  'S',
  'FeS',
  'FeO',
  'SiO2',
  'CaO',
  'Al2O3',
  'PbO',
  'ZnO',
  'As2O3',
  'O2',
  'N2',
  'H2O',
] as const

/** 内置投入物相基础清单；实际显示顺序由下方组成规则生成 */
export const COPPER_BUILTIN_PHASE_DISPLAY_ORDER = [
  'Cu2S',
  'S',
  'FeS',
  'Cu2O',
  'FeO',
  'Fe2O3',
  'Fe3O4',
  'SiO2',
  'CaO',
  'Al2O3',
  'PbO',
  'As2O3',
  'Sb2O3',
  'ZnO',
  'C',
] as const

export type CopperBuiltinPhaseDisplayKey = (typeof COPPER_BUILTIN_PHASE_DISPLAY_ORDER)[number]

/** 物相/产物并集表的基础清单（不含用户自定义物相时） */
export const COPPER_UNIFIED_PHASE_ROW_ORDER = [
  'Cu2S',
  'S',
  'FeS',
  'Cu2O',
  'FeO',
  'Fe2O3',
  'Fe3O4',
  'SiO2',
  'CaO',
  'Al2O3',
  'PbO',
  'As2O3',
  'Sb2O3',
  'ZnO',
  'C',
  'SO2',
  'CO2',
  'O2',
  'N2',
  'Other',
] as const

const ELEMENT_SORT_INDEX = Object.fromEntries(
  COPPER_ELEMENT_DISPLAY_ORDER.map((key, index) => [key, index])
) as Record<CopperElementDisplayKey, number>

/** 内置物相 → 主导元素（用于未知物相排序与同类内排序） */
const PHASE_PRIMARY_ELEMENT: Record<string, CopperElementDisplayKey> = {
  Cu2S: 'Cu(铜)',
  S: 'S (硫)',
  FeS: 'Fe(铁)',
  Cu2O: 'Cu(铜)',
  FeO: 'Fe(铁)',
  Fe2O3: 'Fe(铁)',
  Fe3O4: 'Fe(铁)',
  SiO2: 'SiO₂(二氧化硅)',
  CaO: 'CaO(氧化钙)',
  Al2O3: 'Al₂O₃(三氧化二铝)',
  PbO: 'Pb(铅)',
  As2O3: 'As(砷)',
  Sb2O3: 'Sb(锑)',
  ZnO: 'Zn(锌)',
  C: 'C (碳)',
  SO2: 'S (硫)',
  CO2: 'C (碳)',
  O2: 'O(氧)',
  N2: 'N(氮)',
  Other: 'Other(其他)',
}

const UNKNOWN_ELEMENT_SORT_BASE: number = COPPER_ELEMENT_DISPLAY_ORDER.length
const PHASE_SORT_SCALE = 1000
const GAS_PHASE_ORDER: Record<string, number> = { SO2: 0, CO2: 1, O2: 2, N2: 3 }

export function copperElementSortIndex(key: string): number {
  const index = ELEMENT_SORT_INDEX[key as CopperElementDisplayKey]
  return index ?? UNKNOWN_ELEMENT_SORT_BASE
}

export function compareCopperElements(a: string, b: string): number {
  const diff = copperElementSortIndex(a) - copperElementSortIndex(b)
  if (diff !== 0) return diff
  return a.localeCompare(b, 'zh-CN')
}

export function sortCopperElementKeys<T extends string>(keys: Iterable<T>): T[] {
  return [...keys].sort(compareCopperElements)
}

export function copperBuiltinPhaseSortIndex(key: string): number {
  return copperUnifiedPhaseSortIndex(key)
}

export function copperUnifiedPhaseSortIndex(
  key: string,
  fractions?: Partial<Record<CopperElementDisplayKey, number>>
): number {
  return phaseSortScore(key, fractions)
}

export function compareCopperPhases(
  a: string,
  b: string,
  getFractions?: (key: string) => Partial<Record<CopperElementDisplayKey, number>> | undefined
): number {
  const diff =
    copperUnifiedPhaseSortIndex(a, getFractions?.(a)) - copperUnifiedPhaseSortIndex(b, getFractions?.(b))
  if (diff !== 0) return diff
  return a.localeCompare(b, 'zh-CN')
}

export function sortCopperPhaseKeys(
  keys: Iterable<string>,
  getFractions?: (key: string) => Partial<Record<CopperElementDisplayKey, number>> | undefined
): string[] {
  return [...keys].sort((a, b) => compareCopperPhases(a, b, getFractions))
}

export function buildUnifiedCopperPhaseRowKeys(extraKeys: Iterable<string> = []): string[] {
  const merged = new Set<string>([...COPPER_UNIFIED_PHASE_ROW_ORDER, ...extraKeys])
  merged.delete('Other')
  merged.delete('H2O')
  const sorted = sortCopperPhaseKeys(merged)
  sorted.push('H2O', 'Other')
  return sorted
}

export function buildInputPhaseRowKeys(): string[] {
  const keys = [...COPPER_BUILTIN_PHASE_DISPLAY_ORDER]
  return [...sortCopperPhaseKeys(keys), 'H2O', 'Other']
}

export function phasePrimaryElementKey(phaseKey: string): CopperElementDisplayKey {
  const mapped = PHASE_PRIMARY_ELEMENT[phaseKey]
  if (mapped) return mapped
  const normalized = phaseKey.trim()
  if (/^cu/i.test(normalized)) return 'Cu(铜)'
  if (/^fe/i.test(normalized)) return 'Fe(铁)'
  if (/^s\b|^so/i.test(normalized)) return 'S (硫)'
  if (/^pb/i.test(normalized)) return 'Pb(铅)'
  if (/^as/i.test(normalized)) return 'As(砷)'
  if (/^zn/i.test(normalized)) return 'Zn(锌)'
  if (/^sb/i.test(normalized)) return 'Sb(锑)'
  if (/^ag/i.test(normalized)) return 'Ag(银)'
  if (/^au/i.test(normalized)) return 'Au(金)'
  if (/sio/i.test(normalized)) return 'SiO₂(二氧化硅)'
  if (/cao/i.test(normalized)) return 'CaO(氧化钙)'
  if (/al2o/i.test(normalized)) return 'Al₂O₃(三氧化二铝)'
  if (/^o2/i.test(normalized)) return 'O(氧)'
  if (/^n2/i.test(normalized)) return 'N(氮)'
  if (/^c\b|^co/i.test(normalized)) return 'C (碳)'
  return 'Other(其他)'
}

function phaseSortScore(
  key: string,
  fractions?: Partial<Record<CopperElementDisplayKey, number>>
): number {
  if (key === 'Other') return Number.MAX_SAFE_INTEGER - 1
  const normalized = key.trim()
  if (normalized in GAS_PHASE_ORDER) return 5 * PHASE_SORT_SCALE + GAS_PHASE_ORDER[normalized]

  const inferredFractions = withInferredFractions(normalized, fractions)
  const hasS = hasElementFraction(inferredFractions, 'S (硫)')
  const hasO = hasElementFraction(inferredFractions, 'O(氧)')
  const hasC = hasElementFraction(inferredFractions, 'C (碳)')
  const primary = primaryElementFromFractions(inferredFractions) ?? phasePrimaryElementKey(normalized)
  const primaryScore = copperElementSortIndex(primary)
  const formulaScore = formulaComplexityScore(normalized)

  if (hasS) {
    const sulfurPrimaryScore = primary === 'S (硫)' ? UNKNOWN_ELEMENT_SORT_BASE : primaryScore
    return 0 * PHASE_SORT_SCALE + sulfurPrimaryScore * 20 + formulaScore
  }
  if (hasO) return 1 * PHASE_SORT_SCALE + primaryScore * 20 + formulaScore
  if (hasC && primary === 'C (碳)') return 4 * PHASE_SORT_SCALE + formulaScore
  return 2 * PHASE_SORT_SCALE + primaryScore * 20 + formulaScore
}

function withInferredFractions(
  phaseKey: string,
  fractions?: Partial<Record<CopperElementDisplayKey, number>>
): Partial<Record<CopperElementDisplayKey, number>> {
  const out = { ...(fractions ?? {}) }
  const parsed = phaseFractionsFromFormula(phaseKey) as Partial<Record<CopperElementDisplayKey, number>>
  for (const [element, fraction] of Object.entries(parsed) as [CopperElementDisplayKey, number][]) {
    if (fraction && fraction > 0 && !out[element]) out[element] = fraction
  }
  return out
}

function hasElementFraction(
  fractions: Partial<Record<CopperElementDisplayKey, number>>,
  element: CopperElementDisplayKey
) {
  return (fractions[element] ?? 0) > 0
}

function primaryElementFromFractions(
  fractions: Partial<Record<CopperElementDisplayKey, number>>
): CopperElementDisplayKey | null {
  let best: CopperElementDisplayKey | null = null
  let bestScore = UNKNOWN_ELEMENT_SORT_BASE
  for (const [element, fraction] of Object.entries(fractions) as [CopperElementDisplayKey, number][]) {
    if (!fraction || fraction <= 0) continue
    if (element === 'S (硫)' || element === 'O(氧)' || element === 'N(氮)' || element === 'Other(其他)') continue
    const score = copperElementSortIndex(element)
    if (score < bestScore) {
      best = element
      bestScore = score
    }
  }
  if (best) return best
  if (hasElementFraction(fractions, 'S (硫)')) return 'S (硫)'
  if (hasElementFraction(fractions, 'O(氧)')) return 'O(氧)'
  if (hasElementFraction(fractions, 'C (碳)')) return 'C (碳)'
  return null
}

function formulaComplexityScore(phaseKey: string) {
  const normalized = phaseKey.trim()
  if (normalized === 'S') return 10
  if (normalized === 'C') return 10
  if (/^FeO$/i.test(normalized)) return 0
  if (/^Fe2O3$/i.test(normalized)) return 1
  if (/^Fe3O4$/i.test(normalized)) return 2
  const digitSum = [...normalized.matchAll(/\d+/g)].reduce((sum, match) => sum + Number(match[0]), 0)
  return digitSum
}

export type MaterialPhaseSortRow = {
  id: string
  kind: 'builtin' | 'custom' | 'draft' | 'water' | 'other'
  builtinKey?: string
  formula?: string
  fractions?: Partial<Record<CopperElementDisplayKey, number>>
}

export function materialPhaseRowSortIndex(row: MaterialPhaseSortRow): number {
  if (row.kind === 'draft') return Number.MAX_SAFE_INTEGER
  if (row.kind === 'other' || row.id === 'Other' || row.formula === 'Other') return Number.MAX_SAFE_INTEGER - 1
  if (row.kind === 'water' || row.id === 'H2O' || row.formula === 'H2O') return Number.MAX_SAFE_INTEGER - 2
  if (row.kind === 'builtin' && row.builtinKey) {
    return copperBuiltinPhaseSortIndex(row.builtinKey)
  }
  return phaseSortScore(row.formula ?? row.id, row.fractions)
}

export function sortMaterialPhaseRows<T extends MaterialPhaseSortRow>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const diff = materialPhaseRowSortIndex(a) - materialPhaseRowSortIndex(b)
    if (diff !== 0) return diff
    return a.id.localeCompare(b.id)
  })
}
