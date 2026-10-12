import type { FurnaceLayout } from '../utils/copperFurnaceGeometry.ts'
import { buildFluidDomain } from '../utils/furnaceFluidDomain.ts'
import { buildTetMesh, clampTargetTetCount, type TetMesh } from '../utils/furnaceTetMesh.ts'
import { createTetFlow, stepTetFlow, tetFlowFrame, type TetFlowState, type TetSolverParams } from '../utils/furnaceTetSolver.ts'

type ConfigureMessage = {
  type: 'configure'
  /** 划分网格只回传初始场，不在这里开始时间推进。 */
  playing?: boolean
  layout: FurnaceLayout
  openTuyereIds: string[]
  lanceDiameterM: number
  lanceHeightM: number
  lanceInsertionM: number
  liquidLevelM: number
  inletSpeedMs: number
  liquidDensityKgM3: number
  targetTetCount?: number
}

type ControlMessage = { type: 'playing'; playing: boolean } | { type: 'stop' }

let mesh: TetMesh | null = null
let meshKey = ''
let meshId = 0
let state: TetFlowState | null = null
let params: TetSolverParams | null = null
let playing = false
let timer = 0
let serial = 0

function geometryKey(message: ConfigureMessage): string {
  const { body, flue, flare, tuyeres } = message.layout
  return [
    body.lengthM, body.widthM, body.heightM, body.centerXM, body.centerYM, body.centerZM,
    flare.lowerHeightM, flare.upperHeightM, flare.bottomWidthM, flare.topWidthM, flare.bottomLengthM, flare.topLengthM,
    flue.lengthM, flue.widthM, flue.heightM, flue.centerXM, flue.centerYM, flue.centerZM,
    message.lanceDiameterM, message.lanceHeightM, message.lanceInsertionM, message.liquidLevelM,
    clampTargetTetCount(message.targetTetCount, 50_000),
    tuyeres.map((tuyere) => [tuyere.id, tuyere.centerXM, tuyere.centerYM, tuyere.centerZM].join(',')).join(';'),
    [...message.openTuyereIds].sort().join(','),
  ].join('|')
}

function publishMesh() {
  if (!mesh) return
  globalThis.postMessage({
    type: 'mesh',
    tetCount: mesh.tetCount,
    cellSizeM: mesh.cellSizeM,
    zoneSizeM: mesh.zoneSizeM,
    wirePositions: mesh.wirePositions,
  })
}

function publish() {
  if (!state || !params) return
  serial += 1
  globalThis.postMessage(tetFlowFrame(state, params.inletSpeedMs, serial, meshId))
}

function loop() {
  if (!playing || !state || !params) return
  const started = Date.now()
  let steps = 0
  try {
    do {
      stepTetFlow(state, params)
      steps += 1
    } while (playing && steps < 6 && Date.now() - started < 40)
    publish()
  } catch (error) {
    playing = false
    globalThis.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) })
    return
  }
  timer = globalThis.setTimeout(loop, 16) as unknown as number
}

globalThis.onmessage = (event: MessageEvent<ConfigureMessage | ControlMessage>) => {
  const message = event.data
  if (message.type === 'stop') {
    playing = false
    globalThis.clearTimeout(timer)
    return
  }
  if (message.type === 'configure') {
    globalThis.clearTimeout(timer)
    playing = false
    params = {
      liquidLevelM: message.liquidLevelM,
      inletSpeedMs: message.inletSpeedMs,
      liquidDensityKgM3: message.liquidDensityKgM3,
    }
    const key = geometryKey(message)
    if (!mesh || key !== meshKey) {
      const domain = buildFluidDomain(message.layout, {
        openTuyereIds: message.openTuyereIds,
        lanceDiameterM: message.lanceDiameterM,
        lanceHeightM: message.lanceHeightM,
        lanceInsertionM: message.lanceInsertionM,
      })
      mesh = buildTetMesh(domain, {
        targetTetCount: clampTargetTetCount(message.targetTetCount, 50_000),
        liquidSurfaceYM: domain.liquidSurfaceYM(message.liquidLevelM),
      })
      meshKey = key
      meshId += 1
    }
    state = createTetFlow(mesh, params)
    publishMesh()
    publish()
    return
  }
  playing = message.playing
  globalThis.clearTimeout(timer)
  if (playing) loop()
}
