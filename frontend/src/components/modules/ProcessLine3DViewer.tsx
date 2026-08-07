import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { SmeltingFurnaceDesignResult } from '../../utils/copperEquipmentSizing.ts'
import {
  buildSmeltingFurnaceLayout,
  resolveFurnaceBodyHeightM,
  resolveSchematicBodyFlareDims,
  resolveSchematicFlueDims,
} from '../../utils/copperFurnaceGeometry.ts'

function detectWebGLSupport(): boolean {
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl')
    return Boolean(gl)
  } catch {
    return false
  }
}

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

function fitCameraToBox(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  box: THREE.Box3,
  padding = 1.35
) {
  if (box.isEmpty()) return
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  const maxSize = Math.max(size.x, size.y, size.z, 0.001)
  const fitHeightDistance = maxSize / (2 * Math.atan((Math.PI * camera.fov) / 360))
  const fitWidthDistance = fitHeightDistance / Math.max(camera.aspect, 0.001)
  const distance = padding * Math.max(fitHeightDistance, fitWidthDistance)
  const direction = new THREE.Vector3(0.95, 0.48, 0.85).normalize()
  camera.position.copy(center.clone().add(direction.multiplyScalar(distance)))
  camera.near = Math.max(distance / 200, 0.01)
  camera.far = distance * 40
  camera.updateProjectionMatrix()
  controls.target.copy(center)
  controls.maxDistance = distance * 6
  controls.minDistance = maxSize * 0.1
  controls.update()
}

function buildFlareBodyGeometry(flare: ReturnType<typeof resolveSchematicBodyFlareDims>): THREE.BufferGeometry {
  const halfBottomW = flare.bottomWidthM / 2
  const halfTopW = flare.topWidthM / 2
  const yMid = flare.lowerHeightM
  const yTop = flare.lowerHeightM + flare.upperHeightM
  const lengthM = flare.bottomLengthM
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
  })
  geometry.translate(0, 0, -lengthM / 2)
  geometry.rotateY(Math.PI / 2)
  return geometry
}

function makeLabelSprite(text: string, darkMode: boolean): THREE.Sprite {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 128
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = darkMode ? 'rgba(15,23,42,0.82)' : 'rgba(255,255,255,0.92)'
    ctx.strokeStyle = darkMode ? 'rgba(148,163,184,0.7)' : 'rgba(148,163,184,0.9)'
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.roundRect(12, 24, 488, 80, 18)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = darkMode ? '#e2e8f0' : '#0f172a'
    ctx.font = 'bold 48px "Microsoft YaHei", "PingFang SC", sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 4)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.needsUpdate = true
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false })
  const sprite = new THREE.Sprite(material)
  sprite.scale.set(6.5, 1.6, 1)
  return sprite
}

function buildPipe(
  from: THREE.Vector3,
  to: THREE.Vector3,
  radius: number,
  color: number
): THREE.Mesh {
  const direction = new THREE.Vector3().subVectors(to, from)
  const length = Math.max(direction.length(), 0.01)
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, length, 16),
    new THREE.MeshLambertMaterial({ color })
  )
  mesh.position.copy(from).add(to).multiplyScalar(0.5)
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize())
  return mesh
}

/** 默认示意炉型：无 BOM 时也保证三连体三维可看 */
export function createDefaultProcessLineSmeltingDesign(): SmeltingFurnaceDesignResult {
  return {
    dailyFeedTd: 1200,
    areaM2: 18,
    furnaceLengthM: 8,
    furnaceWidthM: 2.2,
    designLengthM: 8,
    designAreaM2: 17.6,
    jacketPitchMm: 600,
    jacketCountTotal: 26,
    jacketCountOneSide: 13,
    jacketRemainderMm: 0,
    jacketRemainderDecision: null,
    oxygenNm3h: 18000,
    tuyereOxygenNm3h: 692,
    tuyereCount: 26,
    tuyereCountOneSide: 13,
    tuyereOneSideOxygenCapacityNm3h: 1385,
    tuyereFullOxygenCapacityNm3h: 692,
  }
}

/**
 * 案例汇总：熔炼炉（同选型三维建模风格）+ 吹炼/精炼示意设备 + 连接管线。
 */
export default function ProcessLine3DViewer({
  darkMode,
  smeltingDesign,
  convertingReady = false,
  refiningReady = false,
}: {
  darkMode: boolean
  smeltingDesign: SmeltingFurnaceDesignResult | null
  convertingReady?: boolean
  refiningReady?: boolean
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const needsRenderRef = useRef(true)
  const [webglSupported] = useState(detectWebGLSupport)
  const design = useMemo(
    () => smeltingDesign ?? createDefaultProcessLineSmeltingDesign(),
    [smeltingDesign]
  )
  const layout = useMemo(() => buildSmeltingFurnaceLayout(design), [design])

  useEffect(() => {
    if (!webglSupported) return
    const host = hostRef.current
    if (!host) return

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 4000)
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    } catch {
      return
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.setSize(host.clientWidth || 860, host.clientHeight || 420, false)
    host.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.maxPolarAngle = Math.PI * 0.495
    const requestRender = () => {
      needsRenderRef.current = true
    }
    controls.addEventListener('change', requestRender)

    scene.add(new THREE.HemisphereLight(0xffffff, 0x9aa5b1, 1.05))
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.2)
    keyLight.position.set(28, 36, 22)
    const fillLight = new THREE.DirectionalLight(0xdbeafe, 0.45)
    fillLight.position.set(-22, 16, -18)
    scene.add(keyLight, fillLight)

    const root = new THREE.Group()
    const shellColor = darkMode ? 0x64748b : 0x94a3b8
    const convertingColor = convertingReady ? (darkMode ? 0x0ea5e9 : 0x0284c7) : shellColor
    const refiningColor = refiningReady
      ? darkMode
        ? 0x34d399
        : 0x059669
      : darkMode
        ? 0x475569
        : 0xcbd5e1
    const pipeColor = darkMode ? 0x94a3b8 : 0x64748b

    const bodyHeight = resolveFurnaceBodyHeightM(layout.body.widthM)
    const flare = resolveSchematicBodyFlareDims({
      lengthM: layout.body.lengthM,
      widthM: layout.body.widthM,
      heightM: bodyHeight,
    })
    const flue = resolveSchematicFlueDims({
      lengthM: layout.body.lengthM,
      widthM: layout.body.widthM,
      heightM: bodyHeight,
    })

    const smeltingGroup = new THREE.Group()
    const body = new THREE.Mesh(
      buildFlareBodyGeometry(flare),
      new THREE.MeshLambertMaterial({ color: shellColor })
    )
    body.position.y = 0
    smeltingGroup.add(body)
    const flueMesh = new THREE.Mesh(
      new THREE.BoxGeometry(flue.lengthM, flue.heightM, flue.widthM),
      new THREE.MeshLambertMaterial({ color: shellColor })
    )
    flueMesh.position.set(0, bodyHeight + flue.heightM / 2, 0)
    smeltingGroup.add(flueMesh)
    const foundation = new THREE.Mesh(
      new THREE.BoxGeometry(layout.overallLengthM + 1.2, 1.2, layout.overallWidthM + 1.2),
      new THREE.MeshLambertMaterial({ color: darkMode ? 0x334155 : 0xcbd5e1 })
    )
    foundation.position.y = -0.6
    smeltingGroup.add(foundation)
    const smeltingLabel = makeLabelSprite('熔炼', darkMode)
    smeltingLabel.position.set(0, bodyHeight + flue.heightM + 2.2, 0)
    smeltingGroup.add(smeltingLabel)
    smeltingGroup.position.set(0, 0, 0)
    root.add(smeltingGroup)

    const gap = Math.max(layout.overallLengthM * 0.55, 8)
    const convertingX = layout.overallLengthM / 2 + gap
    const convertingGroup = new THREE.Group()
    const convertingVessel = new THREE.Mesh(
      new THREE.CylinderGeometry(2.1, 2.1, 7.2, 28),
      new THREE.MeshLambertMaterial({ color: convertingColor })
    )
    convertingVessel.rotation.z = Math.PI / 2
    convertingVessel.position.y = 2.4
    convertingGroup.add(convertingVessel)
    const convertingBase = new THREE.Mesh(
      new THREE.BoxGeometry(9.2, 1.1, 5.2),
      new THREE.MeshLambertMaterial({ color: darkMode ? 0x334155 : 0xcbd5e1 })
    )
    convertingBase.position.y = -0.55
    convertingGroup.add(convertingBase)
    const convertingStack = new THREE.Mesh(
      new THREE.CylinderGeometry(0.55, 0.7, 4.2, 16),
      new THREE.MeshLambertMaterial({ color: shellColor })
    )
    convertingStack.position.set(0, 6.4, 0)
    convertingGroup.add(convertingStack)
    const convertingLabel = makeLabelSprite('吹炼', darkMode)
    convertingLabel.position.set(0, 9.2, 0)
    convertingGroup.add(convertingLabel)
    convertingGroup.position.set(convertingX, 0, 0)
    root.add(convertingGroup)

    const refiningX = convertingX + gap + 4
    const refiningGroup = new THREE.Group()
    const refiningVessel = new THREE.Mesh(
      new THREE.BoxGeometry(7.4, 3.6, 3.4),
      new THREE.MeshLambertMaterial({ color: refiningColor })
    )
    refiningVessel.position.y = 2.2
    refiningGroup.add(refiningVessel)
    const refiningDome = new THREE.Mesh(
      new THREE.SphereGeometry(1.7, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshLambertMaterial({ color: refiningColor })
    )
    refiningDome.position.y = 4.0
    refiningGroup.add(refiningDome)
    const refiningBase = new THREE.Mesh(
      new THREE.BoxGeometry(8.4, 1.0, 4.4),
      new THREE.MeshLambertMaterial({ color: darkMode ? 0x334155 : 0xcbd5e1 })
    )
    refiningBase.position.y = -0.5
    refiningGroup.add(refiningBase)
    const refiningLabel = makeLabelSprite(refiningReady ? '精炼' : '精炼（待开发）', darkMode)
    refiningLabel.position.set(0, 6.4, 0)
    refiningGroup.add(refiningLabel)
    refiningGroup.position.set(refiningX, 0, 0)
    root.add(refiningGroup)

    const smeltingOut = new THREE.Vector3(layout.overallLengthM / 2 - 0.4, 2.2, 0)
    const convertingIn = new THREE.Vector3(convertingX - 3.4, 2.2, 0)
    const convertingOut = new THREE.Vector3(convertingX + 3.4, 2.2, 0)
    const refiningIn = new THREE.Vector3(refiningX - 3.6, 2.2, 0)
    root.add(buildPipe(smeltingOut, convertingIn, 0.28, pipeColor))
    root.add(buildPipe(convertingOut, refiningIn, 0.28, pipeColor))

    const platformLength = refiningX + 8
    const platform = new THREE.Mesh(
      new THREE.BoxGeometry(platformLength, 0.25, Math.max(layout.overallWidthM + 10, 16)),
      new THREE.MeshLambertMaterial({ color: darkMode ? 0x1e293b : 0xe2e8f0 })
    )
    platform.position.set(platformLength / 2 - layout.overallLengthM / 2 - 2, -1.25, 0)
    root.add(platform)

    const grid = new THREE.GridHelper(
      platformLength + 12,
      Math.max(12, Math.round(platformLength / 2)),
      darkMode ? 0x475569 : 0x94a3b8,
      darkMode ? 0x334155 : 0xcbd5e1
    )
    grid.position.set(platform.position.x, -1.12, 0)
    root.add(grid)

    scene.add(root)

    const box = new THREE.Box3().setFromObject(root)
    fitCameraToBox(camera, controls, box)

    let frameId = 0
    const animate = () => {
      frameId = window.requestAnimationFrame(animate)
      controls.update()
      if (!needsRenderRef.current) return
      needsRenderRef.current = false
      renderer.render(scene, camera)
    }
    needsRenderRef.current = true
    animate()

    const resizeObserver = new ResizeObserver(() => {
      const width = host.clientWidth || 860
      const height = host.clientHeight || 420
      camera.aspect = width / Math.max(height, 1)
      camera.updateProjectionMatrix()
      renderer.setSize(width, height, false)
      needsRenderRef.current = true
    })
    resizeObserver.observe(host)

    return () => {
      window.cancelAnimationFrame(frameId)
      resizeObserver.disconnect()
      controls.dispose()
      disposeObject(root)
      renderer.dispose()
      if (renderer.domElement.parentElement === host) {
        host.removeChild(renderer.domElement)
      }
    }
  }, [webglSupported, layout, darkMode, convertingReady, refiningReady])

  return (
    <div className={`furnace-viewer-stage${darkMode ? ' furnace-viewer-stage-dark' : ''}`}>
      {webglSupported ? (
        <>
          <div ref={hostRef} className="furnace-viewer-canvas-host" />
          <div className="furnace-viewer-hint">左键旋转 · 滚轮缩放 · 右键平移 · 熔炼炉体按选型参数建模，吹炼/精炼为连体示意</div>
        </>
      ) : (
        <div className="furnace-viewer-notice">
          当前环境不支持 WebGL，无法显示三维工艺线。
        </div>
      )}
    </div>
  )
}
