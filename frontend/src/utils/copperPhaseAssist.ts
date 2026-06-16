import { validatePhaseFormulaInput } from './chemicalFormula.ts'
import { CONCENTRATE_DEFAULT_PHASE_FORMULAS, concentratePhaseFractionsForFormula } from './copperConcentratePhaseNorm.ts'
import {
  COPPER_PHASE_OXYGEN_FACTORS,
  COPPER_PHASE_SULFUR_FACTORS,
  normalizeCopperRatios,
  type CopperElementKey,
  type CopperPhaseAssignmentKey,
  type CopperRatios,
} from './copperWorkflowCalc.ts'
import {
  INPUT_PHASE_DISPLAY,
  getBuiltinPhaseFractions,
  phaseStorageKeyToDisplayLabel,
} from './copperPhaseTableCalc.ts'
import {
  COPPER_BUILTIN_PHASE_DISPLAY_ORDER,
  materialPhaseRowSortIndex,
  sortCopperPhaseKeys,
  sortMaterialPhaseRows,
} from './copperDisplayOrder.ts'
import type { CopperMaterialColumn } from './copperWorkflowCalc.ts'
import { BATCH_PHASE_ASSIST_MIN_DISPLAY_COLUMNS } from './copperBatchTableLayout.ts'
import type { PhasePivotRow } from './copperPhaseBatchCalc.ts'

export type MaterialPhaseAssistRow = {
  id: string
  kind: 'builtin' | 'custom' | 'draft' | 'other'
  builtinKey?: CopperPhaseAssignmentKey
  formula: string
  displayLabel: string
  fractions: Partial<Record<CopperElementKey, number>>
}

/** 物相成分区列头：优先由存储键/分子式推导下标，兼容旧 persisted displayLabel */
export function materialPhaseRowDisplayLabel(row: MaterialPhaseAssistRow): string {
  if (row.kind === 'draft') return row.formula.trim() || '待填物相'
  if (row.kind === 'other') return 'Other'
  if (row.builtinKey) return INPUT_PHASE_DISPLAY[row.builtinKey]
  const formula = row.formula?.trim()
  if (formula) return phaseStorageKeyToDisplayLabel(formula)
  return row.displayLabel || row.id
}

export const DEFAULT_BUILTIN_PHASE_ORDER: CopperPhaseAssignmentKey[] = [
  ...COPPER_BUILTIN_PHASE_DISPLAY_ORDER.filter(
    (key) => !(['Cu2O', 'FeO', 'Fe2O3', 'Fe3O4'] as CopperPhaseAssignmentKey[]).includes(key)
  ),
]

export const SILICA_DEFAULT_PHASE_FORMULAS = ['SiO2', 'CaO', 'MgO', 'Fe', 'Other'] as const

/** 煤中 H2O 计入含水行，不作为物相列参与干基 w% 合计。 */
export const COAL_DEFAULT_PHASE_FORMULAS = [
  'C',
  'H',
  'S',
  'N',
  'O',
  'Fe2O3',
  'SiO2',
  'CaO',
  'MgO',
  'Other',
] as const

const ELEMENT_COMPONENT_PHASE_FRACTIONS: Partial<Record<string, Partial<Record<CopperElementKey, number>>>> = {
  H: { 'H(氢)': 1 },
  N: { 'N(氮)': 1 },
  O: { 'O(氧)': 1 },
}

const FORMULA_TO_ASSAY_RATIO_KEY: Partial<Record<string, CopperElementKey>> = {
  C: 'C (碳)',
  H: 'H(氢)',
  S: 'S (硫)',
  N: 'N(氮)',
  O: 'O(氧)',
  SiO2: 'SiO₂(二氧化硅)',
  CaO: 'CaO(氧化钙)',
  MgO: 'MgO(氧化镁)',
  Al2O3: 'Al₂O₃(三氧化二铝)',
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

function createElementComponentPhaseRow(formula: string): MaterialPhaseAssistRow | null {
  const fractions = ELEMENT_COMPONENT_PHASE_FRACTIONS[formula]
  if (!fractions) return null
  return {
    id: `custom:${formula}`,
    kind: 'custom',
    formula,
    displayLabel: phaseStorageKeyToDisplayLabel(formula),
    fractions,
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
      createOtherMaterialPhaseRow(),
    ]
  )
}

export function createMaterialPhaseRowsFromFormulas(formulas: string[]): MaterialPhaseAssistRow[] {
  const rows = formulas.flatMap((formula): MaterialPhaseAssistRow[] => {
    if (formula.trim().toLowerCase() === 'other') return [createOtherMaterialPhaseRow()]
    const trimmed = formula.trim()
    const elementComponentRow = createElementComponentPhaseRow(trimmed)
    if (elementComponentRow) return [elementComponentRow]
    const builtinKey = COPPER_BUILTIN_PHASE_DISPLAY_ORDER.find((key) => key.toLowerCase() === trimmed.toLowerCase())
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
    const concentrateFractions = concentratePhaseFractionsForFormula(trimmed)
    if (Object.keys(concentrateFractions).length > 0) {
      return [
        {
          id: `custom:${trimmed}`,
          kind: 'custom',
          formula: trimmed,
          displayLabel: phaseStorageKeyToDisplayLabel(trimmed),
          fractions: concentrateFractions,
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

export function createConcentrateMaterialPhaseRows(): MaterialPhaseAssistRow[] {
  return createMaterialPhaseRowsFromFormulas([...CONCENTRATE_DEFAULT_PHASE_FORMULAS])
}

export function createSilicaMaterialPhaseRows(): MaterialPhaseAssistRow[] {
  return createMaterialPhaseRowsFromFormulas([...SILICA_DEFAULT_PHASE_FORMULAS])
}

export function createCoalMaterialPhaseRows(): MaterialPhaseAssistRow[] {
  return createMaterialPhaseRowsFromFormulas([...COAL_DEFAULT_PHASE_FORMULAS])
}

export function createDefaultMaterialPhaseRowsForMaterial(
  material?: Pick<CopperMaterialColumn, 'id' | 'name' | 'kind'>
): MaterialPhaseAssistRow[] {
  const name = material?.name.trim() ?? ''
  const isSilica = material?.id === 'silica' || material?.id === 'solvent-silica' || name.includes('石英石')
  if (material?.kind === 'solvent' && isSilica) {
    return createSilicaMaterialPhaseRows()
  }
  if (material?.kind === 'fuel') {
    return createCoalMaterialPhaseRows()
  }
  return createDefaultMaterialPhaseRows()
}

function stripLegacyWaterRows(rows: MaterialPhaseAssistRow[]): MaterialPhaseAssistRow[] {
  return rows.filter((row) => row.id !== 'H2O' && row.formula !== 'H2O')
}

export function ensureMaterialPhaseRows(
  rows: MaterialPhaseAssistRow[] | undefined,
  material?: Pick<CopperMaterialColumn, 'id' | 'name' | 'kind'>
): MaterialPhaseAssistRow[] {
  if (!rows || rows.length === 0) return createDefaultMaterialPhaseRowsForMaterial(material)
  let next = stripLegacyWaterRows([...rows])
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

/** 物相总表列键：内置物相用 builtinKey，自定义物相用化学式 */
export function materialPhaseRowTableKey(row: MaterialPhaseAssistRow): string | null {
  if (row.kind === 'draft') return null
  if (row.kind === 'other' || row.id === 'Other') return 'Other'
  if (row.kind === 'builtin' && row.builtinKey) return row.builtinKey
  const formula = row.formula?.trim()
  return formula || row.id
}

export function materialPhaseRowTableKeys(rows: MaterialPhaseAssistRow[]): string[] {
  return ensureMaterialPhaseRows(rows)
    .map((row) => materialPhaseRowTableKey(row))
    .filter((key): key is string => Boolean(key))
}

export function mapPhaseContentsToTableKeys(
  phaseContents: Record<string, number>,
  rows: MaterialPhaseAssistRow[]
): Record<string, number> {
  const out: Record<string, number> = {}
  for (const row of ensureMaterialPhaseRows(rows)) {
    const pct = Math.max(0, phaseContents[row.id] ?? 0)
    if (pct <= 0) continue
    const key = materialPhaseRowTableKey(row)
    if (!key) continue
    out[key] = (out[key] ?? 0) + pct
  }
  return out
}

function componentPercentForFormula(formula: string, ratios: Record<CopperElementKey, number>): number {
  if (formula === 'Fe') {
    return Math.max(0, ratios['Fe(铁)'] ?? 0) + Math.max(0, ratios['FeO(氧化亚铁)'] ?? 0)
  }
  if (formula === 'Fe2O3') {
    return Math.max(0, ratios['FeO(氧化亚铁)'] ?? 0) || Math.max(0, ratios['Fe(铁)'] ?? 0)
  }
  const ratioKey = FORMULA_TO_ASSAY_RATIO_KEY[formula]
  return ratioKey ? Math.max(0, ratios[ratioKey] ?? 0) : 0
}

export function buildDefaultMaterialPhaseContentsByKey(
  ratios: CopperRatios,
  rows: MaterialPhaseAssistRow[]
): Record<string, number> {
  const normalized = normalizeCopperRatios(ratios)
  const out: Record<string, number> = {}
  let assigned = 0
  const otherKeys: string[] = []

  for (const row of ensureMaterialPhaseRows(rows)) {
    const key = materialPhaseRowTableKey(row)
    if (!key) continue
    if (row.kind === 'other' || key === 'Other') {
      otherKeys.push(key)
      continue
    }
    const pct = componentPercentForFormula(row.formula || key, normalized)
    out[key] = pct
    assigned += pct
  }

  const other = Math.max(0, 100 - assigned)
  for (const key of otherKeys.length > 0 ? otherKeys : ['Other']) {
    out[key] = other
  }
  return out
}

/** 汇总所有原料物相成分区行，生成物相总表列（含 O₂/N₂，末尾 Other） */
export function collectMaterialPhaseTableKeys(
  rawMaterials: CopperMaterialColumn[],
  materialPhaseRows: Record<string, MaterialPhaseAssistRow[]>
): string[] {
  const keys = new Set<string>()
  for (const material of rawMaterials) {
    if (!material.name.trim()) continue
    for (const key of materialPhaseRowTableKeys(materialPhaseRows[material.id] ?? [])) {
      if (key !== 'Other') keys.add(key)
    }
  }
  keys.add('O2')
  keys.add('N2')
  const sorted = sortCopperPhaseKeys(keys)
  sorted.push('Other')
  return sorted
}

export function mergePhaseTableRowKeys(materialKeys: string[], extraKeys: Iterable<string> = []): string[] {
  const merged = new Set([...materialKeys, ...extraKeys])
  merged.delete('Other')
  const sorted = sortCopperPhaseKeys(merged)
  sorted.push('Other')
  return sorted
}

export function buildBlendPhaseContentsByKey(
  results: Record<string, { valid?: boolean; phaseContents: Record<string, number> }>,
  rawMaterials: CopperMaterialColumn[],
  materialPhaseRows: Record<string, MaterialPhaseAssistRow[]>
): Record<string, number> {
  const weighted: Record<string, number> = {}
  let totalWeight = 0
  for (const material of rawMaterials) {
    const result = results[material.id]
    if (!result?.valid || material.weight <= 0) continue
    const rows = ensureMaterialPhaseRows(materialPhaseRows[material.id])
    const mapped = mapPhaseContentsToTableKeys(result.phaseContents, rows)
    totalWeight += material.weight
    for (const [key, pct] of Object.entries(mapped)) {
      weighted[key] = (weighted[key] ?? 0) + material.weight * pct
    }
  }
  if (totalWeight <= 0) return {}
  return Object.fromEntries(Object.entries(weighted).map(([key, sum]) => [key, sum / totalWeight]))
}

export type PhaseAssistDisplaySlot =
  | { kind: 'row'; row: MaterialPhaseAssistRow }
  | { kind: 'placeholder'; id: string }

export function buildPhaseAssistDisplaySlots(rows: MaterialPhaseAssistRow[]): PhaseAssistDisplaySlot[] {
  const sorted = sortMaterialPhaseRows(rows)
  const placeholderCount = Math.max(0, BATCH_PHASE_ASSIST_MIN_DISPLAY_COLUMNS - sorted.length)
  return [
    ...sorted.map((row) => ({ kind: 'row' as const, row })),
    ...Array.from({ length: placeholderCount }, (_, index) => ({
      kind: 'placeholder' as const,
      id: `phase-assist-placeholder-${index}`,
    })),
  ]
}

function phasePivotHasResult(pivot: PhasePivotRow | undefined): boolean {
  if (!pivot) return false
  if (pivot.phasePercent != null && pivot.phasePercent > 1e-12) return true
  return Object.values(pivot.elements).some((mass) => (mass ?? 0) > 1e-12)
}

/** 物相计算完成后仅保留有结果的物相列 */
export function filterPhaseAssistDisplaySlots(
  slots: PhaseAssistDisplaySlot[],
  phasePivotRows: PhasePivotRow[],
  hasPreview: boolean
): PhaseAssistDisplaySlot[] {
  if (!hasPreview) return slots
  return slots.filter((slot) => {
    if (slot.kind === 'placeholder') return false
    const pivot = phasePivotRows.find((item) => item.rowId === slot.row.id)
    return phasePivotHasResult(pivot)
  })
}
