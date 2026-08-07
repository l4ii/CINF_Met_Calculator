import {
  buildDefaultMaterialPhaseContentsByKey,
  createDefaultMaterialPhaseRowsForMaterial,
  type MaterialPhaseAssistRow,
} from '../../../../utils/copperPhaseAssist.ts'
import {
  buildBlendPhaseMassFromMaterialResults,
  phaseContentsToConstraintPhaseMap,
  type PhaseBatchResults,
  type PhaseMaterialCalcResult,
} from '../../../../utils/copperPhaseBatchCalc.ts'
import {
  sourceMaterialFromColumn,
  type CopperHeatBalanceSourceMaterial,
} from '../../../../utils/copperHeatBalance.ts'
import {
  materialWaterWeight,
  partitionRawMixMaterials,
  type CopperMaterialColumn,
} from '../../../../utils/copperWorkflowCalc.ts'
import type { CopperFuelMaterial } from '../../../../utils/copperProcessCalc.ts'

function storedPhaseOverridesToMap(stored: Record<string, string> | undefined): Record<string, number> | null {
  if (!stored) return null
  const next: Record<string, number> = {}
  for (const [key, raw] of Object.entries(stored)) {
    const value = Number.parseFloat(raw)
    if (Number.isFinite(value) && value > 0) next[key] = value
  }
  return Object.keys(next).length > 0 ? next : null
}

export type SmeltingHeatBalanceMaterialParams = {
  rawMaterials: CopperMaterialColumn[]
  solventColumns: CopperMaterialColumn[]
  fuelColumn: CopperFuelMaterial
  airColumns: CopperMaterialColumn[]
  phaseBatchResults: PhaseBatchResults | null | undefined
  materialPhaseRows: Record<string, MaterialPhaseAssistRow[]>
  manualPhaseRatioColumns?: Record<string, boolean>
  phaseRatioOverrides?: Record<string, Record<string, string>>
  concentrateMass: number
}

/** 熔炼热平衡投入物相：混合铜精矿 + 其它原料 + 熔剂 + 燃料 + 风 */
export function buildSmeltingHeatBalanceSourceMaterials(
  params: SmeltingHeatBalanceMaterialParams
): CopperHeatBalanceSourceMaterial[] {
  const { concentrates, others } = partitionRawMixMaterials(params.rawMaterials)
  const validPhaseResults = concentrates
    .map((material) => params.phaseBatchResults?.[material.id])
    .filter((result): result is PhaseMaterialCalcResult => Boolean(result?.valid))
  const blendPhaseMass =
    validPhaseResults.length > 0
      ? buildBlendPhaseMassFromMaterialResults(validPhaseResults, params.materialPhaseRows)
      : null
  const rawBlendDryWeight = Math.max(0, params.concentrateMass)
  const rawBlendWaterWeight = concentrates.reduce(
    (sum, material) => sum + (material.weight > 0 ? materialWaterWeight(material) : 0),
    0
  )
  const rawBlendMaterial: CopperHeatBalanceSourceMaterial | null =
    rawBlendDryWeight > 0 && blendPhaseMass && Object.keys(blendPhaseMass).length > 0
      ? {
          id: 'mixed-copper-concentrate',
          name: '混合铜精矿',
          kind: 'raw',
          dryWeight: rawBlendDryWeight,
          waterWeight: rawBlendWaterWeight,
          phases: Object.fromEntries(
            Object.entries(blendPhaseMass).map(([phase, mass]) => [
              phase,
              (Math.max(0, mass) / rawBlendDryWeight) * 100,
            ])
          ),
        }
      : null

  const phaseContentsForMaterial = (material: CopperMaterialColumn) => {
    const rows = createDefaultMaterialPhaseRowsForMaterial(material)
    const manualOverrides = params.manualPhaseRatioColumns?.[material.id]
      ? storedPhaseOverridesToMap(params.phaseRatioOverrides?.[material.id])
      : null
    return manualOverrides ?? buildDefaultMaterialPhaseContentsByKey(material.ratios, rows)
  }

  const heatBalancePhasesFromResult = (
    material: CopperMaterialColumn,
    phaseResult: PhaseMaterialCalcResult
  ) =>
    phaseContentsToConstraintPhaseMap(
      phaseResult.phaseContents,
      params.materialPhaseRows[material.id] ?? [],
      phaseResult.unknowns
    )

  const otherMaterials = others.flatMap((material) => {
    if (material.weight <= 0) return []
    const phaseResult = params.phaseBatchResults?.[material.id]
    const phases = phaseResult?.valid
      ? heatBalancePhasesFromResult(material, phaseResult)
      : phaseContentsForMaterial(material)
    return [sourceMaterialFromColumn(material, phases)]
  })

  const solventMaterials = params.solventColumns.flatMap((material) => {
    if (material.weight <= 0) return []
    const phaseResult = params.phaseBatchResults?.[material.id]
    const phases = phaseResult?.valid
      ? heatBalancePhasesFromResult(material, phaseResult)
      : phaseContentsForMaterial(material)
    return [sourceMaterialFromColumn(material, phases)]
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
    ...(rawBlendMaterial ? [rawBlendMaterial] : []),
    ...otherMaterials,
    ...solventMaterials,
    ...fuelMaterials,
    ...airMaterials,
  ]
}
