import assert from 'node:assert/strict'

const {
  DEFAULT_COPPER_FUEL,
  calculateCopperHeatBalance,
  calculateCopperProducts,
} = await import('./copperProcessCalc.ts')

const feed = {
  totalWeight: 100,
  ratios: {
    'Ag(银)': 0,
    'Al(铝)': 1,
    'As(砷)': 0,
    'Au(金)': 0,
    'C (碳)': 0.5,
    'Ca(钙)': 1,
    'Cu(铜)': 24,
    'Fe(铁)': 28,
    'N (氮)': 0,
    'O (氧)': 3,
    'Other(其他)': 5,
    'Pb(铅)': 0,
    'S (硫)': 30,
    'Sb(锑)': 0,
    'Si(硅)': 7,
    'Zn(锌)': 0,
  },
  elementWeights: {
    'Ag(银)': 0,
    'Al(铝)': 1,
    'As(砷)': 0,
    'Au(金)': 0,
    'C (碳)': 0.5,
    'Ca(钙)': 1,
    'Cu(铜)': 24,
    'Fe(铁)': 28,
    'N (氮)': 0,
    'O (氧)': 3,
    'Other(其他)': 5,
    'Pb(铅)': 0,
    'S (硫)': 30,
    'Sb(锑)': 0,
    'Si(硅)': 7,
    'Zn(锌)': 0,
  },
}

const products = calculateCopperProducts(feed)
assert(products.products.matte.mass > products.products.dust.mass, 'matte should be a major product for copper/sulfur rich feed')
assert(products.products.slag.mass > 0, 'slag mass should be calculated from slagging elements')
assert(products.products.gas.mass > 0, 'gas mass should be calculated from sulfur/carbon oxidation')
assert.equal(products.products.matte.composition['Cu(铜)'] > 0, true)
assert.equal(products.distribution['Cu(铜)'].matte, 0.86)

const heat = calculateCopperHeatBalance({
  feed,
  products,
  fuel: DEFAULT_COPPER_FUEL,
  temperatures: {
    feed: 25,
    matte: 1180,
    slag: 1250,
    gas: 1150,
    dust: 450,
  },
  heatLossMJh: 1500,
  otherHeatMJh: 0,
})

assert(heat.outputPhysicalHeatMJh > heat.inputPhysicalHeatMJh, 'hot products should carry physical heat out')
assert(heat.requiredFuelWeight > 0, 'heat deficit should recommend coal')
assert(Math.abs(heat.balanceAfterFuelMJh) < 1e-6, 'recommended coal should close the heat balance')
assert.equal(heat.fuel.name, '热平衡煤')

console.log('copperProcessCalc tests passed')
