import { COMPOUND_MOLAR_MASS, atomicMass, elementMassFraction } from './atomicMass.ts'
import type { CopperElementKey, WeightedComposition } from './copperWorkflowCalc.ts'
import { COPPER_ELEMENT_KEYS } from './copperWorkflowCalc.ts'

/** 约束 JSON 中的元素键（可为化验化合物键或单质键如 S(硅)、Ca(钙)） */
export type ConstraintElementKey = string

export interface ConstraintElementFeedBinding {
  feedKey: CopperElementKey
  /** 单质质量 = 入炉化合物质量 × metalMassFraction */
  metalMassFraction: number
  /** 写入产物元素池时使用的化合物/金属化验键 */
  poolKey: CopperElementKey
  /** 化合物质量 = 单质质量 / metalMassFraction */
  poolMetalFraction: number
}

const OXIDE_BINDINGS: Array<{
  constraintKey: ConstraintElementKey
  feedKey: CopperElementKey
  metalSymbol: string
  oxideComposition: Record<string, number>
}> = [
  {
    constraintKey: 'S(硅)',
    feedKey: 'SiO₂(二氧化硅)',
    metalSymbol: 'Si',
    oxideComposition: { Si: 1, O: 2 },
  },
  {
    constraintKey: 'Ca(钙)',
    feedKey: 'CaO(氧化钙)',
    metalSymbol: 'Ca',
    oxideComposition: { Ca: 1, O: 1 },
  },
  {
    constraintKey: 'Mg(镁)',
    feedKey: 'MgO(氧化镁)',
    metalSymbol: 'Mg',
    oxideComposition: { Mg: 1, O: 1 },
  },
  {
    constraintKey: 'Al(铝)',
    feedKey: 'Al₂O₃(三氧化二铝)',
    metalSymbol: 'Al',
    oxideComposition: { Al: 2, O: 3 },
  },
]

function buildBinding(
  feedKey: CopperElementKey,
  metalSymbol: string,
  oxideComposition: Record<string, number>
): ConstraintElementFeedBinding {
  const metalMassFraction = elementMassFraction(oxideComposition, metalSymbol)
  return {
    feedKey,
    metalMassFraction,
    poolKey: feedKey,
    poolMetalFraction: metalMassFraction,
  }
}

const CONSTRAINT_ELEMENT_BINDINGS: Record<ConstraintElementKey, ConstraintElementFeedBinding> = {
  ...Object.fromEntries(
    OXIDE_BINDINGS.map((row) => [
      row.constraintKey,
      buildBinding(row.feedKey, row.metalSymbol, row.oxideComposition),
    ])
  ),
}

/** 入炉化验氧化物当量 → 约束表单质键（SiO₂→S(硅)、CaO→Ca(钙)…） */
const FEED_KEY_TO_CONSTRAINT_ELEMENT: Partial<Record<CopperElementKey, ConstraintElementKey>> =
  Object.fromEntries(OXIDE_BINDINGS.map((row) => [row.feedKey, row.constraintKey]))

/**
 * 化验列键 → 元素约束行键。
 * 投入表用氧化物当量（SiO₂/CaO/MgO/Al₂O₃）；约束/守恒层用单质（S(硅)/Ca/Mg/Al）。
 */
export function assayKeyToConstraintElementKey(assayKey: string): ConstraintElementKey {
  return FEED_KEY_TO_CONSTRAINT_ELEMENT[assayKey as CopperElementKey] ?? assayKey
}

const OXIDE_EQUIVALENT_OXYGEN_FRACTIONS: Partial<Record<CopperElementKey, number>> = {
  'SiO₂(二氧化硅)': 1 - atomicMass('Si') / COMPOUND_MOLAR_MASS.SiO2,
  'CaO(氧化钙)': 1 - atomicMass('Ca') / COMPOUND_MOLAR_MASS.CaO,
  'MgO(氧化镁)': 1 - atomicMass('Mg') / COMPOUND_MOLAR_MASS.MgO,
  'Al₂O₃(三氧化二铝)': 1 - (2 * atomicMass('Al')) / COMPOUND_MOLAR_MASS.Al2O3,
  'FeO(氧化亚铁)': 1 - atomicMass('Fe') / COMPOUND_MOLAR_MASS.FeO,
}

const INPUT_OXIDE_EQUIVALENT_KEYS: CopperElementKey[] = [
  'SiO₂(二氧化硅)',
  'CaO(氧化钙)',
  'MgO(氧化镁)',
  'Al₂O₃(三氧化二铝)',
]

function finitePositive(value: number | undefined): number {
  return Number.isFinite(value) ? Math.max(0, Number(value)) : 0
}

function oxideEquivalentOxygenMass(key: CopperElementKey, compoundMass: number): number {
  const fraction = OXIDE_EQUIVALENT_OXYGEN_FRACTIONS[key] ?? 0
  return finitePositive(compoundMass) * fraction
}

/**
 * 前端可继续显示 SiO2/CaO/MgO/Al2O3 等氧化物当量；内部元素守恒时，
 * 这些当量中携带的氧需要额外进入 O 池。FeO 输入则拆成 Fe + O。
 * 石灰石等碳酸盐化验常把「CaO+C+Other」写成 CaCO3，Other 实为碳酸根氧；
 * 按 CaO/MgO 可承载的碳量补入 O，否则产物 CO2 的氧会凭空出现。
 */
export function expandAssayDisplayMassForBalance(
  source: Partial<Record<CopperElementKey, number>> | undefined
): Partial<Record<CopperElementKey, number>> {
  const out: Partial<Record<CopperElementKey, number>> = {}
  for (const key of COPPER_ELEMENT_KEYS) {
    const value = finitePositive(source?.[key])
    if (value > 0) out[key] = value
  }

  const feo = finitePositive(source?.['FeO(氧化亚铁)'])
  if (feo > 0) {
    out['Fe(铁)'] = (out['Fe(铁)'] ?? 0) + feo * (atomicMass('Fe') / COMPOUND_MOLAR_MASS.FeO)
    out['O(氧)'] = (out['O(氧)'] ?? 0) + oxideEquivalentOxygenMass('FeO(氧化亚铁)', feo)
    out['FeO(氧化亚铁)'] = 0
  }

  const carbon = finitePositive(out['C (碳)'])
  const cao = finitePositive(out['CaO(氧化钙)'])
  const mgo = finitePositive(out['MgO(氧化镁)'])
  if (carbon > 0 && (cao > 0 || mgo > 0)) {
    const carbonateCarbonCap =
      (cao * atomicMass('C')) / COMPOUND_MOLAR_MASS.CaO +
      (mgo * atomicMass('C')) / COMPOUND_MOLAR_MASS.MgO
    const carbonateCarbon = Math.min(carbon, carbonateCarbonCap)
    const carbonateOxygen = (carbonateCarbon * 2 * atomicMass('O')) / atomicMass('C')
    if (carbonateOxygen > 0) {
      out['O(氧)'] = (out['O(氧)'] ?? 0) + carbonateOxygen
      const other = finitePositive(out['Other(其他)'])
      if (other > 0) out['Other(其他)'] = Math.max(0, other - carbonateOxygen)
    }
  }

  return out
}

/**
 * 从分子式得到的显示池通常同时含“氧化物当量”和真实 O。
 * 展示 w% 时扣掉已经包含在氧化物当量里的氧，避免前端合计超过 100%。
 */
export function singleCountOxideDisplayMass(
  source: Partial<Record<CopperElementKey, number>> | undefined
): Partial<Record<CopperElementKey, number>> {
  const out: Partial<Record<CopperElementKey, number>> = {}
  for (const key of COPPER_ELEMENT_KEYS) {
    const value = finitePositive(source?.[key])
    if (value > 0) out[key] = value
  }

  const representedOxygen = (Object.keys(OXIDE_EQUIVALENT_OXYGEN_FRACTIONS) as CopperElementKey[]).reduce(
    (sum, key) => sum + oxideEquivalentOxygenMass(key, source?.[key] ?? 0),
    0
  )
  const directOxygen = finitePositive(source?.['O(氧)'])
  if (directOxygen > 0 || representedOxygen > 0) {
    const residualOxygen = Math.max(0, directOxygen - representedOxygen)
    if (residualOxygen > 0) out['O(氧)'] = residualOxygen
    else delete out['O(氧)']
  }

  return out
}

/** 约束元素键 → 入炉化验键绑定；未映射则视为与化验键同名 */
export function resolveConstraintElementBinding(constraintElement: ConstraintElementKey): ConstraintElementFeedBinding {
  const bound = CONSTRAINT_ELEMENT_BINDINGS[constraintElement]
  if (bound) return bound
  const feedKey = constraintElement as CopperElementKey
  return {
    feedKey,
    metalMassFraction: 1,
    poolKey: feedKey,
    poolMetalFraction: 1,
  }
}

/** 从入炉混料读取约束单质质量（t/h） */
export function constraintFeedMetalMass(
  constraintElement: ConstraintElementKey,
  blendFeed: WeightedComposition
): number {
  const binding = resolveConstraintElementBinding(constraintElement)
  const compoundMass = blendFeed.elementWeights[binding.feedKey] ?? 0
  if (compoundMass <= 0) return 0
  return compoundMass * binding.metalMassFraction
}

/** 约束分配的单质质量 → 产物池化合物质量 */
export function metalMassToPoolCompoundMass(
  constraintElement: ConstraintElementKey,
  metalMass: number
): { poolKey: CopperElementKey; compoundMass: number } {
  const binding = resolveConstraintElementBinding(constraintElement)
  if (metalMass <= 0) return { poolKey: binding.poolKey, compoundMass: 0 }
  const compoundMass =
    binding.poolMetalFraction > 0 ? metalMass / binding.poolMetalFraction : metalMass
  return { poolKey: binding.poolKey, compoundMass }
}

export function addMetalAllocationToProductPool(
  pool: Partial<Record<CopperElementKey, number>>,
  constraintElement: ConstraintElementKey,
  metalMass: number
) {
  const { poolKey, compoundMass } = metalMassToPoolCompoundMass(constraintElement, metalMass)
  if (compoundMass <= 0) return
  pool[poolKey] = (pool[poolKey] ?? 0) + compoundMass
}

/** 已由约束表覆盖的入炉化验键 */
export function feedKeysCoveredByConstraints(constraintElements: ConstraintElementKey[]): Set<CopperElementKey> {
  const covered = new Set<CopperElementKey>()
  for (const key of constraintElements) {
    covered.add(resolveConstraintElementBinding(key).feedKey)
  }
  return covered
}

export function isKnownCopperElementKey(key: string): key is CopperElementKey {
  return (COPPER_ELEMENT_KEYS as readonly string[]).includes(key)
}
