import { FACE_OUTLET } from './mesh.ts'
import type { FlowState } from './state.ts'

/**
 * THINC 代数 VOF，按方向分裂推进。膨胀项用步初的界面指示函数（Weymouth & Yue 2010），
 * 三个方向合起来严格守恒。面质量通量 M = ρg·Q + (ρl-ρg)·F 留给动量与湍流方程。
 */

const SWEEP_ORDERS: ReadonlyArray<readonly [number, number, number]> = [[0, 1, 2], [1, 2, 0], [2, 0, 1]]
const INTERFACE_EPS = 1e-6

function lnCosh(x: number): number {
  const a = Math.abs(x)
  return a + Math.log1p(Math.exp(-2 * a)) - Math.LN2
}

/**
 * 迎风单元内的 tanh 界面剖面在流出方向末端 courant 份额内的液相积分（以单元体积为单位）。
 * upstream/downstream 为沿流动方向的上下游单元。
 */
export function thincOutflow(alpha: number, upstream: number, downstream: number, courant: number, beta: number, coshBeta: number, sinhBeta: number): number {
  const lower = Math.max(0, courant - (1 - alpha))
  const upper = Math.min(alpha, courant)
  if (alpha <= INTERFACE_EPS || alpha >= 1 - INTERFACE_EPS || (downstream - alpha) * (alpha - upstream) <= 0) {
    return Math.min(upper, Math.max(lower, alpha * courant))
  }
  const gamma = downstream >= upstream ? 1 : -1
  const exponent = (2 * beta * (alpha - 0.5)) / gamma
  const t = Math.min(1 - 1e-12, Math.max(-1 + 1e-12, (coshBeta - Math.exp(exponent)) / sinhBeta))
  const center = Math.atanh(t) / beta
  const amount = 0.5 * courant + (gamma / (2 * beta)) * (lnCosh(beta * (1 - center)) - lnCosh(beta * (1 - courant - center)))
  return Math.min(upper, Math.max(lower, amount))
}

function sweep(state: FlowState, d: number, dt: number) {
  const { mesh, alpha, dilation, inputs } = state
  const { nx, ny, nz, vf, vol, dx, dy, dz } = mesh
  const dir = state.dirs[d]
  const { vel, ap, mass, qvol, liq, kind, fn0, fn1, fn2 } = dir
  const nd = dir.n
  const cs = dir.cs
  const fsd = dir.fs[d]
  const beta = state.config.numerics.thincBeta
  const coshBeta = Math.cosh(beta)
  const sinhBeta = Math.sinh(beta)
  const rl = inputs.liquidDensityKgM3
  const rg = inputs.gasDensityKgM3
  for (let k = 0; k < fn2; k += 1) {
    for (let j = 0; j < fn1; j += 1) {
      for (let i = 0; i < fn0; i += 1) {
        const f = i + fn0 * (j + fn1 * k)
        const a = ap[f]
        if (a === 0) {
          qvol[f] = 0
          liq[f] = 0
          mass[f] = 0
          continue
        }
        const q = d === 0 ? i : d === 1 ? j : k
        const area = d === 0 ? dy[j] * dz[k] : d === 1 ? dx[i] * dz[k] : dx[i] * dy[j]
        const flux = a * area * vel[f] * dt
        const base = i + nx * (j + ny * k)
        const plus = q < nd && vf[base] > 0 ? base : -1
        const minus = q > 0 && vf[base - cs] > 0 ? base - cs : -1
        let liquid = 0
        if (flux > 0 && minus >= 0) {
          const upstream = q >= 2 && vf[minus - cs] > 0 ? alpha[minus - cs] : alpha[minus]
          const downstream = plus >= 0 ? alpha[plus] : alpha[minus]
          const volume = vol[minus]
          liquid = volume * thincOutflow(alpha[minus], upstream, downstream, Math.min(1, flux / volume), beta, coshBeta, sinhBeta)
        } else if (flux < 0 && plus >= 0) {
          const upstream = q + 1 < nd && vf[plus + cs] > 0 ? alpha[plus + cs] : alpha[plus]
          const downstream = minus >= 0 ? alpha[minus] : alpha[plus]
          const volume = vol[plus]
          liquid = -volume * thincOutflow(alpha[plus], upstream, downstream, Math.min(1, -flux / volume), beta, coshBeta, sinhBeta)
        }
        qvol[f] = flux
        liq[f] = liquid
        mass[f] = rg * flux + (rl - rg) * liquid
        if (kind !== null && kind[f] === FACE_OUTLET && liquid > 0) state.monitors.liquidOut += liquid
      }
    }
  }
  let clipped = 0
  for (let k = 0; k < nz; k += 1) {
    for (let j = 0; j < ny; j += 1) {
      for (let i = 0; i < nx; i += 1) {
        const c = i + nx * (j + ny * k)
        if (vf[c] <= 0) continue
        const fm = i + fn0 * (j + fn1 * k)
        const fp = fm + fsd
        let next = alpha[c] + (liq[fm] - liq[fp] + dilation[c] * (qvol[fp] - qvol[fm])) / vol[c]
        if (next < 0) {
          clipped -= next * vol[c]
          next = 0
        } else if (next > 1) {
          clipped += (next - 1) * vol[c]
          next = 1
        }
        alpha[c] = next
      }
    }
  }
  state.monitors.clippedVolume += clipped
}

export function advectVof(state: FlowState, dt: number) {
  const { alpha, dilation } = state
  for (let c = 0; c < alpha.length; c += 1) dilation[c] = alpha[c] > 0.5 ? 1 : 0
  for (const d of SWEEP_ORDERS[state.steps % 3]) sweep(state, d, dt)
}
