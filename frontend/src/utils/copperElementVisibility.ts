import { COPPER_PLACEHOLDER_ELEMENT_KEYS, sortCopperElementKeys } from './copperDisplayOrder.ts'
import {
  COPPER_ELEMENT_KEYS,
  normalizeCopperRatios,
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
  const normalized = normalizeCopperRatios(ratios)
  const value = normalized[element]
  return value != null && Number.isFinite(value) && Math.abs(value) >= epsilon
}

/** 当前相关原料中有数据的元素列并集（canonical 顺序） */
export function visibleCopperElementKeys(
  sources: Array<{ ratios?: CopperRatios }>,
  fallback: readonly CopperElementKey[] = DEFAULT_VISIBLE_ELEMENT_FALLBACK,
  epsilon = 1e-12
): CopperElementKey[] {
  const keys = new Set<CopperElementKey>()
  for (const src of sources) {
    const ratios = src.ratios ?? {}
    for (const element of COPPER_ELEMENT_KEYS) {
      if (elementKeyHasValue(ratios, element, epsilon)) keys.add(element)
    }
  }
  if (keys.size === 0) return [...fallback]
  return sortCopperElementKeys(keys) as CopperElementKey[]
}
