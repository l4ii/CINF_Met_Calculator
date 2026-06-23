import { phaseFractionsFromFormula } from './chemicalFormula.ts'
import { resolveConstraintElementBinding } from './copperConstraintElementBridge.ts'
import {
  CONSTRAINT_PLACEHOLDER_ELEMENTS,
  OXY_PRODUCT_KEY_TO_CN,
  OXY_SIDE_BLOW_PRODUCT_KEYS,
  resolveProductEffectiveAllowedElements,
  type ConstraintElementKey,
  type DistributionRuleType,
  type ElementDistributionRule,
  type OxySideBlowConstraintConfig,
  type OxySideBlowProductKey,
} from './copperConstraintConfig.ts'
import { COPPER_BUILTIN_PHASE_FRACTIONS } from './copperPhaseStoichiometry.ts'
import { COPPER_ELEMENT_KEYS, type CopperElementKey } from './copperWorkflowCalc.ts'

export const CONSTRAINT_PERCENT_TOLERANCE = 1e-6

export interface ConstraintRuleValueResolution {
  valid: boolean
  value: number
  error?: string
}

export interface ProductConstraintValidationIssue {
  key: string
  message: string
  product?: OxySideBlowProductKey
  element?: ConstraintElementKey
  type?: DistributionRuleType
}

export interface ProductConstraintAutoFill {
  product: OxySideBlowProductKey
  element: ConstraintElementKey
  type: 'D%'
  value: number
}

export interface ProductConstraintAutoFillResult {
  config: OxySideBlowConstraintConfig
  autoFills: ProductConstraintAutoFill[]
}

export interface ProductConstraintValidationResult {
  valid: boolean
  errors: ProductConstraintValidationIssue[]
  warnings: ProductConstraintValidationIssue[]
  dTotalsByElement: Record<string, number>
  wTotalsByProduct: Partial<Record<OxySideBlowProductKey, number>>
  autoFills: ProductConstraintAutoFill[]
}

export interface ProductConstraintValidationOptions {
  allowBlankDAutoFill?: boolean
}

function formatPct(value: number) {
  return Number(value.toFixed(6)).toString()
}

function expandAllowedPoolKeys(config: OxySideBlowConstraintConfig, productKey: OxySideBlowProductKey): Set<CopperElementKey> {
  const set = new Set<CopperElementKey>()
  for (const el of [
    ...resolveProductEffectiveAllowedElements(config, productKey),
    ...(config.products[productKey]?.allowedElements ?? []),
  ]) {
    if (CONSTRAINT_PLACEHOLDER_ELEMENTS.has(el)) continue
    const binding = resolveConstraintElementBinding(el)
    set.add(binding.poolKey)
    if ((COPPER_ELEMENT_KEYS as readonly string[]).includes(el)) {
      set.add(el as CopperElementKey)
    }
  }
  return set
}

export function productCanCarryConstraintElement(
  config: OxySideBlowConstraintConfig,
  productKey: OxySideBlowProductKey,
  constraintElement: ConstraintElementKey
): boolean {
  if (CONSTRAINT_PLACEHOLDER_ELEMENTS.has(constraintElement)) return false
  const allowed = expandAllowedPoolKeys(config, productKey)
  const binding = resolveConstraintElementBinding(constraintElement)
  return allowed.has(binding.poolKey)
}

export function isBlankConstraintRuleValue(value: number | string | null | undefined): boolean {
  return typeof value === 'string' && value.trim() === ''
}

export function resolveConstraintRuleValue(
  value: number | string,
  variables: Record<string, number> | undefined,
  label = '约束值'
): ConstraintRuleValueResolution {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return { valid: false, value: 0, error: `${label}必须是有限数字` }
    if (value < 0 || value > 100) return { valid: false, value, error: `${label}必须在 0-100 之间` }
    return { valid: true, value }
  }

  const trimmed = value.trim()
  if (!trimmed) return { valid: false, value: 0, error: `${label}不能为空` }
  const normalized = trimmed.replace(',', '.')
  const numeric = Number(normalized)
  if (/^(?:\d+\.?\d*|\.\d+)$/.test(normalized) && Number.isFinite(numeric)) {
    if (numeric < 0 || numeric > 100) return { valid: false, value: numeric, error: `${label}必须在 0-100 之间` }
    return { valid: true, value: numeric }
  }

  const variableValue = variables?.[trimmed]
  if (typeof variableValue !== 'number' || !Number.isFinite(variableValue)) {
    return { valid: false, value: 0, error: `未知约束变量 ${trimmed}` }
  }
  if (variableValue < 0 || variableValue > 100) {
    return { valid: false, value: variableValue, error: `变量 ${trimmed} 的值必须在 0-100 之间` }
  }
  return { valid: true, value: variableValue }
}

function ruleKey(product: OxySideBlowProductKey, element: ConstraintElementKey, type: DistributionRuleType) {
  return `${type}:${element}:${product}`
}

function phaseFormulaFractions(phaseKey: string): Partial<Record<CopperElementKey, number>> {
  if (phaseKey === 'Other') return { 'Other(其他)': 1 }
  const builtin = COPPER_BUILTIN_PHASE_FRACTIONS[phaseKey] as Partial<Record<CopperElementKey, number>> | undefined
  if (builtin && Object.keys(builtin).length > 0) return builtin
  return phaseFractionsFromFormula(phaseKey) as Partial<Record<CopperElementKey, number>>
}

function phaseConstraintElementFraction(phaseKey: string, constraintElement: ConstraintElementKey): number {
  const binding = resolveConstraintElementBinding(constraintElement)
  const fractions = phaseFormulaFractions(phaseKey)
  const compoundFraction = fractions[binding.poolKey] ?? 0
  return compoundFraction * binding.poolMetalFraction
}

function singleCarrierPhaseKey(
  config: OxySideBlowConstraintConfig,
  productKey: OxySideBlowProductKey,
  constraintElement: ConstraintElementKey
): string | null {
  const carriers = config.products[productKey].phases
    .map((phaseKey) => ({ phaseKey, fraction: phaseConstraintElementFraction(phaseKey, constraintElement) }))
    .filter((item) => item.fraction > 1e-12)
  return carriers.length === 1 ? carriers[0]!.phaseKey : null
}

function cloneOxySideBlowConstraintConfig(config: OxySideBlowConstraintConfig): OxySideBlowConstraintConfig {
  return {
    ...config,
    _variableNotes: config._variableNotes ? { ...config._variableNotes } : undefined,
    variables: config.variables ? { ...config.variables } : undefined,
    products: Object.fromEntries(
      Object.entries(config.products).map(([key, product]) => [
        key,
        {
          ...product,
          allowedElements: [...product.allowedElements],
          phases: [...product.phases],
        },
      ])
    ) as OxySideBlowConstraintConfig['products'],
    elementDistributions: config.elementDistributions.map((entry) => ({
      element: entry.element,
      rules: entry.rules.map((rule) => ({ ...rule })),
    })),
    customConstraints: config.customConstraints.map((entry) => ({ ...entry })),
    solverParams: config.solverParams ? { ...config.solverParams } : undefined,
  }
}

export function migrateOxyProductConstraintDefaults(
  config: OxySideBlowConstraintConfig,
  defaultConfig: OxySideBlowConstraintConfig
): OxySideBlowConstraintConfig {
  const next = cloneOxySideBlowConstraintConfig(config)
  if ((next.version ?? 0) >= defaultConfig.version) return next

  const defaults = cloneOxySideBlowConstraintConfig(defaultConfig)
  next.version = defaults.version
  next.products = defaults.products
  next.solverParams = next.solverParams
    ? { ...(defaults.solverParams ?? {}), ...next.solverParams }
    : defaults.solverParams

  const entriesByElement = new Map(next.elementDistributions.map((entry) => [entry.element, entry]))
  for (const defaultEntry of defaults.elementDistributions) {
    let entry = entriesByElement.get(defaultEntry.element)
    if (!entry) {
      entry = { element: defaultEntry.element, rules: [] }
      next.elementDistributions.push(entry)
      entriesByElement.set(entry.element, entry)
    }
    const productsWithRules = new Set(entry.rules.map((rule) => rule.product))
    for (const defaultRule of defaultEntry.rules) {
      if (productsWithRules.has(defaultRule.product)) continue
      entry.rules.push({ ...defaultRule })
      productsWithRules.add(defaultRule.product)
    }
  }

  next.customConstraints = [
    ...defaults.customConstraints.map((defaultConstraint) => ({ ...defaultConstraint })),
    ...next.customConstraints.slice(defaults.customConstraints.length),
  ]

  return next
}
function setAutoFillRule(
  config: OxySideBlowConstraintConfig,
  fill: ProductConstraintAutoFill
): boolean {
  const entry = config.elementDistributions.find((item) => item.element === fill.element)
  if (!entry) return false
  const rule = entry.rules.find((item) => item.product === fill.product && item.type === fill.type)
  if (!rule) return false
  if (!isBlankConstraintRuleValue(rule.value)) return false
  rule.value = fill.value
  return true
}

function collectAutoFillCandidates(config: OxySideBlowConstraintConfig): ProductConstraintAutoFill[] {
  const fills: ProductConstraintAutoFill[] = []
  const zeroPhaseKeys = new Set<string>()

  for (const entry of config.elementDistributions) {
    for (const rule of entry.rules) {
      if (rule.type !== 'D%') continue
      if (!productCanCarryConstraintElement(config, rule.product, entry.element)) continue
      if (isBlankConstraintRuleValue(rule.value)) continue
      const resolved = resolveConstraintRuleValue(rule.value, config.variables, `${entry.element} ${OXY_PRODUCT_KEY_TO_CN[rule.product]} ${rule.type}`)
      if (!resolved.valid) continue
      if (Math.abs(resolved.value) <= CONSTRAINT_PERCENT_TOLERANCE) {
        const phaseKey = singleCarrierPhaseKey(config, rule.product, entry.element)
        if (phaseKey) zeroPhaseKeys.add(`${rule.product}:${phaseKey}`)
      }
    }
  }

  for (const entry of config.elementDistributions) {
    const dRules = entry.rules.filter((rule) => rule.type === 'D%' && productCanCarryConstraintElement(config, rule.product, entry.element))
    const blankRules = dRules.filter((rule) => isBlankConstraintRuleValue(rule.value))
    if (blankRules.length === 0) continue

    for (const rule of blankRules) {
      const phaseKey = singleCarrierPhaseKey(config, rule.product, entry.element)
      if (phaseKey && zeroPhaseKeys.has(`${rule.product}:${phaseKey}`)) {
        fills.push({ product: rule.product, element: entry.element, type: 'D%', value: 0 })
      }
    }

    if (entry.rules.some((rule) => rule.type === 'W%')) continue

    if (blankRules.length !== 1) continue

    const numericRules = dRules
      .filter((rule) => !isBlankConstraintRuleValue(rule.value))
      .map((rule) => ({
        rule,
        resolved: resolveConstraintRuleValue(rule.value, config.variables, `${entry.element} ${OXY_PRODUCT_KEY_TO_CN[rule.product]} D%`),
      }))
      .filter((item) => item.resolved.valid)
    if (numericRules.length !== dRules.length - 1) continue
    if (numericRules.length === 0) continue
    const total = numericRules.reduce((sum, item) => sum + item.resolved.value, 0)
    if (total > 100 + CONSTRAINT_PERCENT_TOLERANCE) continue
    const blankRule = blankRules[0]!
    fills.push({
      product: blankRule.product,
      element: entry.element,
      type: 'D%',
      value: Math.max(0, 100 - total),
    })
  }

  return fills
}

export function autoFillOxyProductConstraintConfig(config: OxySideBlowConstraintConfig): ProductConstraintAutoFillResult {
  const next = cloneOxySideBlowConstraintConfig(config)
  const fills: ProductConstraintAutoFill[] = []
  for (let pass = 0; pass < 12; pass += 1) {
    const candidates = collectAutoFillCandidates(next)
    let changed = false
    for (const candidate of candidates) {
      if (fills.some((fill) => fill.product === candidate.product && fill.element === candidate.element && fill.type === candidate.type)) {
        continue
      }
      if (setAutoFillRule(next, candidate)) {
        fills.push(candidate)
        changed = true
      }
    }
    if (!changed) break
  }
  return { config: next, autoFills: fills }
}

export function validateOxyProductConstraintConfig(
  config: OxySideBlowConstraintConfig,
  options: ProductConstraintValidationOptions = {}
): ProductConstraintValidationResult {
  const errors: ProductConstraintValidationIssue[] = []
  const warnings: ProductConstraintValidationIssue[] = []
  const dTotalsByElement: Record<string, number> = {}
  const wTotalsByProduct: Partial<Record<OxySideBlowProductKey, number>> = {}
  const dRulesByElement: Record<string, ElementDistributionRule[]> = {}

  for (const entry of config.elementDistributions) {
    const seenProducts = new Set<string>()
    for (const rule of entry.rules) {
      const key = ruleKey(rule.product, entry.element, rule.type)
      const productName = OXY_PRODUCT_KEY_TO_CN[rule.product]
      const duplicateKey = `${rule.product}:${rule.type}`
      if (seenProducts.has(duplicateKey)) {
        errors.push({
          key: `${key}:duplicate`,
          message: `${entry.element} 在 ${productName} 存在重复 ${rule.type} 约束`,
          product: rule.product,
          element: entry.element,
          type: rule.type,
        })
      }
      seenProducts.add(duplicateKey)

      if (!productCanCarryConstraintElement(config, rule.product, entry.element)) {
        errors.push({
          key,
          message: `${productName} 不能承接 ${entry.element}，请取消该单元格约束或调整产物物相`,
          product: rule.product,
          element: entry.element,
          type: rule.type,
        })
        continue
      }

      if (isBlankConstraintRuleValue(rule.value)) {
        if (rule.type === 'D%') {
          ;(dRulesByElement[entry.element] ??= []).push(rule)
        }
        continue
      }

      const resolved = resolveConstraintRuleValue(rule.value, config.variables, `${entry.element} ${productName} ${rule.type}`)
      if (!resolved.valid) {
        errors.push({ key, message: resolved.error ?? '约束值无效', product: rule.product, element: entry.element, type: rule.type })
        continue
      }

      if (rule.type === 'D%') {
        dTotalsByElement[entry.element] = (dTotalsByElement[entry.element] ?? 0) + resolved.value
        ;(dRulesByElement[entry.element] ??= []).push(rule)
      } else {
        wTotalsByProduct[rule.product] = (wTotalsByProduct[rule.product] ?? 0) + resolved.value
      }
    }
  }

  for (const [element, total] of Object.entries(dTotalsByElement)) {
    if (total > 100 + CONSTRAINT_PERCENT_TOLERANCE) {
      errors.push({
        key: `D:${element}:total`,
        message: `${element} 的 D 合计为 ${formatPct(total)}%，不能超过 100%`,
        element,
        type: 'D%',
      })
    }
  }

  for (const productKey of OXY_SIDE_BLOW_PRODUCT_KEYS) {
    const total = wTotalsByProduct[productKey] ?? 0
    if (total > 100 + CONSTRAINT_PERCENT_TOLERANCE) {
      errors.push({
        key: `W:${productKey}:total`,
        message: `${OXY_PRODUCT_KEY_TO_CN[productKey]} 的 W 合计为 ${formatPct(total)}%，不能超过 100%`,
        product: productKey,
        type: 'W%',
      })
    } else if (total > CONSTRAINT_PERCENT_TOLERANCE && total < 100 - CONSTRAINT_PERCENT_TOLERANCE) {
      warnings.push({
        key: `W:${productKey}:total`,
        message: `${OXY_PRODUCT_KEY_TO_CN[productKey]} 的 W 合计为 ${formatPct(total)}%，尚未闭合到 100%`,
        product: productKey,
        type: 'W%',
      })
    }
  }

  const autoFills = options.allowBlankDAutoFill === false ? [] : collectAutoFillCandidates(config)

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    dTotalsByElement,
    wTotalsByProduct,
    autoFills,
  }
}

export function firstBlockingConstraintMessage(result: ProductConstraintValidationResult): string | null {
  return result.errors[0]?.message ?? null
}
