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
  flowTOffset: number | null
  flowTLength: number | null
  compositionKind: 'W%' | 'E%' | null
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
    flowTOffset: null,
    flowTLength: null,
    compositionKind: null,
    composition: [],
  }

  while (pos < data.length) {
    const keyRead = readPascalString(data, pos)
    if (keyRead.text == null) break
    pos = keyRead.next
    const key = keyRead.text

    if (key === 'W%' || key === 'E%') {
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
  let text = String(value)
  if (text.length > targetLength) {
    text = value.toPrecision(targetLength)
    if (text.length > targetLength) return null
  }
  if (text.length < targetLength) {
    if (text.includes('.')) {
      text = text.padEnd(targetLength, '0')
    } else if (targetLength - text.length >= 2) {
      text = `${text}.${'0'.repeat(targetLength - text.length - 1)}`
    } else {
      return null
    }
  }
  return text.length === targetLength ? text : null
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

export function patchCompositionValue(
  data: Uint8Array,
  entry: FloCompositionEntry,
  value: number
): boolean {
  const formatted = formatMetcalNumber(value, entry.valueLength)
  if (!formatted) return false
  return writePascalString(data, entry.valueOffset, formatted)
}
