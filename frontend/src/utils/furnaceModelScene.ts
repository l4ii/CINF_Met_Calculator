import * as THREE from 'three'
import type { FurnaceLayout } from './copperFurnaceGeometry.ts'
import { FLOW_GRID_X, FLOW_GRID_Y } from './furnaceSideBlowSolver.ts'
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

/** Build an extruded, flared furnace shell.  Local Y starts at zero so its
 * transform position is the manifest's bottom-centre XYZ coordinate. */
function flaredBodyMesh(manifest: ModelComponentManifest, layout: FurnaceLayout, darkMode: boolean, shellOpacity = 1): THREE.Mesh {
  const { bottomLengthM: bl, bottomWidthM: bw, topLengthM: tl, topWidthM: tw, lowerHeightM: lh, upperHeightM: uh } = layout.flare
  const h = lh + uh
  const vertices = [
    [-bl / 2, 0, -bw / 2], [bl / 2, 0, -bw / 2], [bl / 2, 0, bw / 2], [-bl / 2, 0, bw / 2],
    [-bl / 2, lh, -bw / 2], [bl / 2, lh, -bw / 2], [bl / 2, lh, bw / 2], [-bl / 2, lh, bw / 2],
    [-tl / 2, h, -tw / 2], [tl / 2, h, -tw / 2], [tl / 2, h, tw / 2], [-tl / 2, h, tw / 2],
  ]
  const indices = [
    0, 1, 2, 0, 2, 3, // bottom
    0, 4, 5, 0, 5, 1, 1, 5, 6, 1, 6, 2, 2, 6, 7, 2, 7, 3, 3, 7, 4, 3, 4, 0,
    4, 8, 9, 4, 9, 5, 5, 9, 10, 5, 10, 6, 6, 10, 11, 6, 11, 7, 7, 11, 8, 7, 8, 4,
    8, 11, 10, 8, 10, 9, // top
  ]
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices.flat(), 3))
  geometry.setIndex(indices)
  const faces = geometry.toNonIndexed()
  geometry.dispose()
  faces.computeVertexNormals()
  return identify(new THREE.Mesh(faces, material(0x9a3412, darkMode, shellOpacity)), manifest)
}

export type FlowFieldKind = 'interface' | 'lvf' | 'velocity' | 'temperature'
export type FlowInletSide = 'both' | 'front' | 'back'

export type FlowSliceFrame = {
  nx: number
  ny: number
  phi: Float32Array
  u: Float32Array
  v: Float32Array
  temperature: Float32Array
  speed: Float32Array
}

export type FlowSolverFrames = {
  serial: number
  inletSpeedMs: number
  slices: Partial<Record<FlowInletSide, FlowSliceFrame>>
}

export type SmeltingFlowDecoration = {
  field: FlowFieldKind
  openTuyereIds: readonly string[]
  perTuyereNm3h: number
  liquidLevelM: number
  lanceHeightM: number
}

const FLOW_SHELL_OPACITY = 0.28

const flowUp = new THREE.Vector3(0, 1, 0)
const flowDirection = new THREE.Vector3()

function writeFieldPixels(field: FlowFieldKind, slice: FlowSliceFrame, pixels: Uint8Array, inletSpeedMs: number) {
  const { nx, ny, phi, speed, temperature } = slice
  const speedScale = Math.max(inletSpeedMs, 0.5)
  for (let j = 0; j < ny; j += 1) {
    for (let i = 0; i < nx; i += 1) {
      const id = i + j * nx
      const offset = id * 4
      const liquid = phi[id] ?? 0
      if (field === 'lvf') {
        pixels[offset] = Math.round(255 * liquid)
        pixels[offset + 1] = Math.round(255 * 4 * liquid * (1 - liquid))
        pixels[offset + 2] = Math.round(255 * (1 - liquid))
        pixels[offset + 3] = liquid > 0.04 || liquid < 0.96 ? 210 : 90
      } else if (field === 'temperature') {
        const heat = temperature[id] ?? 0
        pixels[offset] = Math.round(40 + 215 * heat)
        pixels[offset + 1] = Math.round(90 * (1 - Math.abs(heat - 0.45) * 1.6))
        pixels[offset + 2] = Math.round(220 * (1 - heat))
        pixels[offset + 3] = 200
      } else if (field === 'velocity') {
        const t = Math.min(1, (speed[id] ?? 0) / speedScale)
        pixels[offset] = Math.round(40 + 215 * t)
        pixels[offset + 1] = Math.round(80 + 140 * (1 - Math.abs(t - 0.5) * 2))
        pixels[offset + 2] = Math.round(220 * (1 - t))
        pixels[offset + 3] = Math.round(70 + 160 * t)
      } else {
        const band = Math.exp(-((liquid - 0.5) ** 2) / 0.012)
        pixels[offset] = Math.round(80 + 150 * liquid + 25 * band)
        pixels[offset + 1] = Math.round(40 * (1 - liquid) + 180 * band)
        pixels[offset + 2] = Math.round(30 * (1 - liquid))
        pixels[offset + 3] = Math.round(liquid > 0.5 ? 150 : 30 + 225 * band)
      }
    }
  }
}

function stationSide(frontOpen: boolean, backOpen: boolean): FlowInletSide | null {
  if (frontOpen && backOpen) return 'both'
  if (frontOpen) return 'front'
  if (backOpen) return 'back'
  return null
}

function buildFlowField(layout: FurnaceLayout, flow: SmeltingFlowDecoration): THREE.Group {
  const group = new THREE.Group()
  group.name = 'flow-schematic'
  group.userData.field = flow.field
  const openIds = new Set(flow.openTuyereIds)
  const stations = new Map<number, { x: number; front: boolean; back: boolean }>()
  for (const tuyere of layout.tuyeres) {
    const station = stations.get(tuyere.index) ?? { x: tuyere.centerXM, front: false, back: false }
    station.x = tuyere.centerXM
    if (openIds.has(tuyere.id)) {
      if (tuyere.side === 'front') station.front = true
      else station.back = true
    }
    stations.set(tuyere.index, station)
  }
  const width = Math.max(layout.body.widthM * 0.96, 0.2)
  const height = Math.max(layout.body.heightM * 0.96, 0.2)
  const planes: Array<{ side: FlowInletSide; texture: THREE.DataTexture; pixels: Uint8Array; arrows: THREE.Object3D[] }> = []
  for (const station of stations.values()) {
    const side = stationSide(station.front, station.back)
    if (!side) continue
    const pixels = new Uint8Array(FLOW_GRID_X * FLOW_GRID_Y * 4)
    const texture = new THREE.DataTexture(pixels, FLOW_GRID_X, FLOW_GRID_Y)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.magFilter = THREE.LinearFilter
    texture.minFilter = THREE.LinearFilter
    texture.flipY = true
    texture.needsUpdate = true
    const material = new THREE.MeshBasicMaterial({
      map: texture, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
    })
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material)
    plane.rotation.y = -Math.PI / 2
    plane.position.set(station.x, layout.body.centerYM + layout.body.heightM / 2, layout.body.centerZM)
    plane.renderOrder = 3
    const arrows: THREE.Object3D[] = []
    for (let index = 0; index < 48; index += 1) {
      const arrow = new THREE.Group()
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.12, 5), new THREE.MeshBasicMaterial({ color: 0xf8fafc }))
      shaft.position.y = 0.05
      const head = new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.05, 6), new THREE.MeshBasicMaterial({ color: 0xf8fafc }))
      head.position.y = 0.12
      arrow.add(shaft, head)
      arrow.visible = false
      plane.add(arrow)
      arrows.push(arrow)
    }
    plane.userData.arrows = arrows
    group.add(plane)
    planes.push({ side, texture, pixels, arrows })
  }
  group.userData.paint = (frames: FlowSolverFrames) => {
    const field = group.userData.field as FlowFieldKind
    for (const plane of planes) {
      const slice = frames.slices[plane.side]
      if (!slice) continue
      writeFieldPixels(field, slice, plane.pixels, frames.inletSpeedMs)
      plane.texture.needsUpdate = true
      let arrowIndex = 0
      for (const arrow of plane.arrows) arrow.visible = false
      if (field !== 'velocity') continue
      for (let j = 4; j < slice.ny - 4; j += 8) {
        for (let i = 3; i < slice.nx - 3; i += 8) {
          const arrow = plane.arrows[arrowIndex]
          if (!arrow) break
          const id = i + j * slice.nx
          const velocity = slice.speed[id] ?? 0
          if (velocity < Math.max(frames.inletSpeedMs, 0.5) * 0.08) continue
          const localX = -width / 2 + (i + 0.5) / slice.nx * width
          const localY = -height / 2 + (j + 0.5) / slice.ny * height
          arrow.position.set(localX, localY, 0.02)
          flowDirection.set(slice.u[id] ?? 0, slice.v[id] ?? 0, 0)
          if (flowDirection.lengthSq() > 1e-8) {
            flowDirection.normalize()
            arrow.quaternion.setFromUnitVectors(flowUp, flowDirection)
          }
          arrow.visible = true
          arrowIndex += 1
        }
      }
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

export function buildSmeltingModelScene(layout: FurnaceLayout, darkMode: boolean, flow?: SmeltingFlowDecoration | null): THREE.Group {
  const root = new THREE.Group()
  root.name = 'smelting-model-scene'
  root.userData.displayDarkMode = darkMode
  const manifests = layout.components ?? []
  const flowActive = Boolean(flow)
  const openTuyereIds = new Set(flow?.openTuyereIds ?? [])
  const bodyManifest = manifests.find((entry) => entry.id === 'smelting.primary-body')
  if (bodyManifest) {
    const body = flaredBodyMesh(bodyManifest, layout, darkMode, flowActive ? FLOW_SHELL_OPACITY : 1)
    addManifestMesh(root, body, bodyManifest, new THREE.Vector3(layout.body.centerXM, layout.body.centerYM, layout.body.centerZM))
  }
  const flueManifest = manifests.find((entry) => entry.id === 'smelting.process-connection.flue')
  if (flueManifest) {
    const flue = boxMesh(flueManifest, layout.flue.lengthM, layout.flue.heightM, layout.flue.widthM, darkMode, 0x475569)
    addManifestMesh(root, flue, flueManifest, new THREE.Vector3(layout.flue.centerXM, layout.flue.centerYM, layout.flue.centerZM))
  }
  const foundationManifest = manifests.find((entry) => entry.id === 'smelting.support.foundation')
  if (foundationManifest) {
    const foundation = boxMesh(foundationManifest, layout.foundation.lengthM, layout.foundation.heightM, layout.foundation.widthM, darkMode, 0x64748b)
    addManifestMesh(root, foundation, foundationManifest, new THREE.Vector3(layout.foundation.centerXM, layout.foundation.centerYM, layout.foundation.centerZM))
  }
  for (const jacket of layout.jackets) {
    const manifest = manifestByGeometryId(manifests, jacket.id)
    if (!manifest) continue
    const mesh = boxMesh(manifest, jacket.lengthM, jacket.heightM, jacket.thicknessM, darkMode, 0x0369a1)
    addManifestMesh(root, mesh, manifest, new THREE.Vector3(jacket.centerXM, jacket.centerYM, jacket.centerZM))
  }
  for (const tuyere of layout.tuyeres) {
    const manifest = manifestByGeometryId(manifests, tuyere.id)
    if (!manifest) continue
    const open = !flowActive || openTuyereIds.has(tuyere.id)
    const geometry = new THREE.CylinderGeometry(tuyere.radiusM, tuyere.radiusM, tuyere.lengthM, 24)
    const mesh = identify(new THREE.Mesh(geometry, material(open ? 0xdc2626 : 0x94a3b8, darkMode)), manifest)
    mesh.rotation.x = Math.PI / 2
    const lanceY = flow
      ? layout.body.centerYM + Math.min(layout.body.heightM - 0.05, Math.max(0.05, flow.lanceHeightM))
      : tuyere.centerYM
    addManifestMesh(root, mesh, manifest, new THREE.Vector3(tuyere.centerXM, lanceY, tuyere.centerZM))
  }
  if (flow) root.add(buildFlowField(layout, flow))
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
