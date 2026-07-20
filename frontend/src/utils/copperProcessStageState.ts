import type { SheetId } from '../types'
import type { OxySideBlowConstraintConfig } from './copperConstraintConfig.ts'
import type { OxyConstraintSolverResult } from './copperConstraintSolver.ts'
import type { CopperHeatBalanceResult } from './copperHeatBalance.ts'
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
  DEFAULT_COPPER_OXYGEN_AIR_SETTINGS,
  type CopperElementKey,
  type CopperMaterialColumn,
  type CopperSolventSolution,
} from './copperWorkflowCalc.ts'
import type { PhaseBatchResults } from './copperPhaseBatchCalc'
import type { CustomPhaseRow } from './copperPhaseTableCalc'
import type { MaterialPhaseAssistRow } from './copperPhaseAssist'

export type CopperProcessStageId = Extract<SheetId, 'cu_smelting' | 'cu_converting' | 'cu_refining'>

export const COPPER_PROCESS_STAGE_IDS: CopperProcessStageId[] = [
  'cu_smelting',
  'cu_refining',
  'cu_converting',
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
  manualAirWeightValid: boolean
  phaseCompleted: boolean
  productCalculated: boolean
  productFilledBack: boolean
  productSolverResult: OxyConstraintSolverResult | null
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
}

const DEFAULT_OXYGEN_AIR_O2_TEXT = String(DEFAULT_COPPER_OXYGEN_AIR_SETTINGS.oxygenPct)
const DEFAULT_OXYGEN_AIR_N2_TEXT = String(DEFAULT_COPPER_OXYGEN_AIR_SETTINGS.nitrogenPct)
const DEFAULT_OTHER_HEAT_MJH_TEXT = '500'

export function isCopperProcessStageSheet(sheet: SheetId): sheet is CopperProcessStageId {
  return COPPER_PROCESS_STAGE_IDS.includes(sheet as CopperProcessStageId)
}

export function processStageIdForSheet(sheet: SheetId): CopperProcessStageId | null {
  if (sheet === 'cu_smelting' || sheet === 'cu_smelting_equipment') return 'cu_smelting'
  if (sheet === 'cu_refining' || sheet === 'cu_refining_equipment') return 'cu_refining'
  if (sheet === 'cu_converting' || sheet === 'cu_converting_equipment') return 'cu_converting'
  return null
}

export function normalizeBatchTableView(value: unknown): BatchTableView {
  if (value === 'phase' || value === 'parameters' || value === 'productPhase') return value
  if (value === 'product') return 'productPhase'
  if (value === 'productElement') return 'productElement'
  if (value === 'balance') return 'balance'
  return 'element'
}

export function createBlankProcessStageState(): CopperProcessStageState {
  const defaultRawMaterials = createDefaultCopperMaterials()
  const defaultAirColumns = createProcessAirColumns()
  return {
    rawMaterials: defaultRawMaterials,
    rawWeightDrafts: Object.fromEntries(defaultRawMaterials.map((material) => [material.id, ''])),
    solventColumns: createDefaultSolventColumns(),
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
    manualAirWeightValid: false,
    phaseCompleted: false,
    productCalculated: false,
    productFilledBack: false,
    productSolverResult: null,
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
    coolingWaterOutletTemperature: '34',
    coolingWaterMassTh: '3000',
    otherHeatMJh: DEFAULT_OTHER_HEAT_MJH_TEXT,
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

export function isProcessStageComplete(state: CopperProcessStageState | null | undefined): boolean {
  return Boolean(state?.heatBalanced && state?.heatBalanceFilledBack && state?.calculatedHeatBalance)
}

export function hasProcessStageGeneratedData(state: CopperProcessStageState | null | undefined): boolean {
  if (!state) return false
  return (
    state.phaseCompleted ||
    state.productCalculated ||
    state.heatBalanced ||
    state.solventSolution?.valid === true
  )
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
    manualAirWeightValid: Boolean(record.manualAirWeightValid),
    phaseCompleted: Boolean(record.phaseCompleted),
    productCalculated: Boolean(record.productCalculated),
    productFilledBack: Boolean(record.productFilledBack ?? record.productCalculated),
    productSolverResult: (record.productSolverResult as OxyConstraintSolverResult | null | undefined) ?? null,
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
        resolved[stageId] = cloneProcessStageState(stored[stageId]!)
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
  }
}

export function serializePersistedCaseContent(content: CopperCaseSharedPersistedFields): string {
  return JSON.stringify(content)
}

export function isPersistedCaseContentDirty(
  current: CopperCaseSharedPersistedFields,
  saved: CopperCaseSharedPersistedFields
): boolean {
  return serializePersistedCaseContent(current) !== serializePersistedCaseContent(saved)
}
