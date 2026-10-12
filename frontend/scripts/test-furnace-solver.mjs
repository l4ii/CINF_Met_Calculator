import assert from 'node:assert/strict'
import { createFlowGrid, inletSpeedMs, stepFlowGrid } from '../src/utils/furnaceSideBlowSolver.ts'
import { buildSmeltingFurnaceLayout, hearthSagM } from '../src/utils/copperFurnaceGeometry.ts'
import { buildSmeltingModelScene } from '../src/utils/furnaceModelScene.ts'
import { buildFluidDomain, clampLanceInsertionM, furnaceWallHalfWidthM, horizontalInteriorSection, longitudinalCenterProfile } from '../src/utils/furnaceFluidDomain.ts'
import { alignAxisToSurface, buildTetMesh, estimateTetCount, MAX_TET_COUNT } from '../src/utils/furnaceTetMesh.ts'
import { createTetFlow, stepTetFlow } from '../src/utils/furnaceTetSolver.ts'

const params = {
  widthM: 3.2,
  heightM: 2.4,
  liquidLevelM: 0.8,
  lanceHeightM: 0.45,
  inletSpeedMs: inletSpeedMs(1200, 0.04),
  inletRadiusM: 0.04,
}
const grid = createFlowGrid(params)
assert.equal(grid.nx > 0, true)
assert.ok('pressure' in grid && 'k' in grid && 'epsilon' in grid && 'nuT' in grid && 'injectedGas' in grid)
for (let i = 0; i < 4; i += 1) stepFlowGrid(grid, params, 'both')
for (const field of [grid.phi, grid.u, grid.v, grid.pressure, grid.k, grid.epsilon, grid.nuT, grid.rho, grid.injectedGas]) {
  for (const value of field) assert.equal(Number.isFinite(value), true)
}
assert.ok(Math.min(...grid.phi) >= 0 && Math.max(...grid.phi) <= 1)
assert.ok(Math.min(...grid.k) >= 0 && Math.min(...grid.epsilon) > 0)
const nearInletTracer = []
for (let j = 1; j < grid.ny - 1; j += 1) {
  for (let i = 1; i <= 4; i += 1) nearInletTracer.push(grid.injectedGas[i + j * grid.nx])
}
assert.ok(Math.max(...nearInletTracer) > 0.1, 'the inlet gas tracer must enter interior furnace cells')
assert.ok(Math.min(...grid.injectedGas) >= 0 && Math.max(...grid.injectedGas) <= 1)
assert.ok(Number.isFinite(grid.pressureResidual) && Number.isFinite(grid.massError))
assert.ok(inletSpeedMs(2400, 0.04) > inletSpeedMs(1200, 0.04))
assert.ok(Math.abs(inletSpeedMs(1200, 0.02) / inletSpeedMs(1200, 0.04) - 4) < 1e-10, 'halving inlet diameter must quadruple inlet speed at fixed flow')

function inletCellCount(radiusM) {
  const inletParams = { ...params, inletRadiusM: radiusM }
  const inletGrid = createFlowGrid(inletParams)
  stepFlowGrid(inletGrid, inletParams, 'front')
  return Array.from({ length: inletGrid.ny }, (_, j) => inletGrid.u[inletGrid.nx - 1 + j * inletGrid.nx])
    .filter((velocity) => velocity < 0).length
}
assert.ok(inletCellCount(0.08) > inletCellCount(0.02), 'a larger nozzle radius must occupy more vertical inlet cells')

const layout = buildSmeltingFurnaceLayout({
  designLengthM: 4,
  furnaceLengthM: 4,
  furnaceWidthM: params.widthM,
  jacketPitchMm: 1000,
  jacketCountOneSide: 2,
  tuyereCountOneSide: 2,
})
const flow = {
  field: 'velocity',
  openTuyereIds: layout.tuyeres.map((tuyere) => tuyere.id),
  perTuyereNm3h: 1200,
  liquidLevelM: params.liquidLevelM,
  lanceHeightM: params.lanceHeightM,
  lanceInsertionM: 0.05,
  tuyereDiameterM: 0.04,
  viewMode: 'section',
  horizontalSliceM: 1.2,
  showHorizontalSlice: true,
  showLongitudinalSlice: true,
  showArrows: false,
}
const model = buildSmeltingModelScene(layout, false, flow)
let frontTuyere
model.traverse((object) => {
  if (object.userData.manifest?.geometryId === 'tuyere-front-1') frontTuyere = object
})
assert.ok(frontTuyere, 'the front tuyere mesh must be present in the scene')
assert.equal(frontTuyere.geometry.parameters.radiusTop, 0.02, 'the displayed tuyere must use the configured 40 mm diameter')
const plain = buildSmeltingModelScene(layout, false)
let plainTuyere
plain.traverse((object) => {
  if (object.userData.manifest?.geometryId === 'tuyere-front-1') plainTuyere = object
})
const plainWallZ = layout.body.centerZM + layout.flare.bottomWidthM / 2
const plainTipZ = plainTuyere.position.z - plainTuyere.geometry.parameters.height / 2
assert.ok(Math.abs(plainTipZ - (plainWallZ - layout.lanceInsertionM)) < 1e-6, 'the lance tip is the insertion depth inside the wall')
assert.equal(plainTuyere.geometry.parameters.radiusTop, layout.lanceDiameterM / 2)
assert.ok(Math.abs(frontTuyere.position.y - (layout.body.centerYM + flow.lanceHeightM)) < 1e-8, 'insertion depth must not lower the tuyere height')
assert.ok(Math.abs(frontTuyere.position.z - (layout.tuyeres.find((item) => item.id === 'tuyere-front-1').centerZM - flow.lanceInsertionM)) < 1e-8, 'front-side insertion must extend into the furnace along Z')
assert.equal(model.getObjectByName('flow-inlet-arrow'), undefined)
assert.ok(model.getObjectByName('liquid-surface'), 'the liquid surface is drawn with the simulation view')
assert.ok(model.getObjectByName('liquid-surface-arrow'), 'a downward arrow marks the liquid below the surface')
const lowHalf = furnaceWallHalfWidthM(layout, layout.body.centerYM + 0.45)
const highHalf = furnaceWallHalfWidthM(layout, layout.body.centerYM + layout.body.heightM * 0.75)
assert.ok(highHalf > lowHalf + 0.05, 'the flared wall is wider than the straight bath')
const cappedInsertion = clampLanceInsertionM(layout, 0.45, 0.04, 100)
assert.ok(cappedInsertion <= lowHalf - 0.02 && cappedInsertion > lowHalf - 0.04, 'insertion stops one radius short of the center')
const raisedHeight = layout.body.heightM * 0.75
const raised = buildSmeltingModelScene(layout, false, { ...flow, lanceHeightM: raisedHeight, lanceInsertionM: 0.05 })
let raisedTuyere
let raisedJacket
raised.traverse((object) => {
  if (object.userData.manifest?.geometryId === 'tuyere-front-1') raisedTuyere = object
  if (object.userData.manifest?.geometryId === 'jacket-front-1') raisedJacket = object
})
assert.ok(Math.abs(raisedTuyere.position.y - (layout.body.centerYM + raisedHeight)) < 1e-8, 'raising the lance moves the tuyere')
const raisedWall = furnaceWallHalfWidthM(layout, layout.body.centerYM + raisedHeight)
const raisedTip = raisedTuyere.position.z - raisedTuyere.geometry.parameters.height / 2
assert.ok(Math.abs(raisedTip - (raisedWall - 0.05)) < 1e-6, 'the lance tip follows the flared wall minus the insertion')
const designJacket = layout.jackets.find((jacket) => jacket.id === 'jacket-front-1')
assert.ok(raisedJacket.position.y > designJacket.centerYM, 'the water jacket rises with the lance')
assert.ok(raisedJacket.position.z > designJacket.centerZM, 'the water jacket follows the wider upper wall')

const sliceY = layout.body.centerYM + flow.horizontalSliceM
const nadirY = layout.body.centerYM - hearthSagM(layout.flare.bottomWidthM)
const crownY = layout.flue.centerYM + layout.flue.heightM / 2
const midY = (crownY + nadirY) / 2
const synthetic = {
  type: 'frame',
  serial: 1,
  inletSpeedMs: 1,
  meshId: 1,
  count: 4,
  tetCount: 4,
  inletCount: 1,
  outletCount: 1,
  centroids: new Float32Array([
    layout.body.centerXM, sliceY, layout.body.centerZM - 0.7,
    layout.body.centerXM, sliceY, layout.body.centerZM + 0.7,
    layout.body.centerXM - 1.4, midY, layout.body.centerZM,
    layout.body.centerXM + 1.4, midY, layout.body.centerZM,
  ]),
  phi: new Float32Array([1, 0, 1, 0]),
  speed: new Float32Array([0.05, 1, 0.05, 1]),
  pressure: new Float32Array([0, 10, 0, -10]),
  injectedGas: new Float32Array([0, 1, 0, 1]),
  u: new Float32Array([0, 0, 1, -1]),
  v: new Float32Array([0, 0, 0, 0]),
  w: new Float32Array([1, -1, 0, 0]),
  minX: layout.body.centerXM - 2,
  maxX: layout.body.centerXM + 2,
  minY: Math.min(sliceY, midY) - 0.3,
  maxY: Math.max(sliceY, midY) + 0.3,
  minZ: layout.body.centerZM - 1.2,
  maxZ: layout.body.centerZM + 1.2,
  physicalTimeS: 0,
  dtS: 0,
  pressureResidual: 0,
  divergenceMax: 0,
  divergenceRms: 0,
  massError: 0,
  iterations: 0,
}
model.getObjectByName('flow-schematic').userData.paint(synthetic)
const horizontalNode = model.getObjectByName('flow-horizontal-slice')
const horizontalMesh = horizontalNode.children[0]
const { data: horizontalPixels, width: horizontalWidth, height: horizontalHeight } = horizontalMesh.material.map.image
const centerColumn = Math.floor(horizontalWidth / 2)
const colorsAcrossFurnaceWidth = new Set(Array.from({ length: horizontalHeight }, (_, row) => {
  const offset = (row * horizontalWidth + centerColumn) * 4
  return `${horizontalPixels[offset]},${horizontalPixels[offset + 1]},${horizontalPixels[offset + 2]},${horizontalPixels[offset + 3]}`
}))
assert.ok(colorsAcrossFurnaceWidth.size > 1, 'the lance-height slice must vary across furnace width')
const longitudinalMesh = model.getObjectByName('flow-longitudinal-slice').children[0]
const { data: longitudinalPixels, width: longitudinalWidth, height: longitudinalHeight } = longitudinalMesh.material.map.image
const midRow = Math.floor(longitudinalHeight / 2)
const colorsAlongLength = new Set(Array.from({ length: longitudinalWidth }, (_, column) => {
  const offset = (midRow * longitudinalWidth + column) * 4
  return `${longitudinalPixels[offset]},${longitudinalPixels[offset + 1]},${longitudinalPixels[offset + 2]},${longitudinalPixels[offset + 3]}`
}))
assert.ok(colorsAlongLength.size > 1, 'the longitudinal center slice must vary along the furnace length')
assert.equal(layout.lanceInsertionM, 0.1, 'default tuyere insertion is 100 mm')
assert.equal(layout.components.some((item) => item.id === 'smelting.process-connection.flue'), false, 'the flue is part of the shell and is not a separate part')
const lowSection = horizontalInteriorSection(layout, sliceY)
assert.ok(lowSection, 'the lance-height slice stays inside the body')
assert.ok(Math.abs(lowSection.widthM - layout.flare.bottomWidthM) < 1e-6, 'a lower horizontal slice uses the bath width')
assert.ok(Math.abs(lowSection.lengthM - layout.body.lengthM) < 1e-6, 'a horizontal slice uses the furnace length')
const horizontalPositions = horizontalMesh.geometry.getAttribute('position')
let horizontalHalfZ = 0
for (let index = 0; index < horizontalPositions.count; index += 1) horizontalHalfZ = Math.max(horizontalHalfZ, Math.abs(horizontalPositions.getZ(index)))
assert.ok(Math.abs(horizontalHalfZ * 2 - lowSection.widthM) < 1e-6, 'the horizontal slice mesh matches the interior width')
const highSection = horizontalInteriorSection(layout, layout.body.centerYM + layout.body.heightM * 0.75)
assert.ok(highSection.widthM > layout.flare.bottomWidthM && highSection.widthM < layout.flare.topWidthM + 1e-6, 'the flared slice widens with height and stays inside the roof')
const flueSection = horizontalInteriorSection(layout, layout.flue.centerYM)
assert.ok(Math.abs(flueSection.lengthM - layout.flue.lengthM) < 1e-6 && Math.abs(flueSection.widthM - layout.flue.widthM) < 1e-6, 'a slice in the flue matches the flue opening')
const profile = longitudinalCenterProfile(layout)
let minBodyY = Infinity
let maxBodyY = -Infinity
let maxBodyX = 0
const bodyPositions = longitudinalMesh.geometry.getAttribute('position')
for (let index = 0; index < bodyPositions.count; index += 1) {
  minBodyY = Math.min(minBodyY, longitudinalMesh.position.y + bodyPositions.getY(index))
  maxBodyY = Math.max(maxBodyY, longitudinalMesh.position.y + bodyPositions.getY(index))
  maxBodyX = Math.max(maxBodyX, Math.abs(bodyPositions.getX(index)))
}
assert.ok(Math.abs(minBodyY - profile.nadirYM) < 1e-6, 'the longitudinal slice starts at the hearth nadir')
assert.ok(Math.abs(maxBodyY - profile.shellTopYM) < 1e-6, 'the longitudinal body slice stops at the roof')
assert.ok(Math.abs(maxBodyX * 2 - profile.lengthM) < 1e-6, 'the longitudinal slice spans the furnace length')
const flueSlice = model.getObjectByName('flow-longitudinal-slice').children[1]
assert.ok(flueSlice, 'the flue is drawn only above its opening')
let maxFlueY = -Infinity
let maxFlueX = 0
const fluePositions = flueSlice.geometry.getAttribute('position')
for (let index = 0; index < fluePositions.count; index += 1) {
  maxFlueY = Math.max(maxFlueY, flueSlice.position.y + fluePositions.getY(index))
  maxFlueX = Math.max(maxFlueX, Math.abs(fluePositions.getX(index)))
}
assert.ok(Math.abs(maxFlueY - profile.flue.y1) < 1e-6, 'the flue slice reaches the flue crown')
assert.ok(Math.abs(maxFlueX * 2 - layout.flue.lengthM) < 1e-6, 'the flue slice is no wider than the flue opening')
const volumeModel = buildSmeltingModelScene(layout, false, { ...flow, viewMode: 'volume', showHorizontalSlice: false, showLongitudinalSlice: false, horizontalSliceM: null })
assert.ok(volumeModel.getObjectByName('flow-volume'), 'volume mode draws the field inside the furnace')
assert.equal(volumeModel.getObjectByName('flow-horizontal-slice'), undefined)
assert.equal(volumeModel.getObjectByName('flow-longitudinal-slice'), undefined)

// 关闭全部风口后入口速度为 0，长步数仍需保持有界与有限。
const idleParams = { ...params, inletSpeedMs: 0 }
const idleGrid = createFlowGrid(idleParams)
for (let i = 0; i < 100; i += 1) stepFlowGrid(idleGrid, idleParams, 'both')
assert.equal(inletSpeedMs(0, 0.04), 0)
assert.ok(Math.min(...idleGrid.phi) >= 0 && Math.max(...idleGrid.phi) <= 1)
for (const field of [idleGrid.u, idleGrid.v, idleGrid.pressure, idleGrid.k, idleGrid.epsilon, idleGrid.nuT]) {
  for (const value of field) assert.equal(Number.isFinite(value), true)
}

// 单侧与长步数工况。
for (const side of ['front', 'back']) {
  const single = createFlowGrid(params)
  for (let i = 0; i < 100; i += 1) stepFlowGrid(single, params, side)
  for (const value of single.phi) assert.equal(Number.isFinite(value), true)
  assert.ok(Math.min(...single.phi) >= 0 && Math.max(...single.phi) <= 1)
}

// Worker 帧协议：三维网格、开启喷枪才有入口、重配后入口消失。
const published = []
globalThis.postMessage = (frame) => published.push(frame)
await import('../src/workers/furnaceSideBlowSolver.worker.ts')
const domainOptions = {
  lanceDiameterM: 0.04,
  lanceHeightM: params.lanceHeightM,
  lanceInsertionM: 0.05,
}
globalThis.onmessage({
  data: {
    type: 'configure',
    playing: false,
    layout,
    openTuyereIds: layout.tuyeres.map((tuyere) => tuyere.id),
    ...domainOptions,
    liquidLevelM: params.liquidLevelM,
    inletSpeedMs: params.inletSpeedMs,
    liquidDensityKgM3: 3500,
  },
})
const frame = published.at(-1)
assert.ok(frame.tetCount > 0 && frame.tetCount <= MAX_TET_COUNT)
assert.ok(frame.inletCount > 0)
assert.ok(frame.outletCount > 0)
assert.equal(frame.count, frame.tetCount)
for (const key of ['physicalTimeS', 'dtS', 'pressureResidual', 'divergenceMax', 'divergenceRms', 'massError', 'iterations', 'cellSizeM']) {
  assert.equal(Number.isFinite(frame[key]), true, `${key} must be finite`)
}
globalThis.onmessage({
  data: {
    type: 'configure',
    playing: false,
    layout,
    openTuyereIds: [],
    ...domainOptions,
    liquidLevelM: params.liquidLevelM,
    inletSpeedMs: 0,
    liquidDensityKgM3: 3500,
  },
})
assert.equal(published.at(-1).inletCount, 0)
assert.ok(published.at(-1).outletCount > 0)
globalThis.onmessage({ data: { type: 'stop' } })

const nadir = layout.body.centerYM - hearthSagM(layout.flare.bottomWidthM)
assert.ok(nadir < layout.body.centerYM, 'the hearth center extends below the old flat floor')
const foundationTop = layout.foundation.centerYM + layout.foundation.heightM / 2
const foundationBottom = layout.foundation.centerYM - layout.foundation.heightM / 2
assert.ok(Math.abs(foundationTop - layout.body.centerYM) < 1e-6, 'the foundation top stays flush with the old floor')
assert.ok(nadir < foundationTop && nadir > foundationBottom, 'the dish is cut into the foundation')
const domain = buildFluidDomain(layout, { ...domainOptions, openTuyereIds: layout.tuyeres.map((tuyere) => tuyere.id) })
assert.ok(Math.abs(domain.nadirYM - nadir) < 1e-8)
assert.equal(domain.contains(layout.foundation.centerXM, layout.foundation.centerYM, layout.foundation.centerZM), false)
assert.equal(domain.contains(layout.body.centerXM, nadir + 0.02, layout.body.centerZM), true)
assert.equal(domain.contains(layout.flue.centerXM, layout.flue.centerYM, layout.flue.centerZM), true)
assert.equal(domain.contains(layout.body.centerXM, domain.flueTopYM + 0.05, layout.body.centerZM), false)
assert.equal(domain.contains(layout.body.centerXM + layout.body.lengthM * 0.48, domain.shellTopYM + 0.05, layout.body.centerZM), false)
const closed = buildFluidDomain(layout, { ...domainOptions, openTuyereIds: [] })
const closedMesh = buildTetMesh(closed)
const openMesh = buildTetMesh(domain)
assert.equal(closedMesh.inletCount, 0, 'closed lances are not inlets')
assert.ok(closedMesh.outletCount > 0, 'the flue top remains the outlet')
assert.equal(openMesh.inletCount, domain.lances.length, 'each open lance keeps one inlet face')
assert.ok(openMesh.tetCount > 0 && openMesh.tetCount <= MAX_TET_COUNT)
for (let index = 0; index < openMesh.boundaryCount; index += 1) {
  if (openMesh.boundaryKind[index] !== 2) continue
  const y = openMesh.boundaryCentroid[index * 3 + 1]
  assert.ok(y > domain.shellTopYM + layout.flue.heightM * 0.45, 'outlet faces stay on the flue crown')
}
const tetParams = { liquidLevelM: params.liquidLevelM, inletSpeedMs: params.inletSpeedMs, liquidDensityKgM3: 3500 }
const tetState = createTetFlow(openMesh, tetParams)
const surface = openMesh.nadirYM + tetParams.liquidLevelM
for (let tet = 0; tet < openMesh.tetCount; tet += 1) {
  const y = openMesh.centroids[tet * 3 + 1]
  if (y <= surface + 1e-6) assert.equal(tetState.phi[tet], 1)
  else assert.equal(tetState.phi[tet], 0)
}
for (let step = 0; step < 4; step += 1) stepTetFlow(tetState, tetParams)
for (const value of tetState.phi) {
  assert.equal(Number.isFinite(value), true)
  assert.ok(value >= 0 && value <= 1)
}
for (const field of [tetState.u, tetState.v, tetState.w, tetState.speed, tetState.pressure]) {
  for (const value of field) assert.equal(Number.isFinite(value), true)
}
assert.deepEqual(alignAxisToSurface([0, 0.4, 0.8, 1.2], 0.5), [0, 0.5, 0.8, 1.2])
const surfaceYM = domain.liquidSurfaceYM(params.liquidLevelM)
const aligned = buildTetMesh(domain, { targetTetCount: 20_000, liquidSurfaceYM: surfaceYM })
const alignedState = createTetFlow(aligned, tetParams)
let maxLiquid = -Infinity
let minGas = Infinity
for (let tet = 0; tet < aligned.tetCount; tet += 1) {
  const y = aligned.centroids[tet * 3 + 1]
  if (alignedState.phi[tet] === 1) maxLiquid = Math.max(maxLiquid, y)
  else minGas = Math.min(minGas, y)
}
assert.ok(maxLiquid <= surfaceYM + 1e-4 && minGas >= surfaceYM - 1e-4, 'initial liquid stays on one side of the flat surface')
assert.ok(minGas - maxLiquid < aligned.cellSizeM * 1.5, 'the initial interface stays within one cell of the flat surface')
assert.ok(Math.abs(aligned.zoneSizeM.tuyereM - 0.04) < 1e-6, 'tuyere edge follows the nozzle diameter')
assert.ok(Math.abs(aligned.zoneSizeM.bathM - 0.2) < 1e-6, 'the bath uses 200 mm cells')
assert.ok(aligned.zoneSizeM.gasM > aligned.zoneSizeM.bathM, 'the gas space is coarser than the bath')
assert.ok(aligned.tetCount > 1000, 'the geometric rule produces a resolved furnace mesh')
assert.ok(openMesh.wirePositions.length >= 24, 'the mesh keeps edge lines for display')
assert.ok(estimateTetCount(domain.bounds, domain.flueTopYM - domain.shellTopYM, 1_000_000) <= MAX_TET_COUNT)
assert.ok(estimateTetCount(domain.bounds, domain.flueTopYM - domain.shellTopYM, 300_000) > estimateTetCount(domain.bounds, domain.flueTopYM - domain.shellTopYM, 20_000))
console.log('furnace solver smoke test passed')

