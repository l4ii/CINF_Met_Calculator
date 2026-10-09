import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import { createPortal } from 'react-dom'
import { calculateTuyereOxygenPerTuyereNm3h, type SmeltingFurnaceDesignResult } from '../../../../utils/copperEquipmentSizing.ts'
import { buildSmeltingFurnaceLayout, type FurnaceTuyerePlacement } from '../../../../utils/copperFurnaceGeometry.ts'
import type { FlowFieldKind, FlowSolverFrames, SmeltingFlowDecoration } from '../../../../utils/furnaceModelScene.ts'
import { inletSpeedMs, type InletSide, type SolverParams } from '../../../../utils/furnaceSideBlowSolver.ts'
import { useFurnaceModelEdits } from '../../useFurnaceModelEdits.ts'

type Props = {
  darkMode: boolean
  design: SmeltingFurnaceDesignResult
  scopeKey: string
  readOnly?: boolean
  framesRef: MutableRefObject<FlowSolverFrames | null>
  onDecorationChange: (decoration: SmeltingFlowDecoration & { playing: boolean }) => void
}

type TuyereMode = 'all' | 'alternate' | 'staggered' | 'custom'

const FIELDS: Array<{ id: FlowFieldKind; label: string }> = [
  { id: 'interface', label: '气液界面' },
  { id: 'lvf', label: '液相分数' },
  { id: 'velocity', label: '速度场' },
  { id: 'temperature', label: '温度场' },
]

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

function idsForMode(tuyeres: FurnaceTuyerePlacement[], mode: Exclude<TuyereMode, 'custom'>): string[] {
  if (mode === 'all') return tuyeres.map((tuyere) => tuyere.id)
  if (mode === 'alternate') return tuyeres.filter((tuyere) => tuyere.index % 2 === 1).map((tuyere) => tuyere.id)
  return tuyeres.filter((tuyere) => (tuyere.side === 'front' ? tuyere.index % 2 === 1 : tuyere.index % 2 === 0)).map((tuyere) => tuyere.id)
}

function neededSides(tuyeres: FurnaceTuyerePlacement[], openIds: readonly string[]): InletSide[] {
  const open = new Set(openIds)
  let both = false
  let front = false
  let back = false
  const indexes = new Set(tuyeres.map((tuyere) => tuyere.index))
  for (const index of indexes) {
    const frontOpen = tuyeres.some((tuyere) => tuyere.side === 'front' && tuyere.index === index && open.has(tuyere.id))
    const backOpen = tuyeres.some((tuyere) => tuyere.side === 'back' && tuyere.index === index && open.has(tuyere.id))
    if (frontOpen && backOpen) both = true
    else if (frontOpen) front = true
    else if (backOpen) back = true
  }
  const sides: InletSide[] = []
  if (both || (!front && !back)) sides.push('both')
  if (front) sides.push('front')
  if (back) sides.push('back')
  return sides
}

function SidebarNumber({ label, unit, value, min, max, disabled, onChange }: {
  label: string
  unit: string
  value: number
  min: number
  max: number
  disabled?: boolean
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
    <label className="furnace-parameter-field">
      <span>{label}<small>{unit}</small></span>
      <input type="number" value={draft} min={min} max={max} disabled={disabled} onChange={(event) => setDraft(event.target.value)} onBlur={commit} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }} />
    </label>
  )
}

function TuyerePlan({
  tuyeres,
  openIds,
  lengthM,
  widthM,
  interactive,
  onToggle,
}: {
  tuyeres: FurnaceTuyerePlacement[]
  openIds: ReadonlySet<string>
  lengthM: number
  widthM: number
  interactive: boolean
  onToggle?: (id: string) => void
}) {
  const displayZ = (z: number) => -z
  const xs = tuyeres.map((tuyere) => tuyere.centerXM)
  const zs = tuyeres.map((tuyere) => displayZ(tuyere.centerZM))
  const minX = Math.min(-lengthM / 2, ...xs, 0) - 0.8
  const maxX = Math.max(lengthM / 2, ...xs, 0) + 0.8
  const minY = Math.min(-widthM / 2, ...zs, 0) - 0.9
  const maxY = Math.max(widthM / 2, ...zs, 0) + 0.9
  const spanX = Math.max(maxX - minX, 1)
  const spanY = Math.max(maxY - minY, 1)
  const percent = (value: number, start: number, span: number) => `${(value - start) / span * 100}%`
  return (
    <div className={`relative w-full ${interactive ? 'h-[420px]' : 'h-52'}`}>
      <div
        className="absolute rounded-md border-2 border-slate-500 bg-slate-200/80"
        style={{
          left: percent(-lengthM / 2, minX, spanX),
          top: percent(-widthM / 2, minY, spanY),
          width: percent(lengthM, 0, spanX),
          height: percent(widthM, 0, spanY),
        }}
      />
      <span className="absolute left-1/2 -translate-x-1/2 text-xs text-slate-600" style={{ top: `calc(${percent(-widthM / 2, minY, spanY)} - 1.1rem)` }}>前墙</span>
      <span className="absolute left-1/2 -translate-x-1/2 text-xs text-slate-600" style={{ top: `calc(${percent(widthM / 2, minY, spanY)} + 0.15rem)` }}>后墙</span>
      {tuyeres.map((tuyere) => {
        const open = openIds.has(tuyere.id)
        const className = `absolute flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 text-xs font-semibold outline-none ${
          interactive ? 'h-9 w-9' : 'h-6 w-6'
        } ${open ? 'border-red-700 bg-red-600 text-white' : 'border-slate-400 bg-white text-slate-600'}`
        const style = { left: percent(tuyere.centerXM, minX, spanX), top: percent(displayZ(tuyere.centerZM), minY, spanY) }
        if (!interactive) return <span key={tuyere.id} className={className} style={style}>{tuyere.index}</span>
        return (
          <button key={tuyere.id} type="button" className={className} style={style} aria-pressed={open} onClick={() => onToggle?.(tuyere.id)}>
            {tuyere.index}
          </button>
        )
      })}
    </div>
  )
}

export default function FurnaceFlowShowcase({ darkMode, design, scopeKey, readOnly = false, framesRef, onDecorationChange }: Props) {
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
  const openIds = mode === 'custom'
    ? customIds.filter((id) => layout.tuyeres.some((tuyere) => tuyere.id === id))
    : idsForMode(layout.tuyeres, mode)
  const openCount = openIds.length
  const [oxygenNm3h, setOxygenNm3h] = useState(design.oxygenNm3h)
  const [trackedOxygen, setTrackedOxygen] = useState(design.oxygenNm3h)
  if (trackedOxygen !== design.oxygenNm3h) {
    setTrackedOxygen(design.oxygenNm3h)
    setOxygenNm3h(design.oxygenNm3h)
  }
  const activeOxygen = trackedOxygen === design.oxygenNm3h ? oxygenNm3h : design.oxygenNm3h
  const perTuyereNm3h = calculateTuyereOxygenPerTuyereNm3h(activeOxygen, openCount)
  const defaultLiquid = Math.round(layout.body.heightM * 0.3 * 100) / 100
  const defaultLance = Math.round((layout.tuyeres[0]?.centerYM ?? layout.body.heightM * 0.22) * 100) / 100
  const [liquidLevelM, setLiquidLevelM] = useState(defaultLiquid)
  const [lanceHeightM, setLanceHeightM] = useState(defaultLance)
  const [field, setField] = useState<FlowFieldKind>('interface')
  const [playing, setPlaying] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogIds, setDialogIds] = useState<string[]>([])
  const [solverSerial, setSolverSerial] = useState(0)
  const pitchMm = layout.jacketPitchM * 1000
  const openKey = openIds.join('|')

  useEffect(() => {
    onDecorationChange({
      field,
      openTuyereIds: openIds,
      perTuyereNm3h,
      liquidLevelM,
      lanceHeightM,
      playing,
    })
  }, [onDecorationChange, field, openKey, perTuyereNm3h, liquidLevelM, lanceHeightM, playing, openIds])

  const params = useMemo<SolverParams>(() => ({
    widthM: Math.max(layout.body.widthM, 0.2),
    heightM: Math.max(layout.body.heightM, 0.2),
    liquidLevelM,
    lanceHeightM,
    inletSpeedMs: inletSpeedMs(perTuyereNm3h, layout.tuyeres[0]?.radiusM ?? 0.11),
    inletRadiusM: layout.tuyeres[0]?.radiusM ?? 0.11,
  }), [layout.body.widthM, layout.body.heightM, layout.tuyeres, liquidLevelM, lanceHeightM, perTuyereNm3h])
  const sides = useMemo(() => neededSides(layout.tuyeres, openIds), [layout.tuyeres, openKey, openIds])

  const playingNow = useRef(playing)
  playingNow.current = playing
  const workerRef = useRef<Worker | null>(null)
  useEffect(() => {
    const worker = new Worker(new URL('../../../../workers/furnaceSideBlowSolver.worker.ts', import.meta.url), { type: 'module' })
    workerRef.current = worker
    worker.onmessage = (event: MessageEvent<FlowSolverFrames>) => {
      framesRef.current = { ...event.data, inletSpeedMs: params.inletSpeedMs }
      setSolverSerial(event.data.serial)
    }
    worker.postMessage({ type: 'configure', params, sides, playing: playingNow.current })
    return () => {
      worker.postMessage({ type: 'stop' })
      worker.terminate()
      if (workerRef.current === worker) workerRef.current = null
      framesRef.current = null
    }
  }, [framesRef, params, sides])

  useEffect(() => {
    workerRef.current?.postMessage({ type: 'playing', playing })
  }, [playing])

  const chooseMode = (next: TuyereMode) => {
    if (next === 'custom') {
      setDialogIds(openIds)
      setDialogOpen(true)
      return
    }
    setMode(next)
  }

  return (
    <div data-solver-serial={solverSerial}>
      <SidebarNumber label="氧气气量" unit="Nm³/h" value={activeOxygen} min={0} max={1_000_000} onChange={setOxygenNm3h} />
      <p className="furnace-tool-note">风口数 {openCount}</p>
      <p className="furnace-tool-note">单口 {formatGas(perTuyereNm3h)} Nm³/h</p>
      <SidebarNumber
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
      <SidebarNumber label="液面高度" unit="m" value={liquidLevelM} min={0.05} max={Math.max(layout.body.heightM - 0.05, 0.1)} onChange={setLiquidLevelM} />
      <SidebarNumber label="氧枪高度" unit="m" value={lanceHeightM} min={0.05} max={Math.max(layout.body.heightM - 0.05, 0.1)} onChange={setLanceHeightM} />
      <div className="furnace-segmented" role="group" aria-label="风口开闭">
        {MODES.map((item) => (
          <button key={item.id} type="button" aria-pressed={mode === item.id} onClick={() => chooseMode(item.id)}>{item.label}</button>
        ))}
      </div>
      <TuyerePlan tuyeres={layout.tuyeres} openIds={new Set(openIds)} lengthM={layout.body.lengthM} widthM={layout.body.widthM} interactive={false} />
      <div className="furnace-segmented" role="group" aria-label="显示场">
        {FIELDS.map((item) => (
          <button key={item.id} type="button" aria-pressed={field === item.id} onClick={() => setField(item.id)}>{item.label}</button>
        ))}
      </div>
      <button type="button" aria-pressed={playing} onClick={() => setPlaying((current) => !current)}>{playing ? '暂停计算' : '开始计算'}</button>
      <p className="furnace-tool-note">{playing ? '正在计算炉宽截面。' : '计算已暂停。'}</p>
      {dialogOpen && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-6">
          <div className={`max-h-[90vh] w-[min(920px,100%)] overflow-auto rounded-2xl border p-5 ${darkMode ? 'border-slate-600 bg-slate-900 text-slate-100' : 'border-slate-200 bg-white text-slate-900'}`}>
            <h3 className="text-lg font-semibold">自定义风口</h3>
            <p className={`mt-1 text-sm ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>实心为开启，描边为关闭。确定后用于本次仿真。</p>
            <div className="mt-4">
              <TuyerePlan
                tuyeres={layout.tuyeres}
                openIds={new Set(dialogIds)}
                lengthM={layout.body.lengthM}
                widthM={layout.body.widthM}
                interactive
                onToggle={(id) => setDialogIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])}
              />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="rounded-lg border px-4 py-2 text-sm" onClick={() => setDialogOpen(false)}>取消</button>
              <button type="button" className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white" onClick={() => { setCustomIds(dialogIds); setMode('custom'); setDialogOpen(false) }}>确定</button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}
