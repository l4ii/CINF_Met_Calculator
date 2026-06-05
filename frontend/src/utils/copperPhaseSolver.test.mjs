import assert from 'node:assert/strict'

const { solvePhaseDistribution } = await import('./copperPhaseSolver.ts')
const { phaseFractionsFromFormula } = await import('./chemicalFormula.ts')
const { COPPER_BUILTIN_PHASE_FRACTIONS } = await import('./copperPhaseStoichiometry.ts')
const { normalizeCopperRatios, emptyCopperRatios, calculateOrderedPhaseElementCompletion } = await import(
  './copperWorkflowCalc.ts'
)

const cuConcA = normalizeCopperRatios({
  ...emptyCopperRatios(),
  'Cu(铜)': 32.22,
  'Fe(铁)': 25.95,
  'S (硫)': 31.95,
  'Pb(铅)': 8.66,
  'SiO₂(二氧化硅)': 0.41,
  'CaO(氧化钙)': 0.09,
  'Al₂O₃(三氧化二铝)': 1.21,
})

const concAPhases = [
  { id: 'Cu2S', fractions: COPPER_BUILTIN_PHASE_FRACTIONS.Cu2S },
  { id: 'CuFeS2', fractions: phaseFractionsFromFormula('CuFeS2') },
  { id: 'FeS2', fractions: phaseFractionsFromFormula('FeS2') },
  { id: 'PbS', fractions: phaseFractionsFromFormula('PbS') },
  { id: 'SiO2', fractions: COPPER_BUILTIN_PHASE_FRACTIONS.SiO2 },
  { id: 'CaO', fractions: COPPER_BUILTIN_PHASE_FRACTIONS.CaO },
  { id: 'Al2O3', fractions: COPPER_BUILTIN_PHASE_FRACTIONS.Al2O3 },
]

const concAResult = solvePhaseDistribution(concAPhases, cuConcA)
assert.equal(concAResult.valid, true, concAResult.message ?? 'conc A should solve')
assert.ok(Math.abs((concAResult.amounts.Cu2S ?? 0) - 4.008) < 0.05, `Cu2S expected ~4.0, got ${concAResult.amounts.Cu2S}`)
assert.ok(Math.abs((concAResult.amounts.CuFeS2 ?? 0) - 83.76) < 0.45, `CuFeS2 expected ~83.8, got ${concAResult.amounts.CuFeS2}`)
assert.ok(Math.abs((concAResult.amounts.FeS2 ?? 0) - 0.96) < 0.05, `FeS2 expected ~0.96, got ${concAResult.amounts.FeS2}`)
assert.ok(Math.abs((concAResult.amounts.PbS ?? 0) - 10.0) < 0.05, `PbS expected ~10.0, got ${concAResult.amounts.PbS}`)
assert.ok(Math.abs((concAResult.amounts.SiO2 ?? 0) - 0.41) < 0.02, 'SiO2 should match assay directly')
assert.ok(Math.abs((concAResult.amounts.CaO ?? 0) - 0.09) < 0.02, 'CaO should match assay directly')
assert.ok(Math.abs((concAResult.amounts.Al2O3 ?? 0) - 1.21) < 0.02, 'Al2O3 should match assay directly')

const underdetermined = solvePhaseDistribution(
  [
    { id: 'Cu2S', fractions: COPPER_BUILTIN_PHASE_FRACTIONS.Cu2S },
    { id: 'FeS', fractions: COPPER_BUILTIN_PHASE_FRACTIONS.FeS },
    { id: 'S', fractions: COPPER_BUILTIN_PHASE_FRACTIONS.S },
    { id: 'Cu2O', fractions: COPPER_BUILTIN_PHASE_FRACTIONS.Cu2O },
  ],
  { 'Cu(铜)': 24, 'Fe(铁)': 28, 'S (硫)': 31 }
)
assert.equal(underdetermined.valid, false)
assert.equal(underdetermined.status, 'underdetermined')

const inconsistent = solvePhaseDistribution(
  [
    { id: 'Cu2S', fractions: COPPER_BUILTIN_PHASE_FRACTIONS.Cu2S },
    { id: 'S', fractions: COPPER_BUILTIN_PHASE_FRACTIONS.S },
  ],
  { 'Cu(铜)': 10, 'S (硫)': 1 }
)
assert.equal(inconsistent.valid, false)
assert.equal(inconsistent.status, 'inconsistent')

const overdetermined = solvePhaseDistribution(
  [
    { id: 'Cu2S', fractions: COPPER_BUILTIN_PHASE_FRACTIONS.Cu2S },
    { id: 'FeS', fractions: COPPER_BUILTIN_PHASE_FRACTIONS.FeS },
  ],
  { 'Cu(铜)': 24, 'Fe(铁)': 28, 'S (硫)': 31, 'SiO₂(二氧化硅)': 8 }
)
assert.equal(overdetermined.valid, true)
assert.ok(Object.keys(overdetermined.residual).length > 0, 'residual Si should remain for Other closure')

const ordered = calculateOrderedPhaseElementCompletion(cuConcA, [
  { id: 'Cu2S', kind: 'custom', fractions: phaseFractionsFromFormula('Cu2S') },
  { id: 'CuFeS2', kind: 'custom', fractions: phaseFractionsFromFormula('CuFeS2') },
  { id: 'FeS2', kind: 'custom', fractions: phaseFractionsFromFormula('FeS2') },
  { id: 'PbS', kind: 'custom', fractions: phaseFractionsFromFormula('PbS') },
  { id: 'SiO2', kind: 'builtin', builtinKey: 'SiO2', fractions: COPPER_BUILTIN_PHASE_FRACTIONS.SiO2 },
  { id: 'CaO', kind: 'builtin', builtinKey: 'CaO', fractions: COPPER_BUILTIN_PHASE_FRACTIONS.CaO },
  { id: 'Al2O3', kind: 'builtin', builtinKey: 'Al2O3', fractions: COPPER_BUILTIN_PHASE_FRACTIONS.Al2O3 },
  { id: 'Other', kind: 'other' },
])
assert.equal(ordered.valid, true)
assert.ok((ordered.phaseContents.CuFeS2 ?? 0) > 80)

console.log('copperPhaseSolver checks passed')
