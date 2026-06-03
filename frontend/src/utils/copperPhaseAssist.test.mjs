import assert from 'node:assert/strict'

const {
  createDefaultMaterialPhaseRows,
  findDuplicateMaterialPhase,
  resolveMaterialPhaseFormula,
} = await import('./copperPhaseAssist.ts')
const { deriveOrderedPhaseContents, emptyCopperRatios, normalizeCopperRatios } = await import('./copperWorkflowCalc.ts')

const rows = createDefaultMaterialPhaseRows()
assert.equal(rows.length, 13)
assert.equal(rows[0]?.builtinKey, 'Cu2S')
assert.equal(rows.at(-2)?.kind, 'water')
assert.equal(rows.at(-1)?.kind, 'other')
assert.equal(rows.at(-1)?.displayLabel, 'Other')
for (const phase of ['PbO', 'As2O3', 'Sb2O3', 'ZnO']) {
  assert(rows.some((row) => row.builtinKey === phase), `${phase} should be included in default phase rows`)
}

const invalid = resolveMaterialPhaseFormula('ojbk')
assert(!invalid.ok)
assert(invalid.errors.length > 0)

const ooo = resolveMaterialPhaseFormula('ooo')
assert(!ooo.ok, 'ooo should be rejected')

const ofe = resolveMaterialPhaseFormula('ofe')
assert(!ofe.ok, 'ofe should be rejected')

const duplicate = findDuplicateMaterialPhase(rows, 'Cu2S', 'draft-1')
assert.equal(duplicate?.builtinKey, 'Cu2S')
const duplicateOther = findDuplicateMaterialPhase(rows, 'Other', 'draft-1')
assert.equal(duplicateOther?.kind, 'other')

const ratios = normalizeCopperRatios({
  ...emptyCopperRatios(),
  'Cu(铜)': 24,
  'Fe(铁)': 28,
  'S (硫)': 32,
  'SiO₂(二氧化硅)': 8,
})

const customResult = deriveOrderedPhaseContents(
  ratios,
  [
    {
      id: 'custom-cus',
      kind: 'custom',
      fractions: { 'Cu(铜)': 0.662, 'S (硫)': 0.338 },
    },
  ],
  { 'custom-cus': '' }
)
assert((customResult.byRowId['custom-cus'] ?? 0) > 0, 'custom phase should derive equivalent amount')

console.log('copperPhaseAssist checks passed')
