import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import { createPortal } from 'react-dom'
import { calculateTuyereOxygenPerTuyereNm3h, type SmeltingFurnaceDesignResult } from '../../../../utils/copperEquipmentSizing.ts'
import { buildSmeltingFurnaceLayout, type FurnaceTuyerePlacement } from '../../../../utils/copperFurnaceGeometry.ts'
import { clampLanceInsertionM, furnaceWallHalfWidthM } from '../../../../utils/furnaceFluidDomain.ts'
import type { FlowFieldKind, FlowSolverFrames, FlowViewMode, SmeltingFlowDecoration } from '../../../../utils/furnaceModelScene.ts'
import { inletSpeedMs } from '../../../../utils/furnaceSideBlowSolver.ts'
import { useFurnaceModelEdits } from '../../useFurnaceModelEdits.ts'
import { btnPrimary, btnSecondary } from '../../../../theme/uiTheme.ts'

type Props = {
  darkMode: boolean
  design: SmeltingFurnaceDesignResult
  scopeKey: string
  /** 配料氧气列 O₂ 体积分数，0–1。标态流量已含该组成，速度只做温压换算。 */
  oxygenVolumeFraction?: number
  readOnly?: boolean
  framesRef: MutableRefObject<FlowSolverFrames | null>
  meshWireRef?: MutableRefObject<Float32Array | null>
  onDecorationChange: (decoration: SmeltingFlowDecoration & { playing: boolean }) => void
}

type TuyereMode = 'all' | 'alternate' | 'staggered' | 'custom'

const FIELDS: Array<{ id: FlowFieldKind; label: string }> = [
  { id: 'injectedGas', label: '进气示踪' },
  { id: 'interface', label: '气液界面' },
  { id: 'lvf', label: '液相分数' },
  { id: 'velocity', label: '速度场' },
  { id: 'pressure', label: '压力' },
]

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

function formatMm(valueM: number, digits = 0): string {
  if (!Number.isFinite(valueM)) return '0'
  return (valueM * 1000).toFixed(digits)
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

function inletSpeedHint(speedMs: number, oxygenVolumeFraction: number): string {
  return `按圆形风口面积 A = πd²/4 换算入口速度：${formatGas(speedMs)} m/s。O₂ ${formatGas(oxygenVolumeFraction * 100)} vol%，标况 273.15 K、101.325 kPa，入口实态 293.15 K、140 kPa。`
}

export default function FurnaceFlowShowcase({ darkMode, design, scopeKey, oxygenVolumeFraction = 0.996, readOnly = false, framesRef, meshWireRef, onDecorationChange }: Props) {
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
  const openCount = openIds.length
  const [oxygenNm3h, setOxygenNm3h] = useState(design.oxygenNm3h)
  const [trackedOxygen, setTrackedOxygen] = useState(design.oxygenNm3h)
  if (trackedOxygen !== design.oxygenNm3h) {
    setTrackedOxygen(design.oxygenNm3h)
    setOxygenNm3h(design.oxygenNm3h)
  }
  const activeOxygen = trackedOxygen === design.oxygenNm3h ? oxygenNm3h : design.oxygenNm3h
  const perTuyereNm3h = calculateTuyereOxygenPerTuyereNm3h(activeOxygen, openCount)
  const liquidMaxM = Math.max(layout.body.heightM - 0.05, 0.1)
  const defaultLance = layout.tuyeres[0]?.centerYM ?? layout.body.heightM * 0.22
  const [liquidLevelM, setLiquidLevelM] = useState(() => Math.min(3, liquidMaxM))
  const [lanceHeightM, setLanceHeightM] = useState(defaultLance)
  const [bathDensityKgM3, setBathDensityKgM3] = useState(DEFAULT_BATH_DENSITY_KG_M3)
  const tuyereDiameterMm = layout.lanceDiameterM * 1000
  const lanceInsertionMm = layout.lanceInsertionM * 1000
  const clampedInsertionM = clampLanceInsertionM(layout, lanceHeightM, tuyereDiameterMm / 1000, lanceInsertionMm / 1000)
  const maxInsertionMm = clampLanceInsertionM(layout, lanceHeightM, tuyereDiameterMm / 1000, 1e6) * 1000
  const wallHalfMm = furnaceWallHalfWidthM(layout, layout.body.centerYM + lanceHeightM) * 1000
  const [showHorizontal, setShowHorizontal] = useState(true)
  const [showLongitudinal, setShowLongitudinal] = useState(true)
  const [viewMode, setViewMode] = useState<FlowViewMode>('section')
  const [horizontalHeightM, setHorizontalHeightM] = useState(defaultLance)
  const [showArrows, setShowArrows] = useState(true)
  const [field, setField] = useState<FlowFieldKind>('injectedGas')
  const [playing, setPlaying] = useState(false)
  const [meshPhase, setMeshPhase] = useState<'empty' | 'ready' | 'stale'>('empty')
  const [meshInfo, setMeshInfo] = useState<{ tetCount: number; cellSizeM: number; zoneSizeM?: { tuyereM: number; surfaceM: number; bathM: number; gasM: number } } | null>(null)
  const [meshing, setMeshing] = useState(false)
  const [showMesh, setShowMesh] = useState(true)
  const heldWire = useRef<Float32Array | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogIds, setDialogIds] = useState<string[]>([])
  const [solverSerial, setSolverSerial] = useState(0)
  const [solverMetrics, setSolverMetrics] = useState({ physicalTimeS: 0, dtS: 0, pressureResidual: 0, divergenceMax: 0, massError: 0, iterations: 0 })
  const [solverError, setSolverError] = useState('')
  const pitchMm = layout.jacketPitchM * 1000
  const inletRadiusM = tuyereDiameterMm / 2000
  const openKey = openIds.join('|')

  useEffect(() => {
    onDecorationChange({
      field,
      openTuyereIds: openIds,
      perTuyereNm3h,
      tuyereDiameterM: tuyereDiameterMm / 1000,
      liquidLevelM,
      lanceHeightM,
      lanceInsertionM: clampedInsertionM,
      viewMode,
      horizontalSliceM: viewMode === 'section' && showHorizontal ? horizontalHeightM : null,
      showHorizontalSlice: viewMode === 'section' && showHorizontal,
      showLongitudinalSlice: viewMode === 'section' && showLongitudinal,
      showArrows,
      showField: meshPhase === 'ready',
      playing,
    })
  }, [onDecorationChange, field, openKey, perTuyereNm3h, tuyereDiameterMm, liquidLevelM, lanceHeightM, clampedInsertionM, viewMode, showHorizontal, showLongitudinal, horizontalHeightM, showArrows, playing, openIds, meshPhase])

  const params = useMemo(() => ({
    widthM: Math.max(layout.body.widthM, 0.2),
    heightM: Math.max(layout.body.heightM, 0.2),
    liquidLevelM,
    lanceHeightM,
    inletRadiusM,
    outletWidthM: layout.flue.widthM,
    liquidDensityKgM3: bathDensityKgM3,
    gasState: { oxygenFraction: oxygenVolumeFraction, normalTemperatureK: 273.15, normalPressurePa: 101325, actualTemperatureK: 293.15, actualPressurePa: 140000 },
    inletSpeedMs: inletSpeedMs(perTuyereNm3h, inletRadiusM, { oxygenFraction: oxygenVolumeFraction, normalTemperatureK: 273.15, normalPressurePa: 101325, actualTemperatureK: 293.15, actualPressurePa: 140000 }),
  }), [layout.body.widthM, layout.body.heightM, layout.flue.widthM, liquidLevelM, lanceHeightM, perTuyereNm3h, oxygenVolumeFraction, inletRadiusM, bathDensityKgM3])

  const meshSignature = useMemo(() => [
    layout.body.lengthM, layout.body.widthM, layout.body.heightM, layout.body.centerXM, layout.body.centerYM, layout.body.centerZM,
    layout.flare.lowerHeightM, layout.flare.upperHeightM, layout.flare.bottomWidthM, layout.flare.topWidthM, layout.flare.bottomLengthM, layout.flare.topLengthM,
    layout.flue.lengthM, layout.flue.widthM, layout.flue.heightM, layout.flue.centerXM, layout.flue.centerYM, layout.flue.centerZM,
    layout.jacketPitchM,
    layout.tuyeres.map((tuyere) => `${tuyere.id}:${tuyere.centerXM}:${tuyere.centerYM}:${tuyere.centerZM}`).join(';'),
    tuyereDiameterMm, clampedInsertionM, lanceHeightM, liquidLevelM, activeOxygen, openKey, bathDensityKgM3,
  ].join('|'), [layout, tuyereDiameterMm, clampedInsertionM, lanceHeightM, liquidLevelM, activeOxygen, openKey, bathDensityKgM3])
  const signatureRef = useRef(meshSignature)
  signatureRef.current = meshSignature
  const builtSignature = useRef<string | null>(null)
  const pendingSignature = useRef<string | null>(null)
  const workerRef = useRef<Worker | null>(null)
  useEffect(() => {
    if (!builtSignature.current || builtSignature.current === meshSignature) return
    setMeshPhase('stale')
    setPlaying(false)
    framesRef.current = null
    heldWire.current = null
    if (meshWireRef) meshWireRef.current = null
    workerRef.current?.postMessage({ type: 'playing', playing: false })
  }, [framesRef, meshSignature, meshWireRef])
  useEffect(() => {
    const worker = new Worker(new URL('../../../../workers/furnaceSideBlowSolver.worker.ts', import.meta.url), { type: 'module' })
    workerRef.current = worker
    worker.onmessage = (event: MessageEvent<FlowSolverFrames | { type: 'mesh'; tetCount: number; cellSizeM: number; zoneSizeM?: { tuyereM: number; surfaceM: number; bathM: number; gasM: number }; wirePositions: Float32Array } | { type: 'error'; message: string }>) => {
      if (event.data.type === 'error') {
        setPlaying(false)
        setMeshing(false)
        setSolverError(event.data.message)
        return
      }
      const fresh = pendingSignature.current != null && pendingSignature.current === signatureRef.current
      if (!fresh) {
        framesRef.current = null
        heldWire.current = null
        if (meshWireRef) meshWireRef.current = null
        setMeshing(false)
        setMeshPhase('stale')
        return
      }
      if (event.data.type === 'mesh') {
        heldWire.current = event.data.wirePositions
        setShowMesh(true)
        if (meshWireRef) meshWireRef.current = event.data.wirePositions
        setMeshInfo({ tetCount: event.data.tetCount, cellSizeM: event.data.cellSizeM, zoneSizeM: event.data.zoneSizeM })
        return
      }
      framesRef.current = event.data
      if (builtSignature.current !== pendingSignature.current) {
        builtSignature.current = pendingSignature.current
        setMeshInfo((current) => ({ tetCount: event.data.tetCount, cellSizeM: event.data.cellSizeM, zoneSizeM: current?.zoneSizeM }))
        setMeshPhase('ready')
      }
      setMeshing(false)
      setSolverSerial(event.data.serial)
      setSolverMetrics({ physicalTimeS: event.data.physicalTimeS, dtS: event.data.dtS, pressureResidual: event.data.pressureResidual, divergenceMax: event.data.divergenceMax, massError: event.data.massError, iterations: event.data.iterations })
    }
    return () => {
      worker.postMessage({ type: 'stop' })
      worker.terminate()
      if (workerRef.current === worker) workerRef.current = null
      framesRef.current = null
    }
  }, [framesRef, meshWireRef])
  useEffect(() => {
    workerRef.current?.postMessage({ type: 'playing', playing })
  }, [playing])
  const divideMesh = () => {
    pendingSignature.current = signatureRef.current
    setPlaying(false)
    setMeshing(true)
    heldWire.current = null
    if (meshWireRef) meshWireRef.current = null
    workerRef.current?.postMessage({
      type: 'configure',
      layout,
      openTuyereIds: openIds,
      lanceDiameterM: tuyereDiameterMm / 1000,
      lanceHeightM,
      lanceInsertionM: clampedInsertionM,
      liquidLevelM,
      inletSpeedMs: params.inletSpeedMs,
      liquidDensityKgM3: bathDensityKgM3,
    })
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
  const speedHint = inletSpeedHint(params.inletSpeedMs, oxygenVolumeFraction)
  const dialogPerTuyereNm3h = calculateTuyereOxygenPerTuyereNm3h(activeOxygen, dialogIds.length)
  const dialogSpeedMs = inletSpeedMs(dialogPerTuyereNm3h, inletRadiusM)
  const dialogSpeedHint = inletSpeedHint(dialogSpeedMs, oxygenVolumeFraction)
  const heightLimitMm = Math.max(layout.body.heightM * 1000, 1)

  return (
    <div className="furnace-sim-panel" data-solver-serial={solverSerial}>
      <details open>
        <summary>参数</summary>
        <div className="furnace-control-label">炉体</div>
        <SidebarNumber tone="gray" label="炉长" unit="mm" value={Math.round(layout.body.lengthM * 1000)} min={500} max={200000} disabled={readOnly} onChange={(value) => saveBody('lengthM', value)} />
        <SidebarNumber tone="gray" label="炉宽" unit="mm" value={Math.round(layout.body.widthM * 1000)} min={500} max={50000} disabled={readOnly} onChange={(value) => saveBody('widthM', value)} />
        <SidebarNumber tone="gray" label="炉高" unit="mm" value={Math.round(layout.body.heightM * 1000)} min={500} max={80000} disabled={readOnly} onChange={(value) => saveBody('heightM', value)} />
        <div className="furnace-control-label">风口</div>
        <SidebarNumber
          tone="gray"
          label="间距"
          unit="mm"
          value={pitchMm}
          min={50}
          max={5000}
          disabled={readOnly}
          onChange={(value) => save({
            ...overrides,
            'smelting.annotation.counts': { ...(overrides['smelting.annotation.counts'] ?? {}), jacketPitchM: value / 1000 },
          }, '调整间距')}
        />
        <SidebarNumber label="风口直径" unit="mm" value={tuyereDiameterMm} min={5} max={500} disabled={readOnly} onChange={(value) => save({
          ...overrides,
          'smelting.annotation.counts': { ...(overrides['smelting.annotation.counts'] ?? {}), lanceDiameterM: value / 1000 },
        }, '调整风口直径')} />
        <SidebarNumber label="风口入炉深度" unit="mm" value={lanceInsertionMm} min={0} max={Math.max(maxInsertionMm, 1)} disabled={readOnly} onChange={(value) => save({
          ...overrides,
          'smelting.annotation.counts': { ...(overrides['smelting.annotation.counts'] ?? {}), lanceInsertionM: value / 1000 },
        }, '调整风口入炉深度')} />
        <SidebarNumber tone="gray" label="氧气气量" unit="Nm³/h" value={activeOxygen} min={0} max={1_000_000} onChange={setOxygenNm3h} />
        <div className="furnace-readonly-field furnace-speed-tip" title={speedHint}>
          <span>入口速度</span>
          <span>{formatGas(params.inletSpeedMs)} m/s</span>
        </div>
        <div className="furnace-control-label">风口开闭</div>
        <div className="furnace-segmented" role="group" aria-label="风口开闭">
          {MODES.map((item) => (
            <button key={item.id} type="button" aria-pressed={mode === item.id} onClick={() => chooseMode(item.id)}>{item.label}</button>
          ))}
        </div>
        <div className="furnace-control-label">初始条件</div>
        <SidebarNumber label="液面高度" unit="mm" value={liquidLevelM * 1000} min={50} max={liquidMaxM * 1000} onChange={(value) => setLiquidLevelM(value / 1000)} />
        <p className="furnace-tool-note">液面自弧底最低点起算，默认 3000 mm。改参数后需要重新划分网格。</p>
        <SidebarNumber label="氧枪高度" unit="mm" value={lanceHeightM * 1000} min={50} max={Math.max(layout.body.heightM * 1000 - 50, 100)} onChange={(value) => setLanceHeightM(value / 1000)} />
        <p className="furnace-tool-note">水套随氧枪高度移动，不参与计算。当前位置内壁半宽 {formatMm(wallHalfMm / 1000)} mm，入炉深度不超过 {formatMm(maxInsertionMm / 1000)} mm，升到外扩段时炉壁变宽，允许的深度一起变大。</p>
        <SidebarNumber label="熔池液相密度" unit="kg/m³" value={bathDensityKgM3} min={1500} max={8000} onChange={setBathDensityKgM3} />
      </details>
      <details open>
        <summary>网格</summary>
        <p className="furnace-tool-note">按风口直径布 5 层同尺度网格，熔池和液面上 200 mm 用 200 mm，再往上每升高约 200 mm 竖向尺寸翻倍。2 m 炉宽约有 10 层，不再按目标个数反推。求解仍把每个六面体拆成 5 个四面体。</p>
        <button type="button" onClick={divideMesh} disabled={meshing}>{meshing ? '正在划分网格' : meshPhase === 'empty' ? '划分网格' : '重新划分网格'}</button>
        <label className="furnace-control-check"><input type="checkbox" checked={showMesh && heldWire.current != null} disabled={heldWire.current == null} onChange={(event) => {
          const visible = event.target.checked
          setShowMesh(visible)
          if (meshWireRef) meshWireRef.current = visible ? heldWire.current : null
        }} />显示网格</label>
        <p className="furnace-tool-note">
          {meshing && '正在划分网格，完成后炉内会显示网格线。'}
          {!meshing && meshPhase === 'empty' && '尚未划分网格。划分后先看网格线，看完可以关掉。'}
          {!meshing && meshPhase === 'stale' && '参数已变更，请重新划分网格。'}
          {!meshing && meshPhase === 'ready' && meshInfo && `六面体约 ${Math.round(meshInfo.tetCount / 5)} · 四面体 ${meshInfo.tetCount}。风口 ${Math.round((meshInfo.zoneSizeM?.tuyereM ?? meshInfo.cellSizeM) * 1000)} mm × 5 层，熔池和液面带 200 mm，气相从 ${Math.round((meshInfo.zoneSizeM?.gasM ?? meshInfo.cellSizeM) * 1000)} mm 起随高度翻倍。`}
        </p>
      </details>
      <details open>
        <summary>计算</summary>
        <button type="button" aria-pressed={playing} disabled={!playing && meshPhase !== 'ready'} onClick={() => {
          setPlaying((current) => {
            if (!current) {
              setShowMesh(false)
              if (meshWireRef) meshWireRef.current = null
              setHorizontalHeightM(lanceHeightM)
              setShowHorizontal(true)
              setViewMode('section')
              setField('injectedGas')
              setSolverError('')
            }
            return !current
          })
        }}>{playing ? '暂停计算' : '开始计算'}</button>
        {meshPhase !== 'ready' && !playing && <p className="furnace-tool-note">{meshPhase === 'stale' ? '网格已过期，开始计算前请重新划分。' : '请先划分网格。'}</p>}
        {solverError && <p role="alert" className="furnace-field-error">计算中断：{solverError}</p>}
        <div className="furnace-solver-metrics" aria-live="polite">
          <p className="furnace-tool-note">{playing ? `正在计算 · 第 ${solverSerial} 步` : meshPhase === 'ready' ? '初始场已生成，计算尚未开始。' : '计算未开始。'}{meshPhase === 'ready' ? ` · 物理时间 ${solverMetrics.physicalTimeS.toExponential(2)} s` : ''}</p>
          {meshPhase === 'ready' && <>
            <p className="furnace-tool-note">Δt {solverMetrics.dtS.toExponential(2)} s · 压力修正量 {solverMetrics.pressureResidual.toExponential(2)} Pa · 散度 {solverMetrics.divergenceMax.toExponential(2)} s⁻¹</p>
            <p className="furnace-tool-note">液相守恒误差 {solverMetrics.massError.toExponential(2)} · 压力迭代 {solverMetrics.iterations}</p>
          </>}
        </div>
        <p className="furnace-tool-note">入口为开启风口的折算速度，出口为烟道顶静压出流。无热耦合、表面张力、化学反应和气泡滑移，仅用于方案演示。</p>
      </details>
      <details open>
        <summary>结果显示</summary>
        <label className="furnace-control-label">场变量
          <select aria-label="显示场" value={field} onChange={(event) => setField(event.target.value as FlowFieldKind)}>
            {FIELDS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
        <p className="furnace-tool-note">{field === 'injectedGas' ? '气体从开启风口的伸入端水平吹入。开始计算后，步数增加，颜色从风口向炉内铺开。' : field === 'interface' ? '液相分数梯度显示界面位置。' : field === 'lvf' ? '液相体积分数 α，范围 0–1。' : field === 'velocity' ? '速度模值 m/s，箭头方向表示速度方向。' : '表压 Pa，按当前结果的范围着色。'} 当前是单速度混合物：一个速度场、液相分数和进气示踪，没有多相 k-ε，也不计算湍动能、耗散率、湍流黏度和温度。</p>
        <label className="furnace-control-check"><input type="checkbox" checked={showArrows} onChange={(event) => setShowArrows(event.target.checked)} />显示速度箭头</label>
        <div className="slice-switch">
          <span>显示方式</span>
          <div className="furnace-segmented" role="group" aria-label="流场显示方式">
            <button type="button" aria-pressed={viewMode === 'section'} onClick={() => setViewMode('section')}>截面</button>
            <button type="button" aria-pressed={viewMode === 'volume'} onClick={() => setViewMode('volume')}>三维流场</button>
          </div>
        </div>
        {viewMode === 'section' && (
          <>
            <div className="slice-switch">
              <span>喷枪口水平截面</span>
              <div className="furnace-segmented" role="group" aria-label="喷枪口水平截面">
                <button type="button" aria-pressed={showHorizontal} onClick={() => setShowHorizontal(true)}>显示</button>
                <button type="button" aria-pressed={!showHorizontal} onClick={() => setShowHorizontal(false)}>隐藏</button>
              </div>
            </div>
            {showHorizontal && (
              <>
                <SidebarNumber label="横切高度" unit="mm" value={horizontalHeightM * 1000} min={0} max={heightLimitMm} onChange={(value) => setHorizontalHeightM(value / 1000)} />
                <label className="furnace-control-label slice-height-slider">拖动调整
                  <input aria-label="横切高度滑块" type="range" min={0} max={heightLimitMm} step={1} value={Math.min(heightLimitMm, Math.round(horizontalHeightM * 1000))} onChange={(event) => setHorizontalHeightM(Number(event.target.value) / 1000)} />
                </label>
              </>
            )}
            <div className="slice-switch">
              <span>纵轴中心截面</span>
              <div className="furnace-segmented" role="group" aria-label="纵轴中心截面">
                <button type="button" aria-pressed={showLongitudinal} onClick={() => setShowLongitudinal(true)}>显示</button>
                <button type="button" aria-pressed={!showLongitudinal} onClick={() => setShowLongitudinal(false)}>隐藏</button>
              </div>
            </div>
          </>
        )}
      </details>
      {dialogOpen && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="自定义风口">
          <div className={`max-h-[90vh] w-[96vw] max-w-[90rem] overflow-auto rounded-lg border p-5 shadow-xl ${darkMode ? 'border-gray-600 bg-gray-900 text-gray-100' : 'border-gray-200 bg-white text-gray-900'}`}>
            <h3 className="text-lg font-semibold">自定义风口</h3>
            <div className={`tuyere-dialog-metrics ${darkMode ? 'tuyere-dialog-metrics-dark' : ''}`}>
              <div className="tuyere-dialog-metric"><small>总氧气进量</small><strong>{formatGas(activeOxygen)}</strong><span>Nm³/h</span></div>
              <div className="tuyere-dialog-metric"><small>单口进量</small><strong>{formatGas(dialogPerTuyereNm3h)}</strong><span>Nm³/h</span></div>
              <div className="tuyere-dialog-metric" title={dialogSpeedHint}><small>入口速度</small><strong>{formatGas(dialogSpeedMs)}</strong><span>m/s</span></div>
              <div className="tuyere-dialog-metric"><small>风口数量</small><strong>{dialogIds.length}/{layout.tuyeres.length}</strong><span>已开 / 总数</span></div>
            </div>
            <p className={`mt-3 text-sm ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>俯视图中蓝色为开启，灰色为关闭。确定后用于本次仿真。</p>
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
