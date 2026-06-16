import { COPPER_BUILTIN_PHASE_FRACTIONS } from './copperPhaseStoichiometry.ts'
import { phaseFractionsFromFormula } from './chemicalFormula.ts'
import {
  expandAssayDisplayMassForBalance,
  singleCountOxideDisplayMass,
} from './copperConstraintElementBridge.ts'
import {
  OXY_PRODUCT_KEY_TO_CN,
  OXY_SIDE_BLOW_PRODUCT_KEYS,
  type OxySideBlowConstraintConfig,
  type OxySideBlowProductKey,
} from './copperConstraintConfig.ts'
import type { ConstraintSymbolTable } from './copperConstraintExpression.ts'
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

export type UnknownKind = 'output_phase' | 'input_mass' | 'solvent_mass'

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
  if (baseInput.rawMaterialColumns?.length) return calculateWeightedComposition(baseInput.rawMaterialColumns)
  return baseInput.rawFeed ?? baseInput.blendFeed
}

function resolveRawBalanceFeed(baseInput: OxyConstraintBaseInput, rawDisplayFeed: WeightedComposition): WeightedComposition {
  if (baseInput.rawMaterialColumns?.length) return calculateBalanceWeightedComposition(baseInput.rawMaterialColumns)
  return balanceFeedFromDisplayFeed(rawDisplayFeed)
}

function phaseFormulaFractions(phaseKey: string): Partial<Record<CopperElementKey, number>> {
  if (phaseKey === 'Other') return { 'Other(其他)': 1 }
  const parsed = phaseFractionsFromFormula(phaseKey) as Partial<Record<CopperElementKey, number>>
  if (Object.keys(parsed).length > 0) return parsed
  return (COPPER_BUILTIN_PHASE_FRACTIONS[phaseKey] ?? {}) as Partial<Record<CopperElementKey, number>>
}

function deriveElementMassFromPhases(
  phases: Record<string, number>,
  options: { display: boolean }
): Partial<Record<CopperElementKey, number>> {
  const out: Partial<Record<CopperElementKey, number>> = {}
  for (const [phaseKey, mass] of Object.entries(phases)) {
    if (mass <= 0) continue
    const rawFracs = phaseFormulaFractions(phaseKey)
    const fracs = options.display ? singleCountOxideDisplayMass(rawFracs) : rawFracs
    for (const [el, frac] of Object.entries(fracs) as [CopperElementKey, number][]) {
      out[el] = (out[el] ?? 0) + mass * frac
    }
  }
  return out
}

export function buildUnknownSpecs(config: OxySideBlowConstraintConfig, baseInput?: OxyConstraintBaseInput): UnknownSpec[] {
  const specs: UnknownSpec[] = []
  for (const productKey of OXY_SIDE_BLOW_PRODUCT_KEYS) {
    for (const phaseKey of config.products[productKey].phases) {
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
  for (const inputName of INPUT_MASS_UNKNOWN_NAMES) {
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

export function unpackUnknowns(
  x: number[],
  specs: UnknownSpec[],
  baseInput: OxyConstraintBaseInput
): UnpackedUnknowns {
  const outputPhases = Object.fromEntries(
    OXY_SIDE_BLOW_PRODUCT_KEYS.map((pk) => [pk, {} as Record<string, number>])
  ) as Record<OxySideBlowProductKey, Record<string, number>>

  let fuelMass = Math.max(0, baseInput.fuelColumn.weight)
  const solventColumns = baseInput.solventColumns.map((col) => ({ ...col, weight: Math.max(0, col.weight) }))
  const gasMass = Object.fromEntries(
    INPUT_MASS_UNKNOWN_NAMES.filter((name) => name !== '煤').map((name) => [
      name,
      Math.max(0, findAirColumn(baseInput.airColumns, name)?.weight ?? 0),
    ])
  ) as Record<InputMassUnknownName, number>

  specs.forEach((spec, index) => {
    const value = Math.max(0, x[index] ?? 0)
    if (spec.kind === 'output_phase' && spec.productKey && spec.phaseKey) {
      outputPhases[spec.productKey][spec.phaseKey] = value
    } else if (spec.kind === 'solvent_mass' && spec.solventIndex != null) {
      if (solventColumns[spec.solventIndex]) {
        solventColumns[spec.solventIndex] = { ...solventColumns[spec.solventIndex]!, weight: value }
      }
    } else if (spec.kind === 'input_mass' && spec.inputName) {
      if (spec.inputName === '煤') fuelMass = value
      else gasMass[spec.inputName] = value
    }
  })

  const fuelColumn = { ...baseInput.fuelColumn, weight: fuelMass }
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
  const waterMass = rawWaterMass + calculateInputWaterMass([...solventColumns, fuelColumn])

  return {
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

export function buildProductsFromPhases(
  outputPhases: Record<OxySideBlowProductKey, Record<string, number>>,
  config: OxySideBlowConstraintConfig
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
    const mass = Object.values(phases).reduce((sum, value) => sum + value, 0)
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
  const products = buildProductsFromPhases(unpacked.outputPhases, config)
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
      ...solventMass,
      ...gasMass,
    },
    inputElementMass: {
      混合铜精矿: unpacked.rawBalanceFeed.elementWeights,
      原料: unpacked.rawBalanceFeed.elementWeights,
      混料: unpacked.distributionFeed.elementWeights,
      总投入: unpacked.balanceFeed.elementWeights,
      煤: fuelElementMass,
      ...solventElementMass,
      ...gasElementMass,
    },
    inputPhaseMass: baseInput.inputPhaseMass,
    outputMass,
    outputPhaseMass,
    outputElementMass,
  }
}

export function createInitialUnpacked(baseInput: OxyConstraintBaseInput, config: OxySideBlowConstraintConfig): UnpackedUnknowns {
  const specs = buildUnknownSpecs(config, baseInput)
  const rawFeed = resolveRawDisplayFeed(baseInput)
  const blendMass = Math.max(rawFeed.totalWeight, baseInput.concentrateMass, 1)
  const outputPhases = Object.fromEntries(
    OXY_SIDE_BLOW_PRODUCT_KEYS.map((pk) => {
      const phaseCount = Math.max(config.products[pk].phases.length, 1)
      const productMassHint = blendMass / OXY_SIDE_BLOW_PRODUCT_KEYS.length
      const phases = Object.fromEntries(
        config.products[pk].phases.map((phaseKey) => [phaseKey, productMassHint / phaseCount])
      )
      return [pk, phases]
    })
  ) as Record<OxySideBlowProductKey, Record<string, number>>

  const gasMass = Object.fromEntries(
    INPUT_MASS_UNKNOWN_NAMES.filter((name) => name !== '煤').map((name) => [
      name,
      Math.max(findAirColumn(baseInput.airColumns, name)?.weight ?? 0, name === '加料口漏风' ? 5.73 : 1),
    ])
  ) as Record<InputMassUnknownName, number>
  const solventCount = Math.max(baseInput.solventColumns.length, 1)
  const solventColumns = baseInput.solventColumns.map((col) => ({
    ...col,
    weight: Math.max(0, col.weight, baseInput.concentrateMass * 0.05 / solventCount),
  }))

  return unpackUnknowns(
    packUnknowns(
      {
        outputPhases,
        fuelMass: Math.max(baseInput.fuelColumn.weight, baseInput.concentrateMass * 0.13, 1),
        solventMasses: solventColumns.map((col) => Math.max(0, col.weight)),
        gasMass,
        waterMass: 0,
        rawFeed,
        rawBalanceFeed: resolveRawBalanceFeed(baseInput, rawFeed),
        distributionFeed: rawFeed,
        balanceFeed: rawFeed,
        blendFeed: rawFeed,
        fuelColumn: baseInput.fuelColumn,
        solventColumns,
        airColumns: baseInput.airColumns,
      },
      specs
    ),
    specs,
    baseInput
  )
}
