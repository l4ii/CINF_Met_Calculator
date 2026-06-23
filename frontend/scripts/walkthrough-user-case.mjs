/**
 * 铜冶炼富氧侧吹 — 用户案例演算脚本
 * 输入：四矿干量/含水 t/h + 内置化验 + 默认熔剂/煤/气
 * 输出：walkthrough-user-case-output.json（供演算文档生成）
 */
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { atomicMass } from '../src/utils/atomicMass.ts'
import { allocateConcentratePhases } from '../src/utils/copperConcentratePhaseNorm.ts'
import { loadOxySideBlowConstraints, OXY_SIDE_BLOW_PRODUCT_KEYS } from '../src/utils/copperConstraintConfig.ts'
import { solveOxySideBlowProducts } from '../src/utils/copperConstraintSolver.ts'
import { createInitialUnpacked, resolveFuelConcentrateRatioTarget } from '../src/utils/copperConstraintUnknowns.ts'
import { DEFAULT_COPPER_FUEL } from '../src/utils/copperProcessCalc.ts'
import { createConcentrateMaterialPhaseRows } from '../src/utils/copperPhaseAssist.ts'
import {
  buildBlendPhaseMassFromMaterialResults,
  computeMaterialPhaseResult,
} from '../src/utils/copperPhaseBatchCalc.ts'
import {
  COPPER_ELEMENT_KEYS,
  COPPER_MATERIAL_LIBRARY,
  calculateWeightedComposition,
  calculateWeightedMoisture,
  createDefaultSolventColumns,
  createProcessAirColumns,
  deriveDryBasisMoisturePercent,
  materialWaterWeight,
  materialWetWeight,
  normalizeCopperRatios,
} from '../src/utils/copperWorkflowCalc.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUTPUT_PATH = join(__dirname, 'walkthrough-user-case-output.json')
const EQUATIONS_PATH = join(__dirname, 'walkthrough-user-case-equations.txt')

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

function pickRatios(ratios, keys) {
  const out = {}
  for (const key of keys) {
    out[key] = round(ratios[key] ?? 0, 4)
  }
  return out
}

const KEY_ASSAY_ELEMENTS = [
  'Cu(铜)',
  'Fe(铁)',
  'S (硫)',
  'SiO₂(二氧化硅)',
  'CaO(氧化钙)',
  'MgO(氧化镁)',
  'Al₂O₃(三氧化二铝)',
  'Pb(铅)',
  'Zn(锌)',
  'As(砷)',
  'C (碳)',
  'Other(其他)',
]

const concentrateRows = createConcentrateMaterialPhaseRows()
const materialPhaseRows = {}

const rawMaterials = USER_CASE.map((row, index) => {
  const lib = libraryMaterial(row.id)
  const waterWeight = Math.max(0, row.water)
  const moisture = deriveDryBasisMoisturePercent(row.dry, waterWeight)
  return {
    id: `raw-${index + 1}`,
    name: lib.name,
    kind: 'raw',
    weight: row.dry,
    waterWeight,
    moisture,
    ratios: { ...lib.ratios },
    unitPrice: lib.unitPrice,
    libraryId: lib.id,
  }
})

for (const material of rawMaterials) {
  materialPhaseRows[material.id] = concentrateRows
}

const phaseResults = rawMaterials.map((material) => {
  const result = computeMaterialPhaseResult(
    material.id,
    material.name,
    material.weight,
    material.ratios,
    materialPhaseRows[material.id]
  )
  const normPhases = allocateConcentratePhases(material.ratios)
  const phaseMassTh = {}
  for (const [phase, pct] of Object.entries(result.phaseContents)) {
    phaseMassTh[phase] = round((pct / 100) * material.weight, 4)
  }
  const normPhaseMassTh = {}
  for (const [phase, pct] of Object.entries(normPhases)) {
    if (pct > 1e-9) normPhaseMassTh[phase] = round((pct / 100) * material.weight, 4)
  }
  return {
    materialId: material.id,
    materialName: material.name,
    libraryId: material.libraryId,
    dryWeight: material.weight,
    moisture: material.moisture,
    waterWeight: round(materialWaterWeight(material), 4),
    wetWeight: round(materialWetWeight(material), 4),
    assay: pickRatios(normalizeCopperRatios(material.ratios), KEY_ASSAY_ELEMENTS),
    normativePhasesPct: Object.fromEntries(
      Object.entries(normPhases)
        .filter(([, v]) => v > 1e-6)
        .map(([k, v]) => [k, round(v, 4)])
    ),
    phaseContentsPct: Object.fromEntries(
      Object.entries(result.phaseContents)
        .filter(([, v]) => v > 1e-6)
        .map(([k, v]) => [k, round(v, 4)])
    ),
    phaseMassTh,
    unknowns: {
      'O(氧)': round(result.unknowns['O(氧)'] ?? 0, 4),
      'C (碳)': round(result.unknowns['C (碳)'] ?? 0, 4),
      'Other(其他)': round(result.unknowns['Other(其他)'] ?? 0, 4),
    },
    valid: result.valid,
  }
})

const concentrateMass = rawMaterials.reduce((sum, m) => sum + m.weight, 0)
const totalWater = rawMaterials.reduce((sum, m) => sum + materialWaterWeight(m), 0)
const totalWet = rawMaterials.reduce((sum, m) => sum + materialWetWeight(m), 0)

const blendPhaseMass = buildBlendPhaseMassFromMaterialResults(
  phaseResults.map((p) => ({
    materialId: p.materialId,
    materialName: p.materialName,
    weight: p.dryWeight,
    phaseContents: Object.fromEntries(
      Object.entries(p.phaseContentsPct).map(([k, v]) => [k, v])
    ),
    unknowns: p.unknowns,
    valid: p.valid,
  })),
  materialPhaseRows
)

const roundedBlendPhaseMass = Object.fromEntries(
  Object.entries(blendPhaseMass)
    .filter(([, v]) => v > 1e-6)
    .map(([k, v]) => [k, round(v, 4)])
)

const fuelColumn = {
  ...DEFAULT_COPPER_FUEL,
  ratios: { ...DEFAULT_COPPER_FUEL.ratios },
  weight: 0,
  waterWeight: 0,
  moisture: DEFAULT_COPPER_FUEL.moisture,
}

const solventColumns = createDefaultSolventColumns()
const airColumns = createProcessAirColumns()

const rawBlend = calculateWeightedComposition(rawMaterials)
const furnaceFeed = calculateWeightedComposition([
  ...rawMaterials,
  ...solventColumns,
  fuelColumn,
  ...airColumns,
])

const config = loadOxySideBlowConstraints()
const initialUnpacked = createInitialUnpacked(
  {
    blendFeed: furnaceFeed,
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

const cuFeS2Mass = blendPhaseMass.CuFeS2 ?? 0
const feS2Mass = blendPhaseMass.FeS2 ?? 0
const cuFeS2S = cuFeS2Mass * 0.5346 // S fraction in CuFeS2 from stoichiometry ~53.46%
const feS2S = feS2Mass * 0.5338
const fuelCarbonMass = initialUnpacked.fuelMass * ((normalizeCopperRatios(fuelColumn.ratios)['C (碳)'] ?? 0) / 100)
const oxygenMolesTarget =
  cuFeS2S / atomicMass('S') / 4 + (feS2S / atomicMass('S') / 2) * 0.7 + (fuelCarbonMass / atomicMass('C')) * 0.7

function applyRecommendedWeights(fuel, solvents, air, recommended) {
  const nextFuel = { ...fuel, weight: recommended.fuelWeight }
  const nextSolvents = solvents.map((col) => ({
    ...col,
    weight: recommended.solventWeights[col.name] ?? col.weight,
  }))
  const nextAir = air.map((col) => ({
    ...col,
    weight: recommended.gasWeights[col.name] ?? col.weight,
  }))
  return { nextFuel, nextSolvents, nextAir }
}

let activeFuel = fuelColumn
let activeSolvents = solventColumns
let activeAir = airColumns
let activeFurnaceFeed = furnaceFeed
let solverResult = solveOxySideBlowProducts({
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

for (let pass = 0; pass < 2 && !solverResult.converged; pass += 1) {
  const applied = applyRecommendedWeights(
    activeFuel,
    activeSolvents,
    activeAir,
    solverResult.recommended
  )
  activeFuel = applied.nextFuel
  activeSolvents = applied.nextSolvents
  activeAir = applied.nextAir
  activeFurnaceFeed = calculateWeightedComposition([
    ...rawMaterials,
    ...activeSolvents,
    activeFuel,
    ...activeAir,
  ])
  solverResult = solveOxySideBlowProducts({
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

const furnaceFeedAfterSolve = activeFurnaceFeed

const gmc = config.variables?.GMC ?? 75
const fuelRatioTarget = resolveFuelConcentrateRatioTarget(config)
const initialFuelEstimate = concentrateMass * fuelRatioTarget
const matteSPercent = -0.125 * (gmc / 100) + 0.292
const matteFePercent = -0.825 * (gmc / 100) + 0.633

function elementWeightsSummary(comp) {
  const out = {}
  for (const key of COPPER_ELEMENT_KEYS) {
    const v = comp.elementWeights[key] ?? 0
    if (Math.abs(v) > 1e-6) out[key] = round(v, 4)
  }
  return out
}

function ratiosSummary(comp) {
  const out = {}
  for (const key of COPPER_ELEMENT_KEYS) {
    const v = comp.ratios[key] ?? 0
    if (Math.abs(v) > 1e-4) out[key] = round(v, 4)
  }
  return out
}

const productsOut = {}
for (const pk of OXY_SIDE_BLOW_PRODUCT_KEYS) {
  const p = solverResult.products[pk]
  productsOut[pk] = {
    name: p.name,
    mass: round(p.mass, 2),
    phases: p.phases
      .filter((ph) => ph.mass > 1e-4)
      .map((ph) => ({ key: ph.key, mass: round(ph.mass, 4), pct: round(ph.pct, 3) })),
    elementMass: Object.fromEntries(
      Object.entries(p.elementMass ?? {})
        .filter(([, v]) => Math.abs(v) > 1e-4)
        .map(([k, v]) => [k, round(v, 4)])
    ),
    composition: Object.fromEntries(
      Object.entries(p.composition ?? {})
        .filter(([, v]) => Math.abs(v) > 1e-3)
        .map(([k, v]) => [k, round(v, 3)])
    ),
  }
}

const output = {
  generatedAt: new Date().toISOString(),
  inputs: {
    materials: USER_CASE.map((row) => {
      const lib = libraryMaterial(row.id)
      return {
        libraryId: row.id,
        name: lib.name,
        dryTh: row.dry,
        waterTh: round(row.water, 4),
        moisturePct: round(deriveDryBasisMoisturePercent(row.dry, row.water), 4),
        wetTh: round(row.dry + row.water, 4),
      }
    }),
    concentrateMass: round(concentrateMass, 4),
    totalWaterTh: round(totalWater, 4),
    totalWetTh: round(totalWet, 4),
    weightedMoisturePct: round(calculateWeightedMoisture(rawMaterials), 4),
    gmc,
    fuelAssay: pickRatios(normalizeCopperRatios(fuelColumn.ratios), [
      'C (碳)',
      'H(氢)',
      'O(氧)',
      'S (硫)',
      'SiO₂(二氧化硅)',
      'Other(其他)',
    ]),
    fuelMoisturePct: fuelColumn.moisture,
    fuelLhvMJkg: fuelColumn.lowerHeatingValueMJkg,
    solvent: solventColumns.map((s) => ({
      name: s.name,
      composition: pickRatios(normalizeCopperRatios(s.ratios), KEY_ASSAY_ELEMENTS),
    })),
  },
  chapter2_phaseResults: phaseResults,
  chapter3_blendPhaseMass: roundedBlendPhaseMass,
  chapter4_composition: {
    rawBlend: {
      totalWeightTh: round(rawBlend.totalWeight, 4),
      elementWeights: elementWeightsSummary(rawBlend),
      ratios: ratiosSummary(rawBlend),
    },
    furnaceFeedBeforeSolve: {
      totalWeightTh: round(furnaceFeed.totalWeight, 4),
      elementWeights: elementWeightsSummary(furnaceFeed),
      ratios: ratiosSummary(furnaceFeed),
    },
    furnaceFeedAfterSolve: {
      totalWeightTh: round(furnaceFeedAfterSolve.totalWeight, 4),
      elementWeights: elementWeightsSummary(furnaceFeedAfterSolve),
      ratios: ratiosSummary(furnaceFeedAfterSolve),
    },
  },
  chapter5_hardConstraints: {
    coalRatio: {
      kind: 'soft',
      formula: `煤/精矿比目标 = ${fuelRatioTarget}（软约束，牛顿迭代求解）`,
      initialEstimateFormula: `煤初值 ≈ 混合铜精矿干重 × ${fuelRatioTarget}`,
      concentrateMass: round(concentrateMass, 4),
      fuelRatioTarget,
      initialFuelEstimate: round(initialFuelEstimate, 4),
      solvedFuelMass: round(solverResult.recommended.fuelWeight, 4),
      solvedRatio: round(solverResult.recommended.fuelWeight / concentrateMass, 6),
    },
    feedLeak: {
      formula: '加料口漏风 = 5.73 t/h（固定）',
      mass: round(initialUnpacked.gasMass['加料口漏风'] ?? 5.73, 4),
    },
    secondaryAir: {
      formula:
        'O₂_mol = CuFeS2.S/4 + FeS2.S/2×0.7 + 煤.C×0.7；二次风 = O₂_mol×1.02×M_O / w_O(二次风)',
      cuFeS2MassTh: round(cuFeS2Mass, 4),
      feS2MassTh: round(feS2Mass, 4),
      fuelCarbonMassTh: round(fuelCarbonMass, 4),
      oxygenMolesTarget: round(oxygenMolesTarget, 4),
      secondaryAirMassTh: round(initialUnpacked.gasMass['二次风'] ?? 0, 4),
    },
    matteGmc: {
      gmc,
      matteCuWPercent: gmc,
      matteSPercent: round(matteSPercent * 100, 3),
      matteFePercent: round(matteFePercent * 100, 3),
      formulas: {
        S: 'S% = -0.125 × GMC/100 + 0.292',
        Fe: 'Fe% = -0.825 × GMC/100 + 0.633',
        Cu: 'Cu W% = GMC',
      },
    },
  },
  chapter6_solver: {
    valid: solverResult.valid,
    converged: solverResult.converged,
    iterations: solverResult.iterations,
    equationCount: solverResult.equationCount,
    objectiveEquationCount: solverResult.objectiveEquationCount,
    equations: solverResult.equations,
    totalProductMass: round(solverResult.totalProductMass, 2),
    products: productsOut,
    elementDistributions: config.elementDistributions,
  },
  chapter7_recommended: {
    fuelWeight: round(solverResult.recommended.fuelWeight, 4),
    solventWeights: Object.fromEntries(
      Object.entries(solverResult.recommended.solventWeights).map(([k, v]) => [k, round(v, 4)])
    ),
    gasWeights: Object.fromEntries(
      Object.entries(solverResult.recommended.gasWeights).map(([k, v]) => [k, round(v, 4)])
    ),
  },
  chapter8_validation: {
    maxRelativeResidual: round(solverResult.maxRelativeResidual, 6),
    constraintResiduals: solverResult.constraintResiduals
      .slice()
      .sort((a, b) => b.relativeResidual - a.relativeResidual)
      .slice(0, 15)
      .map((r) => ({
        expr: r.expr,
        value: round(r.value, 6),
        target: r.target,
        residual: round(r.residual, 6),
        relativeResidual: round(r.relativeResidual, 6),
      })),
    elementBalanceResiduals: (solverResult.elementBalanceResiduals ?? [])
      .filter((r) => Math.abs(r.residual) > 1e-4)
      .map((r) => ({
        element: r.element,
        feed: round(r.feed, 4),
        allocated: round(r.allocated, 4),
        residual: round(r.residual, 4),
      })),
  },
}

writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2), 'utf8')
writeFileSync(
  EQUATIONS_PATH,
  [
    '铜冶炼富氧侧吹 - 四矿案例产出求解方程',
    `生成时间：${output.generatedAt}`,
    `方程总数：${output.chapter6_solver.equationCount}`,
    '',
    ...output.chapter6_solver.equations.map((equation) => equation.expr),
    '',
  ].join('\n'),
  'utf8'
)
console.log(`Wrote ${OUTPUT_PATH}`)
console.log(`Wrote ${EQUATIONS_PATH}`)
console.log(
  JSON.stringify(
    {
      converged: output.chapter6_solver.converged,
      valid: output.chapter6_solver.valid,
      totalProductMass: output.chapter6_solver.totalProductMass,
      recommended: output.chapter7_recommended,
      maxRelativeResidual: output.chapter8_validation.maxRelativeResidual,
    },
    null,
    2
  )
)
