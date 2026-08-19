import {
  buildDefaultMaterialPhaseContentsByKey,
  createDefaultMaterialPhaseRowsForMaterial,
  type MaterialPhaseAssistRow,
} from '../../../../utils/antimonyPhaseAssist.ts'
import {
  phaseContentsToConstraintPhaseMap,
  type PhaseBatchResults,
  type PhaseMaterialCalcResult,
} from '../../../../utils/antimonyPhaseBatchCalc.ts'
import {
  sourceMaterialFromColumn,
  type AntimonyHeatBalanceSourceMaterial,
} from '../../../../utils/antimonyHeatBalance.ts'
import type { AntimonyMaterialColumn } from '../../../../utils/antimonyWorkflowCalc.ts'
import type { AntimonyFuelMaterial } from '../../../../utils/antimonyProcessCalc.ts'
import {
  CONVERTING_LIME_SOLVENT_ID,
  CONVERTING_OXIDE_SLAG_ID,
  CONVERTING_SCRAP_1_ID,
  CONVERTING_SCRAP_2_ID,
  CONVERTING_WHITE_MATTE_ID,
} from '../../../../utils/antimonyConvertingFeed.ts'

function storedPhaseOverridesToMap(stored: Record<string, string> | undefined): Record<string, number> | null {
  if (!stored) return null
  const next: Record<string, number> = {}
  for (const [key, raw] of Object.entries(stored)) {
    const value = Number.parseFloat(raw)
    if (Number.isFinite(value) && value > 0) next[key] = value
  }
  return Object.keys(next).length > 0 ? next : null
}

export type ConvertingHeatBalanceMaterialParams = {
  rawMaterials: AntimonyMaterialColumn[]
  solventColumns: AntimonyMaterialColumn[]
  fuelColumn: AntimonyFuelMaterial
  airColumns: AntimonyMaterialColumn[]
  phaseBatchResults: PhaseBatchResults | null | undefined
  materialPhaseRows: Record<string, MaterialPhaseAssistRow[]>
  manualPhaseRatioColumns?: Record<string, boolean>
  phaseRatioOverrides?: Record<string, Record<string, string>>
}

/**
 * 吹炼热平衡投入物相：锑锍 / 残极 / 氧化渣 / 石灰石 / 风。
 * 物相键保留化学式（不经 InputPhaseMap 压成 Other），焓上下文用吹炼表。
 */
export function buildConvertingHeatBalanceSourceMaterials(
  params: ConvertingHeatBalanceMaterialParams
): AntimonyHeatBalanceSourceMaterial[] {
  const phaseContentsForMaterial = (material: AntimonyMaterialColumn) => {
    const rows = createDefaultMaterialPhaseRowsForMaterial(material)
    const manualOverrides = params.manualPhaseRatioColumns?.[material.id]
      ? storedPhaseOverridesToMap(params.phaseRatioOverrides?.[material.id])
      : null
    return manualOverrides ?? buildDefaultMaterialPhaseContentsByKey(material.ratios, rows)
  }

  const heatBalancePhasesFromResult = (
    material: AntimonyMaterialColumn,
    phaseResult: PhaseMaterialCalcResult
  ) =>
    phaseContentsToConstraintPhaseMap(
      phaseResult.phaseContents,
      params.materialPhaseRows[material.id] ?? [],
      phaseResult.unknowns
    )

  const sourceFromConvertingRawMaterial = (material: AntimonyMaterialColumn) => {
    const phaseResult = params.phaseBatchResults?.[material.id]
    const phases = phaseResult?.valid
      ? heatBalancePhasesFromResult(material, phaseResult)
      : phaseContentsForMaterial(material)
    const options =
      material.id === CONVERTING_WHITE_MATTE_ID
        ? { temperatureC: 1245, enthalpyContext: 'convertingMatteFeed' as const }
        : material.id === CONVERTING_OXIDE_SLAG_ID
          ? { enthalpyContext: 'convertingOxideSlagFeed' as const }
          : material.id === CONVERTING_SCRAP_1_ID || material.id === CONVERTING_SCRAP_2_ID
            ? { enthalpyContext: 'convertingScrapFeed' as const }
            : undefined
    return sourceMaterialFromColumn(material, phases, options)
  }

  const solventMaterials = params.solventColumns.flatMap((material) => {
    if (material.weight <= 0) return []
    const phaseResult = params.phaseBatchResults?.[material.id]
    const phases = phaseResult?.valid
      ? heatBalancePhasesFromResult(material, phaseResult)
      : phaseContentsForMaterial(material)
    return [
      sourceMaterialFromColumn(
        material,
        phases,
        material.id === CONVERTING_LIME_SOLVENT_ID
          ? { enthalpyContext: 'convertingLimeFeed' }
          : undefined
      ),
    ]
  })

  const fuelMaterials =
    params.fuelColumn.weight > 0
      ? [
          sourceMaterialFromColumn(
            params.fuelColumn,
            (() => {
              const phaseResult = params.phaseBatchResults?.[params.fuelColumn.id]
              return phaseResult?.valid
                ? heatBalancePhasesFromResult(params.fuelColumn, phaseResult)
                : phaseContentsForMaterial(params.fuelColumn)
            })()
          ),
        ]
      : []

  const airMaterials = params.airColumns.flatMap((material) => {
    if (material.weight <= 0) return []
    return [
      sourceMaterialFromColumn(material, {
        O2: material.ratios['O(氧)'] ?? 0,
        N2: material.ratios['N(氮)'] ?? 0,
      }),
    ]
  })

  return [
    ...params.rawMaterials.filter((material) => material.weight > 0).map(sourceFromConvertingRawMaterial),
    ...solventMaterials,
    ...fuelMaterials,
    ...airMaterials,
  ]
}
