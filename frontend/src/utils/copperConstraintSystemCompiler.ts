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

export type EquationKind = 'D%' | 'W%' | 'custom' | 'balance' | 'product_mass_balance'

export interface CompiledEquation {
  id: string
  kind: EquationKind
  target: number
  label: string
  expr?: string
  soft?: boolean
  constraintElement?: ConstraintElementKey
  productKey?: OxySideBlowProductKey
  feedKey?: CopperElementKey
  ruleValue?: number | string
}

export interface CompileOxyConstraintSystemOptions {
  includeSoftCustom?: boolean
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

function productCanCarryConstraintElement(
  config: OxySideBlowConstraintConfig,
  productKey: OxySideBlowProductKey,
  constraintElement: ConstraintElementKey
): boolean {
  const allowed = expandAllowedPoolKeys(resolveProductEffectiveAllowedElements(config, productKey))
  const binding = resolveConstraintElementBinding(constraintElement)
  return allowed.has(binding.poolKey)
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

function productPhaseMass(table: ConstraintSymbolTable, productKey: OxySideBlowProductKey): number {
  const productName = OXY_PRODUCT_KEY_TO_CN[productKey]
  return Object.values(table.outputPhaseMass[productName] ?? {}).reduce(
    (sum, value) => sum + Math.max(0, value),
    0
  )
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

export function compileOxyConstraintSystem(
  config: OxySideBlowConstraintConfig,
  options: CompileOxyConstraintSystemOptions = {}
): CompiledEquation[] {
  const equations: CompiledEquation[] = []

  for (const entry of config.elementDistributions) {
    for (const rule of entry.rules) {
      if (!productCanCarryConstraintElement(config, rule.product, entry.element)) continue
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
    if (constraint.soft && !options.includeSoftCustom) continue
    equations.push({
      id: `custom:${index}`,
      kind: 'custom',
      target: constraint.target,
      label: constraint.expr,
      expr: constraint.expr,
      soft: Boolean(constraint.soft),
    })
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

  for (const productKey of OXY_SIDE_BLOW_PRODUCT_KEYS) {
    equations.push({
      id: `product_mass:${productKey}`,
      kind: 'product_mass_balance',
      target: 0,
      label: `产物质量闭合 ${OXY_PRODUCT_KEY_TO_CN[productKey]} = Σ物相`,
      productKey,
    })
  }

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
    case 'product_mass_balance': {
      if (!equation.productKey) return 0
      return productTotalMass(table, equation.productKey) - productPhaseMass(table, equation.productKey)
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
      return equation.soft ? Math.max(Math.abs(equation.target), 1e-6) : Math.max(Math.abs(equation.target), 1)
    case 'balance': {
      if (!equation.feedKey) return 1
      return Math.max(balanceFeedElementWeights[equation.feedKey] ?? 0, 1e-6)
    }
    case 'product_mass_balance': {
      if (!equation.productKey) return 1
      return Math.max(productTotalMass(table, equation.productKey), productPhaseMass(table, equation.productKey), 1e-6)
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
    relativeResidual: relativeResidual(residual, 0, scale),
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
    relativeResidual: relativeResidual(residual, 0, scale),
    applicable: true as const,
  }
}
