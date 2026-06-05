import assert from 'node:assert/strict'
import {
  BATCH_TABLE_CATEGORY_COL_WIDTH,
  BATCH_TABLE_FEED_COL_WIDTH,
  BATCH_TABLE_SHARE_COL_WIDTH,
  BATCH_TABLE_SPARSE_COL_WIDTH,
  BATCH_TABLE_TOTAL_COL_WIDTH,
  BATCH_TABLE_NAME_COL_MAX,
  BATCH_TABLE_NAME_COL_MIN,
  batchElementTableColWidths,
  batchElementTableWidth,
  batchPhaseAssistColWidths,
  batchPhaseTableWidth,
  batchTableDataColWidth,
  batchTableNameColWidthFromLabels,
  computePhaseAssistTableLayout,
  distributeBatchDataColumnWidths,
  fitColWidths,
  isSparseDataColumn,
} from './copperBatchTableLayout.ts'

assert.equal(batchTableNameColWidthFromLabels(['请选择']), BATCH_TABLE_NAME_COL_MIN)

const longName = '东部铜矿精矿（高硫）'
const longWidth = batchTableNameColWidthFromLabels(['请选择', longName])
assert.ok(longWidth > BATCH_TABLE_NAME_COL_MIN, 'long raw material name should widen the name column')

const elementColWidths = Array.from({ length: 20 }, (_, index) =>
  index === 7 ? BATCH_TABLE_SPARSE_COL_WIDTH : batchTableDataColWidth('Cu', ['19.3800', '100.0000'])
)
const elementCols = batchElementTableColWidths(longWidth, elementColWidths)
assert.equal(elementCols[0], BATCH_TABLE_CATEGORY_COL_WIDTH)
assert.equal(elementCols[1], longWidth, 'colgroup name column should match computed name width')
assert.equal(elementCols[2], BATCH_TABLE_FEED_COL_WIDTH, 'feed column should stay at fixed width')
assert.equal(elementCols[3], BATCH_TABLE_SHARE_COL_WIDTH, 'share column should stay at fixed width')
assert.equal(elementCols[4], elementColWidths[0], 'element columns should use content min width without container')
assert.equal(elementCols.length, 20 + 5, 'element table should have fixed leading/trailing columns plus element columns (no H₂O column)')

const tableWidth = batchElementTableWidth(elementColWidths, longWidth)
assert.equal(
  tableWidth,
  elementCols.reduce((sum, width) => sum + width, 0),
  'table width should equal the sum of colgroup column widths'
)

const minSum = tableWidth
const fitted = batchElementTableColWidths(longWidth, elementColWidths, minSum + 200)
assert.equal(
  fitted.reduce((sum, width) => sum + width, 0),
  minSum + 200,
  'fitted columns should fill container width when wider than minimum'
)
assert.equal(fitted[2], BATCH_TABLE_FEED_COL_WIDTH, 'fitted layout should keep feed column fixed')
assert.equal(fitted[fitted.length - 1], BATCH_TABLE_TOTAL_COL_WIDTH, 'fitted layout should keep total column fixed')
assert.ok(fitted[4] > elementColWidths[0], 'extra width should expand element data columns evenly')

const distributed = distributeBatchDataColumnWidths([40, 100], [50, 50], [80], 400)
assert.equal(distributed.reduce((sum, width) => sum + width, 0), 400)
assert.equal(distributed[0], 40)
assert.equal(distributed[4], 80, 'trailing fixed column should not absorb extra width')
assert.ok(distributed[2] > 50 && distributed[3] > 50, 'data columns should share remaining viewport width')

const { widths: minOnly, tableWidth: minTableWidth } = fitColWidths([40, 60, 100], 0)
assert.deepEqual(minOnly, [40, 60, 100])
assert.equal(minTableWidth, 200)

assert.ok(isSparseDataColumn(['0', '0.0000', '—']), 'all-zero samples should be treated as sparse')
assert.equal(batchTableDataColWidth('Au', ['0', '0.0000'], true), BATCH_TABLE_SPARSE_COL_WIDTH)

const phaseColWidths = Array.from({ length: 18 }, () => batchTableDataColWidth('Cu2S', ['24.269']))
const phaseWidth = batchPhaseTableWidth(phaseColWidths, longWidth)
assert.equal(
  phaseWidth,
  longWidth + 56 + BATCH_TABLE_FEED_COL_WIDTH + phaseColWidths.reduce((sum, width) => sum + width, 0) + BATCH_TABLE_TOTAL_COL_WIDTH + 64,
  'phase table width should sum content-based phase columns and fixed trailing columns'
)

const capped = batchTableNameColWidthFromLabels(['A'.repeat(40)])
assert.equal(capped, BATCH_TABLE_NAME_COL_MAX)

const assistLayout = computePhaseAssistTableLayout({
  labelSamples: ['物相', 'w%', 'Cu', 'S'],
  totalSamples: ['合计', '100.0000', '28.3072'],
  phaseColumns: [
    { header: 'Cu2S', samples: ['28.3072'], hasData: true, isDraft: false },
    { header: 'Hg', samples: [], hasData: false, isDraft: false },
    { header: 'Au', samples: ['0.0003'], hasData: true, isDraft: false },
  ],
})
assert.equal(assistLayout.widths.length, 3 + 3)
assert.ok(assistLayout.widths[1] >= 80, 'assist total column should stay readable')
assert.ok(
  assistLayout.widths[2] > assistLayout.widths[3],
  'phase column with data should be wider than sparse Hg column'
)

const assistFitted = batchPhaseAssistColWidths([52, 40, 60], 800, {
  labelWidth: 48,
  totalWidth: 88,
})
assert.equal(assistFitted.tableWidth, 800)
assert.equal(assistFitted.widths[0], 48, 'assist label column should stay fixed')
assert.equal(assistFitted.widths[1], 88, 'assist total column should stay fixed')
assert.ok(assistFitted.widths[2] > 52, 'viewport extra width should expand phase data columns evenly')

console.log('copperBatchTableLayout.test.mjs: ok')
