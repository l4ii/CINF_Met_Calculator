import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

const utilityUrl = new URL('../src/utils/copperEquipmentBom.ts', import.meta.url)
assert.ok(existsSync(utilityUrl), 'BOM enrichment must expose component quantities and avoid double-counting furnace components')
const { enrichCopperEquipmentBom, normalizeEquipmentBomSnapshots } = await import(utilityUrl.href)

const fixture = ['furnace', 'feed', 'tuyere', 'offgas', 'tap'].map((kind) => ({
  id: `converting-${kind}`, name: kind, specification: 'design specification', quantity: kind === 'tuyere' ? 12 : 1,
  unit: kind === 'tuyere' ? '个' : '套', material: 'material', note: '',
}))
const original = structuredClone(fixture)
const design = { jacketCountTotal: 20, jacketCountOneSide: 10, jacketPitchMm: 600 }
const result = enrichCopperEquipmentBom(fixture, 'converting', design)
assert.deepEqual(fixture, original, 'Enrichment must not mutate sizing output')
assert.equal(result.length, 6)
assert.equal(result.find((item) => item.id === 'converting-jacket').quantity, 20, 'Use actual dual-side jacket count')
assert.equal(result.find((item) => item.id === 'converting-tuyere').quantity, 12)
assert.deepEqual(result.filter((item) => item.pricingMode === 'separate').map((item) => item.id), [
  'converting-furnace', 'converting-feed', 'converting-tap',
], 'Subcomponents included in a furnace and external interfaces must not create duplicate purchase cost')
assert.equal(result.find((item) => item.id === 'converting-jacket').pricingMode, 'included')
assert.equal(result.find((item) => item.id === 'converting-offgas').pricingMode, 'interface')
assert.equal(new Set(result.map((item) => item.id)).size, 6)
assert.deepEqual(enrichCopperEquipmentBom(result, 'converting', design), result, 'Re-enrichment must not duplicate components')
assert.equal(enrichCopperEquipmentBom(fixture, 'converting').length, 5, 'Do not invent jacket quantities without a design')
assert.equal(enrichCopperEquipmentBom(fixture, 'converting', { ...design, jacketCountTotal: NaN }).length, 5)
assert.deepEqual(enrichCopperEquipmentBom([], 'converting', design), [], 'An invalid or absent furnace BOM must stay empty')

const imported = normalizeEquipmentBomSnapshots({
  converting: [result[0], { ...result[0], name: 'duplicate' }, { ...result[1], quantity: -1 },
    { ...result[1], quantity: Infinity }, { ...result[1], id: 'legacy', quantity: 0, pricingMode: 'invalid', extra: 'discard' },
    { ...result[1], id: 'blank-name', name: ' ' }, null],
  smelting: 'invalid',
  unknownStage: [result[0]],
})
assert.deepEqual(Object.keys(imported), ['converting'])
assert.equal(imported.converting.length, 2, 'Reject duplicate identifiers, invalid names, and unsafe quantities')
assert.equal(imported.converting[1].quantity, 0)
assert.equal(imported.converting[1].pricingMode, undefined, 'Discard unsupported pricing scope')
assert.equal(imported.converting[1].extra, undefined)
assert.deepEqual(normalizeEquipmentBomSnapshots(null), {})
assert.deepEqual(normalizeEquipmentBomSnapshots([]), {})

// Execute the existing event handler: changing converting inputs must invalidate
// only the converting design and BOM, preserving an already completed smelting stage.
const page = readFileSync(new URL('../src/components/modules/copper/converting/ConvertingEquipmentPage.tsx', import.meta.url), 'utf8')
const resetBody = page.match(/const resetConvertingEquipmentModel = \(\) => \{([\s\S]*?)\n  \}/)?.[1]
assert.ok(resetBody)
let models = { smelting: true, converting: true, refining: false }
let boms = { ...models }
new Function('setEquipmentModelGenerated', 'setEquipmentBomGenerated', resetBody)(
  (update) => { models = update(models) },
  (update) => { boms = update(boms) },
)
assert.deepEqual(models, { smelting: true, converting: false, refining: false })
assert.deepEqual(boms, { smelting: true, converting: false, refining: false })
console.log('Copper equipment BOM and stage invalidation validation passed')
