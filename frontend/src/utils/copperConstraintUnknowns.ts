import { COPPER_BUILTIN_PHASE_FRACTIONS } from './copperPhaseStoichiometry.ts'
import { normalizeMetcalPhaseFormula, phaseFractionsFromFormula } from './chemicalFormula.ts'
import { atomicMass, COMPOUND_MOLAR_MASS } from './atomicMass.ts'
import {
  constraintFeedMetalMass,
  expandAssayDisplayMassForBalance,
  resolveConstraintElementBinding,
  singleCountOxideDisplayMass,
} from './copperConstraintElementBridge.ts'
import {
  OXY_PRODUCT_CN_TO_KEY,
  OXY_PRODUCT_KEY_TO_CN,
  OXY_SIDE_BLOW_PRODUCT_KEYS,
  isOxyConvertingConstraintConfig,
  productNamesForSolver,
  type ConstraintElementKey,
  type OxySideBlowConstraintConfig,
  type OxySideBlowProductKey,
} from './copperConstraintConfig.ts'
import type { ConstraintSymbolTable } from './copperConstraintExpression.ts'
import {
  autoFillOxyProductConstraintConfig,
  isBlankConstraintRuleValue,
  resolveConstraintRuleValue,
} from './copperConstraintValidation.ts'
import {
  calculateWeightedComposition,
  calculateKnownTotal,
  COPPER_ELEMENT_KEYS,
  emptyCopperRatios,
  materialWaterWeight,
  migrateLegacyCopperRatios,
  waterElementRatios,
  type CopperElementKey,
  type CopperMaterialColumn,
  type WeightedComposition,
} from './copperWorkflowCalc.ts'
import {
  DEFAULT_SECONDARY_AIR_OXYGEN_SUPPLY_TARGET,
  isOxygenEnrichmentExpr,
  OXYGEN_ENRICHMENT_EXPR,
  SECONDARY_AIR_OXYGEN_SUPPLY_EXPR,
  SLAG_FE_SIO2_EXPR,
} from './copperProcessParameters.ts'

export type InputMassUnknownName = '煤' | '空气' | '氧气' | '二次风' | '加料口漏风'

export const INPUT_MASS_UNKNOWN_NAMES: InputMassUnknownName[] = ['煤', '空气', '氧气', '二次风', '加料口漏风']
export const SOLVER_INPUT_MASS_UNKNOWN_NAMES: InputMassUnknownName[] = INPUT_MASS_UNKNOWN_NAMES.filter(
  (name) => name !== '煤'
)

export const FUEL_CONCENTRATE_RATIO_EXPR = 'Input.煤 / Input.混合铜精矿'
const FUEL_WET_BASIS_WATER_EXPR = 'Input.煤.H2O / Input.煤湿基'
const FEED_LEAK_AIR_EXPR = 'Input.加料口漏风 / 4500'
const LEGACY_FEED_LEAK_AIR_EXPR = 'Input.加料口漏风 / 5.73'
const PRIMARY_OXYGEN_ENRICHMENT_EXPR = OXYGEN_ENRICHMENT_EXPR
const FLUE_GAS_RESIDUAL_OXYGEN_EXPR =
  'Output.熔炼出炉烟气.O2 / (Input.空气.O2 + Input.氧气.O2 + Input.二次风.O2 + Input.加料口漏风.O2)'
/** 吹炼供氧系数：入氧 / (入氧 − 烟气 O₂)；残氧份额 = (λ−1)/λ */
const CONVERTING_OXYGEN_SUPPLY_EXPR =
  '(Input.空气.O2 + Input.氧气.O2 + Input.加料口漏风.O2) / ((Input.空气.O2 + Input.氧气.O2 + Input.加料口漏风.O2) - Output.吹炼出炉烟气.O2)'
const CONVERTING_DUST_CU2S_CU2O_EXPR = 'Output.吹炼烟气含尘.Cu2S / Output.吹炼烟气含尘.Cu2O'
/** 吹炼渣含铁相基准：来自原 MetCal 表 8 工况。 */
const CONVERTING_SLAG_FE3O4_SHARE = 0.055
const CONVERTING_SLAG_CALCIUM_FERRITE_SHARE = 0.265
const CONVERTING_SLAG_CALCIUM_SILICATE_SHARE = 0.0042
const CONVERTING_SLAG_OTHER_SHARE = 0.2058
const SLAG_FE3O4_FRACTION_EXPR = 'Output.熔炼渣.Fe3O4 / Output.熔炼渣'
const SLAG_CU2S_CU2O_EXPR = 'Output.熔炼渣.Cu2S / Output.熔炼渣.Cu2O'
const DEFAULT_FEED_LEAK_AIR_VOLUME_NM3H = 4500
// 4500 Nm³/h 对应 MetCal 湿气总质量约 5.73 t/h；求解器 weight 存干气质量，水分另计。
const DEFAULT_FEED_LEAK_AIR_MASS_TH = 5.63515
const FEED_LEAK_AIR_MASS_PER_NM3H = DEFAULT_FEED_LEAK_AIR_MASS_TH / DEFAULT_FEED_LEAK_AIR_VOLUME_NM3H
export const FUEL_WET_BASIS_WATER_TARGET = 0.02

function normalizedConstraintExpr(expr: string) {
  return expr.replace(/\s+/g, '')
}

/** 煤/精矿比目标（来自 customConstraints，直接派生燃料煤干基质量） */
export function resolveFuelConcentrateRatioTarget(config: OxySideBlowConstraintConfig): number {
  const entry = config.customConstraints.find((c) => c.expr === FUEL_CONCENTRATE_RATIO_EXPR)
  return typeof entry?.target === 'number' && entry.target > 0 ? entry.target : 0.013
}

export function resolveFuelWetBasisWaterTarget(config: OxySideBlowConstraintConfig): number {
  const entry = config.customConstraints.find((c) => c.expr === FUEL_WET_BASIS_WATER_EXPR)
  const target = typeof entry?.target === 'number' ? entry.target : FUEL_WET_BASIS_WATER_TARGET
  return Number.isFinite(target) ? Math.min(0.95, Math.max(0, target)) : FUEL_WET_BASIS_WATER_TARGET
}

function resolveCustomConstraintTarget(
  config: OxySideBlowConstraintConfig,
  expr: string,
  fallback: number
): number {
  const normalized = normalizedConstraintExpr(expr)
  const entry = config.customConstraints.find((c) => normalizedConstraintExpr(c.expr) === normalized)
  const target = typeof entry?.target === 'number' && Number.isFinite(entry.target) ? entry.target : fallback
  return Number.isFinite(target) ? target : fallback
}

function resolveSecondaryAirOxygenSupplyTarget(config: OxySideBlowConstraintConfig): number {
  return Math.max(
    0,
    resolveCustomConstraintTarget(config, SECONDARY_AIR_OXYGEN_SUPPLY_EXPR, DEFAULT_SECONDARY_AIR_OXYGEN_SUPPLY_TARGET)
  )
}

function resolvePrimaryOxygenEnrichmentTarget(config: OxySideBlowConstraintConfig): number {
  const entry = config.customConstraints.find((c) => isOxygenEnrichmentExpr(c.expr))
  const target =
    typeof entry?.target === 'number' && Number.isFinite(entry.target)
      ? entry.target
      : resolveCustomConstraintTarget(config, PRIMARY_OXYGEN_ENRICHMENT_EXPR, 0.85)
  return Math.min(0.999999, Math.max(0.000001, target))
}

function resolveFlueGasResidualOxygenTarget(config: OxySideBlowConstraintConfig): number {
  if (isOxyConvertingConstraintConfig(config)) {
    const lambda = resolveCustomConstraintTarget(config, CONVERTING_OXYGEN_SUPPLY_EXPR, 1.15)
    if (!(lambda > 1)) return 0.05
    return Math.min(0.95, Math.max(0, (lambda - 1) / lambda))
  }
  return Math.max(0, resolveCustomConstraintTarget(config, FLUE_GAS_RESIDUAL_OXYGEN_EXPR, 0.05))
}

export function resolveFeedLeakAirMassTarget(config: OxySideBlowConstraintConfig): number {
  const entry = config.customConstraints.find((c) => isFeedLeakAirVolumeConstraint(c.expr))
  const target = typeof entry?.target === 'number' && Number.isFinite(entry.target) ? entry.target : 1
  const baseVolume = entry ? feedLeakAirConstraintBaseVolume(entry.expr) : DEFAULT_FEED_LEAK_AIR_VOLUME_NM3H
  return feedLeakAirMassFromVolumeNm3h(baseVolume * target)
}

function isFeedLeakAirVolumeConstraint(expr: string): boolean {
  const normalized = normalizedConstraintExpr(expr)
  return (
    normalized === normalizedConstraintExpr(FEED_LEAK_AIR_EXPR) ||
    normalized === normalizedConstraintExpr(LEGACY_FEED_LEAK_AIR_EXPR) ||
    /^Input\.加料口漏风\/-?(?:\d+\.?\d*|\.\d+)$/.test(normalized)
  )
}

function feedLeakAirConstraintBaseVolume(expr: string): number {
  const normalized = normalizedConstraintExpr(expr)
  if (normalized === normalizedConstraintExpr(LEGACY_FEED_LEAK_AIR_EXPR)) return DEFAULT_FEED_LEAK_AIR_VOLUME_NM3H
  const match = normalized.match(/^Input\.加料口漏风\/(-?(?:\d+\.?\d*|\.\d+))$/)
  const value = match ? Number(match[1]) : DEFAULT_FEED_LEAK_AIR_VOLUME_NM3H
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_FEED_LEAK_AIR_VOLUME_NM3H
}

function feedLeakAirMassFromVolumeNm3h(volumeNm3h: number): number {
  return Math.max(0, volumeNm3h) * FEED_LEAK_AIR_MASS_PER_NM3H
}

function feedLeakAirVolumeFromMassTh(massTh: number): number {
  return Math.max(0, massTh) / FEED_LEAK_AIR_MASS_PER_NM3H
}

export function derivedFuelDryMass(baseInput: OxyConstraintBaseInput, config: OxySideBlowConstraintConfig): number {
  if (baseInput.preserveFuelInputWeight || baseInput.manualInputWeights?.fuel) {
    return Math.max(0, baseInput.fuelColumn.weight)
  }
  return Math.max(0, baseInput.concentrateMass) * resolveFuelConcentrateRatioTarget(config)
}

export function fuelWaterWeightFromDryMass(dryMass: number, config: OxySideBlowConstraintConfig): number {
  const wetBasisWater = resolveFuelWetBasisWaterTarget(config)
  if (wetBasisWater <= 0 || wetBasisWater >= 1) return 0
  return Math.max(0, dryMass) * (wetBasisWater / (1 - wetBasisWater))
}

export function fuelDryBasisMoisturePercent(config: OxySideBlowConstraintConfig): number {
  const wetBasisWater = resolveFuelWetBasisWaterTarget(config)
  if (wetBasisWater <= 0 || wetBasisWater >= 1) return 0
  return (wetBasisWater / (1 - wetBasisWater)) * 100
}

export function deriveConstrainedFuelColumn(
  baseInput: OxyConstraintBaseInput,
  config: OxySideBlowConstraintConfig
): CopperMaterialColumn {
  const dryMass = derivedFuelDryMass(baseInput, config)
  const waterWeight = fuelWaterWeightFromDryMass(dryMass, config)
  return {
    ...baseInput.fuelColumn,
    weight: dryMass,
    waterWeight,
    moisture: fuelDryBasisMoisturePercent(config),
  }
}

export type UnknownKind = 'product_mass' | 'output_phase' | 'output_element' | 'input_mass' | 'solvent_mass'

export interface UnknownSpec {
  id: string
  kind: UnknownKind
  productKey?: OxySideBlowProductKey
  phaseKey?: string
  elementKey?: CopperElementKey
  inputName?: InputMassUnknownName
  solventIndex?: number
}

type OutputElementConstraintSpec = {
  productKey: OxySideBlowProductKey
  constraintElement: ConstraintElementKey
  elementKey: CopperElementKey
  initialMass: number
}

export interface OxyConstraintBaseInput {
  blendFeed: WeightedComposition
  rawFeed?: WeightedComposition
  rawMaterialColumns?: CopperMaterialColumn[]
  concentrateMass: number
  /**
   * true：产出求解按 fuelColumn.weight 使用外部传入煤量。
   * 用于热平衡闭合：煤量由热收入/支出差反算，再联动产出约束复核。
   * false/undefined：兼容旧流程，按 customConstraints 中“煤/混合铜精矿”目标派生煤量。
   */
  preserveFuelInputWeight?: boolean
  /**
   * 用户显式填写的辅助物料量。未标记的列从 0 起算并由约束系统求解；
   * 标记列保持输入值，若其与工艺约束冲突则由残差明确报告，而不是被静默改写。
   */
  manualInputWeights?: {
    fuel?: boolean
    solvents?: Record<string, boolean>
    gases?: Record<string, boolean>
  }
  inputPhaseMass?: Record<string, Record<string, number>>
  fuelColumn: CopperMaterialColumn
  solventColumns: CopperMaterialColumn[]
  airColumns: CopperMaterialColumn[]
}

function isManualColumnWeight(
  flags: Record<string, boolean> | undefined,
  column: CopperMaterialColumn | undefined
): boolean {
  if (!column) return false
  return Boolean(flags?.[column.id] || flags?.[column.name])
}

function isManualSolventWeight(
  baseInput: OxyConstraintBaseInput,
  column: CopperMaterialColumn | undefined
): boolean {
  return isManualColumnWeight(baseInput.manualInputWeights?.solvents, column)
}

function isManualGasWeight(
  baseInput: OxyConstraintBaseInput,
  column: CopperMaterialColumn | undefined
): boolean {
  return isManualColumnWeight(baseInput.manualInputWeights?.gases, column)
}

export interface UnpackedUnknowns {
  productMasses: Record<OxySideBlowProductKey, number>
  outputPhases: Record<OxySideBlowProductKey, Record<string, number>>
  outputElementMasses: Record<OxySideBlowProductKey, Partial<Record<CopperElementKey, number>>>
  fuelMass: number
  solventMasses: number[]
  gasMass: Record<InputMassUnknownName, number>
  waterMass: number
  rawFeed: WeightedComposition
  rawBalanceFeed: WeightedComposition
  distributionFeed: WeightedComposition
  balanceFeed: WeightedComposition
  blendFeed: WeightedComposition
  fuelColumn: CopperMaterialColumn
  solventColumns: CopperMaterialColumn[]
  airColumns: CopperMaterialColumn[]
}

function combineWeightedCompositions(feeds: WeightedComposition[]): WeightedComposition {
  const totalWeight = feeds.reduce((sum, feed) => sum + Math.max(0, feed.totalWeight), 0)
  const elementWeights = emptyCopperRatios()
  for (const feed of feeds) {
    for (const element of COPPER_ELEMENT_KEYS) {
      elementWeights[element] += Math.max(0, feed.elementWeights[element] ?? 0)
    }
  }
  const ratios = emptyCopperRatios()
  for (const element of COPPER_ELEMENT_KEYS) {
    ratios[element] = totalWeight > 0 ? (elementWeights[element] / totalWeight) * 100 : 0
  }
  return { totalWeight, elementWeights, ratios }
}

function closeRatiosForBalance(ratios: Partial<Record<CopperElementKey, number>>): Record<CopperElementKey, number> {
  const migrated = migrateLegacyCopperRatios(ratios)
  const out = emptyCopperRatios()
  for (const element of COPPER_ELEMENT_KEYS) {
    const value = Number(migrated[element] ?? 0)
    out[element] = Number.isFinite(value) ? Math.max(0, value) : 0
  }
  const knownTotal = calculateKnownTotal(out)
  if (knownTotal > 100 + 1e-3) {
    const k = 100 / knownTotal
    for (const element of COPPER_ELEMENT_KEYS) {
      if (element === 'Other(其他)') continue
      out[element] *= k
    }
    out['Other(其他)'] = 0
  } else {
    out['Other(其他)'] = Math.max(0, 100 - knownTotal)
  }
  return out
}

function solverWaterWeight(column: CopperMaterialColumn): number {
  const dryWeight = Math.max(0, column.weight)
  if (column.kind === 'fuel') {
    const moisture = Math.max(0, column.moisture ?? 0)
    return dryWeight > 0 && moisture > 0 ? dryWeight * (moisture / 100) : 0
  }
  // 气体与固体共用 materialWaterWeight：气体已改为按 moisture%×干基，避免绝对 waterWeight 锁死
  return materialWaterWeight(column)
}

function columnBalanceElementMass(column: CopperMaterialColumn): Partial<Record<CopperElementKey, number>> {
  const dryWeight = Math.max(0, column.weight)
  const ratios = closeRatiosForBalance(column.ratios)
  const displayMass = Object.fromEntries(
    COPPER_ELEMENT_KEYS.map((el) => [el, (dryWeight * (ratios[el] ?? 0)) / 100])
  ) as Partial<Record<CopperElementKey, number>>
  const out = expandAssayDisplayMassForBalance(displayMass)
  const water = solverWaterWeight(column)
  if (water > 0) {
    const waterRatios = waterElementRatios()
    out['H(氢)'] = (out['H(氢)'] ?? 0) + ((waterRatios['H(氢)'] ?? 0) / 100) * water
    out['O(氧)'] = (out['O(氧)'] ?? 0) + ((waterRatios['O(氧)'] ?? 0) / 100) * water
  }
  return out
}

function calculateBalanceWeightedComposition(materials: CopperMaterialColumn[]): WeightedComposition {
  const totalWeight = materials.reduce(
    (sum, material) => sum + Math.max(0, material.weight) + solverWaterWeight(material),
    0
  )
  const elementWeights = emptyCopperRatios()
  for (const material of materials) {
    const masses = columnBalanceElementMass(material)
    for (const element of COPPER_ELEMENT_KEYS) {
      elementWeights[element] += Math.max(0, masses[element] ?? 0)
    }
  }
  const ratios = emptyCopperRatios()
  for (const element of COPPER_ELEMENT_KEYS) {
    ratios[element] = totalWeight > 0 ? (elementWeights[element] / totalWeight) * 100 : 0
  }
  return { totalWeight, elementWeights, ratios }
}

function outputBoundaryElementMass(column: CopperMaterialColumn): Partial<Record<CopperElementKey, number>> {
  return columnBalanceElementMass(column)
}

function calculateOutputBoundaryWeightedComposition(materials: CopperMaterialColumn[]): WeightedComposition {
  const totalWeight = materials.reduce(
    (sum, material) => sum + Math.max(0, material.weight) + solverWaterWeight(material),
    0
  )
  const elementWeights = emptyCopperRatios()
  for (const material of materials) {
    const masses = outputBoundaryElementMass(material)
    for (const element of COPPER_ELEMENT_KEYS) {
      elementWeights[element] += Math.max(0, masses[element] ?? 0)
    }
  }
  const ratios = emptyCopperRatios()
  for (const element of COPPER_ELEMENT_KEYS) {
    ratios[element] = totalWeight > 0 ? (elementWeights[element] / totalWeight) * 100 : 0
  }
  return { totalWeight, elementWeights, ratios }
}

function calculateSolverDisplayComposition(materials: CopperMaterialColumn[]): WeightedComposition {
  const totalWeight = materials.reduce(
    (sum, material) => sum + Math.max(0, material.weight) + solverWaterWeight(material),
    0
  )
  const elementWeights = emptyCopperRatios()
  if (totalWeight <= 0) return { totalWeight: 0, elementWeights, ratios: emptyCopperRatios() }
  const waterRatios = waterElementRatios()
  for (const material of materials) {
    const dryWeight = Math.max(0, material.weight)
    const ratios = closeRatiosForBalance(material.ratios)
    for (const element of COPPER_ELEMENT_KEYS) {
      elementWeights[element] += (ratios[element] / 100) * dryWeight
    }
    const water = solverWaterWeight(material)
    if (water > 0) {
      elementWeights['H(氢)'] += ((waterRatios['H(氢)'] ?? 0) / 100) * water
      elementWeights['O(氧)'] += ((waterRatios['O(氧)'] ?? 0) / 100) * water
    }
  }
  const ratios = emptyCopperRatios()
  for (const element of COPPER_ELEMENT_KEYS) {
    ratios[element] = (elementWeights[element] / totalWeight) * 100
  }
  return { totalWeight, elementWeights, ratios }
}

function calculateInputWaterMass(materials: CopperMaterialColumn[]): number {
  return materials.reduce((sum, material) => sum + solverWaterWeight(material), 0)
}

function balanceFeedFromDisplayFeed(feed: WeightedComposition): WeightedComposition {
  const elementWeights = {
    ...emptyCopperRatios(),
    ...expandAssayDisplayMassForBalance(feed.elementWeights),
  } as Record<CopperElementKey, number>
  const ratios = emptyCopperRatios()
  for (const element of COPPER_ELEMENT_KEYS) {
    ratios[element] = feed.totalWeight > 0 ? ((elementWeights[element] ?? 0) / feed.totalWeight) * 100 : 0
  }
  return { totalWeight: feed.totalWeight, elementWeights, ratios }
}

function resolveRawDisplayFeed(baseInput: OxyConstraintBaseInput): WeightedComposition {
  return baseInput.rawFeed ?? (baseInput.rawMaterialColumns?.length ? calculateWeightedComposition(baseInput.rawMaterialColumns) : baseInput.blendFeed)
}

function resolveRawBalanceFeed(baseInput: OxyConstraintBaseInput, rawDisplayFeed: WeightedComposition): WeightedComposition {
  if (baseInput.rawFeed) return balanceFeedFromDisplayFeed(rawDisplayFeed)
  return baseInput.rawMaterialColumns?.length ? calculateBalanceWeightedComposition(baseInput.rawMaterialColumns) : balanceFeedFromDisplayFeed(rawDisplayFeed)
}

function phaseFormulaFractions(phaseKey: string): Partial<Record<CopperElementKey, number>> {
  if (phaseKey === 'Other') return { 'Other(其他)': 1 }
  const normalizedKey = normalizeMetcalPhaseFormula(phaseKey) || phaseKey
  const builtin =
    (COPPER_BUILTIN_PHASE_FRACTIONS[normalizedKey] as Partial<Record<CopperElementKey, number>> | undefined) ??
    (COPPER_BUILTIN_PHASE_FRACTIONS[phaseKey] as Partial<Record<CopperElementKey, number>> | undefined)
  if (builtin && Object.keys(builtin).length > 0) return builtin
  return phaseFractionsFromFormula(normalizedKey) as Partial<Record<CopperElementKey, number>>
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

function phaseConstraintElementFraction(phaseKey: string, constraintElement: string): number {
  const binding = resolveConstraintElementBinding(constraintElement)
  const fractions = phaseFormulaFractions(phaseKey)
  const compoundFraction = fractions[binding.poolKey] ?? 0
  return compoundFraction * binding.poolMetalFraction
}

function productHasPhaseCarrier(
  config: OxySideBlowConstraintConfig,
  productKey: OxySideBlowProductKey,
  constraintElement: string
): boolean {
  return config.products[productKey].phases.some(
    (phaseKey) => phaseConstraintElementFraction(phaseKey, constraintElement) > 1e-12
  )
}

function isCopperElementKey(key: string): key is CopperElementKey {
  return (COPPER_ELEMENT_KEYS as readonly string[]).includes(key)
}

function constrainedOutputElementSpecs(
  config: OxySideBlowConstraintConfig,
  baseInput?: OxyConstraintBaseInput
): OutputElementConstraintSpec[] {
  const preparedConfig = autoFillOxyProductConstraintConfig(config).config
  const specs: OutputElementConstraintSpec[] = []
  const seen = new Set<string>()
  const rawFeed = baseInput ? resolveRawDisplayFeed(baseInput) : null
  const rawBalanceFeed = baseInput && rawFeed ? resolveRawBalanceFeed(baseInput, rawFeed) : null
  const fuelColumn = baseInput ? deriveConstrainedFuelColumn(baseInput, preparedConfig) : null
  const dynamicSolidBalanceFeed = fuelColumn
    ? calculateBalanceWeightedComposition([...baseInput!.solventColumns, fuelColumn])
    : null
  const distributionFeed =
    rawBalanceFeed && dynamicSolidBalanceFeed
      ? combineWeightedCompositions([rawBalanceFeed, dynamicSolidBalanceFeed])
      : null
  const productMassHint = Math.max(rawFeed?.totalWeight ?? baseInput?.concentrateMass ?? 1, 1) / OXY_SIDE_BLOW_PRODUCT_KEYS.length

  for (const entry of preparedConfig.elementDistributions) {
    const binding = resolveConstraintElementBinding(entry.element)
    if (!isCopperElementKey(binding.poolKey)) continue

    for (const rule of entry.rules) {
      if (isBlankConstraintRuleValue(rule.value)) continue
      if (productHasPhaseCarrier(preparedConfig, rule.product, entry.element)) continue

      const key = `${rule.product}:${binding.poolKey}`
      if (seen.has(key)) continue
      seen.add(key)
      const percent = resolveConfigNumber(
        rule.value,
        preparedConfig.variables,
        `${entry.element} ${OXY_PRODUCT_KEY_TO_CN[rule.product]} ${rule.type}`
      )
      const initialMass =
        rule.type === 'D%'
          ? (percent / 100) *
            (distributionFeed
              ? constraintFeedMetalMass(entry.element, distributionFeed)
              : 0)
          : (percent / 100) * productMassHint
      specs.push({
        productKey: rule.product,
        constraintElement: entry.element,
        elementKey: binding.poolKey,
        initialMass: Math.max(0, initialMass),
      })
    }
  }

  return specs
}

function singleCarrierPhase(
  config: OxySideBlowConstraintConfig,
  productKey: OxySideBlowProductKey,
  constraintElement: string
): { phaseKey: string; fraction: number } | null {
  const carriers = config.products[productKey].phases
    .map((phaseKey) => ({ phaseKey, fraction: phaseConstraintElementFraction(phaseKey, constraintElement) }))
    .filter((item) => item.fraction > 1e-12)
  return carriers.length === 1 ? carriers[0]! : null
}

function directlySolvedWPercentPhaseTargets(
  config: OxySideBlowConstraintConfig
): Partial<Record<OxySideBlowProductKey, Array<{ phaseKey: string; share: number }>>> {
  const targets: Partial<Record<OxySideBlowProductKey, Array<{ phaseKey: string; share: number }>>> = {}
  for (const entry of config.elementDistributions) {
    for (const rule of entry.rules) {
      if (rule.type !== 'W%') continue
      if (isBlankConstraintRuleValue(rule.value)) continue
      const carrier = singleCarrierPhase(config, rule.product, entry.element)
      if (!carrier) continue
      const percent = resolveConfigNumber(
        rule.value,
        config.variables,
        `${entry.element} ${OXY_PRODUCT_KEY_TO_CN[rule.product]} ${rule.type}`
      )
      const share = (percent / 100) / carrier.fraction
      if (!Number.isFinite(share) || share < 0 || share >= 1) continue
      ;(targets[rule.product] ??= []).push({ phaseKey: carrier.phaseKey, share })
    }
  }
  return targets
}

function directlySolvedWPercentPhaseIds(config: OxySideBlowConstraintConfig): Set<string> {
  const ids = new Set<string>()
  for (const id of directlyZeroProductPhaseIds(config)) ids.add(id)
  const targets = directlySolvedWPercentPhaseTargets(config)
  for (const [productKey, entries] of Object.entries(targets) as [
    OxySideBlowProductKey,
    Array<{ phaseKey: string; share: number }>,
  ][]) {
    for (const target of entries) ids.add(`${productKey}:${target.phaseKey}`)
  }
  return ids
}

/**
 * 单一载体物相的 D% 可直接由投入元素量换算，不应再作为数值求解未知量。
 * 同一物相同时受两条 D% 约束时保留给方程组处理，以免静默覆盖冲突约束。
 */
function directlySolvedDPercentPhaseIds(config: OxySideBlowConstraintConfig): Set<string> {
  const counts = new Map<string, number>()
  for (const entry of config.elementDistributions) {
    for (const rule of entry.rules) {
      if (rule.type !== 'D%' || isBlankConstraintRuleValue(rule.value)) continue
      const carrier = singleCarrierPhase(config, rule.product, entry.element)
      if (!carrier) continue
      const id = `${rule.product}:${carrier.phaseKey}`
      counts.set(id, (counts.get(id) ?? 0) + 1)
    }
  }
  return new Set([...counts].filter(([, count]) => count === 1).map(([id]) => id))
}

function productPhaseMass(phases: Record<string, number>): number {
  return Object.values(phases).reduce((sum, value) => sum + Math.max(0, value), 0)
}

function directlyZeroProductPhaseIds(config: OxySideBlowConstraintConfig): Set<string> {
  const ids = new Set<string>()
  for (const entry of config.customConstraints) {
    if (Math.abs(entry.target) > 1e-12) continue
    const match = entry.expr.trim().match(/^Output\.([^.]+)\.([A-Za-z0-9₂₃•]+)\s*\/\s*Output\.\1$/u)
    if (!match) continue
    const productKey = OXY_PRODUCT_CN_TO_KEY[match[1]!]
    const phaseKey = match[2]
    if (productKey && phaseKey && config.products[productKey].phases.includes(phaseKey)) {
      ids.add(`${productKey}:${phaseKey}`)
    }
  }
  return ids
}

export function applyDirectlySolvablePhaseConstraints(unpacked: UnpackedUnknowns, config: OxySideBlowConstraintConfig) {
  const directShareTargets: Partial<Record<OxySideBlowProductKey, Array<{ phaseKey: string; share: number }>>> = {}
  const directDPhaseIds = directlySolvedDPercentPhaseIds(config)

  for (const id of directlyZeroProductPhaseIds(config)) {
    const [productKey, phaseKey] = id.split(':') as [OxySideBlowProductKey, string]
    if (unpacked.outputPhases[productKey]) unpacked.outputPhases[productKey][phaseKey] = 0
  }

  for (const entry of config.elementDistributions) {
    for (const rule of entry.rules) {
      if (isBlankConstraintRuleValue(rule.value)) continue
      const carrier = singleCarrierPhase(config, rule.product, entry.element)
      if (!carrier) continue
      const percent = resolveConfigNumber(
        rule.value,
        config.variables,
        `${entry.element} ${OXY_PRODUCT_KEY_TO_CN[rule.product]} ${rule.type}`
      )
      const productPhases = unpacked.outputPhases[rule.product]
      if (!productPhases || !Number.isFinite(percent) || percent < 0) continue
      if (rule.type === 'D%' && percent === 0) {
        productPhases[carrier.phaseKey] = 0
        continue
      }
      if (rule.type === 'D%' && directDPhaseIds.has(`${rule.product}:${carrier.phaseKey}`)) {
        const feedMetal = constraintFeedMetalMass(entry.element, unpacked.distributionFeed)
        productPhases[carrier.phaseKey] = Math.max(0, ((percent / 100) * feedMetal) / carrier.fraction)
        continue
      }
      if (rule.type !== 'W%') continue

      const share = (percent / 100) / carrier.fraction
      if (!Number.isFinite(share) || share < 0 || share >= 1) continue
      ;(directShareTargets[rule.product] ??= []).push({
        phaseKey: carrier.phaseKey,
        share,
      })
    }
  }

  for (const [productKey, targets] of Object.entries(directShareTargets) as [
    OxySideBlowProductKey,
    Array<{ phaseKey: string; share: number }>,
  ][]) {
    const productPhases = unpacked.outputPhases[productKey]
    if (!productPhases) continue
    for (const target of targets) {
      const others = Object.entries(productPhases).reduce(
        (sum, [phaseKey, value]) => sum + (phaseKey === target.phaseKey ? 0 : Math.max(0, value)),
        0
      )
      productPhases[target.phaseKey] = others > 0 ? (target.share * others) / (1 - target.share) : 0
    }
  }
}

function deriveElementMassFromPhases(phases: Record<string, number>): Partial<Record<CopperElementKey, number>> {
  const out: Partial<Record<CopperElementKey, number>> = {}
  for (const [phaseKey, mass] of Object.entries(phases)) {
    if (mass <= 0) continue
    const rawFracs = phaseFormulaFractions(phaseKey)
    const fracs = singleCountOxideDisplayMass(rawFracs)
    for (const [el, frac] of Object.entries(fracs) as [CopperElementKey, number][]) {
      out[el] = (out[el] ?? 0) + mass * frac
    }
  }
  return out
}

/**
 * 产物总量由物相质量之和派生（不再作为牛顿自由未知量）。
 * 否则 product_mass 与 Σphases 脱节时会出现「损失」闭合残差≈100%、渣 w% 合计>100%。
 */
export function buildUnknownSpecs(config: OxySideBlowConstraintConfig, baseInput?: OxyConstraintBaseInput): UnknownSpec[] {
  const specs: UnknownSpec[] = []
  const directlySolvedWPhases = directlySolvedWPercentPhaseIds(config)
  const directlySolvedDPhases = directlySolvedDPercentPhaseIds(config)
  const directElementSpecs = constrainedOutputElementSpecs(config, baseInput)
  for (const productKey of OXY_SIDE_BLOW_PRODUCT_KEYS) {
    for (const phaseKey of config.products[productKey].phases) {
      const id = `${productKey}:${phaseKey}`
      if (directlySolvedWPhases.has(id) || directlySolvedDPhases.has(id)) continue
      specs.push({
        id: `out:${productKey}:${phaseKey}`,
        kind: 'output_phase',
        productKey,
        phaseKey,
      })
    }
  }
  for (const spec of directElementSpecs) {
    specs.push({
      id: `outE:${spec.productKey}:${spec.elementKey}`,
      kind: 'output_element',
      productKey: spec.productKey,
      elementKey: spec.elementKey,
    })
  }
  for (const [solventIndex, solvent] of (baseInput?.solventColumns ?? []).entries()) {
    if (baseInput && isManualSolventWeight(baseInput, solvent)) continue
    specs.push({
      id: `solvent:${solvent.id || solventIndex}:${solvent.name || solventIndex}`,
      kind: 'solvent_mass',
      solventIndex,
    })
  }
  for (const inputName of SOLVER_INPUT_MASS_UNKNOWN_NAMES) {
    const inputColumn = baseInput?.airColumns.find((column) => column.name === inputName)
    if (baseInput && isManualGasWeight(baseInput, inputColumn)) continue
    // 吹炼等无二次风列时不把二次风列为未知量，避免无约束自由度干扰收敛
    if (
      inputName === '二次风' &&
      baseInput &&
      !baseInput.airColumns.some((column) => column.name === '二次风' || column.airRole === 'secondary')
    ) {
      continue
    }
    specs.push({
      id: `in:${inputName}`,
      kind: 'input_mass',
      inputName,
    })
  }
  return specs
}

export function packUnknowns(unpacked: UnpackedUnknowns, specs: UnknownSpec[]): number[] {
  return specs.map((spec) => {
    if (spec.kind === 'product_mass' && spec.productKey) {
      return Math.max(0, unpacked.productMasses[spec.productKey] ?? 0)
    }
    if (spec.kind === 'output_phase' && spec.productKey && spec.phaseKey) {
      return Math.max(0, unpacked.outputPhases[spec.productKey]?.[spec.phaseKey] ?? 0)
    }
    if (spec.kind === 'output_element' && spec.productKey && spec.elementKey) {
      return Math.max(0, unpacked.outputElementMasses[spec.productKey]?.[spec.elementKey] ?? 0)
    }
    if (spec.kind === 'solvent_mass' && spec.solventIndex != null) {
      return Math.max(0, unpacked.solventColumns[spec.solventIndex]?.weight ?? 0)
    }
    if (spec.kind === 'input_mass' && spec.inputName) {
      if (spec.inputName === '煤') return Math.max(0, unpacked.fuelMass)
      return Math.max(0, unpacked.gasMass[spec.inputName] ?? 0)
    }
    return 0
  })
}

function findAirColumn(airColumns: CopperMaterialColumn[], name: string) {
  return airColumns.find((col) => col.name === name)
}

function phaseFraction(phaseKey: string, element: CopperElementKey): number {
  return (phaseFormulaFractions(phaseKey)[element] ?? 0) as number
}

/** 按化学计量等价查找物相键（CaO*Fe2O3 ≡ CaFe2O4） */
function resolveOutputPhaseKey(phases: Record<string, number>, identity: string): string | undefined {
  const want = normalizeMetcalPhaseFormula(identity) || identity
  for (const key of Object.keys(phases)) {
    if ((normalizeMetcalPhaseFormula(key) || key) === want) return key
  }
  return undefined
}

function phaseMassForElement(phases: Record<string, number>, phaseKey: string, element: CopperElementKey): number {
  const key = resolveOutputPhaseKey(phases, phaseKey)
  if (!key) return 0
  return Math.max(0, phases[key] ?? 0) * phaseFraction(phaseKey, element)
}

function productElementMassFromPhases(
  phases: Record<string, number>,
  element: CopperElementKey,
  excludedPhases: Set<string> = new Set()
): number {
  return Object.entries(phases).reduce((sum, [phaseKey, mass]) => {
    if (excludedPhases.has(phaseKey)) return sum
    return sum + Math.max(0, mass) * phaseFraction(phaseKey, element)
  }, 0)
}

function inputPhaseMass(baseInput: OxyConstraintBaseInput): Record<string, number> {
  return (
    baseInput.inputPhaseMass?.混合铜精矿 ??
    Object.values(baseInput.inputPhaseMass ?? {})[0] ??
    {}
  )
}

function columnElementFraction(column: CopperMaterialColumn | undefined, element: CopperElementKey): number {
  if (!column) return 0
  const unitColumn = { ...column, weight: 1, waterWeight: 0, moisture: 0 }
  return columnBalanceElementMass(unitColumn)[element] ?? 0
}

function gasPhaseMasses(column: CopperMaterialColumn): Record<string, number> {
  const dryWeight = Math.max(0, column.weight)
  const ratios = closeRatiosForBalance(column.ratios)
  return {
    O2: (dryWeight * Math.max(0, ratios['O(氧)'] ?? 0)) / 100,
    N2: (dryWeight * Math.max(0, ratios['N(氮)'] ?? 0)) / 100,
    H2O: solverWaterWeight(column),
  }
}

function gasMoleRatesPerDryTon(column: CopperMaterialColumn | undefined): { o2: number; total: number } {
  if (!column) return { o2: 0, total: 0 }
  const phases = gasPhaseMasses({ ...column, weight: 1 })
  const h2oMolarMass = 2 * atomicMass('H') + atomicMass('O')
  const o2 = phases.O2 / COMPOUND_MOLAR_MASS.O2
  const n2 = phases.N2 / COMPOUND_MOLAR_MASS.N2
  const h2o = phases.H2O / h2oMolarMass
  return { o2, total: o2 + n2 + h2o }
}

function oxygenGasMassForVolumeFraction(
  totalDryMass: number,
  processAir: CopperMaterialColumn | undefined,
  oxygen: CopperMaterialColumn | undefined,
  targetO2VolumeFraction: number
): number | null {
  const total = Math.max(0, totalDryMass)
  const target = Math.min(0.999999, Math.max(0.000001, targetO2VolumeFraction))
  const air = gasMoleRatesPerDryTon(processAir)
  const oxy = gasMoleRatesPerDryTon(oxygen)
  const denominator = target * (oxy.total - air.total) - (oxy.o2 - air.o2)
  if (total <= 0 || Math.abs(denominator) <= 1e-12) return null
  const oxygenMass = (total * (air.o2 - target * air.total)) / denominator
  return Math.min(total, Math.max(0, oxygenMass))
}

function adjustPrimaryAirOxygenMix(
  unpacked: UnpackedUnknowns,
  baseInput: OxyConstraintBaseInput,
  config: OxySideBlowConstraintConfig
) {
  const processAir = findAirColumn(unpacked.airColumns, '空气')
  const oxygen = findAirColumn(unpacked.airColumns, '氧气')
  const airLocked = isManualGasWeight(baseInput, processAir)
  const oxygenLocked = isManualGasWeight(baseInput, oxygen)
  if (airLocked && oxygenLocked) return

  const target = resolvePrimaryOxygenEnrichmentTarget(config)
  const airRates = gasMoleRatesPerDryTon(processAir)
  const oxygenRates = gasMoleRatesPerDryTon(oxygen)

  if (oxygenLocked) {
    const oxygenMass = Math.max(0, unpacked.gasMass['氧气'] ?? 0)
    const denominator = target * airRates.total - airRates.o2
    const numerator = oxygenMass * (oxygenRates.o2 - target * oxygenRates.total)
    if (Math.abs(denominator) > 1e-12) {
      unpacked.gasMass['空气'] = Math.max(0, numerator / denominator)
    }
    return
  }

  if (airLocked) {
    const airMass = Math.max(0, unpacked.gasMass['空气'] ?? 0)
    const denominator = oxygenRates.o2 - target * oxygenRates.total
    const numerator = airMass * (target * airRates.total - airRates.o2)
    if (Math.abs(denominator) > 1e-12) {
      unpacked.gasMass['氧气'] = Math.max(0, numerator / denominator)
    }
    return
  }

  const totalPrimaryOxygenGas = Math.max(0, unpacked.gasMass['空气'] ?? 0) + Math.max(0, unpacked.gasMass['氧气'] ?? 0)
  const oxygenMass = oxygenGasMassForVolumeFraction(
    totalPrimaryOxygenGas,
    processAir,
    oxygen,
    target
  )
  if (oxygenMass != null) {
    unpacked.gasMass['氧气'] = oxygenMass
    unpacked.gasMass['空气'] = totalPrimaryOxygenGas - oxygenMass
  }
}

function adjustSecondaryAirSupply(
  unpacked: UnpackedUnknowns,
  baseInput: OxyConstraintBaseInput,
  config: OxySideBlowConstraintConfig
) {
  const phases = inputPhaseMass(baseInput)
  const cuFeS2Sulfur = Math.max(0, phases.CuFeS2 ?? 0) * phaseFraction('CuFeS2', 'S (硫)')
  const feS2Sulfur = Math.max(0, phases.FeS2 ?? 0) * phaseFraction('FeS2', 'S (硫)')
  const fuelCarbon = Math.max(0, columnBalanceElementMass(unpacked.fuelColumn)['C (碳)'] ?? 0)
  // 硫需求与煤碳均按 ×0.7；煤碳用干基元素质量 / MetCal 固定碳原子量 12
  const oxygenMolesTarget =
    ((cuFeS2Sulfur / 4 + feS2Sulfur / 2) / atomicMass('S')) * 0.7 +
    (fuelCarbon / 12) * 0.7
  const secondaryAir = findAirColumn(unpacked.airColumns, '二次风')
  if (isManualGasWeight(baseInput, secondaryAir)) return
  const secondaryOxygenFraction = columnElementFraction(secondaryAir, 'O(氧)')
  if (oxygenMolesTarget > 0 && secondaryOxygenFraction > 0) {
    unpacked.gasMass['二次风'] =
      (oxygenMolesTarget * resolveSecondaryAirOxygenSupplyTarget(config) * COMPOUND_MOLAR_MASS.O2) /
      secondaryOxygenFraction
  }
}

/**
 * 按目标 O₂ 质量与富氧率，反推一次风（空气+氧气）干基总量并写入 unpacked.gasMass。
 * 仅在估算量高于当前一次风时抬升，避免压低热启动气量。
 */
function raisePrimaryOxygenGasToDeliver(
  unpacked: UnpackedUnknowns,
  baseInput: OxyConstraintBaseInput,
  config: OxySideBlowConstraintConfig,
  primaryOxygenNeeded: number,
  sulfurScale: number
) {
  if (!(primaryOxygenNeeded > 1e-9)) return

  const processAir = findAirColumn(unpacked.airColumns, '空气')
  const oxygenCol = findAirColumn(unpacked.airColumns, '氧气')
  if (isManualGasWeight(baseInput, processAir) || isManualGasWeight(baseInput, oxygenCol)) return
  const enrichment = resolvePrimaryOxygenEnrichmentTarget(config)
  let lo = Math.max(1, primaryOxygenNeeded)
  let hi = Math.max(lo * 2, sulfurScale * 8, 80)
  for (let iter = 0; iter < 48; iter += 1) {
    const mid = (lo + hi) / 2
    const oxyMass = oxygenGasMassForVolumeFraction(mid, processAir, oxygenCol, enrichment)
    if (oxyMass == null) break
    const airMass = mid - oxyMass
    const delivered =
      airMass * columnElementFraction(processAir, 'O(氧)') +
      oxyMass * columnElementFraction(oxygenCol, 'O(氧)')
    if (delivered < primaryOxygenNeeded) lo = mid
    else hi = mid
  }

  const totalPrimary = (lo + hi) / 2
  const currentPrimary =
    Math.max(0, unpacked.gasMass['空气'] ?? 0) + Math.max(0, unpacked.gasMass['氧气'] ?? 0)
  if (!(totalPrimary > currentPrimary + 1e-6)) return

  const oxyMass =
    oxygenGasMassForVolumeFraction(totalPrimary, processAir, oxygenCol, enrichment) ?? totalPrimary * 0.15
  unpacked.gasMass['氧气'] = Math.min(totalPrimary, Math.max(0, oxyMass))
  unpacked.gasMass['空气'] = Math.max(0, totalPrimary - unpacked.gasMass['氧气'])
}

/**
 * 吹炼一次风+氧气初值：按入炉硫氧化成 SO₂ 的耗氧，再乘供氧系数 λ，反推空气/氧气总量。
 * 从 0/1 t/h 起步时牛顿法容易停在「气量偏低 → 硫进不了 SO₂ → O/S 同时炸」的局部解（金标准一次风气量约 37 t/h）。
 */
function adjustConvertingPrimaryOxygenSupply(
  unpacked: UnpackedUnknowns,
  baseInput: OxyConstraintBaseInput,
  config: OxySideBlowConstraintConfig
) {
  if (!isOxyConvertingConstraintConfig(config)) return

  const sulfur = Math.max(0, unpacked.rawBalanceFeed.elementWeights['S (硫)'] ?? 0)
  if (sulfur <= 1e-9) return

  const iron = Math.max(0, unpacked.rawBalanceFeed.elementWeights['Fe(铁)'] ?? 0)
  const carbon = Math.max(
    0,
    (unpacked.rawBalanceFeed.elementWeights['C (碳)'] ?? 0) +
      unpacked.solventColumns.reduce(
        (sum, column) => sum + (columnBalanceElementMass(column)['C (碳)'] ?? 0),
        0
      )
  )
  // SO₂：S + O₂ → SO₂，氧质量 ≈ 2O/S × m_S
  const oxygenForSO2 = (sulfur * 2 * atomicMass('O')) / atomicMass('S')
  // 铁大致按 Fe₃O₄ 计；铜局部氧化与碳酸盐分解另留裕量
  const oxygenForFe = (iron * 4 * atomicMass('O')) / (3 * atomicMass('Fe'))
  const oxygenForC = (carbon * 2 * atomicMass('O')) / atomicMass('C')
  const oxygenForCuOxides = Math.max(0.4, sulfur * 0.05)
  const consumedOxygen = oxygenForSO2 + oxygenForFe + oxygenForC + oxygenForCuOxides

  const lambda = resolveCustomConstraintTarget(config, CONVERTING_OXYGEN_SUPPLY_EXPR, 1.15)
  const inletOxygenNeeded = consumedOxygen * Math.max(1.05, lambda)

  const leakCol = findAirColumn(unpacked.airColumns, '加料口漏风')
  const leakMass = Math.max(0, unpacked.gasMass['加料口漏风'] ?? 0)
  const leakOxygen = leakMass * columnElementFraction(leakCol, 'O(氧)')
  const primaryOxygenNeeded = Math.max(0, inletOxygenNeeded - leakOxygen)
  raisePrimaryOxygenGasToDeliver(unpacked, baseInput, config, primaryOxygenNeeded, sulfur)
}

/**
 * 熔炼一次风+氧气初值：按「进烟气 SO₂ 的硫 + 造渣铁氧化 + 燃碳」估耗氧，扣除二次风/漏风已供氧后抬升一次风。
 * 冷启动仅给 1 t/h 气量时，牛顿易停在「气量偏低 → SO₂/渣氧不足 → 元素守恒 O 与 S 同时炸」
 *（本仓库标准四矿投料约需一次风干基 ~60 t/h，而外轮迭代 4～5 次才爬到阈值边缘）。
 */
function adjustSmeltingPrimaryOxygenSupply(
  unpacked: UnpackedUnknowns,
  baseInput: OxyConstraintBaseInput,
  config: OxySideBlowConstraintConfig
) {
  if (isOxyConvertingConstraintConfig(config)) return

  const sulfur = Math.max(0, unpacked.rawBalanceFeed.elementWeights['S (硫)'] ?? 0)
  if (sulfur <= 1e-9) return

  const gmc = Math.max(1, config.variables?.GMC ?? 75)
  const copper = Math.max(0, unpacked.rawBalanceFeed.elementWeights['Cu(铜)'] ?? 0)
  const iron = Math.max(0, unpacked.rawBalanceFeed.elementWeights['Fe(铁)'] ?? 0)
  const matteMassHint = copper / (gmc / 100)
  const matteSulfur = matteMassHint * Math.max(0, -0.125 * (gmc / 100) + 0.292)
  const matteIron = matteMassHint * Math.max(0, -0.825 * (gmc / 100) + 0.633)
  // 渣/尘/损失约扣留少量硫；其余进烟气 SO₂
  const sulfurToSO2 = Math.max(0, sulfur - matteSulfur - sulfur * 0.02)
  const ironToSlag = Math.max(0, iron - matteIron)
  const carbon = Math.max(
    0,
    (unpacked.rawBalanceFeed.elementWeights['C (碳)'] ?? 0) +
      (columnBalanceElementMass(unpacked.fuelColumn)['C (碳)'] ?? 0)
  )

  const oxygenForSO2 = (sulfurToSO2 * 2 * atomicMass('O')) / atomicMass('S')
  // 造渣铁以 FeO 为主（Fe₃O₄ 另有 15% 约束，初值按 FeO 估）
  const oxygenForFe = (ironToSlag * atomicMass('O')) / atomicMass('Fe')
  const oxygenForC = (carbon * 2 * atomicMass('O')) / atomicMass('C')
  const consumedOxygen = oxygenForSO2 + oxygenForFe + oxygenForC

  const residualFrac = Math.min(0.5, Math.max(0, resolveFlueGasResidualOxygenTarget(config)))
  const inletOxygenNeeded = consumedOxygen / Math.max(0.5, 1 - residualFrac)

  const secondaryCol = findAirColumn(unpacked.airColumns, '二次风')
  const leakCol = findAirColumn(unpacked.airColumns, '加料口漏风')
  const secondaryOxygen =
    Math.max(0, unpacked.gasMass['二次风'] ?? 0) * columnElementFraction(secondaryCol, 'O(氧)')
  const leakOxygen =
    Math.max(0, unpacked.gasMass['加料口漏风'] ?? 0) * columnElementFraction(leakCol, 'O(氧)')
  const otherOxygen = secondaryOxygen + leakOxygen
  const primaryOxygenNeeded = Math.max(0, inletOxygenNeeded - otherOxygen)
  raisePrimaryOxygenGasToDeliver(unpacked, baseInput, config, primaryOxygenNeeded, sulfur)
}

function applyHardInputGasConstraints(
  unpacked: UnpackedUnknowns,
  baseInput: OxyConstraintBaseInput,
  config: OxySideBlowConstraintConfig
) {
  const leakAir = findAirColumn(unpacked.airColumns, '加料口漏风')
  if (!isManualGasWeight(baseInput, leakAir)) {
    unpacked.gasMass['加料口漏风'] = resolveFeedLeakAirMassTarget(config)
  }
  adjustSecondaryAirSupply(unpacked, baseInput, config)
  adjustPrimaryAirOxygenMix(unpacked, baseInput, config)
}

function applyHardInputMassConstraints(
  unpacked: UnpackedUnknowns,
  baseInput: OxyConstraintBaseInput,
  config: OxySideBlowConstraintConfig
) {
  const fuelColumn = deriveConstrainedFuelColumn(baseInput, config)
  unpacked.fuelMass = Math.max(0, fuelColumn.weight)
  unpacked.fuelColumn = fuelColumn
  applyHardInputGasConstraints(unpacked, baseInput, config)
}

function applyInitialInputMassGuess(
  unpacked: UnpackedUnknowns,
  baseInput: OxyConstraintBaseInput,
  config: OxySideBlowConstraintConfig
) {
  const leakAir = findAirColumn(unpacked.airColumns, '加料口漏风')
  if (!isManualGasWeight(baseInput, leakAir)) {
    unpacked.gasMass['加料口漏风'] = resolveFeedLeakAirMassTarget(config)
  }
  adjustSecondaryAirSupply(unpacked, baseInput, config)
  adjustConvertingPrimaryOxygenSupply(unpacked, baseInput, config)
  adjustSmeltingPrimaryOxygenSupply(unpacked, baseInput, config)
  adjustPrimaryAirOxygenMix(unpacked, baseInput, config)
}

function applyInitialSlagPhaseGuess(unpacked: UnpackedUnknowns) {
  const phases = unpacked.outputPhases.smeltingSlag
  const total = productPhaseMass(phases)
  if (total <= 0) return

  const cu2sCu = phaseFraction('Cu2S', 'Cu(铜)')
  const cu2oCu = phaseFraction('Cu2O', 'Cu(铜)')
  const cu2sSulfur = phaseFraction('Cu2S', 'S (硫)')
  const feSFe = phaseFraction('FeS', 'Fe(铁)')
  const feSSulfur = phaseFraction('FeS', 'S (硫)')
  const feOFe = phaseFraction('FeO', 'Fe(铁)')
  const fe3o4Fe = phaseFraction('Fe3O4', 'Fe(铁)')
  const slagCu2SCu2ORatio = 2
  const cu2oShare = 0.02 / (slagCu2SCu2ORatio * cu2sCu + cu2oCu)
  const cu2sShare = slagCu2SCu2ORatio * cu2oShare
  phases.Cu2O = total * cu2oShare
  phases.Cu2S = total * cu2sShare
  phases.FeS = Math.max(0, (0.006 * total - phases.Cu2S * cu2sSulfur) / feSSulfur)
  phases.Fe3O4 = total * 0.15

  const silicaEquivalent =
    phaseMassForElement(phases, 'CaSiO3', 'SiO₂(二氧化硅)') +
    phaseMassForElement(phases, 'MgSiO3', 'SiO₂(二氧化硅)') +
    phaseMassForElement(phases, '3Al2O3•2SiO2', 'SiO₂(二氧化硅)') +
    Math.max(0, phases.SiO2 ?? 0)
  const fixedIron = Math.max(0, phases.FeS ?? 0) * feSFe + Math.max(0, phases.Fe3O4 ?? 0) * fe3o4Fe
  phases.FeO = Math.max(0, (2 * silicaEquivalent - fixedIron) / feOFe)
}

/** 吹炼渣配置物相键（保留 CaO*SiO2 连写；无则回退 identity） */
function convertingSlagPhaseKey(phases: Record<string, number>, identity: string): string {
  return resolveOutputPhaseKey(phases, identity) ?? identity
}

/**
 * 吹炼渣 Si/Mg/Ca 分配到 CaO*SiO2 / MgO*SiO2 / CaO*Fe2O3（无游离 CaO/SiO2，对齐 MetCal 表8）。
 * Mg 优先进 MgO*SiO2；剩余 Si 进 CaO*SiO2；剩余 Ca 进铁酸钙。
 */
function assignConvertingSlagSilicateAndFerrite(
  phases: Record<string, number>,
  targetSio2: number,
  targetMgo: number,
  targetCao: number,
  preserveFerriteMass = false
) {
  const caSilicateKey = convertingSlagPhaseKey(phases, 'CaO*SiO2')
  const mgSilicateKey = convertingSlagPhaseKey(phases, 'MgO*SiO2')
  const ferriteKey = convertingSlagPhaseKey(phases, 'CaO*Fe2O3')

  const mgMgo = phaseFraction('MgO*SiO2', 'MgO(氧化镁)')
  const mgSio2 = phaseFraction('MgO*SiO2', 'SiO₂(二氧化硅)')
  const caSio2 = phaseFraction('CaO*SiO2', 'SiO₂(二氧化硅)')
  const caCao = phaseFraction('CaO*SiO2', 'CaO(氧化钙)')
  const feCao = phaseFraction('CaO*Fe2O3', 'CaO(氧化钙)')

  let mgSilicate = mgMgo > 0 ? Math.max(0, targetMgo) / mgMgo : 0
  let siUsedByMg = mgSilicate * mgSio2
  if (siUsedByMg > targetSio2 + 1e-12 && mgSio2 > 0) {
    mgSilicate = Math.max(0, targetSio2) / mgSio2
    siUsedByMg = mgSilicate * mgSio2
  }
  phases[mgSilicateKey] = Math.max(0, mgSilicate)

  const siRemain = Math.max(0, targetSio2 - siUsedByMg)
  let caSilicate = caSio2 > 0 ? siRemain / caSio2 : 0
  const caoForSilicate = caSilicate * caCao
  if (caoForSilicate > targetCao + 1e-12 && caCao > 0) {
    caSilicate = Math.max(0, targetCao) / caCao
  }
  phases[caSilicateKey] = Math.max(0, caSilicate)

  const caoRemain = Math.max(0, targetCao - phases[caSilicateKey]! * caCao)
  if (feCao > 0 && !preserveFerriteMass) {
    phases[ferriteKey] = caoRemain / feCao
  }

  const freeSio2 = resolveOutputPhaseKey(phases, 'SiO2')
  if (freeSio2) delete phases[freeSio2]
  const freeMgo = resolveOutputPhaseKey(phases, 'MgO')
  if (freeMgo) delete phases[freeMgo]
}

/** 吹炼渣初值：Cu 以 Cu2O 为主；Si/Mg/Ca 进 CaO*SiO2 / MgO*SiO2 / CaO*Fe2O3（无游离 CaO） */
function applyInitialConvertingSlagPhaseGuess(unpacked: UnpackedUnknowns) {
  const phases = unpacked.outputPhases.smeltingSlag
  const total = productPhaseMass(phases)
  if (total <= 0) return

  const cu2sCu = phaseFraction('Cu2S', 'Cu(铜)')
  const cu2oCu = phaseFraction('Cu2O', 'Cu(铜)')
  const cu2sSulfur = phaseFraction('Cu2S', 'S (硫)')
  const feSSulfur = phaseFraction('FeS', 'S (硫)')

  // 渣 Cu W%≈25 → 几乎全为 Cu2O（图4 Cu2O≈28%）
  const slagCuShare = 0.25
  const cu2sCu2oRatio = 0.01
  if (cu2oCu > 0) {
    const cu2oCopper = (slagCuShare * total) / (1 + cu2sCu2oRatio * (cu2sCu / cu2oCu))
    phases.Cu2O = Math.max(0, cu2oCopper / cu2oCu)
    phases.Cu2S = cu2sCu > 0 ? Math.max(0, (phases.Cu2O * cu2oCu * cu2sCu2oRatio) / cu2sCu) : 0
  }
  if (feSSulfur > 0 && phases.FeS !== undefined) {
    phases.FeS = Math.max(0, (0.0006 * total - Math.max(0, phases.Cu2S ?? 0) * cu2sSulfur) / feSSulfur)
  }
  phases.Fe3O4 = total * 0.055
  const freeCaoKey = resolveOutputPhaseKey(phases, 'CaO')
  if (freeCaoKey) {
    delete phases[freeCaoKey]
  }

  const feedFe = constraintFeedMetalMass('Fe(铁)', unpacked.distributionFeed)
  const slagFeHint = Math.max(feedFe * 0.9, total * 0.15)
  // 吹炼渣无游离 SiO2：用入炉 Si/Mg 给硅酸盐播种；Ca 预算按 CaO/Fe≈0.4，避免硅酸盐吃光钙后铁酸钙被压成 0
  const feedSio2 = unpacked.distributionFeed.elementWeights['SiO₂(二氧化硅)'] ?? 0
  const feedMgo = unpacked.distributionFeed.elementWeights['MgO(氧化镁)'] ?? 0
  const caoEqHint = slagFeHint * 0.4
  // 硅酸盐初值不超过渣量提示的一小部分，防止冷启动把渣总量撑爆导致无法收敛
  const sio2Seed = Math.min(feedSio2 * 0.995, Math.max(total * 0.15, caoEqHint * 0.5))
  const mgoSeed = Math.min(feedMgo, Math.max(total * 0.05, sio2Seed * 0.2))
  assignConvertingSlagSilicateAndFerrite(phases, sio2Seed, mgoSeed, caoEqHint)
}

function applyInitialMattePhaseGuess(unpacked: UnpackedUnknowns, config: OxySideBlowConstraintConfig) {
  const phases = unpacked.outputPhases.matte
  const gmc = Math.max(0, config.variables?.GMC ?? 75)
  const cu2sCu = phaseFraction('Cu2S', 'Cu(铜)')
  const cu2sSulfur = phaseFraction('Cu2S', 'S (硫)')
  const feSSulfur = phaseFraction('FeS', 'S (硫)')
  const feSFe = phaseFraction('FeS', 'Fe(铁)')
  const fe3o4Fe = phaseFraction('Fe3O4', 'Fe(铁)')
  if (cu2sCu <= 0 || feSSulfur <= 0 || fe3o4Fe <= 0) return

  const controlled = new Set(['Cu2S', 'FeS', 'Fe3O4'])
  const fixedMass = Object.entries(phases).reduce(
    (sum, [phaseKey, mass]) => sum + (controlled.has(phaseKey) ? 0 : Math.max(0, mass)),
    0
  )
  const fixedSulfur = productElementMassFromPhases(phases, 'S (硫)', controlled)
  const fixedIron = productElementMassFromPhases(phases, 'Fe(铁)', controlled)
  const currentTotal = productPhaseMass(phases)
  if (currentTotal <= 0 && fixedMass <= 0) return

  const cu2sShare = (gmc / 100) / cu2sCu
  const sulfurShare = Math.max(0, -0.125 * gmc / 100 + 0.292)
  const ironShare = Math.max(0, -0.825 * gmc / 100 + 0.633)
  const feSLinear = (sulfurShare - cu2sShare * cu2sSulfur) / feSSulfur
  const feSOffset = -fixedSulfur / feSSulfur
  const fe3o4Linear = (ironShare - feSLinear * feSFe) / fe3o4Fe
  const fe3o4Offset = -(fixedIron + feSOffset * feSFe) / fe3o4Fe
  const denom = 1 - cu2sShare - feSLinear - fe3o4Linear
  const solvedTotal =
    Math.abs(denom) > 1e-12 ? (fixedMass + feSOffset + fe3o4Offset) / denom : currentTotal
  const total = Number.isFinite(solvedTotal) && solvedTotal > 0 ? solvedTotal : currentTotal

  phases.Cu2S = Math.max(0, total * cu2sShare)
  phases.FeS = Math.max(0, total * feSLinear + feSOffset)
  phases.Fe3O4 = Math.max(0, total * fe3o4Linear + fe3o4Offset)
  const targetTotal = cu2sShare > 0 ? phases.Cu2S / cu2sShare : productPhaseMass(phases)
  const withoutOther = Object.entries(phases).reduce(
    (sum, [phaseKey, mass]) => sum + (phaseKey === 'Other' ? 0 : Math.max(0, mass)),
    0
  )
  phases.Other = Math.max(0, targetTotal - withoutOther)
}

/** 粗铜初值：金属 Cu 为主相，Cu2O/Cu2S 按 O/S 品位，不再套用白铜锍 Cu2S-GMC 模型 */
function applyInitialBlisterCopperPhaseGuess(unpacked: UnpackedUnknowns, config: OxySideBlowConstraintConfig) {
  const phases = unpacked.outputPhases.matte
  if (phases.Cu === undefined) {
    applyInitialMattePhaseGuess(unpacked, config)
    return
  }

  const gmc = Math.max(0, config.variables?.GMC ?? 98.75)
  const feedCu = constraintFeedMetalMass('Cu(铜)', unpacked.distributionFeed)
  const totalHint = Math.max(productPhaseMass(phases), feedCu > 0 ? feedCu / Math.max(0.5, gmc / 100) : 0)
  if (totalHint <= 1e-12) return

  const cu2oO = phaseFraction('Cu2O', 'O(氧)')
  const cu2oCu = phaseFraction('Cu2O', 'Cu(铜)')
  const cu2sS = phaseFraction('Cu2S', 'S (硫)')
  const cu2sCu = phaseFraction('Cu2S', 'Cu(铜)')
  const fe3o4Fe = phaseFraction('Fe3O4', 'Fe(铁)')

  // 粗铜 O W%≈0.3、S W%≈0.03、Fe W%≈0.04（默认元素分配）
  phases.Cu2O = cu2oO > 0 ? Math.max(0, (0.003 * totalHint) / cu2oO) : 0
  phases.Cu2S = cu2sS > 0 ? Math.max(0, (0.0003 * totalHint) / cu2sS) : 0
  phases.Fe3O4 = fe3o4Fe > 0 ? Math.max(0, (0.0004 * totalHint) / fe3o4Fe) : 0
  phases.FeS = 0

  const copperFromOxides =
    Math.max(0, phases.Cu2O) * cu2oCu + Math.max(0, phases.Cu2S) * cu2sCu
  phases.Cu = Math.max(0, totalHint * (gmc / 100) - copperFromOxides)

  const withoutOther = Object.entries(phases).reduce(
    (sum, [phaseKey, mass]) => sum + (phaseKey === 'Other' ? 0 : Math.max(0, mass)),
    0
  )
  if (phases.Other !== undefined) {
    phases.Other = Math.max(0, totalHint - withoutOther)
  }
}

function applyInitialDustPhaseGuess(unpacked: UnpackedUnknowns) {
  const phases = unpacked.outputPhases.dust
  const cuFeed = constraintFeedMetalMass('Cu(铜)', unpacked.distributionFeed)
  const sulfurFeed = constraintFeedMetalMass('S (硫)', unpacked.distributionFeed)
  const ironFeed = constraintFeedMetalMass('Fe(铁)', unpacked.distributionFeed)
  const cu2sCu = phaseFraction('Cu2S', 'Cu(铜)')
  const cu2oCu = phaseFraction('Cu2O', 'Cu(铜)')
  const cu2sSulfur = phaseFraction('Cu2S', 'S (硫)')
  const feSSulfur = phaseFraction('FeS', 'S (硫)')
  const feSFe = phaseFraction('FeS', 'Fe(铁)')
  const feOFe = phaseFraction('FeO', 'Fe(铁)')
  const fe3o4Fe = phaseFraction('Fe3O4', 'Fe(铁)')

  const cuTarget = cuFeed * 0.01
  const cu2o = cuTarget / (4 * cu2sCu + cu2oCu)
  phases.Cu2O = Math.max(0, cu2o)
  phases.Cu2S = Math.max(0, cu2o * 4)

  const sulfurTarget = sulfurFeed * 0.002
  const fixedSulfur = Math.max(0, phases.Cu2S ?? 0) * cu2sSulfur
  phases.FeS = Math.max(0, (sulfurTarget - fixedSulfur) / feSSulfur)

  const ironTarget = ironFeed * 0.0055
  phases.Fe3O4 = Math.max(0, (ironTarget * 0.12) / fe3o4Fe)
  const fixedIron = Math.max(0, phases.FeS ?? 0) * feSFe + Math.max(0, phases.Fe3O4 ?? 0) * fe3o4Fe
  phases.FeO = Math.max(0, (ironTarget - fixedIron) / feOFe)
}

/**
 * 含尘元素闭合：无物相载体的自由元素并入对应氧化物/单质相或 Other，
 * 消除 Σ元素 > Σ物相（典型：Se 有分配无 SeO2 相）。随后若仍有计量漂移，
 * 按比例缩放非 Other 物相使已知相 Σ元素 ≈ Σ质量。
 */
function applyHardDustPhaseElementClosure(unpacked: UnpackedUnknowns) {
  const phases = unpacked.outputPhases.dust
  if (!phases) return

  const freeElementPhaseHint: Partial<Record<CopperElementKey, string>> = {
    'Se(硒)': 'SeO2',
    'Te(碲)': 'Te',
    'Other(其他)': 'Other',
  }

  const free = unpacked.outputElementMasses.dust
  if (free) {
    for (const [elementKey, raw] of Object.entries(free) as [CopperElementKey, number][]) {
      const value = Math.max(0, raw ?? 0)
      if (value <= 1e-15) continue
      const hint =
        freeElementPhaseHint[elementKey] ??
        elementKey.replace(/\([^)]*\)/g, '').trim()
      const carrier = resolveOutputPhaseKey(phases, hint) ?? hint
      const metalFrac = phaseFraction(carrier, elementKey)
      const add = metalFrac > 1e-12 ? value / metalFrac : value
      phases[carrier] = Math.max(0, (phases[carrier] ?? 0) + add)
    }
    unpacked.outputElementMasses.dust = {}
  }

  const other = Math.max(0, phases.Other ?? 0)
  const knownPhases = Object.fromEntries(
    Object.entries(phases).filter(([key]) => key !== 'Other')
  ) as Record<string, number>
  const knownMass = productPhaseMass(knownPhases)
  if (knownMass <= 1e-12) return
  const knownElementSum = Object.values(deriveElementMassFromPhases(knownPhases)).reduce(
    (sum, value) => sum + Math.max(0, value ?? 0),
    0
  )
  if (knownElementSum <= 1e-12) return
  const scale = knownMass / knownElementSum
  if (!Number.isFinite(scale) || Math.abs(scale - 1) <= 1e-9) return
  for (const phaseKey of Object.keys(knownPhases)) {
    phases[phaseKey] = Math.max(0, (phases[phaseKey] ?? 0) * scale)
  }
  const scaledKnown = productPhaseMass(
    Object.fromEntries(Object.entries(phases).filter(([key]) => key !== 'Other'))
  )
  phases.Other = Math.max(0, knownMass + other - scaledKnown)
}

function applyInitialFlueGasPhaseGuess(unpacked: UnpackedUnknowns, config: OxySideBlowConstraintConfig) {
  const phases = unpacked.outputPhases.flueGas
  phases.SO3 = 0
  const h2oHydrogenFraction = phaseFraction('H2O', 'H(氢)')
  const h2oByHydrogen =
    h2oHydrogenFraction > 0 ? (unpacked.balanceFeed.elementWeights['H(氢)'] ?? 0) / h2oHydrogenFraction : 0
  phases.H2O = Math.max(0, h2oByHydrogen)
  const gasOxygen = unpacked.airColumns.reduce(
    (sum, column) => sum + (columnBalanceElementMass(column)['O(氧)'] ?? 0),
    0
  )
  phases.O2 = gasOxygen * resolveFlueGasResidualOxygenTarget(config)
  const n2Fraction = phaseFraction('N2', 'N(氮)')
  const co2Fraction = phaseFraction('CO2', 'C (碳)')
  if (n2Fraction > 0) phases.N2 = Math.max(phases.N2 ?? 0, (unpacked.balanceFeed.elementWeights['N(氮)'] ?? 0) / n2Fraction)
  if (co2Fraction > 0) phases.CO2 = Math.max(phases.CO2 ?? 0, (unpacked.balanceFeed.elementWeights['C (碳)'] ?? 0) / co2Fraction)
  // SO₂ 必须按「其他产物已占硫之后的剩余硫」估算；若按全硫进烟气，会与锍/渣/尘硫叠加，
  // 牛顿法常停在 ΣS 高出约 3%（本四矿案卷约 +1.7 t/h），同时抬高 O 守恒残差。
  applyHardFlueGasSulfurClosure(unpacked)
}

/**
 * 烟气 SO₂ 硬闭合：Σ(非烟气产物硫 + 烟气非 SO₂ 硫) 之后的剩余硫全部进 SO₂。
 * 与 MetCal 物料衡算一致：SO₂ 是熔炼烟气硫的汇，不应与锍/渣/尘硫重复占有入炉硫。
 */
function applyHardFlueGasSulfurClosure(unpacked: UnpackedUnknowns) {
  const fluePhases = unpacked.outputPhases.flueGas
  if (!fluePhases || fluePhases.SO2 === undefined) return
  const so2Fraction = phaseFraction('SO2', 'S (硫)')
  if (so2Fraction <= 1e-12) return

  const sulfurFeed = Math.max(0, unpacked.balanceFeed.elementWeights['S (硫)'] ?? 0)
  let sulfurElsewhere = 0
  for (const pk of OXY_SIDE_BLOW_PRODUCT_KEYS) {
    if (pk === 'flueGas') continue
    sulfurElsewhere += productElementMassFromPhases(unpacked.outputPhases[pk] ?? {}, 'S (硫)')
    sulfurElsewhere += Math.max(0, unpacked.outputElementMasses[pk]?.['S (硫)'] ?? 0)
  }
  const flueSulfurExcludingSO2 = productElementMassFromPhases(fluePhases, 'S (硫)', new Set(['SO2']))
  const sulfurToSO2 = Math.max(0, sulfurFeed - sulfurElsewhere - flueSulfurExcludingSO2)
  fluePhases.SO2 = sulfurToSO2 / so2Fraction
}

function applyInitialOutputPhaseGuess(unpacked: UnpackedUnknowns, config: OxySideBlowConstraintConfig) {
  if (isOxyConvertingConstraintConfig(config)) {
    applyInitialConvertingSlagPhaseGuess(unpacked)
    applyInitialBlisterCopperPhaseGuess(unpacked, config)
  } else {
    applyInitialSlagPhaseGuess(unpacked)
    applyInitialMattePhaseGuess(unpacked, config)
  }
  applyInitialDustPhaseGuess(unpacked)
  applyInitialFlueGasPhaseGuess(unpacked, config)
}

function applyHardSlagPhaseConstraints(unpacked: UnpackedUnknowns, config: OxySideBlowConstraintConfig) {
  const phases = unpacked.outputPhases.smeltingSlag
  const total = productPhaseMass(phases)
  if (total <= 1e-12) return

  const fe3o4Share = Math.min(
    0.95,
    Math.max(0, resolveCustomConstraintTarget(config, SLAG_FE3O4_FRACTION_EXPR, 0.15))
  )
  const feSiO2Target = Math.max(1e-6, resolveCustomConstraintTarget(config, SLAG_FE_SIO2_EXPR, 2))
  const cu2sCu2oTarget = Math.max(1e-6, resolveCustomConstraintTarget(config, SLAG_CU2S_CU2O_EXPR, 2))

  const cu2sCu = phaseFraction('Cu2S', 'Cu(铜)')
  const cu2oCu = phaseFraction('Cu2O', 'Cu(铜)')
  const feOFe = phaseFraction('FeO', 'Fe(铁)')
  const fe3o4Fe = phaseFraction('Fe3O4', 'Fe(铁)')
  const feSFe = phaseFraction('FeS', 'Fe(铁)')
  if (feOFe <= 0 || fe3o4Fe <= 0) return

  // Cu2S/Cu2O 质量比硬投影（保持渣铜总量近似不变）
  if (cu2sCu > 0 && cu2oCu > 0) {
    const copperTotal =
      Math.max(0, phases.Cu2S ?? 0) * cu2sCu + Math.max(0, phases.Cu2O ?? 0) * cu2oCu
    if (copperTotal > 1e-12) {
      const cu2oCopper = copperTotal / (cu2sCu2oTarget * (cu2sCu / cu2oCu) + 1)
      const cu2sCopper = copperTotal - cu2oCopper
      phases.Cu2O = cu2oCopper / cu2oCu
      phases.Cu2S = cu2sCopper / cu2sCu
    }
  }

  phases.Fe3O4 = total * fe3o4Share

  const silicaEquivalent =
    phaseMassForElement(phases, 'CaSiO3', 'SiO₂(二氧化硅)') +
    phaseMassForElement(phases, 'MgSiO3', 'SiO₂(二氧化硅)') +
    phaseMassForElement(phases, '3Al2O3•2SiO2', 'SiO₂(二氧化硅)') +
    Math.max(0, phases.SiO2 ?? 0)
  const fixedIron =
    Math.max(0, phases.FeS ?? 0) * feSFe + Math.max(0, phases.Fe3O4 ?? 0) * fe3o4Fe
  phases.FeO = Math.max(0, (feSiO2Target * silicaEquivalent - fixedIron) / feOFe)
}

/** 吹炼渣硬投影：剔除游离 CaO；仅对已有 Si/Mg/Ca 在硅酸盐与铁酸钙间重分配（不从入炉量硬灌，避免锁死牛顿自由度） */
function applyHardConvertingSlagPhaseConstraints(
  unpacked: UnpackedUnknowns,
  _config: OxySideBlowConstraintConfig
) {
  const phases = unpacked.outputPhases.smeltingSlag
  const fe3o4Key = resolveOutputPhaseKey(phases, 'Fe3O4')
  const ferriteKey = resolveOutputPhaseKey(phases, 'CaO*Fe2O3')
  const calciumSilicateKey = resolveOutputPhaseKey(phases, 'CaO*SiO2')
  const otherKey = resolveOutputPhaseKey(phases, 'Other')
  const applyReferencePhaseShares = () => {
    const targetShare =
      CONVERTING_SLAG_FE3O4_SHARE + CONVERTING_SLAG_CALCIUM_FERRITE_SHARE + CONVERTING_SLAG_OTHER_SHARE
      + CONVERTING_SLAG_CALCIUM_SILICATE_SHARE
    if (targetShare >= 1) return
    const totalWithoutReferencePhases = Math.max(
      0,
      productPhaseMass(phases) -
        Math.max(0, fe3o4Key ? phases[fe3o4Key] ?? 0 : 0) -
        Math.max(0, ferriteKey ? phases[ferriteKey] ?? 0 : 0) -
        Math.max(0, calciumSilicateKey ? phases[calciumSilicateKey] ?? 0 : 0) -
        Math.max(0, otherKey ? phases[otherKey] ?? 0 : 0)
    )
    const targetTotal = totalWithoutReferencePhases / (1 - targetShare)
    if (fe3o4Key) phases[fe3o4Key] = CONVERTING_SLAG_FE3O4_SHARE * targetTotal
    if (ferriteKey) phases[ferriteKey] = CONVERTING_SLAG_CALCIUM_FERRITE_SHARE * targetTotal
    if (calciumSilicateKey) phases[calciumSilicateKey] = CONVERTING_SLAG_CALCIUM_SILICATE_SHARE * targetTotal
    if (otherKey) phases[otherKey] = CONVERTING_SLAG_OTHER_SHARE * targetTotal
  }
  applyReferencePhaseShares()

  const freeCaoKey = resolveOutputPhaseKey(phases, 'CaO')
  if (freeCaoKey) {
    delete phases[freeCaoKey]
  }

  const phaseSio2 =
    phaseMassForElement(phases, 'CaO*SiO2', 'SiO₂(二氧化硅)') +
    phaseMassForElement(phases, 'MgO*SiO2', 'SiO₂(二氧化硅)') +
    Math.max(0, phases.SiO2 ?? 0)
  const phaseMgo =
    phaseMassForElement(phases, 'MgO*SiO2', 'MgO(氧化镁)') + Math.max(0, phases.MgO ?? 0)
  const phaseCao =
    phaseMassForElement(phases, 'CaO*SiO2', 'CaO(氧化钙)') +
    phaseMassForElement(phases, 'CaO*Fe2O3', 'CaO(氧化钙)')

  // 无已形成的硅酸盐/铁酸钙库存时不硬造，交给初值与牛顿自由调整
  if (phaseSio2 <= 1e-12 && phaseMgo <= 1e-12 && phaseCao <= 1e-12) return
  assignConvertingSlagSilicateAndFerrite(phases, phaseSio2, phaseMgo, phaseCao, true)
  applyReferencePhaseShares()
}

function withReclassifiedOther(
  feed: WeightedComposition,
  ironMass: number
): WeightedComposition {
  const transferable = Math.min(
    Math.max(0, ironMass),
    Math.max(0, feed.elementWeights['Other(其他)'] ?? 0)
  )
  if (transferable <= 1e-12) return feed

  const elementWeights = {
    ...feed.elementWeights,
    'Fe(铁)': Math.max(0, feed.elementWeights['Fe(铁)'] ?? 0) + transferable,
    'Other(其他)': Math.max(0, (feed.elementWeights['Other(其他)'] ?? 0) - transferable),
  }
  const ratios = emptyCopperRatios()
  for (const element of COPPER_ELEMENT_KEYS) {
    ratios[element] = feed.totalWeight > 0 ? ((elementWeights[element] ?? 0) / feed.totalWeight) * 100 : 0
  }
  return { totalWeight: feed.totalWeight, elementWeights, ratios }
}

/**
 * 吹炼白铜锍中的 Other 是未分析相的质量闭合项，不应被强制完整地留在最终 Other 相。
 * 原 MetCal 工况会用其中一部分补足造渣铁；仅以产物中超出已分析 Fe 的缺口转入 Fe，且绝不超过 Other 库存。
 */
function applyConvertingOtherIronReserve(unpacked: UnpackedUnknowns, config: OxySideBlowConstraintConfig) {
  if (!isOxyConvertingConstraintConfig(config)) return

  const dynamicSolid = calculateBalanceWeightedComposition([...unpacked.solventColumns, unpacked.fuelColumn])
  const explicitDistributionFeed = combineWeightedCompositions([unpacked.rawBalanceFeed, dynamicSolid])
  const gasBalanceFeed = calculateBalanceWeightedComposition(unpacked.airColumns)
  const explicitBalanceFeed = combineWeightedCompositions([explicitDistributionFeed, gasBalanceFeed])
  const outputIron = OXY_SIDE_BLOW_PRODUCT_KEYS.reduce(
    (sum, productKey) => sum + productElementMassFromPhases(unpacked.outputPhases[productKey] ?? {}, 'Fe(铁)'),
    0
  )
  const requiredReserve = Math.max(0, outputIron - (explicitBalanceFeed.elementWeights['Fe(铁)'] ?? 0))
  const reserve = Math.min(requiredReserve, explicitDistributionFeed.elementWeights['Other(其他)'] ?? 0)
  if (reserve <= 1e-12) return

  unpacked.distributionFeed = withReclassifiedOther(explicitDistributionFeed, reserve)
  unpacked.balanceFeed = withReclassifiedOther(explicitBalanceFeed, reserve)
}

function applyHardSilicaSolventForSlagFeSiO2(
  unpacked: UnpackedUnknowns,
  baseInput: OxyConstraintBaseInput,
  config: OxySideBlowConstraintConfig
) {
  if (isOxyConvertingConstraintConfig(config)) return

  const feSiO2Target = Math.max(1e-6, resolveCustomConstraintTarget(config, SLAG_FE_SIO2_EXPR, 2))
  const silicaSolventIndex = unpacked.solventColumns.findIndex((column) => column.name === '石英石')
  if (silicaSolventIndex < 0) return
  const silicaColumn = unpacked.solventColumns[silicaSolventIndex]!
  if (isManualSolventWeight(baseInput, silicaColumn)) return
  const silicaFraction = (closeRatiosForBalance(silicaColumn.ratios)['SiO₂(二氧化硅)'] ?? 0) / 100
  if (silicaFraction <= 1e-9) return

  const feedFe = unpacked.distributionFeed.elementWeights['Fe(铁)'] ?? 0
  const matteFe = productElementMassFromPhases(unpacked.outputPhases.matte, 'Fe(铁)')
  const dustFe = productElementMassFromPhases(unpacked.outputPhases.dust, 'Fe(铁)')
  const slagFeNeeded = Math.max(0, feedFe - matteFe - dustFe)
  if (slagFeNeeded <= 1e-9) return

  const silicaNeededInSlag = slagFeNeeded / feSiO2Target
  // 硅约 99.8% 进渣（元素分配 D%）；其余固体 SiO₂ 主要来自精矿+石英石
  const slagSiShare = 0.998
  const totalSilicaNeeded = silicaNeededInSlag / slagSiShare
  const currentQuartzSilica = Math.max(0, silicaColumn.weight) * silicaFraction
  const otherSilica = Math.max(
    0,
    (unpacked.distributionFeed.elementWeights['SiO₂(二氧化硅)'] ?? 0) - currentQuartzSilica
  )
  const quartzWeight = Math.max(0, (totalSilicaNeeded - otherSilica) / silicaFraction)
  unpacked.solventColumns[silicaSolventIndex] = { ...silicaColumn, weight: quartzWeight }
  unpacked.solventMasses[silicaSolventIndex] = quartzWeight
}

function applyHardConvertingDustPhaseConstraints(unpacked: UnpackedUnknowns, config: OxySideBlowConstraintConfig) {
  if (!isOxyConvertingConstraintConfig(config)) return
  const phases = unpacked.outputPhases.dust
  const cu2sKey = resolveOutputPhaseKey(phases, 'Cu2S')
  const cu2oKey = resolveOutputPhaseKey(phases, 'Cu2O')
  if (!cu2sKey || !cu2oKey) return
  const ratio = resolveCustomConstraintTarget(config, CONVERTING_DUST_CU2S_CU2O_EXPR, 0.1)
  if (ratio <= 1e-12) return
  phases[cu2oKey] = Math.max(0, phases[cu2sKey] ?? 0) / ratio
}

function applyHardOutputPhaseConstraints(unpacked: UnpackedUnknowns, config: OxySideBlowConstraintConfig) {
  const flueGas = unpacked.outputPhases.flueGas
  flueGas.SO3 = 0
  const h2oHydrogenFraction = phaseFraction('H2O', 'H(氢)')
  const h2oByHydrogen =
    h2oHydrogenFraction > 0 ? (unpacked.balanceFeed.elementWeights['H(氢)'] ?? 0) / h2oHydrogenFraction : 0
  flueGas.H2O = Math.max(0, h2oByHydrogen)
  const gasOxygen = unpacked.airColumns.reduce(
    (sum, column) => sum + (columnBalanceElementMass(column)['O(氧)'] ?? 0),
    0
  )
  flueGas.O2 = Math.max(0, gasOxygen * resolveFlueGasResidualOxygenTarget(config))
  const n2Fraction = phaseFraction('N2', 'N(氮)')
  if (n2Fraction > 0) {
    flueGas.N2 = Math.max(flueGas.N2 ?? 0, (unpacked.balanceFeed.elementWeights['N(氮)'] ?? 0) / n2Fraction)
  }

  if (isOxyConvertingConstraintConfig(config)) {
    applyHardConvertingSlagPhaseConstraints(unpacked, config)
  } else {
    applyHardSlagPhaseConstraints(unpacked, config)
  }
  // 渣/锍/尘/损失硫已定后，剩余硫闭合到烟气 SO₂（须在渣硬投影之后）
  applyHardFlueGasSulfurClosure(unpacked)
  // 含尘：无载体自由元素并入 Other，消除 Σ元素>Σ物相（如 Se）
  applyHardDustPhaseElementClosure(unpacked)
  applyHardConvertingDustPhaseConstraints(unpacked, config)
  // 烟尘 Pb/Zn 氧化物-硫化物比不再硬编码；若用户需要可在自定义约束中自行添加。
}

export function unpackUnknowns(
  x: number[],
  specs: UnknownSpec[],
  baseInput: OxyConstraintBaseInput,
  config?: OxySideBlowConstraintConfig
): UnpackedUnknowns {
  const productMasses = Object.fromEntries(
    OXY_SIDE_BLOW_PRODUCT_KEYS.map((pk) => [pk, 0])
  ) as Record<OxySideBlowProductKey, number>
  const outputPhases = Object.fromEntries(
    OXY_SIDE_BLOW_PRODUCT_KEYS.map((pk) => [pk, {} as Record<string, number>])
  ) as Record<OxySideBlowProductKey, Record<string, number>>
  const outputElementMasses = Object.fromEntries(
    OXY_SIDE_BLOW_PRODUCT_KEYS.map((pk) => [pk, {} as Partial<Record<CopperElementKey, number>>])
  ) as Record<OxySideBlowProductKey, Partial<Record<CopperElementKey, number>>>

  const constrainedFuelColumn = config ? deriveConstrainedFuelColumn(baseInput, config) : baseInput.fuelColumn
  let fuelMass = Math.max(0, constrainedFuelColumn.weight)
  const solventColumns = baseInput.solventColumns.map((col) => ({ ...col, weight: Math.max(0, col.weight) }))
  const gasMass = Object.fromEntries(
    SOLVER_INPUT_MASS_UNKNOWN_NAMES.map((name) => [
      name,
      Math.max(0, findAirColumn(baseInput.airColumns, name)?.weight ?? 0),
    ])
  ) as Record<InputMassUnknownName, number>

  specs.forEach((spec, index) => {
    const value = Math.max(0, x[index] ?? 0)
    if (spec.kind === 'output_phase' && spec.productKey && spec.phaseKey) {
      outputPhases[spec.productKey][spec.phaseKey] = value
    } else if (spec.kind === 'output_element' && spec.productKey && spec.elementKey) {
      outputElementMasses[spec.productKey][spec.elementKey] = value
    } else if (spec.kind === 'solvent_mass' && spec.solventIndex != null) {
      if (solventColumns[spec.solventIndex]) {
        solventColumns[spec.solventIndex] = { ...solventColumns[spec.solventIndex]!, weight: value }
      }
    } else if (spec.kind === 'input_mass' && spec.inputName) {
      if (spec.inputName === '煤' && !config) fuelMass = value
      else gasMass[spec.inputName] = value
    }
  })

  // 产物总量始终 = 物相质量和；无物相时回退为独立元素质量和
  for (const pk of OXY_SIDE_BLOW_PRODUCT_KEYS) {
    const phaseMass = productPhaseMass(outputPhases[pk] ?? {})
    if (phaseMass > 1e-12) {
      productMasses[pk] = phaseMass
      continue
    }
    const elementOnly = outputElementMasses[pk] ?? {}
    productMasses[pk] = Object.values(elementOnly).reduce((sum, value) => sum + Math.max(0, value), 0)
  }

  const fuelColumn = {
    ...constrainedFuelColumn,
    weight: fuelMass,
    waterWeight: config ? fuelWaterWeightFromDryMass(fuelMass, config) : constrainedFuelColumn.waterWeight,
    moisture: config ? fuelDryBasisMoisturePercent(config) : constrainedFuelColumn.moisture,
  }
  const airColumns = baseInput.airColumns.map((col) => {
    if (col.name === '空气') return { ...col, weight: gasMass['空气'] }
    if (col.name === '氧气') return { ...col, weight: gasMass['氧气'] }
    if (col.name === '二次风') return { ...col, weight: gasMass['二次风'] }
    if (col.name === '加料口漏风') return { ...col, weight: gasMass['加料口漏风'] }
    return col
  })
  const rawFeed = resolveRawDisplayFeed(baseInput)
  const rawBalanceFeed = resolveRawBalanceFeed(baseInput, rawFeed)
  const dynamicSolidFeed = calculateSolverDisplayComposition([...solventColumns, fuelColumn])
  const dynamicSolidBalanceFeed = calculateBalanceWeightedComposition([...solventColumns, fuelColumn])
  const dynamicSolidBoundaryFeed = calculateOutputBoundaryWeightedComposition([...solventColumns, fuelColumn])
  const blendFeed = combineWeightedCompositions([rawFeed, dynamicSolidFeed])
  const distributionFeed = combineWeightedCompositions([rawBalanceFeed, dynamicSolidBalanceFeed])
  const boundaryDistributionFeed = combineWeightedCompositions([rawBalanceFeed, dynamicSolidBoundaryFeed])
  const gasBalanceFeed = calculateBalanceWeightedComposition(airColumns)
  const balanceFeed = combineWeightedCompositions([boundaryDistributionFeed, gasBalanceFeed])
  const solventMasses = solventColumns.map((col) => Math.max(0, col.weight))
  const rawWaterMass = baseInput.rawMaterialColumns?.length
    ? calculateInputWaterMass(baseInput.rawMaterialColumns)
    : Math.max(0, rawFeed.totalWeight - Math.max(0, baseInput.concentrateMass))
  const waterMass = rawWaterMass + calculateInputWaterMass([...solventColumns, fuelColumn, ...airColumns])

  return {
    productMasses,
    outputPhases,
    outputElementMasses,
    fuelMass,
    solventMasses,
    gasMass,
    waterMass,
    rawFeed,
    rawBalanceFeed,
    distributionFeed,
    balanceFeed,
    blendFeed,
    fuelColumn,
    solventColumns,
    airColumns,
  }
}

export function unpackProjectedUnknowns(
  x: number[],
  specs: UnknownSpec[],
  baseInput: OxyConstraintBaseInput,
  config: OxySideBlowConstraintConfig,
  options: { enforceMassClosure?: boolean } = {}
): UnpackedUnknowns {
  const inputProjected = unpackUnknowns(x, specs, baseInput, config)
  applyHardInputMassConstraints(inputProjected, baseInput, config)
  applyHardSilicaSolventForSlagFeSiO2(inputProjected, baseInput, config)
  // 先写入投影后的气/熔剂，再 unpack，保证 airColumns / balanceFeed 与 gasMass 一致
  let unpacked = unpackUnknowns(packUnknowns(inputProjected, specs), specs, baseInput, config)
  // 最终再投影一次气量（富氧分裂/二次风/漏风），避免 pack/unpack 夹缝导致验收看到未投影比例
  applyHardInputGasConstraints(unpacked, baseInput, config)
  unpacked = unpackUnknowns(packUnknowns(unpacked, specs), specs, baseInput, config)
  applyDirectlySolvablePhaseConstraints(unpacked, config)
  applyHardOutputPhaseConstraints(unpacked, config)
  applyConvertingOtherIronReserve(unpacked, config)
  // D% Fe / Other 物相需按重新分类后的未分析物料库回填，再做一次物相投影。
  applyDirectlySolvablePhaseConstraints(unpacked, config)
  applyHardOutputPhaseConstraints(unpacked, config)
  applyConvertingOtherIronReserve(unpacked, config)
  if (options.enforceMassClosure) applyHardWetMassClosure(unpacked)
  // 硬投影后再同步总量，避免直接矫正物相后 productMass 滞后
  unpacked.productMasses = productMassesFromPhaseSums(unpacked.outputPhases)
  for (const pk of OXY_SIDE_BLOW_PRODUCT_KEYS) {
    if ((unpacked.productMasses[pk] ?? 0) > 1e-12) continue
    const elementOnly = unpacked.outputElementMasses[pk] ?? {}
    unpacked.productMasses[pk] = Object.values(elementOnly).reduce(
      (sum, value) => sum + Math.max(0, value),
      0
    )
  }
  return unpacked
}

function productMassesFromPhaseSums(
  outputPhases: Record<OxySideBlowProductKey, Record<string, number>>
): Record<OxySideBlowProductKey, number> {
  return Object.fromEntries(
    OXY_SIDE_BLOW_PRODUCT_KEYS.map((pk) => [pk, productPhaseMass(outputPhases[pk] ?? {})])
  ) as Record<OxySideBlowProductKey, number>
}

/**
 * 湿基总质量硬投影。
 *
 * 相质量已经由元素分配、物相比和工艺气约束确定后，数值迭代仍可能残留很小的
 * 总量误差。对六股产物做同一比例缩放可精确满足 Σ产物 = Σ湿基投入，同时保持
 * 各产物的 W%、各元素 D% 以及相间比例不变；其他硬约束仍由残差系统继续验收。
 */
function applyHardWetMassClosure(unpacked: UnpackedUnknowns) {
  const inputMass = Math.max(0, unpacked.balanceFeed.totalWeight)
  const outputMass = OXY_SIDE_BLOW_PRODUCT_KEYS.reduce(
    (sum, productKey) => sum + productPhaseMass(unpacked.outputPhases[productKey] ?? {}),
    0
  )
  if (!(inputMass > 0) || !(outputMass > 1e-12)) return

  const factor = inputMass / outputMass
  if (!Number.isFinite(factor) || factor <= 0 || Math.abs(factor - 1) <= 1e-14) return

  for (const productKey of OXY_SIDE_BLOW_PRODUCT_KEYS) {
    for (const phaseKey of Object.keys(unpacked.outputPhases[productKey] ?? {})) {
      unpacked.outputPhases[productKey][phaseKey] = Math.max(
        0,
        (unpacked.outputPhases[productKey][phaseKey] ?? 0) * factor
      )
    }
    for (const elementKey of Object.keys(unpacked.outputElementMasses[productKey] ?? {}) as CopperElementKey[]) {
      unpacked.outputElementMasses[productKey][elementKey] = Math.max(
        0,
        (unpacked.outputElementMasses[productKey][elementKey] ?? 0) * factor
      )
    }
  }
}

function mergeElementMasses(
  ...sources: Array<Partial<Record<CopperElementKey, number>> | undefined>
): Partial<Record<CopperElementKey, number>> {
  const out: Partial<Record<CopperElementKey, number>> = {}
  for (const source of sources) {
    if (!source) continue
    for (const [key, value] of Object.entries(source) as [CopperElementKey, number][]) {
      if (!Number.isFinite(value) || value <= 0) continue
      out[key] = (out[key] ?? 0) + value
    }
  }
  return out
}

export function buildProductsFromPhases(
  outputPhases: Record<OxySideBlowProductKey, Record<string, number>>,
  config: OxySideBlowConstraintConfig,
  productMasses?: Partial<Record<OxySideBlowProductKey, number>>,
  outputElementMasses?: Record<OxySideBlowProductKey, Partial<Record<CopperElementKey, number>>>
): Record<
  OxySideBlowProductKey,
  {
    mass: number
    phases: Record<string, number>
    elementMass: Partial<Record<CopperElementKey, number>>
    balanceElementMass: Partial<Record<CopperElementKey, number>>
  }
> {
  const products = {} as Record<
    OxySideBlowProductKey,
    {
      mass: number
      phases: Record<string, number>
      elementMass: Partial<Record<CopperElementKey, number>>
      balanceElementMass: Partial<Record<CopperElementKey, number>>
    }
  >
  for (const pk of OXY_SIDE_BLOW_PRODUCT_KEYS) {
    const phases: Record<string, number> = {}
    const source = outputPhases[pk] ?? {}
    for (const phaseKey of config.products[pk].phases) {
      const resolved = resolveOutputPhaseKey(source, phaseKey)
      phases[phaseKey] = Math.max(0, (resolved ? source[resolved] : undefined) ?? source[phaseKey] ?? 0)
    }
    const phaseMass = productPhaseMass(phases)
    const mass = Math.max(0, productMasses?.[pk] ?? phaseMass)
    const phaseElementMass = deriveElementMassFromPhases(phases)
    const elementMass = mergeElementMasses(phaseElementMass, outputElementMasses?.[pk])
    products[pk] = {
      mass,
      phases,
      elementMass,
      balanceElementMass: elementMass,
    }
  }
  return products
}

export function buildSymbolTableFromUnknowns(
  unpacked: UnpackedUnknowns,
  baseInput: OxyConstraintBaseInput,
  config: OxySideBlowConstraintConfig
): ConstraintSymbolTable {
  const products = buildProductsFromPhases(
    unpacked.outputPhases,
    config,
    unpacked.productMasses,
    unpacked.outputElementMasses
  )
  const fuelElementMass = columnBalanceElementMass(unpacked.fuelColumn)
  const solventMass = Object.fromEntries(
    unpacked.solventColumns.map((col) => [col.name, Math.max(0, col.weight)])
  )
  const solventElementMass = Object.fromEntries(
    unpacked.solventColumns.map((col) => [col.name, columnBalanceElementMass(col)])
  )
  const gasMass = Object.fromEntries(
    unpacked.airColumns.map((col) => [col.name, Math.max(0, col.weight)])
  )
  // 加料口漏风约束按 Nm³ 暴露；空气/氧气/二次风顶层仍为 t/h（富氧式由专用求值按物相摩尔分数计算）。
  const inputGasMass = {
    ...gasMass,
    加料口漏风: feedLeakAirVolumeFromMassTh(gasMass['加料口漏风'] ?? 0),
  }
  const gasElementMass = Object.fromEntries(
    unpacked.airColumns.map((col) => [col.name, columnBalanceElementMass(col)])
  )
  const gasPhaseMass = Object.fromEntries(
    unpacked.airColumns.map((col) => [col.name, gasPhaseMasses(col)])
  )

  const outputMass: Record<string, number> = {}
  const outputPhaseMass: Record<string, Record<string, number>> = {}
  const outputElementMass: Record<string, Partial<Record<CopperElementKey, number>>> = {}
  for (const pk of OXY_SIDE_BLOW_PRODUCT_KEYS) {
    const mass = products[pk].mass
    const phases = { ...products[pk].phases }
    const elements = { ...products[pk].balanceElementMass }
    const stage = isOxyConvertingConstraintConfig(config) ? 'converting' : 'smelting'
    for (const name of productNamesForSolver(pk, stage)) {
      outputMass[name] = mass
      outputPhaseMass[name] = phases
      outputElementMass[name] = elements
    }
  }

  const gmc = config.variables?.GMC ?? config.variables?.CMG
  const variables = {
    ...(config.variables ?? {}),
    ...(typeof gmc === 'number' && Number.isFinite(gmc) ? { GMC: gmc, CMG: gmc } : {}),
  }

  return {
    variables,
    inputMass: {
      混合铜精矿: baseInput.concentrateMass,
      原料: unpacked.rawFeed.totalWeight,
      混料: unpacked.blendFeed.totalWeight,
      总投入: unpacked.balanceFeed.totalWeight,
      含水: unpacked.waterMass,
      水: unpacked.waterMass,
      煤: unpacked.fuelMass,
      燃料煤: unpacked.fuelMass,
      煤湿基: unpacked.fuelMass + solverWaterWeight(unpacked.fuelColumn),
      ...solventMass,
      ...inputGasMass,
    },
    inputElementMass: {
      混合铜精矿: unpacked.rawBalanceFeed.elementWeights,
      原料: unpacked.rawBalanceFeed.elementWeights,
      混料: unpacked.distributionFeed.elementWeights,
      总投入: unpacked.balanceFeed.elementWeights,
      煤: fuelElementMass,
      燃料煤: fuelElementMass,
      ...solventElementMass,
      ...gasElementMass,
    },
    inputPhaseMass: {
      ...(baseInput.inputPhaseMass ?? {}),
      煤: {
        ...(baseInput.inputPhaseMass?.煤 ?? {}),
        H2O: solverWaterWeight(unpacked.fuelColumn),
      },
      燃料煤: {
        ...(baseInput.inputPhaseMass?.燃料煤 ?? {}),
        H2O: solverWaterWeight(unpacked.fuelColumn),
      },
      ...gasPhaseMass,
    },
    outputMass,
    outputPhaseMass,
    outputElementMass,
  }
}

/** 牛顿/复核用的产物初值（通常来自上次可接受解） */
export type OxySolverSeed = {
  outputPhases: Record<OxySideBlowProductKey, Record<string, number>>
  outputElementMasses?: Record<OxySideBlowProductKey, Partial<Record<CopperElementKey, number>>>
}

function cloneSeededOutputPhases(
  config: OxySideBlowConstraintConfig,
  seed: OxySolverSeed
): Record<OxySideBlowProductKey, Record<string, number>> {
  return Object.fromEntries(
    OXY_SIDE_BLOW_PRODUCT_KEYS.map((pk) => {
      const seeded = seed.outputPhases[pk] ?? {}
      const phases = Object.fromEntries(
        config.products[pk].phases.map((phaseKey) => [phaseKey, Math.max(0, seeded[phaseKey] ?? 0)])
      )
      return [pk, phases]
    })
  ) as Record<OxySideBlowProductKey, Record<string, number>>
}

export function createInitialUnpacked(
  baseInput: OxyConstraintBaseInput,
  config: OxySideBlowConstraintConfig,
  seed?: OxySolverSeed | null
): UnpackedUnknowns {
  const specs = buildUnknownSpecs(config, baseInput)
  const rawFeed = resolveRawDisplayFeed(baseInput)
  const blendMass = Math.max(rawFeed.totalWeight, baseInput.concentrateMass, 1)
  const directWTargets = directlySolvedWPercentPhaseTargets(config)
  const feedLeakAirMassTarget = resolveFeedLeakAirMassTarget(config)
  const hasPhaseSeed = Boolean(
    seed?.outputPhases &&
      OXY_SIDE_BLOW_PRODUCT_KEYS.some((pk) =>
        Object.values(seed.outputPhases[pk] ?? {}).some((mass) => mass > 1e-12)
      )
  )
  const outputPhases = hasPhaseSeed
    ? cloneSeededOutputPhases(config, seed!)
    : (Object.fromEntries(
        OXY_SIDE_BLOW_PRODUCT_KEYS.map((pk) => {
          const productMassHint = blendMass / OXY_SIDE_BLOW_PRODUCT_KEYS.length
          const targets = directWTargets[pk] ?? []
          const directPhaseKeys = new Set(targets.map((target) => target.phaseKey))
          const freePhaseKeys = config.products[pk].phases.filter((phaseKey) => !directPhaseKeys.has(phaseKey))
          const directShare = Math.min(
            0.98,
            targets.reduce((sum, target) => sum + Math.max(0, target.share), 0)
          )
          const freeMass = productMassHint * Math.max(0, 1 - directShare)
          const freePhaseMass = freePhaseKeys.length > 0 ? freeMass / freePhaseKeys.length : 0
          const phases = Object.fromEntries(
            config.products[pk].phases.map((phaseKey) => [
              phaseKey,
              freePhaseKeys.includes(phaseKey) ? freePhaseMass : 0,
            ])
          )
          for (const target of targets) {
            phases[target.phaseKey] = productMassHint * target.share
          }
          return [pk, phases]
        })
      ) as Record<OxySideBlowProductKey, Record<string, number>>)
  const outputElementMasses = Object.fromEntries(
    OXY_SIDE_BLOW_PRODUCT_KEYS.map((pk) => [pk, {} as Partial<Record<CopperElementKey, number>>])
  ) as Record<OxySideBlowProductKey, Partial<Record<CopperElementKey, number>>>
  for (const spec of constrainedOutputElementSpecs(config, baseInput)) {
    const seededMass = seed?.outputElementMasses?.[spec.productKey]?.[spec.elementKey]
    outputElementMasses[spec.productKey][spec.elementKey] =
      typeof seededMass === 'number' && Number.isFinite(seededMass) && seededMass >= 0
        ? seededMass
        : spec.initialMass
  }
  const productMasses = productMassesFromPhaseSums(outputPhases)

  const hasWarmGas = baseInput.airColumns.some((column) => column.weight > 1e-9)
  const gasMass = Object.fromEntries(
    SOLVER_INPUT_MASS_UNKNOWN_NAMES.map((name) => [
      name,
      Math.max(
        findAirColumn(baseInput.airColumns, name)?.weight ?? 0,
        name === '加料口漏风' ? feedLeakAirMassTarget : hasWarmGas || hasPhaseSeed ? 0 : 1
      ),
    ])
  ) as Record<InputMassUnknownName, number>
  const solventCount = Math.max(baseInput.solventColumns.length, 1)
  const hasWarmSolvent = baseInput.solventColumns.some((column) => column.weight > 1e-9)
  const solventColumns = baseInput.solventColumns.map((col) => ({
    ...col,
    weight: Math.max(
      0,
      col.weight,
      hasWarmSolvent || hasPhaseSeed ? 0 : baseInput.concentrateMass * 0.05 / solventCount
    ),
  }))

  const initial: UnpackedUnknowns = {
    productMasses,
    outputPhases,
    outputElementMasses,
    fuelMass: derivedFuelDryMass(baseInput, config),
    solventMasses: solventColumns.map((col) => Math.max(0, col.weight)),
    gasMass,
    waterMass: 0,
    rawFeed,
    rawBalanceFeed: resolveRawBalanceFeed(baseInput, rawFeed),
    distributionFeed: rawFeed,
    balanceFeed: rawFeed,
    blendFeed: rawFeed,
    fuelColumn: deriveConstrainedFuelColumn(baseInput, config),
    solventColumns,
    airColumns: baseInput.airColumns,
  }
  const projected = unpackProjectedUnknowns(packUnknowns(initial, specs), specs, baseInput, config)
  applyInitialInputMassGuess(projected, baseInput, config)
  const seededState = unpackUnknowns(packUnknowns(projected, specs), specs, baseInput, config)
  applyDirectlySolvablePhaseConstraints(seededState, config)
  if (!hasPhaseSeed) {
    applyInitialOutputPhaseGuess(seededState, config)
  }
  seededState.productMasses = productMassesFromPhaseSums(seededState.outputPhases)
  return seededState
}
