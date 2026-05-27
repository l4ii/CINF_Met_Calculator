import { useEffect, useState } from 'react'
import { SMELT_TYPES, type SelectedMethod, type SheetId } from '../types'
import RawMaterialPhaseOxygen from './modules/RawMaterialPhaseOxygen'
import ProductDisplay from './modules/ProductDisplay'
import LeadFlashBlendOptimizer from './modules/LeadFlashBlendOptimizer'
import CopperWorkflow from './modules/CopperWorkflow'
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
  onSheetSelect?: (sheet: SheetId) => void
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
  onSheetSelect,
}: MainContentProps) {
  const isEn = language === 'en'
  const appTitle = appTitleForLang(language)
  const appSubtitle = appSubtitleForLang(language)
  const { setAssistantSnapshot } = useAssistantSnapshotOptional()
  const calcCtx = useCalcOptional()
  const [copperCaseTitleDraft, setCopperCaseTitleDraft] = useState('')
  const [hasActiveCopperCase, setHasActiveCopperCase] = useState(false)

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
          {isEn ? 'Please select a smelting method from the left sidebar.' : '请从左侧选择冶炼类型'}
        </div>
      </div>
    )
  }

  const sheetDescriptions: Record<SheetId, string> = {
    raw_material: isEn ? 'Raw feed, solvent, target slag type, phase analysis, oxygen-enriched air' : '原料参数、熔剂、目标渣型、物相分析、富氧空气',
    product: isEn ? 'Element distribution, slag, matte, noble antimony, Sb2O3 powder, flue gas' : '元素分配系数、熔炼渣、锑锍、贵锑、锑氧粉、烟气组分',
    heat_balance: isEn ? 'Heat balance (Coming soon)' : '热平衡计算（待实现）',
    furnace: isEn ? 'Furnace design (Coming soon)' : '炉型计算（待实现）',
    cu_smelting: isEn ? 'Copper smelting' : '铜熔炼',
    cu_converting: isEn ? 'Copper converting' : '铜吹炼',
    cu_refining: isEn ? 'Copper refining' : '铜精炼',
    cu_equipment: isEn ? 'Copper equipment selection' : '铜设备选型',
  }

  const selectedMethodDisplayName = (() => {
    if (!isEn) return selectedMethod.smeltMethodName
    const smeltType = SMELT_TYPES.find((s) => s.id === selectedMethod.smeltTypeId)
    const method = smeltType?.methods.find((m) => m.id === selectedMethod.smeltMethodId)
    if (!method) return selectedMethod.smeltMethodName
    if (method.id === 'copper') return 'Copper Smelting'
    if (method.id === 'oxy-side-blast') return 'Oxygen-Enriched Side-Blown'
    if (method.id === 'flash') return 'Flash Smelting'
    return method.name
  })()
  const isLeadFlash = selectedMethod.smeltTypeId === 'pb' && selectedMethod.smeltMethodId === 'flash'
  const isCopper = selectedMethod.smeltTypeId === 'cu'
  const copperHeaderTitle = copperCaseTitleDraft || selectedMethodDisplayName
  const requestCopperWorkspaceBack = () => {
    if (typeof window === 'undefined') {
      onSheetSelect?.('raw_material')
      return
    }
    window.dispatchEvent(new CustomEvent('metcal:copper-back-workspace'))
  }

  return (
    <div className={`flex-[4] min-h-0 flex flex-col overflow-hidden ${darkMode ? 'bg-gray-800' : 'bg-gray-50'}`}>
      <div className="flex-shrink-0 px-6 pt-4 pb-2">
        <h1 className={`text-2xl font-bold mb-1 ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}>{appTitle}</h1>
        <p className={`text-sm mb-4 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{appSubtitle}</p>
        {isCopper && hasActiveCopperCase ? (
          <div className="mb-1 flex items-center gap-2">
            <button
              type="button"
              aria-label="返回工作区"
              title="返回工作区"
              className={`flex h-8 w-8 items-center justify-center rounded border text-lg font-semibold leading-none transition-colors ${
                darkMode
                  ? 'border-gray-600 bg-gray-800 text-gray-100 hover:bg-gray-700'
                  : 'border-gray-300 bg-white text-gray-800 hover:bg-gray-100'
              }`}
              onClick={requestCopperWorkspaceBack}
            >
              ‹
            </button>
            <input
              aria-label="案例名"
              className={`ml-2 w-full max-w-xl rounded border bg-transparent px-2 py-1 text-lg font-semibold outline-none transition-colors ${
                darkMode
                  ? 'border-gray-700 text-gray-100 focus:border-blue-500'
                  : 'border-transparent text-gray-900 hover:border-gray-300 focus:border-blue-500'
              }`}
              value={copperHeaderTitle}
              onChange={(event) => setCopperCaseTitleDraft(event.target.value)}
            />
          </div>
        ) : (
          <h2 className={`text-lg font-semibold mb-1 ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>{selectedMethodDisplayName}</h2>
        )}
        {selectedMethod.description && (
          <p className={`text-sm leading-relaxed max-w-3xl ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>{selectedMethod.description}</p>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="w-full max-w-[1600px] mx-auto p-6">
          {isCopper && (
            <ErrorBoundary>
              <CopperWorkflow
                darkMode={darkMode}
                language={language}
                activeSheet={activeSheet}
                onStageSelect={onSheetSelect ?? (() => undefined)}
                caseTitleDraft={copperCaseTitleDraft}
                onActiveCaseNameChange={(name) => {
                  setHasActiveCopperCase(Boolean(name))
                  setCopperCaseTitleDraft(name ?? '')
                }}
              />
            </ErrorBoundary>
          )}
          {!isCopper && activeSheet === 'raw_material' && (
            <ErrorBoundary>
              <div className="flex flex-col gap-6">
                {isLeadFlash ? (
                  <LeadFlashBlendOptimizer darkMode={darkMode} language={language} />
                ) : (
                  <RawMaterialPhaseOxygen darkMode={darkMode} language={language} />
                )}
              </div>
            </ErrorBoundary>
          )}
          {!isCopper && activeSheet === 'product' && (
            <ErrorBoundary>
              {isLeadFlash ? (
                <div className={`${cardBase(darkMode)} mb-6`}>
                  <p className={descText(darkMode)}>
                    {isEn
                      ? 'Phase calculation for lead flash smelting will use the optimized blend from the blending page and calculate sulfide/oxide phase assumptions.'
                      : '物相计算将读取配矿计算得到的优化混料，并进一步计算硫化物、氧化物与返料物相假设。当前先完成约束配矿工作流。'}
                  </p>
                  <div className={`p-6 rounded-lg border-2 border-dashed ${darkMode ? 'border-gray-600 bg-gray-800/40 text-gray-400' : 'border-gray-300 bg-gray-50 text-gray-500'}`}>
                    {isEn ? 'Lead flash phase calculation is under development.' : '闪速炼铅物相计算开发中。'}
                  </div>
                </div>
              ) : (
                <ProductDisplay darkMode={darkMode} language={language} />
              )}
            </ErrorBoundary>
          )}
          {!isCopper && activeSheet === 'heat_balance' && (
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
          {!isCopper && activeSheet === 'furnace' && (
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
