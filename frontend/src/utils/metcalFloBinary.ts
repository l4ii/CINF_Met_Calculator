/**
 * MetCal .flo 二进制流块解析（FLOF-V7.x 启发式）。
 * 流块格式：Pascal 串交替，组成表为 4 字节 LE 条目数 + (名\0值)*n。
 */

export interface FloCompositionEntry {
  name: string
  value: string
  nameOffset: number
  valueOffset: number
  valueLength: number
}

export interface FloStreamBlock {
  name: string
  offset: number
  flowT: string | null
  flowS: string | null
  /** 气体体积流量 Nm³/h（若有） */
  flowNm3: string | null
  flowTOffset: number | null
  flowTLength: number | null
  flowNm3Offset: number | null
  flowNm3Length: number | null
  compositionKind: 'W%' | 'E%' | 'V%' | null
  composition: FloCompositionEntry[]
}

export interface FloFileInfo {
  magic: string
  size: number
  version: string | null
}

function readPascalString(data: Uint8Array, pos: number): { text: string | null; next: number } {
  if (pos >= data.length) return { text: null, next: pos }
  const length = data[pos]
  const start = pos + 1
  if (length === 0) return { text: '', next: start }
  if (start + length > data.length) return { text: null, next: pos }
  try {
    const text = new TextDecoder('utf-8').decode(data.subarray(start, start + length))
    return { text, next: start + length }
  } catch {
    return { text: null, next: pos }
  }
}

export function parseFloFileInfo(buffer: ArrayBuffer): FloFileInfo {
  const data = new Uint8Array(buffer)
  const magicBytes = data.subarray(0, Math.min(32, data.length))
  const magic = new TextDecoder('latin1').decode(magicBytes).replace(/\0/g, '')
  const versionMatch = magic.match(/FLOF-V([\d.]+)/)
  return {
    magic: magic.trim(),
    size: data.length,
    version: versionMatch?.[1] ?? null,
  }
}

export function parseStreamBlock(data: Uint8Array, start: number): FloStreamBlock | null {
  let pos = start
  const dash = readPascalString(data, pos)
  if (dash.text !== '-') return null
  pos = dash.next

  const nameRead = readPascalString(data, pos)
  if (!nameRead.text || !/[\u4e00-\u9fffA-Za-z]/.test(nameRead.text)) return null
  pos = nameRead.next

  const block: FloStreamBlock = {
    name: nameRead.text,
    offset: start,
    flowT: null,
    flowS: null,
    flowNm3: null,
    flowTOffset: null,
    flowTLength: null,
    flowNm3Offset: null,
    flowNm3Length: null,
    compositionKind: null,
    composition: [],
  }

  while (pos < data.length) {
    const keyRead = readPascalString(data, pos)
    if (keyRead.text == null) break
    pos = keyRead.next
    const key = keyRead.text

    if (key === 'W%' || key === 'E%' || key === 'V%') {
      block.compositionKind = key
      break
    }
    if (key === 'False' || key === 'True') continue

    const valRead = readPascalString(data, pos)
    if (valRead.text == null) break
    pos = valRead.next

    if (key === 't') {
      block.flowT = valRead.text
      block.flowTOffset = pos - valRead.text.length - 1
      block.flowTLength = valRead.text.length
    } else if (key === 's') {
      block.flowS = valRead.text
    } else if (key === 'Nm3' || key === 'nm3') {
      block.flowNm3 = valRead.text
      block.flowNm3Offset = pos - valRead.text.length - 1
      block.flowNm3Length = valRead.text.length
    }
  }

  if (!block.compositionKind) return null

  while (pos < data.length && data[pos] === 0) pos += 1
  if (pos + 4 > data.length) return block

  const entryCount = new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(pos, true)
  pos += 4
  if (entryCount <= 0 || entryCount > 200) return block

  for (let i = 0; i < entryCount; i += 1) {
    while (pos < data.length && data[pos] === 0) pos += 1
    const nameOff = pos
    const compNameRead = readPascalString(data, pos)
    if (!compNameRead.text) break
    pos = compNameRead.next
    if (pos >= data.length || data[pos] !== 0) break
    pos += 1
    const valOff = pos
    const compValRead = readPascalString(data, pos)
    if (compValRead.text == null) break
    pos = compValRead.next
    block.composition.push({
      name: compNameRead.text,
      value: compValRead.text,
      nameOffset: nameOff,
      valueOffset: valOff,
      valueLength: compValRead.text.length,
    })
  }

  return block
}

export function findStreamBlocks(buffer: ArrayBuffer): FloStreamBlock[] {
  const data = new Uint8Array(buffer)
  const blocks: FloStreamBlock[] = []
  for (let i = 0; i < data.length - 8; i += 1) {
    if (data[i] !== 0x01 || data[i + 1] !== 0x2d) continue
    const block = parseStreamBlock(data, i)
    if (block?.composition.length) blocks.push(block)
  }
  return blocks
}

/** 将数值格式化为与原 MetCal 文本等长的字符串（不足补 0） */
export function formatMetcalNumber(value: number, targetLength: number): string | null {
  if (!Number.isFinite(value) || targetLength <= 0) return null
  if (value === 0 && targetLength === 1) return '0'

  const candidates = new Set<string>([String(value)])
  for (let digits = Math.max(0, targetLength); digits >= 0; digits -= 1) {
    candidates.add(value.toFixed(digits))
  }
  for (let precision = Math.max(1, targetLength); precision >= 1; precision -= 1) {
    candidates.add(value.toPrecision(precision))
    candidates.add(value.toExponential(Math.max(0, precision - 1)))
  }

  const fitting = [...candidates]
    .filter((text) => text.length <= targetLength && Number.isFinite(Number(text)))
    .sort((a, b) => {
      const aError = Math.abs(Number(a) - value) / Math.max(1, Math.abs(value))
      const bError = Math.abs(Number(b) - value) / Math.max(1, Math.abs(value))
      return aError - bError || Number(a.includes('e')) - Number(b.includes('e')) || b.length - a.length
    })
  const best = fitting[0]
  if (!best) return null
  if (best.length === targetLength) return best

  const exponentIndex = best.search(/[eE]/)
  if (exponentIndex >= 0) {
    const mantissa = best.slice(0, exponentIndex)
    const exponent = best.slice(exponentIndex)
    const padding = targetLength - best.length
    const expanded = mantissa.includes('.')
      ? `${mantissa}${'0'.repeat(padding)}${exponent}`
      : padding >= 1
        ? `${mantissa}.${'0'.repeat(padding - 1)}${exponent}`
        : best
    return expanded.length === targetLength ? expanded : null
  }
  if (best.includes('.')) return best.padEnd(targetLength, '0')
  const padding = targetLength - best.length
  if (padding < 2) return null
  return `${best}.${'0'.repeat(padding - 1)}`
}

export function writePascalString(data: Uint8Array, offset: number, text: string): boolean {
  const encoded = new TextEncoder().encode(text)
  if (encoded.length > 255 || offset < 0 || offset + 1 + encoded.length > data.length) return false
  if (data[offset] !== encoded.length) return false
  data.set(encoded, offset + 1)
  return true
}

export function patchStreamFlow(data: Uint8Array, block: FloStreamBlock, flow: number): boolean {
  if (block.flowTOffset == null || block.flowTLength == null) return false
  const formatted = formatMetcalNumber(flow, block.flowTLength)
  if (!formatted) return false
  return writePascalString(data, block.flowTOffset, formatted)
}

export function patchStreamVolumeFlow(
  data: Uint8Array,
  block: FloStreamBlock,
  flowNm3h: number
): boolean {
  if (block.flowNm3Offset == null || block.flowNm3Length == null) return false
  const formatted = formatMetcalNumber(flowNm3h, block.flowNm3Length)
  if (!formatted) return false
  return writePascalString(data, block.flowNm3Offset, formatted)
}

/** 固体优先写 t/h，气体优先写 Nm3/h。 */
export function patchStreamPrimaryFlow(
  data: Uint8Array,
  block: FloStreamBlock,
  flow: number
): boolean {
  if (block.compositionKind === 'V%' && block.flowNm3Offset != null) {
    return patchStreamVolumeFlow(data, block, flow)
  }
  if (block.flowTOffset != null) return patchStreamFlow(data, block, flow)
  if (block.flowNm3Offset != null) return patchStreamVolumeFlow(data, block, flow)
  return false
}

export function patchCompositionValue(
  data: Uint8Array,
  entry: FloCompositionEntry,
  value: number
): boolean {
  const formatted = formatMetcalNumber(value, entry.valueLength)
  if (!formatted) return false
  return writePascalString(data, entry.valueOffset, formatted)
}

/** 在二进制中按约束表达式定位并等长补丁目标数值 */
export function patchConstraintTargetByExpr(
  data: Uint8Array,
  expr: string,
  target: number,
  range?: { start: number; end: number }
): boolean {
  const exprBytes = new TextEncoder().encode(expr)
  const start = Math.max(0, range?.start ?? 0)
  const end = Math.min(data.length, range?.end ?? data.length)
  for (let i = start; i <= end - exprBytes.length; i += 1) {
    let matched = true
    for (let j = 0; j < exprBytes.length; j += 1) {
      if (data[i + j] !== exprBytes[j]) {
        matched = false
        break
      }
    }
    if (!matched) continue
    const scanEnd = Math.min(end, i + exprBytes.length + 320)
    for (let pos = i + exprBytes.length; pos < scanEnd; pos += 1) {
      const len = data[pos]
      if (len < 4 || len > 48) continue
      const start = pos + 1
      if (start + len > data.length) break
      const text = new TextDecoder('utf-8', { fatal: false }).decode(data.subarray(start, start + len))
      if (!/^-?\d+(\.\d+)?$/.test(text)) continue
      const formatted = formatMetcalNumber(target, len)
      if (formatted && writePascalString(data, pos, formatted)) return true
    }
  }
  return false
}

/** MetCal 侧吹熔炼单元标题（只读该单元投入，不含吹炼） */
export const METCAL_SMELTING_UNIT_NAMES = ['侧吹熔炼炉'] as const

/** 常见后续工序单元：用于截断熔炼单元字节范围 */
export const METCAL_DOWNSTREAM_UNIT_NAMES = ['顶吹吹炼炉', '吹炼炉', '阳极炉'] as const

/** MetCal 吹炼单元标题 */
export const METCAL_CONVERTING_UNIT_NAMES = ['顶吹吹炼炉', '吹炼炉'] as const

/**
 * 吹炼之后的单元：用于截断吹炼投入/产出范围。
 * 注意：西南铜等案例常写「阳极炉加料升温/氧化期…」，需前缀匹配「阳极炉」。
 */
export const METCAL_CONVERTING_DOWNSTREAM_UNIT_NAMES = ['阳极炉', '精炼炉', '回转阳极炉'] as const

/** 熔炼单元产出流：遇到即结束投入流枚举 */
const METCAL_SMELTING_OUTPUT_STREAM_NAMES = new Set([
  '熔炼渣',
  '白铜锍',
  '熔炼出炉烟气',
  '烟气含尘',
  '无组织排放',
  '损失',
])

/** 吹炼单元产出流：遇到即结束投入流枚举 */
const METCAL_CONVERTING_OUTPUT_STREAM_NAMES = new Set([
  '粗铜',
  '吹炼渣',
  '吹炼出炉烟气',
  '吹炼烟气',
  '吹炼烟尘',
  '无组织排放',
  '损失',
])

export interface MetcalSmeltingUnitInputs {
  unitName: string
  start: number
  end: number
  inputNames: string[]
}

export type MetcalConvertingUnitInputs = MetcalSmeltingUnitInputs

function indexOfUtf8Bytes(data: Uint8Array, text: string, from = 0): number {
  const needle = new TextEncoder().encode(text)
  if (needle.length === 0 || from >= data.length) return -1
  outer: for (let i = Math.max(0, from); i <= data.length - needle.length; i += 1) {
    for (let j = 0; j < needle.length; j += 1) {
      if (data[i + j] !== needle[j]) continue outer
    }
    return i
  }
  return -1
}

/** 设备单元标题：Pascal 定长串，且附近带「宋体」字体标记（避免命中公式中的 侧吹熔炼炉[7]） */
function indexOfMetcalEquipmentUnit(data: Uint8Array, unitName: string, from = 0): number {
  const needle = new TextEncoder().encode(unitName)
  if (needle.length === 0 || needle.length > 255) return -1
  let searchFrom = Math.max(0, from)
  while (searchFrom <= data.length - needle.length) {
    const hit = indexOfUtf8Bytes(data, unitName, searchFrom)
    if (hit < 0) return -1
    const lengthByte = hit > 0 ? data[hit - 1] : -1
    const fontHit = indexOfUtf8Bytes(data, '宋体', hit + needle.length)
    const hasFontMarker = fontHit >= 0 && fontHit - (hit + needle.length) < 48
    // 精确标题：Pascal 长度 == 单元名字节长
    if (lengthByte === needle.length && hasFontMarker) return hit
    // 前缀标题：如「阳极炉加料升温」以「阳极炉」开头，Pascal 长度更长但仍带宋体
    if (
      hasFontMarker &&
      lengthByte > needle.length &&
      lengthByte <= 48 &&
      hit + lengthByte <= data.length
    ) {
      const pascalText = new TextDecoder('utf-8', { fatal: false }).decode(
        data.subarray(hit, hit + lengthByte)
      )
      if (pascalText.startsWith(unitName)) return hit
    }
    searchFrom = hit + needle.length
  }
  return -1
}

function isLikelyMetcalFeedStreamName(name: string): boolean {
  const trimmed = name.trim()
  if (!trimmed || trimmed.length > 32) return false
  if (trimmed.includes('\0')) return false
  if (trimmed === 'D%' || trimmed === 'W%' || trimmed === 'E%' || trimmed === 'V%') return false
  // 元素分配表误解析出的短符号
  if (/^[A-Za-z][a-z]?$/.test(trimmed)) return false
  if (!/[\u4e00-\u9fff]/.test(trimmed)) return false
  return true
}

/**
 * 定位侧吹熔炼炉单元，并枚举其投入流名称（不含顶吹吹炼等后续工序）。
 * 石灰石等仅出现在吹炼投入中的物料不会进入本列表。
 */
export function extractMetcalSmeltingUnitInputs(buffer: ArrayBuffer): MetcalSmeltingUnitInputs | null {
  const data = new Uint8Array(buffer)
  let start = -1
  let unitName = METCAL_SMELTING_UNIT_NAMES[0]
  for (const name of METCAL_SMELTING_UNIT_NAMES) {
    const hit = indexOfMetcalEquipmentUnit(data, name, 0)
    if (hit >= 0 && (start < 0 || hit < start)) {
      start = hit
      unitName = name
    }
  }
  if (start < 0) return null

  let end = data.length
  for (const name of METCAL_DOWNSTREAM_UNIT_NAMES) {
    const hit = indexOfMetcalEquipmentUnit(data, name, start + unitName.length)
    if (hit >= 0 && hit < end) end = hit
  }

  const blocks = findStreamBlocks(buffer)
    .filter((block) => block.offset >= start && block.offset < end)
    .sort((a, b) => a.offset - b.offset)

  const inputNames: string[] = []
  const seen = new Set<string>()
  for (const block of blocks) {
    if (METCAL_SMELTING_OUTPUT_STREAM_NAMES.has(block.name)) break
    if (!isLikelyMetcalFeedStreamName(block.name)) break
    if (seen.has(block.name)) continue
    seen.add(block.name)
    inputNames.push(block.name)
  }

  if (inputNames.length === 0) return null
  return { unitName, start, end, inputNames }
}

/**
 * 定位顶吹吹炼炉/吹炼炉单元，并枚举其投入流名称（不含阳极炉等后续工序）。
 * 典型投入：白铜锍、残极、残极三、氧化渣、石灰石、空气/氧气等。
 */
export function extractMetcalConvertingUnitInputs(buffer: ArrayBuffer): MetcalConvertingUnitInputs | null {
  const data = new Uint8Array(buffer)
  let start = -1
  let unitName: (typeof METCAL_CONVERTING_UNIT_NAMES)[number] = METCAL_CONVERTING_UNIT_NAMES[0]
  for (const name of METCAL_CONVERTING_UNIT_NAMES) {
    const hit = indexOfMetcalEquipmentUnit(data, name, 0)
    if (hit >= 0 && (start < 0 || hit < start)) {
      start = hit
      unitName = name
    }
  }
  if (start < 0) return null

  let end = data.length
  for (const name of METCAL_CONVERTING_DOWNSTREAM_UNIT_NAMES) {
    const hit = indexOfMetcalEquipmentUnit(data, name, start + unitName.length)
    if (hit >= 0 && hit < end) end = hit
  }

  const blocks = findStreamBlocks(buffer)
    .filter((block) => block.offset >= start && block.offset < end)
    .sort((a, b) => a.offset - b.offset)

  const inputNames: string[] = []
  const seen = new Set<string>()
  for (const block of blocks) {
    if (METCAL_CONVERTING_OUTPUT_STREAM_NAMES.has(block.name)) break
    if (!isLikelyMetcalFeedStreamName(block.name)) continue
    if (seen.has(block.name)) continue
    seen.add(block.name)
    inputNames.push(block.name)
  }

  if (inputNames.length === 0) return null
  return { unitName, start, end, inputNames }
}

/** 读取 Flo 中紧跟某约束表达式后的数值目标（等长 Pascal 数字串） */
export function readConstraintTargetByExpr(data: Uint8Array | ArrayBuffer, expr: string): number | null {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
  const exprBytes = new TextEncoder().encode(expr)
  for (let i = 0; i <= bytes.length - exprBytes.length; i += 1) {
    let matched = true
    for (let j = 0; j < exprBytes.length; j += 1) {
      if (bytes[i + j] !== exprBytes[j]) {
        matched = false
        break
      }
    }
    if (!matched) continue
    const scanEnd = Math.min(bytes.length, i + exprBytes.length + 320)
    for (let pos = i + exprBytes.length; pos < scanEnd; pos += 1) {
      const len = bytes[pos]
      if (len < 1 || len > 48) continue
      const start = pos + 1
      if (start + len > bytes.length) break
      const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes.subarray(start, start + len))
      if (!/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(text)) continue
      const num = Number.parseFloat(text)
      if (Number.isFinite(num)) return num
    }
  }
  return null
}
