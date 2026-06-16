import { elementMassFraction, type FormulaComposition } from './atomicMass.ts'
import { COPPER_ELEMENT_DISPLAY_ORDER } from './copperDisplayOrder.ts'
import { batchTableHasResult } from './batchTableNumeric.ts'
import { BATCH_PHASE_ASSIST_MIN_DISPLAY_ELEMENT_ROWS } from './copperBatchTableLayout.ts'
import type { CopperElementKey } from './copperWorkflowCalc.ts'

/** 物相成分表列（化合物口径） */
export const COPPER_PHASE_TABLE_COMPOUND_KEYS = [
  'Cu(铜)',
  'S (硫)',
  'Fe(铁)',
  'SiO₂(二氧化硅)',
  'CaO(氧化钙)',
  'Ag(银)',
  'Au(金)',
  'Pb(铅)',
  'As(砷)',
  'Zn(锌)',
  'Al₂O₃(三氧化二铝)',
  'Sb(锑)',
  'O(氧)',
  'N(氮)',
  'C (碳)',
  'Other(其他)',
] as const

export type CopperPhaseTableCompoundKey = (typeof COPPER_PHASE_TABLE_COMPOUND_KEYS)[number]

/** 元素转换后的显示列 */
export const COPPER_PHASE_TABLE_ELEMENT_VIEW_KEYS = [
  'Cu(铜)',
  'S (硫)',
  'Fe(铁)',
  'Si',
  'Ca',
  'Ag(银)',
  'Au(金)',
  'Pb(铅)',
  'As(砷)',
  'Zn(锌)',
  'Al',
  'Mg',
  'Sb(锑)',
  'O(氧)',
  'N(氮)',
  'C (碳)',
  'Other(其他)',
] as const

export type CopperPhaseTableDisplayKey = CopperPhaseTableCompoundKey | (typeof COPPER_PHASE_TABLE_ELEMENT_VIEW_KEYS)[number]

const OXIDE_DECOMPOSE: Array<{
  compoundKey: CopperElementKey
  metalLabel: string
  composition: FormulaComposition
  metalCount?: number
}> = [
  { compoundKey: 'SiO₂(二氧化硅)', metalLabel: 'Si', composition: { Si: 1, O: 2 } },
  { compoundKey: 'CaO(氧化钙)', metalLabel: 'Ca', composition: { Ca: 1, O: 1 } },
  { compoundKey: 'Al₂O₃(三氧化二铝)', metalLabel: 'Al', composition: { Al: 2, O: 3 }, metalCount: 2 },
]

const MG_OXIDE_KEY = 'MgO(氧化镁)' as CopperElementKey

function addMass(target: Record<string, number>, key: string, mass: number) {
  if (mass <= 0) return
  target[key] = (target[key] ?? 0) + mass
}

const COMPOUND_KEY_SET = new Set<string>(COPPER_PHASE_TABLE_COMPOUND_KEYS)
const ELEMENT_VIEW_KEY_SET = new Set<string>(COPPER_PHASE_TABLE_ELEMENT_VIEW_KEYS)

/** 元素转换模式下的质量键：固定列保留 canonical 键，微量元素用符号 */
function toElementViewMassKey(key: string): string {
  if (ELEMENT_VIEW_KEY_SET.has(key)) return key
  return key.replace(/\(.+\)/, '').trim() || key
}

function phaseAssistRowKeySortIndex(key: string): number {
  const idx = COPPER_ELEMENT_DISPLAY_ORDER.findIndex(
    (canonical) => canonical === key || canonical.replace(/\(.+\)/, '').trim() === key
  )
  return idx >= 0 ? idx : COPPER_ELEMENT_DISPLAY_ORDER.length + 1
}

export type PhaseAssistElementRowSlot =
  | { kind: 'element'; key: string }
  | { kind: 'placeholder'; id: string }

/** 物相辅助表元素行：计算后有结果的微量元素行 */
export function visiblePhaseAssistElementRowKeys(
  displayTotals: Record<string, number>,
  baseKeys: readonly string[],
  hasPreview: boolean
): string[] {
  if (!hasPreview) return [...baseKeys]

  const keys = new Set<string>(baseKeys)
  for (const [key, mass] of Object.entries(displayTotals)) {
    if (batchTableHasResult(mass)) keys.add(key)
  }

  return [...keys]
    .filter((key) => batchTableHasResult(displayTotals[key] ?? 0))
    .sort((a, b) => {
      const order = phaseAssistRowKeySortIndex(a) - phaseAssistRowKeySortIndex(b)
      return order !== 0 ? order : a.localeCompare(b, 'zh-CN')
    })
}

/** 物相辅助表左侧元素行槽位：未计算时占位行，计算后展开有结果的元素行 */
export function buildPhaseAssistElementRowSlots(
  displayTotals: Record<string, number>,
  baseKeys: readonly string[],
  hasPreview: boolean,
  minPlaceholderRows = BATCH_PHASE_ASSIST_MIN_DISPLAY_ELEMENT_ROWS
): PhaseAssistElementRowSlot[] {
  if (!hasPreview) {
    return Array.from({ length: minPlaceholderRows }, (_, index) => ({
      kind: 'placeholder' as const,
      id: `phase-assist-element-placeholder-${index}`,
    }))
  }
  return visiblePhaseAssistElementRowKeys(displayTotals, baseKeys, true).map((key) => ({
    kind: 'element' as const,
    key,
  }))
}

/** 将物相表元素质量流量 (t/h) 转为化合物或纯元素显示 */
export function decomposePhaseElementMasses(
  elements: Partial<Record<CopperElementKey, number>>,
  mode: 'compound' | 'element'
): Record<string, number> {
  if (mode === 'compound') {
    const out: Record<string, number> = {}
    for (const key of COPPER_PHASE_TABLE_COMPOUND_KEYS) {
      const v = elements[key as CopperElementKey] ?? 0
      if (v > 0) out[key] = v
    }
    for (const [key, mass] of Object.entries(elements) as [CopperElementKey, number][]) {
      if (!mass || mass <= 0 || COMPOUND_KEY_SET.has(key)) continue
      out[key] = mass
    }
    return out
  }

  const out: Record<string, number> = {}
  const consumed = new Set<string>()

  for (const { compoundKey, metalLabel, composition, metalCount = 1 } of OXIDE_DECOMPOSE) {
    const compoundMass = elements[compoundKey] ?? 0
    if (compoundMass <= 0) continue
    consumed.add(compoundKey)
    const metalFrac = elementMassFraction(composition, metalLabel)
    const oFrac = elementMassFraction(composition, 'O')
    addMass(out, metalLabel, compoundMass * metalFrac)
    addMass(out, 'O(氧)', compoundMass * oFrac)
  }

  const mgMass = elements[MG_OXIDE_KEY] ?? 0
  if (mgMass > 0) {
    consumed.add(MG_OXIDE_KEY)
    addMass(out, 'Mg', mgMass * elementMassFraction({ Mg: 1, O: 1 }, 'Mg'))
    addMass(out, 'O(氧)', mgMass * elementMassFraction({ Mg: 1, O: 1 }, 'O'))
  }

  for (const [key, mass] of Object.entries(elements) as [CopperElementKey, number][]) {
    if (!mass || mass <= 0 || consumed.has(key)) continue
    addMass(out, toElementViewMassKey(key), mass)
  }

  return out
}

export function phaseTableHeaderLabel(key: string, mode: 'compound' | 'element'): string {
  if (mode === 'compound') {
    return key.replace(/\(.+\)/, '')
  }
  if (key === 'Si' || key === 'Ca' || key === 'Al' || key === 'Mg') return key
  return key.replace(/\(.+\)/, '')
}

export function getPhaseTableColumnKeys(mode: 'compound' | 'element') {
  return mode === 'compound' ? [...COPPER_PHASE_TABLE_COMPOUND_KEYS] : [...COPPER_PHASE_TABLE_ELEMENT_VIEW_KEYS]
}
