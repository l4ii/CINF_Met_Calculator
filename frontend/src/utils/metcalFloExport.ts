import { formatExportDate, getCopperStageExportName, sanitizeExcelFilePart } from './copperBatchExport.ts'

export function buildMetcalFloExportFilename({
  stageName,
  caseName,
  date = new Date(),
}: {
  stageName: string
  caseName?: string
  date?: Date
}) {
  const safeStageName = sanitizeExcelFilePart(getCopperStageExportName(stageName))
  const safeCaseName = caseName ? sanitizeExcelFilePart(caseName) : ''
  const parts = safeCaseName
    ? [safeCaseName, safeStageName, formatExportDate(date)]
    : [safeStageName, formatExportDate(date)]
  return `${parts.join('_')}.flo`
}

export function downloadMetcalFloFile(filename: string, buffer: ArrayBuffer) {
  const blob = new Blob([buffer], { type: 'application/octet-stream' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename.endsWith('.flo') ? filename : `${filename}.flo`
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

export type MetcalFloSaveResult =
  | { ok: true; filePath?: string }
  | { ok: false; cancelled?: boolean; error?: string }

export async function saveMetcalFloFile(
  filename: string,
  buffer: ArrayBuffer,
  saveToFile?: (fileName: string, buffer: ArrayBuffer) => Promise<MetcalFloSaveResult>
): Promise<MetcalFloSaveResult> {
  if (saveToFile) {
    return saveToFile(filename, buffer)
  }
  downloadMetcalFloFile(filename, buffer)
  return { ok: true }
}
