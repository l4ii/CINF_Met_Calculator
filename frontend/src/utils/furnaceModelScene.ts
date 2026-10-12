import * as THREE from 'three'
import { mergeVertices, toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { hearthSagM, type FurnaceLayout } from './copperFurnaceGeometry.ts'
import { clampLanceInsertionM, furnaceWallHalfWidthM, horizontalInteriorSection, longitudinalCenterProfile } from './furnaceFluidDomain.ts'
import type { TetFlowFrame } from './furnaceTetSolver.ts'
import type { LeadKivcetGeometry, LeadKivcetGeometryPart } from './leadKivcetGeometry.ts'
import type { ModelComponentManifest } from './modelComponentManifest.ts'

/**
 * Scene builders shared by both furnace viewers.  The returned group contains
 * only model geometry; camera helpers, lights and grids belong to the viewport.
 * Every selectable physical component is one mesh with a stable manifest id.
 */

function material(color: number, darkMode: boolean, opacity = 1) {
  const transparent = opacity < 0.999
  return new THREE.MeshStandardMaterial({
    color: darkMode ? new THREE.Color(color).multiplyScalar(0.82) : color,
    roughness: 0.4,
    metalness: 0.24,
    side: THREE.DoubleSide,
    transparent,
    opacity,
    depthWrite: !transparent,
  })
}

function groupFor(root: THREE.Group, manifest: ModelComponentManifest): THREE.Group {
  let group = root.getObjectByName(`group:${manifest.group}`) as THREE.Group | undefined
  if (!group) {
    group = new THREE.Group()
    group.name = `group:${manifest.group}`
    group.userData.componentGroup = manifest.group
    root.add(group)
  }
  const categoryName = `category:${manifest.category}`
  let category = group.getObjectByName(categoryName) as THREE.Group | undefined
  if (!category) {
    category = new THREE.Group()
    category.name = categoryName
    category.userData.componentGroup = manifest.group
    category.userData.componentCategory = manifest.category
    group.add(category)
  }
  return category
}

function identify(mesh: THREE.Mesh, manifest: ModelComponentManifest): THREE.Mesh {
  mesh.name = manifest.id
  mesh.userData.componentId = manifest.id
  mesh.userData.manifest = manifest
  return mesh
}

function boxMesh(manifest: ModelComponentManifest, lengthM: number, heightM: number, widthM: number, darkMode: boolean, color: number): THREE.Mesh {
  return identify(new THREE.Mesh(new THREE.BoxGeometry(lengthM, heightM, widthM), material(color, darkMode)), manifest)
}

function pushTriangle(dst: number[], a: number[], b: number[], c: number[]) {
  dst.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2])
}

function pushQuad(dst: number[], a: number[], b: number[], c: number[], d: number[]) {
  pushTriangle(dst, a, b, c)
  pushTriangle(dst, a, c, d)
}

function geometryFromPositions(positions: number[]): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  const welded = mergeVertices(geometry, 1e-4)
  geometry.dispose()
  // 直角棱分开法线，端面不再被侧墙的光带划出一条线；外扩折角只有约 11°，仍然平滑。
  const creased = toCreasedNormals(welded, Math.PI / 3)
  if (creased !== welded) welded.dispose()
  return creased
}

/** 弧底炉壳，烟道从炉顶开口连续升起，是同一外壳。局部 Y=0 为原平底，弧底中心为负。 */
function shellGeometry(layout: FurnaceLayout): THREE.BufferGeometry {
  const { bottomLengthM: bl, bottomWidthM: bw, topLengthM: tl, topWidthM: tw, lowerHeightM: lh, upperHeightM: uh } = layout.flare
  const h = lh + uh
  const sag = hearthSagM(bw, layout.foundation.heightM)
  const positions: number[] = []
  const xCount = 8
  const zCount = 10
  const xs = Array.from({ length: xCount + 1 }, (_, index) => -bl / 2 + (bl * index) / xCount)
  const zs = Array.from({ length: zCount + 1 }, (_, index) => -bw / 2 + (bw * index) / zCount)
  const floorY = (z: number) => {
    const t = bw > 1e-6 ? z / (bw / 2) : 0
    return -sag * (1 - t * t)
  }
  const floorPoint = (i: number, j: number) => [xs[i], floorY(zs[j]), zs[j]]
  for (let i = 0; i < xCount; i += 1) {
    for (let j = 0; j < zCount; j += 1) pushQuad(positions, floorPoint(i, j), floorPoint(i + 1, j), floorPoint(i + 1, j + 1), floorPoint(i, j + 1))
  }
  const yBands = 8
  const yLevels = Array.from({ length: yBands + 1 }, (_, index) => (h * index) / yBands)
  const halfWidthAtY = (y: number) => {
    if (y <= lh) return bw / 2
    const t = Math.min(1, (y - lh) / Math.max(h - lh, 1e-6))
    const smooth = t * t * (3 - 2 * t)
    return bw / 2 + ((tw - bw) / 2) * smooth
  }
  const zAt = (y: number, t: number) => -halfWidthAtY(y) + t * 2 * halfWidthAtY(y)
  const zSteps = zCount
  for (let band = 0; band < yBands; band += 1) {
    const y0 = yLevels[band]
    const y1 = yLevels[band + 1]
    const z0 = halfWidthAtY(y0)
    const z1 = halfWidthAtY(y1)
    pushQuad(positions, [-bl / 2, y0, z0], [bl / 2, y0, z0], [bl / 2, y1, z1], [-bl / 2, y1, z1])
    pushQuad(positions, [bl / 2, y0, -z0], [-bl / 2, y0, -z0], [-bl / 2, y1, -z1], [bl / 2, y1, -z1])
  }
  for (const x of [-bl / 2, bl / 2]) {
    for (let j = 0; j < zSteps; j += 1) {
      const t0 = j / zSteps
      const t1 = (j + 1) / zSteps
      const z0 = -bw / 2 + bw * t0
      const z1 = -bw / 2 + bw * t1
      const arc0 = [x, floorY(z0), z0]
      const arc1 = [x, floorY(z1), z1]
      const lip0 = [x, 0, z0]
      const lip1 = [x, 0, z1]
      const rise0 = Math.abs(arc0[1]) > 1e-5
      const rise1 = Math.abs(arc1[1]) > 1e-5
      if (x > 0) {
        if (rise0 && rise1) pushQuad(positions, arc0, lip0, lip1, arc1)
        else if (rise1) pushTriangle(positions, lip0, lip1, arc1)
        else if (rise0) pushTriangle(positions, arc0, lip0, lip1)
      } else if (rise0 && rise1) pushQuad(positions, arc0, arc1, lip1, lip0)
      else if (rise1) pushTriangle(positions, lip0, arc1, lip1)
      else if (rise0) pushTriangle(positions, arc0, lip1, lip0)
      for (let band = 0; band < yBands; band += 1) {
        const y0 = yLevels[band]
        const y1 = yLevels[band + 1]
        const p00 = [x, y0, zAt(y0, t0)]
        const p01 = [x, y0, zAt(y0, t1)]
        const p11 = [x, y1, zAt(y1, t1)]
        const p10 = [x, y1, zAt(y1, t0)]
        if (x > 0) pushQuad(positions, p00, p10, p11, p01)
        else pushQuad(positions, p00, p01, p11, p10)
      }
    }
  }
  const flueX = layout.flue.centerXM - layout.body.centerXM
  const flueZ = layout.flue.centerZM - layout.body.centerZM
  const hx0 = Math.max(-tl / 2, flueX - layout.flue.lengthM / 2)
  const hx1 = Math.min(tl / 2, flueX + layout.flue.lengthM / 2)
  const hz0 = Math.max(-tw / 2, flueZ - layout.flue.widthM / 2)
  const hz1 = Math.min(tw / 2, flueZ + layout.flue.widthM / 2)
  if (hx1 - hx0 < 0.05 || hz1 - hz0 < 0.05) {
    pushQuad(positions, [-tl / 2, h, -tw / 2], [tl / 2, h, -tw / 2], [tl / 2, h, tw / 2], [-tl / 2, h, tw / 2])
  } else {
    if (hx0 > -tl / 2 + 1e-6) pushQuad(positions, [-tl / 2, h, -tw / 2], [hx0, h, -tw / 2], [hx0, h, tw / 2], [-tl / 2, h, tw / 2])
    if (hx1 < tl / 2 - 1e-6) pushQuad(positions, [hx1, h, -tw / 2], [tl / 2, h, -tw / 2], [tl / 2, h, tw / 2], [hx1, h, tw / 2])
    if (hz0 > -tw / 2 + 1e-6) pushQuad(positions, [hx0, h, -tw / 2], [hx1, h, -tw / 2], [hx1, h, hz0], [hx0, h, hz0])
    if (hz1 < tw / 2 - 1e-6) pushQuad(positions, [hx0, h, hz1], [hx1, h, hz1], [hx1, h, tw / 2], [hx0, h, tw / 2])
    const flueTop = h + layout.flue.heightM
    pushQuad(positions, [hx0, h, hz1], [hx1, h, hz1], [hx1, flueTop, hz1], [hx0, flueTop, hz1])
    pushQuad(positions, [hx0, h, hz0], [hx0, flueTop, hz0], [hx1, flueTop, hz0], [hx1, h, hz0])
    pushQuad(positions, [hx0, h, hz0], [hx0, h, hz1], [hx0, flueTop, hz1], [hx0, flueTop, hz0])
    pushQuad(positions, [hx1, h, hz0], [hx1, flueTop, hz0], [hx1, flueTop, hz1], [hx1, h, hz1])
    pushQuad(positions, [hx0, flueTop, hz0], [hx1, flueTop, hz0], [hx1, flueTop, hz1], [hx0, flueTop, hz1])
  }
  return geometryFromPositions(positions)
}

/** 底座顶面保持原炉底标高，炉底弧线从顶面切进去。局部坐标以底座中心为原点。 */
function foundationGeometry(layout: FurnaceLayout): THREE.BufferGeometry {
  const height = layout.foundation.heightM
  const hx = layout.foundation.lengthM / 2
  const hz = layout.foundation.widthM / 2
  const sag = hearthSagM(layout.flare.bottomWidthM, height)
  const bottom = -height / 2
  const apron = layout.body.centerYM - layout.foundation.centerYM
  const halfW = layout.flare.bottomWidthM / 2
  const halfL = layout.flare.bottomLengthM / 2
  const ox = layout.body.centerXM - layout.foundation.centerXM
  const oz = layout.body.centerZM - layout.foundation.centerZM
  const x0 = Math.max(-hx, ox - halfL)
  const x1 = Math.min(hx, ox + halfL)
  const z0 = Math.max(-hz, oz - halfW)
  const z1 = Math.min(hz, oz + halfW)
  const recessY = (z: number) => {
    const t = halfW > 1e-6 ? ((z + layout.foundation.centerZM) - layout.body.centerZM) / halfW : 0
    const clamped = Math.max(-1, Math.min(1, t))
    return apron - sag * (1 - clamped * clamped)
  }
  const positions: number[] = []
  pushQuad(positions, [-hx, bottom, -hz], [hx, bottom, -hz], [hx, bottom, hz], [-hx, bottom, hz])
  pushQuad(positions, [-hx, bottom, hz], [hx, bottom, hz], [hx, apron, hz], [-hx, apron, hz])
  pushQuad(positions, [-hx, bottom, -hz], [-hx, apron, -hz], [hx, apron, -hz], [hx, bottom, -hz])
  pushQuad(positions, [-hx, bottom, -hz], [-hx, bottom, hz], [-hx, apron, hz], [-hx, apron, -hz])
  pushQuad(positions, [hx, bottom, -hz], [hx, apron, -hz], [hx, apron, hz], [hx, bottom, hz])
  const hasRecess = x1 - x0 > 0.02 && z1 - z0 > 0.02 && sag > 1e-4
  if (!hasRecess) {
    pushQuad(positions, [-hx, apron, -hz], [hx, apron, -hz], [hx, apron, hz], [-hx, apron, hz])
    return geometryFromPositions(positions)
  }
  if (x0 > -hx + 1e-4) pushQuad(positions, [-hx, apron, -hz], [x0, apron, -hz], [x0, apron, hz], [-hx, apron, hz])
  if (x1 < hx - 1e-4) pushQuad(positions, [x1, apron, -hz], [hx, apron, -hz], [hx, apron, hz], [x1, apron, hz])
  if (z1 < hz - 1e-4) pushQuad(positions, [x0, apron, z1], [x1, apron, z1], [x1, apron, hz], [x0, apron, hz])
  if (z0 > -hz + 1e-4) pushQuad(positions, [x0, apron, -hz], [x1, apron, -hz], [x1, apron, z0], [x0, apron, z0])
  const xCount = 8
  const zCount = 12
  const xs = Array.from({ length: xCount + 1 }, (_, index) => x0 + ((x1 - x0) * index) / xCount)
  const zs = Array.from({ length: zCount + 1 }, (_, index) => z0 + ((z1 - z0) * index) / zCount)
  for (let i = 0; i < xCount; i += 1) {
    for (let j = 0; j < zCount; j += 1) {
      pushQuad(
        positions,
        [xs[i], recessY(zs[j]), zs[j]],
        [xs[i + 1], recessY(zs[j]), zs[j]],
        [xs[i + 1], recessY(zs[j + 1]), zs[j + 1]],
        [xs[i], recessY(zs[j + 1]), zs[j + 1]],
      )
    }
  }
  for (const x of [x0, x1]) {
    for (let j = 0; j < zCount; j += 1) {
      const za = zs[j]
      const zb = zs[j + 1]
      pushQuad(positions, [x, recessY(za), za], [x, recessY(zb), zb], [x, apron, zb], [x, apron, za])
    }
  }
  return geometryFromPositions(positions)
}

function markFlowShell(mesh: THREE.Mesh, opacity: number) {
  mesh.userData.flowShell = true
  mesh.userData.flowShellOpacity = opacity
}

export type FlowFieldKind = 'interface' | 'injectedGas' | 'lvf' | 'velocity' | 'pressure' | 'k' | 'epsilon' | 'nuT' | 'temperature'
export type FlowViewMode = 'section' | 'volume'
export type FlowSolverFrames = TetFlowFrame

export type SmeltingFlowDecoration = {
  field: FlowFieldKind
  openTuyereIds: readonly string[]
  perTuyereNm3h: number
  /** 当前仿真入口直径 m；同时用于三维风口显示 */
  tuyereDiameterM: number
  liquidLevelM: number
  lanceHeightM: number
  /** 风口自炉内壁面向炉内的入炉深度 m */
  lanceInsertionM: number
  /** 为 false 时不画流场切片。未传时仍显示。 */
  showField?: boolean
  viewMode: FlowViewMode
  /** 喷枪口高度附近的水平截面，自原平底标高起算；关闭时为 null */
  horizontalSliceM: number | null
  showHorizontalSlice: boolean
  /** 沿炉长、过炉宽中心的纵剖面 */
  showLongitudinalSlice: boolean
  showArrows: boolean
}

const FLOW_SHELL_OPACITY = 0.28
const flowUp = new THREE.Vector3(0, 1, 0)
const flowDirection = new THREE.Vector3()

type Sample = { phi: number; speed: number; pressure: number; injectedGas: number; u: number; v: number; w: number; missing: boolean }
type SampleIndex = {
  reach2: number
  originX: number
  originY: number
  originZ: number
  step: number
  bins: Map<string, number[]>
  centroids: Float32Array
  count: number
}
type FlowPlane = {
  texture: THREE.DataTexture
  pixels: Uint8Array
  columns: number
  rows: number
  arrows: THREE.Object3D[]
  sample: (column: number, row: number) => { x: number; y: number; z: number }
  placeArrow: (arrow: THREE.Object3D, x: number, y: number, z: number, direction: THREE.Vector3) => void
}

function fieldColor(field: FlowFieldKind, sample: Sample, pressureScale: number, speedScale: number, out: Uint8Array, offset: number) {
  if (sample.missing || field === 'k' || field === 'epsilon' || field === 'nuT' || field === 'temperature') {
    out[offset] = 80
    out[offset + 1] = 90
    out[offset + 2] = 100
    out[offset + 3] = 0
    return
  }
  const liquid = sample.phi
  if (field === 'injectedGas') {
    const gas = sample.injectedGas
    if (gas < 0.03) {
      out[offset + 3] = 0
      return
    }
    out[offset] = Math.round(14 + 30 * gas)
    out[offset + 1] = Math.round(170 + 70 * gas)
    out[offset + 2] = 235
    out[offset + 3] = Math.round(90 + 165 * gas)
  } else if (field === 'lvf') {
    out[offset] = Math.round(255 * liquid)
    out[offset + 1] = Math.round(255 * 4 * liquid * (1 - liquid))
    out[offset + 2] = Math.round(255 * (1 - liquid))
    out[offset + 3] = liquid > 0.04 && liquid < 0.96 ? 120 : 210
  } else if (field === 'pressure') {
    const normalized = Math.max(-1, Math.min(1, sample.pressure / pressureScale))
    const t = 0.5 + 0.5 * normalized
    out[offset] = Math.round(35 + 220 * t)
    out[offset + 1] = Math.round(75 + 120 * (1 - Math.abs(normalized)))
    out[offset + 2] = Math.round(220 * (1 - t))
    out[offset + 3] = 205
  } else if (field === 'velocity') {
    const t = Math.min(1, sample.speed / speedScale)
    out[offset] = Math.round(40 + 215 * t)
    out[offset + 1] = Math.round(80 + 140 * (1 - Math.abs(t - 0.5) * 2))
    out[offset + 2] = Math.round(220 * (1 - t))
    out[offset + 3] = Math.round(70 + 160 * t)
  } else {
    const band = Math.exp(-((liquid - 0.5) ** 2) / 0.012)
    out[offset] = Math.round(80 + 150 * liquid + 25 * band)
    out[offset + 1] = Math.round(40 * (1 - liquid) + 180 * band)
    out[offset + 2] = Math.round(30 * (1 - liquid))
    out[offset + 3] = Math.round(liquid > 0.5 ? 150 : 30 + 225 * band)
  }
}

function buildSampleIndex(frame: FlowSolverFrames): SampleIndex {
  const count = Math.max(0, frame.count)
  const dx = Math.max(frame.maxX - frame.minX, 0.2)
  const dy = Math.max(frame.maxY - frame.minY, 0.2)
  const dz = Math.max(frame.maxZ - frame.minZ, 0.2)
  const step = Math.max(0.05, Math.cbrt((dx * dy * dz) / Math.max(count, 1)) * 1.35)
  const bins = new Map<string, number[]>()
  for (let index = 0; index < count; index += 1) {
    const ix = Math.floor((frame.centroids[index * 3] - frame.minX) / step)
    const iy = Math.floor((frame.centroids[index * 3 + 1] - frame.minY) / step)
    const iz = Math.floor((frame.centroids[index * 3 + 2] - frame.minZ) / step)
    const key = `${ix},${iy},${iz}`
    const list = bins.get(key)
    if (list) list.push(index)
    else bins.set(key, [index])
  }
  return { reach2: (step * 1.8) ** 2, originX: frame.minX, originY: frame.minY, originZ: frame.minZ, step, bins, centroids: frame.centroids, count }
}

function nearestSample(index: SampleIndex, frame: FlowSolverFrames, x: number, y: number, z: number): Sample {
  const ix = Math.floor((x - index.originX) / index.step)
  const iy = Math.floor((y - index.originY) / index.step)
  const iz = Math.floor((z - index.originZ) / index.step)
  let best = -1
  let bestDistance = index.reach2
  for (let dz = -1; dz <= 1; dz += 1) {
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const list = index.bins.get(`${ix + dx},${iy + dy},${iz + dz}`)
        if (!list) continue
        for (const id of list) {
          const ox = index.centroids[id * 3] - x
          const oy = index.centroids[id * 3 + 1] - y
          const oz = index.centroids[id * 3 + 2] - z
          const distance = ox * ox + oy * oy + oz * oz
          if (distance < bestDistance) {
            bestDistance = distance
            best = id
          }
        }
      }
    }
  }
  if (best < 0) return { phi: 0, speed: 0, pressure: 0, injectedGas: 0, u: 0, v: 0, w: 0, missing: true }
  return {
    phi: frame.phi[best] ?? 0,
    speed: frame.speed[best] ?? 0,
    pressure: frame.pressure[best] ?? 0,
    injectedGas: frame.injectedGas[best] ?? 0,
    u: frame.u[best] ?? 0,
    v: frame.v[best] ?? 0,
    w: frame.w[best] ?? 0,
    missing: false,
  }
}

function makeArrow(): THREE.Group {
  const arrow = new THREE.Group()
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.12, 5), new THREE.MeshBasicMaterial({ color: 0xf8fafc }))
  shaft.position.y = 0.05
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.05, 6), new THREE.MeshBasicMaterial({ color: 0xf8fafc }))
  head.position.y = 0.12
  arrow.add(shaft, head)
  arrow.visible = false
  return arrow
}

function planeMaterial(texture: THREE.DataTexture): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    map: texture, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
  })
}

function makeTexture(columns: number, rows: number): { texture: THREE.DataTexture; pixels: Uint8Array } {
  const pixels = new Uint8Array(columns * rows * 4)
  const texture = new THREE.DataTexture(pixels, columns, rows)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.magFilter = THREE.LinearFilter
  texture.minFilter = THREE.LinearFilter
  texture.flipY = false
  texture.needsUpdate = true
  return { texture, pixels }
}

function horizontalGeometry(lengthM: number, widthM: number): THREE.BufferGeometry {
  const hx = lengthM / 2
  const hz = widthM / 2
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    -hx, 0, -hz, hx, 0, -hz, hx, 0, hz, -hx, 0, hz,
  ], 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2))
  geometry.setIndex([0, 1, 2, 0, 2, 3])
  return geometry
}

function longitudinalGeometry(lengthM: number, heightM: number): THREE.BufferGeometry {
  const hx = lengthM / 2
  const hy = heightM / 2
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    -hx, -hy, 0, hx, -hy, 0, hx, hy, 0, -hx, hy, 0,
  ], 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2))
  geometry.setIndex([0, 1, 2, 0, 2, 3])
  return geometry
}

function buildSectionGroup(name: string, geometry: THREE.BufferGeometry, columns: number, rows: number, showArrows: boolean, arrowCount: number): { group: THREE.Group; plane: FlowPlane } {
  const { texture, pixels } = makeTexture(columns, rows)
  const mesh = new THREE.Mesh(geometry, planeMaterial(texture))
  mesh.renderOrder = 4
  const arrows: THREE.Object3D[] = []
  if (showArrows) {
    for (let index = 0; index < arrowCount; index += 1) {
      const arrow = makeArrow()
      mesh.add(arrow)
      arrows.push(arrow)
    }
  }
  const group = new THREE.Group()
  group.name = name
  group.add(mesh)
  return {
    group,
    plane: {
      texture,
      pixels,
      columns,
      rows,
      arrows,
      sample: () => ({ x: 0, y: 0, z: 0 }),
      placeArrow: () => undefined,
    },
  }
}

function paintPlanes(field: FlowFieldKind, frame: FlowSolverFrames, index: SampleIndex, planes: FlowPlane[]) {
  let pressureScale = 1
  let speedScale = Math.max(frame.inletSpeedMs, 0.5)
  for (let id = 0; id < frame.count; id += 1) {
    pressureScale = Math.max(pressureScale, Math.abs(frame.pressure[id] ?? 0))
    speedScale = Math.max(speedScale, frame.speed[id] ?? 0)
  }
  for (const plane of planes) {
    for (let row = 0; row < plane.rows; row += 1) {
      for (let column = 0; column < plane.columns; column += 1) {
        const point = plane.sample(column, row)
        const sample = nearestSample(index, frame, point.x, point.y, point.z)
        fieldColor(field, sample, pressureScale, speedScale, plane.pixels, (column + row * plane.columns) * 4)
      }
    }
    plane.texture.needsUpdate = true
    for (const arrow of plane.arrows) arrow.visible = false
    if (field !== 'velocity') continue
    let arrowIndex = 0
    const columnStep = Math.max(1, Math.floor(plane.columns / 8))
    const rowStep = Math.max(1, Math.floor(plane.rows / 6))
    for (let row = 1; row < plane.rows - 1 && arrowIndex < plane.arrows.length; row += rowStep) {
      for (let column = 1; column < plane.columns - 1 && arrowIndex < plane.arrows.length; column += columnStep) {
        const point = plane.sample(column, row)
        const sample = nearestSample(index, frame, point.x, point.y, point.z)
        if (sample.missing || sample.speed < speedScale * 0.08) continue
        const arrow = plane.arrows[arrowIndex]
        flowDirection.set(sample.u, sample.v, sample.w)
        if (flowDirection.lengthSq() < 1e-8) continue
        flowDirection.normalize()
        plane.placeArrow(arrow, point.x, point.y, point.z, flowDirection)
        arrow.visible = true
        arrowIndex += 1
      }
    }
  }
}

function placeSectionMesh(built: { group: THREE.Group; plane: FlowPlane }, position: THREE.Vector3): THREE.Mesh {
  const mesh = built.group.children[0] as THREE.Mesh
  mesh.position.copy(position)
  return mesh
}

function buildFlowField(layout: FurnaceLayout, flow: SmeltingFlowDecoration): THREE.Group {
  const group = new THREE.Group()
  group.name = 'flow-schematic'
  group.userData.field = flow.field
  const planes: FlowPlane[] = []
  const profile = longitudinalCenterProfile(layout)
  const showSections = flow.viewMode !== 'volume'

  if (showSections && flow.showHorizontalSlice && flow.horizontalSliceM != null) {
    const columns = 72
    const rows = 48
    const y = layout.body.centerYM + flow.horizontalSliceM
    const section = horizontalInteriorSection(layout, y)
    if (section) {
      const built = buildSectionGroup('flow-horizontal-slice', horizontalGeometry(section.lengthM, section.widthM), columns, rows, flow.showArrows, 36)
      built.group.position.set(section.centerXM, y, section.centerZM)
      built.plane.sample = (column, row) => ({
        x: section.centerXM - section.lengthM / 2 + ((column + 0.5) / columns) * section.lengthM,
        y,
        z: section.centerZM - section.widthM / 2 + ((row + 0.5) / rows) * section.widthM,
      })
      built.plane.placeArrow = (arrow, x, _y, z, direction) => {
        arrow.position.set(x - section.centerXM, 0.02, z - section.centerZM)
        flowDirection.set(direction.x, 0, direction.z)
        if (flowDirection.lengthSq() > 1e-8) arrow.quaternion.setFromUnitVectors(flowUp, flowDirection.normalize())
      }
      group.add(built.group)
      planes.push(built.plane)
    }
  }

  if (showSections && flow.showLongitudinalSlice) {
    const slice = new THREE.Group()
    slice.name = 'flow-longitudinal-slice'
    const columns = 72
    const rows = 64
    const bodyHeight = Math.max(profile.shellTopYM - profile.nadirYM, 0.2)
    const midY = (profile.shellTopYM + profile.nadirYM) / 2
    const body = buildSectionGroup('flow-longitudinal-body', longitudinalGeometry(profile.lengthM, bodyHeight), columns, rows, flow.showArrows, 28)
    body.plane.sample = (column, row) => ({
      x: profile.centerXM - profile.lengthM / 2 + ((column + 0.5) / columns) * profile.lengthM,
      y: profile.nadirYM + ((row + 0.5) / rows) * bodyHeight,
      z: profile.centerZM,
    })
    body.plane.placeArrow = (arrow, x, y, _z, direction) => {
      arrow.position.set(x - profile.centerXM, y - midY, 0.02)
      flowDirection.set(direction.x, direction.y, 0)
      if (flowDirection.lengthSq() > 1e-8) arrow.quaternion.setFromUnitVectors(flowUp, flowDirection.normalize())
    }
    slice.add(placeSectionMesh(body, new THREE.Vector3(profile.centerXM, midY, profile.centerZM)))
    planes.push(body.plane)
    if (profile.flue) {
      const flue = profile.flue
      const flueHeight = Math.max(flue.y1 - flue.y0, 0.05)
      const flueLength = Math.max(flue.x1 - flue.x0, 0.05)
      const flueMidY = (flue.y0 + flue.y1) / 2
      const flueMidX = (flue.x0 + flue.x1) / 2
      const cap = buildSectionGroup('flow-longitudinal-flue', longitudinalGeometry(flueLength, flueHeight), 36, 24, flow.showArrows, 8)
      cap.plane.sample = (column, row) => ({
        x: flue.x0 + ((column + 0.5) / 36) * flueLength,
        y: flue.y0 + ((row + 0.5) / 24) * flueHeight,
        z: profile.centerZM,
      })
      cap.plane.placeArrow = (arrow, x, y, _z, direction) => {
        arrow.position.set(x - flueMidX, y - flueMidY, 0.02)
        flowDirection.set(direction.x, direction.y, 0)
        if (flowDirection.lengthSq() > 1e-8) arrow.quaternion.setFromUnitVectors(flowUp, flowDirection.normalize())
      }
      slice.add(placeSectionMesh(cap, new THREE.Vector3(flueMidX, flueMidY, profile.centerZM)))
      planes.push(cap.plane)
    }
    group.add(slice)
  }

  if (!showSections) {
    const volume = new THREE.Group()
    volume.name = 'flow-volume'
    const bands = 10
    const columns = 36
    const rows = 24
    const top = Math.max(profile.shellTopYM, profile.flue?.y1 ?? profile.shellTopYM)
    for (let band = 0; band < bands; band += 1) {
      const y = profile.nadirYM + ((band + 0.5) / bands) * (top - profile.nadirYM)
      const section = horizontalInteriorSection(layout, y)
      if (!section) continue
      const { texture, pixels } = makeTexture(columns, rows)
      const mesh = new THREE.Mesh(horizontalGeometry(section.lengthM, section.widthM), planeMaterial(texture))
      mesh.position.set(section.centerXM, y, section.centerZM)
      mesh.renderOrder = 3
      volume.add(mesh)
      const plane: FlowPlane = {
        texture,
        pixels,
        columns,
        rows,
        arrows: [],
        sample: (column, row) => ({
          x: section.centerXM - section.lengthM / 2 + ((column + 0.5) / columns) * section.lengthM,
          y,
          z: section.centerZM - section.widthM / 2 + ((row + 0.5) / rows) * section.widthM,
        }),
        placeArrow: () => undefined,
      }
      planes.push(plane)
    }
    if (flow.showArrows) {
      for (let index = 0; index < 40; index += 1) volume.add(makeArrow())
    }
    const volumeArrows = volume.children.filter((child) => child instanceof THREE.Group)
    group.add(volume)
    group.userData.volumeArrows = volumeArrows
  }

  group.userData.paint = (frame: FlowSolverFrames) => {
    const field = (group.userData.field as FlowFieldKind) ?? flow.field
    const cached = group.userData.sampleIndex as SampleIndex | undefined
    const index = !cached || cached.count !== frame.count || group.userData.meshId !== frame.meshId
      ? buildSampleIndex(frame)
      : cached
    group.userData.sampleIndex = index
    group.userData.meshId = frame.meshId
    paintPlanes(field, frame, index, planes)
    const arrows = (group.userData.volumeArrows as THREE.Object3D[] | undefined) ?? []
    for (const arrow of arrows) arrow.visible = false
    if (field !== 'velocity' || arrows.length === 0 || frame.count === 0) return
    const stride = Math.max(1, Math.floor(frame.count / arrows.length))
    let arrowIndex = 0
    for (let id = 0; id < frame.count && arrowIndex < arrows.length; id += stride) {
      const speed = frame.speed[id] ?? 0
      if (speed < Math.max(frame.inletSpeedMs, 0.5) * 0.12) continue
      const arrow = arrows[arrowIndex]
      arrow.position.set(frame.centroids[id * 3], frame.centroids[id * 3 + 1], frame.centroids[id * 3 + 2])
      flowDirection.set(frame.u[id] ?? 0, frame.v[id] ?? 0, frame.w[id] ?? 0)
      if (flowDirection.lengthSq() < 1e-8) continue
      arrow.quaternion.setFromUnitVectors(flowUp, flowDirection.normalize())
      arrow.visible = true
      arrowIndex += 1
    }
  }
  return group
}
function addManifestMesh(root: THREE.Group, mesh: THREE.Mesh, manifest: ModelComponentManifest, position: THREE.Vector3) {
  mesh.position.copy(position)
  groupFor(root, manifest).add(mesh)
}

function manifestByGeometryId(manifests: ModelComponentManifest[], geometryId: string) {
  return manifests.find((entry) => entry.geometryId === geometryId)
}

function flowLanceYM(layout: FurnaceLayout, flow: SmeltingFlowDecoration): number {
  return layout.body.centerYM + Math.min(layout.body.heightM - 0.05, Math.max(0.05, flow.lanceHeightM))
}

function addLiquidMarker(root: THREE.Group, layout: FurnaceLayout, flow: SmeltingFlowDecoration) {
  const nadir = layout.body.centerYM - hearthSagM(layout.flare.bottomWidthM, layout.foundation.heightM)
  const y = nadir + Math.max(0, flow.liquidLevelM)
  const section = horizontalInteriorSection(layout, y)
  if (!section) return
  const surface = new THREE.Mesh(
    horizontalGeometry(section.lengthM, section.widthM),
    new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.38, depthWrite: false, side: THREE.DoubleSide }),
  )
  surface.name = 'liquid-surface'
  surface.position.set(section.centerXM, y, section.centerZM)
  surface.renderOrder = 2
  root.add(surface)
  const arrowLength = Math.min(0.55, Math.max(0.18, section.widthM * 0.22))
  const arrow = new THREE.ArrowHelper(
    new THREE.Vector3(0, -1, 0),
    new THREE.Vector3(section.centerXM, y, section.centerZM),
    arrowLength,
    0x0284c7,
    arrowLength * 0.28,
    arrowLength * 0.16,
  )
  arrow.name = 'liquid-surface-arrow'
  root.add(arrow)
}

export function buildSmeltingModelScene(layout: FurnaceLayout, darkMode: boolean, flow?: SmeltingFlowDecoration | null): THREE.Group {
  const root = new THREE.Group()
  root.name = 'smelting-model-scene'
  root.userData.displayDarkMode = darkMode
  const manifests = layout.components ?? []
  const flowActive = Boolean(flow)
  const openTuyereIds = new Set(flow?.openTuyereIds ?? [])
  const bodyManifest = manifests.find((entry) => entry.id === 'smelting.primary-body')
  if (bodyManifest) {
    const shellOpacity = flowActive ? FLOW_SHELL_OPACITY : 1
    const body = identify(new THREE.Mesh(shellGeometry(layout), material(0x9a3412, darkMode, shellOpacity)), bodyManifest)
    const roofY = layout.flare.lowerHeightM + layout.flare.upperHeightM
    body.userData.omitFlueEndChord = {
      y: roofY,
      x0: layout.flue.centerXM - layout.body.centerXM - layout.flue.lengthM / 2,
      x1: layout.flue.centerXM - layout.body.centerXM + layout.flue.lengthM / 2,
      zCenter: layout.flue.centerZM - layout.body.centerZM,
      halfWidth: layout.flue.widthM / 2,
    }
    if (flowActive) markFlowShell(body, shellOpacity)
    addManifestMesh(root, body, bodyManifest, new THREE.Vector3(layout.body.centerXM, layout.body.centerYM, layout.body.centerZM))
  }
  const foundationManifest = manifests.find((entry) => entry.id === 'smelting.support.foundation')
  if (foundationManifest) {
    const foundationMaterial = material(0x64748b, darkMode)
    foundationMaterial.polygonOffset = true
    foundationMaterial.polygonOffsetFactor = 1
    foundationMaterial.polygonOffsetUnits = 1
    const foundation = identify(new THREE.Mesh(foundationGeometry(layout), foundationMaterial), foundationManifest)
    foundation.userData.edgeBox = {
      lengthM: layout.foundation.lengthM,
      heightM: layout.foundation.heightM,
      widthM: layout.foundation.widthM,
    }
    addManifestMesh(root, foundation, foundationManifest, new THREE.Vector3(layout.foundation.centerXM, layout.foundation.centerYM, layout.foundation.centerZM))
  }
  const lanceY = flow ? flowLanceYM(layout, flow) : 0
  const flowRadiusM = flow && Number.isFinite(flow.tuyereDiameterM) && flow.tuyereDiameterM > 0 ? flow.tuyereDiameterM / 2 : layout.lanceDiameterM / 2
  const flowInsertionM = flow ? clampLanceInsertionM(layout, lanceY - layout.body.centerYM, flowRadiusM * 2, flow.lanceInsertionM) : 0
  for (const jacket of layout.jackets) {
    const manifest = manifestByGeometryId(manifests, jacket.id)
    if (!manifest) continue
    const mesh = boxMesh(manifest, jacket.lengthM, jacket.heightM, jacket.thicknessM, darkMode, 0x0369a1)
    let jacketY = jacket.centerYM
    let jacketZ = jacket.centerZM
    if (flow) {
      const mate = layout.tuyeres.find((tuyere) => tuyere.side === jacket.side && tuyere.index === jacket.index)
      const gap = mate ? jacket.centerYM - mate.centerYM : 0
      const roof = layout.body.centerYM + layout.body.heightM
      jacketY = Math.min(roof - jacket.heightM / 2, Math.max(layout.body.centerYM + jacket.heightM / 2, lanceY + gap))
      const half = furnaceWallHalfWidthM(layout, jacketY)
      const outward = jacket.side === 'front' ? 1 : -1
      jacketZ = layout.body.centerZM + outward * (half + jacket.thicknessM / 2)
    }
    addManifestMesh(root, mesh, manifest, new THREE.Vector3(jacket.centerXM, jacketY, jacketZ))
  }
  for (const tuyere of layout.tuyeres) {
    const manifest = manifestByGeometryId(manifests, tuyere.id)
    if (!manifest) continue
    const open = !flowActive || openTuyereIds.has(tuyere.id)
    const radiusM = flow ? flowRadiusM : layout.lanceDiameterM / 2
    const geometry = new THREE.CylinderGeometry(radiusM, radiusM, tuyere.lengthM, 24)
    const mesh = identify(new THREE.Mesh(geometry, material(open ? 0xdc2626 : 0x94a3b8, darkMode)), manifest)
    mesh.rotation.x = tuyere.side === 'front' ? Math.PI / 2 : -Math.PI / 2
    const inward = tuyere.side === 'front' ? -1 : 1
    const placedY = flow ? lanceY : tuyere.centerYM
    const placedInsertion = flow
      ? flowInsertionM
      : clampLanceInsertionM(layout, tuyere.centerYM - layout.body.centerYM, layout.lanceDiameterM, layout.lanceInsertionM)
    const half = furnaceWallHalfWidthM(layout, placedY)
    const wallZ = layout.body.centerZM + (tuyere.side === 'front' ? half : -half)
    const centerZ = wallZ + inward * (placedInsertion - tuyere.lengthM / 2)
    addManifestMesh(root, mesh, manifest, new THREE.Vector3(tuyere.centerXM, placedY, centerZ))
  }
  if (flow) addLiquidMarker(root, layout, flow)
  if (flow && flow.showField !== false) root.add(buildFlowField(layout, flow))
  return root
}

function tubeGeometry(innerRadiusM: number, outerRadiusM: number, lengthM: number, segments = 32): THREE.BufferGeometry {
  const vertices: number[] = []
  for (const y of [-lengthM / 2, lengthM / 2]) {
    for (let i = 0; i < segments; i++) {
      const a = i / segments * Math.PI * 2
      vertices.push(outerRadiusM * Math.cos(a), y, outerRadiusM * Math.sin(a))
    }
    for (let i = 0; i < segments; i++) {
      const a = i / segments * Math.PI * 2
      vertices.push(innerRadiusM * Math.cos(a), y, innerRadiusM * Math.sin(a))
    }
  }
  const indices: number[] = []
  const ring = segments * 2
  const connect = (a: number, b: number, reverse = false) => {
    for (let i = 0; i < segments; i++) {
      const n = (i + 1) % segments
      const q = [a + i, a + n, b + n, b + i]
      if (reverse) indices.push(q[0], q[2], q[1], q[0], q[3], q[2])
      else indices.push(q[0], q[1], q[2], q[0], q[2], q[3])
    }
  }
  connect(0, ring) // outer wall
  connect(segments, segments * 3, true) // inner wall
  connect(0, segments, true) // bottom annulus
  connect(ring, ring + segments) // top annulus
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

function kivcetPartManifest(manifests: ModelComponentManifest[], part: LeadKivcetGeometryPart) {
  return manifests.find((entry) => entry.geometryId === part.id)
}

export function buildKivcetModelScene(geometry: LeadKivcetGeometry, darkMode: boolean): THREE.Group {
  const root = new THREE.Group()
  root.name = 'kivcet-model-scene'
  root.userData.displayDarkMode = darkMode
  const manifests = geometry.components ?? []
  for (const part of geometry.parts) {
    const manifest = kivcetPartManifest(manifests, part)
    if (!manifest) continue
    let mesh: THREE.Mesh
    if (part.kind === 'box') {
      const color = part.id === 'reaction-tower' ? 0x9a3412 : part.id === 'flue-tower' ? 0x475569 : 0x57534e
      mesh = boxMesh(manifest, part.lengthM, part.heightM, part.widthM, darkMode, color)
    } else if (part.kind === 'cylinder') {
      mesh = identify(new THREE.Mesh(new THREE.CylinderGeometry(part.radiusM, part.radiusM, part.lengthM, 24), material(0xdc2626, darkMode)), manifest)
    } else {
      mesh = identify(new THREE.Mesh(tubeGeometry(part.innerRadiusM, part.outerRadiusM, part.lengthM), material(0x0369a1, darkMode)), manifest)
    }
    addManifestMesh(root, mesh, manifest, new THREE.Vector3(part.centerXM, part.centerYM, part.centerZM))
  }
  return root
}

export function disposeFurnaceModelScene(root: THREE.Object3D) {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh
    if (mesh.geometry) mesh.geometry.dispose()
    const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : []
    materials.forEach((entry) => entry.dispose())
  })
}
