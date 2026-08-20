import type { OxyConstraintSolverResult } from './copperConstraintSolver.ts'
import type { CopperFuelMaterial } from './copperProcessCalc.ts'
import type { CopperMaterialColumn } from './copperWorkflowCalc.ts'

function cloneMaterialColumn(material: CopperMaterialColumn): CopperMaterialColumn {
  return { ...material, ratios: { ...material.ratios } }
}

function cloneFuelMaterial(material: CopperFuelMaterial): CopperFuelMaterial {
  return { ...material, ratios: { ...material.ratios } }
}

type OxyManualInputWeights = {
  fuel?: boolean
  solvents?: Record<string, boolean>
  gases?: Record<string, boolean>
}

function isManualColumnWeight(flags: Record<string, boolean> | undefined, column: CopperMaterialColumn): boolean {
  return Boolean(flags?.[column.id] || flags?.[column.name])
}

export function resolveOxySolverColdStartInputs(params: {
  fuelColumn: CopperFuelMaterial
  solventColumns: CopperMaterialColumn[]
  airColumns: CopperMaterialColumn[]
  preserveFuelInputWeight?: boolean
  manualInputWeights?: OxyManualInputWeights
}): {
  fuelColumn: CopperFuelMaterial
  solventColumns: CopperMaterialColumn[]
  airColumns: CopperMaterialColumn[]
} {
  const fuelColumn = cloneFuelMaterial(
    params.preserveFuelInputWeight || params.manualInputWeights?.fuel
      ? params.fuelColumn
      : { ...params.fuelColumn, weight: 0, waterWeight: 0 }
  )
  const solventColumns = params.solventColumns.map((column) =>
    cloneMaterialColumn(
      isManualColumnWeight(params.manualInputWeights?.solvents, column)
        ? column
        : { ...column, weight: 0, waterWeight: 0 }
    )
  )
  const airColumns = params.airColumns.map((column) =>
    cloneMaterialColumn(
      isManualColumnWeight(params.manualInputWeights?.gases, column)
        ? column
        : { ...column, weight: 0, waterWeight: 0 }
    )
  )
  return { fuelColumn, solventColumns, airColumns }
}

export function resolveOxySolverRecommendedInputs(params: {
  result: Pick<OxyConstraintSolverResult, 'recommended'>
  fuelColumn: CopperFuelMaterial
  solventColumns: CopperMaterialColumn[]
  airColumns: CopperMaterialColumn[]
}): {
  fuelColumn: CopperFuelMaterial
  solventColumns: CopperMaterialColumn[]
  airColumns: CopperMaterialColumn[]
} {
  const fuelColumn = cloneFuelMaterial({
    ...params.fuelColumn,
    weight: params.result.recommended.fuelWeight,
    waterWeight: params.result.recommended.fuelWaterWeight,
    moisture: params.result.recommended.fuelMoisture,
  })
  const solventColumns = params.solventColumns.map((column) =>
    cloneMaterialColumn({
      ...column,
      weight: params.result.recommended.solventWeights[column.name] ?? column.weight,
    })
  )
  const airColumns = params.airColumns.map((column) => {
    const weight = Math.max(0, params.result.recommended.gasWeights[column.name] ?? column.weight)
    const moisture = Math.max(0, column.moisture ?? 0)
    return cloneMaterialColumn({
      ...column,
      weight,
      waterWeight: weight > 0 && moisture > 0 ? weight * (moisture / 100) : 0,
      moisture,
    })
  })
  return { fuelColumn, solventColumns, airColumns }
}
