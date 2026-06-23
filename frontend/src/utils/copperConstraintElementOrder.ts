import { elementSymbolLabel } from './copperElementDisplay.ts'

const OXY_CONSTRAINT_ELEMENT_ORDER = [
  'Cu',
  'S',
  'O',
  'Fe',
  'As',
  'Pb',
  'Zn',
  'Ni',
  'Se',
  'Bi',
  'Sb',
  'Si',
  'Ca',
  'Mg',
  'Al',
  'Sn',
  'Cd',
  'Au',
  'Ag',
  'Te',
  'C',
  'H',
  'N',
  'Hg',
  'Other',
] as const

const OXY_CONSTRAINT_ELEMENT_ORDER_INDEX = new Map<string, number>(
  OXY_CONSTRAINT_ELEMENT_ORDER.map((symbol, index) => [symbol, index])
)

const OXY_CONSTRAINT_ELEMENT_ALIASES: Record<string, string> = {
  'Cu(铜)': 'Cu',
  'S (硫)': 'S',
  'S(硅)': 'Si',
  'SiO₂(二氧化硅)': 'Si',
  SiO2: 'Si',
  'Fe(铁)': 'Fe',
  'FeO(氧化亚铁)': 'Fe',
  'As(砷)': 'As',
  'Pb(铅)': 'Pb',
  'Zn(锌)': 'Zn',
  'Ni(镍)': 'Ni',
  'Se(硒)': 'Se',
  'Bi(铋)': 'Bi',
  'Sb(锑)': 'Sb',
  'Ca(钙)': 'Ca',
  'CaO(氧化钙)': 'Ca',
  CaO: 'Ca',
  'Mg(镁)': 'Mg',
  'MgO(氧化镁)': 'Mg',
  MgO: 'Mg',
  'Al(铝)': 'Al',
  'Al₂O₃(三氧化二铝)': 'Al',
  Al2O3: 'Al',
  'Sn(锡)': 'Sn',
  'Cd(镉)': 'Cd',
  'Au(金)': 'Au',
  'Ag(银)': 'Ag',
  'Te(碲)': 'Te',
  'C (碳)': 'C',
  'H(氢)': 'H',
  'N(氮)': 'N',
  'Hg(汞)': 'Hg',
  'O(氧)': 'O',
  'Other(其他)': 'Other',
}

function fallbackSymbol(key: string) {
  return elementSymbolLabel(key.trim())
}

export function normalizeOxyConstraintElementSymbol(key: string): string {
  const trimmed = key.trim()
  return OXY_CONSTRAINT_ELEMENT_ALIASES[trimmed] ?? fallbackSymbol(trimmed)
}

export function oxyConstraintElementSortIndex(key: string): number {
  const symbol = normalizeOxyConstraintElementSymbol(key)
  return OXY_CONSTRAINT_ELEMENT_ORDER_INDEX.get(symbol) ?? OXY_CONSTRAINT_ELEMENT_ORDER.length
}

export function compareOxyConstraintElements(a: string, b: string): number {
  const diff = oxyConstraintElementSortIndex(a) - oxyConstraintElementSortIndex(b)
  if (diff !== 0) return diff
  return a.localeCompare(b, 'zh-CN')
}

export function sortOxyConstraintElementKeys<T extends string>(keys: Iterable<T>): T[] {
  return [...keys].sort(compareOxyConstraintElements)
}
