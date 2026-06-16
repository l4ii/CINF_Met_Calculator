import {
  constraintFeedMetalMass,
  resolveConstraintElementBinding,
  type ConstraintElementKey,
} from './copperConstraintElementBridge.ts'
import {
  CONSTRAINT_PLACEHOLDER_ELEMENTS,
  OXY_PRODUCT_KEY_TO_CN,
  OXY_SIDE_BLOW_PRODUCT_KEYS,
  resolveProductEffectiveAllowedElements,
  type ConstraintElementKey,
  type OxySideBlowConstraintConfig,
  type OxySideBlowProductKey,
} from './copperConstraintConfig.ts'
import { evaluateConstraintExprString, type ConstraintSymbolTable } from './copperConstraintExpression.ts'
import type { CopperElementKey } from './copperWorkflowCalc.ts'
import { COPPER_ELEMENT_KEYS } from './copperWorkflowCalc.ts'

export type EquationKind = 'D%' | 'W%' | 'custom' | 'balance' | 'mass_balance' | 'water_balance' | 'allowlist'

export interface CompiledEquation {
  id: string
  kind: EquationKind
  target: number
  label: string
  expr?: string
  constraintElement?: ConstraintElementKey
  productKey?: OxySideBlowProductKey
  feedKey?: CopperElementKey
  ruleValue?: number | string
}

function expandAllowedPoolKeys(allowedElements: string[]): Set<CopperElementKey> {
  const set = new Set<CopperElementKey>()
  for (const el of allowedElements) {
    if (CONSTRAINT_PLACEHOLDER_ELEMENTS.has(el)) continue
    const binding = resolveConstraintElementBinding(el)
    set.add(binding.poolKey)
    if ((COPPER_ELEMENT_KEYS as readonly string[]).includes(el)) {
      set.add(el as CopperElementKey)
    }
  }
  return set
}

function productPoolElementMass(
  table: ConstraintSymbolTable,
  productKey: OxySideBlowProductKey,
  feedKey: CopperElementKey
): number {
  const productName = OXY_PRODUCT_KEY_TO_CN[productKey]
  return table.outputElementMass[productName]?.[feedKey] ?? 0
}

function resolveConfigNumber(value: number | string, variables: Record<string, number> | undefined): number {
  if (typeof value === 'number') return value
  return variables?.[value] ?? 0
}

function productElementMass(
  table: ConstraintSymbolTable,
  productKey: OxySideBlowProductKey,
  constraintElement: ConstraintElementKey
): number {
  const binding = resolveConstraintElementBinding(constraintElement)
  const productName = OXY_PRODUCT_KEY_TO_CN[productKey]
  const compoundMass = table.outputElementMass[productName]?.[binding.poolKey] ?? 0
  return compoundMass * binding.poolMetalFraction
}

function productTotalMass(table: ConstraintSymbolTable, productKey: OxySideBlowProductKey): number {
  return table.outputMass[OXY_PRODUCT_KEY_TO_CN[productKey]] ?? 0
}

function totalProductElementCompoundMass(
  table: ConstraintSymbolTable,
  feedKey: CopperElementKey
): number {
  return OXY_SIDE_BLOW_PRODUCT_KEYS.reduce((sum, pk) => {
    const productName = OXY_PRODUCT_KEY_TO_CN[pk]
    return sum + (table.outputElementMass[productName]?.[feedKey] ?? 0)
  }, 0)
}

export function compileOxyConstraintSystem(config: OxySideBlowConstraintConfig): CompiledEquation[] {
  const equations: CompiledEquation[] = []

  for (const entry of config.elementDistributions) {
    for (const rule of entry.rules) {
      if (rule.type === 'D%') {
        equations.push({
          id: `D:${entry.element}:${rule.product}`,
          kind: 'D%',
          target: 0,
          label: `D% ${entry.element} → ${rule.product} = ${String(rule.value)}%`,
          constraintElement: entry.element,
          productKey: rule.product,
          ruleValue: rule.value,
        })
      } else {
        equations.push({
          id: `W:${entry.element}:${rule.product}`,
          kind: 'W%',
          target: 0,
          label: `W% ${entry.element} @ ${rule.product} = ${String(rule.value)}%`,
          constraintElement: entry.element,
          productKey: rule.product,
          ruleValue: rule.value,
        })
      }
    }
  }

  for (const [index, constraint] of config.customConstraints.entries()) {
    equations.push({
      id: `custom:${index}`,
      kind: 'custom',
      target: constraint.target,
      label: constraint.expr,
      expr: constraint.expr,
    })
  }

  for (const productKey of OXY_SIDE_BLOW_PRODUCT_KEYS) {
    const allowed = expandAllowedPoolKeys(resolveProductEffectiveAllowedElements(config, productKey))
    const productName = OXY_PRODUCT_KEY_TO_CN[productKey]
    for (const feedKey of COPPER_ELEMENT_KEYS) {
      if (allowed.has(feedKey)) continue
      equations.push({
        id: `allowlist:${productKey}:${feedKey}`,
        kind: 'allowlist',
        target: 0,
        label: `白名单 ${productName} 不含 ${feedKey}`,
        productKey,
        feedKey,
      })
    }
  }

  for (const feedKey of COPPER_ELEMENT_KEYS) {
    equations.push({
      id: `balance:${feedKey}`,
      kind: 'balance',
      target: 0,
      label: `元素守恒 ${feedKey}`,
      feedKey,
    })
  }

  equations.push({
    id: 'mass:total',
    kind: 'mass_balance',
    target: 0,
    label: '质量守恒 总产出 = 原料+熔剂+煤+工艺气',
  })

  equations.push({
    id: 'water:flueGasH2O',
    kind: 'water_balance',
    target: 0,
    label: '含水守恒 熔炼出炉烟气.H2O = 原料+熔剂+煤含水',
  })

  return equations
}

export function evaluateEquationResidual(
  equation: CompiledEquation,
  table: ConstraintSymbolTable,
  config: OxySideBlowConstraintConfig,
  distributionFeedElementWeights: Partial<Record<CopperElementKey, number>>,
  balanceFeedElementWeights: Partial<Record<CopperElementKey, number>> = distributionFeedElementWeights
): number {
  switch (equation.kind) {
    case 'D%': {
      if (!equation.constraintElement || !equation.productKey) return 0
      const percent = resolveConfigNumber(equation.ruleValue ?? 0, config.variables)
      const feedMetal = constraintFeedMetalMass(equation.constraintElement, {
        totalWeight: 0,
        elementWeights: distributionFeedElementWeights as Record<CopperElementKey, number>,
        ratios: {} as Record<CopperElementKey, number>,
      })
      const inProduct = productElementMass(table, equation.productKey, equation.constraintElement)
      const targetMass = (percent / 100) * feedMetal
      return inProduct - targetMass
    }
    case 'W%': {
      if (!equation.constraintElement || !equation.productKey) return 0
      const percent = resolveConfigNumber(equation.ruleValue ?? 0, config.variables)
      const inProduct = productElementMass(table, equation.productKey, equation.constraintElement)
      const productMass = productTotalMass(table, equation.productKey)
      return inProduct - (percent / 100) * productMass
    }
    case 'custom': {
      if (!equation.expr) return 0
      return evaluateConstraintExprString(equation.expr, table) - equation.target
    }
    case 'balance': {
      if (!equation.feedKey) return 0
      const feedMass = balanceFeedElementWeights[equation.feedKey] ?? 0
      const allocated = totalProductElementCompoundMass(table, equation.feedKey)
      return allocated - feedMass
    }
    case 'mass_balance': {
      const totalOutput = OXY_SIDE_BLOW_PRODUCT_KEYS.reduce(
        (sum, pk) => sum + productTotalMass(table, pk),
        0
      )
      const totalInput = table.inputMass['总投入'] ?? table.inputMass['混料'] ?? 0
      return totalOutput - totalInput
    }
    case 'water_balance': {
      const productName = OXY_PRODUCT_KEY_TO_CN.flueGas
      const h2o = table.outputPhaseMass[productName]?.H2O ?? 0
      const water = table.inputMass['含水'] ?? 0
      return h2o - water
    }
    case 'allowlist': {
      if (!equation.productKey || !equation.feedKey) return 0
      return productPoolElementMass(table, equation.productKey, equation.feedKey)
    }
    default:
      return 0
  }
}

function equationScale(
  equation: CompiledEquation,
  table: ConstraintSymbolTable,
  config: OxySideBlowConstraintConfig,
  distributionFeedElementWeights: Partial<Record<CopperElementKey, number>>,
  balanceFeedElementWeights: Partial<Record<CopperElementKey, number>> = distributionFeedElementWeights
): number {
  switch (equation.kind) {
    case 'D%': {
      if (!equation.constraintElement) return 1
      const percent = resolveConfigNumber(equation.ruleValue ?? 0, config.variables)
      const feedMetal = constraintFeedMetalMass(equation.constraintElement, {
        totalWeight: 0,
        elementWeights: distributionFeedElementWeights as Record<CopperElementKey, number>,
        ratios: {} as Record<CopperElementKey, number>,
      })
      if (percent <= 0) return Math.max(feedMetal * 0.01, 1e-6)
      return Math.max((percent / 100) * feedMetal, feedMetal * 1e-6, 1e-6)
    }
    case 'W%': {
      if (!equation.productKey) return 1
      const percent = resolveConfigNumber(equation.ruleValue ?? 0, config.variables)
      const productMass = productTotalMass(table, equation.productKey)
      return Math.max((percent / 100) * productMass, productMass * 1e-6, 1e-6)
    }
    case 'custom':
      return Math.max(Math.abs(equation.target), 1)
    case 'balance': {
      if (!equation.feedKey) return 1
      return Math.max(balanceFeedElementWeights[equation.feedKey] ?? 0, 1e-6)
    }
    case 'mass_balance': {
      return Math.max(table.inputMass['总投入'] ?? table.inputMass['混料'] ?? 0, 1e-6)
    }
    case 'water_balance': {
      const productName = OXY_PRODUCT_KEY_TO_CN.flueGas
      return Math.max(table.inputMass['含水'] ?? table.outputPhaseMass[productName]?.H2O ?? 0, 1e-6)
    }
    case 'allowlist': {
      if (!equation.productKey) return 1
      const productMass = productTotalMass(table, equation.productKey)
      return Math.max(productMass * 1e-6, 1e-6)
    }
    default:
      return 1
  }
}

export function relativeResidual(value: number, target = 0, scale = 1): number {
  const denom = Math.max(Math.abs(target), Math.abs(scale), 1e-9)
  return Math.abs(value - target) / denom
}

export function evaluateScaledEquationResidual(
  equation: CompiledEquation,
  table: ConstraintSymbolTable,
  config: OxySideBlowConstraintConfig,
  distributionFeedElementWeights: Partial<Record<CopperElementKey, number>>,
  balanceFeedElementWeights: Partial<Record<CopperElementKey, number>> = distributionFeedElementWeights
) {
  const residual = evaluateEquationResidual(
    equation,
    table,
    config,
    distributionFeedElementWeights,
    balanceFeedElementWeights
  )
  const target = equation.kind === 'custom' ? equation.target : 0
  const scale = equationScale(
    equation,
    table,
    config,
    distributionFeedElementWeights,
    balanceFeedElementWeights
  )
  return {
    residual,
    target,
    scale,
    relativeResidual: relativeResidual(residual, target, scale),
  }
}

export function equationResidualRow(
  equation: CompiledEquation,
  table: ConstraintSymbolTable,
  config: OxySideBlowConstraintConfig,
  distributionFeedElementWeights: Partial<Record<CopperElementKey, number>>,
  balanceFeedElementWeights: Partial<Record<CopperElementKey, number>> = distributionFeedElementWeights
) {
  const residual = evaluateEquationResidual(
    equation,
    table,
    config,
    distributionFeedElementWeights,
    balanceFeedElementWeights
  )
  const compareTarget = equation.kind === 'custom' ? equation.target : 0
  const scale = equationScale(
    equation,
    table,
    config,
    distributionFeedElementWeights,
    balanceFeedElementWeights
  )
  const value = residual + compareTarget
  return {
    expr: equation.label,
    value,
    target: compareTarget,
    residual,
    relativeResidual: relativeResidual(residual, compareTarget, scale),
    applicable: true as const,
  }
}
