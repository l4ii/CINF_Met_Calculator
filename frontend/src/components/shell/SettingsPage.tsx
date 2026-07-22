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
import BackIconButton from '../BackIconButton'
import {
  readStoredUiScale,
  resetUiScale,
  setUiScale,
  UI_SCALE_PRESETS,
  type UiScalePreset,
} from '../../utils/uiScale'

export interface SettingsPageProps {
  darkMode: boolean
  language: 'zh' | 'en'
  darkModeValue: boolean
  onDarkModeChange?: (dark: boolean) => void
  onLanguageChange?: (lang: 'zh' | 'en') => void
  onBackToHome?: () => void
}

export default function SettingsPage({
  darkMode,
  language,
  darkModeValue,
  onDarkModeChange,
  onLanguageChange,
  onBackToHome,
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
  const [uiScalePercent, setUiScalePercent] = useState<UiScalePreset>(() => readStoredUiScale() as UiScalePreset)
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

  const cardCls = `rounded-lg border p-4 ${darkMode ? 'bg-gray-700/50 border-gray-600' : 'bg-white border-gray-200'}`
  const sectionTitleCls = `text-sm font-semibold mb-2.5 flex items-center gap-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`
  const accentBorder = darkMode ? 'border-l-blue-500' : 'border-l-blue-600'
  const fieldLabelCls = `text-xs font-medium mb-1.5 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`
  const segTrackCls = `flex w-full gap-1 rounded-lg p-1 ${darkMode ? 'bg-gray-800/80' : 'bg-gray-100'}`
  const segBtn = (active: boolean) =>
    `flex-1 min-w-0 rounded-md px-2 py-2 text-sm font-medium text-center transition-colors ${
      active
        ? 'bg-blue-600 text-white shadow-sm'
        : darkMode
          ? 'text-gray-300 hover:bg-gray-700'
          : 'text-gray-600 hover:bg-white'
    }`

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
    dark: language === 'en' ? 'Dark' : '暗色',
    uiLang: language === 'en' ? 'Language' : '界面语言',
    uiScale: language === 'en' ? 'Interface scale' : '界面缩放',
    uiScaleHint:
      language === 'en'
        ? 'Ctrl+wheel or Ctrl +/- / 0 also works.'
        : '亦可用 Ctrl+滚轮或 Ctrl+/-/0。',
    uiScaleReset: language === 'en' ? 'Reset 100%' : '重置 100%',
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
    packageAndAssistant: language === 'en' ? 'Installer & assistant' : '安装包与智能助手',
    packageMeta: language === 'en' ? 'Package metadata' : '安装包信息',
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
    <div className={`flex-1 min-w-0 overflow-y-auto ${darkMode ? 'bg-gray-800' : 'bg-gray-50'}`}>
      <div className="mx-auto w-full max-w-[1760px] px-5 py-4 sm:px-6 lg:px-8 2xl:px-10 2xl:py-5">
        <div className="mb-5">
          <BackIconButton label={language === 'en' ? 'Back to Home' : '返回主页面'} darkMode={darkMode} onClick={onBackToHome} className="mb-2" />
          <h1 className={`text-2xl font-bold mb-0.5 ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}>{t.pageTitle}</h1>
          <p className={`text-sm mb-3 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{t.pageSubtitle}</p>
          <div className={`rounded-lg border-l-4 ${accentBorder} ${darkMode ? 'bg-gray-700/60 border-gray-600' : 'bg-white border-gray-200'} px-4 py-3`}>
            <div className={`text-sm font-semibold ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}>{appTitle}</div>
            <div className={`text-xs mt-0.5 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>{t.orgLine}</div>
          </div>
        </div>

        <section className="mb-5">
          <h2 className={`${sectionTitleCls} border-l-4 ${accentBorder} pl-3`}>{t.appearance}</h2>
          <div className={cardCls}>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 xl:gap-5">
              <div>
                <div className={fieldLabelCls}>{t.displayMode}</div>
                <div className={segTrackCls} role="group" aria-label={t.displayMode}>
                  <button type="button" onClick={() => onDarkModeChange?.(false)} className={segBtn(!darkModeValue)}>
                    {t.light}
                  </button>
                  <button type="button" onClick={() => onDarkModeChange?.(true)} className={segBtn(darkModeValue)}>
                    {t.dark}
                  </button>
                </div>
              </div>
              <div>
                <div className={fieldLabelCls}>{t.uiLang}</div>
                <div className={segTrackCls} role="group" aria-label={t.uiLang}>
                  <button type="button" onClick={() => onLanguageChange?.('zh')} className={segBtn(language === 'zh')}>
                    中文
                  </button>
                  <button type="button" onClick={() => onLanguageChange?.('en')} className={segBtn(language === 'en')}>
                    English
                  </button>
                </div>
              </div>
              <div className="md:col-span-2 xl:col-span-1">
                <div className="mb-1.5 flex items-baseline justify-between gap-2">
                  <div className={`text-xs font-medium ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{t.uiScale}</div>
                  <div className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>{t.uiScaleHint}</div>
                </div>
                <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-stretch">
                  <div className={`${segTrackCls} min-w-0 flex-1`} role="group" aria-label={t.uiScale}>
                    {UI_SCALE_PRESETS.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => {
                          setUiScalePercent(preset)
                          setUiScale(preset)
                        }}
                        className={segBtn(uiScalePercent === preset)}
                      >
                        {preset}%
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    className={`shrink-0 rounded-md border px-3 py-2 text-sm font-medium transition-colors sm:w-28 ${
                      darkMode
                        ? 'border-gray-600 text-gray-200 hover:bg-gray-700'
                        : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                    }`}
                    onClick={() => {
                      const next = resetUiScale()
                      setUiScalePercent(next as UiScalePreset)
                    }}
                  >
                    {t.uiScaleReset}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {hasElectronLicense && (
          <section className="mb-5">
            <h2 className={`${sectionTitleCls} border-l-4 ${accentBorder} pl-3`}>{licUi.offlineLicense}</h2>
            <div className={cardCls}>
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
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 xl:gap-6">
                <div>
                  <div className={fieldLabelCls}>{licUi.deviceCode}</div>
                  <div className="flex flex-col items-stretch gap-2 sm:flex-row">
                    <div
                      className={`flex min-h-[2.5rem] flex-1 min-w-0 items-center break-all rounded-md border px-3 py-2 font-mono text-xs ${
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
                      className="inline-flex min-h-[2.5rem] w-full shrink-0 items-center justify-center rounded-md bg-slate-100 text-sm font-medium text-slate-800 hover:opacity-90 disabled:opacity-50 sm:w-24 dark:bg-gray-600 dark:text-gray-200"
                    >
                      {licenseCopyOk ? licUi.copied : licUi.copyDev}
                    </button>
                  </div>
                </div>
                <div>
                  <div className={fieldLabelCls}>{licUi.licenseCode}</div>
                  <div className="flex flex-col items-stretch gap-2 sm:flex-row">
                    <textarea
                      value={licenseInput}
                      onChange={(e) => {
                        setLicenseInput(e.target.value)
                        setLicenseMsg(null)
                      }}
                      rows={1}
                      placeholder={licUi.licensePlaceholder}
                      spellCheck={false}
                      className={`min-h-[2.5rem] flex-1 min-w-0 resize-y rounded-md border px-3 py-2 font-mono text-xs ${
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
                      className="inline-flex min-h-[2.5rem] w-full shrink-0 items-center justify-center rounded-md bg-blue-600 px-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 sm:w-24"
                    >
                      {licenseBusy ? licUi.applyLicenseBusy : licUi.updateLicense}
                    </button>
                  </div>
                </div>
              </div>
              {licenseMsg && (
                <p
                  className={`mt-2 text-sm ${
                    licenseMsg === licUi.licenseSaved ? (darkMode ? 'text-green-400' : 'text-green-700') : 'text-red-600'
                  }`}
                >
                  {licenseMsg}
                </p>
              )}
            </div>
          </section>
        )}

        <section className="mb-5">
          <h2 className={`${sectionTitleCls} border-l-4 ${accentBorder} pl-3`}>{t.packageAndAssistant}</h2>
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-3 xl:gap-4">
            <div className={cardCls}>
              <h3 className={`mb-2 text-sm font-semibold ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>{t.packageMeta}</h3>
              <div className={`space-y-2 text-sm leading-relaxed ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                <p>{pkgInfo.variantIntro}</p>
                <p>{pkgInfo.nsisNote}</p>
                <p>{pkgInfo.updateNote}</p>
              </div>
              {deployInfo != null && (
                <div className={`mt-3 rounded-md border px-3 py-2 text-xs ${darkMode ? 'border-gray-600 bg-gray-800/60 text-gray-300' : 'border-gray-200 bg-gray-50 text-gray-700'}`}>
                  <div>
                    {t.localDeployLabel}：<span>{deployInfo.assistantLocalDeploy === false ? t.no : t.yes}</span>
                  </div>
                  <div className="mt-1">
                    {t.electronVersionLabel}：<span className="font-mono">{deployInfo.version ?? currentVersion}</span>
                  </div>
                </div>
              )}
            </div>
            <div className={cardCls}>
              <h3 className={`mb-2 text-sm font-semibold ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>{astUi.sectionTitle}</h3>
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
                  {(assistantStatus as { failureDiagnosticZh?: string }).failureDiagnosticZh && language === 'zh' ? (
                    <p className={`text-xs leading-relaxed ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                      {(assistantStatus as { failureDiagnosticZh?: string }).failureDiagnosticZh}
                    </p>
                  ) : null}
                  {(assistantStatus as { failureDiagnosticEn?: string }).failureDiagnosticEn && language === 'en' ? (
                    <p className={`text-xs leading-relaxed ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                      {(assistantStatus as { failureDiagnosticEn?: string }).failureDiagnosticEn}
                    </p>
                  ) : null}
                </div>
              )}
            </div>
            <div className={cardCls}>
              <h3 className={`mb-2 text-sm font-semibold ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>{leg.aiAssistantTitle}</h3>
              <p className={`text-sm leading-relaxed ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>{leg.aiAssistantP}</p>
            </div>
          </div>
        </section>

        <section className="mb-5">
          <h2 className={`${sectionTitleCls} border-l-4 ${accentBorder} pl-3`}>{t.feedbackSection}</h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:gap-4">
            <div className={cardCls}>
              <h3 className={`mb-1.5 text-sm font-semibold ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>{t.feedbackTitle}</h3>
              <p className={`mb-3 text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>{t.feedbackDesc}</p>
              <a
                href={feedbackMail}
                className="inline-flex w-full items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 sm:w-auto"
              >
                {t.feedbackBtn}
              </a>
            </div>
            {typeof window !== 'undefined' && (window as any).electronAPI?.update ? (
              <div className={cardCls}>
                <h3 className={`mb-1.5 text-sm font-semibold ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>{t.appUpdate}</h3>
                <div className={`mb-3 text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  {t.currentVer}{' '}
                  <span className="font-semibold text-blue-600">{currentVersion || '—'}</span>
                </div>
                <div className="space-y-2.5">
                  {updateStatus === 'idle' && (
                    <button onClick={handleCheckForUpdates} className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 sm:w-auto">
                      {t.checkBtn}
                    </button>
                  )}
                  {updateStatus === 'checking' && (
                    <div className={`py-2 text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                      <span className="mr-2 inline-block animate-spin">⟳</span> {t.checking}
                    </div>
                  )}
                  {updateStatus === 'available' && updateInfo && (
                    <div className="space-y-2.5">
                      <div className={`rounded-md p-2.5 text-sm ${darkMode ? 'bg-green-900/30 border border-green-700 text-green-300' : 'bg-green-50 border border-green-200 text-green-800'}`}>
                        <div className="font-medium">
                          {t.newVer} {updateInfo.version}
                        </div>
                        {updateInfo.releaseNotes && <div className={`mt-1 text-xs ${darkMode ? 'text-green-400' : 'text-green-700'}`}>{updateInfo.releaseNotes}</div>}
                      </div>
                      <button onClick={handleDownloadUpdate} className="w-full rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700 sm:w-auto">
                        {t.downloadBtn}
                      </button>
                    </div>
                  )}
                  {updateStatus === 'downloading' && (
                    <div className="space-y-2">
                      <div className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                        {t.downloading} {updateProgress}%
                      </div>
                      <div className={`h-2 w-full overflow-hidden rounded-full ${darkMode ? 'bg-gray-600' : 'bg-gray-200'}`}>
                        <div className="h-full bg-blue-500 transition-all duration-300" style={{ width: `${updateProgress}%` }} />
                      </div>
                    </div>
                  )}
                  {updateStatus === 'downloaded' && (
                    <div className="space-y-2.5">
                      <div className={`rounded-md p-2.5 text-sm ${darkMode ? 'bg-green-900/30 border border-green-700 text-green-300' : 'bg-green-50 border border-green-200 text-green-800'}`}>{t.downloaded}</div>
                      <button onClick={handleInstallUpdate} className="w-full rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700 sm:w-auto">
                        {t.installBtn}
                      </button>
                    </div>
                  )}
                  {updateStatus === 'error' && (
                    <div className="space-y-2.5">
                      <div className={`rounded-md p-2.5 text-sm ${darkMode ? 'bg-red-900/30 border border-red-700 text-red-300' : 'bg-red-50 border border-red-200 text-red-800'}`}>
                        {updateError || (language === 'en' ? 'Update check failed' : '更新检查失败')}
                      </div>
                      <button onClick={handleCheckForUpdates} className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 sm:w-auto">
                        {t.retry}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className={cardCls}>
                <h3 className={`mb-1.5 text-sm font-semibold ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>{t.appVerOnly}</h3>
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
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:gap-4">
            <div className={cardCls}>
              <h3 className={`mb-2 text-sm font-semibold ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>{leg.disclaimerTitle}</h3>
              <div className={`space-y-2 text-sm leading-relaxed ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                <p>{leg.disclaimerP1}</p>
                <p>{leg.disclaimerP2}</p>
                <p>{leg.disclaimerP3}</p>
              </div>
            </div>
            <div className={cardCls}>
              <h3 className={`mb-2 text-sm font-semibold ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>{leg.privacyTitle}</h3>
              <p className={`text-sm leading-relaxed ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>{leg.privacyP}</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
