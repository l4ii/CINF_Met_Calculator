import type { CopperElementKey, CopperMaterialColumn, CopperRatios, WeightedComposition } from './copperWorkflowCalc.ts'
import {
  calculateKnownTotal,
  calculateWeightedComposition,
  createConvertingProcessAirColumns,
  createProcessAirColumns,
  deriveDryBasisMoisturePercent,
  emptyCopperRatios,
  materialWaterWeight,
  partitionRawMixMaterials,
} from './copperWorkflowCalc.ts'
import { DEFAULT_COPPER_FUEL, type CopperFuelMaterial } from './copperProcessCalc.ts'
import { atomicMass, COMPOUND_MOLAR_MASS } from './atomicMass.ts'
import {
  METCAL_BLEND_STREAM_NAME,
  METCAL_FUEL_STREAM_NAMES,
  METCAL_GAS_STREAM_NAMES,
  METCAL_MIX_FEED_STREAM_NAMES,
  METCAL_MIX_OTHER_STREAM_NAMES,
  METCAL_SOLVENT_STREAM_NAMES,
  mapMetcalElementTable,
} from './metcalElementMap.ts'
import {
  extractMetcalConvertingUnitInputs,
  extractMetcalSmeltingUnitInputs,
  findStreamBlocks,
  parseFloFileInfo,
  type FloStreamBlock,
  type MetcalConvertingUnitInputs,
  type MetcalSmeltingUnitInputs,
} from './metcalFloBinary.ts'
import type { PhaseBatchResults, PhaseMaterialCalcResult } from './copperPhaseBatchCalc.ts'
import {
  createConcentrateMaterialPhaseRows,
  createMaterialPhaseRowsFromFormulas,
  type MaterialPhaseAssistRow,
} from './copperPhaseAssist.ts'
import { normalizeMetcalPhaseFormula, validatePhaseFormulaInput } from './chemicalFormula.ts'
import { COPPER_BUILTIN_PHASE_FRACTIONS } from './copperPhaseStoichiometry.ts'
import {
  extractMetcalConstraintImport,
  extractMetcalConvertingConstraintImport,
  type MetcalConstraintImportResult,
  type MetcalConvertingConstraintImportResult,
} from './metcalFloConstraintExtract.ts'
import {
  extractMetcalFloConvertingProductResults,
  extractMetcalFloProductResults,
  enrichMetcalProductLossFromDistributions,
  type MetcalFloProductExtraction,
} from './metcalFloResultExtract.ts'

export type { MetcalConstraintImportResult, MetcalConvertingConstraintImportResult }
export {
  extractMetcalConstraintImport,
  extractMetcalConvertingConstraintImport,
} from './metcalFloConstraintExtract.ts'

export interface MetcalFloFeedStream {
  name: string
  dryFlowTH: number | null
  /** MetCal 湿基水分 %：含水/(干料+含水)×100；导入时再换算为含水 t/h 与本软件干基水分% */
  moisturePercent: number | null
  compositionKind: 'W%' | 'E%' | 'V%' | null
  /** 元素 w%（由元素模板或 MetCal 元素行解析） */
  elementRatios: Partial<Record<CopperElementKey, number>>
  /** MetCal 物相 w% / 气体 V% 原样保留 */
  phaseRatios: Record<string, number>
  sourceOffset: number
  isVariableFlow: boolean
  /** concentrate=精矿白名单；other=渣精矿/吹炼渣等入炉其他固体 */
  feedGroup?: 'concentrate' | 'other'
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
  /** 侧吹熔炼炉投入名单；用于过滤吹炼专用熔剂（如石灰石） */
  smeltingUnit: MetcalSmeltingUnitInputs | null
  /** 吹炼炉投入名单与流组成（残极/氧化渣/石灰石等） */
  convertingUnit: MetcalConvertingUnitInputs | null
  convertingFeeds: MetcalFloFeedStream[]
  /** 吹炼气体组成（空气/氧气/漏风），用于写入吹炼气体列元素含量 */
  convertingGases: MetcalFloFeedStream[]
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
  /** 吹炼炉元素/自定义约束（导入时写入 cu_converting） */
  convertingConstraints: MetcalConvertingConstraintImportResult
  /** MetCal 熔炼产出结果（只读对照，不自动回填为本软件计算结果） */
  productResults: MetcalFloProductExtraction
  /** MetCal 吹炼产出结果（粗铜/吹炼渣/烟气/含尘，写入 cu_converting.metcalProductResult） */
  convertingProductResults: MetcalFloProductExtraction
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
  const names = [...METCAL_MIX_FEED_STREAM_NAMES, ...METCAL_MIX_OTHER_STREAM_NAMES]
  for (const feed of names) {
    const escaped = feed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    // MetCal：Input.含水 / [Input.精矿 + Input.含水] = 湿基水分% / 100
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

/** MetCal 湿基水分% → 含水质量：water = dry × w / (100 − w) */
export function waterWeightFromMetcalWetMoisturePercent(
  dryWeight: number,
  wetMoisturePercent: number
): number {
  const dry = Math.max(0, dryWeight)
  const wetPct = Math.max(0, wetMoisturePercent)
  if (dry <= 0 || wetPct <= 0 || wetPct >= 100) return 0
  return dry * (wetPct / (100 - wetPct))
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
  elementTemplates: Map<string, FloStreamBlock>,
  feedGroup: 'concentrate' | 'other' = 'concentrate'
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
    feedGroup,
  }
}

function filterNamesBySmeltingInputs<T extends string>(
  candidates: readonly T[],
  smeltingUnit: MetcalSmeltingUnitInputs | null
): T[] {
  if (!smeltingUnit) return [...candidates]
  const allowed = new Set(smeltingUnit.inputNames)
  return candidates.filter((name) => allowed.has(name))
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
  const smeltingUnit = extractMetcalSmeltingUnitInputs(buffer)
  if (smeltingUnit) {
    warnings.push(
      `已按${smeltingUnit.unitName}投入读取混料（${smeltingUnit.inputNames.length} 路）；吹炼等后续工序投入已忽略。`
    )
  } else {
    warnings.push('未定位到侧吹熔炼炉单元，熔剂/气体按全文件流名回退读取。')
  }

  const convertingUnit = extractMetcalConvertingUnitInputs(buffer)
  const convertingFeeds: MetcalFloFeedStream[] = []
  const convertingGases: MetcalFloFeedStream[] = []
  if (convertingUnit) {
    const convertingGasOrUtility = new Set(['空气', '氧气', '漏风', '冷却水', '二次风', '一次风'])
    for (const name of convertingUnit.inputNames) {
      const block =
        [...streamBlocks]
          .filter(
            (item) =>
              item.name === name &&
              item.offset >= convertingUnit.start &&
              item.offset < convertingUnit.end
          )
          .sort((a, b) => a.offset - b.offset)[0] ?? primary.get(name)
      if (!block) continue
      if (convertingGasOrUtility.has(name)) {
        if (name === '空气' || name === '氧气' || name === '漏风' || name === '二次风') {
          convertingGases.push(buildFeedStream(name, block, moistureMap, elementTemplates))
        }
        continue
      }
      convertingFeeds.push(buildFeedStream(name, block, moistureMap, elementTemplates))
    }
    warnings.push(
      `已解析${convertingUnit.unitName}投入 ${convertingFeeds.length} 路（将写入吹炼原料库，不含熔炼混料）。`
    )
    if (convertingGases.length > 0) {
      warnings.push(`已解析吹炼气体组成 ${convertingGases.length} 路（空气/氧气/漏风）。`)
    }
  }

  const feeds: MetcalFloFeedStream[] = []
  for (const name of METCAL_MIX_FEED_STREAM_NAMES) {
    const block = primary.get(name)
    if (!block) continue
    feeds.push(buildFeedStream(name, block, moistureMap, elementTemplates, 'concentrate'))
  }

  const otherNames = filterNamesBySmeltingInputs(METCAL_MIX_OTHER_STREAM_NAMES, smeltingUnit)
  const otherFeeds: MetcalFloFeedStream[] = []
  for (const name of otherNames) {
    const inSmelting = [...streamBlocks].filter(
      (item) =>
        item.name === name &&
        (!smeltingUnit || (item.offset >= smeltingUnit.start && item.offset < smeltingUnit.end)) &&
        isNumericFlow(item.flowT)
    )
    const block =
      inSmelting.sort(
        (a, b) => Number.parseFloat(a.flowT ?? '0') - Number.parseFloat(b.flowT ?? '0')
      )[0] ?? // 熔炼段内取流量较小/较早的入炉块，避免误取吹炼大流量同名流
      inSmelting[0] ??
      primary.get(name)
    if (!block || !isNumericFlow(block.flowT)) continue
    // 若只能落到熔炼段外的同名流，跳过（防止把吹炼渣产出当入炉）
    if (smeltingUnit && (block.offset < smeltingUnit.start || block.offset >= smeltingUnit.end)) {
      warnings.push(`「${name}」未在熔炼单元范围内找到有效流量块，已跳过。`)
      continue
    }
    const feed = buildFeedStream(name, block, moistureMap, elementTemplates, 'other')
    if ((feed.dryFlowTH ?? 0) <= 0) continue
    otherFeeds.push(feed)
    feeds.push(feed)
  }
  if (otherFeeds.length > 0) {
    warnings.push(
      `已读取入炉其他固体 ${otherFeeds.length} 路（${otherFeeds.map((f) => f.name).join('、')}），归入混料「其他」（不计入混合铜精矿）。`
    )
  }
  const skippedOther = METCAL_MIX_OTHER_STREAM_NAMES.filter(
    (name) => !otherNames.includes(name) && primary.has(name)
  )
  if (skippedOther.length > 0) {
    warnings.push(`已跳过非熔炼投入其他固体：${skippedOther.join('、')}。`)
  }

  const solventNames = filterNamesBySmeltingInputs(METCAL_SOLVENT_STREAM_NAMES, smeltingUnit)
  const skippedSolvents = METCAL_SOLVENT_STREAM_NAMES.filter(
    (name) => !solventNames.includes(name) && primary.has(name)
  )
  if (skippedSolvents.length > 0) {
    warnings.push(`已跳过非熔炼投入熔剂：${skippedSolvents.join('、')}（多见于吹炼步骤）。`)
  }

  const solvents: MetcalFloFeedStream[] = []
  for (const name of solventNames) {
    const block = primary.get(name)
    if (!block) continue
    solvents.push(buildFeedStream(name, block, moistureMap, elementTemplates))
  }

  const gasNames = filterNamesBySmeltingInputs(METCAL_GAS_STREAM_NAMES, smeltingUnit)
  const gases: MetcalFloFeedStream[] = []
  for (const name of gasNames) {
    const gasBlock = pickGasBlock(streamBlocks, name, smeltingUnit)
    if (!gasBlock) continue
    gases.push(buildFeedStream(name, gasBlock, moistureMap, elementTemplates))
  }

  const fuelNames = filterNamesBySmeltingInputs(METCAL_FUEL_STREAM_NAMES, smeltingUnit)
  const fuels: MetcalFloFeedStream[] = []
  for (const name of fuelNames) {
    const block = primary.get(name)
    if (!block) continue
    fuels.push(buildFeedStream(name, block, moistureMap, elementTemplates))
  }
  // 熔炼单元未写明煤名时，仍尝试全文件燃料组成，避免导入后缺煤化验
  if (fuels.length === 0) {
    for (const name of METCAL_FUEL_STREAM_NAMES) {
      const block = primary.get(name)
      if (!block) continue
      fuels.push(buildFeedStream(name, block, moistureMap, elementTemplates))
    }
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
    smeltingUnit,
    convertingUnit,
    convertingFeeds,
    convertingGases,
    warnings,
    streamBlocks,
  }
}

/** 气体优先取熔炼单元内 V%（O₂/N₂）块；禁止回退到同名固体 W%（否则会把烟尘/冰铜组成误读成氧气） */
function pickGasBlock(
  blocks: FloStreamBlock[],
  name: string,
  smeltingUnit: MetcalSmeltingUnitInputs | null
): FloStreamBlock | null {
  const candidates = blocks.filter((b) => b.name === name)
  if (!candidates.length) return null

  const inUnit = (block: FloStreamBlock) =>
    !smeltingUnit || (block.offset >= smeltingUnit.start && block.offset < smeltingUnit.end)

  const isGasVolumeComp = (block: FloStreamBlock) => {
    const names = new Set(block.composition.map((c) => c.name))
    return (
      (block.compositionKind === 'V%' || names.has('O2') || names.has('N2')) &&
      names.has('O2') &&
      names.has('N2')
    )
  }

  const volumeBlocks = candidates.filter(isGasVolumeComp)
  const scoped = volumeBlocks.filter(inUnit)
  const pool = scoped.length ? scoped : volumeBlocks
  if (!pool.length) return null

  return pool.sort((a, b) => {
    const aVol = a.compositionKind === 'V%' ? 1 : 0
    const bVol = b.compositionKind === 'V%' ? 1 : 0
    const aNum = isNumericFlow(a.flowNm3) || isNumericFlow(a.flowT) ? 1 : 0
    const bNum = isNumericFlow(b.flowNm3) || isNumericFlow(b.flowT) ? 1 : 0
    const aUnit = inUnit(a) ? 1 : 0
    const bUnit = inUnit(b) ? 1 : 0
    return bUnit - aUnit || bVol - aVol || bNum - aNum || b.composition.length - a.composition.length
  })[0]
}

export function metcalFeedsToRawMaterials(
  feeds: MetcalFloFeedStream[],
  idPrefix = 'metcal'
): CopperMaterialColumn[] {
  return feeds
    .filter((feed) => feed.dryFlowTH != null && feed.dryFlowTH > 0)
    .map((feed, index) => {
      const weight = feed.dryFlowTH ?? 0
      const wetMoisturePercent = feed.moisturePercent ?? 0
      const waterWeight = waterWeightFromMetcalWetMoisturePercent(weight, wetMoisturePercent)
      const moisture = deriveDryBasisMoisturePercent(weight, waterWeight)
      return {
        id: `${idPrefix}-${index + 1}`,
        name: feed.name,
        kind: 'raw' as const,
        mixGroup: feed.feedGroup === 'other' ? ('other' as const) : ('concentrate' as const),
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
  const majors: CopperElementKey[] = [
    'Cu(铜)',
    'Fe(铁)',
    'S (硫)',
    'SiO₂(二氧化硅)',
    'CaO(氧化钙)',
    'MgO(氧化镁)',
    'Al₂O₃(三氧化二铝)',
  ]
  const hasMajorAssay = majors.some((key) => (ratios[key] ?? 0) > 0.05)
  const derived =
    !hasMajorAssay && phaseRatios && Object.keys(phaseRatios).length > 0
      ? deriveElementRatiosFromPhaseRatios(phaseRatios)
      : {}
  const out = { ...emptyCopperRatios(), ...ratios } as CopperRatios
  if (Object.keys(derived).length > 0) {
    for (const [key, value] of Object.entries(derived) as [CopperElementKey, number][]) {
      if (!Number.isFinite(value)) continue
      // 主量与氧化物当量以物相推导为准；原 Flo 微量元素保留
      if (majors.includes(key) || (out[key] ?? 0) <= 1e-9) out[key] = value
    }
  }
  const metcalOther = phaseRatios?.Other
  if ((out['Other(其他)'] ?? 0) <= 1e-12 && metcalOther != null && Number.isFinite(metcalOther)) {
    out['Other(其他)'] = metcalOther
  }
  const known = calculateKnownTotal(out)
  out['Other(其他)'] = Math.max(0, 100 - known)
  return out
}

/** 由物相 w% 推导元素/氧化物当量 w%（渣精矿等 Flo 仅有 W% 时用） */
export function deriveElementRatiosFromPhaseRatios(
  phaseRatios: Record<string, number>,
  options?: { includeOxygen?: boolean }
): Partial<Record<CopperElementKey, number>> {
  const includeOxygen = options?.includeOxygen === true
  const out: Partial<Record<CopperElementKey, number>> = {}
  for (const [rawName, pct] of Object.entries(phaseRatios)) {
    if (!Number.isFinite(pct) || pct <= 1e-12) continue
    if (rawName === 'Other' || rawName.toLowerCase() === 'other') {
      out['Other(其他)'] = (out['Other(其他)'] ?? 0) + pct
      continue
    }
    const normalized = normalizeMetcalPhaseFormula(rawName) || rawName
    const fractions =
      (COPPER_BUILTIN_PHASE_FRACTIONS[rawName] as Partial<Record<CopperElementKey, number>> | undefined) ??
      (COPPER_BUILTIN_PHASE_FRACTIONS[normalized] as Partial<Record<CopperElementKey, number>> | undefined) ??
      (() => {
        const parsed = validatePhaseFormulaInput(normalized)
        return parsed.ok ? parsed.elementFractions : {}
      })()
    for (const [el, frac] of Object.entries(fractions) as [CopperElementKey, number][]) {
      if (!Number.isFinite(frac)) continue
      // 化验表按金属+氧化物当量合计；SiO₂/CaO 等已含氧，再计 O(氧) 会重复（如 Fe₂SiO₄ 合计>100%）
      // 残极 Cu₂O 等无氧化物当量列时需计入 O(氧)
      if (el === 'N(氮)') continue
      if (el === 'O(氧)' && !includeOxygen) continue
      out[el] = (out[el] ?? 0) + pct * frac
    }
  }
  return out
}

/** 只导入熔剂元素组成；投料量由产出计算回填，干基/水分固定为 0 */
export function metcalFeedsToSolventColumns(feeds: MetcalFloFeedStream[]): CopperMaterialColumn[] {
  return feeds.map((feed, index) => {
    return {
      id: `metcal-solvent-${index + 1}`,
      name: feed.name === '石灰' ? '石灰' : feed.name,
      kind: 'solvent' as const,
      weight: 0,
      waterWeight: 0,
      moisture: 0,
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
    // Flo 气体相表为 V%；换算为干基质量分数写入元素表
    const o2Mass = o2 * COMPOUND_MOLAR_MASS.O2
    const n2Mass = n2 * COMPOUND_MOLAR_MASS.N2
    const dryMass = o2Mass + n2Mass
    return {
      ...emptyCopperRatios(),
      'O(氧)': dryMass > 0 ? (o2Mass / dryMass) * 100 : 0,
      'N(氮)': dryMass > 0 ? (n2Mass / dryMass) * 100 : 0,
      'H(氢)': 0,
      'Other(其他)': 0,
    }
  }
  return { ...fallback.ratios }
}

export function metcalFeedsToAirColumns(
  feeds: MetcalFloFeedStream[],
  options?: { includeSecondaryAir?: boolean }
): CopperMaterialColumn[] {
  const defaults =
    options?.includeSecondaryAir === false ? createConvertingProcessAirColumns() : createProcessAirColumns()
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
    // V% → 干基含水率：H₂O 质量 / (O₂+N₂) 质量
    const moisture =
      hasGasComp && h2o != null && o2 != null && n2 != null && o2 + n2 > 0
        ? ((h2o * (2 * atomicMass('H') + atomicMass('O'))) /
            (o2 * COMPOUND_MOLAR_MASS.O2 + n2 * COMPOUND_MOLAR_MASS.N2)) *
          100
        : column.moisture ?? 0
    // Flo 气体流量多为 Nm³/h；质量列仍写入 dryFlowTH（兼容旧导入），求解时由约束覆盖
    const weight = Math.max(0, feed.dryFlowTH ?? 0)
    const waterWeight = moisture > 0 ? (weight * moisture) / 100 : 0
    const keepFeedLeakName =
      column.airRole === 'feed_leak' && options?.includeSecondaryAir === false
    return {
      ...column,
      name: keepFeedLeakName ? column.name : feed.name || column.name,
      weight: options?.includeSecondaryAir === false ? 0 : weight,
      moisture,
      waterWeight: options?.includeSecondaryAir === false ? 0 : waterWeight,
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

function elementMassFromRatios(
  ratios: Partial<Record<string, number>> | undefined,
  dryFlowTH: number | null | undefined
): Partial<Record<string, number>> {
  const total = dryFlowTH != null && Number.isFinite(dryFlowTH) && dryFlowTH > 0 ? dryFlowTH : 0
  if (!(total > 0) || !ratios) return {}
  const out: Partial<Record<string, number>> = {}
  for (const [key, pct] of Object.entries(ratios)) {
    if (pct == null || !Number.isFinite(pct)) continue
    out[key] = (total * pct) / 100
  }
  return out
}

function sumFeedElementMasses(feeds: MetcalFloFeedStream[]): Partial<Record<string, number>> {
  const out: Partial<Record<string, number>> = {}
  for (const feed of feeds) {
    const dry = feed.dryFlowTH
    if (dry == null || !Number.isFinite(dry) || dry <= 0) continue
    for (const [key, pct] of Object.entries(feed.elementRatios ?? {})) {
      if (pct == null || !Number.isFinite(pct)) continue
      out[key] = (out[key] ?? 0) + (dry * pct) / 100
    }
  }
  return out
}

export function buildMetcalFloImportBundle(buffer: ArrayBuffer): MetcalFloImportBundle {
  const extraction = extractMetcalFloMix(buffer)
  const rawMaterials = metcalFeedsToRawMaterials(extraction.feeds)
  const solventColumns = metcalFeedsToSolventColumns(extraction.solvents)
  const airColumns = metcalFeedsToAirColumns(extraction.gases)
  const fuelColumn = metcalFuelsToFuelColumn(extraction.fuels)
  const { concentrates } = partitionRawMixMaterials(rawMaterials)
  // 混合铜精矿仅由精矿加权；渣精矿/吹炼渣等属混料「其他」
  const recomputedBlend = calculateWeightedComposition(concentrates)
  const constraints = extractMetcalConstraintImport(buffer)
  const convertingConstraints = extractMetcalConvertingConstraintImport(buffer)
  const blendInputElementMass = (() => {
    const fromFloBlend = elementMassFromRatios(
      extraction.blend?.elementRatios,
      extraction.blend?.dryFlowTH
    )
    const fromRecomputed = elementMassFromRatios(recomputedBlend.ratios, recomputedBlend.totalWeight)
    // Flo「混合铜精矿」块常只有物相、元素行为 0；此时用精矿加权反推损失 D% 基准
    const floCu = fromFloBlend['Cu(铜)'] ?? fromFloBlend['Cu'] ?? 0
    if (floCu > 1e-9) return fromFloBlend
    return Object.keys(fromRecomputed).length > 0 ? fromRecomputed : fromFloBlend
  })()
  const productResults = enrichMetcalProductLossFromDistributions(
    extractMetcalFloProductResults(buffer),
    {
      elementDistributions: constraints.config.elementDistributions,
      inputElementMass: blendInputElementMass,
      config: constraints.config,
    }
  )
  const convertingInputElementMass = sumFeedElementMasses(extraction.convertingFeeds ?? [])
  const convertingProductResults = enrichMetcalProductLossFromDistributions(
    extractMetcalFloConvertingProductResults(buffer),
    {
      elementDistributions: convertingConstraints.config.elementDistributions,
      inputElementMass: convertingInputElementMass,
      config: convertingConstraints.config,
    }
  )

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
    convertingConstraints,
    productResults,
    convertingProductResults,
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
      .filter(([, value]) => Number.isFinite(value) && Math.abs(value) > 1e-12)
      .map(([name]) => name)
    const rows =
      formulas.length > 0
        ? createMaterialPhaseRowsFromFormulas(formulas)
        : createConcentrateMaterialPhaseRows()
    materialPhaseRows[material.id] = rows

    const phaseContents: Record<string, number> = {}
    let otherPercent = 0
    for (const row of rows) {
      if (row.kind === 'draft') continue
      const customId = row.id.startsWith('custom:') ? row.id.slice('custom:'.length) : row.id
      const pct = lookupMetcalPhasePercent(phaseRatios, [
        row.builtinKey ?? '',
        row.formula,
        row.displayLabel,
        customId,
        row.id,
        normalizeMetcalPhaseFormula(row.formula),
        row.kind === 'other' ? 'Other' : '',
      ])
      // 若规范化后键不同，再按原始 Flo 名反查
      const pctResolved =
        pct ??
        (() => {
          for (const [floName, value] of Object.entries(phaseRatios)) {
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
      if (pctResolved == null || !Number.isFinite(pctResolved)) continue
      phaseContents[row.id] = pctResolved
      if (row.kind === 'other' || row.id === 'Other' || row.formula === 'Other') {
        otherPercent = pctResolved
      }
    }
    // Flo 若未写 Other，则用 100−已知物相闭合（与元素表逻辑一致）
    if (otherPercent <= 1e-12) {
      const known = Object.entries(phaseContents)
        .filter(([key]) => key !== 'Other' && !key.toLowerCase().includes('other'))
        .reduce((sum, [, value]) => sum + value, 0)
      const residual = Math.max(0, 100 - known)
      if (residual > 1e-9) {
        phaseContents.Other = residual
        otherPercent = residual
      }
    }

    const hasPhases = Object.values(phaseContents).some((value) => Math.abs(value) > 1e-9)
    const result: PhaseMaterialCalcResult = {
      materialId: material.id,
      materialName: material.name,
      weight: material.weight,
      phaseContents,
      unknowns: { 'O(氧)': 0, 'C (碳)': 0, 'Other(其他)': otherPercent },
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

/** 导入预览：各列物相 w%（含混合铜精矿 Other） */
export type MetcalPhasePreviewColumn = {
  id: string
  category: string
  name: string
  weight: number
  waterWeight: number
  phases: Record<string, number>
}

const METCAL_PHASE_KEY_PREFERRED_ORDER = [
  'O2',
  'N2',
  'H2O',
  'CuFeS2',
  'CuS',
  'Cu2S',
  'FeS2',
  'FeS',
  'SiO2',
  'CaCO3',
  'CaO',
  'MgCO3',
  'MgO',
  'Al2O3',
  'PbS',
  'ZnS',
  'Fe2O3',
  'C',
  'H',
  'Other',
] as const

/** 单物料可见物相键（仅非零），按约定顺序排列 */
export function phaseKeysForMetcalPreviewColumn(column: MetcalPhasePreviewColumn): string[] {
  const present = Object.entries(column.phases)
    .filter(([, value]) => Number.isFinite(value) && Math.abs(value) > 1e-12)
    .map(([key]) => key)
  const preferred = METCAL_PHASE_KEY_PREFERRED_ORDER.filter((key) => present.includes(key))
  const rest = present.filter(
    (key) => !(METCAL_PHASE_KEY_PREFERRED_ORDER as readonly string[]).includes(key) && key !== 'Other'
  )
  if (present.includes('Other')) rest.push('Other')
  return [...preferred, ...rest]
}

export function buildMetcalPhasePreviewColumns(bundle: {
  extraction: MetcalFloMixExtraction
  rawMaterials: CopperMaterialColumn[]
  solventColumns: CopperMaterialColumn[]
  airColumns: CopperMaterialColumn[]
  fuelColumn: CopperFuelMaterial
}): MetcalPhasePreviewColumn[] {
  const { extraction, rawMaterials, solventColumns, airColumns, fuelColumn } = bundle
  const columns: MetcalPhasePreviewColumn[] = []
  const { concentrates, others } = partitionRawMixMaterials(rawMaterials)

  for (const material of concentrates) {
    const feed = extraction.feeds.find((item) => item.name === material.name)
    columns.push({
      id: material.id,
      category: '原料',
      name: material.name,
      weight: material.weight,
      waterWeight: materialWaterWeight(material),
      phases: { ...(feed?.phaseRatios ?? {}) },
    })
  }

  if (extraction.blend) {
    const blendWater = concentrates.reduce((sum, item) => sum + materialWaterWeight(item), 0)
    columns.push({
      id: 'metcal-blend-phase',
      category: '混料',
      name: '混合铜精矿',
      weight: extraction.blend.dryFlowTH ?? concentrates.reduce((sum, item) => sum + item.weight, 0),
      waterWeight: blendWater,
      phases: { ...extraction.blend.phaseRatios },
    })
  }

  for (const material of others) {
    const feed = extraction.feeds.find((item) => item.name === material.name)
    columns.push({
      id: material.id,
      category: '其他',
      name: material.name,
      weight: material.weight,
      waterWeight: materialWaterWeight(material),
      phases: { ...(feed?.phaseRatios ?? {}) },
    })
  }

  for (const material of solventColumns) {
    const feed = extraction.solvents.find((item) => item.name === material.name)
    columns.push({
      id: material.id,
      category: '熔剂',
      name: material.name,
      weight: material.weight,
      waterWeight: materialWaterWeight(material),
      phases: { ...(feed?.phaseRatios ?? {}) },
    })
  }

  if (extraction.fuels.length) {
    const feed = extraction.fuels.find((item) => item.name === fuelColumn.name) ?? extraction.fuels[0]
    columns.push({
      id: fuelColumn.id,
      category: '燃料',
      name: fuelColumn.name,
      weight: 0,
      waterWeight: materialWaterWeight(fuelColumn),
      phases: { ...(feed?.phaseRatios ?? {}) },
    })
  }

  for (const material of airColumns) {
    const feed =
      extraction.gases.find((item) => item.name === material.name) ??
      extraction.gases.find((item) => gasRoleForName(item.name) === material.airRole) ??
      null
    if (!feed) continue
    // 气体只展示 V% 的 O2/N2/H2O，忽略误匹配的固体 W%
    const o2 = feed.phaseRatios.O2
    const n2 = feed.phaseRatios.N2
    const h2o = feed.phaseRatios.H2O
    if (o2 == null || n2 == null) continue
    const phases: Record<string, number> = { O2: o2, N2: n2 }
    if (h2o != null && Number.isFinite(h2o)) phases.H2O = h2o
    columns.push({
      id: material.id,
      category: '气',
      name: material.name,
      weight: material.weight,
      waterWeight: materialWaterWeight(material),
      phases,
    })
  }

  // 固体列：Flo 无 Other 时用 100−其余闭合；气体 V% 不补 Other
  for (const column of columns) {
    if (column.category === '气') continue
    const hasOther = Object.keys(column.phases).some((key) => key.toLowerCase() === 'other')
    if (hasOther) continue
    const known = Object.entries(column.phases)
      .filter(([key]) => key.toLowerCase() !== 'other')
      .reduce((sum, [, value]) => sum + (Number.isFinite(value) ? value : 0), 0)
    if (known > 1e-9 && known < 100 - 1e-9) {
      column.phases.Other = Math.max(0, 100 - known)
    }
  }

  return columns
}

export function visibleMetcalImportPhaseKeys(columns: MetcalPhasePreviewColumn[]): string[] {
  const present = new Set<string>()
  for (const column of columns) {
    for (const key of phaseKeysForMetcalPreviewColumn(column)) present.add(key)
  }
  const ordered: string[] = METCAL_PHASE_KEY_PREFERRED_ORDER.filter((key) => present.has(key))
  for (const key of present) {
    if (!ordered.includes(key) && key !== 'Other') ordered.push(key)
  }
  if (present.has('Other')) ordered.push('Other')
  return ordered
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
  if (extraction.smeltingUnit) {
    lines.push(
      `熔炼单元：${extraction.smeltingUnit.unitName}（投入 ${extraction.smeltingUnit.inputNames.length} 路）`
    )
  }
  lines.push('混料进料：')
  for (const feed of extraction.feeds) {
    lines.push(
      `  - ${feed.name}：${feed.dryFlowTH?.toFixed(3) ?? '变量'} t/h 干基，水分 ${feed.moisturePercent?.toFixed(2) ?? '?'}%`
    )
  }
  if (extraction.solvents.length) {
    lines.push('熔炼熔剂：')
    for (const solvent of extraction.solvents) {
      lines.push(
        `  - ${solvent.name}：${solvent.dryFlowTH?.toFixed(3) ?? '变量'} t/h 干基`
      )
    }
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
