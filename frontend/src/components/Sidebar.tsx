import { useEffect, useState } from 'react'
import {
  SMELT_TYPES,
  type SheetId,
  type SelectedMethod,
  type SmeltMethod,
} from '../types'
import { ABOUT_NAV, APP_TAGLINE_SIDEBAR_EN, APP_TAGLINE_SIDEBAR_ZH_LINE1, APP_TAGLINE_SIDEBAR_ZH_LINE2, sidebarTitleForLang } from '../constants/appCopy'

interface SidebarProps {
  selectedMethod: SelectedMethod | null
  onMethodSelect: (method: SelectedMethod) => void
  onSheetSelect: (sheet: SheetId) => void
  darkMode: boolean
  language: 'zh' | 'en'
  onShowAbout: (department: string) => void
  onShowSettings: () => void
  currentView: 'module' | 'about' | 'settings'
  aboutDepartment?: string | null
}

const sectionKey = (smeltTypeId: string, sectionId: string) => `${smeltTypeId}:${sectionId}`
export default function Sidebar({
  selectedMethod,
  onMethodSelect,
  onSheetSelect,
  darkMode,
  language,
  onShowAbout,
  onShowSettings,
  currentView,
  aboutDepartment,
}: SidebarProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(() => new Set())
  const smeltTypeNameEn: Record<string, string> = {
    cu: 'Copper Smelting',
    pb: 'Lead Smelting',
    zn: 'Zinc Smelting',
    sb: 'Antimony Smelting',
  }
  const sectionNameEn: Record<string, string> = {
    pyro: 'Pyrometallurgy',
    hydro: 'Hydrometallurgy',
  }
  const methodNameEn: Record<string, string> = {
    'cu:side-blown': 'Side-Blown Furnace',
    'cu:flash': 'Flash Furnace',
    'pb:side-blown': 'Side-Blown Furnace',
    'pb:ausmelt': 'Ausmelt Furnace',
    'pb:flash': 'Flash Furnace',
    'pb:kivcet': 'Kivcet Furnace',
    'zn:isp': 'ISP Furnace',
    'zn:electric': 'Electric Furnace',
    'zn:pressure-leaching': 'Pressure Leaching',
    'zn:atmospheric-leaching': 'Atmospheric Leaching',
    'sb:side-blown': 'Side-Blown Furnace',
  }
  const t = ABOUT_NAV[language]
  const sidebarTitle = sidebarTitleForLang(language)

  const smeltTypeLabel = (smeltTypeId: string, fallback: string) =>
    language === 'en' ? (smeltTypeNameEn[smeltTypeId] ?? fallback) : fallback
  const sectionLabel = (sectionId: string, fallback: string) =>
    language === 'en' ? (sectionNameEn[sectionId] ?? fallback) : fallback
  const methodLabel = (smeltTypeId: string, method: SmeltMethod) =>
    language === 'en' ? (methodNameEn[`${smeltTypeId}:${method.id}`] ?? method.name) : method.name
  const emptySectionLabel = language === 'en' ? 'Not configured' : '暂未配置'

  const isSelected = (smeltTypeId: string, sectionId: string | undefined, smeltMethodId: string) =>
    selectedMethod?.smeltTypeId === smeltTypeId &&
    selectedMethod?.smeltMethodId === smeltMethodId &&
    (selectedMethod?.sectionId ?? 'default') === (sectionId ?? 'default')

  // 默认折叠所有分区；选中方法后仅展开其所在分区，方便回看当前路径。
  useEffect(() => {
    if (!selectedMethod) return
    const nextSectionKey = selectedMethod.sectionId ? sectionKey(selectedMethod.smeltTypeId, selectedMethod.sectionId) : null
    setExpandedSections((prev) => {
      if (!nextSectionKey || prev.has(nextSectionKey)) return prev
      return new Set(prev).add(nextSectionKey)
    })
  }, [selectedMethod])

  return (
    <div
      className={`h-full min-h-0 w-[270px] shrink-0 border-r flex flex-col ${
        darkMode ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200'
      }`}
    >
      {/* Logo */}
      <div className={`p-4 border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
        <div className="flex items-center space-x-3">
          <img src="./icon.png" alt="Logo" className="w-14 h-14 object-contain" />
          <div>
            <div className={`text-lg font-bold ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}>{sidebarTitle}</div>
            <div className={`text-sm leading-relaxed ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
              {language === 'zh' ? (
                <div className="text-right">
                  <div className="block">{APP_TAGLINE_SIDEBAR_ZH_LINE1}</div>
                  <div className="block">{APP_TAGLINE_SIDEBAR_ZH_LINE2}</div>
                </div>
              ) : (
                APP_TAGLINE_SIDEBAR_EN
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 冶炼类型 → 工艺分区 → 炉型/方法 */}
      <div className="sidebar-scroll flex-1 min-h-0 overflow-y-auto p-3">
        {SMELT_TYPES.map((smeltType) => (
          <div key={smeltType.id} className="mb-3">
            <div
              className={`w-full text-left text-base font-bold mb-1 px-2 py-1.5 ${
                darkMode ? 'text-gray-300' : 'text-gray-700'
              }`}
            >
              {smeltTypeLabel(smeltType.id, smeltType.name)}
            </div>
            <div className="pl-2 space-y-1">
              {smeltType.sections.map((section) => {
                const secKey = sectionKey(smeltType.id, section.id)
                const sectionExpanded = expandedSections.has(secKey)
                const hasMethods = section.methods.length > 0
                return (
                  <div key={section.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setExpandedSections((prev) => {
                          const next = new Set(prev)
                          if (next.has(secKey)) next.delete(secKey)
                          else next.add(secKey)
                          return next
                        })
                      }}
                      className={`w-full text-left px-2 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center justify-between ${
                        darkMode
                          ? 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
                          : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                      }`}
                    >
                      <span>{sectionLabel(section.id, section.name)}</span>
                      <span className={`text-xs transition-transform ${sectionExpanded ? 'rotate-90' : ''}`}>▶</span>
                    </button>
                    {sectionExpanded && (
                      <div className={`ml-2 mt-1 space-y-1 border-l pl-3 ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                        {hasMethods ? (
                          section.methods.map((method) => {
                            const active = isSelected(smeltType.id, section.id, method.id)
                            const methodSelection: SelectedMethod = {
                              smeltTypeId: smeltType.id,
                              smeltTypeName: smeltTypeLabel(smeltType.id, smeltType.name),
                              sectionId: section.id,
                              sectionName: sectionLabel(section.id, section.name),
                              smeltMethodId: method.id,
                              smeltMethodName: methodLabel(smeltType.id, method),
                              description: method.description,
                            }
                            return (
                              <div key={method.id} className="mb-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    onMethodSelect(methodSelection)
                                    onSheetSelect('raw_material')
                                  }}
                                  className={`w-full text-left px-2 py-1.5 rounded-lg text-sm transition-colors flex items-center justify-between ${
                                    active
                                      ? 'bg-blue-600 text-white'
                                      : darkMode
                                      ? 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
                                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                                  }`}
                                >
                                  <span>{methodLabel(smeltType.id, method)}</span>
                                </button>
                              </div>
                            )
                          })
                        ) : (
                          <div className={`px-2 py-1 text-xs ${darkMode ? 'text-gray-600' : 'text-gray-400'}`}>
                            {emptySectionLabel}
                          </div>
                        )}
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
            type="button"
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
            type="button"
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
            type="button"
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
          type="button"
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
            <div className="mt-1 text-sm opacity-70">构建: {import.meta.env.VITE_BUILD_ID}</div>
          )}
        </div>
      </div>
    </div>
  )
}
