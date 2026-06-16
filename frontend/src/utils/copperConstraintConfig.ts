import rawConstraints from '../config/copperOxySideBlowConstraints.json' with { type: 'json' }

export type OxySideBlowProductKey =
  | 'smeltingSlag'
  | 'matte'
  | 'flueGas'
  | 'dust'
  | 'fugitive'
  | 'loss'

export type DistributionRuleType = 'W%' | 'D%'

/** 元素分配规则：仅列出原软件中非「-」的格子；省略 = 无 W%/D% 约束。value=0 表示显式 0% 约束。 */
export interface ElementDistributionRule {
  product: OxySideBlowProductKey
  type: DistributionRuleType
  value: number | string
}

/** 约束表元素键：与 JSON 一致，可为化验键或单质键（如 S(硅)、Ca(钙)） */
export type ConstraintElementKey = string

export interface ElementDistributionEntry {
  element: ConstraintElementKey
  rules: ElementDistributionRule[]
}

export interface CustomConstraintEntry {
  expr: string
  target: number
  /** 约束逻辑说明：解读、业务含义、求解器执行方式 */
  note?: string
}

export interface OxySideBlowProductDef {
  name: string
  /** 产物基础白名单（用户输入）；有效白名单 = 此项 ∪ 该产物在 elementDistributions 中的 W%/D% 元素 */
  allowedElements: ConstraintElementKey[]
  phases: string[]
}

/** 占位元素键：白名单可列出但求解器跳过（无化验/入炉映射） */
export const CONSTRAINT_PLACEHOLDER_ELEMENTS = new Set<ConstraintElementKey>(['Na(钠)'])

/** 各产物在 W%/D% 约束中出现的元素 */
export function wdConstraintElementsByProduct(
  config: OxySideBlowConstraintConfig
): Record<OxySideBlowProductKey, Set<ConstraintElementKey>> {
  const map = {} as Record<OxySideBlowProductKey, Set<ConstraintElementKey>>
  for (const pk of OXY_SIDE_BLOW_PRODUCT_KEYS) {
    map[pk] = new Set()
  }
  for (const entry of config.elementDistributions) {
    for (const rule of entry.rules) {
      map[rule.product].add(entry.element)
    }
  }
  return map
}

/** 产物有效元素白名单 = 基础 allowedElements ∪ W%/D% 约束涉及元素 */
export function resolveProductEffectiveAllowedElements(
  config: OxySideBlowConstraintConfig,
  productKey: OxySideBlowProductKey
): ConstraintElementKey[] {
  const base = config.products[productKey].allowedElements ?? []
  const wd = wdConstraintElementsByProduct(config)[productKey]
  return [...new Set([...base, ...wd])]
}

export interface OxySideBlowConstraintConfig {
  version: number
  method: string
  _variableNotes?: Record<string, string>
  variables?: Record<string, number>
  products: Record<OxySideBlowProductKey, OxySideBlowProductDef>
  elementDistributions: ElementDistributionEntry[]
  customConstraints: CustomConstraintEntry[]
  solverParams?: {
    wPercentIterations?: number
    newtonMaxIterations?: number
    tolerance?: number
  }
}

/** 产物 key → 中文名（与约束表达式 Output.xxx 一致） */
export const OXY_PRODUCT_KEY_TO_CN: Record<OxySideBlowProductKey, string> = {
  smeltingSlag: '熔炼渣',
  matte: '白铜锍',
  flueGas: '熔炼出炉烟气',
  dust: '烟气含尘',
  fugitive: '无组织排放',
  loss: '损失',
}

export const OXY_PRODUCT_CN_TO_KEY: Record<string, OxySideBlowProductKey> = Object.fromEntries(
  Object.entries(OXY_PRODUCT_KEY_TO_CN).map(([key, name]) => [name, key as OxySideBlowProductKey])
) as Record<string, OxySideBlowProductKey>

export const OXY_SIDE_BLOW_PRODUCT_KEYS = Object.keys(OXY_PRODUCT_KEY_TO_CN) as OxySideBlowProductKey[]

export function loadOxySideBlowConstraints(): OxySideBlowConstraintConfig {
  return rawConstraints as OxySideBlowConstraintConfig
}
