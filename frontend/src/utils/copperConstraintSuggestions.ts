/**
 * 自定义约束表达式的输入补全候选。
 *
 * 候选一律从当前页的活数据推导（约束配置的产物/物相、实际熔剂列、实际气体列），
 * 而不是写死清单：只有 buildSymbolTableFromUnknowns 真正挂进符号表的名字才会被提示，
 * 免得用户写出能通过语法校验、但求值恒为 0 的路径。
 */
import {
  CONSTRAINT_ELEMENT_TOKEN_LABELS,
  CONSTRAINT_FORMULA_CONSTANT_TOKENS,
  CONSTRAINT_SCOPE_TOKENS,
} from './copperConstraintExpression.ts'
import {
  oxyProductDisplayName,
  OXY_SIDE_BLOW_PRODUCT_KEYS,
  type OxyProductDisplayStage,
  type OxySideBlowConstraintConfig,
} from './copperConstraintConfig.ts'
import { COPPER_BUILTIN_PHASE_DISPLAY_ORDER } from './copperDisplayOrder.ts'

export type ConstraintSuggestionKind =
  | 'scope'
  | 'input'
  | 'product'
  | 'phase'
  | 'element'
  | 'variable'
  | 'constant'

export type ConstraintSuggestion = {
  /** 插入到表达式中的片段（不含分隔点） */
  value: string
  /** 候选右侧的灰字说明 */
  detail: string
  kind: ConstraintSuggestionKind
  /** true 表示该片段单独不成立，插入后自动补分隔点并继续提示下一级 */
  continues: boolean
}

type NamedEntry = { name: string; detail: string }

export type ConstraintSuggestionScope = {
  stage: OxyProductDisplayStage
  inputs: NamedEntry[]
  products: NamedEntry[]
  /** 产物名 → 该产物约束配置里列出的物相 */
  phasesByProduct: Record<string, string[]>
  /** 投入流股名 → 可用物相；气体列只有 O₂/N₂/H₂O */
  phasesByInput: Record<string, string[]>
  variables: NamedEntry[]
}

/** 与符号表 inputMass 固定键一一对应，顺序即候选顺序 */
const FIXED_INPUT_ENTRIES: NamedEntry[] = [
  { name: '混合铜精矿', detail: '精矿干基投入量 t/h' },
  { name: '原料', detail: '全部原料列干基合计 t/h' },
  { name: '混料', detail: '参与元素分配的混料 t/h' },
  { name: '总投入', detail: '投入侧合计 t/h' },
  { name: '含水', detail: '投入水分 t/h' },
  { name: '水', detail: '投入水分 t/h，同「含水」' },
  { name: '煤', detail: '燃料干基 t/h' },
  { name: '燃料煤', detail: '燃料干基 t/h，同「煤」' },
  { name: '煤湿基', detail: '燃料湿基 t/h（含燃料水分）' },
]

/** 气体列名 → 说明；加料口漏风在符号表里按体积暴露，容易写错，单独标注 */
const GAS_INPUT_DETAILS: Record<string, string> = {
  空气: '工艺空气干基 t/h',
  氧气: '工业氧气干基 t/h',
  二次风: '二次风干基 t/h',
  加料口漏风: '加料口漏风 Nm³/h（注意不是 t/h）',
}

/** 气体列在符号表中的物相键，见 gasPhaseMasses */
const GAS_PHASE_KEYS = ['O2', 'N2', 'H2O']

const FUEL_INPUT_NAMES = new Set(['煤', '燃料煤', '煤湿基'])

const ELEMENT_TOKEN_ORDER = [
  'Cu', 'S', 'Fe', 'SiO2', 'CaO', 'MgO', 'Al2O3',
  'O', 'O2', 'N', 'N2', 'H', 'C',
  'Pb', 'Zn', 'As', 'Sb', 'Ni', 'Se', 'Bi', 'Sn', 'Cd', 'Au', 'Ag', 'Te', 'Hg',
  'Si', 'Ca', 'Mg', 'Al',
  'Other',
]

/** 元素符号候选：先按常用顺序，再补映射表里剩下的 */
function elementTokens(): string[] {
  const available = new Set(Object.keys(CONSTRAINT_ELEMENT_TOKEN_LABELS))
  const ordered = ELEMENT_TOKEN_ORDER.filter((token) => available.has(token))
  const rest = [...available].filter((token) => !ordered.includes(token)).sort()
  return [...ordered, ...rest]
}

export function buildConstraintSuggestionScope(params: {
  config: OxySideBlowConstraintConfig
  stage: OxyProductDisplayStage
  solventColumns: readonly { name: string }[]
  airColumns: readonly { name: string }[]
}): ConstraintSuggestionScope {
  const { config, stage } = params

  const solventEntries = params.solventColumns
    .map((column) => column.name?.trim())
    .filter((name): name is string => Boolean(name))
    .map((name) => ({ name, detail: '熔剂投入量 t/h' }))

  const gasEntries = params.airColumns
    .map((column) => column.name?.trim())
    .filter((name): name is string => Boolean(name))
    .map((name) => ({ name, detail: GAS_INPUT_DETAILS[name] ?? '气体投入量 t/h' }))

  const inputs: NamedEntry[] = []
  const seenInputs = new Set<string>()
  for (const entry of [...FIXED_INPUT_ENTRIES, ...solventEntries, ...gasEntries]) {
    if (seenInputs.has(entry.name)) continue
    seenInputs.add(entry.name)
    inputs.push(entry)
  }

  const products: NamedEntry[] = []
  const phasesByProduct: Record<string, string[]> = {}
  for (const productKey of OXY_SIDE_BLOW_PRODUCT_KEYS) {
    const name = oxyProductDisplayName(productKey, stage)
    const phases = config.products[productKey]?.phases ?? []
    phasesByProduct[name] = [...phases]
    products.push({
      name,
      detail: phases.length ? `产物质量 t/h，物相：${phases.join('、')}` : '产物质量 t/h',
    })
  }

  const variableNotes = config._variableNotes ?? {}
  const variables = Object.entries(config.variables ?? {}).map(([name, value]) => ({
    name,
    detail: variableNotes[name] ?? `约束配置变量，当前 ${value}`,
  }))

  const solidInputPhases = [...new Set([...COPPER_BUILTIN_PHASE_DISPLAY_ORDER, 'Other'])]
  const gasColumnNames = new Set(gasEntries.map((entry) => entry.name))
  const phasesByInput: Record<string, string[]> = {}
  for (const entry of inputs) {
    if (gasColumnNames.has(entry.name)) {
      phasesByInput[entry.name] = [...GAS_PHASE_KEYS]
      continue
    }
    // 燃料列在符号表里额外挂了 H2O，见 buildSymbolTableFromUnknowns
    phasesByInput[entry.name] = FUEL_INPUT_NAMES.has(entry.name)
      ? [...new Set(['H2O', ...solidInputPhases])]
      : solidInputPhases
  }

  return { stage, inputs, products, phasesByProduct, phasesByInput, variables }
}

/** 与 tokenize 的标识符字符集一致（含点，因为路径整体是一个 token） */
const TOKEN_CHAR = /[\u4e00-\u9fffA-Za-z0-9_.·•]/

export type ConstraintCompletionResult = {
  items: ConstraintSuggestion[]
  /** 待替换片段的起止下标（仅覆盖光标前正在输入的那一段） */
  replaceStart: number
  replaceEnd: number
}

const EMPTY_COMPLETION: ConstraintCompletionResult = { items: [], replaceStart: 0, replaceEnd: 0 }

function scopeSuggestions(): ConstraintSuggestion[] {
  const detail: Record<string, string> = {
    Input: '投入侧：Input.流股[.物相[.元素]]',
    Output: '产出侧：Output.产物[.物相[.元素]]',
    OutputE: '产出元素质量：OutputE.产物.元素',
  }
  return CONSTRAINT_SCOPE_TOKENS.map((token) => ({
    value: token,
    detail: detail[token] ?? '',
    kind: 'scope' as const,
    continues: true,
  }))
}

function namedSuggestions(
  entries: readonly NamedEntry[],
  kind: ConstraintSuggestionKind
): ConstraintSuggestion[] {
  return entries.map((entry) => ({
    value: entry.name,
    detail: entry.detail,
    kind,
    continues: false,
  }))
}

function phaseSuggestions(phases: readonly string[]): ConstraintSuggestion[] {
  return phases.map((phase) => ({
    value: phase,
    detail: '物相质量 t/h',
    kind: 'phase' as const,
    continues: false,
  }))
}

function elementSuggestions(): ConstraintSuggestion[] {
  return elementTokens().map((token) => ({
    value: token,
    detail: CONSTRAINT_ELEMENT_TOKEN_LABELS[token] ?? '',
    kind: 'element' as const,
    continues: false,
  }))
}

function constantSuggestions(): ConstraintSuggestion[] {
  return CONSTRAINT_FORMULA_CONSTANT_TOKENS.map((token) => ({
    value: token,
    detail: '摩尔/原子质量常量 g/mol',
    kind: 'constant' as const,
    continues: false,
  }))
}

/** 按当前层级列出全部候选，未过滤前缀 */
function candidatesForPath(path: string[], scope: ConstraintSuggestionScope): ConstraintSuggestion[] {
  if (path.length === 0) {
    return [
      ...scopeSuggestions(),
      ...namedSuggestions(scope.variables, 'variable'),
      ...constantSuggestions(),
    ]
  }
  const [head, second] = path
  if (path.length === 1) {
    if (head === 'Input') return namedSuggestions(scope.inputs, 'input')
    if (head === 'Output' || head === 'OutputE') return namedSuggestions(scope.products, 'product')
    return []
  }
  if (path.length === 2) {
    if (head === 'OutputE') return elementSuggestions()
    if (head === 'Input') {
      return [...phaseSuggestions(scope.phasesByInput[second ?? ''] ?? []), ...elementSuggestions()]
    }
    if (head === 'Output') {
      return [...phaseSuggestions(scope.phasesByProduct[second ?? ''] ?? []), ...elementSuggestions()]
    }
    return []
  }
  if (path.length === 3 && (head === 'Input' || head === 'Output')) return elementSuggestions()
  return []
}

/** 前缀命中优先，其次子串命中（便于用「烟气」找到「熔炼出炉烟气」） */
function filterByActiveSegment(
  candidates: readonly ConstraintSuggestion[],
  active: string
): ConstraintSuggestion[] {
  if (!active) return [...candidates]
  const needle = active.toLowerCase()
  const prefixed: ConstraintSuggestion[] = []
  const contained: ConstraintSuggestion[] = []
  for (const candidate of candidates) {
    const value = candidate.value.toLowerCase()
    if (value.startsWith(needle)) prefixed.push(candidate)
    else if (value.includes(needle)) contained.push(candidate)
  }
  return [...prefixed, ...contained]
}

export function resolveConstraintCompletions(
  text: string,
  caret: number,
  scope: ConstraintSuggestionScope
): ConstraintCompletionResult {
  const clampedCaret = Math.max(0, Math.min(caret, text.length))
  let tokenStart = clampedCaret
  while (tokenStart > 0 && TOKEN_CHAR.test(text[tokenStart - 1]!)) tokenStart -= 1

  const token = text.slice(tokenStart, clampedCaret)
  const segments = token.split('.')
  const active = segments[segments.length - 1] ?? ''
  const path = segments.slice(0, -1)

  // 顶层不给空前缀弹窗，否则每个运算符后都会跳出候选；输入点号后必须给下一级提示
  if (path.length === 0 && !active) return EMPTY_COMPLETION

  const items = filterByActiveSegment(candidatesForPath(path, scope), active)
  if (items.length === 0) return EMPTY_COMPLETION
  // 已经与唯一候选完全一致时不再打扰
  if (items.length === 1 && items[0]!.value === active && !items[0]!.continues) return EMPTY_COMPLETION

  return { items, replaceStart: clampedCaret - active.length, replaceEnd: clampedCaret }
}

export function applyConstraintCompletion(
  text: string,
  completion: ConstraintCompletionResult,
  suggestion: ConstraintSuggestion
): { text: string; caret: number } {
  const inserted = suggestion.continues ? `${suggestion.value}.` : suggestion.value
  const next = text.slice(0, completion.replaceStart) + inserted + text.slice(completion.replaceEnd)
  return { text: next, caret: completion.replaceStart + inserted.length }
}
