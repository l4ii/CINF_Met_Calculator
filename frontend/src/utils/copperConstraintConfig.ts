import rawConstraints from '../config/copperOxySideBlowConstraints.json' with { type: 'json' }
import { phaseFractionsFromFormula } from './chemicalFormula.ts'
import { COPPER_BUILTIN_PHASE_FRACTIONS } from './copperPhaseStoichiometry.ts'

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
  /** true 表示仅作为初值/复核参考，不进入严格方程组 */
  soft?: boolean
  /** 约束逻辑说明：解读、业务含义、求解器执行方式 */
  note?: string
}

export interface OxySideBlowProductDef {
  name: string
  /** 用户录入的显示提示；求解白名单以 phases 的化学组成推导为准 */
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

function phaseElementKeys(phaseKey: string): ConstraintElementKey[] {
  if (phaseKey === 'Other') return ['Other(其他)']
  const builtin = COPPER_BUILTIN_PHASE_FRACTIONS[phaseKey] ?? {}
  const fractions =
    Object.keys(builtin).length > 0
      ? builtin
      : phaseFractionsFromFormula(phaseKey)
  return Object.entries(fractions)
    .filter(([, fraction]) => Number.isFinite(fraction) && fraction > 0)
    .map(([key]) => key)
}

/** 产物有效元素白名单 = 该产物 phases 真正包含的元素/氧化物当量 */
export function resolveProductEffectiveAllowedElements(
  config: OxySideBlowConstraintConfig,
  productKey: OxySideBlowProductKey
): ConstraintElementKey[] {
  const phases = config.products[productKey].phases ?? []
  return [...new Set(phases.flatMap(phaseElementKeys))]
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
    newtonMaxIterations?: number
    /** 收敛/有效性阈值：maxRelativeResidual 低于该值即视为已收敛（valid 判定沿用此值，避免回归） */
    tolerance?: number
    /** 精炼阈值：牛顿迭代会继续把残差压到该值以下（若可行），用于进一步降低过定约束的残余偏差 */
    refineTolerance?: number
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
