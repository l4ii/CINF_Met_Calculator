import { validatePhaseFormulaInput } from './chemicalFormula.ts'
import {
  COPPER_PHASE_ASSIGNMENT_KEYS,
  COPPER_PHASE_OXYGEN_FACTORS,
  COPPER_PHASE_SULFUR_FACTORS,
  type CopperElementKey,
  type CopperPhaseAssignmentKey,
} from './copperWorkflowCalc.ts'
import { INPUT_PHASE_DISPLAY, getBuiltinPhaseFractions } from './copperPhaseTableCalc.ts'

export type MaterialPhaseAssistRow = {
  id: string
  kind: 'builtin' | 'custom' | 'draft'
  builtinKey?: CopperPhaseAssignmentKey
  formula: string
  displayLabel: string
  fractions: Partial<Record<CopperElementKey, number>>
}

export const DEFAULT_BUILTIN_PHASE_ORDER: CopperPhaseAssignmentKey[] = [...COPPER_PHASE_ASSIGNMENT_KEYS]

export function createDefaultMaterialPhaseRows(): MaterialPhaseAssistRow[] {
  return DEFAULT_BUILTIN_PHASE_ORDER.map((key) => ({
    id: key,
    kind: 'builtin' as const,
    builtinKey: key,
    formula: key,
    displayLabel: INPUT_PHASE_DISPLAY[key],
    fractions: getBuiltinPhaseFractions(key),
  }))
}

export function createDraftMaterialPhaseRow(): MaterialPhaseAssistRow {
  return {
    id: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    kind: 'draft',
    formula: '',
    displayLabel: '',
    fractions: {},
  }
}

export function findDuplicateMaterialPhase(
  rows: MaterialPhaseAssistRow[],
  formula: string,
  excludeRowId: string
): MaterialPhaseAssistRow | undefined {
  const normalized = formula.trim().toLowerCase()
  return rows.find((row) => {
    if (row.id === excludeRowId || row.kind === 'draft') return false
    if (row.formula.trim().toLowerCase() === normalized) return true
    if (row.builtinKey && row.builtinKey.toLowerCase() === normalized) return true
    return false
  })
}

export function resolveMaterialPhaseFormula(raw: string): {
  ok: boolean
  row?: Pick<MaterialPhaseAssistRow, 'formula' | 'displayLabel' | 'fractions'>
  errors: string[]
} {
  const trimmed = raw.trim()
  if (!trimmed) return { ok: false, errors: ['请输入物相'] }
  const parsed = validatePhaseFormulaInput(trimmed)
  if (!parsed.ok) return { ok: false, errors: parsed.errors }
  return {
    ok: true,
    errors: [],
    row: {
      formula: parsed.formula,
      displayLabel: parsed.displayLabel,
      fractions: parsed.elementFractions,
    },
  }
}

export function rowDraftStorageKey(materialId: string, rowId: string) {
  return `${materialId}:${rowId}`
}

export function phaseRowSulfurContribution(
  row: MaterialPhaseAssistRow,
  effectivePercent: number
): number {
  if (effectivePercent <= 0) return 0
  if (row.kind === 'builtin' && row.builtinKey) {
    return effectivePercent * (COPPER_PHASE_SULFUR_FACTORS[row.builtinKey] ?? 0)
  }
  return effectivePercent * (row.fractions['S (硫)'] ?? 0)
}

export function phaseRowOxygenContribution(row: MaterialPhaseAssistRow, effectivePercent: number): number {
  if (effectivePercent <= 0) return 0
  if (row.kind === 'builtin' && row.builtinKey) {
    return effectivePercent * (COPPER_PHASE_OXYGEN_FACTORS[row.builtinKey] ?? 0)
  }
  return effectivePercent * (row.fractions['O (氧)'] ?? 0)
}

export function phaseRowCarbonContribution(row: MaterialPhaseAssistRow, effectivePercent: number): number {
  if (effectivePercent <= 0) return 0
  if (row.kind === 'builtin' && row.builtinKey === 'C') return effectivePercent
  return effectivePercent * (row.fractions['C (碳)'] ?? 0)
}

export function moveMaterialPhaseRow(rows: MaterialPhaseAssistRow[], rowId: string, direction: 'up' | 'down') {
  const index = rows.findIndex((row) => row.id === rowId)
  if (index < 0) return rows
  const target = direction === 'up' ? index - 1 : index + 1
  if (target < 0 || target >= rows.length) return rows
  return reorderMaterialPhaseRow(rows, rowId, rows[target]!.id)
}

export function reorderMaterialPhaseRow(
  rows: MaterialPhaseAssistRow[],
  draggedId: string,
  targetId: string,
  position: 'before' | 'after' = 'before'
) {
  if (draggedId === targetId) return rows
  const fromIndex = rows.findIndex((row) => row.id === draggedId)
  const targetIndex = rows.findIndex((row) => row.id === targetId)
  if (fromIndex < 0 || targetIndex < 0) return rows
  const next = [...rows]
  const [item] = next.splice(fromIndex, 1)
  let insertIndex = targetIndex
  if (fromIndex < targetIndex) insertIndex -= 1
  if (position === 'after') insertIndex += 1
  next.splice(insertIndex, 0, item)
  return next
}

export function rowsForOrderedCalculation(rows: MaterialPhaseAssistRow[]) {
  return rows.filter((row) => row.kind !== 'draft')
}
