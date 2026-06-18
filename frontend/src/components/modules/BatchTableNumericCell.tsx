import { useEffect, useState, type ClipboardEvent, type ReactNode } from 'react'
import { inputSm } from '../../theme/uiTheme'
import {
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
  const text = normalizeBatchValue(value)
  if (!applicable || isBatchTableEmptyValue(text)) {
    return (
      <span className={mergeClass('font-mono tabular-nums', className, darkMode ? 'text-gray-500' : 'text-gray-400')}>
        {applicable ? emptyDisplay : '—'}
      </span>
    )
  }
  const display = formatBatchTableDisplay(text)
  const title = helpTitleExclusive
    ? helpTitle?.trim() || undefined
    : batchTableNumericTitle(text, helpTitle)
  return (
    <span
      className={mergeClass('block w-full font-mono tabular-nums', className)}
      title={title}
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
      className={mergeClass(inputSm(darkMode), 'h-7 w-full min-w-0 !px-0.5 !py-0 text-center font-mono text-sm tabular-nums', className)}
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
