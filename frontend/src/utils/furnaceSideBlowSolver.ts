/**
 * A low-resolution, physical-units 2-D mixture RANS/VOF demonstration solver.
 *
 * The calculation represents a furnace-width × furnace-height section.  It uses
 * a single incompressible velocity field, a conservative donor-cell liquid
 * volume fraction, a variable-density pressure projection and a standard
 * k-epsilon closure.  It deliberately omits heat transfer, chemistry, surface
 * tension and phase slip; the UI labels this as an engineering demonstration.
 */

export const FLOW_GRID_X = 48
export const FLOW_GRID_Y = 64

export type InletSide = 'both' | 'front' | 'back'

export type GasState = {
  oxygenFraction?: number
  normalTemperatureK?: number
  normalPressurePa?: number
  actualTemperatureK?: number
  actualPressurePa?: number
  compressibility?: number
}

export type SolverParams = {
  widthM: number
  heightM: number
  liquidLevelM: number
  lanceHeightM: number
  inletSpeedMs: number
  inletRadiusM: number
  /** 炉顶烟道出口在炉宽方向的开口宽度 m。不传时炉顶整宽都是出口。 */
  outletWidthM?: number
  gasDensityKgM3?: number
  liquidDensityKgM3?: number
  gasViscosityPaS?: number
  liquidViscosityPaS?: number
  gasState?: GasState
}

export type FlowGrid = {
  nx: number
  ny: number
  dx: number
  dy: number
  timeS: number
  dtS: number
  phi: Float32Array
  u: Float32Array
  v: Float32Array
  temperature: Float32Array
  injectedGas: Float32Array
  speed: Float32Array
  pressure: Float32Array
  k: Float32Array
  epsilon: Float32Array
  nuT: Float32Array
  rho: Float32Array
  divergence: Float32Array
  pressureResidual: number
  divergenceMax: number
  divergenceRms: number
  massError: number
  liquidVolumeM3: number
  liquidFluxInM3s: number
  liquidFluxOutM3s: number
  iterations: number
  clippedAlphaVolumeM3: number
  numericalProtectionCount: number
}

const NX = FLOW_GRID_X
const NY = FLOW_GRID_Y
const C_MU = 0.09
const C1_EPS = 1.44
const C2_EPS = 1.92
const SIGMA_K = 1
const SIGMA_EPS = 1.3
const G = 9.81
const MIN_K = 1e-8
const MIN_EPSILON = 1e-7
const MAX_PRESSURE_ITERATIONS = 48
const INLET_TURBULENCE_INTENSITY = 0.1
const MAX_DEMO_VELOCITY_MS = 80
const MAX_DEMO_PRESSURE_PA = 2e6

function ix(i: number, j: number): number {
  return i + j * NX
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function positive(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function stateValue(state: GasState | undefined, key: keyof GasState, fallback: number): number {
  const value = state?.[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

export function actualGasFlowM3s(flowNm3h: number, gasState?: GasState): number {
  if (!(flowNm3h > 0)) return 0
  const tn = positive(stateValue(gasState, 'normalTemperatureK', 273.15), 273.15)
  const pn = positive(stateValue(gasState, 'normalPressurePa', 101325), 101325)
  const ta = positive(stateValue(gasState, 'actualTemperatureK', 293.15), 293.15)
  const pa = positive(stateValue(gasState, 'actualPressurePa', 140000), 140000)
  const z = positive(stateValue(gasState, 'compressibility', 1), 1)
  // flowNm3h is already the oxygen-stream standard volume from the batch gas column.
  return flowNm3h * (ta / tn) * (pn / pa) * z / 3600
}

export function inletSpeedMs(flowNm3h: number, radiusM: number, gasState?: GasState): number {
  const area = Math.PI * radiusM * radiusM
  if (!(area > 0)) return 0
  return actualGasFlowM3s(flowNm3h, gasState) / area
}

function densityAt(phi: number, gasDensity: number, liquidDensity: number): number {
  return gasDensity + clamp(phi, 0, 1) * (liquidDensity - gasDensity)
}

function viscosityAt(phi: number, gasViscosity: number, liquidViscosity: number): number {
  return gasViscosity + clamp(phi, 0, 1) * (liquidViscosity - gasViscosity)
}

function cellY(params: SolverParams, meters: number): number {
  return clamp(Math.round(meters / Math.max(params.heightM, 0.1) * (NY - 3)) + 1, 1, NY - 2)
}

function inletRowBounds(grid: FlowGrid, params: SolverParams): [number, number] {
  const center = cellY(params, params.lanceHeightM)
  const radiusCells = Math.floor(Math.max(0, params.inletRadiusM) / grid.dy)
  return [Math.max(0, center - radiusCells), Math.min(NY - 1, center + radiusCells)]
}

function inletColumns(side: InletSide): number[] {
  if (side === 'front') return [NX - 1]
  if (side === 'back') return [0]
  return [0, NX - 1]
}

function hasLeftInlet(side: InletSide): boolean {
  return side === 'back' || side === 'both'
}

function hasRightInlet(side: InletSide): boolean {
  return side === 'front' || side === 'both'
}

function paramsDensity(params: SolverParams) {
  return {
    gas: positive(params.gasDensityKgM3 ?? 1.4, 1.4),
    liquid: positive(params.liquidDensityKgM3 ?? 3000, 3000),
    gasMu: positive(params.gasViscosityPaS ?? 1.9e-5, 1.9e-5),
    liquidMu: positive(params.liquidViscosityPaS ?? 0.004, 0.004),
  }
}

function updateMaterialFields(grid: FlowGrid, params: SolverParams) {
  const density = paramsDensity(params)
  for (let j = 0; j < NY; j += 1) {
    for (let i = 0; i < NX; i += 1) {
      const id = ix(i, j)
      grid.rho[id] = densityAt(grid.phi[id], density.gas, density.liquid)
    }
  }
}

function topIsFlueOutlet(column: number, params: SolverParams | undefined): boolean {
  if (!params || params.outletWidthM == null) return true
  const width = Math.max(params.widthM, 1e-6)
  const opening = Math.max(0, params.outletWidthM)
  if (!(opening > 0)) return false
  const fraction = Math.min(1, opening / width)
  const left = (1 - fraction) / 2
  const right = left + fraction
  const position = (column + 0.5) / NX
  return position >= left && position <= right
}

function pressureBoundaryValue(grid: FlowGrid, side: InletSide, i: number, j: number, direction: 'e' | 'w' | 'n' | 's', params?: SolverParams): { coefficient: number; neighbor: number } {
  const id = ix(i, j)
  if (direction === 'e' && i === NX - 2) {
    return hasRightInlet(side) ? { coefficient: 0, neighbor: grid.pressure[id] } : { coefficient: 0, neighbor: grid.pressure[id] }
  }
  if (direction === 'w' && i === 1) {
    return hasLeftInlet(side) ? { coefficient: 0, neighbor: grid.pressure[id] } : { coefficient: 0, neighbor: grid.pressure[id] }
  }
  if (direction === 'n' && j === NY - 2) {
    return topIsFlueOutlet(i, params) ? { coefficient: 1, neighbor: 0 } : { coefficient: 0, neighbor: grid.pressure[id] }
  }
  if (direction === 's' && j === 1) return { coefficient: 0, neighbor: grid.pressure[id] }
  const ni = direction === 'e' ? i + 1 : direction === 'w' ? i - 1 : i
  const nj = direction === 'n' ? j + 1 : direction === 's' ? j - 1 : j
  return { coefficient: 1, neighbor: grid.pressure[ix(ni, nj)] }
}

function faceVelocity(grid: FlowGrid, side: InletSide, i: number, j: number, direction: 'e' | 'w' | 'n' | 's'): number {
  if (direction === 'e' && i === NX - 2) return grid.u[ix(NX - 1, j)]
  if (direction === 'w' && i === 1) return hasLeftInlet(side) ? grid.u[ix(0, j)] : grid.u[ix(0, j)]
  if (direction === 'n' && j === NY - 2) return grid.v[ix(i, NY - 1)]
  if (direction === 's' && j === 1) return 0
  if (direction === 'e') return 0.5 * (grid.u[ix(i, j)] + grid.u[ix(i + 1, j)])
  if (direction === 'w') return 0.5 * (grid.u[ix(i, j)] + grid.u[ix(i - 1, j)])
  if (direction === 'n') return 0.5 * (grid.v[ix(i, j)] + grid.v[ix(i, j + 1)])
  return 0.5 * (grid.v[ix(i, j)] + grid.v[ix(i, j - 1)])
}

function boundaryAlpha(grid: FlowGrid, side: InletSide, i: number, j: number, direction: 'e' | 'w' | 'n' | 's', inletValue = 0): number {
  if ((direction === 'e' && i === NX - 2 && hasRightInlet(side)) || (direction === 'w' && i === 1 && hasLeftInlet(side))) return inletValue
  if (direction === 'n' && j === NY - 2) return 0
  if (direction === 's' && j === 1) return grid.phi[ix(i, j)]
  if (direction === 'e') return grid.phi[ix(i + 1, j)]
  if (direction === 'w') return grid.phi[ix(i - 1, j)]
  if (direction === 'n') return grid.phi[ix(i, j + 1)]
  return grid.phi[ix(i, j - 1)]
}

function upwindScalar(grid: FlowGrid, side: InletSide, i: number, j: number, direction: 'e' | 'w' | 'n' | 's', scalar: Float32Array, inletValue = 0): number {
  const velocity = faceVelocity(grid, side, i, j, direction)
  if (direction === 'e') return velocity >= 0 ? scalar[ix(i, j)] : boundaryAlpha(grid, side, i, j, direction, inletValue)
  if (direction === 'w') return velocity >= 0 ? boundaryAlpha(grid, side, i, j, direction, inletValue) : scalar[ix(i, j)]
  if (direction === 'n') return velocity >= 0 ? scalar[ix(i, j)] : boundaryAlpha(grid, side, i, j, direction, inletValue)
  return velocity >= 0 ? boundaryAlpha(grid, side, i, j, direction, inletValue) : scalar[ix(i, j)]
}

function setInletBoundary(grid: FlowGrid, params: SolverParams, side: InletSide) {
  const [firstRow, lastRow] = inletRowBounds(grid, params)
  const speed = Math.max(0, params.inletSpeedMs)
  const turbulenceK = Math.max(MIN_K, 1.5 * (speed * INLET_TURBULENCE_INTENSITY) ** 2)
  const lengthScale = Math.max(params.inletRadiusM * 4, Math.min(params.widthM, params.heightM) * 0.02, 0.01)
  const turbulenceEpsilon = Math.max(MIN_EPSILON, C_MU ** 0.75 * turbulenceK ** 1.5 / lengthScale)
  for (const column of inletColumns(side)) {
    const sign = column === 0 ? 1 : -1
    for (let j = firstRow; j <= lastRow; j += 1) {
      const id = ix(column, j)
      grid.u[id] = sign * speed
      grid.v[id] = 0
      grid.phi[id] = 0
      grid.k[id] = turbulenceK
      grid.epsilon[id] = turbulenceEpsilon
      grid.temperature[id] = 0.15
      grid.injectedGas[id] = 1
    }
  }
}

function setWallAndOutletBoundaries(grid: FlowGrid, params: SolverParams, side: InletSide) {
  for (let i = 0; i < NX; i += 1) {
    const bottom = ix(i, 0)
    grid.u[bottom] = 0
    grid.v[bottom] = 0
    grid.k[bottom] = Math.max(MIN_K, grid.k[ix(i, 1)])
    grid.epsilon[bottom] = Math.max(MIN_EPSILON, grid.epsilon[ix(i, 1)])
    grid.phi[bottom] = grid.phi[ix(i, 1)]
    grid.temperature[bottom] = grid.temperature[ix(i, 1)]
    const top = ix(i, NY - 1)
    if (topIsFlueOutlet(i, params)) {
      grid.u[top] = grid.u[ix(i, NY - 2)]
      grid.v[top] = Math.max(0, grid.v[ix(i, NY - 2)])
    } else {
      grid.u[top] = 0
      grid.v[top] = 0
    }
    grid.k[top] = Math.max(MIN_K, grid.k[ix(i, NY - 2)])
    grid.epsilon[top] = Math.max(MIN_EPSILON, grid.epsilon[ix(i, NY - 2)])
    grid.phi[top] = grid.phi[ix(i, NY - 2)]
    grid.temperature[top] = grid.temperature[ix(i, NY - 2)]
  }
  for (let j = 0; j < NY; j += 1) {
    const left = ix(0, j)
    const right = ix(NX - 1, j)
    if (!hasLeftInlet(side)) {
      grid.u[left] = 0
      grid.v[left] = grid.v[ix(1, j)]
      grid.phi[left] = grid.phi[ix(1, j)]
      grid.k[left] = Math.max(MIN_K, grid.k[ix(1, j)])
      grid.epsilon[left] = Math.max(MIN_EPSILON, grid.epsilon[ix(1, j)])
    }
    if (!hasRightInlet(side)) {
      grid.u[right] = 0
      grid.v[right] = grid.v[ix(NX - 2, j)]
      grid.phi[right] = grid.phi[ix(NX - 2, j)]
      grid.k[right] = Math.max(MIN_K, grid.k[ix(NX - 2, j)])
      grid.epsilon[right] = Math.max(MIN_EPSILON, grid.epsilon[ix(NX - 2, j)])
    }
  }
  setInletBoundary(grid, params, side)
}

function calculateDt(grid: FlowGrid, params: SolverParams): number {
  let maximum = Math.min(MAX_DEMO_VELOCITY_MS, Math.max(params.inletSpeedMs, 0.5))
  for (let j = 1; j < NY - 1; j += 1) {
    for (let i = 1; i < NX - 1; i += 1) {
      const id = ix(i, j)
      maximum = Math.max(maximum, Math.min(MAX_DEMO_VELOCITY_MS, Math.hypot(grid.u[id], grid.v[id])))
    }
  }
  const cflDt = 0.35 * Math.min(grid.dx, grid.dy) / maximum
  return clamp(cflDt, 1e-6, 0.004)
}

function predictVelocity(grid: FlowGrid, nextU: Float32Array, nextV: Float32Array, params: SolverParams, side: InletSide, dt: number) {
  const density = paramsDensity(params)
  for (let j = 1; j < NY - 1; j += 1) {
    for (let i = 1; i < NX - 1; i += 1) {
      const id = ix(i, j)
      const ue = grid.u[ix(i + 1, j)]
      const uw = grid.u[ix(i - 1, j)]
      const vn = grid.v[ix(i, j + 1)]
      const vs = grid.v[ix(i, j - 1)]
      const duDx = (ue - uw) / (2 * grid.dx)
      const duDy = (vn - vs) / (2 * grid.dy)
      const dvDx = (grid.u[ix(i + 1, j)] - grid.u[ix(i - 1, j)]) / (2 * grid.dx)
      const dvDy = (vn - vs) / (2 * grid.dy)
      const lapU = (ue - 2 * grid.u[id] + uw) / (grid.dx * grid.dx) + (grid.u[ix(i, j + 1)] - 2 * grid.u[id] + grid.u[ix(i, j - 1)]) / (grid.dy * grid.dy)
      const lapV = (grid.v[ix(i + 1, j)] - 2 * grid.v[id] + grid.v[ix(i - 1, j)]) / (grid.dx * grid.dx) + (vn - 2 * grid.v[id] + vs) / (grid.dy * grid.dy)
      const nu = grid.nuT[id] + viscosityAt(grid.phi[id], density.gasMu, density.liquidMu) / grid.rho[id]
      const buoyancy = G * (density.liquid - grid.rho[id]) / density.liquid
      nextU[id] = clamp(finiteOr(grid.u[id] - dt * (grid.u[id] * duDx + grid.v[id] * duDy) + dt * nu * lapU, 0), -MAX_DEMO_VELOCITY_MS, MAX_DEMO_VELOCITY_MS)
      nextV[id] = clamp(finiteOr(grid.v[id] - dt * (grid.u[id] * dvDx + grid.v[id] * dvDy) + dt * nu * lapV + dt * buoyancy, 0), -MAX_DEMO_VELOCITY_MS, MAX_DEMO_VELOCITY_MS)
    }
  }
  for (let i = 1; i < NX - 1; i += 1) {
    nextU[ix(i, 0)] = 0
    nextV[ix(i, 0)] = 0
    if (topIsFlueOutlet(i, params)) {
      nextU[ix(i, NY - 1)] = nextU[ix(i, NY - 2)]
      nextV[ix(i, NY - 1)] = Math.max(0, nextV[ix(i, NY - 2)])
    } else {
      nextU[ix(i, NY - 1)] = 0
      nextV[ix(i, NY - 1)] = 0
    }
  }
  for (let j = 1; j < NY - 1; j += 1) {
    nextU[ix(0, j)] = hasLeftInlet(side) ? grid.u[ix(0, j)] : 0
    nextU[ix(NX - 1, j)] = hasRightInlet(side) ? grid.u[ix(NX - 1, j)] : 0
    nextV[ix(0, j)] = grid.v[ix(1, j)]
    nextV[ix(NX - 1, j)] = grid.v[ix(NX - 2, j)]
  }
}

function pressureProject(grid: FlowGrid, side: InletSide, dt: number, params: SolverParams): { residualPa: number; iterations: number } {
  const pressure = grid.pressure
  const relaxation = 1.55
  let residualPa = Infinity
  let iterations = 0
  for (let pass = 0; pass < MAX_PRESSURE_ITERATIONS; pass += 1) {
    let maximumCorrectionPa = 0
    // Red-black SOR converges materially faster than copying a full Jacobi field
    // at this coarse resolution, while keeping the calculation deterministic.
    for (let color = 0; color < 2; color += 1) {
      for (let j = 1; j < NY - 1; j += 1) {
        for (let i = 1; i < NX - 1; i += 1) {
          if ((i + j) % 2 !== color) continue
          const id = ix(i, j)
          const rho = Math.max(grid.rho[id], 1e-6)
          const ae = pressureBoundaryValue(grid, side, i, j, 'e', params).coefficient * dt / (rho * grid.dx * grid.dx)
          const aw = pressureBoundaryValue(grid, side, i, j, 'w', params).coefficient * dt / (rho * grid.dx * grid.dx)
          const an = pressureBoundaryValue(grid, side, i, j, 'n', params).coefficient * dt / (rho * grid.dy * grid.dy)
          const as = pressureBoundaryValue(grid, side, i, j, 's', params).coefficient * dt / (rho * grid.dy * grid.dy)
          const sum = ae + aw + an + as
          if (sum <= 0) continue
          const divergence = (faceVelocity(grid, side, i, j, 'e') - faceVelocity(grid, side, i, j, 'w')) / grid.dx + (faceVelocity(grid, side, i, j, 'n') - faceVelocity(grid, side, i, j, 's')) / grid.dy
          const east = pressureBoundaryValue(grid, side, i, j, 'e', params).neighbor
          const west = pressureBoundaryValue(grid, side, i, j, 'w', params).neighbor
          const north = pressureBoundaryValue(grid, side, i, j, 'n', params).neighbor
          const south = pressureBoundaryValue(grid, side, i, j, 's', params).neighbor
          const candidate = clamp(finiteOr((ae * east + aw * west + an * north + as * south - divergence) / sum, 0), -MAX_DEMO_PRESSURE_PA, MAX_DEMO_PRESSURE_PA)
          const oldPressure = pressure[id]
          const updatedPressure = clamp(oldPressure + relaxation * (candidate - oldPressure), -MAX_DEMO_PRESSURE_PA, MAX_DEMO_PRESSURE_PA)
          pressure[id] = updatedPressure
          maximumCorrectionPa = Math.max(maximumCorrectionPa, Math.abs(updatedPressure - oldPressure))
        }
      }
    }
    residualPa = maximumCorrectionPa
    iterations = pass + 1
    if (residualPa < 1e-3) break
  }
  for (let j = 1; j < NY - 1; j += 1) {
    for (let i = 1; i < NX - 1; i += 1) {
      const id = ix(i, j)
      const rho = Math.max(grid.rho[id], 1e-6)
      const pE = pressureBoundaryValue(grid, side, i, j, 'e', params).neighbor
      const pW = pressureBoundaryValue(grid, side, i, j, 'w', params).neighbor
      const pN = pressureBoundaryValue(grid, side, i, j, 'n', params).neighbor
      const pS = pressureBoundaryValue(grid, side, i, j, 's', params).neighbor
      grid.u[id] = clamp(finiteOr(grid.u[id] - dt / rho * (pE - pW) / (2 * grid.dx), 0), -MAX_DEMO_VELOCITY_MS, MAX_DEMO_VELOCITY_MS)
      grid.v[id] = clamp(finiteOr(grid.v[id] - dt / rho * (pN - pS) / (2 * grid.dy), 0), -MAX_DEMO_VELOCITY_MS, MAX_DEMO_VELOCITY_MS)
    }
  }
  grid.pressure[ix(0, 0)] = 0
  // The SOR correction is the pressure-equation residual proxy reported to the UI.
  return { residualPa: finiteOr(residualPa, 0), iterations }
}

function transportAlpha(grid: FlowGrid, side: InletSide, dt: number): { before: number; after: number; fluxIn: number; fluxOut: number; clipped: number } {
  const next = new Float32Array(grid.phi)
  const before = liquidVolume(grid)
  let fluxIn = 0
  let fluxOut = 0
  let clipped = 0
  const cellVolume = grid.dx * grid.dy
  for (let j = 1; j < NY - 1; j += 1) {
    for (let i = 1; i < NX - 1; i += 1) {
      const id = ix(i, j)
      const east = faceVelocity(grid, side, i, j, 'e') * grid.dy
      const west = faceVelocity(grid, side, i, j, 'w') * grid.dy
      const north = faceVelocity(grid, side, i, j, 'n') * grid.dx
      const south = faceVelocity(grid, side, i, j, 's') * grid.dx
      const fe = east * upwindScalar(grid, side, i, j, 'e', grid.phi)
      const fw = west * upwindScalar(grid, side, i, j, 'w', grid.phi)
      const fn = north * upwindScalar(grid, side, i, j, 'n', grid.phi)
      const fs = south * upwindScalar(grid, side, i, j, 's', grid.phi)
      const raw = grid.phi[id] - dt * (fe - fw + fn - fs) / cellVolume
      const bounded = clamp(raw, 0, 1)
      clipped += Math.abs(raw - bounded) * cellVolume
      next[id] = bounded
      // Only external faces belong in the control-volume liquid budget.
      if (i === NX - 2) {
        if (fe >= 0) fluxOut += fe
        else fluxIn += -fe
      }
      if (i === 1) {
        if (-fw >= 0) fluxOut += -fw
        else fluxIn += fw
      }
      if (j === NY - 2) {
        if (fn >= 0) fluxOut += fn
        else fluxIn += -fn
      }
      if (j === 1) {
        if (-fs >= 0) fluxOut += -fs
        else fluxIn += fs
      }
    }
  }
  grid.phi.set(next)
  const after = liquidVolume(grid)
  return { before, after, fluxIn, fluxOut, clipped }
}

function transportInjectedGas(grid: FlowGrid, params: SolverParams, side: InletSide, dt: number) {
  const next = new Float32Array(grid.injectedGas)
  for (let j = 1; j < NY - 1; j += 1) {
    for (let i = 1; i < NX - 1; i += 1) {
      const id = ix(i, j)
      const east = faceVelocity(grid, side, i, j, 'e')
      const west = faceVelocity(grid, side, i, j, 'w')
      const north = faceVelocity(grid, side, i, j, 'n')
      const south = faceVelocity(grid, side, i, j, 's')
      const fe = east * grid.dy * upwindScalar(grid, side, i, j, 'e', grid.injectedGas, 1)
      const fw = west * grid.dy * upwindScalar(grid, side, i, j, 'w', grid.injectedGas, 1)
      const fn = north * grid.dx * upwindScalar(grid, side, i, j, 'n', grid.injectedGas, 1)
      const fs = south * grid.dx * upwindScalar(grid, side, i, j, 's', grid.injectedGas, 1)
      const raw = grid.injectedGas[id] - dt * (fe - fw + fn - fs) / (grid.dx * grid.dy)
      next[id] = clamp(finiteOr(raw, 0), 0, 1)
    }
  }
  grid.injectedGas.set(next)
  for (let j = 0; j < NY; j += 1) {
    if (hasLeftInlet(side)) grid.injectedGas[ix(0, j)] = grid.injectedGas[ix(1, j)]
    if (hasRightInlet(side)) grid.injectedGas[ix(NX - 1, j)] = grid.injectedGas[ix(NX - 2, j)]
    grid.injectedGas[ix(0, j)] = hasLeftInlet(side) ? grid.injectedGas[ix(0, j)] : grid.injectedGas[ix(1, j)]
    grid.injectedGas[ix(NX - 1, j)] = hasRightInlet(side) ? grid.injectedGas[ix(NX - 1, j)] : grid.injectedGas[ix(NX - 2, j)]
  }
  for (let i = 0; i < NX; i += 1) grid.injectedGas[ix(i, NY - 1)] = grid.injectedGas[ix(i, NY - 2)]
  const [firstRow, lastRow] = inletRowBounds(grid, params)
  for (const column of inletColumns(side)) {
    for (let j = firstRow; j <= lastRow; j += 1) {
      grid.injectedGas[ix(column, j)] = 1
    }
  }
}

function liquidVolume(grid: FlowGrid): number {
  let volume = 0
  const cellVolume = grid.dx * grid.dy
  for (let j = 1; j < NY - 1; j += 1) {
    for (let i = 1; i < NX - 1; i += 1) volume += grid.phi[ix(i, j)] * cellVolume
  }
  return volume
}

function transportTurbulence(grid: FlowGrid, params: SolverParams, side: InletSide, dt: number) {
  const density = paramsDensity(params)
  const nextK = new Float32Array(grid.k)
  const nextEpsilon = new Float32Array(grid.epsilon)
  const maxK = Math.max(1, (params.inletSpeedMs + 1) ** 2 * 10)
  for (let j = 1; j < NY - 1; j += 1) {
    for (let i = 1; i < NX - 1; i += 1) {
      const id = ix(i, j)
      const u = grid.u[id]
      const v = grid.v[id]
      const duDx = (grid.u[ix(i + 1, j)] - grid.u[ix(i - 1, j)]) / (2 * grid.dx)
      const duDy = (grid.u[ix(i, j + 1)] - grid.u[ix(i, j - 1)]) / (2 * grid.dy)
      const dvDx = (grid.v[ix(i + 1, j)] - grid.v[ix(i - 1, j)]) / (2 * grid.dx)
      const dvDy = (grid.v[ix(i, j + 1)] - grid.v[ix(i, j - 1)]) / (2 * grid.dy)
      const shear = 2 * (duDx * duDx + dvDy * dvDy) + (duDy + dvDx) ** 2
      const production = Math.min(grid.nuT[id] * shear, 10 * Math.max(grid.epsilon[id], MIN_EPSILON))
      const advK = u * (grid.k[ix(i + 1, j)] - grid.k[ix(i - 1, j)]) / (2 * grid.dx) + v * (grid.k[ix(i, j + 1)] - grid.k[ix(i, j - 1)]) / (2 * grid.dy)
      const advE = u * (grid.epsilon[ix(i + 1, j)] - grid.epsilon[ix(i - 1, j)]) / (2 * grid.dx) + v * (grid.epsilon[ix(i, j + 1)] - grid.epsilon[ix(i, j - 1)]) / (2 * grid.dy)
      const lapK = (grid.k[ix(i + 1, j)] - 2 * grid.k[id] + grid.k[ix(i - 1, j)]) / (grid.dx * grid.dx) + (grid.k[ix(i, j + 1)] - 2 * grid.k[id] + grid.k[ix(i, j - 1)]) / (grid.dy * grid.dy)
      const lapE = (grid.epsilon[ix(i + 1, j)] - 2 * grid.epsilon[id] + grid.epsilon[ix(i - 1, j)]) / (grid.dx * grid.dx) + (grid.epsilon[ix(i, j + 1)] - 2 * grid.epsilon[id] + grid.epsilon[ix(i, j - 1)]) / (grid.dy * grid.dy)
      const nu = viscosityAt(grid.phi[id], density.gasMu, density.liquidMu) / grid.rho[id]
      const diffusionK = (nu + grid.nuT[id] / SIGMA_K) * lapK
      const diffusionE = (nu + grid.nuT[id] / SIGMA_EPS) * lapE
      const epsilon = Math.max(grid.epsilon[id], MIN_EPSILON)
      const k = Math.max(grid.k[id], MIN_K)
      nextK[id] = clamp(k + dt * (-advK + diffusionK + production - epsilon), MIN_K, maxK)
      nextEpsilon[id] = clamp(epsilon + dt * (-advE + diffusionE + C1_EPS * production * epsilon / k - C2_EPS * epsilon * epsilon / k), MIN_EPSILON, maxK ** 1.5 / Math.max(grid.dx, grid.dy))
    }
  }
  grid.k.set(nextK)
  grid.epsilon.set(nextEpsilon)
  for (let j = 1; j < NY - 1; j += 1) {
    for (let i = 1; i < NX - 1; i += 1) {
      const id = ix(i, j)
      const raw = C_MU * grid.k[id] * grid.k[id] / Math.max(grid.epsilon[id], MIN_EPSILON)
      grid.nuT[id] = clamp(finiteOr(raw, 0), 0, 2 * Math.max(params.widthM, params.heightM) * Math.max(params.inletSpeedMs, 1))
    }
  }
  setWallAndOutletBoundaries(grid, params, side)
}

function updateDiagnostics(grid: FlowGrid, side: InletSide, alphaInfo: { before: number; after: number; fluxIn: number; fluxOut: number; clipped: number }, dt: number, iterations: number, pressureResidual: number) {
  let maxDivergence = 0
  let sumDivergence = 0
  let count = 0
  for (let j = 1; j < NY - 1; j += 1) {
    for (let i = 1; i < NX - 1; i += 1) {
      const id = ix(i, j)
      const divergence = (faceVelocity(grid, side, i, j, 'e') - faceVelocity(grid, side, i, j, 'w')) / grid.dx + (faceVelocity(grid, side, i, j, 'n') - faceVelocity(grid, side, i, j, 's')) / grid.dy
      grid.divergence[id] = divergence
      maxDivergence = Math.max(maxDivergence, Math.abs(divergence))
      sumDivergence += divergence * divergence
      count += 1
      const dyVelocity = grid.v[id] * grid.dy
      const dxVelocity = grid.u[id] * grid.dx
      grid.speed[id] = Math.hypot(grid.u[id], grid.v[id])
      grid.temperature[id] = clamp(0.2 + 0.8 * grid.phi[id], 0, 1)
      if (!Number.isFinite(dyVelocity + dxVelocity)) {
        grid.u[id] = 0
        grid.v[id] = 0
      }
    }
  }
  grid.pressureResidual = finiteOr(pressureResidual, 0)
  grid.divergenceMax = finiteOr(maxDivergence, 0)
  grid.divergenceRms = finiteOr(Math.sqrt(sumDivergence / Math.max(count, 1)), 0)
  grid.liquidVolumeM3 = alphaInfo.after
  grid.liquidFluxInM3s = alphaInfo.fluxIn
  grid.liquidFluxOutM3s = alphaInfo.fluxOut
  grid.clippedAlphaVolumeM3 = alphaInfo.clipped
  const expected = alphaInfo.before + dt * (alphaInfo.fluxIn - alphaInfo.fluxOut)
  grid.massError = finiteOr((alphaInfo.after - expected) / Math.max(grid.dx * grid.dy, alphaInfo.after, 1e-6), 0)
  grid.iterations = iterations
  grid.numericalProtectionCount = alphaInfo.clipped > 0 ? 1 : 0
}

export function createFlowGrid(params: SolverParams): FlowGrid {
  const dx = Math.max(params.widthM, 0.2) / (NX - 2)
  const dy = Math.max(params.heightM, 0.2) / (NY - 2)
  const count = NX * NY
  const phi = new Float32Array(count)
  const temperature = new Float32Array(count)
  const injectedGas = new Float32Array(count)
  const pressure = new Float32Array(count)
  const k = new Float32Array(count)
  const epsilon = new Float32Array(count)
  const nuT = new Float32Array(count)
  const rho = new Float32Array(count)
  const divergence = new Float32Array(count)
  const liquidRow = cellY(params, params.liquidLevelM)
  for (let j = 0; j < NY; j += 1) {
    for (let i = 0; i < NX; i += 1) {
      const id = ix(i, j)
      const liquid = j <= liquidRow ? 1 : 0
      phi[id] = liquid
      temperature[id] = liquid ? 1 : 0.2
      k[id] = liquid ? 1e-5 : MIN_K
      epsilon[id] = liquid ? 1e-5 : MIN_EPSILON
      rho[id] = densityAt(liquid, paramsDensity(params).gas, paramsDensity(params).liquid)
    }
  }
  const grid: FlowGrid = {
    nx: NX, ny: NY, dx, dy, timeS: 0, dtS: 0, phi, u: new Float32Array(count), v: new Float32Array(count),
    temperature, injectedGas, speed: new Float32Array(count), pressure, k, epsilon, nuT, rho, divergence,
    pressureResidual: 0, divergenceMax: 0, divergenceRms: 0, massError: 0, liquidVolumeM3: liquidVolume({ nx: NX, ny: NY, dx, dy, phi } as FlowGrid),
    liquidFluxInM3s: 0, liquidFluxOutM3s: 0, iterations: 0, clippedAlphaVolumeM3: 0, numericalProtectionCount: 0,
  }
  return grid
}

export function stepFlowGrid(grid: FlowGrid, params: SolverParams, side: InletSide): FlowGrid {
  const dt = calculateDt(grid, params)
  const nextU = new Float32Array(grid.u)
  const nextV = new Float32Array(grid.v)
  updateMaterialFields(grid, params)
  setWallAndOutletBoundaries(grid, params, side)
  predictVelocity(grid, nextU, nextV, params, side, dt)
  grid.u.set(nextU)
  grid.v.set(nextV)
  setWallAndOutletBoundaries(grid, params, side)
  const pressureSolve = pressureProject(grid, side, dt, params)
  setWallAndOutletBoundaries(grid, params, side)
  const alphaInfo = transportAlpha(grid, side, dt)
  transportInjectedGas(grid, params, side, dt)
  updateMaterialFields(grid, params)
  transportTurbulence(grid, params, side, dt)
  setWallAndOutletBoundaries(grid, params, side)
  updateDiagnostics(grid, side, alphaInfo, dt, pressureSolve.iterations, pressureSolve.residualPa)
  grid.dtS = dt
  grid.timeS += dt
  return grid
}


