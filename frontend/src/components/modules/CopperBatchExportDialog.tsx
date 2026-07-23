import { useEffect, useState } from 'react'
import { btnPrimary, btnSecondary, hintText, sectionTitle } from '../../theme/uiTheme'

/** 导出内容分组（勾选后展开为多张具体工作表） */
export type CopperBatchExportGroupKey = 'input' | 'output' | 'heatBalance'

/** 具体工作表键（内部展开用） */
export type CopperBatchExportSheetKey =
  | 'element'
  | 'materialPhase'
  | 'inputPhase'
  | 'blendResult'
  | 'outputPhase'
  | 'outputElement'
  | 'heatBalance'

export type CopperBatchExportGroupOption = {
  key: CopperBatchExportGroupKey
  label: string
  /** 分组说明：勾选后实际包含哪些表 */
  description: string
  available: boolean
  /** 勾选该分组时实际导出的表 */
  sheetKeys: CopperBatchExportSheetKey[]
}

/** @deprecated 使用 CopperBatchExportGroupOption */
export type CopperBatchExportSheetOption = {
  key: CopperBatchExportSheetKey
  label: string
  available: boolean
}

const DEFAULT_SELECTION: Record<CopperBatchExportGroupKey, boolean> = {
  input: true,
  output: true,
  heatBalance: true,
}

export function CopperBatchExportDialog({
  darkMode,
  open,
  groupOptions,
  onCancel,
  onConfirm,
}: {
  darkMode: boolean
  open: boolean
  groupOptions: CopperBatchExportGroupOption[]
  onCancel: () => void
  onConfirm: (selected: CopperBatchExportSheetKey[]) => void
}) {
  const [selected, setSelected] = useState<Record<CopperBatchExportGroupKey, boolean>>({ ...DEFAULT_SELECTION })

  useEffect(() => {
    if (!open) return
    const next = { ...DEFAULT_SELECTION }
    for (const option of groupOptions) {
      next[option.key] = option.available
    }
    setSelected(next)
  }, [open, groupOptions])

  if (!open) return null

  const toggle = (key: CopperBatchExportGroupKey) => {
    const option = groupOptions.find((item) => item.key === key)
    if (!option?.available) return
    setSelected((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const selectedSheetKeys = groupOptions
    .filter((option) => option.available && selected[option.key])
    .flatMap((option) => option.sheetKeys)
  const canExport = selectedSheetKeys.length > 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="batch-export-title"
        className={`relative w-full max-w-lg overflow-hidden rounded-lg border shadow-2xl ${
          darkMode ? 'border-gray-600 bg-gray-800 text-gray-100' : 'border-gray-200 bg-white text-gray-900'
        }`}
      >
        <button
          type="button"
          aria-label="关闭"
          className={`absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded text-lg leading-none ${
            darkMode ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-500 hover:bg-gray-100'
          }`}
          onClick={onCancel}
        >
          ×
        </button>
        <div className={`border-b px-4 py-3 pr-10 ${darkMode ? 'border-gray-600' : 'border-gray-200'}`}>
          <h3 id="batch-export-title" className={sectionTitle(darkMode)}>
            导出 Excel
          </h3>
          <p className={`${hintText(darkMode)} mt-1 text-xs`}>
            勾选要导出的内容，统一导出为 Excel 工作簿（.xlsx）。文件名可在系统另存为对话框中修改。
          </p>
        </div>
        <div className="space-y-4 px-4 py-4">
          <div className="space-y-2">
            <div className={`text-xs font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>导出内容</div>
            {groupOptions.map((option) => (
              <label
                key={option.key}
                className={`flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2.5 text-sm ${
                  option.available
                    ? darkMode
                      ? 'border-gray-600 hover:bg-gray-700/40'
                      : 'border-gray-200 hover:bg-gray-50'
                    : darkMode
                      ? 'cursor-not-allowed border-gray-700 text-gray-500'
                      : 'cursor-not-allowed border-gray-100 text-gray-400'
                }`}
              >
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 shrink-0"
                  checked={Boolean(selected[option.key])}
                  disabled={!option.available}
                  onChange={() => toggle(option.key)}
                />
                <span className="min-w-0">
                  <span className="block font-medium">{option.label}</span>
                  <span className={`mt-0.5 block text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                    {option.description}
                    {!option.available ? '（暂无数据）' : ''}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </div>
        <div className={`flex justify-end gap-2 border-t px-4 py-3 ${darkMode ? 'border-gray-600' : 'border-gray-200'}`}>
          <button type="button" className={btnSecondary(darkMode)} onClick={onCancel}>
            取消
          </button>
          <button
            type="button"
            className={btnPrimary(darkMode)}
            disabled={!canExport}
            onClick={() => onConfirm(selectedSheetKeys)}
          >
            导出
          </button>
        </div>
      </div>
    </div>
  )
}
