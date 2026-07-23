import type { CopperElementKey, CopperMaterialColumn, CopperRatios, WeightedComposition } from './copperWorkflowCalc.ts'
import {
  calculateKnownTotal,
  calculateWeightedComposition,
  createProcessAirColumns,
  emptyCopperRatios,
} from './copperWorkflowCalc.ts'
import { DEFAULT_COPPER_FUEL, type CopperFuelMaterial } from './copperProcessCalc.ts'
import { atomicMass, COMPOUND_MOLAR_MASS } from './atomicMass.ts'
import {
  METCAL_BLEND_STREAM_NAME,
  METCAL_FUEL_STREAM_NAMES,
  METCAL_GAS_STREAM_NAMES,
  METCAL_MIX_FEED_STREAM_NAMES,
  METCAL_SOLVENT_STREAM_NAMES,
  mapMetcalElementTable,
} from './metcalElementMap.ts'
import {
  findStreamBlocks,
  parseFloFileInfo,
  readConstraintTargetByExpr,
  type FloStreamBlock,
} from './metcalFloBinary.ts'
import type { PhaseBatchResults, PhaseMaterialCalcResult } from './copperPhaseBatchCalc.ts'
import {
  createConcentrateMaterialPhaseRows,
  createMaterialPhaseRowsFromFormulas,
  type MaterialPhaseAssistRow,
} from './copperPhaseAssist.ts'
import {
  loadOxySideBlowConstraints,
  type OxySideBlowConstraintConfig,
} from './copperConstraintConfig.ts'
import {
  OXYGEN_ENRICHMENT_EXPR,
  SLAG_FE_SIO2_EXPR,
  type CopperProcessParameters,
  DEFAULT_COPPER_PROCESS_PARAMETERS,
} from './copperProcessParameters.ts'

export interface MetcalFloFeedStream {
  name: string
  dryFlowTH: number | null
  moisturePercent: number | null
  compositionKind: 'W%' | 'E%' | null
  /** 元素 w%（由元素模板或 MetCal 元素行解析） */
  elementRatios: Partial<Record<CopperElementKey, number>>
  /** MetCal 物相 w% 原样保留 */
  phaseRatios: Record<string, number>
  sourceOffset: number
  isVariableFlow: boolean
}

export interface MetcalFloBlendResult {
  name: string
  dryFlowTH: number | null
  elementRatios: Partial<Record<CopperElementKey, number>>
  phaseRatios: Record<string, number>
  sourceOffset: number
}

export interface MetcalFloMixExtraction {
  fileInfo: ReturnType<typeof parseFloFileInfo>
  workDays: number | null
  workHours: number | null
  feeds: MetcalFloFeedStream[]
  solvents: MetcalFloFeedStream[]
  gases: MetcalFloFeedStream[]
  /** 燃料流（只取组成，导入时流量置 0） */
  fuels: MetcalFloFeedStream[]
  blend: MetcalFloBlendResult | null
  warnings: string[]
  /** 原始流块，供模板补丁使用 */
  streamBlocks: FloStreamBlock[]
}

export interface MetcalFloImportComparison {
  element: CopperElementKey
  metcalPercent: number | null
  oursPercent: number | null
  delta: number | null
}

export interface MetcalConstraintImportResult {
  config: OxySideBlowConstraintConfig
  matchedCustomExprs: string[]
  processParameters: CopperProcessParameters
  notes: string[]
}

export interface MetcalFloImportBundle {
  extraction: MetcalFloMixExtraction
  rawMaterials: CopperMaterialColumn[]
  solventColumns: CopperMaterialColumn[]
  airColumns: CopperMaterialColumn[]
  /** 煤等燃料：保留元素组成，干基流量为 0 */
  fuelColumn: CopperFuelMaterial
  recomputedBlend: WeightedComposition
  comparison: MetcalFloImportComparison[]
  constraints: MetcalConstraintImportResult
}

const DEFAULT_WORK_DAYS = 330
const DEFAULT_WORK_HOURS = 24

function decodeUtf8Loose(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes)
}

function parsePhaseTable(block: FloStreamBlock): Record<string, number> {
  const out: Record<string, number> = {}
  for (const entry of block.composition) {
    if (entry.value === 'x') continue
    const num = Number.parseFloat(entry.value)
    if (Number.isFinite(num)) out[entry.name] = num
  }
  return out
}

function isNumericFlow(flow: string | null): flow is string {
  return flow != null && flow !== 'x' && Number.isFinite(Number.parseFloat(flow))
}

function pickPrimaryBlocks(blocks: FloStreamBlock[]): Map<string, FloStreamBlock> {
  const byName = new Map<string, FloStreamBlock[]>()
  for (const block of blocks) {
    const list = byName.get(block.name) ?? []
    list.push(block)
    byName.set(block.name, list)
  }

  const chosen = new Map<string, FloStreamBlock>()
  for (const [name, list] of byName) {
    const numeric = list.filter((b) => isNumericFlow(b.flowT))
    if (numeric.length) {
      chosen.set(name, numeric.sort((a, b) => (b.composition.length - a.composition.length))[0])
      continue
    }
    const variable = list.filter((b) => b.flowT === 'x')
    if (variable.length) {
      chosen.set(name, variable.sort((a, b) => (b.composition.length - a.composition.length))[0])
    }
  }
  return chosen
}

function extractMoistureMap(text: string): Map<string, number> {
  const out = new Map<string, number>()
  for (const feed of METCAL_MIX_FEED_STREAM_NAMES) {
    const escaped = feed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const forward = new RegExp(
      `Input\\.${escaped}\\+Input\\.含水[\\s\\S]{0,160}?\\]\\D*(\\d+\\.?\\d*)/100`
    )
    const reverse = new RegExp(
      `Input\\.含水\\+Input\\.${escaped}[\\s\\S]{0,160}?\\]\\D*(\\d+\\.?\\d*)/100`
    )
    const match = text.match(forward) ?? text.match(reverse)
    if (!match) continue
    const pct = Number.parseFloat(match[1])
    if (Number.isFinite(pct)) out.set(feed, pct)
  }
  return out
}

function extractWorkTime(text: string): { workDays: number | null; workHours: number | null } {
  const annualMatch = text.match(/OutputE\.混合铜精矿\.Cu\*(\d+)\*(\d+)\/1000/)
  if (annualMatch) {
    const hours = Number.parseFloat(annualMatch[1])
    const days = Number.parseFloat(annualMatch[2])
    if (Number.isFinite(hours) && Number.isFinite(days)) {
      return { workHours: hours, workDays: days }
    }
  }
  return { workDays: null, workHours: null }
}

function elementTemplateForFeed(
  name: string,
  blocks: Map<string, FloStreamBlock>
): Partial<Record<CopperElementKey, number>> {
  const template = blocks.get(name)
  if (!template) return {}
  const hasElementKeys = template.composition.some((c) =>
    ['Cu', 'Fe', 'S', 'SiO2', 'CaO'].includes(c.name)
  )
  if (!hasElementKeys) return {}
  const table: Record<string, string> = {}
  for (const entry of template.composition) table[entry.name] = entry.value
  return mapMetcalElementTable(table)
}

function buildFeedStream(
  name: string,
  block: FloStreamBlock,
  moistureMap: Map<string, number>,
  elementTemplates: Map<string, FloStreamBlock>
): MetcalFloFeedStream {
  const phaseRatios = parsePhaseTable(block)
  const elementFromBlock = mapMetcalElementTable(
    Object.fromEntries(block.composition.map((c) => [c.name, c.value]))
  )
  const templateRatios = elementTemplateForFeed(name, elementTemplates)
  const elementRatios =
    Object.keys(templateRatios).length > 0
      ? templateRatios
      : Object.keys(elementFromBlock).length > 0
        ? elementFromBlock
        : templateRatios

  return {
    name,
    dryFlowTH: isNumericFlow(block.flowT) ? Number.parseFloat(block.flowT) : null,
    moisturePercent: moistureMap.get(name) ?? null,
    compositionKind: block.compositionKind,
    elementRatios,
    phaseRatios,
    sourceOffset: block.offset,
    isVariableFlow: block.flowT === 'x',
  }
}

export function extractMetcalFloMix(buffer: ArrayBuffer): MetcalFloMixExtraction {
  const warnings: string[] = []
  const fileInfo = parseFloFileInfo(buffer)
  if (!fileInfo.magic.includes('FLOF')) {
    warnings.push('文件魔数不是 FLOF，可能不是 MetCal 流程文件。')
  }

  const text = decodeUtf8Loose(buffer)
  const streamBlocks = findStreamBlocks(buffer)
  const primary = pickPrimaryBlocks(streamBlocks)
  const elementTemplates = new Map<string, FloStreamBlock>()
  for (const block of streamBlocks) {
    if (block.flowT === 'x') elementTemplates.set(block.name, block)
  }

  const moistureMap = extractMoistureMap(text)
  const { workDays, workHours } = extractWorkTime(text)

  const feeds: MetcalFloFeedStream[] = []
  for (const name of METCAL_MIX_FEED_STREAM_NAMES) {
    const block = primary.get(name)
    if (!block) continue
    feeds.push(buildFeedStream(name, block, moistureMap, elementTemplates))
  }

  const solvents: MetcalFloFeedStream[] = []
  for (const name of METCAL_SOLVENT_STREAM_NAMES) {
    const block = primary.get(name)
    if (!block) continue
    solvents.push(buildFeedStream(name, block, moistureMap, elementTemplates))
  }

  const gases: MetcalFloFeedStream[] = []
  for (const name of METCAL_GAS_STREAM_NAMES) {
    const gasBlock = pickGasBlock(streamBlocks, name)
    if (!gasBlock) continue
    gases.push(buildFeedStream(name, gasBlock, moistureMap, elementTemplates))
  }

  const fuels: MetcalFloFeedStream[] = []
  for (const name of METCAL_FUEL_STREAM_NAMES) {
    const block = primary.get(name)
    if (!block) continue
    fuels.push(buildFeedStream(name, block, moistureMap, elementTemplates))
  }

  const blendBlock = [...streamBlocks]
    .filter((b) => b.name === METCAL_BLEND_STREAM_NAME && isNumericFlow(b.flowT))
    .sort((a, b) => Number.parseFloat(b.flowT ?? '0') - Number.parseFloat(a.flowT ?? '0'))[0]

  let blend: MetcalFloBlendResult | null = null
  if (blendBlock) {
    blend = {
      name: METCAL_BLEND_STREAM_NAME,
      dryFlowTH: Number.parseFloat(blendBlock.flowT ?? '0'),
      elementRatios: mapMetcalElementTable(
        Object.fromEntries(blendBlock.composition.map((c) => [c.name, c.value]))
      ),
      phaseRatios: parsePhaseTable(blendBlock),
      sourceOffset: blendBlock.offset,
    }
  }

  return {
    fileInfo,
    workDays: workDays ?? DEFAULT_WORK_DAYS,
    workHours: workHours ?? DEFAULT_WORK_HOURS,
    feeds,
    solvents,
    gases,
    fuels,
    blend,
    warnings,
    streamBlocks,
  }
}

function pickGasBlock(blocks: FloStreamBlock[], name: string): FloStreamBlock | null {
  const candidates = blocks.filter((b) => b.name === name)
  if (!candidates.length) return null
  const withO2N2 = candidates.filter((b) => {
    const names = new Set(b.composition.map((c) => c.name))
    return names.has('O2') && names.has('N2')
  })
  if (withO2N2.length) {
    return withO2N2.sort((a, b) => {
      const aNum = isNumericFlow(a.flowT) ? 1 : 0
      const bNum = isNumericFlow(b.flowT) ? 1 : 0
      return bNum - aNum || b.composition.length - a.composition.length
    })[0]
  }
  const numeric = candidates.filter((b) => isNumericFlow(b.flowT))
  if (numeric.length) return numeric.sort((a, b) => b.composition.length - a.composition.length)[0]
  return candidates.sort((a, b) => b.composition.length - a.composition.length)[0]
}

export function metcalFeedsToRawMaterials(
  feeds: MetcalFloFeedStream[],
  idPrefix = 'metcal'
): CopperMaterialColumn[] {
  return feeds
    .filter((feed) => feed.dryFlowTH != null && feed.dryFlowTH > 0)
    .map((feed, index) => {
      const weight = feed.dryFlowTH ?? 0
      const moisture = feed.moisturePercent ?? 0
      const waterWeight = moisture > 0 ? (weight * moisture) / 100 : 0
      return {
        id: `${idPrefix}-${index + 1}`,
        name: feed.name,
        kind: 'raw' as const,
        weight,
        waterWeight,
        moisture,
        ratios: finalizeMetcalAssayRatios(feed.elementRatios, feed.phaseRatios),
      }
    })
}

/** 全精度闭合到 100%：已知元素合计后，Other 取残差（可先吸收 MetCal 的 Other） */
export function finalizeMetcalAssayRatios(
  ratios: Partial<Record<CopperElementKey, number>>,
  phaseRatios?: Record<string, number>
): CopperRatios {
  const out = { ...emptyCopperRatios(), ...ratios } as CopperRatios
  const metcalOther = phaseRatios?.Other
  if ((out['Other(其他)'] ?? 0) <= 1e-12 && metcalOther != null && Number.isFinite(metcalOther)) {
    out['Other(其他)'] = metcalOther
  }
  const known = calculateKnownTotal(out)
  out['Other(其他)'] = Math.max(0, 100 - known)
  return out
}

export function metcalFeedsToSolventColumns(feeds: MetcalFloFeedStream[]): CopperMaterialColumn[] {
  return feeds.map((feed, index) => {
    const weight = Math.max(0, feed.dryFlowTH ?? 0)
    const moisture = feed.moisturePercent ?? 0
    const waterWeight = moisture > 0 ? (weight * moisture) / 100 : 0
    return {
      id: `metcal-solvent-${index + 1}`,
      name: feed.name === '石灰' ? '石灰' : feed.name,
      kind: 'solvent' as const,
      weight,
      waterWeight,
      moisture,
      ratios: finalizeMetcalAssayRatios(feed.elementRatios, feed.phaseRatios),
    }
  })
}

function gasRoleForName(name: string): CopperMaterialColumn['airRole'] {
  if (name.includes('氧')) return 'oxygen'
  if (name.includes('二次')) return 'secondary'
  if (name.includes('漏风')) return 'feed_leak'
  return 'air'
}

function gasRatiosFromFeed(feed: MetcalFloFeedStream, fallback: CopperMaterialColumn): CopperRatios {
  const o2 = feed.phaseRatios.O2 ?? feed.elementRatios['O(氧)']
  const n2 = feed.phaseRatios.N2 ?? feed.elementRatios['N(氮)']
  if (o2 != null && n2 != null && o2 + n2 > 1e-9) {
    const dry = o2 + n2
    return {
      ...emptyCopperRatios(),
      'O(氧)': (o2 / dry) * 100,
      'N(氮)': (n2 / dry) * 100,
      'H(氢)': 0,
      'Other(其他)': 0,
    }
  }
  return { ...fallback.ratios }
}

export function metcalFeedsToAirColumns(feeds: MetcalFloFeedStream[]): CopperMaterialColumn[] {
  const defaults = createProcessAirColumns()
  return defaults.map((column) => {
    const role = column.airRole
    const feed =
      feeds.find((item) => gasRoleForName(item.name) === role) ??
      feeds.find((item) => item.name === column.name) ??
      null
    if (!feed) return { ...column, ratios: { ...column.ratios } }

    const hasGasComp =
      (feed.phaseRatios.O2 != null && feed.phaseRatios.N2 != null) ||
      (feed.elementRatios['O(氧)'] != null && feed.elementRatios['N(氮)'] != null)
    const ratios = hasGasComp ? gasRatiosFromFeed(feed, column) : { ...column.ratios }
    const o2 = feed.phaseRatios.O2
    const n2 = feed.phaseRatios.N2
    const h2o = feed.phaseRatios.H2O
    const dry = (o2 ?? 0) + (n2 ?? 0)
    const moisture =
      hasGasComp && h2o != null && dry > 0 ? (h2o / dry) * 100 : column.moisture ?? 0
    const weight = Math.max(0, feed.dryFlowTH ?? 0)
    const waterWeight = moisture > 0 ? (weight * moisture) / 100 : 0
    return {
      ...column,
      name: feed.name || column.name,
      weight,
      moisture,
      waterWeight,
      ratios,
    }
  })
}

/** MetCal 煤组成常含 Fe2O3，本软件燃料列按 Fe 计 */
function fuelRatiosFromMetcalFeed(feed: MetcalFloFeedStream): CopperRatios {
  const ratios: Partial<Record<CopperElementKey, number>> = { ...feed.elementRatios }
  const fe2o3 = feed.phaseRatios.Fe2O3
  if ((ratios['Fe(铁)'] ?? 0) <= 1e-12 && fe2o3 != null && Number.isFinite(fe2o3) && fe2o3 > 0) {
    ratios['Fe(铁)'] = fe2o3 * ((2 * atomicMass('Fe')) / COMPOUND_MOLAR_MASS.Fe2O3)
  }
  return finalizeMetcalAssayRatios(ratios, feed.phaseRatios)
}

function estimateFuelAshPercent(feed: MetcalFloFeedStream, ratios: CopperRatios): number {
  const oxideAsh =
    (feed.phaseRatios.Fe2O3 ?? 0) +
    (feed.phaseRatios.SiO2 ?? ratios['SiO₂(二氧化硅)'] ?? 0) +
    (feed.phaseRatios.CaO ?? ratios['CaO(氧化钙)'] ?? 0) +
    (feed.phaseRatios.MgO ?? ratios['MgO(氧化镁)'] ?? 0) +
    (feed.phaseRatios.Al2O3 ?? ratios['Al₂O₃(三氧化二铝)'] ?? 0)
  if (oxideAsh > 1e-9) return oxideAsh
  return DEFAULT_COPPER_FUEL.ash
}

/** 优先取「煤」，其次粉煤/焦粉；只导入元素组成，干基流量固定为 0 */
export function metcalFuelsToFuelColumn(fuels: MetcalFloFeedStream[]): CopperFuelMaterial {
  const preferred =
    METCAL_FUEL_STREAM_NAMES.map((name) => fuels.find((item) => item.name === name)).find(Boolean) ??
    fuels[0] ??
    null
  if (!preferred) {
    return {
      ...DEFAULT_COPPER_FUEL,
      ratios: { ...DEFAULT_COPPER_FUEL.ratios },
      weight: 0,
      waterWeight: 0,
    }
  }
  const ratios = fuelRatiosFromMetcalFeed(preferred)
  const moisture = preferred.moisturePercent ?? DEFAULT_COPPER_FUEL.moisture
  return {
    ...DEFAULT_COPPER_FUEL,
    id: 'fuel-coal',
    name: preferred.name === '粉煤' || preferred.name === '焦粉' ? preferred.name : '煤',
    kind: 'fuel',
    weight: 0,
    waterWeight: 0,
    moisture,
    ash: estimateFuelAshPercent(preferred, ratios),
    ratios,
  }
}

export function extractMetcalConstraintImport(buffer: ArrayBuffer): MetcalConstraintImportResult {
  const base = loadOxySideBlowConstraints()
  const config: OxySideBlowConstraintConfig = {
    ...base,
    customConstraints: base.customConstraints.map((entry) => ({ ...entry })),
    elementDistributions: base.elementDistributions.map((entry) => ({
      element: entry.element,
      rules: entry.rules.map((rule) => ({ ...rule })),
    })),
  }
  const matchedCustomExprs: string[] = []
  const processParameters: CopperProcessParameters = { ...DEFAULT_COPPER_PROCESS_PARAMETERS }

  for (const entry of config.customConstraints) {
    const expr = entry.expr?.trim()
    if (!expr) continue
    const target = readConstraintTargetByExpr(buffer, expr)
    if (target == null || !Number.isFinite(target)) continue
    entry.target = target
    matchedCustomExprs.push(expr)
  }

  const feSi = readConstraintTargetByExpr(buffer, SLAG_FE_SIO2_EXPR)
  if (feSi != null && Number.isFinite(feSi) && feSi > 0) {
    processParameters.feSiO2 = feSi
  }

  const oxy = readConstraintTargetByExpr(buffer, OXYGEN_ENRICHMENT_EXPR)
  if (oxy != null && Number.isFinite(oxy) && oxy > 0) {
    processParameters.oxygenEnrichmentPct = oxy <= 1.5 ? oxy * 100 : oxy
  }

  return { config, matchedCustomExprs, processParameters, notes: [] }
}

export function compareBlendCompositions(
  metcal: Partial<Record<CopperElementKey, number>>,
  ours: Partial<Record<CopperElementKey, number>>,
  keys: CopperElementKey[]
): MetcalFloImportComparison[] {
  return keys
    .map((element) => {
      const metcalPercent = metcal[element] ?? null
      const oursPercent = ours[element] ?? null
      const delta =
        metcalPercent != null && oursPercent != null ? oursPercent - metcalPercent : null
      return { element, metcalPercent, oursPercent, delta }
    })
    .filter((row) => row.metcalPercent != null || row.oursPercent != null)
}

export function buildMetcalFloImportBundle(buffer: ArrayBuffer): MetcalFloImportBundle {
  const extraction = extractMetcalFloMix(buffer)
  const rawMaterials = metcalFeedsToRawMaterials(extraction.feeds)
  const solventColumns = metcalFeedsToSolventColumns(extraction.solvents)
  const airColumns = metcalFeedsToAirColumns(extraction.gases)
  const fuelColumn = metcalFuelsToFuelColumn(extraction.fuels)
  const recomputedBlend = calculateWeightedComposition(rawMaterials)
  const constraints = extractMetcalConstraintImport(buffer)

  const comparisonKeys = [
    'Cu(铜)',
    'Fe(铁)',
    'S (硫)',
    'SiO₂(二氧化硅)',
    'CaO(氧化钙)',
    'MgO(氧化镁)',
    'Pb(铅)',
    'Zn(锌)',
    'As(砷)',
  ] as CopperElementKey[]

  const comparison = compareBlendCompositions(
    extraction.blend?.elementRatios ?? {},
    recomputedBlend.ratios,
    comparisonKeys
  )

  return {
    extraction,
    rawMaterials,
    solventColumns,
    airColumns,
    fuelColumn,
    recomputedBlend,
    comparison,
    constraints,
  }
}

export type MetcalImportedPhaseState = {
  phaseBatchResults: PhaseBatchResults
  materialPhaseRows: Record<string, MaterialPhaseAssistRow[]>
  phaseCompletedMaterials: Record<string, boolean>
  phaseCompleted: boolean
}

function lookupMetcalPhasePercent(phaseRatios: Record<string, number>, candidates: string[]): number | null {
  for (const candidate of candidates) {
    const key = candidate.trim()
    if (!key) continue
    if (phaseRatios[key] != null && Number.isFinite(phaseRatios[key])) return phaseRatios[key]
    const hit = Object.entries(phaseRatios).find(([name]) => name.toLowerCase() === key.toLowerCase())
    if (hit && Number.isFinite(hit[1])) return hit[1]
  }
  return null
}

/** 用 MetCal 各路进料物相回填本软件物相结果，使导入案例可跳过物相计算步骤 */
export function buildMetcalImportedPhaseState(
  materials: CopperMaterialColumn[],
  feeds: MetcalFloFeedStream[]
): MetcalImportedPhaseState {
  const phaseBatchResults: PhaseBatchResults = {}
  const materialPhaseRows: Record<string, MaterialPhaseAssistRow[]> = {}
  const phaseCompletedMaterials: Record<string, boolean> = {}

  for (const material of materials) {
    const feed = feeds.find((item) => item.name === material.name)
    const phaseRatios = feed?.phaseRatios ?? {}
    const formulas = Object.entries(phaseRatios)
      .filter(([, value]) => Number.isFinite(value) && value > 1e-9)
      .map(([name]) => name)
    const rows =
      formulas.length > 0
        ? createMaterialPhaseRowsFromFormulas(formulas)
        : createConcentrateMaterialPhaseRows()
    materialPhaseRows[material.id] = rows

    const phaseContents: Record<string, number> = {}
    for (const row of rows) {
      if (row.kind === 'other' || row.kind === 'draft') continue
      const customId = row.id.startsWith('custom:') ? row.id.slice('custom:'.length) : row.id
      const pct = lookupMetcalPhasePercent(phaseRatios, [
        row.builtinKey ?? '',
        row.formula,
        row.displayLabel,
        customId,
        row.id,
      ])
      if (pct != null && pct > 0) phaseContents[row.id] = pct
    }

    const hasPhases = Object.values(phaseContents).some((value) => value > 1e-9)
    const result: PhaseMaterialCalcResult = {
      materialId: material.id,
      materialName: material.name,
      weight: material.weight,
      phaseContents,
      unknowns: { 'O(氧)': 0, 'C (碳)': 0, 'Other(其他)': 0 },
      valid: hasPhases,
      status: hasPhases ? 'metcal-import' : undefined,
      message: hasPhases ? undefined : 'MetCal 未提供可用物相',
    }
    phaseBatchResults[material.id] = result
    if (hasPhases) phaseCompletedMaterials[material.id] = true
  }

  const phaseCompleted =
    materials.length > 0 && materials.every((material) => phaseCompletedMaterials[material.id])

  return { phaseBatchResults, materialPhaseRows, phaseCompletedMaterials, phaseCompleted }
}

/** 预览表可见元素列：有含量的元素按标准顺序排列 */
export function visibleMetcalImportElementKeys(materials: CopperMaterialColumn[]): CopperElementKey[] {
  const present = new Set<CopperElementKey>()
  for (const material of materials) {
    for (const [key, value] of Object.entries(material.ratios ?? {})) {
      if (Number.isFinite(value) && Math.abs(value as number) > 1e-9) {
        present.add(key as CopperElementKey)
      }
    }
  }
  const preferred: CopperElementKey[] = [
    'Cu(铜)',
    'S (硫)',
    'Fe(铁)',
    'SiO₂(二氧化硅)',
    'CaO(氧化钙)',
    'MgO(氧化镁)',
    'Al₂O₃(三氧化二铝)',
    'Pb(铅)',
    'Zn(锌)',
    'As(砷)',
    'Ag(银)',
    'Au(金)',
    'C (碳)',
    'H(氢)',
    'O(氧)',
    'N(氮)',
  ]
  const ordered = preferred.filter((key) => present.has(key))
  for (const key of present) {
    if (!ordered.includes(key) && key !== 'Other(其他)') {
      ordered.push(key)
    }
  }
  if (present.has('Other(其他)') || materials.some((m) => (m.ratios['Other(其他)'] ?? 0) > 1e-12)) {
    ordered.push('Other(其他)')
  }
  return ordered
}

export function summarizeMetcalFloExtraction(extraction: MetcalFloMixExtraction): string {
  const lines: string[] = []
  lines.push(`文件：${extraction.fileInfo.magic || '未知'} (${extraction.fileInfo.size} 字节)`)
  lines.push(
    `作业时间：${extraction.workDays ?? '?'} 天 × ${extraction.workHours ?? '?'} h`
  )
  lines.push('混料进料：')
  for (const feed of extraction.feeds) {
    lines.push(
      `  - ${feed.name}：${feed.dryFlowTH?.toFixed(3) ?? '变量'} t/h 干基，水分 ${feed.moisturePercent?.toFixed(2) ?? '?'}%`
    )
  }
  if (extraction.blend) {
    lines.push(
      `混合铜精矿：${extraction.blend.dryFlowTH?.toFixed(3) ?? '?'} t/h；Cu ${extraction.blend.elementRatios['Cu(铜)']?.toFixed(2) ?? '?'}%`
    )
  }
  if (extraction.warnings.length) {
    lines.push('提示：')
    for (const w of extraction.warnings) lines.push(`  - ${w}`)
  }
  return lines.join('\n')
}
