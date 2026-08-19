import assert from 'node:assert/strict'
import { shouldDisplayHeatComponentRow } from '../src/utils/heatBalanceDisplay.ts'

assert.equal(
  shouldDisplayHeatComponentRow({ massTh: 0, heatMJh: 0 }, 'output'),
  true,
  'zero-mass output products must remain visible'
)
assert.equal(
  shouldDisplayHeatComponentRow({ massTh: 0, heatMJh: 0 }, 'input'),
  false,
  'empty input rows remain suppressed'
)
console.log('heat-balance display validation passed')
