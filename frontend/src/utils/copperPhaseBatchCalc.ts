import type { CopperElementKey, CopperRatios, PhaseAssistRowSpec } from './copperWorkflowCalc.ts'
import {
  calculateOrderedPhaseElementCompletion,
  normalizeCopperRatios,
} from './copperWorkflowCalc.ts'
import {
  allocateConcentratePhases,
  shouldUseConcentrateNormativeAllocator,
  type ConcentratePhaseKey,
} from './copperConcentratePhaseNorm.ts'
import {
  buildBlendPhaseColumn,
  normalizePhasePercents,
  type PhasePercentMap,
} from './copperPhaseTableCalc.ts'
import type { MaterialPhaseAssistRow } from './copperPhaseAssist.ts'
import { materialPhaseRowDisplayLabel } from './copperPhaseAssist.ts'
import { getBuiltinPhaseFractions } from './copperPhaseTableCalc.ts'
import {
  COPPER_PHASE_TABLE_COMPOUND_KEYS,
} from './copperElementDisplay.ts'

export type PhaseUnknownValues = Pick<Record<CopperElementKey, number>, 'O(氧)' | 'C (碳)' | 'Other(其他)'>

export type PhaseMaterialCalcResult = {
  materialId: string
  materialName: string
  weight: number
  phaseContents: Record<string, number>
  unknowns: PhaseUnknownValues
  valid: boolean
  status?: string
  message?: string
}

/** 物相区表头元素列（化合物口径） */
export const COPPER_PHASE_TABLE_ELEMENT_KEYS = [...COPPER_PHASE_TABLE_COMPOUND_KEYS] as const

export function toPhaseAssistSpecs(rows: MaterialPhaseAssistRow[]): PhaseAssistRowSpec[] {
  return rows
    .filter((row) => row.kind !== 'draft')
    .map((row) => ({
      id: row.id,
      kind: row.kind as PhaseAssistRowSpec['kind'],
      builtinKey: row.kind === 'builtin' ? row.builtinKey : undefined,
      fractions: row.fractions,
    }))
}

function mapNormativePhasesToRowContents(
  rows: MaterialPhaseAssistRow[],
  phases: Record<ConcentratePhaseKey, number>
): Record<string, number> {
  const contents: Record<string, number> = {}
  for (const row of rows) {
    if (row.kind === 'draft') continue
    if (row.kind === 'other' || row.id === 'Other') {
      contents[row.id] = phases.Other
      continue
    }
    const formula = (row.builtinKey ?? row.formula).trim() as ConcentratePhaseKey
    const pct = phases[formula] ?? 0
    if (pct > 0) contents[row.id] = pct
  }
  return contents
}

export function computeMaterialPhaseResult(
  materialId: string,
  materialName: string,
  weight: number,
  ratios: CopperRatios,
  rows: MaterialPhaseAssistRow[]
): PhaseMaterialCalcResult {
  if (shouldUseConcentrateNormativeAllocator(ratios)) {
    const normalized = normalizeCopperRatios(ratios)
    const phases = allocateConcentratePhases(ratios)
    return {
      materialId,
      materialName,
      weight,
      phaseContents: mapNormativePhasesToRowContents(rows, phases),
      unknowns: {
        'O(氧)': normalized['O(氧)'] ?? 0,
        'C (碳)': normalized['C (碳)'] ?? 0,
        'Other(其他)': normalized['Other(其他)'] ?? 0,
      },
      valid: true,
      status: 'ok',
    }
  }
  const result = calculateOrderedPhaseElementCompletion(ratios, toPhaseAssistSpecs(rows))
  return {
    materialId,
    materialName,
    weight,
    phaseContents: result.phaseContents,
    unknowns: result.unknowns,
    valid: result.valid !== false,
    status: result.status,
    message: result.message,
  }
}

/** 行级物相 w% → 投入物相 canonical 键（自定义物相并入 Other） */
export function phaseContentsToInputPhaseMap(
  phaseContents: Record<string, number>,
  rows: MaterialPhaseAssistRow[] = [],
  unknowns: Partial<PhaseUnknownValues> = {}
): PhasePercentMap {
  const raw: PhasePercentMap = {}
  let customTotal = 0
  for (const row of rows) {
    const pct = Math.max(0, phaseContents[row.id] ?? 0)
    if (pct <= 0) continue
    if (row.kind === 'builtin' && row.builtinKey) {
      raw[row.builtinKey] = (raw[row.builtinKey] ?? 0) + pct
    } else if (row.kind === 'custom') {
      customTotal += pct
    } else if (row.kind === 'other') {
      raw.Other = (raw.Other ?? 0) + pct
    }
  }
  if (customTotal > 0) raw.Other = (raw.Other ?? 0) + customTotal
  const closureOther = Math.max(0, unknowns['Other(其他)'] ?? 0)
  if (closureOther > 0) raw.Other = Math.max(raw.Other ?? 0, closureOther)
  return normalizePhasePercents(raw)
}

/** 混料物相：各原料物相 w% 按投料量加权求和后再归一化为 100% */
export function buildBlendPhaseFromMaterialResults(
  results: PhaseMaterialCalcResult[],
  rowsByMaterial: Record<string, MaterialPhaseAssistRow[]>
): PhasePercentMap {
  const columns = results
    .filter((item) => item.weight > 0)
    .map((item) => ({
      weight: item.weight,
      phases: phaseContentsToInputPhaseMap(
        item.phaseContents,
        rowsByMaterial[item.materialId] ?? [],
        item.unknowns
      ),
    }))
  if (columns.length === 0) {
    return normalizePhasePercents({})
  }
  return buildBlendPhaseColumn(columns)
}

/** 化验中未入物相行的 trace 元素 %（计入 w% 合计以闭合 100%） */
const TRACE_ELEMENT_KEYS = ['Ag(银)', 'Au(金)', 'Pb(铅)', 'As(砷)', 'Zn(锌)', 'Sb(锑)'] as const

export function traceAssayNotInPhaseRows(
  ratios: CopperRatios,
  elementTotalsInPhases: Partial<Record<CopperElementKey, number>>
): number {
  const normalized = normalizeCopperRatios(ratios)
  return TRACE_ELEMENT_KEYS.reduce((sum, key) => {
    const assay = normalized[key] ?? 0
    const inPhases = elementTotalsInPhases[key] ?? 0
    return sum + Math.max(0, assay - inPhases)
  }, 0)
}

export function phaseRowElementContributions(
  row: MaterialPhaseAssistRow,
  phasePercent: number,
  feedRateTh = 0
): Partial<Record<string, number>> {
  if (phasePercent <= 0) return {}
  const out: Partial<Record<string, number>> = {}
  const fractions =
    row.kind === 'builtin' && row.builtinKey
      ? getBuiltinPhaseFractions(row.builtinKey)
      : row.fractions ?? {}
  const phaseMassTh = feedRateTh > 0 ? (phasePercent / 100) * feedRateTh : 0
  for (const [element, fraction] of Object.entries(fractions) as [string, number][]) {
    if (!fraction || fraction <= 0) continue
    if (feedRateTh > 0) {
      out[element] = (out[element] ?? 0) + phaseMassTh * fraction
    } else {
      out[element] = (out[element] ?? 0) + phasePercent * fraction
    }
  }
  return out
}

export type PhasePivotRow = {
  rowId: string
  label: string
  phasePercent: number | null
  /** 物相干基质量流量 t/h（由求解结果 phasePercent 与投料量计算，非表格显示值反推） */
  phaseMassTh: number | null
  elements: Partial<Record<string, number>>
}

export function buildPhasePivotRows(
  rows: MaterialPhaseAssistRow[],
  phaseContents: Record<string, number> | null,
  feedRateTh = 0
): PhasePivotRow[] {
  return rows
    .filter((row) => row.kind !== 'draft')
    .map((row) => {
      const pct = phaseContents ? phaseContents[row.id] ?? null : null
      const phasePercent = pct == null ? null : Math.max(0, pct)
      if (phasePercent == null || phasePercent <= 0) {
        return {
          rowId: row.id,
          label: materialPhaseRowDisplayLabel(row),
          phasePercent: null,
          phaseMassTh: null,
          elements: {},
        }
      }
      const phaseMassTh = feedRateTh > 0 ? (phasePercent / 100) * feedRateTh : null
      return {
        rowId: row.id,
        label: materialPhaseRowDisplayLabel(row),
        phasePercent,
        phaseMassTh,
        elements: phaseRowElementContributions(row, phasePercent, feedRateTh),
      }
    })
}

/** 物相 w% 与元素质量流量合计（干基下应约 100% / ≈ 投料量） */
export function sumPhasePivotTotals(pivotRows: PhasePivotRow[]) {
  const elements: Record<string, number> = {}
  let phaseTotal = 0
  let totalMassTh = 0
  for (const row of pivotRows) {
    if (row.phasePercent != null) phaseTotal += row.phasePercent
    if (row.phaseMassTh != null && row.phaseMassTh > 0) totalMassTh += row.phaseMassTh
    for (const [key, value] of Object.entries(row.elements)) {
      if (!value || value <= 0) continue
      elements[key] = (elements[key] ?? 0) + value
    }
  }
  return { phaseTotal, totalMassTh, elements }
}

/** 干基物相 w% 闭合（求解校验用） */
export function phaseMassPercentClosure(
  ratios: CopperRatios,
  phaseTotal: number,
  unknowns: PhaseUnknownValues,
  elementTotalsInPhases: Partial<Record<CopperElementKey, number>>,
  feedRateTh = 0
): number {
  const elementTotalsPct =
    feedRateTh > 0
      ? (Object.fromEntries(
          Object.entries(elementTotalsInPhases).map(([key, value]) => [key, ((value ?? 0) / feedRateTh) * 100])
        ) as Partial<Record<CopperElementKey, number>>)
      : elementTotalsInPhases
  const otherAlreadyInPhaseRows = (elementTotalsPct['Other(其他)'] ?? 0) > 1e-9
  const trace = otherAlreadyInPhaseRows ? 0 : traceAssayNotInPhaseRows(ratios, elementTotalsPct)
  const completion = otherAlreadyInPhaseRows ? 0 : unknowns['Other(其他)'] ?? 0
  return phaseTotal + completion + trace
}

export function formatPhasePercentDraft(phases: PhasePercentMap): Record<string, string> {
  return Object.fromEntries(
    Object.entries(phases).map(([key, value]) => [key, Number(value ?? 0).toFixed(2)])
  )
}
