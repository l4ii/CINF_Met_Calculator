import rawConstraints from '../config/copperOxySideBlowConstraints.json' with { type: 'json' }
import rawConvertingConstraints from '../config/copperOxyConvertingConstraints.json' with { type: 'json' }
import { normalizeMetcalPhaseFormula, preferMetcalPhaseDisplayKey, phaseFractionsFromFormula } from './chemicalFormula.ts'
import { COPPER_BUILTIN_PHASE_FRACTIONS } from './copperPhaseStoichiometry.ts'
import {
  migrateOxygenEnrichmentConstraints,
  migrateSecondaryAirOxygenSupplyConstraints,
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

export type CustomConstraintEntry = {
  expr: string
  target: number
  /** true 表示仅作为初值/复核参考，不进入严格方程组 */
  soft?: boolean
  /** 相对容差（如 0.005=千分之五）；缺省用 solverParams.constraintRelativeTolerance */
  relativeTolerance?: number
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

/** 去掉占位元素（如 Na）的分配规则，避免导入残留后无法编辑/清除 */
export function stripPlaceholderElementDistributions(
  config: OxySideBlowConstraintConfig
): OxySideBlowConstraintConfig {
  const filtered = config.elementDistributions.filter(
    (entry) => !CONSTRAINT_PLACEHOLDER_ELEMENTS.has(entry.element)
  )
  if (filtered.length === config.elementDistributions.length) return config
  return { ...config, elementDistributions: filtered }
}

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
  const normalizedKey = normalizeMetcalPhaseFormula(phaseKey) || phaseKey
  const builtin = COPPER_BUILTIN_PHASE_FRACTIONS[normalizedKey] ?? COPPER_BUILTIN_PHASE_FRACTIONS[phaseKey] ?? {}
  const fractions =
    Object.keys(builtin).length > 0
      ? builtin
      : phaseFractionsFromFormula(normalizedKey)
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
    /** 进容差后继续打磨的残差地板，默认 1e-8；再低视为数值噪声 */
    polishFloor?: number
    /** 产出约束相对容差，默认 0.005（千分之五） */
    constraintRelativeTolerance?: number
  }
}

/** 产物 key → 中文名（与约束表达式 Output.xxx 一致；求解器符号表） */
export const OXY_PRODUCT_KEY_TO_CN: Record<OxySideBlowProductKey, string> = {
  smeltingSlag: '熔炼渣',
  matte: '白铜锍',
  flueGas: '熔炼出炉烟气',
  dust: '烟气含尘',
  fugitive: '无组织排放',
  loss: '损失',
}

/** 吹炼步骤产物名（UI 与吹炼自定义约束表达式） */
export const OXY_CONVERTING_PRODUCT_KEY_TO_CN: Record<OxySideBlowProductKey, string> = {
  smeltingSlag: '吹炼渣',
  matte: '粗铜',
  flueGas: '吹炼出炉烟气',
  dust: '吹炼烟气含尘',
  fugitive: '无组织排放',
  loss: '损失',
}

export type OxyProductDisplayStage = 'smelting' | 'converting'

/** 按工序取产物显示名 */
export function oxyProductDisplayName(
  productKey: OxySideBlowProductKey,
  stage: OxyProductDisplayStage = 'smelting'
): string {
  return stage === 'converting' ? OXY_CONVERTING_PRODUCT_KEY_TO_CN[productKey] : OXY_PRODUCT_KEY_TO_CN[productKey]
}

export const OXY_PRODUCT_CN_TO_KEY: Record<string, OxySideBlowProductKey> = Object.fromEntries(
  [
    ...Object.entries(OXY_PRODUCT_KEY_TO_CN),
    ...Object.entries(OXY_CONVERTING_PRODUCT_KEY_TO_CN),
  ].map(([key, name]) => [name, key as OxySideBlowProductKey])
) as Record<string, OxySideBlowProductKey>

export const OXY_SIDE_BLOW_PRODUCT_KEYS = Object.keys(OXY_PRODUCT_KEY_TO_CN) as OxySideBlowProductKey[]

/** 求解器符号表：按工序挂产物名，避免熔炼/吹炼自定义约束串味 */
export function productNamesForSolver(
  productKey: OxySideBlowProductKey,
  stage: OxyProductDisplayStage = 'smelting'
): string[] {
  if (stage === 'converting') {
    // 吹炼以吹炼名为准，并兼容旧式熔炼符号（Flo/旧案例）
    return productNameAliasesForSolver(productKey)
  }
  // 熔炼只用熔炼符号：熔炼出炉烟气、烟气含尘、熔炼渣、白铜锍
  return [OXY_PRODUCT_KEY_TO_CN[productKey]]
}

/** @deprecated 请用 productNamesForSolver(stage)；保留以免旧调用挂两边名字导致混淆 */
export function productNameAliasesForSolver(productKey: OxySideBlowProductKey): string[] {
  const smelting = OXY_PRODUCT_KEY_TO_CN[productKey]
  const converting = OXY_CONVERTING_PRODUCT_KEY_TO_CN[productKey]
  return smelting === converting ? [smelting] : [smelting, converting]
}


export function rewriteConstraintExprToConvertingProductNames(expr: string): string {
  let out = expr
  out = out.split('熔炼出炉烟气').join('吹炼出炉烟气')
  out = out.split('熔炼渣').join('吹炼渣')
  out = out.replace(/OutputE\.白铜锍/g, 'OutputE.粗铜')
  out = out.replace(/Output\.白铜锍/g, 'Output.粗铜')
  out = out.replace(/(?<!吹炼)烟气含尘/g, '吹炼烟气含尘')
  return out
}

export function rewriteConstraintExprToSmeltingProductNames(expr: string): string {
  let out = expr
  out = out.split('吹炼出炉烟气').join('熔炼出炉烟气')
  out = out.split('吹炼烟气含尘').join('烟气含尘')
  out = out.split('吹炼渣').join('熔炼渣')
  out = out.replace(/OutputE\.粗铜/g, 'OutputE.白铜锍')
  out = out.replace(/Output\.粗铜/g, 'Output.白铜锍')
  return out
}

export function normalizeConvertingCustomConstraintExprs(
  config: OxySideBlowConstraintConfig
): OxySideBlowConstraintConfig {
  let changed = false
  const customConstraints = config.customConstraints.map((entry) => {
    const expr = rewriteConstraintExprToConvertingProductNames(entry.expr)
    if (expr === entry.expr) return entry
    changed = true
    return { ...entry, expr }
  })
  if (!changed) return config
  return { ...config, customConstraints }
}

export function normalizeSmeltingCustomConstraintExprs(
  config: OxySideBlowConstraintConfig
): OxySideBlowConstraintConfig {
  let changed = false
  const customConstraints = config.customConstraints.map((entry) => {
    const expr = rewriteConstraintExprToSmeltingProductNames(entry.expr)
    if (expr === entry.expr) return entry
    changed = true
    return { ...entry, expr }
  })
  if (!changed) return config
  return { ...config, customConstraints }
}

/** 自定义约束中含冷却水 / 热平衡冷却水流量的条目（吹炼不展示） */
export function isCoolingWaterCustomConstraint(expr: string): boolean {
  const compact = expr.replace(/\s+/g, '')
  return /冷却水|CoolingWater|coolingWater/i.test(compact)
}

/**
 * 误导入的「吹炼渣游离 CaO/渣=2%」：正版 Excel 表8 渣无游离 CaO、氧化物 CaO≈7%，与目标 0.02 均不符。
 * 加载/导入时一律剔除，避免与 CaO/Fe 当量约束抢钙。
 */
export function isUnsupportedConvertingSlagFreeCaoConstraint(expr: string): boolean {
  const compact = expr.replace(/\s+/g, '')
  return /^Output\.(?:吹炼|熔炼)?渣\.CaO\/Output\.(?:吹炼|熔炼)?渣$/.test(compact)
}

export function stripUnsupportedConvertingCustomConstraints(
  config: OxySideBlowConstraintConfig
): OxySideBlowConstraintConfig {
  const seen = new Set<string>()
  const customConstraints = config.customConstraints.filter((entry) => {
    if (isCoolingWaterCustomConstraint(entry.expr)) return false
    if (isUnsupportedConvertingSlagFreeCaoConstraint(entry.expr)) return false
    const key = entry.expr.replace(/\s+/g, '')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  if (customConstraints.length === config.customConstraints.length) return config
  return { ...config, customConstraints }
}

export function loadOxySideBlowConstraints(): OxySideBlowConstraintConfig {
  return migrateOxygenEnrichmentConstraints(
    migrateSecondaryAirOxygenSupplyConstraints(rawConstraints as OxySideBlowConstraintConfig)
  )
}

/** 是否为吹炼（顶吹吹炼）约束配置 */
export function isOxyConvertingConstraintConfig(config: OxySideBlowConstraintConfig): boolean {
  return /converting/i.test(config.method ?? '')
}

/**
 * 对齐 MetCal 表8 吹炼渣物相：保留 CaO*Fe2O3 / CaO*SiO2 / MgO*SiO2 连写（与熔炼 Al2O3*SiO2 一样可直接参与计量）。
 * 不把显示键改写成 CaFe2O4 等紧凑式；化学计量在求解时经 normalizeMetcalPhaseFormula 解析。
 * 吹炼渣不保留游离 CaO（正版表8 无该相；钙由 CaO*Fe2O3 + OutputE CaO/Fe 约束承载）。
 */
export function ensureConvertingProductPhases(
  config: OxySideBlowConstraintConfig
): OxySideBlowConstraintConfig {
  const phaseIdentity = (phase: string) => normalizeMetcalPhaseFormula(phase) || phase
  const listHasPhase = (list: string[], phase: string) => {
    const want = phaseIdentity(phase)
    return list.some((item) => phaseIdentity(item) === want)
  }

  const normalizePhaseList = (phases: string[]) => {
    const next: string[] = []
    const seen = new Set<string>()
    let listChanged = false
    for (const phase of phases) {
      const display = preferMetcalPhaseDisplayKey(phase)
      if (display !== phase) listChanged = true
      const identity = phaseIdentity(display)
      if (seen.has(identity)) {
        listChanged = true
        continue
      }
      seen.add(identity)
      next.push(display)
    }
    return { phases: next, changed: listChanged }
  }

  const slagNorm = normalizePhaseList(config.products.smeltingSlag.phases ?? [])
  const matteNorm = normalizePhaseList(config.products.matte.phases ?? [])
  const dustNorm = normalizePhaseList(config.products.dust.phases ?? [])
  const flueNorm = normalizePhaseList(config.products.flueGas.phases ?? [])
  const fugitiveNorm = normalizePhaseList(config.products.fugitive.phases ?? [])
  const lossNorm = normalizePhaseList(config.products.loss.phases ?? [])
  let changed =
    slagNorm.changed ||
    matteNorm.changed ||
    dustNorm.changed ||
    flueNorm.changed ||
    fugitiveNorm.changed ||
    lossNorm.changed

  const insertAfter = (list: string[], phase: string, after: string | null) => {
    if (listHasPhase(list, phase)) return list
    changed = true
    if (after) {
      const afterId = phaseIdentity(after)
      const index = list.findIndex((item) => phaseIdentity(item) === afterId)
      if (index >= 0) {
        return [...list.slice(0, index + 1), phase, ...list.slice(index + 1)]
      }
    }
    return [...list, phase]
  }

  let nextSlag = slagNorm.phases
  if (listHasPhase(nextSlag, 'CaO')) {
    nextSlag = nextSlag.filter((phase) => phaseIdentity(phase) !== 'CaO')
    changed = true
  }
  nextSlag = insertAfter(nextSlag, 'CaO*Fe2O3', nextSlag.includes('Sb2O3') ? 'Sb2O3' : null)
  nextSlag = insertAfter(nextSlag, 'CaO*SiO2', 'CaO*Fe2O3')
  nextSlag = insertAfter(nextSlag, 'MgO*SiO2', 'CaO*SiO2')

  let nextMatte = matteNorm.phases
  if (listHasPhase(nextMatte, 'As2S3') && !listHasPhase(nextMatte, 'Cu3As')) {
    nextMatte = nextMatte.map((phase) => (phaseIdentity(phase) === 'As2S3' ? 'Cu3As' : phase))
    changed = true
  } else {
    nextMatte = insertAfter(nextMatte, 'Cu3As', nextMatte.includes('Zn') ? 'Zn' : null)
  }

  let nextDust = dustNorm.phases
  nextDust = insertAfter(nextDust, 'SeO2', nextDust.includes('Sb2O3') ? 'Sb2O3' : null)

  if (!changed) return config
  return {
    ...config,
    products: {
      ...config.products,
      smeltingSlag: { ...config.products.smeltingSlag, phases: nextSlag },
      matte: { ...config.products.matte, phases: nextMatte },
      dust: { ...config.products.dust, phases: nextDust },
      flueGas: { ...config.products.flueGas, phases: flueNorm.phases },
      fugitive: { ...config.products.fugitive, phases: fugitiveNorm.phases },
      loss: { ...config.products.loss, phases: lossNorm.phases },
    },
  }
}

/** 吹炼步骤默认约束（基于典型 Flo 顶吹吹炼炉设计约束；导入 Flo 时会被覆盖） */
export function loadOxyConvertingConstraints(): OxySideBlowConstraintConfig {
  const config = migrateOxygenEnrichmentConstraints(
    migrateSecondaryAirOxygenSupplyConstraints(rawConvertingConstraints as OxySideBlowConstraintConfig)
  )
  return ensureConvertingProductPhases(
    stripUnsupportedConvertingCustomConstraints(
      normalizeConvertingCustomConstraintExprs({
        ...config,
        customConstraints: config.customConstraints.filter((entry) => !isCoolingWaterCustomConstraint(entry.expr)),
      })
    )
  )
}
