import type { CopperElementKey } from './copperWorkflowCalc.ts'

/** 原子量 (g/mol)，覆盖配料模型常用元素 */
export const ATOMIC_MASS: Record<string, number> = {
  Ag: 107.868,
  Al: 26.982,
  As: 74.922,
  Au: 196.967,
  C: 12.011,
  Ca: 40.078,
  Cu: 63.546,
  Fe: 55.845,
  N: 14.007,
  O: 15.999,
  Pb: 207.2,
  S: 32.066,
  Sb: 121.76,
  Si: 28.085,
  Zn: 65.38,
}

const SYMBOL_TO_ELEMENT_KEY: Record<string, CopperElementKey> = {
  Ag: 'Ag(银)',
  Al: 'Al(铝)',
  As: 'As(砷)',
  Au: 'Au(金)',
  C: 'C (碳)',
  Ca: 'Ca(钙)',
  Cu: 'Cu(铜)',
  Fe: 'Fe(铁)',
  N: 'N (氮)',
  O: 'O (氧)',
  Pb: 'Pb(铅)',
  S: 'S (硫)',
  Sb: 'Sb(锑)',
  Si: 'Si(硅)',
  Zn: 'Zn(锌)',
}

const ELEMENT_SYMBOLS = Object.keys(ATOMIC_MASS).sort((a, b) => b.length - a.length)

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
  cuo: 'CuO',
  cu2o: 'Cu2O',
  fes: 'FeS',
  fes2: 'FeS2',
  feo: 'FeO',
  fe2o3: 'Fe2O3',
  fe3o4: 'Fe3O4',
  sio2: 'SiO2',
  cao: 'CaO',
  al2o3: 'Al2O3',
  caso4: 'CaSO4',
  pbo: 'PbO',
  zno: 'ZnO',
  cu2se: 'Cu2Se',
}

const METAL_LIKE_SYMBOLS = new Set(['Cu', 'Fe', 'Ag', 'Au', 'Al', 'Ca', 'Pb', 'Zn', 'Sb', 'As', 'Si'])

const SINGLE_ELEMENT_PHASES = new Set(['C', 'S', 'Fe', 'Cu', 'Ag', 'Au', 'Al', 'Si', 'Ca', 'Pb', 'Zn', 'Sb', 'As'])

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
    .filter((symbol) => !SYMBOL_TO_ELEMENT_KEY[symbol])

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
    const mass = (ATOMIC_MASS[symbol] ?? 0) * count
    molarMass += mass
    const elementKey = SYMBOL_TO_ELEMENT_KEY[symbol]
    if (elementKey) elementMass[elementKey] = (elementMass[elementKey] ?? 0) + mass
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
