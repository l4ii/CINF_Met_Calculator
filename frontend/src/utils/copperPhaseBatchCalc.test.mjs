import assert from 'node:assert/strict'

const {
  buildBlendPhaseFromMaterialResults,
  buildPhasePivotRows,
  computeMaterialPhaseResult,
  phaseMassPercentClosure,
  sumPhasePivotTotals,
  phaseContentsToInputPhaseMap,
  waterPhasePercent,
} = await import('./copperPhaseBatchCalc.ts')
const { createDefaultMaterialPhaseRows } = await import('./copperPhaseAssist.ts')
const { emptyCopperRatios, normalizeCopperRatios } = await import('./copperWorkflowCalc.ts')

const ratios = normalizeCopperRatios({
  ...emptyCopperRatios(),
  'Cu(铜)': 24,
  'Fe(铁)': 28,
  'S (硫)': 32,
  'SiO₂(二氧化硅)': 8,
})

const rows = createDefaultMaterialPhaseRows()
const result = computeMaterialPhaseResult('m1', '精矿A', 100, ratios, rows)
assert((result.phaseContents.Other ?? 0) > 0, 'default phase result should include Other closure row')
assert((result.phaseContents.Other ?? 0) >= (result.unknowns['Other(其他)'] ?? 0))
const pivot = buildPhasePivotRows(rows, result.phaseContents, 100)
const totals = sumPhasePivotTotals(pivot)
assert(Math.abs(totals.elements['Cu(铜)'] - 24) < 0.05, 'Cu mass flow should match assay')
assert(Math.abs(totals.elements['Fe(铁)'] - 28) < 0.05, 'Fe mass flow should match assay')
const closure = phaseMassPercentClosure(ratios, totals.phaseTotal, result.unknowns, totals.elements, 100)
assert(Math.abs(closure - 100) < 0.05, 'phase w% closure should reach 100%')
assert(Math.abs(totals.phaseTotal - 100) < 0.05, 'default Other row should close visible phase rows to 100%')

const phases = phaseContentsToInputPhaseMap(result.phaseContents, rows)
assert((phases.Other ?? 0) > 0, 'Other row should sync into input phase table')
assert(Math.abs(Object.values(phases).reduce((sum, value) => sum + (value ?? 0), 0) - 100) < 0.05)

const blend = buildBlendPhaseFromMaterialResults(
  [
    { materialId: 'm1', materialName: 'A', weight: 60, ...result },
    {
      materialId: 'm2',
      materialName: 'B',
      weight: 40,
      ...computeMaterialPhaseResult(
        'm2',
        'B',
        40,
        normalizeCopperRatios({ ...emptyCopperRatios(), 'Cu(铜)': 20, 'Fe(铁)': 30, 'S (硫)': 35 }),
        rows
      ),
    },
  ],
  { m1: rows, m2: rows }
)
const blendTotal = Object.values(blend).reduce((sum, value) => sum + (value ?? 0), 0)
assert(Math.abs(blendTotal - 100) < 0.05, 'blend should normalize to ~100%')

const moisture = 10
assert(Math.abs(waterPhasePercent(100, moisture) - moisture) < 1e-9, 'water w% should equal moisture input')
const pivotMoist = buildPhasePivotRows(rows, result.phaseContents, 100, moisture)
const totalsMoist = sumPhasePivotTotals(pivotMoist)
assert(Math.abs(totalsMoist.phaseTotal - 100) < 0.2, 'wet-basis phase w% total should be ~100%')
const waterRow = pivotMoist.find((row) => row.label.includes('H') || row.rowId === 'H2O')
assert(waterRow && Math.abs((waterRow.phasePercent ?? 0) - moisture) < 0.05, 'H2O row w% should equal moisture %')
const elementMassSum = Object.values(totalsMoist.elements).reduce((sum, value) => sum + (value ?? 0), 0)
assert(Math.abs(elementMassSum - 100) < 0.5, 'element mass flows should sum to ~feed rate')

console.log('copperPhaseBatchCalc tests passed')
