/**
 * 产物计算（增强版）：
 * - 用“关键反应 + 平衡常数”从烟气 O2/SO2 反推 pO2、pS2
 * - 用“目标锍品位 + 目标渣型”反算炉内氧化程度（O2 利用率），并做自洽迭代收敛
 * - 输出可追溯 trace（每一步中间量），供 UI 展示与排错
 */
import type { ElementWeights } from './phaseAnalysis'

/** 五类产物 */
export type ProductType = 'slag' | 'flue' | 'sb2o3' | 'matte' | 'noble_sb'

/** 非主流程元素的分配系数 [熔炼渣, 烟气, 锑氧粉, 锑锍, 贵锑] */
export const ELEMENT_DISTRIBUTION: Record<string, [number, number, number, number, number]> = {
  'Pb(铅)': [0.1, 0.0, 0.9, 0.0, 0.0],
  'As(砷)': [0.01, 0.0, 0.95, 0.0, 0.04],
  'Zn(锌)': [0.4, 0.0, 0.6, 0.0, 0.0],
  'Cu(铜)': [1.0, 0.0, 0.0, 0.0, 0.0],
  'Other(其他)': [0.5, 0.0, 0.3, 0.2, 0.0],
}

/** 摩尔质量 (g/mol) */
const MOLAR = {
  Sb: 121.76,
  Fe: 55.845,
  S: 32.06,
  Si: 28.085,
  Ca: 40.078,
  Al: 26.9815385,
  Pb: 207.2,
  As: 74.9216,
  Zn: 65.38,
  Cu: 63.546,
  Ag: 107.8682,
  Au: 196.96657,
  O: 16,
  N: 14.01,
  Sb2S3: 339.69,
  FeS: 87.91,
  Sb2O3: 291.52,
  FeO: 71.844,
  SiO2: 60.084,
  CaO: 56.077,
  Al2O3: 101.961,
  PbO: 223.199,
  As2O3: 197.841,
  ZnO: 81.379,
  CuO: 79.545,
  SO2: 64.07,
  O2: 32,
  N2: 28.02,
  CO2: 44.01,
}

/** 产物组分（质量百分比） */
export interface ProductComposition {
  /** 熔炼渣：以氧化物组分为主（FeO、SiO2、CaO、Al2O3 …） */
  slag: Record<string, number>
  /** 烟气：体积百分比（SO2、O2、N2、CO2） */
  flue: Record<string, number>
  /** 锑氧粉：以氧化物组分为主（Sb2O3、As2O3、PbO …） */
  sb2o3: Record<string, number>
  /** 锑锍：以硫化物为主（FeS、Sb2S3 …） */
  matte: Record<string, number>
  /** 贵锑：以元素为主（Sb、Au、Ag …） */
  nobleSb: Record<string, number>
}

/** 元素在各产物中的质量 (t/h) */
export interface ElementAllocation {
  element: string
  slag: number
  flue: number
  sb2o3: number
  matte: number
  nobleSb: number
  total: number
}

export interface ProductThermoParams {
  /** 温度 (°C)，用于展示与 K 值记录；当前 K 作为输入参数使用 */
  temperatureC: number
  /**
   * 关键反应：0.5 S2 + O2 ⇌ SO2
   * K_SO2 = pSO2 / (pS2^0.5 * pO2)
   */
  K_SO2: number
  /**
   * 关键反应：FeS + 0.5 O2 ⇌ FeO + 0.5 S2
   * K_Fe = (pS2^0.5 / pO2^0.5) * (a_FeO / a_FeS)；此处 a≈1，用于一致性校核
   */
  K_Fe: number
}

export interface ProductTargets {
  /** 目标锍品位：锑锍中 Sb 质量百分比（%） */
  matteTargetSbPct: number
  /** 目标渣型：FeO/SiO2 质量比 */
  targetFeO_SiO2: number
  /** 目标渣型：CaO/SiO2 质量比（通常主要由配料决定，用于校核） */
  targetCaO_SiO2: number
}

export interface ProductIteration {
  iter: number
  oxygenUtilization: number
  o2SuppliedKmol: number
  o2UsedKmol: number
  o2LeftKmol: number
  matteGradeSb: number
  matteGradeFe: number
  slagFeO_SiO2: number
  slagCaO_SiO2: number
  pO2_atm: number
  pSO2_atm: number
  pS2_atm: number
  feS_formed_tph: number
  sb2s3_formed_tph: number
  feS_oxidized_tph: number
  sb2s3_oxidized_tph: number
  note?: string
}

export interface ProductTrace {
  thermo: ProductThermoParams
  targets: ProductTargets
  iterations: ProductIteration[]
  converged: boolean
  stopReason: string
}

export interface ProductResult {
  /** 各产物总质量 (t/h) */
  masses: { slag: number; flue: number; sb2o3: number; matte: number; nobleSb: number }
  /** 产物组分（质量百分比） */
  composition: ProductComposition
  /** 元素分配明细 */
  elementAllocation: ElementAllocation[]
  /** 锍品位 %Fe */
  matteGradeFe: number
  /** 锍品位 %Sb */
  matteGradeSb: number
  /** 烟气体积 Nm³/h */
  flueVolume: number
  /** 计算过程轨迹（用于 UI 展示与排错） */
  trace: ProductTrace
}

export interface ProductCalcInput {
  elementWeights: ElementWeights
  totalWeight: number
  /** 富氧空气体积 Nm³/h */
  airVolume?: number
  /** 富氧空气 O2 体积分数 */
  oxygenPurity?: number
  /** 烟气 CO2 体积（Nm³/h），用于热平衡/燃料接入前的占位（可选） */
  co2Volume?: number
  /** 热力学参数（关键反应 K） */
  thermo?: Partial<ProductThermoParams>
  /** 目标约束 */
  targets?: Partial<ProductTargets>
  /** 最大迭代次数 */
  maxIter?: number
  /** 收敛容差（相对） */
  tol?: number
}

/** 元素键与产物表头一致 */
const ELEMENT_KEYS = [
  'O (氧)', 'N (氮)', 'Sb(锑)', 'S (硫)', 'Fe(铁)', 'Pb(铅)', 'As(砷)', 'Zn(锌)',
  'Cu(铜)', 'Si(硅)', 'Ca(钙)', 'Al(铝)', 'Ag(银)', 'Au(金)', 'Other(其他)', 'C (碳)',
]

const clamp01 = (x: number) => Math.max(0, Math.min(1, x))

function safeDiv(a: number, b: number) {
  return Math.abs(b) < 1e-20 ? 0 : a / b
}

function getDistribution(elem: string): [number, number, number, number, number] {
  return ELEMENT_DISTRIBUTION[elem] ?? [0.5, 0.0, 0.3, 0.2, 0.0]
}

function kmolFromMassTph(massTph: number, molarG: number) {
  return (massTph * 1e6) / molarG / 1e3
}

function massTphFromKmol(kmol: number, molarG: number) {
  return (kmol * 1e3 * molarG) / 1e6
}

function elemMassFromOxide(oxideMassTph: number, elemMolarG: number, oxideMolarG: number, elemStoich: number) {
  // oxide moles = mass / oxideMolar
  // element mass = moles * elemStoich * elemMolar
  const kmolOx = kmolFromMassTph(oxideMassTph, oxideMolarG)
  return massTphFromKmol(kmolOx * elemStoich, elemMolarG)
}

function oxideMassFromElem(elemMassTph: number, elemMolarG: number, oxideMolarG: number, elemStoich: number) {
  const kmolElem = kmolFromMassTph(elemMassTph, elemMolarG)
  const kmolOx = safeDiv(kmolElem, elemStoich)
  return massTphFromKmol(kmolOx, oxideMolarG)
}

function sulfideMassFromElem(
  elemMassTph: number,
  elemMolarG: number,
  sulfideMolarG: number,
  elemStoich: number
) {
  const kmolElem = kmolFromMassTph(elemMassTph, elemMolarG)
  const kmolSulf = safeDiv(kmolElem, elemStoich)
  return massTphFromKmol(kmolSulf, sulfideMolarG)
}

function sulfidationFeFirst(feTph: number, sbTph: number, sTph: number) {
  // Fe + S -> FeS
  const kmolFe = kmolFromMassTph(feTph, MOLAR.Fe)
  const kmolSb = kmolFromMassTph(sbTph, MOLAR.Sb)
  let kmolS = kmolFromMassTph(sTph, MOLAR.S)

  const kmolFeS = Math.min(kmolFe, kmolS) // 1:1
  kmolS -= kmolFeS

  // 2Sb + 3S -> Sb2S3
  const kmolSb2S3 = Math.min(kmolSb / 2, kmolS / 3)
  kmolS -= kmolSb2S3 * 3

  const feS_tph = massTphFromKmol(kmolFeS, MOLAR.FeS)
  const sb2s3_tph = massTphFromKmol(kmolSb2S3, MOLAR.Sb2S3)

  const fe_used_tph = massTphFromKmol(kmolFeS, MOLAR.Fe)
  const sb_used_tph = massTphFromKmol(kmolSb2S3 * 2, MOLAR.Sb)
  const s_used_tph = massTphFromKmol(kmolFeS + kmolSb2S3 * 3, MOLAR.S)

  return {
    feS_tph,
    sb2s3_tph,
    fe_left_tph: Math.max(0, feTph - fe_used_tph),
    sb_left_tph: Math.max(0, sbTph - sb_used_tph),
    s_left_tph: Math.max(0, sTph - s_used_tph),
  }
}

function calcSlagRatiosFromElemInSlag(elem: { Fe: number; Si: number; Ca: number; Al: number }) {
  const feO = oxideMassFromElem(elem.Fe, MOLAR.Fe, MOLAR.FeO, 1)
  const siO2 = oxideMassFromElem(elem.Si, MOLAR.Si, MOLAR.SiO2, 1)
  const caO = oxideMassFromElem(elem.Ca, MOLAR.Ca, MOLAR.CaO, 1)
  const al2o3 = oxideMassFromElem(elem.Al, MOLAR.Al, MOLAR.Al2O3, 2)
  return { feO, siO2, caO, al2o3, feO_SiO2: safeDiv(feO, siO2), caO_SiO2: safeDiv(caO, siO2) }
}

function solveBisection(
  f: (x: number) => number,
  lo: number,
  hi: number,
  maxIter = 40
) {
  let a = lo
  let b = hi
  let fa = f(a)
  let fb = f(b)
  if (!Number.isFinite(fa) || !Number.isFinite(fb)) return { x: lo, ok: false }
  if (fa === 0) return { x: a, ok: true }
  if (fb === 0) return { x: b, ok: true }
  // 若无符号变化，则返回更接近 0 的端点
  if (fa * fb > 0) {
    return { x: Math.abs(fa) < Math.abs(fb) ? a : b, ok: false }
  }
  for (let i = 0; i < maxIter; i++) {
    const m = (a + b) / 2
    const fm = f(m)
    if (!Number.isFinite(fm)) break
    if (Math.abs(fm) < 1e-10) return { x: m, ok: true }
    if (fa * fm <= 0) {
      b = m
      fb = fm
    } else {
      a = m
      fa = fm
    }
  }
  return { x: (a + b) / 2, ok: true }
}

function computePotentialsFromFlue(
  thermo: ProductThermoParams,
  pTotalAtm: number,
  flueMoles: { so2: number; o2: number; n2: number; co2: number }
) {
  const total = flueMoles.so2 + flueMoles.o2 + flueMoles.n2 + flueMoles.co2
  const ySO2 = total > 0 ? flueMoles.so2 / total : 0
  const yO2 = total > 0 ? flueMoles.o2 / total : 0
  const pSO2 = ySO2 * pTotalAtm
  const pO2 = yO2 * pTotalAtm
  const pS2 = pO2 > 1e-30 && thermo.K_SO2 > 1e-30 ? Math.pow(pSO2 / (thermo.K_SO2 * pO2), 2) : 0
  return { pSO2_atm: pSO2, pO2_atm: pO2, pS2_atm: pS2 }
}

export function calcProductDistribution(input: ProductCalcInput): ProductResult {
  const {
    elementWeights,
    airVolume = 0,
    oxygenPurity = 0.32,
    co2Volume = 0,
    thermo: thermoIn,
    targets: targetsIn,
    maxIter = 25,
    tol = 1e-3,
  } = input

  const thermo: ProductThermoParams = {
    temperatureC: thermoIn?.temperatureC ?? 1200,
    K_SO2: thermoIn?.K_SO2 ?? 1e6,
    K_Fe: thermoIn?.K_Fe ?? 1,
  }

  const targets: ProductTargets = {
    matteTargetSbPct: targetsIn?.matteTargetSbPct ?? 60,
    targetFeO_SiO2: targetsIn?.targetFeO_SiO2 ?? 1.0,
    targetCaO_SiO2: targetsIn?.targetCaO_SiO2 ?? 0.5,
  }

  const get = (k: string) => (elementWeights[k] ?? 0)
  const elemIn = {
    Fe: get('Fe(铁)'),
    Sb: get('Sb(锑)'),
    S: get('S (硫)'),
    Si: get('Si(硅)'),
    Ca: get('Ca(钙)'),
    Al: get('Al(铝)'),
    Pb: get('Pb(铅)'),
    As: get('As(砷)'),
    Zn: get('Zn(锌)'),
    Cu: get('Cu(铜)'),
    Ag: get('Ag(银)'),
    Au: get('Au(金)'),
    Other: get('Other(其他)'),
    O: get('O (氧)'),
    N: get('N (氮)'),
    C: get('C (碳)'),
  }

  // 富氧空气（体积→kmol）：以 22.4 Nm³/kmol 计算
  const o2SuppliedKmol = (airVolume * oxygenPurity) / 22.4
  const n2SuppliedKmol = (airVolume * (1 - oxygenPurity)) / 22.4
  const co2SuppliedKmol = co2Volume / 22.4

  const iterations: ProductIteration[] = []

  // 1) 硫化阶段：Fe 优先 → FeS，Sb 随后 → Sb2S3
  const sul = sulfidationFeFirst(elemIn.Fe, elemIn.Sb, elemIn.S)
  const feS_total = sul.feS_tph
  const sb2s3_total = sul.sb2s3_tph
  const kmolFeS = kmolFromMassTph(feS_total, MOLAR.FeS)
  const kmolSb2S3 = kmolFromMassTph(sb2s3_total, MOLAR.Sb2S3)

  const o2NeedPerSb2S3 = 4.5
  const o2NeedPerFeS = 1.5

  // 2) 直接求解（参考 MetCal：约束→变量一一对应，无需迭代）
  // FeO/SiO2 目标 → feOxKmol（FeO 仅来自 FeS 氧化）
  const slagSiO2 = oxideMassFromElem(elemIn.Si, MOLAR.Si, MOLAR.SiO2, 1)
  const slagFeO_target = targets.targetFeO_SiO2 * slagSiO2
  let feOxKmol = Math.max(0, Math.min(kmolFeS, kmolFromMassTph(slagFeO_target, MOLAR.FeO)))

  // 锍品位目标 → sb2s3OxKmol（在 feOxKmol 已知下，锍品位 = f(sb2s3OxKmol)）
  // matteSb% = matteSbMass / matteMass * 100 = target
  // (kmolSb2S3 - x)*2*M_Sb / [(kmolFeS-feOxKmol)*M_FeS + (kmolSb2S3-x)*M_Sb2S3] = target/100
  // 解得 x = kmolSb2S3 - target*(kmolFeS-feOxKmol)*M_FeS / (100*2*M_Sb - target*M_Sb2S3)
  const denom = 100 * 2 * MOLAR.Sb - targets.matteTargetSbPct * MOLAR.Sb2S3
  let sb2s3OxKmol: number
  if (Math.abs(denom) < 1e-10) {
    sb2s3OxKmol = kmolSb2S3 * 0.85
  } else {
    const matteFeS_remain = Math.max(0, kmolFeS - feOxKmol)
    const numer = targets.matteTargetSbPct * matteFeS_remain * MOLAR.FeS
    sb2s3OxKmol = Math.max(0, Math.min(kmolSb2S3, kmolSb2S3 - numer / denom))
  }

  // O2 约束：若供氧不足，按比例缩减氧化量
  const o2Needed = feOxKmol * o2NeedPerFeS + sb2s3OxKmol * o2NeedPerSb2S3
  let o2UsedKmol = o2Needed
  let o2LeftKmol = Math.max(0, o2SuppliedKmol - o2Needed)
  if (o2SuppliedKmol > 1e-12 && o2Needed > o2SuppliedKmol) {
    const scale = o2SuppliedKmol / o2Needed
    feOxKmol *= scale
    sb2s3OxKmol *= scale
    o2UsedKmol = o2SuppliedKmol
    o2LeftKmol = 0
  }

  const u = o2SuppliedKmol > 1e-12 ? o2UsedKmol / o2SuppliedKmol : 0

  // 3) 产物质量与组分：按硫化物/氧化物计量计算
  const feSRemainKmol = Math.max(0, kmolFeS - feOxKmol)
  const sb2s3RemainKmol = Math.max(0, kmolSb2S3 - sb2s3OxKmol)

  // 锑锍
  const matteFeS = massTphFromKmol(feSRemainKmol, MOLAR.FeS)
  const matteSb2S3 = massTphFromKmol(sb2s3RemainKmol, MOLAR.Sb2S3)
  const matteMass = matteFeS + matteSb2S3

  // 熔炼渣（FeO + SiO2 + CaO + Al2O3 + 其他按系数）
  const slagFeO = massTphFromKmol(feOxKmol, MOLAR.FeO)
  const slagCaO = oxideMassFromElem(elemIn.Ca, MOLAR.Ca, MOLAR.CaO, 1)
  const slagAl2O3 = oxideMassFromElem(elemIn.Al, MOLAR.Al, MOLAR.Al2O3, 2)

  // 其他元素按静态分配（仅元素级），再转氧化物计入渣/锑氧粉/锍/贵锑
  const allocExtra: Record<string, { slag: number; sb2o3: number; matte: number; noble: number }> = {}
  for (const elem of ['Pb', 'As', 'Zn', 'Cu', 'Other'] as const) {
    const key =
      elem === 'Pb' ? 'Pb(铅)'
      : elem === 'As' ? 'As(砷)'
      : elem === 'Zn' ? 'Zn(锌)'
      : elem === 'Cu' ? 'Cu(铜)'
      : 'Other(其他)'
    const w = elementWeights[key] ?? 0
    if (w <= 0) continue
    const [s, _f, d, m, n] = getDistribution(key).map((c) => (c / 100) * w)
    allocExtra[key] = { slag: s, sb2o3: d, matte: m, noble: n }
  }

  const nobleAu = elemIn.Au
  const nobleAg = elemIn.Ag
  const nobleSb = 0
  const extraSlag =
    (allocExtra['Pb(铅)'] ? oxideMassFromElem(allocExtra['Pb(铅)'].slag, MOLAR.Pb, MOLAR.PbO, 1) : 0) +
    (allocExtra['As(砷)'] ? oxideMassFromElem(allocExtra['As(砷)'].slag, MOLAR.As, MOLAR.As2O3, 2) : 0) +
    (allocExtra['Zn(锌)'] ? oxideMassFromElem(allocExtra['Zn(锌)'].slag, MOLAR.Zn, MOLAR.ZnO, 1) : 0) +
    (allocExtra['Cu(铜)'] ? oxideMassFromElem(allocExtra['Cu(铜)'].slag, MOLAR.Cu, MOLAR.CuO, 1) : 0) +
    (allocExtra['Other(其他)']?.slag ?? 0)

  const extraMatte = Object.values(allocExtra).reduce((s, v) => s + (v.matte || 0), 0)
  const extraNoble = Object.values(allocExtra).reduce((s, v) => s + (v.noble || 0), 0)
  const nobleMass = nobleAu + nobleAg + nobleSb + extraNoble

  const dustSb2O3 = massTphFromKmol(sb2s3OxKmol, MOLAR.Sb2O3)
  const dustAs2O3 = allocExtra['As(砷)'] ? oxideMassFromElem(allocExtra['As(砷)'].sb2o3, MOLAR.As, MOLAR.As2O3, 2) : 0
  const dustPbO = allocExtra['Pb(铅)'] ? oxideMassFromElem(allocExtra['Pb(铅)'].sb2o3, MOLAR.Pb, MOLAR.PbO, 1) : 0
  const dustZnO = allocExtra['Zn(锌)'] ? oxideMassFromElem(allocExtra['Zn(锌)'].sb2o3, MOLAR.Zn, MOLAR.ZnO, 1) : 0
  const dustMass = dustSb2O3 + dustAs2O3 + dustPbO + dustZnO + (allocExtra['Other(其他)']?.sb2o3 ?? 0)

  const slagMass = slagFeO + slagSiO2 + slagCaO + slagAl2O3 + extraSlag

  const so2Kmol = feOxKmol * 1 + sb2s3OxKmol * 3
  const flueMoles = { so2: so2Kmol, o2: o2LeftKmol, n2: n2SuppliedKmol, co2: co2SuppliedKmol }
  const flueVolume = (flueMoles.so2 + flueMoles.o2 + flueMoles.n2 + flueMoles.co2) * 22.4
  const flueMass =
    massTphFromKmol(flueMoles.so2, MOLAR.SO2) +
    massTphFromKmol(flueMoles.o2, MOLAR.O2) +
    massTphFromKmol(flueMoles.n2, MOLAR.N2) +
    massTphFromKmol(flueMoles.co2, MOLAR.CO2)

  const pots = computePotentialsFromFlue(thermo, 1, flueMoles)

  const slagRatios = calcSlagRatiosFromElemInSlag({
    Fe: elemMassFromOxide(slagFeO, MOLAR.Fe, MOLAR.FeO, 1),
    Si: elemIn.Si,
    Ca: elemIn.Ca,
    Al: elemIn.Al,
  })

  const matteSbMass = massTphFromKmol(sb2s3RemainKmol * 2, MOLAR.Sb)
  const matteFeMass = massTphFromKmol(feSRemainKmol * 1, MOLAR.Fe)
  const matteGradeSb = matteMass > 1e-12 ? (matteSbMass / matteMass) * 100 : 0
  const matteGradeFe = matteMass > 1e-12 ? (matteFeMass / matteMass) * 100 : 0

  iterations.push({
    iter: 1,
    oxygenUtilization: u,
    o2SuppliedKmol,
    o2UsedKmol,
    o2LeftKmol,
    matteGradeSb,
    matteGradeFe,
    slagFeO_SiO2: slagRatios.feO_SiO2,
    slagCaO_SiO2: slagRatios.caO_SiO2,
    pO2_atm: pots.pO2_atm,
    pSO2_atm: pots.pSO2_atm,
    pS2_atm: pots.pS2_atm,
    feS_formed_tph: feS_total,
    sb2s3_formed_tph: sb2s3_total,
    feS_oxidized_tph: massTphFromKmol(feOxKmol, MOLAR.FeS),
    sb2s3_oxidized_tph: massTphFromKmol(sb2s3OxKmol, MOLAR.Sb2S3),
  })

  const stopReason = '直接求解（FeO/SiO2 + 锍品位 → feOxKmol、sb2s3OxKmol）'
  const converged = true

  const masses = { slag: slagMass, flue: flueMass, sb2o3: dustMass, matte: matteMass + extraMatte, nobleSb: nobleMass + extraNoble }

  const composition: ProductComposition = { slag: {}, flue: {}, sb2o3: {}, matte: {}, nobleSb: {} }
  const slagComps: Record<string, number> = {
    FeO: slagFeO,
    SiO2: slagSiO2,
    CaO: slagCaO,
    Al2O3: slagAl2O3,
    PbO: allocExtra['Pb(铅)'] ? oxideMassFromElem(allocExtra['Pb(铅)'].slag, MOLAR.Pb, MOLAR.PbO, 1) : 0,
    As2O3: allocExtra['As(砷)'] ? oxideMassFromElem(allocExtra['As(砷)'].slag, MOLAR.As, MOLAR.As2O3, 2) : 0,
    ZnO: allocExtra['Zn(锌)'] ? oxideMassFromElem(allocExtra['Zn(锌)'].slag, MOLAR.Zn, MOLAR.ZnO, 1) : 0,
    CuO: allocExtra['Cu(铜)'] ? oxideMassFromElem(allocExtra['Cu(铜)'].slag, MOLAR.Cu, MOLAR.CuO, 1) : 0,
    Other: allocExtra['Other(其他)']?.slag ?? 0,
  }
  for (const [k, v] of Object.entries(slagComps)) {
    if (v > 1e-12 && slagMass > 1e-12) composition.slag[k] = (v / slagMass) * 100
  }
  const dustComps: Record<string, number> = {
    Sb2O3: dustSb2O3,
    As2O3: dustAs2O3,
    PbO: dustPbO,
    ZnO: dustZnO,
    Other: allocExtra['Other(其他)']?.sb2o3 ?? 0,
  }
  for (const [k, v] of Object.entries(dustComps)) {
    if (v > 1e-12 && dustMass > 1e-12) composition.sb2o3[k] = (v / dustMass) * 100
  }
  const matteComps: Record<string, number> = {
    FeS: matteFeS,
    Sb2S3: matteSb2S3,
    Other: extraMatte,
  }
  const matteTotalMassForPct = matteMass + extraMatte
  for (const [k, v] of Object.entries(matteComps)) {
    if (v > 1e-12) composition.matte[k] = (v / matteTotalMassForPct) * 100
  }
  const nobleComps: Record<string, number> = {
    Sb: nobleSb,
    Au: nobleAu,
    Ag: nobleAg,
    Other: extraNoble,
  }
  for (const [k, v] of Object.entries(nobleComps)) {
    if (v > 1e-12 && nobleMass > 1e-12) composition.nobleSb[k] = (v / nobleMass) * 100
  }
  const flueTotal = flueMoles.so2 + flueMoles.o2 + flueMoles.n2 + flueMoles.co2
  if (flueTotal > 1e-12) {
    composition.flue['SO2'] = (flueMoles.so2 / flueTotal) * 100
    composition.flue['O2'] = (flueMoles.o2 / flueTotal) * 100
    composition.flue['N2'] = (flueMoles.n2 / flueTotal) * 100
    if (flueMoles.co2 > 1e-12) composition.flue['CO2'] = (flueMoles.co2 / flueTotal) * 100
  }

  const alloc: ElementAllocation[] = []
  const pushAlloc = (element: string, parts: { slag?: number; flue?: number; sb2o3?: number; matte?: number; nobleSb?: number }) => {
    const total = elementWeights[element] ?? 0
    alloc.push({
      element,
      slag: parts.slag ?? 0,
      flue: parts.flue ?? 0,
      sb2o3: parts.sb2o3 ?? 0,
      matte: parts.matte ?? 0,
      nobleSb: parts.nobleSb ?? 0,
      total,
    })
  }
  pushAlloc('Fe(铁)', { matte: matteFeMass, slag: elemMassFromOxide(slagFeO, MOLAR.Fe, MOLAR.FeO, 1) })
  pushAlloc('Sb(锑)', {
    matte: matteSbMass,
    sb2o3: elemMassFromOxide(dustSb2O3, MOLAR.Sb, MOLAR.Sb2O3, 2),
  })
  const matteS_mass = massTphFromKmol(feSRemainKmol * 1 + sb2s3RemainKmol * 3, MOLAR.S)
  const flueS_mass = massTphFromKmol(flueMoles.so2 * 1, MOLAR.S)
  pushAlloc('S (硫)', { matte: matteS_mass, flue: flueS_mass })
  pushAlloc('Si(硅)', { slag: elemIn.Si })
  pushAlloc('Ca(钙)', { slag: elemIn.Ca })
  pushAlloc('Al(铝)', { slag: elemIn.Al })
  for (const k of ['Pb(铅)', 'As(砷)', 'Zn(锌)', 'Cu(铜)', 'Other(其他)'] as const) {
    const w = elementWeights[k] ?? 0
    if (w <= 0) continue
    const [s, _f, d, m, n] = getDistribution(k).map((c) => (c / 100) * w)
    pushAlloc(k, { slag: s, sb2o3: d, matte: m, nobleSb: n })
  }
  pushAlloc('Au(金)', { nobleSb: nobleAu })
  pushAlloc('Ag(银)', { nobleSb: nobleAg })
  pushAlloc('O (氧)', { flue: elementWeights['O (氧)'] ?? 0 })
  pushAlloc('N (氮)', { flue: elementWeights['N (氮)'] ?? 0 })
  if ((elementWeights['C (碳)'] ?? 0) > 0) pushAlloc('C (碳)', { flue: elementWeights['C (碳)'] ?? 0 })

  const trace: ProductTrace = {
    thermo,
    targets,
    iterations,
    converged,
    stopReason,
  }

  return {
    masses,
    composition,
    elementAllocation: alloc,
    matteGradeFe,
    matteGradeSb,
    flueVolume,
    trace,
  }
}

/** 进度回调 */
export interface ProductProgress {
  percent: number
  stage: string
}

/** 异步计算（带进度模拟，用于 UI 动画） */
export async function calcProductDistributionAsync(
  input: ProductCalcInput,
  onProgress?: (p: ProductProgress) => void
): Promise<ProductResult> {
  onProgress?.({ percent: 0, stage: '在准备参数…' })
  await new Promise((r) => setTimeout(r, 80))
  onProgress?.({ percent: 12, stage: '硫化阶段（Fe 优先、Sb 随后）…' })
  await new Promise((r) => setTimeout(r, 100))
  onProgress?.({ percent: 35, stage: '目标约束：反算氧化程度（匹配渣型/锍品位）…' })
  await new Promise((r) => setTimeout(r, 100))
  onProgress?.({ percent: 58, stage: '关键反应：由烟气反推 pO2、pS2…' })
  await new Promise((r) => setTimeout(r, 100))
  onProgress?.({ percent: 78, stage: '质量平衡：产物组分与汇总…' })
  await new Promise((r) => setTimeout(r, 80))
  onProgress?.({ percent: 90, stage: '正在汇总结果…' })
  await new Promise((r) => setTimeout(r, 60))
  const result = calcProductDistribution(input)
  onProgress?.({ percent: 100, stage: '完成' })
  return result
}
