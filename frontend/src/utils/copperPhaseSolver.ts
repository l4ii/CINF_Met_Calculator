import type { CopperElementKey } from './copperWorkflowCalc.ts'

export type PhaseSolverSpec = {
  id: string
  fractions: Partial<Record<CopperElementKey, number>>
}

export type PhaseSolverStatus =
  | 'ok'
  | 'underdetermined'
  | 'singular'
  | 'inconsistent'
  | 'empty'

export type PhaseSolverResult = {
  valid: boolean
  status: PhaseSolverStatus
  amounts: Record<string, number>
  residual: Partial<Record<CopperElementKey, number>>
  message?: string
  elementCount: number
  phaseCount: number
}

export type PhaseSolverOptions = {
  tolerance?: number
}

const EXCLUDED_POOL_ELEMENTS = new Set<CopperElementKey>([
  'O(氧)',
  'C (碳)',
  'N(氮)',
  'Other(其他)',
])

function cloneMatrix(matrix: number[][]) {
  return matrix.map((row) => [...row])
}

/** 高斯消元解 Ax = b；方阵且非奇异时返回解，否则 null */
function solveSquareLinearSystem(matrix: number[][], vector: number[], tolerance = 1e-9): number[] | null {
  const n = matrix.length
  if (n === 0 || vector.length !== n) return null
  const a = cloneMatrix(matrix)
  const b = [...vector]

  for (let col = 0; col < n; col += 1) {
    let pivotRow = col
    for (let row = col + 1; row < n; row += 1) {
      if (Math.abs(a[row]![col]!) > Math.abs(a[pivotRow]![col]!)) pivotRow = row
    }
    if (Math.abs(a[pivotRow]![col]!) <= tolerance) return null
    if (pivotRow !== col) {
      ;[a[col], a[pivotRow]] = [a[pivotRow]!, a[col]!]
      ;[b[col], b[pivotRow]] = [b[pivotRow]!, b[col]!]
    }
    for (let row = col + 1; row < n; row += 1) {
      const factor = a[row]![col]! / a[col]![col]!
      for (let k = col; k < n; k += 1) {
        a[row]![k]! -= factor * a[col]![k]!
      }
      b[row]! -= factor * b[col]!
    }
  }

  const x = new Array<number>(n).fill(0)
  for (let row = n - 1; row >= 0; row -= 1) {
    let sum = b[row]!
    for (let col = row + 1; col < n; col += 1) {
      sum -= a[row]![col]! * x[col]!
    }
    if (Math.abs(a[row]![row]!) <= tolerance) return null
    x[row] = sum / a[row]![row]!
  }
  return x
}

function transpose(matrix: number[][]) {
  if (matrix.length === 0) return []
  const rows = matrix.length
  const cols = matrix[0]?.length ?? 0
  return Array.from({ length: cols }, (_, col) => Array.from({ length: rows }, (_, row) => matrix[row]![col]!))
}

function multiplyMatrices(left: number[][], right: number[][]) {
  const rows = left.length
  const inner = right.length
  const cols = right[0]?.length ?? 0
  const out = Array.from({ length: rows }, () => new Array<number>(cols).fill(0))
  for (let i = 0; i < rows; i += 1) {
    for (let k = 0; k < inner; k += 1) {
      for (let j = 0; j < cols; j += 1) {
        out[i]![j]! += left[i]![k]! * right[k]![j]!
      }
    }
  }
  return out
}

function multiplyMatrixVector(matrix: number[][], vector: number[]) {
  return matrix.map((row) => row.reduce((sum, coeff, index) => sum + coeff * (vector[index] ?? 0), 0))
}

/** 最小二乘：AᵀA x = Aᵀb */
function solveLeastSquares(matrix: number[][], vector: number[], tolerance = 1e-9): number[] | null {
  const at = transpose(matrix)
  const ata = multiplyMatrices(at, matrix)
  const atb = multiplyMatrixVector(at, vector)
  return solveSquareLinearSystem(ata, atb, tolerance)
}

function collectParticipatingElements(
  phases: PhaseSolverSpec[],
  pool: Partial<Record<CopperElementKey, number>>
) {
  const phaseElements = new Set<CopperElementKey>()
  for (const phase of phases) {
    for (const [element, fraction] of Object.entries(phase.fractions) as [CopperElementKey, number][]) {
      if (!fraction || fraction <= 0) continue
      if (EXCLUDED_POOL_ELEMENTS.has(element)) continue
      phaseElements.add(element)
    }
  }
  const elements: CopperElementKey[] = []
  for (const element of phaseElements) {
    const amount = pool[element] ?? 0
    if (Number.isFinite(amount) && amount > 0) elements.push(element)
  }
  return elements
}

function buildSystem(
  phases: PhaseSolverSpec[],
  elements: CopperElementKey[],
  pool: Partial<Record<CopperElementKey, number>>
) {
  const matrix = elements.map((element) =>
    phases.map((phase) => {
      const fraction = phase.fractions[element] ?? 0
      return fraction > 0 ? fraction : 0
    })
  )
  const vector = elements.map((element) => Math.max(0, pool[element] ?? 0))
  return { matrix, vector }
}

function computeResidual(
  matrix: number[][],
  vector: number[],
  solution: number[],
  elements: CopperElementKey[]
): Partial<Record<CopperElementKey, number>> {
  const predicted = multiplyMatrixVector(matrix, solution)
  const residual: Partial<Record<CopperElementKey, number>> = {}
  for (let index = 0; index < elements.length; index += 1) {
    const delta = (vector[index] ?? 0) - (predicted[index] ?? 0)
    if (Math.abs(delta) > 1e-9) residual[elements[index]!] = delta
  }
  return residual
}

function emptyResult(
  status: PhaseSolverStatus,
  message: string,
  elementCount = 0,
  phaseCount = 0
): PhaseSolverResult {
  return {
    valid: false,
    status,
    amounts: {},
    residual: {},
    message,
    elementCount,
    phaseCount,
  }
}

/**
 * 通用物相分配：联立元素质量守恒 A·m = b。
 * - 物相数 > 元素数：欠定，返回 invalid
 * - 物相数 = 元素数：高斯消元唯一解
 * - 物相数 < 元素数：最小二乘，残差元素质量写入 residual
 */
export function solvePhaseDistribution(
  phases: PhaseSolverSpec[],
  pool: Partial<Record<CopperElementKey, number>>,
  options: PhaseSolverOptions = {}
): PhaseSolverResult {
  const tolerance = options.tolerance ?? 1e-6
  const activePhases = phases.filter((phase) => Object.keys(phase.fractions ?? {}).length > 0)
  if (activePhases.length === 0) {
    return emptyResult('empty', '未选择可计算的物相')
  }

  const elements = collectParticipatingElements(activePhases, pool)
  const phaseCount = activePhases.length
  const elementCount = elements.length

  if (elementCount === 0) {
    return emptyResult('empty', '化验单中无可参与分配的已知元素', 0, phaseCount)
  }

  if (phaseCount > elementCount) {
    return emptyResult(
      'underdetermined',
      `物相个数(${phaseCount})多于可分配元素数(${elementCount})，方程欠定，请减少物相或补充约束`,
      elementCount,
      phaseCount
    )
  }

  const { matrix, vector } = buildSystem(activePhases, elements, pool)
  const solution =
    phaseCount === elementCount
      ? solveSquareLinearSystem(matrix, vector, tolerance)
      : solveLeastSquares(matrix, vector, tolerance)

  if (!solution) {
    return emptyResult(
      'singular',
      '物相组合线性相关，无法求解唯一物相分配，请调整物相或化验值',
      elementCount,
      phaseCount
    )
  }

  const amounts: Record<string, number> = {}
  for (let index = 0; index < activePhases.length; index += 1) {
    const value = solution[index] ?? 0
    amounts[activePhases[index]!.id] = value < 0 ? 0 : value
  }
  const hasNegative = solution.some((value) => value < -tolerance)
  if (hasNegative) {
    return {
      valid: false,
      status: 'inconsistent',
      amounts: Object.fromEntries(activePhases.map((phase) => [phase.id, 0])),
      residual: {},
      message: '物相组合与化验单不自洽（解出负值），请调整物相或化验值',
      elementCount,
      phaseCount,
    }
  }

  const residual =
    phaseCount < elementCount ? computeResidual(matrix, vector, solution, elements) : ({} as Partial<Record<CopperElementKey, number>>)

  return {
    valid: true,
    status: 'ok',
    amounts,
    residual,
    elementCount,
    phaseCount,
  }
}
