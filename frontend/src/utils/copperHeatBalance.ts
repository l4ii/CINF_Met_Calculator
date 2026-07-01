import { COMPOUND_MOLAR_MASS, atomicMass, compoundMolarMass } from './atomicMass.ts'
import type { OxyConstraintSolverResult } from './copperConstraintSolver.ts'
import type { OxySideBlowProductKey } from './copperConstraintConfig.ts'
import type { CopperFuelMaterial } from './copperProcessCalc.ts'
import { materialWaterWeight, type CopperMaterialColumn } from './copperWorkflowCalc.ts'

export type HeatBalanceProductTemperatureKey =
  | 'smeltingSlag'
  | 'matte'
  | 'flueGas'
  | 'dust'
  | 'fugitive'
  | 'loss'

export interface CopperHeatBalanceTemperatures {
  feed: number
  smeltingSlag: number
  matte: number
  flueGas: number
  dust: number
  fugitive: number
  loss: number
}

export interface CopperHeatBalanceSourceMaterial {
  id: string
  name: string
  kind: CopperMaterialColumn['kind']
  airRole?: CopperMaterialColumn['airRole']
  dryWeight: number
  waterWeight: number
  phases: Record<string, number>
}

export interface CopperHeatBalanceInput {
  inputMaterials: CopperHeatBalanceSourceMaterial[]
  products: OxyConstraintSolverResult | null
  fuel: CopperFuelMaterial
  temperatures: CopperHeatBalanceTemperatures
  heatLossMJh: number
  otherHeatMJh: number
}

export interface HeatReactionTerm {
  formula: string
  reactants: Record<string, number>
  products: Record<string, number>
  limitingPhase: string
  extentKmolh: number
  reactionHeatKJmol: number
  heatMJh: number
  note?: string
}

export interface HeatFlowRow {
  type: 'physical' | 'chemical' | 'loss'
  material: string
  temperature: number | null
  heatMJh: number
  percent: number
}

export interface HeatComponentRow {
  section: string
  component: string
  massTh: number
  temperature: number | null
  enthalpy25KJmol: number | null
  enthalpyTKJmol: number | null
  heatMJh: number
}

export interface CopperHeatBalanceResult {
  equations: HeatReactionTerm[]
  heatIncomeRows: HeatFlowRow[]
  heatExpenditureRows: HeatFlowRow[]
  inputPhysicalRows: HeatComponentRow[]
  outputPhysicalRows: HeatComponentRow[]
  inputPhysicalHeatMJh: number
  outputPhysicalHeatMJh: number
  chemicalHeatMJh: number
  heatLossMJh: number
  otherHeatMJh: number
  heatDeficitMJh: number
  requiredFuelWeight: number
  fuelEffectiveHeatMJh: number
  balanceAfterFuelMJh: number
  fuelHeatMJt: number
}

type EnthalpyRecord = {
  h25: number
  h1300?: number
  h1350?: number
}

type ReactionDefinition = {
  reactants: Record<string, number>
  products: Record<string, number>
  limitingPhase: string
  note?: string
}

const PRODUCT_KEY_TO_TEMPERATURE: Record<OxySideBlowProductKey, HeatBalanceProductTemperatureKey> = {
  smeltingSlag: 'smeltingSlag',
  matte: 'matte',
  flueGas: 'flueGas',
  dust: 'dust',
  fugitive: 'fugitive',
  loss: 'loss',
}

const INPUT_STANDARD_ENTHALPY_KJ_MOL: Record<string, number> = {
  SiO2: -910.879,
  CaO: -634.935,
  MgO: -601.614,
  Fe: 0,
  C: 18.54,
  H: 218.004,
  S: 0,
  N: 472.69,
  O: 249.18,
  Fe2O3: -823.02,
  CuFeS2: -190.377,
  CuS: -56.001,
  Cu2S: -79.498,
  FeS2: -170.304,
  FeS: -101.674,
  CaCO3: -1206.629,
  MgCO3: -1096.026,
  Al2O3: -1675.732,
  PbS: -99.466,
  ZnS: -203.005,
  NiS: -87.866,
  Se: 0,
  Bi2S3: -143.105,
  Sb2S3: -205.021,
  As2S3: -92.702,
  Hg: 0,
  Cd: 0,
  Au: 0,
  Ag: 0,
  CuSO4: -770,
  Cu: 0,
  Sn: 0,
  Te: 0,
  H2O: -285.837,
  O2: 0,
  N2: 0,
}

const PHASE_ENTHALPY_KJ_MOL: Record<string, EnthalpyRecord> = {
  Cu2S: { h25: -79.498, h1300: 46.408, h1350: 50.592 },
  Cu2O: { h25: -170.604, h1300: 2.006, h1350: 2.006 },
  FeS: { h25: -101.674, h1300: 15.123, h1350: 18.251 },
  FeO: { h25: -267.276, h1300: -189.916, h1350: -189.916 },
  Fe3O4: { h25: -1118.41, h1300: -856.488, h1350: -846.525 },
  As2O3: { h25: -654.812, h1300: -441.086, h1350: -441.086 },
  PbO: { h25: -218.067, h1300: -116.124, h1350: -116.124 },
  ZnO: { h25: -350.508, h1300: -282.732, h1350: -282.732 },
  NiO: { h25: -239.706, h1300: -166.652, h1350: -166.652 },
  SeO2: { h25: -225.505, h1300: -81.353, h1350: -81.353 },
  Bi2O3: { h25: -578.024, h1300: -323.167, h1350: -323.167 },
  Sb2O3: { h25: -708.564, h1300: -437.15, h1350: -437.15 },
  Fe2SiO4: { h25: -1479.147, h1350: -1143.099 },
  CaSiO3: { h25: -1634.979, h1350: -1475.585 },
  MgSiO3: { h25: -1548.535, h1350: -1391.168 },
  '3Al2O3•2SiO2': { h25: -6819.372, h1350: -6169.136 },
  SnO: { h25: -280.715, h1350: -177.883 },
  SiO2: { h25: -910.879, h1350: -818.744 },
  Cd: { h25: 0, h1300: 43.531, h1350: 45.026 },
  Au: { h25: 0, h1300: 49.086, h1350: 50.636 },
  Ag: { h25: 0, h1300: 49.053, h1350: 50.727 },
  Te: { h25: 0, h1300: 57.551, h1350: 59.179 },
  Ni: { h25: 0, h1300: 41.792 },
  Pb: { h25: 0, h1300: 41.847 },
  Zn: { h25: 0, h1300: 45.809 },
  As2S3: { h25: -92.702, h1300: 153.945 },
  Se: { h25: 0, h1300: 48.407 },
  Bi: { h25: 0, h1300: 46.54 },
  Sb: { h25: 0, h1300: 57.541 },
  Sn: { h25: 0, h1300: 43.298 },
  SO2: { h25: -296.82, h1350: -226.265 },
  SO3: { h25: -395.774, h1350: -298.322 },
  CO2: { h25: -393.515, h1350: -324.555 },
  O2: { h25: 0, h1350: 45.134 },
  N2: { h25: 0, h1350: 42.718 },
  H2O: { h25: -285.837, h1350: -140.471 },
  Hg: { h25: 0 },
  PbS: { h25: -99.466, h1350: 25.015 },
  ZnS: { h25: -203.005, h1350: -132.345 },
  CaO: { h25: -634.935, h1350: -567.766 },
  MgO: { h25: -601.614, h1350: -535.989 },
  Al2O3: { h25: -1675.732, h1350: -1516.891 },
  Cu: { h25: 0, h1350: 51.24 },
  S: { h25: 0, h1350: 45.09 },
}

const REACTION_DEFINITIONS: ReactionDefinition[] = [
  {
    reactants: { CuFeS2: 2, O2: 4 },
    products: { Cu2S: 1, FeO: 2, SO2: 3 },
    limitingPhase: 'CuFeS2',
  },
  {
    reactants: { Cu2S: 2, O2: 3 },
    products: { Cu2O: 2, SO2: 2 },
    limitingPhase: 'Cu2S',
  },
  {
    reactants: { FeS2: 2, O2: 5 },
    products: { FeO: 2, SO2: 4 },
    limitingPhase: 'FeS2',
  },
  {
    reactants: { FeS: 2, O2: 3 },
    products: { FeO: 2, SO2: 2 },
    limitingPhase: 'FeS',
  },
  {
    reactants: { CaCO3: 1 },
    products: { CaO: 1, CO2: 1 },
    limitingPhase: 'CaCO3',
  },
  {
    reactants: { MgCO3: 1 },
    products: { MgO: 1, CO2: 1 },
    limitingPhase: 'MgCO3',
  },
  {
    reactants: { PbS: 2, O2: 3 },
    products: { PbO: 2, SO2: 2 },
    limitingPhase: 'PbS',
  },
  {
    reactants: { ZnS: 2, O2: 3 },
    products: { ZnO: 2, SO2: 2 },
    limitingPhase: 'ZnS',
  },
  {
    reactants: { NiS: 2, O2: 3 },
    products: { NiO: 2, SO2: 2 },
    limitingPhase: 'NiS',
  },
  {
    reactants: { Se: 1, O2: 1 },
    products: { SeO2: 1 },
    limitingPhase: 'Se',
  },
  {
    reactants: { Bi2S3: 2, O2: 9 },
    products: { Bi2O3: 2, SO2: 6 },
    limitingPhase: 'Bi2S3',
    note: '按投入表 Bi2S3 修正用户草稿中的 Bi2O3。',
  },
  {
    reactants: { Sb2S3: 2, O2: 9 },
    products: { Sb2O3: 2, SO2: 6 },
    limitingPhase: 'Sb2S3',
    note: '投入表含 Sb2S3，产出烟尘/熔渣含 Sb2O3，因此补列锑的氧化反应。',
  },
  {
    reactants: { As2S3: 2, O2: 9 },
    products: { As2O3: 2, SO2: 6 },
    limitingPhase: 'As2S3',
    note: '按投入表 As2S3 修正用户草稿中的 As2O3。',
  },
]

export const COPPER_HEAT_BALANCE_REACTION_EQUATIONS = REACTION_DEFINITIONS.map((definition) => ({
  formula: formatReactionFormula(definition.reactants, definition.products),
  note: definition.note,
}))

function formatCoefficient(value: number) {
  return Math.abs(value - 1) < 1e-12 ? '' : `${Number(value.toFixed(8)).toString()} `
}

function formatFormulaParts(parts: Record<string, number>) {
  return Object.entries(parts)
    .filter(([, coefficient]) => coefficient > 0)
    .map(([phase, coefficient]) => `${formatCoefficient(coefficient)}${phase}`)
    .join(' + ')
}

function formatReactionFormula(reactants: Record<string, number>, products: Record<string, number>) {
  return `${formatFormulaParts(reactants)} = ${formatFormulaParts(products)}`
}

function phaseMolarMass(phase: string) {
  if (phase in COMPOUND_MOLAR_MASS) return COMPOUND_MOLAR_MASS[phase as keyof typeof COMPOUND_MOLAR_MASS]
  if (phase === 'SO3') return compoundMolarMass({ S: 1, O: 3 })
  if (phase === 'Fe2SiO4') return compoundMolarMass({ Fe: 2, Si: 1, O: 4 })
  if (phase === 'CaSiO3') return compoundMolarMass({ Ca: 1, Si: 1, O: 3 })
  if (phase === 'MgSiO3') return compoundMolarMass({ Mg: 1, Si: 1, O: 3 })
  if (phase === '3Al2O3•2SiO2') return compoundMolarMass({ Al: 6, Si: 2, O: 13 })
  if (phase === 'SnO') return compoundMolarMass({ Sn: 1, O: 1 })
  if (phase === 'NiO') return compoundMolarMass({ Ni: 1, O: 1 })
  if (phase === 'SeO2') return compoundMolarMass({ Se: 1, O: 2 })
  if (phase === 'Bi2O3') return compoundMolarMass({ Bi: 2, O: 3 })
  if (phase === 'NiS') return compoundMolarMass({ Ni: 1, S: 1 })
  if (phase === 'Hg') return atomicMass('Hg')
  if (phase === 'Cd') return atomicMass('Cd')
  if (phase === 'Au') return atomicMass('Au')
  if (phase === 'Ag') return atomicMass('Ag')
  if (phase === 'Te') return atomicMass('Te')
  if (phase === 'Ni') return atomicMass('Ni')
  if (phase === 'Pb') return atomicMass('Pb')
  if (phase === 'Zn') return atomicMass('Zn')
  if (phase === 'Se') return atomicMass('Se')
  if (phase === 'Bi') return atomicMass('Bi')
  if (phase === 'Sb') return atomicMass('Sb')
  if (phase === 'Sn') return atomicMass('Sn')
  if (phase === 'H') return atomicMass('H')
  if (phase === 'O') return atomicMass('O')
  if (phase === 'N') return atomicMass('N')
  if (phase === 'C') return atomicMass('C')
  if (phase === 'S') return atomicMass('S')
  if (phase === 'Fe') return atomicMass('Fe')
  if (phase === 'Cu') return atomicMass('Cu')
  return 0
}

function enthalpy25(phase: string) {
  return PHASE_ENTHALPY_KJ_MOL[phase]?.h25 ?? INPUT_STANDARD_ENTHALPY_KJ_MOL[phase] ?? null
}

function enthalpyAtTemperature(phase: string, temperature: number) {
  const record = PHASE_ENTHALPY_KJ_MOL[phase]
  if (!record) return null
  if (temperature <= 25) return record.h25
  const low = record.h1300
  const high = record.h1350
  if (low != null && high != null) {
    if (temperature <= 1300) {
      return record.h25 + ((low - record.h25) * (temperature - 25)) / (1300 - 25)
    }
    return low + ((high - low) * (temperature - 1300)) / (1350 - 1300)
  }
  if (high != null) {
    return record.h25 + ((high - record.h25) * (temperature - 25)) / (1350 - 25)
  }
  if (low != null) {
    return record.h25 + ((low - record.h25) * (temperature - 25)) / (1300 - 25)
  }
  return record.h25
}

function heatFromEnthalpyDeltaMJh(massTh: number, phase: string, temperature: number) {
  const h25 = enthalpy25(phase)
  const ht = enthalpyAtTemperature(phase, temperature)
  const molarMass = phaseMolarMass(phase)
  if (h25 == null || ht == null || molarMass <= 0 || massTh <= 0) return 0
  return ((massTh * 1000) / molarMass) * (ht - h25)
}

function standardFormationHeat(phase: string) {
  return INPUT_STANDARD_ENTHALPY_KJ_MOL[phase] ?? PHASE_ENTHALPY_KJ_MOL[phase]?.h25 ?? 0
}

function reactionHeatKJmol(definition: ReactionDefinition) {
  const productHeat = Object.entries(definition.products).reduce(
    (sum, [phase, coefficient]) => sum + coefficient * standardFormationHeat(phase),
    0
  )
  const reactantHeat = Object.entries(definition.reactants).reduce(
    (sum, [phase, coefficient]) => sum + coefficient * standardFormationHeat(phase),
    0
  )
  return productHeat - reactantHeat
}

function emptyMaterialPhaseRows(material: CopperHeatBalanceSourceMaterial): HeatComponentRow[] {
  return Object.entries(material.phases)
    .filter(([phase, pct]) => phase !== 'Other' && phaseMolarMass(phase) > 0 && pct > 0)
    .map(([phase, pct]) => ({
      section: material.name,
      component: phase,
      massTh: (Math.max(0, pct) / 100) * Math.max(0, material.dryWeight),
      temperature: null,
      enthalpy25KJmol: enthalpy25(phase),
      enthalpyTKJmol: null,
      heatMJh: 0,
    }))
}

function materialPhaseRows(material: CopperHeatBalanceSourceMaterial, temperature: number): HeatComponentRow[] {
  return emptyMaterialPhaseRows(material).map((row) => ({
    ...row,
    temperature,
    enthalpyTKJmol: enthalpyAtTemperature(row.component, temperature),
    heatMJh: heatFromEnthalpyDeltaMJh(row.massTh, row.component, temperature),
  }))
}

function waterRows(material: CopperHeatBalanceSourceMaterial, temperature: number): HeatComponentRow[] {
  if (material.waterWeight <= 0) return []
  return [{
    section: `${material.name}含水`,
    component: 'H2O',
    massTh: material.waterWeight,
    temperature,
    enthalpy25KJmol: enthalpy25('H2O'),
    enthalpyTKJmol: enthalpyAtTemperature('H2O', temperature),
    heatMJh: heatFromEnthalpyDeltaMJh(material.waterWeight, 'H2O', temperature),
  }]
}

function materialPhysicalRows(material: CopperHeatBalanceSourceMaterial, feedTemperature: number): HeatComponentRow[] {
  const temperature = material.kind === 'gas' || material.airRole ? 25 : feedTemperature
  const phaseRows = materialPhaseRows(material, temperature)
  return [...phaseRows, ...waterRows(material, temperature)]
}

function phaseMassToPercent(phases: Record<string, number>, dryWeight: number) {
  if (dryWeight <= 0) return {}
  return Object.fromEntries(Object.entries(phases).map(([key, mass]) => [key, (Math.max(0, mass) / dryWeight) * 100]))
}

export function sourceMaterialFromColumn(
  material: CopperMaterialColumn,
  phases: Record<string, number>
): CopperHeatBalanceSourceMaterial {
  return {
    id: material.id,
    name: material.name,
    kind: material.kind,
    airRole: material.airRole,
    dryWeight: Math.max(0, material.weight),
    waterWeight: materialWaterWeight(material),
    phases,
  }
}

function calculateReactionTerms(inputMaterials: CopperHeatBalanceSourceMaterial[]) {
  const phaseMasses: Record<string, number> = {}
  for (const material of inputMaterials) {
    for (const [phase, pct] of Object.entries(material.phases)) {
      if (phase === 'Other' || pct <= 0 || material.dryWeight <= 0) continue
      phaseMasses[phase] = (phaseMasses[phase] ?? 0) + (Math.max(0, pct) / 100) * Math.max(0, material.dryWeight)
    }
  }

  return REACTION_DEFINITIONS.map((definition): HeatReactionTerm => {
    const phaseMass = phaseMasses[definition.limitingPhase] ?? 0
    const molarMass = phaseMolarMass(definition.limitingPhase)
    const coefficient = definition.reactants[definition.limitingPhase] ?? 1
    const extentKmolh = molarMass > 0 && coefficient > 0 ? (phaseMass * 1000) / molarMass / coefficient : 0
    const dH = reactionHeatKJmol(definition)
    return {
      formula: formatReactionFormula(definition.reactants, definition.products),
      reactants: definition.reactants,
      products: definition.products,
      limitingPhase: definition.limitingPhase,
      extentKmolh,
      reactionHeatKJmol: dH,
      heatMJh: -extentKmolh * dH,
      note: definition.note,
    }
  })
}

function outputProductRows(
  products: OxyConstraintSolverResult | null,
  temperatures: CopperHeatBalanceTemperatures
): HeatComponentRow[] {
  if (!products?.valid) return []
  const rows: HeatComponentRow[] = []
  for (const product of Object.values(products.products)) {
    const temperatureKey = PRODUCT_KEY_TO_TEMPERATURE[product.key]
    const temperature = temperatures[temperatureKey]
    for (const phase of product.phases) {
      if (phase.key === 'Other' || phase.mass <= 0) continue
      rows.push({
        section: product.name,
        component: phase.key,
        massTh: phase.mass,
        temperature,
        enthalpy25KJmol: enthalpy25(phase.key),
        enthalpyTKJmol: enthalpyAtTemperature(phase.key, temperature),
        heatMJh: heatFromEnthalpyDeltaMJh(phase.mass, phase.key, temperature),
      })
    }
  }
  return rows
}

function sumHeat(rows: Array<{ heatMJh: number }>) {
  return rows.reduce((sum, row) => sum + (Number.isFinite(row.heatMJh) ? row.heatMJh : 0), 0)
}

function percentRows(rows: Omit<HeatFlowRow, 'percent'>[], denominator: number): HeatFlowRow[] {
  return rows.map((row) => ({
    ...row,
    percent: denominator > 0 ? (Math.max(0, row.heatMJh) / denominator) * 100 : 0,
  }))
}

function aggregateBySection(rows: HeatComponentRow[]) {
  const map = new Map<string, { temperature: number | null; heatMJh: number }>()
  for (const row of rows) {
    const current = map.get(row.section) ?? { temperature: row.temperature, heatMJh: 0 }
    current.heatMJh += row.heatMJh
    if (current.temperature == null) current.temperature = row.temperature
    map.set(row.section, current)
  }
  return [...map.entries()].map(([material, value]) => ({ material, ...value }))
}

export function calculateCopperHeatBalanceDetailed(input: CopperHeatBalanceInput): CopperHeatBalanceResult {
  const inputPhysicalRows = input.inputMaterials.flatMap((material) =>
    materialPhysicalRows(material, input.temperatures.feed)
  )
  const outputPhysicalRows = outputProductRows(input.products, input.temperatures)
  const equations = calculateReactionTerms(input.inputMaterials)

  const inputPhysicalHeatMJh = sumHeat(inputPhysicalRows)
  const outputPhysicalHeatMJh = sumHeat(outputPhysicalRows)
  const chemicalHeatMJh = sumHeat(equations)
  const heatLossMJh = Math.max(0, input.heatLossMJh)
  const otherHeatMJh = Math.max(0, input.otherHeatMJh)
  const heatDeficitMJh =
    outputPhysicalHeatMJh + heatLossMJh + otherHeatMJh - inputPhysicalHeatMJh - chemicalHeatMJh
  const fuelHeatMJt = Math.max(
    0,
    input.fuel.lowerHeatingValueMJkg * 1000 * input.fuel.combustionEfficiency
  )
  const requiredFuelWeight = fuelHeatMJt > 0 ? Math.max(0, heatDeficitMJh / fuelHeatMJt) : 0
  const fuelEffectiveHeatMJh = requiredFuelWeight * fuelHeatMJt
  const balanceAfterFuelMJh =
    inputPhysicalHeatMJh + chemicalHeatMJh + fuelEffectiveHeatMJh - outputPhysicalHeatMJh - heatLossMJh - otherHeatMJh

  const incomeBaseRows: Omit<HeatFlowRow, 'percent'>[] = [
    ...aggregateBySection(inputPhysicalRows).map((row) => ({
      type: 'physical' as const,
      material: row.material,
      temperature: row.temperature,
      heatMJh: row.heatMJh,
    })),
    {
      type: 'chemical',
      material: '化学反应热',
      temperature: 25,
      heatMJh: chemicalHeatMJh,
    },
    {
      type: 'chemical',
      material: '燃料煤有效热',
      temperature: null,
      heatMJh: fuelEffectiveHeatMJh,
    },
  ]
  const expenditureBaseRows: Omit<HeatFlowRow, 'percent'>[] = [
    ...aggregateBySection(outputPhysicalRows).map((row) => ({
      type: 'physical' as const,
      material: row.material,
      temperature: row.temperature,
      heatMJh: row.heatMJh,
    })),
    {
      type: 'loss',
      material: '自然散热',
      temperature: null,
      heatMJh: heatLossMJh,
    },
    {
      type: 'loss',
      material: '其他热支出',
      temperature: null,
      heatMJh: otherHeatMJh,
    },
  ]

  const incomeTotal = incomeBaseRows.reduce((sum, row) => sum + Math.max(0, row.heatMJh), 0)
  const expenditureTotal = expenditureBaseRows.reduce((sum, row) => sum + Math.max(0, row.heatMJh), 0)

  return {
    equations,
    heatIncomeRows: percentRows(incomeBaseRows, incomeTotal),
    heatExpenditureRows: percentRows(expenditureBaseRows, expenditureTotal),
    inputPhysicalRows,
    outputPhysicalRows,
    inputPhysicalHeatMJh,
    outputPhysicalHeatMJh,
    chemicalHeatMJh,
    heatLossMJh,
    otherHeatMJh,
    heatDeficitMJh,
    requiredFuelWeight,
    fuelEffectiveHeatMJh,
    balanceAfterFuelMJh,
    fuelHeatMJt,
  }
}

export function inputMaterialPhasesFromMasses(
  material: CopperMaterialColumn,
  phaseMasses: Record<string, number>
) {
  return sourceMaterialFromColumn(material, phaseMassToPercent(phaseMasses, Math.max(0, material.weight)))
}
