/**
 * 铜熔炼富氧侧吹的预置流动结果。
 * 播放器只读这份清单。换成实时仿真时，保持同样的分组结构，替换帧来源即可。
 * 帧时间以图内标注为准。多数序列是文件序号 × 0.5 s。
 * 100 m/s 气液界面里 ISO_2 为 0.50 s、ISO_1 为 1.00 s，按时间而不是文件名播放。
 * 300 m/s 气液界面没有 ISO_1；ISO_n 的图内时间是 (n - 1) × 0.5 s，ISO_11 为 5.00 s。
 * 800 mm 的 ISO_12 实际是流线图，不进入气液界面序列。
 */

export const FLOW_FRAME_STEP_S = 0.5
/** 每帧 0.5 s 仿真时间，墙钟 500 ms，约等于 1 倍速。 */
export const FLOW_PLAYBACK_FRAME_MS = 500

export type FlowVariableId = 'inletVelocity' | 'nozzlePitch'
export type FlowQuantityId = 'iso' | 'lvf' | 'flow'
export type FlowPresentation = 'front' | 'isometric' | 'section'
export type FlowPlayback = 'sequence' | 'still'

export interface FlowFrame {
  /** 相对 public/sim/copper-sideblow/ 的路径 */
  src: string
  timeS: number
}

export interface FlowQuantity {
  id: FlowQuantityId
  label: string
  playback: FlowPlayback
  presentation: FlowPresentation
  badge: string
  frames: FlowFrame[]
}

export interface FlowCase {
  id: string
  valueLabel: string
  quantities: FlowQuantity[]
}

export interface FlowVariableGroup {
  id: FlowVariableId
  label: string
  cases: FlowCase[]
}

const INDEX_1_TO_10 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const

function sequenceFrames(
  folder: string,
  prefix: 'ISO' | 'LVF',
  indices: readonly number[],
  timeOverrides: Readonly<Record<number, number>> = {},
): FlowFrame[] {
  return indices.map((index) => ({
    src: `${folder}/${prefix}_${index}.png`,
    timeS: timeOverrides[index] ?? index * FLOW_FRAME_STEP_S,
  }))
}

function stillFrame(src: string, timeS: number): FlowFrame[] {
  return [{ src, timeS }]
}

function velocityIsoFrames(speed: 100 | 200 | 300): FlowFrame[] {
  const folder = `velocity/${speed}/iso`
  if (speed === 300) {
    const indices = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
    const timeOverrides: Record<number, number> = {}
    for (const index of indices) timeOverrides[index] = (index - 1) * FLOW_FRAME_STEP_S
    return sequenceFrames(folder, 'ISO', indices, timeOverrides)
  }
  if (speed === 100) {
    return sequenceFrames(folder, 'ISO', INDEX_1_TO_10, { 1: 1, 2: 0.5 }).sort((a, b) => a.timeS - b.timeS)
  }
  return sequenceFrames(folder, 'ISO', INDEX_1_TO_10)
}

function velocityQuantities(speed: 100 | 200 | 300): FlowQuantity[] {
  const folder = `velocity/${speed}`
  return [
    {
      id: 'iso',
      label: '气液界面',
      playback: 'sequence',
      presentation: 'front',
      badge: '正视',
      frames: velocityIsoFrames(speed),
    },
    {
      id: 'lvf',
      label: '液相分数',
      playback: 'sequence',
      presentation: 'section',
      badge: '中心纵截面',
      frames: sequenceFrames(`${folder}/lvf`, 'LVF', INDEX_1_TO_10),
    },
    {
      id: 'flow',
      label: '流动',
      playback: 'still',
      presentation: 'section',
      badge: '中心纵截面 · 速度矢量',
      frames: stillFrame(`${folder}/flow/V_5s.png`, 5),
    },
  ]
}

function spacingQuantities(pitch: 400 | 600 | 800): FlowQuantity[] {
  const folder = `spacing/${pitch}`
  return [
    {
      id: 'iso',
      label: '气液界面',
      playback: 'sequence',
      presentation: 'isometric',
      badge: '轴测',
      frames: sequenceFrames(`${folder}/iso`, 'ISO', INDEX_1_TO_10),
    },
    {
      id: 'lvf',
      label: '液相分数',
      playback: 'sequence',
      presentation: 'section',
      badge: '中心纵截面',
      frames: sequenceFrames(`${folder}/lvf`, 'LVF', INDEX_1_TO_10),
    },
    {
      id: 'flow',
      label: '流动',
      playback: 'still',
      presentation: 'isometric',
      badge: '三维流线',
      frames: stillFrame(`${folder}/flow/Streamline_MoV_5s.png`, 5),
    },
  ]
}

export const COPPER_SIDE_BLOW_FLOW_LIBRARY: FlowVariableGroup[] = [
  {
    id: 'inletVelocity',
    label: '入口速度',
    cases: [
      { id: 'velocity-100', valueLabel: '100 m/s', quantities: velocityQuantities(100) },
      { id: 'velocity-200', valueLabel: '200 m/s', quantities: velocityQuantities(200) },
      { id: 'velocity-300', valueLabel: '300 m/s', quantities: velocityQuantities(300) },
    ],
  },
  {
    id: 'nozzlePitch',
    label: '喷嘴间距',
    cases: [
      { id: 'pitch-400', valueLabel: '400 mm', quantities: spacingQuantities(400) },
      { id: 'pitch-600', valueLabel: '600 mm', quantities: spacingQuantities(600) },
      { id: 'pitch-800', valueLabel: '800 mm', quantities: spacingQuantities(800) },
    ],
  },
]

const FLOW_VELOCITY_BINS = [100, 200, 300] as const
type FlowVelocityBin = (typeof FLOW_VELOCITY_BINS)[number]

/** 用单口气量和风口截面积估算入口速度，并就近取预置速度组。界面不展示档位。 */
export function matchVelocityQuantities(perTuyereNm3h: number, radiusM: number): FlowQuantity[] {
  const areaM2 = Math.PI * radiusM * radiusM
  const speedMs = areaM2 > 0 && perTuyereNm3h > 0 ? perTuyereNm3h / 3600 / areaM2 : 0
  let bin: FlowVelocityBin = FLOW_VELOCITY_BINS[0]
  let nearest = Infinity
  for (const candidate of FLOW_VELOCITY_BINS) {
    const distance = Math.abs(speedMs - candidate)
    if (distance < nearest) {
      nearest = distance
      bin = candidate
    }
  }
  return velocityQuantities(bin)
}

export function resolveFlowAssetUrl(relativePath: string): string {
  return `${import.meta.env.BASE_URL}sim/copper-sideblow/${relativePath}`
}

export function formatFlowTime(timeS: number): string {
  return `${timeS.toFixed(2)} s`
}
