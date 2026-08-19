import { resolveConstraintElementBinding } from './antimonyConstraintElementBridge.ts'
import {
  CONSTRAINT_PLACEHOLDER_ELEMENTS,
  OXY_PRODUCT_KEY_TO_CN,
  OXY_SIDE_BLOW_PRODUCT_KEYS,
  isOxyConvertingConstraintConfig,
  oxyProductDisplayName,
  resolveProductEffectiveAllowedElements,
  type ConstraintElementKey,
  type DistributionRuleType,
  type ElementDistributionRule,
  type OxyProductDisplayStage,
  type OxySideBlowConstraintConfig,
  type OxySideBlowProductKey,
} from './antimonyConstraintConfig.ts'
import { ANTIMONY_ELEMENT_KEYS, type AntimonyElementKey } from './antimonyWorkflowCalc.ts'

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
  /** 校验文案中的产物显示名；默认熔炼 */
  productDisplayStage?: OxyProductDisplayStage
}

function formatPct(value: number) {
  return Number(value.toFixed(6)).toString()
}

function expandAllowedPoolKeys(config: OxySideBlowConstraintConfig, productKey: OxySideBlowProductKey): Set<AntimonyElementKey> {
  const set = new Set<AntimonyElementKey>()
  for (const el of [
    ...resolveProductEffectiveAllowedElements(config, productKey),
    ...(config.products[productKey]?.allowedElements ?? []),
  ]) {
    if (CONSTRAINT_PLACEHOLDER_ELEMENTS.has(el)) continue
    const binding = resolveConstraintElementBinding(el)
    set.add(binding.poolKey)
    if ((ANTIMONY_ELEMENT_KEYS as readonly string[]).includes(el)) {
      set.add(el as AntimonyElementKey)
    }
  }
  return set
}

export function productCanCarryConstraintElement(
  _config: OxySideBlowConstraintConfig,
  _productKey: OxySideBlowProductKey,
  constraintElement: ConstraintElementKey
): boolean {
  if (CONSTRAINT_PLACEHOLDER_ELEMENTS.has(constraintElement)) return false
  return true
}

export function productHasConstraintElementCarrier(
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
  // 禁止熔炼默认模板与吹炼配置互迁（否则自定义约束产物名会串味）
  if (isOxyConvertingConstraintConfig(config) !== isOxyConvertingConstraintConfig(defaultConfig)) {
    return cloneOxySideBlowConstraintConfig(defaultConfig)
  }

  const next = cloneOxySideBlowConstraintConfig(config)
  if ((next.version ?? 0) >= defaultConfig.version) return next

  const defaults = cloneOxySideBlowConstraintConfig(defaultConfig)
  const previousVersion = next.version ?? 0
  next.version = defaults.version
  next.products = defaults.products
  next.method = defaults.method
  next.solverParams = next.solverParams
    ? { ...(defaults.solverParams ?? {}), ...next.solverParams }
    : defaults.solverParams

  const defaultElements = new Set(defaults.elementDistributions.map((entry) => entry.element))
  // v6+：按默认开闭收敛产物规则（去掉已关闭产物上的空白/旧规则，补齐新增默认）
  if (previousVersion < 6 && defaults.version >= 6) {
    next.elementDistributions = next.elementDistributions.filter((entry) => defaultElements.has(entry.element))
  }

  const entriesByElement = new Map(next.elementDistributions.map((entry) => [entry.element, entry]))
  for (const defaultEntry of defaults.elementDistributions) {
    let entry = entriesByElement.get(defaultEntry.element)
    if (!entry) {
      entry = { element: defaultEntry.element, rules: [] }
      next.elementDistributions.push(entry)
      entriesByElement.set(entry.element, entry)
    }
    const defaultProducts = new Set(defaultEntry.rules.map((rule) => rule.product))
    if (previousVersion < 6 && defaults.version >= 6) {
      entry.rules = entry.rules.filter((rule) => defaultProducts.has(rule.product))
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
  ]
  // 熔炼：保留默认表之后用户追加的自定义约束。吹炼升级时以默认表为准，
  // 避免 slice 拼接把旧版「渣游离 CaO」或重复供氧系数残条带回来。
  if (!isOxyConvertingConstraintConfig(defaults) && next.customConstraints.length < config.customConstraints.length) {
    next.customConstraints = [
      ...next.customConstraints,
      ...config.customConstraints.slice(defaults.customConstraints.length).map((entry) => ({ ...entry })),
    ]
  }

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

  for (const entry of config.elementDistributions) {
    const dRules = entry.rules.filter((rule) => rule.type === 'D%' && productCanCarryConstraintElement(config, rule.product, entry.element))
    const blankRules = dRules.filter((rule) => isBlankConstraintRuleValue(rule.value))
    if (blankRules.length === 0) continue

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
  const stage = options.productDisplayStage ?? 'smelting'
  const productName = (productKey: OxySideBlowProductKey) => oxyProductDisplayName(productKey, stage)

  for (const entry of config.elementDistributions) {
    const seenProducts = new Set<string>()
    for (const rule of entry.rules) {
      const key = ruleKey(rule.product, entry.element, rule.type)
      const displayProduct = productName(rule.product)
      const duplicateKey = `${rule.product}:${rule.type}`
      if (seenProducts.has(duplicateKey)) {
        errors.push({
          key: `${key}:duplicate`,
          message: `${entry.element} 在 ${displayProduct} 存在重复 ${rule.type} 约束`,
          product: rule.product,
          element: entry.element,
          type: rule.type,
        })
      }
      seenProducts.add(duplicateKey)

      if (CONSTRAINT_PLACEHOLDER_ELEMENTS.has(entry.element)) {
        warnings.push({
          key: `${key}:placeholder`,
          message: `${entry.element} 为占位元素，不参与产出求解；请清除该列约束`,
          product: rule.product,
          element: entry.element,
          type: rule.type,
        })
        continue
      }

      if (!productCanCarryConstraintElement(config, rule.product, entry.element)) {
        errors.push({
          key,
          message: `${displayProduct} 不能承接 ${entry.element}，请取消该单元格约束或调整产物物相`,
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

      const resolved = resolveConstraintRuleValue(rule.value, config.variables, `${entry.element} ${displayProduct} ${rule.type}`)
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
        message: `${productName(productKey)} 的 W 合计为 ${formatPct(total)}%，不能超过 100%`,
        product: productKey,
        type: 'W%',
      })
    }
    // W 未满 100% 不提示：由空白格留给求解分配，只有超过 100% 才是错误
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
