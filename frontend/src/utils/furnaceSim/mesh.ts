import { FURNACE_SIM_CONFIG, type FurnaceSimConfig, type MeshLevel } from '../../config/furnaceSimConfig.ts'
import type { FluidDomain } from '../furnaceFluidDomain.ts'

/**
 * 张量积非均匀六面体网格，切割单元表示弧底、外扩炉壁和伸入的风口。
 * 单元 c = i + nx·(j + ny·k)；x 面 i + (nx+1)·(j + ny·k)；y 面 i + nx·(j + (ny+1)·k)；z 面 i + nx·(j + ny·k)。
 */

export const FACE_NORMAL = 0
export const FACE_INLET = 1
export const FACE_OUTLET = 2

export type MeshLance = {
  centerXM: number
  centerYM: number
  radiusM: number
  wallZM: number
  tipZM: number
  /** 吹入方向 Z 分量，±1 */
  inwardZ: number
}

/** 入口为 z 面，cell 是炉内一侧的流体单元 */
export type MeshInlet = { lance: number; face: number; cell: number; aperture: number; dir: number }
/** 出口为顶部 y 面，cell 是其下方的流体单元 */
export type MeshOutlet = { face: number; cell: number; aperture: number }

export type MeshStats = {
  targetCells: number
  fluidCells: number
  boxCells: number
  baseSizeM: number
  minSizeM: number
  maxSizeM: number
  maxRatio: number
  nozzleCellM: number
  bathLayers: number
  componentsBeforeCleanup: number
  removedCells: number
  connected: boolean
  nozzleAreaM2: number
  inletAreaM2: number
  outletAreaM2: number
}

export type SimMesh = {
  nx: number
  ny: number
  nz: number
  cellCount: number
  xs: Float64Array
  ys: Float64Array
  zs: Float64Array
  dx: Float64Array
  dy: Float64Array
  dz: Float64Array
  xc: Float64Array
  yc: Float64Array
  zc: Float64Array
  /** 流体体积分数，0 为固体 */
  vf: Float64Array
  /** 流体体积 m³ */
  vol: Float64Array
  ax: Float64Array
  ay: Float64Array
  az: Float64Array
  kindY: Uint8Array
  kindZ: Uint8Array
  inlets: MeshInlet[]
  outlets: MeshOutlet[]
  lances: MeshLance[]
  lanceAreaM2: Float64Array
  stats: MeshStats
  /** 网格线，两点一段 */
  wire: Float32Array
}

export type MeshSpec = {
  xs: number[]
  ys: number[]
  zs: number[]
  contains: (x: number, y: number, z: number) => boolean
  lances: MeshLance[]
  /** 顶部边界 y 面上的点是否属于出口 */
  isOutlet: (x: number, y: number, z: number) => boolean
  liquidSurfaceYM?: number
  targetCells?: number
  baseSizeM?: number
  config?: FurnaceSimConfig
}

export type RefineZone = { a: number; b: number; size: number }

/** 尺寸函数 s(x) = min(h, size + (r-1)·距离)，节点按 ∫dx/s 均分，锚点必为节点。 */
export function gradedAxis(min: number, max: number, baseSize: number, zones: RefineZone[], anchors: number[], ratio: number): number[] {
  const slope = Math.max(ratio - 1, 1e-3)
  const size = (x: number) => {
    let s = baseSize
    for (const zone of zones) {
      const distance = x < zone.a ? zone.a - x : x > zone.b ? x - zone.b : 0
      s = Math.min(s, zone.size + slope * distance)
    }
    return Math.max(s, 1e-4)
  }
  const sorted = [min, ...anchors.filter((value) => value > min + 1e-9 && value < max - 1e-9), max].sort((a, b) => a - b)
  const kept = [sorted[0]]
  for (let index = 1; index < sorted.length; index += 1) {
    const value = sorted[index]
    const last = kept[kept.length - 1]
    if (value - last >= 0.35 * size(0.5 * (value + last))) kept.push(value)
    else if (index === sorted.length - 1) {
      if (kept.length > 1) kept[kept.length - 1] = value
      else kept.push(value)
    }
  }
  // 锚点间的短区段只能放下比 s 小的单元，把它们也作为加密区，邻区才能逐级过渡。
  const allZones = [...zones]
  const sizeWith = (x: number) => {
    let s = baseSize
    for (const zone of allZones) {
      const distance = x < zone.a ? zone.a - x : x > zone.b ? x - zone.b : 0
      s = Math.min(s, zone.size + slope * distance)
    }
    return Math.max(s, 1e-4)
  }
  const segmentCount = (length: number, local: number) => {
    let count = Math.max(1, Math.round(length / local))
    if (length / count > 1.15 * local) count += 1
    return count
  }
  for (let pass = 0; pass < 4; pass += 1) {
    let added = false
    for (let segment = 0; segment < kept.length - 1; segment += 1) {
      const a = kept[segment]
      const b = kept[segment + 1]
      const local = sizeWith(0.5 * (a + b))
      const realized = (b - a) / segmentCount(b - a, local)
      if (realized < 0.85 * local) {
        allZones.push({ a, b, size: realized })
        added = true
      }
    }
    if (!added) break
  }
  let smallest = baseSize
  for (const zone of allZones) smallest = Math.min(smallest, zone.size)
  const out: number[] = [kept[0]]
  for (let segment = 0; segment < kept.length - 1; segment += 1) {
    const a = kept[segment]
    const b = kept[segment + 1]
    const samples = Math.min(20_000, Math.max(16, Math.ceil((b - a) / (0.1 * Math.max(smallest, 1e-4)))))
    const step = (b - a) / samples
    const cumulative = new Float64Array(samples + 1)
    for (let s = 0; s < samples; s += 1) cumulative[s + 1] = cumulative[s] + step / sizeWith(a + (s + 0.5) * step)
    const total = cumulative[samples]
    const count = segmentCount(total, 1)
    let cursor = 0
    for (let m = 1; m < count; m += 1) {
      const target = (m * total) / count
      while (cursor < samples - 1 && cumulative[cursor + 1] < target) cursor += 1
      const span = Math.max(cumulative[cursor + 1] - cumulative[cursor], 1e-30)
      out.push(a + (cursor + (target - cumulative[cursor]) / span) * step)
    }
    out.push(b)
  }
  return out
}

function axisRatio(axis: ArrayLike<number>): number {
  let worst = 1
  for (let index = 1; index < axis.length - 1; index += 1) {
    const left = axis[index] - axis[index - 1]
    const right = axis[index + 1] - axis[index]
    if (left > 0 && right > 0) worst = Math.max(worst, left / right, right / left)
  }
  return worst
}

function rectHitsDisk(x0: number, x1: number, y0: number, y1: number, cx: number, cy: number, r: number): boolean {
  const px = Math.min(Math.max(cx, x0), x1)
  const py = Math.min(Math.max(cy, y0), y1)
  return (px - cx) ** 2 + (py - cy) ** 2 < r * r
}

function diskFraction(x0: number, x1: number, y0: number, y1: number, cx: number, cy: number, r: number): number {
  const n = 12
  let hits = 0
  for (let a = 0; a < n; a += 1) {
    const x = x0 + ((a + 0.5) / n) * (x1 - x0)
    for (let b = 0; b < n; b += 1) {
      const y = y0 + ((b + 0.5) / n) * (y1 - y0)
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) hits += 1
    }
  }
  return hits / (n * n)
}

export function buildSimMesh(spec: MeshSpec): SimMesh {
  const config = spec.config ?? FURNACE_SIM_CONFIG
  const { minVolumeFraction, minAperture, cellSamples, faceSamples } = config.mesh
  const xs = Float64Array.from(spec.xs)
  const ys = Float64Array.from(spec.ys)
  const zs = Float64Array.from(spec.zs)
  const nx = xs.length - 1
  const ny = ys.length - 1
  const nz = zs.length - 1
  const nxy = nx * ny
  const cellCount = nxy * nz
  const widths = (axis: Float64Array) => Float64Array.from({ length: axis.length - 1 }, (_, index) => axis[index + 1] - axis[index])
  const centers = (axis: Float64Array) => Float64Array.from({ length: axis.length - 1 }, (_, index) => 0.5 * (axis[index + 1] + axis[index]))
  const dx = widths(xs)
  const dy = widths(ys)
  const dz = widths(zs)
  const xc = centers(xs)
  const yc = centers(ys)
  const zc = centers(zs)
  const contains = spec.contains

  const nnx = nx + 1
  const nny = ny + 1
  const nodeIn = new Uint8Array(nnx * nny * (nz + 1))
  for (let k = 0; k <= nz; k += 1) {
    for (let j = 0; j <= ny; j += 1) {
      for (let i = 0; i <= nx; i += 1) nodeIn[i + nnx * (j + nny * k)] = contains(xs[i], ys[j], zs[k]) ? 1 : 0
    }
  }

  const vf = new Float64Array(cellCount)
  const full = new Uint8Array(cellCount)
  for (let k = 0; k < nz; k += 1) {
    for (let j = 0; j < ny; j += 1) {
      for (let i = 0; i < nx; i += 1) {
        const c = i + nx * (j + ny * k)
        const n0 = i + nnx * (j + nny * k)
        let inside = nodeIn[n0] + nodeIn[n0 + 1] + nodeIn[n0 + nnx] + nodeIn[n0 + nnx + 1]
        const n1 = n0 + nnx * nny
        inside += nodeIn[n1] + nodeIn[n1 + 1] + nodeIn[n1 + nnx] + nodeIn[n1 + nnx + 1]
        inside += contains(xc[i], yc[j], zc[k]) ? 1 : 0
        if (inside === 9) {
          vf[c] = 1
          full[c] = 1
        } else if (inside > 0) {
          let hits = 0
          for (let a = 0; a < cellSamples; a += 1) {
            const x = xs[i] + ((a + 0.5) / cellSamples) * dx[i]
            for (let b = 0; b < cellSamples; b += 1) {
              const y = ys[j] + ((b + 0.5) / cellSamples) * dy[j]
              for (let s = 0; s < cellSamples; s += 1) {
                if (contains(x, y, zs[k] + ((s + 0.5) / cellSamples) * dz[k])) hits += 1
              }
            }
          }
          vf[c] = hits / cellSamples ** 3
        }
      }
    }
  }

  // 风口柱：从炉壁到伸入端的单元列为固体，端面才是入口。
  for (const lance of spec.lances) {
    const z0 = Math.min(lance.wallZM, lance.tipZM)
    const z1 = Math.max(lance.wallZM, lance.tipZM)
    if (z1 - z0 < 1e-9) continue
    for (let k = 0; k < nz; k += 1) {
      if (zc[k] < z0 || zc[k] > z1) continue
      for (let j = 0; j < ny; j += 1) {
        for (let i = 0; i < nx; i += 1) {
          if (!rectHitsDisk(xs[i], xs[i + 1], ys[j], ys[j + 1], lance.centerXM, lance.centerYM, lance.radiusM)) continue
          const c = i + nx * (j + ny * k)
          vf[c] = 0
          full[c] = 0
        }
      }
    }
  }
  for (let c = 0; c < cellCount; c += 1) {
    if (vf[c] < minVolumeFraction) {
      vf[c] = 0
      full[c] = 0
    }
  }

  const ax = new Float64Array((nx + 1) * ny * nz)
  const ay = new Float64Array(nx * (ny + 1) * nz)
  const az = new Float64Array(nxy * (nz + 1))
  const faceAperture = (both: boolean, sample: (u: number, v: number) => boolean) => {
    if (both) return 1
    let hits = 0
    for (let a = 0; a < faceSamples; a += 1) {
      for (let b = 0; b < faceSamples; b += 1) if (sample((a + 0.5) / faceSamples, (b + 0.5) / faceSamples)) hits += 1
    }
    const value = hits / (faceSamples * faceSamples)
    return value < minAperture ? 0 : value
  }
  const computeApertures = () => {
    ax.fill(0)
    ay.fill(0)
    az.fill(0)
    for (let k = 0; k < nz; k += 1) {
      for (let j = 0; j < ny; j += 1) {
        for (let i = 0; i < nx; i += 1) {
          const c = i + nx * (j + ny * k)
          if (vf[c] <= 0) continue
          if (i > 0 && vf[c - 1] > 0) {
            ax[i + (nx + 1) * (j + ny * k)] = faceAperture(full[c] === 1 && full[c - 1] === 1, (u, v) => contains(xs[i], ys[j] + u * dy[j], zs[k] + v * dz[k]))
          }
          if (j > 0 && vf[c - nx] > 0) {
            ay[i + nx * (j + (ny + 1) * k)] = faceAperture(full[c] === 1 && full[c - nx] === 1, (u, v) => contains(xs[i] + u * dx[i], ys[j], zs[k] + v * dz[k]))
          }
          if (k > 0 && vf[c - nxy] > 0) {
            az[c] = faceAperture(full[c] === 1 && full[c - nxy] === 1, (u, v) => contains(xs[i] + u * dx[i], ys[j] + v * dy[j], zs[k]))
          }
        }
      }
    }
  }
  computeApertures()

  // 只保留最大连通域，碎片和孤立单元改为固体。
  const component = new Int32Array(cellCount).fill(-1)
  const queue = new Int32Array(cellCount)
  const sizes: number[] = []
  for (let seed = 0; seed < cellCount; seed += 1) {
    if (vf[seed] <= 0 || component[seed] >= 0) continue
    const id = sizes.length
    let head = 0
    let tail = 0
    queue[tail++] = seed
    component[seed] = id
    while (head < tail) {
      const c = queue[head++]
      const i = c % nx
      const j = Math.floor(c / nx) % ny
      const k = Math.floor(c / nxy)
      const visit = (other: number, open: number) => {
        if (open > 0 && component[other] < 0 && vf[other] > 0) {
          component[other] = id
          queue[tail++] = other
        }
      }
      if (i > 0) visit(c - 1, ax[i + (nx + 1) * (j + ny * k)])
      if (i < nx - 1) visit(c + 1, ax[i + 1 + (nx + 1) * (j + ny * k)])
      if (j > 0) visit(c - nx, ay[i + nx * (j + (ny + 1) * k)])
      if (j < ny - 1) visit(c + nx, ay[i + nx * (j + 1 + (ny + 1) * k)])
      if (k > 0) visit(c - nxy, az[c])
      if (k < nz - 1) visit(c + nxy, az[c + nxy])
    }
    sizes.push(tail)
  }
  let largest = 0
  for (let id = 1; id < sizes.length; id += 1) if (sizes[id] > sizes[largest]) largest = id
  let removedCells = 0
  for (let c = 0; c < cellCount; c += 1) {
    if (vf[c] > 0 && component[c] !== largest) {
      vf[c] = 0
      full[c] = 0
      removedCells += 1
    }
  }
  if (removedCells > 0) computeApertures()

  const kindY = new Uint8Array(ay.length)
  const kindZ = new Uint8Array(az.length)
  const inlets: MeshInlet[] = []
  const lanceAreaM2 = new Float64Array(spec.lances.length)
  spec.lances.forEach((lance, lanceIndex) => {
    const nozzleArea = Math.PI * lance.radiusM * lance.radiusM
    lanceAreaM2[lanceIndex] = nozzleArea
    let kTip = 0
    for (let k = 1; k <= nz; k += 1) if (Math.abs(zs[k] - lance.tipZM) < Math.abs(zs[kTip] - lance.tipZM)) kTip = k
    const dir = lance.inwardZ >= 0 ? 1 : -1
    const candidates: Array<{ face: number; cell: number; weight: number }> = []
    const tryColumn = (i: number, j: number, weight: number) => {
      let k = kTip
      // 端面落在切割区时沿吹入方向找第一个流体单元。
      for (let step = 0; step < 4; step += 1) {
        const inward = dir > 0 ? k : k - 1
        const outward = dir > 0 ? k - 1 : k
        if (inward < 0 || inward >= nz) return
        const cell = i + nx * (j + ny * inward)
        const outwardSolid = outward < 0 || outward >= nz || vf[i + nx * (j + ny * outward)] <= 0
        if (vf[cell] > 0 && outwardSolid) {
          candidates.push({ face: i + nx * (j + ny * k), cell, weight })
          return
        }
        k += dir
        if (k < 0 || k > nz) return
      }
    }
    for (let j = 0; j < ny; j += 1) {
      for (let i = 0; i < nx; i += 1) {
        if (!rectHitsDisk(xs[i], xs[i + 1], ys[j], ys[j + 1], lance.centerXM, lance.centerYM, lance.radiusM)) continue
        const fraction = diskFraction(xs[i], xs[i + 1], ys[j], ys[j + 1], lance.centerXM, lance.centerYM, lance.radiusM)
        if (fraction > 0) tryColumn(i, j, fraction * dx[i] * dy[j])
      }
    }
    if (candidates.length === 0) {
      let ic = 0
      let jc = 0
      while (ic < nx - 1 && xs[ic + 1] < lance.centerXM) ic += 1
      while (jc < ny - 1 && ys[jc + 1] < lance.centerYM) jc += 1
      tryColumn(ic, jc, nozzleArea)
    }
    const total = candidates.reduce((sum, item) => sum + item.weight, 0)
    for (const item of candidates) {
      const i = item.face % nx
      const j = Math.floor(item.face / nx) % ny
      const faceArea = dx[i] * dy[j]
      const aperture = Math.min(1, (nozzleArea * item.weight) / Math.max(total, 1e-30) / faceArea)
      az[item.face] = aperture
      kindZ[item.face] = FACE_INLET
      inlets.push({ lance: lanceIndex, face: item.face, cell: item.cell, aperture, dir })
    }
  })

  const outlets: MeshOutlet[] = []
  for (let k = 0; k < nz; k += 1) {
    for (let j = 1; j <= ny; j += 1) {
      for (let i = 0; i < nx; i += 1) {
        const below = i + nx * (j - 1 + ny * k)
        if (vf[below] <= 0) continue
        if (j < ny && vf[below + nx] > 0) continue
        let hits = 0
        for (let a = 0; a < faceSamples; a += 1) {
          for (let b = 0; b < faceSamples; b += 1) {
            if (spec.isOutlet(xs[i] + ((a + 0.5) / faceSamples) * dx[i], ys[j], zs[k] + ((b + 0.5) / faceSamples) * dz[k])) hits += 1
          }
        }
        const aperture = hits / (faceSamples * faceSamples)
        if (aperture < minAperture) continue
        const face = i + nx * (j + (ny + 1) * k)
        ay[face] = aperture
        kindY[face] = FACE_OUTLET
        outlets.push({ face, cell: below, aperture })
      }
    }
  }

  const vol = new Float64Array(cellCount)
  let fluidCells = 0
  let minSize = Infinity
  let maxSize = 0
  for (let k = 0; k < nz; k += 1) {
    for (let j = 0; j < ny; j += 1) {
      for (let i = 0; i < nx; i += 1) {
        const c = i + nx * (j + ny * k)
        if (vf[c] <= 0) continue
        vol[c] = vf[c] * dx[i] * dy[j] * dz[k]
        fluidCells += 1
        minSize = Math.min(minSize, dx[i], dy[j], dz[k])
        maxSize = Math.max(maxSize, dx[i], dy[j], dz[k])
      }
    }
  }
  let inletArea = 0
  let nozzleCell = 0
  for (const inlet of inlets) {
    const i = inlet.face % nx
    const j = Math.floor(inlet.face / nx) % ny
    inletArea += inlet.aperture * dx[i] * dy[j]
    nozzleCell = Math.max(nozzleCell, Math.sqrt(dx[i] * dy[j]))
  }
  let outletArea = 0
  for (const outlet of outlets) {
    const i = outlet.face % nx
    const k = Math.floor(outlet.face / (nx * (ny + 1)))
    outletArea += outlet.aperture * dx[i] * dz[k]
  }
  let bathLayers = 0
  if (spec.liquidSurfaceYM != null) for (let j = 0; j < ny; j += 1) if (yc[j] < spec.liquidSurfaceYM) bathLayers += 1

  const mesh: SimMesh = {
    nx, ny, nz, cellCount, xs, ys, zs, dx, dy, dz, xc, yc, zc, vf, vol, ax, ay, az, kindY, kindZ, inlets, outlets,
    lances: spec.lances,
    lanceAreaM2,
    stats: {
      targetCells: spec.targetCells ?? fluidCells,
      fluidCells,
      boxCells: cellCount,
      baseSizeM: spec.baseSizeM ?? maxSize,
      minSizeM: Number.isFinite(minSize) ? minSize : 0,
      maxSizeM: maxSize,
      maxRatio: Math.max(axisRatio(xs), axisRatio(ys), axisRatio(zs)),
      nozzleCellM: nozzleCell,
      bathLayers,
      componentsBeforeCleanup: sizes.length,
      removedCells,
      connected: true,
      nozzleAreaM2: lanceAreaM2.reduce((sum, value) => sum + value, 0),
      inletAreaM2: inletArea,
      outletAreaM2: outletArea,
    },
    wire: new Float32Array(0),
  }
  mesh.wire = buildMeshWire(mesh, config.mesh.wireSegmentLimit)
  return mesh
}

/** 三个中心截面上的全部网格线，加上外表面网格线（超出上限时抽稀）。 */
function buildMeshWire(mesh: SimMesh, limit: number): Float32Array {
  const { nx, ny, nz, xs, ys, zs, vf } = mesh
  const nnx = nx + 1
  const nny = ny + 1
  const nodeCount = nnx * nny * (nz + 1)
  const seen = new Uint8Array(nodeCount * 3)
  const out: number[] = []
  const fluid = (i: number, j: number, k: number) => i >= 0 && j >= 0 && k >= 0 && i < nx && j < ny && k < nz && vf[i + nx * (j + ny * k)] > 0
  const addEdge = (i: number, j: number, k: number, axis: number) => {
    const key = (i + nnx * (j + nny * k)) * 3 + axis
    if (seen[key]) return
    seen[key] = 1
    out.push(xs[i], ys[j], zs[k], xs[i + (axis === 0 ? 1 : 0)], ys[j + (axis === 1 ? 1 : 0)], zs[k + (axis === 2 ? 1 : 0)])
  }
  const nearest = (axis: Float64Array, value: number) => {
    let best = 0
    for (let index = 1; index < axis.length; index += 1) if (Math.abs(axis[index] - value) < Math.abs(axis[best] - value)) best = index
    return best
  }
  const lance = mesh.lances[0]
  const kPlane = nearest(zs, 0.5 * (zs[0] + zs[nz]))
  const iPlane = nearest(xs, lance ? lance.centerXM : 0.5 * (xs[0] + xs[nx]))
  const jPlane = nearest(ys, lance ? lance.centerYM : 0.5 * (ys[0] + ys[ny]))
  for (let j = 0; j <= ny; j += 1) {
    for (let i = 0; i <= nx; i += 1) {
      const touches = (a: number, b: number) => fluid(a, b, kPlane - 1) || fluid(a, b, kPlane)
      if (i < nx && (touches(i, j - 1) || touches(i, j))) addEdge(i, j, kPlane, 0)
      if (j < ny && (touches(i - 1, j) || touches(i, j))) addEdge(i, j, kPlane, 1)
    }
  }
  for (let k = 0; k <= nz; k += 1) {
    for (let j = 0; j <= ny; j += 1) {
      const touches = (b: number, c: number) => fluid(iPlane - 1, b, c) || fluid(iPlane, b, c)
      if (j < ny && (touches(j, k - 1) || touches(j, k))) addEdge(iPlane, j, k, 1)
      if (k < nz && (touches(j - 1, k) || touches(j, k))) addEdge(iPlane, j, k, 2)
    }
  }
  for (let k = 0; k <= nz; k += 1) {
    for (let i = 0; i <= nx; i += 1) {
      const touches = (a: number, c: number) => fluid(a, jPlane - 1, c) || fluid(a, jPlane, c)
      if (i < nx && (touches(i, k - 1) || touches(i, k))) addEdge(i, jPlane, k, 0)
      if (k < nz && (touches(i - 1, k) || touches(i, k))) addEdge(i, jPlane, k, 2)
    }
  }
  const sectionSegments = out.length / 6
  const surface: Array<[number, number, number, number]> = []
  for (let k = 0; k < nz; k += 1) {
    for (let j = 0; j < ny; j += 1) {
      for (let i = 0; i < nx; i += 1) {
        if (!fluid(i, j, k)) continue
        if (!fluid(i - 1, j, k)) surface.push([i, j, k, 0])
        if (!fluid(i + 1, j, k)) surface.push([i + 1, j, k, 0])
        if (!fluid(i, j - 1, k)) surface.push([i, j, k, 1])
        if (!fluid(i, j + 1, k)) surface.push([i, j + 1, k, 1])
        if (!fluid(i, j, k - 1)) surface.push([i, j, k, 2])
        if (!fluid(i, j, k + 1)) surface.push([i, j, k + 1, 2])
      }
    }
  }
  const budget = Math.max(0, limit - sectionSegments)
  const stride = Math.max(1, Math.ceil((surface.length * 2) / Math.max(budget, 1)))
  for (let index = 0; index < surface.length; index += stride) {
    const [i, j, k, normal] = surface[index]
    if (normal === 0) {
      addEdge(i, j, k, 1)
      addEdge(i, j, k, 2)
    } else if (normal === 1) {
      addEdge(i, j, k, 0)
      addEdge(i, j, k, 2)
    } else {
      addEdge(i, j, k, 0)
      addEdge(i, j, k, 1)
    }
  }
  return Float32Array.from(out)
}

export type FurnaceMeshOptions = {
  level?: MeshLevel
  targetCells?: number
  liquidSurfaceYM?: number
  config?: FurnaceSimConfig
}

function furnaceLances(domain: FluidDomain, tuyereSize: number): MeshLance[] {
  return domain.lances.map((lance) => {
    const insertion = Math.abs(lance.tipZM - lance.wallZM)
    return {
      centerXM: lance.centerXM,
      centerYM: lance.centerYM,
      radiusM: lance.radiusM,
      wallZM: lance.wallZM,
      tipZM: insertion < 0.5 * tuyereSize ? lance.wallZM : lance.tipZM,
      inwardZ: lance.inwardZ,
    }
  })
}

function furnaceAxes(domain: FluidDomain, h: number, surface: number | undefined, config: FurnaceSimConfig) {
  const { growthRatio, tuyereCellRatio, tuyereMinDiameters, surfaceCellRatio, surfaceBandCells } = config.mesh
  const diameter = domain.lances.reduce((value, lance) => Math.max(value, lance.radiusM * 2), 0)
  const tuyereSize = Math.min(h, Math.max(diameter * tuyereMinDiameters, h * tuyereCellRatio))
  const lances = furnaceLances(domain, tuyereSize)
  const { bounds, anchors } = domain
  const xZones: RefineZone[] = []
  const yZones: RefineZone[] = []
  const zZones: RefineZone[] = []
  const xAnchors = [...anchors.x]
  const yAnchors = [...anchors.y]
  const zAnchors = [...anchors.z]
  const seenX = new Set<number>()
  for (const lance of lances) {
    const key = Math.round(lance.centerXM * 1e5)
    if (!seenX.has(key)) {
      seenX.add(key)
      xZones.push({ a: lance.centerXM - tuyereSize / 2, b: lance.centerXM + tuyereSize / 2, size: tuyereSize })
    }
    zZones.push({ a: lance.tipZM - tuyereSize, b: lance.tipZM + tuyereSize, size: tuyereSize })
    zAnchors.push(lance.tipZM)
  }
  if (lances.length > 0) {
    const y = lances[0].centerYM
    yZones.push({ a: y - tuyereSize / 2, b: y + tuyereSize / 2, size: tuyereSize })
  }
  if (surface != null && surface > bounds.minY && surface < bounds.maxY) {
    yZones.push({ a: surface - surfaceBandCells * h, b: surface + surfaceBandCells * h, size: h * surfaceCellRatio })
    yAnchors.push(surface)
  }
  return {
    xs: gradedAxis(bounds.minX, bounds.maxX, h, xZones, xAnchors, growthRatio),
    ys: gradedAxis(bounds.minY, bounds.maxY, h, yZones, yAnchors, growthRatio),
    zs: gradedAxis(bounds.minZ, bounds.maxZ, h, zZones, zAnchors, growthRatio),
    lances,
  }
}

function countFluidCells(domain: FluidDomain, xs: number[], ys: number[], zs: number[]): number {
  let count = 0
  for (let k = 0; k < zs.length - 1; k += 1) {
    const z = 0.5 * (zs[k] + zs[k + 1])
    for (let j = 0; j < ys.length - 1; j += 1) {
      const y = 0.5 * (ys[j] + ys[j + 1])
      for (let i = 0; i < xs.length - 1; i += 1) if (domain.contains(0.5 * (xs[i] + xs[i + 1]), y, z)) count += 1
    }
  }
  return count
}

/** 按档位反推基础尺寸，使流体单元数接近目标，再生成切割单元网格。 */
export function buildFurnaceMesh(domain: FluidDomain, options: FurnaceMeshOptions = {}): SimMesh {
  const config = options.config ?? FURNACE_SIM_CONFIG
  const target = Math.max(500, Math.round(options.targetCells ?? config.mesh.levels[options.level ?? config.mesh.defaultLevel]))
  const { bounds } = domain
  const boxVolume = (bounds.maxX - bounds.minX) * (bounds.maxY - bounds.minY) * (bounds.maxZ - bounds.minZ)
  let insideSamples = 0
  const lattice = 24
  for (let a = 0; a < lattice; a += 1) {
    for (let b = 0; b < lattice; b += 1) {
      for (let c = 0; c < lattice; c += 1) {
        if (domain.contains(
          bounds.minX + ((a + 0.5) / lattice) * (bounds.maxX - bounds.minX),
          bounds.minY + ((b + 0.5) / lattice) * (bounds.maxY - bounds.minY),
          bounds.minZ + ((c + 0.5) / lattice) * (bounds.maxZ - bounds.minZ),
        )) insideSamples += 1
      }
    }
  }
  const fluidVolume = Math.max(boxVolume * insideSamples / lattice ** 3, 1e-6)
  let h = Math.cbrt(fluidVolume / target)
  let best = { h, error: Infinity }
  for (let iteration = 0; iteration < 8; iteration += 1) {
    const axes = furnaceAxes(domain, h, options.liquidSurfaceYM, config)
    const count = countFluidCells(domain, axes.xs, axes.ys, axes.zs)
    const error = Math.abs(count / target - 1)
    if (error < best.error) best = { h, error }
    if (error < 0.03) break
    h *= Math.min(1.6, Math.max(0.6, Math.cbrt(count / target)))
  }
  h = best.h
  const axes = furnaceAxes(domain, h, options.liquidSurfaceYM, config)
  return buildSimMesh({
    xs: axes.xs,
    ys: axes.ys,
    zs: axes.zs,
    contains: domain.contains,
    lances: axes.lances,
    isOutlet: (x, y, z) => y >= domain.flueTopYM - 1e-6 && domain.inFlueFootprint(x, z),
    liquidSurfaceYM: options.liquidSurfaceYM,
    targetCells: target,
    baseSizeM: h,
    config,
  })
}
