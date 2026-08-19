import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import {
  buildElementBalanceSheet,
  buildInputMaterialElementSheet,
} from '../src/utils/copperReportSheetBuilders.ts'

const format = (value) => String(Number(value.toFixed(6)))

const elements = [
  { key: 'Cu(铜)', label: 'Cu' },
  { key: 'H(氢)', label: 'H' },
  { key: 'O(氧)', label: 'O' },
]

const materials = [
  {
    header: '原料1',
    name: '吹炼投入',
    dryWeightTh: 10,
    waterWeightTh: 1,
    composition: { 'Cu(铜)': 80, 'H(氢)': 0, 'O(氧)': 20 },
    compositionTotal: 100,
  },
]

const inputSheet = buildInputMaterialElementSheet({
  materials,
  blend: {
    dryWeightTh: 10,
    waterWeightTh: 1,
    composition: { 'Cu(铜)': 80, 'H(氢)': 0, 'O(氧)': 20 },
    compositionTotal: 100,
  },
  elements,
  format,
})

assert.deepEqual(inputSheet.columns.at(-2), { header: '汇总', subHeader: '混料' })
assert.equal(inputSheet.rows.find((row) => row.label === '干基量').values.at(-2), '10')
assert.match(inputSheet.unitNote, /流量 t\/h/)
assert.doesNotMatch(inputSheet.unitNote, /年量/)

const balanceSheet = buildElementBalanceSheet({
  inputs: materials,
  outputs: [
    {
      productKey: 'fugitive',
      name: '无组织排放',
      massTh: 0,
      composition: {},
    },
    {
      productKey: 'matte',
      name: '粗铜',
      massTh: 11,
      composition: { 'Cu(铜)': 100 },
    },
  ],
  elements,
  format,
})

assert.ok(balanceSheet)
assert.ok(balanceSheet.rows.some((row) => row.values[0] === '无组织排放'))
const inputTotal = balanceSheet.rows.find((row) => row.label === '' && row.role === 'total')
assert.equal(inputTotal.values[1], '11')
assert.equal(inputTotal.values[3], '8')
assert.equal(inputTotal.values[5], '0.111907')
assert.doesNotMatch(balanceSheet.unitNote, /t\/a/)

for (const path of [
  '../src/components/modules/copper/shared/CopperOxySideBlowSession.tsx',
  '../src/components/modules/copper/converting/ConvertingEquipmentPage.tsx',
]) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8')
  assert.match(
    source,
    /header: '混料',\s*subHeader: isConvertingStage \? '混料' : '混合铜精矿'/,
    `${fileURLToPath(new URL(path, import.meta.url))}: converting summary uses 混料`
  )
}

console.log('copper report regressions passed')
