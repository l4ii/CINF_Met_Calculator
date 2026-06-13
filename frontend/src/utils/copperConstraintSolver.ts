import {
  calculateWeightedComposition,
  COPPER_ELEMENT_KEYS,
  type CopperElementKey,
  type CopperMaterialColumn,
  type WeightedComposition,
} from './copperWorkflowCalc.ts'
import { atomicMass, COMPOUND_MOLAR_MASS } from './atomicMass.ts'
import { COPPER_BUILTIN_PHASE_FRACTIONS } from './copperPhaseStoichiometry.ts'
import { solvePhaseDistribution } from './copperPhaseSolver.ts'
import {
  loadOxySideBlowConstraints,
  OXY_PRODUCT_KEY_TO_CN,
  OXY_SIDE_BLOW_PRODUCT_KEYS,
  type ElementDistributionEntry,
  type OxySideBlowConstraintConfig,
  type OxySideBlowProductKey,
} from './copperConstraintConfig.ts'
import {
  buildConstraintSymbolTable,
  evaluateConstraintExprString,
  parseConstraintExpression,
} from './copperConstraintExpression.ts'
import {
  computeFlueGasPhaseMasses,
  elementPoolForPhaseSolve,
  filterActiveProductPhaseKeys,
} from './copperProductPhaseCalc.ts'
import {
  addMetalAllocationToProductPool,
  constraintFeedMetalMass,
  feedKeysCoveredByConstraints,
  resolveConstraintElementBinding,
} from './copperConstraintElementBridge.ts'

export interface OxyProductPhaseResult {
  key: string
  mass: number
  pct: number
}

export interface OxyProductResult {
  key: OxySideBlowProductKey
  name: string
  mass: number
  phases: OxyProductPhaseResult[]
  elementMass: Partial<Record<CopperElementKey, number>>
  composition: Partial<Record<CopperElementKey, number>>
}

export interface OxyConstraintSolverInput {
  blendFeed: WeightedComposition
  concentrateMass: number
  inputPhaseMass?: Record<string, Record<string, number>>
  fuelColumn: CopperMaterialColumn
  solventColumns: CopperMaterialColumn[]
  airColumns: CopperMaterialColumn[]
  config?: OxySideBlowConstraintConfig
}

export interface OxyConstraintSolverResult {
  valid: boolean
  converged: boolean
  stage: 'stage1' | 'stage2' | 'complete'
  message?: string
  products: Record<OxySideBlowProductKey, OxyProductResult>
  totalProductMass: number
  recommended: {
    fuelWeight: number
    solventWeights: Record<string, number>
    gasWeights: Record<string, number>
  }
  constraintResiduals: Array<{ expr: string; value: number; target: number; residual: number; soft?: boolean }>
  elementBalanceResiduals?: Array<{ element: CopperElementKey; feed: number; allocated: number; residual: number }>
}

const MM = COMPOUND_MOLAR_MASS

function normalizeConstraintExpr(expr: string) {
  return expr.replace(/\s+/g, '')
}

function isSoftTargetConstraint(_expr: string) {
  return false
}

const DEFAULT_PRODUCT_FOR_ELEMENT: Partial<Record<CopperElementKey, OxySideBlowProductKey>> = {
  'Cu(铜)': 'matte',
  'S (硫)': 'flueGas',
  'Fe(铁)': 'smeltingSlag',
  'FeO(氧化亚铁)': 'smeltingSlag',
  'SiO₂(二氧化硅)': 'smeltingSlag',
  'CaO(氧化钙)': 'smeltingSlag',
  'MgO(氧化镁)': 'smeltingSlag',
  'Al₂O₃(三氧化二铝)': 'smeltingSlag',
  'O(氧)': 'flueGas',
  'N(氮)': 'flueGas',
  'C (碳)': 'flueGas',
  'H(氢)': 'flueGas',
  'Hg(汞)': 'flueGas',
  'As(砷)': 'dust',
  'Pb(铅)': 'dust',
  'Zn(锌)': 'dust',
  'Sb(锑)': 'dust',
  'Bi(铋)': 'dust',
  'Cd(镉)': 'dust',
}

function phaseElementMass(phaseKey: string, element: CopperElementKey, phaseMass: number): number {
  const frac = COPPER_BUILTIN_PHASE_FRACTIONS[phaseKey]?.[element] ?? 0
  return phaseMass * frac
}

function sumElementInPhases(phases: Record<string, number>, element: CopperElementKey): number {
  let sum = 0
  for (const [key, mass] of Object.entries(phases)) {
    sum += phaseElementMass(key, element, mass)
  }
  return sum
}

function deriveElementMassFromPhases(phases: Record<string, number>): Partial<Record<CopperElementKey, number>> {
  const out: Partial<Record<CopperElementKey, number>> = {}
  for (const [phaseKey, mass] of Object.entries(phases)) {
    if (phaseKey === 'Cu' && mass > 0) {
      out['Cu(铜)'] = (out['Cu(铜)'] ?? 0) + mass
      continue
    }
    if (phaseKey === 'S' && mass > 0) {
      out['S (硫)'] = (out['S (硫)'] ?? 0) + mass
      continue
    }
    const fracs = COPPER_BUILTIN_PHASE_FRACTIONS[phaseKey] ?? {}
    for (const [el, frac] of Object.entries(fracs) as [CopperElementKey, number][]) {
      out[el] = (out[el] ?? 0) + mass * frac
    }
  }
  return out
}

function compositionFromElementMass(
  elementMass: Partial<Record<CopperElementKey, number>>,
  totalMass: number
): Partial<Record<CopperElementKey, number>> {
  const comp: Partial<Record<CopperElementKey, number>> = {}
  if (totalMass <= 0) return comp
  for (const [el, m] of Object.entries(elementMass) as [CopperElementKey, number][]) {
    comp[el] = (m / totalMass) * 100
  }
  return comp
}

function resolveConfigNumber(value: number | string, variables: Record<string, number> | undefined): number {
  if (typeof value === 'number') return value
  return variables?.[value] ?? 0
}

function columnElementMass(column: CopperMaterialColumn): Partial<Record<CopperElementKey, number>> {
  return Object.fromEntries(
    COPPER_ELEMENT_KEYS.map((el) => [
      el,
      (Math.max(0, column.weight) * (column.ratios[el] ?? 0)) / 100,
    ])
  ) as Partial<Record<CopperElementKey, number>>
}

function replaceFuelContributionInBlendFeed(
  blendFeed: WeightedComposition,
  previousFuel: CopperMaterialColumn,
  nextFuel: CopperMaterialColumn
): WeightedComposition {
  if (Math.abs(previousFuel.weight - nextFuel.weight) <= 1e-12) return blendFeed
  const previous = calculateWeightedComposition([previousFuel])
  const next = calculateWeightedComposition([nextFuel])
  const totalWeight = Math.max(0, blendFeed.totalWeight - previous.totalWeight + next.totalWeight)
  const elementWeights = Object.fromEntries(
    COPPER_ELEMENT_KEYS.map((el) => [
      el,
      Math.max(0, (blendFeed.elementWeights[el] ?? 0) - (previous.elementWeights[el] ?? 0) + (next.elementWeights[el] ?? 0)),
    ])
  ) as Record<CopperElementKey, number>
  const ratios = Object.fromEntries(
    COPPER_ELEMENT_KEYS.map((el) => [el, totalWeight > 0 ? (elementWeights[el] / totalWeight) * 100 : 0])
  ) as Record<CopperElementKey, number>
  return { totalWeight, elementWeights, ratios }
}

function sumAllocated(alloc: Partial<Record<OxySideBlowProductKey, number>>): number {
  return Object.values(alloc).reduce((s, v) => s + (v ?? 0), 0)
}

function allocateElementMassByRules(
  feedElementMass: number,
  _blendDryMass: number,
  entry: ElementDistributionEntry | undefined,
  productMassGuess: Record<OxySideBlowProductKey, number>,
  variables: Record<string, number> | undefined
): Partial<Record<OxySideBlowProductKey, number>> {
  const allocated: Partial<Record<OxySideBlowProductKey, number>> = {}
  if (!entry || feedElementMass <= 0) return allocated

  let fixedFromD = 0
  const wRules: Array<{ product: OxySideBlowProductKey; value: number }> = []

  for (const rule of entry.rules) {
    const value = resolveConfigNumber(rule.value, variables)
    if (value <= 0) continue
    if (rule.type === 'D%') {
      const m = feedElementMass * (value / 100)
      allocated[rule.product] = (allocated[rule.product] ?? 0) + m
      fixedFromD += m
    } else {
      wRules.push({ product: rule.product, value })
    }
  }

  const remaining = Math.max(0, feedElementMass - fixedFromD)
  if (wRules.length > 0 && remaining > 0) {
    const desired = wRules.map((r) => ({
      ...r,
      mass: Math.max(0, productMassGuess[r.product] ?? 0) * (r.value / 100),
    }))
    const desiredTotal = desired.reduce((s, r) => s + r.mass, 0)
    if (desiredTotal > 0) {
      const scale = desiredTotal > remaining ? remaining / desiredTotal : 1
      for (const r of desired) {
        const m = r.mass * scale
        allocated[r.product] = (allocated[r.product] ?? 0) + m
      }
      const used = desiredTotal * scale
      const leftover = Math.max(0, remaining - used)
      if (leftover > 1e-9) {
        const primary = [...wRules].sort((a, b) => b.value - a.value)[0]
        if (primary) allocated[primary.product] = (allocated[primary.product] ?? 0) + leftover
      }
    } else {
      const primary = [...wRules].sort((a, b) => b.value - a.value)[0]
      if (primary) allocated[primary.product] = (allocated[primary.product] ?? 0) + remaining
    }
  }

  return allocated
}

function solveProductPhasesFromElementPool(
  phaseKeys: string[],
  elementPool: Partial<Record<CopperElementKey, number>>,
  productMassHint: number
): Record<string, number> {
  const pool = elementPoolForPhaseSolve(elementPool)
  const activeKeys = filterActiveProductPhaseKeys(phaseKeys, pool)
  const specs = activeKeys.map((id) => ({
    id,
    fractions: COPPER_BUILTIN_PHASE_FRACTIONS[id] ?? {},
  }))
  const solver = solvePhaseDistribution(specs, pool)
  const phases: Record<string, number> = {}
  if (solver.valid) {
    for (const key of activeKeys) {
      phases[key] = Math.max(0, solver.amounts[key] ?? 0)
    }
  } else if (activeKeys.length === 1) {
    const key = activeKeys[0]!
    const el = Object.entries(pool).find(([, m]) => (m ?? 0) > 0)?.[0] as CopperElementKey | undefined
    const frac = el ? COPPER_BUILTIN_PHASE_FRACTIONS[key]?.[el] ?? 0 : 0
    if (el && frac > 0) {
      phases[key] = Math.max(0, (pool[el] ?? 0) / frac)
    }
  }
  const residualMass = Object.values(solver.residual ?? {}).reduce((s, v) => s + Math.max(0, v ?? 0), 0)
  let known = Object.values(phases).reduce((s, v) => s + v, 0)
  const targetMass = Math.max(productMassHint, known + residualMass)
  if (phaseKeys.includes('Other')) {
    phases.Other = Math.max(0, targetMass - known)
    if (residualMass > 0 && phases.Other < residualMass) {
      phases.Other = residualMass
    }
  } else if (residualMass > 0 && known < targetMass) {
    const largestKey = activeKeys[0]
    if (largestKey) phases[largestKey] = (phases[largestKey] ?? 0) + (targetMass - known)
    known = Object.values(phases).reduce((s, v) => s + v, 0)
  }
  return phases
}

function enforcePhaseRatio(
  phases: Record<string, number>,
  numeratorPhase: string,
  denominatorPhase: string,
  targetRatio: number
): Record<string, number> {
  const next = { ...phases }
  const denom = next[denominatorPhase] ?? 0
  if (denom <= 0) {
    next[denominatorPhase] = 0.01
  }
  const d = Math.max(next[denominatorPhase] ?? 0, 1e-9)
  next[numeratorPhase] = d * targetRatio
  return next
}

function enforceElementRatio(
  phases: Record<string, number>,
  numeratorPhase: string,
  denominatorPhase: string,
  element: CopperElementKey,
  targetRatio: number
): Record<string, number> {
  const next = { ...phases }
  const numeratorFrac = COPPER_BUILTIN_PHASE_FRACTIONS[numeratorPhase]?.[element] ?? 0
  const denominatorFrac = COPPER_BUILTIN_PHASE_FRACTIONS[denominatorPhase]?.[element] ?? 0
  if (numeratorFrac <= 0 || denominatorFrac <= 0 || targetRatio <= 0) return next

  const currentNumerator = Math.max(0, (next[numeratorPhase] ?? 0) * numeratorFrac)
  const currentDenominator = Math.max(0, (next[denominatorPhase] ?? 0) * denominatorFrac)
  let totalElement = currentNumerator + currentDenominator
  if (totalElement <= 1e-12) {
    next[denominatorPhase] = Math.max(next[denominatorPhase] ?? 0, 0.01)
    totalElement = next[denominatorPhase] * denominatorFrac * (targetRatio + 1)
  }

  const denominatorElement = totalElement / (targetRatio + 1)
  const numeratorElement = totalElement - denominatorElement
  next[denominatorPhase] = denominatorElement / denominatorFrac
  next[numeratorPhase] = numeratorElement / numeratorFrac
  return next
}

function enforcePhaseMassFraction(
  phases: Record<string, number>,
  phaseKey: string,
  targetFraction: number
): Record<string, number> {
  const next = { ...phases }
  const total = Object.values(next).reduce((s, v) => s + v, 0)
  if (total <= 0) return next
  const current = next[phaseKey] ?? 0
  const desired = total * targetFraction
  const delta = desired - current
  next[phaseKey] = desired
  const otherKeys = Object.keys(next).filter((k) => k !== phaseKey && k !== 'Other')
  const otherSum = otherKeys.reduce((s, k) => s + (next[k] ?? 0), 0)
  if (otherSum > 0 && delta !== 0) {
    for (const k of otherKeys) {
      next[k] = Math.max(0, (next[k] ?? 0) - (delta * (next[k] ?? 0)) / otherSum)
    }
  }
  return next
}

function normalizePhasesToMass(phases: Record<string, number>, targetMass: number): Record<string, number> {
  const sum = Object.values(phases).reduce((s, v) => s + v, 0)
  if (sum <= 0) return phases
  const scale = targetMass / sum
  return Object.fromEntries(Object.entries(phases).map(([k, v]) => [k, v * scale]))
}

function closePhasesToTargetMass(
  phases: Record<string, number>,
  phaseKeys: string[],
  targetMass: number
): Record<string, number> {
  const next = { ...phases }
  let known = Object.keys(next)
    .filter((k) => k !== 'Other')
    .reduce((s, k) => s + (next[k] ?? 0), 0)
  if (phaseKeys.includes('Other')) {
    next.Other = Math.max(0, targetMass - known)
  } else if (known < targetMass && known > 0) {
    const scale = targetMass / known
    for (const k of Object.keys(next)) {
      next[k] = (next[k] ?? 0) * scale
    }
    known = targetMass
  }
  const total = Object.values(next).reduce((s, v) => s + v, 0)
  if (total > 0 && Math.abs(total - targetMass) > 1e-6) {
    return normalizePhasesToMass(next, targetMass)
  }
  return next
}

function closeProductElementComposition(
  elementMass: Partial<Record<CopperElementKey, number>>,
  totalMass: number
): Partial<Record<CopperElementKey, number>> {
  const comp = compositionFromElementMass(elementMass, totalMass)
  const known = Object.entries(comp)
    .filter(([el]) => el !== 'Other(其他)')
    .reduce((s, [, v]) => s + (v ?? 0), 0)
  if (totalMass <= 0) return comp
  if (known < 100 - 0.5) {
    comp['Other(其他)'] = Math.max(0, 100 - known)
  } else if (known > 100 + 0.5) {
    const scale = 100 / known
    for (const el of Object.keys(comp) as CopperElementKey[]) {
      if (el === 'Other(其他)') continue
      comp[el] = (comp[el] ?? 0) * scale
    }
    comp['Other(其他)'] = 0
  }
  return comp
}

function buildProductResult(
  key: OxySideBlowProductKey,
  name: string,
  phaseKeys: string[],
  phases: Record<string, number>
): OxyProductResult {
  const mass = Object.values(phases).reduce((s, v) => s + v, 0)
  const elementMass = deriveElementMassFromPhases(phases)
  const closedPhases = closePhasesToTargetMass(phases, phaseKeys, mass)
  const finalMass = Object.values(closedPhases).reduce((s, v) => s + v, 0)
  const phaseResults: OxyProductPhaseResult[] = phaseKeys.map((pk) => ({
    key: pk,
    mass: closedPhases[pk] ?? 0,
    pct: finalMass > 0 ? ((closedPhases[pk] ?? 0) / finalMass) * 100 : 0,
  }))
  return {
    key,
    name,
    mass: finalMass,
    phases: phaseResults,
    elementMass: deriveElementMassFromPhases(closedPhases),
    composition: closeProductElementComposition(deriveElementMassFromPhases(closedPhases), finalMass),
  }
}

function applyMatteGmcPhases(
  _phases: Record<string, number>,
  matteMass: number,
  elementPool: Partial<Record<CopperElementKey, number>>,
  gmc: number
): Record<string, number> {
  if (matteMass <= 0 && (elementPool['Cu(铜)'] ?? 0) <= 0) return _phases
  const next: Record<string, number> = {}
  const sTargetFrac = -0.125 * (gmc / 100) + 0.292
  const feTargetFrac = -0.825 * (gmc / 100) + 0.633

  const cuFrac = COPPER_BUILTIN_PHASE_FRACTIONS.Cu2S?.['Cu(铜)'] ?? 0
  const cu2sSFrac = COPPER_BUILTIN_PHASE_FRACTIONS.Cu2S?.['S (硫)'] ?? 0
  const feFrac = COPPER_BUILTIN_PHASE_FRACTIONS.FeS?.['Fe(铁)'] ?? 0
  const fesSFrac = COPPER_BUILTIN_PHASE_FRACTIONS.FeS?.['S (硫)'] ?? 0
  const fesPerMass = feFrac > 0 ? Math.max(0, feTargetFrac) / feFrac : 0
  const cu2sPerMass =
    cu2sSFrac > 0 ? Math.max(0, sTargetFrac - fesPerMass * fesSFrac) / cu2sSFrac : 0
  const matteCuFraction = cu2sPerMass * cuFrac
  const cuMass = elementPool['Cu(铜)'] ?? 0
  const targetMass = cuMass > 0 && matteCuFraction > 0 ? cuMass / matteCuFraction : Math.max(0, matteMass)

  next.Cu2S = cu2sPerMass * targetMass
  next.FeS = fesPerMass * targetMass

  let known = Object.values(next).reduce((s, v) => s + v, 0)
  const traceKeys = ['Ni', 'Pb', 'Zn', 'Se', 'Bi', 'Sb', 'Cd', 'Sn', 'Au', 'Ag', 'Te'] as const
  for (const pk of traceKeys) {
    const fracs = COPPER_BUILTIN_PHASE_FRACTIONS[pk] ?? {}
    for (const [el, frac] of Object.entries(fracs) as [CopperElementKey, number][]) {
      const available = elementPool[el] ?? 0
      if (available > 0 && frac > 0) {
        const phaseMass = available / frac
        if (known + phaseMass <= targetMass + 1e-9) {
          next[pk] = Math.max(next[pk] ?? 0, phaseMass)
          known += phaseMass
        }
      }
    }
  }

  next.Other = Math.max(0, targetMass - known)
  return next
}

function solveLossPhases(
  elementPool: Partial<Record<CopperElementKey, number>>,
  productMassHint: number
): Record<string, number> {
  const phases: Record<string, number> = {}
  const cuMass = elementPool['Cu(铜)'] ?? 0
  const sMass = elementPool['S (硫)'] ?? 0
  phases.Cu = cuMass
  phases.S = sMass
  const known = cuMass + sMass
  const target = Math.max(productMassHint, known)
  phases.Other = Math.max(0, target - known)
  return phases
}

function totalInputOxygen(input: OxyConstraintSolverInput): number {
  let sum = 0
  for (const col of input.airColumns) {
    sum += columnElementMass(col)['O(氧)'] ?? 0
  }
  return sum
}

function findAirColumn(input: OxyConstraintSolverInput, name: string): CopperMaterialColumn | undefined {
  return input.airColumns.find((c) => c.name === name)
}

function updateAirColumnById(
  input: OxyConstraintSolverInput,
  column: CopperMaterialColumn,
  patch: Partial<CopperMaterialColumn>
): OxyConstraintSolverInput {
  const idx = input.airColumns.findIndex((col) => col.id === column.id)
  if (idx < 0) return input
  const updated = [...input.airColumns]
  updated[idx] = { ...column, ...patch }
  return { ...input, airColumns: updated }
}

function setFuelWeightForConstraint(
  input: OxyConstraintSolverInput,
  targetWeight: number
): OxyConstraintSolverInput {
  const nextFuel = { ...input.fuelColumn, weight: Math.max(0, targetWeight) }
  return {
    ...input,
    fuelColumn: nextFuel,
    blendFeed: replaceFuelContributionInBlendFeed(input.blendFeed, input.fuelColumn, nextFuel),
  }
}

function applyFuelRatioTarget(
  input: OxyConstraintSolverInput,
  targetRatio: number
): OxyConstraintSolverInput {
  if (input.concentrateMass <= 0 || targetRatio < 0) return input
  return setFuelWeightForConstraint(input, input.concentrateMass * targetRatio)
}

function applyFeedLeakTarget(
  input: OxyConstraintSolverInput,
  targetRatio: number
): OxyConstraintSolverInput {
  const leakCol = findAirColumn(input, '加料口漏风')
  if (!leakCol) return input
  return updateAirColumnById(input, leakCol, { weight: Math.max(0, targetRatio * 5.73) })
}

function applySecondaryAirTarget(
  input: OxyConstraintSolverInput,
  targetRatio: number
): OxyConstraintSolverInput {
  const secCol = findAirColumn(input, '二次风')
  if (!secCol) return input
  const denom = secondaryAirOxygenDemandDenominator(input)
  const oFrac = (secCol.ratios['O(氧)'] ?? 0) / 100
  if (denom <= 0 || oFrac <= 0) return input
  const targetOxygenElementMass = targetRatio * denom * atomicMass('O')
  return updateAirColumnById(input, secCol, { weight: Math.max(0, targetOxygenElementMass / oFrac) })
}

function oxygenVolumeFactor(column: CopperMaterialColumn): number {
  const oxygenMassFraction = (column.ratios['O(氧)'] ?? 0) / 100
  return (oxygenMassFraction / Math.max(atomicMass('O'), 1e-9)) * 22.4
}

function applyPrimaryOxygenEnrichmentTarget(
  input: OxyConstraintSolverInput,
  targetRatio: number
): OxyConstraintSolverInput {
  const airCol = findAirColumn(input, '空气')
  const oxygenCol = findAirColumn(input, '氧气')
  if (!airCol || !oxygenCol) return input
  const airFactor = oxygenVolumeFactor(airCol)
  const oxygenFactor = oxygenVolumeFactor(oxygenCol)
  if (Math.abs(oxygenFactor - airFactor) <= 1e-12) return input
  const oxygenShare = Math.min(1, Math.max(0, (targetRatio - airFactor) / (oxygenFactor - airFactor)))
  const currentTotal = Math.max(0, airCol.weight + oxygenCol.weight)
  const total = currentTotal > 1e-9 ? currentTotal : 1e-6
  let next = updateAirColumnById(input, airCol, { weight: total * (1 - oxygenShare) })
  const refreshedOxygen = findAirColumn(next, '氧气')
  if (refreshedOxygen) next = updateAirColumnById(next, refreshedOxygen, { weight: total * oxygenShare })
  return next
}

function applyInputOnlyConstraint(
  input: OxyConstraintSolverInput,
  expr: string,
  target: number
): OxyConstraintSolverInput {
  switch (normalizeConstraintExpr(expr)) {
    case 'Input.煤/Input.混合铜精矿':
      return applyFuelRatioTarget(input, target)
    case 'Input.加料口漏风/5.73':
      return applyFeedLeakTarget(input, target)
    case '(Input.二次风.O2/O)/((Input.混合铜精矿.CuFeS2.S/S/4)+(Input.混合铜精矿.FeS2.S/S/2)*0.7+Input.煤.C/C*0.7)':
      return applySecondaryAirTarget(input, target)
    case '((Input.空气.O2+Input.氧气.O2)/O*22.4)/(Input.空气+Input.氧气)':
      return applyPrimaryOxygenEnrichmentTarget(input, target)
    default:
      return input
  }
}

function applyInputOnlyConstraintCorrections(
  input: OxyConstraintSolverInput,
  config: OxySideBlowConstraintConfig
): OxyConstraintSolverInput {
  return config.customConstraints.reduce(
    (next, constraint) => applyInputOnlyConstraint(next, constraint.expr, constraint.target),
    input
  )
}

function inputPhaseSubElementMass(
  inputPhaseMass: Record<string, Record<string, number>> | undefined,
  materialName: string,
  phaseKey: string,
  elementKey: CopperElementKey
): number {
  const phaseMass = inputPhaseMass?.[materialName]?.[phaseKey] ?? 0
  if (phaseMass <= 0) return 0
  const frac = COPPER_BUILTIN_PHASE_FRACTIONS[phaseKey]?.[elementKey] ?? 0
  return phaseMass * frac
}

/** 约束 #3 分母：CuFeS₂.S/M_S/4 + FeS₂.S/M_S/2×0.7 + 煤.C/M_C×0.7 */
function secondaryAirOxygenDemandDenominator(input: OxyConstraintSolverInput): number {
  const cuFeS2S = inputPhaseSubElementMass(
    input.inputPhaseMass,
    '混合铜精矿',
    'CuFeS2',
    'S (硫)'
  )
  const feS2S = inputPhaseSubElementMass(input.inputPhaseMass, '混合铜精矿', 'FeS2', 'S (硫)')
  const coalC = columnElementMass(input.fuelColumn)['C (碳)'] ?? 0
  const sMm = atomicMass('S')
  const cMm = atomicMass('C')
  return (cuFeS2S / sMm) / 4 + ((feS2S / sMm) / 2) * 0.7 + (coalC / cMm) * 0.7
}

function solveFlueGasPhases(
  elementPool: Partial<Record<CopperElementKey, number>>,
  input: OxyConstraintSolverInput,
  productMassHint: number,
  o2RetentionTarget = 0.85
): Record<string, number> {
  const feedO = input.blendFeed.elementWeights['O(氧)'] ?? 0
  const feedN = input.blendFeed.elementWeights['N(氮)'] ?? 0
  const feedC = input.blendFeed.elementWeights['C (碳)'] ?? 0
  const feedH = input.blendFeed.elementWeights['H(氢)'] ?? 0
  const feedHg = input.blendFeed.elementWeights['Hg(汞)'] ?? 0

  let airO = 0
  let airN = 0
  for (const col of input.airColumns) {
    const em = columnElementMass(col)
    airO += em['O(氧)'] ?? 0
    airN += em['N(氮)'] ?? 0
  }

  const sulfurMass = Math.max(elementPool['S (硫)'] ?? 0, 0)
  const totalO2In = totalInputOxygen(input)
  const phases = computeFlueGasPhaseMasses({
    sulfurMass,
    carbonMass: (elementPool['C (碳)'] ?? 0) + feedC * 0.3,
    oxygenMass: (elementPool['O(氧)'] ?? 0) + feedO * 0.1 + airO * 0.05,
    nitrogenMass: (elementPool['N(氮)'] ?? 0) + feedN + airN,
    hydrogenMass: (elementPool['H(氢)'] ?? 0) + feedH,
    arsenicMass: elementPool['As(砷)'] ?? 0,
    mercuryMass: (elementPool['Hg(汞)'] ?? 0) + feedHg,
    targetMass: productMassHint,
    retainedOxygenMass: totalO2In > 0 ? totalO2In * o2RetentionTarget : undefined,
  })
  return phases
}

function ensureSlagFeOSiO2(
  phases: Record<string, number>,
  elementPool: Partial<Record<CopperElementKey, number>>,
  feSiRatio = 2
): Record<string, number> {
  const next = { ...phases }
  const sio2FromPool = elementPool['SiO₂(二氧化硅)'] ?? 0
  if ((next.SiO2 ?? 0) <= 0 && sio2FromPool > 0) {
    next.SiO2 = sio2FromPool
  }
  const feMass = sumElementInPhases(next, 'Fe(铁)')
  const sio2Mass = next.SiO2 ?? 0
  const feOFromFe = MM.FeO / atomicMass('Fe')
  const sio2FromFe = MM.SiO2 / atomicMass('Fe')
  if (sio2Mass > 0) {
    const targetFe = sio2Mass * feSiRatio
    if (feMass < targetFe) {
      next.FeO = (next.FeO ?? 0) + (targetFe - feMass) * feOFromFe
    }
  } else if (feMass > 0) {
    next.FeO = (next.FeO ?? 0) + feMass * feOFromFe * 0.5
    next.SiO2 = (next.SiO2 ?? 0) + (feMass / feSiRatio) * sio2FromFe
  }
  return next
}

interface Stage1Context {
  elementPools: Record<OxySideBlowProductKey, Partial<Record<CopperElementKey, number>>>
  elementBalanceResiduals: OxyConstraintSolverResult['elementBalanceResiduals']
}

function buildElementPools(
  input: OxyConstraintSolverInput,
  config: OxySideBlowConstraintConfig
): Stage1Context {
  const blendMass = input.blendFeed.totalWeight
  const productMassGuess = Object.fromEntries(
    OXY_SIDE_BLOW_PRODUCT_KEYS.map((k) => [k, blendMass * 0.15])
  ) as Record<OxySideBlowProductKey, number>

  const elementPools: Record<OxySideBlowProductKey, Partial<Record<CopperElementKey, number>>> = {
    smeltingSlag: {},
    matte: {},
    flueGas: {},
    dust: {},
    fugitive: {},
    loss: {},
  }

  const wIterations = config.solverParams?.wPercentIterations ?? 40
  const constraintElements = config.elementDistributions.map((e) => e.element)
  const coveredFeedKeys = feedKeysCoveredByConstraints(constraintElements)

  for (let iter = 0; iter < wIterations; iter += 1) {
    for (const pk of OXY_SIDE_BLOW_PRODUCT_KEYS) {
      elementPools[pk] = {}
    }

    for (const entry of config.elementDistributions) {
      const feedMetalMass = constraintFeedMetalMass(entry.element, input.blendFeed)
      if (feedMetalMass <= 0) continue
      const alloc = allocateElementMassByRules(
        feedMetalMass,
        blendMass,
        entry,
        productMassGuess,
        config.variables
      )
      let allocatedSum = sumAllocated(alloc)
      const unallocated = Math.max(0, feedMetalMass - allocatedSum)
      if (unallocated > 1e-9) {
        const binding = resolveConstraintElementBinding(entry.element)
        const defaultProduct = DEFAULT_PRODUCT_FOR_ELEMENT[binding.poolKey] ?? 'smeltingSlag'
        alloc[defaultProduct] = (alloc[defaultProduct] ?? 0) + unallocated
      }
      for (const pk of OXY_SIDE_BLOW_PRODUCT_KEYS) {
        addMetalAllocationToProductPool(elementPools[pk], entry.element, alloc[pk] ?? 0)
      }
    }

    for (const element of COPPER_ELEMENT_KEYS) {
      if (coveredFeedKeys.has(element)) continue
      const feedMass = input.blendFeed.elementWeights[element] ?? 0
      if (feedMass <= 0) continue
      const defaultProduct = DEFAULT_PRODUCT_FOR_ELEMENT[element] ?? 'smeltingSlag'
      elementPools[defaultProduct][element] = (elementPools[defaultProduct][element] ?? 0) + feedMass
    }

    for (const pk of OXY_SIDE_BLOW_PRODUCT_KEYS) {
      const elSum = Object.values(elementPools[pk]).reduce((s, v) => s + (v ?? 0), 0)
      productMassGuess[pk] = Math.max(elSum * 1.05, productMassGuess[pk] * 0.7 + elSum * 0.3)
    }
  }

  const elementBalanceResiduals: NonNullable<OxyConstraintSolverResult['elementBalanceResiduals']> = []
  for (const entry of config.elementDistributions) {
    const binding = resolveConstraintElementBinding(entry.element)
    const feedCompound = input.blendFeed.elementWeights[binding.feedKey] ?? 0
    const feedMetal = feedCompound * binding.metalMassFraction
    if (feedMetal <= 0) continue
    const allocatedCompound = OXY_SIDE_BLOW_PRODUCT_KEYS.reduce(
      (s, pk) => s + (elementPools[pk][binding.poolKey] ?? 0),
      0
    )
    const allocatedMetal = allocatedCompound * binding.poolMetalFraction
    const residual = feedMetal - allocatedMetal
    if (Math.abs(residual) > feedMetal * 1e-4 + 1e-6) {
      elementBalanceResiduals.push({
        element: binding.feedKey,
        feed: feedCompound,
        allocated: allocatedCompound,
        residual: feedCompound - allocatedCompound,
      })
    }
  }

  for (const element of COPPER_ELEMENT_KEYS) {
    if (coveredFeedKeys.has(element)) continue
    const feedMass = input.blendFeed.elementWeights[element] ?? 0
    if (feedMass <= 0) continue
    const allocated = OXY_SIDE_BLOW_PRODUCT_KEYS.reduce((s, pk) => s + (elementPools[pk][element] ?? 0), 0)
    const residual = feedMass - allocated
    if (Math.abs(residual) > feedMass * 1e-4 + 1e-6) {
      elementBalanceResiduals.push({ element, feed: feedMass, allocated, residual })
    }
  }

  return { elementPools, elementBalanceResiduals }
}

/** Stage 1：按元素分配 W%/D% 规则分配元素到各产物，并联立物相 */
function runStage1(
  input: OxyConstraintSolverInput,
  config: OxySideBlowConstraintConfig
): { products: Record<OxySideBlowProductKey, OxyProductResult>; elementPools: Record<OxySideBlowProductKey, Partial<Record<CopperElementKey, number>>>; elementBalanceResiduals: OxyConstraintSolverResult['elementBalanceResiduals'] } {
  const blendMass = input.blendFeed.totalWeight
  const { elementPools, elementBalanceResiduals } = buildElementPools(input, config)
  const productMassGuess = Object.fromEntries(
    OXY_SIDE_BLOW_PRODUCT_KEYS.map((k) => {
      const elSum = Object.values(elementPools[k]).reduce((s, v) => s + (v ?? 0), 0)
      return [k, Math.max(elSum * 1.05, blendMass * 0.05)]
    })
  ) as Record<OxySideBlowProductKey, number>

  const gmc = config.variables?.GMC ?? 75
  const phaseState: Record<OxySideBlowProductKey, Record<string, number>> = {
    smeltingSlag: {},
    matte: {},
    flueGas: {},
    dust: {},
    fugitive: {},
    loss: {},
  }

  for (const pk of OXY_SIDE_BLOW_PRODUCT_KEYS) {
    const def = config.products[pk]
    if (pk === 'flueGas') {
      phaseState[pk] = solveFlueGasPhases(elementPools[pk], input, productMassGuess[pk])
    } else if (pk === 'fugitive') {
      const sMass = elementPools[pk]['S (硫)'] ?? 0
      phaseState[pk] = sMass > 0 ? { SO2: sMass * (MM.SO2 / atomicMass('S')) } : { SO2: 0 }
    } else if (pk === 'loss') {
      phaseState[pk] = solveLossPhases(elementPools[pk], productMassGuess[pk])
    } else if (pk === 'matte') {
      const base = solveProductPhasesFromElementPool(def.phases, elementPools[pk], productMassGuess[pk])
      phaseState[pk] = applyMatteGmcPhases(base, productMassGuess[pk], elementPools[pk], gmc)
    } else if (pk === 'smeltingSlag') {
      let phases = solveProductPhasesFromElementPool(def.phases, elementPools[pk], productMassGuess[pk])
      phases = ensureSlagFeOSiO2(phases, elementPools[pk])
      phaseState[pk] = phases
    } else {
      phaseState[pk] = solveProductPhasesFromElementPool(def.phases, elementPools[pk], productMassGuess[pk])
    }
  }

  const results = {} as Record<OxySideBlowProductKey, OxyProductResult>
  for (const pk of OXY_SIDE_BLOW_PRODUCT_KEYS) {
    const def = config.products[pk]
    results[pk] = buildProductResult(pk, def.name, def.phases, phaseState[pk])
  }
  return { products: results, elementPools, elementBalanceResiduals }
}

function productPhaseMap(product: OxyProductResult): Record<string, number> {
  return Object.fromEntries(product.phases.map((p) => [p.key, p.mass]))
}

function rebuildProduct(
  pk: OxySideBlowProductKey,
  config: OxySideBlowConstraintConfig,
  phases: Record<string, number>
): OxyProductResult {
  return buildProductResult(pk, config.products[pk].name, config.products[pk].phases, phases)
}

function closePhasesWithOtherOnly(
  phases: Record<string, number>,
  targetMass: number
): Record<string, number> {
  const next = { ...phases }
  const known = Object.entries(next)
    .filter(([key]) => key !== 'Other')
    .reduce((sum, [, value]) => sum + Math.max(0, value ?? 0), 0)
  next.Other = Math.max(0, targetMass - known)
  return next
}

function totalArsenicForRedistribution(
  state: Record<OxySideBlowProductKey, OxyProductResult>,
  input: OxyConstraintSolverInput
): number {
  const feedAs = input.blendFeed.elementWeights['As(砷)'] ?? 0
  if (feedAs > 0) return feedAs
  return OXY_SIDE_BLOW_PRODUCT_KEYS.reduce((sum, pk) => sum + (state[pk].elementMass['As(砷)'] ?? 0), 0)
}

function redistributeAsToGasAndDust(
  state: Record<OxySideBlowProductKey, OxyProductResult>,
  input: OxyConstraintSolverInput,
  config: OxySideBlowConstraintConfig,
  targetGasFraction: number
) {
  const totalAs = totalArsenicForRedistribution(state, input)
  const asFrac = COPPER_BUILTIN_PHASE_FRACTIONS.As2O3?.['As(砷)'] ?? 0
  if (totalAs <= 0 || asFrac <= 0) return
  const gasPhases = productPhaseMap(state.flueGas)
  const dustPhases = productPhaseMap(state.dust)
  const slagPhases = productPhaseMap(state.smeltingSlag)
  const mattePhases = productPhaseMap(state.matte)
  slagPhases.As2O3 = 0
  mattePhases.As2S3 = 0
  const gasAs = Math.max(0, Math.min(1, targetGasFraction)) * totalAs
  gasPhases.As2O3 = gasAs / asFrac
  dustPhases.As2O3 = (totalAs - gasAs) / asFrac
  state.smeltingSlag = rebuildProduct('smeltingSlag', config, slagPhases)
  state.matte = rebuildProduct('matte', config, mattePhases)
  state.flueGas = rebuildProduct('flueGas', config, gasPhases)
  state.dust = rebuildProduct('dust', config, dustPhases)
}

function dustMassTarget(input: OxyConstraintSolverInput, config: OxySideBlowConstraintConfig): number | null {
  const constraint = config.customConstraints.find(
    (c) => normalizeConstraintExpr(c.expr) === 'Output.烟气含尘/Input.混合铜精矿'
  )
  return constraint ? input.concentrateMass * constraint.target : null
}

function rebuildDustWithTargetMass(
  phases: Record<string, number>,
  input: OxyConstraintSolverInput,
  config: OxySideBlowConstraintConfig
): OxyProductResult {
  const targetMass = dustMassTarget(input, config)
  return rebuildProduct('dust', config, targetMass == null ? phases : closePhasesWithOtherOnly(phases, targetMass))
}

function applyCustomConstraintCorrections(
  state: Record<OxySideBlowProductKey, OxyProductResult>,
  input: OxyConstraintSolverInput,
  config: OxySideBlowConstraintConfig,
  elementPools: Record<OxySideBlowProductKey, Partial<Record<CopperElementKey, number>>>
): { state: Record<OxySideBlowProductKey, OxyProductResult>; input: OxyConstraintSolverInput } {
  let nextInput = input
  const gmc = config.variables?.GMC ?? 75
  let matteGmcApplied = false

  for (const c of config.customConstraints) {
    const expr = normalizeConstraintExpr(c.expr)
    switch (expr) {
      case 'Input.煤/Input.混合铜精矿':
        nextInput = applyInputOnlyConstraint(nextInput, c.expr, c.target)
        break
      case 'Input.加料口漏风/5.73': {
        nextInput = applyInputOnlyConstraint(nextInput, c.expr, c.target)
        break
      }
      case '(Input.二次风.O2/O)/((Input.混合铜精矿.CuFeS2.S/S/4)+(Input.混合铜精矿.FeS2.S/S/2)*0.7+Input.煤.C/C*0.7)': {
        nextInput = applyInputOnlyConstraint(nextInput, c.expr, c.target)
        break
      }
      case '((Input.空气.O2+Input.氧气.O2)/O*22.4)/(Input.空气+Input.氧气)':
        nextInput = applyInputOnlyConstraint(nextInput, c.expr, c.target)
        break
      case 'Output.熔炼出炉烟气.O2/(Input.空气.O2+Input.氧气.O2+Input.二次风.O2+Input.加料口漏风.O2)': {
        const totalO2In = totalInputOxygen(nextInput)
        if (totalO2In > 0) {
          const gasPhases = productPhaseMap(state.flueGas)
          gasPhases.O2 = totalO2In * c.target
          const known = Object.values(gasPhases).reduce((s, v) => s + v, 0)
          const targetMass = Math.max(state.flueGas.mass, known)
          state.flueGas = rebuildProduct(
            'flueGas',
            config,
            closePhasesToTargetMass(gasPhases, config.products.flueGas.phases, targetMass)
          )
        }
        break
      }
      case 'OutputE.熔炼渣.Fe/(OutputE.熔炼渣.Si/Si*SiO2)': {
        const slagPhases = ensureSlagFeOSiO2(
          productPhaseMap(state.smeltingSlag),
          elementPools.smeltingSlag,
          c.target
        )
        state.smeltingSlag = rebuildProduct('smeltingSlag', config, slagPhases)
        break
      }
      case 'Output.熔炼渣.Cu2S/Output.熔炼渣.Cu2O': {
        const phases = enforcePhaseRatio(productPhaseMap(state.smeltingSlag), 'Cu2S', 'Cu2O', c.target)
        state.smeltingSlag = rebuildProduct('smeltingSlag', config, phases)
        break
      }
      case 'Output.熔炼渣.Fe3O4/Output.熔炼渣': {
        const phases = enforcePhaseMassFraction(productPhaseMap(state.smeltingSlag), 'Fe3O4', c.target)
        state.smeltingSlag = rebuildProduct('smeltingSlag', config, phases)
        break
      }
      case 'Output.熔炼渣.Fe2SiO4/Output.熔炼渣.FeO': {
        const phases = enforcePhaseRatio(productPhaseMap(state.smeltingSlag), 'Fe2SiO4', 'FeO', c.target)
        state.smeltingSlag = rebuildProduct('smeltingSlag', config, phases)
        break
      }
      case 'Output.烟气含尘.Cu2S/Output.烟气含尘.Cu2O': {
        const phases = enforcePhaseRatio(productPhaseMap(state.dust), 'Cu2S', 'Cu2O', c.target)
        state.dust = rebuildProduct('dust', config, phases)
        break
      }
      case 'Output.烟气含尘.Fe3O4.Fe/Output.烟气含尘.Fe': {
        const phaseMap = productPhaseMap(state.dust)
        const totalFe = sumElementInPhases(phaseMap, 'Fe(铁)')
        const feFraction = COPPER_BUILTIN_PHASE_FRACTIONS.Fe3O4['Fe(铁)'] ?? 0
        if (totalFe > 0 && feFraction > 0) {
          phaseMap.Fe3O4 = (totalFe * c.target) / feFraction
          state.dust = rebuildProduct('dust', config, phaseMap)
        }
        break
      }
      case 'OutputE.白铜锍.S/((-0.125*GMC/100+0.292)*Output.白铜锍)':
      case 'OutputE.白铜锍.Fe/((-0.825*GMC/100+0.633)*Output.白铜锍)': {
        if (!matteGmcApplied) {
          const phases = applyMatteGmcPhases(
            productPhaseMap(state.matte),
            state.matte.mass,
            elementPools.matte,
            gmc
          )
          state.matte = rebuildProduct('matte', config, phases)
          matteGmcApplied = true
        }
        break
      }
      case 'Output.熔炼出炉烟气.As2O3.As/(Output.熔炼出炉烟气.As2O3.As+Output.烟气含尘.As2O3.As)': {
        redistributeAsToGasAndDust(state, nextInput, config, c.target)
        break
      }
      case 'Output.烟气含尘/Input.混合铜精矿': {
        const dustMass = nextInput.concentrateMass * c.target
        state.dust = rebuildProduct('dust', config, closePhasesWithOtherOnly(productPhaseMap(state.dust), dustMass))
        break
      }
      case 'Output.烟气含尘.PbO.Pb/Output.烟气含尘.PbS.Pb': {
        const phases = enforceElementRatio(productPhaseMap(state.dust), 'PbO', 'PbS', 'Pb(铅)', c.target)
        state.dust = rebuildDustWithTargetMass(phases, nextInput, config)
        break
      }
      case 'Output.烟气含尘.ZnO.Zn/Output.烟气含尘.ZnS.Zn': {
        const phases = enforceElementRatio(productPhaseMap(state.dust), 'ZnO', 'ZnS', 'Zn(锌)', c.target)
        state.dust = rebuildDustWithTargetMass(phases, nextInput, config)
        break
      }
      default:
        break
    }
  }

  return { state, input: nextInput }
}

function fuelRatioTarget(config: OxySideBlowConstraintConfig): number {
  const fuelConstraint = config.customConstraints.find((c) => normalizeConstraintExpr(c.expr) === 'Input.煤/Input.混合铜精矿')
  return fuelConstraint?.target ?? 0.13
}

function initializeInputFromHardTargets(
  input: OxyConstraintSolverInput,
  config: OxySideBlowConstraintConfig
): OxyConstraintSolverInput {
  const withFuel = applyFuelRatioTarget(input, fuelRatioTarget(config))
  return applyInputOnlyConstraintCorrections(withFuel, config)
}

function maxHardConstraintResidual(
  residuals: OxyConstraintSolverResult['constraintResiduals']
): number {
  return residuals.reduce((m, r) => Math.max(m, Math.abs(r.residual)), 0)
}

/** Stage 2：满足自定义约束（比值、质量分数等） */
function runStage2(
  stage1: ReturnType<typeof runStage1>,
  input: OxyConstraintSolverInput,
  config: OxySideBlowConstraintConfig
): {
  products: Record<OxySideBlowProductKey, OxyProductResult>
  converged: boolean
  residuals: OxyConstraintSolverResult['constraintResiduals']
  input: OxyConstraintSolverInput
} {
  const tolerance = config.solverParams?.tolerance ?? 1e-4
  const maxIter = config.solverParams?.newtonMaxIterations ?? 50
  let state = { ...stage1.products }
  let workingInput = input
  const elementPools = stage1.elementPools

  const buildSymbolTable = () => {
    const fuelElementMass = columnElementMass(workingInput.fuelColumn)
    const gasMass = Object.fromEntries(workingInput.airColumns.map((c) => [c.name, Math.max(0, c.weight)]))
    const gasElementMass = Object.fromEntries(workingInput.airColumns.map((c) => [c.name, columnElementMass(c)]))
    return buildConstraintSymbolTable({
      blendMass: workingInput.blendFeed.totalWeight,
      blendElementMass: workingInput.blendFeed.elementWeights,
      fuelMass: workingInput.fuelColumn.weight,
      fuelElementMass,
      concentrateMass: workingInput.concentrateMass,
      variables: config.variables,
      gasMass,
      gasElementMass,
      inputPhaseMass: workingInput.inputPhaseMass,
      productNames: OXY_PRODUCT_KEY_TO_CN,
      products: Object.fromEntries(
        OXY_SIDE_BLOW_PRODUCT_KEYS.map((pk) => [
          pk,
          {
            mass: state[pk].mass,
            phases: Object.fromEntries(state[pk].phases.map((p) => [p.key, p.mass])),
            elementMass: state[pk].elementMass,
          },
        ])
      ) as Record<OxySideBlowProductKey, { mass: number; phases: Record<string, number>; elementMass: Partial<Record<CopperElementKey, number>> }>,
    })
  }

  let residuals: OxyConstraintSolverResult['constraintResiduals'] = []
  let converged = false
  let prevHardResidual = Number.POSITIVE_INFINITY
  let stagnantRounds = 0

  for (let iter = 0; iter < maxIter; iter += 1) {
    const corrected = applyCustomConstraintCorrections(state, workingInput, config, elementPools)
    state = corrected.state
    workingInput = corrected.input

    const symbolTable = buildSymbolTable()
    residuals = config.customConstraints.map((c) => {
      const value = evaluateConstraintExprString(c.expr, symbolTable)
      return { expr: c.expr, value, target: c.target, residual: value - c.target, soft: isSoftTargetConstraint(c.expr) }
    })
    const hardResidual = maxHardConstraintResidual(residuals)
    if (hardResidual < tolerance) {
      converged = true
      break
    }
    if (hardResidual >= prevHardResidual - tolerance * 0.1) {
      stagnantRounds += 1
      if (stagnantRounds >= 5) break
    } else {
      stagnantRounds = 0
    }
    prevHardResidual = hardResidual
  }

  if (!converged) {
    const symbolTable = buildSymbolTable()
    residuals = config.customConstraints.map((c) => {
      const value = evaluateConstraintExprString(c.expr, symbolTable)
      return { expr: c.expr, value, target: c.target, residual: value - c.target, soft: isSoftTargetConstraint(c.expr) }
    })
    converged = maxHardConstraintResidual(residuals) < tolerance
  }

  for (const pk of OXY_SIDE_BLOW_PRODUCT_KEYS) {
    if (!verifyProductElementTotals(state[pk])) {
      const phases = Object.fromEntries(state[pk].phases.map((p) => [p.key, p.mass]))
      state[pk] = buildProductResult(pk, config.products[pk].name, config.products[pk].phases, phases)
    }
  }

  return { products: state, converged, residuals, input: workingInput }
}

export function solveOxySideBlowProducts(input: OxyConstraintSolverInput): OxyConstraintSolverResult {
  const config = input.config ?? loadOxySideBlowConstraints()
  const preparedInput = initializeInputFromHardTargets(input, config)
  const stage1 = runStage1(preparedInput, config)
  const stage2 = runStage2(stage1, preparedInput, config)

  const products = stage2.products
  const totalProductMass = OXY_SIDE_BLOW_PRODUCT_KEYS.reduce((s, k) => s + products[k].mass, 0)
  const gasWeights = Object.fromEntries(stage2.input.airColumns.map((c) => [c.name, c.weight]))
  const solventWeights = Object.fromEntries(stage2.input.solventColumns.map((c) => [c.name, c.weight]))

  const allProductsClosed = OXY_SIDE_BLOW_PRODUCT_KEYS.every((pk) => verifyProductElementTotals(products[pk]))
  const valid = stage2.converged && allProductsClosed

  return {
    valid,
    converged: stage2.converged,
    stage: stage2.converged ? 'complete' : 'stage2',
    message: valid
      ? undefined
      : stage2.converged
        ? '部分产物元素合计未闭合至 100%'
        : '产出约束未完全满足，请查看残差表并修正约束或输入后再回填',
    products,
    totalProductMass,
    recommended: {
      fuelWeight: stage2.input.fuelColumn.weight,
      solventWeights,
      gasWeights,
    },
    constraintResiduals: stage2.residuals,
    elementBalanceResiduals: stage1.elementBalanceResiduals,
  }
}

/** 校验各产物元素合计是否为 100%（质量分数） */
export function verifyProductElementTotals(product: OxyProductResult, tolerance = 0.5): boolean {
  const total = Object.values(product.composition).reduce((s, v) => s + (v ?? 0), 0)
  return Math.abs(total - 100) <= tolerance || product.mass <= 0
}

export { parseConstraintExpression, evaluateConstraintExprString }
