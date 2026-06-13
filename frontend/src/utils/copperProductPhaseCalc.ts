import type { CopperProductKey, CopperProductResult } from './copperProcessCalc'
import type { CopperElementKey } from './copperWorkflowCalc'
import { COMPOUND_MOLAR_MASS, atomicMass, oxideMassFromElement } from './atomicMass.ts'
import { COPPER_BUILTIN_PHASE_FRACTIONS } from './copperPhaseStoichiometry.ts'
import { solvePhaseDistribution } from './copperPhaseSolver.ts'

export type ProductPhaseRowKey = string
export type ProductPhasePercentMap = Partial<Record<ProductPhaseRowKey, number>>
export type ProductPhaseDraftMap = Partial<Record<ProductPhaseRowKey, string>>

import { sortCopperPhaseKeys } from './copperDisplayOrder.ts'

function sortProductPhaseRows(rows: string[]) {
  return sortCopperPhaseKeys(rows)
}

export const PRODUCT_PHASE_ROWS: Record<CopperProductKey, ProductPhaseRowKey[]> = {
  matte: sortProductPhaseRows(['Cu2S', 'FeS', 'Cu2O', 'Other']),
  slag: sortProductPhaseRows(['FeO', 'SiO2', 'CaO', 'Al2O3', 'Cu2O', 'PbO', 'As2O3', 'ZnO', 'Other']),
  gas: sortProductPhaseRows(['SO2', 'CO2', 'O2', 'N2', 'Other']),
  dust: sortProductPhaseRows(['As2O3', 'PbO', 'Sb2O3', 'ZnO', 'Other']),
  loss: ['Other'],
}

export const PRODUCT_PHASE_DISPLAY: Record<string, string> = {
  Cu2S: 'Cu₂S',
  FeS: 'FeS',
  Cu2O: 'Cu₂O',
  FeO: 'FeO',
  SiO2: 'SiO₂',
  CaO: 'CaO',
  Al2O3: 'Al₂O₃',
  PbO: 'PbO',
  As2O3: 'As₂O₃',
  Sb2O3: 'Sb₂O₃',
  ZnO: 'ZnO',
  SO2: 'SO₂',
  CO2: 'CO₂',
  O2: 'O₂',
  N2: 'N₂',
  Other: 'Other',
}

const MM = COMPOUND_MOLAR_MASS

function builtinPhaseSpecs(keys: string[]) {
  return keys
    .filter((key) => key !== 'Other' && COPPER_BUILTIN_PHASE_FRACTIONS[key])
    .map((key) => ({
      id: key,
      fractions: COPPER_BUILTIN_PHASE_FRACTIONS[key] ?? {},
    }))
}

const POOL_EXCLUDED_FROM_LINEAR_SOLVE = new Set<CopperElementKey>([
  'O(氧)',
  'C (碳)',
  'N(氮)',
  'Other(其他)',
])

export function elementPoolForPhaseSolve(
  elementWeights: Partial<Record<CopperElementKey, number>>
): Partial<Record<CopperElementKey, number>> {
  const pool: Partial<Record<CopperElementKey, number>> = {}
  for (const [element, weight] of Object.entries(elementWeights) as [CopperElementKey, number][]) {
    if (!Number.isFinite(weight) || weight <= 0) continue
    if (POOL_EXCLUDED_FROM_LINEAR_SOLVE.has(element)) continue
    pool[element] = weight
  }
  return pool
}

function elementPoolFromWeights(elementWeights: Partial<Record<CopperElementKey, number>>) {
  return elementPoolForPhaseSolve(elementWeights)
}

export function filterActiveProductPhaseKeys(
  phaseKeys: string[],
  pool: Partial<Record<CopperElementKey, number>>
): string[] {
  return phaseKeys.filter((key) => {
    if (key === 'Other') return false
    const fractions = COPPER_BUILTIN_PHASE_FRACTIONS[key] ?? {}
    return (Object.entries(fractions) as [CopperElementKey, number][]).some(
      ([element, fraction]) =>
        fraction > 0 && !POOL_EXCLUDED_FROM_LINEAR_SOLVE.has(element) && (pool[element] ?? 0) > 0
    )
  })
}

/** 烟气物相化学计量（S→SO₂、C→CO₂ 等） */
export function computeFlueGasPhaseMasses(params: {
  sulfurMass: number
  carbonMass: number
  oxygenMass: number
  nitrogenMass: number
  hydrogenMass?: number
  arsenicMass?: number
  mercuryMass?: number
  targetMass?: number
  retainedOxygenMass?: number
}): Record<string, number> {
  const phases: Record<string, number> = {
    SO2: oxideMassFromElement(params.sulfurMass, 'S', { S: 1, O: 2 }),
    SO3: 0,
    CO2: oxideMassFromElement(params.carbonMass, 'C', { C: 1, O: 2 }),
    O2: Math.max(0, params.retainedOxygenMass ?? params.oxygenMass * 0.15),
    N2: Math.max(0, params.nitrogenMass),
    H2O: oxideMassFromElement(params.hydrogenMass ?? 0, 'H', { H: 2, O: 1 }, 2),
    As2O3: oxideMassFromElement(params.arsenicMass ?? 0, 'As', { As: 2, O: 3 }, 2),
    Hg: Math.max(0, params.mercuryMass ?? 0),
  }
  const known = Object.values(phases).reduce((sum, value) => sum + value, 0)
  const target = Math.max(params.targetMass ?? 0, known)
  if (known <= 0) return phases
  if (Math.abs(target - known) < 1e-9) return phases
  const scale = target / known
  return Object.fromEntries(Object.entries(phases).map(([key, value]) => [key, value * scale]))
}

function solveProductPhaseMasses(
  phaseKeys: string[],
  elementWeights: Partial<Record<CopperElementKey, number>>,
  productMass: number
) {
  const pool = elementPoolFromWeights(elementWeights)
  const activeKeys = phaseKeys.filter((key) => {
    if (key === 'Other') return false
    const fractions = COPPER_BUILTIN_PHASE_FRACTIONS[key] ?? {}
    return (Object.entries(fractions) as [CopperElementKey, number][]).some(
      ([element, fraction]) =>
        fraction > 0 &&
        element !== 'O(氧)' &&
        element !== 'C (碳)' &&
        element !== 'N(氮)' &&
        element !== 'Other(其他)' &&
        (pool[element] ?? 0) > 0
    )
  })
  const solver = solvePhaseDistribution(builtinPhaseSpecs(activeKeys), pool)
  const comps: Record<string, number> = {}
  if (solver.valid) {
    for (const key of phaseKeys) {
      if (key === 'Other') continue
      comps[key] = Math.max(0, solver.amounts[key] ?? 0)
    }
  } else {
    for (const key of phaseKeys) {
      if (key === 'Other') continue
      comps[key] = 0
    }
  }
  const known = Object.values(comps).reduce((sum, value) => sum + value, 0)
  comps.Other = Math.max(0, productMass - known)
  if (Object.values(solver.residual ?? {}).some((value) => (value ?? 0) > 1e-6)) {
    const residualMass = Object.values(solver.residual ?? {}).reduce((sum, value) => sum + Math.max(0, value ?? 0), 0)
    comps.Other = Math.max(comps.Other ?? 0, residualMass)
  }
  return comps
}

function productPhaseTotal(phases: ProductPhasePercentMap, rows: ProductPhaseRowKey[]) {
  return rows.reduce((sum, key) => sum + Math.max(0, phases[key] ?? 0), 0)
}

function normalizeProductPhases(phases: ProductPhasePercentMap, rows: ProductPhaseRowKey[]): ProductPhasePercentMap {
  const total = productPhaseTotal(phases, rows)
  if (total <= 0) return Object.fromEntries(rows.map((key) => [key, 0]))
  return Object.fromEntries(rows.map((key) => [key, ((phases[key] ?? 0) / total) * 100]))
}

export function buildProductPhaseReviewRows(
  productKey: CopperProductKey,
  productMass: number,
  phases: ProductPhasePercentMap
): Array<{ key: string; label: string; pct: number; mass: number }> {
  return PRODUCT_PHASE_ROWS[productKey].map((key) => {
    const pct = phases[key] ?? 0
    return {
      key,
      label: PRODUCT_PHASE_DISPLAY[key] ?? key,
      pct,
      mass: (pct / 100) * Math.max(0, productMass),
    }
  })
}

export function calculateProductPhaseComposition(
  productResult: CopperProductResult,
  overrides: Partial<Record<CopperProductKey, ProductPhasePercentMap>> = {}
): Record<CopperProductKey, ProductPhasePercentMap> {
  const out = {} as Record<CopperProductKey, ProductPhasePercentMap>
  for (const key of Object.keys(PRODUCT_PHASE_ROWS) as CopperProductKey[]) {
    if (overrides[key]) {
      out[key] = normalizeProductPhases(overrides[key]!, PRODUCT_PHASE_ROWS[key])
      continue
    }
    const product = productResult.products[key]
    const mass = Math.max(0, product.mass)
    const ew = product.elementWeights
    const rows = PRODUCT_PHASE_ROWS[key]
    const comps: Record<string, number> = {}

    if (key === 'matte' && mass > 0) {
      const matteKeys = rows.filter((row) => row !== 'Other')
      Object.assign(comps, solveProductPhaseMasses(matteKeys, ew, mass))
    } else if (key === 'slag' && mass > 0) {
      const slagKeys = rows.filter((row) => row !== 'Other')
      Object.assign(comps, solveProductPhaseMasses(slagKeys, ew, mass))
    } else if (key === 'gas' && mass > 0) {
      comps.SO2 = oxideMassFromElement(ew['S (硫)'] ?? 0, 'S', { S: 1, O: 2 })
      comps.CO2 = oxideMassFromElement(ew['C (碳)'] ?? 0, 'C', { C: 1, O: 2 })
      comps.O2 = ew['O(氧)'] ?? 0
      comps.N2 = ew['N(氮)'] ?? 0
      const known = Object.values(comps).reduce((sum, value) => sum + value, 0)
      comps.Other = Math.max(0, mass - known)
    } else if (key === 'dust' && mass > 0) {
      comps.As2O3 = oxideMassFromElement(ew['As(砷)'] ?? 0, 'As', { As: 2, O: 3 }, 2) * 1.2
      comps.PbO = oxideMassFromElement(ew['Pb(铅)'] ?? 0, 'Pb', { Pb: 1, O: 1 }) * 1.2
      comps.Sb2O3 = oxideMassFromElement(ew['Sb(锑)'] ?? 0, 'Sb', { Sb: 2, O: 3 }, 2) * 1.2
      comps.ZnO = oxideMassFromElement(ew['Zn(锌)'] ?? 0, 'Zn', { Zn: 1, O: 1 }) * 1.2
      const known = Object.values(comps).reduce((sum, value) => sum + value, 0)
      comps.Other = Math.max(0, mass - known)
    } else if (key === 'loss') {
      comps.Other = mass
    }

    const pct = Object.fromEntries(
      rows.map((row) => [row, mass > 0 ? ((comps[row] ?? 0) / mass) * 100 : 0])
    ) as ProductPhasePercentMap
    out[key] = normalizeProductPhases(pct, rows)
  }
  return out
}

export function calculateGasVolumePercents(phases: ProductPhasePercentMap) {
  const so2 = (phases.SO2 ?? 0) / MM.SO2
  const co2 = (phases.CO2 ?? 0) / MM.CO2
  const o2 = (phases.O2 ?? 0) / MM.O2
  const n2 = (phases.N2 ?? 0) / MM.N2
  const other = (phases.Other ?? 0) / 28
  const total = so2 + co2 + o2 + n2 + other
  if (total <= 0) return { SO2: 0, CO2: 0, O2: 0, N2: 0, Other: 0 }
  return {
    SO2: (so2 / total) * 100,
    CO2: (co2 / total) * 100,
    O2: (o2 / total) * 100,
    N2: (n2 / total) * 100,
    Other: (other / total) * 100,
  }
}

const PHASE_TO_ELEMENT_MASS: Record<string, Partial<Record<CopperElementKey, (mass: number) => number>>> = {
  Cu2S: {
    'Cu(铜)': (m) => m * (COPPER_BUILTIN_PHASE_FRACTIONS.Cu2S['Cu(铜)'] ?? 0),
    'S (硫)': (m) => m * (COPPER_BUILTIN_PHASE_FRACTIONS.Cu2S['S (硫)'] ?? 0),
  },
  FeS: {
    'Fe(铁)': (m) => m * (COPPER_BUILTIN_PHASE_FRACTIONS.FeS['Fe(铁)'] ?? 0),
    'S (硫)': (m) => m * (COPPER_BUILTIN_PHASE_FRACTIONS.FeS['S (硫)'] ?? 0),
  },
  Cu2O: {
    'Cu(铜)': (m) => m * (COPPER_BUILTIN_PHASE_FRACTIONS.Cu2O['Cu(铜)'] ?? 0),
    'O(氧)': (m) => m * (COPPER_BUILTIN_PHASE_FRACTIONS.Cu2O['O(氧)'] ?? 0),
  },
  FeO: {
    'Fe(铁)': (m) => m * (COPPER_BUILTIN_PHASE_FRACTIONS.FeO['Fe(铁)'] ?? 0),
    'O(氧)': (m) => m * (COPPER_BUILTIN_PHASE_FRACTIONS.FeO['O(氧)'] ?? 0),
  },
  SiO2: { 'SiO₂(二氧化硅)': (m) => m },
  CaO: { 'CaO(氧化钙)': (m) => m },
  Al2O3: { 'Al₂O₃(三氧化二铝)': (m) => m },
  PbO: {
    'Pb(铅)': (m) => m * (COPPER_BUILTIN_PHASE_FRACTIONS.PbO['Pb(铅)'] ?? 0),
    'O(氧)': (m) => m * (COPPER_BUILTIN_PHASE_FRACTIONS.PbO['O(氧)'] ?? 0),
  },
  As2O3: {
    'As(砷)': (m) => m * (COPPER_BUILTIN_PHASE_FRACTIONS.As2O3['As(砷)'] ?? 0),
    'O(氧)': (m) => m * (COPPER_BUILTIN_PHASE_FRACTIONS.As2O3['O(氧)'] ?? 0),
  },
  Sb2O3: {
    'Sb(锑)': (m) => m * (COPPER_BUILTIN_PHASE_FRACTIONS.Sb2O3['Sb(锑)'] ?? 0),
    'O(氧)': (m) => m * (COPPER_BUILTIN_PHASE_FRACTIONS.Sb2O3['O(氧)'] ?? 0),
  },
  ZnO: {
    'Zn(锌)': (m) => m * (COPPER_BUILTIN_PHASE_FRACTIONS.ZnO['Zn(锌)'] ?? 0),
    'O(氧)': (m) => m * (COPPER_BUILTIN_PHASE_FRACTIONS.ZnO['O(氧)'] ?? 0),
  },
  SO2: {
    'S (硫)': (m) => m * (atomicMass('S') / MM.SO2),
    'O(氧)': (m) => m * ((2 * atomicMass('O')) / MM.SO2),
  },
  CO2: {
    'C (碳)': (m) => m * (atomicMass('C') / MM.CO2),
    'O(氧)': (m) => m * ((2 * atomicMass('O')) / MM.CO2),
  },
  O2: { 'O(氧)': (m) => m },
  N2: { 'N(氮)': (m) => m },
}

export function deriveProductElementsFromPhases(
  productKey: CopperProductKey,
  phases: ProductPhasePercentMap,
  productMass: number
) {
  const rows = PRODUCT_PHASE_ROWS[productKey]
  const normalized = normalizeProductPhases(phases, rows)
  const elementWeights = {} as Record<CopperElementKey, number>
  for (const row of rows) {
    const pct = normalized[row] ?? 0
    const phaseMass = (pct / 100) * productMass
    const mapping = PHASE_TO_ELEMENT_MASS[row]
    if (!mapping) continue
    for (const [element, fn] of Object.entries(mapping) as [CopperElementKey, (mass: number) => number][]) {
      elementWeights[element] = (elementWeights[element] ?? 0) + fn(phaseMass)
    }
  }
  const mass = Math.max(productMass, Object.values(elementWeights).reduce((sum, value) => sum + value, 0))
  const composition = Object.fromEntries(
    Object.entries(elementWeights).map(([element, weight]) => [element, mass > 0 ? (weight / mass) * 100 : 0])
  ) as Partial<Record<CopperElementKey, number>>
  return { elementWeights, composition, mass }
}

export function parseProductPhaseDraftMap(drafts: ProductPhaseDraftMap, rows: ProductPhaseRowKey[]): ProductPhasePercentMap {
  return Object.fromEntries(
    rows.map((key) => {
      const text = drafts[key]?.trim() ?? ''
      const value = text === '' ? 0 : Number(text)
      return [key, Number.isFinite(value) ? Math.max(0, value) : 0]
    })
  )
}

export function isProductPhaseColumnValid(phases: ProductPhasePercentMap, productKey: CopperProductKey, tolerance = 0.02) {
  const total = productPhaseTotal(phases, PRODUCT_PHASE_ROWS[productKey])
  return Math.abs(total - 100) <= tolerance
}
