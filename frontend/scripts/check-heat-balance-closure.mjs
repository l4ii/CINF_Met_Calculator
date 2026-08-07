import { applyPostFuelClosureToHeatBalance, hessFuelSearchResidualMJh } from '../src/utils/copperHeatBalanceClosure.ts'
import { calculateCoolingWaterHeatMJh } from '../src/utils/copperHeatBalance.ts'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function baseResult(overrides = {}) {
  const coolingWaterInletTemperatureC = 30
  const coolingWaterOutletTemperatureC = 40
  const coolingWaterMassTh = 10
  const coolingWaterHeatMJh = calculateCoolingWaterHeatMJh(
    coolingWaterMassTh,
    coolingWaterInletTemperatureC,
    coolingWaterOutletTemperatureC
  )
  const inputPhysicalHeatMJh = 100
  const outputPhysicalHeatMJh = 500
  const chemicalHeatMJh = 1000
  const otherHeatMJh = 100
  const heatDeficitMJh = outputPhysicalHeatMJh + coolingWaterHeatMJh + otherHeatMJh -
    (inputPhysicalHeatMJh + chemicalHeatMJh)

  return {
    process: 'smelting',
    equations: [],
    chemicalAbsorptionRows: [],
    heatIncomeRows: [],
    heatExpenditureRows: [],
    inputPhysicalRows: [],
    outputPhysicalRows: [],
    inputPhysicalHeatMJh,
    outputPhysicalHeatMJh,
    chemicalHeatMJh,
    chemicalHeatHessMJh: chemicalHeatMJh,
    chemicalHeatReleaseMJh: chemicalHeatMJh,
    chemicalHeatAbsorptionMJh: 0,
    chemicalHeatPathMJh: chemicalHeatMJh,
    chemicalHeatMode: 'hess',
    chemicalHeatCalculationBasis: 'stream298',
    coolingWaterHeatMJh,
    coolingWaterRows: [],
    coolingWaterInletTemperatureC,
    coolingWaterOutletTemperatureC,
    coolingWaterMassTh,
    heatLossMJh: 0,
    otherHeatMJh,
    heatDeficitMJh,
    requiredFuelWeight: 0,
    fuelCombustionHeatMJh: 0,
    supplementalFuelHeatMJh: 0,
    fuelEffectiveHeatMJh: 0,
    balanceAfterFuelMJh: -heatDeficitMJh,
    fuelHeatMJt: 0,
    balanceClosureMode: 'none',
    balanceClosureHeatMJh: 0,
    ...overrides,
  }
}

function assertClosedWithoutErrorRow(result, label) {
  assert(Math.abs(result.balanceAfterFuelMJh) <= 1e-6, `${label} 未精确闭合`)
  assert(result.closureStatus === 'balanced', `${label} 状态不是 balanced`)
  assert(
    !result.heatExpenditureRows.some((row) => row.isBalanceError || row.material === '误差'),
    `${label} 不应生成误差配平行`
  )
}

const hess = applyPostFuelClosureToHeatBalance(baseResult(), {
  coolingWaterMassTh: 10,
  coolingWaterInletTemperatureC: 30,
  chemicalHeatMode: 'hess',
})
assertClosedWithoutErrorRow(hess, 'Hess')
assert(hess.coolingWaterOutletTemperatureC > 38, 'Hess 出口温度不应受旧 38℃ 上限约束')
assert(hess.balanceClosureMode === 'coolingWater', 'Hess 应使用冷却水闭合')

const reaction = applyPostFuelClosureToHeatBalance(baseResult({ chemicalHeatMode: 'reaction' }), {
  coolingWaterMassTh: 10,
  coolingWaterInletTemperatureC: 30,
  chemicalHeatMode: 'reaction',
})
assertClosedWithoutErrorRow(reaction, '熔炼化学反应法')
assert(reaction.coolingWaterOutletTemperatureC === 40, '熔炼化学反应法应保持固定冷却水出口温度')
assert(Math.abs(reaction.otherHeatMJh - 181.6) <= 1e-6, '熔炼化学反应法应由热差反算自然散热')
assert(reaction.balanceClosureMode === 'otherHeat', '熔炼化学反应法应使用自然散热闭合')

const convertingReaction = applyPostFuelClosureToHeatBalance(
  baseResult({ process: 'converting', chemicalHeatMode: 'reaction' }),
  {
    coolingWaterMassTh: 10,
    coolingWaterInletTemperatureC: 30,
    chemicalHeatMode: 'reaction',
    closeWithCoolingWater: true,
  }
)
assertClosedWithoutErrorRow(convertingReaction, '吹炼化学反应法')
assert(convertingReaction.balanceClosureMode === 'coolingWater', '吹炼化学反应法应使用冷却水闭合')

assert(
  hessFuelSearchResidualMJh(baseResult(), { coolingWaterMassTh: 10 }) === 0,
  '有冷却水时，Hess 热盈余应交给自动出口温度闭合'
)

console.log(JSON.stringify({
  hessOutletTemperatureC: hess.coolingWaterOutletTemperatureC,
  reactionNaturalHeatMJh: reaction.otherHeatMJh,
  convertingReactionOutletTemperatureC: convertingReaction.coolingWaterOutletTemperatureC,
}, null, 2))
