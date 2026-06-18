import assert from 'node:assert/strict'

import { elementMassFraction } from './atomicMass.ts'
import {
  buildElementTableDisplayKeys,
  decomposeElementTableRatios,
  elementTableDisplayEditTarget,
  elementTableDisplayValueToStorageValue,
} from './copperElementDisplay.ts'

function approx(actual, expected, tolerance = 1e-9) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`
  )
}

const ratios = {
  'Cu(铜)': 20,
  'SiO₂(二氧化硅)': 10,
  'CaO(氧化钙)': 4,
  'Al₂O₃(三氧化二铝)': 6,
  'MgO(氧化镁)': 3,
  'O(氧)': 2,
  'Other(其他)': 55,
}

const keys = buildElementTableDisplayKeys(
  ['Cu(铜)', 'SiO₂(二氧化硅)', 'CaO(氧化钙)', 'Al₂O₃(三氧化二铝)', 'MgO(氧化镁)', 'O(氧)', 'Other(其他)'],
  'element'
)

assert.ok(keys.includes('Si'))
assert.ok(keys.includes('Ca'))
assert.ok(keys.includes('Al'))
assert.ok(keys.includes('Mg'))
assert.ok(keys.includes('O(氧)'))
assert.equal(keys.includes('SiO₂(二氧化硅)'), false)
assert.equal(keys.includes('CaO(氧化钙)'), false)

const displayed = decomposeElementTableRatios(ratios, 'element')
approx(displayed.Si, ratios['SiO₂(二氧化硅)'] * elementMassFraction({ Si: 1, O: 2 }, 'Si'))
approx(displayed.Ca, ratios['CaO(氧化钙)'] * elementMassFraction({ Ca: 1, O: 1 }, 'Ca'))
approx(displayed.Al, ratios['Al₂O₃(三氧化二铝)'] * elementMassFraction({ Al: 2, O: 3 }, 'Al'))
approx(displayed.Mg, ratios['MgO(氧化镁)'] * elementMassFraction({ Mg: 1, O: 1 }, 'Mg'))

assert.equal(elementTableDisplayEditTarget('Si', 'element'), 'SiO₂(二氧化硅)')
assert.equal(elementTableDisplayEditTarget('Ca', 'element'), 'CaO(氧化钙)')
assert.equal(elementTableDisplayEditTarget('Al', 'element'), 'Al₂O₃(三氧化二铝)')
assert.equal(elementTableDisplayEditTarget('Mg', 'element'), 'MgO(氧化镁)')
assert.equal(elementTableDisplayEditTarget('Cu(铜)', 'element'), 'Cu(铜)')
assert.equal(elementTableDisplayEditTarget('O(氧)', 'element'), 'O(氧)')

const nextSiDisplay = displayed.Si + 1
approx(
  elementTableDisplayValueToStorageValue('Si', nextSiDisplay, ratios, 'element'),
  nextSiDisplay / elementMassFraction({ Si: 1, O: 2 }, 'Si')
)

const oxideOxygen =
  ratios['SiO₂(二氧化硅)'] * elementMassFraction({ Si: 1, O: 2 }, 'O') +
  ratios['CaO(氧化钙)'] * elementMassFraction({ Ca: 1, O: 1 }, 'O') +
  ratios['Al₂O₃(三氧化二铝)'] * elementMassFraction({ Al: 2, O: 3 }, 'O') +
  ratios['MgO(氧化镁)'] * elementMassFraction({ Mg: 1, O: 1 }, 'O')

approx(
  elementTableDisplayValueToStorageValue('O(氧)', oxideOxygen + 5, ratios, 'element'),
  5
)
approx(elementTableDisplayValueToStorageValue('Cu(铜)', 21, ratios, 'element'), 21)

console.log('copper element display tests passed')
