import type { MetcalFloFeedStream } from './metcalFloMixExtract.ts'
import { normalizeMetcalPhaseFormula } from './chemicalFormula.ts'
import type { PhaseBatchResults, PhaseMaterialCalcResult } from './antimonyPhaseBatchCalc.ts'
import {
  createConcentrateMaterialPhaseRows,
  createMaterialPhaseRowsFromFormulas,
  type MaterialPhaseAssistRow,
} from './antimonyPhaseAssist.ts'
import type { AntimonyMaterialColumn } from './antimonyWorkflowCalc.ts'

export type AntimonyMetcalImportedPhaseState = {
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

/** Restore imported MetCal feed phases with antimony-native phase rows and result types. */
export function buildAntimonyMetcalImportedPhaseState(
  materials: AntimonyMaterialColumn[],
  feeds: Pick<MetcalFloFeedStream, 'name' | 'phaseRatios'>[]
): AntimonyMetcalImportedPhaseState {
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
