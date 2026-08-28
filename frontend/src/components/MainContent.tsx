import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { getSelectedSmeltAlgorithm, type SelectedMethod, type SheetId } from '../types'
import ErrorBoundary from './ErrorBoundary'
import BackIconButton from './BackIconButton'
import { cardBase, descText } from '../theme/uiTheme'
import { useAssistantSnapshotOptional } from '../context/AssistantContext'
import { useCalcOptional } from '../context/CalcContext'

const CopperWorkflow = lazy(() => import('./modules/CopperWorkflow'))
const AntimonyWorkflow = lazy(() => import('./modules/antimony/AntimonyWorkflowShell'))
const LeadKivcetWorkflow = lazy(() => import('./modules/lead/LeadKivcetWorkflow'))
const AboutPage = lazy(() => import('./shell/AboutPage'))
const SettingsPage = lazy(() => import('./shell/SettingsPage'))

function ModuleLoadingFallback({ darkMode = false }: { darkMode?: boolean }) {
  return (
    <div className={`flex items-center justify-center p-12 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" aria-hidden />
      <span className="ml-3 text-sm">加载中…</span>
    </div>
  )
}

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
  onBackToHome?: () => void
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
  onBackToHome,
}: MainContentProps) {
  const isEn = language === 'en'
  const { setAssistantSnapshot } = useAssistantSnapshotOptional()
  const calcCtx = useCalcOptional()
  const [copperCaseTitleDraft, setCopperCaseTitleDraft] = useState('')
  const [hasActiveCopperCase, setHasActiveCopperCase] = useState(false)
  const mainScrollRef = useRef<HTMLDivElement>(null)
  const committedCopperCaseTitleRef = useRef('')
  const skipCopperTitleBlurCommitRef = useRef(false)
  const handleActiveCopperCaseNameChange = useCallback((name: string | null) => {
    setHasActiveCopperCase(Boolean(name))
    committedCopperCaseTitleRef.current = name ?? ''
    setCopperCaseTitleDraft((current) => {
      const next = name ?? ''
      return current === next ? current : next
    })
  }, [])
  const commitCopperCaseTitle = useCallback(() => {
    const nextName = copperCaseTitleDraft.trim()
    if (!nextName) {
      setCopperCaseTitleDraft(committedCopperCaseTitleRef.current)
      return
    }
    setCopperCaseTitleDraft(nextName)
    if (typeof window !== 'undefined') {
      const process = selectedMethod?.smeltTypeId === 'sb'
        ? 'antimony'
        : selectedMethod?.smeltTypeId === 'pb' && selectedMethod.smeltMethodId === 'kivcet'
          ? 'lead-kivcet'
          : 'copper'
      window.dispatchEvent(new CustomEvent(`metcal:${process}-rename-active-case`, { detail: { name: nextName } }))
    }
  }, [copperCaseTitleDraft, selectedMethod?.smeltTypeId])
  const cancelCopperCaseTitleEdit = useCallback(() => {
    setCopperCaseTitleDraft(committedCopperCaseTitleRef.current)
  }, [])

  useEffect(() => {
    mainScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }, [activeSheet])

  useEffect(() => {
    const mats = calcCtx?.materials ?? []
    const preview = mats.slice(0, 12).map((m) => m.name)
    setAssistantSnapshot((prev) => ({
      currentView,
      language,
      aboutDepartment: aboutDepartment ?? null,
      selectedMethod: selectedMethod
        ? {
            smeltTypeName: selectedMethod.smeltTypeName,
            sectionName: selectedMethod.sectionName,
            smeltMethodName: selectedMethod.smeltMethodName,
          }
        : null,
      activeSheet,
      materialCount: mats.length,
      mixTotalWeight: calcCtx?.mixResult?.totalWeight ?? null,
      totalCostPerHour: calcCtx?.totalCost ?? 0,
      materialsPreview: preview,
      heatAuxiliaryParams: prev?.heatAuxiliaryParams ?? null,
      heatAuxiliaryTrace: prev?.heatAuxiliaryTrace ?? null,
    }))
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
    return (
      <Suspense fallback={<ModuleLoadingFallback darkMode={darkMode} />}>
        <AboutPage
          darkMode={darkMode}
          language={language}
          aboutDepartment={aboutDepartment}
          onBackToHome={onBackToHome}
        />
      </Suspense>
    )
  }

  if (currentView === 'settings') {
    return (
      <Suspense fallback={<ModuleLoadingFallback darkMode={darkMode} />}>
        <SettingsPage
          darkMode={darkMode}
          language={language}
          darkModeValue={darkModeValue}
          onDarkModeChange={onDarkModeChange}
          onLanguageChange={onLanguageChange}
          onBackToHome={onBackToHome}
        />
      </Suspense>
    )
  }

  if (!selectedMethod) {
    return (
      <div className={`flex-1 min-w-0 flex items-center justify-center ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
        <div className={darkMode ? 'text-gray-400' : 'text-gray-500'}>
          {isEn ? 'Please select a smelting method from the left sidebar.' : '请从左侧选择冶炼类型'}
        </div>
      </div>
    )
  }

  const selectedMethodDisplayName = selectedMethod.smeltMethodName
  const selectedPathLabel = selectedMethod.sectionName
    ? `${selectedMethod.smeltTypeName} / ${selectedMethod.sectionName} / ${selectedMethodDisplayName}`
    : `${selectedMethod.smeltTypeName} / ${selectedMethodDisplayName}`
  const selectedAlgorithm = getSelectedSmeltAlgorithm(selectedMethod)
  const isCopperSideBlown = selectedAlgorithm === 'copper-side-blown'
  const isAntimonySideBlown = selectedAlgorithm === 'antimony-side-blown'
  const isLeadKivcet = selectedAlgorithm === 'lead-kivcet'
  const copperWorkflowMethodId = selectedMethod.smeltMethodId === 'side-blown' ? 'oxy-side-blast' : selectedMethod.smeltMethodId
  const antimonyWorkflowMethodId = selectedMethod.smeltMethodId === 'side-blown' ? 'oxy-side-blast' : selectedMethod.smeltMethodId
  const placeholderMessage = isEn
    ? `${selectedPathLabel} calculation module is under development.`
    : `${selectedPathLabel}计算模块开发中，敬请期待。`
  const requestWorkspaceBack = () => {
    if (typeof window === 'undefined') {
      onSheetSelect?.('raw_material')
      return
    }
    const process = isAntimonySideBlown ? 'antimony' : isLeadKivcet ? 'lead-kivcet' : 'copper'
    window.dispatchEvent(new CustomEvent(`metcal:${process}-back-workspace`))
  }
  const handleHeaderBack = () => {
    if (activeSheet !== 'raw_material') {
      if (isCopperSideBlown || isAntimonySideBlown) {
        requestWorkspaceBack()
      } else {
        onSheetSelect?.('raw_material')
      }
      return
    }
    onBackToHome?.()
  }
  const headerBackLabel = activeSheet === 'raw_material'
    ? isEn ? 'Back to Home' : '返回主页面'
    : isEn ? 'Back to Workspace' : '返回项目工作区'

  return (
    <div className={`flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden ${darkMode ? 'bg-gray-800' : 'bg-gray-50'}`}>
      <div className="flex-shrink-0 px-3 pt-3 pb-1 sm:px-4 2xl:px-6">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <BackIconButton label={headerBackLabel} darkMode={darkMode} onClick={handleHeaderBack} />
          {(isCopperSideBlown || isAntimonySideBlown) && activeSheet !== 'raw_material' && hasActiveCopperCase ? (
            <input
              aria-label="案例名"
              className={`ml-2 w-full max-w-xl rounded border bg-transparent px-2 py-1 text-lg font-semibold outline-none transition-colors ${
                darkMode
                  ? 'border-gray-700 text-gray-100 focus:border-blue-500'
                  : 'border-transparent text-gray-900 hover:border-gray-300 focus:border-blue-500'
              }`}
              value={copperCaseTitleDraft}
              onChange={(event) => setCopperCaseTitleDraft(event.target.value)}
              onBlur={() => {
                if (skipCopperTitleBlurCommitRef.current) {
                  skipCopperTitleBlurCommitRef.current = false
                  return
                }
                commitCopperCaseTitle()
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  commitCopperCaseTitle()
                  skipCopperTitleBlurCommitRef.current = true
                  event.currentTarget.blur()
                }
                if (event.key === 'Escape') {
                  event.preventDefault()
                  cancelCopperCaseTitleEdit()
                  skipCopperTitleBlurCommitRef.current = true
                  event.currentTarget.blur()
                }
              }}
            />
          ) : (
            <h1 className={`text-lg font-semibold ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>{selectedMethodDisplayName}</h1>
          )}
        </div>
        <div className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{selectedPathLabel}</div>
        {selectedMethod.description && (
          <p className={`text-sm leading-relaxed max-w-5xl ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>{selectedMethod.description}</p>
        )}
      </div>

      <div ref={mainScrollRef} className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div className="flex w-full max-w-none flex-1 flex-col px-3 pt-3 pb-0 xl:px-4 2xl:px-6">
          {isCopperSideBlown && (
            <ErrorBoundary>
              <Suspense fallback={<ModuleLoadingFallback darkMode={darkMode} />}>
                <CopperWorkflow
                  darkMode={darkMode}
                  language={language}
                  activeSheet={activeSheet}
                  onStageSelect={onSheetSelect ?? (() => undefined)}
                  smeltMethodId={copperWorkflowMethodId}
                  smeltMethodName={selectedMethod.smeltMethodName}
                  caseTitleDraft={copperCaseTitleDraft}
                  onActiveCaseNameChange={handleActiveCopperCaseNameChange}
                />
              </Suspense>
            </ErrorBoundary>
          )}
          {isAntimonySideBlown && (
            <ErrorBoundary>
              <Suspense fallback={<ModuleLoadingFallback darkMode={darkMode} />}>
                <AntimonyWorkflow
                  darkMode={darkMode}
                  language={language}
                  activeSheet={activeSheet}
                  onStageSelect={onSheetSelect ?? (() => undefined)}
                  smeltMethodId={antimonyWorkflowMethodId}
                  smeltMethodName={selectedMethod.smeltMethodName}
                  caseTitleDraft={copperCaseTitleDraft}
                  onActiveCaseNameChange={handleActiveCopperCaseNameChange}
                />
              </Suspense>
            </ErrorBoundary>
          )}
          {isLeadKivcet && (
            <ErrorBoundary>
              <Suspense fallback={<ModuleLoadingFallback darkMode={darkMode} />}>
                <LeadKivcetWorkflow
                  darkMode={darkMode}
                  language={language}
                  activeSheet={activeSheet}
                  onStageSelect={onSheetSelect ?? (() => undefined)}
                  smeltMethodId={selectedMethod.smeltMethodId}
                  smeltMethodName={selectedMethod.smeltMethodName}
                  caseTitleDraft={copperCaseTitleDraft}
                  onActiveCaseNameChange={handleActiveCopperCaseNameChange}
                />
              </Suspense>
            </ErrorBoundary>
          )}
          {selectedAlgorithm === 'none' && (
            <div className={`${cardBase(darkMode)} mb-6`}>
              <p className={descText(darkMode)}>{placeholderMessage}</p>
              <div className={`p-6 rounded-lg border-2 border-dashed ${darkMode ? 'border-gray-600 bg-gray-800/40 text-gray-400' : 'border-gray-300 bg-gray-50 text-gray-500'}`}>
                {isEn ? 'Feature under development, coming soon.' : '功能开发中，敬请期待'}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
