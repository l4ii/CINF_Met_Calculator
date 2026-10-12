import type { TetMesh } from './furnaceTetMesh.ts'

const KIND_INLET = 1
const KIND_OUTLET = 2
const G = 9.81
const MAX_VELOCITY = 80
const MAX_PRESSURE = 2e6
const MAX_PRESSURE_ITERATIONS = 24

export type TetSolverParams = {
  liquidLevelM: number
  inletSpeedMs: number
  liquidDensityKgM3: number
  gasDensityKgM3?: number
}

export type TetFlowState = {
  mesh: TetMesh
  timeS: number
  dtS: number
  phi: Float32Array
  u: Float32Array
  v: Float32Array
  w: Float32Array
  pressure: Float32Array
  injectedGas: Float32Array
  speed: Float32Array
  rho: Float32Array
  faceFlux: Float32Array
  scratchU: Float32Array
  scratchV: Float32Array
  scratchW: Float32Array
  scratchPhi: Float32Array
  scratchGas: Float32Array
  pressureResidual: number
  divergenceMax: number
  divergenceRms: number
  massError: number
  iterations: number
  liquidVolumeM3: number
}

export type TetFlowFrame = {
  type: 'frame'
  serial: number
  inletSpeedMs: number
  meshId: number
  count: number
  tetCount: number
  inletCount: number
  outletCount: number
  centroids: Float32Array
  phi: Float32Array
  speed: Float32Array
  pressure: Float32Array
  injectedGas: Float32Array
  u: Float32Array
  v: Float32Array
  w: Float32Array
  minX: number
  maxX: number
  minY: number
  maxY: number
  minZ: number
  maxZ: number
  cellSizeM: number
  physicalTimeS: number
  dtS: number
  pressureResidual: number
  divergenceMax: number
  divergenceRms: number
  massError: number
  iterations: number
}

function finite(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function positive(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback
}

export function createTetFlow(mesh: TetMesh, params: TetSolverParams): TetFlowState {
  const count = mesh.tetCount
  const phi = new Float32Array(count)
  const injectedGas = new Float32Array(count)
  const surface = mesh.nadirYM + Math.max(0, params.liquidLevelM)
  for (let tet = 0; tet < count; tet += 1) {
    phi[tet] = mesh.centroids[tet * 3 + 1] <= surface ? 1 : 0
  }
  const state: TetFlowState = {
    mesh,
    timeS: 0,
    dtS: 0,
    phi,
    u: new Float32Array(count),
    v: new Float32Array(count),
    w: new Float32Array(count),
    pressure: new Float32Array(count),
    injectedGas,
    speed: new Float32Array(count),
    rho: new Float32Array(count),
    faceFlux: new Float32Array(count * 4),
    scratchU: new Float32Array(count),
    scratchV: new Float32Array(count),
    scratchW: new Float32Array(count),
    scratchPhi: new Float32Array(count),
    scratchGas: new Float32Array(count),
    pressureResidual: 0,
    divergenceMax: 0,
    divergenceRms: 0,
    massError: 0,
    iterations: 0,
    liquidVolumeM3: 0,
  }
  updateDensity(state, params)
  seedInlet(state)
  state.liquidVolumeM3 = liquidVolume(state)
  return state
}

export function stepTetFlow(state: TetFlowState, params: TetSolverParams): TetFlowState {
  const dt = calculateDt(state, params)
  updateDensity(state, params)
  addBuoyancy(state, params, dt)
  blendVelocity(state)
  clampVelocity(state)
  computeFluxes(state, params)
  const pressure = projectPressure(state, dt)
  correctVelocity(state, dt)
  clampVelocity(state)
  blendInletVelocity(state, params)
  computeFluxes(state, params)
  const transport = advect(state, dt)
  updateDensity(state, params)
  updateSpeed(state)
  const divergence = divergenceStats(state)
  state.dtS = dt
  state.timeS += dt
  state.pressureResidual = pressure.residual
  state.iterations = pressure.iterations
  state.divergenceMax = divergence.max
  state.divergenceRms = divergence.rms
  state.liquidVolumeM3 = transport.after
  const expected = transport.before + dt * (transport.fluxIn - transport.fluxOut)
  state.massError = finite((transport.after - expected) / Math.max(transport.after, 1e-6))
  return state
}

export function tetFlowFrame(state: TetFlowState, inletSpeedMs: number, serial: number, meshId: number): TetFlowFrame {
  const { mesh } = state
  return {
    type: 'frame',
    serial,
    inletSpeedMs,
    meshId,
    count: mesh.tetCount,
    tetCount: mesh.tetCount,
    inletCount: mesh.inletCount,
    outletCount: mesh.outletCount,
    centroids: mesh.centroids,
    phi: state.phi,
    speed: state.speed,
    pressure: state.pressure,
    injectedGas: state.injectedGas,
    u: state.u,
    v: state.v,
    w: state.w,
    minX: mesh.minX,
    maxX: mesh.maxX,
    minY: mesh.minY,
    maxY: mesh.maxY,
    minZ: mesh.minZ,
    maxZ: mesh.maxZ,
    cellSizeM: mesh.cellSizeM,
    physicalTimeS: state.timeS,
    dtS: state.dtS,
    pressureResidual: state.pressureResidual,
    divergenceMax: state.divergenceMax,
    divergenceRms: state.divergenceRms,
    massError: state.massError,
    iterations: state.iterations,
  }
}

function densities(params: TetSolverParams) {
  return {
    gas: positive(params.gasDensityKgM3 ?? 1.4, 1.4),
    liquid: positive(params.liquidDensityKgM3, 3500),
  }
}

function updateDensity(state: TetFlowState, params: TetSolverParams) {
  const { gas, liquid } = densities(params)
  for (let tet = 0; tet < state.mesh.tetCount; tet += 1) {
    const phi = clamp(finite(state.phi[tet]), 0, 1)
    state.phi[tet] = phi
    state.rho[tet] = gas + phi * (liquid - gas)
  }
}

function seedInlet(state: TetFlowState) {
  const { mesh } = state
  for (let tet = 0; tet < mesh.tetCount; tet += 1) {
    for (let face = 0; face < 4; face += 1) {
      const slot = tet * 4 + face
      if (mesh.neighbors[slot] < 0 && mesh.faceKind[slot] === KIND_INLET) state.injectedGas[tet] = 1
    }
  }
}

function calculateDt(state: TetFlowState, params: TetSolverParams): number {
  let maxSpeed = Math.max(0.2, Math.min(MAX_VELOCITY, Math.abs(params.inletSpeedMs)))
  for (let tet = 0; tet < state.mesh.tetCount; tet += 1) {
    maxSpeed = Math.max(maxSpeed, Math.hypot(state.u[tet], state.v[tet], state.w[tet]))
  }
  const length = Math.max(state.mesh.minSpacingM, 1e-3)
  return clamp(0.35 * length / maxSpeed, 1e-6, 0.004)
}

function addBuoyancy(state: TetFlowState, params: TetSolverParams, dt: number) {
  const liquid = densities(params).liquid
  for (let tet = 0; tet < state.mesh.tetCount; tet += 1) {
    const accel = G * (liquid - state.rho[tet]) / liquid
    state.v[tet] = finite(state.v[tet] + dt * accel)
  }
}

function blendVelocity(state: TetFlowState) {
  const { mesh, u, v, w, scratchU, scratchV, scratchW } = state
  for (let tet = 0; tet < mesh.tetCount; tet += 1) {
    let su = u[tet]
    let sv = v[tet]
    let sw = w[tet]
    let count = 1
    for (let face = 0; face < 4; face += 1) {
      const other = mesh.neighbors[tet * 4 + face]
      if (other < 0) continue
      su += u[other]
      sv += v[other]
      sw += w[other]
      count += 1
    }
    scratchU[tet] = u[tet] * 0.82 + (su / count) * 0.18
    scratchV[tet] = v[tet] * 0.82 + (sv / count) * 0.18
    scratchW[tet] = w[tet] * 0.82 + (sw / count) * 0.18
  }
  u.set(scratchU)
  v.set(scratchV)
  w.set(scratchW)
}

function clampVelocity(state: TetFlowState) {
  for (let tet = 0; tet < state.mesh.tetCount; tet += 1) {
    state.u[tet] = clamp(finite(state.u[tet]), -MAX_VELOCITY, MAX_VELOCITY)
    state.v[tet] = clamp(finite(state.v[tet]), -MAX_VELOCITY, MAX_VELOCITY)
    state.w[tet] = clamp(finite(state.w[tet]), -MAX_VELOCITY, MAX_VELOCITY)
  }
}

function computeFluxes(state: TetFlowState, params: TetSolverParams) {
  const { mesh, u, v, w, faceFlux } = state
  for (let tet = 0; tet < mesh.tetCount; tet += 1) {
    for (let face = 0; face < 4; face += 1) {
      const slot = tet * 4 + face
      const nx = mesh.faceNx[slot]
      const ny = mesh.faceNy[slot]
      const nz = mesh.faceNz[slot]
      const other = mesh.neighbors[slot]
      let flux = 0
      if (other >= 0) {
        flux = 0.5 * ((u[tet] + u[other]) * nx + (v[tet] + v[other]) * ny + (w[tet] + w[other]) * nz)
      } else if (mesh.faceKind[slot] === KIND_INLET) {
        const lance = mesh.faceInlet[slot]
        const nozzleArea = lance >= 0 ? mesh.lanceAreaM2[lance] : 0
        const flow = Math.max(0, finite(params.inletSpeedMs)) * nozzleArea
        const faceSpeed = Math.min(MAX_VELOCITY, flow / Math.max(mesh.faceArea[slot], 1e-8))
        flux = -faceSpeed
      } else if (mesh.faceKind[slot] === KIND_OUTLET) {
        flux = Math.max(0, u[tet] * nx + v[tet] * ny + w[tet] * nz)
      }
      faceFlux[slot] = finite(flux)
    }
  }
}

function projectPressure(state: TetFlowState, dt: number): { residual: number; iterations: number } {
  const { mesh, pressure, rho, faceFlux } = state
  const omega = 1.35
  let residual = 0
  let iterations = 0
  const iterationLimit = mesh.tetCount > 80000 ? 4 : mesh.tetCount > 20000 ? 8 : MAX_PRESSURE_ITERATIONS
  for (let iter = 0; iter < iterationLimit; iter += 1) {
    residual = 0
    iterations = iter + 1
    for (let tet = 0; tet < mesh.tetCount; tet += 1) {
      let diagonal = 0
      let neighborSum = 0
      let rhs = 0
      for (let face = 0; face < 4; face += 1) {
        const slot = tet * 4 + face
        const coeff = mesh.faceArea[slot] / mesh.faceDist[slot]
        const other = mesh.neighbors[slot]
        if (other >= 0) {
          diagonal += coeff
          neighborSum += coeff * pressure[other]
        } else if (mesh.faceKind[slot] === KIND_OUTLET) {
          diagonal += coeff
        }
        rhs += faceFlux[slot] * mesh.faceArea[slot]
      }
      if (!(diagonal > 1e-10)) continue
      const density = Math.max(rho[tet], 0.2)
      const target = (neighborSum - (density / dt) * rhs) / diagonal
      const next = clamp(finite(pressure[tet] + omega * (target - pressure[tet])), -MAX_PRESSURE, MAX_PRESSURE)
      residual = Math.max(residual, Math.abs(next - pressure[tet]))
      pressure[tet] = next
    }
    if (residual < 1e-2 && iter > 2) break
  }
  return { residual: finite(residual), iterations }
}

function correctVelocity(state: TetFlowState, dt: number) {
  const { mesh, pressure, rho, u, v, w } = state
  for (let tet = 0; tet < mesh.tetCount; tet += 1) {
    let gx = 0
    let gy = 0
    let gz = 0
    for (let face = 0; face < 4; face += 1) {
      const slot = tet * 4 + face
      const other = mesh.neighbors[slot]
      let facePressure = pressure[tet]
      if (other >= 0) facePressure = 0.5 * (pressure[tet] + pressure[other])
      else if (mesh.faceKind[slot] === KIND_OUTLET) facePressure = 0
      const weight = facePressure * mesh.faceArea[slot]
      gx += weight * mesh.faceNx[slot]
      gy += weight * mesh.faceNy[slot]
      gz += weight * mesh.faceNz[slot]
    }
    const volume = Math.max(mesh.volumes[tet], 1e-8)
    const density = Math.max(rho[tet], 0.2)
    const scale = dt / density / volume
    u[tet] = finite(u[tet] - scale * gx)
    v[tet] = finite(v[tet] - scale * gy)
    w[tet] = finite(w[tet] - scale * gz)
  }
}

function blendInletVelocity(state: TetFlowState, params: TetSolverParams) {
  const { mesh, u, v, w } = state
  const openingArea = new Float64Array(mesh.lanceInwardZ.length)
  for (let tet = 0; tet < mesh.tetCount; tet += 1) {
    for (let face = 0; face < 4; face += 1) {
      const slot = tet * 4 + face
      if (mesh.neighbors[slot] >= 0 || mesh.faceKind[slot] !== KIND_INLET) continue
      const lance = mesh.faceInlet[slot]
      if (lance >= 0) openingArea[lance] += mesh.faceArea[slot]
    }
  }
  for (let tet = 0; tet < mesh.tetCount; tet += 1) {
    for (let face = 0; face < 4; face += 1) {
      const slot = tet * 4 + face
      if (mesh.neighbors[slot] >= 0 || mesh.faceKind[slot] !== KIND_INLET) continue
      const lance = mesh.faceInlet[slot]
      if (lance < 0) continue
      const nozzleArea = mesh.lanceAreaM2[lance]
      const speed = Math.min(MAX_VELOCITY, Math.max(0, finite(params.inletSpeedMs)) * nozzleArea / Math.max(openingArea[lance], 1e-8))
      u[tet] = 0
      v[tet] = 0
      w[tet] = mesh.lanceInwardZ[lance] * speed
    }
  }
}

function advect(state: TetFlowState, dt: number) {
  const { mesh, phi, injectedGas, faceFlux, scratchPhi, scratchGas } = state
  const before = liquidVolume(state)
  let fluxIn = 0
  let fluxOut = 0
  for (let tet = 0; tet < mesh.tetCount; tet += 1) {
    let deltaPhi = 0
    let deltaGas = 0
    const volume = Math.max(mesh.volumes[tet], 1e-8)
    for (let face = 0; face < 4; face += 1) {
      const slot = tet * 4 + face
      const amount = faceFlux[slot] * mesh.faceArea[slot]
      const other = mesh.neighbors[slot]
      if (amount >= 0) {
        deltaPhi -= amount * phi[tet]
        deltaGas -= amount * injectedGas[tet]
        fluxOut += amount * phi[tet]
        continue
      }
      let donorPhi = phi[tet]
      let donorGas = injectedGas[tet]
      if (other >= 0) {
        donorPhi = phi[other]
        donorGas = injectedGas[other]
      } else if (mesh.faceKind[slot] === KIND_INLET) {
        donorPhi = 0
        donorGas = 1
      } else if (mesh.faceKind[slot] === KIND_OUTLET) {
        donorPhi = 0
        donorGas = 0
      }
      deltaPhi -= amount * donorPhi
      deltaGas -= amount * donorGas
      fluxIn += -amount * donorPhi
    }
    scratchPhi[tet] = phi[tet] + dt * deltaPhi / volume
    scratchGas[tet] = injectedGas[tet] + dt * deltaGas / volume
  }
  for (let tet = 0; tet < mesh.tetCount; tet += 1) {
    phi[tet] = clamp(finite(scratchPhi[tet]), 0, 1)
    injectedGas[tet] = clamp(finite(scratchGas[tet]), 0, 1)
  }
  seedInlet(state)
  return { before, after: liquidVolume(state), fluxIn, fluxOut }
}

function liquidVolume(state: TetFlowState): number {
  let volume = 0
  for (let tet = 0; tet < state.mesh.tetCount; tet += 1) volume += state.phi[tet] * state.mesh.volumes[tet]
  return finite(volume)
}

function updateSpeed(state: TetFlowState) {
  for (let tet = 0; tet < state.mesh.tetCount; tet += 1) {
    state.speed[tet] = finite(Math.hypot(state.u[tet], state.v[tet], state.w[tet]))
  }
}

function divergenceStats(state: TetFlowState) {
  const { mesh, faceFlux } = state
  let max = 0
  let sum = 0
  const count = Math.max(mesh.tetCount, 1)
  for (let tet = 0; tet < mesh.tetCount; tet += 1) {
    let flux = 0
    for (let face = 0; face < 4; face += 1) {
      const slot = tet * 4 + face
      flux += faceFlux[slot] * mesh.faceArea[slot]
    }
    const divergence = flux / Math.max(mesh.volumes[tet], 1e-8)
    max = Math.max(max, Math.abs(divergence))
    sum += divergence * divergence
  }
  return { max: finite(max), rms: finite(Math.sqrt(sum / count)) }
}
