import { Fragment, useMemo, useState } from 'react'
import { LEAD_FLASH_MATERIAL_LIBRARY, LEAD_FLASH_TARGET_ELEMENTS } from '../../config/leadFlashMaterialConfig'
import type { ElementRatios } from '../../config/rawMaterialConfig'
import {
  optimizeLeadFlashBlend,
  type LeadFlashBlendResult,
  type LeadFlashCandidate,
  type LeadFlashObjectiveWeights,
  type LeadFlashTarget,
} from '../../utils/leadFlashBlendOptimize'
import { useCalc } from '../../context/CalcContext'
import { btnPrimary, btnSecondary, cardBase, hintText, inputBase, inputSm, labelBase, resultBox, sectionTitle } from '../../theme/uiTheme'

interface LeadFlashBlendOptimizerProps {
  darkMode: boolean
  language?: 'zh' | 'en'
}

const DEFAULT_TARGET_LIMITS: Record<string, Omit<LeadFlashTarget, 'element'>> = {
  'O (氧)': { enabled: false, minPct: 0, maxPct: 30 },
  'N (氮)': { enabled: false, minPct: 0, maxPct: 1 },
  'Sb(锑)': { enabled: false, minPct: 0, maxPct: 3 },
  'S (硫)': { enabled: true, minPct: 14, maxPct: 24 },
  'Fe(铁)': { enabled: true, minPct: 5, maxPct: 18 },
  'Pb(铅)': { enabled: true, minPct: 35, maxPct: 65 },
  'As(砷)': { enabled: true, minPct: 0, maxPct: 0.6 },
  'Zn(锌)': { enabled: true, minPct: 0, maxPct: 12 },
  'Cu(铜)': { enabled: false, minPct: 0, maxPct: 3 },
  'Si(硅)': { enabled: true, minPct: 1, maxPct: 8 },
  'Ca(钙)': { enabled: false, minPct: 0, maxPct: 6 },
  'Al(铝)': { enabled: false, minPct: 0, maxPct: 4 },
  'Ag(银)': { enabled: false, minPct: 0, maxPct: 0.3 },
  'Au(金)': { enabled: false, minPct: 0, maxPct: 0.05 },
  'C (碳)': { enabled: false, minPct: 0, maxPct: 8 },
  'Other(其他)': { enabled: false, minPct: 0, maxPct: 20 },
}

const DEFAULT_TARGETS: LeadFlashTarget[] = LEAD_FLASH_TARGET_ELEMENTS.map((element) => ({
  element,
  ...(DEFAULT_TARGET_LIMITS[element] ?? { enabled: false, minPct: 0, maxPct: 100 }),
}))

const DEFAULT_WEIGHTS: LeadFlashObjectiveWeights = {
  cost: 1.0,
  elementMatch: 8.0,
  priority: 1.5,
  annualDemand: 3.0,
}

const CSV_META_HEADERS = new Set([
  'name',
  '名称',
  '原料名称',
  'unitPrice',
  '单价',
  'priority',
  '优先级',
  'annualMinDemand',
  '年处理量不低于',
])

function makeInitialCandidates(): LeadFlashCandidate[] {
  return LEAD_FLASH_MATERIAL_LIBRARY.map((m) => ({
    id: m.id,
    name: m.name,
    enabled: true,
    unitPrice: m.unitPrice,
    ratios: { ...m.ratios },
    priority: m.defaultPriority,
    annualMinDemand: m.defaultAnnualMin,
  }))
}

function toNumber(value: string | number | undefined, fallback: number) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback
  const n = parseFloat(String(value ?? '').replace(',', '.'))
  return Number.isFinite(n) ? n : fallback
}

function pct(v: number) {
  return Number(v.toFixed(3)).toString()
}

function parseCsvLine(line: string) {
  const cells: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i += 1
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === ',' && !inQuotes) {
      cells.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  cells.push(current.trim())
  return cells
}

function headerIndex(headers: string[], names: string[]) {
  return headers.findIndex((h) => names.includes(h.trim()))
}

function parseCandidateCsv(text: string): LeadFlashCandidate[] {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  if (lines.length < 2) return []
  const headers = parseCsvLine(lines[0])
  const nameIdx = headerIndex(headers, ['name', '名称', '原料名称'])
  if (nameIdx < 0) return []
  const priceIdx = headerIndex(headers, ['unitPrice', '单价'])
  const priorityIdx = headerIndex(headers, ['priority', '优先级'])
  const annualIdx = headerIndex(headers, ['annualMinDemand', '年处理量不低于'])
  const elementHeaders = headers.filter((h) => !CSV_META_HEADERS.has(h))

  return lines.slice(1).map((line, rowIndex) => {
    const cells = parseCsvLine(line)
    const ratios: ElementRatios = {}
    for (const element of elementHeaders) {
      const col = headers.indexOf(element)
      ratios[element] = toNumber(cells[col], 0)
    }
    return {
      id: `import-${Date.now()}-${rowIndex}`,
      name: cells[nameIdx] || `导入原料 ${rowIndex + 1}`,
      enabled: true,
      unitPrice: toNumber(cells[priceIdx], 0),
      ratios,
      priority: clampPriority(toNumber(cells[priorityIdx], 3)),
      annualMinDemand: toNumber(cells[annualIdx], 0),
    }
  })
}

export default function LeadFlashBlendOptimizer({ darkMode, language = 'zh' }: LeadFlashBlendOptimizerProps) {
  const isEn = language === 'en'
  const dark = darkMode
  const { setMaterials } = useCalc()
  const [candidates, setCandidates] = useState<LeadFlashCandidate[]>(makeInitialCandidates)
  const [targets, setTargets] = useState<LeadFlashTarget[]>(DEFAULT_TARGETS)
  const [totalFeedMass, setTotalFeedMass] = useState('100')
  const [annualHours, setAnnualHours] = useState('7200')
  const [weights, setWeights] = useState<LeadFlashObjectiveWeights>(DEFAULT_WEIGHTS)
  const [result, setResult] = useState<LeadFlashBlendResult | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [showLibrary, setShowLibrary] = useState(false)
  const [showCustomInput, setShowCustomInput] = useState(false)
  const [expandedMaterialIds, setExpandedMaterialIds] = useState<Set<string>>(new Set())
  const [customName, setCustomName] = useState('')
  const [customPrice, setCustomPrice] = useState('0')
  const [customPriority, setCustomPriority] = useState('3')
  const [customAnnualMin, setCustomAnnualMin] = useState('0')
  const [customRatios, setCustomRatios] = useState<Record<string, string>>(() =>
    Object.fromEntries(LEAD_FLASH_TARGET_ELEMENTS.map((key) => [key, '0']))
  )

  const enabledCount = candidates.filter((c) => c.enabled).length
  const enabledTargets = targets.filter((t) => t.enabled).length

  const compositionKeys = useMemo(() => {
    const keys = new Set<string>(LEAD_FLASH_TARGET_ELEMENTS)
    candidates.forEach((c) => Object.keys(c.ratios).forEach((k) => keys.add(k)))
    return Array.from(keys)
  }, [candidates])

  const updateCandidate = (id: string, patch: Partial<LeadFlashCandidate>) => {
    setCandidates((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)))
    setResult(null)
  }

  const updateCandidateRatio = (id: string, element: string, value: number) => {
    setCandidates((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ratios: { ...c.ratios, [element]: value } } : c))
    )
    setResult(null)
  }

  const updateTarget = (element: string, patch: Partial<LeadFlashTarget>) => {
    setTargets((prev) => prev.map((t) => (t.element === element ? { ...t, ...patch } : t)))
    setResult(null)
  }

  const toggleMaterialExpanded = (id: string) => {
    setExpandedMaterialIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const runOptimize = () => {
    const next = optimizeLeadFlashBlend({
      candidates,
      targets,
      totalFeedMass: toNumber(totalFeedMass, 0),
      annualOperatingHours: toNumber(annualHours, 0),
      objectiveWeights: weights,
    })
    setResult(next)
    setMessage(next.ok ? null : next.message ?? '无法形成可行配矿方案。')
  }

  const applyResult = () => {
    if (!result?.ok) return
    setMaterials(
      result.blend.map((item) => ({
        id: `lead-flash-${item.id}-${Date.now()}`,
        name: item.name,
        ratios: { ...item.ratios },
        weight: item.weight,
        unitPrice: item.unitPrice,
        type: 'base' as const,
      }))
    )
    setMessage('已将约束优化得到的配矿方案写入全局物料表，可供后续物相计算与热平衡使用。')
  }

  const handleImport = async (file: File | null) => {
    if (!file) return
    const text = await file.text()
    const imported = parseCandidateCsv(text)
    if (imported.length === 0) {
      setMessage('未识别到有效 CSV。导入文件至少需要包含 name、名称或原料名称列；其他元素列可直接使用 Pb(铅)、S (硫)、Fe(铁) 等表头。')
      return
    }
    setCandidates((prev) => [...prev, ...imported])
    setShowLibrary(true)
    setMessage(`已导入 ${imported.length} 种原料到原料库。导入数据默认单价为 0、优先级为 3、年处理量不低于为 0，可在表格中手动补充。`)
  }

  const addCustomMaterial = () => {
    const name = customName.trim()
    if (!name) {
      setMessage('请先输入自定义原料名称。')
      return
    }
    const ratios: ElementRatios = {}
    for (const key of LEAD_FLASH_TARGET_ELEMENTS) ratios[key] = toNumber(customRatios[key], 0)
    const sum = Object.values(ratios).reduce((acc, value) => acc + value, 0)
    if (sum <= 0) {
      setMessage('自定义原料元素含量合计必须大于 0。')
      return
    }
    if (sum < 100 && ratios['Other(其他)'] != null) ratios['Other(其他)'] += 100 - sum
    setCandidates((prev) => [
      ...prev,
      {
        id: `custom-${Date.now()}`,
        name,
        enabled: true,
        unitPrice: toNumber(customPrice, 0),
        ratios,
        priority: clampPriority(toNumber(customPriority, 3)),
        annualMinDemand: toNumber(customAnnualMin, 0),
      },
    ])
    setCustomName('')
    setCustomRatios(Object.fromEntries(LEAD_FLASH_TARGET_ELEMENTS.map((key) => [key, '0'])))
    setShowLibrary(true)
    setResult(null)
    setMessage(`已添加自定义原料：${name}`)
  }

  return (
    <div className="space-y-6">
      <div className={cardBase(dark)}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className={sectionTitle(dark)}>{isEn ? '1. Material Library' : '1. 原料库'}</h3>
            <p className={`${hintText(dark)} max-w-5xl leading-relaxed`}>
              {isEn
                ? 'The material library is normally kept collapsed. Expand it when importing data or adjusting price, priority, annual processing requirement and element composition.'
                : '原料库作为配矿计算的基础数据源，默认折叠显示。通常只在导入原料、补充单价、设置优先级或维护元素含量时展开；求解时系统直接从当前启用的库内原料中组合投料方案。'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <label className={btnSecondary(dark)}>
              {isEn ? 'Import CSV' : '导入原料'}
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => void handleImport(e.target.files?.[0] ?? null)}
              />
            </label>
            <button className={btnSecondary(dark)} onClick={() => setShowCustomInput((v) => !v)}>
              {showCustomInput ? (isEn ? 'Hide Form' : '收起新增') : (isEn ? 'Add Material' : '新增原料')}
            </button>
            <button className={btnPrimary(dark)} onClick={() => setShowLibrary((v) => !v)}>
              {showLibrary ? (isEn ? 'Collapse Library' : '折叠原料库') : (isEn ? 'Expand Library' : '展开原料库')}
            </button>
          </div>
        </div>

        <div className={`mt-4 rounded-lg border px-4 py-3 text-sm ${dark ? 'border-gray-600 bg-gray-800/40 text-gray-300' : 'border-gray-200 bg-gray-50 text-gray-700'}`}>
          当前原料库共 <span className="font-mono">{candidates.length}</span> 种，启用 <span className="font-mono">{enabledCount}</span> 种。优先级采用 1-5 分，<span className="font-semibold">5 表示最优先使用，1 表示最低优先</span>。导入文件可只包含原料名称与元素含量，单价和策略参数在库内补充。
        </div>

        {showCustomInput && (
          <div className={`mt-4 rounded-lg border p-4 ${dark ? 'border-gray-600 bg-gray-800/40' : 'border-gray-200 bg-gray-50'}`}>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-5">
              <div className="lg:col-span-2">
                <label className={labelBase(dark)}>{isEn ? 'Material name' : '原料名称'}</label>
                <input className={`${inputBase(dark)} w-full`} value={customName} onChange={(e) => setCustomName(e.target.value)} />
              </div>
              <div>
                <label className={labelBase(dark)}>{isEn ? 'Price' : '单价 (元/t)'}</label>
                <input className={`${inputBase(dark)} w-full`} value={customPrice} onChange={(e) => setCustomPrice(e.target.value)} />
              </div>
              <div>
                <label className={labelBase(dark)}>{isEn ? 'Priority' : '优先级（5最高）'}</label>
                <input className={`${inputBase(dark)} w-full`} value={customPriority} onChange={(e) => setCustomPriority(e.target.value)} />
              </div>
              <div>
                <label className={labelBase(dark)}>{isEn ? 'Annual processing min' : '年处理量不低于 (t/a)'}</label>
                <input className={`${inputBase(dark)} w-full`} value={customAnnualMin} onChange={(e) => setCustomAnnualMin(e.target.value)} />
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
              {LEAD_FLASH_TARGET_ELEMENTS.map((key) => (
                <div key={key}>
                  <label className={labelBase(dark)}>{key} %</label>
                  <input
                    className={`${inputSm(dark)} w-full`}
                    value={customRatios[key]}
                    onChange={(e) => setCustomRatios((prev) => ({ ...prev, [key]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className={hintText(dark)}>元素含量合计低于 100% 时，差额自动计入 Other(其他)。</p>
              <button className={btnPrimary(dark)} onClick={addCustomMaterial}>{isEn ? 'Add to Library' : '加入原料库'}</button>
            </div>
          </div>
        )}

        {showLibrary && (
          <div className="mt-4 overflow-auto">
            <table className="w-full min-w-[1080px] text-sm">
              <thead className={dark ? 'text-gray-400' : 'text-gray-600'}>
                <tr>
                  <th className="py-2 pr-3 text-left">{isEn ? 'Use' : '启用'}</th>
                  <th className="py-2 px-3 text-left">{isEn ? 'Details' : '元素'}</th>
                  <th className="py-2 px-3 text-left">{isEn ? 'Material' : '原料'}</th>
                  <th className="py-2 px-3 text-left">{isEn ? 'Price' : '单价 (元/t)'}</th>
                  <th className="py-2 px-3 text-left">{isEn ? 'Priority' : '优先级（5最高）'}</th>
                  <th className="py-2 px-3 text-left">{isEn ? 'Annual min' : '年处理量不低于 (t/a)'}</th>
                  <th className="py-2 pl-3 text-left">{isEn ? 'Main composition' : '主要元素预览'}</th>
                </tr>
              </thead>
              <tbody>
                {candidates.map((c) => {
                  const expanded = expandedMaterialIds.has(c.id)
                  return (
                    <Fragment key={c.id}>
                      <tr className={`border-t ${dark ? 'border-gray-600' : 'border-gray-200'}`}>
                        <td className="py-2 pr-3">
                          <input type="checkbox" checked={c.enabled} onChange={(e) => updateCandidate(c.id, { enabled: e.target.checked })} />
                        </td>
                        <td className="py-2 px-3">
                          <button className={btnSecondary(dark)} onClick={() => toggleMaterialExpanded(c.id)}>
                            {expanded ? '收起' : '展开'}
                          </button>
                        </td>
                        <td className="py-2 px-3 font-medium">{c.name}</td>
                        <td className="py-2 px-3">
                          <input className={`${inputSm(dark)} w-28`} value={c.unitPrice} onChange={(e) => updateCandidate(c.id, { unitPrice: toNumber(e.target.value, c.unitPrice) })} />
                        </td>
                        <td className="py-2 px-3">
                          <input className={`${inputSm(dark)} w-24`} value={c.priority} onChange={(e) => updateCandidate(c.id, { priority: clampPriority(toNumber(e.target.value, c.priority)) })} />
                        </td>
                        <td className="py-2 px-3">
                          <input className={`${inputSm(dark)} w-32`} value={c.annualMinDemand} onChange={(e) => updateCandidate(c.id, { annualMinDemand: toNumber(e.target.value, c.annualMinDemand) })} />
                        </td>
                        <td className="py-2 pl-3 font-mono text-xs">
                          Pb {pct(c.ratios['Pb(铅)'] ?? 0)}%, S {pct(c.ratios['S (硫)'] ?? 0)}%, Fe {pct(c.ratios['Fe(铁)'] ?? 0)}%, Zn {pct(c.ratios['Zn(锌)'] ?? 0)}%
                        </td>
                      </tr>
                      {expanded && (
                        <tr className={dark ? 'bg-gray-800/30' : 'bg-gray-50'}>
                          <td colSpan={7} className={`border-t p-3 ${dark ? 'border-gray-600' : 'border-gray-200'}`}>
                            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
                              {compositionKeys.map((element) => (
                                <div key={element}>
                                  <label className={labelBase(dark)}>{element} %</label>
                                  <input
                                    className={`${inputSm(dark)} w-full`}
                                    value={c.ratios[element] ?? 0}
                                    onChange={(e) => updateCandidateRatio(c.id, element, toNumber(e.target.value, 0))}
                                  />
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className={cardBase(dark)}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className={sectionTitle(dark)}>{isEn ? '2. Blend Goal' : '2. 配矿目标与产能'}</h3>
            <p className={`${hintText(dark)} max-w-5xl leading-relaxed`}>
              {isEn
                ? 'Set the total feed rate and annual operating hours. Material masses are solved by constraints and objective weights.'
                : '这里不输入每种原料的质量，只输入总投料量、年运行时间和最终混料元素范围。系统会在原料库中自动求解各原料投料量，并综合价格、优先级和年处理量不低于要求。'}
            </p>
          </div>
          <button onClick={runOptimize} className={btnPrimary(dark)} disabled={enabledCount === 0}>
            {isEn ? 'Solve Blend' : '求解配料方案'}
          </button>
        </div>
        <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-4">
          <div>
            <label className={labelBase(dark)}>{isEn ? 'Total feed (t/h)' : '总投料量 (t/h)'}</label>
            <input value={totalFeedMass} onChange={(e) => { setTotalFeedMass(e.target.value); setResult(null) }} className={`${inputBase(dark)} w-full`} />
          </div>
          <div>
            <label className={labelBase(dark)}>{isEn ? 'Annual operating hours' : '年运行时间 (h/a)'}</label>
            <input value={annualHours} onChange={(e) => { setAnnualHours(e.target.value); setResult(null) }} className={`${inputBase(dark)} w-full`} />
          </div>
          <div className={resultBox(dark)}>
            <div className={hintText(dark)}>{isEn ? 'Enabled materials' : '启用原料'}</div>
            <div className="font-mono text-lg">{enabledCount}</div>
          </div>
          <div className={resultBox(dark)}>
            <div className={hintText(dark)}>{isEn ? 'Active element constraints' : '启用元素约束'}</div>
            <div className="font-mono text-lg">{enabledTargets}</div>
          </div>
        </div>
        {message && <div className={`mt-4 rounded-lg border p-3 text-sm ${dark ? 'border-blue-700 bg-blue-950/30 text-blue-100' : 'border-blue-200 bg-blue-50 text-blue-800'}`}>{message}</div>}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className={cardBase(dark)}>
          <h3 className={sectionTitle(dark)}>{isEn ? '3. Mixed-Feed Element Range' : '3. 最终混料元素范围'}</h3>
          <p className={`${hintText(dark)} mb-4 leading-relaxed`}>
            最终约束以混合后物料的元素质量分数为对象，覆盖与其他配料计算页面一致的全元素口径。勾选后参与求解，未勾选的元素仅随结果展示。
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className={dark ? 'text-gray-400' : 'text-gray-600'}>
                  <th className="py-2 pr-3 text-left">{isEn ? 'Use' : '启用'}</th>
                  <th className="py-2 px-3 text-left">{isEn ? 'Element' : '元素'}</th>
                  <th className="py-2 px-3 text-left">{isEn ? 'Min %' : '下限 %'}</th>
                  <th className="py-2 pl-3 text-left">{isEn ? 'Max %' : '上限 %'}</th>
                </tr>
              </thead>
              <tbody>
                {targets.map((target) => (
                  <tr key={target.element} className={`border-t ${dark ? 'border-gray-600' : 'border-gray-200'}`}>
                    <td className="py-2 pr-3">
                      <input type="checkbox" checked={target.enabled} onChange={(e) => updateTarget(target.element, { enabled: e.target.checked })} />
                    </td>
                    <td className="py-2 px-3 font-medium">{target.element}</td>
                    <td className="py-2 px-3">
                      <input className={`${inputSm(dark)} w-24`} value={target.minPct} onChange={(e) => updateTarget(target.element, { minPct: toNumber(e.target.value, target.minPct) })} />
                    </td>
                    <td className="py-2 pl-3">
                      <input className={`${inputSm(dark)} w-24`} value={target.maxPct} onChange={(e) => updateTarget(target.element, { maxPct: toNumber(e.target.value, target.maxPct) })} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className={cardBase(dark)}>
          <h3 className={sectionTitle(dark)}>{isEn ? '4. Strategy Weights' : '4. 优化策略权重'}</h3>
          <p className={`${hintText(dark)} mb-4 leading-relaxed`}>
            权重用于调节求解偏好，不再把单项原料投料上下限作为主要策略。价格权重越高越偏向低成本，元素权重越高越贴近目标范围，优先级权重越高越偏向 5 分原料，年处理量权重越高越倾向满足“年处理量不低于”。
          </p>
          <div className="space-y-4">
            {([
              ['cost', isEn ? 'Cost' : '成本权重'],
              ['elementMatch', isEn ? 'Element match' : '元素范围匹配权重'],
              ['priority', isEn ? 'Priority' : '原料优先级权重'],
              ['annualDemand', isEn ? 'Annual processing minimum' : '年处理量不低于权重'],
            ] as const).map(([key, label]) => (
              <div key={key}>
                <div className="mb-1 flex items-center justify-between">
                  <label className={labelBase(dark)}>{label}</label>
                  <span className={`font-mono text-sm ${dark ? 'text-gray-300' : 'text-gray-700'}`}>{weights[key].toFixed(1)}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="12"
                  step="0.1"
                  value={weights[key]}
                  onChange={(e) => {
                    setWeights((prev) => ({ ...prev, [key]: toNumber(e.target.value, prev[key]) }))
                    setResult(null)
                  }}
                  className="w-full"
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {result?.ok && (
        <div className={cardBase(dark)}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className={sectionTitle(dark)}>{isEn ? '5. Optimized Blend Result' : '5. 配料方案结果'}</h3>
              <p className={hintText(dark)}>结果可写入全局物料表，供后续物相计算与热平衡计算继续读取。</p>
            </div>
            <button className={btnPrimary(dark)} onClick={applyResult}>{isEn ? 'Apply Result' : '应用到物料表'}</button>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-4">
            <div className={resultBox(dark)}><div className={hintText(dark)}>{isEn ? 'Total cost' : '总成本'}</div><div className="font-mono text-lg">{result.totalCost.toFixed(0)} 元/h</div></div>
            <div className={resultBox(dark)}><div className={hintText(dark)}>{isEn ? 'Average price' : '平均单价'}</div><div className="font-mono text-lg">{result.avgPrice.toFixed(0)} 元/t</div></div>
            <div className={resultBox(dark)}><div className={hintText(dark)}>{isEn ? 'Materials used' : '使用原料数'}</div><div className="font-mono text-lg">{result.blend.length}</div></div>
            <div className={resultBox(dark)}><div className={hintText(dark)}>{isEn ? 'Objective' : '目标函数值'}</div><div className="font-mono text-lg">{result.objective.toFixed(4)}</div></div>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead className={dark ? 'text-gray-400' : 'text-gray-600'}>
                <tr>
                  <th className="py-2 pr-3 text-left">{isEn ? 'Material' : '原料'}</th>
                  <th className="py-2 px-3 text-right">{isEn ? 'Mass t/h' : '质量 t/h'}</th>
                  <th className="py-2 px-3 text-right">{isEn ? 'Share %' : '占比 %'}</th>
                  <th className="py-2 px-3 text-right">{isEn ? 'Price' : '单价'}</th>
                  <th className="py-2 px-3 text-right">{isEn ? 'Cost' : '成本 元/h'}</th>
                  <th className="py-2 pl-3 text-right">{isEn ? 'Annual use' : '年处理量 t/a'}</th>
                </tr>
              </thead>
              <tbody>
                {result.blend.map((item) => (
                  <tr key={item.id} className={`border-t ${dark ? 'border-gray-600' : 'border-gray-200'}`}>
                    <td className="py-2 pr-3 font-medium">{item.name}</td>
                    <td className="py-2 px-3 text-right font-mono">{item.weight.toFixed(4)}</td>
                    <td className="py-2 px-3 text-right font-mono">{item.sharePct.toFixed(2)}</td>
                    <td className="py-2 px-3 text-right font-mono">{item.unitPrice.toFixed(0)}</td>
                    <td className="py-2 px-3 text-right font-mono">{item.cost.toFixed(0)}</td>
                    <td className="py-2 pl-3 text-right font-mono">{item.annualUsage.toFixed(0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
            <div className={resultBox(dark)}>
              <h4 className={`mb-3 text-sm font-semibold ${dark ? 'text-gray-100' : 'text-gray-900'}`}>{isEn ? 'Mixed Composition' : '混料元素组成'}</h4>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {compositionKeys.map((key) => (
                  <div key={key} className={`rounded border px-3 py-2 ${dark ? 'border-gray-600 bg-gray-700/40' : 'border-gray-200 bg-white'}`}>
                    <div className={hintText(dark)}>{key}</div>
                    <div className="font-mono">{pct(result.composition[key] ?? 0)}%</div>
                  </div>
                ))}
              </div>
            </div>
            <div className={resultBox(dark)}>
              <h4 className={`mb-3 text-sm font-semibold ${dark ? 'text-gray-100' : 'text-gray-900'}`}>{isEn ? 'Constraint Check' : '约束校核'}</h4>
              <div className="space-y-2 text-sm">
                {result.targetErrors.map((err) => (
                  <div key={err.element} className="flex items-center justify-between gap-3">
                    <span>{err.element}: {err.minPct}-{err.maxPct}%</span>
                    <span className={`font-mono ${Math.abs(err.deviationPct) > 1e-6 ? 'text-amber-600' : dark ? 'text-emerald-300' : 'text-emerald-700'}`}>
                      {err.value.toFixed(3)}%
                    </span>
                  </div>
                ))}
                {result.annualShortages.length > 0 && (
                  <div className={`mt-3 rounded border p-3 ${dark ? 'border-amber-700 bg-amber-950/30 text-amber-100' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
                    以下原料“年处理量不低于”要求未完全满足：
                    <div className="mt-1 space-y-1">
                      {result.annualShortages.map((s) => <div key={s.id}>{s.name} 缺口 {s.shortage.toFixed(0)} t/a</div>)}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function clampPriority(v: number) {
  return Math.max(1, Math.min(5, v))
}
