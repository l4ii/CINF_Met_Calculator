import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { autoFillOxyProductConstraintConfig } from '../src/utils/copperConstraintValidation.ts'
import { compileOxyConstraintSystem } from '../src/utils/copperConstraintSystemCompiler.ts'
import { solveOxySideBlowProducts } from '../src/utils/copperConstraintSolver.ts'
import { calculateWeightedComposition } from '../src/utils/copperWorkflowCalc.ts'

const casePath = 'C:/Users/0303003/Desktop/测试.metcal'
const document = JSON.parse(readFileSync(casePath, 'utf8'))
const stage = document.case?.processStages?.cu_smelting
assert(stage, '测试.metcal must contain a cu_smelting stage')

const rawMaterials = stage.rawMaterials ?? []
const solventColumns = stage.solventColumns ?? []
const airColumns = stage.airColumns ?? []
const fuelColumn = stage.fuelColumn
const baseConfig = autoFillOxyProductConstraintConfig(stage.productConstraintConfig).config
const config = {
  ...baseConfig,
  solverParams: { ...baseConfig.solverParams, newtonMaxIterations: 500 },
}
const concentrateMass = rawMaterials.reduce((sum, material) => sum + Math.max(0, material.weight), 0)
const inputPhaseMass = {}
for (const result of Object.values(stage.phaseBatchResults ?? {})) {
  if (!result?.valid) continue
  for (const [phase, percent] of Object.entries(result.phaseContents ?? {})) {
    inputPhaseMass[phase] = (inputPhaseMass[phase] ?? 0) +
      (Math.max(0, result.weight) * (Number(percent) || 0)) / 100
  }
}

const equations = compileOxyConstraintSystem(config)
assert(
  equations.some((equation) => equation.id === 'mass_balance:total'),
  'smelting constraints must include a total mass balance hard equation'
)

const result = await solveOxySideBlowProducts({
  blendFeed: calculateWeightedComposition([...rawMaterials, ...solventColumns, fuelColumn, ...airColumns]),
  rawFeed: calculateWeightedComposition(rawMaterials),
  rawMaterialColumns: rawMaterials,
  concentrateMass,
  inputPhaseMass: { 混合铜精矿: inputPhaseMass },
  fuelColumn,
  solventColumns,
  airColumns,
  manualInputWeights: {
    fuel: Boolean(stage.manualFuelWeightValid),
    solvents: stage.manualSolventWeights ?? {},
    gases: stage.manualAirWeights ?? {},
  },
  config,
})

assert(result.materialMassBalance, 'solver must report material mass balance')
console.log(JSON.stringify({
  acceptanceLevel: result.acceptanceLevel,
  converged: result.converged,
  iterations: result.iterations,
  maxRelativeResidual: result.maxRelativeResidual,
  materialMassBalance: result.materialMassBalance,
  topHardResiduals: result.constraintResiduals
    .filter((row) => !row.soft)
    .sort((a, b) => b.relativeResidual - a.relativeResidual)
    .slice(0, 8)
    .map(({ kind, label, relativeResidual, value, target }) => ({ kind, label, relativeResidual, value, target })),
  products: Object.fromEntries(Object.entries(result.products).map(([key, product]) => [key, {
    mass: product.mass,
    other: product.phases.find((phase) => phase.key === 'Other')?.mass ?? 0,
  }])),
}, null, 2))
assert(
  result.materialMassBalance.relativeResidual <= 1e-5,
  `wet-basis mass balance must close: ${JSON.stringify(result.materialMassBalance)}`
)

const quartz = solventColumns.find((column) => column.name === '石英石')
const quartzRecommended = result.recommended.solventWeights['石英石']
if (quartz && stage.manualSolventWeights?.[quartz.id]) {
  assert(
    Math.abs(quartzRecommended - quartz.weight) <= 1e-9,
    `manual quartz input must stay fixed: ${quartzRecommended} vs ${quartz.weight}`
  )
}

assert(result.recommended.fuelWeight >= 0, 'coal must remain a solver-derived non-negative input')
assert(result.recommended.gasWeights, 'gas inputs must remain solver-visible unknowns')

const manuallyEnteredAir = airColumns.find((column) => column.name === '空气')
assert(manuallyEnteredAir, 'sample must provide a process-air column')
const manualAirResult = await solveOxySideBlowProducts({
  blendFeed: calculateWeightedComposition([...rawMaterials, ...solventColumns, fuelColumn, ...airColumns]),
  rawFeed: calculateWeightedComposition(rawMaterials),
  rawMaterialColumns: rawMaterials,
  concentrateMass,
  inputPhaseMass: { 混合铜精矿: inputPhaseMass },
  fuelColumn,
  solventColumns,
  airColumns,
  manualInputWeights: { gases: { [manuallyEnteredAir.id]: true } },
  config,
})
assert.equal(
  manualAirResult.recommended.gasWeights[manuallyEnteredAir.name],
  manuallyEnteredAir.weight,
  'a manually entered gas weight must remain fixed'
)
assert.ok(
  Math.abs(manualAirResult.materialMassBalance?.residual ?? Infinity) <= 1e-9,
  `manual inputs must retain wet-basis mass closure: ${JSON.stringify(manualAirResult.materialMassBalance)}`
)
console.log('copper hard mass balance validation passed')
