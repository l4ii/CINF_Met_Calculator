/**
 * 将 MetCal .flo 按偏移顺序展开为可读解读 Markdown。
 * Usage: node scripts/interpret-flo-case.mjs [floPath] [outPath]
 */
import fs from 'fs'
import {
  parseFloFileInfo,
  parseStreamBlock,
  findStreamBlocks,
} from '../src/utils/metcalFloBinary.ts'

const FLO = process.argv[2] ?? 'c:/Users/0303003/Desktop/案例/0702-0947(1).flo'
const OUT = process.argv[3] ?? FLO.replace(/\.flo$/i, '.flo.解读.md')

const buf = fs.readFileSync(FLO)
const data = new Uint8Array(buf)
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
const info = parseFloFileInfo(ab)

function findEquipmentTitles(from, to) {
  const titles = []
  for (let i = from; i < to; i++) {
    const len = data[i]
    if (len < 2 || len > 48 || i + 1 + len > data.length) continue
    let font = false
    for (let k = i + 1 + len; k < Math.min(data.length - 5, i + 1 + len + 48); k++) {
      if (
        data[k] === 0xe5 &&
        data[k + 1] === 0xae &&
        data[k + 2] === 0x8b &&
        data[k + 3] === 0xe4 &&
        data[k + 4] === 0xbd &&
        data[k + 5] === 0x93
      ) {
        font = true
        break
      }
    }
    if (!font) continue
    const s = new TextDecoder('utf-8', { fatal: false }).decode(data.subarray(i + 1, i + 1 + len))
    if (!s || /[\x00-\x08]/.test(s)) continue
    if (!/[\u4e00-\u9fff]/.test(s)) continue
    titles.push({ offset: i + 1, name: s, pascalLen: len })
  }
  const out = []
  for (const t of titles) {
    const prev = out[out.length - 1]
    if (prev && prev.name === t.name && t.offset - prev.offset < 8) continue
    out.push(t)
  }
  return out
}

function findAllStreamBlocks() {
  const blocks = []
  for (let i = 0; i < data.length - 8; i++) {
    if (data[i] !== 0x01 || data[i + 1] !== 0x2d) continue
    const block = parseStreamBlock(data, i)
    if (!block) continue
    if (block.composition.length > 0 || /[\u4e00-\u9fff]/.test(block.name)) {
      blocks.push(block)
    }
  }
  return blocks
}

function fmtFlow(b) {
  const parts = []
  if (b.flowT != null) parts.push(`t=${b.flowT}${b.flowT === 'x' ? '（未知/待求）' : ' t/h'}`)
  if (b.flowNm3 != null) {
    parts.push(`Nm³=${b.flowNm3}${b.flowNm3 === 'x' ? '（未知/待求）' : ' Nm³/h'}`)
  }
  if (b.flowS != null) parts.push(`s=${b.flowS}`)
  return parts.join('，') || '（无流量字段）'
}

function topPhases(b, n = 8) {
  if (!b.composition?.length) return '（无物相表 / 空壳）'
  const rows = b.composition
    .map((c) => ({ name: c.name, v: Number(c.value) }))
    .filter((c) => Number.isFinite(c.v))
    .sort((a, b) => b.v - a.v)
  const shown = rows.slice(0, n).map((c) => `${c.name}:${c.v.toFixed(2)}`)
  const more = rows.length > n ? ` …共${rows.length}项` : ` 共${rows.length}项`
  return shown.join(', ') + more
}

function classifyStream(name, b, unitName) {
  const flow = b.flowT ?? b.flowNm3
  const isX = flow === 'x'
  const isNum = flow != null && flow !== 'x' && flow !== '0' && Number(flow) > 0
  const notes = []
  if (isX && (!b.composition.length || b.composition.every((c) => c.value === 'x' || c.value === '1'))) {
    notes.push('Output/投入占位（x 空壳），求解值常写在关联流上')
  } else if (isNum) {
    notes.push('已填入数值的结果流（或固定已知流）')
  }
  if (/出炉烟气/.test(name)) notes.push('通常对应烟道入口的炉出口气')
  if (/锅炉尘|白烟尘/.test(name)) notes.push('收尘系统产物，常用来近似「烟气含尘」')
  if (/漏风/.test(name)) notes.push('系统漏风/配风')
  if (name === '白铜锍' && /吹炼/.test(unitName || '')) notes.push('此处为吹炼投入；数值即熔炼产出锍')
  if (name === '粗铜' && isX) notes.push('本文件吹炼粗铜未写回数值')
  if (name === '粗铜' && isNum) notes.push('若在阳极炉段，是精炼粗铜而非吹炼粗铜')
  return notes
}

function phaseLabel(unitName) {
  if (/侧吹熔炼/.test(unitName)) return '【熔炼炉】'
  if (/顶吹吹炼|吹炼炉/.test(unitName) && !/烟|锅炉|电收|尘/.test(unitName)) return '【吹炼炉】'
  if (/熔炼烟道|熔炼余热|熔炼电收|熔炼锅炉|熔炼白烟|熔炼烟气/.test(unitName)) {
    return '【熔炼烟气处理链】'
  }
  if (/吹炼烟道|吹炼余热|吹炼电收|吹炼锅炉|吹炼白烟|吹炼烟气/.test(unitName)) {
    return '【吹炼烟气处理链】'
  }
  if (/阳极|精炼/.test(unitName)) return '【阳极精炼】'
  if (/渣选|弃渣/.test(unitName)) return '【渣处理】'
  if (/烟道|锅炉|电收|收尘|烟罩|燃烧室/.test(unitName)) return '【烟气/附属】'
  return '【单元】'
}

const units = findEquipmentTitles(0, data.length)
const blocks = findAllStreamBlocks()
const numericBlocks = findStreamBlocks(ab)

const unitRanges = units.map((u, i) => ({
  ...u,
  end: i + 1 < units.length ? units[i + 1].offset : data.length,
}))

function unitAt(offset) {
  for (let i = unitRanges.length - 1; i >= 0; i--) {
    if (offset >= unitRanges[i].offset) return unitRanges[i]
  }
  return null
}

const findNamed = (name) => blocks.filter((b) => b.name === name)
const matte = findNamed('白铜锍').filter((b) => b.flowT && b.flowT !== 'x')
const slagNum = findNamed('熔炼渣').filter((b) => b.flowT && b.flowT !== 'x')
const flue1 = findNamed('熔炼出炉烟气').filter((b) => b.flowNm3 && b.flowNm3 !== 'x')
const blister = findNamed('粗铜')
const cslag = findNamed('吹炼渣').filter((b) => b.flowT && b.flowT !== 'x')
const cflueName = findNamed('吹炼出炉烟气')

const lines = []
lines.push(`# MetCal Flo 解读：0702-0947(1).flo`)
lines.push('')
lines.push(
  `> 自动解析生成。源文件为二进制，无法按文本「行号」对照；下文按 **字节偏移 offset** 顺序展开，可与 MetCal 流程图单元/物流顺序对照。`
)
lines.push('')
lines.push(`## 文件头`)
lines.push('')
lines.push(`| 项 | 值 |`)
lines.push(`|---|---|`)
lines.push(`| 路径 | \`${FLO}\` |`)
lines.push(`| 魔数/版本 | \`${info.magic}\` / ${info.version ?? '?'} |`)
lines.push(`| 大小 | ${info.size.toLocaleString()} 字节 |`)
lines.push(`| 解析到的设备标题数 | ${units.length} |`)
lines.push(`| 流块（含 x 空壳） | ${blocks.length} |`)
lines.push(`| 流块（有物相组成） | ${numericBlocks.length} |`)
lines.push('')
lines.push(`## 如何读这份解读`)
lines.push('')
lines.push(`1. **设备标题**：流程图单元名（附近带「宋体」标记）。`)
lines.push(`2. **物流块**：\`-\` + 流名 + \`t\`/\`Nm3\` + \`W%\`/\`V%\` 组成表。`)
lines.push(`3. **x**：待求/未写回；**数字**：已保存的计算结果或给定值。`)
lines.push(
  `4. 熔炼/吹炼炉 Output 常为 x 空壳；真正数值往往在 **下一段投入** 或 **烟道入口第一股气**。`
)
lines.push('')
lines.push(`## 总流程一览（按偏移）`)
lines.push('')
lines.push(`| offset | 阶段 | 单元名 |`)
lines.push(`|---:|---|---|`)
for (const u of unitRanges) {
  lines.push(`| ${u.offset} | ${phaseLabel(u.name)} | ${u.name} |`)
}
lines.push('')

lines.push(`## 关键产物对照（本文件）`)
lines.push('')
lines.push(`### 熔炼`)
lines.push(`| 逻辑产物 | 炉内 Output | 本文件数值落点 |`)
lines.push(`|---|---|---|`)
lines.push(
  `| 白铜锍 | offset≈98938，t=x 空壳 | ${matte[0] ? `@${matte[0].offset} t=${matte[0].flowT}（吹炼投入）` : '未找到'} |`
)
lines.push(
  `| 熔炼渣 | offset≈98671，t=x 空壳 | ${slagNum[0] ? `@${slagNum[0].offset} t=${slagNum[0].flowT}（渣选矿段）` : '未找到数值'} |`
)
lines.push(
  `| 熔炼出炉烟气 | offset≈99126，Nm3=x 空壳 | ${flue1[0] ? `@${flue1[0].offset} Nm3=${flue1[0].flowNm3}（熔炼烟道入口）` : '未找到'} |`
)
lines.push(`| 烟气含尘 | 仅有名/公式引用 | 用 熔炼锅炉尘+熔炼白烟尘 近似 |`)
lines.push('')
lines.push(`### 吹炼`)
lines.push(`| 逻辑产物 | 炉内 Output | 本文件数值落点 |`)
lines.push(`|---|---|---|`)
const blisterX = blister.find((b) => b.flowT === 'x')
const blisterNums = blister.filter((b) => b.flowT && b.flowT !== 'x')
lines.push(
  `| 粗铜 | ${blisterX ? `@${blisterX.offset} t=x 空壳` : '?'} | ${blisterNums.map((b) => `@${b.offset} t=${b.flowT}`).join('; ') || '**无吹炼数值**；阳极炉有粗铜'} |`
)
lines.push(`| 吹炼渣 | 有 x 空壳 | ${cslag[0] ? `@${cslag[0].offset} t=${cslag[0].flowT}` : '未找到'} |`)
lines.push(
  `| 吹炼出炉烟气 | ${cflueName[0] ? `@${cflueName[0].offset} Nm3=x 空壳` : '有名无块'} | 吹炼烟道入口「熔炼出炉烟气」@148098（流名复用） |`
)
lines.push(`| 吹炼烟气含尘 | 有名空壳 | 吹炼锅炉尘+吹炼白烟尘 |`)
lines.push('')

lines.push(`## 逐单元展开（按偏移顺序）`)
lines.push('')

let streamIdx = 0
for (const u of unitRanges) {
  while (streamIdx < blocks.length && blocks[streamIdx].offset < u.offset) streamIdx++
  const inUnit = []
  let j = streamIdx
  while (j < blocks.length && blocks[j].offset < u.end) {
    inUnit.push(blocks[j])
    j++
  }

  lines.push(`### ${phaseLabel(u.name)} ${u.name}`)
  lines.push('')
  lines.push(`- **偏移范围**: \`[${u.offset}, ${u.end})\``)
  lines.push(`- **本段物流块数**: ${inUnit.length}`)
  lines.push('')

  const show = inUnit.filter((b) => {
    if (/[\u4e00-\u9fff]/.test(b.name)) return true
    if (b.name === 'D%') return false
    if (b.name.length <= 3 && !b.composition.length) return false
    if (
      (b.flowT && b.flowT !== 'x' && Number(b.flowT) > 0) ||
      (b.flowNm3 && b.flowNm3 !== 'x' && Number(b.flowNm3) > 0)
    ) {
      return true
    }
    return b.composition.length >= 3
  })

  if (show.length === 0) {
    lines.push(`_本段无明显中文物流块（或仅为内部表）。_`)
    lines.push('')
    continue
  }

  lines.push(`| offset | 流名 | 流量 | 组成 | 解读 |`)
  lines.push(`|---:|---|---|---|---|`)
  for (const b of show) {
    const notes = classifyStream(b.name, b, u.name).join('；') || '—'
    const kind = b.compositionKind ?? ''
    const comp = topPhases(b, 6).replace(/\|/g, '/')
    const flow = fmtFlow(b).replace(/\|/g, '/')
    const name = b.name.replace(/\|/g, '/')
    lines.push(
      `| ${b.offset} | ${name} | ${flow}${kind ? ` · ${kind}` : ''} | ${comp} | ${notes} |`
    )
  }
  lines.push('')
}

lines.push(`## 附录：全部中文流名时间线（精简）`)
lines.push('')
lines.push(`| offset | 单元 | 流名 | 流量摘要 |`)
lines.push(`|---:|---|---|---|`)
for (const b of blocks) {
  if (!/[\u4e00-\u9fff]/.test(b.name)) continue
  if (/^[\x00]/.test(b.name)) continue
  const u = unitAt(b.offset)
  const flow = b.flowT != null ? `t=${b.flowT}` : b.flowNm3 != null ? `Nm3=${b.flowNm3}` : '-'
  lines.push(`| ${b.offset} | ${u?.name ?? '-'} | ${b.name.replace(/\|/g, '/')} | ${flow} |`)
}

lines.push('')
lines.push(`---`)
lines.push(`生成时间: ${new Date().toISOString()} · 解析器: frontend/src/utils/metcalFloBinary.ts`)

fs.writeFileSync(OUT, lines.join('\n'), 'utf8')
console.log('Wrote', OUT)
console.log('units', units.length, 'blocks', blocks.length, 'mdKB', Math.round(fs.statSync(OUT).size / 1024))
