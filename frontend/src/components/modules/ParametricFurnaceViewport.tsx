import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type ReactNode } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js'
import type { ModelComponentManifest } from '../../utils/modelComponentManifest.ts'
import { applyModelDisplay, disposeModel, exportFurnaceStl, furnaceBodyBounds, sectionPlane, type ModelDisplayMode, type ModelSectionAxis, type ModelSectionKeep } from '../../utils/furnaceViewTools.ts'

export type FurnaceViewportHandle = {
  capturePngDataUrl: () => string | null
  getComponentManifest: () => ModelComponentManifest[]
}

export type FurnaceGlobalField = { key: string; label: string; value: number; unit: string; min?: number; max?: number; tone?: 'plain' | 'gray' }
type Props = {
  darkMode: boolean
  modelName: string
  components: ModelComponentManifest[]
  buildModel: () => THREE.Group
  readOnly?: boolean
  globalFields: FurnaceGlobalField[]
  onGlobalChange: (key: string, value: number) => void
  onComponentChange: (id: string, params: Record<string, number>) => void
  onResetComponent: (id: string) => void
  onReset: () => void
  storageError?: string | null
  historyControls: { undo: () => void; redo: () => void; canUndo: boolean; canRedo: boolean; undoLabel: string; redoLabel: string; recent: string[] }
  /** 数值仿真时替换左侧几何参数区 */
  simulationSidebar?: ReactNode
  flowPlaying?: boolean
  solverFramesRef?: { current: { serial: number } | null }
  meshWireRef?: { current: Float32Array | null }
  flowField?: string
}

const groupLabels: Record<string, string> = {
  'primary-body': '主体结构', 'process-connection': '烟道与连接',
  'cooling-and-injection': '冷却与喷吹', support: '基础与支撑', annotation: '辅助信息',
}
const parameterLabels: Record<string, string> = {
  lengthM: '长度', widthM: '宽度', heightM: '高度', thicknessM: '厚度', radiusM: '半径',
  innerRadiusM: '内半径', outerRadiusM: '外半径', centerXM: 'X 位置', centerYM: 'Y 位置', centerZM: 'Z 位置',
  topWidthM: '顶部宽度', flareStartRatio: '外扩起点', startRatio: '外扩起点',
}

/** Commit only valid finished numbers; users can clear and type decimals without geometry jumping. */
function NumericField({ label, value, unit, min = 0.001, max = 1000, onChange, resetToken, disabled = false, tone = 'plain' }: {
  label: string; value: number; unit: string; min?: number; max?: number; onChange: (value: number) => void; resetToken?: unknown; disabled?: boolean; tone?: 'plain' | 'gray'
}) {
  const [draft, setDraft] = useState(String(Number(value.toFixed(4))))
  const [error, setError] = useState('')
  useEffect(() => { setDraft(String(Number(value.toFixed(4)))); setError('') }, [value, resetToken])
  const commit = () => {
    const parsed = Number(draft)
    if (draft.trim() && parsed === Number(value.toFixed(4))) { setError(''); return }
    if (!draft.trim() || !Number.isFinite(parsed) || parsed < min || parsed > max) {
      setError(`请输入 ${min}～${max} ${unit}`)
      return
    }
    setError('')
    onChange(parsed)
  }
  return <label className={`furnace-parameter-field${tone === 'gray' ? ' furnace-sim-gray-field' : ''}`}>
    <span>{label}<small>{unit}</small></span>
    <input type="number" step="any" min={min} max={max} value={draft} disabled={disabled} aria-invalid={Boolean(error)}
      onChange={event => { setDraft(event.target.value); setError('') }} onBlur={commit}
      onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); if (event.key === 'Escape') { setDraft(String(value)); setError('') } }} />
    {error && <span className="furnace-field-error" role="alert">{error}</span>}
  </label>
}

function fitModel(camera: THREE.PerspectiveCamera, orbit: OrbitControls, box: THREE.Box3) {
  if (box.isEmpty()) return
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  const radius = Math.max(size.length() / 2, 0.5)
  const halfFov = THREE.MathUtils.degToRad(camera.fov / 2)
  const angle = Math.min(halfFov, Math.atan(Math.tan(halfFov) * camera.aspect))
  const distance = radius / Math.sin(angle) * 1.12
  camera.position.copy(center).add(new THREE.Vector3(0.95, 0.65, 1).normalize().multiplyScalar(distance))
  camera.near = Math.max(distance / 2000, 0.01)
  camera.far = distance * 40
  camera.updateProjectionMatrix()
  orbit.target.copy(center)
  orbit.minDistance = radius * 0.05
  orbit.maxDistance = distance * 10
  orbit.update()
}

const ParametricFurnaceViewport = forwardRef<FurnaceViewportHandle, Props>(function ParametricFurnaceViewport(props, ref) {
  const { darkMode, modelName, components, buildModel, readOnly = false, globalFields, onGlobalChange, onComponentChange, onResetComponent, onReset, storageError, historyControls, simulationSidebar, solverFramesRef, meshWireRef, flowField = '' } = props
  const hostRef = useRef<HTMLDivElement>(null)
  const axesRef = useRef<SVGSVGElement>(null)
  const runtime = useRef<{ renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera; orbit: OrbitControls; transform: TransformControls; root: THREE.Group | null; grid: THREE.GridHelper | null; box: THREE.Box3; dirty: boolean; meshLines: THREE.LineSegments | null; meshWireBuffer: Float32Array | null } | null>(null)
  const [failure, setFailure] = useState(false)
  const [mode, setMode] = useState<ModelDisplayMode>('solid')
  const [section, setSection] = useState<ModelSectionAxis>('none')
  const [sectionAxis, setSectionAxis] = useState<Exclude<ModelSectionAxis, 'none'>>('top')
  const [sectionReference, setSectionReference] = useState('body')
  const [sectionPosition, setSectionPosition] = useState(() => furnaceBodyBounds(components, new THREE.Box3()).getCenter(new THREE.Vector3()).y)
  const [sectionKeep, setSectionKeep] = useState<ModelSectionKeep>('lower')
  const [modelBounds, setModelBounds] = useState(new THREE.Box3())
  const [selectedId, setSelectedId] = useState('')
  const [moveMode, setMoveMode] = useState(false)
  const [hiddenGroups, setHiddenGroups] = useState<string[]>([])
  const [hiddenParts, setHiddenParts] = useState<string[]>([])
  const [hover, setHover] = useState<{ name: string; x: number; y: number } | null>(null)
  const live = useRef({ components, onComponentChange, readOnly, moveMode, section, sectionPosition, sectionKeep, solverFrames: solverFramesRef, meshWire: meshWireRef, flowField })
  live.current = { components, onComponentChange, readOnly, moveMode, section, sectionPosition, sectionKeep, solverFrames: solverFramesRef, meshWire: meshWireRef, flowField }
  const physical = components.filter(item => item.kind !== 'metadata')
  const selected = physical.find(item => item.id === selectedId)
  const groups = [...new Set(physical.map(item => item.group))]
  const controlAxis = sectionAxis
  const controlCoordinate = controlAxis === 'top' ? 'y' : controlAxis === 'side' ? 'z' : 'x'
  const referenceBounds = sectionReference === 'body' ? furnaceBodyBounds(components, modelBounds) : modelBounds
  const sectionMin = referenceBounds.isEmpty() ? 0 : referenceBounds.min[controlCoordinate]
  const sectionMax = referenceBounds.isEmpty() ? 1 : referenceBounds.max[controlCoordinate]
  const changeSection = (next: ModelSectionAxis) => {
    if (next !== 'none') {
      const coordinate = next === 'top' ? 'y' : next === 'side' ? 'z' : 'x'
      if (next !== sectionAxis && !referenceBounds.isEmpty()) setSectionPosition(referenceBounds.getCenter(new THREE.Vector3())[coordinate])
      setSectionAxis(next)
    }
    setSection(next)
  }

  useImperativeHandle(ref, () => ({
    capturePngDataUrl: () => {
      const state = runtime.current
      if (!state) return null
      const helper = state.transform.getHelper()
      const visible = helper.visible
      helper.visible = false
      try { state.renderer.render(state.scene, state.camera); return state.renderer.domElement.toDataURL('image/png') }
      catch { return null }
      finally { helper.visible = visible; state.dirty = true }
    },
    getComponentManifest: () => components,
  }), [components])

  useEffect(() => {
    setSectionPosition(current => THREE.MathUtils.clamp(current, sectionMin, sectionMax))
  }, [sectionMin, sectionMax])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    let renderer: THREE.WebGLRenderer
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }) }
    catch { setFailure(true); return }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.localClippingEnabled = true
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.setClearColor(0xffffff, 0)
    host.appendChild(renderer.domElement)
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(42, 1, 0.01, 10000)
    const orbit = new OrbitControls(camera, renderer.domElement)
    orbit.enableDamping = true
    orbit.dampingFactor = 0.08
    const transform = new TransformControls(camera, renderer.domElement)
    transform.setMode('translate')
    transform.setSpace('world')
    transform.setSize(0.8)
    scene.add(transform.getHelper())
    const lights = new THREE.Group()
    lights.add(new THREE.HemisphereLight(0xffffff, 0x64748b, 2))
    const key = new THREE.DirectionalLight(0xffffff, 2.4)
    key.position.set(15, 25, 20)
    const fill = new THREE.DirectionalLight(0xc7d2fe, 0.7)
    fill.position.set(-15, 12, -8)
    lights.add(key, fill)
    scene.add(lights)
    const state = { renderer, scene, camera, orbit, transform, root: null as THREE.Group | null, grid: null as THREE.GridHelper | null, box: new THREE.Box3(), dirty: true, meshLines: null as THREE.LineSegments | null, meshWireBuffer: null as Float32Array | null }
    runtime.current = state
    const markDirty = () => { state.dirty = true }
    orbit.addEventListener('change', markDirty)
    transform.addEventListener('change', markDirty)
    transform.addEventListener('dragging-changed', event => { orbit.enabled = !event.value })
    transform.addEventListener('mouseUp', () => {
      const object = transform.object
      if (!object || live.current.readOnly) return
      const p = object.position
      const prior = live.current.components.find(item => item.id === object.name)
      if (prior && ['x', 'y', 'z'].every(axis => Math.abs(p[axis as 'x' | 'y' | 'z'] - Number(prior.params[`center${axis.toUpperCase()}M`]?.value)) < 1e-8)) return
      live.current.onComponentChange(object.name, { centerXM: p.x, centerYM: p.y, centerZM: p.z })
    })
    let down: { x: number; y: number; gizmo: boolean } | null = null
    const hitAt = (event: PointerEvent) => {
      if (!state.root) return null
      const rect = renderer.domElement.getBoundingClientRect()
      const raycaster = new THREE.Raycaster()
      raycaster.setFromCamera(new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1), camera)
      const plane = sectionPlane(state.box, live.current.section, live.current.sectionPosition, live.current.sectionKeep)
      return raycaster.intersectObject(state.root, true).find(hit => {
        let ancestor: THREE.Object3D | null = hit.object
        while (ancestor) { if (!ancestor.visible) return false; ancestor = ancestor.parent }
        return Boolean(hit.object.userData.componentId) && (!plane || plane.distanceToPoint(hit.point) >= 0)
      }) ?? null
    }
    const pointerDown = (event: PointerEvent) => { if (event.button === 0) down = { x: event.clientX, y: event.clientY, gizmo: Boolean(transform.axis) } }
    const pointerUp = (event: PointerEvent) => {
      if (down && !down.gizmo && Math.hypot(event.clientX - down.x, event.clientY - down.y) < 5) {
        const hit = hitAt(event)
        if (hit) setSelectedId(hit.object.name)
      }
      down = null
    }
    const pointerMove = (event: PointerEvent) => {
      if (event.buttons || transform.dragging) { setHover(null); return }
      const hit = hitAt(event)
      const item = hit && live.current.components.find(item => item.id === hit.object.name)
      const rect = host.getBoundingClientRect()
      setHover(item ? { name: item.role, x: Math.min(event.clientX - rect.left + 12, Math.max(0, rect.width - 180)), y: Math.max(4, event.clientY - rect.top - 28) } : null)
    }
    const pointerLeave = () => { setHover(null); down = null }
    renderer.domElement.addEventListener('pointerdown', pointerDown)
    renderer.domElement.addEventListener('pointerup', pointerUp)
    renderer.domElement.addEventListener('pointermove', pointerMove)
    renderer.domElement.addEventListener('pointerleave', pointerLeave)
    const resize = () => {
      const width = Math.max(host.clientWidth, 1), height = Math.max(host.clientHeight, 1)
      renderer.setSize(width, height, false)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      state.dirty = true
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(host)
    let frame = 0
    const render = () => {
      frame = requestAnimationFrame(render)
      const wire = live.current.meshWire?.current ?? null
      if (wire !== state.meshWireBuffer || (wire && !state.meshLines?.parent)) {
        if (state.meshLines) {
          state.scene.remove(state.meshLines)
          state.meshLines.geometry.dispose()
          ;(state.meshLines.material as THREE.Material).dispose()
          state.meshLines = null
        }
        state.meshWireBuffer = wire
        if (wire && wire.length >= 6) {
          const geometry = new THREE.BufferGeometry()
          geometry.setAttribute('position', new THREE.BufferAttribute(wire, 3))
          const lines = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: 0x64748b, transparent: true, opacity: 0.7 }))
          lines.name = 'flow-mesh-wire'
          lines.renderOrder = 2
          state.scene.add(lines)
          state.meshLines = lines
        }
        state.dirty = true
      }
      const flowNode = state.root?.getObjectByName('flow-schematic')
      const frames = live.current.solverFrames?.current
      if (flowNode && frames && flowNode.userData.paintedSerial !== frames.serial) {
        flowNode.userData.field = live.current.flowField
        const paint = flowNode.userData.paint as ((value: typeof frames) => void) | undefined
        paint?.(frames)
        flowNode.userData.paintedSerial = frames.serial
        state.dirty = true
      } else if (flowNode && flowNode.userData.field !== live.current.flowField) {
        flowNode.userData.field = live.current.flowField
        flowNode.userData.paintedSerial = -1
        state.dirty = true
      }
      const horizontalNode = state.root?.getObjectByName('flow-horizontal-slice')
      const longitudinalNode = state.root?.getObjectByName('flow-longitudinal-slice')
      if ((horizontalNode && horizontalNode.userData.field !== live.current.flowField) || (longitudinalNode && longitudinalNode.userData.field !== live.current.flowField)) {
        if (horizontalNode) horizontalNode.userData.field = live.current.flowField
        if (longitudinalNode) longitudinalNode.userData.field = live.current.flowField
        if (flowNode) flowNode.userData.paintedSerial = -1
        state.dirty = true
      }
      if (orbit.update() || state.dirty) {
        renderer.render(scene, camera)
        const inverse = camera.quaternion.clone().invert()
        for (const axis of ['x', 'y', 'z'] as const) {
          const direction = new THREE.Vector3(axis === 'x' ? 1 : 0, axis === 'y' ? 1 : 0, axis === 'z' ? 1 : 0).applyQuaternion(inverse)
          const group = axesRef.current?.querySelector(`[data-axis="${axis}"]`)
          const x = 80 + direction.x * 52, y = 75 - direction.y * 52
          const angle = Math.atan2(-direction.y, direction.x) * 180 / Math.PI
          group?.querySelectorAll('line').forEach(line => { line.setAttribute('x2', String(x)); line.setAttribute('y2', String(y)) })
          group?.querySelector('path')?.setAttribute('transform', `translate(${x},${y}) rotate(${angle})`)
          const projectedLength = Math.hypot(direction.x, direction.y)
          // An axis pointing toward the viewer becomes a dot; keep its label clear of the fit target.
          group?.querySelector('path')?.setAttribute('opacity', projectedLength < .15 ? '0' : '1')
          group?.querySelector('[data-axis-dot]')?.setAttribute('opacity', projectedLength < .15 ? '1' : '0')
          group?.querySelector('text')?.setAttribute('x', String(projectedLength < .15 ? 98 : 80 + direction.x / projectedLength * (52 * projectedLength + 12)))
          group?.querySelector('text')?.setAttribute('y', String(projectedLength < .15 ? 68 : 80 - direction.y / projectedLength * (52 * projectedLength + 12)))
          group?.setAttribute('opacity', direction.z < -0.1 ? '0.55' : '1')
        }
        state.dirty = false
      }
    }
    render()
    return () => {
      cancelAnimationFrame(frame); observer.disconnect()
      renderer.domElement.removeEventListener('pointerdown', pointerDown)
      renderer.domElement.removeEventListener('pointerup', pointerUp)
      renderer.domElement.removeEventListener('pointermove', pointerMove)
      renderer.domElement.removeEventListener('pointerleave', pointerLeave)
      // three 0.169's dispose calls a removed traverse method; clean its helper directly.
      transform.detach(); transform.disconnect(); disposeModel(transform.getHelper()); orbit.dispose()
      if (state.meshLines) disposeModel(state.meshLines)
      if (state.root) disposeModel(state.root)
      if (state.grid) disposeModel(state.grid)
      renderer.dispose(); renderer.domElement.remove(); runtime.current = null
    }
  }, [])

  useEffect(() => {
    const state = runtime.current
    if (!state) return
    const firstModel = !state.root
    state.transform.detach()
    if (state.root) { state.scene.remove(state.root); disposeModel(state.root) }
    if (state.grid) { state.scene.remove(state.grid); disposeModel(state.grid) }
    state.root = buildModel()
    state.scene.add(state.root)
    state.box.setFromObject(state.root)
    setModelBounds(state.box.clone())
    const size = state.box.getSize(new THREE.Vector3())
    const center = state.box.getCenter(new THREE.Vector3())
    const grid = new THREE.GridHelper(Math.max(size.x, size.z, 5) * 2, 24, darkMode ? 0x475569 : 0x94a3b8, darkMode ? 0x253247 : 0xdbe3ec)
    grid.position.set(center.x, state.box.min.y - 0.01, center.z)
    state.grid = grid; state.scene.add(grid)
    if (firstModel) fitModel(state.camera, state.orbit, state.box)
    state.dirty = true
  }, [buildModel, darkMode])

  useEffect(() => {
    const state = runtime.current
    if (!state?.root) return
    applyModelDisplay(state.root, mode, section, sectionPosition, state.box, sectionKeep)
    state.root.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return
      const component = components.find(item => item.id === object.name)
      object.visible = !hiddenParts.includes(object.name) && !hiddenGroups.includes(component?.group ?? '')
      const materials = Array.isArray(object.material) ? object.material : [object.material]
      materials.forEach(material => { if ('emissive' in material) (material as THREE.MeshStandardMaterial).emissive.set(object.name === selectedId ? 0x4d2400 : 0) })
      const edges = object.getObjectByName('__edge-overlay') as THREE.LineSegments | undefined
      if (edges) (edges.material as THREE.LineBasicMaterial).color.set(object.name === selectedId ? 0xf97316 : darkMode ? 0xf8fafc : 0x0f172a)
    })
    const target = state.root.getObjectByName(selectedId)
    if (moveMode && !readOnly && target?.visible) state.transform.attach(target)
    else state.transform.detach()
    state.dirty = true
  }, [buildModel, components, darkMode, mode, section, sectionPosition, sectionKeep, selectedId, hiddenGroups, hiddenParts, moveMode, readOnly])

  const snap = (axis: 'x' | 'y' | 'z') => {
    const state = runtime.current
    if (!state) return
    const distance = Math.max(state.camera.position.distanceTo(state.orbit.target), 1)
    const direction = new THREE.Vector3(axis === 'x' ? 1 : 0, axis === 'y' ? 1 : 0.001, axis === 'z' ? 1 : 0.001).normalize()
    state.camera.position.copy(state.orbit.target).add(direction.multiplyScalar(distance))
    state.orbit.update(); state.dirty = true
  }
  const exportManifest = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ version: 1, model: modelName, coordinateSystem: 'X=炉长，Y=竖直向上，Z=炉宽；长度单位 m；构件位置在模型坐标系内', components }, null, 2)], { type: 'application/json;charset=utf-8' }))
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${modelName}-构件参数.json`; anchor.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  const exportStl = () => {
    const root = runtime.current?.root
    if (root) exportFurnaceStl(root, `${modelName}.stl`)
  }
  const fit = () => { const state = runtime.current; if (state) { fitModel(state.camera, state.orbit, state.box); state.dirty = true } }
  return <div className={`furnace-workbench ${darkMode ? 'furnace-workbench-dark' : ''}`} tabIndex={0} aria-label={`${modelName}三维工作区`}
    onPointerDownCapture={event => { if (event.target instanceof HTMLCanvasElement) event.currentTarget.focus({ preventScroll: true }) }}
    onKeyDown={event => {
      if ((event.target as HTMLElement).closest('input, textarea, select, [contenteditable="true"]')) return
      if (runtime.current?.transform.dragging) return
      const key = event.key.toLowerCase()
      if (!readOnly && (event.ctrlKey || event.metaKey) && !event.altKey && (key === 'z' || key === 'y')) {
        event.preventDefault(); event.stopPropagation()
        if (key === 'y' || event.shiftKey) historyControls.redo(); else historyControls.undo()
      }
    }}>
    <aside className="furnace-workbench-sidebar" aria-label="模型左侧工具栏">
      <div className="furnace-sidebar-heading">{simulationSidebar ? '数值仿真参数调节' : readOnly ? '模型查看' : '三维几何参数调节'}</div>
      {simulationSidebar}
      {simulationSidebar && (
        <details open data-section="view"><summary>视图显示</summary>
          <div className="furnace-segmented" role="group" aria-label="显示模式">
            <button type="button" aria-pressed={mode === 'wireframe'} onClick={() => setMode('wireframe')}>线框</button>
            <button type="button" aria-pressed={mode === 'solid'} onClick={() => setMode('solid')}>实体</button>
          </div>
        </details>
      )}
      {!simulationSidebar && <>
      {!readOnly && <div className="furnace-history-actions"><button type="button" disabled={!historyControls.canUndo} title={`撤销：${historyControls.undoLabel}（Ctrl+Z）`} onClick={historyControls.undo}>撤销</button><button type="button" disabled={!historyControls.canRedo} title={`重做：${historyControls.redoLabel}（Ctrl+Shift+Z）`} onClick={historyControls.redo}>重做</button></div>}
      {storageError && <p role="alert" className="furnace-field-error">{storageError}</p>}
      {!readOnly && <>
        <details open data-section="dimensions"><summary>整体尺寸</summary>
          {globalFields.map(({ key, ...field }) => <NumericField key={key} {...field} resetToken={components} onChange={value => onGlobalChange(key, value)} />)}
          <button type="button" onClick={onReset}>恢复默认</button>
        </details>
      </>}
      <details open data-section="view"><summary>视图显示</summary>
        <div className="furnace-segmented" role="group" aria-label="显示模式">
          <button type="button" aria-pressed={mode === 'wireframe'} onClick={() => setMode('wireframe')}>线框</button>
          <button type="button" aria-pressed={mode === 'solid'} onClick={() => setMode('solid')}>实体</button>
        </div>
      </details>
      <details open data-section="section"><summary>剖切工具</summary>
        <label className="furnace-control-check"><input type="checkbox" checked={section !== 'none'} onChange={event => changeSection(event.target.checked ? sectionAxis : 'none')} />启用剖切</label>
        <fieldset disabled={section === 'none'} className="furnace-section-fields">
          <label className="furnace-control-label">范围基准<select aria-label="剖切范围基准" value={sectionReference} onChange={event => setSectionReference(event.target.value)}><option value="body">主体标称尺寸（炉长／宽／高）</option><option value="assembly">整机外轮廓（含基础与附件）</option></select></label>
          <label className="furnace-control-label">切割方向<select aria-label="切割方向" value={sectionAxis} onChange={event => changeSection(event.target.value as ModelSectionAxis)}>
            <option value="top">水平切割 · 按高度 Y</option><option value="side">竖直纵切 · 按炉宽 Z</option><option value="end">竖直横切 · 按炉长 X</option>
          </select></label>
          <NumericField label={`${controlCoordinate.toUpperCase()} 切割位置`} value={sectionPosition} unit="m" min={sectionMin} max={sectionMax} disabled={section === 'none'} onChange={setSectionPosition} />
          <label className="furnace-control-label">移动切割面<input aria-label="剖切位置" type="range" min="0" max="1000" step="1" value={sectionMax > sectionMin ? Math.round((sectionPosition - sectionMin) / (sectionMax - sectionMin) * 1000) : 0} onChange={event => setSectionPosition(THREE.MathUtils.lerp(sectionMin, sectionMax, Number(event.target.value) / 1000))} /></label>
          <p className="furnace-tool-note">坐标 {Number(sectionMin.toFixed(4))} ～ {Number(sectionMax.toFixed(4))} m · 总跨度 {Number((sectionMax - sectionMin).toFixed(4))} m</p>
          <label className="furnace-control-label">保留部分<select aria-label="保留部分" value={sectionKeep} onChange={event => setSectionKeep(event.target.value as ModelSectionKeep)}>
            <option value="lower">{controlAxis === 'top' ? '下方' : `${controlCoordinate.toUpperCase()} 坐标较小的一侧`}</option><option value="upper">{controlAxis === 'top' ? '上方' : `${controlCoordinate.toUpperCase()} 坐标较大的一侧`}</option>
          </select></label>
        </fieldset>
        <p className="furnace-tool-note">X/Z 从炉体中心向两侧计量。炉宽为下部标称宽度；顶部外扩、基础和附件计入整机外轮廓。当前剖切不封口，尚未建模内衬和熔池。</p>
      </details>
      <details open data-section="components"><summary>{readOnly ? '构件参数' : '选择与移动构件'}</summary>
        <label className="furnace-control-label">当前构件<select aria-label="选择构件" value={selected?.id ?? ''} onChange={event => setSelectedId(event.target.value)}>
          <option value="">点击模型或选择构件</option>
          {groups.map(group => <optgroup key={group} label={groupLabels[group] ?? group}>{physical.filter(item => item.group === group).map(item => <option key={item.id} value={item.id}>{item.role}</option>)}</optgroup>)}
        </select></label>
        {selected && <>
          {!readOnly && <label className="furnace-control-check"><input type="checkbox" checked={moveMode} onChange={event => setMoveMode(event.target.checked)} />拖动坐标箭头移动</label>}
          {Object.entries(selected.params).filter(([, param]) => typeof param.value === 'number').map(([key, param]) => readOnly || !param.editable
            ? <div className="furnace-readonly-field" key={key}><span>{param.label ?? parameterLabels[key] ?? key}</span><span>{Number(Number(param.value).toFixed(4))} {param.unit}</span></div>
            : <NumericField key={`${selected.id}.${key}`} label={param.label ?? parameterLabels[key] ?? key} value={Number(param.value)} unit={param.unit ?? ''} resetToken={components} min={key.startsWith('center') ? -10000 : 0.001} max={key.startsWith('center') ? 10000 : key.toLowerCase().includes('ratio') ? 0.99 : 1000} onChange={value => onComponentChange(selected.id, { [key]: value })} />)}
          {!readOnly && <><button type="button" onClick={() => onResetComponent(selected.id)}>恢复此构件</button><p className="furnace-tool-note">X 炉长 · Y 向上 · Z 炉宽。移动会改变装配位置，工艺计算输入保持独立。Ctrl+Z 可撤回最近一次调整。</p></>}
          <label className="furnace-control-check"><input type="checkbox" checked={!hiddenParts.includes(selected.id)} onChange={event => setHiddenParts(current => event.target.checked ? current.filter(id => id !== selected.id) : [...current, selected.id])} />显示此构件</label>
        </>}
      </details>
      <details data-section="groups"><summary>组件分组显隐</summary>{groups.map(group => <label className="furnace-control-check" key={group}><input type="checkbox" checked={!hiddenGroups.includes(group)} onChange={event => setHiddenGroups(current => event.target.checked ? current.filter(id => id !== group) : [...current, group])} />{groupLabels[group] ?? group}</label>)}</details>
      {!readOnly && <details data-section="history"><summary>操作历史与快捷键</summary><p className="furnace-tool-note">点击模型后：Ctrl+Z 撤销；Ctrl+Shift+Z 或 Ctrl+Y 重做。输入框中保留文字编辑快捷键。</p><p className="furnace-tool-note">本次打开期间最多回退 50 步，记录尺寸调整、移动和恢复操作；切换案例或重新打开后重新计步。</p><ol className="furnace-history-list">{historyControls.recent.map((label, index) => <li key={index}>{label}</li>)}</ol></details>}
      <button type="button" className="furnace-export-button" onClick={exportStl}>导出 STL 模型</button>
      <button type="button" className="furnace-export-button" onClick={exportManifest}>导出构件参数</button>
      <p className="furnace-tool-note">STL 为三角面外壳，单位 m，坐标 X 炉长、Y 向上、Z 炉宽。Fluent、OpenFOAM、scFLOW 可导入。当前不是 STEP 或 scdox 实体。</p>
      </>}
    </aside>
    <div className={`furnace-viewer-stage furnace-workbench-viewport ${darkMode ? 'furnace-viewer-stage-dark' : ''}`} onContextMenu={event => event.preventDefault()}>
      <div ref={hostRef} className="furnace-viewer-canvas-host" />
      {failure && <div className="furnace-viewer-notice">当前环境无法启动三维显示。左侧仍可查看和导出构件参数。</div>}
      {hover && <div className="furnace-part-tooltip" style={{ left: hover.x, top: hover.y }}>{hover.name}</div>}
      <svg ref={axesRef} className="furnace-axis-indicator" viewBox="0 0 160 150" role="group" aria-label="模型视角：点击坐标轴切换视角，点击原点适应模型">
        {([
          { axis: 'x', x: 139, y: 108, labelX: 148, labelY: 123, color: '#ef4444' },
          { axis: 'y', x: 53, y: 20, labelX: 65, labelY: 20, color: '#22c55e' },
          { axis: 'z', x: 20, y: 132, labelX: 10, labelY: 145, color: '#38a3d1' },
        ] as const).map(({ axis, x, y, labelX, labelY, color }) => {
          const angle = Math.atan2(y - 75, x - 80) * 180 / Math.PI
          return <g key={axis} data-axis={axis} role="button" tabIndex={0} aria-label={`沿 ${axis.toUpperCase()} 轴查看`} onClick={() => snap(axis)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); snap(axis) } }}>
            <title>{`沿 ${axis.toUpperCase()} 轴查看`}</title>
            <line x1="80" y1="75" x2={x} y2={y} stroke="transparent" strokeWidth="24" />
            <line x1="80" y1="75" x2={x} y2={y} stroke={color} strokeWidth="3.5" />
            <path d="M 0 0 L -13 -5 L -13 5 Z" fill={color} transform={`translate(${x},${y}) rotate(${angle})`} />
            <circle data-axis-dot cx="80" cy="75" r="6" fill={color} opacity="0" />
            <text x={labelX} y={labelY} textAnchor="middle" fontSize="18" fontWeight="600">{axis.toUpperCase()}</text>
          </g>
        })}
        <g role="button" tabIndex={0} aria-label="原点：适应模型" onClick={fit} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); fit() } }}>
          <title>适应模型</title>
          <circle cx="80" cy="75" r="14" fill="transparent" />
          <circle className="furnace-axis-origin" cx="80" cy="75" r="4" fill="#64748b" />
        </g>
      </svg>
      <div className="furnace-viewer-hint">{moveMode && !readOnly ? '拖动坐标箭头移动构件 · 松开保存位置' : '左键旋转 · 滚轮缩放 · 右键平移 · 单击选择构件'}</div>
    </div>
  </div>
})

export default ParametricFurnaceViewport
