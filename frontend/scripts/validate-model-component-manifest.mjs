import assert from 'node:assert/strict'
import { buildSmeltingFurnaceLayout } from '../src/utils/copperFurnaceGeometry.ts'
import { buildLeadKivcetGeometry } from '../src/utils/leadKivcetGeometry.ts'

const smelting = buildSmeltingFurnaceLayout({
  designLengthM: 8,
  furnaceLengthM: 8,
  furnaceWidthM: 2.2,
  jacketPitchMm: 600,
  jacketCountOneSide: 2,
  tuyereCountOneSide: 2,
})
assert.equal(smelting.components.length, 12)
assert.equal(new Set(smelting.components.map((component) => component.id)).size, smelting.components.length)
assert.equal(smelting.components.find((component) => component.id === 'smelting.primary-body')?.group, 'primary-body')
assert.equal(smelting.components.find((component) => component.id === 'smelting.cooling-and-injection.jacket.front.01')?.group, 'cooling-and-injection')
assert.equal(smelting.components.find((component) => component.id === 'smelting.cooling-and-injection.jacket.front.01')?.category, 'water-jacket')
assert.equal(smelting.components.find((component) => component.id === 'smelting.cooling-and-injection.jacket.front.01')?.params.lengthM?.unit, 'm')

const kivcet = buildLeadKivcetGeometry({ bodyLengthM: 10, bodyWidthM: 4, bodyHeightM: 6 })
assert.equal(kivcet.components.length, 5)
assert.deepEqual(kivcet.components.map((component) => component.id), [
  'kivcet.primary-body.reaction-tower',
  'kivcet.primary-body.flue-tower',
  'kivcet.process-connection.connecting-flue',
  'kivcet.cooling-and-injection.lance',
  'kivcet.cooling-and-injection.lance-water-jacket',
])
assert.equal(kivcet.components.find((component) => component.id.endsWith('lance'))?.params.radiusM?.editable, true)
assert.equal(kivcet.components.find((component) => component.id.endsWith('lance-water-jacket'))?.params.outerRadiusM?.value > kivcet.components.find((component) => component.id.endsWith('lance-water-jacket'))?.params.innerRadiusM?.value, true)
console.log('model component manifest validation passed')
