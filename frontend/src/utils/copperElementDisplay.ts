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
  'H(氢)',
  'N(氮)',
  'C (碳)',
  'Other(其他)',
] as const

export type CopperElementDisplayMode = 'compound' | 'element'

export type CopperPhaseTableDisplayKey = CopperPhaseTableCompoundKey | (typeof COPPER_PHASE_TABLE_ELEMENT_VIEW_KEYS)[number]

const OXIDE_DECOMPOSE: Array<{
  compoundKey: CopperElementKey
  metalLabel: string
  metalElement?: string
  composition: FormulaComposition
  metalCount?: number
}> = [
  { compoundKey: 'SiO₂(二氧化硅)', metalLabel: 'Si', composition: { Si: 1, O: 2 } },
  { compoundKey: 'CaO(氧化钙)', metalLabel: 'Ca', composition: { Ca: 1, O: 1 } },
  { compoundKey: 'Al₂O₃(三氧化二铝)', metalLabel: 'Al', composition: { Al: 2, O: 3 }, metalCount: 2 },
]

const MG_OXIDE_KEY = 'MgO(氧化镁)' as CopperElementKey

const OXIDE_TO_ELEMENT_VIEW_KEY: Partial<Record<CopperElementKey, string>> = {
  'SiO₂(二氧化硅)': 'Si',
  'CaO(氧化钙)': 'Ca',
  'Al₂O₃(三氧化二铝)': 'Al',
  'MgO(氧化镁)': 'Mg',
}

const ELEMENT_VIEW_TO_OXIDE_KEY: Record<string, { key: CopperElementKey; composition: FormulaComposition; element: string }> = {
  Si: { key: 'SiO₂(二氧化硅)', composition: { Si: 1, O: 2 }, element: 'Si' },
  Ca: { key: 'CaO(氧化钙)', composition: { Ca: 1, O: 1 }, element: 'Ca' },
  Al: { key: 'Al₂O₃(三氧化二铝)', composition: { Al: 2, O: 3 }, element: 'Al' },
  Mg: { key: 'MgO(氧化镁)', composition: { Mg: 1, O: 1 }, element: 'Mg' },
}

const ELEMENT_VIEW_CANONICAL_KEY = new Map<string, CopperElementKey>(
  COPPER_ELEMENT_DISPLAY_ORDER.flatMap((key) => [
    [key, key],
    [key.replace(/\(.+\)/, '').trim(), key],
  ])
)

const COMPOUND_DISPLAY_ORDER = new Map<string, number>(
  COPPER_ELEMENT_DISPLAY_ORDER.map((key, index) => [key, index])
)

function addMass(target: Record<string, number>, key: string, mass: number) {
  if (mass <= 0) return
  target[key] = (target[key] ?? 0) + mass
}

function oxideOxygenContribution(ratios: Partial<Record<CopperElementKey, number>>): number {
  let oxygen = 0
  for (const { key, composition } of Object.values(ELEMENT_VIEW_TO_OXIDE_KEY)) {
    const mass = ratios[key] ?? 0
    if (mass > 0) oxygen += mass * elementMassFraction(composition, 'O')
  }
  return oxygen
}

const COMPOUND_KEY_SET = new Set<string>(COPPER_PHASE_TABLE_COMPOUND_KEYS)
const ELEMENT_VIEW_KEY_SET = new Set<string>(COPPER_PHASE_TABLE_ELEMENT_VIEW_KEYS)

/** 元素转换模式下的质量键：固定列保留 canonical 键，微量元素用符号 */
function toElementViewMassKey(key: string): string {
  if (ELEMENT_VIEW_KEY_SET.has(key)) return key
  return key.replace(/\(.+\)/, '').trim() || key
}

function normalizeCompoundSourceKey(sourceKey: CopperElementKey): CopperElementKey {
  return sourceKey
}

function mapSourceKeyToElementDisplayKey(sourceKey: CopperElementKey): string {
  const converted = OXIDE_TO_ELEMENT_VIEW_KEY[sourceKey]
  if (converted) return converted
  return toElementViewMassKey(sourceKey)
}

function sourceKeysHaveDecomposableOxide(sourceKeys: readonly CopperElementKey[]): boolean {
  return sourceKeys.some((key) => Boolean(OXIDE_TO_ELEMENT_VIEW_KEY[key]))
}

function displayInsertIndexForSourceKey(
  sourceKeys: readonly CopperElementKey[],
  targetSourceKey: CopperElementKey
): number {
  let insertAt = 0
  const seen = new Set<string>()
  for (const rawKey of sourceKeys) {
    const sourceKey = normalizeCompoundSourceKey(rawKey)
    if (sourceKey === targetSourceKey) return insertAt
    const displayKey = mapSourceKeyToElementDisplayKey(sourceKey)
    if (!seen.has(displayKey)) {
      seen.add(displayKey)
      insertAt++
    }
  }
  return insertAt
}

function ensureOxygenColumnInOrder(
  displayKeys: string[],
  sourceKeys: readonly CopperElementKey[]
): string[] {
  if (displayKeys.includes('O(氧)')) return displayKeys
  if (!sourceKeysHaveDecomposableOxide(sourceKeys)) return displayKeys

  const oxygenKey = 'O(氧)' as CopperElementKey
  const oInSource = sourceKeys.some((key) => normalizeCompoundSourceKey(key) === oxygenKey)
  let insertAt: number
  if (oInSource) {
    insertAt = displayInsertIndexForSourceKey(sourceKeys, oxygenKey)
  } else {
    const nIdx = displayKeys.indexOf('N(氮)')
    insertAt = nIdx >= 0 ? nIdx : displayKeys.length
  }

  const next = [...displayKeys]
  next.splice(insertAt, 0, 'O(氧)')
  return next
}

function phaseAssistRowKeySortIndex(key: string): number {
  const oxide = ELEMENT_VIEW_TO_OXIDE_KEY[key]
  if (oxide) {
    const compoundIdx = COMPOUND_DISPLAY_ORDER.get(oxide.key)
    if (compoundIdx != null) return compoundIdx
  }
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

  for (const { compoundKey, metalLabel, metalElement = metalLabel, composition, metalCount = 1 } of OXIDE_DECOMPOSE) {
    const compoundMass = elements[compoundKey] ?? 0
    if (compoundMass <= 0) continue
    consumed.add(compoundKey)
    const metalFrac = elementMassFraction(composition, metalElement)
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
    if (!mass || consumed.has(key)) continue
    const displayKey = toElementViewMassKey(key)
    if (mass > 0) addMass(out, displayKey, mass)
    else out[displayKey] = (out[displayKey] ?? 0) + mass
  }

  return out
}

export function elementSymbolLabel(key: string): string {
  if (key === 'S(硅)') return 'Si'
  return key.replace(/\s*\(.+\)/g, '').trim()
}

export function phaseTableHeaderLabel(key: string, mode: 'compound' | 'element'): string {
  if (mode === 'compound') {
    return elementSymbolLabel(key)
  }
  if (key === 'Si' || key === 'Ca' || key === 'Al' || key === 'Mg') return key
  return elementSymbolLabel(key)
}

export function getPhaseTableColumnKeys(mode: 'compound' | 'element') {
  if (mode === 'compound') return [...COPPER_PHASE_TABLE_COMPOUND_KEYS]
  return buildElementTableDisplayKeys(COPPER_PHASE_TABLE_COMPOUND_KEYS, 'element')
}

export function elementTableHeaderLabel(key: string, mode: CopperElementDisplayMode): string {
  return phaseTableHeaderLabel(key, mode)
}

export function decomposeElementTableRatios(
  ratios: Partial<Record<CopperElementKey, number>>,
  mode: CopperElementDisplayMode
): Record<string, number> {
  if (mode === 'compound') {
    return { ...ratios } as Record<string, number>
  }
  return decomposePhaseElementMasses(ratios, mode)
}

/** 元素切换后的显示合计：氧化物已拆出 O，合计按显示值求和；不需要也不允许用负 O 闭合。 */
export function calculateElementTableDisplayTotal(
  ratios: Partial<Record<CopperElementKey, number>>,
  mode: CopperElementDisplayMode
): number {
  const displayed = decomposeElementTableRatios(ratios, mode)
  return Object.values(displayed).reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0)
}

/** 旧版表格中 O 行常用作闭合差额：100 - 非 O 项合计，可为负值，仅用于解释/兼容展示。 */
export function calculateLegacyClosureOxygen(
  ratios: Partial<Record<CopperElementKey, number>>
): number {
  const nonOxygenTotal = Object.entries(ratios).reduce((sum, [key, value]) => {
    if (key === 'O(氧)') return sum
    return sum + Math.max(0, Number.isFinite(value) ? Number(value) : 0)
  }, 0)
  return 100 - nonOxygenTotal
}

export function buildElementTableDisplayKeys(
  sourceKeys: readonly CopperElementKey[],
  mode: CopperElementDisplayMode
): string[] {
  const pushUnique = (target: string[], seen: Set<string>, key: string) => {
    if (seen.has(key)) return
    seen.add(key)
    target.push(key)
  }

  if (mode === 'compound') {
    const result: string[] = []
    const seen = new Set<string>()
    for (const sourceKey of sourceKeys) {
      pushUnique(result, seen, normalizeCompoundSourceKey(sourceKey))
    }
    return result
  }

  const result: string[] = []
  const seen = new Set<string>()
  for (const rawKey of sourceKeys) {
    const sourceKey = normalizeCompoundSourceKey(rawKey)
    const displayKey = mapSourceKeyToElementDisplayKey(sourceKey)
    pushUnique(result, seen, displayKey)
  }
  return ensureOxygenColumnInOrder(result, sourceKeys)
}

export function elementTableDisplaySourceKeys(
  displayKey: string,
  sourceKeys: readonly CopperElementKey[],
  mode: CopperElementDisplayMode
): CopperElementKey[] {
  if (mode === 'compound') return sourceKeys.filter((key) => key === displayKey)

  return sourceKeys.filter((sourceKey) => {
    const convertedKey = OXIDE_TO_ELEMENT_VIEW_KEY[sourceKey]
    if (displayKey === 'O(氧)' && convertedKey) return true
    if (convertedKey) return convertedKey === displayKey
    return toElementViewMassKey(sourceKey) === displayKey
  })
}

export function elementTableDisplayEditTarget(
  displayKey: string,
  mode: CopperElementDisplayMode
): CopperElementKey | null {
  if (mode === 'compound') return displayKey as CopperElementKey
  return ELEMENT_VIEW_TO_OXIDE_KEY[displayKey]?.key ?? ELEMENT_VIEW_CANONICAL_KEY.get(displayKey) ?? null
}

export function elementTableDisplayValueToStorageValue(
  displayKey: string,
  displayValue: number,
  currentRatios: Partial<Record<CopperElementKey, number>>,
  mode: CopperElementDisplayMode
): number {
  if (mode === 'compound') return displayValue

  const oxide = ELEMENT_VIEW_TO_OXIDE_KEY[displayKey]
  if (oxide) {
    const fraction = elementMassFraction(oxide.composition, oxide.element)
    return fraction > 0 ? displayValue / fraction : displayValue
  }

  if (displayKey === 'O(氧)') {
    return Math.max(0, displayValue - oxideOxygenContribution(currentRatios))
  }

  return displayValue
}
