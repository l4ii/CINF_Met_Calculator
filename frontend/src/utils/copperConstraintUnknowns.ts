import { COPPER_BUILTIN_PHASE_FRACTIONS } from './copperPhaseStoichiometry.ts'
import { phaseFractionsFromFormula } from './chemicalFormula.ts'
import { atomicMass } from './atomicMass.ts'
import {
  constraintFeedMetalMass,
  expandAssayDisplayMassForBalance,
  resolveConstraintElementBinding,
  singleCountOxideDisplayMass,
} from './copperConstraintElementBridge.ts'
import {
  OXY_PRODUCT_KEY_TO_CN,
  OXY_SIDE_BLOW_PRODUCT_KEYS,
  type OxySideBlowConstraintConfig,
  type OxySideBlowProductKey,
} from './copperConstraintConfig.ts'
import type { ConstraintSymbolTable } from './copperConstraintExpression.ts'
import { isBlankConstraintRuleValue, resolveConstraintRuleValue } from './copperConstraintValidation.ts'
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

export type InputMassUnknownName = '煤' | '空气' | '氧气' | '二次风' | '加料口漏风'

export const INPUT_MASS_UNKNOWN_NAMES: InputMassUnknownName[] = ['煤', '空气', '氧气', '二次风', '加料口漏风']
export const SOLVER_INPUT_MASS_UNKNOWN_NAMES: InputMassUnknownName[] = INPUT_MASS_UNKNOWN_NAMES.filter(
  (name) => name !== '煤'
)

const FUEL_CONCENTRATE_RATIO_EXPR = 'Input.煤 / Input.混合铜精矿'
const FUEL_WET_BASIS_WATER_EXPR = 'Input.煤.H2O / Input.煤湿基'
export const FUEL_WET_BASIS_WATER_TARGET = 0.02

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

export function derivedFuelDryMass(baseInput: OxyConstraintBaseInput, config: OxySideBlowConstraintConfig): number {
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

export type UnknownKind = 'product_mass' | 'output_phase' | 'input_mass' | 'solvent_mass'

export interface UnknownSpec {
  id: string
  kind: UnknownKind
  productKey?: OxySideBlowProductKey
  phaseKey?: string
  inputName?: InputMassUnknownName
  solventIndex?: number
}

export interface OxyConstraintBaseInput {
  blendFeed: WeightedComposition
  rawFeed?: WeightedComposition
  rawMaterialColumns?: CopperMaterialColumn[]
  concentrateMass: number
  inputPhaseMass?: Record<string, Record<string, number>>
  fuelColumn: CopperMaterialColumn
  solventColumns: CopperMaterialColumn[]
  airColumns: CopperMaterialColumn[]
}

export interface UnpackedUnknowns {
  productMasses: Record<OxySideBlowProductKey, number>
  outputPhases: Record<OxySideBlowProductKey, Record<string, number>>
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
  return materialWaterWeight(column)
}

function columnBalanceElementMass(column: CopperMaterialColumn): Partial<Record<CopperElementKey, number>> {
  const dryWeight = Math.max(0, column.weight)
  const ratios = closeRatiosForBalance(column.ratios)
  if (column.kind === 'fuel') {
    ratios['H(氢)'] = 0
  }
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
  const builtin = COPPER_BUILTIN_PHASE_FRACTIONS[phaseKey] as Partial<Record<CopperElementKey, number>> | undefined
  if (builtin && Object.keys(builtin).length > 0) return builtin
  return phaseFractionsFromFormula(phaseKey) as Partial<Record<CopperElementKey, number>>
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
  const targets = directlySolvedWPercentPhaseTargets(config)
  for (const [productKey, entries] of Object.entries(targets) as [
    OxySideBlowProductKey,
    Array<{ phaseKey: string; share: number }>,
  ][]) {
    for (const target of entries) ids.add(`${productKey}:${target.phaseKey}`)
  }
  return ids
}

function productPhaseMass(phases: Record<string, number>): number {
  return Object.values(phases).reduce((sum, value) => sum + Math.max(0, value), 0)
}

export function applyDirectlySolvablePhaseConstraints(unpacked: UnpackedUnknowns, config: OxySideBlowConstraintConfig) {
  const directShareTargets: Partial<Record<OxySideBlowProductKey, Array<{ phaseKey: string; share: number }>>> = {}

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

function deriveElementMassFromPhases(
  phases: Record<string, number>,
  options: { display: boolean }
): Partial<Record<CopperElementKey, number>> {
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

export function buildUnknownSpecs(config: OxySideBlowConstraintConfig, baseInput?: OxyConstraintBaseInput): UnknownSpec[] {
  const specs: UnknownSpec[] = []
  const directlySolvedWPhases = directlySolvedWPercentPhaseIds(config)
  for (const productKey of OXY_SIDE_BLOW_PRODUCT_KEYS) {
    specs.push({
      id: `product:${productKey}`,
      kind: 'product_mass',
      productKey,
    })
  }
  for (const productKey of OXY_SIDE_BLOW_PRODUCT_KEYS) {
    for (const phaseKey of config.products[productKey].phases) {
      if (directlySolvedWPhases.has(`${productKey}:${phaseKey}`)) continue
      specs.push({
        id: `out:${productKey}:${phaseKey}`,
        kind: 'output_phase',
        productKey,
        phaseKey,
      })
    }
  }
  for (const [solventIndex, solvent] of (baseInput?.solventColumns ?? []).entries()) {
    specs.push({
      id: `solvent:${solvent.id || solventIndex}:${solvent.name || solventIndex}`,
      kind: 'solvent_mass',
      solventIndex,
    })
  }
  for (const inputName of SOLVER_INPUT_MASS_UNKNOWN_NAMES) {
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

function phaseMassForElement(phases: Record<string, number>, phaseKey: string, element: CopperElementKey): number {
  return Math.max(0, phases[phaseKey] ?? 0) * phaseFraction(phaseKey, element)
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

function applyHardInputMassConstraints(
  unpacked: UnpackedUnknowns,
  baseInput: OxyConstraintBaseInput,
  config: OxySideBlowConstraintConfig
) {
  const fuelColumn = deriveConstrainedFuelColumn(baseInput, config)
  unpacked.fuelMass = Math.max(0, fuelColumn.weight)
  unpacked.fuelColumn = fuelColumn
}

function applyInitialInputMassGuess(
  unpacked: UnpackedUnknowns,
  baseInput: OxyConstraintBaseInput,
  config: OxySideBlowConstraintConfig
) {
  unpacked.gasMass['加料口漏风'] = 5.73

  const phases = inputPhaseMass(baseInput)
  const cuFeS2Sulfur = Math.max(0, phases.CuFeS2 ?? 0) * phaseFraction('CuFeS2', 'S (硫)')
  const feS2Sulfur = Math.max(0, phases.FeS2 ?? 0) * phaseFraction('FeS2', 'S (硫)')
  const fuelCarbon = unpacked.fuelMass * ((closeRatiosForBalance(baseInput.fuelColumn.ratios)['C (碳)'] ?? 0) / 100)
  const oxygenMolesTarget =
    (cuFeS2Sulfur / atomicMass('S') / 4) +
    (feS2Sulfur / atomicMass('S') / 2) * 0.7 +
    (fuelCarbon / atomicMass('C')) * 0.7
  const secondaryAir = findAirColumn(unpacked.airColumns, '二次风')
  const secondaryOxygenFraction = columnElementFraction(secondaryAir, 'O(氧)')
  if (oxygenMolesTarget > 0 && secondaryOxygenFraction > 0) {
    unpacked.gasMass['二次风'] = (oxygenMolesTarget * 1.02 * atomicMass('O')) / secondaryOxygenFraction
  }

  const processAir = findAirColumn(unpacked.airColumns, '空气')
  const oxygen = findAirColumn(unpacked.airColumns, '氧气')
  const airOxygenFraction = columnElementFraction(processAir, 'O(氧)')
  const oxygenOxygenFraction = columnElementFraction(oxygen, 'O(氧)')
  const targetOxygenFraction = 0.85 * atomicMass('O') / 22.4
  const totalPrimaryOxygenGas = Math.max(0, unpacked.gasMass['空气'] ?? 0) + Math.max(0, unpacked.gasMass['氧气'] ?? 0)
  if (totalPrimaryOxygenGas > 0 && oxygenOxygenFraction > airOxygenFraction) {
    const oxygenShare = Math.min(
      1,
      Math.max(0, (targetOxygenFraction - airOxygenFraction) / (oxygenOxygenFraction - airOxygenFraction))
    )
    unpacked.gasMass['氧气'] = totalPrimaryOxygenGas * oxygenShare
    unpacked.gasMass['空气'] = totalPrimaryOxygenGas - unpacked.gasMass['氧气']
  }
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

function dustDistributionPercent(
  config: OxySideBlowConstraintConfig,
  element: string,
  fallback: number
): number {
  const entry = config.elementDistributions.find((item) => item.element === element)
  const rule = entry?.rules.find((item) => item.product === 'dust' && item.type === 'D%')
  if (!rule || isBlankConstraintRuleValue(rule.value)) return fallback
  return resolveConfigNumber(
    rule.value,
    config.variables,
    `${element} 烟气含尘 D%`
  )
}

function applyInitialDustPhaseGuess(unpacked: UnpackedUnknowns, config: OxySideBlowConstraintConfig) {
  reconcileDustDirectPhases(unpacked, config)
}

/** 烟气含尘：按 D% 与 Cu₂S/Cu₂O=4、Fe₃O₄.Fe/总Fe=1.5% 代数闭合 */
export function reconcileDustDirectPhases(unpacked: UnpackedUnknowns, config: OxySideBlowConstraintConfig) {
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

  const cuTarget = cuFeed * (dustDistributionPercent(config, 'Cu(铜)', 1) / 100)
  const cu2oDenominator = 4 * cu2sCu + cu2oCu
  const cu2o = cu2oDenominator > 0 ? cuTarget / cu2oDenominator : 0
  phases.Cu2O = Math.max(0, cu2o)
  phases.Cu2S = Math.max(0, cu2o * 4)

  const sulfurTarget = sulfurFeed * (dustDistributionPercent(config, 'S (硫)', 0.2) / 100)
  const fixedSulfur = Math.max(0, phases.Cu2S ?? 0) * cu2sSulfur
  phases.FeS = feSSulfur > 0 ? Math.max(0, (sulfurTarget - fixedSulfur) / feSSulfur) : 0

  const ironTarget = ironFeed * (dustDistributionPercent(config, 'Fe(铁)', 0.55) / 100)
  phases.Fe3O4 = fe3o4Fe > 0 ? Math.max(0, (ironTarget * 0.015) / fe3o4Fe) : 0
  const fixedIron = Math.max(0, phases.FeS ?? 0) * feSFe + Math.max(0, phases.Fe3O4 ?? 0) * fe3o4Fe
  phases.FeO = feOFe > 0 ? Math.max(0, (ironTarget - fixedIron) / feOFe) : 0
}

/** 白铜锍：在求解器已收敛的锍总量内按 GMC 闭合 Cu₂S（不改变锍总质量） */
export function reconcileMattePhasesAtFixedMass(unpacked: UnpackedUnknowns, config: OxySideBlowConstraintConfig) {
  const phases = unpacked.outputPhases.matte
  const gmc = Math.max(0, config.variables?.GMC ?? 75)
  const cu2sCu = phaseFraction('Cu2S', 'Cu(铜)')
  if (cu2sCu <= 0) return
  const total = Math.max(0, unpacked.productMasses.matte ?? productPhaseMass(phases))
  if (total <= 0) return

  const fixedKeys = new Set(['Cu2S', 'Other'])
  const fixedMass = Object.entries(phases).reduce(
    (sum, [phaseKey, mass]) => sum + (fixedKeys.has(phaseKey) ? 0 : Math.max(0, mass)),
    0
  )
  phases.Cu2S = Math.max(0, Math.min(total * (gmc / 100) / cu2sCu, total - fixedMass))
  const withoutOther = Object.entries(phases).reduce(
    (sum, [phaseKey, mass]) => sum + (phaseKey === 'Other' ? 0 : Math.max(0, mass)),
    0
  )
  phases.Other = Math.max(0, total - withoutOther)
}

/** @deprecated 使用 reconcileMattePhasesAtFixedMass */
export function reconcileMatteDirectPhases(unpacked: UnpackedUnknowns, config: OxySideBlowConstraintConfig) {
  reconcileMattePhasesAtFixedMass(unpacked, config)
}

/** 各产物总质量与物相质量之和对齐，避免 w% 分母偏差 */
export function reconcileProductMassesFromPhases(unpacked: UnpackedUnknowns) {
  for (const productKey of OXY_SIDE_BLOW_PRODUCT_KEYS) {
    unpacked.productMasses[productKey] = productPhaseMass(unpacked.outputPhases[productKey] ?? {})
  }
}

function applyInitialFlueGasPhaseGuess(unpacked: UnpackedUnknowns) {
  const phases = unpacked.outputPhases.flueGas
  phases.SO3 = 0
  phases.H2O = Math.max(0, unpacked.waterMass)
  const gasOxygen = unpacked.airColumns.reduce(
    (sum, column) => sum + (columnBalanceElementMass(column)['O(氧)'] ?? 0),
    0
  )
  phases.O2 = gasOxygen * 0.05
  const n2Fraction = phaseFraction('N2', 'N(氮)')
  const co2Fraction = phaseFraction('CO2', 'C (碳)')
  const so2Fraction = phaseFraction('SO2', 'S (硫)')
  if (n2Fraction > 0) phases.N2 = Math.max(phases.N2 ?? 0, (unpacked.balanceFeed.elementWeights['N(氮)'] ?? 0) / n2Fraction)
  if (co2Fraction > 0) phases.CO2 = Math.max(phases.CO2 ?? 0, (unpacked.balanceFeed.elementWeights['C (碳)'] ?? 0) / co2Fraction)
  if (so2Fraction > 0) phases.SO2 = Math.max(phases.SO2 ?? 0, (unpacked.balanceFeed.elementWeights['S (硫)'] ?? 0) / so2Fraction)
}

function applyInitialOutputPhaseGuess(unpacked: UnpackedUnknowns, config: OxySideBlowConstraintConfig) {
  applyInitialSlagPhaseGuess(unpacked)
  applyInitialMattePhaseGuess(unpacked, config)
  applyInitialDustPhaseGuess(unpacked, config)
  applyInitialFlueGasPhaseGuess(unpacked)
}

function applyHardOutputPhaseConstraints(unpacked: UnpackedUnknowns, _config: OxySideBlowConstraintConfig) {
  unpacked.outputPhases.flueGas.H2O = Math.max(0, unpacked.waterMass)
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
    if (spec.kind === 'product_mass' && spec.productKey) {
      productMasses[spec.productKey] = value
    } else if (spec.kind === 'output_phase' && spec.productKey && spec.phaseKey) {
      outputPhases[spec.productKey][spec.phaseKey] = value
    } else if (spec.kind === 'solvent_mass' && spec.solventIndex != null) {
      if (solventColumns[spec.solventIndex]) {
        solventColumns[spec.solventIndex] = { ...solventColumns[spec.solventIndex]!, weight: value }
      }
    } else if (spec.kind === 'input_mass' && spec.inputName) {
      if (spec.inputName === '煤' && !config) fuelMass = value
      else gasMass[spec.inputName] = value
    }
  })

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
  const blendFeed = combineWeightedCompositions([rawFeed, dynamicSolidFeed])
  const distributionFeed = combineWeightedCompositions([rawBalanceFeed, dynamicSolidBalanceFeed])
  const gasBalanceFeed = calculateBalanceWeightedComposition(airColumns)
  const balanceFeed = combineWeightedCompositions([distributionFeed, gasBalanceFeed])
  const solventMasses = solventColumns.map((col) => Math.max(0, col.weight))
  const rawWaterMass = baseInput.rawMaterialColumns?.length
    ? calculateInputWaterMass(baseInput.rawMaterialColumns)
    : Math.max(0, rawFeed.totalWeight - Math.max(0, baseInput.concentrateMass))
  const gasHydrogenMass = gasBalanceFeed.elementWeights['H(氢)'] ?? 0
  const h2oMolarMass = 2 * atomicMass('H') + atomicMass('O')
  const gasHydrogenWaterMass =
    gasHydrogenMass > 0 ? gasHydrogenMass * (h2oMolarMass / (2 * atomicMass('H'))) : 0
  const waterMass = rawWaterMass + calculateInputWaterMass([...solventColumns, fuelColumn]) + gasHydrogenWaterMass

  return {
    productMasses,
    outputPhases,
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
  config: OxySideBlowConstraintConfig
): UnpackedUnknowns {
  const inputProjected = unpackUnknowns(x, specs, baseInput, config)
  applyHardInputMassConstraints(inputProjected, baseInput, config)
  const unpacked = unpackUnknowns(packUnknowns(inputProjected, specs), specs, baseInput, config)
  applyDirectlySolvablePhaseConstraints(unpacked, config)
  applyHardOutputPhaseConstraints(unpacked, config)
  reconcileMattePhasesAtFixedMass(unpacked, config)
  return unpacked
}

function productMassesFromPhaseSums(
  outputPhases: Record<OxySideBlowProductKey, Record<string, number>>
): Record<OxySideBlowProductKey, number> {
  return Object.fromEntries(
    OXY_SIDE_BLOW_PRODUCT_KEYS.map((pk) => [pk, productPhaseMass(outputPhases[pk] ?? {})])
  ) as Record<OxySideBlowProductKey, number>
}

export function buildProductsFromPhases(
  outputPhases: Record<OxySideBlowProductKey, Record<string, number>>,
  config: OxySideBlowConstraintConfig,
  productMasses?: Partial<Record<OxySideBlowProductKey, number>>
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
    for (const phaseKey of config.products[pk].phases) {
      phases[phaseKey] = Math.max(0, outputPhases[pk]?.[phaseKey] ?? 0)
    }
    const phaseMass = productPhaseMass(phases)
    const mass = Math.max(0, productMasses?.[pk] ?? phaseMass)
    products[pk] = {
      mass,
      phases,
      elementMass: deriveElementMassFromPhases(phases, { display: true }),
      balanceElementMass: deriveElementMassFromPhases(phases, { display: false }),
    }
  }
  return products
}

export function buildSymbolTableFromUnknowns(
  unpacked: UnpackedUnknowns,
  baseInput: OxyConstraintBaseInput,
  config: OxySideBlowConstraintConfig
): ConstraintSymbolTable {
  const products = buildProductsFromPhases(unpacked.outputPhases, config, unpacked.productMasses)
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
  const gasElementMass = Object.fromEntries(
    unpacked.airColumns.map((col) => [col.name, columnBalanceElementMass(col)])
  )

  const outputMass: Record<string, number> = {}
  const outputPhaseMass: Record<string, Record<string, number>> = {}
  const outputElementMass: Record<string, Partial<Record<CopperElementKey, number>>> = {}
  for (const pk of OXY_SIDE_BLOW_PRODUCT_KEYS) {
    const name = OXY_PRODUCT_KEY_TO_CN[pk]
    outputMass[name] = products[pk].mass
    outputPhaseMass[name] = { ...products[pk].phases }
    outputElementMass[name] = { ...products[pk].balanceElementMass }
  }

  return {
    variables: config.variables,
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
      ...gasMass,
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
    },
    outputMass,
    outputPhaseMass,
    outputElementMass,
  }
}

export function createInitialUnpacked(baseInput: OxyConstraintBaseInput, config: OxySideBlowConstraintConfig): UnpackedUnknowns {
  const specs = buildUnknownSpecs(config, baseInput)
  const rawFeed = resolveRawDisplayFeed(baseInput)
  const blendMass = Math.max(rawFeed.totalWeight, baseInput.concentrateMass, 1)
  const directWTargets = directlySolvedWPercentPhaseTargets(config)
  const outputPhases = Object.fromEntries(
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
        config.products[pk].phases.map((phaseKey) => [phaseKey, freePhaseKeys.includes(phaseKey) ? freePhaseMass : 0])
      )
      for (const target of targets) {
        phases[target.phaseKey] = productMassHint * target.share
      }
      return [pk, phases]
    })
  ) as Record<OxySideBlowProductKey, Record<string, number>>
  const productMasses = productMassesFromPhaseSums(outputPhases)

  const gasMass = Object.fromEntries(
    SOLVER_INPUT_MASS_UNKNOWN_NAMES.map((name) => [
      name,
      Math.max(findAirColumn(baseInput.airColumns, name)?.weight ?? 0, name === '加料口漏风' ? 5.73 : 1),
    ])
  ) as Record<InputMassUnknownName, number>
  const solventCount = Math.max(baseInput.solventColumns.length, 1)
  const solventColumns = baseInput.solventColumns.map((col) => ({
    ...col,
    weight: Math.max(0, col.weight, baseInput.concentrateMass * 0.05 / solventCount),
  }))

  const initial: UnpackedUnknowns = {
    productMasses,
    outputPhases,
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
  const seeded = unpackUnknowns(packUnknowns(projected, specs), specs, baseInput, config)
  applyDirectlySolvablePhaseConstraints(seeded, config)
  applyInitialOutputPhaseGuess(seeded, config)
  seeded.productMasses = productMassesFromPhaseSums(seeded.outputPhases)
  return seeded
}
