import {
  loadOxyConvertingConstraints,
  loadOxySideBlowConstraints,
  OXY_PRODUCT_KEY_TO_CN,
  OXY_SIDE_BLOW_PRODUCT_KEYS,
  type ElementDistributionEntry,
  type OxySideBlowConstraintConfig,
  type OxySideBlowProductKey,
} from './copperConstraintConfig.ts'
import { isBlankConstraintRuleValue } from './copperConstraintValidation.ts'
import type { OxyConstraintSolverResult, OxyProductResult } from './copperConstraintSolver.ts'
import { buildProductsFromPhases } from './copperConstraintUnknowns.ts'
import { normalizeMetcalPhaseFormula, preferMetcalPhaseDisplayKey } from './chemicalFormula.ts'
import {
  GAS_PHASE_MOLAR_MASS,
  STANDARD_GAS_MOLAR_VOLUME_NM3_PER_KMOL,
} from './copperProductPhaseCalc.ts'
import {
  extractMetcalConvertingUnitInputs,
  extractMetcalSmeltingUnitInputs,
  findStreamBlocks,
  type FloStreamBlock,
} from './metcalFloBinary.ts'

/** 相对偏差 ≤ 该阈值视为一致 */
export const METCAL_RESULT_MATCH_TOLERANCE = 0.01

const SMELTING_PRODUCT_STREAM_BY_KEY: Partial<Record<OxySideBlowProductKey, string>> = {
  matte: '白铜锍',
  smeltingSlag: '熔炼渣',
  flueGas: '熔炼出炉烟气',
  dust: '烟气含尘',
}

/** 吹炼产出流名 → 本软件产物 key（与熔炼共用 key，显示名由配置区分） */
const CONVERTING_PRODUCT_STREAM_BY_KEY: Partial<Record<OxySideBlowProductKey, string>> = {
  matte: '粗铜',
  smeltingSlag: '吹炼渣',
  flueGas: '吹炼出炉烟气',
  dust: '吹炼烟气含尘',
}

const CONVERTING_FLUE_GAS_FALLBACK_NAMES = ['吹炼出炉烟气', '吹炼烟气'] as const
const CONVERTING_DUST_FALLBACK_NAMES = ['吹炼烟气含尘', '吹炼烟尘'] as const
/** 本文件常见：含尘结果写在锅炉尘/白烟尘，而非「吹炼烟气含尘」模板流 */
const CONVERTING_DUST_STREAM_FALLBACK_NAMES = ['吹炼锅炉尘', '吹炼白烟尘'] as const
/**
 * 部分 Flo 把吹炼炉出口烟气仍命名为「熔炼出炉烟气」，但后续接入吹炼锅炉/白烟尘/制酸。
 * 用这些锚点区分熔炼段同名烟气。
 */
const CONVERTING_FLUE_GAS_TRAIN_ANCHORS = ['吹炼锅炉尘', '吹炼白烟尘', '吹炼烟气去制酸'] as const

const DUST_FALLBACK_STREAM_NAMES = ['熔炼锅炉尘', '熔炼白烟尘', '熔炼WHB尘'] as const

export type MetcalFloProductStreamSnapshot = {
  productKey: OxySideBlowProductKey
  streamName: string
  massTh: number
  volumeNm3h: number | null
  compositionKind: 'W%' | 'E%' | 'V%' | null
  phasePercent: Record<string, number>
  sourceOffset: number
}

export type MetcalFloProductExtraction = {
  result: OxyConstraintSolverResult | null
  streams: MetcalFloProductStreamSnapshot[]
  warnings: string[]
}

function parseFiniteNumber(raw: string | null | undefined): number | null {
  if (raw == null || raw === '' || raw === 'x') return null
  const num = Number.parseFloat(raw)
  return Number.isFinite(num) ? num : null
}

function parseCompositionTable(block: FloStreamBlock): Record<string, number> {
  const out: Record<string, number> = {}
  for (const entry of block.composition) {
    const num = parseFiniteNumber(entry.value)
    if (num == null) continue
    out[entry.name] = num
  }
  return out
}

function isNumericFlow(flow: string | null | undefined): boolean {
  return parseFiniteNumber(flow) != null
}

function pickBestSolidBlock(candidates: FloStreamBlock[]): FloStreamBlock | null {
  if (candidates.length === 0) return null
  const numeric = candidates.filter((block) => isNumericFlow(block.flowT) && block.compositionKind === 'W%')
  const pool = numeric.length > 0 ? numeric : candidates.filter((block) => block.compositionKind === 'W%')
  if (pool.length === 0) return null
  return pool.slice().sort((a, b) => b.composition.length - a.composition.length)[0]
}

function pickBestGasBlock(candidates: FloStreamBlock[]): FloStreamBlock | null {
  if (candidates.length === 0) return null
  const numeric = candidates.filter((block) => isNumericFlow(block.flowNm3) && block.compositionKind === 'V%')
  const pool = numeric.length > 0 ? numeric : candidates.filter((block) => block.compositionKind === 'V%')
  if (pool.length === 0) return null
  return pool.slice().sort((a, b) => a.offset - b.offset)[0]
}

/** 只读物相；清空 buildProductsFromPhases 推导出的元素，避免误作元素对照 */
function clearElementComposition(result: OxyConstraintSolverResult) {
  for (const pk of OXY_SIDE_BLOW_PRODUCT_KEYS) {
    const product = result.products[pk]
    if (!product) continue
    product.elementMass = {}
    product.balanceElementMass = {}
    product.composition = {}
  }
}

/** V% + Nm³/h → 物相质量 t/h 与质量分数 w% */
export function gasVolumePercentToPhaseMass(
  volumeNm3h: number,
  volumePercents: Record<string, number>
): { massTh: number; phaseMass: Record<string, number>; phasePercent: Record<string, number> } {
  const phaseMass: Record<string, number> = {}
  let massTh = 0
  for (const [name, volPct] of Object.entries(volumePercents)) {
    if (!Number.isFinite(volPct) || volPct <= 0) continue
    const molarMass = GAS_PHASE_MOLAR_MASS[name] ?? GAS_PHASE_MOLAR_MASS.Other
    if (!(molarMass > 0)) continue
    const nm3 = (volumeNm3h * volPct) / 100
    const mass = (nm3 / STANDARD_GAS_MOLAR_VOLUME_NM3_PER_KMOL) * (molarMass / 1000)
    if (!(mass > 0)) continue
    phaseMass[name] = mass
    massTh += mass
  }
  const phasePercent: Record<string, number> = {}
  if (massTh > 0) {
    for (const [name, mass] of Object.entries(phaseMass)) {
      phasePercent[name] = (mass / massTh) * 100
    }
  }
  return { massTh, phaseMass, phasePercent }
}

function compositionFromElementMass(
  elementMass: Partial<Record<string, number>>,
  totalMass: number
): OxyProductResult['composition'] {
  const comp: OxyProductResult['composition'] = {}
  if (!(totalMass > 0)) return comp
  for (const [el, mass] of Object.entries(elementMass)) {
    if (mass == null || !Number.isFinite(mass)) continue
    comp[el as keyof OxyProductResult['composition']] = (mass / totalMass) * 100
  }
  return comp
}

function emptyProduct(pk: OxySideBlowProductKey, config: OxySideBlowConstraintConfig): OxyProductResult {
  return {
    key: pk,
    name: config.products[pk]?.name ?? OXY_PRODUCT_KEY_TO_CN[pk],
    mass: 0,
    phases: (config.products[pk]?.phases ?? []).map((phaseKey) => ({ key: phaseKey, mass: 0, pct: 0 })),
    elementMass: {},
    balanceElementMass: {},
    composition: {},
  }
}

/** Flo 物相名（CaSiO3 / CaO*SiO2 等）对齐到配置显示键，避免对照时质量落到旁路键上 */
function alignFloPhaseMassToConfigKeys(
  phaseMass: Record<string, number>,
  configPhases: string[]
): { aligned: Record<string, number>; extraKeys: string[] } {
  const configByIdentity = new Map(
    configPhases.map((phase) => [normalizeMetcalPhaseFormula(phase) || phase, phase])
  )
  const aligned: Record<string, number> = {}
  for (const [rawKey, mass] of Object.entries(phaseMass)) {
    if (!Number.isFinite(mass) || mass <= 0) continue
    const identity = normalizeMetcalPhaseFormula(rawKey) || rawKey
    const configKey = configByIdentity.get(identity)
    if (configKey) {
      aligned[configKey] = (aligned[configKey] ?? 0) + mass
      continue
    }
    const display = preferMetcalPhaseDisplayKey(rawKey) || rawKey
    aligned[display] = (aligned[display] ?? 0) + mass
  }
  const extraKeys = Object.keys(aligned).filter((key) => !configPhases.includes(key))
  return { aligned, extraKeys }
}

function buildSolverResultFromPhaseMasses(
  phaseMassByProduct: Partial<Record<OxySideBlowProductKey, Record<string, number>>>,
  productMasses: Partial<Record<OxySideBlowProductKey, number>>,
  config: OxySideBlowConstraintConfig
): OxyConstraintSolverResult {
  const outputPhases = {} as Record<OxySideBlowProductKey, Record<string, number>>
  const extendedConfig: OxySideBlowConstraintConfig = {
    ...config,
    products: { ...config.products },
  }

  for (const pk of OXY_SIDE_BLOW_PRODUCT_KEYS) {
    const phaseMass = phaseMassByProduct[pk] ?? {}
    const basePhases = config.products[pk]?.phases ?? []
    const { aligned, extraKeys } = alignFloPhaseMassToConfigKeys(phaseMass, basePhases)
    extendedConfig.products[pk] = {
      ...config.products[pk],
      phases: [...basePhases, ...extraKeys],
    }
    outputPhases[pk] = aligned
  }

  const built = buildProductsFromPhases(outputPhases, extendedConfig, productMasses)
  const products = {} as Record<OxySideBlowProductKey, OxyProductResult>
  for (const pk of OXY_SIDE_BLOW_PRODUCT_KEYS) {
    const def = extendedConfig.products[pk]
    const product = built[pk]
    const floPhaseKeys = new Set(Object.keys(outputPhases[pk] ?? {}))
    const phaseEntries = Object.entries(product.phases)
      .filter(([key, mass]) => mass > 1e-12 || floPhaseKeys.has(key))
      .sort((a, b) => b[1] - a[1])
    const orderedKeys =
      phaseEntries.length > 0
        ? phaseEntries.map(([key]) => key)
        : def.phases
    products[pk] = {
      key: pk,
      name: def.name,
      mass: product.mass,
      phases: orderedKeys.map((phaseKey) => ({
        key: phaseKey,
        mass: product.phases[phaseKey] ?? 0,
        pct: product.mass > 0 ? ((product.phases[phaseKey] ?? 0) / product.mass) * 100 : 0,
      })),
      elementMass: product.elementMass,
      balanceElementMass: product.balanceElementMass,
      composition: compositionFromElementMass(product.elementMass, product.mass),
    }
  }

  const totalProductMass = OXY_SIDE_BLOW_PRODUCT_KEYS.reduce((sum, pk) => sum + products[pk].mass, 0)
  return {
    valid: true,
    acceptable: true,
    acceptanceLevel: 'strict',
    converged: true,
    stage: 'complete',
    message: 'MetCal .flo 产出结果（只读对照）',
    products,
    totalProductMass,
    iterations: 0,
    maxRelativeResidual: 0,
    recommended: {
      fuelWeight: 0,
      fuelWaterWeight: 0,
      fuelMoisture: 0,
      solventWeights: {},
      gasWeights: {},
    },
    constraintResiduals: [],
    equations: [],
    equationCount: 0,
    objectiveEquationCount: 0,
  }
}

function mergeDustFallbackBlocks(
  blocks: FloStreamBlock[],
  fallbackNames: readonly string[] = DUST_FALLBACK_STREAM_NAMES
): {
  massTh: number
  phasePercent: Record<string, number>
  sourceOffset: number
  streamName: string
} | null {
  const chosen: FloStreamBlock[] = []
  for (const name of fallbackNames) {
    const block = pickBestSolidBlock(blocks.filter((item) => item.name === name))
    if (block && isNumericFlow(block.flowT)) chosen.push(block)
  }
  // 熔炼WHB尘与熔炼锅炉尘常为同一股循环尘，优先用锅炉尘+白烟尘
  const unique = chosen.filter((block, index, arr) => {
    if (block.name === '熔炼WHB尘' && arr.some((other) => other.name === '熔炼锅炉尘')) return false
    return arr.findIndex((other) => other.name === block.name) === index
  })
  if (unique.length === 0) return null

  const phaseMass: Record<string, number> = {}
  let massTh = 0
  for (const block of unique) {
    const flow = parseFiniteNumber(block.flowT) ?? 0
    if (!(flow > 0)) continue
    const pct = parseCompositionTable(block)
    for (const [name, value] of Object.entries(pct)) {
      phaseMass[name] = (phaseMass[name] ?? 0) + (flow * value) / 100
    }
    massTh += flow
  }
  if (!(massTh > 0)) return null
  const phasePercent = Object.fromEntries(
    Object.entries(phaseMass).map(([name, mass]) => [name, (mass / massTh) * 100])
  )
  return {
    massTh,
    phasePercent,
    sourceOffset: unique[0]!.offset,
    streamName: unique.map((block) => block.name).join('+'),
  }
}

function mergeNamedDustFallbackBlocks(
  blocks: FloStreamBlock[],
  fallbackNames: readonly string[]
) {
  return mergeDustFallbackBlocks(blocks, fallbackNames)
}

/**
 * 从 MetCal .flo 读取侧吹熔炼产出物相结果（白铜锍 / 熔炼渣 / 出炉烟气 / 烟气含尘）。
 * 固体 W%、烟气 V%×Nm³；不读取产物元素表。
 * 「损失」流流量多为变量 x，需在导入包中用 D%×混料元素质量补全（见 enrichMetcalProductLossFromDistributions）。
 *
 * 注意：白铜锍等流定义常落在「顶吹吹炼炉」字节段（作为吹炼投入），
 * 因此产出结果不按熔炼单元 end 截断，而按流名 + 数值流量全局优选。
 */
export function extractMetcalFloProductResults(buffer: ArrayBuffer): MetcalFloProductExtraction {
  const warnings: string[] = []
  const config = loadOxySideBlowConstraints()
  const streamBlocks = findStreamBlocks(buffer)
  const smeltingUnit = extractMetcalSmeltingUnitInputs(buffer)
  if (!smeltingUnit) {
    warnings.push('未定位侧吹熔炼炉单元，产出流按全文件流名匹配。')
  }
  const smeltingInputNames = new Set(smeltingUnit?.inputNames ?? [])
  /** 产出搜索起点：熔炼单元之后优先；无单元时用全文件 */
  const productSearchStart = smeltingUnit?.start ?? 0

  const streams: MetcalFloProductStreamSnapshot[] = []
  const phaseMassByProduct: Partial<Record<OxySideBlowProductKey, Record<string, number>>> = {}
  const productMasses: Partial<Record<OxySideBlowProductKey, number>> = {}

  const candidateBlocks = (name: string) =>
    streamBlocks
      .filter((item) => item.name === name && item.offset >= productSearchStart)
      .sort((a, b) => a.offset - b.offset)

  for (const pk of ['matte', 'smeltingSlag'] as const) {
    const streamName = SMELTING_PRODUCT_STREAM_BY_KEY[pk]!
    const block = pickBestSolidBlock(candidateBlocks(streamName))
    if (!block) {
      warnings.push(`未找到产出流「${streamName}」。`)
      continue
    }
    const massTh = parseFiniteNumber(block.flowT)
    if (massTh == null || massTh <= 0) {
      warnings.push(`产出流「${streamName}」干基流量无效。`)
      continue
    }
    const phasePercent = parseCompositionTable(block)
    const phaseMass = Object.fromEntries(
      Object.entries(phasePercent).map(([name, pct]) => [name, (massTh * pct) / 100])
    )
    phaseMassByProduct[pk] = phaseMass
    productMasses[pk] = massTh
    streams.push({
      productKey: pk,
      streamName,
      massTh,
      volumeNm3h: null,
      compositionKind: block.compositionKind,
      phasePercent,
      sourceOffset: block.offset,
    })
  }

  {
    const streamName = SMELTING_PRODUCT_STREAM_BY_KEY.flueGas!
    // 侧吹出炉烟气通常为文件中首个带数值 Nm³ 的「熔炼出炉烟气」
    const block = pickBestGasBlock(candidateBlocks(streamName))
    if (!block) {
      warnings.push(`未找到产出流「${streamName}」。`)
    } else {
      const volumeNm3h = parseFiniteNumber(block.flowNm3)
      if (volumeNm3h == null || volumeNm3h <= 0) {
        warnings.push(`产出流「${streamName}」Nm³/h 无效。`)
      } else {
        const volumePercents = parseCompositionTable(block)
        const converted = gasVolumePercentToPhaseMass(volumeNm3h, volumePercents)
        phaseMassByProduct.flueGas = converted.phaseMass
        productMasses.flueGas = converted.massTh
        streams.push({
          productKey: 'flueGas',
          streamName,
          massTh: converted.massTh,
          volumeNm3h,
          compositionKind: block.compositionKind,
          phasePercent: converted.phasePercent,
          sourceOffset: block.offset,
        })
      }
    }
  }

  {
    const streamName = SMELTING_PRODUCT_STREAM_BY_KEY.dust!
    const block = pickBestSolidBlock(candidateBlocks(streamName))
    if (block && isNumericFlow(block.flowT)) {
      const massTh = parseFiniteNumber(block.flowT)!
      const phasePercent = parseCompositionTable(block)
      phaseMassByProduct.dust = Object.fromEntries(
        Object.entries(phasePercent).map(([name, pct]) => [name, (massTh * pct) / 100])
      )
      productMasses.dust = massTh
      streams.push({
        productKey: 'dust',
        streamName,
        massTh,
        volumeNm3h: null,
        compositionKind: block.compositionKind,
        phasePercent,
        sourceOffset: block.offset,
      })
    } else {
      // 排除熔炼投入中的返尘/WHB 循环尘，优先锅炉尘+白烟尘
      const dustScope = streamBlocks.filter(
        (item) =>
          item.offset >= productSearchStart &&
          !(smeltingInputNames.has(item.name) && DUST_FALLBACK_STREAM_NAMES.includes(item.name as (typeof DUST_FALLBACK_STREAM_NAMES)[number]))
      )
      const fallback = mergeDustFallbackBlocks(dustScope.length ? dustScope : streamBlocks)
      if (fallback) {
        phaseMassByProduct.dust = Object.fromEntries(
          Object.entries(fallback.phasePercent).map(([name, pct]) => [name, (fallback.massTh * pct) / 100])
        )
        productMasses.dust = fallback.massTh
        streams.push({
          productKey: 'dust',
          streamName: fallback.streamName,
          massTh: fallback.massTh,
          volumeNm3h: null,
          compositionKind: 'W%',
          phasePercent: fallback.phasePercent,
          sourceOffset: fallback.sourceOffset,
        })
        warnings.push(`未找到「烟气含尘」流，已用 ${fallback.streamName} 近似作为含尘对照。`)
      } else {
        warnings.push('未找到烟气含尘产出流，含尘对照为空。')
      }
    }
  }

  for (const pk of OXY_SIDE_BLOW_PRODUCT_KEYS) {
    if (!phaseMassByProduct[pk]) {
      phaseMassByProduct[pk] = {}
      productMasses[pk] = productMasses[pk] ?? 0
    }
  }

  const hasAny = streams.length > 0
  if (!hasAny) {
    return {
      result: null,
      streams,
      warnings: [...warnings, '未解析到任何熔炼产出结果。'],
    }
  }

  const result = buildSolverResultFromPhaseMasses(phaseMassByProduct, productMasses, config)
  for (const pk of OXY_SIDE_BLOW_PRODUCT_KEYS) {
    if (!result.products[pk]) result.products[pk] = emptyProduct(pk, config)
  }
  clearElementComposition(result)

  return { result, streams, warnings }
}

/**
 * 从 MetCal .flo 读取吹炼产出（粗铜 / 吹炼渣 / 吹炼出炉烟气 / 吹炼烟气含尘）。
 * 严格限制在顶吹吹炼炉 → 阳极炉（含「阳极炉加料升温」等）字节段，避免读到精炼粗铜。
 * 烟气/含尘按本文件实际流名回退（熔炼出炉烟气→吹炼锅炉尘链；吹炼锅炉尘+白烟尘）。
 */
export function extractMetcalFloConvertingProductResults(buffer: ArrayBuffer): MetcalFloProductExtraction {
  const warnings: string[] = []
  const config = loadOxyConvertingConstraints()
  const streamBlocks = findStreamBlocks(buffer)
  const convertingUnit = extractMetcalConvertingUnitInputs(buffer)
  if (!convertingUnit) {
    warnings.push('未定位顶吹吹炼炉单元，吹炼产出流按全文件流名匹配。')
  }
  const productSearchStart = convertingUnit?.start ?? 0
  const productSearchEnd = convertingUnit?.end ?? Number.POSITIVE_INFINITY

  const streams: MetcalFloProductStreamSnapshot[] = []
  const phaseMassByProduct: Partial<Record<OxySideBlowProductKey, Record<string, number>>> = {}
  const productMasses: Partial<Record<OxySideBlowProductKey, number>> = {}

  const inConvertingRange = (offset: number) =>
    offset >= productSearchStart && offset < productSearchEnd

  /** 仅吹炼单元内；不再回退到阳极炉之后的同名流 */
  const candidateBlocks = (name: string) =>
    streamBlocks
      .filter((item) => item.name === name && inConvertingRange(item.offset))
      .sort((a, b) => a.offset - b.offset)

  for (const pk of ['matte', 'smeltingSlag'] as const) {
    const streamName = CONVERTING_PRODUCT_STREAM_BY_KEY[pk]!
    const block = pickBestSolidBlock(candidateBlocks(streamName))
    if (!block) {
      warnings.push(
        pk === 'matte'
          ? `未在吹炼炉段找到产出流「${streamName}」（已排除阳极炉等后续工序同名流）。`
          : `未找到吹炼产出流「${streamName}」。`
      )
      continue
    }
    const massTh = parseFiniteNumber(block.flowT)
    if (massTh == null || massTh <= 0) {
      warnings.push(`吹炼产出流「${streamName}」干基流量无效。`)
      continue
    }
    const phasePercent = parseCompositionTable(block)
    const phaseMass = Object.fromEntries(
      Object.entries(phasePercent).map(([name, pct]) => [name, (massTh * pct) / 100])
    )
    phaseMassByProduct[pk] = phaseMass
    productMasses[pk] = massTh
    streams.push({
      productKey: pk,
      streamName,
      massTh,
      volumeNm3h: null,
      compositionKind: block.compositionKind,
      phasePercent,
      sourceOffset: block.offset,
    })
  }

  {
    let block: FloStreamBlock | null = null
    let streamName = CONVERTING_PRODUCT_STREAM_BY_KEY.flueGas!
    for (const name of CONVERTING_FLUE_GAS_FALLBACK_NAMES) {
      block = pickBestGasBlock(candidateBlocks(name))
      if (block) {
        streamName = name
        break
      }
    }
    // 回退：吹炼段内名为「熔炼出炉烟气」、且位于吹炼锅炉/制酸链之前的那股
    if (!block) {
      const anchors = streamBlocks
        .filter(
          (item) =>
            inConvertingRange(item.offset) &&
            (CONVERTING_FLUE_GAS_TRAIN_ANCHORS as readonly string[]).includes(item.name)
        )
        .sort((a, b) => a.offset - b.offset)
      const anchorOffset = anchors[0]?.offset ?? productSearchEnd
      const aliased = streamBlocks
        .filter(
          (item) =>
            item.name === '熔炼出炉烟气' &&
            inConvertingRange(item.offset) &&
            item.offset < anchorOffset &&
            isNumericFlow(item.flowNm3) &&
            item.compositionKind === 'V%'
        )
        .sort((a, b) => b.offset - a.offset)
      // 取锚点前 offset 最大的一股（吹炼炉出口），勿用 pickBestGasBlock（会取最早一股熔炼烟气）
      block = aliased[0] ?? null
      if (block) {
        streamName = `${block.name}（吹炼炉出口）`
        warnings.push(
          `未找到流名「吹炼出炉烟气」，已用吹炼锅炉尘前最近一股「熔炼出炉烟气」作为对照。`
        )
      }
    }
    if (!block) {
      warnings.push('未找到吹炼出炉烟气产出流。')
    } else {
      const volumeNm3h = parseFiniteNumber(block.flowNm3)
      if (volumeNm3h == null || volumeNm3h <= 0) {
        warnings.push(`吹炼产出流「${streamName}」Nm³/h 无效。`)
      } else {
        const volumePercents = parseCompositionTable(block)
        const converted = gasVolumePercentToPhaseMass(volumeNm3h, volumePercents)
        phaseMassByProduct.flueGas = converted.phaseMass
        productMasses.flueGas = converted.massTh
        streams.push({
          productKey: 'flueGas',
          streamName,
          massTh: converted.massTh,
          volumeNm3h,
          compositionKind: block.compositionKind,
          phasePercent: converted.phasePercent,
          sourceOffset: block.offset,
        })
      }
    }
  }

  {
    let block: FloStreamBlock | null = null
    let streamName = CONVERTING_PRODUCT_STREAM_BY_KEY.dust!
    for (const name of CONVERTING_DUST_FALLBACK_NAMES) {
      block = pickBestSolidBlock(candidateBlocks(name))
      if (block && isNumericFlow(block.flowT)) {
        streamName = name
        break
      }
      block = null
    }
    if (block && isNumericFlow(block.flowT)) {
      const massTh = parseFiniteNumber(block.flowT)!
      const phasePercent = parseCompositionTable(block)
      phaseMassByProduct.dust = Object.fromEntries(
        Object.entries(phasePercent).map(([name, pct]) => [name, (massTh * pct) / 100])
      )
      productMasses.dust = massTh
      streams.push({
        productKey: 'dust',
        streamName,
        massTh,
        volumeNm3h: null,
        compositionKind: block.compositionKind,
        phasePercent,
        sourceOffset: block.offset,
      })
    } else {
      const dustScope = streamBlocks.filter((item) => inConvertingRange(item.offset))
      const fallback = mergeNamedDustFallbackBlocks(dustScope, CONVERTING_DUST_STREAM_FALLBACK_NAMES)
      if (fallback) {
        phaseMassByProduct.dust = Object.fromEntries(
          Object.entries(fallback.phasePercent).map(([name, pct]) => [name, (fallback.massTh * pct) / 100])
        )
        productMasses.dust = fallback.massTh
        streams.push({
          productKey: 'dust',
          streamName: fallback.streamName,
          massTh: fallback.massTh,
          volumeNm3h: null,
          compositionKind: 'W%',
          phasePercent: fallback.phasePercent,
          sourceOffset: fallback.sourceOffset,
        })
        warnings.push(`未找到「吹炼烟气含尘」数值流，已用 ${fallback.streamName} 近似作为含尘对照。`)
      } else {
        warnings.push('未找到吹炼烟气含尘产出流，含尘对照为空。')
      }
    }
  }

  for (const pk of OXY_SIDE_BLOW_PRODUCT_KEYS) {
    if (!phaseMassByProduct[pk]) {
      phaseMassByProduct[pk] = {}
      productMasses[pk] = productMasses[pk] ?? 0
    }
  }

  if (streams.length === 0) {
    return {
      result: null,
      streams,
      warnings: [...warnings, '未解析到任何吹炼产出结果。'],
    }
  }

  const result = buildSolverResultFromPhaseMasses(phaseMassByProduct, productMasses, config)
  result.message = 'MetCal .flo 吹炼产出结果（只读对照）'
  for (const pk of OXY_SIDE_BLOW_PRODUCT_KEYS) {
    if (!result.products[pk]) result.products[pk] = emptyProduct(pk, config)
  }
  clearElementComposition(result)

  return { result, streams, warnings }
}

export function compareMetcalNumeric(
  ours: number | null | undefined,
  metcal: number | null | undefined,
  tolerance = METCAL_RESULT_MATCH_TOLERANCE
): 'match' | 'mismatch' | 'skip' {
  if (ours == null || metcal == null || !Number.isFinite(ours) || !Number.isFinite(metcal)) return 'skip'
  const denom = Math.max(Math.abs(metcal), Math.abs(ours), 1e-9)
  const rel = Math.abs(ours - metcal) / denom
  return rel <= tolerance ? 'match' : 'mismatch'
}

/** 元素约束键 → 损失物相键（损失流在 Flo 中常为 Cu/S 单质，流量为 x，需由 D% 反推） */
function lossPhaseKeyForElement(element: string, configPhases: string[]): string | null {
  const compact = element.replace(/\s+/g, '')
  const candidates = [
    compact,
    element,
    compact.replace(/\(.*\)$/, ''),
    element.split('(')[0]?.trim() ?? '',
  ].filter(Boolean)
  for (const candidate of candidates) {
    const hit = configPhases.find(
      (phase) =>
        phase === candidate ||
        phase.toLowerCase() === candidate.toLowerCase() ||
        normalizeMetcalPhaseFormula(phase) === normalizeMetcalPhaseFormula(candidate)
    )
    if (hit) return hit
  }
  return null
}

function resolveInputElementMass(
  inputElementMass: Partial<Record<string, number>>,
  element: string
): number {
  const direct = inputElementMass[element]
  if (direct != null && Number.isFinite(direct) && direct > 0) return direct
  const compact = element.replace(/\s+/g, '')
  for (const [key, mass] of Object.entries(inputElementMass)) {
    if (mass == null || !Number.isFinite(mass)) continue
    if (key === element || key.replace(/\s+/g, '') === compact) return mass
  }
  return 0
}

/**
 * MetCal「损失」流定义流量多为 x、组成表无数值 W%，findStreamBlocks 读不到质量。
 * 用元素分配 D% × 混料元素质量反推损失（与 MetCal OutputE.损失.Cu = D%×Input.混料.Cu 一致）。
 */
export function enrichMetcalProductLossFromDistributions(
  extraction: MetcalFloProductExtraction,
  params: {
    elementDistributions: ElementDistributionEntry[]
    inputElementMass: Partial<Record<string, number>>
    config?: OxySideBlowConstraintConfig
  }
): MetcalFloProductExtraction {
  if (!extraction.result) return extraction
  const config = params.config ?? loadOxySideBlowConstraints()
  const lossPhases = config.products.loss?.phases ?? ['Cu', 'S']
  const phaseMass: Record<string, number> = {}
  const elementMass: Record<string, number> = {}
  let massTh = 0

  for (const entry of params.elementDistributions) {
    const rule = entry.rules.find((item) => item.product === 'loss' && item.type === 'D%')
    if (!rule || isBlankConstraintRuleValue(rule.value)) continue
    const dPercent = typeof rule.value === 'number' ? rule.value : Number.parseFloat(String(rule.value))
    if (!Number.isFinite(dPercent) || dPercent < 0) continue
    const inputMass = resolveInputElementMass(params.inputElementMass, entry.element)
    if (!(inputMass > 0) || dPercent === 0) continue
    const lossElMass = (inputMass * dPercent) / 100
    if (!(lossElMass > 1e-12)) continue
    elementMass[entry.element] = (elementMass[entry.element] ?? 0) + lossElMass
    const phaseKey = lossPhaseKeyForElement(entry.element, lossPhases) ?? entry.element.split('(')[0]?.trim() ?? entry.element
    phaseMass[phaseKey] = (phaseMass[phaseKey] ?? 0) + lossElMass
    massTh += lossElMass
  }

  if (!(massTh > 1e-12)) {
    return {
      ...extraction,
      warnings: [...extraction.warnings, '损失流在 Flo 中无数值流量，且未能由 D%×混料元素质量反推。'],
    }
  }

  const phasePercent = Object.fromEntries(
    Object.entries(phaseMass).map(([name, mass]) => [name, (mass / massTh) * 100])
  )
  const streams = [
    ...extraction.streams.filter((item) => item.productKey !== 'loss'),
    {
      productKey: 'loss' as const,
      streamName: config.products.loss?.name ?? OXY_PRODUCT_KEY_TO_CN.loss,
      massTh,
      volumeNm3h: null,
      compositionKind: 'W%' as const,
      phasePercent,
      sourceOffset: -1,
    },
  ]

  const rebuilt = buildSolverResultFromPhaseMasses(
    {
      ...Object.fromEntries(
        OXY_SIDE_BLOW_PRODUCT_KEYS.map((pk) => {
          if (pk === 'loss') return [pk, phaseMass]
          const product = extraction.result!.products[pk]
          const fromPhases = Object.fromEntries(
            (product?.phases ?? []).map((row) => [row.key, row.mass])
          )
          return [pk, fromPhases]
        })
      ),
    } as Partial<Record<OxySideBlowProductKey, Record<string, number>>>,
    {
      ...Object.fromEntries(
        OXY_SIDE_BLOW_PRODUCT_KEYS.map((pk) => [
          pk,
          pk === 'loss' ? massTh : (extraction.result!.products[pk]?.mass ?? 0),
        ])
      ),
    } as Partial<Record<OxySideBlowProductKey, number>>,
    config
  )
  rebuilt.message = extraction.result.message
  // 损失元素质量按 D% 结果写入；其余产物仍清空元素以免误作元素对照
  clearElementComposition(rebuilt)
  const lossProduct = rebuilt.products.loss
  if (lossProduct) {
    lossProduct.elementMass = { ...elementMass }
    lossProduct.balanceElementMass = { ...elementMass }
    lossProduct.composition = compositionFromElementMass(elementMass, massTh)
  }

  return {
    result: rebuilt,
    streams,
    warnings: [
      ...extraction.warnings,
      `损失流 Flo 流量为变量(x)，已按元素 D%×混料反推 ${massTh.toFixed(4)} t/h。`,
    ],
  }
}
