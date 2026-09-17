import assert from 'node:assert/strict'
import * as THREE from 'three'
import { sectionPlane, applyModelDisplay, disposeModel } from '../src/utils/furnaceViewTools.ts'

const box = new THREE.Box3(new THREE.Vector3(-4, 0, -2), new THREE.Vector3(4, 8, 2))
for (const [axis, position, point, clipped] of [
  ['top', 3.25, [0, 2, 0], [0, 6, 0]],
  ['side', -0.5, [0, 2, -1], [0, 2, 1]],
  ['end', 1.5, [-2, 2, 0], [2, 2, 0]],
]) {
  const plane = sectionPlane(box, axis, position)
  assert.ok(plane.distanceToPoint(new THREE.Vector3(...point)) >= 0)
  assert.ok(plane.distanceToPoint(new THREE.Vector3(...clipped)) < 0)
  const reverse = sectionPlane(box, axis, position, 'upper')
  assert.ok(reverse.distanceToPoint(new THREE.Vector3(...point)) < 0)
  assert.ok(reverse.distanceToPoint(new THREE.Vector3(...clipped)) >= 0)
}
assert.equal(sectionPlane(box, 'none', 50), null)
const root = new THREE.Group()
const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial())
root.add(mesh)
applyModelDisplay(root, 'wireframe', 'side', -0.5, box)
assert.equal(mesh.material.visible, false)
const edges = mesh.getObjectByName('__edge-overlay')
assert.equal(edges.geometry.attributes.position.count, 24, 'A box shows 12 boundary edges with no face diagonals')
assert.equal(edges.material.clippingPlanes[0].constant, -0.5)
assert.equal(mesh.material.clippingPlanes.length, 1)
assert.equal(mesh.material.side, THREE.DoubleSide)
applyModelDisplay(root, 'solid', 'none', 50, box)
assert.equal(mesh.material.wireframe, false)
assert.equal(mesh.material.clippingPlanes.length, 0)
assert.equal(mesh.material.visible, true)
assert.equal(mesh.material.transparent, false)
assert.equal(mesh.material.opacity, 1)
assert.equal(mesh.children.length, 1, 'Mode changes reuse the edge geometry')
let disposed = 0
edges.geometry.addEventListener('dispose', () => disposed++)
disposeModel(root)
assert.equal(disposed, 1)
console.log('Furnace boundary edges, opaque solids, custom clipping positions and resource cleanup passed')
