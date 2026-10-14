import type { SimMesh } from './mesh.ts'
import type { FlowFields } from './solver.ts'

/**
 * 过程回放只保留流体单元。α 用 0～255，速度、湍动能和静压用各自的最大绝对值
 * 映射到 Int16，单帧误差不超过一个量化步长。
 */
export type FlowSnapshot = {
  timeS: number
  alpha: Uint8Array
  uc: Int16Array
  vc: Int16Array
  wc: Int16Array
  k: Int16Array
  pressure: Int16Array
  scaleU: number
  scaleV: number
  scaleW: number
  scaleK: number
  scaleP: number
}

export type FlowHistory = {
  fluidCells: Int32Array
  /** 当前采样间隔。抽稀后会成倍增大 */
  intervalS: number
  configuredIntervalS: number
  maxFrames: number
  nextTimeS: number
  frames: FlowSnapshot[]
}

export type FlowFieldBuffers = {
  alpha: Float64Array
  uc: Float64Array
  vc: Float64Array
  wc: Float64Array
  k: Float64Array
  pressure: Float64Array
}

const QUANTIZE = 32767

export function createFieldBuffers(cellCount: number): FlowFieldBuffers {
  return {
    alpha: new Float64Array(cellCount),
    uc: new Float64Array(cellCount),
    vc: new Float64Array(cellCount),
    wc: new Float64Array(cellCount),
    k: new Float64Array(cellCount),
    pressure: new Float64Array(cellCount),
  }
}

export function createFlowHistory(mesh: SimMesh, intervalS: number, maxFrames: number): FlowHistory {
  const fluid: number[] = []
  for (let c = 0; c < mesh.cellCount; c += 1) if (mesh.vf[c] > 0) fluid.push(c)
  const interval = Math.max(intervalS, 1e-6)
  return {
    fluidCells: Int32Array.from(fluid),
    intervalS: interval,
    configuredIntervalS: interval,
    maxFrames: Math.max(2, Math.floor(maxFrames)),
    nextTimeS: 0,
    frames: [],
  }
}

export function clearFlowHistory(history: FlowHistory) {
  history.frames = []
  history.intervalS = history.configuredIntervalS
  history.nextTimeS = 0
}

export function historyTimes(history: FlowHistory): number[] {
  return history.frames.map((frame) => frame.timeS)
}

/** 当前时刻是否该写入。调用方用它避免在每个时间步都复制整场。 */
export function shouldRecord(history: FlowHistory, timeS: number, force = false): boolean {
  const last = history.frames[history.frames.length - 1]
  if (last && Math.abs(last.timeS - timeS) <= 1e-9) return false
  return force || timeS + 1e-9 >= history.nextTimeS
}

function maxAbs(values: ArrayLike<number>, index: Int32Array): number {
  let max = 0
  for (let i = 0; i < index.length; i += 1) {
    const value = Math.abs(values[index[i]])
    if (value > max) max = value
  }
  return max > 0 ? max : 1
}

function quantizeSigned(value: number, scale: number): number {
  const quantized = Math.round(value / scale * QUANTIZE)
  if (quantized < -QUANTIZE) return -QUANTIZE
  if (quantized > QUANTIZE) return QUANTIZE
  return quantized
}

function capture(history: FlowHistory, timeS: number, fields: FlowFields): FlowSnapshot {
  const index = history.fluidCells
  const count = index.length
  const alpha = new Uint8Array(count)
  const uc = new Int16Array(count)
  const vc = new Int16Array(count)
  const wc = new Int16Array(count)
  const k = new Int16Array(count)
  const pressure = new Int16Array(count)
  const scaleU = maxAbs(fields.uc, index)
  const scaleV = maxAbs(fields.vc, index)
  const scaleW = maxAbs(fields.wc, index)
  const scaleK = maxAbs(fields.k, index)
  const scaleP = maxAbs(fields.pressure, index)
  for (let i = 0; i < count; i += 1) {
    const cell = index[i]
    alpha[i] = Math.min(255, Math.max(0, Math.round(fields.alpha[cell] * 255)))
    uc[i] = quantizeSigned(fields.uc[cell], scaleU)
    vc[i] = quantizeSigned(fields.vc[cell], scaleV)
    wc[i] = quantizeSigned(fields.wc[cell], scaleW)
    k[i] = quantizeSigned(fields.k[cell], scaleK)
    pressure[i] = quantizeSigned(fields.pressure[cell], scaleP)
  }
  return { timeS, alpha, uc, vc, wc, k, pressure, scaleU, scaleV, scaleW, scaleK, scaleP }
}

/** 下一帧的目标时刻落在间隔的整数倍上，不随时间步长累积偏移。 */
function nextSampleTime(timeS: number, intervalS: number): number {
  return (Math.floor(timeS / intervalS + 1e-9) + 1) * intervalS
}

/** 超过上限时保留偶数帧和最后一帧，采样间隔翻倍，时间轴仍从 0 覆盖到结束。 */
function decimate(history: FlowHistory) {
  while (history.frames.length > history.maxFrames) {
    const frames = history.frames
    const kept: FlowSnapshot[] = []
    for (let i = 0; i < frames.length; i += 2) kept.push(frames[i])
    const last = frames[frames.length - 1]
    if (kept[kept.length - 1] !== last) kept.push(last)
    if (kept.length >= frames.length) break
    history.frames = kept
    history.intervalS *= 2
  }
}

export function recordFlowSnapshot(history: FlowHistory, timeS: number, fields: FlowFields, force = false): boolean {
  if (!shouldRecord(history, timeS, force)) return false
  history.frames.push(capture(history, timeS, fields))
  history.nextTimeS = nextSampleTime(timeS, history.intervalS)
  decimate(history)
  const tail = history.frames[history.frames.length - 1]
  if (tail) history.nextTimeS = Math.max(history.nextTimeS, nextSampleTime(tail.timeS, history.intervalS))
  return true
}

/** 把一帧解码进可复用的整场缓冲。固体单元写 0。返回该帧时间。 */
export function decodeFlowSnapshot(history: FlowHistory, index: number, into: FlowFieldBuffers): number {
  const frame = history.frames[Math.max(0, Math.min(history.frames.length - 1, index))]
  into.alpha.fill(0)
  into.uc.fill(0)
  into.vc.fill(0)
  into.wc.fill(0)
  into.k.fill(0)
  into.pressure.fill(0)
  if (!frame) return 0
  const cells = history.fluidCells
  const inv = 1 / QUANTIZE
  for (let i = 0; i < cells.length; i += 1) {
    const cell = cells[i]
    into.alpha[cell] = frame.alpha[i] / 255
    into.uc[cell] = frame.uc[i] * inv * frame.scaleU
    into.vc[cell] = frame.vc[i] * inv * frame.scaleV
    into.wc[cell] = frame.wc[i] * inv * frame.scaleW
    into.k[cell] = frame.k[i] * inv * frame.scaleK
    into.pressure[cell] = frame.pressure[i] * inv * frame.scaleP
  }
  return frame.timeS
}
