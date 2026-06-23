import {
  CONSTRAINT_PLACEHOLDER_ELEMENTS,
  OXY_PRODUCT_KEY_TO_CN,
  OXY_SIDE_BLOW_PRODUCT_KEYS,
  resolveProductEffectiveAllowedElements,
  type ConstraintElementKey,
  type OxySideBlowConstraintConfig,
  type OxySideBlowProductKey,
} from './copperConstraintConfig.ts'
import { resolveConstraintElementBinding } from './copperConstraintElementBridge.ts'
import { sortOxyConstraintElementKeys } from './copperConstraintElementOrder.ts'
import type { OxyConstraintSolverResult, OxyProductResult } from './copperConstraintSolver.ts'
import { COPPER_ELEMENT_DISPLAY_ORDER } from './copperDisplayOrder.ts'
import type { CopperElementKey } from './copperWorkflowCalc.ts'

export interface ProductElementDisplayRow {
  constraintKey: ConstraintElementKey
  label: string
  poolKeys: CopperElementKey[]
}

export type ProductPivotRowKind = 'mass' | 'share' | 'wClose' | 'element'

export interface ProductPivotRow {
  kind: ProductPivotRowKind
  label: string
  constraintKey?: ConstraintElementKey
  values: Partial<Record<OxySideBlowProductKey, number | null>>
  total: number | null
}

function poolKeysForConstraintKey(constraintKey: ConstraintElementKey): CopperElementKey[] {
  if (CONSTRAINT_PLACEHOLDER_ELEMENTS.has(constraintKey)) return []
  const binding = resolveConstraintElementBinding(constraintKey)
  const keys = new Set<CopperElementKey>([binding.poolKey])
  if ((COPPER_ELEMENT_DISPLAY_ORDER as readonly string[]).includes(constraintKey)) {
    keys.add(constraintKey as CopperElementKey)
  }
  return [...keys]
}

/** 各产物有效白名单（基础 ∪ W%/D%）的并集，按统一显示顺序排序 */
export function buildProductAllowedElementRows(
  config: OxySideBlowConstraintConfig
): ProductElementDisplayRow[] {
  const union = new Set<ConstraintElementKey>()
  for (const pk of OXY_SIDE_BLOW_PRODUCT_KEYS) {
    for (const el of resolveProductEffectiveAllowedElements(config, pk)) {
      union.add(el)
    }
  }
  const ordered = sortOxyConstraintElementKeys(union)
  return ordered.map((constraintKey) => ({
    constraintKey,
    label: constraintKey,
    poolKeys: poolKeysForConstraintKey(constraintKey),
  }))
}

export function isElementAllowedInProduct(
  productKey: OxySideBlowProductKey,
  constraintKey: ConstraintElementKey,
  config: OxySideBlowConstraintConfig
): boolean {
  return resolveProductEffectiveAllowedElements(config, productKey).includes(constraintKey)
}

function compositionPercent(product: OxyProductResult, poolKeys: CopperElementKey[]): number {
  if (product.mass <= 0) return 0
  const sum = poolKeys.reduce((acc, key) => acc + (product.composition[key] ?? 0), 0)
  return sum
}

function elementMassTh(product: OxyProductResult, poolKeys: CopperElementKey[]): number {
  return poolKeys.reduce((acc, key) => acc + (product.elementMass[key] ?? 0), 0)
}

export function buildProductResultPivotData(
  result: OxyConstraintSolverResult,
  config: OxySideBlowConstraintConfig
): ProductPivotRow[] {
  const rows: ProductPivotRow[] = []
  const totalMass = result.totalProductMass

  const massValues = {} as Partial<Record<OxySideBlowProductKey, number | null>>
  const shareValues = {} as Partial<Record<OxySideBlowProductKey, number | null>>
  const wCloseValues = {} as Partial<Record<OxySideBlowProductKey, number | null>>

  for (const pk of OXY_SIDE_BLOW_PRODUCT_KEYS) {
    const product = result.products[pk]
    massValues[pk] = product.mass
    shareValues[pk] = totalMass > 0 ? (product.mass / totalMass) * 100 : 0
    const compTotal = Object.values(product.composition).reduce((sum, v) => sum + (v ?? 0), 0)
    wCloseValues[pk] = product.mass > 0 ? compTotal : null
  }

  rows.push({
    kind: 'mass',
    label: 't/h',
    values: massValues,
    total: totalMass,
  })
  rows.push({
    kind: 'share',
    label: '占比%',
    values: shareValues,
    total: totalMass > 0 ? 100 : 0,
  })
  rows.push({
    kind: 'wClose',
    label: 'w%',
    values: wCloseValues,
    total: null,
  })

  for (const elementRow of buildProductAllowedElementRows(config)) {
    const values = {} as Partial<Record<OxySideBlowProductKey, number | null>>
    let totalMassAllocated = 0
    for (const pk of OXY_SIDE_BLOW_PRODUCT_KEYS) {
      if (!isElementAllowedInProduct(pk, elementRow.constraintKey, config)) {
        values[pk] = null
        continue
      }
      if (CONSTRAINT_PLACEHOLDER_ELEMENTS.has(elementRow.constraintKey)) {
        values[pk] = null
        continue
      }
      const pct = compositionPercent(result.products[pk], elementRow.poolKeys)
      values[pk] = pct
      totalMassAllocated += elementMassTh(result.products[pk], elementRow.poolKeys)
    }
    rows.push({
      kind: 'element',
      label: elementRow.label,
      constraintKey: elementRow.constraintKey,
      values,
      total: totalMassAllocated > 0 ? null : null,
    })
  }

  return rows
}

export function productResultColumnHeaders(config: OxySideBlowConstraintConfig): Array<{
  key: OxySideBlowProductKey
  label: string
}> {
  return OXY_SIDE_BLOW_PRODUCT_KEYS.map((key) => ({
    key,
    label: OXY_PRODUCT_KEY_TO_CN[key],
  }))
}
