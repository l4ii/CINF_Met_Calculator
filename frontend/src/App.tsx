import { useState, useEffect, useRef } from 'react'
import Sidebar from './components/Sidebar'
import MainContent from './components/MainContent'
import LicenseActivation from './components/LicenseActivation'
import AssistantPanel from './components/AssistantPanel'
import { AssistantProvider } from './context/AssistantContext'
import { CalcProvider } from './context/CalcContext'
import type { SelectedMethod, SheetId } from './types'
import {
  APP_NAME_EN,
  APP_NAME_ZH,
  APP_ORG_NAME_EN,
  APP_ORG_NAME_ZH,
  APP_TAGLINE_MAIN_EN,
  APP_TAGLINE_ZH,
} from './constants/appCopy'

const BOOT_LOGO_SRC = './icon.png'

function LicenseCheckingSplash({ language }: { language: 'zh' | 'en' }) {
  const [logoOk, setLogoOk] = useState(true)
  const appName = language === 'en' ? APP_NAME_EN : APP_NAME_ZH
  const tagline = language === 'en' ? APP_TAGLINE_MAIN_EN : APP_TAGLINE_ZH
  const org = language === 'en' ? APP_ORG_NAME_EN : APP_ORG_NAME_ZH
  const lines =
    language === 'en'
      ? ['Verifying offline license…', 'Starting local assistant service…']
      : ['正在校验离线许可…', '正在启动本地助手服务…']

  return (
    <div className="relative isolate flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden bg-[radial-gradient(ellipse_120%_80%_at_50%_-20%,rgba(59,130,246,0.12),transparent)] px-4">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,transparent,rgba(248,250,252,0.92))]" />
      <div className="relative z-10 flex max-w-lg flex-col items-center text-center">
        <div className="mb-5 flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl bg-white shadow-lg ring-1 ring-slate-200">
          {logoOk ? (
            <img src={BOOT_LOGO_SRC} alt="" className="h-full w-full object-contain p-2" onError={() => setLogoOk(false)} />
          ) : (
            <span className="text-lg font-black text-slate-800">CINF</span>
          )}
        </div>
        <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">{appName}</h1>
        <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-600">{tagline}</p>
        <div className="mt-8 flex flex-col items-center gap-3">
          <div className="h-9 w-9 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" aria-hidden />
          <div className="space-y-1 text-xs text-slate-500">
            {lines.map((t) => (
              <p key={t}>{t}</p>
            ))}
          </div>
        </div>
        <p className="mt-10 text-[11px] text-slate-400">{org}</p>
      </div>
    </div>
  )
}

function initialLicenseGate(): 'unknown' | 'ok' | 'blocked' {
  if (typeof window === 'undefined') return 'ok'
  return (window as { electronAPI?: { license?: unknown } }).electronAPI?.license ? 'unknown' : 'ok'
}

function App() {
  const [selectedMethod, setSelectedMethod] = useState<SelectedMethod | null>(null)
  const [activeSheet, setActiveSheet] = useState<SheetId>('raw_material')
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem('darkMode') === 'true'
  })
  const [language, setLanguage] = useState<'zh' | 'en'>(() => {
    if (typeof window === 'undefined') return 'zh'
    const s = localStorage.getItem('language')
    return s === 'en' || s === 'zh' ? s : 'zh'
  })
  const [currentView, setCurrentView] = useState<'module' | 'about' | 'settings'>('module')
  const [aboutDepartment, setAboutDepartment] = useState<string | null>(null)
  const [licenseGate, setLicenseGate] = useState<'unknown' | 'ok' | 'blocked'>(initialLicenseGate)
  const appReadySent = useRef(false)

  useEffect(() => {
    const lic = (window as { electronAPI?: { license?: { getStatus: () => Promise<{ ok: boolean }> } } }).electronAPI?.license
    if (!lic) return
    void lic.getStatus().then((s) => {
      setLicenseGate(s.ok ? 'ok' : 'blocked')
    })
  }, [])

  useEffect(() => {
    if (licenseGate === 'unknown') return
    if (appReadySent.current) return
    appReadySent.current = true
    ;(window as { electronAPI?: { appReady?: () => void } }).electronAPI?.appReady?.()
  }, [licenseGate])

  useEffect(() => {
    localStorage.setItem('darkMode', darkMode.toString())
  }, [darkMode])

  useEffect(() => {
    localStorage.setItem('language', language)
  }, [language])

  // 科研创新中心配图：预载缩略图；空闲后再预载高清原图（与 Flow 一致）
  const RESEARCH_PLATFORM_THUMB_URLS = [
    './info1-thumb.jpg',
    './info2-thumb.jpg',
    './info3-thumb.jpg',
    './info4-thumb.jpg',
    './info5-thumb.jpg',
  ] as const
  const RESEARCH_PLATFORM_FULL_URLS = [
    './info1.jpg',
    './info2.jpg',
    './info3.jpg',
    './info4.jpg',
    './info5.jpg',
  ] as const

  useEffect(() => {
    const warm = (urls: readonly string[]) => {
      urls.forEach((src) => {
        const img = new Image()
        img.src = src
      })
    }
    warm(RESEARCH_PLATFORM_THUMB_URLS)
    const runFull = () => warm(RESEARCH_PLATFORM_FULL_URLS)
    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      window.requestIdleCallback(runFull, { timeout: 4000 })
    } else {
      setTimeout(runFull, 1200)
    }
  }, [])

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [darkMode])

  const handleMethodSelect = (method: SelectedMethod) => {
    setSelectedMethod(method)
    setActiveSheet('raw_material')
    setCurrentView('module')
    setAboutDepartment(null)
  }

  const handleShowAbout = (department: string) => {
    setAboutDepartment(department)
    setCurrentView('about')
    setSelectedMethod(null)
  }

  const handleShowSettings = () => {
    setCurrentView('settings')
    setSelectedMethod(null)
    setAboutDepartment(null)
  }

  if (licenseGate === 'blocked') {
    return <LicenseActivation language={language} onActivated={() => setLicenseGate('ok')} />
  }

  if (licenseGate === 'unknown') {
    return <LicenseCheckingSplash language={language} />
  }

  return (
    <AssistantProvider>
      <CalcProvider>
        <div className={`relative flex h-screen overflow-hidden ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
          <Sidebar
            selectedMethod={selectedMethod}
            activeSheet={activeSheet}
            onMethodSelect={handleMethodSelect}
            onSheetSelect={setActiveSheet}
            darkMode={darkMode}
            language={language}
            onShowAbout={handleShowAbout}
            onShowSettings={handleShowSettings}
            currentView={currentView}
            aboutDepartment={aboutDepartment}
          />
          <MainContent
            selectedMethod={selectedMethod}
            activeSheet={activeSheet}
            darkMode={darkMode}
            currentView={currentView}
            aboutDepartment={aboutDepartment}
            language={language}
            darkModeValue={darkMode}
            onDarkModeChange={setDarkMode}
            onLanguageChange={setLanguage}
          />
          <AssistantPanel darkMode={darkMode} language={language} onSheetSelect={setActiveSheet} />
        </div>
      </CalcProvider>
    </AssistantProvider>
  )
}

export default App
