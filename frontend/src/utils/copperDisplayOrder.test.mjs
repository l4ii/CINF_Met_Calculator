import assert from 'node:assert/strict'
import {
  COPPER_ELEMENT_DISPLAY_ORDER,
  COPPER_UNIFIED_PHASE_ROW_ORDER,
  buildInputPhaseRowKeys,
  buildUnifiedCopperPhaseRowKeys,
  compareCopperElements,
  sortCopperPhaseKeys,
  sortMaterialPhaseRows,
} from './copperDisplayOrder.ts'

assert.equal(COPPER_ELEMENT_DISPLAY_ORDER[0], 'Cu(铜)')
assert.equal(COPPER_ELEMENT_DISPLAY_ORDER[1], 'S (硫)')
assert.equal(COPPER_ELEMENT_DISPLAY_ORDER.at(-2), 'C (碳)')
assert.equal(COPPER_ELEMENT_DISPLAY_ORDER.at(-1), 'Other(其他)')

assert(compareCopperElements('Cu(铜)', 'Fe(铁)') < 0)
assert(compareCopperElements('O(氧)', 'C (碳)') < 0)

const inputKeys = buildInputPhaseRowKeys()
assert.deepEqual(inputKeys.slice(0, 3), ['Cu2S', 'FeS', 'S'])
assert.equal(inputKeys.at(-2), 'H2O')
assert.equal(inputKeys.at(-1), 'Other')

const unified = buildUnifiedCopperPhaseRowKeys(['PbS'])
assert.equal(unified[0], 'Cu2S')
assert.equal(unified.at(-2), 'H2O')
assert.equal(unified.at(-1), 'Other')
assert(unified.includes('O2') && unified.includes('N2'))
assert(unified.indexOf('O2') > unified.indexOf('C'))
assert(unified.indexOf('N2') > unified.indexOf('O2'))
assert(unified.indexOf('PbS') > unified.indexOf('FeS'))
assert(unified.indexOf('PbS') < unified.indexOf('Cu2O'))

const sortedPhases = sortCopperPhaseKeys(['Other', 'ZnO', 'CuS', 'FeS', 'Cu2O', 'O2', 'PbS'])
assert.deepEqual(sortedPhases, ['CuS', 'FeS', 'PbS', 'Cu2O', 'ZnO', 'O2', 'Other'])

const sortedCustom = sortMaterialPhaseRows([
  { id: 'draft-1', kind: 'draft', fractions: {} },
  { id: 'cus', kind: 'builtin', builtinKey: 'Cu2S', fractions: {} },
  { id: 'custom-pb-s', kind: 'custom', formula: 'PbS', fractions: { 'Pb(铅)': 0.866, 'S (硫)': 0.134 } },
  { id: 'custom-zn', kind: 'custom', formula: 'ZnO', fractions: { 'Zn(锌)': 0.8 } },
  { id: 'custom-cu', kind: 'custom', formula: 'CuS', fractions: { 'Cu(铜)': 0.6, 'S (硫)': 0.4 } },
])
assert.equal(sortedCustom[0]?.id, 'custom-cu')
assert.equal(sortedCustom[1]?.id, 'cus')
assert(sortedCustom.findIndex((row) => row.id === 'custom-pb-s') < sortedCustom.findIndex((row) => row.id === 'custom-zn'))
assert.equal(sortedCustom.at(-1)?.id, 'draft-1')

assert.equal(COPPER_UNIFIED_PHASE_ROW_ORDER.includes('PbO'), true)
assert.equal(COPPER_UNIFIED_PHASE_ROW_ORDER.includes('O2'), true)

console.log('copperDisplayOrder tests passed')
