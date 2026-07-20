import rawConstraints from '../config/copperOxySideBlowConstraints.json' with { type: 'json' }
import { phaseFractionsFromFormula } from './chemicalFormula.ts'
import { COPPER_BUILTIN_PHASE_FRACTIONS } from './copperPhaseStoichiometry.ts'
import {
  migrateOxygenEnrichmentConstraints,
  migrateSecondaryAirOxygenSupplyConstraints,
  isOxygenEnrichmentExpr,
} from './copperProcessParameters.ts'

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
  /** 相对容差（如 0.005=千分之五）；缺省用 solverParams.constraintRelativeTolerance */
  relativeTolerance?: number
  /** 约束逻辑说明：解读、业务含义、求解器执行方式 */
  note?: string
  /**
   * UI 分类：气体类约束在表达式中可能混用 Nm³ 与 t/h，界面展示专用标签。
   * 缺省时由 inferCustomConstraintUiKind(expr) 推断。
   */
  uiKind?: 'gas' | 'input' | 'output' | 'process'
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
    wPercentIterations?: number
    newtonMaxIterations?: number
    tolerance?: number
    /** 产出约束相对容差，默认 0.005（千分之五） */
    constraintRelativeTolerance?: number
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

export type CustomConstraintUiKind = NonNullable<CustomConstraintEntry['uiKind']>

/** 推断自定义约束在界面上的分类（气体/投入/产出/工艺） */
export function inferCustomConstraintUiKind(expr: string): CustomConstraintUiKind {
  const normalized = expr.replace(/\s+/g, '')
  if (
    isOxygenEnrichmentExpr(expr) ||
    normalized.includes('Input.空气') ||
    normalized.includes('Input.氧气') ||
    normalized.includes('Input.二次风') ||
    normalized.includes('加料口漏风')
  ) {
    return 'gas'
  }
  if (normalized.startsWith('Input.')) return 'input'
  if (normalized.startsWith('Output.') || normalized.startsWith('OutputE.')) return 'output'
  return 'process'
}

export function customConstraintUiKindLabel(kind: CustomConstraintUiKind): string {
  switch (kind) {
    case 'gas':
      return '气体'
    case 'input':
      return '投入'
    case 'output':
      return '产出'
    case 'process':
      return '工艺'
    default:
      return '约束'
  }
}

export function customConstraintUiKindHint(expr: string, kind: CustomConstraintUiKind): string | undefined {
  if (kind !== 'gas') return undefined
  if (isOxygenEnrichmentExpr(expr)) {
    return '气体约束：O₂ 质量按 kg（t/h×1000），空气/氧气总量按 Nm³；目标为湿基 O₂ 体积分数。'
  }
  if (expr.replace(/\s+/g, '').includes('加料口漏风/4500')) {
    return '气体约束：加料口漏风按 Nm³/h 表达，质量由 4500 Nm³/h≈5.73 t/h 折算。'
  }
  if (expr.includes('二次风')) {
    return '气体约束：二次风质量 t/h，表达式中 O₂ 相质量参与供氧系数核算。'
  }
  if (expr.includes('出炉烟气') && expr.includes('O2')) {
    return '气体约束：烟气残氧率为 O₂ 质量比，分母为入炉各股气体 O₂ 质量之和。'
  }
  return '气体约束：注意表达式中质量(t/h)与体积(Nm³)口径。'
}

export function loadOxySideBlowConstraints(): OxySideBlowConstraintConfig {
  return migrateOxygenEnrichmentConstraints(
    migrateSecondaryAirOxygenSupplyConstraints(rawConstraints as OxySideBlowConstraintConfig)
  )
}
