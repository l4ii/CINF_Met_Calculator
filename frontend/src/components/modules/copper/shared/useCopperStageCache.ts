import { useCallback, useRef } from 'react'
import type {
  CopperCaseProcessStages,
  CopperProcessStageId,
  CopperProcessStageState,
} from '../../../../utils/copperProcessStageState.ts'
import { createProcessStageStateForId, syncWhiteMatteFromSmelting } from '../../../../utils/copperConvertingFeed.ts'

/**
 * 工序状态缓存：熔炼 / 吹炼 / 精炼彼此隔离；切页时持久化当前工序再加载目标工序。
 * 吹炼切入时从熔炼快照同步白铜锍。
 */
export function useCopperStageCache() {
  const processStagesCacheRef = useRef<CopperCaseProcessStages>({})
  const loadedProcessStageIdRef = useRef<CopperProcessStageId | null>(null)

  const getCache = useCallback(() => processStagesCacheRef.current, [])

  const setCache = useCallback((next: CopperCaseProcessStages) => {
    processStagesCacheRef.current = next
  }, [])

  const persistStage = useCallback((stageId: CopperProcessStageId, state: CopperProcessStageState) => {
    processStagesCacheRef.current = {
      ...processStagesCacheRef.current,
      [stageId]: state,
    }
    loadedProcessStageIdRef.current = stageId
  }, [])

  const readStage = useCallback((stageId: CopperProcessStageId): CopperProcessStageState | null => {
    return processStagesCacheRef.current[stageId] ?? null
  }, [])

  const resolveStageForLoad = useCallback(
    (from: CopperProcessStageId | null, to: CopperProcessStageId): CopperProcessStageState => {
      const cached = processStagesCacheRef.current[to]
      let next = cached ?? createProcessStageStateForId(to)
      if (to === 'cu_converting') {
        const smelting = processStagesCacheRef.current.cu_smelting
        next = syncWhiteMatteFromSmelting(next, smelting)
      }
      if (from && from !== to && loadedProcessStageIdRef.current === from) {
        // caller should persist `from` before calling
      }
      loadedProcessStageIdRef.current = to
      processStagesCacheRef.current = {
        ...processStagesCacheRef.current,
        [to]: next,
      }
      return next
    },
    []
  )

  const clearCache = useCallback(() => {
    processStagesCacheRef.current = {}
    loadedProcessStageIdRef.current = null
  }, [])

  return {
    processStagesCacheRef,
    loadedProcessStageIdRef,
    getCache,
    setCache,
    persistStage,
    readStage,
    resolveStageForLoad,
    clearCache,
  }
}
