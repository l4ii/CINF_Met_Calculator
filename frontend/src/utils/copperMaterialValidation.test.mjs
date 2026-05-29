import assert from 'node:assert/strict'

const { validateMaterialForPhaseCalc, validateRatiosSulfurRequirement, requiresSulfurInput, hasValidSulfurInput } = await import('./copperMaterialValidation.ts')
const { emptyCopperRatios } = await import('./copperWorkflowCalc.ts')

const base = { id: 'm1', name: '测试矿', kind: 'raw', weight: 100, ratios: emptyCopperRatios() }

assert(!requiresSulfurInput({ 'Si(硅)': 10 }))
assert(requiresSulfurInput({ 'Cu(铜)': 20 }))
assert(hasValidSulfurInput({ 'S (硫)': 5 }))

const missingS = validateMaterialForPhaseCalc({
  ...base,
  ratios: { 'Cu(铜)': 24, 'Fe(铁)': 10 },
})
assert(missingS?.includes('S'), 'Cu/Fe without S should block phase calc')

const ratioError = validateRatiosSulfurRequirement({ 'Cu(铜)': 24 }, '测试矿')
assert(ratioError?.includes('S'), 'ratio validation should mention S')

const ok = validateMaterialForPhaseCalc({
  ...base,
  ratios: { 'Cu(铜)': 24, 'S (硫)': 30 },
})
assert.equal(ok, null)

const siOnly = validateMaterialForPhaseCalc({
  ...base,
  ratios: { 'Si(硅)': 40 },
})
assert.equal(siOnly, null)

console.log('copperMaterialValidation checks passed')
