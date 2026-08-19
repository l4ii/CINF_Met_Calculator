import type { ReactNode } from 'react'
import type { SheetId } from '../../../../types'
import type { AntimonyProcessStageId } from '../../../../utils/antimonyProcessStageState.ts'

export type AntimonyEquipmentSheetId = Extract<
  SheetId,
  'sb_smelting_equipment' | 'sb_converting_equipment' | 'sb_refining_equipment'
>

export type AntimonyCaseStageId = Extract<
  SheetId,
  | 'sb_smelting'
  | 'sb_smelting_equipment'
  | 'sb_converting'
  | 'sb_converting_equipment'
  | 'sb_refining'
  | 'sb_refining_equipment'
  | 'sb_summary'
  | 'sb_equipment'
>

export type EquipmentStageId = 'smelting' | 'converting' | 'refining'

/** 当前 Excel 对应侧吹炉熔炼；吹炼/精炼副本保留，但不进入可见工作流。 */
export const ANTIMONY_CASE_STAGES: { id: AntimonyCaseStageId; name: string; description: ReactNode }[] = [
  {
    id: 'sb_smelting',
    name: '熔炼',
    description: (
      <>
        以锑金精矿、石灰、铁矿石、无烟煤和富氧空气为投入，完成物相、关键参数、产物约束及热平衡计算。
        <br />
        <strong>计算范围：</strong>
        产出包括熔炼渣、烟气、锑氧粉、锑锍和贵锑。
      </>
    ),
  },
  {
    id: 'sb_smelting_equipment',
    name: '熔炼设备选型',
    description: (
      <>
        承接熔炼的处理量、产物量和供氧量，计算侧吹熔炼炉面积、炉体尺寸、水套与风口参数，并生成 BOM。
        <br />
        <strong>使用条件：</strong>
        建议先完成熔炼产出计算，再从配料结果导入设备选型基础数据。
      </>
    ),
  },
  {
    id: 'sb_summary',
    name: '案例汇总',
    description: (
      <>
        汇总本案例的熔炼投入、五股产物、热平衡和熔炼设备选型结果。
        <br />
        <strong>完成度：</strong>
        以熔炼计算和熔炼设备 BOM 是否生成作为当前案例的完成依据。
      </>
    ),
  },
]

/** @deprecated 使用 ANTIMONY_CASE_STAGES；保留别名兼容旧引用。 */
export const STAGES = ANTIMONY_CASE_STAGES

export const PROCESS_STAGE_IDS: AntimonyProcessStageId[] = ['sb_smelting']

export const ANTIMONY_STAGE_SEQUENCE: AntimonyCaseStageId[] = [
  'sb_smelting',
  'sb_smelting_equipment',
  'sb_summary',
]

export const EQUIPMENT_STAGE_BY_SHEET: Record<AntimonyEquipmentSheetId, EquipmentStageId> = {
  sb_smelting_equipment: 'smelting',
  sb_converting_equipment: 'converting',
  sb_refining_equipment: 'refining',
}

const LEGACY_STAGE_FALLBACK: Partial<Record<SheetId, AntimonyCaseStageId>> = {
  sb_equipment: 'sb_summary',
  sb_converting: 'sb_smelting',
  sb_refining: 'sb_smelting',
  sb_converting_equipment: 'sb_smelting_equipment',
  sb_refining_equipment: 'sb_smelting_equipment',
}

export function isAntimonyCaseStageId(sheet: SheetId): sheet is AntimonyCaseStageId {
  return (
    ANTIMONY_CASE_STAGES.some((stage) => stage.id === sheet) ||
    Object.prototype.hasOwnProperty.call(LEGACY_STAGE_FALLBACK, sheet)
  )
}

export function normalizeAntimonyCaseStageId(sheet?: SheetId): AntimonyCaseStageId {
  if (!sheet) return 'sb_smelting'
  const legacy = LEGACY_STAGE_FALLBACK[sheet]
  if (legacy) return legacy
  return ANTIMONY_CASE_STAGES.some((stage) => stage.id === sheet)
    ? (sheet as AntimonyCaseStageId)
    : 'sb_smelting'
}

export function antimonyCaseStageName(sheet: SheetId) {
  return ANTIMONY_CASE_STAGES.find((stage) => stage.id === normalizeAntimonyCaseStageId(sheet))?.name ?? '熔炼'
}

export function nextAntimonyCaseStageId(sheet: SheetId): AntimonyCaseStageId | null {
  const id = normalizeAntimonyCaseStageId(sheet)
  const index = ANTIMONY_STAGE_SEQUENCE.indexOf(id)
  return index >= 0 ? (ANTIMONY_STAGE_SEQUENCE[index + 1] ?? null) : null
}

export function previousAntimonyCaseStageId(sheet: SheetId): AntimonyCaseStageId | null {
  const id = normalizeAntimonyCaseStageId(sheet)
  const index = ANTIMONY_STAGE_SEQUENCE.indexOf(id)
  return index > 0 ? (ANTIMONY_STAGE_SEQUENCE[index - 1] ?? null) : null
}

export function isAntimonyRefiningPlaceholderSheet(sheet: SheetId) {
  return sheet === 'sb_refining' || sheet === 'sb_refining_equipment'
}

export function equipmentStageIdForSheet(sheet: SheetId): EquipmentStageId | null {
  return sheet in EQUIPMENT_STAGE_BY_SHEET
    ? EQUIPMENT_STAGE_BY_SHEET[sheet as AntimonyEquipmentSheetId]
    : null
}

export function navigationTargetName(sheet: SheetId) {
  return sheet === 'raw_material' ? '项目工作区' : antimonyCaseStageName(sheet)
}

export function navigationActionDescription(sheet: SheetId) {
  return sheet === 'raw_material' ? '返回项目工作区' : `进入${navigationTargetName(sheet)}`
}

export function normalizeProcessStageId(_sheet: SheetId): AntimonyProcessStageId {
  return 'sb_smelting'
}

export function antimonyPageKindForSheet(
  sheet: SheetId
):
  | 'workspace'
  | 'smelting-batch'
  | 'smelting-equipment'
  | 'converting-batch'
  | 'converting-equipment'
  | 'refining-placeholder'
  | 'summary' {
  if (sheet === 'raw_material') return 'workspace'
  if (sheet === 'sb_smelting') return 'smelting-batch'
  if (sheet === 'sb_smelting_equipment') return 'smelting-equipment'
  if (sheet === 'sb_converting') return 'converting-batch'
  if (sheet === 'sb_converting_equipment') return 'converting-equipment'
  if (isAntimonyRefiningPlaceholderSheet(sheet)) return 'refining-placeholder'
  if (normalizeAntimonyCaseStageId(sheet) === 'sb_summary') return 'summary'
  return 'smelting-batch'
}
