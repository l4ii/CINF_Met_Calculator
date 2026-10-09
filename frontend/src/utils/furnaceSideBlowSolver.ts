/**
 * 炉宽截面上的粗网格稳定流体。
 * 半拉格朗日对流、扩散和压力投影（Stam），保证大时间步也不发散。
 * 液相分数和温度作为标量被同一速度场带走。液体偏重而下沉，密度比做了稳定化，不是工业级 CFD。
 */

export const FLOW_GRID_X = 48
export const FLOW_GRID_Y = 64

export type InletSide = 'both' | 'front' | 'back'

export type SolverParams = {
  widthM: number
  heightM: number
  liquidLevelM: number
  lanceHeightM: number
  inletSpeedMs: number
  inletRadiusM: number
}

export type FlowGrid = {
  nx: number
  ny: number
  phi: Float32Array
  u: Float32Array
  v: Float32Array
  temperature: Float32Array
  speed: Float32Array
}

const NX = FLOW_GRID_X
const NY = FLOW_GRID_Y

function ix(i: number, j: number): number {
  return i + j * NX
}

function setBoundary(kind: 0 | 1 | 2, values: Float32Array) {
  for (let i = 1; i < NX - 1; i += 1) {
    values[ix(i, 0)] = kind === 2 ? -values[ix(i, 1)] : values[ix(i, 1)]
    values[ix(i, NY - 1)] = values[ix(i, NY - 2)]
  }
  for (let j = 1; j < NY - 1; j += 1) {
    values[ix(0, j)] = kind === 1 ? -values[ix(1, j)] : values[ix(1, j)]
    values[ix(NX - 1, j)] = kind === 1 ? -values[ix(NX - 2, j)] : values[ix(NX - 2, j)]
  }
  values[ix(0, 0)] = 0.5 * (values[ix(1, 0)] + values[ix(0, 1)])
  values[ix(0, NY - 1)] = 0.5 * (values[ix(1, NY - 1)] + values[ix(0, NY - 2)])
  values[ix(NX - 1, 0)] = 0.5 * (values[ix(NX - 2, 0)] + values[ix(NX - 1, 1)])
  values[ix(NX - 1, NY - 1)] = 0.5 * (values[ix(NX - 2, NY - 1)] + values[ix(NX - 1, NY - 2)])
}

function solveLinear(kind: 0 | 1 | 2, next: Float32Array, source: Float32Array, a: number, c: number) {
  const inverse = 1 / c
  for (let pass = 0; pass < 12; pass += 1) {
    for (let j = 1; j < NY - 1; j += 1) {
      for (let i = 1; i < NX - 1; i += 1) {
        next[ix(i, j)] = (source[ix(i, j)] + a * (
          next[ix(i - 1, j)] + next[ix(i + 1, j)] + next[ix(i, j - 1)] + next[ix(i, j + 1)]
        )) * inverse
      }
    }
    setBoundary(kind, next)
  }
}

function project(u: Float32Array, v: Float32Array, pressure: Float32Array, divergence: Float32Array) {
  const scale = -0.5 / Math.max(NX - 2, NY - 2)
  for (let j = 1; j < NY - 1; j += 1) {
    for (let i = 1; i < NX - 1; i += 1) {
      divergence[ix(i, j)] = scale * (
        u[ix(i + 1, j)] - u[ix(i - 1, j)] + v[ix(i, j + 1)] - v[ix(i, j - 1)]
      )
      pressure[ix(i, j)] = 0
    }
  }
  setBoundary(0, divergence)
  setBoundary(0, pressure)
  solveLinear(0, pressure, divergence, 1, 4)
  const half = 0.5 * Math.max(NX - 2, NY - 2)
  for (let j = 1; j < NY - 1; j += 1) {
    for (let i = 1; i < NX - 1; i += 1) {
      u[ix(i, j)] -= half * (pressure[ix(i + 1, j)] - pressure[ix(i - 1, j)])
      v[ix(i, j)] -= half * (pressure[ix(i, j + 1)] - pressure[ix(i, j - 1)])
    }
  }
  setBoundary(1, u)
  setBoundary(2, v)
}

function advect(kind: 0 | 1 | 2, next: Float32Array, source: Float32Array, u: Float32Array, v: Float32Array, dt: number) {
  const maxX = NX - 1.001
  const maxY = NY - 1.001
  for (let j = 1; j < NY - 1; j += 1) {
    for (let i = 1; i < NX - 1; i += 1) {
      let x = i - dt * u[ix(i, j)]
      let y = j - dt * v[ix(i, j)]
      if (x < 0.5) x = 0.5
      if (x > maxX) x = maxX
      if (y < 0.5) y = 0.5
      if (y > maxY) y = maxY
      const i0 = Math.floor(x)
      const j0 = Math.floor(y)
      const s = x - i0
      const t = y - j0
      next[ix(i, j)] =
        (1 - s) * ((1 - t) * source[ix(i0, j0)] + t * source[ix(i0, j0 + 1)]) +
        s * ((1 - t) * source[ix(i0 + 1, j0)] + t * source[ix(i0 + 1, j0 + 1)])
    }
  }
  setBoundary(kind, next)
}

function cellY(params: SolverParams, meters: number): number {
  const fraction = Math.min(0.98, Math.max(0.02, meters / Math.max(params.heightM, 0.1)))
  return 1 + Math.round(fraction * (NY - 3))
}

function inletColumns(side: InletSide): Array<{ i: number; sign: number }> {
  if (side === 'front') return [{ i: NX - 2, sign: -1 }]
  if (side === 'back') return [{ i: 1, sign: 1 }]
  return [{ i: 1, sign: 1 }, { i: NX - 2, sign: -1 }]
}

export function inletSpeedMs(perTuyereNm3h: number, radiusM: number): number {
  const area = Math.PI * radiusM * radiusM
  if (!(area > 0) || !(perTuyereNm3h > 0)) return 0
  return perTuyereNm3h / 3600 / area
}

export function createFlowGrid(params: SolverParams, side: InletSide): FlowGrid {
  const count = NX * NY
  const phi = new Float32Array(count)
  const temperature = new Float32Array(count)
  const surface = cellY(params, params.liquidLevelM)
  for (let j = 0; j < NY; j += 1) {
    for (let i = 0; i < NX; i += 1) {
      const liquid = j <= surface ? 1 : 0
      phi[ix(i, j)] = liquid
      temperature[ix(i, j)] = liquid ? 1 : 0.15
    }
  }
  return { nx: NX, ny: NY, phi, u: new Float32Array(count), v: new Float32Array(count), temperature, speed: new Float32Array(count) }
}

function applyInlet(grid: FlowGrid, params: SolverParams, side: InletSide) {
  const dx = params.widthM / (NX - 2)
  const cellsPerSecond = params.inletSpeedMs / Math.max(dx, 1e-4)
  const center = cellY(params, params.lanceHeightM)
  const radius = Math.max(1, Math.round(params.inletRadiusM / Math.max(dx, 1e-4)))
  for (const column of inletColumns(side)) {
    for (let j = center - radius; j <= center + radius; j += 1) {
      if (j < 1 || j > NY - 2) continue
      const id = ix(column.i, j)
      grid.u[id] = column.sign * cellsPerSecond
      grid.phi[id] = 0
      grid.temperature[id] = 0
    }
  }
}

export function stepFlowGrid(grid: FlowGrid, params: SolverParams, side: InletSide) {
  const dx = params.widthM / (NX - 2)
  const dt = Math.min(0.08, Math.max(0.008, 0.45 * dx / Math.max(params.inletSpeedMs, 0.4)))
  const nextU = new Float32Array(grid.u.length)
  const nextV = new Float32Array(grid.v.length)
  const nextPhi = new Float32Array(grid.phi.length)
  const nextT = new Float32Array(grid.temperature.length)
  const pressure = new Float32Array(grid.u.length)
  const divergence = new Float32Array(grid.u.length)
  applyInlet(grid, params, side)
  for (let j = 1; j < NY - 1; j += 1) {
    for (let i = 1; i < NX - 1; i += 1) {
      const id = ix(i, j)
      grid.v[id] += dt * (1.8 * (1 - grid.phi[id]) - 6.5 * grid.phi[id])
    }
  }
  const viscosity = dt * 0.00008 * (NX - 2) * (NY - 2)
  nextU.set(grid.u)
  nextV.set(grid.v)
  solveLinear(1, nextU, grid.u, viscosity, 1 + 4 * viscosity)
  solveLinear(2, nextV, grid.v, viscosity, 1 + 4 * viscosity)
  project(nextU, nextV, pressure, divergence)
  advect(1, grid.u, nextU, nextU, nextV, dt)
  advect(2, grid.v, nextV, nextU, nextV, dt)
  project(grid.u, grid.v, pressure, divergence)
  applyInlet(grid, params, side)
  advect(0, nextPhi, grid.phi, grid.u, grid.v, dt)
  const heat = dt * 0.00002 * (NX - 2) * (NY - 2)
  solveLinear(0, nextT, grid.temperature, heat, 1 + 4 * heat)
  advect(0, grid.temperature, nextT, grid.u, grid.v, dt)
  for (let j = 1; j < NY - 1; j += 1) {
    for (let i = 1; i < NX - 1; i += 1) {
      const id = ix(i, j)
      const liquid = Math.min(1, Math.max(0, nextPhi[id]))
      grid.phi[id] = liquid
      if (liquid > 0.82) grid.temperature[id] += (1 - grid.temperature[id]) * 0.04
      grid.temperature[id] = Math.min(1, Math.max(0, grid.temperature[id]))
      const dxCells = grid.u[id] * dx
      const dyCells = grid.v[id] * (params.heightM / (NY - 2))
      grid.speed[id] = Math.hypot(dxCells, dyCells)
    }
  }
  applyInlet(grid, params, side)
}
