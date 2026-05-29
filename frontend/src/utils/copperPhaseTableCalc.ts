import {
  COPPER_ELEMENT_KEYS,
  COPPER_PHASE_ASSIGNMENT_KEYS,
  COPPER_PHASE_OXYGEN_FACTORS,
  calculateKnownTotal,
  calculateUnknownsFromPhases,
  derivePhaseContentsFromElements,
  normalizeCopperRatios,
  type CopperElementKey,
  type CopperPhaseAssignmentKey,
  type CopperPhaseInput,
  type CopperRatios,
} from './copperWorkflowCalc.ts'

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
  C: 'C',
}

export const INPUT_PHASE_ROW_KEYS = [...COPPER_PHASE_ASSIGNMENT_KEYS, 'Other'] as const
export type InputPhaseRowKey = (typeof INPUT_PHASE_ROW_KEYS)[number]

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

const CU_IN_CU2S = (2 * 63.546) / 159.16
const CU_IN_CU2O = (2 * 63.546) / 143.09
const FE_IN_FEO = 55.845 / 71.844
const FE_IN_FE2O3 = (2 * 55.845) / 159.688
const FE_IN_FE3O4 = (3 * 55.845) / 231.533
const FE_IN_FES = 55.845 / 87.91
const SI_IN_SIO2 = 28.085 / 60.084
const CA_IN_CAO = 40.078 / 56.077
const AL_IN_AL2O3 = (2 * 26.982) / 101.961
const S_IN_CU2S = 32.066 / 159.16
const S_IN_FES = 32.066 / 87.91

const PHASE_ELEMENT_FRACTIONS: Record<CopperPhaseAssignmentKey, Partial<Record<CopperElementKey, number>>> = {
  Cu2S: { 'Cu(铜)': CU_IN_CU2S, 'S (硫)': S_IN_CU2S },
  FeS: { 'Fe(铁)': FE_IN_FES, 'S (硫)': S_IN_FES },
  S: { 'S (硫)': 1 },
  Cu2O: { 'Cu(铜)': CU_IN_CU2O, 'O (氧)': COPPER_PHASE_OXYGEN_FACTORS.Cu2O ?? 0 },
  FeO: { 'Fe(铁)': FE_IN_FEO, 'O (氧)': COPPER_PHASE_OXYGEN_FACTORS.FeO ?? 0 },
  Fe2O3: { 'Fe(铁)': FE_IN_FE2O3, 'O (氧)': COPPER_PHASE_OXYGEN_FACTORS.Fe2O3 ?? 0 },
  Fe3O4: { 'Fe(铁)': FE_IN_FE3O4, 'O (氧)': COPPER_PHASE_OXYGEN_FACTORS.Fe3O4 ?? 0 },
  SiO2: { 'Si(硅)': SI_IN_SIO2, 'O (氧)': COPPER_PHASE_OXYGEN_FACTORS.SiO2 ?? 0 },
  CaO: { 'Ca(钙)': CA_IN_CAO, 'O (氧)': COPPER_PHASE_OXYGEN_FACTORS.CaO ?? 0 },
  Al2O3: { 'Al(铝)': AL_IN_AL2O3, 'O (氧)': COPPER_PHASE_OXYGEN_FACTORS.Al2O3 ?? 0 },
  C: { 'C (碳)': 1 },
}

export function getBuiltinPhaseFractions(key: CopperPhaseAssignmentKey) {
  return PHASE_ELEMENT_FRACTIONS[key]
}

const TRACE_ELEMENTS = COPPER_ELEMENT_KEYS.filter(
  (key) => !['Cu(铜)', 'Fe(铁)', 'S (硫)', 'Si(硅)', 'Ca(钙)', 'Al(铝)', 'C (碳)', 'O (氧)', 'Other(其他)', 'N (氮)'].includes(key)
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
  return normalizePhasePercents(blended)
}

export function buildOxygenAirPhaseColumn(ratios: CopperRatios) {
  const oPct = Math.max(0, ratios['O (氧)'] ?? 0)
  const nPct = Math.max(0, ratios['N (氮)'] ?? 0)
  const total = oPct + nPct
  const o2 = total > 0 ? oPct : 0
  const n2 = total > 0 ? nPct : 0
  const oMoles = o2 / 32
  const nMoles = n2 / 28
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
    COPPER_PHASE_ASSIGNMENT_KEYS.map((key) => [key, { value: normalized[key] ?? 0, factor: 1 }])
  ) as Record<string, CopperPhaseInput>
  for (const [key, input] of Object.entries(phaseInputs)) {
    if (phaseDict[key]) phaseDict[key] = input
  }
  const unknowns = calculateUnknownsFromPhases(phaseDict, elements)
  elements['O (氧)'] = unknowns['O (氧)']
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
