import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  HeightRule,
  PageOrientation,
  Packer,
  Paragraph,
  SectionType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  UnderlineType,
  VerticalAlign,
  WidthType,
  type ITableCellOptions,
} from 'docx'
import { APP_NAME_ZH, APP_ORG_NAME_ZH, APP_TAGLINE_ZH } from '../constants/appCopy.ts'
import {
  prepareReferenceBatchSheets,
  type PreparedReferenceBatchSheet,
  type ReferenceBatchExportColumn,
  type ReferenceBatchExportRow,
  type ReferenceBatchWorkbookSheet,
} from './referenceBatchWorkbook.ts'

export interface ProcessTextExportMeta {
  caseName: string
  stageName: string
  methodName?: string
  date?: Date
}

const A4_PORTRAIT_WIDTH = 11906
const A4_PORTRAIT_HEIGHT = 16838
const A3_LANDSCAPE_PAGE_WIDTH = 23811
const PAGE_MARGIN = 720
const NORMAL_PAGE_MARGIN = 1440
const LANDSCAPE_PAGE_WIDTH = A4_PORTRAIT_HEIGHT
const LANDSCAPE_PAGE_HEIGHT = A4_PORTRAIT_WIDTH
const LANDSCAPE_TABLE_WIDTH = A4_PORTRAIT_HEIGHT - PAGE_MARGIN * 2
const TABLE6_LANDSCAPE_TABLE_WIDTH = A3_LANDSCAPE_PAGE_WIDTH - PAGE_MARGIN * 2
const DOCX_COLUMN_UNIT_DXA = 120

const EXCEL_HEADER_ROW_HEIGHT = 420
const EXCEL_SUBHEADER_ROW_HEIGHT = 340
const EXCEL_BODY_ROW_HEIGHT = 340
const EXCEL_COMPACT_BODY_ROW_HEIGHT = 300

const HEADER_BORDER_COLOR = '667085'
const BODY_BORDER_COLOR = 'DCE3EA'
const HEADER_FILL_COLOR = 'DCE6F1'
const SUBHEADER_FILL_COLOR = 'EDF2F7'
const SECTION_FILL_COLOR = 'F4F6F8'
const TOTAL_FILL_COLOR = 'F7F8FA'

const BODY_FONT = {
  ascii: 'Times New Roman',
  hAnsi: 'Times New Roman',
  eastAsia: '仿宋_GB2312',
  cs: 'Times New Roman',
}

const TITLE_FONT = {
  ascii: 'Times New Roman',
  hAnsi: 'Times New Roman',
  eastAsia: '方正小标宋简体',
  cs: 'Times New Roman',
}

const TABLE_BORDERS = {
  top: { style: BorderStyle.SINGLE, size: 8, color: HEADER_BORDER_COLOR },
  bottom: { style: BorderStyle.SINGLE, size: 8, color: HEADER_BORDER_COLOR },
  left: { style: BorderStyle.SINGLE, size: 8, color: HEADER_BORDER_COLOR },
  right: { style: BorderStyle.SINGLE, size: 8, color: HEADER_BORDER_COLOR },
  insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: BODY_BORDER_COLOR },
  insideVertical: { style: BorderStyle.SINGLE, size: 4, color: BODY_BORDER_COLOR },
}

const HEADER_CELL_BORDERS = {
  top: { style: BorderStyle.SINGLE, size: 6, color: HEADER_BORDER_COLOR },
  bottom: { style: BorderStyle.SINGLE, size: 6, color: HEADER_BORDER_COLOR },
  left: { style: BorderStyle.SINGLE, size: 4, color: HEADER_BORDER_COLOR },
  right: { style: BorderStyle.SINGLE, size: 4, color: HEADER_BORDER_COLOR },
}

const BODY_CELL_BORDERS = {
  top: { style: BorderStyle.SINGLE, size: 3, color: BODY_BORDER_COLOR },
  bottom: { style: BorderStyle.SINGLE, size: 3, color: BODY_BORDER_COLOR },
  left: { style: BorderStyle.SINGLE, size: 3, color: BODY_BORDER_COLOR },
  right: { style: BorderStyle.SINGLE, size: 3, color: BODY_BORDER_COLOR },
}

const TOTAL_CELL_BORDERS = {
  top: { style: BorderStyle.SINGLE, size: 6, color: HEADER_BORDER_COLOR },
  bottom: { style: BorderStyle.SINGLE, size: 6, color: HEADER_BORDER_COLOR },
  left: { style: BorderStyle.SINGLE, size: 3, color: BODY_BORDER_COLOR },
  right: { style: BorderStyle.SINGLE, size: 3, color: BODY_BORDER_COLOR },
}

type DocxTableLayout = {
  tableWidth: number
  columnWidths: number[]
  overflowsPage: boolean
}

type TableCellPresentation = Omit<ITableCellOptions, 'children' | 'width'> & {
  fill?: string
  bold?: boolean
  alignment?: typeof AlignmentType[keyof typeof AlignmentType]
  cellMargin?: number
  lineSpacing?: number
  fontSize?: number
}

function formatExportDate(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}${month}${day}`
}

function documentRun(value: string, size: number, bold = false, title = false) {
  return new TextRun({ text: value, size, bold, font: title ? TITLE_FONT : BODY_FONT })
}

function emailLink(address: string, size: number) {
  return new ExternalHyperlink({
    link: `mailto:${address}`,
    children: [
      new TextRun({
        text: address,
        size,
        color: '0563C1',
        underline: { type: UnderlineType.SINGLE, color: '0563C1' },
        font: BODY_FONT,
      }),
    ],
  })
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

function normalizeZero(value: number) {
  return Object.is(value, -0) ? 0 : value
}

function formatScientific(value: number) {
  const [mantissa, exponent = '+0'] = normalizeZero(value).toExponential(2).split('e')
  const sign = exponent.startsWith('-') ? '-' : '+'
  const digits = exponent.replace(/^[+-]/, '').padStart(2, '0')
  return `${mantissa}E${sign}${digits}`
}

function formatCellValue(value: string | number | null | undefined, column?: ReferenceBatchExportColumn) {
  const coerced = numericCellValue(value)
  if (typeof coerced !== 'number') return String(value ?? '')
  const label = (column?.subHeader ?? column?.header ?? '').trim()
  if (label === 'Pa') return String(Math.round(normalizeZero(coerced)))
  if (label === 'g/cm3' || label === 'g/cm³') return formatScientific(coerced)
  return normalizeZero(coerced).toFixed(2)
}

function tableFontSize(columnCount: number) {
  if (columnCount >= 22) return 13
  if (columnCount >= 16) return 14
  if (columnCount >= 11) return 16
  return 18
}

function tableCell(
  value: string | number | null | undefined,
  width: number,
  size: number,
  options: TableCellPresentation = {}
) {
  const {
    fill,
    bold = false,
    alignment = AlignmentType.CENTER,
    cellMargin = 36,
    lineSpacing = 180,
    fontSize = size,
    ...cellOptions
  } = options
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    verticalAlign: VerticalAlign.CENTER,
    shading: fill ? { fill } : undefined,
    margins: { top: cellMargin, bottom: cellMargin, left: cellMargin, right: cellMargin },
    borders: BODY_CELL_BORDERS,
    ...cellOptions,
    children: [
      new Paragraph({
        alignment,
        keepLines: true,
        wordWrap: true,
        spacing: { before: 0, after: 0, line: lineSpacing },
        children: [documentRun(String(value ?? ''), fontSize, bold)],
      }),
    ],
  })
}

function fitColumnWidths(weights: number[], tableWidth: number) {
  const totalWeight = weights.reduce((sum, weight) => sum + Math.max(weight, 0.1), 0)
  const widths = weights.map((weight) => Math.floor(tableWidth * Math.max(weight, 0.1) / totalWeight))
  widths[widths.length - 1] += tableWidth - widths.reduce((sum, width) => sum + width, 0)
  return widths
}

function contentColumnWidths(units: number[]) {
  return units.map((unit) => Math.max(360, Math.round(Math.max(unit, 0.1) * DOCX_COLUMN_UNIT_DXA)))
}

function textWidth(value: string) {
  return [...value].reduce((width, character) => width + (/[^\u0000-\u00ff]/.test(character) ? 2 : 1), 0)
}

function excelColumnWidthUnits(sheets: PreparedReferenceBatchSheet[]) {
  const maxColumns = Math.max(1, ...sheets.map((sheet) => sheet.columns.length + 1))
  const widths = Array.from({ length: maxColumns }, () => 8)
  widths[0] = 6
  for (let columnIndex = 2; columnIndex <= maxColumns; columnIndex += 1) {
    let width = 8
    for (const sheet of sheets) {
      const column = sheet.columns[columnIndex - 2]
      if (!column) continue
      const headerWidth = Math.max(textWidth(column.header), textWidth(column.subHeader ?? ''))
      const weight = sheet.columnWidthWeights?.[columnIndex - 1] ?? 1
      width = Math.max(width, Math.min(18, Math.max(7, headerWidth + 1, weight * 8.5)))
    }
    widths[columnIndex - 1] = width
  }
  return widths
}

function resolveTableLayout(sheet: PreparedReferenceBatchSheet, globalColumnUnits: number[]): DocxTableLayout {
  const columnCount = sheet.columns.length + 1
  const units = globalColumnUnits.slice(0, columnCount)
  while (units.length < columnCount) units.push(8)
  const naturalWidths = contentColumnWidths(units)
  const naturalTableWidth = naturalWidths.reduce((sum, width) => sum + width, 0)
  if (sheet.tableNumber === '6') {
    return {
      tableWidth: TABLE6_LANDSCAPE_TABLE_WIDTH,
      columnWidths: fitColumnWidths(units, TABLE6_LANDSCAPE_TABLE_WIDTH),
      overflowsPage: false,
    }
  }
  if (naturalTableWidth > LANDSCAPE_TABLE_WIDTH) {
    return {
      tableWidth: naturalTableWidth,
      columnWidths: naturalWidths,
      overflowsPage: true,
    }
  }
  return {
    tableWidth: LANDSCAPE_TABLE_WIDTH,
    columnWidths: fitColumnWidths(units, LANDSCAPE_TABLE_WIDTH),
    overflowsPage: false,
  }
}

function captionFor(sheet: PreparedReferenceBatchSheet, stageName: string) {
  const stage = stageName.trim() ? `[${stageName.trim()}]` : ''
  const separator = sheet.directCaption ? '' : '-'
  return `表${sheet.tableNumber}${stage}${separator}${sheet.title}`
}

function needsSubHeaderRow(sheet: PreparedReferenceBatchSheet) {
  return sheet.columns.some((column) => {
    const subHeader = column.subHeader?.trim() ?? ''
    return subHeader && subHeader !== column.header
  })
}

function headerGroups(sheet: PreparedReferenceBatchSheet) {
  const groups: Array<{ start: number; end: number; header: string }> = []
  let start = 0
  while (start < sheet.columns.length) {
    const header = sheet.columns[start].header.trim()
    let end = start
    while (end + 1 < sheet.columns.length && sheet.columns[end + 1].header.trim() === header) end += 1
    groups.push({ start, end, header })
    start = end + 1
  }
  return groups
}

function isMergedSingleHeader(column: ReferenceBatchExportColumn) {
  const subHeader = column.subHeader?.trim() ?? ''
  return !subHeader || subHeader === column.header.trim()
}

function isTotalRow(row: ReferenceBatchExportRow) {
  return row.role === 'total' || /合计|小计/.test(row.label.trim())
}

function buildHeaderRows(sheet: PreparedReferenceBatchSheet, layout: DocxTableLayout, fontSize: number) {
  const hasSubHeaderRow = needsSubHeaderRow(sheet)
  const headerOptions: TableCellPresentation = {
    fill: HEADER_FILL_COLOR,
    bold: true,
    borders: HEADER_CELL_BORDERS,
    lineSpacing: 240,
  }
  const subHeaderOptions: TableCellPresentation = {
    fill: SUBHEADER_FILL_COLOR,
    bold: true,
    borders: HEADER_CELL_BORDERS,
    lineSpacing: 240,
  }
  const firstRowCells: TableCell[] = [
    tableCell(sheet.rowHeaderLabel ?? '№', layout.columnWidths[0], fontSize, {
      ...headerOptions,
      rowSpan: hasSubHeaderRow ? 2 : undefined,
    }),
  ]
  for (const group of headerGroups(sheet)) {
    const span = group.end - group.start + 1
    const width = layout.columnWidths
      .slice(group.start + 1, group.end + 2)
      .reduce((sum, current) => sum + current, 0)
    if (span > 1) {
      firstRowCells.push(tableCell(group.header, width, fontSize, { ...headerOptions, columnSpan: span }))
      continue
    }
    const column = sheet.columns[group.start]
    firstRowCells.push(tableCell(group.header, width, fontSize, {
      ...headerOptions,
      rowSpan: hasSubHeaderRow && isMergedSingleHeader(column) ? 2 : undefined,
    }))
  }

  const rows = [
    new TableRow({
      tableHeader: true,
      cantSplit: true,
      height: {
        value: hasSubHeaderRow ? EXCEL_SUBHEADER_ROW_HEIGHT : EXCEL_HEADER_ROW_HEIGHT,
        rule: HeightRule.ATLEAST,
      },
      children: firstRowCells,
    }),
  ]
  if (!hasSubHeaderRow) return rows

  const secondRowCells: TableCell[] = []
  for (const group of headerGroups(sheet)) {
    const span = group.end - group.start + 1
    for (let columnIndex = group.start; columnIndex <= group.end; columnIndex += 1) {
      const column = sheet.columns[columnIndex]
      if (span === 1 && isMergedSingleHeader(column)) continue
      secondRowCells.push(
        tableCell(column.subHeader ?? '', layout.columnWidths[columnIndex + 1], fontSize, subHeaderOptions)
      )
    }
  }
  rows.push(
    new TableRow({
      tableHeader: true,
      cantSplit: true,
      height: { value: EXCEL_SUBHEADER_ROW_HEIGHT, rule: HeightRule.ATLEAST },
      children: secondRowCells,
    })
  )
  return rows
}

function buildBodyRows(sheet: PreparedReferenceBatchSheet, layout: DocxTableLayout, fontSize: number) {
  const bodyRowHeight = sheet.reportDensity === 'compact' ? EXCEL_COMPACT_BODY_ROW_HEIGHT : EXCEL_BODY_ROW_HEIGHT
  return sheet.rows.map((row) => {
    if (row.role === 'section') {
      return new TableRow({
        cantSplit: true,
        height: { value: bodyRowHeight, rule: HeightRule.ATLEAST },
        children: [
          tableCell(row.label, layout.tableWidth, fontSize, {
            columnSpan: layout.columnWidths.length,
            fill: SECTION_FILL_COLOR,
            bold: true,
            alignment: AlignmentType.CENTER,
            borders: BODY_CELL_BORDERS,
          }),
        ],
      })
    }
    const totalRow = isTotalRow(row)
    const rowOptions: TableCellPresentation = {
      bold: totalRow,
      fill: totalRow ? TOTAL_FILL_COLOR : undefined,
      borders: totalRow ? TOTAL_CELL_BORDERS : BODY_CELL_BORDERS,
      lineSpacing: 240,
    }
    return new TableRow({
      cantSplit: true,
      height: { value: bodyRowHeight, rule: HeightRule.ATLEAST },
      children: [
        tableCell(row.label, layout.columnWidths[0], fontSize, {
          ...rowOptions,
          alignment: AlignmentType.CENTER,
        }),
        ...sheet.columns.map((column, index) =>
          tableCell(formatCellValue(row.values[index], column), layout.columnWidths[index + 1], fontSize, rowOptions)
        ),
      ],
    })
  })
}

function buildReportTable(sheet: PreparedReferenceBatchSheet, layout: DocxTableLayout) {
  const columnCount = sheet.columns.length + 1
  const fontSize = tableFontSize(columnCount)
  return new Table({
    width: { size: layout.tableWidth, type: WidthType.DXA },
    columnWidths: layout.columnWidths,
    alignment: layout.overflowsPage ? AlignmentType.LEFT : AlignmentType.CENTER,
    layout: TableLayoutType.FIXED,
    borders: TABLE_BORDERS,
    rows: [
      ...buildHeaderRows(sheet, layout, fontSize),
      ...buildBodyRows(sheet, layout, fontSize),
    ],
  })
}

function portraitPageProperties() {
  return {
    page: {
      size: {
        width: A4_PORTRAIT_WIDTH,
        height: A4_PORTRAIT_HEIGHT,
        orientation: PageOrientation.PORTRAIT,
      },
      margin: {
        top: NORMAL_PAGE_MARGIN,
        right: NORMAL_PAGE_MARGIN,
        bottom: NORMAL_PAGE_MARGIN,
        left: NORMAL_PAGE_MARGIN,
      },
    },
  }
}

function landscapePageProperties(tableWidth = LANDSCAPE_TABLE_WIDTH) {
  const pageWidth = Math.max(LANDSCAPE_PAGE_WIDTH, tableWidth + PAGE_MARGIN * 2)
  return {
    type: SectionType.NEXT_PAGE,
    page: {
      size: {
        // docx swaps width/height when serializing a landscape section.
        width: LANDSCAPE_PAGE_HEIGHT,
        height: pageWidth,
        orientation: PageOrientation.LANDSCAPE,
      },
      margin: { top: PAGE_MARGIN, right: PAGE_MARGIN, bottom: PAGE_MARGIN, left: PAGE_MARGIN },
    },
  }
}

function titlePageChildren(meta: ProcessTextExportMeta) {
  const methodName = meta.methodName?.trim() || `${meta.stageName}冶炼工艺`
  const date = meta.date ?? new Date()
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 480, after: 180 },
      children: [documentRun('冶金计算报告', 36, true, true)],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 480 },
      children: [documentRun(APP_NAME_ZH, 22)],
    }),
    new Paragraph({
      spacing: { after: 120 },
      children: [documentRun('软件简介', 24, true, true)],
    }),
    new Paragraph({
      spacing: { after: 240, line: 300 },
      children: [
        documentRun(
          `${APP_TAGLINE_ZH}本软件面向有色冶炼工程，提供配料计算、冶金过程计算、设备选型与三维设计的一体化支持，计算结果可导出为Excel、DOCX和MetCal流程文件。`,
          21
        ),
      ],
    }),
    new Paragraph({
      spacing: { after: 120 },
      children: [documentRun('开发单位简介', 24, true, true)],
    }),
    new Paragraph({
      spacing: { after: 240, line: 300 },
      children: [
        documentRun(
          `${APP_ORG_NAME_ZH}（简称长沙有色院）成立于1953年，是从事有色金属采选、冶炼、环保及工程设计咨询的综合性技术单位。`,
          21
        ),
      ],
    }),
    new Paragraph({
      spacing: { after: 80 },
      children: [documentRun('联系信息', 24, true, true)],
    }),
    new Paragraph({
      spacing: { after: 60, line: 240 },
      children: [
        documentRun('商务联系：电话：0731-84397032；邮箱：', 21),
        emailLink('cinf@chinalco.com.cn', 21),
      ],
    }),
    new Paragraph({
      spacing: { after: 60, line: 240 },
      children: [
        documentRun('开发者联系：', 21),
        emailLink('xuqianglai@outlook.com', 21),
      ],
    }),
    new Paragraph({
      spacing: { after: 240, line: 240 },
      children: [
        documentRun('地址：湖南省长沙市雨花区木莲东路299号', 21),
      ],
    }),
    new Paragraph({
      spacing: { after: 180 },
      children: [documentRun(`项目名称：${meta.caseName}`, 22)],
    }),
    new Paragraph({
      spacing: { after: 180 },
      children: [documentRun(`工艺阶段：${meta.stageName}`, 22)],
    }),
    new Paragraph({
      spacing: { after: 360 },
      children: [documentRun(`工艺方法：${methodName}`, 22)],
    }),
    new Paragraph({
      spacing: { after: 180 },
      children: [documentRun('工艺概述', 24, true, true)],
    }),
    new Paragraph({
      spacing: { after: 300 },
      children: [
        documentRun('【请在此填写项目概况、工艺路线、设计依据及必要的工艺说明；无需保留时可直接删除本段。】', 21),
      ],
    }),
    new Paragraph({
      spacing: { after: 360 },
      children: [
        documentRun('整理本次工艺计算的关键条件、计算结果和分析表格，便于复核、留档及编制后续技术文件。', 21),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      children: [documentRun(`导出日期：${formatExportDate(date)}`, 20)],
    }),
  ]
}

function reportSectionChildren(sheet: PreparedReferenceBatchSheet, layout: DocxTableLayout, stageName: string) {
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      keepNext: true,
      spacing: { after: 50 },
      children: [documentRun(captionFor(sheet, stageName), 26, true, true)],
    }),
    buildReportTable(sheet, layout),
    new Paragraph({ spacing: { before: 0, after: 0, line: 1 }, children: [] }),
  ]
}

export async function buildProcessTextExportDocx(
  meta: ProcessTextExportMeta,
  sheets: ReferenceBatchWorkbookSheet[]
): Promise<ArrayBuffer> {
  const preparedSheets = prepareReferenceBatchSheets(sheets)
  const globalColumnUnits = excelColumnWidthUnits(preparedSheets)
  const reportSections = preparedSheets.map((sheet) => ({
    sheet,
    layout: resolveTableLayout(sheet, globalColumnUnits),
  }))
  const document = new Document({
    creator: APP_ORG_NAME_ZH,
    title: '冶金计算报告',
    description: '由冶金工艺计算与三维设计一体化平台生成的冶金计算报告。',
    sections: [
      {
        properties: portraitPageProperties(),
        children: titlePageChildren(meta),
      },
      ...reportSections.map(({ sheet, layout }) => ({
        properties: landscapePageProperties(layout.tableWidth),
        children: reportSectionChildren(sheet, layout, meta.stageName),
      })),
    ],
  })
  return Packer.toArrayBuffer(document)
}
