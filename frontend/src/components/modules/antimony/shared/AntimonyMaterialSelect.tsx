import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

/** 锑流程共享的物料选择项。 */
export type AntimonyMaterialSelectOption = { id: string; label: string }

export function AntimonyMaterialSelect({
  darkMode,
  value,
  options,
  placeholder = '请选择',
  title,
  triggerClassName,
  onChange,
}: {
  darkMode: boolean
  value: string
  options: AntimonyMaterialSelectOption[]
  placeholder?: string
  status?: 'none' | 'pending' | 'resolved'
  title?: string
  triggerClassName: string
  onChange: (id: string) => void
}) {
  const listId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [menuStyle, setMenuStyle] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(
    null
  )

  const selected = options.find((item) => item.id === value)
  const displayLabel = selected?.label ?? placeholder
  const normalizedQuery = query.trim().toLowerCase()
  const filteredOptions = useMemo(
    () =>
      normalizedQuery
        ? options.filter((item) => item.label.toLowerCase().includes(normalizedQuery))
        : options,
    [normalizedQuery, options]
  )

  const updateMenuPosition = useCallback(() => {
    const trigger = triggerRef.current
    if (!trigger) return
    const rect = trigger.getBoundingClientRect()
    const gap = 4
    const maxHeight = Math.min(280, window.innerHeight - rect.bottom - gap - 8)
    setMenuStyle({
      top: rect.bottom + gap,
      left: rect.left,
      width: rect.width,
      maxHeight: Math.max(120, maxHeight),
    })
  }, [])

  useLayoutEffect(() => {
    if (!open) return
    updateMenuPosition()
  }, [open, updateMenuPosition, displayLabel])

  useEffect(() => {
    if (!open) return
    const onScrollOrResize = () => updateMenuPosition()
    window.addEventListener('resize', onScrollOrResize)
    window.addEventListener('scroll', onScrollOrResize, true)
    return () => {
      window.removeEventListener('resize', onScrollOrResize)
      window.removeEventListener('scroll', onScrollOrResize, true)
    }
  }, [open, updateMenuPosition])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      const root = rootRef.current
      const target = event.target
      if (!(target instanceof Node)) return
      if (root?.contains(target)) return
      const portal = document.getElementById(listId)
      if (portal?.contains(target)) return
      setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, listId])

  useEffect(() => {
    if (!open) setQuery('')
  }, [open])

  const menuPanelClass = darkMode
    ? 'rounded border border-gray-600 bg-gray-800 shadow-lg'
    : 'rounded border border-gray-200 bg-white shadow-lg'

  const itemClass = (active: boolean, selectedItem: boolean) => {
    const base = 'block w-full px-2 py-1.5 text-center text-[13px] leading-normal'
    if (selectedItem) {
      return `${base} font-medium ${darkMode ? 'bg-blue-900/50 text-blue-100' : 'bg-blue-50 text-blue-800'}`
    }
    if (active) {
      return `${base} ${darkMode ? 'bg-gray-700 text-gray-100' : 'bg-gray-100 text-gray-900'}`
    }
    return `${base} ${darkMode ? 'text-gray-200 hover:bg-gray-700' : 'text-gray-800 hover:bg-gray-50'}`
  }

  const menu =
    open && menuStyle
      ? createPortal(
          <div
            id={listId}
            className={menuPanelClass}
            style={{
              position: 'fixed',
              top: menuStyle.top,
              left: menuStyle.left,
              width: menuStyle.width,
              maxHeight: menuStyle.maxHeight,
              zIndex: 10000,
            }}
          >
            <div className={`border-b p-1 ${darkMode ? 'border-gray-600' : 'border-gray-200'}`}>
              <input
                className={`h-8 w-full rounded border px-2 text-center text-[13px] outline-none ${
                  darkMode
                    ? 'border-gray-600 bg-gray-900 text-gray-100 placeholder:text-gray-500 focus:border-blue-400'
                    : 'border-gray-300 bg-white text-gray-900 placeholder:text-gray-400 focus:border-blue-500'
                }`}
                value={query}
                placeholder="搜索原料"
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') setOpen(false)
                }}
              />
            </div>
            <ul
              role="listbox"
              style={{ maxHeight: Math.max(72, menuStyle.maxHeight - 42), overflowY: 'auto' }}
            >
              <li role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={!value}
                  className={itemClass(false, !value)}
                  onClick={() => {
                    onChange('')
                    setOpen(false)
                  }}
                >
                  {placeholder}
                </button>
              </li>
              {filteredOptions.length === 0 ? (
                <li className={`px-2 py-3 text-center text-[13px] ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  无匹配原料
                </li>
              ) : (
                filteredOptions.map((item) => (
                  <li key={item.id} role="presentation">
                    <button
                      type="button"
                      role="option"
                      aria-selected={item.id === value}
                      className={itemClass(false, item.id === value)}
                      title={item.label}
                      onClick={() => {
                        onChange(item.id)
                        setOpen(false)
                      }}
                    >
                      {item.label}
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>,
          document.body
        )
      : null

  return (
    <div ref={rootRef} className="relative w-full min-w-0">
      <button
        ref={triggerRef}
        type="button"
        className={`${triggerClassName} flex w-full min-w-0 items-center justify-center gap-1`}
        title={title ?? (selected?.label || placeholder)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className="min-w-0 flex-1 whitespace-nowrap text-center">{displayLabel}</span>
        <span className="shrink-0 text-[10px] opacity-70" aria-hidden>
          ▾
        </span>
      </button>
      {menu}
    </div>
  )
}
