import { useState, useMemo, useEffect, useRef } from 'react'
import {
  BASE_ELEMENTS,
  RAW_MATERIAL_DEFAULT_PRICES,
  SOLVENT_DEFAULT_PRICES,
  type ElementRatios,
} from '../../config/rawMaterialConfig'
import { validateFloat, ValidationError } from '../../utils/validation'
import { phaseAnalysis, type PhaseResult, type PhaseFeSAlgorithm, type ElementWeights } from '../../utils/phaseAnalysis'
import { calcTheoreticalOxygen, type IronOxidationProduct } from '../../utils/oxygenCalc'
import { runNsga2Solvent, type SolventSolution } from '../../utils/solventCalc'
import {
  suggestBuiltinCheaperBlend,
  aggregateBaseMaterials,
  BLEND_CORE_ELEMENTS,
  BLEND_CORE_REL_ERR_LIMIT_PCT,
  type BlendSuggestResult,
} from '../../utils/blendSuggest'
import { useCalc, type MaterialEntry } from '../../context/CalcContext'
import ElementTableCompact from '../ElementTableCompact'
import {
  btnPrimary,
  btnPrimaryDisabled,
  btnPrimarySm,
  btnSecondary,
  btnText,
  inputBase,
  inputSm,
  labelBase,
  cardBase,
  sectionTitle,
  hintText,
  resultBox,
} from '../../theme/uiTheme'

/** 鼠标进入视口顶部此高度(px)时显示浮动总表 */
const FLOATING_TRIGGER_TOP = 120

interface RawMaterialPhaseOxygenProps {
  darkMode: boolean
  language?: 'zh' | 'en'
}

type PhaseInputBasis = {
  elementWeights: ElementWeights
  totalWeight: number
  materialCount: number
  materialNames: string[]
}

function aggregateSulfurBearingBasePhaseInput(materials: MaterialEntry[]): PhaseInputBasis {
  const sulfurBearingBases = materials.filter((m) => {
    const sulfurPct = typeof m.ratios['S (硫)'] === 'number' ? m.ratios['S (硫)'] : parseFloat(String(m.ratios['S (硫)'] ?? 0)) || 0
    return m.type === 'base' && m.weight > 1e-12 && sulfurPct > 1e-9
  })
  const elementWeights: ElementWeights = {}
  let totalWeight = 0

  for (const mat of sulfurBearingBases) {
    totalWeight += mat.weight
    for (const elem of ['Sb(锑)', 'Fe(铁)', 'S (硫)']) {
      const raw = mat.ratios[elem]
      const pct = typeof raw === 'number' ? raw : parseFloat(String(raw ?? 0)) || 0
      elementWeights[elem] = (elementWeights[elem] ?? 0) + (pct / 100) * mat.weight
    }
  }

  return {
    elementWeights,
    totalWeight,
    materialCount: sulfurBearingBases.length,
    materialNames: sulfurBearingBases.map((m) => m.name),
  }
}

type SlagRatioRange = {
  min: number
  max: number
  target: number
  fluctPct: number
  isExact: boolean
}

type SlagRatioMode = 'range' | 'exact'

type SlagRatioInput = {
  mode: SlagRatioMode
  min: string
  max: string
  exact: string
}

function buildSlagRatioRange(input: SlagRatioInput, label: string): SlagRatioRange {
  const values =
    input.mode === 'exact'
      ? [validateFloat(input.exact, `${label}精确值`, { min: 0 })]
      : [
          validateFloat(input.min, `${label}下限`, { min: 0 }),
          validateFloat(input.max, `${label}上限`, { min: 0 }),
        ]

  const min = Math.min(...values)
  const max = Math.max(...values)
  const isExact = Math.abs(max - min) < 1e-12
  const target = isExact ? min : (min + max) / 2
  const fluctPct = target > 0 ? ((max - min) / (min + max)) * 100 : 0
  return { min, max, target, fluctPct, isExact }
}

function formatRatioNumber(value: number) {
  return Number(value.toFixed(4)).toString()
}

function previewSlagRatioRange(value: SlagRatioInput, label: string, isEn: boolean) {
  try {
    const range = buildSlagRatioRange(value, label)
    if (range.isExact) {
      return `${label}: ${isEn ? 'exact' : '精确'} ${formatRatioNumber(range.target)}`
    }
    return `${label}: ${isEn ? 'range' : '范围'} ${formatRatioNumber(range.min)}-${formatRatioNumber(range.max)}`
  } catch {
    return ''
  }
}

export default function RawMaterialPhaseOxygen({ darkMode, language = 'zh' }: RawMaterialPhaseOxygenProps) {
  const isEn = language === 'en'
  const { materials, setMaterials, mixResult, elementTableRows } = useCalc()
  const materialNameEn: Record<string, string> = {
    '锑精矿': 'Antimony Concentrate',
    '锑金精矿': 'Antimony-Gold Concentrate',
    '锑锍': 'Antimony Matte',
    '铅锑混合精矿': 'Lead-Antimony Mixed Concentrate',
    '泡渣': 'Foamy Slag',
    '石灰': 'Lime',
    '铁矿石': 'Iron Ore',
    '富氧空气': 'Oxygen-Enriched Air',
    '熔剂': 'Solvent',
  }
  const displayMaterialName = (name: string) => (isEn ? (materialNameEn[name] ?? name) : name)
  const displaySolutionLabel = (label?: string) => {
    if (!label) return ''
    if (!isEn) return label
    const labelMap: Record<string, string> = {
      '精准渣型解': 'Exact Slag Target',
      '帕累托最优解': 'Pareto Optimal',
      '最小成本解': 'Minimum Cost',
      '最低能耗解': 'Minimum Energy',
      '最小渣量解': 'Minimum Slag',
      '最低石灰解': 'Minimum Lime',
    }
    return labelMap[label] ?? label
  }
  const displayElementLabel = (elem: string) => elem.replace(/\s*\([^)]*\)/g, '').replace(/\s+/g, '')
  const [showFloatingTable, setShowFloatingTable] = useState(false)
  const [pinned, setPinned] = useState(false)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [addFeedback, setAddFeedback] = useState<string | null>(null)

  /** 添加反馈自动消失 */
  useEffect(() => {
    if (!addFeedback) return
    const t = setTimeout(() => setAddFeedback(null), 2200)
    return () => clearTimeout(t)
  }, [addFeedback])

  /** 鼠标上移（进入视口顶部）时显示浮动总表；图钉时可常驻 */
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (pinned) {
        setShowFloatingTable(true)
        return
      }
      if (e.clientY < FLOATING_TRIGGER_TOP) {
        if (hideTimerRef.current) {
          clearTimeout(hideTimerRef.current)
          hideTimerRef.current = null
        }
        setShowFloatingTable(true)
      } else {
        if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
        hideTimerRef.current = setTimeout(() => setShowFloatingTable(false), 350)
      }
    }
    window.addEventListener('mousemove', handleMouseMove, { passive: true })
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    }
  }, [pinned])

  const [selectedBase, setSelectedBase] = useState<string>('')
  const [baseWeight, setBaseWeight] = useState<string>('')
  const [baseUnitPrice, setBaseUnitPrice] = useState<string>('')
  const [editingRatios, setEditingRatios] = useState<ElementRatios | null>(null)
  const [solventType, setSolventType] = useState<'石灰' | '铁矿石'>('石灰')
  type SolventParams = { fe: string; sio2: string; cao: string; unitPrice: string }
  const [limeParams, setLimeParams] = useState<SolventParams>(() => ({
    fe: '0', sio2: '0', cao: '85.05',
    unitPrice: String(SOLVENT_DEFAULT_PRICES['石灰'] ?? 550),
  }))
  const [ironOreParams, setIronOreParams] = useState<SolventParams>(() => ({
    fe: '59.94', sio2: '6', cao: '0',
    unitPrice: String(SOLVENT_DEFAULT_PRICES['铁矿石'] ?? 750),
  }))
  /** 熔剂三参数校验弹窗：总%>100 时归一 */
  const [solventRatioModal, setSolventRatioModal] = useState<{
    type: '石灰' | '铁矿石'
    total: number
    ratios: { 'Fe(铁)': number; 'SiO₂(二氧化硅)': number; 'CaO(氧化钙)': number }
  } | null>(null)
  const [targetFeSiO2, setTargetFeSiO2] = useState<SlagRatioInput>({
    mode: 'range',
    min: '0.9',
    max: '1.1',
    exact: '1.0',
  })
  const [targetCaOSiO2, setTargetCaOSiO2] = useState<SlagRatioInput>({
    mode: 'range',
    min: '0.45',
    max: '0.55',
    exact: '0.5',
  })
  const [oxyPurity, setOxyPurity] = useState<string>('32')
  const [oxygenCoefficient, setOxygenCoefficient] = useState<string>('1.15')
  const [oxyUnitPrice, setOxyUnitPrice] = useState<string>('0.45')
  const [ironOxidationProduct, setIronOxidationProduct] = useState<IronOxidationProduct>('FeO')
  const [customFeSO2Coeff, setCustomFeSO2Coeff] = useState<string>('1.50')
  const [customFeS2O2Coeff, setCustomFeS2O2Coeff] = useState<string>('2.50')
  const [phaseData, setPhaseData] = useState<PhaseResult | null>(null)
  const [phaseBasis, setPhaseBasis] = useState<PhaseInputBasis | null>(null)
  const [phaseAlgorithm, setPhaseAlgorithm] = useState<PhaseFeSAlgorithm>('adaptive')
  const [oxygenResult, setOxygenResult] = useState<ReturnType<typeof calcTheoreticalOxygen> | null>(null)
  const [nsga2Results, setNsga2Results] = useState<SolventSolution[] | null>(null)
  const [paretoFront, setParetoFront] = useState<SolventSolution[]>([])
  const [appliedSolvent, setAppliedSolvent] = useState<SolventSolution | null>(null)
  const [hoveredPoint, setHoveredPoint] = useState<SolventSolution | null>(null)
  const [algoDetailsOpen, setAlgoDetailsOpen] = useState(false)
  /** 渣型计算中：显示进度条 */
  const [isCalcRunning, setIsCalcRunning] = useState(false)
  const [calcProgress, setCalcProgress] = useState(0)
  const [calcStage, setCalcStage] = useState('')
  /** 错误提示弹窗（使用自定义弹窗，避免 window.alert 在 Electron/Cursor 中不显示） */
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [blendSuggestDrawerOpen, setBlendSuggestDrawerOpen] = useState(false)
  const [blendSuggestLoading, setBlendSuggestLoading] = useState(false)
  const blendSuggestRequestRef = useRef(0)
  /** 原料成本最优方案结果：只在用户主动打开时展示，不自动改动当前配方 */
  const [blendSuggestModal, setBlendSuggestModal] = useState<
    (BlendSuggestResult & { currentCostYuanPerH: number; targetTotalWeight: number; generatedAt: number }) | null
  >(null)
  /** 元素总和偏差时让用户选择处理方式 */
  const [ratioAdjustModal, setRatioAdjustModal] = useState<{
    total: number
    ratios: ElementRatios
    weight: number
    unitPrice: number
    mode: 'over' | 'under'
    customName?: string
  } | null>(null)
  /** 自定义原料：名称、投料量、单价、元素含量 */
  const [showCustomBase, setShowCustomBase] = useState(false)
  const [customBaseName, setCustomBaseName] = useState('')
  const [customBaseWeight, setCustomBaseWeight] = useState('')
  const [customBaseUnitPrice, setCustomBaseUnitPrice] = useState('')
  const [customBaseRatios, setCustomBaseRatios] = useState<Record<string, number>>(() => {
    const r: Record<string, number> = {}
    for (const k of Object.keys(BASE_ELEMENTS[1].ratios)) r[k] = 0
    return r
  })
  const targetFeSiO2Preview = useMemo(
    () => previewSlagRatioRange(targetFeSiO2, 'Fe/SiO₂', isEn),
    [targetFeSiO2, isEn]
  )
  const targetCaOSiO2Preview = useMemo(
    () => previewSlagRatioRange(targetCaOSiO2, 'CaO/SiO₂', isEn),
    [targetCaOSiO2, isEn]
  )
  const ratioModeButtonClass = (active: boolean) =>
    `px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${
      active
        ? darkMode
          ? 'border-blue-500 bg-blue-600 text-white'
          : 'border-blue-600 bg-blue-600 text-white'
        : darkMode
          ? 'border-gray-500 text-gray-300 hover:bg-gray-700 hover:border-gray-400'
          : 'border-gray-300 text-gray-700 hover:bg-gray-50 hover:border-gray-400'
    }`
  const ironProductOptions: { value: IronOxidationProduct; label: string; labelEn: string }[] = [
    { value: 'FeO', label: 'FeO 入渣', labelEn: 'FeO to slag' },
    { value: 'Fe2O3', label: 'Fe₂O₃', labelEn: 'Fe₂O₃' },
    { value: 'Fe3O4', label: 'Fe₃O₄', labelEn: 'Fe₃O₄' },
    { value: 'custom', label: '自定义', labelEn: 'Custom' },
  ]
  const switchFeSiO2Mode = (mode: SlagRatioMode) => {
    setTargetFeSiO2((prev) => {
      if (mode === 'exact' && prev.mode !== 'exact') {
        try {
          return { ...prev, mode, exact: formatRatioNumber(buildSlagRatioRange(prev, 'Fe/SiO₂').target) }
        } catch {
          return { ...prev, mode }
        }
      }
      return { ...prev, mode }
    })
  }
  const switchCaOSiO2Mode = (mode: SlagRatioMode) => {
    setTargetCaOSiO2((prev) => {
      if (mode === 'exact' && prev.mode !== 'exact') {
        try {
          return { ...prev, mode, exact: formatRatioNumber(buildSlagRatioRange(prev, 'CaO/SiO₂').target) }
        } catch {
          return { ...prev, mode }
        }
      }
      return { ...prev, mode }
    })
  }

  const baseList = useMemo(() => Object.values(BASE_ELEMENTS), [])
  const elementKeys = useMemo(() => Object.keys(BASE_ELEMENTS[1].ratios), [])
  const selectedMaterial = useMemo(
    () => baseList.find((m) => m.name === selectedBase),
    [baseList, selectedBase]
  )

  /** 选择原料时自动填充默认单价（万元/吨） */
  useEffect(() => {
    if (selectedBase && RAW_MATERIAL_DEFAULT_PRICES[selectedBase] != null) {
      setBaseUnitPrice(String(RAW_MATERIAL_DEFAULT_PRICES[selectedBase]))
    } else {
      setBaseUnitPrice('')
    }
  }, [selectedBase])

  const applyMaterial = (ratios: ElementRatios, w: number, unitPrice: number, nameOverride?: string) => {
    const name = nameOverride ?? selectedMaterial?.name
    if (!name) return
    setMaterials((prev) => [
      ...prev.filter((m) => m.type !== 'base' || m.name !== name),
      {
        id: `base-${Date.now()}`,
        name,
        ratios: { ...ratios },
        weight: w,
        type: 'base' as const,
        unitPrice,
      },
    ])
    setPhaseData(null)
    setPhaseBasis(null)
    setOxygenResult(null)
    setBaseWeight('')
    setBaseUnitPrice('')
    setEditingRatios(null)
    setRatioAdjustModal(null)
    if (nameOverride) {
      setShowCustomBase(false)
      setCustomBaseName('')
      setCustomBaseWeight('')
      setCustomBaseUnitPrice('')
      setCustomBaseRatios(Object.fromEntries(elementKeys.map((k) => [k, 0])))
    }
    setAddFeedback(isEn ? `Material added: ${displayMaterialName(name)}` : `已添加原料：${name}`)
  }

  const handleAddBase = () => {
    setRatioAdjustModal(null)
    try {
      if (!selectedMaterial) throw new ValidationError('请先选择原料类型')
      const w = validateFloat(baseWeight, '投料量', { min: 0, required: true })
      if (w <= 0) throw new ValidationError('投料量必须大于0')
      const unitPriceWanYuanPerTon = validateFloat(baseUnitPrice, '单价', { min: 0, required: true })
      const unitPrice = unitPriceWanYuanPerTon * 10000
      const ratios = editingRatios ?? selectedMaterial.ratios
      for (const [elem, val] of Object.entries(ratios)) {
        const v = typeof val === 'number' ? val : parseFloat(String(val))
        if (isNaN(v)) throw new ValidationError(`${elem} 包含无效数字`)
      }
      const total = Object.values(ratios).reduce((s, v) => s + (typeof v === 'number' ? v : parseFloat(String(v)) || 0), 0)
      if (Math.abs(total - 100) <= 0.1) {
        applyMaterial(ratios, w, unitPrice)
        return
      }
      if (total > 100) {
        setRatioAdjustModal({ total, ratios, weight: w, unitPrice: unitPriceWanYuanPerTon, mode: 'over' })
        return
      }
      setRatioAdjustModal({ total, ratios, weight: w, unitPrice: unitPriceWanYuanPerTon, mode: 'under' })
    } catch (e) {
      setErrorMsg(e instanceof ValidationError ? e.message : String(e))
    }
  }

  const handleRatioAdjustChoice = (choice: 'normalize' | 'fillOther' | 'cancel') => {
    if (!ratioAdjustModal) return
    const { total, ratios, weight, unitPrice, mode, customName } = ratioAdjustModal
    if (choice === 'cancel') {
      setRatioAdjustModal(null)
      return
    }
    if (choice === 'normalize') {
      if (total <= 0) {
        setErrorMsg('元素总和为0，无法归一化')
        setRatioAdjustModal(null)
        return
      }
      const scale = 100 / total
      const normalized: ElementRatios = {}
      for (const [k, v] of Object.entries(ratios)) {
        normalized[k] = (typeof v === 'number' ? v : parseFloat(String(v)) || 0) * scale
      }
      applyMaterial(normalized, weight, unitPrice * 10000, customName)
      return
    }
    if (choice === 'fillOther' && mode === 'under') {
      const remaining = 100 - total
      const otherVal = (ratios['Other(其他)'] ?? 0) + remaining
      const filled = { ...ratios, 'Other(其他)': otherVal }
      applyMaterial(filled, weight, unitPrice * 10000, customName)
    }
  }

  const handleAddCustomBase = () => {
    setRatioAdjustModal(null)
    try {
      const name = customBaseName.trim()
      if (!name) throw new ValidationError('请输入原料名称')
      const w = validateFloat(customBaseWeight, '投料量', { min: 0, required: true })
      if (w <= 0) throw new ValidationError('投料量必须大于0')
      const unitPriceWanYuan = validateFloat(customBaseUnitPrice, '单价', { min: 0, required: true })
      const unitPrice = unitPriceWanYuan * 10000
      const ratios: ElementRatios = { ...customBaseRatios }
      for (const [elem, val] of Object.entries(ratios)) {
        const v = typeof val === 'number' ? val : parseFloat(String(val))
        if (isNaN(v)) throw new ValidationError(`${elem} 包含无效数字`)
      }
      const total = Object.values(ratios).reduce((s, v) => s + (typeof v === 'number' ? v : parseFloat(String(v)) || 0), 0)
      if (Math.abs(total - 100) <= 0.1) {
        applyMaterial(ratios, w, unitPrice, name)
        return
      }
      if (total > 100) {
        setRatioAdjustModal({ total, ratios, weight: w, unitPrice: unitPriceWanYuan, mode: 'over', customName: name })
        return
      }
      setRatioAdjustModal({ total, ratios, weight: w, unitPrice: unitPriceWanYuan, mode: 'under', customName: name })
    } catch (e) {
      setErrorMsg(e instanceof ValidationError ? e.message : String(e))
    }
  }

  /** 获取当前选中熔剂的参数 */
  const currentSolventParams = solventType === '石灰' ? limeParams : ironOreParams
  const setCurrentSolventParams = solventType === '石灰' ? setLimeParams : setIronOreParams

  /** 解析并校验熔剂三参数；总>100 返回 null 并弹窗，总<100 时 Other 由 buildSolventRatios 补全 */
  const getValidatedSolventComposition = (
    type: '石灰' | '铁矿石'
  ): { 'Fe(铁)': number; 'SiO₂(二氧化硅)': number; 'CaO(氧化钙)': number } | null => {
    const p = type === '石灰' ? limeParams : ironOreParams
    const fe = parseFloat(p.fe.replace(',', '.')) || 0
    const sio2 = parseFloat(p.sio2.replace(',', '.')) || 0
    const cao = parseFloat(p.cao.replace(',', '.')) || 0
    if (fe < 0 || sio2 < 0 || cao < 0) return null
    if (![fe, sio2, cao].some((x) => x > 0)) return null
    const total = fe + sio2 + cao
    if (total > 100.1) {
      setSolventRatioModal({ type, total, ratios: { 'Fe(铁)': fe, 'SiO₂(二氧化硅)': sio2, 'CaO(氧化钙)': cao } })
      return null
    }
    return { 'Fe(铁)': fe, 'SiO₂(二氧化硅)': sio2, 'CaO(氧化钙)': cao }
  }

  const handleSolventRatioChoice = (choice: 'normalize' | 'cancel') => {
    if (!solventRatioModal) return
    const { type, total, ratios } = solventRatioModal
    if (choice === 'cancel') {
      setSolventRatioModal(null)
      return
    }
    if (choice === 'normalize' && total > 0) {
      const scale = 100 / total
      const next = {
        fe: String((ratios['Fe(铁)'] * scale).toFixed(2)),
        sio2: String((ratios['SiO₂(二氧化硅)'] * scale).toFixed(2)),
        cao: String((ratios['CaO(氧化钙)'] * scale).toFixed(2)),
        unitPrice: type === '石灰' ? limeParams.unitPrice : ironOreParams.unitPrice,
      }
      if (type === '石灰') setLimeParams(next)
      else setIronOreParams(next)
    }
    setSolventRatioModal(null)
  }

  const handleSolventTypeChange = (type: '石灰' | '铁矿石') => setSolventType(type)

  const handleAddSolventParams = () => {
    const comp = getValidatedSolventComposition(solventType)
    if (!comp) return
    const ratios = buildSolventRatios(comp['Fe(铁)'], comp['SiO₂(二氧化硅)'], comp['CaO(氧化钙)'])
    const unitPrice = parseFloat(currentSolventParams.unitPrice.replace(',', '.')) || 0
    setMaterials((prev) => {
      const rest = prev.filter((m) => !(m.name === solventType && m.type === 'solvent'))
      return [...rest, {
        id: `solvent-${solventType}-${Date.now()}`,
        name: solventType,
        ratios,
        weight: 0,
        type: 'solvent' as const,
        unitPrice,
      }]
    })
    setAddFeedback(
      isEn
        ? `${displayMaterialName(solventType)} parameters added to summary table.`
        : `已添加${solventType}参数至总表，用量待渣型计算`
    )
  }

  const handleReset = () => {
    setNsga2Results(null)
    setParetoFront([])
    setAppliedSolvent(null)
    setPhaseData(null)
    setPhaseBasis(null)
    setOxygenResult(null)
    setHoveredPoint(null)
    setIsCalcRunning(false)
    setCalcProgress(0)
    setCalcStage('')
  }

  const closeBlendSuggestDrawer = () => {
    blendSuggestRequestRef.current += 1
    setBlendSuggestDrawerOpen(false)
    setBlendSuggestLoading(false)
    setBlendSuggestModal(null)
  }

  const handleRunBlendOptimization = () => {
    const { targetElementWeights, totalWeight, currentCostYuanPerH } = aggregateBaseMaterials(materials)
    if (!Number.isFinite(totalWeight) || totalWeight <= 0) {
      setErrorMsg(isEn ? 'Please add raw materials before optimizing.' : '请先添加原料后再进行优化')
      return
    }

    const requestId = blendSuggestRequestRef.current + 1
    blendSuggestRequestRef.current = requestId
    setBlendSuggestDrawerOpen(true)
    setBlendSuggestLoading(true)
    setBlendSuggestModal(null)

    window.setTimeout(() => {
      if (blendSuggestRequestRef.current !== requestId) return
      const result = suggestBuiltinCheaperBlend(targetElementWeights, totalWeight)
      if (!result.ok) {
        setBlendSuggestLoading(false)
        setBlendSuggestDrawerOpen(false)
        setErrorMsg(result.message ?? (isEn ? 'Unable to optimize the current blend.' : '无法优化当前配方'))
        return
      }
      setBlendSuggestModal({
        ...result,
        currentCostYuanPerH,
        targetTotalWeight: totalWeight,
        generatedAt: Date.now(),
      })
      setBlendSuggestLoading(false)
    }, 1000)
  }

  const handleApplyBlendSuggestion = () => {
    const bs = blendSuggestModal
    if (!bs) return
    const rest = materials.filter((m) => m.type !== 'base')
    const newBases = bs.blend.map((b, i) => ({
      id: `base-blend-${b.id}-${Date.now()}-${i}`,
      name: b.name,
      ratios: { ...b.ratios },
      weight: b.weight,
      type: 'base' as const,
      unitPrice: b.unitPriceYuanPerTon,
    }))
    setMaterials([...newBases, ...rest])
    setPhaseData(null)
    setPhaseBasis(null)
    setOxygenResult(null)
    setBlendSuggestModal(null)
    setBlendSuggestDrawerOpen(false)
    setAddFeedback(isEn ? 'Optimized blend applied. Base materials were replaced.' : '已应用优化配方，当前原料行已替换')
  }

  const handleCopyBlendSuggestion = async () => {
    const bs = blendSuggestModal
    if (!bs) return
    const saving = bs.currentCostYuanPerH - bs.suggestedCostYuanPerH
    const savingPct = bs.currentCostYuanPerH > 0 ? (saving / bs.currentCostYuanPerH) * 100 : 0
    const lines = [
      isEn ? 'Raw-material cost-optimal blend suggestion' : '原料成本最优方案建议',
      `${isEn ? 'Target total mass' : '目标总质量'}: ${bs.targetTotalWeight.toFixed(4)} t/h`,
      `${isEn ? 'Current cost' : '当前成本'}: ${bs.currentCostYuanPerH.toFixed(0)} ${isEn ? 'CNY/h' : '元/h'}`,
      `${isEn ? 'Suggested cost' : '推荐成本'}: ${bs.suggestedCostYuanPerH.toFixed(0)} ${isEn ? 'CNY/h' : '元/h'}`,
      `${isEn ? 'Saving' : '节约'}: ${saving.toFixed(0)} ${isEn ? 'CNY/h' : '元/h'} (${savingPct.toFixed(1)}%)`,
      `${isEn ? 'Core-element constraint' : '核心元素约束'}: ${isEn ? '<=' : '≤'} ${BLEND_CORE_REL_ERR_LIMIT_PCT}%`,
      '',
      isEn ? 'Suggested blend:' : '推荐配方：',
      ...bs.blend.map(
        (b) =>
          `${displayMaterialName(b.name)}\t${b.weight.toFixed(4)} t/h\t${(b.unitPriceYuanPerTon / 10000).toFixed(2)} ${isEn ? 'x10k CNY/t' : '万元/吨'}`
      ),
      '',
      `${isEn ? 'Max core-element relative error' : '核心元素最大相对偏差'}: ${bs.maxCoreRelErrPct.toFixed(2)}%`,
    ]
    try {
      await navigator.clipboard.writeText(lines.join('\n'))
      setAddFeedback(isEn ? 'Optimized blend copied.' : '已复制优化配方')
    } catch {
      setErrorMsg(isEn ? 'Failed to copy the optimized blend.' : '复制优化配方失败')
    }
  }

  const handleRunPhase = () => {
    try {
      if (!mixResult || mixResult.totalWeight <= 0) throw new ValidationError('请先添加物料并计算物料结果')
      if (!appliedSolvent) throw new ValidationError('请先在步骤3中选择并应用一个熔剂方案')
      const nextPhaseBasis = aggregateSulfurBearingBasePhaseInput(materials)
      if (nextPhaseBasis.totalWeight <= 0 || nextPhaseBasis.materialCount === 0) {
        throw new ValidationError('未检测到含硫基础原料，无法进行硫化物物相估算')
      }
      const phase = phaseAnalysis(nextPhaseBasis.elementWeights, phaseAlgorithm)
      setPhaseData(phase)
      setPhaseBasis(nextPhaseBasis)
      setOxygenResult(null)
      setAddFeedback('已更新物相估算结果')
    } catch (e) {
      setErrorMsg(e instanceof ValidationError ? e.message : String(e))
    }
  }

  const handleCalcOxygen = () => {
    try {
      if (!phaseData) throw new ValidationError('请先进行物相分析')
      const purity = validateFloat(oxyPurity, '氧气浓度', { min: 0, max: 100 })
      const supplyCoefficient = validateFloat(oxygenCoefficient, '供氧系数', { min: 0.01, max: 25 })
      const unitPrice = validateFloat(oxyUnitPrice, '富氧空气单价', { min: 0 })
      const customFeS = ironOxidationProduct === 'custom'
        ? validateFloat(customFeSO2Coeff, 'FeS 耗氧系数', { min: 0, required: true })
        : undefined
      const customFeS2 = ironOxidationProduct === 'custom'
        ? validateFloat(customFeS2O2Coeff, 'FeS₂ 耗氧系数', { min: 0, required: true })
        : undefined
      const res = calcTheoreticalOxygen(phaseData, {
        oxy_purity: purity,
        oxygen_coefficient: supplyCoefficient,
        iron_product: ironOxidationProduct,
        custom_FeS_O2_coeff: customFeS,
        custom_FeS2_O2_coeff: customFeS2,
      })
      setOxygenResult(res)
      const totalAir = res.mass + res.N2_mass
      setMaterials((prev) => {
        const without = prev.filter((m) => m.name !== '富氧空气')
        return [
          ...without,
          {
            id: `oxygen-${Date.now()}`,
            name: '富氧空气',
            // Store oxygen-enriched-air composition as percentages (0-100),
            // consistent with all other material rows.
            ratios: {
              'O (氧)': totalAir > 0 ? (res.mass / totalAir) * 100 : 0,
              'N (氮)': totalAir > 0 ? (res.N2_mass / totalAir) * 100 : 0,
            },
            weight: totalAir,
            type: 'oxygen' as const,
            unitPrice,
            airVolume: res.air_volume,
          },
        ]
      })
      setAddFeedback(isEn ? 'Added/updated oxygen-enriched air.' : '已添加/更新富氧空气')
    } catch (e) {
      window.alert('输入错误：' + (e instanceof ValidationError ? e.message : String(e)))
    }
  }

  const handleNsga2Solve = async () => {
    try {
      const limeComp = getValidatedSolventComposition('石灰')
      const ironComp = getValidatedSolventComposition('铁矿石')
      if (!limeComp || !ironComp) return

      const baseMats = materials.filter((m) => m.type === 'base')
      if (baseMats.length === 0) throw new ValidationError('请先添加原料')
      const baseTotal = baseMats.reduce((s, m) => s + m.weight, 0)
      if (baseTotal <= 0) throw new ValidationError('原料总重量须大于 0')
      const elementWeights: Record<string, number> = {}
      for (const mat of baseMats) {
        for (const [elem, ratio] of Object.entries(mat.ratios)) {
          const val = (typeof ratio === 'number' ? ratio : parseFloat(String(ratio)) || 0) / 100 * mat.weight
          if (!Number.isFinite(val)) continue
          elementWeights[elem] = (elementWeights[elem] ?? 0) + val
        }
      }
      const feRange = buildSlagRatioRange(targetFeSiO2, 'Fe/SiO₂')
      const caRange = buildSlagRatioRange(targetCaOSiO2, 'CaO/SiO₂')
      const limestonePrice = parseFloat(limeParams.unitPrice.replace(',', '.')) || SOLVENT_DEFAULT_PRICES['石灰']
      const ironOrePrice = parseFloat(ironOreParams.unitPrice.replace(',', '.')) || SOLVENT_DEFAULT_PRICES['铁矿石']

      setIsCalcRunning(true)
      setCalcProgress(0)
      setCalcStage('在准备参数…')
      setErrorMsg(null)

      const startTime = Date.now()
      const MIN_DISPLAY_MS = 500
      let lastProgress = 0

      const result = await runNsga2Solvent(
        {
          elementWeights,
          targetFeSiO2: feRange.target,
          targetCaOSiO2: caRange.target,
          feSiO2FluctPct: feRange.fluctPct,
          caOSiO2FluctPct: caRange.fluctPct,
          baseMaterials: baseMats,
          limestoneComposition: limeComp,
          ironOreComposition: ironComp,
          limestonePrice,
          ironOrePrice,
        },
        (p) => {
          lastProgress = p.percent
          setCalcProgress(p.percent)
          setCalcStage(p.stage)
        }
      )

      const valid = (result.solutions ?? []).filter(
        (s): s is SolventSolution =>
          s != null &&
          Number.isFinite(s.limestone) &&
          Number.isFinite(s.ironOre) &&
          Number.isFinite(s.cost)
      )
      if (valid.length === 0) throw new ValidationError('在目标范围内未找到可行解，请放宽范围或检查原料')

      const elapsed = Date.now() - startTime
      const remain = Math.max(0, MIN_DISPLAY_MS - elapsed)
      if (remain > 0) {
        setCalcStage('正在汇总结果…')
        const from = lastProgress
        const animStart = Date.now()
        const tick = () => {
          const t = Date.now() - animStart
          const p = Math.min(100, from + ((100 - from) * t) / remain)
          setCalcProgress(p)
          if (p >= 100) setCalcStage('完成')
          if (t < remain) requestAnimationFrame(tick)
          else {
            setCalcProgress(100)
            setCalcStage('完成')
            setTimeout(() => {
              setNsga2Results(valid)
              setParetoFront(result.paretoFront ?? [])
              setAppliedSolvent(null)
              setIsCalcRunning(false)
              setCalcProgress(0)
              setCalcStage('')
            }, 300)
          }
        }
        requestAnimationFrame(tick)
      } else {
        setNsga2Results(valid)
        setParetoFront(result.paretoFront ?? [])
        setAppliedSolvent(null)
        setIsCalcRunning(false)
        setCalcProgress(0)
        setCalcStage('')
      }
    } catch (e) {
      setIsCalcRunning(false)
      setCalcProgress(0)
      setErrorMsg(e instanceof ValidationError ? e.message : String(e))
    }
  }

  const buildSolventRatios = (fe: number, sio2: number, cao: number): ElementRatios => {
    const total = fe + sio2 + cao
    const ratios: ElementRatios = {
      'Fe(铁)': fe,
      'SiO₂(二氧化硅)': sio2,
      'CaO(氧化钙)': cao,
    }
    if (total < 99.9) ratios['Other(其他)'] = 100 - total
    return ratios
  }

  const handleApplySolvent = (sol: SolventSolution) => {
    if (!sol || typeof sol.limestone !== 'number' || typeof sol.ironOre !== 'number') return
    const limeFe = parseFloat(limeParams.fe.replace(',', '.')) || 0
    const limeSio2 = parseFloat(limeParams.sio2.replace(',', '.')) || 0
    const limeCao = parseFloat(limeParams.cao.replace(',', '.')) || 0
    const ironFe = parseFloat(ironOreParams.fe.replace(',', '.')) || 0
    const ironSio2 = parseFloat(ironOreParams.sio2.replace(',', '.')) || 0
    const ironCao = parseFloat(ironOreParams.cao.replace(',', '.')) || 0
    const limeRatios = buildSolventRatios(limeFe, limeSio2, limeCao)
    const ironRatios = buildSolventRatios(ironFe, ironSio2, ironCao)
    setMaterials((prev) => {
      const without = prev.filter((m) => !(m.type === 'solvent' && (m.name === '石灰' || m.name === '铁矿石')))
      const next = [...without]
      if (sol.limestone > 1e-6) {
        next.push({
          id: `solvent-石灰-${Date.now()}`,
          name: '石灰',
          ratios: { ...limeRatios },
          weight: sol.limestone,
          type: 'solvent',
          unitPrice: parseFloat(limeParams.unitPrice.replace(',', '.')) || SOLVENT_DEFAULT_PRICES['石灰'],
        })
      }
      if (sol.ironOre > 1e-6) {
        next.push({
          id: `solvent-铁矿石-${Date.now()}`,
          name: '铁矿石',
          ratios: { ...ironRatios },
          weight: sol.ironOre,
          type: 'solvent',
          unitPrice: parseFloat(ironOreParams.unitPrice.replace(',', '.')) || SOLVENT_DEFAULT_PRICES['铁矿石'],
        })
      }
      return next
    })
    setAppliedSolvent(sol)
    setPhaseData(null)
    setPhaseBasis(null)
    setOxygenResult(null)
  }

  const dark = darkMode

  return (
    <div className="space-y-6">
      {blendSuggestDrawerOpen && (() => {
        if (blendSuggestLoading || !blendSuggestModal) {
          return (
            <div
              className="fixed inset-0 z-[9999] flex justify-end bg-black/40 backdrop-blur-sm"
              onClick={closeBlendSuggestDrawer}
            >
              <aside
                className={`h-full w-full max-w-[48rem] overflow-y-auto border-l shadow-2xl ${
                  dark ? 'bg-gray-800 border-gray-600' : 'bg-white border-gray-200'
                }`}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex min-h-full flex-col">
                  <div className={`sticky top-0 z-10 border-b px-6 py-5 ${dark ? 'bg-gray-800/95 border-gray-600' : 'bg-white/95 border-gray-200'} backdrop-blur`}>
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className={`text-lg font-semibold ${dark ? 'text-gray-100' : 'text-gray-900'}`}>
                          {isEn ? 'Raw-Material Cost-Optimal Blend' : '原料成本最优方案'}
                        </h3>
                        <p className={`mt-1 text-sm leading-relaxed ${dark ? 'text-gray-400' : 'text-gray-600'}`}>
                          {isEn
                            ? `The optimizer keeps total mass fixed, enforces core-element deviation within ${BLEND_CORE_REL_ERR_LIMIT_PCT}%, then minimizes cost.`
                            : `正在固定总质量并校核核心元素偏差≤${BLEND_CORE_REL_ERR_LIMIT_PCT}%，再寻找成本最低的可行配比。`}
                        </p>
                      </div>
                      <button type="button" onClick={closeBlendSuggestDrawer} className={btnText(dark)}>
                        {isEn ? 'Close' : '关闭'}
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-1 items-center justify-center px-6 py-12">
                    <div className="text-center">
                      <div className={`mx-auto h-12 w-12 animate-spin rounded-full border-4 ${
                        dark ? 'border-gray-600 border-t-blue-400' : 'border-gray-200 border-t-blue-600'
                      }`} />
                      <div className={`mt-5 text-base font-semibold ${dark ? 'text-gray-100' : 'text-gray-900'}`}>
                        {isEn ? 'Calculating raw-material blend...' : '原料配比计算中…'}
                      </div>
                      <p className={`mt-2 text-sm ${dark ? 'text-gray-400' : 'text-gray-600'}`}>
                        {isEn
                          ? 'Searching the material library for the raw-material cost-optimal mixed feed.'
                          : '正在从原料库中寻找满足约束的原料成本最优混合矿配料方式。'}
                      </p>
                    </div>
                  </div>
                </div>
              </aside>
            </div>
          )
        }
        const saving = blendSuggestModal.currentCostYuanPerH - blendSuggestModal.suggestedCostYuanPerH
        const savingPct = blendSuggestModal.currentCostYuanPerH > 0 ? (saving / blendSuggestModal.currentCostYuanPerH) * 100 : 0
        const blendTotalWeight = blendSuggestModal.blend.reduce((sum, item) => sum + item.weight, 0)
        const blendCoreWithinLimit = blendSuggestModal.maxCoreRelErrPct <= BLEND_CORE_REL_ERR_LIMIT_PCT
        const achievedRows = blendSuggestModal.achievedVsTarget
          .filter(
            (row) =>
              Math.abs(row.target) > 1e-8 &&
              (BLEND_CORE_ELEMENTS.has(row.element) || Math.abs(row.relErrPct) > BLEND_CORE_REL_ERR_LIMIT_PCT)
          )
          .sort((a, b) => {
            const aCore = BLEND_CORE_ELEMENTS.has(a.element) ? 1 : 0
            const bCore = BLEND_CORE_ELEMENTS.has(b.element) ? 1 : 0
            return bCore - aCore || Math.abs(b.relErrPct) - Math.abs(a.relErrPct)
          })
          .slice(0, 18)
        return (
          <div
            className="fixed inset-0 z-[9999] flex justify-end bg-black/40 backdrop-blur-sm"
            onClick={closeBlendSuggestDrawer}
          >
            <aside
              className={`h-full w-full max-w-[48rem] overflow-y-auto border-l shadow-2xl ${
                dark ? 'bg-gray-800 border-gray-600' : 'bg-white border-gray-200'
              }`}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex min-h-full flex-col">
                <div className={`sticky top-0 z-10 border-b px-6 py-5 ${dark ? 'bg-gray-800/95 border-gray-600' : 'bg-white/95 border-gray-200'} backdrop-blur`}>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className={`text-lg font-semibold ${dark ? 'text-gray-100' : 'text-gray-900'}`}>
                        {isEn ? 'Raw-Material Cost-Optimal Blend' : '原料成本最优方案'}
                      </h3>
                      <p className={`mt-1 text-sm leading-relaxed ${dark ? 'text-gray-400' : 'text-gray-600'}`}>
                        {isEn
                          ? 'The current blend is kept unchanged until you explicitly apply the suggestion.'
                          : '优化结果仅作为建议展示，只有点击应用后才会替换当前原料。'}
                      </p>
                    </div>
                    <button type="button" onClick={closeBlendSuggestDrawer} className={btnText(dark)}>
                      {isEn ? 'Close' : '关闭'}
                    </button>
                  </div>
                </div>

                <div className="flex-1 space-y-5 px-6 py-5">
                  {blendSuggestModal.message && (
                    <p className={`rounded-lg px-3 py-2 text-sm ${dark ? 'bg-amber-900/40 text-amber-200' : 'bg-amber-50 text-amber-900'}`}>
                      {blendSuggestModal.message}
                    </p>
                  )}

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className={`rounded-lg border p-3 ${dark ? 'border-gray-600 bg-gray-700/45' : 'border-gray-200 bg-gray-50'}`}>
                      <div className={`text-sm ${dark ? 'text-gray-400' : 'text-gray-500'}`}>{isEn ? 'Current cost' : '当前成本'}</div>
                      <div className={`mt-1 font-mono text-lg font-semibold ${dark ? 'text-gray-100' : 'text-gray-900'}`}>
                        {blendSuggestModal.currentCostYuanPerH.toFixed(0)}
                        <span className="ml-1 text-sm font-normal">{isEn ? 'CNY/h' : '元/h'}</span>
                      </div>
                    </div>
                    <div className={`rounded-lg border p-3 ${dark ? 'border-emerald-700 bg-emerald-950/30' : 'border-emerald-200 bg-emerald-50'}`}>
                      <div className={`text-sm ${dark ? 'text-emerald-200/80' : 'text-emerald-700'}`}>{isEn ? 'Suggested cost' : '推荐成本'}</div>
                      <div className={`mt-1 font-mono text-lg font-semibold ${dark ? 'text-emerald-200' : 'text-emerald-700'}`}>
                        {blendSuggestModal.suggestedCostYuanPerH.toFixed(0)}
                        <span className="ml-1 text-sm font-normal">{isEn ? 'CNY/h' : '元/h'}</span>
                      </div>
                    </div>
                    <div className={`rounded-lg border p-3 ${dark ? 'border-blue-700 bg-blue-950/25' : 'border-blue-200 bg-blue-50'}`}>
                      <div className={`text-sm ${dark ? 'text-blue-200/80' : 'text-blue-700'}`}>{isEn ? 'Estimated saving' : '预计节约'}</div>
                      <div className={`mt-1 font-mono text-lg font-semibold ${saving >= 0 ? (dark ? 'text-blue-200' : 'text-blue-700') : (dark ? 'text-amber-200' : 'text-amber-700')}`}>
                        {saving.toFixed(0)}
                        <span className="ml-1 text-sm font-normal">{isEn ? `CNY/h (${savingPct.toFixed(1)}%)` : `元/h (${savingPct.toFixed(1)}%)`}</span>
                      </div>
                    </div>
                  </div>

                  <details className={`rounded-lg border p-3 text-sm ${dark ? 'border-gray-600 bg-gray-700/35 text-gray-300' : 'border-gray-200 bg-gray-50 text-gray-700'}`}>
                    <summary className="cursor-pointer font-medium">{isEn ? 'Basis and constraints' : '优化依据与约束'}</summary>
                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <div>
                        <div className={`text-sm ${dark ? 'text-gray-400' : 'text-gray-500'}`}>{isEn ? 'Total mass' : '目标总质量'}</div>
                        <div className="font-mono">{blendSuggestModal.targetTotalWeight.toFixed(4)} t/h</div>
                      </div>
                      <div>
                        <div className={`text-sm ${dark ? 'text-gray-400' : 'text-gray-500'}`}>{isEn ? 'Available library' : '可用原料库'}</div>
                        <div>
                          {isEn
                            ? `${Object.values(BASE_ELEMENTS).length} materials currently available`
                            : `当前可参与优化 ${Object.values(BASE_ELEMENTS).length} 种，随原料库配置变化`}
                        </div>
                      </div>
                      <div>
                        <div className={`text-sm ${dark ? 'text-gray-400' : 'text-gray-500'}`}>{isEn ? 'Core constraint' : '核心约束'}</div>
                        <div>{isEn ? `Core deviation <= ${BLEND_CORE_REL_ERR_LIMIT_PCT}%` : `核心元素偏差 ≤ ${BLEND_CORE_REL_ERR_LIMIT_PCT}%`}</div>
                      </div>
                    </div>
                  </details>

                  <section>
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <h4 className={`text-sm font-semibold ${dark ? 'text-gray-100' : 'text-gray-900'}`}>
                        {isEn
                          ? (blendSuggestModal.blend.length > 1 ? 'Suggested Mixed Feed' : 'Suggested Blend')
                          : (blendSuggestModal.blend.length > 1 ? '推荐混合矿配方' : '推荐配方')}
                      </h4>
                      <span className={`text-sm ${dark ? 'text-gray-400' : 'text-gray-500'}`}>
                        {isEn ? 'Total' : '合计'} {blendTotalWeight.toFixed(4)} t/h
                      </span>
                    </div>
                    <div className={`overflow-x-auto rounded-lg border ${dark ? 'border-gray-600' : 'border-gray-200'}`}>
                      <table className={`w-full min-w-[36rem] text-sm ${dark ? 'text-gray-300' : 'text-gray-700'}`}>
                        <thead className={dark ? 'bg-gray-700/60 text-gray-300' : 'bg-gray-50 text-gray-600'}>
                          <tr>
                            <th className="px-3 py-2 text-left font-medium">{isEn ? 'Material' : '原料'}</th>
                            <th className="px-3 py-2 text-right font-medium">t/h</th>
                            <th className="px-3 py-2 text-right font-medium">{isEn ? 'Share' : '占比'}</th>
                            <th className="px-3 py-2 text-right font-medium">{isEn ? 'Unit price' : '单价'}</th>
                            <th className="px-3 py-2 text-right font-medium">{isEn ? 'Cost' : '成本'}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {blendSuggestModal.blend.map((b) => (
                            <tr key={b.id + b.name} className={dark ? 'border-t border-gray-700' : 'border-t border-gray-100'}>
                              <td className="px-3 py-2">{displayMaterialName(b.name)}</td>
                              <td className="px-3 py-2 text-right font-mono">{b.weight.toFixed(4)}</td>
                              <td className="px-3 py-2 text-right font-mono">{blendTotalWeight > 0 ? ((b.weight / blendTotalWeight) * 100).toFixed(2) : '0.00'}%</td>
                              <td className="px-3 py-2 text-right font-mono">{(b.unitPriceYuanPerTon / 10000).toFixed(2)}{isEn ? ' x10k' : '万'}</td>
                              <td className="px-3 py-2 text-right font-mono">{(b.weight * b.unitPriceYuanPerTon).toFixed(0)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>

                  <section>
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <h4 className={`text-sm font-semibold ${dark ? 'text-gray-100' : 'text-gray-900'}`}>{isEn ? 'Element Match Check' : '元素达成校核'}</h4>
                      <span className={`text-sm ${blendCoreWithinLimit ? (dark ? 'text-emerald-300' : 'text-emerald-700') : (dark ? 'text-red-300' : 'text-red-700')}`}>
                        {isEn ? 'Max core error' : '核心最大偏差'} {blendSuggestModal.maxCoreRelErrPct.toFixed(2)}%
                      </span>
                    </div>
                    <div className={`overflow-x-auto rounded-lg border ${dark ? 'border-gray-600' : 'border-gray-200'}`}>
                      <table className={`w-full min-w-[34rem] text-sm ${dark ? 'text-gray-300' : 'text-gray-700'}`}>
                        <thead className={dark ? 'bg-gray-700/60 text-gray-300' : 'bg-gray-50 text-gray-600'}>
                          <tr>
                            <th className="px-3 py-2 text-left font-medium">{isEn ? 'Element' : '元素'}</th>
                            <th className="px-3 py-2 text-right font-medium">{isEn ? 'Target' : '目标'}</th>
                            <th className="px-3 py-2 text-right font-medium">{isEn ? 'Achieved' : '达成'}</th>
                            <th className="px-3 py-2 text-right font-medium">{isEn ? 'Deviation' : '偏差'}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {achievedRows.map((row) => {
                            const absErr = Math.abs(row.relErrPct)
                            const isCoreElement = BLEND_CORE_ELEMENTS.has(row.element)
                            const severity =
                              isCoreElement && absErr > BLEND_CORE_REL_ERR_LIMIT_PCT
                                ? dark ? 'text-red-300' : 'text-red-700'
                                : !isCoreElement && absErr > 10
                                  ? dark ? 'text-amber-200' : 'text-amber-700'
                                  : dark ? 'text-gray-300' : 'text-gray-700'
                            return (
                              <tr key={row.element} className={dark ? 'border-t border-gray-700' : 'border-t border-gray-100'}>
                                <td className="px-3 py-2">{displayElementLabel(row.element)}</td>
                                <td className="px-3 py-2 text-right font-mono">{row.target.toFixed(4)}</td>
                                <td className="px-3 py-2 text-right font-mono">{row.achieved.toFixed(4)}</td>
                                <td className={`px-3 py-2 text-right font-mono ${severity}`}>
                                  {row.relErrPct >= 0 ? '+' : ''}{row.relErrPct.toFixed(1)}%
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </section>
                </div>

                <div className={`sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t px-6 py-4 ${dark ? 'bg-gray-800/95 border-gray-600' : 'bg-white/95 border-gray-200'} backdrop-blur`}>
                  <p className={`max-w-md text-sm leading-relaxed ${dark ? 'text-gray-400' : 'text-gray-500'}`}>
                    {isEn
                      ? `Core-element deviation must be within ${BLEND_CORE_REL_ERR_LIMIT_PCT}% before applying. Solvent and oxygen rows will be kept.`
                      : `应用前需确认核心元素偏差≤${BLEND_CORE_REL_ERR_LIMIT_PCT}%；替换时会保留熔剂与富氧空气行。`}
                  </p>
                  <div className="flex flex-wrap justify-end gap-2">
                    <button type="button" onClick={handleCopyBlendSuggestion} className={btnSecondary(dark)}>
                      {isEn ? 'Copy Suggestion' : '复制推荐方案'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const ok = window.confirm(
                          isEn
                            ? 'This will replace all current base material rows. Continue?'
                            : '将替换当前所有原料行，熔剂和富氧空气会保留。是否继续？'
                        )
                        if (ok) handleApplyBlendSuggestion()
                      }}
                      disabled={!blendCoreWithinLimit}
                      className={blendCoreWithinLimit ? btnPrimary(dark) : btnPrimaryDisabled(dark)}
                    >
                      {isEn ? 'Apply and Replace' : '应用并替换当前原料'}
                    </button>
                  </div>
                </div>
              </div>
            </aside>
          </div>
        )
      })()}

      {errorMsg && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setErrorMsg(null)}>
          <div
            className={`relative w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden border-l-4 ${
              dark ? 'bg-gray-800/95 border-l-red-500' : 'bg-white border-l-red-500'
            }`}
            style={{ boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-8">
              <div className="flex items-start gap-4">
                <div className={`flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center text-xl ${
                  dark ? 'bg-red-500/20 text-red-400' : 'bg-red-50 text-red-500'
                }`}>
                  !
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className={`text-lg font-semibold mb-2 ${dark ? 'text-gray-100' : 'text-gray-900'}`}>
                    输入错误
                  </h3>
                  <p className={`text-base leading-relaxed ${dark ? 'text-gray-300' : 'text-gray-600'}`}>
                    {errorMsg}
                  </p>
                </div>
              </div>
              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => setErrorMsg(null)}
                  className={`px-6 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    dark ? 'bg-blue-600 hover:bg-blue-500 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'
                  }`}
                >
                  确定
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 熔剂三参数总和>100 弹窗 */}
      {solventRatioModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => handleSolventRatioChoice('cancel')}>
          <div
            className={`relative w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden border-l-4 ${
              dark ? 'bg-gray-800/95 border-l-amber-500' : 'bg-white border-l-amber-500'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-8">
              <h3 className={`text-lg font-semibold mb-2 ${dark ? 'text-gray-100' : 'text-gray-900'}`}>
                熔剂元素总和偏差
              </h3>
              <p className={`text-base leading-relaxed mb-6 ${dark ? 'text-gray-300' : 'text-gray-600'}`}>
                {solventRatioModal.type} 的 Fe/SiO₂/CaO 三参数总和为 {solventRatioModal.total.toFixed(2)}%，超过 100%。请修改输入，或选择归一法缩放至 100%。
              </p>
              <div className="flex gap-3 justify-end">
                <button onClick={() => handleSolventRatioChoice('cancel')} className={btnSecondary(dark)}>修改输入</button>
                <button onClick={() => handleSolventRatioChoice('normalize')} className={btnPrimary(dark)}>归一法</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 元素总和偏差弹窗 — 大气简洁 */}
      {ratioAdjustModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => handleRatioAdjustChoice('cancel')}>
          <div
            className={`relative w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden border-l-4 ${
              dark ? 'bg-gray-800/95 border-l-amber-500' : 'bg-white border-l-amber-500'
            }`}
            style={{ boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-8">
              <div className="flex items-start gap-4">
                <div className={`flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center text-xl ${
                  dark ? 'bg-amber-500/20 text-amber-400' : 'bg-amber-50 text-amber-600'
                }`}>
                  ?
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className={`text-lg font-semibold mb-2 ${dark ? 'text-gray-100' : 'text-gray-900'}`}>
                    元素总和偏差
                  </h3>
                  <p className={`text-base leading-relaxed mb-6 ${dark ? 'text-gray-300' : 'text-gray-600'}`}>
                    {ratioAdjustModal.mode === 'over'
                      ? `元素总和为 ${ratioAdjustModal.total.toFixed(2)}%，超过 100%。请修改输入，或选择归一法（按比例缩放至 100%）。`
                      : `元素总和为 ${ratioAdjustModal.total.toFixed(2)}%，不足 100%。请选择：将差额补到 Other，或使用归一法缩放至 100%。`}
                  </p>
                  <div className="flex flex-wrap gap-3 justify-end">
                    <button onClick={() => handleRatioAdjustChoice('cancel')} className={btnSecondary(dark)}>
                      修改输入
                    </button>
                    <button onClick={() => handleRatioAdjustChoice('normalize')} className={btnPrimary(dark)}>
                      归一法
                    </button>
                    {ratioAdjustModal.mode === 'under' && (
                      <button onClick={() => handleRatioAdjustChoice('fillOther')} className={btnPrimary(dark)}>
                        差额补到 Other
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 1. 原料 */}
      <div className={`${cardBase(dark)} relative`}>
        {/* 添加成功反馈 — 放在卡片内、fixed 脱离流，不占位不引起布局跳动 */}
        {addFeedback && (
          <div
            className={`fixed top-4 right-4 z-[9998] px-4 py-2.5 rounded-lg shadow-lg border pointer-events-none ${
              dark ? 'bg-green-900/90 border-green-700 text-green-100' : 'bg-green-50 border-green-200 text-green-800'
            }`}
          >
            <span className="text-sm font-medium">✓ {addFeedback}</span>
          </div>
        )}
        <h3 className={sectionTitle(dark)}>{isEn ? '1. Raw Material Input' : '1. 原料添加'}</h3>
        <p className={`${hintText(dark)} mb-4`}>
          {isEn
            ? 'Select a material or define a custom material, then input feed rate, unit price and elemental composition.'
            : '选择原料或自定义原料，投料量、单价与元素含量后添加。'}
        </p>
        {!showCustomBase ? (
          <>
            <div className="flex flex-wrap items-end gap-4 w-full">
              <div className="flex-1 min-w-[8rem]">
            <label className={labelBase(dark)}>{isEn ? 'Material' : '选择原料'}</label>
                <select
                  value={selectedBase}
                  onChange={(e) => {
                    setSelectedBase(e.target.value)
                    setEditingRatios(null)
                  }}
                  className={`${inputBase(dark)} w-full`}
                >
                  <option value="">{isEn ? 'Please select' : '请选择'}</option>
                  {baseList.map((m) => (
                    <option key={m.id} value={m.name}>{displayMaterialName(m.name)}</option>
                  ))}
                </select>
              </div>
              <div className="flex-1 min-w-[6rem]">
                <label className={labelBase(dark)}>{isEn ? 'Feed rate (t/h)' : '投料量 (t/h)'}</label>
                <input type="text" value={baseWeight} onChange={(e) => setBaseWeight(e.target.value)} placeholder="0"
                  className={`${inputBase(dark)} w-full`} />
              </div>
              <div className="flex-1 min-w-[6rem]">
                <label className={labelBase(dark)}>{isEn ? 'Unit price (10k CNY/t)' : '单价 (万元/吨)'}</label>
                <input type="text" value={baseUnitPrice} onChange={(e) => setBaseUnitPrice(e.target.value)} placeholder="0"
                  className={`${inputBase(dark)} w-full`} />
              </div>
              <button onClick={() => setShowCustomBase(true)} className={btnSecondary(dark)}>{isEn ? 'Add custom material' : '添加自定义原料'}</button>
              <button onClick={handleAddBase} className={btnPrimary(dark)}>{isEn ? 'Add' : '添加'}</button>
            </div>
            {selectedMaterial && (
              <div className={`mt-4 p-4 rounded-lg border ${dark ? 'border-gray-600 bg-gray-800/40' : 'border-gray-200 bg-gray-50'}`}>
                <div className={`text-sm font-medium mb-2 ${dark ? 'text-gray-300' : 'text-gray-700'}`}>{isEn ? 'Element composition (%)' : '元素含量（%）'}</div>
                <div className="flex flex-wrap gap-4">
                  {Object.entries(editingRatios ?? selectedMaterial.ratios).map(([elem]) => (
                    <div key={elem} className="flex items-center gap-2 min-w-[7rem]">
                      <span className={`text-sm w-24 truncate ${dark ? 'text-gray-400' : 'text-gray-600'}`}>{displayElementLabel(elem)}</span>
                      <input type="text" value={String((editingRatios ?? selectedMaterial.ratios)[elem] ?? 0)}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value.replace(',', '.')) || 0
                          setEditingRatios((prev) => ({ ...(prev ?? selectedMaterial.ratios), [elem]: v }))
                        }}
                        className={`flex-1 min-w-0 ${inputSm(dark)}`} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-end gap-4 w-full">
              <div className="flex-1 min-w-[10rem]">
                <label className={labelBase(dark)}>{isEn ? 'Material name' : '原料名称'}</label>
                <input type="text" value={customBaseName} onChange={(e) => setCustomBaseName(e.target.value)} placeholder={isEn ? 'Enter material name' : '输入原料名称'}
                  className={`${inputBase(dark)} w-full`} />
              </div>
              <div className="flex-1 min-w-[6rem]">
                <label className={labelBase(dark)}>{isEn ? 'Feed rate (t/h)' : '投料量 (t/h)'}</label>
                <input type="text" value={customBaseWeight} onChange={(e) => setCustomBaseWeight(e.target.value)} placeholder="0"
                  className={`${inputBase(dark)} w-full`} />
              </div>
              <div className="flex-1 min-w-[6rem]">
                <label className={labelBase(dark)}>{isEn ? 'Unit price (10k CNY/t)' : '单价 (万元/吨)'}</label>
                <input type="text" value={customBaseUnitPrice} onChange={(e) => setCustomBaseUnitPrice(e.target.value)} placeholder="0"
                  className={`${inputBase(dark)} w-full`} />
              </div>
              <button onClick={() => setShowCustomBase(false)} className={btnSecondary(dark)}>{isEn ? 'Back' : '返回'}</button>
              <button onClick={handleAddCustomBase} className={btnPrimary(dark)}>{isEn ? 'Add' : '添加'}</button>
            </div>
            <div className={`p-4 rounded-lg border ${dark ? 'border-gray-600 bg-gray-800/40' : 'border-gray-200 bg-gray-50'}`}>
              <div className={`text-sm font-medium mb-2 ${dark ? 'text-gray-300' : 'text-gray-700'}`}>{isEn ? 'Element composition (%)' : '元素含量（%）'}</div>
              <div className="flex flex-wrap gap-4">
                {elementKeys.map((elem) => (
                  <div key={elem} className="flex items-center gap-2 min-w-[7rem]">
                    <span className={`text-sm w-24 truncate ${dark ? 'text-gray-400' : 'text-gray-600'}`}>{displayElementLabel(elem)}</span>
                    <input type="text" value={String(customBaseRatios[elem] ?? 0)}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value.replace(',', '.')) || 0
                        setCustomBaseRatios((p) => ({ ...p, [elem]: v }))
                      }}
                      className={`flex-1 min-w-0 ${inputSm(dark)}`} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        {(() => {
          const baseSummary = aggregateBaseMaterials(materials)
          const canOptimize = baseSummary.totalWeight > 0 && materials.some((m) => m.type === 'base')
          return (
            <div className={`mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3 ${
              dark ? 'border-gray-600 bg-gray-800/35' : 'border-gray-200 bg-gray-50'
            }`}>
              <div className="min-w-0">
                <div className={`text-sm font-medium ${dark ? 'text-gray-200' : 'text-gray-800'}`}>
                  {isEn ? 'Optional optimization' : '附加优化'}
                </div>
                <div className={`mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm ${dark ? 'text-gray-400' : 'text-gray-500'}`}>
                  <span>
                    {isEn ? 'Target mass' : '目标总质量'}：
                    <span className="font-mono">{baseSummary.totalWeight.toFixed(4)} t/h</span>
                  </span>
                  <span>
                    {isEn ? 'Current raw-material cost' : '当前原料成本'}：
                    <span className="font-mono">{baseSummary.currentCostYuanPerH.toFixed(0)} {isEn ? 'CNY/h' : '元/h'}</span>
                  </span>
                  <span>{isEn ? 'Uses the current material library' : '按当前元素总量在原料库中寻找原料成本最优方案'}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={handleRunBlendOptimization}
                disabled={!canOptimize}
                className={canOptimize ? btnSecondary(dark) : btnPrimaryDisabled(dark)}
                title={isEn ? 'Find the raw-material cost-optimal feasible blend while keeping total base-feed mass fixed.' : '固定当前原料总质量，根据元素总量在原料库中寻找原料成本最优配料方式'}
              >
                {isEn ? 'Raw-Material Cost Optimum' : '原料成本最优方案'}
              </button>
            </div>
          )
        })()}
      </div>

      {/* 2. 熔剂 */}
      <div className={cardBase(dark)}>
        <h3 className={sectionTitle(dark)}>{isEn ? '2. Solvent Input' : '2. 熔剂添加'}</h3>
        <p className={`${hintText(dark)} mb-4`}>
          {isEn
            ? 'Configure Fe/SiO₂/CaO composition and price for Lime and Iron Ore. Then use target slag settings to solve solvent dosage.'
            : '配置石灰与铁矿石的 Fe/SiO₂/CaO 成分与单价，添加参数后由下方目标渣型根据混合矿元素组成求解熔剂添加量。'}
        </p>
        <div className="flex flex-wrap items-end gap-4 w-full">
          <div className="flex-1 min-w-[7rem]">
            <label className={labelBase(dark)}>{isEn ? 'Solvent' : '选择熔剂'}</label>
            <select value={solventType} onChange={(e) => handleSolventTypeChange(e.target.value as '石灰' | '铁矿石')}
              className={`${inputBase(dark)} w-full`}>
              <option value="石灰">{displayMaterialName('石灰')}</option>
              <option value="铁矿石">{displayMaterialName('铁矿石')}</option>
            </select>
          </div>
          <div className="flex-1 min-w-[7rem]">
            <label className={labelBase(dark)}>{isEn ? 'Fe content (%)' : 'Fe(铁)元素含量%'}</label>
            <input type="text" value={currentSolventParams.fe} onChange={(e) => setCurrentSolventParams((p) => ({ ...p, fe: e.target.value }))} placeholder="0"
              className={`${inputBase(dark)} w-full`} />
          </div>
          <div className="flex-1 min-w-[7rem]">
            <label className={labelBase(dark)}>{isEn ? 'SiO₂ content (%)' : 'SiO₂(二氧化硅)元素含量%'}</label>
            <input type="text" value={currentSolventParams.sio2} onChange={(e) => setCurrentSolventParams((p) => ({ ...p, sio2: e.target.value }))} placeholder="0"
              className={`${inputBase(dark)} w-full`} />
          </div>
          <div className="flex-1 min-w-[7rem]">
            <label className={labelBase(dark)}>{isEn ? 'CaO content (%)' : 'CaO(氧化钙)元素含量%'}</label>
            <input type="text" value={currentSolventParams.cao} onChange={(e) => setCurrentSolventParams((p) => ({ ...p, cao: e.target.value }))} placeholder="0"
              className={`${inputBase(dark)} w-full`} />
          </div>
          <div className="flex-1 min-w-[6rem]">
            <label className={labelBase(dark)}>{isEn ? 'Unit price (CNY/t)' : '单价 (元/吨)'}</label>
            <input type="text" value={currentSolventParams.unitPrice} onChange={(e) => setCurrentSolventParams((p) => ({ ...p, unitPrice: e.target.value }))} placeholder="0"
              className={`${inputBase(dark)} w-full`} />
          </div>
          <button onClick={handleAddSolventParams} className={btnPrimary(dark)}>{isEn ? 'Add' : '添加'}</button>
        </div>
      </div>

      {/* 3. 目标渣型 */}
      <div className={cardBase(dark)}>
        <h3 className={sectionTitle(dark)}>{isEn ? '3. Target Slag Type' : '3. 目标渣型'}</h3>
        <p className={`${hintText(dark)} mb-4`}>
          {isEn
            ? 'Set the allowed slag-ratio window. Range mode uses lower and upper limits; Exact mode solves toward one fixed ratio. Reversed limits are normalized automatically.'
            : '设置目标渣型允许区间。范围模式填写下限与上限；精确模式填写单一目标值。'}
        </p>
        <div className="flex flex-wrap items-end gap-4 w-full">
          <div className="flex-1 min-w-[17rem]">
            <div className="mb-2">
              <label className={labelBase(dark)}>{isEn ? 'Fe/SiO₂ iron-silica ratio' : 'Fe/SiO₂ 铁硅比'}</label>
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" onClick={() => switchFeSiO2Mode('range')} className={ratioModeButtonClass(targetFeSiO2.mode === 'range')}>
                  {isEn ? 'Range' : '范围'}
                </button>
                <button type="button" onClick={() => switchFeSiO2Mode('exact')} className={ratioModeButtonClass(targetFeSiO2.mode === 'exact')}>
                  {isEn ? 'Exact' : '精确'}
                </button>
              </div>
            </div>
            {targetFeSiO2.mode === 'range' ? (
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={targetFeSiO2.min}
                  onChange={(e) => setTargetFeSiO2((p) => ({ ...p, min: e.target.value }))}
                  placeholder={isEn ? 'Lower' : '下限'}
                  className={`${inputBase(dark)} w-full`}
                />
                <input
                  type="text"
                  value={targetFeSiO2.max}
                  onChange={(e) => setTargetFeSiO2((p) => ({ ...p, max: e.target.value }))}
                  placeholder={isEn ? 'Upper' : '上限'}
                  className={`${inputBase(dark)} w-full`}
                />
              </div>
            ) : (
              <input
                type="text"
                value={targetFeSiO2.exact}
                onChange={(e) => setTargetFeSiO2((p) => ({ ...p, exact: e.target.value }))}
                placeholder={isEn ? 'Exact value' : '精确值'}
                className={`${inputBase(dark)} w-full`}
              />
            )}
          </div>
          <div className="flex-1 min-w-[17rem]">
            <div className="mb-2">
              <label className={labelBase(dark)}>{isEn ? 'CaO/SiO₂ lime-silica ratio' : 'CaO/SiO₂ 钙硅比'}</label>
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" onClick={() => switchCaOSiO2Mode('range')} className={ratioModeButtonClass(targetCaOSiO2.mode === 'range')}>
                  {isEn ? 'Range' : '范围'}
                </button>
                <button type="button" onClick={() => switchCaOSiO2Mode('exact')} className={ratioModeButtonClass(targetCaOSiO2.mode === 'exact')}>
                  {isEn ? 'Exact' : '精确'}
                </button>
              </div>
            </div>
            {targetCaOSiO2.mode === 'range' ? (
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={targetCaOSiO2.min}
                  onChange={(e) => setTargetCaOSiO2((p) => ({ ...p, min: e.target.value }))}
                  placeholder={isEn ? 'Lower' : '下限'}
                  className={`${inputBase(dark)} w-full`}
                />
                <input
                  type="text"
                  value={targetCaOSiO2.max}
                  onChange={(e) => setTargetCaOSiO2((p) => ({ ...p, max: e.target.value }))}
                  placeholder={isEn ? 'Upper' : '上限'}
                  className={`${inputBase(dark)} w-full`}
                />
              </div>
            ) : (
              <input
                type="text"
                value={targetCaOSiO2.exact}
                onChange={(e) => setTargetCaOSiO2((p) => ({ ...p, exact: e.target.value }))}
                placeholder={isEn ? 'Exact value' : '精确值'}
                className={`${inputBase(dark)} w-full`}
              />
            )}
          </div>
          <button
            onClick={handleNsga2Solve}
            disabled={!materials.some((m) => m.type === 'base') || isCalcRunning}
            className={materials.some((m) => m.type === 'base') && !isCalcRunning ? btnPrimary(dark) : btnPrimaryDisabled(dark)}
          >
            {isCalcRunning ? (isEn ? 'Calculating...' : '计算中…') : (isEn ? 'Calculate' : '计算')}
          </button>
          {(targetFeSiO2Preview || targetCaOSiO2Preview) && (
            <p className={`${hintText(dark)} basis-full -mt-2`}>
              {[targetFeSiO2Preview, targetCaOSiO2Preview].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>

        {isCalcRunning && (
          <div className={`mt-5 p-4 rounded-lg shadow-sm ${dark ? 'bg-gray-800/60 border border-gray-700' : 'bg-white border border-gray-200'}`}>
            <p className={`text-sm mb-3 ${dark ? 'text-gray-300' : 'text-gray-700'}`}>
              {calcStage || '多目标求解中…'}
            </p>
            <div className={`h-3 rounded-full overflow-hidden ${dark ? 'bg-gray-600' : 'bg-gray-200'}`}>
              <div
                className="h-full rounded-full bg-[#1890ff] transition-[width] duration-300 ease-out"
                style={{ width: `${Math.max(0, Math.min(100, calcProgress))}%` }}
              />
            </div>
          </div>
        )}

        {nsga2Results && nsga2Results.length > 0 && !isCalcRunning && (
          <div className={`mt-5 ${resultBox(dark)}`}>
            {/* 1. 先显示交互式 Plot，再显示方案表格 */}
            {/* 多目标可视化：交互式 plot，支持悬浮显示渣型/成本、点击可选任意点应用 */}
            {(paretoFront.length > 0 || nsga2Results.length > 0) && (() => {
              const all = [...(paretoFront ?? []), ...(nsga2Results ?? [])]
              const feVals = all.map((s) => s.feSiO2).filter(Number.isFinite)
              const caVals = all.map((s) => s.caOSiO2).filter(Number.isFinite)
              const costs = all.map((s) => s.cost).filter(Number.isFinite)
              const rawMinFe = feVals.length ? Math.min(...feVals) : 0
              const rawMaxFe = feVals.length ? Math.max(...feVals) : 1
              const rawMinCa = caVals.length ? Math.min(...caVals) : 0
              const rawMaxCa = caVals.length ? Math.max(...caVals) : 1
              const feSpan = Math.max(rawMaxFe - rawMinFe, 0.02) || 0.05
              const caSpan = Math.max(rawMaxCa - rawMinCa, 0.02) || 0.05
              const minFe = rawMinFe - feSpan * 0.1
              const maxFe = rawMaxFe + feSpan * 0.1
              const minCa = rawMinCa - caSpan * 0.1
              const maxCa = rawMaxCa + caSpan * 0.1
              const minC = costs.length ? Math.min(...costs) : 0
              const maxC = costs.length ? Math.max(...costs) : 1
              const colorBarW = 32
              const pad = { left: 72, right: 72, top: 28, bottom: 44 }
              const plotW = 800
              const plotH = 320
              const dataW = plotW - pad.left - pad.right - colorBarW
              const dataH = plotH - pad.top - pad.bottom
              const xScale = (v: number) => pad.left + ((v - minFe) / (maxFe - minFe || 1)) * dataW
              const yScale = (v: number) => plotH - pad.bottom - ((v - minCa) / (maxCa - minCa || 1)) * dataH
              const costToColor = (c: number) => {
                const t = (maxC - minC) > 0 ? (c - minC) / (maxC - minC) : 0
                const r = Math.round(80 + (1 - t) * 175)
                const g = Math.round(80 + t * 140)
                const b = Math.round(160 + t * 95)
                return `rgb(${r},${g},${b})`
              }
              const makeTicks = (lo: number, hi: number, n: number) => Array.from({ length: n + 1 }, (_, i) => lo + ((hi - lo) * i) / (n || 1))
              const tx = makeTicks(minFe, maxFe, 4)
              const ty = makeTicks(minCa, maxCa, 3)
              const axisFill = dark ? '#9ca3af' : '#4b5563'
              const barX = plotW - colorBarW - 45
              const barH = dataH
              const isSingleObj = (l: string | undefined) => l === '最小成本解' || l === '最低能耗解' || l === '最小渣量解'
              const singleObjColors = ['#dc2626', '#059669', '#d97706']
              const normalColors = ['#2563eb', '#9333ea']
              const solLabels = ['精准渣型解', '帕累托最优解', '最小成本解', '最低能耗解', '最小渣量解']
              const leaderOffsets: { dx: number; dy: number; anchor: 'start' | 'end' | 'middle' }[] = [
                { dx: 50, dy: -20, anchor: 'start' }, { dx: -50, dy: 0, anchor: 'end' }, { dx: 55, dy: 12, anchor: 'start' }, { dx: -55, dy: 8, anchor: 'end' }, { dx: 0, dy: -28, anchor: 'middle' }
              ]
              return (
                <div className={`mb-5 rounded-lg overflow-visible w-full min-w-0 ${dark ? 'bg-gray-800/50 border border-gray-700' : 'bg-gray-50 border border-gray-200'}`}>
                  <h4 className={`text-sm font-semibold px-3 pt-3 pb-1 ${dark ? 'text-gray-200' : 'text-gray-800'}`}>{isEn ? 'Pareto Front and Single-Objective Optima' : '帕累托前沿解与单目标最优解'}</h4>
                  <p className={`text-sm px-3 pt-0.5 pb-2 leading-relaxed ${dark ? 'text-gray-400' : 'text-gray-600'}`}>
                    {isEn
                      ? 'This chart shows the NSGA-II Pareto front in the feasible slag-type space (Fe/SiO₂ vs CaO/SiO₂). X-axis: Fe/SiO₂ ratio; Y-axis: CaO/SiO₂ ratio. Point color indicates cost (CNY/h) with the color bar on the right. Small points are Pareto solutions, and dashed callouts indicate five single-objective optimum solutions. Hover to inspect each point and click to apply.'
                      : '本图在渣型可行域（Fe/SiO₂–CaO/SiO₂ 平面）内展示 NSGA-II 多目标优化的 Pareto 前沿分布。横轴为 Fe/SiO₂ 铁硅比，纵轴为 CaO/SiO₂ 钙硅比；散点颜色表示成本（元/h），右侧色条为成本刻度。小点为全部 Pareto 前沿解，虚线引出标注为五类单目标最优解。支持悬浮查看各点渣型与成本、点击任意点快速应用。'}
                  </p>
                  <div className="relative">
                    {hoveredPoint && (
                      <div className={`absolute top-2 left-3 right-3 z-10 px-3 py-2 rounded text-sm ${dark ? 'bg-gray-900/95 text-gray-100 border border-gray-600' : 'bg-white/95 text-gray-800 border border-gray-200 shadow-md'}`}>
                        <span className="font-semibold">{hoveredPoint.label || 'Pareto 解'}</span>
                        {' · Fe/SiO₂ '}{(hoveredPoint.feSiO2 ?? 0).toFixed(4)}
                        {' · CaO/SiO₂ '}{(hoveredPoint.caOSiO2 ?? 0).toFixed(4)}
                        {' · '}{displayMaterialName('石灰')}{' '}{(hoveredPoint.limestone ?? 0).toFixed(4)} t/h
                        {' · '}{displayMaterialName('铁矿石')}{' '}{(hoveredPoint.ironOre ?? 0).toFixed(4)} t/h
                        {' · 成本 '}{(hoveredPoint.cost ?? 0).toFixed(0)} 元/h
                        {' · 渣量 '}{(hoveredPoint.totalSlag ?? 0).toFixed(2)} t/h
                      </div>
                    )}
                    <svg viewBox={`0 0 ${plotW} ${plotH}`} className="w-full h-auto block cursor-crosshair" style={{ minHeight: plotH }} preserveAspectRatio="xMidYMid meet">
                      <rect x={pad.left} y={pad.top} width={dataW} height={dataH} fill={dark ? 'rgba(31,41,55,0.3)' : 'rgba(255,255,255,0.8)'} stroke={axisFill} strokeWidth={0.5} opacity={0.5} />
                      <line x1={pad.left} y1={plotH - pad.bottom} x2={pad.left + dataW} y2={plotH - pad.bottom} stroke={axisFill} strokeWidth={1.5} />
                      <line x1={pad.left} y1={plotH - pad.bottom} x2={pad.left} y2={pad.top} stroke={axisFill} strokeWidth={1.5} />
                      {tx.map((v, i) => (
                        <g key={`tx-${i}`}>
                          <line x1={xScale(v)} y1={plotH - pad.bottom} x2={xScale(v)} y2={plotH - pad.bottom + 5} stroke={axisFill} strokeWidth={1} />
                          <text x={xScale(v)} y={plotH - pad.bottom + 18} textAnchor="middle" fontSize={11} fill={axisFill}>{Number(v).toFixed(3)}</text>
                        </g>
                      ))}
                      {ty.map((v, i) => (
                        <g key={`ty-${i}`}>
                          <line x1={pad.left - 5} y1={yScale(v)} x2={pad.left} y2={yScale(v)} stroke={axisFill} strokeWidth={1} />
                          <text x={pad.left - 10} y={yScale(v) + 4} textAnchor="end" fontSize={11} fill={axisFill}>{Number(v).toFixed(3)}</text>
                        </g>
                      ))}
                      <text x={pad.left + dataW / 2} y={plotH - 14} textAnchor="middle" fontSize={11} fontWeight="bold" fill={axisFill}>{isEn ? 'Fe/SiO₂ ratio' : 'Fe/SiO₂ 铁硅比'}</text>
                      <text x={36} y={pad.top + dataH / 2.2} textAnchor="middle" transform={`rotate(-90, 36, ${pad.top + dataH / 2})`} fontSize={10} fontWeight="bold" fill={axisFill}>{isEn ? 'CaO/SiO₂ ratio' : 'CaO/SiO₂ 钙硅比'}</text>
                      {paretoFront.filter((s) => s && Number.isFinite(s.feSiO2) && Number.isFinite(s.caOSiO2)).map((s, i) => (
                        <circle key={`pf-${i}`} cx={xScale(s.feSiO2)} cy={yScale(s.caOSiO2)} r={4} fill={costToColor(s.cost ?? minC)} opacity={0.88} className="cursor-pointer" style={{ pointerEvents: 'all' }}
                          onMouseEnter={() => setHoveredPoint(s)} onMouseLeave={() => setHoveredPoint(null)} onClick={() => handleApplySolvent(s)} />
                      ))}
                      {nsga2Results?.filter((s) => s && Number.isFinite(s.feSiO2) && Number.isFinite(s.caOSiO2)).map((s, i) => {
                        const x = xScale(s.feSiO2)
                        const y = yScale(s.caOSiO2)
                        const isSingle = isSingleObj(s.label)
                        const singleIdx = ['最小成本解','最低能耗解','最小渣量解'].indexOf(s.label ?? '')
                        const fill = isSingle && singleIdx >= 0 ? singleObjColors[singleIdx] : normalColors[i % 2]
                        const off = leaderOffsets[i % leaderOffsets.length]
                        const lx = x + off.dx
                        const ly = y + off.dy
                        return (
                          <g key={`sol-${i}`}>
                            <line x1={x} y1={y} x2={lx} y2={ly} stroke={fill} strokeWidth={1} strokeDasharray="2,2" opacity={0.8} />
                            <circle cx={x} cy={y} r={4} fill={fill} stroke={dark ? '#1f2937' : '#fff'} strokeWidth={1} className="cursor-pointer" style={{ pointerEvents: 'all' }}
                              onMouseEnter={() => setHoveredPoint(s)} onMouseLeave={() => setHoveredPoint(null)} onClick={() => handleApplySolvent(s)} />
                            <text x={lx} y={ly} textAnchor={off.anchor} fontSize={10} fill={axisFill}>{s.label ?? solLabels[i]}</text>
                          </g>
                        )
                      })}
                      <defs>
                        <linearGradient id="costGradViz" x1="0" y1="1" x2="0" y2="0">
                          <stop offset="0" stopColor={costToColor(minC)} />
                          <stop offset="1" stopColor={costToColor(maxC)} />
                        </linearGradient>
                      </defs>
                      <rect x={barX} y={pad.top} width={12} height={barH} fill="url(#costGradViz)" rx={2} />
                      <text x={barX + 25} y={pad.top + 5} fontSize={9} fill={axisFill} textAnchor="start">{isEn ? 'Cost (CNY/h)' : '成本(元/h)'}</text>
                      <text x={barX + 7} y={pad.top + barH + 14} textAnchor="middle" fontSize={9} fill={axisFill}>{minC.toFixed(0)}</text>
                      <text x={barX + 7} y={pad.top - 6} textAnchor="middle" fontSize={9} fill={axisFill}>{maxC.toFixed(0)}</text>
                    </svg>
                  </div>
                </div>
              )
            })()}

            <div className="flex items-center justify-between mb-3">
              <h4 className={`text-sm font-semibold ${dark ? 'text-gray-200' : 'text-gray-800'}`}>{isEn ? 'Candidate Solutions' : '可选方案'}</h4>
              <button onClick={handleReset} className={btnSecondary(dark)}>
                {isEn ? 'Recalculate' : '重新计算'}
              </button>
            </div>
            <div className="overflow-x-auto max-h-80 overflow-y-auto">
              <table className="w-full text-sm table-fixed">
                <thead>
                  <tr className={`border-b ${dark ? 'border-gray-600' : 'border-gray-200'}`}>
                    <th className={`text-left py-2 px-3 font-medium w-[16%] ${dark ? 'text-gray-400' : 'text-gray-600'}`}>{isEn ? 'Solution' : '方案'}</th>
                    <th className={`text-center py-2 px-3 font-medium w-[14%] ${dark ? 'text-gray-400' : 'text-gray-600'}`}>{displayMaterialName('石灰')} t/h</th>
                    <th className={`text-center py-2 px-3 font-medium w-[14%] ${dark ? 'text-gray-400' : 'text-gray-600'}`}>{displayMaterialName('铁矿石')} t/h</th>
                    <th className={`text-center py-2 px-3 font-medium w-[12%] ${dark ? 'text-gray-400' : 'text-gray-600'}`}>Fe/SiO₂</th>
                    <th className={`text-center py-2 px-3 font-medium w-[12%] ${dark ? 'text-gray-400' : 'text-gray-600'}`}>CaO/SiO₂</th>
                    <th className={`text-center py-2 px-3 font-medium w-[14%] ${dark ? 'text-gray-400' : 'text-gray-600'}`}>{isEn ? 'Cost CNY/h' : '成本 元/h'}</th>
                    <th className={`text-center py-2 px-4 w-[18%] min-w-[5rem]`} />
                  </tr>
                </thead>
                <tbody>
                  {nsga2Results.map((sol, i) => (
                    <tr
                      key={i}
                      className={`border-b cursor-pointer transition-colors ${
                        dark ? 'border-gray-600/50 hover:bg-gray-700/40' : 'border-gray-200 hover:bg-blue-50/70'
                      }`}
                      onClick={() => handleApplySolvent(sol)}
                    >
                      <td className={`py-2 px-3 ${dark ? 'text-gray-300' : 'text-gray-700'}`}>
                        {displaySolutionLabel(sol.label)}
                      </td>
                      <td className="text-center py-2 px-3 font-mono">{(Number(sol.limestone) || 0).toFixed(4)}</td>
                      <td className="text-center py-2 px-3 font-mono">{(Number(sol.ironOre) || 0).toFixed(4)}</td>
                      <td className="text-center py-2 px-3 font-mono">{(Number(sol.feSiO2) || 0).toFixed(4)}</td>
                      <td className="text-center py-2 px-3 font-mono">{(Number(sol.caOSiO2) || 0).toFixed(4)}</td>
                      <td className={`text-center py-2 px-3 font-mono ${
                        nsga2Results[0] && (Number(sol.cost) || 0) < (Number(nsga2Results[0].cost) || 0)
                          ? 'text-green-500'
                          : nsga2Results[0] && (Number(sol.cost) || 0) > (Number(nsga2Results[0].cost) || 0)
                          ? 'text-red-500'
                          : dark ? 'text-gray-300' : 'text-gray-700'
                      }`}>
                        {(Number(sol.cost) || 0).toFixed(0)}
                      </td>
                      <td className="text-center py-2 pl-4 pr-3">
                        {appliedSolvent && Math.abs((appliedSolvent.limestone ?? 0) - (sol.limestone ?? 0)) < 1e-4 && Math.abs((appliedSolvent.ironOre ?? 0) - (sol.ironOre ?? 0)) < 1e-4 ? (
                          <span className={`text-sm ${dark ? 'text-green-400' : 'text-green-600'}`}>{isEn ? 'Applied' : '已应用'}</span>
                        ) : (
                          <button onClick={(e) => { e.stopPropagation(); handleApplySolvent(sol) }} className={btnPrimarySm(dark)}>
                            {isEn ? 'Apply' : '应用'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {appliedSolvent && (
              <div className={`mt-4 p-3 rounded-lg text-sm ${dark ? 'bg-green-900/30 border border-green-700/50' : 'bg-green-50 border border-green-200'}`}>
                <span className={`font-medium ${dark ? 'text-green-300' : 'text-green-700'}`}>{isEn ? 'Applied:' : '已应用：'}</span>
                <span className={dark ? 'text-gray-300' : 'text-gray-700'}>
                  {displaySolutionLabel(appliedSolvent.label)} · {displayMaterialName('石灰')} {(appliedSolvent.limestone ?? 0).toFixed(4)} t/h · {displayMaterialName('铁矿石')} {(appliedSolvent.ironOre ?? 0).toFixed(4)} t/h · Fe/SiO₂ {(appliedSolvent.feSiO2 ?? 0).toFixed(4)} · CaO/SiO₂ {(appliedSolvent.caOSiO2 ?? 0).toFixed(4)} · {isEn ? 'Cost' : '成本'} {(appliedSolvent.cost ?? 0).toFixed(0)} {isEn ? 'CNY/h' : '元/h'}
                </span>
              </div>
            )}
            <details
              className={`mt-4 ${dark ? 'text-gray-400' : 'text-gray-600'}`}
              open={algoDetailsOpen}
              onToggle={(e) => setAlgoDetailsOpen((e.target as HTMLDetailsElement).open)}
            >
              <summary className="cursor-pointer text-sm font-medium hover:underline">{isEn ? 'Algorithm Notes' : '算法说明'}</summary>
              <div className="mt-2 text-sm leading-relaxed space-y-2.5 pl-2 border-l-2 border-blue-200 dark:border-blue-800">
                <p><strong>优化问题定义</strong>：决策变量 X=[石灰,铁矿石]；目标函数 F(X)=[成本,石灰用量,总渣量] 均最小化；约束为 Fe/SiO₂、CaO/SiO₂ 在目标范围内。若输入单个数，则该比值按精确目标求解。</p>
                <p><strong>精准渣型解</strong>：线性方程组精确求解，使渣型达到目标比值。</p>
                <p><strong>NSGA-II 迭代</strong>：初始化种群（精确解+网格）→ 非支配排序+拥挤度 → 选择、交叉、变异 → 种群进化至收敛。</p>
                <p><strong>帕累托最优解</strong>：从 Pareto 前沿中选取理想点最近解，代表成本/石灰/渣量的折中。</p>
                <p><strong>四种单目标最优</strong>：精准渣型解、最小成本、最低石灰、最小渣量。</p>
              </div>
            </details>
          </div>
        )}
      </div>

      {/* 4. 物相 */}
      <div className={cardBase(dark)}>
        <h3 className={sectionTitle(dark)}>{isEn ? '4. Phase Analysis' : '4. 物相分析'}</h3>
        <p className={`${hintText(dark)} mb-3`}>
          {isEn
            ? 'This is an estimation mode for oxygen-demand calculation. The phase input uses only sulfur-bearing base materials; solvent oxides such as iron ore are excluded so oxide Fe is not converted into FeS or FeS₂.'
            : '本步骤为耗氧计算提供估算物相。物相输入仅取含硫基础原料，排除石灰、铁矿石等熔剂，避免将氧化物熔剂中的 Fe 误判为可生成 FeS 或 FeS₂ 的硫化铁来源。'}
        </p>
        <div className={`flex flex-wrap items-center gap-x-6 gap-y-3 py-3 ${dark ? 'text-gray-300' : 'text-gray-700'}`}>
          <span className="text-sm font-medium shrink-0 w-full sm:w-auto">{isEn ? 'Fe-S allocation strategy:' : 'Fe-S 分配策略：'}</span>
          <label className="flex items-center gap-2 cursor-pointer min-w-[7rem]" title={isEn ? 'S/Fe >= 2: FeS2 then FeS; 1 < S/Fe < 2: linear solve; S/Fe <= 1: FeS only' : 'S/Fe≥2 先 FeS₂ 再 FeS；1<S/Fe<2 线性方程求解；S/Fe≤1 仅 FeS'}>
            <input type="radio" name="phaseAlgo" checked={phaseAlgorithm === 'adaptive'} onChange={() => setPhaseAlgorithm('adaptive')}
              className="w-4 h-4 accent-blue-600" />
            <span className="text-sm">{isEn ? 'Adaptive' : '自适应算法'}</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer min-w-[7.5rem]" title={isEn ? 'Linear constraints: x=2Fe-S, y=S-Fe; in 1 < S/Fe < 2 both FeS and FeS2 can form; outside this range it degenerates to single phase' : '约束下线性方程 x=2Fe-S、y=S-Fe；1<S/Fe<2 时可同时形成 FeS 与 FeS₂，边界外退化为单相'}>
            <input type="radio" name="phaseAlgo" checked={phaseAlgorithm === 'linear'} onChange={() => setPhaseAlgorithm('linear')}
              className="w-4 h-4 accent-blue-600" />
            <span className="text-sm">{isEn ? 'Linear solve' : '线性方程求解'}</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer min-w-[6.5rem]" title={isEn ? 'Allocate FeS2 first to maximum possible amount, then allocate remaining sulfur/iron to FeS' : '先尽最大量分配 FeS₂，剩余分配 FeS'}>
            <input type="radio" name="phaseAlgo" checked={phaseAlgorithm === 'feS2_first'} onChange={() => setPhaseAlgorithm('feS2_first')}
              className="w-4 h-4 accent-blue-600" />
            <span className="text-sm">{isEn ? 'FeS₂ first' : '优先 FeS₂'}</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer min-w-[6rem]" title={isEn ? 'Allocate FeS first to maximum possible amount, then allocate remaining sulfur/iron to FeS2' : '先尽最大量分配 FeS，剩余分配 FeS₂'}>
            <input type="radio" name="phaseAlgo" checked={phaseAlgorithm === 'feS_first'} onChange={() => setPhaseAlgorithm('feS_first')}
              className="w-4 h-4 accent-blue-600" />
            <span className="text-sm">{isEn ? 'FeS first' : '优先 FeS'}</span>
          </label>
          <div className="flex-1 min-w-[8rem]" />
          <button
            onClick={handleRunPhase}
            disabled={!mixResult || !appliedSolvent}
            className={`ml-auto shrink-0 ${mixResult && appliedSolvent ? btnPrimary(dark) : btnPrimaryDisabled(dark)}`}
          >
            {isEn ? 'Run Phase Analysis' : '开始物相分析'}
          </button>
        </div>
        <p className={`${hintText(dark)} mb-4 leading-relaxed`}>
          {isEn ? (
            <>
              <strong>Strategy difference:</strong> Adaptive mode chooses by residual S/Fe ratio; linear mode solves FeS and FeS₂ simultaneously in the 1&lt;S/Fe&lt;2 interval and falls back to a boundary allocation outside it; FeS₂-first and FeS-first use a fixed priority order. This is a model assumption and should be checked against mineralogical data and furnace conditions.
            </>
          ) : (
            <>
              <strong>策略区别：</strong>自适应按剩余 S/Fe 比自动选择；线性方程在 1&lt;S/Fe&lt;2 区间内同时求解 FeS 与 FeS₂，超出边界时退化为单相边界分配；优先 FeS₂ / 优先 FeS 为固定顺序分配。该步骤是元素守恒反推的估算模式，不代表真实矿物学分析；后续可升级为按原料矿物相或反应分配表输入。
            </>
          )}
        </p>
        {phaseData && phaseBasis && (
          <div className={`mt-4 ${resultBox(dark)}`}>
            <h4 className={`text-sm font-semibold mb-2 ${dark ? 'text-gray-200' : 'text-gray-800'}`}>
              {isEn ? 'Sulfur-Bearing Base Feed - Estimated Phase Results' : '含硫基础原料 - 估算物相结果'}
            </h4>
            <p className={`${hintText(dark)} mb-3 leading-relaxed`}>
              {isEn
                ? `Basis: ${phaseBasis.materialCount} sulfur-bearing base material(s), total ${phaseBasis.totalWeight.toFixed(4)} t/h. Solvent Fe is excluded from FeS/FeS₂ allocation.`
                : `估算基准：${phaseBasis.materialCount} 种含硫基础原料，合计 ${phaseBasis.totalWeight.toFixed(4)} t/h；熔剂中的 Fe 不参与 FeS/FeS₂ 分配。`}
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className={`border-b ${dark ? 'border-gray-600' : 'border-gray-200'}`}>
                    <th className={`text-left py-2 px-3 font-medium ${dark ? 'text-gray-400' : 'text-gray-600'}`}>{isEn ? 'Phase' : '物相'}</th>
                    <th className={`text-center py-2 px-3 font-medium ${dark ? 'text-gray-400' : 'text-gray-600'}`}>{isEn ? 'Mass (t/h)' : '质量 (t/h)'}</th>
                    <th className={`text-center py-2 px-3 font-medium ${dark ? 'text-gray-400' : 'text-gray-600'}`}>{isEn ? 'Share (%)' : '占比 (%)'}</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { key: 'Sb2S3', name: isEn ? 'Sb₂S₃ (stibnite phase)' : 'Sb₂S₃(硫化锑)', mass: phaseData.Sb2S3, tag: 'sulfide' },
                    { key: 'FeS', name: isEn ? 'FeS (troilite phase)' : 'FeS(硫化亚铁)', mass: phaseData.FeS, tag: 'sulfide' },
                    { key: 'FeS2', name: isEn ? 'FeS₂ (pyrite phase)' : 'FeS₂(二硫化铁)', mass: phaseData.FeS2, tag: 'sulfide' },
                    { key: '剩余Sb', name: isEn ? 'Residual Sb' : '剩余锑(Sb)', mass: phaseData.剩余Sb, tag: 'excess' },
                    { key: '剩余Fe', name: isEn ? 'Residual Fe' : '剩余铁(Fe)', mass: phaseData.剩余Fe, tag: 'excess' },
                    { key: '剩余S', name: isEn ? 'Residual S' : '剩余硫(S)', mass: phaseData.剩余S, tag: 'excess' },
                  ].map(({ key, name, mass, tag }) => (
                    <tr
                      key={key}
                      className={`border-b ${dark ? 'border-gray-600/50' : 'border-gray-200'}
                        ${tag === 'sulfide' ? (dark ? 'bg-blue-900/30' : 'bg-blue-50/70') : ''}
                        ${tag === 'excess' ? (dark ? 'bg-amber-900/30' : 'bg-amber-50/70') : ''}`}
                    >
                      <td className={`py-2 px-3 ${dark ? 'text-gray-300' : 'text-gray-700'}`}>{name}</td>
                      <td className="text-center py-2 px-3 font-mono">{mass.toFixed(4)}</td>
                      <td className="text-center py-2 px-3 font-mono">
                        {phaseBasis.totalWeight > 0 ? ((mass / phaseBasis.totalWeight) * 100).toFixed(2) : '0.00'}%
                      </td>
                    </tr>
                  ))}
                  {(() => {
                    const sulfideTotal = phaseData.Sb2S3 + phaseData.FeS + phaseData.FeS2 + phaseData.剩余Sb + phaseData.剩余Fe + phaseData.剩余S
                    const otherMass = Math.max(0, phaseBasis.totalWeight - sulfideTotal)
                    return (
                      <>
                        <tr className={`border-b ${dark ? 'border-gray-600/50' : 'border-gray-200'} ${dark ? 'bg-green-900/30' : 'bg-green-50/70'}`}>
                          <td className={`py-2 px-3 ${dark ? 'text-gray-300' : 'text-gray-700'}`}>{isEn ? 'Other in sulfur-bearing base feed' : '含硫基础原料中其他组分'}</td>
                          <td className="text-center py-2 px-3 font-mono">{otherMass.toFixed(4)}</td>
                          <td className="text-center py-2 px-3 font-mono">
                            {phaseBasis.totalWeight > 0 ? ((otherMass / phaseBasis.totalWeight) * 100).toFixed(2) : '0.00'}%
                          </td>
                        </tr>
                        <tr className={`${dark ? 'bg-orange-900/40' : 'bg-orange-100/80'}`}>
                          <td className={`py-2 px-3 font-semibold ${dark ? 'text-gray-200' : 'text-gray-800'}`}>{isEn ? 'Total' : '总计'}</td>
                          <td className="text-center py-2 px-3 font-mono font-semibold">{phaseBasis.totalWeight.toFixed(4)}</td>
                          <td className="text-center py-2 px-3 font-mono font-semibold">100.00%</td>
                        </tr>
                      </>
                    )
                  })()}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* 5. 富氧空气参数设置 */}
      <div className={cardBase(dark)}>
        <h3 className={sectionTitle(dark)}>{isEn ? '5. Oxygen-Enriched Air Settings' : '5. 富氧空气参数设置'}</h3>
        <p className={`${hintText(dark)} mb-4 leading-relaxed`}>
          {isEn
            ? 'The oxygen-enriched air calculation uses the phase-analysis sulfide inventory as the reaction basis. Sb₂S₃ is oxidized to Sb₂O₃, while FeS and FeS₂ oxygen coefficients follow the selected iron oxidation product, then the result is corrected by the oxygen supply coefficient and oxygen concentration.'
            : '富氧空气计算以物相分析得到的硫化物量作为反应基础。Sb₂S₃ 按氧化生成 Sb₂O₃ 计，FeS 与 FeS₂ 的耗氧系数随所选铁氧化终产物联动，再结合供氧系数与富氧空气氧浓度折算供氧量、空气体积和成本。'}
        </p>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:items-start">
          <div className="min-w-0">
            <label className={labelBase(dark)}>{isEn ? 'Oxygen concentration (%)' : '氧气浓度 (%)'}</label>
            <input type="text" value={oxyPurity} onChange={(e) => setOxyPurity(e.target.value)}
              className={`${inputBase(dark)} w-full`} />
            <p className={`${hintText(dark)} mt-2 min-h-[2.75rem] leading-relaxed`}>
              {isEn ? 'O₂ volume fraction in oxygen-enriched air.' : '富氧空气中的 O₂ 体积分数，用于由实际需氧量折算空气体积。'}
            </p>
          </div>
          <div className="min-w-0">
            <label className={labelBase(dark)}>{isEn ? 'Oxygen supply coefficient' : '供氧系数'}</label>
            <input type="text" value={oxygenCoefficient} onChange={(e) => setOxygenCoefficient(e.target.value)}
              className={`${inputBase(dark)} w-full`} />
            <p className={`${hintText(dark)} mt-2 min-h-[2.75rem] leading-relaxed`}>
              {isEn ? 'actual O₂ / theoretical O₂; 1 = theoretical, >1 = excess, <1 = partial supply' : '实际供氧/理论需氧；=1 为理论供氧，>1 为过量供氧，<1 为不足或部分氧化。'}
            </p>
          </div>
          <div className="min-w-0">
            <label className={labelBase(dark)}>{isEn ? 'Unit price (CNY/Nm³)' : '单价 (元/Nm³)'}</label>
            <input type="text" value={oxyUnitPrice} onChange={(e) => setOxyUnitPrice(e.target.value)}
              className={`${inputBase(dark)} w-full`} placeholder="0.45" />
            <p className={`${hintText(dark)} mt-2 min-h-[2.75rem] leading-relaxed`}>
              {isEn ? 'Cost basis for oxygen-enriched air volume.' : '按富氧空气体积计价，用于汇总供氧成本。'}
            </p>
          </div>
          <div className="min-w-0 lg:col-span-2">
            <label className={labelBase(dark)}>{isEn ? 'Iron oxidation product for FeS/FeS₂' : 'FeS/FeS₂ 铁氧化终产物'}</label>
            <div className="mt-2 flex flex-wrap gap-2">
              {ironProductOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    setIronOxidationProduct(option.value)
                    setOxygenResult(null)
                  }}
                  className={ratioModeButtonClass(ironOxidationProduct === option.value)}
                  title={
                    option.value === 'FeO'
                      ? (isEn ? 'Lower oxygen demand; suitable when sulfide iron mainly enters slag as FeO.' : '耗氧较低，适用于硫化铁氧化后主要以 FeO 入渣的工况。')
                      : option.value === 'Fe2O3'
                        ? (isEn ? 'Higher oxygen demand; keeps the previous Fe₂O₃ assumption.' : '耗氧较高，保留原先按 Fe₂O₃ 计的强氧化假设。')
                        : option.value === 'Fe3O4'
                          ? (isEn ? 'Intermediate oxygen demand between FeO and Fe₂O₃.' : '耗氧介于 FeO 与 Fe₂O₃ 假设之间。')
                          : (isEn ? 'Manually set mol O₂ consumed per mol FeS and FeS₂.' : '手动设置每 mol FeS、FeS₂ 消耗的 mol O₂。')
                  }
                >
                  {isEn ? option.labelEn : option.label}
                </button>
              ))}
            </div>
            <p className={`${hintText(dark)} mt-2 leading-relaxed`}>
              {isEn
                ? 'FeO is usually closer when oxidized iron mainly enters slag as ferrous oxide; Fe₂O₃ represents a stronger oxidation assumption.'
                : '若硫化铁氧化后主要以 FeO 进入渣相，应选择 FeO；Fe₂O₃ 表示更强氧化假设，会提高 FeS/FeS₂ 的理论耗氧。'}
            </p>
          </div>
          {ironOxidationProduct === 'custom' && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:col-span-2">
              <div>
                <label className={labelBase(dark)}>{isEn ? 'FeS O₂ coefficient' : 'FeS 耗氧系数 (mol O₂/mol FeS)'}</label>
                <input
                  type="text"
                  value={customFeSO2Coeff}
                  onChange={(e) => {
                    setCustomFeSO2Coeff(e.target.value)
                    setOxygenResult(null)
                  }}
                  className={`${inputBase(dark)} w-full`}
                />
              </div>
              <div>
                <label className={labelBase(dark)}>{isEn ? 'FeS₂ O₂ coefficient' : 'FeS₂ 耗氧系数 (mol O₂/mol FeS₂)'}</label>
                <input
                  type="text"
                  value={customFeS2O2Coeff}
                  onChange={(e) => {
                    setCustomFeS2O2Coeff(e.target.value)
                    setOxygenResult(null)
                  }}
                  className={`${inputBase(dark)} w-full`}
                />
              </div>
            </div>
          )}
          <button onClick={handleCalcOxygen} disabled={!phaseData}
            className={`${phaseData ? btnPrimary(dark) : btnPrimaryDisabled(dark)} w-full lg:w-auto lg:self-end lg:justify-self-end`}>
            {isEn ? 'Calculate O₂ demand and update materials' : '计算耗氧量并更新物料'}
          </button>
        </div>
        {oxygenResult && (
          <div className={`mt-4 ${resultBox(dark)}`}>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
              <div>
                <span className={dark ? 'text-gray-400' : 'text-gray-600'}>理论耗氧</span>
                <div className="font-mono">{oxygenResult.theoretical.toFixed(2)} kmol/h</div>
              </div>
              <div>
                <span className={dark ? 'text-gray-400' : 'text-gray-600'}>实际耗氧</span>
                <div className="font-mono">{oxygenResult.actual.toFixed(2)} kmol/h</div>
              </div>
              <div>
                <span className={dark ? 'text-gray-400' : 'text-gray-600'}>富氧空气</span>
                <div className="font-mono">{oxygenResult.air_volume.toFixed(2)} Nm³/h</div>
              </div>
              <div>
                <span className={dark ? 'text-gray-400' : 'text-gray-600'}>富氧空气质量</span>
                <div className="font-mono">{(oxygenResult.mass + oxygenResult.N2_mass).toFixed(4)} t/h</div>
              </div>
            </div>
            <p className={`${hintText(dark)} mt-3 leading-relaxed`}>
              {isEn
                ? `Oxygen supply coefficient: ${oxygenResult.oxygenCoefficient.toFixed(3)}; iron product: ${oxygenResult.ironProduct}; coefficients: FeS ${oxygenResult.FeS_O2_coeff.toFixed(3)} mol O₂/mol, FeS₂ ${oxygenResult.FeS2_O2_coeff.toFixed(3)} mol O₂/mol.`
                : `供氧系数：${oxygenResult.oxygenCoefficient.toFixed(3)}；铁氧化终产物：${oxygenResult.ironProduct}；耗氧系数：FeS ${oxygenResult.FeS_O2_coeff.toFixed(3)} mol O₂/mol，FeS₂ ${oxygenResult.FeS2_O2_coeff.toFixed(3)} mol O₂/mol。`}
            </p>
          </div>
        )}
      </div>

      {/* 浮动总表：鼠标上移显示，半透明可透视，图钉常驻 */}
      {showFloatingTable && elementTableRows.length > 0 && (
        <div
          className={`fixed top-0 left-0 right-0 z-50 max-h-[70vh] overflow-auto rounded-b-xl shadow-2xl border-b transition-opacity duration-200 ${
            darkMode ? 'bg-gray-800/65 border-gray-600/80 backdrop-blur-lg' : 'bg-white/70 border-gray-200/90 backdrop-blur-lg'
          }`}
          style={{ boxShadow: '0 12px 40px rgba(0,0,0,0.12)' }}
        >
          <div className="flex items-center justify-between px-4 py-2 border-b border-gray-500/30">
            <span className={`text-sm font-medium ${darkMode ? 'text-gray-200' : 'text-gray-700'}`}>
              {isEn ? 'Feed Element Summary Table' : '入炉原料元素总表'}
            </span>
            <button
              onClick={() => setPinned(!pinned)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                pinned
                  ? 'bg-blue-600 text-white'
                  : darkMode
                  ? 'bg-gray-600/80 text-gray-300 hover:bg-gray-600'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
              title={pinned ? '点击取消置顶' : '点击置顶'}
            >
              {pinned ? '已置顶' : '置顶'}
            </button>
          </div>
          <div className="p-4">
            <ElementTableCompact darkMode={darkMode} language={language} variant="floating" />
          </div>
        </div>
      )}
    </div>
  )
}
