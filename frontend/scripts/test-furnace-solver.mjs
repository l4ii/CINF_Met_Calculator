// 侧吹炉 VOF + k-ε 仿真回归测试：node --experimental-strip-types scripts/test-furnace-solver.mjs
import assert from 'node:assert/strict'
import { FURNACE_SIM_CONFIG } from '../src/config/furnaceSimConfig.ts'
import { buildSmeltingFurnaceLayout, hearthSagM } from '../src/utils/copperFurnaceGeometry.ts'
import { buildFluidDomain, clampLanceInsertionM, furnaceWallHalfWidthM } from '../src/utils/furnaceFluidDomain.ts'
import { inletGasDensityKgM3, inletSpeedMs } from '../src/utils/furnaceGasInlet.ts'
import { buildFlowPostGroup, buildSmeltingModelScene } from '../src/utils/furnaceModelScene.ts'
import { buildFurnaceMesh, buildSimMesh, FACE_INLET } from '../src/utils/furnaceSim/mesh.ts'
import { createFieldBuffers, createFlowHistory, decodeFlowSnapshot, recordFlowSnapshot } from '../src/utils/furnaceSim/history.ts'
import { buildIsoSurface, buildPostGeometry, buildSlices, buildStreamlines, createPostContext, isoArea, traceStreamline, velocityNodes } from '../src/utils/furnaceSim/post.ts'
import { advanceSteadyDetector, createFlowState, flowComplete, flowFields, flowStatus, staticPressure, stepFlow, updateDensity } from '../src/utils/furnaceSim/solver.ts'

const started = Date.now()
const log = (label, value) => console.log(`  ${label}: ${value}`)
const axis = (lo, hi, n) => Array.from({ length: n + 1 }, (_, i) => lo + ((hi - lo) * i) / n)
const fluid = FURNACE_SIM_CONFIG.fluid

// ---------- 气体入口换算 ----------
assert.equal(inletSpeedMs(0, 0.02), 0)
assert.ok(inletSpeedMs(2400, 0.02) > inletSpeedMs(1200, 0.02))
assert.ok(Math.abs(inletSpeedMs(1200, 0.01) / inletSpeedMs(1200, 0.02) - 4) < 1e-10, 'halving the nozzle diameter quadruples the speed')
const gasDensity = inletGasDensityKgM3({ oxygenFraction: 0.996 })
assert.ok(gasDensity > 1.7 && gasDensity < 2, 'O₂ at 293 K / 140 kPa is about 1.84 kg/m³')

// ---------- 网格 ----------
console.log('mesh')
const layout = buildSmeltingFurnaceLayout({ designLengthM: 10, furnaceLengthM: 10, furnaceWidthM: 2.2, jacketPitchMm: 1000, jacketCountOneSide: 8, tuyereCountOneSide: 8 })
const allTuyeres = layout.tuyeres.map((tuyere) => tuyere.id)
const lanceHeightM = layout.tuyeres[0].centerYM
const domainOptions = { lanceDiameterM: 0.04, lanceHeightM, lanceInsertionM: 0.1 }
const domain = buildFluidDomain(layout, { ...domainOptions, openTuyereIds: allTuyeres })
const liquidLevelM = 2
const surface = domain.liquidSurfaceYM(liquidLevelM)
assert.ok(surface > domain.lances[0].centerYM + 0.2, 'the test lance is submerged')
const production = buildFurnaceMesh(domain, { liquidSurfaceYM: surface })
{
  const { stats } = production
  const nozzleD = domainOptions.lanceDiameterM
  log('production', `${stats.fluidCells} cells, h ${stats.baseSizeM.toFixed(3)} m, ratio ${stats.maxRatio.toFixed(2)}, band ${stats.bandLayers} layers ≤ ${(stats.bandCellM * 1000).toFixed(0)} mm`)
  assert.ok(stats.fluidCells >= FURNACE_SIM_CONFIG.mesh.minTargetCells, 'the production mesh is at least the configured minimum')
  assert.ok(stats.removedCells / stats.fluidCells < 0.005, 'almost no isolated fragments')
  assert.ok(stats.maxRatio <= 1.4, 'neighbouring cells grow smoothly')
  assert.ok(Math.abs(stats.inletAreaM2 / stats.nozzleAreaM2 - 1) <= 0.02, 'inlet open area equals the nozzle area')
  assert.ok(production.outlets.length > 0 && stats.outletAreaM2 > 0, 'the flue crown is an outlet')
  assert.ok(stats.bandLayers >= 4 && stats.bandCellM <= nozzleD * 1.05, 'the tuyere and surface bands use nozzle-diameter layers')
  const lanceY = domain.lances[0].centerYM
  for (const [a, b] of [[lanceY - 0.1, lanceY + 0.1], [surface - 0.1, surface + 0.1]]) {
    for (let j = 0; j < production.ny; j += 1) {
      if (production.ys[j] < a - 1e-9 || production.ys[j + 1] > b + 1e-9) continue
      assert.ok(production.dy[j] <= nozzleD * 1.05, 'every layer fully inside a band is no thicker than the nozzle')
    }
  }
  for (const array of [production.vf, production.ax, production.ay, production.az]) for (const value of array) assert.ok(value >= 0 && value <= 1)
}
const small = buildFurnaceMesh(domain, { targetCells: 8_000, liquidSurfaceYM: surface })
log('small', `${small.stats.fluidCells} cells for the solver checks, band ${small.stats.bandCellM.toFixed(3)} m`)
assert.ok(small.stats.bandCellM <= domainOptions.lanceDiameterM * 1.05, 'the small mesh keeps the nozzle-diameter bands')
{
  // 洪泛填充：所有流体单元经开口面连通。
  const mesh = small
  const { nx, ny, nz, vf, ax, ay, az } = mesh
  const seen = new Uint8Array(mesh.cellCount)
  const queue = []
  let total = 0
  for (let c = 0; c < mesh.cellCount; c += 1) if (vf[c] > 0) total += 1
  const seed = vf.findIndex((value) => value > 0)
  queue.push(seed)
  seen[seed] = 1
  let reached = 0
  while (queue.length) {
    const c = queue.pop()
    reached += 1
    const i = c % nx
    const j = Math.floor(c / nx) % ny
    const k = Math.floor(c / (nx * ny))
    const go = (other, open) => { if (open > 0 && !seen[other] && vf[other] > 0) { seen[other] = 1; queue.push(other) } }
    if (i > 0) go(c - 1, ax[i + (nx + 1) * (j + ny * k)])
    if (i < nx - 1) go(c + 1, ax[i + 1 + (nx + 1) * (j + ny * k)])
    if (j > 0) go(c - nx, ay[i + nx * (j + (ny + 1) * k)])
    if (j < ny - 1) go(c + nx, ay[i + nx * (j + 1 + (ny + 1) * k)])
    if (k > 0) go(c - nx * ny, az[c])
    if (k < nz - 1) go(c + nx * ny, az[c + nx * ny])
  }
  assert.equal(reached, total, 'every fluid cell is reachable through open faces')
  assert.ok(mesh.inlets.every((inlet) => mesh.kindZ[inlet.face] === FACE_INLET && vf[inlet.cell] > 0))
}
const closedDomain = buildFluidDomain(layout, { ...domainOptions, openTuyereIds: [] })
const closedMesh = buildFurnaceMesh(closedDomain, { targetCells: 8_000, liquidSurfaceYM: surface })
assert.equal(closedMesh.stats.inletAreaM2, 0, 'closed lances are not inlets')
assert.ok(closedMesh.inlets.length > 0 && closedMesh.inlets.length === small.inlets.length, 'every lance keeps its tip face')
assert.equal(closedMesh.stats.fluidCells, small.stats.fluidCells, 'opening or closing lances does not change the mesh')

const baseInputs = {
  liquidDensityKgM3: 3500,
  gasDensityKgM3: gasDensity,
  liquidViscosityPaS: fluid.liquidViscosityPaS,
  gasViscosityPaS: fluid.gasViscosityPaS,
  nozzleDiameterM: 0.04,
  liquidSurfaceYM: surface,
}

// ---------- 静水 ----------
console.log('hydrostatic')
{
  const mesh = small
  const state = createFlowState(mesh, { ...baseInputs, inletSpeedMs: 0 })
  let maxSpeed = 0
  while (state.timeS < 1) {
    assert.ok(stepFlow(state))
    maxSpeed = Math.max(maxSpeed, state.monitors.maxSpeed)
  }
  const pressure = staticPressure(state)
  const top = mesh.ys[mesh.ny]
  let worst = 0
  for (let c = 0; c < mesh.cellCount; c += 1) {
    if (mesh.vf[c] <= 0) continue
    const y = mesh.yc[Math.floor(c / mesh.nx) % mesh.ny]
    if (y > surface - 0.2) continue
    const exact = baseInputs.liquidDensityKgM3 * fluid.gravity * (surface - y) + gasDensity * fluid.gravity * (top - surface)
    worst = Math.max(worst, Math.abs(pressure[c] - exact) / exact)
  }
  log('max spurious speed', `${maxSpeed.toExponential(2)} m/s over ${state.steps} steps`)
  log('pressure error vs ρgh', worst.toExponential(2))
  assert.ok(maxSpeed < 1e-3, 'a still bath stays still')
  assert.ok(worst < 0.01, 'pressure is hydrostatic')
}

// ---------- 溃坝（Martin & Moyce 1952, n² = 2） ----------
console.log('dam break')
{
  const a = 0.05715
  const h = a / 16
  const length = 5 * a
  const height = 3 * a
  const mesh = buildSimMesh({ xs: axis(0, length, Math.round(length / h)), ys: axis(0, height, Math.round(height / h)), zs: axis(0, 2 * h, 2), contains: () => true, lances: [], isOutlet: (_x, y) => y >= height - 1e-9 })
  const config = { ...FURNACE_SIM_CONFIG, numerics: { ...FURNACE_SIM_CONFIG.numerics, dtMaxS: 1e-3 } }
  const state = createFlowState(mesh, { liquidDensityKgM3: 1000, gasDensityKgM3: 1.2, liquidViscosityPaS: 1e-3, gasViscosityPaS: 1.8e-5, nozzleDiameterM: 0.01, liquidSurfaceYM: 2 * a, inletSpeedMs: 0 }, config)
  for (let c = 0; c < mesh.cellCount; c += 1) if (mesh.xc[c % mesh.nx] > a) state.alpha[c] = 0
  updateDensity(state)
  let liquid0 = 0
  for (let c = 0; c < mesh.cellCount; c += 1) liquid0 += state.alpha[c] * mesh.vol[c]
  const data = [[1.98, 2.33], [2.51, 3.0], [2.83, 3.44], [2.98, 3.67], [3.11, 3.89]]
  const scale = Math.sqrt((2 * fluid.gravity) / a)
  const fronts = []
  let next = 0
  while (next < data.length) {
    assert.ok(stepFlow(state))
    if (state.timeS * scale < data[next][0]) continue
    let front = 0
    for (let i = 0; i < mesh.nx - 1; i += 1) {
      const a0 = state.alpha[i]
      const a1 = state.alpha[i + 1]
      if (a0 >= 0.5 && a1 < 0.5) front = mesh.xc[i] + ((a0 - 0.5) / (a0 - a1)) * (mesh.xc[i + 1] - mesh.xc[i])
    }
    fronts.push(front / a)
    next += 1
  }
  log('front Z at T = 1.98…3.11', fronts.map((value, index) => `${value.toFixed(2)}/${data[index][1]}`).join(' '))
  const slope = (fronts[3] - fronts[0]) / (data[3][0] - data[0][0])
  const slopeData = (data[3][1] - data[0][1]) / (data[3][0] - data[0][0])
  log('front speed dZ/dT', `${slope.toFixed(2)} vs ${slopeData.toFixed(2)}`)
  assert.ok(Math.abs(slope / slopeData - 1) <= 0.1, 'the surge front speed matches the experiment')
  for (let index = 2; index < data.length; index += 1) assert.ok(Math.abs(fronts[index] / data[index][1] - 1) <= 0.1, `front position within 10% at T = ${data[index][0]}`)
  let liquid = 0
  for (let c = 0; c < mesh.cellCount; c += 1) liquid += state.alpha[c] * mesh.vol[c]
  assert.ok(Math.abs(liquid / liquid0 - 1) < 1e-6, 'VOF conserves liquid')
}

// ---------- 吹气：守恒、收敛、有界 ----------
console.log('blowing')
const perTuyereNm3h = 1200
function runBlowing(flowNm3h, physicalS) {
  const state = createFlowState(small, { ...baseInputs, inletSpeedMs: inletSpeedMs(flowNm3h, 0.02, { oxygenFraction: 0.996 }) })
  let unconverged = 0
  while (state.timeS < physicalS) {
    assert.ok(stepFlow(state), 'blowing run must not diverge')
    if (!state.monitors.pressureConverged) unconverged += 1
  }
  return { state, unconverged }
}
const blowing = runBlowing(perTuyereNm3h, 0.3)
{
  const { state, unconverged } = blowing
  const status = flowStatus(state)
  log('state', `t ${status.timeS.toFixed(2)} s, ${status.steps} steps, Δt ${status.dtS.toExponential(2)} s, bath ${status.bathMeanSpeed.toFixed(3)} m/s, holdup ${(status.gasHoldup * 100).toFixed(2)}%, drift ${status.liquidDrift.toExponential(1)}`)
  assert.equal(unconverged, 0, 'pressure converges every step')
  assert.ok(Math.abs(status.liquidDrift) <= 1e-3, 'liquid volume drifts less than 0.1%')
  for (const value of state.alpha) assert.ok(value >= 0 && value <= 1)
  for (let c = 0; c < state.mesh.cellCount; c += 1) {
    if (state.mesh.vf[c] <= 0) continue
    assert.ok(state.k[c] > 0 && state.eps[c] > 0 && Number.isFinite(state.muT[c]))
  }
  assert.ok(status.gasHoldup > 0 && status.bathMeanSpeed > 0, 'gas enters the bath and stirs it')
}
{
  const weaker = runBlowing(perTuyereNm3h / 2, 0.3).state
  log('trend', `bath speed ${flowStatus(weaker).bathMeanSpeed.toFixed(3)} → ${flowStatus(blowing.state).bathMeanSpeed.toFixed(3)} m/s when gas doubles`)
  assert.ok(flowStatus(blowing.state).bathMeanSpeed > flowStatus(weaker).bathMeanSpeed, 'more gas stirs the bath harder')
}

// ---------- 后处理 ----------
console.log('post')
{
  const mesh = buildSimMesh({ xs: axis(0, 1, 30), ys: axis(0, 1, 30), zs: axis(0, 1, 30), contains: () => true, lances: [], isOutlet: (_x, y) => y >= 1 - 1e-9 })
  const n = mesh.cellCount
  const alpha = new Float64Array(n)
  const zero = new Float64Array(n)
  const ones = new Float64Array(n).fill(1)
  const r = 0.3
  for (let k = 0; k < mesh.nz; k += 1) for (let j = 0; j < mesh.ny; j += 1) for (let i = 0; i < mesh.nx; i += 1) {
    alpha[i + mesh.nx * (j + mesh.ny * k)] = 0.5 + (r - Math.hypot(mesh.xc[i] - 0.5, mesh.yc[j] - 0.5, mesh.zc[k] - 0.5))
  }
  const post = buildPostGeometry(mesh, { alpha, uc: ones, vc: zero, wc: zero, k: zero, pressure: zero }, { iso: true, isoAlpha: 0.5, streamlines: false, slices: [] })
  assert.equal(post.iso.label, 'LVF')
  assert.ok(Math.abs(post.iso.value - 0.5) < 1e-9, 'the isosurface is the LVF threshold')
  const areaError = isoArea(post.iso) / (4 * Math.PI * r * r) - 1
  log('sphere isosurface area error', `${(areaError * 100).toFixed(2)}%`)
  assert.ok(Math.abs(areaError) <= 0.02)
  const uses = new Map()
  const indices = post.iso.indices
  for (let t = 0; t < indices.length; t += 3) {
    for (const [p, q] of [[indices[t], indices[t + 1]], [indices[t + 1], indices[t + 2]], [indices[t + 2], indices[t]]]) {
      const key = p < q ? `${p}:${q}` : `${q}:${p}`
      uses.set(key, (uses.get(key) ?? 0) + 1)
    }
  }
  assert.ok([...uses.values()].every((count) => count === 2), 'the closed isosurface is watertight')
  const { grid, nodes } = velocityNodes(mesh, { uc: ones, vc: zero, wc: zero })
  const line = traceStreamline(mesh, grid, nodes, [0.1, 0.37, 0.61], 1, 500, 0.5)
  let deviation = 0
  for (let p = 0; p < line.length; p += 3) deviation = Math.max(deviation, Math.abs(line[p + 1] - 0.37), Math.abs(line[p + 2] - 0.61))
  assert.ok(deviation < 1e-9 && line[line.length - 3] > 0.95, 'a streamline in uniform flow is straight and crosses the box')
}
{
  const t0 = Date.now()
  const fields = flowFields(blowing.state, false)
  const xPosition = small.xs[0] + 0.3 * (small.xs[small.xs.length - 1] - small.xs[0])
  const yPosition = small.ys[0] + 0.3 * (small.ys[small.ys.length - 1] - small.ys[0])
  const post = buildPostGeometry(small, fields, { iso: true, isoAlpha: 0.5, streamlines: true, slices: [{ id: 'mid', axis: 'x', positionM: xPosition, field: 'alpha' }] })
  log('furnace post', `${post.iso.indices.length / 3} triangles, ${post.lines.positions.length / 6} line segments, ${post.slices[0].indices.length / 3} slice triangles in ${Date.now() - t0} ms`)
  assert.ok(post.iso.indices.length > 0 && post.lines.positions.length > 0 && post.slices[0].indices.length > 0)
  assert.equal(post.iso.label, 'LVF')
  assert.ok(post.legends.some((legend) => legend.label === '速度') && post.legends.some((legend) => legend.label === '液相体积分数 LVF'))
  const group = buildFlowPostGroup({ type: 'post', serial: 1, meshId: 1, timeS: 0, average: false, historyIndex: null, ...post })
  for (const name of ['flow-iso', 'flow-streamlines', 'flow-slice-mid']) assert.ok(group.getObjectByName(name), `${name} is drawn`)
  const solid = buildPostGeometry(small, fields, { iso: true, isoAlpha: 0.5, streamlines: false, slices: [] })
  const ctx = createPostContext(small, fields)
  const splitIso = buildIsoSurface(ctx, 0.5)
  const splitLines = buildStreamlines(ctx)
  const splitSlices = buildSlices(ctx, [{ id: 'mid', axis: 'x', positionM: xPosition, field: 'alpha' }])
  assert.equal(splitIso.indices.length, post.iso.indices.length, 'a context builds the same isosurface')
  assert.equal(splitLines.positions.length, post.lines.positions.length, 'a context builds the same streamlines')
  assert.equal(splitSlices[0].indices.length, post.slices[0].indices.length, 'a context builds the same slice')
  for (let index = 0; index < solid.iso.colors.length; index += 3) {
    assert.equal(solid.iso.colors[index], solid.iso.colors[0])
    assert.equal(solid.iso.colors[index + 1], solid.iso.colors[1])
    assert.equal(solid.iso.colors[index + 2], solid.iso.colors[2])
  }
  assert.equal(solid.legends.some((legend) => legend.label === '速度'), false, 'a solid LVF surface has no speed legend')
  for (const field of ['speed', 'k', 'pressure']) {
    const other = buildPostGeometry(small, fields, { iso: false, isoAlpha: 0.5, streamlines: false, slices: [{ id: field, axis: 'y', positionM: yPosition, field }] })
    assert.ok(other.slices[0] && other.slices[0].field === field, `${field} slice exists`)
  }
  const flatCount = small.cellCount
  const flatAlpha = new Float64Array(flatCount).fill(1)
  const flatZero = new Float64Array(flatCount)
  const zPosition = small.zs[0] + 0.6 * (small.zs[small.zs.length - 1] - small.zs[0])
  const split = buildPostGeometry(small, { alpha: flatAlpha, uc: flatZero, vc: flatZero, wc: flatZero, k: flatZero, pressure: flatZero }, {
    iso: false, isoAlpha: 0.5, streamlines: false,
    slices: [
      { id: 'lvf', axis: 'x', positionM: xPosition, field: 'alpha' },
      { id: 'speed', axis: 'z', positionM: zPosition, field: 'speed' },
    ],
  })
  assert.equal(split.slices.length, 2)
  assert.equal(split.slices[0].field, 'alpha')
  assert.equal(split.slices[1].field, 'speed')
  const painted = (slice) => slice.indices[0] * 3
  const alphaColor = painted(split.slices[0])
  const speedColor = painted(split.slices[1])
  const sameColor = split.slices[0].colors[alphaColor] === split.slices[1].colors[speedColor]
    && split.slices[0].colors[alphaColor + 1] === split.slices[1].colors[speedColor + 1]
    && split.slices[0].colors[alphaColor + 2] === split.slices[1].colors[speedColor + 2]
  assert.equal(sameColor, false, 'each slice uses its own scalar')
}

// ---------- 场景 ----------
console.log('scene')
{
  const decoration = { openTuyereIds: allTuyeres, tuyereDiameterM: 0.04, liquidLevelM, lanceHeightM: 0.45, lanceInsertionM: 0.05, showField: false }
  const model = buildSmeltingModelScene(layout, false, decoration)
  let frontTuyere
  model.traverse((object) => { if (object.userData.manifest?.geometryId === 'tuyere-front-1') frontTuyere = object })
  assert.equal(frontTuyere.geometry.parameters.radiusTop, 0.02, 'the displayed tuyere uses the simulated diameter')
  assert.ok(Math.abs(frontTuyere.position.y - (layout.body.centerYM + 0.45)) < 1e-8, 'the tuyere follows the lance height')
  assert.ok(model.getObjectByName('liquid-surface'), 'the initial liquid surface is shown before results')
  assert.equal(buildSmeltingModelScene(layout, false, { ...decoration, showField: true }).getObjectByName('liquid-surface'), undefined, 'results replace the static liquid marker')
  const plain = buildSmeltingModelScene(layout, false)
  let plainTuyere
  plain.traverse((object) => { if (object.userData.manifest?.geometryId === 'tuyere-front-1') plainTuyere = object })
  const plainWallZ = layout.body.centerZM + layout.flare.bottomWidthM / 2
  const plainTipZ = plainTuyere.position.z - plainTuyere.geometry.parameters.height / 2
  assert.ok(Math.abs(plainTipZ - (plainWallZ - layout.lanceInsertionM)) < 1e-6, 'the lance tip is the insertion depth inside the wall')
  const lowHalf = furnaceWallHalfWidthM(layout, layout.body.centerYM + 0.45)
  const cappedInsertion = clampLanceInsertionM(layout, 0.45, 0.04, 100)
  assert.ok(cappedInsertion <= lowHalf - 0.02 && cappedInsertion > lowHalf - 0.04, 'insertion stops one radius short of the center')
  const nadir = layout.body.centerYM - hearthSagM(layout.flare.bottomWidthM, layout.foundation.heightM)
  assert.ok(Math.abs(domain.nadirYM - nadir) < 1e-8)
  assert.equal(domain.contains(layout.foundation.centerXM, layout.foundation.centerYM, layout.foundation.centerZM), false)
  assert.equal(domain.contains(layout.flue.centerXM, layout.flue.centerYM, layout.flue.centerZM), true)
}

// ---------- 过程回放 ----------
console.log('history')
{
  const mesh = buildSimMesh({ xs: axis(0, 1, 4), ys: axis(0, 1, 4), zs: axis(0, 1, 4), contains: (x) => x < 0.5, lances: [], isOutlet: () => false })
  const n = mesh.cellCount
  const history = createFlowHistory(mesh, 0.1, 5)
  const buffers = createFieldBuffers(n)
  const zero = new Float64Array(n)
  const make = (speed) => {
    const alpha = new Float64Array(n)
    const uc = new Float64Array(n)
    for (let c = 0; c < n; c += 1) {
      alpha[c] = (c + 0.5) / (n + 1)
      uc[c] = speed * ((c % 5) - 2)
    }
    return { alpha, uc, vc: zero, wc: zero, k: zero, pressure: zero }
  }
  for (let step = 0; step <= 40; step += 1) recordFlowSnapshot(history, step * 0.05, make(1 + step * 0.05), step === 40)
  const times = history.frames.map((frame) => frame.timeS)
  assert.ok(history.frames.length <= 5, 'decimation stays within the frame cap')
  assert.equal(times[0], 0, 'the first frame stays at the start')
  assert.ok(Math.abs(times[times.length - 1] - 2) < 1e-9, 'the last frame stays at the end')
  for (let index = 1; index < times.length; index += 1) assert.ok(times[index] > times[index - 1])
  for (const time of times) assert.ok(Math.abs(time / 0.1 - Math.round(time / 0.1)) < 1e-6, 'saved frames stay on the 0.1 s grid')
  const grid = createFlowHistory(mesh, 0.1, 20)
  for (const time of [0, 0.04, 0.11, 0.19, 0.25]) recordFlowSnapshot(grid, time, make(1), false)
  const gridTimes = grid.frames.map((frame) => frame.timeS)
  assert.deepEqual(gridTimes.map((time) => Number(time.toFixed(2))), [0, 0.11, 0.25])
  const exact = createFlowHistory(mesh, 1, 10)
  const fields = make(3)
  recordFlowSnapshot(exact, 0, fields, true)
  decodeFlowSnapshot(exact, 0, buffers)
  let alphaError = 0
  let speedError = 0
  let peak = 0
  for (let c = 0; c < n; c += 1) {
    if (mesh.vf[c] <= 0) {
      assert.equal(buffers.alpha[c], 0)
      assert.equal(buffers.uc[c], 0)
      continue
    }
    alphaError = Math.max(alphaError, Math.abs(buffers.alpha[c] - Math.min(1, Math.max(0, fields.alpha[c]))))
    speedError = Math.max(speedError, Math.abs(buffers.uc[c] - fields.uc[c]))
    peak = Math.max(peak, Math.abs(fields.uc[c]))
  }
  assert.ok(alphaError <= 1 / 255, 'alpha quantization stays within one 8-bit step')
  assert.ok(speedError <= peak / 32767, 'velocity quantization stays within one 16-bit step')
}

// ---------- Worker 协议 ----------
console.log('worker')
{
  const published = []
  globalThis.postMessage = (message) => published.push(message)
  await import('../src/workers/furnaceSideBlowSolver.worker.ts')
  const view = { iso: true, isoAlpha: 0.5, streamlines: false, slices: [] }
  assert.equal(FURNACE_SIM_CONFIG.numerics.maxPhysicalTimeS, 15)
  const physics = { perTuyereNm3h, oxygenFraction: 0.996, liquidDensityKgM3: 3500 }
  const configure = { type: 'configure', layout, openTuyereIds: allTuyeres, ...domainOptions, liquidLevelM, physics, view }
  globalThis.onmessage({ data: configure })
  const mesh = published.find((message) => message.type === 'mesh')
  assert.ok(mesh && mesh.stats.fluidCells >= FURNACE_SIM_CONFIG.mesh.minTargetCells && mesh.wire.length >= 6, 'configure publishes the production mesh and its wireframe')
  assert.ok(published.some((message) => message.type === 'status' && message.status.timeS === 0 && message.historyTimesS.length === 1 && message.historyTimesS[0] === 0))
  assert.ok(published.some((message) => message.type === 'post' && message.iso && message.iso.label === 'LVF' && message.iso.indices.length > 0), 'the initial bath surface is an LVF isosurface')
  globalThis.onmessage({ data: { type: 'run' } })
  await new Promise((resolve) => setTimeout(resolve, 1500))
  globalThis.onmessage({ data: { type: 'pause' } })
  const status = published.filter((message) => message.type === 'status').at(-1)
  assert.ok(status.status.timeS > 0 && status.running === false, 'run advances time and pause stops it')
  const paused = published.filter((message) => message.type === 'status').at(-1)
  assert.ok(paused.historyTimesS.length >= 2 && Math.abs(paused.historyTimesS.at(-1) - paused.status.timeS) < 1e-6, 'the last timeline slot is the current time')
  const sliceAt = layout.body.centerXM
  const sliceOnly = published.length
  globalThis.onmessage({ data: { type: 'display', requestId: 4, view: { ...view, slices: [{ id: 'mid', axis: 'x', positionM: sliceAt, field: 'alpha' }] }, index: paused.historyTimesS.length - 1 } })
  const sliceFrame = published.slice(sliceOnly).find((message) => message.type === 'post')
  assert.ok(sliceFrame && sliceFrame.requestId === 4 && sliceFrame.keepIso && sliceFrame.keepLines && sliceFrame.iso == null && sliceFrame.slices.length === 1, 'changing only the slice reuses the isosurface and streamlines')
  const withLines = published.length
  globalThis.onmessage({ data: { type: 'display', requestId: 5, view: { ...view, streamlines: true, slices: [{ id: 'mid', axis: 'x', positionM: sliceAt, field: 'alpha' }] }, index: paused.historyTimesS.length - 1 } })
  const lineFrame = published.slice(withLines).find((message) => message.type === 'post')
  assert.ok(lineFrame && lineFrame.requestId === 5 && lineFrame.lines && lineFrame.historyIndex == null, 'the last slot is still the latest result')
  const seekAt = published.length
  globalThis.onmessage({ data: { type: 'display', requestId: 6, view, index: 0 } })
  const rewound = published.slice(seekAt).find((message) => message.type === 'post')
  assert.ok(rewound && rewound.requestId === 6 && rewound.historyIndex === 0 && rewound.timeS === 0, 'frame 0 shows the initial bath')
  globalThis.onmessage({ data: { type: 'reset' } })
  const resetStatus = published.filter((message) => message.type === 'status').at(-1)
  assert.equal(resetStatus.status.timeS, 0, 'reset returns to the still bath')
  assert.equal(resetStatus.historyTimesS.length, 1, 'reset keeps only the initial frame')
  globalThis.onmessage({ data: { ...configure, openTuyereIds: [] } })
  assert.equal(published.filter((message) => message.type === 'mesh').at(-1).stats.inletAreaM2, 0)
  globalThis.onmessage({ data: { type: 'stop' } })
}

// ---------- 准稳态判据 ----------
console.log('steady')
{
  const numerics = { warmupS: 1, steadyWindowS: 0.5, steadyTolerance: 0.02 }
  const detector = { windowStart: 0, windowSum: 0, windowTime: 0, previousMean: -1, hits: 0, reached: false, reachedAtS: 0 }
  let time = 0
  const dt = 0.5
  while (!detector.reached && time < 10) {
    time += dt
    advanceSteadyDetector(detector, time, 12, dt, numerics)
  }
  log('reached at', `${detector.reachedAtS.toFixed(2)} s`)
  assert.ok(detector.reached && Math.abs(detector.reachedAtS - 2) < 1e-9, 'steady needs a baseline window plus two agreeing windows after warmup')
  const fake = { steady: detector, timeS: detector.reachedAtS + 2.9, config: FURNACE_SIM_CONFIG }
  assert.equal(flowComplete(fake), false)
  fake.timeS = detector.reachedAtS + FURNACE_SIM_CONFIG.numerics.averageAfterSteadyS
  assert.equal(flowComplete(fake), true, 'completion waits out the averaging window')
}

// ---------- 性能 ----------
console.log('performance')
{
  const state = createFlowState(production, { ...baseInputs, inletSpeedMs: inletSpeedMs(perTuyereNm3h, 0.02, { oxygenFraction: 0.996 }) })
  for (let step = 0; step < 5; step += 1) stepFlow(state)
  const steps = 20
  const t0 = performance.now()
  for (let step = 0; step < steps; step += 1) stepFlow(state)
  const msPerStep = (performance.now() - t0) / steps
  const minutes = (5 / state.dtS) * msPerStep / 60000
  log('production', `${production.stats.fluidCells} cells, ${msPerStep.toFixed(1)} ms/step, Δt ${state.dtS.toExponential(2)} s → about ${minutes.toFixed(1)} min to reach 5 s`)
}

console.log(`furnace solver tests passed in ${((Date.now() - started) / 1000).toFixed(0)} s`)
