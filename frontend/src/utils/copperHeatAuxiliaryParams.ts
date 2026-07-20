/**
 * MetCal 表9「侧吹熔炼炉辅助计算」关键参数。
 * 公式由 0714 结果簿反算确认（表9 单元格本身为写死数值）。
 */
import { evaluateOxygenEnrichmentRatio, type ConstraintSymbolTable } from './copperConstraintExpression.ts'
import type { OxyConstraintSolverResult } from './copperConstraintSolver.ts'
import { calculateGasStandardVolumeNm3h } from './copperProductPhaseCalc.ts'
import { materialWaterWeight, type CopperMaterialColumn } from './copperWorkflowCalc.ts'

/** 年操作小时：24 × 330（与 MetCal 烟气含 S 年量反算一致） */
export const METCAL_ANNUAL_OPERATING_HOURS = 24 * 330

export type CopperHeatAuxiliaryParams = {
  /** 富氧风浓度 %（一次风湿基 O₂ 体积分数 ×100） */
  oxygenEnrichmentPct: number | null
  /** 熔炼烟气含尘 g/m³ */
  flueDustContentGm3: number | null
  /** 熔炼总尘率 %（烟尘 / 混合铜精矿 ×100） */
  totalDustRatePct: number | null
  /** 熔炼烟气总含 S t/a */
  flueSulfurAnnualTa: number | null
  /** 烟气含 As g/m³ */
  flueAsContentGm3: number | null
  /**
   * 机械尘 % = (烟尘 − PbO − ZnO − As₂O₃) / 混合铜精矿 ×100
   * MetCal：主挥发氧化物 PbO/ZnO/As2O3 以外的烟尘占精矿百分数。
   */
  mechanicalDustPct: number | null
  flueGasVolumeNm3h: number | null
}

function phaseMass(
  product: OxyConstraintSolverResult['products'][keyof OxyConstraintSolverResult['products']] | undefined,
  key: string
): number {
  if (!product) return 0
  const hit = product.phases.find((phase) => phase.key === key)
  return Math.max(0, hit?.mass ?? 0)
}

function gasPhasesForEnrichment(column: CopperMaterialColumn | undefined): Record<string, number> {
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
  airColumns: CopperMaterialColumn[] | undefined,
  role: 'air' | 'oxygen',
  name: string
): CopperMaterialColumn | undefined {
  if (!airColumns?.length) return undefined
  return airColumns.find((column) => column.airRole === role) ?? airColumns.find((column) => column.name === name)
}

function evaluateOxygenEnrichmentPct(airColumns: CopperMaterialColumn[] | undefined): number | null {
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

export function calculateCopperHeatAuxiliaryParams(params: {
  concentrateMassTh: number
  productResult: OxyConstraintSolverResult | null | undefined
  airColumns?: CopperMaterialColumn[] | null
  annualOperatingHours?: number
}): CopperHeatAuxiliaryParams {
  const empty: CopperHeatAuxiliaryParams = {
    oxygenEnrichmentPct: null,
    flueDustContentGm3: null,
    totalDustRatePct: null,
    flueSulfurAnnualTa: null,
    flueAsContentGm3: null,
    mechanicalDustPct: null,
    flueGasVolumeNm3h: null,
  }

  const concentrate = Math.max(0, params.concentrateMassTh)
  const products = params.productResult?.products
  if (!products) {
    return {
      ...empty,
      oxygenEnrichmentPct: evaluateOxygenEnrichmentPct(params.airColumns ?? undefined),
    }
  }

  const dust = products.dust
  const flue = products.flueGas
  const dustMass = Math.max(0, dust?.mass ?? 0)
  const flueVolumeNm3h = calculateGasStandardVolumeNm3h(flue?.phases ?? [])
  const annualHours = params.annualOperatingHours ?? METCAL_ANNUAL_OPERATING_HOURS

  const flueSTh = Math.max(0, flue?.elementMass?.['S (硫)'] ?? flue?.balanceElementMass?.['S (硫)'] ?? 0)
  const flueAsTh = Math.max(0, flue?.elementMass?.['As(砷)'] ?? flue?.balanceElementMass?.['As(砷)'] ?? 0)

  const pbO = phaseMass(dust, 'PbO')
  const znO = phaseMass(dust, 'ZnO')
  const as2O3 = phaseMass(dust, 'As2O3')
  const mechanicalDustMass = Math.max(0, dustMass - pbO - znO - as2O3)

  return {
    oxygenEnrichmentPct: evaluateOxygenEnrichmentPct(params.airColumns ?? undefined),
    flueDustContentGm3: flueVolumeNm3h > 1e-12 ? (dustMass * 1e6) / flueVolumeNm3h : null,
    totalDustRatePct: concentrate > 1e-12 ? (dustMass / concentrate) * 100 : null,
    flueSulfurAnnualTa: flueSTh * annualHours,
    flueAsContentGm3: flueVolumeNm3h > 1e-12 ? (flueAsTh * 1e6) / flueVolumeNm3h : null,
    mechanicalDustPct: concentrate > 1e-12 ? (mechanicalDustMass / concentrate) * 100 : null,
    flueGasVolumeNm3h: flueVolumeNm3h > 1e-12 ? flueVolumeNm3h : null,
  }
}

export function formatAuxiliaryParam(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return value.toFixed(digits)
}
