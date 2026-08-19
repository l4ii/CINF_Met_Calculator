import { COMPOUND_MOLAR_MASS, atomicMass, compoundMolarMass } from './atomicMass.ts'
import { normalizeMetcalPhaseFormula } from './chemicalFormula.ts'
import {
  type AntimonyHeatEnthalpyContext,
  antimonyEnthalpy25KJmol,
  antimonyEnthalpyAtTemperatureKJmol,
  antimonyStandardFormationHeatKJmol,
} from './antimonyHeatEnthalpy.ts'
import type { OxyConstraintSolverResult } from './antimonyConstraintSolver.ts'
import type { OxySideBlowProductKey } from './antimonyConstraintConfig.ts'
import type { AntimonyFuelMaterial } from './antimonyProcessCalc.ts'
import { materialWaterWeight, type AntimonyMaterialColumn } from './antimonyWorkflowCalc.ts'

export const WATER_SPECIFIC_HEAT_KJ_KG_C = 4.184
export const DEFAULT_ANTIMONY_FURNACE_HEAT_LOSS_FRACTION = 0.05

export const FURNACE_WALL_HEAT_LOSS_REFERENCE = {
  feedDryWeightTh: 100,
  temperatureC: 1350,
  heatMJh: 1500,
} as const

export function calculateFurnaceWallHeatLossMJh(
  feedDryWeightTh: number,
  furnaceWallTemperatureC: number = FURNACE_WALL_HEAT_LOSS_REFERENCE.temperatureC
) {
  const feedScale = Math.max(0, feedDryWeightTh) / FURNACE_WALL_HEAT_LOSS_REFERENCE.feedDryWeightTh
  const referenceDelta = Math.max(1, FURNACE_WALL_HEAT_LOSS_REFERENCE.temperatureC - 25)
  const temperatureScale = Math.max(0, furnaceWallTemperatureC - 25) / referenceDelta
  return FURNACE_WALL_HEAT_LOSS_REFERENCE.heatMJh * feedScale * temperatureScale
}

export type HeatBalanceProductTemperatureKey =
  | 'smeltingSlag'
  | 'matte'
  | 'flueGas'
  | 'dust'
  | 'fugitive'
  | 'loss'

export interface AntimonyHeatBalanceTemperatures {
  feed: number
  smeltingSlag: number
  matte: number
  flueGas: number
  dust: number
  fugitive: number
  loss: number
}

export interface AntimonyHeatBalanceSourceMaterial {
  id: string
  name: string
  kind: AntimonyMaterialColumn['kind']
  airRole?: AntimonyMaterialColumn['airRole']
  /** Material-specific temperature overrides the common feed temperature. */
  temperatureC?: number
  enthalpyContext?: AntimonyHeatEnthalpyContext
  dryWeight: number
  waterWeight: number
  phases: Record<string, number>
  elementRatios?: AntimonyMaterialColumn['ratios']
}

export type AntimonyChemicalHeatMode = 'hess' | 'reaction'
export type AntimonyHeatBalanceProcess = 'smelting' | 'converting'

export interface AntimonyHeatBalanceInput {
  inputMaterials: AntimonyHeatBalanceSourceMaterial[]
  products: OxyConstraintSolverResult | null
  fuel: AntimonyFuelMaterial
  /** 保留兼容：入炉煤只作为物料物理热，不按燃烧热直接计入热收入 */
  fuelWeightTh?: number
  /** 无煤热差模式：不计入燃料煤物理热与 C+O₂ 放热 */
  excludeFuelFromInput?: boolean
  /** 煤/精矿比参考煤量（t/h），仅用于对照 */
  ratioReferenceFuelWeightTh?: number
  /** 总表化学热取值：hess=进出流 ΣΔH298，reaction=反应路径净热。 */
  chemicalHeatMode?: AntimonyChemicalHeatMode
  process?: AntimonyHeatBalanceProcess
  temperatures: AntimonyHeatBalanceTemperatures
  coolingWaterInletTemperatureC: number
  coolingWaterOutletTemperatureC: number
  coolingWaterMassTh: number
  furnaceWallTemperatureC?: number
  heatLossMJh: number
  otherHeatMJh: number
}

export interface HeatReactionTerm {
  formula: string
  reactants: Record<string, number>
  products: Record<string, number>
  limitingPhase: string
  sourceMassTh: number
  molarMassKgKmol: number
  limitingCoefficient: number
  extentKmolh: number
  extentSource: 'input' | 'coupled'
  inputExtentKmolh: number
  reactionHeatKJmol: number
  heatMJh: number
  note?: string
}

export interface HeatReactionAbsorptionRow {
  formula: string
  source: string
  sourcePhase: string
  sourceMassTh: number
  molarMassKgKmol: number
  limitingCoefficient: number
  extentKmolh: number
  extentSource?: 'input' | 'coupled'
  inputExtentKmolh: number
  reactionHeatKJmol: number
  heatMJh: number
  note?: string
}

export interface HeatFlowRow {
  type: 'physical' | 'chemical' | 'exchange' | 'loss'
  material: string
  temperature: number | null
  heatMJh: number
  percent: number
  /** 参考汇总行，不参与总表合计加总 */
  isSubtotal?: boolean
  /** 热收支误差行 */
  isBalanceError?: boolean
  /** 误差超出允许带（仍计入合计，UI 用红底标识） */
  isBalanceErrorOutOfBand?: boolean
}

export interface HeatComponentRow {
  section: string
  productKey?: OxySideBlowProductKey
  component: string
  massTh: number
  temperature: number | null
  enthalpy25KJmol: number | null
  enthalpyTKJmol: number | null
  heatMJh: number
}

export interface AntimonyHeatBalanceResult {
  /** 计算所对应的工艺阶段。 */
  process?: AntimonyHeatBalanceProcess
  equations: HeatReactionTerm[]
  chemicalAbsorptionRows: HeatReactionAbsorptionRow[]
  heatIncomeRows: HeatFlowRow[]
  heatExpenditureRows: HeatFlowRow[]
  inputPhysicalRows: HeatComponentRow[]
  outputPhysicalRows: HeatComponentRow[]
  inputPhysicalHeatMJh: number
  outputPhysicalHeatMJh: number
  chemicalHeatMJh: number
  /** Hess：进出物流 ΣΔH298 差（始终计算，便于对照） */
  chemicalHeatHessMJh?: number
  /** 反应路径放热合计（解释用） */
  chemicalHeatReleaseMJh: number
  /** 反应路径吸热合计（解释用） */
  chemicalHeatAbsorptionMJh: number
  /** 反应路径净化学热 = 放热 − 吸热 */
  chemicalHeatPathMJh: number
  /** 本次总表采用的化学热模式 */
  chemicalHeatMode?: AntimonyChemicalHeatMode
  /** 总表化学热计算依据。 */
  chemicalHeatCalculationBasis?: 'stream298' | 'reactionEquations'
  coolingWaterHeatMJh: number
  coolingWaterRows: HeatComponentRow[]
  coolingWaterInletTemperatureC: number
  coolingWaterOutletTemperatureC: number
  coolingWaterMassTh: number
  furnaceWallTemperatureC?: number
  heatLossMJh: number
  otherHeatMJh: number
  heatDeficitMJh: number
  requiredFuelWeight: number
  fuelCombustionHeatMJh: number
  supplementalFuelHeatMJh: number
  fuelEffectiveHeatMJh: number
  balanceAfterFuelMJh: number
  fuelHeatMJt: number
  balanceClosureMode: 'coolingWater' | 'otherHeat' | 'fuel' | 'error' | 'none'
  balanceClosureHeatMJh: number
  /** @deprecated 旧案例中的允许误差参数，当前闭合逻辑不再使用。 */
  heatBalanceTolerancePct?: number
  /** 未闭合热差（MJ/h），不计入热支出配平。 */
  balanceErrorMJh?: number
  /** @deprecated 当前由闭合状态直接判断。 */
  balanceErrorWithinTolerance?: boolean
  supplementalFuelWeightTh?: number
  /** 热平衡闭合得出的总煤量（t/h） */
  derivedFuelWeightTh?: number
  /** 兼容字段：基础煤工况、尚未增加补充煤时的热缺口（MJ/h） */
  heatDeficitWithoutFuelMJh?: number
  finalFuelColumn?: AntimonyFuelMaterial
  finalSolventColumns?: AntimonyMaterialColumn[]
  finalAirColumns?: AntimonyMaterialColumn[]
  finalProductResult?: OxyConstraintSolverResult | null
  closureIterations?: number
  closureResidualMJh?: number
  closureStatus?: 'balanced' | 'surplus' | 'not-needed' | 'max-iterations' | 'blocked'
  /** 燃料煤投入量与 C+O₂ 反应进度对照（不可由反应 kmol/h 直接反推煤量） */
  fuelCoalCrosscheck?: FuelCoalCrosscheck | null
  /** 煤量闭合失败时的具体原因（供诊断面板展示） */
  closureBlockedReason?: string
  /** 估算每吨煤对热平衡的净贡献（MJ/t），仅作闭合诊断参考 */
  fuelEffectiveHeatMJt?: number
}

/** 供氧约束中煤碳参与二次风估算的系数 */
export const FUEL_CARBON_OXYGEN_CONSTRAINT_FACTOR = 0.7

/** C→CO₂ 反应放热估算系数 MJ/(t煤)，按煤化验 C% 缩放 */
export const CARBON_TO_CO2_REACTION_HEAT_MJ_PER_T_C = 32760

export interface FuelCoalCrosscheck {
  fuelWeightTh: number
  /** 煤/精矿比参考煤量（产出初值，仅对照） */
  ratioReferenceFuelWeightTh?: number
  ratioReferenceDeviationTh?: number
  carbonPct: number
  inputCarbonKmolh: number
  reactedCarbonKmolh: number
  inputCarbonMassTh: number
  reactedCarbonMassTh: number
  /** 由煤投入碳反推的煤干量，应与 fuelWeightTh 一致 */
  inferredCoalFromInputCarbonTh: number
  /** 由已反应碳反推的等效煤量（仅燃烧部分） */
  inferredCoalFromReactedCarbonTh: number
  unreactedCarbonMassTh: number
  unreactedCoalEquivalentTh: number
  carbonUtilizationPct: number
  fuelWeightDeviationFromReactedTh: number
  o2Limited: boolean
  oxygenConstraintCarbonKmolh: number
  oxygenConstraintFactor: number
  warnings: string[]
}

type ReactionDefinition = {
  reactants: Record<string, number>
  products: Record<string, number>
  limitingPhase: string
  note?: string
  /** 由产物物相量反推反应进度（kmol/h） */
  productAnchoredExtent?: (outputPool: Record<string, number>) => number | null
  /** 固定反应热（kJ/mol），覆盖生成焓差计算 */
  fixedReactionHeatKJmol?: number
}

const PRODUCT_KEY_TO_TEMPERATURE: Record<OxySideBlowProductKey, HeatBalanceProductTemperatureKey> = {
  smeltingSlag: 'smeltingSlag',
  matte: 'matte',
  flueGas: 'flueGas',
  dust: 'dust',
  fugitive: 'fugitive',
  loss: 'loss',
}

const REACTION_DEFINITIONS: ReactionDefinition[] = [
  {
    reactants: { CuFeS2: 2, O2: 4 },
    products: { Cu2S: 1, FeO: 2, SO2: 3 },
    limitingPhase: 'CuFeS2',
  },
  {
    reactants: { Cu2S: 2, O2: 3 },
    products: { Cu2O: 2, SO2: 2 },
    limitingPhase: 'Cu2S',
    productAnchoredExtent: (pool) => phasePoolKmolh(pool, 'Cu2O') / 2,
  },
  {
    reactants: { FeS2: 2, O2: 5 },
    products: { FeO: 2, SO2: 4 },
    limitingPhase: 'FeS2',
  },
  {
    reactants: { FeS: 3, O2: 5 },
    products: { Fe3O4: 1, SO2: 3 },
    limitingPhase: 'FeS',
    note: 'Fe3O4 生成（由产物 Fe3O4 锚定；先于 FeS→FeO 扣减 FeS）。',
    productAnchoredExtent: (pool) => phasePoolKmolh(pool, 'Fe3O4'),
  },
  {
    reactants: { FeS: 2, O2: 3 },
    products: { FeO: 2, SO2: 2 },
    limitingPhase: 'FeS',
    note: '剩余 FeS 氧化为 FeO（顺序扣池后）。',
  },
  {
    reactants: { CaCO3: 1 },
    products: { CaO: 1, CO2: 1 },
    limitingPhase: 'CaCO3',
    productAnchoredExtent: (pool) => phasePoolKmolh(pool, 'CaSiO3') + phasePoolKmolh(pool, 'CaO'),
  },
  {
    reactants: { MgCO3: 1 },
    products: { MgO: 1, CO2: 1 },
    limitingPhase: 'MgCO3',
    productAnchoredExtent: (pool) => phasePoolKmolh(pool, 'MgSiO3') + phasePoolKmolh(pool, 'MgO'),
  },
  {
    reactants: { PbS: 2, O2: 3 },
    products: { PbO: 2, SO2: 2 },
    limitingPhase: 'PbS',
    productAnchoredExtent: (pool) => phasePoolKmolh(pool, 'PbO') / 2,
  },
  {
    reactants: { ZnS: 2, O2: 3 },
    products: { ZnO: 2, SO2: 2 },
    limitingPhase: 'ZnS',
    productAnchoredExtent: (pool) => phasePoolKmolh(pool, 'ZnO') / 2,
  },
  {
    reactants: { NiS: 2, O2: 3 },
    products: { NiO: 2, SO2: 2 },
    limitingPhase: 'NiS',
    productAnchoredExtent: (pool) => phasePoolKmolh(pool, 'NiO') / 2,
  },
  {
    reactants: { Se: 1, O2: 1 },
    products: { SeO2: 1 },
    limitingPhase: 'Se',
  },
  {
    reactants: { Bi2S3: 2, O2: 9 },
    products: { Bi2O3: 2, SO2: 6 },
    limitingPhase: 'Bi2S3',
    note: '按投入表 Bi2S3 修正用户草稿中的 Bi2O3。',
    productAnchoredExtent: (pool) => phasePoolKmolh(pool, 'Bi2O3') / 2,
  },
  {
    reactants: { Sb2S3: 2, O2: 9 },
    products: { Sb2O3: 2, SO2: 6 },
    limitingPhase: 'Sb2S3',
    note: '投入表含 Sb2S3，产出烟尘/熔渣含 Sb2O3，因此补列锑的氧化反应。',
    productAnchoredExtent: (pool) => phasePoolKmolh(pool, 'Sb2O3') / 2,
  },
  {
    reactants: { As2S2: 2, O2: 7 },
    products: { As2O3: 2, SO2: 4 },
    limitingPhase: 'As2S2',
    note: 'Excel 基准精矿采用 As2S2，产出烟尘/熔渣含 As2O3。',
    productAnchoredExtent: (pool) => phasePoolKmolh(pool, 'As2O3') / 2,
  },
  {
    reactants: { As2S3: 2, O2: 9 },
    products: { As2O3: 2, SO2: 6 },
    limitingPhase: 'As2S3',
    note: '按投入表 As2S3 修正用户草稿中的 As2O3。',
    productAnchoredExtent: (pool) => phasePoolKmolh(pool, 'As2O3') / 2,
  },
  {
    reactants: { C: 1, O2: 1 },
    products: { CO2: 1 },
    limitingPhase: 'C',
    note: 'C 仅取燃料煤中的碳。',
  },
  {
    reactants: { FeO: 2, SiO2: 1 },
    products: { Fe2SiO4: 1 },
    limitingPhase: 'SiO2',
    note: '铁橄榄石造渣（由产物 Fe2SiO4 反推进度）。',
    productAnchoredExtent: (pool) => phasePoolKmolh(pool, 'Fe2SiO4'),
  },
  {
    reactants: { CaO: 1, SiO2: 1 },
    products: { CaSiO3: 1 },
    limitingPhase: 'SiO2',
    note: '硅酸钙造渣（由产物 CaSiO3 反推进度）。',
    productAnchoredExtent: (pool) => phasePoolKmolh(pool, 'CaSiO3'),
  },
  {
    reactants: { MgO: 1, SiO2: 1 },
    products: { MgSiO3: 1 },
    limitingPhase: 'SiO2',
    note: '硅酸镁造渣（由产物 MgSiO3 反推进度）。',
    productAnchoredExtent: (pool) => phasePoolKmolh(pool, 'MgSiO3'),
  },
]

export const ANTIMONY_HEAT_BALANCE_REACTION_EQUATIONS = REACTION_DEFINITIONS.map((definition) => ({
  formula: formatReactionFormula(definition.reactants, definition.products),
  note: definition.note,
}))

function formatCoefficient(value: number) {
  return Math.abs(value - 1) < 1e-12 ? '' : `${Number(value.toFixed(8)).toString()} `
}

function formatFormulaParts(parts: Record<string, number>) {
  return Object.entries(parts)
    .filter(([, coefficient]) => coefficient > 0)
    .map(([phase, coefficient]) => `${formatCoefficient(coefficient)}${phase}`)
    .join(' + ')
}

function formatReactionFormula(reactants: Record<string, number>, products: Record<string, number>) {
  return `${formatFormulaParts(reactants)} = ${formatFormulaParts(products)}`
}

function phaseMolarMass(phase: string) {
  const key = normalizeReactionPhaseKey(phase)
  if (key in COMPOUND_MOLAR_MASS) return COMPOUND_MOLAR_MASS[key as keyof typeof COMPOUND_MOLAR_MASS]
  if (key === 'SO3') return compoundMolarMass({ S: 1, O: 3 })
  if (key === 'Fe2SiO4') return compoundMolarMass({ Fe: 2, Si: 1, O: 4 })
  if (key === 'CaFe2O4') return compoundMolarMass({ Ca: 1, Fe: 2, O: 4 })
  if (key === 'CaSiO3') return compoundMolarMass({ Ca: 1, Si: 1, O: 3 })
  if (key === 'MgSiO3') return compoundMolarMass({ Mg: 1, Si: 1, O: 3 })
  if (key === 'H2O') return compoundMolarMass({ H: 2, O: 1 })
  if (key === 'H2O(l)') return compoundMolarMass({ H: 2, O: 1 })
  if (key === '3Al2O3•2SiO2') return compoundMolarMass({ Al: 6, Si: 2, O: 13 })
  if (key === 'SnO') return compoundMolarMass({ Sn: 1, O: 1 })
  if (key === 'NiO') return compoundMolarMass({ Ni: 1, O: 1 })
  if (key === 'SeO2') return compoundMolarMass({ Se: 1, O: 2 })
  if (key === 'Bi2O3') return compoundMolarMass({ Bi: 2, O: 3 })
  if (key === 'NiS') return compoundMolarMass({ Ni: 1, S: 1 })
  if (key === 'Hg') return atomicMass('Hg')
  if (key === 'Cd') return atomicMass('Cd')
  if (key === 'Au') return atomicMass('Au')
  if (key === 'Ag') return atomicMass('Ag')
  if (key === 'Te') return atomicMass('Te')
  if (key === 'Ni') return atomicMass('Ni')
  if (key === 'Pb') return atomicMass('Pb')
  if (key === 'Zn') return atomicMass('Zn')
  if (key === 'Se') return atomicMass('Se')
  if (key === 'Bi') return atomicMass('Bi')
  if (key === 'Sb') return atomicMass('Sb')
  if (key === 'As') return atomicMass('As')
  if (key === 'Sn') return atomicMass('Sn')
  if (key === 'H') return atomicMass('H')
  if (key === 'O') return atomicMass('O')
  if (key === 'N') return atomicMass('N')
  if (key === 'C') return atomicMass('C')
  if (key === 'S') return atomicMass('S')
  if (key === 'Fe') return atomicMass('Fe')
  if (key === 'Cu') return atomicMass('Cu')
  if (key === 'Cu3As') return compoundMolarMass({ Cu: 3, As: 1 })
  if (key === 'Other') return COMPOUND_MOLAR_MASS.CaO
  return 0
}

export function antimonyHeatPhaseMolarMass(phase: string) {
  return phaseMolarMass(phase)
}

function enthalpy25(phase: string, context?: AntimonyHeatEnthalpyContext) {
  return antimonyEnthalpy25KJmol(phase, context)
}

function enthalpyAtTemperature(phase: string, temperature: number, context?: AntimonyHeatEnthalpyContext) {
  return antimonyEnthalpyAtTemperatureKJmol(phase, temperature, context)
}

function heatFromEnthalpyDeltaMJh(
  massTh: number,
  phase: string,
  temperature: number,
  context?: AntimonyHeatEnthalpyContext
) {
  const h25 = enthalpy25(phase, context)
  const ht = enthalpyAtTemperature(phase, temperature, context)
  const molarMass = phaseMolarMass(phase)
  if (h25 == null || ht == null || molarMass <= 0 || massTh <= 0) return 0
  return ((massTh * 1000) / molarMass) * (ht - h25)
}

export function calculateCoolingWaterHeatMJh(
  waterMassTh: number,
  inletTemperatureC: number,
  outletTemperatureC: number
): number {
  const delta = outletTemperatureC - inletTemperatureC
  if (waterMassTh <= 0 || delta <= 0) return 0
  return Math.max(0, waterMassTh) * WATER_SPECIFIC_HEAT_KJ_KG_C * delta
}

export function calculateCoolingWaterPhysicalRows(
  waterMassTh: number,
  inletTemperatureC: number,
  outletTemperatureC: number
): { inputRows: HeatComponentRow[]; outputRows: HeatComponentRow[] } {
  const coolingWaterMassTh = Math.max(0, waterMassTh)
  const delta = outletTemperatureC - inletTemperatureC
  if (coolingWaterMassTh <= 0 || delta <= 0) {
    return { inputRows: [], outputRows: [] }
  }
  const coolingWaterPhysicalHeatMJh = (temperatureC: number) =>
    coolingWaterMassTh * WATER_SPECIFIC_HEAT_KJ_KG_C * (temperatureC - 25)
  const baseRow = {
    section: '冷却水',
    component: 'H2O',
    massTh: coolingWaterMassTh,
    enthalpy25KJmol: enthalpy25('H2O'),
  }
  return {
    inputRows: [{
      ...baseRow,
      temperature: inletTemperatureC,
      enthalpyTKJmol: enthalpyAtTemperature('H2O', inletTemperatureC),
      heatMJh: coolingWaterPhysicalHeatMJh(inletTemperatureC),
    }],
    outputRows: [{
      ...baseRow,
      temperature: outletTemperatureC,
      enthalpyTKJmol: enthalpyAtTemperature('H2O', outletTemperatureC),
      heatMJh: coolingWaterPhysicalHeatMJh(outletTemperatureC),
    }],
  }
}

function standardFormationHeat(phase: string) {
  return antimonyStandardFormationHeatKJmol(phase)
}

function reactionHeatKJmol(definition: ReactionDefinition) {
  if (definition.fixedReactionHeatKJmol != null) return definition.fixedReactionHeatKJmol
  const productHeat = Object.entries(definition.products).reduce(
    (sum, [phase, coefficient]) => sum + coefficient * standardFormationHeat(phase),
    0
  )
  const reactantHeat = Object.entries(definition.reactants).reduce(
    (sum, [phase, coefficient]) => sum + coefficient * standardFormationHeat(phase),
    0
  )
  return productHeat - reactantHeat
}

function emptyMaterialPhaseRows(material: AntimonyHeatBalanceSourceMaterial): HeatComponentRow[] {
  return Object.entries(material.phases)
    .filter(([phase, pct]) => phaseMolarMass(phase) > 0 && pct > 0)
    .map(([phase, pct]) => ({
      section: material.name,
      component: phase,
      massTh: (Math.max(0, pct) / 100) * Math.max(0, material.dryWeight),
      temperature: null,
      enthalpy25KJmol: enthalpy25(phase, material.enthalpyContext),
      enthalpyTKJmol: null,
      heatMJh: 0,
    }))
}

function materialPhaseRows(material: AntimonyHeatBalanceSourceMaterial, temperature: number): HeatComponentRow[] {
  return emptyMaterialPhaseRows(material).map((row) => ({
    ...row,
    temperature,
    enthalpyTKJmol: enthalpyAtTemperature(row.component, temperature, material.enthalpyContext),
    heatMJh: heatFromEnthalpyDeltaMJh(row.massTh, row.component, temperature, material.enthalpyContext),
  }))
}

function waterRows(material: AntimonyHeatBalanceSourceMaterial, temperature: number): HeatComponentRow[] {
  if (material.waterWeight <= 0) return []
  const gasContext = material.kind === 'gas' || material.airRole ? 'flueGas' : undefined
  return [{
    section: `${material.name}含水`,
    component: 'H2O',
    massTh: material.waterWeight,
    temperature,
    enthalpy25KJmol: enthalpy25('H2O', gasContext),
    enthalpyTKJmol: enthalpyAtTemperature('H2O', temperature, gasContext),
    heatMJh: heatFromEnthalpyDeltaMJh(material.waterWeight, 'H2O', temperature, gasContext),
  }]
}

function materialPhysicalRows(material: AntimonyHeatBalanceSourceMaterial, feedTemperature: number): HeatComponentRow[] {
  const temperature = material.temperatureC ?? (material.kind === 'gas' || material.airRole ? 25 : feedTemperature)
  const phaseRows = materialPhaseRows(material, temperature)
  return [...phaseRows, ...waterRows(material, temperature)]
}

function phaseMassToPercent(phases: Record<string, number>, dryWeight: number) {
  if (dryWeight <= 0) return {}
  return Object.fromEntries(Object.entries(phases).map(([key, mass]) => [key, (Math.max(0, mass) / dryWeight) * 100]))
}

export function sourceMaterialFromColumn(
  material: AntimonyMaterialColumn,
  phases: Record<string, number>,
  options?: Pick<AntimonyHeatBalanceSourceMaterial, 'temperatureC' | 'enthalpyContext'>
): AntimonyHeatBalanceSourceMaterial {
  return {
    id: material.id,
    name: material.name,
    kind: material.kind,
    airRole: material.airRole,
    ...options,
    dryWeight: Math.max(0, material.weight),
    waterWeight: materialWaterWeight(material),
    phases,
    elementRatios: material.ratios,
  }
}

const OUTPUT_PHASE_RESIDUAL_EQUIVALENTS: Record<string, Record<string, number>> = {
  CaO: { CaO: 1, CaSiO3: 1 },
  MgO: { MgO: 1, MgSiO3: 1 },
  FeO: { FeO: 1, Fe2SiO4: 2, Fe3O4: 1 },
}

function normalizeReactionPhaseKey(phase: string) {
  if (phase === 'C (碳)') return 'C'
  // CaO*Fe2O3 / Al2O3*SiO2 等 MetCal 连写 → 计量键，保证热平衡池与摩尔质量可命中
  return normalizeMetcalPhaseFormula(phase) || phase
}

function phaseMassThToKmolh(phase: string, massTh: number) {
  const molarMass = phaseMolarMass(normalizeReactionPhaseKey(phase))
  return molarMass > 0 && massTh > 0 ? (massTh * 1000) / molarMass : 0
}

function phaseKmolhToMassTh(phase: string, kmolh: number) {
  const molarMass = phaseMolarMass(phase)
  return molarMass > 0 && kmolh > 0 ? (kmolh * molarMass) / 1000 : 0
}

function addPhaseKmolh(pool: Record<string, number>, phase: string, kmolh: number) {
  if (!Number.isFinite(kmolh) || Math.abs(kmolh) <= 1e-12) return
  const normalizedPhase = normalizeReactionPhaseKey(phase)
  pool[normalizedPhase] = Math.max(0, (pool[normalizedPhase] ?? 0) + kmolh)
}

function phasePoolKmolh(pool: Record<string, number>, phase: string) {
  return pool[normalizeReactionPhaseKey(phase)] ?? 0
}

function collectInputPhaseKmolhs(inputMaterials: AntimonyHeatBalanceSourceMaterial[]): Record<string, number> {
  const pool: Record<string, number> = {}
  for (const material of inputMaterials) {
    let hasFuelCarbonPhase = false
    for (const [rawPhase, pct] of Object.entries(material.phases)) {
      const phase = normalizeReactionPhaseKey(rawPhase)
      if (phase === 'Other' || pct <= 0 || material.dryWeight <= 0) continue
      if (phase === 'C' && material.kind !== 'fuel') continue
      if (phase === 'C' && material.kind === 'fuel') hasFuelCarbonPhase = true
      const massTh = (Math.max(0, pct) / 100) * Math.max(0, material.dryWeight)
      addPhaseKmolh(pool, phase, phaseMassThToKmolh(phase, massTh))
    }
    const fallbackFuelCarbonPct = material.kind === 'fuel' ? (material.elementRatios?.['C (碳)'] ?? 0) : 0
    if (!hasFuelCarbonPhase && fallbackFuelCarbonPct > 0 && material.dryWeight > 0) {
      const massTh = (fallbackFuelCarbonPct / 100) * Math.max(0, material.dryWeight)
      addPhaseKmolh(pool, 'C', phaseMassThToKmolh('C', massTh))
    }
  }
  return pool
}

function collectOutputPhaseKmolhs(products: OxyConstraintSolverResult | null): Record<string, number> {
  const pool: Record<string, number> = {}
  if (!products?.acceptable) return pool
  for (const product of Object.values(products.products)) {
    for (const phase of product.phases) {
      if (phase.key === 'Other') continue
      addPhaseKmolh(pool, phase.key, phaseMassThToKmolh(phase.key, phase.mass))
    }
  }
  return pool
}

function residualKmolhForPhase(phase: string, residualPool: Record<string, number>) {
  const equivalents = OUTPUT_PHASE_RESIDUAL_EQUIVALENTS[phase] ?? { [phase]: 1 }
  return Object.entries(equivalents).reduce(
    (sum, [residualPhase, coefficient]) => sum + phasePoolKmolh(residualPool, residualPhase) * coefficient,
    0
  )
}

function poolLimitedExtentKmolh(
  definition: ReactionDefinition,
  phasePool: Record<string, number>,
  residualPool: Record<string, number>
) {
  let minExtent = Number.POSITIVE_INFINITY
  for (const [phase, coefficient] of Object.entries(definition.reactants)) {
    if (coefficient <= 0) continue
    const availableKmolh = Math.max(0, phasePoolKmolh(phasePool, phase) - residualKmolhForPhase(phase, residualPool))
    minExtent = Math.min(minExtent, availableKmolh / coefficient)
  }
  return Number.isFinite(minExtent) ? minExtent : 0
}

function reactionExtentFromPool(
  definition: ReactionDefinition,
  phasePool: Record<string, number>,
  residualPool: Record<string, number>,
  outputPool: Record<string, number>,
  coupleToOutput: boolean
) {
  const poolExtent = poolLimitedExtentKmolh(definition, phasePool, residualPool)
  if (!coupleToOutput) return poolExtent
  const anchored =
    definition.productAnchoredExtent != null ? definition.productAnchoredExtent(outputPool) : null
  if (anchored != null && Number.isFinite(anchored)) {
    return Math.max(0, Math.min(anchored, poolExtent))
  }
  return poolExtent
}

function calculateReactionTerms(
  inputMaterials: AntimonyHeatBalanceSourceMaterial[],
  products: OxyConstraintSolverResult | null,
  coupleToOutput: boolean
) {
  const phasePool = collectInputPhaseKmolhs(inputMaterials)
  const residualPool = coupleToOutput && products?.acceptable ? collectOutputPhaseKmolhs(products) : {}
  const outputPool = coupleToOutput && products?.acceptable ? collectOutputPhaseKmolhs(products) : {}
  const extentSource: 'input' | 'coupled' = Object.keys(residualPool).length > 0 ? 'coupled' : 'input'
  const initialPhasePool = { ...phasePool }

  return REACTION_DEFINITIONS.map((definition): HeatReactionTerm => {
    const molarMass = phaseMolarMass(definition.limitingPhase)
    const coefficient = definition.reactants[definition.limitingPhase] ?? 1
    const inputExtentKmolh =
      coefficient > 0 ? phasePoolKmolh(initialPhasePool, definition.limitingPhase) / coefficient : 0
    const isFuelCarbonReaction =
      definition.limitingPhase === 'C' &&
      definition.reactants.C === 1 &&
      definition.products.CO2 === 1
    const reactionResidualPool = isFuelCarbonReaction ? {} : residualPool
    const extentKmolh = Math.max(
      0,
      reactionExtentFromPool(definition, phasePool, reactionResidualPool, outputPool, coupleToOutput)
    )
    for (const [phase, reactantCoefficient] of Object.entries(definition.reactants)) {
      addPhaseKmolh(phasePool, phase, -reactantCoefficient * extentKmolh)
    }
    for (const [phase, productCoefficient] of Object.entries(definition.products)) {
      addPhaseKmolh(phasePool, phase, productCoefficient * extentKmolh)
    }
    const dH = reactionHeatKJmol(definition)
    const sourceMassTh = phaseKmolhToMassTh(definition.limitingPhase, extentKmolh * coefficient)
    return {
      formula: formatReactionFormula(definition.reactants, definition.products),
      reactants: definition.reactants,
      products: definition.products,
      limitingPhase: definition.limitingPhase,
      sourceMassTh,
      molarMassKgKmol: molarMass,
      limitingCoefficient: coefficient,
      extentKmolh,
      extentSource,
      inputExtentKmolh,
      reactionHeatKJmol: dH,
      heatMJh: -extentKmolh * dH,
      note: definition.note,
    }
  })
}

function calculateReactionAbsorptionRows(equations: HeatReactionTerm[]): HeatReactionAbsorptionRow[] {
  return equations
    .filter((row) => row.sourceMassTh > 0 && row.reactionHeatKJmol > 0)
    .map((row) => ({
      formula: row.formula,
      source: '混料',
      sourcePhase: row.limitingPhase,
      sourceMassTh: row.sourceMassTh,
      molarMassKgKmol: row.molarMassKgKmol,
      limitingCoefficient: row.limitingCoefficient,
      extentKmolh: row.extentKmolh,
      extentSource: row.extentSource,
      inputExtentKmolh: row.inputExtentKmolh,
      reactionHeatKJmol: row.reactionHeatKJmol,
      heatMJh: Math.max(0, -row.heatMJh),
      note: row.note,
    }))
}

function outputProductRows(
  products: OxyConstraintSolverResult | null,
  temperatures: AntimonyHeatBalanceTemperatures,
  process: AntimonyHeatBalanceProcess
): HeatComponentRow[] {
  if (!products?.acceptable) return []
  const rows: HeatComponentRow[] = []
  for (const product of Object.values(products.products)) {
    const temperatureKey = PRODUCT_KEY_TO_TEMPERATURE[product.key]
    const temperature = temperatures[temperatureKey]
    const enthalpyContext =
      process === 'converting'
        ? ({
            smeltingSlag: 'convertingSlag',
            matte: 'convertingAntimony',
            flueGas: 'convertingFlueGas',
            dust: 'convertingDust',
            fugitive: 'convertingFugitive',
            loss: 'convertingLoss',
          } satisfies Record<OxySideBlowProductKey, AntimonyHeatEnthalpyContext>)[product.key]
        : product.key as AntimonyHeatEnthalpyContext
    for (const phase of product.phases) {
      rows.push({
        section: product.name,
        productKey: product.key,
        component: phase.key,
        massTh: phase.mass,
        temperature,
        enthalpy25KJmol: enthalpy25(phase.key, enthalpyContext),
        enthalpyTKJmol: enthalpyAtTemperature(phase.key, temperature, enthalpyContext),
        heatMJh: heatFromEnthalpyDeltaMJh(phase.mass, phase.key, temperature, enthalpyContext),
      })
    }
  }
  return rows
}

function sumHeat(rows: Array<{ heatMJh: number }>) {
  return rows.reduce((sum, row) => sum + (Number.isFinite(row.heatMJh) ? row.heatMJh : 0), 0)
}

/** Σ(n·ΔHf298)，与 MetCal 表14 同口径；行内 enthalpy25KJmol 已区分含水液态与烟气气态 H₂O */
function streamFormationEnthalpyMJh(rows: HeatComponentRow[]) {
  return rows.reduce((sum, row) => {
    const molarMass = phaseMolarMass(row.component)
    const h25 = row.enthalpy25KJmol
    if (molarMass <= 0 || h25 == null || row.massTh <= 0) return sum
    return sum + ((row.massTh * 1000) / molarMass) * h25
  }, 0)
}

/** MetCal 表13 化学热：Σ入 ΔH298 − Σ出 ΔH298 */
export function calculateHessChemicalHeatMJh(
  inputRows: HeatComponentRow[],
  outputRows: HeatComponentRow[]
): number {
  return streamFormationEnthalpyMJh(inputRows) - streamFormationEnthalpyMJh(outputRows)
}

function percentRows(rows: Omit<HeatFlowRow, 'percent'>[], denominator: number): HeatFlowRow[] {
  return rows.map((row) => {
    const signed =
      row.isBalanceError || row.material === '误差' ? row.heatMJh : Math.max(0, row.heatMJh)
    return {
      ...row,
      percent: denominator > 0 ? (signed / denominator) * 100 : 0,
    }
  })
}

function heatFlowSectionName(row: HeatComponentRow) {
  if (row.component === 'H2O' && row.section.includes('含水')) return '含水'
  return row.section
}

function aggregateBySection(rows: HeatComponentRow[]) {
  const map = new Map<string, { temperature: number | null; heatMJh: number }>()
  for (const row of rows) {
    const section = heatFlowSectionName(row)
    const current = map.get(section) ?? { temperature: row.temperature, heatMJh: 0 }
    current.heatMJh += row.heatMJh
    if (current.temperature == null) current.temperature = row.temperature
    map.set(section, current)
  }
  return [...map.entries()].map(([material, value]) => ({ material, ...value }))
}

export function fuelPhysicalHeatMJt(
  fuel: AntimonyFuelMaterial,
  phases: Record<string, number>,
  feedTemperatureC: number
): number {
  const material: AntimonyHeatBalanceSourceMaterial = {
    id: fuel.id,
    name: fuel.name,
    kind: 'fuel',
    dryWeight: 1,
    waterWeight: 0,
    phases,
    elementRatios: fuel.ratios,
  }
  return sumHeat(materialPhysicalRows(material, feedTemperatureC))
}

export function estimateFuelCarbonReactionHeatMJt(fuel: AntimonyFuelMaterial): number {
  const carbonPct = Math.max(0, fuel.ratios['C (碳)'] ?? 0)
  return Math.max(1000, CARBON_TO_CO2_REACTION_HEAT_MJ_PER_T_C * (carbonPct / 100))
}

export function estimateFuelEffectiveHeatMJt(params: {
  fuel: AntimonyFuelMaterial
  fuelPhases: Record<string, number>
  feedTemperatureC: number
  carbonUtilizationPct?: number
}): number {
  const utilization = Math.max(0.01, Math.min(1, (params.carbonUtilizationPct ?? 100) / 100))
  const physicalMJt = fuelPhysicalHeatMJt(params.fuel, params.fuelPhases, params.feedTemperatureC)
  const reactionMJt = estimateFuelCarbonReactionHeatMJt(params.fuel) * utilization
  return Math.max(100, physicalMJt + reactionMJt)
}

export function estimateFuelWeightFromHeatDeficit(params: {
  heatDeficitMJh: number
  fuel: AntimonyFuelMaterial
  fuelPhases: Record<string, number>
  feedTemperatureC: number
  carbonUtilizationPct?: number
}): number {
  const deficit = Math.max(0, params.heatDeficitMJh)
  if (deficit <= 0) return 0
  const totalMJt = estimateFuelEffectiveHeatMJt(params)
  return deficit / totalMJt
}

export function refreshHeatBalanceSummaryRows(
  result: AntimonyHeatBalanceResult,
  inputPhysicalRows: HeatComponentRow[]
): AntimonyHeatBalanceResult {
  const next = structuredClone(result)
  const chemicalIncomeMJh = Math.max(0, next.chemicalHeatMJh)
  const chemicalExpenditureMJh = Math.max(0, -next.chemicalHeatMJh)
  const incomeBaseRows: Omit<HeatFlowRow, 'percent'>[] = [
    ...aggregateBySection(inputPhysicalRows).map((row) => ({
      type: 'physical' as const,
      material: row.material,
      temperature: row.temperature,
      heatMJh: row.heatMJh,
    })),
    {
      type: 'chemical',
      material: '化学反应热',
      temperature: 25,
      heatMJh: chemicalIncomeMJh,
    },
  ]
  const expenditureBaseRows: Omit<HeatFlowRow, 'percent'>[] = [
    ...aggregateBySection(next.outputPhysicalRows).map((row) => ({
      type: 'physical' as const,
      material: row.material,
      temperature: row.temperature,
      heatMJh: row.heatMJh,
    })),
    {
      type: 'physical',
      material: '产物物理热合计',
      temperature: null,
      heatMJh: next.outputPhysicalHeatMJh,
      isSubtotal: true,
    },
    ...(chemicalExpenditureMJh > 1e-9
      ? [
          {
            type: 'chemical' as const,
            material: '化学反应热（净吸热）',
            temperature: 25,
            heatMJh: chemicalExpenditureMJh,
          },
        ]
      : []),
    {
      type: 'exchange',
      material: '冷却水',
      temperature: next.coolingWaterOutletTemperatureC,
      heatMJh: next.coolingWaterHeatMJh,
    },
    {
      type: 'loss',
      material: '炉体散热',
      temperature: null,
      heatMJh: next.heatLossMJh,
    },
    {
      type: 'loss',
      material: '自然散热',
      temperature: null,
      heatMJh: next.otherHeatMJh,
    },
  ]
  const incomeTotal = incomeBaseRows.reduce((sum, row) => sum + Math.max(0, row.heatMJh), 0)
  const expenditureTotal = expenditureBaseRows
    .filter((row) => !row.isSubtotal)
    .reduce((sum, row) => sum + Math.max(0, row.heatMJh), 0)
  next.balanceErrorMJh = incomeTotal - expenditureTotal
  next.heatIncomeRows = percentRows(incomeBaseRows, incomeTotal)
  next.heatExpenditureRows = percentRows(expenditureBaseRows, expenditureTotal)
  return next
}

export function calculateAntimonyHeatBalanceDetailed(input: AntimonyHeatBalanceInput): AntimonyHeatBalanceResult {
  const balanceMaterials = input.excludeFuelFromInput
    ? input.inputMaterials.filter((material) => material.kind !== 'fuel')
    : input.inputMaterials
  const processInputPhysicalRows = balanceMaterials.flatMap((material) =>
    materialPhysicalRows(material, input.temperatures.feed)
  )
  const productOutputPhysicalRows = outputProductRows(input.products, input.temperatures, input.process ?? 'smelting')
  const coupleReactionsToOutput = Boolean(input.products?.acceptable)
  const equations = calculateReactionTerms(
    balanceMaterials,
    input.products,
    coupleReactionsToOutput
  )
  const chemicalAbsorptionRows = calculateReactionAbsorptionRows(equations)

  const inputPhysicalHeatMJh = sumHeat(processInputPhysicalRows)
  const outputPhysicalHeatMJh = sumHeat(productOutputPhysicalRows)
  const chemicalHeatReleaseMJh = equations.reduce(
    (sum, row) => sum + (Number.isFinite(row.heatMJh) && row.heatMJh > 0 ? row.heatMJh : 0),
    0
  )
  const chemicalHeatAbsorptionMJh = equations.reduce(
    (sum, row) => sum + (Number.isFinite(row.heatMJh) && row.heatMJh < 0 ? -row.heatMJh : 0),
    0
  )
  const chemicalHeatPathMJh = chemicalHeatReleaseMJh - chemicalHeatAbsorptionMJh
  const chemicalHeatHessMJh = coupleReactionsToOutput
    ? calculateHessChemicalHeatMJh(processInputPhysicalRows, productOutputPhysicalRows)
    : chemicalHeatPathMJh
  const chemicalHeatMode: AntimonyChemicalHeatMode =
    input.chemicalHeatMode === 'reaction' ? 'reaction' : 'hess'
  const chemicalHeatMJh =
    chemicalHeatMode === 'hess' || !coupleReactionsToOutput
      ? chemicalHeatHessMJh
      : chemicalHeatPathMJh
  const chemicalIncomeMJh = Math.max(0, chemicalHeatMJh)
  const baseIncomeMJh = inputPhysicalHeatMJh + chemicalIncomeMJh
  const requestedHeatLossMJh = Number.isFinite(input.heatLossMJh) ? input.heatLossMJh : 0
  const heatLossMJh = Math.max(
    0,
    requestedHeatLossMJh > 0
      ? requestedHeatLossMJh
      : input.process === 'converting'
        ? 0
        : baseIncomeMJh * DEFAULT_ANTIMONY_FURNACE_HEAT_LOSS_FRACTION
  )
  const otherHeatMJh = Math.max(0, Number.isFinite(input.otherHeatMJh) ? input.otherHeatMJh : 0)
  const coolingWaterMassTh = Math.max(0, input.coolingWaterMassTh)
  const coolingWaterHeatMJh = calculateCoolingWaterHeatMJh(
    coolingWaterMassTh,
    input.coolingWaterInletTemperatureC,
    input.coolingWaterOutletTemperatureC
  )
  // 净化学热计入热收入「化学反应热」；吸热不再单独占热支出，避免与收入侧减法重复
  const chemicalExpenditureMJh = Math.max(0, -chemicalHeatMJh)
  const baseExpenditureMJh =
    outputPhysicalHeatMJh + chemicalExpenditureMJh + coolingWaterHeatMJh + heatLossMJh + otherHeatMJh
  const heatDeficitMJh = baseExpenditureMJh - baseIncomeMJh
  const fuelHeatMJt = 0
  const fuelCombustionHeatMJh = 0
  const requiredFuelWeight = 0
  const supplementalFuelHeatMJh = 0
  const fuelEffectiveHeatMJh = 0
  const balanceClosureMode = 'none'
  const balanceClosureHeatMJh = 0
  const coolingWaterPhysicalRows = calculateCoolingWaterPhysicalRows(
    coolingWaterMassTh,
    input.coolingWaterInletTemperatureC,
    input.coolingWaterOutletTemperatureC
  )
  const coolingWaterRows: HeatComponentRow[] = [
    ...coolingWaterPhysicalRows.inputRows.map((row) => ({ ...row, section: '冷却水进口' })),
    ...coolingWaterPhysicalRows.outputRows.map((row) => ({ ...row, section: '冷却水出口' })),
  ]
  const inputPhysicalRows = processInputPhysicalRows
  const outputPhysicalRows = productOutputPhysicalRows
  const balanceAfterFuelMJh = baseIncomeMJh - baseExpenditureMJh

  const incomeBaseRows: Omit<HeatFlowRow, 'percent'>[] = [
    ...aggregateBySection(processInputPhysicalRows).map((row) => ({
      type: 'physical' as const,
      material: row.material,
      temperature: row.temperature,
      heatMJh: row.heatMJh,
    })),
    {
      type: 'chemical',
      material: '化学反应热',
      temperature: 25,
      heatMJh: chemicalIncomeMJh,
    },
  ]
  const expenditureBaseRows: Omit<HeatFlowRow, 'percent'>[] = [
    ...aggregateBySection(productOutputPhysicalRows).map((row) => ({
      type: 'physical' as const,
      material: row.material,
      temperature: row.temperature,
      heatMJh: row.heatMJh,
    })),
    {
      type: 'physical',
      material: '产物物理热合计',
      temperature: null,
      heatMJh: outputPhysicalHeatMJh,
      isSubtotal: true,
    },
    ...(chemicalExpenditureMJh > 1e-9
      ? [
          {
            type: 'chemical' as const,
            material: '化学反应热（净吸热）',
            temperature: 25,
            heatMJh: chemicalExpenditureMJh,
          },
        ]
      : []),
    {
      type: 'exchange',
      material: '冷却水',
      temperature: input.coolingWaterOutletTemperatureC,
      heatMJh: coolingWaterHeatMJh,
    },
    {
      type: 'loss',
      material: '炉体散热',
      temperature: null,
      heatMJh: heatLossMJh,
    },
    {
      type: 'loss',
      material: '自然散热',
      temperature: null,
      heatMJh: otherHeatMJh,
    },
  ]

  const incomeTotal = incomeBaseRows.reduce((sum, row) => sum + Math.max(0, row.heatMJh), 0)
  const expenditureTotal = expenditureBaseRows
    .filter((row) => !row.isSubtotal)
    .reduce((sum, row) => sum + Math.max(0, row.heatMJh), 0)

  const fuelWeightTh = input.excludeFuelFromInput
    ? 0
    : Math.max(0, input.fuelWeightTh ?? input.fuel.weight ?? 0)
  const carbonPct = Math.max(0, input.fuel.ratios?.['C (碳)'] ?? 0)
  const heatDeficitWithoutFuelMJh = input.excludeFuelFromInput ? heatDeficitMJh : undefined
  const fuelCoalCrosscheck = analyzeFuelCoalCrosscheck({
    equations,
    fuelWeightTh,
    carbonPct,
    ratioReferenceFuelWeightTh: input.ratioReferenceFuelWeightTh,
  })

  return {
    process: input.process ?? 'smelting',
    equations,
    chemicalAbsorptionRows,
    heatIncomeRows: percentRows(incomeBaseRows, incomeTotal),
    heatExpenditureRows: percentRows(expenditureBaseRows, expenditureTotal),
    inputPhysicalRows,
    outputPhysicalRows,
    inputPhysicalHeatMJh,
    outputPhysicalHeatMJh,
    chemicalHeatMJh,
    chemicalHeatHessMJh,
    chemicalHeatReleaseMJh,
    chemicalHeatAbsorptionMJh,
    chemicalHeatPathMJh,
    chemicalHeatMode,
    chemicalHeatCalculationBasis: chemicalHeatMode === 'hess'
      ? 'stream298'
      : 'reactionEquations',
    coolingWaterHeatMJh,
    coolingWaterRows,
    coolingWaterInletTemperatureC: input.coolingWaterInletTemperatureC,
    coolingWaterOutletTemperatureC: input.coolingWaterOutletTemperatureC,
    coolingWaterMassTh,
    furnaceWallTemperatureC: input.furnaceWallTemperatureC,
    heatLossMJh,
    otherHeatMJh,
    heatDeficitMJh,
    requiredFuelWeight,
    fuelCombustionHeatMJh,
    supplementalFuelHeatMJh,
    fuelEffectiveHeatMJh,
    balanceAfterFuelMJh,
    fuelHeatMJt,
    balanceClosureMode,
    balanceClosureHeatMJh,
    supplementalFuelWeightTh: 0,
    derivedFuelWeightTh: fuelWeightTh,
    heatDeficitWithoutFuelMJh,
    closureIterations: 0,
    closureResidualMJh: balanceAfterFuelMJh,
    closureStatus: heatDeficitMJh > 1e-6 ? 'blocked' : heatDeficitMJh < -1e-6 ? 'surplus' : 'balanced',
    fuelCoalCrosscheck,
  }
}

function findFuelCarbonReaction(equations: HeatReactionTerm[]) {
  return equations.find(
    (row) => row.limitingPhase === 'C' && row.reactants.C === 1 && row.products.CO2 === 1
  )
}

export function analyzeFuelCoalCrosscheck(params: {
  equations: HeatReactionTerm[]
  fuelWeightTh: number
  carbonPct: number
  ratioReferenceFuelWeightTh?: number
}): FuelCoalCrosscheck | null {
  const fuelWeightTh = Math.max(0, params.fuelWeightTh)
  const carbonPct = Math.max(0, params.carbonPct)
  const ratioReferenceFuelWeightTh =
    params.ratioReferenceFuelWeightTh != null && params.ratioReferenceFuelWeightTh > 0
      ? params.ratioReferenceFuelWeightTh
      : undefined
  if (fuelWeightTh <= 0 || carbonPct <= 0) return null

  const carbonRow = findFuelCarbonReaction(params.equations)
  if (!carbonRow) return null

  const carbonFrac = carbonPct / 100
  const inputCarbonKmolh = Math.max(0, carbonRow.inputExtentKmolh)
  const reactedCarbonKmolh = Math.max(0, carbonRow.extentKmolh)
  const inputCarbonMassTh = phaseKmolhToMassTh('C', inputCarbonKmolh)
  const reactedCarbonMassTh = phaseKmolhToMassTh('C', reactedCarbonKmolh)
  const inferredCoalFromInputCarbonTh = inputCarbonMassTh / carbonFrac
  const inferredCoalFromReactedCarbonTh = reactedCarbonMassTh / carbonFrac
  const unreactedCarbonMassTh = Math.max(0, inputCarbonMassTh - reactedCarbonMassTh)
  const unreactedCoalEquivalentTh = unreactedCarbonMassTh / carbonFrac
  const carbonUtilizationPct = inputCarbonKmolh > 0 ? (reactedCarbonKmolh / inputCarbonKmolh) * 100 : 0
  const o2Limited = reactedCarbonKmolh + 1e-6 < inputCarbonKmolh
  const oxygenConstraintCarbonKmolh =
    ((fuelWeightTh * carbonFrac) / atomicMass('C')) * FUEL_CARBON_OXYGEN_CONSTRAINT_FACTOR

  const warnings: string[] = []
  if (ratioReferenceFuelWeightTh != null) {
    const ratioDeviation = fuelWeightTh - ratioReferenceFuelWeightTh
    if (Math.abs(ratioDeviation) > 0.05) {
      warnings.push(
        `热平衡总煤量 ${fuelWeightTh.toFixed(3)} t/h 与工艺基础煤 ${ratioReferenceFuelWeightTh.toFixed(3)} t/h 相差 ${ratioDeviation >= 0 ? '+' : ''}${ratioDeviation.toFixed(3)} t/h。`
      )
    }
  }
  if (o2Limited) {
    warnings.push(
      `剩余 O₂ 不足，约 ${unreactedCoalEquivalentTh.toFixed(3)} t/h 煤碳未参与 C+O₂→CO₂；可提高二次风供氧使碳尽量燃尽。`
    )
  }
  if (Math.abs(inferredCoalFromInputCarbonTh - fuelWeightTh) > 0.05) {
    warnings.push(
      `煤投入碳推算煤量 ${inferredCoalFromInputCarbonTh.toFixed(3)} t/h 与热平衡总煤量 ${fuelWeightTh.toFixed(3)} t/h 不一致，请检查物相 C% 与煤化验。`
    )
  }

  return {
    fuelWeightTh,
    ratioReferenceFuelWeightTh,
    ratioReferenceDeviationTh:
      ratioReferenceFuelWeightTh != null ? fuelWeightTh - ratioReferenceFuelWeightTh : undefined,
    carbonPct,
    inputCarbonKmolh,
    reactedCarbonKmolh,
    inputCarbonMassTh,
    reactedCarbonMassTh,
    inferredCoalFromInputCarbonTh,
    inferredCoalFromReactedCarbonTh,
    unreactedCarbonMassTh,
    unreactedCoalEquivalentTh,
    carbonUtilizationPct,
    fuelWeightDeviationFromReactedTh: fuelWeightTh - inferredCoalFromReactedCarbonTh,
    o2Limited,
    oxygenConstraintCarbonKmolh,
    oxygenConstraintFactor: FUEL_CARBON_OXYGEN_CONSTRAINT_FACTOR,
    warnings,
  }
}

export function inputMaterialPhasesFromMasses(
  material: AntimonyMaterialColumn,
  phaseMasses: Record<string, number>
) {
  return sourceMaterialFromColumn(material, phaseMassToPercent(phaseMasses, Math.max(0, material.weight)))
}
