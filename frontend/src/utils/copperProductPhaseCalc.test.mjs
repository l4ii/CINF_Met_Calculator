import assert from 'node:assert/strict'

const { calculateCopperProducts } = await import('./copperProcessCalc.ts')
const { calculateWeightedComposition, createDefaultCopperMaterials, createDefaultSolventColumns, createOxygenAirColumn } = await import('./copperWorkflowCalc.ts')
const {
  buildProductPhaseReviewRows,
  calculateGasVolumePercents,
  calculateProductPhaseComposition,
  deriveProductElementsFromPhases,
  isProductPhaseColumnValid,
  PRODUCT_PHASE_ROWS,
} = await import('./copperProductPhaseCalc.ts')

const feed = calculateWeightedComposition([
  {
    ...createDefaultCopperMaterials()[0],
    weight: 100,
    name: '铜精矿',
    ratios: {
      ...createDefaultCopperMaterials()[0].ratios,
      'Cu(铜)': 24,
      'Fe(铁)': 28,
      'S (硫)': 32,
      'Si(硅)': 6,
      'Ca(钙)': 2,
      'O (氧)': 4,
      'Other(其他)': 4,
    },
  },
])

const productResult = calculateCopperProducts(feed)
const phases = calculateProductPhaseComposition(productResult)
assert(isProductPhaseColumnValid(phases.matte, 'matte'), 'matte phases should total ~100%')
assert(isProductPhaseColumnValid(phases.slag, 'slag'), 'slag phases should total ~100%')
assert(isProductPhaseColumnValid(phases.gas, 'gas'), 'gas phases should total ~100%')

const gasVolume = calculateGasVolumePercents(phases.gas)
assert(Math.abs(Object.values(gasVolume).reduce((sum, value) => sum + value, 0) - 100) < 0.05, 'gas volume percents should total ~100%')

const matteMass = productResult.products.matte.mass
const derived = deriveProductElementsFromPhases('matte', phases.matte, matteMass)
assert((derived.elementWeights['Cu(铜)'] ?? 0) > 0, 'derived matte should retain copper mass')
assert(Math.abs((derived.composition['Cu(铜)'] ?? 0) - (productResult.products.matte.composition['Cu(铜)'] ?? 0)) < 2, 'matte Cu composition should stay close')

const reviewRows = buildProductPhaseReviewRows('slag', productResult.products.slag.mass, phases.slag)
assert(reviewRows.some((row) => row.key === 'FeO' && row.mass > 0), 'slag review rows should include FeO mass')
assert(Math.abs(reviewRows.reduce((sum, row) => sum + row.pct, 0) - 100) < 0.05, 'review row percents should total ~100%')

const rows = PRODUCT_PHASE_ROWS.dust
assert(rows.includes('Other'), 'dust phase rows should include Other')

console.log('Copper product phase calc checks passed')
