import { useEffect, useState, type ClipboardEvent, type ReactNode } from 'react'
import { inputSm } from '../../theme/uiTheme'
import {
  batchTableCopyText,
  batchTableNumericTitle,
  formatBatchTableDisplay,
  isBatchTableEmptyValue,
  writeBatchTableCopyText,
} from '../../utils/batchTableNumeric'

export type BatchTableNumericValue = string | number

function normalizeBatchValue(value: BatchTableNumericValue): string {
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : ''
  return value
}

export type BatchTableNumericCellProps = {
  darkMode: boolean
  value: BatchTableNumericValue
  className?: string
  editable?: boolean
  readOnly?: boolean
  step?: string
  helpTitle?: string
  applicable?: boolean
  emptyDisplay?: string
  onChange?: (value: string) => void
  onBlur?: () => void
  onClick?: (event: React.MouseEvent<HTMLInputElement>) => void
  onDoubleClick?: () => void
}

function mergeClass(...parts: Array<string | false | undefined>) {
  return parts.filter(Boolean).join(' ')
}

function copyTextToClipboard(text: string): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text)
  }
  if (typeof document === 'undefined') {
    return Promise.reject(new Error('Clipboard unavailable'))
  }
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.left = '-9999px'
  textarea.style.top = '0'
  document.body.appendChild(textarea)
  textarea.select()
  try {
    if (!document.execCommand('copy')) throw new Error('Copy failed')
    return Promise.resolve()
  } finally {
    textarea.remove()
  }
}

export function BatchTableNumericReadonly({
  darkMode,
  value,
  className,
  helpTitle,
  helpTitleExclusive = false,
  applicable = true,
  emptyDisplay = '—',
}: {
  darkMode: boolean
  value: BatchTableNumericValue
  className?: string
  helpTitle?: string
  helpTitleExclusive?: boolean
  applicable?: boolean
  emptyDisplay?: string
}) {
  const [copied, setCopied] = useState(false)
  const text = normalizeBatchValue(value)

  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 900)
    return () => window.clearTimeout(timer)
  }, [copied])

  if (!applicable || isBatchTableEmptyValue(text)) {
    return (
      <span
        className={mergeClass(
          'block w-full font-mono tabular-nums',
          className,
          darkMode ? 'text-gray-500' : 'text-gray-400'
        )}
      >
        {applicable ? emptyDisplay : '—'}
      </span>
    )
  }
  const display = formatBatchTableDisplay(text)
  const copyText = batchTableCopyText(text)
  const baseTitle = helpTitleExclusive
    ? helpTitle?.trim() || undefined
    : batchTableNumericTitle(text, helpTitle)
  const title = copied ? '已复制' : baseTitle
  const handleCopyClick = () => {
    if (!copyText) return
    void copyTextToClipboard(copyText).then(
      () => setCopied(true),
      () => setCopied(false)
    )
  }
  return (
    <span
      className={mergeClass(
        'block w-full cursor-copy select-none rounded-sm font-mono tabular-nums transition-colors',
        copied && (darkMode ? 'bg-emerald-900/40 text-emerald-200' : 'bg-emerald-50 text-emerald-700'),
        className
      )}
      title={title}
      role="button"
      tabIndex={0}
      onClick={handleCopyClick}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        handleCopyClick()
      }}
      onCopy={(event: ClipboardEvent<HTMLSpanElement>) => writeBatchTableCopyText(event, text)}
    >
      {display}
    </span>
  )
}

export function BatchTableNumericCell({
  darkMode,
  value,
  className = '',
  editable = false,
  readOnly = false,
  step = '0.0001',
  helpTitle,
  applicable = true,
  emptyDisplay = '',
  onChange,
  onBlur,
  onClick,
  onDoubleClick,
}: BatchTableNumericCellProps) {
  const normalizedValue = normalizeBatchValue(value)
  const [focused, setFocused] = useState(false)
  const [draft, setDraft] = useState(normalizedValue)

  useEffect(() => {
    if (!focused) setDraft(normalizedValue)
  }, [focused, normalizedValue])

  if (!applicable) {
    return <BatchTableNumericReadonly darkMode={darkMode} value="" applicable={false} className={className} />
  }

  if (!editable || readOnly) {
    return (
      <BatchTableNumericReadonly
        darkMode={darkMode}
        value={normalizedValue}
        className={className}
        helpTitle={helpTitle}
        emptyDisplay={emptyDisplay || '—'}
      />
    )
  }

  const shown = focused
    ? draft
    : isBatchTableEmptyValue(normalizedValue)
      ? normalizedValue
      : formatBatchTableDisplay(normalizedValue)
  const title = focused ? helpTitle : batchTableNumericTitle(normalizedValue, helpTitle)

  return (
    <input
      className={mergeClass(inputSm(darkMode), 'h-8 w-full min-w-0 !px-0.5 !py-0 text-center font-mono text-sm tabular-nums', className)}
      step={step}
      title={title}
      value={shown}
      onFocus={() => {
        setFocused(true)
        setDraft(normalizedValue)
      }}
      onChange={(event) => {
        setDraft(event.target.value)
        onChange?.(event.target.value)
      }}
      onBlur={() => {
        setFocused(false)
        onBlur?.()
      }}
      onCopy={(event: ClipboardEvent<HTMLInputElement>) => writeBatchTableCopyText(event, normalizedValue)}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
    />
  )
}

export function BatchTableNumericMassCell(props: BatchTableNumericCellProps) {
  return <BatchTableNumericCell {...props} step="0.01" />
}

export function batchTableNumericChildren(
  node: ReactNode,
  _value: string | number | null | undefined,
  helpTitle?: string
): ReactNode {
  if (typeof node !== 'string' && typeof node !== 'number') return node
  return (
    <span title={batchTableNumericTitle(node, helpTitle)} onCopy={(e) => writeBatchTableCopyText(e, node)}>
      {formatBatchTableDisplay(node)}
    </span>
  )
}
