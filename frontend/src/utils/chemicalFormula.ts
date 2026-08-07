import { ATOMIC_MASS, atomicMass, compoundMolarMass, ELEMENT_SYMBOLS } from './atomicMass.ts'
import type { CopperElementKey } from './copperWorkflowCalc.ts'

export { ATOMIC_MASS, atomicMass, compoundMolarMass }

const SYMBOL_TO_ELEMENT_KEY: Record<string, CopperElementKey> = {
  Ag: 'Ag(银)',
  As: 'As(砷)',
  Au: 'Au(金)',
  Bi: 'Bi(铋)',
  C: 'C (碳)',
  Cd: 'Cd(镉)',
  Cu: 'Cu(铜)',
  Fe: 'Fe(铁)',
  H: 'H(氢)',
  Hg: 'Hg(汞)',
  Mg: 'MgO(氧化镁)',
  Ni: 'Ni(镍)',
  Pb: 'Pb(铅)',
  S: 'S (硫)',
  Sb: 'Sb(锑)',
  Se: 'Se(硒)',
  Sn: 'Sn(锡)',
  Te: 'Te(碲)',
  Zn: 'Zn(锌)',
}

function symbolToCopperElementMass(symbol: string, atomMass: number): Partial<Record<CopperElementKey, number>> {
  const direct = SYMBOL_TO_ELEMENT_KEY[symbol]
  if (direct) return { [direct]: atomMass }
  if (symbol === 'Si') return { 'SiO₂(二氧化硅)': atomMass * (compoundMolarMass({ Si: 1, O: 2 }) / atomicMass('Si')) }
  if (symbol === 'Ca') return { 'CaO(氧化钙)': atomMass * (compoundMolarMass({ Ca: 1, O: 1 }) / atomicMass('Ca')) }
  if (symbol === 'Mg') return { 'MgO(氧化镁)': atomMass * (compoundMolarMass({ Mg: 1, O: 1 }) / atomicMass('Mg')) }
  if (symbol === 'Al') return { 'Al₂O₃(三氧化二铝)': atomMass * (compoundMolarMass({ Al: 2, O: 3 }) / (2 * atomicMass('Al'))) }
  if (symbol === 'O') return { 'O(氧)': atomMass }
  if (symbol === 'N') return { 'N(氮)': atomMass }
  return {}
}

const SUBSCRIPT_TO_DIGIT: Record<string, string> = {
  '₀': '0',
  '₁': '1',
  '₂': '2',
  '₃': '3',
  '₄': '4',
  '₅': '5',
  '₆': '6',
  '₇': '7',
  '₈': '8',
  '₉': '9',
}

const DIGIT_TO_SUBSCRIPT: Record<string, string> = {
  '0': '₀',
  '1': '₁',
  '2': '₂',
  '3': '₃',
  '4': '₄',
  '5': '₅',
  '6': '₆',
  '7': '₇',
  '8': '₈',
  '9': '₉',
}

export type ParsedFormulaResult = {
  ok: boolean
  formula: string
  displayLabel: string
  molarMass: number
  elementFractions: Partial<Record<CopperElementKey, number>>
  errors: string[]
  unsupportedElements: string[]
}

export function normalizeFormulaSubscripts(raw: string): string {
  return raw.replace(/[₀₁₂₃₄₅₆₇₈₉]/g, (char) => SUBSCRIPT_TO_DIGIT[char] ?? char)
}

export function formulaToDisplayLabel(formula: string): string {
  return formula.replace(/\d+/g, (digits) => digits.split('').map((d) => DIGIT_TO_SUBSCRIPT[d] ?? d).join(''))
}

/**
 * 物相式显示分段：化学计量系数（如 3Al₂O₃·2SiO₂ 中的 3、2）为正体；
 * 元素下标（Al₂、O₃）为 subscript。
 */
export function parsePhaseFormulaDisplayParts(
  formula: string
): Array<{ text: string; kind: 'text' | 'sub' }> {
  const normalized = normalizeFormulaSubscripts(String(formula ?? '').trim())
  if (!normalized) return []

  const parts: Array<{ text: string; kind: 'text' | 'sub' }> = []
  const chunks = normalized.split(/([•·*×])/g)

  for (const chunk of chunks) {
    if (!chunk) continue
    if (/^[•·*×]$/.test(chunk)) {
      parts.push({ text: '·', kind: 'text' })
      continue
    }

    let index = 0
    const coef = chunk.slice(index).match(/^(\d+)(?=[A-Z(])/)
    if (coef) {
      parts.push({ text: coef[1], kind: 'text' })
      index += coef[1].length
    }

    while (index < chunk.length) {
      const element = chunk.slice(index).match(/^([A-Z][a-z]?)/)
      if (element) {
        parts.push({ text: element[1], kind: 'text' })
        index += element[1].length
        const count = chunk.slice(index).match(/^(\d+)/)
        if (count) {
          parts.push({ text: count[1], kind: 'sub' })
          index += count[1].length
        }
        continue
      }
      parts.push({ text: chunk[index], kind: 'text' })
      index += 1
    }
  }
  return parts
}

/** 悬停标题：计量系数保持普通数字，原子个数用下标 */
export function phaseFormulaDisplayTitle(formula: string): string {
  return parsePhaseFormulaDisplayParts(formula)
    .map((part) =>
      part.kind === 'sub'
        ? part.text
            .split('')
            .map((d) => DIGIT_TO_SUBSCRIPT[d] ?? d)
            .join('')
        : part.text
    )
    .join('')
}

/**
 * MetCal 中点号/计量系数分子式 → 化学计量用键（内置表/摩尔质量）。
 * 例：CaO*Fe2O3 → CaFe2O4；3Al2O3•2SiO2 保留。
 * 注意：UI/配置物相名应保留 MetCal 的氧化物连写，不要把显示键改成紧凑分子式。
 */
export function normalizeMetcalPhaseFormula(raw: string): string {
  const normalized = normalizeFormulaSubscripts(String(raw ?? '').trim()).replace(/[·×*]/g, '•')
  if (!normalized) return ''
  const aliases: Record<string, string> = {
    'CaO•Fe2O3': 'CaFe2O4',
    'CaO•SiO2': 'CaSiO3',
    'MgO•SiO2': 'MgSiO3',
    '2CaO•SiO2': 'Ca2SiO4',
    '3Al2O3•2SiO2': '3Al2O3•2SiO2',
    'Fe2O3•SiO2': 'Fe2SiO4',
  }
  if (aliases[normalized]) return aliases[normalized]
  if (!normalized.includes('•')) return normalized

  // 通用展开：仅用于计量解析；不要写回配置/UI 物相名
  const atomTotals: Record<string, number> = {}
  for (const chunk of normalized.split('•')) {
    if (!chunk) continue
    let rest = chunk
    let multiplier = 1
    const coef = rest.match(/^(\d+)(?=[A-Z(])/)
    if (coef) {
      multiplier = Number.parseInt(coef[1], 10)
      rest = rest.slice(coef[1].length)
    }
    const { tokens, unknownTokens } = tokenizeFormula(rest)
    if (unknownTokens.length > 0 || tokens.length === 0) return normalized
    for (const { symbol, count } of tokens) {
      atomTotals[symbol] = (atomTotals[symbol] ?? 0) + count * multiplier
    }
  }
  return Object.entries(atomTotals)
    .map(([symbol, count]) => (count === 1 ? symbol : `${symbol}${count}`))
    .join('')
}

/** 紧凑分子式 → MetCal 表8 常用氧化物连写（*） */
const METCAL_PHASE_DISPLAY_BY_CANONICAL: Record<string, string> = {
  CaFe2O4: 'CaO*Fe2O3',
  CaSiO3: 'CaO*SiO2',
  MgSiO3: 'MgO*SiO2',
  Ca2SiO4: '2CaO*SiO2',
}

/**
 * 配置/UI 物相显示键：保留 MetCal 的 CaO*Fe2O3、Al2O3*SiO2 写法；
 * 仅把历史上误写成的 CaFe2O4 等紧凑名还原为连写。
 */
export function preferMetcalPhaseDisplayKey(raw: string): string {
  const trimmed = normalizeFormulaSubscripts(String(raw ?? '').trim())
  if (!trimmed) return ''
  if (/[·×*•]/.test(trimmed)) return trimmed.replace(/[·×•]/g, '*')
  const canonical = normalizeMetcalPhaseFormula(trimmed) || trimmed
  return METCAL_PHASE_DISPLAY_BY_CANONICAL[canonical] ?? trimmed
}

function buildCanonicalFormula(tokens: Array<{ symbol: string; count: number }>): string {
  return tokens.map(({ symbol, count }) => (count === 1 ? symbol : `${symbol}${count}`)).join('')
}

function tokenizeFormula(normalized: string): {
  tokens: Array<{ symbol: string; count: number }>
  unknownTokens: string[]
} {
  const compact = normalized.replace(/\s+/g, '')
  if (!compact) return { tokens: [], unknownTokens: [] }

  const tokens: Array<{ symbol: string; count: number }> = []
  const unknownTokens: string[] = []
  let index = 0

  while (index < compact.length) {
    let matched = false
    for (const symbol of ELEMENT_SYMBOLS) {
      const pattern = new RegExp(`^${symbol}(\\d*)`, 'i')
      const slice = compact.slice(index)
      const match = slice.match(pattern)
      if (!match) continue
      const countText = match[1]
      const count = countText === '' ? 1 : Number.parseInt(countText, 10)
      if (!Number.isFinite(count) || count <= 0) {
        unknownTokens.push(slice.slice(0, 1))
        index += 1
        matched = true
        break
      }
      const canonical = ELEMENT_SYMBOLS.find((s) => s.toLowerCase() === symbol.toLowerCase()) ?? symbol
      tokens.push({ symbol: canonical, count })
      index += match[0].length
      matched = true
      break
    }
    if (matched) continue

    const unknownMatch = compact.slice(index).match(/^[^A-Za-z\d]+|^[a-zA-Z]+/)
    const chunk = unknownMatch?.[0] ?? compact[index]
    unknownTokens.push(chunk)
    index += chunk.length
  }

  return { tokens, unknownTokens }
}

/** 常见物相缩写（纯小写字母）→ 规范分子式 */
export const PHASE_FORMULA_ALIASES: Record<string, string> = {
  cus: 'CuS',
  cu2s: 'Cu2S',
  cufes2: 'CuFeS2',
  cuo: 'CuO',
  cu2o: 'Cu2O',
  fes: 'FeS',
  fes2: 'FeS2',
  feo: 'FeO',
  fe2o3: 'Fe2O3',
  fe3o4: 'Fe3O4',
  sio2: 'SiO2',
  cao: 'CaO',
  caco3: 'CaCO3',
  mgco3: 'MgCO3',
  al2o3: 'Al2O3',
  caso4: 'CaSO4',
  pbs: 'PbS',
  zns: 'ZnS',
  nis: 'NiS',
  bi2s3: 'Bi2S3',
  sb2s3: 'Sb2S3',
  as2s3: 'As2S3',
  pbo: 'PbO',
  as2o3: 'As2O3',
  sb2o3: 'Sb2O3',
  zno: 'ZnO',
  bio: 'BiO',
  sbo: 'SbO',
  cu2se: 'Cu2Se',
  cu3as: 'Cu3As',
}

const METAL_LIKE_SYMBOLS = new Set(['Cu', 'Fe', 'Ag', 'Au', 'Al', 'Ca', 'Pb', 'Zn', 'Sb', 'As', 'Si'])

const SINGLE_ELEMENT_PHASES = new Set([
  'C',
  'S',
  'Fe',
  'Cu',
  'Ag',
  'Au',
  'Al',
  'Si',
  'Ca',
  'Pb',
  'Zn',
  'Sb',
  'As',
  'Ni',
  'Bi',
  'Sn',
  'Se',
  'Cd',
  'Te',
])

function compactFormulaInput(raw: string) {
  return normalizeFormulaSubscripts(raw).replace(/\s+/g, '')
}

function isRepeatedLetterGibberish(compact: string) {
  return compact.length >= 3 && /^([a-zA-Z])\1+$/i.test(compact)
}

function isLowercaseLettersOnly(compact: string) {
  return compact.length > 0 && /^[a-z]+$/.test(compact)
}

/** 在语法解析通过后，过滤 ooo / ofe 等“能解析但不像真实物相”的输入 */
export function validatePhaseFormulaSemantics(raw: string, parsed: ParsedFormulaResult): string[] {
  if (!parsed.ok) return []

  const compact = compactFormulaInput(raw)
  if (isRepeatedLetterGibberish(compact)) {
    return ['请输入规范物相分子式，不能仅为重复字母']
  }

  const { tokens } = tokenizeFormula(compact)
  const uniqueSymbols = new Set(tokens.map(({ symbol }) => symbol))

  if (uniqueSymbols.size === 1) {
    const symbol = tokens[0]?.symbol
    if (symbol === 'O' || symbol === 'N') {
      return ['单一氧/氮物相无法作为冶金固相，请核对输入']
    }
    if (symbol && !SINGLE_ELEMENT_PHASES.has(symbol)) {
      return [`单质 ${symbol} 非常见冶金物相，请核对是否为规范分子式`]
    }
    return []
  }

  if (isLowercaseLettersOnly(compact)) {
    const aliasExpected = PHASE_FORMULA_ALIASES[compact]
    if (aliasExpected) {
      if (parsed.formula !== aliasExpected) {
        return [`缩写「${compact}」应对应 ${formulaToDisplayLabel(aliasExpected)}，请核对输入`]
      }
      return []
    }
    const metalCount = tokens.filter(({ symbol }) => METAL_LIKE_SYMBOLS.has(symbol)).length
    if (uniqueSymbols.size >= 3 && metalCount >= 1) return []
    return ['未识别的物相缩写，请使用规范分子式（如 CuS、FeO、Fe₃O₄）或常见缩写（如 cus、feo）']
  }

  return []
}

export function validatePhaseFormulaInput(raw: string): ParsedFormulaResult {
  const parsed = parseFormulaInput(raw)
  if (!parsed.ok) return parsed
  const semanticErrors = validatePhaseFormulaSemantics(raw, parsed)
  if (semanticErrors.length === 0) return parsed
  return {
    ...parsed,
    ok: false,
    errors: semanticErrors,
  }
}

export function parseFormulaInput(raw: string): ParsedFormulaResult {
  const trimmed = raw.trim()
  if (!trimmed) {
    return {
      ok: false,
      formula: '',
      displayLabel: '',
      molarMass: 0,
      elementFractions: {},
      errors: ['请输入物相分子式'],
      unsupportedElements: [],
    }
  }

  const normalized = normalizeFormulaSubscripts(trimmed)
  const { tokens, unknownTokens } = tokenizeFormula(normalized)
  const errors: string[] = []

  for (const token of unknownTokens) {
    if (token.trim()) errors.push(`未识别的元素/符号: ${token}`)
  }

  if (tokens.length === 0) {
    if (errors.length === 0) errors.push('无法解析分子式')
    return {
      ok: false,
      formula: '',
      displayLabel: '',
      molarMass: 0,
      elementFractions: {},
      errors,
      unsupportedElements: [],
    }
  }

  const unsupportedElements = tokens
    .map(({ symbol }) => symbol)
    .filter((symbol) => !SYMBOL_TO_ELEMENT_KEY[symbol] && !['Si', 'Ca', 'Mg', 'Al', 'O', 'N'].includes(symbol))

  if (unsupportedElements.length > 0) {
    const unique = [...new Set(unsupportedElements)]
    errors.push(`该物相含未纳入配料模型的元素: ${unique.join(', ')}`)
  }

  if (errors.length > 0) {
    return {
      ok: false,
      formula: buildCanonicalFormula(tokens),
      displayLabel: formulaToDisplayLabel(buildCanonicalFormula(tokens)),
      molarMass: 0,
      elementFractions: {},
      errors,
      unsupportedElements: [...new Set(unsupportedElements)],
    }
  }

  const formula = buildCanonicalFormula(tokens)
  let molarMass = 0
  const elementMass: Partial<Record<CopperElementKey, number>> = {}

  for (const { symbol, count } of tokens) {
    const mass = (atomicMass(symbol) ?? 0) * count
    molarMass += mass
    const mapped = symbolToCopperElementMass(symbol, mass)
    for (const [key, value] of Object.entries(mapped) as [CopperElementKey, number][]) {
      elementMass[key] = (elementMass[key] ?? 0) + value
    }
  }

  const elementFractions: Partial<Record<CopperElementKey, number>> = {}
  if (molarMass > 0) {
    for (const [key, mass] of Object.entries(elementMass) as [CopperElementKey, number][]) {
      elementFractions[key] = mass / molarMass
    }
  }

  return {
    ok: true,
    formula,
    displayLabel: formulaToDisplayLabel(formula),
    molarMass,
    elementFractions,
    errors: [],
    unsupportedElements: [],
  }
}

export function phaseFractionsFromFormula(formula: string): Partial<Record<CopperElementKey, number>> {
  const parsed = parseFormulaInput(formula)
  return parsed.ok ? parsed.elementFractions : {}
}
