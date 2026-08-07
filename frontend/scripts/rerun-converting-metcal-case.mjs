/**
 * 用桌面「测试.metcal」吹炼投入重跑产出求解（约束7已删除后）。
 * 运行：cd frontend && npx --yes tsx scripts/rerun-converting-metcal-case.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  ensureConvertingProductPhases,
  loadOxyConvertingConstraints,
  stripUnsupportedConvertingCustomConstraints,
  normalizeConvertingCustomConstraintExprs,
  isCoolingWaterCustomConstraint,
} from '../src/utils/copperConstraintConfig.ts'
import { autoFillOxyProductConstraintConfig } from '../src/utils/copperConstraintValidation.ts'
import { solveOxySideBlowProducts } from '../src/utils/copperConstraintSolver.ts'
import {
  calculateWeightedComposition,
  normalizeProcessAirColumns,
} from '../src/utils/copperWorkflowCalc.ts'
import { DEFAULT_COPPER_FUEL } from '../src/utils/copperProcessCalc.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const METCAL_PATH = 'c:/Users/0303003/Desktop/测试.metcal'
const OUT_PATH = join(__dirname, 'rerun-converting-metcal-output.json')

function cloneMaterial(column) {
  return {
    ...column,
    ratios: { ...column.ratios },
  }
}

function normalizeConfig(config) {
  const filled = autoFillOxyProductConstraintConfig(config).config
  return ensureConvertingProductPhases(
    stripUnsupportedConvertingCustomConstraints(
      normalizeConvertingCustomConstraintExprs({
        ...filled,
        method: 'cu-oxy-side-blast-converting',
        customConstraints: filled.customConstraints.filter(
          (entry) => !isCoolingWaterCustomConstraint(entry.expr)
        ),
      })
    )
  )
}

function buildInputPhaseMass(rawMaterials, phaseBatchResults) {
  const blend = {}
  for (const material of rawMaterials) {
    const result = phaseBatchResults?.[material.id]
    if (!result?.valid || !result.phaseContents) continue
    const w = Math.max(0, material.weight)
    for (const [phase, pct] of Object.entries(result.phaseContents)) {
      blend[phase] = (blend[phase] ?? 0) + (w * (Number(pct) || 0)) / 100
    }
  }
  return Object.keys(blend).length ? { 混合铜精矿: blend } : undefined
}

const caseJson = JSON.parse(readFileSync(METCAL_PATH, 'utf8'))
const converting = caseJson?.case?.processStages?.cu_converting
if (!converting) {
  console.error('missing cu_converting in metcal')
  process.exit(1)
}

const rawMaterials = (converting.rawMaterials ?? []).map(cloneMaterial)
const solventColumns = (converting.solventColumns ?? []).map(cloneMaterial)
const airColumns = normalizeProcessAirColumns(converting.airColumns, null, {
  includeSecondaryAir: false,
}).map(cloneMaterial)
const fuelColumn = {
  ...DEFAULT_COPPER_FUEL,
  ...(converting.fuelColumn ?? {}),
  weight: 0,
  waterWeight: 0,
  moisture: 0,
  ratios: { ...(converting.fuelColumn?.ratios ?? DEFAULT_COPPER_FUEL.ratios) },
}

const config = normalizeConfig(converting.productConstraintConfig ?? loadOxyConvertingConstraints())
const concentrateMass = rawMaterials.reduce((sum, m) => sum + Math.max(0, m.weight), 0)
const rawFeed = calculateWeightedComposition(rawMaterials)
const inputPhaseMass = buildInputPhaseMass(rawMaterials, converting.phaseBatchResults)

let fuel = cloneMaterial(fuelColumn)
let solvents = solventColumns.map((c) => cloneMaterial({ ...c, weight: 0 }))
let air = airColumns.map((c) => cloneMaterial({ ...c, weight: 0 }))
let best = null

for (let pass = 0; pass < 4; pass += 1) {
  const blendFeed = calculateWeightedComposition([...rawMaterials, ...solvents, fuel, ...air])
  const result = await solveOxySideBlowProducts({
    blendFeed,
    rawFeed,
    rawMaterialColumns: rawMaterials,
    concentrateMass,
    preserveFuelInputWeight: true,
    inputPhaseMass,
    fuelColumn: fuel,
    solventColumns: solvents,
    airColumns: air,
    config,
  })
  if (
    !best ||
    (result.acceptanceLevel === 'strict' && best.acceptanceLevel !== 'strict') ||
    (result.acceptanceLevel === 'relaxed' && best.acceptanceLevel === 'failed') ||
    (result.acceptable && !best.acceptable) ||
    result.maxRelativeResidual < best.maxRelativeResidual
  ) {
    best = result
  }
  if (result.acceptable && result.acceptanceLevel === 'strict') {
    best = result
    break
  }
  fuel = cloneMaterial({ ...fuel, weight: result.recommended.fuelWeight })
  solvents = solvents.map((col) =>
    cloneMaterial({ ...col, weight: result.recommended.solventWeights[col.name] ?? col.weight })
  )
  air = air.map((col) =>
    cloneMaterial({ ...col, weight: result.recommended.gasWeights[col.name] ?? col.weight })
  )
}

const topConflicts = (best?.constraintResiduals ?? [])
  .filter((row) => !row.soft && Number.isFinite(row.relativeResidual) && row.relativeResidual > 0.005)
  .sort((a, b) => b.relativeResidual - a.relativeResidual)
  .slice(0, 8)
  .map((row) => ({
    kind: row.kind,
    label: row.label ?? row.expr,
    relativeResidual: row.relativeResidual,
    value: row.value,
    target: row.target,
  }))

const products = Object.fromEntries(
  Object.entries(best?.products ?? {}).map(([key, product]) => [
    key,
    {
      name: product.name,
      mass: product.mass,
      topPhases: (product.phases ?? [])
        .filter((p) => p.mass > 1e-6)
        .sort((a, b) => b.mass - a.mass)
        .slice(0, 6)
        .map((p) => ({ key: p.key, mass: p.mass, pct: p.pct })),
    },
  ])
)

const summary = {
  acceptable: best?.acceptable ?? false,
  acceptanceLevel: best?.acceptanceLevel,
  maxRelativeResidual: best?.maxRelativeResidual,
  message: best?.message,
  customConstraintCount: config.customConstraints.length,
  hasFreeCaoConstraint: config.customConstraints.some((e) =>
    /Output\.吹炼渣\.CaO\s*\/\s*Output\.吹炼渣/.test(e.expr)
  ),
  slagPhases: config.products.smeltingSlag.phases,
  products,
  recommended: best?.recommended,
  topConflicts,
}

writeFileSync(OUT_PATH, JSON.stringify(summary, null, 2), 'utf8')
console.log(JSON.stringify(summary, null, 2))
if (!summary.acceptable) {
  console.error('WARN: still not acceptable; see topConflicts')
  process.exitCode = 2
} else {
  console.log('OK: converting solve acceptable')
}
