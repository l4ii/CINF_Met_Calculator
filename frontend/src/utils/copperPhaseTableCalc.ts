import {
  COPPER_ELEMENT_KEYS,
  COPPER_PHASE_ASSIGNMENT_KEYS,
  calculateUnknownsFromPhases,
  deriveDryBasisMoisturePercent,
  derivePhaseContentsFromElements,
  materialWaterWeight,
  normalizeCopperRatios,
  type CopperElementKey,
  type CopperPhaseAssignmentKey,
  type CopperPhaseInput,
  type CopperRatios,
} from './copperWorkflowCalc.ts'
import { COMPOUND_MOLAR_MASS } from './atomicMass.ts'
import { formulaToDisplayLabel } from './chemicalFormula.ts'
import { COPPER_BUILTIN_PHASE_FRACTIONS } from './copperPhaseStoichiometry.ts'
import { buildInputPhaseRowKeys } from './copperDisplayOrder.ts'
import { PRODUCT_PHASE_DISPLAY } from './copperProductPhaseCalc.ts'

export const INPUT_PHASE_DISPLAY: Record<CopperPhaseAssignmentKey, string> = {
  Cu2S: 'Cu₂S',
  FeS: 'FeS',
  S: 'S',
  Cu2O: 'Cu₂O',
  FeO: 'FeO',
  Fe2O3: 'Fe₂O₃',
  Fe3O4: 'Fe₃O₄',
  SiO2: 'SiO₂',
  CaO: 'CaO',
  Al2O3: 'Al₂O₃',
  PbO: 'PbO',
  As2O3: 'As₂O₃',
  Sb2O3: 'Sb₂O₃',
  ZnO: 'ZnO',
  C: 'C',
}

export type InputPhaseRowKey = CopperPhaseAssignmentKey | 'Other'

export const INPUT_PHASE_EXTRA_DISPLAY: Record<'Other', string> = {
  Other: 'Other',
}

/** 物相总表/导出等存储键 → 带化学下标的显示名（O₂/N₂ 在总表中仍显示为 O/N） */
export function phaseStorageKeyToDisplayLabel(key: string): string {
  if (key === 'O2') return 'O'
  if (key === 'N2') return 'N'
  const inputDisplay = INPUT_PHASE_DISPLAY[key as CopperPhaseAssignmentKey]
  if (inputDisplay) return inputDisplay
  const extraDisplay = INPUT_PHASE_EXTRA_DISPLAY[key as 'Other']
  if (extraDisplay) return extraDisplay
  const productDisplay = PRODUCT_PHASE_DISPLAY[key]
  if (productDisplay) return productDisplay
  return formulaToDisplayLabel(key)
}

export const INPUT_PHASE_ROW_KEYS = buildInputPhaseRowKeys() as readonly InputPhaseRowKey[]

export type PhasePercentMap = Partial<Record<InputPhaseRowKey, number>>
export type PhasePercentDraftMap = Partial<Record<InputPhaseRowKey, string>>

export type CustomPhaseRow = {
  id: string
  formula: string
  displayLabel: string
  fractions: Partial<Record<CopperElementKey, number>>
}

export type CustomPhasePercentMap = Record<string, number>

export const CUSTOM_PHASE_KEY_PREFIX = 'custom:'

export function customPhaseStorageKey(rowId: string) {
  return `${CUSTOM_PHASE_KEY_PREFIX}${rowId}`
}

export function isCustomPhaseStorageKey(key: string) {
  return key.startsWith(CUSTOM_PHASE_KEY_PREFIX)
}

export function parseCustomPhasePercents(
  stored: Record<string, string> | undefined,
  customRows: CustomPhaseRow[] = []
): CustomPhasePercentMap {
  if (!stored || customRows.length === 0) return {}
  return Object.fromEntries(
    customRows
      .map((row) => {
        const text = stored[customPhaseStorageKey(row.id)]?.trim() ?? ''
        const value = text === '' ? 0 : Number(text)
        return [row.id, Number.isFinite(value) ? Math.max(0, value) : 0] as const
      })
      .filter(([, value]) => value > 0)
  )
}

export function customPhasePercentsTotal(customPercents: CustomPhasePercentMap) {
  return Object.values(customPercents).reduce((sum, value) => sum + Math.max(0, value), 0)
}

const PHASE_ELEMENT_FRACTIONS = COPPER_BUILTIN_PHASE_FRACTIONS as Record<
  CopperPhaseAssignmentKey,
  Partial<Record<CopperElementKey, number>>
>

export function getBuiltinPhaseFractions(key: CopperPhaseAssignmentKey) {
  return PHASE_ELEMENT_FRACTIONS[key]
}

const TRACE_ELEMENTS = COPPER_ELEMENT_KEYS.filter(
  (key) =>
    ![
      'Cu(铜)',
      'Fe(铁)',
      'S (硫)',
      'SiO₂(二氧化硅)',
      'CaO(氧化钙)',
      'Al₂O₃(三氧化二铝)',
      'Pb(铅)',
      'As(砷)',
      'Zn(锌)',
      'Sb(锑)',
      'C (碳)',
      'O(氧)',
      'Other(其他)',
      'N(氮)',
    ].includes(key)
)

export function phaseColumnTotal(phases: PhasePercentMap, customPercents: CustomPhasePercentMap = {}) {
  const fixed = INPUT_PHASE_ROW_KEYS.reduce((sum, key) => sum + Math.max(0, phases[key] ?? 0), 0)
  return fixed + customPhasePercentsTotal(customPercents)
}

export function isPhaseColumnValid(
  phases: PhasePercentMap,
  tolerance = 0.02,
  customPercents: CustomPhasePercentMap = {}
) {
  const total = phaseColumnTotal(phases, customPercents)
  return Math.abs(total - 100) <= tolerance
}

export function normalizePhasePercents(phases: PhasePercentMap): PhasePercentMap {
  const assigned = COPPER_PHASE_ASSIGNMENT_KEYS.reduce((sum, key) => sum + Math.max(0, phases[key] ?? 0), 0)
  const other = Math.max(0, phases.Other ?? Math.max(0, 100 - assigned))
  const raw = { ...phases, Other: other }
  const total = phaseColumnTotal(raw)
  if (total <= 0) return Object.fromEntries(INPUT_PHASE_ROW_KEYS.map((key) => [key, 0])) as PhasePercentMap
  const scale = 100 / total
  return Object.fromEntries(
    INPUT_PHASE_ROW_KEYS.map((key) => [key, Math.max(0, (raw[key] ?? 0) * scale)])
  ) as PhasePercentMap
}

export function buildInputPhaseColumn(
  ratios: CopperRatios,
  phaseInputs: Record<string, CopperPhaseInput> = {},
  overrides?: PhasePercentMap | null
): PhasePercentMap {
  if (overrides && Object.keys(overrides).length > 0) {
    return normalizePhasePercents(overrides)
  }
  const derived = derivePhaseContentsFromElements(ratios, phaseInputs)
  const raw = Object.fromEntries(COPPER_PHASE_ASSIGNMENT_KEYS.map((key) => [key, Math.max(0, derived[key] ?? 0)])) as PhasePercentMap
  return normalizePhasePercents(raw)
}

export function buildBlendPhaseColumn(
  columns: Array<{ weight: number; phases: PhasePercentMap }>
): PhasePercentMap {
  const totalWeight = columns.reduce((sum, column) => sum + Math.max(0, column.weight), 0)
  if (totalWeight <= 0) {
    return Object.fromEntries(INPUT_PHASE_ROW_KEYS.map((key) => [key, 0])) as PhasePercentMap
  }
  const blended = Object.fromEntries(
    INPUT_PHASE_ROW_KEYS.map((key) => [
      key,
      columns.reduce((sum, column) => sum + Math.max(0, column.weight) * Math.max(0, column.phases[key] ?? 0), 0) / totalWeight,
    ])
  ) as PhasePercentMap
  const total = phaseColumnTotal(blended)
  if (Math.abs(total - 100) <= 0.05) return blended
  return normalizePhasePercents(blended)
}

export type FurnaceBlendPhaseColumnInput =
  | { weight: number; phases: PhasePercentMap; moisture?: number; waterWeight?: number }
  | { weight: number; oxygenWeightPct: { O2: number; N2: number } }

/** 入炉混料物相：原料 + 熔剂 + 燃料 + 富氧空气按非水质量加权（含 O₂/N₂ 行） */
export function buildFurnaceBlendPhaseColumn(columns: FurnaceBlendPhaseColumnInput[]): {
  phases: PhasePercentMap
  gasWeightPct: { O2: number; N2: number }
  moisture: number
} {
  const active = columns.filter((column) => column.weight > 0)
  const solidColumns = active.filter((column): column is Extract<FurnaceBlendPhaseColumnInput, { phases: PhasePercentMap }> => 'phases' in column)
  const gasColumns = active.filter((column): column is Extract<FurnaceBlendPhaseColumnInput, { oxygenWeightPct: { O2: number; N2: number } }> => 'oxygenWeightPct' in column)
  const solidWeight = solidColumns.reduce((sum, column) => sum + Math.max(0, column.weight), 0)
  const gasWeight = gasColumns.reduce((sum, column) => sum + Math.max(0, column.weight), 0)
  const nonWaterWeight = solidWeight + gasWeight
  if (nonWaterWeight <= 0) {
    return {
      phases: Object.fromEntries(INPUT_PHASE_ROW_KEYS.map((key) => [key, 0])) as PhasePercentMap,
      gasWeightPct: { O2: 0, N2: 0 },
      moisture: 0,
    }
  }

  const phases = Object.fromEntries(
    INPUT_PHASE_ROW_KEYS.map((key) => [
      key,
      solidColumns.reduce(
        (sum, column) => sum + Math.max(0, column.weight) * Math.max(0, column.phases[key] ?? 0) / 100,
        0
      ) / nonWaterWeight * 100,
    ])
  ) as PhasePercentMap

  let o2Sum = 0
  let n2Sum = 0
  let moistureSum = 0
  for (const column of active) {
    if ('oxygenWeightPct' in column) {
      o2Sum += column.weight * Math.max(0, column.oxygenWeightPct.O2)
      n2Sum += column.weight * Math.max(0, column.oxygenWeightPct.N2)
    } else {
      const water = materialWaterWeight({
        weight: column.weight,
        waterWeight: column.waterWeight,
        moisture: column.moisture,
      })
      moistureSum += deriveDryBasisMoisturePercent(column.weight, water) * column.weight
    }
  }

  return {
    phases,
    gasWeightPct: { O2: o2Sum / nonWaterWeight, N2: n2Sum / nonWaterWeight },
    moisture: moistureSum / Math.max(solidWeight, 1e-12),
  }
}

export function buildOxygenAirPhaseColumn(ratios: CopperRatios) {
  const o2Pct = Math.max(0, ratios['O(氧)'] ?? 0)
  const n2Pct = Math.max(0, ratios['N(氮)'] ?? 0)
  const total = o2Pct + n2Pct
  const o2 = total > 0 ? o2Pct : 0
  const n2 = total > 0 ? n2Pct : 0
  const oMoles = o2 / COMPOUND_MOLAR_MASS.O2
  const nMoles = n2 / COMPOUND_MOLAR_MASS.N2
  const moleTotal = oMoles + nMoles
  return {
    weightPct: { O2: o2, N2: n2 },
    volumePct: {
      O2: moleTotal > 0 ? (oMoles / moleTotal) * 100 : 0,
      N2: moleTotal > 0 ? (nMoles / moleTotal) * 100 : 0,
    },
  }
}

export function deriveElementsFromPhaseContents(
  phases: PhasePercentMap,
  currentRatios: CopperRatios = {},
  phaseInputs: Record<string, CopperPhaseInput> = {},
  customPhases: CustomPhaseRow[] = [],
  customPercents: CustomPhasePercentMap = {}
): Record<CopperElementKey, number> {
  const normalized = normalizePhasePercents(phases)
  const elements = Object.fromEntries(COPPER_ELEMENT_KEYS.map((key) => [key, 0])) as Record<CopperElementKey, number>

  for (const phaseKey of COPPER_PHASE_ASSIGNMENT_KEYS) {
    const pct = normalized[phaseKey] ?? 0
    if (pct <= 0) continue
    const fractions = PHASE_ELEMENT_FRACTIONS[phaseKey]
    for (const [element, fraction] of Object.entries(fractions) as [CopperElementKey, number][]) {
      elements[element] = (elements[element] ?? 0) + pct * fraction
    }
  }

  for (const row of customPhases) {
    const pct = customPercents[row.id] ?? 0
    if (pct <= 0) continue
    for (const [element, fraction] of Object.entries(row.fractions) as [CopperElementKey, number][]) {
      elements[element] = (elements[element] ?? 0) + pct * fraction
    }
  }

  for (const element of TRACE_ELEMENTS) {
    elements[element] = currentRatios[element] ?? 0
  }

  const phaseDict = Object.fromEntries(
    COPPER_PHASE_ASSIGNMENT_KEYS.map((key) => [key, normalized[key] ?? 0])
  ) as Record<string, CopperPhaseInput>
  phaseDict.Other = normalized.Other ?? 0
  for (const [key, input] of Object.entries(phaseInputs)) {
    if (phaseDict[key]) phaseDict[key] = input
  }
  const unknowns = calculateUnknownsFromPhases(phaseDict, elements)
  elements['O(氧)'] = unknowns['O(氧)']
  elements['C (碳)'] = unknowns['C (碳)']
  elements['Other(其他)'] = unknowns['Other(其他)']

  return normalizeCopperRatios(elements)
}

export function parsePhaseDraftMap(drafts: PhasePercentDraftMap): PhasePercentMap {
  const parsed = Object.fromEntries(
    INPUT_PHASE_ROW_KEYS.map((key) => {
      const text = drafts[key]?.trim() ?? ''
      const value = text === '' ? 0 : Number(text)
      return [key, Number.isFinite(value) ? Math.max(0, value) : 0]
    })
  ) as PhasePercentMap
  return parsed
}

export function parsePhaseDraftMapWithCustom(
  drafts: Record<string, string>,
  customRows: CustomPhaseRow[] = []
): { fixed: PhasePercentMap; custom: CustomPhasePercentMap } {
  const fixedDrafts = Object.fromEntries(
    INPUT_PHASE_ROW_KEYS.map((key) => [key, drafts[key]])
  ) as PhasePercentDraftMap
  return {
    fixed: parsePhaseDraftMap(fixedDrafts),
    custom: parseCustomPhasePercents(drafts, customRows),
  }
}
