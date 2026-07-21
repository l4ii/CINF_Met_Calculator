import {
  calculateCoolingWaterHeatMJh,
  refreshHeatBalanceSummaryRows,
  type CopperHeatBalanceResult,
  WATER_SPECIFIC_HEAT_KJ_KG_C,
} from './copperHeatBalance.ts'

export const COOLING_WATER_OUTLET_MAX_C = 38
export const DEFAULT_HEAT_BALANCE_TOLERANCE_PCT = 2

/** residual > 0 表示热盈余（收入 > 支出），需增加热支出 */
export function coolingWaterOutletForResidual(params: {
  residualMJh: number
  waterMassTh: number
  inletTemperatureC: number
  currentOutletTemperatureC: number
  maxOutletTemperatureC?: number
}): {
  outletTemperatureC: number
  absorbedMJh: number
  remainingResidualMJh: number
  feasible: boolean
} {
  const maxOutlet = params.maxOutletTemperatureC ?? COOLING_WATER_OUTLET_MAX_C
  const mass = Math.max(0, params.waterMassTh)
  const inlet = params.inletTemperatureC
  const currentOutlet = Math.max(inlet, params.currentOutletTemperatureC)
  const currentHeat = calculateCoolingWaterHeatMJh(mass, inlet, currentOutlet)
  if (params.residualMJh <= 1e-6 || mass <= 0) {
    return {
      outletTemperatureC: currentOutlet,
      absorbedMJh: currentHeat,
      remainingResidualMJh: params.residualMJh,
      feasible: true,
    }
  }
  const extraDeltaC = params.residualMJh / (mass * WATER_SPECIFIC_HEAT_KJ_KG_C)
  const targetOutlet = currentOutlet + extraDeltaC
  if (targetOutlet <= maxOutlet + 1e-9) {
    const outletTemperatureC = Math.max(inlet + 1e-6, targetOutlet)
    const absorbedMJh = calculateCoolingWaterHeatMJh(mass, inlet, outletTemperatureC)
    return {
      outletTemperatureC,
      absorbedMJh,
      remainingResidualMJh: params.residualMJh - (absorbedMJh - currentHeat),
      feasible: true,
    }
  }
  const maxHeat = calculateCoolingWaterHeatMJh(mass, inlet, maxOutlet)
  const absorbedExtra = maxHeat - currentHeat
  return {
    outletTemperatureC: maxOutlet,
    absorbedMJh: maxHeat,
    remainingResidualMJh: params.residualMJh - absorbedExtra,
    feasible: false,
  }
}

export function heatBalanceResidualMJh(result: CopperHeatBalanceResult): number {
  return -result.heatDeficitMJh
}

export function heatBalanceToleranceMJh(params: {
  incomeMJh: number
  expenditureMJh: number
  tolerancePct: number
}) {
  const pct = Math.max(0, params.tolerancePct)
  const reference = Math.max(params.incomeMJh, params.expenditureMJh, 1)
  return (reference * pct) / 100
}

export function applyPostFuelClosureToHeatBalance(
  heatBalance: CopperHeatBalanceResult,
  options: {
    coolingWaterMassTh: number
    coolingWaterInletTemperatureC: number
    tolerancePct?: number
    maxOutletTemperatureC?: number
  }
): CopperHeatBalanceResult {
  const next = structuredClone(heatBalance)
  const tolerancePct = Math.max(0, options.tolerancePct ?? DEFAULT_HEAT_BALANCE_TOLERANCE_PCT)
  let residual = heatBalanceResidualMJh(next)

  if (residual > 1e-6) {
    const cooling = coolingWaterOutletForResidual({
      residualMJh: residual,
      waterMassTh: options.coolingWaterMassTh,
      inletTemperatureC: options.coolingWaterInletTemperatureC,
      currentOutletTemperatureC: next.coolingWaterOutletTemperatureC,
      maxOutletTemperatureC: options.maxOutletTemperatureC,
    })
    if (cooling.absorbedMJh > next.coolingWaterHeatMJh + 1e-6) {
      next.coolingWaterOutletTemperatureC = cooling.outletTemperatureC
      next.coolingWaterHeatMJh = cooling.absorbedMJh
      next.balanceClosureMode = 'coolingWater'
      next.balanceClosureHeatMJh = cooling.absorbedMJh - heatBalance.coolingWaterHeatMJh
      const chemicalIncomeMJh = Math.max(0, next.chemicalHeatMJh)
      const chemicalExpenditureMJh = Math.max(0, -next.chemicalHeatMJh)
      const incomeMJh = next.inputPhysicalHeatMJh + chemicalIncomeMJh
      const expenditureMJh =
        next.outputPhysicalHeatMJh +
        chemicalExpenditureMJh +
        next.coolingWaterHeatMJh +
        next.heatLossMJh +
        next.otherHeatMJh
      next.heatDeficitMJh = expenditureMJh - incomeMJh
      next.balanceAfterFuelMJh = -next.heatDeficitMJh
      residual = heatBalanceResidualMJh(next)
    }
  }

  const chemicalIncomeMJh = Math.max(0, next.chemicalHeatMJh)
  const chemicalExpenditureMJh = Math.max(0, -next.chemicalHeatMJh)
  const incomeMJh = next.inputPhysicalHeatMJh + chemicalIncomeMJh
  const expenditureMJh =
    next.outputPhysicalHeatMJh +
    chemicalExpenditureMJh +
    next.coolingWaterHeatMJh +
    next.heatLossMJh +
    next.otherHeatMJh
  const toleranceMJh = heatBalanceToleranceMJh({ incomeMJh, expenditureMJh, tolerancePct })

  next.heatBalanceTolerancePct = tolerancePct
  next.balanceErrorMJh = residual
  next.balanceErrorWithinTolerance = Math.abs(residual) <= toleranceMJh + 1e-9

  if (next.balanceErrorWithinTolerance) {
    next.balanceClosureMode = next.balanceClosureMode === 'coolingWater' ? 'coolingWater' : 'error'
    next.heatDeficitMJh = 0
    next.balanceAfterFuelMJh = 0
    next.closureResidualMJh = 0
    next.closureStatus = 'balanced'
  } else {
    next.heatDeficitMJh = expenditureMJh - incomeMJh
    next.balanceAfterFuelMJh = -next.heatDeficitMJh
    next.closureResidualMJh = next.balanceAfterFuelMJh
    if (residual > toleranceMJh) {
      next.closureStatus = 'surplus'
    }
  }

  return refreshHeatBalanceSummaryRows(next, next.inputPhysicalRows)
}
