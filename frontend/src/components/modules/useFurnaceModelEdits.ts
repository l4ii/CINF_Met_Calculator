import { useCallback, useEffect, useRef, useState } from 'react'
import type { ModelComponentOverrides } from '../../utils/modelComponentManifest.ts'
import { readModelGeometryOverrides, writeModelGeometryOverrides, subscribeModelGeometryOverrides, type ModelGeometryKind } from '../../utils/modelGeometryOverrides.ts'
import { startModelHistory, recordModelEdit, stepModelHistory, type ModelEditHistory } from '../../utils/modelEditHistory.ts'

/** Save each complete edit atomically, including undo/redo, so mounted overviews see the same result. */
export function useFurnaceModelEdits(model: ModelGeometryKind, scopeKey: string, readOnly: boolean) {
  const [history, setHistory] = useState(() => startModelHistory(readModelGeometryOverrides(model, scopeKey).components ?? {}))
  const [storageError, setStorageError] = useState<string | null>(null)
  const current = useRef(history)
  const ownWrite = useRef(false)
  useEffect(() => {
    const reload = () => {
      current.current = startModelHistory(readModelGeometryOverrides(model, scopeKey).components ?? {})
      setHistory(current.current)
      setStorageError(null)
    }
    reload()
    return subscribeModelGeometryOverrides((changedModel, changedScope) => {
      if (!ownWrite.current && model === changedModel && changedScope === (scopeKey.trim() || 'default')) reload()
    })
  }, [model, scopeKey])
  const persist = useCallback((next: ModelEditHistory) => {
    if (readOnly || next === current.current) return
    ownWrite.current = true
    let saved = false
    try { saved = writeModelGeometryOverrides(model, { components: next.present.overrides }, scopeKey) }
    finally { ownWrite.current = false }
    if (saved) {
      current.current = next
      setHistory(next)
      setStorageError(null)
    } else {
      // Rebuild the saved geometry if a dragged object already moved on screen.
      setHistory({ ...current.current, present: { ...current.current.present, overrides: { ...current.current.present.overrides } } })
      setStorageError('保存失败，已恢复上次保存的模型。请检查存储空间后重试。')
    }
  }, [model, scopeKey, readOnly])
  const save = useCallback((next: ModelComponentOverrides, label = '调整构件') => persist(recordModelEdit(current.current, next, label)), [persist])
  const reset = useCallback(() => save({}, '恢复全部计算值'), [save])
  const undo = useCallback(() => persist(stepModelHistory(current.current, 'undo')), [persist])
  const redo = useCallback(() => persist(stepModelHistory(current.current, 'redo')), [persist])
  return {
    overrides: history.present.overrides, save, reset, storageError,
    historyControls: { undo, redo, canUndo: history.past.length > 0, canRedo: history.future.length > 0, undoLabel: history.present.label, redoLabel: history.future[0]?.label ?? '', recent: [...history.past.slice(1), history.present].slice(-5).map(item => item.label) },
  }
}
