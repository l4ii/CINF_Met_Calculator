import { useState, useEffect, useMemo } from 'react'
import {
  appTitleForLang,
  APP_NAME_ZH,
  APP_ORG_NAME_EN,
  APP_ORG_NAME_ZH,
  APP_SHORT_NAME_EN,
  SETTINGS_ASSISTANT_STATUS_UI,
  SETTINGS_LEGAL,
  SETTINGS_OFFLINE_LICENSE_UI,
  SETTINGS_PACKAGE_INFO,
} from '../../constants/appCopy'
import { API_BASE_URL } from '../../config/api'
import { formatUpdateError } from '../../utils/formatUpdateError'

export interface SettingsPageProps {
  darkMode: boolean
  language: 'zh' | 'en'
  darkModeValue: boolean
  onDarkModeChange?: (dark: boolean) => void
  onLanguageChange?: (lang: 'zh' | 'en') => void
}

export default function SettingsPage({
  darkMode,
  language,
  darkModeValue,
  onDarkModeChange,
  onLanguageChange,
}: SettingsPageProps) {
  const appTitle = appTitleForLang(language)
  const [currentVersion, setCurrentVersion] = useState<string>('')
  const [updateStatus, setUpdateStatus] = useState<'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'error'>('idle')
  const [updateInfo, setUpdateInfo] = useState<{ version?: string; releaseNotes?: string } | null>(null)
  const [updateProgress, setUpdateProgress] = useState<number>(0)
  const [updateError, setUpdateError] = useState<string | null>(null)
  const [licenseInfo, setLicenseInfo] = useState<{
    ok: boolean
    machineId: string
    expiresAtMs: number | null
  } | null>(null)
  const [licenseInput, setLicenseInput] = useState('')
  const [licenseBusy, setLicenseBusy] = useState(false)
  const [licenseMsg, setLicenseMsg] = useState<string | null>(null)
  const [licenseCopyOk, setLicenseCopyOk] = useState(false)
  const [deployInfo, setDeployInfo] = useState<{
    assistantLocalDeploy?: boolean
    version?: string
    packaged?: boolean
  } | null>(null)
  const [assistantStatus, setAssistantStatus] = useState<Record<string, unknown> | 'loading' | null>('loading')

  const leg = SETTINGS_LEGAL[language]
  const licUi = SETTINGS_OFFLINE_LICENSE_UI[language]
  const hasElectronLicense =
    typeof window !== 'undefined' &&
    !!(window as { electronAPI?: { license?: unknown } }).electronAPI?.license

  const pkgInfo = SETTINGS_PACKAGE_INFO[language]
  const astUi = SETTINGS_ASSISTANT_STATUS_UI[language]

  const feedbackMail = useMemo(() => {
    const subZh = `【${APP_NAME_ZH}】软件建议与反馈`
    const subEn = `[${APP_SHORT_NAME_EN}] Feedback`
    const bodyZh = `软件名称：${APP_NAME_ZH}\n\n建议/反馈类型：□ 功能建议  □ 问题反馈  □ 其他\n\n内容说明：\n\n\n\n`
    const bodyEn = `Application: ${APP_SHORT_NAME_EN}\n\nType: feature / bug / other\n\nDetails:\n\n`
    if (language === 'en') {
      return `mailto:xuqianglai@outlook.com?subject=${encodeURIComponent(subEn)}&body=${encodeURIComponent(bodyEn)}`
    }
    return `mailto:xuqianglai@outlook.com?subject=${encodeURIComponent(subZh)}&body=${encodeURIComponent(bodyZh)}`
  }, [language])

  useEffect(() => {
    if (typeof window !== 'undefined' && (window as any).electronAPI?.update) {
      ;(window as any).electronAPI.update
        .getAppVersion()
        .then((v: string) => setCurrentVersion(v))
        .catch(() => setCurrentVersion('1.0.0'))
    } else {
      setCurrentVersion('1.0.0')
    }
  }, [])

  useEffect(() => {
    const api = (window as { electronAPI?: { license?: { getStatus: () => Promise<unknown> } } }).electronAPI?.license
    if (!api) return
    void api.getStatus().then((s) => {
      const st = s as { ok?: boolean; machineId?: string; expiresAtMs?: number | null }
      setLicenseInfo({
        ok: !!st.ok,
        machineId: st.machineId || '',
        expiresAtMs: st.expiresAtMs != null ? st.expiresAtMs : null,
      })
    })
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined' || !(window as any).electronAPI?.update) return
    const api = (window as any).electronAPI.update
    api.onUpdateChecking(() => {
      setUpdateStatus('checking')
      setUpdateError(null)
    })
    api.onUpdateAvailable((info: any) => {
      setUpdateStatus('available')
      setUpdateInfo({ version: info.version, releaseNotes: info.releaseNotes })
    })
    api.onUpdateNotAvailable(() => setUpdateStatus('idle'))
    api.onUpdateError((err: any) => {
      setUpdateStatus('error')
      const raw = err.message || '更新检查失败'
      setUpdateError(formatUpdateError(raw, language))
    })
    api.onUpdateDownloadProgress((p: any) => {
      setUpdateStatus('downloading')
      setUpdateProgress(p.percent || 0)
    })
    api.onUpdateDownloaded((info: any) => {
      setUpdateStatus('downloaded')
      setUpdateInfo({ version: info.version })
    })
    return () => {
      api.removeAllListeners('update-checking')
      api.removeAllListeners('update-available')
      api.removeAllListeners('update-not-available')
      api.removeAllListeners('update-error')
      api.removeAllListeners('update-download-progress')
      api.removeAllListeners('update-downloaded')
    }
  }, [language])

  useEffect(() => {
    const api = (window as { electronAPI?: { getDeployInfo?: () => Promise<unknown> } }).electronAPI?.getDeployInfo
    if (!api) return
    void api()
      .then((x) =>
        setDeployInfo(x as { assistantLocalDeploy?: boolean; version?: string; packaged?: boolean } | null)
      )
      .catch(() => setDeployInfo(null))
  }, [])

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      let tid: number | undefined
      try {
        const ac = new AbortController()
        tid = window.setTimeout(() => ac.abort(), 8000)
        const res = await fetch(`${API_BASE_URL}/assistant/status`, { signal: ac.signal })
        const j = (await res.json()) as Record<string, unknown>
        if (!cancelled) setAssistantStatus(j)
      } catch {
        if (!cancelled) setAssistantStatus(null)
      } finally {
        if (tid !== undefined) window.clearTimeout(tid)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [])

  const handleCheckForUpdates = async () => {
    if (!(window as any).electronAPI?.update) {
      setUpdateError(formatUpdateError('当前环境不支持自动更新', language))
      setUpdateStatus('error')
      return
    }
    try {
      setUpdateStatus('checking')
      setUpdateError(null)
      const result = await (window as any).electronAPI.update.checkForUpdates()
      if (result.error) {
        setUpdateStatus('error')
        setUpdateError(formatUpdateError(result.error, language))
      }
    } catch (e: any) {
      setUpdateStatus('error')
      setUpdateError(formatUpdateError(e.message || '检查更新失败', language))
    }
  }

  const handleDownloadUpdate = async () => {
    if (!(window as any).electronAPI?.update) return
    try {
      setUpdateStatus('downloading')
      setUpdateProgress(0)
      await (window as any).electronAPI.update.downloadUpdate()
    } catch (e: any) {
      setUpdateError(formatUpdateError(e.message || '下载失败', language))
    }
  }

  const handleInstallUpdate = async () => {
    if (!(window as any).electronAPI?.update) return
    await (window as any).electronAPI.update.installUpdate()
  }

  const cardCls = `rounded-xl border p-5 ${darkMode ? 'bg-gray-700/50 border-gray-600' : 'bg-white border-gray-200'}`
  const sectionTitleCls = `text-sm font-semibold mb-4 flex items-center gap-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`
  const accentBorder = darkMode ? 'border-l-blue-500' : 'border-l-blue-600'

  const t = {
    pageTitle: language === 'en' ? 'Settings' : '设置',
    pageSubtitle:
      language === 'en'
        ? 'Display, language, updates, legal notices and feedback.'
        : '管理显示与语言、检查更新、查看声明与反馈方式',
    orgLine:
      language === 'en'
        ? `Version ${currentVersion || '—'} · ${APP_ORG_NAME_EN}`
        : `版本 ${currentVersion || '—'} · ${APP_ORG_NAME_ZH}`,
    appearance: language === 'en' ? 'Appearance' : '外观与偏好',
    displayMode: language === 'en' ? 'Theme' : '显示模式',
    light: language === 'en' ? 'Light' : '浅色',
    lightHint: language === 'en' ? 'Day' : '日间',
    dark: language === 'en' ? 'Dark' : '暗色',
    darkHint: language === 'en' ? 'Easier on eyes' : '护眼',
    uiLang: language === 'en' ? 'Language' : '界面语言',
    feedbackSection: language === 'en' ? 'Feedback & updates' : '反馈与更新',
    feedbackTitle: language === 'en' ? 'Suggestions & feedback' : '建议与反馈',
    feedbackDesc:
      language === 'en'
        ? 'Feature ideas, issues or cooperation—contact the development team.'
        : '功能建议、问题反馈或合作意向，欢迎联系开发团队。',
    feedbackBtn: language === 'en' ? 'Email the team' : '联系开发团队',
    appUpdate: language === 'en' ? 'App updates' : '应用更新',
    currentVer: language === 'en' ? 'Current version' : '当前版本',
    checkBtn: language === 'en' ? 'Check for updates' : '检查更新',
    checking: language === 'en' ? 'Checking for updates…' : '正在检查更新...',
    newVer: language === 'en' ? 'New version' : '发现新版本',
    downloadBtn: language === 'en' ? 'Download update' : '下载更新',
    downloading: language === 'en' ? 'Downloading' : '正在下载',
    downloaded: language === 'en' ? 'Update ready. Restart to install.' : '更新已下载，重启后安装',
    installBtn: language === 'en' ? 'Restart and install' : '立即重启并安装',
    retry: language === 'en' ? 'Retry' : '重试',
    browserNoUpdate: language === 'en' ? 'No auto-update in browser preview.' : '（浏览器环境下无自动更新）',
    appVerOnly: language === 'en' ? 'App version' : '应用版本',
    legal: language === 'en' ? 'Legal' : '法律与声明',
    packageBuild: language === 'en' ? 'Installer packaging' : '安装包构建',
    backendHint: language === 'en' ? 'Deploy metadata & updater hint' : '分发标记与更新提示',
    aiHintTitle: language === 'en' ? 'Assistant backend' : '助手后端检测',
    localDeployLabel: language === 'en' ? 'Local assistant deployment' : '本地助手部署',
    electronVersionLabel: language === 'en' ? 'Electron version' : 'Electron 版本',
    yes: language === 'en' ? 'Yes' : '是',
    no: language === 'en' ? 'No' : '否',
  }

  const inferenceReady =
    assistantStatus !== null &&
    assistantStatus !== 'loading' &&
    Boolean((assistantStatus as { inferenceReady?: boolean }).inferenceReady)
  const localDeployEnabled =
    assistantStatus !== null &&
    assistantStatus !== 'loading' &&
    (assistantStatus as { localDeploymentEnabled?: boolean }).localDeploymentEnabled !== false

  return (
    <div className={`flex-[4] overflow-y-auto ${darkMode ? 'bg-gray-800' : 'bg-gray-50'}`}>
      <div className="max-w-[calc(100vw*4/5)] mx-auto p-6" style={{ maxWidth: 'min(calc(100vw*4/5), 1440px)' }}>
        <div className="mb-8">
          <h1 className={`text-2xl sm:text-3xl font-bold mb-1 ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}>{t.pageTitle}</h1>
          <p className={`text-sm mb-5 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{t.pageSubtitle}</p>
          <div className={`rounded-xl border-l-4 ${accentBorder} ${darkMode ? 'bg-gray-700/60 border-gray-600' : 'bg-white border-gray-200'} px-5 py-4`}>
            <div className={`font-semibold ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}>{appTitle}</div>
            <div className={`text-sm mt-0.5 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>{t.orgLine}</div>
          </div>
        </div>

        <section className="mb-8">
          <h2 className={`${sectionTitleCls} border-l-4 ${accentBorder} pl-3`}>{t.packageBuild}</h2>
          <div className={`grid grid-cols-1 lg:grid-cols-2 gap-4`}>
            <div className={cardCls}>
              <h3 className={`text-base font-semibold mb-2 ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>{pkgInfo.title}</h3>
              <p className={`text-sm leading-relaxed mb-3 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>{pkgInfo.variantIntro}</p>
              <p className={`text-sm leading-relaxed mb-3 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>{pkgInfo.nsisNote}</p>
              <p className={`text-sm leading-relaxed ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>{pkgInfo.updateNote}</p>
              {deployInfo != null && (
                <div className={`mt-4 rounded-lg border px-3 py-2 text-xs ${darkMode ? 'border-gray-600 bg-gray-800/60 text-gray-300' : 'border-gray-200 bg-gray-50 text-gray-700'}`}>
                  <div>
                    {t.localDeployLabel}：{' '}
                    <span>{deployInfo.assistantLocalDeploy === false ? t.no : t.yes}</span>
                  </div>
                  <div className="mt-1">
                    {t.electronVersionLabel}：<span className="font-mono">{deployInfo.version ?? currentVersion}</span>
                  </div>
                </div>
              )}
            </div>
            <div className={cardCls}>
              <h3 className={`text-base font-semibold mb-2 ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>{t.aiHintTitle}</h3>
              {assistantStatus === 'loading' ? (
                <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>{astUi.loading}</p>
              ) : assistantStatus === null ? (
                <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>{astUi.unavailable}</p>
              ) : !localDeployEnabled ? (
                <p className={`text-sm ${darkMode ? 'text-amber-300' : 'text-amber-800'}`}>{astUi.localDeployOff}</p>
              ) : (
                <div className={`space-y-2 text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex h-2 w-2 rounded-full ${inferenceReady ? 'bg-green-500' : 'bg-amber-500'}`}
                      aria-hidden
                    />
                    {inferenceReady ? astUi.inferenceReady : astUi.inferenceNotReady}
                  </div>
                  {typeof assistantStatus.knowledgeLoadedChars === 'number' ? (
                    <div className="text-xs opacity-90">
                      {astUi.knowledgeChars} {assistantStatus.knowledgeLoadedChars}
                    </div>
                  ) : null}
                  {(assistantStatus as { failureDiagnosticZh?: string }).failureDiagnosticZh &&
                  language === 'zh' ? (
                    <p className={`text-xs leading-relaxed ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                      {(assistantStatus as { failureDiagnosticZh?: string }).failureDiagnosticZh}
                    </p>
                  ) : null}
                  {(assistantStatus as { failureDiagnosticEn?: string }).failureDiagnosticEn &&
                  language === 'en' ? (
                    <p className={`text-xs leading-relaxed ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                      {(assistantStatus as { failureDiagnosticEn?: string }).failureDiagnosticEn}
                    </p>
                  ) : null}
                </div>
              )}
              <p className={`text-xs mt-4 ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>{t.backendHint}</p>
            </div>
          </div>
        </section>

        {hasElectronLicense && (
          <section className="mb-8 mt-2">
            <h2
              className={`text-sm font-semibold mb-3 flex items-center gap-2 border-l-4 ${accentBorder} pl-3 ${
                darkMode ? 'text-gray-300' : 'text-gray-700'
              }`}
            >
              {licUi.offlineLicense}
            </h2>
            <div
              className={`rounded-xl border px-5 pt-3 pb-5 ${
                darkMode ? 'bg-gray-700/50 border-gray-600' : 'bg-white border-gray-200'
              }`}
            >
              {licenseInfo?.ok && (
                <div className={`text-sm mb-2.5 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  <span className="font-bold">{licUi.validUntil}</span>
                  <span className="mx-1.5 font-bold">：</span>
                  {licenseInfo.expiresAtMs == null ? (
                    <span className={`font-bold ${darkMode ? 'text-green-400' : 'text-green-700'}`}>{licUi.noExpiry}</span>
                  ) : (
                    <span
                      className={
                        (() => {
                          const days = (licenseInfo.expiresAtMs - Date.now()) / 86400000
                          if (days <= 30) return darkMode ? 'text-red-400 font-bold' : 'text-red-600 font-bold'
                          return darkMode ? 'text-green-400 font-bold' : 'text-green-700 font-bold'
                        })()
                      }
                    >
                      {new Date(licenseInfo.expiresAtMs).toLocaleDateString(language === 'en' ? 'en-US' : 'zh-CN', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                      })}
                    </span>
                  )}
                </div>
              )}
              <div className="text-sm font-medium mb-1.5 text-gray-700 dark:text-gray-300">{licUi.deviceCode}</div>
              <div className="flex flex-col sm:flex-row gap-2 items-stretch mb-4">
                <div
                  className={`flex-1 min-w-0 rounded-lg border px-3 py-2 font-mono text-xs break-all min-h-[2.5rem] flex items-center ${
                    darkMode ? 'bg-gray-800/80 border-gray-600 text-gray-200' : 'bg-gray-50 border-gray-200 text-gray-800'
                  }`}
                >
                  {licenseInfo?.machineId || '—'}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const id = licenseInfo?.machineId
                    if (!id) return
                    void navigator.clipboard.writeText(id).then(() => {
                      setLicenseCopyOk(true)
                      window.setTimeout(() => setLicenseCopyOk(false), 2000)
                    })
                  }}
                  disabled={!licenseInfo?.machineId}
                  className="shrink-0 w-full sm:w-24 rounded-lg text-sm font-medium bg-slate-100 dark:bg-gray-600 text-slate-800 dark:text-gray-200 hover:opacity-90 disabled:opacity-50 inline-flex items-center justify-center min-h-[2.5rem] sm:self-stretch"
                >
                  {licenseCopyOk ? licUi.copied : licUi.copyDev}
                </button>
              </div>
              <div className="text-sm font-medium mb-1.5 text-gray-700 dark:text-gray-300">{licUi.licenseCode}</div>
              <div className="flex flex-col sm:flex-row gap-2 items-stretch mb-2">
                <textarea
                  value={licenseInput}
                  onChange={(e) => {
                    setLicenseInput(e.target.value)
                    setLicenseMsg(null)
                  }}
                  rows={1}
                  placeholder={licUi.licensePlaceholder}
                  spellCheck={false}
                  className={`flex-1 min-w-0 rounded-lg border px-3 py-2 text-xs font-mono resize-y min-h-[2.5rem] ${
                    darkMode ? 'bg-gray-800/80 border-gray-600 text-gray-200' : 'bg-white border-gray-200 text-gray-800'
                  }`}
                />
                <button
                  type="button"
                  disabled={licenseBusy || !licenseInput.trim()}
                  onClick={async () => {
                    const api = (window as {
                      electronAPI?: {
                        license?: {
                          activate: (x: string) => Promise<{ ok: boolean; error?: string }>
                          getStatus: () => Promise<{ ok: boolean; machineId?: string; expiresAtMs?: number | null }>
                        }
                      }
                    }).electronAPI?.license
                    if (!api) return
                    setLicenseBusy(true)
                    setLicenseMsg(null)
                    try {
                      const r = await api.activate(licenseInput.trim())
                      if (r.ok) {
                        setLicenseMsg(licUi.licenseSaved)
                        setLicenseInput('')
                        const s = await api.getStatus()
                        setLicenseInfo({
                          machineId: s.machineId || '',
                          ok: !!s.ok,
                          expiresAtMs: s.expiresAtMs != null ? s.expiresAtMs : null,
                        })
                      } else {
                        setLicenseMsg(r.error || licUi.saveFailed)
                      }
                    } catch (e) {
                      setLicenseMsg((e as Error)?.message || licUi.saveFailed)
                    } finally {
                      setLicenseBusy(false)
                    }
                  }}
                  className="shrink-0 w-full sm:w-24 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 inline-flex items-center justify-center min-h-[2.5rem] sm:self-stretch px-2"
                >
                  {licenseBusy ? licUi.applyLicenseBusy : licUi.updateLicense}
                </button>
              </div>
              {licenseMsg && (
                <p
                  className={`text-sm mb-2 ${
                    licenseMsg === licUi.licenseSaved ? (darkMode ? 'text-green-400' : 'text-green-700') : 'text-red-600'
                  }`}
                >
                  {licenseMsg}
                </p>
              )}
            </div>
          </section>
        )}
        <section className="mb-8">
          <h2 className={`${sectionTitleCls} border-l-4 ${accentBorder} pl-3`}>{t.appearance}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className={cardCls}>
              <h3 className={`text-base font-semibold mb-3 ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>{t.displayMode}</h3>
              <div className="flex gap-2">
                <button
                  onClick={() => onDarkModeChange?.(false)}
                  className={`flex-1 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                    !darkModeValue ? 'bg-blue-600 text-white shadow' : darkMode ? 'bg-gray-600/80 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  <span className="font-medium">{t.light}</span>
                  <span className={`block text-xs mt-0.5 ${!darkModeValue ? 'opacity-90' : 'opacity-70'}`}>{t.lightHint}</span>
                </button>
                <button
                  onClick={() => onDarkModeChange?.(true)}
                  className={`flex-1 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                    darkModeValue ? 'bg-blue-600 text-white shadow' : darkMode ? 'bg-gray-600/80 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  <span className="font-medium">{t.dark}</span>
                  <span className={`block text-xs mt-0.5 ${darkModeValue ? 'opacity-90' : 'opacity-70'}`}>{t.darkHint}</span>
                </button>
              </div>
            </div>
            <div className={cardCls}>
              <h3 className={`text-base font-semibold mb-3 ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>{t.uiLang}</h3>
              <div className="flex gap-2">
                <button
                  onClick={() => onLanguageChange?.('zh')}
                  className={`flex-1 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${language === 'zh' ? 'bg-blue-600 text-white shadow' : darkMode ? 'bg-gray-600/80 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                >
                  中文
                </button>
                <button
                  onClick={() => onLanguageChange?.('en')}
                  className={`flex-1 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${language === 'en' ? 'bg-blue-600 text-white shadow' : darkMode ? 'bg-gray-600/80 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                >
                  English
                </button>
              </div>
            </div>
          </div>
        </section>
        <section className="mb-8">
          <h2 className={`${sectionTitleCls} border-l-4 ${accentBorder} pl-3`}>{t.feedbackSection}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className={cardCls}>
              <h3 className={`text-base font-semibold mb-2 ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>{t.feedbackTitle}</h3>
              <p className={`text-sm mb-4 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>{t.feedbackDesc}</p>
              <a
                href={feedbackMail}
                className="inline-flex items-center justify-center px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white transition-colors"
              >
                {t.feedbackBtn}
              </a>
            </div>
            {typeof window !== 'undefined' && (window as any).electronAPI?.update ? (
              <div className={cardCls}>
                <h3 className={`text-base font-semibold mb-2 ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>{t.appUpdate}</h3>
                <div className={`text-sm mb-3 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  {t.currentVer}{' '}
                  <span className="font-semibold text-blue-600">{currentVersion || '—'}</span>
                </div>
                <div className="space-y-3">
                  {updateStatus === 'idle' && (
                    <button onClick={handleCheckForUpdates} className="w-full px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white transition-colors">
                      {t.checkBtn}
                    </button>
                  )}
                  {updateStatus === 'checking' && (
                    <div className={`text-center py-2 text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                      <span className="inline-block animate-spin mr-2">⟳</span> {t.checking}
                    </div>
                  )}
                  {updateStatus === 'available' && updateInfo && (
                    <div className="space-y-3">
                      <div className={`p-3 rounded-lg text-sm ${darkMode ? 'bg-green-900/30 border border-green-700 text-green-300' : 'bg-green-50 border border-green-200 text-green-800'}`}>
                        <div className="font-medium">
                          {t.newVer} {updateInfo.version}
                        </div>
                        {updateInfo.releaseNotes && <div className={`mt-1 text-xs ${darkMode ? 'text-green-400' : 'text-green-700'}`}>{updateInfo.releaseNotes}</div>}
                      </div>
                      <button onClick={handleDownloadUpdate} className="w-full px-4 py-2 rounded-lg text-sm font-medium bg-green-600 hover:bg-green-700 text-white transition-colors">
                        {t.downloadBtn}
                      </button>
                    </div>
                  )}
                  {updateStatus === 'downloading' && (
                    <div className="space-y-2">
                      <div className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                        {t.downloading} {updateProgress}%
                      </div>
                      <div className={`w-full h-2 rounded-full overflow-hidden ${darkMode ? 'bg-gray-600' : 'bg-gray-200'}`}>
                        <div className="h-full bg-blue-500 transition-all duration-300" style={{ width: `${updateProgress}%` }} />
                      </div>
                    </div>
                  )}
                  {updateStatus === 'downloaded' && (
                    <div className="space-y-3">
                      <div className={`p-3 rounded-lg text-sm ${darkMode ? 'bg-green-900/30 border border-green-700 text-green-300' : 'bg-green-50 border border-green-200 text-green-800'}`}>{t.downloaded}</div>
                      <button onClick={handleInstallUpdate} className="w-full px-4 py-2 rounded-lg text-sm font-medium bg-green-600 hover:bg-green-700 text-white transition-colors">
                        {t.installBtn}
                      </button>
                    </div>
                  )}
                  {updateStatus === 'error' && (
                    <div className="space-y-3">
                      <div className={`p-3 rounded-lg text-sm ${darkMode ? 'bg-red-900/30 border border-red-700 text-red-300' : 'bg-red-50 border border-red-200 text-red-800'}`}>
                        {updateError || (language === 'en' ? 'Update check failed' : '更新检查失败')}
                      </div>
                      <button onClick={handleCheckForUpdates} className="w-full px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white transition-colors">
                        {t.retry}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className={cardCls}>
                <h3 className={`text-base font-semibold mb-2 ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>{t.appVerOnly}</h3>
                <div className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  {t.currentVer} <span className="font-semibold">{currentVersion || '—'}</span>
                  {t.browserNoUpdate}
                </div>
              </div>
            )}
          </div>
        </section>
        <section>
          <h2 className={`${sectionTitleCls} border-l-4 ${accentBorder} pl-3`}>{t.legal}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            <div className={cardCls}>
              <h3 className={`text-base font-semibold mb-3 ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>{leg.disclaimerTitle}</h3>
              <div className={`text-sm leading-relaxed space-y-2 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                <p>{leg.disclaimerP1}</p>
                <p>{leg.disclaimerP2}</p>
                <p>{leg.disclaimerP3}</p>
              </div>
            </div>
            <div className={cardCls}>
              <h3 className={`text-base font-semibold mb-3 ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>{leg.privacyTitle}</h3>
              <p className={`text-sm leading-relaxed ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>{leg.privacyP}</p>
            </div>
            <div className={`${cardCls} md:col-span-2 xl:col-span-1`}>
              <h3 className={`text-base font-semibold mb-3 ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>{leg.aiAssistantTitle}</h3>
              <p className={`text-sm leading-relaxed ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>{leg.aiAssistantP}</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
