import type { CopperMaterialColumn } from './copperWorkflowCalc.ts'
import {
  formatRawMaterialPhaseClosureMessage,
  rawMaterialPhaseClosureGap,
  validateMaterialForPhaseCalc,
} from './copperMaterialValidation.ts'
import type { BatchContextHint } from '../components/modules/WorkflowContextHint.tsx'

function firstMaterialNeedingPhaseClosure(
  rawMaterials: CopperMaterialColumn[]
): BatchContextHint | null {
  const pending = rawMaterials
    .filter(
      (material) =>
        material.name.trim()
    )
    .flatMap((material) => {
      const closure = rawMaterialPhaseClosureGap(material.ratios)
      if (!closure) return []
      return [{ material, closure }]
    })

  const first = pending[0]
  if (!first) return null

  const notice = formatRawMaterialPhaseClosureMessage(first.material.name, first.closure)
  const suffix = pending.length > 1 ? `另有 ${pending.length - 1} 种原料也未闭合。` : ''
  return {
    anchor: 'phaseClosure',
    materialId: first.material.id,
    title: '闭合提示',
    tone: notice.tone,
    message: `${notice.text}${suffix}双击 O 或 C 列进入物相计算。`,
  }
}

export function resolveBatchWorkflowHint(params: {
  rawMaterials: CopperMaterialColumn[]
  phaseCompletedMaterials: Record<string, boolean>
  showElementAssist: boolean
  processParametersConfirmed?: boolean
  batchTableView: string
  activeSheet: string
  hasActiveCase: boolean
}): BatchContextHint | null {
  const {
    rawMaterials,
    phaseCompletedMaterials,
    showElementAssist,
    batchTableView,
    activeSheet,
    hasActiveCase,
  } = params

  if (
    activeSheet !== 'cu_smelting' &&
    activeSheet !== 'cu_refining' &&
    activeSheet !== 'cu_converting'
  ) {
    return null
  }
  if (!hasActiveCase) return null

  const isConverting = activeSheet === 'cu_converting'

  if (isConverting) {
    if (batchTableView === 'element') {
      return {
        anchor: 'parametersTab',
        message: '吹炼元素表只读：请切换到「投入-物料物相表」编辑投料量与物相%',
      }
    }
    if (batchTableView === 'phase') {
      const unweighed = rawMaterials.find((material) => material.name.trim() && !(material.weight > 0))
      if (unweighed) {
        return {
          anchor: 'rawWeight',
          materialId: unweighed.id,
          message: '投料(物相表)：请填写投料量 (t/h)，物相%已有默认值可直接改',
        }
      }
      const needsPhase = rawMaterials.find(
        (material) =>
          material.name.trim() &&
          material.weight > 0 &&
          !phaseCompletedMaterials[material.id]
      )
      if (needsPhase) {
        return {
          anchor: 'rawWeight',
          materialId: needsPhase.id,
          message: '投料(物相表)：请确认该原料物相合计为 100% 后再进入产出约束',
        }
      }
      return { anchor: 'parametersTab', message: '产出约束：物相已就绪，可直接进入产出约束并计算产出' }
    }
    return null
  }

  const closureHint = firstMaterialNeedingPhaseClosure(rawMaterials)
  if (closureHint) return closureHint

  if (showElementAssist) {
    const needsPhase = rawMaterials.some(
      (material) =>
        material.name.trim() &&
        material.weight > 0 &&
        validateMaterialForPhaseCalc(material) === null &&
        !phaseCompletedMaterials[material.id]
    )
    if (needsPhase) {
      return { anchor: 'phaseCalculate', message: '投入物相：确认物相行后点击「计算」，结果将自动回填配料总表' }
    }
    return null
  }

  if (batchTableView !== 'element') {
    const allPhaseReady = rawMaterials.every(
      (material) =>
        !material.name.trim() ||
        (material.weight > 0 && phaseCompletedMaterials[material.id])
    )
    if (batchTableView === 'phase' && allPhaseReady) {
      return { anchor: 'parametersTab', message: '产出计算：物相已就绪，可进入产出计算并填写关键参数' }
    }
    return null
  }

  const unnamed = rawMaterials.find((material) => !material.name.trim())
  if (unnamed) {
    return { anchor: 'rawName', materialId: unnamed.id, message: '原料：请在此选择原料' }
  }

  const unweighed = rawMaterials.find((material) => material.name.trim() && !(material.weight > 0))
  if (unweighed) {
    return { anchor: 'rawWeight', materialId: unweighed.id, message: '原料投料量：请填写投料量 (t/h)' }
  }

  const needsPhase = rawMaterials.find(
    (material) =>
      material.name.trim() &&
      material.weight > 0 &&
      validateMaterialForPhaseCalc(material) === null &&
      !phaseCompletedMaterials[material.id]
  )
  if (needsPhase) {
    return {
      anchor: 'rawPhaseOC',
      materialId: needsPhase.id,
      element: 'O(氧)',
      message: '投入物相：双击 O 或 C 列进入物相计算',
    }
  }

  return { anchor: 'parametersTab', message: '产出计算：请进入产出计算并确认关键参数' }
}
