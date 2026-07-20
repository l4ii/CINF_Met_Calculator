import {
  compileOxyConstraintSystem,
  equationResidualRow,
  evaluateScaledEquationResidual,
  formatCompiledEquation,
  type CompiledEquation,
} from './copperConstraintSystemCompiler.ts'
import type { OxySideBlowConstraintConfig } from './copperConstraintConfig.ts'
import {
  buildSymbolTableFromUnknowns,
  buildUnknownSpecs,
  createInitialUnpacked,
  packUnknowns,
  unpackProjectedUnknowns,
  type OxyConstraintBaseInput,
} from './copperConstraintUnknowns.ts'

export interface StrictSolverOptions {
  tolerance?: number
  maxIterations?: number
  lmLambda?: number
  shouldCancel?: () => boolean
  stagnationIterations?: number
  minRelativeImprovement?: number
}

export class OxyConstraintCalculationCancelledError extends Error {
  constructor(message = '计算已中断') {
    super(message)
    this.name = 'OxyConstraintCalculationCancelledError'
  }
}

export function isOxyConstraintCalculationCancelled(error: unknown): boolean {
  return error instanceof OxyConstraintCalculationCancelledError
}

function throwIfCancelled(options?: Pick<StrictSolverOptions, 'shouldCancel'>) {
  if (options?.shouldCancel?.()) throw new OxyConstraintCalculationCancelledError()
}

function yieldToMain(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(() => window.setTimeout(resolve, 0))
    } else {
      setTimeout(resolve, 0)
    }
  })
}

const SOLVER_YIELD_INTERVAL_MS = 16

function nowMs(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now()
}

export interface StrictSolverResult {
  converged: boolean
  stoppedByStagnation?: boolean
  x: number[]
  iterations: number
  maxRelativeResidual: number
  equations: CompiledEquation[]
  objectiveEquationCount: number
}

function clampVector(values: number[]): number[] {
  return values.map((value) => Math.max(0, value))
}

function projectVector(
  values: number[],
  specs: ReturnType<typeof buildUnknownSpecs>,
  baseInput: OxyConstraintBaseInput,
  config: OxySideBlowConstraintConfig
): number[] {
  const unpacked = unpackProjectedUnknowns(clampVector(values), specs, baseInput, config)
  return clampVector(packUnknowns(unpacked, specs))
}

function residualVector(
  x: number[],
  equations: CompiledEquation[],
  specs: ReturnType<typeof buildUnknownSpecs>,
  baseInput: OxyConstraintBaseInput,
  config: OxySideBlowConstraintConfig
): number[] {
  const unpacked = unpackProjectedUnknowns(x, specs, baseInput, config)
  const table = buildSymbolTableFromUnknowns(unpacked, baseInput, config)
  return equations.map((equation) => {
    const scaled = evaluateScaledEquationResidual(
      equation,
      table,
      config,
      unpacked.distributionFeed.elementWeights,
      unpacked.balanceFeed.elementWeights
    )
    return scaled.residual / scaled.scale
  })
}

function residualObjective(
  x: number[],
  equations: CompiledEquation[],
  specs: ReturnType<typeof buildUnknownSpecs>,
  baseInput: OxyConstraintBaseInput,
  config: OxySideBlowConstraintConfig
): number {
  return residualVector(x, equations, specs, baseInput, config).reduce((sum, value) => sum + value * value, 0)
}

function maxRelativeResidualFromSolution(
  x: number[],
  equations: CompiledEquation[],
  specs: ReturnType<typeof buildUnknownSpecs>,
  baseInput: OxyConstraintBaseInput,
  config: OxySideBlowConstraintConfig
): number {
  const unpacked = unpackProjectedUnknowns(x, specs, baseInput, config)
  const table = buildSymbolTableFromUnknowns(unpacked, baseInput, config)
  let max = 0
  for (const equation of equations) {
    const scaled = evaluateScaledEquationResidual(
      equation,
      table,
      config,
      unpacked.distributionFeed.elementWeights,
      unpacked.balanceFeed.elementWeights
    )
    max = Math.max(max, scaled.relativeResidual)
  }
  return max
}

async function numericalJacobian(
  x: number[],
  residuals: number[],
  equations: CompiledEquation[],
  specs: ReturnType<typeof buildUnknownSpecs>,
  baseInput: OxyConstraintBaseInput,
  config: OxySideBlowConstraintConfig,
  options: Pick<StrictSolverOptions, 'shouldCancel'> = {}
): Promise<number[][]> {
  const n = x.length
  const m = residuals.length
  const jacobian = Array.from({ length: m }, () => new Array<number>(n).fill(0))
  const eps = 1e-6
  let lastYieldAt = nowMs()

  for (let col = 0; col < n; col += 1) {
    throwIfCancelled(options)
    const currentTime = nowMs()
    if (currentTime - lastYieldAt >= SOLVER_YIELD_INTERVAL_MS) {
      await yieldToMain()
      lastYieldAt = nowMs()
    }
    const step = Math.max(eps, Math.abs(x[col]!) * eps)
    const forward = [...x]
    forward[col] = Math.max(0, forward[col]! + step)
    const projectedForward = projectVector(forward, specs, baseInput, config)
    const rForward = residualVector(projectedForward, equations, specs, baseInput, config)
    for (let row = 0; row < m; row += 1) {
      jacobian[row]![col] = (rForward[row]! - residuals[row]!) / step
    }
  }
  return jacobian
}

function solveNormalEquations(jtj: number[][], jtr: number[], lambda: number): number[] | null {
  const n = jtj.length
  const a = jtj.map((row, i) => row.map((value, j) => value + (i === j ? lambda : 0)))
  const b = jtr.map((value) => -value)
  return solveLinearSystem(a, b)
}

function solveLinearSystem(matrix: number[][], vector: number[], tolerance = 1e-12): number[] | null {
  const n = matrix.length
  if (n === 0 || vector.length !== n) return null
  const a = matrix.map((row) => [...row])
  const b = [...vector]

  for (let col = 0; col < n; col += 1) {
    let pivot = col
    for (let row = col + 1; row < n; row += 1) {
      if (Math.abs(a[row]![col]!) > Math.abs(a[pivot]![col]!)) pivot = row
    }
    if (Math.abs(a[pivot]![col]!) <= tolerance) return null
    if (pivot !== col) {
      ;[a[col], a[pivot]] = [a[pivot]!, a[col]!]
      ;[b[col], b[pivot]] = [b[pivot]!, b[col]!]
    }
    for (let row = col + 1; row < n; row += 1) {
      const factor = a[row]![col]! / a[col]![col]!
      for (let k = col; k < n; k += 1) a[row]![k]! -= factor * a[col]![k]!
      b[row]! -= factor * b[col]!
    }
  }

  const x = new Array<number>(n).fill(0)
  for (let row = n - 1; row >= 0; row -= 1) {
    let sum = b[row]!
    for (let col = row + 1; col < n; col += 1) sum -= a[row]![col]! * x[col]!
    if (Math.abs(a[row]![row]!) <= tolerance) return null
    x[row] = sum / a[row]![row]!
  }
  return x
}

export async function solveOxyConstraintSystemStrict(
  baseInput: OxyConstraintBaseInput,
  config: OxySideBlowConstraintConfig,
  options: StrictSolverOptions = {}
): Promise<StrictSolverResult> {
  const tolerance = options.tolerance ?? config.solverParams?.tolerance ?? 1e-4
  const maxIterations = options.maxIterations ?? config.solverParams?.newtonMaxIterations ?? 120
  const stagnationIterations = Math.max(3, options.stagnationIterations ?? 8)
  const minRelativeImprovement = Math.max(0, options.minRelativeImprovement ?? 0.005)
  const specs = buildUnknownSpecs(config, baseInput)
  const hardEquations = compileOxyConstraintSystem(config)
  const objectiveEquations = compileOxyConstraintSystem(config, { includeSoftCustom: true })

  let x = projectVector(packUnknowns(createInitialUnpacked(baseInput, config), specs), specs, baseInput, config)
  let lambda = options.lmLambda ?? 1e-2
  let converged = false
  let stoppedByStagnation = false
  let iterations = 0
  let maxRel = Number.POSITIVE_INFINITY
  let bestObjective = Number.POSITIVE_INFINITY
  let bestMaxRel = Number.POSITIVE_INFINITY
  let stagnantPasses = 0

  for (let iter = 0; iter < maxIterations; iter += 1) {
    throwIfCancelled(options)
    await yieldToMain()
    iterations = iter + 1
    const residuals = residualVector(x, objectiveEquations, specs, baseInput, config)
    const objective = residuals.reduce((sum, value) => sum + value * value, 0)
    maxRel = maxRelativeResidualFromSolution(x, hardEquations, specs, baseInput, config)
    const improved =
      objective < bestObjective * (1 - minRelativeImprovement) ||
      maxRel < bestMaxRel * (1 - minRelativeImprovement)
    if (improved) {
      bestObjective = Math.min(bestObjective, objective)
      bestMaxRel = Math.min(bestMaxRel, maxRel)
      stagnantPasses = 0
    } else {
      stagnantPasses += 1
    }
    if (maxRel < tolerance) {
      converged = true
      break
    }
    if (iter + 1 >= stagnationIterations && stagnantPasses >= stagnationIterations && maxRel > tolerance) {
      stoppedByStagnation = true
      break
    }

    const jacobian = await numericalJacobian(x, residuals, objectiveEquations, specs, baseInput, config, options)
    const m = residuals.length
    const n = x.length
    const jtj = Array.from({ length: n }, () => new Array<number>(n).fill(0))
    const jtr = new Array<number>(n).fill(0)
    for (let row = 0; row < m; row += 1) {
      for (let i = 0; i < n; i += 1) {
        jtr[i]! += jacobian[row]![i]! * residuals[row]!
        for (let j = 0; j < n; j += 1) {
          jtj[i]![j]! += jacobian[row]![i]! * jacobian[row]![j]!
        }
      }
    }

    let dx = solveNormalEquations(jtj, jtr, lambda)
    if (!dx) {
      lambda *= 10
      continue
    }

    let accepted = false
    for (let attempt = 0; attempt < 8; attempt += 1) {
      throwIfCancelled(options)
      const candidate = projectVector(x.map((value, index) => value + (dx[index] ?? 0)), specs, baseInput, config)
      const candidateObjective = residualObjective(candidate, objectiveEquations, specs, baseInput, config)
      const candidateMax = maxRelativeResidualFromSolution(candidate, hardEquations, specs, baseInput, config)
      if (candidateObjective < objective) {
        x = candidate
        maxRel = candidateMax
        lambda = Math.max(lambda * 0.3, 1e-8)
        accepted = true
        break
      }
      lambda *= 5
      dx = solveNormalEquations(jtj, jtr, lambda)
      if (!dx) break
    }

    if (!accepted && maxRel >= Number.POSITIVE_INFINITY * 0) {
      lambda = Math.min(lambda * 10, 1e8)
    }
  }

  return {
    converged,
    stoppedByStagnation,
    x,
    iterations,
    maxRelativeResidual: maxRel,
    equations: hardEquations,
    objectiveEquationCount: objectiveEquations.length,
  }
}

export function buildResidualRowsFromSolution(
  x: number[],
  baseInput: OxyConstraintBaseInput,
  config: OxySideBlowConstraintConfig
) {
  const specs = buildUnknownSpecs(config, baseInput)
  const equations = compileOxyConstraintSystem(config, { includeSoftCustom: true })
  const unpacked = unpackProjectedUnknowns(x, specs, baseInput, config)
  const table = buildSymbolTableFromUnknowns(unpacked, baseInput, config)
  return equations.map((equation) => {
    const row = equationResidualRow(
      equation,
      table,
      config,
      unpacked.distributionFeed.elementWeights,
      unpacked.balanceFeed.elementWeights
    )
    return {
      ...row,
      soft: equation.soft,
      kind: equation.kind,
      productKey: equation.productKey,
      constraintElement: equation.constraintElement,
      feedKey: equation.feedKey,
      ruleValue: equation.ruleValue,
      label: equation.label,
    }
  })
}

export { compileOxyConstraintSystem }
export { formatCompiledEquation }
