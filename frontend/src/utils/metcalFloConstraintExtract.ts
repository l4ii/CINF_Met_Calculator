/**
 * 从 MetCal .flo 侧吹熔炼炉 / 顶吹吹炼炉单元读取元素分配与自定义约束。
 */
import {
  CONSTRAINT_PLACEHOLDER_ELEMENTS,
  isCoolingWaterCustomConstraint,
  isUnsupportedConvertingSlagFreeCaoConstraint,
  loadOxyConvertingConstraints,
  loadOxySideBlowConstraints,
  OXY_SIDE_BLOW_PRODUCT_KEYS,
  rewriteConstraintExprToConvertingProductNames,
  stripPlaceholderElementDistributions,
  type CustomConstraintEntry,
  type ElementDistributionEntry,
  type ElementDistributionRule,
  type OxySideBlowConstraintConfig,
  type OxySideBlowProductKey,
} from './copperConstraintConfig.ts'
import {
  DEFAULT_COPPER_PROCESS_PARAMETERS,
  OXYGEN_ENRICHMENT_EXPR,
  SLAG_FE_SIO2_EXPR,
  type CopperProcessParameters,
} from './copperProcessParameters.ts'
import { METCAL_TO_COPPER_ELEMENT } from './metcalElementMap.ts'
import {
  extractMetcalConvertingUnitInputs,
  extractMetcalSmeltingUnitInputs,
  type MetcalConvertingUnitInputs,
  type MetcalSmeltingUnitInputs,
} from './metcalFloBinary.ts'

/** MetCal 元素短名 → 约束表元素键（Si 为硅，S 为硫） */
const METCAL_DIST_ELEMENT_TO_CONSTRAINT: Record<string, string> = {
  ...Object.fromEntries(
    Object.entries(METCAL_TO_COPPER_ELEMENT).filter(([key]) => key !== 'S' && key !== 'SiO2')
  ),
  S: 'S (硫)',
  Si: 'S(硅)',
  Ca: 'Ca(钙)',
  Mg: 'Mg(镁)',
  Al: 'Al(铝)',
  Na: 'Na(钠)',
}

const DIST_ELEMENT_TOKENS = new Set([
  'Cu',
  'S',
  'O',
  'Fe',
  'As',
  'Pb',
  'Zn',
  'Ni',
  'Se',
  'Bi',
  'Sb',
  'Si',
  'Ca',
  'Mg',
  'Al',
  'Sn',
  'Cd',
  'Au',
  'Ag',
  'Te',
  'C',
  'H',
  'N',
  'Hg',
  'Na',
  'Other',
])

export type MetcalConstraintImportResult = {
  config: OxySideBlowConstraintConfig
  matchedCustomExprs: string[]
  processParameters: CopperProcessParameters
  notes: string[]
  smeltingUnit: MetcalSmeltingUnitInputs | null
}

export type MetcalConvertingConstraintImportResult = {
  config: OxySideBlowConstraintConfig
  matchedCustomExprs: string[]
  processParameters: CopperProcessParameters
  notes: string[]
  convertingUnit: MetcalConvertingUnitInputs | null
}

/** 吹炼 Flo → 求解器：保留吹炼产物名；仅统一漏风符号 */
const CONVERTING_FLO_NAME_TO_SOLVER: Array<[RegExp | string, string]> = [
  ['Input.漏风', 'Input.加料口漏风'],
]

const CONVERTING_OXYGEN_SUPPLY_EXPR =
  '(Input.空气.O2 + Input.氧气.O2 + Input.加料口漏风.O2) / ((Input.空气.O2 + Input.氧气.O2 + Input.加料口漏风.O2) - Output.吹炼出炉烟气.O2)'

function readPascal(data: Uint8Array, pos: number): { text: string; next: number } | null {
  if (pos >= data.length) return null
  const length = data[pos]
  if (length < 1 || length > 220 || pos + 1 + length > data.length) return null
  try {
    const text = new TextDecoder('utf-8').decode(data.subarray(pos + 1, pos + 1 + length))
    if (
      ![...text].every((ch) => {
        const code = ch.codePointAt(0) ?? 0
        return (
          (code >= 0x20 && code < 0x7f) ||
          (code >= 0x4e00 && code <= 0x9fff) ||
          '._%[]()/-+*=, '.includes(ch)
        )
      })
    ) {
      return null
    }
    return { text, next: pos + 1 + length }
  } catch {
    return null
  }
}

function collectPascalTokens(data: Uint8Array, start: number, end: number): string[] {
  const tokens: string[] = []
  let pos = Math.max(0, start)
  const limit = Math.min(data.length, end)
  while (pos < limit) {
    const token = readPascal(data, pos)
    if (!token) {
      pos += 1
      continue
    }
    tokens.push(token.text)
    pos = token.next
  }
  return tokens
}

function isConstraintType(token: string | undefined): token is 'W%' | 'D%' {
  return token === 'W%' || token === 'D%' || token === 'V%'
}

/** MetCal 品位格偶发标为 V%；本软件按 W% 处理 */
function normalizeDistributionRuleType(token: 'W%' | 'D%' | 'V%'): 'W%' | 'D%' {
  return token === 'V%' ? 'W%' : token
}

function isDistElementToken(token: string | undefined): boolean {
  return Boolean(token && DIST_ELEMENT_TOKENS.has(token))
}

function parseNumericTarget(raw: string): number | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const autoMatch = trimmed.match(/^(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)(?:\s*,\s*Auto)?$/i)
  if (autoMatch) {
    const num = Number.parseFloat(autoMatch[1]!)
    return Number.isFinite(num) ? num : null
  }
  const fraction = trimmed.match(/^(-?\d+(?:\.\d+)?)\s*\/\s*(-?\d+(?:\.\d+)?)$/)
  if (fraction) {
    const a = Number.parseFloat(fraction[1]!)
    const b = Number.parseFloat(fraction[2]!)
    if (Number.isFinite(a) && Number.isFinite(b) && Math.abs(b) > 1e-12) return a / b
  }
  return null
}

/** 将 Flo 表达式规范为本软件可识别形式 */
export function normalizeMetcalConstraintExpr(expr: string): string {
  return expr
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\[/g, '(')
    .replace(/\]/g, ')')
    .replace(/\bCMG\b/g, 'GMC')
}

function compactExpr(expr: string): string {
  return normalizeMetcalConstraintExpr(expr).replace(/\s+/g, '')
}

/** Flo 合并式 → 本软件默认自定义约束式（无法对齐时返回规范化 Flo 式） */
function mapFloExprToCanonical(floExpr: string): string {
  const compact = compactExpr(floExpr)
  const pairs: Array<{ match: RegExp | string; canonical: string }> = [
    { match: 'Input.煤/Input.混合铜精矿', canonical: 'Input.煤 / Input.混合铜精矿' },
    { match: 'Input.加料口漏风/4500', canonical: 'Input.加料口漏风 / 4500' },
    {
      match: /二次风\.O2\/32.*混合铜精矿\.CuFeS2\.S/,
      canonical:
        '(Input.二次风.O2 / O2) / (((Input.混合铜精矿.CuFeS2.S / 4) + (Input.混合铜精矿.FeS2.S / 2)) / S * 0.7 + (Input.煤.C / 12) * 0.7)',
    },
    {
      match: /\(Input\.空气\.O2\+Input\.氧气\.O2\)\/32\*22\.4.*Input\.空气\+Input\.氧气/,
      canonical: OXYGEN_ENRICHMENT_EXPR,
    },
    {
      match: /Output\.熔炼出炉烟气\.O2.*加料口漏风\.O2/,
      canonical:
        'Output.熔炼出炉烟气.O2 / (Input.空气.O2 + Input.氧气.O2 + Input.二次风.O2 + Input.加料口漏风.O2)',
    },
    {
      match: /OutputE\.熔炼渣\.Fe.*OutputE\.熔炼渣\.Si\/Si\*SiO2/,
      canonical: SLAG_FE_SIO2_EXPR,
    },
    {
      match: 'Output.熔炼渣.Cu2S/Output.熔炼渣.Cu2O',
      canonical: 'Output.熔炼渣.Cu2S / Output.熔炼渣.Cu2O',
    },
    {
      match: 'Output.熔炼渣.Fe3O4/Output.熔炼渣',
      canonical: 'Output.熔炼渣.Fe3O4 / Output.熔炼渣',
    },
    {
      match: 'Output.烟气含尘.Cu2S/Output.烟气含尘.Cu2O',
      canonical: 'Output.烟气含尘.Cu2S / Output.烟气含尘.Cu2O',
    },
    {
      match: 'Output.烟气含尘.Fe3O4.Fe/OutputE.烟气含尘.Fe',
      canonical: 'Output.烟气含尘.Fe3O4.Fe / OutputE.烟气含尘.Fe',
    },
    {
      match: /OutputE\.白铜锍\.S.*\-0\.125\*GMC/,
      canonical: 'OutputE.白铜锍.S / ((-0.125 * GMC / 100 + 0.292) * Output.白铜锍)',
    },
    {
      match: /OutputE\.白铜锍\.Fe.*\-0\.825\*GMC/,
      canonical: 'OutputE.白铜锍.Fe / ((-0.825 * GMC / 100 + 0.633) * Output.白铜锍)',
    },
    {
      match: /Output\.熔炼出炉烟气\.As2O3\.As.*烟气含尘\.As2O3\.As/,
      canonical:
        'Output.熔炼出炉烟气.As2O3.As / (Output.熔炼出炉烟气.As2O3.As + Output.烟气含尘.As2O3.As)',
    },
  ]
  for (const pair of pairs) {
    if (typeof pair.match === 'string') {
      if (compact === pair.match) return pair.canonical
    } else if (pair.match.test(compact)) {
      return pair.canonical
    }
  }
  return normalizeMetcalConstraintExpr(floExpr)
}

function parseElementDistributionsFromTokens(tokens: string[]): ElementDistributionEntry[] {
  const startIdx = tokens.findIndex(
    (token, index) => token === 'Cu' && isConstraintType(tokens[index + 1])
  )
  if (startIdx < 0) return []

  const distributions: ElementDistributionEntry[] = []
  let index = startIdx
  while (index < tokens.length) {
    const elementToken = tokens[index]
    if (!isDistElementToken(elementToken)) break
    index += 1
    const elementKey = METCAL_DIST_ELEMENT_TO_CONSTRAINT[elementToken!] ?? elementToken!
    const rules: ElementDistributionRule[] = []
    for (let productIndex = 0; productIndex < OXY_SIDE_BLOW_PRODUCT_KEYS.length; productIndex += 1) {
      const type = tokens[index]
      if (!isConstraintType(type)) break
      index += 1
      const next = tokens[index]
      let value: string | number = ''
      if (
        next == null ||
        isConstraintType(next) ||
        isDistElementToken(next) ||
        next === '渣精矿' ||
        next.startsWith('Input')
      ) {
        value = ''
      } else if (next === '-' || next === 'x') {
        value = ''
        index += 1
      } else if (next === 'CMG' || next === 'GMC') {
        value = 'GMC'
        index += 1
      } else if (/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(next)) {
        value = Number.parseFloat(next)
        index += 1
      }
      rules.push({
        product: OXY_SIDE_BLOW_PRODUCT_KEYS[productIndex] as OxySideBlowProductKey,
        type: normalizeDistributionRuleType(type),
        value,
      })
    }
    if (
      isConstraintType(tokens[index]) &&
      (tokens[index + 1] === '-' || isDistElementToken(tokens[index + 1]))
    ) {
      // 跳过 MetCal「冷却水」等第 7 列占位（类型 + - / 下一元素）
      index += 1
      if (tokens[index] === '-') index += 1
    }
    const compactRules = rules.filter((rule) => {
      if (typeof rule.value === 'number') return Number.isFinite(rule.value)
      return String(rule.value ?? '').trim() !== ''
    })
    // Na 等占位元素本软件不求解，跳过以免残留后无法编辑
    if (CONSTRAINT_PLACEHOLDER_ELEMENTS.has(elementKey)) {
      continue
    }
    if (compactRules.length > 0 || rules.some((rule) => String(rule.value ?? '').trim() === '')) {
      // 保留空值规则（表示该产物由守恒闭合），与本软件默认表一致
      distributions.push({ element: elementKey, rules })
    }
  }
  return distributions
}

type FloCustomConstraintHit = { expr: string; target: number }

function isLikelyDesignConstraint(expr: string, target: number): boolean {
  const compact = compactExpr(expr)
  // 辅助报表：年产量、浓度 g/m³、已×100 的百分数展示式
  if (/\*330|\*24\/|WorkDays|WorkHours/i.test(compact)) return false
  if (/\*1000\//.test(compact)) return false
  if (/\*100$/.test(compact)) return false
  if (!Number.isFinite(target)) return false
  // 异常大的 Auto 演算值通常不是设计目标
  if (Math.abs(target) > 1000) return false
  return true
}

function parseCustomConstraintsFromTokens(tokens: string[]): FloCustomConstraintHit[] {
  const hits: FloCustomConstraintHit[] = []
  const seen = new Set<string>()
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]!
    if (!token.includes('/')) continue
    if (!(token.startsWith('Input.') || token.startsWith('Output') || token.startsWith('['))) continue
    if (token === '/' || token.length < 8) continue
    const targetRaw = tokens[index + 1]
    if (targetRaw == null) continue
    const target = parseNumericTarget(targetRaw)
    if (target == null || !Number.isFinite(target)) continue
    if (!isLikelyDesignConstraint(token, target)) continue
    const canonical = mapFloExprToCanonical(token)
    const key = compactExpr(canonical)
    if (seen.has(key)) continue
    seen.add(key)
    hits.push({ expr: token, target })
  }
  return hits
}

function mergeCustomConstraints(
  base: CustomConstraintEntry[],
  floHits: FloCustomConstraintHit[],
  matched: string[]
): CustomConstraintEntry[] {
  const next = base.map((entry) => ({ ...entry }))
  const byCompact = new Map(next.map((entry, index) => [compactExpr(entry.expr), index]))

  for (const hit of floHits) {
    const canonical = mapFloExprToCanonical(hit.expr)
    const compact = compactExpr(canonical)
    const existingIndex = byCompact.get(compact)
    if (existingIndex != null) {
      next[existingIndex] = { ...next[existingIndex]!, target: hit.target }
      matched.push(next[existingIndex]!.expr)
      continue
    }
    next.push({
      expr: canonical,
      target: hit.target,
      relativeTolerance: 0.005,
    })
    byCompact.set(compact, next.length - 1)
    matched.push(canonical)
  }
  return next
}

function applyProcessParametersFromConstraints(
  customConstraints: CustomConstraintEntry[],
  floHits: FloCustomConstraintHit[]
): CopperProcessParameters {
  const processParameters: CopperProcessParameters = { ...DEFAULT_COPPER_PROCESS_PARAMETERS }

  const feSi =
    customConstraints.find((entry) => compactExpr(entry.expr) === compactExpr(SLAG_FE_SIO2_EXPR))
      ?.target ?? floHits.find((hit) => /熔炼渣\.Fe.*Si\/Si\*SiO2/.test(compactExpr(hit.expr)))?.target
  if (typeof feSi === 'number' && Number.isFinite(feSi) && feSi > 0) {
    processParameters.feSiO2 = feSi
  }

  const oxy =
    customConstraints.find((entry) => compactExpr(entry.expr) === compactExpr(OXYGEN_ENRICHMENT_EXPR))
      ?.target ??
    floHits.find((hit) => /空气\.O2\+Input\.氧气\.O2\)\/32\*22\.4/.test(compactExpr(hit.expr)))?.target
  if (typeof oxy === 'number' && Number.isFinite(oxy) && oxy > 0) {
    processParameters.oxygenEnrichmentPct = oxy <= 1.5 ? oxy * 100 : oxy
  }

  const coal =
    customConstraints.find((entry) => entry.expr.includes('Input.煤') && entry.expr.includes('混合铜精矿'))
      ?.target ?? floHits.find((hit) => hit.expr.includes('Input.煤') && hit.expr.includes('混合铜精矿'))?.target
  if (typeof coal === 'number' && Number.isFinite(coal) && coal > 0 && coal < 1) {
    processParameters.fuelConcentrateRatio = coal
  }

  return processParameters
}

function mergeElementDistributions(
  base: ElementDistributionEntry[],
  flo: ElementDistributionEntry[]
): ElementDistributionEntry[] {
  if (!flo.length) return base.map((entry) => ({ element: entry.element, rules: entry.rules.map((rule) => ({ ...rule })) }))
  const byElement = new Map(flo.map((entry) => [entry.element, entry]))
  // Flo 有的元素整表替换；Flo 没有的保留默认（避免缺关键元素）
  const merged: ElementDistributionEntry[] = flo.map((entry) => ({
    element: entry.element,
    rules: entry.rules.map((rule) => ({ ...rule })),
  }))
  for (const entry of base) {
    if (byElement.has(entry.element)) continue
    merged.push({ element: entry.element, rules: entry.rules.map((rule) => ({ ...rule })) })
  }
  return merged
}

export function extractMetcalConstraintImport(buffer: ArrayBuffer): MetcalConstraintImportResult {
  const base = loadOxySideBlowConstraints()
  const notes: string[] = []
  const matchedCustomExprs: string[] = []
  const smeltingUnit = extractMetcalSmeltingUnitInputs(buffer)
  const data = new Uint8Array(buffer)

  let floDistributions: ElementDistributionEntry[] = []
  let floHits: FloCustomConstraintHit[] = []

  if (smeltingUnit) {
    const tokens = collectPascalTokens(data, smeltingUnit.start, smeltingUnit.end)
    floDistributions = parseElementDistributionsFromTokens(tokens)
    floHits = parseCustomConstraintsFromTokens(tokens)
    notes.push(
      `已从${smeltingUnit.unitName}读取自定义约束 ${floHits.length} 条、元素分配 ${floDistributions.length} 种元素。`
    )
  } else {
    notes.push('未定位侧吹熔炼炉单元，约束回退为软件默认模板。')
  }

  const customConstraints = mergeCustomConstraints(
    base.customConstraints.map((entry) => ({ ...entry })),
    floHits,
    matchedCustomExprs
  )
  const elementDistributions = stripPlaceholderElementDistributions({
    ...base,
    elementDistributions: mergeElementDistributions(base.elementDistributions, floDistributions),
  }).elementDistributions
  const processParameters = applyProcessParametersFromConstraints(customConstraints, floHits)

  const matteCu = elementDistributions
    .find((entry) => entry.element === 'Cu(铜)')
    ?.rules.find((rule) => rule.product === 'matte' && rule.type === 'W%')
  if (matteCu && (matteCu.value === 'GMC' || matteCu.value === 'CMG')) {
    // 保持与关键参数面板联动
  } else if (typeof matteCu?.value === 'number' && Number.isFinite(matteCu.value) && matteCu.value > 0) {
    processParameters.matteCopperGrade = matteCu.value
  }

  const slagCu = elementDistributions
    .find((entry) => entry.element === 'Cu(铜)')
    ?.rules.find((rule) => rule.product === 'smeltingSlag' && rule.type === 'W%')
  if (typeof slagCu?.value === 'number' && Number.isFinite(slagCu.value)) {
    processParameters.slagCopperWPercent = slagCu.value
  }

  const config: OxySideBlowConstraintConfig = {
    ...base,
    variables: { ...(base.variables ?? {}), GMC: processParameters.matteCopperGrade },
    customConstraints,
    elementDistributions,
  }

  return { config, matchedCustomExprs, processParameters, notes, smeltingUnit }
}

function mapConvertingFloExprToCanonical(floExpr: string): string {
  let mapped = floExpr
  for (const [from, to] of CONVERTING_FLO_NAME_TO_SOLVER) {
    if (typeof from === 'string') {
      mapped = mapped.split(from).join(to)
    } else {
      mapped = mapped.replace(from, to)
    }
  }
  const compact = compactExpr(mapped)
  const feedLeak = compact.match(/^Input\.加料口漏风\/(\d+(?:\.\d+)?)$/)
  if (feedLeak) return `Input.加料口漏风 / ${feedLeak[1]}`

  const pairs: Array<{ match: RegExp | string; canonical: string }> = [
    {
      match: /\(Input\.空气\.O2\+Input\.氧气\.O2\)\/32\*22\.4.*Input\.空气\+Input\.氧气/,
      canonical: OXYGEN_ENRICHMENT_EXPR,
    },
    {
      match:
        /空气\.O2\+Input\.氧气\.O2\+Input\.加料口漏风\.O2.*空气\.O2\+Input\.氧气\.O2\+Input\.加料口漏风\.O2.*Output\.(?:吹炼|熔炼)?出炉烟气\.O2/,
      canonical: CONVERTING_OXYGEN_SUPPLY_EXPR,
    },
    {
      match: /OutputE\.(?:吹炼|熔炼)渣\.Ca\/Ca\*CaO.*OutputE\.(?:吹炼|熔炼)渣\.Fe/,
      canonical: '(OutputE.吹炼渣.Ca / Ca * CaO) / OutputE.吹炼渣.Fe',
    },
    {
      match: /Output\.(?:吹炼)?烟气含尘\.Cu2S\/Output\.(?:吹炼)?烟气含尘\.Cu2O/,
      canonical: 'Output.吹炼烟气含尘.Cu2S / Output.吹炼烟气含尘.Cu2O',
    },
    {
      match: /Output\.(?:吹炼)?烟气含尘\.Fe3O4\.Fe\/OutputE\.(?:吹炼)?烟气含尘\.Fe/,
      canonical: 'Output.吹炼烟气含尘.Fe3O4.Fe / OutputE.吹炼烟气含尘.Fe',
    },
    {
      match: /Output\.(?:吹炼|熔炼)出炉烟气\.As2O3\.As.*(?:吹炼)?烟气含尘\.As2O3\.As/,
      canonical:
        'Output.吹炼出炉烟气.As2O3.As / (Output.吹炼出炉烟气.As2O3.As + Output.吹炼烟气含尘.As2O3.As)',
    },
  ]
  for (const pair of pairs) {
    if (typeof pair.match === 'string') {
      if (compact === pair.match) return pair.canonical
    } else if (pair.match.test(compact)) {
      return pair.canonical
    }
  }
  return normalizeMetcalConstraintExpr(mapped)
}

function isConvertingFurnaceDesignConstraint(expr: string, target: number): boolean {
  if (!isLikelyDesignConstraint(expr, target)) return false
  const compact = compactExpr(expr)
  // 下游锅炉/电收尘/阳极等非吹炼炉本体约束
  if (/锅炉|电收尘|阳极|烟道漏风|进锅炉|白烟尘|贵铅|铜液|高排风机|沉灰筒|残极2|冷却水|CoolingWater|coolingWater|热平衡.*冷却|冷却.*热/.test(compact)) {
    return false
  }
  // 截断残片（避免误伤完整式中的 +Input）
  if (/Inp$|吹炼出炉$|\+Inp$|\+Inp[^a-zA-Z]/.test(compact)) return false
  // 锅炉段“含尘相守恒”或漏风对空气比等，非吹炼设计目标
  if (/Output\.烟气含尘\..*\/Input\.|Output\.吹炼烟气含尘\..*\/Input\./.test(compact)) return false
  if (/Input\.(?:加料口)?漏风\/Input\./.test(compact)) return false
  if (/Input\.H2O\//.test(compact)) return false
  if (!(expr.trim().startsWith('Input.') || expr.trim().startsWith('Output') || expr.trim().startsWith('['))) {
    return false
  }
  return (
    /吹炼渣|粗铜|吹炼出炉烟气|吹炼烟气含尘|白铜锍|残极|氧化渣|石灰石|Input\.漏风|加料口漏风|空气\.O2|氧气\.O2|Input\.空气\+Input\.氧气|熔炼渣|熔炼出炉烟气|烟气含尘/.test(
      compact
    )
  )
}

/** 仅截取吹炼炉本体设计约束段，避免把后续烟道/锅炉约束算进来 */
function sliceConvertingDesignConstraintTokens(tokens: string[]): string[] {
  const start = tokens.findIndex(
    (token) =>
      /^Input\.漏风\s*\/\s*\d+/.test(token) ||
      token.includes('Input.漏风 /') ||
      (token.includes('空气.O2') && token.includes('氧气.O2') && token.includes('Input.空气+Input.氧气'))
  )
  if (start < 0) return tokens
  const from = Math.max(0, start - 30)
  let end = tokens.findIndex(
    (token, index) =>
      index > start &&
      (token.includes('*1000') ||
        token.includes('烟道漏风') ||
        token.includes('WorkDays') ||
        token.includes('WorkHours') ||
        token.includes('进锅炉'))
  )
  if (end < 0) end = Math.min(tokens.length, start + 120)
  return tokens.slice(from, end)
}

function reconstructConvertingOxygenSupplyHit(tokens: string[]): FloCustomConstraintHit | null {
  for (let index = 0; index < tokens.length - 2; index += 1) {
    const left = tokens[index] ?? ''
    const mid = tokens[index + 1] ?? ''
    const right = tokens[index + 2] ?? ''
    if (mid !== '/') continue
    if (!/空气\.O2\+Input\.氧气\.O2\+Input\.漏风\.O2/.test(left.replace(/\s+/g, ''))) continue
    if (!/Output\.吹炼出炉烟气\.O2/.test(right.replace(/\s+/g, ''))) continue
    let target: number | null = null
    for (let look = index + 3; look < Math.min(tokens.length, index + 8); look += 1) {
      target = parseNumericTarget(tokens[look] ?? '')
      if (target != null) break
    }
    if (target == null) continue
    return {
      expr: `[ ${left} ] / [ ${right} ]`,
      target,
    }
  }
  return null
}

function parseConvertingCustomConstraintsFromTokens(tokens: string[]): FloCustomConstraintHit[] {
  const scoped = sliceConvertingDesignConstraintTokens(tokens)
  const hits: FloCustomConstraintHit[] = []
  const seen = new Set<string>()
  const pushHit = (hit: FloCustomConstraintHit) => {
    if (!isConvertingFurnaceDesignConstraint(hit.expr, hit.target)) return
    const canonical = mapConvertingFloExprToCanonical(hit.expr)
    const key = compactExpr(canonical)
    if (seen.has(key)) return
    seen.add(key)
    hits.push({ expr: hit.expr, target: hit.target })
  }

  for (let index = 0; index < scoped.length; index += 1) {
    const token = scoped[index]!
    if (!token.includes('/')) continue
    if (!(token.startsWith('Input.') || token.startsWith('Output') || token.startsWith('['))) continue
    if (token === '/' || token.length < 8) continue
    const targetRaw = scoped[index + 1]
    if (targetRaw == null) continue
    const target = parseNumericTarget(targetRaw)
    if (target == null || !Number.isFinite(target)) continue
    pushHit({ expr: token, target })
  }

  const oxygenSupply = reconstructConvertingOxygenSupplyHit(scoped)
  if (oxygenSupply) pushHit(oxygenSupply)
  return hits
}

function buildConvertingCustomConstraints(
  floHits: FloCustomConstraintHit[],
  matched: string[]
): CustomConstraintEntry[] {
  const next: CustomConstraintEntry[] = []
  const byCompact = new Map<string, number>()
  for (const hit of floHits) {
    const canonical = mapConvertingFloExprToCanonical(hit.expr)
    if (isCoolingWaterCustomConstraint(canonical)) continue
    const compact = compactExpr(canonical)
    const existingIndex = byCompact.get(compact)
    if (existingIndex != null) {
      next[existingIndex] = { ...next[existingIndex]!, target: hit.target }
      matched.push(next[existingIndex]!.expr)
      continue
    }
    const entry: CustomConstraintEntry = {
      expr: canonical,
      target: hit.target,
      relativeTolerance: 0.005,
    }
    next.push(entry)
    byCompact.set(compact, next.length - 1)
    matched.push(canonical)
  }
  return next
}

function applyConvertingProcessParametersFromConstraints(
  customConstraints: CustomConstraintEntry[],
  floHits: FloCustomConstraintHit[],
  elementDistributions: ElementDistributionEntry[]
): CopperProcessParameters {
  const processParameters: CopperProcessParameters = {
    ...DEFAULT_COPPER_PROCESS_PARAMETERS,
    // 吹炼不以煤/精矿比、熔炼 Fe/SiO₂ 为主控；保留默认占位，富氧等由 Flo 覆盖
  }

  const oxy =
    customConstraints.find((entry) => compactExpr(entry.expr) === compactExpr(OXYGEN_ENRICHMENT_EXPR))
      ?.target ??
    floHits.find((hit) => /空气\.O2\+Input\.氧气\.O2\)\/32\*22\.4/.test(compactExpr(hit.expr)))?.target
  if (typeof oxy === 'number' && Number.isFinite(oxy) && oxy > 0) {
    processParameters.oxygenEnrichmentPct = oxy <= 1.5 ? oxy * 100 : oxy
  }

  const matteCu = elementDistributions
    .find((entry) => entry.element === 'Cu(铜)')
    ?.rules.find((rule) => rule.product === 'matte' && rule.type === 'W%')
  if (typeof matteCu?.value === 'number' && Number.isFinite(matteCu.value) && matteCu.value > 0) {
    processParameters.matteCopperGrade = matteCu.value
  }

  const slagCu = elementDistributions
    .find((entry) => entry.element === 'Cu(铜)')
    ?.rules.find((rule) => rule.product === 'smeltingSlag' && rule.type === 'W%')
  if (typeof slagCu?.value === 'number' && Number.isFinite(slagCu.value)) {
    processParameters.slagCopperWPercent = slagCu.value
  }

  return processParameters
}

/**
 * 从顶吹吹炼炉/吹炼炉单元读取元素分配与自定义约束，并映射为本软件求解器符号。
 * 自定义约束采用 Flo 吹炼炉本体设计约束整表替换（不保留熔炼默认 Fe/Si、煤比等）。
 */
export function extractMetcalConvertingConstraintImport(
  buffer: ArrayBuffer
): MetcalConvertingConstraintImportResult {
  const base = loadOxySideBlowConstraints()
  const notes: string[] = []
  const matchedCustomExprs: string[] = []
  const convertingUnit = extractMetcalConvertingUnitInputs(buffer)
  const data = new Uint8Array(buffer)

  let floDistributions: ElementDistributionEntry[] = []
  let floHits: FloCustomConstraintHit[] = []

  if (convertingUnit) {
    const tokens = collectPascalTokens(data, convertingUnit.start, convertingUnit.end)
    floDistributions = parseElementDistributionsFromTokens(tokens)
    floHits = parseConvertingCustomConstraintsFromTokens(tokens)
    notes.push(
      `已从${convertingUnit.unitName}读取自定义约束 ${floHits.length} 条、元素分配 ${floDistributions.length} 种元素。`
    )
  } else {
    notes.push('未定位顶吹吹炼炉/吹炼炉单元，吹炼约束回退为软件默认模板。')
  }

  const customConstraints = (
    floHits.length
      ? buildConvertingCustomConstraints(floHits, matchedCustomExprs)
      : loadOxyConvertingConstraints().customConstraints.map((entry) => ({ ...entry }))
  )
    .map((entry) => ({
      ...entry,
      expr: rewriteConstraintExprToConvertingProductNames(entry.expr),
    }))
    .filter(
      (entry) =>
        !isCoolingWaterCustomConstraint(entry.expr) &&
        !isUnsupportedConvertingSlagFreeCaoConstraint(entry.expr)
    )

  const elementDistributions = stripPlaceholderElementDistributions({
    ...base,
    elementDistributions: floDistributions.length
      ? mergeElementDistributions(base.elementDistributions, floDistributions)
      : base.elementDistributions.map((entry) => ({
          element: entry.element,
          rules: entry.rules.map((rule) => ({ ...rule })),
        })),
  }).elementDistributions

  const processParameters = applyConvertingProcessParametersFromConstraints(
    customConstraints,
    floHits,
    elementDistributions
  )

  const config: OxySideBlowConstraintConfig = {
    ...base,
    method: 'cu-oxy-side-blast-converting',
    variables: { ...(base.variables ?? {}), GMC: processParameters.matteCopperGrade },
    customConstraints,
    elementDistributions,
  }

  return { config, matchedCustomExprs, processParameters, notes, convertingUnit }
}
