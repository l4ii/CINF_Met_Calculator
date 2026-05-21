import assert from 'node:assert/strict'

const {
  buildCopperBatchExportFilename,
  buildCopperBatchExportHtml,
  getCopperStageExportName,
} = await import('./copperBatchExport.ts')

assert.equal(getCopperStageExportName('精炼'), '铜精炼')
assert.equal(getCopperStageExportName('铜吹炼'), '铜吹炼')
assert.equal(getCopperStageExportName('设备选型'), '铜设备选型')

assert.equal(
  buildCopperBatchExportFilename({
    appName: '长沙院冶金智能配料软件',
    stageName: '精炼',
    date: new Date('2026-05-21T08:00:00+08:00'),
  }),
  '长沙院冶金智能配料软件_铜精炼_20260521.xls'
)

const html = buildCopperBatchExportHtml({
  title: '长沙院冶金智能配料软件 铜精炼 配料总表',
  columns: [
    { header: '原料1', subHeader: '铜精矿 A' },
    { header: '混料', subHeader: '混料' },
    { header: '产出物' },
    { header: '含量' },
  ],
  rows: [
    { label: 't/h', values: [60, 106.926, '冰铜', 72.5] },
    { label: 'Cu', values: [24, 21.714, '炉渣', 18.2] },
    { label: '危险字符', values: ['<script>', '&', '"quoted"', "O'Brien"] },
  ],
})

assert(html.includes('application/vnd.ms-excel'), 'export should be Excel-compatible HTML')
assert(html.includes('<table'), 'export should contain a table')
assert(html.includes('长沙院冶金智能配料软件 铜精炼 配料总表'), 'export should include the table title')
assert(html.includes('铜精矿 A'), 'export should include column sub headers')
assert(html.includes('&lt;script&gt;'), 'export should escape angle brackets')
assert(html.includes('&amp;'), 'export should escape ampersands')
assert(html.includes('&quot;quoted&quot;'), 'export should escape quotes')
assert(html.includes('O&#39;Brien'), 'export should escape apostrophes')

console.log('Copper batch export checks passed')
