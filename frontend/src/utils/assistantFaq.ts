import type { AssistantWorkspaceSnapshot } from '../context/AssistantContext'
import { APP_NAME_EN, APP_NAME_ZH, APP_ORG_NAME_EN } from '../constants/appCopy'
import { SHEETS, SMELT_TYPES, type SheetId } from '../types'

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}

function sheetCatalog(language: 'zh' | 'en'): { id: string; name: string; group: string }[] {
  const sheetNamesEn: Record<SheetId, string> = {
    raw_material: 'Raw batching',
    product: 'Product output',
    heat_balance: 'Heat balance',
    furnace: 'Furnace design',
  }
  const group = language === 'en' ? 'Main sheets' : '主内容页签'
  return SHEETS.map((s) => ({
    id: s.id,
    name: language === 'en' ? sheetNamesEn[s.id] : s.name,
    group,
  }))
}

export function buildAssistantWelcome(language: 'zh' | 'en'): string {
  if (language === 'en') {
    return [
      `Welcome to ${APP_NAME_EN}.`,
      '',
      `I'm the in-app assistant. I can help with:`,
      '• Choosing smelting type/method on the left and switching calculation sheets.',
      '• Understanding inputs on Raw batching / Product pages and element tables.',
      '• Privacy/license/update hints shown in Settings.',
      '',
      'Ask your question.',
    ].join('\n')
  }
  return [
    `欢迎使用「${APP_NAME_ZH}」。`,
    '',
    '我是本软件的智能助手，可协助您：',
    '• 在左侧选择冶炼类型与方法，并在「配矿计算」「产出计算」等页签间切换；',
    '• 理解配料表、混合矿与元素分布等相关字段含义；',
    '• 说明设置页中的许可、隐私与更新提示。',
    '',
    '请描述您的问题。',
  ].join('\n')
}

export function smartInterpretationNotReadyReply(language: 'zh' | 'en'): string {
  return language === 'en'
    ? 'For deeper wording I need the local assistant backend with an embedded GGUF model (AI installer variant). Meanwhile I can still help with navigation and Settings via rule-based replies—please ask something concrete.'
    : '更深入的长文解读需要本地后端已成功加载 GGUF 模型（请选择含 AI 资源的安装包并确认依赖就绪）。在此之前仍可通过左侧导航与设置页的规则说明为您解答——请尽量具体描述问题。'
}

export function tryRuleBasedAssistantReply(
  raw: string,
  language: 'zh' | 'en',
  catalog: { id: string; name: string; group: string }[],
  snapshot: AssistantWorkspaceSnapshot | null
): string | null {
  const q = normalize(raw)
  if (!q) return null
  const zh = language === 'zh'
  const nav = ABOUT_NAV[language]

  if (
    zh
      ? /长沙有色冶金设计研究院|长沙有色院|长沙院|中铝国际|中国铝业|软件.*谁做|开发单位/.test(raw)
      : new RegExp(APP_ORG_NAME_EN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(raw) ||
        /\bwho\s+(developed|built)\b|\bdeveloper\b|\borganization\b/i.test(q)
  ) {
    return zh
      ? `${APP_NAME_ZH} 由长沙有色冶金设计研究院有限公司相关单位研发；详情见侧栏「了解我们」。`
      : `${APP_NAME_EN} is developed under Changsha Nonferrous — see sidebar About Us for organization pages.`
  }

  if (zh ? /侧栏|左边|导航|在哪|找不到|切换/.test(raw) : /\bsidebar\b|\bnavigation\b|\bwhere\b.*\b(find|open)/i.test(q)) {
    const groups = [...new Set(SMELT_TYPES.map((t) => t.name))].slice(0, 8)
    return zh
      ? `请在左侧展开冶炼类型（如：${groups.join('、')}），点选具体冶炼方法后，右侧会出现「配矿计算」等页签；「设置」「了解我们」也在侧栏底部区域。`
      : `Expand smelting categories on the left, pick a method, then switch sheets like Raw batching / Product in the main pane. Settings and About live in the sidebar footer area.`
  }

  if (
    zh
      ? /配料|产出|热平衡|炉型|sheet|页签/.test(raw)
      : /\bbatching\b|\bproduct\b|\bheat\b|\bfurnace\b|\bsheet\b/i.test(raw)
  ) {
    const lines = catalog.map((c) => `• ${c.name}（${c.id}）`).join('\n')
    return zh
      ? `主内容常见页签如下：\n${lines}\n在配料页填写原料与熔剂等后，可到产出页查看元素分配相关结果。`
      : `Main sheets:\n${lines}\nFill raw batching inputs first, then review outputs on the Product sheet.`
  }

  if (zh ? /许可|激活|设备标识|CINF-MET-LIC1/.test(raw) : /\blicense\b|\bactivation\b|\bdevice\b.*\bid\b/i.test(raw)) {
    return zh
      ? `离线许可密钥须以 CINF-MET-LIC1. 开头并与本机设备标识绑定；未激活时在桌面版会显示激活页，也可在「设置 → 产品许可」更新密钥。`
      : `Offline license keys start with CINF-MET-LIC1. and bind to this device. Activate from the desktop gate screen or Settings → Product license.`
  }

  if (zh ? /隐私|上传|联网|数据/.test(raw) : /\bprivacy\b|\bupload\b|\binternet\b|\bcloud\b/i.test(q)) {
    return zh
      ? `配料与计算默认在您电脑本地完成；智能助手若启用本地模型，对话也只发往本机 127.0.0.1 后端加载 GGUF，不会把配料数据发到公网。详见「设置 → 法律与声明」。`
      : `Calculations stay local. If local AI runs, requests only hit localhost—see Settings → Legal for details.`
  }

  if (zh ? /设置|主题|暗色|语言/.test(raw) : /\bsettings\b|\bdark\b|\blanguage\b/i.test(raw)) {
    return zh ? `请点击侧栏底部的「设置」，可切换浅色/暗色主题与中英文界面。` : `Open Settings from the sidebar footer to switch theme and UI language.`
  }

  if (snapshot?.selectedMethod && zh ? /当前|这次|选了什么/.test(raw) : /\bcurrent\b.*\b(method|selection)\b/i.test(raw)) {
    const m = snapshot.selectedMethod
    return zh
      ? `当前选择的冶炼路径：${m.smeltTypeName} → ${m.smeltMethodName}；活动页签：${snapshot.activeSheet}。`
      : `Current path: ${m.smeltTypeName} → ${m.smeltMethodName}; active sheet: ${snapshot.activeSheet}.`
  }

  if (snapshot?.mixTotalWeight != null && zh ? /混合|总重|配料总量/.test(raw) : /\bmix(ed)?\b.*\b(total|weight)\b/i.test(raw)) {
    return zh
      ? `当前混合矿等相关总重量约 ${snapshot.mixTotalWeight.toFixed(3)}（单位与界面一致）；配料条目数 ${snapshot.materialCount}。`
      : `Approx. mixed batch total weight ${snapshot.mixTotalWeight.toFixed(3)} (same units as UI); ${snapshot.materialCount} material rows.`
  }

  const compact = raw.replace(/\s/g, '')
  if (compact.length >= 2) {
    for (const row of catalog) {
      if (raw.includes(row.name) || compact.includes(row.name.replace(/\s/g, ''))) {
        return zh
          ? `「${row.name}」对应页签 id 为 ${row.id}；可在左侧完成冶炼方法选择后于主区顶部切换该页签。`
          : `"${row.name}" maps to sheet id "${row.id}". Select a method on the left, then switch sheets in the main header.`
      }
    }
  }

  return null
}
