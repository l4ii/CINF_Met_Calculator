import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
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
  formatProductSharePercent,
} from '../../utils/copperBatchTableLayout'
import { OXY_SIDE_BLOW_PRODUCT_KEYS } from '../../utils/copperConstraintConfig.ts'
import { CopperBatchTableColGroup } from './CopperBatchTableColGroup'
import {
  CopperBatchElementTable,
  type SolveInputStatus,
  type SolventCatalogOption,
} from './CopperBatchElementTable'
import { CopperBatchPhaseTables, type PhaseTableColumn } from './CopperBatchPhaseTables'
import { BatchTableNumericReadonly } from './BatchTableNumericCell'
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
  sortCopperPhaseKeys,
  sortMaterialPhaseRows,
} from '../../utils/copperDisplayOrder'
import {
  buildBlendPhaseContentsByKey,
  collectMaterialPhaseTableKeys,
  createConcentrateMaterialPhaseRows,
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
  getPhaseTableColumnKeys,
  phaseTableHeaderLabel,
} from '../../utils/copperElementDisplay.ts'
import {
  buildBlendPhaseFromMaterialResults,
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
  calculateCopperHeatBalance,
  calculateCopperProducts,
  normalizeCopperProductModel,
  type CopperFuelMaterial,
  type CopperProductKey,
  type CopperProductModel,
  type CopperProductResult,
} from '../../utils/copperProcessCalc'
import { solveOxySideBlowProducts, type OxyConstraintSolverResult } from '../../utils/copperConstraintSolver.ts'
import {
  oxyProductPhasePercentMaps,
  oxyProductTableColumns,
  oxySolverToCopperProductResult,
} from '../../utils/copperOxyProductBridge.ts'
import { CopperHeatBalancePlaceholderTables } from './CopperHeatBalancePlaceholderTables.tsx'
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
type BatchTableView = 'element' | 'phase' | 'product' | 'balance'
type CopperProcessStageId = Extract<SheetId, 'cu_smelting' | 'cu_converting' | 'cu_refining'>

const COPPER_CASES_STORAGE_KEY = 'metcal.copper.cases.v1'
const METCAL_COPPER_CASE_FILE_TYPE = 'metcal-copper-case'

function normalizeBatchTableView(value: unknown, productFilledBack = false): BatchTableView {
  if (value === 'phase' || value === 'product') return value
  if (value === 'balance') return productFilledBack ? 'balance' : 'product'
  return 'element'
}

type CopperSmeltMethodId = 'oxy-side-blast' | 'flash'

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
  phaseCompleted: boolean
  productCalculated: boolean
  productFilledBack?: boolean
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
  productDistributionDrafts?: ProductDistributionDrafts
  productPhaseOverrides?: Record<string, Record<string, string>>
  productPhaseManual?: boolean
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

function formatPhaseCell(value: number | null, digits = 4) {
  return value == null ? '—' : format(value, digits)
}

function massThToWeightPercent(massTh: number, feedRateTh: number) {
  if (!Number.isFinite(feedRateTh) || feedRateTh <= 0) return massTh
  return (massTh / feedRateTh) * 100
}

function phaseMassTooltip(massTh: number | null | undefined) {
  if (massTh == null || !Number.isFinite(massTh)) return undefined
  return `质量 ${format(massTh)} t/h`
}

function PhaseAssistPercentCell({
  darkMode,
  percent,
  massTh,
  feedRateTh,
}: {
  darkMode: boolean
  percent: number | null
  massTh?: number | null
  feedRateTh: number
}) {
  if (percent == null || !Number.isFinite(percent)) return <>—</>
  const resolvedMass =
    massTh != null && Number.isFinite(massTh)
      ? massTh
      : feedRateTh > 0
        ? (percent / 100) * feedRateTh
        : null
  const massHelp = feedRateTh > 0 ? phaseMassTooltip(resolvedMass) : undefined
  const fullText = formatPhaseCell(percent)
  return (
    <BatchTableNumericReadonly
      darkMode={darkMode}
      value={fullText}
      helpTitle={massHelp}
      className="inline text-sm"
    />
  )
}

function BatchAddSolventControl({
  darkMode,
  availableSolvents,
  onAddSolvent,
}: {
  darkMode: boolean
  availableSolvents: SolventCatalogOption[]
  onAddSolvent: (catalogId: string) => void
}) {
  if (availableSolvents.length === 0) {
    return (
      <button type="button" className={`${btnSecondary(darkMode)} text-sm opacity-50`} disabled>
        + 添加熔剂
      </button>
    )
  }
  const next = availableSolvents[0]!
  return (
    <button type="button" className={`${btnSecondary(darkMode)} text-sm`} onClick={() => onAddSolvent(next.catalogId)}>
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
  materialPhaseRows: Record<string, MaterialPhaseAssistRow[]>
  phaseBatchResults: PhaseBatchResults | null
  phaseCompletedMaterials: Record<string, boolean>
  productCalculated: boolean
  productTableColumns: CopperProductTableColumn[]
  productPhaseComposition: Partial<Record<CopperProductKey | 'loss', ProductPhasePercentMap>>
  airColumns: CopperMaterialColumn[]
}) {
  const hasNamedRaw = params.rawMaterials.some((material) => material.name.trim())
  if (!hasNamedRaw) return [...COPPER_PLACEHOLDER_PHASE_ROW_KEYS]

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

  if (params.airColumns.some((column) => phaseValueVisible(column.ratios['O(氧)'] ?? 0))) keys.add('O2')
  if (params.airColumns.some((column) => phaseValueVisible(column.ratios['N(氮)'] ?? 0))) keys.add('N2')

  if (params.productCalculated) {
    for (const product of params.productTableColumns) {
      if (product.key === 'total') continue
      const productKey = product.key as CopperProductKey | 'loss'
      addVisiblePhaseMapKeys(keys, params.productPhaseComposition[productKey] ?? null)
    }
  }

  keys.delete('Other')
  const sorted = sortCopperPhaseKeys(keys)
  const hasOther = Boolean(
    hasComputedResults
      ? params.rawMaterials.some((material) => {
          const result = params.phaseBatchResults?.[material.id]
          if (!params.phaseCompletedMaterials[material.id] || !result?.valid) return false
          const mapped = mapPhaseContentsToTableKeys(
            result.phaseContents,
            ensureMaterialPhaseRows(params.materialPhaseRows[material.id])
          )
          return phaseValueVisible(mapped.Other)
        })
      : true
  )
  if (hasOther) sorted.push('Other')
  return sorted.length > 0 ? sorted : [...COPPER_PLACEHOLDER_PHASE_ROW_KEYS]
}

function phaseTableColumnPhaseValue(column: PhaseTableColumn, key: string): number | null {
  if (column.kind === 'oxygen') {
    if (key === 'O2') return column.oxygenAir?.weightPct.O2 ?? 0
    if (key === 'N2') return column.oxygenAir?.weightPct.N2 ?? 0
    return null
  }
  if (column.kind === 'product') {
    return column.productPhases?.[key] ?? null
  }
  if (column.phaseReady === false) return null
  if (key === 'O2') return column.kind === 'blend' ? column.oxygenAir?.weightPct.O2 ?? 0 : null
  if (key === 'N2') return column.kind === 'blend' ? column.oxygenAir?.weightPct.N2 ?? 0 : null
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
    return (column.oxygenAir?.weightPct.O2 ?? 0) + (column.oxygenAir?.weightPct.N2 ?? 0)
  }
  if (column.kind === 'product') {
    return Object.values(column.productPhases ?? {}).reduce<number>(
      (sum, value) => sum + (value ?? 0),
      0,
    )
  }
  const phaseTotal = column.phaseContentsByKey
    ? Object.values(column.phaseContentsByKey).reduce((sum, value) => sum + (value ?? 0), 0)
    : INPUT_PHASE_ROW_KEYS.reduce((sum, key) => sum + (column.phases?.[key] ?? 0), 0)
  if (column.kind !== 'blend') return phaseTotal
  return phaseTotal + (column.oxygenAir?.weightPct.O2 ?? 0) + (column.oxygenAir?.weightPct.N2 ?? 0)
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
  if (material.id !== DEFAULT_COPPER_FUEL.id || material.name !== DEFAULT_COPPER_FUEL.name) return material
  const ratios = material.ratios
  const legacyFuel =
    nearlyEqual(ratios['C (碳)'], 68) &&
    nearlyEqual(ratios['O(氧)'], 16) &&
    nearlyEqual(ratios['N(氮)'], 2) &&
    nearlyEqual(ratios['S (硫)'], 0.8) &&
    nearlyEqual(ratios['Other(其他)'], 13.2)
  const convertedFuel =
    nearlyEqual(ratios['FeO(氧化亚铁)'], 0) &&
    nearlyEqual(ratios['Fe(铁)'], 0.731, 0.02) &&
    nearlyEqual(ratios['S (硫)'], 0.86) &&
    nearlyEqual(ratios['SiO₂(二氧化硅)'], 4) &&
    nearlyEqual(ratios['CaO(氧化钙)'], 0.59) &&
    nearlyEqual(ratios['MgO(氧化镁)'], 0.74) &&
    nearlyEqual(ratios['C (碳)'], 60.73) &&
    nearlyEqual(ratios['H(氢)'], 1.45) &&
    nearlyEqual(ratios['O(氧)'], 2.8)
  if (!legacyFuel && !convertedFuel) return material
  return { ...material, ratios: { ...DEFAULT_COPPER_FUEL.ratios }, unitPrice: DEFAULT_COPPER_FUEL.unitPrice }
}

const DEFAULT_OXYGEN_AIR_O2_TEXT = String(DEFAULT_COPPER_OXYGEN_AIR_SETTINGS.oxygenPct)
const DEFAULT_OXYGEN_AIR_N2_TEXT = String(DEFAULT_COPPER_OXYGEN_AIR_SETTINGS.nitrogenPct)

function isLegacyDefaultOxygenAirText(oxygenText?: string, nitrogenText?: string): boolean {
  const oxygen = toNumber(oxygenText, Number.NaN)
  const nitrogen = toNumber(nitrogenText, Number.NaN)
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
  return normalizeBuiltInFuelMaterial(migrateMaterialWaterWeight({
    ...material,
    ratios: { ...material.ratios },
  }) as CopperFuelMaterial)
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
    phaseCompleted: candidate.phaseCompleted ?? false,
    productCalculated: candidate.productCalculated ?? false,
    productFilledBack: candidate.productFilledBack ?? candidate.productCalculated ?? false,
    heatBalanced: candidate.heatBalanced ?? false,
    fuelLhv: candidate.fuelLhv ?? String(DEFAULT_COPPER_FUEL.lowerHeatingValueMJkg),
    fuelEfficiency: candidate.fuelEfficiency ?? String(DEFAULT_COPPER_FUEL.combustionEfficiency),
    oxygenAirO2Pct: normalizeOxygenAirText(candidate.oxygenAirO2Pct, candidate.oxygenAirN2Pct).oxygen,
    oxygenAirN2Pct: normalizeOxygenAirText(candidate.oxygenAirO2Pct, candidate.oxygenAirN2Pct).nitrogen,
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
    batchTableView: normalizeBatchTableView(
      candidate.batchTableView,
      candidate.productFilledBack ?? candidate.productCalculated ?? false
    ),
    phaseRatioOverrides: candidate.phaseRatioOverrides ?? {},
    manualPhaseRatioColumns: candidate.manualPhaseRatioColumns ?? {},
    productDistributionDrafts: cloneProductDistributionDrafts(candidate.productDistributionDrafts),
    productPhaseOverrides: candidate.productPhaseOverrides ?? {},
    productPhaseManual: candidate.productPhaseManual ?? false,
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
  const [productCalculationEngaged, setProductCalculationEngaged] = useState(false)
  const [showHeatBalanceAssist, setShowHeatBalanceAssist] = useState(false)
  const [heatBalanceEngaged, setHeatBalanceEngaged] = useState(false)

  const [phaseElementView, setPhaseElementView] = useState<'compound' | 'element'>('compound')
  const [productCalculated, setProductCalculated] = useState(false)
  const [productFilledBack, setProductFilledBack] = useState(false)
  const [oxySolverResult, setOxySolverResult] = useState<OxyConstraintSolverResult | null>(null)
  const resetProductCalculation = useCallback(() => {
    setProductCalculated(false)
    setProductFilledBack(false)
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
  const [matteTemperature, setMatteTemperature] = useState('1180')
  const [slagTemperature, setSlagTemperature] = useState('1250')
  const [gasTemperature, setGasTemperature] = useState('1150')
  const [dustTemperature, setDustTemperature] = useState('450')
  const [heatLossMJh, setHeatLossMJh] = useState('1500')
  const [otherHeatMJh, setOtherHeatMJh] = useState('0')
  const [heatBalanced, setHeatBalanced] = useState(false)
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
  useEffect(() => {
    if (batchTableView === 'balance' && !productFilledBack) setBatchTableView('product')
  }, [batchTableView, productFilledBack])
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
  const furnaceFeedWithoutFuel = useMemo(
    () => calculateWeightedComposition([...rawMaterials, ...solventColumns, ...airColumns]),
    [airColumns, rawMaterials, solventColumns]
  )
  const furnaceFeed = useMemo(
    () => calculateWeightedComposition([...rawMaterials, ...solventColumns, fuelColumn, ...airColumns]),
    [rawMaterials, solventColumns, fuelColumn, airColumns]
  )
  const hasProductResult = productCalculated && Boolean(oxySolverResult)
  useEffect(() => {
    if (batchTableView === 'product') {
      if (!hasProductResult) {
        window.requestAnimationFrame(() => {
          productCalculationRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        })
      }
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
  const heatProductResult = useMemo(() => calculateCopperProducts(furnaceFeedWithoutFuel, productModel), [furnaceFeedWithoutFuel, productModel])
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
  ) => ratioDrafts[ratioDraftKey(kind, id, element)] ?? format(value ?? 0)

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
  const fuelHeatMJt = Math.max(
    0,
    toNumber(fuelLhv, DEFAULT_COPPER_FUEL.lowerHeatingValueMJkg) *
      1000 *
      toNumber(fuelEfficiency, DEFAULT_COPPER_FUEL.combustionEfficiency)
  )
  const constraintProductTableColumns = useMemo(() => {
    if (!oxySolverResult?.valid || !productFilledBack) return null
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
    if (oxySolverResult?.valid && productFilledBack) {
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
        materialPhaseRows,
        phaseBatchResults,
        phaseCompletedMaterials,
        productCalculated: productFilledBack,
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
      rawMaterials,
    ]
  )
  const inputPhaseColumnData = useMemo(() => {
    const blendSolidPhaseKeys = phaseTableRowKeys.filter((key) => key !== 'O2' && key !== 'N2')
    const buildColumn = (
      id: string,
      kind: PhaseTableColumn['kind'],
      header: string,
      subHeader: string,
      weight: number,
      ratios: CopperRatios,
      options: { moisture?: number; waterWeight?: number; materialRows?: MaterialPhaseAssistRow[] } = {}
    ): PhaseTableColumn => {
      const { moisture = 0, waterWeight = 0, materialRows = [] } = options
      const manual = manualPhaseRatioColumns[id] === true
      const overrides = manual ? storedPhaseOverridesToMap(phaseRatioOverrides[id]) : null
      const rowKeys = materialRows.length > 0 ? materialPhaseRowTableKeys(materialRows) : undefined
      const batchResult = kind === 'raw' ? phaseBatchResults?.[id] : undefined
      const phaseReady =
        kind !== 'raw' || manual || Boolean(phaseCompletedMaterials[id] && batchResult?.valid)
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
    const solventCols = solventColumns.map((material, index) =>
      buildColumn(
        material.id,
        'solvent',
        `熔剂${index + 1}`,
        displaySolventName(material.name),
        material.weight,
        material.ratios,
        {
          moisture: material.moisture ?? 0,
          waterWeight: materialWaterWeight(material),
        }
      )
    )
    const fuelCol = buildColumn(
      fuelColumn.id,
      'fuel',
      '燃料煤',
      fuelColumn.name,
      fuelColumn.weight,
      fuelColumn.ratios,
      {
        moisture: fuelColumn.moisture ?? 0,
        waterWeight: materialWaterWeight(fuelColumn),
      }
    )
    const airCols: PhaseTableColumn[] = airColumns.map((column) => ({
      id: column.id,
      kind: 'oxygen' as const,
      header: '气',
      subHeader: column.name,
      weight: column.weight,
      oxygenAir: buildOxygenAirPhaseColumn(column.ratios),
    }))
    const furnaceBlend = buildFurnaceBlendPhaseColumn([
      ...rawColumns
        .filter((column) => column.weight > 0 && column.phases && column.phaseReady !== false)
        .map((column) => (        {
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
        oxygenWeightPct: column.oxygenAir!.weightPct,
      })),
    ])
    const hasComputedRawPhases = rawColumns.some((column) => column.phaseContentsByKey != null)
    const blendPhaseContentsByKey =
      phaseBatchResults && hasComputedRawPhases
        ? buildBlendPhaseContentsByKey(
            Object.fromEntries(
              Object.entries(phaseBatchResults).filter(
                ([materialId, result]) => phaseCompletedMaterials[materialId] && result?.valid
              )
            ),
            rawMaterials,
            materialPhaseRows
          )
        : null
    const blendCol: PhaseTableColumn = {
      id: 'blend',
      kind: 'blend',
      header: '混料',
      subHeader: '混料',
      weight: furnaceFeed.totalWeight,
      moisture: furnaceBlend.moisture,
      waterWeight: furnaceBlendWaterWeight,
      phases: furnaceBlend.phases,
      phaseContentsByKey: blendPhaseContentsByKey,
      applicablePhaseKeys: blendSolidPhaseKeys,
      materialPhaseRowKeys: blendSolidPhaseKeys,
      oxygenAir: { weightPct: furnaceBlend.gasWeightPct, volumePct: { O2: 0, N2: 0 } },
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
      productTableColumns.map((product) => ({
        id: product.key,
        kind: 'product' as const,
        header: product.name === '总计' ? '总计' : '产物',
        subHeader: product.name === '总计' ? '总计' : getStageProductName(activeProcessStageId, product),
        weight: productFilledBack ? product.mass : 0,
        productKey: product.key === 'total' ? 'total' : (product.key as CopperProductKey | 'loss'),
        productPhases:
          product.key === 'total'
            ? undefined
            : product.key === 'loss'
            ? productPhaseComposition.loss
            : productPhaseComposition[product.key as CopperProductKey],
        productGasVolume:
          product.key === 'gas' ? calculateGasVolumePercents(productPhaseComposition.gas ?? {}) : undefined,
        readOnly: product.key === 'total' || product.key === 'loss' || !productFilledBack,
      })),
    [activeProcessStageId, productFilledBack, productPhaseComposition, productTableColumns]
  )
  const oxygenAirInputStatus: SolveInputStatus = manualAirWeightValid || productCalculated ? 'resolved' : 'pending'
  const rawColumnWidth = (material: CopperMaterialColumn) => Math.max(104, Math.min(136, 72 + Math.min(displayRawMaterialName(material.name).length, 7) * 9))
  const batchTableNameLabels = useMemo(() => {
    const labels = [
      ...rawMaterials.map((material) => displayRawMaterialName(material.name)),
      ...solventColumns.map((material) => displaySolventName(material.name)),
      fuelColumn.name,
      ...airColumns.map((column) => column.name),
      '混料',
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
  const availableSolventsToAdd = useMemo(
    () =>
      DEFAULT_COPPER_SOLVENTS.filter((solvent) => !solventColumns.some((column) => column.name === solvent.name)).map(
        (solvent) => ({
          catalogId: solvent.id,
          label: solvent.name,
        })
      ),
    [solventColumns]
  )
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
    const productUsesPhases = (product: CopperProductTableColumn) =>
      product.displayMode === 'phases' && Boolean(product.phases?.length)
    const productElementRatio = (product: CopperProductTableColumn, element: CopperElementKey) => {
      if (!productFilledBack) return ''
      if (productUsesPhases(product)) return ''
      return formatTableNumber(product.composition[element] ?? 0)
    }
    const blankInputValues = () => [
      ...rawMaterials.map(() => ''),
      ...solventColumns.map(() => ''),
      '',
      ...airColumns.map(() => ''),
      '',
    ]
    const productColumnValues = (buildValue: (product: CopperProductTableColumn, index: number) => string) =>
      productTableColumns.map((product, index) => buildValue(product, index))
    const columns: CopperBatchExportColumn[] = [
      ...rawMaterials.map((material, index) => ({ header: `原料${index + 1}`, subHeader: displayRawMaterialName(material.name) })),
      ...solventColumns.map((material, index) => ({ header: `熔剂${index + 1}`, subHeader: displaySolventName(material.name) })),
      { header: '燃料煤', subHeader: fuelColumn.name },
      ...airColumns.map((column) => ({ header: '气', subHeader: column.name })),
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
      ...airColumns.map((column) => formatTableNumber(column.ratios[element] ?? 0)),
      formatTableNumber(furnaceFeed.ratios[element] ?? 0),
      ...productTableColumns.map((product) => productElementRatio(product, element)),
    ]
    const productPhaseRows: CopperBatchExportRow[] = []
    if (productFilledBack) {
      productTableColumns.forEach((product, productIndex) => {
        if (!productUsesPhases(product) || !product.phases) return
        const productName =
          product.name === '总计' ? '总计' : getStageProductName(activeProcessStageId, product)
        for (const phase of product.phases) {
          productPhaseRows.push({
            label: phase.label,
            values: [
              ...blankInputValues(),
              ...productColumnValues((_, index) =>
                index === productIndex ? formatTableNumber(phase.pct) : ''
              ),
            ],
          })
        }
        productPhaseRows.push({
          label: `${productName} 合计`,
          values: [
            ...blankInputValues(),
            ...productColumnValues((_, index) => (index === productIndex ? '100' : '')),
          ],
        })
      })
    }
    const rows: CopperBatchExportRow[] = [
      {
        label: 't/h（干基）',
        values: [
          ...rawMaterials.map((material) => formatTableNumber(material.weight)),
          ...solventColumns.map((material) => formatTableNumber(material.weight)),
          formatTableNumber(fuelColumn.weight),
          ...airColumns.map((column) => formatTableNumber(column.weight)),
          formatTableNumber(furnaceFeed.totalWeight - furnaceBlendWaterWeight),
          ...productTableColumns.map((product) => (productFilledBack ? formatTableNumber(product.mass) : '')),
        ],
      },
      {
        label: '含水 t/h',
        values: [
          ...rawMaterials.map((material) => formatTableNumber(materialWaterWeight(material))),
          ...solventColumns.map((material) => formatTableNumber(materialWaterWeight(material))),
          formatTableNumber(materialWaterWeight(fuelColumn)),
          ...airColumns.map(() => ''),
          formatTableNumber(furnaceBlendWaterWeight),
          ...productTableColumns.map(() => ''),
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
          ...airColumns.map((column) => formatTableNumber(column.weight)),
          formatTableNumber(furnaceFeed.totalWeight),
          ...productTableColumns.map((product) => (productFilledBack ? formatTableNumber(product.mass) : '')),
        ],
      },
      ...batchExportElementKeys.map((element) => ({
        label: element.replace(/\(.+\)/, ''),
        values: commonValues(element),
      })),
      ...productPhaseRows,
      {
        label: '合计',
        values: [
          ...rawMaterials.map(materialTotal),
          ...solventColumns.map(materialTotal),
          materialTotal(fuelColumn),
          ...airColumns.map(materialTotal),
          '100',
          ...productTableColumns.map((product) => {
            if (!productFilledBack) return ''
            if (productUsesPhases(product)) return '100'
            return formatTableNumber(
              calculateKnownTotal(product.composition) + (product.composition['Other(其他)'] ?? 0)
            )
          }),
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
    const inputRowKeys = phaseTableRowKeys.filter((key) =>
      inputPhaseColumnData.some((column) => {
        if (column.kind === 'product') return false
        if (key === 'O2' || key === 'N2') return column.kind === 'oxygen' || column.kind === 'blend'
        return column.kind !== 'oxygen' && getPhaseExportValue(column, key) !== ''
      })
    )
    const inputValue = (column: PhaseTableColumn, key: string) => getPhaseExportValue(column, key)
    const phaseExportDryWeight = (column: PhaseTableColumn) => {
      if (column.kind === 'blend') {
        return Math.max(0, column.weight - (column.waterWeight ?? furnaceBlendWaterWeight))
      }
      if (column.kind === 'oxygen') return column.weight
      return column.weight
    }
    const phaseExportWaterWeight = (column: PhaseTableColumn) => {
      if (column.kind === 'oxygen') return 0
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

    const outputColumns: CopperBatchExportColumn[] = outputPhaseColumnData.map((column) => ({
      header: column.header,
      subHeader: column.subHeader,
    }))
    const outputRowKeys = sortCopperPhaseKeys(
      Array.from(new Set(Object.values(PRODUCT_PHASE_ROWS).flatMap((rows) => rows)))
    )
    const outputRows: CopperBatchExportRow[] = [
      {
        label: 't/h',
        values: outputPhaseColumnData.map((column) => (productFilledBack ? formatTableNumber(column.weight) : '')),
      },
      ...outputRowKeys.map((key) => ({
        label: PRODUCT_PHASE_DISPLAY[key] ?? key,
        values: outputPhaseColumnData.map((column) =>
          productFilledBack ? formatTableNumber(column.productPhases?.[key] ?? 0) : ''
        ),
      })),
      {
        label: '合计',
        values: outputPhaseColumnData.map((column) =>
          productFilledBack
            ? formatTableNumber((Object.values(column.productPhases ?? {}) as number[]).reduce((sum, value) => sum + value, 0))
            : ''
        ),
      },
    ]

    return {
      inputSheet: { title: `${titlePrefix} 投入-物料物相表`, columns: inputColumns, rows: inputRows },
      outputSheet: { title: `${titlePrefix} 产出-物料物相表`, columns: outputColumns, rows: outputRows },
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
    const sheets: CopperBatchWorkbookSheet[] = [
      { title: `${titlePrefix} 投入-物料元素表`, columns, rows },
      inputSheet,
      outputSheet,
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

  const exportProductCalculation = async () => {
    if (!oxySolverResult?.valid) {
      setWorkflowMessage(workflowStepMessage(5, '请先计算产出结果，再导出 Excel。'), 'flow')
      return
    }
    const titlePrefix = `${APP_NAME_ZH} ${getCopperStageExportName(activeStage.name)} 产出计算`
    const maxPhaseCols = Math.max(
      ...OXY_SIDE_BLOW_PRODUCT_KEYS.map((pk) => oxySolverResult.products[pk].phases.length),
      1
    )
    const columns: CopperBatchExportColumn[] = [
      { header: '名称', subHeader: '名称' },
      { header: 't/h', subHeader: 't/h' },
      { header: '占比%', subHeader: '占比%' },
      ...Array.from({ length: maxPhaseCols }, (_, index) => ({
        header: index === 0 ? '物相' : '',
        subHeader: `物相${index + 1}`,
      })),
    ]
    const rows: CopperBatchExportRow[] = []
    for (const pk of OXY_SIDE_BLOW_PRODUCT_KEYS) {
      const product = oxySolverResult.products[pk]
      const sharePct =
        oxySolverResult.totalProductMass > 0 ? (product.mass / oxySolverResult.totalProductMass) * 100 : 0
      const phaseLabels = Array.from({ length: maxPhaseCols }, (_, index) => {
        const phase = product.phases[index]
        return phase ? PRODUCT_PHASE_DISPLAY[phase.key] ?? phase.key : ''
      })
      const phasePcts = Array.from({ length: maxPhaseCols }, (_, index) => {
        const phase = product.phases[index]
        return phase ? formatProductSharePercent(phase.pct) : ''
      })
      rows.push({
        label: `${product.name} · 物相`,
        values: [product.name, formatTableNumber(product.mass), formatProductSharePercent(sharePct), ...phaseLabels],
      })
      rows.push({
        label: `${product.name} · w%`,
        values: ['', '', '', ...phasePcts],
      })
      if (pk === 'flueGas') {
        const volumePercents = calculateGasVolumePercents(
          Object.fromEntries(product.phases.map((phase) => [phase.key, phase.pct]))
        )
        const phaseVolPcts = Array.from({ length: maxPhaseCols }, (_, index) => {
          const phase = product.phases[index]
          if (!phase) return ''
          const volPct = volumePercents[phase.key as keyof typeof volumePercents] ?? 0
          return volPct > 1e-12 ? formatProductSharePercent(volPct) : '0.0000'
        })
        rows.push({
          label: `${product.name} · v%`,
          values: ['', '', '', ...phaseVolPcts],
        })
      }
    }
    const filename = `${sanitizeExcelFilePart(APP_NAME_ZH)}_${sanitizeExcelFilePart(getCopperStageExportName(activeStage.name))}_产出计算_${formatExportDate()}.xls`
    const html = buildCopperBatchWorkbookHtml([{ title: titlePrefix, columns, rows }])
    const result = await saveCopperBatchExcelWorkbook(filename, html, getElectronExportWorkbookSaver())
    if (result.ok) {
      setWorkflowMessage('已导出产出计算结果。', 'success')
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
    openLibraryMaterialAddDialog()
  }

  const addSolvent = (catalogId: string) => {
    const catalog = DEFAULT_COPPER_SOLVENTS.find((item) => item.id === catalogId)
    if (!catalog) return
    if (solventColumns.some((column) => column.name === catalog.name)) return
    const id = `solvent-${catalog.id}`
    setSolventColumns((prev) => [
      ...prev,
      {
        id,
        name: catalog.name,
        kind: 'solvent',
        weight: 0,
        waterWeight: 0,
        moisture: 0,
        ratios: solventOxidesToElements(catalog.composition),
        unitPrice: catalog.unitPrice,
      },
    ])
    clearBatchCalculationState()
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
    libraryRatioDrafts[libraryRatioDraftKey(rowId, element)] ?? format(value ?? 0)

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

  const scrollToCalculationTable = () => {
    window.requestAnimationFrame(() => {
      calculationTableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
  }

  const scrollToProductCalculation = () => {
    window.requestAnimationFrame(() => {
      productCalculationRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  const openHeatBalanceAssist = () => {
    setShowHeatBalanceAssist(true)
    if (productCalculated) {
      setHeatBalanceEngaged(true)
    }
  }

  const toggleHeatBalanceAssist = () => {
    setShowHeatBalanceAssist((value) => {
      const next = !value
      if (next && productCalculated) {
        setHeatBalanceEngaged(true)
      }
      return next
    })
  }

  const handleBatchTableViewChange = (view: BatchTableView) => {
    setBatchTableView(view)
    if (view === 'product') {
      setProductCalculationEngaged(true)
      setShowProductCalculationAssist(true)
      if (!hasProductResult) {
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

  const calculateProductsFromProductTable = () => {
    if (furnaceFeed.totalWeight <= 0) {
      setWorkflowMessage(workflowStepMessage(4, '请先在配料总表填写混料投料量。'), 'flow')
      scrollToCalculationTable()
      return
    }
    const validPhaseResults = rawMaterials
      .map((material) => phaseBatchResults?.[material.id])
      .filter((result): result is PhaseMaterialCalcResult => Boolean(result?.valid))
    const blendPhasePct =
      validPhaseResults.length > 0
        ? buildBlendPhaseFromMaterialResults(validPhaseResults, materialPhaseRows)
        : null
    const inputPhaseMass = blendPhasePct
      ? {
          混合铜精矿: Object.fromEntries(
            Object.entries(blendPhasePct).map(([phase, pct]) => [phase, (Math.max(0, pct ?? 0) / 100) * concentrateMass])
          ),
        }
      : undefined
    const solverResult = solveOxySideBlowProducts({
      blendFeed: furnaceFeed,
      concentrateMass,
      inputPhaseMass,
      fuelColumn,
      solventColumns,
      airColumns,
    })
    setOxySolverResult(solverResult)
    setProductCalculated(true)
    setProductFilledBack(false)
    setProductPhaseManual(false)
    setProductPhaseOverrides({})
    setOutputPhaseDrafts({})
    setInvalidOutputPhaseColumns({})
    const bridged = oxySolverToCopperProductResult(solverResult)
    if (solverResult.recommended.fuelWeight > 0 && !nearlyEqual(fuelColumn.weight, solverResult.recommended.fuelWeight)) {
      updateFuelColumn({ weight: solverResult.recommended.fuelWeight })
    }
    const convergeNote = solverResult.valid
      ? ''
      : ` ${solverResult.message ?? '产出约束未完全满足，请查看残差表。'}`
    const actionNote = solverResult.valid
      ? '请确认预览表后点击「回填产出到配料总表」。'
      : '当前结果不可回填，请先修正输入或约束。'
    setWorkflowMessage(
      workflowStepMessage(
        5,
        `产出计算完成：产物总量 ${format(bridged.totalProductMass)} t/h（${formatCopperProductMassSummary(bridged, activeProcessStageId)}）。${convergeNote}${actionNote}`
      ),
      solverResult.valid ? 'success' : 'warning'
    )
  }

  const applyProductResultsToBatchTable = () => {
    if (!productCalculated || !oxySolverResult) {
      setWorkflowMessage(workflowStepMessage(5, '请先计算产出结果，再回填到配料总表。'), 'flow')
      scrollToProductCalculation()
      return
    }
    if (!oxySolverResult.valid) {
      setWorkflowMessage(
        workflowStepMessage(5, oxySolverResult.message ?? '产出约束未完全满足，不能回填当前预览结果。请查看残差表并修正后重新计算。'),
        'error'
      )
      scrollToProductCalculation()
      return
    }
    setProductFilledBack(true)
    setBatchTableHighlight(true)
    scrollToCalculationTable()
    const bridged = oxySolverToCopperProductResult(oxySolverResult)
    setWorkflowMessage(
      workflowStepMessage(
        5,
        `已回填产出到配料总表：产物总量 ${format(bridged.totalProductMass)} t/h（${formatCopperProductMassSummary(bridged, activeProcessStageId)}）。`
      ),
      'success'
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

  const runHeatBalanceCalculation = () => {
    if (!productCalculated) {
      setWorkflowMessage(workflowStepMessage(5, '请先完成产出计算。'), 'flow')
      scrollToProductCalculation()
      return
    }
    if (!heatInputValid) {
      setWorkflowMessage(workflowStepMessage(6, '请先补全温度、热损失、燃料参数和富氧空气设置。'), 'flow')
      openHeatBalanceAssist()
      scrollToAssist(heatBalanceRef)
      return
    }
    setHeatBalanced(true)
    setWorkflowMessage(
      workflowStepMessage(
        6,
        `热平衡计算完成：热缺口 ${format(Math.max(0, heatBalance.heatDeficitMJh), 0)} MJ/h，推荐燃料煤 ${format(heatBalance.requiredFuelWeight)} t/h。热平衡算法优化中，当前结果仅供参考。`
      ),
      'success'
    )
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
      phaseCompleted,
      productCalculated,
      productFilledBack,
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
      productDistributionDrafts: cloneProductDistributionDrafts(productDistributionDrafts),
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
      phaseMaterialId,
      phaseAssistTabMaterialIds: [...phaseAssistTabMaterialIds],
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
    const record = buildCaseSnapshot({ name: caseName })
    persistCopperCases([record, ...caseRecords])
    setActiveCaseId(record.id)
    setNewCaseName(suggestCopperCaseName(smeltMethodName))
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
    const nextAirColumns = normalizeProcessAirColumns(record.airColumns, record.oxygenAirColumn)
    setRawMaterials(nextRawMaterials)
    setRawWeightDrafts(record.rawWeightDrafts ?? Object.fromEntries(nextRawMaterials.map((material) => [material.id, material.weight > 0 ? String(material.weight) : ''])))
    setSolventColumns(nextSolventColumns)
    setFuelColumn(record.fuelColumn ? cloneFuelMaterial(record.fuelColumn) : cloneFuelMaterial(DEFAULT_COPPER_FUEL))
    setAirColumns(nextAirColumns)
    setTargetFeSiO2(record.targetFeSiO2 ?? '2.8')
    setTargetCaOSiO2(record.targetCaOSiO2 ?? '0.45')
    setSolventSolution(cloneSolventSolution(record.solventSolution ?? null))
    setPhaseCompletedMaterials(record.phaseCompletedMaterials ?? {})
    setPhaseBatchResults(record.phaseBatchResults ?? null)
    setManualPhaseCells(record.manualPhaseCells ?? {})
    setManualSolventWeights(record.manualSolventWeights ?? {})
    setManualFuelWeightValid(record.manualFuelWeightValid ?? false)
    setPhaseCompleted(record.phaseCompleted ?? false)
    setProductCalculated(record.productCalculated ?? false)
    setProductFilledBack(record.productFilledBack ?? record.productCalculated ?? false)
    setHeatBalanced(record.heatBalanced ?? false)
    setFuelLhv(record.fuelLhv ?? String(DEFAULT_COPPER_FUEL.lowerHeatingValueMJkg))
    setFuelEfficiency(record.fuelEfficiency ?? String(DEFAULT_COPPER_FUEL.combustionEfficiency))
    const nextOxygenAirText = normalizeOxygenAirText(record.oxygenAirO2Pct, record.oxygenAirN2Pct)
    setOxygenAirO2Pct(nextOxygenAirText.oxygen)
    setOxygenAirN2Pct(nextOxygenAirText.nitrogen)
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
    setBatchTableView(normalizeBatchTableView(record.batchTableView, record.productFilledBack ?? record.productCalculated ?? false))
    setPhaseRatioOverrides(record.phaseRatioOverrides ?? {})
    setManualPhaseRatioColumns(record.manualPhaseRatioColumns ?? {})
    setProductDistributionDrafts(cloneProductDistributionDrafts(record.productDistributionDrafts))
    setProductPhaseOverrides(record.productPhaseOverrides ?? {})
    setProductPhaseManual(record.productPhaseManual ?? false)
    setCustomPhaseRows(record.customPhaseRows ?? {})
    setMaterialPhaseRows(
      Object.fromEntries(
        Object.entries(record.materialPhaseRows ?? {}).map(([materialId, rows]) => [
          materialId,
          ensureMaterialPhaseRows(rows),
        ])
      )
    )
    setInputPhaseDrafts({})
    setOutputPhaseDrafts({})
    setInvalidInputPhaseColumns({})
    setInvalidOutputPhaseColumns({})
    const restoredPhaseMaterialId = record.phaseMaterialId ?? null
    const validPhaseMaterialId =
      restoredPhaseMaterialId &&
      nextRawMaterials.some((material) => material.id === restoredPhaseMaterialId && material.name.trim())
        ? restoredPhaseMaterialId
        : nextRawMaterials.find((material) => material.name.trim() && record.phaseBatchResults?.[material.id])?.id ??
          null
    setPhaseMaterialId(validPhaseMaterialId)
    setPhaseAssistTabMaterialIds(
      buildPhaseAssistTabMaterialIds(
        record.phaseAssistTabMaterialIds ?? [],
        validPhaseMaterialId,
        record.phaseBatchResults ?? null
      ).filter((id) => nextRawMaterials.some((material) => material.id === id && material.name.trim()))
    )
    const savedPreview = record.phasePreviewUnknowns ?? null
    if (validPhaseMaterialId && record.phaseBatchResults?.[validPhaseMaterialId]) {
      const result = record.phaseBatchResults[validPhaseMaterialId]!
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

  const renderProductCalculationPanel = (
    key = 'product-calculation-panel',
    extraClassName = '',
    options: { engaged?: boolean; tableVisible?: boolean; showIntro?: boolean } = {}
  ) => {
    const engaged = options.engaged ?? false
    const tableVisible = options.tableVisible ?? true
    const showIntro = options.showIntro ?? true
    const hasResult = hasProductResult
    const recommendedFuelWeight = oxySolverResult?.recommended.fuelWeight ?? 0

    return (
      <div key={key} className={`space-y-4 ${extraClassName}`}>
        {showIntro && (
          <div className={`${hintText(darkMode)} space-y-1 text-sm leading-relaxed`}>
            <p>打开方式：在配料总表完成混料投料量与各原料物相成分后，在本区预览侧吹炉产出结果。</p>
            <p>
              计算说明：依据入炉混料、熔剂、燃料煤与工艺空气的质量守恒，求解熔炼渣、白铜锍、烟气、烟尘、无组织排放与损失的质量及物相组成；占比% 为各产物在总产物中的质量分数。
            </p>
          </div>
        )}
        {tableVisible && (
          <CopperProductionResultTable
            darkMode={darkMode}
            result={hasResult ? oxySolverResult : null}
            empty={!hasResult}
          />
        )}
        {engaged && (
          <>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                className={btnSecondary(darkMode)}
                onClick={() => void exportProductCalculation()}
                disabled={!hasResult}
                title="导出产出计算预览表"
              >
                导出 Excel
              </button>
              <button
                type="button"
                className={btnPrimary(darkMode)}
                onClick={calculateProductsFromProductTable}
                disabled={furnaceFeed.totalWeight <= 0}
              >
                计算产出结果
              </button>
              <button
                type="button"
                className={btnSecondary(darkMode)}
                onClick={applyProductResultsToBatchTable}
                disabled={!hasResult || !oxySolverResult?.valid}
              >
                回填产出到配料总表
              </button>
            </div>
            {hasResult && (
              <div
                className={assistAlertPanelClassName(
                  darkMode,
                  oxySolverResult?.valid ? 'success' : 'warning'
                )}
              >
                {!productFilledBack
                  ? `已计算，待回填：产物总量 ${format(tableProductResult.totalProductMass)} t/h（${formatCopperProductMassSummary(tableProductResult, activeProcessStageId)}）。${
                      recommendedFuelWeight > 0
                        ? ` 推荐燃料煤 ${format(recommendedFuelWeight)} t/h。`
                        : ''
                    }${
                      oxySolverResult && !oxySolverResult.valid
                        ? ` ${oxySolverResult.message ?? '产出约束未完全满足，当前不可回填。'}`
                        : ''
                    }`
                  : `已回填：产出结果已写入配料总表投入-物料元素表产出行${
                      recommendedFuelWeight > 0
                        ? `；推荐燃料煤 ${format(recommendedFuelWeight)} t/h`
                        : ''
                    }。`}
              </div>
            )}
          </>
        )}
      </div>
    )
  }

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
              showBalance={productFilledBack}
              onChange={handleBatchTableViewChange}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {batchTableView === 'element' && (
              <>
                <button type="button" className={btnSecondary(darkMode)} onClick={addMaterial}>
                  + 添加原料
                </button>
                <BatchAddSolventControl
                  darkMode={darkMode}
                  availableSolvents={availableSolventsToAdd}
                  onAddSolvent={addSolvent}
                />
              </>
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
            feedTotalWeight={furnaceFeed.totalWeight}
            rawMaterials={rawMaterials}
            solventColumns={solventColumns}
            fuelColumn={fuelColumn}
            airColumns={airColumns}
            furnaceFeedRatios={furnaceFeed.ratios}
            furnaceBlendWaterWeight={furnaceBlendWaterWeight}
            productTableColumns={productTableColumns.map((product) => {
              const base = {
                key: product.key,
                name: product.name === '总计' ? '总计' : getStageProductName(activeProcessStageId, product),
                mass: product.mass,
                composition: product.composition,
              }
              if (product.displayMode === 'phases' && product.phases && product.phases.length > 0) {
                return { ...base, displayMode: 'phases' as const, phases: product.phases }
              }
              return base
            })}
            productTotalMass={tableProductResult.totalProductMass}
            productCalculated={productFilledBack}
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
            showProductRows={allPhaseMaterialsCompleted && productFilledBack}
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
              outputColumns={allPhaseMaterialsCompleted && productFilledBack ? outputPhaseColumnData : []}
              tableWidth={phaseTableWidth}
              nameColWidth={batchTableNameColWidth}
              formatTableNumber={formatTableNumber}
              furnaceBlendWaterWeight={furnaceBlendWaterWeight}
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
              物相 w% 为干基质量分数（相对干料 t/h）；含水行仅展示含水质量，物相列显示「—」，不参与物相合计。产出物相行在所有原料物相完成后、产出计算完成后显示。
            </p>
          </div>
        ) : batchTableView === 'balance' ? (
          <div key="balance-batch-view" className="space-y-3 batch-table-view-enter">
            <div className={`overflow-hidden rounded-lg border ${darkMode ? 'border-gray-600' : 'border-gray-200'}`}>
              <table className="w-full table-fixed text-sm">
                <thead className={darkMode ? 'bg-gray-800 text-gray-100' : 'bg-gray-50 text-gray-700'}>
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">物料平衡表</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className={`px-3 py-6 text-center ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>—</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          renderProductCalculationPanel('product-batch-view', 'batch-table-view-enter', {
            engaged: true,
            tableVisible: true,
          })
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
            计算说明：以质量守恒为基础，依据各物相化学计量比把化验已知元素分配求解干基 w%，再由 O / C / Other 反算闭合；含水行单独输入 t/h，湿基总量 = 干料 + 含水，物相湿基按干基水分缩放。
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
                    const displayPhaseElementKeys = activePhasePreview
                      ? phaseTableColumnKeys.filter(
                          (element) => (phasePivotDisplayTotals[element] ?? 0) > 1e-12
                        )
                      : phaseTableColumnKeys
                    const showPhaseEditControls = !selectedPhaseLocked
                    const colCount = displayPhaseSlots.length + (showPhaseEditControls ? 3 : 2)
                    const labelSamples = [
                      '物相',
                      'w%',
                      ...displayPhaseElementKeys.map((element) =>
                        phaseTableHeaderLabel(element, phaseElementView)
                      ),
                    ]
                    if (showPhaseEditControls) labelSamples.push('操作')
                    const totalSamples = ['合计', formatPhaseCell(100)]
                    if (activePhasePreview) {
                      totalSamples.push(formatPhaseCell(phasePivotTotals.phaseTotal))
                      for (const element of displayPhaseElementKeys) {
                        const mass = phasePivotDisplayTotals[element] ?? 0
                        if (mass > 1e-12 && selectedPhaseMaterial.weight > 0) {
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
                      if (pivot?.phasePercent != null && pivot.phasePercent > 1e-12) {
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
                          if (mass > 1e-12) {
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
                    const assistWPercentHasValue = (
                      row: MaterialPhaseAssistRow,
                      phasePercent: number | null
                    ) => {
                      if (row.kind === 'draft') return false
                      return phasePercent != null && phasePercent > 0
                    }
                    const assistElementHasValue = (
                      row: MaterialPhaseAssistRow,
                      phasePercent: number | null,
                      element: string,
                      rowElementDisplay: Record<string, number>
                    ) => {
                      if (
                        row.kind === 'draft' ||
                        phasePercent == null ||
                        phasePercent <= 0 ||
                        selectedPhaseMaterial.weight <= 0
                      ) {
                        return false
                      }
                      return (rowElementDisplay[element] ?? 0) > 0
                    }
                    const renderAssistWPercent = (
                      row: MaterialPhaseAssistRow,
                      phasePercent: number | null
                    ) => {
                      if (row.kind === 'draft') return '—'
                      return (
                        <PhaseAssistPercentCell
                          darkMode={darkMode}
                          percent={phasePercent}
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
                        phasePercent <= 0 ||
                        selectedPhaseMaterial.weight <= 0
                      ) {
                        return '—'
                      }
                      return (
                        <PhaseAssistPercentCell
                          darkMode={darkMode}
                          percent={massThToWeightPercent(
                            rowElementDisplay[element] ?? 0,
                            selectedPhaseMaterial.weight
                          )}
                          massTh={rowElementDisplay[element] ?? 0}
                          feedRateTh={selectedPhaseMaterial.weight}
                        />
                      )
                    }
                    const totalWHasValue = Boolean(activePhasePreview && phasePivotTotals.phaseTotal > 0)
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
                              className={`border-t px-0.5 py-1.5 text-center font-mono text-sm font-semibold ${firstPhaseRowCls} ${valueHighlight(totalWHasValue)}`}
                              title="湿基物相 w% 与元素 w% 合计（含 H₂O）；悬停单元格可查看质量流量"
                            >
                              {activePhasePreview ? (
<PhaseAssistPercentCell
                        darkMode={darkMode}
                        percent={phasePivotTotals.phaseTotal}
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
                              const hasValue = assistWPercentHasValue(row, phasePercent)
                              return (
                                <td key={`w-${row.id}`} className={phaseDataCell(phaseIndex, hasValue, true)}>
                                  {renderAssistWPercent(row, phasePercent)}
                                </td>
                              )
                            })}
                            {showPhaseEditControls && <td className={`border-t ${assistHeadCls}`} />}
                          </tr>
                          {displayPhaseElementKeys.map((element) => {
                            const totalElementHasValue = Boolean(
                              activePhasePreview &&
                                selectedPhaseMaterial.weight > 0 &&
                                (phasePivotDisplayTotals[element] ?? 0) > 0
                            )
                            return (
                              <tr
                                key={element}
                                className={`border-t ${darkMode ? 'border-gray-600' : 'border-gray-200'}`}
                              >
                                <td className={`${assistStickyLabel} font-medium`}>
                                  {phaseTableHeaderLabel(element, phaseElementView)}
                                </td>
                                <td
                                  className={`border-t px-0.5 py-1.5 text-center font-mono text-sm ${assistTotalCls} ${valueHighlight(totalElementHasValue)}`}
                                >
                                  {activePhasePreview && selectedPhaseMaterial.weight > 0 ? (
<PhaseAssistPercentCell
                        darkMode={darkMode}
                        percent={massThToWeightPercent(
                                        phasePivotDisplayTotals[element] ?? 0,
                                        selectedPhaseMaterial.weight
                                      )}
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
                  <label
                    className="inline-flex cursor-pointer items-center gap-2"
                    title={
                      phaseElementView === 'compound'
                        ? '将 SiO₂/CaO/Al₂O₃/H₂O 等拆解为 Si/Ca/Al/H/O 元素显示'
                        : '恢复化合物列显示'
                    }
                  >
                    <span className="text-sm">元素转换</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={phaseElementView === 'element'}
                      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                        phaseElementView === 'element'
                          ? 'bg-blue-600'
                          : darkMode
                            ? 'bg-gray-600'
                            : 'bg-gray-300'
                      }`}
                      onClick={() =>
                        setPhaseElementView((v) => (v === 'compound' ? 'element' : 'compound'))
                      }
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                          phaseElementView === 'element' ? 'translate-x-4' : 'translate-x-0.5'
                        }`}
                      />
                    </button>
                  </label>
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
        {renderProductCalculationPanel('product-standalone-calculation', 'mt-4', {
          engaged: productCalculationEngaged,
          tableVisible: showProductCalculationAssist,
        })}
      </div>

      <div ref={heatBalanceRef} className={cardCompact(darkMode)}>
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          <h3 className={`${sectionTitle(darkMode)} mb-0`}>热平衡计算</h3>
          <button type="button" className={btnSecondary(darkMode)} onClick={toggleHeatBalanceAssist}>
            {showHeatBalanceAssist ? '折叠' : '展开'}
          </button>
        </div>
        <div className={`${hintText(darkMode)} mt-4 space-y-1 text-sm leading-relaxed`}>
          <p>打开方式：完成产出计算后，在本区设置各股物料温度、炉体热损失与富氧空气参数，预览热收支表后点击「计算热平衡」。</p>
          <p>
            计算说明：以入炉物料显热与化学反应热为热收入，熔炼产物带出显热与自然散热为热支出，平衡后求取燃料煤需求量；分项物理热表结构与 Excel 工作表一致。
          </p>
        </div>
        {showHeatBalanceAssist && (
          <div className="mt-4 space-y-4">
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
            <div>
              <div className={`mb-2 text-xs font-semibold ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>氧气参数</div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <LabeledInput darkMode={darkMode} label="氧气 O (%)" value={oxygenAirO2Pct} onChange={(value) => updateOxygenAirComposition(value, oxygenAirN2Pct)} />
                <LabeledInput darkMode={darkMode} label="氧气 N (%)" value={oxygenAirN2Pct} onChange={(value) => updateOxygenAirComposition(oxygenAirO2Pct, value)} />
                <LabeledInput darkMode={darkMode} label="供氧系数" value={oxygenSupplyCoefficient} onChange={(value) => updateHeatField(setOxygenSupplyCoefficient, value)} />
              </div>
            </div>
            <CopperHeatBalancePlaceholderTables darkMode={darkMode} />
            {heatBalanced && (
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
                        ['投入物理热', format(heatBalance.inputPhysicalHeatMJh, 0), 'MJ/h'],
                        ['氧化化学热', format(heatBalance.chemicalHeatMJh, 0), 'MJ/h'],
                        ['产物物理热', format(heatBalance.outputPhysicalHeatMJh, 0), 'MJ/h'],
                        ['总热损失', format(heatBalance.heatLossMJh + heatBalance.otherHeatMJh, 0), 'MJ/h'],
                        ['热缺口', format(Math.max(0, heatBalance.heatDeficitMJh), 0), 'MJ/h'],
                        ['推荐燃料煤', format(heatBalance.requiredFuelWeight), 't/h'],
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
                      max(0, {format(heatBalance.heatDeficitMJh, 0)}) / {format(fuelHeatMJt, 0)} = {format(heatBalance.requiredFuelWeight)} t/h
                    </div>
                  </div>
                  <div className={heatFormulaCardClass(darkMode)}>
                    <div className={`text-xs font-semibold ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>计算基准</div>
                    <div className="mt-1 grid grid-cols-1 gap-1 font-mono text-sm">
                      <span>热平衡入炉料 {format(furnaceFeedWithoutFuel.totalWeight)} t/h</span>
                      <span>氧气 {format(oxygenAirColumn.weight)} t/h</span>
                      <span>{getStageProductName(activeProcessStageId, heatProductResult.products.matte)} {format(heatProductResult.products.matte.mass)} t/h</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
            {heatBalanceEngaged && (
              <>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <button
                    className={btnPrimary(darkMode)}
                    onClick={runHeatBalanceCalculation}
                    disabled={!productCalculated || !heatInputValid}
                  >
                    计算热平衡
                  </button>
                </div>
                {heatBalanced && (
                  <div className={assistAlertPanelClassName(darkMode, 'success')}>
                    热平衡残差约 {format(heatBalance.balanceAfterFuelMJh, 0)} MJ/h；推荐燃料煤 {format(heatBalance.requiredFuelWeight)} t/h。
                  </div>
                )}
              </>
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
      const samples = rows.map((row) => (column.element ? format(row.ratios[column.element] ?? 0) : ''))
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
  showBalance,
  onChange,
}: {
  darkMode: boolean
  activeView: BatchTableView
  showBalance: boolean
  onChange: (view: BatchTableView) => void
}) {
  const tabs: Array<{ id: BatchTableView; label: string }> = [
    { id: 'element', label: '投入-物料元素表' },
    { id: 'phase', label: '投入-物料物相表' },
    { id: 'product', label: '产出-物料物相表' },
    ...(showBalance ? [{ id: 'balance' as const, label: '物料平衡表' }] : []),
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
