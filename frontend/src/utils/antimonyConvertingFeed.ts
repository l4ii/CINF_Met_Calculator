import type { OxyConstraintSolverResult, OxyProductResult } from './antimonyConstraintSolver.ts'
import { loadOxyConvertingConstraints } from './antimonyConstraintConfig.ts'
import {
  createMaterialPhaseRowsFromFormulas,
  ensureMaterialPhaseRows,
  materialPhaseRowTableKey,
  type MaterialPhaseAssistRow,
} from './antimonyPhaseAssist.ts'
import type { PhaseBatchResults, PhaseMaterialCalcResult } from './antimonyPhaseBatchCalc.ts'
import {
  cloneProcessStageState,
  createBlankProcessStageState,
  type AntimonyProcessStageState,
} from './antimonyProcessStageState.ts'
import { normalizeMetcalPhaseFormula } from './chemicalFormula.ts'
import { deriveElementRatiosFromPhaseRatios } from './metcalFloMixExtract.ts'
import {
  ANTIMONY_ELEMENT_KEYS,
  calculateKnownTotal,
  createConvertingProcessAirColumns,
  createSmeltingMaterialLibrary,
  DEFAULT_ANTIMONY_SOLVENTS,
  emptyAntimonyRatios,
  type AntimonyElementKey,
  type AntimonyLibraryMaterial,
  type AntimonyMaterialColumn,
  type AntimonyRatios,
} from './antimonyWorkflowCalc.ts'

export const CONVERTING_WHITE_MATTE_ID = 'raw-white-matte'
export const CONVERTING_SCRAP_1_ID = 'raw-scrap-1'
export const CONVERTING_SCRAP_2_ID = 'raw-scrap-2'
export const CONVERTING_OXIDE_SLAG_ID = 'raw-oxide-slag'
export const CONVERTING_WHITE_MATTE_NAME = '锑锍'
export const CONVERTING_SCRAP_1_NAME = '残极一'
export const CONVERTING_SCRAP_2_NAME = '残极二'
export const CONVERTING_OXIDE_SLAG_NAME = '氧化渣'
export const CONVERTING_LIME_SOLVENT_ID = 'solvent-lime'
export const CONVERTING_LIME_SOLVENT_NAME = '石灰石'

const MATTE_DEFAULT_PHASE_FORMULAS = ['Cu2S', 'FeS', 'Fe3O4', 'Other'] as const
/** 残极一/残极三（残极二）默认物相列，对齐西南铜 .flo 吹炼残极 */
export const SCRAP_DEFAULT_PHASE_FORMULAS = [
  'Cu',
  'Cu2O',
  'Cu2S',
  'Cu3As',
  'Fe',
  'Pb',
  'Zn',
  'Ni',
  'Bi',
  'Sb',
  'Sn',
  'Se',
  'Cd',
  'Au',
  'Ag',
  'Te',
  'Other',
] as const

/** 氧化渣默认物相列，对齐西南铜 .flo 吹炼氧化渣 */
export const OXIDE_SLAG_DEFAULT_PHASE_FORMULAS = [
  'Cu2O',
  'Cu3As',
  'Fe3O4',
  'PbO',
  'ZnO',
  'NiO',
  'BiO',
  'SbO',
  'SeO2',
  'SnO',
  'Cd',
  'Au',
  'Ag',
  'Te',
  'Other',
] as const

/** 残极（残极一）默认物相 w%：西南铜 .flo */
const SCRAP_1_DEFAULT_PHASE_PCT: Record<string, number> = {
  Cu: 97.116,
  Cu2O: 1.789,
  Cu2S: 0.05,
  Cu3As: 0.44,
  Fe: 0.018,
  Pb: 0.118,
  Zn: 0.022,
  Ni: 0.065,
  Bi: 0.032,
  Sb: 0.021,
  Sn: 0.001,
  Se: 0.063,
  Cd: 0.004,
  Au: 0.001,
  Ag: 0.085,
  Te: 0.039,
  Other: 0.137,
}

/** 残极三（残极二）默认物相 w%：西南铜 .flo */
const SCRAP_2_DEFAULT_PHASE_PCT: Record<string, number> = {
  Cu: 98.14,
  Cu2O: 0.447,
  Cu2S: 0.05,
  Cu3As: 0.673,
  Fe: 0.04,
  Pb: 0.15,
  Zn: 0.01,
  Ni: 0.18,
  Bi: 0.04,
  Sb: 0.08,
  Sn: 0.02,
  Se: 0.04,
  Cd: 0,
  Au: 0.001,
  Ag: 0.093,
  Te: 0.03,
  Other: 0.005,
}

/** 氧化渣默认物相 w%：西南铜 .flo */
const OXIDE_SLAG_DEFAULT_PHASE_PCT: Record<string, number> = {
  Cu2O: 35.383,
  Cu3As: 0.799,
  Fe3O4: 5.396,
  PbO: 22.913,
  ZnO: 7.323,
  NiO: 3.686,
  BiO: 6.118,
  SbO: 2.849,
  SeO2: 6.774,
  SnO: 0.208,
  Cd: 0.72,
  Au: 0,
  Ag: 0.015,
  Te: 1.764,
  Other: 6.051,
}

/** 石灰石默认物相列，对齐西南铜 .flo 吹炼石灰石 */
export const LIME_DEFAULT_PHASE_FORMULAS = ['SiO2', 'CaCO3', 'MgCO3', 'Fe', 'Other'] as const

/** 石灰石默认物相 w%：西南铜 .flo（投料量默认空） */
const LIME_DEFAULT_PHASE_PCT: Record<string, number> = {
  SiO2: 3,
  CaCO3: 89.239,
  MgCO3: 2.092,
  Fe: 0.2,
  Other: 5.469,
}

function cloneRatios(ratios: AntimonyRatios): Record<AntimonyElementKey, number> {
  const out = emptyAntimonyRatios()
  for (const key of ANTIMONY_ELEMENT_KEYS) {
    const value = Number(ratios[key] ?? 0)
    out[key] = Number.isFinite(value) ? value : 0
  }
  return out
}

function createMaterialColumn(params: {
  id: string
  name: string
  weight?: number
  ratios?: AntimonyRatios
  unitPrice?: number
}): AntimonyMaterialColumn {
  return {
    id: params.id,
    name: params.name,
    kind: 'raw',
    weight: Math.max(0, params.weight ?? 0),
    waterWeight: 0,
    moisture: 0,
    ratios: cloneRatios(params.ratios ?? emptyAntimonyRatios()),
    unitPrice: params.unitPrice ?? 0,
  }
}

/** 由残极/氧化渣物相 w% 反推元素表并闭合 Other（保留 O，供 O/C 列展示） */
export function deriveScrapElementRatiosFromPhasePct(
  phasePct: Record<string, number>
): Record<AntimonyElementKey, number> {
  const derived = deriveElementRatiosFromPhaseRatios(phasePct, { includeOxygen: true })
  const out = emptyAntimonyRatios()
  for (const key of ANTIMONY_ELEMENT_KEYS) {
    const value = Number(derived[key] ?? 0)
    out[key] = Number.isFinite(value) ? value : 0
  }
  const known = calculateKnownTotal(out)
  out['Other(其他)'] = Math.max(0, 100 - known)
  return out
}

function defaultScrapPhasePct(scrapId: string): Record<string, number> {
  return scrapId === CONVERTING_SCRAP_2_ID ? { ...SCRAP_2_DEFAULT_PHASE_PCT } : { ...SCRAP_1_DEFAULT_PHASE_PCT }
}

export function createConvertingDefaultScrapMaterials(): AntimonyMaterialColumn[] {
  return [
    createMaterialColumn({
      id: CONVERTING_SCRAP_1_ID,
      name: CONVERTING_SCRAP_1_NAME,
      weight: 0,
      ratios: deriveScrapElementRatiosFromPhasePct(SCRAP_1_DEFAULT_PHASE_PCT),
      unitPrice: 0,
    }),
    createMaterialColumn({
      id: CONVERTING_SCRAP_2_ID,
      name: CONVERTING_SCRAP_2_NAME,
      weight: 0,
      ratios: deriveScrapElementRatiosFromPhasePct(SCRAP_2_DEFAULT_PHASE_PCT),
      unitPrice: 0,
    }),
  ]
}

export function createConvertingOxideSlagMaterial(weight = 0): AntimonyMaterialColumn {
  return createMaterialColumn({
    id: CONVERTING_OXIDE_SLAG_ID,
    name: CONVERTING_OXIDE_SLAG_NAME,
    weight,
    ratios: deriveScrapElementRatiosFromPhasePct(OXIDE_SLAG_DEFAULT_PHASE_PCT),
    unitPrice: 0,
  })
}

export function createConvertingLimeSolventColumn(weight = 0): AntimonyMaterialColumn {
  const lime = DEFAULT_ANTIMONY_SOLVENTS.find((item) => item.id === 'lime') ?? DEFAULT_ANTIMONY_SOLVENTS[2]!
  return {
    id: CONVERTING_LIME_SOLVENT_ID,
    name: CONVERTING_LIME_SOLVENT_NAME,
    kind: 'solvent',
    weight: Math.max(0, weight),
    waterWeight: 0,
    moisture: 0,
    ratios: deriveScrapElementRatiosFromPhasePct(LIME_DEFAULT_PHASE_PCT),
    unitPrice: lime.unitPrice,
  }
}

export function createConvertingWhiteMattePlaceholder(): AntimonyMaterialColumn {
  return createMaterialColumn({
    id: CONVERTING_WHITE_MATTE_ID,
    name: CONVERTING_WHITE_MATTE_NAME,
    weight: 0,
  })
}

export function createConvertingDefaultRawMaterials(): AntimonyMaterialColumn[] {
  return [
    createConvertingWhiteMattePlaceholder(),
    ...createConvertingDefaultScrapMaterials(),
    createConvertingOxideSlagMaterial(0),
  ]
}

/** 吹炼原料库：锑锍 + 残极 + 氧化渣 + 石灰石（不含熔炼精矿/石英石） */
export function createConvertingMaterialLibrary(): AntimonyLibraryMaterial[] {
  const scraps = createConvertingDefaultScrapMaterials()
  const oxideSlag = createConvertingOxideSlagMaterial(0)
  const lime = createConvertingLimeSolventColumn(0)
  return [
    {
      id: CONVERTING_WHITE_MATTE_ID,
      name: CONVERTING_WHITE_MATTE_NAME,
      category: 'product',
      ratios: emptyAntimonyRatios(),
      unitPrice: 0,
    },
    ...scraps.map((scrap) => ({
      id: scrap.id,
      name: scrap.name,
      category: 'return' as const,
      ratios: cloneRatios(scrap.ratios),
      unitPrice: scrap.unitPrice ?? 0,
    })),
    {
      id: CONVERTING_OXIDE_SLAG_ID,
      name: CONVERTING_OXIDE_SLAG_NAME,
      category: 'return',
      ratios: cloneRatios(oxideSlag.ratios),
      unitPrice: 0,
    },
    {
      id: CONVERTING_LIME_SOLVENT_ID,
      name: CONVERTING_LIME_SOLVENT_NAME,
      category: 'flux',
      ratios: cloneRatios(lime.ratios),
      unitPrice: lime.unitPrice ?? 550,
    },
  ]
}

export function createRefiningMaterialLibrary(): AntimonyLibraryMaterial[] {
  return []
}

export function defaultMaterialLibraryForStage(
  stageId: 'sb_smelting' | 'sb_converting' | 'sb_refining'
): AntimonyLibraryMaterial[] {
  if (stageId === 'sb_converting') return createConvertingMaterialLibrary()
  if (stageId === 'sb_refining') return createRefiningMaterialLibrary()
  return createSmeltingMaterialLibrary()
}

/** 用吹炼投入列中的锑锍覆盖/写入原料库条目 */
export function upsertWhiteMatteInLibrary(
  library: AntimonyLibraryMaterial[],
  matte: AntimonyMaterialColumn
): AntimonyLibraryMaterial[] {
  const entry: AntimonyLibraryMaterial = {
    id: CONVERTING_WHITE_MATTE_ID,
    name: CONVERTING_WHITE_MATTE_NAME,
    category: 'product',
    ratios: cloneRatios(matte.ratios),
    unitPrice: matte.unitPrice ?? 0,
  }
  const index = library.findIndex(
    (item) => item.id === CONVERTING_WHITE_MATTE_ID || item.name.trim() === CONVERTING_WHITE_MATTE_NAME
  )
  if (index < 0) return [entry, ...library]
  const next = [...library]
  next[index] = entry
  return next
}

function lookupPhasePercent(phasePct: Record<string, number>, candidates: string[]): number | null {
  for (const candidate of candidates) {
    const key = candidate.trim()
    if (!key) continue
    if (phasePct[key] != null && Number.isFinite(phasePct[key])) return phasePct[key]!
    const hit = Object.entries(phasePct).find(([name]) => name.toLowerCase() === key.toLowerCase())
    if (hit && Number.isFinite(hit[1])) return hit[1]
  }
  return null
}

function mapPhasePctToRowContents(
  rows: MaterialPhaseAssistRow[],
  phasePct: Record<string, number>
): { phaseContents: Record<string, number>; otherPercent: number } {
  const phaseContents: Record<string, number> = {}
  let otherPercent = 0
  for (const row of rows) {
    if (row.kind === 'draft') continue
    const customId = row.id.startsWith('custom:') ? row.id.slice('custom:'.length) : row.id
    const pct =
      lookupPhasePercent(phasePct, [
        row.builtinKey ?? '',
        row.formula,
        row.displayLabel,
        customId,
        row.id,
        normalizeMetcalPhaseFormula(row.formula),
        row.kind === 'other' ? 'Other' : '',
      ]) ??
      (() => {
        for (const [floName, value] of Object.entries(phasePct)) {
          if (!Number.isFinite(value)) continue
          const normalized = normalizeMetcalPhaseFormula(floName)
          if (
            normalized === row.formula ||
            normalized === customId ||
            floName === row.formula ||
            floName === customId
          ) {
            return value
          }
        }
        return null
      })()
    if (pct == null || !Number.isFinite(pct)) continue
    phaseContents[row.id] = pct
    if (row.kind === 'other' || row.id === 'Other' || row.formula === 'Other') {
      otherPercent = pct
    }
  }
  if (otherPercent <= 1e-12) {
    const known = Object.entries(phaseContents)
      .filter(([key]) => key !== 'Other' && !key.toLowerCase().includes('other'))
      .reduce((sum, [, value]) => sum + value, 0)
    const residual = Math.max(0, 100 - known)
    if (residual > 1e-9) {
      const otherRow = rows.find((row) => row.kind === 'other' || row.id === 'Other')
      if (otherRow) {
        phaseContents[otherRow.id] = residual
        otherPercent = residual
      }
    }
  }
  return { phaseContents, otherPercent }
}

function isLegacyScrapPhaseRows(rows: MaterialPhaseAssistRow[] | undefined): boolean {
  if (!rows?.length) return true
  const formulas = rows
    .filter((row) => row.kind !== 'draft' && row.kind !== 'other' && row.id !== 'Other')
    .map((row) => (row.builtinKey ?? row.formula ?? row.id).trim().toLowerCase())
  if (formulas.length === 0) return true
  // 旧默认仅 Cu(+Other)；新默认含 Cu2O/Cu3As 等
  const hasScrapCompound = formulas.some(
    (formula) => formula === 'cu2o' || formula === 'cu3as' || formula === 'cu2s'
  )
  return !hasScrapCompound
}

function isLegacyOxideSlagPhaseRows(rows: MaterialPhaseAssistRow[] | undefined): boolean {
  if (!rows?.length) return true
  const formulas = rows
    .filter((row) => row.kind !== 'draft' && row.kind !== 'other' && row.id !== 'Other')
    .map((row) => (row.builtinKey ?? row.formula ?? row.id).trim().toLowerCase())
  if (formulas.length === 0) return true
  // 旧默认仅 Cu2O/PbO；新默认含 Fe3O4/BiO/SeO2 等
  const hasExpanded =
    formulas.includes('fe3o4') ||
    formulas.includes('bio') ||
    formulas.includes('seo2') ||
    formulas.includes('nio')
  return !hasExpanded
}

function createScrapPhaseSeed(material: AntimonyMaterialColumn, phasePct?: Record<string, number>): {
  rows: MaterialPhaseAssistRow[]
  result: PhaseMaterialCalcResult
  ratios: Record<AntimonyElementKey, number>
} {
  const pctSource = phasePct && Object.keys(phasePct).length > 0 ? phasePct : defaultScrapPhasePct(material.id)
  const rows = createMaterialPhaseRowsFromFormulas([...SCRAP_DEFAULT_PHASE_FORMULAS])
  const { phaseContents, otherPercent } = mapPhasePctToRowContents(rows, pctSource)
  const ratios = deriveScrapElementRatiosFromPhasePct(pctSource)
  const hasPhases = Object.values(phaseContents).some((value) => Math.abs(value) > 1e-9)
  return {
    rows,
    ratios,
    result: {
      materialId: material.id,
      materialName: material.name,
      weight: material.weight,
      phaseContents,
      unknowns: {
        'O(氧)': ratios['O(氧)'] ?? 0,
        'C (碳)': ratios['C (碳)'] ?? 0,
        'Other(其他)': ratios['Other(其他)'] ?? otherPercent,
      },
      valid: material.weight <= 0 || hasPhases,
      status: hasPhases ? 'converting-default' : undefined,
    },
  }
}

function createOxideSlagPhaseSeed(material: AntimonyMaterialColumn, phasePct?: Record<string, number>): {
  rows: MaterialPhaseAssistRow[]
  result: PhaseMaterialCalcResult
  ratios: Record<AntimonyElementKey, number>
} {
  const pctSource =
    phasePct && Object.keys(phasePct).length > 0 ? phasePct : { ...OXIDE_SLAG_DEFAULT_PHASE_PCT }
  const rows = createMaterialPhaseRowsFromFormulas([...OXIDE_SLAG_DEFAULT_PHASE_FORMULAS])
  const { phaseContents, otherPercent } = mapPhasePctToRowContents(rows, pctSource)
  const ratios = deriveScrapElementRatiosFromPhasePct(pctSource)
  const hasPhases = Object.values(phaseContents).some((value) => Math.abs(value) > 1e-9)
  return {
    rows,
    ratios,
    result: {
      materialId: material.id,
      materialName: material.name,
      weight: material.weight,
      phaseContents,
      unknowns: {
        'O(氧)': ratios['O(氧)'] ?? 0,
        'C (碳)': ratios['C (碳)'] ?? 0,
        'Other(其他)': ratios['Other(其他)'] ?? otherPercent,
      },
      valid: material.weight <= 0 || hasPhases,
      status: hasPhases ? 'converting-default' : undefined,
    },
  }
}

function isLegacyLimePhaseRows(rows: MaterialPhaseAssistRow[] | undefined): boolean {
  if (!rows?.length) return true
  const formulas = rows
    .filter((row) => row.kind !== 'draft' && row.kind !== 'other' && row.id !== 'Other')
    .map((row) => (row.builtinKey ?? row.formula ?? row.id).trim().toLowerCase())
  if (formulas.length === 0) return true
  return !(formulas.includes('caco3') || formulas.includes('mgco3'))
}

function createLimePhaseSeed(material: AntimonyMaterialColumn, phasePct?: Record<string, number>): {
  rows: MaterialPhaseAssistRow[]
  result: PhaseMaterialCalcResult
  ratios: Record<AntimonyElementKey, number>
} {
  const pctSource = phasePct && Object.keys(phasePct).length > 0 ? phasePct : { ...LIME_DEFAULT_PHASE_PCT }
  const rows = createMaterialPhaseRowsFromFormulas([...LIME_DEFAULT_PHASE_FORMULAS])
  const { phaseContents, otherPercent } = mapPhasePctToRowContents(rows, pctSource)
  const ratios = deriveScrapElementRatiosFromPhasePct(pctSource)
  const hasPhases = Object.values(phaseContents).some((value) => Math.abs(value) > 1e-9)
  return {
    rows,
    ratios,
    result: {
      materialId: material.id,
      materialName: material.name,
      weight: material.weight,
      phaseContents,
      unknowns: {
        'O(氧)': ratios['O(氧)'] ?? 0,
        'C (碳)': ratios['C (碳)'] ?? 0,
        'Other(其他)': ratios['Other(其他)'] ?? otherPercent,
      },
      valid: material.weight <= 0 || hasPhases,
      status: hasPhases ? 'converting-default' : undefined,
    },
  }
}

/**
 * 吹炼物相表编辑后：按物相 w% 反推元素 ratios，并写回 phaseBatchResults。
 * 不走元素→物相重算。
 */
export function syncConvertingMaterialFromPhases(params: {
  material: AntimonyMaterialColumn
  rows: MaterialPhaseAssistRow[]
  /** 物相总表列键（或 row.id / formula）→ w% */
  phasePctByTableKey: Record<string, number>
  status?: PhaseMaterialCalcResult['status']
}): {
  material: AntimonyMaterialColumn
  rows: MaterialPhaseAssistRow[]
  result: PhaseMaterialCalcResult
  phaseSum: number
} {
  const rows = ensureMaterialPhaseRows(params.rows, params.material)
  const phaseContents: Record<string, number> = {}
  const canonicalPct: Record<string, number> = {}
  for (const row of rows) {
    if (row.kind === 'draft') continue
    const tableKey = materialPhaseRowTableKey(row)
    const candidates = [
      tableKey ?? '',
      row.id,
      row.formula,
      row.builtinKey ?? '',
      row.kind === 'other' ? 'Other' : '',
    ].filter(Boolean)
    let pct = 0
    for (const key of candidates) {
      const value = params.phasePctByTableKey[key]
      if (value != null && Number.isFinite(value)) {
        pct = Math.max(0, value)
        break
      }
    }
    phaseContents[row.id] = pct
    const canon =
      row.kind === 'other' || row.id === 'Other'
        ? 'Other'
        : (row.builtinKey ?? row.formula ?? tableKey ?? row.id)
    canonicalPct[canon] = (canonicalPct[canon] ?? 0) + pct
  }
  const ratios = deriveScrapElementRatiosFromPhasePct(canonicalPct)
  const otherRow = rows.find((row) => row.kind === 'other' || row.id === 'Other')
  const otherPercent = otherRow ? (phaseContents[otherRow.id] ?? 0) : (canonicalPct.Other ?? 0)
  const phaseSum = Object.values(phaseContents).reduce((sum, value) => sum + value, 0)
  const hasPhases = Object.values(phaseContents).some((value) => Math.abs(value) > 1e-9)
  const sumOk = Math.abs(phaseSum - 100) <= 0.02
  return {
    material: {
      ...params.material,
      ratios,
    },
    rows,
    phaseSum,
    result: {
      materialId: params.material.id,
      materialName: params.material.name,
      weight: params.material.weight,
      phaseContents,
      unknowns: {
        'O(氧)': ratios['O(氧)'] ?? 0,
        'C (碳)': ratios['C (碳)'] ?? 0,
        'Other(其他)': ratios['Other(其他)'] ?? otherPercent,
      },
      valid: hasPhases && sumOk,
      status: params.status ?? 'converting-default',
    },
  }
}

/** 锑锍已由熔炼带回且完成物相时，吹炼 O/C 批量计算应跳过 */
export function isConvertingWhiteMattePhaseLocked(
  materialId: string,
  phaseCompletedMaterials: Record<string, boolean> | null | undefined,
  phaseBatchResults: PhaseBatchResults | null | undefined
): boolean {
  if (materialId !== CONVERTING_WHITE_MATTE_ID) return false
  if (!phaseCompletedMaterials?.[materialId]) return false
  const result = phaseBatchResults?.[materialId]
  return Boolean(result?.valid)
}

function matteCompositionToRatios(matte: OxyProductResult): Record<AntimonyElementKey, number> {
  const ratios = emptyAntimonyRatios()
  if (matte.mass > 1e-12) {
    for (const key of ANTIMONY_ELEMENT_KEYS) {
      ratios[key] = ((matte.elementMass[key] ?? 0) / matte.mass) * 100
    }
    return ratios
  }
  for (const key of ANTIMONY_ELEMENT_KEYS) {
    ratios[key] = matte.composition[key] ?? 0
  }
  return ratios
}

function buildMattePhaseSeed(matte: OxyProductResult): {
  rows: MaterialPhaseAssistRow[]
  result: PhaseMaterialCalcResult
} {
  const phaseEntries = matte.phases
    .filter((phase) => Number.isFinite(phase.pct) && Math.abs(phase.pct) > 1e-12)
    .map((phase) => ({ key: phase.key, pct: phase.pct }))
  const formulas =
    phaseEntries.length > 0
      ? phaseEntries.map((entry) => entry.key)
      : [...MATTE_DEFAULT_PHASE_FORMULAS]
  const rows = createMaterialPhaseRowsFromFormulas(formulas)
  const phaseContents: Record<string, number> = {}
  let otherPercent = 0
  for (const row of rows) {
    const candidates = [
      row.builtinKey ?? '',
      row.formula,
      row.displayLabel,
      row.id.startsWith('custom:') ? row.id.slice('custom:'.length) : row.id,
      row.id,
      row.kind === 'other' ? 'Other' : '',
    ].filter(Boolean)
    const matched = phaseEntries.find((entry) =>
      candidates.some((name) => name.toLowerCase() === entry.key.toLowerCase())
    )
    if (!matched) continue
    phaseContents[row.id] = matched.pct
    if (row.kind === 'other' || row.id === 'Other' || row.formula === 'Other') {
      otherPercent = matched.pct
    }
  }
  if (otherPercent <= 1e-12) {
    const known = Object.entries(phaseContents)
      .filter(([key]) => key !== 'Other' && !key.toLowerCase().includes('other'))
      .reduce((sum, [, value]) => sum + value, 0)
    const residual = Math.max(0, 100 - known)
    if (residual > 1e-9) {
      const otherRow = rows.find((row) => row.kind === 'other' || row.id === 'Other')
      if (otherRow) {
        phaseContents[otherRow.id] = residual
        otherPercent = residual
      }
    }
  }
  const hasPhases = Object.values(phaseContents).some((value) => Math.abs(value) > 1e-9)
  return {
    rows,
    result: {
      materialId: CONVERTING_WHITE_MATTE_ID,
      materialName: CONVERTING_WHITE_MATTE_NAME,
      weight: Math.max(0, matte.mass),
      phaseContents,
      unknowns: { 'O(氧)': 0, 'C (碳)': 0, 'Other(其他)': otherPercent },
      valid: hasPhases,
      status: hasPhases ? 'from-smelting-matte' : undefined,
      message: hasPhases ? undefined : '熔炼锑锍尚未提供可用物相',
    },
  }
}

function findScrapByIdOrName(
  materials: AntimonyMaterialColumn[],
  id: string,
  name: string
): AntimonyMaterialColumn | undefined {
  return materials.find((item) => item.id === id) ?? materials.find((item) => item.name.trim() === name)
}

/** 保证吹炼投入结构：锑锍 + 残极一/二 + 氧化渣 + 石灰石熔剂；保留已有残极用户改动 */
export function ensureConvertingFeedStructure(state: AntimonyProcessStageState): AntimonyProcessStageState {
  const next = cloneProcessStageState(state)
  const defaults = [...createConvertingDefaultScrapMaterials(), createConvertingOxideSlagMaterial(0)]
  const existingScraps = defaults.map((fallback) => {
    const found = findScrapByIdOrName(next.rawMaterials, fallback.id, fallback.name)
    if (!found) return fallback
    return {
      ...found,
      id: fallback.id,
      name: fallback.name,
      kind: 'raw' as const,
      ratios: cloneRatios(found.ratios),
    }
  })

  const existingMatte =
    next.rawMaterials.find((item) => item.id === CONVERTING_WHITE_MATTE_ID) ??
    next.rawMaterials.find((item) => item.name.trim() === CONVERTING_WHITE_MATTE_NAME)

  const whiteMatte = existingMatte
    ? {
        ...existingMatte,
        id: CONVERTING_WHITE_MATTE_ID,
        name: CONVERTING_WHITE_MATTE_NAME,
        kind: 'raw' as const,
        ratios: cloneRatios(existingMatte.ratios),
      }
    : createConvertingWhiteMattePlaceholder()

  const existingLime =
    next.solventColumns.find((item) => item.id === CONVERTING_LIME_SOLVENT_ID) ??
    next.solventColumns.find((item) => {
      const name = item.name.trim()
      return name === CONVERTING_LIME_SOLVENT_NAME || name === '石灰'
    })
  next.solventColumns = [
    existingLime
      ? {
          ...existingLime,
          id: CONVERTING_LIME_SOLVENT_ID,
          name: CONVERTING_LIME_SOLVENT_NAME,
          kind: 'solvent' as const,
          ratios: cloneRatios(existingLime.ratios),
        }
      : createConvertingLimeSolventColumn(0),
  ]

  const materialPhaseRows: Record<string, MaterialPhaseAssistRow[]> = { ...next.materialPhaseRows }
  const phaseBatchResults: PhaseBatchResults = { ...(next.phaseBatchResults ?? {}) }
  const phaseCompletedMaterials = { ...next.phaseCompletedMaterials }

  const limeColumn = next.solventColumns[0]!
  {
    const legacyRows = isLegacyLimePhaseRows(materialPhaseRows[CONVERTING_LIME_SOLVENT_ID])
    if (legacyRows || !phaseBatchResults[CONVERTING_LIME_SOLVENT_ID]) {
      const seed = createLimePhaseSeed(limeColumn)
      if (legacyRows || !materialPhaseRows[CONVERTING_LIME_SOLVENT_ID]?.length) {
        materialPhaseRows[CONVERTING_LIME_SOLVENT_ID] = seed.rows
      }
      if (legacyRows || !phaseBatchResults[CONVERTING_LIME_SOLVENT_ID]) {
        phaseBatchResults[CONVERTING_LIME_SOLVENT_ID] = seed.result
      }
      if (legacyRows) {
        next.solventColumns = [{ ...limeColumn, ratios: seed.ratios }]
      }
    }
    if (phaseBatchResults[CONVERTING_LIME_SOLVENT_ID]?.valid) {
      phaseCompletedMaterials[CONVERTING_LIME_SOLVENT_ID] = true
    }
  }

  const upgradedScraps = existingScraps.map((scrap) => {
    if (scrap.id === CONVERTING_OXIDE_SLAG_ID) {
      const legacyRows = isLegacyOxideSlagPhaseRows(materialPhaseRows[scrap.id])
      if (!legacyRows && phaseBatchResults[scrap.id]) {
        if (phaseBatchResults[scrap.id]?.valid) phaseCompletedMaterials[scrap.id] = true
        return scrap
      }
      const seed = createOxideSlagPhaseSeed(scrap)
      if (legacyRows || !materialPhaseRows[scrap.id]?.length) {
        materialPhaseRows[scrap.id] = seed.rows
      }
      if (legacyRows || !phaseBatchResults[scrap.id]) {
        phaseBatchResults[scrap.id] = seed.result
      }
      const nextScrap = legacyRows ? { ...scrap, ratios: seed.ratios } : scrap
      if (phaseBatchResults[nextScrap.id]?.valid ?? seed.result.valid) {
        phaseCompletedMaterials[nextScrap.id] = true
      }
      return nextScrap
    }

    const legacyRows = isLegacyScrapPhaseRows(materialPhaseRows[scrap.id])
    if (!legacyRows && phaseBatchResults[scrap.id]) {
      if (phaseBatchResults[scrap.id]?.valid) phaseCompletedMaterials[scrap.id] = true
      return scrap
    }

    const seed = createScrapPhaseSeed(scrap)
    if (legacyRows || !materialPhaseRows[scrap.id]?.length) {
      materialPhaseRows[scrap.id] = seed.rows
    }
    if (legacyRows || !phaseBatchResults[scrap.id]) {
      phaseBatchResults[scrap.id] = seed.result
    }
    // 旧 Cu/Other 物相或占位元素表：用物相反推结果覆盖并保留
    const nextScrap = legacyRows ? { ...scrap, ratios: seed.ratios } : scrap
    if (phaseBatchResults[nextScrap.id]?.valid ?? seed.result.valid) {
      phaseCompletedMaterials[nextScrap.id] = true
    }
    return nextScrap
  })

  next.rawMaterials = [whiteMatte, ...upgradedScraps]
  next.rawWeightDrafts = Object.fromEntries(
    next.rawMaterials.map((material) => [
      material.id,
      next.rawWeightDrafts[material.id] ?? (material.weight > 0 ? String(material.weight) : ''),
    ])
  )
  if (!materialPhaseRows[CONVERTING_WHITE_MATTE_ID]?.length) {
    materialPhaseRows[CONVERTING_WHITE_MATTE_ID] = createMaterialPhaseRowsFromFormulas([
      ...MATTE_DEFAULT_PHASE_FORMULAS,
    ])
  }

  next.materialPhaseRows = materialPhaseRows
  next.phaseBatchResults = Object.keys(phaseBatchResults).length > 0 ? phaseBatchResults : null
  next.phaseCompletedMaterials = phaseCompletedMaterials

  const library = next.materialLibrary?.length ? [...next.materialLibrary] : createConvertingMaterialLibrary()
  next.materialLibrary = upsertWhiteMatteInLibrary(library, whiteMatte)
  if (!next.phaseMaterialId || !next.rawMaterials.some((material) => material.id === next.phaseMaterialId)) {
    next.phaseMaterialId = CONVERTING_WHITE_MATTE_ID
  }
  if (!next.phaseAssistTabMaterialIds.includes(CONVERTING_WHITE_MATTE_ID)) {
    next.phaseAssistTabMaterialIds = [
      CONVERTING_WHITE_MATTE_ID,
      ...next.phaseAssistTabMaterialIds.filter((id) => id !== CONVERTING_WHITE_MATTE_ID),
    ]
  }
  return next
}

function materialFingerprint(material: AntimonyMaterialColumn | null | undefined): string {
  if (!material) return ''
  return `${material.weight.toFixed(8)}#${ANTIMONY_ELEMENT_KEYS.map((key) => `${key}:${(material.ratios[key] ?? 0).toFixed(8)}`).join('|')}`
}

function clearConvertingDownstreamResults(state: AntimonyProcessStageState): void {
  state.productCalculated = false
  state.productFilledBack = false
  state.heatBalanced = false
  state.heatBalanceFilledBack = false
  state.calculatedHeatBalance = null
}

/**
 * 用熔炼最新锑锍覆盖吹炼投入中的锑锍（质量/元素/物相）；保留残极等其余用户改动。
 * 每次切入吹炼都应调用。
 * 熔炼解为 acceptable，或已回填产出且锑锍质量>0 时均可同步（避免 relaxed 回填后吹炼侧清零）。
 */
export function syncWhiteMatteFromSmelting(
  convertingState: AntimonyProcessStageState,
  smeltingState: AntimonyProcessStageState | null | undefined
): AntimonyProcessStageState {
  const next = ensureConvertingFeedStructure(convertingState)
  const solver = smeltingState?.productSolverResult as OxyConstraintSolverResult | null | undefined
  const matteCandidate = solver?.products?.matte
  const canUseMatte =
    Boolean(matteCandidate && matteCandidate.mass > 0) &&
    Boolean(solver?.acceptable || smeltingState?.productFilledBack || smeltingState?.productCalculated)
  const matte = canUseMatte ? matteCandidate! : null

  const previousMatte = next.rawMaterials.find((item) => item.id === CONVERTING_WHITE_MATTE_ID) ?? null
  const previousFingerprint = materialFingerprint(previousMatte)
  const previousPhaseFingerprint = JSON.stringify(next.phaseBatchResults?.[CONVERTING_WHITE_MATTE_ID]?.phaseContents ?? {})

  if (!matte || matte.mass <= 0) {
    const clearedMatte = createConvertingWhiteMattePlaceholder()
    next.rawMaterials = next.rawMaterials.map((material) =>
      material.id === CONVERTING_WHITE_MATTE_ID ? clearedMatte : material
    )
    next.rawWeightDrafts[CONVERTING_WHITE_MATTE_ID] = ''
    next.materialPhaseRows[CONVERTING_WHITE_MATTE_ID] = createMaterialPhaseRowsFromFormulas([
      ...MATTE_DEFAULT_PHASE_FORMULAS,
    ])
    if (next.phaseBatchResults) {
      const { [CONVERTING_WHITE_MATTE_ID]: _removed, ...rest } = next.phaseBatchResults
      next.phaseBatchResults = Object.keys(rest).length > 0 ? rest : null
    }
    delete next.phaseCompletedMaterials[CONVERTING_WHITE_MATTE_ID]
    next.phaseCompleted = false
    if (previousFingerprint && previousFingerprint !== materialFingerprint(clearedMatte)) {
      clearConvertingDownstreamResults(next)
    }
    return next
  }

  const ratios = matteCompositionToRatios(matte)
  const phaseSeed = buildMattePhaseSeed(matte)
  const syncedMatte: AntimonyMaterialColumn = {
    id: CONVERTING_WHITE_MATTE_ID,
    name: CONVERTING_WHITE_MATTE_NAME,
    kind: 'raw',
    weight: matte.mass,
    waterWeight: 0,
    moisture: 0,
    ratios,
    unitPrice: previousMatte?.unitPrice ?? 0,
  }
  next.rawMaterials = next.rawMaterials.map((material) =>
    material.id === CONVERTING_WHITE_MATTE_ID ? syncedMatte : material
  )
  next.rawWeightDrafts[CONVERTING_WHITE_MATTE_ID] = String(matte.mass)
  next.materialPhaseRows[CONVERTING_WHITE_MATTE_ID] = phaseSeed.rows
  next.phaseBatchResults = {
    ...(next.phaseBatchResults ?? {}),
    [CONVERTING_WHITE_MATTE_ID]: phaseSeed.result,
  }
  if (phaseSeed.result.valid) {
    next.phaseCompletedMaterials[CONVERTING_WHITE_MATTE_ID] = true
  }
  next.materialLibrary = upsertWhiteMatteInLibrary(
    next.materialLibrary?.length ? next.materialLibrary : createConvertingMaterialLibrary(),
    syncedMatte
  )

  const weighedNeedPhase = next.rawMaterials.filter((material) => material.name.trim() && material.weight > 0)
  next.phaseCompleted =
    weighedNeedPhase.length > 0 &&
    weighedNeedPhase.every((material) => Boolean(next.phaseCompletedMaterials[material.id]))

  const nextFingerprint = materialFingerprint(syncedMatte)
  const nextPhaseFingerprint = JSON.stringify(phaseSeed.result.phaseContents)
  if (previousFingerprint !== nextFingerprint || previousPhaseFingerprint !== nextPhaseFingerprint) {
    clearConvertingDownstreamResults(next)
  }

  return next
}

/** 吹炼产出前检查：锑锍投料量异常偏低或未同步时给出提示（不阻断） */
export function convertingWhiteMatteFeedWarning(
  convertingState: Pick<AntimonyProcessStageState, 'rawMaterials'>,
  smeltingState?: AntimonyProcessStageState | null
): string | null {
  const matte = convertingState.rawMaterials.find((item) => item.id === CONVERTING_WHITE_MATTE_ID)
  const weight = Math.max(0, matte?.weight ?? 0)
  const smeltingMatteMass = Math.max(
    0,
    smeltingState?.productSolverResult?.products?.matte?.mass ?? 0
  )
  if (weight <= 1e-9) {
    return '吹炼锑锍投料量为 0：请先完成熔炼产出并同步锑锍，再计算吹炼产出（粗铜质量会随入炉锑量偏低）。'
  }
  if (smeltingMatteMass > 1e-6 && weight < smeltingMatteMass * 0.85) {
    return `吹炼锑锍投料 ${weight.toFixed(2)} t/h 明显低于熔炼锑锍 ${smeltingMatteMass.toFixed(2)} t/h，粗铜产出可能系统性偏低；请确认已同步熔炼结果。`
  }
  return null
}

export function createBlankConvertingProcessStageState(): AntimonyProcessStageState {
  const blank = createBlankProcessStageState()
  const rawMaterials = createConvertingDefaultRawMaterials()
  const lime = createConvertingLimeSolventColumn(0)
  const materialPhaseRows: Record<string, MaterialPhaseAssistRow[]> = {
    [CONVERTING_WHITE_MATTE_ID]: createMaterialPhaseRowsFromFormulas([...MATTE_DEFAULT_PHASE_FORMULAS]),
  }
  const phaseBatchResults: PhaseBatchResults = {}
  const phaseCompletedMaterials: Record<string, boolean> = {}
  for (const scrap of rawMaterials.filter((item) => item.id !== CONVERTING_WHITE_MATTE_ID)) {
    if (scrap.id === CONVERTING_OXIDE_SLAG_ID) {
      const seed = createOxideSlagPhaseSeed(scrap)
      materialPhaseRows[scrap.id] = seed.rows
      phaseBatchResults[scrap.id] = seed.result
      if (seed.result.valid) phaseCompletedMaterials[scrap.id] = true
      continue
    }
    const seed = createScrapPhaseSeed(scrap)
    materialPhaseRows[scrap.id] = seed.rows
    phaseBatchResults[scrap.id] = seed.result
    if (seed.result.valid) phaseCompletedMaterials[scrap.id] = true
  }
  {
    const seed = createLimePhaseSeed(lime)
    materialPhaseRows[CONVERTING_LIME_SOLVENT_ID] = seed.rows
    phaseBatchResults[CONVERTING_LIME_SOLVENT_ID] = seed.result
    if (seed.result.valid) phaseCompletedMaterials[CONVERTING_LIME_SOLVENT_ID] = true
  }
  return {
    ...blank,
    rawMaterials,
    rawWeightDrafts: Object.fromEntries(rawMaterials.map((material) => [material.id, ''])),
    solventColumns: [lime],
    airColumns: createConvertingProcessAirColumns(),
    fuelColumn: {
      ...blank.fuelColumn,
      weight: 0,
      waterWeight: 0,
      moisture: 0,
    },
    materialLibrary: createConvertingMaterialLibrary(),
    materialPhaseRows,
    phaseBatchResults,
    phaseCompletedMaterials,
    phaseCompleted: false,
    processParametersConfirmed: true,
    feedTemperature: '25',
    matteTemperature: '1250',
    slagTemperature: '1250',
    gasTemperature: '1206',
    dustTemperature: '1206',
    lossTemperature: '1206',
    coolingWaterInletTemperature: '30',
    coolingWaterOutletTemperature: '38',
    productConstraintConfig: loadOxyConvertingConstraints(),
    coolingWaterMassTh: '1400',
    otherHeatMJh: '1450',
    batchTableView: 'phase',
  }
}

export function createProcessStageStateForId(
  stageId: 'sb_smelting' | 'sb_converting' | 'sb_refining'
): AntimonyProcessStageState {
  if (stageId === 'sb_converting') return createBlankConvertingProcessStageState()
  if (stageId === 'sb_refining') {
    return {
      ...createBlankProcessStageState(),
      materialLibrary: createRefiningMaterialLibrary(),
    }
  }
  return createBlankProcessStageState()
}

type MetcalConvertingFeedLike = {
  name: string
  dryFlowTH: number | null
  elementRatios: Partial<Record<AntimonyElementKey, number>>
  phaseRatios: Record<string, number>
}

function finalizeImportedRatios(
  elementRatios: Partial<Record<AntimonyElementKey, number>>,
  phaseRatios: Record<string, number>,
  options?: { preferPhaseDerived?: boolean }
): Record<AntimonyElementKey, number> {
  const preferPhase = options?.preferPhaseDerived === true && Object.keys(phaseRatios).length > 0
  if (preferPhase) {
    return deriveScrapElementRatiosFromPhasePct(phaseRatios)
  }
  const out = emptyAntimonyRatios()
  for (const key of ANTIMONY_ELEMENT_KEYS) {
    const value = Number(elementRatios[key] ?? 0)
    out[key] = Number.isFinite(value) ? value : 0
  }
  const metcalOther = phaseRatios.Other
  if ((out['Other(其他)'] ?? 0) <= 1e-12 && metcalOther != null && Number.isFinite(metcalOther)) {
    out['Other(其他)'] = metcalOther
  }
  const known = calculateKnownTotal(out)
  out['Other(其他)'] = Math.max(0, 100 - known)
  return out
}

function mapConvertingFeedName(name: string): {
  kind: 'matte' | 'scrap1' | 'scrap2' | 'oxide' | 'lime' | 'skip'
  id: string
  displayName: string
} {
  const trimmed = name.trim()
  if (trimmed === '锑锍' || trimmed === '锑锍') {
    return { kind: 'matte', id: CONVERTING_WHITE_MATTE_ID, displayName: CONVERTING_WHITE_MATTE_NAME }
  }
  if (trimmed === '残极' || trimmed === '残极一' || trimmed === '残极1') {
    return { kind: 'scrap1', id: CONVERTING_SCRAP_1_ID, displayName: CONVERTING_SCRAP_1_NAME }
  }
  if (trimmed === '残极三' || trimmed === '残极二' || trimmed === '残极2') {
    return { kind: 'scrap2', id: CONVERTING_SCRAP_2_ID, displayName: CONVERTING_SCRAP_2_NAME }
  }
  if (trimmed === '氧化渣') {
    return { kind: 'oxide', id: CONVERTING_OXIDE_SLAG_ID, displayName: CONVERTING_OXIDE_SLAG_NAME }
  }
  if (trimmed === '石灰石' || trimmed === '石灰') {
    return { kind: 'lime', id: CONVERTING_LIME_SOLVENT_ID, displayName: CONVERTING_LIME_SOLVENT_NAME }
  }
  return { kind: 'skip', id: '', displayName: trimmed }
}

/**
 * 用 Flo 吹炼投入覆盖吹炼状态中的残极/氧化渣/石灰石组成与流量；
 * 残极按物相反推元素表并写入物相结果；锑锍仅更新库内化验占位，质量仍以熔炼同步为准。
 */
export function applyMetcalConvertingFeedsToState(
  convertingState: AntimonyProcessStageState,
  feeds: MetcalConvertingFeedLike[]
): AntimonyProcessStageState {
  let next = ensureConvertingFeedStructure(convertingState)
  if (!feeds.length) return next

  const library = [...(next.materialLibrary?.length ? next.materialLibrary : createConvertingMaterialLibrary())]
  const materialPhaseRows: Record<string, MaterialPhaseAssistRow[]> = { ...next.materialPhaseRows }
  const phaseBatchResults: PhaseBatchResults = { ...(next.phaseBatchResults ?? {}) }
  const phaseCompletedMaterials = { ...next.phaseCompletedMaterials }

  const upsertLibraryEntry = (
    id: string,
    name: string,
    category: AntimonyLibraryMaterial['category'],
    ratios: Record<AntimonyElementKey, number>,
    unitPrice = 0
  ) => {
    const entry: AntimonyLibraryMaterial = { id, name, category, ratios: cloneRatios(ratios), unitPrice }
    const index = library.findIndex((item) => item.id === id || item.name.trim() === name)
    if (index >= 0) library[index] = entry
    else library.push(entry)
  }

  for (const feed of feeds) {
    const mapped = mapConvertingFeedName(feed.name)
    if (mapped.kind === 'skip') continue
    const isScrap = mapped.kind === 'scrap1' || mapped.kind === 'scrap2'
    const preferPhaseDerived =
      (isScrap || mapped.kind === 'oxide') && Object.keys(feed.phaseRatios).length > 0
    const ratios = finalizeImportedRatios(feed.elementRatios, feed.phaseRatios, {
      preferPhaseDerived,
    })
    const weight = Math.max(0, feed.dryFlowTH ?? 0)

    if (mapped.kind === 'lime') {
      next.solventColumns = [
        {
          id: CONVERTING_LIME_SOLVENT_ID,
          name: CONVERTING_LIME_SOLVENT_NAME,
          kind: 'solvent',
          weight,
          waterWeight: 0,
          moisture: 0,
          ratios,
          unitPrice: next.solventColumns[0]?.unitPrice ?? 550,
        },
      ]
      const limeMaterial = next.solventColumns[0]!
      if (Object.keys(feed.phaseRatios).length > 0) {
        const seed = createLimePhaseSeed(limeMaterial, feed.phaseRatios)
        materialPhaseRows[CONVERTING_LIME_SOLVENT_ID] = seed.rows
        phaseBatchResults[CONVERTING_LIME_SOLVENT_ID] = {
          ...seed.result,
          status: 'metcal-import',
          weight,
        }
        next.solventColumns = [{ ...limeMaterial, ratios: seed.ratios }]
        upsertLibraryEntry(CONVERTING_LIME_SOLVENT_ID, CONVERTING_LIME_SOLVENT_NAME, 'flux', seed.ratios, 550)
        if (seed.result.valid) phaseCompletedMaterials[CONVERTING_LIME_SOLVENT_ID] = true
      } else {
        const seed = createLimePhaseSeed(limeMaterial)
        materialPhaseRows[CONVERTING_LIME_SOLVENT_ID] = seed.rows
        phaseBatchResults[CONVERTING_LIME_SOLVENT_ID] = {
          ...seed.result,
          status: 'metcal-import',
          weight,
        }
        if (seed.result.valid) phaseCompletedMaterials[CONVERTING_LIME_SOLVENT_ID] = true
        upsertLibraryEntry(CONVERTING_LIME_SOLVENT_ID, CONVERTING_LIME_SOLVENT_NAME, 'flux', ratios, 550)
      }
      continue
    }

    next.rawMaterials = next.rawMaterials.map((material) => {
      if (material.id !== mapped.id) return material
      return {
        ...material,
        name: mapped.displayName,
        kind: 'raw' as const,
        weight: mapped.kind === 'matte' ? material.weight : weight,
        ratios,
      }
    })
    if (mapped.kind !== 'matte') {
      next.rawWeightDrafts[mapped.id] = weight > 0 ? String(weight) : ''
    }
    upsertLibraryEntry(
      mapped.id,
      mapped.displayName,
      mapped.kind === 'matte' ? 'product' : 'return',
      ratios,
      next.rawMaterials.find((item) => item.id === mapped.id)?.unitPrice ?? 0
    )

    if (isScrap && Object.keys(feed.phaseRatios).length > 0) {
      const material = next.rawMaterials.find((item) => item.id === mapped.id)
      if (material) {
        const seed = createScrapPhaseSeed(material, feed.phaseRatios)
        materialPhaseRows[mapped.id] = seed.rows
        phaseBatchResults[mapped.id] = {
          ...seed.result,
          status: 'metcal-import',
          weight: material.weight,
        }
        if (material.weight > 0 && seed.result.valid) {
          phaseCompletedMaterials[mapped.id] = true
        }
        // 以物相反推元素覆盖并保留
        next.rawMaterials = next.rawMaterials.map((item) =>
          item.id === mapped.id ? { ...item, ratios: seed.ratios } : item
        )
        upsertLibraryEntry(mapped.id, mapped.displayName, 'return', seed.ratios, material.unitPrice ?? 0)
      }
    } else if (mapped.kind === 'oxide' && Object.keys(feed.phaseRatios).length > 0) {
      const material = next.rawMaterials.find((item) => item.id === mapped.id)
      if (material) {
        const seed = createOxideSlagPhaseSeed(material, feed.phaseRatios)
        materialPhaseRows[mapped.id] = seed.rows
        phaseBatchResults[mapped.id] = {
          ...seed.result,
          status: 'metcal-import',
          weight: material.weight,
        }
        if (material.weight > 0 && seed.result.valid) {
          phaseCompletedMaterials[mapped.id] = true
        }
        next.rawMaterials = next.rawMaterials.map((item) =>
          item.id === mapped.id ? { ...item, ratios: seed.ratios } : item
        )
        upsertLibraryEntry(mapped.id, mapped.displayName, 'return', seed.ratios, material.unitPrice ?? 0)
      }
    }
  }

  next.materialPhaseRows = materialPhaseRows
  next.phaseBatchResults = Object.keys(phaseBatchResults).length > 0 ? phaseBatchResults : null
  next.phaseCompletedMaterials = phaseCompletedMaterials
  next.materialLibrary = library

  const weighedNeedPhase = next.rawMaterials.filter((material) => material.name.trim() && material.weight > 0)
  next.phaseCompleted =
    weighedNeedPhase.length > 0 &&
    weighedNeedPhase.every((material) => Boolean(next.phaseCompletedMaterials[material.id]))

  return ensureConvertingFeedStructure(next)
}
