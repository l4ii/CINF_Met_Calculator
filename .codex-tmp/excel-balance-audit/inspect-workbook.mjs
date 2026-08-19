import { FileBlob, SpreadsheetFile } from '@oai/artifact-tool'

const path = 'C:/Users/0303003/Desktop/侧吹炉铜冶炼计算2026-08-061517_铜熔炼_20260819/侧吹炉铜冶炼计算2026-08-061517_铜熔炼_20260819_计算结果.xlsx'
const input = await FileBlob.load(path)
const workbook = await SpreadsheetFile.importXlsx(input)
const sheets = await workbook.inspect({ kind: 'sheet', include: 'id,name', maxChars: 12000 })
console.log(sheets.ndjson)

for (const sheet of workbook.worksheets.items) {
  const used = sheet.getUsedRange()
  console.log(`SHEET ${sheet.name} used=${used?.address ?? 'none'}`)
  const region = await workbook.inspect({
    kind: 'region',
    sheetId: sheet.name,
    range: used?.address ?? 'A1:Z40',
    maxChars: 20000,
    tableMaxRows: 80,
    tableMaxCols: 40,
  })
  console.log(region.ndjson)
}
