import { validatePhaseFormulaInput } from './chemicalFormula.ts'
import {
  COPPER_PHASE_OXYGEN_FACTORS,
  COPPER_PHASE_SULFUR_FACTORS,
  type CopperElementKey,
  type CopperPhaseAssignmentKey,
} from './copperWorkflowCalc.ts'
import { COPPER_PHASE_H2O_KEY } from './copperElementDisplay.ts'
import { INPUT_PHASE_DISPLAY, getBuiltinPhaseFractions } from './copperPhaseTableCalc.ts'
import {
  COPPER_BUILTIN_PHASE_DISPLAY_ORDER,
  materialPhaseRowSortIndex,
  sortMaterialPhaseRows,
} from './copperDisplayOrder.ts'

export type MaterialPhaseAssistRow = {
  id: string
  kind: 'builtin' | 'custom' | 'draft' | 'water' | 'other'
  builtinKey?: CopperPhaseAssignmentKey
  formula: string
  displayLabel: string
  fractions: Partial<Record<CopperElementKey, number>>
}

export const DEFAULT_BUILTIN_PHASE_ORDER: CopperPhaseAssignmentKey[] = [
  ...COPPER_BUILTIN_PHASE_DISPLAY_ORDER.filter(
    (key) => !(['Cu2O', 'FeO', 'Fe2O3', 'Fe3O4'] as CopperPhaseAssignmentKey[]).includes(key)
  ),
]

export function createWaterMaterialPhaseRow(): MaterialPhaseAssistRow {
  return {
    id: 'H2O',
    kind: 'water',
    formula: 'H2O',
    displayLabel: 'H₂O',
    fractions: { [COPPER_PHASE_H2O_KEY]: 1 },
  }
}

export function createOtherMaterialPhaseRow(): MaterialPhaseAssistRow {
  return {
    id: 'Other',
    kind: 'other',
    formula: 'Other',
    displayLabel: 'Other',
    fractions: { 'Other(其他)': 1 },
  }
}

export function createDefaultMaterialPhaseRows(): MaterialPhaseAssistRow[] {
  return sortMaterialPhaseRows(
    [
      ...DEFAULT_BUILTIN_PHASE_ORDER.map((key) => ({
        id: key,
        kind: 'builtin' as const,
        builtinKey: key,
        formula: key,
        displayLabel: INPUT_PHASE_DISPLAY[key],
        fractions: getBuiltinPhaseFractions(key),
      })),
      createWaterMaterialPhaseRow(),
      createOtherMaterialPhaseRow(),
    ]
  )
}

export function createMaterialPhaseRowsFromFormulas(formulas: string[]): MaterialPhaseAssistRow[] {
  const rows = formulas.flatMap((formula): MaterialPhaseAssistRow[] => {
    if (formula.trim().toLowerCase() === 'other') return [createOtherMaterialPhaseRow()]
    const builtinKey = COPPER_BUILTIN_PHASE_DISPLAY_ORDER.find((key) => key.toLowerCase() === formula.trim().toLowerCase())
    if (builtinKey) {
      return [
        {
          id: builtinKey,
          kind: 'builtin',
          builtinKey,
          formula: builtinKey,
          displayLabel: INPUT_PHASE_DISPLAY[builtinKey],
          fractions: getBuiltinPhaseFractions(builtinKey),
        },
      ]
    }
    const resolved = resolveMaterialPhaseFormula(formula)
    if (!resolved.ok || !resolved.row) return []
    return [
      {
        id: `custom:${resolved.row.formula}`,
        kind: 'custom',
        formula: resolved.row.formula,
        displayLabel: resolved.row.displayLabel,
        fractions: resolved.row.fractions,
      },
    ]
  })
  return ensureMaterialPhaseRows(rows)
}

export function ensureMaterialPhaseRows(rows: MaterialPhaseAssistRow[] | undefined): MaterialPhaseAssistRow[] {
  if (!rows || rows.length === 0) return createDefaultMaterialPhaseRows()
  let next = [...rows]
  if (!next.some((row) => row.kind === 'water' || row.id === 'H2O')) {
    next = [...next, createWaterMaterialPhaseRow()]
  }
  if (!next.some((row) => row.kind === 'other' || row.id === 'Other')) {
    next = [...next, createOtherMaterialPhaseRow()]
  }
  return sortMaterialPhaseRows(next)
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
    if (row.kind === 'other' && normalized === 'other') return true
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
  if (row.kind === 'other') return 0
  if (row.kind === 'builtin' && row.builtinKey) {
    return effectivePercent * (COPPER_PHASE_SULFUR_FACTORS[row.builtinKey] ?? 0)
  }
  return effectivePercent * (row.fractions['S (硫)'] ?? 0)
}

export function phaseRowOxygenContribution(row: MaterialPhaseAssistRow, effectivePercent: number): number {
  if (effectivePercent <= 0) return 0
  if (row.kind === 'other') return 0
  if (row.kind === 'builtin' && row.builtinKey) {
    return effectivePercent * (COPPER_PHASE_OXYGEN_FACTORS[row.builtinKey] ?? 0)
  }
  return effectivePercent * (row.fractions['O(氧)'] ?? 0)
}

export function phaseRowCarbonContribution(row: MaterialPhaseAssistRow, effectivePercent: number): number {
  if (effectivePercent <= 0) return 0
  if (row.kind === 'other') return 0
  if (row.kind === 'builtin' && row.builtinKey === 'C') return effectivePercent
  return effectivePercent * (row.fractions['C (碳)'] ?? 0)
}

/** 计算用行序：固定 canonical 序，与用户拖拽无关 */
export function rowsForPhaseCalculation(rows: MaterialPhaseAssistRow[]) {
  return [...rows]
    .filter((row) => row.kind !== 'draft')
    .sort((a, b) => {
      const diff = materialPhaseRowSortIndex(a) - materialPhaseRowSortIndex(b)
      if (diff !== 0) return diff
      return a.id.localeCompare(b.id)
    })
}

/** @deprecated 使用 rowsForPhaseCalculation */
export const rowsForOrderedCalculation = rowsForPhaseCalculation
