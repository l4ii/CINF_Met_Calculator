/**
 * 铜冶炼年物料运行成本的默认单价表。
 *
 * 精矿 / 熔剂 / 燃料单价直接复用配料库已有字段，避免出现两套价格。
 * 气体列在配料表里单价多为 0，这里补氧气、工业用水、电的工程估算默认值，
 * 仅作初值，用户可在造价表里改。
 */
import { DEFAULT_COPPER_FUEL } from '../utils/copperProcessCalc.ts'
import {
  COPPER_MATERIAL_LIBRARY,
  DEFAULT_COPPER_SOLVENTS,
} from '../utils/copperWorkflowCalc.ts'

export type CopperPriceKind = 'raw' | 'solvent' | 'fuel' | 'gas' | 'energy' | 'product'

export type CopperPriceUnit = 't' | 'kWh'

export type CopperMaterialPriceEntry = {
  id: string
  name: string
  kind: CopperPriceKind
  /** 元 / 计量单位 */
  unitPrice: number
  unit: CopperPriceUnit
  note?: string
}

function concentrateEntries(): CopperMaterialPriceEntry[] {
  return COPPER_MATERIAL_LIBRARY.map((item) => ({
    id: item.id,
    name: item.name,
    kind: 'raw' as const,
    unitPrice: item.unitPrice,
    unit: 't' as const,
    note: '来自铜精矿原料库',
  }))
}

function solventEntries(): CopperMaterialPriceEntry[] {
  return DEFAULT_COPPER_SOLVENTS.map((item) => ({
    id: `solvent-${item.id}`,
    name: item.name,
    kind: 'solvent' as const,
    unitPrice: item.unitPrice,
    unit: 't' as const,
    note: '来自默认熔剂库',
  }))
}

/** 能源项：配料表里没有独立的水/电列，按名称查找或作为参考价 */
const ENERGY_PRICE_ENTRIES: CopperMaterialPriceEntry[] = [
  {
    id: 'energy-oxygen',
    name: '氧气',
    kind: 'gas',
    unitPrice: 800,
    unit: 't',
    note: '工业氧气估算价，配料气体列默认单价为 0',
  },
  {
    id: 'energy-water',
    name: '工业用水',
    kind: 'energy',
    unitPrice: 4,
    unit: 't',
    note: '循环冷却水不计入；仅当投入中出现同名物料时计价',
  },
  {
    id: 'energy-power',
    name: '电',
    kind: 'energy',
    unitPrice: 0.65,
    unit: 'kWh',
    note: '工业电估算价；当前年平衡表无电耗，仅作参考单价',
  },
]

/** 产出货值估算价，仅作初值，用户可在造价表改 */
const PRODUCT_PRICE_ENTRIES: CopperMaterialPriceEntry[] = [
  { id: 'product-matte', name: '白铜锍', kind: 'product', unitPrice: 48000, unit: 't', note: '冰铜估算价' },
  { id: 'product-blister', name: '粗铜', kind: 'product', unitPrice: 68000, unit: 't', note: '粗铜估算价' },
  { id: 'product-smelting-slag', name: '熔炼渣', kind: 'product', unitPrice: 80, unit: 't', note: '炉渣外卖估算价' },
  { id: 'product-converting-slag', name: '吹炼渣', kind: 'product', unitPrice: 200, unit: 't', note: '吹炼渣可返炼，估算价' },
  { id: 'product-dust', name: '烟气含尘', kind: 'product', unitPrice: 2500, unit: 't', note: '烟尘含有价金属' },
  { id: 'product-converting-dust', name: '吹炼烟气含尘', kind: 'product', unitPrice: 4000, unit: 't', note: '吹炼烟尘含铜较高' },
  { id: 'product-flue-gas', name: '熔炼出炉烟气', kind: 'product', unitPrice: 0, unit: 't' },
  { id: 'product-converting-flue-gas', name: '吹炼出炉烟气', kind: 'product', unitPrice: 0, unit: 't' },
  { id: 'product-fugitive', name: '无组织排放', kind: 'product', unitPrice: 0, unit: 't' },
  { id: 'product-loss', name: '损失', kind: 'product', unitPrice: 0, unit: 't' },
]

export const COPPER_MATERIAL_PRICE_TABLE: CopperMaterialPriceEntry[] = [
  ...concentrateEntries(),
  ...solventEntries(),
  {
    id: DEFAULT_COPPER_FUEL.id,
    name: DEFAULT_COPPER_FUEL.name,
    kind: 'fuel',
    unitPrice: DEFAULT_COPPER_FUEL.unitPrice ?? 900,
    unit: 't',
    note: '来自默认燃料煤',
  },
  ...ENERGY_PRICE_ENTRIES,
  ...PRODUCT_PRICE_ENTRIES,
]

const PRICE_BY_NAME = new Map(
  COPPER_MATERIAL_PRICE_TABLE.map((entry) => [entry.name.trim(), entry] as const)
)

export function lookupCopperMaterialPrice(name: string): CopperMaterialPriceEntry | undefined {
  const key = name.trim()
  if (!key) return undefined
  return PRICE_BY_NAME.get(key)
}

export const COPPER_KIND_PRICE_LABELS: Record<CopperPriceKind, string> = {
  raw: '原料',
  solvent: '熔剂',
  fuel: '燃料',
  gas: '气体',
  energy: '能源',
  product: '产物',
}
