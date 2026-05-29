import { useEffect, useMemo, useRef, useState, type DragEvent as ReactDragEvent, type ReactNode, type RefObject } from 'react'
import type { SheetId } from '../../types'
import { APP_NAME_ZH } from '../../constants/appCopy'
import { btnPrimary, btnSecondary, cardBase, hintText, inputBase, inputSm, sectionTitle } from '../../theme/uiTheme'
import {
  buildCopperBatchExportFilename,
  buildCopperBatchWorkbookHtml,
  downloadCopperBatchExcel,
  getCopperStageExportName,
  type CopperBatchExportColumn,
  type CopperBatchExportRow,
  type CopperBatchWorkbookSheet,
} from '../../utils/copperBatchExport'
import { CopperBatchPhaseTables, type PhaseTableColumn } from './CopperBatchPhaseTables'
import {
  buildInputPhaseColumn,
  buildOxygenAirPhaseColumn,
  deriveElementsFromPhaseContents,
  INPUT_PHASE_DISPLAY,
  INPUT_PHASE_ROW_KEYS,
  isPhaseColumnValid,
  normalizePhasePercents,
  parsePhaseDraftMap,
  type CustomPhaseRow,
  type InputPhaseRowKey,
  type PhasePercentMap,
} from '../../utils/copperPhaseTableCalc'
import {
  createDefaultMaterialPhaseRows,
  createDraftMaterialPhaseRow,
  findDuplicateMaterialPhase,
  reorderMaterialPhaseRow,
  phaseRowCarbonContribution,
  phaseRowOxygenContribution,
  phaseRowSulfurContribution,
  resolveMaterialPhaseFormula,
  rowDraftStorageKey,
  rowsForOrderedCalculation,
  type MaterialPhaseAssistRow,
} from '../../utils/copperPhaseAssist'
import { sulfurInputStatus, validateMaterialForPhaseCalc, validateRatiosSulfurRequirement } from '../../utils/copperMaterialValidation'
import {
  buildProductPhaseReviewRows,
  calculateGasVolumePercents,
  calculateProductPhaseComposition,
  deriveProductElementsFromPhases,
  isProductPhaseColumnValid,
  parseProductPhaseDraftMap,
  PRODUCT_PHASE_DISPLAY,
  PRODUCT_PHASE_ROWS,
  type ProductPhasePercentMap,
} from '../../utils/copperProductPhaseCalc'
import { calculateCopperEquipmentSizing, normalizeScaleWanTpa } from '../../utils/copperEquipmentSizing'
import {
  COPPER_ELEMENT_KEYS,
  COPPER_MATERIAL_LIBRARY,
  calculateCopperIterativeBalance,
  calculateKnownTotal,
  calculateOrderedPhaseElementCompletion,
  calculateWeightedComposition,
  deriveOrderedPhaseContents,
  createDefaultCopperMaterials,
  createOxygenAirColumn,
  createDefaultSolventColumns,
  emptyCopperRatios,
  parseCopperLibraryCsv,
  type CopperElementKey,
  type CopperIterativeBalanceResult,
  type CopperPhaseAssignmentKey,
  type CopperPhaseInput,
  type CopperLibraryMaterial,
  type CopperMaterialColumn,
  type CopperRatios,
  type CopperSolventSolution,
} from '../../utils/copperWorkflowCalc'
import {
  DEFAULT_COPPER_FUEL,
  calculateCopperHeatBalance,
  calculateCopperProducts,
  type CopperFuelMaterial,
  type CopperProductKey,
  type CopperProductResult,
} from '../../utils/copperProcessCalc'

interface CopperWorkflowProps {
  darkMode: boolean
  language?: 'zh' | 'en'
  activeSheet: SheetId
  onStageSelect: (sheet: SheetId) => void
  caseTitleDraft?: string
  onActiveCaseNameChange?: (name: string | null) => void
}

type PhaseDraftEntry = { value: string; factor: string }
type PhaseDraft = Record<string, PhaseDraftEntry>
type PhaseUnknowns = Pick<Record<CopperElementKey, number>, 'O (氧)' | 'C (碳)' | 'Other(其他)'>
type PhasePreviewUnknowns = { materialId: string; phaseContents: Record<string, number>; values: PhaseUnknowns }
type SingleLibraryRow = { id: string; libraryMaterialId?: string; name: string; ratios: CopperRatios }
type LibraryMaterialDialogMode = 'add' | 'edit'
type EquipmentStageId = 'smelting' | 'converting' | 'refining'
type SolveInputStatus = 'none' | 'pending' | 'resolved'
type CopperCaseStageId = Extract<SheetId, 'cu_smelting' | 'cu_converting' | 'cu_refining' | 'cu_equipment'>
type DraftRatioKind = 'raw' | 'solvent' | 'fuel' | 'gas'
type BatchTableView = 'element' | 'phase'
type CopperProcessStageId = Extract<SheetId, 'cu_smelting' | 'cu_converting' | 'cu_refining'>

const COPPER_CASES_STORAGE_KEY = 'metcal.copper.cases.v1'
const METCAL_COPPER_CASE_FILE_TYPE = 'metcal-copper-case'

interface CopperCaseRecord {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  stageId: CopperCaseStageId
  rawMaterials: CopperMaterialColumn[]
  rawWeightDrafts: Record<string, string>
  solventColumns: CopperMaterialColumn[]
  fuelColumn: CopperFuelMaterial
  oxygenAirColumn: CopperMaterialColumn
  targetFeSiO2: string
  targetCaOSiO2: string
  solventSolution: CopperSolventSolution | null
  phaseDrafts: Record<string, PhaseDraft>
  phaseCompletedMaterials: Record<string, boolean>
  phasePreviewUnknowns: PhasePreviewUnknowns | null
  solventPreviewSolution: CopperSolventSolution | null
  productPreviewReady: boolean
  heatPreviewReady: boolean
  manualPhaseCells: Record<string, boolean>
  manualSolventWeights: Record<string, boolean>
  manualFuelWeightValid: boolean
  phaseCompleted: boolean
  productCalculated: boolean
  heatBalanced: boolean
  fuelLhv: string
  fuelEfficiency: string
  oxygenAirO2Pct: string
  oxygenAirN2Pct: string
  oxygenSupplyCoefficient: string
  feedTemperature: string
  matteTemperature: string
  slagTemperature: string
  gasTemperature: string
  dustTemperature: string
  heatLossMJh: string
  otherHeatMJh: string
  annualHours: string
  equipmentIntensity: string
  targetScaleWanTpa: string
  equipmentAdjustments: Record<EquipmentStageId, string>
  batchTableView?: BatchTableView
  phaseRatioOverrides?: Record<string, Record<string, string>>
  manualPhaseRatioColumns?: Record<string, boolean>
  productPhaseOverrides?: Record<string, Record<string, string>>
  productPhaseManual?: boolean
  customPhaseRows?: Record<string, CustomPhaseRow[]>
  materialPhaseRows?: Record<string, MaterialPhaseAssistRow[]>
}

const STAGES: { id: SheetId; name: string; description: ReactNode }[] = [
  {
    id: 'cu_smelting',
    name: '熔炼',
    description: (
      <>
        通过熔炼 → 吹炼 → 精炼 → 设备选型的标准化工作流，完成铜冶炼全过程配料与工艺计算。
        <br />
        <strong>熔炼阶段：</strong>
        作为工艺起点，在此配置入炉原料配比与热平衡参数，确立后续吹炼工序的基础物料模型。</>
    ),
  },
  {
    id: 'cu_converting',
    name: '吹炼',
    description: (
      <>
        通过熔炼 → 吹炼 → 精炼 → 设备选型的标准化工作流，完成铜冶炼全过程配料与工艺计算。
        <br />
        <strong>吹炼阶段：</strong>
        承接熔炼冰铜，重点调整吹炼造渣与 Fe/S 去除，生成粗铜、吹炼渣和烟气等结果，为精炼提供中间产物数据。
      </>
    ),
  },
  {
    id: 'cu_refining',
    name: '精炼',
    description: (
      <>
        通过熔炼 → 吹炼 → 精炼 → 设备选型的标准化工作流，完成铜冶炼全过程配料与工艺计算。
        <br />
        <strong>精炼阶段：</strong>
        承接粗铜，重点复核氧化精炼、除杂与精炼渣平衡，输出阳极铜/精铜及精炼渣结果，为设备选型提供依据。
      </>
    ),
  },
  {
    id: 'cu_equipment',
    name: '设备选型',
    description: (
      <>
        通过熔炼 → 吹炼 → 精炼 → 设备选型的标准化工作流，完成铜冶炼全过程配料与工艺计算。
        <br />
        <strong>设备选型阶段：</strong>
        基于前序工序的物料与能量数据，自动匹配最优的冶金设备规格，并输出最终的工艺核算报告。
      </>
    ),
  },
]

const PROCESS_STAGE_IDS: CopperProcessStageId[] = ['cu_smelting', 'cu_converting', 'cu_refining']

const COPPER_PROCESS_STAGE_COPY: Record<
  CopperProcessStageId,
  {
    feedBasis: string
    targetProduct: string
    slagBasis: string
    iterationIntro: string
    solventStep: string
    productStep: string
    heatStep: string
    oxygenStep: string
    solventResultHint: string
    productResultHint: string
    heatResultHint: string
    oxygenResultHint: string
    heatResultSuffix: string
  }
> = {
  cu_smelting: {
    feedBasis: '铜精矿、返料与熔剂入炉',
    targetProduct: '冰铜',
    slagBasis: '熔炼炉渣',
    iterationIntro:
      '输入出炉渣型与热平衡设置后，系统按产出炉渣指标联动迭代熔剂、冰铜/炉渣等产出和燃料煤；首次点击「开始迭代计算」后会开启联动预览，后续调整原料投料量、元素含量、渣型或热平衡参数会自动刷新相关结果。',
    solventStep:
      '设定产出炉渣目标铁硅比 Fe/SiO₂ 与钙硅比 CaO/SiO₂。系统先按产物分配得到炉渣中 Fe、Si、Ca 起算量，再联立石灰与铁矿石方程，使最终产出炉渣指标逼近目标渣型。',
    productStep:
      '基于长沙有色冶金设计研究院有限公司多年冶金设计经验、结合生产实际内置的元素→产物分配规则系数；按「混料总质量 × 元素含量 × 分配系数 × 化合物折算系数」将各元素分配至冰铜、炉渣、烟气、烟尘与损失。本步无需手动输入，随混料与熔剂/燃料/空气联动刷新。',
    heatStep:
      '输入入炉料与各产物温度、炉体热损失、其他热支出及燃料煤低位发热量与燃烧效率；系统汇总入炉显热、简化反应热与产物显热，求解弥补热支出缺口所需的推荐燃料煤投料量。',
    oxygenStep:
      '设定富氧空气 O₂/N₂ 组成与供氧系数；系统按物相氧化需氧与燃料燃烧需氧求理论供氧，再乘以供氧系数得到实际供氧与富氧空气 t/h；空气质量纳入混料后反哺产物分配与熔剂求解，直至残差收敛。',
    solventResultHint: '复核石灰、铁矿石投料量及产出炉渣 Fe/SiO₂、CaO/SiO₂ 是否达标。',
    productResultHint: '核对产物分配结果，确认各产物物相组成与组分质量是否合理。',
    heatResultHint: '复核热收支、热缺口与推荐燃料煤投料量。',
    oxygenResultHint: '复核物相/燃料需氧、富氧空气投料量与供氧系数。',
    heatResultSuffix: '熔炼',
  },
  cu_converting: {
    feedBasis: '熔炼冰铜进入吹炼',
    targetProduct: '粗铜',
    slagBasis: '吹炼转炉渣',
    iterationIntro:
      '输入吹炼渣型与热平衡设置后，系统按转炉渣指标联动迭代造渣熔剂、粗铜/吹炼渣等产出和燃料煤；首次点击「开始迭代计算」后会开启联动预览，后续调整参数会自动刷新相关结果。',
    solventStep:
      '设定产出吹炼转炉渣目标铁硅比 Fe/SiO₂ 与钙硅比 CaO/SiO₂。系统先按产物分配得到转炉渣中 Fe、Si、Ca 起算量，再联立造渣熔剂方程，使最终产出转炉渣指标逼近目标渣型。',
    productStep:
      '基于长沙有色冶金设计研究院有限公司多年冶金设计经验、结合生产实际内置的元素→产物分配规则系数；按「混料总质量 × 元素含量 × 分配系数 × 化合物折算系数」将各元素分配至粗铜、吹炼渣、烟气、烟尘与损失。本步无需手动输入，随混料与熔剂/燃料/空气联动刷新。',
    heatStep:
      '输入入炉料与各产物温度、炉体热损失、其他热支出及燃料煤低位发热量与燃烧效率；系统汇总入炉显热、简化反应热与产物显热，求解弥补热支出缺口所需的推荐燃料煤投料量。',
    oxygenStep:
      '设定富氧空气 O₂/N₂ 组成与供氧系数；系统按物相氧化需氧与燃料燃烧需氧求理论供氧，再乘以供氧系数得到实际供氧与富氧空气 t/h；空气质量纳入混料后反哺产物分配与造渣求解，直至残差收敛。',
    solventResultHint: '复核造渣熔剂投料量及产出转炉渣 Fe/SiO₂、CaO/SiO₂ 是否达标。',
    productResultHint: '核对产物分配结果，确认各产物物相组成与组分质量是否合理。',
    heatResultHint: '复核热收支、热缺口与推荐燃料煤投料量。',
    oxygenResultHint: '复核物相/燃料需氧、富氧空气投料量与供氧系数。',
    heatResultSuffix: '吹炼',
  },
  cu_refining: {
    feedBasis: '粗铜进入精炼',
    targetProduct: '阳极铜/精铜',
    slagBasis: '精炼渣',
    iterationIntro:
      '输入精炼渣型与热平衡设置后，系统按精炼渣指标联动迭代辅料、阳极铜/精炼渣等产出和热平衡；首次点击「开始迭代计算」后会开启联动预览，后续调整参数会自动刷新相关结果。',
    solventStep:
      '设定产出精炼渣目标铁硅比 Fe/SiO₂ 与钙硅比 CaO/SiO₂。系统先按产物分配得到精炼渣中 Fe、Si、Ca 起算量，再联立精炼辅料方程，使最终产出精炼渣指标逼近目标渣型。',
    productStep:
      '基于长沙有色冶金设计研究院有限公司多年冶金设计经验、结合生产实际内置的元素→产物分配规则系数；按「混料总质量 × 元素含量 × 分配系数 × 化合物折算系数」将各元素分配至阳极铜/精铜、精炼渣、烟气、烟尘与损失。本步无需手动输入，随混料与辅料/燃料/空气联动刷新。',
    heatStep:
      '输入入炉料与各产物温度、炉体热损失、其他热支出及燃料煤低位发热量与燃烧效率；系统汇总入炉显热、简化反应热与产物显热，求解弥补热支出缺口所需的推荐燃料煤投料量。',
    oxygenStep:
      '设定富氧空气 O₂/N₂ 组成与供氧系数；系统按物相氧化需氧与燃料燃烧需氧求理论供氧，再乘以供氧系数得到实际供氧与富氧空气 t/h；空气质量纳入混料后反哺产物分配与辅料求解，直至残差收敛。',
    solventResultHint: '复核精炼辅料投料量及产出精炼渣 Fe/SiO₂、CaO/SiO₂ 是否达标。',
    productResultHint: '核对产物分配结果，确认各产物物相组成与组分质量是否合理。',
    heatResultHint: '复核热收支、热缺口与推荐燃料煤投料量。',
    oxygenResultHint: '复核物相/燃料需氧、富氧空气投料量与供氧系数。',
    heatResultSuffix: '精炼',
  },
}

const PHASE_FIELDS = [
  { key: 'Cu2S', label: 'Cu₂S' },
  { key: 'FeS', label: 'FeS' },
  { key: 'S', label: 'S' },
  { key: 'Cu2O', label: 'Cu₂O' },
  { key: 'FeO', label: 'FeO' },
  { key: 'Fe2O3', label: 'Fe₂O₃' },
  { key: 'Fe3O4', label: 'Fe₃O₄' },
  { key: 'SiO2', label: 'SiO₂' },
  { key: 'CaO', label: 'CaO' },
  { key: 'Al2O3', label: 'Al₂O₃' },
  { key: 'C', label: 'C' },
]


const DEFAULT_PHASE_DRAFT: PhaseDraft = Object.fromEntries(
  PHASE_FIELDS.map((field) => [field.key, { value: '', factor: '1' }])
)

function phaseInputsFromDraft(draft: PhaseDraft | undefined): Record<string, CopperPhaseInput> {
  if (!draft) return {}
  return Object.fromEntries(
    Object.entries(draft).map(([key, entry]) => [key, { value: entry.value, factor: entry.factor ?? '1' }])
  )
}

function storedPhaseOverridesToMap(stored: Record<string, string> | undefined): PhasePercentMap | null {
  if (!stored || Object.keys(stored).length === 0) return null
  return parsePhaseDraftMap(stored as Partial<Record<InputPhaseRowKey, string>>)
}

function storedProductOverridesToMap(
  stored: Record<string, string> | undefined,
  productKey: CopperProductKey
): ProductPhasePercentMap | null {
  if (!stored || Object.keys(stored).length === 0) return null
  return parseProductPhaseDraftMap(stored, PRODUCT_PHASE_ROWS[productKey])
}

const PHASE_UNKNOWN_ELEMENTS = new Set<CopperElementKey>(['O (氧)', 'C (碳)', 'Other(其他)'])
const PHASE_UNKNOWN_KEYS: Array<keyof PhaseUnknowns> = ['O (氧)', 'C (碳)', 'Other(其他)']

function toPhaseAssistSpecs(rows: MaterialPhaseAssistRow[]) {
  return rowsForOrderedCalculation(rows).map((row) => ({
    id: row.id,
    kind: row.kind as 'builtin' | 'custom',
    builtinKey: row.builtinKey,
    fractions: row.fractions,
  }))
}

function readCopperCaseRecords(): CopperCaseRecord[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(COPPER_CASES_STORAGE_KEY)
    if (!raw) return []
    const records = JSON.parse(raw)
    if (!Array.isArray(records)) return []
    return records.filter((record): record is CopperCaseRecord =>
      typeof record?.id === 'string' &&
      typeof record?.name === 'string' &&
      typeof record?.createdAt === 'string' &&
      typeof record?.updatedAt === 'string'
    )
  } catch {
    return []
  }
}

function writeCopperCaseRecords(records: CopperCaseRecord[]) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(COPPER_CASES_STORAGE_KEY, JSON.stringify(records))
}

function sortCopperCaseRecords(records: CopperCaseRecord[]) {
  return [...records].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
}

function padDatePart(value: number) {
  return String(value).padStart(2, '0')
}

function formatPhaseCell(value: number | null, digits = 3) {
  return value == null ? '—' : format(value, digits)
}

const VISIBLE_COPPER_PRODUCT_KEYS: CopperProductKey[] = ['matte', 'slag', 'gas', 'dust']
const PRODUCT_CALCULATION_BASIS = '混料总质量 × 元素含量 × 静态分配系数 × 化合物折算系数'
const COPPER_STAGE_PRODUCT_NAME_OVERRIDES: Record<CopperProcessStageId, Partial<Record<CopperProductKey, string>>> = {
  cu_smelting: {},
  cu_converting: { matte: '粗铜', slag: '吹炼渣' },
  cu_refining: { matte: '阳极铜/精铜', slag: '精炼渣' },
}

type CopperProductTableColumn = {
  key: string
  name: string
  mass: number
  elementWeights: Partial<Record<CopperElementKey, number>>
  composition: Partial<Record<CopperElementKey, number>>
}

function assistAlertPanelClassName(darkMode: boolean, tone: 'success' | 'warning') {
  const base = 'rounded-lg border p-3 text-sm'
  return tone === 'success'
    ? `${base} ${darkMode ? 'border-emerald-700 bg-emerald-950/30 text-emerald-100' : 'border-emerald-200 bg-emerald-50 text-emerald-900'}`
    : `${base} ${darkMode ? 'border-amber-700 bg-amber-950/30 text-amber-100' : 'border-amber-200 bg-amber-50 text-amber-900'}`
}

function getStageProductName(stageId: CopperProcessStageId, product: CopperProductTableColumn) {
  if (product.key === 'total' || product.key === 'loss') return product.name
  return COPPER_STAGE_PRODUCT_NAME_OVERRIDES[stageId][product.key as CopperProductKey] ?? product.name
}

function formatCopperProductMassSummary(productResult: CopperProductResult, stageId: CopperProcessStageId) {
  return VISIBLE_COPPER_PRODUCT_KEYS.map((key) => {
    const p = productResult.products[key]
    return `${getStageProductName(stageId, p)} ${format(p.mass)} t/h`
  }).join('；')
}

function heatFormulaCardClass(darkMode: boolean) {
  return `rounded-md border px-3 py-2 ${darkMode ? 'border-gray-600 bg-gray-800/30' : 'border-gray-200 bg-gray-50/70'}`
}

function visibleCopperProductEntries(productResult: CopperProductResult) {
  return VISIBLE_COPPER_PRODUCT_KEYS.map((key) => productResult.products[key])
}

function copperProductSummaryWeight(productResult: CopperProductResult) {
  return visibleCopperProductEntries(productResult).reduce((sum, product) => sum + product.mass, 0)
}

function productSummaryColumn(productResult: CopperProductResult): CopperProductTableColumn {
  const products = visibleCopperProductEntries(productResult)
  const mass = copperProductSummaryWeight(productResult)
  const elementWeights = {} as Record<CopperElementKey, number>
  for (const product of products) {
    for (const element of COPPER_ELEMENT_KEYS) {
      elementWeights[element] = (elementWeights[element] ?? 0) + (product.elementWeights[element] ?? 0)
    }
  }
  const composition = Object.fromEntries(
    COPPER_ELEMENT_KEYS.map((element) => [element, mass > 0 ? ((elementWeights[element] ?? 0) / mass) * 100 : 0])
  ) as Partial<Record<CopperElementKey, number>>
  return {
    key: 'total',
    name: '总计',
    mass,
    elementWeights,
    composition,
  }
}

function productLossColumn(feedTotalWeight: number, totalOutputWeight: number): CopperProductTableColumn {
  const mass = Math.max(0, feedTotalWeight - totalOutputWeight)
  const elementWeights = Object.fromEntries(COPPER_ELEMENT_KEYS.map((element) => [element, 0])) as Record<CopperElementKey, number>
  const composition = Object.fromEntries(COPPER_ELEMENT_KEYS.map((element) => [element, 0])) as Partial<Record<CopperElementKey, number>>
  return {
    key: 'loss',
    name: '损失',
    mass,
    elementWeights,
    composition,
  }
}

function formatCopperCaseTimestamp(date: Date) {
  return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())} ${padDatePart(date.getHours())}:${padDatePart(date.getMinutes())}`
}

function formatCopperCaseName(date: Date) {
  return `铜熔炼试算 ${formatCopperCaseTimestamp(date)}`
}

function suggestCopperCaseName() {
  return formatCopperCaseName(new Date())
}

function createCopperCaseId(date: Date) {
  return `cu-case-${date.getFullYear()}${padDatePart(date.getMonth() + 1)}${padDatePart(date.getDate())}-${padDatePart(date.getHours())}${padDatePart(date.getMinutes())}${padDatePart(date.getSeconds())}-${date.getMilliseconds()}`
}

function formatStoredCaseTime(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : formatCopperCaseTimestamp(date)
}

function isCopperCaseStageId(sheet: SheetId): sheet is CopperCaseStageId {
  return STAGES.some((stage) => stage.id === sheet)
}

function normalizeCopperCaseStageId(sheet?: SheetId): CopperCaseStageId {
  return sheet && isCopperCaseStageId(sheet) ? sheet : 'cu_smelting'
}

function copperCaseStageName(sheet: SheetId) {
  return STAGES.find((stage) => stage.id === sheet)?.name ?? '熔炼'
}

function navigationTargetName(sheet: SheetId) {
  return sheet === 'raw_material' ? '项目工作区' : copperCaseStageName(sheet)
}

function navigationActionDescription(sheet: SheetId) {
  return sheet === 'raw_material' ? '返回项目工作区' : `进入${navigationTargetName(sheet)}`
}

function cloneMaterialColumn(material: CopperMaterialColumn): CopperMaterialColumn {
  return {
    ...material,
    ratios: { ...material.ratios },
  }
}

function cloneFuelMaterial(material: CopperFuelMaterial): CopperFuelMaterial {
  return {
    ...material,
    ratios: { ...material.ratios },
  }
}

function cloneSolventSolution(solution: CopperSolventSolution | null): CopperSolventSolution | null {
  if (!solution) return null
  return {
    ...solution,
    solventWeights: { ...solution.solventWeights },
  }
}

type CopperCaseContent = Omit<CopperCaseRecord, 'id' | 'name' | 'createdAt' | 'updatedAt' | 'stageId'>

function extractCopperCaseContent(record: CopperCaseRecord): CopperCaseContent {
  const { id: _id, name: _name, createdAt: _createdAt, updatedAt: _updatedAt, stageId: _stageId, ...content } = record
  return content
}

function serializeCopperCaseContent(record: CopperCaseContent): string {
  return JSON.stringify(record)
}

function hasCopperCaseGeneratedData(
  state: Pick<CopperCaseRecord, 'phaseCompleted' | 'productCalculated' | 'heatBalanced' | 'solventSolution'>
): boolean {
  return (
    state.phaseCompleted ||
    state.productCalculated ||
    state.heatBalanced ||
    state.solventSolution?.valid === true
  )
}

function isCopperCaseContentDirty(current: CopperCaseRecord, saved: CopperCaseRecord): boolean {
  return serializeCopperCaseContent(extractCopperCaseContent(current)) !== serializeCopperCaseContent(extractCopperCaseContent(saved))
}

function sanitizeCaseFileName(value: string) {
  return value.trim().replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, '_') || '铜冶炼案例'
}

function buildCopperCaseFileName(record: CopperCaseRecord) {
  return `${sanitizeCaseFileName(record.name)}.metcal-copper-case.json`
}

function buildCopperCaseFileText(record: CopperCaseRecord) {
  return JSON.stringify(buildCopperCaseExportPayload(record), null, 2)
}

function buildCopperCaseExportPayload(record: CopperCaseRecord) {
  return {
    type: METCAL_COPPER_CASE_FILE_TYPE,
    version: 1,
    exportedAt: new Date().toISOString(),
    case: record,
  }
}

function normalizeImportedCopperCase(payload: unknown): CopperCaseRecord | null {
  const maybePayload = payload as { type?: string; case?: unknown }
  const record = maybePayload?.type === METCAL_COPPER_CASE_FILE_TYPE ? maybePayload.case : payload
  const candidate = record as Partial<CopperCaseRecord> | null
  if (!candidate || typeof candidate.name !== 'string' || !Array.isArray(candidate.rawMaterials)) return null
  const now = new Date()
  return {
    ...candidate,
    id: createCopperCaseId(now),
    name: candidate.name.trim() || suggestCopperCaseName(),
    createdAt: candidate.createdAt ?? now.toISOString(),
    updatedAt: now.toISOString(),
    stageId: normalizeCopperCaseStageId(candidate.stageId),
    rawMaterials: candidate.rawMaterials.map(cloneMaterialColumn),
    rawWeightDrafts: candidate.rawWeightDrafts ?? {},
    solventColumns: (candidate.solventColumns ?? createDefaultSolventColumns()).map(cloneMaterialColumn),
    fuelColumn: candidate.fuelColumn ? cloneFuelMaterial(candidate.fuelColumn) : cloneFuelMaterial(DEFAULT_COPPER_FUEL),
    oxygenAirColumn: candidate.oxygenAirColumn ? cloneMaterialColumn(candidate.oxygenAirColumn) : createOxygenAirColumn(),
    targetFeSiO2: candidate.targetFeSiO2 ?? '2.8',
    targetCaOSiO2: candidate.targetCaOSiO2 ?? '0.45',
    solventSolution: cloneSolventSolution(candidate.solventSolution ?? null),
    phaseDrafts: candidate.phaseDrafts ?? {},
    phaseCompletedMaterials: candidate.phaseCompletedMaterials ?? {},
    phasePreviewUnknowns: candidate.phasePreviewUnknowns ?? null,
    solventPreviewSolution: cloneSolventSolution(candidate.solventPreviewSolution ?? null),
    productPreviewReady: candidate.productPreviewReady ?? false,
    heatPreviewReady: candidate.heatPreviewReady ?? false,
    manualPhaseCells: candidate.manualPhaseCells ?? {},
    manualSolventWeights: candidate.manualSolventWeights ?? {},
    manualFuelWeightValid: candidate.manualFuelWeightValid ?? false,
    phaseCompleted: candidate.phaseCompleted ?? false,
    productCalculated: candidate.productCalculated ?? false,
    heatBalanced: candidate.heatBalanced ?? false,
    fuelLhv: candidate.fuelLhv ?? String(DEFAULT_COPPER_FUEL.lowerHeatingValueMJkg),
    fuelEfficiency: candidate.fuelEfficiency ?? String(DEFAULT_COPPER_FUEL.combustionEfficiency),
    oxygenAirO2Pct: candidate.oxygenAirO2Pct ?? '70',
    oxygenAirN2Pct: candidate.oxygenAirN2Pct ?? '30',
    oxygenSupplyCoefficient: candidate.oxygenSupplyCoefficient ?? '1.15',
    feedTemperature: candidate.feedTemperature ?? '25',
    matteTemperature: candidate.matteTemperature ?? '1180',
    slagTemperature: candidate.slagTemperature ?? '1250',
    gasTemperature: candidate.gasTemperature ?? '1150',
    dustTemperature: candidate.dustTemperature ?? '450',
    heatLossMJh: candidate.heatLossMJh ?? '1500',
    otherHeatMJh: candidate.otherHeatMJh ?? '0',
    annualHours: candidate.annualHours ?? '7200',
    equipmentIntensity: candidate.equipmentIntensity ?? '32',
    targetScaleWanTpa: candidate.targetScaleWanTpa ?? '10',
    equipmentAdjustments: candidate.equipmentAdjustments ?? { smelting: '1', converting: '1', refining: '1' },
    batchTableView: candidate.batchTableView ?? 'element',
    phaseRatioOverrides: candidate.phaseRatioOverrides ?? {},
    manualPhaseRatioColumns: candidate.manualPhaseRatioColumns ?? {},
    productPhaseOverrides: candidate.productPhaseOverrides ?? {},
    productPhaseManual: candidate.productPhaseManual ?? false,
    customPhaseRows: candidate.customPhaseRows ?? {},
    materialPhaseRows: candidate.materialPhaseRows ?? {},
  }
}

function toNumber(value: string, fallback = 0) {
  const n = parseFloat(String(value).replace(',', '.'))
  return Number.isFinite(n) ? n : fallback
}

function isValidNumberText(value: string) {
  if (value.trim() === '') return false
  return Number.isFinite(parseFloat(value.replace(',', '.')))
}

function isEditableNumberDraft(value: string) {
  return /^-?\d*(?:[.,]\d*)?$/.test(value.trim())
}

function format(v: number, digits = 3) {
  return Number(v.toFixed(digits)).toString()
}

function formatTableNumber(v: number) {
  return format(v, 2)
}

function displaySolventName(name: string) {
  return name === '石灰' ? '石灰石' : name
}

function displayRawMaterialName(name: string) {
  return name.trim() || '请选择'
}

function createSingleLibraryRow(suffix = 0): SingleLibraryRow {
  const timestamp = Date.now()
  return {
    id: `library-row-${timestamp}-${suffix}`,
    name: '',
    ratios: emptyCopperRatios(),
  }
}

function nextStage(activeSheet: SheetId) {
  const index = STAGES.findIndex((stage) => stage.id === activeSheet)
  return index >= 0 ? STAGES[index + 1] : undefined
}

function normalizeProcessStageId(sheet: SheetId): CopperProcessStageId {
  return PROCESS_STAGE_IDS.includes(sheet as CopperProcessStageId) ? (sheet as CopperProcessStageId) : 'cu_smelting'
}

function materialCellClass(dark: boolean, tone: 'raw' | 'solvent' | 'fuel' | 'total' | 'label' = 'raw') {
  const base = 'border-t px-1 py-1 align-middle text-center'
  if (tone === 'label') {
    return `${base} sticky left-[34px] z-10 font-medium ${dark ? 'border-gray-600 bg-gray-700 text-gray-200' : 'border-gray-200 bg-white text-gray-700'}`
  }
  if (tone === 'solvent') {
    return `${base} ${dark ? 'border-gray-600 bg-emerald-950/20' : 'border-gray-200 bg-emerald-50/70'}`
  }
  if (tone === 'fuel') {
    return `${base} ${dark ? 'border-gray-600 bg-amber-950/20' : 'border-gray-200 bg-amber-50/70'}`
  }
  if (tone === 'total') {
    return `${base} font-medium ${dark ? 'border-gray-600 bg-blue-950/30' : 'border-gray-200 bg-blue-50'}`
  }
  return `${base} ${dark ? 'border-gray-600' : 'border-gray-200'}`
}

function oxygenAirCellClass(dark: boolean) {
  return `${materialCellClass(dark, 'fuel')} ${dark ? 'bg-sky-950/20 text-sky-50' : 'bg-sky-50 text-sky-950'}`
}

function unitCellClass(dark: boolean) {
  return `border-t px-1 py-1 align-middle sticky left-0 z-10 text-center ${dark ? 'border-gray-600 bg-gray-700 text-gray-200' : 'border-gray-200 bg-white text-gray-700'}`
}

function solveInputClass(dark: boolean, status: SolveInputStatus) {
  const warning = dark
    ? 'border-red-500 bg-red-950/20 ring-1 ring-red-500/60 focus:border-red-400 focus:ring-red-400'
    : 'border-red-400 bg-red-50/70 ring-1 ring-red-300 focus:border-red-500 focus:ring-red-400'
  const resolved = dark
    ? 'border-emerald-500 bg-emerald-950/20 ring-1 ring-emerald-500/60 focus:border-emerald-400 focus:ring-emerald-400'
    : 'border-emerald-500 bg-emerald-50/80 ring-1 ring-emerald-300 focus:border-emerald-600 focus:ring-emerald-400'
  const stateClass = status === 'resolved' ? resolved : status === 'pending' ? warning : ''
  return `${inputSm(dark)} h-7 w-full px-1 py-0 text-center font-mono text-sm ${stateClass}`
}

function productOutputCellClass(
  dark: boolean,
  status: SolveInputStatus,
  side: 'single' | 'left' | 'right',
  boundary: 'top' | 'middle' | 'bottom'
) {
  const tone = status === 'resolved'
    ? dark
      ? 'border-emerald-500 bg-emerald-950/10 text-emerald-50'
      : 'border-emerald-500 bg-emerald-50/70 text-emerald-950'
    : dark
    ? 'border-red-500 bg-red-950/10 text-red-50'
    : 'border-red-400 bg-red-50/70 text-red-950'
  const sideFrame = side === 'single' ? 'border-l-2 border-r-2' : side === 'left' ? 'border-l-2' : 'border-r-2'
  const topFrame = boundary === 'top' ? 'border-t-2' : ''
  const bottomFrame = boundary === 'bottom' ? 'border-b-2' : ''
  return `${materialCellClass(dark, 'raw')} cursor-pointer ${tone} ${sideFrame} ${topFrame} ${bottomFrame}`
}

function currentWorkflowStepLabel({
  rawMaterials,
  rawWeightDrafts,
  phaseCompletedMaterials,
  manualPhaseCells,
  allPhaseMaterialsCompleted,
  productCalculated,
}: {
  rawMaterials: CopperMaterialColumn[]
  rawWeightDrafts: Record<string, string>
  phaseCompletedMaterials: Record<string, boolean>
  manualPhaseCells: Record<string, boolean>
  allPhaseMaterialsCompleted: boolean
  productCalculated: boolean
}) {
  const pendingMaterial = rawMaterials.find((material) => !material.name.trim())
  if (pendingMaterial) return '步骤1：请在名称下拉框中选择原料'
  const pendingRaw = rawMaterials.find((material) => !isValidNumberText(rawWeightDrafts[material.id] ?? ''))
  if (pendingRaw) return `步骤1：请输入「${pendingRaw.name}」的投料量`
  const pendingPhase = rawMaterials.find(
    (material) =>
      !phaseCompletedMaterials[material.id] &&
      !PHASE_UNKNOWN_KEYS.every((element) => manualPhaseCells[`${material.id}:${element}`])
  )
  if (pendingPhase) return `步骤2：请双击「${pendingPhase.name}」的 O / C / Other 进行物相折算`
  if (!allPhaseMaterialsCompleted) return '步骤2：请完成所有原料的物相折算'
  if (!productCalculated) return '步骤3：请点击熔剂、燃料煤或产物区域，进入迭代计算'
  return '已完成：熔剂、产物和热平衡已联动刷新；调整输入后会自动更新'
}

function stepBadgeClass(dark: boolean, active: boolean) {
  const base = 'rounded-md border px-2 py-1 text-xs font-medium'
  if (active) {
    return `${base} ${dark ? 'border-amber-500 bg-amber-950/30 text-amber-100' : 'border-amber-300 bg-amber-50 text-amber-900'}`
  }
  return `${base} ${dark ? 'border-gray-600 bg-gray-800/50 text-gray-300' : 'border-gray-200 bg-gray-50 text-gray-600'}`
}

function iterationSubstepCardClass(dark: boolean) {
  return `rounded-md border p-3 ${dark ? 'border-gray-600 bg-gray-800/35' : 'border-gray-200 bg-gray-50/80'}`
}

const ITERATION_FLOW_STEPS = ['熔剂渣型', '产物分配', '热平衡配煤', '富氧空气'] as const
const ITERATION_STEP_BADGES = ['①', '②', '③', '④'] as const

function IterationFlowStrip({ darkMode }: { darkMode: boolean }) {
  return (
    <div className={`rounded-md border px-3 py-2 ${darkMode ? 'border-gray-600 bg-gray-800/25' : 'border-gray-200 bg-white'}`}>
      <div className={`text-xs font-semibold ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>联动求解流程</div>
      <div className={`mt-1.5 flex flex-wrap items-center gap-1.5 text-xs ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
        {ITERATION_FLOW_STEPS.map((label, index) => (
          <span key={label} className="inline-flex items-center gap-1.5">
            {index > 0 && <span aria-hidden="true" className={darkMode ? 'text-gray-500' : 'text-gray-400'}>→</span>}
            <span className={`rounded-full px-2 py-0.5 ${darkMode ? 'bg-gray-700/80' : 'bg-gray-100'}`}>
              {ITERATION_STEP_BADGES[index]} {label}
            </span>
          </span>
        ))}
      </div>
    </div>
  )
}

function iterationResultPanelClass(dark: boolean) {
  return `rounded-md border ${dark ? 'border-gray-600 bg-gray-800/20' : 'border-gray-200 bg-gray-50/60'}`
}

function IterationSubstepCard({
  darkMode,
  step,
  title,
  description,
  children,
}: {
  darkMode: boolean
  step: number
  title: string
  description?: string
  children?: ReactNode
}) {
  return (
    <div className={iterationSubstepCardClass(darkMode)}>
      <div className="flex items-start gap-2.5">
        <span
          className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${darkMode ? 'bg-blue-950 text-blue-200' : 'bg-blue-100 text-blue-800'}`}
          aria-hidden="true"
        >
          {ITERATION_STEP_BADGES[step - 1] ?? step}
        </span>
        <div className="min-w-0 flex-1">
          <div className={`text-sm font-semibold ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}>{title}</div>
          {description && <p className={`${hintText(darkMode)} mt-1.5 text-sm leading-relaxed`}>{description}</p>}
          {children && <div className="mt-3">{children}</div>}
        </div>
      </div>
    </div>
  )
}

function IteratingOverlay({ darkMode }: { darkMode: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 px-4" role="status" aria-live="polite">
      <div className={`w-full max-w-sm rounded-lg border px-5 py-4 shadow-xl ${darkMode ? 'border-blue-700 bg-gray-900 text-blue-100' : 'border-blue-200 bg-white text-blue-900'}`}>
        <div className="flex items-center gap-3">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />
          <div>
            <div className="text-sm font-semibold">迭代计算中</div>
            <div className={`mt-1 text-xs ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>正在联动求解熔剂、产出和热平衡…</div>
          </div>
        </div>
      </div>
    </div>
  )
}

function materialSelectClass(dark: boolean, status: SolveInputStatus = 'none') {
  const warning = dark
    ? 'border-red-500 bg-red-950/20 ring-1 ring-red-500/60 focus:border-red-400 focus:ring-red-400'
    : 'border-red-400 bg-red-50/70 ring-1 ring-red-300 focus:border-red-500 focus:ring-red-400'
  return `h-9 w-full appearance-none truncate rounded border px-2 pr-7 text-center text-[13px] leading-normal ${
    dark
      ? 'bg-gray-700 border-gray-600 text-gray-100'
      : 'bg-white border-gray-300 text-gray-900'
  } ${status === 'pending' ? warning : ''}`
}

function libraryActionButtonClass(dark: boolean, tone: 'edit' | 'delete') {
  const base = 'rounded border bg-transparent px-2 py-0.5 text-xs font-medium leading-tight whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1'
  if (tone === 'delete') {
    return `${base} ${
      dark
        ? 'border-red-500/70 text-red-200 hover:bg-red-950/40 focus-visible:ring-red-400 focus-visible:ring-offset-gray-900'
        : 'border-red-300 text-red-700 hover:bg-red-50 focus-visible:ring-red-400 focus-visible:ring-offset-white'
    }`
  }
  return `${base} ${
    dark
      ? 'border-blue-500/70 text-blue-200 hover:bg-blue-950/40 focus-visible:ring-blue-400 focus-visible:ring-offset-gray-900'
      : 'border-blue-300 text-blue-700 hover:bg-blue-50 focus-visible:ring-blue-400 focus-visible:ring-offset-white'
  }`
}

export default function CopperWorkflow({
  darkMode,
  language = 'zh',
  activeSheet,
  onStageSelect,
  caseTitleDraft,
  onActiveCaseNameChange,
}: CopperWorkflowProps) {
  const isEn = language === 'en'
  const [rawMaterials, setRawMaterials] = useState<CopperMaterialColumn[]>(() => createDefaultCopperMaterials())
  const [rawWeightDrafts, setRawWeightDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(createDefaultCopperMaterials().map((material) => [material.id, '']))
  )
  const [solventColumns, setSolventColumns] = useState<CopperMaterialColumn[]>(() => createDefaultSolventColumns())
  const [materialLibrary, setMaterialLibrary] = useState<CopperLibraryMaterial[]>(() => [...COPPER_MATERIAL_LIBRARY])
  const [showLibrary, setShowLibrary] = useState(false)
  const [importFeedback, setImportFeedback] = useState<string | null>(null)
  const [showSingleLibraryAddDialog, setShowSingleLibraryAddDialog] = useState(false)
  const [libraryMaterialDialogMode, setLibraryMaterialDialogMode] = useState<LibraryMaterialDialogMode>('add')
  const [libraryDialogMessage, setLibraryDialogMessage] = useState<string | null>(null)
  const [singleLibraryRows, setSingleLibraryRows] = useState<SingleLibraryRow[]>(() => [createSingleLibraryRow()])
  const [phaseMaterialId, setPhaseMaterialId] = useState<string | null>(null)
  const [phaseDrafts, setPhaseDrafts] = useState<Record<string, PhaseDraft>>({})
  const [phaseCompletedMaterials, setPhaseCompletedMaterials] = useState<Record<string, boolean>>({})
  const [phasePreviewUnknowns, setPhasePreviewUnknowns] = useState<PhasePreviewUnknowns | null>(null)
  const [manualPhaseCells, setManualPhaseCells] = useState<Record<string, boolean>>({})
  const [manualSolventWeights, setManualSolventWeights] = useState<Record<string, boolean>>({})
  const [manualFuelWeightValid, setManualFuelWeightValid] = useState(false)
  const [ratioDrafts, setRatioDrafts] = useState<Record<string, string>>({})
  const [phaseCompleted, setPhaseCompleted] = useState(false)
  const [showElementAssist, setShowElementAssist] = useState(false)
  const [showSolventAssist, setShowSolventAssist] = useState(false)
  const [showOxygenAirAssist, setShowOxygenAirAssist] = useState(false)
  const [showProductAssist, setShowProductAssist] = useState(false)
  const [showHeatAssist, setShowHeatAssist] = useState(false)
  const [productCalculated, setProductCalculated] = useState(false)
  const [workflowMessage, setWorkflowMessage] = useState<string | null>(null)
  const [caseRecords, setCaseRecords] = useState<CopperCaseRecord[]>(() => sortCopperCaseRecords(readCopperCaseRecords()))
  const [activeCaseId, setActiveCaseId] = useState<string | null>(null)
  const [caseMessage, setCaseMessage] = useState<string | null>(null)
  const [caseDropActive, setCaseDropActive] = useState(false)
  const caseDropDepthRef = useRef(0)
  const [pendingNavigationSheet, setPendingNavigationSheet] = useState<SheetId | null>(null)
  const [newCaseName, setNewCaseName] = useState(() => suggestCopperCaseName())
  const [targetFeSiO2, setTargetFeSiO2] = useState('2.8')
  const [targetCaOSiO2, setTargetCaOSiO2] = useState('0.45')
  const [solventSolution, setSolventSolution] = useState<CopperSolventSolution | null>(null)
  const [solventPreviewSolution, setSolventPreviewSolution] = useState<CopperSolventSolution | null>(null)
  const [productPreviewReady, setProductPreviewReady] = useState(false)
  const [iterationResult, setIterationResult] = useState<CopperIterativeBalanceResult | null>(null)
  const [fuelColumn, setFuelColumn] = useState<CopperFuelMaterial>(() => ({
    ...DEFAULT_COPPER_FUEL,
    ratios: { ...DEFAULT_COPPER_FUEL.ratios },
  }))
  const [oxygenAirColumn, setOxygenAirColumn] = useState<CopperMaterialColumn>(() => createOxygenAirColumn())
  const [fuelLhv, setFuelLhv] = useState(String(DEFAULT_COPPER_FUEL.lowerHeatingValueMJkg))
  const [fuelEfficiency, setFuelEfficiency] = useState(String(DEFAULT_COPPER_FUEL.combustionEfficiency))
  const [oxygenAirO2Pct, setOxygenAirO2Pct] = useState('70')
  const [oxygenAirN2Pct, setOxygenAirN2Pct] = useState('30')
  const [oxygenSupplyCoefficient, setOxygenSupplyCoefficient] = useState('1.15')
  const [feedTemperature, setFeedTemperature] = useState('25')
  const [matteTemperature, setMatteTemperature] = useState('1180')
  const [slagTemperature, setSlagTemperature] = useState('1250')
  const [gasTemperature, setGasTemperature] = useState('1150')
  const [dustTemperature, setDustTemperature] = useState('450')
  const [heatLossMJh, setHeatLossMJh] = useState('1500')
  const [otherHeatMJh, setOtherHeatMJh] = useState('0')
  const [heatPreviewReady, setHeatPreviewReady] = useState(false)
  const [heatBalanced, setHeatBalanced] = useState(false)
  const [iterationAutoLinked, setIterationAutoLinked] = useState(false)
  const [isIterating, setIsIterating] = useState(false)
  const [annualHours, setAnnualHours] = useState('7200')
  const [equipmentIntensity, setEquipmentIntensity] = useState('32')
  const [targetScaleWanTpa, setTargetScaleWanTpa] = useState('10')
  const [equipmentAdjustments, setEquipmentAdjustments] = useState<Record<EquipmentStageId, string>>({
    smelting: '1',
    converting: '1',
    refining: '1',
  })
  const [batchTableView, setBatchTableView] = useState<BatchTableView>('element')
  const [phaseRatioOverrides, setPhaseRatioOverrides] = useState<Record<string, Record<string, string>>>({})
  const [manualPhaseRatioColumns, setManualPhaseRatioColumns] = useState<Record<string, boolean>>({})
  const [customPhaseRows, setCustomPhaseRows] = useState<Record<string, CustomPhaseRow[]>>({})
  const [materialPhaseRows, setMaterialPhaseRows] = useState<Record<string, MaterialPhaseAssistRow[]>>({})
  const [phaseRowFormulaDrafts, setPhaseRowFormulaDrafts] = useState<Record<string, string>>({})
  const [phaseRowFormulaErrors, setPhaseRowFormulaErrors] = useState<Record<string, string>>({})
  const [phaseRowDragId, setPhaseRowDragId] = useState<string | null>(null)
  const [phaseRowDropTargetId, setPhaseRowDropTargetId] = useState<string | null>(null)
  const [phaseRowDropPosition, setPhaseRowDropPosition] = useState<'before' | 'after' | null>(null)
  const [inputPhaseDrafts, setInputPhaseDrafts] = useState<Record<string, Record<string, string>>>({})
  const [invalidInputPhaseColumns, setInvalidInputPhaseColumns] = useState<Record<string, boolean>>({})
  const [productPhaseOverrides, setProductPhaseOverrides] = useState<Record<string, Record<string, string>>>({})
  const [productPhaseManual, setProductPhaseManual] = useState(false)
  const [outputPhaseDrafts, setOutputPhaseDrafts] = useState<Record<string, Record<string, string>>>({})
  const [invalidOutputPhaseColumns, setInvalidOutputPhaseColumns] = useState<Record<string, boolean>>({})
  const calculationTableRef = useRef<HTMLDivElement>(null)
  const elementAssistRef = useRef<HTMLDivElement>(null)
  const iterationAssistRef = useRef<HTMLDivElement>(null)
  const solventAssistRef = useRef<HTMLDivElement>(null)
  const productAssistRef = useRef<HTMLDivElement>(null)
  const heatAssistRef = useRef<HTMLDivElement>(null)
  const caseImportInputRef = useRef<HTMLInputElement>(null)
  const stagePageTopRef = useRef<HTMLDivElement>(null)
  const previousActiveSheetRef = useRef<SheetId>(activeSheet)
  const [stageEnterHighlight, setStageEnterHighlight] = useState(false)

  const rawBlend = useMemo(() => calculateWeightedComposition(rawMaterials), [rawMaterials])
  const furnaceFeedWithoutFuel = useMemo(
    () => calculateWeightedComposition([...rawMaterials, ...solventColumns, oxygenAirColumn]),
    [oxygenAirColumn, rawMaterials, solventColumns]
  )
  const furnaceFeed = useMemo(
    () => calculateWeightedComposition([...rawMaterials, ...solventColumns, fuelColumn, oxygenAirColumn]),
    [rawMaterials, solventColumns, fuelColumn, oxygenAirColumn]
  )
  const productResult = useMemo(() => calculateCopperProducts(furnaceFeed), [furnaceFeed])
  const heatProductResult = useMemo(() => calculateCopperProducts(furnaceFeedWithoutFuel), [furnaceFeedWithoutFuel])
  const heatFuel = useMemo<CopperFuelMaterial>(
    () => ({
      ...fuelColumn,
      lowerHeatingValueMJkg: toNumber(fuelLhv, DEFAULT_COPPER_FUEL.lowerHeatingValueMJkg),
      combustionEfficiency: toNumber(fuelEfficiency, DEFAULT_COPPER_FUEL.combustionEfficiency),
    }),
    [fuelColumn, fuelEfficiency, fuelLhv]
  )
  const heatBalance = useMemo(
    () =>
      calculateCopperHeatBalance({
        feed: furnaceFeedWithoutFuel,
        products: heatProductResult,
        fuel: heatFuel,
        temperatures: {
          feed: toNumber(feedTemperature, 25),
          matte: toNumber(matteTemperature, 1180),
          slag: toNumber(slagTemperature, 1250),
          gas: toNumber(gasTemperature, 1150),
          dust: toNumber(dustTemperature, 450),
        },
        heatLossMJh: toNumber(heatLossMJh, 1500),
        otherHeatMJh: toNumber(otherHeatMJh, 0),
      }),
    [
      dustTemperature,
      feedTemperature,
      furnaceFeedWithoutFuel,
      gasTemperature,
      heatFuel,
      heatLossMJh,
      heatProductResult,
      matteTemperature,
      otherHeatMJh,
      slagTemperature,
    ]
  )

  const rawWeightStatus = (materialId: string): SolveInputStatus =>
    isValidNumberText(rawWeightDrafts[materialId] ?? '') ? 'resolved' : 'pending'

  const ratioDraftKey = (kind: DraftRatioKind, id: string, element: CopperElementKey) => `${kind}:${id}:${element}`
  const ratioInputValue = (
    kind: DraftRatioKind,
    id: string,
    element: CopperElementKey,
    value: number | undefined
  ) => ratioDrafts[ratioDraftKey(kind, id, element)] ?? format(value ?? 0)

  const phaseCellKey = (materialId: string, element: CopperElementKey) => `${materialId}:${element}`
  const phaseCellStatus = (material: CopperMaterialColumn, element: CopperElementKey): SolveInputStatus => {
    if (element === 'S (硫)' && sulfurInputStatus(material.ratios) === 'missing') return 'pending'
    if (!PHASE_UNKNOWN_ELEMENTS.has(element)) return 'none'
    return phaseCompletedMaterials[material.id] || manualPhaseCells[phaseCellKey(material.id, element)] ? 'resolved' : 'pending'
  }

  const solventWeightStatus = (materialId: string): SolveInputStatus =>
    solventSolution?.valid || manualSolventWeights[materialId] ? 'resolved' : 'pending'

  const fuelWeightStatus = (): SolveInputStatus => (heatBalanced || manualFuelWeightValid ? 'resolved' : 'pending')

  const mixIndicators = useMemo(() => {
    const cu = rawBlend.ratios['Cu(铜)'] ?? 0
    const s = rawBlend.ratios['S (硫)'] ?? 0
    const fe = rawBlend.ratios['Fe(铁)'] ?? 0
    const si = rawBlend.ratios['Si(硅)'] ?? 0
    const ca = rawBlend.ratios['Ca(钙)'] ?? 0
    return [
      { label: 'Cu/S', value: s > 0 ? cu / s : null, note: '铜硫比' },
      { label: 'Fe/Si', value: si > 0 ? fe / si : null, note: '铁硅比' },
      { label: 'Ca/Si', value: si > 0 ? ca / si : null, note: '钙硅比' },
      { label: 'Cu/Fe', value: fe > 0 ? cu / fe : null, note: '铜铁比' },
    ]
  }, [rawBlend])

  const selectedPhaseMaterial = rawMaterials.find((material) => material.id === phaseMaterialId) ?? null
  const currentPhaseDraft = selectedPhaseMaterial ? (phaseDrafts[selectedPhaseMaterial.id] ?? DEFAULT_PHASE_DRAFT) : DEFAULT_PHASE_DRAFT
  const activeStage = STAGES.find((stage) => stage.id === activeSheet) ?? STAGES[0]
  const activeProcessStageId = normalizeProcessStageId(activeSheet)
  const processStageCopy = COPPER_PROCESS_STAGE_COPY[activeProcessStageId]
  const activeCase = activeCaseId ? caseRecords.find((record) => record.id === activeCaseId) ?? null : null
  const isCopperProcessSheet = activeSheet === 'cu_smelting' || activeSheet === 'cu_converting' || activeSheet === 'cu_refining'
  const nextProcessStage = nextStage(activeSheet)
  const allRawMaterialsSelected = rawMaterials.every((material) => material.name.trim())
  const allPhaseMaterialsCompleted = rawMaterials.every(
    (material) =>
      material.name.trim() &&
      validateMaterialForPhaseCalc(material) === null &&
      (phaseCompletedMaterials[material.id] ||
        (['O (氧)', 'C (碳)', 'Other(其他)'] as CopperElementKey[]).every((element) => manualPhaseCells[phaseCellKey(material.id, element)]))
  )
  const iterationInputValid = [
    targetFeSiO2,
    targetCaOSiO2,
    oxygenAirO2Pct,
    oxygenAirN2Pct,
    oxygenSupplyCoefficient,
    feedTemperature,
    matteTemperature,
    slagTemperature,
    gasTemperature,
    dustTemperature,
    heatLossMJh,
    otherHeatMJh,
    fuelLhv,
    fuelEfficiency,
  ].every(isValidNumberText)
  const iterationInputSignature = useMemo(
    () =>
      JSON.stringify({
        rawMaterials: rawMaterials.map((material) => ({
          id: material.id,
          weight: material.weight,
          ratios: material.ratios,
          unitPrice: material.unitPrice ?? 0,
        })),
        solventConfigs: solventColumns.map((material) => ({
          id: material.id,
          name: material.name,
          ratios: material.ratios,
          unitPrice: material.unitPrice ?? 0,
        })),
        fuel: {
          ratios: fuelColumn.ratios,
          lowerHeatingValueMJkg: fuelLhv,
          combustionEfficiency: fuelEfficiency,
        },
        oxygenAir: {
          ratios: oxygenAirColumn.ratios,
          oxygenAirO2Pct,
          oxygenAirN2Pct,
          oxygenSupplyCoefficient,
        },
        phaseDrafts,
        targetFeSiO2,
        targetCaOSiO2,
        feedTemperature,
        matteTemperature,
        slagTemperature,
        gasTemperature,
        dustTemperature,
        heatLossMJh,
        otherHeatMJh,
      }),
    [
      dustTemperature,
      feedTemperature,
      fuelColumn.ratios,
      fuelEfficiency,
      fuelLhv,
      gasTemperature,
      heatLossMJh,
      matteTemperature,
      oxygenAirColumn.ratios,
      oxygenAirN2Pct,
      oxygenAirO2Pct,
      oxygenSupplyCoefficient,
      otherHeatMJh,
      phaseDrafts,
      rawMaterials,
      slagTemperature,
      solventColumns,
      targetCaOSiO2,
      targetFeSiO2,
    ]
  )
  const resultProductResult = iterationResult?.valid ? iterationResult.finalProducts : productResult
  const tableProductResult = productCalculated && iterationResult?.valid ? iterationResult.finalProducts : productResult
  const displayProductResult = useMemo(() => {
    if (!productPhaseManual || !productCalculated) return tableProductResult
    const next: CopperProductResult = {
      ...tableProductResult,
      products: { ...tableProductResult.products },
    }
    for (const key of Object.keys(PRODUCT_PHASE_ROWS) as CopperProductKey[]) {
      const stored = productPhaseOverrides[key]
      if (!stored) continue
      const parsed = parseProductPhaseDraftMap(stored, PRODUCT_PHASE_ROWS[key])
      if (!isProductPhaseColumnValid(parsed, key)) continue
      const product = next.products[key]
      const derived = deriveProductElementsFromPhases(key, parsed, product.mass)
      next.products[key] = {
        ...product,
        elementWeights: derived.elementWeights,
        composition: derived.composition,
      }
    }
    return next
  }, [productCalculated, productPhaseManual, productPhaseOverrides, tableProductResult])
  const resultHeatBalance = heatPreviewReady && iterationResult?.valid ? iterationResult.finalHeatBalance : heatBalance
  const resultSolventColumns = solventPreviewSolution?.valid && iterationResult?.valid ? iterationResult.finalSolventColumns : solventColumns
  const resultOxygenAirColumn = iterationResult?.valid ? iterationResult.finalOxygenAirColumn : oxygenAirColumn
  const resultOxygenAirCalculation = iterationResult?.valid ? iterationResult.finalOxygenAirCalculation : null
  const productColumns = useMemo(() => visibleCopperProductEntries(displayProductResult), [displayProductResult])
  const resultProductColumns = useMemo(() => visibleCopperProductEntries(resultProductResult), [resultProductResult])
  const productSummary = useMemo(() => productSummaryColumn(displayProductResult), [displayProductResult])
  const resultProductSummary = useMemo(() => productSummaryColumn(resultProductResult), [resultProductResult])
  const productLoss = useMemo(() => productLossColumn(furnaceFeed.totalWeight, productSummary.mass), [furnaceFeed.totalWeight, productSummary.mass])
  const resultFeedTotalWeight = iterationResult?.valid ? iterationResult.finalFeed.totalWeight : furnaceFeed.totalWeight
  const resultProductLoss = useMemo(
    () => productLossColumn(resultFeedTotalWeight, resultProductSummary.mass),
    [resultFeedTotalWeight, resultProductSummary.mass]
  )
  const productTableColumns = useMemo(() => [...productColumns, productLoss, productSummary], [productColumns, productLoss, productSummary])
  const parsedProductPhaseOverrides = useMemo(
    () =>
      Object.fromEntries(
        (Object.keys(PRODUCT_PHASE_ROWS) as CopperProductKey[]).map((key) => [
          key,
          productPhaseManual && productPhaseOverrides[key]
            ? storedProductOverridesToMap(productPhaseOverrides[key], key)
            : null,
        ])
      ) as Partial<Record<CopperProductKey, ProductPhasePercentMap | null>>,
    [productPhaseManual, productPhaseOverrides]
  )
  const productPhaseComposition = useMemo(() => {
    const overrides = Object.fromEntries(
      (Object.entries(parsedProductPhaseOverrides).filter(([, value]) => value != null) as [CopperProductKey, ProductPhasePercentMap][])
    )
    return calculateProductPhaseComposition(displayProductResult, overrides)
  }, [displayProductResult, parsedProductPhaseOverrides])
  const resultProductPhaseComposition = useMemo(
    () => calculateProductPhaseComposition(resultProductResult),
    [resultProductResult]
  )
  const resultProductPhaseReviewBlocks = useMemo(
    () =>
      resultProductColumns.map((product) => ({
        product,
        rows: buildProductPhaseReviewRows(
          product.key as CopperProductKey,
          product.mass,
          resultProductPhaseComposition[product.key as CopperProductKey] ?? {}
        ),
      })),
    [resultProductColumns, resultProductPhaseComposition]
  )
  const resultProductPhaseReviewRowCount = useMemo(
    () => Math.max(0, ...resultProductPhaseReviewBlocks.map((block) => block.rows.length)),
    [resultProductPhaseReviewBlocks]
  )
  const inputPhaseColumnData = useMemo(() => {
    const buildColumn = (
      id: string,
      kind: PhaseTableColumn['kind'],
      header: string,
      subHeader: string,
      weight: number,
      ratios: CopperRatios,
      phaseDraft?: PhaseDraft
    ): PhaseTableColumn => {
      const manual = manualPhaseRatioColumns[id] === true
      const overrides = manual ? storedPhaseOverridesToMap(phaseRatioOverrides[id]) : null
      return {
        id,
        kind,
        header,
        subHeader,
        weight,
        phases: buildInputPhaseColumn(ratios, phaseInputsFromDraft(phaseDraft), overrides),
      }
    }
    const rawColumns = rawMaterials.map((material, index) =>
      buildColumn(material.id, 'raw', `原料${index + 1}`, displayRawMaterialName(material.name), material.weight, material.ratios, phaseDrafts[material.id])
    )
    const solventCols = solventColumns.map((material, index) =>
      buildColumn(material.id, 'solvent', index === 0 ? '熔剂1' : '熔剂2', material.name === '石灰' ? '石灰石' : material.name, material.weight, material.ratios)
    )
    const fuelCol = buildColumn(fuelColumn.id, 'fuel', '燃料煤', fuelColumn.name, fuelColumn.weight, fuelColumn.ratios)
    const oxygenAirPhase = buildOxygenAirPhaseColumn(oxygenAirColumn.ratios)
    const oxygenCol: PhaseTableColumn = {
      id: oxygenAirColumn.id,
      kind: 'oxygen',
      header: '富氧空气',
      subHeader: '富氧空气',
      weight: oxygenAirColumn.weight,
      oxygenAir: oxygenAirPhase,
    }
    const blendPhases = buildInputPhaseColumn(furnaceFeed.ratios)
    const blendCol: PhaseTableColumn = {
      id: 'blend',
      kind: 'blend',
      header: '混料',
      subHeader: '混料',
      weight: furnaceFeed.totalWeight,
      phases: blendPhases,
      readOnly: true,
    }
    return [...rawColumns, ...solventCols, fuelCol, oxygenCol, blendCol]
  }, [
    fuelColumn,
    furnaceFeed.ratios,
    furnaceFeed.totalWeight,
    manualPhaseRatioColumns,
    oxygenAirColumn,
    phaseDrafts,
    phaseRatioOverrides,
    rawMaterials,
    solventColumns,
  ])
  const outputPhaseColumnData = useMemo(
    (): PhaseTableColumn[] =>
      productTableColumns.map((product) => ({
        id: product.key,
        kind: 'product' as const,
        header: product.name === '总计' ? '总计' : '产物',
        subHeader: product.name === '总计' ? '总计' : getStageProductName(activeProcessStageId, product),
        weight: productCalculated ? product.mass : 0,
        productKey: product.key === 'total' ? 'total' : (product.key as CopperProductKey | 'loss'),
        productPhases:
          product.key === 'total'
            ? undefined
            : product.key === 'loss'
            ? productPhaseComposition.loss
            : productPhaseComposition[product.key as CopperProductKey],
        productGasVolume:
          product.key === 'gas' ? calculateGasVolumePercents(productPhaseComposition.gas ?? {}) : undefined,
        readOnly: product.key === 'total' || product.key === 'loss' || !productCalculated,
      })),
    [activeProcessStageId, productCalculated, productPhaseComposition, productTableColumns]
  )
  const resultHeatFeed = iterationResult?.valid ? iterationResult.finalFeedWithoutFuel : furnaceFeedWithoutFuel
  const resultHeatProducts = iterationResult?.valid ? calculateCopperProducts(iterationResult.finalFeedWithoutFuel) : heatProductResult
  const resultFuelHeatMJt = Math.max(0, toNumber(fuelLhv, DEFAULT_COPPER_FUEL.lowerHeatingValueMJkg) * 1000 * toNumber(fuelEfficiency, DEFAULT_COPPER_FUEL.combustionEfficiency))
  const oxygenAirInputStatus: SolveInputStatus = iterationResult?.valid || productCalculated ? 'resolved' : 'pending'
  const rawColumnWidth = (material: CopperMaterialColumn) => Math.max(104, Math.min(136, 72 + Math.min(displayRawMaterialName(material.name).length, 7) * 9))
  const calculationTableWidth = Math.max(
    720,
    30 +
      68 +
      rawMaterials.reduce((sum, material) => sum + rawColumnWidth(material), 0) +
      solventColumns.length * 82 +
      88 +
      88 +
      90 +
      30 +
      productTableColumns.length * 88
  )
  const phaseTableRawColumnWidths = useMemo(
    () => Object.fromEntries(rawMaterials.map((material) => [material.id, rawColumnWidth(material)])),
    [rawMaterials]
  )
  const phaseTableWidth = calculationTableWidth
  const workflowStepLabel = currentWorkflowStepLabel({
    rawMaterials,
    rawWeightDrafts,
    phaseCompletedMaterials,
    manualPhaseCells,
    allPhaseMaterialsCompleted,
    productCalculated,
  })
  const workflowStepBadges = [
    { label: '1 选择原料/投料量', active: rawMaterials.some((material) => !material.name.trim() || !isValidNumberText(rawWeightDrafts[material.id] ?? '')) },
    { label: '2 物相折算', active: rawMaterials.every((material) => material.name.trim() && isValidNumberText(rawWeightDrafts[material.id] ?? '')) && !allPhaseMaterialsCompleted },
    { label: '3 迭代计算', active: allPhaseMaterialsCompleted && !productCalculated },
    { label: '4 复核结果', active: productCalculated },
  ]
  const targetScaleValue = normalizeScaleWanTpa(targetScaleWanTpa)
  const annualHoursValue = toNumber(annualHours, 7200)
  const equipmentUnitThroughput = Math.max(toNumber(equipmentIntensity, 32), 1)
  const equipmentSizingRows = useMemo(() => {
    const matteMass = productCalculated ? productResult.products.matte.mass : 0
    const matteCopper = productCalculated ? (productResult.products.matte.elementWeights['Cu(铜)'] ?? 0) : 0
    const basisRows: Array<{
      id: EquipmentStageId
      stage: string
      basis: string
      currentThroughput: number
      mainOutput: string
      outputThroughput: number
      note: string
    }> = [
      {
        id: 'smelting',
        stage: '熔炼',
        basis: '混料处理量',
        currentThroughput: furnaceFeed.totalWeight,
        mainOutput: '冰铜',
        outputThroughput: matteMass,
        note: '由配料总表混料行折算',
      },
      {
        id: 'converting',
        stage: '吹炼',
        basis: '冰铜处理量',
        currentThroughput: matteMass,
        mainOutput: '粗铜',
        outputThroughput: matteCopper,
        note: '承接熔炼冰铜产出',
      },
      {
        id: 'refining',
        stage: '精炼',
        basis: '粗铜/阳极铜规模',
        currentThroughput: matteCopper,
        mainOutput: '精铜',
        outputThroughput: matteCopper * 0.995,
        note: '暂按铜量作为精炼基准',
      },
    ]

    return basisRows.map((row) => ({
      ...row,
      adjustmentFactor: toNumber(equipmentAdjustments[row.id], 1),
      sizing: calculateCopperEquipmentSizing({
        currentThroughput: row.currentThroughput,
        annualHours: annualHoursValue,
        targetScaleWanTpa: targetScaleValue,
        adjustmentFactor: toNumber(equipmentAdjustments[row.id], 1),
        unitThroughput: equipmentUnitThroughput,
      }),
    }))
  }, [
    annualHoursValue,
    equipmentAdjustments,
    equipmentUnitThroughput,
    furnaceFeed.totalWeight,
    productCalculated,
    productResult.products.matte.elementWeights,
    productResult.products.matte.mass,
    targetScaleValue,
  ])

  const buildCalculationExportTable = () => {
    const materialTotal = (material: CopperMaterialColumn | CopperFuelMaterial) =>
      formatTableNumber(calculateKnownTotal(material.ratios) + (material.ratios['Other(其他)'] ?? 0))
    const productElementRatio = (product: CopperProductTableColumn, element: CopperElementKey) =>
      productCalculated ? formatTableNumber(product.composition[element] ?? 0) : ''
    const columns: CopperBatchExportColumn[] = [
      ...rawMaterials.map((material, index) => ({ header: `原料${index + 1}`, subHeader: displayRawMaterialName(material.name) })),
      ...solventColumns.map((material, index) => ({ header: `熔剂${index + 1}`, subHeader: displaySolventName(material.name) })),
      { header: '燃料煤', subHeader: fuelColumn.name },
      { header: '富氧空气', subHeader: '富氧空气' },
      { header: '混料', subHeader: '混料' },
      ...productTableColumns.map((product) => ({
        header: '产物',
        subHeader: product.name === '总计' ? '总计' : getStageProductName(activeProcessStageId, product),
      })),
    ]
    const commonValues = (element: CopperElementKey) => [
      ...rawMaterials.map((material) => formatTableNumber(material.ratios[element] ?? 0)),
      ...solventColumns.map((material) => formatTableNumber(material.ratios[element] ?? 0)),
      formatTableNumber(fuelColumn.ratios[element] ?? 0),
      formatTableNumber(oxygenAirColumn.ratios[element] ?? 0),
      formatTableNumber(furnaceFeed.ratios[element] ?? 0),
      ...productTableColumns.map((product) => productElementRatio(product, element)),
    ]
    const rows: CopperBatchExportRow[] = [
      {
        label: 't/h',
        values: [
          ...rawMaterials.map((material) => formatTableNumber(material.weight)),
          ...solventColumns.map((material) => formatTableNumber(material.weight)),
          formatTableNumber(fuelColumn.weight),
          formatTableNumber(oxygenAirColumn.weight),
          formatTableNumber(furnaceFeed.totalWeight),
          ...productTableColumns.map((product) => (productCalculated ? formatTableNumber(product.mass) : '')),
        ],
      },
      ...COPPER_ELEMENT_KEYS.map((element) => ({
        label: element.replace(/\(.+\)/, ''),
        values: commonValues(element),
      })),
      {
        label: '合计',
        values: [
          ...rawMaterials.map(materialTotal),
          ...solventColumns.map(materialTotal),
          materialTotal(fuelColumn),
          materialTotal(oxygenAirColumn),
          '100',
          ...productTableColumns.map((product) => (productCalculated ? formatTableNumber(calculateKnownTotal(product.composition) + (product.composition['Other(其他)'] ?? 0)) : '')),
        ],
      },
    ]
    return { columns, rows }
  }

  const buildPhaseExportTable = (titlePrefix: string) => {
    const inputColumns: CopperBatchExportColumn[] = inputPhaseColumnData.map((column) => ({
      header: column.header,
      subHeader: column.subHeader,
    }))
    const inputRowKeys = ['O2', 'N2', ...INPUT_PHASE_ROW_KEYS.filter((key) => key !== 'Other'), 'Other']
    const inputRows: CopperBatchExportRow[] = [
      {
        label: 't/h',
        values: inputPhaseColumnData.map((column) => formatTableNumber(column.weight)),
      },
      ...inputRowKeys.map((key) => ({
        label: key === 'O2' || key === 'N2' ? key : key === 'Other' ? 'Other' : INPUT_PHASE_DISPLAY[key as CopperPhaseAssignmentKey] ?? key,
        values: inputPhaseColumnData.map((column) => {
          if (column.kind === 'oxygen') {
            if (key === 'O2') return formatTableNumber(column.oxygenAir?.weightPct.O2 ?? 0)
            if (key === 'N2') return formatTableNumber(column.oxygenAir?.weightPct.N2 ?? 0)
            return ''
          }
          if (key === 'O2' || key === 'N2') return ''
          return formatTableNumber(column.phases?.[key as InputPhaseRowKey] ?? 0)
        }),
      })),
      {
        label: 'v%',
        values: inputPhaseColumnData.map((column) =>
          column.kind === 'oxygen'
            ? `O₂ ${formatTableNumber(column.oxygenAir?.volumePct.O2 ?? 0)} / N₂ ${formatTableNumber(column.oxygenAir?.volumePct.N2 ?? 0)}`
            : ''
        ),
      },
      {
        label: '合计',
        values: inputPhaseColumnData.map((column) => {
          if (column.kind === 'oxygen') {
            return formatTableNumber((column.oxygenAir?.weightPct.O2 ?? 0) + (column.oxygenAir?.weightPct.N2 ?? 0))
          }
          return formatTableNumber(INPUT_PHASE_ROW_KEYS.reduce((sum, key) => sum + (column.phases?.[key] ?? 0), 0))
        }),
      },
    ]

    const outputColumns: CopperBatchExportColumn[] = outputPhaseColumnData.map((column) => ({
      header: column.header,
      subHeader: column.subHeader,
    }))
    const outputRowKeys = Array.from(new Set(Object.values(PRODUCT_PHASE_ROWS).flatMap((rows) => rows)))
    const outputRows: CopperBatchExportRow[] = [
      {
        label: 't/h',
        values: outputPhaseColumnData.map((column) => (productCalculated ? formatTableNumber(column.weight) : '')),
      },
      ...outputRowKeys.map((key) => ({
        label: PRODUCT_PHASE_DISPLAY[key] ?? key,
        values: outputPhaseColumnData.map((column) =>
          productCalculated ? formatTableNumber(column.productPhases?.[key] ?? 0) : ''
        ),
      })),
      {
        label: 'v%',
        values: outputPhaseColumnData.map((column) => {
          if (column.productKey !== 'gas' || !column.productGasVolume) return ''
          const volume = column.productGasVolume
          return `SO₂ ${formatTableNumber(volume.SO2 ?? 0)} / CO₂ ${formatTableNumber(volume.CO2 ?? 0)} / O₂ ${formatTableNumber(volume.O2 ?? 0)} / N₂ ${formatTableNumber(volume.N2 ?? 0)}`
        }),
      },
      {
        label: '合计',
        values: outputPhaseColumnData.map((column) =>
          productCalculated
            ? formatTableNumber((Object.values(column.productPhases ?? {}) as number[]).reduce((sum, value) => sum + value, 0))
            : ''
        ),
      },
    ]

    return {
      inputSheet: { title: `${titlePrefix} 投入物相`, columns: inputColumns, rows: inputRows },
      outputSheet: { title: `${titlePrefix} 产出物相`, columns: outputColumns, rows: outputRows },
    } satisfies { inputSheet: CopperBatchWorkbookSheet; outputSheet: CopperBatchWorkbookSheet }
  }

  const updateInputPhaseDraft = (columnId: string, key: string, value: string) => {
    if (!isEditableNumberDraft(value)) return
    setInputPhaseDrafts((prev) => ({
      ...prev,
      [columnId]: {
        ...(prev[columnId] ?? {}),
        [key]: value,
      },
    }))
  }

  const commitInputPhaseDraft = (columnId: string) => {
    const drafts = inputPhaseDrafts[columnId]
    if (!drafts) return

    if (columnId === oxygenAirColumn.id) {
      const o2Text = drafts.O2 ?? ''
      const n2Text = drafts.N2 ?? ''
      const o2 = o2Text.trim() === '' ? oxygenAirColumn.ratios['O (氧)'] ?? 0 : toNumber(o2Text, 0)
      const n2 = n2Text.trim() === '' ? oxygenAirColumn.ratios['N (氮)'] ?? 0 : toNumber(n2Text, 0)
      if (Math.abs(o2 + n2 - 100) > 0.02) {
        setInvalidInputPhaseColumns((prev) => ({ ...prev, [columnId]: true }))
        setWorkflowMessage('富氧空气物相 O₂/N₂ 合计须为 100%。')
        return
      }
      setInvalidInputPhaseColumns((prev) => ({ ...prev, [columnId]: false }))
      updateOxygenAirComposition(formatTableNumber(o2), formatTableNumber(n2))
      setPhaseRatioOverrides((prev) => ({
        ...prev,
        [columnId]: { O2: formatTableNumber(o2), N2: formatTableNumber(n2) },
      }))
      setManualPhaseRatioColumns((prev) => ({ ...prev, [columnId]: true }))
      setInputPhaseDrafts((prev) => {
        const next = { ...prev }
        delete next[columnId]
        return next
      })
      setWorkflowMessage('已按物相 w% 反推富氧空气 O/N 组成。')
      return
    }

    const inputColumn = inputPhaseColumnData.find((column) => column.id === columnId)
    const mergedDrafts = Object.fromEntries(
      INPUT_PHASE_ROW_KEYS.map((key) => {
        const fallback = inputColumn?.phases?.[key] ?? 0
        const text = drafts[key]
        return [key, text != null && text !== '' ? text : fallback > 0 ? formatTableNumber(fallback) : '0']
      })
    ) as Partial<Record<InputPhaseRowKey, string>>
    const parsed = parsePhaseDraftMap(mergedDrafts)
    if (!isPhaseColumnValid(parsed)) {
      setInvalidInputPhaseColumns((prev) => ({ ...prev, [columnId]: true }))
      setWorkflowMessage('投入物相列合计须为 100%（±0.02），请修正后再回填。')
      return
    }
    setInvalidInputPhaseColumns((prev) => ({ ...prev, [columnId]: false }))
    const normalized = normalizePhasePercents(parsed)
    const draftStrings = Object.fromEntries(
      INPUT_PHASE_ROW_KEYS.map((key) => [key, formatTableNumber(normalized[key] ?? 0)])
    ) as Record<string, string>

    const rawMaterial = rawMaterials.find((material) => material.id === columnId)
    if (rawMaterial) {
      const elements = deriveElementsFromPhaseContents(
        normalized,
        rawMaterial.ratios,
        phaseInputsFromDraft(phaseDrafts[columnId])
      )
      updateRawMaterial(columnId, { ratios: elements })
      setPhaseRatioOverrides((prev) => ({ ...prev, [columnId]: draftStrings }))
      setManualPhaseRatioColumns((prev) => ({ ...prev, [columnId]: true }))
      setInputPhaseDrafts((prev) => {
        const next = { ...prev }
        delete next[columnId]
        return next
      })
      setWorkflowMessage(`已按物相 w% 反推 ${displayRawMaterialName(rawMaterial.name)} 元素组成。`)
      return
    }

    const solventMaterial = solventColumns.find((material) => material.id === columnId)
    if (solventMaterial) {
      const elements = deriveElementsFromPhaseContents(normalized, solventMaterial.ratios)
      updateSolventColumn(columnId, { ratios: elements })
      setPhaseRatioOverrides((prev) => ({ ...prev, [columnId]: draftStrings }))
      setManualPhaseRatioColumns((prev) => ({ ...prev, [columnId]: true }))
      setInputPhaseDrafts((prev) => {
        const next = { ...prev }
        delete next[columnId]
        return next
      })
      setWorkflowMessage(`已按物相 w% 反推 ${solventMaterial.name} 元素组成。`)
      return
    }

    if (columnId === fuelColumn.id) {
      const elements = deriveElementsFromPhaseContents(normalized, fuelColumn.ratios)
      setFuelColumn((prev) => ({ ...prev, ratios: elements }))
      clearIterationResult()
      setProductPreviewReady(false)
      setHeatPreviewReady(false)
      setProductCalculated(false)
      setHeatBalanced(false)
      setPhaseRatioOverrides((prev) => ({ ...prev, [columnId]: draftStrings }))
      setManualPhaseRatioColumns((prev) => ({ ...prev, [columnId]: true }))
      setInputPhaseDrafts((prev) => {
        const next = { ...prev }
        delete next[columnId]
        return next
      })
      setWorkflowMessage('已按物相 w% 反推燃料煤元素组成。')
    }
  }

  const updateOutputPhaseDraft = (columnId: string, key: string, value: string) => {
    if (!isEditableNumberDraft(value)) return
    setOutputPhaseDrafts((prev) => ({
      ...prev,
      [columnId]: {
        ...(prev[columnId] ?? {}),
        [key]: value,
      },
    }))
  }

  const commitOutputPhaseDraft = (columnId: string) => {
    if (columnId === 'total' || columnId === 'loss' || !productCalculated) return
    const productKey = columnId as CopperProductKey
    const drafts = outputPhaseDrafts[columnId]
    if (!drafts) return
    const outputColumn = outputPhaseColumnData.find((column) => column.id === columnId)
    const rows = PRODUCT_PHASE_ROWS[productKey]
    const mergedDrafts = Object.fromEntries(
      rows.map((key) => {
        const fallback = outputColumn?.productPhases?.[key] ?? 0
        const text = drafts[key]
        return [key, text != null && text !== '' ? text : fallback > 0 ? formatTableNumber(fallback) : '0']
      })
    )
    const parsed = parseProductPhaseDraftMap(mergedDrafts, rows)
    if (!isProductPhaseColumnValid(parsed, productKey)) {
      setInvalidOutputPhaseColumns((prev) => ({ ...prev, [columnId]: true }))
      setWorkflowMessage('产出物相列合计须为 100%（±0.02），请修正后再回填。')
      return
    }
    setInvalidOutputPhaseColumns((prev) => ({ ...prev, [columnId]: false }))
    setProductPhaseOverrides((prev) => ({ ...prev, [columnId]: { ...drafts } }))
    setProductPhaseManual(true)
    setOutputPhaseDrafts((prev) => {
      const next = { ...prev }
      delete next[columnId]
      return next
    })
    setWorkflowMessage('已按产出物相 w% 反推产物元素组成；完整闭环请重新迭代计算。')
  }

  const exportCalculationTable = () => {
    const { columns, rows } = buildCalculationExportTable()
    const titlePrefix = `${APP_NAME_ZH} ${getCopperStageExportName(activeStage.name)} 配料总表`
    const { inputSheet, outputSheet } = buildPhaseExportTable(titlePrefix)
    const sheets: CopperBatchWorkbookSheet[] = [
      { title: `${titlePrefix} 元素总表`, columns, rows },
      inputSheet,
      outputSheet,
    ]
    const filename = buildCopperBatchExportFilename({ appName: APP_NAME_ZH, stageName: activeStage.name })
    const html = buildCopperBatchWorkbookHtml(sheets)
    downloadCopperBatchExcel(filename, html)
  }

  const activePhasePreview =
    selectedPhaseMaterial && phasePreviewUnknowns?.materialId === selectedPhaseMaterial.id ? phasePreviewUnknowns : null

  const activeMaterialPhaseRows = selectedPhaseMaterial
    ? materialPhaseRows[selectedPhaseMaterial.id] ?? createDefaultMaterialPhaseRows()
    : []

  const selectedPhaseMaterialError = selectedPhaseMaterial
    ? validateMaterialForPhaseCalc(selectedPhaseMaterial)
    : null

  const liveOrderedContents = useMemo(() => {
    if (!selectedPhaseMaterial || selectedPhaseMaterialError) return {}
    return deriveOrderedPhaseContents(
      selectedPhaseMaterial.ratios,
      toPhaseAssistSpecs(activeMaterialPhaseRows),
      phaseInputsFromDraft(currentPhaseDraft)
    ).byRowId
  }, [activeMaterialPhaseRows, currentPhaseDraft, selectedPhaseMaterial, selectedPhaseMaterialError])

  const phaseAssistDisplayRows = useMemo(
    () =>
      activeMaterialPhaseRows.map((row) => {
        const draft = currentPhaseDraft[row.id] ?? { value: '', factor: '1' }
        const activity = toNumber(draft.factor, 1)
        const isDraft = row.kind === 'draft'
        const previewContent = activePhasePreview?.phaseContents[row.id]
        const derivedBase = previewContent ?? liveOrderedContents[row.id] ?? null
        const derivedContent = isDraft ? null : derivedBase
        const effective = derivedContent == null ? null : derivedContent * activity
        return {
          ...row,
          draft,
          derivedContent,
          effective,
          sulfur: effective == null ? null : phaseRowSulfurContribution(row, effective),
          oxygen: effective == null ? null : phaseRowOxygenContribution(row, effective),
          carbon: effective == null ? null : phaseRowCarbonContribution(row, effective),
        }
      }),
    [activeMaterialPhaseRows, activePhasePreview, currentPhaseDraft, liveOrderedContents]
  )

  const hasPendingDraftRows = activeMaterialPhaseRows.some((row) => row.kind === 'draft')
  const hasFormulaErrors = activeMaterialPhaseRows.some((row) => {
    if (!selectedPhaseMaterial) return false
    const key = rowDraftStorageKey(selectedPhaseMaterial.id, row.id)
    return Boolean(phaseRowFormulaErrors[key])
  })

  const updateRawMaterial = (
    id: string,
    patch: Partial<CopperMaterialColumn>,
    options: { preservePhaseCompletion?: boolean } = {}
  ) => {
    setRawMaterials((prev) => prev.map((material) => (material.id === id ? { ...material, ...patch } : material)))
    clearIterationResult()
    setSolventSolution(null)
    setSolventPreviewSolution(null)
    setProductPreviewReady(false)
    setHeatPreviewReady(false)
    if (!options.preservePhaseCompletion) {
      setPhaseCompleted(false)
      setPhaseCompletedMaterials((prev) => ({ ...prev, [id]: false }))
      setPhasePreviewUnknowns((prev) => (prev?.materialId === id ? null : prev))
    }
    setProductCalculated(false)
    setHeatBalanced(false)
  }

  const updateOxygenAirColumn = (patch: Partial<CopperMaterialColumn>) => {
    setOxygenAirColumn((prev) => ({ ...prev, ...patch }))
    clearIterationResult()
    setProductPreviewReady(false)
    setHeatPreviewReady(false)
    setProductCalculated(false)
    setHeatBalanced(false)
  }

  const updateRawWeight = (id: string, value: string) => {
    if (!isEditableNumberDraft(value)) return
    setRawWeightDrafts((prev) => ({ ...prev, [id]: value }))
    updateRawMaterial(id, { weight: isValidNumberText(value) ? toNumber(value, 0) : 0 }, { preservePhaseCompletion: true })
  }

  const updateSolventColumn = (id: string, patch: Partial<CopperMaterialColumn>) => {
    setSolventColumns((prev) => prev.map((material) => (material.id === id ? { ...material, ...patch } : material)))
    clearIterationResult()
    setSolventSolution(null)
    setSolventPreviewSolution(null)
    setProductPreviewReady(false)
    setHeatPreviewReady(false)
    setProductCalculated(false)
    setHeatBalanced(false)
  }

  const updateFuelColumn = (patch: Partial<CopperFuelMaterial>) => {
    setFuelColumn((prev) => ({ ...prev, ...patch }))
    clearIterationResult()
    setHeatPreviewReady(false)
    setHeatBalanced(false)
    setManualFuelWeightValid(false)
  }

  const updateRatio = (id: string, element: CopperElementKey, value: number, kind: 'raw' | 'solvent') => {
    const update = kind === 'raw' ? updateRawMaterial : updateSolventColumn
    const list = kind === 'raw' ? rawMaterials : solventColumns
    const current = list.find((material) => material.id === id)
    if (!current) return
    const nextRatios = { ...current.ratios, [element]: value }
    update(id, { ratios: nextRatios })
    if (kind === 'raw') {
      const sulfurError = validateRatiosSulfurRequirement(nextRatios, current.name.trim() || '该原料')
      if (sulfurError) {
        setWorkflowMessage(`${sulfurError}，请补全 S(硫) 后再进行物相折算。`)
        setPhaseCompletedMaterials((prev) => ({ ...prev, [id]: false }))
        setPhaseCompleted(false)
      }
    }
  }

  const updateRatioDraft = (
    kind: DraftRatioKind,
    id: string,
    element: CopperElementKey,
    value: string
  ) => {
    if (!isEditableNumberDraft(value)) return
    const key = ratioDraftKey(kind, id, element)
    setRatioDrafts((prev) => ({ ...prev, [key]: value }))
    if (!isValidNumberText(value)) {
      if (kind === 'raw' && PHASE_UNKNOWN_ELEMENTS.has(element)) {
        setManualPhaseCells((prev) => ({ ...prev, [phaseCellKey(id, element)]: false }))
      }
      return
    }
    const numericValue = toNumber(value, 0)
    if (kind === 'fuel') {
      updateFuelRatio(element, numericValue)
    } else if (kind === 'gas') {
      updateOxygenAirRatio(element, numericValue)
    } else {
      updateRatio(id, element, numericValue, kind)
      if (kind === 'raw' && PHASE_UNKNOWN_ELEMENTS.has(element)) {
        setManualPhaseCells((prev) => ({ ...prev, [phaseCellKey(id, element)]: true }))
      }
    }
  }

  const commitRatioDraft = (
    kind: DraftRatioKind,
    id: string,
    element: CopperElementKey,
    value: number | undefined
  ) => {
    const key = ratioDraftKey(kind, id, element)
    setRatioDrafts((prev) => {
      if (!(key in prev)) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })
    if (kind === 'raw' && PHASE_UNKNOWN_ELEMENTS.has(element) && !Number.isFinite(value ?? NaN)) {
      setManualPhaseCells((prev) => ({ ...prev, [phaseCellKey(id, element)]: false }))
    }
  }

  const updateFuelRatio = (element: CopperElementKey, value: number) => {
    updateFuelColumn({ ratios: { ...fuelColumn.ratios, [element]: value } })
  }

  const updateOxygenAirRatio = (element: CopperElementKey, value: number) => {
    if (element === 'O (氧)' || element === 'N (氮)') {
      const clamped = Math.min(100, Math.max(0, value))
      const oxygen = element === 'O (氧)' ? clamped : 100 - clamped
      const nitrogen = element === 'N (氮)' ? clamped : 100 - clamped
      const next = createOxygenAirColumn(oxygenAirColumn.weight, { oxygenPct: oxygen, nitrogenPct: nitrogen })
      setOxygenAirO2Pct(formatTableNumber(oxygen))
      setOxygenAirN2Pct(formatTableNumber(nitrogen))
      updateOxygenAirColumn({ ratios: next.ratios })
      return
    }
    updateOxygenAirColumn({ ratios: { ...emptyCopperRatios(), 'O (氧)': oxygenAirColumn.ratios['O (氧)'] ?? 0, 'N (氮)': oxygenAirColumn.ratios['N (氮)'] ?? 0 } })
  }

  const updateRawRatio = (id: string, element: CopperElementKey, value: string) => {
    updateRatioDraft('raw', id, element, value)
  }

  const updateSolventWeight = (id: string, value: string) => {
    if (!isEditableNumberDraft(value)) return
    setRatioDrafts((prev) => ({ ...prev, [`solvent-weight:${id}`]: value }))
    const valid = isValidNumberText(value)
    if (!valid) {
      setManualSolventWeights((prev) => ({ ...prev, [id]: false }))
      return
    }
    updateSolventColumn(id, { weight: toNumber(value, 0) })
    setManualSolventWeights((prev) => ({ ...prev, [id]: true }))
  }

  const commitSolventWeightDraft = (id: string) => {
    setRatioDrafts((prev) => {
      const key = `solvent-weight:${id}`
      if (!(key in prev)) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  const updateFuelWeight = (value: string) => {
    if (!isEditableNumberDraft(value)) return
    setRatioDrafts((prev) => ({ ...prev, 'fuel-weight:fuel-coal': value }))
    if (!isValidNumberText(value)) {
      setManualFuelWeightValid(false)
      return
    }
    updateFuelColumn({ weight: toNumber(value, 0) })
    setManualFuelWeightValid(true)
  }

  const commitFuelWeightDraft = () => {
    setRatioDrafts((prev) => {
      const key = 'fuel-weight:fuel-coal'
      if (!(key in prev)) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  const applyLibraryMaterial = (id: string, libraryId: string) => {
    const selected = materialLibrary.find((material) => material.id === libraryId)
    if (!selected) {
      updateRawMaterial(id, {
        name: '',
        ratios: emptyCopperRatios(),
        unitPrice: 0,
      })
      setRatioDrafts((prev) => {
        const prefix = `raw:${id}:`
        return Object.fromEntries(Object.entries(prev).filter(([key]) => !key.startsWith(prefix)))
      })
      return
    }
    const sulfurError = validateRatiosSulfurRequirement(selected.ratios, selected.name)
    if (sulfurError) {
      setWorkflowMessage(`${sulfurError}，无法选用该原料，请先在原料库或元素总表补全 S(硫)。`)
      return
    }
    updateRawMaterial(id, {
      name: selected.name,
      ratios: { ...selected.ratios },
      unitPrice: selected.unitPrice,
    })
  }

  const addMaterial = () => {
    const id = `cu-custom-${Date.now()}`
    setRawMaterials((prev) => [
      ...prev,
      {
        id,
        name: '',
        kind: 'raw',
        weight: 0,
        ratios: Object.fromEntries(COPPER_ELEMENT_KEYS.map((element) => [element, 0])) as Record<CopperElementKey, number>,
        unitPrice: 0,
      },
    ])
    setRawWeightDrafts((prev) => ({ ...prev, [id]: '' }))
    clearIterationResult()
    setSolventSolution(null)
    setSolventPreviewSolution(null)
    setProductPreviewReady(false)
    setHeatPreviewReady(false)
    setPhaseCompleted(false)
    setProductCalculated(false)
    setHeatBalanced(false)
  }

  const importLibraryFile = async (file: File | null) => {
    if (!file) return
    const lowerName = file.name.toLowerCase()
    if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls')) {
      setImportFeedback('请先在 Excel 中另存为 CSV 或制表符文本后导入。')
      return
    }
    const text = await file.text()
    const imported = parseCopperLibraryCsv(text)
    if (imported.length === 0) {
      setImportFeedback('未识别到原料数据，请确认包含“原料名称”和元素列。')
      return
    }
    setMaterialLibrary((prev) => [...prev, ...imported])
    setShowLibrary(true)
    setImportFeedback(`已批量导入 ${imported.length} 种原料到原料库。`)
  }

  const singleLibraryRowTotal = (row: SingleLibraryRow) =>
    calculateKnownTotal(row.ratios) + (row.ratios['Other(其他)'] ?? 0)

  const addSingleLibraryRow = () => {
    setLibraryDialogMessage(null)
    setSingleLibraryRows((prev) => [...prev, createSingleLibraryRow(prev.length)])
  }

  const removeSingleLibraryRow = (id: string) => {
    setLibraryDialogMessage(null)
    setSingleLibraryRows((prev) => (prev.length <= 1 ? prev : prev.filter((row) => row.id !== id)))
  }

  const updateSingleLibraryRowName = (id: string, value: string) => {
    setLibraryDialogMessage(null)
    setSingleLibraryRows((prev) => prev.map((row) => (row.id === id ? { ...row, name: value } : row)))
  }

  const updateSingleLibraryRowRatio = (id: string, element: CopperElementKey, value: string) => {
    setLibraryDialogMessage(null)
    setSingleLibraryRows((prev) =>
      prev.map((row) =>
        row.id === id
          ? { ...row, ratios: { ...row.ratios, [element]: isValidNumberText(value) ? toNumber(value, 0) : 0 } }
          : row
      )
    )
  }

  const closeLibraryMaterialDialog = () => {
    setLibraryDialogMessage(null)
    setShowSingleLibraryAddDialog(false)
    setLibraryMaterialDialogMode('add')
    setSingleLibraryRows([createSingleLibraryRow()])
  }

  const openLibraryMaterialAddDialog = () => {
    setLibraryMaterialDialogMode('add')
    setLibraryDialogMessage(null)
    setSingleLibraryRows([createSingleLibraryRow()])
    setShowSingleLibraryAddDialog(true)
  }

  const openLibraryMaterialEditDialog = (material: CopperLibraryMaterial) => {
    setLibraryMaterialDialogMode('edit')
    setLibraryDialogMessage(null)
    setSingleLibraryRows([
      {
        id: createSingleLibraryRow().id,
        libraryMaterialId: material.id,
        name: material.name,
        ratios: { ...emptyCopperRatios(), ...material.ratios },
      },
    ])
    setShowSingleLibraryAddDialog(true)
  }

  const submitLibraryMaterialDialog = () => {
    if (libraryMaterialDialogMode === 'edit') {
      const row = singleLibraryRows[0]
      const editId = row?.libraryMaterialId
      if (!row || !editId) {
        setLibraryDialogMessage('无法保存：未找到原料记录。')
        return
      }
      const trimmed = row.name.trim()
      if (trimmed.length === 0) {
        setLibraryDialogMessage('请输入原料名称后再保存。')
        return
      }
      const total = singleLibraryRowTotal(row)
      if (total > 100) {
        setLibraryDialogMessage(`${trimmed} 的成分合计不能超过 100%。当前合计为 ${format(total)}%。`)
        return
      }
      const sulfurError = validateRatiosSulfurRequirement(row.ratios, trimmed)
      if (sulfurError) {
        setLibraryDialogMessage(`${sulfurError}。`)
        return
      }
      setLibraryDialogMessage(null)
      setMaterialLibrary((prev) =>
        prev.map((m) =>
          m.id === editId ? { ...m, name: trimmed, ratios: { ...row.ratios } } : m
        )
      )
      setImportFeedback(`已更新原料库：${trimmed}`)
      closeLibraryMaterialDialog()
      setShowLibrary(true)
      return
    }

    const rowsToAdd = singleLibraryRows.filter((row) => row.name.trim().length > 0)
    if (rowsToAdd.length === 0) {
      setLibraryDialogMessage('请输入原料名称后再添加到原料库。')
      return
    }
    const invalidRow = rowsToAdd.find((row) => singleLibraryRowTotal(row) > 100)
    if (invalidRow) {
      setLibraryDialogMessage(
        `${invalidRow.name.trim()} 的成分合计不能超过 100%。当前合计为 ${format(singleLibraryRowTotal(invalidRow))}%。`
      )
      return
    }
    const sulfurInvalidRow = rowsToAdd.find((row) => validateRatiosSulfurRequirement(row.ratios, row.name.trim()))
    if (sulfurInvalidRow) {
      setLibraryDialogMessage(validateRatiosSulfurRequirement(sulfurInvalidRow.ratios, sulfurInvalidRow.name.trim()))
      return
    }
    setLibraryDialogMessage(null)
    const materials = rowsToAdd.map((row, index): CopperLibraryMaterial => ({
      id: `cu-library-custom-${Date.now()}-${index}`,
      name: row.name.trim(),
      category: 'concentrate',
      ratios: { ...row.ratios },
      unitPrice: 0,
    }))
    setMaterialLibrary((prev) => [...prev, ...materials])
    setImportFeedback(`已添加 ${materials.length} 种原料到原料库。`)
    closeLibraryMaterialDialog()
    setShowLibrary(true)
  }

  const removeLibraryMaterial = (id: string) => {
    const target = materialLibrary.find((material) => material.id === id)
    setMaterialLibrary((prev) => prev.filter((material) => material.id !== id))
    if (target) {
      setImportFeedback(`已从原料库移除：${target.name}`)
    }
  }

  const removeMaterial = (id: string) => {
    setRawMaterials((prev) => (prev.length <= 1 ? prev : prev.filter((material) => material.id !== id)))
    setRawWeightDrafts((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
    clearIterationResult()
    setSolventSolution(null)
    setSolventPreviewSolution(null)
    setProductPreviewReady(false)
    setHeatPreviewReady(false)
    setPhaseCompletedMaterials((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
    setPhasePreviewUnknowns((prev) => (prev?.materialId === id ? null : prev))
    setPhaseCompleted(false)
    setProductCalculated(false)
    setHeatBalanced(false)
  }

  const scrollToAssist = (ref: RefObject<HTMLDivElement>) => {
    window.requestAnimationFrame(() => {
      ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  const scrollToCalculationTable = () => {
    window.requestAnimationFrame(() => {
      calculationTableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
  }

  const openIterationAssist = () => {
    scrollToAssist(iterationAssistRef)
  }

  const openElementAssist = (materialId: string) => {
    setMaterialPhaseRows((prev) => {
      if (prev[materialId]?.length) return prev
      return { ...prev, [materialId]: createDefaultMaterialPhaseRows() }
    })
    setPhaseMaterialId(materialId)
    setPhasePreviewUnknowns((prev) => (prev?.materialId === materialId ? prev : null))
    setShowElementAssist(true)
    scrollToAssist(elementAssistRef)
    const material = rawMaterials.find((item) => item.id === materialId)
    if (material) {
      const phaseError = validateMaterialForPhaseCalc(material)
      if (phaseError) setWorkflowMessage(phaseError)
    }
  }

  const clearIterationResult = () => {
    setIterationResult(null)
  }

  const updateHeatField = (setter: (value: string) => void, value: string) => {
    setter(value)
    clearIterationResult()
    setHeatPreviewReady(false)
    setHeatBalanced(false)
  }

  const updateTargetFeSiO2 = (value: string) => {
    setTargetFeSiO2(value)
    clearIterationResult()
    setSolventPreviewSolution(null)
    setSolventSolution(null)
    setProductPreviewReady(false)
    setProductCalculated(false)
    setHeatPreviewReady(false)
    setHeatBalanced(false)
  }

  const updateTargetCaOSiO2 = (value: string) => {
    setTargetCaOSiO2(value)
    clearIterationResult()
    setSolventPreviewSolution(null)
    setSolventSolution(null)
    setProductPreviewReady(false)
    setProductCalculated(false)
    setHeatPreviewReady(false)
    setHeatBalanced(false)
  }

  const updateOxygenAirComposition = (oxygenText: string, nitrogenText: string) => {
    const editedOxygen = oxygenText !== oxygenAirO2Pct
    const editedNitrogen = nitrogenText !== oxygenAirN2Pct
    const sourceText = editedOxygen || !editedNitrogen ? oxygenText : nitrogenText
    if (!isEditableNumberDraft(sourceText)) return
    const nextOxygenText =
      editedOxygen || !editedNitrogen
        ? oxygenText
        : isValidNumberText(nitrogenText)
        ? formatTableNumber(100 - Math.min(100, Math.max(0, toNumber(nitrogenText, 30))))
        : oxygenAirO2Pct
    const nextNitrogenText =
      editedOxygen || !editedNitrogen
        ? isValidNumberText(oxygenText)
          ? formatTableNumber(100 - Math.min(100, Math.max(0, toNumber(oxygenText, 70))))
          : oxygenAirN2Pct
        : nitrogenText
    setOxygenAirO2Pct(nextOxygenText)
    setOxygenAirN2Pct(nextNitrogenText)
    if (isValidNumberText(nextOxygenText) && isValidNumberText(nextNitrogenText)) {
      const next = createOxygenAirColumn(oxygenAirColumn.weight, {
        oxygenPct: toNumber(nextOxygenText, 70),
        nitrogenPct: toNumber(nextNitrogenText, 30),
      })
      updateOxygenAirColumn({ ratios: next.ratios })
    } else {
      clearIterationResult()
      setProductPreviewReady(false)
      setHeatPreviewReady(false)
      setProductCalculated(false)
      setHeatBalanced(false)
    }
  }

  const updateEquipmentAdjustment = (id: EquipmentStageId, value: string) => {
    setEquipmentAdjustments((prev) => ({ ...prev, [id]: value }))
  }

  const applyIterativeResult = (result: CopperIterativeBalanceResult, options: { userInitiated?: boolean } = {}) => {
    setIterationResult(result)
    if (!result.valid || !result.finalSolventSolution?.valid) {
      setSolventPreviewSolution(result.finalSolventSolution)
      setProductPreviewReady(false)
      setHeatPreviewReady(false)
      if (options.userInitiated) {
        setWorkflowMessage(result.message ?? '迭代计算未能收敛，请调整渣型目标、熔剂成分或热平衡参数。')
      }
      return false
    }

    setSolventPreviewSolution(result.finalSolventSolution)
    setProductPreviewReady(true)
    setHeatPreviewReady(true)
    return true
  }

  const applyIterationResultToSummaryTable = () => {
    if (!iterationResult?.valid || !iterationResult.finalSolventSolution?.valid) {
      setWorkflowMessage('请先完成有效的迭代计算，再回填到配料总表。')
      return
    }
    setSolventSolution(iterationResult.finalSolventSolution)
    setSolventColumns(iterationResult.finalSolventColumns)
    setManualSolventWeights(
      Object.fromEntries(iterationResult.finalSolventColumns.map((column) => [column.id, true])) as Record<string, boolean>
    )
    setFuelColumn(iterationResult.finalFuel)
    setManualFuelWeightValid(true)
    setOxygenAirColumn(iterationResult.finalOxygenAirColumn)
    setProductPreviewReady(true)
    setProductCalculated(true)
    setHeatPreviewReady(true)
    setHeatBalanced(true)
    setProductPhaseManual(false)
    setProductPhaseOverrides({})
    setManualPhaseRatioColumns({})
    setPhaseRatioOverrides({})
    setInputPhaseDrafts({})
    setOutputPhaseDrafts({})
    setInvalidInputPhaseColumns({})
    setInvalidOutputPhaseColumns({})
    setWorkflowMessage(
      `已回填迭代结果：熔剂 ${format(iterationResult.finalSolventColumns.reduce((sum, column) => sum + column.weight, 0))} t/h，富氧空气 ${format(iterationResult.finalOxygenAirColumn.weight)} t/h，燃料煤 ${format(iterationResult.finalFuel.weight)} t/h，产物汇总 ${format(copperProductSummaryWeight(iterationResult.finalProducts))} t/h。`
    )
    scrollToCalculationTable()
  }

  const calculateCurrentIterativeBalance = () =>
    calculateCopperIterativeBalance({
      rawMaterials,
      solventColumns,
      fuel: {
        ...fuelColumn,
        lowerHeatingValueMJkg: toNumber(fuelLhv, DEFAULT_COPPER_FUEL.lowerHeatingValueMJkg),
        combustionEfficiency: toNumber(fuelEfficiency, DEFAULT_COPPER_FUEL.combustionEfficiency),
      },
      targetFeSiO2: toNumber(targetFeSiO2, 2.8),
      targetCaOSiO2: toNumber(targetCaOSiO2, 0.45),
      oxygenAirSettings: {
        oxygenPct: toNumber(oxygenAirO2Pct, 70),
        nitrogenPct: toNumber(oxygenAirN2Pct, 30),
        oxygenSupplyCoefficient: toNumber(oxygenSupplyCoefficient, 1.15),
      },
      phaseInputsByMaterialId: Object.fromEntries(
        rawMaterials.map((material) => [material.id, phaseDrafts[material.id] ?? DEFAULT_PHASE_DRAFT])
      ),
      heatSettings: {
        feedTemperature: toNumber(feedTemperature, 25),
        matteTemperature: toNumber(matteTemperature, 1180),
        slagTemperature: toNumber(slagTemperature, 1250),
        gasTemperature: toNumber(gasTemperature, 1150),
        dustTemperature: toNumber(dustTemperature, 450),
        heatLossMJh: toNumber(heatLossMJh, 1500),
        otherHeatMJh: toNumber(otherHeatMJh, 0),
      },
    })

  const runIterativeCalculation = async () => {
    if (!allRawMaterialsSelected) {
      setWorkflowMessage('请先在配料总表名称列选择所有原料，再开始迭代计算。')
      scrollToCalculationTable()
      return
    }
    if (!allPhaseMaterialsCompleted) {
      setWorkflowMessage('请先逐一完成所有原料的物相折算与元素补全，再开始迭代计算。')
      setShowElementAssist(true)
      scrollToAssist(elementAssistRef)
      return
    }
    if (!iterationInputValid) {
      setWorkflowMessage('请先补全出炉渣型、温度、热损失和燃料参数中的数值输入。')
      scrollToAssist(iterationAssistRef)
      return
    }
    setIsIterating(true)
    setProductPhaseManual(false)
    setProductPhaseOverrides({})
    setWorkflowMessage('迭代计算中，请稍候…')
    try {
      await new Promise((resolve) => window.setTimeout(resolve, 1000))
      const result = calculateCurrentIterativeBalance()
      setShowSolventAssist(false)
      setShowOxygenAirAssist(false)
      setShowProductAssist(false)
      setShowHeatAssist(false)
      setIterationAutoLinked(true)
      if (!applyIterativeResult(result, { userInitiated: true })) return
      setWorkflowMessage(
        `${result.converged ? '迭代计算已收敛' : '迭代计算已完成但需复核残差'}：已生成${processStageCopy.slagBasis}熔剂、${processStageCopy.targetProduct}等产出、富氧空气和热平衡预览，请在下方迭代结果区复核后回填到配料总表；产物总量 ${format(result.finalProducts.totalProductMass)} t/h，富氧空气 ${format(result.finalOxygenAirColumn.weight)} t/h，推荐燃料煤 ${format(result.finalFuel.weight)} t/h。${result.message ? ` ${result.message}` : ''}`
      )
      scrollToAssist(solventAssistRef)
    } finally {
      setIsIterating(false)
    }
  }

  const updatePhaseDraft = (materialId: string, key: string, field: keyof PhaseDraftEntry, value: string) => {
    setPhaseDrafts((prev) => ({
      ...prev,
      [materialId]: {
        ...(prev[materialId] ?? DEFAULT_PHASE_DRAFT),
        [key]: {
          ...((prev[materialId] ?? DEFAULT_PHASE_DRAFT)[key] ?? { value: '', factor: '1' }),
          [field]: value,
        },
      },
    }))
    setPhasePreviewUnknowns((prev) => (prev?.materialId === materialId ? null : prev))
  }

  const appendDraftPhaseRow = (materialId: string) => {
    const draftRow = createDraftMaterialPhaseRow()
    setMaterialPhaseRows((prev) => ({
      ...prev,
      [materialId]: [...(prev[materialId] ?? createDefaultMaterialPhaseRows()), draftRow],
    }))
    setPhaseRowFormulaDrafts((prev) => ({
      ...prev,
      [rowDraftStorageKey(materialId, draftRow.id)]: '',
    }))
    setPhasePreviewUnknowns((prev) => (prev?.materialId === materialId ? null : prev))
  }

  const updatePhaseRowFormulaDraft = (materialId: string, rowId: string, value: string) => {
    const key = rowDraftStorageKey(materialId, rowId)
    setPhaseRowFormulaDrafts((prev) => ({ ...prev, [key]: value }))
    if (phaseRowFormulaErrors[key]) {
      setPhaseRowFormulaErrors((prev) => {
        const next = { ...prev }
        delete next[key]
        return next
      })
    }
  }

  const commitPhaseRowFormula = (materialId: string, rowId: string) => {
    const key = rowDraftStorageKey(materialId, rowId)
    const text = phaseRowFormulaDrafts[key] ?? ''
    const resolved = resolveMaterialPhaseFormula(text)
    if (!resolved.ok || !resolved.row) {
      setPhaseRowFormulaErrors((prev) => ({ ...prev, [key]: resolved.errors.join('；') || '请输入物相' }))
      return
    }
    const existingRows = materialPhaseRows[materialId] ?? createDefaultMaterialPhaseRows()
    const duplicate = findDuplicateMaterialPhase(existingRows, resolved.row.formula, rowId)
    if (duplicate) {
      setPhaseRowFormulaErrors((prev) => ({
        ...prev,
        [key]: `物相 ${resolved.row!.displayLabel} 与表中「${duplicate.displayLabel}」重复`,
      }))
      return
    }
    setMaterialPhaseRows((prev) => ({
      ...prev,
      [materialId]: (prev[materialId] ?? createDefaultMaterialPhaseRows()).map((row) =>
        row.id === rowId
          ? {
              ...row,
              kind: 'custom',
              formula: resolved.row!.formula,
              displayLabel: resolved.row!.displayLabel,
              fractions: resolved.row!.fractions,
            }
          : row
      ),
    }))
    setPhaseDrafts((prev) => ({
      ...prev,
      [materialId]: {
        ...(prev[materialId] ?? DEFAULT_PHASE_DRAFT),
        [rowId]: { value: '', factor: '1' },
      },
    }))
    setPhaseRowFormulaDrafts((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
    setPhaseRowFormulaErrors((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
    setPhasePreviewUnknowns((prev) => (prev?.materialId === materialId ? null : prev))
  }

  const removeMaterialPhaseRow = (materialId: string, rowId: string) => {
    const key = rowDraftStorageKey(materialId, rowId)
    setMaterialPhaseRows((prev) => ({
      ...prev,
      [materialId]: (prev[materialId] ?? createDefaultMaterialPhaseRows()).filter((row) => row.id !== rowId),
    }))
    setPhaseDrafts((prev) => {
      const materialDraft = { ...(prev[materialId] ?? DEFAULT_PHASE_DRAFT) }
      delete materialDraft[rowId]
      return { ...prev, [materialId]: materialDraft }
    })
    setPhaseRowFormulaDrafts((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
    setPhaseRowFormulaErrors((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
    setPhasePreviewUnknowns((prev) => (prev?.materialId === materialId ? null : prev))
    setWorkflowMessage('已删除物相行。')
  }

  const clearPhaseRowDragState = () => {
    setPhaseRowDragId(null)
    setPhaseRowDropTargetId(null)
    setPhaseRowDropPosition(null)
  }

  const handlePhaseRowDragStart = (rowId: string) => (event: ReactDragEvent<HTMLButtonElement>) => {
    setPhaseRowDragId(rowId)
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', rowId)
  }

  const handlePhaseRowDragOver = (rowId: string) => (event: ReactDragEvent<HTMLTableRowElement>) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    if (!phaseRowDragId || phaseRowDragId === rowId) return
    const rect = event.currentTarget.getBoundingClientRect()
    const position = event.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
    setPhaseRowDropTargetId(rowId)
    setPhaseRowDropPosition(position)
  }

  const handlePhaseRowDrop = (materialId: string, targetRowId: string) => (event: ReactDragEvent<HTMLTableRowElement>) => {
    event.preventDefault()
    const draggedId = phaseRowDragId ?? event.dataTransfer.getData('text/plain')
    const position = phaseRowDropPosition ?? 'before'
    if (draggedId && draggedId !== targetRowId) {
      setMaterialPhaseRows((prev) => ({
        ...prev,
        [materialId]: reorderMaterialPhaseRow(
          prev[materialId] ?? createDefaultMaterialPhaseRows(),
          draggedId,
          targetRowId,
          position
        ),
      }))
      setPhasePreviewUnknowns((prev) => (prev?.materialId === materialId ? null : prev))
    }
    clearPhaseRowDragState()
  }

  const calculatePhaseUnknownsPreview = () => {
    if (!selectedPhaseMaterial) return
    const phaseError = validateMaterialForPhaseCalc(selectedPhaseMaterial)
    if (phaseError) {
      setWorkflowMessage(phaseError)
      return
    }
    if (hasPendingDraftRows) {
      setWorkflowMessage('请先完成待填写的物相名称，或删除空白行后再计算。')
      return
    }
    if (hasFormulaErrors) {
      setWorkflowMessage('请先修正物相名称输入错误后再计算。')
      return
    }
    const rows = materialPhaseRows[selectedPhaseMaterial.id] ?? createDefaultMaterialPhaseRows()
    const phaseInputs = phaseInputsFromDraft(currentPhaseDraft)
    const result = calculateOrderedPhaseElementCompletion(
      selectedPhaseMaterial.ratios,
      toPhaseAssistSpecs(rows),
      phaseInputs
    )
    setPhasePreviewUnknowns({
      materialId: selectedPhaseMaterial.id,
      phaseContents: result.phaseContents,
      values: result.unknowns,
    })
    const u = result.unknowns
    setWorkflowMessage(
      `已计算 ${selectedPhaseMaterial.name}：O ${format(u['O (氧)'])}%、C ${format(u['C (碳)'])}%、Other ${format(u['Other(其他)'])}%，待回填配料总表。`
    )
  }

  const applyPhaseUnknowns = () => {
    if (!selectedPhaseMaterial) return
    const preview = activePhasePreview?.values ?? null
    if (!preview) {
      setWorkflowMessage('请先计算元素补全结果，再回填到配料总表。')
      return
    }
    updateRawMaterial(selectedPhaseMaterial.id, {
      ratios: {
        ...selectedPhaseMaterial.ratios,
        ...preview,
      },
    })
    const nextCompleted = { ...phaseCompletedMaterials, [selectedPhaseMaterial.id]: true }
    setPhaseCompletedMaterials(nextCompleted)
    setPhaseCompleted(rawMaterials.every((material) => nextCompleted[material.id] === true))
    setWorkflowMessage(
      `已回填 ${selectedPhaseMaterial.name}：O ${format(preview['O (氧)'])}%、C ${format(preview['C (碳)'])}%、Other ${format(preview['Other(其他)'])}% 写入配料总表，可进入联动迭代计算。`
    )
    scrollToCalculationTable()
  }

  const persistCopperCases = (records: CopperCaseRecord[]) => {
    const sortedRecords = sortCopperCaseRecords(records)
    setCaseRecords(sortedRecords)
    writeCopperCaseRecords(sortedRecords)
  }

  const buildCaseSnapshot = (base?: Partial<Pick<CopperCaseRecord, 'id' | 'name' | 'createdAt' | 'stageId'>>): CopperCaseRecord => {
    const now = new Date()
    return {
      id: base?.id ?? createCopperCaseId(now),
      name: base?.name ?? formatCopperCaseName(now),
      createdAt: base?.createdAt ?? now.toISOString(),
      updatedAt: now.toISOString(),
      stageId: isCopperCaseStageId(activeSheet) ? activeSheet : base?.stageId ?? 'cu_smelting',
      rawMaterials: rawMaterials.map(cloneMaterialColumn),
      rawWeightDrafts: { ...rawWeightDrafts },
      solventColumns: solventColumns.map(cloneMaterialColumn),
      fuelColumn: cloneFuelMaterial(fuelColumn),
      oxygenAirColumn: cloneMaterialColumn(oxygenAirColumn),
      targetFeSiO2,
      targetCaOSiO2,
      solventSolution: cloneSolventSolution(solventSolution),
      phaseDrafts: { ...phaseDrafts },
      phaseCompletedMaterials: { ...phaseCompletedMaterials },
      phasePreviewUnknowns: phasePreviewUnknowns
        ? {
            materialId: phasePreviewUnknowns.materialId,
            phaseContents: { ...phasePreviewUnknowns.phaseContents },
            values: { ...phasePreviewUnknowns.values },
          }
        : null,
      solventPreviewSolution: cloneSolventSolution(solventPreviewSolution),
      productPreviewReady,
      heatPreviewReady,
      manualPhaseCells: { ...manualPhaseCells },
      manualSolventWeights: { ...manualSolventWeights },
      manualFuelWeightValid,
      phaseCompleted,
      productCalculated,
      heatBalanced,
      fuelLhv,
      fuelEfficiency,
      oxygenAirO2Pct,
      oxygenAirN2Pct,
      oxygenSupplyCoefficient,
      feedTemperature,
      matteTemperature,
      slagTemperature,
      gasTemperature,
      dustTemperature,
      heatLossMJh,
      otherHeatMJh,
      annualHours,
      equipmentIntensity,
      targetScaleWanTpa,
      equipmentAdjustments: { ...equipmentAdjustments },
      batchTableView,
      phaseRatioOverrides: { ...phaseRatioOverrides },
      manualPhaseRatioColumns: { ...manualPhaseRatioColumns },
      productPhaseOverrides: { ...productPhaseOverrides },
      productPhaseManual,
      customPhaseRows: Object.fromEntries(
        Object.entries(customPhaseRows).map(([columnId, rows]) => [
          columnId,
          rows.map((row) => ({ ...row, fractions: { ...row.fractions } })),
        ])
      ),
      materialPhaseRows: Object.fromEntries(
        Object.entries(materialPhaseRows).map(([materialId, rows]) => [
          materialId,
          rows.map((row) => ({ ...row, fractions: { ...row.fractions } })),
        ])
      ),
    }
  }

  const saveCurrentCase = () => {
    const base = activeCaseId ? caseRecords.find((record) => record.id === activeCaseId) : undefined
    const record = buildCaseSnapshot(base)
    persistCopperCases([record, ...caseRecords.filter((item) => item.id !== record.id)])
    setActiveCaseId(record.id)
    setCaseMessage(`已保存当前案例：${record.name}`)
    onActiveCaseNameChange?.(record.name)
    return record
  }

  const saveCurrentCaseAndGoNext = () => {
    if (nextProcessStage) {
      confirmSaveBeforeCaseNavigation(nextProcessStage.id)
    }
  }

  const createNewCase = () => {
    const caseName = newCaseName.trim()
    if (!caseName) {
      setCaseMessage('请输入案例名称后再新建案例。')
      return
    }
    const record = buildCaseSnapshot({ name: caseName })
    persistCopperCases([record, ...caseRecords])
    setActiveCaseId(record.id)
    setNewCaseName(suggestCopperCaseName())
    setCaseMessage(`已新建案例：${record.name}`)
    onActiveCaseNameChange?.(record.name)
    onStageSelect('cu_smelting')
  }

  const deleteCopperCase = (record: CopperCaseRecord) => {
    persistCopperCases(caseRecords.filter((item) => item.id !== record.id))
    if (activeCaseId === record.id) {
      setActiveCaseId(null)
      onActiveCaseNameChange?.(null)
    }
    setCaseMessage(`已删除案例：${record.name}`)
  }

  const openCopperCase = (record: CopperCaseRecord) => {
    const nextRawMaterials = (record.rawMaterials?.length ? record.rawMaterials : createDefaultCopperMaterials()).map(cloneMaterialColumn)
    const nextSolventColumns = (record.solventColumns?.length ? record.solventColumns : createDefaultSolventColumns()).map(cloneMaterialColumn)
    setRawMaterials(nextRawMaterials)
    setRawWeightDrafts(record.rawWeightDrafts ?? Object.fromEntries(nextRawMaterials.map((material) => [material.id, material.weight > 0 ? String(material.weight) : ''])))
    setSolventColumns(nextSolventColumns)
    setFuelColumn(record.fuelColumn ? cloneFuelMaterial(record.fuelColumn) : cloneFuelMaterial(DEFAULT_COPPER_FUEL))
    setOxygenAirColumn(record.oxygenAirColumn ? cloneMaterialColumn(record.oxygenAirColumn) : createOxygenAirColumn())
    setTargetFeSiO2(record.targetFeSiO2 ?? '2.8')
    setTargetCaOSiO2(record.targetCaOSiO2 ?? '0.45')
    setSolventSolution(cloneSolventSolution(record.solventSolution ?? null))
    setPhaseDrafts(record.phaseDrafts ?? {})
    setPhaseCompletedMaterials(record.phaseCompletedMaterials ?? {})
    setPhasePreviewUnknowns(record.phasePreviewUnknowns ?? null)
    setSolventPreviewSolution(cloneSolventSolution(record.solventPreviewSolution ?? null))
    setProductPreviewReady(record.productPreviewReady ?? false)
    setHeatPreviewReady(record.heatPreviewReady ?? false)
    setManualPhaseCells(record.manualPhaseCells ?? {})
    setManualSolventWeights(record.manualSolventWeights ?? {})
    setManualFuelWeightValid(record.manualFuelWeightValid ?? false)
    setPhaseCompleted(record.phaseCompleted ?? false)
    setProductCalculated(record.productCalculated ?? false)
    setHeatBalanced(record.heatBalanced ?? false)
    setIterationAutoLinked(record.solventSolution?.valid === true && record.productCalculated === true && record.heatBalanced === true)
    setFuelLhv(record.fuelLhv ?? String(DEFAULT_COPPER_FUEL.lowerHeatingValueMJkg))
    setFuelEfficiency(record.fuelEfficiency ?? String(DEFAULT_COPPER_FUEL.combustionEfficiency))
    setOxygenAirO2Pct(record.oxygenAirO2Pct ?? '70')
    setOxygenAirN2Pct(record.oxygenAirN2Pct ?? '30')
    setOxygenSupplyCoefficient(record.oxygenSupplyCoefficient ?? '1.15')
    setFeedTemperature(record.feedTemperature ?? '25')
    setMatteTemperature(record.matteTemperature ?? '1180')
    setSlagTemperature(record.slagTemperature ?? '1250')
    setGasTemperature(record.gasTemperature ?? '1150')
    setDustTemperature(record.dustTemperature ?? '450')
    setHeatLossMJh(record.heatLossMJh ?? '1500')
    setOtherHeatMJh(record.otherHeatMJh ?? '0')
    setAnnualHours(record.annualHours ?? '7200')
    setEquipmentIntensity(record.equipmentIntensity ?? '32')
    setTargetScaleWanTpa(record.targetScaleWanTpa ?? '10')
    setEquipmentAdjustments(record.equipmentAdjustments ?? { smelting: '1', converting: '1', refining: '1' })
    setBatchTableView(record.batchTableView ?? 'element')
    setPhaseRatioOverrides(record.phaseRatioOverrides ?? {})
    setManualPhaseRatioColumns(record.manualPhaseRatioColumns ?? {})
    setProductPhaseOverrides(record.productPhaseOverrides ?? {})
    setProductPhaseManual(record.productPhaseManual ?? false)
    setCustomPhaseRows(record.customPhaseRows ?? {})
    setMaterialPhaseRows(record.materialPhaseRows ?? {})
    setInputPhaseDrafts({})
    setOutputPhaseDrafts({})
    setInvalidInputPhaseColumns({})
    setInvalidOutputPhaseColumns({})
    setPhaseMaterialId(null)
    setWorkflowMessage(null)
    setActiveCaseId(record.id)
    setCaseMessage(`已打开案例：${record.name}`)
    onActiveCaseNameChange?.(record.name)
    onStageSelect(normalizeCopperCaseStageId(record.stageId))
  }

  const renameActiveCase = (nextName: string) => {
    const trimmed = nextName.trim()
    if (!activeCaseId || !trimmed) return
    const current = caseRecords.find((record) => record.id === activeCaseId)
    if (!current || current.name === trimmed) return
    const updated = { ...current, name: trimmed, updatedAt: new Date().toISOString() }
    persistCopperCases([updated, ...caseRecords.filter((record) => record.id !== activeCaseId)])
  }

  const exportCopperCaseFile = (record?: CopperCaseRecord | null) => {
    const caseRecord = record ?? activeCase ?? saveCurrentCase()
    if (!caseRecord || typeof document === 'undefined') return
    const fileName = buildCopperCaseFileName(caseRecord)
    const blob = new Blob([buildCopperCaseFileText(caseRecord)], { type: 'application/json;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = fileName
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
    setCaseMessage(`已导出案例文件：${fileName}`)
  }

  const exportCopperCaseWithSaveDialog = async (record: CopperCaseRecord) => {
    const fileName = buildCopperCaseFileName(record)
    const fileText = buildCopperCaseFileText(record)
    const electronExport = typeof window !== 'undefined'
      ? (window as unknown as {
          electronAPI?: {
            saveCopperCaseToDesktop?: (
              fileName: string,
              content: string,
            ) => Promise<{ ok: boolean; cancelled?: boolean; filePath?: string; error?: string }>
          }
        }).electronAPI?.saveCopperCaseToDesktop
      : undefined
    if (electronExport) {
      const result = await electronExport(fileName, fileText)
      if (result?.cancelled) {
        setCaseMessage('已取消导出。')
        return
      }
      if (result?.ok) {
        setCaseMessage(`已导出案例文件：${result.filePath ?? fileName}`)
      } else {
        setCaseMessage(`导出失败：${result?.error ?? '未知错误'}`)
      }
      return
    }
    const savePicker = typeof window !== 'undefined'
      ? (window as unknown as { showSaveFilePicker?: (options: unknown) => Promise<FileSystemFileHandle> }).showSaveFilePicker
      : undefined
    if (savePicker) {
      try {
        const handle = await savePicker({
          suggestedName: fileName,
          types: [
            {
              description: '铜冶炼案例',
              accept: { 'application/json': ['.metcal-copper-case.json', '.json'] },
            },
          ],
        })
        const writable = await handle.createWritable()
        await writable.write(fileText)
        await writable.close()
        setCaseMessage(`已导出案例文件：${fileName}`)
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          setCaseMessage('已取消导出。')
          return
        }
        exportCopperCaseFile(record)
        setCaseMessage(`无法打开保存对话框，已改为下载案例文件：${fileName}`)
      }
      return
    }
    exportCopperCaseFile(record)
  }

  const importCopperCaseFile = async (file: File | null) => {
    if (!file) return
    try {
      const text = await file.text()
      const imported = normalizeImportedCopperCase(JSON.parse(text))
      if (!imported) {
        setCaseMessage('未识别到有效的铜冶炼案例文件。')
        return
      }
      persistCopperCases([imported, ...caseRecords])
      setCaseMessage(`已导入案例：${imported.name}`)
    } catch {
      setCaseMessage('案例文件读取失败，请确认文件为 .metcal-copper-case.json 格式。')
    }
  }

  const handleCaseDragEnter = (event: ReactDragEvent<HTMLDivElement>) => {
    event.preventDefault()
    caseDropDepthRef.current += 1
    if (Array.from(event.dataTransfer.types).includes('Files')) {
      setCaseDropActive(true)
    }
  }

  const handleCaseDragLeave = (event: ReactDragEvent<HTMLDivElement>) => {
    event.preventDefault()
    caseDropDepthRef.current = Math.max(0, caseDropDepthRef.current - 1)
    if (caseDropDepthRef.current === 0) {
      setCaseDropActive(false)
    }
  }

  const handleCaseDragOver = (event: ReactDragEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
  }

  const handleCaseDrop = (event: ReactDragEvent<HTMLDivElement>) => {
    event.preventDefault()
    caseDropDepthRef.current = 0
    setCaseDropActive(false)
    const file = event.dataTransfer.files?.[0] ?? null
    if (!file) return
    if (!file.name.endsWith('.metcal-copper-case.json') && !file.name.endsWith('.json')) {
      setCaseMessage('请拖入 .metcal-copper-case.json 案例文件。')
      return
    }
    void importCopperCaseFile(file)
  }

  const confirmSaveBeforeCaseNavigation = (sheet: SheetId) => {
    if (sheet === activeSheet) return
    if (activeSheet !== 'raw_material') {
      const snapshot = buildCaseSnapshot(activeCase ?? undefined)
      if (!activeCase || isCopperCaseContentDirty(snapshot, activeCase)) {
        setPendingNavigationSheet(sheet)
        return
      }
    }
    if (activeCaseId && activeSheet !== 'raw_material' && activeCase) {
      const hasGeneratedData = hasCopperCaseGeneratedData({
        phaseCompleted,
        productCalculated,
        heatBalanced,
        solventSolution,
      })
      if (hasGeneratedData) {
        const snapshot = buildCaseSnapshot({
          id: activeCase.id,
          name: activeCase.name,
          createdAt: activeCase.createdAt,
          stageId: activeCase.stageId,
        })
        if (isCopperCaseContentDirty(snapshot, activeCase)) {
          setPendingNavigationSheet(sheet)
          return
        }
      }
    }
    onStageSelect(sheet)
  }

  const continuePendingNavigation = (shouldSave: boolean) => {
    if (!pendingNavigationSheet) return
    const nextSheet = pendingNavigationSheet
    if (shouldSave) saveCurrentCase()
    setPendingNavigationSheet(null)
    onStageSelect(nextSheet)
  }

  useEffect(() => {
    if (!iterationAutoLinked || !isCopperProcessSheet || !allPhaseMaterialsCompleted || !iterationInputValid) return
    const result = calculateCurrentIterativeBalance()
    applyIterativeResult(result)
  }, [allPhaseMaterialsCompleted, isCopperProcessSheet, iterationAutoLinked, iterationInputSignature, iterationInputValid])

  useEffect(() => {
    if (activeSheet === 'raw_material') {
      onActiveCaseNameChange?.(null)
      return
    }
    onActiveCaseNameChange?.(activeCase?.name ?? null)
  }, [activeCase?.name, activeSheet, onActiveCaseNameChange])

  useEffect(() => {
    const previousSheet = previousActiveSheetRef.current
    previousActiveSheetRef.current = activeSheet
    if (previousSheet === activeSheet) return

    requestAnimationFrame(() => {
      stagePageTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      stagePageTopRef.current?.closest('.overflow-y-auto')?.scrollTo({ top: 0, behavior: 'smooth' })
    })
    setStageEnterHighlight(true)
    const timer = window.setTimeout(() => setStageEnterHighlight(false), 1000)
    return () => window.clearTimeout(timer)
  }, [activeSheet])

  useEffect(() => {
    if (!caseTitleDraft) return
    renameActiveCase(caseTitleDraft)
  }, [caseTitleDraft])

  useEffect(() => {
    const handleBackWorkspace = () => confirmSaveBeforeCaseNavigation('raw_material')
    window.addEventListener('metcal:copper-back-workspace', handleBackWorkspace)
    return () => window.removeEventListener('metcal:copper-back-workspace', handleBackWorkspace)
  })

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's' && activeSheet !== 'raw_material') {
        event.preventDefault()
        saveCurrentCase()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  })

  if (activeSheet === 'raw_material') {
    return (
      <div className="space-y-6">
        <div className={cardBase(darkMode)}>
          <div className={`flex flex-wrap items-start justify-between gap-4 border-b pb-4 ${darkMode ? 'border-gray-600' : 'border-gray-200'}`}>
            <div>
              <h3 className={sectionTitle(darkMode)}>{isEn ? 'Copper Project Workspace' : '铜冶炼项目工作区'}</h3>
              <p className={`${hintText(darkMode)} max-w-5xl leading-relaxed`}>
                用于建立、管理和追溯铜冶炼计算案例。新建案例后进入熔炼工作表，后续可在同一案例内完成吹炼、精炼和设备选型计算。
              </p>
            </div>
          </div>
          <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-end">
            <div className="min-w-[320px] flex-1">
              <label className={`mb-1 block text-xs font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>案例名称</label>
              <input
                className={`${inputBase(darkMode)} w-full`}
                value={newCaseName}
                onChange={(event) => setNewCaseName(event.target.value)}
              />
            </div>
            <button className={btnPrimary(darkMode)} onClick={createNewCase}>新建案例</button>
            <button className={btnSecondary(darkMode)} onClick={() => caseImportInputRef.current?.click()}>导入案例</button>
            <input
              ref={caseImportInputRef}
              type="file"
              accept=".json,.metcal-copper-case.json,application/json"
              className="hidden"
              onChange={(event) => {
                importCopperCaseFile(event.target.files?.[0] ?? null)
                event.currentTarget.value = ''
              }}
            />
          </div>
          {caseMessage && (
            <div className={`mt-4 rounded-lg border px-3 py-2 text-sm ${darkMode ? 'border-blue-700 bg-blue-950/30 text-blue-100' : 'border-blue-200 bg-blue-50 text-blue-900'}`}>
              {caseMessage}
            </div>
          )}
        </div>

        <div
          className={`rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors ${
            caseDropActive
              ? darkMode
                ? 'border-blue-400 bg-blue-950/40'
                : 'border-blue-500 bg-blue-50'
              : darkMode
                ? 'border-gray-600 bg-gray-900/20'
                : 'border-gray-300 bg-gray-50/80'
          }`}
          onDragEnter={handleCaseDragEnter}
          onDragLeave={handleCaseDragLeave}
          onDragOver={handleCaseDragOver}
          onDrop={handleCaseDrop}
        >
          <p className={`text-base font-medium ${darkMode ? 'text-gray-100' : 'text-gray-800'}`}>
            {caseDropActive ? '松开鼠标即可导入案例' : '将案例文件拖入此处即可导入'}
          </p>
          <p className={`mt-2 text-sm ${hintText(darkMode)}`}>
            支持从本机拖入案例文件，也可使用上方「导入案例」按钮选择文件。
          </p>
        </div>

        <div className={cardBase(darkMode)}>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className={`${sectionTitle(darkMode)} mb-1`}>历史案例</h3>
              <p className={`${hintText(darkMode)} leading-relaxed`}>
                列表记录已保存的铜冶炼案例。点击案例名称可直接打开，更新时间表示上次修改时间。
              </p>
            </div>
          </div>
          {caseRecords.length === 0 ? (
            <div className={`rounded-lg border px-4 py-8 text-center text-sm ${darkMode ? 'border-gray-600 text-gray-400' : 'border-gray-200 text-gray-500'}`}>
              暂无历史案例，请先输入案例名称并新建案例。
            </div>
          ) : (
            <div className={`overflow-auto rounded-lg border ${darkMode ? 'border-gray-600' : 'border-gray-200'}`}>
              <table className="w-full min-w-[760px] table-fixed text-sm">
                <thead className={darkMode ? 'bg-gray-800 text-gray-300' : 'bg-gray-50 text-gray-600'}>
                  <tr>
                    <th className="w-64 px-3 py-2 text-left">案例名称</th>
                    <th className="w-40 px-3 py-2 text-center">创建时间</th>
                    <th className="w-40 px-3 py-2 text-center">上次修改时间</th>
                    <th className="w-40 px-3 py-2 text-center">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {caseRecords.map((record) => (
                    <tr key={record.id} className={`border-t ${darkMode ? 'border-gray-600' : 'border-gray-200'}`}>
                      <td className="px-3 py-2">
                        <button
                          className={`font-medium transition-colors hover:text-blue-600 ${darkMode ? 'text-gray-100 hover:text-blue-300' : 'text-gray-900'}`}
                          onClick={() => openCopperCase(record)}
                        >
                          {record.name}
                        </button>
                      </td>
                      <td className="px-3 py-2 text-center font-mono">{formatStoredCaseTime(record.createdAt)}</td>
                      <td className="px-3 py-2 text-center font-mono">{formatStoredCaseTime(record.updatedAt)}</td>
                      <td className="px-3 py-2 text-center">
                        <div className="flex justify-center gap-2 whitespace-nowrap">
                          <button className={`${btnSecondary(darkMode)} whitespace-nowrap`} onClick={() => exportCopperCaseWithSaveDialog(record)}>导出案例</button>
                          <button className={`${btnSecondary(darkMode)} whitespace-nowrap`} onClick={() => deleteCopperCase(record)}>删除案例</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    )
  }

  if (activeSheet === 'cu_equipment') {
    return (
      <div className="space-y-4">
        <div ref={stagePageTopRef} className={stagePageTopShellClass(darkMode, stageEnterHighlight)}>
          <StageSheetTabs darkMode={darkMode} activeSheet={activeSheet} onStageSelect={confirmSaveBeforeCaseNavigation} />
          <StageHeader
            darkMode={darkMode}
            activeSheet={activeSheet}
            onReturnCasePage={() => confirmSaveBeforeCaseNavigation('raw_material')}
          />
        </div>
        <SaveBeforeNavigationDialog
          darkMode={darkMode}
          open={pendingNavigationSheet !== null}
          targetName={pendingNavigationSheet ? navigationTargetName(pendingNavigationSheet) : ''}
          actionDescription={pendingNavigationSheet ? navigationActionDescription(pendingNavigationSheet) : ''}
          onSaveAndContinue={() => continuePendingNavigation(true)}
          onContinueWithoutSaving={() => continuePendingNavigation(false)}
          onCancel={() => setPendingNavigationSheet(null)}
        />
        <div className={cardBase(darkMode)}>
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className={`${sectionTitle(darkMode)} mb-1`}>设备选型总表</h3>
              <p className={`${hintText(darkMode)} max-w-5xl leading-relaxed`}>
                参照 MetCal 全流程汇总与作业时间设置思路，先把熔炼、吹炼、精炼结果折算为年规模，再按目标规模和调整系数形成设备选型基准。
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button className={btnSecondary(darkMode)} onClick={() => setTargetScaleWanTpa('10')}>10万吨</button>
              <button className={btnSecondary(darkMode)} onClick={() => setTargetScaleWanTpa('20')}>20万吨</button>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <LabeledInput darkMode={darkMode} label="规模（万吨/a）" value={targetScaleWanTpa} onChange={setTargetScaleWanTpa} />
            <LabeledInput darkMode={darkMode} label="年运行时间 (h/a)" value={annualHours} onChange={setAnnualHours} />
            <LabeledInput darkMode={darkMode} label="单台处理强度 (t/h)" value={equipmentIntensity} onChange={setEquipmentIntensity} />
          </div>
          <div className={`mt-4 overflow-auto rounded-lg border ${darkMode ? 'border-gray-600' : 'border-gray-200'}`}>
            <table className="w-full min-w-[980px] table-fixed text-sm">
              <thead className={darkMode ? 'bg-gray-800 text-gray-300' : 'bg-gray-50 text-gray-600'}>
                <tr>
                  <th className="w-20 px-2 py-2 text-center">阶段</th>
                  <th className="w-32 px-2 py-2 text-center">选型基准</th>
                  <th className="w-24 px-2 py-2 text-center">当前 t/h</th>
                  <th className="w-28 px-2 py-2 text-center">当前规模</th>
                  <th className="w-28 px-2 py-2 text-center">目标规模</th>
                  <th className="w-24 px-2 py-2 text-center">放大系数</th>
                  <th className="w-24 px-2 py-2 text-center">调整系数</th>
                  <th className="w-28 px-2 py-2 text-center">调整后 t/h</th>
                  <th className="w-24 px-2 py-2 text-center">建议台数</th>
                  <th className="w-36 px-2 py-2 text-center">主要产物</th>
                </tr>
              </thead>
              <tbody>
                {equipmentSizingRows.map((row) => (
                  <tr key={row.id} className={`border-t ${darkMode ? 'border-gray-600' : 'border-gray-200'}`}>
                    <td className="px-2 py-1.5 text-center font-medium">{row.stage}</td>
                    <td className="px-2 py-1.5 text-center">{row.basis}</td>
                    <td className="px-2 py-1.5 text-center font-mono">{format(row.currentThroughput)}</td>
                    <td className="px-2 py-1.5 text-center font-mono">{format(row.sizing.currentAnnualWanTpa, 2)} 万吨/a</td>
                    <td className="px-2 py-1.5 text-center font-mono">{format(targetScaleValue, 2)} 万吨/a</td>
                    <td className="px-2 py-1.5 text-center font-mono">{format(row.sizing.scaleFactor, 3)}</td>
                    <td className="px-2 py-1.5 text-center">
                      <input
                        className={`${inputSm(darkMode)} h-7 w-full px-1 py-0 text-center font-mono text-sm`}
                        value={equipmentAdjustments[row.id]}
                        onChange={(event) => updateEquipmentAdjustment(row.id, event.target.value)}
                      />
                    </td>
                    <td className="px-2 py-1.5 text-center font-mono">{format(row.sizing.adjustedThroughput)}</td>
                    <td className="px-2 py-1.5 text-center font-mono">{row.sizing.recommendedUnits}</td>
                    <td className="px-2 py-1.5 text-center">
                      {row.mainOutput} {format(row.outputThroughput)} t/h
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className={`mt-3 rounded-lg border px-3 py-2 text-sm ${darkMode ? 'border-blue-800 bg-blue-950/20 text-blue-100' : 'border-blue-200 bg-blue-50 text-blue-900'}`}>
            当前为前端选型框架：规模、年运行时间和调整系数会联动总表；后续确定设备公式后，可把调整系数替换为炉型、风量、床能率等专业约束。
          </div>
        </div>
        <CaseFooterActions
          darkMode={darkMode}
          onReturnCasePage={() => confirmSaveBeforeCaseNavigation('raw_material')}
          onNextStep={saveCurrentCaseAndGoNext}
          nextLabel={nextProcessStage ? '下一步' : '完成'}
          nextDisabled={!nextProcessStage}
        />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {isIterating && <IteratingOverlay darkMode={darkMode} />}
      <div ref={stagePageTopRef} className={stagePageTopShellClass(darkMode, stageEnterHighlight)}>
        <StageSheetTabs darkMode={darkMode} activeSheet={activeSheet} onStageSelect={confirmSaveBeforeCaseNavigation} />
        <StageHeader
          darkMode={darkMode}
          activeSheet={activeSheet}
          onReturnCasePage={() => confirmSaveBeforeCaseNavigation('raw_material')}
        />
      </div>
      <SaveBeforeNavigationDialog
        darkMode={darkMode}
        open={pendingNavigationSheet !== null}
        targetName={pendingNavigationSheet ? navigationTargetName(pendingNavigationSheet) : ''}
        actionDescription={pendingNavigationSheet ? navigationActionDescription(pendingNavigationSheet) : ''}
        onSaveAndContinue={() => continuePendingNavigation(true)}
        onContinueWithoutSaving={() => continuePendingNavigation(false)}
        onCancel={() => setPendingNavigationSheet(null)}
      />

      <div className={cardBase(darkMode)}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className={`${sectionTitle(darkMode)} mb-1`}>原料库</h3>
            <p className={`${hintText(darkMode)} leading-relaxed`}>
            原料库用于管理铜冶炼的所有原料数据。您可以在此修改现有原料的成分，或通过新增、导入来扩充原料库。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className={btnSecondary(darkMode)} onClick={openLibraryMaterialAddDialog}>
              添加
            </button>
            <label className={btnPrimary(darkMode)}>
              导入
              <input
                type="file"
                accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values"
                className="hidden"
                onChange={(event) => {
                  void importLibraryFile(event.target.files?.[0] ?? null)
                  event.currentTarget.value = ''
                }}
              />
            </label>
            <button className={btnSecondary(darkMode)} onClick={() => setShowLibrary((v) => !v)}>
              {showLibrary ? '折叠' : '展开'}
            </button>
          </div>
        </div>

        <AddLibraryMaterialDialog
          darkMode={darkMode}
          mode={libraryMaterialDialogMode}
          open={showSingleLibraryAddDialog}
          message={libraryDialogMessage}
          rows={singleLibraryRows}
          rowTotal={singleLibraryRowTotal}
          onAddRow={addSingleLibraryRow}
          onRemoveRow={removeSingleLibraryRow}
          onNameChange={updateSingleLibraryRowName}
          onRatioChange={updateSingleLibraryRowRatio}
          onCancel={closeLibraryMaterialDialog}
          onSubmit={submitLibraryMaterialDialog}
        />

        {importFeedback && (
          <div className={`mt-3 rounded-lg border px-3 py-2 text-sm ${darkMode ? 'border-blue-700 bg-blue-950/30 text-blue-100' : 'border-blue-200 bg-blue-50 text-blue-800'}`}>
            {importFeedback}
          </div>
        )}

        {showLibrary && (
          <div className={`mt-4 overflow-auto rounded-lg border ${darkMode ? 'border-gray-600' : 'border-gray-200'}`}>
            <table className="w-full min-w-[1020px] table-fixed text-sm">
              <colgroup>
                <col className="w-[6.75rem]" />
                {COPPER_ELEMENT_KEYS.map((element) => (
                  <col key={element} className="w-[2.875rem]" />
                ))}
                <col className="w-[7rem]" />
              </colgroup>
              <thead className={darkMode ? 'bg-gray-800 text-gray-300' : 'bg-gray-50 text-gray-600'}>
                <tr>
                  <th className="px-1 py-2 text-left text-sm font-semibold">原料</th>
                  {COPPER_ELEMENT_KEYS.map((element) => (
                    <th key={element} className="px-0.5 py-2 text-right text-sm font-semibold leading-tight">
                      {element.replace(/\(.+\)/, '')}
                    </th>
                  ))}
                  <th className="px-0.5 py-2 text-center text-sm font-semibold">操作</th>
                </tr>
              </thead>
              <tbody>
                {materialLibrary.map((material) => (
                  <tr key={material.id} className={`border-t ${darkMode ? 'border-gray-600' : 'border-gray-200'}`}>
                    <td
                      className="truncate px-1 py-1.5 align-middle font-medium"
                      title={material.name}
                    >
                      <span className="block truncate">{material.name}</span>
                    </td>
                    {COPPER_ELEMENT_KEYS.map((element) => (
                      <td key={element} className="px-0.5 py-1.5 text-right align-middle font-mono text-sm tabular-nums leading-none">
                        {format(material.ratios[element] ?? 0, 2)}
                      </td>
                    ))}
                    <td className="px-1 py-1.5 text-center align-middle">
                      <div className="flex flex-nowrap items-center justify-center gap-0.5">
                        <button
                          type="button"
                          className={libraryActionButtonClass(darkMode, 'edit')}
                          title="修改原料库条目"
                          onClick={() => openLibraryMaterialEditDialog(material)}
                        >
                          修改
                        </button>
                        <button
                          type="button"
                          className={libraryActionButtonClass(darkMode, 'delete')}
                          title="原料库移除"
                          onClick={() => removeLibraryMaterial(material.id)}
                        >
                          删除
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {workflowMessage && (
        <div className={`rounded-lg border px-3 py-2 text-sm ${darkMode ? 'border-amber-700 bg-amber-950/30 text-amber-100' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
          {workflowMessage}
        </div>
      )}

      <div ref={calculationTableRef} className={cardBase(darkMode)}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-2">
            <h3 className={`${sectionTitle(darkMode)} mb-0`}>配料总表</h3>
            <BatchTableViewTabs darkMode={darkMode} activeView={batchTableView} onChange={setBatchTableView} />
          </div>
          <div className="flex flex-wrap gap-2">
            <button className={btnSecondary(darkMode)} onClick={exportCalculationTable}>导出Excel</button>
            <button className={btnPrimary(darkMode)} onClick={addMaterial}>添加新原料</button>
          </div>
        </div>
        <div className={`mb-3 rounded-lg border px-3 py-2 ${darkMode ? 'border-amber-700 bg-amber-950/20 text-amber-100' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-medium">{workflowStepLabel}</div>
            <div className="flex flex-wrap gap-1.5">
              {workflowStepBadges.map((item) => (
                <span key={item.label} className={stepBadgeClass(darkMode, item.active)}>{item.label}</span>
              ))}
            </div>
          </div>
        </div>
        {batchTableView === 'element' ? (
        <div className={`overflow-auto rounded-lg border ${darkMode ? 'border-gray-600' : 'border-gray-200'}`}>
          <table className="table-fixed text-sm" style={{ width: calculationTableWidth }}>
            <colgroup>
              <col className="w-[30px]" />
              <col className="w-[68px]" />
              {rawMaterials.map((material) => <col key={material.id} style={{ width: rawColumnWidth(material) }} />)}
              {solventColumns.map((material) => <col key={material.id} className="w-[82px]" />)}
              <col className="w-[88px]" />
              <col className="w-[88px]" />
              <col className="w-[90px]" />
              <col className="w-[30px]" />
              {productTableColumns.map((product) => <col key={`product-col-${product.key}`} className="w-[88px]" />)}
            </colgroup>
            <thead className={darkMode ? 'bg-gray-800 text-gray-300' : 'bg-gray-50 text-gray-600'}>
              <tr>
                <th rowSpan={2} className={`sticky left-0 z-30 px-1 py-2 ${darkMode ? 'bg-gray-800' : 'bg-gray-50'}`} />
                <th className={`sticky left-[34px] z-30 px-1 py-2 text-center font-semibold ${darkMode ? 'bg-gray-800' : 'bg-gray-50'}`} />
                {rawMaterials.map((material, index) => (
                  <th key={material.id} className="px-0.5 py-1.5 text-center font-semibold">
                    <div className="flex items-center justify-center gap-1">
                      <span className="truncate">原料{index + 1}</span>
                      {rawMaterials.length > 1 && (
                        <button
                          className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${
                            darkMode ? 'bg-red-950/40 text-red-200 hover:bg-red-900/50' : 'bg-red-50 text-red-700 hover:bg-red-100'
                          }`}
                          onClick={() => removeMaterial(material.id)}
                        >
                          删除列
                        </button>
                      )}
                    </div>
                  </th>
                ))}
                {solventColumns.map((material, index) => (
                  <th key={material.id} className={`px-1 py-2 text-center font-semibold ${darkMode ? 'bg-emerald-950/20' : 'bg-emerald-50'}`}>
                    {index === 0 ? '熔剂1' : '熔剂2'}
                  </th>
                ))}
                <th className={`px-0.5 py-1.5 text-center font-semibold ${darkMode ? 'bg-amber-950/20' : 'bg-amber-50'}`}>燃料煤</th>
                <th className={`px-0.5 py-1.5 text-center font-semibold ${darkMode ? 'bg-sky-950/20' : 'bg-sky-50'}`}>富氧空气</th>
                <th className={`px-0.5 py-1.5 text-center font-semibold ${darkMode ? 'bg-blue-950/30' : 'bg-blue-50'}`}>混料</th>
                <th colSpan={productTableColumns.length + 1} className={`px-0.5 py-1.5 text-center font-semibold ${darkMode ? 'bg-indigo-950/20' : 'bg-indigo-50'}`}>产出</th>
              </tr>
              <tr>
                <th className={`sticky left-[34px] z-30 px-1 py-2 text-center font-semibold ${darkMode ? 'bg-gray-800' : 'bg-gray-50'}`}>名称</th>
                {rawMaterials.map((material) => (
                  <th key={`${material.id}-selector`} className="px-1 py-2 text-center font-semibold">
                    <select
                      className={materialSelectClass(darkMode, material.name.trim() ? 'resolved' : 'pending')}
                      title={material.name.trim() ? '已选择原料。' : '步骤1：请在名称下拉框中选择原料。'}
                      value={materialLibrary.some((item) => item.name === material.name) ? materialLibrary.find((item) => item.name === material.name)?.id : ''}
                      onChange={(event) => applyLibraryMaterial(material.id, event.target.value)}
                    >
                      <option value="">请选择</option>
                      {materialLibrary.map((item) => (
                        <option key={item.id} value={item.id}>{item.name}</option>
                      ))}
                    </select>
                  </th>
                ))}
                {solventColumns.map((material) => (
                  <th key={`${material.id}-name`} className={`px-1 py-2 text-center font-semibold ${darkMode ? 'bg-emerald-950/20' : 'bg-emerald-50'}`}>
                    {material.name === '石灰' ? '石灰石' : material.name}
                  </th>
                ))}
                <th className={`px-0.5 py-1.5 text-center font-semibold ${darkMode ? 'bg-amber-950/20' : 'bg-amber-50'}`}>{fuelColumn.name}</th>
                <th className={`px-0.5 py-1.5 text-center font-semibold ${darkMode ? 'bg-sky-950/20' : 'bg-sky-50'}`}>富氧空气</th>
                <th className={`px-0.5 py-1.5 text-center font-semibold ${darkMode ? 'bg-blue-950/30' : 'bg-blue-50'}`}>混料</th>
                <th className={`px-1 py-2 text-center font-semibold ${darkMode ? 'bg-indigo-950/20' : 'bg-indigo-50'}`} />
                {productTableColumns.map((product) => (
                  <th key={`product-head-${product.key}`} className={`px-0.5 py-1.5 text-center font-semibold ${darkMode ? 'bg-indigo-950/20' : 'bg-indigo-50'}`}>
                    {product.name === '总计' ? '总计' : getStageProductName(activeProcessStageId, product)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className={unitCellClass(darkMode)} rowSpan={COPPER_ELEMENT_KEYS.length + 2}>
                  <span className="[writing-mode:vertical-rl] mx-auto inline-block whitespace-nowrap font-semibold leading-none">含量（%）</span>
                </td>
                <td className={materialCellClass(darkMode, 'label')}>t/h</td>
                {rawMaterials.map((material) => (
                  <td key={material.id} className={materialCellClass(darkMode)}>
                    <input
                      className={solveInputClass(darkMode, rawWeightStatus(material.id))}
                      title="步骤1：输入投料量。可直接手动输入原料投料量，输入有效数字后标记为绿色。"
                      value={rawWeightDrafts[material.id] ?? ''}
                      onChange={(event) => updateRawWeight(material.id, event.target.value)}
                    />
                  </td>
                ))}
                {solventColumns.map((material) => (
                  <td key={material.id} className={materialCellClass(darkMode, 'solvent')}>
                    <input
                      className={solveInputClass(darkMode, solventWeightStatus(material.id))}
                      title="熔剂投料量：单击可手动输入；双击进入迭代输入。"
                      onDoubleClick={openIterationAssist}
                      value={ratioDrafts[`solvent-weight:${material.id}`] ?? formatTableNumber(material.weight)}
                      onChange={(event) => updateSolventWeight(material.id, event.target.value)}
                      onBlur={() => commitSolventWeightDraft(material.id)}
                    />
                  </td>
                ))}
                <td className={materialCellClass(darkMode, 'fuel')}>
                  <input
                    className={solveInputClass(darkMode, fuelWeightStatus())}
                    title="燃料煤投料量：单击可手动输入；双击进入迭代输入。"
                    onDoubleClick={openIterationAssist}
                    value={ratioDrafts['fuel-weight:fuel-coal'] ?? formatTableNumber(fuelColumn.weight)}
                    onChange={(event) => updateFuelWeight(event.target.value)}
                    onBlur={commitFuelWeightDraft}
                  />
                </td>
                <td className={`${oxygenAirCellClass(darkMode)} text-center font-mono`}>{formatTableNumber(oxygenAirColumn.weight)}</td>
                <td className={`${materialCellClass(darkMode, 'total')} text-center font-mono`}>{formatTableNumber(furnaceFeed.totalWeight)}</td>
                <td
                  className={`border-t px-1 py-1 align-middle text-center ${darkMode ? 'border-gray-600 bg-indigo-950/20 text-indigo-100' : 'border-gray-200 bg-indigo-50 text-indigo-900'}`}
                  rowSpan={COPPER_ELEMENT_KEYS.length + 2}
                >
                  <span className="[writing-mode:vertical-rl] mx-auto inline-block whitespace-nowrap font-semibold leading-none">产物</span>
                </td>
                {productTableColumns.map((product) => (
                  <td
                    key={`product-weight-${product.key}`}
                    className={`${productOutputCellClass(darkMode, productCalculated ? 'resolved' : 'pending', 'single', 'top')} ${productCalculated ? 'font-mono' : ''}`}
                    onDoubleClick={openIterationAssist}
                    title="联动迭代结果：产出由静态系数 × 混料总质量计算；双击进入迭代输入。"
                  >
                    {productCalculated ? formatTableNumber(product.mass) : ''}
                  </td>
                ))}
              </tr>
              {COPPER_ELEMENT_KEYS.map((element) => (
                <tr key={element}>
                  <td className={materialCellClass(darkMode, 'label')}>{element.replace(/\(.+\)/, '')}</td>
                  {rawMaterials.map((material) => (
                    <td key={material.id} className={materialCellClass(darkMode)}>
                      <input
                        className={solveInputClass(darkMode, phaseCellStatus(material, element))}
                        title={
                          element === 'S (硫)' && sulfurInputStatus(material.ratios) === 'missing'
                            ? '含 Cu/Fe 的原料须填写 S(硫) 元素含量后方可进行物相折算'
                            : PHASE_UNKNOWN_ELEMENTS.has(element)
                            ? phaseCompleted
                              ? '步骤2：物相反推元素。已回填有效元素补全结果；也可直接手动输入；双击打开辅助计算。'
                              : '步骤2：物相反推元素。待物相求解：可直接手动输入；双击打开辅助计算。'
                            : undefined
                        }
                        onClick={(event) => event.stopPropagation()}
                        onDoubleClick={() => {
                          if (PHASE_UNKNOWN_ELEMENTS.has(element)) openElementAssist(material.id)
                        }}
                        value={material.name.trim() ? ratioInputValue('raw', material.id, element, material.ratios[element]) : ''}
                        onChange={(event) => updateRawRatio(material.id, element, event.target.value)}
                        onBlur={() => commitRatioDraft('raw', material.id, element, material.ratios[element])}
                      />
                    </td>
                  ))}
                  {solventColumns.map((material) => (
                    <td key={material.id} className={materialCellClass(darkMode, 'solvent')}>
                      <input
                        className={`${inputSm(darkMode)} h-7 w-full px-1 py-0 text-center font-mono text-sm`}
                        value={ratioInputValue('solvent', material.id, element, material.ratios[element])}
                        onChange={(event) => updateRatioDraft('solvent', material.id, element, event.target.value)}
                        onBlur={() => commitRatioDraft('solvent', material.id, element, material.ratios[element])}
                        onDoubleClick={openIterationAssist}
                      />
                    </td>
                  ))}
                  <td className={materialCellClass(darkMode, 'fuel')}>
                    <input
                      className={`${inputSm(darkMode)} h-7 w-full px-1 py-0 text-center font-mono text-sm`}
                      value={ratioInputValue('fuel', fuelColumn.id, element, fuelColumn.ratios[element])}
                      onChange={(event) => updateRatioDraft('fuel', fuelColumn.id, element, event.target.value)}
                      onBlur={() => commitRatioDraft('fuel', fuelColumn.id, element, fuelColumn.ratios[element])}
                      onDoubleClick={openIterationAssist}
                    />
                  </td>
                  <td className={oxygenAirCellClass(darkMode)}>
                    {element === 'O (氧)' || element === 'N (氮)' ? (
                      <input
                        className={solveInputClass(darkMode, oxygenAirInputStatus)}
                        title="富氧空气组成：只需输入 O 或 N 之一，另一个自动按 100% 互补。双击进入迭代输入。"
                        value={ratioInputValue('gas', oxygenAirColumn.id, element, oxygenAirColumn.ratios[element])}
                        onChange={(event) => updateRatioDraft('gas', oxygenAirColumn.id, element, event.target.value)}
                        onBlur={() => commitRatioDraft('gas', oxygenAirColumn.id, element, oxygenAirColumn.ratios[element])}
                        onDoubleClick={openIterationAssist}
                      />
                    ) : (
                      <span className="font-mono">0</span>
                    )}
                  </td>
                  <td className={`${materialCellClass(darkMode, 'total')} text-center font-mono`}>{formatTableNumber(furnaceFeed.ratios[element] ?? 0)}</td>
                  {productTableColumns.map((product) => (
                    <td
                      key={`product-${product.key}-${element}`}
                      className={`${productOutputCellClass(darkMode, productCalculated ? 'resolved' : 'pending', 'single', 'middle')} font-mono`}
                      onDoubleClick={openIterationAssist}
                      title="联动迭代结果：产出由静态系数 × 混料总质量计算；双击进入迭代输入。"
                    >
                      {productCalculated ? formatTableNumber(product.composition[element] ?? 0) : ''}
                    </td>
                  ))}
                </tr>
              ))}
              <tr>
                <td className={materialCellClass(darkMode, 'label')}>合计</td>
                {rawMaterials.map((material) => (
                  <td key={material.id} className={`${materialCellClass(darkMode)} text-center font-mono`}>
                    {formatTableNumber(calculateKnownTotal(material.ratios) + (material.ratios['Other(其他)'] ?? 0))}
                  </td>
                ))}
                {solventColumns.map((material) => (
                  <td key={material.id} className={`${materialCellClass(darkMode, 'solvent')} text-center font-mono`}>
                    {formatTableNumber(calculateKnownTotal(material.ratios) + (material.ratios['Other(其他)'] ?? 0))}
                  </td>
                ))}
                <td className={`${materialCellClass(darkMode, 'fuel')} text-center font-mono`}>
                  {formatTableNumber(calculateKnownTotal(fuelColumn.ratios) + (fuelColumn.ratios['Other(其他)'] ?? 0))}
                </td>
                <td className={`${oxygenAirCellClass(darkMode)} text-center font-mono`}>
                  {formatTableNumber(calculateKnownTotal(oxygenAirColumn.ratios) + (oxygenAirColumn.ratios['Other(其他)'] ?? 0))}
                </td>
                <td className={`${materialCellClass(darkMode, 'total')} text-center font-mono`}>100</td>
                {productTableColumns.map((product) => (
                  <td
                    key={`product-total-${product.key}`}
                    className={`${productOutputCellClass(darkMode, productCalculated ? 'resolved' : 'pending', 'single', 'bottom')} font-mono`}
                    onDoubleClick={openIterationAssist}
                    title="联动迭代结果：产出由静态系数 × 混料总质量计算；双击进入迭代输入。"
                  >
                    {productCalculated ? formatTableNumber(calculateKnownTotal(product.composition) + (product.composition['Other(其他)'] ?? 0)) : ''}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        ) : (
          <div className="space-y-3">
            <CopperBatchPhaseTables
              darkMode={darkMode}
              inputColumns={inputPhaseColumnData}
              outputColumns={outputPhaseColumnData}
              tableWidth={phaseTableWidth}
              rawColumnWidths={phaseTableRawColumnWidths}
              inputDrafts={inputPhaseDrafts}
              outputDrafts={outputPhaseDrafts}
              invalidInputColumns={invalidInputPhaseColumns}
              invalidOutputColumns={invalidOutputPhaseColumns}
              onInputDraftChange={updateInputPhaseDraft}
              onInputDraftCommit={commitInputPhaseDraft}
              onOutputDraftChange={updateOutputPhaseDraft}
              onOutputDraftCommit={commitOutputPhaseDraft}
            />
            <p className={`${hintText(darkMode)} text-sm leading-relaxed`}>
              物相 w% 为质量分数；「体积分数」行（v%）表示富氧空气、烟气中各气体组分占混合气体体积的百分比，仅这两类列有数值，其余列显示「—」。不适用物相行同样保留输入框，显示「—」。编辑物相 w% 后将反推元素组成并清除迭代联动结果；产出物相手工修改仅影响展示与导出，完整闭环请重新迭代计算。
            </p>
          </div>
        )}
        <div className={`mt-4 border-t pt-4 ${darkMode ? 'border-gray-600' : 'border-gray-200'}`}>
          <h3 className={`mb-2 text-sm font-medium ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>混料关键参数</h3>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
            <BlendMetric darkMode={darkMode} label="原料混料" value={`${format(rawBlend.totalWeight)} t/h`} />
            <BlendMetric darkMode={darkMode} label="混料总量" value={`${format(furnaceFeed.totalWeight)} t/h`} />
            {mixIndicators.map((item) => (
              <BlendMetric
                key={item.label}
                darkMode={darkMode}
                label={item.label}
                value={item.value == null ? '-' : format(item.value)}
              />
            ))}
          </div>
        </div>
      </div>

      <div ref={elementAssistRef} className={cardBase(darkMode)}>
        <button
          type="button"
          className="flex w-full flex-wrap items-center justify-between gap-3 text-left"
          onClick={() => setShowElementAssist((value) => !value)}
        >
          <h3 className={`${sectionTitle(darkMode)} mb-0`}>物相折算与元素补全</h3>
          <span className={btnSecondary(darkMode)}>{showElementAssist ? '折叠' : '展开'}</span>
        </button>
        {showElementAssist && (
          <div className="mt-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className={hintText(darkMode)}>
                {selectedPhaseMaterial ? `当前原料：${selectedPhaseMaterial.name}` : '点击配料总表中 O / C / Other 红框后选择原料。'}
              </div>
              {selectedPhaseMaterial && (
                <button className={btnSecondary(darkMode)} onClick={() => setPhaseMaterialId(null)}>清除选择</button>
              )}
            </div>
            <p className={`${hintText(darkMode)} text-sm leading-relaxed`}>
              软件严格遵循冶金热力学中的质量守恒定律，通过物相的化学计量关系进行顺序反推；拖动行首 ⋮⋮ 可调整折算顺序。物相请输入规范化学分子式（如 CuS、FeO、Fe₃O₄）；纯小写缩写仅支持常见物相（如 cus、feo），其余写法请自行核对是否为真实物相。
            </p>
            {selectedPhaseMaterial && selectedPhaseMaterialError && (
              <div className={assistAlertPanelClassName(darkMode, 'warning')}>
                {selectedPhaseMaterialError}。请返回元素总表补全 S(硫) 后再计算物相。
              </div>
            )}
            {selectedPhaseMaterial && !selectedPhaseMaterialError && (
              <>
                <div className={`overflow-auto rounded-lg border ${darkMode ? 'border-gray-600' : 'border-gray-200'}`}>
                  <table className="w-full min-w-[1080px] table-fixed text-sm">
                    <thead className={darkMode ? 'bg-gray-800 text-gray-300' : 'bg-gray-50 text-gray-600'}>
                      <tr>
                        <th className="w-36 px-2 py-2 text-center">物相</th>
                        <th className="w-32 px-2 py-2 text-center">活度修正系数</th>
                        <th className="w-28 px-2 py-2 text-center">等效生成量(%)</th>
                        <th className="w-24 px-2 py-2 text-center">S贡献</th>
                        <th className="w-24 px-2 py-2 text-center">O贡献</th>
                        <th className="w-24 px-2 py-2 text-center">C贡献</th>
                        <th className="w-28 px-2 py-2 text-center">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {phaseAssistDisplayRows.map((row) => {
                        const formulaKey = rowDraftStorageKey(selectedPhaseMaterial.id, row.id)
                        const formulaDraft = phaseRowFormulaDrafts[formulaKey] ?? row.formula
                        const formulaError = phaseRowFormulaErrors[formulaKey]
                        const isDraft = row.kind === 'draft'
                        const isDragging = phaseRowDragId === row.id
                        const isDropTarget = phaseRowDropTargetId === row.id && phaseRowDragId !== row.id
                        const dropBefore = isDropTarget && phaseRowDropPosition === 'before'
                        const dropAfter = isDropTarget && phaseRowDropPosition === 'after'
                        return (
                          <tr
                            key={row.id}
                            className={`border-t ${darkMode ? 'border-gray-600' : 'border-gray-200'} ${
                              isDragging ? (darkMode ? 'opacity-50 bg-gray-800/40' : 'opacity-50 bg-gray-100') : ''
                            } ${isDropTarget ? (darkMode ? 'bg-sky-950/20' : 'bg-sky-50') : ''} ${
                              dropBefore ? (darkMode ? 'shadow-[inset_0_2px_0_0_#38bdf8]' : 'shadow-[inset_0_2px_0_0_#0ea5e9]') : ''
                            } ${
                              dropAfter ? (darkMode ? 'shadow-[inset_0_-2px_0_0_#38bdf8]' : 'shadow-[inset_0_-2px_0_0_#0ea5e9]') : ''
                            }`}
                            onDragOver={!isDraft ? handlePhaseRowDragOver(row.id) : undefined}
                            onDrop={!isDraft ? handlePhaseRowDrop(selectedPhaseMaterial.id, row.id) : undefined}
                          >
                            <td className="px-2 py-1.5 align-top">
                              {isDropTarget && phaseRowDropPosition && (
                                <p className={`mb-1 text-left text-[10px] font-medium ${darkMode ? 'text-sky-300' : 'text-sky-600'}`}>
                                  {phaseRowDropPosition === 'before' ? '↑ 插入到此行之前' : '↓ 插入到此行之后'}
                                </p>
                              )}
                              <div className="flex items-start gap-1">
                                {!isDraft && (
                                  <button
                                    type="button"
                                    draggable
                                    onDragStart={handlePhaseRowDragStart(row.id)}
                                    onDragEnd={clearPhaseRowDragState}
                                    className={`mt-0.5 shrink-0 cursor-grab px-0.5 text-xs leading-none active:cursor-grabbing ${
                                      darkMode ? 'text-gray-400 hover:text-gray-200' : 'text-gray-400 hover:text-gray-700'
                                    }`}
                                    title="拖动排序"
                                    aria-label="拖动排序"
                                  >
                                    ⋮⋮
                                  </button>
                                )}
                                <div className="min-w-0 flex-1">
                              {isDraft ? (
                                <div className="space-y-1">
                                  <input
                                    className={`${inputSm(darkMode)} w-full text-center text-sm ${formulaError ? 'border-red-500' : ''}`}
                                    placeholder="请输入物相"
                                    value={formulaDraft}
                                    onChange={(event) =>
                                      updatePhaseRowFormulaDraft(selectedPhaseMaterial.id, row.id, event.target.value)
                                    }
                                    onBlur={() => commitPhaseRowFormula(selectedPhaseMaterial.id, row.id)}
                                  />
                                  {formulaError && <p className="text-left text-xs text-red-500">{formulaError}</p>}
                                </div>
                              ) : (
                                <div className="text-center font-medium" title={row.formula}>
                                  {row.displayLabel}
                                </div>
                              )}
                                </div>
                              </div>
                            </td>
                            <td className="px-2 py-1.5">
                              {!isDraft && (
                                <input
                                  className={`${inputSm(darkMode)} w-full text-center font-mono text-sm`}
                                  value={row.draft.factor}
                                  onChange={(event) =>
                                    updatePhaseDraft(selectedPhaseMaterial.id, row.id, 'factor', event.target.value)
                                  }
                                />
                              )}
                            </td>
                            <td className="px-2 py-1.5">
                              {isDraft ? (
                                <span className="block text-center text-gray-400">—</span>
                              ) : (
                                <span className="block text-center font-mono">{formatPhaseCell(row.derivedContent)}</span>
                              )}
                            </td>
                            <td className="px-2 py-1.5 text-center font-mono">{formatPhaseCell(row.sulfur)}</td>
                            <td className="px-2 py-1.5 text-center font-mono">{formatPhaseCell(row.oxygen)}</td>
                            <td className="px-2 py-1.5 text-center font-mono">{formatPhaseCell(row.carbon)}</td>
                            <td className="px-2 py-1.5 text-center">
                              <button
                                type="button"
                                className={`px-1 text-xs ${darkMode ? 'text-red-300 hover:underline' : 'text-red-600 hover:underline'}`}
                                onClick={() => removeMaterialPhaseRow(selectedPhaseMaterial.id, row.id)}
                              >
                                删除
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr className={`border-t ${darkMode ? 'border-gray-600 bg-gray-800/20' : 'border-gray-200 bg-gray-50/80'}`}>
                        <td className="px-2 py-2">
                          <button
                            type="button"
                            className={`${btnSecondary(darkMode)} w-full text-sm`}
                            onClick={() => appendDraftPhaseRow(selectedPhaseMaterial.id)}
                          >
                            + 添加物相
                          </button>
                        </td>
                        <td colSpan={6} />
                      </tr>
                      {activePhasePreview && (
                        <tr className={darkMode ? 'border-t border-gray-600 bg-emerald-950/20 text-emerald-100' : 'border-t border-gray-200 bg-emerald-50 text-emerald-900'}>
                          <td className="px-2 py-2 text-center font-semibold">元素补全</td>
                          <td className="px-2 py-2 text-center font-mono">{formatPhaseCell(null)}</td>
                          <td className="px-2 py-2 text-center font-mono">{formatPhaseCell(null)}</td>
                          <td className="px-2 py-2 text-center font-mono">{formatPhaseCell(null)}</td>
                          <td className="px-2 py-2 text-center font-mono font-semibold">
                            {format(activePhasePreview.values['O (氧)'] ?? 0)}
                          </td>
                          <td className="px-2 py-2 text-center font-mono font-semibold">
                            {format(activePhasePreview.values['C (碳)'] ?? 0)}
                          </td>
                          <td className="px-2 py-2 text-center font-mono font-semibold">
                            {format(activePhasePreview.values['Other(其他)'] ?? 0)}
                          </td>
                        </tr>
                      )}
                    </tfoot>
                  </table>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <button
                    className={btnSecondary(darkMode)}
                    onClick={calculatePhaseUnknownsPreview}
                    disabled={!!selectedPhaseMaterialError || hasPendingDraftRows || hasFormulaErrors}
                  >
                    计算元素补全结果
                  </button>
                  <button
                    className={btnPrimary(darkMode)}
                    onClick={applyPhaseUnknowns}
                    disabled={!!selectedPhaseMaterialError || hasPendingDraftRows || hasFormulaErrors}
                  >
                    回填到配料总表
                  </button>
                </div>
                {selectedPhaseMaterial &&
                  (activePhasePreview?.materialId === selectedPhaseMaterial.id || phaseCompletedMaterials[selectedPhaseMaterial.id]) && (
                    <div className={assistAlertPanelClassName(darkMode, 'success')}>
                      {activePhasePreview?.materialId === selectedPhaseMaterial.id && !phaseCompletedMaterials[selectedPhaseMaterial.id]
                        ? `已计算，待回填：O ${format(activePhasePreview.values['O (氧)'])}%、C ${format(activePhasePreview.values['C (碳)'])}%、Other ${format(activePhasePreview.values['Other(其他)'])}%，请点击「回填到配料总表」。`
                        : `已回填：${selectedPhaseMaterial.name} 的 O / C / Other 已写入配料总表${phaseCompleted ? '（全部原料已完成折算）' : '（可切换其他未完成原料继续折算）'}。`}
                    </div>
                  )}
              </>
            )}
          </div>
        )}
      </div>

      <div ref={iterationAssistRef} className={cardBase(darkMode)}>
        <div>
          <h3 className={`${sectionTitle(darkMode)} mb-0`}>迭代计算</h3>
          <p className={`${hintText(darkMode)} mt-2 max-w-5xl leading-relaxed`}>{processStageCopy.iterationIntro}</p>
        </div>
        <div className="mt-4">
          <IterationFlowStrip darkMode={darkMode} />
        </div>
        <div className="mt-4 space-y-3">
          <IterationSubstepCard
            darkMode={darkMode}
            step={1}
            title="熔剂渣型求解"
            description={processStageCopy.solventStep}
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <LabeledInput darkMode={darkMode} label="铁硅比 Fe/SiO₂" value={targetFeSiO2} onChange={updateTargetFeSiO2} />
              <LabeledInput darkMode={darkMode} label="钙硅比 CaO/SiO₂" value={targetCaOSiO2} onChange={updateTargetCaOSiO2} />
            </div>
          </IterationSubstepCard>
          <IterationSubstepCard
            darkMode={darkMode}
            step={2}
            title="产物分配计算"
            description={processStageCopy.productStep}
          >
            <div className={`rounded-md border px-3 py-2 text-xs leading-relaxed ${darkMode ? 'border-gray-600 bg-gray-900/40 text-gray-300' : 'border-gray-200 bg-white text-gray-600'}`}>
              计算公式：{PRODUCT_CALCULATION_BASIS}。本步由系统自动完成，无需手动输入。
            </div>
          </IterationSubstepCard>
          <IterationSubstepCard
            darkMode={darkMode}
            step={3}
            title="热平衡配煤"
            description={processStageCopy.heatStep}
          >
            <div className="space-y-4">
              <div>
                <div className={`mb-2 text-xs font-semibold ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>温度设置</div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  <LabeledInput darkMode={darkMode} label="入炉料温度 (℃)" value={feedTemperature} onChange={(value) => updateHeatField(setFeedTemperature, value)} />
                  <LabeledInput darkMode={darkMode} label="冰铜/粗铜温度 (℃)" value={matteTemperature} onChange={(value) => updateHeatField(setMatteTemperature, value)} />
                  <LabeledInput darkMode={darkMode} label="炉渣温度 (℃)" value={slagTemperature} onChange={(value) => updateHeatField(setSlagTemperature, value)} />
                  <LabeledInput darkMode={darkMode} label="烟气温度 (℃)" value={gasTemperature} onChange={(value) => updateHeatField(setGasTemperature, value)} />
                  <LabeledInput darkMode={darkMode} label="烟尘温度 (℃)" value={dustTemperature} onChange={(value) => updateHeatField(setDustTemperature, value)} />
                </div>
              </div>
              <div>
                <div className={`mb-2 text-xs font-semibold ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>热支出与燃料参数</div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <LabeledInput darkMode={darkMode} label="炉体热损失 (MJ/h)" value={heatLossMJh} onChange={(value) => updateHeatField(setHeatLossMJh, value)} />
                  <LabeledInput darkMode={darkMode} label="其他热支出 (MJ/h)" value={otherHeatMJh} onChange={(value) => updateHeatField(setOtherHeatMJh, value)} />
                  <LabeledInput darkMode={darkMode} label="煤低位发热量 (MJ/kg)" value={fuelLhv} onChange={(value) => updateHeatField(setFuelLhv, value)} />
                  <LabeledInput darkMode={darkMode} label="燃烧效率" value={fuelEfficiency} onChange={(value) => updateHeatField(setFuelEfficiency, value)} />
                </div>
              </div>
            </div>
          </IterationSubstepCard>
          <IterationSubstepCard
            darkMode={darkMode}
            step={4}
            title="富氧空气参数设置"
            description={processStageCopy.oxygenStep}
          >
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <LabeledInput darkMode={darkMode} label="富氧空气 O (%)" value={oxygenAirO2Pct} onChange={(value) => updateOxygenAirComposition(value, oxygenAirN2Pct)} />
              <LabeledInput darkMode={darkMode} label="富氧空气 N (%)" value={oxygenAirN2Pct} onChange={(value) => updateOxygenAirComposition(oxygenAirO2Pct, value)} />
              <LabeledInput darkMode={darkMode} label="供氧系数" value={oxygenSupplyCoefficient} onChange={(value) => updateHeatField(setOxygenSupplyCoefficient, value)} />
            </div>
          </IterationSubstepCard>
        </div>
        {iterationResult && (
          <div className="mt-4 space-y-3">
            <div className={assistAlertPanelClassName(darkMode, iterationResult.valid ? 'success' : 'warning')}>
              {iterationResult.valid
                ? `${iterationResult.converged ? '已收敛' : '已完成'}：最终熔剂 ${format(iterationResult.finalSolventColumns.reduce((sum, column) => sum + column.weight, 0))} t/h，富氧空气 ${format(iterationResult.finalOxygenAirColumn.weight)} t/h，燃料煤 ${format(iterationResult.finalFuel.weight)} t/h，产物总量 ${format(iterationResult.finalProducts.totalProductMass)} t/h。${iterationResult.message ? ` ${iterationResult.message}` : ''}`
                : iterationResult.message ?? '迭代计算未能求解。'}
            </div>
            {iterationResult.iterations.length > 0 && (
              <div className={`overflow-auto rounded-lg border ${darkMode ? 'border-gray-600' : 'border-gray-200'}`}>
                <table className="w-full min-w-[760px] table-fixed text-sm">
                  <thead className={darkMode ? 'bg-gray-800 text-gray-300' : 'bg-gray-50 text-gray-600'}>
                    <tr>
                      <th className="px-2 py-2 text-center">迭代轨迹</th>
                      <th className="px-2 py-2 text-center">石灰 t/h</th>
                      <th className="px-2 py-2 text-center">铁矿石 t/h</th>
                      <th className="px-2 py-2 text-center">燃料煤 t/h</th>
                      <th className="px-2 py-2 text-center">富氧空气 t/h</th>
                      <th className="px-2 py-2 text-center">Fe/SiO₂</th>
                      <th className="px-2 py-2 text-center">CaO/SiO₂</th>
                      <th className="px-2 py-2 text-center">残差</th>
                    </tr>
                  </thead>
                  <tbody>
                    {iterationResult.iterations.map((row) => (
                      <tr key={row.iteration} className={`border-t ${darkMode ? 'border-gray-600' : 'border-gray-200'}`}>
                        <td className="px-2 py-1.5 text-center font-mono">{row.iteration}</td>
                        <td className="px-2 py-1.5 text-center font-mono">{format(row.limeWeight)}</td>
                        <td className="px-2 py-1.5 text-center font-mono">{format(row.ironOreWeight)}</td>
                        <td className="px-2 py-1.5 text-center font-mono">{format(row.fuelWeight)}</td>
                        <td className="px-2 py-1.5 text-center font-mono">{format(row.oxygenAirWeight)}</td>
                        <td className="px-2 py-1.5 text-center font-mono">{format(row.feSiO2, 3)}</td>
                        <td className="px-2 py-1.5 text-center font-mono">{format(row.caOSiO2, 3)}</td>
                        <td className="px-2 py-1.5 text-center font-mono">{format(row.maxDelta, 4)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
          <span className={`${hintText(darkMode)} whitespace-nowrap`}>
            {iterationAutoLinked ? '联动预览已开启' : '首次迭代后生成联动预览'}
          </span>
          <button className={btnSecondary(darkMode)} onClick={applyIterationResultToSummaryTable} disabled={!iterationResult?.valid}>
            回填到配料总表
          </button>
          <button className={btnPrimary(darkMode)} onClick={runIterativeCalculation} disabled={isIterating}>
            {isIterating ? '迭代计算中…' : '开始迭代计算'}
          </button>
        </div>
      </div>

      <div className={cardBase(darkMode)}>
        <div>
          <h3 className={`${sectionTitle(darkMode)} mb-0`}>迭代结果复核</h3>
          <p className={`${hintText(darkMode)} mt-2 leading-relaxed`}>按步骤 ①–④ 顺序展开核对，确认后回填配料总表。</p>
        </div>
        <div className="mt-4 space-y-3">
      <div ref={solventAssistRef} className={iterationResultPanelClass(darkMode)}>
        <button
          type="button"
          className="flex w-full flex-wrap items-center justify-between gap-3 px-3 py-3 text-left"
          onClick={() => setShowSolventAssist((value) => !value)}
        >
          <h4 className={`text-sm font-semibold ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}>① 熔剂投料量</h4>
          <span className={btnSecondary(darkMode)}>{showSolventAssist ? '折叠' : '展开'}</span>
        </button>
        {showSolventAssist && (
          <div className="space-y-4 border-t px-3 pb-3 pt-3">
            <p className={`${hintText(darkMode)} text-sm leading-relaxed`}>{processStageCopy.solventResultHint}</p>
            <div className={`rounded-lg border p-3 ${darkMode ? 'border-gray-600 bg-gray-800/30' : 'border-gray-200 bg-white'}`}>
              <h4 className={`mb-3 text-sm font-semibold ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>熔剂投料量预览</h4>
              <div className={`overflow-hidden rounded border ${darkMode ? 'border-gray-600' : 'border-gray-200'}`}>
                <table className="w-full table-fixed text-sm">
                  <thead className={darkMode ? 'bg-gray-800 text-gray-300' : 'bg-gray-50 text-gray-600'}>
                    <tr>
                      <th className="px-2 py-2 text-center">熔剂</th>
                      <th className="px-2 py-2 text-center">投料量 t/h</th>
                      <th className="px-2 py-2 text-center">状态</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resultSolventColumns.map((column) => (
                      <tr key={`solvent-result-${column.id}`} className={`border-t ${darkMode ? 'border-gray-600' : 'border-gray-200'}`}>
                        <td className="px-2 py-1.5 text-center font-medium">{displaySolventName(column.name)}</td>
                        <td className="px-2 py-1.5 text-center font-mono">{format(column.weight)}</td>
                        <td className="px-2 py-1.5 text-center">
                          {solventSolution?.valid ? '已回填' : solventPreviewSolution?.valid ? '待回填' : '待计算'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            {(solventPreviewSolution || solventSolution) && (
              <div className={assistAlertPanelClassName(darkMode, solventPreviewSolution?.valid || solventSolution?.valid ? 'success' : 'warning')}>
                {solventPreviewSolution?.valid
                  ? `联动迭代结果：石灰 ${format(solventPreviewSolution.solventWeights['石灰'] ?? 0)} t/h，铁矿石 ${format(solventPreviewSolution.solventWeights['铁矿石'] ?? 0)} t/h。产出${processStageCopy.slagBasis} Fe/SiO₂ ≈ ${format(solventPreviewSolution.feSiO2, 3)}，CaO/SiO₂ ≈ ${format(solventPreviewSolution.caOSiO2, 3)}。${solventPreviewSolution.message ? ` ${solventPreviewSolution.message}` : ''}`
                  : solventSolution?.valid
                  ? `已回填：石灰 ${format(solventSolution.solventWeights['石灰'] ?? 0)} t/h，铁矿石 ${format(solventSolution.solventWeights['铁矿石'] ?? 0)} t/h。产出${processStageCopy.slagBasis} Fe/SiO₂ ≈ ${format(solventSolution.feSiO2, 3)}，CaO/SiO₂ ≈ ${format(solventSolution.caOSiO2, 3)}。${solventSolution.message ? ` ${solventSolution.message}` : ''}`
                  : solventPreviewSolution?.message ?? solventSolution?.message}
              </div>
            )}
          </div>
        )}
      </div>

      <div ref={productAssistRef} className={iterationResultPanelClass(darkMode)}>
        <button
          type="button"
          className="flex w-full flex-wrap items-center justify-between gap-3 px-3 py-3 text-left"
          onClick={() => setShowProductAssist((value) => !value)}
        >
          <h4 className={`text-sm font-semibold ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}>② 产物分配</h4>
          <span className={btnSecondary(darkMode)}>{showProductAssist ? '折叠' : '展开'}</span>
        </button>
        {showProductAssist && (
          <div className="space-y-4 border-t px-3 pb-3 pt-3">
            <p className={`${hintText(darkMode)} text-sm leading-relaxed`}>{processStageCopy.productResultHint}</p>
            <div className={`overflow-auto rounded-lg border ${darkMode ? 'border-gray-600' : 'border-gray-200'}`}>
              <table className="w-full min-w-[960px] table-fixed text-sm">
                <thead className={darkMode ? 'bg-gray-800 text-gray-300' : 'bg-gray-50 text-gray-600'}>
                  <tr>
                    {resultProductPhaseReviewBlocks.map(({ product }) => (
                      <th
                        key={`product-phase-head-${product.key}`}
                        colSpan={3}
                        className={`border-b px-2 py-2 text-center font-semibold ${darkMode ? 'border-gray-600 bg-indigo-950/20 text-indigo-100' : 'border-gray-200 bg-indigo-50 text-indigo-900'}`}
                      >
                        <div>{getStageProductName(activeProcessStageId, product)}</div>
                        <div className={`mt-1 font-mono text-xs font-normal ${productPreviewReady ? '' : 'opacity-40'}`}>
                          {productPreviewReady ? `${formatTableNumber(product.mass)} t/h` : '— t/h'}
                        </div>
                      </th>
                    ))}
                  </tr>
                  <tr>
                    {resultProductPhaseReviewBlocks.flatMap(({ product }) => [
                      <th key={`${product.key}-phase`} className="border-b px-2 py-2 text-center font-medium">
                        组分
                      </th>,
                      <th key={`${product.key}-pct`} className="border-b px-2 py-2 text-center font-medium">
                        w%
                      </th>,
                      <th key={`${product.key}-mass`} className="border-b px-2 py-2 text-center font-medium">
                        质量 t/h
                      </th>,
                    ])}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: resultProductPhaseReviewRowCount }, (_, rowIndex) => (
                    <tr key={`product-phase-review-row-${rowIndex}`} className={`border-t ${darkMode ? 'border-gray-600' : 'border-gray-200'}`}>
                      {resultProductPhaseReviewBlocks.flatMap(({ product, rows }) => {
                        const phaseRow = rows[rowIndex]
                        const cellClass = `${productOutputCellClass(darkMode, productPreviewReady ? 'resolved' : 'pending', 'single', 'middle')} px-2 py-1.5`
                        if (!phaseRow) {
                          return [
                            <td key={`${product.key}-${rowIndex}-phase`} className={`${cellClass} text-center text-gray-400`}>—</td>,
                            <td key={`${product.key}-${rowIndex}-pct`} className={`${cellClass} text-center text-gray-400`}>—</td>,
                            <td key={`${product.key}-${rowIndex}-mass`} className={`${cellClass} text-center text-gray-400`}>—</td>,
                          ]
                        }
                        return [
                          <td key={`${product.key}-${rowIndex}-phase`} className={`${cellClass} text-center font-medium`}>
                            {phaseRow.label}
                          </td>,
                          <td key={`${product.key}-${rowIndex}-pct`} className={`${cellClass} text-center font-mono`}>
                            {productPreviewReady ? formatTableNumber(phaseRow.pct) : ''}
                          </td>,
                          <td key={`${product.key}-${rowIndex}-mass`} className={`${cellClass} text-center font-mono`}>
                            {productPreviewReady ? formatTableNumber(phaseRow.mass) : ''}
                          </td>,
                        ]
                      })}
                    </tr>
                  ))}
                </tbody>
                <tfoot className={darkMode ? 'border-t border-gray-600 bg-gray-800/30 text-gray-300' : 'border-t border-gray-200 bg-gray-50 text-gray-700'}>
                  <tr>
                    <td colSpan={resultProductPhaseReviewBlocks.length * 3} className="px-3 py-2 text-sm">
                      <span>
                        损失
                        <span className={`ml-1 font-mono ${productPreviewReady ? '' : 'opacity-40'}`}>
                          {productPreviewReady ? `${formatTableNumber(resultProductLoss.mass)} t/h` : '— t/h'}
                        </span>
                      </span>
                      <span className="ml-6">
                        产出合计
                        <span className={`ml-1 font-mono ${productPreviewReady ? '' : 'opacity-40'}`}>
                          {productPreviewReady ? `${formatTableNumber(resultProductSummary.mass)} t/h` : '— t/h'}
                        </span>
                      </span>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
            {(productPreviewReady || productCalculated) && (
              <div className={assistAlertPanelClassName(darkMode, 'success')}>
                {productCalculated
                  ? `已回填产出结果：配料总表右侧产出栏已与当前计算对齐；产物总量 ${format(tableProductResult.totalProductMass)} t/h（${formatCopperProductMassSummary(tableProductResult, activeProcessStageId)}）。`
                  : `联动迭代结果：已形成产出预览，产物总量 ${format(resultProductResult.totalProductMass)} t/h（${formatCopperProductMassSummary(resultProductResult, activeProcessStageId)}）。`}
              </div>
            )}
          </div>
        )}
      </div>

      <div ref={heatAssistRef} className={iterationResultPanelClass(darkMode)}>
        <button
          type="button"
          className="flex w-full flex-wrap items-center justify-between gap-3 px-3 py-3 text-left"
          onClick={() => setShowHeatAssist((value) => !value)}
        >
          <h4 className={`text-sm font-semibold ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}>③ 热平衡与燃料煤（{processStageCopy.heatResultSuffix}）</h4>
          <span className={btnSecondary(darkMode)}>{showHeatAssist ? '折叠' : '展开'}</span>
        </button>
        {showHeatAssist && (
          <div className="space-y-4 border-t px-3 pb-3 pt-3">
            <p className={`${hintText(darkMode)} text-sm leading-relaxed`}>{processStageCopy.heatResultHint}</p>
            <div>
              <h4 className={`mb-2 text-sm font-semibold ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>热收支结果</h4>
              <div className={`overflow-auto rounded-lg border ${darkMode ? 'border-gray-600' : 'border-gray-200'}`}>
                <table className="w-full min-w-[720px] table-fixed text-sm">
                  <thead className={darkMode ? 'bg-gray-800 text-gray-300' : 'bg-gray-50 text-gray-600'}>
                    <tr>
                      <th className="px-2 py-2 text-center">项目</th>
                      <th className="px-2 py-2 text-center">数值</th>
                      <th className="px-2 py-2 text-center">单位</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ['投入物理热', format(resultHeatBalance.inputPhysicalHeatMJh, 0), 'MJ/h'],
                      ['氧化化学热', format(resultHeatBalance.chemicalHeatMJh, 0), 'MJ/h'],
                      ['产物物理热', format(resultHeatBalance.outputPhysicalHeatMJh, 0), 'MJ/h'],
                      ['总热损失', format(resultHeatBalance.heatLossMJh + resultHeatBalance.otherHeatMJh, 0), 'MJ/h'],
                      ['热缺口', format(Math.max(0, resultHeatBalance.heatDeficitMJh), 0), 'MJ/h'],
                      ['推荐燃料煤', format(resultHeatBalance.requiredFuelWeight), 't/h'],
                    ].map(([label, value, unit]) => (
                      <tr key={label} className={`border-t ${darkMode ? 'border-gray-600' : 'border-gray-200'}`}>
                        <td className="px-2 py-1.5 text-center font-medium">{label}</td>
                        <td className="px-2 py-1.5 text-center font-mono">{value}</td>
                        <td className="px-2 py-1.5 text-center">{unit}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div>
              <h4 className={`mb-2 text-sm font-semibold ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>关键计算过程</h4>
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                <div className={heatFormulaCardClass(darkMode)}>
                  <div className={`text-xs font-semibold ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>热收入</div>
                  <div className="mt-1 font-mono text-sm">
                    {format(resultHeatBalance.inputPhysicalHeatMJh, 0)} + {format(resultHeatBalance.chemicalHeatMJh, 0)} + {format(resultHeatBalance.fuelEffectiveHeatMJh, 0)} = {format(resultHeatBalance.inputPhysicalHeatMJh + resultHeatBalance.chemicalHeatMJh + resultHeatBalance.fuelEffectiveHeatMJh, 0)} MJ/h
                  </div>
                  <div className={`${hintText(darkMode)} mt-1`}>
                    入炉物理热 + 氧化化学热 + 燃料有效热。氧化化学热按 S、C、Fe、Cu 的简化放热系数估算。
                  </div>
                </div>
                <div className={heatFormulaCardClass(darkMode)}>
                  <div className={`text-xs font-semibold ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>热支出</div>
                  <div className="mt-1 font-mono text-sm">
                    {format(resultHeatBalance.outputPhysicalHeatMJh, 0)} + {format(resultHeatBalance.heatLossMJh, 0)} + {format(resultHeatBalance.otherHeatMJh, 0)} = {format(resultHeatBalance.outputPhysicalHeatMJh + resultHeatBalance.heatLossMJh + resultHeatBalance.otherHeatMJh, 0)} MJ/h
                  </div>
                  <div className={`${hintText(darkMode)} mt-1`}>
                    产物物理热 + 炉体热损失 + 其他热损失；产物物理热来自冰铜、炉渣、烟气和烟尘的温度与质量。
                  </div>
                </div>
                <div className={heatFormulaCardClass(darkMode)}>
                  <div className={`text-xs font-semibold ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>燃料煤求解</div>
                  <div className="mt-1 font-mono text-sm">
                    max(0, {format(resultHeatBalance.heatDeficitMJh, 0)}) / {format(resultFuelHeatMJt, 0)} = {format(resultHeatBalance.requiredFuelWeight)} t/h
                  </div>
                  <div className={`${hintText(darkMode)} mt-1`}>
                    热缺口 /（煤低位发热量 × 1000 × 燃烧效率）；当前煤有效热值约 {format(resultFuelHeatMJt, 0)} MJ/t。
                  </div>
                </div>
                <div className={heatFormulaCardClass(darkMode)}>
                  <div className={`text-xs font-semibold ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>联动物料基准</div>
                  <div className="mt-1 grid grid-cols-2 gap-2 font-mono text-sm">
                    <span>热平衡入炉料 {format(resultHeatFeed.totalWeight)} t/h</span>
                    <span>富氧空气 {format(resultOxygenAirColumn.weight)} t/h</span>
                    <span>{getStageProductName(activeProcessStageId, resultHeatProducts.products.matte)} {format(resultHeatProducts.products.matte.mass)} t/h</span>
                    <span>{getStageProductName(activeProcessStageId, resultHeatProducts.products.slag)} {format(resultHeatProducts.products.slag.mass)} t/h</span>
                    <span>{getStageProductName(activeProcessStageId, resultHeatProducts.products.gas)} {format(resultHeatProducts.products.gas.mass)} t/h</span>
                    <span>{getStageProductName(activeProcessStageId, resultHeatProducts.products.dust)} {format(resultHeatProducts.products.dust.mass)} t/h</span>
                  </div>
                  <div className={`${hintText(darkMode)} mt-1`}>
                    热平衡先按不含燃料煤的入炉料生成产物物理热，再把推荐燃料煤回到总迭代中刷新混料和产出。
                  </div>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className={hintText(darkMode)}>
                {heatPreviewReady || heatBalanced
                  ? `热平衡预览残差：${format(resultHeatBalance.balanceAfterFuelMJh, 0)} MJ/h；推荐燃料煤 ${format(resultHeatBalance.requiredFuelWeight)} t/h；富氧空气 ${format(resultOxygenAirColumn.weight)} t/h。`
                  : '请先在迭代输入中完成联动计算。'}
              </div>
            </div>
            {(heatPreviewReady || heatBalanced) && (
              <div className={assistAlertPanelClassName(darkMode, 'success')}>
                {heatBalanced
                  ? `联动迭代结果：配料总表燃料煤已为 ${format(fuelColumn.weight)} t/h；热平衡残差约 ${format(heatBalance.balanceAfterFuelMJh, 0)} MJ/h（熔剂、产物与混料已同步更新）。`
                  : `联动迭代结果：已形成热平衡预览，热缺口 ${format(Math.max(0, resultHeatBalance.heatDeficitMJh), 0)} MJ/h，推荐燃料煤 ${format(resultHeatBalance.requiredFuelWeight)} t/h。`}
              </div>
            )}
          </div>
        )}
      </div>

      <div className={iterationResultPanelClass(darkMode)}>
        <button
          type="button"
          className="flex w-full flex-wrap items-center justify-between gap-3 px-3 py-3 text-left"
          onClick={() => setShowOxygenAirAssist((value) => !value)}
        >
          <h4 className={`text-sm font-semibold ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}>④ 富氧空气</h4>
          <span className={btnSecondary(darkMode)}>{showOxygenAirAssist ? '折叠' : '展开'}</span>
        </button>
        {showOxygenAirAssist && (
          <div className="space-y-4 border-t px-3 pb-3 pt-3">
            <p className={`${hintText(darkMode)} text-sm leading-relaxed`}>{processStageCopy.oxygenResultHint}</p>
            <div className={`overflow-auto rounded-lg border ${darkMode ? 'border-gray-600' : 'border-gray-200'}`}>
              <table className="w-full min-w-[680px] table-fixed text-sm">
                <thead className={darkMode ? 'bg-gray-800 text-gray-300' : 'bg-gray-50 text-gray-600'}>
                  <tr>
                    <th className="px-2 py-2 text-center">项目</th>
                    <th className="px-2 py-2 text-center">数值</th>
                    <th className="px-2 py-2 text-center">单位</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ['物相需氧', resultOxygenAirCalculation ? format(resultOxygenAirCalculation.phaseOxygenKmolh, 2) : '-', 'kmol/h'],
                    ['燃料需氧', resultOxygenAirCalculation ? format(resultOxygenAirCalculation.fuelOxygenKmolh, 2) : '-', 'kmol/h'],
                    ['理论总需氧', resultOxygenAirCalculation ? format(resultOxygenAirCalculation.theoreticalOxygenKmolh, 2) : '-', 'kmol/h'],
                    ['实际供氧', resultOxygenAirCalculation ? format(resultOxygenAirCalculation.actualOxygenKmolh, 2) : '-', 'kmol/h'],
                    ['富氧空气体积', resultOxygenAirCalculation ? format(resultOxygenAirCalculation.airVolumeNm3h, 0) : '-', 'Nm³/h'],
                    ['投料量', formatTableNumber(resultOxygenAirColumn.weight), 't/h'],
                    ['O', formatTableNumber(resultOxygenAirColumn.ratios['O (氧)'] ?? 0), '%'],
                    ['N', formatTableNumber(resultOxygenAirColumn.ratios['N (氮)'] ?? 0), '%'],
                    ['供氧系数', resultOxygenAirCalculation ? format(resultOxygenAirCalculation.oxygenSupplyCoefficient, 3) : oxygenSupplyCoefficient, ''],
                  ].map(([label, value, unit]) => (
                    <tr key={label} className={`border-t ${darkMode ? 'border-gray-600' : 'border-gray-200'}`}>
                      <td className="px-2 py-1.5 text-center font-medium">{label}</td>
                      <td className="px-2 py-1.5 text-center font-mono">{value}</td>
                      <td className="px-2 py-1.5 text-center">{unit}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
        </div>
      </div>

      <CaseFooterActions
        darkMode={darkMode}
        onReturnCasePage={() => confirmSaveBeforeCaseNavigation('raw_material')}
        onNextStep={saveCurrentCaseAndGoNext}
        nextLabel={nextProcessStage ? '下一步' : '完成'}
        nextDisabled={!nextProcessStage}
      />
    </div>
  )
}

function AddLibraryMaterialDialog({
  darkMode,
  mode,
  open,
  message,
  rows,
  rowTotal,
  onAddRow,
  onRemoveRow,
  onNameChange,
  onRatioChange,
  onCancel,
  onSubmit,
}: {
  darkMode: boolean
  mode: LibraryMaterialDialogMode
  open: boolean
  message: string | null
  rows: SingleLibraryRow[]
  rowTotal: (row: SingleLibraryRow) => number
  onAddRow: () => void
  onRemoveRow: (id: string) => void
  onNameChange: (id: string, value: string) => void
  onRatioChange: (id: string, element: CopperElementKey, value: string) => void
  onCancel: () => void
  onSubmit: () => void
}) {
  if (!open) return null

  const ariaLabel = mode === 'edit' ? '修改原料' : '添加原料'
  const title = mode === 'edit' ? '修改原料' : '添加原料'
  const submitLabel = mode === 'edit' ? '保存修改' : '添加到原料库'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label={ariaLabel}>
      <div className={`max-h-[88vh] w-[96vw] max-w-7xl overflow-hidden rounded-lg border shadow-xl ${darkMode ? 'border-gray-600 bg-gray-900 text-gray-100' : 'border-gray-200 bg-white text-gray-900'}`}>
        <div className={`flex flex-wrap items-start justify-between gap-3 border-b px-4 py-3 ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
          <div>
            <h3 className={sectionTitle(darkMode)}>{title}</h3>
            <p className={`${hintText(darkMode)} mt-1`}>可修改原料名称和各元素含量，元素含量总和不得超过 100%。</p>
          </div>
        </div>
        {message && (
          <div
            className={`border-b px-4 py-2 text-sm ${darkMode ? 'border-amber-800 bg-amber-950/35 text-amber-100' : 'border-amber-200 bg-amber-50 text-amber-900'}`}
            role="status"
          >
            {message}
          </div>
        )}
        <div className="max-h-[58vh] overflow-auto px-4 py-3">
          <table className="min-w-[1040px] table-fixed text-sm">
            <thead className={darkMode ? 'bg-gray-800 text-gray-300' : 'bg-gray-50 text-gray-600'}>
              <tr>
                <th className="w-36 px-2 py-2 text-center">原料名称</th>
                {COPPER_ELEMENT_KEYS.map((element) => (
                  <th key={element} className="w-14 px-1 py-2 text-center">{element.replace(/\(.+\)/, '')}</th>
                ))}
                <th className="w-16 px-1 py-2 text-center">单行合计</th>
                <th className="w-20 px-1 py-2 text-center">操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const total = rowTotal(row)
                const totalClass = total > 100
                  ? darkMode ? 'text-red-300' : 'text-red-700'
                  : darkMode ? 'text-emerald-300' : 'text-emerald-700'
                return (
                  <tr key={row.id} className={`border-t ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                    <td className="px-1 py-1.5">
                      <input
                        className={`${inputSm(darkMode)} h-8 w-full text-center`}
                        value={row.name}
                        placeholder="例：高品位铜精矿"
                        onChange={(event) => onNameChange(row.id, event.target.value)}
                      />
                    </td>
                    {COPPER_ELEMENT_KEYS.map((element) => (
                      <td key={element} className="px-1 py-1.5">
                        <input
                          className={`${inputSm(darkMode)} h-8 w-full px-1 text-center font-mono text-sm`}
                          value={row.ratios[element] || ''}
                          onChange={(event) => onRatioChange(row.id, element, event.target.value)}
                        />
                      </td>
                    ))}
                    <td className={`px-1 py-1.5 text-center font-mono ${totalClass}`}>{format(total)}</td>
                    <td className="px-1 py-1.5 text-center">
                      {mode === 'add' ? (
                        <button
                          type="button"
                          className={`rounded border px-2 py-1 text-xs font-medium transition-colors ${
                            darkMode ? 'border-red-800 text-red-200 hover:bg-red-950/40 disabled:text-gray-500' : 'border-red-200 text-red-700 hover:bg-red-50 disabled:text-gray-400'
                          }`}
                          disabled={rows.length <= 1}
                          onClick={() => onRemoveRow(row.id)}
                        >
                          删除
                        </button>
                      ) : (
                        <span className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className={`flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
          <div className="min-w-[4rem]">
            {mode === 'add'
              ? (
                  <button type="button" className={btnSecondary(darkMode)} onClick={onAddRow}>增行</button>
                )
              : (
                  <span aria-hidden="true" className="inline-block w-px" />
                )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={btnSecondary(darkMode)} onClick={onCancel}>取消</button>
            <button type="button" className={btnPrimary(darkMode)} onClick={onSubmit}>{submitLabel}</button>
          </div>
        </div>
      </div>
    </div>
  )
}

function stagePageTopShellClass(dark: boolean, highlighted: boolean) {
  return `space-y-4 rounded-lg transition-shadow duration-700 ${
    highlighted
      ? dark
        ? 'ring-2 ring-blue-500/60 ring-offset-2 ring-offset-gray-900'
        : 'ring-2 ring-blue-400/70 ring-offset-2 ring-offset-white'
      : ''
  }`
}

function BatchTableViewTabs({
  darkMode,
  activeView,
  onChange,
}: {
  darkMode: boolean
  activeView: BatchTableView
  onChange: (view: BatchTableView) => void
}) {
  const tabs: Array<{ id: BatchTableView; label: string }> = [
    { id: 'element', label: '元素总表' },
    { id: 'phase', label: '物相总表' },
  ]
  return (
    <div className={`inline-flex items-end gap-1 rounded-t-md border-b px-1 pt-1 ${darkMode ? 'border-gray-600' : 'border-gray-300'}`}>
      {tabs.map((tab) => {
        const active = tab.id === activeView
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={`min-w-20 rounded-t-md border px-3 py-1.5 text-sm font-medium ${
              active
                ? darkMode
                  ? 'border-gray-500 border-b-gray-800 bg-gray-800 text-gray-100'
                  : 'border-gray-300 border-b-white bg-white text-gray-900'
                : darkMode
                ? 'border-gray-700 bg-gray-900/50 text-gray-400 hover:text-gray-200'
                : 'border-gray-200 bg-gray-100 text-gray-600 hover:text-gray-900'
            }`}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}

function StageSheetTabs({
  darkMode,
  activeSheet,
  onStageSelect,
}: {
  darkMode: boolean
  activeSheet: SheetId
  onStageSelect: (sheet: SheetId) => void
}) {
  return (
    <div className={`flex items-end gap-1 border-b px-1 pt-1 ${darkMode ? 'border-gray-600' : 'border-gray-300'}`}>
      {STAGES.map((stage) => {
        const active = stage.id === activeSheet
        return (
          <button
            key={stage.id}
            type="button"
            onClick={() => onStageSelect(stage.id)}
            className={`min-w-24 rounded-t-md border px-4 py-2 text-sm font-medium ${
              active
                ? darkMode
                  ? 'border-gray-500 border-b-gray-800 bg-gray-800 text-gray-100'
                  : 'border-gray-300 border-b-white bg-white text-gray-900'
                : darkMode
                ? 'border-gray-700 bg-gray-900/50 text-gray-400 hover:text-gray-200'
                : 'border-gray-200 bg-gray-100 text-gray-600 hover:text-gray-900'
            }`}
          >
            {stage.name}
          </button>
        )
      })}
    </div>
  )
}

function SaveBeforeNavigationDialog({
  darkMode,
  open,
  targetName,
  actionDescription,
  onSaveAndContinue,
  onContinueWithoutSaving,
  onCancel,
}: {
  darkMode: boolean
  open: boolean
  targetName: string
  actionDescription: string
  onSaveAndContinue: () => void
  onContinueWithoutSaving: () => void
  onCancel: () => void
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="save-navigation-title"
        className={`relative w-full max-w-md overflow-hidden rounded-lg border shadow-2xl ${darkMode ? 'border-gray-600 bg-gray-800 text-gray-100' : 'border-gray-200 bg-white text-gray-900'}`}
      >
        <button
          type="button"
          aria-label="关闭"
          className={`absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded text-lg leading-none transition-colors ${
            darkMode ? 'text-gray-300 hover:bg-gray-700 hover:text-white' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
          }`}
          onClick={onCancel}
        >
          ×
        </button>
        <div className={`flex items-center gap-3 border-b px-4 py-3 ${darkMode ? 'border-gray-600 bg-gray-900/70' : 'border-gray-200 bg-gray-50'}`}>
          <img src="./icon.png" alt="" className="h-9 w-9 rounded-md object-contain" />
          <div>
            <div className={`text-sm font-semibold ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}>{APP_NAME_ZH}</div>
            <div className={hintText(darkMode)}>页面切换确认</div>
          </div>
        </div>
        <div className="space-y-2 px-4 py-4">
          <h3 id="save-navigation-title" className={`text-base font-semibold ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}>
            是否保存当前页面的内容？
          </h3>
          <p className={`text-sm leading-relaxed ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
            即将{actionDescription || `切换到${targetName}`}。保存后继续可保留当前案例的最新计算状态。
          </p>
        </div>
        <div className={`grid grid-cols-2 gap-2 border-t px-4 py-3 ${darkMode ? 'border-gray-600 bg-gray-900/40' : 'border-gray-200 bg-gray-50'}`}>
          <button type="button" className={`${btnSecondary(darkMode)} w-full`} onClick={onContinueWithoutSaving}>
            不保存
          </button>
          <button type="button" className={`${btnPrimary(darkMode)} w-full`} onClick={onSaveAndContinue}>
            保存
          </button>
        </div>
      </div>
    </div>
  )
}

function StageHeader({
  darkMode,
  activeSheet,
  onReturnCasePage,
}: {
  darkMode: boolean
  activeSheet: SheetId
  onReturnCasePage: () => void
}) {
  const activeIndex = STAGES.findIndex((stage) => stage.id === activeSheet)
  const active = STAGES[activeIndex] ?? STAGES[0]
  const flowText =
    activeSheet === 'cu_equipment'
      ? '操作流程：汇总熔炼/吹炼/精炼结果 → 选择目标规模 → 调整设备选型总表 → 形成设备选型依据'
      : '操作流程：选择/添加原料 → 输入投料量 → 物相折算元素 → 输入出炉渣型与热平衡设置 → 开始迭代计算 → 复核配料总表 → 进入下一工序'
  const processText =
    activeSheet === 'cu_equipment'

  return (
    <div className={cardBase(darkMode)}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className={`${sectionTitle(darkMode)} mb-1`}>{active.name}</h3>
          <p className={`${hintText(darkMode)} leading-relaxed`}>{active.description}</p>
          <span className={`block text-sm leading-relaxed ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
            {flowText}
          </span>
          {processText && (
            <span className={`block text-sm leading-relaxed ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
              {processText}
            </span>
          )}
        </div>
        <button type="button" className={btnSecondary(darkMode)} onClick={onReturnCasePage}>
          返回项目工作区
        </button>
      </div>
    </div>
  )
}

function CaseFooterActions({
  darkMode,
  onReturnCasePage,
  onNextStep,
  nextLabel,
  nextDisabled = false,
}: {
  darkMode: boolean
  onReturnCasePage: () => void
  onNextStep: () => void
  nextLabel: string
  nextDisabled?: boolean
}) {
  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4 ${darkMode ? 'border-gray-600 bg-gray-800/50' : 'border-gray-200 bg-white'}`}>
      <div>
        <h3 className={`${sectionTitle(darkMode)} mb-0`}>案例操作</h3>
      </div>
      <div className="flex flex-wrap gap-2">
        <button className={btnSecondary(darkMode)} onClick={onReturnCasePage}>返回工作区</button>
        <button className={btnPrimary(darkMode)} onClick={onNextStep} disabled={nextDisabled}>{nextLabel}</button>
      </div>
    </div>
  )
}

function LabeledInput({
  darkMode,
  label,
  value,
  onChange,
  readOnly = false,
}: {
  darkMode: boolean
  label: string
  value: string
  onChange?: (value: string) => void
  readOnly?: boolean
}) {
  return (
    <div>
      <label className={`mb-1 block text-xs font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>{label}</label>
      <input
        className={`${inputBase(darkMode)} w-full`}
        value={value}
        readOnly={readOnly}
        onChange={(event) => onChange?.(event.target.value)}
      />
    </div>
  )
}

function BlendMetric({ darkMode, label, value }: { darkMode: boolean; label: string; value: string }) {
  return (
    <div className={`rounded-md border px-2 py-1.5 ${darkMode ? 'border-gray-600 bg-gray-800/30' : 'border-gray-200 bg-gray-50/70'}`}>
      <div className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>{label}</div>
      <div className="mt-0.5 font-mono text-base">{value}</div>
    </div>
  )
}
