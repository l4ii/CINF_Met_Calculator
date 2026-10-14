import { FURNACE_SIM_CONFIG, type FurnaceSimConfig } from '../../config/furnaceSimConfig.ts'
import type { SimMesh } from './mesh.ts'

/**
 * 后处理：单元场按体积加权插值到网格节点，之后统一三线性插值。
 * 等值面为非均匀结构网格上的 Marching Cubes，三角化规则由立方体各面的交点配对程序生成
 * （歧义面一律分隔内侧角点），相邻单元共享面上的判定一致，曲面无缝。
 */

export type PostScalar = 'alpha' | 'speed' | 'k' | 'pressure'
export type SliceAxis = 'x' | 'y' | 'z'

export type PostSliceRequest = {
  id: string
  axis: SliceAxis
  /** 网格绝对坐标 m */
  positionM: number
  field: PostScalar
}

export type PostRequest = {
  iso: boolean
  /** 液相体积分数等值面阈值，直接取 α */
  isoAlpha: number
  streamlines: boolean
  slices: PostSliceRequest[]
}

/** 回放时锁定色标范围，避免逐帧重算分位数导致颜色跳动 */
export type ScalarRanges = Partial<Record<PostScalar, [number, number]>>

export type PostCellFields = {
  alpha: ArrayLike<number>
  uc: ArrayLike<number>
  vc: ArrayLike<number>
  wc: ArrayLike<number>
  k: ArrayLike<number>
  /** 静压 Pa */
  pressure: ArrayLike<number>
}

export type PostLegend = { label: string; unit: string; min: number; max: number }

export type PostIso = {
  positions: Float32Array
  normals: Float32Array
  colors: Float32Array
  indices: Uint32Array
  label: string
  unit: string
  value: number
}

export type PostLines = { positions: Float32Array; colors: Float32Array }
export type PostSlice = {
  id: string
  field: PostScalar
  positions: Float32Array
  colors: Float32Array
  indices: Uint32Array
}

export type PostGeometry = {
  iso: PostIso | null
  lines: PostLines | null
  slices: PostSlice[]
  legends: PostLegend[]
}

const SCALAR_INFO: Record<PostScalar, { label: string; unit: string }> = {
  alpha: { label: '液相体积分数 LVF', unit: '' },
  speed: { label: '速度', unit: 'm/s' },
  k: { label: '湍动能 k', unit: 'm²/s²' },
  pressure: { label: '静压', unit: 'kPa' },
}

// ---------- 色图 ----------

/** Google Turbo 多项式近似，输入 0～1，输出 sRGB 0～1 */
export function turbo(t: number): [number, number, number] {
  const x = Math.min(1, Math.max(0, t))
  const x2 = x * x
  const x3 = x2 * x
  const x4 = x2 * x2
  const x5 = x4 * x
  const r = 0.13572138 + 4.6153926 * x - 42.66032258 * x2 + 132.13108234 * x3 - 152.94239396 * x4 + 59.28637943 * x5
  const g = 0.09140261 + 2.19418839 * x + 4.84296658 * x2 - 14.18503333 * x3 + 4.27729857 * x4 + 2.82956604 * x5
  const b = 0.1066733 + 12.64194608 * x - 60.58204836 * x2 + 110.36276771 * x3 - 89.90310912 * x4 + 27.34824973 * x5
  return [Math.min(1, Math.max(0, r)), Math.min(1, Math.max(0, g)), Math.min(1, Math.max(0, b))]
}

function srgbToLinear(value: number): number {
  return value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4)
}

/** 等值面默认单色，sRGB 浅蓝转到 three.js 使用的线性顶点色 */
const SOLID_ISO_COLOR = new Float32Array([
  srgbToLinear(0x38 / 255),
  srgbToLinear(0xbd / 255),
  srgbToLinear(0xf8 / 255),
])

/** 预先算好的线性空间色表，three.js 顶点色按线性空间解释 */
const TURBO_LINEAR = (() => {
  const table = new Float32Array(256 * 3)
  for (let index = 0; index < 256; index += 1) {
    const [r, g, b] = turbo(index / 255)
    table[index * 3] = srgbToLinear(r)
    table[index * 3 + 1] = srgbToLinear(g)
    table[index * 3 + 2] = srgbToLinear(b)
  }
  return table
})()

function writeColor(out: Float32Array, offset: number, value: number, min: number, max: number) {
  const t = max > min ? (value - min) / (max - min) : 0.5
  const index = Math.min(255, Math.max(0, Math.round(t * 255))) * 3
  out[offset] = TURBO_LINEAR[index]
  out[offset + 1] = TURBO_LINEAR[index + 1]
  out[offset + 2] = TURBO_LINEAR[index + 2]
}

// ---------- 节点场 ----------

type NodeGrid = {
  nnx: number
  nny: number
  nnz: number
  weight: Float64Array
}

function nodeGrid(mesh: SimMesh): NodeGrid {
  const { nx, ny, nz, vol } = mesh
  const nnx = nx + 1
  const nny = ny + 1
  const nnz = nz + 1
  const weight = new Float64Array(nnx * nny * nnz)
  for (let k = 0; k < nz; k += 1) {
    for (let j = 0; j < ny; j += 1) {
      for (let i = 0; i < nx; i += 1) {
        const V = vol[i + nx * (j + ny * k)]
        if (!(V > 0)) continue
        const n0 = i + nnx * (j + nny * k)
        weight[n0] += V
        weight[n0 + 1] += V
        weight[n0 + nnx] += V
        weight[n0 + nnx + 1] += V
        const n1 = n0 + nnx * nny
        weight[n1] += V
        weight[n1 + 1] += V
        weight[n1 + nnx] += V
        weight[n1 + nnx + 1] += V
      }
    }
  }
  return { nnx, nny, nnz, weight }
}

function toNodes(mesh: SimMesh, grid: NodeGrid, cell: (c: number) => number): Float64Array {
  const { nx, ny, nz, vol } = mesh
  const { nnx, nny, weight } = grid
  const out = new Float64Array(weight.length)
  for (let k = 0; k < nz; k += 1) {
    for (let j = 0; j < ny; j += 1) {
      for (let i = 0; i < nx; i += 1) {
        const c = i + nx * (j + ny * k)
        const V = vol[c]
        if (!(V > 0)) continue
        const value = cell(c) * V
        const n0 = i + nnx * (j + nny * k)
        out[n0] += value
        out[n0 + 1] += value
        out[n0 + nnx] += value
        out[n0 + nnx + 1] += value
        const n1 = n0 + nnx * nny
        out[n1] += value
        out[n1 + 1] += value
        out[n1 + nnx] += value
        out[n1 + nnx + 1] += value
      }
    }
  }
  for (let n = 0; n < out.length; n += 1) out[n] = weight[n] > 0 ? out[n] / weight[n] : 0
  return out
}

function percentileRange(mesh: SimMesh, cell: (c: number) => number, low: number, high: number): [number, number] {
  const samples: number[] = []
  const stride = Math.max(1, Math.floor(mesh.cellCount / 40_000))
  for (let c = 0; c < mesh.cellCount; c += stride) if (mesh.vf[c] > 0) samples.push(cell(c))
  if (samples.length === 0) return [0, 1]
  samples.sort((a, b) => a - b)
  const pick = (q: number) => samples[Math.min(samples.length - 1, Math.max(0, Math.round(q * (samples.length - 1))))]
  const lo = pick(low)
  const hi = pick(high)
  return hi > lo ? [lo, hi] : [lo, lo + Math.max(Math.abs(lo) * 0.01, 1e-9)]
}

// ---------- Marching Cubes 规则 ----------

const CORNER_BITS: ReadonlyArray<readonly [number, number, number]> = Array.from({ length: 8 }, (_, c) => [c & 1, (c >> 1) & 1, (c >> 2) & 1] as const)

/** 12 条棱：axis·4 + m，端点为仅在 axis 位不同的两个角点 */
const EDGES: ReadonlyArray<readonly [number, number, number]> = (() => {
  const list: Array<[number, number, number]> = []
  for (let axis = 0; axis < 3; axis += 1) {
    for (let c = 0; c < 8; c += 1) {
      if ((c >> axis) & 1) continue
      list.push([c, c | (1 << axis), axis])
    }
  }
  return list
})()

function edgeBetween(a: number, b: number): number {
  return EDGES.findIndex(([p, q]) => (p === a && q === b) || (p === b && q === a))
}

/** 六个面，角点按外法向逆时针排列 */
const FACES: number[][] = (() => {
  const faces: number[][] = []
  for (let axis = 0; axis < 3; axis += 1) {
    for (const side of [0, 1]) {
      const corners = [0, 1, 2, 3, 4, 5, 6, 7].filter((c) => ((c >> axis) & 1) === side)
      const u = (axis + 1) % 3
      const v = (axis + 2) % 3
      const angle = (c: number) => Math.atan2(CORNER_BITS[c][v] - 0.5, CORNER_BITS[c][u] - 0.5)
      corners.sort((a, b) => angle(a) - angle(b))
      // (u, v, axis) 为右手系，按 u→v 角度递增即绕 +axis 逆时针；负侧面需要反向
      if (side === 0) corners.reverse()
      faces.push(corners)
    }
  }
  return faces
})()

/** 每种角点状态对应的三角形，元素为棱编号，三个一组 */
const CASE_TRIANGLES: number[][] = (() => {
  const table: number[][] = []
  for (let mask = 0; mask < 256; mask += 1) {
    const inside = (c: number) => ((mask >> c) & 1) === 1
    const next = new Map<number, number>()
    for (const face of FACES) {
      const crossings: Array<{ edge: number; entering: boolean }> = []
      for (let index = 0; index < 4; index += 1) {
        const a = face[index]
        const b = face[(index + 1) % 4]
        if (inside(a) !== inside(b)) crossings.push({ edge: edgeBetween(a, b), entering: !inside(a) })
      }
      for (let index = 0; index < crossings.length; index += 1) {
        if (!crossings[index].entering) continue
        const exit = crossings[(index + 1) % crossings.length]
        next.set(crossings[index].edge, exit.edge)
      }
    }
    const triangles: number[] = []
    const used = new Set<number>()
    for (const start of next.keys()) {
      if (used.has(start)) continue
      const loop: number[] = []
      let edge = start
      while (!used.has(edge)) {
        used.add(edge)
        loop.push(edge)
        const following = next.get(edge)
        if (following == null) break
        edge = following
      }
      for (let index = 1; index + 1 < loop.length; index += 1) triangles.push(loop[0], loop[index], loop[index + 1])
    }
    table.push(triangles)
  }
  return table
})()

type IsoOptions = {
  values: Float64Array
  iso: number
  colorValues: Float64Array
  colorMin: number
  colorMax: number
  solidColor?: Float32Array
}

function extractIso(mesh: SimMesh, grid: NodeGrid, options: IsoOptions): Omit<PostIso, 'label' | 'unit' | 'value'> {
  const { nx, ny, nz, xs, ys, zs, vf } = mesh
  const { nnx, nny, nnz, weight } = grid
  const { values, iso, colorValues, colorMin, colorMax, solidColor } = options
  const edgeVertex = new Int32Array(weight.length * 3).fill(-1)
  const positions: number[] = []
  const normals: number[] = []
  const colors: number[] = []
  const indices: number[] = []
  const node = (i: number, j: number, k: number) => i + nnx * (j + nny * k)
  const gradientAt = (i: number, j: number, k: number, out: number[]) => {
    const n = node(i, j, k)
    const component = (axis: Float64Array, index: number, count: number, stride: number) => {
      const plus = index + 1 < count && weight[n + stride] > 0
      const minus = index > 0 && weight[n - stride] > 0
      if (plus && minus) return (values[n + stride] - values[n - stride]) / (axis[index + 1] - axis[index - 1])
      if (plus) return (values[n + stride] - values[n]) / (axis[index + 1] - axis[index])
      if (minus) return (values[n] - values[n - stride]) / (axis[index] - axis[index - 1])
      return 0
    }
    out[0] = component(xs, i, nnx, 1)
    out[1] = component(ys, j, nny, nnx)
    out[2] = component(zs, k, nnz, nnx * nny)
  }
  const g0 = [0, 0, 0]
  const g1 = [0, 0, 0]
  const colorScratch = new Float32Array(3)
  const cornerNodes = new Int32Array(8)
  const cornerValues = new Float64Array(8)
  const localVertex = new Int32Array(12)
  for (let k = 0; k < nz; k += 1) {
    for (let j = 0; j < ny; j += 1) {
      for (let i = 0; i < nx; i += 1) {
        if (vf[i + nx * (j + ny * k)] <= 0) continue
        let mask = 0
        let valid = true
        for (let c = 0; c < 8; c += 1) {
          const [bx, by, bz] = CORNER_BITS[c]
          const n = node(i + bx, j + by, k + bz)
          if (!(weight[n] > 0)) {
            valid = false
            break
          }
          cornerNodes[c] = n
          cornerValues[c] = values[n]
          if (values[n] >= iso) mask |= 1 << c
        }
        if (!valid || mask === 0 || mask === 255) continue
        const triangles = CASE_TRIANGLES[mask]
        localVertex.fill(-1)
        for (const edge of triangles) {
          if (localVertex[edge] >= 0) continue
          const [ca, cb, axis] = EDGES[edge]
          const [ax, ay, az] = CORNER_BITS[ca]
          const key = cornerNodes[ca] * 3 + axis
          let vertex = edgeVertex[key]
          if (vertex < 0) {
            const va = cornerValues[ca]
            const vb = cornerValues[cb]
            const t = Math.abs(vb - va) > 1e-30 ? Math.min(1, Math.max(0, (iso - va) / (vb - va))) : 0.5
            const [bx, by, bz] = CORNER_BITS[cb]
            const x0 = xs[i + ax]
            const y0 = ys[j + ay]
            const z0 = zs[k + az]
            positions.push(x0 + t * (xs[i + bx] - x0), y0 + t * (ys[j + by] - y0), z0 + t * (zs[k + bz] - z0))
            gradientAt(i + ax, j + ay, k + az, g0)
            gradientAt(i + bx, j + by, k + bz, g1)
            let gx = -(g0[0] + t * (g1[0] - g0[0]))
            let gy = -(g0[1] + t * (g1[1] - g0[1]))
            let gz = -(g0[2] + t * (g1[2] - g0[2]))
            const length = Math.hypot(gx, gy, gz)
            if (length > 1e-30) {
              gx /= length
              gy /= length
              gz /= length
            } else {
              gx = 0
              gy = 1
              gz = 0
            }
            normals.push(gx, gy, gz)
            if (solidColor) {
              colors.push(solidColor[0], solidColor[1], solidColor[2])
            } else {
              const color = colorValues[cornerNodes[ca]] + t * (colorValues[cornerNodes[cb]] - colorValues[cornerNodes[ca]])
              writeColor(colorScratch, 0, color, colorMin, colorMax)
              colors.push(colorScratch[0], colorScratch[1], colorScratch[2])
            }
            vertex = positions.length / 3 - 1
            edgeVertex[key] = vertex
          }
          localVertex[edge] = vertex
        }
        for (let t = 0; t < triangles.length; t += 3) {
          const a = localVertex[triangles[t]]
          const b = localVertex[triangles[t + 1]]
          const c = localVertex[triangles[t + 2]]
          if (a === b || b === c || a === c) continue
          // 绕向与法线一致，背面光照才正确
          const ux = positions[b * 3] - positions[a * 3]
          const uy = positions[b * 3 + 1] - positions[a * 3 + 1]
          const uz = positions[b * 3 + 2] - positions[a * 3 + 2]
          const vx = positions[c * 3] - positions[a * 3]
          const vy = positions[c * 3 + 1] - positions[a * 3 + 1]
          const vz = positions[c * 3 + 2] - positions[a * 3 + 2]
          const nx3 = uy * vz - uz * vy
          const ny3 = uz * vx - ux * vz
          const nz3 = ux * vy - uy * vx
          const dot = nx3 * (normals[a * 3] + normals[b * 3] + normals[c * 3])
            + ny3 * (normals[a * 3 + 1] + normals[b * 3 + 1] + normals[c * 3 + 1])
            + nz3 * (normals[a * 3 + 2] + normals[b * 3 + 2] + normals[c * 3 + 2])
          if (dot >= 0) indices.push(a, b, c)
          else indices.push(a, c, b)
        }
      }
    }
  }
  return {
    positions: Float32Array.from(positions),
    normals: Float32Array.from(normals),
    colors: Float32Array.from(colors),
    indices: Uint32Array.from(indices),
  }
}

/** 等值面总面积，测试用 */
export function isoArea(iso: Pick<PostIso, 'positions' | 'indices'>): number {
  const { positions: p, indices } = iso
  let area = 0
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t] * 3
    const b = indices[t + 1] * 3
    const c = indices[t + 2] * 3
    const ux = p[b] - p[a]
    const uy = p[b + 1] - p[a + 1]
    const uz = p[b + 2] - p[a + 2]
    const vx = p[c] - p[a]
    const vy = p[c + 1] - p[a + 1]
    const vz = p[c + 2] - p[a + 2]
    area += 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx)
  }
  return area
}

// ---------- 流线 ----------

function locate(axis: Float64Array, value: number): number {
  let lo = 0
  let hi = axis.length - 2
  if (value <= axis[0]) return 0
  if (value >= axis[axis.length - 1]) return axis.length - 2
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (axis[mid] <= value) lo = mid
    else hi = mid - 1
  }
  return lo
}

type VelocityNodes = { u: Float64Array; v: Float64Array; w: Float64Array }

function sampleVelocity(mesh: SimMesh, grid: NodeGrid, nodes: VelocityNodes, x: number, y: number, z: number, out: number[]): boolean {
  const { xs, ys, zs, nx, ny, nz, vf } = mesh
  if (x < xs[0] || x > xs[nx] || y < ys[0] || y > ys[ny] || z < zs[0] || z > zs[nz]) return false
  const i = locate(xs, x)
  const j = locate(ys, y)
  const k = locate(zs, z)
  if (vf[i + nx * (j + ny * k)] <= 0) return false
  const tx = (x - xs[i]) / (xs[i + 1] - xs[i])
  const ty = (y - ys[j]) / (ys[j + 1] - ys[j])
  const tz = (z - zs[k]) / (zs[k + 1] - zs[k])
  const { nnx, nny, weight } = grid
  let u = 0
  let v = 0
  let w = 0
  let total = 0
  for (let c = 0; c < 8; c += 1) {
    const bx = c & 1
    const by = (c >> 1) & 1
    const bz = (c >> 2) & 1
    const n = i + bx + nnx * (j + by + nny * (k + bz))
    if (!(weight[n] > 0)) continue
    const factor = (bx ? tx : 1 - tx) * (by ? ty : 1 - ty) * (bz ? tz : 1 - tz)
    u += factor * nodes.u[n]
    v += factor * nodes.v[n]
    w += factor * nodes.w[n]
    total += factor
  }
  if (!(total > 1e-9)) return false
  out[0] = u / total
  out[1] = v / total
  out[2] = w / total
  return true
}

/** RK4 沿速度方向按弧长积分。direction 为 ±1。 */
export function traceStreamline(mesh: SimMesh, grid: NodeGrid, nodes: VelocityNodes, seed: [number, number, number], direction: number, maxSteps: number, stepRatio: number): number[] {
  const points: number[] = [seed[0], seed[1], seed[2]]
  const k1 = [0, 0, 0]
  const k2 = [0, 0, 0]
  const k3 = [0, 0, 0]
  const k4 = [0, 0, 0]
  let x = seed[0]
  let y = seed[1]
  let z = seed[2]
  const unit = (vector: number[]) => {
    const length = Math.hypot(vector[0], vector[1], vector[2])
    if (!(length > 1e-5)) return false
    vector[0] = (direction * vector[0]) / length
    vector[1] = (direction * vector[1]) / length
    vector[2] = (direction * vector[2]) / length
    return true
  }
  for (let step = 0; step < maxSteps; step += 1) {
    const i = locate(mesh.xs, x)
    const j = locate(mesh.ys, y)
    const kk = locate(mesh.zs, z)
    const h = stepRatio * Math.min(mesh.dx[i], mesh.dy[j], mesh.dz[kk])
    if (!sampleVelocity(mesh, grid, nodes, x, y, z, k1) || !unit(k1)) break
    if (!sampleVelocity(mesh, grid, nodes, x + 0.5 * h * k1[0], y + 0.5 * h * k1[1], z + 0.5 * h * k1[2], k2) || !unit(k2)) break
    if (!sampleVelocity(mesh, grid, nodes, x + 0.5 * h * k2[0], y + 0.5 * h * k2[1], z + 0.5 * h * k2[2], k3) || !unit(k3)) break
    if (!sampleVelocity(mesh, grid, nodes, x + h * k3[0], y + h * k3[1], z + h * k3[2], k4) || !unit(k4)) break
    x += (h / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0])
    y += (h / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1])
    z += (h / 6) * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2])
    points.push(x, y, z)
  }
  return points
}

function streamlineSeeds(mesh: SimMesh, alpha: ArrayLike<number>, config: FurnaceSimConfig): Array<{ point: [number, number, number]; both: boolean }> {
  const seeds: Array<{ point: [number, number, number]; both: boolean }> = []
  const { nx, ny, zc } = mesh
  const seenLance = new Set<number>()
  for (const inlet of mesh.inlets) {
    if (seenLance.has(inlet.lance)) continue
    seenLance.add(inlet.lance)
    const lance = mesh.lances[inlet.lance]
    if (!lance.open) continue
    const c = inlet.cell
    const i = c % nx
    const j = Math.floor(c / nx) % ny
    const k = Math.floor(c / (nx * ny))
    const count = Math.max(1, config.post.seedsPerTuyere)
    for (let s = 0; s < count; s += 1) {
      const angle = (2 * Math.PI * s) / count
      const radius = s === 0 ? 0 : 0.35 * Math.min(mesh.dx[i], mesh.dy[j])
      seeds.push({ point: [lance.centerXM + radius * Math.cos(angle), lance.centerYM + radius * Math.sin(angle), zc[k]], both: false })
    }
  }
  const liquid: number[] = []
  for (let c = 0; c < mesh.cellCount; c += 1) if (mesh.vf[c] > 0 && alpha[c] > 0.5) liquid.push(c)
  let state = 12345
  const random = () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff
    return state / 0x7fffffff
  }
  const target = Math.min(config.post.bathSeeds, liquid.length)
  for (let s = 0; s < target; s += 1) {
    const c = liquid[Math.floor(random() * liquid.length)]
    const i = c % nx
    const j = Math.floor(c / nx) % ny
    const k = Math.floor(c / (nx * ny))
    seeds.push({
      point: [mesh.xs[i] + random() * mesh.dx[i], mesh.ys[j] + random() * mesh.dy[j], mesh.zs[k] + random() * mesh.dz[k]],
      both: true,
    })
  }
  return seeds
}

// ---------- 截面 ----------

function buildSlice(mesh: SimMesh, grid: NodeGrid, request: PostSliceRequest, values: Float64Array, min: number, max: number): PostSlice | null {
  const { nnx, nny, weight } = grid
  const axes = [mesh.xs, mesh.ys, mesh.zs]
  const counts = [mesh.nx, mesh.ny, mesh.nz]
  const a = request.axis === 'x' ? 0 : request.axis === 'y' ? 1 : 2
  const b = (a + 1) % 3
  const c = (a + 2) % 3
  const along = axes[a]
  let plane = 0
  for (let index = 1; index < along.length; index += 1) if (Math.abs(along[index] - request.positionM) < Math.abs(along[plane] - request.positionM)) plane = index
  const nb = counts[b] + 1
  const nc = counts[c] + 1
  const nodeAt = (ib: number, ic: number) => {
    const coord = [0, 0, 0]
    coord[a] = plane
    coord[b] = ib
    coord[c] = ic
    return coord[0] + nnx * (coord[1] + nny * coord[2])
  }
  const cellFluid = (ib: number, ic: number, offset: number) => {
    const coord = [0, 0, 0]
    coord[a] = plane + offset
    coord[b] = ib
    coord[c] = ic
    if (coord[a] < 0 || coord[a] >= counts[a]) return false
    return mesh.vf[coord[0] + mesh.nx * (coord[1] + mesh.ny * coord[2])] > 0
  }
  const positions = new Float32Array(nb * nc * 3)
  const colors = new Float32Array(nb * nc * 3)
  for (let ic = 0; ic < nc; ic += 1) {
    for (let ib = 0; ib < nb; ib += 1) {
      const vertex = ib + nb * ic
      const coord = [0, 0, 0]
      coord[a] = along[plane]
      coord[b] = axes[b][ib]
      coord[c] = axes[c][ic]
      positions[vertex * 3] = coord[0]
      positions[vertex * 3 + 1] = coord[1]
      positions[vertex * 3 + 2] = coord[2]
      writeColor(colors, vertex * 3, values[nodeAt(ib, ic)], min, max)
    }
  }
  const indices: number[] = []
  for (let ic = 0; ic < nc - 1; ic += 1) {
    for (let ib = 0; ib < nb - 1; ib += 1) {
      if (!cellFluid(ib, ic, 0) && !cellFluid(ib, ic, -1)) continue
      const n00 = nodeAt(ib, ic)
      const n10 = nodeAt(ib + 1, ic)
      const n01 = nodeAt(ib, ic + 1)
      const n11 = nodeAt(ib + 1, ic + 1)
      if (!(weight[n00] > 0 && weight[n10] > 0 && weight[n01] > 0 && weight[n11] > 0)) continue
      const v00 = ib + nb * ic
      indices.push(v00, v00 + 1, v00 + nb + 1, v00, v00 + nb + 1, v00 + nb)
    }
  }
  if (indices.length === 0) return null
  return { id: request.id, field: request.field, positions, colors, indices: Uint32Array.from(indices) }
}

// ---------- 入口 ----------

function cellScalars(fields: PostCellFields): Record<PostScalar, (c: number) => number> {
  const speed = (c: number) => Math.hypot(fields.uc[c], fields.vc[c], fields.wc[c])
  return {
    alpha: (c) => fields.alpha[c],
    speed,
    k: (c) => fields.k[c],
    pressure: (c) => fields.pressure[c] / 1000,
  }
}

function rangeFor(mesh: SimMesh, scalar: PostScalar, read: (c: number) => number): [number, number] {
  if (scalar === 'alpha') return [0, 1]
  const full = scalar === 'pressure'
  return percentileRange(mesh, read, full ? 0 : 0.01, full ? 1 : 0.99)
}

/** 当前场的色标范围。回放时对末帧调用一次，之后各帧共用。 */
export function scalarRanges(mesh: SimMesh, fields: PostCellFields): Record<PostScalar, [number, number]> {
  const read = cellScalars(fields)
  return {
    alpha: rangeFor(mesh, 'alpha', read.alpha),
    speed: rangeFor(mesh, 'speed', read.speed),
    k: rangeFor(mesh, 'k', read.k),
    pressure: rangeFor(mesh, 'pressure', read.pressure),
  }
}

export type PostContext = {
  mesh: SimMesh
  fields: PostCellFields
  grid: NodeGrid
  fixedRanges?: ScalarRanges
  cellScalar: Record<PostScalar, (c: number) => number>
  ranges: Map<PostScalar, [number, number]>
  nodes: Map<PostScalar, Float64Array>
  velocity: { u: Float64Array; v: Float64Array; w: Float64Array } | null
}

/** 节点网格立即建立；节点值和色标范围在第一次用到时计算并缓存。 */
export function createPostContext(mesh: SimMesh, fields: PostCellFields, fixedRanges?: ScalarRanges): PostContext {
  return {
    mesh,
    fields,
    grid: nodeGrid(mesh),
    fixedRanges,
    cellScalar: cellScalars(fields),
    ranges: new Map(),
    nodes: new Map(),
    velocity: null,
  }
}

function contextRange(ctx: PostContext, scalar: PostScalar): [number, number] {
  const fixed = ctx.fixedRanges?.[scalar]
  if (fixed) return fixed
  const cached = ctx.ranges.get(scalar)
  if (cached) return cached
  const range = rangeFor(ctx.mesh, scalar, ctx.cellScalar[scalar])
  ctx.ranges.set(scalar, range)
  return range
}

function contextNodes(ctx: PostContext, scalar: PostScalar): Float64Array {
  const cached = ctx.nodes.get(scalar)
  if (cached) return cached
  const values = toNodes(ctx.mesh, ctx.grid, ctx.cellScalar[scalar])
  ctx.nodes.set(scalar, values)
  return values
}

function contextVelocity(ctx: PostContext) {
  if (ctx.velocity) return ctx.velocity
  const { mesh, grid, fields } = ctx
  ctx.velocity = {
    u: toNodes(mesh, grid, (c) => fields.uc[c]),
    v: toNodes(mesh, grid, (c) => fields.vc[c]),
    w: toNodes(mesh, grid, (c) => fields.wc[c]),
  }
  return ctx.velocity
}

export function buildIsoSurface(ctx: PostContext, isoAlpha: number): PostIso | null {
  const value = Math.min(0.98, Math.max(0.02, isoAlpha))
  const surface = extractIso(ctx.mesh, ctx.grid, {
    values: contextNodes(ctx, 'alpha'),
    iso: value,
    colorValues: contextNodes(ctx, 'alpha'),
    colorMin: 0,
    colorMax: 1,
    solidColor: SOLID_ISO_COLOR,
  })
  if (surface.indices.length === 0) return null
  return { ...surface, label: 'LVF', unit: '', value }
}

export function buildStreamlines(ctx: PostContext, config: FurnaceSimConfig = FURNACE_SIM_CONFIG): PostLines | null {
  const velocity = contextVelocity(ctx)
  const [min, max] = contextRange(ctx, 'speed')
  const segments: number[] = []
  const segmentColors: number[] = []
  const sample = [0, 0, 0]
  const color = new Float32Array(3)
  const pushLine = (points: number[]) => {
    for (let p = 0; p + 5 < points.length; p += 3) {
      segments.push(points[p], points[p + 1], points[p + 2], points[p + 3], points[p + 4], points[p + 5])
      for (let end = 0; end < 2; end += 1) {
        const offset = p + end * 3
        const ok = sampleVelocity(ctx.mesh, ctx.grid, velocity, points[offset], points[offset + 1], points[offset + 2], sample)
        writeColor(color, 0, ok ? Math.hypot(sample[0], sample[1], sample[2]) : min, min, max)
        segmentColors.push(color[0], color[1], color[2])
      }
    }
  }
  const { streamlineMaxSteps, streamlineStepRatio } = config.post
  for (const seed of streamlineSeeds(ctx.mesh, ctx.fields.alpha, config)) {
    pushLine(traceStreamline(ctx.mesh, ctx.grid, velocity, seed.point, 1, streamlineMaxSteps, streamlineStepRatio))
    if (seed.both) pushLine(traceStreamline(ctx.mesh, ctx.grid, velocity, seed.point, -1, streamlineMaxSteps, streamlineStepRatio))
  }
  if (segments.length === 0) return null
  return { positions: Float32Array.from(segments), colors: Float32Array.from(segmentColors) }
}

export function buildSlices(ctx: PostContext, slices: PostSliceRequest[]): PostSlice[] {
  const built: PostSlice[] = []
  for (const slice of slices) {
    const [min, max] = contextRange(ctx, slice.field)
    const geometry = buildSlice(ctx.mesh, ctx.grid, slice, contextNodes(ctx, slice.field), min, max)
    if (geometry) built.push(geometry)
  }
  return built
}

export function postLegends(ctx: PostContext, request: PostRequest): PostLegend[] {
  const legends: PostLegend[] = []
  const add = (scalar: PostScalar) => {
    const info = SCALAR_INFO[scalar]
    if (legends.some((item) => item.label === info.label)) return
    const [min, max] = contextRange(ctx, scalar)
    legends.push({ label: info.label, unit: info.unit, min, max })
  }
  if (request.streamlines) add('speed')
  for (const slice of request.slices) add(slice.field)
  return legends
}

export function buildPostGeometry(mesh: SimMesh, fields: PostCellFields, request: PostRequest, config: FurnaceSimConfig = FURNACE_SIM_CONFIG, fixedRanges?: ScalarRanges): PostGeometry {
  const ctx = createPostContext(mesh, fields, fixedRanges)
  return {
    iso: request.iso ? buildIsoSurface(ctx, request.isoAlpha) : null,
    lines: request.streamlines ? buildStreamlines(ctx, config) : null,
    slices: buildSlices(ctx, request.slices),
    legends: postLegends(ctx, request),
  }
}

/** 测试与外部构造用：节点网格与速度节点场 */
export function velocityNodes(mesh: SimMesh, fields: Pick<PostCellFields, 'uc' | 'vc' | 'wc'>) {
  const grid = nodeGrid(mesh)
  return { grid, nodes: { u: toNodes(mesh, grid, (c) => fields.uc[c]), v: toNodes(mesh, grid, (c) => fields.vc[c]), w: toNodes(mesh, grid, (c) => fields.wc[c]) } }
}
