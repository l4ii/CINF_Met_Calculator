import type { SheetId } from '../types'
import type { OxySideBlowConstraintConfig } from './copperConstraintConfig.ts'
import type { OxyConstraintSolverResult } from './copperConstraintSolver.ts'
import type { CopperChemicalHeatMode, CopperHeatBalanceResult } from './copperHeatBalance.ts'
import {
  DEFAULT_COPPER_PROCESS_PARAMETERS,
  type CopperProcessParameters,
} from './copperProcessParameters.ts'
import {
  DEFAULT_COPPER_FUEL,
  DEFAULT_COPPER_PRODUCT_MODEL,
  type CopperFuelMaterial,
  type CopperProductModel,
} from './copperProcessCalc'
import {
  createDefaultCopperMaterials,
  createDefaultSolventColumns,
  createProcessAirColumns,
  createSmeltingMaterialLibrary,
  DEFAULT_COPPER_OXYGEN_AIR_SETTINGS,
  type CopperElementKey,
  type CopperLibraryMaterial,
  type CopperMaterialColumn,
  type CopperSolventSolution,
} from './copperWorkflowCalc.ts'
import type { PhaseBatchResults } from './copperPhaseBatchCalc'
import type { CustomPhaseRow } from './copperPhaseTableCalc'
import type { MaterialPhaseAssistRow } from './copperPhaseAssist'

export type CopperProcessStageId = Extract<SheetId, 'cu_smelting' | 'cu_converting' | 'cu_refining'>

export const COPPER_PROCESS_STAGE_IDS: CopperProcessStageId[] = [
  'cu_smelting',
  'cu_converting',
  'cu_refining',
]

export type BatchTableView =
  | 'element'
  | 'phase'
  | 'parameters'
  | 'productPhase'
  | 'productElement'
  | 'balance'

export type PhasePreviewUnknowns = {
  materialId: string
  phaseContents: Record<string, number>
  values: Pick<Record<CopperElementKey, number>, 'O(氧)' | 'C (碳)' | 'Other(其他)'>
}

export type ProductDistributionDrafts = Partial<
  Record<CopperElementKey, Partial<Record<string, string>>>
>

export type CopperProcessStageState = {
  rawMaterials: CopperMaterialColumn[]
  rawWeightDrafts: Record<string, string>
  solventColumns: CopperMaterialColumn[]
  /** 本工序原料库（熔炼精矿 vs 吹炼白铜锍/残极 等彼此独立） */
  materialLibrary: CopperLibraryMaterial[]
  fuelColumn: CopperFuelMaterial
  airColumns: CopperMaterialColumn[]
  targetFeSiO2: string
  targetCaOSiO2: string
  processParameters: CopperProcessParameters
  processParametersConfirmed: boolean
  constraintEditorReached: boolean
  solventSolution: CopperSolventSolution | null
  phaseCompletedMaterials: Record<string, boolean>
  phasePreviewUnknowns: PhasePreviewUnknowns | null
  phaseBatchResults: PhaseBatchResults | null
  manualPhaseCells: Record<string, boolean>
  manualSolventWeights: Record<string, boolean>
  manualFuelWeightValid: boolean
  manualAirWeights?: Record<string, boolean>
  manualAirWeightValid: boolean
  phaseCompleted: boolean
  productCalculated: boolean
  productFilledBack: boolean
  productSolverResult: OxyConstraintSolverResult | null
  /** Flo 导入的 MetCal 产出结果（只读对照，不影响本软件求解） */
  metcalProductResult: OxyConstraintSolverResult | null
  heatBalanced: boolean
  calculatedHeatBalance: CopperHeatBalanceResult | null
  heatBalanceFilledBack: boolean
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
  coolingWaterInletTemperature: string
  coolingWaterOutletTemperature: string
  coolingWaterMassTh: string
  otherHeatMJh: string
  heatBalanceTolerancePct?: string
  /** 总表化学反应热：hess | reaction */
  chemicalHeatMode?: CopperChemicalHeatMode
  batchTableView: BatchTableView
  phaseRatioOverrides: Record<string, Record<string, string>>
  manualPhaseRatioColumns: Record<string, boolean>
  productDistributionDrafts: ProductDistributionDrafts
  productPhaseOverrides: Record<string, Record<string, string>>
  productPhaseManual: boolean
  productConstraintConfig: OxySideBlowConstraintConfig | null
  customPhaseRows: Record<string, CustomPhaseRow[]>
  materialPhaseRows: Record<string, MaterialPhaseAssistRow[]>
  phaseMaterialId: string | null
  phaseAssistTabMaterialIds: string[]
}

export type CopperCaseProcessStages = Partial<Record<CopperProcessStageId, CopperProcessStageState>>

export type CopperCaseSharedPersistedFields = {
  smeltMethodId?: string
  processStages: CopperCaseProcessStages
  annualHours: string
  equipmentIntensity: string
  targetScaleWanTpa: string
  equipmentAdjustments: Record<string, string>
  equipmentDimensionAdjustments?: Record<string, string>
  equipmentModelGenerated?: Record<string, boolean>
  equipmentBomGenerated?: Record<string, boolean>
  /** 侧吹熔炼设备选型：面积 / 设计参数 */
  smeltingDailyFeedTd?: string
  smeltingFeedMode?: 'daily' | 'annual'
  smeltingBedCapacity?: string
  smeltingFurnaceWidthM?: string
  smeltingFurnaceLengthM?: string
  smeltingDimensionDrive?: 'width' | 'length'
  smeltingJacketPitchMm?: string
  smeltingJacketCountTotal?: string
  smeltingOxygenNm3h?: string
  smeltingTuyereOxygenNm3h?: string
  smeltingTuyereCount?: string
  /** 熔炼渣密度 t/m³（熔池高度） */
  smeltingSlagDensityTm3?: string
  /** 冰铜密度 t/m³（熔池高度） */
  smeltingMatteDensityTm3?: string
  smeltingDailyFeedOverridden?: boolean
  smeltingOxygenOverridden?: boolean
  /** @deprecated 水套改为余量处置 */
  smeltingJacketCountOverridden?: boolean
  smeltingJacketRemainderDecision?: 'extend' | 'trim' | null
  smeltingTuyereCountOverridden?: boolean
  /** @deprecated 兼容旧案例 */
  smeltingAnnualFeedTa?: string
  smeltingProcessDays?: string
  smeltingJacketCountOneSide?: string
  smeltingAnnualFeedOverridden?: boolean
  /** 吹炼设备选型：与熔炼页面分别保存的面积、炉体、水套、风口及熔池参数。 */
  convertingDailyFeedTd?: string
  convertingFeedMode?: 'daily' | 'annual'
  convertingAnnualFeedTa?: string
  convertingProcessDays?: string
  convertingBedCapacity?: string
  convertingFurnaceWidthM?: string
  convertingFurnaceLengthM?: string
  convertingDimensionDrive?: 'width' | 'length'
  convertingJacketPitchMm?: string
  convertingJacketCountTotal?: string
  convertingJacketCountOneSide?: string
  convertingOxygenNm3h?: string
  convertingTuyereOxygenNm3h?: string
  convertingTuyereCount?: string
  convertingSlagDensityTm3?: string
  convertingCrudeCopperDensityTm3?: string
  convertingDailyFeedOverridden?: boolean
  convertingAnnualFeedOverridden?: boolean
  convertingOxygenOverridden?: boolean
  convertingJacketCountOverridden?: boolean
  convertingJacketRemainderDecision?: 'extend' | 'trim' | null
  convertingTuyereCountOverridden?: boolean
}

const DEFAULT_OXYGEN_AIR_O2_TEXT = String(DEFAULT_COPPER_OXYGEN_AIR_SETTINGS.oxygenPct)
const DEFAULT_OXYGEN_AIR_N2_TEXT = String(DEFAULT_COPPER_OXYGEN_AIR_SETTINGS.nitrogenPct)
const DEFAULT_OTHER_HEAT_MJH_TEXT = '500'

export function normalizeChemicalHeatMode(value: unknown): CopperChemicalHeatMode {
  return value === 'reaction' ? 'reaction' : 'hess'
}

export function isCopperProcessStageSheet(sheet: SheetId): sheet is CopperProcessStageId {
  return COPPER_PROCESS_STAGE_IDS.includes(sheet as CopperProcessStageId)
}

export function processStageIdForSheet(sheet: SheetId): CopperProcessStageId | null {
  if (sheet === 'cu_smelting' || sheet === 'cu_smelting_equipment') return 'cu_smelting'
  if (sheet === 'cu_converting' || sheet === 'cu_converting_equipment') return 'cu_converting'
  if (sheet === 'cu_refining' || sheet === 'cu_refining_equipment') return 'cu_refining'
  return null
}

export function normalizeBatchTableView(value: unknown): BatchTableView {
  if (value === 'phase' || value === 'parameters' || value === 'productPhase') return value
  if (value === 'product') return 'productPhase'
  if (value === 'productElement') return 'productElement'
  if (value === 'balance') return 'balance'
  return 'element'
}

/** 配料总表页签在流程中的先后（越大越靠后） */
function batchTableViewProgressRank(view: BatchTableView, stageId: CopperProcessStageId): number {
  if (stageId === 'cu_converting') {
    if (view === 'balance') return 2
    if (view === 'productPhase' || view === 'productElement' || view === 'parameters') return 1
    return 0
  }
  if (view === 'balance') return 4
  if (view === 'productPhase' || view === 'productElement') return 3
  if (view === 'parameters') return 2
  if (view === 'phase') return 1
  return 0
}

function normalizeStageLandingBatchTableView(
  view: BatchTableView,
  stageId: CopperProcessStageId
): BatchTableView {
  if (stageId !== 'cu_converting') return view
  // 吹炼无关键参数页；元素表为只读反推，早期落地到物相表
  if (view === 'parameters') return 'productPhase'
  if (view === 'element') return 'phase'
  return view
}

function isConvertingFeedReady(state: CopperProcessStageState): boolean {
  return (
    state.rawMaterials.some((material) => material.name.trim() && material.weight > 0) &&
    state.rawMaterials.every(
      (material) =>
        !material.name.trim() ||
        material.weight <= 0 ||
        Boolean(state.phaseCompletedMaterials[material.id] && state.phaseBatchResults?.[material.id]?.valid)
    )
  )
}

function isSmeltingPhaseReady(state: CopperProcessStageState): boolean {
  return state.rawMaterials.every(
    (material) =>
      !material.name.trim() ||
      material.weight <= 0 ||
      Boolean(state.phaseCompletedMaterials[material.id])
  )
}

/**
 * 按工序进度推断应打开的配料总表页签：第一个未完成步骤对应页（未完成也进这一页）；
 * 全部完成则落到热平衡。
 */
export function resolveProgressBatchTableView(
  state: CopperProcessStageState,
  stageId: CopperProcessStageId
): BatchTableView {
  const materials = state.rawMaterials
  const allSelected = materials.length > 0 && materials.every((material) => material.name.trim())

  if (stageId === 'cu_converting') {
    const flags = [
      allSelected,
      isConvertingFeedReady(state),
      state.constraintEditorReached,
      state.productFilledBack,
      state.heatBalanced,
    ]
    const firstIncomplete = flags.findIndex((value) => !value)
    const stepIndex = firstIncomplete === -1 ? flags.length - 1 : firstIncomplete
    if (stepIndex <= 1) return 'phase'
    if (stepIndex <= 3) return 'productPhase'
    return 'balance'
  }

  const allWeighed = materials.every((material) => material.name.trim() && material.weight > 0)
  const phaseReady = isSmeltingPhaseReady(state)
  const flags = [
    allSelected,
    allWeighed,
    phaseReady,
    state.processParametersConfirmed || phaseReady,
    state.constraintEditorReached,
    state.productFilledBack,
    state.heatBalanced,
  ]
  const firstIncomplete = flags.findIndex((value) => !value)
  const stepIndex = firstIncomplete === -1 ? flags.length - 1 : firstIncomplete
  if (stepIndex <= 1) return 'element'
  if (stepIndex === 2) return 'phase'
  if (stepIndex === 3) return 'parameters'
  if (stepIndex <= 5) return 'productPhase'
  return 'balance'
}

/**
 * 从工作区打开项目时的配料总表落地页：
 * 取「进度推断页」与「上次保存页」中更靠后的一个（未完成也进最后一页），再做工序特判。
 *
 * Flo/案例导入后常已带好物相，但保存页仍是元素表：此时应从元素表开始人工审核，
 * 不因「物相已就绪」直接跳到产出表。
 */
export function resolveResumeBatchTableView(
  state: CopperProcessStageState,
  stageId: CopperProcessStageId
): BatchTableView {
  if (
    stageId === 'cu_converting' &&
    !state.constraintEditorReached &&
    !state.productFilledBack &&
    !state.heatBalanced
  ) {
    return 'phase'
  }
  const saved = normalizeStageLandingBatchTableView(normalizeBatchTableView(state.batchTableView), stageId)
  if (
    stageId === 'cu_smelting' &&
    saved === 'element' &&
    !state.constraintEditorReached &&
    !state.productFilledBack &&
    !state.heatBalanced
  ) {
    return 'element'
  }
  const progress = normalizeStageLandingBatchTableView(resolveProgressBatchTableView(state, stageId), stageId)
  return batchTableViewProgressRank(saved, stageId) >= batchTableViewProgressRank(progress, stageId)
    ? saved
    : progress
}

export function createBlankProcessStageState(): CopperProcessStageState {
  const defaultRawMaterials = createDefaultCopperMaterials()
  const defaultAirColumns = createProcessAirColumns()
  return {
    rawMaterials: defaultRawMaterials,
    rawWeightDrafts: Object.fromEntries(defaultRawMaterials.map((material) => [material.id, ''])),
    solventColumns: createDefaultSolventColumns(),
    materialLibrary: createSmeltingMaterialLibrary(),
    fuelColumn: {
      ...DEFAULT_COPPER_FUEL,
      ratios: { ...DEFAULT_COPPER_FUEL.ratios },
    },
    airColumns: defaultAirColumns,
    targetFeSiO2: '2.8',
    targetCaOSiO2: '0.45',
    processParameters: { ...DEFAULT_COPPER_PROCESS_PARAMETERS },
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
    heatBalanceFilledBack: false,
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
    coolingWaterInletTemperature: '30',
    coolingWaterOutletTemperature: '38',
    coolingWaterMassTh: '3000',
    otherHeatMJh: DEFAULT_OTHER_HEAT_MJH_TEXT,
    chemicalHeatMode: 'hess',
    batchTableView: 'element',
    phaseRatioOverrides: {},
    manualPhaseRatioColumns: {},
    productDistributionDrafts: productModelToDrafts(DEFAULT_COPPER_PRODUCT_MODEL),
    productPhaseOverrides: {},
    productPhaseManual: false,
    productConstraintConfig: null,
    customPhaseRows: {},
    materialPhaseRows: {},
    phaseMaterialId: null,
    phaseAssistTabMaterialIds: [],
  }
}

function productModelToDrafts(model: Partial<CopperProductModel> = DEFAULT_COPPER_PRODUCT_MODEL): ProductDistributionDrafts {
  const drafts: ProductDistributionDrafts = {}
  for (const [element, distribution] of Object.entries(model)) {
    if (!distribution || typeof distribution !== 'object') continue
    drafts[element as CopperElementKey] = Object.fromEntries(
      Object.entries(distribution).map(([productKey, value]) => [productKey, String(value ?? '')])
    )
  }
  return drafts
}

export function cloneProcessStageState(state: CopperProcessStageState): CopperProcessStageState {
  return JSON.parse(JSON.stringify(state)) as CopperProcessStageState
}

export function isProcessStageProductReady(state: CopperProcessStageState | null | undefined): boolean {
  return Boolean(
    state?.productCalculated &&
      state?.productFilledBack &&
      state?.productSolverResult &&
      state.productSolverResult.acceptable
  )
}

export function isProcessStageHeatBalanceReady(state: CopperProcessStageState | null | undefined): boolean {
  return Boolean(state?.heatBalanced && state?.heatBalanceFilledBack && state?.calculatedHeatBalance)
}

/** 工序产出 + 热平衡均完成，才可进入该工序设备选型 */
export function isProcessStageComplete(state: CopperProcessStageState | null | undefined): boolean {
  return isProcessStageProductReady(state) && isProcessStageHeatBalanceReady(state)
}

export function hasProcessStageGeneratedData(state: CopperProcessStageState | null | undefined): boolean {
  if (!state) return false
  return (
    state.phaseCompleted ||
    state.productCalculated ||
    state.heatBalanced ||
    Boolean(state.productSolverResult) ||
    Boolean(state.calculatedHeatBalance) ||
    state.solventSolution?.valid === true
  )
}

export type CopperEquipmentStageKey = 'smelting' | 'converting' | 'refining'

export function isEquipmentBomGenerated(
  bomGenerated: Partial<Record<CopperEquipmentStageKey, boolean>> | null | undefined,
  stage: CopperEquipmentStageKey
): boolean {
  return Boolean(bomGenerated?.[stage])
}

/**
 * 富氧侧吹跨页签硬门禁：前置步骤全部有结果才可进入目标页。
 * 返回 null 表示可进入；否则为阻断原因文案。
 */
export function copperStageUnlockBlockReason(params: {
  targetSheet: SheetId
  getProcessState: (stageId: CopperProcessStageId) => CopperProcessStageState | null | undefined
  equipmentBomGenerated?: Partial<Record<CopperEquipmentStageKey, boolean>> | null
}): string | null {
  const target = params.targetSheet
  if (target === 'raw_material' || target === 'cu_smelting') return null

  const smelting = params.getProcessState('cu_smelting')
  const converting = params.getProcessState('cu_converting')
  const bom = params.equipmentBomGenerated

  if (target === 'cu_smelting_equipment') {
    if (!isProcessStageProductReady(smelting)) {
      return '请先完成熔炼产出计算并回填结果，再进入熔炼设备选型。'
    }
    if (!isProcessStageHeatBalanceReady(smelting)) {
      return '请先完成熔炼热平衡计算，再进入熔炼设备选型。'
    }
    return null
  }

  if (target === 'cu_converting') {
    if (hasProcessStageGeneratedData(converting)) {
      return null
    }
    if (!isProcessStageComplete(smelting)) {
      return '请先完成熔炼产出与热平衡，再进入吹炼。'
    }
    if (!isEquipmentBomGenerated(bom, 'smelting')) {
      return '请先在熔炼设备选型中生成 BOM 清单，再进入吹炼。'
    }
    return null
  }

  if (target === 'cu_converting_equipment') {
    if (!isProcessStageProductReady(converting)) {
      return '请先完成吹炼产出计算并回填结果，再进入吹炼设备选型。'
    }
    if (!isProcessStageHeatBalanceReady(converting)) {
      return '请先完成吹炼热平衡计算，再进入吹炼设备选型。'
    }
    return null
  }

  if (target === 'cu_refining' || target === 'cu_refining_equipment') {
    if (!isEquipmentBomGenerated(bom, 'converting')) {
      return '请先在吹炼设备选型中生成 BOM 清单后，再进入精炼相关步骤。'
    }
    return null
  }

  if (target === 'cu_summary' || target === 'cu_equipment') {
    if (!isEquipmentBomGenerated(bom, 'converting')) {
      return '请先完成吹炼设备选型并生成 BOM 清单，再进入案例汇总。'
    }
    return null
  }

  return null
}

/** 从旧版扁平案例记录提取单工序状态（用于迁移） */
export function extractLegacyFlatProcessStageState(record: Record<string, unknown>): CopperProcessStageState {
  const blank = createBlankProcessStageState()
  const rawMaterials = Array.isArray(record.rawMaterials) ? (record.rawMaterials as CopperMaterialColumn[]) : blank.rawMaterials
  const airColumns = Array.isArray(record.airColumns)
    ? (record.airColumns as CopperMaterialColumn[])
    : blank.airColumns
  return {
    ...blank,
    rawMaterials,
    rawWeightDrafts: (record.rawWeightDrafts as Record<string, string> | undefined) ?? blank.rawWeightDrafts,
    solventColumns: Array.isArray(record.solventColumns)
      ? (record.solventColumns as CopperMaterialColumn[])
      : blank.solventColumns,
    materialLibrary: Array.isArray(record.materialLibrary)
      ? (record.materialLibrary as CopperLibraryMaterial[])
      : blank.materialLibrary,
    fuelColumn: (record.fuelColumn as CopperFuelMaterial | undefined) ?? blank.fuelColumn,
    airColumns,
    targetFeSiO2: typeof record.targetFeSiO2 === 'string' ? record.targetFeSiO2 : blank.targetFeSiO2,
    targetCaOSiO2: typeof record.targetCaOSiO2 === 'string' ? record.targetCaOSiO2 : blank.targetCaOSiO2,
    processParameters: (record.processParameters as CopperProcessParameters | undefined) ?? blank.processParameters,
    processParametersConfirmed: Boolean(record.processParametersConfirmed),
    constraintEditorReached: Boolean(record.constraintEditorReached),
    solventSolution: (record.solventSolution as CopperSolventSolution | null | undefined) ?? null,
    phaseCompletedMaterials: (record.phaseCompletedMaterials as Record<string, boolean> | undefined) ?? {},
    phasePreviewUnknowns: (record.phasePreviewUnknowns as PhasePreviewUnknowns | null | undefined) ?? null,
    phaseBatchResults: (record.phaseBatchResults as PhaseBatchResults | null | undefined) ?? null,
    manualPhaseCells: (record.manualPhaseCells as Record<string, boolean> | undefined) ?? {},
    manualSolventWeights: (record.manualSolventWeights as Record<string, boolean> | undefined) ?? {},
    manualFuelWeightValid: Boolean(record.manualFuelWeightValid),
    manualAirWeights: (record.manualAirWeights as Record<string, boolean> | undefined) ?? {},
    manualAirWeightValid: Boolean(record.manualAirWeightValid),
    phaseCompleted: Boolean(record.phaseCompleted),
    productCalculated: Boolean(record.productCalculated),
    productFilledBack: Boolean(record.productFilledBack ?? record.productCalculated),
    productSolverResult: (record.productSolverResult as OxyConstraintSolverResult | null | undefined) ?? null,
    metcalProductResult: (record.metcalProductResult as OxyConstraintSolverResult | null | undefined) ?? null,
    heatBalanced: Boolean(record.heatBalanced),
    calculatedHeatBalance: (record.calculatedHeatBalance as CopperHeatBalanceResult | null | undefined) ?? null,
    heatBalanceFilledBack: Boolean(record.heatBalanceFilledBack),
    fuelLhv: typeof record.fuelLhv === 'string' ? record.fuelLhv : blank.fuelLhv,
    fuelEfficiency: typeof record.fuelEfficiency === 'string' ? record.fuelEfficiency : blank.fuelEfficiency,
    oxygenAirO2Pct: typeof record.oxygenAirO2Pct === 'string' ? record.oxygenAirO2Pct : blank.oxygenAirO2Pct,
    oxygenAirN2Pct: typeof record.oxygenAirN2Pct === 'string' ? record.oxygenAirN2Pct : blank.oxygenAirN2Pct,
    oxygenSupplyCoefficient:
      typeof record.oxygenSupplyCoefficient === 'string' ? record.oxygenSupplyCoefficient : blank.oxygenSupplyCoefficient,
    feedTemperature: typeof record.feedTemperature === 'string' ? record.feedTemperature : blank.feedTemperature,
    matteTemperature: typeof record.matteTemperature === 'string' ? record.matteTemperature : blank.matteTemperature,
    slagTemperature: typeof record.slagTemperature === 'string' ? record.slagTemperature : blank.slagTemperature,
    gasTemperature: typeof record.gasTemperature === 'string' ? record.gasTemperature : blank.gasTemperature,
    dustTemperature: typeof record.dustTemperature === 'string' ? record.dustTemperature : blank.dustTemperature,
    lossTemperature: typeof record.lossTemperature === 'string' ? record.lossTemperature : blank.lossTemperature,
    coolingWaterInletTemperature:
      typeof record.coolingWaterInletTemperature === 'string'
        ? record.coolingWaterInletTemperature
        : blank.coolingWaterInletTemperature,
    coolingWaterOutletTemperature:
      typeof record.coolingWaterOutletTemperature === 'string'
        ? record.coolingWaterOutletTemperature
        : blank.coolingWaterOutletTemperature,
    coolingWaterMassTh: typeof record.coolingWaterMassTh === 'string' ? record.coolingWaterMassTh : blank.coolingWaterMassTh,
    otherHeatMJh: typeof record.otherHeatMJh === 'string' ? record.otherHeatMJh : blank.otherHeatMJh,
    chemicalHeatMode: normalizeChemicalHeatMode(record.chemicalHeatMode),
    batchTableView: normalizeBatchTableView(record.batchTableView),
    phaseRatioOverrides: (record.phaseRatioOverrides as Record<string, Record<string, string>> | undefined) ?? {},
    manualPhaseRatioColumns: (record.manualPhaseRatioColumns as Record<string, boolean> | undefined) ?? {},
    productDistributionDrafts:
      (record.productDistributionDrafts as ProductDistributionDrafts | undefined) ?? blank.productDistributionDrafts,
    productPhaseOverrides: (record.productPhaseOverrides as Record<string, Record<string, string>> | undefined) ?? {},
    productPhaseManual: Boolean(record.productPhaseManual),
    productConstraintConfig: (record.productConstraintConfig as OxySideBlowConstraintConfig | null | undefined) ?? null,
    customPhaseRows: (record.customPhaseRows as Record<string, CustomPhaseRow[]> | undefined) ?? {},
    materialPhaseRows: (record.materialPhaseRows as Record<string, MaterialPhaseAssistRow[]> | undefined) ?? {},
    phaseMaterialId: typeof record.phaseMaterialId === 'string' ? record.phaseMaterialId : null,
    phaseAssistTabMaterialIds: Array.isArray(record.phaseAssistTabMaterialIds)
      ? (record.phaseAssistTabMaterialIds as string[])
      : [],
  }
}

export function resolveCaseProcessStages(
  record: { processStages?: CopperCaseProcessStages; rawMaterials?: unknown } | null | undefined
): CopperCaseProcessStages {
  const stored = record?.processStages
  if (stored && Object.keys(stored).length > 0) {
    const resolved: CopperCaseProcessStages = {}
    for (const stageId of COPPER_PROCESS_STAGE_IDS) {
      if (stored[stageId]) {
        const cloned = cloneProcessStageState(stored[stageId]!)
        if (!Array.isArray(cloned.materialLibrary) || cloned.materialLibrary.length === 0) {
          cloned.materialLibrary =
            stageId === 'cu_smelting' ? createSmeltingMaterialLibrary() : []
        }
        resolved[stageId] = cloned
      }
    }
    return resolved
  }
  if (record && Array.isArray(record.rawMaterials)) {
    return { cu_smelting: extractLegacyFlatProcessStageState(record as Record<string, unknown>) }
  }
  return { cu_smelting: createBlankProcessStageState() }
}

export function buildPersistedCaseContent(record: {
  smeltMethodId?: string
  processStages?: CopperCaseProcessStages
  rawMaterials?: unknown
  annualHours?: string
  equipmentIntensity?: string
  targetScaleWanTpa?: string
  equipmentAdjustments?: Record<string, string>
  equipmentDimensionAdjustments?: Record<string, string>
  equipmentModelGenerated?: Record<string, boolean>
  equipmentBomGenerated?: Record<string, boolean>
  smeltingDailyFeedTd?: string
  smeltingFeedMode?: 'daily' | 'annual'
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
  smeltingOxygenOverridden?: boolean
  smeltingJacketCountOverridden?: boolean
  smeltingJacketRemainderDecision?: 'extend' | 'trim' | null
  smeltingTuyereCountOverridden?: boolean
  smeltingAnnualFeedTa?: string
  smeltingProcessDays?: string
  smeltingJacketCountOneSide?: string
  smeltingAnnualFeedOverridden?: boolean
}): CopperCaseSharedPersistedFields {
  const processStages = resolveCaseProcessStages(record)
  return {
    smeltMethodId: record.smeltMethodId,
    processStages,
    annualHours: record.annualHours ?? '7200',
    equipmentIntensity: record.equipmentIntensity ?? '32',
    targetScaleWanTpa: record.targetScaleWanTpa ?? '10',
    equipmentAdjustments: record.equipmentAdjustments ?? {
      smelting: '1',
      converting: '1',
      refining: '1',
    },
    equipmentDimensionAdjustments: record.equipmentDimensionAdjustments,
    equipmentModelGenerated: record.equipmentModelGenerated,
    equipmentBomGenerated: record.equipmentBomGenerated,
    smeltingDailyFeedTd: record.smeltingDailyFeedTd,
    smeltingFeedMode: record.smeltingFeedMode === 'annual' ? 'annual' : 'daily',
    smeltingAnnualFeedTa: record.smeltingAnnualFeedTa,
    smeltingProcessDays: record.smeltingProcessDays,
    smeltingBedCapacity: record.smeltingBedCapacity,
    smeltingFurnaceWidthM: record.smeltingFurnaceWidthM,
    smeltingFurnaceLengthM: record.smeltingFurnaceLengthM,
    smeltingDimensionDrive: record.smeltingDimensionDrive,
    smeltingJacketPitchMm: record.smeltingJacketPitchMm,
    smeltingJacketCountTotal: record.smeltingJacketCountTotal,
    smeltingOxygenNm3h: record.smeltingOxygenNm3h,
    smeltingTuyereOxygenNm3h: record.smeltingTuyereOxygenNm3h,
    smeltingTuyereCount: record.smeltingTuyereCount,
    smeltingSlagDensityTm3: record.smeltingSlagDensityTm3,
    smeltingMatteDensityTm3: record.smeltingMatteDensityTm3,
    smeltingDailyFeedOverridden: record.smeltingDailyFeedOverridden,
    smeltingOxygenOverridden: record.smeltingOxygenOverridden,
    smeltingJacketRemainderDecision:
      record.smeltingJacketRemainderDecision === 'extend' || record.smeltingJacketRemainderDecision === 'trim'
        ? record.smeltingJacketRemainderDecision
        : null,
    smeltingTuyereCountOverridden: record.smeltingTuyereCountOverridden,
    smeltingJacketCountOneSide: record.smeltingJacketCountOneSide,
    smeltingAnnualFeedOverridden: record.smeltingAnnualFeedOverridden,
  }
}

export function serializePersistedCaseContent(content: CopperCaseSharedPersistedFields): string {
  return JSON.stringify(content)
}

/**
 * 脏检查忽略：页签/辅助 UI 态，以及未覆盖时的设备自动显示值。
 * 避免「只翻了配料总表页签 / 未改参数」也被当成未保存修改。
 */
export function normalizePersistedContentForDirtyCheck(
  content: CopperCaseSharedPersistedFields
): CopperCaseSharedPersistedFields {
  const processStages: CopperCaseProcessStages = {}
  for (const stageId of COPPER_PROCESS_STAGE_IDS) {
    const stage = content.processStages[stageId]
    if (!stage) continue
    processStages[stageId] = {
      ...stage,
      batchTableView: 'element',
      phaseMaterialId: null,
      phaseAssistTabMaterialIds: [],
    }
  }
  return {
    ...content,
    processStages,
    smeltingDailyFeedTd: content.smeltingDailyFeedOverridden ? content.smeltingDailyFeedTd : '',
    smeltingOxygenNm3h: content.smeltingOxygenOverridden ? content.smeltingOxygenNm3h : '',
    smeltingJacketCountTotal: '',
    smeltingJacketCountOneSide: '',
    smeltingJacketRemainderDecision: content.smeltingJacketRemainderDecision ?? null,
    smeltingTuyereCount: content.smeltingTuyereCountOverridden ? content.smeltingTuyereCount : '',
    smeltingFurnaceLengthM: content.smeltingDimensionDrive === 'length' ? content.smeltingFurnaceLengthM : '',
    smeltingFurnaceWidthM: content.smeltingDimensionDrive === 'width' ? content.smeltingFurnaceWidthM : content.smeltingFurnaceWidthM,
  }
}

export function isPersistedCaseContentDirty(
  current: CopperCaseSharedPersistedFields,
  saved: CopperCaseSharedPersistedFields
): boolean {
  return (
    serializePersistedCaseContent(normalizePersistedContentForDirtyCheck(current)) !==
    serializePersistedCaseContent(normalizePersistedContentForDirtyCheck(saved))
  )
}
