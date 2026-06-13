/** 表格 UI 显示小数位（全站统一） */
export const BATCH_TABLE_DISPLAY_DIGITS = 2

/** 表格内部/导出全精度小数位（与 formatTableNumber 一致） */
export const BATCH_TABLE_FULL_DIGITS = 4

const EMPTY_MARKERS = new Set(['', '—', '-', '–'])

export function isBatchTableEmptyValue(text: string | null | undefined): boolean {
  const t = (text ?? '').trim()
  return !t || EMPTY_MARKERS.has(t)
}

export function parseBatchTableNumeric(text: string | number | null | undefined): number | null {
  if (text == null) return null
  if (typeof text === 'number') return Number.isFinite(text) ? text : null
  const t = text.trim().replace(',', '.')
  if (isBatchTableEmptyValue(t)) return null
  const n = Number.parseFloat(t)
  return Number.isFinite(n) ? n : null
}

function formatFixed(value: number, digits: number): string {
  if (!Number.isFinite(value)) return '—'
  return Number(value.toFixed(digits)).toString()
}

/** 单元格界面显示（2 位小数） */
export function formatBatchTableDisplay(value: string | number | null | undefined): string {
  if (value == null) return ''
  if (typeof value === 'string') {
    if (isBatchTableEmptyValue(value)) return value.trim() === '—' ? '—' : ''
    const parsed = parseBatchTableNumeric(value)
    if (parsed == null) return value
    return formatFixed(parsed, BATCH_TABLE_DISPLAY_DIGITS)
  }
  return formatFixed(value, BATCH_TABLE_DISPLAY_DIGITS)
}

/** tooltip / 复制用全精度（4 位小数） */
export function formatBatchTableFull(value: string | number | null | undefined): string {
  if (value == null) return ''
  if (typeof value === 'string') {
    if (isBatchTableEmptyValue(value)) return ''
    const parsed = parseBatchTableNumeric(value)
    if (parsed == null) return value.trim()
    return formatFixed(parsed, BATCH_TABLE_FULL_DIGITS)
  }
  return formatFixed(value, BATCH_TABLE_FULL_DIGITS)
}

/** 显示值与全精度是否不同（需要 tooltip / 拦截复制） */
export function batchTableDisplayDiffersFromFull(value: string | number | null | undefined): boolean {
  if (value == null) return false
  if (typeof value === 'string' && isBatchTableEmptyValue(value)) return false
  const parsed = parseBatchTableNumeric(value)
  if (parsed == null) return false
  return formatBatchTableDisplay(parsed) !== formatBatchTableFull(parsed)
}

/** 合并业务说明与全精度 tooltip */
export function batchTableNumericTitle(
  value: string | number | null | undefined,
  helpTitle?: string
): string | undefined {
  const full = formatBatchTableFull(value)
  const parts: string[] = []
  if (helpTitle?.trim()) parts.push(helpTitle.trim())
  if (full && batchTableDisplayDiffersFromFull(value)) parts.push(full)
  return parts.length > 0 ? parts.join('\n') : undefined
}

type ClipboardLike = { preventDefault(): void; clipboardData: DataTransfer }

/** 复制时写入全精度；若与显示相同则走默认行为 */
export function writeBatchTableCopyText(
  event: ClipboardLike,
  value: string | number | null | undefined
): void {
  if (!batchTableDisplayDiffersFromFull(value)) return
  const full = formatBatchTableFull(value)
  if (!full) return
  event.preventDefault()
  event.clipboardData.setData('text/plain', full)
}
