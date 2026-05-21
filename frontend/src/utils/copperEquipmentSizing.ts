export interface CopperEquipmentSizingInput {
  currentThroughput: number
  annualHours: number
  targetScaleWanTpa: number
  adjustmentFactor: number
  unitThroughput: number
}

export interface CopperEquipmentSizingResult {
  currentAnnualWanTpa: number
  targetThroughput: number
  scaleFactor: number
  adjustedThroughput: number
  recommendedUnits: number
}

export function normalizeScaleWanTpa(value: string | number, fallback = 10) {
  const parsed = typeof value === 'number' ? value : Number(String(value).replace(',', '.'))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export function calculateCopperEquipmentSizing({
  currentThroughput,
  annualHours,
  targetScaleWanTpa,
  adjustmentFactor,
  unitThroughput,
}: CopperEquipmentSizingInput): CopperEquipmentSizingResult {
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
