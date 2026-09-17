import assert from 'node:assert/strict'
import * as THREE from 'three'
import { buildSmeltingFurnaceLayout } from '../src/utils/copperFurnaceGeometry.ts'
import { buildLeadKivcetGeometry } from '../src/utils/leadKivcetGeometry.ts'
import { buildSmeltingModelScene } from '../src/utils/furnaceModelScene.ts'
import { furnaceBodyBounds, disposeModel } from '../src/utils/furnaceViewTools.ts'
import { startModelHistory, recordModelEdit, stepModelHistory } from '../src/utils/modelEditHistory.ts'

const design = { designLengthM: 34.5, furnaceLengthM: 34.5, furnaceWidthM: 2.2, jacketPitchMm: 600, jacketCountOneSide: 8, tuyereCountOneSide: 8 }
const layout = buildSmeltingFurnaceLayout(design)
const scene = buildSmeltingModelScene(layout, false)
const assembly = new THREE.Box3().setFromObject(scene)
const body = furnaceBodyBounds(layout.components, assembly)
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-5, `${actual} != ${expected}`)
near(body.min.x, -17.25); near(body.max.x, 17.25)
near(body.min.z, -1.1); near(body.max.z, 1.1)
near(body.min.y, 0); near(body.max.y, layout.body.heightM)
near(assembly.max.x - assembly.min.x, 36.3)
near(assembly.max.z - assembly.min.z, 4)
disposeModel(scene)
const moved = buildSmeltingFurnaceLayout(design, { 'smelting.primary-body': { centerXM: 5, centerYM: 3, centerZM: -2 } })
const movedBody = furnaceBodyBounds(moved.components, assembly)
near(movedBody.min.x, -12.25); near(movedBody.max.x, 22.25)
near(movedBody.min.y, 3); near(movedBody.max.y, 3 + moved.body.heightM)
near(movedBody.min.z, -3.1); near(movedBody.max.z, -0.9)
const kivcet = buildLeadKivcetGeometry({ bodyLengthM: 10, bodyWidthM: 4, bodyHeightM: 6 })
const kivcetBody = furnaceBodyBounds(kivcet.components, assembly)
near(kivcetBody.max.y - kivcetBody.min.y, 6)
near(kivcetBody.min.y, 0)

let history = startModelHistory({})
const first = { a: { centerXM: 2, centerYM: 1, centerZM: 3 } }
const second = { ...first, b: { lengthM: 9 }, 'smelting.annotation.counts': { jacketPitchM: 0.7 } }
history = recordModelEdit(history, first, '移动')
history = recordModelEdit(history, second, '调节尺寸')
history = recordModelEdit(history, {}, '全部恢复')
history = stepModelHistory(history, 'undo')
assert.deepEqual(history.present.overrides, second, 'Undo reset restores all component and metadata overrides atomically')
history = stepModelHistory(history, 'undo')
assert.deepEqual(history.present.overrides, first)
history = stepModelHistory(history, 'undo')
assert.deepEqual(history.present.overrides, {}, 'Undo returns to inherited calculation defaults, not baked dimensions')
history = stepModelHistory(history, 'redo')
assert.deepEqual(history.present.overrides, first)
history = recordModelEdit(history, { c: { heightM: 3 } }, '新操作')
assert.equal(history.future.length, 0)
assert.equal(recordModelEdit(history, history.present.overrides, '相同值'), history)
for (let index = 0; index < 60; index++) history = recordModelEdit(history, { c: { heightM: index + 1 } }, '调整')
assert.equal(history.past.length, 50)
console.log('Nominal body / assembly bounds, moved-body origins, atomic undo/redo and history limits passed')
