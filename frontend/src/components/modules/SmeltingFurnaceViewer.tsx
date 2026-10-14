import { forwardRef, useCallback, useMemo, useRef, type ReactNode } from 'react'
import type { SmeltingFurnaceDesignResult } from '../../utils/copperEquipmentSizing.ts'
import { buildSmeltingFurnaceLayout } from '../../utils/copperFurnaceGeometry.ts'
import ParametricFurnaceViewport, { type FurnaceGlobalField, type FurnaceViewportHandle } from './ParametricFurnaceViewport.tsx'
import { buildSmeltingModelScene, type FlowSolverFrames, type SmeltingFlowDecoration } from '../../utils/furnaceModelScene.ts'
import { useFurnaceModelEdits } from './useFurnaceModelEdits.ts'

export type SmeltingFurnaceViewerHandle = FurnaceViewportHandle
export type { FlowSolverFrames, SmeltingFlowDecoration }
type Props = {
  darkMode: boolean
  design: SmeltingFurnaceDesignResult
  readOnly?: boolean
  scopeKey?: string
  /** 数值仿真时传入；炉体方案不传，外观与原来一致。 */
  flow?: SmeltingFlowDecoration | null
  flowPlaying?: boolean
  simulationSidebar?: ReactNode
  solverFramesRef?: { current: FlowSolverFrames | null }
  meshWireRef?: { current: Float32Array | null }
}

const SmeltingFurnaceViewer = forwardRef<SmeltingFurnaceViewerHandle, Props>(function SmeltingFurnaceViewer({ darkMode, design, readOnly = false, scopeKey = 'default', flow = null, flowPlaying = false, simulationSidebar, solverFramesRef, meshWireRef }, ref) {
  const { overrides, save, reset, storageError, historyControls } = useFurnaceModelEdits('smelting', scopeKey, readOnly)
  const layout = useMemo(() => buildSmeltingFurnaceLayout(design, overrides), [design, overrides])
  const onComponentChange = useCallback((id: string, params: Record<string, number>) => save({ ...overrides, [id]: { ...(overrides[id] ?? {}), ...params } }, `${Object.keys(params).every(key => key.startsWith('center')) ? '移动' : '调整尺寸'}：${layout.components.find(item => item.id === id)?.role ?? '构件'}`), [overrides, save, layout.components])
  const resetComponent = useCallback((id: string) => { const next = { ...overrides }; delete next[id]; save(next, `恢复：${layout.components.find(item => item.id === id)?.role ?? '构件'}`) }, [overrides, save, layout.components])
  const onGlobalChange = useCallback((key: string, value: number) => {
    if (key === 'lanceDiameterMm' || key === 'lanceInsertionMm') {
      const param = key === 'lanceDiameterMm' ? 'lanceDiameterM' : 'lanceInsertionM'
      const id = 'smelting.annotation.counts'
      save({ ...overrides, [id]: { ...(overrides[id] ?? {}), [param]: value / 1000 } }, key === 'lanceDiameterMm' ? '调整风口直径' : '调整风口入炉深度')
      return
    }
    if (key === 'flueLengthMm' || key === 'flueWidthMm' || key === 'flueHeightMm') {
      const param = key === 'flueLengthMm' ? 'lengthM' : key === 'flueWidthMm' ? 'widthM' : 'heightM'
      const id = 'smelting.process-connection.flue'
      save({ ...overrides, [id]: { ...(overrides[id] ?? {}), [param]: value / 1000 } }, '调整烟道出口')
      return
    }
    const id = key === 'jacketPitchMm' ? 'smelting.annotation.counts' : 'smelting.primary-body'
    const param = key === 'jacketPitchMm' ? 'jacketPitchM' : key
    save({ ...overrides, [id]: { ...(overrides[id] ?? {}), [param]: key === 'jacketPitchMm' ? value / 1000 : value } }, key === 'jacketPitchMm' ? '调整水套间距' : '调整炉体尺寸')
  }, [overrides, save])
  const globalFields = useMemo<FurnaceGlobalField[]>(() => [
    { key: 'lengthM', label: '炉长', value: layout.body.lengthM, unit: 'm', min: 0.5, max: 200, tone: 'gray' },
    { key: 'widthM', label: '炉宽', value: layout.body.widthM, unit: 'm', min: 0.5, max: 50, tone: 'gray' },
    { key: 'jacketPitchMm', label: '水套间距', value: layout.jacketPitchM * 1000, unit: 'mm', min: 50, max: 5000, tone: 'gray' },
    { key: 'lanceDiameterMm', label: '风口直径', value: layout.lanceDiameterM * 1000, unit: 'mm', min: 5, max: 500 },
    { key: 'lanceInsertionMm', label: '风口入炉深度', value: layout.lanceInsertionM * 1000, unit: 'mm', min: 0, max: 2000 },
    { key: 'flueLengthMm', label: '烟道出口长度', value: layout.flue.lengthM * 1000, unit: 'mm', min: 100, max: 100000 },
    { key: 'flueWidthMm', label: '烟道出口宽度', value: layout.flue.widthM * 1000, unit: 'mm', min: 100, max: 50000 },
    { key: 'flueHeightMm', label: '烟道出口高度', value: layout.flue.heightM * 1000, unit: 'mm', min: 100, max: 50000 },
  ], [layout])
  const flowKey = flow ? [
    flow.tuyereDiameterM,
    flow.liquidLevelM,
    flow.lanceHeightM,
    flow.lanceInsertionM,
    Boolean(flow.showField),
    flow.openTuyereIds.join('|'),
  ].join(':') : ''
  const flowSnapshot = useRef(flow)
  flowSnapshot.current = flow
  const buildModel = useCallback(() => buildSmeltingModelScene(layout, darkMode, flowSnapshot.current), [layout, darkMode, flowKey])
  return <ParametricFurnaceViewport ref={ref} darkMode={darkMode} modelName="侧吹熔炼炉" components={layout.components} buildModel={buildModel} readOnly={readOnly} globalFields={globalFields} onGlobalChange={onGlobalChange} onComponentChange={onComponentChange} onResetComponent={resetComponent} onReset={reset} storageError={storageError} historyControls={historyControls} simulationSidebar={simulationSidebar} solverFramesRef={flow ? solverFramesRef : undefined} meshWireRef={flow ? meshWireRef : undefined} flowPlaying={Boolean(flow) && flowPlaying} />
})
export default SmeltingFurnaceViewer
