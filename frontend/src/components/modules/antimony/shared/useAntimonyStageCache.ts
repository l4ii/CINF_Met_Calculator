import { useCallback, useRef } from 'react'
import type {
  AntimonyCaseProcessStages,
  AntimonyProcessStageId,
  AntimonyProcessStageState,
} from '../../../../utils/antimonyProcessStageState.ts'
import { createProcessStageStateForId, syncWhiteMatteFromSmelting } from '../../../../utils/antimonyConvertingFeed.ts'

/**
 * 工序状态缓存：熔炼 / 吹炼 / 精炼彼此隔离；切页时持久化当前工序再加载目标工序。
 * 吹炼切入时从熔炼快照同步锑锍。
 */
export function useAntimonyStageCache() {
  const processStagesCacheRef = useRef<AntimonyCaseProcessStages>({})
  const loadedProcessStageIdRef = useRef<AntimonyProcessStageId | null>(null)

  const getCache = useCallback(() => processStagesCacheRef.current, [])

  const setCache = useCallback((next: AntimonyCaseProcessStages) => {
    processStagesCacheRef.current = next
  }, [])

  const persistStage = useCallback((stageId: AntimonyProcessStageId, state: AntimonyProcessStageState) => {
    processStagesCacheRef.current = {
      ...processStagesCacheRef.current,
      [stageId]: state,
    }
    loadedProcessStageIdRef.current = stageId
  }, [])

  const readStage = useCallback((stageId: AntimonyProcessStageId): AntimonyProcessStageState | null => {
    return processStagesCacheRef.current[stageId] ?? null
  }, [])

  const resolveStageForLoad = useCallback(
    (from: AntimonyProcessStageId | null, to: AntimonyProcessStageId): AntimonyProcessStageState => {
      const cached = processStagesCacheRef.current[to]
      let next = cached ?? createProcessStageStateForId(to)
      if (to === 'sb_converting') {
        const smelting = processStagesCacheRef.current.sb_smelting
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
