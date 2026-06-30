import {
  loadOxySideBlowConstraints,
  OXY_PRODUCT_KEY_TO_CN,
  OXY_SIDE_BLOW_PRODUCT_KEYS,
  type OxySideBlowConstraintConfig,
  type OxySideBlowProductKey,
} from './copperConstraintConfig.ts'
import { parseConstraintExpression, evaluateConstraintExprString } from './copperConstraintExpression.ts'
import {
  buildProductsFromPhases,
  buildUnknownSpecs,
  unpackProjectedUnknowns,
  type OxyConstraintBaseInput,
} from './copperConstraintUnknowns.ts'
import {
  buildResidualRowsFromSolution,
  formatCompiledEquation,
  solveOxyConstraintSystemStrict,
} from './copperConstraintSystemSolver.ts'
import type { CopperElementKey } from './copperWorkflowCalc.ts'
import { COPPER_ELEMENT_KEYS } from './copperWorkflowCalc.ts'

export interface OxyProductPhaseResult {
  key: string
  mass: number
  pct: number
}

export interface OxyProductResult {
  key: OxySideBlowProductKey
  name: string
  mass: number
  phases: OxyProductPhaseResult[]
  elementMass: Partial<Record<CopperElementKey, number>>
  balanceElementMass: Partial<Record<CopperElementKey, number>>
  composition: Partial<Record<CopperElementKey, number>>
}

export interface OxyConstraintSolverInput extends OxyConstraintBaseInput {
  config?: OxySideBlowConstraintConfig
}

export interface OxyConstraintSolverResult {
  valid: boolean
  converged: boolean
  stage: 'stage1' | 'stage2' | 'complete'
  message?: string
  products: Record<OxySideBlowProductKey, OxyProductResult>
  totalProductMass: number
  iterations: number
  maxRelativeResidual: number
  recommended: {
    fuelWeight: number
    fuelWaterWeight: number
    fuelMoisture: number
    solventWeights: Record<string, number>
    gasWeights: Record<string, number>
  }
  constraintResiduals: Array<{
    expr: string
    value: number
    target: number
    residual: number
    relativeResidual: number
    applicable?: boolean
    soft?: boolean
  }>
  equations: Array<{
    id: string
    kind: string
    expr: string
    soft?: boolean
  }>
  equationCount: number
  objectiveEquationCount: number
  elementBalanceResiduals?: Array<{ element: CopperElementKey; feed: number; allocated: number; residual: number }>
}

function compositionFromElementMass(
  elementMass: Partial<Record<CopperElementKey, number>>,
  totalMass: number
): Partial<Record<CopperElementKey, number>> {
  const comp: Partial<Record<CopperElementKey, number>> = {}
  if (totalMass <= 0) return comp
  for (const [el, mass] of Object.entries(elementMass) as [CopperElementKey, number][]) {
    comp[el] = (mass / totalMass) * 100
  }
  const known = Object.entries(comp)
    .filter(([el]) => el !== 'Other(其他)')
    .reduce((sum, [, value]) => sum + (value ?? 0), 0)
  if (known < 100 - 0.5) comp['Other(其他)'] = Math.max(0, 100 - known)
  return comp
}

function buildOxyProductResults(
  outputPhases: Record<OxySideBlowProductKey, Record<string, number>>,
  productMasses: Partial<Record<OxySideBlowProductKey, number>>,
  config: OxySideBlowConstraintConfig
): Record<OxySideBlowProductKey, OxyProductResult> {
  const built = buildProductsFromPhases(outputPhases, config, productMasses)
  const results = {} as Record<OxySideBlowProductKey, OxyProductResult>
  for (const pk of OXY_SIDE_BLOW_PRODUCT_KEYS) {
    const def = config.products[pk]
    const product = built[pk]
    results[pk] = {
      key: pk,
      name: def.name,
      mass: product.mass,
      phases: def.phases.map((phaseKey) => {
        const phaseMass = product.phases[phaseKey] ?? 0
        const denominator = product.mass > 0 ? product.mass : 0
        return {
          key: phaseKey,
          mass: phaseMass,
          pct: denominator > 0 ? (phaseMass / denominator) * 100 : 0,
        }
      }),
      elementMass: product.elementMass,
      balanceElementMass: product.balanceElementMass,
      composition: compositionFromElementMass(product.elementMass, product.mass),
    }
  }
  return results
}

function computeGlobalElementBalanceResiduals(
  balanceFeed: OxyConstraintSolverInput['blendFeed'],
  products: Record<OxySideBlowProductKey, OxyProductResult>
): NonNullable<OxyConstraintSolverResult['elementBalanceResiduals']> {
  const residuals: NonNullable<OxyConstraintSolverResult['elementBalanceResiduals']> = []
  for (const element of COPPER_ELEMENT_KEYS) {
    const feedMass = balanceFeed.elementWeights[element] ?? 0
    if (feedMass <= 0) continue
    const allocated = OXY_SIDE_BLOW_PRODUCT_KEYS.reduce(
      (sum, pk) => sum + (products[pk].balanceElementMass[element] ?? 0),
      0
    )
    const residual = feedMass - allocated
    if (Math.abs(residual) > feedMass * 1e-4 + 1e-6) {
      residuals.push({ element, feed: feedMass, allocated, residual })
    }
  }
  return residuals
}

export function solveOxySideBlowProducts(input: OxyConstraintSolverInput): OxyConstraintSolverResult {
  const config = input.config ?? loadOxySideBlowConstraints()
  const solved = solveOxyConstraintSystemStrict(input, config)
  const specs = buildUnknownSpecs(config, input)
  const unpacked = unpackProjectedUnknowns(solved.x, specs, input, config)
  const products = buildOxyProductResults(unpacked.outputPhases, unpacked.productMasses, config)
  const constraintResiduals = buildResidualRowsFromSolution(solved.x, input, config)
  const totalProductMass = OXY_SIDE_BLOW_PRODUCT_KEYS.reduce((sum, pk) => sum + products[pk].mass, 0)
  const gasWeights = Object.fromEntries(unpacked.airColumns.map((col) => [col.name, col.weight]))
  const solventWeights = Object.fromEntries(unpacked.solventColumns.map((col) => [col.name, col.weight]))
  const productClosureIssues = OXY_SIDE_BLOW_PRODUCT_KEYS
    .map((pk) => ({ pk, total: productElementTotal(products[pk]) }))
    .filter((row) => !verifyProductElementTotals(products[row.pk]))
  const allProductsClosed = productClosureIssues.length === 0
  const valid = solved.converged && allProductsClosed
  const worstResiduals = constraintResiduals
    .slice()
    .filter((row) => !row.soft)
    .sort((a, b) => b.relativeResidual - a.relativeResidual)
    .slice(0, 3)
  const worstNote =
    worstResiduals.length > 0
      ? `主要冲突：${worstResiduals
          .map((row) => `${row.expr}（相对残差 ${row.relativeResidual.toFixed(3)}）`)
          .join('；')}`
      : ''
  const equationCount = solved.equations.length
  const objectiveEquationCount = solved.objectiveEquationCount
  const equations = solved.equations.map((equation, index) => ({
    id: equation.id,
    kind: equation.kind,
    expr: formatCompiledEquation(equation, index + 1),
    soft: equation.soft,
  }))
  const message = valid
    ? undefined
    : !solved.converged
      ? `已列举 ${equationCount} 条硬方程并求解；当前约束无精确可行解，最大相对残差 ${solved.maxRelativeResidual.toFixed(4)}。${worstNote}`
      : `部分产物元素合计未闭合至 100%：${productClosureIssues
          .map((row) => `${OXY_PRODUCT_KEY_TO_CN[row.pk]} 合计 ${Number(row.total.toFixed(3)).toString()}%`)
          .join('；')}`

  return {
    valid,
    converged: solved.converged,
    stage: solved.converged ? 'complete' : 'stage2',
    message,
    products,
    totalProductMass,
    iterations: solved.iterations,
    maxRelativeResidual: solved.maxRelativeResidual,
    recommended: {
      fuelWeight: unpacked.fuelMass,
      fuelWaterWeight: unpacked.fuelColumn.waterWeight ?? 0,
      fuelMoisture: unpacked.fuelColumn.moisture ?? 0,
      solventWeights,
      gasWeights,
    },
    constraintResiduals,
    equations,
    equationCount,
    objectiveEquationCount,
    elementBalanceResiduals: computeGlobalElementBalanceResiduals(unpacked.balanceFeed, products),
  }
}

export function productElementTotal(product: OxyProductResult): number {
  return Object.values(product.composition).reduce((sum, value) => sum + (value ?? 0), 0)
}

export function verifyProductElementTotals(product: OxyProductResult, tolerance = 0.5): boolean {
  const total = productElementTotal(product)
  return Math.abs(total - 100) <= tolerance || product.mass <= 0
}

export { parseConstraintExpression, evaluateConstraintExprString }
