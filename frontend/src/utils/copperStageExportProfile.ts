export type CopperExportStageId = 'cu_smelting' | 'cu_converting'

export type CopperStageExportProfile = {
  includeInputSummary: boolean
  includeBlendResult: boolean
  includeFuel: boolean
}

const SMELTING_EXPORT_PROFILE: CopperStageExportProfile = {
  includeInputSummary: true,
  includeBlendResult: true,
  includeFuel: true,
}

const CONVERTING_EXPORT_PROFILE: CopperStageExportProfile = {
  includeInputSummary: false,
  includeBlendResult: false,
  includeFuel: false,
}

export function copperStageExportProfile(stageId: CopperExportStageId | string): CopperStageExportProfile {
  return stageId === 'cu_converting' ? CONVERTING_EXPORT_PROFILE : SMELTING_EXPORT_PROFILE
}

export function copperStageExportSheetKeys<T extends string>(
  stageId: CopperExportStageId | string,
  sheetKeys: readonly T[]
): T[] {
  const profile = copperStageExportProfile(stageId)
  return profile.includeBlendResult ? [...sheetKeys] : sheetKeys.filter((key) => key !== 'blendResult')
}
