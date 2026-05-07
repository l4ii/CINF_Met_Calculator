import { useState, useEffect, useRef } from 'react'
import Sidebar from './components/Sidebar'
import MainContent from './components/MainContent'
import LicenseActivation from './components/LicenseActivation'
import { CalcProvider } from './context/CalcContext'
import type { SelectedMethod, SheetId } from './types'

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
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50 text-slate-600">
        {language === 'en' ? 'Loading…' : '正在加载…'}
      </div>
    )
  }

  return (
    <CalcProvider>
    <div className={`flex h-screen overflow-hidden ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
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
    </div>
    </CalcProvider>
  )
}

export default App
