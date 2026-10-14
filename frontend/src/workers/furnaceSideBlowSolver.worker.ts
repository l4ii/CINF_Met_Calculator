import { FURNACE_SIM_CONFIG, resolveTargetCells } from '../config/furnaceSimConfig.ts'
import { buildFluidDomain } from '../utils/furnaceFluidDomain.ts'
import { inletGasDensityKgM3, inletSpeedMs } from '../utils/furnaceGasInlet.ts'
import { clearFlowHistory, createFieldBuffers, createFlowHistory, decodeFlowSnapshot, historyTimes, recordFlowSnapshot, shouldRecord, type FlowFieldBuffers, type FlowHistory } from '../utils/furnaceSim/history.ts'
import { buildFurnaceMesh, setLanceOpening, type SimMesh } from '../utils/furnaceSim/mesh.ts'
import { buildIsoSurface, buildSlices, buildStreamlines, createPostContext, postLegends, scalarRanges, type PostContext, type ScalarRanges } from '../utils/furnaceSim/post.ts'
import { postFrameTransfer, type ConfigureRequest, type FlowPhysics, type FlowPostFrame, type FlowView, type WorkerRequest, type WorkerResponse } from '../utils/furnaceSim/protocol.ts'
import { createFlowState, flowComplete, flowFields, flowStatus, resetFlowState, setFlowInputs, stepFlow, type FlowInputs, type FlowState } from '../utils/furnaceSim/solver.ts'

let mesh: SimMesh | null = null
let state: FlowState | null = null
let meshId = 0
let running = false
let diverged = false
/** 完成后再次开始只受物理时间上限约束，直到重新生成网格或重置。 */
let stopAtSteady = true
let view: FlowView | null = null
/** null 表示时间轴最后一格，即最新结果 */
let displayIndex: number | null = null
let nozzleDiameterM = 0.04
let timer = 0
let lastStatus = 0
let lastPost = 0
let postSerial = 0
let history: FlowHistory | null = null
let scratch: FlowFieldBuffers | null = null
let rangeScratch: FlowFieldBuffers | null = null
let rangeKey = ''
let rangeCache: ScalarRanges | null = null
let ctx: PostContext | null = null
let ctxKey = ''
let builtKey = ''
let builtIso: number | null = null
let builtLines = false

function send(message: WorkerResponse, transfer: ArrayBuffer[] = []) {
  ;(globalThis as unknown as { postMessage: (message: unknown, transfer?: ArrayBuffer[]) => void }).postMessage(message, transfer)
}

function physicsInputs(physics: FlowPhysics): Pick<FlowInputs, 'inletSpeedMs' | 'gasDensityKgM3' | 'liquidDensityKgM3'> {
  const gas = { oxygenFraction: physics.oxygenFraction }
  return {
    inletSpeedMs: inletSpeedMs(physics.perTuyereNm3h, nozzleDiameterM / 2, gas),
    gasDensityKgM3: inletGasDensityKgM3(gas),
    liquidDensityKgM3: physics.liquidDensityKgM3,
  }
}

/** 已存帧，若当前时刻更晚则再加一格当前状态。最后一格始终是最新结果。 */
function timeline(): number[] {
  if (!history || !state) return []
  const times = historyTimes(history)
  const last = times.length > 0 ? times[times.length - 1] : -1
  if (state.timeS > last + 1e-6) times.push(state.timeS)
  return times
}

function publishStatus() {
  if (!state || !history) return
  lastStatus = Date.now()
  send({ type: 'status', meshId, running, status: flowStatus(state, diverged), historyTimesS: timeline() })
}

function remember() {
  if (!history || !state || !shouldRecord(history, state.timeS, false)) return
  recordFlowSnapshot(history, state.timeS, flowFields(state, false), false)
  rangeKey = ''
  rangeCache = null
}

function playbackRanges(): ScalarRanges | undefined {
  if (!history || !mesh || !rangeScratch || history.frames.length === 0) return undefined
  const last = history.frames.length - 1
  const key = `${last}:${history.frames[last].timeS}:${history.intervalS}`
  if (rangeCache && rangeKey === key) return rangeCache
  decodeFlowSnapshot(history, last, rangeScratch)
  rangeCache = scalarRanges(mesh, rangeScratch)
  rangeKey = key
  return rangeCache
}

function resolveSelection(): { live: boolean; snapshot: number | null } {
  const times = timeline()
  if (!history || times.length === 0) return { live: true, snapshot: null }
  const chosen = displayIndex == null ? times.length - 1 : Math.max(0, Math.min(times.length - 1, displayIndex))
  if (chosen === times.length - 1) return { live: true, snapshot: null }
  return { live: false, snapshot: chosen }
}

function dropBuilt() {
  ctx = null
  ctxKey = ''
  builtKey = ''
  builtIso = null
  builtLines = false
}

function publishPost(requestId = 0) {
  if (!state || !mesh || !view || !scratch) return
  if (diverged && resolveSelection().live) return
  lastPost = Date.now()
  const selected = resolveSelection()
  const sourceKey = selected.live ? `live:${state.steps}` : `snap:${selected.snapshot}`
  if (!ctx || ctxKey !== sourceKey) {
    if (selected.live) {
      const fields = flowFields(state, false)
      scratch.alpha.set(fields.alpha)
      scratch.uc.set(fields.uc)
      scratch.vc.set(fields.vc)
      scratch.wc.set(fields.wc)
      scratch.k.set(fields.k)
      scratch.pressure.set(fields.pressure)
      ctx = createPostContext(mesh, scratch)
    } else if (history && selected.snapshot != null) {
      decodeFlowSnapshot(history, selected.snapshot, scratch)
      ctx = createPostContext(mesh, scratch, playbackRanges())
    }
    ctxKey = sourceKey
  }
  if (!ctx) return
  const alpha = Math.min(0.98, Math.max(0.02, view.isoAlpha))
  const keepIso = sourceKey === builtKey && view.iso === (builtIso != null) && (!view.iso || builtIso == null || Math.abs(builtIso - alpha) < 1e-9)
  const keepLines = sourceKey === builtKey && view.streamlines === builtLines
  const iso = !view.iso || keepIso ? null : buildIsoSurface(ctx, alpha)
  const lines = !view.streamlines || keepLines ? null : buildStreamlines(ctx, FURNACE_SIM_CONFIG)
  const slices = buildSlices(ctx, view.slices)
  const legends = postLegends(ctx, view)
  const timeS = selected.live || !history || selected.snapshot == null ? state.timeS : history.frames[selected.snapshot].timeS
  postSerial += 1
  const frame: FlowPostFrame = {
    type: 'post',
    serial: postSerial,
    meshId,
    timeS,
    requestId,
    keepIso,
    keepLines,
    historyIndex: selected.snapshot,
    iso,
    lines,
    slices,
    legends,
  }
  builtKey = sourceKey
  builtIso = view.iso ? alpha : null
  builtLines = view.streamlines
  send(frame, postFrameTransfer(frame))
}

function configure(message: ConfigureRequest) {
  running = false
  diverged = false
  stopAtSteady = true
  displayIndex = null
  globalThis.clearTimeout(timer)
  view = message.view
  nozzleDiameterM = message.lanceDiameterM
  const domain = buildFluidDomain(message.layout, {
    openTuyereIds: message.openTuyereIds,
    lanceDiameterM: message.lanceDiameterM,
    lanceHeightM: message.lanceHeightM,
    lanceInsertionM: message.lanceInsertionM,
  })
  const liquidSurfaceYM = domain.liquidSurfaceYM(message.liquidLevelM)
  mesh = buildFurnaceMesh(domain, { targetCells: resolveTargetCells(), liquidSurfaceYM })
  meshId += 1
  const { fluid, post } = FURNACE_SIM_CONFIG
  state = createFlowState(mesh, {
    ...physicsInputs(message.physics),
    liquidViscosityPaS: fluid.liquidViscosityPaS,
    gasViscosityPaS: fluid.gasViscosityPaS,
    nozzleDiameterM: message.lanceDiameterM,
    liquidSurfaceYM,
  })
  scratch = createFieldBuffers(mesh.cellCount)
  rangeScratch = createFieldBuffers(mesh.cellCount)
  history = createFlowHistory(mesh, post.historyIntervalS, post.historyMaxFrames)
  dropBuilt()
  if (shouldRecord(history, state.timeS, true)) recordFlowSnapshot(history, state.timeS, flowFields(state, false), true)
  const wire = mesh.wire
  send({ type: 'mesh', meshId, stats: mesh.stats, wire }, [wire.buffer as ArrayBuffer])
  mesh.wire = new Float32Array(0)
  publishStatus()
  publishPost()
}

function loop() {
  if (!running || !state) return
  const { chunkMs, statusIntervalMs, maxPhysicalTimeS } = FURNACE_SIM_CONFIG.numerics
  const started = Date.now()
  try {
    while (Date.now() - started < chunkMs) {
      if (!stepFlow(state)) {
        diverged = true
        running = false
        break
      }
      remember()
      if ((stopAtSteady && flowComplete(state)) || state.timeS >= maxPhysicalTimeS) {
        running = false
        break
      }
    }
  } catch (error) {
    running = false
    send({ type: 'error', message: error instanceof Error ? error.message : String(error) })
    return
  }
  const finished = !running
  const now = Date.now()
  if (finished || now - lastStatus >= statusIntervalMs) publishStatus()
  if (finished || now - lastPost >= FURNACE_SIM_CONFIG.post.intervalMs) publishPost()
  if (running) timer = globalThis.setTimeout(loop, 0) as unknown as number
}

globalThis.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const message = event.data
  try {
    switch (message.type) {
      case 'configure':
        configure(message)
        break
      case 'physics':
        if (state) setFlowInputs(state, physicsInputs(message.physics))
        break
      case 'tuyeres':
        if (mesh && state) setLanceOpening(mesh, new Set(message.openTuyereIds), state.dirs[2].vel, state.inputs.inletSpeedMs)
        break
      case 'run':
        if (!state || diverged || running) break
        if (flowComplete(state)) stopAtSteady = false
        displayIndex = null
        running = true
        publishStatus()
        loop()
        break
      case 'pause':
        running = false
        globalThis.clearTimeout(timer)
        publishStatus()
        publishPost()
        break
      case 'reset':
        running = false
        displayIndex = null
        globalThis.clearTimeout(timer)
        if (state && history) {
          diverged = false
          stopAtSteady = true
          resetFlowState(state)
          clearFlowHistory(history)
          dropBuilt()
          if (shouldRecord(history, state.timeS, true)) recordFlowSnapshot(history, state.timeS, flowFields(state, false), true)
          publishStatus()
          publishPost()
        }
        break
      case 'display':
        view = message.view
        displayIndex = message.index
        if (!running) publishPost(message.requestId)
        break
      case 'stop':
        running = false
        globalThis.clearTimeout(timer)
        break
    }
  } catch (error) {
    running = false
    send({ type: 'error', message: error instanceof Error ? error.message : String(error) })
  }
}
