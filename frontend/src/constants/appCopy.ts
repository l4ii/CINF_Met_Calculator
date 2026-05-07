/**
 * Met（冶金智能配料）统一品牌文案。
 * 与根目录 electron-builder*.yml 的 productName 及 electron/main.js 中 APP_DISPLAY_NAME 保持语义一致（修改时请同步）。
 */

/** 正式产品名：与安装器 productName、窗口对外展示一致 */
export const APP_NAME_ZH = '长沙院冶金智能配料软件'
export const APP_NAME_EN = 'CINF Metallurgical Intelligent Batching Software'

export const APP_TITLE_MAIN_ZH = APP_NAME_ZH
export const APP_TITLE_MAIN_EN = APP_NAME_EN

/** 侧栏主标题（可略短于正式名） */
export const APP_TITLE_SIDEBAR_ZH = 'CINF冶金智能配料'
export const APP_TITLE_SIDEBAR_EN = 'CINF Metallurgical Batching'

export const APP_ORG_NAME_ZH = '长沙有色冶金设计研究院有限公司'
export const APP_ORG_NAME_EN = 'Changsha Nonferrous Metallurgical Design & Research Institute Co., Ltd.'

export const APP_EXPORT_FILENAME_PREFIX = 'CINF-MetBatch'

/** 离线授权码行首（与 electron/license.js、scripts/issue-offline-license.js 一致；与 Flow 的 CINF-LIC1. 区分） */
export const LICENSE_TOKEN_PREFIX = 'CINF-MET-LIC1.'

export const APP_TAGLINE_ZH = '基于能量守恒与质量守恒定律的专业冶金配料计算工具。'
export const APP_TAGLINE_MAIN_EN =
  'Professional Metallurgical Batching Tool Based on Mass-Energy Balance.'

export const APP_TAGLINE_SIDEBAR_ZH = '专业冶金配料计算工具'
export const APP_TAGLINE_SIDEBAR_EN = 'Professional metallurgical batching tool'

/** 侧栏中文副标题两行（与 Flow 侧栏版式一致；由单行语义拆分） */
export const APP_TAGLINE_SIDEBAR_ZH_LINE1 = '专业冶金配料'
export const APP_TAGLINE_SIDEBAR_ZH_LINE2 = '计算工具'

/** 设置页：免责声明 / 隐私（与 Flow MainContent 对齐） */
export const SETTINGS_LEGAL = {
  zh: {
    disclaimerTitle: '免责声明',
    disclaimerP1:
      '本软件所提供的计算公式及计算结果仅供工程设计参考，不构成任何设计依据或保证。实际工程须结合现行规范、现场条件及专业判断综合决策。',
    disclaimerP2:
      '使用本软件及其结果所产生的任何直接或间接后果，开发与提供方不承担责任。如有疑问，请以现行国家标准、行业规范及有资质单位出具的正式设计文件为准。',
    disclaimerP3:
      '若将本软件产出的计算结果、或依本软件功能形成的参数与指标，作为工程设计依据、设备选型或对外技术条件的依据，或用于对设计起结论性指导的，须同时具备与「长沙有色冶金设计研究院有限公司」合法有效且与项目范围相符的正式合同或该院出具的书面项目授权。本软件使用许可不替代上述合同或授权。未经该院书面同意，不得以长沙有色院或本公司名义将本软件结果用于正式报审、对外技术承诺或担保性表述。',
    privacyTitle: '数据与隐私',
    privacyP:
      '本软件在本地完成计算，不收集、不上传您的输入数据或计算结果。导出 Word 等操作均在您本机完成，不会将内容发送至外部服务器。',
  },
  en: {
    disclaimerTitle: 'Disclaimer',
    disclaimerP1:
      'The formulas and results provided by this software are for engineering reference only and do not constitute any guarantee or final design basis. Decisions must be made with applicable standards, site conditions, and professional judgment.',
    disclaimerP2:
      'The developer/provider assumes no liability for any direct or indirect consequences arising from the use of this software or its results. When in doubt, refer to current national/industry standards and formally issued design documents from qualified organizations.',
    disclaimerP3:
      'If you use this software’s outputs or parameters/indicators derived from its features as a basis for engineering design or as material guidance, you must also have a valid, applicable contract or written project authorization from Changsha Nonferrous Metallurgical Design & Research Institute Co., Ltd. The app license is not a substitute for such authorization. Without the company’s written consent, you may not use the institute’s name when submitting results for formal design review or external technical commitments.',
    privacyTitle: 'Data & Privacy',
    privacyP:
      'All calculations are performed locally. The app does not collect or upload your input data or results. Exporting to Word is also done on your machine without sending content to external servers.',
  },
} as const

/** 设置页：离线许可 UI 文案（密钥前缀为 Met 的 CINF-MET-LIC1） */
export const SETTINGS_OFFLINE_LICENSE_UI = {
  zh: {
    offlineLicense: '产品许可',
    deviceCode: '设备标识',
    copyDev: '复制',
    copied: '已复制',
    licenseCode: '许可密钥',
    licensePlaceholder: `许可密钥以 ${LICENSE_TOKEN_PREFIX.replace(/\.$/, '')} 开头，整段粘贴即可。`,
    updateLicense: '更新',
    applyLicenseBusy: '应用更新中…',
    validUntil: '许可证有效期',
    noExpiry: '无期限',
    licenseSaved: '已保存，本机已激活。',
    saveFailed: '保存失败',
  },
  en: {
    offlineLicense: 'Product License',
    deviceCode: 'Device ID',
    copyDev: 'Copy',
    copied: 'Copied',
    licenseCode: 'License Key',
    licensePlaceholder: 'CINF-MET-LIC1.…',
    updateLicense: 'Update',
    applyLicenseBusy: 'Applying…',
    validUntil: 'Valid until',
    noExpiry: 'No expiry',
    licenseSaved: 'Saved. This device is licensed.',
    saveFailed: 'Failed',
  },
} as const

/** 邮件主题等使用的短称 */
export const APP_SHORT_NAME_ZH = '冶金智能配料软件'
export const APP_SHORT_NAME_EN = 'Metallurgical Batching Software'

/** 侧栏「了解我们」与页脚等导航文案 */
export const ABOUT_NAV = {
  zh: {
    aboutUs: '了解我们',
    settings: '设置',
    cinf: APP_ORG_NAME_ZH,
    metallurgy: '长沙院冶金事业部',
    research: '长沙院科研创新中心',
    footerBy: '由',
    footerDev: '科研创新中心、冶金事业部联合开发',
  },
  en: {
    aboutUs: 'About Us',
    settings: 'Settings',
    cinf: APP_ORG_NAME_EN,
    metallurgy: 'Metallurgical Division',
    research: 'Research Innovation Center',
    footerBy: 'By',
    footerDev: 'Research Innovation Center',
  },
} as const

export function appTitleForLang(lang: 'zh' | 'en'): string {
  return lang === 'en' ? APP_TITLE_MAIN_EN : APP_TITLE_MAIN_ZH
}

export function appSubtitleForLang(lang: 'zh' | 'en'): string {
  return lang === 'en' ? APP_TAGLINE_MAIN_EN : APP_TAGLINE_ZH
}

export function sidebarTitleForLang(lang: 'zh' | 'en'): string {
  return lang === 'en' ? APP_TITLE_SIDEBAR_EN : APP_TITLE_SIDEBAR_ZH
}

export function sidebarSubtitleForLang(lang: 'zh' | 'en'): string {
  return lang === 'en' ? APP_TAGLINE_SIDEBAR_EN : `${APP_TAGLINE_SIDEBAR_ZH_LINE1}${APP_TAGLINE_SIDEBAR_ZH_LINE2}`
}
