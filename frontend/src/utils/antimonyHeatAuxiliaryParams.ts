/**
 * 热平衡相关参数：由投入气列与产出结果反算，与 MetCal 侧吹熔炼炉辅助公式对齐。
 */
import { COMPOUND_MOLAR_MASS, atomicMass } from './atomicMass.ts'
import { evaluateOxygenEnrichmentRatio, type ConstraintSymbolTable } from './antimonyConstraintExpression.ts'
import type { OxyConstraintSolverResult } from './antimonyConstraintSolver.ts'
import { calculateGasStandardVolumeNm3h } from './antimonyProductPhaseCalc.ts'
import { materialWaterWeight, type AntimonyMaterialColumn } from './antimonyWorkflowCalc.ts'

/** 年操作小时：24 × 330（与 MetCal 烟气含 S 年量反算一致） */
export const METCAL_ANNUAL_OPERATING_HOURS = 24 * 330

const H2O_MOLAR_MASS = 2 * atomicMass('H') + atomicMass('O')

export type AntimonyHeatAuxiliaryParams = {
  /** 富氧风浓度 %（一次风湿基 O₂ 体积分数 ×100） */
  oxygenEnrichmentPct: number | null
  /** 熔炼烟气含尘 g/m³ */
  flueDustContentGm3: number | null
  /** 熔炼总尘率 %（烟尘 / 混合锑精矿 ×100） */
  totalDustRatePct: number | null
  /** 熔炼烟气总含 S t/a */
  flueSulfurAnnualTa: number | null
  /** 烟气含 As g/m³ */
  flueAsContentGm3: number | null
  /**
   * 机械尘 % = (烟尘 − PbO − ZnO − As₂O₃) / 混合锑精矿 ×100
   */
  mechanicalDustPct: number | null
  flueGasVolumeNm3h: number | null
}

export type OxygenEnrichmentGasTrace = {
  dryWeightTh: number
  o2MassTh: number
  n2MassTh: number
  h2oMassTh: number
  o2Kmolh: number
  n2Kmolh: number
  h2oKmolh: number
  totalKmolh: number
}

export type AntimonyHeatAuxiliaryTrace = {
  concentrateMassTh: number
  annualOperatingHours: number
  air: OxygenEnrichmentGasTrace | null
  oxygen: OxygenEnrichmentGasTrace | null
  combinedO2Kmolh: number | null
  combinedTotalKmolh: number | null
  dustMassTh: number | null
  flueVolumeNm3h: number | null
  flueSTh: number | null
  flueAsTh: number | null
  pbOMassTh: number | null
  znOMassTh: number | null
  as2O3MassTh: number | null
  mechanicalDustMassTh: number | null
}

export type AntimonyHeatAuxiliaryResult = {
  params: AntimonyHeatAuxiliaryParams
  trace: AntimonyHeatAuxiliaryTrace
}

function phaseMass(
  product: OxyConstraintSolverResult['products'][keyof OxyConstraintSolverResult['products']] | undefined,
  key: string
): number {
  if (!product) return 0
  const hit = product.phases.find((phase) => phase.key === key)
  return Math.max(0, hit?.mass ?? 0)
}

function gasPhasesForEnrichment(column: AntimonyMaterialColumn | undefined): Record<string, number> {
  if (!column) return { O2: 0, N2: 0, H2O: 0 }
  const dryWeight = Math.max(0, column.weight)
  const ratios = column.ratios ?? {}
  return {
    O2: (dryWeight * Math.max(0, ratios['O(氧)'] ?? 0)) / 100,
    N2: (dryWeight * Math.max(0, ratios['N(氮)'] ?? 0)) / 100,
    H2O: materialWaterWeight(column),
  }
}

function findAirColumn(
  airColumns: AntimonyMaterialColumn[] | undefined,
  role: 'air' | 'oxygen',
  name: string
): AntimonyMaterialColumn | undefined {
  if (!airColumns?.length) return undefined
  return airColumns.find((column) => column.airRole === role) ?? airColumns.find((column) => column.name === name)
}

function buildOxygenGasTrace(column: AntimonyMaterialColumn | undefined): OxygenEnrichmentGasTrace | null {
  if (!column) return null
  const phases = gasPhasesForEnrichment(column)
  const o2Kmolh = phases.O2 / COMPOUND_MOLAR_MASS.O2
  const n2Kmolh = phases.N2 / COMPOUND_MOLAR_MASS.N2
  const h2oKmolh = phases.H2O / H2O_MOLAR_MASS
  return {
    dryWeightTh: Math.max(0, column.weight),
    o2MassTh: phases.O2,
    n2MassTh: phases.N2,
    h2oMassTh: phases.H2O,
    o2Kmolh,
    n2Kmolh,
    h2oKmolh,
    totalKmolh: o2Kmolh + n2Kmolh + h2oKmolh,
  }
}

function evaluateOxygenEnrichmentPct(airColumns: AntimonyMaterialColumn[] | undefined): number | null {
  const air = findAirColumn(airColumns, 'air', '空气')
  const oxygen = findAirColumn(airColumns, 'oxygen', '氧气')
  if (!air && !oxygen) return null
  const table: ConstraintSymbolTable = {
    inputMass: {},
    inputElementMass: {},
    outputMass: {},
    outputPhaseMass: {},
    outputElementMass: {},
    inputPhaseMass: {
      空气: gasPhasesForEnrichment(air),
      氧气: gasPhasesForEnrichment(oxygen),
    },
  }
  const fraction = evaluateOxygenEnrichmentRatio(table)
  if (!(fraction > 0)) return null
  return fraction * 100
}

function buildOxygenTrace(airColumns: AntimonyMaterialColumn[] | undefined): Pick<
  AntimonyHeatAuxiliaryTrace,
  'air' | 'oxygen' | 'combinedO2Kmolh' | 'combinedTotalKmolh'
> {
  const air = findAirColumn(airColumns, 'air', '空气')
  const oxygen = findAirColumn(airColumns, 'oxygen', '氧气')
  const airTrace = buildOxygenGasTrace(air)
  const oxygenTrace = buildOxygenGasTrace(oxygen)
  if (!airTrace && !oxygenTrace) {
    return { air: null, oxygen: null, combinedO2Kmolh: null, combinedTotalKmolh: null }
  }
  const combinedO2Kmolh = (airTrace?.o2Kmolh ?? 0) + (oxygenTrace?.o2Kmolh ?? 0)
  const combinedTotalKmolh = (airTrace?.totalKmolh ?? 0) + (oxygenTrace?.totalKmolh ?? 0)
  return {
    air: airTrace,
    oxygen: oxygenTrace,
    combinedO2Kmolh: combinedTotalKmolh > 0 ? combinedO2Kmolh : null,
    combinedTotalKmolh: combinedTotalKmolh > 0 ? combinedTotalKmolh : null,
  }
}

export function calculateAntimonyHeatAuxiliaryWithTrace(params: {
  concentrateMassTh: number
  productResult: OxyConstraintSolverResult | null | undefined
  airColumns?: AntimonyMaterialColumn[] | null
  annualOperatingHours?: number
}): AntimonyHeatAuxiliaryResult {
  const concentrate = Math.max(0, params.concentrateMassTh)
  const annualHours = params.annualOperatingHours ?? METCAL_ANNUAL_OPERATING_HOURS
  const oxygenTracePart = buildOxygenTrace(params.airColumns ?? undefined)

  const emptyParams: AntimonyHeatAuxiliaryParams = {
    oxygenEnrichmentPct: null,
    flueDustContentGm3: null,
    totalDustRatePct: null,
    flueSulfurAnnualTa: null,
    flueAsContentGm3: null,
    mechanicalDustPct: null,
    flueGasVolumeNm3h: null,
  }

  const baseTrace: AntimonyHeatAuxiliaryTrace = {
    concentrateMassTh: concentrate,
    annualOperatingHours: annualHours,
    ...oxygenTracePart,
    dustMassTh: null,
    flueVolumeNm3h: null,
    flueSTh: null,
    flueAsTh: null,
    pbOMassTh: null,
    znOMassTh: null,
    as2O3MassTh: null,
    mechanicalDustMassTh: null,
  }

  const products = params.productResult?.products
  if (!products) {
    return {
      params: {
        ...emptyParams,
        oxygenEnrichmentPct: evaluateOxygenEnrichmentPct(params.airColumns ?? undefined),
      },
      trace: baseTrace,
    }
  }

  const dust = products.dust
  const flue = products.flueGas
  const dustMass = Math.max(0, dust?.mass ?? 0)
  const flueVolumeNm3h = calculateGasStandardVolumeNm3h(flue?.phases ?? [])

  const flueSTh = Math.max(0, flue?.elementMass?.['S (硫)'] ?? flue?.balanceElementMass?.['S (硫)'] ?? 0)
  const flueAsTh = Math.max(0, flue?.elementMass?.['As(砷)'] ?? flue?.balanceElementMass?.['As(砷)'] ?? 0)

  const pbO = phaseMass(dust, 'PbO')
  const znO = phaseMass(dust, 'ZnO')
  const as2O3 = phaseMass(dust, 'As2O3')
  const mechanicalDustMass = Math.max(0, dustMass - pbO - znO - as2O3)

  const trace: AntimonyHeatAuxiliaryTrace = {
    ...baseTrace,
    dustMassTh: dustMass,
    flueVolumeNm3h: flueVolumeNm3h > 1e-12 ? flueVolumeNm3h : null,
    flueSTh,
    flueAsTh,
    pbOMassTh: pbO,
    znOMassTh: znO,
    as2O3MassTh: as2O3,
    mechanicalDustMassTh: mechanicalDustMass,
  }

  return {
    params: {
      oxygenEnrichmentPct: evaluateOxygenEnrichmentPct(params.airColumns ?? undefined),
      flueDustContentGm3: flueVolumeNm3h > 1e-12 ? (dustMass * 1e6) / flueVolumeNm3h : null,
      totalDustRatePct: concentrate > 1e-12 ? (dustMass / concentrate) * 100 : null,
      flueSulfurAnnualTa: flueSTh * annualHours,
      flueAsContentGm3: flueVolumeNm3h > 1e-12 ? (flueAsTh * 1e6) / flueVolumeNm3h : null,
      mechanicalDustPct: concentrate > 1e-12 ? (mechanicalDustMass / concentrate) * 100 : null,
      flueGasVolumeNm3h: flueVolumeNm3h > 1e-12 ? flueVolumeNm3h : null,
    },
    trace,
  }
}

export function calculateAntimonyHeatAuxiliaryParams(params: {
  concentrateMassTh: number
  productResult: OxyConstraintSolverResult | null | undefined
  airColumns?: AntimonyMaterialColumn[] | null
  annualOperatingHours?: number
}): AntimonyHeatAuxiliaryParams {
  return calculateAntimonyHeatAuxiliaryWithTrace(params).params
}

export function formatAuxiliaryParam(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return value.toFixed(digits)
}
