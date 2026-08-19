import { ANTIMONY_PLACEHOLDER_ELEMENT_KEYS, sortAntimonyElementKeys } from './antimonyDisplayOrder.ts'
import { assayKeyToConstraintElementKey } from './antimonyConstraintElementBridge.ts'
import { sortOxyConstraintElementKeys } from './antimonyConstraintElementOrder.ts'
import {
  ANTIMONY_ELEMENT_KEYS,
  normalizeAntimonyAssayRatios,
  type AntimonyElementKey,
  type AntimonyRatios,
} from './antimonyWorkflowCalc.ts'

const DEFAULT_VISIBLE_ELEMENT_FALLBACK = [...ANTIMONY_PLACEHOLDER_ELEMENT_KEYS] as AntimonyElementKey[]

/** 原料/配料相关对象是否含有该元素列 */
export function elementKeyHasValue(
  ratios: AntimonyRatios,
  element: AntimonyElementKey,
  epsilon = 1e-12
): boolean {
  const normalized = normalizeAntimonyAssayRatios(ratios)
  const value = normalized[element]
  return value != null && Number.isFinite(value) && Math.abs(value) >= epsilon
}

/** 投入-物料元素表含水行固定展示的元素列 */
export const ANTIMONY_ELEMENT_TABLE_ALWAYS_INCLUDE: AntimonyElementKey[] = ['H(氢)', 'O(氧)']

/** 元素约束表常驻列（烟气/水分/碳平衡），即使化验为 0 也保留 */
export const CONSTRAINT_FEED_ALWAYS_INCLUDE: AntimonyElementKey[] = [
  'O(氧)',
  'N(氮)',
  'H(氢)',
  'C (碳)',
]

/** 当前相关原料中有数据的元素列并集（canonical 顺序） */
export function visibleAntimonyElementKeys(
  sources: Array<{ ratios?: AntimonyRatios }>,
  fallback: readonly AntimonyElementKey[] = DEFAULT_VISIBLE_ELEMENT_FALLBACK,
  epsilon = 1e-12,
  alwaysInclude: readonly AntimonyElementKey[] = []
): AntimonyElementKey[] {
  const keys = new Set<AntimonyElementKey>(alwaysInclude)
  for (const src of sources) {
    const ratios = src.ratios ?? {}
    for (const element of ANTIMONY_ELEMENT_KEYS) {
      if (elementKeyHasValue(ratios, element, epsilon)) keys.add(element)
    }
  }
  if (keys.size === 0) return [...fallback]
  return sortAntimonyElementKeys(keys) as AntimonyElementKey[]
}

/**
 * 元素约束表可见元素键（约束口径）：
 * 投入化验出现的列 ∪ O/N/H/C，并把 SiO₂/CaO/MgO/Al₂O₃ 映射为 S(硅)/Ca(钙)/Mg(镁)/Al(铝)。
 */
export function collectFeedConstraintElementKeys(
  sources: Array<{ ratios?: AntimonyRatios }>,
  epsilon = 1e-12
): string[] {
  const assayKeys = visibleAntimonyElementKeys(
    sources,
    CONSTRAINT_FEED_ALWAYS_INCLUDE,
    epsilon,
    CONSTRAINT_FEED_ALWAYS_INCLUDE
  )
  const constraintKeys = new Set(assayKeys.map(assayKeyToConstraintElementKey))
  return sortOxyConstraintElementKeys(constraintKeys)
}
