/**
 * 侧吹熔炼炉三维布置：由选型计算结果推导炉体尺寸与水套/风口坐标。
 * 纯函数、不依赖 three.js，便于单测与复用。
 * 坐标系：X = 炉长方向，Y = 竖直向上，Z = 炉宽方向，原点在炉体底面中心。
 */
import type { SmeltingFurnaceDesignResult } from './copperEquipmentSizing.ts'

export type FurnaceSide = 'front' | 'back'

/** 单侧水套/风口渲染上限，避免异常输入下实例数量失控 */
export const FURNACE_JACKET_RENDER_LIMIT = 200
export const FURNACE_TUYERE_RENDER_LIMIT = 200

/** 炉体各构件相对尺寸；横向炉壳高度相对旧版示意加高一倍 */
const BODY_HEIGHT_MIN_M = 5.6
const BODY_HEIGHT_WIDTH_RATIO = 2.3
/** 水套沿炉长占间隔的比例，留出安装缝；示意改为风口上方小方块 */
const JACKET_FILL_RATIO = 0.42
const JACKET_HEIGHT_M = 0.22
const JACKET_THICKNESS_M = 0.2
const JACKET_ABOVE_TUYERE_GAP_M = 0.06
const TUYERE_RADIUS_M = 0.11
const TUYERE_LENGTH_M = 0.52
const TUYERE_HEIGHT_RATIO = 0.22
const FOUNDATION_HEIGHT_M = 1.6
const FOUNDATION_MARGIN_M = 0.9

/**
 * 示意炉壳倒梯形外扩：自 50% 炉高起两侧斜面连续外扩（各 25% 炉宽），顶宽 = 底宽 + 两侧外扩。
 * 仅影响三维外观；炉床面积 / 水套 / 风口布置仍按未扩张炉宽计算。
 */
export const BODY_FLARE_START_RATIO = 0.5
export const BODY_FLARE_SIDE_OVERHANG_WIDTH_RATIO = 0.25

export type SchematicBodyFlareDims = {
  lowerHeightM: number
  upperHeightM: number
  bottomLengthM: number
  bottomWidthM: number
  topLengthM: number
  topWidthM: number
}

export function resolveSchematicBodyFlareDims(body: {
  lengthM: number
  widthM: number
  heightM: number
}): SchematicBodyFlareDims {
  const lengthM = positiveOrFallback(body.lengthM, 8)
  const widthM = positiveOrFallback(body.widthM, 2.2)
  const heightM = positiveOrFallback(body.heightM, 5.6)
  const overhangM = widthM * BODY_FLARE_SIDE_OVERHANG_WIDTH_RATIO
  return {
    lowerHeightM: heightM * BODY_FLARE_START_RATIO,
    upperHeightM: heightM * (1 - BODY_FLARE_START_RATIO),
    bottomLengthM: lengthM,
    bottomWidthM: widthM,
    // 倒梯形顶面：炉长不变，炉宽两侧各外扩 25% 炉宽
    topLengthM: lengthM,
    topWidthM: widthM + overhangM * 2,
  }
}

/**
 * 示意烟道：立于炉顶的长方体，相对炉体尺寸：
 * 长 = 炉长 × 1/3，宽 = 炉宽 × 4/5，高 = 炉高 × 1/3
 */
const FLUE_LENGTH_RATIO = 1 / 3
const FLUE_WIDTH_RATIO = 4 / 5
const FLUE_HEIGHT_RATIO = 1 / 3

export type SchematicFlueDims = {
  lengthM: number
  widthM: number
  heightM: number
}

/** 按炉体长宽高推导示意烟道长方体尺寸 */
export function resolveSchematicFlueDims(body: {
  lengthM: number
  widthM: number
  heightM: number
}): SchematicFlueDims {
  const lengthM = positiveOrFallback(body.lengthM, 8)
  const widthM = positiveOrFallback(body.widthM, 2.2)
  const heightM = positiveOrFallback(body.heightM, 5.6)
  return {
    lengthM: lengthM * FLUE_LENGTH_RATIO,
    widthM: widthM * FLUE_WIDTH_RATIO,
    heightM: heightM * FLUE_HEIGHT_RATIO,
  }
}

export interface FurnaceBodyBox {
  lengthM: number
  widthM: number
  heightM: number
}

export interface FurnaceFoundationBox {
  lengthM: number
  widthM: number
  heightM: number
  /** 基础顶面与炉体底面齐平，中心在原点下方 */
  centerYM: number
}

export interface FurnaceJacketPlacement {
  id: string
  /** 该侧内的序号，从 1 开始 */
  index: number
  side: FurnaceSide
  centerXM: number
  centerYM: number
  centerZM: number
  lengthM: number
  heightM: number
  thicknessM: number
  label: string
}

export interface FurnaceTuyerePlacement {
  id: string
  index: number
  side: FurnaceSide
  centerXM: number
  centerYM: number
  centerZM: number
  radiusM: number
  lengthM: number
  label: string
}

export interface FurnaceLayout {
  body: FurnaceBodyBox
  foundation: FurnaceFoundationBox
  jackets: FurnaceJacketPlacement[]
  tuyeres: FurnaceTuyerePlacement[]
  jacketCountOneSide: number
  jacketCountTotal: number
  jacketPitchM: number
  tuyereCountTotal: number
  /** 供相机自动 fit 使用的整体包围尺寸 */
  overallLengthM: number
  overallWidthM: number
  overallHeightM: number
}

function positiveOrFallback(value: number | null | undefined, fallback: number): number {
  return Number.isFinite(value) && (value as number) > 0 ? (value as number) : fallback
}

function safeCount(value: number | null | undefined, limit: number): number {
  if (!Number.isFinite(value) || (value as number) <= 0) return 0
  return Math.min(limit, Math.floor(value as number))
}

/** 炉高按炉宽推导；相对旧版示意加高一倍 */
export function resolveFurnaceBodyHeightM(widthM: number): number {
  return Math.max(BODY_HEIGHT_MIN_M, positiveOrFallback(widthM, BODY_HEIGHT_MIN_M) * BODY_HEIGHT_WIDTH_RATIO)
}

/**
 * 风口按总数拆分到两侧长墙：前墙取上整、后墙取下整，保证两侧之和等于计算所得总数。
 */
export function splitTuyereCountBySide(total: number): { front: number; back: number } {
  const count = safeCount(total, FURNACE_TUYERE_RENDER_LIMIT)
  return { front: Math.ceil(count / 2), back: Math.floor(count / 2) }
}

/**
 * 水套沿炉长按间隔中心均布，整排相对炉体居中，未排满的余量平分到两端。
 */
export function jacketCenterOffsetsM(countOneSide: number, pitchM: number): number[] {
  const count = safeCount(countOneSide, FURNACE_JACKET_RENDER_LIMIT)
  if (count <= 0) return []
  const pitch = positiveOrFallback(pitchM, 0.6)
  const spanM = count * pitch
  const startXM = -spanM / 2
  return Array.from({ length: count }, (_, index) => startXM + (index + 0.5) * pitch)
}

/**
 * 风口沿炉长均布在有效长度内，两端各留半个间距，避免贴到端墙。
 */
export function tuyereCenterOffsetsM(count: number, usableLengthM: number): number[] {
  const safe = safeCount(count, FURNACE_TUYERE_RENDER_LIMIT)
  if (safe <= 0) return []
  const usable = positiveOrFallback(usableLengthM, 1)
  if (safe === 1) return [0]
  const step = usable / safe
  const startXM = -usable / 2 + step / 2
  return Array.from({ length: safe }, (_, index) => startXM + index * step)
}

export function buildSmeltingFurnaceLayout(design: SmeltingFurnaceDesignResult): FurnaceLayout {
  const lengthM = positiveOrFallback(design.designLengthM || design.furnaceLengthM, 8)
  const widthM = positiveOrFallback(design.furnaceWidthM, 2.2)
  const heightM = resolveFurnaceBodyHeightM(widthM)
  const jacketPitchM = positiveOrFallback(design.jacketPitchMm, 600) / 1000
  const jacketCountOneSide = safeCount(design.jacketCountOneSide, FURNACE_JACKET_RENDER_LIMIT)
  // 风口与水套 1:1：单侧个数相同，X 坐标共用同一组中心
  const tuyereCountOneSide = safeCount(
    design.tuyereCountOneSide > 0 ? design.tuyereCountOneSide : jacketCountOneSide,
    FURNACE_TUYERE_RENDER_LIMIT
  )
  const pairedCountOneSide = Math.min(jacketCountOneSide, tuyereCountOneSide)

  const body: FurnaceBodyBox = { lengthM, widthM, heightM }
  const foundation: FurnaceFoundationBox = {
    lengthM: lengthM + FOUNDATION_MARGIN_M * 2,
    widthM: widthM + FOUNDATION_MARGIN_M * 2,
    heightM: FOUNDATION_HEIGHT_M,
    centerYM: -FOUNDATION_HEIGHT_M / 2,
  }

  const centerOffsets = jacketCenterOffsetsM(pairedCountOneSide, jacketPitchM)
  const jacketLengthM = Math.max(0.16, Math.min(jacketPitchM * JACKET_FILL_RATIO, 0.36))
  const tuyereCenterYM = Math.max(0.35, heightM * TUYERE_HEIGHT_RATIO)
  const jacketCenterYM = tuyereCenterYM + TUYERE_RADIUS_M + JACKET_ABOVE_TUYERE_GAP_M + JACKET_HEIGHT_M / 2
  const jacketZM = widthM / 2 + JACKET_THICKNESS_M / 2
  const tuyereZM = widthM / 2 + TUYERE_LENGTH_M / 2

  const jackets: FurnaceJacketPlacement[] = []
  const tuyeres: FurnaceTuyerePlacement[] = []
  let serial = 0
  for (const side of ['front', 'back'] as FurnaceSide[]) {
    const sign = side === 'front' ? 1 : -1
    const sideLabel = side === 'front' ? '前墙' : '后墙'
    centerOffsets.forEach((centerXM, position) => {
      const index = position + 1
      serial += 1
      jackets.push({
        id: `jacket-${side}-${index}`,
        index,
        side,
        centerXM,
        centerYM: jacketCenterYM,
        centerZM: jacketZM * sign,
        lengthM: jacketLengthM,
        heightM: JACKET_HEIGHT_M,
        thicknessM: JACKET_THICKNESS_M,
        label: `水套 ${sideLabel} #${index}`,
      })
      tuyeres.push({
        id: `tuyere-${side}-${index}`,
        index: serial,
        side,
        centerXM,
        centerYM: tuyereCenterYM,
        centerZM: tuyereZM * sign,
        radiusM: TUYERE_RADIUS_M,
        lengthM: TUYERE_LENGTH_M,
        label: `风口 ${sideLabel} #${index}`,
      })
    })
  }

  return {
    body,
    foundation,
    jackets,
    tuyeres,
    jacketCountOneSide: pairedCountOneSide,
    jacketCountTotal: pairedCountOneSide * 2,
    jacketPitchM,
    tuyereCountTotal: pairedCountOneSide * 2,
    overallLengthM: foundation.lengthM,
    overallWidthM: Math.max(foundation.widthM, widthM + TUYERE_LENGTH_M * 2),
    overallHeightM: heightM + resolveSchematicFlueDims({ lengthM, widthM, heightM }).heightM + FOUNDATION_HEIGHT_M,
  }
}
