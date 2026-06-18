import { solveOxySideBlowProducts } from '../src/utils/copperConstraintSolver.ts'
import { compileOxyConstraintSystem } from '../src/utils/copperConstraintSystemCompiler.ts'
import { loadOxySideBlowConstraints, OXY_SIDE_BLOW_PRODUCT_KEYS, CONSTRAINT_PLACEHOLDER_ELEMENTS, resolveProductEffectiveAllowedElements } from '../src/utils/copperConstraintConfig.ts'
import { resolveConstraintElementBinding } from '../src/utils/copperConstraintElementBridge.ts'
import { COPPER_ELEMENT_KEYS } from '../src/utils/copperWorkflowCalc.ts'
import { createProcessAirColumns, emptyCopperRatios } from '../src/utils/copperWorkflowCalc.ts'

const concentrateMass = 100
const blendFeed = {
  totalWeight: 115,
  elementWeights: {
    'Cu(铜)': 25,
    'S (硫)': 18,
    'Fe(铁)': 28,
    'SiO₂(二氧化硅)': 12,
    'CaO(氧化钙)': 3,
    'MgO(氧化镁)': 1,
    'Al₂O₃(三氧化二铝)': 2,
    'As(砷)': 0.2,
    'Pb(铅)': 0.5,
    'Zn(锌)': 0.8,
    'Ag(银)': 0.05,
    'Au(金)': 0.001,
    'C (碳)': 2,
    'O(氧)': 1,
    'N(氮)': 0.5,
    'Other(其他)': 0.5,
  },
  ratios: {},
}

const fuelColumn = {
  id: 'fuel-1',
  name: '煤',
  kind: 'fuel',
  weight: 13,
  waterWeight: 0,
  moisture: 0,
  ratios: { ...emptyCopperRatios(), 'C (碳)': 75, 'H(氢)': 4, 'O(氧)': 8, 'N(氮)': 1, 'S (硫)': 1 },
  unitPrice: 0,
}

const airColumns = createProcessAirColumns().map((col) => ({
  ...col,
  weight:
    col.name === '空气' ? 80 : col.name === '氧气' ? 40 : col.name === '二次风' ? 25 : col.name === '加料口漏风' ? 5.73 : 0,
}))

const inputPhaseMass = {
  混合铜精矿: {
    CuFeS2: concentrateMass * 0.35,
    FeS2: concentrateMass * 0.12,
    SiO2: concentrateMass * 0.1,
  },
}

const config = loadOxySideBlowConstraints()
const equations = compileOxyConstraintSystem(config)

const result = solveOxySideBlowProducts({
  blendFeed,
  concentrateMass,
  inputPhaseMass,
  fuelColumn,
  solventColumns: [],
  airColumns,
  config,
})

function expandAllowedPoolKeys(allowedElements) {
  const set = new Set()
  for (const el of allowedElements) {
    if (CONSTRAINT_PLACEHOLDER_ELEMENTS.has(el)) continue
    const binding = resolveConstraintElementBinding(el)
    set.add(binding.poolKey)
    if (COPPER_ELEMENT_KEYS.includes(el)) set.add(el)
  }
  return set
}

const allowlistViolations = []
for (const pk of OXY_SIDE_BLOW_PRODUCT_KEYS) {
  const allowed = expandAllowedPoolKeys(resolveProductEffectiveAllowedElements(config, pk))
  const product = result.products[pk]
  for (const feedKey of COPPER_ELEMENT_KEYS) {
    if (allowed.has(feedKey)) continue
    const mass = product.elementMass[feedKey] ?? 0
    if (Math.abs(mass) > 1e-6) {
      allowlistViolations.push({ product: pk, element: feedKey, mass })
    }
  }
}

const worst = result.constraintResiduals
  .slice()
  .sort((a, b) => b.relativeResidual - a.relativeResidual)
  .slice(0, 8)

const allowlistEquationCount = equations.filter((eq) => eq.kind === 'allowlist').length

console.log(
  JSON.stringify(
    {
      equationCount: equations.length,
      allowlistEquationCount,
      residualRowCount: result.constraintResiduals.length,
      valid: result.valid,
      converged: result.converged,
      allowlistViolations,
      maxRelativeResidual: Math.max(...result.constraintResiduals.map((row) => row.relativeResidual), 0),
      totalProductMass: result.totalProductMass,
      recommendedFuel: result.recommended.fuelWeight,
      elementBalanceIssues: result.elementBalanceResiduals?.length ?? 0,
      worst,
    },
    null,
    2
  )
)

if (allowlistViolations.length > 0) {
  console.error('Allowlist violations detected')
  process.exitCode = 1
}
