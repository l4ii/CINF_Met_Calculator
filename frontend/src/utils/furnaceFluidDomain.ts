import {
  hearthSagM,
  type FurnaceLayout,
  type FurnaceSide,
} from './copperFurnaceGeometry.ts'

/**
 * 仿真内腔：炉体与烟道连通，炉底为沿炉宽下凹的浅弧。
 * 底座不在域内。每支喷枪都按水平圆柱从内腔中挖去，切口端面可作入口。
 * 开闭只决定该端面是否进气，不改变网格。
 */

export type FluidLance = {
  id: string
  side: FurnaceSide
  centerXM: number
  centerYM: number
  /** 伸入端圆面的 Z */
  tipZM: number
  /** 该侧内壁的 Z */
  wallZM: number
  radiusM: number
  /** 气体吹入方向的 Z 分量，前墙为 -1，后墙为 +1 */
  inwardZ: number
  /** 关闭时端面是壁面，网格保持不变 */
  open: boolean
}

export type FluidDomainOptions = {
  openTuyereIds: readonly string[]
  lanceDiameterM: number
  /** 喷枪中心距原平底标高的高度 m */
  lanceHeightM: number
  lanceInsertionM: number
}

export type FluidDomain = {
  sagM: number
  nadirYM: number
  shellTopYM: number
  flueTopYM: number
  lances: FluidLance[]
  bounds: { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number }
  /** 网格必须落点的坐标：端墙、直墙、平底、外扩起点、炉顶、烟道边界 */
  anchors: { x: number[]; y: number[]; z: number[] }
  /** 液面绝对标高。liquidLevelM 从弧底最低点起算。 */
  liquidSurfaceYM: (liquidLevelM: number) => number
  hearthYM: (z: number) => number
  contains: (x: number, y: number, z: number) => boolean
  inFlueFootprint: (x: number, z: number) => boolean
  insideLance: (x: number, y: number, z: number) => boolean
}

function shellTopYM(layout: FurnaceLayout): number {
  return layout.body.centerYM + layout.flare.lowerHeightM + layout.flare.upperHeightM
}

function halfLengthM(layout: FurnaceLayout): number {
  return Math.max(layout.flare.bottomLengthM, layout.flare.topLengthM) / 2
}

/** 某一绝对高度处的内壁半宽。直段等于炉宽的一半，上段按梯形外扩变宽。 */
export function furnaceWallHalfWidthM(layout: FurnaceLayout, y: number): number {
  return halfWidthAt(layout, y)
}

/** 入炉深度从该高度的内壁起算，最多到炉中心再留出风口半径。 */
export function clampLanceInsertionM(layout: FurnaceLayout, lanceHeightM: number, lanceDiameterM: number, requestedM: number): number {
  const y = layout.body.centerYM + lanceHeightM
  const half = furnaceWallHalfWidthM(layout, y)
  const radius = Math.max(0.005, lanceDiameterM / 2)
  return Math.min(Math.max(0, requestedM), Math.max(0, half - radius))
}

function halfWidthAt(layout: FurnaceLayout, y: number): number {
  const local = y - layout.body.centerYM
  const { lowerHeightM, upperHeightM, bottomWidthM, topWidthM } = layout.flare
  if (local <= lowerHeightM) return bottomWidthM / 2
  const t = Math.min(1, (local - lowerHeightM) / Math.max(upperHeightM, 1e-6))
  const smooth = t * t * (3 - 2 * t)
  return bottomWidthM / 2 + ((topWidthM - bottomWidthM) / 2) * smooth
}

/** 某一高度的水平内腔矩形。炉身上随外扩变宽，弧底随炉底收窄，烟道段只保留开口。 */
export function horizontalInteriorSection(layout: FurnaceLayout, y: number): {
  centerXM: number
  centerZM: number
  lengthM: number
  widthM: number
} | null {
  const shellTop = shellTopYM(layout)
  const sag = hearthSagM(layout.flare.bottomWidthM, layout.foundation.heightM)
  const nadir = layout.body.centerYM - sag
  const flueBottom = layout.flue.centerYM - layout.flue.heightM / 2
  const flueTop = layout.flue.centerYM + layout.flue.heightM / 2
  if (y >= nadir - 1e-4 && y <= shellTop + 1e-4) {
    const half = y < layout.body.centerYM ? hearthHalfWidth(layout, y, sag) : halfWidthAt(layout, y)
    if (half < 0.01) return null
    return {
      centerXM: layout.body.centerXM,
      centerZM: layout.body.centerZM,
      lengthM: Math.max(layout.flare.bottomLengthM, layout.flare.topLengthM),
      widthM: half * 2,
    }
  }
  if (y >= flueBottom - 1e-4 && y <= flueTop + 1e-4) {
    return {
      centerXM: layout.flue.centerXM,
      centerZM: layout.flue.centerZM,
      lengthM: layout.flue.lengthM,
      widthM: layout.flue.widthM,
    }
  }
  return null
}

/** 炉宽中心纵切：炉身从弧底到炉顶，烟道只在开口范围内升起。 */
export function longitudinalCenterProfile(layout: FurnaceLayout): {
  centerXM: number
  centerZM: number
  nadirYM: number
  shellTopYM: number
  lengthM: number
  flue: { x0: number; x1: number; y0: number; y1: number } | null
} {
  const sag = hearthSagM(layout.flare.bottomWidthM, layout.foundation.heightM)
  const nadirYM = layout.body.centerYM - sag
  const top = shellTopYM(layout)
  const flueTop = layout.flue.centerYM + layout.flue.heightM / 2
  const flueBottom = layout.flue.centerYM - layout.flue.heightM / 2
  const hitsFlue = Math.abs(layout.body.centerZM - layout.flue.centerZM) <= layout.flue.widthM / 2 + 1e-6
  let flue: { x0: number; x1: number; y0: number; y1: number } | null = null
  if (hitsFlue) {
    const y0 = flueBottom <= top + 0.02 ? Math.max(flueBottom, top) : flueBottom
    if (flueTop - y0 > 0.02) {
      flue = {
        x0: layout.flue.centerXM - layout.flue.lengthM / 2,
        x1: layout.flue.centerXM + layout.flue.lengthM / 2,
        y0,
        y1: flueTop,
      }
    }
  }
  return {
    centerXM: layout.body.centerXM,
    centerZM: layout.body.centerZM,
    nadirYM,
    shellTopYM: top,
    lengthM: Math.max(layout.flare.bottomLengthM, layout.flare.topLengthM),
    flue,
  }
}

function hearthHalfWidth(layout: FurnaceLayout, y: number, sag: number): number {
  const rise = layout.body.centerYM - y
  if (rise >= sag) return 0
  const t = Math.sqrt(Math.max(0, 1 - rise / Math.max(sag, 1e-6)))
  return (layout.flare.bottomWidthM / 2) * t
}

export function buildFluidDomain(layout: FurnaceLayout, options: FluidDomainOptions): FluidDomain {
  const sagM = hearthSagM(layout.flare.bottomWidthM, layout.foundation.heightM)
  const nadirYM = layout.body.centerYM - sagM
  const topYM = shellTopYM(layout)
  const flueTopYM = layout.flue.centerYM + layout.flue.heightM / 2
  const open = new Set(options.openTuyereIds)
  const radiusM = Math.max(0.005, options.lanceDiameterM / 2)
  const lanceYM = layout.body.centerYM + options.lanceHeightM
  const insertionM = clampLanceInsertionM(layout, options.lanceHeightM, options.lanceDiameterM, options.lanceInsertionM)
  const lances: FluidLance[] = []
  for (const tuyere of layout.tuyeres) {
    const wallHalf = halfWidthAt(layout, lanceYM)
    const wallZM = layout.body.centerZM + (tuyere.side === 'front' ? wallHalf : -wallHalf)
    const inwardZ = tuyere.side === 'front' ? -1 : 1
    lances.push({
      id: tuyere.id,
      side: tuyere.side,
      centerXM: tuyere.centerXM,
      centerYM: lanceYM,
      wallZM,
      tipZM: wallZM + inwardZ * insertionM,
      radiusM,
      inwardZ,
      open: open.has(tuyere.id),
    })
  }

  const hearthYM = (z: number) => {
    const half = Math.max(layout.flare.bottomWidthM / 2, 1e-6)
    const t = Math.min(1, Math.abs(z - layout.body.centerZM) / half)
    return layout.body.centerYM - sagM * (1 - t * t)
  }

  const inFlueFootprint = (x: number, z: number) => (
    Math.abs(x - layout.flue.centerXM) <= layout.flue.lengthM / 2 + 1e-6
    && Math.abs(z - layout.flue.centerZM) <= layout.flue.widthM / 2 + 1e-6
  )

  const insideFlue = (x: number, y: number, z: number) => (
    inFlueFootprint(x, z)
    && y >= layout.flue.centerYM - layout.flue.heightM / 2 - 1e-6
    && y <= flueTopYM + 1e-6
  )

  const insideBody = (x: number, y: number, z: number) => {
    if (Math.abs(x - layout.body.centerXM) > halfLengthM(layout) + 1e-6) return false
    if (y > topYM + 1e-6) return false
    if (y < hearthYM(z) - 1e-6) return false
    return Math.abs(z - layout.body.centerZM) <= halfWidthAt(layout, Math.max(y, layout.body.centerYM)) + 1e-6
  }

  const insideLance = (x: number, y: number, z: number) => lances.some((lance) => pointInLance(lance, x, y, z))

  const contains = (x: number, y: number, z: number) => (
    (insideBody(x, y, z) || insideFlue(x, y, z)) && !insideLance(x, y, z)
  )

  const halfTop = Math.max(layout.flare.topWidthM, layout.flare.bottomWidthM) / 2
  const bounds = {
    minX: Math.min(layout.body.centerXM - halfLengthM(layout), layout.flue.centerXM - layout.flue.lengthM / 2),
    maxX: Math.max(layout.body.centerXM + halfLengthM(layout), layout.flue.centerXM + layout.flue.lengthM / 2),
    minY: nadirYM,
    maxY: Math.max(flueTopYM, topYM),
    minZ: Math.min(layout.body.centerZM - halfTop, layout.flue.centerZM - layout.flue.widthM / 2),
    maxZ: Math.max(layout.body.centerZM + halfTop, layout.flue.centerZM + layout.flue.widthM / 2),
  }

  const halfBottomW = layout.flare.bottomWidthM / 2
  const anchors = {
    x: [
      layout.body.centerXM - halfLengthM(layout), layout.body.centerXM + halfLengthM(layout),
      layout.flue.centerXM - layout.flue.lengthM / 2, layout.flue.centerXM + layout.flue.lengthM / 2,
    ],
    y: [nadirYM, layout.body.centerYM, layout.body.centerYM + layout.flare.lowerHeightM, topYM, flueTopYM],
    z: [
      layout.body.centerZM - halfBottomW, layout.body.centerZM + halfBottomW,
      layout.flue.centerZM - layout.flue.widthM / 2, layout.flue.centerZM + layout.flue.widthM / 2,
    ],
  }

  return {
    sagM,
    nadirYM,
    shellTopYM: topYM,
    flueTopYM,
    lances,
    bounds,
    anchors,
    liquidSurfaceYM: (liquidLevelM: number) => nadirYM + Math.max(0, liquidLevelM),
    hearthYM,
    contains,
    inFlueFootprint,
    insideLance,
  }
}

function pointInLance(lance: FluidLance, x: number, y: number, z: number): boolean {
  const dx = x - lance.centerXM
  const dy = y - lance.centerYM
  if (dx * dx + dy * dy > lance.radiusM * lance.radiusM) return false
  const z0 = Math.min(lance.tipZM, lance.wallZM)
  const z1 = Math.max(lance.tipZM, lance.wallZM)
  return z >= z0 - 1e-6 && z <= z1 + 1e-6
}
