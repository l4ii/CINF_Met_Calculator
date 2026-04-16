import { useState, useEffect } from 'react'
import { SMELT_TYPES, type SelectedMethod, type SheetId } from '../types'
import RawMaterialPhaseOxygen from './modules/RawMaterialPhaseOxygen'
import ProductDisplay from './modules/ProductDisplay'
import ElementDistributionFab from './ElementDistributionFab'
import ErrorBoundary from './ErrorBoundary'
import { cardBase, descText } from '../theme/uiTheme'
// @ts-ignore - react-katex types
import { InlineMath } from 'react-katex'
import 'katex/dist/katex.min.css'

const APP_TITLE = {
  zh: '长沙院冶金智能配料软件',
  en: 'CINF Metallurgical Intelligent Batching Software',
}
const APP_SUBTITLE = {
  zh: '基于能量守恒与质量守恒定律的专业冶金配料计算工具',
  en: 'Professional Metallurgical Batching Tool Based on Mass-Energy Balance',
}

type MunicipalHandbookSpec = { n: number; title: string }

function municipalDocSrc(n: number): string {
  return `./municipal/doc-image${String(n).padStart(2, '0')}.jpeg`
}

function researchThumbFromFull(full: string): string {
  return full.replace(/(\.[^.]+)$/i, '-thumb$1')
}

function MunicipalImageLightbox({
  open,
  src,
  alt,
  onClose,
}: {
  open: boolean
  src: string | null
  alt: string
  onClose: () => void
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open, onClose])

  if (!open || !src) return null

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-8 bg-black/80 backdrop-blur-sm" onClick={onClose} role="dialog" aria-modal="true" aria-label="图片预览">
      <button type="button" className="absolute top-3 right-3 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-2xl leading-none text-white transition hover:bg-white/20" onClick={onClose} aria-label="关闭">×</button>
      <img src={src} alt={alt} className="max-h-[min(92vh,960px)] max-w-[min(96vw,1200px)] object-contain rounded-lg shadow-2xl ring-1 ring-white/15" onClick={(e) => e.stopPropagation()} />
    </div>
  )
}

function MunicipalHandbookCarousel({
  darkMode,
  specs,
  onImageClick,
  align = 'center',
}: {
  darkMode: boolean
  specs: MunicipalHandbookSpec[]
  onImageClick: (payload: { src: string; alt: string }) => void
  align?: 'center' | 'end'
}) {
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    if (paused || specs.length <= 1) return
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % specs.length)
    }, 4800)
    return () => window.clearInterval(id)
  }, [paused, specs.length])

  useEffect(() => {
    setIndex((i) => (specs.length ? Math.min(i, specs.length - 1) : 0))
  }, [specs.length])

  if (!specs.length) return null

  const go = (delta: number) => {
    setIndex((i) => (i + delta + specs.length) % specs.length)
  }

  const spec = specs[index]
  const dotActive = darkMode ? 'bg-blue-400 w-7' : 'bg-blue-600 w-7'
  const dotIdle = darkMode ? 'bg-gray-500 hover:bg-gray-400' : 'bg-slate-300 hover:bg-slate-400'
  const navBtnCls = `absolute top-1/2 z-[2] -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full border text-lg font-semibold shadow-md transition ${
    darkMode ? 'border-gray-500 bg-gray-800/90 text-gray-100 hover:bg-gray-700' : 'border-slate-200 bg-white/95 text-slate-700 hover:bg-slate-50'
  }`
  const cardAlignCls = align === 'end' ? 'mx-auto lg:ml-auto lg:mr-0' : 'mx-auto lg:mx-0'
  const captionAlignCls = align === 'end' ? 'text-right ml-auto' : 'text-center'

  return (
    <div className={align === 'end' ? 'w-full' : undefined} onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <div className={`relative w-fit max-w-full overflow-hidden rounded-2xl border shadow-md ${cardAlignCls} ${
        darkMode ? 'border-gray-600 bg-gradient-to-b from-gray-800 to-gray-900' : 'border-slate-200/90 bg-white'
      }`}>
        <div className="relative aspect-[3/4] h-[480px] w-auto max-w-full">
          {specs.map((h, i) => (
            <div key={h.n} className={`absolute inset-0 transition-opacity duration-500 ease-out ${i === index ? 'z-[1] opacity-100' : 'z-0 opacity-0 pointer-events-none'}`}>
              <button type="button" className="block h-full w-full rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent" onClick={() => onImageClick({ src: municipalDocSrc(h.n), alt: h.title })} aria-label={`放大查看：${h.title}`}>
                <img src={municipalDocSrc(h.n)} alt={h.title} loading={i === 0 ? 'eager' : 'lazy'} className="h-full w-full cursor-zoom-in rounded-xl object-cover object-top" />
              </button>
            </div>
          ))}
        </div>
        {specs.length > 1 && (
          <>
            <button type="button" className={`${navBtnCls} left-2`} onClick={() => go(-1)} aria-label="上一张">‹</button>
            <button type="button" className={`${navBtnCls} right-2`} onClick={() => go(1)} aria-label="下一张">›</button>
          </>
        )}
      </div>
      <p className={`mt-3 min-h-[2.5rem] max-w-[360px] px-1 text-sm sm:text-[15px] font-medium leading-snug ${captionAlignCls} ${darkMode ? 'text-gray-200' : 'text-slate-800'}`}>{spec.title}</p>
      {specs.length > 1 && (
        <div className={`mt-3 flex gap-2 ${align === 'end' ? 'justify-end' : 'justify-center'}`}>
          {specs.map((_, i) => (
            <button key={i} type="button" aria-label={`第 ${i + 1} 张`} aria-current={i === index ? 'true' : undefined} className={`h-2 rounded-full transition-all duration-100 ${i === index ? dotActive : `w-2 ${dotIdle}`}`} onClick={() => setIndex(i)} />
          ))}
        </div>
      )}
      <p className={`mt-2 text-[11px] ${captionAlignCls} ${darkMode ? 'text-gray-500' : 'text-slate-500'}`}>自动轮播 · 点击图片放大</p>
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
  const appTitle = isEn ? APP_TITLE.en : APP_TITLE.zh
  const appSubtitle = isEn ? APP_SUBTITLE.en : APP_SUBTITLE.zh
  const [selectedCase, setSelectedCase] = useState<number | null>(null)
  const [municipalLightbox, setMunicipalLightbox] = useState<{ src: string; alt: string } | null>(null)
  const [zoomPlatformImageUrl, setZoomPlatformImageUrl] = useState<string | null>(null)
  const [researchZoomLightboxReady, setResearchZoomLightboxReady] = useState(false)
  const [researchThumbFallbackByKey, setResearchThumbFallbackByKey] = useState<Record<string, boolean>>({})
  const [researchPlatformImageLoadedByKey, setResearchPlatformImageLoadedByKey] = useState<Record<string, boolean>>({})
  const [currentVersion, setCurrentVersion] = useState<string>('')
  const [updateStatus, setUpdateStatus] = useState<'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'error'>('idle')
  const [updateInfo, setUpdateInfo] = useState<{ version?: string; releaseNotes?: string } | null>(null)
  const [updateProgress, setUpdateProgress] = useState<number>(0)
  const [updateError, setUpdateError] = useState<string | null>(null)

  useEffect(() => {
    if (typeof window !== 'undefined' && (window as any).electronAPI?.update) {
      (window as any).electronAPI.update.getAppVersion().then((v: string) => setCurrentVersion(v)).catch(() => setCurrentVersion('1.0.0'))
    } else {
      setCurrentVersion('1.0.0')
    }
  }, [])

  useEffect(() => {
    if (zoomPlatformImageUrl) setResearchZoomLightboxReady(false)
  }, [zoomPlatformImageUrl])

  useEffect(() => {
    if (currentView !== 'about' || aboutDepartment !== 'metallurgy') {
      setMunicipalLightbox(null)
    }
  }, [currentView, aboutDepartment])


  useEffect(() => {
    if (typeof window === 'undefined' || !(window as any).electronAPI?.update) return
    const api = (window as any).electronAPI.update
    api.onUpdateChecking(() => { setUpdateStatus('checking'); setUpdateError(null) })
    api.onUpdateAvailable((info: any) => { setUpdateStatus('available'); setUpdateInfo({ version: info.version, releaseNotes: info.releaseNotes }) })
    api.onUpdateNotAvailable(() => { setUpdateStatus('idle') })
    api.onUpdateError((err: any) => { setUpdateStatus('error'); setUpdateError(err.message || '更新检查失败') })
    api.onUpdateDownloadProgress((p: any) => { setUpdateStatus('downloading'); setUpdateProgress(p.percent || 0) })
    api.onUpdateDownloaded((info: any) => { setUpdateStatus('downloaded'); setUpdateInfo({ version: info.version }) })
    return () => {
      api.removeAllListeners('update-checking')
      api.removeAllListeners('update-available')
      api.removeAllListeners('update-not-available')
      api.removeAllListeners('update-error')
      api.removeAllListeners('update-download-progress')
      api.removeAllListeners('update-downloaded')
    }
  }, [])

  const handleCheckForUpdates = async () => {
    if (!(window as any).electronAPI?.update) { setUpdateError('当前环境不支持自动更新'); setUpdateStatus('error'); return }
    try {
      setUpdateStatus('checking')
      setUpdateError(null)
      const result = await (window as any).electronAPI.update.checkForUpdates()
      if (result.error) { setUpdateStatus('error'); setUpdateError(result.error) }
    } catch (e: any) { setUpdateStatus('error'); setUpdateError(e.message || '检查更新失败') }
  }

  const handleDownloadUpdate = async () => {
    if (!(window as any).electronAPI?.update) return
    try { setUpdateStatus('downloading'); setUpdateProgress(0); await (window as any).electronAPI.update.downloadUpdate() }
    catch (e: any) { setUpdateError(e.message || '下载失败') }
  }

  const handleInstallUpdate = async () => {
    if (!(window as any).electronAPI?.update) return
    await (window as any).electronAPI.update.installUpdate()
  }

  const caseStudies: Record<string, { title: string; description: string; highlights: string[] }[]> = {
    research: [
      { title: '科技创新与平台建设成效', description: '中心在重大科研项目布局、省部级与国家级科技奖励、标准制修订以及科研成果工程化方面持续突破。', highlights: ['重大科研项目批量落地', '省部级及国家级奖励', '闭环创新链示范应用'] },
    ],
    metallurgy: [
      { title: '冶金事业部工程实践', description: '围绕废水治理、浆体输送与工程标准体系，形成稳定的项目交付与技术服务能力。', highlights: ['技术体系完整', '工程经验丰富', '多专业协同交付'] },
    ],
  }

  const departmentNames: Record<string, string> = {
    cinf: '长沙有色冶金设计研究院',
    research: '科研创新中心',
    metallurgy: '冶金事业部',
  }

  const renderAboutPage = () => {
    const cases = caseStudies[aboutDepartment as keyof typeof caseStudies] || []
    const deptName = departmentNames[aboutDepartment as keyof typeof departmentNames] || ''
    const wrapCls = `flex-[4] overflow-y-auto ${darkMode ? 'bg-gray-800' : 'bg-gray-50'}`
    const pageCls = 'max-w-[calc(100vw*4/5)] mx-auto p-6'

    if (aboutDepartment === 'research') {
      const researchCenters: Record<string, { name: string; image: string; placeholder: string }> = {
        recycling: {
          name: '湖南省再生金属资源循环利用工程技术研究中心',
          image: './info1.jpg',
          placeholder:
            '湖南省再生金属资源循环利用工程技术研究中心成立于2019年，为省级工程研究中心，由长沙有色冶金设计研究院组建。中心聚焦再生金属资源循环利用，研究方向涵盖多金属复杂物料熔炼、含砷固废治理、废旧动力电池回收等六大关键技术。成果方面，已获得多项省部级优秀设计奖及荣誉证书，技术研发与应用成效显著。',
        },
        leadZinc: {
          name: '湖南省铅锌清洁冶炼工程技术研究中心',
          image: './info2.jpg',
          placeholder:
            '湖南省铅锌清洁冶炼工程技术研究中心依托长沙有色冶金设计研究院成立，致力于锌、铜等有色金属的清洁冶炼与智能化关键技术研发，重点方向包括加压浸出、流态化熔炼等。中心承担多项国家及省级重大科研项目，取得显著成效，其中包括国家科技进步二等奖及多项省部级科技一等奖。',
        },
        deepMining: {
          name: '深井矿山安全高效开采技术湖南省工程研究中心',
          image: './info3.jpg',
          placeholder:
            '深井矿山安全高效开采技术湖南省工程研究中心由长沙有色冶金设计研究院与中南大学共建，聚焦深地资源绿色开发、矿山固废高值化利用、复杂难采矿体安全开采三大方向。中心团队成果丰硕，已取得多项技术突破与重大工程项目经验，致力于推动深井矿山安全、高效、绿色开采技术发展。',
        },
        safetyMonitor: {
          name: '湖南省矿山安全智能化监控技术与装备工程技术研究中心',
          image: './info4.jpg',
          placeholder:
            '湖南省矿山安全智能化监控技术与装备工程技术研究中心聚焦矿山灾害智能监测预警、无人自动巡检及大数据AI分析等方向。成果丰硕，获多项省部级科技奖，如"空天地"一体化监测技术获湖南省科技进步奖二等奖，Online SAR雷达系统获中国有色金属工业科学技术奖一等奖，并入选国家工信部安全应急装备推广案例。',
        },
        smartSmelting: {
          name: '湖南省有色冶金智能制造工程技术研究中心',
          image: './info5.jpg',
          placeholder:
            '湖南省有色冶金智能制造工程技术研究中心依托长沙有色冶金设计研究院，专注于数字化交付、大数据分析、智能装备与集成控制等方向。成果丰硕，获国家科技进步二等奖、多项省部级科技一等奖，授权发明专利40余项，制定标准13项，并发表多篇高水平论文。',
        },
      }
      const centerOrder = ['recycling', 'leadZinc', 'deepMining', 'safetyMonitor', 'smartSmelting'] as const
      const panelCls = `rounded-2xl border overflow-hidden shadow-sm ${darkMode ? 'border-gray-600 bg-gray-700/40' : 'border-slate-200 bg-white'}`
      const sectionTitleCls = `text-lg font-bold tracking-tight mb-3 ${darkMode ? 'text-white' : 'text-slate-900'}`
      const bodyCls = `text-sm leading-relaxed space-y-3 ${darkMode ? 'text-gray-300' : 'text-slate-700'}`
      const capCls = `px-3 py-2 text-[11px] shrink-0 ${darkMode ? 'text-gray-400 bg-gray-800/60' : 'text-slate-600 bg-slate-50'}`
      const researchKickerCls = `text-[11px] font-semibold uppercase tracking-[0.2em] mb-3 ${darkMode ? 'text-blue-400' : 'text-blue-700'}`
      const researchIntroP1 =
        '科研创新中心负责统筹长沙有色院科技创新与成果转化，对接主业设计咨询、工程总承包与生产运营中的技术需求，在采矿、选矿、冶炼、环保与节能降碳等领域组织课题攻关、标准与知识产权布局。中心与国家企业技术中心、博士后科研工作站及院研发中心、大师工作室、试验基地等协同联动，完善项目策划、过程管理与产学研用衔接，推动科研与工程实践相互支撑。'
      const researchIntroP2 =
        '以下按板块介绍我院牵头或共建的省级工程技术研究中心及工程研究中心，涵盖再生金属循环利用、铅锌清洁冶炼、深井矿山安全高效开采、矿山安全智能监控、有色冶金智能制造等方向；各平台研究方向与代表性成果见分块正文及展示资料。'

      return (
        <div className={wrapCls}>
          <div className={pageCls} style={{ maxWidth: 'min(calc(100vw*4/5), 1440px)' }}>
            <div className="mb-5">
              <h1 className={`text-2xl font-bold mb-2 ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}>{appTitle}</h1>
              <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{appSubtitle}</p>
            </div>
            <div className={`rounded-lg shadow-sm border p-6 mb-10 ${darkMode ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-200'}`}>
              <p className={researchKickerCls}>长沙有色冶金设计研究院有限公司 · 科研创新中心</p>
              <h2 className={`text-2xl font-bold mb-4 ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}>科研创新中心</h2>
              <div className={`space-y-3 text-sm leading-relaxed ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                <p>{researchIntroP1}</p>
                <p>{researchIntroP2}</p>
              </div>
            </div>
            {centerOrder.map((key, idx) => {
              const item = researchCenters[key]
              const imgLoaded = researchPlatformImageLoadedByKey[key] === true
              const useFullInList = researchThumbFallbackByKey[key] === true
              const listSrc = useFullInList ? item.image : researchThumbFromFull(item.image)
              const isOdd = idx % 2 === 1
              return (
                <div key={key} className={`mb-10 ${panelCls}`}>
                  <div className="grid grid-cols-1 lg:grid-cols-2">
                    <div className={`flex flex-col ${isOdd ? 'order-1 lg:order-2 border-b lg:border-b-0 lg:border-l' : 'border-b lg:border-b-0 lg:border-r'} ${darkMode ? 'border-gray-600' : 'border-slate-200'}`}>
                      <div className="relative flex min-h-[200px] items-center justify-center overflow-hidden bg-black/[0.03] p-4 dark:bg-black/20">
                        {!imgLoaded && <div className={`absolute inset-0 z-[1] flex items-center justify-center ${darkMode ? 'bg-gray-800/60 text-gray-400' : 'bg-gray-100 text-gray-500'}`}><span className="text-sm">加载中...</span></div>}
                        <button type="button" className="relative z-[2] w-full max-w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500" onClick={() => setZoomPlatformImageUrl(item.image)} aria-label={`放大查看：${item.name}`}>
                          <img
                            src={listSrc}
                            alt={item.name}
                            loading={idx === 0 ? 'eager' : 'lazy'}
                            className={`mx-auto max-h-[min(480px,65vh)] w-auto max-w-full cursor-zoom-in object-contain transition-opacity duration-200 ${imgLoaded ? 'opacity-100' : 'opacity-0'}`}
                            onLoad={() => setResearchPlatformImageLoadedByKey((prev) => ({ ...prev, [key]: true }))}
                            onError={() => {
                              if (!useFullInList) setResearchThumbFallbackByKey((prev) => ({ ...prev, [key]: true }))
                              else setResearchPlatformImageLoadedByKey((prev) => ({ ...prev, [key]: true }))
                            }}
                          />
                        </button>
                      </div>
                      <p className={capCls}>平台展示 · 点击可放大</p>
                    </div>
                    <div className={`flex flex-col justify-center p-6 sm:p-8 ${isOdd ? 'order-2 lg:order-1' : ''}`}>
                      <h3 className={sectionTitleCls}>{item.name}</h3>
                      <div className={bodyCls}><p>{item.placeholder}</p></div>
                    </div>
                  </div>
                </div>
              )
            })}
            {zoomPlatformImageUrl && (
              <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 p-4" onClick={() => setZoomPlatformImageUrl(null)} role="dialog" aria-modal="true" aria-label="放大查看图片">
                <button type="button" className="absolute top-4 right-4 z-[2] w-10 h-10 rounded-full bg-white/20 text-white hover:bg-white/30 flex items-center justify-center text-xl" onClick={() => setZoomPlatformImageUrl(null)} aria-label="关闭">×</button>
                {!researchZoomLightboxReady && <div className="absolute inset-0 z-[1] flex flex-col items-center justify-center gap-2 text-white text-sm pointer-events-none"><span className="inline-block h-8 w-8 border-2 border-white/30 border-t-white rounded-full animate-spin" aria-hidden /><span>加载中...</span></div>}
                <img src={zoomPlatformImageUrl} alt="放大查看" className={`relative z-[1] max-w-full max-h-[90vh] w-auto h-auto object-contain cursor-pointer transition-opacity duration-200 ${researchZoomLightboxReady ? 'opacity-100' : 'opacity-0'}`} onLoad={() => setResearchZoomLightboxReady(true)} onError={() => setResearchZoomLightboxReady(true)} onClick={(e) => e.stopPropagation()} />
              </div>
            )}
          </div>
        </div>
      )
    }

    if (aboutDepartment === 'metallurgy') {
      const muniClickImg = (n: number, alt: string, imgCls: string) => (
        <button
          type="button"
          className="block h-full w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
          onClick={() => setMunicipalLightbox({ src: municipalDocSrc(n), alt })}
          aria-label={`放大查看：${alt}`}
        >
          <img
            src={municipalDocSrc(n)}
            alt={alt}
            loading="lazy"
            className={`${imgCls} cursor-zoom-in transition duration-500 ease-out hover:brightness-105`}
          />
        </button>
      )
      const sectionTitleCls = `text-lg font-bold tracking-tight mb-1 ${darkMode ? 'text-white' : 'text-slate-900'}`
      const sectionKickerCls = `text-[11px] font-semibold uppercase tracking-[0.2em] mb-3 ${darkMode ? 'text-blue-400' : 'text-blue-700'}`
      const bodyCls = `text-sm leading-relaxed space-y-3 ${darkMode ? 'text-gray-300' : 'text-slate-700'}`
      const panelCls = `rounded-2xl border overflow-hidden shadow-sm ${darkMode ? 'border-gray-600 bg-gray-700/40' : 'border-slate-200 bg-white'}`
      const handbookSpecs: MunicipalHandbookSpec[] = [
        { n: 1, title: '《重金属污水处理设计标准》' },
        { n: 2, title: '《铅锌选矿废水生物法处理与回用技术规程》' },
        { n: 3, title: '《浆体长距离管道输送工程设计标准》' },
      ]
      const capCls = `px-3 py-2 text-[11px] shrink-0 ${darkMode ? 'text-gray-400 bg-gray-800/60' : 'text-slate-600 bg-slate-50'}`

      return (
        <>
          <MunicipalImageLightbox open={municipalLightbox != null} src={municipalLightbox?.src ?? null} alt={municipalLightbox?.alt ?? ''} onClose={() => setMunicipalLightbox(null)} />
          <div className={wrapCls}>
            <div className={pageCls} style={{ maxWidth: 'min(calc(100vw*4/5), 1440px)' }}>
              <div className="mb-5">
                <h1 className={`text-2xl font-bold mb-2 ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}>{appTitle}</h1>
                <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{appSubtitle}</p>
              </div>
              <div className={`mb-10 rounded-2xl border px-5 py-7 sm:px-10 sm:py-9 ${darkMode ? 'border-gray-600 bg-gradient-to-br from-slate-900/95 via-gray-900 to-slate-950' : 'border-slate-200/90 bg-gradient-to-br from-white via-slate-50/80 to-blue-50/50 shadow-sm'}`}>
                <p className={sectionKickerCls}>长沙有色冶金设计研究院有限公司 · 冶金事业部</p>
                <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-10 xl:gap-12 lg:items-start">
                  <div className="min-w-0">
                    <h2 className={`text-2xl sm:text-3xl font-bold tracking-tight ${darkMode ? 'text-white' : 'text-slate-900'}`}>冶金工程 · 废水处理及矿浆输送技术</h2>
                    <div className={`mt-4 leading-relaxed text-[15px] sm:text-base ${darkMode ? 'text-gray-200' : 'text-slate-800'}`}>
                      <p className="font-medium">
                        长沙有色院依托行业优势，在采选废水处理、冶炼废水处理、市政污水处理、矿浆输送等领域技术实力雄厚，处于国内外领先水平；研究开发了铜冶炼废水「零排放」关键技术、
                        <InlineMath math="\mathrm{CO_2}" />
                        协同生物法处理铅锌选矿废水成套技术、磷酸铁生产废水资源化处理与循环利用成套技术、高海拔高浓度长距离粗颗粒尾矿管道输送技术；主持编制了《重金属污水处理设计标准》《铅锌选矿废水生物法处理与回用技术规程》《浆体长距离管道输送工程设计标准》等标准。在长期工程实践中积累了大量采选废水、冶炼废水治理与矿浆输送数据，并拥有丰富的{' '}
                        <span className="whitespace-nowrap">
                          <InlineMath math="\mathrm{EPC}" />
                        </span>
                        工程实践经验，支撑设计标准化与成果推广。
                      </p>
                    </div>
                  </div>
                  <div className="min-w-0 flex w-full flex-col items-end">
                    <h3 className={`mb-2 w-full text-right text-sm font-semibold tracking-wide ${darkMode ? 'text-gray-200' : 'text-slate-800'}`}>主持编制标准</h3>
                    <MunicipalHandbookCarousel align="end" darkMode={darkMode} specs={handbookSpecs} onImageClick={(p) => setMunicipalLightbox(p)} />
                  </div>
                </div>
              </div>
              <div className={`mb-10 ${panelCls}`}>
                <div className="grid grid-cols-1 lg:grid-cols-2">
                  <div className={`flex flex-col border-b lg:border-b-0 lg:border-r ${darkMode ? 'border-gray-600' : 'border-slate-200'}`}>
                    <div className="aspect-video w-full overflow-hidden bg-black/[0.03] dark:bg-black/20">
                      {muniClickImg(4, '采选废水治理工程资料配图', 'h-full w-full object-cover')}
                    </div>
                    <p className={capCls}>图 1　采选废水治理 · 点击配图可放大</p>
                  </div>
                  <div className="flex flex-col justify-center p-6 sm:p-8">
                    <p className={sectionKickerCls}>工程业绩 · Ⅰ</p>
                    <h3 className={sectionTitleCls}>采选废水治理</h3>
                    <div className={bodyCls}>
                      <div>
                        <div className={`font-semibold mb-1 ${darkMode ? 'text-gray-100' : 'text-slate-900'}`}>中金岭南凡口铅锌矿选矿厂前回水净化系统</div>
                        <p>全国首个大规模生物法处理选矿废水示范，设计规模 <InlineMath math="Q=30000\ \mathrm{m^3/d}" />。工艺路线含 <InlineMath math="\mathrm{CO_2}" /> 调节 <InlineMath math="\mathrm{pH}" />、沉淀与 DAT-IAT 池，出水回用于选矿；较传统物化法节省运行费用 <InlineMath math=">70\%" />，获中国有色金属工业科学技术一等奖。</p>
                      </div>
                      <div>
                        <div className={`font-semibold mb-1 ${darkMode ? 'text-gray-100' : 'text-slate-900'}`}>广东大宝山凡洞村尾矿库外排水处理厂扩容升级</div>
                        <p>生化深度处理规模 <InlineMath math="Q=36000\ \mathrm{m^3/d}" />，解决外排水 <InlineMath math="\mathrm{COD}" /> 污染；多级物化 + CASS + 斜板沉淀，出水可回用选矿，实现外排水资源化。</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className={`mb-10 ${panelCls}`}>
                <div className="grid grid-cols-1 lg:grid-cols-2">
                  <div className="order-2 lg:order-1 flex flex-col justify-center p-6 sm:p-8">
                    <p className={sectionKickerCls}>工程业绩 · Ⅱ</p>
                    <h3 className={sectionTitleCls}>冶炼废水治理</h3>
                    <div className={bodyCls}>
                      <div>
                        <div className={`font-semibold mb-1 ${darkMode ? 'text-gray-100' : 'text-slate-900'}`}>五矿铜业（湖南）水处理站</div>
                        <p>铜冶炼废水分类收集、分质处理与回用；多子项流量如酸性 <InlineMath math="1200\ \mathrm{m^3/d}" />、生产 <InlineMath math="2200\ \mathrm{m^3/d}" /> 等。硫化—石灰—铁盐—硫化除重组合，出水砷可降至 <InlineMath math="0.1\ \mathrm{mg/L}" /> 量级。</p>
                      </div>
                      <div>
                        <div className={`font-semibold mb-1 ${darkMode ? 'text-gray-100' : 'text-slate-900'}`}>云南驰宏铅锌冶炼综合废水盐硝分离</div>
                        <p><InlineMath math="Q=800\ \mathrm{m^3/d}" />，脱钙软化 + 膜浓缩 + 蒸发结晶；膜系统回收率 <InlineMath math="\geq 85\%" />，结晶盐质量分数 <InlineMath math="\geq 92\%" />，达国际领先水平。</p>
                      </div>
                    </div>
                  </div>
                  <div className={`order-1 lg:order-2 flex flex-col border-b lg:border-b-0 lg:border-l ${darkMode ? 'border-gray-600' : 'border-slate-200'}`}>
                    <div className="aspect-video w-full overflow-hidden bg-black/[0.03] dark:bg-black/20">
                      {muniClickImg(8, '冶炼废水治理工程资料配图', 'h-full w-full object-cover')}
                    </div>
                    <p className={capCls}>图 2　冶炼废水零排放与深度处理 · 点击配图可放大</p>
                  </div>
                </div>
              </div>

              <div className={`mb-10 ${panelCls}`}>
                <div className="grid grid-cols-1 lg:grid-cols-2">
                  <div className={`flex flex-col border-b lg:border-b-0 lg:border-r ${darkMode ? 'border-gray-600' : 'border-slate-200'}`}>
                    <div className="aspect-video w-full overflow-hidden bg-black/[0.03] dark:bg-black/20">
                      {muniClickImg(12, '市政污水处理工程资料配图', 'h-full w-full object-cover')}
                    </div>
                    <p className={capCls}>图 3　市政污水厂提标与工业废水 · 点击配图可放大</p>
                  </div>
                  <div className="flex flex-col justify-center p-6 sm:p-8">
                    <p className={sectionKickerCls}>工程业绩 · Ⅲ</p>
                    <h3 className={sectionTitleCls}>市政污水处理</h3>
                    <div className={bodyCls}>
                      <div>
                        <div className={`font-semibold mb-1 ${darkMode ? 'text-gray-100' : 'text-slate-900'}`}>长沙经开区城南污水处理厂</div>
                        <p>一期 <InlineMath math="Q=7\times 10^{4}\ \mathrm{m^3/d}" />，二期同规模提标，合计 <InlineMath math="14\times 10^{4}\ \mathrm{m^3/d}" /> 至准地表Ⅳ类；Carrousel、深床反硝化与浸没式超滤等组合。</p>
                      </div>
                      <div>
                        <div className={`font-semibold mb-1 ${darkMode ? 'text-gray-100' : 'text-slate-900'}`}>永州下河线 · 洞口县城污水厂</div>
                        <p>永州分期 <InlineMath math="5/10/20\times 10^{4}\ \mathrm{m^3/d}" />，改良 <InlineMath math="\mathrm{A^2O}" />；洞口一期 <InlineMath math="Q=1.5\times 10^{4}\ \mathrm{m^3/d}" />、总规模 <InlineMath math="3\times 10^{4}\ \mathrm{m^3/d}" />。</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className={`mb-10 ${panelCls}`}>
                <div className="grid grid-cols-1 lg:grid-cols-2">
                  <div className="order-2 lg:order-1 flex flex-col justify-center p-6 sm:p-8">
                    <p className={sectionKickerCls}>工程业绩 · Ⅳ</p>
                    <h3 className={sectionTitleCls}>矿浆输送</h3>
                    <div className={bodyCls}>
                      <div>
                        <div className={`font-semibold mb-1 ${darkMode ? 'text-gray-100' : 'text-slate-900'}`}>普朗铜矿尾矿输送系统</div>
                        <p>尾矿质量浓度 <InlineMath math="55\%" />，管长 <InlineMath math="L\approx 30\ \mathrm{km}" />，几何高差 <InlineMath math="\Delta H\approx 240\ \mathrm{m}" />，规模 <InlineMath math="1230\times 10^{4}\ \mathrm{t/a}" />。</p>
                      </div>
                      <div>
                        <div className={`font-semibold mb-1 ${darkMode ? 'text-gray-100' : 'text-slate-900'}`}>李家沟锂辉石矿 · 大宝山铜硫精矿 · 教美铝土矿等</div>
                        <p>高落差、高压力管道：如设计压力 <InlineMath math="16.8\ \mathrm{MPa}" />、自流高差 <InlineMath math="1200\ \mathrm{m}" /> 量级；铝土矿排泥管长 <InlineMath math="32\ \mathrm{km}" />、主泵压力 <InlineMath math="16\ \mathrm{MPa}" />。</p>
                      </div>
                    </div>
                  </div>
                  <div className={`order-1 lg:order-2 flex flex-col border-b lg:border-b-0 lg:border-l ${darkMode ? 'border-gray-600' : 'border-slate-200'}`}>
                    <div className="aspect-video w-full overflow-hidden bg-black/[0.03] dark:bg-black/20">
                      {muniClickImg(16, '矿浆管道输送工程资料配图', 'h-full w-full object-cover')}
                    </div>
                    <p className={capCls}>图 4　长距离浆体 / 尾矿管道 · 点击配图可放大</p>
                  </div>
                </div>
              </div>

              <div className={`mb-8 rounded-xl border px-5 py-5 ${darkMode ? 'border-gray-600 bg-gray-700/30' : 'border-slate-200 bg-slate-50'}`}>
                <h3 className={`text-sm font-semibold mb-2 ${darkMode ? 'text-gray-200' : 'text-slate-800'}`}>设计资质与协同</h3>
                <p className={`text-sm leading-relaxed mb-3 ${darkMode ? 'text-gray-400' : 'text-slate-600'}`}>市政行业甲级（排水、热力、载人索道等），可与冶金、建筑、环境等甲级资质组合，承担城镇与工业片区给水排水、热力与索道等基础设施全过程咨询设计。</p>
                <div className="flex flex-wrap gap-2">
                  {['市政行业甲级', '排水工程', '热力工程', '载人索道工程', '多专业协同'].map((tag) => (
                    <span key={tag} className={`rounded-full border px-3 py-1 text-xs font-medium ${darkMode ? 'border-gray-500 text-gray-300' : 'border-blue-200 bg-white text-blue-900'}`}>{tag}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </>
      )
    }

    if (aboutDepartment === 'cinf') {
      const sectionTitleCls = `text-lg font-bold tracking-tight mb-1 ${darkMode ? 'text-white' : 'text-slate-900'}`
      const sectionKickerCls = `text-[11px] font-semibold uppercase tracking-[0.2em] mb-3 ${darkMode ? 'text-blue-400' : 'text-blue-700'}`
      const panelCls = `rounded-2xl border overflow-hidden shadow-sm ${darkMode ? 'border-gray-600 bg-gray-700/40' : 'border-slate-200 bg-white'}`
      const capCls = `px-3 py-2 text-[11px] shrink-0 ${darkMode ? 'text-gray-400 bg-gray-800/60' : 'text-slate-600 bg-slate-50'}`
      const dividerCls = darkMode ? 'border-gray-600' : 'border-slate-200'
      const chipCls = `px-3 py-1 rounded-full text-xs font-medium border ${darkMode ? 'border-gray-600 bg-gray-800/60 text-gray-300' : 'border-slate-200 bg-white text-slate-700'}`
      const valueCls = `px-3 py-1 text-xs font-semibold rounded-full border ${darkMode ? 'border-blue-700/50 bg-blue-900/40 text-blue-300' : 'border-blue-200 bg-blue-50 text-blue-700'}`
      const cinfStats = [
        { n: '11项', l: '甲级资质' },
        { n: '900+', l: '在册职工' },
        { n: '1300+', l: '获奖项目' },
        { n: '500+', l: '有效专利' },
      ]

      return (
        <div className={wrapCls}>
          <div className={pageCls} style={{ maxWidth: 'min(calc(100vw*4/5), 1440px)' }}>
            <div className="mb-5">
              <h1 className={`text-2xl font-bold mb-2 ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}>{appTitle}</h1>
              <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{appSubtitle}</p>
            </div>
            <div className={`mb-10 rounded-2xl border px-5 py-7 sm:px-10 sm:py-9 ${darkMode ? 'border-gray-600 bg-gradient-to-br from-slate-900/95 via-gray-900 to-slate-950' : 'border-slate-200/90 bg-gradient-to-br from-white via-slate-50/80 to-blue-50/50 shadow-sm'}`}>
              <p className={sectionKickerCls}>长沙有色冶金设计研究院有限公司 · 企业概况</p>
              <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-10 xl:gap-12 lg:items-stretch">
                <div className="min-w-0 flex flex-col justify-center">
                  <h2 className={`text-2xl sm:text-3xl font-bold tracking-tight leading-snug ${darkMode ? 'text-white' : 'text-slate-900'}`}>有色金属行业全产业链<br className="hidden sm:block" />技术与服务提供商</h2>
                  <div className={`mt-4 leading-relaxed text-[15px] sm:text-base ${darkMode ? 'text-gray-200' : 'text-slate-800'}`}>
                    <p><span className="font-semibold">长沙有色冶金设计研究院有限公司</span>（简称长沙有色院）于1953年正式成立，为国家高新技术企业、国家技术创新示范企业、国家企业技术中心，是我国最早成立的大型综合性设计研究单位之一；隶属于中国铝业集团有限公司，为中铝国际工程股份有限公司子公司。</p>
                  </div>
                  <div className="mt-5 flex flex-wrap gap-2">
                    {['国家高新技术企业', '国家技术创新示范企业', '国家企业技术中心', 'AAA级信用企业'].map((c) => (<span key={c} className={chipCls}>{c}</span>))}
                  </div>
                </div>
                <div className="min-w-0">
                  <div className={`relative overflow-hidden rounded-xl border shadow-sm ${darkMode ? 'border-gray-600 bg-black/20' : 'border-slate-200/90 bg-slate-100'}`}>
                    <div className="aspect-[16/10] w-full">
                      <img src="./about/chinalco-building.png" alt="长沙有色冶金设计研究院大楼" className="h-full w-full object-cover" loading="lazy" />
                    </div>
                    <p className={capCls}>中国铝业集团 · 长沙有色冶金设计研究院有限公司</p>
                  </div>
                </div>
              </div>
            </div>

            <div className={`mb-10 ${panelCls}`}>
              <div className={`grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 ${darkMode ? 'divide-gray-600' : 'divide-slate-200'}`}>
                {cinfStats.map((s) => (
                  <div key={s.l} className="flex flex-col items-center justify-center py-8 px-4 text-center">
                    <div className={`text-2xl sm:text-3xl font-bold tabular-nums ${darkMode ? 'text-blue-400' : 'text-blue-600'}`}>{s.n}</div>
                    <div className={`mt-1.5 text-xs sm:text-sm font-medium ${darkMode ? 'text-gray-400' : 'text-slate-500'}`}>{s.l}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className={`mb-8 ${panelCls}`}>
              <div className="grid grid-cols-1 gap-6 p-6 sm:p-8 lg:grid-cols-[minmax(0,360px)_1fr] lg:items-start lg:gap-10 xl:grid-cols-[minmax(0,420px)_1fr] xl:gap-12">
                <div className="mx-auto w-full max-w-[min(100%,360px)] shrink-0 sm:max-w-[380px] lg:mx-0 lg:max-w-none xl:max-w-[420px]">
                  <div className={`overflow-hidden rounded-xl border shadow-sm ${darkMode ? 'border-gray-600 bg-black/20' : 'border-slate-200/90 bg-slate-100'}`}>
                    <img src="./pic1.png" alt="长沙有色冶金设计研究院" className="mx-auto block h-auto w-full max-h-[min(620px,62vh)] object-contain object-top sm:max-h-[min(700px,66vh)] lg:max-h-[min(780px,70vh)] xl:max-h-[min(860px,72vh)]" loading="lazy" />
                  </div>
                  <div className={`flex flex-col items-stretch gap-2 border-t px-4 py-3 ${darkMode ? 'border-gray-600 bg-gray-900/35' : 'border-slate-200 bg-slate-50'}`}>
                    <div className="flex flex-wrap justify-center gap-2">
                      {['责任', '诚信', '开放', '卓越'].map((v) => (<span key={v} className={valueCls}>{v}</span>))}
                    </div>
                    <div className="flex flex-wrap justify-center gap-2">
                      {['AAA级信用企业', '国家高新技术企业'].map((c) => (<span key={c} className={chipCls}>{c}</span>))}
                    </div>
                  </div>
                </div>
                <div className="min-w-0">
                  <p className={sectionKickerCls}>历史沿革 · 创新实践</p>
                  <h3 className={sectionTitleCls}>发展历程与组织沿革</h3>
                  <div className={`mt-4 space-y-3 leading-relaxed text-[15px] sm:text-base ${darkMode ? 'text-gray-200' : 'text-slate-800'}`}>
                    <p>1954年，长沙有色院由赣州迁至长沙，先后隶属于重工业部、冶金工业部、中国有色金属工业总公司、国家有色金属工业局、中国稀有稀土集团。2000年7月由中央下放到湖南省管理，2007年6月加入中国铝业公司。2011年3月改制为中铝国际出资设立的一人有限责任公司，名称变更为「长沙有色冶金设计研究院有限公司」。2015年3月，中铝国际将山东建设（后更名为南方工程）划转；2024年3月，将长勘院划转到长沙有色院。</p>
                    <p>历经七十余年，长沙有色院已形成较强的综合技术实力与行业影响力：在册职工900余人，专业技术人员800余人，拥有全国工程勘察设计大师、行业勘察设计大师、享受政府特殊津贴专家及大批注册工程师；建有<strong className={darkMode ? 'text-gray-100' : 'text-slate-900'}>3个国家级、7个省级科技创新平台</strong>及多个研究生联合培养与中试基地。累计完成工程咨询设计项目万余项，获国家、省、部级科技进步奖与优秀工程设计咨询奖1300余项，有效专利500余件，服务足迹遍及40余个国家与地区。</p>
                  </div>
                </div>
              </div>
            </div>

            <div className={`mb-8 overflow-hidden rounded-2xl border shadow-sm ${darkMode ? 'border-gray-600 bg-gray-800/30' : 'border-slate-200 bg-white'}`}>
              <div className={darkMode ? 'bg-black/25' : 'bg-slate-100'}>
                <img src="./pic3.jpg" alt="长沙有色院企业形象" className="mx-auto block h-auto w-full max-h-[280px] object-contain sm:max-h-[320px] md:max-h-[380px]" loading="lazy" />
              </div>
              <p className={`border-t px-4 py-2.5 text-center text-xs sm:text-sm ${darkMode ? 'border-gray-600 text-gray-400 bg-gray-900/40' : 'border-slate-200 text-slate-600 bg-slate-50'}`}>企业精神</p>
            </div>

            <div className={`mb-10 ${panelCls}`}>
              <div className="p-5 sm:p-6">
                <p className={sectionKickerCls}>联系方式</p>
                <h3 className={`text-base font-bold tracking-tight sm:text-lg ${darkMode ? 'text-white' : 'text-slate-900'}`}>公司与业务联系</h3>
                <div className={`mt-3 grid gap-3 rounded-lg border p-4 sm:grid-cols-2 lg:grid-cols-6 lg:gap-x-4 lg:gap-y-2 ${darkMode ? 'border-gray-600 bg-gray-800/35' : 'border-slate-200 bg-slate-50/90'}`}>
                  <div className="min-w-0 sm:col-span-2 lg:col-span-3"><div className={`text-[10px] font-semibold uppercase tracking-wide ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>联系地址</div><div className={`mt-0.5 text-sm leading-snug ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>湖南省长沙市雨花区木莲东路299号</div></div>
                  <div className="min-w-0 lg:col-span-1"><div className={`text-[10px] font-semibold uppercase tracking-wide ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>邮政编码</div><div className={`mt-0.5 text-sm ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>410019</div></div>
                  <div className="min-w-0 lg:col-span-1"><div className={`text-[10px] font-semibold uppercase tracking-wide ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>办公室</div><a href="tel:0731-84397032" className={`mt-0.5 inline-block text-sm hover:opacity-80 ${darkMode ? 'text-blue-400' : 'text-blue-600'}`}>0731-84397032</a></div>
                  <div className="min-w-0 lg:col-span-1"><div className={`text-[10px] font-semibold uppercase tracking-wide ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>传真</div><div className={`mt-0.5 text-sm ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>0731-82228112</div></div>
                  <div className="min-w-0 sm:col-span-2 lg:col-span-6"><div className={`text-[10px] font-semibold uppercase tracking-wide ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>Email</div><a href="mailto:cinf@chinalco.com.cn" className={`mt-0.5 inline-block text-sm hover:opacity-80 ${darkMode ? 'text-blue-400' : 'text-blue-600'}`}>cinf@chinalco.com.cn</a></div>
                </div>

                <div className={`mt-4 border-t pt-3 ${dividerCls}`}>
                  <p className={`${sectionKickerCls} !mb-2`}>对外联络</p>
                  <div className="grid gap-2.5 md:grid-cols-3">
                    <div className={`rounded-lg border px-3 py-2.5 ${darkMode ? 'border-gray-600 bg-gray-800/40' : 'border-slate-200 bg-white'}`}>
                      <div className={`text-xs font-semibold leading-tight ${darkMode ? 'text-gray-200' : 'text-gray-900'}`}>生产运营中心（市场开发部）</div>
                      <div className="mt-1.5 space-y-0.5 text-sm leading-snug"><div><span className={darkMode ? 'text-gray-500' : 'text-gray-500'}>电话 </span><a href="tel:0731-84397070" className={`hover:opacity-80 ${darkMode ? 'text-blue-400' : 'text-blue-600'}`}>0731-84397070</a></div><div className="break-all"><span className={darkMode ? 'text-gray-500' : 'text-gray-500'}>Email </span><a href="mailto:cinf_scjy@chinalco.com.cn" className={`hover:opacity-80 ${darkMode ? 'text-blue-400' : 'text-blue-600'}`}>cinf_scjy@chinalco.com.cn</a></div></div>
                    </div>
                    <div className={`rounded-lg border px-3 py-2.5 ${darkMode ? 'border-gray-600 bg-gray-800/40' : 'border-slate-200 bg-white'}`}>
                      <div className={`text-xs font-semibold leading-tight ${darkMode ? 'text-gray-200' : 'text-gray-900'}`}>海外业务中心（海外发展中心）</div>
                      <div className="mt-1.5 space-y-0.5 text-sm leading-snug"><div><span className={darkMode ? 'text-gray-500' : 'text-gray-500'}>电话 </span><a href="tel:0086-731-84397078" className={`hover:opacity-80 ${darkMode ? 'text-blue-400' : 'text-blue-600'}`}>0086-731-84397078 / 84397079</a></div><div className="break-all"><span className={darkMode ? 'text-gray-500' : 'text-gray-500'}>Email </span><a href="mailto:cinf_intl@chinalco.com.cn" className={`hover:opacity-80 ${darkMode ? 'text-blue-400' : 'text-blue-600'}`}>cinf_intl@chinalco.com.cn</a></div></div>
                    </div>
                    <div className={`rounded-lg border px-3 py-2.5 ${darkMode ? 'border-gray-600 bg-gray-800/40' : 'border-slate-200 bg-white'}`}>
                      <div className={`text-xs font-semibold leading-tight ${darkMode ? 'text-gray-200' : 'text-gray-900'}`}>人力资源部（党委组织部）</div>
                      <div className="mt-1.5 text-sm"><span className={darkMode ? 'text-gray-500' : 'text-gray-500'}>电话 </span><a href="tel:0731-84397022" className={`hover:opacity-80 ${darkMode ? 'text-blue-400' : 'text-blue-600'}`}>0731-84397022</a></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )
    }

    return (
      <div className={wrapCls}>
        <div className={pageCls} style={{ maxWidth: 'min(calc(100vw*4/5), 1440px)' }}>
          <div className="mb-5">
            <h1 className={`text-2xl font-bold mb-2 ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}>{appTitle}</h1>
            <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{appSubtitle}</p>
          </div>
          <div className={`rounded-lg shadow-sm border p-5 mb-5 ${darkMode ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-200'}`}>
            <h2 className={`text-xl font-semibold mb-4 ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}>{deptName} - 案例分析</h2>
            <div className="space-y-4">
              {cases.map((caseStudy, index) => (
                <div key={index} className={`p-4 rounded-lg border cursor-pointer transition-all ${selectedCase === index ? `border-blue-500 ${darkMode ? 'bg-gray-600' : 'bg-blue-50'}` : darkMode ? 'border-gray-600 hover:border-gray-500 bg-gray-600' : 'border-gray-200 hover:border-gray-300 bg-gray-50'}`} onClick={() => setSelectedCase(selectedCase === index ? null : index)}>
                  <h3 className={`text-lg font-semibold mb-2 ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}>{caseStudy.title}</h3>
                  <p className={`text-sm mb-3 leading-relaxed ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>{caseStudy.description}</p>
                  {selectedCase === index && (
                    <div className={`mt-3 pt-3 border-t ${darkMode ? 'border-gray-500' : 'border-gray-200'}`}>
                      <div className={`text-sm font-semibold mb-2 ${darkMode ? 'text-gray-200' : 'text-gray-700'}`}>项目亮点：</div>
                      <ul className="space-y-1">
                        {caseStudy.highlights.map((h, i) => (<li key={i} className={`text-sm flex items-start ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}><span className="mr-2">•</span><span>{h}</span></li>))}
                      </ul>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  const renderSettingsPage = () => {
    const cardCls = `rounded-xl border p-5 ${darkMode ? 'bg-gray-700/50 border-gray-600' : 'bg-white border-gray-200'}`
    const sectionTitleCls = `text-sm font-semibold mb-4 flex items-center gap-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`
    const accentBorder = darkMode ? 'border-l-blue-500' : 'border-l-blue-600'

    return (
      <div className={`flex-[4] overflow-y-auto ${darkMode ? 'bg-gray-800' : 'bg-gray-50'}`}>
        <div className="max-w-[calc(100vw*4/5)] mx-auto p-6" style={{ maxWidth: 'min(calc(100vw*4/5), 1440px)' }}>
          <div className="mb-8">
            <h1 className={`text-2xl sm:text-3xl font-bold mb-1 ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}>设置</h1>
            <p className={`text-sm mb-5 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>管理显示与语言、检查更新、查看声明与反馈方式</p>
            <div className={`rounded-xl border-l-4 ${accentBorder} ${darkMode ? 'bg-gray-700/60 border-gray-600' : 'bg-white border-gray-200'} px-5 py-4`}>
              <div className={`font-semibold ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}>{appTitle}</div>
              <div className={`text-sm mt-0.5 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>版本 {currentVersion || '—'} · 长沙有色冶金设计研究院有限公司</div>
            </div>
          </div>
          <section className="mb-8">
            <h2 className={`${sectionTitleCls} border-l-4 ${accentBorder} pl-3`}>外观与偏好</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className={cardCls}>
                <h3 className={`text-base font-semibold mb-3 ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>显示模式</h3>
                <div className="flex gap-2">
                  <button onClick={() => onDarkModeChange?.(false)} className={`flex-1 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${!darkModeValue ? 'bg-blue-600 text-white shadow' : darkMode ? 'bg-gray-600/80 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}><span className="font-medium">浅色</span><span className={`block text-xs mt-0.5 ${!darkModeValue ? 'opacity-90' : 'opacity-70'}`}>日间</span></button>
                  <button onClick={() => onDarkModeChange?.(true)} className={`flex-1 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${darkModeValue ? 'bg-blue-600 text-white shadow' : darkMode ? 'bg-gray-600/80 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}><span className="font-medium">暗色</span><span className={`block text-xs mt-0.5 ${darkModeValue ? 'opacity-90' : 'opacity-70'}`}>护眼</span></button>
                </div>
              </div>
              <div className={cardCls}>
                <h3 className={`text-base font-semibold mb-3 ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>界面语言</h3>
                <div className="flex gap-2">
                  <button onClick={() => onLanguageChange?.('zh')} className={`flex-1 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${language === 'zh' ? 'bg-blue-600 text-white shadow' : darkMode ? 'bg-gray-600/80 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>中文</button>
                  <button onClick={() => onLanguageChange?.('en')} className={`flex-1 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${language === 'en' ? 'bg-blue-600 text-white shadow' : darkMode ? 'bg-gray-600/80 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>English</button>
                </div>
              </div>
            </div>
          </section>
          <section className="mb-8">
            <h2 className={`${sectionTitleCls} border-l-4 ${accentBorder} pl-3`}>反馈与更新</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className={cardCls}>
                <h3 className={`text-base font-semibold mb-2 ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>建议与反馈</h3>
                <p className={`text-sm mb-4 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>功能建议、问题反馈或合作意向，欢迎联系开发团队。</p>
                <a href={`mailto:xuqianglai@outlook.com?subject=${encodeURIComponent('【CINF配料软件】软件建议与反馈')}&body=${encodeURIComponent('软件名称：CINF配料软件\n\n建议/反馈类型：□ 功能建议  □ 问题反馈  □ 其他\n\n内容说明：\n\n\n\n')}`} className="inline-flex items-center justify-center px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white transition-colors">联系开发团队</a>
              </div>
              {typeof window !== 'undefined' && (window as any).electronAPI?.update ? (
                <div className={cardCls}>
                  <h3 className={`text-base font-semibold mb-2 ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>应用更新</h3>
                  <div className={`text-sm mb-3 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>当前版本 <span className="font-semibold text-blue-600">{currentVersion || '—'}</span></div>
                  <div className="space-y-3">
                    {updateStatus === 'idle' && <button onClick={handleCheckForUpdates} className="w-full px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white transition-colors">检查更新</button>}
                    {updateStatus === 'checking' && <div className={`text-center py-2 text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}><span className="inline-block animate-spin mr-2">⟳</span> 正在检查更新...</div>}
                    {updateStatus === 'available' && updateInfo && (
                      <div className="space-y-3">
                        <div className={`p-3 rounded-lg text-sm ${darkMode ? 'bg-green-900/30 border border-green-700 text-green-300' : 'bg-green-50 border border-green-200 text-green-800'}`}><div className="font-medium">发现新版本 {updateInfo.version}</div>{updateInfo.releaseNotes && <div className={`mt-1 text-xs ${darkMode ? 'text-green-400' : 'text-green-700'}`}>{updateInfo.releaseNotes}</div>}</div>
                        <button onClick={handleDownloadUpdate} className="w-full px-4 py-2 rounded-lg text-sm font-medium bg-green-600 hover:bg-green-700 text-white transition-colors">下载更新</button>
                      </div>
                    )}
                    {updateStatus === 'downloading' && <div className="space-y-2"><div className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>正在下载 {updateProgress}%</div><div className={`w-full h-2 rounded-full overflow-hidden ${darkMode ? 'bg-gray-600' : 'bg-gray-200'}`}><div className="h-full bg-blue-500 transition-all duration-300" style={{ width: `${updateProgress}%` }} /></div></div>}
                    {updateStatus === 'downloaded' && <div className="space-y-3"><div className={`p-3 rounded-lg text-sm ${darkMode ? 'bg-green-900/30 border border-green-700 text-green-300' : 'bg-green-50 border border-green-200 text-green-800'}`}>更新已下载，重启后安装</div><button onClick={handleInstallUpdate} className="w-full px-4 py-2 rounded-lg text-sm font-medium bg-green-600 hover:bg-green-700 text-white transition-colors">立即重启并安装</button></div>}
                    {updateStatus === 'error' && <div className="space-y-3"><div className={`p-3 rounded-lg text-sm ${darkMode ? 'bg-red-900/30 border border-red-700 text-red-300' : 'bg-red-50 border border-red-200 text-red-800'}`}>{updateError || '更新检查失败'}</div><button onClick={handleCheckForUpdates} className="w-full px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white transition-colors">重试</button></div>}
                  </div>
                </div>
              ) : (
                <div className={cardCls}>
                  <h3 className={`text-base font-semibold mb-2 ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>应用版本</h3>
                  <div className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>当前版本 <span className="font-semibold">{currentVersion || '—'}</span>（浏览器环境下无自动更新）</div>
                </div>
              )}
            </div>
          </section>
          <section>
            <h2 className={`${sectionTitleCls} border-l-4 ${accentBorder} pl-3`}>法律与声明</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className={cardCls}>
                <h3 className={`text-base font-semibold mb-3 ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>免责声明</h3>
                <div className={`text-sm leading-relaxed space-y-2 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                  <p>本软件所提供的计算公式及计算结果仅供工程设计参考，不构成任何设计依据或保证。实际工程须结合现行规范、现场条件及专业判断综合决策。</p>
                  <p>使用本软件及其结果所产生的任何直接或间接后果，开发与提供方不承担责任。</p>
                </div>
              </div>
              <div className={cardCls}>
                <h3 className={`text-base font-semibold mb-3 ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>数据与隐私</h3>
                <p className={`text-sm leading-relaxed ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>本软件在本地完成计算，不收集、不上传您的输入数据或计算结果。</p>
              </div>
            </div>
          </section>
        </div>
      </div>
    )
  }

  if (currentView === 'about' && aboutDepartment) return renderAboutPage()
  if (currentView === 'settings') return renderSettingsPage()

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
        <p className={`text-xs mb-4 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{appSubtitle}</p>
        <h2 className={`text-lg font-semibold mb-1 ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>
          {selectedMethodDisplayName}
        </h2>
        {selectedMethod.description && (
          <p className={`text-sm leading-relaxed max-w-3xl ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
            {selectedMethod.description}
          </p>
        )}
      </div>

      {/* 主内容区 */}
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
