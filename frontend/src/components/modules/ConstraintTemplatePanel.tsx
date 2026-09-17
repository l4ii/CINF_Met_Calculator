import { useEffect, useRef, useState } from 'react'
import { btnSecondary } from '../../theme/uiTheme.ts'
import type { ConstraintTemplate } from '../../utils/copperConstraintTemplates.ts'
import { copyTextToClipboard } from './BatchTableNumericCell.tsx'

type ConstraintTemplatePanelProps = {
  darkMode: boolean
  templates: ConstraintTemplate[]
  /** 该表达式是否已在当前约束表中 */
  isUsed: (expr: string) => boolean
  /** 把模板填入「新增约束」那一行 */
  onFill: (template: ConstraintTemplate) => void
}

/** 常用约束模板：可整条复制，也可直接填入新增行后改目标值 */
export default function ConstraintTemplatePanel({
  darkMode,
  templates,
  isUsed,
  onFill,
}: ConstraintTemplatePanelProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [open])

  useEffect(() => {
    if (!copiedId) return
    const timer = window.setTimeout(() => setCopiedId(null), 1800)
    return () => window.clearTimeout(timer)
  }, [copiedId])

  const copy = (template: ConstraintTemplate) => {
    void copyTextToClipboard(template.expr)
      .then(() => setCopiedId(template.id))
      .catch(() => setCopiedId(null))
  }

  const border = darkMode ? 'border-gray-600' : 'border-gray-200'
  const surface = darkMode ? 'bg-gray-800 text-gray-100' : 'bg-white text-gray-900'
  const muted = darkMode ? 'text-gray-400' : 'text-gray-500'
  const rowBorder = darkMode ? 'border-gray-700' : 'border-gray-100'
  const linkButton = `text-xs underline-offset-2 hover:underline ${
    darkMode ? 'text-blue-300' : 'text-blue-600'
  }`

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        className={btnSecondary(darkMode)}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        约束模板
      </button>
      {open && (
        <div
          className={`absolute right-0 top-full z-40 mt-1 w-[min(38rem,80vw)] overflow-hidden rounded-lg border shadow-xl ${border} ${surface}`}
        >
          <div className={`border-b px-3 py-2 text-xs ${rowBorder} ${muted}`}>
            以下为各工序默认配置中已发布的约束式，求解器均已支持。复制后可直接粘到表达式格，或填入新增行再改目标值。
          </div>
          <ul className="max-h-80 overflow-auto">
            {templates.map((template) => {
              const used = isUsed(template.expr)
              return (
                <li key={template.id} className={`border-b px-3 py-2 last:border-b-0 ${rowBorder}`}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-sm font-semibold">
                      {template.name}
                      {template.soft && <span className={`ml-1 text-xs ${muted}`}>（soft，仅作初值）</span>}
                    </span>
                    <span className="flex items-center gap-3">
                      <span className={`text-xs ${muted}`}>默认目标 {template.target}</span>
                      <button type="button" className={linkButton} onClick={() => copy(template)}>
                        {copiedId === template.id ? '已复制' : '复制'}
                      </button>
                      <button
                        type="button"
                        className={linkButton}
                        onClick={() => {
                          onFill(template)
                          setOpen(false)
                        }}
                      >
                        填入新增行
                      </button>
                    </span>
                  </div>
                  <div className="mt-1 break-all font-mono text-xs">{template.expr}</div>
                  <div className={`mt-1 text-xs ${muted}`}>
                    {used && <span className="mr-1">当前表中已有该约束。</span>}
                    {template.description}
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
