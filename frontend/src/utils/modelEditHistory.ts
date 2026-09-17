import type { ModelComponentOverrides } from './modelComponentManifest.ts'

export type ModelEdit = { overrides: ModelComponentOverrides; label: string }
export type ModelEditHistory = { past: ModelEdit[]; present: ModelEdit; future: ModelEdit[] }
export function startModelHistory(overrides: ModelComponentOverrides): ModelEditHistory {
  return { past: [], present: { overrides, label: '初始模型' }, future: [] }
}
export function recordModelEdit(history: ModelEditHistory, overrides: ModelComponentOverrides, label: string): ModelEditHistory {
  if (JSON.stringify(history.present.overrides) === JSON.stringify(overrides)) return history
  return { past: [...history.past.slice(-49), history.present], present: { overrides, label }, future: [] }
}
export function stepModelHistory(history: ModelEditHistory, direction: 'undo' | 'redo'): ModelEditHistory {
  if (direction === 'undo') {
    if (!history.past.length) return history
    return { past: history.past.slice(0, -1), present: history.past[history.past.length - 1], future: [history.present, ...history.future] }
  }
  if (!history.future.length) return history
  return { past: [...history.past, history.present], present: history.future[0], future: history.future.slice(1) }
}
