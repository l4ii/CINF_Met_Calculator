import assert from 'node:assert/strict'

import {
  buildInputPhaseDisplayPlan,
  buildPhaseSummaryColumn,
} from './copperInputPhaseTableDisplay.ts'

function approx(actual, expected, tolerance = 1e-9) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`
  )
}

const phaseRowKeys = ['Cu2S', 'FeS', 'SiO2', 'O2', 'N2']

const rawA = {
  id: 'raw-a',
  kind: 'raw',
  header: 'Raw A',
  subHeader: 'Raw A',
  weight: 10,
  waterWeight: 1,
  phaseReady: true,
  phaseContentsByKey: { Cu2S: 40, FeS: 60 },
  materialPhaseRowKeys: ['Cu2S', 'FeS'],
}

const rawB = {
  id: 'raw-b',
  kind: 'raw',
  header: 'Raw B',
  subHeader: 'Raw B',
  weight: 30,
  waterWeight: 2,
  phaseReady: true,
  phaseContentsByKey: { Cu2S: 20, FeS: 80 },
  materialPhaseRowKeys: ['Cu2S', 'FeS'],
}

const air = {
  id: 'air',
  kind: 'oxygen',
  header: 'Air',
  subHeader: 'Air',
  weight: 100,
  oxygenAir: {
    weightPct: { O2: 70, N2: 30 },
    volumePct: { O2: 60, N2: 40 },
  },
}

const legacyBlend = {
  id: 'legacy-blend',
  kind: 'blend',
  header: 'Legacy blend',
  subHeader: 'Legacy blend',
  weight: 999,
  waterWeight: 9,
  phaseReady: true,
  phaseContentsByKey: { Cu2S: 1, FeS: 1 },
  oxygenAir: {
    weightPct: { O2: 99, N2: 1 },
    volumePct: { O2: 99, N2: 1 },
  },
}

const solventA = {
  id: 'solvent-a',
  kind: 'solvent',
  header: 'Flux A',
  subHeader: 'Flux A',
  weight: 5,
  waterWeight: 0.2,
  phaseReady: true,
  phaseContentsByKey: { SiO2: 100 },
  materialPhaseRowKeys: ['SiO2'],
}

const solventB = {
  id: 'solvent-b',
  kind: 'solvent',
  header: 'Flux B',
  subHeader: 'Flux B',
  weight: 15,
  waterWeight: 0.3,
  phaseReady: true,
  phaseContentsByKey: { SiO2: 100 },
  materialPhaseRowKeys: ['SiO2'],
}

const fuel = {
  id: 'fuel',
  kind: 'fuel',
  header: 'Fuel',
  subHeader: 'Fuel',
  weight: 3,
  waterWeight: 0.1,
  phaseReady: true,
  phaseContentsByKey: { Cu2S: 0 },
  materialPhaseRowKeys: ['Cu2S'],
}

const rawSummary = buildPhaseSummaryColumn({
  id: 'raw-summary',
  header: 'Raw mix',
  subHeader: 'Raw mix',
  kind: 'concentrate',
  columns: [rawA, rawB],
  applicablePhaseKeys: phaseRowKeys,
})

assert.ok(rawSummary)
approx(rawSummary.weight, 40)
approx(rawSummary.waterWeight, 3)
approx(rawSummary.phaseContentsByKey.Cu2S, 25)
approx(rawSummary.phaseContentsByKey.FeS, 75)
assert.equal(Object.hasOwn(rawSummary.phaseContentsByKey, 'O2'), false)
assert.equal(Object.hasOwn(rawSummary.phaseContentsByKey, 'N2'), false)
assert.equal(Object.hasOwn(rawSummary.phaseContentsByKey, 'SiO2'), false)
assert.deepEqual(rawSummary.materialPhaseRowKeys, ['Cu2S', 'FeS'])
assert.equal(rawSummary.readOnly, true)

const collapsedPlan = buildInputPhaseDisplayPlan({
  inputColumns: [rawA, rawB, solventA, solventB, fuel, air, legacyBlend],
  phaseRowKeys,
  rawExpanded: false,
  solventExpanded: false,
})

assert.deepEqual(
  collapsedPlan.materialRows.map((row) => row.role),
  ['raw-summary', 'solvent-summary', 'fuel']
)
assert.deepEqual(
  collapsedPlan.displayInputColumns.map((column) => column.id),
  ['raw-a', 'raw-b', 'solvent-a', 'solvent-b', 'fuel', 'air']
)
assert.deepEqual(collapsedPlan.airColumns.map((column) => column.id), ['air'])
approx(collapsedPlan.rawSummaryColumn.weight, 40)
approx(collapsedPlan.rawSummaryColumn.waterWeight, 3)
assert.equal(Object.hasOwn(collapsedPlan.rawSummaryColumn.phaseContentsByKey, 'O2'), false)

const expandedPlan = buildInputPhaseDisplayPlan({
  inputColumns: [rawA, rawB, solventA, solventB, fuel, air, legacyBlend],
  phaseRowKeys,
  rawExpanded: true,
  solventExpanded: true,
})

assert.deepEqual(
  expandedPlan.materialRows.map((row) => row.role),
  [
    'raw-detail',
    'raw-detail',
    'raw-summary',
    'solvent-summary',
    'solvent-detail',
    'solvent-detail',
    'fuel',
  ]
)
assert.deepEqual(
  expandedPlan.materialRows.map((row) => row.column.id),
  ['raw-a', 'raw-b', 'raw-phase-summary', 'solvent-phase-summary', 'solvent-a', 'solvent-b', 'fuel']
)

console.log('copper input phase table display tests passed')
