/** 配料总表固定列宽（px） */
export const BATCH_TABLE_CATEGORY_COL_WIDTH = 56
/** 投料量 t/h：约 5 字符宽 */
export const BATCH_TABLE_FEED_COL_WIDTH = 64
/** 占比 %：最大 100.0000 */
export const BATCH_TABLE_SHARE_COL_WIDTH = 72
/** 物相等中间数据列默认宽度（无样本时的回退） */
export const BATCH_TABLE_MIDDLE_COL_WIDTH = 56
/** 元素总表元素列默认宽度（与物相表数据列逻辑一致） */
export const BATCH_TABLE_ELEMENT_COL_WIDTH = BATCH_TABLE_MIDDLE_COL_WIDTH
/** 合计列：需容纳「100.0000」 */
export const BATCH_TABLE_TOTAL_COL_WIDTH = 80
export const BATCH_TABLE_OPS_COL_WIDTH = 64

/** 数据列最小/最大宽度（按表头与单元格内容估算） */
export const BATCH_TABLE_DATA_COL_MIN = 44
export const BATCH_TABLE_DATA_COL_MAX = 76
/** 全表无有效数值时的窄列（如 Ag、Au 全 0） */
export const BATCH_TABLE_SPARSE_COL_WIDTH = 40

/** 物相成分辅助表（透视）列宽 */
export const BATCH_TABLE_ASSIST_LABEL_COL_MIN = 48
/** 合计列需容纳四位小数合计及 w% 行 */
export const BATCH_TABLE_ASSIST_TOTAL_COL_MIN = 80
export const BATCH_TABLE_ASSIST_PHASE_COL_MIN = 44
export const BATCH_TABLE_ASSIST_ADD_COL_MIN = 32
/** 物相成分辅助表最少显示列数（含占位空列） */
export const BATCH_PHASE_ASSIST_MIN_DISPLAY_COLUMNS = 13

/** 配料总表「名称」列最小/最大宽度（px） */
export const BATCH_TABLE_NAME_COL_MIN = 128
export const BATCH_TABLE_NAME_COL_MAX = 360

/** 自定义下拉左右内边距 + 箭头区 */
const NAME_COL_SELECT_CHROME_PX = 36
/** 13px 中文名称约 15px/字 */
const NAME_COL_GLYPH_PX = 15
const DATA_COL_GLYPH_PX = 8.5
const DATA_COL_CHROME_PX = 14

export type FitColWidthsOptions = {
  flexibleIndices?: number[]
  /** 容器变宽时优先加宽的列（如 t/h、合计） */
  priorityIndices?: number[]
}

/** 按表头与样本字符串估算单列宽度 */
export function batchTableDataColWidth(header: string, samples: string[], sparse = false): number {
  if (sparse) return BATCH_TABLE_SPARSE_COL_WIDTH
  const texts = [header, ...samples.filter((s) => s && s !== '—')]
  const maxGlyphs = Math.max(2, ...texts.map((t) => Array.from(t).length))
  return Math.max(
    BATCH_TABLE_DATA_COL_MIN,
    Math.min(BATCH_TABLE_DATA_COL_MAX, Math.ceil(maxGlyphs * DATA_COL_GLYPH_PX) + DATA_COL_CHROME_PX)
  )
}

/** 样本是否可视为无数据（全 0 / 空 / —） */
export function isSparseDataColumn(samples: string[]): boolean {
  if (samples.length === 0) return true
  return samples.every((s) => {
    const t = s.trim()
    if (!t || t === '—') return true
    const n = Number.parseFloat(t)
    return Number.isFinite(n) && Math.abs(n) < 5e-5
  })
}

/** 按行内最长名称估算「名称」列宽（含下拉框内边距与箭头区） */
export function batchTableNameColWidthFromLabels(labels: string[]): number {
  const maxGlyphs = Math.max(
    2,
    ...labels.map((label) => Array.from((label.trim() || '—')).length)
  )
  const content = Math.ceil(maxGlyphs * NAME_COL_GLYPH_PX) + NAME_COL_SELECT_CHROME_PX
  return Math.max(BATCH_TABLE_NAME_COL_MIN, Math.min(BATCH_TABLE_NAME_COL_MAX, content))
}

function sumElementTableFixed(nameColWidth: number, elementColWidths: number[]): number {
  return (
    BATCH_TABLE_CATEGORY_COL_WIDTH +
    nameColWidth +
    BATCH_TABLE_FEED_COL_WIDTH +
    BATCH_TABLE_SHARE_COL_WIDTH +
    elementColWidths.reduce((sum, width) => sum + width, 0) +
    BATCH_TABLE_TOTAL_COL_WIDTH
  )
}

function sumPhaseTableFixed(nameColWidth: number, phaseColWidths: number[]): number {
  return (
    BATCH_TABLE_CATEGORY_COL_WIDTH +
    nameColWidth +
    BATCH_TABLE_FEED_COL_WIDTH +
    phaseColWidths.reduce((sum, width) => sum + width, 0) +
    BATCH_TABLE_TOTAL_COL_WIDTH +
    BATCH_TABLE_OPS_COL_WIDTH
  )
}

/**
 * 将列宽数组按容器宽度撑满：仅 flexible/priority 列参与拉伸，数据列保持内容宽度。
 */
export function fitColWidths(
  minWidths: number[],
  containerWidth: number,
  options?: number[] | FitColWidthsOptions
): { widths: number[]; tableWidth: number } {
  const flexibleIndices = Array.isArray(options)
    ? options
    : options?.flexibleIndices && options.flexibleIndices.length > 0
      ? options.flexibleIndices
      : minWidths.map((_, index) => index)
  const priorityIndices = Array.isArray(options) ? undefined : options?.priorityIndices

  const minSum = minWidths.reduce((sum, width) => sum + width, 0)
  if (minSum <= 0) {
    return { widths: [...minWidths], tableWidth: Math.max(0, containerWidth) }
  }
  const target = containerWidth > 0 ? Math.max(minSum, containerWidth) : minSum
  const extra = target - minSum
  if (extra <= 0) {
    return { widths: [...minWidths], tableWidth: minSum }
  }

  const flex = flexibleIndices.filter((index) => index >= 0 && index < minWidths.length)
  if (flex.length === 0) {
    return { widths: [...minWidths], tableWidth: minSum }
  }

  const widths = [...minWidths]
  const priority = (priorityIndices ?? []).filter((index) => flex.includes(index))
  const secondary = flex.filter((index) => !priority.includes(index))

  const distribute = (indices: number[], amount: number) => {
    if (amount <= 0 || indices.length === 0) return 0
    const flexMin = indices.reduce((sum, index) => sum + minWidths[index], 0)
    let remainder = amount
    indices.forEach((index, order) => {
      const isLast = order === indices.length - 1
      const share = isLast ? remainder : Math.floor((amount * minWidths[index]) / flexMin)
      widths[index] += share
      remainder -= share
    })
    return amount - remainder
  }

  if (priority.length > 0) {
    const toPriority = Math.floor(extra * 0.65)
    distribute(priority, toPriority)
    distribute(secondary.length > 0 ? secondary : priority, extra - toPriority)
  } else {
    distribute(flex, extra)
  }

  return { widths, tableWidth: target }
}

/** 元素总表最小列宽（无 H₂O 列） */
export function batchElementTableMinColWidths(
  nameColWidth: number,
  elementColWidths: number[]
): number[] {
  return [
    BATCH_TABLE_CATEGORY_COL_WIDTH,
    nameColWidth,
    BATCH_TABLE_FEED_COL_WIDTH,
    BATCH_TABLE_SHARE_COL_WIDTH,
    ...elementColWidths,
    BATCH_TABLE_TOTAL_COL_WIDTH,
  ]
}

/** 物相总表最小列宽 */
export function batchPhaseTableMinColWidths(nameColWidth: number, phaseColWidths: number[]): number[] {
  return [
    BATCH_TABLE_CATEGORY_COL_WIDTH,
    nameColWidth,
    BATCH_TABLE_FEED_COL_WIDTH,
    ...phaseColWidths,
    BATCH_TABLE_TOTAL_COL_WIDTH,
    BATCH_TABLE_OPS_COL_WIDTH,
  ]
}

/** 元素总表整体宽度（列宽之和） */
export function batchElementTableWidth(
  elementColumnCountOrWidths: number | number[],
  nameColWidth: number
): number {
  const elementColWidths = Array.isArray(elementColumnCountOrWidths)
    ? elementColumnCountOrWidths
    : Array.from({ length: elementColumnCountOrWidths }, () => BATCH_TABLE_ELEMENT_COL_WIDTH)
  return sumElementTableFixed(nameColWidth, elementColWidths)
}

/** 物相总表整体宽度 */
export function batchPhaseTableWidth(
  phaseRowCountOrWidths: number | number[],
  nameColWidth: number
): number {
  const phaseColWidths = Array.isArray(phaseRowCountOrWidths)
    ? phaseRowCountOrWidths
    : Array.from({ length: phaseRowCountOrWidths }, () => BATCH_TABLE_MIDDLE_COL_WIDTH)
  return sumPhaseTableFixed(nameColWidth, phaseColWidths)
}

/**
 * 固定列保持 min 宽，数据列将容器剩余宽度均分（每列至少为内容 min）。
 */
export function distributeBatchDataColumnWidths(
  leadingFixed: number[],
  dataMinWidths: number[],
  trailingFixed: number[],
  containerWidth: number
): number[] {
  const minWidths = [...leadingFixed, ...dataMinWidths, ...trailingFixed]
  const fixedSum = leadingFixed.reduce((sum, width) => sum + width, 0) + trailingFixed.reduce((sum, width) => sum + width, 0)
  const dataMinSum = dataMinWidths.reduce((sum, width) => sum + width, 0)
  const minTotal = fixedSum + dataMinSum
  if (containerWidth <= 0 || dataMinWidths.length === 0 || containerWidth <= minTotal) {
    return minWidths
  }
  const extra = containerWidth - minTotal
  const n = dataMinWidths.length
  const per = Math.floor(extra / n)
  const remainder = extra - per * n
  const expanded = dataMinWidths.map((min, index) => min + per + (index === n - 1 ? remainder : 0))
  return [...leadingFixed, ...expanded, ...trailingFixed]
}

/** 元素总表 colgroup 各列宽度（顺序与表头一致） */
export function batchElementTableColWidths(
  nameColWidth: number,
  elementColWidths: number[],
  containerWidth = 0
): number[] {
  const leadingFixed = [
    BATCH_TABLE_CATEGORY_COL_WIDTH,
    nameColWidth,
    BATCH_TABLE_FEED_COL_WIDTH,
    BATCH_TABLE_SHARE_COL_WIDTH,
  ]
  const trailingFixed = [BATCH_TABLE_TOTAL_COL_WIDTH]
  return distributeBatchDataColumnWidths(leadingFixed, elementColWidths, trailingFixed, containerWidth)
}

/** 物相总表 colgroup 各列宽度 */
export function batchPhaseTableColWidths(
  nameColWidth: number,
  phaseColWidths: number[],
  containerWidth = 0
): number[] {
  const leadingFixed = [BATCH_TABLE_CATEGORY_COL_WIDTH, nameColWidth, BATCH_TABLE_FEED_COL_WIDTH]
  const trailingFixed = [BATCH_TABLE_TOTAL_COL_WIDTH, BATCH_TABLE_OPS_COL_WIDTH]
  return distributeBatchDataColumnWidths(leadingFixed, phaseColWidths, trailingFixed, containerWidth)
}

export type PhaseAssistColumnWidthInput = {
  header: string
  samples: string[]
  hasData: boolean
  isDraft: boolean
}

/** 物相成分辅助表：单列物相宽度（无数据压缩，有数据按表头与单元格内容） */
export function batchPhaseAssistPhaseColWidth(column: PhaseAssistColumnWidthInput): number {
  const header = column.header.trim() || '物相'
  if (column.isDraft) {
    return batchTableDataColWidth(header, [header, '待填物相', 'Cu2S2'], false)
  }
  if (!column.hasData) {
    return batchTableDataColWidth(header, [header, '0'], true)
  }
  return batchTableDataColWidth(header, [header, ...column.samples], false)
}

/** 物相计算表最小列宽（均匀回退） */
export function batchPhaseAssistMinColWidths(
  phaseColumnCount: number,
  options?: { labelWidth?: number; totalWidth?: number }
): number[] {
  return [
    options?.labelWidth ?? BATCH_TABLE_ASSIST_LABEL_COL_MIN,
    options?.totalWidth ?? BATCH_TABLE_ASSIST_TOTAL_COL_MIN,
    ...Array.from({ length: phaseColumnCount }, () => BATCH_TABLE_ASSIST_PHASE_COL_MIN),
    BATCH_TABLE_ASSIST_ADD_COL_MIN,
  ]
}

/** 物相成分辅助表 colgroup：固定 label/合计，物相列均分剩余宽度 */
export function batchPhaseAssistColWidths(
  phaseColumnCountOrWidths: number | number[],
  containerWidth = 0,
  options?: { labelWidth?: number; totalWidth?: number }
): { widths: number[]; tableWidth: number } {
  const phaseColWidths = Array.isArray(phaseColumnCountOrWidths)
    ? phaseColumnCountOrWidths
    : Array.from({ length: phaseColumnCountOrWidths }, () => BATCH_TABLE_ASSIST_PHASE_COL_MIN)
  const leadingFixed = [
    options?.labelWidth ?? BATCH_TABLE_ASSIST_LABEL_COL_MIN,
    options?.totalWidth ?? BATCH_TABLE_ASSIST_TOTAL_COL_MIN,
  ]
  const trailingFixed = [BATCH_TABLE_ASSIST_ADD_COL_MIN]
  const widths = distributeBatchDataColumnWidths(leadingFixed, phaseColWidths, trailingFixed, containerWidth)
  const tableWidth = widths.reduce((sum, width) => sum + width, 0)
  return { widths, tableWidth }
}

/** 根据表头行、w% 行与元素行样本生成物相成分辅助表列宽 */
export function computePhaseAssistTableLayout(params: {
  labelSamples: string[]
  totalSamples: string[]
  phaseColumns: PhaseAssistColumnWidthInput[]
  containerWidth?: number
}): { widths: number[]; tableWidth: number } {
  const labelWidth = batchTableDataColWidth('物相', params.labelSamples, false)
  const totalWidth = Math.max(
    BATCH_TABLE_ASSIST_TOTAL_COL_MIN,
    batchTableDataColWidth('合计', params.totalSamples, false)
  )
  const phaseColWidths = params.phaseColumns.map((column) => batchPhaseAssistPhaseColWidth(column))
  return batchPhaseAssistColWidths(phaseColWidths, params.containerWidth ?? 0, { labelWidth, totalWidth })
}
