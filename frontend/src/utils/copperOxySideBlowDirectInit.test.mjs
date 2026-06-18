import assert from 'node:assert/strict'

import { loadOxySideBlowConstraints } from './copperConstraintConfig.ts'
import { compileOxyConstraintSystem } from './copperConstraintSystemCompiler.ts'
import {
  buildSymbolTableFromUnknowns,
  buildUnknownSpecs,
  buildProductsFromPhases,
  createInitialUnpacked,
  resolveFuelConcentrateRatioTarget,
  resolveFuelWetBasisWaterTarget,
} from './copperConstraintUnknowns.ts'
import { evaluateConstraintExprString } from './copperConstraintExpression.ts'
import { solveOxySideBlowProducts } from './copperConstraintSolver.ts'
import { createProcessAirColumns, emptyCopperRatios } from './copperWorkflowCalc.ts'

function makeFeed(totalWeight, elementWeights) {
  return {
    totalWeight,
    elementWeights: { ...emptyCopperRatios(), ...elementWeights },
    ratios: { ...emptyCopperRatios() },
  }
}

function makeColumn(name, kind = 'raw') {
  return {
    id: name,
    name,
    kind,
    weight: 0,
    ratios: { ...emptyCopperRatios() },
  }
}

const config = loadOxySideBlowConstraints()
const equations = compileOxyConstraintSystem(config)
const slagPhases = config.products.smeltingSlag.phases

assert.ok(
  !slagPhases.includes('Fe2SiO4') && !slagPhases.includes('Mullite'),
  'smelting slag should not include Fe2SiO4 or legacy Mullite'
)
assert.ok(slagPhases.includes('3Al2O3•2SiO2'), 'smelting slag should include 3Al2O3•2SiO2')
assert.ok(
  !equations.some((eq) => eq.id === 'D:S(硅):flueGas' || eq.label.includes('S(硅) → 熔炼出炉烟气')),
  'silicon distribution should not target flue gas'
)
assert.ok(
  equations.some((eq) => eq.id === 'D:S(硅):dust' && eq.ruleValue === 0.2),
  'silicon distribution should target dust at D% 0.2'
)

const unitSlagProducts = buildProductsFromPhases(
  {
    smeltingSlag: { '3Al2O3•2SiO2': 1 },
    matte: {},
    flueGas: {},
    dust: {},
    fugitive: {},
    loss: {},
  },
  config
)
assert.ok(
  (unitSlagProducts.smeltingSlag.elementMass['Al₂O₃(三氧化二铝)'] ?? 0) > 0,
  '3Al2O3•2SiO2 should contribute Al2O3 equivalent'
)
assert.ok(
  (unitSlagProducts.smeltingSlag.elementMass['SiO₂(二氧化硅)'] ?? 0) > 0,
  '3Al2O3•2SiO2 should contribute SiO2 equivalent'
)

const input = {
  blendFeed: makeFeed(10, {
    'Cu(铜)': 2,
    'S (硫)': 1,
    'Fe(铁)': 1,
    'SiO₂(二氧化硅)': 1,
  }),
  rawFeed: makeFeed(10, {
    'Cu(铜)': 2,
    'S (硫)': 1,
    'Fe(铁)': 1,
    'SiO₂(二氧化硅)': 1,
  }),
  concentrateMass: 10,
  fuelColumn: makeColumn('煤', 'fuel'),
  solventColumns: [],
  airColumns: createProcessAirColumns(),
}

const unpacked = createInitialUnpacked(input, config)
const matteTotal = Object.values(unpacked.outputPhases.matte).reduce((sum, value) => sum + value, 0)
const matteCu2SPct = matteTotal > 0 ? ((unpacked.outputPhases.matte.Cu2S ?? 0) / matteTotal) * 100 : 0
const fuelRatioTarget = resolveFuelConcentrateRatioTarget(config)
const fuelWetBasisWaterTarget = resolveFuelWetBasisWaterTarget(config)
const fuelWater = unpacked.fuelColumn.waterWeight ?? 0
const symbolTable = buildSymbolTableFromUnknowns(unpacked, input, config)

assert.ok(Math.abs(matteCu2SPct - 93.9229) < 0.01, `expected matte Cu2S share near 93.923%, got ${matteCu2SPct}`)
assert.equal(unpacked.outputPhases.fugitive.SO2 ?? 0, 0)
assert.equal(
  buildUnknownSpecs(config, input).some((spec) => spec.kind === 'input_mass' && spec.inputName === '煤'),
  false,
  'fuel mass should be derived from concentrate mass, not solved as an unknown'
)
assert.ok(
  Math.abs(unpacked.fuelMass - input.concentrateMass * fuelRatioTarget) < 1e-12,
  'fuel dry mass should equal mixed concentrate mass times fixed fuel/concentrate ratio'
)
assert.ok(
  Math.abs(fuelWater - unpacked.fuelMass * (fuelWetBasisWaterTarget / (1 - fuelWetBasisWaterTarget))) < 1e-12,
  'fuel water should split wet coal into 98% dry basis and 2% water'
)
assert.ok(
  Math.abs(evaluateConstraintExprString('Input.煤.H2O / Input.煤湿基', symbolTable) - 0.02) < 1e-12,
  'custom fuel moisture expression should read derived fuel H2O mass'
)

const fastConfig = {
  ...config,
  solverParams: {
    ...config.solverParams,
    newtonMaxIterations: 0,
  },
}
const solved = solveOxySideBlowProducts({ ...input, config: fastConfig })
const solvedMatteCu2S = solved.products.matte.phases.find((phase) => phase.key === 'Cu2S')
const manualFuelInput = {
  ...input,
  fuelColumn: {
    ...makeColumn('煤', 'fuel'),
    weight: 99,
    waterWeight: 12,
    ratios: {
      ...emptyCopperRatios(),
      'C (碳)': 60,
      'Other(其他)': 40,
    },
  },
}
const manualFuelSolved = solveOxySideBlowProducts({ ...manualFuelInput, config: fastConfig })

assert.ok(solvedMatteCu2S, 'expected final product table to include matte Cu2S')
assert.ok(
  Math.abs(solvedMatteCu2S.pct - 93.9229) < 0.01,
  `expected final matte Cu2S share near 93.923%, got ${solvedMatteCu2S.pct}`
)
assert.ok(Math.abs(solved.recommended.fuelWeight - input.concentrateMass * fuelRatioTarget) < 1e-12)
assert.ok(
  Math.abs(
    solved.recommended.fuelWaterWeight -
      solved.recommended.fuelWeight * (fuelWetBasisWaterTarget / (1 - fuelWetBasisWaterTarget))
  ) < 1e-12
)
assert.ok(
  Math.abs(manualFuelSolved.recommended.fuelWeight - solved.recommended.fuelWeight) < 1e-12,
  'initial/manual fuel mass should not affect derived fuel recommendation'
)
assert.ok(
  Math.abs(manualFuelSolved.recommended.fuelWaterWeight - solved.recommended.fuelWaterWeight) < 1e-12,
  'initial/manual fuel water should not affect derived fuel moisture split'
)

console.log('copper oxy side blow direct init tests passed')
