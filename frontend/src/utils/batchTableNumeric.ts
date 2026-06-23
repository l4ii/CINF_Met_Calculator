/** 表格 UI 显示小数位（全站统一） */
export const BATCH_TABLE_DISPLAY_DIGITS = 2

/** 表格内部/导出全精度小数位（与 formatTableNumber 一致） */
export const BATCH_TABLE_FULL_DIGITS = 4

/** 单元格背后是否存在可展示的计算结果（与物相 pivot 判定一致） */
export const BATCH_TABLE_RESULT_EPSILON = 1e-12

export function batchTableHasResult(value: number | null | undefined): boolean {
  return Number.isFinite(value ?? NaN) && Math.abs(value ?? 0) > BATCH_TABLE_RESULT_EPSILON
}

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
  return value.toFixed(digits)
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

/** tooltip 用：尽可能保留有效小数位（最多 15 位，去除尾随零） */
export function formatBatchTableTooltip(value: string | number | null | undefined): string {
  if (value == null) return ''
  if (typeof value === 'string') {
    if (isBatchTableEmptyValue(value)) return ''
    const parsed = parseBatchTableNumeric(value)
    if (parsed == null) return value.trim()
    return formatBatchTableTooltip(parsed)
  }
  if (!Number.isFinite(value)) return ''
  if (value === 0) return '0'
  const fixed = value.toFixed(15)
  const trimmed = fixed.replace(/\.?0+$/, '')
  return trimmed || '0'
}

/** 列宽采样 / 稀疏判定：将单元格样本统一为可比较的字符串 */
export function batchTableSampleText(value: string | number | null | undefined): string {
  if (value == null) return ''
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return ''
    return formatBatchTableTooltip(value)
  }
  if (isBatchTableEmptyValue(value)) return ''
  return value.trim()
}

/** 导出等场景用 4 位小数；表格 tooltip 请用 formatBatchTableTooltip */
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

/** 显示值与 tooltip 全精度是否不同（需要 tooltip / 拦截复制） */
export function batchTableDisplayDiffersFromFull(value: string | number | null | undefined): boolean {
  if (value == null) return false
  if (typeof value === 'string' && isBatchTableEmptyValue(value)) return false
  const parsed = parseBatchTableNumeric(value)
  if (parsed == null) return false
  return formatBatchTableDisplay(parsed) !== formatBatchTableTooltip(parsed)
}

/** 合并业务说明与 tooltip 全精度数值 */
export function batchTableNumericTitle(
  value: string | number | null | undefined,
  helpTitle?: string
): string | undefined {
  const parsed = parseBatchTableNumeric(value)
  const tooltip = parsed != null ? formatBatchTableTooltip(parsed) : ''
  const parts: string[] = []
  if (helpTitle?.trim()) parts.push(helpTitle.trim())
  if (tooltip && batchTableDisplayDiffersFromFull(value)) parts.push(tooltip)
  return parts.length > 0 ? parts.join('\n') : undefined
}

export function batchTableCopyText(value: string | number | null | undefined): string {
  if (value == null) return ''
  if (typeof value === 'string' && isBatchTableEmptyValue(value)) return ''
  const parsed = parseBatchTableNumeric(value)
  if (parsed != null) return formatBatchTableTooltip(parsed)
  return typeof value === 'string' ? value.trim() : ''
}

type ClipboardLike = { preventDefault(): void; clipboardData: DataTransfer }

/** 复制时写入 tooltip 全精度；若与显示相同则走默认行为 */
export function writeBatchTableCopyText(
  event: ClipboardLike,
  value: string | number | null | undefined
): void {
  if (!batchTableDisplayDiffersFromFull(value)) return
  const full = formatBatchTableTooltip(value)
  if (!full) return
  event.preventDefault()
  event.clipboardData.setData('text/plain', full)
}
