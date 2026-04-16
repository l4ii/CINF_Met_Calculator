import { useMemo, useState, useEffect } from 'react'
import { SMELT_TYPES, SHEETS, type SelectedMethod, type SheetId } from '../types'

interface SidebarProps {
  selectedMethod: SelectedMethod | null
  activeSheet: SheetId
  onMethodSelect: (method: SelectedMethod) => void
  onSheetSelect: (sheet: SheetId) => void
  darkMode: boolean
  language: 'zh' | 'en'
  onShowAbout: (department: string) => void
  onShowSettings: () => void
  currentView: 'module' | 'about' | 'settings'
  aboutDepartment?: string | null
}

export default function Sidebar({
  selectedMethod,
  activeSheet,
  onMethodSelect,
  onSheetSelect,
  darkMode,
  language,
  onShowAbout,
  onShowSettings,
  currentView,
  aboutDepartment,
}: SidebarProps) {
  const [expandedMethods, setExpandedMethods] = useState<Set<string>>(new Set())
  const smeltTypeNameEn: Record<string, string> = {
    cu: 'Copper Smelting',
    pb: 'Lead Smelting',
    zn: 'Zinc Smelting',
    sb: 'Antimony Smelting',
  }
  const methodNameEn: Record<string, string> = {
    'oxy-side-blast': 'Oxygen-Enriched Side-Blown',
    flash: 'Flash Smelting',
  }
  const sheetNameEn: Record<SheetId, string> = {
    raw_material: 'Batching Calculation',
    product: 'Product Calculation',
    heat_balance: 'Heat Balance',
    furnace: 'Furnace Design',
  }
  const translations = useMemo(
    () => ({
      zh: {
        appTitle: 'CINF配料软件',
        appSubtitle: '专业冶金配料计算工具',
        aboutUs: '了解我们',
        settings: '设置',
        cinf: '长沙有色冶金设计研究院有限公司',
        metallurgy: '长沙院冶金事业部',
        research: '长沙院科研创新中心',
        footerBy: '由',
        footerDev: '科研创新中心开发',
      },
      en: {
        appTitle: 'CINF Batching Software',
        appSubtitle: 'Professional metallurgical batching tool',
        aboutUs: 'About Us',
        settings: 'Settings',
        cinf: 'Changsha Nonferrous Metallurgical Design & Research Institute Co., Ltd.',
        metallurgy: 'Metallurgical Division',
        research: 'Research Innovation Center',
        footerBy: 'By',
        footerDev: 'Research Innovation Center',
      },
    }),
    [language]
  )

  const t = translations[language]

  const isSelected = (smeltTypeId: string, smeltMethodId: string) =>
    selectedMethod?.smeltTypeId === smeltTypeId && selectedMethod?.smeltMethodId === smeltMethodId
  
  const methodKey = (smeltTypeId: string, smeltMethodId: string) => `${smeltTypeId}-${smeltMethodId}`
  const isExpanded = (smeltTypeId: string, smeltMethodId: string) => expandedMethods.has(methodKey(smeltTypeId, smeltMethodId))
  
  // 确保当前选中的方法总是展开
  useEffect(() => {
    if (selectedMethod) {
      const key = methodKey(selectedMethod.smeltTypeId, selectedMethod.smeltMethodId)
      setExpandedMethods((prev) => {
        if (!prev.has(key)) {
          return new Set(prev).add(key)
        }
        return prev
      })
    }
  }, [selectedMethod])

  return (
    <div
      className={`flex-[1] border-r flex flex-col min-w-[200px] max-w-[280px] ${
        darkMode ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200'
      }`}
    >
      {/* Logo */}
      <div className={`p-4 border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
        <div className="flex items-center space-x-3">
          <img src="./icon.png" alt="Logo" className="w-14 h-14 object-contain" />
          <div>
            <div className={`text-lg font-bold ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}>
              {t.appTitle}
            </div>
            <div className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
              {t.appSubtitle}
            </div>
          </div>
        </div>
      </div>

      {/* 冶炼类型 → 冶炼方法（可展开显示计算模块） */}
      <div className="flex-1 overflow-y-auto p-3 min-h-0">
        {SMELT_TYPES.map((smeltType) => (
          <div key={smeltType.id} className="mb-3">
            <div
              className={`w-full text-left text-base font-bold mb-1 px-2 py-1.5 ${
                darkMode ? 'text-gray-300' : 'text-gray-700'
              }`}
            >
              {language === 'en' ? (smeltTypeNameEn[smeltType.id] ?? smeltType.name) : smeltType.name}
            </div>
            <div className="pl-3 space-y-0.5">
              {smeltType.methods.map((method) => {
                const active = isSelected(smeltType.id, method.id)
                const expanded = isExpanded(smeltType.id, method.id)
                const methodFullKey = methodKey(smeltType.id, method.id)
                return (
                  <div key={method.id} className="mb-1">
                    <button
                      onClick={() => {
                        const newMethod = {
                          smeltTypeId: smeltType.id,
                          smeltTypeName: language === 'en' ? (smeltTypeNameEn[smeltType.id] ?? smeltType.name) : smeltType.name,
                          smeltMethodId: method.id,
                          smeltMethodName: language === 'en' ? (methodNameEn[method.id] ?? method.name) : method.name,
                          description: method.description,
                        }
                        onMethodSelect(newMethod)
                        // 自动展开选中的方法
                        setExpandedMethods((prev) => new Set(prev).add(methodFullKey))
                      }}
                      className={`w-full text-left px-2 py-1.5 rounded-lg text-sm transition-colors flex items-center justify-between ${
                        active
                          ? 'bg-blue-600 text-white'
                          : darkMode
                          ? 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
                          : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                      }`}
                    >
                      <span>{language === 'en' ? (methodNameEn[method.id] ?? method.name) : method.name}</span>
                      <span className={`text-xs transition-transform ${expanded ? 'rotate-90' : ''}`}>▶</span>
                    </button>
                    {expanded && active && (
                      <div className="pl-4 mt-1 space-y-0.5">
                        {SHEETS.map((sheet) => {
                          const sheetActive = activeSheet === sheet.id
                          return (
                            <button
                              key={sheet.id}
                              onClick={(e) => {
                                e.stopPropagation()
                                onSheetSelect(sheet.id)
                              }}
                              className={`w-full text-left px-2 py-1.5 rounded text-xs transition-colors ${
                                sheetActive
                                  ? darkMode ? 'bg-blue-700 text-white' : 'bg-blue-100 text-blue-900'
                                  : darkMode
                                  ? 'text-gray-500 hover:bg-gray-800 hover:text-gray-300'
                                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                              }`}
                            >
                              {language === 'en' ? (sheetNameEn[sheet.id] ?? sheet.name) : sheet.name}
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* 了解我们、设置 */}
      <div className={`flex-shrink-0 border-t p-3 ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
        <h2
          className={`text-base font-semibold mb-2 uppercase tracking-wide ${
            darkMode ? 'text-gray-300' : 'text-gray-700'
          }`}
        >
          {t.aboutUs}
        </h2>
        <div className="pl-2 space-y-1 mb-3">
          <button
            onClick={() => onShowAbout('cinf')}
            className={`w-full text-left px-2 py-1.5 rounded text-sm transition-colors ${
              currentView === 'about' && aboutDepartment === 'cinf'
                ? 'bg-blue-600 text-white'
                : darkMode
                ? 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
            }`}
          >
            {t.cinf}
          </button>
          <button
            onClick={() => onShowAbout('metallurgy')}
            className={`w-full text-left px-2 py-1.5 rounded text-sm transition-colors ${
              currentView === 'about' && aboutDepartment === 'metallurgy'
                ? 'bg-blue-600 text-white'
                : darkMode
                ? 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
            }`}
          >
            {t.metallurgy}
          </button>
          <button
            onClick={() => onShowAbout('research')}
            className={`w-full text-left px-2 py-1.5 rounded text-sm transition-colors ${
              currentView === 'about' && aboutDepartment === 'research'
                ? 'bg-blue-600 text-white'
                : darkMode
                ? 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
            }`}
          >
            {t.research}
          </button>
        </div>
        <button
          onClick={onShowSettings}
          className={`w-full text-left px-2 py-1.5 rounded-lg text-base font-semibold uppercase tracking-wide transition-colors ${
            currentView === 'settings'
              ? 'bg-blue-600 text-white'
              : darkMode
              ? 'text-gray-300 hover:bg-gray-800'
              : 'text-gray-700 hover:bg-gray-100'
          }`}
        >
          {t.settings}
        </button>
      </div>

      {/* Footer */}
      <div
        className={`border-t p-3 ${
          darkMode ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-gray-50'
        }`}
      >
        <div className={`text-sm leading-relaxed ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
          <div className="mb-1">{t.footerBy}</div>
          <a
            href="http://www.cinf.com.cn/"
            target="_blank"
            rel="noopener noreferrer"
            className={`font-medium hover:underline ${
              darkMode ? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-800'
            }`}
          >
            {t.cinf}
          </a>
          <div className="mt-1">{t.footerDev}</div>
          {import.meta.env.VITE_BUILD_ID && import.meta.env.VITE_BUILD_ID !== 'dev' && (
            <div className="mt-1 text-xs opacity-70">构建: {import.meta.env.VITE_BUILD_ID}</div>
          )}
        </div>
      </div>
    </div>
  )
}
