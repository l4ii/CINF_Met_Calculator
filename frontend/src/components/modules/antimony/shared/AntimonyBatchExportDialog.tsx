import { useEffect, useMemo, useState } from 'react'
import { btnPrimary, btnSecondary, hintText, sectionTitle } from '../../../../theme/uiTheme'

export type AntimonyBatchExportGroupKey = 'input' | 'output' | 'heatBalance'

export type AntimonyBatchExportSheetKey =
  | 'element'
  | 'materialPhase'
  | 'inputPhase'
  | 'blendResult'
  | 'outputPhase'
  | 'outputElement'
  | 'heatBalance'

export type AntimonyBatchExportGroupOption = {
  key: AntimonyBatchExportGroupKey
  label: string
  description: string
  available: boolean
  sheetKeys: AntimonyBatchExportSheetKey[]
}

export type AntimonyBatchExportSelection = {
  excel: boolean
  flo: boolean
  processText: boolean
  sheetKeys: AntimonyBatchExportSheetKey[]
}

const DEFAULT_GROUP_SELECTION: Record<AntimonyBatchExportGroupKey, boolean> = {
  input: true,
  output: true,
  heatBalance: true,
}

type ExportTab = 'excel' | 'processText' | 'flo'

export function AntimonyBatchExportDialog({
  darkMode,
  open,
  groupOptions,
  onCancel,
  onConfirm,
}: {
  darkMode: boolean
  open: boolean
  groupOptions: AntimonyBatchExportGroupOption[]
  onCancel: () => void
  onConfirm: (selection: AntimonyBatchExportSelection) => void
}) {
  const [activeTab, setActiveTab] = useState<ExportTab>('excel')
  const [selectedGroups, setSelectedGroups] = useState<Record<AntimonyBatchExportGroupKey, boolean>>({
    ...DEFAULT_GROUP_SELECTION,
  })
  const [selectedFormats, setSelectedFormats] = useState<Record<ExportTab, boolean>>({
    excel: true,
    processText: true,
    flo: false,
  })

  const availableSheetKeys = useMemo(
    () => groupOptions.filter((option) => option.available).flatMap((option) => option.sheetKeys),
    [groupOptions]
  )
  const selectedSheetKeys = useMemo(
    () =>
      groupOptions
        .filter((option) => option.available && selectedGroups[option.key])
        .flatMap((option) => option.sheetKeys),
    [groupOptions, selectedGroups]
  )
  const hasExcelContent = selectedSheetKeys.length > 0
  const hasExcelData = availableSheetKeys.length > 0
  const hasProcessContent = hasExcelData
  const canExport =
    (selectedFormats.excel && hasExcelContent) || selectedFormats.flo || (selectedFormats.processText && hasProcessContent)

  useEffect(() => {
    if (!open) return
    const next = { ...DEFAULT_GROUP_SELECTION }
    for (const option of groupOptions) next[option.key] = option.available
    setSelectedGroups(next)
    setSelectedFormats({
      excel: availableSheetKeys.length > 0,
      processText: hasProcessContent,
      flo: false,
    })
    setActiveTab('excel')
  }, [open, groupOptions, availableSheetKeys.length])

  if (!open) return null

  const formatTabs: Array<{ key: ExportTab; label: string; caption: string; available: boolean }> = [
    { key: 'excel', label: 'Excel文件', caption: '计算结果工作簿', available: hasExcelData },
    { key: 'processText', label: '工艺计算文件', caption: '冶金计算报告', available: hasProcessContent },
    { key: 'flo', label: 'Flo文件', caption: 'MetCal流程文件', available: true },
  ]

  const toggleFormat = (key: ExportTab) => {
    if (!formatTabs.find((tab) => tab.key === key)?.available) return
    setSelectedFormats((previous) => ({ ...previous, [key]: !previous[key] }))
  }

  const toggleGroup = (key: AntimonyBatchExportGroupKey) => {
    const option = groupOptions.find((item) => item.key === key)
    if (!option?.available) return
    setSelectedGroups((previous) => ({ ...previous, [key]: !previous[key] }))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="batch-export-title"
        className={`relative w-full max-w-2xl overflow-hidden rounded-lg border shadow-2xl ${
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
        <div className={`border-b px-5 py-4 pr-12 ${darkMode ? 'border-gray-600' : 'border-gray-200'}`}>
          <h3 id="batch-export-title" className={sectionTitle(darkMode)}>
            计算结果导出
          </h3>
          <p className={`${hintText(darkMode)} mt-1 text-xs`}>选择本次计算需交付的文件</p>
        </div>

        <div className={`grid grid-cols-3 gap-1 border-b px-4 pt-3 ${darkMode ? 'border-gray-600' : 'border-gray-200'}`} role="tablist" aria-label="导出格式">
          {formatTabs.map((tab) => {
            const active = activeTab === tab.key
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={active}
                disabled={!tab.available}
                onClick={() => setActiveTab(tab.key)}
                className={`rounded-t-md border border-b-0 px-3 py-2.5 text-left transition-colors ${
                  active
                    ? darkMode
                      ? 'border-gray-600 bg-gray-700 text-white'
                      : 'border-gray-200 bg-white text-blue-700'
                    : darkMode
                      ? 'border-transparent text-gray-400 hover:bg-gray-700/50'
                      : 'border-transparent text-gray-600 hover:bg-gray-50'
                } ${!tab.available ? 'cursor-not-allowed opacity-45' : ''}`}
              >
                <span className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    aria-label={`选择${tab.label}导出`}
                    checked={selectedFormats[tab.key]}
                    disabled={!tab.available}
                    onChange={() => toggleFormat(tab.key)}
                    onClick={(event) => event.stopPropagation()}
                    className="h-4 w-4 shrink-0"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">{tab.label}</span>
                    <span className={`mt-0.5 block truncate text-[11px] ${hintText(darkMode)}`}>{tab.caption}</span>
                  </span>
                </span>
              </button>
            )
          })}
        </div>

        <div className="min-h-[210px] px-5 py-4">
          {activeTab === 'excel' && (
            <div className="space-y-2">
              <div className={`mb-3 text-xs font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>选择要写入工作簿的计算表</div>
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
                    checked={Boolean(selectedGroups[option.key])}
                    disabled={!option.available}
                    onChange={() => toggleGroup(option.key)}
                  />
                  <span className="min-w-0">
                    <span className="block font-medium">{option.label}</span>
                    <span className={`mt-0.5 block text-xs ${hintText(darkMode)}`}>
                      {option.description}
                      {!option.available ? '（暂无数据）' : ''}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          )}
          {activeTab === 'flo' && (
            <div className={`rounded-md border px-4 py-4 text-sm ${darkMode ? 'border-gray-600 bg-gray-900/30' : 'border-gray-200 bg-gray-50'}`}>
              <div className="font-semibold">MetCal流程文件</div>
              <p className={`${hintText(darkMode)} mt-2 leading-relaxed`}>按当前计算结果更新默认 MetCal 模板。</p>
            </div>
          )}
          {activeTab === 'processText' && (
            <div className={`rounded-md border px-4 py-4 text-sm ${darkMode ? 'border-gray-600 bg-gray-900/30' : 'border-gray-200 bg-gray-50'}`}>
              <div className="font-semibold">冶金计算报告</div>
              <p className={`${hintText(darkMode)} mt-2 leading-relaxed`}>整理本次工艺计算的关键条件、计算结果和分析表格，便于复核、留档及编制后续技术文件。</p>
              <div className={`mt-3 rounded border px-3 py-2 text-xs ${darkMode ? 'border-gray-700 bg-gray-800 text-gray-300' : 'border-gray-200 bg-white text-gray-600'}`}>
                包含 {availableSheetKeys.length} 张当前可导出的计算表
              </div>
            </div>
          )}
        </div>

        <div className={`flex items-center justify-between gap-3 border-t px-5 py-3 ${darkMode ? 'border-gray-600' : 'border-gray-200'}`}>
          <span className={`text-xs ${hintText(darkMode)}`}>已选择 {Object.values(selectedFormats).filter(Boolean).length} 类文件</span>
          <div className="flex gap-2">
            <button type="button" className={btnSecondary(darkMode)} onClick={onCancel}>取消</button>
            <button
              type="button"
              className={btnPrimary(darkMode)}
              disabled={!canExport}
              onClick={() => onConfirm({ ...selectedFormats, sheetKeys: selectedSheetKeys })}
            >
              导出
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
