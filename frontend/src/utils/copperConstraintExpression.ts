import { COPPER_BUILTIN_PHASE_FRACTIONS } from './copperPhaseStoichiometry.ts'
import { atomicMass, COMPOUND_MOLAR_MASS } from './atomicMass.ts'
import type { CopperElementKey } from './copperWorkflowCalc.ts'
import type { OxySideBlowProductKey } from './copperConstraintConfig.ts'

export type ExprNode =
  | { type: 'number'; value: number }
  | { type: 'ref'; path: string[] }
  | { type: 'binary'; op: '+' | '-' | '*' | '/'; left: ExprNode; right: ExprNode }
  | { type: 'unary'; op: '-'; arg: ExprNode }

export interface ConstraintSymbolTable {
  /** GMC 等配置变量 */
  variables?: Record<string, number>
  /** Input.混合铜精矿 → mass t/h */
  inputMass: Record<string, number>
  /** Input.混合铜精矿.Cu → element mass in feed */
  inputElementMass: Record<string, Partial<Record<CopperElementKey, number>>>
  /** Input.混合铜精矿.Cu2S → phase mass in feed (optional) */
  inputPhaseMass?: Record<string, Record<string, number>>
  /** Output.熔炼渣 → product mass */
  outputMass: Record<string, number>
  /** Output.熔炼渣.Cu2S → phase mass */
  outputPhaseMass: Record<string, Record<string, number>>
  /** OutputE.熔炼渣.Cu → element mass in product */
  outputElementMass: Record<string, Partial<Record<CopperElementKey, number>>>
}

const ELEMENT_SYMBOL_MAP: Record<string, CopperElementKey> = {
  Cu: 'Cu(铜)',
  S: 'S (硫)',
  Fe: 'Fe(铁)',
  SiO2: 'SiO₂(二氧化硅)',
  CaO: 'CaO(氧化钙)',
  MgO: 'MgO(氧化镁)',
  Al2O3: 'Al₂O₃(三氧化二铝)',
  O: 'O(氧)',
  O2: 'O(氧)',
  '02': 'O(氧)',
  C: 'C (碳)',
  N: 'N(氮)',
  N2: 'N(氮)',
  H: 'H(氢)',
  As: 'As(砷)',
  Pb: 'Pb(铅)',
  Zn: 'Zn(锌)',
  Ni: 'Ni(镍)',
  Se: 'Se(硒)',
  Bi: 'Bi(铋)',
  Sb: 'Sb(锑)',
  Sn: 'Sn(锡)',
  Cd: 'Cd(镉)',
  Au: 'Au(金)',
  Ag: 'Ag(银)',
  Te: 'Te(碲)',
  Hg: 'Hg(汞)',
  Other: 'Other(其他)',
}

/** 约束表达式中的裸元素/化合物符号 → 摩尔质量（来自统一原子质量库） */
const FORMULA_CONSTANTS: Record<string, number> = {
  H: atomicMass('H'),
  C: atomicMass('C'),
  N: atomicMass('N'),
  O: atomicMass('O'),
  S: atomicMass('S'),
  Si: atomicMass('Si'),
  Ca: atomicMass('Ca'),
  Mg: atomicMass('Mg'),
  Al: atomicMass('Al'),
  Fe: atomicMass('Fe'),
  Cu: atomicMass('Cu'),
  Pb: atomicMass('Pb'),
  Zn: atomicMass('Zn'),
  As: atomicMass('As'),
  Sb: atomicMass('Sb'),
  Ni: atomicMass('Ni'),
  Se: atomicMass('Se'),
  Bi: atomicMass('Bi'),
  Sn: atomicMass('Sn'),
  Cd: atomicMass('Cd'),
  Au: atomicMass('Au'),
  Ag: atomicMass('Ag'),
  Te: atomicMass('Te'),
  Hg: atomicMass('Hg'),
  O2: COMPOUND_MOLAR_MASS.O2,
  N2: COMPOUND_MOLAR_MASS.N2,
  SO2: COMPOUND_MOLAR_MASS.SO2,
  CO2: COMPOUND_MOLAR_MASS.CO2,
  SiO2: COMPOUND_MOLAR_MASS.SiO2,
  CaO: COMPOUND_MOLAR_MASS.CaO,
  MgO: COMPOUND_MOLAR_MASS.MgO,
  Al2O3: COMPOUND_MOLAR_MASS.Al2O3,
  FeO: COMPOUND_MOLAR_MASS.FeO,
  Fe2O3: COMPOUND_MOLAR_MASS.Fe2O3,
  Fe3O4: COMPOUND_MOLAR_MASS.Fe3O4,
  Cu2S: COMPOUND_MOLAR_MASS.Cu2S,
  Cu2O: COMPOUND_MOLAR_MASS.Cu2O,
  CuFeS2: COMPOUND_MOLAR_MASS.CuFeS2,
  FeS: COMPOUND_MOLAR_MASS.FeS,
  FeS2: COMPOUND_MOLAR_MASS.FeS2,
  PbO: COMPOUND_MOLAR_MASS.PbO,
  PbS: COMPOUND_MOLAR_MASS.PbS,
  ZnO: COMPOUND_MOLAR_MASS.ZnO,
  ZnS: COMPOUND_MOLAR_MASS.ZnS,
  As2O3: COMPOUND_MOLAR_MASS.As2O3,
  As2S3: COMPOUND_MOLAR_MASS.As2S3,
}

function tokenize(expr: string): string[] {
  const tokens: string[] = []
  let i = 0
  const s = expr.replace(/\s+/g, '')
  while (i < s.length) {
    const ch = s[i]!
    if ('+-*/()'.includes(ch)) {
      tokens.push(ch)
      i += 1
      continue
    }
    if (/[0-9.]/.test(ch)) {
      let j = i + 1
      while (j < s.length && /[0-9.]/.test(s[j]!)) j += 1
      tokens.push(s.slice(i, j))
      i = j
      continue
    }
    if (/[\u4e00-\u9fffA-Za-z0-9·•_]/.test(ch)) {
      let j = i + 1
      while (j < s.length && /[\u4e00-\u9fffA-Za-z0-9_.·•]/.test(s[j]!)) j += 1
      tokens.push(s.slice(i, j))
      i = j
      continue
    }
    i += 1
  }
  return tokens
}

export function parseConstraintExpression(expr: string): ExprNode {
  const tokens = tokenize(expr)
  let pos = 0

  function peek() {
    return tokens[pos]
  }
  function consume(expected?: string) {
    const t = tokens[pos]
    if (!t) throw new Error(`表达式意外结束: ${expr}`)
    if (expected && t !== expected) throw new Error(`期望 ${expected}，得到 ${t}`)
    pos += 1
    return t
  }

  function parsePrimary(): ExprNode {
    const t = peek()
    if (t === '(') {
      consume('(')
      const node = parseAddSub()
      consume(')')
      return node
    }
    if (t === '-' || t === '+') {
      const op = consume() as '+' | '-'
      const arg = parsePrimary()
      if (op === '+') return arg
      return { type: 'unary', op: '-', arg }
    }
    if (t && /^[0-9.]/.test(t)) {
      consume()
      return { type: 'number', value: Number(t) }
    }
    if (t && (/^[\u4e00-\u9fffA-Za-z0-9]/.test(t) || t.startsWith('Input') || t.startsWith('Output'))) {
      const token = consume()
      if (token.includes('.')) {
        return { type: 'ref', path: token.split('.').filter(Boolean) }
      }
      const path: string[] = [token]
      while (peek() === '.') {
        consume('.')
        path.push(consume())
      }
      return { type: 'ref', path }
    }
    throw new Error(`无法解析 token: ${t ?? 'EOF'} in ${expr}`)
  }

  function parseMulDiv(): ExprNode {
    let left = parsePrimary()
    while (peek() === '*' || peek() === '/') {
      const op = consume() as '*' | '/'
      const right = parsePrimary()
      left = { type: 'binary', op, left, right }
    }
    return left
  }

  function parseAddSub(): ExprNode {
    let left = parseMulDiv()
    while (peek() === '+' || peek() === '-') {
      const op = consume() as '+' | '-'
      const right = parseMulDiv()
      left = { type: 'binary', op, left, right }
    }
    return left
  }

  const ast = parseAddSub()
  if (pos < tokens.length) throw new Error(`多余 token: ${tokens[pos]} in ${expr}`)
  return ast
}

function oxideEquivalentToElementMass(
  source: Partial<Record<CopperElementKey, number>> | undefined,
  oxide: CopperElementKey,
  element: 'Si' | 'Ca' | 'Mg' | 'Al'
): number {
  const value = source?.[oxide] ?? 0
  if (value <= 0) return 0
  if (element === 'Si') return value * (atomicMass('Si') / COMPOUND_MOLAR_MASS.SiO2)
  if (element === 'Ca') return value * (atomicMass('Ca') / COMPOUND_MOLAR_MASS.CaO)
  if (element === 'Mg') return value * (atomicMass('Mg') / COMPOUND_MOLAR_MASS.MgO)
  return value * ((2 * atomicMass('Al')) / COMPOUND_MOLAR_MASS.Al2O3)
}

function resolveElementMass(
  source: Partial<Record<CopperElementKey, number>> | undefined,
  token: string
): number {
  if (token === 'Si') return oxideEquivalentToElementMass(source, 'SiO₂(二氧化硅)', 'Si')
  if (token === 'Ca') return oxideEquivalentToElementMass(source, 'CaO(氧化钙)', 'Ca')
  if (token === 'Mg') return oxideEquivalentToElementMass(source, 'MgO(氧化镁)', 'Mg')
  if (token === 'Al') return oxideEquivalentToElementMass(source, 'Al₂O₃(三氧化二铝)', 'Al')
  const el = ELEMENT_SYMBOL_MAP[token]
  return el ? source?.[el] ?? 0 : 0
}

function elementMassInPhase(phaseKey: string, token: string): number {
  return resolveElementMass(COPPER_BUILTIN_PHASE_FRACTIONS[phaseKey] as Partial<Record<CopperElementKey, number>>, token)
}

function resolveRef(path: string[], table: ConstraintSymbolTable): number {
  if (path.length === 1) {
    const token = path[0]!
    return table.variables?.[token] ?? FORMULA_CONSTANTS[token] ?? 0
  }
  if (path.length < 2) return 0
  const [scope, name, ...rest] = path
  if (scope === 'Input') {
    if (rest.length === 0) return table.inputMass[name] ?? 0
    if (rest.length === 1) {
      const token = rest[0]!
      const phaseMass = table.inputPhaseMass?.[name]?.[token]
      if (phaseMass !== undefined) return phaseMass
      const elementMass = resolveElementMass(table.inputElementMass[name], token)
      if (elementMass) return elementMass
      return 0
    }
    if (rest.length >= 2) {
      const phase = rest[0]!
      const sub = rest[1]!
      const phaseMass = table.inputPhaseMass?.[name]?.[phase] ?? 0
      return phaseMass * elementMassInPhase(phase, sub)
    }
    return 0
  }
  if (scope === 'Output') {
    if (rest.length === 0) return table.outputMass[name] ?? 0
    if (rest.length === 1) {
      const token = rest[0]!
      const phaseMass = table.outputPhaseMass[name]?.[token]
      if (phaseMass !== undefined) return phaseMass
      const elementMass = resolveElementMass(table.outputElementMass[name], token)
      if (elementMass) return elementMass
      return 0
    }
    if (rest.length >= 2) {
      const phase = rest[0]!
      const sub = rest[1]!
      const phaseMass = table.outputPhaseMass[name]?.[phase] ?? 0
      return phaseMass * elementMassInPhase(phase, sub)
    }
    return 0
  }
  if (scope === 'OutputE') {
    if (rest.length === 1) {
      const token = rest[0]!
      return resolveElementMass(table.outputElementMass[name], token)
    }
    return 0
  }
  return 0
}

export function evaluateConstraintExpression(ast: ExprNode, table: ConstraintSymbolTable): number {
  switch (ast.type) {
    case 'number':
      return ast.value
    case 'ref':
      return resolveRef(ast.path, table)
    case 'unary':
      return -evaluateConstraintExpression(ast.arg, table)
    case 'binary': {
      const left = evaluateConstraintExpression(ast.left, table)
      const right = evaluateConstraintExpression(ast.right, table)
      if (ast.op === '+') return left + right
      if (ast.op === '-') return left - right
      if (ast.op === '*') return left * right
      if (ast.op === '/') {
        const denom = Math.abs(right) > 1e-12 ? right : right < 0 ? -1e-12 : 1e-12
        return left / denom
      }
      return 0
    }
    default:
      return 0
  }
}

export function evaluateConstraintExprString(expr: string, table: ConstraintSymbolTable): number {
  return evaluateConstraintExpression(parseConstraintExpression(expr), table)
}

export function buildConstraintSymbolTable(params: {
  blendMass: number
  blendElementMass: Partial<Record<CopperElementKey, number>>
  fuelMass: number
  fuelElementMass: Partial<Record<CopperElementKey, number>>
  concentrateMass: number
  inputPhaseMass?: Record<string, Record<string, number>>
  variables?: Record<string, number>
  gasMass?: Record<string, number>
  gasElementMass?: Record<string, Partial<Record<CopperElementKey, number>>>
  productNames: Record<OxySideBlowProductKey, string>
  products: Record<
    OxySideBlowProductKey,
    { mass: number; phases: Record<string, number>; elementMass: Partial<Record<CopperElementKey, number>> }
  >
}): ConstraintSymbolTable {
  const fuelWaterMass = params.inputPhaseMass?.煤?.H2O ?? params.inputPhaseMass?.燃料煤?.H2O ?? 0
  const outputMass: Record<string, number> = {}
  const outputPhaseMass: Record<string, Record<string, number>> = {}
  const outputElementMass: Record<string, Partial<Record<CopperElementKey, number>>> = {}
  for (const key of Object.keys(params.products) as OxySideBlowProductKey[]) {
    const name = params.productNames[key]
    const product = params.products[key]!
    outputMass[name] = product.mass
    outputPhaseMass[name] = { ...product.phases }
    outputElementMass[name] = { ...product.elementMass }
  }
  return {
    variables: params.variables,
    inputMass: {
      混合铜精矿: params.concentrateMass,
      混料: params.blendMass,
      煤: params.fuelMass,
      燃料煤: params.fuelMass,
      煤湿基: params.fuelMass + fuelWaterMass,
      ...(params.gasMass ?? {}),
    },
    inputElementMass: {
      混合铜精矿: params.blendElementMass,
      混料: params.blendElementMass,
      煤: params.fuelElementMass,
      ...(params.gasElementMass ?? {}),
    },
    inputPhaseMass: {
      ...(params.inputPhaseMass ?? {}),
      煤: {
        ...(params.inputPhaseMass?.煤 ?? {}),
        H2O: fuelWaterMass,
      },
      燃料煤: {
        ...(params.inputPhaseMass?.燃料煤 ?? {}),
        H2O: fuelWaterMass,
      },
    },
    outputMass,
    outputPhaseMass,
    outputElementMass,
  }
}
