import {
  calculateCoolingWaterHeatMJh,
  refreshHeatBalanceSummaryRows,
  type CopperChemicalHeatMode,
  type CopperHeatBalanceResult,
  WATER_SPECIFIC_HEAT_KJ_KG_C,
} from './copperHeatBalance.ts'

const HEAT_BALANCE_CLOSURE_EPSILON_MJH = 1e-6

function recalculateDeficitFromParts(next: CopperHeatBalanceResult) {
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
  return { incomeMJh, expenditureMJh, residual: heatBalanceResidualMJh(next) }
}

/** residual > 0 表示热盈余（收入 > 支出），需增加热支出 */
export function coolingWaterOutletForResidual(params: {
  residualMJh: number
  waterMassTh: number
  inletTemperatureC: number
  currentOutletTemperatureC: number
}): {
  outletTemperatureC: number
  absorbedMJh: number
  remainingResidualMJh: number
  feasible: boolean
} {
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
  const outletTemperatureC = Math.max(inlet + 1e-6, currentOutlet + extraDeltaC)
  const absorbedMJh = calculateCoolingWaterHeatMJh(mass, inlet, outletTemperatureC)
  return {
    outletTemperatureC,
    absorbedMJh,
    remainingResidualMJh: params.residualMJh - (absorbedMJh - currentHeat),
    feasible: true,
  }
}

export function heatBalanceResidualMJh(result: CopperHeatBalanceResult): number {
  return -result.heatDeficitMJh
}

/**
 * Hess/吹炼煤量搜索用热差：冷却水出口温度由热差反算，不计入固定热支出。
 * residual > 0 且有冷却水：可由出口温升吸收，搜索残差为 0。
 * residual < 0：冷却水取 0 仍缺热，需要调整煤量或工况。
 */
export function hessFuelSearchResidualMJh(
  result: CopperHeatBalanceResult,
  options: {
    coolingWaterMassTh: number
  }
): number {
  const residualWithoutCooling =
    heatBalanceResidualMJh(result) + Math.max(0, result.coolingWaterHeatMJh)
  if (residualWithoutCooling <= HEAT_BALANCE_CLOSURE_EPSILON_MJH) return residualWithoutCooling
  return options.coolingWaterMassTh > 0 ? 0 : residualWithoutCooling
}

/** 基础煤工况在 Hess 下的真实热缺口（冷却水尚未吸收盈余时） */
export function hessHeatDeficitWithoutCoolingMJh(result: CopperHeatBalanceResult): number {
  return Math.max(0, result.heatDeficitMJh - Math.max(0, result.coolingWaterHeatMJh))
}

export function applyPostFuelClosureToHeatBalance(
  heatBalance: CopperHeatBalanceResult,
  options: {
    coolingWaterMassTh: number
    coolingWaterInletTemperatureC: number
    chemicalHeatMode?: CopperChemicalHeatMode
    /** Converting uses cooling water for closure in both chemical-heat modes. */
    closeWithCoolingWater?: boolean
  }
): CopperHeatBalanceResult {
  const next = structuredClone(heatBalance)
  const chemicalHeatMode: CopperChemicalHeatMode =
    options.chemicalHeatMode === 'reaction' || next.chemicalHeatMode === 'reaction'
      ? 'reaction'
      : 'hess'
  next.chemicalHeatMode = chemicalHeatMode
  let residual = heatBalanceResidualMJh(next)

  if (chemicalHeatMode === 'reaction' && !options.closeWithCoolingWater) {
    // 熔炼化学反应法固定冷却水温差，自然散热由剩余热量直接反算。
    next.otherHeatMJh = 0
    next.balanceClosureMode = 'none'
    next.balanceClosureHeatMJh = 0
    residual = recalculateDeficitFromParts(next).residual
    if (residual > HEAT_BALANCE_CLOSURE_EPSILON_MJH) {
      const absorbed = residual
      next.otherHeatMJh = absorbed
      next.balanceClosureMode = 'otherHeat'
      next.balanceClosureHeatMJh = absorbed
      residual = recalculateDeficitFromParts(next).residual
    }
  } else {
    // Hess 与吹炼均从入口温度起算，再按盈余热量反算冷却水出口温度。
    const inlet = options.coolingWaterInletTemperatureC
    next.coolingWaterOutletTemperatureC = inlet
    next.coolingWaterHeatMJh = 0
    next.balanceClosureMode = 'none'
    next.balanceClosureHeatMJh = 0
    residual = recalculateDeficitFromParts(next).residual

    if (residual > HEAT_BALANCE_CLOSURE_EPSILON_MJH) {
      const cooling = coolingWaterOutletForResidual({
        residualMJh: residual,
        waterMassTh: options.coolingWaterMassTh,
        inletTemperatureC: inlet,
        currentOutletTemperatureC: inlet,
      })
      if (cooling.absorbedMJh > HEAT_BALANCE_CLOSURE_EPSILON_MJH || cooling.outletTemperatureC > inlet + 1e-9) {
        next.coolingWaterOutletTemperatureC = cooling.outletTemperatureC
        next.coolingWaterHeatMJh = cooling.absorbedMJh
        next.balanceClosureMode = 'coolingWater'
        next.balanceClosureHeatMJh = cooling.absorbedMJh
        residual = recalculateDeficitFromParts(next).residual
      }
    }
  }

  recalculateDeficitFromParts(next)
  residual = heatBalanceResidualMJh(next)
  next.heatBalanceTolerancePct = undefined
  next.balanceErrorMJh = residual
  next.balanceErrorWithinTolerance = undefined

  if (Math.abs(residual) <= HEAT_BALANCE_CLOSURE_EPSILON_MJH) {
    next.balanceErrorMJh = 0
    next.heatDeficitMJh = 0
    next.balanceAfterFuelMJh = 0
    next.closureResidualMJh = 0
    next.closureStatus = 'balanced'
  } else {
    next.closureResidualMJh = next.balanceAfterFuelMJh
    next.closureStatus = residual > 0 ? 'surplus' : 'blocked'
  }

  return refreshHeatBalanceSummaryRows(next, next.inputPhysicalRows)
}
