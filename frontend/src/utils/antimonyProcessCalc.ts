import type { AntimonyElementKey, AntimonyMaterialColumn, WeightedComposition } from './antimonyWorkflowCalc'
import { COMPOUND_MOLAR_MASS, atomicMass } from './atomicMass.ts'

export type AntimonyProductKey = 'matte' | 'slag' | 'gas' | 'dust' | 'loss'

export interface AntimonyProductEntry {
  key: AntimonyProductKey
  name: string
  mass: number
  elementWeights: Record<AntimonyElementKey, number>
  composition: Partial<Record<AntimonyElementKey, number>>
}

export interface AntimonyProductResult {
  products: Record<AntimonyProductKey, AntimonyProductEntry>
  distribution: AntimonyProductDistribution
  totalProductMass: number
}

export type AntimonyProductDistribution = Partial<Record<AntimonyElementKey, Partial<Record<AntimonyProductKey, number>>>>

export interface AntimonyProductModel {
  id: string
  name: string
  distribution: AntimonyProductDistribution
}

export interface AntimonyFuelMaterial extends AntimonyMaterialColumn {
  kind: 'fuel'
  lowerHeatingValueMJkg: number
  combustionEfficiency: number
  moisture: number
  ash: number
}

export interface AntimonyHeatBalanceInput {
  feed: WeightedComposition
  products: AntimonyProductResult
  fuel: AntimonyFuelMaterial
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

export interface AntimonyHeatBalanceResult {
  fuel: AntimonyFuelMaterial
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

const PRODUCT_NAMES: Record<AntimonyProductKey, string> = {
  matte: '锑锍',
  slag: '炉渣',
  gas: '烟气',
  dust: '烟尘',
  loss: '贵锑',
}

export const ANTIMONY_PRODUCT_FORMULAS: Record<AntimonyProductKey, string> = {
  matte: 'Sb₂S₃ + FeS',
  slag: 'FeO + SiO₂ + CaO + Al₂O₃',
  gas: 'SO₂ + CO₂ + N₂',
  dust: 'As₂O₃ / PbO / Sb₂O₃ / ZnO',
  loss: '机械损失/未归集',
}

const PRODUCT_KEYS: AntimonyProductKey[] = ['matte', 'slag', 'gas', 'dust', 'loss']
export const ANTIMONY_PRODUCT_KEYS = [...PRODUCT_KEYS] as AntimonyProductKey[]

export const DEFAULT_ANTIMONY_PRODUCT_DISTRIBUTION: AntimonyProductDistribution = {
  'Ag(银)': { matte: 0.1008102165, slag: 0.0871127943, gas: 0, dust: 0.6461359443, loss: 0.1659410449 },
  'Al₂O₃(三氧化二铝)': { matte: 0, slag: 1, gas: 0, dust: 0, loss: 0 },
  'As(砷)': { matte: 0.0903047308, slag: 0.2867735721, gas: 0, dust: 0.6018093382, loss: 0.0211123589 },
  'Au(金)': { matte: 0, slag: 0.05, gas: 0, dust: 0, loss: 0.95 },
  'C (碳)': { matte: 0, slag: 0, gas: 1, dust: 0, loss: 0 },
  'CaO(氧化钙)': { matte: 0.1157104918, slag: 0.6212308139, gas: 0, dust: 0.2630586942, loss: 0 },
  'Cu(铜)': { matte: 0.25, slag: 0.2302266706, gas: 0, dust: 0.3510800410, loss: 0.1686932884 },
  'Fe(铁)': { matte: 0.3259655175, slag: 0.5231475285, gas: 0, dust: 0.1391072745, loss: 0.0117796794 },
  'H(氢)': { matte: 0, slag: 0, gas: 1, dust: 0, loss: 0 },
  'N(氮)': { matte: 0, slag: 0, gas: 1, dust: 0, loss: 0 },
  'O(氧)': { matte: 0.0088582710, slag: 0.1226742615, gas: 0.6355448549, dust: 0.2329226126, loss: 0 },
  'Other(其他)': { matte: 0.25, slag: 0.62, gas: 0, dust: 0.1, loss: 0.03 },
  'Pb(铅)': { matte: 0.0849672184, slag: 0.0837187893, gas: 0, dust: 0.8298255514, loss: 0.0014884409 },
  'S (硫)': { matte: 0.0827522637, slag: 0.0112580167, gas: 0.855, dust: 0.0490086796, loss: 0.0019810400 },
  'Sb(锑)': { matte: 0.0076893768, slag: 0.0689746345, gas: 0, dust: 0.8863103300, loss: 0.0370256587 },
  'SiO₂(二氧化硅)': { matte: 0.08, slag: 0.62, gas: 0, dust: 0.3, loss: 0 },
  'Zn(锌)': { matte: 0, slag: 0.5920114386, gas: 0, dust: 0.4079885614, loss: 0 },
}

export const DEFAULT_ANTIMONY_PRODUCT_MODEL: AntimonyProductModel = {
  id: 'default-antimony-product-distribution',
  name: '默认静态产物分配模型',
  distribution: DEFAULT_ANTIMONY_PRODUCT_DISTRIBUTION,
}

export const DEFAULT_ANTIMONY_FUEL: AntimonyFuelMaterial = {
  id: 'fuel-coal',
  name: '无烟煤',
  kind: 'fuel',
  // 煤量由煤率约束求解后回填，不作为新案例输入。
  weight: 0,
  lowerHeatingValueMJkg: 25,
  combustionEfficiency: 0.85,
  moisture: 0,
  ash: 22.5,
  ratios: {
    'S (硫)': 0.5,
    'SiO₂(二氧化硅)': 7,
    'Al₂O₃(三氧化二铝)': 1,
    'C (碳)': 77,
    'Other(其他)': 14.5,
  },
  unitPrice: 900,
}

function emptyProductEntry(key: AntimonyProductKey): AntimonyProductEntry {
  return {
    key,
    name: PRODUCT_NAMES[key],
    mass: 0,
    elementWeights: {} as Record<AntimonyElementKey, number>,
    composition: {},
  }
}

function productMassFactor(element: AntimonyElementKey, product: AntimonyProductKey) {
  if (product === 'slag') {
    if (element === 'SiO₂(二氧化硅)') return 1
    if (element === 'CaO(氧化钙)') return 1
    if (element === 'Al₂O₃(三氧化二铝)') return 1
    if (element === 'Fe(铁)') return COMPOUND_MOLAR_MASS.FeO / atomicMass('Fe')
  }
  if (product === 'gas') {
    if (element === 'S (硫)') return COMPOUND_MOLAR_MASS.SO2 / atomicMass('S')
    if (element === 'C (碳)') return COMPOUND_MOLAR_MASS.CO2 / atomicMass('C')
  }
  if (product === 'dust' && ['As(砷)', 'Pb(铅)', 'Sb(锑)', 'Zn(锌)'].includes(element)) {
    return 1.2
  }
  return 1
}

function normalizeDistributionRow(row: Partial<Record<AntimonyProductKey, number>> | undefined) {
  const values = Object.fromEntries(
    PRODUCT_KEYS.map((key) => {
      const value = Number(row?.[key] ?? 0)
      return [key, Number.isFinite(value) ? Math.max(0, value) : 0]
    })
  ) as Record<AntimonyProductKey, number>
  const total = PRODUCT_KEYS.reduce((sum, key) => sum + values[key], 0)
  if (total <= 0) return values
  for (const key of PRODUCT_KEYS) {
    values[key] = values[key] / total
  }
  return values
}

export function normalizeAntimonyProductModel(model: Partial<AntimonyProductModel> | undefined = DEFAULT_ANTIMONY_PRODUCT_MODEL): AntimonyProductModel {
  const source = model?.distribution ?? DEFAULT_ANTIMONY_PRODUCT_DISTRIBUTION
  const elements = new Set<AntimonyElementKey>([
    ...(Object.keys(DEFAULT_ANTIMONY_PRODUCT_DISTRIBUTION) as AntimonyElementKey[]),
    ...(Object.keys(source) as AntimonyElementKey[]),
  ])
  const distribution: AntimonyProductDistribution = {}
  for (const element of elements) {
    const merged = {
      ...(DEFAULT_ANTIMONY_PRODUCT_DISTRIBUTION[element] ?? {}),
      ...(source[element] ?? {}),
    }
    distribution[element] = normalizeDistributionRow(merged)
  }
  return {
    id: model?.id ?? DEFAULT_ANTIMONY_PRODUCT_MODEL.id,
    name: model?.name ?? DEFAULT_ANTIMONY_PRODUCT_MODEL.name,
    distribution,
  }
}

export function calculateAntimonyProducts(feed: WeightedComposition, model?: Partial<AntimonyProductModel>): AntimonyProductResult {
  const productModel = normalizeAntimonyProductModel(model)
  const products = Object.fromEntries(PRODUCT_KEYS.map((key) => [key, emptyProductEntry(key)])) as Record<AntimonyProductKey, AntimonyProductEntry>
  for (const [element, elementWeight] of Object.entries(feed.elementWeights) as [AntimonyElementKey, number][]) {
    const distribution = productModel.distribution[element]
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
    for (const [element, weight] of Object.entries(product.elementWeights) as [AntimonyElementKey, number][]) {
      product.composition[element] = product.mass > 0 ? (weight / product.mass) * 100 : 0
    }
  }

  return {
    products,
    distribution: productModel.distribution,
    totalProductMass: PRODUCT_KEYS.reduce((sum, key) => sum + products[key].mass, 0),
  }
}

const PRODUCT_HEAT_CAPACITY_MJ_T_C: Record<AntimonyProductKey, number> = {
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
  const antimony = feed.elementWeights['Sb(锑)'] ?? 0
  return sulfur * 1000 * 2.5 + carbon * 1000 * 18 + iron * 1000 * 0.35 + antimony * 1000 * 0.18
}

export function calculateAntimonyHeatBalance(input: AntimonyHeatBalanceInput): AntimonyHeatBalanceResult {
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
