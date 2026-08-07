import type { ReactNode } from 'react'
import type { SheetId } from '../../../../types'
import type { CopperProcessStageId } from '../../../../utils/copperProcessStageState.ts'

export type CopperEquipmentSheetId = Extract<
  SheetId,
  'cu_smelting_equipment' | 'cu_converting_equipment' | 'cu_refining_equipment'
>

export type CopperCaseStageId = Extract<
  SheetId,
  | 'cu_smelting'
  | 'cu_smelting_equipment'
  | 'cu_converting'
  | 'cu_converting_equipment'
  | 'cu_refining'
  | 'cu_refining_equipment'
  | 'cu_summary'
  | 'cu_equipment'
>

export type EquipmentStageId = 'smelting' | 'converting' | 'refining'

export const COPPER_CASE_STAGES: { id: CopperCaseStageId; name: string; description: ReactNode }[] = [
  {
    id: 'cu_smelting',
    name: '熔炼',
    description: (
      <>
        通过熔炼 → 设备选型 → 吹炼 → 设备选型 → 精炼 → 设备选型 → 案例汇总的标准化工作流，完成铜冶炼全过程配料与工艺计算。
        <br />
        <strong>熔炼阶段：</strong>
        作为工艺起点，在此配置入炉原料配比与热平衡参数，确立后续吹炼工序的基础物料模型。
      </>
    ),
  },
  {
    id: 'cu_smelting_equipment',
    name: '熔炼设备选型',
    description: (
      <>
        完成熔炼页计算后，在本页按单日处理量、床能力与炉型参数完成侧吹熔炼炉选型，并生成三维方案与 BOM。
        <br />
        <strong>安检要求：</strong>
        确认熔炼物料、产出与热平衡已完成，再进入吹炼阶段（白铜锍将自动带入）；亦可在设备选型完成后进入案例汇总。
      </>
    ),
  },
  {
    id: 'cu_converting',
    name: '吹炼',
    description: (
      <>
        通过熔炼 → 设备选型 → 吹炼 → 设备选型 → 精炼 → 设备选型 → 案例汇总的标准化工作流，完成铜冶炼全过程配料与工艺计算。
        <br />
        <strong>吹炼阶段：</strong>
        自动承接熔炼白铜锍，重点调整吹炼造渣与 Fe/S 去除，生成粗铜、吹炼渣和烟气等结果，为精炼提供中间产物数据。
      </>
    ),
  },
  {
    id: 'cu_converting_equipment',
    name: '吹炼设备选型',
    description: (
      <>
        完成吹炼页计算后，在本页核对吹炼炉选型基础、目标规模、调整系数和建议台数。
        <br />
        <strong>安检要求：</strong>
        确认吹炼计算结果与炉型选型参数后，可进入案例汇总（精炼模块待开发）。
      </>
    ),
  },
  {
    id: 'cu_refining',
    name: '精炼',
    description: (
      <>
        精炼工序模块当前待开发，暂不提供配料与热平衡计算。
        <br />
        <strong>说明：</strong>
        可先完成熔炼/吹炼及对应设备选型，再从任意设备选型页进入案例汇总查看已完成结果。
      </>
    ),
  },
  {
    id: 'cu_refining_equipment',
    name: '精炼设备选型',
    description: (
      <>
        精炼设备选型模块当前待开发，暂不提供炉型选型与 BOM 生成。
        <br />
        <strong>说明：</strong>
        可从熔炼或吹炼设备选型页直接进入案例汇总，复核已完成工序与设备结果。
      </>
    ),
  },
  {
    id: 'cu_summary',
    name: '案例汇总',
    description: (
      <>
        自上而下为总览与熔炼、吹炼、精炼分区；总览展示三连体工艺岛，各工序默认折叠，展开后核对计算表与设备结果。
        <br />
        <strong>案例总览：</strong>
        流程完成度按熔炼 / 吹炼 / 精炼各工序设备选型 BOM 是否已生成统计；精炼模块待开发不影响已完成段查看。
      </>
    ),
  },
]

/** @deprecated 使用 COPPER_CASE_STAGES；保留别名兼容旧引用 */
export const STAGES = COPPER_CASE_STAGES

export const PROCESS_STAGE_IDS: CopperProcessStageId[] = ['cu_smelting', 'cu_converting', 'cu_refining']

export const COPPER_STAGE_SEQUENCE: CopperCaseStageId[] = [
  'cu_smelting',
  'cu_smelting_equipment',
  'cu_converting',
  'cu_converting_equipment',
  'cu_refining',
  'cu_refining_equipment',
  'cu_summary',
]

export const EQUIPMENT_STAGE_BY_SHEET: Record<CopperEquipmentSheetId, EquipmentStageId> = {
  cu_smelting_equipment: 'smelting',
  cu_converting_equipment: 'converting',
  cu_refining_equipment: 'refining',
}

export function isCopperCaseStageId(sheet: SheetId): sheet is CopperCaseStageId {
  return sheet === 'cu_equipment' || COPPER_CASE_STAGES.some((stage) => stage.id === sheet)
}

export function normalizeCopperCaseStageId(sheet?: SheetId): CopperCaseStageId {
  if (sheet === 'cu_equipment') return 'cu_summary'
  return sheet && COPPER_CASE_STAGES.some((stage) => stage.id === sheet)
    ? (sheet as CopperCaseStageId)
    : 'cu_smelting'
}

export function copperCaseStageName(sheet: SheetId) {
  return COPPER_CASE_STAGES.find((stage) => stage.id === normalizeCopperCaseStageId(sheet))?.name ?? '熔炼'
}

export function nextCopperCaseStageId(sheet: SheetId): CopperCaseStageId | null {
  const id = normalizeCopperCaseStageId(sheet)
  if (id === 'cu_converting_equipment') return 'cu_summary'
  if (id === 'cu_refining' || id === 'cu_refining_equipment') return 'cu_summary'
  const index = COPPER_STAGE_SEQUENCE.indexOf(id)
  return index >= 0 ? (COPPER_STAGE_SEQUENCE[index + 1] ?? null) : null
}

export function previousCopperCaseStageId(sheet: SheetId): CopperCaseStageId | null {
  const id = normalizeCopperCaseStageId(sheet)
  if (id === 'cu_summary') return 'cu_converting_equipment'
  if (id === 'cu_refining' || id === 'cu_refining_equipment') return 'cu_converting_equipment'
  const index = COPPER_STAGE_SEQUENCE.indexOf(id)
  return index > 0 ? (COPPER_STAGE_SEQUENCE[index - 1] ?? null) : null
}

export function isCopperRefiningPlaceholderSheet(sheet: SheetId) {
  return sheet === 'cu_refining' || sheet === 'cu_refining_equipment'
}

export function equipmentStageIdForSheet(sheet: SheetId): EquipmentStageId | null {
  return sheet in EQUIPMENT_STAGE_BY_SHEET
    ? EQUIPMENT_STAGE_BY_SHEET[sheet as CopperEquipmentSheetId]
    : null
}

export function navigationTargetName(sheet: SheetId) {
  return sheet === 'raw_material' ? '项目工作区' : copperCaseStageName(sheet)
}

export function navigationActionDescription(sheet: SheetId) {
  return sheet === 'raw_material' ? '返回项目工作区' : `进入${navigationTargetName(sheet)}`
}

export function normalizeProcessStageId(sheet: SheetId): CopperProcessStageId {
  return PROCESS_STAGE_IDS.includes(sheet as CopperProcessStageId)
    ? (sheet as CopperProcessStageId)
    : 'cu_smelting'
}

export function copperPageKindForSheet(
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
  if (sheet === 'cu_smelting') return 'smelting-batch'
  if (sheet === 'cu_smelting_equipment') return 'smelting-equipment'
  if (sheet === 'cu_converting') return 'converting-batch'
  if (sheet === 'cu_converting_equipment') return 'converting-equipment'
  if (isCopperRefiningPlaceholderSheet(sheet)) return 'refining-placeholder'
  if (normalizeCopperCaseStageId(sheet) === 'cu_summary') return 'summary'
  return 'smelting-batch'
}
