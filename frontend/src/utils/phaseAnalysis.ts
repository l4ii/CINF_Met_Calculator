/**
 * 物相估算：从含硫基础原料中的 Sb/Fe/S 元素量 → 按硫化物摩尔反应优先级估算 Sb2S3、FeS、FeS2 质量。
 * 注意：调用方应排除石灰、铁矿石等氧化物熔剂，避免将氧化物 Fe 误判为硫化铁来源。
 * 阶段1: 优先 Sb2S3
 * 阶段2: 根据剩余 S/Fe 比分支：
 *   - S/Fe ≥ 2: 先分配 FeS2，剩余分配 FeS
 *   - 1 < S/Fe < 2: 线性方程组求解 FeS、FeS2 混合量（最大化总矿物）
 *   - S/Fe ≤ 1: 仅形成 FeS
 */
import { MOLAR_MASS } from '../config/rawMaterialConfig'

export interface PhaseResult {
  Sb2S3: number
  FeS: number
  FeS2: number
  剩余Sb: number
  剩余Fe: number
  剩余S: number
}

export interface ElementWeights {
  [key: string]: number // 元素名: 重量(t/h)
}

/** 铁硫分配策略：自适应 | 线性方程求解 | 优先FeS₂ | 优先FeS */
export type PhaseFeSAlgorithm = 'adaptive' | 'linear' | 'feS2_first' | 'feS_first'

export function phaseAnalysis(
  elementWeights: ElementWeights,
  algorithm: PhaseFeSAlgorithm = 'adaptive'
): PhaseResult {
  const sb_weight = elementWeights['Sb(锑)'] ?? 0
  const fe_weight = elementWeights['Fe(铁)'] ?? 0
  const s_weight = elementWeights['S (硫)'] ?? 0

  const sb_g = sb_weight * 1e6
  const fe_g = fe_weight * 1e6
  const s_g = s_weight * 1e6

  const mol_Sb = sb_g / MOLAR_MASS.Sb
  const mol_Fe = fe_g / MOLAR_MASS.Fe
  const mol_S = s_g / MOLAR_MASS.S

  // 阶段1: 优先分配 Sb2S3 (Sb:S = 2:3)
  const T_Sb2S3 = Math.min(mol_Sb / 2, mol_S / 3)
  const rest_Sb = mol_Sb - 2 * T_Sb2S3
  let rest_S = mol_S - 3 * T_Sb2S3
  let rest_Fe = mol_Fe

  const sFeRatio = rest_Fe > 1e-12 ? rest_S / rest_Fe : 0

  let T_FeS: number
  let T_FeS2: number

  if (algorithm === 'feS2_first') {
    T_FeS2 = Math.min(rest_Fe, rest_S / 2)
    rest_Fe -= T_FeS2
    rest_S -= 2 * T_FeS2
    T_FeS = Math.min(rest_Fe, rest_S)
    rest_Fe -= T_FeS
    rest_S -= T_FeS
  } else if (algorithm === 'feS_first') {
    T_FeS = Math.min(rest_Fe, rest_S)
    rest_Fe -= T_FeS
    rest_S -= T_FeS
    T_FeS2 = Math.min(rest_Fe, rest_S / 2)
    rest_Fe -= T_FeS2
    rest_S -= 2 * T_FeS2
  } else if (algorithm === 'linear') {
    // 线性方程 x=FeS=2*Fe-S, y=FeS2=S-Fe；边界：x<0 铁过剩→仅FeS；y<0 硫过剩→仅FeS₂
    const x = 2 * rest_Fe - rest_S
    const y = rest_S - rest_Fe
    if (x >= 0 && y >= 0) {
      T_FeS = x
      T_FeS2 = y
    } else if (x < 0) {
      T_FeS = Math.min(rest_Fe, rest_S)
      T_FeS2 = 0
    } else {
      T_FeS = 0
      T_FeS2 = Math.min(rest_Fe, rest_S / 2)
    }
    rest_Fe -= T_FeS + T_FeS2
    rest_S -= T_FeS + 2 * T_FeS2
  } else if (sFeRatio >= 2) {
    // 硫过剩：先 FeS2，剩余 FeS
    T_FeS2 = Math.min(rest_Fe, rest_S / 2)
    rest_Fe -= T_FeS2
    rest_S -= 2 * T_FeS2
    T_FeS = Math.min(rest_Fe, rest_S)
    rest_Fe -= T_FeS
    rest_S -= T_FeS
  } else if (algorithm === 'adaptive' && sFeRatio > 1 && sFeRatio < 2) {
    // 1<S/Fe<2：线性方程组 x=FeS=2*Fe-S, y=FeS2=S-Fe；边界同 linear
    const x = 2 * rest_Fe - rest_S
    const y = rest_S - rest_Fe
    if (x >= 0 && y >= 0) {
      T_FeS = x
      T_FeS2 = y
    } else if (x < 0) {
      T_FeS = Math.min(rest_Fe, rest_S)
      T_FeS2 = 0
    } else {
      T_FeS = 0
      T_FeS2 = Math.min(rest_Fe, rest_S / 2)
    }
    rest_Fe -= T_FeS + T_FeS2
    rest_S -= T_FeS + 2 * T_FeS2
  } else {
    // S/Fe ≤ 1：仅 FeS
    T_FeS = Math.min(rest_Fe, rest_S)
    T_FeS2 = 0
    rest_Fe -= T_FeS
    rest_S -= T_FeS
  }

  const final_rest_Sb = Math.max(rest_Sb, 0)
  const final_rest_Fe = Math.max(rest_Fe, 0)
  const final_rest_S = Math.max(rest_S, 0)

  return {
    Sb2S3: (T_Sb2S3 * MOLAR_MASS.Sb2S3) / 1e6,
    FeS: (T_FeS * MOLAR_MASS.FeS) / 1e6,
    FeS2: (T_FeS2 * MOLAR_MASS.FeS2) / 1e6,
    剩余Sb: (final_rest_Sb * MOLAR_MASS.Sb) / 1e6,
    剩余Fe: (final_rest_Fe * MOLAR_MASS.Fe) / 1e6,
    剩余S: (final_rest_S * MOLAR_MASS.S) / 1e6,
  }
}
