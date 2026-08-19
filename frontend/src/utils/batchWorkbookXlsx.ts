import ExcelJS from 'exceljs'
import {
  prepareReferenceBatchSheets,
  type PreparedReferenceBatchSheet,
  type ReferenceBatchWorkbookSheet,
} from './referenceBatchWorkbook.ts'

export type BatchWorkbookXlsxOptions = {
  stageName?: string
}

const FONT_NAME = '宋体'
const HEADER_BORDER_COLOR = 'FF667085'
const BODY_BORDER_COLOR = 'FFDCE3EA'
const HEADER_FILL_COLOR = 'FFDCE6F1'
const SUBHEADER_FILL_COLOR = 'FFEDF2F7'
const SECTION_FILL_COLOR = 'FFF4F6F8'
const TOTAL_FILL_COLOR = 'FFF7F8FA'

const centerAlignment: Partial<ExcelJS.Alignment> = {
  horizontal: 'center',
  vertical: 'middle',
  wrapText: false,
}

function binaryBuffer(buffer: unknown): ArrayBuffer {
  if (buffer instanceof ArrayBuffer) return buffer
  if (ArrayBuffer.isView(buffer)) {
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer
  }
  throw new Error('Excel 工作簿生成结果不是有效的二进制数据。')
}

function numericCellValue(value: string | number | null | undefined) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  if (/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(trimmed)) {
    const parsed = Number(trimmed)
    if (Number.isFinite(parsed)) return parsed
  }
  return value
}

function captionFor(sheet: PreparedReferenceBatchSheet, stageName: string) {
  const stage = stageName ? `[${stageName}]` : ''
  const separator = sheet.directCaption ? '' : '-'
  return `表${sheet.tableNumber}${stage}${separator}${sheet.title}`
}

function styleCell(cell: ExcelJS.Cell, options?: { bold?: boolean; fontSize?: number }) {
  cell.font = {
    name: FONT_NAME,
    size: options?.fontSize ?? 11,
    bold: options?.bold ?? false,
    color: { argb: 'FF000000' },
  }
  cell.alignment = centerAlignment
  if (typeof cell.value === 'number') cell.numFmt = '0.00_ '
}

function applyHorizontalBorders(
  row: ExcelJS.Row,
  columnCount: number,
  top: ExcelJS.BorderStyle,
  bottom: ExcelJS.BorderStyle,
  color = HEADER_BORDER_COLOR
) {
  for (let column = 1; column <= columnCount; column += 1) {
    row.getCell(column).border = {
      top: { style: top, color: { argb: color } },
      bottom: { style: bottom, color: { argb: color } },
    }
  }
}

function mergeHeaderGroups(
  worksheet: ExcelJS.Worksheet,
  sheet: PreparedReferenceBatchSheet,
  headerRowIndex: number,
  subHeaderRowIndex: number
) {
  let start = 0
  while (start < sheet.columns.length) {
    const header = sheet.columns[start].header
    let end = start
    while (end + 1 < sheet.columns.length && sheet.columns[end + 1].header === header) end += 1
    const startColumn = start + 2
    const endColumn = end + 2
    if (endColumn > startColumn) {
      worksheet.mergeCells(headerRowIndex, startColumn, headerRowIndex, endColumn)
    } else {
      const subHeader = sheet.columns[start].subHeader ?? ''
      if (!subHeader || subHeader === header) {
        worksheet.mergeCells(headerRowIndex, startColumn, subHeaderRowIndex, startColumn)
      }
    }
    start = end + 1
  }
}

function needsSubHeaderRow(sheet: PreparedReferenceBatchSheet) {
  return sheet.columns.some((column) => {
    const subHeader = column.subHeader?.trim() ?? ''
    return subHeader && subHeader !== column.header
  })
}

function applyBodyRowStyle(row: ExcelJS.Row, columnCount: number, bold = false) {
  for (let column = 1; column <= columnCount; column += 1) {
    const cell = row.getCell(column)
    styleCell(cell, { bold })
    cell.border = {
      bottom: { style: 'thin', color: { argb: BODY_BORDER_COLOR } },
    }
  }
}

function applyHeaderRowStyle(
  row: ExcelJS.Row,
  columnCount: number,
  fillColor: string,
  top: ExcelJS.BorderStyle,
  bottom: ExcelJS.BorderStyle
) {
  for (let column = 1; column <= columnCount; column += 1) {
    const cell = row.getCell(column)
    styleCell(cell, { bold: true })
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillColor } }
    cell.border = {
      top: { style: top, color: { argb: HEADER_BORDER_COLOR } },
      bottom: { style: bottom, color: { argb: HEADER_BORDER_COLOR } },
      left: { style: 'thin', color: { argb: HEADER_BORDER_COLOR } },
      right: { style: 'thin', color: { argb: HEADER_BORDER_COLOR } },
    }
  }
}

function numericFormatForColumn(column: PreparedReferenceBatchSheet['columns'][number]) {
  const label = column.subHeader ?? column.header
  if (label === 'Pa') return '0_ '
  if (label === 'g/cm3' || label === 'g/cm³') return '0.00E+00'
  return '0.00_ '
}

function writeSheetBlock(
  worksheet: ExcelJS.Worksheet,
  sheet: PreparedReferenceBatchSheet,
  rowIndex: number,
  stageName: string
) {
  const columnCount = sheet.columns.length + 1
  const captionRow = worksheet.getRow(rowIndex)
  captionRow.height = 17
  captionRow.getCell(1).value = captionFor(sheet, stageName)
  captionRow.getCell(1).font = { name: FONT_NAME, size: 11, bold: true, color: { argb: 'FF000000' } }
  captionRow.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' }
  if (columnCount > 1) worksheet.mergeCells(rowIndex, 1, rowIndex, columnCount)
  rowIndex += 1

  const headerRowIndex = rowIndex
  const hasSubHeaderRow = needsSubHeaderRow(sheet)
  const subHeaderRowIndex = hasSubHeaderRow ? rowIndex + 1 : rowIndex
  const headerRow = worksheet.getRow(headerRowIndex)
  headerRow.height = hasSubHeaderRow ? 17 : 21
  headerRow.getCell(1).value = sheet.rowHeaderLabel ?? '№'
  if (hasSubHeaderRow) {
    const subHeaderRow = worksheet.getRow(subHeaderRowIndex)
    subHeaderRow.height = 17
    subHeaderRow.getCell(1).value = null
    worksheet.mergeCells(headerRowIndex, 1, subHeaderRowIndex, 1)
    sheet.columns.forEach((column, index) => {
      headerRow.getCell(index + 2).value = column.header
      subHeaderRow.getCell(index + 2).value = column.subHeader || null
    })
    mergeHeaderGroups(worksheet, sheet, headerRowIndex, subHeaderRowIndex)
    applyHeaderRowStyle(headerRow, columnCount, HEADER_FILL_COLOR, 'medium', 'thin')
    applyHeaderRowStyle(subHeaderRow, columnCount, SUBHEADER_FILL_COLOR, 'thin', 'medium')
    rowIndex += 2
  } else {
    sheet.columns.forEach((column, index) => {
      headerRow.getCell(index + 2).value = column.header
    })
    applyHeaderRowStyle(headerRow, columnCount, HEADER_FILL_COLOR, 'medium', 'medium')
    rowIndex += 1
  }

  for (const dataRow of sheet.rows) {
    const excelRow = worksheet.getRow(rowIndex)
    excelRow.height = sheet.reportDensity === 'compact' ? 15 : 17
    excelRow.getCell(1).value = dataRow.label || null
    if (dataRow.role === 'section') {
      if (columnCount > 1) worksheet.mergeCells(rowIndex, 1, rowIndex, columnCount)
      applyBodyRowStyle(excelRow, columnCount, true)
      for (let column = 1; column <= columnCount; column += 1) {
        excelRow.getCell(column).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: SECTION_FILL_COLOR },
        }
      }
      excelRow.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' }
    } else {
      sheet.columns.forEach((_, index) => {
        excelRow.getCell(index + 2).value = numericCellValue(dataRow.values[index])
      })
      const hasPartialBold = dataRow.role === 'total' && (dataRow.boldValueIndexes?.length ?? 0) > 0
      applyBodyRowStyle(excelRow, columnCount, dataRow.role === 'total' && !hasPartialBold)
      sheet.columns.forEach((column, index) => {
        const cell = excelRow.getCell(index + 2)
        if (typeof cell.value === 'number') cell.numFmt = numericFormatForColumn(column)
      })
      if (hasPartialBold) {
        for (const valueIndex of dataRow.boldValueIndexes ?? []) {
          const cell = excelRow.getCell(valueIndex + 2)
          cell.font = { ...cell.font, bold: true }
        }
      }
      if (dataRow.role === 'total') {
        applyHorizontalBorders(excelRow, columnCount, 'medium', 'medium')
        for (let column = 1; column <= columnCount; column += 1) {
          excelRow.getCell(column).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: TOTAL_FILL_COLOR },
          }
        }
      }
    }
    rowIndex += 1
  }
  return rowIndex + 1
}

function textWidth(value: string) {
  return [...value].reduce((width, character) => width + (/[^\u0000-\u00ff]/.test(character) ? 2 : 1), 0)
}

function applyColumnWidths(worksheet: ExcelJS.Worksheet, sheets: PreparedReferenceBatchSheet[]) {
  const maxColumns = Math.max(1, ...sheets.map((sheet) => sheet.columns.length + 1))
  worksheet.getColumn(1).width = 6
  for (let columnIndex = 2; columnIndex <= maxColumns; columnIndex += 1) {
    let width = 8
    for (const sheet of sheets) {
      const column = sheet.columns[columnIndex - 2]
      if (!column) continue
      const headerWidth = Math.max(textWidth(column.header), textWidth(column.subHeader ?? ''))
      const weight = sheet.columnWidthWeights?.[columnIndex - 1] ?? 1
      width = Math.max(width, Math.min(18, Math.max(7, headerWidth + 1, weight * 8.5)))
    }
    worksheet.getColumn(columnIndex).width = width
  }
}

export async function buildReferenceBatchWorkbookXlsx(
  sheets: ReferenceBatchWorkbookSheet[],
  options: BatchWorkbookXlsxOptions = {}
): Promise<ArrayBuffer> {
  const preparedSheets = prepareReferenceBatchSheets(sheets)
  if (preparedSheets.length === 0) throw new Error('没有可写入 Excel 的计算表。')

  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'CINF Met Calculator'
  workbook.created = new Date()
  const worksheet = workbook.addWorksheet('Sheet1', {
    properties: { defaultRowHeight: 17 },
    pageSetup: {
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      paperSize: 9,
      margins: { left: 0.25, right: 0.25, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
    },
  })
  worksheet.views = [{ showGridLines: false }]

  const stageName = options.stageName?.trim() ?? ''
  const maxColumns = Math.max(1, ...preparedSheets.map((sheet) => sheet.columns.length + 1))
  const titleRow = worksheet.getRow(1)
  titleRow.height = 20
  titleRow.getCell(1).value = stageName ? `[${stageName}]计算` : '冶金计算'
  titleRow.getCell(1).font = { name: FONT_NAME, size: 11, bold: false, color: { argb: 'FFFF0000' } }
  titleRow.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' }
  if (maxColumns > 1) worksheet.mergeCells(1, 1, 1, maxColumns)

  let rowIndex = 3
  for (const sheet of preparedSheets) {
    rowIndex = writeSheetBlock(worksheet, sheet, rowIndex, stageName)
  }
  applyColumnWidths(worksheet, preparedSheets)
  worksheet.autoFilter = undefined

  const buffer: unknown = await workbook.xlsx.writeBuffer()
  return binaryBuffer(buffer)
}
