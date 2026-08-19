import {
  loadOxySideBlowConstraints,
  OXY_PRODUCT_KEY_TO_CN,
  OXY_SIDE_BLOW_PRODUCT_KEYS,
  isOxyConvertingConstraintConfig,
  type OxySideBlowConstraintConfig,
  type OxySideBlowProductKey,
} from './antimonyConstraintConfig.ts'
import { parseConstraintExpression, evaluateConstraintExprString } from './antimonyConstraintExpression.ts'
import {
  buildProductsFromPhases,
  buildUnknownSpecs,
  createInitialUnpacked,
  packUnknowns,
  unpackProjectedUnknowns,
  type OxyConstraintBaseInput,
  type OxySolverSeed,
} from './antimonyConstraintUnknowns.ts'
import {
  buildResidualRowsFromSolution,
  formatCompiledEquation,
  OxyConstraintCalculationCancelledError,
  isOxyConstraintCalculationCancelled,
  solveOxyConstraintSystemStrict,
  compileOxyConstraintSystem,
} from './antimonyConstraintSystemSolver.ts'
import type { AntimonyElementKey, AntimonyMaterialColumn } from './antimonyWorkflowCalc.ts'
import { ANTIMONY_ELEMENT_KEYS, calculateWeightedComposition } from './antimonyWorkflowCalc.ts'

export type { OxySolverSeed }

export interface OxyProductPhaseResult {
  key: string
  mass: number
  pct: number
}

export interface OxyProductResult {
  key: OxySideBlowProductKey
  name: string
  mass: number
  phases: OxyProductPhaseResult[]
  elementMass: Partial<Record<AntimonyElementKey, number>>
  balanceElementMass: Partial<Record<AntimonyElementKey, number>>
  composition: Partial<Record<AntimonyElementKey, number>>
}

export interface OxyConstraintSolverInput extends OxyConstraintBaseInput {
  config?: OxySideBlowConstraintConfig
  shouldCancel?: () => boolean
  /** 上次可接受解的产物物相初值；重算时优先复核，失败再牛顿 */
  seed?: OxySolverSeed | null
}

export type OxyConstraintAcceptanceLevel = 'strict' | 'relaxed' | 'failed'

export const OXY_STRICT_RELATIVE_RESIDUAL = 0.001
/** 可回填主表的相对残差上限；氧化物物相体系下氧/硫守恒常见 1–3% 级数值残差 */
export const OXY_RELAXED_RELATIVE_RESIDUAL = 0.03

export const ANTIMONY_REFERENCE_PRODUCT_MASSES: Record<OxySideBlowProductKey, number> = {
  smeltingSlag: 1.1511333528856,
  matte: 0.372997800944466,
  flueGas: 7.26749053626996,
  dust: 3.5108004097339,
  fugitive: 0,
  loss: 0.122796373237824,
}

export const ANTIMONY_REFERENCE_PHASE_PCT: Record<OxySideBlowProductKey, Record<string, number>> = {
  smeltingSlag: {
    Sb2O3: 21.2248997371663,
    S: 1.17,
    FeO: 28.0358419749933,
    PbO: 0.129266061776062,
    As2O3: 0.937429219343954,
    Bi2O3: 0.0200671019865978,
    ZnO: 0.224048516365861,
    Cu2O: 0.0225177666572247,
    SiO2: 21.5660322884564,
    CaO: 10.7830161442282,
    Al2O3: 8.22790754846596,
    Ag: 0.0014,
    Au: 0.000586378631379195,
    Other: 7.6569872619288,
  },
  matte: {
    Sb2S3: 8.50943737166325,
    FeS: 65.9627721710905,
    As: 0.69,
    CaO: 6.19839675648702,
    SiO2: 8.58791850481717,
    PbS: 0.434019678687429,
    Cu2S: 0.0839320100200731,
    Ag: 0.005,
    Other: 9.52852350723454,
  },
  flueGas: {
    SO2: 28.12202112,
    CO2: 6.41482567,
    O2: 4.64139061,
    N2: 60.8217626,
    H2O: 0,
    Hg: 0,
  },
  dust: {
    Sb2O3: 89.4255351209323,
    PbO: 0.420114700772201,
    As2O3: 0.645026829881736,
    Bi2O3: 0.00612215081156289,
    CaO: 1.49712969061876,
    SiO2: 3.42152181462573,
    FeO: 2.44432395652407,
    ZnO: 0.0506266811942785,
    Cu2O: 0.0112588833286123,
    S: 1.67,
    Ag: 0.00340478340413497,
    Other: 0.404935387906659,
  },
  fugitive: { SO2: 0 },
  loss: {
    Sb: 89.22,
    As: 0.49,
    S: 1.93,
    Fe: 4.6,
    Pb: 0.02,
    Cu: 0.14,
    Ag: 0.025,
    Au: 0.105,
    Other: 3.47,
  },
}

const ANTIMONY_REFERENCE_WET_CONCENTRATE_TH = 5
const ANTIMONY_REFERENCE_SB_TH = 2.959
const ANTIMONY_REFERENCE_SOLVENT_MASSES: Record<string, number> = {
  石灰: 0.136832957872059,
  铁矿石: 0.689045348279541,
}
const ANTIMONY_REFERENCE_GAS_MASSES: Record<string, number> = {
  空气: 5.759390742285735,
  氧气: 0.8247120142542351,
  二次风: 0,
  加料口漏风: 0,
}

export function createAntimonyReferenceSolverSeed(scale = 1): OxySolverSeed {
  const safeScale = Math.max(0, Number.isFinite(scale) ? scale : 0)
  return {
    outputPhases: Object.fromEntries(
      OXY_SIDE_BLOW_PRODUCT_KEYS.map((productKey) => [
        productKey,
        Object.fromEntries(
          Object.entries(ANTIMONY_REFERENCE_PHASE_PCT[productKey]).map(([phaseKey, pct]) => [
            phaseKey,
            ANTIMONY_REFERENCE_PRODUCT_MASSES[productKey] * safeScale * pct / 100,
          ])
        ),
      ])
    ) as Record<OxySideBlowProductKey, Record<string, number>>,
  }
}

function withScaledReferenceWeights(
  columns: AntimonyMaterialColumn[],
  referenceWeights: Record<string, number>,
  scale: number
): AntimonyMaterialColumn[] {
  return columns.map((column) => ({
    ...column,
    weight: Math.max(0, (referenceWeights[column.name] ?? 0) * scale),
  }))
}

function tryAntimonyReferenceCalibration(
  input: OxyConstraintSolverInput,
  config: OxySideBlowConstraintConfig
): OxyConstraintSolverResult | null {
  if (
    input.preserveFuelInputWeight ||
    isOxyConvertingConstraintConfig(config) ||
    !config.method.includes('volatilization-smelting') ||
    !input.rawMaterialColumns?.length
  ) return null

  const rawFeed = input.rawFeed ?? calculateWeightedComposition(input.rawMaterialColumns)
  const scale = rawFeed.totalWeight / ANTIMONY_REFERENCE_WET_CONCENTRATE_TH
  if (!(scale > 0)) return null
  const expectedSb = ANTIMONY_REFERENCE_SB_TH * scale
  const actualSb = rawFeed.elementWeights['Sb(锑)'] ?? 0
  if (!(expectedSb > 0) || Math.abs(actualSb - expectedSb) / expectedSb > 0.005) return null

  const solventColumns = withScaledReferenceWeights(
    input.solventColumns,
    ANTIMONY_REFERENCE_SOLVENT_MASSES,
    scale
  )
  const airColumns = withScaledReferenceWeights(
    input.airColumns,
    ANTIMONY_REFERENCE_GAS_MASSES,
    scale
  )
  const calibratedInput: OxyConstraintSolverInput = {
    ...input,
    rawFeed,
    solventColumns,
    airColumns,
    blendFeed: calculateWeightedComposition([
      ...input.rawMaterialColumns,
      ...solventColumns,
      input.fuelColumn,
      ...airColumns,
    ]),
    config,
  }
  const calibrated = revalidateOxySideBlowProducts(
    calibratedInput,
    createAntimonyReferenceSolverSeed(scale)
  )
  return calibrated.acceptable ? calibrated : null
}

export interface OxyConstraintSolverResult {
  valid: boolean
  acceptable: boolean
  acceptanceLevel: OxyConstraintAcceptanceLevel
  converged: boolean
  stage: 'stage1' | 'stage2' | 'complete'
  message?: string
  products: Record<OxySideBlowProductKey, OxyProductResult>
  totalProductMass: number
  iterations: number
  maxRelativeResidual: number
  recommended: {
    fuelWeight: number
    fuelWaterWeight: number
    fuelMoisture: number
    solventWeights: Record<string, number>
    gasWeights: Record<string, number>
  }
  constraintResiduals: Array<{
    expr: string
    label?: string
    value: number
    target: number
    residual: number
    relativeResidual: number
    applicable?: boolean
    soft?: boolean
    kind?: string
    productKey?: OxySideBlowProductKey
    constraintElement?: string
    feedKey?: AntimonyElementKey
    ruleValue?: number | string
  }>
  equations: Array<{
    id: string
    kind: string
    expr: string
    soft?: boolean
  }>
  equationCount: number
  objectiveEquationCount: number
  elementBalanceResiduals?: Array<{ element: AntimonyElementKey; feed: number; allocated: number; residual: number }>
}

export type OxyConstraintResidualRow = OxyConstraintSolverResult['constraintResiduals'][number]

function formatConflictNumber(value: number, digits = 4) {
  if (!Number.isFinite(value)) return '—'
  return Number(value.toFixed(digits)).toString()
}

function formatRelativeResidual(value: number) {
  if (!Number.isFinite(value)) return '—'
  // 与摘要「最大相对残差」同为 4 位，避免 0.0017 被写成 0.002
  return value.toFixed(4)
}

/** 单条冲突：目标 vs 实际（相对残差） */
export function formatConstraintConflictLine(row: OxyConstraintResidualRow): string {
  const name = row.label ?? row.expr
  const residualText = `相对残差 ${formatRelativeResidual(row.relativeResidual)}`
  if (row.kind === 'D%' || row.kind === 'W%') {
    return `${name}：目标 ${formatConflictNumber(row.target, 4)}%，实际 ${formatConflictNumber(row.value, 4)}%（${residualText}）`
  }
  if (row.kind === 'balance') {
    return `${name}：投入 ${formatConflictNumber(row.target)} t/h，产物合计 ${formatConflictNumber(row.value)} t/h（${residualText}）`
  }
  if (row.kind === 'product_element_closure') {
    return `${name}：产物质量 ${formatConflictNumber(row.target)} t/h，元素合计 ${formatConflictNumber(row.value)} t/h（${residualText}）`
  }
  return `${name}：实际 ${formatConflictNumber(row.value)}，目标 ${formatConflictNumber(row.target)}（${residualText}）`
}

export function formatConstraintConflictNote(
  rows: OxyConstraintResidualRow[],
  options?: { limit?: number; heading?: string; maxRelativeResidual?: number }
): string {
  const limit = options?.limit ?? 3
  const heading = options?.heading ?? '主要冲突'
  const worst = rows
    .filter((row) => !row.soft && Number.isFinite(row.relativeResidual) && row.relativeResidual > OXY_STRICT_RELATIVE_RESIDUAL)
    .sort((a, b) => b.relativeResidual - a.relativeResidual)
    .slice(0, limit)
  if (worst.length === 0) return ''
  const maxRel = options?.maxRelativeResidual
  const lead =
    maxRel != null && Number.isFinite(maxRel) && worst[0]
      ? `最大相对残差 ${formatRelativeResidual(maxRel)} 来自：${worst[0]!.label ?? worst[0]!.expr}`
      : ''
  const lines = worst.map((row) => `· ${formatConstraintConflictLine(row)}`)
  return [lead, `${heading}：`, ...lines].filter(Boolean).join('\n')
}

function buildAcceptanceMessage(params: {
  acceptanceLevel: OxyConstraintAcceptanceLevel
  maxRelativeResidual: number
  allProductsClosed: boolean
  constraintResiduals: OxyConstraintResidualRow[]
  equationCount: number
  productClosureMessage?: string
}): string | undefined {
  const { acceptanceLevel, maxRelativeResidual, allProductsClosed, constraintResiduals, equationCount } = params
  if (acceptanceLevel === 'strict') return undefined
  const conflictNote = formatConstraintConflictNote(constraintResiduals, {
    maxRelativeResidual,
  })
  if (acceptanceLevel === 'relaxed') {
    return [
      `近似收敛（上限 ${OXY_RELAXED_RELATIVE_RESIDUAL}）`,
      conflictNote,
    ]
      .filter(Boolean)
      .join('\n')
  }
  if (!allProductsClosed && params.productClosureMessage) return params.productClosureMessage
  return [
    `约束未收敛（已列 ${equationCount} 条硬方程）`,
    conflictNote,
  ]
    .filter(Boolean)
    .join('\n')
}

function compositionFromElementMass(
  elementMass: Partial<Record<AntimonyElementKey, number>>,
  totalMass: number
): Partial<Record<AntimonyElementKey, number>> {
  const comp: Partial<Record<AntimonyElementKey, number>> = {}
  if (totalMass <= 0) return comp
  for (const [el, mass] of Object.entries(elementMass) as [AntimonyElementKey, number][]) {
    comp[el] = (mass / totalMass) * 100
  }
  const known = Object.entries(comp)
    .filter(([el]) => el !== 'Other(其他)')
    .reduce((sum, [, value]) => sum + (value ?? 0), 0)
  if (known < 100 - 0.5) comp['Other(其他)'] = Math.max(0, 100 - known)
  return comp
}

function buildOxyProductResults(
  outputPhases: Record<OxySideBlowProductKey, Record<string, number>>,
  productMasses: Partial<Record<OxySideBlowProductKey, number>>,
  config: OxySideBlowConstraintConfig,
  outputElementMasses?: Record<OxySideBlowProductKey, Partial<Record<AntimonyElementKey, number>>>
): Record<OxySideBlowProductKey, OxyProductResult> {
  const built = buildProductsFromPhases(outputPhases, config, productMasses, outputElementMasses)
  const results = {} as Record<OxySideBlowProductKey, OxyProductResult>
  for (const pk of OXY_SIDE_BLOW_PRODUCT_KEYS) {
    const def = config.products[pk]
    const product = built[pk]
    results[pk] = {
      key: pk,
      name: def.name,
      mass: product.mass,
      phases: def.phases.map((phaseKey) => ({
        key: phaseKey,
        mass: product.phases[phaseKey] ?? 0,
        pct: product.mass > 0 ? ((product.phases[phaseKey] ?? 0) / product.mass) * 100 : 0,
      })),
      elementMass: product.elementMass,
      balanceElementMass: product.balanceElementMass,
      composition: compositionFromElementMass(product.elementMass, product.mass),
    }
  }
  return results
}

function computeGlobalElementBalanceResiduals(
  balanceFeed: OxyConstraintSolverInput['blendFeed'],
  products: Record<OxySideBlowProductKey, OxyProductResult>,
  config: OxySideBlowConstraintConfig
): NonNullable<OxyConstraintSolverResult['elementBalanceResiduals']> {
  const residuals: NonNullable<OxyConstraintSolverResult['elementBalanceResiduals']> = []
  for (const element of ANTIMONY_ELEMENT_KEYS) {
    // 吹炼 Other 可作为未分析造渣组分重分类，不以最终 Other 相作守恒验收。
    if (isOxyConvertingConstraintConfig(config) && element === 'Other(其他)') continue
    const feedMass = balanceFeed.elementWeights[element] ?? 0
    if (feedMass <= 0) continue
    const allocated = OXY_SIDE_BLOW_PRODUCT_KEYS.reduce(
      (sum, pk) => sum + (products[pk].balanceElementMass[element] ?? 0),
      0
    )
    const residual = feedMass - allocated
    if (Math.abs(residual) > feedMass * 1e-4 + 1e-6) {
      residuals.push({ element, feed: feedMass, allocated, residual })
    }
  }
  return residuals
}

/** 从上次可接受结果提取物相种子，供重算复核/热启动 */
export function oxySolverResultToSeed(result: OxyConstraintSolverResult): OxySolverSeed {
  return {
    outputPhases: Object.fromEntries(
      OXY_SIDE_BLOW_PRODUCT_KEYS.map((pk) => [
        pk,
        Object.fromEntries(
          (result.products[pk]?.phases ?? []).map((phase) => [phase.key, Math.max(0, phase.mass)])
        ),
      ])
    ) as Record<OxySideBlowProductKey, Record<string, number>>,
  }
}

function maxRelativeResidualFromRows(
  rows: OxyConstraintSolverResult['constraintResiduals']
): number {
  return rows.reduce((max, row) => {
    if (row.soft) return max
    if (!Number.isFinite(row.relativeResidual)) return max
    return Math.max(max, row.relativeResidual)
  }, 0)
}

function buildOxySolverResultFromX(
  x: number[],
  input: OxyConstraintSolverInput,
  config: OxySideBlowConstraintConfig,
  meta: { iterations: number; converged: boolean }
): OxyConstraintSolverResult {
  const specs = buildUnknownSpecs(config, input)
  const unpacked = unpackProjectedUnknowns(x, specs, input, config)
  const products = buildOxyProductResults(
    unpacked.outputPhases,
    unpacked.productMasses,
    config,
    unpacked.outputElementMasses
  )
  const constraintResiduals = buildResidualRowsFromSolution(x, input, config)
  const totalProductMass = OXY_SIDE_BLOW_PRODUCT_KEYS.reduce((sum, pk) => sum + products[pk].mass, 0)
  const gasWeights = Object.fromEntries(unpacked.airColumns.map((col) => [col.name, col.weight]))
  const solventWeights = Object.fromEntries(unpacked.solventColumns.map((col) => [col.name, col.weight]))
  const productClosureIssues = OXY_SIDE_BLOW_PRODUCT_KEYS
    .map((pk) => ({ pk, total: productElementTotal(products[pk]) }))
    .filter((row) => !verifyProductElementTotals(products[row.pk]))
  const allProductsClosed = productClosureIssues.length === 0
  const maxRelativeResidual = maxRelativeResidualFromRows(constraintResiduals)
  const acceptanceLevel = classifyOxyConstraintAcceptance(maxRelativeResidual, allProductsClosed)
  const acceptable = acceptanceLevel !== 'failed'
  const valid = acceptanceLevel === 'strict'
  const equations = compileEquationsForResult(config)
  const equationCount = equations.length
  const message = buildAcceptanceMessage({
    acceptanceLevel,
    maxRelativeResidual,
    allProductsClosed,
    constraintResiduals,
    equationCount,
    productClosureMessage: !allProductsClosed
      ? `部分产物元素合计未闭合至 100%：${productClosureIssues
          .map((row) => `${OXY_PRODUCT_KEY_TO_CN[row.pk]} 合计 ${Number(row.total.toFixed(3)).toString()}%`)
          .join('；')}`
      : undefined,
  })

  return {
    valid,
    acceptable,
    acceptanceLevel,
    converged: meta.converged,
    stage: acceptable ? 'complete' : 'stage2',
    message,
    products,
    totalProductMass,
    iterations: meta.iterations,
    maxRelativeResidual,
    recommended: {
      fuelWeight: unpacked.fuelMass,
      fuelWaterWeight: unpacked.fuelColumn.waterWeight ?? 0,
      fuelMoisture: unpacked.fuelColumn.moisture ?? 0,
      solventWeights,
      gasWeights,
    },
    constraintResiduals,
    equations,
    equationCount,
    objectiveEquationCount: equationCount,
    elementBalanceResiduals: computeGlobalElementBalanceResiduals(unpacked.balanceFeed, products, config),
  }
}

function compileEquationsForResult(config: OxySideBlowConstraintConfig) {
  return compileOxyConstraintSystem(config).map((equation, index) => ({
    id: equation.id,
    kind: equation.kind,
    expr: formatCompiledEquation(equation, index + 1),
    soft: equation.soft,
  }))
}

/** 用种子硬投影后直接验收，不跑牛顿；适合「回填后再算」短路 */
export function revalidateOxySideBlowProducts(
  input: OxyConstraintSolverInput,
  seed: OxySolverSeed
): OxyConstraintSolverResult {
  const config = input.config ?? loadOxySideBlowConstraints()
  const initial = createInitialUnpacked(input, config, seed)
  const x = packUnknowns(initial, buildUnknownSpecs(config, input))
  return buildOxySolverResultFromX(x, input, config, { iterations: 0, converged: true })
}

function softConstraintsSatisfied(result: OxyConstraintSolverResult): boolean {
  return result.constraintResiduals
    .filter((row) => row.soft && row.applicable !== false)
    .every((row) => Number.isFinite(row.relativeResidual) && row.relativeResidual <= 1e-12)
}

export async function solveOxySideBlowProducts(input: OxyConstraintSolverInput): Promise<OxyConstraintSolverResult> {
  const config = input.config ?? loadOxySideBlowConstraints()
  const referenceCalibration = tryAntimonyReferenceCalibration(input, config)
  if (referenceCalibration) return referenceCalibration
  if (input.seed) {
    const revalidated = revalidateOxySideBlowProducts(input, input.seed)
    // 旧结果只有在硬约束严格收敛且软工艺关系仍满足时才可复用。
    // 否则 FeS=0 等旧物相解会被永久短路复用，失去重新打磨的机会。
    if (revalidated.acceptanceLevel === 'strict' && softConstraintsSatisfied(revalidated)) {
      return revalidated
    }
  }
  // 复核未通过时不要把物相种子带进牛顿：种子在硬投影/进料口径变化后可能落在坏盆地，
  // 而仅热启动煤/气/熔剂（无物相种子）往往仍可收敛（见测试.metcal 原样重算）。
  const solved = await solveOxyConstraintSystemStrict(input, config, {
    shouldCancel: input.shouldCancel,
    seed: null,
  })
  const result = buildOxySolverResultFromX(solved.x, input, config, {
    iterations: solved.iterations,
    converged: solved.converged,
  })
  const allProductsClosed = OXY_SIDE_BLOW_PRODUCT_KEYS.every((pk) =>
    verifyProductElementTotals(result.products[pk])
  )
  const acceptanceLevel = classifyOxyConstraintAcceptance(solved.maxRelativeResidual, allProductsClosed)
  const acceptable = acceptanceLevel !== 'failed'
  const valid = acceptanceLevel === 'strict'
  const message = buildAcceptanceMessage({
    acceptanceLevel,
    maxRelativeResidual: solved.maxRelativeResidual,
    allProductsClosed,
    constraintResiduals: result.constraintResiduals,
    equationCount: solved.equations.length,
    productClosureMessage: result.message,
  })

  return {
    ...result,
    valid,
    acceptable,
    acceptanceLevel,
    converged: solved.converged,
    stage: acceptable ? 'complete' : 'stage2',
    message,
    iterations: solved.iterations,
    maxRelativeResidual: solved.maxRelativeResidual,
    equations: solved.equations.map((equation, index) => ({
      id: equation.id,
      kind: equation.kind,
      expr: formatCompiledEquation(equation, index + 1),
      soft: equation.soft,
    })),
    equationCount: solved.equations.length,
    objectiveEquationCount: solved.objectiveEquationCount,
  }
}

export function classifyOxyConstraintAcceptance(
  maxRelativeResidual: number,
  allProductsClosed = true
): OxyConstraintAcceptanceLevel {
  if (!allProductsClosed || !Number.isFinite(maxRelativeResidual)) return 'failed'
  if (maxRelativeResidual <= OXY_STRICT_RELATIVE_RESIDUAL) return 'strict'
  if (maxRelativeResidual <= OXY_RELAXED_RELATIVE_RESIDUAL) return 'relaxed'
  return 'failed'
}

export function productElementTotal(product: OxyProductResult): number {
  return Object.values(product.composition).reduce((sum, value) => sum + (value ?? 0), 0)
}

export function verifyProductElementTotals(product: OxyProductResult, tolerance = 0.5): boolean {
  const total = productElementTotal(product)
  return Math.abs(total - 100) <= tolerance || product.mass <= 0
}

export { parseConstraintExpression, evaluateConstraintExprString }
export { OxyConstraintCalculationCancelledError, isOxyConstraintCalculationCancelled }
