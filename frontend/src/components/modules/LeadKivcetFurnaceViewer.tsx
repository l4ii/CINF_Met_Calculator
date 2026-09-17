import { forwardRef, useCallback, useMemo } from 'react'
import type { SmeltingFurnaceDesignResult } from '../../utils/copperEquipmentSizing.ts'
import { buildLeadKivcetGeometry } from '../../utils/leadKivcetGeometry.ts'
import ParametricFurnaceViewport, { type FurnaceViewportHandle } from './ParametricFurnaceViewport.tsx'
import { buildKivcetModelScene } from '../../utils/furnaceModelScene.ts'
import { useFurnaceModelEdits } from './useFurnaceModelEdits.ts'

export type LeadKivcetFurnaceViewerHandle = FurnaceViewportHandle
type Props = { darkMode: boolean; design: SmeltingFurnaceDesignResult; readOnly?: boolean; scopeKey?: string }

const LeadKivcetFurnaceViewer = forwardRef<LeadKivcetFurnaceViewerHandle, Props>(function LeadKivcetFurnaceViewer({ darkMode, design, readOnly = false, scopeKey = 'default' }, ref) {
  const { overrides, save, reset, storageError, historyControls } = useFurnaceModelEdits('kivcet', scopeKey, readOnly)
  const input = useMemo(() => ({ bodyLengthM: design.designLengthM || design.furnaceLengthM, bodyWidthM: design.furnaceWidthM, bodyHeightM: Math.max((design.furnaceWidthM || 4) * 1.45, 4) }), [design])
  const geometry = useMemo(() => buildLeadKivcetGeometry(input, overrides), [input, overrides])
  const onComponentChange = useCallback((id: string, params: Record<string, number>) => save({ ...overrides, [id]: { ...(overrides[id] ?? {}), ...params } }, `${Object.keys(params).every(key => key.startsWith('center')) ? '移动' : '调整尺寸'}：${geometry.components.find(item => item.id === id)?.role ?? '构件'}`), [overrides, save, geometry.components])
  const resetComponent = useCallback((id: string) => { const next = { ...overrides }; delete next[id]; save(next, `恢复：${geometry.components.find(item => item.id === id)?.role ?? '构件'}`) }, [overrides, save, geometry.components])
  const onGlobalChange = useCallback((key: string, value: number) => { const id = 'kivcet.primary-body.reaction-tower'; save({ ...overrides, [id]: { ...(overrides[id] ?? {}), [key]: value } }, '调整炉体尺寸') }, [overrides, save])
  const globalFields = useMemo(() => {
    const tower = geometry.parts.find(part => part.id === 'reaction-tower')
    return [
      { key: 'lengthM', label: '炉长', value: tower?.lengthM ?? 10, unit: 'm', min: 0.5, max: 200 },
      { key: 'widthM', label: '炉宽', value: tower?.kind === 'box' ? tower.widthM : 4, unit: 'm', min: 0.5, max: 50 },
      { key: 'heightM', label: '炉高', value: tower?.kind === 'box' ? tower.heightM : 6, unit: 'm', min: 0.5, max: 100 },
    ]
  }, [geometry])
  const buildModel = useCallback(() => buildKivcetModelScene(geometry, darkMode), [geometry, darkMode])
  return <ParametricFurnaceViewport ref={ref} darkMode={darkMode} modelName="Kivcet炉" components={geometry.components} buildModel={buildModel} readOnly={readOnly} globalFields={globalFields} onGlobalChange={onGlobalChange} onComponentChange={onComponentChange} onResetComponent={resetComponent} onReset={reset} storageError={storageError} historyControls={historyControls} />
})
export default LeadKivcetFurnaceViewer
