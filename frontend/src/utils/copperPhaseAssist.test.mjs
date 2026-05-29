import assert from 'node:assert/strict'

const {
  createDefaultMaterialPhaseRows,
  findDuplicateMaterialPhase,
  moveMaterialPhaseRow,
  reorderMaterialPhaseRow,
  resolveMaterialPhaseFormula,
} = await import('./copperPhaseAssist.ts')
const { deriveOrderedPhaseContents, emptyCopperRatios, normalizeCopperRatios } = await import('./copperWorkflowCalc.ts')

const rows = createDefaultMaterialPhaseRows()
assert.equal(rows.length, 11)
assert.equal(rows[0]?.builtinKey, 'Cu2S')

const invalid = resolveMaterialPhaseFormula('ojbk')
assert(!invalid.ok)
assert(invalid.errors.length > 0)

const ooo = resolveMaterialPhaseFormula('ooo')
assert(!ooo.ok, 'ooo should be rejected')

const ofe = resolveMaterialPhaseFormula('ofe')
assert(!ofe.ok, 'ofe should be rejected')

const moved = moveMaterialPhaseRow(rows, 'FeS', 'up')
assert.equal(moved[0]?.builtinKey, 'FeS')

const reordered = reorderMaterialPhaseRow(rows, 'FeS', 'Cu2S')
assert.equal(reordered[0]?.builtinKey, 'FeS')
assert.equal(reordered[1]?.builtinKey, 'Cu2S')

const reorderedAfter = reorderMaterialPhaseRow(rows, 'FeS', 'Cu2S', 'after')
assert.equal(reorderedAfter[0]?.builtinKey, 'Cu2S')
assert.equal(reorderedAfter[1]?.builtinKey, 'FeS')

const duplicate = findDuplicateMaterialPhase(rows, 'Cu2S', 'draft-1')
assert.equal(duplicate?.builtinKey, 'Cu2S')

const ratios = normalizeCopperRatios({
  ...emptyCopperRatios(),
  'Cu(铜)': 24,
  'Fe(铁)': 28,
  'S (硫)': 32,
  'Si(硅)': 8,
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
  { 'custom-cus': { value: '', factor: '1' } }
)
assert((customResult.byRowId['custom-cus'] ?? 0) > 0, 'custom phase should derive equivalent amount')

const feFirst = [
  { id: 'FeS', kind: 'builtin', builtinKey: 'FeS' },
  { id: 'Cu2S', kind: 'builtin', builtinKey: 'Cu2S' },
]
const cuFirst = [
  { id: 'Cu2S', kind: 'builtin', builtinKey: 'Cu2S' },
  { id: 'FeS', kind: 'builtin', builtinKey: 'FeS' },
]
const feResult = deriveOrderedPhaseContents(ratios, feFirst, {})
const cuResult = deriveOrderedPhaseContents(ratios, cuFirst, {})
assert((feResult.byRowId.FeS ?? 0) > 0)
assert((cuResult.byRowId.Cu2S ?? 0) > 0)

console.log('copperPhaseAssist checks passed')
