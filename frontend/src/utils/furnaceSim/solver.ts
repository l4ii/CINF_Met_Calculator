import { FURNACE_SIM_CONFIG, type FurnaceSimConfig } from '../../config/furnaceSimConfig.ts'
import { FACE_INLET, FACE_NORMAL, type SimMesh } from './mesh.ts'
import { predictMomentum } from './momentum.ts'
import { createPressureSolver } from './pressure.ts'
import { createDirections, type FlowInputs, type FlowState } from './state.ts'
import { updateCellVelocities, updateEffectiveViscosity, updateTurbulence, updateWallFunctions } from './turbulence.ts'
import { advectVof } from './vof.ts'

export type { FlowInputs, FlowState } from './state.ts'

export type FlowPhase = 'running' | 'steady' | 'unconverged' | 'diverged' | 'limit'

export type FlowStatus = {
  phase: FlowPhase
  timeS: number
  steps: number
  dtS: number
  pressureIterations: number
  pressureResidual: number
  liquidDrift: number
  bathMeanSpeed: number
  gasHoldup: number
  maxSpeed: number
  hasAverage: boolean
}

/** 后处理使用的单元场。pressure 为相对出口的静压 Pa。 */
export type FlowFields = {
  alpha: Float64Array
  uc: Float64Array
  vc: Float64Array
  wc: Float64Array
  k: Float64Array
  pressure: Float64Array
}

function inletTurbulence(state: FlowState) {
  const { cMu, inletIntensity, inletLengthRatio, initialK, initialEpsilon } = state.config.turbulence
  const speed = Math.max(0, state.inputs.inletSpeedMs)
  const k = Math.max(initialK, 1.5 * (inletIntensity * speed) ** 2)
  const length = Math.max(inletLengthRatio * state.inputs.nozzleDiameterM, 1e-4)
  state.inletK = k
  state.inletEps = Math.max(initialEpsilon, Math.pow(cMu, 0.75) * Math.pow(k, 1.5) / length)
}

function applyInletVelocity(state: FlowState) {
  const w = state.dirs[2].vel
  for (const inlet of state.mesh.inlets) w[inlet.face] = inlet.dir * Math.max(0, state.inputs.inletSpeedMs)
}

/** 密度、层流粘度与交错控制体密度。 */
export function updateDensity(state: FlowState) {
  const { mesh, alpha, rho, mu, inputs } = state
  const { nx, ny, vf, vol } = mesh
  const rl = inputs.liquidDensityKgM3
  const rg = inputs.gasDensityKgM3
  const ml = inputs.liquidViscosityPaS
  const mg = inputs.gasViscosityPaS
  for (let c = 0; c < mesh.cellCount; c += 1) {
    if (vf[c] <= 0) {
      rho[c] = rg
      mu[c] = mg
      continue
    }
    const a = alpha[c]
    rho[c] = rg + (rl - rg) * a
    mu[c] = mg + (ml - mg) * a
  }
  for (const dir of state.dirs) {
    const { fn0, fn1, fn2, ap, rf, n, cs, d } = dir
    for (let k = 0; k < fn2; k += 1) {
      for (let j = 0; j < fn1; j += 1) {
        for (let i = 0; i < fn0; i += 1) {
          const f = i + fn0 * (j + fn1 * k)
          if (ap[f] === 0) continue
          const q = d === 0 ? i : d === 1 ? j : k
          const base = i + nx * (j + ny * k)
          const plus = q < n && vf[base] > 0 ? base : -1
          const minus = q > 0 && vf[base - cs] > 0 ? base - cs : -1
          if (plus >= 0 && minus >= 0) rf[f] = (rho[plus] * vol[plus] + rho[minus] * vol[minus]) / (vol[plus] + vol[minus])
          else rf[f] = plus >= 0 ? rho[plus] : minus >= 0 ? rho[minus] : rg
        }
      }
    }
  }
}

/** 静态壁面量：切向壁面面积与近壁距离。 */
function computeWallGeometry(state: FlowState) {
  const { mesh } = state
  const { nx, ny, nz, vf, ax, ay, az, dx, dy, dz } = mesh
  const nxy = nx * ny
  for (let k = 0; k < nz; k += 1) {
    for (let j = 0; j < ny; j += 1) {
      for (let i = 0; i < nx; i += 1) {
        const c = i + nx * (j + ny * k)
        if (vf[c] <= 0) continue
        const xw = i + (nx + 1) * (j + ny * k)
        const ysf = i + nx * (j + (ny + 1) * k)
        const wallX = (2 - ax[xw] - ax[xw + 1]) * dy[j] * dz[k]
        const wallY = (2 - ay[ysf] - ay[ysf + nx]) * dx[i] * dz[k]
        const wallZ = (2 - az[c] - az[c + nxy]) * dx[i] * dy[j]
        state.wallTan[0][c] = wallY + wallZ
        state.wallTan[1][c] = wallX + wallZ
        state.wallTan[2][c] = wallX + wallY
        let distance = Infinity
        if (wallX > 1e-12) distance = Math.min(distance, 0.5 * dx[i])
        if (wallY > 1e-12) distance = Math.min(distance, 0.5 * dy[j])
        if (wallZ > 1e-12) distance = Math.min(distance, 0.5 * dz[k])
        state.wallDistance[c] = Number.isFinite(distance) ? distance : 0
      }
    }
  }
}

export function createFlowState(mesh: SimMesh, inputs: FlowInputs, config: FurnaceSimConfig = FURNACE_SIM_CONFIG): FlowState {
  if (mesh.outlets.length === 0) throw new Error('网格没有出口面')
  const n = mesh.cellCount
  const state: FlowState = {
    mesh,
    config,
    inputs: { ...inputs },
    timeS: 0,
    steps: 0,
    dtS: 0,
    nextDtS: config.numerics.dtMaxS * 0.05,
    dirs: createDirections(mesh),
    alpha: new Float64Array(n),
    rho: new Float64Array(n),
    rhoOld: new Float64Array(n),
    mu: new Float64Array(n),
    muT: new Float64Array(n),
    muEff: new Float64Array(n),
    k: new Float64Array(n),
    eps: new Float64Array(n),
    kNext: new Float64Array(n),
    epsNext: new Float64Array(n),
    p: new Float64Array(n),
    rhs: new Float64Array(n),
    uc: new Float64Array(n),
    vc: new Float64Array(n),
    wc: new Float64Array(n),
    wallTan: [new Float64Array(n), new Float64Array(n), new Float64Array(n)],
    wallDistance: new Float64Array(n),
    wallLambda: new Float64Array(n),
    dilation: new Uint8Array(n),
    inletK: 0,
    inletEps: 0,
    pressure: createPressureSolver(mesh),
    monitors: {
      liquidVolume0: 0,
      liquidVolume: 0,
      liquidOut: 0,
      clippedVolume: 0,
      maxSpeed: 0,
      pressureIterations: 0,
      pressureResidual: 0,
      pressureConverged: true,
      unconvergedSteps: 0,
      bathMeanSpeed: 0,
      kineticEnergy: 0,
      gasHoldup: 0,
    },
    average: {
      timeS: 0,
      alpha: new Float64Array(n),
      uc: new Float64Array(n),
      vc: new Float64Array(n),
      wc: new Float64Array(n),
      k: new Float64Array(n),
      p: new Float64Array(n),
    },
    steady: { windowStart: 0, windowSum: 0, windowTime: 0, previousMean: -1, hits: 0, reached: false },
  }
  computeWallGeometry(state)
  resetFlowState(state)
  return state
}

/** 回到初始静止液池：液面以下 α=1，速度为零。网格不变。 */
export function resetFlowState(state: FlowState) {
  const { mesh, config } = state
  const { nx, ny, nz, vf, ys, dy } = mesh
  const surface = state.inputs.liquidSurfaceYM
  for (let k = 0; k < nz; k += 1) {
    for (let j = 0; j < ny; j += 1) {
      const fraction = Math.min(1, Math.max(0, (surface - ys[j]) / dy[j]))
      for (let i = 0; i < nx; i += 1) {
        const c = i + nx * (j + ny * k)
        state.alpha[c] = vf[c] > 0 ? fraction : 0
      }
    }
  }
  for (const dir of state.dirs) {
    dir.vel.fill(0)
    dir.star.fill(0)
    dir.mass.fill(0)
  }
  state.p.fill(0)
  state.k.fill(config.turbulence.initialK)
  state.eps.fill(config.turbulence.initialEpsilon)
  state.timeS = 0
  state.steps = 0
  state.dtS = 0
  state.nextDtS = config.numerics.dtMaxS * 0.05
  const average = state.average
  average.timeS = 0
  for (const array of [average.alpha, average.uc, average.vc, average.wc, average.k, average.p]) array.fill(0)
  Object.assign(state.steady, { windowStart: 0, windowSum: 0, windowTime: 0, previousMean: -1, hits: 0, reached: false })
  inletTurbulence(state)
  applyInletVelocity(state)
  updateDensity(state)
  for (const dir of state.dirs) dir.rfOld.set(dir.rf)
  updateEffectiveViscosity(state)
  let liquid = 0
  for (let c = 0; c < mesh.cellCount; c += 1) liquid += state.alpha[c] * mesh.vol[c]
  Object.assign(state.monitors, {
    liquidVolume0: liquid, liquidVolume: liquid, liquidOut: 0, clippedVolume: 0, maxSpeed: 0,
    pressureIterations: 0, pressureResidual: 0, pressureConverged: true, unconvergedSteps: 0,
    bathMeanSpeed: 0, kineticEnergy: 0, gasHoldup: 0,
  })
  updateCellVelocities(state)
}

/** 运行中修改气量或熔体密度。 */
export function setFlowInputs(state: FlowState, inputs: Partial<FlowInputs>) {
  Object.assign(state.inputs, inputs)
  inletTurbulence(state)
  applyInletVelocity(state)
}

export function projectVelocity(state: FlowState, dt: number) {
  const { mesh, p, rhs, rho, config } = state
  const { nx, ny, vf, dx, dy, dz, ys } = mesh
  const solver = state.pressure
  const transmissibility = [solver.tx, solver.ty, solver.tz]
  rhs.fill(0)
  for (const dir of state.dirs) {
    const { fn0, fn1, fn2, ap, rf, star, n, cs, d, kind, center } = dir
    const T = transmissibility[d]
    T.fill(0)
    for (let k = 0; k < fn2; k += 1) {
      for (let j = 0; j < fn1; j += 1) {
        for (let i = 0; i < fn0; i += 1) {
          const f = i + fn0 * (j + fn1 * k)
          const a = ap[f]
          if (a === 0) continue
          const q = d === 0 ? i : d === 1 ? j : k
          const area = d === 0 ? dy[j] * dz[k] : d === 1 ? dx[i] * dz[k] : dx[i] * dy[j]
          const flux = a * area * star[f]
          const base = i + nx * (j + ny * k)
          const plus = q < n && vf[base] > 0 ? base : -1
          const minus = q > 0 && vf[base - cs] > 0 ? base - cs : -1
          if (plus >= 0) rhs[plus] += flux / dt
          if (minus >= 0) rhs[minus] -= flux / dt
          if (plus >= 0 && minus >= 0 && (kind === null || kind[f] === FACE_NORMAL)) {
            T[f] = a * area / (rf[f] * (center[q] - center[q - 1]))
          }
        }
      }
    }
  }
  solver.d.fill(0)
  const gravity = config.fluid.gravity
  const topY = ys[ny] - state.inputs.liquidSurfaceYM
  for (const outlet of mesh.outlets) {
    const c = outlet.cell
    const i = c % nx
    const j = Math.floor(c / nx) % ny
    const k = Math.floor(c / (nx * ny))
    const coefficient = outlet.aperture * dx[i] * dz[k] / (rho[c] * 0.5 * dy[j])
    solver.d[c] += coefficient
    rhs[c] += coefficient * rho[c] * gravity * topY
  }
  solver.prepare()
  const result = solver.solve(rhs, p, config.numerics.pressureTolerance, config.numerics.pressureMaxIterations)
  for (const dir of state.dirs) {
    const { fn0, fn1, fn2, ap, rf, star, vel, n, cs, d, kind, center } = dir
    for (let k = 0; k < fn2; k += 1) {
      for (let j = 0; j < fn1; j += 1) {
        for (let i = 0; i < fn0; i += 1) {
          const f = i + fn0 * (j + fn1 * k)
          if (ap[f] === 0) {
            vel[f] = 0
            continue
          }
          if (kind !== null && kind[f] !== FACE_NORMAL) continue
          const q = d === 0 ? i : d === 1 ? j : k
          const base = i + nx * (j + ny * k)
          const plus = q < n && vf[base] > 0 ? base : -1
          const minus = q > 0 && vf[base - cs] > 0 ? base - cs : -1
          if (plus < 0 || minus < 0) {
            vel[f] = 0
            continue
          }
          vel[f] = star[f] - dt * (p[plus] - p[minus]) / (rf[f] * (center[q] - center[q - 1]))
        }
      }
    }
  }
  const V = state.dirs[1].vel
  const Vs = state.dirs[1].star
  for (const outlet of mesh.outlets) {
    const c = outlet.cell
    const j = Math.floor(c / nx) % ny
    V[outlet.face] = Vs[outlet.face] - dt * (rho[c] * gravity * topY - p[c]) / (rho[c] * 0.5 * dy[j])
  }
  return result
}

export function computeTimeStep(state: FlowState): number {
  const { mesh, config, muEff, rho } = state
  const { nx, ny, nz, vf, vol, dx, dy, dz, ax, ay, az, kindZ } = mesh
  const { cfl, diffusionNumber, dtMinS, dtMaxS, dtGrowth } = config.numerics
  const [X, Y, Z] = state.dirs
  const nxy = nx * ny
  let dt = dtMaxS
  for (let k = 0; k < nz; k += 1) {
    for (let j = 0; j < ny; j += 1) {
      for (let i = 0; i < nx; i += 1) {
        const c = i + nx * (j + ny * k)
        if (vf[c] <= 0) continue
        const xw = i + (nx + 1) * (j + ny * k)
        const ysf = i + nx * (j + (ny + 1) * k)
        const V = vol[c]
        const qx = (ax[xw] * Math.abs(X.vel[xw]) + ax[xw + 1] * Math.abs(X.vel[xw + 1])) * dy[j] * dz[k]
        const qy = (ay[ysf] * Math.abs(Y.vel[ysf]) + ay[ysf + nx] * Math.abs(Y.vel[ysf + nx])) * dx[i] * dz[k]
        const qz = (az[c] * Math.abs(Z.vel[c]) + az[c + nxy] * Math.abs(Z.vel[c + nxy])) * dx[i] * dy[j]
        const q = Math.max(qx, qy, qz)
        if (q > 0) dt = Math.min(dt, cfl * V / q)
        // 风口端面速度是边界值，不参与对流 CFL；它的体积通量已计入上面的 q。
        const ux = Math.max(Math.abs(X.vel[xw]), Math.abs(X.vel[xw + 1])) / dx[i]
        const uy = Math.max(Math.abs(Y.vel[ysf]), Math.abs(Y.vel[ysf + nx])) / dy[j]
        const wBottom = kindZ[c] === FACE_INLET ? 0 : Math.abs(Z.vel[c])
        const wTop = kindZ[c + nxy] === FACE_INLET ? 0 : Math.abs(Z.vel[c + nxy])
        const uz = Math.max(wBottom, wTop) / dz[k]
        const rate = Math.max(ux, uy, uz)
        if (rate > 0) dt = Math.min(dt, cfl / rate)
        const nu = muEff[c] / rho[c]
        const inverse = 1 / (dx[i] * dx[i]) + 1 / (dy[j] * dy[j]) + 1 / (dz[k] * dz[k])
        if (nu > 0) dt = Math.min(dt, diffusionNumber / (nu * inverse))
      }
    }
  }
  if (state.dtS > 0) dt = Math.min(dt, state.dtS * dtGrowth)
  if (!state.monitors.pressureConverged) dt = Math.min(dt, state.dtS * 0.5)
  return Math.max(dtMinS, Math.min(dtMaxS, dt))
}

function updateMonitors(state: FlowState) {
  const { mesh, alpha, uc, vc, wc, inputs, monitors } = state
  const surface = inputs.liquidSurfaceYM
  const { nx, ny, vf, vol, yc } = mesh
  let liquid = 0
  let speedSum = 0
  let energy = 0
  let bathVolume = 0
  let bathGas = 0
  for (let c = 0; c < mesh.cellCount; c += 1) {
    if (vf[c] <= 0) continue
    const a = alpha[c]
    const V = vol[c]
    const speed2 = uc[c] * uc[c] + vc[c] * vc[c] + wc[c] * wc[c]
    liquid += a * V
    speedSum += a * V * Math.sqrt(speed2)
    energy += 0.5 * inputs.liquidDensityKgM3 * a * V * speed2
    if (yc[Math.floor(c / nx) % ny] < surface) {
      bathVolume += V
      bathGas += (1 - a) * V
    }
  }
  let maxSpeed = 0
  for (const dir of state.dirs) {
    const { vel, ap } = dir
    for (let f = 0; f < vel.length; f += 1) if (ap[f] > 0) maxSpeed = Math.max(maxSpeed, Math.abs(vel[f]))
  }
  monitors.liquidVolume = liquid
  monitors.bathMeanSpeed = liquid > 0 ? speedSum / liquid : 0
  monitors.kineticEnergy = energy
  monitors.gasHoldup = bathVolume > 0 ? bathGas / bathVolume : 0
  monitors.maxSpeed = maxSpeed
}

function accumulateAverage(state: FlowState, dt: number) {
  const { average, alpha, uc, vc, wc, k, mesh } = state
  const pressure = staticPressure(state)
  for (let c = 0; c < mesh.cellCount; c += 1) {
    if (mesh.vf[c] <= 0) continue
    average.alpha[c] += alpha[c] * dt
    average.uc[c] += uc[c] * dt
    average.vc[c] += vc[c] * dt
    average.wc[c] += wc[c] * dt
    average.k[c] += k[c] * dt
    average.p[c] += pressure[c] * dt
  }
  average.timeS += dt
}

function updateSteady(state: FlowState, dt: number) {
  const { warmupS, steadyWindowS, steadyTolerance } = state.config.numerics
  const steady = state.steady
  if (state.timeS < warmupS) return
  steady.windowSum += state.monitors.kineticEnergy * dt
  steady.windowTime += dt
  if (steady.windowTime < steadyWindowS) return
  const mean = steady.windowSum / steady.windowTime
  if (steady.previousMean >= 0) {
    const change = Math.abs(mean - steady.previousMean) / Math.max(mean, steady.previousMean, 1e-12)
    steady.hits = change < steadyTolerance ? steady.hits + 1 : 0
    if (steady.hits >= 2) steady.reached = true
  }
  steady.previousMean = mean
  steady.windowSum = 0
  steady.windowTime = 0
  steady.windowStart = state.timeS
}

let staticScratch: Float64Array | null = null

/** p = p_rgh - ρ g (y - y_ref)，y_ref 为初始液面，相对烟道出口。 */
export function staticPressure(state: FlowState, out?: Float64Array): Float64Array {
  const { mesh, p, rho } = state
  const target = out ?? (staticScratch && staticScratch.length === mesh.cellCount ? staticScratch : (staticScratch = new Float64Array(mesh.cellCount)))
  const gravity = state.config.fluid.gravity
  const yRef = state.inputs.liquidSurfaceYM
  const { nx, ny, yc, vf } = mesh
  for (let c = 0; c < mesh.cellCount; c += 1) target[c] = vf[c] > 0 ? p[c] - rho[c] * gravity * (yc[Math.floor(c / nx) % ny] - yRef) : 0
  return target
}

/** 推进一步。返回 false 表示已发散，状态不再可用。 */
export function stepFlow(state: FlowState): boolean {
  const dt = state.nextDtS
  state.rhoOld.set(state.rho)
  for (const dir of state.dirs) dir.rfOld.set(dir.rf)
  advectVof(state, dt)
  updateDensity(state)
  updateWallFunctions(state)
  predictMomentum(state, dt)
  const pressure = projectVelocity(state, dt)
  updateCellVelocities(state)
  updateTurbulence(state, dt)
  updateEffectiveViscosity(state)
  state.dtS = dt
  state.timeS += dt
  state.steps += 1
  const monitors = state.monitors
  monitors.pressureIterations = pressure.iterations
  monitors.pressureResidual = pressure.residual
  monitors.pressureConverged = pressure.converged
  monitors.unconvergedSteps = pressure.converged ? 0 : monitors.unconvergedSteps + 1
  updateMonitors(state)
  if (!Number.isFinite(monitors.maxSpeed) || monitors.maxSpeed > state.config.numerics.divergenceVelocityMs || !Number.isFinite(monitors.liquidVolume)) return false
  if (state.timeS >= state.config.numerics.warmupS) accumulateAverage(state, dt)
  updateSteady(state, dt)
  state.nextDtS = computeTimeStep(state)
  return true
}

export function flowStatus(state: FlowState, diverged = false): FlowStatus {
  const { monitors, config } = state
  const drift = monitors.liquidVolume0 > 0
    ? (monitors.liquidVolume + monitors.liquidOut - monitors.liquidVolume0) / monitors.liquidVolume0
    : 0
  let phase: FlowPhase = 'running'
  if (diverged) phase = 'diverged'
  else if (state.timeS >= config.numerics.maxPhysicalTimeS) phase = 'limit'
  else if (!monitors.pressureConverged) phase = 'unconverged'
  else if (state.steady.reached) phase = 'steady'
  return {
    phase,
    timeS: state.timeS,
    steps: state.steps,
    dtS: state.dtS,
    pressureIterations: monitors.pressureIterations,
    pressureResidual: monitors.pressureResidual,
    liquidDrift: drift,
    bathMeanSpeed: monitors.bathMeanSpeed,
    gasHoldup: monitors.gasHoldup,
    maxSpeed: monitors.maxSpeed,
    hasAverage: state.average.timeS > 0,
  }
}

/** 瞬时场或时均场。时均场在预热后开始累计。 */
export function flowFields(state: FlowState, average: boolean): FlowFields {
  if (average && state.average.timeS > 0) {
    const scale = 1 / state.average.timeS
    const n = state.mesh.cellCount
    const scaled = (source: Float64Array) => {
      const out = new Float64Array(n)
      for (let c = 0; c < n; c += 1) out[c] = source[c] * scale
      return out
    }
    return {
      alpha: scaled(state.average.alpha),
      uc: scaled(state.average.uc),
      vc: scaled(state.average.vc),
      wc: scaled(state.average.wc),
      k: scaled(state.average.k),
      pressure: scaled(state.average.p),
    }
  }
  return {
    alpha: state.alpha,
    uc: state.uc,
    vc: state.vc,
    wc: state.wc,
    k: state.k,
    pressure: staticPressure(state, new Float64Array(state.mesh.cellCount)),
  }
}
