import type { OxySideBlowConstraintConfig } from './antimonyConstraintConfig.ts'

function cloneOxyConstraintConfig(config: OxySideBlowConstraintConfig): OxySideBlowConstraintConfig {
  return {
    ...config,
    _variableNotes: config._variableNotes ? { ...config._variableNotes } : undefined,
    variables: config.variables ? { ...config.variables } : undefined,
    products: Object.fromEntries(
      Object.entries(config.products).map(([key, product]) => [
        key,
        {
          ...product,
          allowedElements: [...product.allowedElements],
          phases: [...product.phases],
        },
      ])
    ) as OxySideBlowConstraintConfig['products'],
    elementDistributions: config.elementDistributions.map((entry) => ({
      element: entry.element,
      rules: entry.rules.map((rule) => ({ ...rule })),
    })),
    customConstraints: config.customConstraints.map((entry) => ({ ...entry })),
    solverParams: config.solverParams ? { ...config.solverParams } : undefined,
  }
}

export type AntimonyProcessParameters = {
  matteAntimonyGrade: number
  slagAntimonyWPercent: number
  feSiO2: number
  caOSiO2: number
  oxygenEnrichmentPct: number
  fuelConcentrateRatio: number
}

export const DEFAULT_SECONDARY_AIR_OXYGEN_SUPPLY_TARGET = 1.02
export const LEGACY_SECONDARY_AIR_OXYGEN_SUPPLY_TARGET = 1.57381

export const DEFAULT_ANTIMONY_PROCESS_PARAMETERS: AntimonyProcessParameters = {
  matteAntimonyGrade: 6.1,
  slagAntimonyWPercent: 17.73,
  feSiO2: 1.010461956,
  caOSiO2: 0.5,
  oxygenEnrichmentPct: 30,
  fuelConcentrateRatio: 0.0330474820760344,
}

export type ImportedAntimonyProcessParameters = Partial<AntimonyProcessParameters> & {
  matteCopperGrade?: number
  slagCopperWPercent?: number
}

function importedNumber(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

/** Convert legacy MetCal/copper-shaped constraint parameters into antimony field names. */
export function normalizeImportedAntimonyProcessParameters(
  params: ImportedAntimonyProcessParameters
): AntimonyProcessParameters {
  return {
    matteAntimonyGrade: importedNumber(
      params.matteAntimonyGrade ?? params.matteCopperGrade,
      DEFAULT_ANTIMONY_PROCESS_PARAMETERS.matteAntimonyGrade
    ),
    slagAntimonyWPercent: importedNumber(
      params.slagAntimonyWPercent ?? params.slagCopperWPercent,
      DEFAULT_ANTIMONY_PROCESS_PARAMETERS.slagAntimonyWPercent
    ),
    feSiO2: importedNumber(params.feSiO2, DEFAULT_ANTIMONY_PROCESS_PARAMETERS.feSiO2),
    caOSiO2: importedNumber(params.caOSiO2, DEFAULT_ANTIMONY_PROCESS_PARAMETERS.caOSiO2),
    oxygenEnrichmentPct: importedNumber(
      params.oxygenEnrichmentPct,
      DEFAULT_ANTIMONY_PROCESS_PARAMETERS.oxygenEnrichmentPct
    ),
    fuelConcentrateRatio: importedNumber(
      params.fuelConcentrateRatio,
      DEFAULT_ANTIMONY_PROCESS_PARAMETERS.fuelConcentrateRatio
    ),
  }
}

export const SLAG_FE_SIO2_EXPR = 'OutputE.熔炼渣.Fe / (OutputE.熔炼渣.Si / Si * SiO2)'
export const SLAG_CAO_SIO2_EXPR =
  '(OutputE.熔炼渣.Ca / Ca * CaO) / (OutputE.熔炼渣.Si / Si * SiO2)'
export const FUEL_CONCENTRATE_RATIO_EXPR = 'Input.煤 / Input.混合锑精矿'
/** MetCal：分子 O₂ 为 kg，分母空气/氧气为 Nm³；内部质量为 t/h，求值时 O₂ 质量×1000。 */
export const OXYGEN_ENRICHMENT_EXPR =
  '((Input.空气.O2 + Input.氧气.O2) / 32 * 22.4) / (Input.空气 + Input.氧气)'
export const LEGACY_OXYGEN_ENRICHMENT_EXPR =
  '(Input.空气.O2 / O2 + Input.氧气.O2 / O2) / (Input.空气.O2 / O2 + Input.空气.N2 / N2 + Input.空气.H2O / H2O + Input.氧气.O2 / O2 + Input.氧气.N2 / N2 + Input.氧气.H2O / H2O)'
/** MetCal 约束式中煤碳摩尔换算使用的固定碳原子量 */
export const METCAL_CARBON_ATOMIC_MASS = 12
export const SECONDARY_AIR_OXYGEN_SUPPLY_EXPR =
  '(Input.二次风.O2 / O2) / (((Input.混合锑精矿.CuFeS2.S / 4) + (Input.混合锑精矿.FeS2.S / 2)) / S * 0.7 + (Input.煤.C / 12) * 0.7)'
export const LEGACY_SECONDARY_AIR_OXYGEN_SUPPLY_EXPR =
  '(Input.二次风.O2 / O2) / (((Input.混合锑精矿.CuFeS2.S / 4) + (Input.混合锑精矿.FeS2.S / 2) * 0.7) / S + (Input.煤.C / C) * 0.7)'
export const LEGACY_SECONDARY_AIR_OXYGEN_SUPPLY_EXPR_O_DIVISOR =
  '(Input.二次风.O2 / O) / (((Input.混合锑精矿.CuFeS2.S / 4) + (Input.混合锑精矿.FeS2.S / 2) * 0.7) / S + (Input.煤.C / C) * 0.7)'
export const MATTE_S_GMC_EXPR = 'OutputE.锑锍.S / (0.265413629241361 * Output.锑锍)'
export const MATTE_FE_GMC_EXPR = 'OutputE.锑锍.Fe / (0.419059112179791 * Output.锑锍)'
export const DUST_CONCENTRATE_RATIO_EXPR = 'Output.锑氧粉 / Input.混合锑精矿'
export const DEFAULT_DUST_CONCENTRATE_RATIO_TARGET = 0.02
/** 产出约束默认允许相对偏差（千分之五） */
export const DEFAULT_CONSTRAINT_RELATIVE_TOLERANCE = 0.005

function isSlagFeSiO2Expr(expr: string): boolean {
  const normalized = expr.replace(/\s+/g, '')
  return normalized.includes('OutputE.熔炼渣.Fe') && normalized.includes('SiO2')
}

function isSlagCaOSiO2Expr(expr: string): boolean {
  const normalized = expr.replace(/\s+/g, '')
  return normalized.includes('OutputE.熔炼渣.Ca') && normalized.includes('CaO') && normalized.includes('SiO2')
}

export function isFuelConcentrateRatioExpr(expr: string): boolean {
  return expr.replace(/\s+/g, '') === FUEL_CONCENTRATE_RATIO_EXPR.replace(/\s+/g, '')
}

export function isOxygenEnrichmentExpr(expr: string): boolean {
  const normalized = expr.replace(/\s+/g, '')
  if (!(normalized.includes('Input.空气.O2') && normalized.includes('Input.氧气.O2'))) return false
  return (
    normalized.includes('Input.空气.N2') ||
    (normalized.includes('22.4') && normalized.includes('Input.空气') && normalized.includes('Input.氧气'))
  )
}

function isSecondaryAirOxygenSupplyExpr(expr: string): boolean {
  const normalized = expr.replace(/\s+/g, '')
  return normalized.includes('Input.二次风.O2') && normalized.includes('Input.混合锑精矿.CuFeS2.S')
}

function usesLegacySecondaryAirOxygenDivisor(expr: string): boolean {
  const normalized = expr.replace(/\s+/g, '')
  return /Input\.二次风\.O2\/O\)/.test(normalized) && !/Input\.二次风\.O2\/O2\)/.test(normalized)
}

function usesLegacySecondaryAirSulfurFactor(expr: string): boolean {
  const normalized = expr.replace(/\s+/g, '')
  return normalized.includes('FeS2.S/2)*0.7') && !normalized.includes('/S*0.7+')
}

function usesLegacySecondaryAirCarbonDivisor(expr: string): boolean {
  const normalized = expr.replace(/\s+/g, '')
  return normalized.includes('Input.煤.C/C)') && !normalized.includes('Input.煤.C/12)')
}

export function migrateSecondaryAirOxygenSupplyConstraints(
  config: OxySideBlowConstraintConfig
): OxySideBlowConstraintConfig {
  return {
    ...config,
    customConstraints: config.customConstraints.map((entry) => {
      if (!isSecondaryAirOxygenSupplyExpr(entry.expr)) return entry
      const usesLegacyExpr =
        usesLegacySecondaryAirOxygenDivisor(entry.expr) ||
        usesLegacySecondaryAirSulfurFactor(entry.expr) ||
        usesLegacySecondaryAirCarbonDivisor(entry.expr)
      const target =
        typeof entry.target === 'number' &&
        Math.abs(entry.target - LEGACY_SECONDARY_AIR_OXYGEN_SUPPLY_TARGET) < 1e-5
          ? DEFAULT_SECONDARY_AIR_OXYGEN_SUPPLY_TARGET
          : entry.target
      if (!usesLegacyExpr && target === entry.target && entry.expr === SECONDARY_AIR_OXYGEN_SUPPLY_EXPR) {
        return entry
      }
      return {
        ...entry,
        expr: SECONDARY_AIR_OXYGEN_SUPPLY_EXPR,
        target,
        note:
          entry.note ??
          '【解读】(二次风 O₂ 摩尔) ÷ (((CuFeS₂.S/4+FeS₂.S/2)/S×0.7) + (煤干基 C/12×0.7))。【业务】供氧系数默认 1.02；煤碳按干基 C% 与固定原子量 12 换算。【执行】按精矿物相和当前煤量实时重算二次风。',
      }
    }),
  }
}

export function migrateOxygenEnrichmentConstraints(
  config: OxySideBlowConstraintConfig
): OxySideBlowConstraintConfig {
  return {
    ...config,
    customConstraints: config.customConstraints.map((entry) => {
      if (!isOxygenEnrichmentExpr(entry.expr)) return entry
      if (entry.expr.replace(/\s+/g, '') === OXYGEN_ENRICHMENT_EXPR.replace(/\s+/g, '')) return entry
      return {
        ...entry,
        expr: OXYGEN_ENRICHMENT_EXPR,
        note:
          entry.note ??
          '【解读】(空气+氧气中 O₂ 质量 kg ÷32×22.4) ÷ (空气+氧气体积 Nm³)。【业务】一次风富氧体积分数默认 85%。【执行】按湿基摩尔分数硬投影空气/氧气比例；表达式求值时 O₂ 按 t→kg、气体总量按 Nm³。',
      }
    }),
  }
}

function isMatteSGmcExpr(expr: string): boolean {
  return expr.includes('OutputE.锑锍.S') && expr.includes('Output.锑锍')
}

function isMatteFeGmcExpr(expr: string): boolean {
  return expr.includes('OutputE.锑锍.Fe') && expr.includes('Output.锑锍')
}

export function matteSPercentFromGmc(gmc: number): number {
  return -0.125 * gmc / 100 + 0.292
}

export function matteFePercentFromGmc(gmc: number): number {
  return -0.825 * gmc / 100 + 0.633
}

/** 约束表达式是否引用 GMC（锑锍锑品位 / 锑锍品位） */
export function constraintUsesGmcVariable(expr: string): boolean {
  return /\bGMC\b/.test(expr.replace(/\s+/g, ''))
}

function readMatteAntimonyGradeFromConfig(config: OxySideBlowConstraintConfig): number {
  const sbEntry = config.elementDistributions.find((entry) => entry.element === 'Sb(锑)')
  const matteRule = sbEntry?.rules.find((rule) => rule.product === 'matte' && rule.type === 'W%')
  if (typeof matteRule?.value === 'number' && Number.isFinite(matteRule.value)) {
    return matteRule.value
  }
  if (typeof matteRule?.value === 'string') {
    const trimmed = matteRule.value.trim()
    const numeric = Number(trimmed.replace(',', '.'))
    if (/^(?:\d+\.?\d*|\.\d+)$/.test(trimmed.replace(',', '.')) && Number.isFinite(numeric)) {
      return numeric
    }
    const variableValue = config.variables?.[trimmed]
    if (typeof variableValue === 'number' && Number.isFinite(variableValue)) {
      return variableValue
    }
  }
  const variableGmc = config.variables?.GMC
  if (typeof variableGmc === 'number' && Number.isFinite(variableGmc)) {
    return variableGmc
  }
  return DEFAULT_ANTIMONY_PROCESS_PARAMETERS.matteAntimonyGrade
}

function readSlagAntimonyWPercentFromConfig(config: OxySideBlowConstraintConfig): number {
  const sbEntry = config.elementDistributions.find((entry) => entry.element === 'Sb(锑)')
  const slagRule = sbEntry?.rules.find((rule) => rule.product === 'smeltingSlag' && rule.type === 'W%')
  if (typeof slagRule?.value === 'number' && Number.isFinite(slagRule.value)) {
    return slagRule.value
  }
  return DEFAULT_ANTIMONY_PROCESS_PARAMETERS.slagAntimonyWPercent
}

export function extractProcessParameters(config: OxySideBlowConstraintConfig): AntimonyProcessParameters {
  const feConstraint = config.customConstraints.find((entry) => isSlagFeSiO2Expr(entry.expr))
  const caConstraint = config.customConstraints.find((entry) => isSlagCaOSiO2Expr(entry.expr))
  const fuelConstraint = config.customConstraints.find((entry) => isFuelConcentrateRatioExpr(entry.expr))
  const oxygenConstraint = config.customConstraints.find((entry) => isOxygenEnrichmentExpr(entry.expr))
  const oxygenTarget = oxygenConstraint?.target ?? DEFAULT_ANTIMONY_PROCESS_PARAMETERS.oxygenEnrichmentPct / 100
  return {
    matteAntimonyGrade: readMatteAntimonyGradeFromConfig(config),
    slagAntimonyWPercent: readSlagAntimonyWPercentFromConfig(config),
    feSiO2: feConstraint?.target ?? DEFAULT_ANTIMONY_PROCESS_PARAMETERS.feSiO2,
    caOSiO2: caConstraint?.target ?? DEFAULT_ANTIMONY_PROCESS_PARAMETERS.caOSiO2,
    oxygenEnrichmentPct: oxygenTarget * 100,
    fuelConcentrateRatio: fuelConstraint?.target ?? DEFAULT_ANTIMONY_PROCESS_PARAMETERS.fuelConcentrateRatio,
  }
}

function upsertSbElementDistribution(
  config: OxySideBlowConstraintConfig,
  product: 'matte' | 'smeltingSlag',
  type: 'W%',
  value: number | string
): OxySideBlowConstraintConfig['elementDistributions'] {
  const elementKey = 'Sb(锑)'
  const entries = config.elementDistributions.map((entry) => ({
    ...entry,
    rules: entry.rules.map((rule) => ({ ...rule })),
  }))
  let sbEntry = entries.find((entry) => entry.element === elementKey)
  if (!sbEntry) {
    sbEntry = { element: elementKey, rules: [] }
    entries.push(sbEntry)
  }
  const existing = sbEntry.rules.find((rule) => rule.product === product && rule.type === type)
  if (existing) {
    existing.value = value
  } else {
    sbEntry.rules.push({ product, type, value })
  }
  return entries
}

export function applyProcessParameters(
  config: OxySideBlowConstraintConfig,
  params: AntimonyProcessParameters,
  options?: { addMissingConstraints?: boolean }
): OxySideBlowConstraintConfig {
  const next = cloneOxyConstraintConfig(config)
  const gmc = Math.max(0, Math.min(100, params.matteAntimonyGrade))
  const slagSb = Math.max(0, Math.min(100, params.slagAntimonyWPercent))
  const feSiO2 = Math.max(0, params.feSiO2)
  const caOSiO2 = Math.max(0, params.caOSiO2)
  const oxygenFraction = Math.max(0, Math.min(1, params.oxygenEnrichmentPct / 100))
  const fuelRatio =
    Number.isFinite(params.fuelConcentrateRatio) && params.fuelConcentrateRatio > 0
      ? params.fuelConcentrateRatio
      : DEFAULT_ANTIMONY_PROCESS_PARAMETERS.fuelConcentrateRatio

  next.variables = { ...(next.variables ?? {}), GMC: gmc }

  next.elementDistributions = upsertSbElementDistribution(
    { ...next, elementDistributions: next.elementDistributions },
    'matte',
    'W%',
    gmc
  )
  next.elementDistributions = upsertSbElementDistribution(
    { ...next, elementDistributions: next.elementDistributions },
    'smeltingSlag',
    'W%',
    slagSb
  )

  let hasFeSiO2 = false
  let hasCaOSiO2 = false
  let hasFuelRatio = false
  let hasOxygen = false
  let hasMatteS = false
  let hasMatteFe = false

  next.customConstraints = next.customConstraints.map((entry) => {
    if (isFuelConcentrateRatioExpr(entry.expr)) {
      hasFuelRatio = true
      return { ...entry, expr: FUEL_CONCENTRATE_RATIO_EXPR, target: fuelRatio }
    }
    if (isOxygenEnrichmentExpr(entry.expr)) {
      hasOxygen = true
      return { ...entry, expr: OXYGEN_ENRICHMENT_EXPR, target: oxygenFraction }
    }
    if (isSlagFeSiO2Expr(entry.expr)) {
      hasFeSiO2 = true
      return { ...entry, expr: SLAG_FE_SIO2_EXPR, target: feSiO2 }
    }
    if (isSlagCaOSiO2Expr(entry.expr)) {
      hasCaOSiO2 = true
      return { ...entry, expr: SLAG_CAO_SIO2_EXPR, target: caOSiO2 }
    }
    if (isMatteSGmcExpr(entry.expr)) {
      hasMatteS = true
      return { ...entry, expr: MATTE_S_GMC_EXPR, target: 1 }
    }
    if (isMatteFeGmcExpr(entry.expr)) {
      hasMatteFe = true
      return { ...entry, expr: MATTE_FE_GMC_EXPR, target: 1 }
    }
    return entry
  })

  const addMissing = options?.addMissingConstraints !== false

  if (addMissing && !hasFuelRatio) {
    next.customConstraints.unshift({
      expr: FUEL_CONCENTRATE_RATIO_EXPR,
      target: fuelRatio,
      note: '煤/精矿比（工艺参数面板）',
    })
  }
  if (addMissing && !hasOxygen) {
    const insertAt = next.customConstraints.findIndex((entry) => isSlagFeSiO2Expr(entry.expr))
    const oxygenEntry = {
      expr: OXYGEN_ENRICHMENT_EXPR,
      target: oxygenFraction,
      note: '富氧气体 O₂ 体积分数（工艺参数面板）',
    }
    if (insertAt >= 0) {
      next.customConstraints.splice(insertAt, 0, oxygenEntry)
    } else {
      next.customConstraints.push(oxygenEntry)
    }
  }
  if (addMissing && !hasFeSiO2) {
    next.customConstraints.push({
      expr: SLAG_FE_SIO2_EXPR,
      target: feSiO2,
      note: '熔炼渣 Fe/SiO₂ 质量比（工艺参数面板）',
    })
  }
  if (addMissing && !hasCaOSiO2) {
    next.customConstraints.push({
      expr: SLAG_CAO_SIO2_EXPR,
      target: caOSiO2,
      note: '熔炼渣 CaO/SiO₂ 质量比（工艺参数面板）',
    })
  }
  if (addMissing && !hasMatteS) {
    next.customConstraints.push({
      expr: MATTE_S_GMC_EXPR,
      target: 1,
      note: '锑锍硫含量与 GMC 关联（工艺参数面板）',
    })
  }
  if (addMissing && !hasMatteFe) {
    next.customConstraints.push({
      expr: MATTE_FE_GMC_EXPR,
      target: 1,
      note: '锑锍铁含量与 GMC 关联（工艺参数面板）',
    })
  }

  return next
}

export function validateProcessParameters(params: AntimonyProcessParameters): string | null {
  if (!Number.isFinite(params.matteAntimonyGrade) || params.matteAntimonyGrade <= 0 || params.matteAntimonyGrade > 100) {
    return '锑锍品位须在 0–100% 之间'
  }
  if (!Number.isFinite(params.slagAntimonyWPercent) || params.slagAntimonyWPercent < 0 || params.slagAntimonyWPercent > 100) {
    return '渣含锑须在 0–100% 之间'
  }
  if (!Number.isFinite(params.feSiO2) || params.feSiO2 <= 0) {
    return '铁硅比须为大于 0 的数值'
  }
  if (!Number.isFinite(params.caOSiO2) || params.caOSiO2 < 0) {
    return '钙硅比须为不小于 0 的数值'
  }
  if (!Number.isFinite(params.oxygenEnrichmentPct) || params.oxygenEnrichmentPct < 0 || params.oxygenEnrichmentPct > 100) {
    return '富氧浓度须在 0–100% 之间'
  }
  if (!Number.isFinite(params.fuelConcentrateRatio) || params.fuelConcentrateRatio < 0) {
    return '煤率须为不小于 0 的数值'
  }
  return null
}

export function processParametersFromLegacyCase(
  _targetFeSiO2: string | undefined,
  _targetCaOSiO2: string | undefined,
  config?: OxySideBlowConstraintConfig | null
): AntimonyProcessParameters {
  if (config) {
    return extractProcessParameters(config)
  }
  return { ...DEFAULT_ANTIMONY_PROCESS_PARAMETERS }
}

/** 从约束配置同步工艺参数显示（不触发下游重置） */
export function processParametersFromConfig(config: OxySideBlowConstraintConfig): AntimonyProcessParameters {
  return extractProcessParameters(config)
}
