import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import type { SheetId } from '../../types'
import { APP_NAME_ZH } from '../../constants/appCopy'
import { btnPrimary, btnSecondary, cardBase, hintText, inputBase, inputSm, resultBox, sectionTitle } from '../../theme/uiTheme'
import {
  buildCopperBatchExportFilename,
  buildCopperBatchExportHtml,
  downloadCopperBatchExcel,
  getCopperStageExportName,
  type CopperBatchExportColumn,
  type CopperBatchExportRow,
} from '../../utils/copperBatchExport'
import { calculateCopperEquipmentSizing, normalizeScaleWanTpa } from '../../utils/copperEquipmentSizing'
import {
  COPPER_ELEMENT_KEYS,
  COPPER_MATERIAL_LIBRARY,
  DEFAULT_COPPER_SOLVENTS,
  calculateKnownTotal,
  calculateUnknownsFromPhases,
  calculateWeightedComposition,
  createDefaultCopperMaterials,
  createDefaultSolventColumns,
  elementRatiosToSolventComposition,
  parseCopperLibraryCsv,
  solveCopperSolvents,
  type CopperElementKey,
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
type EquipmentStageId = 'smelting' | 'converting' | 'refining'
type SolveInputStatus = 'none' | 'pending' | 'resolved'
type CopperCaseStageId = Extract<SheetId, 'cu_smelting' | 'cu_converting' | 'cu_refining' | 'cu_equipment'>

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
  targetFeSiO2: string
  targetCaOSiO2: string
  solventSolution: CopperSolventSolution | null
  phaseDrafts: Record<string, PhaseDraft>
  manualPhaseCells: Record<string, boolean>
  manualSolventWeights: Record<string, boolean>
  manualFuelWeightValid: boolean
  phaseCompleted: boolean
  productCalculated: boolean
  heatBalanced: boolean
  fuelLhv: string
  fuelEfficiency: string
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
        承接熔炼计算结果，进行冰铜品位调控与渣量平衡计算，为精炼环节提供精准的中间产物数据。
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
        承接吹炼计算结果，进行铜精炼渣品位调控与渣量平衡计算，为设备选型环节提供精准的中间产物数据。
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

const PRODUCT_DISPLAY_ELEMENTS: CopperElementKey[] = ['Cu(铜)', 'Fe(铁)', 'S (硫)', 'Si(硅)', 'Ca(钙)', 'C (碳)', 'O (氧)', 'Other(其他)']

const PHASE_FIELDS = [
  { key: 'Cu2O', label: 'Cu₂O' },
  { key: 'FeO', label: 'FeO' },
  { key: 'Fe2O3', label: 'Fe₂O₃' },
  { key: 'Fe3O4', label: 'Fe₃O₄' },
  { key: 'SiO2', label: 'SiO₂' },
  { key: 'CaO', label: 'CaO' },
  { key: 'Al2O3', label: 'Al₂O₃' },
  { key: 'C', label: 'C' },
]

const PHASE_OXYGEN_FACTORS: Record<string, number> = {
  Cu2O: 16 / 143.09,
  FeO: 16 / 71.844,
  Fe2O3: 48 / 159.688,
  Fe3O4: 64 / 231.533,
  SiO2: 32 / 60.084,
  CaO: 16 / 56.077,
  Al2O3: 48 / 101.961,
}

const DEFAULT_PHASE_DRAFT: PhaseDraft = Object.fromEntries(
  PHASE_FIELDS.map((field) => [field.key, { value: '0', factor: '1' }])
) as PhaseDraft
const PHASE_UNKNOWN_ELEMENTS = new Set<CopperElementKey>(['O (氧)', 'C (碳)', 'Other(其他)'])

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
    targetFeSiO2: candidate.targetFeSiO2 ?? '2.8',
    targetCaOSiO2: candidate.targetCaOSiO2 ?? '0.45',
    solventSolution: cloneSolventSolution(candidate.solventSolution ?? null),
    phaseDrafts: candidate.phaseDrafts ?? {},
    manualPhaseCells: candidate.manualPhaseCells ?? {},
    manualSolventWeights: candidate.manualSolventWeights ?? {},
    manualFuelWeightValid: candidate.manualFuelWeightValid ?? false,
    phaseCompleted: candidate.phaseCompleted ?? false,
    productCalculated: candidate.productCalculated ?? false,
    heatBalanced: candidate.heatBalanced ?? false,
    fuelLhv: candidate.fuelLhv ?? String(DEFAULT_COPPER_FUEL.lowerHeatingValueMJkg),
    fuelEfficiency: candidate.fuelEfficiency ?? String(DEFAULT_COPPER_FUEL.combustionEfficiency),
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

function format(v: number, digits = 3) {
  return Number(v.toFixed(digits)).toString()
}

function displaySolventName(name: string) {
  return name === '石灰' ? '石灰石' : name
}

function nextStage(activeSheet: SheetId) {
  const index = STAGES.findIndex((stage) => stage.id === activeSheet)
  return index >= 0 ? STAGES[index + 1] : undefined
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
  side: 'left' | 'right',
  boundary: 'top' | 'middle' | 'bottom'
) {
  const tone = status === 'resolved'
    ? dark
      ? 'border-emerald-500 bg-emerald-950/10 text-emerald-50'
      : 'border-emerald-500 bg-emerald-50/70 text-emerald-950'
    : dark
    ? 'border-red-500 bg-red-950/10 text-red-50'
    : 'border-red-400 bg-red-50/70 text-red-950'
  const sideFrame = side === 'left' ? 'border-l-2' : 'border-r-2'
  const topFrame = boundary === 'top' ? 'border-t-2' : ''
  const bottomFrame = boundary === 'bottom' ? 'border-b-2' : ''
  return `${materialCellClass(dark, 'raw')} cursor-pointer ${tone} ${sideFrame} ${topFrame} ${bottomFrame}`
}

function materialSelectClass(dark: boolean) {
  return `h-9 w-full appearance-none truncate rounded border px-2 pr-7 text-center text-[13px] leading-normal ${
    dark
      ? 'bg-gray-700 border-gray-600 text-gray-100'
      : 'bg-white border-gray-300 text-gray-900'
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
  const [phaseMaterialId, setPhaseMaterialId] = useState<string | null>(null)
  const [phaseDrafts, setPhaseDrafts] = useState<Record<string, PhaseDraft>>({})
  const [manualPhaseCells, setManualPhaseCells] = useState<Record<string, boolean>>({})
  const [manualSolventWeights, setManualSolventWeights] = useState<Record<string, boolean>>({})
  const [manualFuelWeightValid, setManualFuelWeightValid] = useState(false)
  const [phaseCompleted, setPhaseCompleted] = useState(false)
  const [showElementAssist, setShowElementAssist] = useState(false)
  const [showSolventAssist, setShowSolventAssist] = useState(false)
  const [showProductAssist, setShowProductAssist] = useState(true)
  const [showHeatAssist, setShowHeatAssist] = useState(true)
  const [productCalculated, setProductCalculated] = useState(false)
  const [workflowMessage, setWorkflowMessage] = useState<string | null>(null)
  const [caseRecords, setCaseRecords] = useState<CopperCaseRecord[]>(() => sortCopperCaseRecords(readCopperCaseRecords()))
  const [activeCaseId, setActiveCaseId] = useState<string | null>(null)
  const [caseMessage, setCaseMessage] = useState<string | null>(null)
  const [pendingNavigationSheet, setPendingNavigationSheet] = useState<SheetId | null>(null)
  const [newCaseName, setNewCaseName] = useState(() => suggestCopperCaseName())
  const [targetFeSiO2, setTargetFeSiO2] = useState('2.8')
  const [targetCaOSiO2, setTargetCaOSiO2] = useState('0.45')
  const [solventSolution, setSolventSolution] = useState<CopperSolventSolution | null>(null)
  const [fuelColumn, setFuelColumn] = useState<CopperFuelMaterial>(() => ({
    ...DEFAULT_COPPER_FUEL,
    ratios: { ...DEFAULT_COPPER_FUEL.ratios },
  }))
  const [fuelLhv, setFuelLhv] = useState(String(DEFAULT_COPPER_FUEL.lowerHeatingValueMJkg))
  const [fuelEfficiency, setFuelEfficiency] = useState(String(DEFAULT_COPPER_FUEL.combustionEfficiency))
  const [feedTemperature, setFeedTemperature] = useState('25')
  const [matteTemperature, setMatteTemperature] = useState('1180')
  const [slagTemperature, setSlagTemperature] = useState('1250')
  const [gasTemperature, setGasTemperature] = useState('1150')
  const [dustTemperature, setDustTemperature] = useState('450')
  const [heatLossMJh, setHeatLossMJh] = useState('1500')
  const [otherHeatMJh, setOtherHeatMJh] = useState('0')
  const [heatBalanced, setHeatBalanced] = useState(false)
  const [annualHours, setAnnualHours] = useState('7200')
  const [equipmentIntensity, setEquipmentIntensity] = useState('32')
  const [targetScaleWanTpa, setTargetScaleWanTpa] = useState('10')
  const [equipmentAdjustments, setEquipmentAdjustments] = useState<Record<EquipmentStageId, string>>({
    smelting: '1',
    converting: '1',
    refining: '1',
  })
  const calculationTableRef = useRef<HTMLDivElement>(null)
  const elementAssistRef = useRef<HTMLDivElement>(null)
  const solventAssistRef = useRef<HTMLDivElement>(null)
  const productAssistRef = useRef<HTMLDivElement>(null)
  const heatAssistRef = useRef<HTMLDivElement>(null)
  const caseImportInputRef = useRef<HTMLInputElement>(null)

  const rawBlend = useMemo(() => calculateWeightedComposition(rawMaterials), [rawMaterials])
  const furnaceFeedWithoutFuel = useMemo(
    () => calculateWeightedComposition([...rawMaterials, ...solventColumns]),
    [rawMaterials, solventColumns]
  )
  const furnaceFeed = useMemo(
    () => calculateWeightedComposition([...rawMaterials, ...solventColumns, fuelColumn]),
    [rawMaterials, solventColumns, fuelColumn]
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

  const phaseCellKey = (materialId: string, element: CopperElementKey) => `${materialId}:${element}`
  const phaseCellStatus = (material: CopperMaterialColumn, element: CopperElementKey): SolveInputStatus => {
    if (!PHASE_UNKNOWN_ELEMENTS.has(element)) return 'none'
    return phaseCompleted || manualPhaseCells[phaseCellKey(material.id, element)] ? 'resolved' : 'pending'
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
  const activeCase = activeCaseId ? caseRecords.find((record) => record.id === activeCaseId) ?? null : null
  const isCopperProcessSheet = activeSheet === 'cu_smelting' || activeSheet === 'cu_converting' || activeSheet === 'cu_refining'
  const nextProcessStage = nextStage(activeSheet)
  const canProceed = isCopperProcessSheet ? solventSolution?.valid === true && heatBalanced : false
  const calculationTableWidth = Math.max(720, 34 + 76 + rawMaterials.length * 128 + solventColumns.length * 96 + 112 + 112 + 34 + 96 + 96)
  const productOutputRows = useMemo(() => {
    if (!productCalculated) return []
    return [
      ...Object.values(productResult.products).map((product) => ({ name: product.name, value: format(product.mass) })),
      { name: '产物总量', value: format(productResult.totalProductMass) },
    ]
  }, [productCalculated, productResult])
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
    const productNameAt = (index: number) => productOutputRows[index]?.name ?? (index === 0 ? '待产出计算' : '')
    const productValueAt = (index: number) => productOutputRows[index]?.value ?? ''
    const materialTotal = (material: CopperMaterialColumn | CopperFuelMaterial) =>
      format(calculateKnownTotal(material.ratios) + (material.ratios['Other(其他)'] ?? 0))
    const columns: CopperBatchExportColumn[] = [
      ...rawMaterials.map((material, index) => ({ header: `原料${index + 1}`, subHeader: material.name })),
      ...solventColumns.map((material, index) => ({ header: `熔剂${index + 1}`, subHeader: displaySolventName(material.name) })),
      { header: '燃料煤', subHeader: fuelColumn.name },
      { header: '混料', subHeader: '混料' },
      { header: '产出物' },
      { header: '含量' },
    ]
    const commonValues = (element: CopperElementKey, productIndex: number) => [
      ...rawMaterials.map((material) => format(material.ratios[element] ?? 0)),
      ...solventColumns.map((material) => format(material.ratios[element] ?? 0)),
      format(fuelColumn.ratios[element] ?? 0),
      format(furnaceFeed.ratios[element] ?? 0),
      productNameAt(productIndex),
      productValueAt(productIndex),
    ]
    const rows: CopperBatchExportRow[] = [
      {
        label: 't/h',
        values: [
          ...rawMaterials.map((material) => format(material.weight)),
          ...solventColumns.map((material) => format(material.weight)),
          format(fuelColumn.weight),
          format(furnaceFeed.totalWeight),
          productNameAt(0),
          productValueAt(0),
        ],
      },
      ...COPPER_ELEMENT_KEYS.map((element, index) => ({
        label: element.replace(/\(.+\)/, ''),
        values: commonValues(element, index + 1),
      })),
      {
        label: '合计',
        values: [
          ...rawMaterials.map(materialTotal),
          ...solventColumns.map(materialTotal),
          materialTotal(fuelColumn),
          '100',
          productNameAt(COPPER_ELEMENT_KEYS.length + 1),
          productValueAt(COPPER_ELEMENT_KEYS.length + 1),
        ],
      },
    ]
    return { columns, rows }
  }

  const exportCalculationTable = () => {
    const { columns, rows } = buildCalculationExportTable()
    const title = `${APP_NAME_ZH} ${getCopperStageExportName(activeStage.name)} 配料总表`
    const filename = buildCopperBatchExportFilename({ appName: APP_NAME_ZH, stageName: activeStage.name })
    const html = buildCopperBatchExportHtml({ title, columns, rows })
    downloadCopperBatchExcel(filename, html)
  }

  const phaseRows = useMemo(
    () =>
      PHASE_FIELDS.map((field) => {
        const draft = currentPhaseDraft[field.key] ?? { value: '0', factor: '1' }
        const effective = toNumber(draft.value) * toNumber(draft.factor, 1)
        return {
          ...field,
          draft,
          oxygen: effective * (PHASE_OXYGEN_FACTORS[field.key] ?? 0),
          carbon: field.key === 'C' ? effective : 0,
        }
      }),
    [currentPhaseDraft]
  )

  const updateRawMaterial = (id: string, patch: Partial<CopperMaterialColumn>) => {
    setRawMaterials((prev) => prev.map((material) => (material.id === id ? { ...material, ...patch } : material)))
    setSolventSolution(null)
    setPhaseCompleted(false)
    setProductCalculated(false)
    setHeatBalanced(false)
  }

  const updateRawWeight = (id: string, value: string) => {
    setRawWeightDrafts((prev) => ({ ...prev, [id]: value }))
    updateRawMaterial(id, { weight: isValidNumberText(value) ? toNumber(value, 0) : 0 })
  }

  const updateSolventColumn = (id: string, patch: Partial<CopperMaterialColumn>) => {
    setSolventColumns((prev) => prev.map((material) => (material.id === id ? { ...material, ...patch } : material)))
    setSolventSolution(null)
    setProductCalculated(false)
    setHeatBalanced(false)
  }

  const updateSolventWeight = (id: string, value: string) => {
    const valid = isValidNumberText(value)
    updateSolventColumn(id, { weight: valid ? toNumber(value, 0) : 0 })
    setManualSolventWeights((prev) => ({ ...prev, [id]: valid }))
  }

  const updateFuelColumn = (patch: Partial<CopperFuelMaterial>) => {
    setFuelColumn((prev) => ({ ...prev, ...patch }))
    setProductCalculated(false)
    setHeatBalanced(false)
  }

  const updateFuelWeight = (value: string) => {
    const valid = isValidNumberText(value)
    updateFuelColumn({ weight: valid ? toNumber(value, 0) : 0 })
    setManualFuelWeightValid(valid)
  }

  const updateRatio = (id: string, element: CopperElementKey, value: number, kind: 'raw' | 'solvent') => {
    const update = kind === 'raw' ? updateRawMaterial : updateSolventColumn
    const list = kind === 'raw' ? rawMaterials : solventColumns
    const current = list.find((material) => material.id === id)
    if (!current) return
    update(id, { ratios: { ...current.ratios, [element]: value } })
  }

  const updateFuelRatio = (element: CopperElementKey, value: number) => {
    updateFuelColumn({ ratios: { ...fuelColumn.ratios, [element]: value } })
  }

  const updateRawRatio = (id: string, element: CopperElementKey, value: string) => {
    const valid = isValidNumberText(value)
    updateRatio(id, element, valid ? toNumber(value, 0) : 0, 'raw')
    if (PHASE_UNKNOWN_ELEMENTS.has(element)) {
      setManualPhaseCells((prev) => ({ ...prev, [phaseCellKey(id, element)]: valid }))
    }
  }

  const applyLibraryMaterial = (id: string, libraryId: string) => {
    const selected = materialLibrary.find((material) => material.id === libraryId)
    if (!selected) return
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
        name: `自定义原料 ${prev.length + 1}`,
        kind: 'raw',
        weight: 0,
        ratios: Object.fromEntries(COPPER_ELEMENT_KEYS.map((element) => [element, 0])) as Record<CopperElementKey, number>,
        unitPrice: 0,
      },
    ])
    setRawWeightDrafts((prev) => ({ ...prev, [id]: '' }))
    setSolventSolution(null)
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
    setSolventSolution(null)
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
    scrollToAssist(calculationTableRef)
  }

  const openElementAssist = (materialId: string) => {
    setPhaseMaterialId(materialId)
    setShowElementAssist(true)
    scrollToAssist(elementAssistRef)
  }

  const openSolventAssist = () => {
    setShowSolventAssist(true)
    scrollToAssist(solventAssistRef)
  }

  const openHeatAssist = () => {
    setShowHeatAssist(true)
    scrollToAssist(heatAssistRef)
  }

  const openProductAssist = () => {
    setShowProductAssist(true)
    scrollToAssist(productAssistRef)
  }

  const updateHeatField = (setter: (value: string) => void, value: string) => {
    setter(value)
    setHeatBalanced(false)
  }

  const updateEquipmentAdjustment = (id: EquipmentStageId, value: string) => {
    setEquipmentAdjustments((prev) => ({ ...prev, [id]: value }))
  }

  const applyFuelFromHeatBalance = () => {
    if (!productCalculated) {
      setWorkflowMessage('请先完成产出计算，再进行热平衡燃料煤回填。')
      openProductAssist()
      return
    }
    setFuelColumn((prev) => ({
      ...prev,
      weight: heatBalance.requiredFuelWeight,
      lowerHeatingValueMJkg: toNumber(fuelLhv, DEFAULT_COPPER_FUEL.lowerHeatingValueMJkg),
      combustionEfficiency: toNumber(fuelEfficiency, DEFAULT_COPPER_FUEL.combustionEfficiency),
    }))
    setProductCalculated(true)
    setHeatBalanced(true)
    setWorkflowMessage('已回填燃料煤并复算混料与产物。')
    scrollToCalculationTable()
  }

  const solveSolvents = () => {
    if (!phaseCompleted) {
      setWorkflowMessage('请先完成物相折算与元素补全，再计算熔剂投料量。')
      setShowElementAssist(true)
      scrollToAssist(elementAssistRef)
      return
    }
    const solvents = solventColumns.map((column, index) => {
      const fallback = DEFAULT_COPPER_SOLVENTS[index]
      return {
        id: fallback?.id ?? column.id,
        name: column.name as '石灰' | '铁矿石',
        unitPrice: column.unitPrice ?? fallback?.unitPrice ?? 0,
        composition: elementRatiosToSolventComposition(column.ratios),
      }
    })
    const solution = solveCopperSolvents({
      rawMaterials,
      targetFeSiO2: toNumber(targetFeSiO2, 2.8),
      targetCaOSiO2: toNumber(targetCaOSiO2, 0.45),
      solvents,
    })
    setSolventSolution(solution)
    setWorkflowMessage(solution.valid ? null : solution.message ?? '熔剂投料量未能求解。')
    if (!solution.valid) return
    setSolventColumns((prev) =>
      prev.map((column) => ({
        ...column,
        weight: solution.solventWeights[column.name] ?? 0,
      }))
    )
    setProductCalculated(false)
    setHeatBalanced(false)
    scrollToCalculationTable()
  }

  const calculateProductsAndRefill = () => {
    if (!solventSolution?.valid) {
      setWorkflowMessage('请先完成熔剂投料量计算，再进行产出计算。')
      setShowSolventAssist(true)
      scrollToAssist(solventAssistRef)
      return
    }
    setProductCalculated(true)
    setHeatBalanced(false)
    setWorkflowMessage('产出计算已完成，并回填到配料总表右侧产物栏。')
    scrollToCalculationTable()
  }

  const updatePhaseDraft = (materialId: string, key: string, field: keyof PhaseDraftEntry, value: string) => {
    setPhaseDrafts((prev) => ({
      ...prev,
      [materialId]: {
        ...(prev[materialId] ?? DEFAULT_PHASE_DRAFT),
        [key]: {
          ...((prev[materialId] ?? DEFAULT_PHASE_DRAFT)[key] ?? { value: '0', factor: '1' }),
          [field]: value,
        },
      },
    }))
  }

  const applyPhaseUnknowns = () => {
    if (!selectedPhaseMaterial) return
    const unknowns = calculateUnknownsFromPhases(currentPhaseDraft, selectedPhaseMaterial.ratios)
    updateRawMaterial(selectedPhaseMaterial.id, {
      ratios: {
        ...selectedPhaseMaterial.ratios,
        ...unknowns,
      },
    })
    setPhaseCompleted(true)
    setWorkflowMessage('物相折算已回填，可继续计算熔剂投料量。')
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
      targetFeSiO2,
      targetCaOSiO2,
      solventSolution: cloneSolventSolution(solventSolution),
      phaseDrafts: { ...phaseDrafts },
      manualPhaseCells: { ...manualPhaseCells },
      manualSolventWeights: { ...manualSolventWeights },
      manualFuelWeightValid,
      phaseCompleted,
      productCalculated,
      heatBalanced,
      fuelLhv,
      fuelEfficiency,
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
    setTargetFeSiO2(record.targetFeSiO2 ?? '2.8')
    setTargetCaOSiO2(record.targetCaOSiO2 ?? '0.45')
    setSolventSolution(cloneSolventSolution(record.solventSolution ?? null))
    setPhaseDrafts(record.phaseDrafts ?? {})
    setManualPhaseCells(record.manualPhaseCells ?? {})
    setManualSolventWeights(record.manualSolventWeights ?? {})
    setManualFuelWeightValid(record.manualFuelWeightValid ?? false)
    setPhaseCompleted(record.phaseCompleted ?? false)
    setProductCalculated(record.productCalculated ?? false)
    setHeatBalanced(record.heatBalanced ?? false)
    setFuelLhv(record.fuelLhv ?? String(DEFAULT_COPPER_FUEL.lowerHeatingValueMJkg))
    setFuelEfficiency(record.fuelEfficiency ?? String(DEFAULT_COPPER_FUEL.combustionEfficiency))
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

  const saveCopperCaseToDesktop = async (record: CopperCaseRecord) => {
    const fileName = buildCopperCaseFileName(record)
    const fileText = buildCopperCaseFileText(record)
    const api = typeof window !== 'undefined'
      ? (window as unknown as {
          electronAPI?: {
            saveCopperCaseToDesktop?: (fileName: string, content: string) => Promise<{ ok: boolean; filePath?: string; error?: string }>
          }
        }).electronAPI?.saveCopperCaseToDesktop
      : undefined
    if (!api) {
      exportCopperCaseFile(record)
      setCaseMessage(`当前环境不支持直接保存桌面，已下载案例文件：${fileName}`)
      return
    }
    const result = await api(fileName, fileText)
    if (result?.ok) {
      setCaseMessage(`已保存到桌面：${fileName}`)
    } else {
      setCaseMessage(`保存桌面失败：${result?.error ?? '未知错误'}`)
    }
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

  const confirmSaveBeforeCaseNavigation = (sheet: SheetId) => {
    if (sheet === activeSheet) return
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
    if (activeSheet === 'raw_material') {
      onActiveCaseNameChange?.(null)
      return
    }
    onActiveCaseNameChange?.(activeCase?.name ?? null)
  }, [activeCase?.name, activeSheet, onActiveCaseNameChange])

  useEffect(() => {
    if (!caseTitleDraft) return
    renameActiveCase(caseTitleDraft)
  }, [caseTitleDraft])

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
                          <button className={`${btnSecondary(darkMode)} whitespace-nowrap`} onClick={() => saveCopperCaseToDesktop(record)}>保存桌面</button>
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
        <StageSheetTabs darkMode={darkMode} activeSheet={activeSheet} onStageSelect={confirmSaveBeforeCaseNavigation} />
        <StageHeader
          darkMode={darkMode}
          activeSheet={activeSheet}
          onReturnCasePage={() => confirmSaveBeforeCaseNavigation('raw_material')}
        />
        <SaveBeforeNavigationDialog
          darkMode={darkMode}
          open={pendingNavigationSheet !== null}
          targetName={pendingNavigationSheet ? navigationTargetName(pendingNavigationSheet) : ''}
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
          onSaveCase={saveCurrentCase}
          onExportCase={() => exportCopperCaseFile()}
          onReturnCasePage={() => confirmSaveBeforeCaseNavigation('raw_material')}
        />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <StageSheetTabs darkMode={darkMode} activeSheet={activeSheet} onStageSelect={confirmSaveBeforeCaseNavigation} />
      <StageHeader
        darkMode={darkMode}
        activeSheet={activeSheet}
        onReturnCasePage={() => confirmSaveBeforeCaseNavigation('raw_material')}
      />
      <SaveBeforeNavigationDialog
        darkMode={darkMode}
        open={pendingNavigationSheet !== null}
        targetName={pendingNavigationSheet ? navigationTargetName(pendingNavigationSheet) : ''}
        onSaveAndContinue={() => continuePendingNavigation(true)}
        onContinueWithoutSaving={() => continuePendingNavigation(false)}
        onCancel={() => setPendingNavigationSheet(null)}
      />

      <div className={cardBase(darkMode)}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className={`${sectionTitle(darkMode)} mb-1`}>原料库</h3>
            <p className={`${hintText(darkMode)} leading-relaxed`}>
              原料库用于维护铜冶炼可选原料的元素含量。可展开查看内置样例，也可从 Excel 另存的 CSV/制表符文本中批量导入原料。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
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

        {importFeedback && (
          <div className={`mt-3 rounded-lg border px-3 py-2 text-sm ${darkMode ? 'border-blue-700 bg-blue-950/30 text-blue-100' : 'border-blue-200 bg-blue-50 text-blue-800'}`}>
            {importFeedback}
          </div>
        )}

        {showLibrary && (
          <div className={`mt-4 overflow-auto rounded-lg border ${darkMode ? 'border-gray-600' : 'border-gray-200'}`}>
            <table className="w-full min-w-[1220px] table-fixed text-sm">
              <thead className={darkMode ? 'bg-gray-800 text-gray-300' : 'bg-gray-50 text-gray-600'}>
                <tr>
                  <th className="w-32 px-2 py-2 text-left">原料</th>
                  {COPPER_ELEMENT_KEYS.map((element) => (
                    <th key={element} className="w-16 px-1.5 py-2 text-right">{element.replace(/\(.+\)/, '')}</th>
                  ))}
                  <th className="w-20 px-2 py-2 text-center">操作</th>
                </tr>
              </thead>
              <tbody>
                {materialLibrary.map((material) => (
                  <tr key={material.id} className={`border-t ${darkMode ? 'border-gray-600' : 'border-gray-200'}`}>
                    <td className="px-2 py-1.5 font-medium">{material.name}</td>
                    {COPPER_ELEMENT_KEYS.map((element) => (
                      <td key={element} className="px-1.5 py-1.5 text-right font-mono">{format(material.ratios[element] ?? 0, 2)}</td>
                    ))}
                    <td className="px-2 py-1.5 text-center">
                      <button
                        type="button"
                        className={`rounded border px-2 py-1 text-xs font-medium transition-colors ${
                          darkMode ? 'border-red-800 text-red-200 hover:bg-red-950/40' : 'border-red-200 text-red-700 hover:bg-red-50'
                        }`}
                        title="原料库移除"
                        onClick={() => removeLibraryMaterial(material.id)}
                      >
                        删除
                      </button>
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
          <h3 className={`${sectionTitle(darkMode)} mb-0`}>配料总表</h3>
          <div className="flex flex-wrap gap-2">
            <button className={btnSecondary(darkMode)} onClick={exportCalculationTable}>导出Excel</button>
            <button className={btnPrimary(darkMode)} onClick={addMaterial}>添加新原料</button>
          </div>
        </div>
        <div className={`overflow-auto rounded-lg border ${darkMode ? 'border-gray-600' : 'border-gray-200'}`}>
          <table className="table-fixed text-sm" style={{ width: calculationTableWidth }}>
            <colgroup>
              <col className="w-[34px]" />
              <col className="w-[76px]" />
              {rawMaterials.map((material) => <col key={material.id} className="w-32" />)}
              {solventColumns.map((material) => <col key={material.id} className="w-24" />)}
              <col className="w-28" />
              <col className="w-28" />
              <col className="w-[34px]" />
              <col className="w-24" />
              <col className="w-24" />
            </colgroup>
            <thead className={darkMode ? 'bg-gray-800 text-gray-300' : 'bg-gray-50 text-gray-600'}>
              <tr>
                <th rowSpan={2} className={`sticky left-0 z-30 px-1 py-2 ${darkMode ? 'bg-gray-800' : 'bg-gray-50'}`} />
                <th className={`sticky left-[34px] z-30 px-1 py-2 text-center font-semibold ${darkMode ? 'bg-gray-800' : 'bg-gray-50'}`} />
                {rawMaterials.map((material, index) => (
                  <th key={material.id} className="px-1 py-2 text-center font-semibold">
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
                <th className={`px-1 py-2 text-center font-semibold ${darkMode ? 'bg-amber-950/20' : 'bg-amber-50'}`}>燃料煤</th>
                <th className={`px-1 py-2 text-center font-semibold ${darkMode ? 'bg-blue-950/30' : 'bg-blue-50'}`}>混料</th>
                <th colSpan={3} className={`px-1 py-2 text-center font-semibold ${darkMode ? 'bg-indigo-950/20' : 'bg-indigo-50'}`}>产出</th>
              </tr>
              <tr>
                <th className={`sticky left-[34px] z-30 px-1 py-2 text-center font-semibold ${darkMode ? 'bg-gray-800' : 'bg-gray-50'}`}>名称</th>
                {rawMaterials.map((material) => (
                  <th key={`${material.id}-selector`} className="px-1 py-2 text-center font-semibold">
                    <select
                      className={materialSelectClass(darkMode)}
                      value={materialLibrary.some((item) => item.name === material.name) ? materialLibrary.find((item) => item.name === material.name)?.id : ''}
                      onChange={(event) => applyLibraryMaterial(material.id, event.target.value)}
                    >
                      <option value="">自定义</option>
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
                <th className={`px-1 py-2 text-center font-semibold ${darkMode ? 'bg-amber-950/20' : 'bg-amber-50'}`}>{fuelColumn.name}</th>
                <th className={`px-1 py-2 text-center font-semibold ${darkMode ? 'bg-blue-950/30' : 'bg-blue-50'}`}>混料</th>
                <th className={`px-1 py-2 text-center font-semibold ${darkMode ? 'bg-indigo-950/20' : 'bg-indigo-50'}`} />
                <th className={`px-1 py-2 text-center font-semibold ${darkMode ? 'bg-indigo-950/20' : 'bg-indigo-50'}`}>产出物</th>
                <th className={`px-1 py-2 text-center font-semibold ${darkMode ? 'bg-indigo-950/20' : 'bg-indigo-50'}`}>含量</th>
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
                      title={solventSolution?.valid ? '步骤3：熔剂投料量。已回填有效熔剂投料量；也可直接手动输入熔剂投料量；双击打开辅助计算。' : '步骤3：熔剂投料量。待渣型求解：可直接手动输入熔剂投料量；双击打开辅助计算。'}
                      onClick={(event) => event.stopPropagation()}
                      onDoubleClick={openSolventAssist}
                      value={format(material.weight)}
                      onChange={(event) => updateSolventWeight(material.id, event.target.value)}
                    />
                  </td>
                ))}
                <td className={materialCellClass(darkMode, 'fuel')}>
                  <input
                    className={solveInputClass(darkMode, fuelWeightStatus())}
                    title={heatBalanced ? '步骤5：热平衡配煤。已回填有效燃料煤；也可直接手动输入燃料煤；双击打开辅助计算。' : '步骤5：热平衡配煤。待热平衡求解：可直接手动输入燃料煤；双击打开辅助计算。'}
                    onClick={(event) => event.stopPropagation()}
                    onDoubleClick={openHeatAssist}
                    value={format(fuelColumn.weight)}
                    onChange={(event) => updateFuelWeight(event.target.value)}
                  />
                </td>
                <td className={`${materialCellClass(darkMode, 'total')} text-center font-mono`}>{format(furnaceFeed.totalWeight)}</td>
                <td
                  className={`border-t px-1 py-1 align-middle text-center ${darkMode ? 'border-gray-600 bg-indigo-950/20 text-indigo-100' : 'border-gray-200 bg-indigo-50 text-indigo-900'}`}
                  rowSpan={COPPER_ELEMENT_KEYS.length + 2}
                >
                  <span className="[writing-mode:vertical-rl] mx-auto inline-block whitespace-nowrap font-semibold leading-none">产物</span>
                </td>
                <td
                  className={productOutputCellClass(darkMode, productCalculated ? 'resolved' : 'pending', 'left', 'top')}
                  onClick={openProductAssist}
                  title="步骤4：产出计算。点击产出物/含量区域跳转到产出计算。"
                >
                  {productOutputRows[0]?.name ?? '待产出计算'}
                </td>
                <td
                  className={`${productOutputCellClass(darkMode, productCalculated ? 'resolved' : 'pending', 'right', 'top')} font-mono`}
                  onClick={openProductAssist}
                  title="步骤4：产出计算。点击产出物/含量区域跳转到产出计算。"
                >
                  {productOutputRows[0]?.value ?? '-'}
                </td>
              </tr>
              {COPPER_ELEMENT_KEYS.map((element, index) => (
                <tr key={element}>
                  <td className={materialCellClass(darkMode, 'label')}>{element.replace(/\(.+\)/, '')}</td>
                  {rawMaterials.map((material) => (
                    <td key={material.id} className={materialCellClass(darkMode)}>
                      <input
                        className={solveInputClass(darkMode, phaseCellStatus(material, element))}
                        title={
                          PHASE_UNKNOWN_ELEMENTS.has(element)
                            ? phaseCompleted
                              ? '步骤2：物相反推元素。已回填有效元素补全结果；也可直接手动输入；双击打开辅助计算。'
                              : '步骤2：物相反推元素。待物相求解：可直接手动输入；双击打开辅助计算。'
                            : undefined
                        }
                        onClick={(event) => event.stopPropagation()}
                        onDoubleClick={() => {
                          if (PHASE_UNKNOWN_ELEMENTS.has(element)) openElementAssist(material.id)
                        }}
                        value={material.ratios[element] ?? 0}
                        onChange={(event) => updateRawRatio(material.id, element, event.target.value)}
                      />
                    </td>
                  ))}
                  {solventColumns.map((material) => (
                    <td key={material.id} className={materialCellClass(darkMode, 'solvent')}>
                      <input
                        className={`${inputSm(darkMode)} h-7 w-full px-1 py-0 text-center font-mono text-sm`}
                        value={format(material.ratios[element] ?? 0)}
                        onChange={(event) => updateRatio(material.id, element, toNumber(event.target.value), 'solvent')}
                      />
                    </td>
                  ))}
                  <td className={materialCellClass(darkMode, 'fuel')}>
                    <input
                      className={`${inputSm(darkMode)} h-7 w-full px-1 py-0 text-center font-mono text-sm`}
                      value={format(fuelColumn.ratios[element] ?? 0)}
                      onChange={(event) => updateFuelRatio(element, toNumber(event.target.value))}
                    />
                  </td>
                  <td className={`${materialCellClass(darkMode, 'total')} text-center font-mono`}>{format(furnaceFeed.ratios[element] ?? 0)}</td>
                  <td
                    className={productOutputCellClass(darkMode, productCalculated ? 'resolved' : 'pending', 'left', 'middle')}
                    onClick={openProductAssist}
                    title="步骤4：产出计算。点击产出物/含量区域跳转到产出计算。"
                  >
                    {productOutputRows[index + 1]?.name ?? ''}
                  </td>
                  <td
                    className={`${productOutputCellClass(darkMode, productCalculated ? 'resolved' : 'pending', 'right', 'middle')} font-mono`}
                    onClick={openProductAssist}
                    title="步骤4：产出计算。点击产出物/含量区域跳转到产出计算。"
                  >
                    {productOutputRows[index + 1]?.value ?? ''}
                  </td>
                </tr>
              ))}
              <tr>
                <td className={materialCellClass(darkMode, 'label')}>合计</td>
                {rawMaterials.map((material) => (
                  <td key={material.id} className={`${materialCellClass(darkMode)} text-center font-mono`}>
                    {format(calculateKnownTotal(material.ratios) + (material.ratios['Other(其他)'] ?? 0))}
                  </td>
                ))}
                {solventColumns.map((material) => (
                  <td key={material.id} className={`${materialCellClass(darkMode, 'solvent')} text-center font-mono`}>
                    {format(calculateKnownTotal(material.ratios) + (material.ratios['Other(其他)'] ?? 0))}
                  </td>
                ))}
                <td className={`${materialCellClass(darkMode, 'fuel')} text-center font-mono`}>
                  {format(calculateKnownTotal(fuelColumn.ratios) + (fuelColumn.ratios['Other(其他)'] ?? 0))}
                </td>
                <td className={`${materialCellClass(darkMode, 'total')} text-center font-mono`}>100</td>
                <td
                  className={productOutputCellClass(darkMode, productCalculated ? 'resolved' : 'pending', 'left', 'bottom')}
                  onClick={openProductAssist}
                  title="步骤4：产出计算。点击产出物/含量区域跳转到产出计算。"
                >
                  {productOutputRows[COPPER_ELEMENT_KEYS.length + 1]?.name ?? ''}
                </td>
                <td
                  className={`${productOutputCellClass(darkMode, productCalculated ? 'resolved' : 'pending', 'right', 'bottom')} font-mono`}
                  onClick={openProductAssist}
                  title="步骤4：产出计算。点击产出物/含量区域跳转到产出计算。"
                >
                  {productOutputRows[COPPER_ELEMENT_KEYS.length + 1]?.value ?? ''}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
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
          <h3 className={`${sectionTitle(darkMode)} mb-0`}>步骤 1：物相折算与元素补全</h3>
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
            {selectedPhaseMaterial && (
              <>
                <div className={`overflow-auto rounded-lg border ${darkMode ? 'border-gray-600' : 'border-gray-200'}`}>
                  <table className="w-full min-w-[720px] table-fixed text-sm">
                    <thead className={darkMode ? 'bg-gray-800 text-gray-300' : 'bg-gray-50 text-gray-600'}>
                      <tr>
                        <th className="w-28 px-2 py-2 text-center">物相/产物</th>
                        <th className="w-28 px-2 py-2 text-center">含量 x(%)</th>
                        <th className="w-36 px-2 py-2 text-center">折算/活度修正系数</th>
                        <th className="w-28 px-2 py-2 text-center">O贡献</th>
                        <th className="w-28 px-2 py-2 text-center">C贡献</th>
                      </tr>
                    </thead>
                    <tbody>
                      {phaseRows.map((row) => (
                        <tr key={row.key} className={`border-t ${darkMode ? 'border-gray-600' : 'border-gray-200'}`}>
                          <td className="px-2 py-1.5 text-center font-medium">{row.label}</td>
                          <td className="px-2 py-1.5">
                            <input
                              className={`${inputSm(darkMode)} w-full text-center font-mono text-sm`}
                              value={row.draft.value}
                              onChange={(event) => updatePhaseDraft(selectedPhaseMaterial.id, row.key, 'value', event.target.value)}
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              className={`${inputSm(darkMode)} w-full text-center font-mono text-sm`}
                              value={row.draft.factor}
                              onChange={(event) => updatePhaseDraft(selectedPhaseMaterial.id, row.key, 'factor', event.target.value)}
                            />
                          </td>
                          <td className="px-2 py-1.5 text-center font-mono">{format(row.oxygen)}</td>
                          <td className="px-2 py-1.5 text-center font-mono">{format(row.carbon)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className={hintText(darkMode)}>O = Σ(x × 系数 × 物相含氧质量分数)，C = x × 系数，Other = 100 - 已知元素 - O - C。</div>
                  <button className={btnPrimary(darkMode)} onClick={applyPhaseUnknowns}>回填元素补全结果</button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <div ref={solventAssistRef} className={cardBase(darkMode)}>
        <button
          type="button"
          className="flex w-full flex-wrap items-center justify-between gap-3 text-left"
          onClick={() => setShowSolventAssist((value) => !value)}
        >
          <h3 className={`${sectionTitle(darkMode)} mb-0`}>步骤 2：熔剂投料量计算</h3>
          <span className={btnSecondary(darkMode)}>{showSolventAssist ? '折叠' : '展开'}</span>
        </button>
        {showSolventAssist && (
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(260px,0.85fr)_minmax(320px,1.15fr)]">
              <div className={`rounded-lg border p-3 ${darkMode ? 'border-gray-600 bg-gray-800/30' : 'border-gray-200 bg-gray-50/70'}`}>
                <h4 className={`mb-3 text-sm font-semibold ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>熔剂计算参数</h4>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <LabeledInput darkMode={darkMode} label="Fe/SiO₂" value={targetFeSiO2} onChange={setTargetFeSiO2} />
                  <LabeledInput darkMode={darkMode} label="CaO/SiO₂" value={targetCaOSiO2} onChange={setTargetCaOSiO2} />
                </div>
              </div>
              <div className={`rounded-lg border p-3 ${darkMode ? 'border-gray-600 bg-gray-800/30' : 'border-gray-200 bg-white'}`}>
                <h4 className={`mb-3 text-sm font-semibold ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>熔剂回填结果</h4>
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
                      {solventColumns.map((column) => (
                        <tr key={`solvent-result-${column.id}`} className={`border-t ${darkMode ? 'border-gray-600' : 'border-gray-200'}`}>
                          <td className="px-2 py-1.5 text-center font-medium">{displaySolventName(column.name)}</td>
                          <td className="px-2 py-1.5 text-center font-mono">{format(column.weight)}</td>
                          <td className="px-2 py-1.5 text-center">
                            {solventWeightStatus(column.id) === 'resolved' ? '已回填/手动输入' : '待计算或输入'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button className={btnPrimary(darkMode)} onClick={solveSolvents}>计算并回填熔剂</button>
            </div>
            {solventSolution && (
              <div className={`rounded-lg border p-3 text-sm ${solventSolution.valid ? (darkMode ? 'border-emerald-700 bg-emerald-950/30 text-emerald-100' : 'border-emerald-200 bg-emerald-50 text-emerald-900') : (darkMode ? 'border-amber-700 bg-amber-950/30 text-amber-100' : 'border-amber-200 bg-amber-50 text-amber-900')}`}>
                {solventSolution.valid
                  ? `已回填：石灰 ${format(solventSolution.solventWeights['石灰'] ?? 0)} t/h，铁矿石 ${format(solventSolution.solventWeights['铁矿石'] ?? 0)} t/h。`
                  : solventSolution.message}
              </div>
            )}
          </div>
        )}
      </div>

      <div ref={productAssistRef} className={cardBase(darkMode)}>
        <button
          type="button"
          className="flex w-full flex-wrap items-center justify-between gap-3 text-left"
          onClick={() => setShowProductAssist((value) => !value)}
        >
          <h3 className={`${sectionTitle(darkMode)} mb-0`}>步骤 3：产出计算</h3>
          <span className={btnSecondary(darkMode)}>{showProductAssist ? '折叠' : '展开'}</span>
        </button>
        {showProductAssist && (
          <div className="mt-4 space-y-4">
            <div className={hintText(darkMode)}>
              前置条件：物相折算和熔剂投料量均已完成。
            </div>
            <div className={`overflow-auto rounded-lg border ${darkMode ? 'border-gray-600' : 'border-gray-200'}`}>
              <table className="w-full min-w-[860px] table-fixed text-sm">
                <thead className={darkMode ? 'bg-gray-800 text-gray-300' : 'bg-gray-50 text-gray-600'}>
                  <tr>
                    <th className="w-28 px-2 py-2 text-center">产物</th>
                    <th className="w-24 px-2 py-2 text-center">质量 t/h</th>
                    {PRODUCT_DISPLAY_ELEMENTS.map((element) => (
                      <th key={element} className="w-20 px-2 py-2 text-center">{element.replace(/\(.+\)/, '')}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {productCalculated ? (
                    Object.values(productResult.products).map((product) => (
                      <tr key={product.key} className={`border-t ${darkMode ? 'border-gray-600' : 'border-gray-200'}`}>
                        <td className="px-2 py-1.5 text-center font-medium">{product.name}</td>
                        <td className="px-2 py-1.5 text-center font-mono">{format(product.mass)}</td>
                        {PRODUCT_DISPLAY_ELEMENTS.map((element) => (
                          <td key={element} className="px-2 py-1.5 text-center font-mono">{format(product.composition[element] ?? 0, 2)}</td>
                        ))}
                      </tr>
                    ))
                  ) : (
                    <tr className={`border-t ${darkMode ? 'border-gray-600' : 'border-gray-200'}`}>
                      <td colSpan={PRODUCT_DISPLAY_ELEMENTS.length + 2} className={`px-3 py-4 text-center ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                        待产出计算
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end">
              <button className={btnPrimary(darkMode)} onClick={calculateProductsAndRefill}>计算并回填产出</button>
            </div>
          </div>
        )}
      </div>

      <div ref={heatAssistRef} className={cardBase(darkMode)}>
        <button
          type="button"
          className="flex w-full flex-wrap items-center justify-between gap-3 text-left"
          onClick={() => setShowHeatAssist((value) => !value)}
        >
          <h3 className={`${sectionTitle(darkMode)} mb-0`}>步骤 4：热平衡与燃料煤回填</h3>
          <span className={btnSecondary(darkMode)}>{showHeatAssist ? '折叠' : '展开'}</span>
        </button>
        {showHeatAssist && (
          <div className="mt-4 space-y-4">
            <div>
              <h4 className={`mb-2 text-sm font-semibold ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>温度参数</h4>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-5">
                <LabeledInput darkMode={darkMode} label="入炉料温度 (℃)" value={feedTemperature} onChange={(value) => updateHeatField(setFeedTemperature, value)} />
                <LabeledInput darkMode={darkMode} label="冰铜温度 (℃)" value={matteTemperature} onChange={(value) => updateHeatField(setMatteTemperature, value)} />
                <LabeledInput darkMode={darkMode} label="炉渣温度 (℃)" value={slagTemperature} onChange={(value) => updateHeatField(setSlagTemperature, value)} />
                <LabeledInput darkMode={darkMode} label="烟气温度 (℃)" value={gasTemperature} onChange={(value) => updateHeatField(setGasTemperature, value)} />
                <LabeledInput darkMode={darkMode} label="烟尘温度 (℃)" value={dustTemperature} onChange={(value) => updateHeatField(setDustTemperature, value)} />
              </div>
            </div>
            <div>
              <h4 className={`mb-2 text-sm font-semibold ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>热损失与燃料参数</h4>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                <LabeledInput darkMode={darkMode} label="炉体热损失 (MJ/h)" value={heatLossMJh} onChange={(value) => updateHeatField(setHeatLossMJh, value)} />
                <LabeledInput darkMode={darkMode} label="其它热交换 (MJ/h)" value={otherHeatMJh} onChange={(value) => updateHeatField(setOtherHeatMJh, value)} />
                <LabeledInput darkMode={darkMode} label="煤低位发热量 (MJ/kg)" value={fuelLhv} onChange={(value) => updateHeatField(setFuelLhv, value)} />
                <LabeledInput darkMode={darkMode} label="燃烧效率" value={fuelEfficiency} onChange={(value) => updateHeatField(setFuelEfficiency, value)} />
              </div>
            </div>
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
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className={hintText(darkMode)}>
                当前配料总表燃料煤：{format(fuelColumn.weight)} t/h；热平衡残差：{format(heatBalanced ? heatBalance.balanceAfterFuelMJh : heatBalance.heatDeficitMJh, 0)} MJ/h。
              </div>
              <button className={btnPrimary(darkMode)} onClick={applyFuelFromHeatBalance}>回填燃料煤并复算</button>
            </div>
          </div>
        )}
      </div>

      {canProceed && nextProcessStage && (
        <div className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4 ${darkMode ? 'border-blue-700 bg-blue-950/30' : 'border-blue-200 bg-blue-50'}`}>
          <div className={darkMode ? 'text-blue-100' : 'text-blue-900'}>
            {activeStage.name}模块的配料、产出与热平衡已完成，燃料煤已回填，可进入{nextProcessStage.name}。
          </div>
          <button className={btnPrimary(darkMode)} onClick={() => confirmSaveBeforeCaseNavigation(nextProcessStage.id)}>进入{nextProcessStage.name}</button>
        </div>
      )}
      <CaseFooterActions
        darkMode={darkMode}
        onSaveCase={saveCurrentCase}
        onExportCase={() => exportCopperCaseFile()}
        onReturnCasePage={() => confirmSaveBeforeCaseNavigation('raw_material')}
      />
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
  onSaveAndContinue,
  onContinueWithoutSaving,
  onCancel,
}: {
  darkMode: boolean
  open: boolean
  targetName: string
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
        className={`w-full max-w-md overflow-hidden rounded-lg border shadow-2xl ${darkMode ? 'border-gray-600 bg-gray-800 text-gray-100' : 'border-gray-200 bg-white text-gray-900'}`}
      >
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
            即将切换到{targetName}。保存后再切换可保留当前案例的最新计算状态。
          </p>
        </div>
        <div className={`flex flex-wrap justify-end gap-2 border-t px-4 py-3 ${darkMode ? 'border-gray-600 bg-gray-900/40' : 'border-gray-200 bg-gray-50'}`}>
          <button className={btnPrimary(darkMode)} onClick={onSaveAndContinue}>保存并切换</button>
          <button className={btnSecondary(darkMode)} onClick={onContinueWithoutSaving}>不保存继续</button>
          <button className={btnSecondary(darkMode)} onClick={onCancel}>取消切换</button>
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
      : '操作流程：选择/添加原料 → 输入投料量 → 成分折算与补正 → 熔剂配比计算 → 产物计算 → 热平衡计算 → 燃料煤计算 → 进入下一工序'

  return (
    <div className={cardBase(darkMode)}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className={`${sectionTitle(darkMode)} mb-1`}>{active.name}</h3>
          <p className={`${hintText(darkMode)} leading-relaxed`}>{active.description}</p>
          <span className={`block text-sm leading-relaxed ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
            {flowText}
          </span>
        </div>
        <button className={`${btnSecondary(darkMode)} whitespace-nowrap`} onClick={onReturnCasePage}>返回项目工作区</button>
      </div>
    </div>
  )
}

function CaseFooterActions({
  darkMode,
  onSaveCase,
  onExportCase,
  onReturnCasePage,
}: {
  darkMode: boolean
  onSaveCase: () => void
  onExportCase: () => void
  onReturnCasePage: () => void
}) {
  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4 ${darkMode ? 'border-gray-600 bg-gray-800/50' : 'border-gray-200 bg-white'}`}>
      <div>
        <h3 className={`text-sm font-semibold ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}>案例操作</h3>
        <p className={`${hintText(darkMode)} mt-1`}>
          快捷键 Ctrl+S 可保存当前案例；导出文件格式为 .metcal-copper-case.json，可在案例页面导入。
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button className={btnPrimary(darkMode)} onClick={onSaveCase}>保存当前案例</button>
        <button className={btnSecondary(darkMode)} onClick={onExportCase}>导出案例</button>
        <button className={btnSecondary(darkMode)} onClick={onReturnCasePage}>返回案例页面</button>
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

function Metric({ darkMode, label, value }: { darkMode: boolean; label: string; value: string }) {
  return (
    <div className={resultBox(darkMode)}>
      <div className={hintText(darkMode)}>{label}</div>
      <div className="mt-1 font-mono text-lg">{value}</div>
    </div>
  )
}
