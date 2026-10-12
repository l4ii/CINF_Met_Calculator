import * as THREE from 'three'
import type { ModelComponentManifest } from './modelComponentManifest.ts'

export type ModelDisplayMode = 'solid' | 'wireframe'
export type ModelSectionAxis = 'none' | 'top' | 'side' | 'end'
export type ModelSectionKeep = 'lower' | 'upper'

/** Nominal body dimensions exclude the foundation, roof flare and attached equipment. */
export function furnaceBodyBounds(components: ModelComponentManifest[], fallback: THREE.Box3): THREE.Box3 {
  const body = components.find(item => item.id === 'smelting.primary-body' || item.id === 'kivcet.primary-body.reaction-tower')
  if (!body) return fallback.clone()
  const value = (name: string) => Number(body.params[name]?.value ?? 0)
  const size = new THREE.Vector3(value('lengthM'), value('heightM'), value('widthM'))
  if (![size.x, size.y, size.z].every(n => Number.isFinite(n) && n > 0)) return fallback.clone()
  const center = new THREE.Vector3(value('centerXM'), value('centerYM'), value('centerZM'))
  // The side-blown shell's Y position is its bottom, while Kivcet positions are centroids.
  if (body.id === 'smelting.primary-body') center.y += size.y / 2
  return new THREE.Box3().setFromCenterAndSize(center, size)
}

/** Cut at an absolute model coordinate in metres, optionally retaining either side. */
export function sectionPlane(box: THREE.Box3, axis: ModelSectionAxis, position: number, keep: ModelSectionKeep = 'lower'): THREE.Plane | null {
  if (axis === 'none' || box.isEmpty()) return null
  const coordinate = axis === 'top' ? 'y' : axis === 'side' ? 'z' : 'x'
  const normal = new THREE.Vector3()
  normal[coordinate] = keep === 'lower' ? -1 : 1
  return new THREE.Plane(normal, keep === 'lower' ? position : -position)
}

function ensureEdgeOverlay(mesh: THREE.Mesh, darkMode: boolean, mode: ModelDisplayMode, plane: THREE.Plane | null) {
  let edges = mesh.getObjectByName('__edge-overlay') as THREE.LineSegments | undefined
  if (!edges) {
    const box = mesh.userData.edgeBox as { lengthM: number; heightM: number; widthM: number } | undefined
    const omitFlueEndChord = mesh.userData.omitFlueEndChord as FlueEndChord | undefined
    const geometry = box ? boxSilhouette(box) : shellEdges(mesh.geometry, omitFlueEndChord)
    edges = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: darkMode ? 0xf8fafc : 0x0f172a, transparent: true }))
    edges.name = '__edge-overlay'
    edges.userData.edgeOverlay = true
    mesh.add(edges)
  }
  const material = edges.material as THREE.LineBasicMaterial
  const wasClipped = Boolean(material.clippingPlanes?.length)
  material.clippingPlanes = plane ? [plane] : []
  material.opacity = mode === 'wireframe' ? 1 : 0.28
  if (wasClipped !== Boolean(plane)) material.needsUpdate = true
}

type FlueEndChord = { y: number; x0: number; x1: number; zCenter: number; halfWidth: number }

/** 只去掉烟道两端、伸出烟道宽度的炉顶收口边。烟道自身轮廓和炉顶长边保留。 */
function shellEdges(source: THREE.BufferGeometry, chord: FlueEndChord | undefined): THREE.BufferGeometry {
  const edges = new THREE.EdgesGeometry(source, 20)
  if (!chord) return edges
  const src = edges.getAttribute('position')
  const kept: number[] = []
  const atEnd = (x: number) => Math.abs(x - chord.x0) < 0.08 || Math.abs(x - chord.x1) < 0.08
  const outsideFlue = (z: number) => Math.abs(z - chord.zCenter) > chord.halfWidth + 0.02
  for (let index = 0; index < src.count; index += 2) {
    const y0 = src.getY(index)
    const y1 = src.getY(index + 1)
    const x0 = src.getX(index)
    const x1 = src.getX(index + 1)
    const z0 = src.getZ(index)
    const z1 = src.getZ(index + 1)
    const roofSeam = Math.abs(y0 - chord.y) < 0.04 && Math.abs(y1 - chord.y) < 0.04 && atEnd(x0) && atEnd(x1) && (outsideFlue(z0) || outsideFlue(z1))
    if (roofSeam) continue
    for (let end = 0; end < 2; end += 1) kept.push(src.getX(index + end), src.getY(index + end), src.getZ(index + end))
  }
  edges.dispose()
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(kept, 3))
  return geometry
}

/** 底座只描外轮廓。炉底弧线由炉壳自己表达，避免切口再描出一条重线。 */
function boxSilhouette(box: { lengthM: number; heightM: number; widthM: number }): THREE.BufferGeometry {
  const x = box.lengthM / 2
  const y = box.heightM / 2
  const z = box.widthM / 2
  const corners = [
    [-x, -y, -z], [x, -y, -z], [x, -y, z], [-x, -y, z],
    [-x, y, -z], [x, y, -z], [x, y, z], [-x, y, z],
  ]
  const lines = [0, 1, 1, 2, 2, 3, 3, 0, 4, 5, 5, 6, 6, 7, 7, 4, 0, 4, 1, 5, 2, 6, 3, 7]
  const positions: number[] = []
  for (const index of lines) positions.push(...corners[index])
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  return geometry
}

function isFlowObject(object: THREE.Object3D): boolean {
  let current: THREE.Object3D | null = object
  while (current) {
    if (current.name === 'flow-schematic' || current.name === 'flow-horizontal-slice' || current.name === 'flow-longitudinal-slice' || current.name === 'flow-volume') return true
    current = current.parent
  }
  return false
}

export function applyModelDisplay(root: THREE.Object3D, mode: ModelDisplayMode, axis: ModelSectionAxis, position: number, box: THREE.Box3, keep: ModelSectionKeep = 'lower') {
  const plane = sectionPlane(box, axis, position, keep)
  const darkMode = Boolean(root.userData.displayDarkMode)
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    if (isFlowObject(object)) return
    ensureEdgeOverlay(object, darkMode, mode, plane)
    const materials = Array.isArray(object.material) ? object.material : [object.material]
    const keepTransparent = object.userData.flowShell === true
    const shellOpacity = typeof object.userData.flowShellOpacity === 'number' ? object.userData.flowShellOpacity : 0.28
    for (const material of materials) {
      if ('wireframe' in material) material.wireframe = false
      material.visible = mode === 'solid'
      material.transparent = keepTransparent
      material.opacity = keepTransparent ? shellOpacity : 1
      if ('depthWrite' in material) material.depthWrite = !keepTransparent
      const wasClipped = Boolean(material.clippingPlanes?.length)
      material.clippingPlanes = plane ? [plane] : []
      material.side = THREE.DoubleSide
      if (wasClipped !== Boolean(plane) || keepTransparent) material.needsUpdate = true
    }
  })
}

export function disposeModel(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>()
  const materials = new Set<THREE.Material>()
  root.traverse((object) => {
    const drawable = object as THREE.Mesh
    if (drawable.geometry) geometries.add(drawable.geometry)
    if (drawable.material) (Array.isArray(drawable.material) ? drawable.material : [drawable.material]).forEach(item => materials.add(item))
  })
  geometries.forEach(item => item.dispose())
  materials.forEach(item => {
    const mapped = item as THREE.Material & { map?: THREE.Texture | null }
    mapped.map?.dispose()
    item.dispose()
  })
}

function skipFlowGeometry(object: THREE.Object3D): boolean {
  let current: THREE.Object3D | null = object
  while (current) {
    if (current.name === 'flow-schematic' || current.name === 'flow-horizontal-slice' || current.name === 'flow-longitudinal-slice' || current.name === 'flow-volume') return true
    current = current.parent
  }
  return false
}

/** 导出当前实体三角面为二进制 STL，单位 m。不含流场切片和箭头。 */
export function exportFurnaceStl(root: THREE.Object3D, fileName: string) {
  root.updateMatrixWorld(true)
  const vertices: number[] = []
  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  const c = new THREE.Vector3()
  const pushTriangle = (geometry: THREE.BufferGeometry, matrix: THREE.Matrix4, ia: number, ib: number, ic: number) => {
    const position = geometry.getAttribute('position')
    if (!position) return
    a.fromBufferAttribute(position, ia).applyMatrix4(matrix)
    b.fromBufferAttribute(position, ib).applyMatrix4(matrix)
    c.fromBufferAttribute(position, ic).applyMatrix4(matrix)
    vertices.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z)
  }
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || !object.visible || skipFlowGeometry(object)) return
    const geometry = object.geometry
    const index = geometry.getIndex()
    if (index) {
      for (let offset = 0; offset < index.count; offset += 3) pushTriangle(geometry, object.matrixWorld, index.getX(offset), index.getX(offset + 1), index.getX(offset + 2))
    } else {
      const position = geometry.getAttribute('position')
      if (!position) return
      for (let offset = 0; offset < position.count; offset += 3) pushTriangle(geometry, object.matrixWorld, offset, offset + 1, offset + 2)
    }
  })
  const triangleCount = vertices.length / 9
  const buffer = new ArrayBuffer(84 + triangleCount * 50)
  const view = new DataView(buffer)
  const header = new TextEncoder().encode('CINF side-blow furnace, metres, X length Y up Z width')
  new Uint8Array(buffer, 0, 80).set(header.subarray(0, Math.min(80, header.length)))
  view.setUint32(80, triangleCount, true)
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const base = 84 + triangle * 50
    const offset = triangle * 9
    const ux = vertices[offset + 3] - vertices[offset]
    const uy = vertices[offset + 4] - vertices[offset + 1]
    const uz = vertices[offset + 5] - vertices[offset + 2]
    const vx = vertices[offset + 6] - vertices[offset]
    const vy = vertices[offset + 7] - vertices[offset + 1]
    const vz = vertices[offset + 8] - vertices[offset + 2]
    const nx = uy * vz - uz * vy
    const ny = uz * vx - ux * vz
    const nz = ux * vy - uy * vx
    const length = Math.hypot(nx, ny, nz) || 1
    view.setFloat32(base, nx / length, true)
    view.setFloat32(base + 4, ny / length, true)
    view.setFloat32(base + 8, nz / length, true)
    for (let coordinate = 0; coordinate < 9; coordinate += 1) view.setFloat32(base + 12 + coordinate * 4, vertices[offset + coordinate], true)
  }
  const url = URL.createObjectURL(new Blob([buffer], { type: 'model/stl' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName.endsWith('.stl') ? fileName : `${fileName}.stl`
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
