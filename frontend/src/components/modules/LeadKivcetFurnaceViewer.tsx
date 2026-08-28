import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import {
  buildLeadKivcetGeometry,
  type LeadKivcetGeometryPart,
} from '../../utils/leadKivcetGeometry.ts'

export type LeadKivcetFurnaceViewerHandle = {
  capturePngDataUrl: () => string | null
}

type ViewerDesign = {
  designLengthM?: number
  furnaceLengthM?: number
  furnaceWidthM?: number
}

type LeadKivcetFurnaceViewerProps = {
  darkMode: boolean
  design: ViewerDesign
}

function fitCamera(camera: THREE.PerspectiveCamera, controls: OrbitControls, geometry: ReturnType<typeof buildLeadKivcetGeometry>) {
  const box = new THREE.Box3(
    new THREE.Vector3(-geometry.overallLengthM / 2, 0, -geometry.overallWidthM / 2),
    new THREE.Vector3(geometry.overallLengthM / 2, geometry.overallHeightM, geometry.overallWidthM / 2),
  )
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  const maxSize = Math.max(size.x, size.y, size.z, 0.1)
  const distance = maxSize * 2.1
  camera.position.copy(center).add(new THREE.Vector3(0.95, 0.72, 1.05).normalize().multiplyScalar(distance))
  camera.near = 0.01
  camera.far = distance * 20
  camera.updateProjectionMatrix()
  controls.target.copy(center)
  controls.minDistance = maxSize * 0.25
  controls.maxDistance = maxSize * 8
  controls.update()
}

function material(color: number, darkMode: boolean, transparent = false) {
  void darkMode
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.42,
    metalness: 0.22,
    transparent,
    opacity: transparent ? 0.46 : 1,
  })
}

function buildPartMesh(part: LeadKivcetGeometryPart, darkMode: boolean): THREE.Object3D {
  if (part.kind === 'box') {
    const colors: Record<string, number> = {
      'reaction-tower': darkMode ? 0xb45309 : 0x9a3412,
      'flue-tower': darkMode ? 0x64748b : 0x475569,
      'connecting-flue': darkMode ? 0x78716c : 0x57534e,
    }
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(part.lengthM, part.heightM, part.widthM),
      material(colors[part.id] ?? 0x64748b, darkMode),
    )
    mesh.position.set(part.centerXM, part.centerYM, part.centerZM)
    return mesh
  }
  if (part.kind === 'cylinder') {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(part.radiusM, part.radiusM, part.lengthM, 24),
      material(darkMode ? 0xfbbf24 : 0xdc2626, darkMode),
    )
    mesh.position.set(part.centerXM, part.centerYM, part.centerZM)
    return mesh
  }
  const jacket = new THREE.Mesh(
    new THREE.CylinderGeometry(part.outerRadiusM, part.outerRadiusM, part.lengthM, 32, 1, true),
    material(darkMode ? 0x38bdf8 : 0x0369a1, darkMode, true),
  )
  jacket.position.set(part.centerXM, part.centerYM, part.centerZM)
  return jacket
}

const LeadKivcetFurnaceViewer = forwardRef<
  LeadKivcetFurnaceViewerHandle,
  LeadKivcetFurnaceViewerProps
>(function LeadKivcetFurnaceViewer({ darkMode, design }, ref) {
  const hostRef = useRef<HTMLDivElement>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const [showBody, setShowBody] = useState(true)
  const [showLance, setShowLance] = useState(true)
  const [showJacket, setShowJacket] = useState(true)
  const groupsRef = useRef<{ body: THREE.Group; lance: THREE.Group; jacket: THREE.Group } | null>(null)
  const geometryInput = {
    bodyLengthM: design.designLengthM ?? design.furnaceLengthM,
    bodyWidthM: design.furnaceWidthM,
    bodyHeightM: Math.max((design.furnaceWidthM ?? 4) * 1.45, 4),
  }

  useImperativeHandle(ref, () => ({
    capturePngDataUrl: () => {
      try {
        return rendererRef.current?.domElement.toDataURL('image/png') ?? null
      } catch {
        return null
      }
    },
  }), [])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
    } catch {
      return
    }
    rendererRef.current = renderer
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.setClearColor(darkMode ? 0x0f172a : 0xf8fafc, 1)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    host.replaceChildren(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(42, 1, 0.01, 2000)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.enablePan = true
    scene.add(new THREE.HemisphereLight(0xffffff, 0x64748b, 1.3))
    const key = new THREE.DirectionalLight(0xffffff, 1.3)
    key.position.set(5, 9, 7)
    scene.add(key)
    const fill = new THREE.DirectionalLight(0xdbeafe, 0.55)
    fill.position.set(-6, 4, -4)
    scene.add(fill)

    const geometry = buildLeadKivcetGeometry(geometryInput)
    const body = new THREE.Group()
    const lance = new THREE.Group()
    const jacket = new THREE.Group()
    for (const part of geometry.parts) {
      const mesh = buildPartMesh(part, darkMode)
      if (part.id === 'lance') lance.add(mesh)
      else if (part.id === 'lance-water-jacket') jacket.add(mesh)
      else body.add(mesh)
    }
    scene.add(body, lance, jacket)
    const grid = new THREE.GridHelper(Math.max(geometry.overallLengthM, geometry.overallWidthM) * 2.1, 20, darkMode ? 0x334155 : 0xcbd5e1, darkMode ? 0x1e293b : 0xe2e8f0)
    scene.add(grid)
    groupsRef.current = { body, lance, jacket }
    fitCamera(camera, controls, geometry)

    let frame = 0
    const resize = () => {
      const width = Math.max(host.clientWidth, 320)
      const height = Math.max(host.clientHeight, 320)
      renderer.setSize(width, height, false)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(host)
    const render = () => {
      controls.update()
      renderer.render(scene, camera)
      frame = requestAnimationFrame(render)
    }
    render()
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      controls.dispose()
      scene.traverse((object) => {
        const mesh = object as THREE.Mesh
        if (mesh.geometry) mesh.geometry.dispose()
        const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : []
        materials.forEach((item) => item.dispose())
      })
      renderer.dispose()
      rendererRef.current = null
      groupsRef.current = null
      host.replaceChildren()
    }
  }, [darkMode, geometryInput.bodyLengthM, geometryInput.bodyWidthM, geometryInput.bodyHeightM])

  useEffect(() => {
    if (!groupsRef.current) return
    groupsRef.current.body.visible = showBody
    groupsRef.current.lance.visible = showLance
    groupsRef.current.jacket.visible = showJacket
  }, [showBody, showLance, showJacket])

  const handleContextMenu = (event: ReactPointerEvent<HTMLDivElement>) => event.preventDefault()
  return (
    <div className={`furnace-viewer-stage ${darkMode ? 'furnace-viewer-stage-dark' : ''}`} onContextMenu={handleContextMenu}>
      <div ref={hostRef} className="furnace-viewer-canvas-host" />
      <div className="furnace-viewer-layer-toggles" role="group" aria-label="Kivcet 三维图层显示">
        <label className="furnace-viewer-layer-toggle"><input type="checkbox" checked={showBody} onChange={(event) => setShowBody(event.target.checked)} />炉体</label>
        <label className="furnace-viewer-layer-toggle"><input type="checkbox" checked={showLance} onChange={(event) => setShowLance(event.target.checked)} />喷枪</label>
        <label className="furnace-viewer-layer-toggle"><input type="checkbox" checked={showJacket} onChange={(event) => setShowJacket(event.target.checked)} />水套</label>
      </div>
      <div className="furnace-viewer-hint">左键旋转 · 滚轮缩放 · 右键平移 · 反应塔 + 连接烟道 + 烟道塔</div>
    </div>
  )
})

export default LeadKivcetFurnaceViewer
