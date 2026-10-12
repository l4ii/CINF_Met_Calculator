import { FACE_INLET, FACE_OUTLET } from './mesh.ts'
import type { FaceDirection, FlowState } from './state.ts'

/**
 * 标准 k-ε（Launder–Spalding），混合物物性。质量通量迎风输运，耗散项隐式线性化保证 k、ε 为正；
 * 近壁单元用标准对数律壁面函数：固定 ε，并用壁面剪切给出生成项。
 */

const K_MIN = 1e-10
const EPS_MIN = 1e-12
const Y_STAR_LAMINAR = 11.225

/** 面速度按开口率加权平均到单元中心。 */
export function updateCellVelocities(state: FlowState) {
  const { mesh, uc, vc, wc } = state
  const { nx, ny, nz, vf, ax, ay, az } = mesh
  const [X, Y, Z] = state.dirs
  for (let k = 0; k < nz; k += 1) {
    for (let j = 0; j < ny; j += 1) {
      for (let i = 0; i < nx; i += 1) {
        const c = i + nx * (j + ny * k)
        if (vf[c] <= 0) {
          uc[c] = 0
          vc[c] = 0
          wc[c] = 0
          continue
        }
        const xw = i + (nx + 1) * (j + ny * k)
        const ysf = i + nx * (j + (ny + 1) * k)
        const sx = ax[xw] + ax[xw + 1]
        const sy = ay[ysf] + ay[ysf + nx]
        const sz = az[c] + az[c + nx * ny]
        uc[c] = sx > 0 ? (ax[xw] * X.vel[xw] + ax[xw + 1] * X.vel[xw + 1]) / sx : 0
        vc[c] = sy > 0 ? (ay[ysf] * Y.vel[ysf] + ay[ysf + nx] * Y.vel[ysf + nx]) / sy : 0
        vc[c] = Number.isFinite(vc[c]) ? vc[c] : 0
        wc[c] = sz > 0 ? (az[c] * Z.vel[c] + az[c + nx * ny] * Z.vel[c + nx * ny]) / sz : 0
      }
    }
  }
}

/** 壁面剪切系数 λ = τw / U，单位 kg/(m²·s)。 */
export function updateWallFunctions(state: FlowState) {
  const { mesh, k, rho, mu, wallDistance, wallLambda } = state
  const { cMu, kappa, wallE } = state.config.turbulence
  const cMu25 = Math.pow(cMu, 0.25)
  const turbulent = state.inputs.turbulence !== false
  for (let c = 0; c < mesh.cellCount; c += 1) {
    const y = wallDistance[c]
    if (!(y > 0)) {
      wallLambda[c] = 0
      continue
    }
    const laminar = mu[c] / y
    if (!turbulent) {
      wallLambda[c] = laminar
      continue
    }
    const uTau = cMu25 * Math.sqrt(Math.max(k[c], K_MIN))
    const yStar = rho[c] * uTau * y / mu[c]
    wallLambda[c] = yStar > Y_STAR_LAMINAR ? rho[c] * kappa * uTau / Math.log(wallE * yStar) : laminar
  }
}

export function updateEffectiveViscosity(state: FlowState) {
  const { mesh, k, eps, rho, mu, muT, muEff } = state
  const { cMu, nuTMax } = state.config.turbulence
  const turbulent = state.inputs.turbulence !== false
  for (let c = 0; c < mesh.cellCount; c += 1) {
    if (mesh.vf[c] <= 0 || !turbulent) {
      muT[c] = 0
      muEff[c] = mu[c]
      continue
    }
    const value = rho[c] * cMu * k[c] * k[c] / Math.max(eps[c], EPS_MIN)
    muT[c] = Math.min(Number.isFinite(value) ? value : 0, rho[c] * nuTMax)
    muEff[c] = mu[c] + muT[c]
  }
}

/** 单元六个面的累加量与本步共用的数组引用，避免在内层循环里分配闭包或反复解构。 */
const acc = {
  advK: 0, advE: 0, outflow: 0, diffK: 0, diffE: 0, k0: 0, e0: 0, gammaK: 0, gammaE: 0,
  sigmaK: 1, sigmaEps: 1.3, inletK: 0, inletEps: 0, ambientK: 0, ambientEps: 0,
  k: new Float64Array(0), eps: new Float64Array(0), mu: new Float64Array(0), muT: new Float64Array(0), vf: new Float64Array(0),
}

function visitFace(dir: FaceDirection, f: number, sign: number, neighbor: number, area: number, distance: number) {
  const a = dir.ap[f]
  if (a === 0) return
  const nb = neighbor >= 0 && acc.vf[neighbor] > 0 ? neighbor : -1
  const out = sign * dir.mass[f]
  if (out > 0) {
    acc.outflow += out
  } else {
    let kn = acc.k0
    let en = acc.e0
    if (nb >= 0) {
      kn = acc.k[nb]
      en = acc.eps[nb]
    } else {
      const kind = dir.kind !== null ? dir.kind[f] : 0
      if (kind === FACE_INLET) {
        kn = acc.inletK
        en = acc.inletEps
      } else if (kind === FACE_OUTLET) {
        kn = acc.ambientK
        en = acc.ambientEps
      }
    }
    acc.advK -= out * kn
    acc.advE -= out * en
  }
  if (nb >= 0) {
    const transmit = a * area / distance
    const muNb = acc.mu[nb]
    const muTNb = acc.muT[nb]
    acc.diffK += 2 / (1 / acc.gammaK + 1 / (muNb + muTNb / acc.sigmaK)) * transmit * (acc.k[nb] - acc.k0)
    acc.diffE += 2 / (1 / acc.gammaE + 1 / (muNb + muTNb / acc.sigmaEps)) * transmit * (acc.eps[nb] - acc.e0)
  }
}

function gradient(field: Float64Array, c: number, stride: number, index: number, count: number, centers: Float64Array, vf: Float64Array): number {
  const plus = index + 1 < count && vf[c + stride] > 0
  const minus = index > 0 && vf[c - stride] > 0
  if (plus && minus) return (field[c + stride] - field[c - stride]) / (centers[index + 1] - centers[index - 1])
  if (plus) return (field[c + stride] - field[c]) / (centers[index + 1] - centers[index])
  if (minus) return (field[c] - field[c - stride]) / (centers[index] - centers[index - 1])
  return 0
}

export function updateTurbulence(state: FlowState, dt: number) {
  if (state.inputs.turbulence === false) return
  const { mesh, k, eps, kNext, epsNext, rho, rhoOld, mu, muT, uc, vc, wc, wallDistance, wallLambda } = state
  const { nx, ny, nz, vf, vol, xc, yc, zc } = mesh
  const { cMu, c1, c2, sigmaK, sigmaEps, kappa, productionLimiter } = state.config.turbulence
  const cMu25 = Math.pow(cMu, 0.25)
  const cMu75 = Math.pow(cMu, 0.75)
  const [X, Y, Z] = state.dirs
  const nxy = nx * ny
  Object.assign(acc, {
    sigmaK, sigmaEps,
    inletK: state.inletK, inletEps: state.inletEps,
    ambientK: state.config.turbulence.initialK, ambientEps: state.config.turbulence.initialEpsilon,
    k, eps, mu, muT, vf,
  })
  for (let kk = 0; kk < nz; kk += 1) {
    for (let j = 0; j < ny; j += 1) {
      for (let i = 0; i < nx; i += 1) {
        const c = i + nx * (j + ny * kk)
        if (vf[c] <= 0) {
          kNext[c] = 0
          epsNext[c] = 0
          continue
        }
        const xw = i + (nx + 1) * (j + ny * kk)
        const ysf = i + nx * (j + (ny + 1) * kk)
        const zb = c
        const dudx = (X.vel[xw + 1] - X.vel[xw]) / mesh.dx[i]
        const dvdy = (Y.vel[ysf + nx] - Y.vel[ysf]) / mesh.dy[j]
        const dwdz = (Z.vel[zb + nxy] - Z.vel[zb]) / mesh.dz[kk]
        const dudy = gradient(uc, c, nx, j, ny, yc, vf)
        const dudz = gradient(uc, c, nxy, kk, nz, zc, vf)
        const dvdx = gradient(vc, c, 1, i, nx, xc, vf)
        const dvdz = gradient(vc, c, nxy, kk, nz, zc, vf)
        const dwdx = gradient(wc, c, 1, i, nx, xc, vf)
        const dwdy = gradient(wc, c, nx, j, ny, yc, vf)
        const shear = 2 * (dudx * dudx + dvdy * dvdy + dwdz * dwdz) + (dudy + dvdx) ** 2 + (dudz + dwdx) ** 2 + (dvdz + dwdy) ** 2
        const k0 = Math.max(k[c], K_MIN)
        const e0 = Math.max(eps[c], EPS_MIN)
        let production = Math.min(muT[c] * shear, productionLimiter * rho[c] * e0)
        const y = wallDistance[c]
        if (y > 0) {
          const uTau = cMu25 * Math.sqrt(k0)
          if (rho[c] * uTau * y / mu[c] > Y_STAR_LAMINAR) {
            const tau = wallLambda[c] * Math.hypot(uc[c], vc[c], wc[c])
            production = Math.min(tau * tau / (kappa * rho[c] * uTau * y), productionLimiter * rho[c] * e0)
          }
        }
        acc.advK = 0
        acc.advE = 0
        acc.outflow = 0
        acc.diffK = 0
        acc.diffE = 0
        acc.k0 = k0
        acc.e0 = e0
        acc.gammaK = mu[c] + muT[c] / sigmaK
        acc.gammaE = mu[c] + muT[c] / sigmaEps
        const areaX = mesh.dy[j] * mesh.dz[kk]
        const areaY = mesh.dx[i] * mesh.dz[kk]
        const areaZ = mesh.dx[i] * mesh.dy[j]
        visitFace(X, xw, -1, i > 0 ? c - 1 : -1, areaX, i > 0 ? xc[i] - xc[i - 1] : 1)
        visitFace(X, xw + 1, 1, i < nx - 1 ? c + 1 : -1, areaX, i < nx - 1 ? xc[i + 1] - xc[i] : 1)
        visitFace(Y, ysf, -1, j > 0 ? c - nx : -1, areaY, j > 0 ? yc[j] - yc[j - 1] : 1)
        visitFace(Y, ysf + nx, 1, j < ny - 1 ? c + nx : -1, areaY, j < ny - 1 ? yc[j + 1] - yc[j] : 1)
        visitFace(Z, zb, -1, kk > 0 ? c - nxy : -1, areaZ, kk > 0 ? zc[kk] - zc[kk - 1] : 1)
        visitFace(Z, zb + nxy, 1, kk < nz - 1 ? c + nxy : -1, areaZ, kk < nz - 1 ? zc[kk + 1] - zc[kk] : 1)
        const { advK, advE, diffK, diffE } = acc
        const V = vol[c]
        const massOld = Math.max(rhoOld[c] * V - acc.outflow, 0)
        const massNew = Math.max(rho[c] * V, 1e-30)
        const ratio = e0 / k0
        let kValue = (massOld * k0 + advK + dt * (diffK + production * V)) / (massNew * (1 + dt * ratio))
        let eValue = (massOld * e0 + advE + dt * (diffE + c1 * production * ratio * V)) / (massNew * (1 + dt * c2 * ratio))
        kValue = Number.isFinite(kValue) ? Math.max(kValue, K_MIN) : k0
        eValue = Number.isFinite(eValue) ? Math.max(eValue, EPS_MIN) : e0
        if (y > 0) eValue = Math.max(EPS_MIN, cMu75 * Math.pow(kValue, 1.5) / (kappa * y))
        kNext[c] = kValue
        epsNext[c] = eValue
      }
    }
  }
  k.set(kNext)
  eps.set(epsNext)
}
