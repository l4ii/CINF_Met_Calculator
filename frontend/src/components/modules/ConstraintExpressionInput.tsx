import { useEffect, useMemo, useRef, useState } from 'react'
import {
  applyConstraintCompletion,
  resolveConstraintCompletions,
  type ConstraintSuggestion,
  type ConstraintSuggestionScope,
} from '../../utils/copperConstraintSuggestions.ts'

const KIND_BADGE: Record<ConstraintSuggestion['kind'], string> = {
  scope: '作用域',
  input: '投入',
  product: '产物',
  phase: '物相',
  element: '元素',
  variable: '变量',
  constant: '常量',
}

type ConstraintExpressionInputProps = {
  darkMode: boolean
  value: string
  scope: ConstraintSuggestionScope
  className?: string
  title?: string
  ariaLabel?: string
  placeholder?: string
  /** 获得焦点时全选，沿用原有输入框行为 */
  selectOnFocus?: boolean
  onChange: (value: string) => void
  onFocus?: () => void
  /** 失焦提交，沿用原有 commitCustomExprDraft 语义 */
  onCommit?: () => void
}

/**
 * 自定义约束表达式输入框：在原生 input 上叠一层路径补全。
 *
 * 只做补全，不改数据流——取值、提交、语法红框仍由调用方控制，
 * 这样已有的 draft / commit / 校验逻辑保持不变。
 */
export default function ConstraintExpressionInput({
  darkMode,
  value,
  scope,
  className,
  title,
  ariaLabel,
  placeholder,
  selectOnFocus = false,
  onChange,
  onFocus,
  onCommit,
}: ConstraintExpressionInputProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const activeItemRef = useRef<HTMLLIElement>(null)
  const [focused, setFocused] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [caret, setCaret] = useState(0)
  const [activeIndex, setActiveIndex] = useState(0)

  const completion = useMemo(
    () => resolveConstraintCompletions(value, caret, scope),
    [value, caret, scope]
  )
  const open = focused && !dismissed && completion.items.length > 0
  const boundedIndex = Math.min(activeIndex, Math.max(0, completion.items.length - 1))

  useEffect(() => {
    if (open) activeItemRef.current?.scrollIntoView({ block: 'nearest' })
  }, [open, boundedIndex])

  const syncCaret = () => {
    const position = inputRef.current?.selectionStart
    if (typeof position === 'number') setCaret(position)
  }

  const accept = (suggestion: ConstraintSuggestion) => {
    const next = applyConstraintCompletion(value, completion, suggestion)
    onChange(next.text)
    setActiveIndex(0)
    setDismissed(false)
    // onChange 的新值要先落到 DOM，光标才能定位到插入片段之后
    requestAnimationFrame(() => {
      inputRef.current?.setSelectionRange(next.caret, next.caret)
      setCaret(next.caret)
    })
  }

  const panelClass = `absolute left-0 right-0 top-full z-40 mt-1 overflow-hidden rounded-md border shadow-lg ${
    darkMode ? 'border-gray-600 bg-gray-800 text-gray-100' : 'border-gray-200 bg-white text-gray-900'
  }`
  const optionClass = (selected: boolean) =>
    `flex cursor-pointer items-baseline gap-2 px-2 py-1.5 text-left text-sm ${
      selected ? (darkMode ? 'bg-gray-700' : 'bg-blue-50') : ''
    }`
  const badgeClass = darkMode ? 'text-gray-500' : 'text-gray-400'
  const detailClass = darkMode ? 'text-gray-400' : 'text-gray-500'
  const footerClass = `border-t px-2 py-1 text-[11px] ${
    darkMode ? 'border-gray-700 text-gray-500' : 'border-gray-200 text-gray-500'
  }`

  return (
    <div className="relative">
      <input
        ref={inputRef}
        className={className}
        value={value}
        title={title}
        aria-label={ariaLabel}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        onFocus={(event) => {
          setFocused(true)
          setDismissed(false)
          setActiveIndex(0)
          onFocus?.()
          if (selectOnFocus) {
            event.currentTarget.select()
            setCaret(0)
            return
          }
          setCaret(event.currentTarget.selectionStart ?? event.currentTarget.value.length)
        }}
        onBlur={() => {
          setFocused(false)
          setDismissed(false)
          onCommit?.()
        }}
        onChange={(event) => {
          setCaret(event.target.selectionStart ?? event.target.value.length)
          setActiveIndex(0)
          setDismissed(false)
          onChange(event.target.value)
        }}
        onSelect={syncCaret}
        onClick={syncCaret}
        onKeyDown={(event) => {
          if (open) {
            const count = completion.items.length
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              setActiveIndex((current) => (Math.min(current, count - 1) + 1) % count)
              return
            }
            if (event.key === 'ArrowUp') {
              event.preventDefault()
              setActiveIndex((current) => (Math.min(current, count - 1) - 1 + count) % count)
              return
            }
            if (event.key === 'Enter' || event.key === 'Tab') {
              event.preventDefault()
              accept(completion.items[boundedIndex]!)
              return
            }
            if (event.key === 'Escape') {
              event.preventDefault()
              setDismissed(true)
              return
            }
          }
          if (event.key === 'Enter') event.currentTarget.blur()
        }}
      />
      {open && (
        <div className={panelClass}>
          <ul className="max-h-56 overflow-auto" role="listbox">
            {completion.items.map((item, index) => (
              <li
                key={`${item.kind}-${item.value}`}
                ref={index === boundedIndex ? activeItemRef : undefined}
                role="option"
                aria-selected={index === boundedIndex}
                className={optionClass(index === boundedIndex)}
                onMouseEnter={() => setActiveIndex(index)}
                // 用 mousedown + preventDefault，避免点击前先触发 blur 提交
                onMouseDown={(event) => {
                  event.preventDefault()
                  accept(item)
                }}
              >
                <span className="font-mono">{item.value}</span>
                <span className={`shrink-0 text-[11px] ${badgeClass}`}>{KIND_BADGE[item.kind]}</span>
                <span className={`truncate text-xs ${detailClass}`}>{item.detail}</span>
              </li>
            ))}
          </ul>
          <div className={footerClass}>↑↓ 选择 · Enter/Tab 插入 · Esc 关闭</div>
        </div>
      )}
    </div>
  )
}
