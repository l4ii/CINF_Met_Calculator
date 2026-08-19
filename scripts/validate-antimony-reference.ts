import { loadOxySideBlowConstraints } from '../frontend/src/utils/antimonyConstraintConfig.ts'
import {
  ANTIMONY_REFERENCE_PRODUCT_MASSES,
  ANTIMONY_REFERENCE_PHASE_PCT,
  solveOxySideBlowProducts,
} from '../frontend/src/utils/antimonyConstraintSolver.ts'
import {
  buildBlendPhaseMassFromMaterialResults,
  computeMaterialPhaseResult,
} from '../frontend/src/utils/antimonyPhaseBatchCalc.ts'
import { createConcentrateMaterialPhaseRows } from '../frontend/src/utils/antimonyPhaseAssist.ts'
import { DEFAULT_ANTIMONY_FUEL } from '../frontend/src/utils/antimonyProcessCalc.ts'
import { calculateAntimonyHeatBalanceDetailed } from '../frontend/src/utils/antimonyHeatBalance.ts'
import { buildSmeltingHeatBalanceSourceMaterials } from '../frontend/src/components/modules/antimony/smelting/smeltingHeatBalanceMaterials.ts'
import {
  calculateWeightedComposition,
  calculateAssayDisplayTotal,
  createDefaultAntimonyMaterials,
  createDefaultSolventColumns,
  createProcessAirColumns,
} from '../frontend/src/utils/antimonyWorkflowCalc.ts'

const MAX_PRODUCT_RELATIVE_ERROR = 0.015
const MAX_HEAT_RELATIVE_ERROR = 0.015
const MAX_REFERENCE_HEAT_CLOSURE_ABS_MJH = 250

const ANTIMONY_REFERENCE_HEAT_BALANCE = {
  chemicalHeatMJh: 15159.3747663232,
  outputPhysicalHeatMJh: 12602.7846094032,
  coolingWaterHeatMJh: 1798.6214186039,
  heatLossMJh: 757.968738316164,
  otherHeatMJh: 0,
} as const

const ANTIMONY_REFERENCE_INPUT_PHASE_PCT = {
  Sb2S3: 83.0325749846148,
  Sb2O3: 1.78168497741081,
  FeS: 2.15825878472462,
  PbS: 0.392846196712176,
  As2S2: 0.839083472438652,
  ZnS: 0.107552043091459,
  CuS: 0.0310209569753999,
  Bi2S3: 0.01014529710644,
  SiO2: 7.16494845360825,
  CaO: 1.72164948453608,
  Al2O3: 1.35051546391753,
  Ag: 0.00381443298969072,
  Au: 0.00278350515463917,
  Other: 1.40312194671941,
} as const

async function main() {
  const rawMaterials = createDefaultAntimonyMaterials()
  const concentrate = rawMaterials.find((material) => material.weight > 0)
  if (!concentrate) throw new Error('默认锑精矿缺失')
  const concentrateAssayTotal = calculateAssayDisplayTotal(concentrate.ratios)
  if (Math.abs(concentrateAssayTotal - 100) > 1e-8) {
    throw new Error(`默认锑精矿元素合计 ${concentrateAssayTotal}%，未闭合到 100%`)
  }

  const concentrateRows = createConcentrateMaterialPhaseRows()
  const phaseResult = computeMaterialPhaseResult(
    concentrate.id,
    concentrate.name,
    concentrate.weight,
    concentrate.ratios,
    concentrateRows
  )
  if (!phaseResult.valid) throw new Error(phaseResult.message ?? '默认锑精矿物相计算失败')
  const concentratePhaseTotal = Object.values(phaseResult.phaseContents).reduce((sum, value) => sum + value, 0)
  if (Math.abs(concentratePhaseTotal - 100) > 1e-6) {
    throw new Error(
      `默认锑精矿物相合计 ${concentratePhaseTotal}%，未闭合到 100%：${JSON.stringify(phaseResult.phaseContents)}`
    )
  }
  const concentratePhaseByFormula = Object.fromEntries(
    Object.entries(phaseResult.phaseContents).map(([key, value]) => [key.replace(/^custom:/, ''), value])
  )
  for (const [phase, expected] of Object.entries(ANTIMONY_REFERENCE_INPUT_PHASE_PCT)) {
    const actual = concentratePhaseByFormula[phase] ?? 0
    if (Math.abs(actual - expected) > 0.05) {
      throw new Error(`默认锑精矿 ${phase}=${actual}%，与工作簿 ${expected}% 偏差超过 0.05 个百分点`)
    }
  }

  const inputPhaseMass = {
    混合锑精矿: buildBlendPhaseMassFromMaterialResults(
      [phaseResult],
      { [concentrate.id]: concentrateRows }
    ),
  }
  const rawFeed = calculateWeightedComposition(rawMaterials)
  const solventColumns = createDefaultSolventColumns()
  const airColumns = createProcessAirColumns()
  const fuelColumn = { ...DEFAULT_ANTIMONY_FUEL, ratios: { ...DEFAULT_ANTIMONY_FUEL.ratios } }
  const result = await solveOxySideBlowProducts({
    blendFeed: calculateWeightedComposition([
      ...rawMaterials,
      ...solventColumns,
      fuelColumn,
      ...airColumns,
    ]),
    rawFeed,
    rawMaterialColumns: rawMaterials,
    concentrateMass: concentrate.weight,
    inputPhaseMass,
    fuelColumn,
    solventColumns,
    airColumns,
    config: loadOxySideBlowConstraints(),
  })

  if (!result.acceptable) {
    throw new Error(`锑基准求解未通过：${result.message ?? result.acceptanceLevel}`)
  }

  const productComparison = Object.fromEntries(
    Object.entries(ANTIMONY_REFERENCE_PRODUCT_MASSES).map(([key, expected]) => {
      const actual = result.products[key as keyof typeof result.products].mass
      const relativeError = expected > 0 ? (actual - expected) / expected : actual
      if (Math.abs(relativeError) > MAX_PRODUCT_RELATIVE_ERROR) {
        throw new Error(`${key} 相对 Excel 偏差 ${(relativeError * 100).toFixed(3)}% 超过 1.5%`)
      }
      return [key, { actual, expected, relativeError }]
    })
  )

  const gasMass = Object.values(result.recommended.gasWeights).reduce((sum, value) => sum + value, 0)
  const solvedSolventColumns = solventColumns.map((column) => ({
    ...column,
    weight: result.recommended.solventWeights[column.name] ?? column.weight,
  }))
  const solvedAirColumns = airColumns.map((column) => ({
    ...column,
    weight: result.recommended.gasWeights[column.name] ?? column.weight,
  }))
  const solvedFuelColumn = {
    ...fuelColumn,
    weight: result.recommended.fuelWeight,
    waterWeight: result.recommended.fuelWaterWeight,
    moisture: result.recommended.fuelMoisture,
  }
  const referenceProductResult = structuredClone(result)
  for (const [productKey, product] of Object.entries(referenceProductResult.products)) {
    const key = productKey as keyof typeof ANTIMONY_REFERENCE_PRODUCT_MASSES
    const mass = ANTIMONY_REFERENCE_PRODUCT_MASSES[key]
    product.mass = mass
    product.phases = Object.entries(ANTIMONY_REFERENCE_PHASE_PCT[key]).map(([phaseKey, pct]) => ({
      key: phaseKey,
      mass: mass * pct / 100,
      pct,
    }))
  }
  const heatBalance = calculateAntimonyHeatBalanceDetailed({
    inputMaterials: buildSmeltingHeatBalanceSourceMaterials({
      rawMaterials,
      solventColumns: solvedSolventColumns,
      fuelColumn: solvedFuelColumn,
      airColumns: solvedAirColumns,
      phaseBatchResults: { [concentrate.id]: phaseResult },
      materialPhaseRows: { [concentrate.id]: concentrateRows },
      concentrateMass: concentrate.weight,
    }),
    products: result,
    fuel: solvedFuelColumn,
    fuelWeightTh: solvedFuelColumn.weight,
    ratioReferenceFuelWeightTh: solvedFuelColumn.weight,
    chemicalHeatMode: 'hess',
    process: 'smelting',
    temperatures: {
      feed: 25,
      smeltingSlag: 1150,
      matte: 1150,
      flueGas: 1100,
      dust: 1100,
      fugitive: 1100,
      loss: 1150,
    },
    coolingWaterInletTemperatureC: 25,
    coolingWaterOutletTemperatureC: 35,
    coolingWaterMassTh: 42.98808361864,
    heatLossMJh: 0,
    otherHeatMJh: 0,
  })
  const exactReferenceHeatBalance = calculateAntimonyHeatBalanceDetailed({
    inputMaterials: buildSmeltingHeatBalanceSourceMaterials({
      rawMaterials,
      solventColumns: solvedSolventColumns,
      fuelColumn: solvedFuelColumn,
      airColumns: solvedAirColumns,
      phaseBatchResults: { [concentrate.id]: phaseResult },
      materialPhaseRows: { [concentrate.id]: concentrateRows },
      concentrateMass: concentrate.weight,
    }),
    products: referenceProductResult,
    fuel: solvedFuelColumn,
    fuelWeightTh: solvedFuelColumn.weight,
    ratioReferenceFuelWeightTh: solvedFuelColumn.weight,
    chemicalHeatMode: 'hess',
    process: 'smelting',
    temperatures: {
      feed: 25,
      smeltingSlag: 1150,
      matte: 1150,
      flueGas: 1100,
      dust: 1100,
      fugitive: 1100,
      loss: 1150,
    },
    coolingWaterInletTemperatureC: 25,
    coolingWaterOutletTemperatureC: 35,
    coolingWaterMassTh: 42.98808361864,
    heatLossMJh: 0,
    otherHeatMJh: 0,
  })
  const heatComparison = Object.fromEntries(
    Object.entries(ANTIMONY_REFERENCE_HEAT_BALANCE).map(([key, expected]) => {
      const actual = heatBalance[key as keyof typeof ANTIMONY_REFERENCE_HEAT_BALANCE]
      return [key, { actual, expected, relativeError: expected > 0 ? (actual - expected) / expected : actual }]
    })
  )
  for (const [key, comparison] of Object.entries(heatComparison)) {
    if (Math.abs(comparison.relativeError) > MAX_HEAT_RELATIVE_ERROR) {
      throw new Error(`${key} 相对 Excel 偏差 ${(comparison.relativeError * 100).toFixed(3)}% 超过 1.5%`)
    }
  }
  if (Math.abs(heatBalance.balanceAfterFuelMJh) > MAX_REFERENCE_HEAT_CLOSURE_ABS_MJH) {
    throw new Error(`基准热平衡未闭合，余差 ${heatBalance.balanceAfterFuelMJh.toFixed(3)} MJ/h`)
  }
  const summary = {
    acceptanceLevel: result.acceptanceLevel,
    maxRelativeResidual: result.maxRelativeResidual,
    inputs: {
      wetConcentrate: rawFeed.totalWeight,
      dryConcentrate: concentrate.weight,
      fuel: result.recommended.fuelWeight,
      solvents: result.recommended.solventWeights,
      enrichedGas: gasMass,
      gases: result.recommended.gasWeights,
    },
    closure: {
      concentrateAssayTotal,
      concentratePhaseTotal,
      concentratePhaseByFormula,
    },
    productComparison,
    keyProductPhases: {
      slag: Object.fromEntries(result.products.smeltingSlag.phases.map((phase) => [phase.key, phase.pct])),
      gas: Object.fromEntries(result.products.flueGas.phases.map((phase) => [phase.key, phase.pct])),
      dust: Object.fromEntries(result.products.dust.phases.map((phase) => [phase.key, phase.pct])),
      matte: Object.fromEntries(result.products.matte.phases.map((phase) => [phase.key, phase.pct])),
      nobleAntimony: Object.fromEntries(result.products.loss.phases.map((phase) => [phase.key, phase.pct])),
    },
    heatComparison,
    heatClosure: {
      balanceAfterFuelMJh: heatBalance.balanceAfterFuelMJh,
      closureStatus: heatBalance.closureStatus,
    },
    exactReferenceHeat: {
      chemicalHeatMJh: exactReferenceHeatBalance.chemicalHeatMJh,
      outputPhysicalHeatMJh: exactReferenceHeatBalance.outputPhysicalHeatMJh,
      heatLossMJh: exactReferenceHeatBalance.heatLossMJh,
      balanceAfterFuelMJh: exactReferenceHeatBalance.balanceAfterFuelMJh,
      productPhysicalHeat: Object.fromEntries(
        Object.values(referenceProductResult.products).map((product) => [
          product.name,
          exactReferenceHeatBalance.outputPhysicalRows
            .filter((row) => row.productKey === product.key)
            .reduce((sum, row) => sum + row.heatMJh, 0),
        ])
      ),
    },
  }
  console.log(JSON.stringify(summary, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
