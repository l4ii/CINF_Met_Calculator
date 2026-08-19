import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  buildMetcalPhasePreviewColumns,
  buildMetcalFloImportBundle,
  buildMetcalImportedPhaseState,
  phaseKeysForMetcalPreviewColumn,
  type MetcalFloStageBundle,
} from '../src/utils/metcalFloMixExtract.ts'
import {
  patchCopperMetcalFloCase,
  type CopperMetcalFloStagePayload,
} from '../src/utils/copperMetcalFloCase.ts'

function arrayBufferFromFile(path: string): ArrayBuffer {
  const buffer = readFileSync(path)
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function approx(actual: number, expected: number, tolerance = 1e-8) {
  return Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(actual), Math.abs(expected))
}

function stagePayload(stage: MetcalFloStageBundle): CopperMetcalFloStagePayload {
  assert(stage.productResults.result, `${stage.stageName}缺少产出结果`)
  const phaseState = buildMetcalImportedPhaseState(
    [...stage.rawMaterials, ...stage.solventColumns, stage.fuelColumn, ...stage.airColumns],
    [
      ...stage.extraction.feeds,
      ...stage.extraction.solvents,
      ...stage.extraction.fuels,
      ...stage.extraction.gases,
    ]
  )
  return {
    stageId: stage.stageId,
    rawMaterials: stage.rawMaterials,
    solventColumns: stage.solventColumns,
    fuelColumn: stage.fuelColumn,
    airColumns: stage.airColumns,
    phaseBatchResults: phaseState.phaseBatchResults,
    materialPhaseRows: phaseState.materialPhaseRows,
    constraintConfig: stage.constraints.config,
    productResult: stage.productResults.result,
  }
}

const scriptDir = dirname(fileURLToPath(import.meta.url))
const templatePath = join(scriptDir, '..', 'public', 'templates', 'southwest-copper-wu.flo')
const template = arrayBufferFromFile(templatePath)
const templateBundle = buildMetcalFloImportBundle(template)
assert(templateBundle.stages.length >= 2, '内置模板未解析出熔炼和吹炼基准段')

const smeltingBase = stagePayload(templateBundle.stages[0]!)
const smeltingOnly: CopperMetcalFloStagePayload = {
  ...smeltingBase,
  rawMaterials: smeltingBase.rawMaterials.filter(
    (material) => material.name !== '渣精矿' && material.name !== '吹炼渣'
  ),
}
const smeltingExport = patchCopperMetcalFloCase(template, { stages: [smeltingOnly] })
const smeltingRoundtrip = buildMetcalFloImportBundle(smeltingExport.buffer, {
  referenceTemplateBuffer: template,
})
assert(
  smeltingRoundtrip.stages.map((stage) => stage.stageId).join(',') === 'smelting',
  '仅熔炼案例回导出现了后续工序'
)
assert(
  !smeltingRoundtrip.stages[0]!.rawMaterials.some(
    (material) => material.name === '渣精矿' || material.name === '吹炼渣'
  ),
  '仅熔炼案例回导仍包含未配置的模板返料'
)

const convertingBase = stagePayload(templateBundle.stages[1]!)
const twoStageExport = patchCopperMetcalFloCase(template, {
  stages: [smeltingBase, convertingBase],
})
const twoStageRoundtrip = buildMetcalFloImportBundle(twoStageExport.buffer, {
  referenceTemplateBuffer: template,
})
assert(
  twoStageRoundtrip.stages.map((stage) => stage.stageId).join(',') === 'smelting,converting',
  '双工序案例回导顺序错误'
)
for (const sourceStage of templateBundle.stages.slice(0, 2)) {
  const roundtripStage = twoStageRoundtrip.stages.find(
    (stage) => stage.stageId === sourceStage.stageId
  )
  assert(roundtripStage, `${sourceStage.stageName}回导缺失`)
  for (const sourceGas of sourceStage.airColumns) {
    const actualGas = roundtripStage.airColumns.find((gas) => gas.airRole === sourceGas.airRole)
    assert(actualGas, `${sourceStage.stageName}-${sourceGas.name}回导缺失`)
    assert(
      approx(actualGas.weight, sourceGas.weight),
      `${sourceStage.stageName}-${sourceGas.name}流量串入其他工序`
    )
  }
}

let unknownStreamRejected = false
try {
  patchCopperMetcalFloCase(template, {
    stages: [
      {
        ...smeltingOnly,
        rawMaterials: [
          ...smeltingOnly.rawMaterials,
          { ...smeltingOnly.rawMaterials[0]!, id: 'unknown-flo-stream', name: '未知物流', weight: 1 },
        ],
      },
    ],
  })
} catch (error) {
  unknownStreamRejected = String(error).includes('未知物流')
}
assert(unknownStreamRejected, '未知物流未中止 FLO 生成')

let missingResultRejected = false
try {
  patchCopperMetcalFloCase(template, { stages: [] })
} catch {
  missingResultRejected = true
}
assert(missingResultRejected, '无有效产出结果时仍生成了 FLO')

const legacyPath = process.argv[2]
if (legacyPath) {
  const legacy = buildMetcalFloImportBundle(arrayBufferFromFile(legacyPath), {
    referenceTemplateBuffer: template,
  })
  assert(legacy.stages.map((stage) => stage.stageId).join(',') === 'smelting', '旧附件未排除模板吹炼段')
  assert(
    !legacy.stages[0]!.rawMaterials.some(
      (material) => material.name === '渣精矿' || material.name === '吹炼渣'
    ),
    '旧附件仍显示渣精矿或吹炼渣模板残值'
  )
  assert(
    approx(legacy.stages[0]!.extraction.blend?.phaseRatios.Other ?? 0, 4.16198275074376),
    '旧附件混合铜精矿 Other 未保留在物相数据中'
  )
  const legacyStage = legacy.stages[0]!
  const legacyPhaseColumns = buildMetcalPhasePreviewColumns(legacyStage)
  const legacyBlendPhase = legacyPhaseColumns.find((column) => column.category === '混料')
  assert(legacyBlendPhase, '旧附件缺少混合铜精矿物相预览')
  assert(
    phaseKeysForMetcalPreviewColumn(legacyBlendPhase).filter((key) => key === 'Other').length === 1,
    '旧附件混合铜精矿 Other 在物相预览中重复显示'
  )
}

console.log('copper MetCal FLO validation passed')
