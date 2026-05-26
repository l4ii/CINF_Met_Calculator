import assert from 'node:assert/strict'

const {
  COPPER_ELEMENT_KEYS,
  COPPER_MATERIAL_LIBRARY,
  DEFAULT_COPPER_SOLVENTS,
  calculateKnownTotal,
  calculatePhaseElementCompletion,
  calculateUnknownsFromPhases,
  calculateWeightedComposition,
  calculateCopperIterativeBalance,
  createDefaultCopperMaterials,
  createDefaultSolventColumns,
  derivePhaseContentsFromElements,
  parseCopperLibraryCsv,
  solveCopperSolvents,
  elementRatiosToSolventComposition,
  solventOxidesToElements,
} = await import('./copperWorkflowCalc.ts')

const { calculateCopperProducts } = await import('./copperProcessCalc.ts')

function slagPrincipalOxideRatiosFromProduct(slagProduct) {
  const fxFe = 71.844 / 55.845
  const fxSi = 60.084 / 28.085
  const fxCa = 56.077 / 40.078
  const ew = slagProduct.elementWeights
  const mFe = (ew['Fe(铁)'] ?? 0) * fxFe
  const mSi = (ew['Si(硅)'] ?? 0) * fxSi
  const mCa = (ew['Ca(钙)'] ?? 0) * fxCa
  return {
    feSiO2: mSi > 0 ? mFe / mSi : 0,
    caOSiO2: mSi > 0 ? mCa / mSi : 0,
  }
}

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

const derivedPhases = derivePhaseContentsFromElements(rawMaterials[0].ratios, {
  Cu2S: { factor: 1 },
  FeS: { factor: 1 },
  S: { factor: 1 },
  SiO2: { factor: 1 },
  CaO: { factor: 1 },
  Al2O3: { factor: 1 },
  Cu2O: { factor: 1 },
  FeO: { factor: 1 },
  Fe2O3: { factor: 0 },
  Fe3O4: { factor: 0 },
  C: { factor: 1 },
})
assert(derivedPhases.Cu2S > 0)
assert(derivedPhases.FeS > 0)
assert(derivedPhases.SiO2 > 0)
assert.equal(derivedPhases.Fe2O3, 0)
assert.equal(derivedPhases.Fe3O4, 0)

const concentrateCompletion = calculatePhaseElementCompletion(rawMaterials[0].ratios, {
  Cu2S: { factor: 1 },
  FeS: { factor: 1 },
  S: { factor: 1 },
  SiO2: { factor: 1 },
  CaO: { factor: 1 },
  Al2O3: { factor: 1 },
  Cu2O: { factor: 1 },
  FeO: { factor: 1 },
  Fe2O3: { factor: 1 },
  Fe3O4: { factor: 1 },
  C: { factor: 1 },
})
assert.equal(
  Math.round(
    (calculateKnownTotal({ ...rawMaterials[0].ratios, ...concentrateCompletion.unknowns }) +
      concentrateCompletion.unknowns['Other(其他)']) *
      1000
  ) / 1000,
  100
)

const completion = calculatePhaseElementCompletion(
  { 'Si(硅)': 10 },
  {
    Cu2S: { factor: 1 },
    FeS: { factor: 1 },
    S: { factor: 1 },
    SiO2: { factor: 1 },
    CaO: { factor: 1 },
    Al2O3: { factor: 1 },
    Cu2O: { factor: 1 },
    FeO: { factor: 1 },
    Fe2O3: { factor: 1 },
    Fe3O4: { factor: 1 },
    C: { factor: 1 },
  },
)
assert.equal(
  Math.round((calculateKnownTotal({ 'Si(硅)': 10, ...completion.unknowns }) + completion.unknowns['Other(其他)']) * 1000) / 1000,
  100
)

const standardPhaseFactors = {
  Cu2S: { factor: 1 },
  FeS: { factor: 1 },
  S: { factor: 1 },
  SiO2: { factor: 1 },
  CaO: { factor: 1 },
  Al2O3: { factor: 1 },
  Cu2O: { factor: 1 },
  FeO: { factor: 1 },
  Fe2O3: { factor: 1 },
  Fe3O4: { factor: 1 },
  C: { factor: 1 },
}
const complexConc = COPPER_MATERIAL_LIBRARY.find((m) => m.id === 'cu-conc-complex')
assert(complexConc)
const complexCompletion = calculatePhaseElementCompletion(complexConc.ratios, standardPhaseFactors)
assert.equal(
  Math.round(
    (calculateKnownTotal({ ...complexConc.ratios, ...complexCompletion.unknowns }) +
      complexCompletion.unknowns['Other(其他)']) *
      1000
  ) / 1000,
  100,
  'phase completion must close to 100% even when stoichiometric oxide O exceeds assay headroom (e.g. 复杂铜精矿)'
)
assert.ok(
  complexCompletion.unknowns['O (氧)'] < 8,
  'oxygen should be capped-down from raw phase sum so total does not exceed 100%'
)

const ironOreElements = solventOxidesToElements(DEFAULT_COPPER_SOLVENTS[1].composition)
assert.equal(ironOreElements['Fe(铁)'].toFixed(3), '59.940')
assert.equal(ironOreElements['Si(硅)'].toFixed(3), '2.805')
assert.equal(ironOreElements['O (氧)'].toFixed(3), '3.196')
const ironOreOxides = elementRatiosToSolventComposition(ironOreElements)
assert.equal(ironOreOxides['Fe(铁)'].toFixed(3), '59.940')
assert.equal(ironOreOxides['SiO₂(二氧化硅)'].toFixed(3), '6.000')
assert.equal(ironOreOxides['CaO(氧化钙)'].toFixed(3), '0.000')

const lowFeRaw = {
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
}

const solventSolution = solveCopperSolvents({
  rawMaterials: [lowFeRaw],
  targetFeSiO2: 1,
  targetCaOSiO2: 0.45,
  solvents: DEFAULT_COPPER_SOLVENTS,
})
assert.equal(solventSolution.valid, true)
assert(solventSolution.solventWeights['石灰'] > 0)
assert(solventSolution.solventWeights['铁矿石'] > 0)
assert.equal(solventSolution.targetScope, 'slag')
assert(Math.abs(solventSolution.feSiO2 - 1) < 1e-6)
assert(Math.abs(solventSolution.caOSiO2 - 0.45) < 1e-6)

const lowFeSolventCols = createDefaultSolventColumns(solventSolution.solventWeights)
const lowFeFeed = calculateWeightedComposition([lowFeRaw, ...lowFeSolventCols])
const lowFeSlagRatios = slagPrincipalOxideRatiosFromProduct(
  calculateCopperProducts(lowFeFeed).products.slag
)
assert(Math.abs(lowFeSlagRatios.feSiO2 - solventSolution.feSiO2) < 1e-6)
assert(Math.abs(lowFeSlagRatios.caOSiO2 - solventSolution.caOSiO2) < 1e-6)

const standardPhaseFactorsForSlagTest = {
  Cu2S: { factor: 1 },
  FeS: { factor: 1 },
  S: { factor: 1 },
  SiO2: { factor: 1 },
  CaO: { factor: 1 },
  Al2O3: { factor: 1 },
  Cu2O: { factor: 1 },
  FeO: { factor: 1 },
  Fe2O3: { factor: 1 },
  Fe3O4: { factor: 1 },
  C: { factor: 1 },
}
const dualConcRaw = rawMaterials.map((m) => ({
  ...m,
  ratios: { ...m.ratios },
}))
for (const m of dualConcRaw) {
  const comp = calculatePhaseElementCompletion(m.ratios, standardPhaseFactorsForSlagTest)
  m.ratios = { ...m.ratios, ...comp.unknowns }
}
const dualSolventSolution = solveCopperSolvents({
  rawMaterials: dualConcRaw,
  targetFeSiO2: 2.8,
  targetCaOSiO2: 0.45,
  solvents: DEFAULT_COPPER_SOLVENTS,
})
assert.equal(dualSolventSolution.valid, true)
assert.equal(dualSolventSolution.solventWeights['铁矿石'], 0)
assert.ok(Math.abs(dualSolventSolution.solventWeights['石灰'] - 4.595) < 0.02)
assert.ok(Math.abs(dualSolventSolution.caOSiO2 - 0.45) < 1e-6)
assert.ok(Math.abs(dualSolventSolution.feSiO2 - 2.8065) < 0.005)
const dualSolventCols = createDefaultSolventColumns(dualSolventSolution.solventWeights)
const dualFeed = calculateWeightedComposition([...dualConcRaw, ...dualSolventCols])
const dualSlagR = slagPrincipalOxideRatiosFromProduct(calculateCopperProducts(dualFeed).products.slag)
assert(Math.abs(dualSlagR.feSiO2 - dualSolventSolution.feSiO2) < 1e-6)
assert(Math.abs(dualSlagR.caOSiO2 - dualSolventSolution.caOSiO2) < 1e-6)

const iterativeResult = calculateCopperIterativeBalance({
  rawMaterials: dualConcRaw,
  solventColumns: createDefaultSolventColumns(),
  fuel: {
    id: 'fuel-coal',
    name: '热平衡煤',
    kind: 'fuel',
    weight: 0,
    lowerHeatingValueMJkg: 25,
    combustionEfficiency: 0.85,
    moisture: 8,
    ash: 12,
    ratios: {
      'C (碳)': 68,
      'O (氧)': 8,
      'N (氮)': 1,
      'S (硫)': 0.8,
      'Other(其他)': 22.2,
    },
  },
  targetFeSiO2: 2.8,
  targetCaOSiO2: 0.45,
  heatSettings: {
    feedTemperature: 25,
    matteTemperature: 1180,
    slagTemperature: 1250,
    gasTemperature: 1150,
    dustTemperature: 450,
    heatLossMJh: 1500,
    otherHeatMJh: 0,
  },
})
assert.equal(iterativeResult.valid, true)
assert(iterativeResult.iterations.length >= 1, 'iterative calculation should record at least one trace row')
assert(iterativeResult.finalSolventSolution?.valid, 'iterative calculation should solve final solvent additions')
assert(iterativeResult.finalFuel.weight > 0, 'iterative calculation should recommend heat-balance coal')
assert(iterativeResult.finalProducts.totalProductMass > iterativeResult.finalFeedWithoutFuel.totalWeight, 'final products should include coal-driven output mass')
assert(Math.abs(iterativeResult.finalHeatBalance.balanceAfterFuelMJh) < 1e-6, 'iterative result should close the heat balance after fuel')

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
