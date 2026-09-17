import { forwardRef, useCallback, useMemo } from 'react'
import type { SmeltingFurnaceDesignResult } from '../../utils/copperEquipmentSizing.ts'
import { buildSmeltingFurnaceLayout } from '../../utils/copperFurnaceGeometry.ts'
import ParametricFurnaceViewport, { type FurnaceViewportHandle } from './ParametricFurnaceViewport.tsx'
import { buildSmeltingModelScene } from '../../utils/furnaceModelScene.ts'
import { useFurnaceModelEdits } from './useFurnaceModelEdits.ts'

export type SmeltingFurnaceViewerHandle = FurnaceViewportHandle
type Props = { darkMode: boolean; design: SmeltingFurnaceDesignResult; readOnly?: boolean; scopeKey?: string }

const SmeltingFurnaceViewer = forwardRef<SmeltingFurnaceViewerHandle, Props>(function SmeltingFurnaceViewer({ darkMode, design, readOnly = false, scopeKey = 'default' }, ref) {
  const { overrides, save, reset, storageError, historyControls } = useFurnaceModelEdits('smelting', scopeKey, readOnly)
  const layout = useMemo(() => buildSmeltingFurnaceLayout(design, overrides), [design, overrides])
  const onComponentChange = useCallback((id: string, params: Record<string, number>) => save({ ...overrides, [id]: { ...(overrides[id] ?? {}), ...params } }, `${Object.keys(params).every(key => key.startsWith('center')) ? '移动' : '调整尺寸'}：${layout.components.find(item => item.id === id)?.role ?? '构件'}`), [overrides, save, layout.components])
  const resetComponent = useCallback((id: string) => { const next = { ...overrides }; delete next[id]; save(next, `恢复：${layout.components.find(item => item.id === id)?.role ?? '构件'}`) }, [overrides, save, layout.components])
  const onGlobalChange = useCallback((key: string, value: number) => {
    const id = key === 'jacketPitchMm' ? 'smelting.annotation.counts' : 'smelting.primary-body'
    const param = key === 'jacketPitchMm' ? 'jacketPitchM' : key
    save({ ...overrides, [id]: { ...(overrides[id] ?? {}), [param]: key === 'jacketPitchMm' ? value / 1000 : value } }, key === 'jacketPitchMm' ? '调整水套间距' : '调整炉体尺寸')
  }, [overrides, save])
  const globalFields = useMemo(() => [
    { key: 'lengthM', label: '炉长', value: layout.body.lengthM, unit: 'm', min: 0.5, max: 200 },
    { key: 'widthM', label: '炉宽', value: layout.body.widthM, unit: 'm', min: 0.5, max: 50 },
    { key: 'jacketPitchMm', label: '水套间距', value: layout.jacketPitchM * 1000, unit: 'mm', min: 50, max: 5000 },
  ], [layout])
  const buildModel = useCallback(() => buildSmeltingModelScene(layout, darkMode), [layout, darkMode])
  return <ParametricFurnaceViewport ref={ref} darkMode={darkMode} modelName="侧吹熔炼炉" components={layout.components} buildModel={buildModel} readOnly={readOnly} globalFields={globalFields} onGlobalChange={onGlobalChange} onComponentChange={onComponentChange} onResetComponent={resetComponent} onReset={reset} storageError={storageError} historyControls={historyControls} />
})
export default SmeltingFurnaceViewer
