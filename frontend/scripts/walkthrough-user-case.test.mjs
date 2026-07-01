/**
 * 四矿 USER_CASE 约束求解回归测试（与 walkthrough-user-case.mjs 同路径）
 */
import assert from 'node:assert/strict'

import { loadOxySideBlowConstraints } from '../src/utils/copperConstraintConfig.ts'
import { solveOxySideBlowProducts } from '../src/utils/copperConstraintSolver.ts'
import { DEFAULT_COPPER_FUEL } from '../src/utils/copperProcessCalc.ts'
import { createConcentrateMaterialPhaseRows } from '../src/utils/copperPhaseAssist.ts'
import {
  buildBlendPhaseMassFromMaterialResults,
  computeMaterialPhaseResult,
} from '../src/utils/copperPhaseBatchCalc.ts'
import {
  COPPER_MATERIAL_LIBRARY,
  calculateWeightedComposition,
  createDefaultSolventColumns,
  createProcessAirColumns,
  deriveDryBasisMoisturePercent,
  materialWaterWeight,
  normalizeCopperRatios,
} from '../src/utils/copperWorkflowCalc.ts'
import {
  validateOxySolverResultForFillBack,
  validateRawMaterialPhaseInputs,
} from '../src/utils/copperOxySolverValidation.ts'

const USER_CASE = [
  { id: 'cu-conc-internal', dry: 37.14, water: 4.58 },
  { id: 'cu-conc-domestic', dry: 27.45, water: 2.88 },
  { id: 'cu-conc-import', dry: 127.69, water: 11.67 },
  { id: 'cu-conc-border', dry: 6.38, water: 0.67 },
]

const EXPECTED = {
  matteMass: 56.9,
  matteCuPct: 75,
  dustMass: 2.9,
  slagMassMin: 122,
  slagMassMax: 125,
  totalMass: 336,
  dustZnOPct: 37,
  matteCu2SPct: 94,
}

function libraryMaterial(id) {
  const material = COPPER_MATERIAL_LIBRARY.find((item) => item.id === id)
  if (!material) throw new Error(`missing library material ${id}`)
  return material
}

function approx(actual, expected, tolerance, label) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${label ?? 'value'}: expected ${actual} within ±${tolerance} of ${expected}`
  )
}

function inRange(actual, min, max, label) {
  assert.ok(actual >= min && actual <= max, `${label ?? 'value'}: ${actual} not in [${min}, ${max}]`)
}

function applyRecommendedWeights(fuel, solvents, air, recommended) {
  return {
    nextFuel: { ...fuel, weight: recommended.fuelWeight },
    nextSolvents: solvents.map((col) => ({
      ...col,
      weight: recommended.solventWeights[col.name] ?? col.weight,
    })),
    nextAir: air.map((col) => ({
      ...col,
      weight: recommended.gasWeights[col.name] ?? col.weight,
    })),
  }
}

function runUserCaseSolve() {
  const concentrateRows = createConcentrateMaterialPhaseRows()
  const materialPhaseRows = {}

  const rawMaterials = USER_CASE.map((row, index) => {
    const lib = libraryMaterial(row.id)
    const waterWeight = Math.max(0, row.water)
    const moisture = deriveDryBasisMoisturePercent(row.dry, waterWeight)
    return {
      id: `raw-${index + 1}`,
      name: lib.name,
      kind: 'raw',
      weight: row.dry,
      waterWeight,
      moisture,
      ratios: { ...lib.ratios },
      unitPrice: lib.unitPrice,
      libraryId: lib.id,
    }
  })

  for (const material of rawMaterials) {
    materialPhaseRows[material.id] = concentrateRows
  }

  const phaseResults = rawMaterials.map((material) =>
    computeMaterialPhaseResult(
      material.id,
      material.name,
      material.weight,
      material.ratios,
      materialPhaseRows[material.id]
    )
  )

  const concentrateMass = rawMaterials.reduce((sum, m) => sum + m.weight, 0)
  const blendPhaseMass = buildBlendPhaseMassFromMaterialResults(
    phaseResults.map((result) => ({
      materialId: result.materialId,
      materialName: result.materialName,
      weight: result.weight,
      phaseContents: result.phaseContents,
      unknowns: result.unknowns,
      valid: result.valid,
    })),
    materialPhaseRows
  )

  const phaseValidation = validateRawMaterialPhaseInputs({
    rawMaterials,
    phaseBatchResults: Object.fromEntries(phaseResults.map((r) => [r.materialId, r])),
    blendPhaseMass,
  })
  assert.equal(phaseValidation.ok, true, phaseValidation.message)

  const fuelColumn = {
    ...DEFAULT_COPPER_FUEL,
    ratios: { ...DEFAULT_COPPER_FUEL.ratios },
    weight: 0,
    waterWeight: 0,
    moisture: DEFAULT_COPPER_FUEL.moisture,
  }
  const solventColumns = createDefaultSolventColumns()
  const airColumns = createProcessAirColumns()
  const rawBlend = calculateWeightedComposition(rawMaterials)
  const config = loadOxySideBlowConstraints()

  let activeFuel = fuelColumn
  let activeSolvents = solventColumns
  let activeAir = airColumns
  let activeFurnaceFeed = calculateWeightedComposition([
    ...rawMaterials,
    ...activeSolvents,
    activeFuel,
    ...activeAir,
  ])

  let solverResult = solveOxySideBlowProducts({
    blendFeed: activeFurnaceFeed,
    rawFeed: rawBlend,
    rawMaterialColumns: rawMaterials,
    concentrateMass,
    inputPhaseMass: { 混合铜精矿: blendPhaseMass },
    fuelColumn: activeFuel,
    solventColumns: activeSolvents,
    airColumns: activeAir,
    config,
  })

  for (let pass = 0; pass < 2 && !solverResult.converged; pass += 1) {
    const applied = applyRecommendedWeights(activeFuel, activeSolvents, activeAir, solverResult.recommended)
    activeFuel = applied.nextFuel
    activeSolvents = applied.nextSolvents
    activeAir = applied.nextAir
    activeFurnaceFeed = calculateWeightedComposition([
      ...rawMaterials,
      ...activeSolvents,
      activeFuel,
      ...activeAir,
    ])
    solverResult = solveOxySideBlowProducts({
      blendFeed: activeFurnaceFeed,
      rawFeed: rawBlend,
      rawMaterialColumns: rawMaterials,
      concentrateMass,
      inputPhaseMass: { 混合铜精矿: blendPhaseMass },
      fuelColumn: activeFuel,
      solventColumns: activeSolvents,
      airColumns: activeAir,
      config,
    })
  }

  return { solverResult, concentrateMass }
}

const { solverResult, concentrateMass } = runUserCaseSolve()

assert.equal(solverResult.converged, true, 'solver should converge')
assert.equal(solverResult.acceptable, true, 'solver should be acceptable')

const fillBack = validateOxySolverResultForFillBack(solverResult, {
  matteCopperGrade: 75,
  concentrateMass,
})
assert.equal(fillBack.ok, true, fillBack.message)

const matte = solverResult.products.matte
const slag = solverResult.products.smeltingSlag
const dust = solverResult.products.dust

approx(matte.mass, EXPECTED.matteMass, 0.5, '白铜锍 t/h')
approx(matte.composition['Cu(铜)'] ?? 0, EXPECTED.matteCuPct, 0.5, '白铜锍 Cu W%')
approx(dust.mass, EXPECTED.dustMass, 0.5, '烟气含尘 t/h')
inRange(slag.mass, EXPECTED.slagMassMin, EXPECTED.slagMassMax, '熔炼渣 t/h')
approx(solverResult.totalProductMass, EXPECTED.totalMass, 1, '总产出 t/h')

const dustZnO = dust.phases.find((p) => p.key === 'ZnO')
approx(dustZnO?.pct ?? 0, EXPECTED.dustZnOPct, 1, '烟尘 ZnO w%')

const matteCu2S = matte.phases.find((p) => p.key === 'Cu2S')
approx(matteCu2S?.pct ?? 0, EXPECTED.matteCu2SPct, 1, '白铜锍 Cu2S w%')

console.log('walkthrough user case regression tests passed')
console.log(
  `  matte=${matte.mass.toFixed(2)} slag=${slag.mass.toFixed(2)} dust=${dust.mass.toFixed(2)} total=${solverResult.totalProductMass.toFixed(2)}`
)
