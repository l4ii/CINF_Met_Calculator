import type { CopperProductKey, CopperProductResult } from './copperProcessCalc'
import type { CopperElementKey } from './copperWorkflowCalc'

export type ProductPhaseRowKey = string
export type ProductPhasePercentMap = Partial<Record<ProductPhaseRowKey, number>>
export type ProductPhaseDraftMap = Partial<Record<ProductPhaseRowKey, string>>

export const PRODUCT_PHASE_ROWS: Record<CopperProductKey, ProductPhaseRowKey[]> = {
  matte: ['Cu2S', 'FeS', 'Cu2O', 'Other'],
  slag: ['FeO', 'SiO2', 'CaO', 'Al2O3', 'Cu2O', 'PbO', 'As2O3', 'ZnO', 'Other'],
  gas: ['SO2', 'CO2', 'O2', 'N2', 'Other'],
  dust: ['As2O3', 'PbO', 'Sb2O3', 'ZnO', 'Other'],
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

const MOLAR = {
  Cu: 63.546,
  Fe: 55.845,
  S: 32.06,
  Si: 28.085,
  Ca: 40.078,
  Al: 26.982,
  Pb: 207.2,
  As: 74.922,
  Sb: 121.76,
  Zn: 65.38,
  C: 12.011,
  O: 16,
  N: 14.01,
  Cu2S: 159.16,
  FeS: 87.91,
  Cu2O: 143.09,
  FeO: 71.844,
  SiO2: 60.084,
  CaO: 56.077,
  Al2O3: 101.961,
  PbO: 223.2,
  As2O3: 197.841,
  Sb2O3: 291.52,
  ZnO: 81.38,
  SO2: 64.066,
  CO2: 44.01,
  O2: 32,
  N2: 28.02,
}

function oxideMass(elementMass: number, elementMolar: number, oxideMolar: number, elementCount = 1) {
  if (elementMass <= 0) return 0
  return elementMass * (oxideMolar / (elementCount * elementMolar))
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
      const cu = ew['Cu(铜)'] ?? 0
      const fe = ew['Fe(铁)'] ?? 0
      const s = ew['S (硫)'] ?? 0
      const cu2sMass = Math.min(oxideMass(cu, MOLAR.Cu, MOLAR.Cu2S, 2), oxideMass(s, MOLAR.S, MOLAR.Cu2S, 1))
      const fesMass = Math.min(oxideMass(fe, MOLAR.Fe, MOLAR.FeS, 1), Math.max(0, s - (cu2sMass * (32.066 / 159.16))))
      const cu2oMass = Math.max(0, oxideMass(cu, MOLAR.Cu, MOLAR.Cu2O, 2) - cu2sMass)
      comps.Cu2S = cu2sMass
      comps.FeS = fesMass
      comps.Cu2O = cu2oMass
      comps.Other = Math.max(0, mass - cu2sMass - fesMass - cu2oMass)
    } else if (key === 'slag' && mass > 0) {
      comps.FeO = oxideMass(ew['Fe(铁)'] ?? 0, MOLAR.Fe, MOLAR.FeO, 1)
      comps.SiO2 = oxideMass(ew['Si(硅)'] ?? 0, MOLAR.Si, MOLAR.SiO2, 1)
      comps.CaO = oxideMass(ew['Ca(钙)'] ?? 0, MOLAR.Ca, MOLAR.CaO, 1)
      comps.Al2O3 = oxideMass(ew['Al(铝)'] ?? 0, MOLAR.Al, MOLAR.Al2O3, 2)
      comps.Cu2O = oxideMass(ew['Cu(铜)'] ?? 0, MOLAR.Cu, MOLAR.Cu2O, 2)
      comps.PbO = oxideMass(ew['Pb(铅)'] ?? 0, MOLAR.Pb, MOLAR.PbO, 1)
      comps.As2O3 = oxideMass(ew['As(砷)'] ?? 0, MOLAR.As, MOLAR.As2O3, 2)
      comps.ZnO = oxideMass(ew['Zn(锌)'] ?? 0, MOLAR.Zn, MOLAR.ZnO, 1)
      const known = Object.values(comps).reduce((sum, value) => sum + value, 0)
      comps.Other = Math.max(0, mass - known)
    } else if (key === 'gas' && mass > 0) {
      comps.SO2 = oxideMass(ew['S (硫)'] ?? 0, MOLAR.S, MOLAR.SO2, 1)
      comps.CO2 = oxideMass(ew['C (碳)'] ?? 0, MOLAR.C, MOLAR.CO2, 1)
      comps.O2 = oxideMass(ew['O (氧)'] ?? 0, MOLAR.O, MOLAR.O2, 2)
      comps.N2 = oxideMass(ew['N (氮)'] ?? 0, MOLAR.N, MOLAR.N2, 2)
      const known = Object.values(comps).reduce((sum, value) => sum + value, 0)
      comps.Other = Math.max(0, mass - known)
    } else if (key === 'dust' && mass > 0) {
      comps.As2O3 = oxideMass(ew['As(砷)'] ?? 0, MOLAR.As, MOLAR.As2O3, 2) * 1.2
      comps.PbO = oxideMass(ew['Pb(铅)'] ?? 0, MOLAR.Pb, MOLAR.PbO, 1) * 1.2
      comps.Sb2O3 = oxideMass(ew['Sb(锑)'] ?? 0, MOLAR.Sb, MOLAR.Sb2O3, 2) * 1.2
      comps.ZnO = oxideMass(ew['Zn(锌)'] ?? 0, MOLAR.Zn, MOLAR.ZnO, 1) * 1.2
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
  const so2 = (phases.SO2 ?? 0) / MOLAR.SO2
  const co2 = (phases.CO2 ?? 0) / MOLAR.CO2
  const o2 = (phases.O2 ?? 0) / MOLAR.O2
  const n2 = (phases.N2 ?? 0) / MOLAR.N2
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
  Cu2S: { 'Cu(铜)': (m) => m * ((2 * MOLAR.Cu) / MOLAR.Cu2S), 'S (硫)': (m) => m * (MOLAR.S / MOLAR.Cu2S) },
  FeS: { 'Fe(铁)': (m) => m * (MOLAR.Fe / MOLAR.FeS), 'S (硫)': (m) => m * (MOLAR.S / MOLAR.FeS) },
  Cu2O: { 'Cu(铜)': (m) => m * ((2 * MOLAR.Cu) / MOLAR.Cu2O), 'O (氧)': (m) => m * ((2 * MOLAR.O) / MOLAR.Cu2O) },
  FeO: { 'Fe(铁)': (m) => m * (MOLAR.Fe / MOLAR.FeO), 'O (氧)': (m) => m * (MOLAR.O / MOLAR.FeO) },
  SiO2: { 'Si(硅)': (m) => m * (MOLAR.Si / MOLAR.SiO2), 'O (氧)': (m) => m * ((2 * MOLAR.O) / MOLAR.SiO2) },
  CaO: { 'Ca(钙)': (m) => m * (MOLAR.Ca / MOLAR.CaO), 'O (氧)': (m) => m * (MOLAR.O / MOLAR.CaO) },
  Al2O3: { 'Al(铝)': (m) => m * ((2 * MOLAR.Al) / MOLAR.Al2O3), 'O (氧)': (m) => m * ((3 * MOLAR.O) / MOLAR.Al2O3) },
  PbO: { 'Pb(铅)': (m) => m * (MOLAR.Pb / MOLAR.PbO), 'O (氧)': (m) => m * (MOLAR.O / MOLAR.PbO) },
  As2O3: { 'As(砷)': (m) => m * ((2 * MOLAR.As) / MOLAR.As2O3), 'O (氧)': (m) => m * ((3 * MOLAR.O) / MOLAR.As2O3) },
  Sb2O3: { 'Sb(锑)': (m) => m * ((2 * MOLAR.Sb) / MOLAR.Sb2O3), 'O (氧)': (m) => m * ((3 * MOLAR.O) / MOLAR.Sb2O3) },
  ZnO: { 'Zn(锌)': (m) => m * (MOLAR.Zn / MOLAR.ZnO), 'O (氧)': (m) => m * (MOLAR.O / MOLAR.ZnO) },
  SO2: { 'S (硫)': (m) => m * (MOLAR.S / MOLAR.SO2), 'O (氧)': (m) => m * ((2 * MOLAR.O) / MOLAR.SO2) },
  CO2: { 'C (碳)': (m) => m * (MOLAR.C / MOLAR.CO2), 'O (氧)': (m) => m * ((2 * MOLAR.O) / MOLAR.CO2) },
  O2: { 'O (氧)': (m) => m },
  N2: { 'N (氮)': (m) => m },
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
