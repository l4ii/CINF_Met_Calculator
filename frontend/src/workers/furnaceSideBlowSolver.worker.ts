import { createFlowGrid, stepFlowGrid, type FlowGrid, type InletSide, type SolverParams } from '../utils/furnaceSideBlowSolver.ts'

type StartMessage = {
  type: 'configure'
  params: SolverParams
  sides: InletSide[]
  playing: boolean
}

type ControlMessage = { type: 'playing'; playing: boolean } | { type: 'stop' }

let cases = new Map<InletSide, FlowGrid>()
let params: SolverParams | null = null
let playing = false
let timer = 0
let serial = 0

function publish() {
  const slices: Record<string, FlowGrid> = {}
  for (const [side, grid] of cases) slices[side] = grid
  serial += 1
  self.postMessage({ type: 'frame', serial, slices })
}

function loop() {
  if (!playing || !params) return
  for (const [side, grid] of cases) {
    for (let step = 0; step < 3; step += 1) stepFlowGrid(grid, params, side)
  }
  publish()
  timer = self.setTimeout(loop, 40) as unknown as number
}

self.onmessage = (event: MessageEvent<StartMessage | ControlMessage>) => {
  const message = event.data
  if (message.type === 'stop') {
    playing = false
    self.clearTimeout(timer)
    return
  }
  if (message.type === 'configure') {
    self.clearTimeout(timer)
    params = message.params
    playing = message.playing
    cases = new Map(message.sides.map((side) => [side, createFlowGrid(params!, side)]))
    publish()
    if (playing) loop()
    return
  }
  playing = message.playing
  self.clearTimeout(timer)
  if (playing) loop()
}
