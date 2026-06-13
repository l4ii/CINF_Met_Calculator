import rawConstraints from '../config/copperOxySideBlowConstraints.json' with { type: 'json' }
import type { CopperElementKey } from './copperWorkflowCalc.ts'

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
  phases: string[]
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
