export interface CopperBatchExportColumn {
  header: string
  subHeader?: string
}

export interface CopperBatchExportRow {
  label: string
  values: Array<string | number | null | undefined>
}

export interface CopperBatchExportHtmlInput {
  title: string
  columns: CopperBatchExportColumn[]
  rows: CopperBatchExportRow[]
}

export function getCopperStageExportName(stageName: string) {
  const trimmed = stageName.trim()
  if (trimmed.startsWith('铜')) return trimmed
  return `铜${trimmed}`
}

export function formatExportDate(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}${month}${day}`
}

export function sanitizeExcelFilePart(value: string) {
  return value.replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '').trim()
}

export function buildCopperBatchExportFilename({
  appName,
  stageName,
  date = new Date(),
}: {
  appName: string
  stageName: string
  date?: Date
}) {
  const safeAppName = sanitizeExcelFilePart(appName)
  const safeStageName = sanitizeExcelFilePart(getCopperStageExportName(stageName))
  return `${safeAppName}_${safeStageName}_${formatExportDate(date)}.xls`
}

export function escapeExcelHtml(value: string | number | null | undefined) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function buildCopperBatchExportHtml({ title, columns, rows }: CopperBatchExportHtmlInput) {
  const columnCount = columns.length + 1
  const headerRow = columns.map((column) => `<th>${escapeExcelHtml(column.header)}</th>`).join('')
  const subHeaderRow = columns.map((column) => `<th>${escapeExcelHtml(column.subHeader ?? '')}</th>`).join('')
  const bodyRows = rows
    .map((row) => {
      const cells = columns
        .map((_, index) => `<td>${escapeExcelHtml(row.values[index])}</td>`)
        .join('')
      return `<tr><th>${escapeExcelHtml(row.label)}</th>${cells}</tr>`
    })
    .join('')

  return `<!doctype html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
<head>
  <meta charset="utf-8" />
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
  <meta name="ProgId" content="Excel.Sheet" />
  <meta name="MimeType" content="application/vnd.ms-excel" />
  <style>
    table { border-collapse: collapse; font-family: "Microsoft YaHei", Arial, sans-serif; font-size: 11pt; }
    th, td { border: 1px solid #9ca3af; padding: 6px 8px; text-align: center; mso-number-format:"\\@"; }
    th { background: #f3f4f6; font-weight: 600; }
    .title { font-size: 15pt; text-align: left; background: #ffffff; }
  </style>
</head>
<body>
  <table>
    <tr><th class="title" colspan="${columnCount}">${escapeExcelHtml(title)}</th></tr>
    <tr><th>项目</th>${headerRow}</tr>
    <tr><th>名称</th>${subHeaderRow}</tr>
    ${bodyRows}
  </table>
</body>
</html>`
}

export function downloadCopperBatchExcel(filename: string, html: string) {
  const blob = new Blob(['\ufeff', html], { type: 'application/vnd.ms-excel;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}
