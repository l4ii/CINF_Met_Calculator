import * as THREE from 'three'
import type { FurnaceLayout } from './copperFurnaceGeometry.ts'
import type { LeadKivcetGeometry, LeadKivcetGeometryPart } from './leadKivcetGeometry.ts'
import type { ModelComponentManifest } from './modelComponentManifest.ts'

/**
 * Scene builders shared by both furnace viewers.  The returned group contains
 * only model geometry; camera helpers, lights and grids belong to the viewport.
 * Every selectable physical component is one mesh with a stable manifest id.
 */

function material(color: number, darkMode: boolean) {
  return new THREE.MeshStandardMaterial({
    color: darkMode ? new THREE.Color(color).multiplyScalar(0.82) : color,
    roughness: 0.4,
    metalness: 0.24,
    side: THREE.DoubleSide,
    transparent: false,
    opacity: 1,
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
function flaredBodyMesh(manifest: ModelComponentManifest, layout: FurnaceLayout, darkMode: boolean): THREE.Mesh {
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
  return identify(new THREE.Mesh(faces, material(0x9a3412, darkMode)), manifest)
}

function addManifestMesh(root: THREE.Group, mesh: THREE.Mesh, manifest: ModelComponentManifest, position: THREE.Vector3) {
  mesh.position.copy(position)
  groupFor(root, manifest).add(mesh)
}

function manifestByGeometryId(manifests: ModelComponentManifest[], geometryId: string) {
  return manifests.find((entry) => entry.geometryId === geometryId)
}

export function buildSmeltingModelScene(layout: FurnaceLayout, darkMode: boolean): THREE.Group {
  const root = new THREE.Group()
  root.name = 'smelting-model-scene'
  root.userData.displayDarkMode = darkMode
  const manifests = layout.components ?? []
  const bodyManifest = manifests.find((entry) => entry.id === 'smelting.primary-body')
  if (bodyManifest) {
    const body = flaredBodyMesh(bodyManifest, layout, darkMode)
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
    const geometry = new THREE.CylinderGeometry(tuyere.radiusM, tuyere.radiusM, tuyere.lengthM, 24)
    const mesh = identify(new THREE.Mesh(geometry, material(0xdc2626, darkMode)), manifest)
    mesh.rotation.x = Math.PI / 2
    addManifestMesh(root, mesh, manifest, new THREE.Vector3(tuyere.centerXM, tuyere.centerYM, tuyere.centerZM))
  }
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
