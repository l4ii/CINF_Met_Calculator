import type { FurnaceLayout } from '../copperFurnaceGeometry.ts'
import type { MeshStats } from './mesh.ts'
import type { PostIso, PostLegend, PostLines, PostRequest, PostSlice } from './post.ts'
import type { FlowStatus } from './solver.ts'

/** 运行中可直接修改、不需要重新生成网格的工况 */
export type FlowPhysics = {
  perTuyereNm3h: number
  /** O₂ 体积分数 0～1 */
  oxygenFraction: number
  liquidDensityKgM3: number
}

export type FlowView = PostRequest

export type ConfigureRequest = {
  type: 'configure'
  layout: FurnaceLayout
  openTuyereIds: string[]
  lanceDiameterM: number
  lanceHeightM: number
  lanceInsertionM: number
  liquidLevelM: number
  physics: FlowPhysics
  view: FlowView
}

export type WorkerRequest =
  | ConfigureRequest
  | { type: 'physics'; physics: FlowPhysics }
  | { type: 'tuyeres'; openTuyereIds: string[] }
  | { type: 'run' }
  | { type: 'pause' }
  | { type: 'reset' }
  | { type: 'display'; requestId: number; view: FlowView; index: number | null }
  | { type: 'stop' }

export type MeshMessage = {
  type: 'mesh'
  meshId: number
  stats: MeshStats
  wire: Float32Array
}

export type StatusMessage = {
  type: 'status'
  meshId: number
  running: boolean
  status: FlowStatus
  /** 已保存的回放时刻，从 0 覆盖到当前 */
  historyTimesS: number[]
}

export type FlowPostFrame = {
  type: 'post'
  serial: number
  meshId: number
  timeS: number
  requestId: number
  /** 等值面沿用上一帧。此时 iso 为空 */
  keepIso: boolean
  /** 流线沿用上一帧。此时 lines 为空 */
  keepLines: boolean
  /** null 表示最新结果；数字表示已存快照的序号 */
  historyIndex: number | null
  iso: PostIso | null
  lines: PostLines | null
  slices: PostSlice[]
  legends: PostLegend[]
}

export type ErrorMessage = { type: 'error'; message: string }

export type WorkerResponse = MeshMessage | StatusMessage | FlowPostFrame | ErrorMessage

/** 后处理缓冲转移给主线程，避免复制 */
export function postFrameTransfer(frame: FlowPostFrame): ArrayBuffer[] {
  const buffers: ArrayBuffer[] = []
  const add = (array: { buffer: ArrayBufferLike } | undefined) => {
    if (array && array.buffer instanceof ArrayBuffer && !buffers.includes(array.buffer)) buffers.push(array.buffer)
  }
  if (frame.iso) {
    add(frame.iso.positions)
    add(frame.iso.normals)
    add(frame.iso.colors)
    add(frame.iso.indices)
  }
  if (frame.lines) {
    add(frame.lines.positions)
    add(frame.lines.colors)
  }
  for (const slice of frame.slices) {
    add(slice.positions)
    add(slice.colors)
    add(slice.indices)
  }
  return buffers
}
