import { elementMassFraction, type FormulaComposition } from './atomicMass.ts'
import type { CopperElementKey } from './copperWorkflowCalc.ts'

export const COPPER_PHASE_H2O_KEY = 'H₂O(水)' as const
export const COPPER_PHASE_H_KEY = 'H(氢)' as const

/** 物相成分表列（化合物口径）：在 Other 前插入 H₂O */
export const COPPER_PHASE_TABLE_COMPOUND_KEYS = [
  'Cu(铜)',
  'S (硫)',
  'Fe(铁)',
  'SiO₂(二氧化硅)',
  'CaO(氧化钙)',
  'Ag(银)',
  'Au(金)',
  'Pb(铅)',
  'As(砷)',
  'Zn(锌)',
  'Al₂O₃(三氧化二铝)',
  'Sb(锑)',
  'O(氧)',
  'N(氮)',
  'C (碳)',
  COPPER_PHASE_H2O_KEY,
  'Other(其他)',
] as const

export type CopperPhaseTableCompoundKey = (typeof COPPER_PHASE_TABLE_COMPOUND_KEYS)[number]

/** 元素转换后的显示列 */
export const COPPER_PHASE_TABLE_ELEMENT_VIEW_KEYS = [
  'Cu(铜)',
  'S (硫)',
  'Fe(铁)',
  'Si',
  'Ca',
  'Ag(银)',
  'Au(金)',
  'Pb(铅)',
  'As(砷)',
  'Zn(锌)',
  'Al',
  'Mg',
  'Sb(锑)',
  'O(氧)',
  'N(氮)',
  'H',
  'C (碳)',
  'Other(其他)',
] as const

export type CopperPhaseTableDisplayKey = CopperPhaseTableCompoundKey | (typeof COPPER_PHASE_TABLE_ELEMENT_VIEW_KEYS)[number]

const OXIDE_DECOMPOSE: Array<{
  compoundKey: CopperElementKey
  metalLabel: string
  composition: FormulaComposition
  metalCount?: number
}> = [
  { compoundKey: 'SiO₂(二氧化硅)', metalLabel: 'Si', composition: { Si: 1, O: 2 } },
  { compoundKey: 'CaO(氧化钙)', metalLabel: 'Ca', composition: { Ca: 1, O: 1 } },
  { compoundKey: 'Al₂O₃(三氧化二铝)', metalLabel: 'Al', composition: { Al: 2, O: 3 }, metalCount: 2 },
  { compoundKey: COPPER_PHASE_H2O_KEY, metalLabel: 'H', composition: { H: 2, O: 1 }, metalCount: 2 },
]

const MG_OXIDE_KEY = 'MgO(氧化镁)' as CopperElementKey

function addMass(target: Record<string, number>, key: string, mass: number) {
  if (mass <= 0) return
  target[key] = (target[key] ?? 0) + mass
}

/** 将物相表元素质量流量 (t/h) 转为化合物或纯元素显示 */
export function decomposePhaseElementMasses(
  elements: Partial<Record<CopperElementKey, number>>,
  mode: 'compound' | 'element'
): Record<string, number> {
  if (mode === 'compound') {
    const out: Record<string, number> = {}
    for (const key of COPPER_PHASE_TABLE_COMPOUND_KEYS) {
      const v = elements[key as CopperElementKey] ?? 0
      if (v > 0) out[key] = v
    }
    return out
  }

  const out: Record<string, number> = {}
  const consumed = new Set<string>()

  for (const { compoundKey, metalLabel, composition, metalCount = 1 } of OXIDE_DECOMPOSE) {
    const compoundMass = elements[compoundKey] ?? 0
    if (compoundMass <= 0) continue
    consumed.add(compoundKey)
    const metalFrac = elementMassFraction(composition, metalLabel)
    const oFrac = elementMassFraction(composition, 'O')
    addMass(out, metalLabel, compoundMass * metalFrac)
    addMass(out, 'O(氧)', compoundMass * oFrac)
  }

  const mgMass = elements[MG_OXIDE_KEY] ?? 0
  if (mgMass > 0) {
    consumed.add(MG_OXIDE_KEY)
    addMass(out, 'Mg', mgMass * elementMassFraction({ Mg: 1, O: 1 }, 'Mg'))
    addMass(out, 'O(氧)', mgMass * elementMassFraction({ Mg: 1, O: 1 }, 'O'))
  }

  for (const [key, mass] of Object.entries(elements) as [CopperElementKey, number][]) {
    if (!mass || mass <= 0 || consumed.has(key)) continue
    if (key === COPPER_PHASE_H2O_KEY) continue
    const displayKey =
      key === 'SiO₂(二氧化硅)' || key === 'CaO(氧化钙)' || key === 'Al₂O₃(三氧化二铝)' ? null : key
    if (displayKey) addMass(out, displayKey.replace(/\(.+\)/, '') === displayKey ? displayKey : displayKey, mass)
    else addMass(out, key.replace(/\(.+\)/, '') || key, mass)
  }

  for (const [key, mass] of Object.entries(elements) as [CopperElementKey, number][]) {
    if (!mass || mass <= 0 || consumed.has(key)) continue
    const viewKey = key.replace(/\(.+\)/, '').trim() || key
    addMass(out, viewKey, mass)
  }

  return out
}

export function phaseTableHeaderLabel(key: string, mode: 'compound' | 'element'): string {
  if (mode === 'compound') {
    if (key === COPPER_PHASE_H2O_KEY) return 'H₂O'
    return key.replace(/\(.+\)/, '')
  }
  if (key === 'Si' || key === 'Ca' || key === 'Al' || key === 'Mg' || key === 'H') return key
  return key.replace(/\(.+\)/, '')
}

export function getPhaseTableColumnKeys(mode: 'compound' | 'element') {
  return mode === 'compound' ? [...COPPER_PHASE_TABLE_COMPOUND_KEYS] : [...COPPER_PHASE_TABLE_ELEMENT_VIEW_KEYS]
}
