import ExcelJS from 'exceljs'
import { numberCopperBatchSheetTitles, type CopperBatchWorkbookSheet } from './copperBatchExport.ts'

function cellText(value: string | number | null | undefined): string {
  if (value == null) return ''
  return String(value)
}

/** 将多张表写入单个 Sheet：表间空一行，风格与 HTML/.xls 导出一致 */
export async function buildCopperBatchWorkbookXlsx(sheets: CopperBatchWorkbookSheet[]): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'CINF Met Calculator'
  const worksheet = workbook.addWorksheet('配料导出', {
    views: [{ state: 'frozen', ySplit: 0 }],
  })
  const numberedSheets = numberCopperBatchSheetTitles(sheets)

  const thinBorder = {
    top: { style: 'thin' as const, color: { argb: 'FF9CA3AF' } },
    left: { style: 'thin' as const, color: { argb: 'FF9CA3AF' } },
    bottom: { style: 'thin' as const, color: { argb: 'FF9CA3AF' } },
    right: { style: 'thin' as const, color: { argb: 'FF9CA3AF' } },
  }
  const headerFill: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFF3F4F6' },
  }
  const centerAlign: Partial<ExcelJS.Alignment> = { horizontal: 'center', vertical: 'middle', wrapText: true }

  let rowIndex = 1
  numberedSheets.forEach((sheet, sheetIndex) => {
    if (sheetIndex > 0) {
      rowIndex += 1
    }
    const columnCount = sheet.columns.length + 1
    const titleRow = worksheet.getRow(rowIndex)
    titleRow.getCell(1).value = sheet.title
    titleRow.getCell(1).font = { name: 'Microsoft YaHei', size: 12, bold: false }
    titleRow.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' }
    if (columnCount > 1) {
      worksheet.mergeCells(rowIndex, 1, rowIndex, columnCount)
    }
    rowIndex += 1

    const headerRow = worksheet.getRow(rowIndex)
    headerRow.getCell(1).value = '项目'
    sheet.columns.forEach((column, index) => {
      headerRow.getCell(index + 2).value = column.header
    })
    for (let col = 1; col <= columnCount; col += 1) {
      const cell = headerRow.getCell(col)
      cell.font = { name: 'Microsoft YaHei', size: 11, bold: false }
      cell.fill = headerFill
      cell.border = thinBorder
      cell.alignment = centerAlign
    }
    rowIndex += 1

    const subHeaderRow = worksheet.getRow(rowIndex)
    subHeaderRow.getCell(1).value = '名称'
    sheet.columns.forEach((column, index) => {
      subHeaderRow.getCell(index + 2).value = column.subHeader ?? ''
    })
    for (let col = 1; col <= columnCount; col += 1) {
      const cell = subHeaderRow.getCell(col)
      cell.font = { name: 'Microsoft YaHei', size: 11, bold: false }
      cell.fill = headerFill
      cell.border = thinBorder
      cell.alignment = centerAlign
    }
    rowIndex += 1

    for (const dataRow of sheet.rows) {
      const excelRow = worksheet.getRow(rowIndex)
      excelRow.getCell(1).value = cellText(dataRow.label)
      sheet.columns.forEach((_, index) => {
        excelRow.getCell(index + 2).value = cellText(dataRow.values[index])
      })
      for (let col = 1; col <= columnCount; col += 1) {
        const cell = excelRow.getCell(col)
        cell.font = { name: 'Microsoft YaHei', size: 11, bold: false }
        cell.border = thinBorder
        cell.alignment = centerAlign
      }
      rowIndex += 1
    }
  })

  const maxColumns = Math.max(1, ...numberedSheets.map((sheet) => sheet.columns.length + 1))
  for (let col = 1; col <= maxColumns; col += 1) {
    worksheet.getColumn(col).width = col === 1 ? 18 : 14
  }

  const buffer = await workbook.xlsx.writeBuffer()
  if (buffer instanceof ArrayBuffer) return buffer
  const view = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer as ArrayBuffer)
  return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength)
}
