import type { OxyConstraintSolverResult } from './copperConstraintSolver.ts'
import type { CopperMaterialColumn } from './copperWorkflowCalc.ts'
import type { PhaseMaterialCalcResult } from './copperPhaseBatchCalc.ts'

export const OXY_MATTE_CU_W_PERCENT_TOLERANCE = 0.5
export const OXY_ELEMENT_BALANCE_RELATIVE_TOLERANCE = 0.01

export interface OxySolverFillBackValidation {
  ok: boolean
  message?: string
}

export function validateRawMaterialPhaseInputs(params: {
  rawMaterials: CopperMaterialColumn[]
  phaseBatchResults: Record<string, PhaseMaterialCalcResult | undefined> | null | undefined
  blendPhaseMass: Record<string, number> | null | undefined
}): OxySolverFillBackValidation {
  const weighedMaterials = params.rawMaterials.filter((m) => m.name.trim() && m.weight > 0)
  if (weighedMaterials.length === 0) {
    return { ok: false, message: '请先在配料总表填写原料投料量。' }
  }
  const missingPhase = weighedMaterials.filter((m) => !params.phaseBatchResults?.[m.id]?.valid)
  if (missingPhase.length > 0) {
    const names = missingPhase.map((m) => m.name).join('、')
    return {
      ok: false,
      message: `请先在「投入物相」完成以下原料的物相回填：${names}。`,
    }
  }
  if (!params.blendPhaseMass || Object.keys(params.blendPhaseMass).length === 0) {
    return { ok: false, message: '混合铜精矿物相质量未生成，请完成全部原料物相回填后重试。' }
  }
  return { ok: true }
}

export function validateOxySolverResultForFillBack(
  result: OxyConstraintSolverResult,
  options: {
    matteCopperGrade?: number
    concentrateMass?: number
  } = {}
): OxySolverFillBackValidation {
  if (!result.acceptable) {
    return {
      ok: false,
      message: result.message ?? '产出约束未完全满足，当前不可回填。',
    }
  }

  const matte = result.products.matte
  const dust = result.products.dust
  const gmc = options.matteCopperGrade ?? 75
  const matteCu = matte.composition['Cu(铜)'] ?? 0

  if (Math.abs(matteCu - gmc) > OXY_MATTE_CU_W_PERCENT_TOLERANCE) {
    return {
      ok: false,
      message: `白铜锍铜品位 ${matteCu.toFixed(2)}% 与目标 GMC ${gmc}% 偏差超过 ${OXY_MATTE_CU_W_PERCENT_TOLERANCE}%，不可回填。`,
    }
  }

  const balanceResiduals = result.elementBalanceResiduals ?? []
  for (const row of balanceResiduals) {
    const relative = row.feed > 0 ? Math.abs(row.residual) / row.feed : Math.abs(row.residual)
    if (relative > OXY_ELEMENT_BALANCE_RELATIVE_TOLERANCE) {
      return {
        ok: false,
        message: `元素 ${row.element} 守恒偏差 ${(relative * 100).toFixed(2)}% 超过允许上限，不可回填。`,
      }
    }
  }

  const concentrateMass = options.concentrateMass
  if (concentrateMass != null && concentrateMass > 0) {
    const matteMassPerConcentrate = matte.mass / concentrateMass
    if (matteMassPerConcentrate < 0.25 || matteMassPerConcentrate > 0.4) {
      return {
        ok: false,
        message: `白铜锍量 ${matte.mass.toFixed(2)} t/h 与精矿量比异常（${matteMassPerConcentrate.toFixed(3)}），请检查约束或物相输入。`,
      }
    }
    const dustMassPerConcentrate = dust.mass / concentrateMass
    if (dustMassPerConcentrate < 0.01 || dustMassPerConcentrate > 0.025) {
      return {
        ok: false,
        message: `烟气含尘量 ${dust.mass.toFixed(2)} t/h 与精矿量比异常（${dustMassPerConcentrate.toFixed(4)}），请检查元素分配约束。`,
      }
    }
  }

  return { ok: true }
}
