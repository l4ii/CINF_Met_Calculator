import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import { createPortal } from 'react-dom'
import { FURNACE_SIM_CONFIG } from '../../../../config/furnaceSimConfig.ts'
import { calculateTuyereOxygenPerTuyereNm3h, type SmeltingFurnaceDesignResult } from '../../../../utils/copperEquipmentSizing.ts'
import { buildSmeltingFurnaceLayout, type FurnaceLayout, type FurnaceTuyerePlacement } from '../../../../utils/copperFurnaceGeometry.ts'
import { buildFluidDomain, clampLanceInsertionM, type FluidDomain } from '../../../../utils/furnaceFluidDomain.ts'
import { inletSpeedMs } from '../../../../utils/furnaceGasInlet.ts'
import type { FlowSolverFrames, SmeltingFlowDecoration } from '../../../../utils/furnaceModelScene.ts'
import type { MeshStats } from '../../../../utils/furnaceSim/mesh.ts'
import type { PostScalar, PostSliceRequest, SliceAxis } from '../../../../utils/furnaceSim/post.ts'
import type { FlowPhysics, FlowPostFrame, FlowView, WorkerRequest, WorkerResponse } from '../../../../utils/furnaceSim/protocol.ts'
import type { FlowStatus } from '../../../../utils/furnaceSim/solver.ts'
import { useFurnaceModelEdits } from '../../useFurnaceModelEdits.ts'
import { btnPrimary, btnSecondary } from '../../../../theme/uiTheme.ts'

type Props = {
  darkMode: boolean
  design: SmeltingFurnaceDesignResult
  scopeKey: string
  /** 配料氧气列 O₂ 体积分数，0–1 */
  oxygenVolumeFraction?: number
  readOnly?: boolean
  framesRef: MutableRefObject<FlowSolverFrames | null>
  meshWireRef?: MutableRefObject<Float32Array | null>
  onDecorationChange: (decoration: SmeltingFlowDecoration & { playing: boolean }) => void
  onNotice?: (message: string, tone: 'flow' | 'warning' | 'error') => void
}

type TuyereMode = 'all' | 'alternate' | 'staggered' | 'custom'
type MeshPhase = 'empty' | 'building' | 'ready' | 'stale'

const SLICE_AXES: Array<{ id: SliceAxis; label: string }> = [
  { id: 'x', label: '横截面' },
  { id: 'y', label: '水平面' },
  { id: 'z', label: '纵截面' },
]

const SLICE_FIELDS: Array<{ id: PostScalar; label: string }> = [
  { id: 'alpha', label: 'LVF' },
  { id: 'speed', label: '速度' },
  { id: 'k', label: '湍动能' },
  { id: 'pressure', label: '静压' },
]

const MAX_SLICES = 6

type SliceDraft = {
  id: string
  axis: SliceAxis
  /** X/Z 相对炉体中心，Y 为距炉底最低点的高度，单位 m */
  positionM: number
  field: PostScalar
  visible: boolean
}

const DEFAULT_BATH_DENSITY_KG_M3 = 3500

const MODES: Array<{ id: TuyereMode; label: string }> = [
  { id: 'all', label: '全开' },
  { id: 'alternate', label: '隔一开一' },
  { id: 'staggered', label: '两侧交错' },
  { id: 'custom', label: '自定义' },
]

function formatGas(value: number): string {
  if (!Number.isFinite(value)) return '0'
  const abs = Math.abs(value)
  if (abs >= 100) return value.toFixed(0)
  if (abs >= 10) return value.toFixed(1)
  return value.toFixed(2)
}

function formatMm(valueM: number): string {
  return Number.isFinite(valueM) ? (valueM * 1000).toFixed(0) : '0'
}

/** 两点式俯视示意：沿炉长按实际间距摆位风口，可用键盘/点击逐个切换。 */
function TuyereTopView({ tuyeres, furnaceLengthM, furnaceCenterXM, openIds, darkMode, onToggle }: {
  tuyeres: FurnaceTuyerePlacement[]
  furnaceLengthM: number
  furnaceCenterXM: number
  openIds: ReadonlySet<string>
  darkMode: boolean
  onToggle: (id: string) => void
}) {
  const lengthM = Math.max(furnaceLengthM, 0.2)
  const minXM = furnaceCenterXM - lengthM / 2
  const percent = (centerXM: number) => ((centerXM - minXM) / lengthM) * 100
  return (
    <div className={`tuyere-top-view ${darkMode ? 'tuyere-top-view-dark' : ''}`} aria-label="风口俯视示意图">
      <div className="tuyere-top-view-label tuyere-top-view-label-front">前墙</div>
      <div className="tuyere-top-view-label tuyere-top-view-label-back">后墙</div>
      {(['front', 'back'] as const).map((side) => (
        <div key={side} className={`tuyere-top-view-row tuyere-top-view-row-${side}`}>
          {tuyeres.filter((tuyere) => tuyere.side === side).map((tuyere) => (
            <button
              key={tuyere.id}
              type="button"
              className="tuyere-top-view-dot"
              style={{ left: `${percent(tuyere.centerXM)}%` }}
              aria-pressed={openIds.has(tuyere.id)}
              aria-label={`${side === 'front' ? '前墙' : '后墙'} ${tuyere.index} 号风口，X = ${formatMm(tuyere.centerXM)} mm`}
              title={`#${tuyere.index} · X ${formatMm(tuyere.centerXM)} mm`}
              onClick={() => onToggle(tuyere.id)}
            >
              {tuyere.index}
            </button>
          ))}
        </div>
      ))}
      <div className="tuyere-top-view-axis" aria-hidden="true">
        <span>{formatMm(minXM)} mm</span>
        <span>{formatMm(minXM + lengthM)} mm</span>
      </div>
    </div>
  )
}

function idsForMode(tuyeres: FurnaceTuyerePlacement[], mode: Exclude<TuyereMode, 'custom'>): string[] {
  if (mode === 'all') return tuyeres.map((tuyere) => tuyere.id)
  if (mode === 'alternate') return tuyeres.filter((tuyere) => tuyere.index % 2 === 1).map((tuyere) => tuyere.id)
  return tuyeres.filter((tuyere) => (tuyere.side === 'front' ? tuyere.index % 2 === 1 : tuyere.index % 2 === 0)).map((tuyere) => tuyere.id)
}

function RangeNumberField({ label, value, min, max, step, digits = 0, unit, disabled, onChange }: {
  label: string
  value: number
  min: number
  max: number
  step: number
  digits?: number
  unit?: string
  disabled?: boolean
  onChange: (value: number) => void
}) {
  const shown = Number.isFinite(value) ? value.toFixed(digits) : ''
  const [draft, setDraft] = useState(shown)
  useEffect(() => { setDraft(shown) }, [shown])
  const commit = () => {
    const parsed = Number(draft)
    if (!Number.isFinite(parsed)) {
      setDraft(shown)
      return
    }
    onChange(Math.min(max, Math.max(min, parsed)))
  }
  const slider = Math.min(max, Math.max(min, Number.isFinite(value) ? value : min))
  return (
    <div className="furnace-range-field">
      <label className="furnace-parameter-field">
        <span>{label}{unit ? <small>{unit}</small> : null}</span>
        <input type="number" aria-label={label} min={min} max={max} step={step} value={draft} disabled={disabled} onChange={(event) => setDraft(event.target.value)} onBlur={commit} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }} />
      </label>
      <input className="furnace-range" type="range" aria-label={`${label}滑块`} min={min} max={max} step={step} value={slider} disabled={disabled} onChange={(event) => onChange(Number(event.target.value))} />
    </div>
  )
}

function SidebarNumber({ label, unit, value, min, max, disabled, tone = 'plain', onChange }: {
  label: string
  unit: string
  value: number
  min: number
  max: number
  disabled?: boolean
  tone?: 'plain' | 'gray'
  onChange: (value: number) => void
}) {
  const [draft, setDraft] = useState(String(value))
  useEffect(() => { setDraft(String(Math.round(value * 1000) / 1000)) }, [value])
  const commit = () => {
    const parsed = Number(draft)
    if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
      setDraft(String(Math.round(value * 1000) / 1000))
      return
    }
    onChange(parsed)
  }
  return (
    <label className={`furnace-parameter-field${tone === 'gray' ? ' furnace-sim-gray-field' : ''}`}>
      <span>{label}<small>{unit}</small></span>
      <input type="number" value={draft} min={min} max={max} disabled={disabled} onChange={(event) => setDraft(event.target.value)} onBlur={commit} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }} />
    </label>
  )
}

function axisRange(axis: SliceAxis, layout: FurnaceLayout, domain: FluidDomain) {
  const { bounds, nadirYM } = domain
  if (axis === 'x') return { minM: bounds.minX - layout.body.centerXM, maxM: bounds.maxX - layout.body.centerXM }
  if (axis === 'z') return { minM: bounds.minZ - layout.body.centerZM, maxM: bounds.maxZ - layout.body.centerZM }
  return { minM: bounds.minY - nadirYM, maxM: bounds.maxY - nadirYM }
}

function clampPosition(axis: SliceAxis, positionM: number, layout: FurnaceLayout, domain: FluidDomain) {
  const range = axisRange(axis, layout, domain)
  return Math.min(range.maxM, Math.max(range.minM, positionM))
}

function defaultPosition(axis: SliceAxis, layout: FurnaceLayout, domain: FluidDomain) {
  let value = 0
  if (axis === 'x') value = (layout.tuyeres[0]?.centerXM ?? layout.body.centerXM) - layout.body.centerXM
  else if (axis === 'y') value = (layout.tuyeres[0]?.centerYM ?? layout.body.centerYM) - domain.nadirYM
  return clampPosition(axis, value, layout, domain)
}

function nearestHistoryIndex(timeS: number, times: number[]) {
  let best = 0
  let gap = Number.POSITIVE_INFINITY
  times.forEach((time, index) => {
    const delta = Math.abs(time - timeS)
    if (delta < gap) {
      gap = delta
      best = index
    }
  })
  return best
}

function sameDisplay(a: { view: FlowView; index: number | null } | null, b: { view: FlowView; index: number | null } | null) {
  if (!a || !b || a.index !== b.index) return false
  return JSON.stringify(a.view) === JSON.stringify(b.view)
}

function absolutePosition(slice: SliceDraft, layout: FurnaceLayout, domain: FluidDomain) {
  if (slice.axis === 'x') return layout.body.centerXM + slice.positionM
  if (slice.axis === 'z') return layout.body.centerZM + slice.positionM
  return domain.nadirYM + slice.positionM
}

function statusLine(phase: MeshPhase, status: FlowStatus | null, running: boolean, error: string): { text: string; tone?: 'warn' | 'error' } {
  if (error) return { text: `计算中断：${error}`, tone: 'error' }
  if (phase === 'empty') return { text: '尚未生成网格' }
  if (phase === 'building') return { text: '正在生成网格…' }
  if (phase === 'stale') return { text: '参数已修改，请重新生成网格', tone: 'warn' }
  if (!status || status.timeS === 0) return { text: '' }
  const time = `${status.timeS.toFixed(2)} s`
  if (status.phase === 'diverged') return { text: `计算发散（${time}），请重置后减小气量或加密网格`, tone: 'error' }
  if (status.phase === 'limit') {
    const cap = FURNACE_SIM_CONFIG.numerics.maxPhysicalTimeS
    return status.averageFromS > 0
      ? { text: `已达到 ${cap} s 上限 · ${time}` }
      : { text: `已达到 ${cap} s 上限，未判定准稳态` }
  }
  if (status.phase === 'complete') return { text: `已完成 · 准稳态始于 ${status.averageFromS.toFixed(2)} s · 共 ${status.timeS.toFixed(2)} s` }
  if (status.phase === 'unconverged') return { text: `${running ? '计算中' : '已暂停'} · ${time} · 压力未收敛，已自动减小时间步`, tone: 'warn' }
  if (status.phase === 'steady') return { text: `已达准稳态（${status.averageFromS.toFixed(2)} s），再算 ${FURNACE_SIM_CONFIG.numerics.averageAfterSteadyS} s 自动停止 · ${time}` }
  return { text: `${running ? '计算中' : '已暂停'} · ${time}` }
}

export default function FurnaceFlowShowcase({ darkMode, design, scopeKey, oxygenVolumeFraction = 0.996, readOnly = false, framesRef, meshWireRef, onDecorationChange, onNotice }: Props) {
  const { overrides, save } = useFurnaceModelEdits('smelting', scopeKey, readOnly)
  const layout = useMemo(() => buildSmeltingFurnaceLayout(design, overrides), [design, overrides])
  const tuyereKey = layout.tuyeres.map((tuyere) => tuyere.id).join('|')
  const [mode, setMode] = useState<TuyereMode>('all')
  const [customIds, setCustomIds] = useState<string[]>(() => layout.tuyeres.map((tuyere) => tuyere.id))
  const [trackedTuyeres, setTrackedTuyeres] = useState(tuyereKey)
  if (trackedTuyeres !== tuyereKey) {
    setTrackedTuyeres(tuyereKey)
    setCustomIds((current) => current.filter((id) => layout.tuyeres.some((tuyere) => tuyere.id === id)))
  }
  const openIds = useMemo(() => (
    mode === 'custom'
      ? customIds.filter((id) => layout.tuyeres.some((tuyere) => tuyere.id === id))
      : idsForMode(layout.tuyeres, mode)
  ), [mode, customIds, layout.tuyeres])
  const openKey = openIds.join('|')
  const [oxygenNm3h, setOxygenNm3h] = useState(design.oxygenNm3h)
  const [trackedOxygen, setTrackedOxygen] = useState(design.oxygenNm3h)
  if (trackedOxygen !== design.oxygenNm3h) {
    setTrackedOxygen(design.oxygenNm3h)
    setOxygenNm3h(design.oxygenNm3h)
  }
  const activeOxygen = trackedOxygen === design.oxygenNm3h ? oxygenNm3h : design.oxygenNm3h
  const perTuyereNm3h = calculateTuyereOxygenPerTuyereNm3h(activeOxygen, openIds.length)
  const liquidMaxM = Math.max(layout.body.heightM - 0.05, 0.1)
  const defaultLance = layout.tuyeres[0]?.centerYM ?? layout.body.heightM * 0.22
  const [liquidLevelM, setLiquidLevelM] = useState(() => Math.min(3, liquidMaxM))
  const [lanceHeightM, setLanceHeightM] = useState(defaultLance)
  const [bathDensityKgM3, setBathDensityKgM3] = useState(DEFAULT_BATH_DENSITY_KG_M3)
  const tuyereDiameterM = layout.lanceDiameterM
  const insertionM = clampLanceInsertionM(layout, lanceHeightM, tuyereDiameterM, layout.lanceInsertionM)
  const maxInsertionMm = clampLanceInsertionM(layout, lanceHeightM, tuyereDiameterM, 1e6) * 1000
  const speedMs = inletSpeedMs(perTuyereNm3h, tuyereDiameterM / 2)

  const [meshPhase, setMeshPhase] = useState<MeshPhase>('empty')
  const [meshStats, setMeshStats] = useState<MeshStats | null>(null)
  const [showMesh, setShowMesh] = useState(true)
  const [running, setRunning] = useState(false)
  const [status, setStatus] = useState<FlowStatus | null>(null)
  const [error, setError] = useState('')
  const [showIso, setShowIso] = useState(true)
  const [showLines, setShowLines] = useState(false)
  const [isoAlpha, setIsoAlpha] = useState(FURNACE_SIM_CONFIG.post.defaultInterfaceAlpha)
  const [slices, setSlices] = useState<SliceDraft[]>([])
  const [historyTimes, setHistoryTimes] = useState<number[]>([])
  const [historyIndex, setHistoryIndex] = useState<number | null>(null)
  const [playing, setPlaying] = useState(false)
  const [loopPlayback, setLoopPlayback] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogIds, setDialogIds] = useState<string[]>([])
  const heldWire = useRef<Float32Array | null>(null)
  const sliceSerial = useRef(1)
  const playingRef = useRef(false)
  const loopRef = useRef(true)
  const historyTimesRef = useRef<number[]>([])
  const expectIndexRef = useRef<number | null>(null)
  const playbackTicket = useRef(0)
  const playbackPending = useRef(false)
  const runningRef = useRef(false)
  const pendingId = useRef<number | null>(null)
  const requestSerial = useRef(0)
  const desiredRef = useRef<{ view: FlowView; index: number | null } | null>(null)
  const sentRef = useRef<{ view: FlowView; index: number | null } | null>(null)
  const advanceAfter = useRef<number | null>(null)
  const selectedRef = useRef<number | null>(null)
  const heldGeometry = useRef<{ meshId: number; iso: FlowPostFrame['iso']; lines: FlowPostFrame['lines'] }>({ meshId: -1, iso: null, lines: null })
  const flushRef = useRef<(force?: boolean) => number>(() => 0)
  const playNextRef = useRef<() => void>(() => {})
  loopRef.current = loopPlayback

  const domain = useMemo(() => buildFluidDomain(layout, {
    openTuyereIds: openIds,
    lanceDiameterM: tuyereDiameterM,
    lanceHeightM,
    lanceInsertionM: insertionM,
  }), [layout, openIds, tuyereDiameterM, lanceHeightM, insertionM])

  const view = useMemo<FlowView>(() => ({
    iso: showIso,
    isoAlpha,
    streamlines: showLines,
    slices: slices.filter((slice) => slice.visible).map((slice): PostSliceRequest => ({
      id: slice.id,
      axis: slice.axis,
      positionM: absolutePosition(slice, layout, domain),
      field: slice.field,
    })),
  }), [showIso, isoAlpha, showLines, slices, layout, domain])
  const physics = useMemo<FlowPhysics>(() => ({
    perTuyereNm3h, oxygenFraction: oxygenVolumeFraction, liquidDensityKgM3: bathDensityKgM3,
  }), [perTuyereNm3h, oxygenVolumeFraction, bathDensityKgM3])

  useEffect(() => {
    onDecorationChange({
      openTuyereIds: openIds,
      tuyereDiameterM,
      liquidLevelM,
      lanceHeightM,
      lanceInsertionM: insertionM,
      showField: meshPhase === 'ready',
      playing: running,
    })
  }, [onDecorationChange, openKey, openIds, tuyereDiameterM, liquidLevelM, lanceHeightM, insertionM, meshPhase, running])

  const meshSignature = useMemo(() => [
    layout.body.lengthM, layout.body.widthM, layout.body.heightM, layout.body.centerXM, layout.body.centerYM, layout.body.centerZM,
    layout.flare.lowerHeightM, layout.flare.upperHeightM, layout.flare.bottomWidthM, layout.flare.topWidthM,
    layout.flue.lengthM, layout.flue.widthM, layout.flue.heightM, layout.flue.centerXM, layout.flue.centerYM, layout.flue.centerZM,
    layout.tuyeres.map((tuyere) => `${tuyere.id}:${tuyere.centerXM}:${tuyere.centerZM}`).join(';'),
    tuyereDiameterM, insertionM, lanceHeightM, liquidLevelM,
  ].join('|'), [layout, tuyereDiameterM, insertionM, lanceHeightM, liquidLevelM])
  const signatureRef = useRef(meshSignature)
  signatureRef.current = meshSignature
  const builtSignature = useRef<string | null>(null)
  const workerRef = useRef<Worker | null>(null)
  const viewRef = useRef(view)
  viewRef.current = view
  const physicsRef = useRef(physics)
  physicsRef.current = physics
  const showMeshRef = useRef(showMesh)
  showMeshRef.current = showMesh

  const clearResults = () => {
    framesRef.current = null
    heldWire.current = null
    if (meshWireRef) meshWireRef.current = null
  }

  useEffect(() => {
    const worker = new Worker(new URL('../../../../workers/furnaceSideBlowSolver.worker.ts', import.meta.url), { type: 'module' })
    workerRef.current = worker
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const message = event.data
      if (message.type === 'error') {
        setRunning(false)
        setError(message.message)
        setMeshPhase((current) => (current === 'building' ? 'empty' : current))
        return
      }
      if (builtSignature.current !== signatureRef.current) return
      if (message.type === 'mesh') {
        heldWire.current = message.wire
        if (meshWireRef) meshWireRef.current = showMeshRef.current ? message.wire : null
        setMeshStats(message.stats)
        setMeshPhase('ready')
        return
      }
      if (message.type === 'status') {
        setStatus(message.status)
        const wasRunning = runningRef.current
        runningRef.current = message.running
        setRunning(message.running)
        historyTimesRef.current = message.historyTimesS
        setHistoryTimes(message.historyTimesS)
        if (message.running) {
          playbackTicket.current += 1
          playbackPending.current = false
          advanceAfter.current = null
          playingRef.current = false
          setPlaying(false)
          selectedRef.current = null
          setHistoryIndex(null)
        } else if (wasRunning) {
          const last = Math.max(0, message.historyTimesS.length - 1)
          selectedRef.current = last
          setHistoryIndex(last)
        }
        return
      }
      if (message.meshId !== heldGeometry.current.meshId) heldGeometry.current = { meshId: message.meshId, iso: null, lines: null }
      if (message.keepIso) message.iso = heldGeometry.current.iso
      else heldGeometry.current.iso = message.iso
      if (message.keepLines) message.lines = heldGeometry.current.lines
      else heldGeometry.current.lines = message.lines
      const answered = message.requestId > 0 && message.requestId === pendingId.current
      if (answered) pendingId.current = null
      framesRef.current = message
      const followUp = answered ? flushRef.current() : 0
      if (advanceAfter.current === -1 && followUp > 0) advanceAfter.current = followUp
      if (message.requestId > 0 && advanceAfter.current === message.requestId) {
        advanceAfter.current = null
        window.setTimeout(() => playNextRef.current(), FURNACE_SIM_CONFIG.post.playbackFrameMs)
      }
    }
    return () => {
      worker.postMessage({ type: 'stop' } satisfies WorkerRequest)
      worker.terminate()
      if (workerRef.current === worker) workerRef.current = null
      framesRef.current = null
      if (meshWireRef) meshWireRef.current = null
    }
  }, [framesRef, meshWireRef])

  const send = (message: WorkerRequest) => workerRef.current?.postMessage(message)

  const sendDisplay = (target: { view: FlowView; index: number | null }, force = false) => {
    desiredRef.current = target
    if (!workerRef.current) return 0
    if (runningRef.current) {
      workerRef.current.postMessage({ type: 'display', requestId: 0, view: target.view, index: null } satisfies WorkerRequest)
      return 0
    }
    if (pendingId.current != null) return 0
    if (!force && sameDisplay(sentRef.current, target)) return 0
    const id = requestSerial.current + 1
    requestSerial.current = id
    pendingId.current = id
    sentRef.current = target
    workerRef.current.postMessage({ type: 'display', requestId: id, view: target.view, index: target.index } satisfies WorkerRequest)
    return id
  }
  flushRef.current = (force?: boolean) => {
    const desired = desiredRef.current
    if (!desired) return 0
    return sendDisplay(desired, force)
  }
  playNextRef.current = () => {
    if (!playingRef.current) return
    const times = historyTimesRef.current
    if (times.length < 2) {
      playingRef.current = false
      setPlaying(false)
      return
    }
    let next = (expectIndexRef.current ?? 0) + 1
    if (next >= times.length) {
      if (!loopRef.current) {
        playbackTicket.current += 1
        playingRef.current = false
        setPlaying(false)
        return
      }
      next = 0
    }
    expectIndexRef.current = next
    selectedRef.current = next
    setHistoryIndex(next)
    const id = sendDisplay({ view: viewRef.current, index: next }, true)
    advanceAfter.current = id > 0 ? id : -1
  }

  useEffect(() => {
    setSlices((current) => {
      let changed = false
      const next = current.map((slice) => {
        const positionM = clampPosition(slice.axis, slice.positionM, layout, domain)
        if (positionM === slice.positionM) return slice
        changed = true
        return { ...slice, positionM }
      })
      return changed ? next : current
    })
  }, [layout, domain])

  const stopPlayback = () => {
    playbackTicket.current += 1
    playbackPending.current = false
    advanceAfter.current = null
    playingRef.current = false
    setPlaying(false)
  }

  useEffect(() => {
    if (builtSignature.current == null || builtSignature.current === meshSignature) return
    builtSignature.current = null
    send({ type: 'pause' })
    setRunning(false)
    stopPlayback()
    setHistoryIndex(null)
    setHistoryTimes([])
    historyTimesRef.current = []
    setMeshPhase('stale')
    clearResults()
  }, [meshSignature])

  useEffect(() => {
    if (meshPhase !== 'ready') return
    sendDisplay({ view, index: playingRef.current ? expectIndexRef.current : selectedRef.current })
  }, [view, meshPhase])

  useEffect(() => {
    if (meshPhase === 'ready') send({ type: 'physics', physics })
  }, [physics, meshPhase])

  useEffect(() => {
    if (meshPhase !== 'ready') return
    send({ type: 'tuyeres', openTuyereIds: openIds })
  }, [openKey, meshPhase])

  const generateMesh = () => {
    builtSignature.current = signatureRef.current
    setRunning(false)
    setStatus(null)
    setError('')
    stopPlayback()
    setHistoryIndex(null)
    setHistoryTimes([])
    historyTimesRef.current = []
    setMeshPhase('building')
    clearResults()
    send({
      type: 'configure',
      layout,
      openTuyereIds: openIds,
      lanceDiameterM: tuyereDiameterM,
      lanceHeightM,
      lanceInsertionM: insertionM,
      liquidLevelM,
      physics: physicsRef.current,
      view: viewRef.current,
    })
  }

  const toggleRun = () => {
    if (running) {
      send({ type: 'pause' })
      return
    }
    stopPlayback()
    selectedRef.current = null
    setHistoryIndex(null)
    setError('')
    setShowMesh(false)
    if (meshWireRef) meshWireRef.current = null
    if (status?.phase === 'diverged') send({ type: 'reset' })
    send({ type: 'run' })
  }

  const showHistoryIndex = (index: number) => {
    const last = Math.max(0, historyTimesRef.current.length - 1)
    const next = Math.max(0, Math.min(last, index))
    stopPlayback()
    expectIndexRef.current = next
    selectedRef.current = next
    setHistoryIndex(next)
    sendDisplay({ view: viewRef.current, index: next })
  }

  const togglePlayback = () => {
    if (playingRef.current) {
      stopPlayback()
      return
    }
    const times = historyTimesRef.current
    if (runningRef.current || times.length < 2) return
    const last = times.length - 1
    const index = selectedRef.current == null || selectedRef.current >= last ? 0 : selectedRef.current
    expectIndexRef.current = index
    selectedRef.current = index
    setHistoryIndex(index)
    playingRef.current = true
    setPlaying(true)
    const id = sendDisplay({ view: viewRef.current, index }, true)
    advanceAfter.current = id > 0 ? id : -1
  }

  const addSlice = () => {
    if (slices.length >= MAX_SLICES) return
    const axis = SLICE_AXES[slices.length % SLICE_AXES.length].id
    const id = `slice-${sliceSerial.current}`
    sliceSerial.current += 1
    setSlices((current) => [...current, { id, axis, positionM: defaultPosition(axis, layout, domain), field: 'alpha', visible: true }])
  }

  const updateSlice = (id: string, patch: Partial<SliceDraft>) => {
    setSlices((current) => current.map((slice) => {
      if (slice.id !== id) return slice
      const next = { ...slice, ...patch }
      if (patch.axis && patch.axis !== slice.axis && patch.positionM == null) next.positionM = defaultPosition(patch.axis, layout, domain)
      else next.positionM = clampPosition(next.axis, next.positionM, layout, domain)
      return next
    }))
  }

  const chooseMode = (next: TuyereMode) => {
    if (next === 'custom') {
      setDialogIds(openIds)
      setDialogOpen(true)
      return
    }
    setMode(next)
  }
  const saveBody = (key: 'lengthM' | 'heightM' | 'widthM', millimeters: number) => {
    save({
      ...overrides,
      'smelting.primary-body': { ...(overrides['smelting.primary-body'] ?? {}), [key]: millimeters / 1000 },
    }, '调整炉体尺寸')
  }
  const saveCounts = (key: 'jacketPitchM' | 'lanceDiameterM' | 'lanceInsertionM', millimeters: number, label: string) => {
    save({
      ...overrides,
      'smelting.annotation.counts': { ...(overrides['smelting.annotation.counts'] ?? {}), [key]: millimeters / 1000 },
    }, label)
  }
  const dialogPerTuyereNm3h = calculateTuyereOxygenPerTuyereNm3h(activeOxygen, dialogIds.length)
  const dialogSpeedMs = inletSpeedMs(dialogPerTuyereNm3h, tuyereDiameterM / 2)
  const line = statusLine(meshPhase, status, running, error)
  const onNoticeRef = useRef(onNotice)
  onNoticeRef.current = onNotice
  useEffect(() => {
    if (!line.text) return
    const tone = line.tone === 'error' ? 'error' : line.tone === 'warn' ? 'warning' : 'flow'
    onNoticeRef.current?.(line.text, tone)
  }, [line.text, line.tone])
  const ready = meshPhase === 'ready'
  const shownHistoryIndex = historyIndex == null ? Math.max(0, historyTimes.length - 1) : Math.min(historyIndex, Math.max(0, historyTimes.length - 1))
  const shownHistoryTime = historyIndex == null ? (status?.timeS ?? historyTimes[shownHistoryIndex] ?? 0) : (historyTimes[shownHistoryIndex] ?? 0)
  const historyEndS = historyTimes[historyTimes.length - 1] ?? 0
  const meshIntro = `按当前炉型生成六面体网格，采用系统内置的优化网格。目标约 ${FURNACE_SIM_CONFIG.mesh.targetCells / 10_000} 万单元，加密后实际单元数会略高于目标值。`

  return (
    <div className="furnace-sim-panel">
      <details open>
        <summary>参数</summary>
        <SidebarNumber tone="gray" label="炉长" unit="mm" value={Math.round(layout.body.lengthM * 1000)} min={500} max={200000} disabled={readOnly} onChange={(value) => saveBody('lengthM', value)} />
        <SidebarNumber tone="gray" label="炉宽" unit="mm" value={Math.round(layout.body.widthM * 1000)} min={500} max={50000} disabled={readOnly} onChange={(value) => saveBody('widthM', value)} />
        <SidebarNumber tone="gray" label="炉高" unit="mm" value={Math.round(layout.body.heightM * 1000)} min={500} max={80000} disabled={readOnly} onChange={(value) => saveBody('heightM', value)} />
        <SidebarNumber tone="gray" label="风口间距" unit="mm" value={layout.jacketPitchM * 1000} min={50} max={5000} disabled={readOnly} onChange={(value) => saveCounts('jacketPitchM', value, '调整间距')} />
        <SidebarNumber label="风口直径" unit="mm" value={tuyereDiameterM * 1000} min={5} max={500} disabled={readOnly} onChange={(value) => saveCounts('lanceDiameterM', value, '调整风口直径')} />
        <SidebarNumber label="风口入炉深度" unit="mm" value={layout.lanceInsertionM * 1000} min={0} max={Math.max(maxInsertionMm, 1)} disabled={readOnly} onChange={(value) => saveCounts('lanceInsertionM', value, '调整风口入炉深度')} />
        <SidebarNumber label="氧枪高度" unit="mm" value={lanceHeightM * 1000} min={50} max={Math.max(layout.body.heightM * 1000 - 50, 100)} onChange={(value) => setLanceHeightM(value / 1000)} />
        <SidebarNumber label="液面高度" unit="mm" value={liquidLevelM * 1000} min={50} max={liquidMaxM * 1000} onChange={(value) => setLiquidLevelM(value / 1000)} />
        <SidebarNumber label="熔体密度" unit="kg/m³" value={bathDensityKgM3} min={1500} max={8000} onChange={setBathDensityKgM3} />
        <SidebarNumber tone="gray" label="氧气气量" unit="Nm³/h" value={activeOxygen} min={0} max={1_000_000} onChange={setOxygenNm3h} />
        <div className="furnace-readonly-field">
          <span>风口出口速度</span>
          <span>{formatGas(speedMs)} m/s</span>
        </div>
        <div className="furnace-control-label">风口开闭</div>
        <div className="furnace-segmented" role="group" aria-label="风口开闭">
          {MODES.map((item) => (
            <button key={item.id} type="button" aria-pressed={mode === item.id} onClick={() => chooseMode(item.id)}>{item.label}</button>
          ))}
        </div>
      </details>
      <details open>
        <summary>网格</summary>
        <p className="furnace-tool-note">{meshIntro}</p>
        <div className="furnace-sim-row">
          <label className="furnace-control-check"><input type="checkbox" checked={showMesh && heldWire.current != null} disabled={heldWire.current == null} onChange={(event) => {
            const visible = event.target.checked
            setShowMesh(visible)
            if (meshWireRef) meshWireRef.current = visible ? heldWire.current : null
          }} />显示网格</label>
          <button type="button" className={meshPhase === 'building' || meshPhase === 'stale' ? 'furnace-mesh-button-muted' : 'furnace-mesh-button-ready'} onClick={generateMesh} disabled={meshPhase === 'building' || readOnly}>生成网格</button>
        </div>
        {ready && meshStats && <p className="furnace-tool-note">已生成 {(meshStats.fluidCells / 10_000).toFixed(1)} 万单元 · 最小单元 {(meshStats.minSizeM * 1000).toFixed(0)} mm</p>}
      </details>
      <details open>
        <summary>计算</summary>
        <div className="furnace-sim-actions">
          <button type="button" aria-pressed={running} disabled={!ready} onClick={toggleRun}>{running ? '暂停' : status?.phase === 'complete' ? '继续计算' : '开始计算'}</button>
        </div>
      </details>
      <details open>
        <summary>过程回放</summary>
        <RangeNumberField
          label={`时间 / ${historyEndS.toFixed(2)}`}
          unit="s"
          value={shownHistoryTime}
          min={0}
          max={Math.max(historyEndS, 0.01)}
          step={0.01}
          digits={2}
          disabled={running || historyTimes.length < 2}
          onChange={(value) => showHistoryIndex(nearestHistoryIndex(value, historyTimes))}
        />
        <div className="furnace-sim-row">
          <label className="furnace-control-check"><input type="checkbox" checked={loopPlayback} onChange={(event) => setLoopPlayback(event.target.checked)} />循环播放</label>
          <button type="button" aria-pressed={playing} disabled={running || !ready || historyTimes.length < 2} onClick={togglePlayback}>{playing ? '暂停' : '播放'}</button>
        </div>
      </details>
      <details open>
        <summary>结果显示</summary>
        <label className="furnace-control-check"><input type="checkbox" checked={showIso} onChange={(event) => setShowIso(event.target.checked)} />等值面（LVF）</label>
        {showIso && (
          <RangeNumberField label="LVF 阈值" value={isoAlpha} min={0.02} max={0.98} step={0.01} digits={2} onChange={setIsoAlpha} />
        )}
        <label className="furnace-control-check"><input type="checkbox" checked={showLines} onChange={(event) => setShowLines(event.target.checked)} />流线（速度）</label>
      </details>
      <details open>
        <summary>截面</summary>
        {slices.map((slice, index) => {
          const range = axisRange(slice.axis, layout, domain)
          const minMm = Math.round(range.minM * 1000)
          const maxMm = Math.round(range.maxM * 1000)
          const positionMm = Math.round(slice.positionM * 1000)
          return (
            <div className="furnace-sim-slice" key={slice.id}>
              <div className="furnace-sim-slice-head">
                <label className="furnace-control-check"><input type="checkbox" checked={slice.visible} onChange={(event) => updateSlice(slice.id, { visible: event.target.checked })} />截面 {index + 1}</label>
                <button type="button" className="furnace-sim-slice-delete" onClick={() => setSlices((current) => current.filter((item) => item.id !== slice.id))}>删除</button>
              </div>
              <RangeNumberField
                label="位置"
                value={positionMm}
                min={minMm}
                max={Math.max(minMm, maxMm)}
                step={1}
                unit="mm"
                onChange={(value) => updateSlice(slice.id, { positionM: value / 1000 })}
              />
              <label className="furnace-control-label">显示量
                <select aria-label={`截面 ${index + 1} 显示量`} value={slice.field} onChange={(event) => updateSlice(slice.id, { field: event.target.value as PostScalar })}>
                  {SLICE_FIELDS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                </select>
              </label>
              <div className="furnace-segmented furnace-segmented-3 furnace-slice-axes" role="group" aria-label={`截面 ${index + 1} 方向`}>
                {SLICE_AXES.map((item) => (
                  <button key={item.id} type="button" aria-pressed={slice.axis === item.id} onClick={() => updateSlice(slice.id, { axis: item.id })}>{item.label}</button>
                ))}
              </div>
            </div>
          )
        })}
        <div className="furnace-sim-actions">
          <button type="button" disabled={slices.length >= MAX_SLICES} onClick={addSlice}>添加截面</button>
        </div>
      </details>
      {dialogOpen && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="自定义风口">
          <div className={`max-h-[90vh] w-[96vw] max-w-[90rem] overflow-auto rounded-lg border p-5 shadow-xl ${darkMode ? 'border-gray-600 bg-gray-900 text-gray-100' : 'border-gray-200 bg-white text-gray-900'}`}>
            <h3 className="text-lg font-semibold">自定义风口</h3>
            <div className={`tuyere-dialog-metrics ${darkMode ? 'tuyere-dialog-metrics-dark' : ''}`}>
              <div className="tuyere-dialog-metric"><small>总氧气进量</small><strong>{formatGas(activeOxygen)}</strong><span>Nm³/h</span></div>
              <div className="tuyere-dialog-metric"><small>单口进量</small><strong>{formatGas(dialogPerTuyereNm3h)}</strong><span>Nm³/h</span></div>
              <div className="tuyere-dialog-metric"><small>出口速度</small><strong>{formatGas(dialogSpeedMs)}</strong><span>m/s</span></div>
              <div className="tuyere-dialog-metric"><small>风口数量</small><strong>{dialogIds.length}/{layout.tuyeres.length}</strong><span>已开 / 总数</span></div>
            </div>
            <TuyereTopView darkMode={darkMode} tuyeres={layout.tuyeres} furnaceLengthM={layout.body.lengthM} furnaceCenterXM={layout.body.centerXM} openIds={new Set(dialogIds)} onToggle={(id) => setDialogIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])} />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className={btnSecondary(darkMode)} onClick={() => setDialogOpen(false)}>取消</button>
              <button type="button" className={btnPrimary(darkMode)} onClick={() => { setCustomIds(dialogIds); setMode('custom'); setDialogOpen(false) }}>确定</button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}
