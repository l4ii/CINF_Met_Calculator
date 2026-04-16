import { useState, useEffect } from 'react'
import Sidebar from './components/Sidebar'
import MainContent from './components/MainContent'
import { CalcProvider } from './context/CalcContext'
import type { SelectedMethod, SheetId } from './types'

function App() {
  const [selectedMethod, setSelectedMethod] = useState<SelectedMethod | null>(null)
  const [activeSheet, setActiveSheet] = useState<SheetId>('raw_material')
  const [darkMode, setDarkMode] = useState(false)
  const [language, setLanguage] = useState<'zh' | 'en'>('zh')
  const [currentView, setCurrentView] = useState<'module' | 'about' | 'settings'>('module')
  const [aboutDepartment, setAboutDepartment] = useState<string | null>(null)

  useEffect(() => {
    const savedDarkMode = localStorage.getItem('darkMode')
    const savedLanguage = localStorage.getItem('language')
    if (savedDarkMode === 'true') setDarkMode(true)
    if (savedLanguage === 'en' || savedLanguage === 'zh') setLanguage(savedLanguage as 'zh' | 'en')
  }, [])

  useEffect(() => {
    localStorage.setItem('darkMode', darkMode.toString())
  }, [darkMode])

  useEffect(() => {
    localStorage.setItem('language', language)
  }, [language])

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
