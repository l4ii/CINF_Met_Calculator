import type {
  AntimonyCaseProcessStages,
  AntimonyProcessStageId,
  AntimonyProcessStageState,
} from '../../../../utils/antimonyProcessStageState.ts'

/** 模块级工序缓存：各页面组件卸载后仍保留熔炼/吹炼快照与当前案例身份 */
const store: {
  processStages: AntimonyCaseProcessStages
  loadedProcessStageId: AntimonyProcessStageId | null
  activeCaseId: string | null
  /** 用于区分「真切换冶炼方法」与「一页一文件 remount」 */
  lastNormalizedSmeltMethodId: string | null
} = {
  processStages: {},
  loadedProcessStageId: null,
  activeCaseId: null,
  lastNormalizedSmeltMethodId: null,
}

export function getAntimonyProcessStagesCache(): AntimonyCaseProcessStages {
  return store.processStages
}

export function setAntimonyProcessStagesCache(next: AntimonyCaseProcessStages) {
  store.processStages = next
}

export function persistAntimonyProcessStage(stageId: AntimonyProcessStageId, state: AntimonyProcessStageState) {
  store.processStages = { ...store.processStages, [stageId]: state }
  store.loadedProcessStageId = stageId
}

export function readAntimonyProcessStage(stageId: AntimonyProcessStageId): AntimonyProcessStageState | null {
  return store.processStages[stageId] ?? null
}

export function getLoadedAntimonyProcessStageId(): AntimonyProcessStageId | null {
  return store.loadedProcessStageId
}

export function setLoadedAntimonyProcessStageId(stageId: AntimonyProcessStageId | null) {
  store.loadedProcessStageId = stageId
}

export function getActiveAntimonyCaseId(): string | null {
  return store.activeCaseId
}

export function setActiveAntimonyCaseId(id: string | null) {
  store.activeCaseId = id
}

export function getLastNormalizedSmeltMethodId(): string | null {
  return store.lastNormalizedSmeltMethodId
}

export function setLastNormalizedSmeltMethodId(id: string | null) {
  store.lastNormalizedSmeltMethodId = id
}

export function clearAntimonyProcessStagesCache() {
  store.processStages = {}
  store.loadedProcessStageId = null
  store.activeCaseId = null
}
