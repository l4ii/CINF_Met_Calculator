/** 单步煤量相对变动上限（避免指数式跳变） */
export const HEAT_BALANCE_FUEL_SEARCH_MAX_RELATIVE_STEP = 0.3

export type FuelSearchPoint = {
  fuelWeightTh: number
  residualMJh: number
}

export function fuelSearchResidualFromDeficitMJh(heatDeficitMJh: number): number {
  return -heatDeficitMJh
}

export function clampFuelWeightStep(currentWeightTh: number, proposedWeightTh: number): number {
  const proposed = Math.max(0, proposedWeightTh)
  if (!(currentWeightTh > 1e-9)) return proposed
  const min = currentWeightTh * (1 - HEAT_BALANCE_FUEL_SEARCH_MAX_RELATIVE_STEP)
  const max = currentWeightTh * (1 + HEAT_BALANCE_FUEL_SEARCH_MAX_RELATIVE_STEP)
  return Math.min(max, Math.max(min, proposed))
}

/**
 * 根据当前/上一轮实测热差灵敏度提议下一总煤量。
 * residual > 0 表示热盈余；residual < 0 表示仍缺热。
 */
export function proposeNextFuelWeightTh(params: {
  current: FuelSearchPoint
  previous: FuelSearchPoint | null
  minFuelWeightTh: number
  maxFuelWeightTh: number
  fuelEffectiveHeatMJt: number
}): number {
  const { current, previous, minFuelWeightTh, maxFuelWeightTh, fuelEffectiveHeatMJt } = params
  const w = current.fuelWeightTh
  const r = current.residualMJh
  let proposed = w

  if (previous && Math.abs(w - previous.fuelWeightTh) > 1e-9) {
    const dr = r - previous.residualMJh
    const dw = w - previous.fuelWeightTh
    if (Math.abs(dr) > 1e-6 && dr * dw > 0) {
      proposed = w - (r * dw) / dr
    }
  }

  if (!Number.isFinite(proposed) || Math.abs(proposed - w) < 1e-12) {
    const deficit = Math.max(0, -r)
    proposed = w + deficit / Math.max(100, fuelEffectiveHeatMJt)
  }

  proposed = clampFuelWeightStep(w, proposed)
  return Math.min(maxFuelWeightTh, Math.max(minFuelWeightTh, proposed))
}

/** 加煤后热差未改善或每吨煤净贡献过小 */
export function fuelSearchSensitivityAbnormal(params: {
  previous: FuelSearchPoint
  current: FuelSearchPoint
  minSensitivityMJhPerTh?: number
}): boolean {
  const { previous, current, minSensitivityMJhPerTh = 1e-3 } = params
  const dw = current.fuelWeightTh - previous.fuelWeightTh
  if (Math.abs(dw) < 1e-9) return false
  const dr = current.residualMJh - previous.residualMJh
  if (dw > 0 && previous.residualMJh < 0 && dr <= 0) return true
  return Math.abs(dr / dw) < minSensitivityMJhPerTh
}

/**
 * 检测是否仍存在旧版 expandStep*=2 式扩张：
 * 连续至少两次同向增量，且每次增量相对前一次 ≥ 1.9×。
 */
export function fuelWeightSequenceHasExponentialExpansion(fuelWeights: number[]): boolean {
  let consecutiveDoubles = 0
  for (let i = 2; i < fuelWeights.length; i += 1) {
    const prevInc = fuelWeights[i - 1]! - fuelWeights[i - 2]!
    const inc = fuelWeights[i]! - fuelWeights[i - 1]!
    if (inc > 1e-9 && prevInc > 1e-9 && inc / prevInc >= 1.9) {
      consecutiveDoubles += 1
      if (consecutiveDoubles >= 2) return true
    } else {
      consecutiveDoubles = 0
    }
  }
  return false
}
