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
    edges = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 20), new THREE.LineBasicMaterial({ color: darkMode ? 0xf8fafc : 0x0f172a, transparent: true }))
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

export function applyModelDisplay(root: THREE.Object3D, mode: ModelDisplayMode, axis: ModelSectionAxis, position: number, box: THREE.Box3, keep: ModelSectionKeep = 'lower') {
  const plane = sectionPlane(box, axis, position, keep)
  const darkMode = Boolean(root.userData.displayDarkMode)
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    ensureEdgeOverlay(object, darkMode, mode, plane)
    const materials = Array.isArray(object.material) ? object.material : [object.material]
    for (const material of materials) {
      if ('wireframe' in material) material.wireframe = false
      material.visible = mode === 'solid'
      material.transparent = false
      material.opacity = 1
      const wasClipped = Boolean(material.clippingPlanes?.length)
      material.clippingPlanes = plane ? [plane] : []
      material.side = THREE.DoubleSide
      if (wasClipped !== Boolean(plane)) material.needsUpdate = true
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
