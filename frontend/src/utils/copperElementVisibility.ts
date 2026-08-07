import { COPPER_PLACEHOLDER_ELEMENT_KEYS, sortCopperElementKeys } from './copperDisplayOrder.ts'
import { assayKeyToConstraintElementKey } from './copperConstraintElementBridge.ts'
import { sortOxyConstraintElementKeys } from './copperConstraintElementOrder.ts'
import {
  COPPER_ELEMENT_KEYS,
  normalizeCopperAssayRatios,
  type CopperElementKey,
  type CopperRatios,
} from './copperWorkflowCalc.ts'

const DEFAULT_VISIBLE_ELEMENT_FALLBACK = [...COPPER_PLACEHOLDER_ELEMENT_KEYS] as CopperElementKey[]

/** 原料/配料相关对象是否含有该元素列 */
export function elementKeyHasValue(
  ratios: CopperRatios,
  element: CopperElementKey,
  epsilon = 1e-12
): boolean {
  const normalized = normalizeCopperAssayRatios(ratios)
  const value = normalized[element]
  return value != null && Number.isFinite(value) && Math.abs(value) >= epsilon
}

/** 投入-物料元素表含水行固定展示的元素列 */
export const COPPER_ELEMENT_TABLE_ALWAYS_INCLUDE: CopperElementKey[] = ['H(氢)', 'O(氧)']

/** 元素约束表常驻列（烟气/水分/碳平衡），即使化验为 0 也保留 */
export const CONSTRAINT_FEED_ALWAYS_INCLUDE: CopperElementKey[] = [
  'O(氧)',
  'N(氮)',
  'H(氢)',
  'C (碳)',
]

/** 当前相关原料中有数据的元素列并集（canonical 顺序） */
export function visibleCopperElementKeys(
  sources: Array<{ ratios?: CopperRatios }>,
  fallback: readonly CopperElementKey[] = DEFAULT_VISIBLE_ELEMENT_FALLBACK,
  epsilon = 1e-12,
  alwaysInclude: readonly CopperElementKey[] = []
): CopperElementKey[] {
  const keys = new Set<CopperElementKey>(alwaysInclude)
  for (const src of sources) {
    const ratios = src.ratios ?? {}
    for (const element of COPPER_ELEMENT_KEYS) {
      if (elementKeyHasValue(ratios, element, epsilon)) keys.add(element)
    }
  }
  if (keys.size === 0) return [...fallback]
  return sortCopperElementKeys(keys) as CopperElementKey[]
}

/**
 * 元素约束表可见元素键（约束口径）：
 * 投入化验出现的列 ∪ O/N/H/C，并把 SiO₂/CaO/MgO/Al₂O₃ 映射为 S(硅)/Ca(钙)/Mg(镁)/Al(铝)。
 */
export function collectFeedConstraintElementKeys(
  sources: Array<{ ratios?: CopperRatios }>,
  epsilon = 1e-12
): string[] {
  const assayKeys = visibleCopperElementKeys(
    sources,
    CONSTRAINT_FEED_ALWAYS_INCLUDE,
    epsilon,
    CONSTRAINT_FEED_ALWAYS_INCLUDE
  )
  const constraintKeys = new Set(assayKeys.map(assayKeyToConstraintElementKey))
  return sortOxyConstraintElementKeys(constraintKeys)
}
