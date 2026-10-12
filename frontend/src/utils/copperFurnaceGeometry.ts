/**
 * 侧吹熔炼炉三维布置：由选型计算结果推导炉体尺寸与水套/风口坐标。
 * 纯函数、不依赖 three.js，便于单测与复用。
 * 坐标系：X = 炉长方向，Y = 竖直向上，Z = 炉宽方向，原点在炉体原平底中心。
 * 炉底中心按弧线切进底座，底座顶面仍与原炉底齐平，不进入流体域。
 */
import type { SmeltingFurnaceDesignResult } from './copperEquipmentSizing.ts'
import {
  countParameter,
  numericParameter,
  type ModelComponentManifest,
  type ModelComponentOverrides,
} from './modelComponentManifest.ts'

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
 * 炉底沿炉宽下凹。侧墙仍接在原平底标高，中心切进底座，不把底座整体下移。
 * 下凹深度限制在底座高度以内，避免弧底穿出底座底面。
 */
export const HEARTH_SAG_RATIO = 0.16

export function hearthSagM(bottomWidthM: number, foundationHeightM = FOUNDATION_HEIGHT_M): number {
  const width = Number.isFinite(bottomWidthM) && bottomWidthM > 0 ? bottomWidthM : 2.2
  const foundation = Number.isFinite(foundationHeightM) && foundationHeightM > 0 ? foundationHeightM : FOUNDATION_HEIGHT_M
  const sag = Math.max(0.02, width * HEARTH_SAG_RATIO)
  return Math.min(sag, foundation * 0.72)
}

/**
 * 示意炉壳倒梯形外扩：自 50% 炉高起两侧斜面连续外扩（各 25% 炉宽），顶宽 = 底宽 + 两侧外扩。
 * 炉床面积 / 水套 / 风口个数仍按未扩张炉宽计算；三维内腔跟随此外扩。
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
  centerXM: number
  centerYM: number
  centerZM: number
}

export interface FurnaceFoundationBox {
  lengthM: number
  widthM: number
  heightM: number
  /** 基础顶面与炉体底面齐平，中心在原点下方 */
  centerYM: number
  centerXM: number
  centerZM: number
}

export interface FurnaceFluePlacement extends SchematicFlueDims {
  centerXM: number
  centerYM: number
  centerZM: number
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
  flue: FurnaceFluePlacement
  flare: SchematicBodyFlareDims
  jackets: FurnaceJacketPlacement[]
  tuyeres: FurnaceTuyerePlacement[]
  jacketCountOneSide: number
  jacketCountTotal: number
  jacketPitchM: number
  /** 仿真和三维共用的喷枪内径 m。切口端面是入口。 */
  lanceDiameterM: number
  /** 喷枪从内壁伸入炉内的深度 m。筒壁是障碍，伸入端是风口入口。 */
  lanceInsertionM: number
  tuyereCountTotal: number
  /** 供相机自动 fit 使用的整体包围尺寸 */
  overallLengthM: number
  overallWidthM: number
  overallHeightM: number
  components: ModelComponentManifest[]
}

function positiveOrFallback(value: number | null | undefined, fallback: number): number {
  return Number.isFinite(value) && (value as number) > 0 ? (value as number) : fallback
}

function overridePositive(overrides: ModelComponentOverrides | undefined, ids: string[], key: string, fallback: number): number {
  for (const id of ids) { const value = overrides?.[id]?.[key]; if (Number.isFinite(value) && (value as number) > 0) return value as number }
  return fallback
}
function overridePosition(overrides: ModelComponentOverrides | undefined, ids: string[], key: string, fallback: number): number {
  for (const id of ids) { const value = overrides?.[id]?.[key]; if (Number.isFinite(value)) return value as number }
  return fallback
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

export function buildSmeltingFurnaceLayout(design: SmeltingFurnaceDesignResult, overrides?: ModelComponentOverrides): FurnaceLayout {
  const lengthM = overridePositive(overrides, ['smelting.primary-body'], 'lengthM', positiveOrFallback(design.designLengthM || design.furnaceLengthM, 8))
  const widthM = overridePositive(overrides, ['smelting.primary-body'], 'widthM', positiveOrFallback(design.furnaceWidthM, 2.2))
  const heightM = overridePositive(overrides, ['smelting.primary-body'], 'heightM', resolveFurnaceBodyHeightM(widthM))
  const jacketPitchM = overridePositive(overrides, ['smelting.annotation.counts'], 'jacketPitchM', positiveOrFallback(design.jacketPitchMm, 600) / 1000)
  const jacketCountOneSide = safeCount(design.jacketCountOneSide, FURNACE_JACKET_RENDER_LIMIT)
  // 风口与水套 1:1：单侧个数相同，X 坐标共用同一组中心
  const tuyereCountOneSide = safeCount(
    design.tuyereCountOneSide > 0 ? design.tuyereCountOneSide : jacketCountOneSide,
    FURNACE_TUYERE_RENDER_LIMIT
  )
  const pairedCountOneSide = Math.min(jacketCountOneSide, tuyereCountOneSide)

  const body: FurnaceBodyBox = { lengthM, widthM, heightM, centerXM: overridePosition(overrides, ['smelting.primary-body'], 'centerXM', 0), centerYM: overridePosition(overrides, ['smelting.primary-body'], 'centerYM', 0), centerZM: overridePosition(overrides, ['smelting.primary-body'], 'centerZM', 0) }
  const foundationHeightM = overridePositive(overrides, ['smelting.support.foundation'], 'heightM', FOUNDATION_HEIGHT_M)
  const sagM = hearthSagM(widthM, foundationHeightM)
  const foundation: FurnaceFoundationBox = {
    lengthM: overridePositive(overrides, ['smelting.support.foundation'], 'lengthM', lengthM + FOUNDATION_MARGIN_M * 2),
    widthM: overridePositive(overrides, ['smelting.support.foundation'], 'widthM', widthM + FOUNDATION_MARGIN_M * 2),
    heightM: foundationHeightM,
    centerYM: overridePosition(overrides, ['smelting.support.foundation'], 'centerYM', body.centerYM - foundationHeightM / 2),
    centerXM: overridePosition(overrides, ['smelting.support.foundation'], 'centerXM', 0),
    centerZM: overridePosition(overrides, ['smelting.support.foundation'], 'centerZM', 0),
  }

  const centerOffsets = jacketCenterOffsetsM(pairedCountOneSide, jacketPitchM)
  const jacketLengthM = Math.max(0.16, Math.min(jacketPitchM * JACKET_FILL_RATIO, 0.36))
  const tuyereCenterYM = Math.max(0.35, heightM * TUYERE_HEIGHT_RATIO)
  const jacketCenterYM = tuyereCenterYM + TUYERE_RADIUS_M + JACKET_ABOVE_TUYERE_GAP_M + JACKET_HEIGHT_M / 2
  const jacketZM = widthM / 2 + JACKET_THICKNESS_M / 2
  const tuyereZM = widthM / 2 + TUYERE_LENGTH_M / 2

  const jackets: FurnaceJacketPlacement[] = []
  const tuyeres: FurnaceTuyerePlacement[] = []
  for (const side of ['front', 'back'] as FurnaceSide[]) {
    const sign = side === 'front' ? 1 : -1
    const sideLabel = side === 'front' ? '前墙' : '后墙'
    centerOffsets.forEach((centerXM, position) => {
      const index = position + 1
      const jacketId = `jacket-${side}-${index}`
      const jacketManifestId = `smelting.cooling-and-injection.jacket.${side}.${String(index).padStart(2, '0')}`
      jackets.push({
        id: jacketId,
        index,
        side,
        centerXM: overridePosition(overrides, [jacketManifestId, jacketId], 'centerXM', centerXM),
        centerYM: overridePosition(overrides, [jacketManifestId, jacketId], 'centerYM', jacketCenterYM),
        centerZM: overridePosition(overrides, [jacketManifestId, jacketId], 'centerZM', jacketZM * sign),
        lengthM: overridePositive(overrides, [jacketManifestId, jacketId], 'lengthM', jacketLengthM),
        heightM: overridePositive(overrides, [jacketManifestId, jacketId], 'heightM', JACKET_HEIGHT_M),
        thicknessM: overridePositive(overrides, [jacketManifestId, jacketId], 'thicknessM', JACKET_THICKNESS_M),
        label: `水套 ${sideLabel} #${index}`,
      })
      const tuyereId = `tuyere-${side}-${index}`
      const tuyereManifestId = `smelting.cooling-and-injection.tuyere.${side}.${String(index).padStart(2, '0')}`
      tuyeres.push({
        id: tuyereId,
        index,
        side,
        centerXM: overridePosition(overrides, [tuyereManifestId, tuyereId], 'centerXM', centerXM),
        centerYM: overridePosition(overrides, [tuyereManifestId, tuyereId], 'centerYM', tuyereCenterYM),
        centerZM: overridePosition(overrides, [tuyereManifestId, tuyereId], 'centerZM', tuyereZM * sign),
        radiusM: overridePositive(overrides, [tuyereManifestId, tuyereId], 'radiusM', TUYERE_RADIUS_M),
        lengthM: overridePositive(overrides, [tuyereManifestId, tuyereId], 'lengthM', TUYERE_LENGTH_M),
        label: `风口 ${sideLabel} #${index}`,
      })
    })
  }

  const flareBase = resolveSchematicBodyFlareDims(body)
  const flare: SchematicBodyFlareDims = {
    ...flareBase,
    lowerHeightM: overridePositive(overrides, ['smelting.primary-body'], 'flareLowerHeightM', flareBase.lowerHeightM),
    upperHeightM: overridePositive(overrides, ['smelting.primary-body'], 'flareUpperHeightM', flareBase.upperHeightM),
    topWidthM: overridePositive(overrides, ['smelting.primary-body'], 'topWidthM', flareBase.topWidthM),
  }
  const flueBase = resolveSchematicFlueDims(body)
  const flueLengthM = overridePositive(overrides, ['smelting.process-connection.flue'], 'lengthM', flueBase.lengthM)
  const flueWidthM = overridePositive(overrides, ['smelting.process-connection.flue'], 'widthM', flueBase.widthM)
  const flueHeightM = overridePositive(overrides, ['smelting.process-connection.flue'], 'heightM', flueBase.heightM)
  const flue: FurnaceFluePlacement = {
    lengthM: flueLengthM,
    widthM: flueWidthM,
    heightM: flueHeightM,
    centerXM: overridePosition(overrides, ['smelting.process-connection.flue'], 'centerXM', body.centerXM),
    centerYM: overridePosition(overrides, ['smelting.process-connection.flue'], 'centerYM', body.centerYM + body.heightM + flueHeightM / 2),
    centerZM: overridePosition(overrides, ['smelting.process-connection.flue'], 'centerZM', body.centerZM),
  }
  const bounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity }
  const includeBox = (x: number, y: number, z: number, l: number, h: number, w: number) => { bounds.minX = Math.min(bounds.minX, x - l / 2); bounds.maxX = Math.max(bounds.maxX, x + l / 2); bounds.minY = Math.min(bounds.minY, y - h / 2); bounds.maxY = Math.max(bounds.maxY, y + h / 2); bounds.minZ = Math.min(bounds.minZ, z - w / 2); bounds.maxZ = Math.max(bounds.maxZ, z + w / 2) }
  includeBox(body.centerXM, body.centerYM + flare.lowerHeightM / 2, body.centerZM, flare.bottomLengthM, flare.lowerHeightM, flare.bottomWidthM)
  bounds.minY = Math.min(bounds.minY, body.centerYM - sagM)
  includeBox(body.centerXM, body.centerYM + flare.lowerHeightM + flare.upperHeightM / 2, body.centerZM, flare.topLengthM, flare.upperHeightM, flare.topWidthM)
  includeBox(foundation.centerXM, foundation.centerYM, foundation.centerZM, foundation.lengthM, foundation.heightM, foundation.widthM)
  includeBox(flue.centerXM, flue.centerYM, flue.centerZM, flue.lengthM, flue.heightM, flue.widthM)
  for (const jacket of jackets) includeBox(jacket.centerXM, jacket.centerYM, jacket.centerZM, jacket.lengthM, jacket.heightM, jacket.thicknessM)
  for (const tuyere of tuyeres) includeBox(tuyere.centerXM, tuyere.centerYM, tuyere.centerZM, tuyere.lengthM, tuyere.radiusM * 2, tuyere.radiusM * 2)
  const layout: FurnaceLayout = {
    body,
    foundation,
    flue,
    flare,
    jackets,
    tuyeres,
    jacketCountOneSide: pairedCountOneSide,
    jacketCountTotal: pairedCountOneSide * 2,
    jacketPitchM,
    lanceDiameterM: overridePositive(overrides, ['smelting.annotation.counts'], 'lanceDiameterM', 0.04),
    lanceInsertionM: Math.max(0, overridePosition(overrides, ['smelting.annotation.counts'], 'lanceInsertionM', 0.1)),
    tuyereCountTotal: pairedCountOneSide * 2,
    overallLengthM: bounds.maxX - bounds.minX,
    overallWidthM: bounds.maxZ - bounds.minZ,
    overallHeightM: bounds.maxY - bounds.minY,
    components: [],
  }
  layout.components = buildSmeltingFurnaceComponentManifest(layout)
  return layout
}

/** Build stable, hand-off friendly component metadata from a computed layout. */
export function buildSmeltingFurnaceComponentManifest(layout: FurnaceLayout): ModelComponentManifest[] {
  const components: ModelComponentManifest[] = []
  const bodyId = 'smelting.primary-body'
  components.push({
    id: bodyId, model: 'smelting-furnace', group: 'primary-body', category: 'furnace-body',
    role: '侧吹熔炼炉主体炉壳', kind: 'box',
    params: {
      lengthM: numericParameter(layout.body.lengthM, 'm', { editable: true, source: 'calculation', label: '炉长' }),
      widthM: numericParameter(layout.body.widthM, 'm', { editable: true, source: 'calculation', label: '炉宽' }),
      heightM: numericParameter(layout.body.heightM, 'm', { editable: true, source: 'geometry', label: '炉高' }),
      centerXM: numericParameter(layout.body.centerXM, 'm', { editable: true, source: 'geometry', label: 'X' }),
      centerYM: numericParameter(layout.body.centerYM, 'm', { editable: true, source: 'geometry', label: 'Y' }),
      centerZM: numericParameter(layout.body.centerZM, 'm', { editable: true, source: 'geometry', label: 'Z' }),
    },
  })
  components.push({
    id: 'smelting.support.foundation', model: 'smelting-furnace', group: 'support', category: 'foundation',
    role: '设备基础', kind: 'box',
    params: {
      lengthM: numericParameter(layout.foundation.lengthM, 'm', { editable: true, source: 'geometry', label: '基础长度' }),
      widthM: numericParameter(layout.foundation.widthM, 'm', { editable: true, source: 'geometry', label: '基础宽度' }),
      heightM: numericParameter(layout.foundation.heightM, 'm', { editable: true, source: 'geometry', label: '基础高度' }),
      centerXM: numericParameter(layout.foundation.centerXM, 'm', { editable: true, source: 'geometry', label: 'X' }),
      centerYM: numericParameter(layout.foundation.centerYM, 'm', { editable: true, source: 'geometry', label: 'Y' }),
      centerZM: numericParameter(layout.foundation.centerZM, 'm', { editable: true, source: 'geometry', label: 'Z' }),
    },
  })
  for (const jacket of layout.jackets) {
    const serial = String(jacket.index).padStart(2, '0')
    components.push({
      id: `smelting.cooling-and-injection.jacket.${jacket.side}.${serial}`,
      model: 'smelting-furnace', group: 'cooling-and-injection', category: 'water-jacket',
      role: `水套 ${jacket.side === 'front' ? '前墙' : '后墙'} #${jacket.index}`, kind: 'box', geometryId: jacket.id,
      params: {
        lengthM: numericParameter(jacket.lengthM, 'm', { editable: true, source: 'geometry', label: '水套长度' }),
        heightM: numericParameter(jacket.heightM, 'm', { editable: true, source: 'geometry', label: '水套高度' }),
        thicknessM: numericParameter(jacket.thicknessM, 'm', { editable: true, source: 'geometry', label: '水套厚度' }),
        centerXM: numericParameter(jacket.centerXM, 'm', { editable: false, source: 'geometry' }),
        centerYM: numericParameter(jacket.centerYM, 'm', { editable: true, source: 'geometry', label: 'Y' }),
        centerZM: numericParameter(jacket.centerZM, 'm', { editable: true, source: 'geometry', label: 'Z' }),
      },
    })
  }
  for (const tuyere of layout.tuyeres) {
    const serial = String(tuyere.index).padStart(2, '0')
    components.push({
      id: `smelting.cooling-and-injection.tuyere.${tuyere.side}.${serial}`,
      model: 'smelting-furnace', group: 'cooling-and-injection', category: 'tuyere',
      role: `风口 ${tuyere.side === 'front' ? '前墙' : '后墙'} #${tuyere.index}`, kind: 'cylinder', geometryId: tuyere.id,
      params: {
        radiusM: numericParameter(tuyere.radiusM, 'm', { editable: true, source: 'geometry', label: '风口半径' }),
        lengthM: numericParameter(tuyere.lengthM, 'm', { editable: true, source: 'geometry', label: '风口长度' }),
        centerXM: numericParameter(tuyere.centerXM, 'm', { editable: true, source: 'geometry', label: 'X' }),
        centerYM: numericParameter(tuyere.centerYM, 'm', { editable: true, source: 'geometry', label: 'Y' }),
        centerZM: numericParameter(tuyere.centerZM, 'm', { editable: true, source: 'geometry', label: 'Z' }),
      },
    })
  }
  components.push({
    id: 'smelting.annotation.counts', model: 'smelting-furnace', group: 'annotation', category: 'layout-summary',
    role: '布置数量汇总', kind: 'metadata',
    params: {
      jacketCountOneSide: countParameter(layout.jacketCountOneSide),
      jacketCountTotal: countParameter(layout.jacketCountTotal),
      tuyereCountTotal: countParameter(layout.tuyereCountTotal),
      jacketPitchM: numericParameter(layout.jacketPitchM, 'm', { editable: true, source: 'calculation', label: '水套间距' }),
    },
  })
  return components
}
