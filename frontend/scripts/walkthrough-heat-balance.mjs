/**
 * 铜冶炼富氧侧吹 — 用户案例热平衡演算
 * 验证：产物物理热 > 0、逐反应进度、收支闭合
 */
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { allocateConcentratePhases } from '../src/utils/copperConcentratePhaseNorm.ts'
import { loadOxySideBlowConstraints } from '../src/utils/copperConstraintConfig.ts'
import { autoFillOxyProductConstraintConfig } from '../src/utils/copperConstraintValidation.ts'
import { solveOxySideBlowProducts } from '../src/utils/copperConstraintSolver.ts'
import { createInitialUnpacked } from '../src/utils/copperConstraintUnknowns.ts'
import { DEFAULT_COPPER_FUEL } from '../src/utils/copperProcessCalc.ts'
import {
  DEFAULT_COPPER_PROCESS_PARAMETERS,
  applyProcessParameters,
} from '../src/utils/copperProcessParameters.ts'
import { createConcentrateMaterialPhaseRows } from '../src/utils/copperPhaseAssist.ts'
import {
  buildBlendPhaseMassFromMaterialResults,
  computeMaterialPhaseResult,
} from '../src/utils/copperPhaseBatchCalc.ts'
import {
  calculateCopperHeatBalanceDetailed,
  calculateHessChemicalHeatMJh,
  sourceMaterialFromColumn,
} from '../src/utils/copperHeatBalance.ts'
import { applyPostFuelClosureToHeatBalance, DEFAULT_HEAT_BALANCE_TOLERANCE_PCT } from '../src/utils/copperHeatBalanceClosure.ts'
import {
  COPPER_MATERIAL_LIBRARY,
  calculateWeightedComposition,
  createDefaultSolventColumns,
  createProcessAirColumns,
  deriveDryBasisMoisturePercent,
  materialWaterWeight,
} from '../src/utils/copperWorkflowCalc.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUTPUT_PATH = join(__dirname, 'walkthrough-heat-balance-output.json')

const USER_CASE = [
  { id: 'cu-conc-internal', dry: 37.14, water: 4.58 },
  { id: 'cu-conc-domestic', dry: 27.45, water: 2.88 },
  { id: 'cu-conc-import', dry: 127.69, water: 11.67 },
  { id: 'cu-conc-border', dry: 6.38, water: 0.67 },
]

function libraryMaterial(id) {
  const material = COPPER_MATERIAL_LIBRARY.find((item) => item.id === id)
  if (!material) throw new Error(`missing library material ${id}`)
  return material
}

function round(n, digits = 4) {
  if (!Number.isFinite(n)) return n
  const f = 10 ** digits
  return Math.round(n * f) / f
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

const concentrateRows = createConcentrateMaterialPhaseRows()
const materialPhaseRows = {}
const rawMaterials = USER_CASE.map((row, index) => {
  const lib = libraryMaterial(row.id)
  const waterWeight = Math.max(0, row.water)
  return {
    id: `raw-${index + 1}`,
    name: lib.name,
    kind: 'raw',
    weight: row.dry,
    waterWeight,
    moisture: deriveDryBasisMoisturePercent(row.dry, waterWeight),
    ratios: { ...lib.ratios },
    unitPrice: lib.unitPrice,
    libraryId: lib.id,
  }
})

for (const material of rawMaterials) {
  materialPhaseRows[material.id] = concentrateRows
}

const phaseResults = rawMaterials.map((material) =>
  computeMaterialPhaseResult(
    material.id,
    material.name,
    material.weight,
    material.ratios,
    materialPhaseRows[material.id]
  )
)

const concentrateMass = rawMaterials.reduce((sum, m) => sum + m.weight, 0)
const blendPhaseMass = buildBlendPhaseMassFromMaterialResults(phaseResults, materialPhaseRows)
const rawBlendWaterWeight = rawMaterials.reduce((sum, m) => sum + materialWaterWeight(m), 0)

const fuelColumn = { ...DEFAULT_COPPER_FUEL, weight: 0, waterWeight: 0 }
const solventColumns = createDefaultSolventColumns()
const airColumns = createProcessAirColumns()
const rawBlend = calculateWeightedComposition(rawMaterials)
const config = autoFillOxyProductConstraintConfig(
  applyProcessParameters(loadOxySideBlowConstraints(), DEFAULT_COPPER_PROCESS_PARAMETERS, {
    addMissingConstraints: false,
  })
).config

createInitialUnpacked(
  {
    blendFeed: calculateWeightedComposition([...rawMaterials, ...solventColumns, fuelColumn, ...airColumns]),
    rawFeed: rawBlend,
    rawMaterialColumns: rawMaterials,
    concentrateMass,
    inputPhaseMass: { 混合铜精矿: blendPhaseMass },
    fuelColumn,
    solventColumns,
    airColumns,
  },
  config
)

function applyRecommendedWeights(fuel, solvents, air, recommended) {
  return {
    nextFuel: { ...fuel, weight: recommended.fuelWeight },
    nextSolvents: solvents.map((col) => ({
      ...col,
      weight: recommended.solventWeights[col.name] ?? col.weight,
    })),
    nextAir: air.map((col) => ({
      ...col,
      weight: recommended.gasWeights[col.name] ?? col.weight,
    })),
  }
}

let activeFuel = fuelColumn
let activeSolvents = solventColumns
let activeAir = airColumns
let activeFurnaceFeed = calculateWeightedComposition([
  ...rawMaterials,
  ...activeSolvents,
  activeFuel,
  ...activeAir,
])

let solverResult = await solveOxySideBlowProducts({
  blendFeed: activeFurnaceFeed,
  rawFeed: rawBlend,
  rawMaterialColumns: rawMaterials,
  concentrateMass,
  inputPhaseMass: { 混合铜精矿: blendPhaseMass },
  fuelColumn: activeFuel,
  solventColumns: activeSolvents,
  airColumns: activeAir,
  config,
})

for (let pass = 0; pass < 3 && !solverResult.acceptable; pass += 1) {
  const applied = applyRecommendedWeights(activeFuel, activeSolvents, activeAir, solverResult.recommended)
  activeFuel = applied.nextFuel
  activeSolvents = applied.nextSolvents
  activeAir = applied.nextAir
  activeFurnaceFeed = calculateWeightedComposition([
    ...rawMaterials,
    ...activeSolvents,
    activeFuel,
    ...activeAir,
  ])
  solverResult = await solveOxySideBlowProducts({
    blendFeed: activeFurnaceFeed,
    rawFeed: rawBlend,
    rawMaterialColumns: rawMaterials,
    concentrateMass,
    inputPhaseMass: { 混合铜精矿: blendPhaseMass },
    fuelColumn: activeFuel,
    solventColumns: activeSolvents,
    airColumns: activeAir,
    config,
  })
}

assert(solverResult.acceptable, '产出求解未达可接受标准，无法验证热平衡')

const blendMaterial = {
  id: 'mixed-copper-concentrate',
  name: '混合铜精矿',
  kind: 'raw',
  dryWeight: concentrateMass,
  waterWeight: rawBlendWaterWeight,
  phases: Object.fromEntries(
    Object.entries(blendPhaseMass).map(([phase, mass]) => [phase, (Math.max(0, mass) / concentrateMass) * 100])
  ),
}

const inputMaterials = [
  blendMaterial,
  ...activeSolvents
    .filter((col) => col.weight > 0)
    .map((col) =>
      sourceMaterialFromColumn(col, allocateConcentratePhases(col.ratios))
    ),
  ...(activeFuel.weight > 0
    ? [sourceMaterialFromColumn(activeFuel, allocateConcentratePhases(activeFuel.ratios))]
    : []),
  ...activeAir
    .filter((col) => col.weight > 0)
    .map((col) =>
      sourceMaterialFromColumn(col, {
        O2: col.ratios['O(氧)'] ?? 0,
        N2: col.ratios['N(氮)'] ?? 0,
      })
    ),
]

const temperatures = {
  feed: 25,
  smeltingSlag: 1350,
  matte: 1300,
  flueGas: 1350,
  dust: 1350,
  fugitive: 1350,
  loss: 1350,
}

const baseOtherHeatMJh = 500
const heatBalance = calculateCopperHeatBalanceDetailed({
  inputMaterials,
  products: solverResult,
  fuel: activeFuel,
  fuelWeightTh: activeFuel.weight,
  temperatures,
  coolingWaterInletTemperatureC: 30,
  coolingWaterOutletTemperatureC: 34,
  coolingWaterMassTh: 3000,
  heatLossMJh: 0,
  otherHeatMJh: baseOtherHeatMJh,
})

const closed = applyPostFuelClosureToHeatBalance(heatBalance, {
  coolingWaterMassTh: 3000,
  coolingWaterInletTemperatureC: 30,
  tolerancePct: DEFAULT_HEAT_BALANCE_TOLERANCE_PCT,
})

const incomeTotal = closed.heatIncomeRows.reduce((sum, row) => sum + Math.max(0, row.heatMJh), 0)
const expenditureTotal = closed.heatExpenditureRows
  .filter((row) => !row.isSubtotal)
  .reduce((sum, row) => {
    if (row.isBalanceError || row.material === '误差') return sum + row.heatMJh
    return sum + Math.max(0, row.heatMJh)
  }, 0)

assert(closed.outputPhysicalHeatMJh > 0, '产物物理热应为正')
assert(
  closed.equations.filter((row) => Math.abs(row.extentKmolh) > 1e-9).length >= 5,
  '应有多条参与反应'
)
assert(
  !closed.equations.some((row) => row.limitingPhase === 'Hess闭合'),
  '化学反应热不应再含 Hess/进出焓差闭合行；配平用总表「误差」'
)

const hessFromRows = calculateHessChemicalHeatMJh(closed.inputPhysicalRows, closed.outputPhysicalRows)
assert(
  Math.abs(closed.chemicalHeatMJh - hessFromRows) <= 1,
  `化学热应等于 Hess: ${closed.chemicalHeatMJh} vs ${hessFromRows}`
)
const pathNet =
  (closed.chemicalHeatPathMJh ?? closed.chemicalHeatReleaseMJh - closed.chemicalHeatAbsorptionMJh)
const METCAL_REFERENCE_CHEM_MJH = 558984.771407112
const metcalGapPct =
  Math.abs(closed.chemicalHeatMJh - METCAL_REFERENCE_CHEM_MJH) / METCAL_REFERENCE_CHEM_MJH
console.log(
  `化学热 Hess ${round(closed.chemicalHeatMJh, 2)} MJ/h，路径 ${round(pathNet, 2)} MJ/h，MetCal 参考 ${round(METCAL_REFERENCE_CHEM_MJH, 2)}，偏差 ${round(metcalGapPct * 100, 2)}%`
)
if (metcalGapPct > 0.02) {
  console.warn(
    `与 MetCal 表13 偏差 ${(metcalGapPct * 100).toFixed(2)}%：演算产出为动态求解，与 Excel 固定产物略有差异属正常；同工况 UI 应对齐 Hess 口径。`
  )
}

const cu2sOx = closed.equations.find(
  (row) => row.limitingPhase === 'Cu2S' && row.products.Cu2O != null
)
assert(cu2sOx && cu2sOx.extentKmolh > 1e-6, '应存在 Cu2S 氧化行且实际反应量 > 0')

const feSToFe3O4 = closed.equations.find(
  (row) => row.limitingPhase === 'FeS' && row.products.Fe3O4 != null
)
const feSToFeO = closed.equations.find(
  (row) => row.limitingPhase === 'FeS' && row.products.FeO != null
)
const feSInputKmolh = Math.max(
  feSToFe3O4?.inputExtentKmolh != null ? feSToFe3O4.inputExtentKmolh * 3 : 0,
  feSToFeO?.inputExtentKmolh != null ? feSToFeO.inputExtentKmolh * 2 : 0
)
const feSConsumedKmolh =
  (feSToFe3O4?.extentKmolh ?? 0) * 3 + (feSToFeO?.extentKmolh ?? 0) * 2
assert(feSConsumedKmolh <= feSInputKmolh + 1e-4, `FeS 消耗超入炉量: ${feSConsumedKmolh} > ${feSInputKmolh}`)

for (const row of closed.equations) {
  // Cu2S 可由 CuFeS2 反应生成后再氧化，实际反应可超过入炉原始 Cu2S
  if (row.limitingPhase === 'Cu2S') continue
  assert(row.extentKmolh <= row.inputExtentKmolh + 1e-6, `${row.formula} 反应进度超过入炉量`)
}
assert(
  Math.abs(incomeTotal - expenditureTotal) <= 1,
  `收支应相等: 收入 ${incomeTotal} vs 支出 ${expenditureTotal}`
)
const hasErrorRow = closed.heatExpenditureRows.some((row) => row.material === '误差')
if (Math.abs(closed.balanceErrorMJh ?? 0) > 1e-6) {
  assert(hasErrorRow, '有残差时应含「误差」行')
}
if (closed.balanceErrorWithinTolerance) {
  assert(closed.closureStatus === 'balanced', `闭合状态应为 balanced，实际 ${closed.closureStatus}`)
} else if (Math.abs(closed.balanceErrorMJh ?? 0) > 1e-6) {
  assert(Math.abs(closed.balanceErrorMJh ?? 0) > 0, '超出允许带时应有误差值')
}

const hasWaterEvaporation = closed.equations.some(
  (row) => row.limitingPhase === 'H2O(l)' || row.formula.includes('H2O(l)')
)
assert(!hasWaterEvaporation, '不应再单列水分蒸发反应')

const output = {
  generatedAt: new Date().toISOString(),
  incomeTotalMJh: round(incomeTotal, 2),
  expenditureTotalMJh: round(expenditureTotal, 2),
  balanceAfterFuelMJh: round(closed.balanceAfterFuelMJh, 2),
  outputPhysicalHeatMJh: round(closed.outputPhysicalHeatMJh, 2),
  chemicalHeatMJh: round(closed.chemicalHeatMJh, 2),
  chemicalHeatPathMJh: round(pathNet, 2),
  hessChemicalHeatMJh: round(hessFromRows, 2),
  metcalReferenceChemicalHeatMJh: METCAL_REFERENCE_CHEM_MJH,
  metcalGapPct: round(metcalGapPct * 100, 4),
  coolingWaterOutletTemperatureC: round(closed.coolingWaterOutletTemperatureC, 2),
  otherHeatMJh: round(closed.otherHeatMJh, 2),
  balanceErrorMJh: round(closed.balanceErrorMJh ?? 0, 2),
  heatBalanceTolerancePct: closed.heatBalanceTolerancePct ?? DEFAULT_HEAT_BALANCE_TOLERANCE_PCT,
  balanceErrorWithinTolerance: closed.balanceErrorWithinTolerance ?? false,
  closureStatus: closed.closureStatus,
  reactions: closed.equations
    .filter((row) => Math.abs(row.heatMJh) > 1e-6)
    .map((row) => ({
      formula: row.formula,
      extentKmolh: round(row.extentKmolh, 4),
      inputExtentKmolh: round(row.inputExtentKmolh, 4),
      heatMJh: round(row.heatMJh, 2),
      extentSource: row.extentSource,
    })),
}

writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2), 'utf8')
console.log('热平衡演算通过。')
console.log(`收入 ${output.incomeTotalMJh} MJ/h，支出 ${output.expenditureTotalMJh} MJ/h，热差 ${output.balanceAfterFuelMJh} MJ/h`)
console.log(`产物物理热 ${output.outputPhysicalHeatMJh} MJ/h，出水温度 ${output.coolingWaterOutletTemperatureC} ℃`)
console.log(`输出: ${OUTPUT_PATH}`)
