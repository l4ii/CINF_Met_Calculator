import {
  constraintFeedMetalMass,
  resolveConstraintElementBinding,
} from './copperConstraintElementBridge.ts'
import {
  OXY_PRODUCT_KEY_TO_CN,
  OXY_SIDE_BLOW_PRODUCT_KEYS,
  type ConstraintElementKey,
  type OxySideBlowConstraintConfig,
  type OxySideBlowProductKey,
} from './copperConstraintConfig.ts'
import { evaluateConstraintExprString, evaluateOxygenEnrichmentRatio, type ConstraintSymbolTable } from './copperConstraintExpression.ts'
import {
  DEFAULT_CONSTRAINT_RELATIVE_TOLERANCE,
  isOxygenEnrichmentExpr,
} from './copperProcessParameters.ts'
import {
  autoFillOxyProductConstraintConfig,
  isBlankConstraintRuleValue,
  productCanCarryConstraintElement,
  resolveConstraintRuleValue,
  validateOxyProductConstraintConfig,
} from './copperConstraintValidation.ts'
import type { CopperElementKey } from './copperWorkflowCalc.ts'
import { COPPER_ELEMENT_KEYS } from './copperWorkflowCalc.ts'

export type EquationKind = 'D%' | 'W%' | 'custom' | 'balance' | 'product_element_closure'

export interface CompiledEquation {
  id: string
  kind: EquationKind
  target: number
  label: string
  expr?: string
  soft?: boolean
  relativeTolerance?: number
  constraintElement?: ConstraintElementKey
  productKey?: OxySideBlowProductKey
  feedKey?: CopperElementKey
  ruleValue?: number | string
}

export interface CompileOxyConstraintSystemOptions {
  includeSoftCustom?: boolean
}


function resolveConfigNumber(
  value: number | string,
  variables: Record<string, number> | undefined,
  label = '约束值'
): number {
  const resolved = resolveConstraintRuleValue(value, variables, label)
  if (!resolved.valid) throw new Error(resolved.error ?? `${label}无效`)
  return resolved.value
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

function productElementMassSum(table: ConstraintSymbolTable, productKey: OxySideBlowProductKey): number {
  const productName = OXY_PRODUCT_KEY_TO_CN[productKey]
  return Object.values(table.outputElementMass[productName] ?? {}).reduce(
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
  const preparedConfig = autoFillOxyProductConstraintConfig(config).config
  const validation = validateOxyProductConstraintConfig(preparedConfig)
  if (!validation.valid) {
    throw new Error(validation.errors[0]?.message ?? '元素约束无效')
  }

  const equations: CompiledEquation[] = []

  for (const entry of preparedConfig.elementDistributions) {
    for (const rule of entry.rules) {
      if (!productCanCarryConstraintElement(preparedConfig, rule.product, entry.element)) {
        throw new Error(`${OXY_PRODUCT_KEY_TO_CN[rule.product]} 不能承接 ${entry.element}`)
      }
      if (isBlankConstraintRuleValue(rule.value)) continue
      if (rule.type === 'D%') {
        equations.push({
          id: `D:${entry.element}:${rule.product}`,
          kind: 'D%',
          target: 0,
          label: `D% ${entry.element} → ${OXY_PRODUCT_KEY_TO_CN[rule.product]} = ${String(rule.value)}%`,
          constraintElement: entry.element,
          productKey: rule.product,
          ruleValue: rule.value,
        })
      } else {
        equations.push({
          id: `W:${entry.element}:${rule.product}`,
          kind: 'W%',
          target: 0,
          label: `W% ${entry.element} @ ${OXY_PRODUCT_KEY_TO_CN[rule.product]} = ${String(rule.value)}%`,
          constraintElement: entry.element,
          productKey: rule.product,
          ruleValue: rule.value,
        })
      }
    }
  }

  for (const [index, constraint] of preparedConfig.customConstraints.entries()) {
    if (constraint.soft && !options.includeSoftCustom) continue
    equations.push({
      id: `custom:${index}`,
      kind: 'custom',
      target: constraint.target,
      label: constraint.expr,
      expr: constraint.expr,
      soft: Boolean(constraint.soft),
      relativeTolerance: constraint.relativeTolerance,
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
      id: `product_element_closure:${productKey}`,
      kind: 'product_element_closure',
      target: 0,
      label: `产物元素闭合 ${OXY_PRODUCT_KEY_TO_CN[productKey]}：Σ元素 = 产物总量（w%合计=100%）`,
      productKey,
    })
  }

  return equations
}

function resolveConstraintRelativeTolerance(
  equation: CompiledEquation,
  config: OxySideBlowConstraintConfig
): number {
  if (typeof equation.relativeTolerance === 'number' && Number.isFinite(equation.relativeTolerance)) {
    return Math.max(0, equation.relativeTolerance)
  }
  const fromParams = config.solverParams?.constraintRelativeTolerance
  if (typeof fromParams === 'number' && Number.isFinite(fromParams)) {
    return Math.max(0, fromParams)
  }
  return DEFAULT_CONSTRAINT_RELATIVE_TOLERANCE
}

/** 残差落在相对容差带内则视为满足（千分之五等） */
function applyRelativeToleranceBand(residual: number, reference: number, relativeTol: number): number {
  if (relativeTol <= 0) return residual
  const band =
    Math.abs(reference) > 1e-12 ? Math.abs(reference) * relativeTol : Math.max(relativeTol * 1e-3, 1e-9)
  return Math.abs(residual) <= band ? 0 : residual
}

export function evaluateEquationResidual(
  equation: CompiledEquation,
  table: ConstraintSymbolTable,
  config: OxySideBlowConstraintConfig,
  distributionFeedElementWeights: Partial<Record<CopperElementKey, number>>,
  balanceFeedElementWeights: Partial<Record<CopperElementKey, number>> = distributionFeedElementWeights
): number {
  const relativeTol = resolveConstraintRelativeTolerance(equation, config)
  switch (equation.kind) {
    case 'D%': {
      if (!equation.constraintElement || !equation.productKey) return 0
      const percent = resolveConfigNumber(
        equation.ruleValue ?? 0,
        config.variables,
        `${equation.constraintElement} ${OXY_PRODUCT_KEY_TO_CN[equation.productKey]} ${equation.kind}`
      )
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
      const percent = resolveConfigNumber(
        equation.ruleValue ?? 0,
        config.variables,
        `${equation.constraintElement} ${OXY_PRODUCT_KEY_TO_CN[equation.productKey]} ${equation.kind}`
      )
      const inProduct = productElementMass(table, equation.productKey, equation.constraintElement)
      const productMass = productTotalMass(table, equation.productKey)
      return inProduct - (percent / 100) * productMass
    }
    case 'custom': {
      if (!equation.expr) return 0
      const value =
        isOxygenEnrichmentExpr(equation.expr)
          ? evaluateOxygenEnrichmentRatio(table)
          : evaluateConstraintExprString(equation.expr, table)
      return applyRelativeToleranceBand(value - equation.target, equation.target, relativeTol)
    }
    case 'balance': {
      if (!equation.feedKey) return 0
      const feedMass = balanceFeedElementWeights[equation.feedKey] ?? 0
      const allocated = totalProductElementCompoundMass(table, equation.feedKey)
      return allocated - feedMass
    }
    case 'product_element_closure': {
      if (!equation.productKey) return 0
      return productElementMassSum(table, equation.productKey) - productTotalMass(table, equation.productKey)
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
      if (!equation.constraintElement || !equation.productKey) return 1
      const percent = resolveConfigNumber(
        equation.ruleValue ?? 0,
        config.variables,
        `${equation.constraintElement} ${OXY_PRODUCT_KEY_TO_CN[equation.productKey]} ${equation.kind}`
      )
      const feedMetal = constraintFeedMetalMass(equation.constraintElement, {
        totalWeight: 0,
        elementWeights: distributionFeedElementWeights as Record<CopperElementKey, number>,
        ratios: {} as Record<CopperElementKey, number>,
      })
      if (percent <= 0) return Math.max(feedMetal * 0.01, 1e-6)
      return Math.max((percent / 100) * feedMetal, feedMetal * 1e-6, 1e-6)
    }
    case 'W%': {
      if (!equation.constraintElement || !equation.productKey) return 1
      const percent = resolveConfigNumber(
        equation.ruleValue ?? 0,
        config.variables,
        `${equation.constraintElement} ${OXY_PRODUCT_KEY_TO_CN[equation.productKey]} ${equation.kind}`
      )
      const productMass = productTotalMass(table, equation.productKey)
      return Math.max((percent / 100) * productMass, productMass * 1e-6, 1e-6)
    }
    case 'custom':
      return equation.soft ? Math.max(Math.abs(equation.target), 1e-6) : Math.max(Math.abs(equation.target), 1)
    case 'balance': {
      if (!equation.feedKey) return 1
      return Math.max(balanceFeedElementWeights[equation.feedKey] ?? 0, 1e-6)
    }
    case 'product_element_closure': {
      if (!equation.productKey) return 1
      return Math.max(productTotalMass(table, equation.productKey), productElementMassSum(table, equation.productKey), productPhaseMass(table, equation.productKey), 1e-6)
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

export function formatCompiledEquation(equation: CompiledEquation, index?: number): string {
  const prefix = index == null ? '' : `${index}. `
  const inputElementLabel = (constraintElement: ConstraintElementKey | undefined) => {
    if (!constraintElement) return ''
    const binding = resolveConstraintElementBinding(constraintElement)
    return binding.feedKey === constraintElement ? constraintElement : `${binding.feedKey}折算${constraintElement}`
  }
  switch (equation.kind) {
    case 'D%': {
      const product = equation.productKey ? OXY_PRODUCT_KEY_TO_CN[equation.productKey] : ''
      return `${prefix}OutputE.${product}.${equation.constraintElement} = ${String(equation.ruleValue)}% × Input.混料.${inputElementLabel(equation.constraintElement)}`
    }
    case 'W%': {
      const product = equation.productKey ? OXY_PRODUCT_KEY_TO_CN[equation.productKey] : ''
      return `${prefix}OutputE.${product}.${equation.constraintElement} = ${String(equation.ruleValue)}% × Output.${product}`
    }
    case 'custom':
      return `${prefix}${equation.expr ?? equation.label} = ${equation.target}`
    case 'balance':
      return `${prefix}Σ(OutputE.六产物.${equation.feedKey}) = Input.总投入.${equation.feedKey}`
    case 'product_element_closure': {
      const product = equation.productKey ? OXY_PRODUCT_KEY_TO_CN[equation.productKey] : ''
      return `${prefix}Σ(OutputE.${product}.所有元素) = Output.${product}（元素w%合计=100%）`
    }
    default:
      return `${prefix}${equation.label}`
  }
}
