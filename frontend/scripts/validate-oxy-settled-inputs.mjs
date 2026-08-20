import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  resolveOxySolverColdStartInputs,
  resolveOxySolverRecommendedInputs,
} from '../src/utils/copperOxySolverInputs.ts'

const material = (name, weight, moisture = 0) => ({
  id: name,
  name,
  kind: 'raw',
  weight,
  waterWeight: 0,
  moisture,
  ratios: { 'Cu(铜)': 0 },
})

const sourceFuel = { ...material('煤', 0), kind: 'fuel' }
const sourceSolvent = material('石灰石', 1)
const sourceAir = { ...material('空气', 2, 5), kind: 'oxygen', airRole: 'air' }

const resolved = resolveOxySolverRecommendedInputs({
  result: {
    recommended: {
      fuelWeight: 0,
      fuelWaterWeight: 0,
      fuelMoisture: 0,
      solventWeights: { 石灰石: 2.5 },
      gasWeights: { 空气: 7 },
    },
  },
  fuelColumn: sourceFuel,
  solventColumns: [sourceSolvent],
  airColumns: [sourceAir],
})

assert.equal(resolved.solventColumns[0].weight, 2.5)
assert.equal(resolved.airColumns[0].weight, 7)
assert.ok(Math.abs(resolved.airColumns[0].waterWeight - 0.35) < 1e-12)
assert.equal(sourceSolvent.weight, 1, 'source solvent remains unchanged')
assert.equal(sourceAir.weight, 2, 'source gas remains unchanged')

const coldStart = resolveOxySolverColdStartInputs({
  fuelColumn: { ...sourceFuel, weight: 3, waterWeight: 0.2 },
  solventColumns: [{ ...sourceSolvent, weight: 4 }],
  airColumns: [{ ...sourceAir, weight: 5 }],
  manualInputWeights: {
    fuel: true,
    solvents: { [sourceSolvent.id]: true },
    gases: { [sourceAir.id]: true },
  },
})
assert.equal(coldStart.fuelColumn.weight, 3, 'manual coal stays fixed on cold start')
assert.equal(coldStart.solventColumns[0].weight, 4, 'manual flux stays fixed on cold start')
assert.equal(coldStart.airColumns[0].weight, 5, 'manual gas stays fixed on cold start')

const coldUnknowns = resolveOxySolverColdStartInputs({
  fuelColumn: { ...sourceFuel, weight: 3, waterWeight: 0.2 },
  solventColumns: [{ ...sourceSolvent, weight: 4 }],
  airColumns: [{ ...sourceAir, weight: 5 }],
})
assert.equal(coldUnknowns.fuelColumn.weight, 0, 'unentered coal starts from zero')
assert.equal(coldUnknowns.fuelColumn.waterWeight, 0, 'unentered coal water starts from zero')
assert.equal(coldUnknowns.solventColumns[0].weight, 0, 'unentered flux starts from zero')
assert.equal(coldUnknowns.solventColumns[0].waterWeight, 0, 'unentered flux water starts from zero')
assert.equal(coldUnknowns.airColumns[0].weight, 0, 'unentered gas starts from zero')
assert.equal(coldUnknowns.airColumns[0].waterWeight, 0, 'unentered gas water starts from zero')

const sharedSession = await readFile(
  new URL('../src/components/modules/copper/shared/CopperOxySideBlowSession.tsx', import.meta.url),
  'utf8'
)
assert.match(
  sharedSession,
  /const resolvedInputs = resolveOxySolverRecommendedInputs\(\{\s*result: solverResult,/,
  'final product result resolves its own input boundary'
)
assert.match(
  sharedSession,
  /fuelColumn: resolvedInputs\.fuelColumn/,
  'final result is cached with the resolved fuel column'
)
assert.match(
  sharedSession,
  /solventColumns: resolvedInputs\.solventColumns/,
  'final result is cached with the resolved solvent columns'
)
assert.match(
  sharedSession,
  /airColumns: resolvedInputs\.airColumns/,
  'final result is cached with the resolved gas columns'
)
assert.match(
  sharedSession,
  /const solverResult = settled/,
  'only the final settled solver result is eligible for fill-back'
)
assert.doesNotMatch(
  sharedSession,
  /const solverResult = settled\.acceptable \? settled : iterative\.result/,
  'an earlier iterative pass must not bypass final settlement failure'
)

for (const path of [
  '../src/components/modules/copper/shared/CopperOxySideBlowSession.tsx',
  '../src/components/modules/copper/smelting/SmeltingBatchCalcPage.tsx',
  '../src/components/modules/copper/converting/ConvertingBatchCalcPage.tsx',
]) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8')
  assert.match(
    source,
    /const \[productCalculationFailure, setProductCalculationFailure\] = useState<OxyConstraintSolverResult \| null>\(null\)/,
    `${path}: keeps failed final settlement diagnostics separate from the last accepted fill-back`
  )
  assert.match(
    source,
    /if \(!canFillBack\) \{\s*setProductCalculationFailure\(solverResult\)/,
    `${path}: retains the failed final settlement result for diagnostics`
  )
  assert.match(
    source,
    /const conflictResult = productCalculationFailure \?\? oxySolverResult/,
    `${path}: renders the newest failed calculation diagnostics`
  )
  assert.match(
    source,
    /const \[productCalculationError, setProductCalculationError\] = useState<string \| null>\(null\)/,
    `${path}: keeps unexpected calculation exceptions visible`
  )
  assert.doesNotMatch(
    source,
    /applyOxySolverRecommendedInputs/,
    `${path}: uses the shared recommended-input resolver that is actually imported`
  )
  assert.match(
    source,
    /setProductCalculationError\(userMessage\)[\s\S]{0,300}setWorkflowMessage\(workflowStepMessage\(6, userMessage\), 'error'\)/,
    `${path}: converts unexpected calculation exceptions into a user-facing error`
  )
  assert.doesNotMatch(
    source,
    /\n\s*throw error\n/,
    `${path}: product calculation must not rethrow into a blank UI state`
  )
  assert.match(
    source,
    /productCalculationError && !isProductCalculating/,
    `${path}: keeps unexpected calculation errors visible after the progress dialog closes`
  )
  assert.match(source, /产出计算异常，未生成结果/, `${path}: labels unexpected calculation failures`)
}

for (const path of [
  '../src/components/modules/copper/smelting/SmeltingBatchCalcPage.tsx',
  '../src/components/modules/copper/converting/ConvertingBatchCalcPage.tsx',
]) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8')
  assert.match(
    source,
    /resolveOxySolverColdStartInputs\(\{[\s\S]{0,500}manualInputWeights: params\.manualInputWeights/,
    `${path}: cold start preserves only user-owned input columns`
  )
  assert.match(
    source,
    /manualInputWeights: \{[\s\S]{0,180}fuel: state\.manualFuelWeightValid,[\s\S]{0,180}solvents: state\.manualSolventWeights,[\s\S]{0,180}gases: state\.manualAirWeights/,
    `${path}: product recovery forwards every manual input marker`
  )
  assert.match(
    source,
    /manualAirWeights: candidate\.manualAirWeights \?\? \{\}/,
    `${path}: imported cases retain per-gas manual markers`
  )
}

console.log('oxy settled input resolution passed')
