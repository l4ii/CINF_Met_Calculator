import type { CopperFuelMaterial } from './copperProcessCalc.ts'
import type { CopperElementKey, CopperMaterialColumn } from './copperWorkflowCalc.ts'
import { materialWaterWeight } from './copperWorkflowCalc.ts'
import type { OxySideBlowConstraintConfig } from './copperConstraintConfig.ts'
import {
  COPPER_TO_METCAL_ELEMENT,
  METCAL_BLEND_STREAM_NAME,
  METCAL_MIX_FEED_STREAM_NAMES,
} from './metcalElementMap.ts'
import {
  findStreamBlocks,
  patchCompositionValue,
  patchConstraintTargetByExpr,
  patchStreamFlow,
  type FloStreamBlock,
} from './metcalFloBinary.ts'
import { extractMetcalFloMix } from './metcalFloMixExtract.ts'

export interface MetcalFloBridgeRow {
  streamName: string
  dryFlowTH: number
  moisturePercent: number
  waterFlowTH: number
  wetFlowTH: number
  elements: Partial<Record<CopperElementKey, number>>
}

export interface MetcalFloPatchResult {
  buffer: ArrayBuffer
  patchedFlows: string[]
  patchedElements: string[]
  patchedConstraints: string[]
  skipped: string[]
  warnings: string[]
}

export interface MetcalFloExportInput {
  blendDryFlowTH: number
  blendElementRatios: Partial<Record<CopperElementKey, number>>
  blendPhaseRatios?: Record<string, number>
  solvents: CopperMaterialColumn[]
  fuel: CopperFuelMaterial
  airColumns: CopperMaterialColumn[]
  constraintConfig: OxySideBlowConstraintConfig
}

function escapeCsvCell(value: string | number): string {
  const text = String(value)
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}

export function buildMetcalFloBridgeRows(
  rawMaterials: CopperMaterialColumn[]
): MetcalFloBridgeRow[] {
  return rawMaterials
    .filter((m) => m.kind === 'raw' && m.name.trim())
    .map((material) => {
      const dryFlowTH = Math.max(0, material.weight)
      const waterFlowTH = materialWaterWeight(material)
      const moisturePercent =
        material.moisture ??
        (dryFlowTH > 0 ? (waterFlowTH / dryFlowTH) * 100 : 0)
      return {
        streamName: material.name.trim(),
        dryFlowTH,
        moisturePercent,
        waterFlowTH,
        wetFlowTH: dryFlowTH + waterFlowTH,
        elements: material.ratios,
      }
    })
}

export function buildMetcalFloBridgeCsv(
  rawMaterials: CopperMaterialColumn[],
  options?: { annualize?: boolean; workDays?: number; workHours?: number }
): string {
  const workDays = options?.workDays ?? 330
  const workHours = options?.workHours ?? 24
  const annualize = options?.annualize ?? false
  const scale = annualize ? workDays * workHours : 1
  const unit = annualize ? 't/a' : 't/h'

  const elementKeys: CopperElementKey[] = [
    'Cu(铜)',
    'Fe(铁)',
    'S (硫)',
    'SiO₂(二氧化硅)',
    'CaO(氧化钙)',
    'MgO(氧化镁)',
    'Al₂O₃(三氧化二铝)',
    'Pb(铅)',
    'Zn(锌)',
    'As(砷)',
    'Ag(银)',
    'Au(金)',
    'Sb(锑)',
    'Ni(镍)',
    'Se(硒)',
    'Bi(铋)',
    'Hg(汞)',
    'Sn(锡)',
    'Te(碲)',
    'Cd(镉)',
    'Other(其他)',
  ]

  const header = [
    '物料名',
    `干基流量(${unit})`,
    '水分(%)',
    `含水流量(${unit})`,
    `湿基流量(${unit})`,
    ...elementKeys.map((k) => COPPER_TO_METCAL_ELEMENT[k] ?? k),
  ]

  const rows = buildMetcalFloBridgeRows(rawMaterials)
  const lines = [
    '# MetCal 混料桥接表：将下列数值填入「混合铜精矿」单元对应进料行',
    '# 单位说明：默认 t/h；若 annualize=true 则按 WorkDays×WorkHours 折算为 t/a',
    header.map(escapeCsvCell).join(','),
  ]

  for (const row of rows) {
    const cells = [
      row.streamName,
      (row.dryFlowTH * scale).toFixed(6),
      row.moisturePercent.toFixed(3),
      (row.waterFlowTH * scale).toFixed(6),
      (row.wetFlowTH * scale).toFixed(6),
      ...elementKeys.map((k) => (row.elements[k] ?? 0).toFixed(4)),
    ]
    lines.push(cells.map(escapeCsvCell).join(','))
  }

  return `${lines.join('\r\n')}\r\n`
}

function findPatchableBlock(
  blocks: FloStreamBlock[],
  streamName: string
): FloStreamBlock | null {
  const candidates = blocks.filter((b) => b.name === streamName)
  const numeric = candidates.filter((b) => b.flowT && b.flowT !== 'x')
  if (numeric.length) {
    return numeric.sort((a, b) => (b.composition.length - a.composition.length))[0]
  }
  return candidates[0] ?? null
}

function patchMaterialStream(
  data: Uint8Array,
  blocks: FloStreamBlock[],
  material: { name: string; weight: number; ratios: Partial<Record<CopperElementKey, number>> },
  patchedFlows: string[],
  patchedElements: string[],
  skipped: string[],
  warnings: string[]
) {
  const streamName = material.name.trim()
  if (!streamName) return
  const block = findPatchableBlock(blocks, streamName)
  if (!block) {
    skipped.push(`${streamName}：模板中未找到对应流块`)
    return
  }
  const dryFlow = Math.max(0, material.weight)
  if (block.flowTOffset != null && block.flowTLength != null) {
    const ok = patchStreamFlow(data, block, dryFlow)
    if (ok) patchedFlows.push(streamName)
    else skipped.push(`${streamName}：流量字段长度不兼容`)
  }
  for (const [copperKey, value] of Object.entries(material.ratios)) {
    const metcalKey = COPPER_TO_METCAL_ELEMENT[copperKey as CopperElementKey]
    if (!metcalKey || value == null) continue
    const entry = block.composition.find((c) => c.name === metcalKey)
    if (!entry) continue
    const ok = patchCompositionValue(data, entry, value)
    if (ok) patchedElements.push(`${streamName}.${metcalKey}`)
    else warnings.push(`${streamName}.${metcalKey}：成分字段长度不兼容`)
  }
}

function patchGasStream(
  data: Uint8Array,
  blocks: FloStreamBlock[],
  column: CopperMaterialColumn,
  patchedFlows: string[],
  patchedElements: string[],
  skipped: string[],
  warnings: string[]
) {
  const streamName = column.name.trim()
  if (!streamName) return
  const block = findPatchableBlock(blocks, streamName)
  if (!block) {
    skipped.push(`${streamName}：模板中未找到气体流块`)
    return
  }
  const dryFlow = Math.max(0, column.weight)
  if (block.flowTOffset != null && block.flowTLength != null) {
    const ok = patchStreamFlow(data, block, dryFlow)
    if (ok) patchedFlows.push(streamName)
    else skipped.push(`${streamName}：气体流量字段长度不兼容`)
  }
  const gasMap: Array<[string, number]> = [
    ['O2', column.ratios['O(氧)'] ?? 0],
    ['N2', column.ratios['N(氮)'] ?? 0],
    ['H2O', column.moisture ?? 0],
  ]
  for (const [metcalKey, value] of gasMap) {
    const entry = block.composition.find((c) => c.name === metcalKey)
    if (!entry) continue
    const ok = patchCompositionValue(data, entry, value)
    if (ok) patchedElements.push(`${streamName}.${metcalKey}`)
    else warnings.push(`${streamName}.${metcalKey}：气体成分字段长度不兼容`)
  }
}

function patchBlendStream(
  data: Uint8Array,
  blocks: FloStreamBlock[],
  input: Pick<MetcalFloExportInput, 'blendDryFlowTH' | 'blendElementRatios' | 'blendPhaseRatios'>,
  patchedFlows: string[],
  patchedElements: string[],
  skipped: string[],
  warnings: string[]
) {
  const block = findPatchableBlock(blocks, METCAL_BLEND_STREAM_NAME)
  if (!block) {
    skipped.push(`${METCAL_BLEND_STREAM_NAME}：模板中未找到混料输出流块`)
    return
  }
  if (block.flowTOffset != null && block.flowTLength != null) {
    const ok = patchStreamFlow(data, block, Math.max(0, input.blendDryFlowTH))
    if (ok) patchedFlows.push(METCAL_BLEND_STREAM_NAME)
    else skipped.push(`${METCAL_BLEND_STREAM_NAME}：流量字段长度不兼容`)
  }
  for (const [copperKey, value] of Object.entries(input.blendElementRatios)) {
    const metcalKey = COPPER_TO_METCAL_ELEMENT[copperKey as CopperElementKey]
    if (!metcalKey || value == null) continue
    const entry = block.composition.find((c) => c.name === metcalKey)
    if (!entry) continue
    const ok = patchCompositionValue(data, entry, value)
    if (ok) patchedElements.push(`${METCAL_BLEND_STREAM_NAME}.${metcalKey}`)
    else warnings.push(`${METCAL_BLEND_STREAM_NAME}.${metcalKey}：元素字段长度不兼容`)
  }
  if (input.blendPhaseRatios) {
    for (const [phaseName, value] of Object.entries(input.blendPhaseRatios)) {
      if (value == null) continue
      const entry = block.composition.find((c) => c.name === phaseName)
      if (!entry) continue
      const ok = patchCompositionValue(data, entry, value)
      if (ok) patchedElements.push(`${METCAL_BLEND_STREAM_NAME}.${phaseName}`)
      else warnings.push(`${METCAL_BLEND_STREAM_NAME}.${phaseName}：物相字段长度不兼容`)
    }
  }
}

function patchConstraintTargets(
  data: Uint8Array,
  config: OxySideBlowConstraintConfig,
  patchedConstraints: string[],
  warnings: string[]
) {
  for (const constraint of config.customConstraints) {
    const expr = constraint.expr?.trim()
    if (!expr || typeof constraint.target !== 'number' || !Number.isFinite(constraint.target)) continue
    const ok = patchConstraintTargetByExpr(data, expr, constraint.target)
    if (ok) patchedConstraints.push(expr)
    else warnings.push(`约束目标未能补丁：${expr}`)
  }
}

export function patchMetcalFloTemplate(
  templateBuffer: ArrayBuffer,
  rawMaterials: CopperMaterialColumn[]
): MetcalFloPatchResult {
  const warnings: string[] = []
  const patchedFlows: string[] = []
  const patchedElements: string[] = []
  const patchedConstraints: string[] = []
  const skipped: string[] = []

  const buffer = templateBuffer.slice(0)
  const data = new Uint8Array(buffer)
  const blocks = findStreamBlocks(buffer)
  const extraction = extractMetcalFloMix(buffer)

  for (const material of rawMaterials) {
    if (material.kind !== 'raw' || !material.name.trim()) continue
    patchMaterialStream(data, blocks, material, patchedFlows, patchedElements, skipped, warnings)
  }

  if (!patchedFlows.length && !patchedElements.length) {
    warnings.push('未能自动改写任何模板字段，请使用 CSV 桥接表。')
  }

  return {
    buffer,
    patchedFlows,
    patchedElements,
    patchedConstraints,
    skipped,
    warnings: [...warnings, ...extraction.warnings],
  }
}

export function patchMetcalFloFromWorkflow(
  templateBuffer: ArrayBuffer,
  input: MetcalFloExportInput
): MetcalFloPatchResult {
  const warnings: string[] = []
  const patchedFlows: string[] = []
  const patchedElements: string[] = []
  const patchedConstraints: string[] = []
  const skipped: string[] = []

  const buffer = templateBuffer.slice(0)
  const data = new Uint8Array(buffer)
  const blocks = findStreamBlocks(buffer)
  const extraction = extractMetcalFloMix(buffer)

  patchBlendStream(data, blocks, input, patchedFlows, patchedElements, skipped, warnings)

  for (const solvent of input.solvents) {
    if (!solvent.name.trim()) continue
    patchMaterialStream(data, blocks, solvent, patchedFlows, patchedElements, skipped, warnings)
  }

  if (input.fuel.name.trim()) {
    patchMaterialStream(data, blocks, input.fuel, patchedFlows, patchedElements, skipped, warnings)
  }

  for (const airColumn of input.airColumns) {
    patchGasStream(data, blocks, airColumn, patchedFlows, patchedElements, skipped, warnings)
  }

  patchConstraintTargets(data, input.constraintConfig, patchedConstraints, warnings)

  if (!patchedFlows.length && !patchedElements.length && !patchedConstraints.length) {
    warnings.push('未能自动改写任何模板字段，请检查模板流名是否与案例一致。')
  }

  return {
    buffer,
    patchedFlows,
    patchedElements,
    patchedConstraints,
    skipped,
    warnings: [...warnings, ...extraction.warnings],
  }
}

export function defaultMetcalTemplateStreamNames(): string[] {
  return [...METCAL_MIX_FEED_STREAM_NAMES, METCAL_BLEND_STREAM_NAME]
}
