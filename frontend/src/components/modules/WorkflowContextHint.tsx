/** 非阻断式上下文提示，显示在页面浮层，不改变表格/按钮布局 */
export function WorkflowContextFloatingHint({
  darkMode,
  hint,
  stacked = false,
}: {
  darkMode: boolean
  hint: BatchContextHint | null | undefined
  stacked?: boolean
}) {
  if (!hint) return null

  const tone = hint.tone ?? 'flow'
  const panelClass =
    tone === 'warning'
      ? darkMode
        ? 'border-amber-500 bg-gray-900/92 text-amber-100 shadow-black/35'
        : 'border-amber-300 bg-white/95 text-amber-900 shadow-gray-950/10'
      : darkMode
        ? 'border-gray-600 bg-gray-900/92 text-gray-100 shadow-black/35'
        : 'border-gray-200 bg-white/95 text-gray-900 shadow-gray-950/10'
  const titleClass =
    tone === 'warning'
      ? darkMode
        ? 'text-amber-300'
        : 'text-amber-700'
      : darkMode
        ? 'text-gray-400'
        : 'text-gray-500'
  const title = hint.title ?? (tone === 'warning' ? '闭合提示' : '下一步')

  return (
    <div
      className={`pointer-events-none fixed right-4 z-50 flex w-[min(28rem,calc(100vw-2rem))] justify-end ${
        stacked ? 'top-24' : 'top-4'
      }`}
    >
      <div
        className={`w-full rounded-lg border px-4 py-3 text-sm shadow-xl backdrop-blur ${panelClass}`}
        role="status"
      >
        <div className={`mb-1 text-xs font-medium ${titleClass}`}>{title}</div>
        <div className="leading-relaxed">{hint.message}</div>
      </div>
    </div>
  )
}

/** @deprecated 流程提示已改为浮层显示，保留导出避免旧引用中断。 */
export function WorkflowContextHint({
  darkMode,
  message,
}: {
  darkMode: boolean
  message: string
}) {
  return (
    <span
      className={`sr-only ${
        darkMode ? 'text-blue-300' : 'text-blue-700'
      }`}
      role="status"
    >
      {message}
    </span>
  )
}

export type BatchContextHint =
  | BatchContextHintPayload<'rawName', { materialId: string }>
  | BatchContextHintPayload<'rawWeight', { materialId: string }>
  | BatchContextHintPayload<'rawPhaseOC', { materialId: string; element: 'O(氧)' | 'C (碳)' }>
  | BatchContextHintPayload<'phaseClosure', { materialId: string }>
  | BatchContextHintPayload<'parametersTab'>
  | BatchContextHintPayload<'phaseCalculate'>

type BatchContextHintPayload<
  Anchor extends string,
  Extra extends Record<string, unknown> = Record<string, never>,
> = Extra & {
  anchor: Anchor
  message: string
  title?: string
  tone?: 'flow' | 'warning'
}
