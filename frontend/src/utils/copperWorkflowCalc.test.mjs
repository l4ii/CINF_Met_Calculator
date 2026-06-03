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
  emptyCopperRatios,
  derivePhaseContentsFromElements,
  normalizeCopperRatios,
  parseCopperLibraryCsv,
  solveCopperSolvents,
  elementRatiosToSolventComposition,
  solventOxidesToElements,
} = await import('./copperWorkflowCalc.ts')

const { calculateCopperProducts } = await import('./copperProcessCalc.ts')

function slagTargetRatiosFromProductAndSolvents(slagProduct, solventWeights = {}) {
  const ew = slagProduct.elementWeights
  let mFe = ew['Fe(铁)'] ?? 0
  let mSi = ew['SiO₂(二氧化硅)'] ?? 0
  let mCa = ew['CaO(氧化钙)'] ?? 0
  for (const solvent of DEFAULT_COPPER_SOLVENTS) {
    const weight = solventWeights[solvent.name] ?? 0
    const elements = solventOxidesToElements(solvent.composition)
    mFe += weight * ((elements['Fe(铁)'] ?? 0) / 100)
    mSi += weight * ((elements['SiO₂(二氧化硅)'] ?? 0) / 100)
    mCa += weight * ((elements['CaO(氧化钙)'] ?? 0) / 100)
  }
  return {
    feSiO2: mSi > 0 ? mFe / mSi : 0,
    caOSiO2: mSi > 0 ? mCa / mSi : 0,
  }
}

function slagTargetRatiosFromMaterialsAndSolvents(rawMaterials, solventWeights = {}) {
  const baseSlag = calculateCopperProducts(calculateWeightedComposition(rawMaterials)).products.slag
  return slagTargetRatiosFromProductAndSolvents(baseSlag, solventWeights)
}

const expectedOrder = [
  'Cu(铜)',
  'S (硫)',
  'Fe(铁)',
  'SiO₂(二氧化硅)',
  'CaO(氧化钙)',
  'Ag(银)',
  'Au(金)',
  'Pb(铅)',
  'As(砷)',
  'Zn(锌)',
  'Al₂O₃(三氧化二铝)',
  'Sb(锑)',
  'O(氧)',
  'N(氮)',
  'C (碳)',
  'Other(其他)',
]
assert.deepEqual(COPPER_ELEMENT_KEYS, expectedOrder)

assert.deepEqual(
  createDefaultCopperMaterials().map((material) => material.weight),
  [0, 0],
  'default copper raw-material feed amounts should start blank in the UI and calculate as 0 until entered'
)
assert.deepEqual(
  createDefaultCopperMaterials().map((material) => material.name),
  ['', ''],
  'default copper raw-material names should start unselected until the user chooses from the dropdown'
)
assert.deepEqual(
  createDefaultCopperMaterials().map((material) => material.ratios['Cu(铜)']),
  [0, 0],
  'default copper raw-material element assays should remain blank/zero until a material is selected'
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
assert.equal(blend.ratios['Other(其他)'].toFixed(3), '1.179')

const { COPPER_BUILTIN_PHASE_FRACTIONS } = await import('./copperPhaseStoichiometry.ts')

const phaseFraction = (phase, element) => COPPER_BUILTIN_PHASE_FRACTIONS[phase]?.[element] ?? 0

const normalizedA = normalizeCopperRatios(rawMaterials[0].ratios)

const phaseUnknowns = calculateUnknownsFromPhases(
  { Cu2S: '35', FeS: '20', FeO: '5', SiO2: '8', CaO: '2', C: '1.5' },
  normalizedA
)
assert(phaseUnknowns['O(氧)'] > 0, 'O2 should come from iron/copper oxides, not SiO2/CaO')
assert.equal(phaseUnknowns['C (碳)'], 1.5)
assert.equal(
  Math.round((calculateKnownTotal({ ...normalizedA, ...phaseUnknowns }) + phaseUnknowns['Other(其他)']) * 1000) / 1000,
  100
)

const correctedPhaseUnknowns = calculateUnknownsFromPhases({ SiO2: 10, C: 2 }, {})
assert.equal(correctedPhaseUnknowns['O(氧)'].toFixed(3), '0.000', 'SiO2 oxygen must not count toward O2 column')
assert.equal(correctedPhaseUnknowns['C (碳)'], 2)
assert.equal(correctedPhaseUnknowns['Other(其他)'].toFixed(3), '98.000')

const manualOtherUnknowns = calculateUnknownsFromPhases({ FeO: 50, Other: 30 }, {})
assert.ok(manualOtherUnknowns['Other(其他)'] >= 30, 'manual Other should be preserved as a minimum closure')
assert.equal(
  Math.round((calculateKnownTotal(manualOtherUnknowns) + manualOtherUnknowns['Other(其他)']) * 1000) / 1000,
  100
)

const derivedPhases = derivePhaseContentsFromElements(rawMaterials[0].ratios)
assert(derivedPhases.Cu2S > 0)
assert(derivedPhases.FeS > 0)
assert(derivedPhases.SiO2 > 0)

const cuFrac = phaseFraction('Cu2S', 'Cu(铜)')
const sFracCu2S = phaseFraction('Cu2S', 'S (硫)')
const sFracFeS = phaseFraction('FeS', 'S (硫)')
const cuFromPhases =
  derivedPhases.Cu2S * cuFrac +
  derivedPhases.Cu2O * phaseFraction('Cu2O', 'Cu(铜)')
const feFromPhases =
  derivedPhases.FeS * phaseFraction('FeS', 'Fe(铁)') +
  derivedPhases.FeO * phaseFraction('FeO', 'Fe(铁)') +
  derivedPhases.Fe2O3 * phaseFraction('Fe2O3', 'Fe(铁)') +
  derivedPhases.Fe3O4 * phaseFraction('Fe3O4', 'Fe(铁)')
const sFromPhases =
  derivedPhases.Cu2S * sFracCu2S + derivedPhases.FeS * sFracFeS + derivedPhases.S
assert.ok(Math.abs(cuFromPhases - (normalizedA['Cu(铜)'] ?? 0)) < 0.02, 'derived Cu must conserve assay')
assert.ok(Math.abs(feFromPhases - (normalizedA['Fe(铁)'] ?? 0)) < 0.02, 'derived Fe must conserve assay')
assert.ok(Math.abs(sFromPhases - (normalizedA['S (硫)'] ?? 0)) < 0.02, 'derived S must conserve assay')

const traceRatios = normalizeCopperRatios({
  ...emptyCopperRatios(),
  'Pb(铅)': 5,
  'As(砷)': 2,
  'Sb(锑)': 1,
  'Zn(锌)': 3,
})
const tracePhases = derivePhaseContentsFromElements(traceRatios)
assert.ok(Math.abs(tracePhases.PbO * phaseFraction('PbO', 'Pb(铅)') - 5) < 0.02, 'PbO should conserve Pb')
assert.ok(Math.abs(tracePhases.As2O3 * phaseFraction('As2O3', 'As(砷)') - 2) < 0.02, 'As2O3 should conserve As')
assert.ok(Math.abs(tracePhases.Sb2O3 * phaseFraction('Sb2O3', 'Sb(锑)') - 1) < 0.02, 'Sb2O3 should conserve Sb')
assert.ok(Math.abs(tracePhases.ZnO * phaseFraction('ZnO', 'Zn(锌)') - 3) < 0.02, 'ZnO should conserve Zn')

for (const phase of ['Cu2O', 'FeO', 'Fe2O3', 'Fe3O4', 'PbO', 'As2O3', 'Sb2O3', 'ZnO']) {
  const fractionTotal = Object.values(COPPER_BUILTIN_PHASE_FRACTIONS[phase] ?? {}).reduce((sum, value) => sum + value, 0)
  assert.ok(Math.abs(fractionTotal - 1) < 1e-9, `${phase} element fractions should close to 1`)
}

const concentrateCompletion = calculatePhaseElementCompletion(rawMaterials[0].ratios)
assert.equal(
  Math.round(
    (calculateKnownTotal({ ...normalizedA, ...concentrateCompletion.unknowns }) +
      concentrateCompletion.unknowns['Other(其他)']) *
      1000
  ) / 1000,
  100
)

const completion = calculatePhaseElementCompletion({ 'SiO₂(二氧化硅)': 10 })
assert.equal(
  Math.round((calculateKnownTotal({ 'SiO₂(二氧化硅)': 10, ...completion.unknowns }) + completion.unknowns['Other(其他)']) * 1000) / 1000,
  100
)

const complexConc = COPPER_MATERIAL_LIBRARY.find((m) => m.id === 'cu-conc-complex')
assert(complexConc)
const complexCompletion = calculatePhaseElementCompletion(complexConc.ratios)
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
  complexCompletion.unknowns['O(氧)'] < 8,
  'O2 should be capped-down from raw phase sum so total does not exceed 100%'
)

const { createDefaultMaterialPhaseRows, rowsForPhaseCalculation } = await import('./copperPhaseAssist.ts')
const { calculateOrderedPhaseElementCompletion } = await import('./copperWorkflowCalc.ts')
const orderedRows = createDefaultMaterialPhaseRows()
const orderedCompletion = calculateOrderedPhaseElementCompletion(
  rawMaterials[0].ratios,
  rowsForPhaseCalculation(orderedRows)
)
assert.equal(orderedCompletion.valid, true, orderedCompletion.message ?? 'ordered path should solve')
assert.ok(orderedCompletion.phaseContents.Cu2S > 0, 'ordered path should form Cu2S from Cu+S conservation')
assert.ok(orderedCompletion.phaseContents.FeS > 0, 'ordered path should form FeS from Fe+S conservation')
assert.equal(orderedCompletion.phaseContents.Cu2O ?? 0, 0, 'Cu should not all go to Cu2O when sulfides form')
assert.equal(orderedCompletion.phaseContents.Fe2O3 ?? 0, 0, 'remaining Fe should not split into multiple oxides')
assert.equal(orderedCompletion.phaseContents.Fe3O4 ?? 0, 0, 'remaining Fe should not split into multiple oxides')
const orderedPhaseSum = Object.values(orderedCompletion.phaseContents).reduce((sum, value) => sum + value, 0)
assert.ok((orderedCompletion.phaseContents.Other ?? 0) > 0, 'ordered path should expose default Other closure row')
assert.ok(Math.abs(orderedPhaseSum - 100) < 0.05, 'ordered visible phase rows should close to 100%')

const ironOreElements = solventOxidesToElements(DEFAULT_COPPER_SOLVENTS[1].composition)
assert.equal(ironOreElements['Fe(铁)'].toFixed(3), '59.940')
assert.equal(ironOreElements['SiO₂(二氧化硅)'].toFixed(3), '6.000')
assert.equal(ironOreElements['O(氧)'].toFixed(3), '0.000')
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

const lowFeSlagRatios = slagTargetRatiosFromMaterialsAndSolvents([lowFeRaw], solventSolution.solventWeights)
assert(Math.abs(lowFeSlagRatios.feSiO2 - solventSolution.feSiO2) < 1e-6)
assert(Math.abs(lowFeSlagRatios.caOSiO2 - solventSolution.caOSiO2) < 1e-6)

const productBasisProbe = {
  id: 'product-basis-probe',
  name: '产出炉渣基准校验料',
  kind: 'raw',
  weight: 100,
  ratios: {
    'Ca(钙)': 0.5,
    'Cu(铜)': 20,
    'Fe(铁)': 40,
    'S (硫)': 20,
    'Si(硅)': 5,
  },
}
const productBasisSolution = solveCopperSolvents({
  rawMaterials: [productBasisProbe],
  targetFeSiO2: 3.2,
  targetCaOSiO2: 0.45,
  solvents: DEFAULT_COPPER_SOLVENTS,
})
assert.equal(productBasisSolution.valid, true)
const productBasisRatios = slagTargetRatiosFromMaterialsAndSolvents([productBasisProbe], productBasisSolution.solventWeights)
const productBasisBlend = calculateWeightedComposition([productBasisProbe])
const rawBlendFeSiO2 =
  (productBasisBlend.elementWeights['Fe(铁)'] ?? 0) /
  (productBasisBlend.elementWeights['SiO₂(二氧化硅)'] ?? 1)
assert(Math.abs(productBasisRatios.feSiO2 - 3.2) < 1e-6)
assert(
  Math.abs(productBasisRatios.feSiO2 - rawBlendFeSiO2) > 0.5,
  'solvent solution should be based on product slag Fe/SiO2, not total feed Fe/SiO2'
)

const dualConcRaw = rawMaterials.map((m) => ({
  ...m,
  ratios: { ...m.ratios },
}))
for (const m of dualConcRaw) {
  const comp = calculatePhaseElementCompletion(m.ratios)
  m.ratios = { ...m.ratios, ...comp.unknowns }
}
const dualSolventSolution = solveCopperSolvents({
  rawMaterials: dualConcRaw,
  targetFeSiO2: 2.8,
  targetCaOSiO2: 0.45,
  solvents: DEFAULT_COPPER_SOLVENTS,
})
assert.equal(dualSolventSolution.valid, true)
assert(dualSolventSolution.solventWeights['铁矿石'] >= 0)
assert(dualSolventSolution.solventWeights['石灰'] >= 0)
assert.ok(Math.abs(dualSolventSolution.caOSiO2 - 0.45) < 1e-6)
assert.ok(Math.abs(dualSolventSolution.feSiO2 - 2.8) < 1e-6)
const dualSlagR = slagTargetRatiosFromMaterialsAndSolvents(dualConcRaw, dualSolventSolution.solventWeights)
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
      'O(氧)': 16,
      'N(氮)': 2,
      'S (硫)': 0.8,
      'Other(其他)': 13.2,
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
assert.equal(importedLibrary[1].ratios['SiO₂(二氧化硅)'], 8)

console.log('copperWorkflowCalc tests passed')
