import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const sessionSource = await readFile(
  new URL('../src/components/modules/lead/shared/LeadKivcetOxySideBlowSession.tsx', import.meta.url),
  'utf8',
)
assert.match(sessionSource, /pb_kivcet_/)
assert.match(sessionSource, /metcal\.lead-kivcet\.cases\.v1/)
assert.match(sessionSource, /metcal-lead-kivcet-case/)
assert.match(sessionSource, /metcal:lead-kivcet-rename-active-case/)
assert.match(sessionSource, /metcal:lead-kivcet-back-workspace/)
assert.doesNotMatch(sessionSource, /metcal\.copper\.cases\.v1/)
assert.doesNotMatch(sessionSource, /metcal:copper-/)

console.log('lead kivcet isolation validation passed')
