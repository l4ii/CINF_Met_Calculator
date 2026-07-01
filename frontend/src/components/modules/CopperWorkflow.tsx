import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react'
import type { SheetId } from '../../types'
import { APP_NAME_ZH } from '../../constants/appCopy'
import { btnPrimary, btnSecondary, cardBase, cardCompact, hintText, inputBase, inputSm, sectionTitle } from '../../theme/uiTheme'
import {
  buildCopperBatchExportFilename,
  buildCopperBatchWorkbookHtml,
  getCopperStageExportName,
  saveCopperBatchExcelWorkbook,
  sanitizeExcelFilePart,
  formatExportDate,
  type CopperBatchExportColumn,
  type CopperBatchExportRow,
  type CopperBatchWorkbookSheet,
} from '../../utils/copperBatchExport'
import {
  batchElementTableWidth,
  batchPhaseTableWidth,
  batchTableNameColWidthFromLabels,
  computeLibraryDialogColWidths,
  computePhaseAssistTableLayout,
} from '../../utils/copperBatchTableLayout'
import {
  OXY_PRODUCT_KEY_TO_CN,
  OXY_SIDE_BLOW_PRODUCT_KEYS,
  loadOxySideBlowConstraints,
  type ConstraintElementKey,
  type CustomConstraintEntry,
  type DistributionRuleType,
  type ElementDistributionEntry,
  type OxySideBlowConstraintConfig,
  type OxySideBlowProductKey,
} from '../../utils/copperConstraintConfig.ts'
import {
  autoFillOxyProductConstraintConfig,
  firstBlockingConstraintMessage,
  migrateOxyProductConstraintDefaults,
  productCanCarryConstraintElement,
  resolveConstraintRuleValue,
  validateOxyProductConstraintConfig,
} from '../../utils/copperConstraintValidation.ts'
import { sortOxyConstraintElementKeys } from '../../utils/copperConstraintElementOrder.ts'
import { CopperBatchTableColGroup } from './CopperBatchTableColGroup'
import {
  CopperBatchElementTable,
  type SolveInputStatus,
} from './CopperBatchElementTable'
import { CopperBatchPhaseTables, type PhaseTableColumn } from './CopperBatchPhaseTables'
import { BatchTableNumericReadonly } from './BatchTableNumericCell'
import { batchTableHasResult, formatBatchTableDisplay, formatBatchTableTooltip } from '../../utils/batchTableNumeric'
import {
  buildFurnaceBlendPhaseColumn,
  buildInputPhaseColumn,
  buildOxygenAirPhaseColumn,
  deriveElementsFromPhaseContents,
  INPUT_PHASE_ROW_KEYS,
  isPhaseColumnValid,
  normalizePhasePercents,
  parsePhaseDraftMap,
  phaseStorageKeyToDisplayLabel,
  type CustomPhaseRow,
  type InputPhaseRowKey,
  type PhasePercentMap,
} from '../../utils/copperPhaseTableCalc'
import {
  COPPER_PLACEHOLDER_ELEMENT_KEYS,
  COPPER_PLACEHOLDER_PHASE_ROW_KEYS,
  sortCopperElementKeys,
  sortCopperPhaseKeys,
  sortMaterialPhaseRows,
} from '../../utils/copperDisplayOrder'
import {
  buildDefaultMaterialPhaseContentsByKey,
  collectMaterialPhaseTableKeys,
  createConcentrateMaterialPhaseRows,
  createDefaultMaterialPhaseRowsForMaterial,
  createDraftMaterialPhaseRow,
  createMaterialPhaseRowsFromFormulas,
  ensureMaterialPhaseRows,
  findDuplicateMaterialPhase,
  mapPhaseContentsToTableKeys,
  materialPhaseRowTableKeys,
  resolveMaterialPhaseFormula,
  rowDraftStorageKey,
  buildPhaseAssistDisplaySlots,
  filterPhaseAssistDisplaySlots,
  type MaterialPhaseAssistRow,
} from '../../utils/copperPhaseAssist'
import {
  COPPER_ELEMENT_TABLE_ALWAYS_INCLUDE,
  visibleCopperElementKeys,
} from '../../utils/copperElementVisibility.ts'
import {
  decomposePhaseElementMasses,
  elementSymbolLabel,
  buildPhaseAssistElementRowSlots,
  getPhaseTableColumnKeys,
  phaseTableHeaderLabel,
  type CopperElementDisplayMode,
} from '../../utils/copperElementDisplay.ts'
import { formulaToDisplayLabel } from '../../utils/chemicalFormula.ts'
import {
  buildBlendPhaseMassFromMaterialResults,
  buildPhasePivotRows,
  computeMaterialPhaseResult,
  formatPhasePercentDraft,
  phaseContentsToInputPhaseMap,
  sumPhasePivotTotals,
  type PhaseMaterialCalcResult,
} from '../../utils/copperPhaseBatchCalc'
import {
  applyRawMaterialRatioTotalValidation,
  formatRawMaterialRatioValidationMessage,
  isRawMaterialKnownTotalOverLimit,
  rawMaterialValidatedRatiosChanged,
  sulfurInputStatus,
  validateLibraryDialogElementColumns,
  validateMaterialForPhaseCalc,
  validateRatiosSulfurRequirement,
} from '../../utils/copperMaterialValidation'
import {
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
  COPPER_SW_CONCENTRATE_LIBRARY_IDS,
  calculateKnownTotal,
  calculateWeightedComposition,
  materialWaterWeight,
  migrateMaterialWaterWeight,
  syncMaterialMoistureFromWater,
  totalWaterWeight,
  createDefaultCopperMaterials,
  createOxygenAirColumn,
  createProcessAirColumns,
  normalizeProcessAirColumns,
  DEFAULT_COPPER_OXYGEN_AIR_SETTINGS,
  createDefaultSolventColumns,
  DEFAULT_COPPER_SOLVENTS,
  closeCopperRatios,
  emptyCopperRatios,
  solventOxidesToElements,
  normalizeCopperRatios,
  parseCopperLibraryCsv,
  resolveCopperElementKey,
  type CopperElementKey,
  type CopperLibraryMaterial,
  type CopperMaterialColumn,
  type CopperRatios,
  type CopperSolventSolution,
} from '../../utils/copperWorkflowCalc'
import {
  COPPER_PRODUCT_KEYS,
  DEFAULT_COPPER_PRODUCT_MODEL,
  DEFAULT_COPPER_FUEL,
  calculateCopperProducts,
  normalizeCopperProductModel,
  type CopperFuelMaterial,
  type CopperProductKey,
  type CopperProductModel,
  type CopperProductResult,
} from '../../utils/copperProcessCalc'
import {
  calculateCopperHeatBalanceDetailed,
  sourceMaterialFromColumn,
  type CopperHeatBalanceResult,
  type CopperHeatBalanceSourceMaterial,
} from '../../utils/copperHeatBalance.ts'
import {
  classifyOxyConstraintAcceptance,
  parseConstraintExpression,
  solveOxySideBlowProducts,
  type OxyConstraintSolverResult,
} from '../../utils/copperConstraintSolver.ts'
import {
  oxyProductPhasePercentMaps,
  oxyProductTableColumns,
  oxySolverToCopperProductResult,
} from '../../utils/copperOxyProductBridge.ts'
import {
  validateOxySolverResultForFillBack,
  validateRawMaterialPhaseInputs,
} from '../../utils/copperOxySolverValidation.ts'
import { CopperHeatBalancePlaceholderTables } from './CopperHeatBalancePlaceholderTables.tsx'
import type { ProductElementTableProduct } from './CopperBatchProductElementTable.tsx'
import { CopperProductionResultTable } from './CopperProductionResultTable.tsx'
import { ListPaginationBar } from '../ListPaginationBar.tsx'
import { DEFAULT_LIST_PAGE_SIZE, pageCountFor } from '../../utils/pagination.ts'

interface CopperWorkflowProps {
  darkMode: boolean
  language?: 'zh' | 'en'
  activeSheet: SheetId
  onStageSelect: (sheet: SheetId) => void
  smeltMethodId: string
  smeltMethodName: string
  caseTitleDraft?: string
  onActiveCaseNameChange?: (name: string | null) => void
}

type PhaseUnknowns = Pick<Record<CopperElementKey, number>, 'O(氧)' | 'C (碳)' | 'Other(其他)'>
type PhasePreviewUnknowns = { materialId: string; phaseContents: Record<string, number>; values: PhaseUnknowns }
type PhaseBatchResults = Record<string, PhaseMaterialCalcResult>

function buildPhasePreviewUnknowns(materialId: string, result: PhaseMaterialCalcResult): PhasePreviewUnknowns {
  return {
    materialId,
    phaseContents: result.phaseContents,
    values: result.unknowns,
  }
}

function phaseSheetTabStatus(
  materialId: string,
  phaseCompletedMaterials: Record<string, boolean>,
  phaseBatchResults: PhaseBatchResults | null
): '已回填' | '已计算' | '未计算' {
  if (phaseCompletedMaterials[materialId]) return '已回填'
  if (phaseBatchResults?.[materialId]?.valid) return '已计算'
  return '未计算'
}

function buildPhaseAssistTabMaterialIds(
  tabMaterialIds: string[],
  phaseMaterialId: string | null,
  phaseBatchResults: PhaseBatchResults | null
): string[] {
  const ids = new Set(tabMaterialIds)
  if (phaseMaterialId) ids.add(phaseMaterialId)
  if (phaseBatchResults) {
    for (const id of Object.keys(phaseBatchResults)) ids.add(id)
  }
  return [...ids]
}

function dropPhaseBatchResult(
  results: PhaseBatchResults | null,
  materialId: string
): PhaseBatchResults | null {
  if (!results || !results[materialId]) return results
  const next = { ...results }
  delete next[materialId]
  return Object.keys(next).length > 0 ? next : null
}

type SingleLibraryRow = { id: string; libraryMaterialId?: string; name: string; ratios: CopperRatios }
type LibraryDialogElementColumn = { id: string; rawName: string; element: CopperElementKey | null }
type LibraryMaterialDialogMode = 'add' | 'edit'
type EquipmentStageId = 'smelting' | 'converting' | 'refining'
type CopperCaseStageId = Extract<SheetId, 'cu_smelting' | 'cu_converting' | 'cu_refining' | 'cu_equipment'>
type DraftRatioKind = 'raw' | 'solvent' | 'fuel' | 'gas'
type BatchTableView = 'element' | 'phase' | 'productPhase' | 'productElement' | 'balance'
type CopperProcessStageId = Extract<SheetId, 'cu_smelting' | 'cu_converting' | 'cu_refining'>

const COPPER_CASES_STORAGE_KEY = 'metcal.copper.cases.v1'
const METCAL_COPPER_CASE_FILE_TYPE = 'metcal-copper-case'

function normalizeBatchTableView(value: unknown, _productFilledBack = false): BatchTableView {
  if (value === 'phase' || value === 'productPhase') return value
  if (value === 'product') return 'productPhase'
  if (value === 'productElement') return 'productElement'
  if (value === 'balance') return 'balance'
  return 'element'
}

type CopperSmeltMethodId = 'oxy-side-blast' | 'flash'
type ProductConstraintCellValues = Partial<Record<DistributionRuleType, number | string>>
type ProductConstraintRow = {
  element: ConstraintElementKey
}
type CustomConstraintDraft = {
  expr: string
  target: string
}
type ProductConstraintValueDrafts = Record<string, string>

const FIXED_MATTE_COPPER_GRADE = 75
const FUEL_WET_BASIS_WATER_EXPR = 'Input.煤.H2O / Input.煤湿基'
const OXY_DISTRIBUTION_RULE_TYPES: DistributionRuleType[] = ['W%', 'D%']
const OXY_DISTRIBUTION_RULE_LABELS: Record<DistributionRuleType, string> = { 'W%': 'W', 'D%': 'D' }
const OXY_DISTRIBUTION_RULE_OPTIONS: (DistributionRuleType | '')[] = ['', ...OXY_DISTRIBUTION_RULE_TYPES]

function productConstraintCellDraftKey(
  productKey: OxySideBlowProductKey,
  element: string,
  type: DistributionRuleType
) {
  return `${productKey}::${element}::${type}`
}

function cloneOxyConstraintConfig(config: OxySideBlowConstraintConfig): OxySideBlowConstraintConfig {
  return {
    ...config,
    _variableNotes: config._variableNotes ? { ...config._variableNotes } : undefined,
    variables: config.variables ? { ...config.variables } : undefined,
    products: Object.fromEntries(
      Object.entries(config.products).map(([key, product]) => [
        key,
        {
          ...product,
          allowedElements: [...product.allowedElements],
          phases: [...product.phases],
        },
      ])
    ) as OxySideBlowConstraintConfig['products'],
    elementDistributions: config.elementDistributions.map((entry) => ({
      element: entry.element,
      rules: entry.rules.map((rule) => ({ ...rule })),
    })),
    customConstraints: config.customConstraints.map((entry) => ({ ...entry })),
    solverParams: config.solverParams ? { ...config.solverParams } : undefined,
  }
}

function normalizeProductConstraintFixedValues(config: OxySideBlowConstraintConfig): OxySideBlowConstraintConfig {
  const next = cloneOxyConstraintConfig(config)
  delete next._variableNotes
  delete next.variables
  for (const entry of next.elementDistributions) {
    for (const rule of entry.rules) {
      if (rule.value === 'GMC') rule.value = FIXED_MATTE_COPPER_GRADE
    }
  }
  for (const constraint of next.customConstraints) {
    constraint.expr = constraint.expr.replace(/\bGMC\b/g, String(FIXED_MATTE_COPPER_GRADE))
  }
  return next
}

const DEFAULT_OXY_CONSTRAINT_CONFIG = normalizeProductConstraintFixedValues(loadOxySideBlowConstraints())
const PRODUCT_INPUT_PHASE_BLEND_NAME = '\u6df7\u5408\u94dc\u7cbe\u77ff'

function createDefaultProductConstraintConfig(): OxySideBlowConstraintConfig {
  return autoFillOxyProductConstraintConfig(DEFAULT_OXY_CONSTRAINT_CONFIG).config
}

function normalizeOxyConstraintConfig(config: OxySideBlowConstraintConfig | null | undefined): OxySideBlowConstraintConfig {
  const normalized = config
    ? migrateOxyProductConstraintDefaults(normalizeProductConstraintFixedValues(config), DEFAULT_OXY_CONSTRAINT_CONFIG)
    : createDefaultProductConstraintConfig()
  return autoFillOxyProductConstraintConfig(normalized).config
}

function normalizeConstraintRuleValue(value: string): number | string | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const normalized = trimmed.replace(',', '.')
  const numeric = Number(normalized)
  return /^-?(?:\d+\.?\d*|\.\d+)$/.test(normalized) && Number.isFinite(numeric) ? numeric : trimmed
}

function formatConstraintRuleValue(value: number | string | null | undefined, digits = 8) {
  if (value == null) return ''
  if (typeof value === 'number') return Number(value.toFixed(digits)).toString()
  return value
}

function formatConstraintDisplayValue(value: number | string | null | undefined) {
  return formatConstraintRuleValue(value, 2)
}

function formatCustomConstraintDisplayValue(value: number | string | null | undefined) {
  return formatConstraintRuleValue(value, 15)
}

function displayConstraintExpression(expr: string) {
  return expr.replace(/[A-Z][a-z]?(?:\d+[A-Z]?[a-z]?)*\d*/g, (token) => formulaToDisplayLabel(token))
}

function visibleCustomConstraints(config: OxySideBlowConstraintConfig) {
  return config.customConstraints
    .map((constraint, index) => ({ constraint, index }))
    .filter(({ constraint }) => constraint.expr !== FUEL_WET_BASIS_WATER_EXPR)
}



function shiftDraftEntriesAfterRemoval<T>(drafts: Record<number, T>, removedIndex: number): Record<number, T> {
  const next: Record<number, T> = {}
  for (const [key, value] of Object.entries(drafts)) {
    const index = Number(key)
    if (!Number.isInteger(index) || index === removedIndex) continue
    next[index > removedIndex ? index - 1 : index] = value
  }
  return next
}

function productDistributionRuleMap(
  config: OxySideBlowConstraintConfig,
  productKey: OxySideBlowProductKey
): Record<string, ProductConstraintCellValues> {
  const map: Record<string, ProductConstraintCellValues> = {}
  for (const entry of config.elementDistributions) {
    for (const rule of entry.rules) {
      if (rule.product !== productKey) continue
      map[entry.element] = {
        ...map[entry.element],
        [rule.type]: rule.value,
      }
    }
  }
  return map
}

function buildProductConstraintRows(
  config: OxySideBlowConstraintConfig,
  defaultConfig: OxySideBlowConstraintConfig
): ProductConstraintRow[] {
  const elements = new Set<ConstraintElementKey>()
  const collect = (source: OxySideBlowConstraintConfig) => {
    for (const entry of source.elementDistributions) elements.add(entry.element)
  }
  collect(defaultConfig)
  collect(config)
  return sortOxyConstraintElementKeys(elements).map((element) => ({ element }))
}

function upsertProductDistributionRule(
  config: OxySideBlowConstraintConfig,
  productKey: OxySideBlowProductKey,
  element: string,
  type: DistributionRuleType,
  draftValue: string
): OxySideBlowConstraintConfig {
  const next = cloneOxyConstraintConfig(config)
  const elementKey = element.trim()
  if (!elementKey) return next

  const value = normalizeConstraintRuleValue(draftValue) ?? ''
  const distributionIndex = next.elementDistributions.findIndex((entry) => entry.element === elementKey)

  let entry: ElementDistributionEntry
  if (distributionIndex >= 0) {
    entry = next.elementDistributions[distributionIndex]
  } else {
    entry = { element: elementKey, rules: [] }
    next.elementDistributions.push(entry)
  }

  const rule = entry.rules.find((item) => item.product === productKey && item.type === type)
  if (rule) {
    rule.value = value
  } else {
    entry.rules.push({ product: productKey, type, value })
  }
  entry.rules = entry.rules.filter((item) => item.product !== productKey || item.type === type)
  return next
}

function setProductDistributionRuleType(
  config: OxySideBlowConstraintConfig,
  productKey: OxySideBlowProductKey,
  element: string,
  type: DistributionRuleType | ''
): OxySideBlowConstraintConfig {
  const next = cloneOxyConstraintConfig(config)
  const elementKey = element.trim()
  if (!elementKey) return next
  let distributionIndex = next.elementDistributions.findIndex((entry) => entry.element === elementKey)
  if (distributionIndex < 0 && !type) return next
  if (distributionIndex < 0) {
    next.elementDistributions.push({ element: elementKey, rules: [] })
    distributionIndex = next.elementDistributions.length - 1
  }
  const entry = next.elementDistributions[distributionIndex]!
  const currentRule = entry.rules.find((item) => item.product === productKey && item.type === type)
  const fallbackRule = entry.rules.find((item) => item.product === productKey)
  const nextValue = currentRule?.value ?? fallbackRule?.value ?? ''
  entry.rules = entry.rules.filter((item) => item.product !== productKey)
  if (type) entry.rules.push({ product: productKey, type, value: nextValue })
  if (entry.rules.length === 0) next.elementDistributions.splice(distributionIndex, 1)
  return next
}


function updateCustomConstraintEntry(
  config: OxySideBlowConstraintConfig,
  index: number,
  patch: Partial<CustomConstraintEntry>
): OxySideBlowConstraintConfig {
  const next = cloneOxyConstraintConfig(config)
  if (!next.customConstraints[index]) return next
  next.customConstraints[index] = {
    ...next.customConstraints[index],
    ...patch,
  }
  return next
}

function removeCustomConstraintEntry(
  config: OxySideBlowConstraintConfig,
  index: number
): OxySideBlowConstraintConfig {
  const next = cloneOxyConstraintConfig(config)
  next.customConstraints = next.customConstraints.filter((_, itemIndex) => itemIndex !== index)
  return next
}

function addCustomConstraintEntry(
  config: OxySideBlowConstraintConfig,
  expr: string,
  target: string
): OxySideBlowConstraintConfig {
  const trimmedExpr = expr.trim()
  const parsedTarget = normalizeConstraintRuleValue(target)
  if (!trimmedExpr || typeof parsedTarget !== 'number') return cloneOxyConstraintConfig(config)
  const next = cloneOxyConstraintConfig(config)
  next.customConstraints.push({ expr: trimmedExpr, target: parsedTarget })
  return next
}



interface CopperCaseRecord {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  smeltMethodId?: CopperSmeltMethodId
  stageId: CopperCaseStageId
  rawMaterials: CopperMaterialColumn[]
  rawWeightDrafts: Record<string, string>
  solventColumns: CopperMaterialColumn[]
  fuelColumn: CopperFuelMaterial
  oxygenAirColumn: CopperMaterialColumn
  airColumns?: CopperMaterialColumn[]
  targetFeSiO2: string
  targetCaOSiO2: string
  solventSolution: CopperSolventSolution | null
  phaseCompletedMaterials: Record<string, boolean>
  phasePreviewUnknowns: PhasePreviewUnknowns | null
  phaseBatchResults?: PhaseBatchResults | null
  manualPhaseCells: Record<string, boolean>
  manualSolventWeights: Record<string, boolean>
  manualFuelWeightValid: boolean
  manualAirWeightValid?: boolean
  phaseCompleted: boolean
  productCalculated: boolean
  productFilledBack?: boolean
  productSolverResult?: OxyConstraintSolverResult | null
  heatBalanced: boolean
  calculatedHeatBalance?: CopperHeatBalanceResult | null
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
  lossTemperature: string
  heatLossMJh: string
  otherHeatMJh: string
  annualHours: string
  equipmentIntensity: string
  targetScaleWanTpa: string
  equipmentAdjustments: Record<EquipmentStageId, string>
  batchTableView?: BatchTableView
  phaseRatioOverrides?: Record<string, Record<string, string>>
  manualPhaseRatioColumns?: Record<string, boolean>
  productDistributionDrafts?: ProductDistributionDrafts
  productPhaseOverrides?: Record<string, Record<string, string>>
  productPhaseManual?: boolean
  productConstraintConfig?: OxySideBlowConstraintConfig
  customPhaseRows?: Record<string, CustomPhaseRow[]>
  materialPhaseRows?: Record<string, MaterialPhaseAssistRow[]>
  phaseMaterialId?: string | null
  phaseAssistTabMaterialIds?: string[]
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

const PHASE_UNKNOWN_ELEMENTS = new Set<CopperElementKey>(['O(氧)', 'C (碳)', 'Other(其他)'])
/** 投入-物料元素表列可见性：4 位小数四舍五入后为 0 则隐藏 */
const ELEMENT_TABLE_VISIBLE_EPSILON = 5e-5
const COPPER_CONCENTRATE_A_DEFAULT_PHASES = ['FeS2', 'CuFeS2', 'Cu2S', 'SiO2', 'CaO', 'PbS', 'Al2O3', 'Other']

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

function formatTableDisplayValue(value: number | null | undefined) {
  return value == null || !Number.isFinite(value) ? '—' : formatBatchTableDisplay(value)
}

function formatPhaseCell(value: number | null) {
  return formatTableDisplayValue(value)
}

function massThToWeightPercent(massTh: number, feedRateTh: number) {
  if (!Number.isFinite(feedRateTh) || feedRateTh <= 0) return massTh
  return (massTh / feedRateTh) * 100
}

function PhaseAssistPercentCell({
  darkMode,
  percent,
  massTh,
  feedRateTh,
}: {
  darkMode: boolean
  /** 物相 w% 等：直接来自求解结果 */
  percent?: number | null
  /** 质量流量 t/h：直接来自 pivot 求解，不用表格显示值反推 */
  massTh?: number | null
  feedRateTh: number
}) {
  const hasPercent = percent != null && Number.isFinite(percent)
  const hasMass = massTh != null && Number.isFinite(massTh)
  const displayPercent = hasPercent
    ? percent!
    : hasMass && feedRateTh > 0
      ? (massTh! / feedRateTh) * 100
      : null
  if (displayPercent == null || !Number.isFinite(displayPercent)) return <>—</>
  if (!batchTableHasResult(displayPercent)) return <span className="inline text-sm" />
  const tooltipParts = [`w% ${formatBatchTableTooltip(displayPercent)}`]
  if (hasMass && batchTableHasResult(massTh!)) {
    tooltipParts.push(`质量 ${formatBatchTableTooltip(massTh!)} t/h`)
  }
  return (
    <BatchTableNumericReadonly
      darkMode={darkMode}
      value={displayPercent}
      helpTitle={tooltipParts.join('\n')}
      helpTitleExclusive
      className="inline text-sm"
    />
  )
}

function BatchAddSolventControl({
  darkMode,
  onAddSolvent,
}: {
  darkMode: boolean
  onAddSolvent: () => void
}) {
  return (
    <button type="button" className={`${btnSecondary(darkMode)} text-sm`} onClick={onAddSolvent}>
      + 添加熔剂
    </button>
  )
}


const VISIBLE_COPPER_PRODUCT_KEYS: CopperProductKey[] = ['matte', 'slag', 'gas', 'dust']
const COPPER_STAGE_PRODUCT_NAME_OVERRIDES: Record<CopperProcessStageId, Partial<Record<CopperProductKey, string>>> = {
  cu_smelting: {},
  cu_converting: { matte: '粗铜', slag: '吹炼渣' },
  cu_refining: { matte: '阳极铜/精铜', slag: '精炼渣' },
}

type ProductDistributionDrafts = Partial<Record<CopperElementKey, Partial<Record<CopperProductKey, string>>>>

type LibraryElementFilter = {
  id: string
  element: CopperElementKey
  min: string
  max: string
}

function normalizeSearchText(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, '')
}

function materialMatchesLibraryFilter(material: CopperLibraryMaterial, filter: LibraryElementFilter) {
  const value = material.ratios[filter.element] ?? 0
  const min = filter.min.trim() === '' ? null : Number(filter.min)
  const max = filter.max.trim() === '' ? null : Number(filter.max)
  if (min != null && Number.isFinite(min) && value < min) return false
  if (max != null && Number.isFinite(max) && value > max) return false
  return true
}

function filterMaterialLibrary(
  library: CopperLibraryMaterial[],
  query: string,
  filters: LibraryElementFilter[]
) {
  const q = normalizeSearchText(query)
  return library.filter((material) => {
    if (q && !normalizeSearchText(material.name).includes(q)) return false
    return filters.every((filter) => materialMatchesLibraryFilter(material, filter))
  })
}

function createLibraryElementFilter(suffix = 0): LibraryElementFilter {
  return {
    id: `library-filter-${Date.now()}-${suffix}`,
    element: 'Cu(铜)',
    min: '',
    max: '',
  }
}

function phaseValueVisible(value: number | null | undefined) {
  return Number.isFinite(value ?? NaN) && Math.abs(value ?? 0) >= ELEMENT_TABLE_VISIBLE_EPSILON
}

function addVisiblePhaseMapKeys(keys: Set<string>, values: Partial<Record<string, number>> | null | undefined) {
  if (!values) return
  for (const [key, value] of Object.entries(values)) {
    if (phaseValueVisible(value)) keys.add(key)
  }
}

function buildVisiblePhaseRowKeys(params: {
  rawMaterials: CopperMaterialColumn[]
  solventColumns: CopperMaterialColumn[]
  fuelColumn: CopperMaterialColumn
  materialPhaseRows: Record<string, MaterialPhaseAssistRow[]>
  phaseBatchResults: PhaseBatchResults | null
  phaseCompletedMaterials: Record<string, boolean>
  productCalculated: boolean
  productTableColumns: CopperProductTableColumn[]
  productPhaseComposition: Partial<Record<CopperProductKey | 'loss', ProductPhasePercentMap>>
  airColumns: CopperMaterialColumn[]
}) {
  const hasInputMaterial =
    params.rawMaterials.some((material) => material.name.trim()) ||
    params.solventColumns.some((material) => material.name.trim()) ||
    params.fuelColumn.name.trim()
  if (!hasInputMaterial) return [...COPPER_PLACEHOLDER_PHASE_ROW_KEYS]

  const keys = new Set<string>()
  const hasComputedResults =
    params.phaseBatchResults &&
    params.rawMaterials.some(
      (material) => params.phaseCompletedMaterials[material.id] && params.phaseBatchResults?.[material.id]?.valid
    )

  if (hasComputedResults && params.phaseBatchResults) {
    for (const material of params.rawMaterials) {
      const result = params.phaseBatchResults[material.id]
      if (!params.phaseCompletedMaterials[material.id] || !result?.valid) continue
      addVisiblePhaseMapKeys(
        keys,
        mapPhaseContentsToTableKeys(
          result.phaseContents,
          ensureMaterialPhaseRows(params.materialPhaseRows[material.id])
        )
      )
    }
  } else {
    for (const key of collectMaterialPhaseTableKeys(params.rawMaterials, params.materialPhaseRows)) {
      keys.add(key)
    }
  }

  for (const material of params.solventColumns) {
    if (!material.name.trim()) continue
    for (const key of materialPhaseRowTableKeys(createDefaultMaterialPhaseRowsForMaterial(material))) {
      keys.add(key)
    }
  }
  if (params.fuelColumn.name.trim()) {
    for (const key of materialPhaseRowTableKeys(createDefaultMaterialPhaseRowsForMaterial(params.fuelColumn))) {
      keys.add(key)
    }
  }

  if (params.airColumns.some((column) => phaseValueVisible(column.ratios['O(氧)'] ?? 0))) keys.add('O2')
  if (params.airColumns.some((column) => phaseValueVisible(column.ratios['N(氮)'] ?? 0))) keys.add('N2')

  if (params.productCalculated) {
    for (const product of params.productTableColumns) {
      if (product.key === 'total') continue
      if (product.displayMode === 'phases' && product.phases && product.phases.length > 0) {
        addVisiblePhaseMapKeys(
          keys,
          Object.fromEntries(product.phases.map((phase) => [phase.key, phase.pct]))
        )
        continue
      }
      const productKey = product.key as CopperProductKey | 'loss'
      addVisiblePhaseMapKeys(keys, params.productPhaseComposition[productKey] ?? null)
    }
  }

  keys.delete('Other')
  const sorted = sortCopperPhaseKeys(keys)
  const solventOrFuelHasOther =
    params.solventColumns.some((material) => {
      if (!material.name.trim()) return false
      const rows = createDefaultMaterialPhaseRowsForMaterial(material)
      return phaseValueVisible(buildDefaultMaterialPhaseContentsByKey(material.ratios, rows).Other)
    }) ||
    (params.fuelColumn.name.trim()
      ? phaseValueVisible(
          buildDefaultMaterialPhaseContentsByKey(
            params.fuelColumn.ratios,
            createDefaultMaterialPhaseRowsForMaterial(params.fuelColumn)
          ).Other
        )
      : false)
  const hasOther = hasComputedResults
    ? params.rawMaterials.some((material) => {
        const result = params.phaseBatchResults?.[material.id]
        if (!params.phaseCompletedMaterials[material.id] || !result?.valid) return false
        const mapped = mapPhaseContentsToTableKeys(
          result.phaseContents,
          ensureMaterialPhaseRows(params.materialPhaseRows[material.id])
        )
        return phaseValueVisible(mapped.Other)
      }) || solventOrFuelHasOther
    : true
  if (hasOther) sorted.push('Other')
  return sorted.length > 0 ? sorted : [...COPPER_PLACEHOLDER_PHASE_ROW_KEYS]
}

function phaseTableColumnPhaseValue(column: PhaseTableColumn, key: string): number | null {
  if (column.kind === 'oxygen') {
    if (key === 'O2') return column.oxygenAir?.weightPct.O2 ?? 0
    if (key === 'N2') return column.oxygenAir?.weightPct.N2 ?? 0
    if (key === 'H2O') return column.oxygenAir?.weightPct.H2O ?? 0
    return null
  }
  if (column.kind === 'product') {
    if (column.productGasVolume && key in column.productGasVolume) {
      return column.productGasVolume[key] ?? null
    }
    return column.productPhases?.[key] ?? null
  }
  if (column.phaseReady === false) return null
  if (key === 'O2') return column.kind === 'blend' ? column.oxygenAir?.weightPct.O2 ?? 0 : null
  if (key === 'N2') return column.kind === 'blend' ? column.oxygenAir?.weightPct.N2 ?? 0 : null
  if (key === 'H2O') return column.kind === 'blend' ? column.oxygenAir?.weightPct.H2O ?? 0 : null
  if (column.phaseContentsByKey && key in column.phaseContentsByKey) {
    return column.phaseContentsByKey[key] ?? 0
  }
  if (INPUT_PHASE_ROW_KEYS.includes(key as InputPhaseRowKey)) {
    return column.phases?.[key as InputPhaseRowKey] ?? 0
  }
  return null
}

function getPhaseExportValue(column: PhaseTableColumn, key: string) {
  const value = phaseTableColumnPhaseValue(column, key)
  return value == null ? '' : formatTableNumber(value)
}

function phaseExportColumnTotal(column: PhaseTableColumn) {
  if (column.phaseReady === false) return 0
  if (column.kind === 'oxygen') {
    return (
      (column.oxygenAir?.weightPct.O2 ?? 0) +
      (column.oxygenAir?.weightPct.N2 ?? 0) +
      (column.oxygenAir?.weightPct.H2O ?? 0)
    )
  }
  if (column.kind === 'product') {
    if (column.productGasVolume) {
      return Object.values(column.productGasVolume).reduce<number>(
        (sum, value) => sum + (value ?? 0),
        0,
      )
    }
    return Object.values(column.productPhases ?? {}).reduce<number>(
      (sum, value) => sum + (value ?? 0),
      0,
    )
  }
  const phaseTotal = column.phaseContentsByKey
    ? Object.values(column.phaseContentsByKey).reduce((sum, value) => sum + (value ?? 0), 0)
    : INPUT_PHASE_ROW_KEYS.reduce((sum, key) => sum + (column.phases?.[key] ?? 0), 0)
  if (column.kind !== 'blend') return phaseTotal
  return (
    phaseTotal +
    (column.oxygenAir?.weightPct.O2 ?? 0) +
    (column.oxygenAir?.weightPct.N2 ?? 0) +
    (column.oxygenAir?.weightPct.H2O ?? 0)
  )
}

function formatProductDistributionPercent(value: number) {
  return Number((Math.max(0, value) * 100).toFixed(4)).toString()
}

function productModelToDrafts(model: Partial<CopperProductModel> = DEFAULT_COPPER_PRODUCT_MODEL): ProductDistributionDrafts {
  const normalized = normalizeCopperProductModel(model)
  return Object.fromEntries(
    COPPER_ELEMENT_KEYS.map((element) => [
      element,
      Object.fromEntries(
        COPPER_PRODUCT_KEYS.map((productKey) => [
          productKey,
          formatProductDistributionPercent(normalized.distribution[element]?.[productKey] ?? 0),
        ])
      ),
    ])
  ) as ProductDistributionDrafts
}

function cloneProductDistributionDrafts(drafts: ProductDistributionDrafts | undefined): ProductDistributionDrafts {
  const source = drafts && Object.keys(drafts).length > 0 ? drafts : productModelToDrafts(DEFAULT_COPPER_PRODUCT_MODEL)
  return Object.fromEntries(
    COPPER_ELEMENT_KEYS.map((element) => [
      element,
      Object.fromEntries(
        COPPER_PRODUCT_KEYS.map((productKey) => [
          productKey,
          source[element]?.[productKey] ?? formatProductDistributionPercent(DEFAULT_COPPER_PRODUCT_MODEL.distribution[element]?.[productKey] ?? 0),
        ])
      ),
    ])
  ) as ProductDistributionDrafts
}

function productDistributionDraftNumber(value: string | undefined) {
  const parsed = parseFloat(String(value ?? '').replace(',', '.'))
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0
}

function productDistributionDraftsToModel(drafts: ProductDistributionDrafts): CopperProductModel {
  return normalizeCopperProductModel({
    id: DEFAULT_COPPER_PRODUCT_MODEL.id,
    name: DEFAULT_COPPER_PRODUCT_MODEL.name,
    distribution: Object.fromEntries(
      COPPER_ELEMENT_KEYS.map((element) => {
        const row = drafts[element]
        return [
          element,
          Object.fromEntries(
            COPPER_PRODUCT_KEYS.map((productKey) => [
              productKey,
              productDistributionDraftNumber(row?.[productKey]) / 100,
            ])
          ),
        ]
      })
    ) as CopperProductModel['distribution'],
  })
}

type CopperProductTableColumn = {
  key: string
  name: string
  mass: number
  elementWeights: Partial<Record<CopperElementKey, number>>
  composition: Partial<Record<CopperElementKey, number>>
  displayMode?: 'phases' | 'elements'
  phases?: Array<{ key: string; label: string; pct: number; mass: number }>
}

function assistAlertPanelClassName(darkMode: boolean, tone: 'success' | 'warning') {
  const base = 'rounded-lg border p-3 text-sm'
  return tone === 'success'
    ? `${base} ${darkMode ? 'border-emerald-700 bg-emerald-950/30 text-emerald-100' : 'border-emerald-200 bg-emerald-50 text-emerald-900'}`
    : `${base} ${darkMode ? 'border-amber-700 bg-amber-950/30 text-amber-100' : 'border-amber-200 bg-amber-50 text-amber-900'}`
}

function phaseMaterialValidationGuidance(material: Pick<CopperMaterialColumn, 'name' | 'weight'>, error: string) {
  const name = displayRawMaterialName(material.name)
  if (!Number.isFinite(material.weight) || material.weight <= 0) {
    return `无法进入物相成分：请先在配料总表“投料量”行给「${name}」填写大于 0 的投料量 (t/h)，再双击 O₂ / C / Other。`
  }
  return `${error}。请先在配料总表投入-物料元素表中补全对应元素含量，再计算物相成分。`
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

function normalizeCopperSmeltMethodId(methodId?: string): CopperSmeltMethodId {
  return methodId === 'flash' ? 'flash' : 'oxy-side-blast'
}

function formatCopperCaseName(date: Date, methodName: string) {
  return `${methodName}铜冶炼计算 ${formatCopperCaseTimestamp(date)}`
}

function suggestCopperCaseName(methodName: string) {
  return formatCopperCaseName(new Date(), methodName)
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

function nearlyEqual(a: number | undefined, b: number, tolerance = 1e-3) {
  return Math.abs((a ?? 0) - b) <= tolerance
}

function normalizeBuiltInSolventColumn(material: CopperMaterialColumn): CopperMaterialColumn {
  if (material.kind !== 'solvent' || material.id !== 'solvent-silica' || material.name !== '石英石') return material
  const ratios = material.ratios
  const legacySilica =
    nearlyEqual(ratios['Fe(铁)'], 0) &&
    nearlyEqual(ratios['FeO(氧化亚铁)'], 0) &&
    nearlyEqual(ratios['SiO₂(二氧化硅)'], 95) &&
    nearlyEqual(ratios['CaO(氧化钙)'], 0) &&
    nearlyEqual(ratios['MgO(氧化镁)'], 0)
  const convertedSilica =
    nearlyEqual(ratios['FeO(氧化亚铁)'], 0) &&
    nearlyEqual(ratios['Fe(铁)'], 0.4975, 0.01) &&
    nearlyEqual(ratios['SiO₂(二氧化硅)'], 85) &&
    nearlyEqual(ratios['CaO(氧化钙)'], 0.5) &&
    nearlyEqual(ratios['MgO(氧化镁)'], 1)
  if (!legacySilica && !convertedSilica) return material
  const silica = DEFAULT_COPPER_SOLVENTS.find((item) => item.id === 'silica')
  if (!silica) return material
  return { ...material, ratios: solventOxidesToElements(silica.composition), unitPrice: silica.unitPrice }
}

function normalizeBuiltInFuelMaterial(material: CopperFuelMaterial): CopperFuelMaterial {
  const builtInFuelNames = new Set([DEFAULT_COPPER_FUEL.name, '热平衡煤', '燃料煤'])
  if (material.id !== DEFAULT_COPPER_FUEL.id || !builtInFuelNames.has(material.name)) return material
  const ratios = material.ratios
  const legacyFuel =
    nearlyEqual(ratios['C (碳)'], 68) &&
    nearlyEqual(ratios['O(氧)'], 16) &&
    nearlyEqual(ratios['N(氮)'], 2) &&
    nearlyEqual(ratios['S (硫)'], 0.8) &&
    nearlyEqual(ratios['Other(其他)'], 13.2)
  const convertedFuel =
    (nearlyEqual(ratios['FeO(氧化亚铁)'], 0.94, 0.02) ||
      (nearlyEqual(ratios['FeO(氧化亚铁)'], 0) && nearlyEqual(ratios['Fe(铁)'], 0.731, 0.02))) &&
    nearlyEqual(ratios['S (硫)'], 0.86) &&
    nearlyEqual(ratios['SiO₂(二氧化硅)'], 4) &&
    nearlyEqual(ratios['CaO(氧化钙)'], 0.59) &&
    nearlyEqual(ratios['MgO(氧化镁)'], 0.74) &&
    nearlyEqual(ratios['C (碳)'], 60.73) &&
    nearlyEqual(ratios['H(氢)'], 1.45) &&
    nearlyEqual(ratios['O(氧)'], 2.8)
  const dryBasisFuel =
    nearlyEqual(ratios['Fe(铁)'], 0.749, 0.02) &&
    nearlyEqual(ratios['S (硫)'], 0.878, 0.02) &&
    nearlyEqual(ratios['SiO₂(二氧化硅)'], 4.082, 0.02) &&
    nearlyEqual(ratios['CaO(氧化钙)'], 0.602, 0.02) &&
    nearlyEqual(ratios['MgO(氧化镁)'], 0.755, 0.02) &&
    nearlyEqual(ratios['C (碳)'], 61.965, 0.02) &&
    nearlyEqual(ratios['H(氢)'], 1.25, 0.02) &&
    nearlyEqual(ratios['O(氧)'], 1.322, 0.02) &&
    nearlyEqual(ratios['N(氮)'], 0.728, 0.02)
  if (!legacyFuel && !convertedFuel && !dryBasisFuel) return material
  return {
    ...material,
    name: DEFAULT_COPPER_FUEL.name,
    ratios: { ...DEFAULT_COPPER_FUEL.ratios },
    moisture: DEFAULT_COPPER_FUEL.moisture,
    ash: DEFAULT_COPPER_FUEL.ash,
    unitPrice: DEFAULT_COPPER_FUEL.unitPrice,
  }
}

const DEFAULT_OXYGEN_AIR_O2_TEXT = String(DEFAULT_COPPER_OXYGEN_AIR_SETTINGS.oxygenPct)
const DEFAULT_OXYGEN_AIR_N2_TEXT = String(DEFAULT_COPPER_OXYGEN_AIR_SETTINGS.nitrogenPct)

function isLegacyDefaultOxygenAirText(oxygenText?: string, nitrogenText?: string): boolean {
  const oxygen = toNumber(oxygenText ?? '', Number.NaN)
  const nitrogen = toNumber(nitrogenText ?? '', Number.NaN)
  return (
    (nearlyEqual(oxygen, 70) && nearlyEqual(nitrogen, 30)) ||
    (nearlyEqual(oxygen, 100) && nearlyEqual(nitrogen, 0))
  )
}

function normalizeOxygenAirText(oxygenText?: string, nitrogenText?: string): { oxygen: string; nitrogen: string } {
  if (!oxygenText || !nitrogenText || isLegacyDefaultOxygenAirText(oxygenText, nitrogenText)) {
    return { oxygen: DEFAULT_OXYGEN_AIR_O2_TEXT, nitrogen: DEFAULT_OXYGEN_AIR_N2_TEXT }
  }
  return { oxygen: oxygenText, nitrogen: nitrogenText }
}

function cloneMaterialColumn(material: CopperMaterialColumn): CopperMaterialColumn {
  return normalizeBuiltInSolventColumn(migrateMaterialWaterWeight({
    ...material,
    ratios: { ...material.ratios },
  }))
}

function cloneFuelMaterial(material: CopperFuelMaterial): CopperFuelMaterial {
  const shouldKeepDefaultMoisture =
    material.id === DEFAULT_COPPER_FUEL.id &&
    Math.max(0, material.weight) <= 0 &&
    material.waterWeight == null &&
    (material.moisture ?? 0) > 0
  const cloned = normalizeBuiltInFuelMaterial(migrateMaterialWaterWeight({
    ...material,
    ratios: { ...material.ratios },
  }) as CopperFuelMaterial)
  return shouldKeepDefaultMoisture ? { ...cloned, moisture: material.moisture } : cloned
}

function cloneSolventSolution(solution: CopperSolventSolution | null): CopperSolventSolution | null {
  if (!solution) return null
  return {
    ...solution,
    solventWeights: { ...solution.solventWeights },
  }
}

function cloneOxySolverResult(result: OxyConstraintSolverResult): OxyConstraintSolverResult {
  return JSON.parse(JSON.stringify(result)) as OxyConstraintSolverResult
}

function cloneHeatBalanceResult(result: CopperHeatBalanceResult): CopperHeatBalanceResult {
  return JSON.parse(JSON.stringify(result)) as CopperHeatBalanceResult
}

function normalizeHeatBalanceResult(value: unknown): CopperHeatBalanceResult | null {
  const result = value as CopperHeatBalanceResult | null | undefined
  if (!result || typeof result !== 'object') return null
  if (
    !Array.isArray(result.equations) ||
    !Array.isArray(result.heatIncomeRows) ||
    !Array.isArray(result.heatExpenditureRows) ||
    !Array.isArray(result.inputPhysicalRows) ||
    !Array.isArray(result.outputPhysicalRows)
  ) return null
  if (
    typeof result.inputPhysicalHeatMJh !== 'number' ||
    typeof result.outputPhysicalHeatMJh !== 'number' ||
    typeof result.chemicalHeatMJh !== 'number' ||
    typeof result.heatDeficitMJh !== 'number' ||
    typeof result.requiredFuelWeight !== 'number'
  ) return null
  return cloneHeatBalanceResult(result)
}

function normalizeOxySolverAcceptance(result: OxyConstraintSolverResult): OxyConstraintSolverResult {
  const allProductsClosed = OXY_SIDE_BLOW_PRODUCT_KEYS.every((key) => {
    const product = result.products?.[key]
    return product ? verifyOxyProductElementTotals(product) : false
  })
  const acceptanceLevel =
    result.acceptanceLevel ?? classifyOxyConstraintAcceptance(result.maxRelativeResidual, allProductsClosed)
  return {
    ...result,
    acceptanceLevel,
    acceptable: result.acceptable ?? acceptanceLevel !== 'failed',
  }
}

function verifyOxyProductElementTotals(product: OxyConstraintSolverResult['products'][OxySideBlowProductKey], tolerance = 0.5): boolean {
  const total = Object.values(product.composition ?? {}).reduce((sum, value) => sum + (value ?? 0), 0)
  return Math.abs(total - 100) <= tolerance || product.mass <= 0
}

function normalizeOxySolverResult(value: unknown): OxyConstraintSolverResult | null {
  const result = value as OxyConstraintSolverResult | null | undefined
  if (!result || typeof result !== 'object') return null
  if (typeof result.valid !== 'boolean' || !result.products || typeof result.products !== 'object') return null
  if (typeof result.totalProductMass !== 'number') return null
  if (!result.recommended || typeof result.recommended !== 'object') return null
  if (!Array.isArray(result.constraintResiduals)) return null
  const hasProducts = OXY_SIDE_BLOW_PRODUCT_KEYS.every((key) => {
    const product = result.products[key]
    return (
      product &&
      typeof product.name === 'string' &&
      typeof product.mass === 'number' &&
      Array.isArray(product.phases) &&
      product.elementMass &&
      product.composition
    )
  })
  return hasProducts ? normalizeOxySolverAcceptance(cloneOxySolverResult(result)) : null
}

function buildProductSolverInputPhaseMass(
  rawMaterials: CopperMaterialColumn[],
  phaseBatchResults: PhaseBatchResults | null | undefined,
  materialPhaseRows: Record<string, MaterialPhaseAssistRow[]>
): Record<string, Record<string, number>> | undefined {
  const validPhaseResults = rawMaterials
    .map((material) => phaseBatchResults?.[material.id])
    .filter((result): result is PhaseMaterialCalcResult => Boolean(result?.valid))
  if (validPhaseResults.length === 0) return undefined
  return {
    [PRODUCT_INPUT_PHASE_BLEND_NAME]: buildBlendPhaseMassFromMaterialResults(validPhaseResults, materialPhaseRows),
  }
}

const OXY_PRODUCT_SOLVER_MAX_PASSES = 3

function applyOxySolverRecommendedInputs(params: {
  result: OxyConstraintSolverResult
  fuelColumn: CopperFuelMaterial
  solventColumns: CopperMaterialColumn[]
  airColumns: CopperMaterialColumn[]
}) {
  const fuelColumn = cloneFuelMaterial({
    ...params.fuelColumn,
    weight: params.result.recommended.fuelWeight,
    waterWeight: params.result.recommended.fuelWaterWeight,
    moisture: params.result.recommended.fuelMoisture,
  })
  const solventColumns = params.solventColumns.map((column) =>
    cloneMaterialColumn({
      ...column,
      weight: params.result.recommended.solventWeights[column.name] ?? column.weight,
    })
  )
  const airColumns = params.airColumns.map((column) =>
    cloneMaterialColumn({
      ...column,
      weight: params.result.recommended.gasWeights[column.name] ?? column.weight,
    })
  )
  return { fuelColumn, solventColumns, airColumns }
}

function solveOxySideBlowProductsIterative(params: {
  rawMaterials: CopperMaterialColumn[]
  rawFeed: ReturnType<typeof calculateWeightedComposition>
  concentrateMass: number
  inputPhaseMass?: Record<string, Record<string, number>>
  fuelColumn: CopperFuelMaterial
  solventColumns: CopperMaterialColumn[]
  airColumns: CopperMaterialColumn[]
  config: OxySideBlowConstraintConfig
}): { result: OxyConstraintSolverResult; passes: number; fuelColumn: CopperFuelMaterial; solventColumns: CopperMaterialColumn[]; airColumns: CopperMaterialColumn[] } {
  let fuelColumn = cloneFuelMaterial(params.fuelColumn)
  let solventColumns = params.solventColumns.map(cloneMaterialColumn)
  let airColumns = params.airColumns.map(cloneMaterialColumn)
  let best: OxyConstraintSolverResult | null = null
  let bestInputs = { fuelColumn, solventColumns, airColumns }
  let passes = 0

  const acceptanceRank = (result: OxyConstraintSolverResult) =>
    result.acceptanceLevel === 'strict' ? 0 : result.acceptanceLevel === 'relaxed' ? 1 : 2
  const isBetterResult = (candidate: OxyConstraintSolverResult, current: OxyConstraintSolverResult | null) => {
    if (!current) return true
    const candidateRank = acceptanceRank(candidate)
    const currentRank = acceptanceRank(current)
    if (candidateRank !== currentRank) return candidateRank < currentRank
    return candidate.maxRelativeResidual < current.maxRelativeResidual
  }

  for (let pass = 0; pass < OXY_PRODUCT_SOLVER_MAX_PASSES; pass += 1) {
    passes = pass + 1
    const blendFeed = calculateWeightedComposition([
      ...params.rawMaterials,
      ...solventColumns,
      fuelColumn,
      ...airColumns,
    ])
    const result = solveOxySideBlowProducts({
      blendFeed,
      rawFeed: params.rawFeed,
      rawMaterialColumns: params.rawMaterials,
      concentrateMass: params.concentrateMass,
      inputPhaseMass: params.inputPhaseMass,
      fuelColumn,
      solventColumns,
      airColumns,
      config: params.config,
    })
    const nextInputs = applyOxySolverRecommendedInputs({ result, fuelColumn, solventColumns, airColumns })

    if (isBetterResult(result, best)) {
      best = result
      bestInputs = nextInputs
    }
    fuelColumn = nextInputs.fuelColumn
    solventColumns = nextInputs.solventColumns
    airColumns = nextInputs.airColumns

    if (result.acceptanceLevel === 'strict') break
  }

  if (!best) {
    throw new Error('产出求解未生成结果')
  }
  return { result: best, passes, ...bestInputs }
}

function restoreProductCalculationFromCaseState(params: {
  rawMaterials: CopperMaterialColumn[]
  solventColumns: CopperMaterialColumn[]
  fuelColumn: CopperFuelMaterial
  airColumns: CopperMaterialColumn[]
  phaseBatchResults: PhaseBatchResults | null | undefined
  materialPhaseRows: Record<string, MaterialPhaseAssistRow[]>
  productConstraintConfig: OxySideBlowConstraintConfig
}):
  | {
      result: OxyConstraintSolverResult
      fuelColumn: CopperFuelMaterial
      solventColumns: CopperMaterialColumn[]
      airColumns: CopperMaterialColumn[]
    }
  | null {
  if (
    calculateWeightedComposition([
      ...params.rawMaterials,
      ...params.solventColumns,
      params.fuelColumn,
      ...params.airColumns,
    ]).totalWeight <= 0
  ) return null
  try {
    const restored = solveOxySideBlowProductsIterative({
      rawMaterials: params.rawMaterials,
      rawFeed: calculateWeightedComposition(params.rawMaterials),
      concentrateMass: params.rawMaterials.reduce((sum, material) => sum + Math.max(0, material.weight), 0),
      inputPhaseMass: buildProductSolverInputPhaseMass(
        params.rawMaterials,
        params.phaseBatchResults,
        params.materialPhaseRows
      ),
      fuelColumn: params.fuelColumn,
      solventColumns: params.solventColumns,
      airColumns: params.airColumns,
      config: params.productConstraintConfig,
    })
    return {
      result: restored.result,
      fuelColumn: restored.fuelColumn,
      solventColumns: restored.solventColumns,
      airColumns: restored.airColumns,
    }
  } catch {
    return null
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

function normalizeImportedCopperCase(payload: unknown, methodName: string): CopperCaseRecord | null {
  const maybePayload = payload as { type?: string; case?: unknown }
  const record = maybePayload?.type === METCAL_COPPER_CASE_FILE_TYPE ? maybePayload.case : payload
  const candidate = record as Partial<CopperCaseRecord> | null
  if (!candidate || typeof candidate.name !== 'string' || !Array.isArray(candidate.rawMaterials)) return null
  const now = new Date()
  const airColumns = normalizeProcessAirColumns(candidate.airColumns, candidate.oxygenAirColumn)
  return {
    ...candidate,
    id: createCopperCaseId(now),
    name: candidate.name.trim() || suggestCopperCaseName(methodName),
    createdAt: candidate.createdAt ?? now.toISOString(),
    updatedAt: now.toISOString(),
    stageId: normalizeCopperCaseStageId(candidate.stageId),
    rawMaterials: candidate.rawMaterials.map(cloneMaterialColumn),
    rawWeightDrafts: candidate.rawWeightDrafts ?? {},
    solventColumns: (candidate.solventColumns ?? createDefaultSolventColumns()).map(cloneMaterialColumn),
    fuelColumn: candidate.fuelColumn ? cloneFuelMaterial(candidate.fuelColumn) : cloneFuelMaterial(DEFAULT_COPPER_FUEL),
    oxygenAirColumn: airColumns[0] ? cloneMaterialColumn(airColumns[0]) : createOxygenAirColumn(),
    airColumns,
    targetFeSiO2: candidate.targetFeSiO2 ?? '2.8',
    targetCaOSiO2: candidate.targetCaOSiO2 ?? '0.45',
    solventSolution: cloneSolventSolution(candidate.solventSolution ?? null),
    phaseCompletedMaterials: candidate.phaseCompletedMaterials ?? {},
    phasePreviewUnknowns: candidate.phasePreviewUnknowns ?? null,
    phaseBatchResults: candidate.phaseBatchResults ?? null,
    manualPhaseCells: candidate.manualPhaseCells ?? {},
    manualSolventWeights: candidate.manualSolventWeights ?? {},
    manualFuelWeightValid: candidate.manualFuelWeightValid ?? false,
    manualAirWeightValid: candidate.manualAirWeightValid ?? false,
    phaseCompleted: candidate.phaseCompleted ?? false,
    productCalculated: candidate.productCalculated ?? false,
    productFilledBack: candidate.productFilledBack ?? candidate.productCalculated ?? false,
    productSolverResult: normalizeOxySolverResult(candidate.productSolverResult),
    heatBalanced: candidate.heatBalanced ?? false,
    calculatedHeatBalance: normalizeHeatBalanceResult(candidate.calculatedHeatBalance),
    fuelLhv: candidate.fuelLhv ?? String(DEFAULT_COPPER_FUEL.lowerHeatingValueMJkg),
    fuelEfficiency: candidate.fuelEfficiency ?? String(DEFAULT_COPPER_FUEL.combustionEfficiency),
    oxygenAirO2Pct: normalizeOxygenAirText(candidate.oxygenAirO2Pct, candidate.oxygenAirN2Pct).oxygen,
    oxygenAirN2Pct: normalizeOxygenAirText(candidate.oxygenAirO2Pct, candidate.oxygenAirN2Pct).nitrogen,
    oxygenSupplyCoefficient: candidate.oxygenSupplyCoefficient ?? '1.15',
    feedTemperature: candidate.feedTemperature ?? '25',
    matteTemperature: candidate.matteTemperature ?? '1300',
    slagTemperature: candidate.slagTemperature ?? '1350',
    gasTemperature: candidate.gasTemperature ?? '1350',
    dustTemperature: candidate.dustTemperature ?? '1350',
    lossTemperature: candidate.lossTemperature ?? '1350',
    heatLossMJh: candidate.heatLossMJh ?? '1500',
    otherHeatMJh: candidate.otherHeatMJh ?? '0',
    annualHours: candidate.annualHours ?? '7200',
    equipmentIntensity: candidate.equipmentIntensity ?? '32',
    targetScaleWanTpa: candidate.targetScaleWanTpa ?? '10',
    equipmentAdjustments: candidate.equipmentAdjustments ?? { smelting: '1', converting: '1', refining: '1' },
    batchTableView: normalizeBatchTableView(
      candidate.batchTableView,
      candidate.productFilledBack ?? candidate.productCalculated ?? false
    ),
    phaseRatioOverrides: candidate.phaseRatioOverrides ?? {},
    manualPhaseRatioColumns: candidate.manualPhaseRatioColumns ?? {},
    productDistributionDrafts: cloneProductDistributionDrafts(candidate.productDistributionDrafts),
    productPhaseOverrides: candidate.productPhaseOverrides ?? {},
    productPhaseManual: candidate.productPhaseManual ?? false,
    productConstraintConfig: normalizeOxyConstraintConfig(candidate.productConstraintConfig),
    customPhaseRows: candidate.customPhaseRows ?? {},
    materialPhaseRows: candidate.materialPhaseRows ?? {},
    phaseMaterialId: candidate.phaseMaterialId ?? null,
    phaseAssistTabMaterialIds: candidate.phaseAssistTabMaterialIds ?? [],
    smeltMethodId: normalizeCopperSmeltMethodId(candidate.smeltMethodId),
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
  return format(v, 4)
}

function displaySolventName(name: string) {
  return name === '石灰' ? '石灰石' : name
}

function displayFuelName(name: string) {
  const trimmed = name.trim()
  if (!trimmed || trimmed === '煤' || trimmed === '热平衡煤' || trimmed === '燃料煤') return DEFAULT_COPPER_FUEL.name
  return trimmed
}

function displayRawMaterialName(name: string) {
  return name.trim() || '请选择'
}

function canDeletePhaseAssistRow(row: MaterialPhaseAssistRow) {
  return row.kind !== 'other'
}

/** 配料总表存储化验：不自动补 Other，留待物相计算回填 */
function normalizeMaterialRatios(ratios: CopperRatios): Record<CopperElementKey, number> {
  return closeCopperRatios(ratios, { fillOther: false, scaleWhenOver100: false })
}

function createSingleLibraryRow(suffix = 0): SingleLibraryRow {
  const timestamp = Date.now()
  return {
    id: `library-row-${timestamp}-${suffix}`,
    name: '',
    ratios: emptyCopperRatios(),
  }
}

function createLibraryDialogElementColumn(rawName = '', suffix = 0): LibraryDialogElementColumn {
  const timestamp = Date.now()
  return {
    id: `library-col-${timestamp}-${suffix}`,
    rawName,
    element: rawName.trim() ? resolveCopperElementKey(rawName) : null,
  }
}

function createDefaultLibraryDialogColumns(): LibraryDialogElementColumn[] {
  return [
    createLibraryDialogElementColumn('Cu', 0),
    createLibraryDialogElementColumn('S', 1),
    createLibraryDialogElementColumn('Fe', 2),
  ]
}

function libraryDialogColumnsFromRatios(ratios: CopperRatios): LibraryDialogElementColumn[] {
  const timestamp = Date.now()
  const columns = COPPER_ELEMENT_KEYS
    .filter((element) => element !== 'Other(其他)' && (ratios[element] ?? 0) > 0)
    .map((element, index) => ({
      id: `library-col-${timestamp}-${index}`,
      rawName: element.replace(/\(.+\)/, '').trim(),
      element,
    }))
  return columns.length > 0 ? columns : createDefaultLibraryDialogColumns()
}

function libraryRatioDraftKey(rowId: string, element: CopperElementKey) {
  return `library:${rowId}:${element}`
}

function libraryRowEnteredTotal(row: SingleLibraryRow) {
  return calculateKnownTotal(row.ratios) + Math.max(0, row.ratios['Other(其他)'] ?? 0)
}

function libraryRowDisplayTotal(
  row: SingleLibraryRow,
  elementColumns: LibraryDialogElementColumn[],
  drafts: Record<string, string>
) {
  let total = 0
  for (const column of elementColumns) {
    if (!column.element) continue
    const key = libraryRatioDraftKey(row.id, column.element)
    const draft = drafts[key]
    if (draft !== undefined) {
      if (isValidNumberText(draft)) total += Math.max(0, toNumber(draft, 0))
    } else {
      total += Math.max(0, row.ratios[column.element] ?? 0)
    }
  }
  const otherKey = libraryRatioDraftKey(row.id, 'Other(其他)')
  const otherDraft = drafts[otherKey]
  if (otherDraft !== undefined) {
    if (isValidNumberText(otherDraft)) total += Math.max(0, toNumber(otherDraft, 0))
  } else {
    total += Math.max(0, row.ratios['Other(其他)'] ?? 0)
  }
  return total
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

function solveInputClass(dark: boolean, status: SolveInputStatus) {
  const warning = dark
    ? 'border-red-500 bg-red-950/20 ring-1 ring-red-500/60 focus:border-red-400 focus:ring-red-400'
    : 'border-red-400 bg-red-50/70 ring-1 ring-red-300 focus:border-red-500 focus:ring-red-400'
  const attention = dark
    ? 'border-amber-400 ring-1 ring-amber-400/70 focus:border-amber-300 focus:ring-amber-300'
    : 'border-amber-400 ring-1 ring-amber-300 focus:border-amber-500 focus:ring-amber-400'
  const resolved = dark
    ? 'border-emerald-500 bg-emerald-950/20 ring-1 ring-emerald-500/60 focus:border-emerald-400 focus:ring-emerald-400'
    : 'border-emerald-500 bg-emerald-50/80 ring-1 ring-emerald-300 focus:border-emerald-600 focus:ring-emerald-400'
  const stateClass = status === 'resolved' ? resolved : status === 'pending' ? warning : status === 'attention' ? attention : ''
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

const WORKFLOW_FLOW_STEPS = ['原料', '原料投料量', '投入物相', '熔剂/空气/煤', '产出计算', '热平衡'] as const
const HEAT_BALANCE_CALCULATION_STEPS = ['读取温度与热焓', '配平反应热', '汇总热收入/支出', '反算燃料煤'] as const
type WorkflowStepStatus = 'completed' | 'active' | 'pending'

function workflowStepMessage(step: number, message: string) {
  return `步骤 ${step}/6：${message}`
}

function WorkflowFlowStrip({
  darkMode,
  steps,
}: {
  darkMode: boolean
  steps: { label: string; status: WorkflowStepStatus }[]
}) {
  return (
    <div className={`rounded-md border px-4 py-3 ${darkMode ? 'border-gray-600 bg-gray-800/25' : 'border-gray-200 bg-white'}`}>
      <div className={`text-sm font-medium leading-relaxed ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
        计算流程
      </div>
      <div
        className={`mt-3 flex w-full min-w-0 items-stretch gap-1 text-sm ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}
      >
        {steps.map((step, index) => {
          const badgeClass =
            step.status === 'completed'
              ? darkMode
                ? 'bg-emerald-900/50 text-emerald-100'
                : 'bg-emerald-100 text-emerald-800'
              : step.status === 'active'
                ? darkMode
                  ? 'bg-blue-900/50 text-blue-100'
                  : 'bg-blue-100 text-blue-800'
                : darkMode
                  ? 'bg-gray-700/80 text-gray-400'
                  : 'bg-gray-100 text-gray-600'
          const statusSuffix =
            step.status === 'completed' ? ' ✓' : step.status === 'active' ? ' …' : ''
          return (
            <Fragment key={step.label}>
              {index > 0 && (
                <span
                  aria-hidden="true"
                  className={`flex shrink-0 items-center px-0.5 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}
                >
                  →
                </span>
              )}
              <span
                className={`flex flex-1 items-center justify-center whitespace-nowrap rounded-md px-2 py-1.5 text-center text-sm leading-snug ${badgeClass}`}
              >
                {index + 1}. {step.label}
                {statusSuffix}
              </span>
            </Fragment>
          )
        })}
      </div>
    </div>
  )
}

function IteratingOverlay({
  darkMode,
  title = '计算中',
  description = '请稍候…',
  steps,
  currentStep = 0,
}: {
  darkMode: boolean
  title?: string
  description?: string
  steps?: string[]
  currentStep?: number
}) {
  const activeDescription =
    steps && steps.length > 0 ? steps[Math.min(currentStep, steps.length - 1)] ?? description : description
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 px-4" role="status" aria-live="polite">
      <div className={`w-full max-w-md rounded-lg border px-5 py-4 shadow-xl ${darkMode ? 'border-blue-700 bg-gray-900 text-blue-100' : 'border-blue-200 bg-white text-blue-900'}`}>
        <div className="flex items-start gap-3">
          <span className="mt-0.5 h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">{title}</div>
            <div className={`mt-1 text-xs ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>{activeDescription}</div>
            {steps && steps.length > 1 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {steps.map((label, index) => (
                  <span
                    key={label}
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      index <= currentStep
                        ? darkMode
                          ? 'bg-blue-800 text-blue-100'
                          : 'bg-blue-100 text-blue-800'
                        : darkMode
                          ? 'bg-gray-800 text-gray-500'
                          : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {index + 1}. {label}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

type WorkflowMessageTone = 'success' | 'flow' | 'warning' | 'error'

type WorkflowMessageState = {
  text: string
  tone: WorkflowMessageTone
} | null

function getElectronExportWorkbookSaver():
  | ((fileName: string, content: string) => Promise<{ ok: boolean; cancelled?: boolean; error?: string; filePath?: string }>)
  | undefined {
  return (
    window as {
      electronAPI?: {
        exportWorkbookToFile?: (
          fileName: string,
          content: string
        ) => Promise<{ ok: boolean; cancelled?: boolean; error?: string; filePath?: string }>
      }
    }
  ).electronAPI?.exportWorkbookToFile
}

function workflowToastStyles(darkMode: boolean, tone: WorkflowMessageTone) {
  if (tone === 'success') {
    return darkMode
      ? 'border-emerald-500 bg-gray-900 text-emerald-100'
      : 'border-emerald-300 bg-white text-emerald-900'
  }
  if (tone === 'error') {
    return darkMode ? 'border-red-500 bg-gray-900 text-red-100' : 'border-red-400 bg-white text-red-700'
  }
  return darkMode ? 'border-amber-500 bg-gray-900 text-amber-100' : 'border-amber-300 bg-white text-amber-900'
}

function workflowToastTitle(tone: WorkflowMessageTone) {
  if (tone === 'success') return '已完成'
  if (tone === 'error') return '错误'
  if (tone === 'warning') return '警示'
  return '提示'
}

function workflowToastCloseClass(darkMode: boolean, tone: WorkflowMessageTone) {
  if (tone === 'success') {
    return darkMode ? 'text-emerald-100 hover:bg-gray-800' : 'text-emerald-900 hover:bg-emerald-50'
  }
  if (tone === 'error') {
    return darkMode ? 'text-red-100 hover:bg-gray-800' : 'text-red-700 hover:bg-red-50'
  }
  return darkMode ? 'text-amber-100 hover:bg-gray-800' : 'text-amber-900 hover:bg-amber-50'
}

function WorkflowMessageToast({
  darkMode,
  message,
  tone = 'flow',
  onClose,
}: {
  darkMode: boolean
  message: string | null
  tone?: WorkflowMessageTone
  onClose: () => void
}) {
  if (!message) return null
  return (
    <div className="fixed right-4 top-4 z-[60] w-[min(28rem,calc(100vw-2rem))]" role="alert" aria-live="assertive">
      <div className={`rounded-lg border px-4 py-3 pr-10 text-sm shadow-xl ${workflowToastStyles(darkMode, tone)}`}>
        <div className="font-semibold">{workflowToastTitle(tone)}</div>
        <div className="mt-1 leading-relaxed">{message}</div>
        <button
          type="button"
          aria-label="关闭提示"
          title="关闭提示"
          onClick={onClose}
          className={`absolute right-2.5 top-2.5 flex h-7 w-7 items-center justify-center rounded-md text-lg leading-none ${workflowToastCloseClass(darkMode, tone)}`}
        >
          ×
        </button>
      </div>
    </div>
  )
}

function materialSelectClass(dark: boolean, status: SolveInputStatus = 'none') {
  const warning = dark
    ? 'border-red-500 bg-red-950/20 ring-1 ring-red-500/60 focus:border-red-400 focus:ring-red-400'
    : 'border-red-400 bg-red-50/70 ring-1 ring-red-300 focus:border-red-500 focus:ring-red-400'
  return `h-9 w-full whitespace-nowrap rounded border px-2 text-center text-[13px] leading-normal ${
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

function SearchIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="m16.5 16.5 4 4" />
    </svg>
  )
}

export default function CopperWorkflow({
  darkMode,
  language = 'zh',
  activeSheet,
  onStageSelect,
  smeltMethodId,
  smeltMethodName,
  caseTitleDraft,
  onActiveCaseNameChange,
}: CopperWorkflowProps) {
  const isEn = language === 'en'
  const normalizedSmeltMethodId = normalizeCopperSmeltMethodId(smeltMethodId)
  const [rawMaterials, setRawMaterials] = useState<CopperMaterialColumn[]>(() => createDefaultCopperMaterials())
  const [rawWeightDrafts, setRawWeightDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(createDefaultCopperMaterials().map((material) => [material.id, '']))
  )
  const [waterWeightDrafts, setWaterWeightDrafts] = useState<Record<string, string>>({})
  const [solventColumns, setSolventColumns] = useState<CopperMaterialColumn[]>(() => createDefaultSolventColumns())
  const [materialLibrary, setMaterialLibrary] = useState<CopperLibraryMaterial[]>(() => [...COPPER_MATERIAL_LIBRARY])
  const [showLibrary, setShowLibrary] = useState(false)
  const [libraryImportError, setLibraryImportError] = useState<string | null>(null)
  const [librarySearchQuery, setLibrarySearchQuery] = useState('')
  const [libraryElementFilters, setLibraryElementFilters] = useState<LibraryElementFilter[]>([])
  const [libraryPage, setLibraryPage] = useState(1)
  const [libraryPageSize, setLibraryPageSize] = useState<number>(DEFAULT_LIST_PAGE_SIZE)
  const [casePage, setCasePage] = useState(1)
  const [casePageSize, setCasePageSize] = useState<number>(DEFAULT_LIST_PAGE_SIZE)
  const [showSingleLibraryAddDialog, setShowSingleLibraryAddDialog] = useState(false)
  const [libraryMaterialDialogMode, setLibraryMaterialDialogMode] = useState<LibraryMaterialDialogMode>('add')
  const [libraryDialogMessage, setLibraryDialogMessage] = useState<string | null>(null)
  const [singleLibraryRows, setSingleLibraryRows] = useState<SingleLibraryRow[]>(() => [createSingleLibraryRow()])
  const [dialogElementColumns, setDialogElementColumns] = useState<LibraryDialogElementColumn[]>(() =>
    createDefaultLibraryDialogColumns()
  )
  const [libraryRatioDrafts, setLibraryRatioDrafts] = useState<Record<string, string>>({})
  const [phaseMaterialId, setPhaseMaterialId] = useState<string | null>(null)
  const [phaseAssistTabMaterialIds, setPhaseAssistTabMaterialIds] = useState<string[]>([])
  const [phaseCompletedMaterials, setPhaseCompletedMaterials] = useState<Record<string, boolean>>({})
  const [phasePreviewUnknowns, setPhasePreviewUnknowns] = useState<PhasePreviewUnknowns | null>(null)
  const [phaseBatchResults, setPhaseBatchResults] = useState<PhaseBatchResults | null>(null)
  const [manualPhaseCells, setManualPhaseCells] = useState<Record<string, boolean>>({})
  const [manualSolventWeights, setManualSolventWeights] = useState<Record<string, boolean>>({})
  const [manualFuelWeightValid, setManualFuelWeightValid] = useState(false)
  const [ratioDrafts, setRatioDrafts] = useState<Record<string, string>>({})
  const [phaseCompleted, setPhaseCompleted] = useState(false)
  const [showElementAssist, setShowElementAssist] = useState(false)
  const [showProductCalculationAssist, setShowProductCalculationAssist] = useState(false)
  const [showHeatBalanceAssist, setShowHeatBalanceAssist] = useState(false)
  const [heatBalanceEngaged, setHeatBalanceEngaged] = useState(false)

  const [elementTableView, setElementTableView] = useState<CopperElementDisplayMode>('compound')
  const [phaseElementView, setPhaseElementView] = useState<CopperElementDisplayMode>('compound')
  const [productElementTableView, setProductElementTableView] = useState<CopperElementDisplayMode>('compound')
  const [productCalculated, setProductCalculated] = useState(false)
  const [productFilledBack, setProductFilledBack] = useState(false)
  const [oxySolverResult, setOxySolverResult] = useState<OxyConstraintSolverResult | null>(null)
  const [isProductCalculating, setIsProductCalculating] = useState(false)
  const [productCalculationStep, setProductCalculationStep] = useState(0)
  const resetProductCalculation = useCallback(() => {
    setProductCalculated(false)
    setProductFilledBack(false)
    setOxySolverResult(null)
  }, [])
  useEffect(() => {
    if (!productCalculated) setOxySolverResult(null)
  }, [productCalculated])
  const [workflowMessage, setWorkflowMessageState] = useState<WorkflowMessageState>(null)
  const setWorkflowMessage = useCallback((text: string | null, tone: WorkflowMessageTone = 'flow') => {
    if (text === null) {
      setWorkflowMessageState(null)
      return
    }
    setWorkflowMessageState({ text, tone })
  }, [])

  useEffect(() => {
    if (!workflowMessage) return
    const delayMs = workflowMessage.tone === 'error' || workflowMessage.tone === 'warning' ? 6000 : 4000
    const timer = window.setTimeout(() => setWorkflowMessage(null), delayMs)
    return () => window.clearTimeout(timer)
  }, [workflowMessage, setWorkflowMessage])

  const [allCaseRecords, setAllCaseRecords] = useState<CopperCaseRecord[]>(() => sortCopperCaseRecords(readCopperCaseRecords()))
  const caseRecords = useMemo(
    () =>
      allCaseRecords.filter(
        (record) => normalizeCopperSmeltMethodId(record.smeltMethodId) === normalizedSmeltMethodId
      ),
    [allCaseRecords, normalizedSmeltMethodId]
  )
  const caseTotalPages = pageCountFor(caseRecords.length, casePageSize)
  const normalizedCasePage = Math.min(Math.max(1, casePage), caseTotalPages)
  const pagedCaseRecords = useMemo(() => {
    const start = (normalizedCasePage - 1) * casePageSize
    return caseRecords.slice(start, start + casePageSize)
  }, [caseRecords, casePageSize, normalizedCasePage])
  const caseVisibleStart = caseRecords.length === 0 ? 0 : (normalizedCasePage - 1) * casePageSize + 1
  const caseVisibleEnd = Math.min(caseRecords.length, normalizedCasePage * casePageSize)
  useEffect(() => {
    if (casePage !== normalizedCasePage) {
      setCasePage(normalizedCasePage)
    }
  }, [casePage, normalizedCasePage])
  const [activeCaseId, setActiveCaseId] = useState<string | null>(null)
  const [caseMessage, setCaseMessage] = useState<string | null>(null)
  const [editingCaseNameId, setEditingCaseNameId] = useState<string | null>(null)
  const [editingCaseNameDraft, setEditingCaseNameDraft] = useState('')
  const skipCaseNameBlurCommitRef = useRef(false)

  useEffect(() => {
    if (!caseMessage) return
    const timer = window.setTimeout(() => setCaseMessage(null), 4000)
    return () => window.clearTimeout(timer)
  }, [caseMessage])

  const [caseDropActive, setCaseDropActive] = useState(false)
  const caseDropDepthRef = useRef(0)
  const [pendingNavigationSheet, setPendingNavigationSheet] = useState<SheetId | null>(null)
  const [newCaseName, setNewCaseName] = useState(() => suggestCopperCaseName(smeltMethodName))
  const [targetFeSiO2, setTargetFeSiO2] = useState('2.8')
  const [targetCaOSiO2, setTargetCaOSiO2] = useState('0.45')
  const [solventSolution, setSolventSolution] = useState<CopperSolventSolution | null>(null)
  const [fuelColumn, setFuelColumn] = useState<CopperFuelMaterial>(() => ({
    ...DEFAULT_COPPER_FUEL,
    ratios: { ...DEFAULT_COPPER_FUEL.ratios },
  }))
  const [airColumns, setAirColumns] = useState<CopperMaterialColumn[]>(() => createProcessAirColumns())
  const oxygenAirColumn = airColumns.find((column) => column.airRole === 'oxygen') ?? airColumns[0] ?? createOxygenAirColumn()
  const [fuelLhv, setFuelLhv] = useState(String(DEFAULT_COPPER_FUEL.lowerHeatingValueMJkg))
  const [fuelEfficiency, setFuelEfficiency] = useState(String(DEFAULT_COPPER_FUEL.combustionEfficiency))
  const [oxygenAirO2Pct, setOxygenAirO2Pct] = useState(DEFAULT_OXYGEN_AIR_O2_TEXT)
  const [oxygenAirN2Pct, setOxygenAirN2Pct] = useState(DEFAULT_OXYGEN_AIR_N2_TEXT)
  const [oxygenSupplyCoefficient, setOxygenSupplyCoefficient] = useState('1.15')
  const [feedTemperature, setFeedTemperature] = useState('25')
  const [matteTemperature, setMatteTemperature] = useState('1300')
  const [slagTemperature, setSlagTemperature] = useState('1350')
  const [gasTemperature, setGasTemperature] = useState('1350')
  const [dustTemperature, setDustTemperature] = useState('1350')
  const [lossTemperature, setLossTemperature] = useState('1350')
  const [heatLossMJh, setHeatLossMJh] = useState('1500')
  const [otherHeatMJh, setOtherHeatMJh] = useState('0')
  const [heatBalanced, setHeatBalanced] = useState(false)
  const [isHeatBalanceCalculating, setIsHeatBalanceCalculating] = useState(false)
  const [heatBalanceCalculationStep, setHeatBalanceCalculationStep] = useState(0)
  const [calculatedHeatBalance, setCalculatedHeatBalance] = useState<CopperHeatBalanceResult | null>(null)
  useEffect(() => {
    if (!heatBalanced) setCalculatedHeatBalance(null)
  }, [heatBalanced])
  const [productConstraintConfig, setProductConstraintConfig] = useState<OxySideBlowConstraintConfig>(() =>
    createDefaultProductConstraintConfig()
  )
  const [productConstraintValueDrafts, setProductConstraintValueDrafts] = useState<ProductConstraintValueDrafts>({})
  const [openProductConstraintRuleMenu, setOpenProductConstraintRuleMenu] = useState<string | null>(null)
  const [customConstraintTargetDrafts, setCustomConstraintTargetDrafts] = useState<Record<number, string>>({})
  const [customConstraintExprDrafts, setCustomConstraintExprDrafts] = useState<Record<number, string>>({})
  const [newCustomConstraintDraft, setNewCustomConstraintDraft] = useState<CustomConstraintDraft>({
    expr: '',
    target: '',
  })
  const [manualAirWeightValid, setManualAirWeightValid] = useState(false)
  const [isPhaseCalculating, setIsPhaseCalculating] = useState(false)
  const [batchTableHighlight, setBatchTableHighlight] = useState(false)
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
  const [inputPhaseDrafts, setInputPhaseDrafts] = useState<Record<string, Record<string, string>>>({})
  const [invalidInputPhaseColumns, setInvalidInputPhaseColumns] = useState<Record<string, boolean>>({})
  const [productDistributionDrafts, setProductDistributionDrafts] = useState<ProductDistributionDrafts>(() =>
    productModelToDrafts(DEFAULT_COPPER_PRODUCT_MODEL)
  )
  const [productPhaseOverrides, setProductPhaseOverrides] = useState<Record<string, Record<string, string>>>({})
  const [productPhaseManual, setProductPhaseManual] = useState(false)
  const [outputPhaseDrafts, setOutputPhaseDrafts] = useState<Record<string, Record<string, string>>>({})
  const [invalidOutputPhaseColumns, setInvalidOutputPhaseColumns] = useState<Record<string, boolean>>({})

  const calculationTableRef = useRef<HTMLDivElement>(null)
  const elementAssistRef = useRef<HTMLDivElement>(null)
  const phaseAssistContainerRef = useRef<HTMLDivElement>(null)
  const [phaseAssistViewportWidth, setPhaseAssistViewportWidth] = useState(0)
  const productCalculationRef = useRef<HTMLDivElement>(null)
  const heatBalanceRef = useRef<HTMLDivElement>(null)
  const caseImportInputRef = useRef<HTMLInputElement>(null)
  const stagePageTopRef = useRef<HTMLDivElement>(null)
  const previousActiveSheetRef = useRef<SheetId>(activeSheet)
  const [stageEnterHighlight, setStageEnterHighlight] = useState(false)

  const rawBlend = useMemo(() => calculateWeightedComposition(rawMaterials), [rawMaterials])
  const rawConcentrateBlend = useMemo(
    () =>
      calculateWeightedComposition(
        rawMaterials.map((material) => ({
          ...material,
          waterWeight: 0,
          moisture: 0,
        }))
      ),
    [rawMaterials]
  )
  const rawConcentrateWaterWeight = useMemo(() => totalWaterWeight(rawMaterials), [rawMaterials])
  const furnaceFeed = useMemo(
    () => calculateWeightedComposition([...rawMaterials, ...solventColumns, fuelColumn, ...airColumns]),
    [rawMaterials, solventColumns, fuelColumn, airColumns]
  )
  const furnaceDryFeed = useMemo(
    () =>
      calculateWeightedComposition(
        [...rawMaterials, ...solventColumns, fuelColumn, ...airColumns].map((material) => ({
          ...material,
          waterWeight: 0,
          moisture: 0,
        }))
      ),
    [rawMaterials, solventColumns, fuelColumn, airColumns]
  )
  const hasProductResult = productCalculated && Boolean(oxySolverResult)
  const closeProductConstraintRuleMenu = useCallback(() => setOpenProductConstraintRuleMenu(null), [])
  useEffect(() => {
    if (!openProductConstraintRuleMenu) return
    const handlePointerDown = (event: MouseEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest('[data-product-constraint-rule-menu]')) {
        closeProductConstraintRuleMenu()
      }
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeProductConstraintRuleMenu()
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [closeProductConstraintRuleMenu, openProductConstraintRuleMenu])

  const productConstraintRows = useMemo(
    () => buildProductConstraintRows(productConstraintConfig, DEFAULT_OXY_CONSTRAINT_CONFIG),
    [productConstraintConfig.elementDistributions]
  )
  const updateProductConstraintConfig = useCallback(
    (updater: (config: OxySideBlowConstraintConfig) => OxySideBlowConstraintConfig) => {
      setProductConstraintConfig((prev) => updater(prev))
      resetProductCalculation()
      setHeatBalanced(false)
    },
    [resetProductCalculation]
  )
  useEffect(() => {
    if ((productConstraintConfig.version ?? 0) >= DEFAULT_OXY_CONSTRAINT_CONFIG.version) return
    updateProductConstraintConfig((prev) =>
      autoFillOxyProductConstraintConfig(
        migrateOxyProductConstraintDefaults(normalizeProductConstraintFixedValues(prev), DEFAULT_OXY_CONSTRAINT_CONFIG)
      ).config
    )
  }, [productConstraintConfig.version, updateProductConstraintConfig])

  useEffect(() => {
    if (batchTableView === 'balance') {
      window.requestAnimationFrame(() => {
        heatBalanceRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
      return
    }
    if (batchTableView === 'productPhase' || batchTableView === 'productElement') {
      window.requestAnimationFrame(() => {
        const target = hasProductResult ? calculationTableRef.current : productCalculationRef.current
        if (!hasProductResult) setShowProductCalculationAssist(true)
        target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
      return
    }
    calculationTableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [batchTableView, hasProductResult])
  const blendMoistureColumns = useMemo(
    () => [
      ...rawMaterials,
      ...solventColumns,
      { ...fuelColumn, moisture: fuelColumn.moisture ?? 0 },
    ],
    [fuelColumn, rawMaterials, solventColumns]
  )
  const furnaceBlendWaterWeight = useMemo(
    () => totalWaterWeight(blendMoistureColumns),
    [blendMoistureColumns]
  )
  const productModel = useMemo(
    () => productDistributionDraftsToModel(productDistributionDrafts),
    [productDistributionDrafts]
  )
  const staticProductResult = useMemo(() => calculateCopperProducts(furnaceFeed, productModel), [furnaceFeed, productModel])
  const productResult = useMemo(
    () => (productCalculated && oxySolverResult ? oxySolverToCopperProductResult(oxySolverResult) : staticProductResult),
    [productCalculated, oxySolverResult, staticProductResult]
  )
  const concentrateMass = useMemo(
    () => rawMaterials.reduce((sum, m) => sum + Math.max(0, m.weight), 0),
    [rawMaterials]
  )
  const heatFuel = useMemo<CopperFuelMaterial>(
    () => ({
      ...fuelColumn,
      lowerHeatingValueMJkg: toNumber(fuelLhv, DEFAULT_COPPER_FUEL.lowerHeatingValueMJkg),
      combustionEfficiency: toNumber(fuelEfficiency, DEFAULT_COPPER_FUEL.combustionEfficiency),
    }),
    [fuelColumn, fuelEfficiency, fuelLhv]
  )

  const rawWeightStatus = (materialId: string): SolveInputStatus =>
    isValidNumberText(rawWeightDrafts[materialId] ?? '') ? 'resolved' : 'pending'

  const ratioDraftKey = (kind: DraftRatioKind, id: string, element: CopperElementKey) => `${kind}:${id}:${element}`
  const waterWeightDraftKey = (kind: 'raw' | 'solvent' | 'fuel', id: string) => `${kind}:${id}`
  const waterWeightStatus = (kind: 'raw' | 'solvent' | 'fuel', id: string, value: number | undefined): SolveInputStatus => {
    const draft = waterWeightDrafts[waterWeightDraftKey(kind, id)]
    if (draft != null && draft.trim() !== '') {
      return isValidNumberText(draft) && toNumber(draft, 0) > 0 ? 'resolved' : 'pending'
    }
    return (value ?? 0) > 0 ? 'resolved' : 'pending'
  }
  const phaseTableColumnKeys = useMemo(
    () => getPhaseTableColumnKeys(phaseElementView),
    [phaseElementView]
  )
  const ratioInputValue = (
    kind: DraftRatioKind,
    id: string,
    element: CopperElementKey,
    value: number | undefined
  ) => ratioDrafts[ratioDraftKey(kind, id, element)] ?? (value ?? 0)

  const phaseCellKey = (materialId: string, element: CopperElementKey) => `${materialId}:${element}`
  const phaseCellStatus = (material: CopperMaterialColumn, element: CopperElementKey): SolveInputStatus => {
    if (!PHASE_UNKNOWN_ELEMENTS.has(element)) return 'none'
    if (!material.name.trim()) return 'none'
    return phaseCompletedMaterials[material.id] || manualPhaseCells[phaseCellKey(material.id, element)] ? 'resolved' : 'pending'
  }

  const solventWeightStatus = (materialId: string): SolveInputStatus =>
    manualSolventWeights[materialId] ? 'resolved' : 'pending'

  const fuelWeightStatus = (): SolveInputStatus => (manualFuelWeightValid ? 'resolved' : 'pending')

  const mixIndicators = useMemo(() => {
    const cu = rawBlend.ratios['Cu(铜)'] ?? 0
    const s = rawBlend.ratios['S (硫)'] ?? 0
    const fe = rawBlend.ratios['Fe(铁)'] ?? 0
    const si = rawBlend.ratios['SiO₂(二氧化硅)'] ?? 0
    const ca = rawBlend.ratios['CaO(氧化钙)'] ?? 0
    return [
      { label: 'Cu/S', value: s > 0 ? cu / s : null, note: '铜硫比' },
      { label: 'Fe/Si', value: si > 0 ? fe / si : null, note: '铁硅比' },
      { label: 'Ca/Si', value: si > 0 ? ca / si : null, note: '钙硅比' },
      { label: 'Cu/Fe', value: fe > 0 ? cu / fe : null, note: '铜铁比' },
    ]
  }, [rawBlend])

  const selectedPhaseMaterial = rawMaterials.find((material) => material.id === phaseMaterialId) ?? null
  const activeStage = STAGES.find((stage) => stage.id === activeSheet) ?? STAGES[0]
  const isCopperProcessSheet = activeSheet === 'cu_smelting' || activeSheet === 'cu_converting' || activeSheet === 'cu_refining'
  const activeProcessStageId = isCopperProcessSheet ? normalizeProcessStageId(activeSheet) : 'cu_smelting'
  const activeCase = activeCaseId ? caseRecords.find((record) => record.id === activeCaseId) ?? null : null
  const allRawMaterialsSelected = rawMaterials.every((material) => material.name.trim())
  const allPhaseMaterialsCompleted = rawMaterials.every(
    (material) =>
      material.name.trim() &&
      validateMaterialForPhaseCalc(material) === null &&
      (phaseCompletedMaterials[material.id] ||
        (['O(氧)', 'C (碳)', 'Other(其他)'] as CopperElementKey[]).every((element) => manualPhaseCells[phaseCellKey(material.id, element)]))
  )
  const allRawMaterialsWeighed = rawMaterials.every((material) => material.name.trim() && material.weight > 0)
  const heatInputValid = [
    feedTemperature,
    matteTemperature,
    slagTemperature,
    gasTemperature,
    dustTemperature,
    lossTemperature,
    heatLossMJh,
    otherHeatMJh,
    fuelLhv,
    fuelEfficiency,
    oxygenAirO2Pct,
    oxygenAirN2Pct,
    oxygenSupplyCoefficient,
  ].every(isValidNumberText)
  const workflowFlowSteps = useMemo(() => {
    const stepFlags = [
      allRawMaterialsSelected,
      allRawMaterialsWeighed,
      allPhaseMaterialsCompleted,
      productCalculated,
      productCalculated,
      heatBalanced,
    ]
    const firstIncomplete = stepFlags.findIndex((value) => !value)
    const allDone = firstIncomplete === -1
    return WORKFLOW_FLOW_STEPS.map((label, index) => ({
      label,
      status: (allDone || index < firstIncomplete
        ? 'completed'
        : index === firstIncomplete
          ? 'active'
          : 'pending') as WorkflowStepStatus,
    }))
  }, [allPhaseMaterialsCompleted, allRawMaterialsSelected, allRawMaterialsWeighed, heatBalanced, productCalculated])
  const tableProductResult = productResult
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
  const productColumns = useMemo(
    () => visibleCopperProductEntries(displayProductResult) as CopperProductTableColumn[],
    [displayProductResult]
  )
  const productSummary = useMemo(() => productSummaryColumn(displayProductResult), [displayProductResult])
  const productLoss = useMemo(() => productLossColumn(furnaceFeed.totalWeight, productSummary.mass), [furnaceFeed.totalWeight, productSummary.mass])
  const constraintProductTableColumns = useMemo(() => {
    if (!oxySolverResult?.acceptable || !productFilledBack) return null
    return [...oxyProductTableColumns(oxySolverResult), productSummary]
  }, [oxySolverResult, productFilledBack, productSummary])
  const productTableColumns = useMemo(
    () => constraintProductTableColumns ?? [...productColumns, productLoss, productSummary],
    [constraintProductTableColumns, productColumns, productLoss, productSummary]
  )
  const rawMaterialElementKeys = useMemo(() => visibleCopperElementKeys(rawMaterials), [rawMaterials])
  const elementTableKeys = useMemo(
    () =>
      visibleCopperElementKeys(
        [...rawMaterials, ...solventColumns, fuelColumn, ...airColumns],
        COPPER_PLACEHOLDER_ELEMENT_KEYS,
        ELEMENT_TABLE_VISIBLE_EPSILON,
        COPPER_ELEMENT_TABLE_ALWAYS_INCLUDE
      ),
    [rawMaterials, solventColumns, fuelColumn, airColumns]
  )
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
    if (oxySolverResult?.acceptable && productFilledBack) {
      const oxyMaps = oxyProductPhasePercentMaps(oxySolverResult)
      const gasPhases = { ...oxyMaps.flueGas }
      for (const [phase, pct] of Object.entries(oxyMaps.fugitive)) {
        gasPhases[phase] = (gasPhases[phase] ?? 0) + (pct ?? 0)
      }
      return {
        matte: oxyMaps.matte,
        slag: oxyMaps.smeltingSlag,
        gas: gasPhases,
        dust: oxyMaps.dust,
        loss: oxyMaps.loss,
      } as Record<CopperProductKey, ProductPhasePercentMap>
    }
    const overrides = Object.fromEntries(
      (Object.entries(parsedProductPhaseOverrides).filter(([, value]) => value != null) as [CopperProductKey, ProductPhasePercentMap][])
    )
    return calculateProductPhaseComposition(displayProductResult, overrides)
  }, [displayProductResult, oxySolverResult, parsedProductPhaseOverrides, productFilledBack])
  const phaseTableRowKeys = useMemo(
    () =>
      buildVisiblePhaseRowKeys({
        rawMaterials,
        solventColumns,
        fuelColumn,
        materialPhaseRows,
        phaseBatchResults,
        phaseCompletedMaterials,
        productCalculated: false,
        productTableColumns,
        productPhaseComposition,
        airColumns,
      }),
    [
      airColumns,
      materialPhaseRows,
      phaseBatchResults,
      phaseCompletedMaterials,
      productFilledBack,
      productPhaseComposition,
      productTableColumns,
      solventColumns,
      rawMaterials,
      fuelColumn,
    ]
  )
  const inputPhaseColumnData = useMemo(() => {
    const blendSolidPhaseKeys = phaseTableRowKeys.filter((key) => key !== 'O2' && key !== 'N2')
    type BuildPhaseColumnOptions = {
      moisture?: number
      waterWeight?: number
      materialRows?: MaterialPhaseAssistRow[]
      phaseContentsByKey?: Record<string, number> | null
    }
    const buildColumn = (
      id: string,
      kind: PhaseTableColumn['kind'],
      header: string,
      subHeader: string,
      weight: number,
      ratios: CopperRatios,
      options: BuildPhaseColumnOptions = {}
    ): PhaseTableColumn => {
      const { moisture = 0, waterWeight = 0, materialRows = [], phaseContentsByKey: directPhaseContentsByKey = null } = options
      const manual = manualPhaseRatioColumns[id] === true
      const overrides = manual ? storedPhaseOverridesToMap(phaseRatioOverrides[id]) : null
      const rowKeys = materialRows.length > 0 ? materialPhaseRowTableKeys(materialRows) : undefined
      const batchResult = kind === 'raw' ? phaseBatchResults?.[id] : undefined
      const phaseReady =
        kind !== 'raw' || manual || Boolean(phaseCompletedMaterials[id] && batchResult?.valid)
      const computedPhaseContentsByKey =
        phaseReady && batchResult?.valid && materialRows.length > 0
          ? mapPhaseContentsToTableKeys(batchResult.phaseContents, materialRows)
          : null
      const phaseContentsByKey = directPhaseContentsByKey ?? computedPhaseContentsByKey
      return {
        id,
        kind,
        header,
        subHeader,
        weight,
        moisture,
        waterWeight,
        phases: buildInputPhaseColumn(ratios, {}, overrides),
        phaseContentsByKey,
        materialPhaseRowKeys: rowKeys,
        phaseReady,
      }
    }
    const rawColumns = rawMaterials.map((material, index) =>
      buildColumn(
        material.id,
        'raw',
        `原料${index + 1}`,
        displayRawMaterialName(material.name),
        material.weight,
        material.ratios,
        {
          moisture: material.moisture ?? 0,
          waterWeight: materialWaterWeight(material),
          materialRows: ensureMaterialPhaseRows(materialPhaseRows[material.id]),
        }
      )
    )
    const solventCols = solventColumns.map((material, index) => {
      const materialRows = createDefaultMaterialPhaseRowsForMaterial(material)
      return buildColumn(
        material.id,
        'solvent',
        `熔剂${index + 1}`,
        displaySolventName(material.name),
        material.weight,
        material.ratios,
        {
          moisture: material.moisture ?? 0,
          waterWeight: materialWaterWeight(material),
          materialRows,
          phaseContentsByKey: buildDefaultMaterialPhaseContentsByKey(material.ratios, materialRows),
        }
      )
    })
    const fuelMaterialRows = createDefaultMaterialPhaseRowsForMaterial(fuelColumn)
    const fuelCol = buildColumn(
      fuelColumn.id,
      'fuel',
      '燃料煤',
      displayFuelName(fuelColumn.name),
      fuelColumn.weight,
      fuelColumn.ratios,
      {
        moisture: fuelColumn.moisture ?? 0,
        waterWeight: materialWaterWeight(fuelColumn),
        materialRows: fuelMaterialRows,
        phaseContentsByKey: buildDefaultMaterialPhaseContentsByKey(fuelColumn.ratios, fuelMaterialRows),
      }
    )
    const airCols: PhaseTableColumn[] = airColumns.map((column) => ({
      id: column.id,
      kind: 'oxygen' as const,
      header: '气',
      subHeader: column.name,
      weight: column.weight,
      waterWeight: materialWaterWeight(column),
      moisture: column.moisture ?? 0,
      oxygenAir: buildOxygenAirPhaseColumn(column.ratios, column.weight, materialWaterWeight(column)),
    }))
    const furnaceBlend = buildFurnaceBlendPhaseColumn([
      ...rawColumns
        .filter((column) => column.weight > 0 && column.phases && column.phaseReady !== false)
        .map((column) => ({
          weight: column.weight,
          phases: column.phases!,
          moisture: column.moisture ?? 0,
          waterWeight: materialWaterWeight(column),
        })),
      ...solventCols
        .filter((column) => column.weight > 0 && column.phases)
        .map((column) => ({
          weight: column.weight,
          phases: column.phases!,
          moisture: column.moisture ?? 0,
          waterWeight: materialWaterWeight(column),
        })),
      {
        weight: fuelCol.weight,
        phases: fuelCol.phases!,
        moisture: fuelCol.moisture ?? 0,
        waterWeight: materialWaterWeight(fuelCol),
      },
      ...airCols.map((column) => ({
        weight: column.weight,
        oxygenWeightPct: {
          O2: airColumns.find((item) => item.id === column.id)?.ratios['O(氧)'] ?? 0,
          N2: airColumns.find((item) => item.id === column.id)?.ratios['N(氮)'] ?? 0,
          H2O: column.oxygenAir?.weightPct.H2O ?? 0,
        },
      })),
    ])
    const blendPhaseContentsByKey = (() => {
      const sources = [...rawColumns, ...solventCols, fuelCol].filter(
        (column) => column.weight > 0 && column.phases && column.phaseReady !== false
      )
      const solidWeight = sources.reduce((sum, column) => sum + Math.max(0, column.weight), 0)
      const gasWeight = airCols.reduce((sum, column) => sum + Math.max(0, column.weight), 0)
      const totalWeight = solidWeight + gasWeight
      if (totalWeight <= 0) return null
      const totals: Record<string, number> = Object.fromEntries(blendSolidPhaseKeys.map((key) => [key, 0]))
      for (const column of sources) {
        const sourcePhaseContents =
          column.phaseContentsByKey ??
          Object.fromEntries(
            INPUT_PHASE_ROW_KEYS.map((key) => [key, Math.max(0, column.phases?.[key] ?? 0)])
          )
        const weight = Math.max(0, column.weight)
        for (const key of blendSolidPhaseKeys) {
          totals[key] = (totals[key] ?? 0) + weight * Math.max(0, sourcePhaseContents[key] ?? 0)
        }
      }
      return Object.fromEntries(blendSolidPhaseKeys.map((key) => [key, (totals[key] ?? 0) / totalWeight]))
    })()
    const blendCol: PhaseTableColumn = {
      id: 'blend',
      kind: 'blend',
      header: '混料',
      subHeader: '混料',
      weight: Math.max(0, furnaceFeed.totalWeight - furnaceBlendWaterWeight),
      moisture: furnaceBlend.moisture,
      waterWeight: furnaceBlendWaterWeight,
      phases: furnaceBlend.phases,
      phaseContentsByKey: blendPhaseContentsByKey,
      applicablePhaseKeys: blendSolidPhaseKeys,
      materialPhaseRowKeys: blendSolidPhaseKeys,
      oxygenAir: { weightPct: furnaceBlend.gasWeightPct, volumePct: { O2: 0, N2: 0, H2O: 0 } },
      readOnly: true,
    }
    return [...rawColumns, ...solventCols, fuelCol, ...airCols, blendCol]
  }, [
    airColumns,
    furnaceBlendWaterWeight,
    furnaceFeed.totalWeight,
    fuelColumn,
    manualPhaseRatioColumns,
    materialPhaseRows,
    phaseBatchResults,
    phaseCompletedMaterials,
    phaseTableRowKeys,
    phaseRatioOverrides,
    rawMaterials,
    solventColumns,
  ])
  const outputPhaseColumnData = useMemo(
    (): PhaseTableColumn[] =>
      productTableColumns.flatMap((product) => {
        if (product.key === 'total') return []
        const directPhases =
          product.displayMode === 'phases' && product.phases && product.phases.length > 0
            ? Object.fromEntries(product.phases.map((phase) => [phase.key, phase.pct]))
            : null
        const directPhaseMasses =
          product.displayMode === 'phases' && product.phases && product.phases.length > 0
            ? Object.fromEntries(product.phases.map((phase) => [phase.key, phase.mass]))
            : null
        const legacyProductKey = product.key in PRODUCT_PHASE_ROWS ? (product.key as CopperProductKey) : null
        const phaseMap =
          directPhases ??
          (product.key === 'loss'
            ? productPhaseComposition.loss
            : legacyProductKey
              ? productPhaseComposition[legacyProductKey]
              : undefined)
        const phaseRowKeys =
          product.displayMode === 'phases' && product.phases && product.phases.length > 0
            ? product.phases.map((phase) => phase.key)
            : legacyProductKey
              ? PRODUCT_PHASE_ROWS[legacyProductKey]
              : Object.keys(phaseMap ?? {})
        return [{
          id: product.key,
          kind: 'product' as const,
          header: '产物',
          subHeader: getStageProductName(activeProcessStageId, product),
          weight: productFilledBack ? product.mass : 0,
          productKey: product.key,
          productPhases: phaseMap,
          productPhaseMasses: directPhaseMasses ?? undefined,
          productPhaseRowKeys: phaseRowKeys,
          productGasVolume:
            product.key === 'gas' || product.key === 'flueGas' || product.key === 'fugitive'
              ? calculateGasVolumePercents(phaseMap ?? {})
              : undefined,
          readOnly: true,
        }]
      }),
    [activeProcessStageId, productFilledBack, productPhaseComposition, productTableColumns]
  )
  const outputPhaseRowKeys = useMemo(() => {
    if (!productFilledBack) return []
    const keys = new Set<string>()
    for (const column of outputPhaseColumnData) {
      for (const key of column.productPhaseRowKeys ?? Object.keys(column.productPhases ?? {})) {
        if (phaseValueVisible(column.productPhases?.[key] ?? 0)) keys.add(key)
      }
    }
    if (keys.size === 0) {
      for (const column of outputPhaseColumnData) {
        for (const key of column.productPhaseRowKeys ?? []) keys.add(key)
      }
    }
    return sortCopperPhaseKeys(keys)
  }, [outputPhaseColumnData, productFilledBack])
  const outputProductElementKeys = useMemo(() => {
    if (!productFilledBack) return []
    const keys = new Set<CopperElementKey>()
    for (const product of productTableColumns) {
      if (product.key === 'total') continue
      for (const element of COPPER_ELEMENT_KEYS) {
        if (phaseValueVisible(product.composition[element] ?? 0)) keys.add(element)
      }
    }
    return keys.size > 0
      ? (sortCopperElementKeys(keys) as CopperElementKey[])
      : ([...COPPER_PLACEHOLDER_ELEMENT_KEYS] as CopperElementKey[])
  }, [productFilledBack, productTableColumns])
  const outputProductElementRows = useMemo<ProductElementTableProduct[]>(
    () =>
      productFilledBack
        ? productTableColumns
            .filter((product) => product.key !== 'total')
            .map((product) => ({
              key: product.key,
              name: product.name === '总计' ? '总计' : getStageProductName(activeProcessStageId, product),
              mass: product.mass,
              composition: product.composition,
            }))
        : [],
    [activeProcessStageId, productFilledBack, productTableColumns]
  )
  const heatInputMaterials = useMemo<CopperHeatBalanceSourceMaterial[]>(() => {
    const materialById = new Map<string, CopperMaterialColumn>([
      ...rawMaterials.map((material) => [material.id, material] as const),
      ...solventColumns.map((material) => [material.id, material] as const),
      [fuelColumn.id, fuelColumn],
      ...airColumns.map((material) => [material.id, material] as const),
    ])
    return inputPhaseColumnData.flatMap((column) => {
      if (column.kind === 'blend' || column.kind === 'concentrate') return []
      const material = materialById.get(column.id)
      if (!material || material.weight <= 0) return []
      if (column.kind === 'oxygen') {
        return [
          sourceMaterialFromColumn(material, {
            O2: column.oxygenAir?.weightPct.O2 ?? 0,
            N2: column.oxygenAir?.weightPct.N2 ?? 0,
          }),
        ]
      }
      if (column.phaseReady === false) return []
      const phaseContents = column.phaseContentsByKey ?? column.phases ?? {}
      return [sourceMaterialFromColumn(material, phaseContents as Record<string, number>)]
    })
  }, [airColumns, fuelColumn, inputPhaseColumnData, rawMaterials, solventColumns])
  const heatBalance = useMemo(
    () =>
      calculateCopperHeatBalanceDetailed({
        inputMaterials: heatInputMaterials,
        products: productFilledBack ? oxySolverResult : null,
        fuel: heatFuel,
        temperatures: {
          feed: toNumber(feedTemperature, 25),
          smeltingSlag: toNumber(slagTemperature, 1350),
          matte: toNumber(matteTemperature, 1300),
          flueGas: toNumber(gasTemperature, 1350),
          dust: toNumber(dustTemperature, 1350),
          fugitive: toNumber(gasTemperature, 1350),
          loss: toNumber(lossTemperature, 1350),
        },
        heatLossMJh: toNumber(heatLossMJh, 1500),
        otherHeatMJh: toNumber(otherHeatMJh, 0),
      }),
    [
      dustTemperature,
      feedTemperature,
      gasTemperature,
      heatFuel,
      heatInputMaterials,
      heatLossMJh,
      lossTemperature,
      matteTemperature,
      otherHeatMJh,
      oxySolverResult,
      productFilledBack,
      slagTemperature,
    ]
  )
  const heatInputDryWeight = useMemo(
    () => heatInputMaterials.reduce((sum, material) => sum + Math.max(0, material.dryWeight), 0),
    [heatInputMaterials]
  )
  const heatMatteMass = productFilledBack && oxySolverResult?.acceptable ? oxySolverResult.products.matte.mass : 0
  const visibleHeatBalance = heatBalanced ? calculatedHeatBalance : null
  const oxygenAirInputStatus: SolveInputStatus = manualAirWeightValid || productCalculated ? 'resolved' : 'pending'
  const rawColumnWidth = (material: CopperMaterialColumn) => Math.max(104, Math.min(136, 72 + Math.min(displayRawMaterialName(material.name).length, 7) * 9))
  const batchTableNameLabels = useMemo(() => {
    const labels = [
      ...rawMaterials.map((material) => displayRawMaterialName(material.name)),
      '混合铜精矿',
      ...solventColumns.map((material) => displaySolventName(material.name)),
      displayFuelName(fuelColumn.name),
      ...airColumns.map((column) => column.name),
      '投入（年）',
    ]
    if (productFilledBack) {
      labels.push(
        ...productTableColumns.map((product) =>
          product.name === '总计' ? '总计' : getStageProductName(activeProcessStageId, product)
        )
      )
    }
    for (const column of inputPhaseColumnData) {
      labels.push(column.subHeader || column.header)
    }
    for (const column of outputPhaseColumnData) {
      labels.push(column.subHeader || column.header)
    }
    return labels
  }, [
    activeProcessStageId,
    airColumns,
    fuelColumn.name,
    inputPhaseColumnData,
    outputPhaseColumnData,
    productFilledBack,
    productTableColumns,
    rawMaterials,
    solventColumns,
  ])
  const elementTableNameColWidth = useMemo(
    () =>
      batchTableNameColWidthFromLabels([
        '请选择',
        ...materialLibrary.map((item) => item.name),
        ...rawMaterials.map((material) => material.name.trim() || '请选择'),
        '混合铜精矿',
        '投入（年）',
        ...solventColumns.map((material) => displaySolventName(material.name)),
      ]),
    [materialLibrary, rawMaterials, solventColumns]
  )
  const batchTableNameColWidth = useMemo(
    () => batchTableNameColWidthFromLabels(batchTableNameLabels),
    [batchTableNameLabels]
  )
  const calculationTableWidth = batchElementTableWidth(elementTableKeys.length, elementTableNameColWidth)
  const phaseTableWidth = batchPhaseTableWidth(phaseTableRowKeys.length, batchTableNameColWidth)
  const phaseTableRawColumnWidths = useMemo(
    () => Object.fromEntries(rawMaterials.map((material) => [material.id, rawColumnWidth(material)])),
    [rawMaterials]
  )
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
    const columns: CopperBatchExportColumn[] = [
      ...rawMaterials.map((material, index) => ({ header: `原料${index + 1}`, subHeader: displayRawMaterialName(material.name) })),
      ...solventColumns.map((material, index) => ({ header: `熔剂${index + 1}`, subHeader: displaySolventName(material.name) })),
      { header: '燃料煤', subHeader: displayFuelName(fuelColumn.name) },
      ...airColumns.map((column) => ({ header: '气', subHeader: column.name })),
      { header: '投入（年）', subHeader: '投入（年）' },
    ]
    const commonValues = (element: CopperElementKey) => [
      ...rawMaterials.map((material) => formatTableNumber(material.ratios[element] ?? 0)),
      ...solventColumns.map((material) => formatTableNumber(material.ratios[element] ?? 0)),
      formatTableNumber(fuelColumn.ratios[element] ?? 0),
      ...airColumns.map((column) => formatTableNumber(column.ratios[element] ?? 0)),
      formatTableNumber(furnaceDryFeed.ratios[element] ?? 0),
    ]
    const rows: CopperBatchExportRow[] = [
      {
        label: 't/h（干基）',
        values: [
          ...rawMaterials.map((material) => formatTableNumber(material.weight)),
          ...solventColumns.map((material) => formatTableNumber(material.weight)),
          formatTableNumber(fuelColumn.weight),
          ...airColumns.map((column) => formatTableNumber(column.weight)),
          formatTableNumber((furnaceFeed.totalWeight - furnaceBlendWaterWeight) * 24 * 330),
        ],
      },
      {
        label: '含水 t/h',
        values: [
          ...rawMaterials.map((material) => formatTableNumber(materialWaterWeight(material))),
          ...solventColumns.map((material) => formatTableNumber(materialWaterWeight(material))),
          formatTableNumber(materialWaterWeight(fuelColumn)),
          ...airColumns.map((column) => {
            const water = materialWaterWeight(column)
            return water > 0 ? formatTableNumber(water) : ''
          }),
          formatTableNumber(furnaceBlendWaterWeight * 24 * 330),
        ],
      },
      {
        label: 't/h（湿基）',
        values: [
          ...rawMaterials.map((material) =>
            formatTableNumber(material.weight + materialWaterWeight(material))
          ),
          ...solventColumns.map((material) =>
            formatTableNumber(material.weight + materialWaterWeight(material))
          ),
          formatTableNumber(fuelColumn.weight + materialWaterWeight(fuelColumn)),
          ...airColumns.map((column) => formatTableNumber(column.weight + materialWaterWeight(column))),
          formatTableNumber(furnaceFeed.totalWeight * 24 * 330),
        ],
      },
      ...batchExportElementKeys.map((element) => ({
        label: elementSymbolLabel(element),
        values: commonValues(element),
      })),
      {
        label: '合计',
        values: [
          ...rawMaterials.map(materialTotal),
          ...solventColumns.map(materialTotal),
          materialTotal(fuelColumn),
          ...airColumns.map(materialTotal),
          '100',
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
    const gasInputRowKeys = ['O2', 'N2', 'H2O'].filter((key) =>
      inputPhaseColumnData.some((column) => column.kind === 'oxygen' && getPhaseExportValue(column, key) !== '')
    )
    const inputRowKeys = [...new Set([...gasInputRowKeys, ...phaseTableRowKeys.filter((key) =>
      inputPhaseColumnData.some((column) => {
        if (column.kind === 'product') return false
        if (key === 'O2' || key === 'N2' || key === 'H2O') return column.kind === 'oxygen' || column.kind === 'blend'
        return column.kind !== 'oxygen' && getPhaseExportValue(column, key) !== ''
      })
    )])]
    const inputValue = (column: PhaseTableColumn, key: string) => getPhaseExportValue(column, key)
    const phaseExportDryWeight = (column: PhaseTableColumn) => {
      if (column.kind === 'oxygen') return column.weight
      return column.weight
    }
    const phaseExportWaterWeight = (column: PhaseTableColumn) => {
      if (column.kind === 'oxygen') return column.waterWeight ?? 0
      if (column.kind === 'blend') return column.waterWeight ?? furnaceBlendWaterWeight
      return column.waterWeight ?? 0
    }
    const inputRows: CopperBatchExportRow[] = [
      {
        label: 't/h（干基）',
        values: inputPhaseColumnData.map((column) => formatTableNumber(phaseExportDryWeight(column))),
      },
      {
        label: '含水 t/h',
        values: inputPhaseColumnData.map((column) => {
          const water = phaseExportWaterWeight(column)
          return water > 0 ? formatTableNumber(water) : ''
        }),
      },
      ...inputRowKeys.map((key) => ({
        label: phaseStorageKeyToDisplayLabel(key),
        values: inputPhaseColumnData.map((column) => inputValue(column, key)),
      })),
      {
        label: '合计',
        values: inputPhaseColumnData.map((column) =>
          column.phaseReady === false ? '' : formatTableNumber(phaseExportColumnTotal(column))
        ),
      },
    ]

    const outputColumns: CopperBatchExportColumn[] = [
      { header: 't/h', subHeader: 't/h' },
      ...outputPhaseRowKeys.map((key) => ({
        header: PRODUCT_PHASE_DISPLAY[key] ?? key,
        subHeader: PRODUCT_PHASE_DISPLAY[key] ?? key,
      })),
      { header: '合计', subHeader: '合计' },
    ]
    const outputRows: CopperBatchExportRow[] = [
      ...outputPhaseColumnData.map((column) => ({
        label: column.subHeader || column.header,
        values: [
          productFilledBack ? formatTableNumber(column.weight) : '',
          ...outputPhaseRowKeys.map((key) =>
            productFilledBack ? formatTableNumber(column.productPhases?.[key] ?? 0) : ''
          ),
          productFilledBack ? formatTableNumber(phaseExportColumnTotal(column)) : '',
        ],
      })),
    ]

    return {
      inputSheet: { title: `${titlePrefix} 投入-物料物相表`, columns: inputColumns, rows: inputRows },
      outputSheet: { title: `${titlePrefix} 产出-产物物相表`, columns: outputColumns, rows: outputRows },
    } satisfies { inputSheet: CopperBatchWorkbookSheet; outputSheet: CopperBatchWorkbookSheet }
  }

  const buildProductElementExportTable = (titlePrefix: string): CopperBatchWorkbookSheet => {
    const columns: CopperBatchExportColumn[] = [
      { header: 't/h', subHeader: 't/h' },
      ...outputProductElementKeys.map((element) => ({
        header: elementSymbolLabel(element),
        subHeader: elementSymbolLabel(element),
      })),
      { header: '合计', subHeader: '合计' },
    ]
    const rows: CopperBatchExportRow[] = outputProductElementRows.map((product) => ({
      label: product.name,
      values: [
        productFilledBack ? formatTableNumber(product.mass) : '',
        ...outputProductElementKeys.map((element) =>
          productFilledBack ? formatTableNumber(product.composition[element] ?? 0) : ''
        ),
        productFilledBack
          ? formatTableNumber(calculateKnownTotal(product.composition as CopperRatios) + (product.composition['Other(其他)'] ?? 0))
          : '',
      ],
    }))
    return { title: `${titlePrefix} 产出-产物元素表`, columns, rows }
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

    const airColumn = airColumns.find((column) => column.id === columnId)
    if (airColumn) {
      const o2Text = drafts.O2 ?? ''
      const n2Text = drafts.N2 ?? ''
      const o2 = o2Text.trim() === '' ? airColumn.ratios['O(氧)'] ?? 0 : toNumber(o2Text, 0)
      const n2 = n2Text.trim() === '' ? airColumn.ratios['N(氮)'] ?? 0 : toNumber(n2Text, 0)
      if (Math.abs(o2 + n2 - 100) > 0.02) {
        setInvalidInputPhaseColumns((prev) => ({ ...prev, [columnId]: true }))
        setWorkflowMessage(`${airColumn.name}物相 O₂/N₂ 合计须为 100%。`, 'error')
        return
      }
      setInvalidInputPhaseColumns((prev) => ({ ...prev, [columnId]: false }))
      const nextRatios = normalizeMaterialRatios({ ...airColumn.ratios, 'O(氧)': o2, 'N(氮)': n2 })
      updateAirColumn(columnId, { ratios: nextRatios })
      if (airColumn.airRole === 'oxygen') {
        setOxygenAirO2Pct(formatTableNumber(o2))
        setOxygenAirN2Pct(formatTableNumber(n2))
      }
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
      setWorkflowMessage(`已按物相 w% 同步${airColumn.name} O/N 组成。`, 'success')
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
      setWorkflowMessage('投入物相列合计须为 100%（±0.02），请修正后再回填。', 'error')
      return
    }
    setInvalidInputPhaseColumns((prev) => ({ ...prev, [columnId]: false }))
    const normalized = normalizePhasePercents(parsed)
    const draftStrings = Object.fromEntries(
      INPUT_PHASE_ROW_KEYS.map((key) => [key, formatTableNumber(normalized[key] ?? 0)])
    ) as Record<string, string>

    const rawMaterial = rawMaterials.find((material) => material.id === columnId)
    if (rawMaterial) {
      const elements = normalizeMaterialRatios(deriveElementsFromPhaseContents(normalized, rawMaterial.ratios))
      updateRawMaterial(columnId, { ratios: elements })
      setPhaseRatioOverrides((prev) => ({ ...prev, [columnId]: draftStrings }))
      setManualPhaseRatioColumns((prev) => ({ ...prev, [columnId]: true }))
      setInputPhaseDrafts((prev) => {
        const next = { ...prev }
        delete next[columnId]
        return next
      })
      setWorkflowMessage(`已按物相 w% 同步 ${displayRawMaterialName(rawMaterial.name)} 元素组成。`, 'success')
      return
    }

    const solventMaterial = solventColumns.find((material) => material.id === columnId)
    if (solventMaterial) {
      const elements = normalizeMaterialRatios(deriveElementsFromPhaseContents(normalized, solventMaterial.ratios))
      updateSolventColumn(columnId, { ratios: elements })
      setPhaseRatioOverrides((prev) => ({ ...prev, [columnId]: draftStrings }))
      setManualPhaseRatioColumns((prev) => ({ ...prev, [columnId]: true }))
      setInputPhaseDrafts((prev) => {
        const next = { ...prev }
        delete next[columnId]
        return next
      })
      setWorkflowMessage(`已按物相 w% 同步 ${solventMaterial.name} 元素组成。`, 'success')
      return
    }

    if (columnId === fuelColumn.id) {
      const elements = normalizeMaterialRatios(deriveElementsFromPhaseContents(normalized, fuelColumn.ratios))
      setFuelColumn((prev) => ({ ...prev, ratios: elements }))
      resetProductCalculation()
      setHeatBalanced(false)
      setPhaseRatioOverrides((prev) => ({ ...prev, [columnId]: draftStrings }))
      setManualPhaseRatioColumns((prev) => ({ ...prev, [columnId]: true }))
      setInputPhaseDrafts((prev) => {
        const next = { ...prev }
        delete next[columnId]
        return next
      })
      setWorkflowMessage('已按物相 w% 同步燃料煤元素组成。', 'success')
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
    if (columnId === 'total' || columnId === 'loss' || !productFilledBack) return
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
      setWorkflowMessage('产出物相列合计须为 100%（±0.02），请修正后再回填。', 'error')
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
    setWorkflowMessage('已按产出物相 w% 同步产物元素组成；如需完整刷新请重新计算产出。', 'success')
  }

  const exportCalculationTable = () => {
    const { columns, rows } = buildCalculationExportTable()
    const titlePrefix = `${APP_NAME_ZH} ${getCopperStageExportName(activeStage.name)} 配料总表`
    const { inputSheet, outputSheet } = buildPhaseExportTable(titlePrefix)
    const productElementSheet = buildProductElementExportTable(titlePrefix)
    const sheets: CopperBatchWorkbookSheet[] = [
      { title: `${titlePrefix} 投入-物料元素表`, columns, rows },
      inputSheet,
      outputSheet,
      productElementSheet,
    ]
    const filename = buildCopperBatchExportFilename({ appName: APP_NAME_ZH, stageName: activeStage.name })
    const html = buildCopperBatchWorkbookHtml(sheets)
    void saveCopperBatchExcelWorkbook(filename, html, getElectronExportWorkbookSaver())
  }

  const activePhasePreview = (() => {
    if (!selectedPhaseMaterial) return null
    if (phasePreviewUnknowns?.materialId === selectedPhaseMaterial.id) {
      return phasePreviewUnknowns
    }
    const batchResult = phaseBatchResults?.[selectedPhaseMaterial.id]
    return batchResult?.valid ? buildPhasePreviewUnknowns(selectedPhaseMaterial.id, batchResult) : null
  })()

  const activeMaterialPhaseRows = selectedPhaseMaterial
    ? ensureMaterialPhaseRows(materialPhaseRows[selectedPhaseMaterial.id])
    : []

  const selectedPhaseLocked = Boolean(
    selectedPhaseMaterial &&
      (phaseCompletedMaterials[selectedPhaseMaterial.id] || phaseBatchResults?.[selectedPhaseMaterial.id]?.valid)
  )

  const selectedPhaseMaterialError = selectedPhaseMaterial
    ? validateMaterialForPhaseCalc(selectedPhaseMaterial)
    : null

  useLayoutEffect(() => {
    const el = phaseAssistContainerRef.current
    if (!el) {
      setPhaseAssistViewportWidth(0)
      return
    }
    const update = () => {
      const next = el.clientWidth
      setPhaseAssistViewportWidth((prev) => (prev === next ? prev : next))
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [showElementAssist, phaseMaterialId, selectedPhaseMaterial?.id, selectedPhaseMaterialError])

  const hasPendingDraftRows = activeMaterialPhaseRows.some((row) => row.kind === 'draft')
  const hasFormulaErrors = activeMaterialPhaseRows.some((row) => {
    if (!selectedPhaseMaterial) return false
    const key = rowDraftStorageKey(selectedPhaseMaterial.id, row.id)
    return Boolean(phaseRowFormulaErrors[key])
  })

  const selectedPhaseSolverError =
    selectedPhaseMaterial && phaseBatchResults?.[selectedPhaseMaterial.id]?.valid === false
      ? phaseBatchResults[selectedPhaseMaterial.id]?.message ?? '物相方程无法求解，请调整物相行或化验值。'
      : null

  const phasePivotRows = useMemo(
    () =>
      buildPhasePivotRows(
        sortMaterialPhaseRows(activeMaterialPhaseRows),
        activePhasePreview?.phaseContents ?? null,
        selectedPhaseMaterial?.weight ?? 0
      ),
    [activeMaterialPhaseRows, activePhasePreview, selectedPhaseMaterial?.weight]
  )
  const phasePivotTotals = useMemo(() => sumPhasePivotTotals(phasePivotRows), [phasePivotRows])
  const phasePivotDisplayTotals = useMemo(
    () => decomposePhaseElementMasses(phasePivotTotals.elements, phaseElementView),
    [phaseElementView, phasePivotTotals.elements]
  )

  const phaseSheetTabs = useMemo(() => {
    const tabIds = buildPhaseAssistTabMaterialIds(phaseAssistTabMaterialIds, phaseMaterialId, phaseBatchResults)
    if (tabIds.length === 0) return []
    return rawMaterials.flatMap((material) => {
      if (!material.name.trim() || !tabIds.includes(material.id)) return []
      return [
        {
          id: material.id,
          label: displayRawMaterialName(material.name),
          status: phaseSheetTabStatus(material.id, phaseCompletedMaterials, phaseBatchResults),
        },
      ]
    })
  }, [phaseAssistTabMaterialIds, phaseBatchResults, phaseCompletedMaterials, phaseMaterialId, rawMaterials])

  const exportPhaseComposition = async () => {
    if (!selectedPhaseMaterial) return
    const materialName = displayRawMaterialName(selectedPhaseMaterial.name)
    const titlePrefix = `${APP_NAME_ZH} ${getCopperStageExportName(activeStage.name)} 物相成分`
    const columns: CopperBatchExportColumn[] = [
      { header: 'w%', subHeader: 'w%' },
      ...phaseTableColumnKeys.map((element) => ({
        header: phaseTableHeaderLabel(element, phaseElementView),
        subHeader: phaseTableHeaderLabel(element, phaseElementView),
      })),
    ]
    const rows: CopperBatchExportRow[] = sortMaterialPhaseRows(activeMaterialPhaseRows).map((row) => {
      const pivot = phasePivotRows.find((item) => item.rowId === row.id)
      const phasePercent = pivot?.phasePercent ?? null
      const rowElementDisplay = pivot?.elements
        ? decomposePhaseElementMasses(pivot.elements, phaseElementView)
        : {}
      const label = row.kind === 'draft' ? row.formula.trim() || '待填物相' : row.displayLabel
      const showValues =
        pivot && selectedPhaseMaterial.weight > 0 && phasePercent != null && phasePercent > 0
      const feedRateTh = selectedPhaseMaterial.weight
      const wValue = showValues ? formatTableNumber(phasePercent ?? 0) : ''
      return {
        label,
        values: [
          wValue,
          ...phaseTableColumnKeys.map((element) =>
            showValues
              ? formatTableNumber(massThToWeightPercent(rowElementDisplay[element] ?? 0, feedRateTh))
              : ''
          ),
        ],
      }
    })
    rows.push({
      label: '合计',
      values: [
        activePhasePreview ? formatTableNumber(phasePivotTotals.phaseTotal) : '',
        ...phaseTableColumnKeys.map((element) =>
          activePhasePreview && selectedPhaseMaterial.weight > 0
            ? formatTableNumber(
                massThToWeightPercent(phasePivotDisplayTotals[element] ?? 0, selectedPhaseMaterial.weight)
              )
            : ''
        ),
      ],
    })
    const filename = `${sanitizeExcelFilePart(APP_NAME_ZH)}_${sanitizeExcelFilePart(getCopperStageExportName(activeStage.name))}_物相成分_${sanitizeExcelFilePart(materialName)}_${formatExportDate()}.xls`
    const html = buildCopperBatchWorkbookHtml([{ title: `${titlePrefix} ${materialName}`, columns, rows }])
    const result = await saveCopperBatchExcelWorkbook(filename, html, getElectronExportWorkbookSaver())
    if (result.ok) {
      setWorkflowMessage(`已导出物相成分：${materialName}。`, 'success')
    } else if ('error' in result && result.error) {
      setWorkflowMessage(`导出失败：${result.error}`, 'error')
    }
  }

  const updateRawMaterial = (
    id: string,
    patch: Partial<CopperMaterialColumn>,
    options: { preservePhaseCompletion?: boolean } = {}
  ) => {
    setRawMaterials((prev) => prev.map((material) => (material.id === id ? { ...material, ...patch } : material)))
    setSolventSolution(null)
    resetProductCalculation()
    setHeatBalanced(false)
    if (!options.preservePhaseCompletion) {
      setPhaseCompleted(false)
      setPhaseCompletedMaterials((prev) => ({ ...prev, [id]: false }))
      setPhasePreviewUnknowns((prev) => (prev?.materialId === id ? null : prev))
      setPhaseBatchResults((prev) => dropPhaseBatchResult(prev, id))
    }
    resetProductCalculation()
    setHeatBalanced(false)
  }

  const updateAirColumn = (id: string, patch: Partial<CopperMaterialColumn>) => {
    setAirColumns((prev) => prev.map((column) => (column.id === id ? { ...column, ...patch } : column)))
    resetProductCalculation()
    setHeatBalanced(false)
    resetProductCalculation()
    setHeatBalanced(false)
  }

  const updateRawWeight = (id: string, value: string) => {
    if (!isEditableNumberDraft(value)) return
    setRawWeightDrafts((prev) => ({ ...prev, [id]: value }))
    const nextWeight = isValidNumberText(value) ? toNumber(value, 0) : 0
    const current = rawMaterials.find((material) => material.id === id)
    const waterWeight = current ? materialWaterWeight(current) : 0
    updateRawMaterial(
      id,
      syncMaterialMoistureFromWater({ weight: nextWeight, waterWeight }),
      { preservePhaseCompletion: true }
    )
    if (nextWeight <= 0) {
      setPhaseBatchResults((prev) => dropPhaseBatchResult(prev, id))
      setPhasePreviewUnknowns((prev) => (prev?.materialId === id ? null : prev))
      setPhaseCompletedMaterials((prev) => ({ ...prev, [id]: false }))
      setPhaseCompleted(false)
    }
  }

  const updateSolventColumn = (id: string, patch: Partial<CopperMaterialColumn>) => {
    setSolventColumns((prev) => prev.map((material) => (material.id === id ? { ...material, ...patch } : material)))
    setSolventSolution(null)
    resetProductCalculation()
    setHeatBalanced(false)
    resetProductCalculation()
    setHeatBalanced(false)
  }

  const updateFuelColumn = (patch: Partial<CopperFuelMaterial>) => {
    setFuelColumn((prev) => ({ ...prev, ...patch }))
    setHeatBalanced(false)
    setHeatBalanced(false)
    setManualFuelWeightValid(false)
  }

  const updateRatio = (id: string, element: CopperElementKey, value: number, kind: 'raw' | 'solvent') => {
    const update = kind === 'raw' ? updateRawMaterial : updateSolventColumn
    const list = kind === 'raw' ? rawMaterials : solventColumns
    const current = list.find((material) => material.id === id)
    if (!current) return
    const draft = { ...current.ratios, [element]: Math.max(0, value) }
    const nextRatios = normalizeMaterialRatios(draft)
    update(id, { ratios: nextRatios })
    if (kind === 'raw') {
      const sulfurError = validateRatiosSulfurRequirement(nextRatios, current.name.trim() || '该原料')
      if (sulfurError) {
        setWorkflowMessage(`${sulfurError}，请补全 S(硫) 后再计算物相成分。`, 'error')
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
    const numericValue = Math.max(0, toNumber(value, 0))
    if (kind === 'fuel') {
      updateFuelRatio(element, numericValue)
    } else if (kind === 'gas') {
      updateGasRatio(id, element, numericValue)
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
    if (kind === 'raw') {
      setRawMaterials((prev) => {
        const material = prev.find((item) => item.id === id)
        if (!material) return prev
        const validated = applyRawMaterialRatioTotalValidation(material.ratios)
        const ratiosChanged = rawMaterialValidatedRatiosChanged(material.ratios, validated)
        const notice = formatRawMaterialRatioValidationMessage(material.name, validated)
        if (notice && ratiosChanged) {
          queueMicrotask(() => setWorkflowMessage(notice.text, notice.tone))
        }
        if (!ratiosChanged) return prev
        return prev.map((item) => (item.id === id ? { ...item, ratios: validated.ratios } : item))
      })
    }
  }

  const updateMaterialWaterWeight = (kind: 'raw' | 'solvent', id: string, value: string) => {
    if (!isEditableNumberDraft(value)) return
    const key = waterWeightDraftKey(kind, id)
    setWaterWeightDrafts((prev) => ({ ...prev, [key]: value }))
    if (!isValidNumberText(value)) return
    const waterWeight = Math.max(0, toNumber(value, 0))
    const list = kind === 'raw' ? rawMaterials : solventColumns
    const current = list.find((material) => material.id === id)
    const patch = syncMaterialMoistureFromWater({
      weight: current?.weight ?? 0,
      waterWeight,
    })
    if (kind === 'raw') updateRawMaterial(id, patch, { preservePhaseCompletion: true })
    else updateSolventColumn(id, patch)
  }

  const commitWaterWeightDraft = (kind: 'raw' | 'solvent' | 'fuel', id: string) => {
    const key = waterWeightDraftKey(kind, id)
    setWaterWeightDrafts((prev) => {
      if (!(key in prev)) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  const updateFuelWaterWeight = (value: string) => {
    if (!isEditableNumberDraft(value)) return
    const key = waterWeightDraftKey('fuel', fuelColumn.id)
    setWaterWeightDrafts((prev) => ({ ...prev, [key]: value }))
    if (!isValidNumberText(value)) return
    const waterWeight = Math.max(0, toNumber(value, 0))
    updateFuelColumn(
      syncMaterialMoistureFromWater({ weight: fuelColumn.weight, waterWeight }) as Partial<CopperFuelMaterial>
    )
  }

  const updateFuelRatio = (element: CopperElementKey, value: number) => {
    updateFuelColumn({ ratios: normalizeMaterialRatios({ ...fuelColumn.ratios, [element]: Math.max(0, value) }) })
  }

  const updateGasRatio = (id: string, element: CopperElementKey, value: number) => {
    const column = airColumns.find((item) => item.id === id)
    if (!column) return
    const ratios = normalizeMaterialRatios({ ...column.ratios, [element]: Math.max(0, value) })
    updateAirColumn(id, { ratios })
    if (column.airRole === 'oxygen') {
      setOxygenAirO2Pct(formatTableNumber(ratios['O(氧)'] ?? 0))
      setOxygenAirN2Pct(formatTableNumber(ratios['N(氮)'] ?? 0))
    }
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
    const nextWeight = toNumber(value, 0)
    const shouldSeedDefaultWater =
      fuelColumn.weight <= 0 &&
      materialWaterWeight(fuelColumn) <= 0 &&
      (fuelColumn.moisture ?? 0) > 0 &&
      DEFAULT_COPPER_FUEL.id === fuelColumn.id
    const waterWeight = shouldSeedDefaultWater ? nextWeight * ((fuelColumn.moisture ?? 0) / 100) : materialWaterWeight(fuelColumn)
    updateFuelColumn(
      shouldSeedDefaultWater
        ? (syncMaterialMoistureFromWater({ weight: nextWeight, waterWeight }) as Partial<CopperFuelMaterial>)
        : { weight: nextWeight }
    )
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

  const updateAirWeight = (id: string, value: string) => {
    if (!isEditableNumberDraft(value)) return
    setRatioDrafts((prev) => ({ ...prev, [`gas-weight:${id}`]: value }))
    if (!isValidNumberText(value)) {
      setManualAirWeightValid(false)
      return
    }
    updateAirColumn(id, { weight: toNumber(value, 0) })
    setManualAirWeightValid(true)
    resetProductCalculation()
    setHeatBalanced(false)
  }

  const commitAirWeightDraft = (id: string) => {
    setRatioDrafts((prev) => {
      const key = `gas-weight:${id}`
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
      setMaterialPhaseRows((prev) => {
        const next = { ...prev }
        delete next[id]
        return next
      })
      setRatioDrafts((prev) => {
        const prefix = `raw:${id}:`
        return Object.fromEntries(Object.entries(prev).filter(([key]) => !key.startsWith(prefix)))
      })
      return
    }
    const sulfurError = validateRatiosSulfurRequirement(selected.ratios, selected.name)
    if (sulfurError) {
      setWorkflowMessage(`${sulfurError}，无法选用该原料，请先在原料库或投入-物料元素表补全 S(硫)。`, 'error')
      return
    }
    const normalizedRatios = normalizeMaterialRatios({ ...selected.ratios })
    const validated = applyRawMaterialRatioTotalValidation(normalizedRatios)
    updateRawMaterial(id, {
      name: selected.name,
      ratios: validated.ratios,
      unitPrice: selected.unitPrice,
    })
    const libraryNotice = formatRawMaterialRatioValidationMessage(selected.name, validated)
    if (libraryNotice && rawMaterialValidatedRatiosChanged(normalizedRatios, validated)) {
      setWorkflowMessage(libraryNotice.text, libraryNotice.tone)
    }
    setMaterialPhaseRows((prev) => {
      const phaseRows =
        selected.id === 'cu-conc-a'
          ? createMaterialPhaseRowsFromFormulas(COPPER_CONCENTRATE_A_DEFAULT_PHASES)
          : selected.category === 'concentrate' ||
              (COPPER_SW_CONCENTRATE_LIBRARY_IDS as readonly string[]).includes(selected.id)
            ? createConcentrateMaterialPhaseRows()
            : null
      if (!phaseRows) {
        const next = { ...prev }
        delete next[id]
        return next
      }
      return { ...prev, [id]: phaseRows }
    })
  }

  const clearBatchCalculationState = () => {
    setSolventSolution(null)
    resetProductCalculation()
    setHeatBalanced(false)
    setPhaseCompleted(false)
    resetProductCalculation()
    setHeatBalanced(false)
  }

  const addMaterial = () => {
    const id = `raw-${Date.now()}-${rawMaterials.length + 1}`
    setRawMaterials((prev) => [
      ...prev,
      {
        id,
        name: '',
        kind: 'raw',
        weight: 0,
        waterWeight: 0,
        moisture: 0,
        ratios: emptyCopperRatios(),
        unitPrice: 0,
      },
    ])
    setRawWeightDrafts((prev) => ({ ...prev, [id]: '' }))
    clearBatchCalculationState()
  }

  const addSolvent = () => {
    const id = `solvent-custom-${Date.now()}-${solventColumns.length + 1}`
    setSolventColumns((prev) => [
      ...prev,
      {
        id,
        name: '',
        kind: 'solvent',
        weight: 0,
        waterWeight: 0,
        moisture: 0,
        ratios: emptyCopperRatios(),
        unitPrice: 0,
      },
    ])
    setManualSolventWeights((prev) => ({ ...prev, [id]: false }))
    clearBatchCalculationState()
  }

  const updateSolventName = (id: string, name: string) => {
    updateSolventColumn(id, { name, unitPrice: 0 })
  }

  const removeSolvent = (id: string) => {
    setSolventColumns((prev) => prev.filter((column) => column.id !== id))
    setRatioDrafts((prev) => {
      const next = { ...prev }
      delete next[`solvent-weight:${id}`]
      for (const key of Object.keys(next)) {
        if (key.startsWith(`solvent:${id}:`)) delete next[key]
      }
      return next
    })
    setWaterWeightDrafts((prev) => {
      const next = { ...prev }
      delete next[`solvent:${id}`]
      return next
    })
    clearBatchCalculationState()
  }

  const importLibraryFile = async (file: File | null) => {
    if (!file) return
    const lowerName = file.name.toLowerCase()
    if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls')) {
      setLibraryImportError('请先在 Excel 中另存为 CSV 或制表符文本后导入。')
      return
    }
    const text = await file.text()
    const imported = parseCopperLibraryCsv(text)
    if (imported.length === 0) {
      setLibraryImportError('未识别到原料数据，请确认包含“原料名称”和元素列。')
      return
    }
    setMaterialLibrary((prev) => [...prev, ...imported])
    setShowLibrary(true)
    setLibraryImportError(null)
    setLibraryPage(1)
  }

  const singleLibraryRowTotal = (row: SingleLibraryRow) => libraryRowEnteredTotal(row)

  const libraryRatioInputValue = (rowId: string, element: CopperElementKey, value: number | undefined) =>
    libraryRatioDrafts[libraryRatioDraftKey(rowId, element)] ?? formatBatchTableDisplay(value ?? 0)

  const libraryRowLiveTotal = (row: SingleLibraryRow) =>
    libraryRowDisplayTotal(row, dialogElementColumns, libraryRatioDrafts)

  const libraryElementKeys = useMemo(
    () => visibleCopperElementKeys(materialLibrary),
    [materialLibrary]
  )

  const filteredMaterialLibrary = useMemo(
    () => filterMaterialLibrary(materialLibrary, librarySearchQuery, libraryElementFilters),
    [libraryElementFilters, librarySearchQuery, materialLibrary]
  )
  const librarySearchText = librarySearchQuery.trim()
  const libraryNameSearchMatches = useMemo(
    () => (librarySearchText ? filterMaterialLibrary(materialLibrary, librarySearchQuery, []) : []),
    [librarySearchQuery, librarySearchText, materialLibrary]
  )
  const librarySearchSuggestions = libraryNameSearchMatches.slice(0, 5)
  const libraryTotalPages = pageCountFor(filteredMaterialLibrary.length, libraryPageSize)
  const normalizedLibraryPage = Math.min(Math.max(1, libraryPage), libraryTotalPages)
  const pagedMaterialLibrary = useMemo(() => {
    const start = (normalizedLibraryPage - 1) * libraryPageSize
    return filteredMaterialLibrary.slice(start, start + libraryPageSize)
  }, [filteredMaterialLibrary, libraryPageSize, normalizedLibraryPage])
  const libraryVisibleStart = filteredMaterialLibrary.length === 0 ? 0 : (normalizedLibraryPage - 1) * libraryPageSize + 1
  const libraryVisibleEnd = Math.min(filteredMaterialLibrary.length, normalizedLibraryPage * libraryPageSize)

  useEffect(() => {
    if (libraryPage !== normalizedLibraryPage) {
      setLibraryPage(normalizedLibraryPage)
    }
  }, [libraryPage, normalizedLibraryPage])

  const batchExportElementKeys = useMemo(
    () =>
      visibleCopperElementKeys(
        [...rawMaterials, ...solventColumns, fuelColumn, ...airColumns],
        rawMaterialElementKeys,
        ELEMENT_TABLE_VISIBLE_EPSILON,
        COPPER_ELEMENT_TABLE_ALWAYS_INCLUDE
      ),
    [rawMaterials, solventColumns, fuelColumn, airColumns, rawMaterialElementKeys]
  )

  const updateLibrarySearchQuery = (value: string) => {
    setLibrarySearchQuery(value)
    setLibraryPage(1)
    if (value.trim()) setShowLibrary(true)
  }

  const addLibraryElementFilter = () => {
    setLibraryElementFilters((prev) => [...prev, createLibraryElementFilter(prev.length)])
    setLibraryPage(1)
    setShowLibrary(true)
  }

  const updateLibraryElementFilter = (
    id: string,
    patch: Partial<Pick<LibraryElementFilter, 'element' | 'min' | 'max'>>
  ) => {
    setLibraryElementFilters((prev) => prev.map((filter) => (filter.id === id ? { ...filter, ...patch } : filter)))
    setLibraryPage(1)
  }

  const removeLibraryElementFilter = (id: string) => {
    setLibraryElementFilters((prev) => prev.filter((filter) => filter.id !== id))
    setLibraryPage(1)
  }

  const resetLibraryFilters = () => {
    setLibrarySearchQuery('')
    setLibraryElementFilters([])
    setLibraryPage(1)
  }

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
    if (!isEditableNumberDraft(value)) return
    const key = libraryRatioDraftKey(id, element)
    setLibraryRatioDrafts((prev) => ({ ...prev, [key]: value }))
    if (!isValidNumberText(value)) return
    setSingleLibraryRows((prev) =>
      prev.map((row) =>
        row.id === id
          ? { ...row, ratios: { ...row.ratios, [element]: Math.max(0, toNumber(value, 0)) } }
          : row
      )
    )
  }

  const commitLibraryRatioDraft = (rowId: string, element: CopperElementKey) => {
    const key = libraryRatioDraftKey(rowId, element)
    setLibraryRatioDrafts((prev) => {
      if (!(key in prev)) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  const addDialogElementColumn = () => {
    setLibraryDialogMessage(null)
    setDialogElementColumns((prev) => [...prev, createLibraryDialogElementColumn('', prev.length)])
  }

  const removeDialogElementColumn = (columnId: string) => {
    setLibraryDialogMessage(null)
    setDialogElementColumns((prev) => {
      const removed = prev.find((col) => col.id === columnId)
      const next = prev.filter((col) => col.id !== columnId)
      if (removed?.element && !next.some((col) => col.element === removed.element)) {
        setSingleLibraryRows((rows) =>
          rows.map((row) => ({
            ...row,
            ratios: { ...row.ratios, [removed.element!]: 0 },
          }))
        )
      }
      return next.length > 0 ? next : [createLibraryDialogElementColumn('', 0)]
    })
  }

  const updateDialogElementColumnName = (columnId: string, value: string) => {
    setLibraryDialogMessage(null)
    setDialogElementColumns((prev) =>
      prev.map((col) =>
        col.id === columnId
          ? { ...col, rawName: value, element: value.trim() ? resolveCopperElementKey(value) : null }
          : col
      )
    )
  }

  const blurDialogElementColumnName = (columnId: string) => {
    const current = dialogElementColumns.find((col) => col.id === columnId)
    const element = current?.rawName.trim() ? resolveCopperElementKey(current.rawName) : null
    const duplicateIds = element
      ? dialogElementColumns.filter((col) => col.id !== columnId && col.element === element).map((col) => col.id)
      : []
    setDialogElementColumns((prev) => {
      if (!current || !element) return prev
      const next = prev
        .filter((col) => !duplicateIds.includes(col.id))
        .map((col) =>
          col.id === columnId
            ? { ...col, rawName: element.replace(/\(.+\)/, '').trim(), element }
            : col
        )
      return next.length > 0 ? next : [createLibraryDialogElementColumn('', 0)]
    })
    if (element && duplicateIds.length > 0) {
      setLibraryRatioDrafts((prev) => {
        const next = { ...prev }
        for (const row of singleLibraryRows) {
          delete next[libraryRatioDraftKey(row.id, element)]
        }
        return next
      })
    }
  }

  const closeLibraryMaterialDialog = () => {
    setLibraryDialogMessage(null)
    setShowSingleLibraryAddDialog(false)
    setLibraryMaterialDialogMode('add')
    setSingleLibraryRows([createSingleLibraryRow()])
    setDialogElementColumns(createDefaultLibraryDialogColumns())
    setLibraryRatioDrafts({})
  }

  const openLibraryMaterialAddDialog = () => {
    setLibraryMaterialDialogMode('add')
    setLibraryDialogMessage(null)
    setSingleLibraryRows([createSingleLibraryRow()])
    setDialogElementColumns(createDefaultLibraryDialogColumns())
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
    setDialogElementColumns(libraryDialogColumnsFromRatios(material.ratios))
    setShowSingleLibraryAddDialog(true)
  }

  const submitLibraryMaterialDialog = () => {
    const columnError = validateLibraryDialogElementColumns(dialogElementColumns)
    if (columnError) {
      setLibraryDialogMessage(columnError)
      return
    }

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
      if (total > 100.05) {
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
          m.id === editId ? { ...m, name: trimmed, ratios: normalizeCopperRatios(row.ratios) } : m
        )
      )
      setLibraryImportError(null)
      closeLibraryMaterialDialog()
      setShowLibrary(true)
      return
    }

    const rowsToAdd = singleLibraryRows.filter((row) => row.name.trim().length > 0)
    if (rowsToAdd.length === 0) {
      setLibraryDialogMessage('请输入原料名称后再添加到原料库。')
      return
    }
    const invalidRow = rowsToAdd.find((row) => singleLibraryRowTotal(row) > 100.05)
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
      ratios: normalizeCopperRatios(row.ratios),
      unitPrice: 0,
    }))
    setMaterialLibrary((prev) => [...prev, ...materials])
    setRawMaterials((prev) => [
      ...prev,
      ...materials.map((material): CopperMaterialColumn => ({
        id: `cu-custom-${material.id}`,
        name: material.name,
        kind: 'raw',
        weight: 0,
        waterWeight: 0,
        moisture: 0,
        ratios: normalizeMaterialRatios(material.ratios),
        unitPrice: material.unitPrice,
      })),
    ])
    setRawWeightDrafts((prev) => ({
      ...prev,
      ...Object.fromEntries(materials.map((material) => [`cu-custom-${material.id}`, ''])),
    }))
    clearBatchCalculationState()
    setLibraryImportError(null)
    setLibraryPage(1)
    closeLibraryMaterialDialog()
    setShowLibrary(true)
  }

  const removeLibraryMaterial = (id: string) => {
    setMaterialLibrary((prev) => prev.filter((material) => material.id !== id))
    setLibraryImportError(null)
  }

  const removeMaterial = (id: string) => {
    setRawMaterials((prev) => (prev.length <= 1 ? prev : prev.filter((material) => material.id !== id)))
    setRawWeightDrafts((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
    setWaterWeightDrafts((prev) => {
      const next = { ...prev }
      delete next[`raw:${id}`]
      return next
    })
    setSolventSolution(null)
    resetProductCalculation()
    setHeatBalanced(false)
    setPhaseCompletedMaterials((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
    setPhasePreviewUnknowns((prev) => (prev?.materialId === id ? null : prev))
    setPhaseBatchResults((prev) => dropPhaseBatchResult(prev, id))
    setPhaseAssistTabMaterialIds((prev) => prev.filter((materialId) => materialId !== id))
    if (phaseMaterialId === id) {
      setPhaseMaterialId(null)
    }
    setPhaseCompleted(false)
    resetProductCalculation()
    setHeatBalanced(false)
  }

  const scrollToAssist = (ref: RefObject<HTMLDivElement>) => {
    window.requestAnimationFrame(() => {
      ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  const scrollToPhaseAssistTable = () => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        phaseAssistContainerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      })
    })
  }

  const scrollToCalculationTable = (block: ScrollLogicalPosition = 'center') => {
    const scroll = () => {
      calculationTableRef.current?.scrollIntoView({ behavior: 'smooth', block })
    }
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(scroll)
      window.setTimeout(scroll, 80)
    })
  }

  const scrollToProductCalculation = () => {
    setShowProductCalculationAssist(true)
    window.requestAnimationFrame(() => {
      productCalculationRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  const openHeatBalanceAssist = () => {
    setShowHeatBalanceAssist(true)
  }

  const openHeatBalanceWorkspace = (source: 'tab' | 'placeholder' = 'placeholder') => {
    if (!productFilledBack) {
      setWorkflowMessage(workflowStepMessage(5, '请先完成产出计算并回填到配料总表；可先在热平衡专区检查温度与燃料参数。'), 'flow')
    } else if (source === 'tab' || source === 'placeholder') {
      setWorkflowMessage(workflowStepMessage(6, '已打开热平衡计算专区，请确认温度设置后点击“热平衡计算”。'), 'flow')
    }
    openHeatBalanceAssist()
    scrollToAssist(heatBalanceRef)
  }

  const handleHeatBalancePlaceholderClick = () => {
    openHeatBalanceWorkspace('placeholder')
  }

  const handleHeatBalancePlaceholderKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    handleHeatBalancePlaceholderClick()
  }

  const toggleHeatBalanceAssist = () => {
    setShowHeatBalanceAssist((value) => !value)
  }

  const handleBatchTableViewChange = (view: BatchTableView) => {
    setBatchTableView(view)
    if (view === 'balance') {
      openHeatBalanceWorkspace('tab')
      return
    }
    if (view === 'productPhase' || view === 'productElement') {
      if (!hasProductResult) {
        setShowProductCalculationAssist(true)
        scrollToProductCalculation()
        if (furnaceFeed.totalWeight > 0) {
          setWorkflowMessage(workflowStepMessage(5, '已打开产出计算专区，请点击“计算产出结果”。'), 'flow')
        }
      }
    }
  }

  const openElementAssist = (materialId: string) => {
    const material = rawMaterials.find((item) => item.id === materialId)
    if (!material) return
    const phaseError = validateMaterialForPhaseCalc(material)
    if (phaseError) {
      setWorkflowMessage(phaseMaterialValidationGuidance(material, phaseError), 'error')
      return
    }
    setMaterialPhaseRows((prev) => {
      return { ...prev, [materialId]: ensureMaterialPhaseRows(prev[materialId]) }
    })
    setPhaseAssistTabMaterialIds((prev) => (prev.includes(materialId) ? prev : [...prev, materialId]))
    setPhaseMaterialId(materialId)
    setPhasePreviewUnknowns((prev) => {
      if (prev?.materialId === materialId) return prev
      const result = phaseBatchResults?.[materialId]
      return result?.valid ? buildPhasePreviewUnknowns(materialId, result) : null
    })
    setShowElementAssist(true)
    scrollToPhaseAssistTable()
  }

  const selectPhaseSheet = (materialId: string) => {
    const material = rawMaterials.find((item) => item.id === materialId)
    if (!material || !material.name.trim()) return
    setMaterialPhaseRows((prev) => {
      return { ...prev, [materialId]: ensureMaterialPhaseRows(prev[materialId]) }
    })
    setPhaseMaterialId(materialId)
    const result = phaseBatchResults?.[materialId]
    if (result?.valid) {
      setPhasePreviewUnknowns(buildPhasePreviewUnknowns(materialId, result))
      setWorkflowMessage(`已切换到物相页签：${displayRawMaterialName(material.name)}。`, 'success')
    } else {
      setPhasePreviewUnknowns(null)
    }
  }

  useEffect(() => {
    if (!showElementAssist) return

    const currentValid =
      phaseMaterialId && rawMaterials.some((material) => material.id === phaseMaterialId && material.name.trim())

    if (!currentValid) {
      const fallbackId = phaseBatchResults
        ? rawMaterials.find((material) => material.name.trim() && phaseBatchResults[material.id]?.valid)?.id ?? null
        : null
      if (fallbackId && fallbackId !== phaseMaterialId) {
        setPhaseMaterialId(fallbackId)
      }
      return
    }

    const result = phaseBatchResults?.[phaseMaterialId]
    if (!result?.valid) return

    setPhaseAssistTabMaterialIds((prev) =>
      prev.includes(phaseMaterialId) ? prev : [...prev, phaseMaterialId]
    )
    setPhasePreviewUnknowns((prev) => {
      if (prev?.materialId === phaseMaterialId) return prev
      return buildPhasePreviewUnknowns(phaseMaterialId, result)
    })
  }, [showElementAssist, phaseBatchResults, phaseMaterialId, rawMaterials])

  const calculateProductsFromProductTable = async () => {
    if (isProductCalculating) return
    if (furnaceFeed.totalWeight <= 0) {
      setWorkflowMessage(workflowStepMessage(4, '请先在配料总表填写混料投料量。'), 'flow')
      scrollToCalculationTable()
      return
    }
    setBatchTableView('productPhase')
    setIsProductCalculating(true)
    setProductCalculationStep(0)
    try {
      await new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => window.setTimeout(resolve, 0))
      })
      const advanceProductCalculationStep = async (step: number) => {
        setProductCalculationStep(step)
        await new Promise<void>((resolve) => {
          window.requestAnimationFrame(() => window.setTimeout(resolve, 0))
        })
      }
    const validPhaseResults = rawMaterials
      .map((material) => phaseBatchResults?.[material.id])
      .filter((result): result is PhaseMaterialCalcResult => Boolean(result?.valid))
    const blendPhaseMass =
      validPhaseResults.length > 0
        ? buildBlendPhaseMassFromMaterialResults(validPhaseResults, materialPhaseRows)
        : null
    const phaseInputValidation = validateRawMaterialPhaseInputs({
      rawMaterials,
      phaseBatchResults,
      blendPhaseMass,
    })
    if (!phaseInputValidation.ok) {
      setWorkflowMessage(workflowStepMessage(4, phaseInputValidation.message ?? '投入物相未完成。'), 'error')
      scrollToCalculationTable()
      return
    }
    const inputPhaseMass = {
      [PRODUCT_INPUT_PHASE_BLEND_NAME]: blendPhaseMass!,
    }
    await advanceProductCalculationStep(1)
    const solvedConstraintConfig = autoFillOxyProductConstraintConfig(productConstraintConfig).config
    const constraintValidation = validateOxyProductConstraintConfig(solvedConstraintConfig)
    const constraintBlocking = firstBlockingConstraintMessage(constraintValidation)
    if (constraintBlocking) {
      setWorkflowMessage(workflowStepMessage(5, constraintBlocking), 'error')
      return
    }
    const iterative = solveOxySideBlowProductsIterative({
      rawMaterials,
      rawFeed: rawBlend,
      concentrateMass,
      inputPhaseMass,
      fuelColumn,
      solventColumns,
      airColumns,
      config: solvedConstraintConfig,
    })
    const solverResult = iterative.result
    const fillBackValidation = validateOxySolverResultForFillBack(solverResult, {
      matteCopperGrade: FIXED_MATTE_COPPER_GRADE,
      concentrateMass,
    })
    const canFillBack = solverResult.acceptable && fillBackValidation.ok
    await advanceProductCalculationStep(2)
    setOxySolverResult(solverResult)
    setProductCalculated(true)
    setProductFilledBack(canFillBack)
    setProductPhaseManual(false)
    setProductPhaseOverrides({})
    setOutputPhaseDrafts({})
    setInvalidOutputPhaseColumns({})
    setBatchTableView('productPhase')
    setBatchTableHighlight(true)
    window.setTimeout(() => setBatchTableHighlight(false), 1000)
    const bridged = oxySolverToCopperProductResult(solverResult)
    if (
      iterative.fuelColumn.weight > 0 &&
      (!nearlyEqual(fuelColumn.weight, iterative.fuelColumn.weight) ||
        !nearlyEqual(materialWaterWeight(fuelColumn), materialWaterWeight(iterative.fuelColumn)))
    ) {
      updateFuelColumn({
        weight: iterative.fuelColumn.weight,
        waterWeight: iterative.fuelColumn.waterWeight,
        moisture: iterative.fuelColumn.moisture,
      })
    }
    if (
      solventColumns.some((column) => {
        const solvedWeight = iterative.solventColumns.find((item) => item.id === column.id)?.weight
        return solvedWeight != null && !nearlyEqual(column.weight, solvedWeight)
      })
    ) {
      setSolventColumns((prev) =>
        prev.map((column) => {
          const solved = iterative.solventColumns.find((item) => item.id === column.id)
          return solved == null ? column : { ...column, weight: solved.weight }
        })
      )
      setManualSolventWeights((prev) => ({
        ...prev,
        ...Object.fromEntries(
          solventColumns
            .filter((column) => iterative.solventColumns.some((item) => item.id === column.id))
            .map((column) => [column.id, true])
        ),
      }))
    }
    if (
      airColumns.some((column) => {
        const solvedWeight = iterative.airColumns.find((item) => item.id === column.id)?.weight
        return solvedWeight != null && !nearlyEqual(column.weight, solvedWeight)
      })
    ) {
      setAirColumns((prev) =>
        prev.map((column) => {
          const solved = iterative.airColumns.find((item) => item.id === column.id)
          return solved == null ? column : { ...column, weight: solved.weight }
        })
      )
    }
    const convergeNote =
      solverResult.acceptanceLevel === 'strict'
        ? ` 已自动迭代 ${iterative.passes} 轮并严格收敛。`
        : solverResult.acceptanceLevel === 'relaxed'
          ? ` 已自动迭代 ${iterative.passes} 轮；当前结果近似收敛，最大相对残差 ${solverResult.maxRelativeResidual.toFixed(4)}。${solverResult.message ?? ''}`
          : ` 已自动迭代 ${iterative.passes} 轮；${solverResult.message ?? '产出约束未完全满足，请检查配料或约束配置。'}`
    const actionNote = canFillBack
      ? '已自动回填到配料总表产出-产物物相表与产出-产物元素表。'
      : fillBackValidation.ok
        ? '当前结果不可回填，请先修正输入或约束。'
        : `${fillBackValidation.message ?? '当前结果未通过产出校验，不可回填。'}`
    if (canFillBack) {
      scrollToCalculationTable('start')
    }
    setWorkflowMessage(
      workflowStepMessage(
        5,
        `产出计算完成：产物总量 ${format(bridged.totalProductMass)} t/h（${formatCopperProductMassSummary(bridged, activeProcessStageId)}）。${convergeNote}${actionNote}`
      ),
      canFillBack && solverResult.acceptanceLevel === 'strict' ? 'success' : 'warning'
    )
    } finally {
      setIsProductCalculating(false)
    }
  }

  const productConstraintAutoFillMessage = (fills: ReturnType<typeof autoFillOxyProductConstraintConfig>['autoFills']) => {
    const first = fills[0]
    if (!first) return null
    const suffix = fills.length > 1 ? `（共 ${fills.length} 项）` : ''
    return `已自动补齐 ${first.element} 在 ${OXY_PRODUCT_KEY_TO_CN[first.product]} 的 D 为 ${formatConstraintDisplayValue(first.value)}%。${suffix}`
  }

  const updateProductDistributionConstraint = (
    productKey: OxySideBlowProductKey,
    element: string,
    type: DistributionRuleType,
    value: string
  ): boolean => {
    const valueLabel = `${element} ${OXY_PRODUCT_KEY_TO_CN[productKey]} ${type}`
    const resolvedValue = value.trim() === '' ? null : resolveConstraintRuleValue(value, productConstraintConfig.variables, valueLabel)
    if (resolvedValue && !resolvedValue.valid) {
      setWorkflowMessage(workflowStepMessage(5, resolvedValue.error ?? '元素约束值无效。'), 'error')
      return false
    }

    const nextConfig = upsertProductDistributionRule(productConstraintConfig, productKey, element, type, value)
    const autoFilled = autoFillOxyProductConstraintConfig(nextConfig)
    const finalValidation = validateOxyProductConstraintConfig(autoFilled.config)
    const finalBlocking = firstBlockingConstraintMessage(finalValidation)
    if (finalBlocking) {
      setWorkflowMessage(workflowStepMessage(5, finalBlocking), 'error')
      return false
    }

    updateProductConstraintConfig(() => autoFilled.config)
    if (autoFilled.autoFills.length > 0) {
      setProductConstraintValueDrafts((prev) => {
        const next = { ...prev }
        for (const fill of autoFilled.autoFills) {
          delete next[productConstraintCellDraftKey(fill.product, fill.element, fill.type)]
        }
        return next
      })
      const message = productConstraintAutoFillMessage(autoFilled.autoFills)
      if (message) setWorkflowMessage(workflowStepMessage(5, message), 'success')
    } else if (finalValidation.warnings.length > 0) {
      setWorkflowMessage(workflowStepMessage(5, finalValidation.warnings[0]!.message), 'warning')
    }
    return true
  }

  const updateProductDistributionConstraintType = (
    productKey: OxySideBlowProductKey,
    element: string,
    type: DistributionRuleType | ''
  ) => {
    if (type && !productCanCarryConstraintElement(productConstraintConfig, productKey, element)) {
      setWorkflowMessage(workflowStepMessage(5, `${OXY_PRODUCT_KEY_TO_CN[productKey]} 不能承接 ${element}。`), 'error')
      return
    }
    const nextConfig = setProductDistributionRuleType(productConstraintConfig, productKey, element, type)
    const autoFilled = autoFillOxyProductConstraintConfig(nextConfig)
    const finalValidation = validateOxyProductConstraintConfig(autoFilled.config)
    const finalBlocking = firstBlockingConstraintMessage(finalValidation)
    if (finalBlocking) {
      setWorkflowMessage(workflowStepMessage(5, finalBlocking), 'error')
      return
    }
    updateProductConstraintConfig(() => autoFilled.config)
    if (autoFilled.autoFills.length > 0) {
      const message = productConstraintAutoFillMessage(autoFilled.autoFills)
      if (message) setWorkflowMessage(workflowStepMessage(5, message), 'success')
    } else if (finalValidation.warnings.length > 0) {
      setWorkflowMessage(workflowStepMessage(5, finalValidation.warnings[0]!.message), 'warning')
    }
    setOpenProductConstraintRuleMenu(null)
    setProductConstraintValueDrafts((prev) => {
      const next = { ...prev }
      for (const ruleType of OXY_DISTRIBUTION_RULE_TYPES) {
        delete next[productConstraintCellDraftKey(productKey, element, ruleType)]
      }
      for (const fill of autoFilled.autoFills) {
        delete next[productConstraintCellDraftKey(fill.product, fill.element, fill.type)]
      }
      return next
    })
  }

  const productDistributionConstraintDraftValue = (
    productKey: OxySideBlowProductKey,
    element: string,
    type: DistributionRuleType,
    value: number | string | null | undefined
  ) => {
    const key = productConstraintCellDraftKey(productKey, element, type)
    return productConstraintValueDrafts[key] ?? formatConstraintDisplayValue(value)
  }

  const setProductDistributionConstraintDraft = (
    productKey: OxySideBlowProductKey,
    element: string,
    type: DistributionRuleType,
    value: string
  ) => {
    const key = productConstraintCellDraftKey(productKey, element, type)
    setProductConstraintValueDrafts((prev) => ({
      ...prev,
      [key]: value,
    }))
  }

  const commitProductDistributionConstraintDraft = (
    productKey: OxySideBlowProductKey,
    element: string,
    type: DistributionRuleType,
    fallbackValue: number | string | null | undefined
  ) => {
    const key = productConstraintCellDraftKey(productKey, element, type)
    const draft = productConstraintValueDrafts[key]
    if (draft == null) return
    if (draft !== formatConstraintDisplayValue(fallbackValue)) {
      const committed = updateProductDistributionConstraint(productKey, element, type, draft)
      if (!committed) return
    }
    setProductConstraintValueDrafts((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
  }



  const resetProductConstraintsToDefault = () => {
    updateProductConstraintConfig(() => createDefaultProductConstraintConfig())
    setOpenProductConstraintRuleMenu(null)
    setProductConstraintValueDrafts({})
    setCustomConstraintTargetDrafts({})
    setCustomConstraintExprDrafts({})
    setNewCustomConstraintDraft({ expr: '', target: '' })
    setWorkflowMessage(workflowStepMessage(5, '已恢复产出计算约束默认值。'), 'flow')
  }


  const addCustomConstraint = () => {
    const nextTarget = normalizeConstraintRuleValue(newCustomConstraintDraft.target)
    if (!newCustomConstraintDraft.expr.trim() || typeof nextTarget !== 'number') {
      setWorkflowMessage(workflowStepMessage(5, '请先填写自定义约束表达式和数值目标。'), 'flow')
      return
    }
    try {
      parseConstraintExpression(newCustomConstraintDraft.expr)
    } catch {
      setWorkflowMessage(workflowStepMessage(5, '自定义约束表达式格式不正确，请检查 Input/Output 路径和运算符。'), 'flow')
      return
    }
    updateProductConstraintConfig((config) =>
      addCustomConstraintEntry(config, newCustomConstraintDraft.expr, newCustomConstraintDraft.target)
    )
    setCustomConstraintTargetDrafts({})
    setCustomConstraintExprDrafts({})
    setNewCustomConstraintDraft({ expr: '', target: '' })
  }

  const renderProductConstraintEditor = (compact = false) => {
    const border = darkMode ? 'border-gray-600' : 'border-gray-200'
    const head = darkMode ? 'bg-gray-800 text-gray-200' : 'bg-gray-50 text-gray-700'
    const stickyHead = darkMode ? 'bg-gray-800 text-gray-200' : 'bg-gray-50 text-gray-700'
    const stickyBody = darkMode ? 'bg-gray-900 text-gray-100' : 'bg-white text-gray-900'
    const muted = darkMode ? 'text-gray-400' : 'text-gray-500'
    const tableCell = `border-t border-l px-1 py-1.5 align-middle ${border}`
    const actionCell = `w-[42px] border-t border-l px-0 py-1.5 text-center align-middle ${border}`
    const stickyCell = `sticky z-10 border-t px-2 py-1.5 align-middle ${border} ${stickyBody}`
    const valueInput = `${inputSm(darkMode)} h-8 w-full min-w-[64px] px-1 py-0 text-center text-sm`
    const textInput = `${inputSm(darkMode)} h-8 w-full px-2 py-0 text-sm`
    const ruleMenuTrigger = `${inputSm(darkMode)} relative h-8 w-full px-5 py-0 text-center text-sm`
    const selectArrow = darkMode ? 'border-gray-300' : 'border-gray-600'
    const ignoredCell = darkMode ? 'bg-gray-800/70 text-gray-500' : 'bg-gray-100 text-gray-500'
    const ignoredControl = darkMode
      ? '!border-gray-700 !bg-gray-800/80 text-gray-500 placeholder:text-gray-500'
      : '!border-gray-300 !bg-gray-100 text-gray-500 placeholder:text-gray-500'
    const unsupportedControl = darkMode ? 'ring-1 ring-yellow-500/40' : 'ring-1 ring-yellow-300'
    const ruleMenuPanel = `absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-md border shadow-lg ${
      darkMode ? 'border-gray-600 bg-gray-800 text-gray-100' : 'border-gray-200 bg-white text-gray-900'
    }`
    const ruleMenuOption = `flex h-8 w-full items-center justify-center px-2 text-center text-sm transition-colors ${
      darkMode ? 'hover:bg-gray-700 focus:bg-gray-700' : 'hover:bg-blue-50 focus:bg-blue-50'
    }`
    const deleteIconButton = `inline-flex h-5 w-5 items-center justify-center border-0 bg-transparent p-0 text-base font-semibold leading-none transition-colors ${
      darkMode
        ? 'text-red-300 hover:text-red-200 disabled:text-gray-500'
        : 'text-red-600 hover:text-red-800 disabled:text-gray-400'
    }`
    const iconButton = `inline-flex h-6 w-6 items-center justify-center border-0 bg-transparent p-0 text-lg font-semibold leading-none transition-colors ${
      darkMode
        ? 'text-blue-300 hover:text-blue-200 disabled:text-gray-500'
        : 'text-blue-600 hover:text-blue-800 disabled:text-gray-400'
    }`
    const customRows = visibleCustomConstraints(productConstraintConfig)
    const customExprValue = (index: number, expr: string) =>
      customConstraintExprDrafts[index] ?? displayConstraintExpression(expr)
    const setCustomExprDraft = (index: number, value: string) => {
      setCustomConstraintExprDrafts((prev) => ({ ...prev, [index]: value }))
    }
    const commitCustomExprDraft = (index: number, expr: string) => {
      const draft = customConstraintExprDrafts[index]
      if (draft == null) return
      try {
        parseConstraintExpression(draft)
      } catch {
        setWorkflowMessage(workflowStepMessage(5, '\u81ea\u5b9a\u4e49\u7ea6\u675f\u8868\u8fbe\u5f0f\u683c\u5f0f\u4e0d\u6b63\u786e\uff0c\u8bf7\u68c0\u67e5 Input/Output \u8def\u5f84\u548c\u8fd0\u7b97\u7b26\u3002'), 'flow')
        return
      }
      if (draft !== expr) {
        updateProductConstraintConfig((config) => updateCustomConstraintEntry(config, index, { expr: draft }))
      }
      setCustomConstraintExprDrafts((prev) => {
        const next = { ...prev }
        delete next[index]
        return next
      })
    }
    const productRuleMaps = Object.fromEntries(
      OXY_SIDE_BLOW_PRODUCT_KEYS.map((productKey) => [
        productKey,
        productDistributionRuleMap(productConstraintConfig, productKey),
      ])
    ) as Record<OxySideBlowProductKey, Record<string, ProductConstraintCellValues>>
    const selectedRuleType = (productKey: OxySideBlowProductKey, element: string): DistributionRuleType | '' => {
      const values = productRuleMaps[productKey]?.[element] ?? {}
      if (values['W%'] != null) return 'W%'
      if (values['D%'] != null) return 'D%'
      return ''
    }
    const constraintTableMinWidth = Math.max(860, 176 + productConstraintRows.length * 76)
    const constraintSyntaxHint =
      '支持 Input.xxx、Output.xxx、Output.产物.物相.元素、OutputE.xxx；运算支持 + - * / () 和小数。例：Output.熔炼出炉烟气.As2O3.As / (Output.熔炼出炉烟气.As2O3.As + Output.烟气含尘.As2O3.As)'
    const customTargetValue = (index: number, target: number) =>
      customConstraintTargetDrafts[index] ?? formatCustomConstraintDisplayValue(target)
    const setCustomTargetDraft = (index: number, value: string) => {
      setCustomConstraintTargetDrafts((prev) => ({ ...prev, [index]: value }))
    }
    const commitCustomTargetDraft = (index: number, target: number) => {
      const draft = customConstraintTargetDrafts[index]
      if (draft == null) return
      if (isValidNumberText(draft)) {
        const nextTarget = toNumber(draft, target)
        if (nextTarget !== target) {
          updateProductConstraintConfig((config) => updateCustomConstraintEntry(config, index, { target: nextTarget }))
        }
      }
      setCustomConstraintTargetDrafts((prev) => {
        const next = { ...prev }
        delete next[index]
        return next
      })
    }

    return (
      <div className={`space-y-4 ${compact ? 'text-sm' : ''}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className={`text-sm font-semibold ${darkMode ? 'text-gray-100' : 'text-gray-800'}`}>
            元素约束
          </h4>
          <button type="button" className={btnSecondary(darkMode)} onClick={resetProductConstraintsToDefault}>
            恢复默认
          </button>
        </div>

        <div className={`overflow-hidden rounded-lg border ${border}`}>
          <div className="overflow-auto">
            <table className="w-full table-fixed text-sm" style={{ minWidth: constraintTableMinWidth }}>
              <thead className={head}>
                <tr>
                  <th className={`sticky left-0 z-20 w-24 px-2 py-2 text-center font-semibold ${stickyHead}`}>产物</th>
                  <th className={`sticky left-24 z-20 w-20 px-2 py-2 text-center font-semibold ${stickyHead}`}>项目</th>
                  {productConstraintRows.map((row) => (
                    <th key={row.element} className={`w-[76px] border-l px-1 py-2 text-center font-semibold ${border}`}>
                      {elementSymbolLabel(row.element)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {OXY_SIDE_BLOW_PRODUCT_KEYS.map((productKey) => (
                  <Fragment key={productKey}>
                    <tr>
                      <td rowSpan={2} className={`${stickyCell} left-0 text-center font-semibold`}>
                        {OXY_PRODUCT_KEY_TO_CN[productKey]}
                      </td>
                      <td className={`${stickyCell} left-24 text-center ${muted}`}>约束</td>
                      {productConstraintRows.map((row) => {
                        const type = selectedRuleType(productKey, row.element)
                        const canCarry = productCanCarryConstraintElement(productConstraintConfig, productKey, row.element)
                        const ignored = !type
                        const cellTitle = ignored ? '未参与计算，可选择 W/D' : canCarry ? undefined : `${OXY_PRODUCT_KEY_TO_CN[productKey]} 不能承接 ${row.element}`
                        return (
                          <td key={`${productKey}-${row.element}-type`} className={`${tableCell} ${ignored ? ignoredCell : ''}`} title={cellTitle}>
                            <div className="relative" data-product-constraint-rule-menu>
                              <button
                                type="button"
                                className={`${ruleMenuTrigger} ${ignored ? ignoredControl : ''} ${type && !canCarry ? unsupportedControl : ''}`}
                                aria-haspopup="listbox"
                                aria-expanded={openProductConstraintRuleMenu === productConstraintCellDraftKey(productKey, row.element, type || 'W%')}
                                title={cellTitle}
                                onClick={() => {
                                  const menuKey = productConstraintCellDraftKey(productKey, row.element, type || 'W%')
                                  setOpenProductConstraintRuleMenu((current) => (current === menuKey ? null : menuKey))
                                }}
                              >
                                <span className="block w-full text-center">{type ? OXY_DISTRIBUTION_RULE_LABELS[type] : '\u2014'}</span>
                                <span
                                  aria-hidden="true"
                                  className={`pointer-events-none absolute right-2 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rotate-45 border-b border-r ${selectArrow}`}
                                />
                              </button>
                              {openProductConstraintRuleMenu === productConstraintCellDraftKey(productKey, row.element, type || 'W%') && (
                                <div className={ruleMenuPanel} role="listbox">
                                  {OXY_DISTRIBUTION_RULE_OPTIONS.map((ruleType) => (
                                    <button
                                      key={ruleType || 'empty'}
                                      type="button"
                                      className={ruleMenuOption}
                                      role="option"
                                      aria-selected={type === ruleType}
                                      onClick={() =>
                                        updateProductDistributionConstraintType(productKey, row.element, ruleType)
                                      }
                                    >
                                      {ruleType ? OXY_DISTRIBUTION_RULE_LABELS[ruleType] : '\u2014'}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          </td>
                        )
                      })}
                    </tr>
                    <tr>
                      <td className={`${stickyCell} left-24 text-center ${muted}`}>数值</td>
                      {productConstraintRows.map((row) => {
                        const type = selectedRuleType(productKey, row.element)
                        const canCarry = productCanCarryConstraintElement(productConstraintConfig, productKey, row.element)
                        const ignored = !type
                        const cellTitle = ignored ? '未参与计算，选择 W/D 后可填数值' : canCarry ? undefined : `${OXY_PRODUCT_KEY_TO_CN[productKey]} 不能承接 ${row.element}`
                        const values = productRuleMaps[productKey]?.[row.element] ?? {}
                        return (
                          <td key={`${productKey}-${row.element}-value`} className={`${tableCell} ${ignored ? ignoredCell : ''}`} title={cellTitle}>
                            <input
                              className={`${valueInput} ${ignored ? ignoredControl : ''} ${type && !canCarry ? unsupportedControl : ''}`}
                              value={type ? productDistributionConstraintDraftValue(productKey, row.element, type, values[type]) : ''}
                              disabled={!type || !canCarry}
                              title={cellTitle}
                              placeholder={type ? '' : '\u2014'}
                              onChange={(event) =>
                                type && setProductDistributionConstraintDraft(productKey, row.element, type, event.target.value)
                              }
                              onFocus={(event) => {
                                if (!type) return
                                const fullValue = formatConstraintRuleValue(values[type])
                                if (event.currentTarget.value !== fullValue) {
                                  setProductDistributionConstraintDraft(productKey, row.element, type, fullValue)
                                }
                                event.currentTarget.select()
                              }}
                              onBlur={() => type && commitProductDistributionConstraintDraft(productKey, row.element, type, values[type])}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                  event.currentTarget.blur()
                                }
                              }}
                            />
                          </td>
                        )
                      })}
                    </tr>
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className={`overflow-hidden rounded-lg border ${border}`}>
          <div className={`px-3 py-2 text-sm font-semibold ${head}`}>自定义约束</div>
          <div className="overflow-auto">
            <table className="w-full min-w-[820px] table-fixed text-sm">
              <thead className={head}>
                <tr>
                  <th className="w-[52px] px-2 py-1.5 text-center font-semibold">序号</th>
                  <th className="px-2 py-1.5 text-center font-semibold">约束</th>
                  <th className="w-[132px] px-2 py-1.5 text-center font-semibold">数值</th>
                  <th className="w-[42px] px-0 py-1.5 text-center font-semibold">操作</th>
                </tr>
              </thead>
              <tbody>
                {customRows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className={`${tableCell} text-center ${muted}`}>
                      暂无自定义约束
                    </td>
                  </tr>
                ) : (
                  customRows.map(({ constraint, index }, rowIndex) => {
                    const currentExpr = customConstraintExprDrafts[index] ?? constraint.expr
                    let syntaxValid = true
                    try {
                      parseConstraintExpression(currentExpr)
                    } catch {
                      syntaxValid = false
                    }
                    return (
                      <tr key={`${constraint.expr}-${index}`}>
                        <td className={`${tableCell} text-center font-mono tabular-nums`}>
                          {rowIndex + 1}
                        </td>
                        <td className={tableCell}>
                          <input
                            className={`${textInput} ${syntaxValid ? '' : darkMode ? 'border-red-500 text-red-200' : 'border-red-400 text-red-700'}`}
                            value={customExprValue(index, constraint.expr)}
                            title={displayConstraintExpression(currentExpr)}
                            aria-label={`约束表达式：${displayConstraintExpression(currentExpr)}`}
                            onFocus={(event) => {
                              setCustomExprDraft(index, constraint.expr)
                              event.currentTarget.select()
                            }}
                            onChange={(event) => setCustomExprDraft(index, event.target.value)}
                            onBlur={() => commitCustomExprDraft(index, constraint.expr)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') {
                                event.currentTarget.blur()
                              }
                            }}
                          />
                        </td>
                        <td className={tableCell}>
                          <input
                            className={valueInput}
                            value={customTargetValue(index, constraint.target)}
                            onChange={(event) => {
                              if (!isEditableNumberDraft(event.target.value)) return
                              setCustomTargetDraft(index, event.target.value)
                            }}
                            onFocus={(event) => event.currentTarget.select()}
                            onBlur={() => commitCustomTargetDraft(index, constraint.target)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') event.currentTarget.blur()
                            }}
                          />
                        </td>
                        <td className={actionCell}>
                          <button
                            type="button"
                            className={deleteIconButton}
                            aria-label="删除自定义约束"
                            title="删除自定义约束"
                            onClick={() => {
                              setCustomConstraintExprDrafts((prev) => shiftDraftEntriesAfterRemoval(prev, index))
                              setCustomConstraintTargetDrafts((prev) => shiftDraftEntriesAfterRemoval(prev, index))
                              updateProductConstraintConfig((config) => removeCustomConstraintEntry(config, index))
                            }}
                          >
                            ×
                          </button>
                        </td>
                      </tr>
                    )
                  })
                )}
                <tr>
                  <td className={`${tableCell} text-center ${muted}`}>—</td>
                  <td className={tableCell}>
                    <input
                      className={textInput}
                      value={newCustomConstraintDraft.expr}
                      title={newCustomConstraintDraft.expr ? displayConstraintExpression(newCustomConstraintDraft.expr) : constraintSyntaxHint}
                      placeholder=""
                      onChange={(event) =>
                        setNewCustomConstraintDraft((prev) => ({ ...prev, expr: event.target.value }))
                      }
                    />
                  </td>
                  <td className={tableCell}>
                    <input
                      className={valueInput}
                      value={newCustomConstraintDraft.target}
                      onChange={(event) => {
                        if (!isEditableNumberDraft(event.target.value)) return
                        setNewCustomConstraintDraft((prev) => ({ ...prev, target: event.target.value }))
                      }}
                    />
                  </td>
                  <td className={actionCell}>
                    <button
                      type="button"
                      className={iconButton}
                      onClick={addCustomConstraint}
                      aria-label="增加自定义约束"
                      title={constraintSyntaxHint}
                    >
                      +
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    )
  }
  const updateHeatField = (setter: (value: string) => void, value: string) => {
    setter(value)
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
        ? formatTableNumber(100 - Math.min(100, Math.max(0, toNumber(nitrogenText, DEFAULT_COPPER_OXYGEN_AIR_SETTINGS.nitrogenPct))))
        : oxygenAirO2Pct
    const nextNitrogenText =
      editedOxygen || !editedNitrogen
        ? isValidNumberText(oxygenText)
          ? formatTableNumber(100 - Math.min(100, Math.max(0, toNumber(oxygenText, DEFAULT_COPPER_OXYGEN_AIR_SETTINGS.oxygenPct))))
          : oxygenAirN2Pct
        : nitrogenText
    setOxygenAirO2Pct(nextOxygenText)
    setOxygenAirN2Pct(nextNitrogenText)
    if (isValidNumberText(nextOxygenText) && isValidNumberText(nextNitrogenText)) {
      const next = createOxygenAirColumn(oxygenAirColumn.weight, {
        oxygenPct: toNumber(nextOxygenText, DEFAULT_COPPER_OXYGEN_AIR_SETTINGS.oxygenPct),
        nitrogenPct: toNumber(nextNitrogenText, DEFAULT_COPPER_OXYGEN_AIR_SETTINGS.nitrogenPct),
      })
      updateAirColumn(oxygenAirColumn.id, { ratios: next.ratios })
    } else {
      resetProductCalculation()
      setHeatBalanced(false)
    }
  }

  const updateEquipmentAdjustment = (id: EquipmentStageId, value: string) => {
    setEquipmentAdjustments((prev) => ({ ...prev, [id]: value }))
  }

  const runHeatBalanceCalculation = async () => {
    if (isHeatBalanceCalculating) return
    if (!productFilledBack) {
      setWorkflowMessage(workflowStepMessage(5, '请先完成产出计算并回填到配料总表。'), 'flow')
      scrollToProductCalculation()
      return
    }
    if (!heatInputValid) {
      setWorkflowMessage(workflowStepMessage(6, '请先补全温度、热损失、燃料参数和富氧空气设置。'), 'flow')
      openHeatBalanceAssist()
      scrollToAssist(heatBalanceRef)
      return
    }
    openHeatBalanceAssist()
    setIsHeatBalanceCalculating(true)
    setHeatBalanceCalculationStep(0)
    setHeatBalanced(false)
    try {
      const advanceHeatBalanceStep = async (step: number) => {
        setHeatBalanceCalculationStep(step)
        await new Promise<void>((resolve) => {
          window.requestAnimationFrame(() => window.setTimeout(resolve, 120))
        })
      }
      for (let step = 0; step < HEAT_BALANCE_CALCULATION_STEPS.length; step += 1) {
        await advanceHeatBalanceStep(step)
      }
      setCalculatedHeatBalance(heatBalance)
      setHeatBalanced(true)
      setHeatBalanceEngaged(true)
      setWorkflowMessage(
        workflowStepMessage(
          6,
          `热平衡计算完成：热缺口 ${format(Math.max(0, heatBalance.heatDeficitMJh), 0)} MJ/h，推荐燃料煤 ${format(heatBalance.requiredFuelWeight)} t/h。热平衡算法优化中，当前结果仅供参考。`
        ),
        'success'
      )
      scrollToAssist(heatBalanceRef)
    } finally {
      setIsHeatBalanceCalculating(false)
    }
  }

  const appendDraftPhaseRow = (materialId: string) => {
    const draftRow = createDraftMaterialPhaseRow()
    setMaterialPhaseRows((prev) => ({
      ...prev,
      [materialId]: [...ensureMaterialPhaseRows(prev[materialId]), draftRow],
    }))
    setPhaseRowFormulaDrafts((prev) => ({
      ...prev,
      [rowDraftStorageKey(materialId, draftRow.id)]: '',
    }))
    setPhasePreviewUnknowns((prev) => (prev?.materialId === materialId ? null : prev))
    setPhaseBatchResults((prev) => dropPhaseBatchResult(prev, materialId))
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
    const existingRows = ensureMaterialPhaseRows(materialPhaseRows[materialId])
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
      [materialId]: ensureMaterialPhaseRows(prev[materialId]).map((row) =>
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
    setPhaseBatchResults((prev) => dropPhaseBatchResult(prev, materialId))
  }

  const removeMaterialPhaseRow = (materialId: string, rowId: string) => {
    const row = ensureMaterialPhaseRows(materialPhaseRows[materialId]).find((item) => item.id === rowId)
    if (row?.kind === 'other') {
      setWorkflowMessage('Other 为默认闭合物相，不能删除。', 'error')
      return
    }
    const key = rowDraftStorageKey(materialId, rowId)
    setMaterialPhaseRows((prev) => ({
      ...prev,
      [materialId]: ensureMaterialPhaseRows(prev[materialId]).filter((row) => row.id !== rowId),
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
    setPhaseBatchResults((prev) => dropPhaseBatchResult(prev, materialId))
    setWorkflowMessage('已删除物相行。', 'success')
  }

  const calculatePhaseUnknownsPreview = async () => {
    if (isPhaseCalculating) return
    if (!selectedPhaseMaterial) return
    const phaseError = validateMaterialForPhaseCalc(selectedPhaseMaterial)
    if (phaseError) {
      setWorkflowMessage(phaseMaterialValidationGuidance(selectedPhaseMaterial, phaseError), 'error')
      return
    }
    if (hasPendingDraftRows) {
      setWorkflowMessage('请先完成待填写的物相名称，或删除空白行后再计算。', 'flow')
      return
    }
    if (hasFormulaErrors) {
      setWorkflowMessage('请先修正物相名称输入错误后再计算。', 'error')
      return
    }
    setIsPhaseCalculating(true)
    try {
      const nextBatch: PhaseBatchResults = { ...(phaseBatchResults ?? {}) }
      const result = computeMaterialPhaseResult(
        selectedPhaseMaterial.id,
        selectedPhaseMaterial.name,
        selectedPhaseMaterial.weight,
        selectedPhaseMaterial.ratios,
        activeMaterialPhaseRows
      )
      if (!result.valid) {
        delete nextBatch[selectedPhaseMaterial.id]
        setPhasePreviewUnknowns(null)
        setPhaseBatchResults(nextBatch)
        setWorkflowMessage(result.message ?? '物相方程无法求解，请调整物相行或化验值。', 'error')
        return
      }
      nextBatch[selectedPhaseMaterial.id] = result
      const current = nextBatch[selectedPhaseMaterial.id]
      if (!current?.valid) {
        setPhasePreviewUnknowns(null)
        setPhaseBatchResults(nextBatch)
        setWorkflowMessage(current?.message ?? '当前原料物相方程无法求解，请调整物相行或化验值。', 'error')
        return
      }
      setPhaseBatchResults(nextBatch)
      setPhasePreviewUnknowns(buildPhasePreviewUnknowns(selectedPhaseMaterial.id, current))
      setWorkflowMessage(null)
    } finally {
      setIsPhaseCalculating(false)
    }
  }

  const applyPhaseUnknowns = () => {
    if (!selectedPhaseMaterial) return
    const currentResult = phaseBatchResults?.[selectedPhaseMaterial.id]
    if (!currentResult) {
      setWorkflowMessage('请先计算物相成分，再回填到配料总表。', 'flow')
      return
    }
    if (!currentResult.valid) {
      setWorkflowMessage(
        `${displayRawMaterialName(selectedPhaseMaterial.name)} 的物相方程不可解，请修正后再回填。`,
        'error'
      )
      return
    }
    const nextCompleted = { ...phaseCompletedMaterials }
    nextCompleted[selectedPhaseMaterial.id] = true

    setRawMaterials((prev) =>
      prev.map((material) => {
        if (material.id !== selectedPhaseMaterial.id) return material
        return {
          ...material,
          ratios: normalizeCopperRatios({
            ...material.ratios,
            ...currentResult.unknowns,
          }),
        }
      })
    )
    setSolventSolution(null)
    resetProductCalculation()
    setHeatBalanced(false)
    resetProductCalculation()
    setHeatBalanced(false)
    setPhaseCompletedMaterials(nextCompleted)
    setPhaseCompleted(rawMaterials.every((material) => !material.name.trim() || nextCompleted[material.id] === true))

    const nextOverrides = { ...phaseRatioOverrides }
    const nextManualColumns = { ...manualPhaseRatioColumns }
    const phases = phaseContentsToInputPhaseMap(
      currentResult.phaseContents,
      ensureMaterialPhaseRows(materialPhaseRows[selectedPhaseMaterial.id]),
      currentResult.unknowns
    )
    nextOverrides[selectedPhaseMaterial.id] = formatPhasePercentDraft(phases)
    nextManualColumns[selectedPhaseMaterial.id] = true
    delete nextOverrides.blend
    delete nextManualColumns.blend
    setPhaseRatioOverrides(nextOverrides)
    setManualPhaseRatioColumns(nextManualColumns)
    setBatchTableView('phase')
    setBatchTableHighlight(true)
    window.setTimeout(() => setBatchTableHighlight(false), 1000)
    calculationTableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })

    setPhaseMaterialId(selectedPhaseMaterial.id)
    setPhasePreviewUnknowns(buildPhasePreviewUnknowns(selectedPhaseMaterial.id, currentResult))

    setWorkflowMessage(`已回填 ${displayRawMaterialName(selectedPhaseMaterial.name)} 的物相成分到配料总表。`, 'success')
    scrollToCalculationTable()
  }

  const persistCopperCases = (recordsForMethod: CopperCaseRecord[]) => {
    const others = allCaseRecords.filter(
      (record) => normalizeCopperSmeltMethodId(record.smeltMethodId) !== normalizedSmeltMethodId
    )
    const sortedRecords = sortCopperCaseRecords([...recordsForMethod, ...others])
    setAllCaseRecords(sortedRecords)
    writeCopperCaseRecords(sortedRecords)
  }

  const buildCaseSnapshot = (base?: Partial<Pick<CopperCaseRecord, 'id' | 'name' | 'createdAt' | 'stageId'>>): CopperCaseRecord => {
    const now = new Date()
    return {
      id: base?.id ?? createCopperCaseId(now),
      name: base?.name ?? formatCopperCaseName(now, smeltMethodName),
      createdAt: base?.createdAt ?? now.toISOString(),
      updatedAt: now.toISOString(),
      smeltMethodId: normalizedSmeltMethodId,
      stageId: isCopperCaseStageId(activeSheet) ? activeSheet : base?.stageId ?? 'cu_smelting',
      rawMaterials: rawMaterials.map(cloneMaterialColumn),
      rawWeightDrafts: { ...rawWeightDrafts },
      solventColumns: solventColumns.map(cloneMaterialColumn),
      fuelColumn: cloneFuelMaterial(fuelColumn),
      oxygenAirColumn: cloneMaterialColumn(oxygenAirColumn),
      airColumns: airColumns.map(cloneMaterialColumn),
      targetFeSiO2,
      targetCaOSiO2,
      solventSolution: cloneSolventSolution(solventSolution),
      phaseCompletedMaterials: { ...phaseCompletedMaterials },
      phasePreviewUnknowns: phasePreviewUnknowns
        ? {
            materialId: phasePreviewUnknowns.materialId,
            phaseContents: { ...phasePreviewUnknowns.phaseContents },
            values: { ...phasePreviewUnknowns.values },
          }
        : null,
      phaseBatchResults: phaseBatchResults ? { ...phaseBatchResults } : null,
      manualPhaseCells: { ...manualPhaseCells },
      manualSolventWeights: { ...manualSolventWeights },
      manualFuelWeightValid,
      manualAirWeightValid,
      phaseCompleted,
      productCalculated,
      productFilledBack,
      productSolverResult: productCalculated && oxySolverResult ? cloneOxySolverResult(oxySolverResult) : null,
      heatBalanced,
      calculatedHeatBalance: heatBalanced && calculatedHeatBalance ? cloneHeatBalanceResult(calculatedHeatBalance) : null,
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
      lossTemperature,
      heatLossMJh,
      otherHeatMJh,
      annualHours,
      equipmentIntensity,
      targetScaleWanTpa,
      equipmentAdjustments: { ...equipmentAdjustments },
      batchTableView,
      phaseRatioOverrides: { ...phaseRatioOverrides },
      manualPhaseRatioColumns: { ...manualPhaseRatioColumns },
      productDistributionDrafts: cloneProductDistributionDrafts(productDistributionDrafts),
      productPhaseOverrides: { ...productPhaseOverrides },
      productPhaseManual,
      productConstraintConfig: cloneOxyConstraintConfig(productConstraintConfig),
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
      phaseMaterialId,
      phaseAssistTabMaterialIds: [...phaseAssistTabMaterialIds],
    }
  }

  const buildBlankCaseRecord = (name: string): CopperCaseRecord => {
    const now = new Date()
    const defaultRawMaterials = createDefaultCopperMaterials()
    const defaultAirColumns = createProcessAirColumns()
    return {
      id: createCopperCaseId(now),
      name,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      smeltMethodId: normalizedSmeltMethodId,
      stageId: 'cu_smelting',
      rawMaterials: defaultRawMaterials.map(cloneMaterialColumn),
      rawWeightDrafts: Object.fromEntries(defaultRawMaterials.map((material) => [material.id, ''])),
      solventColumns: createDefaultSolventColumns().map(cloneMaterialColumn),
      fuelColumn: cloneFuelMaterial(DEFAULT_COPPER_FUEL),
      oxygenAirColumn: cloneMaterialColumn(defaultAirColumns.find((column) => column.airRole === 'oxygen') ?? defaultAirColumns[0]!),
      airColumns: defaultAirColumns.map(cloneMaterialColumn),
      targetFeSiO2: '2.8',
      targetCaOSiO2: '0.45',
      solventSolution: null,
      phaseCompletedMaterials: {},
      phasePreviewUnknowns: null,
      phaseBatchResults: null,
      manualPhaseCells: {},
      manualSolventWeights: {},
      manualFuelWeightValid: false,
      manualAirWeightValid: false,
      phaseCompleted: false,
      productCalculated: false,
      productFilledBack: false,
      productSolverResult: null,
      heatBalanced: false,
      calculatedHeatBalance: null,
      fuelLhv: String(DEFAULT_COPPER_FUEL.lowerHeatingValueMJkg),
      fuelEfficiency: String(DEFAULT_COPPER_FUEL.combustionEfficiency),
      oxygenAirO2Pct: DEFAULT_OXYGEN_AIR_O2_TEXT,
      oxygenAirN2Pct: DEFAULT_OXYGEN_AIR_N2_TEXT,
      oxygenSupplyCoefficient: '1.15',
      feedTemperature: '25',
      matteTemperature: '1300',
      slagTemperature: '1350',
      gasTemperature: '1350',
      dustTemperature: '1350',
      lossTemperature: '1350',
      heatLossMJh: '1500',
      otherHeatMJh: '0',
      annualHours: '7200',
      equipmentIntensity: '32',
      targetScaleWanTpa: '10',
      equipmentAdjustments: { smelting: '1', converting: '1', refining: '1' },
      batchTableView: 'element',
      phaseRatioOverrides: {},
      manualPhaseRatioColumns: {},
      productDistributionDrafts: productModelToDrafts(DEFAULT_COPPER_PRODUCT_MODEL),
      productPhaseOverrides: {},
      productPhaseManual: false,
      productConstraintConfig: createDefaultProductConstraintConfig(),
      customPhaseRows: {},
      materialPhaseRows: {},
      phaseMaterialId: null,
      phaseAssistTabMaterialIds: [],
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

  const createNewCase = () => {
    const caseName = newCaseName.trim()
    if (!caseName) {
      setCaseMessage('请输入案例名称后再新建案例。')
      return
    }
    const record = buildBlankCaseRecord(caseName)
    persistCopperCases([record, ...caseRecords])
    openCopperCase(record)
    setNewCaseName(suggestCopperCaseName(smeltMethodName))
    setCaseMessage(`已新建案例：${record.name}`)
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
    let nextSolventColumns = (record.solventColumns?.length ? record.solventColumns : createDefaultSolventColumns()).map(cloneMaterialColumn)
    let nextAirColumns = normalizeProcessAirColumns(record.airColumns, record.oxygenAirColumn)
    let nextFuelColumn = record.fuelColumn ? cloneFuelMaterial(record.fuelColumn) : cloneFuelMaterial(DEFAULT_COPPER_FUEL)
    const nextPhaseBatchResults = record.phaseBatchResults ?? null
    const nextProductConstraintConfig = normalizeOxyConstraintConfig(record.productConstraintConfig)
    const nextMaterialPhaseRows = Object.fromEntries(
      Object.entries(record.materialPhaseRows ?? {}).map(([materialId, rows]) => [
        materialId,
        ensureMaterialPhaseRows(rows),
      ])
    )
    const savedProductSolverResult = normalizeOxySolverResult(record.productSolverResult)
    const recomputedProductState = record.productCalculated && !savedProductSolverResult
      ? restoreProductCalculationFromCaseState({
          rawMaterials: nextRawMaterials,
          solventColumns: nextSolventColumns,
          fuelColumn: nextFuelColumn,
          airColumns: nextAirColumns,
          phaseBatchResults: nextPhaseBatchResults,
          materialPhaseRows: nextMaterialPhaseRows,
          productConstraintConfig: nextProductConstraintConfig,
        })
      : null
    if (recomputedProductState) {
      nextSolventColumns = recomputedProductState.solventColumns
      nextAirColumns = recomputedProductState.airColumns
      nextFuelColumn = recomputedProductState.fuelColumn
    }
    const restoredProductSolverResult = savedProductSolverResult ?? recomputedProductState?.result ?? null
    const restoredProductCalculated = Boolean(record.productCalculated && restoredProductSolverResult)
    const restoredProductFilledBack = Boolean(
      (record.productFilledBack ?? record.productCalculated ?? false) && restoredProductSolverResult?.acceptable
    )
    const restoredHeatBalance = normalizeHeatBalanceResult(record.calculatedHeatBalance)
    const restoredHeatBalanced = Boolean(record.heatBalanced && restoredHeatBalance)
    setRawMaterials(nextRawMaterials)
    setRawWeightDrafts(record.rawWeightDrafts ?? Object.fromEntries(nextRawMaterials.map((material) => [material.id, material.weight > 0 ? String(material.weight) : ''])))
    setWaterWeightDrafts({})
    setSolventColumns(nextSolventColumns)
    setFuelColumn(nextFuelColumn)
    setAirColumns(nextAirColumns)
    setTargetFeSiO2(record.targetFeSiO2 ?? '2.8')
    setTargetCaOSiO2(record.targetCaOSiO2 ?? '0.45')
    setSolventSolution(cloneSolventSolution(record.solventSolution ?? null))
    setPhaseCompletedMaterials(record.phaseCompletedMaterials ?? {})
    setPhaseBatchResults(nextPhaseBatchResults)
    setManualPhaseCells(record.manualPhaseCells ?? {})
    setManualSolventWeights(record.manualSolventWeights ?? {})
    setManualFuelWeightValid(record.manualFuelWeightValid ?? false)
    setManualAirWeightValid(record.manualAirWeightValid ?? false)
    setPhaseCompleted(record.phaseCompleted ?? false)
    setProductCalculated(restoredProductCalculated)
    setProductFilledBack(restoredProductFilledBack)
    setOxySolverResult(restoredProductSolverResult)
    setHeatBalanced(restoredHeatBalanced)
    setCalculatedHeatBalance(restoredHeatBalance)
    setHeatBalanceEngaged(restoredHeatBalanced)
    setFuelLhv(record.fuelLhv ?? String(DEFAULT_COPPER_FUEL.lowerHeatingValueMJkg))
    setFuelEfficiency(record.fuelEfficiency ?? String(DEFAULT_COPPER_FUEL.combustionEfficiency))
    const nextOxygenAirText = normalizeOxygenAirText(record.oxygenAirO2Pct, record.oxygenAirN2Pct)
    setOxygenAirO2Pct(nextOxygenAirText.oxygen)
    setOxygenAirN2Pct(nextOxygenAirText.nitrogen)
    setOxygenSupplyCoefficient(record.oxygenSupplyCoefficient ?? '1.15')
    setFeedTemperature(record.feedTemperature ?? '25')
    setMatteTemperature(record.matteTemperature ?? '1300')
    setSlagTemperature(record.slagTemperature ?? '1350')
    setGasTemperature(record.gasTemperature ?? '1350')
    setDustTemperature(record.dustTemperature ?? '1350')
    setLossTemperature(record.lossTemperature ?? '1350')
    setHeatLossMJh(record.heatLossMJh ?? '1500')
    setOtherHeatMJh(record.otherHeatMJh ?? '0')
    setAnnualHours(record.annualHours ?? '7200')
    setEquipmentIntensity(record.equipmentIntensity ?? '32')
    setTargetScaleWanTpa(record.targetScaleWanTpa ?? '10')
    setEquipmentAdjustments(record.equipmentAdjustments ?? { smelting: '1', converting: '1', refining: '1' })
    setBatchTableView(normalizeBatchTableView(record.batchTableView, record.productFilledBack ?? record.productCalculated ?? false))
    setPhaseRatioOverrides(record.phaseRatioOverrides ?? {})
    setManualPhaseRatioColumns(record.manualPhaseRatioColumns ?? {})
    setProductDistributionDrafts(cloneProductDistributionDrafts(record.productDistributionDrafts))
    setProductPhaseOverrides(record.productPhaseOverrides ?? {})
    setProductPhaseManual(record.productPhaseManual ?? false)
    setProductConstraintConfig(nextProductConstraintConfig)
    setProductConstraintValueDrafts({})
    setCustomConstraintTargetDrafts({})
    setCustomConstraintExprDrafts({})
    setNewCustomConstraintDraft({ expr: '', target: '' })
    setCustomPhaseRows(record.customPhaseRows ?? {})
    setMaterialPhaseRows(nextMaterialPhaseRows)
    setInputPhaseDrafts({})
    setOutputPhaseDrafts({})
    setInvalidInputPhaseColumns({})
    setInvalidOutputPhaseColumns({})
    const restoredPhaseMaterialId = record.phaseMaterialId ?? null
    const validPhaseMaterialId =
      restoredPhaseMaterialId &&
      nextRawMaterials.some((material) => material.id === restoredPhaseMaterialId && material.name.trim())
        ? restoredPhaseMaterialId
        : nextRawMaterials.find((material) => material.name.trim() && nextPhaseBatchResults?.[material.id])?.id ??
          null
    setPhaseMaterialId(validPhaseMaterialId)
    setPhaseAssistTabMaterialIds(
      buildPhaseAssistTabMaterialIds(
        record.phaseAssistTabMaterialIds ?? [],
        validPhaseMaterialId,
        nextPhaseBatchResults
      ).filter((id) => nextRawMaterials.some((material) => material.id === id && material.name.trim()))
    )
    const savedPreview = record.phasePreviewUnknowns ?? null
    if (validPhaseMaterialId && nextPhaseBatchResults?.[validPhaseMaterialId]) {
      const result = nextPhaseBatchResults[validPhaseMaterialId]!
      if (savedPreview && savedPreview.materialId === validPhaseMaterialId) {
        setPhasePreviewUnknowns(savedPreview)
      } else {
        setPhasePreviewUnknowns(buildPhasePreviewUnknowns(validPhaseMaterialId, result))
      }
    } else {
      setPhasePreviewUnknowns(savedPreview)
    }
    setWorkflowMessage(null)
    setActiveCaseId(record.id)
    setCaseMessage(`已打开案例：${record.name}`)
    onActiveCaseNameChange?.(record.name)
    onStageSelect(normalizeCopperCaseStageId(record.stageId))
  }

  const renameCopperCase = (recordId: string | null, nextName: string, options?: { showMessage?: boolean }) => {
    const trimmed = nextName.trim()
    if (!recordId || !trimmed) return null
    const current = caseRecords.find((record) => record.id === recordId)
    if (!current || current.name === trimmed) return
    const updated = { ...current, name: trimmed, updatedAt: new Date().toISOString() }
    persistCopperCases([updated, ...caseRecords.filter((record) => record.id !== recordId)])
    if (activeCaseId === recordId) {
      onActiveCaseNameChange?.(trimmed)
    }
    if (options?.showMessage) {
      setCaseMessage(`已修改案例名称：${trimmed}`)
    }
    return updated
  }

  const renameActiveCase = (nextName: string) => {
    return renameCopperCase(activeCaseId, nextName)
  }

  const startEditingCaseName = (record: CopperCaseRecord) => {
    setEditingCaseNameId(record.id)
    setEditingCaseNameDraft(record.name)
  }

  const cancelEditingCaseName = () => {
    setEditingCaseNameId(null)
    setEditingCaseNameDraft('')
  }

  const commitEditingCaseName = () => {
    if (!editingCaseNameId) return
    const current = caseRecords.find((record) => record.id === editingCaseNameId)
    const trimmed = editingCaseNameDraft.trim()
    if (!current || !trimmed) {
      cancelEditingCaseName()
      return
    }
    renameCopperCase(current.id, trimmed, { showMessage: true })
    cancelEditingCaseName()
  }

  const handleEditingCaseNameBlur = () => {
    if (skipCaseNameBlurCommitRef.current) {
      skipCaseNameBlurCommitRef.current = false
      return
    }
    commitEditingCaseName()
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
      const imported = normalizeImportedCopperCase(JSON.parse(text), smeltMethodName)
      if (!imported) {
        setCaseMessage('未识别到有效的铜冶炼案例文件。')
        return
      }
      const record = { ...imported, smeltMethodId: normalizedSmeltMethodId }
      persistCopperCases([record, ...caseRecords])
      setCaseMessage(`已导入案例：${record.name}`)
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
    setActiveCaseId(null)
    onActiveCaseNameChange?.(null)
    setNewCaseName(suggestCopperCaseName(smeltMethodName))
    if (activeSheet !== 'raw_material') {
      onStageSelect('raw_material')
    }
  }, [normalizedSmeltMethodId, smeltMethodName])

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
    const renameTimer = window.setTimeout(() => {
      renameActiveCase(caseTitleDraft)
    }, 250)
    return () => window.clearTimeout(renameTimer)
  }, [caseTitleDraft])

  useEffect(() => {
    const handleRenameActiveCase = (event: Event) => {
      if (!(event instanceof CustomEvent)) return
      const nextName = typeof event.detail?.name === 'string' ? event.detail.name : ''
      if (nextName) renameActiveCase(nextName)
    }
    window.addEventListener('metcal:copper-rename-active-case', handleRenameActiveCase)
    return () => window.removeEventListener('metcal:copper-rename-active-case', handleRenameActiveCase)
  })

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

  const renderProductCalculationPanel = (
    key = 'product-calculation-panel',
    extraClassName = '',
    options: { showIntro?: boolean } = {}
  ) => {
    const showIntro = options.showIntro ?? true
    const hasResult = hasProductResult
    const recommendedFuelWeight = oxySolverResult?.recommended.fuelWeight ?? 0

    return (
      <div key={key} className={`space-y-4 ${extraClassName}`}>
        {showIntro && (
          <div className={`${hintText(darkMode)} space-y-1 text-sm leading-relaxed`}>
            <p>在配料总表完成混料投料量与各原料物相成分后，点击计算产出结果，计算成功后会直接回填到配料总表的产出页签。</p>
            <p>
              计算说明：先列举六产物元素闭合、元素质量守恒、元素约束与自定义约束方程，再求解熔炼渣、白铜锍、烟气、烟尘、无组织排放与损失的质量、物相组成及元素组成。
            </p>
          </div>
        )}
        {renderProductConstraintEditor()}
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            className={btnPrimary(darkMode)}
            onClick={calculateProductsFromProductTable}
            disabled={furnaceFeed.totalWeight <= 0 || isProductCalculating}
          >
            {isProductCalculating ? '计算中...' : '计算产出结果'}
          </button>
        </div>
        {hasResult && (
          <div className={assistAlertPanelClassName(darkMode, oxySolverResult?.acceptanceLevel === 'strict' ? 'success' : 'warning')}>
            {productFilledBack
              ? `${oxySolverResult?.acceptanceLevel === 'relaxed' ? `近似收敛（最大相对残差 ${format(oxySolverResult.maxRelativeResidual, 4)}）：` : '已回填：'}产出结果已写入配料总表产出-产物物相表与产出-产物元素表${
                  recommendedFuelWeight > 0 ? `；推荐燃料煤 ${format(recommendedFuelWeight)} t/h` : ''
                }。`
              : `已计算但未回填：产物总量 ${format(tableProductResult.totalProductMass)} t/h（${formatCopperProductMassSummary(
                  tableProductResult,
                  activeProcessStageId
                )}）。${
                  recommendedFuelWeight > 0 ? ` 推荐燃料煤 ${format(recommendedFuelWeight)} t/h。` : ''
                }${oxySolverResult && !oxySolverResult.acceptable ? ` ${oxySolverResult.message ?? '产出约束未完全满足，当前不可回填。'}` : ''}`}
          </div>
        )}
      </div>
    )
  }

  const renderProductCalculationIntro = () => (
    <div className={`${hintText(darkMode)} mt-4 space-y-1 text-sm leading-relaxed`}>
      <p>打开方式：在配料总表切换到产出-产物物相表或产出-产物元素表，未完成产出时会自动打开本区。</p>
      <p>
        计算说明：先列举六产物元素闭合、元素质量守恒、元素约束与自定义约束方程，再求解熔炼渣、白铜锍、烟气、烟尘、无组织排放与损失的质量、物相组成及元素组成。
      </p>
    </div>
  )

  const renderProductResultPlaceholder = () => (
    <div
      className={`rounded-lg border px-3 py-8 text-center text-sm ${
        darkMode ? 'border-gray-600 text-gray-400' : 'border-gray-200 text-gray-500'
      }`}
    >
      请在“产出计算”专区设置约束并点击“计算产出结果”，成功后会自动回填到这里。
    </div>
  )

  if (activeSheet === 'raw_material') {
    return (
      <div className="space-y-6">
        <div className={cardBase(darkMode)}>
          <div className={`flex flex-wrap items-start justify-between gap-4 border-b pb-4 ${darkMode ? 'border-gray-600' : 'border-gray-200'}`}>
            <div>
              <h3 className={sectionTitle(darkMode)}>
                {isEn ? `${smeltMethodName} Project Workspace` : `${smeltMethodName}项目工作区`}
              </h3>
              <p className={`${hintText(darkMode)} max-w-5xl leading-relaxed`}>
                {isEn
                  ? `Create and manage ${smeltMethodName.toLowerCase()} copper smelting cases. After creating a case, continue with smelting, converting, refining, and equipment selection in the same project.`
                  : `用于建立、管理和追溯${smeltMethodName}铜冶炼计算案例。新建案例后进入熔炼工作表，后续可在同一案例内完成吹炼、精炼和设备选型计算。`}
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
                列表记录已保存的{smeltMethodName}案例。点击案例名称可直接打开，更新时间表示上次修改时间。
              </p>
            </div>
          </div>
          {caseRecords.length === 0 ? (
            <div className={`rounded-lg border px-4 py-8 text-center text-sm ${darkMode ? 'border-gray-600 text-gray-400' : 'border-gray-200 text-gray-500'}`}>
              暂无历史案例，请先输入案例名称并新建案例。
            </div>
          ) : (
            <>
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
                  {pagedCaseRecords.map((record) => (
                    <tr key={record.id} className={`border-t ${darkMode ? 'border-gray-600' : 'border-gray-200'}`}>
                      <td className="px-3 py-2">
                        {editingCaseNameId === record.id ? (
                          <input
                            className={`${inputSm(darkMode)} h-8 w-full px-2 text-left font-medium`}
                            value={editingCaseNameDraft}
                            autoFocus
                            onFocus={(event) => event.currentTarget.select()}
                            onChange={(event) => setEditingCaseNameDraft(event.target.value)}
                            onBlur={handleEditingCaseNameBlur}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') {
                                event.preventDefault()
                                commitEditingCaseName()
                                skipCaseNameBlurCommitRef.current = true
                                event.currentTarget.blur()
                              }
                              if (event.key === 'Escape') {
                                event.preventDefault()
                                cancelEditingCaseName()
                                skipCaseNameBlurCommitRef.current = true
                                event.currentTarget.blur()
                              }
                            }}
                          />
                        ) : (
                          <button
                            className={`font-medium transition-colors hover:text-blue-600 ${darkMode ? 'text-gray-100 hover:text-blue-300' : 'text-gray-900'}`}
                            title="左键打开，右键修改名称"
                            onClick={() => openCopperCase(record)}
                            onContextMenu={(event) => {
                              event.preventDefault()
                              startEditingCaseName(record)
                            }}
                          >
                            {record.name}
                          </button>
                        )}
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
            <div className="mt-3">
              <ListPaginationBar
                darkMode={darkMode}
                visibleStart={caseVisibleStart}
                visibleEnd={caseVisibleEnd}
                total={caseRecords.length}
                page={normalizedCasePage}
                totalPages={caseTotalPages}
                pageSize={casePageSize}
                onPageSizeChange={(size) => {
                  setCasePageSize(size)
                  setCasePage(1)
                }}
                onPrevPage={() => setCasePage((page) => Math.max(1, page - 1))}
                onNextPage={() => setCasePage((page) => Math.min(caseTotalPages, page + 1))}
              />
            </div>
            </>
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
          <StageHeader darkMode={darkMode} activeSheet={activeSheet} />
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
                    <td className="px-2 py-1.5 text-center font-mono">{formatTableDisplayValue(row.currentThroughput)}</td>
                    <td className="px-2 py-1.5 text-center font-mono">{formatTableDisplayValue(row.sizing.currentAnnualWanTpa)} 万吨/a</td>
                    <td className="px-2 py-1.5 text-center font-mono">{formatTableDisplayValue(targetScaleValue)} 万吨/a</td>
                    <td className="px-2 py-1.5 text-center font-mono">{formatTableDisplayValue(row.sizing.scaleFactor)}</td>
                    <td className="px-2 py-1.5 text-center">
                      <input
                        className={`${inputSm(darkMode)} h-7 w-full px-1 py-0 text-center font-mono text-sm`}
                        value={equipmentAdjustments[row.id]}
                        onChange={(event) => updateEquipmentAdjustment(row.id, event.target.value)}
                      />
                    </td>
                    <td className="px-2 py-1.5 text-center font-mono">{formatTableDisplayValue(row.sizing.adjustedThroughput)}</td>
                    <td className="px-2 py-1.5 text-center font-mono">{row.sizing.recommendedUnits}</td>
                    <td className="px-2 py-1.5 text-center">
                      {row.mainOutput} {formatTableDisplayValue(row.outputThroughput)} t/h
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
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {isPhaseCalculating && (
        <IteratingOverlay
          darkMode={darkMode}
          title="物相计算中"
          description="计算中，请稍候…"
        />
      )}
      {isProductCalculating && (
        <IteratingOverlay
          darkMode={darkMode}
          title="产出计算中"
          description="正在计算产物组成，请稍候…"
          steps={['列举方程', '求解', '生成产物表']}
          currentStep={productCalculationStep}
        />
      )}
      {isHeatBalanceCalculating && (
        <IteratingOverlay
          darkMode={darkMode}
          title="热平衡计算中"
          description="正在汇总热收入、热支出与燃料煤需求，请稍候…"
          steps={[...HEAT_BALANCE_CALCULATION_STEPS]}
          currentStep={heatBalanceCalculationStep}
        />
      )}
      <WorkflowMessageToast
        darkMode={darkMode}
        message={workflowMessage?.text ?? null}
        tone={workflowMessage?.tone ?? 'flow'}
        onClose={() => setWorkflowMessage(null)}
      />
      <div ref={stagePageTopRef} className={stagePageTopShellClass(darkMode, stageEnterHighlight)}>
        <StageSheetTabs darkMode={darkMode} activeSheet={activeSheet} onStageSelect={confirmSaveBeforeCaseNavigation} />
        <StageHeader darkMode={darkMode} activeSheet={activeSheet} steps={isCopperProcessSheet ? workflowFlowSteps : undefined} />
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

      <div className={cardCompact(darkMode)}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-[16rem] flex-1">
            <h3 className={`${sectionTitle(darkMode)} mb-1`}>原料库</h3>
            <p className={`${hintText(darkMode)} leading-relaxed`}>
            原料库用于管理铜冶炼的所有原料数据。您可以在此修改现有原料的成分，或通过新增、导入来扩充原料库。
            </p>
          </div>
          <div className="flex w-full flex-wrap items-start justify-end gap-2 lg:w-auto">
            <div className="w-full sm:w-[20rem] lg:w-[23rem]">
              <label className="block">
                <span className="sr-only">原料名称搜索</span>
                <div
                  className={`relative h-10 rounded-lg border shadow-sm transition-colors ${
                    darkMode
                      ? 'border-gray-600 bg-gray-800 text-gray-100 focus-within:border-blue-400'
                      : 'border-gray-300 bg-white text-gray-900 focus-within:border-blue-500'
                  }`}
                >
                  <SearchIcon className={`pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`} />
                  <input
                    className={`h-full w-full rounded-lg bg-transparent pl-9 pr-8 text-sm outline-none placeholder:text-sm ${
                      darkMode ? 'placeholder:text-gray-500' : 'placeholder:text-gray-400'
                    }`}
                    value={librarySearchQuery}
                    placeholder="搜索原料名称"
                    onChange={(event) => updateLibrarySearchQuery(event.target.value)}
                  />
                  {librarySearchQuery && (
                    <button
                      type="button"
                      className={`absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-base leading-none transition-colors ${
                        darkMode ? 'text-gray-400 hover:bg-gray-700 hover:text-gray-100' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800'
                      }`}
                      aria-label="清空原料名称搜索"
                      title="清空原料名称搜索"
                      onClick={() => updateLibrarySearchQuery('')}
                    >
                      ×
                    </button>
                  )}
                </div>
              </label>
              {librarySearchText && (
                <div className={`mt-1 rounded-md border px-2 py-1 text-xs ${darkMode ? 'border-gray-600 bg-gray-800/70 text-gray-300' : 'border-gray-200 bg-gray-50 text-gray-600'}`}>
                  {libraryNameSearchMatches.length > 0 ? (
                    <div className="min-w-0 truncate">
                      已匹配 {libraryNameSearchMatches.length} 种含“{librarySearchText}”的原料：{librarySearchSuggestions.map((item) => item.name).join('、')}
                    </div>
                  ) : (
                    <span className="block min-w-0 truncate">暂无含“{librarySearchText}”的原料</span>
                  )}
                </div>
              )}
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <button className={btnSecondary(darkMode)} onClick={openLibraryMaterialAddDialog}>
                新增原料
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
        </div>

        <AddLibraryMaterialDialog
          darkMode={darkMode}
          mode={libraryMaterialDialogMode}
          open={showSingleLibraryAddDialog}
          message={libraryDialogMessage}
          rows={singleLibraryRows}
          elementColumns={dialogElementColumns}
          rowTotal={libraryRowLiveTotal}
          ratioInputValue={libraryRatioInputValue}
          onAddRow={addSingleLibraryRow}
          onRemoveRow={removeSingleLibraryRow}
          onNameChange={updateSingleLibraryRowName}
          onOtherRatioChange={(rowId, value) => updateSingleLibraryRowRatio(rowId, 'Other(其他)', value)}
          onColumnRatioChange={updateSingleLibraryRowRatio}
          onColumnRatioBlur={commitLibraryRatioDraft}
          onAddColumn={addDialogElementColumn}
          onRemoveColumn={removeDialogElementColumn}
          onColumnNameChange={updateDialogElementColumnName}
          onColumnNameBlur={blurDialogElementColumnName}
          onCancel={closeLibraryMaterialDialog}
          onSubmit={submitLibraryMaterialDialog}
        />

        {libraryImportError && (
          <div className={`mt-3 rounded-lg border px-3 py-2 text-sm ${darkMode ? 'border-red-700 bg-red-950/30 text-red-100' : 'border-red-200 bg-red-50 text-red-700'}`}>
            {libraryImportError}
          </div>
        )}

        {showLibrary && (
          <div className="mt-4 space-y-3">
            <div className={`rounded-lg border p-3 ${darkMode ? 'border-gray-600 bg-gray-900/30' : 'border-gray-200 bg-gray-50/60'}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className={`text-sm font-semibold ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>元素筛选</div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <button type="button" className={btnSecondary(darkMode)} onClick={addLibraryElementFilter}>
                    + 元素筛选
                  </button>
                  {libraryElementFilters.length > 0 && (
                    <button type="button" className={btnSecondary(darkMode)} onClick={resetLibraryFilters}>
                      清空筛选
                    </button>
                  )}
                </div>
              </div>
              {libraryElementFilters.length > 0 && (
                <div className="mt-3 grid gap-2 lg:grid-cols-2 xl:grid-cols-3">
                  {libraryElementFilters.map((filter) => (
                    <div
                      key={filter.id}
                      className={`grid grid-cols-[minmax(5.5rem,7rem)_minmax(4.5rem,1fr)_minmax(4.5rem,1fr)_auto] items-end gap-2 rounded-lg border p-2 ${
                        darkMode ? 'border-gray-600 bg-gray-800/60' : 'border-gray-200 bg-white'
                      }`}
                    >
                      <label className="min-w-0">
                        <span className={`mb-1 block text-xs font-medium ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>元素</span>
                        <select
                          className={`${inputSm(darkMode)} h-8 w-full px-1 text-center`}
                          value={filter.element}
                          onChange={(event) =>
                            updateLibraryElementFilter(filter.id, { element: event.target.value as CopperElementKey })
                          }
                        >
                          {COPPER_ELEMENT_KEYS.map((element) => (
                            <option key={element} value={element}>
                              {element.replace(/\(.+\)/, '')}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="min-w-0">
                        <span className={`mb-1 block text-xs font-medium ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>最小</span>
                        <input
                          className={`${inputSm(darkMode)} h-8 w-full px-1 text-center tabular-nums`}
                          value={filter.min}
                          placeholder="0"
                          onChange={(event) => updateLibraryElementFilter(filter.id, { min: event.target.value })}
                        />
                      </label>
                      <label className="min-w-0">
                        <span className={`mb-1 block text-xs font-medium ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>最大</span>
                        <input
                          className={`${inputSm(darkMode)} h-8 w-full px-1 text-center tabular-nums`}
                          value={filter.max}
                          placeholder="100"
                          onChange={(event) => updateLibraryElementFilter(filter.id, { max: event.target.value })}
                        />
                      </label>
                      <button
                        type="button"
                        className={`${libraryActionButtonClass(darkMode, 'delete')} h-8 self-end px-2`}
                        onClick={() => removeLibraryElementFilter(filter.id)}
                      >
                        删除
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className={`overflow-auto rounded-lg border ${darkMode ? 'border-gray-600' : 'border-gray-200'}`}>
              <table className="w-full min-w-[1020px] table-fixed text-sm">
                <colgroup>
                  <col className="w-[3rem]" />
                  <col className="w-[6.75rem]" />
                  {libraryElementKeys.map((element) => (
                    <col key={element} className="w-[2.875rem]" />
                  ))}
                  <col className="w-[7rem]" />
                </colgroup>
                <thead className={darkMode ? 'bg-gray-800 text-gray-300' : 'bg-gray-50 text-gray-600'}>
                  <tr>
                    <th className="px-1 py-2 text-center text-sm font-semibold">序号</th>
                    <th className="px-1 py-2 text-center text-sm font-semibold">原料</th>
                    {libraryElementKeys.map((element) => (
                      <th key={element} className="px-0.5 py-2 text-center text-sm font-semibold leading-tight">
                        {element.replace(/\(.+\)/, '')}
                      </th>
                    ))}
                    <th className="px-0.5 py-2 text-center text-sm font-semibold">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedMaterialLibrary.length === 0 ? (
                    <tr>
                      <td
                        colSpan={libraryElementKeys.length + 3}
                        className={`border-t px-3 py-6 text-center text-sm ${darkMode ? 'border-gray-600 text-gray-400' : 'border-gray-200 text-gray-500'}`}
                      >
                        无匹配原料
                      </td>
                    </tr>
                  ) : (
                    pagedMaterialLibrary.map((material, index) => (
                      <tr key={material.id} className={`border-t ${darkMode ? 'border-gray-600' : 'border-gray-200'}`}>
                        <td className="px-1 py-1.5 text-center align-middle font-mono text-sm tabular-nums">
                          {(normalizedLibraryPage - 1) * libraryPageSize + index + 1}
                        </td>
                        <td
                          className="px-1 py-1.5 text-center align-middle font-medium"
                          title={material.name}
                        >
                          <span className="block truncate">{material.name}</span>
                        </td>
                        {libraryElementKeys.map((element) => (
                          <td key={element} className="px-0.5 py-1.5 text-center align-middle font-mono text-sm tabular-nums leading-none">
                            {formatTableDisplayValue(material.ratios[element] ?? 0)}
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
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <ListPaginationBar
              darkMode={darkMode}
              visibleStart={libraryVisibleStart}
              visibleEnd={libraryVisibleEnd}
              total={filteredMaterialLibrary.length}
              summarySuffix={`原料库共 ${materialLibrary.length} 种`}
              page={normalizedLibraryPage}
              totalPages={libraryTotalPages}
              pageSize={libraryPageSize}
              onPageSizeChange={(size) => {
                setLibraryPageSize(size)
                setLibraryPage(1)
              }}
              onPrevPage={() => setLibraryPage((page) => Math.max(1, page - 1))}
              onNextPage={() => setLibraryPage((page) => Math.min(libraryTotalPages, page + 1))}
            />
          </div>
        )}
      </div>

      <div ref={calculationTableRef} className={cardCompact(darkMode)}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-2">
            <h3 className={`${sectionTitle(darkMode)} mb-0`}>配料总表</h3>
            <BatchTableViewTabs
              darkMode={darkMode}
              activeView={batchTableView}
              onChange={handleBatchTableViewChange}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {batchTableView === 'element' && (
              <>
                <button
                  type="button"
                  role="switch"
                  aria-checked={elementTableView === 'element'}
                  aria-label="投入表元素转换"
                  title={
                    elementTableView === 'compound'
                      ? '将 SiO₂/Al₂O₃/CaO/MgO 拆解为 Si/Al/Ca/Mg 与 O 元素显示'
                      : '恢复化合物列显示并编辑原始化验值'
                  }
                  className="inline-flex cursor-pointer items-center gap-2 border-0 bg-transparent p-0"
                  onClick={() => setElementTableView((v) => (v === 'compound' ? 'element' : 'compound'))}
                >
                  <span className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>元素转换</span>
                  <span
                    aria-hidden
                    className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                      elementTableView === 'element'
                        ? 'bg-blue-600'
                        : darkMode
                          ? 'bg-gray-600'
                          : 'bg-gray-300'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                        elementTableView === 'element' ? 'translate-x-4' : 'translate-x-0.5'
                      }`}
                    />
                  </span>
                </button>
                <button type="button" className={btnSecondary(darkMode)} onClick={addMaterial}>
                  + 添加原料
                </button>
                <BatchAddSolventControl
                  darkMode={darkMode}
                  onAddSolvent={addSolvent}
                />
              </>
            )}
            {batchTableView === 'productElement' && (
              <button
                type="button"
                role="switch"
                aria-checked={productElementTableView === 'element'}
                aria-label="产出表元素转换"
                title={
                  productElementTableView === 'compound'
                    ? '将 SiO₂/Al₂O₃/CaO/MgO 拆解为 Si/Al/Ca/Mg 与 O 元素显示'
                    : '恢复化合物列显示'
                }
                className="inline-flex cursor-pointer items-center gap-2 border-0 bg-transparent p-0"
                onClick={() => setProductElementTableView((v) => (v === 'compound' ? 'element' : 'compound'))}
              >
                <span className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>元素转换</span>
                <span
                  aria-hidden
                  className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                    productElementTableView === 'element'
                      ? 'bg-blue-600'
                      : darkMode
                        ? 'bg-gray-600'
                        : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                      productElementTableView === 'element' ? 'translate-x-4' : 'translate-x-0.5'
                    }`}
                  />
                </span>
              </button>
            )}
            <button type="button" className={btnSecondary(darkMode)} onClick={exportCalculationTable}>
              导出Excel
            </button>
          </div>
        </div>
        {batchTableView === 'element' ? (
        <div
          key="element-batch-view"
          className={`rounded-lg transition-all duration-300 batch-table-view-enter ${
            batchTableHighlight
              ? darkMode
                ? 'ring-2 ring-blue-500/60 ring-offset-2 ring-offset-gray-900'
                : 'ring-2 ring-blue-400/70 ring-offset-2 ring-offset-white'
              : ''
          }`}
        >
          <CopperBatchElementTable
            darkMode={darkMode}
            tableWidth={calculationTableWidth}
            nameColWidth={elementTableNameColWidth}
            elementKeys={elementTableKeys}
            elementDisplayMode={elementTableView}
            feedTotalWeight={Math.max(0, furnaceFeed.totalWeight - furnaceBlendWaterWeight)}
            rawConcentrateWeight={rawConcentrateBlend.totalWeight}
            rawConcentrateRatios={rawConcentrateBlend.ratios}
            rawConcentrateWaterWeight={rawConcentrateWaterWeight}
            rawMaterials={rawMaterials}
            solventColumns={solventColumns}
            fuelColumn={{ ...fuelColumn, name: displayFuelName(fuelColumn.name) }}
            airColumns={airColumns}
            furnaceFeedRatios={furnaceDryFeed.ratios}
            furnaceBlendWaterWeight={furnaceBlendWaterWeight}
            productTableColumns={[]}
            productTotalMass={0}
            productCalculated={false}
            materialLibrary={materialLibrary}
            formatTableNumber={formatTableNumber}
            solveInputClass={solveInputClass}
            materialSelectClass={materialSelectClass}
            productOutputCellClass={productOutputCellClass}
            ratioInputValue={ratioInputValue}
            rawWeightDrafts={rawWeightDrafts}
            waterWeightDrafts={waterWeightDrafts}
            ratioDrafts={ratioDrafts}
            phaseCellStatus={phaseCellStatus}
            sulfurInputStatus={sulfurInputStatus}
            rawWeightStatus={rawWeightStatus}
            solventWeightStatus={solventWeightStatus}
            fuelWeightStatus={fuelWeightStatus}
            oxygenAirInputStatus={oxygenAirInputStatus}
            waterWeightStatus={waterWeightStatus}
            phaseUnknownElements={PHASE_UNKNOWN_ELEMENTS}
            phaseCompleted={phaseCompleted}
            rawTotalOverLimit={(id) => {
              const material = rawMaterials.find((item) => item.id === id)
              return material ? isRawMaterialKnownTotalOverLimit(material.ratios) : false
            }}
            onRawWeightChange={updateRawWeight}
            onApplyLibraryMaterial={applyLibraryMaterial}
            onRemoveMaterial={removeMaterial}
            onRemoveSolvent={removeSolvent}
            onSolventNameChange={updateSolventName}
            onRawRatioChange={updateRawRatio}
            onRawRatioBlur={(id, element, value) => commitRatioDraft('raw', id, element, value)}
            onSolventWeightChange={updateSolventWeight}
            onSolventWeightBlur={commitSolventWeightDraft}
            onFuelWeightChange={updateFuelWeight}
            onFuelWeightBlur={commitFuelWeightDraft}
            onSolventRatioChange={(id, element, value) => updateRatioDraft('solvent', id, element, value)}
            onSolventRatioBlur={(id, element, value) => commitRatioDraft('solvent', id, element, value)}
            onFuelRatioChange={(element, value) => updateRatioDraft('fuel', fuelColumn.id, element, value)}
            onFuelRatioBlur={(element, value) => commitRatioDraft('fuel', fuelColumn.id, element, value)}
            onGasRatioChange={(id, element, value) => updateRatioDraft('gas', id, element, value)}
            onGasRatioBlur={(id, element, value) => commitRatioDraft('gas', id, element, value)}
            onMaterialWaterWeightChange={updateMaterialWaterWeight}
            onMaterialWaterWeightBlur={commitWaterWeightDraft}
            onFuelWaterWeightChange={updateFuelWaterWeight}
            onFuelWaterWeightBlur={() => commitWaterWeightDraft('fuel', fuelColumn.id)}
            showProductRows={false}
            onOpenElementAssist={openElementAssist}
            onGasWeightChange={updateAirWeight}
            onGasWeightBlur={commitAirWeightDraft}
          />
        </div>
        ) : batchTableView === 'phase' ? (
          <div key="phase-batch-view" className="space-y-3 batch-table-view-enter">
            <CopperBatchPhaseTables
              darkMode={darkMode}
              phaseRowKeys={phaseTableRowKeys}
              inputColumns={inputPhaseColumnData}
              outputColumns={[]}
              tableWidth={phaseTableWidth}
              nameColWidth={batchTableNameColWidth}
              formatTableNumber={formatTableNumber}
              furnaceBlendWaterWeight={furnaceBlendWaterWeight}
              title="投入-物料物相表（w%）"
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
          </div>
        ) : batchTableView === 'productPhase' ? (
          <div
            key="product-phase-batch-view"
            className={`rounded-lg transition-all duration-300 batch-table-view-enter ${
              batchTableHighlight
                ? darkMode
                  ? 'ring-2 ring-blue-500/60 ring-offset-2 ring-offset-gray-900'
                  : 'ring-2 ring-blue-400/70 ring-offset-2 ring-offset-white'
                : ''
            }`}
          >
            {productFilledBack ? (
              <CopperProductionResultTable
                darkMode={darkMode}
                result={oxySolverResult}
                mode="phase"
                phaseTitle="产出-产物物相表"
                config={productConstraintConfig}
              />
            ) : (
              renderProductResultPlaceholder()
            )}
          </div>
        ) : batchTableView === 'productElement' ? (
          <div
            key="product-element-batch-view"
            className={`rounded-lg transition-all duration-300 batch-table-view-enter ${
              batchTableHighlight
                ? darkMode
                  ? 'ring-2 ring-blue-500/60 ring-offset-2 ring-offset-gray-900'
                  : 'ring-2 ring-blue-400/70 ring-offset-2 ring-offset-white'
                : ''
            }`}
          >
            {productFilledBack ? (
              <CopperProductionResultTable
                darkMode={darkMode}
                result={oxySolverResult}
                mode="element"
                elementTitle="产出-产物元素表（w%）"
                elementDisplayMode={productElementTableView}
                config={productConstraintConfig}
              />
            ) : (
              renderProductResultPlaceholder()
            )}
          </div>
        ) : batchTableView === 'balance' ? (
          <div key="balance-batch-view" className="space-y-3 batch-table-view-enter">
            <div
              role="button"
              tabIndex={0}
              className={`cursor-pointer overflow-hidden rounded-lg border transition ${
                darkMode ? 'border-gray-600 hover:border-blue-500' : 'border-gray-200 hover:border-blue-400'
              }`}
              onClick={handleHeatBalancePlaceholderClick}
              onKeyDown={handleHeatBalancePlaceholderKeyDown}
              title="点击跳转到热平衡计算专区"
            >
              <table className="w-full table-fixed text-sm">
                <thead className={darkMode ? 'bg-gray-800 text-gray-100' : 'bg-gray-50 text-gray-700'}>
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">热平衡计算</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className={`px-3 py-6 text-center ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>点击进入热平衡计算专区</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
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

      <div ref={elementAssistRef} className={cardCompact(darkMode)}>
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          <h3 className={`${sectionTitle(darkMode)} mb-0`}>物相成分</h3>
          <button
            type="button"
            className={btnSecondary(darkMode)}
            onClick={() => setShowElementAssist((value) => !value)}
          >
            {showElementAssist ? '折叠' : '展开'}
          </button>
        </div>
        <div className={`${hintText(darkMode)} mt-4 space-y-1 text-sm leading-relaxed`}>
          <p>打开方式：在配料总表填写投料量 (t/h)，双击 O / C / Other 进入本区。</p>
          <p>
            计算说明：以质量守恒为基础，依据各物相化学计量比把化验已知元素分配求解干基 w%，再由 O / C / Other 反算闭合；含水行单独输入 t/h，仅用于含水质量与后续水平衡展示，不参与物相 w% 求解或合计。
          </p>
        </div>
        {showElementAssist && (
          <div className="mt-4 space-y-3">
            {phaseSheetTabs.length > 0 && (
              <div className={`flex flex-wrap items-end gap-1 border-b ${darkMode ? 'border-gray-600' : 'border-gray-200'}`}>
                {phaseSheetTabs.map((tab) => {
                  const active = selectedPhaseMaterial?.id === tab.id
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      className={`rounded-t-md border px-3 py-1.5 text-sm font-medium ${
                        active
                          ? darkMode
                            ? 'border-gray-500 border-b-gray-900 bg-gray-900 text-gray-100'
                            : 'border-gray-300 border-b-white bg-white text-gray-900'
                          : darkMode
                          ? 'border-gray-700 bg-gray-800/40 text-gray-300 hover:bg-gray-800'
                          : 'border-gray-200 bg-gray-50 text-gray-600 hover:bg-white'
                      }`}
                      onClick={() => selectPhaseSheet(tab.id)}
                      title={`切换到 ${tab.label} 的物相计算结果`}
                    >
                      {tab.label}
                      <span
                        className={`ml-2 text-xs font-normal underline underline-offset-2 ${
                          tab.status === '已回填'
                            ? darkMode
                              ? 'text-emerald-400 decoration-emerald-400/70'
                              : 'text-emerald-600 decoration-emerald-500/70'
                            : tab.status === '已计算'
                              ? darkMode
                                ? 'text-amber-400 decoration-amber-400/70'
                                : 'text-amber-600 decoration-amber-500/70'
                              : darkMode
                                ? 'text-gray-400 decoration-gray-500/70'
                                : 'text-gray-500 decoration-gray-400/70'
                        }`}
                      >
                        {tab.status}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
            {phaseAssistTabMaterialIds.length === 0 ? (
              <div
                className={`w-full overflow-auto rounded-lg border ${darkMode ? 'border-gray-600' : 'border-gray-200'}`}
              >
                <table className="w-full min-w-[720px] border-collapse text-sm">
                  <thead className={darkMode ? 'bg-gray-800 text-gray-300' : 'bg-gray-50 text-gray-600'}>
                    <tr>
                      <th colSpan={4} className="px-2 py-1.5 text-center font-semibold">
                        物相成分
                      </th>
                    </tr>
                    <tr>
                      <th className="px-2 py-1.5 text-center">物相</th>
                      <th className="px-2 py-1.5 text-center">w%</th>
                      <th colSpan={2} className="px-2 py-1.5 text-center">
                        元素
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className={darkMode ? 'text-gray-300' : 'text-gray-700'}>
                      <td className={`border-t px-2 py-3 text-center ${darkMode ? 'border-gray-600' : 'border-gray-200'}`}>
                        —
                      </td>
                      <td className={`border-t px-2 py-3 text-center ${darkMode ? 'border-gray-600' : 'border-gray-200'}`}>
                        —
                      </td>
                      <td
                        colSpan={2}
                        className={`border-t px-2 py-3 text-center ${darkMode ? 'border-gray-600' : 'border-gray-200'}`}
                      >
                        —
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : (
              <>
            {selectedPhaseMaterial && selectedPhaseMaterialError && (
              <div className={assistAlertPanelClassName(darkMode, 'warning')}>
                {phaseMaterialValidationGuidance(selectedPhaseMaterial, selectedPhaseMaterialError)}
              </div>
            )}
            {selectedPhaseMaterial && !selectedPhaseMaterialError && (
              <>
                <div
                  ref={phaseAssistContainerRef}
                  className={`w-full overflow-auto rounded-lg border ${darkMode ? 'border-gray-600' : 'border-gray-200'}`}
                >
                  {(() => {
                    const displayPhaseSlots = filterPhaseAssistDisplaySlots(
                      buildPhaseAssistDisplaySlots(activeMaterialPhaseRows),
                      phasePivotRows,
                      Boolean(activePhasePreview)
                    )
                    const hasPhasePreview = Boolean(activePhasePreview)
                    const displayPhaseElementSlots = buildPhaseAssistElementRowSlots(
                      phasePivotDisplayTotals,
                      phaseTableColumnKeys,
                      hasPhasePreview
                    )
                    const displayPhaseElementKeys = displayPhaseElementSlots.flatMap((slot) =>
                      slot.kind === 'element' ? [slot.key] : []
                    )
                    const showPhaseEditControls = !selectedPhaseLocked
                    const colCount = displayPhaseSlots.length + (showPhaseEditControls ? 3 : 2)
                    const labelSamples = [
                      '物相',
                      'w%',
                      ...displayPhaseElementSlots.map((slot) =>
                        slot.kind === 'element'
                          ? phaseTableHeaderLabel(slot.key, phaseElementView)
                          : '—'
                      ),
                    ]
                    if (showPhaseEditControls) labelSamples.push('操作')
                    const totalSamples = ['合计', formatPhaseCell(100)]
                    if (activePhasePreview) {
                      if (batchTableHasResult(phasePivotTotals.phaseTotal)) {
                        totalSamples.push(formatPhaseCell(phasePivotTotals.phaseTotal))
                      }
                      for (const element of displayPhaseElementKeys) {
                        const mass = phasePivotDisplayTotals[element] ?? 0
                        if (batchTableHasResult(mass) && selectedPhaseMaterial.weight > 0) {
                          totalSamples.push(
                            formatPhaseCell(
                              massThToWeightPercent(mass, selectedPhaseMaterial.weight)
                            )
                          )
                        }
                      }
                    }
                    const phaseColumns = displayPhaseSlots.map((slot) => {
                      if (slot.kind === 'placeholder') {
                        return { header: '—', samples: ['—'], hasData: false, isDraft: false }
                      }
                      const row = slot.row
                      const header = (row.displayLabel || row.formula || '').trim() || '物相'
                      const samples: string[] = []
                      let hasData = false
                      const pivot = phasePivotRows.find((item) => item.rowId === row.id)
                      if (pivot?.phasePercent != null && batchTableHasResult(pivot.phasePercent)) {
                        samples.push(formatPhaseCell(pivot.phasePercent))
                        hasData = true
                      }
                      if (pivot?.elements && selectedPhaseMaterial.weight > 0) {
                        const rowElementDisplay = decomposePhaseElementMasses(
                          pivot.elements,
                          phaseElementView
                        )
                        for (const element of displayPhaseElementKeys) {
                          const mass = rowElementDisplay[element] ?? 0
                          if (batchTableHasResult(mass)) {
                            hasData = true
                            samples.push(
                              formatPhaseCell(
                                massThToWeightPercent(mass, selectedPhaseMaterial.weight)
                              )
                            )
                          }
                        }
                      }
                      return {
                        header,
                        samples,
                        hasData,
                        isDraft: row.kind === 'draft',
                      }
                    })
                    const measuredContainerWidth = Math.max(
                      phaseAssistViewportWidth,
                      phaseAssistContainerRef.current?.clientWidth ?? 0
                    )
                    const assistColLayout = computePhaseAssistTableLayout({
                      labelSamples,
                      totalSamples,
                      phaseColumns,
                      containerWidth: measuredContainerWidth,
                      includeActionColumn: showPhaseEditControls,
                    })
                    const assistColWidths = assistColLayout.widths
                    const resolvedTableWidth = assistColLayout.tableWidth
                    const assistStickyHead = `sticky left-0 z-30 px-0.5 py-1.5 text-center text-sm font-semibold ${
                      darkMode ? 'bg-gray-800 text-gray-300' : 'bg-gray-50 text-gray-600'
                    }`
                    const assistStickyLabel = `sticky left-0 z-10 px-0.5 py-1.5 text-center text-sm ${
                      darkMode ? 'bg-gray-900' : 'bg-white'
                    }`
                    const assistHeadCls = darkMode ? 'bg-gray-800 text-gray-300' : 'bg-gray-50 text-gray-600'
                    const assistTotalCls = darkMode
                      ? 'bg-cyan-950/45 text-cyan-50 ring-1 ring-inset ring-cyan-800/45'
                      : 'bg-cyan-50 text-cyan-950 ring-1 ring-inset ring-cyan-200/80'
                    const firstPhaseRowCls = darkMode
                      ? 'bg-amber-950/35 ring-1 ring-inset ring-amber-800/45'
                      : 'bg-amber-50/95 ring-1 ring-inset ring-amber-200/80'
                    const phaseDeleteBtn = `inline-flex h-6 w-6 items-center justify-center rounded text-base font-semibold leading-none ${
                      darkMode ? 'text-red-300 hover:bg-red-950/40' : 'text-red-600 hover:bg-red-50'
                    }`
                    const phaseColumnStripe = (index: number) =>
                      index % 2 === 0
                        ? darkMode
                          ? 'bg-gray-800/55'
                          : 'bg-gray-100/90'
                        : darkMode
                          ? 'bg-gray-700/35'
                          : 'bg-slate-50'
                    const valueHighlight = (hasValue: boolean) =>
                      hasValue
                        ? darkMode
                          ? 'bg-emerald-950/40 ring-1 ring-inset ring-emerald-800/50'
                          : 'bg-emerald-50 ring-1 ring-inset ring-emerald-200'
                        : ''
                    const phaseDataCell = (index: number, hasValue: boolean, firstRow = false) =>
                      `border-t px-0.5 py-1.5 text-center align-middle text-sm font-mono ${
                        firstRow ? firstPhaseRowCls : phaseColumnStripe(index)
                      } ${valueHighlight(hasValue)}`
                    const assistElementHasValue = (
                      row: MaterialPhaseAssistRow,
                      phasePercent: number | null,
                      element: string,
                      rowElementDisplay: Record<string, number>
                    ) => {
                      if (
                        row.kind === 'draft' ||
                        phasePercent == null ||
                        !batchTableHasResult(phasePercent) ||
                        selectedPhaseMaterial.weight <= 0
                      ) {
                        return false
                      }
                      return batchTableHasResult(rowElementDisplay[element] ?? 0)
                    }
                    const renderAssistWPercent = (
                      row: MaterialPhaseAssistRow,
                      phasePercent: number | null,
                      phaseMassTh: number | null
                    ) => {
                      if (row.kind === 'draft') return '—'
                      return (
                        <PhaseAssistPercentCell
                          darkMode={darkMode}
                          percent={phasePercent}
                          massTh={phaseMassTh}
                          feedRateTh={selectedPhaseMaterial.weight}
                        />
                      )
                    }
                    const renderAssistElementCell = (
                      row: MaterialPhaseAssistRow,
                      phasePercent: number | null,
                      element: string,
                      rowElementDisplay: Record<string, number>
                    ) => {
                      if (
                        row.kind === 'draft' ||
                        phasePercent == null ||
                        !batchTableHasResult(phasePercent) ||
                        selectedPhaseMaterial.weight <= 0
                      ) {
                        return '—'
                      }
                      return (
                        <PhaseAssistPercentCell
                          darkMode={darkMode}
                          massTh={rowElementDisplay[element] ?? 0}
                          feedRateTh={selectedPhaseMaterial.weight}
                        />
                      )
                    }
                    return (
                      <table
                        className="table-fixed w-full text-sm"
                        style={
                          measuredContainerWidth > 0
                            ? { width: resolvedTableWidth }
                            : { width: '100%' }
                        }
                      >
                        <CopperBatchTableColGroup widths={assistColWidths} />
                        <thead className={assistHeadCls}>
                          <tr>
                            <th colSpan={colCount} className={`p-0 ${assistHeadCls}`}>
                              <div
                                className="sticky left-0 px-1 py-1 text-center text-sm font-semibold"
                                style={{ width: measuredContainerWidth || undefined }}
                              >
                                物相成分
                              </div>
                            </th>
                          </tr>
                          <tr>
                            <th className={`${assistStickyHead} align-middle`}>物相</th>
                            <th
                              className={`px-0.5 py-1.5 text-center text-sm font-semibold ${assistTotalCls}`}
                            >
                              合计
                            </th>
                            {displayPhaseSlots.map((slot, phaseIndex) => {
                              if (slot.kind === 'placeholder') {
                                return (
                                  <th
                                    key={slot.id}
                                    className={`px-0.5 py-1.5 text-center align-top text-sm ${phaseColumnStripe(phaseIndex)}`}
                                  >
                                    <span className="text-gray-400">—</span>
                                  </th>
                                )
                              }
                              const row = slot.row
                              const formulaKey = rowDraftStorageKey(selectedPhaseMaterial.id, row.id)
                              const formulaDraft = phaseRowFormulaDrafts[formulaKey] ?? row.formula
                              const formulaError = phaseRowFormulaErrors[formulaKey]
                              const isDraft = row.kind === 'draft'
                              return (
                                <th
                                  key={row.id}
                                  className={`px-0.5 py-1.5 text-center align-top text-sm ${phaseColumnStripe(phaseIndex)}`}
                                >
                                  {isDraft ? (
                                    <div className="w-full space-y-0.5">
                                      <input
                                        className={`${inputSm(darkMode)} h-7 w-full px-0.5 text-center text-sm ${formulaError ? 'border-red-500' : ''}`}
                                        placeholder="物相"
                                        value={formulaDraft}
                                        onChange={(event) =>
                                          updatePhaseRowFormulaDraft(
                                            selectedPhaseMaterial.id,
                                            row.id,
                                            event.target.value
                                          )
                                        }
                                        onBlur={() => commitPhaseRowFormula(selectedPhaseMaterial.id, row.id)}
                                      />
                                      {formulaError && (
                                        <p className="text-center text-xs leading-tight text-red-500">
                                          {formulaError}
                                        </p>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="font-medium leading-tight" title={row.formula}>
                                      {row.displayLabel}
                                    </span>
                                  )}
                                </th>
                              )
                            })}
                            {showPhaseEditControls && (
                              <th
                                className={`px-0.5 py-1.5 text-center align-top text-sm ${assistHeadCls}`}
                              >
                                <button
                                  type="button"
                                  className={`mx-auto flex h-6 w-6 items-center justify-center rounded text-base font-semibold leading-none ${
                                    darkMode
                                      ? 'bg-gray-700 text-gray-100 hover:bg-gray-600'
                                      : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
                                  }`}
                                  title="添加物相"
                                  onClick={() => appendDraftPhaseRow(selectedPhaseMaterial.id)}
                                >
                                  +
                                </button>
                              </th>
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          <tr className={`border-t ${darkMode ? 'border-gray-600' : 'border-gray-200'}`}>
                            <td className={`${assistStickyLabel} font-semibold`}>w%</td>
                            <td
                              className={`border-t px-0.5 py-1.5 text-center font-mono text-sm font-semibold ${firstPhaseRowCls}`}
                              title="干基物相 w% 与元素 w% 合计；含水不参与物相计算，悬停单元格可查看质量流量"
                            >
                              {activePhasePreview ? (
<PhaseAssistPercentCell
                        darkMode={darkMode}
                        percent={phasePivotTotals.phaseTotal}
                        massTh={phasePivotTotals.totalMassTh}
                                  feedRateTh={selectedPhaseMaterial.weight}
                                />
                              ) : (
                                '—'
                              )}
                            </td>
                            {displayPhaseSlots.map((slot, phaseIndex) => {
                              if (slot.kind === 'placeholder') {
                                return (
                                  <td key={slot.id} className={phaseDataCell(phaseIndex, false, true)}>
                                    —
                                  </td>
                                )
                              }
                              const row = slot.row
                              const pivot = phasePivotRows.find((item) => item.rowId === row.id)
                              const phasePercent = pivot?.phasePercent ?? null
                              const phaseMassTh = pivot?.phaseMassTh ?? null
                              return (
                                <td key={`w-${row.id}`} className={phaseDataCell(phaseIndex, false, true)}>
                                  {renderAssistWPercent(row, phasePercent, phaseMassTh)}
                                </td>
                              )
                            })}
                            {showPhaseEditControls && <td className={`border-t ${assistHeadCls}`} />}
                          </tr>
                          {displayPhaseElementSlots.map((elementSlot) => {
                            if (elementSlot.kind === 'placeholder') {
                              return (
                                <tr
                                  key={elementSlot.id}
                                  className={`border-t ${darkMode ? 'border-gray-600' : 'border-gray-200'}`}
                                >
                                  <td className={`${assistStickyLabel} text-gray-400`}>—</td>
                                  <td
                                    className={`border-t px-0.5 py-1.5 text-center text-sm text-gray-400 ${assistTotalCls}`}
                                  >
                                    —
                                  </td>
                                  {displayPhaseSlots.map((slot, phaseIndex) => (
                                    <td
                                      key={`${elementSlot.id}-${slot.kind === 'placeholder' ? slot.id : slot.row.id}`}
                                      className={phaseDataCell(phaseIndex, false)}
                                    >
                                      —
                                    </td>
                                  ))}
                                  {showPhaseEditControls && <td className={`border-t ${assistHeadCls}`} />}
                                </tr>
                              )
                            }
                            const element = elementSlot.key
                            return (
                              <tr
                                key={element}
                                className={`border-t ${darkMode ? 'border-gray-600' : 'border-gray-200'}`}
                              >
                                <td className={`${assistStickyLabel} font-medium`}>
                                  {phaseTableHeaderLabel(element, phaseElementView)}
                                </td>
                                <td
                                  className={`border-t px-0.5 py-1.5 text-center font-mono text-sm ${assistTotalCls}`}
                                >
                                  {activePhasePreview && selectedPhaseMaterial.weight > 0 ? (
<PhaseAssistPercentCell
                        darkMode={darkMode}
                        massTh={phasePivotDisplayTotals[element] ?? 0}
                                      feedRateTh={selectedPhaseMaterial.weight}
                                    />
                                  ) : (
                                    '—'
                                  )}
                                </td>
                                {displayPhaseSlots.map((slot, phaseIndex) => {
                                  if (slot.kind === 'placeholder') {
                                    return (
                                      <td key={`${slot.id}-${element}`} className={phaseDataCell(phaseIndex, false)}>
                                        —
                                      </td>
                                    )
                                  }
                                  const row = slot.row
                                  const pivot = phasePivotRows.find((item) => item.rowId === row.id)
                                  const phasePercent = pivot?.phasePercent ?? null
                                  const rowElementDisplay = pivot?.elements
                                    ? decomposePhaseElementMasses(pivot.elements, phaseElementView)
                                    : {}
                                  const hasValue = assistElementHasValue(
                                    row,
                                    phasePercent,
                                    element,
                                    rowElementDisplay
                                  )
                                  return (
                                    <td
                                      key={`${row.id}-${element}`}
                                      className={phaseDataCell(phaseIndex, hasValue)}
                                    >
                                      {renderAssistElementCell(
                                        row,
                                        phasePercent,
                                        element,
                                        rowElementDisplay
                                      )}
                                    </td>
                                  )
                                })}
                                {showPhaseEditControls && <td className={`border-t ${assistHeadCls}`} />}
                              </tr>
                            )
                          })}
                          {showPhaseEditControls && (
                            <tr className={`border-t ${darkMode ? 'border-gray-600' : 'border-gray-200'}`}>
                              <td className={`${assistStickyLabel} font-semibold`}>操作</td>
                              <td className={`border-t px-0.5 py-1.5 text-center text-sm text-gray-400 ${assistTotalCls}`}>
                                —
                              </td>
                              {displayPhaseSlots.map((slot, phaseIndex) => (
                                <td
                                  key={slot.kind === 'placeholder' ? slot.id : `ops-${slot.row.id}`}
                                  className={`border-t px-0.5 py-0.5 text-center align-middle ${phaseColumnStripe(phaseIndex)}`}
                                >
                                  {slot.kind === 'row' && canDeletePhaseAssistRow(slot.row) ? (
                                    <button
                                      type="button"
                                      className={phaseDeleteBtn}
                                      aria-label="删除物相"
                                      title="删除物相"
                                      onClick={() =>
                                        removeMaterialPhaseRow(selectedPhaseMaterial.id, slot.row.id)
                                      }
                                    >
                                      ×
                                    </button>
                                  ) : (
                                    <span className="text-gray-400">—</span>
                                  )}
                                </td>
                              ))}
                              <td className={`border-t ${assistHeadCls}`} />
                            </tr>
                          )}
                        </tbody>
                      </table>
                    )
                  })()}
                </div>
                <div
                  className={`mt-2 flex items-center gap-2 pl-0.5 ${
                    darkMode ? 'text-gray-300' : 'text-gray-600'
                  }`}
                >
                  <button
                    type="button"
                    role="switch"
                    aria-checked={phaseElementView === 'element'}
                    aria-label="元素转换"
                    title={
                      phaseElementView === 'compound'
                        ? '将 SiO₂/CaO/Al₂O₃/H₂O 等拆解为 Si/Ca/Al/H/O 元素显示'
                        : '恢复化合物列显示'
                    }
                    className="inline-flex cursor-pointer items-center gap-2 border-0 bg-transparent p-0"
                    onClick={() =>
                      setPhaseElementView((v) => (v === 'compound' ? 'element' : 'compound'))
                    }
                  >
                    <span className="text-sm">元素转换</span>
                    <span
                      aria-hidden
                      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                        phaseElementView === 'element'
                          ? 'bg-blue-600'
                          : darkMode
                            ? 'bg-gray-600'
                            : 'bg-gray-300'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                          phaseElementView === 'element' ? 'translate-x-4' : 'translate-x-0.5'
                        }`}
                      />
                    </span>
                  </button>
                </div>
                {selectedPhaseSolverError && (
                  <div className={assistAlertPanelClassName(darkMode, 'warning')}>{selectedPhaseSolverError}</div>
                )}
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <button
                    className={btnSecondary(darkMode)}
                    onClick={() => void exportPhaseComposition()}
                    disabled={!selectedPhaseMaterial || !phaseBatchResults?.[selectedPhaseMaterial.id]}
                    title="导出当前原料的物相成分透视表"
                  >
                    导出 Excel
                  </button>
                  <button
                    className={btnPrimary(darkMode)}
                    onClick={calculatePhaseUnknownsPreview}
                    disabled={isPhaseCalculating || !!selectedPhaseMaterialError || hasPendingDraftRows || hasFormulaErrors}
                  >
                    {isPhaseCalculating ? '物相计算中...' : '计算物相成分'}
                  </button>
                  <button
                    className={btnSecondary(darkMode)}
                    onClick={applyPhaseUnknowns}
                    disabled={
                      !!selectedPhaseMaterialError ||
                      hasPendingDraftRows ||
                      hasFormulaErrors ||
                      !!selectedPhaseSolverError ||
                      !selectedPhaseMaterial ||
                      !phaseBatchResults?.[selectedPhaseMaterial.id]
                    }
                  >
                    回填物相到配料总表
                  </button>
                </div>
                {selectedPhaseMaterial &&
                  phaseBatchResults?.[selectedPhaseMaterial.id]?.valid &&
                  (phaseBatchResults?.[selectedPhaseMaterial.id] || phaseCompletedMaterials[selectedPhaseMaterial.id]) && (
                    <div className={assistAlertPanelClassName(darkMode, 'success')}>
                      {phaseBatchResults?.[selectedPhaseMaterial.id] && !phaseCompletedMaterials[selectedPhaseMaterial.id]
                        ? `已计算，待回填：O ${format(phaseBatchResults[selectedPhaseMaterial.id]!.unknowns['O(氧)'])}%、C ${format(phaseBatchResults[selectedPhaseMaterial.id]!.unknowns['C (碳)'])}%、Other ${format(phaseBatchResults[selectedPhaseMaterial.id]!.unknowns['Other(其他)'])}%；回填后混料物相将按投料量加权汇总。`
                        : `已回填：${displayRawMaterialName(selectedPhaseMaterial.name)} 的 O / C / Other 与物相组成已写入配料总表${phaseCompleted ? '（全部原料已完成物相成分）' : ''}。`}
                    </div>
                  )}
              </>
            )}
              </>
            )}
          </div>
        )}
      </div>

      <div ref={productCalculationRef} className={cardCompact(darkMode)}>
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          <h3 className={`${sectionTitle(darkMode)} mb-0`}>产出计算</h3>
          <button
            type="button"
            className={btnSecondary(darkMode)}
            onClick={() => setShowProductCalculationAssist((value) => !value)}
          >
            {showProductCalculationAssist ? '折叠' : '展开'}
          </button>
        </div>
        {renderProductCalculationIntro()}
        {showProductCalculationAssist &&
          renderProductCalculationPanel('product-standalone-calculation', 'mt-4', { showIntro: false })}
      </div>

      <div ref={heatBalanceRef} className={cardCompact(darkMode)}>
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          <h3 className={`${sectionTitle(darkMode)} mb-0`}>热平衡计算</h3>
          <button type="button" className={btnSecondary(darkMode)} onClick={toggleHeatBalanceAssist}>
            {showHeatBalanceAssist ? '折叠' : '展开'}
          </button>
        </div>
        <div className={`${hintText(darkMode)} mt-4 space-y-1 text-sm leading-relaxed`}>
          <p>打开方式：在配料总表点击“热平衡计算”tab 进入本区；也可直接展开本区设置温度、炉体热损失与燃料参数。</p>
          <p>
            计算说明：依据投入/产出表中的 25℃、1300℃、1350℃热焓，先列出并配平主要反应，再以入炉物料显热与化学反应热为热收入，产物带出显热与自然散热为热支出，平衡后求取燃料煤需求量。
          </p>
        </div>
        {showHeatBalanceAssist && (
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(20rem,0.75fr)]">
              <div className={`rounded-lg border p-3 ${darkMode ? 'border-gray-600 bg-gray-900/20' : 'border-gray-200 bg-white'}`}>
                <div className={`mb-3 text-sm font-semibold ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>温度设置</div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  <LabeledInput darkMode={darkMode} label="入炉料温度 (℃)" value={feedTemperature} onChange={(value) => updateHeatField(setFeedTemperature, value)} />
                  <LabeledInput darkMode={darkMode} label="白铜锍温度 (℃)" value={matteTemperature} onChange={(value) => updateHeatField(setMatteTemperature, value)} />
                  <LabeledInput darkMode={darkMode} label="熔炼渣温度 (℃)" value={slagTemperature} onChange={(value) => updateHeatField(setSlagTemperature, value)} />
                  <LabeledInput darkMode={darkMode} label="熔炼烟气温度 (℃)" value={gasTemperature} onChange={(value) => updateHeatField(setGasTemperature, value)} />
                  <LabeledInput darkMode={darkMode} label="烟气含尘温度 (℃)" value={dustTemperature} onChange={(value) => updateHeatField(setDustTemperature, value)} />
                  <LabeledInput darkMode={darkMode} label="损失温度 (℃)" value={lossTemperature} onChange={(value) => updateHeatField(setLossTemperature, value)} />
                </div>
              </div>
              <div className={`rounded-lg border p-3 ${darkMode ? 'border-gray-600 bg-gray-900/20' : 'border-gray-200 bg-white'}`}>
                <div className={`mb-3 text-sm font-semibold ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>计算基准</div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 xl:grid-cols-1">
                  <BlendMetric darkMode={darkMode} label="热平衡入炉料" value={`${format(heatInputDryWeight)} t/h`} />
                  <BlendMetric darkMode={darkMode} label="氧气" value={`${format(oxygenAirColumn.weight)} t/h`} />
                  <BlendMetric darkMode={darkMode} label="白铜锍" value={`${format(heatMatteMass)} t/h`} />
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className={`rounded-lg border p-3 ${darkMode ? 'border-gray-600 bg-gray-900/20' : 'border-gray-200 bg-white'}`}>
                <div className={`mb-3 text-sm font-semibold ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>热支出与燃料</div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <LabeledInput darkMode={darkMode} label="炉体热损失 (MJ/h)" value={heatLossMJh} onChange={(value) => updateHeatField(setHeatLossMJh, value)} />
                  <LabeledInput darkMode={darkMode} label="其他热支出 (MJ/h)" value={otherHeatMJh} onChange={(value) => updateHeatField(setOtherHeatMJh, value)} />
                  <LabeledInput darkMode={darkMode} label="煤低位发热量 (MJ/kg)" value={fuelLhv} onChange={(value) => updateHeatField(setFuelLhv, value)} />
                  <LabeledInput darkMode={darkMode} label="燃烧效率" value={fuelEfficiency} onChange={(value) => updateHeatField(setFuelEfficiency, value)} />
                </div>
              </div>
              <div className={`rounded-lg border p-3 ${darkMode ? 'border-gray-600 bg-gray-900/20' : 'border-gray-200 bg-white'}`}>
                <div className={`mb-3 text-sm font-semibold ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>供氧条件</div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
                  <LabeledInput darkMode={darkMode} label="氧气 O (%)" value={oxygenAirO2Pct} onChange={(value) => updateOxygenAirComposition(value, oxygenAirN2Pct)} />
                  <LabeledInput darkMode={darkMode} label="氧气 N (%)" value={oxygenAirN2Pct} onChange={(value) => updateOxygenAirComposition(oxygenAirO2Pct, value)} />
                  <LabeledInput darkMode={darkMode} label="供氧系数" value={oxygenSupplyCoefficient} onChange={(value) => updateHeatField(setOxygenSupplyCoefficient, value)} />
                </div>
              </div>
            </div>
            <div className={`rounded-lg border px-3 py-3 ${darkMode ? 'border-blue-800 bg-blue-950/20' : 'border-blue-200 bg-blue-50'}`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className={`text-sm font-semibold ${darkMode ? 'text-blue-100' : 'text-blue-900'}`}>计算过程</div>
                  <div className={`mt-1 text-xs leading-relaxed ${darkMode ? 'text-blue-200/80' : 'text-blue-800'}`}>
                    点击后按热焓读取、反应热、热收支、燃料煤四步生成结果；修改参数后需要重新计算。
                  </div>
                </div>
                <button
                  className={btnPrimary(darkMode)}
                  onClick={() => void runHeatBalanceCalculation()}
                  disabled={!productFilledBack || !heatInputValid || isHeatBalanceCalculating}
                >
                  {isHeatBalanceCalculating ? '热平衡计算中…' : '热平衡计算'}
                </button>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {HEAT_BALANCE_CALCULATION_STEPS.map((label, index) => {
                  const active = isHeatBalanceCalculating && index <= heatBalanceCalculationStep
                  const done = Boolean(visibleHeatBalance)
                  return (
                    <span
                      key={label}
                      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        active || done
                          ? darkMode
                            ? 'bg-blue-800 text-blue-100'
                            : 'bg-blue-100 text-blue-800'
                          : darkMode
                            ? 'bg-gray-800 text-gray-500'
                            : 'bg-white text-gray-500'
                      }`}
                    >
                      {index + 1}. {label}
                    </span>
                  )
                })}
              </div>
            </div>
            {!visibleHeatBalance && (
              <div className={`rounded-lg border px-4 py-6 text-center text-sm ${darkMode ? 'border-gray-600 bg-gray-900/20 text-gray-400' : 'border-gray-200 bg-gray-50 text-gray-500'}`}>
                当前仅显示参数设置。点击“热平衡计算”后生成热收支表、反应热方程式和分项物理热结果。
              </div>
            )}
            {visibleHeatBalance && (
              <div className="space-y-4">
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
                        ['投入物理热', formatTableDisplayValue(visibleHeatBalance.inputPhysicalHeatMJh), 'MJ/h'],
                        ['化学反应热', formatTableDisplayValue(visibleHeatBalance.chemicalHeatMJh), 'MJ/h'],
                        ['产物物理热', formatTableDisplayValue(visibleHeatBalance.outputPhysicalHeatMJh), 'MJ/h'],
                        ['总热损失', formatTableDisplayValue(visibleHeatBalance.heatLossMJh + visibleHeatBalance.otherHeatMJh), 'MJ/h'],
                        ['热缺口', formatTableDisplayValue(Math.max(0, visibleHeatBalance.heatDeficitMJh)), 'MJ/h'],
                        ['推荐燃料煤', formatTableDisplayValue(visibleHeatBalance.requiredFuelWeight), 't/h'],
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
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                  <div className={heatFormulaCardClass(darkMode)}>
                    <div className={`text-xs font-semibold ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>燃料煤求解</div>
                    <div className="mt-1 font-mono text-sm">
                      max(0, {format(visibleHeatBalance.heatDeficitMJh, 0)}) / {format(visibleHeatBalance.fuelHeatMJt, 0)} = {format(visibleHeatBalance.requiredFuelWeight)} t/h
                    </div>
                  </div>
                  <div className={heatFormulaCardClass(darkMode)}>
                    <div className={`text-xs font-semibold ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>结果状态</div>
                    <div className="mt-1 grid grid-cols-1 gap-1 font-mono text-sm">
                      <span>热平衡残差 {format(visibleHeatBalance.balanceAfterFuelMJh, 0)} MJ/h</span>
                      <span>有效燃料热 {format(visibleHeatBalance.fuelEffectiveHeatMJh, 0)} MJ/h</span>
                    </div>
                  </div>
                </div>
                <CopperHeatBalancePlaceholderTables darkMode={darkMode} result={visibleHeatBalance} />
              </div>
            )}
            {heatBalanceEngaged && visibleHeatBalance && (
              <div className={assistAlertPanelClassName(darkMode, 'success')}>
                热平衡残差约 {format(visibleHeatBalance.balanceAfterFuelMJh, 0)} MJ/h；推荐燃料煤 {format(visibleHeatBalance.requiredFuelWeight)} t/h。
              </div>
            )}
            {!productFilledBack && (
              <div className={assistAlertPanelClassName(darkMode, 'warning')}>
                请先完成产出计算并回填到配料总表；热平衡参数可以先填写，结果需在产出回填后计算。
              </div>
            )}
          </div>
        )}
      </div>

    </div>
  )
}

function AddLibraryMaterialDialog({
  darkMode,
  mode,
  open,
  message,
  rows,
  elementColumns,
  rowTotal,
  ratioInputValue,
  onAddRow,
  onRemoveRow,
  onNameChange,
  onOtherRatioChange,
  onColumnRatioChange,
  onColumnRatioBlur,
  onAddColumn,
  onRemoveColumn,
  onColumnNameChange,
  onColumnNameBlur,
  onCancel,
  onSubmit,
}: {
  darkMode: boolean
  mode: LibraryMaterialDialogMode
  open: boolean
  message: string | null
  rows: SingleLibraryRow[]
  elementColumns: LibraryDialogElementColumn[]
  rowTotal: (row: SingleLibraryRow) => number
  ratioInputValue: (rowId: string, element: CopperElementKey, value: number | undefined) => string
  onAddRow: () => void
  onRemoveRow: (id: string) => void
  onNameChange: (id: string, value: string) => void
  onOtherRatioChange: (rowId: string, value: string) => void
  onColumnRatioChange: (rowId: string, element: CopperElementKey, value: string) => void
  onColumnRatioBlur: (rowId: string, element: CopperElementKey) => void
  onAddColumn: () => void
  onRemoveColumn: (columnId: string) => void
  onColumnNameChange: (columnId: string, value: string) => void
  onColumnNameBlur: (columnId: string) => void
  onCancel: () => void
  onSubmit: () => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [viewportWidth, setViewportWidth] = useState(0)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const update = () => setViewportWidth(el.clientWidth)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [open])

  const tableLayout = useMemo(() => {
    const columnInputs = elementColumns.map((column) => {
      const header = column.rawName.trim() || '元素'
      const samples = rows.map((row) => (column.element ? formatBatchTableDisplay(row.ratios[column.element] ?? 0) : ''))
      return { header, samples }
    })
    return computeLibraryDialogColWidths(columnInputs, viewportWidth)
  }, [elementColumns, rows, viewportWidth])

  if (!open) return null

  const ariaLabel = mode === 'edit' ? '修改原料' : '添加原料'
  const title = mode === 'edit' ? '修改原料' : '添加原料'
  const submitLabel = mode === 'edit' ? '保存修改' : '添加到原料库'
  const { widths: colWidths, tableWidth } = tableLayout

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label={ariaLabel}>
      <div className={`max-h-[88vh] w-[96vw] max-w-[90rem] overflow-hidden rounded-lg border shadow-xl ${darkMode ? 'border-gray-600 bg-gray-900 text-gray-100' : 'border-gray-200 bg-white text-gray-900'}`}>
        <div className={`flex flex-wrap items-start justify-between gap-3 border-b px-4 py-3 ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
          <div>
            <h3 className={sectionTitle(darkMode)}>{title}</h3>
            <p className={`${hintText(darkMode)} mt-1`}>
              本模块支持用户自定义原料，可任意添加原料种类并为其完整配置元素成分与含量，适用于复杂原料或新型原料的计算。
            </p>
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
        <div ref={containerRef} className="max-h-[58vh] overflow-auto px-4 py-3">
          <table className="table-fixed w-full text-sm" style={{ width: tableWidth }}>
            <CopperBatchTableColGroup widths={colWidths} />
            <thead className={darkMode ? 'bg-gray-800 text-gray-300' : 'bg-gray-50 text-gray-600'}>
              <tr>
                <th className="px-2 py-2 text-center align-middle">原料名称</th>
                <th className="px-1 py-2 text-center align-middle text-xs font-medium">元素</th>
                {elementColumns.map((column) => {
                  const invalid = column.rawName.trim().length > 0 && !column.element
                  return (
                    <th key={column.id} className="px-1 py-2 align-top">
                      <div className="relative">
                        <input
                          className={`${inputSm(darkMode)} h-8 w-full px-1 text-center text-xs ${
                            invalid ? (darkMode ? 'border-red-500 text-red-200' : 'border-red-400 text-red-700') : ''
                          }`}
                          value={column.rawName}
                          placeholder=""
                          title={invalid ? '无法识别的元素/化合物' : undefined}
                          onChange={(event) => onColumnNameChange(column.id, event.target.value)}
                          onBlur={() => onColumnNameBlur(column.id)}
                        />
                        {elementColumns.length > 1 && (
                          <button
                            type="button"
                            aria-label="删除此元素列"
                            className={`absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full text-[10px] leading-none ${
                              darkMode ? 'bg-gray-700 text-gray-300 hover:bg-red-900 hover:text-red-100' : 'bg-gray-200 text-gray-600 hover:bg-red-100 hover:text-red-700'
                            }`}
                            onClick={() => onRemoveColumn(column.id)}
                          >
                            ×
                          </button>
                        )}
                      </div>
                    </th>
                  )
                })}
                <th className="px-1 py-2 text-center align-middle">
                  <button
                    type="button"
                    aria-label="添加元素列"
                    className={`flex h-8 w-8 items-center justify-center rounded border text-lg font-medium leading-none ${
                      darkMode ? 'border-gray-600 text-gray-200 hover:bg-gray-700' : 'border-gray-300 text-gray-700 hover:bg-gray-100'
                    }`}
                    onClick={onAddColumn}
                  >
                    +
                  </button>
                </th>
                <th className="px-1 py-2 text-center align-middle">Other</th>
                <th className="px-1 py-2 text-center align-middle">单行合计</th>
                <th className="px-1 py-2 text-center align-middle">操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const total = rowTotal(row)
                const totalClass = Math.abs(total - 100) > 0.05 || total > 100.05
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
                    <td className={`px-1 py-1.5 text-center text-xs font-medium ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                      含量
                    </td>
                    {elementColumns.map((column) => (
                      <td key={column.id} className="px-1 py-1.5">
                        <input
                          className={`${inputSm(darkMode)} h-8 w-full px-1 text-center font-mono text-sm`}
                          value={column.element ? ratioInputValue(row.id, column.element, row.ratios[column.element]) : ''}
                          disabled={!column.element}
                          placeholder={column.element ? '' : '—'}
                          onChange={(event) => {
                            if (column.element) onColumnRatioChange(row.id, column.element, event.target.value)
                          }}
                          onBlur={() => {
                            if (column.element) onColumnRatioBlur(row.id, column.element)
                          }}
                        />
                      </td>
                    ))}
                    <td className="px-1 py-1.5" aria-hidden="true" />
                    <td className="px-1 py-1.5">
                      <input
                        className={`${inputSm(darkMode)} h-8 w-full px-1 text-center font-mono text-sm`}
                        value={ratioInputValue(row.id, 'Other(其他)', row.ratios['Other(其他)'])}
                        onChange={(event) => onOtherRatioChange(row.id, event.target.value)}
                        onBlur={() => onColumnRatioBlur(row.id, 'Other(其他)')}
                      />
                    </td>
                    <td className={`px-1 py-1.5 text-center font-mono ${totalClass}`}>{formatTableDisplayValue(total)}</td>
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
    { id: 'element', label: '投入-物料元素表' },
    { id: 'phase', label: '投入-物料物相表' },
    { id: 'productPhase', label: '产出-产物物相表' },
    { id: 'productElement', label: '产出-产物元素表' },
    { id: 'balance', label: '热平衡计算' },
  ]
  return (
    <div className={`inline-flex items-end gap-1 rounded-t-md border-b-2 px-1 pt-1 ${darkMode ? 'border-gray-600' : 'border-gray-300'}`}>
      {tabs.map((tab) => {
        const active = tab.id === activeView
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={`min-w-24 rounded-t-md border px-4 py-2 font-medium transition-all ${
              active
                ? darkMode
                  ? 'border-blue-500 border-b-gray-800 bg-gray-800 text-base font-semibold text-gray-100 shadow-md'
                  : 'border-blue-500 border-b-white bg-white text-base font-semibold text-gray-900 shadow-md'
                : darkMode
                ? 'border-gray-700 border-b-transparent bg-gray-900/50 text-sm text-gray-400 hover:border-gray-600 hover:text-gray-200'
                : 'border-gray-200 border-b-transparent bg-gray-100 text-sm text-gray-600 hover:border-gray-300 hover:text-gray-900'
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
  steps,
}: {
  darkMode: boolean
  activeSheet: SheetId
  steps?: { label: string; status: WorkflowStepStatus }[]
}) {
  const activeIndex = STAGES.findIndex((stage) => stage.id === activeSheet)
  const active = STAGES[activeIndex] ?? STAGES[0]
  const isProcessSheet = activeSheet === 'cu_smelting' || activeSheet === 'cu_converting' || activeSheet === 'cu_refining'
  const equipmentFlowText =
    activeSheet === 'cu_equipment'
      ? '操作流程：汇总熔炼/吹炼/精炼结果 → 选择目标规模 → 调整设备选型总表 → 形成设备选型依据'
      : null

  return (
    <div className={cardCompact(darkMode)}>
      <div>
          <h3 className={`${sectionTitle(darkMode)} mb-1`}>{active.name}</h3>
          <p className={`${hintText(darkMode)} leading-relaxed`}>{active.description}</p>
          {equipmentFlowText && (
            <span className={`mt-2 block text-sm leading-relaxed ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
              {equipmentFlowText}
            </span>
          )}
          {isProcessSheet && steps && (
            <div className="mt-3">
              <WorkflowFlowStrip darkMode={darkMode} steps={steps} />
            </div>
          )}
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
