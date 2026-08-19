/** 配料总表固定列宽（px） */
import { batchTableSampleText } from './batchTableNumeric.ts'

export const BATCH_TABLE_CATEGORY_COL_WIDTH = 56

/** 数据列最小/最大宽度（按表头与单元格内容估算） */
export const BATCH_TABLE_DATA_COL_MIN = 44
export const BATCH_TABLE_DATA_COL_MAX = 76
/** 全表无有效数值时的窄列（如 Ag、Au 全 0） */
export const BATCH_TABLE_SPARSE_COL_WIDTH = 40

/** 自定义下拉左右内边距 + 箭头区 */
const NAME_COL_SELECT_CHROME_PX = 36
/** 13px 中文名称约 15px/字 */
const NAME_COL_GLYPH_PX = 15
const DATA_COL_GLYPH_PX = 8.5
const DATA_COL_CHROME_PX = 14

/** 2 位小数 w% 列绝对下限（约 "100.00"，紧凑 padding） */
export const BATCH_TABLE_PCT_ABS_MIN = Math.max(
  BATCH_TABLE_DATA_COL_MIN,
  Math.ceil(6 * DATA_COL_GLYPH_PX) + 8
)
/** 2 位小数 w% 列名义最小宽 */
export const BATCH_TABLE_PCT_COL_WIDTH = BATCH_TABLE_PCT_ABS_MIN
/** 投料量 t/h 列绝对下限（2 位小数，约 9999.99） */
export const BATCH_TABLE_MASS_ABS_MIN = Math.max(
  BATCH_TABLE_DATA_COL_MIN,
  Math.ceil(7 * DATA_COL_GLYPH_PX) + 10
)
/** 投料量 t/h 列名义最小宽 */
export const BATCH_TABLE_MASS_COL_WIDTH = BATCH_TABLE_MASS_ABS_MIN
/** @deprecated 使用 BATCH_TABLE_MASS_COL_WIDTH */
export const BATCH_TABLE_FEED_COL_WIDTH = BATCH_TABLE_MASS_COL_WIDTH
/** 占比 %：最大 100.0000 */
export const BATCH_TABLE_SHARE_COL_WIDTH = 72
/** 物相等中间数据列默认宽度（无样本时的回退） */
export const BATCH_TABLE_MIDDLE_COL_WIDTH = 56
/** 元素总表元素列默认宽度（与物相表数据列逻辑一致） */
export const BATCH_TABLE_ELEMENT_COL_WIDTH = BATCH_TABLE_PCT_COL_WIDTH
/** 物相式列最大宽度：长式名折行，不因式名拉宽 */
export const BATCH_TABLE_PHASE_FORMULA_COL_MAX = 72

/**
 * 物相列定宽用样本：长化学式（如 3Al2O3·2SiO2）不参与定宽，避免单列过宽。
 */
export function phaseFormulaWidthSample(formulaOrLabel: string): string {
  const text = String(formulaOrLabel ?? '').trim()
  if (!text) return ''
  const compact = text.replace(/[^A-Za-z0-9]/g, '')
  if (/[A-Za-z]/.test(text) && compact.length > 6) return 'Fe3O4'
  return text
}
/** 合计列（2 位小数，约 100.00） */
export const BATCH_TABLE_TOTAL_COL_WIDTH = BATCH_TABLE_PCT_COL_WIDTH
export const BATCH_TABLE_OPS_COL_WIDTH = 64

/** 物相成分辅助表（透视）列宽 */
export const BATCH_TABLE_ASSIST_LABEL_COL_MIN = 48
/** 合计列需容纳四位小数合计及 w% 行 */
export const BATCH_TABLE_ASSIST_TOTAL_COL_MIN = 80
export const BATCH_TABLE_ASSIST_PHASE_COL_MIN = 44
export const BATCH_TABLE_ASSIST_ADD_COL_MIN = 32
/** 物相成分辅助表最少显示列数（含占位空列） */
export const BATCH_PHASE_ASSIST_MIN_DISPLAY_COLUMNS = 13
/** 物相成分辅助表计算前最少占位元素行数（左侧不显示元素名） */
export const BATCH_PHASE_ASSIST_MIN_DISPLAY_ELEMENT_ROWS = 5

/** 添加原料弹窗固定列宽 */
export const LIBRARY_DIALOG_NAME_COL_WIDTH = 160
export const LIBRARY_DIALOG_CATEGORY_COL_WIDTH = 88
export const LIBRARY_DIALOG_LABEL_COL_WIDTH = 48
export const LIBRARY_DIALOG_ADD_COL_WIDTH = 40
export const LIBRARY_DIALOG_OTHER_COL_WIDTH = 80
export const LIBRARY_DIALOG_TOTAL_COL_WIDTH = 80
export const LIBRARY_DIALOG_OPS_COL_WIDTH = 80
export const LIBRARY_DIALOG_ELEMENT_COL_MIN = 56
export const LIBRARY_DIALOG_ELEMENT_COL_MAX = 96

/** 配料总表「名称」列最小/最大宽度（px） */
export const BATCH_TABLE_NAME_COL_MIN = 128
export const BATCH_TABLE_NAME_COL_MAX = 360

export type FitColWidthsOptions = {
  flexibleIndices?: number[]
  /** 容器变宽时优先加宽的列（如 t/h、合计） */
  priorityIndices?: number[]
}

/** 按表头与样本字符串估算单列宽度 */
export function batchTableDataColWidth(
  header: string,
  samples: Array<string | number>,
  sparse = false,
  options?: { min?: number; max?: number }
): number {
  if (sparse) return BATCH_TABLE_SPARSE_COL_WIDTH
  const texts = [
    header,
    ...samples
      .map((s) => batchTableSampleText(s))
      .filter((s) => s && s !== '—'),
  ]
  const maxGlyphs = Math.max(2, ...texts.map((t) => Array.from(t).length))
  const min = options?.min ?? BATCH_TABLE_DATA_COL_MIN
  const max = options?.max ?? BATCH_TABLE_DATA_COL_MAX
  return Math.max(min, Math.min(max, Math.ceil(maxGlyphs * DATA_COL_GLYPH_PX) + DATA_COL_CHROME_PX))
}

/** 样本是否可视为无数据（全 0 / 空 / —） */
export function isSparseDataColumn(samples: Array<string | number>): boolean {
  if (samples.length === 0) return true
  return samples.every((s) => {
    const t = batchTableSampleText(s)
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
    BATCH_TABLE_TOTAL_COL_WIDTH
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
  ]
}

/** 元素总表整体宽度（列宽之和） */
export function fixedBatchElementColumnWidths(elementCount: number): number[] {
  return Array.from({ length: elementCount }, () => BATCH_TABLE_PCT_COL_WIDTH)
}

export function batchElementTableWidth(
  elementColumnCountOrWidths: number | number[],
  nameColWidth: number
): number {
  const elementColWidths = Array.isArray(elementColumnCountOrWidths)
    ? elementColumnCountOrWidths
    : fixedBatchElementColumnWidths(elementColumnCountOrWidths)
  return sumElementTableFixed(nameColWidth, elementColWidths)
}

/** 物相总表整体宽度 */
export function fixedBatchPhaseColumnWidths(phaseRowCount: number): number[] {
  return Array.from({ length: phaseRowCount }, () => BATCH_TABLE_PCT_COL_WIDTH)
}

export function batchPhaseTableWidth(
  phaseRowCountOrWidths: number | number[],
  nameColWidth: number
): number {
  const phaseColWidths = Array.isArray(phaseRowCountOrWidths)
    ? phaseRowCountOrWidths
    : fixedBatchPhaseColumnWidths(phaseRowCountOrWidths)
  return sumPhaseTableFixed(nameColWidth, phaseColWidths)
}

export type BatchElementColumnWidthMeta = {
  width: number
  sparse: boolean
}

/** 按表头 + 单元格样本估算各元素列宽（含稀疏列标记） */
export function batchElementColumnWidthMeta<T extends string>(
  elementKeys: readonly T[],
  headerLabel: (element: T) => string,
  samplesForElement: (element: T) => Array<string | number>
): BatchElementColumnWidthMeta[] {
  return elementKeys.map((element) => {
    const samples = samplesForElement(element)
    const sparse = isSparseDataColumn(samples)
    const width = batchTableDataColWidth(headerLabel(element), samples, sparse)
    return { width, sparse }
  })
}

/**
 * 固定列保持 min 宽；容器有余量时仅向非稀疏数据列按内容宽度比例分配，避免 Ag/Au 等全 0 列被撑宽。
 */
export function distributeBatchDataColumnWidths(
  leadingFixed: number[],
  dataMinWidths: number[],
  trailingFixed: number[],
  containerWidth: number,
  dataSparseFlags?: boolean[]
): number[] {
  const minWidths = [...leadingFixed, ...dataMinWidths, ...trailingFixed]
  const fixedSum = leadingFixed.reduce((sum, width) => sum + width, 0) + trailingFixed.reduce((sum, width) => sum + width, 0)
  const dataMinSum = dataMinWidths.reduce((sum, width) => sum + width, 0)
  const minTotal = fixedSum + dataMinSum
  if (containerWidth <= 0 || dataMinWidths.length === 0 || containerWidth <= minTotal) {
    return minWidths
  }
  const extra = containerWidth - minTotal
  const sparseFlags =
    dataSparseFlags ?? dataMinWidths.map((width) => width <= BATCH_TABLE_SPARSE_COL_WIDTH + 1)
  const flexIndices = dataMinWidths.map((_, index) => index).filter((index) => !sparseFlags[index])
  if (flexIndices.length === 0) {
    return minWidths
  }
  const expanded = [...dataMinWidths]
  const flexMinSum = flexIndices.reduce((sum, index) => sum + dataMinWidths[index], 0)
  let remainder = extra
  flexIndices.forEach((index, order) => {
    const isLast = order === flexIndices.length - 1
    const share = isLast ? remainder : Math.floor((extra * dataMinWidths[index]) / flexMinSum)
    expanded[index] += share
    remainder -= share
  })
  return [...leadingFixed, ...expanded, ...trailingFixed]
}

export type BatchTableColLayout = { widths: number[]; tableWidth: number }

export type FitBatchTableToViewportOptions = {
  flexibleIndices: number[]
  absoluteMinWidths?: number[]
  /** 可压缩至 BATCH_TABLE_NAME_COL_MIN 的名称列索引 */
  nameColIndex?: number
}

function sumWidths(widths: number[]) {
  return widths.reduce((sum, width) => sum + width, 0)
}

function expandFlexEvenly(widths: number[], flex: number[], extra: number) {
  if (extra <= 0 || flex.length === 0) return
  const per = Math.floor(extra / flex.length)
  let remainder = extra - per * flex.length
  flex.forEach((index, order) => {
    widths[index] += per + (order < remainder ? 1 : 0)
  })
}

function shrinkFlexProportional(
  widths: number[],
  flex: number[],
  absMins: number[],
  amount: number
): number {
  if (amount <= 0 || flex.length === 0) return 0
  const caps = flex.map((index) => Math.max(0, widths[index] - absMins[index]))
  const totalCap = caps.reduce((sum, cap) => sum + cap, 0)
  if (totalCap <= 0) return 0
  const shrinkBy = Math.min(amount, totalCap)
  let remaining = shrinkBy
  flex.forEach((index, order) => {
    const isLast = order === flex.length - 1
    const share = isLast ? remaining : Math.floor((shrinkBy * caps[order]) / totalCap)
    widths[index] -= share
    remaining -= share
  })
  flex.forEach((index) => {
    widths[index] = Math.max(absMins[index], widths[index])
  })
  return shrinkBy
}

function nudgeWidthsToTarget(
  widths: number[],
  flex: number[],
  absMins: number[],
  target: number
) {
  let diff = target - sumWidths(widths)
  if (diff === 0 || flex.length === 0) return
  let guard = 0
  while (diff !== 0 && guard < flex.length * 200) {
    const index = flex[guard % flex.length]
    if (diff > 0) {
      widths[index] += 1
      diff -= 1
    } else if (widths[index] > absMins[index]) {
      widths[index] -= 1
      diff += 1
    }
    guard += 1
  }
}

/**
 * 双向适配视口：容器宽于最小宽时均分撑满；窄于最小宽时按比例压缩 flexible 列（不低于 absoluteMin），必要时压缩名称列。
 */
export function fitBatchTableToViewport(
  minWidths: number[],
  containerWidth: number,
  options: FitBatchTableToViewportOptions
): BatchTableColLayout {
  const flex = options.flexibleIndices.filter((index) => index >= 0 && index < minWidths.length)
  const absMins =
    options.absoluteMinWidths && options.absoluteMinWidths.length === minWidths.length
      ? options.absoluteMinWidths
      : [...minWidths]
  const widths = [...minWidths]
  const minSum = sumWidths(minWidths)
  const targetWidth = containerWidth > 0 ? containerWidth : minSum

  if (flex.length === 0) {
    return { widths, tableWidth: Math.max(minSum, targetWidth) }
  }

  if (minSum <= targetWidth) {
    expandFlexEvenly(widths, flex, targetWidth - minSum)
    nudgeWidthsToTarget(widths, flex, absMins, targetWidth)
    return { widths, tableWidth: targetWidth }
  }

  let excess = minSum - targetWidth
  excess -= shrinkFlexProportional(widths, flex, absMins, excess)

  const nameIndex = options.nameColIndex
  if (excess > 0 && nameIndex != null && nameIndex >= 0 && nameIndex < widths.length) {
    const nameAbsMin = Math.max(0, absMins[nameIndex] ?? BATCH_TABLE_NAME_COL_MIN)
    const nameShrink = Math.min(excess, widths[nameIndex] - nameAbsMin)
    if (nameShrink > 0) {
      widths[nameIndex] -= nameShrink
      excess -= nameShrink
    }
  }

  if (excess > 0) {
    const tableWidth = sumWidths(widths)
    return { widths, tableWidth }
  }

  nudgeWidthsToTarget(widths, flex, absMins, targetWidth)
  return { widths, tableWidth: targetWidth }
}

/** @deprecated 使用 fitBatchTableToViewport */
export function distributeBatchTableEvenly(
  minWidths: number[],
  containerWidth: number,
  flexibleIndices: number[]
): BatchTableColLayout {
  return fitBatchTableToViewport(minWidths, containerWidth, { flexibleIndices })
}

/** 元素总表 colgroup：最小宽 + 视口双向 fit */
export function batchElementTableColWidths(
  nameColWidth: number,
  elementCount: number,
  containerWidth = 0,
  elementAbsMinWidths?: number[]
): BatchTableColLayout {
  const elementMins =
    elementAbsMinWidths ??
    Array.from({ length: elementCount }, () => BATCH_TABLE_PCT_COL_WIDTH)
  const minWidths = [
    BATCH_TABLE_CATEGORY_COL_WIDTH,
    nameColWidth,
    BATCH_TABLE_MASS_COL_WIDTH,
    ...elementMins,
    BATCH_TABLE_TOTAL_COL_WIDTH,
  ]
  const absMins = [
    BATCH_TABLE_CATEGORY_COL_WIDTH,
    BATCH_TABLE_NAME_COL_MIN,
    BATCH_TABLE_MASS_ABS_MIN,
    ...elementMins,
    BATCH_TABLE_PCT_ABS_MIN,
  ]
  const flexIndices = [
    2,
    ...Array.from({ length: elementCount }, (_, index) => 3 + index),
    minWidths.length - 1,
  ]
  return fitBatchTableToViewport(minWidths, containerWidth, {
    flexibleIndices: flexIndices,
    absoluteMinWidths: absMins,
    nameColIndex: 1,
  })
}

/** 物相总表 colgroup：最小宽 + 视口双向 fit */
export function batchPhaseTableColWidths(
  nameColWidth: number,
  phaseRowCount: number,
  containerWidth = 0,
  phaseAbsMinWidths?: number[]
): BatchTableColLayout {
  const phaseMins = phaseAbsMinWidths ?? fixedBatchPhaseColumnWidths(phaseRowCount)
  const minWidths = [
    BATCH_TABLE_CATEGORY_COL_WIDTH,
    nameColWidth,
    BATCH_TABLE_MASS_COL_WIDTH,
    ...phaseMins,
    BATCH_TABLE_TOTAL_COL_WIDTH,
  ]
  const absMins = [
    BATCH_TABLE_CATEGORY_COL_WIDTH,
    BATCH_TABLE_NAME_COL_MIN,
    BATCH_TABLE_MASS_ABS_MIN,
    ...phaseMins.map(() => BATCH_TABLE_PCT_ABS_MIN),
    BATCH_TABLE_PCT_ABS_MIN,
  ]
  const flexIndices = [
    2,
    ...Array.from({ length: phaseRowCount }, (_, index) => 3 + index),
    minWidths.length - 1,
  ]
  return fitBatchTableToViewport(minWidths, containerWidth, {
    flexibleIndices: flexIndices,
    absoluteMinWidths: absMins,
    nameColIndex: 1,
  })
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
    return batchTableDataColWidth(header, [header, '0'], false)
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
  options?: { labelWidth?: number; totalWidth?: number; includeActionColumn?: boolean }
): { widths: number[]; tableWidth: number } {
  const phaseColWidths = Array.isArray(phaseColumnCountOrWidths)
    ? phaseColumnCountOrWidths
    : Array.from({ length: phaseColumnCountOrWidths }, () => BATCH_TABLE_ASSIST_PHASE_COL_MIN)
  const leadingFixed = [
    options?.labelWidth ?? BATCH_TABLE_ASSIST_LABEL_COL_MIN,
    options?.totalWidth ?? BATCH_TABLE_ASSIST_TOTAL_COL_MIN,
  ]
  const trailingFixed = options?.includeActionColumn === false ? [] : [BATCH_TABLE_ASSIST_ADD_COL_MIN]
  const widths = distributeBatchDataColumnWidths(leadingFixed, phaseColWidths, trailingFixed, containerWidth)
  const tableWidth = widths.reduce((sum, width) => sum + width, 0)
  return { widths, tableWidth }
}

export type LibraryDialogColumnWidthInput = {
  header: string
  samples: string[]
}

/** 添加原料弹窗：按容器宽度与元素列内容估算各列宽度 */
export function computeLibraryDialogColWidths(
  elementColumns: LibraryDialogColumnWidthInput[],
  containerWidth = 0
): { widths: number[]; tableWidth: number; elementColWidths: number[] } {
  const leadingFixed = [
    LIBRARY_DIALOG_NAME_COL_WIDTH,
    LIBRARY_DIALOG_CATEGORY_COL_WIDTH,
    LIBRARY_DIALOG_LABEL_COL_WIDTH,
  ]
  const trailingFixed = [
    LIBRARY_DIALOG_ADD_COL_WIDTH,
    LIBRARY_DIALOG_OTHER_COL_WIDTH,
    LIBRARY_DIALOG_TOTAL_COL_WIDTH,
    LIBRARY_DIALOG_OPS_COL_WIDTH,
  ]
  const elementMinWidths = elementColumns.map((column) => {
    const contentWidth = batchTableDataColWidth(column.header, column.samples, false)
    return Math.max(LIBRARY_DIALOG_ELEMENT_COL_MIN, Math.min(LIBRARY_DIALOG_ELEMENT_COL_MAX, contentWidth))
  })
  const fixedSum = leadingFixed.reduce((sum, width) => sum + width, 0) + trailingFixed.reduce((sum, width) => sum + width, 0)
  const elementMinSum = elementMinWidths.reduce((sum, width) => sum + width, 0)
  const minTotal = fixedSum + elementMinSum

  let elementColWidths = elementMinWidths
  if (containerWidth > minTotal && elementMinWidths.length > 0) {
    const extra = containerWidth - minTotal
    const per = Math.floor(extra / elementMinWidths.length)
    const remainder = extra - per * elementMinWidths.length
    elementColWidths = elementMinWidths.map((min, index) =>
      min + per + (index < remainder ? 1 : 0)
    )
  }

  const widths = [...leadingFixed, ...elementColWidths, ...trailingFixed]
  const tableWidth = Math.max(minTotal, containerWidth > 0 ? containerWidth : minTotal, widths.reduce((sum, w) => sum + w, 0))
  return { widths, tableWidth, elementColWidths }
}

/** 根据表头行、w% 行与元素行样本生成物相成分辅助表列宽（物相列最小宽 + 容器均分） */
export function computePhaseAssistTableLayout(params: {
  labelSamples: string[]
  totalSamples: string[]
  phaseColumns: PhaseAssistColumnWidthInput[]
  containerWidth?: number
  includeActionColumn?: boolean
}): BatchTableColLayout {
  const labelWidth = batchTableDataColWidth('物相', params.labelSamples, false)
  const totalWidth = BATCH_TABLE_ASSIST_TOTAL_COL_MIN
  const phaseColWidths = fixedBatchPhaseColumnWidths(params.phaseColumns.length)
  const trailingFixed = params.includeActionColumn === false ? [] : [BATCH_TABLE_ASSIST_ADD_COL_MIN]
  const minWidths = [labelWidth, totalWidth, ...phaseColWidths, ...trailingFixed]
  const phaseStart = 2
  const flexIndices = Array.from({ length: phaseColWidths.length }, (_, index) => phaseStart + index)
  const absMins = [
    labelWidth,
    totalWidth,
    ...phaseColWidths.map(() => BATCH_TABLE_PCT_ABS_MIN),
    ...trailingFixed,
  ]
  return fitBatchTableToViewport(minWidths, params.containerWidth ?? 0, {
    flexibleIndices: flexIndices,
    absoluteMinWidths: absMins,
  })
}

/** 产物在总产物中的质量占比 %，固定小数位（默认 4 位） */
export function formatProductSharePercent(value: number, digits = 4) {
  if (!Number.isFinite(value)) return '—'
  return value.toFixed(digits)
}

export type OxyProductToneKey =
  | 'smeltingSlag'
  | 'matte'
  | 'flueGas'
  | 'dust'
  | 'fugitive'
  | 'loss'

/** 富氧侧吹炉六种产物行背景色（与配料总表色系一致） */
export function oxyProductToneClass(dark: boolean, key: OxyProductToneKey): string {
  if (key === 'smeltingSlag') return dark ? 'bg-stone-950/30 text-stone-100' : 'bg-stone-100 text-stone-900'
  if (key === 'matte') return dark ? 'bg-amber-950/25 text-amber-50' : 'bg-amber-50 text-amber-950'
  if (key === 'flueGas') return dark ? 'bg-sky-950/25 text-sky-50' : 'bg-sky-50 text-sky-950'
  if (key === 'dust') return dark ? 'bg-yellow-950/20 text-yellow-50' : 'bg-yellow-50 text-yellow-950'
  if (key === 'fugitive') return dark ? 'bg-violet-950/25 text-violet-100' : 'bg-violet-50 text-violet-950'
  return dark ? 'bg-gray-800/40 text-gray-300' : 'bg-gray-100 text-gray-700'
}

/** 产出表占比列高亮 */
export function oxyProductShareHighlightClass(dark: boolean): string {
  return dark ? 'text-blue-300' : 'text-blue-700'
}

/** 物相成分辅助表 / 产出透视表共享样式 */
export function assistStickyHeadClass(dark: boolean): string {
  return `sticky left-0 z-30 px-0.5 py-1.5 text-center text-sm font-semibold ${
    dark ? 'bg-gray-800 text-gray-300' : 'bg-gray-50 text-gray-600'
  }`
}

export function assistStickyLabelClass(dark: boolean): string {
  return `sticky left-0 z-10 px-0.5 py-1.5 text-center text-sm ${dark ? 'bg-gray-900' : 'bg-white'}`
}

export function assistTotalCellClass(dark: boolean): string {
  return dark
    ? 'bg-cyan-950/45 text-cyan-50 ring-1 ring-inset ring-cyan-800/45'
    : 'bg-cyan-50 text-cyan-950 ring-1 ring-inset ring-cyan-200/80'
}

export function assistFirstDataRowClass(dark: boolean): string {
  return dark
    ? 'bg-amber-950/35 ring-1 ring-inset ring-amber-800/45'
    : 'bg-amber-50/95 ring-1 ring-inset ring-amber-200/80'
}

export function assistColumnStripeClass(dark: boolean, index: number): string {
  return index % 2 === 0
    ? dark
      ? 'bg-gray-800/55'
      : 'bg-gray-100/90'
    : dark
      ? 'bg-gray-700/35'
      : 'bg-slate-50'
}

/** 物相列元素单元格高亮；不用于合计列或 W% 行 */
export function assistValueHighlightClass(dark: boolean, hasValue: boolean): string {
  return hasValue
    ? dark
      ? 'bg-emerald-950/40 ring-1 ring-inset ring-emerald-800/50'
      : 'bg-emerald-50 ring-1 ring-inset ring-emerald-200'
    : ''
}

/** 产出结果透视表列宽（合计 + 六产物） */
export function computeProductResultTableLayout(params: {
  labelSamples: string[]
  productHeaders: string[]
  /** 与 productHeaders 对齐的各列样本（物相公式名等），用于按内容定宽 */
  productSamples?: Array<Array<string | number>>
  containerWidth?: number
  totalSamples?: Array<string | number>
  /**
   * fit：按视口伸缩（配料总表）
   * content：按内容定宽、不压缩（导入预览可横向滚动）
   */
  widthMode?: 'fit' | 'content'
}): BatchTableColLayout {
  const labelWidth = batchTableDataColWidth('项目', params.labelSamples, false)
  const totalWidth = params.totalSamples?.length
    ? Math.max(
        BATCH_TABLE_ASSIST_TOTAL_COL_MIN,
        batchTableDataColWidth('Nm³/h', params.totalSamples, false)
      )
    : BATCH_TABLE_ASSIST_TOTAL_COL_MIN
  /** 物相列按常规数值列宽，不因 3Al2O3·2SiO2 等长式名拉宽 */
  const phaseColMax = BATCH_TABLE_PHASE_FORMULA_COL_MAX
  const productColWidths = params.productHeaders.map((header, index) => {
    const rawSamples = params.productSamples?.[index] ?? []
    const samples = rawSamples.map((sample) => phaseFormulaWidthSample(String(sample)))
    return batchTableDataColWidth(header, samples, false, {
      min: BATCH_TABLE_PCT_ABS_MIN,
      max: phaseColMax,
    })
  })
  const minWidths = [labelWidth, totalWidth, ...productColWidths]
  const productStart = 2
  const flexIndices = Array.from({ length: productColWidths.length }, (_, index) => productStart + index)
  const absMins = [
    labelWidth,
    totalWidth,
    ...productColWidths.map(() => BATCH_TABLE_PCT_ABS_MIN),
  ]
  const containerWidth =
    params.widthMode === 'content' ? 0 : (params.containerWidth ?? 0)
  return fitBatchTableToViewport(minWidths, containerWidth, {
    flexibleIndices: flexIndices,
    absoluteMinWidths: absMins,
  })
}
