/**
 * 导出 MicroStation「变量（Variables）」可导入的 CSV，用于驱动参数化炉体 DGN。
 *
 * 导入方式（MicroStation 侧）：
 *  - Variables 对话框 → File > Import，选择本 CSV；或
 *  - key-in：`VARIABLES OVERWRITE <csv 路径>`（替换现有变量）
 *             `VARIABLES MERGE <csv 路径>`（保留现有变量，仅新增/更新）
 *
 * 注意：Bentley 未公开固定列定义，官方建议以「本模型导出的 CSV」为准。
 * 若你的模型导出表头与此处不同，只需改 MICROSTATION_VARIABLE_CSV_HEADER
 * 与 buildMicrostationVariableRows 的字段顺序即可，无需改动其他代码。
 */
import type { SmeltingFurnaceDesignResult } from './copperEquipmentSizing.ts'
import { formatExportDate, sanitizeExcelFilePart } from './copperBatchExport.ts'
import { resolveFurnaceBodyHeightM } from './copperFurnaceGeometry.ts'

/** 长度类变量的导出单位；CAD 模型通常以 mm 为主单位 */
export type MicrostationDistanceUnit = 'mm' | 'm'

export const MICROSTATION_VARIABLE_CSV_HEADER = ['Name', 'Value', 'Type', 'Scope', 'Display', 'Description'] as const

/** MicroStation 变量类型：长度用 Distance，计数用 Number */
type MicrostationVariableType = 'Distance' | 'Number'

export interface MicrostationVariableRow {
  name: string
  value: number
  type: MicrostationVariableType
  /** Instance：放置为参数化 cell 后仍可改；Definition：放置后锁定 */
  scope: 'Instance' | 'Definition'
  display: 'Visible' | 'Hidden'
  description: string
}

function roundTo(value: number, digits: number): number {
  if (!Number.isFinite(value)) return 0
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function toDistance(valueM: number, unit: MicrostationDistanceUnit): number {
  return unit === 'mm' ? roundTo(valueM * 1000, 1) : roundTo(valueM, 4)
}

/**
 * 把选型结果映射为炉体参数化变量。变量名保持 ASCII，便于 MicroStation 表达式引用。
 */
export function buildMicrostationVariableRows(
  design: SmeltingFurnaceDesignResult,
  { distanceUnit = 'mm' }: { distanceUnit?: MicrostationDistanceUnit } = {}
): MicrostationVariableRow[] {
  const lengthM = Math.max(design.designLengthM || design.furnaceLengthM, 0)
  const widthM = Math.max(design.furnaceWidthM, 0)
  const heightM = resolveFurnaceBodyHeightM(widthM)
  const unitLabel = distanceUnit === 'mm' ? 'mm' : 'm'

  return [
    {
      name: 'FurnaceLength',
      value: toDistance(lengthM, distanceUnit),
      type: 'Distance',
      scope: 'Instance',
      display: 'Visible',
      description: `炉长（水套余量调整后的设计炉长），单位 ${unitLabel}`,
    },
    {
      name: 'FurnaceWidth',
      value: toDistance(widthM, distanceUnit),
      type: 'Distance',
      scope: 'Instance',
      display: 'Visible',
      description: `炉宽，单位 ${unitLabel}`,
    },
    {
      name: 'FurnaceHeight',
      value: toDistance(heightM, distanceUnit),
      type: 'Distance',
      scope: 'Instance',
      display: 'Visible',
      description: `炉体高度（按炉宽推导），单位 ${unitLabel}`,
    },
    {
      name: 'JacketPitch',
      value: toDistance(Math.max(design.jacketPitchMm, 0) / 1000, distanceUnit),
      type: 'Distance',
      scope: 'Instance',
      display: 'Visible',
      description: `水套间隔，单位 ${unitLabel}`,
    },
    {
      name: 'JacketCountOneSide',
      value: Math.max(0, Math.round(design.jacketCountOneSide)),
      type: 'Number',
      scope: 'Instance',
      display: 'Visible',
      description: '单侧水套个数',
    },
    {
      name: 'JacketCountTotal',
      value: Math.max(0, Math.round(design.jacketCountTotal)),
      type: 'Number',
      scope: 'Instance',
      display: 'Visible',
      description: '双侧水套总数',
    },
    {
      name: 'TuyereCount',
      value: Math.max(0, Math.round(design.tuyereCount)),
      type: 'Number',
      scope: 'Instance',
      display: 'Visible',
      description: '风口总数（按氧气流量 ÷ 单风口氧能力上取整）',
    },
    {
      name: 'HearthArea',
      value: roundTo(Math.max(design.designAreaM2 || design.areaM2, 0), 3),
      type: 'Number',
      scope: 'Instance',
      display: 'Hidden',
      description: '熔炼炉面积 m²，仅作参考不驱动几何',
    },
  ]
}

function escapeCsvField(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

/** 生成带 UTF-8 BOM 的 CSV 文本，保证 Excel 与 MicroStation 都能正确识别中文说明 */
export function buildMicrostationVariablesCsv(rows: MicrostationVariableRow[]): string {
  const lines = [MICROSTATION_VARIABLE_CSV_HEADER.join(',')]
  for (const row of rows) {
    lines.push(
      [
        escapeCsvField(row.name),
        escapeCsvField(String(row.value)),
        escapeCsvField(row.type),
        escapeCsvField(row.scope),
        escapeCsvField(row.display),
        escapeCsvField(row.description),
      ].join(',')
    )
  }
  return `\ufeff${lines.join('\r\n')}\r\n`
}

export function buildMicrostationVariablesFilename({
  caseName,
  date = new Date(),
}: { caseName?: string; date?: Date } = {}): string {
  const safeCaseName = caseName ? sanitizeExcelFilePart(caseName) : ''
  const parts = safeCaseName
    ? [safeCaseName, '侧吹炉参数化变量', formatExportDate(date)]
    : ['侧吹炉参数化变量', formatExportDate(date)]
  return `${parts.join('_')}.csv`
}

export function downloadMicrostationVariablesCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename.toLowerCase().endsWith('.csv') ? filename : `${filename}.csv`
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

export type MicrostationCsvSaveResult =
  | { ok: true; filePath?: string }
  | { ok: false; cancelled?: boolean; error?: string }

/**
 * Electron 下走「另存为」对话框写盘，浏览器下回退为直接下载。
 */
export async function saveMicrostationVariablesCsv(
  filename: string,
  csv: string,
  saveToFile?: (fileName: string, buffer: ArrayBuffer) => Promise<MicrostationCsvSaveResult>
): Promise<MicrostationCsvSaveResult> {
  if (saveToFile) {
    const bytes = new TextEncoder().encode(csv)
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
    return saveToFile(filename, buffer)
  }
  downloadMicrostationVariablesCsv(filename, csv)
  return { ok: true }
}
