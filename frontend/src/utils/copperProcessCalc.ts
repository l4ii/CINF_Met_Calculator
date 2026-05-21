import type { CopperElementKey, CopperMaterialColumn, WeightedComposition } from './copperWorkflowCalc'

export type CopperProductKey = 'matte' | 'slag' | 'gas' | 'dust' | 'loss'

export interface CopperProductEntry {
  key: CopperProductKey
  name: string
  mass: number
  elementWeights: Record<CopperElementKey, number>
  composition: Partial<Record<CopperElementKey, number>>
}

export interface CopperProductResult {
  products: Record<CopperProductKey, CopperProductEntry>
  distribution: Partial<Record<CopperElementKey, Record<CopperProductKey, number>>>
  totalProductMass: number
}

export interface CopperFuelMaterial extends CopperMaterialColumn {
  kind: 'fuel'
  lowerHeatingValueMJkg: number
  combustionEfficiency: number
  moisture: number
  ash: number
}

export interface CopperHeatBalanceInput {
  feed: WeightedComposition
  products: CopperProductResult
  fuel: CopperFuelMaterial
  temperatures: {
    feed: number
    matte: number
    slag: number
    gas: number
    dust: number
  }
  heatLossMJh: number
  otherHeatMJh: number
}

export interface CopperHeatBalanceResult {
  fuel: CopperFuelMaterial
  inputPhysicalHeatMJh: number
  outputPhysicalHeatMJh: number
  chemicalHeatMJh: number
  heatLossMJh: number
  otherHeatMJh: number
  heatDeficitMJh: number
  requiredFuelWeight: number
  fuelEffectiveHeatMJh: number
  balanceAfterFuelMJh: number
}

const PRODUCT_NAMES: Record<CopperProductKey, string> = {
  matte: '冰铜',
  slag: '炉渣',
  gas: '烟气',
  dust: '烟尘',
  loss: '损失',
}

const PRODUCT_KEYS: CopperProductKey[] = ['matte', 'slag', 'gas', 'dust', 'loss']

export const DEFAULT_COPPER_PRODUCT_DISTRIBUTION: Partial<Record<CopperElementKey, Record<CopperProductKey, number>>> = {
  'Ag(银)': { matte: 0.9, slag: 0.03, gas: 0, dust: 0.02, loss: 0.05 },
  'Al(铝)': { matte: 0, slag: 0.96, gas: 0, dust: 0, loss: 0.04 },
  'As(砷)': { matte: 0.08, slag: 0.12, gas: 0.55, dust: 0.17, loss: 0.08 },
  'Au(金)': { matte: 0.95, slag: 0.02, gas: 0, dust: 0, loss: 0.03 },
  'C (碳)': { matte: 0, slag: 0, gas: 0.92, dust: 0.02, loss: 0.06 },
  'Ca(钙)': { matte: 0, slag: 0.98, gas: 0, dust: 0, loss: 0.02 },
  'Cu(铜)': { matte: 0.86, slag: 0.08, gas: 0.01, dust: 0, loss: 0.05 },
  'Fe(铁)': { matte: 0.18, slag: 0.78, gas: 0.02, dust: 0, loss: 0.02 },
  'N (氮)': { matte: 0, slag: 0, gas: 0.98, dust: 0, loss: 0.02 },
  'O (氧)': { matte: 0.08, slag: 0.58, gas: 0.28, dust: 0, loss: 0.06 },
  'Other(其他)': { matte: 0.05, slag: 0.65, gas: 0.08, dust: 0.08, loss: 0.14 },
  'Pb(铅)': { matte: 0.12, slag: 0.34, gas: 0.3, dust: 0.14, loss: 0.1 },
  'S (硫)': { matte: 0.22, slag: 0.02, gas: 0.74, dust: 0, loss: 0.02 },
  'Sb(锑)': { matte: 0.12, slag: 0.2, gas: 0.4, dust: 0.18, loss: 0.1 },
  'Si(硅)': { matte: 0.01, slag: 0.97, gas: 0, dust: 0, loss: 0.02 },
  'Zn(锌)': { matte: 0.03, slag: 0.2, gas: 0.5, dust: 0.2, loss: 0.07 },
}

export const DEFAULT_COPPER_FUEL: CopperFuelMaterial = {
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
  unitPrice: 900,
}

function emptyProductEntry(key: CopperProductKey): CopperProductEntry {
  return {
    key,
    name: PRODUCT_NAMES[key],
    mass: 0,
    elementWeights: {} as Record<CopperElementKey, number>,
    composition: {},
  }
}

function productMassFactor(element: CopperElementKey, product: CopperProductKey) {
  if (product === 'slag') {
    if (element === 'Si(硅)') return 60.084 / 28.085
    if (element === 'Ca(钙)') return 56.077 / 40.078
    if (element === 'Al(铝)') return 101.961 / (2 * 26.982)
    if (element === 'Fe(铁)') return 71.844 / 55.845
  }
  if (product === 'gas') {
    if (element === 'S (硫)') return 64.066 / 32.06
    if (element === 'C (碳)') return 44.01 / 12.011
  }
  if (product === 'dust' && ['As(砷)', 'Pb(铅)', 'Sb(锑)', 'Zn(锌)'].includes(element)) {
    return 1.2
  }
  return 1
}

export function calculateCopperProducts(feed: WeightedComposition): CopperProductResult {
  const products = Object.fromEntries(PRODUCT_KEYS.map((key) => [key, emptyProductEntry(key)])) as Record<CopperProductKey, CopperProductEntry>
  for (const [element, elementWeight] of Object.entries(feed.elementWeights) as [CopperElementKey, number][]) {
    const distribution = DEFAULT_COPPER_PRODUCT_DISTRIBUTION[element]
    if (!distribution || elementWeight <= 0) continue
    for (const key of PRODUCT_KEYS) {
      const allocated = elementWeight * (distribution[key] ?? 0)
      if (allocated <= 0) continue
      products[key].elementWeights[element] = (products[key].elementWeights[element] ?? 0) + allocated
      products[key].mass += allocated * productMassFactor(element, key)
    }
  }

  for (const key of PRODUCT_KEYS) {
    const product = products[key]
    for (const [element, weight] of Object.entries(product.elementWeights) as [CopperElementKey, number][]) {
      product.composition[element] = product.mass > 0 ? (weight / product.mass) * 100 : 0
    }
  }

  return {
    products,
    distribution: DEFAULT_COPPER_PRODUCT_DISTRIBUTION,
    totalProductMass: PRODUCT_KEYS.reduce((sum, key) => sum + products[key].mass, 0),
  }
}

const PRODUCT_HEAT_CAPACITY_MJ_T_C: Record<CopperProductKey, number> = {
  matte: 0.78,
  slag: 1.12,
  gas: 1.08,
  dust: 0.84,
  loss: 0,
}

function sensibleHeat(mass: number, heatCapacity: number, temperature: number) {
  return Math.max(0, mass) * heatCapacity * Math.max(0, temperature - 25)
}

function calculateSimplifiedChemicalHeat(feed: WeightedComposition) {
  const sulfur = feed.elementWeights['S (硫)'] ?? 0
  const carbon = feed.elementWeights['C (碳)'] ?? 0
  const iron = feed.elementWeights['Fe(铁)'] ?? 0
  const copper = feed.elementWeights['Cu(铜)'] ?? 0
  return sulfur * 1000 * 2.5 + carbon * 1000 * 18 + iron * 1000 * 0.35 + copper * 1000 * 0.18
}

export function calculateCopperHeatBalance(input: CopperHeatBalanceInput): CopperHeatBalanceResult {
  const inputPhysicalHeatMJh = sensibleHeat(input.feed.totalWeight, 0.85, input.temperatures.feed)
  const outputPhysicalHeatMJh =
    sensibleHeat(input.products.products.matte.mass, PRODUCT_HEAT_CAPACITY_MJ_T_C.matte, input.temperatures.matte) +
    sensibleHeat(input.products.products.slag.mass, PRODUCT_HEAT_CAPACITY_MJ_T_C.slag, input.temperatures.slag) +
    sensibleHeat(input.products.products.gas.mass, PRODUCT_HEAT_CAPACITY_MJ_T_C.gas, input.temperatures.gas) +
    sensibleHeat(input.products.products.dust.mass, PRODUCT_HEAT_CAPACITY_MJ_T_C.dust, input.temperatures.dust)
  const chemicalHeatMJh = calculateSimplifiedChemicalHeat(input.feed)
  const heatDeficitMJh =
    outputPhysicalHeatMJh +
    Math.max(0, input.heatLossMJh) +
    input.otherHeatMJh -
    inputPhysicalHeatMJh -
    chemicalHeatMJh
  const fuelHeatMJt = input.fuel.lowerHeatingValueMJkg * 1000 * input.fuel.combustionEfficiency
  const requiredFuelWeight = fuelHeatMJt > 0 ? Math.max(0, heatDeficitMJh / fuelHeatMJt) : 0
  const fuelEffectiveHeatMJh = requiredFuelWeight * fuelHeatMJt
  const balanceAfterFuelMJh = inputPhysicalHeatMJh + chemicalHeatMJh + fuelEffectiveHeatMJh - outputPhysicalHeatMJh - Math.max(0, input.heatLossMJh) - input.otherHeatMJh

  return {
    fuel: input.fuel,
    inputPhysicalHeatMJh,
    outputPhysicalHeatMJh,
    chemicalHeatMJh,
    heatLossMJh: Math.max(0, input.heatLossMJh),
    otherHeatMJh: input.otherHeatMJh,
    heatDeficitMJh,
    requiredFuelWeight,
    fuelEffectiveHeatMJh,
    balanceAfterFuelMJh,
  }
}
