import type { SimMesh } from './mesh.ts'

/**
 * 变系数泊松方程 A p = b，A p = Σ T_f (p_P - p_N) + D_P p_P。
 * 共轭梯度用对称 V 循环预条件：红黑 Gauss-Seidel 平滑，分片常数插值，粗层系数为细层面系数之和的一半。
 */

type Level = {
  nx: number
  ny: number
  nz: number
  n: number
  mask: Uint8Array
  tx: Float64Array
  ty: Float64Array
  tz: Float64Array
  d: Float64Array
  diag: Float64Array
  x: Float64Array
  b: Float64Array
  r: Float64Array
  coarse: Level | null
}

export type PressureResult = { iterations: number; residual: number; converged: boolean }

export type PressureSolver = {
  /** 细层面系数，调用方每步写入 */
  tx: Float64Array
  ty: Float64Array
  tz: Float64Array
  /** Dirichlet 出口对角项 */
  d: Float64Array
  /** 写入系数后调用，更新对角项与粗层 */
  prepare: () => void
  solve: (b: Float64Array, x: Float64Array, tolerance: number, maxIterations: number) => PressureResult
  apply: (x: Float64Array, out: Float64Array) => void
}

const PRE_SWEEPS = 2
const COARSE_SWEEPS = 24

function createLevel(nx: number, ny: number, nz: number): Level {
  const n = nx * ny * nz
  return {
    nx, ny, nz, n,
    mask: new Uint8Array(n),
    tx: new Float64Array((nx + 1) * ny * nz),
    ty: new Float64Array(nx * (ny + 1) * nz),
    tz: new Float64Array(nx * ny * (nz + 1)),
    d: new Float64Array(n),
    diag: new Float64Array(n),
    x: new Float64Array(n),
    b: new Float64Array(n),
    r: new Float64Array(n),
    coarse: null,
  }
}

function computeDiagonal(level: Level) {
  const { nx, ny, nz, mask, tx, ty, tz, d, diag } = level
  const nxy = nx * ny
  for (let k = 0; k < nz; k += 1) {
    for (let j = 0; j < ny; j += 1) {
      const row = nx * (j + ny * k)
      const xRow = (nx + 1) * (j + ny * k)
      const yRow = nx * (j + (ny + 1) * k)
      for (let i = 0; i < nx; i += 1) {
        const c = row + i
        if (!mask[c]) {
          diag[c] = 0
          continue
        }
        const value = tx[xRow + i] + tx[xRow + i + 1] + ty[yRow + i] + ty[yRow + i + nx] + tz[c] + tz[c + nxy] + d[c]
        diag[c] = value
        if (!(value > 0)) mask[c] = 0
      }
    }
  }
}

function restrictCoefficients(fine: Level, coarse: Level) {
  const { nx, ny, nz } = fine
  const cnx = coarse.nx
  const cny = coarse.ny
  coarse.tx.fill(0)
  coarse.ty.fill(0)
  coarse.tz.fill(0)
  coarse.d.fill(0)
  coarse.mask.fill(0)
  for (let k = 0; k < nz; k += 1) {
    const K = k >> 1
    for (let j = 0; j < ny; j += 1) {
      const J = j >> 1
      for (let i = 0; i <= nx; i += 1) {
        if (i & 1) continue
        const value = fine.tx[i + (nx + 1) * (j + ny * k)]
        if (value !== 0) coarse.tx[(i >> 1) + (cnx + 1) * (J + cny * K)] += 0.5 * value
      }
    }
  }
  for (let k = 0; k < nz; k += 1) {
    const K = k >> 1
    for (let j = 0; j <= ny; j += 2) {
      for (let i = 0; i < nx; i += 1) {
        const value = fine.ty[i + nx * (j + (ny + 1) * k)]
        if (value !== 0) coarse.ty[(i >> 1) + cnx * ((j >> 1) + (cny + 1) * K)] += 0.5 * value
      }
    }
  }
  for (let k = 0; k <= nz; k += 2) {
    for (let j = 0; j < ny; j += 1) {
      for (let i = 0; i < nx; i += 1) {
        const value = fine.tz[i + nx * (j + ny * k)]
        if (value !== 0) coarse.tz[(i >> 1) + cnx * ((j >> 1) + cny * (k >> 1))] += 0.5 * value
      }
    }
  }
  for (let k = 0; k < nz; k += 1) {
    for (let j = 0; j < ny; j += 1) {
      for (let i = 0; i < nx; i += 1) {
        const c = i + nx * (j + ny * k)
        if (!fine.mask[c]) continue
        const parent = (i >> 1) + cnx * ((j >> 1) + cny * (k >> 1))
        coarse.mask[parent] = 1
        coarse.d[parent] += 0.5 * fine.d[c]
      }
    }
  }
  computeDiagonal(coarse)
}

/**
 * 边界面系数为零，内部行读越行邻居也乘零；只有首末两层与首末行需要防越界，
 * 其余行走无分支的快速路径。
 */
function smooth(level: Level, color: number) {
  const { nx, ny, nz, mask, tx, ty, tz, diag, x, b } = level
  const nxy = nx * ny
  for (let k = 0; k < nz; k += 1) {
    for (let j = 0; j < ny; j += 1) {
      const row = nx * (j + ny * k)
      const xRow = (nx + 1) * (j + ny * k)
      const yRow = nx * (j + (ny + 1) * k)
      const start = (j + k + color) & 1
      if (k > 0 && k < nz - 1 && j > 0 && j < ny - 1) {
        for (let i = start; i < nx; i += 2) {
          const c = row + i
          if (!mask[c]) continue
          x[c] = (b[c] + tx[xRow + i] * x[c - 1] + tx[xRow + i + 1] * x[c + 1] + ty[yRow + i] * x[c - nx]
            + ty[yRow + i + nx] * x[c + nx] + tz[c] * x[c - nxy] + tz[c + nxy] * x[c + nxy]) / diag[c]
        }
        continue
      }
      for (let i = start; i < nx; i += 2) {
        const c = row + i
        if (!mask[c]) continue
        let sum = b[c]
        if (i > 0) sum += tx[xRow + i] * x[c - 1]
        if (i < nx - 1) sum += tx[xRow + i + 1] * x[c + 1]
        if (j > 0) sum += ty[yRow + i] * x[c - nx]
        if (j < ny - 1) sum += ty[yRow + i + nx] * x[c + nx]
        if (k > 0) sum += tz[c] * x[c - nxy]
        if (k < nz - 1) sum += tz[c + nxy] * x[c + nxy]
        x[c] = sum / diag[c]
      }
    }
  }
}

function applyOperator(level: Level, x: Float64Array, out: Float64Array) {
  const { nx, ny, nz, mask, tx, ty, tz, diag } = level
  const nxy = nx * ny
  for (let k = 0; k < nz; k += 1) {
    for (let j = 0; j < ny; j += 1) {
      const row = nx * (j + ny * k)
      const xRow = (nx + 1) * (j + ny * k)
      const yRow = nx * (j + (ny + 1) * k)
      if (k > 0 && k < nz - 1 && j > 0 && j < ny - 1) {
        for (let i = 0; i < nx; i += 1) {
          const c = row + i
          out[c] = mask[c]
            ? diag[c] * x[c] - tx[xRow + i] * x[c - 1] - tx[xRow + i + 1] * x[c + 1] - ty[yRow + i] * x[c - nx]
              - ty[yRow + i + nx] * x[c + nx] - tz[c] * x[c - nxy] - tz[c + nxy] * x[c + nxy]
            : 0
        }
        continue
      }
      for (let i = 0; i < nx; i += 1) {
        const c = row + i
        if (!mask[c]) {
          out[c] = 0
          continue
        }
        let sum = diag[c] * x[c]
        if (i > 0) sum -= tx[xRow + i] * x[c - 1]
        if (i < nx - 1) sum -= tx[xRow + i + 1] * x[c + 1]
        if (j > 0) sum -= ty[yRow + i] * x[c - nx]
        if (j < ny - 1) sum -= ty[yRow + i + nx] * x[c + nx]
        if (k > 0) sum -= tz[c] * x[c - nxy]
        if (k < nz - 1) sum -= tz[c + nxy] * x[c + nxy]
        out[c] = sum
      }
    }
  }
}

function vcycle(level: Level) {
  level.x.fill(0)
  const coarse = level.coarse
  if (!coarse) {
    for (let sweep = 0; sweep < COARSE_SWEEPS; sweep += 1) {
      smooth(level, 0)
      smooth(level, 1)
    }
    for (let sweep = 0; sweep < COARSE_SWEEPS; sweep += 1) {
      smooth(level, 1)
      smooth(level, 0)
    }
    return
  }
  for (let sweep = 0; sweep < PRE_SWEEPS; sweep += 1) {
    smooth(level, 0)
    smooth(level, 1)
  }
  applyOperator(level, level.x, level.r)
  const { nx, ny, nz, b, r, mask } = level
  for (let c = 0; c < level.n; c += 1) r[c] = mask[c] ? b[c] - r[c] : 0
  coarse.b.fill(0)
  const cnx = coarse.nx
  const cny = coarse.ny
  for (let k = 0; k < nz; k += 1) {
    for (let j = 0; j < ny; j += 1) {
      const parentRow = cnx * ((j >> 1) + cny * (k >> 1))
      const row = nx * (j + ny * k)
      for (let i = 0; i < nx; i += 1) coarse.b[parentRow + (i >> 1)] += r[row + i]
    }
  }
  vcycle(coarse)
  const x = level.x
  for (let k = 0; k < nz; k += 1) {
    for (let j = 0; j < ny; j += 1) {
      const parentRow = cnx * ((j >> 1) + cny * (k >> 1))
      const row = nx * (j + ny * k)
      for (let i = 0; i < nx; i += 1) {
        const c = row + i
        if (mask[c]) x[c] += coarse.x[parentRow + (i >> 1)]
      }
    }
  }
  for (let sweep = 0; sweep < PRE_SWEEPS; sweep += 1) {
    smooth(level, 1)
    smooth(level, 0)
  }
}

export function createPressureSolver(mesh: SimMesh): PressureSolver {
  const fine = createLevel(mesh.nx, mesh.ny, mesh.nz)
  for (let c = 0; c < fine.n; c += 1) fine.mask[c] = mesh.vf[c] > 0 ? 1 : 0
  const fineMask = Uint8Array.from(fine.mask)
  let level = fine
  while (Math.min(level.nx, level.ny, level.nz) > 2 && level.n > 512) {
    const coarse = createLevel(Math.ceil(level.nx / 2), Math.ceil(level.ny / 2), Math.ceil(level.nz / 2))
    level.coarse = coarse
    level = coarse
  }
  const n = fine.n
  const r = new Float64Array(n)
  const z = new Float64Array(n)
  const p = new Float64Array(n)
  const q = new Float64Array(n)
  const fineX = fine.x
  const fineB = fine.b

  const precondition = (input: Float64Array, output: Float64Array) => {
    fine.b = input
    fine.x = output
    vcycle(fine)
    fine.b = fineB
    fine.x = fineX
  }

  const prepare = () => {
    fine.mask.set(fineMask)
    computeDiagonal(fine)
    let current = fine
    while (current.coarse) {
      restrictCoefficients(current, current.coarse)
      current = current.coarse
    }
  }

  const apply = (x: Float64Array, out: Float64Array) => applyOperator(fine, x, out)

  const solve = (b: Float64Array, x: Float64Array, tolerance: number, maxIterations: number): PressureResult => {
    const mask = fine.mask
    applyOperator(fine, x, q)
    let bNorm = 0
    let rNorm = 0
    for (let c = 0; c < n; c += 1) {
      if (!mask[c]) {
        r[c] = 0
        x[c] = 0
        continue
      }
      r[c] = b[c] - q[c]
      bNorm += b[c] * b[c]
      rNorm += r[c] * r[c]
    }
    bNorm = Math.sqrt(bNorm)
    rNorm = Math.sqrt(rNorm)
    const reference = Math.max(bNorm, rNorm, 1e-300)
    const threshold = tolerance * reference
    if (rNorm <= threshold) return { iterations: 0, residual: rNorm / reference, converged: true }
    precondition(r, z)
    let rz = 0
    for (let c = 0; c < n; c += 1) {
      p[c] = z[c]
      rz += r[c] * z[c]
    }
    let iterations = 0
    while (iterations < maxIterations) {
      iterations += 1
      applyOperator(fine, p, q)
      let pq = 0
      for (let c = 0; c < n; c += 1) pq += p[c] * q[c]
      if (!(Math.abs(pq) > 0)) break
      const alpha = rz / pq
      rNorm = 0
      for (let c = 0; c < n; c += 1) {
        x[c] += alpha * p[c]
        r[c] -= alpha * q[c]
        rNorm += r[c] * r[c]
      }
      rNorm = Math.sqrt(rNorm)
      if (rNorm <= threshold) break
      precondition(r, z)
      let rzNext = 0
      for (let c = 0; c < n; c += 1) rzNext += r[c] * z[c]
      const beta = rzNext / rz
      rz = rzNext
      for (let c = 0; c < n; c += 1) p[c] = z[c] + beta * p[c]
    }
    const residual = rNorm / reference
    return { iterations, residual, converged: rNorm <= threshold && Number.isFinite(residual) }
  }

  return { tx: fine.tx, ty: fine.ty, tz: fine.tz, d: fine.d, prepare, solve, apply }
}
