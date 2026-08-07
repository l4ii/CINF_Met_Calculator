import type {
  CopperCaseProcessStages,
  CopperProcessStageId,
  CopperProcessStageState,
} from '../../../../utils/copperProcessStageState.ts'

/** 模块级工序缓存：各页面组件卸载后仍保留熔炼/吹炼快照与当前案例身份 */
const store: {
  processStages: CopperCaseProcessStages
  loadedProcessStageId: CopperProcessStageId | null
  activeCaseId: string | null
  /** 用于区分「真切换冶炼方法」与「一页一文件 remount」 */
  lastNormalizedSmeltMethodId: string | null
} = {
  processStages: {},
  loadedProcessStageId: null,
  activeCaseId: null,
  lastNormalizedSmeltMethodId: null,
}

export function getCopperProcessStagesCache(): CopperCaseProcessStages {
  return store.processStages
}

export function setCopperProcessStagesCache(next: CopperCaseProcessStages) {
  store.processStages = next
}

export function persistCopperProcessStage(stageId: CopperProcessStageId, state: CopperProcessStageState) {
  store.processStages = { ...store.processStages, [stageId]: state }
  store.loadedProcessStageId = stageId
}

export function readCopperProcessStage(stageId: CopperProcessStageId): CopperProcessStageState | null {
  return store.processStages[stageId] ?? null
}

export function getLoadedCopperProcessStageId(): CopperProcessStageId | null {
  return store.loadedProcessStageId
}

export function setLoadedCopperProcessStageId(stageId: CopperProcessStageId | null) {
  store.loadedProcessStageId = stageId
}

export function getActiveCopperCaseId(): string | null {
  return store.activeCaseId
}

export function setActiveCopperCaseId(id: string | null) {
  store.activeCaseId = id
}

export function getLastNormalizedSmeltMethodId(): string | null {
  return store.lastNormalizedSmeltMethodId
}

export function setLastNormalizedSmeltMethodId(id: string | null) {
  store.lastNormalizedSmeltMethodId = id
}

export function clearCopperProcessStagesCache() {
  store.processStages = {}
  store.loadedProcessStageId = null
  store.activeCaseId = null
}
