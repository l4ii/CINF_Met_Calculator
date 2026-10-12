import { FURNACE_SIM_CONFIG } from '../config/furnaceSimConfig.ts'

/** 喷吹气体状态。缺省值取后台配置的标况与喷枪出口实际状态。 */
export type GasState = {
  /** O₂ 体积分数 0～1，其余按 N₂ 计 */
  oxygenFraction?: number
  normalTemperatureK?: number
  normalPressurePa?: number
  actualTemperatureK?: number
  actualPressurePa?: number
  compressibility?: number
}

const GAS_CONSTANT = 8.314462618
const MOLAR_MASS_O2 = 0.031998
const MOLAR_MASS_N2 = 0.0280134

function positive(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback
}

/** 标态气量 Nm³/h 换算为喷枪出口实际体积流量 m³/s。 */
export function actualGasFlowM3s(flowNm3h: number, gasState?: GasState): number {
  if (!(flowNm3h > 0)) return 0
  const { fluid } = FURNACE_SIM_CONFIG
  const tn = positive(gasState?.normalTemperatureK, fluid.normalTemperatureK)
  const pn = positive(gasState?.normalPressurePa, fluid.normalPressurePa)
  const ta = positive(gasState?.actualTemperatureK, fluid.inletTemperatureK)
  const pa = positive(gasState?.actualPressurePa, fluid.inletPressurePa)
  const z = positive(gasState?.compressibility, 1)
  return flowNm3h * (ta / tn) * (pn / pa) * z / 3600
}

/** 圆形风口出口平均速度 m/s。 */
export function inletSpeedMs(flowNm3h: number, radiusM: number, gasState?: GasState): number {
  const area = Math.PI * radiusM * radiusM
  if (!(area > 0)) return 0
  return actualGasFlowM3s(flowNm3h, gasState) / area
}

/** 喷枪出口实际状态下的气体密度 kg/m³，按 O₂/N₂ 理想气体。 */
export function inletGasDensityKgM3(gasState?: GasState): number {
  const { fluid } = FURNACE_SIM_CONFIG
  const fraction = Math.min(1, Math.max(0, gasState?.oxygenFraction ?? 1))
  const molarMass = fraction * MOLAR_MASS_O2 + (1 - fraction) * MOLAR_MASS_N2
  const ta = positive(gasState?.actualTemperatureK, fluid.inletTemperatureK)
  const pa = positive(gasState?.actualPressurePa, fluid.inletPressurePa)
  const z = positive(gasState?.compressibility, 1)
  return pa * molarMass / (z * GAS_CONSTANT * ta)
}
