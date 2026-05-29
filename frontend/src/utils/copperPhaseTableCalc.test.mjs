import assert from 'node:assert/strict'

const {
  buildBlendPhaseColumn,
  buildInputPhaseColumn,
  customPhaseStorageKey,
  deriveElementsFromPhaseContents,
  isPhaseColumnValid,
  normalizePhasePercents,
  parsePhaseDraftMap,
  phaseColumnTotal,
} = await import('./copperPhaseTableCalc.ts')
const { emptyCopperRatios, normalizeCopperRatios } = await import('./copperWorkflowCalc.ts')

const sampleRatios = normalizeCopperRatios({
  ...emptyCopperRatios(),
  'Cu(铜)': 24,
  'Fe(铁)': 28,
  'S (硫)': 32,
  'Si(硅)': 8,
  'Ca(钙)': 2,
  'O (氧)': 4,
  'Other(其他)': 2,
})

const forward = buildInputPhaseColumn(sampleRatios)
assert(isPhaseColumnValid(forward), 'forward phase column should total ~100%')
assert((forward.Cu2S ?? 0) > 0, 'Cu2S should be derived from copper and sulfur')

const reversed = deriveElementsFromPhaseContents(forward, sampleRatios)
assert(Math.abs((reversed['Cu(铜)'] ?? 0) - sampleRatios['Cu(铜)']) < 1.5, 'Cu should round-trip within tolerance')
assert(Math.abs((reversed['Fe(铁)'] ?? 0) - sampleRatios['Fe(铁)']) < 1.5, 'Fe should round-trip within tolerance')

const blend = buildBlendPhaseColumn([
  { weight: 60, phases: forward },
  { weight: 40, phases: { FeO: 80, SiO2: 15, Other: 5 } },
])
assert(isPhaseColumnValid(blend), 'blended phase column should total ~100%')

const parsed = parsePhaseDraftMap({ Cu2S: '40', FeS: '20', FeO: '10', SiO2: '10', Other: '20' })
const normalized = normalizePhasePercents(parsed)
assert(Math.abs(Object.values(normalized).reduce((sum, value) => sum + value, 0) - 100) < 0.02, 'normalize should scale to 100%')

const customRow = {
  id: 'row-cus',
  formula: 'CuS',
  displayLabel: 'CuS',
  fractions: { 'Cu(铜)': 0.664, 'S (硫)': 0.336 },
}
const fixedForCustom = { Cu2S: 38, FeS: 19, FeO: 9, SiO2: 9, Other: 20 }
const customPercents = { [customRow.id]: 5 }
assert(Math.abs(phaseColumnTotal(fixedForCustom, customPercents) - 100) < 0.05, 'fixed + custom should total ~100%')
assert(isPhaseColumnValid(fixedForCustom, 0.02, customPercents), 'custom percents included in validation')

const reversedCustom = deriveElementsFromPhaseContents(fixedForCustom, sampleRatios, {}, [customRow], customPercents)
assert((reversedCustom['Cu(铜)'] ?? 0) > 0, 'custom CuS should contribute copper')

console.log('Copper phase table calc checks passed')
