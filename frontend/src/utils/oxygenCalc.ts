/**
 * 富氧空气计算：根据物相分析结果（Sb2S3、FeS、FeS2）和硫化物氧化反应方程式，
 * 计算完全氧化所需的理论氧气消耗量，再根据过剩系数得到实际氧气消耗量
 * 参考 AntimonyMix Pro models.py _calc_theoretical_oxygen
 */
import { MOLAR_MASS } from '../config/rawMaterialConfig'

export interface PhaseData {
  Sb2S3: number
  FeS: number
  FeS2: number
}

export interface OxygenResult {
  theoretical: number // kmol/h
  actual: number // kmol/h
  mass: number // t/h 氧气质量
  air_volume: number // Nm³/h 富氧空气体积
  N2_moles: number
  N2_mass: number // t/h
}

/**
 * 硫化物氧化反应（完全氧化）：
 * Sb2S3 + 4.5O2 → Sb2O3 + 3SO2
 * 2FeS2 + 5.5O2 → Fe2O3 + 4SO2
 * 2FeS + 3.5O2 → Fe2O3 + 2SO2
 */
export function calcTheoreticalOxygen(
  phaseData: PhaseData,
  params: { oxy_purity?: number; excess_ratio?: number }
): OxygenResult {
  const { Sb2S3, FeS, FeS2 } = phaseData
  const excess_ratio = params.excess_ratio ?? 1.15
  const oxygen_purity = (params.oxy_purity ?? 32) / 100

  const n_Sb2S3 = (Sb2S3 * 1e6) / MOLAR_MASS.Sb2S3
  const n_FeS2 = (FeS2 * 1e6) / MOLAR_MASS.FeS2
  const n_FeS = (FeS * 1e6) / MOLAR_MASS.FeS

  const O2_Sb2S3 = n_Sb2S3 * 4.5
  const O2_FeS2 = n_FeS2 * 2.75
  const O2_FeS = n_FeS * 1.75
  const O2_theoretical = O2_Sb2S3 + O2_FeS2 + O2_FeS
  const O2_actual = O2_theoretical * excess_ratio

  const air_moles = O2_actual / oxygen_purity
  const N2_moles = air_moles - O2_actual

  const O2_mass = (O2_actual * MOLAR_MASS.O2) / 1e6
  const N2_mass = (N2_moles * MOLAR_MASS.N2) / 1e6
  const air_volume = air_moles * 22.4

  return {
    theoretical: O2_theoretical,
    actual: O2_actual,
    mass: O2_mass,
    air_volume,
    N2_moles,
    N2_mass,
  }
}
