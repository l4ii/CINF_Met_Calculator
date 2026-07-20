import { useEffect, useState } from 'react'
import { btnPrimary, btnSecondary, hintText, inputBase, sectionTitle } from '../../theme/uiTheme'

export type CopperBatchExportSheetKey =
  | 'element'
  | 'inputPhase'
  | 'outputPhase'
  | 'outputElement'
  | 'materialPhase'
  | 'heatBalance'

export type CopperBatchExportSheetOption = {
  key: CopperBatchExportSheetKey
  label: string
  available: boolean
}

const DEFAULT_SELECTION: Record<CopperBatchExportSheetKey, boolean> = {
  element: true,
  inputPhase: true,
  outputPhase: true,
  outputElement: true,
  materialPhase: true,
  heatBalance: true,
}

export function CopperBatchExportDialog({
  darkMode,
  open,
  caseName,
  sheetOptions,
  onCancel,
  onConfirm,
}: {
  darkMode: boolean
  open: boolean
  caseName: string
  sheetOptions: CopperBatchExportSheetOption[]
  onCancel: () => void
  onConfirm: (selected: CopperBatchExportSheetKey[], fileBaseName: string) => void
}) {
  const [fileBaseName, setFileBaseName] = useState(caseName)
  const [selected, setSelected] = useState<Record<CopperBatchExportSheetKey, boolean>>({ ...DEFAULT_SELECTION })

  useEffect(() => {
    if (!open) return
    setFileBaseName(caseName)
    const next = { ...DEFAULT_SELECTION }
    for (const option of sheetOptions) {
      next[option.key] = option.available
    }
    setSelected(next)
  }, [caseName, open, sheetOptions])

  if (!open) return null

  const toggle = (key: CopperBatchExportSheetKey) => {
    const option = sheetOptions.find((item) => item.key === key)
    if (!option?.available) return
    setSelected((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const selectedKeys = sheetOptions.filter((option) => option.available && selected[option.key]).map((option) => option.key)
  const canExport = selectedKeys.length > 0 && fileBaseName.trim().length > 0

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
          <p className={`${hintText(darkMode)} mt-1 text-xs`}>勾选要导出的表格，文件名可编辑。</p>
        </div>
        <div className="space-y-4 px-4 py-4">
          <label className="block">
            <span className={`mb-1 block text-xs font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
              文件名（案例名称）
            </span>
            <input className={`${inputBase(darkMode)} w-full`} value={fileBaseName} onChange={(event) => setFileBaseName(event.target.value)} />
          </label>
          <div className="space-y-2">
            <div className={`text-xs font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>导出内容</div>
            {sheetOptions.map((option) => (
              <label
                key={option.key}
                className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm ${
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
                  className="h-4 w-4"
                  checked={Boolean(selected[option.key])}
                  disabled={!option.available}
                  onChange={() => toggle(option.key)}
                />
                <span>{option.label}</span>
                {!option.available && <span className="text-xs">（暂无数据）</span>}
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
            onClick={() => onConfirm(selectedKeys, fileBaseName.trim())}
          >
            导出
          </button>
        </div>
      </div>
    </div>
  )
}
