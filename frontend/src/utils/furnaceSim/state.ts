import type { FurnaceSimConfig } from '../../config/furnaceSimConfig.ts'
import type { SimMesh } from './mesh.ts'
import type { PressureSolver } from './pressure.ts'

export type SteadyDetector = {
  windowStart: number
  windowSum: number
  windowTime: number
  previousMean: number
  hits: number
  reached: boolean
  /** 首次判定准稳态的物理时间 s */
  reachedAtS: number
}

export type FlowInputs = {
  liquidDensityKgM3: number
  gasDensityKgM3: number
  liquidViscosityPaS: number
  gasViscosityPaS: number
  /** 风口出口实际速度 m/s，所有开启风口相同 */
  inletSpeedMs: number
  nozzleDiameterM: number
  /** 初始液面绝对标高 m */
  liquidSurfaceYM: number
  /** 关闭时按层流计算，仅用于验证算例 */
  turbulence?: boolean
}

/** 单个方向的交错面数据。面网格尺寸 fn0×fn1×fn2，沿该方向比单元多一层。 */
export type FaceDirection = {
  d: number
  /** 沿该方向的单元数 */
  n: number
  fn0: number
  fn1: number
  fn2: number
  /** 面网格沿 x/y/z 的索引步长 */
  fs: [number, number, number]
  /** 单元沿该方向的索引步长 */
  cs: number
  vel: Float64Array
  star: Float64Array
  ap: Float64Array
  /** 本步通过面的质量 kg（已乘 Δt），沿正方向为正 */
  mass: Float64Array
  /** 本步体积通量 m³ 与液相体积通量 m³ */
  qvol: Float64Array
  liq: Float64Array
  /** 交错控制体密度（VOF 推进后） */
  rf: Float64Array
  kind: Uint8Array | null
  size: Float64Array
  center: Float64Array
}

export type FlowMonitors = {
  liquidVolume0: number
  liquidVolume: number
  liquidOut: number
  clippedVolume: number
  maxSpeed: number
  pressureIterations: number
  pressureResidual: number
  pressureConverged: boolean
  unconvergedSteps: number
  bathMeanSpeed: number
  kineticEnergy: number
  gasHoldup: number
}

export type FlowState = {
  mesh: SimMesh
  config: FurnaceSimConfig
  inputs: FlowInputs
  timeS: number
  steps: number
  dtS: number
  nextDtS: number
  dirs: [FaceDirection, FaceDirection, FaceDirection]
  alpha: Float64Array
  rho: Float64Array
  rhoOld: Float64Array
  mu: Float64Array
  muT: Float64Array
  muEff: Float64Array
  k: Float64Array
  eps: Float64Array
  kNext: Float64Array
  epsNext: Float64Array
  /** p_rgh = p - ρ g·x，出口处 p = 0 */
  p: Float64Array
  rhs: Float64Array
  uc: Float64Array
  vc: Float64Array
  wc: Float64Array
  /** 每个方向的壁面投影面积 m²，以及与该方向速度相切的壁面面积 */
  wallTan: [Float64Array, Float64Array, Float64Array]
  wallDistance: Float64Array
  wallLambda: Float64Array
  dilation: Uint8Array
  inletK: number
  inletEps: number
  pressure: PressureSolver
  monitors: FlowMonitors
  /** 时均累计 */
  average: { timeS: number; alpha: Float64Array; uc: Float64Array; vc: Float64Array; wc: Float64Array; k: Float64Array; p: Float64Array }
  steady: SteadyDetector
}

export function createDirections(mesh: SimMesh): [FaceDirection, FaceDirection, FaceDirection] {
  const { nx, ny, nz } = mesh
  const make = (d: number): FaceDirection => {
    const fn0 = nx + (d === 0 ? 1 : 0)
    const fn1 = ny + (d === 1 ? 1 : 0)
    const fn2 = nz + (d === 2 ? 1 : 0)
    const count = fn0 * fn1 * fn2
    return {
      d,
      n: d === 0 ? nx : d === 1 ? ny : nz,
      fn0, fn1, fn2,
      fs: [1, fn0, fn0 * fn1],
      cs: d === 0 ? 1 : d === 1 ? nx : nx * ny,
      vel: new Float64Array(count),
      star: new Float64Array(count),
      ap: d === 0 ? mesh.ax : d === 1 ? mesh.ay : mesh.az,
      mass: new Float64Array(count),
      qvol: new Float64Array(count),
      liq: new Float64Array(count),
      rf: new Float64Array(count),
      kind: d === 1 ? mesh.kindY : d === 2 ? mesh.kindZ : null,
      size: d === 0 ? mesh.dx : d === 1 ? mesh.dy : mesh.dz,
      center: d === 0 ? mesh.xc : d === 1 ? mesh.yc : mesh.zc,
    }
  }
  return [make(0), make(1), make(2)]
}
