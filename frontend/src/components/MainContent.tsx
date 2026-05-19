import { useEffect } from 'react'
import { SMELT_TYPES, type SelectedMethod, type SheetId } from '../types'
import RawMaterialPhaseOxygen from './modules/RawMaterialPhaseOxygen'
import ProductDisplay from './modules/ProductDisplay'
import ElementDistributionFab from './ElementDistributionFab'
import ErrorBoundary from './ErrorBoundary'
import { cardBase, descText } from '../theme/uiTheme'
import AboutPage from './shell/AboutPage'
import SettingsPage from './shell/SettingsPage'
import { appSubtitleForLang, appTitleForLang } from '../constants/appCopy'
import { useAssistantSnapshotOptional } from '../context/AssistantContext'
import { useCalcOptional } from '../context/CalcContext'

interface MainContentProps {
  selectedMethod: SelectedMethod | null
  activeSheet: SheetId
  darkMode?: boolean
  currentView?: 'module' | 'about' | 'settings'
  aboutDepartment?: string | null
  language?: 'zh' | 'en'
  darkModeValue?: boolean
  onDarkModeChange?: (dark: boolean) => void
  onLanguageChange?: (lang: 'zh' | 'en') => void
}

export default function MainContent({
  selectedMethod,
  activeSheet,
  darkMode = false,
  currentView = 'module',
  aboutDepartment = null,
  language = 'zh',
  darkModeValue = false,
  onDarkModeChange,
  onLanguageChange,
}: MainContentProps) {
  const isEn = language === 'en'
  const appTitle = appTitleForLang(language)
  const appSubtitle = appSubtitleForLang(language)
  const { setAssistantSnapshot } = useAssistantSnapshotOptional()
  const calcCtx = useCalcOptional()

  useEffect(() => {
    const mats = calcCtx?.materials ?? []
    const preview = mats.slice(0, 12).map((m) => m.name)
    setAssistantSnapshot({
      currentView,
      language,
      aboutDepartment: aboutDepartment ?? null,
      selectedMethod: selectedMethod
        ? { smeltTypeName: selectedMethod.smeltTypeName, smeltMethodName: selectedMethod.smeltMethodName }
        : null,
      activeSheet,
      materialCount: mats.length,
      mixTotalWeight: calcCtx?.mixResult?.totalWeight ?? null,
      totalCostPerHour: calcCtx?.totalCost ?? 0,
      materialsPreview: preview,
    })
  }, [
    activeSheet,
    aboutDepartment,
    calcCtx,
    currentView,
    language,
    selectedMethod,
    setAssistantSnapshot,
  ])

  if (currentView === 'about' && aboutDepartment) {
    return <AboutPage darkMode={darkMode} language={language} aboutDepartment={aboutDepartment} />
  }

  if (currentView === 'settings') {
    return (
      <SettingsPage
        darkMode={darkMode}
        language={language}
        darkModeValue={darkModeValue}
        onDarkModeChange={onDarkModeChange}
        onLanguageChange={onLanguageChange}
      />
    )
  }

  if (!selectedMethod) {
    return (
      <div className={`flex-1 flex items-center justify-center ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
        <div className={darkMode ? 'text-gray-400' : 'text-gray-500'}>
          {isEn ? 'Please select a smelting method from the left sidebar.' : '请从左侧选择冶炼方法'}
        </div>
      </div>
    )
  }

  const sheetDescriptions: Record<SheetId, string> = {
    raw_material: isEn ? 'Raw feed, solvent, target slag type, phase analysis, oxygen-enriched air' : '原料参数、熔剂、目标渣型、物相分析、富氧空气',
    product: isEn ? 'Element distribution, slag, matte, noble antimony, Sb2O3 powder, flue gas' : '元素分配系数、熔炼渣、锑锍、贵锑、锑氧粉、烟气组分',
    heat_balance: isEn ? 'Heat balance (Coming soon)' : '热平衡计算（待实现）',
    furnace: isEn ? 'Furnace design (Coming soon)' : '炉型计算（待实现）',
  }

  const selectedMethodDisplayName = (() => {
    if (!isEn) return selectedMethod.smeltMethodName
    const smeltType = SMELT_TYPES.find((s) => s.id === selectedMethod.smeltTypeId)
    const method = smeltType?.methods.find((m) => m.id === selectedMethod.smeltMethodId)
    if (!method) return selectedMethod.smeltMethodName
    if (method.id === 'oxy-side-blast') return 'Oxygen-Enriched Side-Blown'
    if (method.id === 'flash') return 'Flash Smelting'
    return method.name
  })()

  return (
    <div className={`flex-[4] min-h-0 flex flex-col overflow-hidden ${darkMode ? 'bg-gray-800' : 'bg-gray-50'}`}>
      <div className="flex-shrink-0 px-6 pt-4 pb-2">
        <h1 className={`text-2xl font-bold mb-1 ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}>{appTitle}</h1>
        <p className={`text-sm mb-4 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{appSubtitle}</p>
        <h2 className={`text-lg font-semibold mb-1 ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>{selectedMethodDisplayName}</h2>
        {selectedMethod.description && (
          <p className={`text-sm leading-relaxed max-w-3xl ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>{selectedMethod.description}</p>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="w-full max-w-[1600px] mx-auto p-6">
          {activeSheet === 'raw_material' && (
            <ErrorBoundary>
              <div className="flex flex-col gap-6">
                <RawMaterialPhaseOxygen darkMode={darkMode} language={language} />
              </div>
            </ErrorBoundary>
          )}
          {activeSheet === 'product' && (
            <ErrorBoundary>
              <ProductDisplay darkMode={darkMode} language={language} />
            </ErrorBoundary>
          )}
          {activeSheet === 'heat_balance' && (
            <>
              <div className={`${cardBase(darkMode)} mb-6`}>
                <p className={descText(darkMode)}>{sheetDescriptions.heat_balance}</p>
                <div className={`p-6 rounded-lg border-2 border-dashed ${darkMode ? 'border-gray-600 bg-gray-800/40 text-gray-400' : 'border-gray-300 bg-gray-50 text-gray-500'}`}>
                  {isEn ? 'Feature under development, coming soon.' : '功能开发中，敬请期待'}
                </div>
              </div>
              <ElementDistributionFab darkMode={darkMode} />
            </>
          )}
          {activeSheet === 'furnace' && (
            <>
              <div className={`${cardBase(darkMode)} mb-6`}>
                <p className={descText(darkMode)}>{sheetDescriptions.furnace}</p>
                <div className={`p-6 rounded-lg border-2 border-dashed ${darkMode ? 'border-gray-600 bg-gray-800/40 text-gray-400' : 'border-gray-300 bg-gray-50 text-gray-500'}`}>
                  {isEn ? 'Feature under development, coming soon.' : '功能开发中，敬请期待'}
                </div>
              </div>
              <ElementDistributionFab darkMode={darkMode} />
            </>
          )}
        </div>
      </div>
    </div>
  )
}
