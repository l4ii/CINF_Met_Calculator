import * as THREE from 'three'
import { mergeVertices, toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { hearthSagM, type FurnaceLayout } from './copperFurnaceGeometry.ts'
import { clampLanceInsertionM, furnaceWallHalfWidthM, horizontalInteriorSection } from './furnaceFluidDomain.ts'
import type { FlowPostFrame } from './furnaceSim/protocol.ts'
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

export type FlowSolverFrames = FlowPostFrame

/** 数值仿真视图下的炉体装饰：开启风口着色、风口尺寸与位置、初始液面。流场几何由后处理帧另行绘制。 */
export type SmeltingFlowDecoration = {
  openTuyereIds: readonly string[]
  /** 当前仿真入口直径 m；同时用于三维风口显示 */
  tuyereDiameterM: number
  liquidLevelM: number
  lanceHeightM: number
  /** 风口自炉内壁面向炉内的入炉深度 m */
  lanceInsertionM: number
  /** 已有计算结果时为 true，此时不再画初始液面标记 */
  showField?: boolean
}

const FLOW_SHELL_OPACITY = 0.28

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

/** 后处理帧转成场景对象：等值面、流线、截面。返回的组放在场景根下，不随炉体模型重建。 */
export function buildFlowPostGroup(frame: FlowPostFrame): THREE.Group {
  const group = new THREE.Group()
  group.name = 'flow-post'
  if (frame.iso && frame.iso.indices.length > 0) {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(frame.iso.positions, 3))
    geometry.setAttribute('normal', new THREE.BufferAttribute(frame.iso.normals, 3))
    geometry.setAttribute('color', new THREE.BufferAttribute(frame.iso.colors, 3))
    geometry.setIndex(new THREE.BufferAttribute(frame.iso.indices, 1))
    const surface = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
      vertexColors: true, side: THREE.DoubleSide, roughness: 0.55, metalness: 0.05, transparent: true, opacity: 0.88,
    }))
    surface.name = 'flow-iso'
    surface.renderOrder = 5
    group.add(surface)
  }
  if (frame.lines && frame.lines.positions.length > 0) {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(frame.lines.positions, 3))
    geometry.setAttribute('color', new THREE.BufferAttribute(frame.lines.colors, 3))
    const lines = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.95 }))
    lines.name = 'flow-streamlines'
    lines.renderOrder = 6
    group.add(lines)
  }
  for (const item of frame.slices) {
    if (item.indices.length === 0) continue
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(item.positions, 3))
    geometry.setAttribute('color', new THREE.BufferAttribute(item.colors, 3))
    geometry.setIndex(new THREE.BufferAttribute(item.indices, 1))
    const slice = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
      vertexColors: true, side: THREE.DoubleSide, transparent: true, opacity: 0.92, depthWrite: false,
    }))
    slice.name = `flow-slice-${item.id}`
    slice.renderOrder = 4
    group.add(slice)
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
  if (flow && !flow.showField) addLiquidMarker(root, layout, flow)
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
