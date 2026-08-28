import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { getSelectedSmeltAlgorithm } from '../src/types.ts'

const typesSource = await readFile(new URL('../src/types.ts', import.meta.url), 'utf8')
const mainSource = await readFile(new URL('../src/components/MainContent.tsx', import.meta.url), 'utf8')

assert.match(typesSource, /'pb_kivcet_smelting'/)
assert.match(typesSource, /'pb_kivcet_smelting_equipment'/)
assert.match(typesSource, /'pb_kivcet_converting'/)
assert.match(typesSource, /'pb_kivcet_converting_equipment'/)
assert.match(typesSource, /'pb_kivcet_summary'/)
assert.equal(
  getSelectedSmeltAlgorithm({ smeltTypeId: 'pb', sectionId: 'pyro', smeltMethodId: 'kivcet' }),
  'lead-kivcet',
)
assert.match(mainSource, /LeadKivcetWorkflow/)

console.log('lead kivcet routing validation passed')
