import type { AntimonyElementKey, AntimonyMaterialColumn, AntimonyRatios } from './antimonyWorkflowCalc.ts'
import { calculateKnownTotal, closeAntimonyRatios } from './antimonyWorkflowCalc.ts'

export function requiresSulfurInput(ratios: AntimonyRatios): boolean {
  return (ratios['Cu(铜)'] ?? 0) > 0 || (ratios['Fe(铁)'] ?? 0) > 0
}

export function hasValidSulfurInput(ratios: AntimonyRatios): boolean {
  const sulfur = ratios['S (硫)']
  return Number.isFinite(sulfur) && (sulfur ?? 0) > 0
}

export function validateLibraryDialogElementColumns(
  columns: Array<{ rawName: string; element: AntimonyElementKey | null }>
): string | null {
  const filled = columns.filter((col) => col.rawName.trim().length > 0)
  if (filled.length === 0) {
    return '请至少添加一个元素列并填写元素名称。'
  }
  for (const col of filled) {
    if (!col.element) {
      return `无法识别的元素/化合物：${col.rawName.trim()}，请修改。`
    }
  }
  const elements = filled
    .map((col) => col.element)
    .filter((element): element is AntimonyElementKey => element != null)
  if (new Set(elements).size !== elements.length) {
    return '存在重复的元素列，请合并或删除重复列。'
  }
  return null
}

export function validateRatiosSulfurRequirement(ratios: AntimonyRatios, materialName = '该原料'): string | null {
  if (requiresSulfurInput(ratios) && !hasValidSulfurInput(ratios)) {
    return `${materialName} 含 Cu/Fe，须填写 S(硫) 元素含量`
  }
  return null
}

export function validateMaterialForPhaseCalc(
  material: Pick<AntimonyMaterialColumn, 'name' | 'weight' | 'ratios'>
): string | null {
  if (!material.name.trim()) return '请先选择或填写原料名称'
  if (!Number.isFinite(material.weight) || material.weight <= 0) {
    return `${material.name.trim()} 须填写投料量 (t/h) 后才能计算物相成分`
  }
  return validateRatiosSulfurRequirement(material.ratios, material.name.trim())
}

export function sulfurInputStatus(ratios: AntimonyRatios): 'ok' | 'missing' | 'not_required' {
  if (!requiresSulfurInput(ratios)) return 'not_required'
  return hasValidSulfurInput(ratios) ? 'ok' : 'missing'
}

const TOTAL_TOLERANCE = 1e-6

/** 配料总表化验存储：不自动补 Other；保留有符号闭合 O */
function normalizeAssayRatios(ratios: AntimonyRatios): Record<AntimonyElementKey, number> {
  return closeAntimonyRatios(ratios, { fillOther: false, scaleWhenOver100: false, preserveSignedOxygen: true })
}

export function isRawMaterialKnownTotalOverLimit(ratios: AntimonyRatios): boolean {
  const normalized = normalizeAssayRatios(ratios)
  return calculateKnownTotal({ ...normalized, 'O(氧)': 0 }) > 100 + TOTAL_TOLERANCE
}

export type RawMaterialRatioValidationStatus = 'ok' | 'over_limit' | 'other_trimmed'

export type RawMaterialRatioValidationResult = {
  ratios: Record<AntimonyElementKey, number>
  status: RawMaterialRatioValidationStatus
  knownTotal: number
  previousOther: number
  newOther: number
  previousTotal: number
  newTotal: number
}

export type RawMaterialPhaseClosureGap = {
  total: number
  gap: number
}

function formatPct(value: number) {
  return Number(value.toFixed(4)).toString()
}

export function calculateRawMaterialEnteredTotal(ratios: AntimonyRatios): number {
  const normalized = normalizeAssayRatios(ratios)
  return calculateKnownTotal(normalized) + Math.max(0, normalized['Other(其他)'] ?? 0)
}

export function rawMaterialPhaseClosureGap(ratios: AntimonyRatios): RawMaterialPhaseClosureGap | null {
  const total = calculateRawMaterialEnteredTotal(ratios)
  if (total <= TOTAL_TOLERANCE || total >= 100 - TOTAL_TOLERANCE) return null
  return { total, gap: 100 - total }
}

export function formatRawMaterialPhaseClosureMessage(
  materialName: string,
  closure: RawMaterialPhaseClosureGap
): { text: string; tone: 'warning' } {
  const name = materialName.trim() || '该原料'
  return {
    text: `${name} 元素合计 ${formatPct(closure.total)}%，未闭合 ${formatPct(closure.gap)}%；物相计算将通过 O / C / Other 反算闭合到 100%。`,
    tone: 'warning',
  }
}

/** 原料元素合计校验：已知元素超 100 则标红；否则将 Other 削减至合计 100% */
export function applyRawMaterialRatioTotalValidation(ratios: AntimonyRatios): RawMaterialRatioValidationResult {
  const base = normalizeAssayRatios(ratios)
  const known = calculateKnownTotal(base)
  const knownExcludingClosureO = calculateKnownTotal({ ...base, 'O(氧)': 0 })
  const previousOther = base['Other(其他)'] ?? 0
  const previousTotal = known + previousOther

  if (knownExcludingClosureO > 100 + TOTAL_TOLERANCE && (base['O(氧)'] ?? 0) >= 0) {
    return {
      ratios: { ...base, 'Other(其他)': 0 },
      status: 'over_limit',
      knownTotal: knownExcludingClosureO,
      previousOther,
      newOther: 0,
      previousTotal,
      newTotal: knownExcludingClosureO,
    }
  }

  if (known + previousOther > 100 + TOTAL_TOLERANCE) {
    const newOther = Math.max(0, 100 - known)
    return {
      ratios: { ...base, 'Other(其他)': newOther },
      status: 'other_trimmed',
      knownTotal: known,
      previousOther,
      newOther,
      previousTotal,
      newTotal: known + newOther,
    }
  }

  return {
    ratios: base,
    status: 'ok',
    knownTotal: known,
    previousOther,
    newOther: previousOther,
    previousTotal,
    newTotal: previousTotal,
  }
}

export function rawMaterialValidatedRatiosChanged(
  before: AntimonyRatios,
  result: RawMaterialRatioValidationResult
): boolean {
  return Object.keys(result.ratios).some(
    (key) => Math.abs((result.ratios[key as AntimonyElementKey] ?? 0) - (before[key as AntimonyElementKey] ?? 0)) > 1e-9
  )
}

/** 右上角黄色警示：说明检测到的问题及已执行的 Other 修正 */
export function formatRawMaterialRatioValidationMessage(
  materialName: string,
  result: RawMaterialRatioValidationResult
): { text: string; tone: 'warning' } | null {
  const name = materialName.trim() || '该原料'
  if (result.status === 'over_limit') {
    return {
      text: `${name}：已知元素合计 ${formatPct(result.knownTotal)}% 已超过 100%（原合计 ${formatPct(result.previousTotal)}%）。已将 Other 由 ${formatPct(result.previousOther)}% 调整为 0%；请核对各元素含量。`,
      tone: 'warning',
    }
  }
  if (result.status === 'other_trimmed') {
    return {
      text: `${name}：元素合计 ${formatPct(result.previousTotal)}% 超过 100%。已将 Other 由 ${formatPct(result.previousOther)}% 调整为 ${formatPct(result.newOther)}%，合计现为 ${formatPct(result.newTotal)}%。`,
      tone: 'warning',
    }
  }
  return null
}
