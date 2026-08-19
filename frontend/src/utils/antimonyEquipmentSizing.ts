import { calculateGasMixtureStandardVolumeNm3h } from './antimonyProductPhaseCalc.ts'
import { materialWaterWeight, type AntimonyMaterialColumn } from './antimonyWorkflowCalc.ts'

export interface AntimonyEquipmentSizingInput {
  currentThroughput: number
  annualHours: number
  targetScaleWanTpa: number
  adjustmentFactor: number
  unitThroughput: number
}

export interface AntimonyEquipmentSizingResult {
  currentAnnualWanTpa: number
  targetThroughput: number
  scaleFactor: number
  adjustedThroughput: number
  recommendedUnits: number
}

/** 侧吹熔炼炉床面积 / 设计参数默认值 */
export const DEFAULT_SMELTING_PROCESS_DAYS = 330
export const DEFAULT_SMELTING_JACKET_PITCH_MM = 600
export const DEFAULT_SMELTING_TUYERE_OXYGEN_NM3H = 600
export const DEFAULT_SMELTING_FURNACE_WIDTH_M = 2.2
/** 熔炼渣密度默认值 t/m³ */
export const DEFAULT_SMELTING_SLAG_DENSITY_TM3 = 3.5
/** 锑锍（锑锍）密度默认值 t/m³ */
export const DEFAULT_SMELTING_MATTE_DENSITY_TM3 = 5.0
/** 吹炼渣液相密度默认值 t/m³。铜吹炼渣工程估算通常取 3.4-3.8 t/m³。 */
export const DEFAULT_CONVERTING_SLAG_DENSITY_TM3 = 3.6
/** 粗铜液相密度默认值 t/m³。熔融铜在吹炼温度下通常约为 8.0 t/m³。 */
export const DEFAULT_CONVERTING_CRUDE_ANTIMONY_DENSITY_TM3 = 8.0

/** 水套余量处置：增加 1 个间隔，或去掉余量 */
export type JacketRemainderDecision = 'extend' | 'trim'

/**
 * 熔池高度 m = 质量流(t/h) ÷ (密度(t/m³) × 炉床面积(m²))
 * 质量取产出小时量，面积取水套余量处置后的熔炼炉面积。
 */
export function calculateBathHeightM(massTh: number, densityTm3: number, areaM2: number): number {
  if (!(massTh > 0) || !(densityTm3 > 0) || !(areaM2 > 0)) return 0
  return massTh / (densityTm3 * areaM2)
}

/** 单日处理量 t/d = 湿基小时量 × 24 */
export function calculateDailyFeedTd(hourlyWetTh: number): number {
  return Math.max(0, hourlyWetTh) * 24
}

/** 年投入量 t/a（原料湿基，含水、不含熔剂和燃料煤）= 湿基小时量 × 24 × 年处理天数 */
export function calculateAnnualFeedWithoutCoalTa(hourlyWetTh: number, processDays: number): number {
  return calculateDailyFeedTd(hourlyWetTh) * Math.max(0, processDays)
}

/** 炉床面积 m² = 单日处理量 / 床能力 */
export function calculateSmeltingFurnaceAreaM2(dailyFeedTd: number, bedCapacity: number): number {
  const capacity = Math.max(bedCapacity, 0)
  if (capacity <= 0) return 0
  return Math.max(0, dailyFeedTd) / capacity
}

/** 炉床面积 m² = 年投入量 / 年处理天数 / 床能力 */
export function calculateSmeltingFurnaceAreaFromAnnual(
  annualFeedTa: number,
  processDays: number,
  bedCapacity: number
): number {
  const days = Math.max(processDays, 0)
  const capacity = Math.max(bedCapacity, 0)
  if (days <= 0 || capacity <= 0) return 0
  return Math.max(0, annualFeedTa) / days / capacity
}

export interface SmeltingFurnaceDesignInput {
  dailyFeedTd: number
  bedCapacity: number
  furnaceLengthM: number
  furnaceWidthM: number
  jacketPitchMm: number
  /** 余量处置：增加间隔或去掉余量；无余量时忽略 */
  jacketRemainderDecision?: JacketRemainderDecision | null
  oxygenNm3h: number
  /** @deprecated 单风口氧能力由氧气流量 ÷ 风口数计算 */
  tuyereOxygenNm3h?: number
  /** 单侧风口数覆盖；不传或无效时默认等于单侧水套数 */
  tuyereCountOneSide?: number | null
  /** @deprecated 请使用 tuyereCountOneSide；若传入则按两侧总数反算单侧 */
  tuyereCount?: number | null
}

export interface SmeltingFurnaceDesignResult {
  dailyFeedTd: number
  /** 炉床面积（处理量 ÷ 床能力） */
  areaM2: number
  /** 理论炉长（由炉床面积 ÷ 炉宽，或用户输入） */
  furnaceLengthM: number
  furnaceWidthM: number
  /** 水套余量调整后的设计炉长 */
  designLengthM: number
  /** 水套余量调整后的熔炼炉面积 = 设计炉长 × 炉宽 */
  designAreaM2: number
  jacketPitchMm: number
  /** 双侧水套总数 */
  jacketCountTotal: number
  /** 一侧个数（三维布置用） */
  jacketCountOneSide: number
  /** 理论炉长方向未排满的余量 mm */
  jacketRemainderMm: number
  jacketRemainderDecision: JacketRemainderDecision | null
  oxygenNm3h: number
  /** 单风口氧能力（全开口径）= 氧气流量 ÷ 两侧风口数 */
  tuyereOxygenNm3h: number
  /** 双侧风口总数 */
  tuyereCount: number
  /** 单侧风口数（默认同水套，可输入覆盖） */
  tuyereCountOneSide: number
  /** 单侧风口能力 = 氧气流量 ÷ 单侧风口数 */
  tuyereOneSideOxygenCapacityNm3h: number
  /** 全开风口能力 = 氧气流量 ÷ 两侧风口数 */
  tuyereFullOxygenCapacityNm3h: number
}

export function normalizeScaleWanTpa(value: string | number, fallback = 10) {
  const parsed = typeof value === 'number' ? value : Number(String(value).replace(',', '.'))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export function calculateAntimonyEquipmentSizing({
  currentThroughput,
  annualHours,
  targetScaleWanTpa,
  adjustmentFactor,
  unitThroughput,
}: AntimonyEquipmentSizingInput): AntimonyEquipmentSizingResult {
  const safeHours = Math.max(annualHours, 1)
  const safeThroughput = Math.max(currentThroughput, 0)
  const safeTargetScale = Math.max(targetScaleWanTpa, 0)
  const safeAdjustment = Number.isFinite(adjustmentFactor) && adjustmentFactor > 0 ? adjustmentFactor : 1
  const safeUnitThroughput = Math.max(unitThroughput, 1)
  const currentAnnualWanTpa = (safeThroughput * safeHours) / 10000
  const targetThroughput = (safeTargetScale * 10000) / safeHours
  const scaleFactor = currentAnnualWanTpa > 0 ? safeTargetScale / currentAnnualWanTpa : 0
  const adjustedThroughput = targetThroughput * safeAdjustment
  const recommendedUnits = Math.max(1, Math.ceil(adjustedThroughput / safeUnitThroughput))

  return {
    currentAnnualWanTpa,
    targetThroughput,
    scaleFactor,
    adjustedThroughput,
    recommendedUnits,
  }
}

/** 投入（原料）湿基小时合计（含水分，不含熔剂、燃料煤和气列） */
export function sumRawWetThroughputTh(
  columns: Array<Pick<AntimonyMaterialColumn, 'kind' | 'airRole' | 'weight' | 'waterWeight' | 'moisture'>>
): number {
  return columns.reduce((sum, column) => {
    if (column.kind !== 'raw') return sum
    return sum + Math.max(0, column.weight ?? 0) + materialWaterWeight(column)
  }, 0)
}

export function calculateFurnaceLengthM(areaM2: number, widthM: number): number {
  const width = Math.max(widthM, 0)
  if (width <= 0) return 0
  return Math.max(0, areaM2) / width
}

export function calculateFurnaceWidthM(areaM2: number, lengthM: number): number {
  const length = Math.max(lengthM, 0)
  if (length <= 0) return 0
  return Math.max(0, areaM2) / length
}

/**
 * 长度方向水套个数（一侧）。
 * 水套布置在间隔中心，只能占用完整间隔，因此向下取整；余量留给端部调整。
 * 例：炉长 2.2 m、间隔 600 mm → 一侧 3 个，余 400 mm。
 */
export function calculateJacketCountOneSide(lengthM: number, pitchMm: number): number {
  const pitch = Math.max(pitchMm, 1)
  const lengthMm = Math.max(0, lengthM) * 1000
  if (lengthMm <= 0) return 0
  return Math.floor(lengthMm / pitch)
}

/** 双侧水套总数 = 一侧 × 2 */
export function calculateJacketCountTotal(lengthM: number, pitchMm: number): number {
  return calculateJacketCountOneSide(lengthM, pitchMm) * 2
}

/** 炉长方向余量 mm = 炉长 − 一侧个数 × 间隔 */
export function calculateJacketRemainderMm(lengthM: number, pitchMm: number): number {
  const pitch = Math.max(pitchMm, 1)
  const lengthMm = Math.max(0, lengthM) * 1000
  const oneSide = calculateJacketCountOneSide(lengthM, pitch)
  return Math.max(0, lengthMm - oneSide * pitch)
}

export function jacketCountOneSideFromTotal(total: number): number {
  return Math.max(0, Math.round(Math.max(0, total) / 2))
}

/** @deprecated 风口数改为等于水套数；保留函数供旧逻辑兼容 */
export function calculateTuyereCount(oxygenNm3h: number, tuyereOxygenNm3h: number): number {
  const perTuyere = Math.max(tuyereOxygenNm3h, 1e-9)
  if (oxygenNm3h <= 0) return 0
  return Math.max(1, Math.ceil(oxygenNm3h / perTuyere))
}

/** 单风口氧能力 = 氧气流量 ÷ 风口数（双侧） */
export function calculateTuyereOxygenPerTuyereNm3h(oxygenNm3h: number, tuyereCount: number): number {
  const count = Math.max(0, Math.floor(tuyereCount))
  if (count <= 0) return 0
  return Math.max(0, oxygenNm3h) / count
}

function processAirPhaseWeightPct(column: AntimonyMaterialColumn): Partial<Record<string, number>> {
  const oxygenAir = (column as AntimonyMaterialColumn & {
    oxygenAir?: { weightPct?: Partial<Record<'O2' | 'N2' | 'H2O', number>> }
  }).oxygenAir
  if (oxygenAir?.weightPct) {
    return {
      O2: oxygenAir.weightPct.O2 ?? 0,
      N2: oxygenAir.weightPct.N2 ?? 0,
      H2O: oxygenAir.weightPct.H2O ?? 0,
    }
  }
  const waterMass = materialWaterWeight(column)
  const dryMass = Math.max(0, column.weight ?? 0)
  const totalMass = dryMass + waterMass
  if (totalMass <= 0) {
    if (column.airRole === 'oxygen' || column.name === '氧气') {
      return { O2: 99.65, N2: 0.35, H2O: 0 }
    }
    return { O2: 22.902, N2: 75.387, H2O: 1.711 }
  }
  const waterWeightPct = (waterMass / totalMass) * 100
  const dryShare = Math.max(0, 100 - waterWeightPct)
  return {
    O2: (dryShare * Math.max(0, column.ratios['O(氧)'] ?? 0)) / 100,
    N2: (dryShare * Math.max(0, column.ratios['N(氮)'] ?? 0)) / 100,
    H2O: waterWeightPct,
  }
}

/** 过程气列标态体积 Nm³/h（与配料表体积显示口径一致） */
export function calculateProcessAirColumnVolumeNm3h(column: AntimonyMaterialColumn | null | undefined): number {
  if (!column) return 0
  const totalMass = Math.max(0, column.weight ?? 0) + materialWaterWeight(column)
  return calculateGasMixtureStandardVolumeNm3h(totalMass, processAirPhaseWeightPct(column))
}

/** @deprecated 使用 calculateProcessAirColumnVolumeNm3h */
export function calculateOxygenColumnVolumeNm3h(column: AntimonyMaterialColumn | null | undefined): number {
  return calculateProcessAirColumnVolumeNm3h(column)
}

export function findOxygenAirColumn(
  airColumns: AntimonyMaterialColumn[] | null | undefined
): AntimonyMaterialColumn | null {
  if (!airColumns?.length) return null
  return (
    airColumns.find((column) => column.airRole === 'oxygen' || column.name === '氧气') ?? null
  )
}

export function calculateSmeltingFurnaceDesign(input: SmeltingFurnaceDesignInput): SmeltingFurnaceDesignResult {
  const bedCapacity = Math.max(input.bedCapacity, 0)
  const jacketPitchMm = Math.max(input.jacketPitchMm, 1)
  const oxygenNm3h = Math.max(input.oxygenNm3h, 0)
  const dailyFeedTd = Math.max(0, input.dailyFeedTd)
  const areaM2 = calculateSmeltingFurnaceAreaM2(dailyFeedTd, bedCapacity)

  let furnaceWidthM = Math.max(0, input.furnaceWidthM)
  let furnaceLengthM = Math.max(0, input.furnaceLengthM)
  if (areaM2 > 0) {
    if (furnaceWidthM > 0 && !(furnaceLengthM > 0)) {
      furnaceLengthM = calculateFurnaceLengthM(areaM2, furnaceWidthM)
    } else if (furnaceLengthM > 0 && !(furnaceWidthM > 0)) {
      furnaceWidthM = calculateFurnaceWidthM(areaM2, furnaceLengthM)
    } else if (furnaceWidthM > 0) {
      furnaceLengthM = calculateFurnaceLengthM(areaM2, furnaceWidthM)
    }
  }

  const baseOneSide = calculateJacketCountOneSide(furnaceLengthM, jacketPitchMm)
  const jacketRemainderMm = calculateJacketRemainderMm(furnaceLengthM, jacketPitchMm)
  const hasRemainder = jacketRemainderMm > 0.5
  const jacketRemainderDecision =
    hasRemainder && (input.jacketRemainderDecision === 'extend' || input.jacketRemainderDecision === 'trim')
      ? input.jacketRemainderDecision
      : null

  let jacketCountOneSide = baseOneSide
  let designLengthM = furnaceLengthM
  if (hasRemainder && jacketRemainderDecision === 'extend') {
    jacketCountOneSide = baseOneSide + 1
    designLengthM = (jacketCountOneSide * jacketPitchMm) / 1000
  } else if (hasRemainder && jacketRemainderDecision === 'trim') {
    jacketCountOneSide = baseOneSide
    designLengthM = (baseOneSide * jacketPitchMm) / 1000
  }

  const jacketCountTotal = jacketCountOneSide * 2
  const designAreaM2 = furnaceWidthM > 0 && designLengthM > 0 ? designLengthM * furnaceWidthM : 0

  // 风口数默认同水套，可输入覆盖；风口能力按氧气流量 ÷ 风口数
  let tuyereCountOneSide = jacketCountOneSide
  if (input.tuyereCountOneSide != null && Number.isFinite(input.tuyereCountOneSide) && input.tuyereCountOneSide > 0) {
    tuyereCountOneSide = Math.max(1, Math.round(input.tuyereCountOneSide))
  } else if (input.tuyereCount != null && Number.isFinite(input.tuyereCount) && input.tuyereCount > 0) {
    tuyereCountOneSide = Math.max(1, Math.round(input.tuyereCount / 2))
  }
  const tuyereCount = tuyereCountOneSide * 2
  const tuyereOneSideOxygenCapacityNm3h = calculateTuyereOxygenPerTuyereNm3h(oxygenNm3h, tuyereCountOneSide)
  const tuyereFullOxygenCapacityNm3h = calculateTuyereOxygenPerTuyereNm3h(oxygenNm3h, tuyereCount)
  const tuyereOxygenNm3h = tuyereFullOxygenCapacityNm3h

  return {
    dailyFeedTd,
    areaM2,
    furnaceLengthM,
    furnaceWidthM,
    designLengthM,
    designAreaM2,
    jacketPitchMm,
    jacketCountTotal,
    jacketCountOneSide,
    jacketRemainderMm,
    jacketRemainderDecision,
    oxygenNm3h,
    tuyereOxygenNm3h,
    tuyereCount,
    tuyereCountOneSide,
    tuyereOneSideOxygenCapacityNm3h,
    tuyereFullOxygenCapacityNm3h,
  }
}
