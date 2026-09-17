/**
 * 铜冶炼年物料运行成本（OPEX）：小时湿基量 × 年运行小时 × 单价。
 *
 * 年时基默认与导出表 6「元素质量年平衡」一致：年处理天数 × 24 h。
 * 设备选型页的「年运行时间」默认 7200 h/a，不在这里混用。
 */
import {
  COPPER_KIND_PRICE_LABELS,
  lookupCopperMaterialPrice,
  type CopperPriceKind,
} from '../config/copperMaterialPriceTable.ts'
import { DEFAULT_SMELTING_PROCESS_DAYS } from './copperEquipmentSizing.ts'
import { materialWetWeight, type CopperMaterialColumn } from './copperWorkflowCalc.ts'

export const COST_HOURS_PER_DAY = 24
export const DEFAULT_COST_ANNUAL_DAYS = DEFAULT_SMELTING_PROCESS_DAYS

const MASS_EPSILON = 1e-9

export type AnnualCostKind = CopperPriceKind
export type AnnualCostSide = 'input' | 'output'
export type AnnualCostPriceSource = 'override' | 'material' | 'catalog' | 'missing'

export type AnnualCostRow = {
  id: string
  name: string
  side: AnnualCostSide
  kind: AnnualCostKind
  kindLabel: string
  hourlyWetTh: number
  annualTonnage: number
  unitPrice: number
  unitLabel: string
  annualCost: number
  sharePct: number
  priceSource: AnnualCostPriceSource
}

export type AnnualCostProductInput = {
  id: string
  name: string
  hourlyMass: number
}

export type AnnualMaterialCostResult = {
  inputRows: AnnualCostRow[]
  outputRows: AnnualCostRow[]
  inputAnnualCost: number
  outputAnnualValue: number
  inputAnnualTonnage: number
  outputAnnualTonnage: number
  /** 产出货值 − 投入费用 */
  netAnnualValue: number
  annualHours: number
  annualDays: number
  hoursPerDay: number
  productName: string
  productHourlyTh: number
  productAnnualTonnage: number
  /** 元 / t 主产品；无产品量时为 null */
  costPerProductTonne: number | null
}

export type BuildAnnualMaterialCostParams = {
  rawMaterials: readonly CopperMaterialColumn[]
  solventColumns: readonly CopperMaterialColumn[]
  fuelColumn: CopperMaterialColumn | null | undefined
  airColumns: readonly CopperMaterialColumn[]
  products?: readonly AnnualCostProductInput[]
  annualDays: number
  hoursPerDay?: number
  /** 行 id → 覆盖单价（元/t 或元/kWh） */
  priceOverrides?: Record<string, string | number>
  productName?: string
  productHourlyTh?: number
}

function parseOverride(value: string | number | undefined): number | null {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : null
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

function kindOf(column: Pick<CopperMaterialColumn, 'kind'>): AnnualCostKind {
  if (column.kind === 'solvent' || column.kind === 'fuel' || column.kind === 'gas') return column.kind
  return 'raw'
}

function resolvePrice(
  item: { id: string; name: string; unitPrice?: number },
  overrides?: Record<string, string | number>
): { unitPrice: number; unitLabel: string; source: AnnualCostPriceSource } {
  const catalog = lookupCopperMaterialPrice(item.name ?? '')
  // This table consumes t/h. Electricity belongs in the annual kWh utility sheet.
  const unitLabel = '元/t'
  if (catalog?.unit === 'kWh') return { unitPrice: 0, unitLabel, source: 'missing' }
  const supplied = [overrides?.[item.id], overrides?.[item.name ?? '']]
    .find(value => value != null && (typeof value !== 'string' || value.trim() !== ''))
  if (supplied !== undefined) {
    const overridden = parseOverride(supplied)
    return overridden == null ? { unitPrice: 0, unitLabel, source: 'missing' }
      : { unitPrice: overridden, unitLabel, source: 'override' }
  }
  if (item.unitPrice != null && Number.isFinite(item.unitPrice) && item.unitPrice > 0) {
    return { unitPrice: item.unitPrice, unitLabel, source: 'material' }
  }
  if (catalog) {
    return { unitPrice: catalog.unitPrice, unitLabel, source: 'catalog' }
  }
  return { unitPrice: 0, unitLabel, source: 'missing' }
}

function applyShare(rows: AnnualCostRow[], total: number) {
  for (const row of rows) {
    row.sharePct = total > 0 ? (row.annualCost / total) * 100 : 0
  }
}

function toInputRow(
  column: CopperMaterialColumn,
  annualHours: number,
  overrides?: Record<string, string | number>
): AnnualCostRow | null {
  const name = column.name?.trim()
  if (!name) return null
  const hourlyWetTh = materialWetWeight(column)
  if (hourlyWetTh <= MASS_EPSILON) return null
  const kind = kindOf(column)
  const { unitPrice, unitLabel, source } = resolvePrice(column, overrides)
  const annualTonnage = hourlyWetTh * annualHours
  return {
    id: column.id,
    name,
    side: 'input',
    kind,
    kindLabel: COPPER_KIND_PRICE_LABELS[kind],
    hourlyWetTh,
    annualTonnage,
    unitPrice,
    unitLabel,
    annualCost: annualTonnage * unitPrice,
    sharePct: 0,
    priceSource: source,
  }
}

function toOutputRow(
  product: AnnualCostProductInput,
  annualHours: number,
  overrides?: Record<string, string | number>
): AnnualCostRow | null {
  const name = product.name?.trim()
  if (!name) return null
  const hourlyWetTh = Math.max(0, product.hourlyMass)
  if (hourlyWetTh <= MASS_EPSILON) return null
  const { unitPrice, unitLabel, source } = resolvePrice(product, overrides)
  const annualTonnage = hourlyWetTh * annualHours
  return {
    id: product.id,
    name,
    side: 'output',
    kind: 'product',
    kindLabel: COPPER_KIND_PRICE_LABELS.product,
    hourlyWetTh,
    annualTonnage,
    unitPrice,
    unitLabel,
    annualCost: annualTonnage * unitPrice,
    sharePct: 0,
    priceSource: source,
  }
}

export function resolveCostAnnualDays(costAnnualDays: string | undefined, processDays: number): number {
  const fallback = Number.isFinite(processDays) ? Math.min(366, Math.max(0, processDays)) : DEFAULT_COST_ANNUAL_DAYS
  const trimmed = costAnnualDays?.trim() ?? ''
  if (!trimmed) return fallback
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? Math.min(366, Math.max(0, parsed)) : fallback
}

export function buildAnnualMaterialCost(params: BuildAnnualMaterialCostParams): AnnualMaterialCostResult {
  const annualDays = resolveCostAnnualDays(undefined, params.annualDays)
  const hoursPerDay = Number.isFinite(params.hoursPerDay) ? Math.min(24, Math.max(0, params.hoursPerDay!)) : COST_HOURS_PER_DAY
  const annualHours = annualDays * hoursPerDay
  const materials: CopperMaterialColumn[] = [
    ...params.rawMaterials,
    ...params.solventColumns,
    ...(params.fuelColumn ? [params.fuelColumn] : []),
    ...params.airColumns,
  ]
  const inputRows = materials
    .map((column) => toInputRow(column, annualHours, params.priceOverrides))
    .filter((row): row is AnnualCostRow => row != null)
  const outputRows = (params.products ?? [])
    .map((product) => toOutputRow(product, annualHours, params.priceOverrides))
    .filter((row): row is AnnualCostRow => row != null)

  const inputAnnualCost = inputRows.reduce((sum, row) => sum + row.annualCost, 0)
  const outputAnnualValue = outputRows.reduce((sum, row) => sum + row.annualCost, 0)
  const inputAnnualTonnage = inputRows.reduce((sum, row) => sum + row.annualTonnage, 0)
  const outputAnnualTonnage = outputRows.reduce((sum, row) => sum + row.annualTonnage, 0)
  applyShare(inputRows, inputAnnualCost)
  applyShare(outputRows, outputAnnualValue)

  const productHourlyTh = Math.max(0, params.productHourlyTh ?? 0)
  const productAnnualTonnage = productHourlyTh * annualHours
  return {
    inputRows,
    outputRows,
    inputAnnualCost,
    outputAnnualValue,
    inputAnnualTonnage,
    outputAnnualTonnage,
    netAnnualValue: outputAnnualValue - inputAnnualCost,
    annualHours,
    annualDays,
    hoursPerDay,
    productName: params.productName?.trim() || '主产品',
    productHourlyTh,
    productAnnualTonnage,
    costPerProductTonne: productAnnualTonnage > MASS_EPSILON ? inputAnnualCost / productAnnualTonnage : null,
  }
}
