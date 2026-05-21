import assert from 'node:assert/strict'

const { calculateCopperEquipmentSizing, normalizeScaleWanTpa } = await import('./copperEquipmentSizing.ts')

assert.equal(normalizeScaleWanTpa('10'), 10)
assert.equal(normalizeScaleWanTpa(''), 10)
assert.equal(normalizeScaleWanTpa('-2'), 10)

const result = calculateCopperEquipmentSizing({
  currentThroughput: 50,
  annualHours: 7200,
  targetScaleWanTpa: 20,
  adjustmentFactor: 1.1,
  unitThroughput: 32,
})

assert.equal(Number(result.currentAnnualWanTpa.toFixed(3)), 36)
assert.equal(Number(result.scaleFactor.toFixed(3)), 0.556)
assert.equal(Number(result.targetThroughput.toFixed(3)), 27.778)
assert.equal(Number(result.adjustedThroughput.toFixed(3)), 30.556)
assert.equal(result.recommendedUnits, 1)

const highLoad = calculateCopperEquipmentSizing({
  currentThroughput: 120,
  annualHours: 7200,
  targetScaleWanTpa: 50,
  adjustmentFactor: 1,
  unitThroughput: 20,
})

assert.equal(highLoad.recommendedUnits, 4)

console.log('Copper equipment sizing checks passed')
