import type { CopperElementKey, CopperMaterialColumn, CopperRatios, WeightedComposition } from './copperWorkflowCalc.ts'
import { calculateWeightedComposition } from './copperWorkflowCalc.ts'
import {
  METCAL_BLEND_STREAM_NAME,
  METCAL_MIX_FEED_STREAM_NAMES,
  METCAL_MOISTURE_STREAM_NAME,
  mapMetcalElementTable,
} from './metcalElementMap.ts'
import { findStreamBlocks, parseFloFileInfo, type FloStreamBlock } from './metcalFloBinary.ts'

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

export interface MetcalFloImportBundle {
  extraction: MetcalFloMixExtraction
  rawMaterials: CopperMaterialColumn[]
  recomputedBlend: WeightedComposition
  comparison: MetcalFloImportComparison[]
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
    if (!block) {
      warnings.push(`未找到混料进料流「${name}」。`)
      continue
    }
    feeds.push(buildFeedStream(name, block, moistureMap, elementTemplates))
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
  } else {
    warnings.push('未找到混合铜精矿输出流（数值流量）。')
  }

  const feedSum = feeds.reduce((sum, f) => sum + (f.dryFlowTH ?? 0), 0)
  if (blend?.dryFlowTH && Math.abs(feedSum - blend.dryFlowTH) > 0.5) {
    warnings.push(
      `各路精矿干基合计 ${feedSum.toFixed(3)} t/h 与混合铜精矿 ${blend.dryFlowTH.toFixed(3)} t/h 不完全一致，可能还有返料/渣精矿等未列入默认四路进料。`
    )
  }

  return {
    fileInfo,
    workDays: workDays ?? DEFAULT_WORK_DAYS,
    workHours: workHours ?? DEFAULT_WORK_HOURS,
    feeds,
    blend,
    warnings,
    streamBlocks,
  }
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
        ratios: feed.elementRatios as CopperRatios,
      }
    })
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
  const recomputedBlend = calculateWeightedComposition(rawMaterials)

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

  return { extraction, rawMaterials, recomputedBlend, comparison }
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
