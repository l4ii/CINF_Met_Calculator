import type { OxySideBlowConstraintConfig, OxySideBlowProductKey } from './copperConstraintConfig.ts'
import type { OxyConstraintSolverResult, OxyProductResult } from './copperConstraintSolver.ts'
import type { PhaseBatchResults } from './copperPhaseBatchCalc.ts'
import type { MaterialPhaseAssistRow } from './copperPhaseAssist.ts'
import type { CopperFuelMaterial } from './copperProcessCalc.ts'
import {
  calculateWeightedComposition,
  materialWaterWeight,
  partitionRawMixMaterials,
  type CopperElementKey,
  type CopperMaterialColumn,
} from './copperWorkflowCalc.ts'
import {
  COPPER_TO_METCAL_ELEMENT,
  METCAL_BLEND_STREAM_NAME,
  METCAL_FUEL_STREAM_NAMES,
  METCAL_GAS_STREAM_NAMES,
  METCAL_MIX_FEED_STREAM_NAMES,
  METCAL_MIX_OTHER_STREAM_NAMES,
  METCAL_SOLVENT_STREAM_NAMES,
} from './metcalElementMap.ts'
import {
  extractMetcalConvertingUnitInputs,
  extractMetcalSmeltingUnitInputs,
  findStreamBlocks,
  formatMetcalNumber,
  patchCompositionValue,
  patchStreamPrimaryFlow,
  type FloStreamBlock,
} from './metcalFloBinary.ts'
import {
  extractMetcalConvertingConstraintImport,
  patchMetcalCustomConstraintsInRange,
  patchMetcalElementDistributionsInRange,
} from './metcalFloConstraintExtract.ts'
import {
  extractMetcalFloConvertingProductResults,
  extractMetcalFloProductResults,
} from './metcalFloResultExtract.ts'
import {
  GAS_PHASE_MOLAR_MASS,
  STANDARD_GAS_MOLAR_VOLUME_NM3_PER_KMOL,
} from './copperProductPhaseCalc.ts'
import { normalizeMetcalPhaseFormula } from './chemicalFormula.ts'

export type CopperMetcalFloStageId = 'smelting' | 'converting'

export type CopperMetcalFloStagePayload = {
  stageId: CopperMetcalFloStageId
  rawMaterials: CopperMaterialColumn[]
  solventColumns: CopperMaterialColumn[]
  fuelColumn?: CopperFuelMaterial | null
  airColumns: CopperMaterialColumn[]
  phaseBatchResults: PhaseBatchResults | null
  materialPhaseRows: Record<string, MaterialPhaseAssistRow[]>
  constraintConfig: OxySideBlowConstraintConfig
  productResult: OxyConstraintSolverResult
}

export type CopperMetcalFloCaseInput = {
  stages: CopperMetcalFloStagePayload[]
}

export type CopperMetcalFloCasePatchResult = {
  buffer: ArrayBuffer
  activeStages: CopperMetcalFloStageId[]
  patchedFlows: string[]
  patchedElements: string[]
  patchedConstraints: string[]
  cleared: string[]
  warnings: string[]
}

const SMELTING_STAGE_INPUT_NAMES = new Set<string>([
  ...METCAL_MIX_FEED_STREAM_NAMES,
  ...METCAL_MIX_OTHER_STREAM_NAMES,
  METCAL_BLEND_STREAM_NAME,
  ...METCAL_SOLVENT_STREAM_NAMES,
  ...METCAL_FUEL_STREAM_NAMES,
  ...METCAL_GAS_STREAM_NAMES,
])

const CONVERTING_GAS_NAMES = new Set(['空气', '氧气', '漏风', '加料口漏风'])

function isFinitePositive(value: number | null | undefined): value is number {
  return value != null && Number.isFinite(value) && value > 1e-12
}

function phaseRatiosForMaterial(
  material: CopperMaterialColumn,
  phaseBatchResults: PhaseBatchResults | null,
  materialPhaseRows: Record<string, MaterialPhaseAssistRow[]>
): Record<string, number> {
  const result = phaseBatchResults?.[material.id]
  if (!result?.valid) return {}
  const rowById = new Map((materialPhaseRows[material.id] ?? []).map((row) => [row.id, row]))
  const ratios: Record<string, number> = {}
  for (const [rowId, value] of Object.entries(result.phaseContents ?? {})) {
    if (!Number.isFinite(value) || Math.abs(value) <= 1e-12) continue
    const row = rowById.get(rowId)
    const rawKey = row?.builtinKey ?? row?.formula ?? rowId.replace(/^custom:/, '')
    const key = normalizeMetcalPhaseFormula(rawKey) || rawKey
    ratios[key] = (ratios[key] ?? 0) + value
  }
  return ratios
}

function elementEntryMap(material: { ratios: Partial<Record<CopperElementKey, number>> }) {
  return new Map(
    Object.entries(material.ratios)
      .map(([key, value]) => [COPPER_TO_METCAL_ELEMENT[key as CopperElementKey], value] as const)
      .filter((entry): entry is readonly [string, number] => Boolean(entry[0]) && Number.isFinite(entry[1]))
  )
}

function normalizedPhaseMap(phases: Record<string, number>) {
  return new Map(
    Object.entries(phases)
      .filter(([, value]) => Number.isFinite(value))
      .map(([key, value]) => [normalizeMetcalPhaseFormula(key) || key, value] as const)
  )
}

function patchBlockCompositions(
  data: Uint8Array,
  blocks: FloStreamBlock[],
  material: { name: string; ratios: Partial<Record<CopperElementKey, number>> },
  phases: Record<string, number>,
  patchedElements: string[],
  warnings: string[]
) {
  const elements = elementEntryMap(material)
  const phaseValues = normalizedPhaseMap(phases)
  const elementBlocks = blocks.filter((block) => {
    const names = new Set(block.composition.map((entry) => entry.name))
    return ['Cu', 'Fe', 'S'].filter((name) => names.has(name)).length >= 2
  })
  const phaseBlocks = blocks.filter((block) => !elementBlocks.includes(block))

  const bestBlock = (candidates: FloStreamBlock[], values: Map<string, number>) =>
    candidates.slice().sort((a, b) => {
      const score = (block: FloStreamBlock) =>
        block.composition.reduce((sum, entry) => {
          const key = normalizeMetcalPhaseFormula(entry.name) || entry.name
          const value = values.get(entry.name) ?? values.get(key)
          if (value == null) return sum
          return sum + (formatMetcalNumber(value, entry.valueLength) ? 10 : 1)
        }, 0)
      return score(b) - score(a) || b.composition.length - a.composition.length || a.offset - b.offset
    })[0] ?? null

  const selected: Array<{ block: FloStreamBlock; values: Map<string, number>; clearMissing: boolean }> = []
  const elementBlock = bestBlock(elementBlocks, elements)
  if (elementBlock) selected.push({ block: elementBlock, values: elements, clearMissing: false })
  if (phaseValues.size > 0) {
    const phaseBlock = bestBlock(phaseBlocks, phaseValues)
    if (phaseBlock) selected.push({ block: phaseBlock, values: phaseValues, clearMissing: true })
  }

  for (const { block, values, clearMissing } of selected) {
    for (const entry of block.composition) {
      const key = normalizeMetcalPhaseFormula(entry.name) || entry.name
      const value = values.get(entry.name) ?? values.get(key) ?? (clearMissing ? 0 : null)
      if (value == null || (entry.value === 'x' && !clearMissing)) continue
      if (patchCompositionValue(data, entry, value)) {
        patchedElements.push(`${material.name}.${entry.name}@${block.offset}`)
      } else if (Math.abs(value) > 1e-12) {
        warnings.push(`${material.name}.${entry.name}：组成字段长度不兼容`)
      }
    }
  }
}

function blockHasWritableFlow(block: FloStreamBlock): boolean {
  return block.flowTOffset != null || block.flowNm3Offset != null
}

function selectFlowBlock(blocks: FloStreamBlock[], flow: number): FloStreamBlock | null {
  const candidates = blocks.filter(blockHasWritableFlow)
  if (!candidates.length) return null
  return candidates.slice().sort((a, b) => {
    const aLength = a.compositionKind === 'V%' ? a.flowNm3Length : (a.flowTLength ?? a.flowNm3Length)
    const bLength = b.compositionKind === 'V%' ? b.flowNm3Length : (b.flowTLength ?? b.flowNm3Length)
    const aFits = aLength != null && formatMetcalNumber(flow, aLength) ? 1 : 0
    const bFits = bLength != null && formatMetcalNumber(flow, bLength) ? 1 : 0
    const aNumeric = a.flowT !== 'x' && a.flowNm3 !== 'x' ? 1 : 0
    const bNumeric = b.flowT !== 'x' && b.flowNm3 !== 'x' ? 1 : 0
    return bFits - aFits || bNumeric - aNumeric || b.composition.length - a.composition.length || a.offset - b.offset
  })[0]!
}

function clearFlowBlocks(
  data: Uint8Array,
  blocks: FloStreamBlock[],
  label: string,
  cleared: string[],
  warnings: string[]
) {
  for (const block of blocks) {
    if (!blockHasWritableFlow(block)) continue
    if (patchStreamPrimaryFlow(data, block, 0)) cleared.push(`${label}@${block.offset}`)
    else warnings.push(`${label}@${block.offset}：无法清零模板流量`)
  }
}

function patchMaterial(
  data: Uint8Array,
  blocks: FloStreamBlock[],
  material: CopperMaterialColumn | CopperFuelMaterial,
  phases: Record<string, number>,
  patchedFlows: string[],
  patchedElements: string[],
  warnings: string[],
  flowValue = material.weight
) {
  if (!material.name.trim() || flowValue <= 1e-12) return
  if (!blocks.length) {
    warnings.push(`${material.name}：模板中未找到所属工序物流`)
    return
  }
  const flowBlock = selectFlowBlock(blocks, flowValue)
  if (!flowBlock || !patchStreamPrimaryFlow(data, flowBlock, flowValue)) {
    warnings.push(`${material.name}：流量字段长度不兼容`)
  } else {
    patchedFlows.push(`${material.name}@${flowBlock.offset}`)
  }
  patchBlockCompositions(data, blocks, material, phases, patchedElements, warnings)
}

function gasInputToVolume(material: CopperMaterialColumn) {
  const phaseMass: Record<string, number> = {
    O2: (Math.max(0, material.weight) * Math.max(0, material.ratios['O(氧)'] ?? 0)) / 100,
    N2: (Math.max(0, material.weight) * Math.max(0, material.ratios['N(氮)'] ?? 0)) / 100,
    H2O: Math.max(0, materialWaterWeight(material)),
  }
  const volumeByPhase: Record<string, number> = {}
  let totalVolume = 0
  for (const [key, massTh] of Object.entries(phaseMass)) {
    const molarMass = GAS_PHASE_MOLAR_MASS[key]
    if (!(massTh > 0) || !(molarMass > 0)) continue
    const volume = ((massTh * 1000) / molarMass) * STANDARD_GAS_MOLAR_VOLUME_NM3_PER_KMOL
    volumeByPhase[key] = volume
    totalVolume += volume
  }
  return {
    totalVolume,
    volumePercent: Object.fromEntries(
      Object.entries(volumeByPhase).map(([key, volume]) => [
        key,
        totalVolume > 0 ? (volume / totalVolume) * 100 : 0,
      ])
    ),
  }
}

function blendPhaseRatios(stage: CopperMetcalFloStagePayload, concentrates: CopperMaterialColumn[]) {
  const total = concentrates.reduce((sum, material) => sum + Math.max(0, material.weight), 0)
  const phases: Record<string, number> = {}
  if (total <= 1e-12) return phases
  for (const material of concentrates) {
    const materialPhases = phaseRatiosForMaterial(
      material,
      stage.phaseBatchResults,
      stage.materialPhaseRows
    )
    for (const [key, value] of Object.entries(materialPhases)) {
      phases[key] = (phases[key] ?? 0) + (material.weight * value) / total
    }
  }
  return phases
}

function patchCustomConstraints(
  data: Uint8Array,
  range: { start: number; end: number },
  stageId: CopperMetcalFloStageId,
  config: OxySideBlowConstraintConfig,
  patchedConstraints: string[],
  warnings: string[]
) {
  const custom = patchMetcalCustomConstraintsInRange(data, range, stageId, config)
  patchedConstraints.push(...custom.patched)
  warnings.push(...custom.errors)
  const distribution = patchMetcalElementDistributionsInRange(data, range, config)
  patchedConstraints.push(...distribution.patched)
  warnings.push(...distribution.errors)
}

function patchSmeltingInputs(
  data: Uint8Array,
  blocks: FloStreamBlock[],
  stage: CopperMetcalFloStagePayload,
  range: { start: number; end: number },
  output: CopperMetcalFloCasePatchResult
) {
  const rawNameSet = new Set<string>([
    ...METCAL_MIX_FEED_STREAM_NAMES,
    ...METCAL_MIX_OTHER_STREAM_NAMES,
  ])
  const smeltingCandidates = blocks.filter(
    (block) =>
      SMELTING_STAGE_INPUT_NAMES.has(block.name) &&
      (block.offset < range.end || block.name === METCAL_BLEND_STREAM_NAME)
  )
  clearFlowBlocks(data, smeltingCandidates, '熔炼投入', output.cleared, output.warnings)

  const { concentrates, others } = partitionRawMixMaterials(stage.rawMaterials)
  for (const material of [...concentrates, ...others]) {
    const candidates = blocks.filter(
      (block) =>
        block.name === material.name &&
        rawNameSet.has(block.name) &&
        (material.mixGroup === 'other'
          ? block.offset >= range.start && block.offset < range.end
          : block.offset < range.start ||
            ['Cu', 'Fe', 'S'].filter((name) => block.composition.some((entry) => entry.name === name))
              .length >= 2)
    )
    patchMaterial(
      data,
      candidates,
      material,
      phaseRatiosForMaterial(material, stage.phaseBatchResults, stage.materialPhaseRows),
      output.patchedFlows,
      output.patchedElements,
      output.warnings
    )
  }

  const blend = calculateWeightedComposition(concentrates)
  const blendMaterial: CopperMaterialColumn = {
    id: 'flo-blend',
    name: METCAL_BLEND_STREAM_NAME,
    kind: 'raw',
    weight: blend.totalWeight,
    waterWeight: 0,
    ratios: blend.ratios,
  }
  patchMaterial(
    data,
    blocks.filter(
      (block) =>
        block.name === METCAL_BLEND_STREAM_NAME && block.offset >= range.start && block.offset < range.end
    ),
    blendMaterial,
    blendPhaseRatios(stage, concentrates),
    output.patchedFlows,
    output.patchedElements,
    output.warnings
  )

  for (const material of stage.solventColumns) {
    patchMaterial(
      data,
      blocks.filter(
        (block) => block.name === material.name && block.offset < range.end
      ),
      material,
      phaseRatiosForMaterial(material, stage.phaseBatchResults, stage.materialPhaseRows),
      output.patchedFlows,
      output.patchedElements,
      output.warnings
    )
  }
  if (stage.fuelColumn) {
    patchMaterial(
      data,
      blocks.filter(
        (block) => block.name === stage.fuelColumn!.name && block.offset < range.end
      ),
      stage.fuelColumn,
      phaseRatiosForMaterial(stage.fuelColumn, stage.phaseBatchResults, stage.materialPhaseRows),
      output.patchedFlows,
      output.patchedElements,
      output.warnings
    )
  }
  for (const gas of stage.airColumns) {
    const aliases = gas.airRole === 'feed_leak' ? new Set([gas.name, '加料口漏风', '漏风']) : new Set([gas.name])
    const gasVolume = gasInputToVolume(gas)
    patchMaterial(
      data,
      blocks.filter(
        (block) => aliases.has(block.name) && block.offset < range.end
      ),
      gas,
      gasVolume.volumePercent,
      output.patchedFlows,
      output.patchedElements,
      output.warnings,
      gasVolume.totalVolume
    )
  }
}

function patchConvertingInputs(
  data: Uint8Array,
  blocks: FloStreamBlock[],
  stage: CopperMetcalFloStagePayload,
  range: { start: number; end: number },
  inputNames: string[],
  output: CopperMetcalFloCasePatchResult
) {
  const allowed = new Set(inputNames)
  const inputBlocks = blocks.filter(
    (block) => allowed.has(block.name) && block.offset >= range.start && block.offset < range.end
  )
  clearFlowBlocks(data, inputBlocks, '吹炼投入', output.cleared, output.warnings)
  const materials = [...stage.rawMaterials, ...stage.solventColumns]
  for (const material of materials) {
    const aliases = new Set([material.name])
    if (material.name === '残极一') aliases.add('残极')
    if (material.name === '残极二') aliases.add('残极三')
    patchMaterial(
      data,
      inputBlocks.filter((block) => aliases.has(block.name)),
      material,
      phaseRatiosForMaterial(material, stage.phaseBatchResults, stage.materialPhaseRows),
      output.patchedFlows,
      output.patchedElements,
      output.warnings
    )
  }
  for (const gas of stage.airColumns) {
    const aliases =
      gas.airRole === 'feed_leak' ? new Set([gas.name, '漏风', '加料口漏风']) : new Set([gas.name])
    const gasVolume = gasInputToVolume(gas)
    patchMaterial(
      data,
      inputBlocks.filter((block) => CONVERTING_GAS_NAMES.has(block.name) && aliases.has(block.name)),
      gas,
      gasVolume.volumePercent,
      output.patchedFlows,
      output.patchedElements,
      output.warnings,
      gasVolume.totalVolume
    )
  }
}

type ProductTargetMap = Partial<Record<OxySideBlowProductKey, FloStreamBlock[]>>

function blockAtOffset(blocks: FloStreamBlock[], offset: number) {
  return blocks.find((block) => block.offset === offset) ?? null
}

function productTargets(
  templateBuffer: ArrayBuffer,
  blocks: FloStreamBlock[],
  stageId: CopperMetcalFloStageId,
  range: { start: number; end: number }
): ProductTargetMap {
  const extraction =
    stageId === 'smelting'
      ? extractMetcalFloProductResults(templateBuffer)
      : extractMetcalFloConvertingProductResults(templateBuffer)
  const targets: ProductTargetMap = {}
  for (const stream of extraction.streams) {
    if (stream.sourceOffset < 0) continue
    const block = blockAtOffset(blocks, stream.sourceOffset)
    if (block) targets[stream.productKey] = [block]
  }
  if (stageId === 'smelting') {
    const dust = blocks.filter(
      (block) =>
        ['熔炼锅炉尘', '熔炼白烟尘'].includes(block.name) && block.offset >= range.start
    )
    if (dust.length) targets.dust = dust
  } else {
    const roughCopper = blocks
      .filter(
        (block) =>
          block.name === '粗铜' && block.offset >= range.start && block.compositionKind === 'W%'
      )
      .sort((a, b) => a.offset - b.offset)
    const numeric = roughCopper.find((block) => block.flowT != null && block.flowT !== 'x')
    if (numeric) targets.matte = [numeric]
    const dust = blocks.filter(
      (block) =>
        ['吹炼锅炉尘', '吹炼白烟尘'].includes(block.name) &&
        block.offset >= range.start &&
        block.offset < range.end
    )
    if (dust.length) targets.dust = dust
  }
  return targets
}

function gasProductToVolume(product: OxyProductResult) {
  const volumeByPhase: Record<string, number> = {}
  let totalVolume = 0
  for (const phase of product.phases) {
    if (!isFinitePositive(phase.mass)) continue
    const molarMass = GAS_PHASE_MOLAR_MASS[phase.key] ?? GAS_PHASE_MOLAR_MASS.Other
    if (!isFinitePositive(molarMass)) continue
    const volume = ((phase.mass * 1000) / molarMass) * STANDARD_GAS_MOLAR_VOLUME_NM3_PER_KMOL
    volumeByPhase[phase.key] = volume
    totalVolume += volume
  }
  const volumePercent = Object.fromEntries(
    Object.entries(volumeByPhase).map(([key, volume]) => [
      key,
      totalVolume > 0 ? (volume / totalVolume) * 100 : 0,
    ])
  )
  return { totalVolume, volumePercent }
}

function patchProductComposition(
  data: Uint8Array,
  block: FloStreamBlock,
  values: Record<string, number>,
  label: string,
  output: CopperMetcalFloCasePatchResult
) {
  const normalized = normalizedPhaseMap(values)
  for (const entry of block.composition) {
    const key = normalizeMetcalPhaseFormula(entry.name) || entry.name
    const value = normalized.get(key) ?? 0
    if (patchCompositionValue(data, entry, value)) {
      output.patchedElements.push(`${label}.${entry.name}@${block.offset}`)
    } else if (Math.abs(value) > 1e-12) {
      output.warnings.push(`${label}.${entry.name}：产出组成字段长度不兼容`)
    }
  }
}

function patchStageProducts(
  data: Uint8Array,
  targets: ProductTargetMap,
  stage: CopperMetcalFloStagePayload,
  output: CopperMetcalFloCasePatchResult
) {
  for (const [productKey, blocks] of Object.entries(targets) as [OxySideBlowProductKey, FloStreamBlock[]][]) {
    clearFlowBlocks(data, blocks, `${stage.stageId}.${productKey}`, output.cleared, output.warnings)
  }
  for (const [productKey, product] of Object.entries(stage.productResult.products) as [
    OxySideBlowProductKey,
    OxyProductResult,
  ][]) {
    if (!isFinitePositive(product.mass)) continue
    const blocks = targets[productKey]
    if (!blocks?.length) {
      if (productKey !== 'loss' && productKey !== 'fugitive') {
        output.warnings.push(`${stage.stageId}.${product.name}：模板中未找到产出结果槽位`)
      }
      continue
    }
    const block = blocks[0]!
    const isGas = block.compositionKind === 'V%'
    const gas = isGas ? gasProductToVolume(product) : null
    const flow = gas?.totalVolume ?? product.mass
    if (!patchStreamPrimaryFlow(data, block, flow)) {
      output.warnings.push(`${stage.stageId}.${product.name}：产出流量字段长度不兼容`)
      continue
    }
    output.patchedFlows.push(`${stage.stageId}.${product.name}@${block.offset}`)
    const composition = gas?.volumePercent ?? Object.fromEntries(product.phases.map((phase) => [phase.key, phase.pct]))
    patchProductComposition(data, block, composition, `${stage.stageId}.${product.name}`, output)
  }
}

export function patchCopperMetcalFloCase(
  templateBuffer: ArrayBuffer,
  input: CopperMetcalFloCaseInput
): CopperMetcalFloCasePatchResult {
  const stages = input.stages.filter(
    (stage) => stage.productResult?.acceptable && stage.productResult.acceptanceLevel !== 'failed'
  )
  if (!stages.length || stages[0]?.stageId !== 'smelting') {
    throw new Error('导出 Flo 前必须先完成熔炼产出计算并回填结果。')
  }
  if (stages.some((stage, index) => stage.stageId === 'converting' && index !== 1)) {
    throw new Error('Flo 工序必须按熔炼、吹炼顺序导出。')
  }

  const buffer = templateBuffer.slice(0)
  const data = new Uint8Array(buffer)
  const blocks = findStreamBlocks(buffer)
  const smeltingUnit = extractMetcalSmeltingUnitInputs(buffer)
  const convertingUnit = extractMetcalConvertingUnitInputs(buffer)
  if (!smeltingUnit) throw new Error('内置 Flo 模板缺少侧吹熔炼炉单元。')

  const output: CopperMetcalFloCasePatchResult = {
    buffer,
    activeStages: stages.map((stage) => stage.stageId),
    patchedFlows: [],
    patchedElements: [],
    patchedConstraints: [],
    cleared: [],
    warnings: [],
  }

  const smeltingRange = { start: smeltingUnit.start, end: smeltingUnit.end }
  const convertingRange = convertingUnit
    ? { start: convertingUnit.start, end: convertingUnit.end }
    : null

  // 先清理两段产出，避免任何模板计算结果被误认为本案例结果。
  const smeltingTargets = productTargets(templateBuffer, blocks, 'smelting', smeltingRange)
  for (const [key, targetBlocks] of Object.entries(smeltingTargets)) {
    clearFlowBlocks(data, targetBlocks, `模板熔炼产出.${key}`, output.cleared, output.warnings)
  }
  if (convertingRange) {
    const convertingTargets = productTargets(templateBuffer, blocks, 'converting', convertingRange)
    for (const [key, targetBlocks] of Object.entries(convertingTargets)) {
      clearFlowBlocks(data, targetBlocks, `模板吹炼产出.${key}`, output.cleared, output.warnings)
    }
  }

  const smeltingStage = stages.find((stage) => stage.stageId === 'smelting')!
  patchSmeltingInputs(data, blocks, smeltingStage, smeltingRange, output)
  patchCustomConstraints(
    data,
    smeltingRange,
    'smelting',
    smeltingStage.constraintConfig,
    output.patchedConstraints,
    output.warnings
  )
  patchStageProducts(data, smeltingTargets, smeltingStage, output)

  const convertingStage = stages.find((stage) => stage.stageId === 'converting')
  if (convertingStage && (!convertingUnit || !convertingRange)) {
    throw new Error('内置 Flo 模板缺少吹炼炉单元，无法导出吹炼工序。')
  }
  if (convertingUnit && convertingRange) {
    const convertingInputBlocks = blocks.filter(
      (block) =>
        convertingUnit.inputNames.includes(block.name) &&
        block.offset >= convertingRange.start &&
        block.offset < convertingRange.end
    )
    if (convertingStage) {
      patchConvertingInputs(
        data,
        blocks,
        convertingStage,
        convertingRange,
        convertingUnit.inputNames,
        output
      )
      patchCustomConstraints(
        data,
        convertingRange,
        'converting',
        convertingStage.constraintConfig,
        output.patchedConstraints,
        output.warnings
      )
      patchStageProducts(
        data,
        productTargets(templateBuffer, blocks, 'converting', convertingRange),
        convertingStage,
        output
      )
    } else {
      const templateConvertingConfig = extractMetcalConvertingConstraintImport(templateBuffer).config
      const clearedConvertingConfig: OxySideBlowConstraintConfig = {
        ...templateConvertingConfig,
        customConstraints: templateConvertingConfig.customConstraints.map((constraint) => ({
          ...constraint,
          target: 0,
        })),
        elementDistributions: templateConvertingConfig.elementDistributions.map((entry) => ({
          ...entry,
          rules: entry.rules.map((rule) => ({ ...rule, value: 0 })),
        })),
      }
      const inactiveConstraintWarnings: string[] = []
      patchCustomConstraints(
        data,
        convertingRange,
        'converting',
        clearedConvertingConfig,
        output.patchedConstraints,
        inactiveConstraintWarnings
      )
      clearFlowBlocks(
        data,
        convertingInputBlocks.filter((block) => block.name !== '白铜锍'),
        '模板吹炼投入',
        output.cleared,
        output.warnings
      )
    }
  }

  if (output.warnings.length > 0) {
    const details = output.warnings.slice(0, 12).join('；')
    const remaining = output.warnings.length > 12 ? `；另有 ${output.warnings.length - 12} 项` : ''
    throw new Error(`Flo 生成已中止，以下字段无法安全写入：${details}${remaining}`)
  }

  return output
}
