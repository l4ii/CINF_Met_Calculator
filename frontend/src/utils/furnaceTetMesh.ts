import type { FluidDomain, FluidLance } from './furnaceFluidDomain.ts'

/** 用户可填的四面体数量。未指定时测试和旧调用仍用较小默认值。 */
export const MIN_TARGET_TET_COUNT = 5_000
export const DEFAULT_TARGET_TET_COUNT = 300_000
export const MAX_TET_COUNT = 1_000_000

export function clampTargetTetCount(value: number | undefined, fallback = 50_000): number {
  const source = Number.isFinite(value) ? Number(value) : fallback
  return Math.round(Math.min(MAX_TET_COUNT, Math.max(MIN_TARGET_TET_COUNT, source)))
}

export type TetMeshOptions = {
  /** 目标四面体数量，5 千到 100 万。 */
  targetTetCount?: number
  /** 液面绝对标高。给出时把内部网格面贴到该高度，初始液面不再被粗格子斜切。 */
  liquidSurfaceYM?: number
}

const KIND_WALL = 0
const KIND_INLET = 1
const KIND_OUTLET = 2

export type TetMesh = {
  tetCount: number
  centroids: Float32Array
  volumes: Float32Array
  /** 每个四面体 4 个邻单元，-1 表示边界 */
  neighbors: Int32Array
  faceArea: Float32Array
  faceNx: Float32Array
  faceNy: Float32Array
  faceNz: Float32Array
  faceDist: Float32Array
  faceKind: Uint8Array
  faceInlet: Int16Array
  boundaryCount: number
  boundaryKind: Uint8Array
  boundaryCentroid: Float32Array
  inletCount: number
  outletCount: number
  lanceInwardZ: Float32Array
  /** 每根喷枪的圆面积 m²，用来把折算速度换成体积流量 */
  lanceAreaM2: Float32Array
  nadirYM: number
  /** 内部六面体棱线，两点一段。只在建网格时生成。 */
  wirePositions: Float32Array
  cellSizeM: number
  /** 风口、液面、熔池、气相实际采用的特征边长 m。 */
  zoneSizeM: { tuyereM: number; surfaceM: number; bathM: number; gasM: number }
  minSpacingM: number
  minX: number
  maxX: number
  minY: number
  maxY: number
  minZ: number
  maxZ: number
}

type Axis = number[]

function meshBudget(targetTetCount: number): { maxHexes: number; minCellM: number } {
  const target = clampTargetTetCount(targetTetCount)
  const minCellM = target >= 800_000 ? 0.008 : target >= 300_000 ? 0.012 : target >= 100_000 ? 0.02 : 0.04
  return { maxHexes: Math.max(1, Math.floor(target / 12)), minCellM }
}

export type MeshZoneSize = { tuyereM: number; surfaceM: number; bathM: number; gasM: number }

/** 按目标四面体数量反推基础网格尺寸。 */
function resolveCellSize(dx: number, dy: number, dz: number, flueHeightM: number, targetTetCount: number): number {
  const { maxHexes, minCellM } = meshBudget(targetTetCount)
  let h = Math.cbrt((dx * dy * dz) / Math.max(maxHexes, 1))
  const flueH = Math.max(flueHeightM, 0.2)
  const upper = Math.min(0.7, Math.max(flueH * 0.85, minCellM), Math.max(dz / 4, minCellM))
  h = Math.min(Math.max(h, minCellM), upper)
  const hexesAt = (size: number) => Math.max(1, Math.round(dx / size)) * Math.max(1, Math.round(dy / size)) * Math.max(1, Math.round(dz / size))
  while (hexesAt(h) > maxHexes && h < 1.4) h *= 1.1
  return h
}

/** 按炉体外框估算四面体数量。目标越大，估算越大，且不超过 100 万。 */
export function estimateTetCount(bounds: { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number }, flueHeightM: number, targetTetCount: number): number {
  const target = clampTargetTetCount(targetTetCount)
  const { maxHexes } = meshBudget(target)
  const dx = Math.max(bounds.maxX - bounds.minX, 0.2)
  const dy = Math.max(bounds.maxY - bounds.minY, 0.2)
  const dz = Math.max(bounds.maxZ - bounds.minZ, 0.2)
  const h = resolveCellSize(dx, dy, dz, flueHeightM, target)
  const hexes = Math.max(1, Math.round(dx / h)) * Math.max(1, Math.round(dy / h)) * Math.max(1, Math.round(dz / h))
  return Math.max(1, Math.min(target, Math.round(Math.min(hexes, maxHexes) * 5 * 0.72)))
}

export function buildTetMesh(domain: FluidDomain, options: TetMeshOptions = {}): TetMesh {
  const targetTetCount = clampTargetTetCount(options.targetTetCount, 50_000)
  const { xs, ys, zs, cellSizeM, zoneSizeM } = buildAxes(domain, targetTetCount, options.liquidSurfaceYM)
  const vertices: number[] = []
  const vertexKey = new Map<string, number>()
  const tetVerts: number[] = []
  const addVertex = (x: number, y: number, z: number) => {
    const key = `${Math.round(x * 1e5)},${Math.round(y * 1e5)},${Math.round(z * 1e5)}`
    const existing = vertexKey.get(key)
    if (existing != null) return existing
    const id = vertices.length / 3
    vertices.push(x, y, z)
    vertexKey.set(key, id)
    return id
  }

  const wire: number[] = []
  const wireKeys = new Set<string>()
  const addWire = (ax: number, ay: number, az: number, bx: number, by: number, bz: number) => {
    const ka = `${Math.round(ax * 1e4)},${Math.round(ay * 1e4)},${Math.round(az * 1e4)}`
    const kb = `${Math.round(bx * 1e4)},${Math.round(by * 1e4)},${Math.round(bz * 1e4)}`
    const key = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`
    if (wireKeys.has(key)) return
    wireKeys.add(key)
    wire.push(ax, ay, az, bx, by, bz)
  }
  const gridHexes = Math.max(1, (xs.length - 1) * (ys.length - 1) * (zs.length - 1))
  const wireStride = Math.max(1, Math.ceil(gridHexes / 8_000))
  let hexSerial = 0
  let minSpacing = Infinity
  const refineN = lanceRefineMap(xs, ys, zs, domain, zoneSizeM.tuyereM)
  for (let i = 0; i < xs.length - 1; i += 1) {
    for (let j = 0; j < ys.length - 1; j += 1) {
      for (let k = 0; k < zs.length - 1; k += 1) {
        const x0 = xs[i]
        const x1 = xs[i + 1]
        const y0 = ys[j]
        const y1 = ys[j + 1]
        const z0 = zs[k]
        const z1 = zs[k + 1]
        if (Math.max(x1 - x0, y1 - y0, z1 - z0) < 1e-5) continue
        const cx = (x0 + x1) / 2
        const cy = (y0 + y1) / 2
        const cz = (z0 + z1) / 2
        if (!domain.contains(cx, cy, cz)) continue
        if (domain.lances.some((lance) => cellHitsLance(x0, y0, z0, x1, y1, z1, lance))) continue
        const own = refineN.get(`${i},${j},${k}`) ?? 1
        const splits = [
          refineN.get(`${i - 1},${j},${k}`) ?? 1,
          refineN.get(`${i + 1},${j},${k}`) ?? 1,
          refineN.get(`${i},${j - 1},${k}`) ?? 1,
          refineN.get(`${i},${j + 1},${k}`) ?? 1,
          refineN.get(`${i},${j},${k - 1}`) ?? 1,
          refineN.get(`${i},${j},${k + 1}`) ?? 1,
        ]
        if (own > 1) {
          emitRefinedHex(x0, x1, y0, y1, z0, z1, own, addVertex, tetVerts, addWire, hexSerial % wireStride === 0)
          minSpacing = Math.min(minSpacing, (x1 - x0) / own, (y1 - y0) / own, (z1 - z0) / own)
        } else if (splits.some((count) => count > 1)) {
          emitTransitionHex(x0, x1, y0, y1, z0, z1, splits, addVertex, tetVerts)
          minSpacing = Math.min(minSpacing, x1 - x0, y1 - y0, z1 - z0)
        } else {
          minSpacing = Math.min(minSpacing, x1 - x0, y1 - y0, z1 - z0)
          const corners: Array<[number, number, number]> = [
            [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0],
            [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1],
          ]
          if (hexSerial % wireStride === 0) {
            const hexEdges: Array<[number, number]> = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]]
            for (const [from, to] of hexEdges) addWire(corners[from][0], corners[from][1], corners[from][2], corners[to][0], corners[to][1], corners[to][2])
          }
          appendHex(corners, addVertex, tetVerts)
        }
        hexSerial += 1
      }
    }
  }
  if (!Number.isFinite(minSpacing)) minSpacing = cellSizeM

  const tetCount = tetVerts.length / 4
  const centroids = new Float32Array(tetCount * 3)
  const volumes = new Float32Array(tetCount)
  const neighbors = new Int32Array(tetCount * 4).fill(-1)
  const faceArea = new Float32Array(tetCount * 4)
  const faceNx = new Float32Array(tetCount * 4)
  const faceNy = new Float32Array(tetCount * 4)
  const faceNz = new Float32Array(tetCount * 4)
  const faceDist = new Float32Array(tetCount * 4)
  const faceKind = new Uint8Array(tetCount * 4)
  const faceInlet = new Int16Array(tetCount * 4).fill(-1)
  const faceOwner = new Map<string, { tet: number; face: number }>()

  for (let tet = 0; tet < tetCount; tet += 1) {
    const ids = [tetVerts[tet * 4], tetVerts[tet * 4 + 1], tetVerts[tet * 4 + 2], tetVerts[tet * 4 + 3]]
    const p = ids.map((id) => [vertices[id * 3], vertices[id * 3 + 1], vertices[id * 3 + 2]])
    const cx = (p[0][0] + p[1][0] + p[2][0] + p[3][0]) / 4
    const cy = (p[0][1] + p[1][1] + p[2][1] + p[3][1]) / 4
    const cz = (p[0][2] + p[1][2] + p[2][2] + p[3][2]) / 4
    centroids[tet * 3] = cx
    centroids[tet * 3 + 1] = cy
    centroids[tet * 3 + 2] = cz
    volumes[tet] = Math.abs(tetVolume(p[0], p[1], p[2], p[3]))
    const faces = [
      [1, 2, 3],
      [0, 3, 2],
      [0, 1, 3],
      [0, 2, 1],
    ]
    for (let face = 0; face < 4; face += 1) {
      const tri = faces[face].map((corner) => p[corner])
      const geom = faceGeometry(tri[0], tri[1], tri[2], [cx, cy, cz])
      const slot = tet * 4 + face
      faceArea[slot] = geom.area
      faceNx[slot] = geom.nx
      faceNy[slot] = geom.ny
      faceNz[slot] = geom.nz
      const key = faces[face].map((corner) => ids[corner]).sort((a, b) => a - b).join(':')
      const prior = faceOwner.get(key)
      if (prior) {
        neighbors[slot] = prior.tet
        neighbors[prior.tet * 4 + prior.face] = tet
        faceOwner.delete(key)
      } else {
        faceOwner.set(key, { tet, face })
      }
    }
  }
  const boundaryTet: number[] = []
  const boundaryFace: number[] = []
  for (const entry of faceOwner.values()) {
    boundaryTet.push(entry.tet)
    boundaryFace.push(entry.face)
  }

  for (let tet = 0; tet < tetCount; tet += 1) {
    for (let face = 0; face < 4; face += 1) {
      const slot = tet * 4 + face
      const other = neighbors[slot]
      if (other < 0) {
        faceDist[slot] = Math.max(minSpacing * 0.5, 1e-4)
        continue
      }
      const dx = centroids[other * 3] - centroids[tet * 3]
      const dy = centroids[other * 3 + 1] - centroids[tet * 3 + 1]
      const dz = centroids[other * 3 + 2] - centroids[tet * 3 + 2]
      faceDist[slot] = Math.max(Math.hypot(dx, dy, dz), 1e-4)
    }
  }

  const boundaryCount = boundaryTet.length
  const boundaryKind = new Uint8Array(boundaryCount)
  const boundaryCentroid = new Float32Array(boundaryCount * 3)
  const inletOfLance = new Array(domain.lances.length).fill(0)
  for (let index = 0; index < boundaryCount; index += 1) {
    const tet = boundaryTet[index]
    const face = boundaryFace[index]
    const slot = tet * 4 + face
    const point = faceCentroid(vertices, tetVerts, tet, face)
    boundaryCentroid[index * 3] = point[0]
    boundaryCentroid[index * 3 + 1] = point[1]
    boundaryCentroid[index * 3 + 2] = point[2]
    const kind = classifyFace(domain, point, faceNy[slot], cellSizeM)
    boundaryKind[index] = kind.kind
    faceKind[slot] = kind.kind
    faceInlet[slot] = kind.inlet
    if (kind.kind === KIND_INLET && kind.inlet >= 0) inletOfLance[kind.inlet] += 1
  }

  for (let lanceIndex = 0; lanceIndex < domain.lances.length; lanceIndex += 1) {
    if (inletOfLance[lanceIndex] > 0) continue
    const lance = domain.lances[lanceIndex]
    let best = -1
    let bestDistance = Infinity
    for (let index = 0; index < boundaryCount; index += 1) {
      if (boundaryKind[index] !== KIND_WALL) continue
      const dx = boundaryCentroid[index * 3] - lance.centerXM
      const dy = boundaryCentroid[index * 3 + 1] - lance.centerYM
      const dz = boundaryCentroid[index * 3 + 2] - lance.tipZM
      const distance = Math.hypot(dx, dy, dz)
      if (distance < bestDistance) {
        bestDistance = distance
        best = index
      }
    }
    if (best >= 0 && bestDistance <= Math.max(0.35, cellSizeM * 2)) {
      let chosen = best
      let chosenScore = Infinity
      for (let index = 0; index < boundaryCount; index += 1) {
        if (boundaryKind[index] !== KIND_WALL && index !== best) continue
        const dx = boundaryCentroid[index * 3] - lance.centerXM
        const dy = boundaryCentroid[index * 3 + 1] - lance.centerYM
        const dz = boundaryCentroid[index * 3 + 2] - lance.tipZM
        const distance = Math.hypot(dx, dy, dz)
        if (distance > Math.max(0.35, cellSizeM * 2)) continue
        const slot = boundaryTet[index] * 4 + boundaryFace[index]
        const facesLance = faceNz[slot] * -lance.inwardZ
        const score = distance + (facesLance > 0.35 ? 0 : cellSizeM)
        if (score < chosenScore) {
          chosenScore = score
          chosen = index
        }
      }
      boundaryKind[chosen] = KIND_INLET
      const slot = boundaryTet[chosen] * 4 + boundaryFace[chosen]
      faceKind[slot] = KIND_INLET
      faceInlet[slot] = lanceIndex
    }
  }

  let inletCount = 0
  let outletCount = 0
  let minX = Infinity
  let minY = Infinity
  let minZ = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  let maxZ = -Infinity
  for (let index = 0; index < boundaryCount; index += 1) {
    if (boundaryKind[index] === KIND_INLET) inletCount += 1
    if (boundaryKind[index] === KIND_OUTLET) outletCount += 1
  }
  for (let tet = 0; tet < tetCount; tet += 1) {
    const x = centroids[tet * 3]
    const y = centroids[tet * 3 + 1]
    const z = centroids[tet * 3 + 2]
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    minZ = Math.min(minZ, z)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
    maxZ = Math.max(maxZ, z)
  }
  if (tetCount === 0) {
    minX = domain.bounds.minX
    maxX = domain.bounds.maxX
    minY = domain.bounds.minY
    maxY = domain.bounds.maxY
    minZ = domain.bounds.minZ
    maxZ = domain.bounds.maxZ
  }

  return {
    tetCount,
    centroids,
    volumes,
    neighbors,
    faceArea,
    faceNx,
    faceNy,
    faceNz,
    faceDist,
    faceKind,
    faceInlet,
    boundaryCount,
    boundaryKind,
    boundaryCentroid,
    inletCount,
    outletCount,
    lanceInwardZ: Float32Array.from(domain.lances.map((lance) => lance.inwardZ)),
    lanceAreaM2: Float32Array.from(domain.lances.map((lance) => Math.PI * lance.radiusM * lance.radiusM)),
    nadirYM: domain.nadirYM,
    wirePositions: Float32Array.from(wire),
    cellSizeM,
    zoneSizeM,
    minSpacingM: minSpacing,
    minX,
    maxX,
    minY,
    maxY,
    minZ,
    maxZ,
  }
}

/** 把最近的内部坐标移到液面上，不增加分层；端点保持不动。 */
export function alignAxisToSurface(coords: number[], surface: number): number[] {
  if (coords.length < 3) return coords.slice()
  const min = coords[0]
  const max = coords[coords.length - 1]
  if (!(surface > min + 1e-4 && surface < max - 1e-4)) return coords.slice()
  let nearest = 1
  let best = Infinity
  for (let index = 1; index < coords.length - 1; index += 1) {
    const distance = Math.abs(coords[index] - surface)
    if (distance < best) {
      best = distance
      nearest = index
    }
  }
  const next = coords.slice()
  next[nearest] = surface
  next.sort((a, b) => a - b)
  const out: number[] = []
  for (const value of next) {
    if (out.length === 0 || Math.abs(value - out[out.length - 1]) > 1e-4) out.push(value)
    else if (Math.abs(value - surface) <= 1e-4) out[out.length - 1] = surface
  }
  return out.some((value) => Math.abs(value - surface) <= 1e-4) ? out : coords.slice()
}

const BATH_EDGE_M = 0.2
const SURFACE_BAND_M = 0.2

function buildAxes(domain: FluidDomain, _targetTetCount: number, liquidSurfaceYM?: number): { xs: Axis; ys: Axis; zs: Axis; cellSizeM: number; zoneSizeM: MeshZoneSize } {
  const { minX, maxX, minY, maxY, minZ, maxZ } = domain.bounds
  const diameter = domain.lances.reduce((span, lance) => Math.max(span, lance.radiusM * 2), 0.04)
  const xs = baseCoords(minX, maxX, BATH_EDGE_M)
  const zs = baseCoords(minZ, maxZ, BATH_EDGE_M)
  const surface = liquidSurfaceYM != null && Number.isFinite(liquidSurfaceYM) ? liquidSurfaceYM : undefined
  let ys = furnaceVerticalCoords(minY, maxY, surface)
  if (surface != null) ys = alignAxisToSurface(ys, surface)
  return {
    xs, ys, zs, cellSizeM: BATH_EDGE_M,
    zoneSizeM: { tuyereM: diameter, surfaceM: BATH_EDGE_M, bathM: BATH_EDGE_M, gasM: BATH_EDGE_M * 2 },
  }
}

/** 熔池和液面上 200 mm 用 200 mm；再往上每升高约 200 mm，竖向尺寸翻倍。水平方向保持 200 mm，避免 2 m 炉宽只有两三层。 */
function furnaceVerticalCoords(minY: number, maxY: number, surface: number | undefined): Axis {
  const values = [minY, maxY]
  const cap = surface != null ? Math.min(maxY, Math.max(minY, surface + SURFACE_BAND_M)) : maxY
  for (let y = minY + BATH_EDGE_M; y < cap - 1e-4; y += BATH_EDGE_M) values.push(y)
  if (surface != null && surface > minY + 1e-4 && surface < maxY - 1e-4) values.push(surface, cap)
  let size = BATH_EDGE_M * 2
  let y = cap
  while (y < maxY - 1e-4 && size < 8) {
    const next = Math.min(maxY, y + size)
    values.push(next)
    if (next >= maxY - 1e-4) break
    y = next
    size *= 2
  }
  return withPoints([], values.filter((value) => value >= minY - 1e-6 && value <= maxY + 1e-6).map((value) => Math.min(maxY, Math.max(minY, value))))
}

function lancePad(lance: FluidLance, tuyereM: number): { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number } {
  const reach = Math.max(5 * tuyereM, 0.12)
  const zTip = lance.tipZM + lance.inwardZ * reach
  return {
    x0: lance.centerXM - reach,
    x1: lance.centerXM + reach,
    y0: lance.centerYM - reach,
    y1: lance.centerYM + reach,
    z0: Math.min(lance.tipZM, zTip) - lance.radiusM,
    z1: Math.max(lance.tipZM, zTip) + lance.radiusM,
  }
}

function overlapsLance(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, lance: FluidLance, tuyereM: number): boolean {
  const pad = lancePad(lance, tuyereM)
  return x1 >= pad.x0 && x0 <= pad.x1 && y1 >= pad.y0 && y0 <= pad.y1 && z1 >= pad.z0 && z0 <= pad.z1
}

function refineDivisions(edge: number, tuyereM: number): number {
  const count = Math.round(edge / Math.max(tuyereM, 1e-4))
  return Math.max(1, Math.min(8, count))
}

function estimateZonedTets(xs: Axis, ys: Axis, zs: Axis, domain: FluidDomain, tuyereM: number): number {
  let tets = 0
  for (let i = 0; i < xs.length - 1; i += 1) {
    for (let j = 0; j < ys.length - 1; j += 1) {
      for (let k = 0; k < zs.length - 1; k += 1) {
        const cx = (xs[i] + xs[i + 1]) / 2
        const cy = (ys[j] + ys[j + 1]) / 2
        const cz = (zs[k] + zs[k + 1]) / 2
        if (!domain.contains(cx, cy, cz)) continue
        const edge = Math.max(xs[i + 1] - xs[i], ys[j + 1] - ys[j], zs[k + 1] - zs[k])
        const near = domain.lances.some((lance) => overlapsLance(xs[i], xs[i + 1], ys[j], ys[j + 1], zs[k], zs[k + 1], lance, tuyereM))
        const divisions = near ? refineDivisions(edge, tuyereM) : 1
        tets += divisions > 1 ? (divisions ** 3) * 12 + divisions * divisions * 24 : 5
      }
    }
  }
  return tets
}

function lanceRefineMap(xs: Axis, ys: Axis, zs: Axis, domain: FluidDomain, tuyereM: number): Map<string, number> {
  const refineN = new Map<string, number>()
  for (let i = 0; i < xs.length - 1; i += 1) {
    for (let j = 0; j < ys.length - 1; j += 1) {
      for (let k = 0; k < zs.length - 1; k += 1) {
        const edge = Math.max(xs[i + 1] - xs[i], ys[j + 1] - ys[j], zs[k + 1] - zs[k])
        const near = domain.lances.some((lance) => overlapsLance(xs[i], xs[i + 1], ys[j], ys[j + 1], zs[k], zs[k + 1], lance, tuyereM))
        const divisions = near ? refineDivisions(edge, tuyereM) : 1
        if (divisions > 1) refineN.set(`${i},${j},${k}`, divisions)
      }
    }
  }
  return refineN
}

function emitRefinedHex(
  x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, divisions: number,
  addVertex: (x: number, y: number, z: number) => number, tetVerts: number[],
  addWire: (ax: number, ay: number, az: number, bx: number, by: number, bz: number) => void, drawWire: boolean,
) {
  for (let i = 0; i < divisions; i += 1) {
    for (let j = 0; j < divisions; j += 1) {
      for (let k = 0; k < divisions; k += 1) {
        const sx0 = x0 + (x1 - x0) * i / divisions
        const sx1 = x0 + (x1 - x0) * (i + 1) / divisions
        const sy0 = y0 + (y1 - y0) * j / divisions
        const sy1 = y0 + (y1 - y0) * (j + 1) / divisions
        const sz0 = z0 + (z1 - z0) * k / divisions
        const sz1 = z0 + (z1 - z0) * (k + 1) / divisions
        if (drawWire && i + j + k === 0) {
          addWire(sx0, sy0, sz0, sx1, sy0, sz0)
          addWire(sx0, sy0, sz0, sx0, sy1, sz0)
          addWire(sx0, sy0, sz0, sx0, sy0, sz1)
        }
        emitTransitionHex(sx0, sx1, sy0, sy1, sz0, sz1, [1, 1, 1, 1, 1, 1], addVertex, tetVerts)
      }
    }
  }
}

function emitTransitionHex(
  x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, splits: number[],
  addVertex: (x: number, y: number, z: number) => number, tetVerts: number[],
) {
  const center: [number, number, number] = [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2]
  const faceCount = (index: number) => Math.max(1, splits[index] ?? 1)
  const faces: Array<{ origin: [number, number, number]; du: [number, number, number]; dv: [number, number, number]; nu: number; nv: number }> = [
    { origin: [x0, y0, z0], du: [0, y1 - y0, 0], dv: [0, 0, z1 - z0], nu: faceCount(0), nv: faceCount(0) },
    { origin: [x1, y0, z0], du: [0, y1 - y0, 0], dv: [0, 0, z1 - z0], nu: faceCount(1), nv: faceCount(1) },
    { origin: [x0, y0, z0], du: [x1 - x0, 0, 0], dv: [0, 0, z1 - z0], nu: faceCount(2), nv: faceCount(2) },
    { origin: [x0, y1, z0], du: [x1 - x0, 0, 0], dv: [0, 0, z1 - z0], nu: faceCount(3), nv: faceCount(3) },
    { origin: [x0, y0, z0], du: [x1 - x0, 0, 0], dv: [0, y1 - y0, 0], nu: faceCount(4), nv: faceCount(4) },
    { origin: [x0, y0, z1], du: [x1 - x0, 0, 0], dv: [0, y1 - y0, 0], nu: faceCount(5), nv: faceCount(5) },
  ]
  const centerId = addVertex(center[0], center[1], center[2])
  for (const face of faces) {
    const nu = Math.max(1, face.nu)
    const nv = Math.max(1, face.nv)
    for (let iu = 0; iu < nu; iu += 1) {
      for (let iv = 0; iv < nv; iv += 1) {
        const at = (su: number, sv: number): [number, number, number] => [
          face.origin[0] + face.du[0] * su + face.dv[0] * sv,
          face.origin[1] + face.du[1] * su + face.dv[1] * sv,
          face.origin[2] + face.du[2] * su + face.dv[2] * sv,
        ]
        const p00 = at(iu / nu, iv / nv)
        const p10 = at((iu + 1) / nu, iv / nv)
        const p11 = at((iu + 1) / nu, (iv + 1) / nv)
        const p01 = at(iu / nu, (iv + 1) / nv)
        pushFanTet(p00, p10, p11, centerId, addVertex, tetVerts)
        pushFanTet(p00, p11, p01, centerId, addVertex, tetVerts)
      }
    }
  }
}

function pushFanTet(
  a: [number, number, number], b: [number, number, number], c: [number, number, number], centerId: number,
  addVertex: (x: number, y: number, z: number) => number, tetVerts: number[],
) {
  tetVerts.push(addVertex(a[0], a[1], a[2]), addVertex(b[0], b[1], b[2]), addVertex(c[0], c[1], c[2]), centerId)
}

function baseCoords(min: number, max: number, h: number): Axis {
  const span = Math.max(max - min, 1e-4)
  const count = Math.max(1, Math.round(span / h))
  const out = [min]
  for (let index = 1; index < count; index += 1) out.push(min + span * index / count)
  out.push(max)
  return out
}

function withPoints(coords: Axis, points: number[]): Axis {
  const merged = [...coords, ...points].sort((a, b) => a - b)
  const out: Axis = []
  for (const value of merged) {
    if (out.length === 0 || value - out[out.length - 1] > 1e-4) out.push(value)
  }
  return out
}

function hexCount(xs: Axis, ys: Axis, zs: Axis): number {
  return Math.max(0, xs.length - 1) * Math.max(0, ys.length - 1) * Math.max(0, zs.length - 1)
}

function cellHitsLance(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, lance: FluidLance): boolean {
  const size = Math.max(x1 - x0, y1 - y0, z1 - z0)
  if (size > Math.max(lance.radiusM * 2 * 2.6, 0.05)) return false
  const zLo = Math.min(lance.tipZM, lance.wallZM)
  const zHi = Math.max(lance.tipZM, lance.wallZM)
  if (z1 < zLo || z0 > zHi) return false
  const cx = Math.min(Math.max(lance.centerXM, x0), x1)
  const cy = Math.min(Math.max(lance.centerYM, y0), y1)
  const dx = cx - lance.centerXM
  const dy = cy - lance.centerYM
  return dx * dx + dy * dy <= lance.radiusM * lance.radiusM
}

function appendHex(corners: number[][], addVertex: (x: number, y: number, z: number) => number, tetVerts: number[]) {
  const ids = corners.map((corner) => addVertex(corner[0], corner[1], corner[2]))
  const patterns = [
    [0, 1, 2, 5],
    [0, 2, 3, 7],
    [0, 5, 7, 4],
    [2, 5, 6, 7],
    [0, 2, 7, 5],
  ]
  for (const pattern of patterns) {
    const a = ids[pattern[0]]
    const b = ids[pattern[1]]
    const c = ids[pattern[2]]
    const d = ids[pattern[3]]
    const pa = corners[pattern[0]]
    const pb = corners[pattern[1]]
    const pc = corners[pattern[2]]
    const pd = corners[pattern[3]]
    if (Math.abs(tetVolume(pa, pb, pc, pd)) < 1e-10) continue
    if (tetVolume(pa, pb, pc, pd) > 0) tetVerts.push(a, b, c, d)
    else tetVerts.push(a, b, d, c)
  }
}

function tetVolume(a: number[], b: number[], c: number[], d: number[]): number {
  const abx = b[0] - a[0]
  const aby = b[1] - a[1]
  const abz = b[2] - a[2]
  const acx = c[0] - a[0]
  const acy = c[1] - a[1]
  const acz = c[2] - a[2]
  const adx = d[0] - a[0]
  const ady = d[1] - a[1]
  const adz = d[2] - a[2]
  const cx = acy * adz - acz * ady
  const cy = acz * adx - acx * adz
  const cz = acx * ady - acy * adx
  return (abx * cx + aby * cy + abz * cz) / 6
}

function faceGeometry(a: number[], b: number[], c: number[], centroid: number[]) {
  const abx = b[0] - a[0]
  const aby = b[1] - a[1]
  const abz = b[2] - a[2]
  const acx = c[0] - a[0]
  const acy = c[1] - a[1]
  const acz = c[2] - a[2]
  let nx = aby * acz - abz * acy
  let ny = abz * acx - abx * acz
  let nz = abx * acy - aby * acx
  const length = Math.hypot(nx, ny, nz)
  const toward = nx * (centroid[0] - a[0]) + ny * (centroid[1] - a[1]) + nz * (centroid[2] - a[2])
  if (toward > 0) {
    nx = -nx
    ny = -ny
    nz = -nz
  }
  const safe = Math.max(length, 1e-12)
  return { area: length / 2, nx: nx / safe, ny: ny / safe, nz: nz / safe }
}

function faceCentroid(vertices: number[], tetVerts: number[], tet: number, face: number): number[] {
  const corners = [
    [1, 2, 3],
    [0, 3, 2],
    [0, 1, 3],
    [0, 2, 1],
  ][face]
  const ids = corners.map((corner) => tetVerts[tet * 4 + corner])
  const point = [0, 0, 0]
  for (const id of ids) {
    point[0] += vertices[id * 3]
    point[1] += vertices[id * 3 + 1]
    point[2] += vertices[id * 3 + 2]
  }
  return [point[0] / 3, point[1] / 3, point[2] / 3]
}

function classifyFace(domain: FluidDomain, point: number[], ny: number, cellSizeM: number): { kind: number; inlet: number } {
  const topBand = Math.max(0.04, cellSizeM * 0.65)
  if (ny > 0.45 && point[1] >= domain.flueTopYM - topBand && domain.inFlueFootprint(point[0], point[2])) {
    return { kind: KIND_OUTLET, inlet: -1 }
  }
  return { kind: KIND_WALL, inlet: -1 }
}
