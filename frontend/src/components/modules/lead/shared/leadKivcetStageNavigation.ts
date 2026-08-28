import type { SheetId } from '../../../../types.ts'
import { copperPageKindForSheet, type CopperCaseStageId } from '../../copper/shared/copperStageNavigation.tsx'

export type LeadKivcetStageId = Extract<
  SheetId,
  | 'pb_kivcet_smelting'
  | 'pb_kivcet_smelting_equipment'
  | 'pb_kivcet_converting'
  | 'pb_kivcet_converting_equipment'
  | 'pb_kivcet_summary'
>

export type LeadKivcetPageKind =
  | 'workspace'
  | 'smelting-batch'
  | 'smelting-equipment'
  | 'converting-batch'
  | 'converting-equipment'
  | 'summary'

export const LEAD_KIVCET_STAGE_SEQUENCE: LeadKivcetStageId[] = [
  'pb_kivcet_smelting',
  'pb_kivcet_smelting_equipment',
  'pb_kivcet_converting',
  'pb_kivcet_converting_equipment',
  'pb_kivcet_summary',
]

export function isLeadKivcetStageId(sheet: SheetId): sheet is LeadKivcetStageId {
  return LEAD_KIVCET_STAGE_SEQUENCE.includes(sheet as LeadKivcetStageId)
}

export function leadKivcetPageKindForSheet(sheet: SheetId): LeadKivcetPageKind {
  if (sheet === 'raw_material') return 'workspace'
  if (sheet === 'pb_kivcet_smelting') return 'smelting-batch'
  if (sheet === 'pb_kivcet_smelting_equipment') return 'smelting-equipment'
  if (sheet === 'pb_kivcet_converting') return 'converting-batch'
  if (sheet === 'pb_kivcet_converting_equipment') return 'converting-equipment'
  return 'summary'
}

export function leadToCopperSheet(sheet: SheetId): SheetId {
  switch (sheet) {
    case 'pb_kivcet_smelting': return 'cu_smelting'
    case 'pb_kivcet_smelting_equipment': return 'cu_smelting_equipment'
    case 'pb_kivcet_converting': return 'cu_converting'
    case 'pb_kivcet_converting_equipment': return 'cu_converting_equipment'
    case 'pb_kivcet_summary': return 'cu_summary'
    default: return sheet
  }
}

export function copperToLeadSheet(sheet: SheetId): SheetId {
  switch (sheet as CopperCaseStageId) {
    case 'cu_smelting': return 'pb_kivcet_smelting'
    case 'cu_smelting_equipment': return 'pb_kivcet_smelting_equipment'
    case 'cu_converting': return 'pb_kivcet_converting'
    case 'cu_converting_equipment': return 'pb_kivcet_converting_equipment'
    case 'cu_summary': return 'pb_kivcet_summary'
    default: return sheet
  }
}

export function nextLeadKivcetStageId(sheet: SheetId): LeadKivcetStageId | null {
  const index = LEAD_KIVCET_STAGE_SEQUENCE.indexOf(sheet as LeadKivcetStageId)
  return index >= 0 ? LEAD_KIVCET_STAGE_SEQUENCE[index + 1] ?? null : 'pb_kivcet_smelting'
}

export function previousLeadKivcetStageId(sheet: SheetId): LeadKivcetStageId | null {
  const index = LEAD_KIVCET_STAGE_SEQUENCE.indexOf(sheet as LeadKivcetStageId)
  return index > 0 ? LEAD_KIVCET_STAGE_SEQUENCE[index - 1] ?? null : null
}

export function copperPageKindForLeadSheet(sheet: SheetId) {
  return copperPageKindForSheet(leadToCopperSheet(sheet))
}
