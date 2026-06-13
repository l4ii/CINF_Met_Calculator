import { elementMassFraction } from './atomicMass.ts'
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
