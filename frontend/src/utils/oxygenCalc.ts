/**
 * 富氧空气计算：根据物相分析结果（Sb2S3、FeS、FeS2）和硫化物氧化反应方程式，
 * 计算完全氧化所需的理论氧气消耗量，再根据供氧系数得到实际氧气消耗量
 * 参考 AntimonyMix Pro models.py _calc_theoretical_oxygen
 */
import { MOLAR_MASS } from '../config/rawMaterialConfig'

export type IronOxidationProduct = 'FeO' | 'Fe2O3' | 'Fe3O4' | 'custom'

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
  N2_moles: number // kmol/h
  N2_mass: number // t/h
  ironProduct: IronOxidationProduct
  FeS_O2_coeff: number
  FeS2_O2_coeff: number
  oxygenCoefficient: number
}

const T_TO_KG = 1000
const KG_TO_T = 1000
const NORMAL_M3_PER_KMOL = 22.4

const IRON_PRODUCT_O2_COEFFS: Record<Exclude<IronOxidationProduct, 'custom'>, { FeS: number; FeS2: number }> = {
  // FeS + 1.5O2 -> FeO + SO2; FeS2 + 2.5O2 -> FeO + 2SO2
  FeO: { FeS: 1.5, FeS2: 2.5 },
  // 2FeS + 3.5O2 -> Fe2O3 + 2SO2; 2FeS2 + 5.5O2 -> Fe2O3 + 4SO2
  Fe2O3: { FeS: 1.75, FeS2: 2.75 },
  // 3FeS + 5O2 -> Fe3O4 + 3SO2; 3FeS2 + 8O2 -> Fe3O4 + 6SO2
  Fe3O4: { FeS: 5 / 3, FeS2: 8 / 3 },
}

export function getIronOxidationCoefficients(
  product: IronOxidationProduct,
  custom?: { FeS?: number; FeS2?: number }
) {
  if (product === 'custom') {
    return {
      FeS: custom?.FeS ?? IRON_PRODUCT_O2_COEFFS.FeO.FeS,
      FeS2: custom?.FeS2 ?? IRON_PRODUCT_O2_COEFFS.FeO.FeS2,
    }
  }
  return IRON_PRODUCT_O2_COEFFS[product]
}

/**
 * 硫化物氧化反应（完全氧化）：
 * Sb2S3 + 4.5O2 → Sb2O3 + 3SO2
 * FeS/FeS2 的耗氧系数随铁氧化终产物变化：
 * FeO:   FeS=1.5,   FeS2=2.5
 * Fe2O3: FeS=1.75,  FeS2=2.75
 * Fe3O4: FeS=5/3,   FeS2=8/3
 */
export function calcTheoreticalOxygen(
  phaseData: PhaseData,
  params: {
    oxy_purity?: number
    oxygen_coefficient?: number
    iron_product?: IronOxidationProduct
    custom_FeS_O2_coeff?: number
    custom_FeS2_O2_coeff?: number
  }
): OxygenResult {
  const { Sb2S3, FeS, FeS2 } = phaseData
  const oxygenCoefficient = params.oxygen_coefficient ?? 1.15
  const oxygen_purity = (params.oxy_purity ?? 32) / 100
  const ironProduct = params.iron_product ?? 'FeO'
  const ironCoeffs = getIronOxidationCoefficients(ironProduct, {
    FeS: params.custom_FeS_O2_coeff,
    FeS2: params.custom_FeS2_O2_coeff,
  })

  // MOLAR_MASS is numerically kg/kmol. Phase masses are t/h, so t -> kg
  // gives sulfide amounts directly in kmol/h.
  const n_Sb2S3 = (Sb2S3 * T_TO_KG) / MOLAR_MASS.Sb2S3
  const n_FeS2 = (FeS2 * T_TO_KG) / MOLAR_MASS.FeS2
  const n_FeS = (FeS * T_TO_KG) / MOLAR_MASS.FeS

  const O2_Sb2S3 = n_Sb2S3 * 4.5
  const O2_FeS2 = n_FeS2 * ironCoeffs.FeS2
  const O2_FeS = n_FeS * ironCoeffs.FeS
  const O2_theoretical = O2_Sb2S3 + O2_FeS2 + O2_FeS
  const O2_actual = O2_theoretical * oxygenCoefficient

  const air_moles = O2_actual / oxygen_purity
  const N2_moles = air_moles - O2_actual

  const O2_mass = (O2_actual * MOLAR_MASS.O2) / KG_TO_T
  const N2_mass = (N2_moles * MOLAR_MASS.N2) / KG_TO_T
  const air_volume = air_moles * NORMAL_M3_PER_KMOL

  return {
    theoretical: O2_theoretical,
    actual: O2_actual,
    mass: O2_mass,
    air_volume,
    N2_moles,
    N2_mass,
    ironProduct,
    FeS_O2_coeff: ironCoeffs.FeS,
    FeS2_O2_coeff: ironCoeffs.FeS2,
    oxygenCoefficient,
  }
}
