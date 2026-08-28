import type {
  CopperCaseProcessStages,
  CopperProcessStageId,
  CopperProcessStageState,
} from '../../../../utils/copperProcessStageState.ts'

const store: {
  processStages: CopperCaseProcessStages
  loadedProcessStageId: CopperProcessStageId | null
  activeCaseId: string | null
  lastNormalizedSmeltMethodId: string | null
} = {
  processStages: {},
  loadedProcessStageId: null,
  activeCaseId: null,
  lastNormalizedSmeltMethodId: null,
}

export function getCopperProcessStagesCache() { return store.processStages }
export function setCopperProcessStagesCache(next: CopperCaseProcessStages) { store.processStages = next }
export function persistCopperProcessStage(stageId: CopperProcessStageId, state: CopperProcessStageState) {
  store.processStages = { ...store.processStages, [stageId]: state }
  store.loadedProcessStageId = stageId
}
export function readCopperProcessStage(stageId: CopperProcessStageId) { return store.processStages[stageId] ?? null }
export function getLoadedCopperProcessStageId() { return store.loadedProcessStageId }
export function setLoadedCopperProcessStageId(stageId: CopperProcessStageId | null) { store.loadedProcessStageId = stageId }
export function getActiveCopperCaseId() { return store.activeCaseId }
export function setActiveCopperCaseId(id: string | null) { store.activeCaseId = id }
export function getLastNormalizedSmeltMethodId() { return store.lastNormalizedSmeltMethodId }
export function setLastNormalizedSmeltMethodId(id: string | null) { store.lastNormalizedSmeltMethodId = id }
export function clearCopperProcessStagesCache() {
  store.processStages = {}
  store.loadedProcessStageId = null
  store.activeCaseId = null
}
