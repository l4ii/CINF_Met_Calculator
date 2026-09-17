import type { SmeltingFurnaceDesignResult } from './copperEquipmentSizing.ts'

export type EquipmentBomPricingMode = 'separate' | 'included' | 'interface'

export interface EquipmentBomItem {
  id: string
  name: string
  specification: string
  quantity: number
  unit: string
  material: string
  note: string
  group?: string
  pricingMode?: EquipmentBomPricingMode
  source?: string
}

export const EQUIPMENT_BOM_PRICING_LABELS: Record<EquipmentBomPricingMode, string> = {
  separate: '单独计价',
  included: '含在炉体报价',
  interface: '接口预留',
}

/** Component quantities are a breakdown of the furnace package, not extra purchases. */
export function enrichCopperEquipmentBom(
  items: EquipmentBomItem[],
  stageId: string,
  design?: Pick<SmeltingFurnaceDesignResult, 'jacketCountTotal' | 'jacketCountOneSide' | 'jacketPitchMm'> | null,
): EquipmentBomItem[] {
  if (!items.length) return []
  const enriched = items.map((item): EquipmentBomItem => {
    const kind = item.id.slice(stageId.length + 1)
    const included = kind === 'tuyere' || kind === 'jacket'
    return {
      ...item,
      group: item.group ?? (kind === 'feed' ? '加料及供风' : kind === 'offgas' ? '烟气系统' : kind === 'tap' ? '排放系统' : '炉体及冷却'),
      pricingMode: item.pricingMode ?? (kind === 'offgas' ? 'interface' : included ? 'included' : 'separate'),
      source: item.source ?? (kind === 'furnace' ? (design ? '选型计算' : '规模估算') : design && included ? '选型计算' : '配套配置'),
    }
  })
  if (design && Number.isFinite(design.jacketCountTotal) && design.jacketCountTotal > 0 &&
      !enriched.some((item) => item.id === `${stageId}-jacket`)) {
    const furnaceIndex = enriched.findIndex((item) => item.id === `${stageId}-furnace`)
    if (furnaceIndex >= 0) enriched.splice(furnaceIndex + 1, 0, {
      id: `${stageId}-jacket`,
      name: '炉体冷却水套',
      specification: `水套间隔 ${design.jacketPitchMm} mm；单侧 ${design.jacketCountOneSide} 块`,
      quantity: design.jacketCountTotal,
      unit: '块',
      material: '水冷构件（材质待确认）',
      group: '炉体及冷却',
      pricingMode: 'included',
      source: '选型计算',
      note: '双侧水套数量；默认包含在炉体成套报价中，拆分采购时再单独计价',
    })
  }
  return enriched
}

/** Old cases have no snapshots; malformed imported rows must not reach costing. */
export function normalizeEquipmentBomSnapshots(value: unknown): Record<string, EquipmentBomItem[]> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const snapshots: Record<string, EquipmentBomItem[]> = {}
  for (const stageId of ['smelting', 'converting', 'refining']) {
    const rows = (value as Record<string, unknown>)[stageId]
    if (!Array.isArray(rows)) continue
    const ids = new Set<string>()
    snapshots[stageId] = rows.flatMap((candidate): EquipmentBomItem[] => {
      if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return []
      const row = candidate as Record<string, unknown>
      const id = typeof row.id === 'string' ? row.id.trim() : ''
      const name = typeof row.name === 'string' ? row.name.trim() : ''
      if (!id || !name || ids.has(id) || typeof row.quantity !== 'number' ||
          !Number.isFinite(row.quantity) || row.quantity < 0) return []
      ids.add(id)
      return [{
        id, name, quantity: row.quantity,
        specification: typeof row.specification === 'string' ? row.specification : '',
        unit: typeof row.unit === 'string' ? row.unit : '',
        material: typeof row.material === 'string' ? row.material : '',
        note: typeof row.note === 'string' ? row.note : '',
        ...(typeof row.group === 'string' ? { group: row.group } : {}),
        ...(typeof row.source === 'string' ? { source: row.source } : {}),
        ...(row.pricingMode === 'separate' || row.pricingMode === 'included' || row.pricingMode === 'interface'
          ? { pricingMode: row.pricingMode } : {}),
      }]
    })
  }
  return snapshots
}
