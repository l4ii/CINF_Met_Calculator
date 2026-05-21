import assert from 'node:assert/strict'

const {
  COPPER_ELEMENT_KEYS,
  DEFAULT_COPPER_SOLVENTS,
  calculateKnownTotal,
  calculateUnknownsFromPhases,
  calculateWeightedComposition,
  createDefaultCopperMaterials,
  parseCopperLibraryCsv,
  solveCopperSolvents,
  elementRatiosToSolventComposition,
  solventOxidesToElements,
} = await import('./copperWorkflowCalc.ts')

const expectedOrder = [
  'Ag(银)',
  'Al(铝)',
  'As(砷)',
  'Au(金)',
  'C (碳)',
  'Ca(钙)',
  'Cu(铜)',
  'Fe(铁)',
  'N (氮)',
  'O (氧)',
  'Other(其他)',
  'Pb(铅)',
  'S (硫)',
  'Sb(锑)',
  'Si(硅)',
  'Zn(锌)',
]
assert.deepEqual(COPPER_ELEMENT_KEYS, expectedOrder)

assert.deepEqual(
  createDefaultCopperMaterials().map((material) => material.weight),
  [0, 0],
  'default copper raw-material feed amounts should start blank in the UI and calculate as 0 until entered'
)

const rawMaterials = [
  {
    id: 'a',
    name: '铜精矿 A',
    kind: 'raw',
    weight: 60,
    ratios: {
      'Ag(银)': 0.05,
      'Al(铝)': 1.2,
      'As(砷)': 0.12,
      'Au(金)': 0.002,
      'Ca(钙)': 0.8,
      'Cu(铜)': 24,
      'Fe(铁)': 28,
      'Pb(铅)': 0.3,
      'S (硫)': 31,
      'Sb(锑)': 0.05,
      'Si(硅)': 4.5,
      'Zn(锌)': 1.5,
    },
  },
  {
    id: 'b',
    name: '铜精矿 B',
    kind: 'raw',
    weight: 40,
    ratios: {
      'Ag(银)': 0.03,
      'Al(铝)': 1.8,
      'As(砷)': 0.08,
      'Au(金)': 0.001,
      'Ca(钙)': 0.5,
      'Cu(铜)': 20,
      'Fe(铁)': 32,
      'Pb(铅)': 0.2,
      'S (硫)': 33,
      'Sb(锑)': 0.03,
      'Si(硅)': 6,
      'Zn(锌)': 2.1,
    },
  },
]

const blend = calculateWeightedComposition(rawMaterials)
assert.equal(blend.totalWeight, 100)
assert.equal(blend.ratios['Cu(铜)'].toFixed(3), '22.400')
assert.equal(blend.ratios['Fe(铁)'].toFixed(3), '29.600')
assert.equal(blend.ratios['S (硫)'].toFixed(3), '31.800')
assert.equal(blend.ratios['Other(其他)'].toFixed(3), '6.790')

const phaseUnknowns = calculateUnknownsFromPhases(
  { Cu2S: '35', FeS: '20', SiO2: '8', CaO: '2', C: '1.5' },
  rawMaterials[0].ratios
)
assert(phaseUnknowns['O (氧)'] > 0)
assert.equal(phaseUnknowns['C (碳)'], 1.5)
assert.equal(
  Math.round((calculateKnownTotal({ ...rawMaterials[0].ratios, ...phaseUnknowns }) + phaseUnknowns['Other(其他)']) * 1000) / 1000,
  100
)

const correctedPhaseUnknowns = calculateUnknownsFromPhases(
  { SiO2: { value: 10, factor: 0.5 }, C: { value: 2, factor: 1.25 } },
  {}
)
const expectedCorrectedOxygen = 10 * 0.5 * (32 / 60.084)
assert.equal(correctedPhaseUnknowns['O (氧)'].toFixed(3), expectedCorrectedOxygen.toFixed(3))
assert.equal(correctedPhaseUnknowns['C (碳)'], 2.5)
assert.equal(
  correctedPhaseUnknowns['Other(其他)'].toFixed(3),
  (100 - expectedCorrectedOxygen - 2.5).toFixed(3)
)

const ironOreElements = solventOxidesToElements(DEFAULT_COPPER_SOLVENTS[1].composition)
assert.equal(ironOreElements['Fe(铁)'].toFixed(3), '59.940')
assert.equal(ironOreElements['Si(硅)'].toFixed(3), '2.805')
assert.equal(ironOreElements['O (氧)'].toFixed(3), '3.196')
const ironOreOxides = elementRatiosToSolventComposition(ironOreElements)
assert.equal(ironOreOxides['Fe(铁)'].toFixed(3), '59.940')
assert.equal(ironOreOxides['SiO₂(二氧化硅)'].toFixed(3), '6.000')
assert.equal(ironOreOxides['CaO(氧化钙)'].toFixed(3), '0.000')

const solventSolution = solveCopperSolvents({
  rawMaterials: [
    {
      id: 'low-fe',
      name: '低铁铜料',
      kind: 'raw',
      weight: 100,
      ratios: {
        'Ca(钙)': 0.2,
        'Cu(铜)': 25,
        'Fe(铁)': 5,
        'S (硫)': 20,
        'Si(硅)': 8,
      },
    },
  ],
  targetFeSiO2: 1,
  targetCaOSiO2: 0.45,
  solvents: DEFAULT_COPPER_SOLVENTS,
})
assert.equal(solventSolution.valid, true)
assert(solventSolution.solventWeights['石灰'] > 0)
assert(solventSolution.solventWeights['铁矿石'] > 0)
assert(Math.abs(solventSolution.feSiO2 - 1) < 1e-6)
assert(Math.abs(solventSolution.caOSiO2 - 0.45) < 1e-6)

const importedLibrary = parseCopperLibraryCsv(`原料名称,Cu,Fe,S,Si,Ca,Ag
进口铜精矿,25,27,30,4,1,0.06
返料A,12,18,5,8,3,0.01`)
assert.equal(importedLibrary.length, 2)
assert.equal(importedLibrary[0].name, '进口铜精矿')
assert.equal(importedLibrary[0].ratios['Cu(铜)'], 25)
assert.equal(importedLibrary[0].ratios['Ag(银)'], 0.06)
assert.equal(importedLibrary[0].ratios['Other(其他)'].toFixed(3), '12.940')
assert.equal(importedLibrary[1].ratios['Si(硅)'], 8)

console.log('copperWorkflowCalc tests passed')
