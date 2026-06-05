import type { CopperMaterialColumn, CopperRatios } from './copperWorkflowCalc.ts'

export function requiresSulfurInput(ratios: CopperRatios): boolean {
  return (
    (ratios['Cu(铜)'] ?? 0) > 0 ||
    (ratios['Fe(铁)'] ?? 0) > 0 ||
    (ratios['FeO(氧化亚铁)'] ?? 0) > 0
  )
}

export function hasValidSulfurInput(ratios: CopperRatios): boolean {
  const sulfur = ratios['S (硫)']
  return Number.isFinite(sulfur) && (sulfur ?? 0) > 0
}

export function validateRatiosSulfurRequirement(ratios: CopperRatios, materialName = '该原料'): string | null {
  if (requiresSulfurInput(ratios) && !hasValidSulfurInput(ratios)) {
    return `${materialName} 含 Cu/Fe，须填写 S(硫) 元素含量`
  }
  return null
}

export function validateMaterialForPhaseCalc(
  material: Pick<CopperMaterialColumn, 'name' | 'weight' | 'ratios'>
): string | null {
  if (!material.name.trim()) return '请先选择或填写原料名称'
  if (!Number.isFinite(material.weight) || material.weight <= 0) {
    return `${material.name.trim()} 须填写投料量 (t/h) 后才能计算物相成分`
  }
  return validateRatiosSulfurRequirement(material.ratios, material.name.trim())
}

export function sulfurInputStatus(ratios: CopperRatios): 'ok' | 'missing' | 'not_required' {
  if (!requiresSulfurInput(ratios)) return 'not_required'
  return hasValidSulfurInput(ratios) ? 'ok' : 'missing'
}
