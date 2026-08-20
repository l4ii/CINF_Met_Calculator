/**
 * 铜-火法-富氧侧吹-熔炼-配料计算（独立页面）。
 * 保留精矿混料 / 物相辅助 / 燃料煤；挂载时从 cache 恢复熔炼快照。
 */
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
import type { SheetId } from '../../../../types'
import { APP_PLATFORM_NAME_ZH } from '../../../../constants/appCopy'
import { btnPrimary, btnSecondary, cardBase, cardCompact, hintText, inputBase, inputSm, sectionTitle } from '../../../../theme/uiTheme'
import {
  buildCopperBatchExportBaseName,
  type CopperBatchExportColumn,
  type CopperBatchExportRow,
  type CopperBatchWorkbookSheet,
} from '../../../../utils/copperBatchExport'
import { buildHeatBalanceExportSheets } from '../../../../utils/copperHeatBalanceExport.ts'
import {
  buildElementBalanceSheet,
  buildInputMaterialPhaseSheet,
  buildInputMaterialElementSheet,
  type CopperReportMaterial,
} from '../../../../utils/copperReportSheetBuilders.ts'
import {
  copperStageExportProfile,
  copperStageExportSheetKeys,
} from '../../../../utils/copperStageExportProfile.ts'
import {
  resolveOxySolverColdStartInputs,
  resolveOxySolverRecommendedInputs,
} from '../../../../utils/copperOxySolverInputs.ts'
import {
  patchCopperMetcalFloCase,
  type CopperMetcalFloStagePayload,
} from '../../../../utils/copperMetcalFloCase.ts'
import {
  buildMetcalFloImportBundle,
  buildMetcalImportedPhaseState,
  type MetcalFloImportBundle,
} from '../../../../utils/metcalFloMixExtract.ts'
import {
  batchElementTableWidth,
  batchPhaseTableWidth,
  batchTableNameColWidthFromLabels,
  computeLibraryDialogColWidths,
  computePhaseAssistTableLayout,
} from '../../../../utils/copperBatchTableLayout'
import {
  CONSTRAINT_PLACEHOLDER_ELEMENTS,
  OXY_SIDE_BLOW_PRODUCT_KEYS,
  isCoolingWaterCustomConstraint,
  loadOxySideBlowConstraints,
  loadOxyConvertingConstraints,
  normalizeConvertingCustomConstraintExprs,
  normalizeSmeltingCustomConstraintExprs,
  ensureConvertingProductPhases,
  stripUnsupportedConvertingCustomConstraints,
  oxyProductDisplayName,
  stripPlaceholderElementDistributions,
  type ConstraintElementKey,
  type CustomConstraintEntry,
  type DistributionRuleType,
  type ElementDistributionEntry,
  type OxyProductDisplayStage,
  type OxySideBlowConstraintConfig,
  type OxySideBlowProductKey,
} from '../../../../utils/copperConstraintConfig.ts'
import {
  autoFillOxyProductConstraintConfig,
  firstBlockingConstraintMessage,
  migrateOxyProductConstraintDefaults,
  productCanCarryConstraintElement,
  resolveConstraintRuleValue,
  validateOxyProductConstraintConfig,
} from '../../../../utils/copperConstraintValidation.ts'
import { sortOxyConstraintElementKeys } from '../../../../utils/copperConstraintElementOrder.ts'
import { CopperBatchTableColGroup } from '../../CopperBatchTableColGroup'
import {
  CopperBatchElementTable,
  type SolveInputStatus,
} from '../../CopperBatchElementTable'
import { CopperBatchPhaseTables, type PhaseTableColumn } from '../../CopperBatchPhaseTables'
import {
  CopperProcessParametersPanel,
  parseProcessParameterDrafts,
  processParametersToDrafts,
  type CopperProcessParameterDrafts,
} from '../../CopperProcessParametersPanel'
import {
  CopperBatchExportDialog,
  type CopperBatchExportGroupOption,
  type CopperBatchExportSelection,
  type CopperBatchExportSheetKey,
} from '../../CopperBatchExportDialog'
import { buildCopperProcessTextExportDocx } from '../../../../utils/copperProcessTextExport.ts'
import {
  loadDefaultCopperFloTemplate,
  saveCopperExportBundle,
  type CopperExportBundleFile,
} from '../../../../utils/copperExportBundle.ts'
import { MetcalFloImportPanel } from '../../MetcalFloImportPanel'
import { WorkflowContextFloatingHint } from '../../WorkflowContextHint'
import { BatchTableNumericReadonly } from '../../BatchTableNumericCell'
import { batchTableHasResult, formatBatchTableDisplay, formatBatchTableTooltip } from '../../../../utils/batchTableNumeric'
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
} from '../../../../utils/copperPhaseTableCalc'
import {
  COPPER_PLACEHOLDER_ELEMENT_KEYS,
  COPPER_PLACEHOLDER_PHASE_ROW_KEYS,
  sortCopperElementKeys,
  sortCopperPhaseKeys,
  sortMaterialPhaseRows,
} from '../../../../utils/copperDisplayOrder'
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
} from '../../../../utils/copperPhaseAssist'
import {
  COPPER_ELEMENT_TABLE_ALWAYS_INCLUDE,
  collectFeedConstraintElementKeys,
  visibleCopperElementKeys,
} from '../../../../utils/copperElementVisibility.ts'
import {
  buildElementTableDisplayKeys,
  decomposeElementTableRatios,
  decomposePhaseElementMasses,
  elementTableHeaderLabel,
  elementSymbolLabel,
  buildPhaseAssistElementRowSlots,
  getPhaseTableColumnKeys,
  phaseTableHeaderLabel,
  type CopperElementDisplayMode,
} from '../../../../utils/copperElementDisplay.ts'
import { formulaToDisplayLabel } from '../../../../utils/chemicalFormula.ts'
import { PhaseFormulaDisplay } from '../../../PhaseFormulaDisplay.tsx'
import {
  buildBlendPhaseMassFromMaterialResults,
  buildPhasePivotRows,
  computeAllMaterialPhaseResults,
  formatPhasePercentDraft,
  phaseContentsToInputPhaseMap,
  sumPhasePivotTotals,
  validateRawMaterialPhaseInputs,
  type PhaseBatchResults,
  type PhaseMaterialCalcResult,
} from '../../../../utils/copperPhaseBatchCalc'
import { resolveBatchWorkflowHint } from '../../../../utils/copperBatchWorkflowHint.ts'
import {
  CONVERTING_LIME_SOLVENT_ID,
  CONVERTING_WHITE_MATTE_ID,
  applyMetcalConvertingFeedsToState,
  createProcessStageStateForId,
  isConvertingWhiteMattePhaseLocked,
  syncConvertingMaterialFromPhases,
  syncWhiteMatteFromSmelting,
  convertingWhiteMatteFeedWarning,
} from '../../../../utils/copperConvertingFeed.ts'
import {
  buildPersistedCaseContent,
  cloneProcessStageState,
  COPPER_PROCESS_STAGE_IDS,
  copperStageUnlockBlockReason,
  createBlankProcessStageState,
  hasProcessStageGeneratedData,
  isProcessStageComplete,
  isProcessStageHeatBalanceReady,
  isProcessStageProductReady,
  normalizeChemicalHeatMode,
  normalizePersistedContentForDirtyCheck,
  processStageIdForSheet,
  resolveCaseProcessStages,
  resolveResumeBatchTableView,
  serializePersistedCaseContent,
  type CopperCaseProcessStages,
  type CopperProcessStageState,
} from '../../../../utils/copperProcessStageState.ts'
import {
  applyProcessParameters,
  constraintUsesGmcVariable,
  DEFAULT_COPPER_PROCESS_PARAMETERS,
  extractProcessParameters,
  FUEL_CONCENTRATE_RATIO_EXPR,
  migrateSecondaryAirOxygenSupplyConstraints,
  processParametersFromConfig,
  processParametersFromLegacyCase,
  type CopperProcessParameters,
} from '../../../../utils/copperProcessParameters.ts'
import {
  applyRawMaterialRatioTotalValidation,
  formatRawMaterialRatioValidationMessage,
  isRawMaterialKnownTotalOverLimit,
  rawMaterialValidatedRatiosChanged,
  sulfurInputStatus,
  validateLibraryDialogElementColumns,
  validateMaterialForPhaseCalc,
  validateRatiosSulfurRequirement,
} from '../../../../utils/copperMaterialValidation'
import {
  calculateGasVolumePercents,
  calculateProductPhaseComposition,
  deriveProductElementsFromPhases,
  isProductPhaseColumnValid,
  parseProductPhaseDraftMap,
  PRODUCT_PHASE_DISPLAY,
  PRODUCT_PHASE_ROWS,
  type ProductPhasePercentMap,
} from '../../../../utils/copperProductPhaseCalc'
import {
  calculateAnnualFeedWithoutCoalTa,
  calculateBathHeightM,
  calculateCopperEquipmentSizing,
  calculateDailyFeedTd,
  calculateFurnaceLengthM,
  calculateFurnaceWidthM,
  calculateOxygenColumnVolumeNm3h,
  calculateProcessAirColumnVolumeNm3h,
  calculateSmeltingFurnaceDesign,
  DEFAULT_SMELTING_FURNACE_WIDTH_M,
  DEFAULT_SMELTING_JACKET_PITCH_MM,
  DEFAULT_SMELTING_MATTE_DENSITY_TM3,
  DEFAULT_SMELTING_PROCESS_DAYS,
  DEFAULT_SMELTING_SLAG_DENSITY_TM3,
  DEFAULT_SMELTING_TUYERE_OXYGEN_NM3H,
  findOxygenAirColumn,
  normalizeScaleWanTpa,
  sumRawWetThroughputTh,
  type JacketRemainderDecision,
  type SmeltingFurnaceDesignResult,
} from '../../../../utils/copperEquipmentSizing'
import { resolveFurnaceBodyHeightM } from '../../../../utils/copperFurnaceGeometry.ts'
import {
  COPPER_ELEMENT_KEYS,
  COPPER_SW_CONCENTRATE_LIBRARY_IDS,
  calculateKnownTotal,
  calculateWeightedComposition,
  createSmeltingMaterialLibrary,
  filterLibraryByGroup,
  isLibraryRawCategory,
  isMixOtherMaterial,
  libraryCategoryLabel,
  materialWaterWeight,
  migrateMaterialWaterWeight,
  partitionRawMixMaterials,
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
  normalizeCopperAssayRatios,
  normalizeKnownCopperRawMaterialAssay,
  normalizeCopperRatios,
  parseCopperLibraryCsv,
  resolveCopperElementKey,
  type CopperElementKey,
  type CopperLibraryMaterial,
  type CopperMaterialColumn,
  type CopperRatios,
  type CopperSolventSolution,
} from '../../../../utils/copperWorkflowCalc'
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
} from '../../../../utils/copperProcessCalc'
import {
  calculateCoolingWaterHeatMJh,
  calculateCoolingWaterPhysicalRows,
  calculateCopperHeatBalanceDetailed,
  calculateHessChemicalHeatMJh,
  estimateFuelEffectiveHeatMJt,
  estimateFuelWeightFromHeatDeficit,
  type CopperChemicalHeatMode,
  type CopperHeatBalanceProcess,
  type CopperHeatBalanceResult,
  type HeatComponentRow,
  type HeatFlowRow,
} from '../../../../utils/copperHeatBalance.ts'
import {
  applyPostFuelClosureToHeatBalance,
  hessFuelSearchResidualMJh,
  hessHeatDeficitWithoutCoolingMJh,
} from '../../../../utils/copperHeatBalanceClosure.ts'
import {
  fuelSearchResidualFromDeficitMJh,
  fuelSearchSensitivityAbnormal,
  proposeNextFuelWeightTh,
} from '../../../../utils/copperHeatBalanceFuelSearch.ts'
import { derivedFuelDryMass, type OxyConstraintBaseInput } from '../../../../utils/copperConstraintUnknowns.ts'
import {
  classifyOxyConstraintAcceptance,
  formatConstraintConflictLine,
  formatConstraintConflictNote,
  OXY_STRICT_RELATIVE_RESIDUAL,
  oxySolverResultToSeed,
  parseConstraintExpression,
  solveOxySideBlowProducts,
  type OxyConstraintSolverResult,
  type OxySolverSeed,
} from '../../../../utils/copperConstraintSolver.ts'
import {
  OxyConstraintCalculationCancelledError,
  isOxyConstraintCalculationCancelled,
} from '../../../../utils/copperConstraintSystemSolver.ts'
import {
  oxyProductPhasePercentMaps,
  oxyProductTableColumns,
  oxySolverToCopperProductResult,
} from '../../../../utils/copperOxyProductBridge.ts'
import type { ProductElementTableProduct } from '../../CopperBatchProductElementTable.tsx'
import { CopperProductionResultTable } from '../../CopperProductionResultTable.tsx'
import { CopperHeatBalancePlaceholderTables, HeatAuxiliaryParamsStrip } from '../../CopperHeatBalancePlaceholderTables.tsx'
import SmeltingFurnaceViewer, { type SmeltingFurnaceViewerHandle } from '../../SmeltingFurnaceViewer.tsx'
import { ListPaginationBar } from '../../../ListPaginationBar.tsx'
import { DEFAULT_LIST_PAGE_SIZE, pageCountFor } from '../../../../utils/pagination.ts'

import {
  COPPER_CASE_STAGES as STAGES,
  copperCaseStageName,
  copperPageKindForSheet,
  equipmentStageIdForSheet,
  isCopperCaseStageId,
  isCopperRefiningPlaceholderSheet,
  navigationActionDescription,
  navigationTargetName,
  nextCopperCaseStageId,
  normalizeCopperCaseStageId,
  previousCopperCaseStageId,
  type CopperCaseStageId,
  type EquipmentStageId,
} from '../shared/copperStageNavigation.tsx'
import { buildSmeltingHeatBalanceSourceMaterials } from './smeltingHeatBalanceMaterials.ts'
import { buildConvertingHeatBalanceSourceMaterials } from '../converting/convertingHeatBalanceMaterials.ts'
import { ensureStageUsesConvertingProductPhases } from '../converting/convertingProductConstraints.ts'
import {
  clearCopperProcessStagesCache,
  getActiveCopperCaseId,
  getCopperProcessStagesCache,
  getLastNormalizedSmeltMethodId,
  getLoadedCopperProcessStageId,
  setActiveCopperCaseId,
  setCopperProcessStagesCache,
  setLastNormalizedSmeltMethodId,
  setLoadedCopperProcessStageId,
} from '../shared/copperStageCacheStore.ts'

export interface SmeltingBatchCalcPageProps {
  darkMode: boolean
  language?: 'zh' | 'en'
  activeSheet: SheetId
  onStageSelect: (sheet: SheetId) => void
  smeltMethodId: string
  smeltMethodName: string
  caseTitleDraft?: string
  onActiveCaseNameChange?: (name: string | null) => void
  forcedPageKind?: ReturnType<typeof copperPageKindForSheet>
}

type PhaseUnknowns = Pick<Record<CopperElementKey, number>, 'O(氧)' | 'C (碳)' | 'Other(其他)'>
type PhasePreviewUnknowns = { materialId: string; phaseContents: Record<string, number>; values: PhaseUnknowns }

function buildPhasePreviewUnknowns(materialId: string, result: PhaseMaterialCalcResult): PhasePreviewUnknowns {
  return {
    materialId,
    phaseContents: result.phaseContents,
    values: result.unknowns,
  }
}

function phaseSheetTabStatus(
  materialId: string,
  material: Pick<CopperMaterialColumn, 'name' | 'weight'> | undefined,
  phaseCompletedMaterials: Record<string, boolean>,
  phaseBatchResults: PhaseBatchResults | null
): '已回填' | '已计算' | '计算失败' | '待投料量' | '未计算' {
  if (phaseCompletedMaterials[materialId]) return '已回填'
  if (phaseBatchResults?.[materialId]?.valid === false) return '计算失败'
  if (phaseBatchResults?.[materialId]?.valid) return '已计算'
  if (material && (!material.name.trim() || material.weight <= 0)) return '待投料量'
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

type CopperLibraryCategory = CopperLibraryMaterial['category']
type SingleLibraryRow = {
  id: string
  libraryMaterialId?: string
  name: string
  /** 空字符串表示未选择类型（可选） */
  category: CopperLibraryCategory | ''
  ratios: CopperRatios
}
type LibraryDialogElementColumn = { id: string; rawName: string; element: CopperElementKey | null }
type LibraryMaterialDialogMode = 'add' | 'edit'
const LIBRARY_CATEGORY_OPTIONS: { value: CopperLibraryCategory | ''; label: string }[] = [
  { value: '', label: '-' },
  { value: 'concentrate', label: '原料' },
  { value: 'return', label: '回流' },
  { value: 'product', label: '产物' },
  { value: 'flux', label: '熔剂' },
]
type EquipmentBomItem = {
  id: string
  name: string
  specification: string
  quantity: number
  unit: string
  material: string
  note: string
}
type DraftRatioKind = 'raw' | 'solvent' | 'fuel' | 'gas'
type BatchTableView = 'element' | 'phase' | 'parameters' | 'productPhase' | 'productElement' | 'balance'
type CopperProcessStageId = Extract<SheetId, 'cu_smelting' | 'cu_converting' | 'cu_refining'>

const COPPER_CASES_STORAGE_KEY = 'metcal.copper.cases.v1'
const METCAL_COPPER_CASE_FILE_TYPE = 'metcal-copper-case'

function normalizeBatchTableView(value: unknown, _productFilledBack = false): BatchTableView {
  if (value === 'phase' || value === 'parameters' || value === 'productPhase') return value
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
const EMPTY_CUSTOM_CONSTRAINT_DRAFT: CustomConstraintDraft = { expr: '', target: '' }
type ProductConstraintValueDrafts = Record<string, string>

const FIXED_MATTE_COPPER_GRADE = DEFAULT_COPPER_PROCESS_PARAMETERS.matteCopperGrade
const FUEL_WET_BASIS_WATER_EXPR = 'Input.煤.H2O / Input.煤湿基'
const FEED_LEAK_AIR_EXPR = 'Input.加料口漏风 / 4500'
const LEGACY_FEED_LEAK_AIR_EXPR = 'Input.加料口漏风 / 5.73'
const HEAT_BALANCE_CLOSURE_MAX_ITERATIONS = 24
const HEAT_BALANCE_MIN_RESIDUAL_TOLERANCE_MJH = 0.01
const HEAT_BALANCE_CLOSURE_MAX_FUEL_RATIO = 0.35
const HEAT_BALANCE_CLOSURE_MAX_FUEL_MULTIPLE = 4
const HEAT_BALANCE_LINKED_PRODUCT_SOLVER_PASSES = 3
const DEFAULT_OTHER_HEAT_MJH_TEXT = '500'
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
  const next = cloneOxyConstraintConfig(
    stripPlaceholderElementDistributions(migrateSecondaryAirOxygenSupplyConstraints(config))
  )
  delete next._variableNotes
  next.customConstraints = next.customConstraints.map((entry) =>
    entry.expr.replace(/\s+/g, '') === LEGACY_FEED_LEAK_AIR_EXPR.replace(/\s+/g, '')
      ? { ...entry, expr: FEED_LEAK_AIR_EXPR }
      : entry
  )
  if (!next.variables?.GMC) {
    next.variables = { ...(next.variables ?? {}), GMC: FIXED_MATTE_COPPER_GRADE }
  }
  return applyProcessParameters(next, extractProcessParameters(next), { addMissingConstraints: false })
}

const DEFAULT_OXY_CONSTRAINT_CONFIG = normalizeProductConstraintFixedValues(loadOxySideBlowConstraints())
const DEFAULT_OXY_CONVERTING_CONSTRAINT_CONFIG = normalizeProductConstraintFixedValues(
  loadOxyConvertingConstraints()
)
const PRODUCT_INPUT_PHASE_BLEND_NAME = '\u6df7\u5408\u94dc\u7cbe\u77ff'

function defaultOxyConstraintConfigForStage(
  stageId?: CopperProcessStageId | null
): OxySideBlowConstraintConfig {
  return stageId === 'cu_converting' ? DEFAULT_OXY_CONVERTING_CONSTRAINT_CONFIG : DEFAULT_OXY_CONSTRAINT_CONFIG
}

function createDefaultProductConstraintConfig(
  stageId?: CopperProcessStageId | null
): OxySideBlowConstraintConfig {
  return autoFillOxyProductConstraintConfig(defaultOxyConstraintConfigForStage(stageId)).config
}

function normalizeOxyConstraintConfig(
  config: OxySideBlowConstraintConfig | null | undefined,
  stageId?: CopperProcessStageId | null
): OxySideBlowConstraintConfig {
  const defaults = defaultOxyConstraintConfigForStage(stageId)
  const normalized = config
    ? migrateOxyProductConstraintDefaults(normalizeProductConstraintFixedValues(config), defaults)
    : createDefaultProductConstraintConfig(stageId)
  const filled = autoFillOxyProductConstraintConfig(normalized).config
  if (stageId === 'cu_converting') {
    return ensureConvertingProductPhases(
      stripUnsupportedConvertingCustomConstraints(
        normalizeConvertingCustomConstraintExprs({
          ...filled,
          method: filled.method?.includes('converting') ? filled.method : 'cu-oxy-side-blast-converting',
          customConstraints: filled.customConstraints.filter((entry) => !isCoolingWaterCustomConstraint(entry.expr)),
        })
      )
    )
  }

  // 熔炼：若被吹炼配置污染，整表回退熔炼默认；否则仅把产物名改回熔炼符号
  const smeltingBase =
    /converting/i.test(filled.method ?? '') ||
    filled.customConstraints.some((entry) =>
      /吹炼出炉烟气|吹炼烟气含尘|吹炼渣|Output\.粗铜|OutputE\.粗铜/.test(entry.expr)
    )
      ? migrateOxyProductConstraintDefaults(filled, defaults)
      : filled
  return normalizeSmeltingCustomConstraintExprs({
    ...smeltingBase,
    method: 'cu-oxy-side-blast',
  })
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

function customConstraintExpressionTitle(
  expr: string,
  variables?: Record<string, number | string>
) {
  const base = displayConstraintExpression(expr)
  if (!constraintUsesGmcVariable(expr)) return base
  const gmc = variables?.GMC ?? variables?.CMG
  const gmcText =
    typeof gmc === 'number' && Number.isFinite(gmc)
      ? `${gmc}%`
      : '冰铜品位'
  return `${base}（GMC = ${gmcText}，同关键参数「冰铜品位」与白铜锍 Cu W%）`
}

function visibleCustomConstraints(
  config: OxySideBlowConstraintConfig,
  options?: { hideCoolingWater?: boolean }
) {
  return config.customConstraints
    .map((constraint, index) => ({ constraint, index }))
    .filter(({ constraint }) => {
      if (constraint.expr === FUEL_WET_BASIS_WATER_EXPR) return false
      if (options?.hideCoolingWater && isCoolingWaterCustomConstraint(constraint.expr)) return false
      return true
    })
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
  defaultConfig: OxySideBlowConstraintConfig,
  feedElementKeys?: readonly string[] | null
): ProductConstraintRow[] {
  const elements = new Set<ConstraintElementKey>()
  const collect = (source: OxySideBlowConstraintConfig) => {
    for (const entry of source.elementDistributions) elements.add(entry.element)
  }
  collect(defaultConfig)
  collect(config)
  if (feedElementKeys && feedElementKeys.length > 0) {
    // feedElementKeys 已是约束口径（氧化物当量已映射为 Si/Ca/Mg/Al 单质键）
    const feed = new Set(feedElementKeys)
    for (const key of feedElementKeys) elements.add(key)
    const filtered = [...elements].filter((element) => feed.has(element))
    return sortOxyConstraintElementKeys(filtered).map((element) => ({ element }))
  }
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

  // 空串 / 仅空白 → 未知（计算）；显式「0」才是固定 0%
  const normalized = normalizeConstraintRuleValue(draftValue)
  const value: number | string = normalized === null ? '' : normalized
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
  if (productKey === 'matte' && elementKey === 'Cu(铜)' && type === 'W%') {
    const resolved = resolveConstraintRuleValue(value, next.variables, '白铜锍 Cu W%')
    if (resolved.valid) {
      next.variables = { ...(next.variables ?? {}), GMC: resolved.value }
    }
  }
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
  processParameters?: CopperProcessParameters
  processParametersConfirmed?: boolean
  constraintEditorReached?: boolean
  solventSolution: CopperSolventSolution | null
  phaseCompletedMaterials: Record<string, boolean>
  phasePreviewUnknowns: PhasePreviewUnknowns | null
  phaseBatchResults?: PhaseBatchResults | null
  manualPhaseCells: Record<string, boolean>
  manualSolventWeights: Record<string, boolean>
  manualFuelWeightValid: boolean
  manualAirWeights?: Record<string, boolean>
  manualAirWeightValid?: boolean
  phaseCompleted: boolean
  productCalculated: boolean
  productFilledBack?: boolean
  productSolverResult?: OxyConstraintSolverResult | null
  /** Flo 导入的 MetCal 产出对照结果 */
  metcalProductResult?: OxyConstraintSolverResult | null
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
  coolingWaterInletTemperature?: string
  coolingWaterOutletTemperature?: string
  coolingWaterMassTh?: string
  coolingWaterHeatMJh?: string
  furnaceWallTemperature?: string
  heatLossMJh: string
  otherHeatMJh: string
  heatBalanceTolerancePct?: string
  chemicalHeatMode?: CopperChemicalHeatMode
  heatBalanceFilledBack?: boolean
  annualHours: string
  equipmentIntensity: string
  targetScaleWanTpa: string
  equipmentAdjustments: Record<EquipmentStageId, string>
  equipmentDimensionAdjustments?: Record<EquipmentStageId, string>
  equipmentModelGenerated?: Record<EquipmentStageId, boolean>
  equipmentBomGenerated?: Record<EquipmentStageId, boolean>
  smeltingDailyFeedTd?: string
  smeltingFeedMode?: 'daily' | 'annual'
  smeltingAnnualFeedTa?: string
  smeltingProcessDays?: string
  smeltingBedCapacity?: string
  smeltingFurnaceWidthM?: string
  smeltingFurnaceLengthM?: string
  smeltingDimensionDrive?: 'width' | 'length'
  smeltingJacketPitchMm?: string
  smeltingJacketCountTotal?: string
  smeltingOxygenNm3h?: string
  smeltingTuyereOxygenNm3h?: string
  smeltingTuyereCount?: string
  smeltingSlagDensityTm3?: string
  smeltingMatteDensityTm3?: string
  smeltingDailyFeedOverridden?: boolean
  smeltingAnnualFeedOverridden?: boolean
  smeltingOxygenOverridden?: boolean
  /** @deprecated 水套改为余量处置，不再反算间隔 */
  smeltingJacketCountOverridden?: boolean
  smeltingJacketRemainderDecision?: JacketRemainderDecision | null
  smeltingTuyereCountOverridden?: boolean
  smeltingJacketCountOneSide?: string
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
  /** 熔炼 / 吹炼 / 精炼 各工序独立计算状态 */
  processStages?: CopperCaseProcessStages
}


/** 设备选型三区共用：第一行「输入参数 + 结果卡」，结果列固定占比使三区结果栏对齐 */
const EQUIP_ROW_GRID = 'grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,3fr)_minmax(12rem,1fr)]'
const EQUIP_BLOCK_TITLE = 'text-xs font-semibold tracking-wide'
const EQUIP_ITEM_LABEL = 'text-[11px]'
const EQUIP_ITEM_VALUE = 'font-mono text-sm font-semibold'
const EQUIP_ITEM_UNIT = 'ml-1 text-[10px] font-medium'
/** 三区结果卡等高，保证结果栏横向对齐后视觉一致 */
const EQUIP_RESULT_MIN_H = 'h-full min-h-[7.5rem]'
/** 关键参数条目按项数铺满整行 */
const EQUIP_KEY_PARAM_COLS: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-3',
  4: 'grid-cols-2 sm:grid-cols-4',
  5: 'grid-cols-2 sm:grid-cols-3 xl:grid-cols-5',
  6: 'grid-cols-2 sm:grid-cols-3 xl:grid-cols-6',
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
  cu_converting: { matte: '粗铜', slag: '吹炼渣', gas: '吹炼出炉烟气', dust: '吹炼烟气含尘' },
  cu_refining: { matte: '阳极铜/精铜', slag: '精炼渣' },
}

const DEFAULT_SMELTING_COOLING_WATER_MASS_TH = '3000'
const DEFAULT_CONVERTING_COOLING_WATER_MASS_TH = '1400'

function defaultCoolingWaterMassThForStage(stageId?: CopperProcessStageId | null) {
  return stageId === 'cu_converting' ? DEFAULT_CONVERTING_COOLING_WATER_MASS_TH : DEFAULT_SMELTING_COOLING_WATER_MASS_TH
}

function oxyProductDisplayStageForProcess(stageId?: CopperProcessStageId | null): OxyProductDisplayStage {
  return stageId === 'cu_converting' ? 'converting' : 'smelting'
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

function productConflictPanelClassName(darkMode: boolean) {
  return `rounded-lg border p-3 text-sm ${
    darkMode ? 'border-red-700 bg-red-950/30 text-red-100' : 'border-red-200 bg-red-50 text-red-800'
  }`
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

function nearlyEqual(a: number | undefined, b: number, tolerance = 1e-3) {
  return Math.abs((a ?? 0) - b) <= tolerance
}

function normalizeBuiltInSolventColumn(material: CopperMaterialColumn): CopperMaterialColumn {
  if (material.kind !== 'solvent' || material.id !== 'solvent-silica' || material.name !== '石英石') return material
  const ratios = material.ratios
  const legacySilica =
    nearlyEqual(ratios['Fe(铁)'], 0) &&
    nearlyEqual(ratios['SiO₂(二氧化硅)'], 95) &&
    nearlyEqual(ratios['CaO(氧化钙)'], 0) &&
    nearlyEqual(ratios['MgO(氧化镁)'], 0)
  const convertedSilica =
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
    nearlyEqual(ratios['Fe(铁)'], 0.731, 0.02) &&
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
  const migrated = migrateMaterialWaterWeight({
    ...material,
    ratios: { ...material.ratios },
  })
  return migrated.kind === 'raw'
    ? normalizeKnownCopperRawMaterialAssay(migrated)
    : normalizeBuiltInSolventColumn(migrated)
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

type HeatBalanceNormalizeOptions = {
  process?: CopperHeatBalanceProcess
  coolingWaterInletTemperatureC?: number
  coolingWaterOutletTemperatureC?: number
  coolingWaterMassTh?: number
}

function isCoolingWaterHeatFlowRow(row: HeatFlowRow) {
  return typeof row.material === 'string' && row.material.includes('冷却水')
}

function isInputFuelCombustionHeatFlowRow(row: HeatFlowRow) {
  return row.material === '燃料煤燃烧热' || row.material === '燃料煤有效热' || row.material === '入炉燃料煤燃烧热'
}

function isSupplementalFuelHeatFlowRow(row: HeatFlowRow) {
  return row.material.includes('补充燃料煤') || row.material.includes('补充煤')
}

function isFurnaceHeatFlowRow(row: HeatFlowRow) {
  return row.material.includes('炉墙')
}

function isNaturalHeatFlowRow(row: HeatFlowRow) {
  return row.material === '自然散热' || row.material === '其他热支出'
}

function isBalanceErrorHeatFlowRow(row: HeatFlowRow) {
  return row.isBalanceError === true || row.material === '误差' || row.material === '误差（超出允许带）'
}

function sumHeatFlow(rows: HeatFlowRow[]) {
  return rows.reduce((sum, row) => {
    if (row.isSubtotal) return sum
    const heat = Number.isFinite(row.heatMJh) ? row.heatMJh : 0
    if (isBalanceErrorHeatFlowRow(row)) return sum + heat
    return sum + Math.max(0, heat)
  }, 0)
}

function normalizeHeatFlowPercents(rows: HeatFlowRow[]): HeatFlowRow[] {
  const total = sumHeatFlow(rows)
  const denom = Math.abs(total)
  return rows.map((row) => {
    const heat = Number.isFinite(row.heatMJh) ? row.heatMJh : 0
    const signed = isBalanceErrorHeatFlowRow(row) ? heat : Math.max(0, heat)
    return {
      ...row,
      percent: denom > 0 ? (signed / denom) * 100 : 0,
    }
  })
}

function buildNormalizedCoolingWaterRows(
  coolingWaterMassTh: number,
  inletTemperatureC: number,
  outletTemperatureC: number
): HeatComponentRow[] {
  const coolingWaterPhysicalRows = calculateCoolingWaterPhysicalRows(coolingWaterMassTh, inletTemperatureC, outletTemperatureC)
  return [
    ...coolingWaterPhysicalRows.inputRows.map((row) => ({ ...row, section: '冷却水进口' })),
    ...coolingWaterPhysicalRows.outputRows.map((row) => ({ ...row, section: '冷却水出口' })),
  ]
}

function normalizeHeatFlowRows(
  rows: HeatFlowRow[],
  side: 'income' | 'expenditure',
  options: HeatBalanceNormalizeOptions = {}
): HeatFlowRow[] {
  return rows.flatMap((row) => {
    if (side === 'income' && isCoolingWaterHeatFlowRow(row)) return []
    if (side === 'income' && isInputFuelCombustionHeatFlowRow(row)) return []
    if (side === 'income' && isSupplementalFuelHeatFlowRow(row)) return []
    if (side === 'expenditure' && isCoolingWaterHeatFlowRow(row)) {
      return [{
        ...row,
        type: 'exchange' as const,
        material: '冷却水',
        temperature: options.coolingWaterOutletTemperatureC ?? row.temperature,
      }]
    }
    if (side === 'expenditure' && isFurnaceHeatFlowRow(row)) {
      return []
    }
    if (side === 'expenditure' && row.material === '其他热支出') {
      return [{ ...row, material: '自然散热' }]
    }
    return [row]
  })
}

function normalizeHeatBalanceResult(
  value: unknown,
  options: HeatBalanceNormalizeOptions = {}
): CopperHeatBalanceResult | null {
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
  const cloned = cloneHeatBalanceResult(result)
  if (!Array.isArray(cloned.chemicalAbsorptionRows)) {
    cloned.chemicalAbsorptionRows = cloned.equations
      .filter((row) => row.heatMJh < 0)
      .map((row) => ({
        formula: row.formula,
        source: '混料',
        sourcePhase: row.limitingPhase,
        sourceMassTh: Number.isFinite(row.sourceMassTh) ? row.sourceMassTh : 0,
        molarMassKgKmol: Number.isFinite(row.molarMassKgKmol) ? row.molarMassKgKmol : 0,
        limitingCoefficient: Number.isFinite(row.limitingCoefficient) ? row.limitingCoefficient : 1,
        extentKmolh: row.extentKmolh,
        inputExtentKmolh: row.inputExtentKmolh ?? row.extentKmolh,
        reactionHeatKJmol: row.reactionHeatKJmol,
        heatMJh: Math.max(0, -row.heatMJh),
        note: row.note,
      }))
  }
  cloned.chemicalHeatReleaseMJh = cloned.equations.reduce(
    (sum, row) => sum + (row.heatMJh > 0 ? row.heatMJh : 0),
    0
  )
  cloned.chemicalHeatAbsorptionMJh = cloned.equations.reduce(
    (sum, row) => sum + (row.heatMJh < 0 ? -row.heatMJh : 0),
    0
  )
  cloned.chemicalHeatPathMJh = cloned.chemicalHeatReleaseMJh - cloned.chemicalHeatAbsorptionMJh
  const hessNetMJh =
    cloned.outputPhysicalRows.length > 0
      ? calculateHessChemicalHeatMJh(cloned.inputPhysicalRows, cloned.outputPhysicalRows)
      : cloned.chemicalHeatPathMJh
  cloned.chemicalHeatHessMJh = hessNetMJh
  const chemicalHeatMode: CopperChemicalHeatMode =
    cloned.chemicalHeatMode === 'reaction' ? 'reaction' : 'hess'
  cloned.chemicalHeatMode = chemicalHeatMode
  const process: CopperHeatBalanceProcess =
    options.process === 'converting' || cloned.process === 'converting' ? 'converting' : 'smelting'
  cloned.process = process
  cloned.chemicalHeatMJh = chemicalHeatMode === 'hess' ? hessNetMJh : cloned.chemicalHeatPathMJh
  cloned.chemicalHeatCalculationBasis =
    chemicalHeatMode === 'hess' ? 'stream298' : 'reactionEquations'
  if (!Array.isArray(cloned.coolingWaterRows)) cloned.coolingWaterRows = []
  if (typeof cloned.coolingWaterInletTemperatureC !== 'number') {
    cloned.coolingWaterInletTemperatureC = options.coolingWaterInletTemperatureC ?? 30
  }
  if (typeof cloned.coolingWaterOutletTemperatureC !== 'number') {
    cloned.coolingWaterOutletTemperatureC = options.coolingWaterOutletTemperatureC ?? 38
  }
  if (typeof cloned.coolingWaterMassTh !== 'number') {
    cloned.coolingWaterMassTh = options.coolingWaterMassTh ?? 3000
  }
  cloned.coolingWaterHeatMJh = calculateCoolingWaterHeatMJh(
    cloned.coolingWaterMassTh,
    cloned.coolingWaterInletTemperatureC,
    cloned.coolingWaterOutletTemperatureC
  )
  cloned.coolingWaterRows = buildNormalizedCoolingWaterRows(
    cloned.coolingWaterMassTh,
    cloned.coolingWaterInletTemperatureC,
    cloned.coolingWaterOutletTemperatureC
  )
  cloned.heatLossMJh = 0
  cloned.furnaceWallTemperatureC = undefined
  cloned.otherHeatMJh = Math.max(0, cloned.otherHeatMJh ?? 500)
  cloned.heatBalanceTolerancePct = undefined
  cloned.balanceErrorWithinTolerance = undefined
  if (typeof cloned.fuelCombustionHeatMJh !== 'number') cloned.fuelCombustionHeatMJh = 0
  cloned.fuelCombustionHeatMJh = 0
  const chemicalIncomeMJh = Math.max(0, cloned.chemicalHeatMJh)
  const chemicalExpenditureMJh = Math.max(0, -cloned.chemicalHeatMJh)
  const baseIncomeMJh = cloned.inputPhysicalHeatMJh + chemicalIncomeMJh
  const baseExpenditureMJh =
    cloned.outputPhysicalHeatMJh +
    chemicalExpenditureMJh +
    cloned.coolingWaterHeatMJh +
    cloned.otherHeatMJh
  const normalizedHeatDeficitMJh = baseExpenditureMJh - baseIncomeMJh
  cloned.heatDeficitMJh = normalizedHeatDeficitMJh
  cloned.fuelHeatMJt = 0
  cloned.requiredFuelWeight = 0
  cloned.supplementalFuelHeatMJh = 0
  cloned.fuelEffectiveHeatMJh = 0
  cloned.balanceAfterFuelMJh = -normalizedHeatDeficitMJh
  if (cloned.balanceClosureMode == null || cloned.balanceClosureMode === 'none') {
    cloned.balanceClosureMode = 'none'
    cloned.balanceClosureHeatMJh = 0
  }
  cloned.supplementalFuelWeightTh = Math.max(0, cloned.supplementalFuelWeightTh ?? 0)
  cloned.closureIterations = Math.max(0, cloned.closureIterations ?? 0)
  const closureResidualMJh = cloned.closureResidualMJh
  cloned.closureResidualMJh = Number.isFinite(closureResidualMJh) ? closureResidualMJh! : cloned.balanceAfterFuelMJh
  cloned.closureStatus =
    cloned.closureStatus ??
    (normalizedHeatDeficitMJh > 1e-6 ? 'blocked' : normalizedHeatDeficitMJh < -1e-6 ? 'surplus' : 'balanced')
  cloned.inputPhysicalRows = cloned.inputPhysicalRows.filter((row) => !row.section.includes('冷却水'))
  cloned.heatIncomeRows = normalizeHeatFlowRows(cloned.heatIncomeRows, 'income', options).filter(
    (row) => !isSupplementalFuelHeatFlowRow(row)
  )
  cloned.heatIncomeRows = cloned.heatIncomeRows.map((row) =>
    row.type === 'chemical'
      ? { ...row, material: '化学反应热', heatMJh: chemicalIncomeMJh }
      : row
  )
  if (!cloned.heatIncomeRows.some((row) => row.type === 'chemical')) {
    cloned.heatIncomeRows.push({
      type: 'chemical',
      material: '化学反应热',
      temperature: 25,
      heatMJh: chemicalIncomeMJh,
      percent: 0,
    })
  }
  cloned.heatIncomeRows = normalizeHeatFlowPercents(cloned.heatIncomeRows)
  cloned.heatExpenditureRows = normalizeHeatFlowRows(cloned.heatExpenditureRows, 'expenditure', options).filter(
    (row) =>
      !isCoolingWaterHeatFlowRow(row) &&
      !isFurnaceHeatFlowRow(row) &&
      !isNaturalHeatFlowRow(row) &&
      !isBalanceErrorHeatFlowRow(row) &&
      !row.isSubtotal &&
      row.material !== '产物物理热合计' &&
      row.material !== '化学反应吸热' &&
      row.material !== '化学反应热（净吸热）'
  )
  const physicalEndIndex = cloned.heatExpenditureRows.findIndex((row) => row.type !== 'physical')
  const subtotalInsertIndex = physicalEndIndex === -1 ? cloned.heatExpenditureRows.length : physicalEndIndex
  cloned.heatExpenditureRows.splice(subtotalInsertIndex, 0, {
    type: 'physical',
    material: '产物物理热合计',
    temperature: null,
    heatMJh: cloned.outputPhysicalHeatMJh,
    isSubtotal: true,
    percent: 0,
  })
  if (chemicalExpenditureMJh > 1e-9) {
    cloned.heatExpenditureRows.push({
      type: 'chemical',
      material: '化学反应热（净吸热）',
      temperature: 25,
      heatMJh: chemicalExpenditureMJh,
      percent: 0,
    })
  }
  cloned.heatExpenditureRows.push({
    type: 'exchange',
    material: '冷却水',
    temperature: cloned.coolingWaterOutletTemperatureC,
    heatMJh: cloned.coolingWaterHeatMJh,
    percent: 0,
  })
  cloned.heatExpenditureRows.push({
    type: 'loss',
    material: '自然散热',
    temperature: null,
    heatMJh: cloned.otherHeatMJh,
    percent: 0,
  })
  cloned.balanceErrorMJh = cloned.balanceAfterFuelMJh
  cloned.heatExpenditureRows = normalizeHeatFlowPercents(cloned.heatExpenditureRows)
  return cloned
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
  const { concentrates } = partitionRawMixMaterials(rawMaterials)
  const validPhaseResults = concentrates
    .map((material) => phaseBatchResults?.[material.id])
    .filter((result): result is PhaseMaterialCalcResult => Boolean(result?.valid))
  if (validPhaseResults.length === 0) return undefined
  return {
    [PRODUCT_INPUT_PHASE_BLEND_NAME]: buildBlendPhaseMassFromMaterialResults(validPhaseResults, materialPhaseRows),
  }
}

function fuelColumnWithDryWeight(fuelColumn: CopperFuelMaterial, dryWeight: number): CopperFuelMaterial {
  const nextWeight = Math.max(0, dryWeight)
  const moisture = Math.max(0, fuelColumn.moisture ?? 0)
  return cloneFuelMaterial({
    ...fuelColumn,
    weight: nextWeight,
    waterWeight: nextWeight > 0 && moisture > 0 ? nextWeight * (moisture / 100) : 0,
    moisture,
  })
}

function productConstraintConfigWithFuelDryMass(
  config: OxySideBlowConstraintConfig,
  fuelDryWeightTh: number,
  concentrateMassTh: number
): OxySideBlowConstraintConfig {
  const next = cloneOxyConstraintConfig(config)
  if (concentrateMassTh <= 0) return next
  const target = Math.max(0, fuelDryWeightTh) / concentrateMassTh
  const index = next.customConstraints.findIndex((entry) => entry.expr === FUEL_CONCENTRATE_RATIO_EXPR)
  if (index >= 0) {
    next.customConstraints[index] = { ...next.customConstraints[index], target }
  } else {
    next.customConstraints.push({ expr: FUEL_CONCENTRATE_RATIO_EXPR, target })
  }
  return next
}

function productConstraintConfigWithoutFuelRatio(
  config: OxySideBlowConstraintConfig
): OxySideBlowConstraintConfig {
  const next = cloneOxyConstraintConfig(config)
  const normalizedFuelRatioExpr = FUEL_CONCENTRATE_RATIO_EXPR.replace(/\s+/g, '')
  next.customConstraints = next.customConstraints.filter(
    (entry) => entry.expr.replace(/\s+/g, '') !== normalizedFuelRatioExpr
  )
  return next
}

function heatBalanceFuelPhaseContents(
  fuelColumn: CopperFuelMaterial,
  manualPhaseRatioColumns: Record<string, boolean>,
  phaseRatioOverrides: Record<string, Record<string, string>>
) {
  const rows = createDefaultMaterialPhaseRowsForMaterial(fuelColumn)
  const manualOverrides = manualPhaseRatioColumns[fuelColumn.id]
    ? storedPhaseOverridesToMap(phaseRatioOverrides[fuelColumn.id])
    : null
  return manualOverrides ?? buildDefaultMaterialPhaseContentsByKey(fuelColumn.ratios, rows)
}

function heatFlowTotalMJh(rows: HeatFlowRow[]) {
  return sumHeatFlow(rows)
}

function heatBalanceClosureToleranceMJh(result: CopperHeatBalanceResult) {
  return Math.max(HEAT_BALANCE_MIN_RESIDUAL_TOLERANCE_MJH, heatFlowTotalMJh(result.heatExpenditureRows) * 0.00000001)
}

function heatBalanceFuelSearchResidualMJh(
  result: CopperHeatBalanceResult,
  options?: {
    chemicalHeatMode?: CopperChemicalHeatMode
    coolingWaterMassTh?: number
  }
) {
  if (
    (options?.chemicalHeatMode ?? result.chemicalHeatMode) === 'hess' &&
    typeof options?.coolingWaterMassTh === 'number'
  ) {
    return hessFuelSearchResidualMJh(result, {
      coolingWaterMassTh: options.coolingWaterMassTh,
    })
  }
  return fuelSearchResidualFromDeficitMJh(result.heatDeficitMJh)
}

// 产出方程组内已包含熔剂、气体和物相未知量；完成一次求解后不再以推荐值重复重算。
// Some coupled slag, oxygen, and solvent constraints need the recommended-input
// feedback loop to settle before the product equations become feasible.
const OXY_PRODUCT_SOLVER_MAX_PASSES = 4

function hasWarmStartProductInputs(params: {
  fuelColumn: CopperFuelMaterial
  solventColumns: CopperMaterialColumn[]
  airColumns: CopperMaterialColumn[]
  preserveFuelInputWeight?: boolean
}) {
  const fuelWarm =
    params.preserveFuelInputWeight
      ? params.fuelColumn.weight > 1e-9
      : params.fuelColumn.weight > 1e-9 || materialWaterWeight(params.fuelColumn) > 1e-9
  const solventWarm = params.solventColumns.some((column) => column.weight > 1e-9)
  const airWarm = params.airColumns.some((column) => column.weight > 1e-9)
  return fuelWarm || solventWarm || airWarm
}

async function runOxySideBlowProductPasses(params: {
  rawMaterials: CopperMaterialColumn[]
  rawFeed: ReturnType<typeof calculateWeightedComposition>
  concentrateMass: number
  preserveFuelInputWeight?: boolean
  manualInputWeights?: NonNullable<OxyConstraintBaseInput['manualInputWeights']>
  inputPhaseMass?: Record<string, Record<string, number>>
  fuelColumn: CopperFuelMaterial
  solventColumns: CopperMaterialColumn[]
  airColumns: CopperMaterialColumn[]
  config: OxySideBlowConstraintConfig
  shouldCancel?: () => boolean
  maxPasses: number
  seed?: OxySolverSeed | null
}): Promise<{
  result: OxyConstraintSolverResult
  passes: number
  fuelColumn: CopperFuelMaterial
  solventColumns: CopperMaterialColumn[]
  airColumns: CopperMaterialColumn[]
}> {
  let fuelColumn = cloneFuelMaterial(params.fuelColumn)
  let solventColumns = params.solventColumns.map((column) => cloneMaterialColumn(column))
  let airColumns = params.airColumns.map((column) => cloneMaterialColumn(column))
  let best: OxyConstraintSolverResult | null = null
  let bestInputs = { fuelColumn, solventColumns, airColumns }
  let passes = 0
  let seed = params.seed ?? null

  const acceptanceRank = (result: OxyConstraintSolverResult) =>
    result.acceptanceLevel === 'strict' ? 0 : result.acceptanceLevel === 'relaxed' ? 1 : 2
  const isBetterResult = (candidate: OxyConstraintSolverResult, current: OxyConstraintSolverResult | null) => {
    if (!current) return true
    const candidateRank = acceptanceRank(candidate)
    const currentRank = acceptanceRank(current)
    if (candidateRank !== currentRank) return candidateRank < currentRank
    return candidate.maxRelativeResidual < current.maxRelativeResidual
  }

  for (let pass = 0; pass < params.maxPasses; pass += 1) {
    if (params.shouldCancel?.()) throw new OxyConstraintCalculationCancelledError()
    passes = pass + 1
    const producingInputs = { fuelColumn, solventColumns, airColumns }
    const blendFeed = calculateWeightedComposition([
      ...params.rawMaterials,
      ...solventColumns,
      fuelColumn,
      ...airColumns,
    ])
    const result = await solveOxySideBlowProducts({
      blendFeed,
      rawFeed: params.rawFeed,
      rawMaterialColumns: params.rawMaterials,
      concentrateMass: params.concentrateMass,
      preserveFuelInputWeight: params.preserveFuelInputWeight,
      manualInputWeights: params.manualInputWeights,
      inputPhaseMass: params.inputPhaseMass,
      fuelColumn,
      solventColumns,
      airColumns,
      config: params.config,
      shouldCancel: params.shouldCancel,
      seed,
    })
    if (params.shouldCancel?.()) throw new OxyConstraintCalculationCancelledError()
    const nextInputs = resolveOxySolverRecommendedInputs({ result, fuelColumn, solventColumns, airColumns })

    if (isBetterResult(result, best)) {
      best = result
      // 必须保存“产生该结果”的输入；若存 nextInputs，失败回写会污染下一轮起点。
      bestInputs = producingInputs
    }
    fuelColumn = nextInputs.fuelColumn
    solventColumns = nextInputs.solventColumns
    airColumns = nextInputs.airColumns
    if (result.acceptable) {
      seed = oxySolverResultToSeed(result)
    }

    if (result.acceptanceLevel === 'strict') break
    // 近似收敛（relaxed）不提前结束：继续多轮并用回填煤/气再打磨，直到严格收敛或达 maxPasses
  }

  if (!best) {
    throw new Error('产出求解未生成结果')
  }
  const displayInputs = best.acceptable
    ? resolveOxySolverRecommendedInputs({ result: best, ...bestInputs })
    : bestInputs
  return { result: best, passes, ...displayInputs }
}

async function solveOxySideBlowProductsIterative(params: {
  rawMaterials: CopperMaterialColumn[]
  rawFeed: ReturnType<typeof calculateWeightedComposition>
  concentrateMass: number
  preserveFuelInputWeight?: boolean
  manualInputWeights?: NonNullable<OxyConstraintBaseInput['manualInputWeights']>
  inputPhaseMass?: Record<string, Record<string, number>>
  fuelColumn: CopperFuelMaterial
  solventColumns: CopperMaterialColumn[]
  airColumns: CopperMaterialColumn[]
  config: OxySideBlowConstraintConfig
  shouldCancel?: () => boolean
  maxPasses?: number
  seed?: OxySolverSeed | null
}): Promise<{
  result: OxyConstraintSolverResult
  passes: number
  fuelColumn: CopperFuelMaterial
  solventColumns: CopperMaterialColumn[]
  airColumns: CopperMaterialColumn[]
}> {
  // Legacy cases may store dry air with zero moisture. Always normalize the
  // process gas before solving so the H2O balance uses standard wet air.
  const solverAirColumns = normalizeProcessAirColumns(params.airColumns, undefined, {
    includeSecondaryAir: params.airColumns.some((column) => column.airRole === 'secondary'),
  })
  const maxPasses = Math.max(1, Math.min(OXY_PRODUCT_SOLVER_MAX_PASSES, params.maxPasses ?? OXY_PRODUCT_SOLVER_MAX_PASSES))
  const shared = {
    rawMaterials: params.rawMaterials,
    rawFeed: params.rawFeed,
    concentrateMass: params.concentrateMass,
    inputPhaseMass: params.inputPhaseMass,
    manualInputWeights: params.manualInputWeights,
    config: params.config,
    shouldCancel: params.shouldCancel,
    maxPasses,
    seed: params.seed ?? null,
  }
  const acceptanceRank = (result: OxyConstraintSolverResult) =>
    result.acceptanceLevel === 'strict' ? 0 : result.acceptanceLevel === 'relaxed' ? 1 : 2
  const pickBetter = (
    a: Awaited<ReturnType<typeof runOxySideBlowProductPasses>>,
    b: Awaited<ReturnType<typeof runOxySideBlowProductPasses>>
  ) => {
    const rankA = acceptanceRank(a.result)
    const rankB = acceptanceRank(b.result)
    if (rankA !== rankB) return rankA < rankB ? a : b
    return a.result.maxRelativeResidual <= b.result.maxRelativeResidual ? a : b
  }

  // 热启动必须「煤量 + 气量」成套保留。熔炼默认按煤/精矿比重派生煤量，若仍沿用上次回填的高气量，
  // 入炉 O 偏多而烟气残氧又被硬封顶，就会把「元素守恒：O」相对偏差顶到不可接受（如 ~7%）。
  // 有上次产物物相 seed 时先尝试复核短路；复核失败后牛顿不再带坏种子（见 solveOxySideBlowProducts）。
  let warmAttempt: Awaited<ReturnType<typeof runOxySideBlowProductPasses>> | null = null
  if (hasWarmStartProductInputs({ ...params, airColumns: solverAirColumns }) || params.seed) {
    const hasUiFuel = params.fuelColumn.weight > 1e-9
    const hasUiAir = params.airColumns.some((column) => column.weight > 1e-9)
    const warmPreserveFuel =
      Boolean(params.preserveFuelInputWeight) || (hasUiFuel && hasUiAir) || Boolean(params.seed)
    warmAttempt = await runOxySideBlowProductPasses({
      ...shared,
      preserveFuelInputWeight: warmPreserveFuel,
      fuelColumn: params.fuelColumn,
      solventColumns: params.solventColumns,
      airColumns: solverAirColumns,
    })
    if (warmAttempt.result.acceptable) return warmAttempt
  }

  const coldInputs = resolveOxySolverColdStartInputs({
    fuelColumn: params.fuelColumn,
    solventColumns: params.solventColumns,
    airColumns: solverAirColumns,
    preserveFuelInputWeight: params.preserveFuelInputWeight,
    manualInputWeights: params.manualInputWeights,
  })
  const coldAttempt = await runOxySideBlowProductPasses({
    ...shared,
    seed: null,
    preserveFuelInputWeight: params.preserveFuelInputWeight,
    fuelColumn: coldInputs.fuelColumn,
    solventColumns: coldInputs.solventColumns,
    airColumns: coldInputs.airColumns,
  })
  if (!warmAttempt || coldAttempt.result.acceptable) return coldAttempt
  return pickBetter(warmAttempt, coldAttempt)
}

function restoreProductCalculationFromCaseState(params: {
  rawMaterials: CopperMaterialColumn[]
  solventColumns: CopperMaterialColumn[]
  fuelColumn: CopperFuelMaterial
  airColumns: CopperMaterialColumn[]
  manualInputWeights?: NonNullable<OxyConstraintBaseInput['manualInputWeights']>
  phaseBatchResults: PhaseBatchResults | null | undefined
  materialPhaseRows: Record<string, MaterialPhaseAssistRow[]>
  productConstraintConfig: OxySideBlowConstraintConfig
}): Promise<
  | {
      result: OxyConstraintSolverResult
      fuelColumn: CopperFuelMaterial
      solventColumns: CopperMaterialColumn[]
      airColumns: CopperMaterialColumn[]
    }
  | null
> {
  if (
    calculateWeightedComposition([
      ...params.rawMaterials,
      ...params.solventColumns,
      params.fuelColumn,
      ...params.airColumns,
    ]).totalWeight <= 0
  ) return Promise.resolve(null)
  return (async () => {
    try {
      const restored = await solveOxySideBlowProductsIterative({
      rawMaterials: params.rawMaterials,
      rawFeed: calculateWeightedComposition(params.rawMaterials),
      concentrateMass: partitionRawMixMaterials(params.rawMaterials).concentrates.reduce(
        (sum, material) => sum + Math.max(0, material.weight),
        0
      ),
      inputPhaseMass: buildProductSolverInputPhaseMass(
        params.rawMaterials,
        params.phaseBatchResults,
        params.materialPhaseRows
      ),
      manualInputWeights: params.manualInputWeights,
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
  })()
}





function sanitizeCaseFileName(value: string) {
  return value.trim().replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, '_') || '铜冶炼案例'
}

const COPPER_CASE_FILE_EXT = '.metcal'

function isCopperCaseFileName(fileName: string) {
  return fileName.trim().toLowerCase().endsWith(COPPER_CASE_FILE_EXT)
}

function isMetcalFloFileName(fileName: string) {
  return fileName.trim().toLowerCase().endsWith('.flo')
}

function isWorkspaceImportFileName(fileName: string) {
  return isCopperCaseFileName(fileName) || isMetcalFloFileName(fileName)
}

function buildCopperCaseFileName(record: CopperCaseRecord) {
  return `${sanitizeCaseFileName(record.name)}${COPPER_CASE_FILE_EXT}`
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
    processParameters:
      candidate.processParameters ??
      processParametersFromLegacyCase(candidate.targetFeSiO2, candidate.targetCaOSiO2, candidate.productConstraintConfig),
    processParametersConfirmed: candidate.processParametersConfirmed ?? false,
    constraintEditorReached: candidate.constraintEditorReached ?? false,
    solventSolution: cloneSolventSolution(candidate.solventSolution ?? null),
    phaseCompletedMaterials: candidate.phaseCompletedMaterials ?? {},
    phasePreviewUnknowns: candidate.phasePreviewUnknowns ?? null,
    phaseBatchResults: candidate.phaseBatchResults ?? null,
    manualPhaseCells: candidate.manualPhaseCells ?? {},
    manualSolventWeights: candidate.manualSolventWeights ?? {},
    manualFuelWeightValid: candidate.manualFuelWeightValid ?? false,
    manualAirWeights: candidate.manualAirWeights ?? {},
    manualAirWeightValid: candidate.manualAirWeightValid ?? false,
    phaseCompleted: candidate.phaseCompleted ?? false,
    productCalculated: candidate.productCalculated ?? false,
    productFilledBack: candidate.productFilledBack ?? candidate.productCalculated ?? false,
    productSolverResult: normalizeOxySolverResult(candidate.productSolverResult),
    metcalProductResult: normalizeOxySolverResult(candidate.metcalProductResult),
    heatBalanced: candidate.heatBalanced ?? false,
    calculatedHeatBalance: normalizeHeatBalanceResult(candidate.calculatedHeatBalance, {
      coolingWaterInletTemperatureC: toNumber(candidate.coolingWaterInletTemperature ?? '30', 30),
      coolingWaterOutletTemperatureC: toNumber(candidate.coolingWaterOutletTemperature ?? '38', 38),
      coolingWaterMassTh: toNumber(candidate.coolingWaterMassTh ?? '3000', 3000),
    }),
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
    coolingWaterInletTemperature: candidate.coolingWaterInletTemperature ?? '30',
    coolingWaterOutletTemperature: candidate.coolingWaterOutletTemperature ?? '38',
    coolingWaterMassTh: candidate.coolingWaterMassTh ?? '3000',
    coolingWaterHeatMJh: candidate.coolingWaterHeatMJh ?? '0',
    furnaceWallTemperature: undefined,
    heatLossMJh: '0',
    otherHeatMJh: candidate.otherHeatMJh ? normalizeOtherHeatMJhText(candidate.otherHeatMJh) : DEFAULT_OTHER_HEAT_MJH_TEXT,
    heatBalanceFilledBack: candidate.heatBalanceFilledBack ?? false,
    annualHours: candidate.annualHours ?? '7200',
    equipmentIntensity: candidate.equipmentIntensity ?? '32',
    targetScaleWanTpa: candidate.targetScaleWanTpa ?? '10',
    equipmentAdjustments: candidate.equipmentAdjustments ?? { smelting: '1', converting: '1', refining: '1' },
    equipmentDimensionAdjustments: candidate.equipmentDimensionAdjustments ?? { smelting: '1', converting: '1', refining: '1' },
    equipmentModelGenerated: candidate.equipmentModelGenerated ?? { smelting: false, converting: false, refining: false },
    equipmentBomGenerated: candidate.equipmentBomGenerated ?? { smelting: false, converting: false, refining: false },
    smeltingDailyFeedTd: candidate.smeltingDailyFeedTd,
    smeltingFeedMode: candidate.smeltingFeedMode === 'annual' ? 'annual' : 'daily',
    smeltingAnnualFeedTa: candidate.smeltingAnnualFeedTa,
    smeltingProcessDays: candidate.smeltingProcessDays ?? String(DEFAULT_SMELTING_PROCESS_DAYS),
    smeltingBedCapacity: candidate.smeltingBedCapacity ?? '',
    smeltingFurnaceWidthM: candidate.smeltingFurnaceWidthM ?? String(DEFAULT_SMELTING_FURNACE_WIDTH_M),
    smeltingFurnaceLengthM: candidate.smeltingFurnaceLengthM,
    smeltingDimensionDrive: candidate.smeltingDimensionDrive === 'length' ? 'length' : 'width',
    smeltingJacketPitchMm: candidate.smeltingJacketPitchMm ?? String(DEFAULT_SMELTING_JACKET_PITCH_MM),
    smeltingJacketCountTotal:
      candidate.smeltingJacketCountTotal ??
      (candidate.smeltingJacketCountOneSide
        ? String(Math.max(1, Math.round(toNumber(candidate.smeltingJacketCountOneSide, 0) * 2)))
        : undefined),
    smeltingJacketCountOneSide:
      candidate.smeltingJacketCountOneSide ??
      (candidate.smeltingJacketCountTotal
        ? String(Math.max(0, Math.round(toNumber(candidate.smeltingJacketCountTotal, 0) / 2)))
        : undefined),
    smeltingOxygenNm3h: candidate.smeltingOxygenNm3h,
    smeltingTuyereOxygenNm3h: candidate.smeltingTuyereOxygenNm3h ?? String(DEFAULT_SMELTING_TUYERE_OXYGEN_NM3H),
    smeltingTuyereCount: candidate.smeltingTuyereCount,
    smeltingSlagDensityTm3: candidate.smeltingSlagDensityTm3 ?? String(DEFAULT_SMELTING_SLAG_DENSITY_TM3),
    smeltingMatteDensityTm3: candidate.smeltingMatteDensityTm3 ?? String(DEFAULT_SMELTING_MATTE_DENSITY_TM3),
    smeltingDailyFeedOverridden: candidate.smeltingDailyFeedOverridden ?? false,
    smeltingAnnualFeedOverridden: candidate.smeltingAnnualFeedOverridden ?? false,
    smeltingOxygenOverridden: candidate.smeltingOxygenOverridden ?? false,
    smeltingJacketRemainderDecision:
      candidate.smeltingJacketRemainderDecision === 'extend' || candidate.smeltingJacketRemainderDecision === 'trim'
        ? candidate.smeltingJacketRemainderDecision
        : null,
    smeltingTuyereCountOverridden: candidate.smeltingTuyereCountOverridden ?? false,
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
    processStages: resolveCaseProcessStages(candidate),
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

function normalizeOtherHeatMJhText(value: string | undefined | null) {
  const trimmed = (value ?? '').trim()
  return trimmed && isValidNumberText(trimmed) ? trimmed : DEFAULT_OTHER_HEAT_MJH_TEXT
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

function productSolverConflictRows(result: OxyConstraintSolverResult | null | undefined) {
  if (!result || result.acceptable) return []
  return result.constraintResiduals
    .filter((row) => !row.soft && Number.isFinite(row.relativeResidual) && row.relativeResidual > 0.005)
    .sort((a, b) => b.relativeResidual - a.relativeResidual)
    .slice(0, 5)
}

function productSolverConflictSummary(
  result: OxyConstraintSolverResult | null | undefined,
  options?: { keptPreviousFillBack?: boolean }
) {
  const rows = productSolverConflictRows(result)
  if (!result || rows.length === 0) {
    return result?.message ?? '产出约束未完全满足，请检查关键参数、元素约束和自定义约束。'
  }
  const note = formatConstraintConflictNote(rows, { limit: 5, heading: '主要冲突' })
  if (options?.keptPreviousFillBack) {
    return `已保留上次可回填结果。\n${note}`
  }
  return `本次未得到可回填结果。\n${note}`
}

function heatBalanceClosureNeedsDiagnostics(
  closureStatus: CopperHeatBalanceResult['closureStatus'] | undefined
) {
  return closureStatus === 'blocked' || closureStatus === 'max-iterations'
}

function heatBalanceConstraintDiagnosticRows(result: OxyConstraintSolverResult | null | undefined) {
  if (!result) return []
  return result.constraintResiduals
    .filter(
      (row) =>
        !row.soft && Number.isFinite(row.relativeResidual) && row.relativeResidual > OXY_STRICT_RELATIVE_RESIDUAL
    )
    .sort((a, b) => b.relativeResidual - a.relativeResidual)
    .slice(0, 5)
}

function heatBalanceClosureStatusMessage(heatBalance: CopperHeatBalanceResult) {
  if (heatBalance.closureBlockedReason) {
    return heatBalance.closureBlockedReason
  }
  if (heatBalance.closureStatus === 'blocked') {
    const fuelHeatHint =
      typeof heatBalance.fuelEffectiveHeatMJt === 'number' && heatBalance.fuelEffectiveHeatMJt > 0
        ? `估算每吨煤净热贡献约 ${format(heatBalance.fuelEffectiveHeatMJt)} MJ/t（未计入加煤后二次风与排烟热增加）。`
        : ''
    return `煤量闭合未完成，已回填当前最佳结果。${fuelHeatHint}请检查供氧、煤 C%/物相 C、冷却水量或产出约束。`
  }
  if (heatBalance.closureStatus === 'max-iterations') {
    return `煤量闭合未完全收敛（热差 ${format(heatBalance.balanceAfterFuelMJh)} MJ/h）；已回填当前最佳结果。`
  }
  return ''
}

function heatBalanceClosureStatusLabel(
  heatBalance: CopperHeatBalanceResult | null | undefined,
  heatBalanced: boolean
) {
  if (!heatBalance) return '待计算'
  if (heatBalanced) {
    return heatBalance.closureStatus === 'surplus' ? '已完成（盈余）' : '已完成'
  }
  if (heatBalance.closureStatus === 'blocked') return '未闭合（已阻断）'
  if (heatBalance.closureStatus === 'max-iterations') return '未完全收敛'
  if (heatBalance.closureStatus === 'not-needed') return '无需加煤'
  return '待计算'
}

function renderHeatBalanceDiagnosticsPanel(params: {
  darkMode: boolean
  heatBalance: CopperHeatBalanceResult
  solverResult?: OxyConstraintSolverResult | null
}) {
  const { darkMode, heatBalance, solverResult } = params
  const needsClosureAlert = heatBalanceClosureNeedsDiagnostics(heatBalance.closureStatus)
  const diagnosticSolver = solverResult ?? heatBalance.finalProductResult ?? null
  const conflictRows = heatBalanceConstraintDiagnosticRows(diagnosticSolver)
  const showConstraintPanel = needsClosureAlert && Boolean(diagnosticSolver) && !diagnosticSolver!.acceptable

  if (!needsClosureAlert && !showConstraintPanel) return null

  return (
    <div className="space-y-3">
      {needsClosureAlert && (
        <div className={assistAlertPanelClassName(darkMode, 'warning')} role="alert">
          <div className="font-semibold">热平衡煤量闭合未完成</div>
          <div className="mt-1 leading-relaxed">{heatBalanceClosureStatusMessage(heatBalance)}</div>
          {typeof heatBalance.heatDeficitWithoutFuelMJh === 'number' && heatBalance.heatDeficitWithoutFuelMJh > 0 && (
            <div className="mt-1 leading-relaxed">
              基础煤工况热缺口 {format(heatBalance.heatDeficitWithoutFuelMJh)} MJ/h
              {typeof heatBalance.fuelEffectiveHeatMJt === 'number' && heatBalance.fuelEffectiveHeatMJt > 0
                ? `；按单吨煤放热估算需补约 ${format(
                    heatBalance.heatDeficitWithoutFuelMJh / heatBalance.fuelEffectiveHeatMJt
                  )} t/h（未含联动排烟热）。`
                : '。'}
            </div>
          )}
        </div>
      )}
      {showConstraintPanel && (
        <div className={productConflictPanelClassName(darkMode)} role="alert">
          <div className="font-semibold">产出约束诊断</div>
          <div className="mt-1 whitespace-pre-line leading-relaxed">
            {productSolverConflictSummary(diagnosticSolver) ||
              '请检查关键参数、元素约束和自定义约束。'}
          </div>
          {conflictRows.length > 0 && (
            <ul className="mt-2 space-y-1 leading-relaxed">
              {conflictRows.map((row, index) => (
                <li key={`${row.kind}-${row.expr}-${index}`}>
                  {index + 1}. {formatConstraintConflictLine(row)}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

type CalculationCancelToken = { cancelled: boolean }

function isCalculationTokenCancelled(token: CalculationCancelToken | null | undefined) {
  return Boolean(token?.cancelled)
}

function throwIfCalculationCancelled(token: CalculationCancelToken | null | undefined) {
  if (isCalculationTokenCancelled(token)) throw new OxyConstraintCalculationCancelledError()
}

const HEAT_BALANCE_LINKED_PRODUCT_TIMEOUT_MS = 120_000

class HeatBalanceEvaluationTimeoutError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'HeatBalanceEvaluationTimeoutError'
  }
}

function isHeatBalanceEvaluationTimeout(error: unknown): error is HeatBalanceEvaluationTimeoutError {
  return error instanceof HeatBalanceEvaluationTimeoutError
}

async function withLinkedProductTimeout<T>(
  promise: Promise<T>,
  timeoutMessage: string,
  shouldCancel: () => boolean
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new HeatBalanceEvaluationTimeoutError(timeoutMessage))
    }, HEAT_BALANCE_LINKED_PRODUCT_TIMEOUT_MS)
    void promise.then(
      (value) => {
        window.clearTimeout(timer)
        if (shouldCancel()) reject(new OxyConstraintCalculationCancelledError())
        else resolve(value)
      },
      (error) => {
        window.clearTimeout(timer)
        reject(error)
      }
    )
  })
}

function heatBalanceClosureFuelLimit(params: {
  estimatedFuelWeightTh: number
  ratioReferenceFuelWeightTh: number
  concentrateMassTh: number
}) {
  const estimatedLimit = Math.max(0, params.estimatedFuelWeightTh) * HEAT_BALANCE_CLOSURE_MAX_FUEL_MULTIPLE
  const ratioLimit =
    params.ratioReferenceFuelWeightTh > 0
      ? params.ratioReferenceFuelWeightTh * HEAT_BALANCE_CLOSURE_MAX_FUEL_MULTIPLE
      : 0
  const feedLimit = Math.max(0, params.concentrateMassTh) * HEAT_BALANCE_CLOSURE_MAX_FUEL_RATIO
  return Math.max(1, estimatedLimit, ratioLimit, feedLimit)
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

function defaultLibraryCategoryForStage(stageId: CopperProcessStageId): CopperLibraryCategory {
  return stageId === 'cu_converting' ? 'return' : 'concentrate'
}

function resolveLibraryRowCategory(
  category: CopperLibraryCategory | '',
  fallback: CopperLibraryCategory
): CopperLibraryCategory {
  return category || fallback
}

function createSingleLibraryRow(suffix = 0): SingleLibraryRow {
  const timestamp = Date.now()
  return {
    id: `library-row-${timestamp}-${suffix}`,
    name: '',
    category: '',
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
  return `${inputSm(dark)} h-8 w-full px-1 py-0 text-center font-mono text-sm ${stateClass}`
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

const WORKFLOW_FLOW_STEPS = ['原料', '原料投料量', '投入物相', '关键参数输入', '产出约束', '产出计算', '热平衡'] as const
/** 吹炼跳过关键参数输入，物相完成后直接进入产出约束 */
const CONVERTING_WORKFLOW_FLOW_STEPS = ['原料库', '投料(物相表)', '产出约束', '产出计算', '热平衡'] as const
const PRODUCT_CALCULATION_STEPS = ['读取产出约束', '列举方程', '求解产物', '回填产出结果'] as const
const PHASE_CALCULATION_STEPS = ['读取物相参数', '计算物相', '回填物相结果'] as const
const heatBalanceCalculationSteps = (chemicalHeatMode: CopperChemicalHeatMode) => [
  '读取热平衡参数',
  `计算热收入（${chemicalHeatMode === 'reaction' ? '化学反应' : 'Hess'}）`,
  '计算热支出',
  '汇总热收入与热支出',
  '闭合热平衡',
  '回填热平衡结果',
] as const
type WorkflowStepStatus = 'completed' | 'active' | 'pending'

function workflowStepMessage(step: number, message: string, sectionLabel?: string) {
  const label = sectionLabel ?? WORKFLOW_FLOW_STEPS[step - 1] ?? '流程'
  return `${label}：${message}`
}

function workflowFlowStepLabels(stageId: 'cu_smelting' | 'cu_converting' | 'cu_refining') {
  return stageId === 'cu_converting' ? CONVERTING_WORKFLOW_FLOW_STEPS : WORKFLOW_FLOW_STEPS
}

function WorkflowFlowStrip({
  darkMode,
  steps,
  onStepClick,
}: {
  darkMode: boolean
  steps: { label: string; status: WorkflowStepStatus }[]
  onStepClick?: (index: number) => void
}) {
  return (
    <div className={`rounded-md border px-4 py-3 ${darkMode ? 'border-gray-600 bg-gray-800/25' : 'border-gray-200 bg-white'}`}>
      <div className={`text-sm font-medium leading-relaxed ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
        计算流程
        {onStepClick && (
          <span className={`ml-2 text-xs font-normal ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
            点击步骤可跳转
          </span>
        )}
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
          const interactiveClass = onStepClick
            ? 'cursor-pointer transition hover:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-500'
            : ''
          const stepContent = (
            <>
              {step.label}
              {statusSuffix}
            </>
          )
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
              {onStepClick ? (
                <button
                  type="button"
                  className={`flex flex-1 items-center justify-center whitespace-nowrap rounded-md px-2 py-1.5 text-center text-sm leading-snug ${badgeClass} ${interactiveClass}`}
                  title={`跳转到${step.label}`}
                  onClick={() => onStepClick(index)}
                >
                  {stepContent}
                </button>
              ) : (
                <span
                  className={`flex flex-1 items-center justify-center whitespace-nowrap rounded-md px-2 py-1.5 text-center text-sm leading-snug ${badgeClass}`}
                >
                  {stepContent}
                </span>
              )}
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
  detail,
  steps,
  currentStep = 0,
  onCancel,
  cancelling = false,
}: {
  darkMode: boolean
  title?: string
  description?: string
  detail?: string
  steps?: string[]
  currentStep?: number
  onCancel?: () => void
  cancelling?: boolean
}) {
  const activeStepIndex =
    steps && steps.length > 0 ? Math.min(Math.max(currentStep, 0), steps.length - 1) : 0
  const activeDescription = cancelling
    ? '正在中断…'
    : steps && steps.length > 0
      ? steps[activeStepIndex] ?? description
      : description
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 px-4" role="status" aria-live="polite">
      <div className={`relative w-full max-w-lg rounded-lg border px-5 py-4 shadow-xl ${darkMode ? 'border-blue-700 bg-gray-900 text-blue-100' : 'border-blue-200 bg-white text-blue-900'}`}>
        {onCancel && (
          <button
            type="button"
            className={`absolute right-3 top-3 flex h-8 items-center gap-1 rounded-md px-2 text-xs font-medium transition-colors ${
              cancelling
                ? darkMode
                  ? 'cursor-not-allowed text-red-300/60'
                  : 'cursor-not-allowed text-red-400/60'
                : darkMode
                  ? 'text-red-100 hover:bg-red-950/40'
                  : 'text-red-700 hover:bg-red-50'
            }`}
            onClick={onCancel}
            disabled={cancelling}
            aria-label="中断计算"
            title="中断计算"
          >
            <span>{cancelling ? '中断中' : '中断'}</span>
            {!cancelling ? <span className="text-base leading-none" aria-hidden="true">×</span> : null}
          </button>
        )}
        <div className="flex items-start gap-3">
          <span className="mt-0.5 h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">{cancelling ? '正在中断…' : title}</div>
            <div className={`mt-1 text-xs ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>{activeDescription}</div>
            {detail && (
              <div className={`mt-1 text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{detail}</div>
            )}
            {steps && steps.length > 1 && (
              <div className={`mt-3 grid gap-1.5 ${steps.length === 5 ? 'grid-cols-1 sm:grid-cols-6' : steps.length === 4 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 sm:grid-cols-3'}`}>
                {steps.map((label, index) => (
                  <span
                    key={label}
                    className={`${steps.length === 5 ? `sm:col-span-2${index === 3 ? ' sm:col-start-2' : ''}` : ''} min-w-0 rounded-full px-2 py-0.5 text-center text-[11px] font-medium ${
                      index <= activeStepIndex
                        ? darkMode
                          ? 'bg-blue-800 text-blue-100'
                          : 'bg-blue-100 text-blue-800'
                        : darkMode
                          ? 'bg-gray-800 text-gray-500'
                          : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {label}
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

function parseWorkflowMessage(message: string): { title: string; body: string } {
  const colonIndex = message.indexOf('：')
  if (colonIndex > 0 && colonIndex < 24) {
    return {
      title: message.slice(0, colonIndex),
      body: message.slice(colonIndex + 1),
    }
  }
  return { title: '', body: message }
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
  const parsed = parseWorkflowMessage(message)
  const title = parsed.title || workflowToastTitle(tone)
  return (
    <div className="fixed right-4 top-4 z-[60] w-[min(28rem,calc(100vw-2rem))]" role="alert" aria-live="assertive">
      <div className={`rounded-lg border px-4 py-3 pr-10 text-sm shadow-xl ${workflowToastStyles(darkMode, tone)}`}>
        <div className="font-semibold">{title}</div>
        <div className="mt-1 whitespace-pre-line leading-relaxed">{parsed.body}</div>
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
  return `h-8 w-full whitespace-nowrap rounded border px-2 text-center text-[13px] leading-normal ${
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

export default function SmeltingBatchCalcPage({
  darkMode,
  language = 'zh',
  activeSheet,
  onStageSelect,
  smeltMethodId,
  smeltMethodName,
  caseTitleDraft,
  onActiveCaseNameChange,
  forcedPageKind,
}: SmeltingBatchCalcPageProps) {
  const isEn = language === 'en'

  /** 本页锁定工序，禁止与另一工序 UI/约束混用 */
  const pageLockedProcessStageId = 'cu_smelting' as CopperProcessStageId
  const normalizedSmeltMethodId = normalizeCopperSmeltMethodId(smeltMethodId)
  const [initialActiveCaseRecord] = useState<CopperCaseRecord | null>(() => {
    const activeId = getActiveCopperCaseId()
    if (!activeId) return null
    return (
      readCopperCaseRecords().find(
        (record) =>
          record.id === activeId &&
          normalizeCopperSmeltMethodId(record.smeltMethodId) === normalizedSmeltMethodId
      ) ?? null
    )
  })
  const [rawMaterials, setRawMaterials] = useState<CopperMaterialColumn[]>(() => createDefaultCopperMaterials())
  const [rawWeightDrafts, setRawWeightDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(createDefaultCopperMaterials().map((material) => [material.id, '']))
  )
  const [waterWeightDrafts, setWaterWeightDrafts] = useState<Record<string, string>>({})
  const [solventColumns, setSolventColumns] = useState<CopperMaterialColumn[]>(() => createDefaultSolventColumns())
  const [materialLibrary, setMaterialLibrary] = useState<CopperLibraryMaterial[]>(() => createSmeltingMaterialLibrary())
  const [libraryCategoryGroup, setLibraryCategoryGroup] = useState<'all' | 'raw' | 'flux'>('all')
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
  const [manualAirWeights, setManualAirWeights] = useState<Record<string, boolean>>({})
  const [ratioDrafts, setRatioDrafts] = useState<Record<string, string>>({})
  const [phaseCompleted, setPhaseCompleted] = useState(false)
  const [showElementAssist, setShowElementAssist] = useState(false)
  const [showProductCalculationAssist, setShowProductCalculationAssist] = useState(false)
  const [showHeatBalanceAssist, setShowHeatBalanceAssist] = useState(false)
  const [phaseBlendExpandToken, setPhaseBlendExpandToken] = useState(0)

  useEffect(() => {
    setRawMaterials((prev) => {
      const next = prev.map(normalizeKnownCopperRawMaterialAssay)
      const changed = next.some((material, index) => JSON.stringify(material.ratios) !== JSON.stringify(prev[index]?.ratios ?? {}))
      return changed ? next : prev
    })
  }, [])
  const [showBatchExportDialog, setShowBatchExportDialog] = useState(false)
  const [floImportPreview, setFloImportPreview] = useState<{
    bundle: MetcalFloImportBundle
    fileName: string
  } | null>(null)
  const [isFloImportReading, setIsFloImportReading] = useState(false)
  const [floImportReadingStep, setFloImportReadingStep] = useState(0)
  const [floImportReadingFileName, setFloImportReadingFileName] = useState('')

  const [elementTableView, setElementTableView] = useState<CopperElementDisplayMode>('compound')
  const [phaseElementView, setPhaseElementView] = useState<CopperElementDisplayMode>('compound')
  const [productElementTableView, setProductElementTableView] = useState<CopperElementDisplayMode>('compound')
  const [libraryElementTableView, setLibraryElementTableView] = useState<CopperElementDisplayMode>('compound')
  const [productCalculated, setProductCalculated] = useState(false)
  const [productFilledBack, setProductFilledBack] = useState(false)
  const [oxySolverResult, setOxySolverResult] = useState<OxyConstraintSolverResult | null>(null)
  // Keep the latest rejected settlement separate from the last accepted fill-back.
  // The output tables must not be overwritten by a failed verification, but its
  // residuals still need to remain visible for the user to correct the constraints.
  const [productCalculationFailure, setProductCalculationFailure] = useState<OxyConstraintSolverResult | null>(null)
  const [productCalculationError, setProductCalculationError] = useState<string | null>(null)
  const [metcalProductResult, setMetcalProductResult] = useState<OxyConstraintSolverResult | null>(null)
  const [showMetcalCalcResults, setShowMetcalCalcResults] = useState(false)
  const [isProductCalculating, setIsProductCalculating] = useState(false)
  const [productCalculationStep, setProductCalculationStep] = useState(0)
  const [productCalculationDetail, setProductCalculationDetail] = useState('')
  const [isProductCalculatingCancelling, setIsProductCalculatingCancelling] = useState(false)
  const productCalculationDetailRef = useRef('')
  const productCalculationCancelRef = useRef<CalculationCancelToken | null>(null)
  const hasStoredProductResult = Boolean(oxySolverResult?.acceptable)
  const showProductSolverTable = productFilledBack || hasStoredProductResult
  const canShowMetcalComparison = hasStoredProductResult && Boolean(metcalProductResult)
  // 计算成功应一次性置为已回填；纠正「可接受结果 + 已计算 + 未回填」脏状态
  useEffect(() => {
    if (isProductCalculating) return
    if (!productCalculated || productFilledBack) return
    if (!oxySolverResult?.acceptable) return
    setProductFilledBack(true)
  }, [isProductCalculating, oxySolverResult?.acceptable, productCalculated, productFilledBack])

  const [workflowMessage, setWorkflowMessageState] = useState<WorkflowMessageState>(null)
  const setWorkflowMessage = useCallback((text: string | null, tone: WorkflowMessageTone = 'flow') => {
    if (text === null) {
      setWorkflowMessageState(null)
      return
    }
    setWorkflowMessageState({ text, tone })
  }, [])

  const requestProductCalculationCancel = useCallback(() => {
    if (productCalculationCancelRef.current) productCalculationCancelRef.current.cancelled = true
    setIsProductCalculatingCancelling(true)
    setProductCalculationDetail('正在中断…')
    const detail = productCalculationDetailRef.current
    setWorkflowMessage(
      workflowStepMessage(
        6,
        detail
          ? `正在中断产出计算（${detail}），已保留上次产出结果。`
          : '正在中断产出计算，已保留上次产出结果。'
      ),
      'warning'
    )
  }, [setWorkflowMessage])

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
  const [activeCaseId, setActiveCaseIdState] = useState<string | null>(() => getActiveCopperCaseId())
  const setActiveCaseId = (id: string | null) => {
    setActiveCopperCaseId(id)
    setActiveCaseIdState(id)
  }
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
  const [summarySectionOpen, setSummarySectionOpen] = useState({
    smelting: false,
    converting: false,
    refining: false,
  })
  const cleanCaseFingerprintRef = useRef<string | null>(null)
  const pendingMarkCaseCleanRef = useRef(false)
  const [newCaseName, setNewCaseName] = useState(() => suggestCopperCaseName(smeltMethodName))
  const [targetFeSiO2, setTargetFeSiO2] = useState('2.8')
  const [targetCaOSiO2, setTargetCaOSiO2] = useState('0.45')
  const [processParameters, setProcessParameters] = useState<CopperProcessParameters>(
    () => DEFAULT_COPPER_PROCESS_PARAMETERS
  )
  const [processParameterDrafts, setProcessParameterDrafts] = useState<CopperProcessParameterDrafts>(() =>
    processParametersToDrafts(DEFAULT_COPPER_PROCESS_PARAMETERS)
  )
  const [processParametersConfirmed, setProcessParametersConfirmed] = useState(false)
  const [constraintEditorReached, setConstraintEditorReached] = useState(false)
  const batchPhaseTimerRef = useRef<number | null>(null)
  const [solventSolution, setSolventSolution] = useState<CopperSolventSolution | null>(null)
  const [fuelColumn, setFuelColumn] = useState<CopperFuelMaterial>(() => ({
    ...DEFAULT_COPPER_FUEL,
    ratios: { ...DEFAULT_COPPER_FUEL.ratios },
  }))
  const [airColumns, setAirColumns] = useState<CopperMaterialColumn[]>(() => createProcessAirColumns())
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
  const [coolingWaterInletTemperature, setCoolingWaterInletTemperature] = useState('30')
  const [coolingWaterOutletTemperature, setCoolingWaterOutletTemperature] = useState('38')
  const [coolingWaterMassTh, setCoolingWaterMassTh] = useState('3000')
  const [otherHeatMJh, setOtherHeatMJh] = useState(DEFAULT_OTHER_HEAT_MJH_TEXT)
  const [chemicalHeatMode, setChemicalHeatMode] = useState<CopperChemicalHeatMode>('hess')
  const [heatBalanced, setHeatBalanced] = useState(false)
  const [heatBalanceFilledBack, setHeatBalanceFilledBack] = useState(false)
  const [isHeatBalanceCalculating, setIsHeatBalanceCalculating] = useState(false)
  const [heatBalanceCalculationStep, setHeatBalanceCalculationStep] = useState(0)
  const [heatBalanceCalculationDetail, setHeatBalanceCalculationDetail] = useState('')
  const [isHeatBalanceCancelling, setIsHeatBalanceCancelling] = useState(false)
  const heatBalanceCalculationCancelRef = useRef<CalculationCancelToken | null>(null)
  const heatBalanceCalculationDetailRef = useRef('')
  const requestHeatBalanceCalculationCancel = useCallback(() => {
    if (heatBalanceCalculationCancelRef.current) heatBalanceCalculationCancelRef.current.cancelled = true
    setIsHeatBalanceCancelling(true)
    setHeatBalanceCalculationDetail('正在中断…')
    const detail = heatBalanceCalculationDetailRef.current
    setWorkflowMessage(
      workflowStepMessage(
        7,
        detail
          ? `正在中断热平衡计算（${detail}），当前迭代结果不会回填。`
          : '正在中断热平衡计算，当前迭代结果不会回填。'
      ),
      'warning'
    )
  }, [setWorkflowMessage])
  const [calculatedHeatBalance, setCalculatedHeatBalance] = useState<CopperHeatBalanceResult | null>(null)
  const [productConstraintConfig, setProductConstraintConfig] = useState<OxySideBlowConstraintConfig>(() =>
    createDefaultProductConstraintConfig()
  )
  const [productConstraintValueDrafts, setProductConstraintValueDrafts] = useState<ProductConstraintValueDrafts>({})
  const [openProductConstraintRuleMenu, setOpenProductConstraintRuleMenu] = useState<string | null>(null)
  const [customConstraintTargetDrafts, setCustomConstraintTargetDrafts] = useState<Record<number, string>>({})
  const [customConstraintExprDrafts, setCustomConstraintExprDrafts] = useState<Record<number, string>>({})
  const [newCustomConstraintDraft, setNewCustomConstraintDraft] = useState<CustomConstraintDraft>(
    EMPTY_CUSTOM_CONSTRAINT_DRAFT
  )
  const [manualAirWeightValid, setManualAirWeightValid] = useState(false)
  const [isPhaseCalculating, setIsPhaseCalculating] = useState(false)
  const [phaseCalculationStep, setPhaseCalculationStep] = useState(0)
  const [batchTableHighlight, setBatchTableHighlight] = useState(false)
  const [annualHours, setAnnualHours] = useState(initialActiveCaseRecord?.annualHours ?? '7200')
  const [equipmentIntensity, setEquipmentIntensity] = useState(initialActiveCaseRecord?.equipmentIntensity ?? '32')
  const [targetScaleWanTpa, setTargetScaleWanTpa] = useState(initialActiveCaseRecord?.targetScaleWanTpa ?? '10')
  const [equipmentAdjustments, setEquipmentAdjustments] = useState<Record<EquipmentStageId, string>>(
    initialActiveCaseRecord?.equipmentAdjustments ?? { smelting: '1', converting: '1', refining: '1' }
  )
  const [equipmentModelGenerated, setEquipmentModelGenerated] = useState<Record<EquipmentStageId, boolean>>(
    initialActiveCaseRecord?.equipmentModelGenerated ?? { smelting: false, converting: false, refining: false }
  )
  const [equipmentBomGenerated, setEquipmentBomGenerated] = useState<Record<EquipmentStageId, boolean>>(
    initialActiveCaseRecord?.equipmentBomGenerated ?? { smelting: false, converting: false, refining: false }
  )
  const [smeltingDailyFeedTd, setSmeltingDailyFeedTd] = useState(initialActiveCaseRecord?.smeltingDailyFeedTd ?? '')
  const [smeltingFeedMode, setSmeltingFeedMode] = useState<'daily' | 'annual'>(
    initialActiveCaseRecord?.smeltingFeedMode === 'annual' ? 'annual' : 'daily'
  )
  const [smeltingAnnualFeedTa, setSmeltingAnnualFeedTa] = useState(initialActiveCaseRecord?.smeltingAnnualFeedTa ?? '')
  const [smeltingProcessDays, setSmeltingProcessDays] = useState(
    initialActiveCaseRecord?.smeltingProcessDays ?? String(DEFAULT_SMELTING_PROCESS_DAYS)
  )
  const [smeltingBedCapacity, setSmeltingBedCapacity] = useState(initialActiveCaseRecord?.smeltingBedCapacity ?? '')
  const [smeltingFurnaceWidthM, setSmeltingFurnaceWidthM] = useState(
    initialActiveCaseRecord?.smeltingFurnaceWidthM ?? String(DEFAULT_SMELTING_FURNACE_WIDTH_M)
  )
  const [smeltingFurnaceLengthM, setSmeltingFurnaceLengthM] = useState(
    initialActiveCaseRecord?.smeltingFurnaceLengthM ?? ''
  )
  const [smeltingDimensionDrive, setSmeltingDimensionDrive] = useState<'width' | 'length'>(
    initialActiveCaseRecord?.smeltingDimensionDrive === 'length' ? 'length' : 'width'
  )
  const [smeltingJacketPitchMm, setSmeltingJacketPitchMm] = useState(
    initialActiveCaseRecord?.smeltingJacketPitchMm ?? String(DEFAULT_SMELTING_JACKET_PITCH_MM)
  )
  const [smeltingJacketRemainderDecision, setSmeltingJacketRemainderDecision] = useState<JacketRemainderDecision | null>(
    initialActiveCaseRecord?.smeltingJacketRemainderDecision === 'extend' ||
      initialActiveCaseRecord?.smeltingJacketRemainderDecision === 'trim'
      ? initialActiveCaseRecord.smeltingJacketRemainderDecision
      : null
  )
  const [smeltingSlagDensityTm3, setSmeltingSlagDensityTm3] = useState(
    initialActiveCaseRecord?.smeltingSlagDensityTm3 ?? String(DEFAULT_SMELTING_SLAG_DENSITY_TM3)
  )
  const [smeltingMatteDensityTm3, setSmeltingMatteDensityTm3] = useState(
    initialActiveCaseRecord?.smeltingMatteDensityTm3 ?? String(DEFAULT_SMELTING_MATTE_DENSITY_TM3)
  )
  const [smeltingOxygenNm3h, setSmeltingOxygenNm3h] = useState(initialActiveCaseRecord?.smeltingOxygenNm3h ?? '')
  const [smeltingTuyereOxygenNm3h, setSmeltingTuyereOxygenNm3h] = useState(
    initialActiveCaseRecord?.smeltingTuyereOxygenNm3h ?? String(DEFAULT_SMELTING_TUYERE_OXYGEN_NM3H)
  )
  const [smeltingTuyereCount, setSmeltingTuyereCount] = useState(initialActiveCaseRecord?.smeltingTuyereCount ?? '')
  const [smeltingTuyereCountOneSide, setSmeltingTuyereCountOneSide] = useState(() => {
    const savedTotal = toNumber(initialActiveCaseRecord?.smeltingTuyereCount ?? '', 0)
    return savedTotal > 0 ? String(Math.max(0, Math.round(savedTotal / 2))) : ''
  })
  const [smeltingDailyFeedOverridden, setSmeltingDailyFeedOverridden] = useState(
    initialActiveCaseRecord?.smeltingDailyFeedOverridden ?? false
  )
  const [smeltingAnnualFeedOverridden, setSmeltingAnnualFeedOverridden] = useState(
    initialActiveCaseRecord?.smeltingAnnualFeedOverridden ?? false
  )
  const [smeltingOxygenOverridden, setSmeltingOxygenOverridden] = useState(
    initialActiveCaseRecord?.smeltingOxygenOverridden ?? false
  )
  const [smeltingTuyereCountOverridden, setSmeltingTuyereCountOverridden] = useState(
    initialActiveCaseRecord?.smeltingTuyereCountOverridden ?? false
  )
  const [equipmentDimensionAdjustments, setEquipmentDimensionAdjustments] = useState<Record<EquipmentStageId, string>>(
    initialActiveCaseRecord?.equipmentDimensionAdjustments ?? { smelting: '1', converting: '1', refining: '1' }
  )
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
  const equipmentModelSectionRef = useRef<HTMLDivElement>(null)
  const equipmentBomSectionRef = useRef<HTMLDivElement>(null)
  const furnaceViewerRef = useRef<SmeltingFurnaceViewerHandle>(null)
  const materialLibraryRef = useRef<HTMLDivElement>(null)
  const elementAssistRef = useRef<HTMLDivElement>(null)
  const phaseAssistContainerRef = useRef<HTMLDivElement>(null)
  const [phaseAssistViewportWidth, setPhaseAssistViewportWidth] = useState(0)
  const productCalculationRef = useRef<HTMLDivElement>(null)
  const heatBalanceRef = useRef<HTMLDivElement>(null)
  const caseImportInputRef = useRef<HTMLInputElement>(null)
  const stagePageTopRef = useRef<HTMLDivElement>(null)
  const previousActiveSheetRef = useRef<SheetId>(activeSheet)
  const processStagesCacheRef = {
    get current() {
      return getCopperProcessStagesCache()
    },
    set current(value: CopperCaseProcessStages) {
      setCopperProcessStagesCache(value)
    },
  }
  const loadedProcessStageIdRef = {
    get current() {
      return getLoadedCopperProcessStageId()
    },
    set current(value: CopperProcessStageId | null) {
      setLoadedCopperProcessStageId(value)
    },
  }
  const resetHeatBalanceCalculation = useCallback(() => {
    setHeatBalanced(false)
    setHeatBalanceFilledBack(false)
    setCalculatedHeatBalance(null)
    const stageId = processStageIdForSheet(activeSheet) ?? 'cu_smelting'
    const stages = processStagesCacheRef.current
    const currentStage = stages[stageId]
    if (!currentStage) return
    processStagesCacheRef.current = {
      ...stages,
      [stageId]: {
        ...currentStage,
        heatBalanced: false,
        heatBalanceFilledBack: false,
        calculatedHeatBalance: null,
      },
    }
  }, [activeSheet])
  const resetProductCalculation = useCallback(() => {
    setProductCalculated(false)
    setProductFilledBack(false)
    setProductCalculationFailure(null)
    setProductCalculationError(null)
    resetHeatBalanceCalculation()
  }, [resetHeatBalanceCalculation])
  const resetDownstreamCalculations = useCallback(() => {
    resetProductCalculation()
    setProductPhaseManual(false)
    setProductPhaseOverrides({})
    setOutputPhaseDrafts({})
    setInvalidOutputPhaseColumns({})
  }, [resetProductCalculation])
  const [stageEnterHighlight, setStageEnterHighlight] = useState(false)

  const rawBlend = useMemo(() => calculateWeightedComposition(rawMaterials), [rawMaterials])
  const { concentrates: concentrateRawMaterials } = useMemo(
    () => partitionRawMixMaterials(rawMaterials),
    [rawMaterials]
  )
  const rawConcentrateBlend = useMemo(
    () =>
      calculateWeightedComposition(
        concentrateRawMaterials.map((material) => ({
          ...material,
          waterWeight: 0,
          moisture: 0,
        }))
      ),
    [concentrateRawMaterials]
  )
  const rawConcentrateWaterWeight = useMemo(
    () => totalWaterWeight(concentrateRawMaterials),
    [concentrateRawMaterials]
  )
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
  const hasProductResult = hasStoredProductResult
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

  const updateProductConstraintConfig = useCallback(
    (updater: (config: OxySideBlowConstraintConfig) => OxySideBlowConstraintConfig) => {
      setProductConstraintConfig((prev) => updater(prev))
      resetDownstreamCalculations()
    },
    [resetDownstreamCalculations]
  )
  const commitProcessParameters = useCallback(
    (params: CopperProcessParameters) => {
      setProcessParameters(params)
      setProcessParameterDrafts(processParametersToDrafts(params))
      setTargetFeSiO2(String(params.feSiO2))
      setProcessParametersConfirmed(true)
      const isConverting = activeSheet === 'cu_converting'
      updateProductConstraintConfig((prev) =>
        applyProcessParameters(prev, params, { addMissingConstraints: !isConverting })
      )
    },
    [activeSheet, updateProductConstraintConfig]
  )
  const syncProcessParametersFromConfig = useCallback((config: OxySideBlowConstraintConfig) => {
    const params = processParametersFromConfig(config)
    setProcessParameters(params)
    setProcessParameterDrafts(processParametersToDrafts(params))
  }, [])
  useEffect(() => {
    const stageId =
      activeSheet === 'cu_converting' || activeSheet === 'cu_converting_equipment'
        ? 'cu_converting'
        : activeSheet === 'cu_smelting' || activeSheet === 'cu_smelting_equipment'
          ? 'cu_smelting'
          : null
    if (!stageId) return
    const defaults = defaultOxyConstraintConfigForStage(stageId)
    const configIsConverting = /converting/i.test(productConstraintConfig.method ?? '')
    const stageIsConverting = stageId === 'cu_converting'
    // 切到吹炼但内存仍是熔炼约束：立即换成吹炼产物物相，禁止继续用熔炼表
    if (stageIsConverting && !configIsConverting) {
      setProductConstraintConfig(ensureStageUsesConvertingProductPhases(null))
      return
    }
    if (!stageIsConverting && configIsConverting) {
      setProductConstraintConfig(cloneOxyConstraintConfig(DEFAULT_OXY_CONSTRAINT_CONFIG))
      return
    }
    if ((productConstraintConfig.version ?? 0) >= defaults.version) return
    // 仅升级约束模板，不得清空已有产出/热平衡结果
    setProductConstraintConfig((prev) =>
      autoFillOxyProductConstraintConfig(
        migrateOxyProductConstraintDefaults(normalizeProductConstraintFixedValues(prev), defaults)
      ).config
    )
  }, [activeSheet, productConstraintConfig.method, productConstraintConfig.version])

  useEffect(() => {
    if (forcedPageKind !== 'converting-batch' && activeSheet !== 'cu_converting') return
    if (/converting/i.test(productConstraintConfig.method ?? '')) return
    setProductConstraintConfig(ensureStageUsesConvertingProductPhases(null))
  }, [forcedPageKind, activeSheet, productConstraintConfig.method])

  useEffect(() => {
    if (batchTableView === 'balance') {
      window.requestAnimationFrame(() => {
        const target = heatBalanceFilledBack && heatBalanced ? calculationTableRef.current : heatBalanceRef.current
        target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
      return
    }
    if (batchTableView === 'productPhase' || batchTableView === 'productElement') {
      window.requestAnimationFrame(() => {
        const target = hasProductResult ? calculationTableRef.current : productCalculationRef.current
        target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
      return
    }
    calculationTableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [batchTableView, hasProductResult, heatBalanceFilledBack, heatBalanced])
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
    () => (oxySolverResult?.acceptable ? oxySolverToCopperProductResult(oxySolverResult) : staticProductResult),
    [oxySolverResult, staticProductResult]
  )
  const concentrateMass = useMemo(
    () => concentrateRawMaterials.reduce((sum, m) => sum + Math.max(0, m.weight), 0),
    [concentrateRawMaterials]
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
    return phaseCompletedMaterials[material.id] ? 'resolved' : 'pending'
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
  const activeProcessStageId = pageLockedProcessStageId
  const feedConstraintElementKeys = useMemo(
    () =>
      collectFeedConstraintElementKeys([
        ...rawMaterials,
        ...solventColumns,
        ...(activeProcessStageId === 'cu_converting' ? [] : [fuelColumn]),
        ...airColumns,
      ]),
    [activeProcessStageId, airColumns, fuelColumn, rawMaterials, solventColumns]
  )
  const productConstraintRows = useMemo(
    () =>
      buildProductConstraintRows(
        productConstraintConfig,
        defaultOxyConstraintConfigForStage(activeProcessStageId),
        feedConstraintElementKeys
      ),
    [activeProcessStageId, feedConstraintElementKeys, productConstraintConfig.elementDistributions]
  )
  const activeCase = activeCaseId ? caseRecords.find((record) => record.id === activeCaseId) ?? null : null
  const applyCaseEquipmentStateToUi = useCallback((record: CopperCaseRecord) => {
    setAnnualHours(record.annualHours ?? '7200')
    setEquipmentIntensity(record.equipmentIntensity ?? '32')
    setTargetScaleWanTpa(record.targetScaleWanTpa ?? '10')
    setEquipmentAdjustments(record.equipmentAdjustments ?? { smelting: '1', converting: '1', refining: '1' })
    setEquipmentDimensionAdjustments(
      record.equipmentDimensionAdjustments ?? { smelting: '1', converting: '1', refining: '1' }
    )
    setEquipmentModelGenerated(record.equipmentModelGenerated ?? { smelting: false, converting: false, refining: false })
    setEquipmentBomGenerated(record.equipmentBomGenerated ?? { smelting: false, converting: false, refining: false })
    setSmeltingDailyFeedTd(record.smeltingDailyFeedTd ?? '')
    setSmeltingFeedMode(record.smeltingFeedMode === 'annual' ? 'annual' : 'daily')
    setSmeltingAnnualFeedTa(record.smeltingAnnualFeedTa ?? '')
    setSmeltingProcessDays(record.smeltingProcessDays ?? String(DEFAULT_SMELTING_PROCESS_DAYS))
    setSmeltingBedCapacity(record.smeltingBedCapacity ?? '')
    setSmeltingFurnaceWidthM(record.smeltingFurnaceWidthM ?? String(DEFAULT_SMELTING_FURNACE_WIDTH_M))
    setSmeltingFurnaceLengthM(record.smeltingFurnaceLengthM ?? '')
    setSmeltingDimensionDrive(record.smeltingDimensionDrive === 'length' ? 'length' : 'width')
    setSmeltingJacketPitchMm(record.smeltingJacketPitchMm ?? String(DEFAULT_SMELTING_JACKET_PITCH_MM))
    setSmeltingJacketRemainderDecision(
      record.smeltingJacketRemainderDecision === 'extend' || record.smeltingJacketRemainderDecision === 'trim'
        ? record.smeltingJacketRemainderDecision
        : null
    )
    setSmeltingSlagDensityTm3(record.smeltingSlagDensityTm3 ?? String(DEFAULT_SMELTING_SLAG_DENSITY_TM3))
    setSmeltingMatteDensityTm3(record.smeltingMatteDensityTm3 ?? String(DEFAULT_SMELTING_MATTE_DENSITY_TM3))
    setSmeltingOxygenNm3h(record.smeltingOxygenNm3h ?? '')
    setSmeltingTuyereOxygenNm3h(record.smeltingTuyereOxygenNm3h ?? String(DEFAULT_SMELTING_TUYERE_OXYGEN_NM3H))
    setSmeltingTuyereCount(record.smeltingTuyereCount ?? '')
    const savedTotal = toNumber(record.smeltingTuyereCount ?? '', 0)
    setSmeltingTuyereCountOneSide(savedTotal > 0 ? String(Math.max(0, Math.round(savedTotal / 2))) : '')
    setSmeltingDailyFeedOverridden(record.smeltingDailyFeedOverridden ?? false)
    setSmeltingAnnualFeedOverridden(record.smeltingAnnualFeedOverridden ?? false)
    setSmeltingOxygenOverridden(record.smeltingOxygenOverridden ?? false)
    setSmeltingTuyereCountOverridden(record.smeltingTuyereCountOverridden ?? false)
  }, [])

  const allRawMaterialsSelected = rawMaterials.every((material) => material.name.trim())
  const allPhaseMaterialsCompleted = rawMaterials.every(
    (material) =>
      material.name.trim() &&
      (material.weight <= 0 ||
        (validateMaterialForPhaseCalc(material) === null && phaseCompletedMaterials[material.id]))
  )
  const convertingFeedReady =
    activeProcessStageId === 'cu_converting' &&
    rawMaterials.some((material) => material.name.trim() && material.weight > 0) &&
    rawMaterials.every(
      (material) =>
        !material.name.trim() ||
        material.weight <= 0 ||
        Boolean(phaseCompletedMaterials[material.id] && phaseBatchResults?.[material.id]?.valid)
    )
  const isConvertingHeatBalance = activeProcessStageId === 'cu_converting'
  const coolingWaterOutletIsCalculated = isConvertingHeatBalance || chemicalHeatMode === 'hess'
  const allRawMaterialsWeighed = rawMaterials.every((material) => material.name.trim() && material.weight > 0)
  const heatInputValid = [
    feedTemperature,
    matteTemperature,
    slagTemperature,
    gasTemperature,
    dustTemperature,
    coolingWaterInletTemperature,
    coolingWaterMassTh,
    otherHeatMJh,
    ...(!coolingWaterOutletIsCalculated ? [coolingWaterOutletTemperature] : []),
  ].every(isValidNumberText)
  const workflowFlowSteps = useMemo(() => {
    const labels = workflowFlowStepLabels(activeProcessStageId)
    const stepFlags =
      activeProcessStageId === 'cu_converting'
        ? [
            allRawMaterialsSelected,
            convertingFeedReady,
            constraintEditorReached,
            productFilledBack,
            heatBalanced,
          ]
        : [
            allRawMaterialsSelected,
            allRawMaterialsWeighed,
            allPhaseMaterialsCompleted,
            processParametersConfirmed || allPhaseMaterialsCompleted,
            constraintEditorReached,
            productFilledBack,
            heatBalanced,
          ]
    const firstIncomplete = stepFlags.findIndex((value) => !value)
    const allDone = firstIncomplete === -1
    return labels.map((label, index) => ({
      label,
      status: (allDone || index < firstIncomplete
        ? 'completed'
        : index === firstIncomplete
          ? 'active'
          : 'pending') as WorkflowStepStatus,
    }))
  }, [
    activeProcessStageId,
    allPhaseMaterialsCompleted,
    allRawMaterialsSelected,
    allRawMaterialsWeighed,
    convertingFeedReady,
    heatBalanced,
    processParametersConfirmed,
    constraintEditorReached,
    productFilledBack,
  ])
  const batchTabGuide = useMemo(() => {
    if (!isCopperProcessSheet || !activeCaseId) return null
    if (!allRawMaterialsSelected) return '原料：请先选择原料'
    if (activeProcessStageId === 'cu_converting') {
      if (!convertingFeedReady) {
        return batchTableView === 'phase'
          ? '投料(物相表)：填写投料量；物相%已有默认值，可按需修改'
          : '投料(物相表)：请切换到物相表填写投料量'
      }
      if (batchTableView === 'phase') return '产出约束：投料与物相已就绪，可进入产出约束并计算产出'
      if (batchTableView === 'element') return '投入元素表：只读反推结果；改投料/物相请回物相表'
      if (batchTableView === 'productPhase' || batchTableView === 'productElement') {
        return '产出计算：设置产出约束后点击「计算产出结果」'
      }
      if (batchTableView === 'balance') return '热平衡：产出回填后设置温度并计算热平衡'
      return '产出约束：确认约束后点击「计算产出结果」'
    }
    if (!allRawMaterialsWeighed) return '原料投料量：请填写投料量 (t/h)'
    if (!allPhaseMaterialsCompleted) return '投入物相：双击 O / C 列进入物相计算'
    if (batchTableView === 'phase') return '投入物相：物相已就绪，可进入关键参数输入或产出计算'
    if (batchTableView === 'parameters') return '关键参数输入：确认参数后点击下一步进入产出计算'
    if (batchTableView === 'productPhase' || batchTableView === 'productElement') return '产出计算：设置产出约束后点击「计算产出结果」'
    if (batchTableView === 'balance') return '热平衡：产出回填后设置温度并计算热平衡'
    return '关键参数输入：请填写并确认关键参数'
  }, [
    activeCaseId,
    activeProcessStageId,
    isCopperProcessSheet,
    allPhaseMaterialsCompleted,
    allRawMaterialsSelected,
    allRawMaterialsWeighed,
    batchTableView,
    convertingFeedReady,
  ])
  const batchContextHint = useMemo(
    () =>
      resolveBatchWorkflowHint({
        rawMaterials,
        phaseCompletedMaterials,
        showElementAssist,
        processParametersConfirmed,
        batchTableView,
        activeSheet,
        hasActiveCase: Boolean(activeCaseId),
      }),
    [
      activeCaseId,
      activeSheet,
      batchTableView,
      phaseCompletedMaterials,
      processParametersConfirmed,
      rawMaterials,
      showElementAssist,
    ]
  )
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
    if (!oxySolverResult?.acceptable) return null
    return [...oxyProductTableColumns(oxySolverResult), productSummary]
  }, [oxySolverResult, productSummary])
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
    if (oxySolverResult?.acceptable) {
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
  }, [displayProductResult, oxySolverResult, parsedProductPhaseOverrides])
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
      const batchResult =
        kind === 'raw' || kind === 'other' || kind === 'solvent' ? phaseBatchResults?.[id] : undefined
      const seededPhaseReady = Boolean(batchResult?.valid && batchResult.status)
      const phaseReady =
        kind === 'solvent' && activeProcessStageId === 'cu_converting'
          ? Boolean((phaseCompletedMaterials[id] && batchResult?.valid) || seededPhaseReady)
          : (kind !== 'raw' && kind !== 'other') ||
            manual ||
            Boolean(phaseCompletedMaterials[id] && batchResult?.valid) ||
            (activeProcessStageId === 'cu_converting' && seededPhaseReady)
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
        readOnly: activeProcessStageId === 'cu_converting' && id === CONVERTING_WHITE_MATTE_ID,
      }
    }
    const { concentrates: phaseConcentrateMaterials, others: phaseOtherMaterials } =
      partitionRawMixMaterials(rawMaterials)
    const rawColumns = [
      ...phaseConcentrateMaterials.map((material, index) =>
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
      ),
      ...phaseOtherMaterials.map((material) =>
        buildColumn(
          material.id,
          'other',
          '其他',
          displayRawMaterialName(material.name),
          material.weight,
          material.ratios,
          {
            moisture: material.moisture ?? 0,
            waterWeight: materialWaterWeight(material),
            materialRows: ensureMaterialPhaseRows(materialPhaseRows[material.id]),
          }
        )
      ),
    ]
    const solventCols = solventColumns.map((material, index) => {
      const materialRows =
        activeProcessStageId === 'cu_converting' && material.id === CONVERTING_LIME_SOLVENT_ID
          ? ensureMaterialPhaseRows(materialPhaseRows[material.id], material)
          : createDefaultMaterialPhaseRowsForMaterial(material)
      const convertingLimePhases =
        activeProcessStageId === 'cu_converting' &&
        material.id === CONVERTING_LIME_SOLVENT_ID &&
        phaseBatchResults?.[material.id]?.valid
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
          phaseContentsByKey: convertingLimePhases
            ? null
            : buildDefaultMaterialPhaseContentsByKey(material.ratios, materialRows),
        }
      )
    })
    const fuelMaterialRows = createDefaultMaterialPhaseRowsForMaterial(fuelColumn)
    const isConvertingStage = activeProcessStageId === 'cu_converting'
    const fuelCol = buildColumn(
      fuelColumn.id,
      'fuel',
      '燃料煤',
      displayFuelName(fuelColumn.name),
      isConvertingStage ? 0 : fuelColumn.weight,
      fuelColumn.ratios,
      {
        moisture: fuelColumn.moisture ?? 0,
        waterWeight: isConvertingStage ? 0 : materialWaterWeight(fuelColumn),
        materialRows: fuelMaterialRows,
        phaseContentsByKey: buildDefaultMaterialPhaseContentsByKey(fuelColumn.ratios, fuelMaterialRows),
      }
    )
    const airCols: PhaseTableColumn[] = airColumns
      .filter((column) => !(isConvertingStage && column.airRole === 'secondary'))
      .map((column) => {
      const dryRef = column.weight > 0 ? column.weight : 100
      const waterRef =
        column.weight > 0
          ? materialWaterWeight(column)
          : (dryRef * Math.max(0, column.moisture ?? 0)) / 100
      return {
      id: column.id,
      kind: 'oxygen' as const,
      header: '气',
      subHeader: column.name,
      weight: column.weight,
      waterWeight: materialWaterWeight(column),
      moisture: column.moisture ?? 0,
      oxygenAir: buildOxygenAirPhaseColumn(column.ratios, dryRef, waterRef),
    }
    })
    const furnaceBlend = buildFurnaceBlendPhaseColumn([
      ...rawColumns
        .filter((column) => column.weight > 0 && column.phases && column.phaseReady !== false)
        .map((column) => ({
          weight: column.weight,
          phases: column.phases!,
          moisture: column.moisture ?? 0,
          waterWeight: column.waterWeight ?? 0,
        })),
      ...solventCols
        .filter((column) => column.weight > 0 && column.phases)
        .map((column) => ({
          weight: column.weight,
          phases: column.phases!,
          moisture: column.moisture ?? 0,
          waterWeight: column.waterWeight ?? 0,
        })),
      ...(isConvertingStage
        ? []
        : [
            {
              weight: fuelCol.weight,
              phases: fuelCol.phases!,
              moisture: fuelCol.moisture ?? 0,
              waterWeight: fuelCol.waterWeight ?? 0,
            },
          ]),
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
      subHeader: isConvertingStage ? '混料' : '混合铜精矿',
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
    return [
      ...rawColumns,
      ...solventCols,
      ...(isConvertingStage ? [] : [fuelCol]),
      ...airCols,
      blendCol,
    ]
  }, [
    activeProcessStageId,
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
          weight: hasStoredProductResult ? product.mass : 0,
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
    [activeProcessStageId, hasStoredProductResult, productPhaseComposition, productTableColumns]
  )
  const inputSummaryColumn = useMemo(
    () => inputPhaseColumnData.find((column) => column.kind === 'blend'),
    [inputPhaseColumnData]
  )
  const outputPhaseRowKeys = useMemo(() => {
    if (!hasStoredProductResult) return []
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
  }, [outputPhaseColumnData, hasStoredProductResult])
  const outputProductElementKeys = useMemo(() => {
    if (!hasStoredProductResult) return []
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
  }, [hasStoredProductResult, productTableColumns])
  const outputProductElementRows = useMemo<ProductElementTableProduct[]>(
    () =>
      hasStoredProductResult
        ? productTableColumns
            .filter((product) => product.key !== 'total')
            .map((product) => ({
              key: product.key,
              name: product.name === '总计' ? '总计' : getStageProductName(activeProcessStageId, product),
              mass: product.mass,
              composition: product.composition,
            }))
        : [],
    [activeProcessStageId, hasStoredProductResult, productTableColumns]
  )
  const oxygenAirInputStatus: SolveInputStatus = manualAirWeightValid || productCalculated ? 'resolved' : 'pending'
  const rawColumnWidth = (material: CopperMaterialColumn) => Math.max(104, Math.min(136, 72 + Math.min(displayRawMaterialName(material.name).length, 7) * 9))
  const batchTableNameLabels = useMemo(() => {
    const labels = [
      ...rawMaterials.map((material) => displayRawMaterialName(material.name)),
      inputSummaryColumn?.subHeader ?? inputSummaryColumn?.header ?? '',
      ...solventColumns.map((material) => displaySolventName(material.name)),
      displayFuelName(fuelColumn.name),
      ...airColumns.map((column) => column.name),
      '投入',
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
    inputSummaryColumn,
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
        inputSummaryColumn?.subHeader ?? inputSummaryColumn?.header ?? '',
        '投入',
        ...solventColumns.map((material) => displaySolventName(material.name)),
      ]),
    [inputSummaryColumn, materialLibrary, rawMaterials, solventColumns]
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
  const smeltingHourlyWetFeedTh = useMemo(
    () => sumRawWetThroughputTh(rawMaterials),
    [rawMaterials, solventColumns]
  )
  const smeltingDefaultDailyFeedTd = useMemo(
    () => calculateDailyFeedTd(smeltingHourlyWetFeedTh),
    [smeltingHourlyWetFeedTh]
  )
  const smeltingProcessDaysValue = toNumber(smeltingProcessDays, DEFAULT_SMELTING_PROCESS_DAYS)
  const smeltingDefaultAnnualFeedTa = useMemo(
    () => calculateAnnualFeedWithoutCoalTa(smeltingHourlyWetFeedTh, smeltingProcessDaysValue),
    [smeltingHourlyWetFeedTh, smeltingProcessDaysValue]
  )
  const smeltingDefaultOxygenNm3h = useMemo(
    () => calculateOxygenColumnVolumeNm3h(findOxygenAirColumn(airColumns)),
    [airColumns]
  )
  const smeltingDesign = useMemo((): SmeltingFurnaceDesignResult => {
    const processDays = toNumber(smeltingProcessDays, DEFAULT_SMELTING_PROCESS_DAYS)
    const annualFeedTa = smeltingAnnualFeedOverridden
      ? toNumber(smeltingAnnualFeedTa, smeltingDefaultAnnualFeedTa)
      : smeltingDefaultAnnualFeedTa
    const dailyFeedTd =
      smeltingFeedMode === 'annual'
        ? processDays > 0
          ? annualFeedTa / processDays
          : 0
        : smeltingDailyFeedOverridden
          ? toNumber(smeltingDailyFeedTd, smeltingDefaultDailyFeedTd)
          : smeltingDefaultDailyFeedTd
    const oxygenNm3h = smeltingOxygenOverridden
      ? toNumber(smeltingOxygenNm3h, smeltingDefaultOxygenNm3h)
      : smeltingDefaultOxygenNm3h
    const bedCapacity = toNumber(smeltingBedCapacity, 0)
    const areaM2 = dailyFeedTd > 0 && bedCapacity > 0 ? dailyFeedTd / bedCapacity : 0
    const widthInput = toNumber(smeltingFurnaceWidthM, DEFAULT_SMELTING_FURNACE_WIDTH_M)
    const lengthInput = toNumber(smeltingFurnaceLengthM, 0)
    let furnaceWidthM = widthInput > 0 ? widthInput : DEFAULT_SMELTING_FURNACE_WIDTH_M
    let furnaceLengthM = lengthInput
    if (areaM2 > 0) {
      if (smeltingDimensionDrive === 'length' && lengthInput > 0) {
        furnaceLengthM = lengthInput
        furnaceWidthM = calculateFurnaceWidthM(areaM2, lengthInput)
      } else {
        furnaceWidthM = widthInput > 0 ? widthInput : DEFAULT_SMELTING_FURNACE_WIDTH_M
        furnaceLengthM = calculateFurnaceLengthM(areaM2, furnaceWidthM)
      }
    }
    return calculateSmeltingFurnaceDesign({
      dailyFeedTd,
      bedCapacity,
      furnaceLengthM,
      furnaceWidthM,
      jacketPitchMm: toNumber(smeltingJacketPitchMm, DEFAULT_SMELTING_JACKET_PITCH_MM),
      jacketRemainderDecision: smeltingJacketRemainderDecision,
      oxygenNm3h,
      tuyereCountOneSide: smeltingTuyereCountOverridden ? toNumber(smeltingTuyereCountOneSide, 0) : null,
    })
  }, [
    smeltingFeedMode,
    smeltingDailyFeedOverridden,
    smeltingDailyFeedTd,
    smeltingDefaultDailyFeedTd,
    smeltingAnnualFeedOverridden,
    smeltingAnnualFeedTa,
    smeltingDefaultAnnualFeedTa,
    smeltingProcessDays,
    smeltingOxygenOverridden,
    smeltingOxygenNm3h,
    smeltingDefaultOxygenNm3h,
    smeltingBedCapacity,
    smeltingFurnaceWidthM,
    smeltingFurnaceLengthM,
    smeltingDimensionDrive,
    smeltingJacketPitchMm,
    smeltingJacketRemainderDecision,
    smeltingTuyereCountOverridden,
    smeltingTuyereCountOneSide,
  ])
  const smeltingFeedRelatedParams = useMemo(() => {
    const processDays = Math.max(0, toNumber(smeltingProcessDays, DEFAULT_SMELTING_PROCESS_DAYS))
    const scale = smeltingFeedMode === 'annual' ? 24 * processDays : 24
    const unit = smeltingFeedMode === 'annual' ? 't/a' : 't/d'
    const rawDryTh = rawMaterials.reduce((sum, material) => sum + Math.max(0, material.weight ?? 0), 0)
    const rawWaterTh = totalWaterWeight(rawMaterials)
    const solventDryTh = solventColumns.reduce((sum, material) => sum + Math.max(0, material.weight ?? 0), 0)
    const solventWaterTh = totalWaterWeight(solventColumns)
    const coalDryTh = Math.max(0, fuelColumn.weight ?? 0)
    const coalWaterTh = materialWaterWeight(fuelColumn)
    return [
      { title: '投入', unit, dry: rawDryTh * scale, water: rawWaterTh * scale },
      { title: '熔剂', unit, dry: solventDryTh * scale, water: solventWaterTh * scale },
      { title: '煤', unit, dry: coalDryTh * scale, water: coalWaterTh * scale },
    ]
  }, [rawMaterials, solventColumns, fuelColumn, smeltingProcessDays, smeltingFeedMode])
  const smeltingEquipmentAirColumns = useMemo(
    () =>
      calculatedHeatBalance?.finalAirColumns?.length
        ? calculatedHeatBalance.finalAirColumns
        : airColumns,
    [calculatedHeatBalance, airColumns]
  )
  const smeltingGasDetailRows = useMemo(
    () =>
      smeltingEquipmentAirColumns.map((column) => ({
        id: column.id,
        name: column.name,
        dryTh: Math.max(0, column.weight ?? 0),
        waterTh: materialWaterWeight(column),
        volumeNm3h: calculateProcessAirColumnVolumeNm3h(column),
      })),
    [smeltingEquipmentAirColumns]
  )
  const smeltingCoolingWaterKeyParams = useMemo(() => {
    if (!calculatedHeatBalance) {
      return [
        { label: '冷却水量', value: '—', unit: 't/h' },
        { label: '进水温度', value: '—', unit: '℃' },
        { label: '出水温度', value: '—', unit: '℃' },
        { label: '冷却水占热支出', value: '—', unit: '%' },
      ]
    }
    const coolingExpenditurePct =
      calculatedHeatBalance.heatExpenditureRows.find((row) => row.material === '冷却水' && !row.isSubtotal)?.percent ??
      null
    return [
      {
        label: '冷却水量',
        value: formatTableDisplayValue(calculatedHeatBalance.coolingWaterMassTh),
        unit: 't/h',
      },
      {
        label: '进水温度',
        value: formatTableDisplayValue(calculatedHeatBalance.coolingWaterInletTemperatureC),
        unit: '℃',
      },
      {
        label: '出水温度',
        value: formatTableDisplayValue(calculatedHeatBalance.coolingWaterOutletTemperatureC),
        unit: '℃',
      },
      {
        label: '冷却水占热支出',
        value: coolingExpenditurePct == null ? '—' : formatTableDisplayValue(coolingExpenditurePct),
        unit: '%',
      },
    ]
  }, [calculatedHeatBalance])
  const smeltingDailyFeedDisplay = smeltingDailyFeedOverridden
    ? smeltingDailyFeedTd
    : formatTableNumber(smeltingDefaultDailyFeedTd)
  const smeltingAnnualFeedDisplay = smeltingAnnualFeedOverridden
    ? smeltingAnnualFeedTa
    : formatTableNumber(smeltingDefaultAnnualFeedTa)
  const smeltingOxygenDisplay = smeltingOxygenOverridden
    ? smeltingOxygenNm3h
    : formatTableNumber(smeltingDefaultOxygenNm3h)
  const smeltingWidthDisplay =
    smeltingDimensionDrive === 'length'
      ? formatTableDisplayValue(smeltingDesign.furnaceWidthM)
      : smeltingFurnaceWidthM
  const smeltingLengthDisplay =
    smeltingDimensionDrive === 'width'
      ? formatTableDisplayValue(smeltingDesign.furnaceLengthM)
      : smeltingFurnaceLengthM || formatTableDisplayValue(smeltingDesign.furnaceLengthM)
  const smeltingBedAreaCalcFormula =
    smeltingFeedMode === 'annual'
      ? '年投入（湿）÷ 年处理天数 ÷ 床能力'
      : '单日处理量（湿）÷ 床能力'
  /** 按输入炉长直接排布（未处理余量）的水套个数与熔炼炉面积 */
  const smeltingJacketBase = useMemo(() => {
    const oneSide =
      smeltingDesign.jacketRemainderDecision === 'extend'
        ? Math.max(0, smeltingDesign.jacketCountOneSide - 1)
        : smeltingDesign.jacketCountOneSide
    const areaM2 =
      smeltingDesign.furnaceLengthM > 0 && smeltingDesign.furnaceWidthM > 0
        ? smeltingDesign.furnaceLengthM * smeltingDesign.furnaceWidthM
        : 0
    return { oneSide, total: oneSide * 2, lengthM: smeltingDesign.furnaceLengthM, areaM2 }
  }, [smeltingDesign])
  /** 水套余量的两种处置结果，供余量行按钮直接展示调整后的个数与炉长 */
  const smeltingJacketRemainderOptions = useMemo(() => {
    if (smeltingDesign.jacketRemainderMm <= 0.5) return null
    const pitchMm = smeltingDesign.jacketPitchMm
    const widthM = smeltingDesign.furnaceWidthM
    const baseOneSide = smeltingJacketBase.oneSide
    const trimLengthM = (baseOneSide * pitchMm) / 1000
    const extendLengthM = ((baseOneSide + 1) * pitchMm) / 1000
    return {
      remainderMm: smeltingDesign.jacketRemainderMm,
      pitchMm,
      baseOneSide,
      trim: {
        oneSide: baseOneSide,
        total: baseOneSide * 2,
        lengthM: trimLengthM,
        areaM2: widthM > 0 ? trimLengthM * widthM : 0,
      },
      extend: {
        oneSide: baseOneSide + 1,
        total: (baseOneSide + 1) * 2,
        lengthM: extendLengthM,
        areaM2: widthM > 0 ? extendLengthM * widthM : 0,
      },
    }
  }, [smeltingDesign, smeltingJacketBase])
  /** 第二行展示的熔炼炉面积：无余量取输入炉长×炉宽，有余量且已选则取处置后面积 */
  const smeltingJacketAreaDisplay = useMemo(() => {
    if (smeltingJacketRemainderOptions && smeltingJacketRemainderDecision) {
      const applied =
        smeltingJacketRemainderDecision === 'extend'
          ? smeltingJacketRemainderOptions.extend
          : smeltingJacketRemainderOptions.trim
      return {
        areaM2: applied.areaM2,
        lengthM: applied.lengthM,
        oneSide: applied.oneSide,
        total: applied.total,
        pending: false,
      }
    }
    if (smeltingJacketRemainderOptions) {
      return { areaM2: null, lengthM: null, oneSide: null, total: null, pending: true }
    }
    return {
      areaM2: smeltingJacketBase.areaM2,
      lengthM: smeltingJacketBase.lengthM,
      oneSide: smeltingJacketBase.oneSide,
      total: smeltingJacketBase.total,
      pending: false,
    }
  }, [smeltingJacketRemainderOptions, smeltingJacketRemainderDecision, smeltingJacketBase])
  const smeltingJacketAreaUpdated = Boolean(
    smeltingJacketRemainderOptions && smeltingJacketRemainderDecision && !smeltingJacketAreaDisplay.pending
  )
  /** 仅「增加 1 个水套」会改变个数；去掉余量只改炉长，个数不变 */
  const smeltingJacketCountUpdated = smeltingJacketRemainderDecision === 'extend'
  const smeltingJacketCountDisplay = useMemo(() => {
    if (
      smeltingJacketCountUpdated &&
      smeltingJacketAreaDisplay.oneSide != null &&
      smeltingJacketAreaDisplay.total != null
    ) {
      return {
        updated: true,
        oneSide: smeltingJacketAreaDisplay.oneSide,
        total: smeltingJacketAreaDisplay.total,
      }
    }
    return {
      updated: false,
      oneSide: smeltingJacketBase.oneSide,
      total: smeltingJacketBase.total,
    }
  }, [smeltingJacketCountUpdated, smeltingJacketAreaDisplay, smeltingJacketBase])
  /** 熔炼渣 / 冰铜熔池高度：产出质量 ÷ (密度 × 余量处置后面积) */
  const smeltingBathHeight = useMemo(() => {
    const slagMassTh = productCalculated ? Math.max(0, productResult.products.slag.mass ?? 0) : 0
    const matteMassTh = productCalculated ? Math.max(0, productResult.products.matte.mass ?? 0) : 0
    const areaM2 =
      smeltingJacketAreaDisplay.pending || smeltingJacketAreaDisplay.areaM2 == null
        ? 0
        : smeltingJacketAreaDisplay.areaM2
    const slagDensity = toNumber(smeltingSlagDensityTm3, DEFAULT_SMELTING_SLAG_DENSITY_TM3)
    const matteDensity = toNumber(smeltingMatteDensityTm3, DEFAULT_SMELTING_MATTE_DENSITY_TM3)
    return {
      slagMassTh,
      matteMassTh,
      areaReady: areaM2 > 0,
      productReady: productCalculated,
      slagHeightM: calculateBathHeightM(slagMassTh, slagDensity, areaM2),
      matteHeightM: calculateBathHeightM(matteMassTh, matteDensity, areaM2),
    }
  }, [
    productCalculated,
    productResult.products.slag.mass,
    productResult.products.matte.mass,
    smeltingJacketAreaDisplay,
    smeltingSlagDensityTm3,
    smeltingMatteDensityTm3,
  ])
  const smeltingTuyereCountOneSideDisplay = smeltingTuyereCountOverridden
    ? smeltingTuyereCountOneSide
    : String(smeltingDesign.jacketCountOneSide)
  const smeltingTuyereCountDisplay = smeltingTuyereCountOverridden
    ? smeltingTuyereCount || String(Math.max(0, Math.round(toNumber(smeltingTuyereCountOneSide, 0)) * 2))
    : String(smeltingDesign.jacketCountTotal)
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
        mainOutput: '白铜锍',
        outputThroughput: matteMass,
        note: '由配料总表混料行折算',
      },
      {
        id: 'converting',
        stage: '吹炼',
        basis: '白铜锍处理量',
        currentThroughput: matteMass,
        mainOutput: '粗铜',
        outputThroughput: matteCopper,
        note: '承接熔炼白铜锍产出',
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
  const activeEquipmentStageId = equipmentStageIdForSheet(activeSheet)
  const activeEquipmentRows = activeEquipmentStageId
    ? equipmentSizingRows.filter((row) => row.id === activeEquipmentStageId)
    : equipmentSizingRows
  const activeEquipmentRow = activeEquipmentRows[0] ?? null
  const previousStageBeforeCurrent = previousCopperCaseStageId(activeSheet)
  const nextStageAfterCurrent = nextCopperCaseStageId(activeSheet)
  const heatBalanceTableReady = Boolean(calculatedHeatBalance)
  const processPageComplete = Boolean(
    productCalculated &&
      productFilledBack &&
      hasStoredProductResult &&
      heatBalanced &&
      heatBalanceFilledBack &&
      calculatedHeatBalance
  )
  const activeEquipmentModelReady = activeEquipmentStageId ? equipmentModelGenerated[activeEquipmentStageId] : false
  const activeEquipmentBomGenerated = activeEquipmentStageId ? equipmentBomGenerated[activeEquipmentStageId] : false
  const activeEquipmentBomItems = activeEquipmentRow
    ? buildCopperEquipmentBom(
        activeEquipmentStageId,
        activeEquipmentRow,
        targetScaleValue,
        activeEquipmentStageId ? toNumber(equipmentDimensionAdjustments[activeEquipmentStageId], 1) : 1,
        activeEquipmentStageId === 'smelting' ? smeltingDesign : null
      )
    : []
  const activeEquipmentBomReady = activeEquipmentBomGenerated && activeEquipmentBomItems.length > 0

  useEffect(() => {
    if (activeSheet !== 'cu_smelting_equipment') return
    if (!smeltingDailyFeedOverridden) {
      setSmeltingDailyFeedTd(formatTableNumber(smeltingDefaultDailyFeedTd))
    }
    if (!smeltingAnnualFeedOverridden) {
      setSmeltingAnnualFeedTa(formatTableNumber(smeltingDefaultAnnualFeedTa))
    }
    if (!smeltingOxygenOverridden) {
      setSmeltingOxygenNm3h(formatTableNumber(smeltingDefaultOxygenNm3h))
    }
    if (smeltingDimensionDrive === 'width') {
      setSmeltingFurnaceLengthM(formatTableNumber(smeltingDesign.furnaceLengthM))
    } else {
      setSmeltingFurnaceWidthM(formatTableNumber(smeltingDesign.furnaceWidthM))
    }
    if (!smeltingTuyereCountOverridden) {
      setSmeltingTuyereCountOneSide(String(smeltingDesign.jacketCountOneSide))
      setSmeltingTuyereCount(String(smeltingDesign.jacketCountTotal))
    }
    setSmeltingTuyereOxygenNm3h(formatTableNumber(smeltingDesign.tuyereOxygenNm3h))
  }, [
    activeSheet,
    smeltingDailyFeedOverridden,
    smeltingDefaultDailyFeedTd,
    smeltingAnnualFeedOverridden,
    smeltingDefaultAnnualFeedTa,
    smeltingOxygenOverridden,
    smeltingDefaultOxygenNm3h,
    smeltingDimensionDrive,
    smeltingDesign.furnaceLengthM,
    smeltingDesign.furnaceWidthM,
    smeltingDesign.jacketCountOneSide,
    smeltingDesign.jacketCountTotal,
    smeltingDesign.tuyereOxygenNm3h,
    smeltingTuyereCountOverridden,
  ])

  const exportProfile = copperStageExportProfile(activeProcessStageId)

  const buildReportMaterialData = () => {
    const materialTotal = (material: CopperMaterialColumn | CopperFuelMaterial) =>
      calculateKnownTotal(material.ratios) + (material.ratios['Other(其他)'] ?? 0)
    const exportedFuelColumns = exportProfile.includeFuel ? [fuelColumn] : []
    const materials: CopperReportMaterial[] = [
      ...rawMaterials.map((material, index) => ({
        header: isMixOtherMaterial(material) ? '其他' : `原料${index + 1}`,
        name: displayRawMaterialName(material.name),
        dryWeightTh: material.weight,
        waterWeightTh: materialWaterWeight(material),
        composition: material.ratios,
        compositionTotal: materialTotal(material),
      })),
      ...solventColumns.map((material, index) => ({
        header: `熔剂${index + 1}`,
        name: displaySolventName(material.name),
        dryWeightTh: material.weight,
        waterWeightTh: materialWaterWeight(material),
        composition: material.ratios,
        compositionTotal: materialTotal(material),
      })),
      ...exportedFuelColumns.map((material) => ({
        header: '燃料煤',
        name: displayFuelName(material.name),
        dryWeightTh: material.weight,
        waterWeightTh: materialWaterWeight(material),
        composition: material.ratios,
        compositionTotal: materialTotal(material),
      })),
      ...airColumns.map((column) => ({
        header: '气',
        name: column.name,
        dryWeightTh: column.weight,
        waterWeightTh: materialWaterWeight(column),
        composition: column.ratios,
        compositionTotal: materialTotal(column),
      })),
    ]
    const elements = batchExportElementKeys.map((element) => ({
      key: element,
      label: elementSymbolLabel(element),
    }))
    const blend = {
      dryWeightTh: furnaceFeed.totalWeight - furnaceBlendWaterWeight,
      waterWeightTh: furnaceBlendWaterWeight,
      composition: furnaceDryFeed.ratios,
      compositionTotal: calculateKnownTotal(furnaceDryFeed.ratios) + (furnaceDryFeed.ratios['Other(其他)'] ?? 0),
    }
    return { materials, elements, blend }
  }

  const buildCalculationExportTable = () => {
    const reportData = buildReportMaterialData()
    return buildInputMaterialElementSheet({
      ...reportData,
      format: formatTableNumber,
      summaryName: inputSummaryColumn?.subHeader ?? inputSummaryColumn?.header,
      includeSummary: exportProfile.includeInputSummary,
    })
  }

  const buildElementBalanceExportTable = () => {
    const reportData = buildReportMaterialData()
    return buildElementBalanceSheet({
      inputs: reportData.materials,
      outputs: outputProductElementRows.map((product) => ({
        productKey: product.key,
        name: product.name,
        massTh: productFilledBack ? product.mass : 0,
        composition: product.composition,
      })),
      elements: reportData.elements,
      format: formatTableNumber,
    })
  }

  const buildReportInputPhaseColumns = (): PhaseTableColumn[] => {
    const reportAirPhaseColumns = airColumns.map((column): PhaseTableColumn => {
      const existing = inputPhaseColumnData.find(
        (phaseColumn) => phaseColumn.kind === 'oxygen' && phaseColumn.id === column.id
      )
      if (existing) return existing
      const waterWeight = materialWaterWeight(column)
      const dryReference = column.weight > 0 ? column.weight : 100
      const waterReference = column.weight > 0
        ? waterWeight
        : dryReference * Math.max(0, column.moisture ?? 0) / 100
      return {
        id: column.id,
        kind: 'oxygen',
        header: '气',
        subHeader: column.name,
        weight: column.weight,
        waterWeight,
        moisture: column.moisture ?? 0,
        oxygenAir: buildOxygenAirPhaseColumn(column.ratios, dryReference, waterReference),
      }
    })
    return [
      ...inputPhaseColumnData.filter((column) => column.kind !== 'blend' && column.kind !== 'oxygen'),
      ...reportAirPhaseColumns,
    ].filter((column) => column.weight > 0 && column.subHeader.trim())
  }

  const buildPhaseExportTable = () => {
    const inputPhaseColumns = buildReportInputPhaseColumns()
    const inputColumns: CopperBatchExportColumn[] = inputPhaseColumns.map((column) => ({
      header: column.header,
      subHeader: column.subHeader,
    }))
    const gasInputRowKeys = ['O2', 'N2', 'H2O'].filter((key) =>
      inputPhaseColumns.some((column) => column.kind === 'oxygen' && getPhaseExportValue(column, key) !== '')
    )
    const inputRowKeys = [...new Set([...gasInputRowKeys, ...phaseTableRowKeys.filter((key) =>
      inputPhaseColumns.some((column) => {
        if (column.kind === 'product') return false
        if (key === 'O2' || key === 'N2' || key === 'H2O') return column.kind === 'oxygen'
        return column.kind !== 'oxygen' && getPhaseExportValue(column, key) !== ''
      })
    )])]
    const phaseMass = (column: PhaseTableColumn, key: string) => {
      const percentage = phaseTableColumnPhaseValue(column, key)
      if (percentage == null) return null
      const basisWeight = column.kind === 'oxygen'
        ? column.weight + (column.waterWeight ?? 0)
        : column.weight
      return basisWeight * percentage / 100
    }
    const inputRows: CopperBatchExportRow[] = [
      {
        label: '投入量（湿基）',
        values: inputPhaseColumns.map((column) =>
          formatTableNumber(column.weight + (column.waterWeight ?? 0))
        ),
      },
      ...inputRowKeys.map((key) => ({
        label: phaseStorageKeyToDisplayLabel(key),
        values: inputPhaseColumns.map((column) => {
          const value = phaseMass(column, key)
          return value == null ? '' : formatTableNumber(value)
        }),
      })),
      {
        label: '游离水（固体含水）',
        values: inputPhaseColumns.map((column) =>
          column.kind !== 'oxygen' && (column.waterWeight ?? 0) > 0
            ? formatTableNumber(column.waterWeight ?? 0)
            : ''
        ),
      },
      {
        label: '合计',
        values: inputPhaseColumns.map((column) => {
          if (column.phaseReady === false) return ''
          const phaseTotal = inputRowKeys.reduce((sum, key) => sum + (phaseMass(column, key) ?? 0), 0)
          const freeWater = column.kind === 'oxygen' ? 0 : (column.waterWeight ?? 0)
          return formatTableNumber(phaseTotal + freeWater)
        }),
        role: 'total',
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
        productKey: column.productKey,
        phaseRowKeys: column.productPhaseRowKeys,
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
      inputSheet: {
        title: '投入物相质量流量表',
        columns: inputColumns,
        rows: inputRows,
        unitNote: '物料及物相质量 t/h',
        rowHeaderLabel: '物相',
        columnWidthWeights: [1.65, ...inputColumns.map(() => 1)],
        reportDensity: inputColumns.length > 10 || inputRows.length > 24 ? 'compact' : 'normal',
      },
      outputSheet: {
        title: '产出-产物物相表',
        columns: outputColumns,
        rows: outputRows,
        unitNote: '流量 t/h；物相组成 w%',
        rowHeaderLabel: '产物名称',
        columnWidthWeights: [1.8, 0.9, ...outputPhaseRowKeys.map(() => 1), 0.9],
        reportDensity: outputColumns.length > 10 || outputRows.length > 24 ? 'compact' : 'normal',
      },
    } satisfies { inputSheet: CopperBatchWorkbookSheet; outputSheet: CopperBatchWorkbookSheet }
  }

  const buildBlendResultExportSheets = (): CopperBatchWorkbookSheet[] => {
    const dryWeight = concentrateMass
    const waterWeight = rawConcentrateWaterWeight
    const activeInputPhaseColumns = buildReportInputPhaseColumns()
    const gasInputRowKeys = ['O2', 'N2', 'H2O'].filter((key) =>
      activeInputPhaseColumns.some((column) => getPhaseExportValue(column, key) !== '')
    )
    const inputPhaseRowKeys = [...new Set([
      ...gasInputRowKeys,
      ...phaseTableRowKeys.filter((key) =>
        activeInputPhaseColumns.some((column) => getPhaseExportValue(column, key) !== '')
      ),
    ])]
    const rawPhaseColumns = activeInputPhaseColumns.filter((column) => column.kind === 'raw')
    const blendRowKeys = phaseTableRowKeys.filter((key) =>
      rawPhaseColumns.some((column) => getPhaseExportValue(column, key) !== '')
    )
    const inputPhaseSheet = buildInputMaterialPhaseSheet({
      materials: activeInputPhaseColumns.map((column) => ({
        header: column.header,
        name: column.subHeader || column.header,
        dryWeightTh: column.weight,
        waterWeightTh: column.waterWeight ?? 0,
        phaseValues: Object.fromEntries(
          inputPhaseRowKeys.map((key) => [key, getPhaseExportValue(column, key)])
        ),
        compositionTotal:
          column.phaseReady === false ? '' : formatTableNumber(phaseExportColumnTotal(column)),
      })),
      phases: inputPhaseRowKeys.map((key) => ({
        key,
        label: phaseStorageKeyToDisplayLabel(key),
      })),
      format: formatTableNumber,
    })
    const weightedBlendPhaseValue = (key: string) => {
      if (dryWeight <= 0) return ''
      let sum = 0
      for (const column of rawPhaseColumns) {
        const value = phaseTableColumnPhaseValue(column, key)
        if (value != null) sum += column.weight * value
      }
      return formatTableNumber(sum / dryWeight)
    }
    const summaryLabel = inputSummaryColumn?.header || inputSummaryColumn?.subHeader || ''
    const phaseSheet: CopperBatchWorkbookSheet = {
      title: `${summaryLabel}结果-物相表`,
      columns: [{
        header: inputSummaryColumn?.header ?? '',
        subHeader: inputSummaryColumn?.subHeader ?? inputSummaryColumn?.header ?? '',
      }],
      rows: [
        { label: 't/h（干基）', values: [formatTableNumber(dryWeight)] },
        { label: '含水 t/h', values: [formatTableNumber(waterWeight)] },
        ...blendRowKeys.map((key) => ({
          label: phaseStorageKeyToDisplayLabel(key),
          values: [weightedBlendPhaseValue(key)],
        })),
        {
          label: '合计',
          values: [dryWeight > 0 ? '100' : ''],
          role: 'total',
        },
      ],
      unitNote: 'w%（干基；投料量按行内 t/h）',
      rowHeaderLabel: '项目',
      columnWidthWeights: [1.65, 1.2],
    }
    return [inputPhaseSheet, phaseSheet]
  }

  const buildProductElementExportTable = (): CopperBatchWorkbookSheet => {
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
    return {
      title: '产出-产物元素表',
      columns,
      rows,
      unitNote: '流量 t/h；元素组成 w%',
      rowHeaderLabel: '产物名称',
      columnWidthWeights: [1.8, 0.9, ...outputProductElementKeys.map(() => 1), 0.9],
      reportDensity: columns.length > 10 || rows.length > 24 ? 'compact' : 'normal',
    }
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
      const inputColumn = inputPhaseColumnData.find((column) => column.id === columnId)
      const o2Text = drafts.O2 ?? ''
      const n2Text = drafts.N2 ?? ''
      const h2oText = drafts.H2O ?? ''
      const currentO2 = inputColumn?.oxygenAir?.weightPct.O2 ?? airColumn.ratios['O(氧)'] ?? 0
      const currentN2 = inputColumn?.oxygenAir?.weightPct.N2 ?? airColumn.ratios['N(氮)'] ?? 0
      const currentH2O = inputColumn?.oxygenAir?.weightPct.H2O ?? 0
      const o2Wet = o2Text.trim() === '' ? currentO2 : toNumber(o2Text, 0)
      const n2Wet = n2Text.trim() === '' ? currentN2 : toNumber(n2Text, 0)
      const h2oWet = h2oText.trim() === '' ? currentH2O : toNumber(h2oText, 0)
      if (activeProcessStageId === 'cu_converting' || h2oText.trim() !== '') {
        if (Math.abs(o2Wet + n2Wet + h2oWet - 100) > 0.02) {
          setInvalidInputPhaseColumns((prev) => ({ ...prev, [columnId]: true }))
          setWorkflowMessage(`${airColumn.name}物相 O₂/N₂/H₂O 合计须为 100%。`, 'error')
          return
        }
        const dry = o2Wet + n2Wet
        const o2 = dry > 1e-12 ? (o2Wet / dry) * 100 : 0
        const n2 = dry > 1e-12 ? (n2Wet / dry) * 100 : 0
        const moisture = dry > 1e-12 ? (h2oWet / dry) * 100 : 0
        const nextWeight = Math.max(0, airColumn.weight)
        const nextWater = (nextWeight * moisture) / 100
        setInvalidInputPhaseColumns((prev) => ({ ...prev, [columnId]: false }))
        const nextRatios = normalizeMaterialRatios({ ...airColumn.ratios, 'O(氧)': o2, 'N(氮)': n2 })
        updateAirColumn(columnId, {
          ratios: nextRatios,
          moisture,
          waterWeight: nextWater,
        })
        if (airColumn.airRole === 'oxygen') {
          setOxygenAirO2Pct(formatTableNumber(o2))
          setOxygenAirN2Pct(formatTableNumber(n2))
        }
        setPhaseRatioOverrides((prev) => ({
          ...prev,
          [columnId]: {
            O2: formatTableNumber(o2Wet),
            N2: formatTableNumber(n2Wet),
            H2O: formatTableNumber(h2oWet),
          },
        }))
        setManualPhaseRatioColumns((prev) => ({ ...prev, [columnId]: true }))
        setInputPhaseDrafts((prev) => {
          const next = { ...prev }
          delete next[columnId]
          return next
        })
        setWorkflowMessage(`已按物相 w% 同步${airColumn.name} O/N/H₂O 组成。`, 'success')
        return
      }
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

    if (activeProcessStageId === 'cu_converting') {
      const rawMaterial = rawMaterials.find((material) => material.id === columnId)
      const solventMaterial = solventColumns.find((material) => material.id === columnId)
      const material = rawMaterial ?? solventMaterial
      if (material) {
        if (material.id === CONVERTING_WHITE_MATTE_ID) {
          setInputPhaseDrafts((prev) => {
            const next = { ...prev }
            delete next[columnId]
            return next
          })
          setWorkflowMessage('白铜锍物相由熔炼同步，吹炼侧不可编辑。', 'warning')
          return
        }
        const rows = ensureMaterialPhaseRows(materialPhaseRows[material.id], material)
        const keys = materialPhaseRowTableKeys(rows)
        const current =
          phaseBatchResults?.[material.id]?.valid
            ? mapPhaseContentsToTableKeys(phaseBatchResults[material.id]!.phaseContents, rows)
            : {}
        const phasePctByTableKey: Record<string, number> = {}
        for (const key of keys) {
          const textValue = drafts[key]
          const fallback = current[key] ?? 0
          phasePctByTableKey[key] =
            textValue != null && textValue !== '' ? toNumber(textValue, 0) : fallback
        }
        for (const [key, textValue] of Object.entries(drafts)) {
          if (key in phasePctByTableKey) continue
          if (textValue != null && textValue !== '') phasePctByTableKey[key] = toNumber(textValue, 0)
        }
        const synced = syncConvertingMaterialFromPhases({
          material,
          rows,
          phasePctByTableKey,
          status: phaseBatchResults?.[material.id]?.status ?? 'converting-default',
        })
        if (!synced.result.valid) {
          setInvalidInputPhaseColumns((prev) => ({ ...prev, [columnId]: true }))
          setWorkflowMessage(
            `${displayRawMaterialName(material.name)} 物相合计须为 100%（当前 ${formatTableNumber(synced.phaseSum)}%）。`,
            'error'
          )
          return
        }
        setInvalidInputPhaseColumns((prev) => ({ ...prev, [columnId]: false }))
        setMaterialPhaseRows((prev) => ({ ...prev, [material.id]: synced.rows }))
        setPhaseBatchResults((prev) => ({
          ...(prev ?? {}),
          [material.id]: synced.result,
        }))
        if (rawMaterial) {
          updateRawMaterial(material.id, { ratios: synced.material.ratios })
        } else {
          updateSolventColumn(material.id, { ratios: synced.material.ratios })
        }
        setPhaseCompletedMaterials((prev) => ({ ...prev, [material.id]: true }))
        setInputPhaseDrafts((prev) => {
          const next = { ...prev }
          delete next[columnId]
          return next
        })
        setWorkflowMessage(
          `已按物相 w% 同步 ${displayRawMaterialName(material.name)} 元素组成。`,
          'success'
        )
        return
      }
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
      setHeatBalanceFilledBack(false)
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
    resetHeatBalanceCalculation()
    setOutputPhaseDrafts((prev) => {
      const next = { ...prev }
      delete next[columnId]
      return next
    })
    setWorkflowMessage('已按产出物相 w% 同步产物元素组成；如需完整刷新请重新计算产出。', 'success')
  }

  const exportCalculationTable = () => {
    setShowBatchExportDialog(true)
  }

  const batchExportGroupOptions = useMemo((): CopperBatchExportGroupOption[] => {
    const hasMaterialPhase = Boolean(
      phaseBatchResults && Object.values(phaseBatchResults).some((result) => result?.valid)
    )
    const hasBlendResult =
      exportProfile.includeBlendResult && rawMaterials.some((material) => material.name.trim() && material.weight > 0)
    const hasElement = rawMaterials.some((material) => material.name.trim())
    const hasInputPhase = inputPhaseColumnData.some((column) => column.kind !== 'blend')
    const inputSheetKeys: CopperBatchExportSheetKey[] = []
    if (hasElement) inputSheetKeys.push('element')
    if (hasMaterialPhase) inputSheetKeys.push('materialPhase')
    if (hasInputPhase) inputSheetKeys.push('inputPhase')
    if (hasBlendResult) inputSheetKeys.push('blendResult')

    const hasHeatBalance = Boolean(calculatedHeatBalance)

    return [
      {
        key: 'input',
        label: '投入计算表',
        description: exportProfile.includeBlendResult
          ? '物料元素组成、原料物相成分、投入物相质量与组成及混料汇总'
          : '物料元素组成、原料物相成分及投入物相质量',
        available: inputSheetKeys.length > 0,
        sheetKeys: inputSheetKeys,
      },
      {
        key: 'output',
        label: '产出计算结果',
        description: '产物物相表与产物元素表',
        available: productFilledBack,
        sheetKeys: productFilledBack ? ['outputPhase', 'outputElement'] : [],
      },
      {
        key: 'heatBalance',
        label: '热平衡计算结果',
        description: '热收入、热支出及相关热平衡表',
        available: hasHeatBalance,
        sheetKeys: hasHeatBalance ? ['heatBalance'] : [],
      },
    ]
  }, [
    calculatedHeatBalance,
    heatBalanceFilledBack,
    inputPhaseColumnData,
    phaseBatchResults,
    productFilledBack,
    rawMaterials,
    exportProfile,
  ])

  const buildMaterialPhaseExportSheets = useCallback((): CopperBatchWorkbookSheet[] => {
    if (!phaseBatchResults) return []
    return rawMaterials.flatMap((material) => {
      const result = phaseBatchResults[material.id]
      if (!result?.valid || !material.name.trim()) return []
      const rows = ensureMaterialPhaseRows(materialPhaseRows[material.id])
      const preview = buildPhasePreviewUnknowns(material.id, result)
      const pivotRows = buildPhasePivotRows(
        sortMaterialPhaseRows(rows),
        preview.phaseContents,
        material.weight
      )
      const pivotTotals = sumPhasePivotTotals(pivotRows)
      const pivotDisplayTotals = decomposePhaseElementMasses(pivotTotals.elements, phaseElementView)
      const materialName = displayRawMaterialName(material.name)
      const columns: CopperBatchExportColumn[] = [
        { header: 'w%', subHeader: 'w%' },
        ...phaseTableColumnKeys.map((element) => ({
          header: phaseTableHeaderLabel(element, phaseElementView),
          subHeader: phaseTableHeaderLabel(element, phaseElementView),
        })),
      ]
      const exportRows: CopperBatchExportRow[] = sortMaterialPhaseRows(rows).map((row) => {
        const pivot = pivotRows.find((item) => item.rowId === row.id)
        const phasePercent = pivot?.phasePercent ?? null
        const rowElementDisplay = pivot?.elements
          ? decomposePhaseElementMasses(pivot.elements, phaseElementView)
          : {}
        const label = row.kind === 'draft' ? row.formula.trim() || '待填物相' : row.displayLabel
        const showValues = material.weight > 0 && phasePercent != null && phasePercent > 0
        return {
          label,
          values: [
            showValues ? formatTableNumber(phasePercent ?? 0) : '',
            ...phaseTableColumnKeys.map((element) =>
              showValues
                ? formatTableNumber(massThToWeightPercent(rowElementDisplay[element] ?? 0, material.weight))
                : ''
            ),
          ],
        }
      })
      exportRows.push({
        label: '合计',
        values: [
          formatTableNumber(pivotTotals.phaseTotal),
          ...phaseTableColumnKeys.map((element) =>
            material.weight > 0
              ? formatTableNumber(massThToWeightPercent(pivotDisplayTotals[element] ?? 0, material.weight))
              : ''
          ),
        ],
      })
      return [{
        title: `物相成分 ${materialName}`,
        columns,
        rows: exportRows,
        unitNote: 'w%（干基）',
        rowHeaderLabel: '物相名称',
        columnWidthWeights: [2, 0.8, ...phaseTableColumnKeys.map(() => 1)],
        reportDensity: columns.length > 10 || exportRows.length > 24 ? 'compact' : 'normal',
      }]
    })
  }, [materialPhaseRows, phaseBatchResults, phaseElementView, phaseTableColumnKeys, rawMaterials])

  const buildFloPatchResult = useCallback(
    (templateBuffer: ArrayBuffer) => {
      const payloadFromState = (
        stageId: 'smelting' | 'converting',
        state: CopperProcessStageState
      ): CopperMetcalFloStagePayload | null => {
        if (!isProcessStageProductReady(state) || !state.productSolverResult) return null
        return {
          stageId,
          rawMaterials: state.rawMaterials,
          solventColumns: state.solventColumns,
          fuelColumn: state.fuelColumn,
          airColumns: state.airColumns,
          phaseBatchResults: state.phaseBatchResults,
          materialPhaseRows: state.materialPhaseRows,
          constraintConfig:
            state.productConstraintConfig ??
            (stageId === 'converting'
              ? loadOxyConvertingConstraints()
              : loadOxySideBlowConstraints()),
          productResult: state.productSolverResult,
        }
      }
      const currentStageId = activeProcessStageId === 'cu_converting' ? 'converting' : 'smelting'
      const currentPayload: CopperMetcalFloStagePayload | null =
        productCalculated && productFilledBack && oxySolverResult?.acceptable
          ? {
              stageId: currentStageId,
              rawMaterials,
              solventColumns,
              fuelColumn,
              airColumns,
              phaseBatchResults,
              materialPhaseRows,
              constraintConfig: productConstraintConfig,
              productResult: oxySolverResult,
            }
          : null
      const payloadFor = (stageId: 'smelting' | 'converting') => {
        if (stageId === currentStageId) return currentPayload
        return payloadFromState(
          stageId,
          processStagesCacheRef.current[stageId === 'smelting' ? 'cu_smelting' : 'cu_converting'] ??
            createProcessStageStateForId(stageId === 'smelting' ? 'cu_smelting' : 'cu_converting')
        )
      }
      const stages = [payloadFor('smelting'), payloadFor('converting')].filter(
        (stage): stage is CopperMetcalFloStagePayload => Boolean(stage)
      )
      return patchCopperMetcalFloCase(templateBuffer, { stages })
    },
    [
      activeProcessStageId,
      airColumns,
      fuelColumn,
      materialPhaseRows,
      oxySolverResult,
      phaseBatchResults,
      productCalculated,
      productConstraintConfig,
      productFilledBack,
      rawMaterials,
      solventColumns,
    ]
  )

  const confirmBatchExport = useCallback(
    async (selection: CopperBatchExportSelection) => {
      setShowBatchExportDialog(false)
      const buildSheets = (selectedKeys: CopperBatchExportSheetKey[]) => {
        const stageSheetKeys = copperStageExportSheetKeys(activeProcessStageId, selectedKeys)
        const sheets: CopperBatchWorkbookSheet[] = []
        if (stageSheetKeys.includes('element')) {
          sheets.push(buildCalculationExportTable())
        }
        if (stageSheetKeys.includes('materialPhase')) sheets.push(...buildMaterialPhaseExportSheets())
        const phaseTables = buildPhaseExportTable()
        if (stageSheetKeys.includes('inputPhase')) sheets.push(phaseTables.inputSheet)
        if (stageSheetKeys.includes('blendResult')) sheets.push(...buildBlendResultExportSheets())
        if (stageSheetKeys.includes('outputPhase')) sheets.push(phaseTables.outputSheet)
        if (stageSheetKeys.includes('outputElement')) sheets.push(buildProductElementExportTable())
        if (stageSheetKeys.includes('heatBalance') && calculatedHeatBalance) {
          sheets.push(...buildHeatBalanceExportSheets(calculatedHeatBalance))
        }
        if (stageSheetKeys.includes('element') && stageSheetKeys.includes('outputElement')) {
          const balanceSheet = buildElementBalanceExportTable()
          if (balanceSheet) sheets.unshift(balanceSheet)
        }
        return sheets
      }

      const allSheetKeys = batchExportGroupOptions.flatMap((option) => option.sheetKeys)
      const selectedSheets = selection.excel ? buildSheets(selection.sheetKeys) : []
      const processSheets = selection.processText ? buildSheets(allSheetKeys) : []
      if (selection.excel && selectedSheets.length === 0 && !selection.processText && !selection.flo) {
        setWorkflowMessage('请至少选择一项可导出的表格。', 'flow')
        return
      }

      try {
        const caseName = activeCase?.name ?? formatCopperCaseName(new Date(), smeltMethodName)
        const exportBaseName = buildCopperBatchExportBaseName({ stageName: activeStage.name, caseName })
        const files: CopperExportBundleFile[] = []
        let floNotice = ''
        if (selection.excel && selectedSheets.length > 0) {
          const { buildCopperBatchWorkbookXlsx } = await import('../../../../utils/copperBatchExportXlsx')
          files.push({
            fileName: `${exportBaseName}_计算结果.xlsx`,
            content: await buildCopperBatchWorkbookXlsx(selectedSheets, { stageName: activeStage.name }),
          })
        }
        if (selection.processText && processSheets.length > 0) {
          files.push({
            fileName: `${exportBaseName}_冶金计算报告.docx`,
            content: await buildCopperProcessTextExportDocx(
              { caseName, stageName: activeStage.name, methodName: smeltMethodName },
              processSheets
            ),
          })
        }
        if (selection.flo) {
          const patchResult = buildFloPatchResult(await loadDefaultCopperFloTemplate())
          files.push({ fileName: `${exportBaseName}_MetCal流程.flo`, content: patchResult.buffer })
          floNotice = patchResult.warnings.slice(0, 2).join('；')
        }
        if (files.length === 0) {
          setWorkflowMessage('没有可导出的文件。', 'flow')
          return
        }
        const saveResult = await saveCopperExportBundle(exportBaseName, files)
        if (!saveResult.ok) {
          if (!saveResult.cancelled && saveResult.error) {
            setWorkflowMessage(`导出失败：${saveResult.error}`, 'error')
          }
          return
        }
        const formats = [
          selection.excel && selectedSheets.length > 0 ? 'Excel文件' : '',
          selection.processText && processSheets.length > 0 ? '工艺计算文件' : '',
          selection.flo ? 'Flo文件' : '',
        ].filter(Boolean)
        setWorkflowMessage(
          `已导出 ${formats.join('、')} 至：${saveResult.folderPath}。${floNotice}`,
          floNotice ? 'flow' : 'success'
        )
      } catch (error) {
        setWorkflowMessage(`导出失败：${error instanceof Error ? error.message : String(error)}`, 'error')
      }
    },
    [
      activeCase?.name,
      activeStage.name,
      batchExportGroupOptions,
      buildFloPatchResult,
      buildMaterialPhaseExportSheets,
      calculatedHeatBalance,
      smeltMethodName,
    ]
  )

  const activePhasePreview = (() => {
    if (!selectedPhaseMaterial) return null
    if (phasePreviewUnknowns?.materialId === selectedPhaseMaterial.id) {
      return phasePreviewUnknowns
    }
    if (!phaseCompletedMaterials[selectedPhaseMaterial.id]) return null
    const batchResult = phaseBatchResults?.[selectedPhaseMaterial.id]
    return batchResult?.valid ? buildPhasePreviewUnknowns(selectedPhaseMaterial.id, batchResult) : null
  })()

  const activeMaterialPhaseRows = selectedPhaseMaterial
    ? ensureMaterialPhaseRows(materialPhaseRows[selectedPhaseMaterial.id])
    : []

  const selectedPhaseLocked = Boolean(
    selectedPhaseMaterial &&
      phaseCompletedMaterials[selectedPhaseMaterial.id]
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
          status: phaseSheetTabStatus(material.id, material, phaseCompletedMaterials, phaseBatchResults),
        },
      ]
    })
  }, [phaseAssistTabMaterialIds, phaseBatchResults, phaseCompletedMaterials, phaseMaterialId, rawMaterials])

  const updateRawMaterial = (
    id: string,
    patch: Partial<CopperMaterialColumn>,
    options: { preservePhaseCompletion?: boolean } = {}
  ) => {
    setRawMaterials((prev) => prev.map((material) => (material.id === id ? { ...material, ...patch } : material)))
    setSolventSolution(null)
    resetProductCalculation()
    setHeatBalanced(false)
    setHeatBalanceFilledBack(false)
    if (!options.preservePhaseCompletion) {
      setPhaseCompleted(false)
      setPhaseCompletedMaterials((prev) => ({ ...prev, [id]: false }))
      setPhasePreviewUnknowns((prev) => (prev?.materialId === id ? null : prev))
      setPhaseBatchResults((prev) => dropPhaseBatchResult(prev, id))
    }
  }

  const invalidateMaterialPhaseCalculation = (id: string) => {
    if (batchPhaseTimerRef.current != null) {
      window.clearTimeout(batchPhaseTimerRef.current)
      batchPhaseTimerRef.current = null
    }
    setPhaseCompleted(false)
    setPhaseCompletedMaterials((prev) => ({ ...prev, [id]: false }))
    setPhasePreviewUnknowns((prev) => (prev?.materialId === id ? null : prev))
    setPhaseBatchResults((prev) => dropPhaseBatchResult(prev, id))
  }

  const updateAirColumn = (id: string, patch: Partial<CopperMaterialColumn>) => {
    setAirColumns((prev) => prev.map((column) => (column.id === id ? { ...column, ...patch } : column)))
    resetProductCalculation()
    setHeatBalanced(false)
    setHeatBalanceFilledBack(false)
  }

  const updateRawWeight = (id: string, value: string) => {
    if (!isEditableNumberDraft(value)) return
    setRawWeightDrafts((prev) => ({ ...prev, [id]: value }))
    const nextWeight = isValidNumberText(value) ? toNumber(value, 0) : 0
    const current = rawMaterials.find((material) => material.id === id)
    const waterWeight = current ? materialWaterWeight(current) : 0
    updateRawMaterial(id, syncMaterialMoistureFromWater({ weight: nextWeight, waterWeight }))
    if (activeProcessStageId === 'cu_converting') {
      const preserved = phaseBatchResults?.[id]
      if (preserved?.valid) {
        setPhaseBatchResults((prev) => ({
          ...(prev ?? {}),
          [id]: { ...preserved, weight: nextWeight, materialName: current?.name ?? preserved.materialName },
        }))
        if (nextWeight > 0) {
          setPhaseCompletedMaterials((prev) => ({ ...prev, [id]: true }))
        }
        return
      }
    }
    if (nextWeight <= 0) {
      invalidateMaterialPhaseCalculation(id)
      return
    }
  }

  const updateSolventColumn = (id: string, patch: Partial<CopperMaterialColumn>) => {
    setSolventColumns((prev) => prev.map((material) => (material.id === id ? { ...material, ...patch } : material)))
    setSolventSolution(null)
    resetProductCalculation()
    setHeatBalanced(false)
    setHeatBalanceFilledBack(false)
  }

  const updateFuelColumn = (
    patch: Partial<CopperFuelMaterial>,
    options: { preserveProductCalculation?: boolean; syncFuelRatioConstraint?: boolean } = {}
  ) => {
    const previousWeight = fuelColumn.weight
    setFuelColumn((prev) => ({ ...prev, ...patch }))
    resetHeatBalanceCalculation()
    setManualFuelWeightValid(false)
    if (patch.weight !== undefined && Math.abs(patch.weight - previousWeight) > 1e-9) {
      if (!options.preserveProductCalculation) resetProductCalculation()
      // 产出/热平衡回填只写煤量展示，不改「煤/精矿比」工艺约束，否则下次重算会用被污染的煤率派生煤量
      if (options.syncFuelRatioConstraint !== false) {
        setProductConstraintConfig((prev) => {
          const next = productConstraintConfigWithFuelDryMass(prev, patch.weight!, concentrateMass)
          syncProcessParametersFromConfig(next)
          return next
        })
      }
      if (!options.preserveProductCalculation) setWorkflowMessage(
        workflowStepMessage(6, '煤量已修改，产出计算结果已清除；请重新计算产出与热平衡。'),
        'warning'
      )
    }
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
        invalidateMaterialPhaseCalculation(id)
        return
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
    const draftText = ratioDrafts[key]
    // 清空后失焦：写入 0，避免删草稿后回显旧值
    if (typeof draftText === 'string' && draftText.trim() === '') {
      if (kind === 'fuel') {
        updateFuelRatio(element, 0)
      } else if (kind === 'gas') {
        updateGasRatio(id, element, 0)
      } else {
        updateRatio(id, element, 0, kind)
      }
    }
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
    const draftText = waterWeightDrafts[key]
    if (typeof draftText === 'string' && draftText.trim() === '') {
      if (kind === 'fuel') {
        updateFuelColumn(
          syncMaterialMoistureFromWater({ weight: fuelColumn.weight, waterWeight: 0 }) as Partial<CopperFuelMaterial>
        )
      } else {
        const list = kind === 'raw' ? rawMaterials : solventColumns
        const current = list.find((material) => material.id === id)
        const patch = syncMaterialMoistureFromWater({
          weight: current?.weight ?? 0,
          waterWeight: 0,
        })
        if (kind === 'raw') updateRawMaterial(id, patch, { preservePhaseCompletion: true })
        else updateSolventColumn(id, patch)
      }
    }
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
    const nextWeight = toNumber(value, 0)
    updateSolventColumn(id, { weight: nextWeight })
    setManualSolventWeights((prev) => ({ ...prev, [id]: true }))
    if (activeProcessStageId === 'cu_converting') {
      const preserved = phaseBatchResults?.[id]
      if (preserved?.valid) {
        setPhaseBatchResults((prev) => ({
          ...(prev ?? {}),
          [id]: { ...preserved, weight: nextWeight },
        }))
        if (nextWeight > 0) {
          setPhaseCompletedMaterials((prev) => ({ ...prev, [id]: true }))
        }
      }
    }
  }

  const commitSolventWeightDraft = (id: string) => {
    const key = `solvent-weight:${id}`
    const draftText = ratioDrafts[key]
    if (typeof draftText === 'string' && draftText.trim() === '') {
      updateSolventColumn(id, { weight: 0 })
      setManualSolventWeights((prev) => ({ ...prev, [id]: true }))
    }
    setRatioDrafts((prev) => {
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
    const key = 'fuel-weight:fuel-coal'
    const draftText = ratioDrafts[key]
    if (typeof draftText === 'string' && draftText.trim() === '') {
      updateFuelColumn({ weight: 0 })
      setManualFuelWeightValid(true)
    }
    setRatioDrafts((prev) => {
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
    setManualAirWeights((prev) => ({ ...prev, [id]: true }))
    setManualAirWeightValid(true)
    resetProductCalculation()
    setHeatBalanced(false)
    setHeatBalanceFilledBack(false)
  }

  const commitAirWeightDraft = (id: string) => {
    const key = `gas-weight:${id}`
    const draftText = ratioDrafts[key]
    if (typeof draftText === 'string' && draftText.trim() === '') {
      updateAirColumn(id, { weight: 0 })
      setManualAirWeights((prev) => ({ ...prev, [id]: true }))
      setManualAirWeightValid(true)
      resetProductCalculation()
      setHeatBalanced(false)
      setHeatBalanceFilledBack(false)
    }
    setRatioDrafts((prev) => {
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
        mixGroup: 'concentrate',
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
    if (selected.category === 'flux') {
      setWorkflowMessage('熔剂请在配料表熔剂列使用；原料下拉仅选择原料/回流物料。', 'error')
      return
    }
    const sulfurError =
      selected.category === 'concentrate' ? validateRatiosSulfurRequirement(selected.ratios, selected.name) : null
    if (sulfurError) {
      setWorkflowMessage(`${sulfurError}，无法选用该原料，请先在原料库或投入-物料元素表补全 S(硫)。`, 'error')
      return
    }
    const normalizedSelection = normalizeKnownCopperRawMaterialAssay({
      id,
      name: selected.name,
      kind: 'raw',
      mixGroup: selected.category === 'return' ? 'other' : 'concentrate',
      weight: 0,
      waterWeight: 0,
      moisture: 0,
      ratios: selected.ratios,
      unitPrice: selected.unitPrice,
    })
    const normalizedRatios = normalizeMaterialRatios({ ...normalizedSelection.ratios })
    const validated = applyRawMaterialRatioTotalValidation(normalizedRatios)
    updateRawMaterial(id, {
      name: selected.name,
      mixGroup: selected.category === 'return' ? 'other' : 'concentrate',
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
    setHeatBalanceFilledBack(false)
    setPhaseCompleted(false)
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
    () => buildElementTableDisplayKeys(visibleCopperElementKeys(materialLibrary), libraryElementTableView),
    [libraryElementTableView, materialLibrary]
  )
  const libraryDisplayRatios = useCallback(
    (ratios: CopperRatios) => decomposeElementTableRatios(ratios, libraryElementTableView),
    [libraryElementTableView]
  )

  const filteredMaterialLibrary = useMemo(() => {
    const byCategory = filterLibraryByGroup(materialLibrary, libraryCategoryGroup)
    return filterMaterialLibrary(byCategory, librarySearchQuery, libraryElementFilters)
  }, [libraryCategoryGroup, libraryElementFilters, librarySearchQuery, materialLibrary])
  const rawSelectableLibrary = useMemo(
    () => materialLibrary.filter((item) => isLibraryRawCategory(item.category)),
    [materialLibrary]
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

  const updateSingleLibraryRowCategory = (id: string, value: CopperLibraryCategory | '') => {
    setLibraryDialogMessage(null)
    setSingleLibraryRows((prev) => prev.map((row) => (row.id === id ? { ...row, category: value } : row)))
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
        category: material.category,
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
    const stageDefaultCategory = defaultLibraryCategoryForStage(activeProcessStageId)

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
      const existing = materialLibrary.find((item) => item.id === editId)
      const nextCategory = resolveLibraryRowCategory(row.category, existing?.category ?? stageDefaultCategory)
      const sulfurError =
        nextCategory === 'concentrate' ? validateRatiosSulfurRequirement(row.ratios, trimmed) : null
      if (sulfurError) {
        setLibraryDialogMessage(`${sulfurError}。`)
        return
      }
      setLibraryDialogMessage(null)
      setMaterialLibrary((prev) =>
        prev.map((m) =>
          m.id === editId
            ? {
                ...m,
                name: trimmed,
                category: nextCategory,
                ratios: normalizeCopperAssayRatios(row.ratios),
              }
            : m
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
    const sulfurInvalidRow = rowsToAdd.find((row) => {
      const category = resolveLibraryRowCategory(row.category, stageDefaultCategory)
      return category === 'concentrate' ? validateRatiosSulfurRequirement(row.ratios, row.name.trim()) : null
    })
    if (sulfurInvalidRow) {
      setLibraryDialogMessage(validateRatiosSulfurRequirement(sulfurInvalidRow.ratios, sulfurInvalidRow.name.trim()))
      return
    }
    setLibraryDialogMessage(null)
    const materials = rowsToAdd.map((row, index): CopperLibraryMaterial => ({
      id: `cu-library-custom-${Date.now()}-${index}`,
      name: row.name.trim(),
      category: resolveLibraryRowCategory(row.category, stageDefaultCategory),
      ratios: normalizeCopperAssayRatios(row.ratios),
      unitPrice: 0,
    }))
    setMaterialLibrary((prev) => [...prev, ...materials])
    const rawMaterialsToAppend = materials.filter((material) => isLibraryRawCategory(material.category))
    if (rawMaterialsToAppend.length > 0) {
      setRawMaterials((prev) => [
        ...prev,
        ...rawMaterialsToAppend.map((material): CopperMaterialColumn => ({
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
        ...Object.fromEntries(rawMaterialsToAppend.map((material) => [`cu-custom-${material.id}`, ''])),
      }))
    }
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
    setHeatBalanceFilledBack(false)
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
    setHeatBalanceFilledBack(false)
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
      setWorkflowMessage(workflowStepMessage(7, '请先完成产出计算并回填到配料总表；可先在热平衡专区检查温度与热收入参数。'), 'flow')
    } else if (source === 'tab' || source === 'placeholder') {
      setWorkflowMessage(workflowStepMessage(7, '已打开热平衡计算专区，请确认温度设置后点击“热平衡计算”。'), 'flow')
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
    // 吹炼无关键参数页签：误切到 parameters 时直接进入产出约束
    if (view === 'parameters' && activeProcessStageId === 'cu_converting') {
      goToConstraintEditor()
      return
    }
    setBatchTableView(view)
    if (view === 'parameters') {
      setProcessParametersConfirmed(true)
      return
    }
    if (view === 'balance') {
      if (!heatBalanceFilledBack) openHeatBalanceWorkspace('tab')
      return
    }
    if (view === 'productPhase' || view === 'productElement') {
      if (!hasProductResult) {
        setShowProductCalculationAssist(true)
        scrollToProductCalculation()
        if (furnaceFeed.totalWeight > 0) {
          setWorkflowMessage(workflowStepMessage(6, '已打开产出计算专区，请点击“计算产出结果”。'), 'flow')
        }
      }
    }
  }

  const openElementAssist = (materialId: string) => {
    if (activeProcessStageId === 'cu_converting') {
      setWorkflowMessage('吹炼请在「投入-物料物相表」编辑物相与投料量，元素表为只读反推。', 'flow')
      setBatchTableView('phase')
      return
    }
    const material = rawMaterials.find((item) => item.id === materialId)
    if (!material) return
    const phaseError = validateMaterialForPhaseCalc(material)
    if (phaseError) {
      setWorkflowMessage(phaseMaterialValidationGuidance(material, phaseError), 'error')
      return
    }
    const weightedMaterialIds = rawMaterials.flatMap((item) => {
      if (!item.name.trim() || item.weight <= 0) return []
      // 已由熔炼带回并完成物相的白铜锍不再进入吹炼 O/C 批量物相页签
      if (
        item.id !== materialId &&
        isConvertingWhiteMattePhaseLocked(item.id, phaseCompletedMaterials, phaseBatchResults)
      ) {
        return []
      }
      return [item.id]
    })
    const nextTabMaterialIds = weightedMaterialIds.includes(materialId)
      ? weightedMaterialIds
      : [materialId, ...weightedMaterialIds]
    setMaterialPhaseRows((prev) => {
      const next = { ...prev }
      for (const id of nextTabMaterialIds) {
        const target = rawMaterials.find((item) => item.id === id)
        next[id] = ensureMaterialPhaseRows(next[id], target)
      }
      return next
    })
    setPhaseAssistTabMaterialIds(nextTabMaterialIds)
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
      setWorkflowMessage(
        workflowStepMessage(
          2,
          activeProcessStageId === 'cu_converting'
            ? '请先在配料总表填写投入投料量。'
            : '请先在配料总表填写混料投料量。'
        ),
        'flow'
      )
      scrollToCalculationTable()
      return
    }
    const cancelToken: CalculationCancelToken = { cancelled: false }
    productCalculationCancelRef.current = cancelToken
    const shouldCancel = () => isCalculationTokenCancelled(cancelToken)
    setBatchTableView('productPhase')
    resetHeatBalanceCalculation()
    setProductCalculationFailure(null)
    setProductCalculationError(null)
    setIsProductCalculating(true)
    setProductCalculationStep(0)
    setProductCalculationDetail('')
    setIsProductCalculatingCancelling(false)
    productCalculationDetailRef.current = ''
    try {
      await new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => window.setTimeout(resolve, 0))
      })
      throwIfCalculationCancelled(cancelToken)
      const advanceProductCalculationStep = async (step: number, detail = '') => {
        throwIfCalculationCancelled(cancelToken)
        setProductCalculationStep(step)
        setProductCalculationDetail(detail)
        productCalculationDetailRef.current = detail
        await new Promise<void>((resolve) => {
          window.requestAnimationFrame(() => window.setTimeout(resolve, 0))
        })
        throwIfCalculationCancelled(cancelToken)
      }
    const { concentrates: concentrateForPhase } = partitionRawMixMaterials(rawMaterials)
    const validPhaseResults = concentrateForPhase
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
      setWorkflowMessage(workflowStepMessage(3, phaseInputValidation.message ?? '投入物相未完成。'), 'error')
      scrollToCalculationTable()
      return
    }
    let solveRawMaterials = rawMaterials
    if (activeProcessStageId === 'cu_converting') {
      const smeltingCached = processStagesCacheRef.current.cu_smelting
      const syncedConverting = syncWhiteMatteFromSmelting(
        cloneProcessStageState(captureCurrentProcessStageState()),
        smeltingCached
      )
      const syncedMatte = syncedConverting.rawMaterials.find((item) => item.id === CONVERTING_WHITE_MATTE_ID)
      const currentMatte = rawMaterials.find((item) => item.id === CONVERTING_WHITE_MATTE_ID)
      solveRawMaterials = syncedConverting.rawMaterials
      if (
        syncedMatte &&
        (!currentMatte || Math.abs(syncedMatte.weight - currentMatte.weight) > 1e-6)
      ) {
        setRawMaterials(syncedConverting.rawMaterials.map(cloneMaterialColumn))
        setRawWeightDrafts({ ...syncedConverting.rawWeightDrafts })
        if (syncedConverting.phaseBatchResults) setPhaseBatchResults(syncedConverting.phaseBatchResults)
        setPhaseCompletedMaterials({ ...syncedConverting.phaseCompletedMaterials })
        processStagesCacheRef.current = {
          ...processStagesCacheRef.current,
          cu_converting: syncedConverting,
        }
      }
      const matteWarn = convertingWhiteMatteFeedWarning(
        { rawMaterials: syncedConverting.rawMaterials },
        smeltingCached
      )
      if (matteWarn && (syncedMatte?.weight ?? 0) <= 1e-9) {
        setWorkflowMessage(workflowStepMessage(6, matteWarn), 'error')
        scrollToCalculationTable()
        return
      }
      if (matteWarn) {
        setWorkflowMessage(workflowStepMessage(6, matteWarn), 'warning')
      }
      if (typeof console !== 'undefined' && console.info) {
        console.info('[converting-diag]', {
          whiteMatteWeight: syncedMatte?.weight ?? 0,
          smeltingMatteMass: smeltingCached?.productSolverResult?.products?.matte?.mass ?? 0,
          feedCu: syncedConverting.rawMaterials.reduce(
            (sum, material) =>
              sum + (Math.max(0, material.weight) * Math.max(0, material.ratios['Cu(铜)'] ?? 0)) / 100,
            0
          ),
        })
      }
    }
    const inputPhaseMass = {
      [PRODUCT_INPUT_PHASE_BLEND_NAME]: blendPhaseMass!,
    }
    await advanceProductCalculationStep(0, '正在校验投入物相与产出约束。')
    const solvedConstraintConfig = normalizeOxyConstraintConfig(
      productConstraintConfig,
      activeProcessStageId === 'cu_converting' ? 'cu_converting' : 'cu_smelting'
    )
    if (solvedConstraintConfig !== productConstraintConfig) {
      setProductConstraintConfig(solvedConstraintConfig)
    }
    const constraintValidation = validateOxyProductConstraintConfig(solvedConstraintConfig, {
      productDisplayStage: oxyProductDisplayStageForProcess(activeProcessStageId),
    })
    const constraintBlocking = firstBlockingConstraintMessage(constraintValidation)
    if (constraintBlocking) {
      setWorkflowMessage(workflowStepMessage(5, constraintBlocking), 'error')
      return
    }
    await advanceProductCalculationStep(1, '正在列举产出方程。')
    await advanceProductCalculationStep(2, '正在联动求解产物与供氧。')
    const previousSeed =
      oxySolverResult?.acceptable && productFilledBack ? oxySolverResultToSeed(oxySolverResult) : null
    const convertingRawBlend = calculateWeightedComposition(solveRawMaterials)
    const iterative = await solveOxySideBlowProductsIterative({
      rawMaterials: solveRawMaterials,
      rawFeed: activeProcessStageId === 'cu_converting' ? convertingRawBlend : rawBlend,
      concentrateMass:
        activeProcessStageId === 'cu_converting'
          ? solveRawMaterials.reduce((sum, material) => sum + Math.max(0, material.weight), 0)
          : concentrateMass,
      inputPhaseMass,
      preserveFuelInputWeight: activeProcessStageId === 'cu_converting',
      manualInputWeights: {
        fuel: manualFuelWeightValid,
        solvents: manualSolventWeights,
        gases: manualAirWeights,
      },
      fuelColumn:
        activeProcessStageId === 'cu_converting'
          ? { ...fuelColumn, weight: 0, waterWeight: 0, moisture: 0 }
          : fuelColumn,
      solventColumns,
      airColumns:
        activeProcessStageId === 'cu_converting'
          ? airColumns.filter((column) => column.airRole !== 'secondary')
          : airColumns,
      config: solvedConstraintConfig,
      shouldCancel,
      seed: previousSeed,
    })
    throwIfCalculationCancelled(cancelToken)
    // The result must be recomputed with the same recommended inputs that are
    // about to be written into the table. Otherwise the displayed input
    // boundary and the displayed product boundary can belong to different
    // solver passes.
    const settled = await solveOxySideBlowProducts({
      blendFeed: calculateWeightedComposition([
        ...solveRawMaterials,
        ...iterative.solventColumns,
        iterative.fuelColumn,
        ...iterative.airColumns,
      ]),
      rawFeed: activeProcessStageId === 'cu_converting' ? convertingRawBlend : rawBlend,
      rawMaterialColumns: solveRawMaterials,
      concentrateMass:
        activeProcessStageId === 'cu_converting'
          ? solveRawMaterials.reduce((sum, material) => sum + Math.max(0, material.weight), 0)
          : concentrateMass,
      inputPhaseMass,
      preserveFuelInputWeight: activeProcessStageId === 'cu_converting',
      manualInputWeights: {
        fuel: manualFuelWeightValid,
        solvents: manualSolventWeights,
        gases: manualAirWeights,
      },
      fuelColumn: iterative.fuelColumn,
      solventColumns: iterative.solventColumns,
      airColumns: iterative.airColumns,
      config: solvedConstraintConfig,
      shouldCancel,
      seed: iterative.result.acceptable ? oxySolverResultToSeed(iterative.result) : null,
    })
    const solverResult = settled
    const canFillBack = solverResult.acceptable
    if (!canFillBack) {
      setProductCalculationFailure(solverResult)
      setWorkflowMessage(
        workflowStepMessage(
          6,
          `产出计算未通过校验，已保留上次可回填结果。${productSolverConflictSummary(solverResult, {
            keptPreviousFillBack: true,
          })}`
        ),
        'error'
      )
      return
    }
    const resolvedInputs = resolveOxySolverRecommendedInputs({
      result: solverResult,
      fuelColumn: iterative.fuelColumn,
      solventColumns: iterative.solventColumns,
      airColumns: iterative.airColumns,
    })
    await advanceProductCalculationStep(3, '正在回填产出结果到配料总表…')
    throwIfCalculationCancelled(cancelToken)
    const bridged = oxySolverToCopperProductResult(solverResult)
    // 先完成写入所需数据，最后一次性置位；避免中间把 filledBack=false 暴露给界面形成「已计算但未回填」
    if (
      resolvedInputs.fuelColumn.weight > 0 &&
      (!nearlyEqual(fuelColumn.weight, resolvedInputs.fuelColumn.weight) ||
        !nearlyEqual(materialWaterWeight(fuelColumn), materialWaterWeight(resolvedInputs.fuelColumn)))
    ) {
      updateFuelColumn({
        weight: resolvedInputs.fuelColumn.weight,
        waterWeight: resolvedInputs.fuelColumn.waterWeight,
        moisture: resolvedInputs.fuelColumn.moisture,
      }, { preserveProductCalculation: true, syncFuelRatioConstraint: false })
    }
    if (
      solventColumns.some((column) => {
        const solvedWeight = resolvedInputs.solventColumns.find((item) => item.id === column.id)?.weight
        return solvedWeight != null && !nearlyEqual(column.weight, solvedWeight)
      })
    ) {
      setSolventColumns((prev) =>
        prev.map((column) => {
          const solved = resolvedInputs.solventColumns.find((item) => item.id === column.id)
          return solved == null ? column : { ...column, weight: solved.weight }
        })
      )
    }
    if (
      airColumns.some((column) => {
        const solved = resolvedInputs.airColumns.find((item) => item.id === column.id)
        return (
          solved != null &&
          (!nearlyEqual(column.weight, solved.weight) ||
            !nearlyEqual(column.moisture ?? 0, solved.moisture ?? 0))
        )
      })
    ) {
      setAirColumns((prev) =>
        prev.map((column) => {
          const solved = resolvedInputs.airColumns.find((item) => item.id === column.id)
          if (solved == null) return column
          const weight = Math.max(0, solved.weight)
          const moisture = Math.max(0, solved.moisture ?? column.moisture ?? 0)
          return {
            ...column,
            weight,
            // 气体水分随干基重算，清掉可能过期的绝对 waterWeight
            waterWeight: weight > 0 && moisture > 0 ? weight * (moisture / 100) : 0,
            moisture,
          }
        })
      )
    }
    await advanceProductCalculationStep(3, '正在写入配料总表产出页签。')
    throwIfCalculationCancelled(cancelToken)

    const convergeNote =
      solverResult.iterations === 0 && solverResult.acceptable
        ? '已用上次回填结果复核通过（未重新进行产出计算）。'
        : solverResult.acceptanceLevel === 'strict'
          ? `已自动迭代 ${iterative.passes} 轮并严格收敛。`
          : solverResult.acceptanceLevel === 'relaxed'
            ? [`已自动迭代 ${iterative.passes} 轮。`, solverResult.message].filter(Boolean).join('\n')
            : [`已自动迭代 ${iterative.passes} 轮。`, productSolverConflictSummary(solverResult)]
                .filter(Boolean)
                .join('\n')

    setOxySolverResult(solverResult)
    setProductCalculationFailure(null)
    setProductCalculationError(null)
    setProductCalculated(true)
    setProductFilledBack(true)
    setProductPhaseManual(false)
    setProductPhaseOverrides({})
    setOutputPhaseDrafts({})
    setInvalidOutputPhaseColumns({})
    setBatchTableView('productPhase')
    setBatchTableHighlight(true)
    window.setTimeout(() => setBatchTableHighlight(false), 1000)
    scrollToCalculationTable('start')
    setShowProductCalculationAssist(false)
    resetHeatBalanceCalculation()
    // 立即写入工序缓存（含本次结果），避免尚未 re-render 就切页导致捕获到旧空结果
    if (activeProcessStageId) {
      const snapshot = captureCurrentProcessStageState()
      const resolvedStageSnapshot: CopperProcessStageState = {
        ...snapshot,
        rawMaterials: solveRawMaterials.map(cloneMaterialColumn),
        rawWeightDrafts: {
          ...snapshot.rawWeightDrafts,
          ...Object.fromEntries(
            solveRawMaterials.map((material) => [
              material.id,
              material.weight > 0 ? String(material.weight) : '',
            ])
          ),
        },
        fuelColumn: resolvedInputs.fuelColumn,
        solventColumns: resolvedInputs.solventColumns,
        airColumns: resolvedInputs.airColumns,
      }
      processStagesCacheRef.current = {
        ...processStagesCacheRef.current,
        [activeProcessStageId]: {
          ...resolvedStageSnapshot,
          productCalculated: true,
          productFilledBack: true,
          productSolverResult: cloneOxySolverResult(solverResult),
          heatBalanced: false,
          calculatedHeatBalance: null,
          heatBalanceFilledBack: false,
        },
      }
      loadedProcessStageIdRef.current = activeProcessStageId
    }
    setWorkflowMessage(
      workflowStepMessage(
        6,
        [
          `产出计算完成：产物总量 ${format(bridged.totalProductMass)} t/h（${formatCopperProductMassSummary(bridged, activeProcessStageId)}）。`,
          convergeNote,
          '已自动回填到配料总表产出-产物物相表与产出-产物元素表。',
        ]
          .filter(Boolean)
          .join('\n')
      ),
      solverResult.acceptanceLevel === 'strict' ? 'success' : 'warning'
    )
    } catch (error) {
      if (isOxyConstraintCalculationCancelled(error)) {
        const detail = productCalculationDetailRef.current
        setWorkflowMessage(
          workflowStepMessage(
            6,
            detail
              ? `产出计算已中断，已保留上次产出结果。中断位置：${detail}`
              : '产出计算已中断，已保留上次产出结果。'
          ),
          'warning'
        )
        return
      }
      const message = error instanceof Error ? error.message.trim() : String(error ?? '').trim()
      const detail = productCalculationDetailRef.current
      const userMessage = detail
        ? `产出计算失败：${message || '求解器未返回结果'}（失败位置：${detail}）。请检查输入物相、关键参数和产出约束后重试。`
        : `产出计算失败：${message || '求解器未返回结果'}。请检查输入物相、关键参数和产出约束后重试。`
      console.error('[oxy-product-calc]', error)
      setProductCalculationError(userMessage)
      setWorkflowMessage(workflowStepMessage(6, userMessage), 'error')
      return
    } finally {
      if (productCalculationCancelRef.current === cancelToken) productCalculationCancelRef.current = null
      setIsProductCalculating(false)
      setIsProductCalculatingCancelling(false)
      setProductCalculationDetail('')
      productCalculationDetailRef.current = ''
    }
  }

  const productConstraintAutoFillMessage = (fills: ReturnType<typeof autoFillOxyProductConstraintConfig>['autoFills']) => {
    const first = fills[0]
    if (!first) return null
    const suffix = fills.length > 1 ? `（共 ${fills.length} 项）` : ''
    const productName = oxyProductDisplayName(first.product, oxyProductDisplayStageForProcess(activeProcessStageId))
    return `已自动补齐 ${first.element} 在 ${productName} 的 D 为 ${formatConstraintDisplayValue(first.value)}%。${suffix}`
  }

  const updateProductDistributionConstraint = (
    productKey: OxySideBlowProductKey,
    element: string,
    type: DistributionRuleType,
    value: string
  ): boolean => {
    if (CONSTRAINT_PLACEHOLDER_ELEMENTS.has(element)) {
      const cleared = stripPlaceholderElementDistributions(productConstraintConfig)
      updateProductConstraintConfig(() => cleared)
      setWorkflowMessage(workflowStepMessage(5, `已清除占位元素 ${element} 的约束列。`), 'success')
      return true
    }
    const valueLabel = `${element} ${oxyProductDisplayName(productKey, oxyProductDisplayStageForProcess(activeProcessStageId))} ${type}`
    const resolvedValue = value.trim() === '' ? null : resolveConstraintRuleValue(value, productConstraintConfig.variables, valueLabel)
    if (resolvedValue && !resolvedValue.valid) {
      setWorkflowMessage(workflowStepMessage(5, resolvedValue.error ?? '元素约束值无效。'), 'error')
      return false
    }

    const nextConfig = stripPlaceholderElementDistributions(
      upsertProductDistributionRule(productConstraintConfig, productKey, element, type, value)
    )
    const autoFilled = autoFillOxyProductConstraintConfig(nextConfig)
    const finalValidation = validateOxyProductConstraintConfig(autoFilled.config, {
      productDisplayStage: oxyProductDisplayStageForProcess(activeProcessStageId),
    })
    const finalBlocking = firstBlockingConstraintMessage(finalValidation)
    if (finalBlocking) {
      setWorkflowMessage(workflowStepMessage(5, finalBlocking), 'error')
      return false
    }

    updateProductConstraintConfig(() => autoFilled.config)
    if (productKey === 'matte' && element === 'Cu(铜)' && type === 'W%') {
      syncProcessParametersFromConfig(autoFilled.config)
    }
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
    // 占位元素（如 Na）：任意操作直接整列清除，避免「不能承接」挡住关掉
    if (CONSTRAINT_PLACEHOLDER_ELEMENTS.has(element)) {
      const cleared = stripPlaceholderElementDistributions(productConstraintConfig)
      updateProductConstraintConfig(() => cleared)
      setWorkflowMessage(workflowStepMessage(5, `已清除占位元素 ${element} 的约束列。`), 'success')
      setOpenProductConstraintRuleMenu(null)
      setProductConstraintValueDrafts((prev) => {
        const next = { ...prev }
        for (const ruleType of OXY_DISTRIBUTION_RULE_TYPES) {
          for (const pk of OXY_SIDE_BLOW_PRODUCT_KEYS) {
            delete next[productConstraintCellDraftKey(pk, element, ruleType)]
          }
        }
        return next
      })
      return
    }
    if (type && !productCanCarryConstraintElement(productConstraintConfig, productKey, element)) {
      setWorkflowMessage(
        workflowStepMessage(
          5,
          `${oxyProductDisplayName(productKey, oxyProductDisplayStageForProcess(activeProcessStageId))} 不能承接 ${element}。`
        ),
        'error'
      )
      return
    }
    const nextConfig = stripPlaceholderElementDistributions(
      setProductDistributionRuleType(productConstraintConfig, productKey, element, type)
    )
    const autoFilled = autoFillOxyProductConstraintConfig(nextConfig)
    const finalValidation = validateOxyProductConstraintConfig(autoFilled.config, {
      productDisplayStage: oxyProductDisplayStageForProcess(activeProcessStageId),
    })
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
    const trimmed = draft.trim()
    const fallbackText = formatConstraintDisplayValue(fallbackValue)
    // 清空 → 一律提交为未知（空白），即使原先也是空白也清掉草稿
    if (trimmed === '' || draft !== fallbackText) {
      const committed = updateProductDistributionConstraint(productKey, element, type, trimmed === '' ? '' : draft)
      if (!committed) return
    }
    setProductConstraintValueDrafts((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
  }



  const resetProductConstraintsToDefault = () => {
    updateProductConstraintConfig(() => createDefaultProductConstraintConfig(activeProcessStageId))
    setOpenProductConstraintRuleMenu(null)
    setProductConstraintValueDrafts({})
    setCustomConstraintTargetDrafts({})
    setCustomConstraintExprDrafts({})
    setNewCustomConstraintDraft(EMPTY_CUSTOM_CONSTRAINT_DRAFT)
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
      addCustomConstraintEntry(
        config,
        newCustomConstraintDraft.expr,
        newCustomConstraintDraft.target
      )
    )
    setCustomConstraintTargetDrafts({})
    setCustomConstraintExprDrafts({})
    setNewCustomConstraintDraft(EMPTY_CUSTOM_CONSTRAINT_DRAFT)
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
    const customRows = visibleCustomConstraints(productConstraintConfig, {
      hideCoolingWater: activeProcessStageId === 'cu_converting',
    })
    const productLabel = (productKey: OxySideBlowProductKey) =>
      oxyProductDisplayName(productKey, oxyProductDisplayStageForProcess(activeProcessStageId))
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
      activeProcessStageId === 'cu_converting'
        ? '支持 Input.xxx、Output.xxx、Output.产物.物相.元素、OutputE.xxx；运算支持 + - * / () 和小数。例：Output.吹炼出炉烟气.As2O3.As / (Output.吹炼出炉烟气.As2O3.As + Output.吹炼烟气含尘.As2O3.As)'
        : '支持 Input.xxx、Output.xxx、Output.产物.物相.元素、OutputE.xxx；运算支持 + - * / () 和小数。例：Output.熔炼出炉烟气.As2O3.As / (Output.熔炼出炉烟气.As2O3.As + Output.烟气含尘.As2O3.As)'
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
                        {productLabel(productKey)}
                      </td>
                      <td className={`${stickyCell} left-24 text-center ${muted}`}>约束</td>
                      {productConstraintRows.map((row) => {
                        const type = selectedRuleType(productKey, row.element)
                        const canCarry = productCanCarryConstraintElement(productConstraintConfig, productKey, row.element)
                        const ignored = !type
                        const cellTitle = ignored ? '未参与计算，可选择 W/D' : canCarry ? undefined : `${productLabel(productKey)} 不能承接 ${row.element}`
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
                        const cellTitle = ignored ? '未参与计算，选择 W/D 后可填数值' : canCarry ? undefined : `${productLabel(productKey)} 不能承接 ${row.element}`
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
            <table className="w-full min-w-[900px] table-fixed text-sm">
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
                            title={customConstraintExpressionTitle(currentExpr, productConstraintConfig.variables)}
                            aria-label={`约束表达式：${customConstraintExpressionTitle(currentExpr, productConstraintConfig.variables)}`}
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
    resetHeatBalanceCalculation()
  }

  const updateEquipmentAdjustment = (id: EquipmentStageId, value: string) => {
    setEquipmentAdjustments((prev) => ({ ...prev, [id]: value }))
    setEquipmentModelGenerated((prev) => ({ ...prev, [id]: false }))
    setEquipmentBomGenerated((prev) => ({ ...prev, [id]: false }))
  }

  const updateEquipmentSizingInput = (
    setter: (value: string) => void,
    value: string,
    resetStageId: EquipmentStageId | null = activeEquipmentStageId
  ) => {
    setter(value)
    if (!resetStageId) {
      setEquipmentModelGenerated({ smelting: false, converting: false, refining: false })
      setEquipmentBomGenerated({ smelting: false, converting: false, refining: false })
      return
    }
    setEquipmentModelGenerated((prev) => ({ ...prev, [resetStageId]: false }))
    setEquipmentBomGenerated((prev) => ({ ...prev, [resetStageId]: false }))
  }

  const resetSmeltingEquipmentModel = () => {
    setEquipmentModelGenerated((prev) => ({ ...prev, smelting: false }))
    setEquipmentBomGenerated((prev) => ({ ...prev, smelting: false }))
  }

  const updateSmeltingEquipmentField = (
    setter: (value: string) => void,
    value: string,
    overrideSetter?: (value: boolean) => void
  ) => {
    setter(value)
    overrideSetter?.(true)
    resetSmeltingEquipmentModel()
  }

  const importSmeltingDailyFeedFromBatch = () => {
    setSmeltingDailyFeedTd(formatTableNumber(smeltingDefaultDailyFeedTd))
    setSmeltingDailyFeedOverridden(false)
    resetSmeltingEquipmentModel()
    setWorkflowMessage('已从配料计算导入单日处理量。', 'flow')
  }

  const importSmeltingAnnualFeedFromBatch = () => {
    setSmeltingAnnualFeedTa(formatTableNumber(smeltingDefaultAnnualFeedTa))
    setSmeltingAnnualFeedOverridden(false)
    resetSmeltingEquipmentModel()
    setWorkflowMessage('已从配料计算导入年投入量。', 'flow')
  }

  const importSmeltingOxygenFromBatch = () => {
    setSmeltingOxygenNm3h(formatTableNumber(smeltingDefaultOxygenNm3h))
    setSmeltingOxygenOverridden(false)
    resetSmeltingEquipmentModel()
    setWorkflowMessage('已从配料计算导入氧气流量。', 'flow')
  }

  const runEquipmentSizingCalculation = () => {
    if (!activeEquipmentStageId) return
    if (activeEquipmentStageId === 'smelting') {
      if (!isProcessStageProductReady(captureCurrentProcessStageState()) || !isProcessStageHeatBalanceReady(captureCurrentProcessStageState())) {
        setWorkflowMessage('请先完成熔炼产出与热平衡后再进行设备选型。', 'warning')
        return
      }
      if (!(smeltingDesign.areaM2 > 0)) {
        setWorkflowMessage(
          smeltingFeedMode === 'annual'
            ? '请填写有效的年投入量、年处理天数与床能力，以计算炉床面积。'
            : '请填写有效的单日处理量与床能力，以计算炉床面积。',
          'flow'
        )
        return
      }
      if (!(smeltingDesign.furnaceWidthM > 0) || !(smeltingDesign.furnaceLengthM > 0)) {
        setWorkflowMessage('请填写有效的炉长或炉宽，以完成炉型尺寸。', 'flow')
        return
      }
      if (smeltingDesign.jacketRemainderMm > 0.5 && !smeltingDesign.jacketRemainderDecision) {
        setWorkflowMessage('水套有余量，请先选择「增加 1 个水套」或「去掉余量」。', 'flow')
        return
      }
      if (!(smeltingDesign.designAreaM2 > 0) || !(smeltingDesign.designLengthM > 0)) {
        setWorkflowMessage('请完成水套余量处置后生成三维方案。', 'flow')
        return
      }
    }
    setEquipmentModelGenerated((prev) => ({ ...prev, [activeEquipmentStageId]: true }))
    setEquipmentBomGenerated((prev) => ({ ...prev, [activeEquipmentStageId]: false }))
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        equipmentModelSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
    })
  }

  const generateEquipmentBom = () => {
    if (!activeEquipmentStageId || !activeEquipmentModelReady) return
    setEquipmentBomGenerated((prev) => ({ ...prev, [activeEquipmentStageId]: true }))
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        equipmentBomSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
    })
  }

  const exportEquipmentBomDocument = () => {
    if (!activeEquipmentStageId || !activeEquipmentBomReady) return
    const stageLabel = activeEquipmentRow?.stage ?? activeEquipmentStageId
    const caseLabel = activeCase?.name ?? '未命名案例'
    const lengthM = Math.max(smeltingDesign.designLengthM || smeltingDesign.furnaceLengthM, 0.1)
    const widthM = Math.max(smeltingDesign.furnaceWidthM, 0.1)
    const heightM = resolveFurnaceBodyHeightM(widthM)
    const imageDataUrl =
      activeEquipmentStageId === 'smelting' ? furnaceViewerRef.current?.capturePngDataUrl() ?? null : null
    const html = buildEquipmentBomExportHtml({
      caseName: caseLabel,
      stageLabel,
      stageId: activeEquipmentStageId,
      items: activeEquipmentBomItems,
      design: activeEquipmentStageId === 'smelting' ? smeltingDesign : null,
      furnaceSizeLabel:
        activeEquipmentStageId === 'smelting'
          ? `${lengthM.toFixed(2)} × ${widthM.toFixed(2)} × ${heightM.toFixed(2)} m`
          : null,
      imageDataUrl,
    })
    const safeName = `${caseLabel}-${stageLabel}-设备清单`.replace(/[\\/:*?"<>|]/g, '_')
    downloadTextFile(`${safeName}.html`, html, 'text/html;charset=utf-8')
  }

  const updateEquipmentDimensionAdjustment = (id: EquipmentStageId, value: string) => {
    setEquipmentDimensionAdjustments((prev) => ({ ...prev, [id]: value }))
    setEquipmentBomGenerated((prev) => ({ ...prev, [id]: false }))
  }

  const runHeatBalanceCalculation = async () => {
    if (isHeatBalanceCalculating) return
    if (!productFilledBack) {
      setWorkflowMessage(workflowStepMessage(7, '请先完成产出计算并回填到配料总表。'), 'flow')
      scrollToProductCalculation()
      return
    }
    if (!oxySolverResult?.acceptable) {
      setWorkflowMessage(workflowStepMessage(7, '请先生成可回填的产出计算结果，再计算热平衡。'), 'flow')
      scrollToProductCalculation()
      return
    }
    if (!heatInputValid) {
      setWorkflowMessage(workflowStepMessage(7, '请先补全温度与冷却水等热平衡参数。'), 'flow')
      openHeatBalanceAssist()
      scrollToAssist(heatBalanceRef)
      return
    }
    const coolingWaterInletTemperatureC = toNumber(coolingWaterInletTemperature, 30)
    const coolingWaterOutletTemperatureC = toNumber(coolingWaterOutletTemperature, 38)
    const coolingWaterMassThValue = toNumber(
      coolingWaterMassTh,
      Number(defaultCoolingWaterMassThForStage(activeProcessStageId))
    )
    if (
      !coolingWaterOutletIsCalculated &&
      coolingWaterMassThValue > 0 &&
      coolingWaterOutletTemperatureC <= coolingWaterInletTemperatureC
    ) {
      setWorkflowMessage(
        workflowStepMessage(
          7,
          '冷却水出口温度需高于入口温度。'
        ),
        'flow'
      )
      openHeatBalanceAssist()
      scrollToAssist(heatBalanceRef)
      return
    }
    const inputPhaseMass = buildProductSolverInputPhaseMass(rawMaterials, phaseBatchResults, materialPhaseRows)
    const blendPhaseMass = inputPhaseMass?.[PRODUCT_INPUT_PHASE_BLEND_NAME] ?? null
    const phaseInputValidation = validateRawMaterialPhaseInputs({
      rawMaterials,
      phaseBatchResults,
      blendPhaseMass,
    })
    if (!phaseInputValidation.ok) {
      setWorkflowMessage(workflowStepMessage(7, phaseInputValidation.message ?? '投入物相未完成。'), 'error')
      scrollToCalculationTable()
      return
    }
    const solvedConstraintConfig = autoFillOxyProductConstraintConfig(productConstraintConfig).config
    const constraintValidation = validateOxyProductConstraintConfig(solvedConstraintConfig, {
      productDisplayStage: oxyProductDisplayStageForProcess(activeProcessStageId),
    })
    const constraintBlocking = firstBlockingConstraintMessage(constraintValidation)
    if (constraintBlocking) {
      setWorkflowMessage(workflowStepMessage(7, constraintBlocking), 'error')
      scrollToProductCalculation()
      return
    }
    const cancelToken: CalculationCancelToken = { cancelled: false }
    let fallbackFillBack: {
      heatBalance: CopperHeatBalanceResult
      fuelColumn: CopperFuelMaterial
      solventColumns: CopperMaterialColumn[]
      airColumns: CopperMaterialColumn[]
      solverResult: OxyConstraintSolverResult
      fuelWeightTh: number
    } | null = null
    heatBalanceCalculationCancelRef.current = cancelToken
    const shouldCancel = () => isCalculationTokenCancelled(cancelToken)
    openHeatBalanceAssist()
    setIsHeatBalanceCalculating(true)
    setHeatBalanceCalculationStep(0)
    setHeatBalanceCalculationDetail('')
    setIsHeatBalanceCancelling(false)
    heatBalanceCalculationDetailRef.current = ''
    try {
      type ClosureCandidate = {
        heatBalance: CopperHeatBalanceResult
        solverResult: OxyConstraintSolverResult
        fuelColumn: CopperFuelMaterial
        solventColumns: CopperMaterialColumn[]
        airColumns: CopperMaterialColumn[]
        derivedFuelWeightTh: number
        iterations: number
        usable: boolean
      }
      const heatTemperatures = {
        feed: toNumber(feedTemperature, 25),
        smeltingSlag: toNumber(slagTemperature, 1350),
        matte: toNumber(matteTemperature, 1300),
        flueGas: toNumber(gasTemperature, 1350),
        dust: toNumber(dustTemperature, 1350),
        fugitive: toNumber(gasTemperature, 1350),
        loss: toNumber(lossTemperature, 1350),
      }
      const ratioReferenceFuelWeightTh = Math.max(
        0,
        derivedFuelDryMass(
          {
            blendFeed: rawBlend,
            concentrateMass,
            fuelColumn,
            solventColumns,
            airColumns,
          },
          solvedConstraintConfig
        )
      )
      const fuelPhaseContents = heatBalanceFuelPhaseContents(
        fuelColumn,
        manualPhaseRatioColumns,
        phaseRatioOverrides
      )
      const calculateHeatBalanceForInputs = (
        nextFuelColumn: CopperFuelMaterial,
        nextSolventColumns: CopperMaterialColumn[],
        nextAirColumns: CopperMaterialColumn[],
        nextProductResult: OxyConstraintSolverResult,
        options?: { excludeFuelFromInput?: boolean }
      ) =>
        calculateCopperHeatBalanceDetailed({
          inputMaterials:
            activeProcessStageId === 'cu_converting'
              ? buildConvertingHeatBalanceSourceMaterials({
                  rawMaterials,
                  solventColumns: nextSolventColumns,
                  fuelColumn: nextFuelColumn,
                  airColumns: nextAirColumns,
                  phaseBatchResults,
                  materialPhaseRows,
                  manualPhaseRatioColumns,
                  phaseRatioOverrides,
                })
              : buildSmeltingHeatBalanceSourceMaterials({
                  rawMaterials,
                  solventColumns: nextSolventColumns,
                  fuelColumn: nextFuelColumn,
                  airColumns: nextAirColumns,
                  phaseBatchResults,
                  materialPhaseRows,
                  manualPhaseRatioColumns,
                  phaseRatioOverrides,
                  concentrateMass,
                }),
          products: nextProductResult,
          fuel: {
            ...nextFuelColumn,
            lowerHeatingValueMJkg: DEFAULT_COPPER_FUEL.lowerHeatingValueMJkg,
            combustionEfficiency: DEFAULT_COPPER_FUEL.combustionEfficiency,
          },
          fuelWeightTh: options?.excludeFuelFromInput ? 0 : Math.max(0, nextFuelColumn.weight),
          excludeFuelFromInput: options?.excludeFuelFromInput,
          ratioReferenceFuelWeightTh,
          chemicalHeatMode,
          process: activeProcessStageId === 'cu_converting' ? 'converting' : 'smelting',
          temperatures: heatTemperatures,
          coolingWaterInletTemperatureC,
          coolingWaterOutletTemperatureC,
          coolingWaterMassTh: coolingWaterMassThValue,
          heatLossMJh: 0,
          otherHeatMJh:
            activeProcessStageId === 'cu_converting'
              ? toNumber(otherHeatMJh, 1450)
              : chemicalHeatMode === 'reaction'
                ? 0
                : toNumber(otherHeatMJh, 500),
        })
      const cloneCandidateResult = (
        candidate: ClosureCandidate,
        closureStatus: CopperHeatBalanceResult['closureStatus'],
        heatDeficitBeforeSupplementalFuelMJh: number,
        processFuelWeightTh: number,
        options?: { closureBlockedReason?: string; fuelEffectiveHeatMJt?: number }
      ) => {
        const closedHeatBalance = applyPostFuelClosureToHeatBalance(candidate.heatBalance, {
          coolingWaterMassTh: coolingWaterMassThValue,
          coolingWaterInletTemperatureC,
          chemicalHeatMode,
          closeWithCoolingWater: activeProcessStageId === 'cu_converting',
        })
        const result = normalizeHeatBalanceResult(closedHeatBalance, {
          coolingWaterInletTemperatureC,
          coolingWaterOutletTemperatureC: closedHeatBalance.coolingWaterOutletTemperatureC,
          coolingWaterMassTh: coolingWaterMassThValue,
        }) ?? closedHeatBalance
        result.derivedFuelWeightTh = candidate.derivedFuelWeightTh
        result.supplementalFuelWeightTh = Math.max(0, candidate.derivedFuelWeightTh - processFuelWeightTh)
        result.heatDeficitWithoutFuelMJh = heatDeficitBeforeSupplementalFuelMJh
        result.finalFuelColumn = cloneFuelMaterial(candidate.fuelColumn)
        result.finalSolventColumns = candidate.solventColumns.map(cloneMaterialColumn)
        result.finalAirColumns = candidate.airColumns.map(cloneMaterialColumn)
        result.finalProductResult = cloneOxySolverResult(candidate.solverResult)
        result.closureIterations = candidate.iterations
        result.closureResidualMJh = result.balanceAfterFuelMJh
        result.closureStatus =
          Math.abs(result.balanceAfterFuelMJh) <= heatBalanceClosureToleranceMJh(result)
            ? 'balanced'
            : closureStatus
        result.closureBlockedReason = options?.closureBlockedReason
        result.fuelEffectiveHeatMJt = options?.fuelEffectiveHeatMJt
        return result
      }
      const advanceHeatBalanceStep = async (step: number, detail = '') => {
        throwIfCalculationCancelled(cancelToken)
        setHeatBalanceCalculationStep(step)
        setHeatBalanceCalculationDetail(detail)
        heatBalanceCalculationDetailRef.current = detail
        await new Promise<void>((resolve) => {
          window.requestAnimationFrame(() => window.setTimeout(resolve, 120))
        })
        throwIfCalculationCancelled(cancelToken)
      }
      const processFuelWeightTh = activeProcessStageId === 'cu_converting' ? 0 : Math.max(0, fuelColumn.weight)
      const convertingAirColumns =
        activeProcessStageId === 'cu_converting'
          ? airColumns.filter((column) => column.airRole !== 'secondary')
          : airColumns
      await advanceHeatBalanceStep(0, '正在读取热平衡参数。')
      throwIfCalculationCancelled(cancelToken)
      const baseCoalSolverResult = normalizeOxySolverAcceptance(cloneOxySolverResult(oxySolverResult))
      const baseCoalFuelColumn =
        activeProcessStageId === 'cu_converting'
          ? { ...fuelColumn, weight: 0, waterWeight: 0, moisture: 0 }
          : cloneFuelMaterial(fuelColumn)
      const baseCoalSolventColumns = solventColumns.map(cloneMaterialColumn)
      const baseCoalAirColumns = convertingAirColumns.map(cloneMaterialColumn)
      await advanceHeatBalanceStep(
        1,
        `正在计算热收入（${chemicalHeatMode === 'reaction' ? '化学反应' : 'Hess'}）。`
      )
      const processFuelHeatBalance = calculateHeatBalanceForInputs(
        baseCoalFuelColumn,
        baseCoalSolventColumns,
        baseCoalAirColumns,
        baseCoalSolverResult,
        activeProcessStageId === 'cu_converting' ? { excludeFuelFromInput: true } : undefined
      )
      fallbackFillBack = {
        heatBalance: processFuelHeatBalance,
        fuelColumn: cloneFuelMaterial(baseCoalFuelColumn),
        solventColumns: baseCoalSolventColumns.map(cloneMaterialColumn),
        airColumns: baseCoalAirColumns.map(cloneMaterialColumn),
        solverResult: cloneOxySolverResult(baseCoalSolverResult),
        fuelWeightTh: processFuelWeightTh,
      }
      const fuelSearchResidualOptions = {
        chemicalHeatMode,
        coolingWaterMassTh: coolingWaterMassThValue,
      }
      // Hess/吹炼：热缺口按冷却水尚未吸热计，盈余再由出口温度自动闭合。
      const heatDeficitBeforeSupplementalFuelMJh =
        chemicalHeatMode === 'hess' || activeProcessStageId === 'cu_converting'
          ? hessHeatDeficitWithoutCoolingMJh(processFuelHeatBalance)
          : Math.max(0, processFuelHeatBalance.heatDeficitMJh)
      const baseTolerance = heatBalanceClosureToleranceMJh(processFuelHeatBalance)
      const fuelEffectiveHeatMJt = estimateFuelEffectiveHeatMJt({
        fuel: fuelColumn,
        fuelPhases: fuelPhaseContents,
        feedTemperatureC: heatTemperatures.feed,
      })
      await advanceHeatBalanceStep(2, '正在计算热支出。')
      await advanceHeatBalanceStep(3, '正在汇总热收入与热支出。')

      let bestCandidate: ClosureCandidate = {
        heatBalance: processFuelHeatBalance,
        solverResult: baseCoalSolverResult,
        fuelColumn: cloneFuelMaterial(baseCoalFuelColumn),
        solventColumns: baseCoalSolventColumns.map(cloneMaterialColumn),
        airColumns: baseCoalAirColumns.map(cloneMaterialColumn),
        derivedFuelWeightTh: processFuelWeightTh,
        iterations: 0,
        usable: baseCoalSolverResult.acceptable,
      }
      let closureStatus: CopperHeatBalanceResult['closureStatus'] =
        heatDeficitBeforeSupplementalFuelMJh <= baseTolerance
          ? processFuelHeatBalance.balanceClosureMode === 'coolingWater'
            ? 'surplus'
            : Math.abs(processFuelHeatBalance.balanceAfterFuelMJh) <= baseTolerance
            ? 'balanced'
            : 'surplus'
          : 'blocked'
      let closureIterations = 0
      let closureBlockedReason: string | undefined

      const evaluateTotalFuel = async (
        trialTotalFuelWeightTh: number,
        iteration: number,
        step2Detail: string
      ): Promise<ClosureCandidate> => {
        throwIfCalculationCancelled(cancelToken)
        const trialFuelWeight = Math.max(0, trialTotalFuelWeightTh)
        await advanceHeatBalanceStep(4, step2Detail)
        const trialFuelColumn = fuelColumnWithDryWeight(fuelColumn, trialFuelWeight)
        const trialConfig = productConstraintConfigWithoutFuelRatio(solvedConstraintConfig)
        const iterative = await withLinkedProductTimeout(
          solveOxySideBlowProductsIterative({
            rawMaterials,
            rawFeed: rawBlend,
            concentrateMass,
            preserveFuelInputWeight: true,
            inputPhaseMass,
            fuelColumn: trialFuelColumn,
            solventColumns,
            airColumns,
            config: trialConfig,
            shouldCancel,
            maxPasses: HEAT_BALANCE_LINKED_PRODUCT_SOLVER_PASSES,
            seed: oxySolverResult?.acceptable ? oxySolverResultToSeed(oxySolverResult) : null,
          }),
          `第 ${iteration} 轮联动产物/供氧超时（总煤 ${format(trialFuelWeight)} t/h），请检查约束或降低求解难度。`,
          shouldCancel
        )
        throwIfCalculationCancelled(cancelToken)
        let solverResult = normalizeOxySolverAcceptance(iterative.result)
        let resolvedFuelColumn = iterative.fuelColumn
        let resolvedSolventColumns = iterative.solventColumns
        let resolvedAirColumns = iterative.airColumns
        if (!solverResult.acceptable && oxySolverResult?.acceptable && Math.abs(trialFuelWeight - processFuelWeightTh) < 1e-6) {
          solverResult = normalizeOxySolverAcceptance(cloneOxySolverResult(oxySolverResult))
          resolvedFuelColumn = fuelColumn
          resolvedSolventColumns = solventColumns
          resolvedAirColumns = airColumns
        }
        const candidateHeatBalance = calculateHeatBalanceForInputs(
          resolvedFuelColumn,
          resolvedSolventColumns,
          resolvedAirColumns,
          solverResult
        )
        await advanceHeatBalanceStep(
          4,
          `第 ${iteration} 轮：煤量闭合前热差 ${format(
            heatBalanceFuelSearchResidualMJh(candidateHeatBalance, fuelSearchResidualOptions)
          )} MJ/h。`
        )
        return {
          heatBalance: candidateHeatBalance,
          solverResult,
          fuelColumn: cloneFuelMaterial(resolvedFuelColumn),
          solventColumns: resolvedSolventColumns.map(cloneMaterialColumn),
          airColumns: resolvedAirColumns.map(cloneMaterialColumn),
          derivedFuelWeightTh: trialFuelWeight,
          iterations: iteration,
          usable: solverResult.acceptable,
        }
      }

      const syncIterationCandidateToUI = (candidate: ClosureCandidate) => {
        if (!candidate.usable) return
        const syncedFuelColumn = cloneFuelMaterial(candidate.fuelColumn)
        setFuelColumn(syncedFuelColumn)
        setManualFuelWeightValid(true)
        setSolventColumns(candidate.solventColumns.map(cloneMaterialColumn))
        setSolventSolution(null)
        setManualSolventWeights((prev) => ({
          ...prev,
          ...Object.fromEntries(candidate.solventColumns.map((column) => [column.id, true])),
        }))
        setAirColumns(candidate.airColumns.map(cloneMaterialColumn))
        setManualAirWeightValid(true)
        const syncedSolverResult = normalizeOxySolverAcceptance(cloneOxySolverResult(candidate.solverResult))
        setOxySolverResult(syncedSolverResult)
        setProductCalculated(true)
        setProductFilledBack(syncedSolverResult.acceptable)
        // 热平衡迭代中的总煤量仅写回煤列，不改工艺「煤/精矿比」
      }

      const initialResidualMJh =
        activeProcessStageId === 'cu_converting'
          ? hessFuelSearchResidualMJh(processFuelHeatBalance, {
              coolingWaterMassTh: coolingWaterMassThValue,
            })
          : heatBalanceFuelSearchResidualMJh(processFuelHeatBalance, fuelSearchResidualOptions)
      const maxTotalFuelWeight = heatBalanceClosureFuelLimit({
        estimatedFuelWeightTh: processFuelWeightTh + estimateFuelWeightFromHeatDeficit({
          heatDeficitMJh: heatDeficitBeforeSupplementalFuelMJh,
          fuel: fuelColumn,
          fuelPhases: fuelPhaseContents,
          feedTemperatureC: heatTemperatures.feed,
        }),
        ratioReferenceFuelWeightTh,
        concentrateMassTh: concentrateMass,
      })

      if (activeProcessStageId === 'cu_converting') {
        if (Math.abs(initialResidualMJh) > baseTolerance) {
          closureStatus = initialResidualMJh < 0 ? 'blocked' : 'surplus'
          closureBlockedReason =
            initialResidualMJh < 0
              ? '吹炼按无燃料、无二次风设计；当前热支出仍高于热收入，请检查冷却水量、烟气温度或产出约束。'
              : undefined
        }
      } else if (Math.abs(initialResidualMJh) > baseTolerance) {
        const estimatedSupplementalFuelWeight = estimateFuelWeightFromHeatDeficit({
          heatDeficitMJh: Math.max(0, -initialResidualMJh),
          fuel: fuelColumn,
          fuelPhases: fuelPhaseContents,
          feedTemperatureC: heatTemperatures.feed,
        })
        let trialTotalFuelWeight =
          initialResidualMJh < -baseTolerance
            ? Math.min(
                maxTotalFuelWeight,
                Math.max(0.01, processFuelWeightTh + estimatedSupplementalFuelWeight)
              )
            : Math.max(0, processFuelWeightTh * 0.85)
        let previousCandidate: ClosureCandidate | null = null
        let blockedReason: string | null = null
        closureStatus = 'blocked'

        while (closureIterations < HEAT_BALANCE_CLOSURE_MAX_ITERATIONS) {
          throwIfCalculationCancelled(cancelToken)
          closureIterations += 1
          const candidate = await evaluateTotalFuel(
            trialTotalFuelWeight,
            closureIterations,
            closureIterations === 1
              ? `按热差试算总煤量 ${format(trialTotalFuelWeight)} t/h。`
              : `第 ${closureIterations} 轮：按实测热差修正总煤量 ${format(trialTotalFuelWeight)} t/h。`
          )
          if (
            candidate.usable &&
            Math.abs(heatBalanceFuelSearchResidualMJh(candidate.heatBalance, fuelSearchResidualOptions)) <
              Math.abs(heatBalanceFuelSearchResidualMJh(bestCandidate.heatBalance, fuelSearchResidualOptions))
          ) {
            bestCandidate = candidate
          }
          syncIterationCandidateToUI(candidate)

          const tolerance = heatBalanceClosureToleranceMJh(candidate.heatBalance)
          const residual = heatBalanceFuelSearchResidualMJh(candidate.heatBalance, fuelSearchResidualOptions)

          if (candidate.usable && Math.abs(residual) <= tolerance) {
            closureStatus = 'balanced'
            break
          }

          if (!candidate.usable) {
            blockedReason = `总煤 ${format(trialTotalFuelWeight)} t/h 时产物约束未闭合；已保留最近可行结果。`
            closureStatus = 'blocked'
            break
          }

          if (previousCandidate?.usable) {
            const prevResidual = heatBalanceFuelSearchResidualMJh(
              previousCandidate.heatBalance,
              fuelSearchResidualOptions
            )
            if (
              fuelSearchSensitivityAbnormal({
                previous: {
                  fuelWeightTh: previousCandidate.derivedFuelWeightTh,
                  residualMJh: prevResidual,
                },
                current: {
                  fuelWeightTh: candidate.derivedFuelWeightTh,
                  residualMJh: residual,
                },
              })
            ) {
              blockedReason = `调煤后热差未改善（总煤 ${format(previousCandidate.derivedFuelWeightTh)} → ${format(
                candidate.derivedFuelWeightTh
              )} t/h，热差 ${format(candidate.heatBalance.balanceAfterFuelMJh)} MJ/h）。请检查冷却水量、烟气温度或产出约束。`
              closureStatus = 'blocked'
              break
            }
          }

          if (trialTotalFuelWeight >= maxTotalFuelWeight - 1e-9 && residual < -tolerance) {
            blockedReason = `试算总煤量已达到保护上限 ${format(maxTotalFuelWeight)} t/h，仍未闭合热差。请检查供氧、煤 C%/物相 C、冷却水量或产出约束。`
            closureStatus = 'blocked'
            break
          }

          const nextTotalFuelWeight = proposeNextFuelWeightTh({
            current: { fuelWeightTh: candidate.derivedFuelWeightTh, residualMJh: residual },
            previous: previousCandidate?.usable
              ? {
                  fuelWeightTh: previousCandidate.derivedFuelWeightTh,
                  residualMJh: heatBalanceFuelSearchResidualMJh(
                    previousCandidate.heatBalance,
                    fuelSearchResidualOptions
                  ),
                }
              : null,
            minFuelWeightTh: 0,
            maxFuelWeightTh: maxTotalFuelWeight,
            fuelEffectiveHeatMJt,
          })

          if (Math.abs(nextTotalFuelWeight - trialTotalFuelWeight) < 1e-6) {
            closureStatus = Math.abs(residual) <= tolerance ? 'balanced' : 'max-iterations'
            break
          }

          previousCandidate = candidate
          trialTotalFuelWeight = nextTotalFuelWeight
        }

        if (closureStatus === 'blocked') {
          closureBlockedReason = blockedReason ?? closureBlockedReason
        } else {
          const tolerance = heatBalanceClosureToleranceMJh(bestCandidate.heatBalance)
          if (
            Math.abs(heatBalanceFuelSearchResidualMJh(bestCandidate.heatBalance, fuelSearchResidualOptions)) <=
            tolerance
          ) {
            closureStatus = 'balanced'
          } else if (closureStatus !== 'max-iterations') {
            closureStatus = 'max-iterations'
          }
        }
      } else {
        await advanceHeatBalanceStep(
          4,
          `煤量闭合前热差 ${format(
            heatBalanceFuelSearchResidualMJh(processFuelHeatBalance, fuelSearchResidualOptions)
          )} MJ/h。`
        )
      }

      if (!bestCandidate.usable) {
        setWorkflowMessage(
          workflowStepMessage(7, '热平衡计算失败：无可接受的产出结果用于热支出计算，请先完成产出计算并确保约束收敛。'),
          'error'
        )
        return
      }

      throwIfCalculationCancelled(cancelToken)
      const finalHeatBalance = cloneCandidateResult(
        bestCandidate,
        closureStatus,
        heatDeficitBeforeSupplementalFuelMJh,
        processFuelWeightTh,
        { closureBlockedReason, fuelEffectiveHeatMJt }
      )
      await advanceHeatBalanceStep(
        5,
        `正在回填热平衡结果：热差 ${format(finalHeatBalance.balanceAfterFuelMJh)} MJ/h。`
      )
      const derivedFuelText =
        finalHeatBalance.derivedFuelWeightTh && finalHeatBalance.derivedFuelWeightTh > 1e-6
          ? `总煤量 ${format(finalHeatBalance.derivedFuelWeightTh)} t/h（补充 ${format(finalHeatBalance.supplementalFuelWeightTh ?? 0)} t/h），`
          : '总煤量 0 t/h，'
      const residualText = `热差 ${format(finalHeatBalance.balanceAfterFuelMJh)} MJ/h`
      const doneMessage =
        closureStatus === 'balanced'
          ? `热平衡计算完成并已自动回填。${derivedFuelText}${residualText}。`
          : closureStatus === 'surplus'
            ? `热平衡计算完成并已自动回填。当前热盈余，${residualText}。`
          : closureStatus === 'blocked'
              ? `煤量闭合未完成，已自动回填当前最佳结果；请检查供氧、煤 C%/物相 C、冷却水量或产物约束。`
              : `煤量闭合未完全收敛，已自动回填当前最佳结果。${derivedFuelText}${residualText}。`
      applyHeatBalanceToBatchTable(finalHeatBalance, {
        message: workflowStepMessage(7, doneMessage),
        tone: closureStatus === 'balanced' || closureStatus === 'surplus' ? 'success' : 'warning',
      })
    } catch (error) {
      if (isOxyConstraintCalculationCancelled(error)) {
        const detail = heatBalanceCalculationDetailRef.current
        setWorkflowMessage(
          workflowStepMessage(
            7,
            detail
              ? `热平衡计算已中断，已保留上次热平衡结果。中断位置：${detail}`
              : '热平衡计算已中断，已保留上次热平衡结果。'
          ),
          'warning'
        )
        return
      }
      if (isHeatBalanceEvaluationTimeout(error)) {
        const detail = heatBalanceCalculationDetailRef.current
        if (fallbackFillBack) {
          const fallback = cloneHeatBalanceResult(fallbackFillBack.heatBalance)
          fallback.finalFuelColumn = cloneFuelMaterial(fallbackFillBack.fuelColumn)
          fallback.finalSolventColumns = fallbackFillBack.solventColumns.map(cloneMaterialColumn)
          fallback.finalAirColumns = fallbackFillBack.airColumns.map(cloneMaterialColumn)
          fallback.finalProductResult = cloneOxySolverResult(fallbackFillBack.solverResult)
          fallback.derivedFuelWeightTh = fallbackFillBack.fuelWeightTh
          fallback.supplementalFuelWeightTh = 0
          fallback.closureIterations = 0
          fallback.closureResidualMJh = fallback.balanceAfterFuelMJh
          fallback.closureStatus = 'max-iterations'
          applyHeatBalanceToBatchTable(fallback, {
            message: workflowStepMessage(
              7,
              `${error.message}。已回填基础可行工况；当前热差 ${format(fallback.balanceAfterFuelMJh)} MJ/h。`
            ),
            tone: 'warning',
          })
          return
        }
        setWorkflowMessage(
          workflowStepMessage(
            7,
            detail
              ? `${error instanceof Error ? error.message : '联动产物/供氧超时'}。超时位置：${detail}。未回填当前迭代结果。`
              : `${error instanceof Error ? error.message : '联动产物/供氧超时'}。未回填当前迭代结果。`
          ),
          'warning'
        )
        return
      }
      if (fallbackFillBack) {
        const fallback = cloneHeatBalanceResult(fallbackFillBack.heatBalance)
        fallback.finalFuelColumn = cloneFuelMaterial(fallbackFillBack.fuelColumn)
        fallback.finalSolventColumns = fallbackFillBack.solventColumns.map(cloneMaterialColumn)
        fallback.finalAirColumns = fallbackFillBack.airColumns.map(cloneMaterialColumn)
        fallback.finalProductResult = cloneOxySolverResult(fallbackFillBack.solverResult)
        fallback.derivedFuelWeightTh = fallbackFillBack.fuelWeightTh
        fallback.supplementalFuelWeightTh = 0
        fallback.closureIterations = 0
        fallback.closureResidualMJh = fallback.balanceAfterFuelMJh
        fallback.closureStatus = 'blocked'
        applyHeatBalanceToBatchTable(fallback, {
          message: workflowStepMessage(
            7,
            `热平衡联动求解异常：${error instanceof Error ? error.message : '未知错误'}。已回填基础可行工况；当前热差 ${format(fallback.balanceAfterFuelMJh)} MJ/h。`
          ),
          tone: 'warning',
        })
        return
      }
      setWorkflowMessage(
        workflowStepMessage(7, `热平衡计算失败：${error instanceof Error ? error.message : '未知错误'}。`),
        'error'
      )
    } finally {
      if (heatBalanceCalculationCancelRef.current === cancelToken) heatBalanceCalculationCancelRef.current = null
      setIsHeatBalanceCalculating(false)
      setIsHeatBalanceCancelling(false)
      setHeatBalanceCalculationDetail('')
      heatBalanceCalculationDetailRef.current = ''
    }
  }

  const applyHeatBalanceToBatchTable = (
    heatBalance: CopperHeatBalanceResult,
    options: { message?: string; tone?: WorkflowMessageTone } = {}
  ) => {
    const closureComplete =
      heatBalance.closureStatus === 'balanced' || heatBalance.closureStatus === 'not-needed'
    setCalculatedHeatBalance(cloneHeatBalanceResult(heatBalance))
    if (heatBalance.finalFuelColumn) {
      const finalFuelColumn = cloneFuelMaterial(heatBalance.finalFuelColumn)
      setFuelColumn(finalFuelColumn)
      setManualFuelWeightValid(true)
      setRatioDrafts((prev) => {
        const next = { ...prev }
        delete next['fuel-weight:fuel-coal']
        return next
      })
      setWaterWeightDrafts((prev) => {
        const next = { ...prev }
        delete next[waterWeightDraftKey('fuel', finalFuelColumn.id)]
        return next
      })
      // 热平衡补充煤只更新煤量列；保持工艺参数「煤/精矿比」不被总煤量污染
    }
    if (heatBalance.finalSolventColumns?.length) {
      setSolventColumns(heatBalance.finalSolventColumns.map(cloneMaterialColumn))
      setSolventSolution(null)
      setManualSolventWeights((prev) => ({
        ...prev,
        ...Object.fromEntries(heatBalance.finalSolventColumns!.map((column) => [column.id, true])),
      }))
    }
    if (heatBalance.finalAirColumns?.length) {
      setAirColumns(heatBalance.finalAirColumns.map(cloneMaterialColumn))
      setManualAirWeightValid(true)
    }
    if (heatBalance.finalProductResult) {
      const finalProductResult = normalizeOxySolverAcceptance(cloneOxySolverResult(heatBalance.finalProductResult))
      setOxySolverResult(finalProductResult)
      setProductCalculated(true)
      setProductFilledBack(finalProductResult.acceptable)
      setProductPhaseManual(false)
      setProductPhaseOverrides({})
      setOutputPhaseDrafts({})
      setInvalidOutputPhaseColumns({})
    }
    setShowHeatBalanceAssist(false)
    setHeatBalanceFilledBack(true)
    setHeatBalanced(closureComplete)
    if (Number.isFinite(heatBalance.coolingWaterOutletTemperatureC)) {
      setCoolingWaterOutletTemperature(formatTableNumber(heatBalance.coolingWaterOutletTemperatureC))
    }
    if (Number.isFinite(heatBalance.otherHeatMJh)) {
      setOtherHeatMJh(normalizeOtherHeatMJhText(String(heatBalance.otherHeatMJh)))
    }
    if (heatBalance.chemicalHeatMode === 'hess' || heatBalance.chemicalHeatMode === 'reaction') {
      setChemicalHeatMode(heatBalance.chemicalHeatMode)
    }
    setBatchTableView('balance')
    if (activeProcessStageId) {
      const snapshot = captureCurrentProcessStageState()
      const finalProduct =
        heatBalance.finalProductResult != null
          ? normalizeOxySolverAcceptance(cloneOxySolverResult(heatBalance.finalProductResult))
          : snapshot.productSolverResult
      processStagesCacheRef.current = {
        ...processStagesCacheRef.current,
        [activeProcessStageId]: {
          ...snapshot,
          productCalculated: finalProduct?.acceptable ? true : snapshot.productCalculated,
          productFilledBack: finalProduct?.acceptable ? true : snapshot.productFilledBack,
          productSolverResult: finalProduct ? cloneOxySolverResult(finalProduct) : snapshot.productSolverResult,
          heatBalanced: closureComplete,
          heatBalanceFilledBack: true,
          calculatedHeatBalance: cloneHeatBalanceResult(heatBalance),
        },
      }
      loadedProcessStageIdRef.current = activeProcessStageId
    }
    setWorkflowMessage(
      options.message ?? workflowStepMessage(7, '已将热平衡闭合后的配料、产物和热平衡表回填到配料总表。'),
      options.tone ?? 'success'
    )
    scrollToCalculationTable('start')
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
    invalidateMaterialPhaseCalculation(materialId)
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
    invalidateMaterialPhaseCalculation(materialId)
    setWorkflowMessage('已删除物相行。', 'success')
  }

  const applyPhaseResultsForMaterials = useCallback(
    (
      results: PhaseBatchResults,
      materialIds: string[],
      options: { scrollToPhase?: boolean; collapseAfter?: boolean } = {}
    ): string[] => {
      const appliedIds = materialIds.filter((id) => results[id]?.valid)
      if (appliedIds.length === 0) return []

      setRawMaterials((prev) =>
        prev.map((material) => {
          const result = results[material.id]
          if (!result?.valid || !appliedIds.includes(material.id)) return material
          return {
            ...material,
            ratios: normalizeCopperRatios({
              ...material.ratios,
              ...result.unknowns,
            }),
          }
        })
      )

      setPhaseCompletedMaterials((prev) => {
        const next = { ...prev }
        for (const id of appliedIds) next[id] = true
        setPhaseCompleted(
          rawMaterials.every((material) => !material.name.trim() || next[material.id] === true)
        )
        return next
      })

      setPhaseRatioOverrides((prev) => {
        const next = { ...prev }
        for (const id of appliedIds) {
          const result = results[id]!
          next[id] = formatPhasePercentDraft(
            phaseContentsToInputPhaseMap(
              result.phaseContents,
              ensureMaterialPhaseRows(materialPhaseRows[id]),
              result.unknowns
            )
          )
        }
        delete next.blend
        return next
      })

      setManualPhaseRatioColumns((prev) => {
        const next = { ...prev }
        for (const id of appliedIds) next[id] = true
        delete next.blend
        return next
      })

      setSolventSolution(null)
      resetDownstreamCalculations()

      if (options.scrollToPhase) {
        setBatchTableView('phase')
        setPhaseBlendExpandToken((value) => value + 1)
        setBatchTableHighlight(true)
        window.setTimeout(() => setBatchTableHighlight(false), 1000)
        calculationTableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }

      if (options.collapseAfter) {
        setShowElementAssist(false)
      }

      return appliedIds
    },
    [materialPhaseRows, rawMaterials, resetDownstreamCalculations]
  )

  const runBatchPhaseCalculation = useCallback(
    async (options?: { materialIds?: string[]; silent?: boolean; scrollToPhase?: boolean; collapseAfter?: boolean }) => {
      if (activeProcessStageId === 'cu_converting') {
        if (!options?.silent) {
          setWorkflowMessage('吹炼已取消元素→物相计算；请在物相表维护物相%与投料量。', 'flow')
        }
        return
      }
      const showSpinner = !options?.silent
      if (showSpinner) {
        setIsPhaseCalculating(true)
        setPhaseCalculationStep(0)
      }
      const startedAt = performance.now()
      if (showSpinner) {
        await new Promise<void>((resolve) => {
          window.requestAnimationFrame(() => window.setTimeout(resolve, 180))
        })
        setPhaseCalculationStep(1)
        await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()))
      }

      const preservedStatuses = new Set(['from-smelting-matte', 'converting-default', 'metcal-import'])
      const requestedIds =
        options?.materialIds ??
        rawMaterials
          .filter((material) => {
            if (!material.name.trim() || material.weight <= 0) return false
            // 已参与计算的白铜锍不再进入 O/C 批量重算
            if (isConvertingWhiteMattePhaseLocked(material.id, phaseCompletedMaterials, phaseBatchResults)) {
              return false
            }
            return true
          })
          .map((material) => material.id)

      const preservedResults: PhaseBatchResults = {}
      const computeIds: string[] = []
      for (const id of requestedIds) {
        const prev = phaseBatchResults?.[id]
        const material = rawMaterials.find((item) => item.id === id)
        if (
          prev?.valid &&
          prev.status &&
          preservedStatuses.has(prev.status) &&
          // 用户点开某一原料强制重算时仍允许覆盖（显式传入且仅该料）
          !(options?.materialIds?.length === 1 && options.materialIds[0] === id && id !== CONVERTING_WHITE_MATTE_ID)
        ) {
          preservedResults[id] = {
            ...prev,
            weight: material?.weight ?? prev.weight,
            materialName: material?.name ?? prev.materialName,
          }
          continue
        }
        if (isConvertingWhiteMattePhaseLocked(id, phaseCompletedMaterials, phaseBatchResults)) {
          if (prev?.valid) {
            preservedResults[id] = {
              ...prev,
              weight: material?.weight ?? prev.weight,
              materialName: material?.name ?? prev.materialName,
            }
          }
          continue
        }
        computeIds.push(id)
      }

      const { results: computedResults, succeeded: computedSucceeded, failed } = computeAllMaterialPhaseResults(
        rawMaterials,
        materialPhaseRows,
        { materialIds: computeIds }
      )
      const results: PhaseBatchResults = { ...computedResults, ...preservedResults }
      const succeeded = [...computedSucceeded, ...Object.keys(preservedResults)]

      setPhaseBatchResults((prev) => {
        const next: PhaseBatchResults = { ...(prev ?? {}) }
        for (const [id, result] of Object.entries(results)) {
          next[id] = result
        }
        for (const item of failed) {
          delete next[item.id]
        }
        return Object.keys(next).length > 0 ? next : null
      })

      if (succeeded.length > 0) {
        applyPhaseResultsForMaterials(results, succeeded, {
          scrollToPhase: options?.scrollToPhase,
          collapseAfter: options?.collapseAfter,
        })
        setProcessParametersConfirmed(true)
      }

      const activeMaterialId = options?.materialIds?.[0] ?? phaseMaterialId
      if (activeMaterialId && results[activeMaterialId]?.valid) {
        setPhasePreviewUnknowns(buildPhasePreviewUnknowns(activeMaterialId, results[activeMaterialId]!))
      } else if (failed.some((item) => item.id === activeMaterialId)) {
        setPhasePreviewUnknowns((prev) => (prev?.materialId === activeMaterialId ? null : prev))
      }

      if (!options?.silent) {
        if (failed.length > 0 && succeeded.length === 0) {
          setWorkflowMessage(
            failed.length === 1
              ? `${failed[0]!.name}：${failed[0]!.message}`
              : `部分原料物相计算失败：${failed.map((item) => item.name).join('、')}`,
            'error'
          )
        } else if (failed.length > 0) {
          setWorkflowMessage(
            `已回填 ${succeeded.length} 种原料；失败：${failed.map((item) => item.name).join('、')}`,
            'warning'
          )
        } else if (succeeded.length > 0) {
          setWorkflowMessage(`已同步计算并回填 ${succeeded.length} 种原料的物相成分。`, 'success')
        } else {
          setWorkflowMessage('没有可计算的原料，请先填写投料量与元素化验。', 'flow')
        }
      }

      const elapsed = performance.now() - startedAt
      if (showSpinner) {
        setPhaseCalculationStep(2)
        window.setTimeout(() => setIsPhaseCalculating(false), Math.max(0, 1000 - elapsed))
      }
    },
    [
      activeProcessStageId,
      applyPhaseResultsForMaterials,
      materialPhaseRows,
      phaseBatchResults,
      phaseCompletedMaterials,
      phaseMaterialId,
      rawMaterials,
    ]
  )

  useEffect(() => {
    return () => {
      if (batchPhaseTimerRef.current != null) {
        window.clearTimeout(batchPhaseTimerRef.current)
      }
    }
  }, [])

  const goToConstraintEditor = useCallback(() => {
    const parsed = parseProcessParameterDrafts(processParameterDrafts)
    if (parsed) {
      commitProcessParameters(parsed)
    }
    setProcessParametersConfirmed(true)
    setConstraintEditorReached(true)
    setShowProductCalculationAssist(true)
    setShowElementAssist(false)
    setShowHeatBalanceAssist(false)
    setBatchTableView('productPhase')
    window.requestAnimationFrame(() => {
      productCalculationRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
    setWorkflowMessage(
      activeProcessStageId === 'cu_converting'
        ? workflowStepMessage(4, '请确认产出约束后点击「计算产出结果」。', '产出约束')
        : workflowStepMessage(5, '请确认产出约束后点击「计算产出结果」。'),
      'flow'
    )
  }, [activeProcessStageId, commitProcessParameters, processParameterDrafts, setWorkflowMessage])

  const navigateToWorkflowStep = useCallback(
    (stepIndex: number) => {
      if (activeProcessStageId === 'cu_converting') {
        switch (stepIndex) {
          case 0:
            setShowLibrary(true)
            window.requestAnimationFrame(() => {
              materialLibraryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            })
            break
          case 1:
            setBatchTableView('element')
            scrollToCalculationTable()
            break
          case 2:
            setBatchTableView('phase')
            setShowElementAssist(true)
            scrollToCalculationTable()
            window.setTimeout(() => scrollToPhaseAssistTable(), 120)
            break
          case 3:
            goToConstraintEditor()
            break
          case 4:
            setConstraintEditorReached(true)
            scrollToProductCalculation()
            break
          case 5:
            handleBatchTableViewChange('balance')
            if (heatBalanceFilledBack) scrollToCalculationTable()
            break
          default:
            break
        }
        return
      }
      switch (stepIndex) {
        case 0:
          setShowLibrary(true)
          window.requestAnimationFrame(() => {
            materialLibraryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          })
          break
        case 1:
          setBatchTableView('element')
          scrollToCalculationTable()
          break
        case 2:
          setBatchTableView('phase')
          setShowElementAssist(true)
          scrollToCalculationTable()
          window.setTimeout(() => scrollToPhaseAssistTable(), 120)
          break
        case 3:
          handleBatchTableViewChange('parameters')
          scrollToCalculationTable()
          break
        case 4:
          goToConstraintEditor()
          break
        case 5:
          setConstraintEditorReached(true)
          scrollToProductCalculation()
          break
        case 6:
          handleBatchTableViewChange('balance')
          if (heatBalanceFilledBack) scrollToCalculationTable()
          break
        default:
          break
      }
    },
    [
      activeProcessStageId,
      goToConstraintEditor,
      handleBatchTableViewChange,
      heatBalanceFilledBack,
      scrollToCalculationTable,
      scrollToPhaseAssistTable,
      scrollToProductCalculation,
    ]
  )

  const runPhaseCalculationAndFinish = () => {
    if (isPhaseCalculating) return
    void runBatchPhaseCalculation({ scrollToPhase: true, collapseAfter: true })
  }

  const captureCurrentProcessStageState = useCallback((): CopperProcessStageState => ({
    rawMaterials: rawMaterials.map(cloneMaterialColumn),
    rawWeightDrafts: { ...rawWeightDrafts },
    solventColumns: solventColumns.map(cloneMaterialColumn),
    materialLibrary: materialLibrary.map((item) => ({
      ...item,
      ratios: { ...item.ratios },
    })),
    fuelColumn: cloneFuelMaterial(fuelColumn),
    airColumns: airColumns.map(cloneMaterialColumn),
    targetFeSiO2,
    targetCaOSiO2,
    processParameters: { ...processParameters },
    processParametersConfirmed,
    constraintEditorReached,
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
    manualAirWeights: { ...manualAirWeights },
    manualAirWeightValid,
    phaseCompleted,
    productCalculated,
    productFilledBack,
    productSolverResult: oxySolverResult ? cloneOxySolverResult(oxySolverResult) : null,
    metcalProductResult: metcalProductResult ? cloneOxySolverResult(metcalProductResult) : null,
    heatBalanced,
    calculatedHeatBalance: calculatedHeatBalance ? cloneHeatBalanceResult(calculatedHeatBalance) : null,
    heatBalanceFilledBack,
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
    coolingWaterInletTemperature,
    coolingWaterOutletTemperature,
    coolingWaterMassTh,
    otherHeatMJh,
    chemicalHeatMode,
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
  }), [
    airColumns,
    batchTableView,
    calculatedHeatBalance,
    constraintEditorReached,
    coolingWaterInletTemperature,
    coolingWaterMassTh,
    coolingWaterOutletTemperature,
    customPhaseRows,
    dustTemperature,
    feedTemperature,
    fuelColumn,
    fuelEfficiency,
    fuelLhv,
    gasTemperature,
    heatBalanceFilledBack,
    chemicalHeatMode,
    heatBalanced,
    lossTemperature,
    manualAirWeightValid,
    manualFuelWeightValid,
    manualPhaseCells,
    manualPhaseRatioColumns,
    manualSolventWeights,
    manualAirWeights,
    materialLibrary,
    materialPhaseRows,
    matteTemperature,
    metcalProductResult,
    otherHeatMJh,
    oxySolverResult,
    oxygenAirN2Pct,
    oxygenAirO2Pct,
    oxygenSupplyCoefficient,
    phaseAssistTabMaterialIds,
    phaseBatchResults,
    phaseCompleted,
    phaseCompletedMaterials,
    phaseMaterialId,
    phasePreviewUnknowns,
    phaseRatioOverrides,
    processParameters,
    processParametersConfirmed,
    productCalculated,
    productConstraintConfig,
    productDistributionDrafts,
    productFilledBack,
    productPhaseManual,
    productPhaseOverrides,
    rawMaterials,
    rawWeightDrafts,
    slagTemperature,
    solventColumns,
    solventSolution,
    targetCaOSiO2,
    targetFeSiO2,
  ])

  const applyProcessStageStateToUi = useCallback(async (
    state: CopperProcessStageState,
    stageId: CopperProcessStageId = 'cu_smelting'
  ) => {
    const nextRawMaterials = (state.rawMaterials?.length ? state.rawMaterials : createDefaultCopperMaterials()).map(
      cloneMaterialColumn
    )
    let nextSolventColumns = (state.solventColumns?.length ? state.solventColumns : createDefaultSolventColumns()).map(
      cloneMaterialColumn
    )
    let nextAirColumns = normalizeProcessAirColumns(state.airColumns, undefined, {
      includeSecondaryAir: stageId !== 'cu_converting',
    })
    let nextFuelColumn = state.fuelColumn ? cloneFuelMaterial(state.fuelColumn) : cloneFuelMaterial(DEFAULT_COPPER_FUEL)
    if (stageId === 'cu_converting') {
      nextFuelColumn = cloneFuelMaterial({
        ...nextFuelColumn,
        weight: 0,
        waterWeight: 0,
        moisture: 0,
      })
    }
    const nextPhaseBatchResults = state.phaseBatchResults ?? null
    const nextProductConstraintConfig = normalizeOxyConstraintConfig(
      state.productConstraintConfig ?? createDefaultProductConstraintConfig(stageId),
      stageId
    )
    const nextMaterialPhaseRows = Object.fromEntries(
      Object.entries(state.materialPhaseRows ?? {}).map(([materialId, rows]) => [
        materialId,
        ensureMaterialPhaseRows(rows),
      ])
    )
    const savedProductSolverResult = normalizeOxySolverResult(state.productSolverResult)
    const recomputedProductState =
      state.productCalculated && !savedProductSolverResult
        ? await restoreProductCalculationFromCaseState({
            rawMaterials: nextRawMaterials,
            solventColumns: nextSolventColumns,
            fuelColumn: nextFuelColumn,
            airColumns: nextAirColumns,
            manualInputWeights: {
              fuel: state.manualFuelWeightValid,
              solvents: state.manualSolventWeights,
              gases: state.manualAirWeights,
            },
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
    // 只要缓存里有可接受产出结果就恢复展示；完成标记跟缓存走（输入变更只清标记不清结果）
    const restoredProductFilledBack = Boolean(restoredProductSolverResult?.acceptable)
    const restoredProductCalculated = Boolean(
      restoredProductSolverResult?.acceptable && (state.productCalculated || state.productFilledBack)
    )
    const isLegacyConvertingReactionClosure =
      stageId === 'cu_converting' &&
      state.calculatedHeatBalance?.chemicalHeatMode === 'reaction' &&
      state.calculatedHeatBalance?.balanceClosureMode === 'otherHeat'
    const restoredHeatBalance = isLegacyConvertingReactionClosure
      ? null
      : normalizeHeatBalanceResult(state.calculatedHeatBalance, {
      process: stageId === 'cu_converting' ? 'converting' : 'smelting',
      coolingWaterInletTemperatureC: toNumber(state.coolingWaterInletTemperature ?? '30', 30),
      coolingWaterOutletTemperatureC: toNumber(state.coolingWaterOutletTemperature ?? '38', 38),
      coolingWaterMassTh: toNumber(
        state.coolingWaterMassTh ?? defaultCoolingWaterMassThForStage(stageId),
        Number(defaultCoolingWaterMassThForStage(stageId))
      ),
    })
    // 有热平衡结果就恢复展示；闭合完成标记仍跟缓存 heatBalanced（输入变更只清标记）
    const restoredHeatBalanceFilledBack = Boolean(restoredHeatBalance)
    const restoredHeatBalanced = Boolean(restoredHeatBalance && state.heatBalanced)

    setRawMaterials(nextRawMaterials)
    setRawWeightDrafts(
      state.rawWeightDrafts ??
        Object.fromEntries(nextRawMaterials.map((material) => [material.id, material.weight > 0 ? String(material.weight) : '']))
    )
    setWaterWeightDrafts({})
    setSolventColumns(nextSolventColumns)
    setMaterialLibrary(
      Array.isArray(state.materialLibrary)
        ? state.materialLibrary.map((item) => ({ ...item, ratios: { ...item.ratios } }))
        : createSmeltingMaterialLibrary()
    )
    setLibraryCategoryGroup('all')
    setFuelColumn(nextFuelColumn)
    setAirColumns(nextAirColumns)
    setTargetFeSiO2(state.targetFeSiO2 ?? '2.8')
    setTargetCaOSiO2(state.targetCaOSiO2 ?? '0.45')
    const nextProcessParameters =
      state.processParameters ??
      processParametersFromLegacyCase(state.targetFeSiO2, state.targetCaOSiO2, nextProductConstraintConfig)
    setProcessParameters(nextProcessParameters)
    setProcessParameterDrafts(processParametersToDrafts(nextProcessParameters))
    setProcessParametersConfirmed(
      stageId === 'cu_converting' ? true : (state.processParametersConfirmed ?? false)
    )
    setConstraintEditorReached(state.constraintEditorReached ?? false)
    setSolventSolution(cloneSolventSolution(state.solventSolution ?? null))
    setPhaseCompletedMaterials(state.phaseCompletedMaterials ?? {})
    setPhaseBatchResults(nextPhaseBatchResults)
    setManualPhaseCells(state.manualPhaseCells ?? {})
    setManualSolventWeights(state.manualSolventWeights ?? {})
    setManualFuelWeightValid(state.manualFuelWeightValid ?? false)
    setManualAirWeights(state.manualAirWeights ?? {})
    setManualAirWeightValid(state.manualAirWeightValid ?? false)
    setPhaseCompleted(state.phaseCompleted ?? false)
    setProductCalculated(restoredProductCalculated)
    setProductFilledBack(restoredProductFilledBack)
    setOxySolverResult(restoredProductSolverResult)
    const restoredMetcalProductResult = normalizeOxySolverResult(state.metcalProductResult)
    setMetcalProductResult(restoredMetcalProductResult)
    setShowMetcalCalcResults(false)
    setHeatBalanced(restoredHeatBalanced)
    setCalculatedHeatBalance(restoredHeatBalance)
    setFuelLhv(state.fuelLhv ?? String(DEFAULT_COPPER_FUEL.lowerHeatingValueMJkg))
    setFuelEfficiency(state.fuelEfficiency ?? String(DEFAULT_COPPER_FUEL.combustionEfficiency))
    const nextOxygenAirText = normalizeOxygenAirText(state.oxygenAirO2Pct, state.oxygenAirN2Pct)
    setOxygenAirO2Pct(nextOxygenAirText.oxygen)
    setOxygenAirN2Pct(nextOxygenAirText.nitrogen)
    setOxygenSupplyCoefficient(state.oxygenSupplyCoefficient ?? '1.15')
    setFeedTemperature(state.feedTemperature ?? '25')
    setMatteTemperature(state.matteTemperature ?? '1300')
    setSlagTemperature(state.slagTemperature ?? '1350')
    setGasTemperature(state.gasTemperature ?? '1350')
    setDustTemperature(state.dustTemperature ?? '1350')
    setLossTemperature(state.lossTemperature ?? '1350')
    setCoolingWaterInletTemperature(state.coolingWaterInletTemperature ?? '30')
    setCoolingWaterOutletTemperature(state.coolingWaterOutletTemperature ?? '38')
    setCoolingWaterMassTh(state.coolingWaterMassTh ?? defaultCoolingWaterMassThForStage(stageId))
    setHeatBalanceFilledBack(restoredHeatBalanceFilledBack)
    setOtherHeatMJh(
      isLegacyConvertingReactionClosure
        ? '1450'
        : normalizeOtherHeatMJhText(state.otherHeatMJh)
    )
    setChemicalHeatMode(normalizeChemicalHeatMode(state.chemicalHeatMode))
    setBatchTableView(resolveResumeBatchTableView(state, stageId))
    setPhaseRatioOverrides(state.phaseRatioOverrides ?? {})
    setManualPhaseRatioColumns(state.manualPhaseRatioColumns ?? {})
    setProductDistributionDrafts(cloneProductDistributionDrafts(state.productDistributionDrafts))
    setProductPhaseOverrides(state.productPhaseOverrides ?? {})
    setProductPhaseManual(state.productPhaseManual ?? false)
    setProductConstraintConfig(nextProductConstraintConfig)
    setProductConstraintValueDrafts({})
    setCustomConstraintTargetDrafts({})
    setCustomConstraintExprDrafts({})
    setNewCustomConstraintDraft(EMPTY_CUSTOM_CONSTRAINT_DRAFT)
    setCustomPhaseRows(state.customPhaseRows ?? {})
    setMaterialPhaseRows(nextMaterialPhaseRows)
    setInputPhaseDrafts({})
    setOutputPhaseDrafts({})
    setInvalidInputPhaseColumns({})
    setInvalidOutputPhaseColumns({})
    const restoredPhaseMaterialId = state.phaseMaterialId ?? null
    const validPhaseMaterialId =
      restoredPhaseMaterialId &&
      nextRawMaterials.some((material) => material.id === restoredPhaseMaterialId && material.name.trim())
        ? restoredPhaseMaterialId
        : nextRawMaterials.find((material) => material.name.trim() && nextPhaseBatchResults?.[material.id])?.id ?? null
    setPhaseMaterialId(validPhaseMaterialId)
    setPhaseAssistTabMaterialIds(
      buildPhaseAssistTabMaterialIds(
        state.phaseAssistTabMaterialIds ?? [],
        validPhaseMaterialId,
        nextPhaseBatchResults
      ).filter((id) => nextRawMaterials.some((material) => material.id === id && material.name.trim()))
    )
    const savedPreview = state.phasePreviewUnknowns ?? null
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
  }, [setWorkflowMessage])

  const persistCurrentStageToCache = useCallback(
    (stageId: CopperProcessStageId | null) => {
      if (!stageId) return
      processStagesCacheRef.current = {
        ...processStagesCacheRef.current,
        [stageId]: captureCurrentProcessStageState(),
      }
    },
    [captureCurrentProcessStageState]
  )

  // Shell remount（设备/汇总等）：从模块级 cache 恢复对应工序，避免配料页卸载后设备页空白
  useEffect(() => {
    const stageId = processStageIdForSheet(activeSheet)
    if (!stageId) return
    let cancelled = false
    const run = async () => {
      let nextState = processStagesCacheRef.current[stageId] ?? createProcessStageStateForId(stageId)
      if ((stageId as CopperProcessStageId) === 'cu_converting') {
        nextState = syncWhiteMatteFromSmelting(
          cloneProcessStageState(nextState),
          processStagesCacheRef.current.cu_smelting
        )
        processStagesCacheRef.current = {
          ...processStagesCacheRef.current,
          cu_converting: nextState,
        }
      }
      if (cancelled) return
      await applyProcessStageStateToUi(nextState, stageId)
      if (cancelled) return
      loadedProcessStageIdRef.current = stageId
    }
    void run()
    return () => {
      cancelled = true
    }
    // 仅随 sheet 对应工序挂载灌库
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSheet])

  const switchProcessStageState = useCallback(
    async (fromStageId: CopperProcessStageId | null, toStageId: CopperProcessStageId) => {
      if (fromStageId) {
        persistCurrentStageToCache(fromStageId)
      }
      let nextState =
        processStagesCacheRef.current[toStageId] ?? createProcessStageStateForId(toStageId)
      if (toStageId === 'cu_converting') {
        nextState = syncWhiteMatteFromSmelting(
          cloneProcessStageState(nextState),
          processStagesCacheRef.current.cu_smelting
        )
        processStagesCacheRef.current = {
          ...processStagesCacheRef.current,
          cu_converting: nextState,
        }
      }
      await applyProcessStageStateToUi(nextState, toStageId)
      loadedProcessStageIdRef.current = toStageId
    },
    [applyProcessStageStateToUi, persistCurrentStageToCache]
  )

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
    const currentStageId =
      processStageIdForSheet(activeSheet) ??
      (base?.stageId ? processStageIdForSheet(base.stageId) : null) ??
      'cu_smelting'
    persistCurrentStageToCache(currentStageId)
    // 只合并已有工序缓存与当前工序，禁止用空白状态覆盖其他工序已保存的产出/热平衡
    const processStages = {} as Record<CopperProcessStageId, CopperProcessStageState>
    for (const stageId of COPPER_PROCESS_STAGE_IDS) {
      const cached = processStagesCacheRef.current[stageId]
      if (cached) {
        processStages[stageId] = cloneProcessStageState(cached)
      }
    }
    if (!processStages[currentStageId]) {
      processStages[currentStageId] = cloneProcessStageState(captureCurrentProcessStageState())
    }
    processStagesCacheRef.current = {
      ...processStagesCacheRef.current,
      ...processStages,
    }
    const currentStageState = processStages[currentStageId] ?? processStages.cu_smelting
    return {
      id: base?.id ?? createCopperCaseId(now),
      name: base?.name ?? formatCopperCaseName(now, smeltMethodName),
      createdAt: base?.createdAt ?? now.toISOString(),
      updatedAt: now.toISOString(),
      smeltMethodId: normalizedSmeltMethodId,
      stageId: isCopperCaseStageId(activeSheet) ? activeSheet : base?.stageId ?? 'cu_smelting',
      processStages,
      rawMaterials: currentStageState.rawMaterials.map(cloneMaterialColumn),
      rawWeightDrafts: { ...currentStageState.rawWeightDrafts },
      solventColumns: currentStageState.solventColumns.map(cloneMaterialColumn),
      fuelColumn: cloneFuelMaterial(currentStageState.fuelColumn),
      oxygenAirColumn: cloneMaterialColumn(
        currentStageState.airColumns.find((column) => column.airRole === 'oxygen') ??
          currentStageState.airColumns[0] ??
          createOxygenAirColumn()
      ),
      airColumns: currentStageState.airColumns.map(cloneMaterialColumn),
      targetFeSiO2: currentStageState.targetFeSiO2,
      targetCaOSiO2: currentStageState.targetCaOSiO2,
      processParameters: { ...currentStageState.processParameters },
      processParametersConfirmed: currentStageState.processParametersConfirmed,
      constraintEditorReached: currentStageState.constraintEditorReached,
      solventSolution: cloneSolventSolution(currentStageState.solventSolution),
      phaseCompletedMaterials: { ...currentStageState.phaseCompletedMaterials },
      phasePreviewUnknowns: currentStageState.phasePreviewUnknowns
        ? {
            materialId: currentStageState.phasePreviewUnknowns.materialId,
            phaseContents: { ...currentStageState.phasePreviewUnknowns.phaseContents },
            values: { ...currentStageState.phasePreviewUnknowns.values },
          }
        : null,
      phaseBatchResults: currentStageState.phaseBatchResults ? { ...currentStageState.phaseBatchResults } : null,
      manualPhaseCells: { ...currentStageState.manualPhaseCells },
      manualSolventWeights: { ...currentStageState.manualSolventWeights },
      manualFuelWeightValid: currentStageState.manualFuelWeightValid,
      manualAirWeights: { ...(currentStageState.manualAirWeights ?? {}) },
      manualAirWeightValid: currentStageState.manualAirWeightValid,
      phaseCompleted: currentStageState.phaseCompleted,
      productCalculated: currentStageState.productCalculated,
      productFilledBack: currentStageState.productFilledBack,
      productSolverResult: currentStageState.productSolverResult
        ? cloneOxySolverResult(currentStageState.productSolverResult)
        : null,
      metcalProductResult: currentStageState.metcalProductResult
        ? cloneOxySolverResult(currentStageState.metcalProductResult)
        : null,
      heatBalanced: currentStageState.heatBalanced,
      calculatedHeatBalance: currentStageState.calculatedHeatBalance
        ? cloneHeatBalanceResult(currentStageState.calculatedHeatBalance)
        : null,
      fuelLhv: currentStageState.fuelLhv,
      fuelEfficiency: currentStageState.fuelEfficiency,
      oxygenAirO2Pct: currentStageState.oxygenAirO2Pct,
      oxygenAirN2Pct: currentStageState.oxygenAirN2Pct,
      oxygenSupplyCoefficient: currentStageState.oxygenSupplyCoefficient,
      feedTemperature: currentStageState.feedTemperature,
      matteTemperature: currentStageState.matteTemperature,
      slagTemperature: currentStageState.slagTemperature,
      gasTemperature: currentStageState.gasTemperature,
      dustTemperature: currentStageState.dustTemperature,
      lossTemperature: currentStageState.lossTemperature,
      coolingWaterInletTemperature: currentStageState.coolingWaterInletTemperature,
      coolingWaterOutletTemperature: currentStageState.coolingWaterOutletTemperature,
      coolingWaterMassTh: currentStageState.coolingWaterMassTh,
      coolingWaterHeatMJh: currentStageState.calculatedHeatBalance
        ? formatTableNumber(currentStageState.calculatedHeatBalance.coolingWaterHeatMJh)
        : '0',
      heatLossMJh: '0',
      heatBalanceFilledBack: currentStageState.heatBalanceFilledBack,
      otherHeatMJh: currentStageState.otherHeatMJh,
      chemicalHeatMode: currentStageState.chemicalHeatMode ?? 'hess',
      annualHours,
      equipmentIntensity,
      targetScaleWanTpa,
      equipmentAdjustments: { ...equipmentAdjustments },
      equipmentDimensionAdjustments: { ...equipmentDimensionAdjustments },
      equipmentModelGenerated: { ...equipmentModelGenerated },
      equipmentBomGenerated: { ...equipmentBomGenerated },
      smeltingDailyFeedTd: smeltingDailyFeedDisplay,
      smeltingFeedMode,
      smeltingAnnualFeedTa: smeltingAnnualFeedDisplay,
      smeltingProcessDays,
      smeltingBedCapacity,
      smeltingFurnaceWidthM: formatTableNumber(smeltingDesign.furnaceWidthM),
      smeltingFurnaceLengthM: formatTableNumber(smeltingDesign.furnaceLengthM),
      smeltingDimensionDrive,
      smeltingJacketPitchMm,
      smeltingJacketCountTotal: String(smeltingDesign.jacketCountTotal),
      smeltingJacketCountOneSide: String(smeltingDesign.jacketCountOneSide),
      smeltingJacketRemainderDecision,
      smeltingSlagDensityTm3,
      smeltingMatteDensityTm3,
      smeltingOxygenNm3h: smeltingOxygenDisplay,
      smeltingTuyereOxygenNm3h,
      smeltingTuyereCount: smeltingTuyereCountDisplay,
      smeltingDailyFeedOverridden,
      smeltingAnnualFeedOverridden,
      smeltingOxygenOverridden,
      smeltingTuyereCountOverridden,
      batchTableView: currentStageState.batchTableView,
      phaseRatioOverrides: { ...currentStageState.phaseRatioOverrides },
      manualPhaseRatioColumns: { ...currentStageState.manualPhaseRatioColumns },
      productDistributionDrafts: cloneProductDistributionDrafts(currentStageState.productDistributionDrafts),
      productPhaseOverrides: { ...currentStageState.productPhaseOverrides },
      productPhaseManual: currentStageState.productPhaseManual,
      productConstraintConfig: currentStageState.productConstraintConfig
        ? cloneOxyConstraintConfig(currentStageState.productConstraintConfig)
        : createDefaultProductConstraintConfig(
            processStageIdForSheet(activeSheet) ?? loadedProcessStageIdRef.current ?? 'cu_smelting'
          ),
      customPhaseRows: Object.fromEntries(
        Object.entries(currentStageState.customPhaseRows).map(([columnId, rows]) => [
          columnId,
          rows.map((row) => ({ ...row, fractions: { ...row.fractions } })),
        ])
      ),
      materialPhaseRows: Object.fromEntries(
        Object.entries(currentStageState.materialPhaseRows).map(([materialId, rows]) => [
          materialId,
          rows.map((row) => ({ ...row, fractions: { ...row.fractions } })),
        ])
      ),
      phaseMaterialId: currentStageState.phaseMaterialId,
      phaseAssistTabMaterialIds: [...currentStageState.phaseAssistTabMaterialIds],
    }
  }

  const buildBlankCaseRecord = (name: string): CopperCaseRecord => {
    const now = new Date()
    const smeltingState = createBlankProcessStageState()
    const processStages = {
      cu_smelting: cloneProcessStageState(smeltingState),
    } as CopperCaseProcessStages
    const defaultRawMaterials = smeltingState.rawMaterials
    const defaultAirColumns = smeltingState.airColumns
    return {
      id: createCopperCaseId(now),
      name,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      smeltMethodId: normalizedSmeltMethodId,
      stageId: 'cu_smelting',
      processStages,
      rawMaterials: defaultRawMaterials.map(cloneMaterialColumn),
      rawWeightDrafts: { ...smeltingState.rawWeightDrafts },
      solventColumns: smeltingState.solventColumns.map(cloneMaterialColumn),
      fuelColumn: cloneFuelMaterial(smeltingState.fuelColumn),
      oxygenAirColumn: cloneMaterialColumn(
        defaultAirColumns.find((column) => column.airRole === 'oxygen') ?? defaultAirColumns[0]!
      ),
      airColumns: defaultAirColumns.map(cloneMaterialColumn),
      targetFeSiO2: smeltingState.targetFeSiO2,
      targetCaOSiO2: smeltingState.targetCaOSiO2,
      processParameters: { ...smeltingState.processParameters },
      processParametersConfirmed: false,
      constraintEditorReached: false,
      solventSolution: null,
      phaseCompletedMaterials: {},
      phasePreviewUnknowns: null,
      phaseBatchResults: null,
      manualPhaseCells: {},
      manualSolventWeights: {},
      manualFuelWeightValid: false,
      manualAirWeights: {},
      manualAirWeightValid: false,
      phaseCompleted: false,
      productCalculated: false,
      productFilledBack: false,
      productSolverResult: null,
      metcalProductResult: null,
      heatBalanced: false,
      calculatedHeatBalance: null,
      fuelLhv: smeltingState.fuelLhv,
      fuelEfficiency: smeltingState.fuelEfficiency,
      oxygenAirO2Pct: smeltingState.oxygenAirO2Pct,
      oxygenAirN2Pct: smeltingState.oxygenAirN2Pct,
      oxygenSupplyCoefficient: smeltingState.oxygenSupplyCoefficient,
      feedTemperature: smeltingState.feedTemperature,
      matteTemperature: smeltingState.matteTemperature,
      slagTemperature: smeltingState.slagTemperature,
      gasTemperature: smeltingState.gasTemperature,
      dustTemperature: smeltingState.dustTemperature,
      lossTemperature: smeltingState.lossTemperature,
      coolingWaterInletTemperature: smeltingState.coolingWaterInletTemperature,
      coolingWaterOutletTemperature: smeltingState.coolingWaterOutletTemperature,
      coolingWaterMassTh: smeltingState.coolingWaterMassTh,
      coolingWaterHeatMJh: '0',
      heatLossMJh: '0',
      heatBalanceFilledBack: false,
      otherHeatMJh: smeltingState.otherHeatMJh,
      chemicalHeatMode: smeltingState.chemicalHeatMode ?? 'hess',
      annualHours: '7200',
      equipmentIntensity: '32',
      targetScaleWanTpa: '10',
      equipmentAdjustments: { smelting: '1', converting: '1', refining: '1' },
      equipmentDimensionAdjustments: { smelting: '1', converting: '1', refining: '1' },
      equipmentModelGenerated: { smelting: false, converting: false, refining: false },
      equipmentBomGenerated: { smelting: false, converting: false, refining: false },
      smeltingDailyFeedTd: '',
      smeltingFeedMode: 'daily',
      smeltingAnnualFeedTa: '',
      smeltingProcessDays: String(DEFAULT_SMELTING_PROCESS_DAYS),
      smeltingBedCapacity: '',
      smeltingFurnaceWidthM: String(DEFAULT_SMELTING_FURNACE_WIDTH_M),
      smeltingFurnaceLengthM: '',
      smeltingDimensionDrive: 'width',
      smeltingJacketPitchMm: String(DEFAULT_SMELTING_JACKET_PITCH_MM),
      smeltingJacketCountTotal: '',
      smeltingOxygenNm3h: '',
      smeltingTuyereOxygenNm3h: String(DEFAULT_SMELTING_TUYERE_OXYGEN_NM3H),
      smeltingTuyereCount: '',
      smeltingSlagDensityTm3: String(DEFAULT_SMELTING_SLAG_DENSITY_TM3),
      smeltingMatteDensityTm3: String(DEFAULT_SMELTING_MATTE_DENSITY_TM3),
      smeltingDailyFeedOverridden: false,
      smeltingAnnualFeedOverridden: false,
      smeltingOxygenOverridden: false,
      smeltingJacketRemainderDecision: null,
      smeltingTuyereCountOverridden: false,
      batchTableView: 'element',
      phaseRatioOverrides: {},
      manualPhaseRatioColumns: {},
      productDistributionDrafts: cloneProductDistributionDrafts(smeltingState.productDistributionDrafts),
      productPhaseOverrides: {},
      productPhaseManual: false,
      productConstraintConfig: createDefaultProductConstraintConfig(),
      customPhaseRows: {},
      materialPhaseRows: {},
      phaseMaterialId: null,
      phaseAssistTabMaterialIds: [],
    }
  }

  const caseContentFingerprint = (
    record: Parameters<typeof buildPersistedCaseContent>[0]
  ) =>
    serializePersistedCaseContent(
      normalizePersistedContentForDirtyCheck(buildPersistedCaseContent(record))
    )

  const captureCurrentCaseFingerprint = () => {
    const snapshot = buildCaseSnapshot(
      activeCase
        ? {
            id: activeCase.id,
            name: activeCase.name,
            createdAt: activeCase.createdAt,
            stageId: activeCase.stageId,
          }
        : undefined
    )
    return caseContentFingerprint(snapshot)
  }

  const markCurrentCaseClean = () => {
    cleanCaseFingerprintRef.current = captureCurrentCaseFingerprint()
    pendingMarkCaseCleanRef.current = false
  }

  const saveCurrentCase = () => {
    const base = activeCaseId ? caseRecords.find((record) => record.id === activeCaseId) : undefined
    const record = buildCaseSnapshot(base)
    persistCopperCases([record, ...caseRecords.filter((item) => item.id !== record.id)])
    setActiveCaseId(record.id)
    cleanCaseFingerprintRef.current = caseContentFingerprint(record)
    pendingMarkCaseCleanRef.current = false
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

  const openCopperCase = async (record: CopperCaseRecord) => {
    const processStages = resolveCaseProcessStages(record)
    processStagesCacheRef.current = { ...processStages }
    const bomGenerated = record.equipmentBomGenerated ?? { smelting: false, converting: false, refining: false }
    const savedStageId = normalizeCopperCaseStageId(record.stageId)
    // 大页签：回到上次保存页；若因门禁不可达，回退到最近可进入页（不自动跳到更远工序）
    const resolveOpenCaseSheet = (): CopperCaseStageId => {
      const isUnlocked = (sheet: CopperCaseStageId) =>
        copperStageUnlockBlockReason({
          targetSheet: sheet,
          getProcessState: (stageId) => processStages[stageId],
          equipmentBomGenerated: bomGenerated,
        }) == null

      let target = savedStageId
      while (!isUnlocked(target)) {
        const prev = previousCopperCaseStageId(target)
        if (!prev) return 'cu_smelting'
        target = prev
      }
      return target
    }

    const targetSheet = resolveOpenCaseSheet()
    const targetStageId = processStageIdForSheet(targetSheet) ?? 'cu_smelting'
    let stageState =
      processStages[targetStageId] ?? createProcessStageStateForId(targetStageId)
    if (targetStageId === 'cu_converting') {
      stageState = syncWhiteMatteFromSmelting(
        cloneProcessStageState(stageState),
        processStages.cu_smelting
      )
      processStagesCacheRef.current = {
        ...processStagesCacheRef.current,
        cu_converting: stageState,
      }
    }
    await applyProcessStageStateToUi(stageState, targetStageId)
    loadedProcessStageIdRef.current = targetStageId
    applyCaseEquipmentStateToUi(record)
    setActiveCaseId(record.id)
    pendingMarkCaseCleanRef.current = true
    setCaseMessage(`已打开案例：${record.name}`)
    onActiveCaseNameChange?.(record.name)
    onStageSelect(targetSheet)
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
              accept: {
                'application/octet-stream': [COPPER_CASE_FILE_EXT],
                'application/json': ['.metcal-copper-case.json', '.json'],
              },
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
      setCaseMessage('案例文件读取失败，请确认文件为本软件导出的 .metcal 格式。')
    }
  }

  const importMetcalFloFile = async (file: File | null) => {
    if (!file) return
    setIsFloImportReading(true)
    setFloImportReadingStep(0)
    setFloImportReadingFileName(file.name)
    const startedAt = performance.now()
    try {
      // 先让读取中遮罩完成绘制，再进入可能阻塞主线程的解析
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      })
      setFloImportReadingStep(0)
      const buffer = await file.arrayBuffer()
      setFloImportReadingStep(1)
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      })
      const referenceTemplateBuffer = await loadDefaultCopperFloTemplate()
      const bundle = buildMetcalFloImportBundle(buffer, { referenceTemplateBuffer })
      setFloImportReadingStep(2)
      if (!bundle.stages.length || bundle.stages[0]?.stageId !== 'smelting') {
        setCaseMessage('未从 Flo 文件中识别到带有效产出结果的熔炼工序，请确认文件是否为有效的 MetCal 铜流程案例。')
        return
      }
      setFloImportPreview({ bundle, fileName: file.name })
      setCaseMessage(`已解析 Flo：${file.name}（${bundle.stages.map((stage) => stage.stageName).join('、')}）`)
    } catch (error) {
      setCaseMessage(`Flo 文件读取失败：${error instanceof Error ? error.message : String(error)}`)
    } finally {
      const elapsed = performance.now() - startedAt
      if (elapsed < 450) {
        await new Promise((resolve) => window.setTimeout(resolve, 450 - elapsed))
      }
      setIsFloImportReading(false)
      setFloImportReadingStep(0)
      setFloImportReadingFileName('')
    }
  }

  const importWorkspaceFile = async (file: File | null) => {
    if (!file) return
    if (isMetcalFloFileName(file.name)) {
      await importMetcalFloFile(file)
      return
    }
    if (isCopperCaseFileName(file.name)) {
      await importCopperCaseFile(file)
      return
    }
    setCaseMessage('请选择 .metcal（本软件案例）或 .flo（MetCal，仅导入混料/原料）文件。')
  }

  const confirmFloImport = (caseNameInput: string) => {
    if (!floImportPreview) return
    const { bundle, fileName } = floImportPreview
    const smeltingStage = bundle.stages.find((stage) => stage.stageId === 'smelting')
    if (!smeltingStage) return
    const materials = smeltingStage.rawMaterials.map(cloneMaterialColumn)
    const solvents = smeltingStage.solventColumns.map(cloneMaterialColumn)
    const gases = smeltingStage.airColumns.map(cloneMaterialColumn)
    const fuel = cloneFuelMaterial(smeltingStage.fuelColumn)
    const baseName = fileName.replace(/\.flo$/i, '').trim()
    const caseName = caseNameInput.trim() || baseName || suggestCopperCaseName(smeltMethodName)
    const phaseState = buildMetcalImportedPhaseState(materials, smeltingStage.extraction.feeds)
    const importedParams = smeltingStage.constraints.processParameters
    const importedConstraints = applyProcessParameters(
      normalizeOxyConstraintConfig(smeltingStage.constraints.config),
      importedParams,
      { addMissingConstraints: true }
    )
    const record = buildBlankCaseRecord(caseName)
    record.rawMaterials = materials.map(cloneMaterialColumn)
    record.rawWeightDrafts = Object.fromEntries(
      materials.map((material) => [material.id, String(material.weight)])
    )
    record.solventColumns = solvents.map(cloneMaterialColumn)
    record.fuelColumn = cloneFuelMaterial(fuel)
    record.airColumns = gases.map(cloneMaterialColumn)
    record.oxygenAirColumn = cloneMaterialColumn(
      gases.find((column) => column.airRole === 'oxygen') ?? gases[0] ?? createOxygenAirColumn()
    )
    record.phaseBatchResults = phaseState.phaseBatchResults
    record.phaseCompletedMaterials = { ...phaseState.phaseCompletedMaterials }
    record.phaseCompleted = phaseState.phaseCompleted
    record.materialPhaseRows = Object.fromEntries(
      Object.entries(phaseState.materialPhaseRows).map(([id, rows]) => [
        id,
        rows.map((row) => ({ ...row, fractions: { ...row.fractions } })),
      ])
    )
    record.productConstraintConfig = cloneOxyConstraintConfig(importedConstraints)
    record.processParameters = { ...importedParams }
    record.targetFeSiO2 = String(importedParams.feSiO2)
    record.batchTableView = 'element'
    const importedMetcalProduct = smeltingStage.productResults.result
      ? cloneOxySolverResult(smeltingStage.productResults.result)
      : null
    record.metcalProductResult = importedMetcalProduct
    const smelting = record.processStages?.cu_smelting
    if (smelting) {
      smelting.rawMaterials = materials.map(cloneMaterialColumn)
      smelting.rawWeightDrafts = { ...record.rawWeightDrafts }
      smelting.solventColumns = solvents.map(cloneMaterialColumn)
      smelting.fuelColumn = cloneFuelMaterial(fuel)
      smelting.airColumns = gases.map(cloneMaterialColumn)
      smelting.phaseBatchResults = phaseState.phaseBatchResults
      smelting.phaseCompletedMaterials = { ...phaseState.phaseCompletedMaterials }
      smelting.phaseCompleted = phaseState.phaseCompleted
      smelting.materialPhaseRows = Object.fromEntries(
        Object.entries(phaseState.materialPhaseRows).map(([id, rows]) => [
          id,
          rows.map((row) => ({ ...row, fractions: { ...row.fractions } })),
        ])
      )
      smelting.productConstraintConfig = cloneOxyConstraintConfig(importedConstraints)
      smelting.processParameters = { ...importedParams }
      smelting.targetFeSiO2 = String(importedParams.feSiO2)
      smelting.batchTableView = 'element'
      smelting.metcalProductResult = importedMetcalProduct
      smelting.materialLibrary = [
        ...materials.map(
          (material): CopperLibraryMaterial => {
            const feed = smeltingStage.extraction.feeds.find((item) => item.name === material.name)
            return {
              id: material.id,
              name: material.name,
              category: feed?.feedGroup === 'other' ? 'return' : 'concentrate',
              ratios: { ...material.ratios },
              unitPrice: material.unitPrice ?? 0,
            }
          }
        ),
        ...createSmeltingMaterialLibrary().filter((item) => item.category === 'flux'),
      ]
    }
    const convertingStage = bundle.stages.find((stage) => stage.stageId === 'converting')
    let convertingConstraintNote = ''
    let convertingMetcalNote = ''
    if (convertingStage) {
      const convertingConstraintResult = convertingStage.constraints
      const importedConvertingConstraints = normalizeOxyConstraintConfig(
        convertingConstraintResult.config,
        'cu_converting'
      )
      const importedConvertingMetcalProduct = convertingStage.productResults.result
        ? cloneOxySolverResult(convertingStage.productResults.result)
        : null
      const convertingBase =
        record.processStages?.cu_converting ?? createProcessStageStateForId('cu_converting')
      const convertingWithFeeds = applyMetcalConvertingFeedsToState(convertingBase, [
        ...convertingStage.extraction.feeds,
        ...convertingStage.extraction.solvents,
      ])
      record.processStages = {
        ...record.processStages,
        cu_converting: {
          ...convertingWithFeeds,
          airColumns: convertingStage.airColumns.map(cloneMaterialColumn),
          productConstraintConfig: cloneOxyConstraintConfig(importedConvertingConstraints),
          processParameters: { ...convertingConstraintResult.processParameters },
          targetFeSiO2: String(convertingConstraintResult.processParameters.feSiO2),
          coolingWaterMassTh: DEFAULT_CONVERTING_COOLING_WATER_MASS_TH,
          metcalProductResult: importedConvertingMetcalProduct,
        },
      }
      convertingConstraintNote =
        convertingConstraintResult.matchedCustomExprs.length > 0
          ? `；吹炼投入已写入，自定义约束 ${convertingConstraintResult.matchedCustomExprs.length} 条、元素 ${convertingConstraintResult.config.elementDistributions.length} 种`
          : '；吹炼投入与约束已写入'
      convertingMetcalNote = importedConvertingMetcalProduct
        ? `；已读取吹炼 MetCal 产出 ${convertingStage.productResults.streams.length} 股`
        : ''
    }
    persistCopperCases([record, ...caseRecords])
    void openCopperCase(record).then(() => {
      setBatchTableView('element')
      window.requestAnimationFrame(() => {
        calculationTableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
    })
    setNewCaseName(suggestCopperCaseName(smeltMethodName))
    setFloImportPreview(null)
    const skippedNote = bundle.extraction.warnings.some((w) => w.includes('已跳过非熔炼投入熔剂'))
      ? '；已排除吹炼石灰石等非熔炼投入'
      : ''
    setCaseMessage(
      phaseState.phaseCompleted
        ? `已从 Flo 导入熔炼案例（原料 ${materials.length}、熔剂 ${solvents.length}、气体 ${gases.length}、产出约束 ${smeltingStage.constraints.matchedCustomExprs.length} 条${importedMetcalProduct ? `；已读取 MetCal 产出 ${smeltingStage.productResults.streams.length} 股` : ''}${skippedNote}${convertingConstraintNote}${convertingMetcalNote}）并跳过物相：${record.name}`
        : `已从 Flo 导入熔炼案例（原料 ${materials.length}、熔剂 ${solvents.length}、气体 ${gases.length}、产出约束 ${smeltingStage.constraints.matchedCustomExprs.length} 条${importedMetcalProduct ? `；已读取 MetCal 产出 ${smeltingStage.productResults.streams.length} 股` : ''}${skippedNote}${convertingConstraintNote}${convertingMetcalNote}）：${record.name}`
    )
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
    if (!isWorkspaceImportFileName(file.name)) {
      setCaseMessage('请拖入 .metcal（本软件案例）或 .flo（MetCal，仅导入混料/原料）文件。')
      return
    }
    void importWorkspaceFile(file)
  }

  const resolveProcessStageStateForGate = useCallback(
    (stageId: CopperProcessStageId): CopperProcessStageState | null => {
      const loadedId = loadedProcessStageIdRef.current ?? processStageIdForSheet(activeSheet)
      if (loadedId === stageId) {
        return captureCurrentProcessStageState()
      }
      return processStagesCacheRef.current[stageId] ?? null
    },
    [activeSheet, captureCurrentProcessStageState]
  )

  const getCopperStageUnlockBlockReason = useCallback(
    (sheet: SheetId) =>
      copperStageUnlockBlockReason({
        targetSheet: sheet,
        getProcessState: resolveProcessStageStateForGate,
        equipmentBomGenerated,
      }),
    [equipmentBomGenerated, resolveProcessStageStateForGate]
  )

  const stageUnlockReasons = useMemo(() => {
    const reasons: Partial<Record<CopperCaseStageId, string | null>> = {}
    for (const stage of STAGES) {
      reasons[stage.id] = getCopperStageUnlockBlockReason(stage.id)
    }
    return reasons
  }, [getCopperStageUnlockBlockReason, productCalculated, productFilledBack, heatBalanced, heatBalanceFilledBack, calculatedHeatBalance, oxySolverResult, equipmentBomGenerated, activeSheet])

  const confirmSaveBeforeCaseNavigation = (sheet: SheetId) => {
    if (sheet === activeSheet) return

    // 离开前先把当前工序结果写入缓存，避免空白模板覆盖已有产出/热平衡
    const currentProcessStageId =
      loadedProcessStageIdRef.current ?? processStageIdForSheet(activeSheet)
    if (currentProcessStageId) {
      persistCurrentStageToCache(currentProcessStageId)
      if (!loadedProcessStageIdRef.current) {
        loadedProcessStageIdRef.current = currentProcessStageId
      }
    }

    const unlockBlock = getCopperStageUnlockBlockReason(sheet)
    if (unlockBlock) {
      setWorkflowMessage(unlockBlock, 'warning')
      return
    }

    // 工序页会重新挂载，校验通过后先保存当前案例，再进入下一页。
    // 这也保证设备选型中的手填参数不会只停留在当前组件内存中。
    if (activeSheet !== 'raw_material') {
      saveCurrentCase()
    }

    const loadedProcessStageId = loadedProcessStageIdRef.current
    const targetProcessStageId = processStageIdForSheet(sheet)
    if (targetProcessStageId && targetProcessStageId !== loadedProcessStageId) {
      const fromStageId = loadedProcessStageId ?? processStageIdForSheet(activeSheet)
      void switchProcessStageState(fromStageId, targetProcessStageId).then(() => {
        onStageSelect(sheet)
      })
      return
    }

    const stageToPersist = loadedProcessStageId ?? processStageIdForSheet(activeSheet)
    if (stageToPersist) {
      persistCurrentStageToCache(stageToPersist)
    }

    onStageSelect(sheet)
  }

  const continuePendingNavigation = (_shouldSave: boolean) => {
    if (!pendingNavigationSheet) return
    const nextSheet = pendingNavigationSheet
    const unlockBlock = getCopperStageUnlockBlockReason(nextSheet)
    if (unlockBlock) {
      setPendingNavigationSheet(null)
      setWorkflowMessage(unlockBlock, 'warning')
      return
    }
    if (activeSheet !== 'raw_material') saveCurrentCase()
    setPendingNavigationSheet(null)
    onStageSelect(nextSheet)
  }

  useEffect(() => {
    const previousMethodId = getLastNormalizedSmeltMethodId()
    if (previousMethodId === normalizedSmeltMethodId) {
      return
    }
    setLastNormalizedSmeltMethodId(normalizedSmeltMethodId)
    // 首次挂载只记录方法，不清空：一页一文件 remount / 打开案例后切到配料页不得打回工作区
    if (previousMethodId == null) {
      setNewCaseName(suggestCopperCaseName(smeltMethodName))
      return
    }
    setActiveCaseId(null)
    onActiveCaseNameChange?.(null)
    setNewCaseName(suggestCopperCaseName(smeltMethodName))
    clearCopperProcessStagesCache()
    loadedProcessStageIdRef.current = null
    cleanCaseFingerprintRef.current = null
    pendingMarkCaseCleanRef.current = false
    if (activeSheet !== 'raw_material') {
      onStageSelect('raw_material')
    }
  }, [normalizedSmeltMethodId, smeltMethodName])

  useEffect(() => {
    if (!pendingMarkCaseCleanRef.current || !activeCaseId) return
    const timer = window.setTimeout(() => {
      if (!pendingMarkCaseCleanRef.current) return
      markCurrentCaseClean()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [activeCaseId])

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

  const oxyProductSolveDescription = () => {
    const stage = oxyProductDisplayStageForProcess(activeProcessStageId)
    const names = OXY_SIDE_BLOW_PRODUCT_KEYS.map((key) => oxyProductDisplayName(key, stage)).join('、')
    return `计算说明：先列举六产物元素闭合、元素质量守恒、元素约束与自定义约束方程，再求解${names}的质量、物相组成及元素组成。`
  }

  const renderProductCalculationPanel = (
    key = 'product-calculation-panel',
    extraClassName = '',
    options: { showIntro?: boolean } = {}
  ) => {
    const showIntro = options.showIntro ?? true
    const hasResult = hasProductResult
    const recommendedFuelWeight = oxySolverResult?.recommended.fuelWeight ?? 0
    const conflictResult = productCalculationFailure ?? oxySolverResult
    const conflictRows = productSolverConflictRows(conflictResult)
    const showConflictPanel = Boolean(conflictResult && !conflictResult.acceptable)

    return (
      <div key={key} className={`space-y-4 ${extraClassName}`}>
        {showIntro && (
          <div className={`${hintText(darkMode)} space-y-1 text-sm leading-relaxed`}>
            <p>在配料总表完成混料投料量与各原料物相成分后，点击计算产出结果，计算成功后会直接回填到配料总表的产出页签。</p>
            <p>{oxyProductSolveDescription()}</p>
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
            {isProductCalculating ? '计算中...' : '计算'}
          </button>
        </div>
        {hasResult && !isProductCalculating && productFilledBack && (
          <div className={assistAlertPanelClassName(darkMode, oxySolverResult?.acceptanceLevel === 'strict' ? 'success' : 'warning')}>
            {`${oxySolverResult?.acceptanceLevel === 'relaxed' ? `近似收敛（最大相对残差 ${format(oxySolverResult.maxRelativeResidual, 4)}）：` : '已回填：'}产出结果已写入配料总表产出-产物物相表与产出-产物元素表${
              recommendedFuelWeight > 0 ? `；推荐燃料煤 ${format(recommendedFuelWeight)} t/h` : ''
            }。`}
          </div>
        )}
        {hasResult && !isProductCalculating && !productFilledBack && Boolean(oxySolverResult?.acceptable) && (
          <div className={assistAlertPanelClassName(darkMode, 'warning')}>
            投入或约束已变更，当前产出结果已失效。请重新点击「计算」更新产出并回填。
          </div>
        )}
        {showConflictPanel && (
          <div className={productConflictPanelClassName(darkMode)} role="alert">
            <div className="font-semibold">产出计算无可回填结果，请检查约束冲突</div>
            <div className="mt-1 whitespace-pre-line leading-relaxed">{productSolverConflictSummary(conflictResult)}</div>
            {conflictRows.length > 0 && (
              <ul className="mt-2 space-y-1 leading-relaxed">
                {conflictRows.map((row, index) => (
                  <li key={`${row.kind}-${row.expr}-${index}`}>
                    {index + 1}. {formatConstraintConflictLine(row)}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {productCalculationError && !isProductCalculating && (
          <div className={productConflictPanelClassName(darkMode)} role="alert">
            <div className="font-semibold">产出计算异常，未生成结果</div>
            <div className="mt-1 whitespace-pre-line leading-relaxed">{productCalculationError}</div>
          </div>
        )}
      </div>
    )
  }

  const renderProductCalculationIntro = () => (
    <div className={`${hintText(darkMode)} mt-4 space-y-1 text-sm leading-relaxed`}>
      <p>打开方式：在配料总表切换到产出-产物物相表或产出-产物元素表，未完成产出时会自动打开本区。</p>
      <p>{oxyProductSolveDescription()}</p>
    </div>
  )

  const renderProcessParametersPanel = (compact = false) => (
    <CopperProcessParametersPanel
      darkMode={darkMode}
      drafts={processParameterDrafts}
      onDraftChange={(field, value) => {
        setProcessParameterDrafts((prev) => ({ ...prev, [field]: value }))
      }}
      onCommit={commitProcessParameters}
      onNext={goToConstraintEditor}
      nextDisabled={false}
      compact={compact}
    />
  )

  const renderProductResultPlaceholder = () => (
    <div
      className={`rounded-lg border px-3 py-8 text-center text-sm ${
        darkMode ? 'border-gray-600 text-gray-400' : 'border-gray-200 text-gray-500'
      }`}
    >
      {activeProcessStageId === 'cu_converting'
        ? '请在产出计算专区设置产出约束并点击「计算产出结果」，成功后会自动回填到这里。'
        : '请先在「关键参数输入」页签确认参数，再在产出计算专区设置约束并点击「计算产出结果」，成功后会自动回填到这里。'}
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
                  ? `Create and manage ${smeltMethodName.toLowerCase()} copper smelting cases. After creating a case, continue with smelting, converting, refining, and equipment selection in the same project. Import .metcal cases from this app, or import mix/raw-material data from MetCal .flo files.`
                  : `用于建立、管理和追溯${smeltMethodName}铜冶炼计算案例。新建案例后进入熔炼工作表，后续可在同一案例内完成吹炼、精炼和设备选型计算。可导入本软件 .metcal 案例，也可从 MetCal .flo 导入混料/原料信息。`}
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
            <button
              className={btnSecondary(darkMode)}
              onClick={() => caseImportInputRef.current?.click()}
              disabled={isFloImportReading}
            >
              {isFloImportReading ? '读取中…' : '导入案例'}
            </button>
            <input
              ref={caseImportInputRef}
              type="file"
              accept=".metcal,.flo"
              className="hidden"
              onChange={(event) => {
                void importWorkspaceFile(event.target.files?.[0] ?? null)
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
            isFloImportReading
              ? darkMode
                ? 'border-blue-500 bg-blue-950/30'
                : 'border-blue-400 bg-blue-50'
              : caseDropActive
                ? darkMode
                  ? 'border-blue-400 bg-blue-950/40'
                  : 'border-blue-500 bg-blue-50'
                : darkMode
                  ? 'border-gray-600 bg-gray-900/20'
                  : 'border-gray-300 bg-gray-50/80'
          }`}
          onDragEnter={isFloImportReading ? undefined : handleCaseDragEnter}
          onDragLeave={isFloImportReading ? undefined : handleCaseDragLeave}
          onDragOver={isFloImportReading ? undefined : handleCaseDragOver}
          onDrop={isFloImportReading ? undefined : handleCaseDrop}
          aria-busy={isFloImportReading}
        >
          <p className={`text-base font-medium ${darkMode ? 'text-gray-100' : 'text-gray-800'}`}>
            {isFloImportReading
              ? '正在读取 Flo 文件…'
              : caseDropActive
                ? '松开鼠标即可导入'
                : '将案例或 MetCal 文件拖入此处即可导入'}
          </p>
          <p className={`mt-2 text-sm ${hintText(darkMode)}`}>
            {isFloImportReading
              ? '正在解析侧吹熔炼投入、物相与产出约束，请稍候。'
              : '支持 .metcal（本软件导出的案例）与 .flo（MetCal 流程文件，仅获取混料/原料信息）；也可使用上方「导入案例」选择文件。'}
          </p>
        </div>

        {isFloImportReading && (
          <IteratingOverlay
            darkMode={darkMode}
            title="正在读取 Flo 文件"
            description="解析侧吹熔炼投入与约束，请稍候…"
            detail={floImportReadingFileName || undefined}
            steps={['读取文件', '解析混料与物相', '整理预览数据']}
            currentStep={floImportReadingStep}
          />
        )}

        {floImportPreview && (
          <MetcalFloImportPanel
            darkMode={darkMode}
            bundle={floImportPreview.bundle}
            sourceFileName={floImportPreview.fileName}
            onConfirm={confirmFloImport}
            onCancel={() => setFloImportPreview(null)}
          />
        )}

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

  if (isCopperRefiningPlaceholderSheet(activeSheet)) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-4">
        <div ref={stagePageTopRef} className={stagePageTopShellClass(darkMode, stageEnterHighlight)}>
          <StageSheetTabs
            darkMode={darkMode}
            activeSheet={activeSheet}
            stageUnlockReasons={stageUnlockReasons}
            onStageSelect={confirmSaveBeforeCaseNavigation}
          />
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
          <div
            className={`rounded-lg border-2 border-dashed px-6 py-16 text-center ${
              darkMode ? 'border-gray-600 bg-gray-800/40 text-gray-400' : 'border-gray-300 bg-gray-50 text-gray-500'
            }`}
          >
            <div className={`text-base font-semibold ${darkMode ? 'text-gray-200' : 'text-gray-700'}`}>功能开发中，敬请期待</div>
            <p className={`${hintText(darkMode)} mx-auto mt-2 max-w-xl leading-relaxed`}>
              {activeSheet === 'cu_refining'
                ? '精炼配料与热平衡计算模块待开发，当前不提供可编辑内容。可返回吹炼设备选型，或进入案例汇总查看已完成结果。'
                : '精炼设备选型模块待开发，当前不提供炉型选型与 BOM。可返回吹炼设备选型，或进入案例汇总查看已完成结果。'}
            </p>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
              {previousStageBeforeCurrent && (
                <button
                  type="button"
                  className={btnSecondary(darkMode)}
                  onClick={() => confirmSaveBeforeCaseNavigation(previousStageBeforeCurrent)}
                >
                  返回{copperCaseStageName(previousStageBeforeCurrent)}
                </button>
              )}
              <button
                type="button"
                className={btnPrimary(darkMode)}
                onClick={() => confirmSaveBeforeCaseNavigation('cu_summary')}
              >
                进入案例汇总
              </button>
            </div>
          </div>
        </div>
        <WorkflowBrandFooter darkMode={darkMode} />
      </div>
    )
  }

  if (activeEquipmentStageId) {
    const isSmeltingEquipment = activeEquipmentStageId === 'smelting'
    const canEnterCaseSummary = activeEquipmentBomReady
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-4">
        <div ref={stagePageTopRef} className={stagePageTopShellClass(darkMode, stageEnterHighlight)}>
          <StageSheetTabs
            darkMode={darkMode}
            activeSheet={activeSheet}
            stageUnlockReasons={stageUnlockReasons}
            onStageSelect={confirmSaveBeforeCaseNavigation}
          />
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
              <h3 className={`${sectionTitle(darkMode)} mb-1`}>{activeEquipmentRow?.stage ?? '当前工序'}设备选型</h3>
              <p className={`${hintText(darkMode)} max-w-5xl leading-relaxed`}>
                {isSmeltingEquipment
                  ? '完成熔炼计算后，按单日/年处理量与床能力计算炉床面积，再输入炉宽/炉长/水套参数；风口数默认同水套数，风口能力按氧气流量反算。'
                  : '先输入年产规模、运行时间与床能力等关键参数，计算后匹配炉型并生成三维设备方案；确认三维方案后再生成 BOM 设备清单。'}
              </p>
            </div>
            {!isSmeltingEquipment && (
              <div className="flex flex-wrap gap-2">
                <button className={btnSecondary(darkMode)} onClick={() => updateEquipmentSizingInput(setTargetScaleWanTpa, '10')}>10万吨</button>
                <button className={btnSecondary(darkMode)} onClick={() => updateEquipmentSizingInput(setTargetScaleWanTpa, '20')}>20万吨</button>
              </div>
            )}
          </div>

          {isSmeltingEquipment ? (
            <>
              {!hasStoredProductResult && (
                <div className={`mb-4 rounded-lg border px-3 py-3 text-sm ${darkMode ? 'border-amber-700 bg-amber-950/30 text-amber-100' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
                  请先完成熔炼计算（产出结果）。单日/年处理量与氧气流量可从配料表「从配料导入」，也可直接手填。
                </div>
              )}

              <div className={`rounded-xl border p-4 ${darkMode ? 'border-gray-600 bg-gray-900/20' : 'border-gray-200 bg-white'}`}>
                <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className={`text-sm font-semibold ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}>1. 炉床面积</div>
                    <div className={`${hintText(darkMode)} mt-1`}>{smeltingBedAreaCalcFormula}</div>
                  </div>
                  <div className={`inline-flex rounded-lg border p-0.5 text-xs ${darkMode ? 'border-gray-600 bg-gray-950/40' : 'border-slate-200 bg-slate-100'}`}>
                    <button
                      type="button"
                      className={`rounded-md px-2.5 py-1 font-medium ${
                        smeltingFeedMode === 'daily'
                          ? darkMode
                            ? 'bg-sky-800 text-sky-50'
                            : 'bg-white text-sky-900 shadow-sm'
                          : darkMode
                            ? 'text-gray-300'
                            : 'text-slate-600'
                      }`}
                      onClick={() => setSmeltingFeedMode('daily')}
                    >
                      单日
                    </button>
                    <button
                      type="button"
                      className={`rounded-md px-2.5 py-1 font-medium ${
                        smeltingFeedMode === 'annual'
                          ? darkMode
                            ? 'bg-sky-800 text-sky-50'
                            : 'bg-white text-sky-900 shadow-sm'
                          : darkMode
                            ? 'text-gray-300'
                            : 'text-slate-600'
                      }`}
                      onClick={() => setSmeltingFeedMode('annual')}
                    >
                      年投入
                    </button>
                  </div>
                </div>
                <div className={EQUIP_ROW_GRID}>
                  <div className={`rounded-lg border p-3 ${darkMode ? 'border-gray-700 bg-gray-950/30' : 'border-slate-200 bg-slate-50/90'}`}>
                    <div className={`mb-2 ${EQUIP_BLOCK_TITLE} ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>输入参数</div>
                    <div className={`grid grid-cols-1 gap-3 ${smeltingFeedMode === 'annual' ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
                      {smeltingFeedMode === 'annual' ? (
                        <>
                          <EquipmentInput
                            darkMode={darkMode}
                            label="年投入量（湿） t/a"
                            value={smeltingAnnualFeedDisplay}
                            systemDerived
                            onImportFromBatch={importSmeltingAnnualFeedFromBatch}
                            onChange={(value) =>
                              updateSmeltingEquipmentField(setSmeltingAnnualFeedTa, value, setSmeltingAnnualFeedOverridden)
                            }
                          />
                          <EquipmentInput
                            darkMode={darkMode}
                            label="年处理天数 d"
                            value={smeltingProcessDays}
                            onChange={(value) => updateSmeltingEquipmentField(setSmeltingProcessDays, value)}
                          />
                        </>
                      ) : (
                        <EquipmentInput
                          darkMode={darkMode}
                          label="单日处理量（湿） t/d"
                          value={smeltingDailyFeedDisplay}
                          systemDerived
                          onImportFromBatch={importSmeltingDailyFeedFromBatch}
                          onChange={(value) =>
                            updateSmeltingEquipmentField(setSmeltingDailyFeedTd, value, setSmeltingDailyFeedOverridden)
                          }
                        />
                      )}
                      <EquipmentInput
                        darkMode={darkMode}
                        label="床能力 t/(m²·d)"
                        value={smeltingBedCapacity}
                        onChange={(value) => updateSmeltingEquipmentField(setSmeltingBedCapacity, value)}
                      />
                    </div>
                  </div>
                  <EquipmentResultCard
                    darkMode={darkMode}
                    label="炉床面积"
                    value={formatTableDisplayValue(smeltingDesign.areaM2)}
                    unit="m²"
                    detail={smeltingBedAreaCalcFormula}
                  />
                </div>
                <EquipmentKeyParamPairs darkMode={darkMode} title="关键参数" pairs={smeltingFeedRelatedParams} />
              </div>

              <div className={`mt-4 rounded-xl border p-4 ${darkMode ? 'border-gray-600 bg-gray-900/20' : 'border-gray-200 bg-white'}`}>
                <div className="mb-3">
                  <div className={`text-sm font-semibold ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}>2. 炉型与水套</div>
                  <div className={`${hintText(darkMode)} mt-1`}>
                    水套按间隔沿炉长两侧布置；熔池高度 = 产出量 ÷ (密度 × 余量处置后面积)
                  </div>
                </div>
                <div className={EQUIP_ROW_GRID}>
                  <div className={`rounded-lg border p-3 ${darkMode ? 'border-gray-700 bg-gray-950/30' : 'border-slate-200 bg-slate-50/90'}`}>
                    <div className={`mb-2 ${EQUIP_BLOCK_TITLE} ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>输入参数</div>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                      <EquipmentInput
                        darkMode={darkMode}
                        label="炉宽 m"
                        value={smeltingWidthDisplay}
                        onChange={(value) => {
                          setSmeltingDimensionDrive('width')
                          setSmeltingJacketRemainderDecision(null)
                          updateSmeltingEquipmentField(setSmeltingFurnaceWidthM, value)
                        }}
                      />
                      <EquipmentInput
                        darkMode={darkMode}
                        label="炉长 m"
                        value={smeltingLengthDisplay}
                        systemDerived
                        onChange={(value) => {
                          setSmeltingDimensionDrive('length')
                          setSmeltingJacketRemainderDecision(null)
                          updateSmeltingEquipmentField(setSmeltingFurnaceLengthM, value)
                        }}
                      />
                      <EquipmentInput
                        darkMode={darkMode}
                        label="水套间隔 mm"
                        value={smeltingJacketPitchMm}
                        onChange={(value) => {
                          setSmeltingJacketRemainderDecision(null)
                          updateSmeltingEquipmentField(setSmeltingJacketPitchMm, value)
                        }}
                      />
                    </div>
                  </div>
                  <EquipmentJacketCountCard
                    darkMode={darkMode}
                    oneSide={smeltingJacketCountDisplay.oneSide}
                    total={smeltingJacketCountDisplay.total}
                    updated={smeltingJacketCountDisplay.updated}
                  />
                </div>
                <div className={`mt-3 ${EQUIP_ROW_GRID}`}>
                  {smeltingJacketRemainderOptions ? (
                    <EquipmentJacketRemainderRow
                      darkMode={darkMode}
                      options={smeltingJacketRemainderOptions}
                      decision={smeltingJacketRemainderDecision}
                      onDecide={(next) => {
                        setSmeltingJacketRemainderDecision(next)
                        resetSmeltingEquipmentModel()
                      }}
                    />
                  ) : (
                    <div />
                  )}
                  <EquipmentResultCard
                    darkMode={darkMode}
                    updated={smeltingJacketAreaUpdated}
                    label="更新后熔炼炉面积"
                    value={
                      smeltingJacketAreaDisplay.pending || smeltingJacketAreaDisplay.areaM2 == null
                        ? '—'
                        : formatTableDisplayValue(smeltingJacketAreaDisplay.areaM2)
                    }
                    unit={smeltingJacketAreaDisplay.pending ? undefined : 'm²'}
                    detail={
                      smeltingJacketAreaDisplay.pending
                        ? '选择余量处置方式后更新'
                        : `${formatTableDisplayValue(smeltingJacketAreaDisplay.lengthM ?? 0)} m × ${formatTableDisplayValue(smeltingDesign.furnaceWidthM)} m`
                    }
                  />
                </div>
                <div className={`mt-3 ${EQUIP_ROW_GRID}`}>
                  <div className={`rounded-lg border p-3 ${darkMode ? 'border-gray-700 bg-gray-950/30' : 'border-slate-200 bg-slate-50/90'}`}>
                    <div className={`mb-2 ${EQUIP_BLOCK_TITLE} ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>熔池高度参数</div>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                      <LabeledInput
                        darkMode={darkMode}
                        label="熔炼渣量 t/h"
                        systemDerived
                        value={
                          smeltingBathHeight.productReady
                            ? formatTableDisplayValue(smeltingBathHeight.slagMassTh)
                            : '—'
                        }
                        readOnly
                      />
                      <EquipmentInput
                        darkMode={darkMode}
                        label="熔炼渣密度 t/m³"
                        value={smeltingSlagDensityTm3}
                        onChange={(value) => updateSmeltingEquipmentField(setSmeltingSlagDensityTm3, value)}
                      />
                      <LabeledInput
                        darkMode={darkMode}
                        label="冰铜量 t/h"
                        systemDerived
                        value={
                          smeltingBathHeight.productReady
                            ? formatTableDisplayValue(smeltingBathHeight.matteMassTh)
                            : '—'
                        }
                        readOnly
                      />
                      <EquipmentInput
                        darkMode={darkMode}
                        label="冰铜密度 t/m³"
                        value={smeltingMatteDensityTm3}
                        onChange={(value) => updateSmeltingEquipmentField(setSmeltingMatteDensityTm3, value)}
                      />
                    </div>
                  </div>
                  <EquipmentBathHeightResultCard
                    darkMode={darkMode}
                    slagHeightM={smeltingBathHeight.slagHeightM}
                    matteHeightM={smeltingBathHeight.matteHeightM}
                    ready={smeltingBathHeight.productReady && smeltingBathHeight.areaReady}
                    pendingArea={smeltingJacketAreaDisplay.pending}
                  />
                </div>
                <EquipmentKeyParamsGrid darkMode={darkMode} title="关键参数" items={smeltingCoolingWaterKeyParams} />
              </div>

              <div className={`mt-4 rounded-xl border p-4 ${darkMode ? 'border-gray-600 bg-gray-900/20' : 'border-gray-200 bg-white'}`}>
                <div className="mb-3">
                  <div className={`text-sm font-semibold ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}>3. 风口</div>
                  <div className={`${hintText(darkMode)} mt-1`}>
                    风口数默认同水套数（可改）；风口能力 = 氧气流量 ÷ 风口数
                  </div>
                </div>
                <div className={EQUIP_ROW_GRID}>
                  <div className={`rounded-lg border p-3 ${darkMode ? 'border-gray-700 bg-gray-950/30' : 'border-slate-200 bg-slate-50/90'}`}>
                    <div className={`mb-2 ${EQUIP_BLOCK_TITLE} ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>输入参数</div>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                      <EquipmentInput
                        darkMode={darkMode}
                        label="氧气流量 Nm³/h"
                        value={smeltingOxygenDisplay}
                        systemDerived
                        onImportFromBatch={importSmeltingOxygenFromBatch}
                        onChange={(value) => updateSmeltingEquipmentField(setSmeltingOxygenNm3h, value, setSmeltingOxygenOverridden)}
                      />
                      <EquipmentInput
                        darkMode={darkMode}
                        label="单侧风口数"
                        value={smeltingTuyereCountOneSideDisplay}
                        systemDerived={!smeltingTuyereCountOverridden}
                        headerActionLabel={smeltingTuyereCountOverridden ? '恢复为默认' : undefined}
                        onHeaderAction={
                          smeltingTuyereCountOverridden
                            ? () => {
                                setSmeltingTuyereCountOverridden(false)
                                setSmeltingTuyereCountOneSide(String(smeltingDesign.jacketCountOneSide))
                                setSmeltingTuyereCount(String(smeltingDesign.jacketCountTotal))
                              }
                            : undefined
                        }
                        onChange={(value) => {
                          setSmeltingTuyereCountOverridden(true)
                          setSmeltingTuyereCountOneSide(value)
                          const oneSide = Math.max(0, Math.round(toNumber(value, 0)))
                          setSmeltingTuyereCount(String(oneSide * 2))
                          resetSmeltingEquipmentModel()
                        }}
                      />
                      <EquipmentInput
                        darkMode={darkMode}
                        label="两侧风口数"
                        value={smeltingTuyereCountDisplay}
                        systemDerived={!smeltingTuyereCountOverridden}
                        onChange={(value) => {
                          setSmeltingTuyereCountOverridden(true)
                          setSmeltingTuyereCount(value)
                          const total = Math.max(0, Math.round(toNumber(value, 0)))
                          const oneSide = Math.max(0, Math.round(total / 2))
                          setSmeltingTuyereCountOneSide(String(oneSide))
                          resetSmeltingEquipmentModel()
                        }}
                      />
                    </div>
                  </div>
                  <EquipmentTuyereCapacityCard
                    darkMode={darkMode}
                    oneSideCapacityNm3h={smeltingDesign.tuyereOneSideOxygenCapacityNm3h}
                    fullCapacityNm3h={smeltingDesign.tuyereFullOxygenCapacityNm3h}
                  />
                </div>
                <div className="mt-3">
                  <HeatAuxiliaryParamsStrip
                    darkMode={darkMode}
                    concentrateMassTh={concentrateMass}
                    productResult={calculatedHeatBalance?.finalProductResult ?? oxySolverResult}
                    airColumns={smeltingEquipmentAirColumns}
                  />
                </div>
                <EquipmentGasDetailRows darkMode={darkMode} rows={smeltingGasDetailRows} />
              </div>

              <div className="mt-4 flex justify-end">
                <button type="button" className={btnPrimary(darkMode)} onClick={runEquipmentSizingCalculation}>
                  生成三维方案
                </button>
              </div>
            </>
          ) : (
            <div className={`rounded-xl border p-4 ${darkMode ? 'border-gray-600 bg-gray-900/20' : 'border-gray-200 bg-white'}`}>
              <div className="mb-3">
                <div>
                  <div className={`text-sm font-semibold ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}>1. 参数输入</div>
                  <div className={`${hintText(darkMode)} mt-1`}>按年产量、年运行时间和床能力/单台处理强度计算炉型匹配。</div>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                <LabeledInput darkMode={darkMode} label="目标年产量（万吨/a）" value={targetScaleWanTpa} onChange={(value) => updateEquipmentSizingInput(setTargetScaleWanTpa, value)} />
                <LabeledInput darkMode={darkMode} label="年运行时间 (h/a)" value={annualHours} onChange={(value) => updateEquipmentSizingInput(setAnnualHours, value)} />
                <LabeledInput darkMode={darkMode} label="床能力/单台处理强度 (t/h)" value={equipmentIntensity} onChange={(value) => updateEquipmentSizingInput(setEquipmentIntensity, value)} />
                <LabeledInput
                  darkMode={darkMode}
                  label="三维尺寸调整系数"
                  value={activeEquipmentStageId ? equipmentDimensionAdjustments[activeEquipmentStageId] : '1'}
                  onChange={(value) => activeEquipmentStageId && updateEquipmentDimensionAdjustment(activeEquipmentStageId, value)}
                />
              </div>
              <div className="mt-4 flex justify-end">
                <button type="button" className={btnPrimary(darkMode)} onClick={runEquipmentSizingCalculation}>
                  计算炉型匹配
                </button>
              </div>
            </div>
          )}

          {activeEquipmentModelReady && (
            <div ref={equipmentModelSectionRef} className={`mt-4 rounded-xl border p-4 ${darkMode ? 'border-gray-600 bg-gray-900/20' : 'border-gray-200 bg-white'}`}>
              <div className="mb-3">
                <div>
                  <div className={`text-sm font-semibold ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                    {isSmeltingEquipment ? '4. 三维方案' : '2. 炉型匹配与三维方案'}
                  </div>
                  <div className={`${hintText(darkMode)} mt-1`}>
                    {isSmeltingEquipment
                      ? '三维炉体方案可旋转查看；参数汇总在视图下方，确认后生成 BOM。'
                      : '先查看三维方案与关键参数，再复核炉型匹配明细；确认后生成 BOM 设备清单。'}
                  </div>
                </div>
              </div>
              {isSmeltingEquipment && (
                <SmeltingFurnacePlanPanel
                  darkMode={darkMode}
                  design={smeltingDesign}
                  viewerRef={furnaceViewerRef}
                />
              )}
              {!isSmeltingEquipment && (
                <div className={`mt-4 overflow-hidden rounded-xl border ${darkMode ? 'border-gray-700 bg-gray-950/20' : 'border-gray-200 bg-slate-50'}`}>
                  <div className={`flex items-center justify-between border-b px-4 py-3 ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                    <div>
                      <div className={`text-sm font-semibold ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}>选型计算明细</div>
                      <div className={`${hintText(darkMode)} mt-1`}>用于复核规模、处理强度、放大系数和建议台数。</div>
                    </div>
                  </div>
                  <div className="overflow-auto">
                    <table className="w-full min-w-[980px] table-fixed text-sm">
                      <thead className={darkMode ? 'bg-gray-800 text-gray-300' : 'bg-white text-gray-600'}>
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
                        {activeEquipmentRows.map((row) => (
                          <tr key={row.id} className={`border-t ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
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
                </div>
              )}
              <div className="mt-4 flex justify-end">
                <button type="button" className={btnPrimary(darkMode)} onClick={generateEquipmentBom}>
                  生成 BOM 设备清单
                </button>
              </div>
            </div>
          )}

          {activeEquipmentBomGenerated && (
            <div ref={equipmentBomSectionRef} className={`mt-4 rounded-xl border p-4 ${darkMode ? 'border-gray-600 bg-gray-900/20' : 'border-gray-200 bg-white'}`}>
              <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className={`text-sm font-semibold ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                    {isSmeltingEquipment ? '5. BOM 设备清单' : '3. BOM 设备清单'}
                  </div>
                  <div className={`${hintText(darkMode)} mt-1`}>BOM 生成后，本工序设备选型视为完成，可进入下一阶段。</div>
                </div>
                <button
                  type="button"
                  className={btnSecondary(darkMode)}
                  disabled={!activeEquipmentBomReady}
                  onClick={exportEquipmentBomDocument}
                >
                  导出文本
                </button>
              </div>
              <EquipmentBomTable darkMode={darkMode} items={activeEquipmentBomItems} />
            </div>
          )}

          {!activeEquipmentModelReady && (
            <div className={`mt-4 rounded-lg border px-3 py-3 text-sm ${darkMode ? 'border-gray-700 bg-gray-900/30 text-gray-300' : 'border-gray-200 bg-gray-50 text-gray-600'}`}>
              {isSmeltingEquipment
                ? '当前仅显示参数输入区。完成三区参数后点击“生成三维方案”，再生成 BOM。'
                : '当前仅显示参数输入区。点击“计算炉型匹配”后展示三维设备方案；确认后再生成 BOM 设备清单。'}
            </div>
          )}
          <div className={`mt-3 rounded-lg border px-3 py-2 text-sm ${darkMode ? 'border-blue-800 bg-blue-950/20 text-blue-100' : 'border-blue-200 bg-blue-50 text-blue-900'}`}>
            {isSmeltingEquipment
              ? '设备选型完成标准：生成 BOM 后视为完成。熔炼炉三维按面积、长宽、水套与风口参数联动示意。'
              : '设备选型完成标准：本工序生成 BOM 设备清单后视为完成。当前三维炉体为临时示意模型，尺寸会随目标规模、处理强度和建议台数联动变化；后续可替换为正式炉型、风量、床能率等专业约束。'}
          </div>
          {activeEquipmentBomReady && (
            <BottomNextStepBar
              darkMode={darkMode}
              currentLabel={`${activeEquipmentRow?.stage ?? '当前工序'}设备 BOM 已生成`}
              previousLabel={previousStageBeforeCurrent ? `上一步：${copperCaseStageName(previousStageBeforeCurrent)}` : null}
              nextLabel={
                nextStageAfterCurrent
                  ? nextStageAfterCurrent === 'cu_summary'
                    ? '进入案例汇总'
                    : `下一步：${copperCaseStageName(nextStageAfterCurrent)}`
                  : canEnterCaseSummary
                    ? '进入案例汇总'
                    : null
              }
              onPrevious={
                previousStageBeforeCurrent
                  ? () => confirmSaveBeforeCaseNavigation(previousStageBeforeCurrent)
                  : undefined
              }
              onNext={() => {
                const target = nextStageAfterCurrent ?? (canEnterCaseSummary ? 'cu_summary' : null)
                if (!target) return
                saveCurrentCase()
                confirmSaveBeforeCaseNavigation(target)
              }}
              extraNextLabel={
                canEnterCaseSummary && nextStageAfterCurrent && nextStageAfterCurrent !== 'cu_summary'
                  ? '进入案例汇总'
                  : null
              }
              onExtraNext={
                canEnterCaseSummary && nextStageAfterCurrent && nextStageAfterCurrent !== 'cu_summary'
                  ? () => {
                      saveCurrentCase()
                      confirmSaveBeforeCaseNavigation('cu_summary')
                    }
                  : undefined
              }
            />
          )}
        </div>
        <WorkflowBrandFooter darkMode={darkMode} />
      </div>
    )
  }

  if (normalizeCopperCaseStageId(activeSheet) === 'cu_summary') {
    const resolvedStages = activeCase ? resolveCaseProcessStages(activeCase) : processStagesCacheRef.current
    const smeltingStage = resolvedStages.cu_smelting
    const convertingStage = resolvedStages.cu_converting
    const refiningStage = resolvedStages.cu_refining

    const isEquipmentSizingReady = (stageId: EquipmentStageId) => {
      if (stageId === 'refining') return false
      if (!equipmentBomGenerated[stageId]) return false
      const row = equipmentSizingRows.find((item) => item.id === stageId)
      if (!row) return false
      return (
        buildCopperEquipmentBom(
          stageId,
          row,
          targetScaleValue,
          toNumber(equipmentDimensionAdjustments[stageId], 1),
          stageId === 'smelting' ? smeltingDesign : null
        ).length > 0
      )
    }
    const equipmentCompleteByStage: Record<EquipmentStageId, boolean> = {
      smelting: isEquipmentSizingReady('smelting'),
      converting: isEquipmentSizingReady('converting'),
      refining: isEquipmentSizingReady('refining'),
    }
    const completedCount = (['smelting', 'converting', 'refining'] as EquipmentStageId[]).filter(
      (id) => equipmentCompleteByStage[id]
    ).length

    const smeltingFeed = smeltingStage
      ? calculateWeightedComposition([
          ...smeltingStage.rawMaterials,
          ...smeltingStage.solventColumns,
          smeltingStage.fuelColumn,
          ...smeltingStage.airColumns,
        ])
      : furnaceFeed
    const overviewFeedTh = smeltingFeed.totalWeight

    const toggleSummarySection = (id: 'smelting' | 'converting' | 'refining') => {
      setSummarySectionOpen((prev) => ({ ...prev, [id]: !prev[id] }))
    }

    const stageSections: Array<{
      id: 'smelting' | 'converting' | 'refining'
      title: string
      processStageId: CopperProcessStageId
      stageState: CopperProcessStageState | undefined
      comingSoon?: boolean
    }> = [
      { id: 'smelting', title: '熔炼', processStageId: 'cu_smelting', stageState: smeltingStage },
      { id: 'converting', title: '吹炼', processStageId: 'cu_converting', stageState: convertingStage },
      { id: 'refining', title: '精炼', processStageId: 'cu_refining', stageState: refiningStage, comingSoon: true },
    ]

    return (
      <div className="flex min-h-0 flex-1 flex-col gap-4">
        <div ref={stagePageTopRef} className={stagePageTopShellClass(darkMode, stageEnterHighlight)}>
          <StageSheetTabs
            darkMode={darkMode}
            activeSheet={activeSheet}
            stageUnlockReasons={stageUnlockReasons}
            onStageSelect={confirmSaveBeforeCaseNavigation}
          />
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
              <h3 className={`${sectionTitle(darkMode)} mb-1`}>总览</h3>
              <p className={`${hintText(darkMode)} max-w-5xl leading-relaxed`}>
                流程完成度按熔炼 / 吹炼 / 精炼各工序「设备选型 BOM 是否已生成」统计；下方各工序区可展开核对计算表与设备结果。
              </p>
            </div>
            <button className={btnPrimary(darkMode)} onClick={() => saveCurrentCase()}>
              保存当前案例
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <SummaryMetricCard darkMode={darkMode} label="案例名称" value={activeCase?.name ?? '未保存案例'} />
            <SummaryMetricCard
              darkMode={darkMode}
              label="流程完成度"
              value={`${completedCount}/3`}
            />
            <SummaryMetricCard
              darkMode={darkMode}
              label="混料处理量"
              value={`${formatTableDisplayValue(overviewFeedTh)} t/h`}
            />
            <SummaryMetricCard
              darkMode={darkMode}
              label="目标规模"
              value={`${formatTableDisplayValue(targetScaleValue)} 万吨/a`}
            />
          </div>

          <ProcessIsland3DOverview
            darkMode={darkMode}
            equipmentCompleteByStage={equipmentCompleteByStage}
            completedCount={completedCount}
            targetScaleWanTpa={targetScaleValue}
            annualHours={annualHoursValue}
            totalFeedTh={overviewFeedTh}
            smeltingDesign={equipmentModelGenerated.smelting ? smeltingDesign : null}
          />
        </div>

        {stageSections.map((section) => {
          const equipmentRow = equipmentSizingRows.find((row) => row.id === section.id) ?? null
          const bomItems =
            equipmentRow != null
              ? buildCopperEquipmentBom(
                  section.id,
                  equipmentRow,
                  targetScaleValue,
                  toNumber(equipmentDimensionAdjustments[section.id], 1),
                  section.id === 'smelting' ? smeltingDesign : null
                )
              : []
          const bomReady = Boolean(equipmentBomGenerated[section.id] && bomItems.length > 0)
          const statusLabel = section.comingSoon
            ? '待开发'
            : bomReady
              ? '设备选型已完成'
              : isProcessStageComplete(section.stageState)
                ? '计算已完成，待设备选型'
                : hasProcessStageGeneratedData(section.stageState)
                  ? '进行中'
                  : '未开始'

          return (
            <CaseSummaryStageSection
              key={section.id}
              darkMode={darkMode}
              title={section.title}
              statusLabel={statusLabel}
              open={summarySectionOpen[section.id]}
              onToggle={() => toggleSummarySection(section.id)}
            >
              {section.comingSoon ? (
                <div
                  className={`rounded-lg border-2 border-dashed px-6 py-12 text-center ${
                    darkMode ? 'border-gray-600 bg-gray-800/40 text-gray-400' : 'border-gray-300 bg-gray-50 text-gray-500'
                  }`}
                >
                  <div className={`text-base font-semibold ${darkMode ? 'text-gray-200' : 'text-gray-700'}`}>
                    功能开发中，敬请期待
                  </div>
                  <p className={`${hintText(darkMode)} mx-auto mt-2 max-w-xl leading-relaxed`}>
                    精炼配料、热平衡与设备选型模块待开发，当前不提供可汇总内容。
                  </p>
                </div>
              ) : (
                <CaseSummaryStageTables
                  darkMode={darkMode}
                  stageId={section.id}
                  stageState={section.stageState}
                  bomItems={bomItems}
                  bomReady={bomReady}
                />
              )}
            </CaseSummaryStageSection>
          )
        })}

        {previousStageBeforeCurrent && (
          <BottomNextStepBar
            darkMode={darkMode}
            currentLabel="案例汇总"
            previousLabel={`上一步：${copperCaseStageName(previousStageBeforeCurrent)}`}
            nextLabel={null}
            onPrevious={() => confirmSaveBeforeCaseNavigation(previousStageBeforeCurrent)}
          />
        )}
        <WorkflowBrandFooter darkMode={darkMode} />
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      {isPhaseCalculating && (
        <IteratingOverlay
          darkMode={darkMode}
          title="物相计算中"
          description="正在计算物相并回填结果，请稍候…"
          steps={[...PHASE_CALCULATION_STEPS]}
          currentStep={phaseCalculationStep}
        />
      )}
      {isProductCalculating && (
        <IteratingOverlay
          darkMode={darkMode}
          title="产出计算中"
          description="正在计算产物组成并回填到配料总表，请稍候…"
          detail={productCalculationDetail}
          steps={[...PRODUCT_CALCULATION_STEPS]}
          currentStep={productCalculationStep}
          onCancel={requestProductCalculationCancel}
          cancelling={isProductCalculatingCancelling}
        />
      )}
      {isHeatBalanceCalculating && (
        <IteratingOverlay
          darkMode={darkMode}
          title="热平衡计算中"
          description="正在闭合热收入、热支出与迭代煤量，请稍候…"
          detail={heatBalanceCalculationDetail}
          steps={[...heatBalanceCalculationSteps(chemicalHeatMode)]}
          currentStep={heatBalanceCalculationStep}
          onCancel={requestHeatBalanceCalculationCancel}
          cancelling={isHeatBalanceCancelling}
        />
      )}
      <WorkflowMessageToast
        darkMode={darkMode}
        message={workflowMessage?.text ?? null}
        tone={workflowMessage?.tone ?? 'flow'}
        onClose={() => setWorkflowMessage(null)}
      />
      <WorkflowContextFloatingHint darkMode={darkMode} hint={batchContextHint} stacked={Boolean(workflowMessage)} />
      <CopperBatchExportDialog
        darkMode={darkMode}
        open={showBatchExportDialog}
        groupOptions={batchExportGroupOptions}
        onCancel={() => setShowBatchExportDialog(false)}
        onConfirm={(selected) => void confirmBatchExport(selected)}
      />
      <div ref={stagePageTopRef} className={stagePageTopShellClass(darkMode, stageEnterHighlight)}>
        <StageSheetTabs
          darkMode={darkMode}
          activeSheet={activeSheet}
          stageUnlockReasons={stageUnlockReasons}
          onStageSelect={confirmSaveBeforeCaseNavigation}
        />
        <StageHeader
          darkMode={darkMode}
          activeSheet={activeSheet}
          steps={isCopperProcessSheet ? workflowFlowSteps : undefined}
          onWorkflowStepClick={isCopperProcessSheet ? navigateToWorkflowStep : undefined}
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

      <div ref={materialLibraryRef} className={cardCompact(darkMode)}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-[16rem] flex-1">
            <h3 className={`${sectionTitle(darkMode)} mb-1`}>
              {activeProcessStageId === 'cu_converting'
                ? '吹炼原料库'
                : activeProcessStageId === 'cu_refining'
                  ? '精炼原料库'
                  : '熔炼原料库'}
            </h3>
            <p className={`${hintText(darkMode)} leading-relaxed`}>
              {activeProcessStageId === 'cu_converting'
                ? '吹炼原料库与熔炼独立：默认含白铜锍（由熔炼带入）、残极、氧化渣与石灰石熔剂。可按原料/熔剂分类查看。'
                : '本工序原料库用于管理当前工序的原料与熔剂数据。您可以修改成分，或通过新增、导入扩充；熔炼与吹炼原料库彼此独立。'}
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
          onCategoryChange={updateSingleLibraryRowCategory}
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
            <div className="flex flex-wrap items-center gap-2">
              {(
                [
                  { id: 'all' as const, label: '全部' },
                  { id: 'raw' as const, label: '原料' },
                  { id: 'flux' as const, label: '熔剂' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className={`rounded-md border px-2.5 py-1 text-xs font-medium ${
                    libraryCategoryGroup === tab.id
                      ? darkMode
                        ? 'border-sky-600 bg-sky-900/50 text-sky-100'
                        : 'border-sky-300 bg-sky-50 text-sky-900'
                      : darkMode
                        ? 'border-gray-600 bg-gray-900/40 text-gray-300'
                        : 'border-gray-200 bg-white text-gray-600'
                  }`}
                  onClick={() => {
                    setLibraryCategoryGroup(tab.id)
                    setLibraryPage(1)
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <div className={`rounded-lg border p-3 ${darkMode ? 'border-gray-600 bg-gray-900/30' : 'border-gray-200 bg-gray-50/60'}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className={`text-sm font-semibold ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>元素筛选</div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={libraryElementTableView === 'element'}
                    aria-label="原料库元素转换"
                    className={`inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm transition-colors ${
                      libraryElementTableView === 'compound'
                        ? darkMode
                          ? 'border-gray-600 bg-gray-800 text-gray-300'
                          : 'border-gray-300 bg-white text-gray-700'
                        : darkMode
                          ? 'border-blue-500 bg-blue-950/40 text-blue-100'
                          : 'border-blue-400 bg-blue-50 text-blue-700'
                    }`}
                    onClick={() => setLibraryElementTableView((view) => (view === 'compound' ? 'element' : 'compound'))}
                  >
                    <span className="text-sm">元素转换</span>
                    <span
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                        libraryElementTableView === 'element'
                          ? darkMode ? 'bg-blue-500' : 'bg-blue-500'
                          : darkMode ? 'bg-gray-600' : 'bg-gray-300'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                          libraryElementTableView === 'element' ? 'translate-x-4' : 'translate-x-0.5'
                        }`}
                      />
                    </span>
                  </button>
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
                        {elementTableHeaderLabel(element, libraryElementTableView)}
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
                          <span
                            className={`mt-0.5 inline-block rounded px-1 text-[10px] font-medium ${
                              material.category === 'flux'
                                ? darkMode
                                  ? 'bg-amber-900/60 text-amber-100'
                                  : 'bg-amber-50 text-amber-800'
                                : material.category === 'product'
                                  ? darkMode
                                    ? 'bg-emerald-900/55 text-emerald-100'
                                    : 'bg-emerald-50 text-emerald-800'
                                  : darkMode
                                    ? 'bg-slate-700 text-slate-200'
                                    : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {libraryCategoryLabel(material.category)}
                          </span>
                        </td>
                        {(() => {
                          const displayRatios = libraryDisplayRatios(material.ratios)
                          return libraryElementKeys.map((element) => (
                            <td key={element} className="px-0.5 py-1.5 text-center align-middle font-mono text-sm tabular-nums leading-none">
                              {formatTableDisplayValue(displayRatios[element] ?? 0)}
                            </td>
                          ))
                        })()}
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
              guide={batchTabGuide}
              hideParameters={activeProcessStageId === 'cu_converting'}
              inputTabOrder={activeProcessStageId === 'cu_converting' ? 'phase-first' : 'element-first'}
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
            {batchTableView === 'productPhase' && canShowMetcalComparison ? (
              <button
                type="button"
                role="switch"
                aria-checked={showMetcalCalcResults}
                aria-label="显示metcal软件计算结果"
                title="在本软件产出物相结果下方对照显示 MetCal .flo 中的产出物相（相对偏差 ≤1% 绿字，否则红字）"
                className="inline-flex cursor-pointer items-center gap-2 border-0 bg-transparent p-0"
                onClick={() => setShowMetcalCalcResults((v) => !v)}
              >
                <span className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                  显示metcal软件计算结果
                </span>
                <span
                  aria-hidden
                  className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                    showMetcalCalcResults ? 'bg-blue-600' : darkMode ? 'bg-gray-600' : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                      showMetcalCalcResults ? 'translate-x-4' : 'translate-x-0.5'
                    }`}
                  />
                </span>
              </button>
            ) : null}
            <button type="button" className={btnSecondary(darkMode)} onClick={exportCalculationTable}>
              导出
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
            airColumns={
              activeProcessStageId === 'cu_converting'
                ? airColumns.filter((column) => column.airRole !== 'secondary')
                : airColumns
            }
            furnaceFeedRatios={furnaceDryFeed.ratios}
            furnaceBlendWaterWeight={furnaceBlendWaterWeight}
            productTableColumns={[]}
            productTotalMass={0}
            productCalculated={false}
            materialLibrary={rawSelectableLibrary}
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
            blendCategoryLabel={inputSummaryColumn?.header}
            blendNameLabel={inputSummaryColumn?.subHeader}
            showFuel={activeProcessStageId !== 'cu_converting'}
            compositionReadOnly={activeProcessStageId === 'cu_converting'}
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
              expandRawGroupToken={phaseBlendExpandToken}
              rawSummaryHeader={inputSummaryColumn?.header}
              rawSummarySubHeader={inputSummaryColumn?.subHeader}
              showFuel={activeProcessStageId !== 'cu_converting'}
              weightEditable={activeProcessStageId === 'cu_converting'}
              weightDrafts={{
                ...rawWeightDrafts,
                ...Object.fromEntries(
                  solventColumns.map((material) => [
                    material.id,
                    ratioDrafts[`solvent-weight:${material.id}`] ??
                      (material.weight > 0 ? String(material.weight) : ''),
                  ])
                ),
                ...Object.fromEntries(
                  airColumns.map((column) => [
                    column.id,
                    ratioDrafts[`gas-weight:${column.id}`] ??
                      (column.weight > 0 ? String(column.weight) : ''),
                  ])
                ),
              }}
              waterWeightDrafts={{
                ...Object.fromEntries(
                  rawMaterials
                    .filter((material) => waterWeightDraftKey('raw', material.id) in waterWeightDrafts)
                    .map((material) => [
                      material.id,
                      waterWeightDrafts[waterWeightDraftKey('raw', material.id)],
                    ])
                ),
                ...Object.fromEntries(
                  solventColumns
                    .filter((material) => waterWeightDraftKey('solvent', material.id) in waterWeightDrafts)
                    .map((material) => [
                      material.id,
                      waterWeightDrafts[waterWeightDraftKey('solvent', material.id)],
                    ])
                ),
                ...(activeProcessStageId !== 'cu_converting' &&
                waterWeightDraftKey('fuel', fuelColumn.id) in waterWeightDrafts
                  ? {
                      [fuelColumn.id]: waterWeightDrafts[waterWeightDraftKey('fuel', fuelColumn.id)],
                    }
                  : {}),
              }}
              onWeightChange={(columnId, value) => {
                if (rawMaterials.some((material) => material.id === columnId)) {
                  updateRawWeight(columnId, value)
                  return
                }
                if (solventColumns.some((material) => material.id === columnId)) {
                  updateSolventWeight(columnId, value)
                  return
                }
                if (airColumns.some((column) => column.id === columnId)) {
                  updateAirWeight(columnId, value)
                }
              }}
              onWeightBlur={(columnId) => {
                if (solventColumns.some((material) => material.id === columnId)) {
                  commitSolventWeightDraft(columnId)
                  return
                }
                if (airColumns.some((column) => column.id === columnId)) {
                  commitAirWeightDraft(columnId)
                }
              }}
              onWaterWeightChange={(columnId, value) => {
                if (rawMaterials.some((material) => material.id === columnId)) {
                  updateMaterialWaterWeight('raw', columnId, value)
                  return
                }
                if (solventColumns.some((material) => material.id === columnId)) {
                  updateMaterialWaterWeight('solvent', columnId, value)
                  return
                }
                if (fuelColumn.id === columnId) {
                  updateFuelWaterWeight(value)
                }
              }}
              onWaterWeightBlur={(columnId) => {
                if (rawMaterials.some((material) => material.id === columnId)) {
                  commitWaterWeightDraft('raw', columnId)
                  return
                }
                if (solventColumns.some((material) => material.id === columnId)) {
                  commitWaterWeightDraft('solvent', columnId)
                  return
                }
                if (fuelColumn.id === columnId) {
                  commitWaterWeightDraft('fuel', columnId)
                }
              }}
              onInputDraftChange={updateInputPhaseDraft}
              onInputDraftCommit={commitInputPhaseDraft}
              onOutputDraftChange={updateOutputPhaseDraft}
              onOutputDraftCommit={commitOutputPhaseDraft}
            />
          </div>
        ) : batchTableView === 'parameters' ? (
          <div key="parameters-batch-view" className="batch-table-view-enter">
            {renderProcessParametersPanel()}
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
            {showProductSolverTable ? (
              <CopperProductionResultTable
                darkMode={darkMode}
                result={oxySolverResult}
                mode="phase"
                phaseTitle="产出-产物物相表"
                config={productConstraintConfig}
                metcalResult={metcalProductResult}
                showMetcalComparison={showMetcalCalcResults && canShowMetcalComparison}
                productDisplayStage={oxyProductDisplayStageForProcess(activeProcessStageId)}
                defaultFlueGasTotalUnit="volume"
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
            {showProductSolverTable ? (
              <CopperProductionResultTable
                darkMode={darkMode}
                result={oxySolverResult}
                mode="element"
                elementTitle="产出-产物元素表（w%）"
                elementDisplayMode={productElementTableView}
                config={productConstraintConfig}
                productDisplayStage={oxyProductDisplayStageForProcess(activeProcessStageId)}
              />
            ) : (
              renderProductResultPlaceholder()
            )}
          </div>
        ) : batchTableView === 'balance' ? (
          <div key="balance-batch-view" className="space-y-3 batch-table-view-enter">
            {heatBalanceTableReady && calculatedHeatBalance ? (
              <>
                {renderHeatBalanceDiagnosticsPanel({
                  darkMode,
                  heatBalance: calculatedHeatBalance,
                  solverResult: oxySolverResult,
                })}
                <CopperHeatBalancePlaceholderTables
                  darkMode={darkMode}
                  result={calculatedHeatBalance}
                  concentrateMassTh={concentrateMass}
                  productResult={calculatedHeatBalance.finalProductResult ?? oxySolverResult}
                  airColumns={calculatedHeatBalance.finalAirColumns ?? airColumns}
                  chemicalHeatMode={chemicalHeatMode}
                  onChemicalHeatModeChange={(mode) => {
                    setChemicalHeatMode(mode)
                    resetHeatBalanceCalculation()
                    setWorkflowMessage('已切换化学热模式，请重新点击「热平衡计算」。', 'flow')
                  }}
                />
              </>
            ) : (
              <div
                role="button"
                tabIndex={0}
                className={`cursor-pointer overflow-hidden rounded-lg border transition ${
                  darkMode ? 'border-gray-600 hover:border-blue-500' : 'border-gray-200 hover:border-blue-400'
                }`}
                onClick={handleHeatBalancePlaceholderClick}
                onKeyDown={handleHeatBalancePlaceholderKeyDown}
                title="点击跳转到热平衡参数输入"
              >
                <table className="w-full table-fixed text-sm">
                  <thead className={darkMode ? 'bg-gray-800 text-gray-100' : 'bg-gray-50 text-gray-700'}>
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold">热平衡参数输入</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className={`px-3 py-6 text-center ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                        热平衡结果计算后会自动回填，点击进入参数输入区
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : null}
        {(batchTableView === 'element' || batchTableView === 'phase') && (
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
        )}
      </div>

      {nextStageAfterCurrent && isCopperProcessSheet && processPageComplete && (
        <BottomNextStepBar
          darkMode={darkMode}
          currentLabel={`${copperCaseStageName(activeSheet)}计算已完成`}
          previousLabel={previousStageBeforeCurrent ? `上一步：${copperCaseStageName(previousStageBeforeCurrent)}` : null}
          nextLabel={nextStageAfterCurrent ? `下一步：${copperCaseStageName(nextStageAfterCurrent)}` : null}
          onPrevious={previousStageBeforeCurrent ? () => confirmSaveBeforeCaseNavigation(previousStageBeforeCurrent) : undefined}
          onNext={nextStageAfterCurrent ? () => {
            saveCurrentCase()
            confirmSaveBeforeCaseNavigation(nextStageAfterCurrent)
          } : undefined}
        />
      )}

      {activeProcessStageId !== 'cu_converting' && (
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
            {phaseSheetTabs.length === 0 ? (
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
                                    <span className="inline-block max-w-full whitespace-normal break-words font-medium leading-tight">
                                      <PhaseFormulaDisplay formula={row.formula || row.displayLabel} />
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
                    className={btnPrimary(darkMode)}
                    onClick={runPhaseCalculationAndFinish}
                    disabled={isPhaseCalculating || hasPendingDraftRows || hasFormulaErrors}
                  >
                    {isPhaseCalculating ? '计算中...' : '计算'}
                  </button>
                </div>
                {selectedPhaseMaterial &&
                  phaseCompletedMaterials[selectedPhaseMaterial.id] && (
                    <div className={assistAlertPanelClassName(darkMode, 'success')}>
                      {`已回填：${displayRawMaterialName(selectedPhaseMaterial.name)} 的 O / C / Other 与物相组成已写入配料总表${
                        phaseCompleted ? '（全部原料已完成物相成分）' : ''
                      }。`}
                    </div>
                  )}
              </>
            )}
              </>
            )}
          </div>
        )}
      </div>
      )}

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
        <div className={`${hintText(darkMode)} mt-3 space-y-1 text-sm leading-relaxed`}>
          <p>打开方式：在配料总表切换到“热平衡计算”，或完成产出回填后展开本区。</p>
          <p>
            {isConvertingHeatBalance
              ? '计算说明：两种方法采用不同的化学热口径；汇总热收入与固定热支出后，均由冷却水出口温度自动闭合。'
              : '计算说明：先按煤/精矿比确定工艺基础煤，再双向调节总煤量。'}
          </p>
          <p>
            Hess：总表化学热取进出流 ΣΔH298；{isConvertingHeatBalance
              ? '固定自然散热后，根据冷却水量和入口温度反算出口温度。'
              : '固定自然散热后，根据冷却水量和入口温度反算出口温度，不设置出口上限。'}
          </p>
          <p>
            化学反应：{isConvertingHeatBalance
              ? '总表化学热取反应路径净热；固定自然散热后，同样根据冷却水量和入口温度反算出口温度。'
              : '总表化学热取反应路径净热；冷却水温差固定，自然散热由剩余热量自动计算，不预设百分比波动区间，最终占比显示在热支出表中。'}
          </p>
        </div>
        {showHeatBalanceAssist && (
          <div className="mt-4 space-y-4">
            <div className="space-y-3">
              <HeatParameterGroup darkMode={darkMode} title="化学热模式">
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={chemicalHeatMode === 'reaction'}
                    title={
                      isConvertingHeatBalance
                        ? chemicalHeatMode === 'reaction'
                          ? '当前为化学反应路径净热；点击切换为 Hess'
                          : '当前为 Hess（进出流 ΣΔH298）；点击切换为化学反应'
                        : chemicalHeatMode === 'reaction'
                        ? '当前为化学反应路径热；点击切换为 Hess'
                        : '当前为 Hess（进出流 ΣΔH298）；点击切换为化学反应'
                    }
                    onClick={() => {
                      setChemicalHeatMode((prev) => {
                        const next = prev === 'hess' ? 'reaction' : 'hess'
                        if (next === 'reaction' && !isConvertingHeatBalance) {
                          setOtherHeatMJh('0')
                        } else if (!isConvertingHeatBalance && normalizeOtherHeatMJhText(otherHeatMJh) === '0') {
                          setOtherHeatMJh(DEFAULT_OTHER_HEAT_MJH_TEXT)
                        }
                        return next
                      })
                      resetHeatBalanceCalculation()
                      setWorkflowMessage('已切换化学热模式，请重新点击「热平衡计算」。', 'flow')
                    }}
                    className={`relative inline-flex h-8 w-[11.5rem] items-center rounded-full border px-1 text-xs font-medium transition ${
                      darkMode
                        ? 'border-gray-600 bg-gray-800 text-gray-100'
                        : 'border-gray-300 bg-white text-gray-800'
                    }`}
                  >
                    <span
                      className={`absolute inset-y-0.5 w-[5.4rem] rounded-full transition-transform ${
                        chemicalHeatMode === 'reaction'
                          ? 'translate-x-[5.5rem] bg-blue-500/90'
                          : 'translate-x-0.5 bg-blue-500/90'
                      }`}
                    />
                    <span className="relative z-10 flex w-full justify-between px-2">
                      <span className={chemicalHeatMode === 'hess' ? 'text-white' : darkMode ? 'text-gray-400' : 'text-gray-500'}>
                        Hess
                      </span>
                      <span
                        className={
                          chemicalHeatMode === 'reaction' ? 'text-white' : darkMode ? 'text-gray-400' : 'text-gray-500'
                        }
                      >
                        化学反应
                      </span>
                    </span>
                  </button>
                  <span className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                    {isConvertingHeatBalance
                      ? chemicalHeatMode === 'reaction'
                        ? '总表化学热取反应路径净热；固定自然散热后自动反算冷却水出口温度。'
                        : '总表化学热取进出流 ΣΔH298；固定自然散热后自动反算冷却水出口温度。'
                      : chemicalHeatMode === 'reaction'
                        ? '总表化学热取反应路径净热；固定冷却水温差后自动反算自然散热。'
                        : '总表化学热取进出流 ΣΔH298；根据热差自动反算冷却水出口温度。'}
                  </span>
                </div>
              </HeatParameterGroup>
              <HeatParameterGroup darkMode={darkMode} title="温度条件">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                  <LabeledInput darkMode={darkMode} label="入炉料温度 (℃)" value={feedTemperature} onChange={(value) => updateHeatField(setFeedTemperature, value)} />
                  <LabeledInput darkMode={darkMode} label="白铜锍温度 (℃)" value={matteTemperature} onChange={(value) => updateHeatField(setMatteTemperature, value)} />
                  <LabeledInput darkMode={darkMode} label="熔炼渣温度 (℃)" value={slagTemperature} onChange={(value) => updateHeatField(setSlagTemperature, value)} />
                  <LabeledInput darkMode={darkMode} label="熔炼烟气温度 (℃)" value={gasTemperature} onChange={(value) => updateHeatField(setGasTemperature, value)} />
                  <LabeledInput darkMode={darkMode} label="烟气含尘温度 (℃)" value={dustTemperature} onChange={(value) => updateHeatField(setDustTemperature, value)} />
                </div>
              </HeatParameterGroup>
              <HeatParameterGroup darkMode={darkMode} title="热支出">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <LabeledInput darkMode={darkMode} label="冷却水入口温度 (℃)" value={coolingWaterInletTemperature} onChange={(value) => updateHeatField(setCoolingWaterInletTemperature, value)} />
                  <LabeledInput
                    darkMode={darkMode}
                    label={coolingWaterOutletIsCalculated ? '冷却水出口温度 (℃，自动计算)' : '冷却水出口温度 (℃)'}
                    value={coolingWaterOutletTemperature}
                    readOnly={coolingWaterOutletIsCalculated}
                    onChange={
                      coolingWaterOutletIsCalculated
                        ? undefined
                        : (value) => updateHeatField(setCoolingWaterOutletTemperature, value)
                    }
                  />
                  <LabeledInput darkMode={darkMode} label="冷却水质量 (t/h)" value={coolingWaterMassTh} onChange={(value) => updateHeatField(setCoolingWaterMassTh, value)} />
                  <LabeledInput
                    darkMode={darkMode}
                    label={
                      isConvertingHeatBalance
                        ? '自然散热 (MJ/h)'
                        : chemicalHeatMode === 'reaction'
                          ? '自然散热 (MJ/h，自动计算)'
                          : '自然散热 (MJ/h)'
                    }
                    value={
                      isConvertingHeatBalance
                        ? normalizeOtherHeatMJhText(otherHeatMJh)
                        : chemicalHeatMode === 'reaction'
                          ? normalizeOtherHeatMJhText(otherHeatMJh === DEFAULT_OTHER_HEAT_MJH_TEXT ? '0' : otherHeatMJh)
                          : normalizeOtherHeatMJhText(otherHeatMJh)
                    }
                    readOnly={!isConvertingHeatBalance && chemicalHeatMode === 'reaction'}
                    onChange={
                      !isConvertingHeatBalance && chemicalHeatMode === 'reaction'
                        ? undefined
                        : (value) => updateHeatField(setOtherHeatMJh, normalizeOtherHeatMJhText(value))
                    }
                  />
                </div>
                <p className={`${hintText(darkMode)} mt-2 text-xs leading-relaxed`}>
                  {coolingWaterOutletIsCalculated
                    ? '冷却水出口温度为热平衡计算结果，不作为输入条件或上限。'
                    : '冷却水入口、出口温度和质量固定；自然散热由热平衡余量自动计算。'}
                </p>
              </HeatParameterGroup>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                className={btnPrimary(darkMode)}
                onClick={() => void runHeatBalanceCalculation()}
                disabled={!productFilledBack || !heatInputValid || isHeatBalanceCalculating}
              >
                {isHeatBalanceCalculating ? '计算中...' : '计算'}
              </button>
            </div>
            {!productFilledBack && (
              <div className={assistAlertPanelClassName(darkMode, 'warning')}>
                请先完成产出计算并回填到配料总表；热平衡参数可以先填写，结果需在产出回填后计算。
              </div>
            )}
            {heatBalanceTableReady && calculatedHeatBalance
              ? renderHeatBalanceDiagnosticsPanel({
                  darkMode,
                  heatBalance: calculatedHeatBalance,
                  solverResult: oxySolverResult,
                })
              : null}
          </div>
        )}
      </div>

      <WorkflowBrandFooter darkMode={darkMode} />

    </div>
  )
}

function LibraryCategorySelect({
  darkMode,
  value,
  onChange,
}: {
  darkMode: boolean
  value: CopperLibraryCategory | ''
  onChange: (value: CopperLibraryCategory | '') => void
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const label = LIBRARY_CATEGORY_OPTIONS.find((option) => option.value === value)?.label ?? '-'

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div ref={rootRef} className="relative h-8 w-full">
      <button
        type="button"
        className={`flex h-8 w-full items-center justify-center rounded border px-1 text-center text-xs outline-none focus:border-orange-400 ${
          darkMode
            ? 'border-gray-600 bg-gray-700 text-gray-100 hover:bg-gray-600'
            : 'border-gray-300 bg-white text-gray-900 hover:bg-gray-50'
        }`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="原料类型"
        title="类型可选填"
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className="leading-none">{label}</span>
      </button>
      {open && (
        <div
          className={`absolute left-0 top-full z-20 mt-0.5 min-w-full overflow-hidden rounded border shadow-lg ${
            darkMode ? 'border-gray-600 bg-gray-800' : 'border-gray-200 bg-white'
          }`}
          role="listbox"
        >
          {LIBRARY_CATEGORY_OPTIONS.map((option) => {
            const selected = option.value === value
            return (
              <button
                key={option.value || 'none'}
                type="button"
                role="option"
                aria-selected={selected}
                className={`flex h-8 w-full items-center justify-center px-2 text-xs ${
                  selected
                    ? darkMode
                      ? 'bg-sky-900/50 text-sky-100'
                      : 'bg-sky-50 text-sky-900'
                    : darkMode
                      ? 'text-gray-100 hover:bg-gray-700'
                      : 'text-gray-900 hover:bg-gray-50'
                }`}
                onClick={() => {
                  onChange(option.value)
                  setOpen(false)
                }}
              >
                {option.label}
              </button>
            )
          })}
        </div>
      )}
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
  onCategoryChange,
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
  onCategoryChange: (id: string, value: CopperLibraryCategory | '') => void
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
                <th className="px-1 py-2 text-center align-middle">原料名称</th>
                <th className="px-1 py-2 text-center align-middle">类型</th>
                <th className="px-1 py-2 text-center align-middle text-xs font-medium">元素</th>
                {elementColumns.map((column) => {
                  const invalid = column.rawName.trim().length > 0 && !column.element
                  return (
                    <th key={column.id} className="px-1 py-2 align-middle">
                      <div className="relative flex h-8 items-center">
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
                    className={`mx-auto flex h-8 w-8 items-center justify-center rounded border text-lg font-medium leading-none ${
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
                    <td className="px-1 py-1.5 align-middle">
                      <input
                        className={`${inputSm(darkMode)} h-8 w-full text-center`}
                        value={row.name}
                        placeholder="例：高品位铜精矿"
                        onChange={(event) => onNameChange(row.id, event.target.value)}
                      />
                    </td>
                    <td className="px-1 py-1.5 align-middle">
                      <LibraryCategorySelect
                        darkMode={darkMode}
                        value={row.category}
                        onChange={(next) => onCategoryChange(row.id, next)}
                      />
                    </td>
                    <td className={`px-1 py-1.5 text-center align-middle text-xs font-medium ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                      含量
                    </td>
                    {elementColumns.map((column) => (
                      <td key={column.id} className="px-1 py-1.5 align-middle">
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
                    <td className="px-1 py-1.5 align-middle" aria-hidden="true" />
                    <td className="px-1 py-1.5 align-middle">
                      <input
                        className={`${inputSm(darkMode)} h-8 w-full px-1 text-center font-mono text-sm`}
                        value={ratioInputValue(row.id, 'Other(其他)', row.ratios['Other(其他)'])}
                        onChange={(event) => onOtherRatioChange(row.id, event.target.value)}
                        onBlur={() => onColumnRatioBlur(row.id, 'Other(其他)')}
                      />
                    </td>
                    <td className={`px-1 py-1.5 text-center align-middle font-mono ${totalClass}`}>{formatTableDisplayValue(total)}</td>
                    <td className="px-1 py-1.5 text-center align-middle">
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
  guide,
  hideParameters = false,
  /** 熔炼：元素→物相；吹炼：物相→元素 */
  inputTabOrder = 'element-first',
}: {
  darkMode: boolean
  activeView: BatchTableView
  onChange: (view: BatchTableView) => void
  guide?: string | null
  /** 吹炼不展示关键参数输入页签 */
  hideParameters?: boolean
  inputTabOrder?: 'element-first' | 'phase-first'
}) {
  const inputTabs: Array<{ id: BatchTableView; label: string }> =
    inputTabOrder === 'phase-first'
      ? [
          { id: 'phase', label: '投入-物料物相表' },
          { id: 'element', label: '投入-物料元素表' },
        ]
      : [
          { id: 'element', label: '投入-物料元素表' },
          { id: 'phase', label: '投入-物料物相表' },
        ]
  const tabs: Array<{ id: BatchTableView; label: string }> = [
    ...inputTabs,
    ...(hideParameters ? [] : [{ id: 'parameters' as const, label: '关键参数输入' }]),
    { id: 'productPhase', label: '产出-产物物相表' },
    { id: 'productElement', label: '产出-产物元素表' },
    { id: 'balance', label: '热平衡计算' },
  ]
  return (
    <div className="relative inline-block pt-8">
      {guide && (
        <div
          className={`pointer-events-none absolute left-0 top-0 z-10 inline-flex max-w-[34rem] items-center gap-2 rounded-full border px-3 py-1 text-xs shadow-sm ${
            darkMode
              ? 'border-blue-500/50 bg-gray-950/95 text-blue-100'
              : 'border-blue-200 bg-white text-blue-800'
          }`}
        >
          <span className="truncate">{guide}</span>
        </div>
      )}
      <div className={`inline-flex items-end gap-1 rounded-t-md border-b-2 px-1 pt-1 ${darkMode ? 'border-gray-600' : 'border-gray-300'}`}>
        {tabs.map((tab) => {
          const active = tab.id === activeView
          return (
            <div key={tab.id} className="relative flex flex-col items-center">
              <button
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
            </div>
          )
        })}
      </div>
    </div>
  )
}

function StageSheetTabs({
  darkMode,
  activeSheet,
  stageUnlockReasons,
  onStageSelect,
}: {
  darkMode: boolean
  activeSheet: SheetId
  stageUnlockReasons?: Partial<Record<CopperCaseStageId, string | null>>
  onStageSelect: (sheet: SheetId) => void
}) {
  const normalizedActiveSheet = normalizeCopperCaseStageId(activeSheet)
  return (
    <div className={`flex items-end gap-1 border-b px-1 pt-1 ${darkMode ? 'border-gray-600' : 'border-gray-300'}`}>
      {STAGES.map((stage) => {
        const active = stage.id === normalizedActiveSheet
        const lockReason = stageUnlockReasons?.[stage.id] ?? null
        const locked = Boolean(lockReason) && !active
        return (
          <button
            key={stage.id}
            type="button"
            title={locked ? lockReason ?? undefined : undefined}
            disabled={locked}
            aria-disabled={locked}
            onClick={() => {
              if (locked) return
              onStageSelect(stage.id)
            }}
            className={`min-w-24 rounded-t-md border px-4 py-2 text-sm font-medium ${
              active
                ? darkMode
                  ? 'border-gray-500 border-b-gray-800 bg-gray-800 text-gray-100'
                  : 'border-gray-300 border-b-white bg-white text-gray-900'
                : locked
                  ? darkMode
                    ? 'cursor-not-allowed border-gray-800 bg-gray-950/60 text-gray-600'
                    : 'cursor-not-allowed border-gray-100 bg-gray-50 text-gray-400'
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
            <div className={`text-sm font-semibold ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}>{APP_PLATFORM_NAME_ZH}</div>
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
  onWorkflowStepClick,
}: {
  darkMode: boolean
  activeSheet: SheetId
  steps?: { label: string; status: WorkflowStepStatus }[]
  onWorkflowStepClick?: (index: number) => void
}) {
  const normalizedActiveSheet = normalizeCopperCaseStageId(activeSheet)
  const activeIndex = STAGES.findIndex((stage) => stage.id === normalizedActiveSheet)
  const active = STAGES[activeIndex] ?? STAGES[0]
  const isProcessSheet = activeSheet === 'cu_smelting' || activeSheet === 'cu_converting'
  const equipmentStageId = equipmentStageIdForSheet(activeSheet)
  const equipmentFlowText =
    equipmentStageId && activeSheet !== 'cu_refining_equipment'
      ? activeSheet === 'cu_converting_equipment'
        ? '操作流程：完成本工序计算 → 安检确认 → 选择本工序炉子 → 可进入案例汇总'
        : '操作流程：完成本工序计算 → 安检确认 → 选择本工序炉子 → 进入下一阶段或案例汇总'
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
              <WorkflowFlowStrip darkMode={darkMode} steps={steps} onStepClick={onWorkflowStepClick} />
            </div>
          )}
      </div>
    </div>
  )
}

function WorkflowBrandFooter({ darkMode }: { darkMode: boolean }) {
  return (
    <footer
      className={`mt-auto shrink-0 border-t px-2 pt-3 pb-2 ${darkMode ? 'border-gray-700/80' : 'border-slate-200'}`}
      aria-label="平台信息"
    >
      <div className={`mx-auto max-w-xl text-center leading-none ${darkMode ? 'text-gray-500' : 'text-slate-500'}`}>
        <div className={`text-xs font-medium tracking-wide ${darkMode ? 'text-gray-400' : 'text-slate-600'}`}>
          长沙有色冶金设计研究院有限公司
        </div>
        <div className="mt-1 text-[11px] leading-none">冶金工艺计算与三维设计一体化平台</div>
        <div className={`mt-1 text-[10px] leading-none ${darkMode ? 'text-gray-600' : 'text-slate-400'}`}>
          中国铝业集团 · 中铝国际
        </div>
      </div>
    </footer>
  )
}

function BottomNextStepBar({
  darkMode,
  currentLabel,
  previousLabel,
  nextLabel,
  onPrevious,
  onNext,
  extraNextLabel,
  onExtraNext,
}: {
  darkMode: boolean
  currentLabel: string
  previousLabel: string | null
  nextLabel: string | null
  onPrevious?: () => void
  onNext?: () => void
  extraNextLabel?: string | null
  onExtraNext?: () => void
}) {
  const showPrevious = Boolean(previousLabel && onPrevious)
  const showNext = Boolean(nextLabel && onNext)
  const showExtraNext = Boolean(extraNextLabel && onExtraNext)
  const [isVisible, setIsVisible] = useState(true)

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const bottomTriggerStart = Math.max(0, window.innerHeight - 176)
      setIsVisible(event.clientY >= bottomTriggerStart)
    }
    const hide = () => setIsVisible(false)

    window.addEventListener('pointermove', handlePointerMove, { passive: true })
    window.addEventListener('pointerleave', hide)
    window.addEventListener('blur', hide)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerleave', hide)
      window.removeEventListener('blur', hide)
    }
  }, [])

  if (!showPrevious && !showNext && !showExtraNext) return null
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
      <div
        className={`bottom-next-step-bar ${isVisible ? 'bottom-next-step-bar--visible pointer-events-auto' : 'bottom-next-step-bar--hidden pointer-events-none'} flex w-full max-w-[56rem] flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 shadow-[0_18px_50px_rgba(15,23,42,0.18)] backdrop-blur ${
          darkMode
            ? 'border-blue-500/45 bg-gray-950/92 text-gray-100 shadow-black/40'
            : 'border-blue-200 bg-white/96 text-gray-900'
        }`}
      >
        <div className="min-w-0">
          <div className={`text-xs font-medium ${darkMode ? 'text-blue-200' : 'text-blue-700'}`}>
            本页计算已完成
          </div>
          <div className="truncate text-sm font-semibold">{currentLabel}</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {showPrevious && (
            <button type="button" className={`${btnSecondary(darkMode)} min-w-[8rem] justify-center`} onClick={onPrevious}>
              {previousLabel}
            </button>
          )}
          {showExtraNext && (
            <button type="button" className={`${btnSecondary(darkMode)} min-w-[8rem] justify-center`} onClick={onExtraNext}>
              {extraNextLabel}
            </button>
          )}
          {showNext && (
            <button type="button" className={`${btnPrimary(darkMode)} min-w-[8rem] justify-center`} onClick={onNext}>
              {nextLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function SummaryMetricCard({
  darkMode,
  label,
  value,
}: {
  darkMode: boolean
  label: string
  value: string
}) {
  return (
    <div className={`rounded-lg border px-3 py-3 ${darkMode ? 'border-gray-600 bg-gray-900/30' : 'border-gray-200 bg-gray-50'}`}>
      <div className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{label}</div>
      <div className={`mt-1 break-words text-base font-semibold ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}>{value}</div>
    </div>
  )
}

function CaseSummaryStageSection({
  darkMode,
  title,
  statusLabel,
  open,
  onToggle,
  children,
}: {
  darkMode: boolean
  title: string
  statusLabel: string
  open: boolean
  onToggle: () => void
  children: ReactNode
}) {
  return (
    <div className={cardBase(darkMode)}>
      <div className="flex w-full flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className={`${sectionTitle(darkMode)} mb-0`}>{title}</h3>
          <div className={`${hintText(darkMode)} mt-1`}>{statusLabel}</div>
        </div>
        <button type="button" className={btnSecondary(darkMode)} onClick={onToggle}>
          {open ? '折叠' : '展开'}
        </button>
      </div>
      {open && <div className="mt-4 space-y-4">{children}</div>}
    </div>
  )
}

function CaseSummaryMiniTabs({
  darkMode,
  tabs,
  activeId,
  onChange,
}: {
  darkMode: boolean
  tabs: Array<{ id: string; label: string }>
  activeId: string
  onChange: (id: string) => void
}) {
  return (
    <div className={`inline-flex items-end gap-1 rounded-t-md border-b-2 px-1 pt-1 ${darkMode ? 'border-gray-600' : 'border-gray-300'}`}>
      {tabs.map((tab) => {
        const active = tab.id === activeId
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

function buildSummaryPhaseColumns(
  stageState: CopperProcessStageState,
  stageId: EquipmentStageId
): { columns: PhaseTableColumn[]; phaseRowKeys: string[] } {
  const showFuel = stageId !== 'converting'
  const airColumns =
    stageId === 'converting'
      ? stageState.airColumns.filter((column) => column.airRole !== 'secondary')
      : stageState.airColumns
  const buildColumn = (
    id: string,
    kind: PhaseTableColumn['kind'],
    header: string,
    subHeader: string,
    weight: number,
    ratios: CopperRatios,
    options: {
      moisture?: number
      waterWeight?: number
      materialRows?: MaterialPhaseAssistRow[]
    } = {}
  ): PhaseTableColumn => {
    const { moisture = 0, waterWeight = 0, materialRows = [] } = options
    const manual = stageState.manualPhaseRatioColumns[id] === true
    const overrides = manual ? storedPhaseOverridesToMap(stageState.phaseRatioOverrides[id]) : null
    const rowKeys = materialRows.length > 0 ? materialPhaseRowTableKeys(materialRows) : undefined
    const batchResult = kind === 'raw' || kind === 'other' ? stageState.phaseBatchResults?.[id] : undefined
    const phaseReady =
      (kind !== 'raw' && kind !== 'other') ||
      manual ||
      Boolean(stageState.phaseCompletedMaterials[id] && batchResult?.valid)
    const phaseContentsByKey =
      phaseReady && batchResult?.valid && materialRows.length > 0
        ? mapPhaseContentsToTableKeys(batchResult.phaseContents, materialRows)
        : null
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
      readOnly: true,
    }
  }

  const { concentrates, others } = partitionRawMixMaterials(stageState.rawMaterials)
  const rawColumns = [
    ...concentrates.map((material, index) =>
      buildColumn(
        material.id,
        'raw',
        `原料${index + 1}`,
        displayRawMaterialName(material.name),
        material.weight,
        material.ratios,
        {
          moisture: material.moisture,
          waterWeight: materialWaterWeight(material),
          materialRows: stageState.materialPhaseRows[material.id] ?? [],
        }
      )
    ),
    ...others.map((material, index) =>
      buildColumn(
        material.id,
        'other',
        `其他${index + 1}`,
        displayRawMaterialName(material.name),
        material.weight,
        material.ratios,
        {
          moisture: material.moisture,
          waterWeight: materialWaterWeight(material),
          materialRows: stageState.materialPhaseRows[material.id] ?? [],
        }
      )
    ),
  ]
  const solventColumns = stageState.solventColumns.map((material, index) =>
    buildColumn(
      material.id,
      'solvent',
      `熔剂${index + 1}`,
      material.name,
      material.weight,
      material.ratios,
      {
        moisture: material.moisture,
        waterWeight: materialWaterWeight(material),
      }
    )
  )
  const fuelColumns = showFuel
    ? [
        buildColumn(
          stageState.fuelColumn.id,
          'fuel',
          '燃料',
          displayFuelName(stageState.fuelColumn.name),
          stageState.fuelColumn.weight,
          stageState.fuelColumn.ratios,
          {
            moisture: stageState.fuelColumn.moisture,
            waterWeight: materialWaterWeight(stageState.fuelColumn),
            materialRows: stageState.materialPhaseRows[stageState.fuelColumn.id] ?? [],
          }
        ),
      ]
    : []
  const gasColumns = airColumns.map((material) => ({
    id: material.id,
    kind: 'oxygen' as const,
    header: '气',
    subHeader: material.name,
    weight: material.weight,
    waterWeight: materialWaterWeight(material),
    moisture: material.moisture ?? 0,
    oxygenAir: buildOxygenAirPhaseColumn(material.ratios, material.weight, materialWaterWeight(material)),
    readOnly: true,
  }))
  const feed = calculateWeightedComposition([
    ...stageState.rawMaterials,
    ...stageState.solventColumns,
    ...(showFuel ? [stageState.fuelColumn] : []),
  ])
  const blendColumn = buildColumn(
    'summary-blend',
    'blend',
    stageId === 'converting' ? '投入' : '混料',
    stageId === 'converting' ? '投入' : '混合铜精矿',
    feed.totalWeight,
    feed.ratios
  )
  const columns = [...rawColumns, ...solventColumns, ...fuelColumns, ...gasColumns, blendColumn]
  const phaseRowKeys = collectMaterialPhaseTableKeys(stageState.rawMaterials, stageState.materialPhaseRows)
  const fallbackKeys = getPhaseTableColumnKeys('compound')
  return {
    columns,
    phaseRowKeys: phaseRowKeys.length > 0 ? phaseRowKeys : [...fallbackKeys],
  }
}

function CaseSummaryElementTable({
  darkMode,
  stageState,
  stageId,
  elementDisplayMode,
}: {
  darkMode: boolean
  stageState: CopperProcessStageState
  stageId: EquipmentStageId
  elementDisplayMode: CopperElementDisplayMode
}) {
  const showFuel = stageId !== 'converting'
  const airColumns =
    stageId === 'converting'
      ? stageState.airColumns.filter((column) => column.airRole !== 'secondary')
      : stageState.airColumns
  const rawMaterials = stageState.rawMaterials
  const solventColumns = stageState.solventColumns.map((material) => ({
    ...material,
    name: displaySolventName(material.name),
  }))
  const fuelColumn = {
    ...stageState.fuelColumn,
    name: displayFuelName(stageState.fuelColumn.name),
  }
  const { concentrates } = partitionRawMixMaterials(rawMaterials)
  const rawConcentrateBlend = calculateWeightedComposition(
    concentrates.map((material) => ({
      ...material,
      waterWeight: 0,
      moisture: 0,
    }))
  )
  const rawConcentrateWaterWeight = totalWaterWeight(concentrates)
  const blendMoistureColumns = [
    ...rawMaterials,
    ...solventColumns,
    ...(showFuel ? [{ ...fuelColumn, moisture: fuelColumn.moisture ?? 0 }] : []),
  ]
  const furnaceBlendWaterWeight = totalWaterWeight(blendMoistureColumns)
  const furnaceFeed = calculateWeightedComposition([
    ...rawMaterials,
    ...solventColumns,
    ...(showFuel ? [fuelColumn] : []),
    ...airColumns,
  ])
  const furnaceDryFeed = calculateWeightedComposition(
    [...rawMaterials, ...solventColumns, ...(showFuel ? [fuelColumn] : []), ...airColumns].map((material) => ({
      ...material,
      waterWeight: 0,
      moisture: 0,
    }))
  )
  const elementKeys = visibleCopperElementKeys(
    [...rawMaterials, ...solventColumns, fuelColumn, ...airColumns],
    COPPER_PLACEHOLDER_ELEMENT_KEYS,
    ELEMENT_TABLE_VISIBLE_EPSILON,
    COPPER_ELEMENT_TABLE_ALWAYS_INCLUDE
  )
  const nameColWidth = batchTableNameColWidthFromLabels([
    '请选择',
    ...stageState.materialLibrary.map((item) => item.name),
    ...rawMaterials.map((material) => material.name.trim() || '请选择'),
    stageId === 'converting' ? '投入' : '混合铜精矿',
    ...solventColumns.map((material) => material.name),
  ])
  const tableWidth = batchElementTableWidth(elementKeys.length, nameColWidth)
  const rawWeightDrafts = Object.fromEntries(
    rawMaterials.map((material) => [material.id, formatTableNumber(material.weight)])
  )
  const waterWeightDrafts = Object.fromEntries([
    ...rawMaterials.map((material) => [
      `raw:${material.id}`,
      formatTableNumber(materialWaterWeight(material)),
    ]),
    ...solventColumns.map((material) => [
      `solvent:${material.id}`,
      formatTableNumber(materialWaterWeight(material)),
    ]),
    [
      `fuel:${fuelColumn.id}`,
      formatTableNumber(materialWaterWeight(fuelColumn)),
    ],
  ])
  const noop = () => undefined
  const resolvedStatus = (): SolveInputStatus => 'resolved'

  return (
    <CopperBatchElementTable
      darkMode={darkMode}
      tableWidth={tableWidth}
      nameColWidth={nameColWidth}
      elementKeys={elementKeys}
      elementDisplayMode={elementDisplayMode}
      feedTotalWeight={Math.max(0, furnaceFeed.totalWeight - furnaceBlendWaterWeight)}
      rawConcentrateWeight={rawConcentrateBlend.totalWeight}
      rawConcentrateRatios={rawConcentrateBlend.ratios}
      rawConcentrateWaterWeight={rawConcentrateWaterWeight}
      rawMaterials={rawMaterials}
      solventColumns={solventColumns}
      fuelColumn={fuelColumn}
      airColumns={airColumns}
      furnaceFeedRatios={furnaceDryFeed.ratios}
      furnaceBlendWaterWeight={furnaceBlendWaterWeight}
      productTableColumns={[]}
      productTotalMass={0}
      productCalculated={false}
      materialLibrary={stageState.materialLibrary}
      formatTableNumber={formatTableNumber}
      solveInputClass={solveInputClass}
      materialSelectClass={materialSelectClass}
      productOutputCellClass={productOutputCellClass}
      ratioInputValue={(_kind, _id, _element, fallback) => fallback ?? 0}
      rawWeightDrafts={rawWeightDrafts}
      waterWeightDrafts={waterWeightDrafts}
      ratioDrafts={{}}
      phaseCellStatus={() => 'resolved'}
      sulfurInputStatus={sulfurInputStatus}
      rawWeightStatus={resolvedStatus}
      solventWeightStatus={resolvedStatus}
      fuelWeightStatus={resolvedStatus}
      waterWeightStatus={() => 'resolved'}
      oxygenAirInputStatus="resolved"
      phaseUnknownElements={PHASE_UNKNOWN_ELEMENTS}
      phaseCompleted={stageState.phaseCompleted}
      rawTotalOverLimit={(id) => {
        const material = rawMaterials.find((item) => item.id === id)
        return material ? isRawMaterialKnownTotalOverLimit(material.ratios) : false
      }}
      onRawWeightChange={noop}
      onApplyLibraryMaterial={noop}
      onRemoveMaterial={noop}
      onRemoveSolvent={noop}
      onSolventNameChange={noop}
      onRawRatioChange={noop}
      onRawRatioBlur={noop}
      onSolventWeightChange={noop}
      onSolventWeightBlur={noop}
      onFuelWeightChange={noop}
      onFuelWeightBlur={noop}
      onSolventRatioChange={noop}
      onSolventRatioBlur={noop}
      onFuelRatioChange={noop}
      onFuelRatioBlur={noop}
      onGasRatioChange={noop}
      onGasRatioBlur={noop}
      onMaterialWaterWeightChange={noop}
      onMaterialWaterWeightBlur={noop}
      onFuelWaterWeightChange={noop}
      onFuelWaterWeightBlur={noop}
      showProductRows={false}
      onOpenElementAssist={noop}
      onGasWeightChange={noop}
      onGasWeightBlur={noop}
      blendCategoryLabel={stageId === 'converting' ? '投入' : '混料'}
      blendNameLabel={stageId === 'converting' ? '投入' : '混合铜精矿'}
      showFuel={showFuel}
    />
  )
}

function CaseSummaryStageTables({
  darkMode,
  stageId,
  stageState,
  bomItems,
  bomReady,
}: {
  darkMode: boolean
  stageId: EquipmentStageId
  stageState: CopperProcessStageState | undefined
  bomItems: EquipmentBomItem[]
  bomReady: boolean
}) {
  const [inputTab, setInputTab] = useState<'element' | 'phase'>(
    stageId === 'converting' ? 'phase' : 'element'
  )
  const [outputTab, setOutputTab] = useState<'phase' | 'element'>('phase')
  const [elementDisplayMode, setElementDisplayMode] = useState<CopperElementDisplayMode>('compound')
  const productDisplayStage = stageId === 'converting' ? 'converting' : 'smelting'
  const productResult = stageState?.productSolverResult ?? null
  const heatBalance = stageState?.calculatedHeatBalance ?? null
  const heatReady = Boolean(stageState?.heatBalanceFilledBack && heatBalance)
  const concentrateMassTh = stageState
    ? stageState.rawMaterials.reduce((sum, material) => sum + (material.weight ?? 0), 0)
    : 0
  const phaseBundle = stageState ? buildSummaryPhaseColumns(stageState, stageId) : null
  const nameColWidth = batchTableNameColWidthFromLabels(
    phaseBundle?.columns.map((column) => `${column.header}${column.subHeader}`) ?? ['混料']
  )
  const phaseWidth = batchPhaseTableWidth(phaseBundle?.phaseRowKeys.length ?? 8, nameColWidth)
  const noop = () => undefined
  const inputTabs =
    stageId === 'converting'
      ? [
          { id: 'phase' as const, label: '投入-物料物相表' },
          { id: 'element' as const, label: '投入-物料元素表' },
        ]
      : [
          { id: 'element' as const, label: '投入-物料元素表' },
          { id: 'phase' as const, label: '投入-物料物相表' },
        ]

  return (
    <div className="space-y-5">
      <div className={cardCompact(darkMode)}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-2">
            <h3 className={`${sectionTitle(darkMode)} mb-0`}>投入</h3>
            <CaseSummaryMiniTabs
              darkMode={darkMode}
              tabs={inputTabs}
              activeId={inputTab}
              onChange={(id) => setInputTab(id as 'element' | 'phase')}
            />
          </div>
          {inputTab === 'element' && stageState && (
            <button
              type="button"
              role="switch"
              aria-checked={elementDisplayMode === 'element'}
              aria-label="投入表元素转换"
              title={
                elementDisplayMode === 'compound'
                  ? '将 SiO₂/Al₂O₃/CaO/MgO 拆解为 Si/Al/Ca/Mg 与 O 元素显示'
                  : '恢复化合物列显示并编辑原始化验值'
              }
              className="inline-flex cursor-pointer items-center gap-2 border-0 bg-transparent p-0"
              onClick={() => setElementDisplayMode((v) => (v === 'compound' ? 'element' : 'compound'))}
            >
              <span className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>元素转换</span>
              <span
                aria-hidden
                className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                  elementDisplayMode === 'element'
                    ? 'bg-blue-600'
                    : darkMode
                      ? 'bg-gray-600'
                      : 'bg-gray-300'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                    elementDisplayMode === 'element' ? 'translate-x-4' : 'translate-x-0.5'
                  }`}
                />
              </span>
            </button>
          )}
        </div>
        {!stageState ? (
          <div className={`rounded-lg border px-3 py-6 text-center text-sm ${darkMode ? 'border-gray-600 text-gray-400' : 'border-gray-200 text-gray-500'}`}>
            暂无投入数据
          </div>
        ) : inputTab === 'element' ? (
          <CaseSummaryElementTable
            darkMode={darkMode}
            stageState={stageState}
            stageId={stageId}
            elementDisplayMode={elementDisplayMode}
          />
        ) : phaseBundle ? (
          <CopperBatchPhaseTables
            darkMode={darkMode}
            phaseRowKeys={phaseBundle.phaseRowKeys}
            inputColumns={phaseBundle.columns}
            outputColumns={[]}
            tableWidth={phaseWidth}
            nameColWidth={nameColWidth}
            formatTableNumber={formatTableNumber}
            furnaceBlendWaterWeight={0}
            title="投入-物料物相表（w%）"
            inputDrafts={{}}
            outputDrafts={{}}
            invalidInputColumns={{}}
            invalidOutputColumns={{}}
            rawSummaryHeader={stageId === 'converting' ? '投入' : '混料'}
            rawSummarySubHeader={stageId === 'converting' ? '投入' : '混合铜精矿'}
            showFuel={stageId !== 'converting'}
            onInputDraftChange={noop}
            onInputDraftCommit={noop}
            onOutputDraftChange={noop}
            onOutputDraftCommit={noop}
          />
        ) : null}
      </div>

      <div className={cardCompact(darkMode)}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-2">
            <h3 className={`${sectionTitle(darkMode)} mb-0`}>产出计算</h3>
            <CaseSummaryMiniTabs
              darkMode={darkMode}
              tabs={[
                { id: 'phase', label: '产出-产物物相表' },
                { id: 'element', label: '产出-产物元素表' },
              ]}
              activeId={outputTab}
              onChange={(id) => setOutputTab(id as 'phase' | 'element')}
            />
          </div>
        </div>
        {productResult ? (
          <CopperProductionResultTable
            darkMode={darkMode}
            result={productResult}
            metcalResult={stageState?.metcalProductResult ?? null}
            showMetcalComparison={Boolean(productResult && stageState?.metcalProductResult)}
            config={stageState?.productConstraintConfig ?? undefined}
            productDisplayStage={productDisplayStage}
            defaultFlueGasTotalUnit="volume"
            widthMode="content"
            mode={outputTab}
          />
        ) : (
          <div className={`rounded-lg border px-3 py-6 text-center text-sm ${darkMode ? 'border-gray-600 text-gray-400' : 'border-gray-200 text-gray-500'}`}>
            暂无产出计算结果
          </div>
        )}
      </div>

      <div className={cardCompact(darkMode)}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h3 className={`${sectionTitle(darkMode)} mb-0`}>热平衡计算</h3>
          {heatBalance && (
            <div className={hintText(darkMode)}>
              {heatBalanceClosureStatusLabel(heatBalance, Boolean(stageState?.heatBalanced))}
            </div>
          )}
        </div>
        {heatReady && heatBalance ? (
          <CopperHeatBalancePlaceholderTables
            darkMode={darkMode}
            result={heatBalance}
            concentrateMassTh={concentrateMassTh}
            productResult={productResult}
            airColumns={stageState?.airColumns ?? null}
            chemicalHeatMode={normalizeChemicalHeatMode(stageState?.chemicalHeatMode)}
            showAuxiliaryParams={false}
          />
        ) : (
          <div className={`rounded-lg border px-3 py-6 text-center text-sm ${darkMode ? 'border-gray-600 text-gray-400' : 'border-gray-200 text-gray-500'}`}>
            暂无热平衡计算结果
          </div>
        )}
      </div>

      <div>
        <div className={`mb-2 text-sm font-semibold ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}>
          BOM 设备清单{bomReady ? '' : '（尚未生成）'}
        </div>
        {bomReady && bomItems.length > 0 ? (
          <EquipmentBomTable darkMode={darkMode} items={bomItems} />
        ) : (
          <div className={`rounded-lg border px-3 py-6 text-center text-sm ${darkMode ? 'border-gray-600 text-gray-400' : 'border-gray-200 text-gray-500'}`}>
            本工序尚未生成 BOM
          </div>
        )}
      </div>
    </div>
  )
}

function ProcessIsland3DOverview({
  darkMode,
  equipmentCompleteByStage,
  completedCount,
  targetScaleWanTpa,
  annualHours,
  totalFeedTh,
  smeltingDesign,
}: {
  darkMode: boolean
  equipmentCompleteByStage: Record<EquipmentStageId, boolean>
  completedCount: number
  targetScaleWanTpa: number
  annualHours: number
  totalFeedTh: number
  smeltingDesign: SmeltingFurnaceDesignResult | null
}) {
  const equipmentTabs = useMemo(() => {
    const tabs: Array<{ id: EquipmentStageId; label: string }> = []
    if (smeltingDesign && smeltingDesign.designAreaM2 > 0) {
      tabs.push({ id: 'smelting', label: '熔炼设备' })
    }
    // 吹炼 / 精炼三维方案尚未接入时不显示对应 tab
    return tabs
  }, [smeltingDesign])

  const [activeEquipmentTab, setActiveEquipmentTab] = useState<EquipmentStageId | null>(null)
  const resolvedEquipmentTab =
    activeEquipmentTab && equipmentTabs.some((tab) => tab.id === activeEquipmentTab)
      ? activeEquipmentTab
      : equipmentTabs[0]?.id ?? null

  useEffect(() => {
    if (!equipmentTabs.some((tab) => tab.id === activeEquipmentTab)) {
      setActiveEquipmentTab(equipmentTabs[0]?.id ?? null)
    }
  }, [activeEquipmentTab, equipmentTabs])

  return (
    <div className={`mt-4 overflow-hidden rounded-2xl border shadow-sm ${
      darkMode ? 'border-gray-600 bg-gray-950/40' : 'border-gray-200 bg-white'
    }`}>
      <div className={`flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4 ${
        darkMode ? 'border-gray-700 bg-gray-900/70' : 'border-gray-200 bg-slate-50'
      }`}>
        <div>
          <div className={`text-sm font-semibold ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}>三维设备方案</div>
          <div className={`${hintText(darkMode)} mt-1`}>
            按工序切换查看单台设备三维模型（含 XYZ 坐标轴）；仅显示已生成方案的工序。
          </div>
        </div>
        <div className={`rounded-full border px-3 py-1 text-xs font-medium ${
          completedCount === 3
            ? darkMode ? 'border-emerald-700 bg-emerald-950/50 text-emerald-200' : 'border-emerald-200 bg-emerald-50 text-emerald-700'
            : darkMode ? 'border-amber-700 bg-amber-950/50 text-amber-200' : 'border-amber-200 bg-amber-50 text-amber-700'
        }`}>
          设备选型 {completedCount}/3
        </div>
      </div>

      {equipmentTabs.length > 0 && resolvedEquipmentTab ? (
        <div className="space-y-3 p-4">
          <CaseSummaryMiniTabs
            darkMode={darkMode}
            tabs={equipmentTabs}
            activeId={resolvedEquipmentTab}
            onChange={(id) => setActiveEquipmentTab(id as EquipmentStageId)}
          />
          {resolvedEquipmentTab === 'smelting' && smeltingDesign && (
            <SmeltingFurnacePlanPanel darkMode={darkMode} design={smeltingDesign} embedded />
          )}
        </div>
      ) : (
        <div className={`px-5 py-10 text-center text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
          尚未生成可汇总的三维设备方案。完成熔炼设备选型并生成三维方案后，将在此显示「熔炼设备」页签。
        </div>
      )}

      <div className={`border-t px-4 pb-4 pt-4 ${darkMode ? 'border-gray-700 bg-gray-900/30' : 'border-gray-200 bg-slate-50/70'}`}>
        <div className="mb-3">
          <div className={`text-xs font-semibold ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>案例信息总览</div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <SummaryMetricCard darkMode={darkMode} label="目标规模" value={`${formatTableDisplayValue(targetScaleWanTpa)} 万吨/a`} />
          <SummaryMetricCard darkMode={darkMode} label="年运行时间" value={`${formatTableDisplayValue(annualHours)} h/a`} />
          <SummaryMetricCard darkMode={darkMode} label="混料处理量" value={`${formatTableDisplayValue(totalFeedTh)} t/h`} />
          <SummaryMetricCard
            darkMode={darkMode}
            label="熔炼"
            value={equipmentCompleteByStage.smelting ? '设备选型已完成' : '待设备选型'}
          />
          <SummaryMetricCard
            darkMode={darkMode}
            label="吹炼"
            value={equipmentCompleteByStage.converting ? '设备选型已完成' : '待设备选型'}
          />
          <SummaryMetricCard darkMode={darkMode} label="精炼" value="待开发" />
        </div>
      </div>
    </div>
  )
}

function buildCopperEquipmentBom(
  stageId: EquipmentStageId | null,
  row: {
    id: EquipmentStageId
    stage: string
    sizing: { adjustedThroughput: number; recommendedUnits: number }
    currentThroughput: number
  },
  targetScaleWanTpa: number,
  dimensionAdjustment = 1,
  smeltingDesign: SmeltingFurnaceDesignResult | null = null
): EquipmentBomItem[] {
  if (!stageId) return []

  if (stageId === 'smelting') {
    if (!smeltingDesign || !(smeltingDesign.designAreaM2 > 0) || !(smeltingDesign.designLengthM > 0)) return []
    const lengthM = smeltingDesign.designLengthM
    const widthM = smeltingDesign.furnaceWidthM
    const heightM = resolveFurnaceBodyHeightM(widthM)
    return [
      {
        id: 'smelting-furnace',
        name: '侧吹熔炼炉本体',
        specification: `${lengthM.toFixed(2)}m × ${widthM.toFixed(2)}m × ${heightM.toFixed(2)}m（熔炼炉面积 ${formatTableDisplayValue(smeltingDesign.designAreaM2)} m² / 炉床面积 ${formatTableDisplayValue(smeltingDesign.areaM2)} m²）`,
        quantity: 1,
        unit: '台',
        material: '钢壳 + 水套 + 耐火内衬',
        note: `水套间隔 ${formatTableDisplayValue(smeltingDesign.jacketPitchMm)} mm，一侧 ${smeltingDesign.jacketCountOneSide} / 双侧 ${smeltingDesign.jacketCountTotal} 块`,
      },
      {
        id: 'smelting-feed',
        name: '加料及喷吹系统',
        specification: `配套 1 台炉`,
        quantity: 1,
        unit: '套',
        material: '成套设备',
        note: '随炉体配置',
      },
      {
        id: 'smelting-tuyere',
        name: '一次风口系统',
        specification: `两侧 ${smeltingDesign.tuyereCount} 个（单侧 ${smeltingDesign.tuyereCountOneSide}）`,
        quantity: smeltingDesign.tuyereCount,
        unit: '个',
        material: '铜水套风口',
        note: `单侧 ${formatTableDisplayValue(smeltingDesign.tuyereOneSideOxygenCapacityNm3h)} · 全开 ${formatTableDisplayValue(smeltingDesign.tuyereFullOxygenCapacityNm3h)} Nm³/h`,
      },
      {
        id: 'smelting-offgas',
        name: '烟气余热与收尘接口',
        specification: `熔炼炉面积 ${formatTableDisplayValue(smeltingDesign.designAreaM2)} m²`,
        quantity: 1,
        unit: '套',
        material: '钢结构/管道',
        note: '用于后续烟气系统衔接',
      },
      {
        id: 'smelting-tap',
        name: '冰铜/炉渣排放系统',
        specification: `${lengthM.toFixed(2)}m × ${widthM.toFixed(2)}m 炉型`,
        quantity: 1,
        unit: '套',
        material: '耐热钢 + 浇注料',
        note: '按熔炼设计参数生成',
      },
    ]
  }

  if (row.sizing.recommendedUnits <= 0 || row.sizing.adjustedThroughput <= 0) return []
  const units = Math.max(1, row.sizing.recommendedUnits)
  const throughput = Math.max(row.sizing.adjustedThroughput / units, 1)
  const scaleFactor = Math.max(targetScaleWanTpa / 10, 0.6)
  const dimensionFactor = Math.max(0.75, Math.min(1.35, dimensionAdjustment || 1))
  const furnaceLength = Math.max(8, Math.min(26, 7.5 + Math.sqrt(throughput) * 1.15 + scaleFactor * 1.8)) * dimensionFactor
  const furnaceWidth = Math.max(3.2, Math.min(10, furnaceLength * 0.36))
  const furnaceHeight = Math.max(3.6, Math.min(12, furnaceLength * 0.42))

  const stageConfig: Record<Exclude<EquipmentStageId, 'smelting'>, { main: string; feed: string; offgas: string; tap: string }> = {
    converting: { main: '吹炼炉本体', feed: '冰铜加入与供风系统', offgas: '吹炼烟气接口', tap: '粗铜/吹炼渣排放系统' },
    refining: { main: '精炼炉本体', feed: '粗铜加入与氧化还原系统', offgas: '精炼烟气接口', tap: '阳极铜浇铸接口' },
  }
  const config = stageConfig[stageId]
  return [
    {
      id: `${stageId}-furnace`,
      name: config.main,
      specification: `${furnaceLength.toFixed(1)}m × ${furnaceWidth.toFixed(1)}m × ${furnaceHeight.toFixed(1)}m`,
      quantity: units,
      unit: '台',
      material: '钢壳 + 耐火内衬',
      note: `按 ${formatTableDisplayValue(throughput)} t/h·台临时折算`,
    },
    {
      id: `${stageId}-feed`,
      name: config.feed,
      specification: `配套 ${units} 台炉`,
      quantity: units,
      unit: '套',
      material: '成套设备',
      note: '随炉体数量配置',
    },
    {
      id: `${stageId}-offgas`,
      name: config.offgas,
      specification: `接口能力 ${formatTableDisplayValue(row.sizing.adjustedThroughput)} t/h`,
      quantity: units,
      unit: '套',
      material: '钢结构/管道',
      note: '用于后续烟气系统衔接',
    },
    {
      id: `${stageId}-tap`,
      name: config.tap,
      specification: `目标规模 ${formatTableDisplayValue(targetScaleWanTpa)} 万吨/a`,
      quantity: units,
      unit: '套',
      material: '耐热钢 + 浇注料',
      note: '临时 BOM，待正式炉型参数校核',
    },
  ]
}

/** 三维方案面板：视图占满整宽，炉型参数集中到下方横向信息总览 */
function SmeltingFurnacePlanPanel({
  darkMode,
  design,
  viewerRef,
  embedded = false,
}: {
  darkMode: boolean
  design: SmeltingFurnaceDesignResult
  viewerRef?: RefObject<SmeltingFurnaceViewerHandle>
  /** 汇总总览内嵌时去掉外层卡片边框，避免双重套框 */
  embedded?: boolean
}) {
  const lengthM = Math.max(design.designLengthM || design.furnaceLengthM, 0.1)
  const widthM = Math.max(design.furnaceWidthM, 0.1)
  const heightM = resolveFurnaceBodyHeightM(widthM)

  const body = (
    <>
      {!embedded && (
        <div className={`flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4 ${
          darkMode ? 'border-gray-700 bg-gray-900/70' : 'border-gray-200 bg-slate-50'
        }`}>
          <div>
            <div className={`text-sm font-semibold ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}>三维熔炼炉方案</div>
          </div>
          <div className={`rounded-full px-2.5 py-1 text-xs font-medium ${
            darkMode ? 'bg-emerald-950/50 text-emerald-200' : 'bg-emerald-50 text-emerald-700'
          }`}>
            方案已生成
          </div>
        </div>
      )}
      <div className={embedded ? 'pt-1' : 'p-4'}>
        <SmeltingFurnaceViewer ref={viewerRef ?? null} darkMode={darkMode} design={design} />
      </div>
      <div className={`${embedded ? 'mt-3' : 'border-t'} px-1 pb-1 pt-3 ${
        embedded ? '' : darkMode ? 'border-gray-700 bg-gray-900/30 px-4 pb-4 pt-4' : 'border-gray-200 bg-slate-50/70 px-4 pb-4 pt-4'
      }`}>
        <div className="mb-3">
          <div className={`text-xs font-semibold ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>参数信息总览</div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-8">
          <SummaryMetricCard darkMode={darkMode} label="炉床面积" value={`${formatTableDisplayValue(design.areaM2)} m²`} />
          <SummaryMetricCard darkMode={darkMode} label="熔炼炉面积" value={`${formatTableDisplayValue(design.designAreaM2)} m²`} />
          <SummaryMetricCard
            darkMode={darkMode}
            label="炉体尺寸 长×宽×高"
            value={`${lengthM.toFixed(2)} × ${widthM.toFixed(2)} × ${heightM.toFixed(2)} m`}
          />
          <SummaryMetricCard
            darkMode={darkMode}
            label="水套个数"
            value={`一侧 ${design.jacketCountOneSide} · 双侧 ${design.jacketCountTotal}`}
          />
          <SummaryMetricCard darkMode={darkMode} label="水套间隔" value={`${formatTableDisplayValue(design.jacketPitchMm)} mm`} />
          <SummaryMetricCard
            darkMode={darkMode}
            label="风口数"
            value={`单侧 ${design.tuyereCountOneSide} · 双侧 ${design.tuyereCount}`}
          />
          <SummaryMetricCard darkMode={darkMode} label="氧气流量" value={`${formatTableDisplayValue(design.oxygenNm3h)} Nm³/h`} />
          <SummaryMetricCard
            darkMode={darkMode}
            label="风口能力 单侧 / 全开"
            value={`${formatTableDisplayValue(design.tuyereOneSideOxygenCapacityNm3h)} / ${formatTableDisplayValue(design.tuyereFullOxygenCapacityNm3h)} Nm³/h`}
          />
        </div>
      </div>
    </>
  )

  if (embedded) return <div className="space-y-1">{body}</div>

  return (
    <div className={`mt-4 overflow-hidden rounded-2xl border shadow-sm ${
      darkMode ? 'border-gray-600 bg-gray-950/40' : 'border-gray-200 bg-white'
    }`}>
      {body}
    </div>
  )
}

function escapeHtmlText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function downloadTextFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

function buildEquipmentBomExportHtml(input: {
  caseName: string
  stageLabel: string
  stageId: EquipmentStageId
  items: EquipmentBomItem[]
  design: SmeltingFurnaceDesignResult | null
  furnaceSizeLabel: string | null
  imageDataUrl: string | null
}): string {
  const rows = input.items
    .map(
      (item, index) => `<tr>
  <td>${index + 1}</td>
  <td>${escapeHtmlText(item.name)}</td>
  <td>${escapeHtmlText(item.specification)}</td>
  <td>${item.quantity}</td>
  <td>${escapeHtmlText(item.unit)}</td>
  <td>${escapeHtmlText(item.material)}</td>
  <td>${escapeHtmlText(item.note)}</td>
</tr>`
    )
    .join('\n')

  const designBlock =
    input.design && input.furnaceSizeLabel
      ? `<h2>三维方案参数</h2>
<ul>
  <li>炉床面积：${escapeHtmlText(formatTableDisplayValue(input.design.areaM2))} m²</li>
  <li>熔炼炉面积：${escapeHtmlText(formatTableDisplayValue(input.design.designAreaM2))} m²</li>
  <li>炉体尺寸 长×宽×高：${escapeHtmlText(input.furnaceSizeLabel)}</li>
  <li>水套个数：一侧 ${input.design.jacketCountOneSide} · 双侧 ${input.design.jacketCountTotal}</li>
  <li>水套间隔：${escapeHtmlText(formatTableDisplayValue(input.design.jacketPitchMm))} mm</li>
  <li>风口数：单侧 ${input.design.tuyereCountOneSide} · 双侧 ${input.design.tuyereCount}</li>
  <li>氧气流量：${escapeHtmlText(formatTableDisplayValue(input.design.oxygenNm3h))} Nm³/h</li>
  <li>单侧风口能力：${escapeHtmlText(formatTableDisplayValue(input.design.tuyereOneSideOxygenCapacityNm3h))} Nm³/h</li>
  <li>全开风口能力：${escapeHtmlText(formatTableDisplayValue(input.design.tuyereFullOxygenCapacityNm3h))} Nm³/h</li>
</ul>`
      : `<h2>三维方案参数</h2><p>本工序暂无三维参数汇总。</p>`

  const imageBlock = input.imageDataUrl
    ? `<h2>三维示意</h2>
<p><img alt="三维炉体示意" src="${input.imageDataUrl}" style="max-width:100%;height:auto;border:1px solid #cbd5e1;" /></p>`
    : `<h2>三维示意</h2><p>暂无三维图（当前工序未挂载三维视图，或截图失败）。</p>`

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<title>${escapeHtmlText(input.caseName)} - ${escapeHtmlText(input.stageLabel)} 设备清单</title>
<style>
  body { font-family: "Microsoft YaHei", "PingFang SC", sans-serif; color: #0f172a; margin: 24px; line-height: 1.6; }
  h1 { font-size: 20px; margin: 0 0 8px; }
  h2 { font-size: 16px; margin: 24px 0 8px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; vertical-align: top; }
  th { background: #f8fafc; }
  .meta { color: #475569; font-size: 13px; }
</style>
</head>
<body>
<h1>设备清单导出</h1>
<p class="meta">案例：${escapeHtmlText(input.caseName)}　工序：${escapeHtmlText(input.stageLabel)}（${escapeHtmlText(input.stageId)}）　导出时间：${escapeHtmlText(new Date().toLocaleString())}</p>
${designBlock}
${imageBlock}
<h2>BOM 设备清单</h2>
<table>
  <thead>
    <tr>
      <th>序号</th>
      <th>设备名称</th>
      <th>规格/能力</th>
      <th>数量</th>
      <th>单位</th>
      <th>材质/类型</th>
      <th>备注</th>
    </tr>
  </thead>
  <tbody>
${rows}
  </tbody>
</table>
</body>
</html>
`
}

function EquipmentBomTable({ darkMode, items }: { darkMode: boolean; items: EquipmentBomItem[] }) {
  return (
    <div className={`w-full overflow-x-auto rounded-lg border ${darkMode ? 'border-gray-600' : 'border-gray-200'}`}>
      <table className={`w-full table-auto text-sm ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>
        <thead className={darkMode ? 'bg-gray-800/80 text-gray-300' : 'bg-slate-50 text-gray-600'}>
          <tr>
            <th className="whitespace-nowrap px-3 py-2.5 text-center font-semibold">序号</th>
            <th className="min-w-[8rem] px-3 py-2.5 text-left font-semibold">设备名称</th>
            <th className="min-w-[10rem] px-3 py-2.5 text-left font-semibold">规格/能力</th>
            <th className="whitespace-nowrap px-3 py-2.5 text-center font-semibold">数量</th>
            <th className="whitespace-nowrap px-3 py-2.5 text-center font-semibold">单位</th>
            <th className="min-w-[7rem] px-3 py-2.5 text-left font-semibold">材质/类型</th>
            <th className="min-w-[8rem] px-3 py-2.5 text-left font-semibold">备注</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
            <tr key={item.id} className={`border-t ${darkMode ? 'border-gray-600' : 'border-gray-200'}`}>
              <td className="px-3 py-2 text-center font-mono">{index + 1}</td>
              <td className="px-3 py-2 text-left font-medium">{item.name}</td>
              <td className="px-3 py-2 text-left leading-relaxed">{item.specification}</td>
              <td className="px-3 py-2 text-center font-mono">{item.quantity}</td>
              <td className="px-3 py-2 text-center">{item.unit}</td>
              <td className="px-3 py-2 text-left">{item.material}</td>
              <td className={`px-3 py-2 text-left ${hintText(darkMode)}`}>{item.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function HeatParameterGroup({
  darkMode,
  title,
  children,
  className = '',
 }: {
  darkMode: boolean
  title: string
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`rounded-lg border p-3 ${darkMode ? 'border-gray-600 bg-gray-900/20' : 'border-gray-200 bg-white'} ${className}`}>
      <div className={`mb-3 text-sm font-semibold ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>{title}</div>
      {children}
    </section>
  )
}

function LabeledInput({
  darkMode,
  label,
  value,
  onChange,
  readOnly = false,
  systemDerived = false,
}: {
  darkMode: boolean
  label: string
  value: string
  onChange?: (value: string) => void
  readOnly?: boolean
  /** 系统自动带入/只读对照：输入框灰度，仍可按需编辑 */
  systemDerived?: boolean
}) {
  const muted = readOnly || systemDerived
  return (
    <div>
      <label className={`mb-1 block text-xs font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>{label}</label>
      <input
        className={
          muted
            ? equipmentSystemDerivedInputClass(darkMode)
            : `${inputBase(darkMode)} w-full`
        }
        value={value}
        readOnly={readOnly}
        onChange={(event) => onChange?.(event.target.value)}
      />
    </div>
  )
}

/** 设备选型：系统自动带入参数的输入框灰度（仍可编辑） */
function equipmentSystemDerivedInputClass(dark: boolean) {
  return dark
    ? 'w-full rounded-lg border border-gray-700 bg-gray-800/90 px-3 py-2.5 font-mono text-sm text-gray-400 transition-colors focus:border-blue-500 focus:ring-1 focus:ring-blue-500'
    : 'w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2.5 font-mono text-sm text-slate-500 transition-colors focus:border-blue-500 focus:ring-1 focus:ring-blue-500'
}

/** 设备选型专用输入（热平衡等其它区域勿用） */
function EquipmentInput({
  darkMode,
  label,
  value,
  onChange,
  onImportFromBatch,
  headerActionLabel,
  onHeaderAction,
  systemDerived = false,
}: {
  darkMode: boolean
  label: string
  value: string
  onChange?: (value: string) => void
  /** 从配料计算同步当前参数到输入框 */
  onImportFromBatch?: () => void
  /** 右上角自定义操作（如「恢复为默认」）；与 onHeaderAction 同时传入时优先于从配料导入 */
  headerActionLabel?: string
  onHeaderAction?: () => void
  /** 系统自动带入：输入框灰度，仍可修改 */
  systemDerived?: boolean
}) {
  const headerAction =
    onHeaderAction && headerActionLabel
      ? { label: headerActionLabel, onClick: onHeaderAction }
      : onImportFromBatch
        ? { label: '从配料导入', onClick: onImportFromBatch }
        : null

  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <label className={`block text-xs font-medium ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>{label}</label>
        {headerAction ? (
          <button
            type="button"
            className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
              darkMode
                ? 'bg-sky-900/70 text-sky-100 hover:bg-sky-800'
                : 'bg-sky-50 text-sky-800 hover:bg-sky-100'
            }`}
            onClick={headerAction.onClick}
          >
            {headerAction.label}
          </button>
        ) : null}
      </div>
      <input
        className={
          systemDerived
            ? equipmentSystemDerivedInputClass(darkMode)
            : `${inputBase(darkMode)} w-full font-mono`
        }
        value={value}
        onChange={(event) => onChange?.(event.target.value)}
      />
    </div>
  )
}

function equipmentResultTone(darkMode: boolean, updated?: boolean) {
  if (updated) {
    return {
      shell: darkMode ? 'border-amber-600 bg-amber-950/45' : 'border-amber-400 bg-amber-50',
      title: darkMode ? 'text-amber-100/90' : 'text-amber-900',
      badge: darkMode ? 'bg-amber-700 text-amber-50' : 'bg-amber-600 text-white',
      value: darkMode ? 'text-amber-50' : 'text-amber-950',
      unit: darkMode ? 'text-amber-200/80' : 'text-amber-800',
      detail: darkMode ? 'text-amber-200/70' : 'text-amber-800/80',
      sublabel: darkMode ? 'text-amber-200/70' : 'text-amber-700/80',
    }
  }
  return {
    shell: darkMode ? 'border-sky-700 bg-sky-950/45' : 'border-sky-300 bg-sky-50',
    title: darkMode ? 'text-sky-100/90' : 'text-sky-900',
    badge: darkMode ? 'bg-sky-800 text-sky-50' : 'bg-sky-600 text-white',
    value: darkMode ? 'text-sky-50' : 'text-sky-950',
    unit: darkMode ? 'text-sky-200/80' : 'text-sky-800',
    detail: darkMode ? 'text-sky-200/70' : 'text-sky-800/80',
    sublabel: darkMode ? 'text-sky-200/70' : 'text-sky-700/80',
  }
}

function EquipmentResultCard({
  darkMode,
  label,
  value,
  unit,
  detail,
  dense,
  updated,
}: {
  darkMode: boolean
  label: string
  value: string
  unit?: string
  detail?: string
  /** 与其他结果卡叠放时不再单独占满最小高度 */
  dense?: boolean
  /** 余量处置后高亮为橘色 */
  updated?: boolean
}) {
  const tone = equipmentResultTone(darkMode, updated)
  return (
    <div
      className={`flex ${dense ? 'h-full' : EQUIP_RESULT_MIN_H} min-w-0 w-full flex-col justify-center rounded-lg border-2 ${
        dense ? 'px-3 py-2' : 'px-3 py-3'
      } shadow-sm ${tone.shell}`}
    >
      <div className={`${dense ? 'mb-0.5' : 'mb-1'} flex items-center justify-between gap-2`}>
        <div className={`text-xs font-semibold ${tone.title}`}>{label}</div>
        <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${tone.badge}`}>
          {updated ? '已更新' : '计算'}
        </span>
      </div>
      <div className={`font-mono ${dense ? 'text-lg' : 'text-xl'} font-semibold tracking-tight ${tone.value}`}>
        {value}
        {unit ? <span className={`ml-1 text-xs font-medium ${tone.unit}`}>{unit}</span> : null}
      </div>
      {detail ? <div className={`mt-0.5 text-[11px] leading-snug ${tone.detail}`}>{detail}</div> : null}
    </div>
  )
}

/** 水套个数结果卡：单侧 / 两侧 */
function EquipmentJacketCountCard({
  darkMode,
  oneSide,
  total,
  updated,
}: {
  darkMode: boolean
  oneSide: number
  total: number
  updated?: boolean
}) {
  const tone = equipmentResultTone(darkMode, updated)
  return (
    <div className={`flex ${EQUIP_RESULT_MIN_H} min-w-0 w-full flex-col justify-center rounded-lg border-2 px-3 py-3 shadow-sm ${tone.shell}`}>
      <div className="mb-0.5 flex items-center justify-between gap-2">
        <div className={`text-xs font-semibold ${tone.title}`}>{updated ? '更新后的水套个数' : '水套个数'}</div>
        <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${tone.badge}`}>
          {updated ? '已更新' : '计算'}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <div className={`${EQUIP_ITEM_LABEL} ${tone.sublabel}`}>单侧</div>
          <div className={`font-mono text-lg font-semibold tracking-tight ${tone.value}`}>
            {oneSide}
            <span className={`ml-1 text-xs font-medium ${tone.unit}`}>个</span>
          </div>
        </div>
        <div>
          <div className={`${EQUIP_ITEM_LABEL} ${tone.sublabel}`}>两侧</div>
          <div className={`font-mono text-lg font-semibold tracking-tight ${tone.value}`}>
            {total}
            <span className={`ml-1 text-xs font-medium ${tone.unit}`}>个</span>
          </div>
        </div>
      </div>
    </div>
  )
}

/** 风口能力结果卡：单侧 / 全开（氧气流量 ÷ 风口数） */
function EquipmentTuyereCapacityCard({
  darkMode,
  oneSideCapacityNm3h,
  fullCapacityNm3h,
}: {
  darkMode: boolean
  oneSideCapacityNm3h: number
  fullCapacityNm3h: number
}) {
  const tone = equipmentResultTone(darkMode, false)
  return (
    <div className={`flex ${EQUIP_RESULT_MIN_H} min-w-0 w-full flex-col justify-center rounded-lg border-2 px-3 py-3 shadow-sm ${tone.shell}`}>
      <div className="mb-0.5 flex items-center justify-between gap-2">
        <div className={`text-xs font-semibold ${tone.title}`}>风口能力</div>
        <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${tone.badge}`}>计算</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <div className={`${EQUIP_ITEM_LABEL} ${tone.sublabel}`}>单侧</div>
          <div className={`font-mono text-base font-semibold tracking-tight ${tone.value}`}>
            {formatTableDisplayValue(oneSideCapacityNm3h)}
            <span className={`ml-1 text-xs font-medium ${tone.unit}`}>Nm³/h</span>
          </div>
        </div>
        <div>
          <div className={`${EQUIP_ITEM_LABEL} ${tone.sublabel}`}>全开</div>
          <div className={`font-mono text-base font-semibold tracking-tight ${tone.value}`}>
            {formatTableDisplayValue(fullCapacityNm3h)}
            <span className={`ml-1 text-xs font-medium ${tone.unit}`}>Nm³/h</span>
          </div>
        </div>
      </div>
      <div className={`mt-0.5 text-[11px] leading-snug ${tone.detail}`}>
        氧气流量 ÷ 风口数；
      </div>
    </div>
  )
}

/** 熔炼渣 / 冰铜熔池高度结果卡 */
function EquipmentBathHeightResultCard({
  darkMode,
  slagHeightM,
  matteHeightM,
  ready,
  pendingArea,
}: {
  darkMode: boolean
  slagHeightM: number
  matteHeightM: number
  ready: boolean
  pendingArea: boolean
}) {
  const tone = equipmentResultTone(darkMode, false)
  const detail = pendingArea
    ? '请先完成水套余量处置'
    : ready
      ? '高度 = 产出量 ÷ (密度 × 面积)'
      : '请先完成产出计算'
  const formatHeight = (value: number) => (ready ? value.toFixed(4) : '—')
  return (
    <div className={`flex ${EQUIP_RESULT_MIN_H} min-w-0 w-full flex-col justify-center rounded-lg border-2 px-3 py-3 shadow-sm ${tone.shell}`}>
      <div className="mb-0.5 flex items-center justify-between gap-2">
        <div className={`text-xs font-semibold ${tone.title}`}>熔池高度</div>
        <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${tone.badge}`}>计算</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <div className={`${EQUIP_ITEM_LABEL} ${tone.sublabel}`}>熔炼渣</div>
          <div className={`font-mono text-lg font-semibold tracking-tight ${tone.value}`}>
            {formatHeight(slagHeightM)}
            {ready ? <span className={`ml-1 text-xs font-medium ${tone.unit}`}>m/h</span> : null}
          </div>
        </div>
        <div>
          <div className={`${EQUIP_ITEM_LABEL} ${tone.sublabel}`}>冰铜</div>
          <div className={`font-mono text-lg font-semibold tracking-tight ${tone.value}`}>
            {formatHeight(matteHeightM)}
            {ready ? <span className={`ml-1 text-xs font-medium ${tone.unit}`}>m/h</span> : null}
          </div>
        </div>
      </div>
      <div className={`mt-0.5 text-[11px] leading-snug ${tone.detail}`}>{detail}</div>
    </div>
  )
}

function EquipmentKeyParamsGrid({
  darkMode,
  title,
  items,
}: {
  darkMode: boolean
  title: string
  items: Array<{ label: string; value: string; unit?: string }>
}) {
  return (
    <div className={`mt-3 rounded-lg border p-3 ${darkMode ? 'border-gray-700 bg-gray-950/20' : 'border-slate-200 bg-white/80'}`}>
      <div className={`${EQUIP_BLOCK_TITLE} ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>{title}</div>
      <div className={`mt-2 grid gap-2 ${EQUIP_KEY_PARAM_COLS[Math.min(items.length, 6)] ?? EQUIP_KEY_PARAM_COLS[6]}`}>
        {items.map((item) => (
          <div
            key={`${item.label}-${item.unit ?? ''}`}
            className={`rounded-md border px-2 py-1.5 ${darkMode ? 'border-gray-700 bg-gray-900/50' : 'border-slate-200 bg-slate-50'}`}
          >
            <div className={`${EQUIP_ITEM_LABEL} ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>{item.label}</div>
            <div className={`mt-0.5 ${EQUIP_ITEM_VALUE} ${darkMode ? 'text-slate-100' : 'text-slate-900'}`}>
              {item.value}
              {item.unit ? (
                <span className={`${EQUIP_ITEM_UNIT} ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>{item.unit}</span>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function EquipmentKeyParamPairs({
  darkMode,
  title,
  pairs,
}: {
  darkMode: boolean
  title: string
  pairs: Array<{ title: string; unit: string; dry: number; water: number }>
}) {
  return (
    <div className={`mt-3 rounded-lg border p-3 ${darkMode ? 'border-gray-700 bg-gray-950/20' : 'border-slate-200 bg-white/80'}`}>
      <div className={`${EQUIP_BLOCK_TITLE} ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>{title}</div>
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
        {pairs.map((pair) => (
          <div
            key={pair.title}
            className={`rounded-md border px-2.5 py-2 ${darkMode ? 'border-gray-700 bg-gray-900/50' : 'border-slate-200 bg-slate-50'}`}
          >
            <div className={`mb-1.5 ${EQUIP_BLOCK_TITLE} ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>{pair.title}</div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className={`${EQUIP_ITEM_LABEL} ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>干基</div>
                <div className={`${EQUIP_ITEM_VALUE} ${darkMode ? 'text-slate-100' : 'text-slate-900'}`}>
                  {formatTableDisplayValue(pair.dry)}
                  <span className={`${EQUIP_ITEM_UNIT} ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>{pair.unit}</span>
                </div>
              </div>
              <div>
                <div className={`${EQUIP_ITEM_LABEL} ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>含水</div>
                <div className={`${EQUIP_ITEM_VALUE} ${darkMode ? 'text-slate-100' : 'text-slate-900'}`}>
                  {formatTableDisplayValue(pair.water)}
                  <span className={`${EQUIP_ITEM_UNIT} ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>{pair.unit}</span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function EquipmentGasDetailRows({
  darkMode,
  rows,
}: {
  darkMode: boolean
  rows: Array<{ id: string; name: string; dryTh: number; waterTh: number; volumeNm3h: number }>
}) {
  const rowGrid = 'grid grid-cols-[minmax(4.5rem,1.1fr)_repeat(3,minmax(0,1fr))] items-center gap-2'
  return (
    <div className={`mt-3 rounded-lg border p-3 ${darkMode ? 'border-gray-700 bg-gray-950/20' : 'border-slate-200 bg-white/80'}`}>
      <div className={`${EQUIP_BLOCK_TITLE} ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>气体明细</div>
      <div className={`${rowGrid} mt-2 px-2.5 ${EQUIP_ITEM_LABEL} ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
        <div>气体</div>
        <div className="text-right">干基 t/h</div>
        <div className="text-right">水分 t/h</div>
        <div className="text-right">标态体积 Nm³/h</div>
      </div>
      <div className="mt-1 space-y-1">
        {rows.map((row) => (
          <div
            key={row.id}
            className={`${rowGrid} rounded-md border px-2.5 py-1 ${
              darkMode ? 'border-gray-700 bg-gray-900/50' : 'border-slate-200 bg-slate-50'
            }`}
          >
            <div className={`${EQUIP_ITEM_LABEL} font-semibold ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>{row.name}</div>
            <div className={`text-right ${EQUIP_ITEM_VALUE} ${darkMode ? 'text-slate-100' : 'text-slate-900'}`}>
              {formatTableDisplayValue(row.dryTh)}
            </div>
            <div className={`text-right ${EQUIP_ITEM_VALUE} ${darkMode ? 'text-slate-100' : 'text-slate-900'}`}>
              {formatTableDisplayValue(row.waterTh)}
            </div>
            <div className={`text-right ${EQUIP_ITEM_VALUE} ${darkMode ? 'text-slate-100' : 'text-slate-900'}`}>
              {formatTableDisplayValue(row.volumeNm3h)}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

type JacketRemainderOption = { oneSide: number; total: number; lengthM: number; areaM2: number }

/** 水套余量左栏：余量只读 + 左右分段选择 */
function EquipmentJacketRemainderRow({
  darkMode,
  options,
  decision,
  onDecide,
}: {
  darkMode: boolean
  options: {
    remainderMm: number
    pitchMm: number
    baseOneSide: number
    trim: JacketRemainderOption
    extend: JacketRemainderOption
  }
  decision: JacketRemainderDecision | null
  onDecide: (next: JacketRemainderDecision) => void
}) {
  const segmentBtn = (target: JacketRemainderDecision, label: string) => (
    <button
      type="button"
      className={`flex-1 rounded-md px-2.5 py-1 font-medium ${
        decision === target
          ? darkMode
            ? 'bg-sky-800 text-sky-50'
            : 'bg-white text-sky-900 shadow-sm'
          : darkMode
            ? 'text-gray-300'
            : 'text-slate-600'
      }`}
      onClick={() => onDecide(target)}
    >
      {label}
    </button>
  )
  return (
    <div className={`rounded-lg border p-3 ${darkMode ? 'border-gray-700 bg-gray-950/30' : 'border-slate-200 bg-slate-50/90'}`}>
      <div className={`mb-2 ${EQUIP_BLOCK_TITLE} ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>水套余量</div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div>
          <label className={`mb-1 block text-xs font-medium ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>余量 mm</label>
          <input
            className={equipmentSystemDerivedInputClass(darkMode)}
            value={formatTableDisplayValue(options.remainderMm)}
            readOnly
          />
        </div>
        <div className="md:col-span-2">
          <label className={`mb-1 block text-xs font-medium ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>余量处置</label>
          <div
            className={`inline-flex w-full rounded-lg border p-0.5 text-xs ${darkMode ? 'border-gray-600 bg-gray-950/40' : 'border-slate-200 bg-slate-100'}`}
          >
            {segmentBtn('extend', '增加 1 个水套')}
            {segmentBtn('trim', '去掉余量')}
          </div>
          <div className="mt-1 grid grid-cols-2 gap-2 px-0.5">
            <div className={`text-xs leading-snug ${hintText(darkMode)}`}>
              单侧 {options.extend.oneSide} 个 · 炉长 {formatTableDisplayValue(options.extend.lengthM)} m
            </div>
            <div className={`text-xs leading-snug ${hintText(darkMode)}`}>
              单侧 {options.trim.oneSide} 个 · 炉长 {formatTableDisplayValue(options.trim.lengthM)} m
            </div>
          </div>
        </div>
      </div>
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
