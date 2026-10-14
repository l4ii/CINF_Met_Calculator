import { FACE_INLET } from './mesh.ts'
import type { FlowState } from './state.ts'

/**
 * 守恒形式动量预测。交错控制体的质量通量取相邻两单元面质量通量的平均，与 VOF 一致；
 * 对流用 van Leer TVD；粘性取 μ+μt；重力用平衡力形式 -(g·x_f)∇ρ；壁面函数作隐式阻力。
 */

export function tvd(upup: number, up: number, down: number): number {
  const delta = down - up
  if (Math.abs(delta) < 1e-12) return up
  const r = (up - upup) / delta
  if (r <= 0) return up
  return up + (0.5 * (2 * r) / (1 + r)) * delta
}

function harmonic4(a: number, b: number, c: number, d: number): number {
  return 4 / (1 / a + 1 / b + 1 / c + 1 / d)
}

function predictDirection(state: FlowState, d: number, dt: number) {
  const { mesh, rho, muEff, wallLambda } = state
  const { nx, ny, vf, vol, ys, yc } = mesh
  const sizes = [mesh.dx, mesh.dy, mesh.dz]
  const centers = [mesh.xc, mesh.yc, mesh.zc]
  const counts = [mesh.nx, mesh.ny, mesh.nz]
  const dir = state.dirs[d]
  const { fn0, fn1, fn2, fs, vel: U, star, ap, rf, kind } = dir
  const Md = dir.mass
  const nd = dir.n
  const csd = dir.cs
  const fsd = fs[d]
  const sizeD = sizes[d]
  const centerD = centers[d]
  const wallTan = state.wallTan[d]
  const gravity = state.config.fluid.gravity
  const yRef = state.inputs.liquidSurfaceYM
  const e1 = (d + 1) % 3
  const e2 = (d + 2) % 3
  const E1 = state.dirs[e1]
  const E2 = state.dirs[e2]
  const cellStride = [1, nx, nx * ny]
  star.set(U)
  for (let k = 0; k < fn2; k += 1) {
    for (let j = 0; j < fn1; j += 1) {
      for (let i = 0; i < fn0; i += 1) {
        const f = i + fn0 * (j + fn1 * k)
        const coords = d === 0 ? i : d === 1 ? j : k
        if (coords === 0 || coords === nd) continue
        const a = ap[f]
        if (a === 0) {
          star[f] = 0
          continue
        }
        if (kind !== null && kind[f] !== 0) continue
        const N = i + nx * (j + ny * k)
        const P = N - csd
        const volume = 0.5 * (vol[P] + vol[N])
        const u0 = U[f]
        const uM = U[f - fsd]
        const uP = U[f + fsd]
        const uMM = coords >= 2 ? U[f - 2 * fsd] : uM
        const uPP = coords + 2 <= nd ? U[f + 2 * fsd] : uP
        let Mp = 0.5 * (Md[f] + Md[f + fsd])
        let Mm = 0.5 * (Md[f - fsd] + Md[f])
        // 风口端面的全部射流动量进入相邻控制体。
        if (kind !== null && kind[f + fsd] === FACE_INLET) Mp = Md[f + fsd]
        if (kind !== null && kind[f - fsd] === FACE_INLET) Mm = Md[f - fsd]
        let advection = Mp * (Mp >= 0 ? tvd(uM, u0, uP) : tvd(uPP, uP, u0))
        advection -= Mm * (Mm >= 0 ? tvd(uMM, uM, u0) : tvd(uP, u0, uM))
        let netMass = Mp - Mm
        const faceS = d === 0 ? mesh.dy[j] * mesh.dz[k] : d === 1 ? mesh.dx[i] * mesh.dz[k] : mesh.dx[i] * mesh.dy[j]
        let viscous = muEff[N] * (uP - u0) / sizeD[coords] * faceS - muEff[P] * (u0 - uM) / sizeD[coords - 1] * faceS
        const spanD = 0.5 * (sizeD[coords - 1] + sizeD[coords])
        for (let pass = 0; pass < 2; pass += 1) {
          const e = pass === 0 ? e1 : e2
          const t = pass === 0 ? e2 : e1
          const E = pass === 0 ? E1 : E2
          const Me = E.mass
          const eN = i + E.fn0 * (j + E.fn1 * k)
          const eP = eN - E.fs[d]
          const fse = E.fs[e]
          const Mtp = 0.5 * (Me[eP + fse] + Me[eN + fse])
          const Mtm = 0.5 * (Me[eP] + Me[eN])
          const qe = e === 0 ? i : e === 1 ? j : k
          const qt = t === 0 ? i : t === 1 ? j : k
          const ne = counts[e]
          const fsde = fs[e]
          const hasPlus = qe + 1 < ne
          const hasMinus = qe > 0
          const uEp = hasPlus ? U[f + fsde] : u0
          const uEm = hasMinus ? U[f - fsde] : u0
          const uEpp = qe + 2 < ne ? U[f + 2 * fsde] : uEp
          const uEmm = qe > 1 ? U[f - 2 * fsde] : uEm
          advection += Mtp * (Mtp >= 0 ? tvd(uEm, u0, uEp) : tvd(uEpp, uEp, u0))
          advection -= Mtm * (Mtm >= 0 ? tvd(uEmm, uEm, u0) : tvd(uEp, u0, uEm))
          netMass += Mtp - Mtm
          const area = spanD * sizes[t][qt]
          const centerE = centers[e]
          const cse = cellStride[e]
          if (hasPlus && ap[f + fsde] > 0 && vf[P + cse] > 0 && vf[N + cse] > 0) {
            const mu = harmonic4(muEff[P], muEff[N], muEff[P + cse], muEff[N + cse])
            viscous += mu * (uEp - u0) / (centerE[qe + 1] - centerE[qe]) * area
          }
          if (hasMinus && ap[f - fsde] > 0 && vf[P - cse] > 0 && vf[N - cse] > 0) {
            const mu = harmonic4(muEff[P], muEff[N], muEff[P - cse], muEff[N - cse])
            viscous -= mu * (u0 - uEm) / (centerE[qe] - centerE[qe - 1]) * area
          }
        }
        const faceY = (d === 1 ? ys[j] : yc[j]) - yRef
        const body = gravity * faceY * (rho[N] - rho[P]) / (centerD[coords] - centerD[coords - 1]) * volume
        // 与守恒式 ρⁿ⁺¹V u* = ρⁿV u - ΣM u_f + Δt·F 在质量一致时等价；VOF 截断造成的微小质量差不会被放大。
        const denominator = rf[f] * volume
        // 壁面阻力只衰减旧速度；若连同重力项一起缩放，近壁处与压力的平衡被破坏，会激发伪循环。
        const drag = 0.5 * (wallLambda[P] * wallTan[P] + wallLambda[N] * wallTan[N])
        const decayed = drag > 0 ? u0 / (1 + dt * drag / denominator) : u0
        const next = decayed + (u0 * netMass - advection + dt * (viscous + body)) / denominator
        star[f] = Number.isFinite(next) ? next : 0
      }
    }
  }
}

export function predictMomentum(state: FlowState, dt: number) {
  for (let d = 0; d < 3; d += 1) predictDirection(state, d, dt)
}
