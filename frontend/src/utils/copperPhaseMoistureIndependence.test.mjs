import assert from 'node:assert/strict'

import { COPPER_MATERIAL_LIBRARY } from './copperWorkflowCalc.ts'
import {
  createConcentrateMaterialPhaseRows,
  createMaterialPhaseRowsFromFormulas,
} from './copperPhaseAssist.ts'
import {
  buildBlendPhaseMassFromMaterialResults,
  buildPhasePivotRows,
  computeMaterialPhaseResult,
  phaseContentsToConstraintPhaseMap,
  sumPhasePivotTotals,
} from './copperPhaseBatchCalc.ts'

const DRY_FEED_T = 10
const WATER_T = 1
const WET_FEED_T = DRY_FEED_T + WATER_T

function approx(actual, expected, tolerance = 1e-6) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`
  )
}

function libraryMaterial(id) {
  const material = COPPER_MATERIAL_LIBRARY.find((item) => item.id === id)
  assert.ok(material, `missing library material ${id}`)
  return material
}

function assertDryPhaseBasis(result, rows) {
  assert.equal(result.valid, true, result.message ?? 'phase result should be valid')
  assert.equal(result.phaseContents.H2O, undefined)

  const totals = sumPhasePivotTotals(buildPhasePivotRows(rows, result.phaseContents, DRY_FEED_T))
  approx(totals.phaseTotal, 100, 1e-9)
  approx(totals.totalMassTh, DRY_FEED_T, 1e-9)
}

{
  const material = libraryMaterial('cu-conc-a')
  const rows = createMaterialPhaseRowsFromFormulas([
    'FeS2',
    'CuFeS2',
    'Cu2S',
    'SiO2',
    'CaO',
    'PbS',
    'Al2O3',
    'Other',
  ])
  const result = computeMaterialPhaseResult(
    material.id,
    material.name,
    DRY_FEED_T,
    material.ratios,
    rows
  )

  assertDryPhaseBasis(result, rows)
  approx(result.phaseContents['custom:CuFeS2'], 69.9854893338, 1e-6)
  approx(result.phaseContents.Cu2S, 10.0022651062, 1e-6)
  approx(result.phaseContents['custom:FeS2'], 9.9982242192, 1e-6)

  const constraintPhases = phaseContentsToConstraintPhaseMap(result.phaseContents, rows, result.unknowns)
  approx(constraintPhases.CuFeS2, result.phaseContents['custom:CuFeS2'], 1e-9)
  approx(constraintPhases.FeS2, result.phaseContents['custom:FeS2'], 1e-9)
  assert.equal(constraintPhases['custom:CuFeS2'], undefined)

  const constraintMasses = buildBlendPhaseMassFromMaterialResults([result], { [material.id]: rows })
  approx(constraintMasses.CuFeS2, result.phaseContents['custom:CuFeS2'] * DRY_FEED_T / 100, 1e-9)
  approx(constraintMasses.FeS2, result.phaseContents['custom:FeS2'] * DRY_FEED_T / 100, 1e-9)

  const wetDilutedCuFeS2 = result.phaseContents['custom:CuFeS2'] * DRY_FEED_T / WET_FEED_T
  assert.ok(
    Math.abs(result.phaseContents['custom:CuFeS2'] - wetDilutedCuFeS2) > 1,
    'phase w% must not be diluted by water mass'
  )
}

{
  const material = libraryMaterial('cu-conc-internal')
  const rows = createConcentrateMaterialPhaseRows()
  const result = computeMaterialPhaseResult(
    material.id,
    material.name,
    DRY_FEED_T,
    material.ratios,
    rows
  )

  assertDryPhaseBasis(result, rows)
  approx(result.phaseContents['custom:CuFeS2'], 31.4524261521, 1e-6)
  approx(result.phaseContents.Cu2S, 10.2803702161, 1e-6)

  const wetDilutedCu2S = result.phaseContents.Cu2S * DRY_FEED_T / WET_FEED_T
  assert.ok(
    Math.abs(result.phaseContents.Cu2S - wetDilutedCu2S) > 0.5,
    'system concentrate phase w% must not be diluted by water mass'
  )
}

console.log('copper phase moisture independence tests passed')
