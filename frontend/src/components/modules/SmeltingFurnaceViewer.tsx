import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { SmeltingFurnaceDesignResult } from '../../utils/copperEquipmentSizing.ts'
import {
  buildSmeltingFurnaceLayout,
  resolveSchematicBodyFlareDims,
  resolveSchematicFlueDims,
  type FurnaceJacketPlacement,
  type FurnaceLayout,
  type FurnaceTuyerePlacement,
  type SchematicBodyFlareDims,
  type SchematicFlueDims,
} from '../../utils/copperFurnaceGeometry.ts'

/** 正式炉体外观模型：由 MicroStation/OpenPlant 导出后放到 frontend/public/equipment/ */
const FURNACE_GLTF_URL = './equipment/side-blown-furnace.glb'

/** 悬停高亮色；水套铜色，风口蓝色 */
const HIGHLIGHT_COLOR = 0xf97316
const jacketColor = (darkMode: boolean) => (darkMode ? 0xe0a060 : 0xb87333)
const tuyereColor = (darkMode: boolean) => (darkMode ? 0x60a5fa : 0x2563eb)

type GltfStatus = 'loading' | 'loaded' | 'absent'

type HoverInfo = { label: string; x: number; y: number }

export type SmeltingFurnaceViewerHandle = {
  capturePngDataUrl: () => string | null
}

function detectWebGLSupport(): boolean {
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl')
    return Boolean(gl)
  } catch {
    return false
  }
}

/** 相机按包围盒自动 fit，保证不同炉长/炉宽下都完整入画 */
function fitCameraToBox(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  box: THREE.Box3,
  padding = 1.3
) {
  if (box.isEmpty()) return
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  const maxSize = Math.max(size.x, size.y, size.z, 0.001)
  const fitHeightDistance = maxSize / (2 * Math.atan((Math.PI * camera.fov) / 360))
  const fitWidthDistance = fitHeightDistance / Math.max(camera.aspect, 0.001)
  const distance = padding * Math.max(fitHeightDistance, fitWidthDistance)
  const direction = new THREE.Vector3(0.92, 0.58, 1).normalize()
  camera.position.copy(center.clone().add(direction.multiplyScalar(distance)))
  camera.near = Math.max(distance / 200, 0.01)
  camera.far = distance * 40
  camera.updateProjectionMatrix()
  controls.target.copy(center)
  controls.maxDistance = distance * 6
  controls.minDistance = maxSize * 0.12
  controls.update()
}

/** 材质 dispose 不会释放贴图，外观模型可能带贴图，这里一并回收 */
function disposeMaterial(material: THREE.Material) {
  for (const value of Object.values(material as unknown as Record<string, unknown>)) {
    if (value && (value as THREE.Texture).isTexture) {
      ;(value as THREE.Texture).dispose()
    }
  }
  material.dispose()
}

function disposeObject(root: THREE.Object3D) {
  root.traverse((child) => {
    const mesh = child as THREE.Mesh
    if (mesh.geometry) mesh.geometry.dispose()
    const material = mesh.material as THREE.Material | THREE.Material[] | undefined
    if (Array.isArray(material)) material.forEach(disposeMaterial)
    else if (material) disposeMaterial(material)
  })
}

/** 示意烟道：炉顶长方体，不透明实体色与炉壳一致 */
function buildSchematicFlueMesh(darkMode: boolean, dims: SchematicFlueDims): THREE.Mesh {
  return new THREE.Mesh(
    new THREE.BoxGeometry(dims.lengthM, dims.heightM, dims.widthM),
    new THREE.MeshLambertMaterial({
      color: darkMode ? 0x64748b : 0x94a3b8,
    })
  )
}

/**
 * 示意炉壳剖面几何：下半直壁，自中高起两侧斜面外扩成倒梯形，再沿炉长挤出。
 * （YZ 剖面为倒梯形，不是上下两个方块。）
 */
function buildSchematicFlareBodyGeometry(flare: SchematicBodyFlareDims): THREE.BufferGeometry {
  const halfBottomW = flare.bottomWidthM / 2
  const halfTopW = flare.topWidthM / 2
  const yMid = flare.lowerHeightM
  const yTop = flare.lowerHeightM + flare.upperHeightM
  const lengthM = flare.bottomLengthM

  // Shape 在 XY：X=炉宽方向，Y=炉高；Extrude 沿 Z=炉长
  const shape = new THREE.Shape()
  shape.moveTo(-halfBottomW, 0)
  shape.lineTo(halfBottomW, 0)
  shape.lineTo(halfBottomW, yMid)
  shape.lineTo(halfTopW, yTop)
  shape.lineTo(-halfTopW, yTop)
  shape.lineTo(-halfBottomW, yMid)
  shape.closePath()

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: lengthM,
    bevelEnabled: false,
    steps: 1,
  })
  // (宽, 高, 长∈[0,L]) → 平移居中后绕 Y 转 -90° → (长, 高, 宽)
  geometry.translate(0, 0, -lengthM / 2)
  geometry.rotateY(-Math.PI / 2)
  geometry.computeVertexNormals()
  return geometry
}

/** 示意炉壳：不透明倒梯形实体（下直壁 + 上斜面外扩） */
function buildSchematicFurnaceBodyMesh(darkMode: boolean, flare: SchematicBodyFlareDims): THREE.Mesh {
  return new THREE.Mesh(
    buildSchematicFlareBodyGeometry(flare),
    new THREE.MeshLambertMaterial({
      color: darkMode ? 0x64748b : 0x94a3b8,
    })
  )
}

type AxisId = 'x' | 'y' | 'z'

const AXES_GIZMO_MARGIN_PX = 10
const AXIS_COLORS: Record<AxisId, number> = {
  x: 0xef4444,
  y: 0x22c55e,
  z: 0x3b82f6,
}
const AXIS_LABEL_HEX: Record<AxisId, string> = {
  x: '#ef4444',
  y: '#22c55e',
  z: '#3b82f6',
}

function resolveAxesGizmoSize(hostWidth: number, hostHeight: number): number {
  return Math.min(112, Math.max(78, Math.floor(Math.min(hostWidth, hostHeight) * 0.15)))
}

function createAxisTipLabel(text: string, colorCss: string): THREE.Sprite {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.clearRect(0, 0, 64, 64)
    ctx.fillStyle = colorCss
    ctx.font = 'bold 44px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, 32, 34)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.needsUpdate = true
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  })
  const sprite = new THREE.Sprite(material)
  sprite.scale.set(0.38, 0.38, 0.38)
  return sprite
}

/** 左下角坐标轴 gizmo：可拾取的 X/Y/Z 箭杆，字母标在轴末端 */
function createAxesGizmoScene(): {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  root: THREE.Group
  pickables: THREE.Object3D[]
} {
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 20)
  camera.position.set(0, 0, 3.2)
  camera.lookAt(0, 0, 0)

  const root = new THREE.Group()
  const pickables: THREE.Object3D[] = []
  const light = new THREE.AmbientLight(0xffffff, 1.15)
  scene.add(light)

  const makeAxis = (axis: AxisId, color: number, direction: THREE.Vector3) => {
    const group = new THREE.Group()
    group.userData.axis = axis

    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.055, 0.055, 0.72, 12),
      new THREE.MeshBasicMaterial({ color })
    )
    shaft.position.y = 0.36
    shaft.userData.axis = axis

    const tip = new THREE.Mesh(
      new THREE.ConeGeometry(0.12, 0.22, 14),
      new THREE.MeshBasicMaterial({ color })
    )
    tip.position.y = 0.83
    tip.userData.axis = axis

    const hub = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 12, 12),
      new THREE.MeshBasicMaterial({ color })
    )
    hub.userData.axis = axis

    const label = createAxisTipLabel(axis.toUpperCase(), AXIS_LABEL_HEX[axis])
    label.position.y = 1.12
    label.userData.axis = axis

    group.add(shaft, tip, hub, label)
    group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize())
    root.add(group)
    pickables.push(shaft, tip, hub)
  }

  makeAxis('x', AXIS_COLORS.x, new THREE.Vector3(1, 0, 0))
  makeAxis('y', AXIS_COLORS.y, new THREE.Vector3(0, 1, 0))
  makeAxis('z', AXIS_COLORS.z, new THREE.Vector3(0, 0, 1))

  // 原点小球，便于辨认三轴交汇
  root.add(
    new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0xe2e8f0 })
    )
  )

  scene.add(root)
  return { scene, camera, root, pickables }
}

/** 点击坐标轴后，将主相机对齐到该轴向（再次点击同轴则翻到反方向） */
function snapCameraToAxis(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  axis: AxisId
) {
  const target = controls.target.clone()
  const distance = Math.max(camera.position.distanceTo(target), 0.5)
  const currentDir = camera.position.clone().sub(target).normalize()

  const positive = new THREE.Vector3(axis === 'x' ? 1 : 0, axis === 'y' ? 1 : 0, axis === 'z' ? 1 : 0)
  // 已接近正方向时翻到负向；Y 轴负向受 OrbitControls 极角限制，固定用俯视
  let useNegative = currentDir.dot(positive) > 0.82
  if (axis === 'y') useNegative = false

  const spherical = new THREE.Spherical()
  spherical.radius = distance
  if (axis === 'y') {
    spherical.phi = 0.08
    spherical.theta = Math.atan2(currentDir.x, currentDir.z)
  } else if (axis === 'x') {
    spherical.phi = Math.PI / 2
    spherical.theta = useNegative ? -Math.PI / 2 : Math.PI / 2
  } else {
    spherical.phi = Math.PI / 2
    spherical.theta = useNegative ? Math.PI : 0
  }

  const offset = new THREE.Vector3().setFromSpherical(spherical)
  camera.position.copy(target).add(offset)
  camera.up.set(0, 1, 0)
  camera.lookAt(target)
  controls.update()
}

const SmeltingFurnaceViewer = forwardRef<
  SmeltingFurnaceViewerHandle,
  {
    darkMode: boolean
    design: SmeltingFurnaceDesignResult
  }
>(function SmeltingFurnaceViewer({ darkMode, design }, ref) {
  const hostRef = useRef<HTMLDivElement>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
  const axesSceneRef = useRef<THREE.Scene | null>(null)
  const axesCameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const axesRootRef = useRef<THREE.Group | null>(null)
  const axesPickablesRef = useRef<THREE.Object3D[]>([])
  const axesSizeRef = useRef(96)
  const axesPickFnRef = useRef<((clientX: number, clientY: number) => AxisId | null) | null>(null)
  /** 参数化炉体分组：布置变化时整体重建 */
  const parametricRef = useRef<THREE.Group | null>(null)
  const gltfRef = useRef<THREE.Group | null>(null)
  const jacketMeshRef = useRef<THREE.InstancedMesh | null>(null)
  const tuyereMeshRef = useRef<THREE.InstancedMesh | null>(null)
  const bodyShellRef = useRef<THREE.Object3D | null>(null)
  const foundationMeshRef = useRef<THREE.Mesh | null>(null)
  const jacketDataRef = useRef<FurnaceJacketPlacement[]>([])
  const tuyereDataRef = useRef<FurnaceTuyerePlacement[]>([])
  const needsRenderRef = useRef(true)
  const highlightRef = useRef<{ mesh: THREE.InstancedMesh; instanceId: number } | null>(null)
  /** 已按哪一版布置 fit 过相机，用于避免主题切换时重置用户视角 */
  const fittedLayoutRef = useRef<FurnaceLayout | null>(null)

  const [webglSupported] = useState(detectWebGLSupport)
  const [gltfStatus, setGltfStatus] = useState<GltfStatus>('loading')
  const [hover, setHover] = useState<HoverInfo | null>(null)
  const [axesHover, setAxesHover] = useState<AxisId | null>(null)
  const [showBody, setShowBody] = useState(true)
  const [showJackets, setShowJackets] = useState(true)
  const [showTuyeres, setShowTuyeres] = useState(true)

  const layout = useMemo<FurnaceLayout>(() => buildSmeltingFurnaceLayout(design), [design])

  const requestRender = () => {
    needsRenderRef.current = true
  }

  useImperativeHandle(ref, () => ({
    capturePngDataUrl: () => {
      const renderer = rendererRef.current
      const scene = sceneRef.current
      const camera = cameraRef.current
      if (!renderer || !scene || !camera) return null
      renderer.render(scene, camera)
      try {
        return renderer.domElement.toDataURL('image/png')
      } catch {
        return null
      }
    },
  }))

  // 场景初始化：仅挂载时执行一次，卸载时释放 GPU 资源
  useEffect(() => {
    if (!webglSupported) return
    const host = hostRef.current
    if (!host) return

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 2000)
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
    } catch {
      return
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.setSize(host.clientWidth || 640, host.clientHeight || 420, false)
    renderer.autoClear = true
    host.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.maxPolarAngle = Math.PI * 0.495
    controls.addEventListener('change', requestRender)

    const hemisphere = new THREE.HemisphereLight(0xffffff, 0x9aa5b1, 1.05)
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.25)
    keyLight.position.set(24, 32, 20)
    const fillLight = new THREE.DirectionalLight(0xdbeafe, 0.45)
    fillLight.position.set(-20, 14, -18)
    scene.add(hemisphere, keyLight, fillLight)

    const axesGizmo = createAxesGizmoScene()
    axesSceneRef.current = axesGizmo.scene
    axesCameraRef.current = axesGizmo.camera
    axesRootRef.current = axesGizmo.root
    axesPickablesRef.current = axesGizmo.pickables
    axesSizeRef.current = resolveAxesGizmoSize(host.clientWidth || 640, host.clientHeight || 420)

    rendererRef.current = renderer
    sceneRef.current = scene
    cameraRef.current = camera
    controlsRef.current = controls

    const syncAxesOrientation = () => {
      const axesRoot = axesRootRef.current
      if (!axesRoot) return
      axesRoot.quaternion.copy(camera.quaternion).invert()
      axesRoot.updateMatrixWorld(true)
    }

    const renderAxesGizmo = () => {
      const axesScene = axesSceneRef.current
      const axesCamera = axesCameraRef.current
      if (!axesScene || !axesCamera) return

      syncAxesOrientation()

      const width = host.clientWidth
      const height = host.clientHeight
      const size = axesSizeRef.current
      const margin = AXES_GIZMO_MARGIN_PX
      renderer.autoClear = false
      renderer.clearDepth()
      renderer.setScissorTest(true)
      renderer.setScissor(margin, margin, size, size)
      renderer.setViewport(margin, margin, size, size)
      renderer.render(axesScene, axesCamera)
      renderer.setScissorTest(false)
      renderer.setViewport(0, 0, width, height)
      renderer.autoClear = true
    }

    const pickAxisAtClient = (clientX: number, clientY: number): AxisId | null => {
      const axesCamera = axesCameraRef.current
      if (!axesCamera) return null
      const hostRect = host.getBoundingClientRect()
      const size = axesSizeRef.current
      const margin = AXES_GIZMO_MARGIN_PX
      const left = hostRect.left + margin
      const top = hostRect.top + hostRect.height - margin - size
      if (clientX < left || clientX > left + size || clientY < top || clientY > top + size) return null

      syncAxesOrientation()
      const ndc = new THREE.Vector2(
        ((clientX - left) / size) * 2 - 1,
        -((clientY - top) / size) * 2 + 1
      )
      const raycaster = new THREE.Raycaster()
      raycaster.setFromCamera(ndc, axesCamera)
      const hit = raycaster.intersectObjects(axesPickablesRef.current, false)[0]
      const axis = hit?.object.userData.axis
      return axis === 'x' || axis === 'y' || axis === 'z' ? axis : null
    }

    // 捕获阶段拦截，避免 OrbitControls 抢走坐标轴点击
    const onCanvasPointerDownCapture = (event: PointerEvent) => {
      if (event.button !== 0) return
      const axis = pickAxisAtClient(event.clientX, event.clientY)
      if (!axis) return
      event.preventDefault()
      event.stopImmediatePropagation()
      snapCameraToAxis(camera, controls, axis)
      requestRender()
    }
    renderer.domElement.addEventListener('pointerdown', onCanvasPointerDownCapture, true)

    let rafId = 0
    const renderLoop = () => {
      rafId = requestAnimationFrame(renderLoop)
      const moved = controls.update()
      if (moved || needsRenderRef.current) {
        renderer.render(scene, camera)
        renderAxesGizmo()
        needsRenderRef.current = false
      }
    }
    renderLoop()

    const resizeObserver = new ResizeObserver(() => {
      const width = host.clientWidth
      const height = host.clientHeight
      if (width <= 0 || height <= 0) return
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      renderer.setSize(width, height, false)
      axesSizeRef.current = resolveAxesGizmoSize(width, height)
      requestRender()
    })
    resizeObserver.observe(host)

    // 供 React 层悬停检测复用
    axesPickFnRef.current = pickAxisAtClient

    return () => {
      cancelAnimationFrame(rafId)
      resizeObserver.disconnect()
      renderer.domElement.removeEventListener('pointerdown', onCanvasPointerDownCapture, true)
      axesPickFnRef.current = null
      controls.removeEventListener('change', requestRender)
      controls.dispose()
      if (parametricRef.current) {
        scene.remove(parametricRef.current)
        disposeObject(parametricRef.current)
        parametricRef.current = null
      }
      if (gltfRef.current) {
        scene.remove(gltfRef.current)
        disposeObject(gltfRef.current)
        gltfRef.current = null
      }
      if (axesRootRef.current) disposeObject(axesRootRef.current)
      axesSceneRef.current = null
      axesCameraRef.current = null
      axesRootRef.current = null
      axesPickablesRef.current = []
      scene.clear()
      renderer.dispose()
      renderer.domElement.remove()
      rendererRef.current = null
      sceneRef.current = null
      cameraRef.current = null
      controlsRef.current = null
      jacketMeshRef.current = null
      tuyereMeshRef.current = null
      bodyShellRef.current = null
      highlightRef.current = null
      // 新相机需要重新 fit
      fittedLayoutRef.current = null
    }
  }, [webglSupported])

  // 加载正式外观模型；文件缺失时静默降级为参数化炉体
  useEffect(() => {
    if (!webglSupported) return
    const scene = sceneRef.current
    if (!scene) return
    let cancelled = false
    const loader = new GLTFLoader()
    loader.load(
      FURNACE_GLTF_URL,
      (gltf) => {
        if (cancelled) return
        const group = new THREE.Group()
        group.add(gltf.scene)
        gltfRef.current = group
        group.visible = showBody
        scene.add(group)
        setGltfStatus('loaded')
        requestRender()
      },
      undefined,
      () => {
        if (cancelled) return
        setGltfStatus('absent')
      }
    )
    return () => {
      cancelled = true
    }
    // showBody 仅用于初次挂载可见性；后续由图层 effect 切换
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webglSupported])

  // 外观模型按当前炉体尺寸缩放对位：长轴对齐 X、底面贴地、水平居中
  useEffect(() => {
    if (gltfStatus !== 'loaded') return
    const group = gltfRef.current
    if (!group) return
    group.rotation.set(0, 0, 0)
    group.scale.setScalar(1)
    group.position.set(0, 0, 0)
    group.updateMatrixWorld(true)

    const rawBox = new THREE.Box3().setFromObject(group)
    if (rawBox.isEmpty()) return
    const rawSize = rawBox.getSize(new THREE.Vector3())
    if (rawSize.z > rawSize.x) {
      group.rotation.y = Math.PI / 2
      group.updateMatrixWorld(true)
    }
    const orientedBox = new THREE.Box3().setFromObject(group)
    const orientedSize = orientedBox.getSize(new THREE.Vector3())
    const longestHorizontal = Math.max(orientedSize.x, 0.001)
    group.scale.setScalar(layout.body.lengthM / longestHorizontal)
    group.updateMatrixWorld(true)

    const scaledBox = new THREE.Box3().setFromObject(group)
    const scaledCenter = scaledBox.getCenter(new THREE.Vector3())
    group.position.x += -scaledCenter.x
    group.position.z += -scaledCenter.z
    group.position.y += -scaledBox.min.y
    group.updateMatrixWorld(true)
    requestRender()
  }, [gltfStatus, layout])

  // 参数化炉体、水套与风口：布置或主题变化时重建
  useEffect(() => {
    if (!webglSupported) return
    const scene = sceneRef.current
    const camera = cameraRef.current
    const controls = controlsRef.current
    if (!scene || !camera || !controls) return

    if (parametricRef.current) {
      scene.remove(parametricRef.current)
      disposeObject(parametricRef.current)
      parametricRef.current = null
    }

    const group = new THREE.Group()
    const { body, foundation, jackets, tuyeres } = layout

    const foundationMesh = new THREE.Mesh(
      new THREE.BoxGeometry(foundation.lengthM, foundation.heightM, foundation.widthM),
      // 建筑底座：与炉体区分的混凝土色
      new THREE.MeshLambertMaterial({
        color: darkMode ? 0x57534e : 0xd6d3d1,
      })
    )
    foundationMesh.position.set(0, foundation.centerYM, 0)
    foundationMeshRef.current = foundationMesh
    group.add(foundationMesh)

    // 炉体示意：下直壁 + 上倒梯形外扩 + 顶部烟道；水套/风口仍按未扩张炉宽排布
    const bodyShell = new THREE.Group()
    const flareDims = resolveSchematicBodyFlareDims(body)
    bodyShell.add(buildSchematicFurnaceBodyMesh(darkMode, flareDims))

    const flueDims = resolveSchematicFlueDims(body)
    const flue = buildSchematicFlueMesh(darkMode, flueDims)
    // 烟道立在炉壳顶面中心（顶面已外扩，烟道仍按原炉宽比例）
    flue.position.y = body.heightM + flueDims.heightM / 2
    bodyShell.add(flue)

    // 正式外观模型到位后隐藏示意炉体，但保留参数化水套与风口叠加显示
    bodyShell.visible = gltfStatus !== 'loaded' && showBody
    bodyShellRef.current = bodyShell
    group.add(bodyShell)

    const matrix = new THREE.Matrix4()
    const quaternion = new THREE.Quaternion()
    const scaleOne = new THREE.Vector3(1, 1, 1)

    if (jackets.length > 0) {
      const sample = jackets[0]
      const jacketMesh = new THREE.InstancedMesh(
        new THREE.BoxGeometry(sample.lengthM, sample.heightM, sample.thicknessM),
        new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.38, metalness: 0.72 }),
        jackets.length
      )
      const baseColor = new THREE.Color(jacketColor(darkMode))
      jackets.forEach((jacket, index) => {
        matrix.compose(
          new THREE.Vector3(jacket.centerXM, jacket.centerYM, jacket.centerZM),
          quaternion.identity(),
          scaleOne
        )
        jacketMesh.setMatrixAt(index, matrix)
        jacketMesh.setColorAt(index, baseColor)
      })
      jacketMesh.instanceMatrix.needsUpdate = true
      if (jacketMesh.instanceColor) jacketMesh.instanceColor.needsUpdate = true
      jacketMesh.computeBoundingSphere()
      jacketMesh.visible = showJackets
      jacketMeshRef.current = jacketMesh
      group.add(jacketMesh)
    } else {
      jacketMeshRef.current = null
    }

    if (tuyeres.length > 0) {
      const sample = tuyeres[0]
      const tuyereGeometry = new THREE.CylinderGeometry(sample.radiusM, sample.radiusM, sample.lengthM, 18)
      // 圆柱默认沿 Y 轴，旋转 90° 让轴线沿炉宽方向穿出侧墙
      tuyereGeometry.rotateX(Math.PI / 2)
      const tuyereMesh = new THREE.InstancedMesh(
        tuyereGeometry,
        new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.7 }),
        tuyeres.length
      )
      const baseColor = new THREE.Color(tuyereColor(darkMode))
      tuyeres.forEach((tuyere, index) => {
        matrix.compose(
          new THREE.Vector3(tuyere.centerXM, tuyere.centerYM, tuyere.centerZM),
          quaternion.identity(),
          scaleOne
        )
        tuyereMesh.setMatrixAt(index, matrix)
        tuyereMesh.setColorAt(index, baseColor)
      })
      tuyereMesh.instanceMatrix.needsUpdate = true
      if (tuyereMesh.instanceColor) tuyereMesh.instanceColor.needsUpdate = true
      tuyereMesh.computeBoundingSphere()
      tuyereMesh.visible = showTuyeres
      tuyereMeshRef.current = tuyereMesh
      group.add(tuyereMesh)
    } else {
      tuyereMeshRef.current = null
    }

    const grid = new THREE.GridHelper(
      Math.max(layout.overallLengthM, layout.overallWidthM) * 2.2,
      24,
      darkMode ? 0x334155 : 0xcbd5e1,
      darkMode ? 0x1e293b : 0xe2e8f0
    )
    grid.position.y = foundation.centerYM - foundation.heightM / 2
    group.add(grid)

    jacketDataRef.current = jackets
    tuyereDataRef.current = tuyeres
    highlightRef.current = null
    parametricRef.current = group
    scene.add(group)

    // 仅在炉型尺寸变化时重置视角，切换主题或外观模型到位时保留用户当前视角
    if (fittedLayoutRef.current !== layout) {
      const visualHeightM = body.heightM + flueDims.heightM
      const box = new THREE.Box3(
        new THREE.Vector3(-layout.overallLengthM / 2, foundation.centerYM - foundation.heightM / 2, -layout.overallWidthM / 2),
        new THREE.Vector3(layout.overallLengthM / 2, visualHeightM, layout.overallWidthM / 2)
      )
      fitCameraToBox(camera, controls, box)
      fittedLayoutRef.current = layout
    }
    requestRender()
  }, [webglSupported, layout, darkMode, gltfStatus])

  // 图层勾选：不重建场景，只切换可见性
  useEffect(() => {
    if (gltfRef.current) gltfRef.current.visible = showBody
    if (bodyShellRef.current) bodyShellRef.current.visible = gltfStatus !== 'loaded' && showBody
    if (foundationMeshRef.current) foundationMeshRef.current.visible = showBody
    if (jacketMeshRef.current) jacketMeshRef.current.visible = showJackets
    if (tuyereMeshRef.current) tuyereMeshRef.current.visible = showTuyeres
    if (!showJackets || !showTuyeres) {
      const previous = highlightRef.current
      if (previous) {
        const isJacket = previous.mesh === jacketMeshRef.current
        previous.mesh.setColorAt(
          previous.instanceId,
          new THREE.Color(isJacket ? jacketColor(darkMode) : tuyereColor(darkMode))
        )
        if (previous.mesh.instanceColor) previous.mesh.instanceColor.needsUpdate = true
        highlightRef.current = null
      }
      setHover(null)
    }
    requestRender()
  }, [showBody, showJackets, showTuyeres, gltfStatus, darkMode])

  const applyInstanceColor = (mesh: THREE.InstancedMesh, instanceId: number, color: number) => {
    mesh.setColorAt(instanceId, new THREE.Color(color))
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }

  const clearHighlight = () => {
    const previous = highlightRef.current
    if (!previous) return
    const isJacket = previous.mesh === jacketMeshRef.current
    applyInstanceColor(previous.mesh, previous.instanceId, isJacket ? jacketColor(darkMode) : tuyereColor(darkMode))
    highlightRef.current = null
    requestRender()
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const axisHit = axesPickFnRef.current?.(event.clientX, event.clientY) ?? null
    if (axisHit !== axesHover) setAxesHover(axisHit)
    if (axisHit) {
      clearHighlight()
      if (hover) setHover(null)
      return
    }

    // 按住按键时是在旋转/平移视角，此时不做拾取，避免提示闪烁与无谓开销
    if (event.buttons !== 0) return
    const renderer = rendererRef.current
    const camera = cameraRef.current
    if (!renderer || !camera) return
    const rect = renderer.domElement.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return
    const targets: THREE.InstancedMesh[] = []
    if (jacketMeshRef.current?.visible) targets.push(jacketMeshRef.current)
    if (tuyereMeshRef.current?.visible) targets.push(tuyereMeshRef.current)
    if (targets.length === 0) return

    const pointer = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    )
    const raycaster = new THREE.Raycaster()
    raycaster.setFromCamera(pointer, camera)
    const hit = raycaster.intersectObjects(targets, false).find((item) => item.instanceId != null)

    clearHighlight()

    if (!hit || hit.instanceId == null) {
      if (hover) setHover(null)
      return
    }
    const mesh = hit.object as THREE.InstancedMesh
    const isJacket = mesh === jacketMeshRef.current
    const data = isJacket ? jacketDataRef.current[hit.instanceId] : tuyereDataRef.current[hit.instanceId]
    if (!data) return
    applyInstanceColor(mesh, hit.instanceId, HIGHLIGHT_COLOR)
    highlightRef.current = { mesh, instanceId: hit.instanceId }
    setHover({
      label: data.label,
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    })
    requestRender()
  }

  const handlePointerLeave = () => {
    clearHighlight()
    setHover(null)
    setAxesHover(null)
  }

  return (
    <div
      className={`furnace-viewer-stage ${darkMode ? 'furnace-viewer-stage-dark' : ''}${
        axesHover ? ' furnace-viewer-stage-axes-hover' : ''
      }`}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      onContextMenu={(event) => event.preventDefault()}
    >
      {webglSupported ? (
        <>
          <div ref={hostRef} className="furnace-viewer-canvas-host" />
          <div className="furnace-viewer-layer-toggles" role="group" aria-label="三维图层显示">
            <label className="furnace-viewer-layer-toggle">
              <input
                type="checkbox"
                checked={showBody}
                onChange={(event) => setShowBody(event.target.checked)}
              />
              炉体
            </label>
            <label className="furnace-viewer-layer-toggle">
              <input
                type="checkbox"
                checked={showJackets}
                onChange={(event) => setShowJackets(event.target.checked)}
              />
              水套
            </label>
            <label className="furnace-viewer-layer-toggle">
              <input
                type="checkbox"
                checked={showTuyeres}
                onChange={(event) => setShowTuyeres(event.target.checked)}
              />
              风口
            </label>
          </div>
          {hover && (
            <div className="furnace-viewer-tooltip" style={{ left: hover.x, top: hover.y }}>
              {hover.label}
            </div>
          )}
          <div className="furnace-viewer-hint">
            左键旋转 · 滚轮缩放 · 右键平移 · 点击左下角坐标轴切换视角 · 悬停水套/风口查看编号
          </div>
        </>
      ) : (
        <div className="furnace-viewer-notice">
          当前环境不支持 WebGL，无法显示三维炉体。
          <br />
          炉体尺寸、水套与风口数量请查看下方参数总览。
        </div>
      )}
    </div>
  )
})

export default SmeltingFurnaceViewer
