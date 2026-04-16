/**
 * 产出计算：目标约束 + 关键反应 + 迭代收敛（带 trace）
 * - 目标：锍品位、渣型
 * - 关键反应：0.5 S2 + O2 ⇌ SO2；FeS + 0.5 O2 ⇌ FeO + 0.5 S2
 * - 输出：每一步迭代的中间量，便于排错
 */
import { useState, useEffect, useRef } from 'react'
import { useCalc } from '../../context/CalcContext'
import { calcProductDistributionAsync, type ProductResult } from '../../utils/productCalc'
import ProductElementTableCompact from '../ProductElementTableCompact'
import {
  cardBase,
  sectionTitle,
  resultBox,
} from '../../theme/uiTheme'

const FLOATING_TRIGGER_TOP = 120

interface ProductDisplayProps {
  darkMode: boolean
  language?: 'zh' | 'en'
}

const SI_TO_SIO2 = 60.084 / 28.085
const CA_TO_CAO = 56.077 / 40.078
const FE_TO_FEO = 71.844 / 55.845

const PRODUCT_NAMES = {
  slag: '熔炼渣',
  flue: '烟气',
  sb2o3: '锑氧粉',
  matte: '锑锍',
  nobleSb: '贵锑',
} as const

export default function ProductDisplay({ darkMode, language = 'zh' }: ProductDisplayProps) {
  const isEn = language === 'en'
  const productNames: Record<keyof typeof PRODUCT_NAMES, string> = isEn
    ? {
        slag: 'Smelting Slag',
        flue: 'Flue Gas',
        sb2o3: 'Sb2O3 Powder',
        matte: 'Antimony Matte',
        nobleSb: 'Noble Antimony',
      }
    : PRODUCT_NAMES
  const { mixResult, materials } = useCalc()
  const [productResult, setProductResult] = useState<ProductResult | null>(null)
  const [isCalcRunning, setIsCalcRunning] = useState(false)
  const [calcProgress, setCalcProgress] = useState(0)
  const [calcStage, setCalcStage] = useState('')
  const [matteTargetSbPct, setMatteTargetSbPct] = useState('60')
  const [targetFeO_SiO2, setTargetFeO_SiO2] = useState('1.0')
  const [targetCaO_SiO2, setTargetCaO_SiO2] = useState('0.5')
  const [temperatureC, setTemperatureC] = useState('1200')
  const [kSO2, setKSO2] = useState('1e6')
  const [kFe, setKFe] = useState('1')
  const [autoTargets, setAutoTargets] = useState(true)
  const [showFloatingTable, setShowFloatingTable] = useState(false)
  const [pinned, setPinned] = useState(false)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 默认渣型：取“上一步应用方案后的当前混合料”实际渣型（FeO/SiO2、CaO/SiO2）
  useEffect(() => {
    if (!mixResult || !autoTargets) return
    const ew = mixResult.elementWeights
    const fe = ew['Fe(铁)'] ?? 0
    const si = ew['Si(硅)'] ?? 0
    const ca = ew['Ca(钙)'] ?? 0

    const sio2 = si * SI_TO_SIO2
    if (sio2 <= 1e-12) return
    const feo = fe * FE_TO_FEO
    const cao = ca * CA_TO_CAO

    const feoSi = feo / sio2
    const caoSi = cao / sio2
    if (Number.isFinite(feoSi) && feoSi > 0) setTargetFeO_SiO2(feoSi.toFixed(3))
    if (Number.isFinite(caoSi) && caoSi > 0) setTargetCaO_SiO2(caoSi.toFixed(3))
  }, [mixResult, autoTargets])

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

  const handleCalculate = async () => {
    if (!mixResult || mixResult.totalWeight <= 0) return
    const airVolume = materials
      .filter((m) => m.type === 'oxygen')
      .reduce((s, m) => s + (m.airVolume ?? 0), 0)

    setIsCalcRunning(true)
    setCalcProgress(0)
    setCalcStage('')
    try {
      const result = await calcProductDistributionAsync(
        {
          elementWeights: mixResult.elementWeights,
          totalWeight: mixResult.totalWeight,
          airVolume,
          oxygenPurity: 0.32,
          thermo: {
            temperatureC: Number(temperatureC) || 1200,
            K_SO2: Number(kSO2) || 1e6,
            K_Fe: Number(kFe) || 1,
          },
          targets: {
            matteTargetSbPct: Number(matteTargetSbPct) || 60,
            targetFeO_SiO2: Number(targetFeO_SiO2) || 1.0,
            targetCaO_SiO2: Number(targetCaO_SiO2) || 0.5,
          },
          maxIter: 25,
          tol: 1e-3,
        },
        (p) => {
          setCalcProgress(p.percent)
          setCalcStage(p.stage)
        }
      )
      setProductResult(result)
    } finally {
      setIsCalcRunning(false)
      setCalcProgress(0)
      setCalcStage('')
    }
  }

  const dark = darkMode
  const canCalculate = mixResult && mixResult.totalWeight > 0

  if (!mixResult || mixResult.totalWeight <= 0) {
    return (
      <>
        <div className={`${cardBase(dark)} mb-6`}>
          <h3 className={sectionTitle(dark)}>{isEn ? 'Product Calculation' : '产出计算'}</h3>
          <div className={`space-y-3 text-sm leading-relaxed ${dark ? 'text-gray-400' : 'text-gray-600'}`}>
            <p>
              {isEn
                ? 'This module uses feed-element composition from batching results, distributes elements into five products (slag, flue gas, Sb₂O₃ powder, matte, noble antimony), and then calculates composition and mass of each product.'
                : '本模块根据配料计算得到的入炉物料元素组成，按元素分配规则将各元素分配至五类产物（熔炼渣、烟气、锑氧粉、锑锍、贵锑），再根据组分分配系数计算各产物的化学组分与质量。'}
            </p>
            <p>
              <strong className={dark ? 'text-gray-300' : 'text-gray-700'}>{isEn ? 'Element distribution:' : '元素分配规则：'}</strong>{isEn ? ' Precious metals (Au, Ag) mostly report to noble antimony. Sulfur first reacts with Fe to form FeS (matte), then with Sb to form Sb₂S₃. Remaining Fe is oxidized to FeO (slag), and Sb is oxidized to volatile Sb₂O₃ (mainly Sb₂O₃ powder). Slagging elements such as Si, Ca, Al mainly enter slag as oxides. Pb/As/Zn are distributed by preset coefficients.' : '贵金属 Au、Ag 因其化学惰性与密度，近乎定量进入贵锑金属相；可用于形成硫化物的总硫量确定后，铁优先与硫结合形成 FeS 进入锑锍相，直至硫或铁耗尽；剩余硫与锑结合形成 Sb₂S₃ 进入锑锍相；未被硫化的 Fe 氧化为 FeO 进入熔炼渣，Sb 氧化为挥发性 Sb₂O₃，大部分进入锑氧粉；Si、Ca、Al 等造渣元素几乎全部以氧化物形式进入熔炼渣；Pb、As、Zn 等按预设分配系数进入相应产物。'}
            </p>
            <p>
              <strong className={dark ? 'text-gray-300' : 'text-gray-700'}>{isEn ? 'Flue gas:' : '烟气组分：'}</strong>{isEn ? ' SO₂ generated by sulfide oxidation enters flue gas. Excess O₂/N₂ from oxygen-enriched air and combustion CO₂ are included in flue-gas volume composition.' : '硫化物氧化生成的 SO₂ 全部进入烟气；富氧空气带入的过剩 O₂ 与 N₂、以及燃烧产生的 CO₂ 一并计入烟气体积组分。'}
            </p>
            <p className={`text-xs ${dark ? 'text-gray-500' : 'text-gray-500'}`}>
              {isEn
                ? 'Please add materials and solvents in the batching page and finish that calculation first, then click calculate here.'
                : '请先在配料计算页添加物料、熔剂并完成计算，再在本页点击「计算」进行产出计算。'}
            </p>
          </div>
          <div className={`mt-4 p-4 rounded-lg border-2 border-dashed ${dark ? 'border-gray-600 bg-gray-800/40 text-gray-400' : 'border-gray-300 bg-gray-50 text-gray-500'}`}>
            {isEn ? 'No feed data available. Please complete batching calculation first.' : '当前无入炉物料数据，请先完成配料计算。'}
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <div className="flex flex-col gap-6 w-full">
        <div className={`${cardBase(dark)} overflow-hidden`}>
          <div className={`flex flex-col sm:flex-row sm:items-start sm:justify-between gap-6 pb-5 border-b ${dark ? 'border-gray-600' : 'border-gray-200'}`}>
            <div>
              <h3 className={`text-lg font-semibold mb-1 ${dark ? 'text-gray-100' : 'text-gray-900'}`}>{isEn ? 'Product Calculation' : '产出计算'}</h3>
              <p className={`text-sm max-w-2xl leading-relaxed ${dark ? 'text-gray-400' : 'text-gray-600'}`}>
                {isEn
                  ? 'Constrained by target matte grade and slag ratios, this module iteratively estimates oxygen/sulfur potential (pO₂, pS₂) using reaction equilibrium and mass balance, then outputs mass and composition of five products.'
                  : '以目标锍品位与目标渣型为约束，结合关键反应平衡与质量守恒，对炉内氧势/硫势（pO₂、pS₂）进行迭代估算，得到五类产物（熔炼渣、烟气、锑氧粉、锑锍、贵锑）的质量与组分。'}
              </p>
            </div>
            <div className="flex flex-col items-stretch sm:items-end gap-2 shrink-0">
              <button
                onClick={handleCalculate}
                disabled={!canCalculate || isCalcRunning}
                className={`px-6 py-3 rounded-lg text-sm font-medium transition-colors ${canCalculate && !isCalcRunning ? (dark ? 'bg-blue-600 hover:bg-blue-500 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white') : (dark ? 'bg-gray-600 text-gray-400 cursor-not-allowed' : 'bg-gray-300 text-gray-500 cursor-not-allowed')}`}
              >
                {isCalcRunning ? (isEn ? 'Calculating...' : '计算中…') : (isEn ? 'Start Calculation' : '开始计算')}
              </button>
              <span className={`text-xs ${dark ? 'text-gray-500' : 'text-gray-500'}`}>{isEn ? 'After calculation, move mouse to top edge to open distribution table' : '计算后鼠标移至页面顶部可唤起分布表'}</span>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className={`lg:col-span-2 pl-4 border-l-4 ${dark ? 'border-blue-500/60 bg-gray-800/30' : 'border-blue-500/50 bg-blue-50/40'} rounded-r-lg py-3 pr-4`}>
              <div className={`text-xs font-semibold uppercase tracking-wide mb-2 ${dark ? 'text-blue-300' : 'text-blue-700'}`}>{isEn ? 'Calculation Logic (Traceable)' : '计算逻辑（可追溯）'}</div>
              <ul className={`space-y-1.5 text-sm leading-relaxed ${dark ? 'text-gray-400' : 'text-gray-600'}`}>
                <li><strong className={dark ? 'text-gray-300' : 'text-gray-700'}>{isEn ? 'Input basis:' : '输入基础：'}</strong>{isEn ? ' use feed element summary table as mass-balance starting point.' : '以“入炉混合料元素组成表”为基准，将各元素质量（t/h）作为物料衡算起点。'}</li>
                <li><strong className={dark ? 'text-gray-300' : 'text-gray-700'}>{isEn ? 'Constraints:' : '关键约束：'}</strong>{isEn ? ' target matte grade (%Sb) and target slag ratios (FeO/SiO₂, CaO/SiO₂).' : '目标锍品位（锑锍中 %Sb）与目标渣型（FeO/SiO₂、CaO/SiO₂）。'}</li>
                <li><strong className={dark ? 'text-gray-300' : 'text-gray-700'}>{isEn ? 'Key reactions:' : '关键反应：'}</strong>{isEn ? ' 0.5 S₂ + O₂ ⇌ SO₂ (used to infer pS₂/pO₂ from gas); FeS + 0.5 O₂ ⇌ FeO + 0.5 S₂ (for consistency check).' : '0.5 S₂ + O₂ ⇌ SO₂（由烟气反推 pS₂/pO₂）；FeS + 0.5 O₂ ⇌ FeO + 0.5 S₂（用于一致性校核）。'}</li>
                <li><strong className={dark ? 'text-gray-300' : 'text-gray-700'}>{isEn ? 'Element allocation:' : '元素分配：'}</strong>{isEn ? ' sulfide first (Fe->FeS, then Sb->Sb₂S₃), then oxidation at target oxygen potential (FeS->FeO to slag, Sb₂S₃->Sb₂O₃ mainly to Sb₂O₃ powder), with SO₂ to flue gas; Si/Ca/Al mainly enter slag as oxides.' : '先硫化（Fe 优先→FeS，Sb 随后→Sb₂S₃），再在设定氧势下发生氧化（FeS→FeO 入渣，Sb₂S₃→Sb₂O₃ 主要入锑氧粉），并生成 SO₂ 进入烟气；Si、Ca、Al 等造渣元素主要以 SiO₂、CaO、Al₂O₃ 进入熔炼渣；Pb、As、Zn 等按系数分配。'}</li>
                <li><strong className={dark ? 'text-gray-300' : 'text-gray-700'}>{isEn ? 'Slag composition solve:' : '组分分配系数（渣组成求解）：'}</strong>{isEn ? ' convert Fe/Si/Ca in slag to FeO/SiO₂/CaO by stoichiometry, enforce target ratios (FeO/SiO₂ and CaO/SiO₂) via equation checks/iterations, then normalize final slag composition.' : '核心是满足目标渣型。根据进入渣中的 Fe、Si、Ca 的量，将其按化学计量转化为 FeO、SiO₂、CaO；并以目标比值为约束，通过方程关系（如 FeO = (FeO/SiO₂)·SiO₂，CaO = (CaO/SiO₂)·SiO₂）校核/迭代，使计算渣型与目标一致。其他元素（Al、Zn…）按化学计量转为 Al₂O₃、ZnO 等，最后归一化得到渣的各组分百分比。'}</li>
              </ul>
            </div>
            <div className={`${resultBox(dark)} lg:col-span-1`}>
              <div className={`text-sm font-semibold mb-3 ${dark ? 'text-gray-200' : 'text-gray-800'}`}>{isEn ? 'Targets and Parameters' : '目标与参数'}</div>
              {/* 第一行：两个渣型 */}
              <div className="flex flex-wrap gap-3 items-end">
                <div className="flex-1 min-w-[10rem]">
                  <div className={`text-xs mb-1 ${dark ? 'text-gray-500' : 'text-gray-500'}`}>{isEn ? 'Target FeO/SiO₂' : '目标 FeO/SiO₂'}</div>
                  <input
                    value={targetFeO_SiO2}
                    onChange={(e) => { setAutoTargets(false); setTargetFeO_SiO2(e.target.value) }}
                    className={`w-full px-3 py-2 rounded-lg border text-sm ${dark ? 'bg-gray-700 border-gray-600 text-gray-100' : 'bg-white border-gray-300 text-gray-900'}`}
                  />
                </div>
                <div className="flex-1 min-w-[10rem]">
                  <div className={`text-xs mb-1 ${dark ? 'text-gray-500' : 'text-gray-500'}`}>{isEn ? 'Target CaO/SiO₂' : '目标 CaO/SiO₂'}</div>
                  <input
                    value={targetCaO_SiO2}
                    onChange={(e) => { setAutoTargets(false); setTargetCaO_SiO2(e.target.value) }}
                    className={`w-full px-3 py-2 rounded-lg border text-sm ${dark ? 'bg-gray-700 border-gray-600 text-gray-100' : 'bg-white border-gray-300 text-gray-900'}`}
                  />
                </div>
                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={() => setAutoTargets(true)}
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      dark ? 'bg-blue-600/20 text-blue-200 hover:bg-blue-600/25' : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                    }`}
                    title={isEn ? 'Read slag ratios from current mixed feed' : '从当前混合料自动读取渣型'}
                  >
                    {isEn ? 'Use current slag ratios' : '采用当前渣型'}
                  </button>
                </div>
              </div>

              {/* 第二行：品位和温度 */}
              <div className="flex flex-wrap gap-3 items-end mt-3">
                <div className="flex-1 min-w-[10rem]">
                  <div className={`text-xs mb-1 ${dark ? 'text-gray-500' : 'text-gray-500'}`}>{isEn ? 'Target matte grade %Sb' : '目标锍品位 %Sb'}</div>
                  <input
                    value={matteTargetSbPct}
                    onChange={(e) => { setAutoTargets(false); setMatteTargetSbPct(e.target.value) }}
                    className={`w-full px-3 py-2 rounded-lg border text-sm ${dark ? 'bg-gray-700 border-gray-600 text-gray-100' : 'bg-white border-gray-300 text-gray-900'}`}
                  />
                </div>
                <div className="flex-1 min-w-[10rem]">
                  <div className={`text-xs mb-1 ${dark ? 'text-gray-500' : 'text-gray-500'}`}>{isEn ? 'Temperature (°C)' : '温度 (°C)'}</div>
                  <input
                    value={temperatureC}
                    onChange={(e) => setTemperatureC(e.target.value)}
                    className={`w-full px-3 py-2 rounded-lg border text-sm ${dark ? 'bg-gray-700 border-gray-600 text-gray-100' : 'bg-white border-gray-300 text-gray-900'}`}
                  />
                </div>
              </div>

              {/* 第三行：两个 K */}
              <div className="flex flex-wrap gap-3 items-end mt-3">
                <div className="flex-1 min-w-[10rem]">
                  <div className={`text-xs mb-1 ${dark ? 'text-gray-500' : 'text-gray-500'}`}>K_SO2</div>
                  <input
                    value={kSO2}
                    onChange={(e) => setKSO2(e.target.value)}
                    className={`w-full px-3 py-2 rounded-lg border text-sm ${dark ? 'bg-gray-700 border-gray-600 text-gray-100' : 'bg-white border-gray-300 text-gray-900'}`}
                  />
                </div>
                <div className="flex-1 min-w-[10rem]">
                  <div className={`text-xs mb-1 ${dark ? 'text-gray-500' : 'text-gray-500'}`}>K_Fe</div>
                  <input
                    value={kFe}
                    onChange={(e) => setKFe(e.target.value)}
                    className={`w-full px-3 py-2 rounded-lg border text-sm ${dark ? 'bg-gray-700 border-gray-600 text-gray-100' : 'bg-white border-gray-300 text-gray-900'}`}
                  />
                </div>
                <div className="flex items-end">
                  <div className={`text-xs ${dark ? 'text-gray-500' : 'text-gray-500'}`}>
                    {isEn ? 'K values are used to infer pS₂ and perform consistency checks' : 'K 用于反推 pS₂ 与一致性校核'}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {isCalcRunning && (
            <div className={`mt-5 p-4 rounded-lg shadow-sm ${dark ? 'bg-gray-800/60 border border-gray-700' : 'bg-white border border-gray-200'}`}>
              <p className={`text-sm mb-3 ${dark ? 'text-gray-300' : 'text-gray-700'}`}>
                {calcStage || (isEn ? 'Product calculation in progress...' : '产出计算中…')}
              </p>
              <div className={`h-3 rounded-full overflow-hidden ${dark ? 'bg-gray-600' : 'bg-gray-200'}`}>
                <div
                  className="h-full rounded-full bg-[#1890ff] transition-[width] duration-300 ease-out"
                  style={{ width: `${Math.max(0, Math.min(100, calcProgress))}%` }}
                />
              </div>
            </div>
          )}

          {productResult && !isCalcRunning && (
            <>
              <div className={`mt-6 pt-5 border-t ${dark ? 'border-gray-600' : 'border-gray-200'}`}>
                <h4 className={`text-sm font-semibold mb-4 ${dark ? 'text-gray-200' : 'text-gray-800'}`}>{isEn ? 'Calculation Results' : '计算结果'}</h4>
                <div className={`${resultBox(dark)} mb-6`}>
                <div className={`text-sm font-semibold mb-3 ${dark ? 'text-gray-200' : 'text-gray-800'}`}>{isEn ? 'Product Mass (t/h)' : '产物质量 (t/h)'}</div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
                  {(Object.keys(PRODUCT_NAMES) as (keyof typeof PRODUCT_NAMES)[]).map((key) => (
                    <div key={key} className={`p-3 rounded-lg ${dark ? 'bg-gray-800/60' : 'bg-gray-50'}`}>
                      <div className={`text-xs ${dark ? 'text-gray-400' : 'text-gray-500'}`}>{productNames[key]}</div>
                      <div className={`text-lg font-mono font-semibold ${dark ? 'text-gray-100' : 'text-gray-900'}`}>
                        {productResult.masses[key].toFixed(4)}
                      </div>
                    </div>
                  ))}
                </div>
                <div className={`mt-3 flex flex-wrap gap-4 text-xs ${dark ? 'text-gray-400' : 'text-gray-600'}`}>
                  <span>{isEn ? 'Matte grade Fe' : '锍品位 Fe'}: {productResult.matteGradeFe.toFixed(2)}%</span>
                  <span>{isEn ? 'Matte grade Sb' : '锍品位 Sb'}: {productResult.matteGradeSb.toFixed(2)}%</span>
                  <span>{isEn ? 'Flue gas volume' : '烟气体积'}: {productResult.flueVolume.toFixed(1)} Nm³/h</span>
                </div>
                </div>
              </div>

              {/* 各产物组分 */}
              <div className={`text-sm font-semibold mb-3 mt-6 ${dark ? 'text-gray-200' : 'text-gray-800'}`}>{isEn ? 'Product Composition (%)' : '产物组分 (%)'}</div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {(['slag', 'matte', 'nobleSb', 'sb2o3', 'flue'] as const).map((key) => {
                  const comp = productResult.composition[key]
                  const entries = Object.entries(comp).filter(([, v]) => v > 0.001)
                  if (entries.length === 0) return null
                  return (
                    <div key={key} className={`${resultBox(dark)}`}>
                      <div className={`text-xs font-semibold mb-2 ${dark ? 'text-gray-300' : 'text-gray-700'}`}>
                        {productNames[key]}
                      </div>
                      <div className="space-y-1">
                        {entries.map(([k, v]) => (
                          <div key={k} className="flex justify-between text-xs">
                            <span className={dark ? 'text-gray-400' : 'text-gray-600'}>{k}</span>
                            <span className="font-mono">{v.toFixed(2)}%</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* 计算过程（trace） */}
              {productResult.trace?.iterations?.length > 0 && (
                <div className={`${resultBox(dark)} mt-6`}>
                  <div className={`flex items-center justify-between mb-3`}>
                    <div className={`text-sm font-semibold ${dark ? 'text-gray-200' : 'text-gray-800'}`}>{isEn ? 'Calculation Trace (Iterations)' : '计算过程（迭代轨迹）'}</div>
                    <div className={`text-xs ${dark ? 'text-gray-400' : 'text-gray-600'}`}>
                      {(productResult.trace.converged ? (isEn ? 'Converged' : '已收敛') : (isEn ? 'Not converged' : '未收敛'))} · {productResult.trace.stopReason}
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr className={dark ? 'border-b border-gray-600' : 'border-b border-gray-200'}>
                          <th className={`text-left py-2 px-2 font-medium ${dark ? 'text-gray-400' : 'text-gray-500'}`}>{isEn ? 'Iter' : '迭代'}</th>
                          <th className="text-right py-2 px-2 font-medium">{isEn ? 'O₂ utilization' : 'O₂利用率'}</th>
                          <th className="text-right py-2 px-2 font-medium">pO₂(atm)</th>
                          <th className="text-right py-2 px-2 font-medium">pS₂(atm)</th>
                          <th className="text-right py-2 px-2 font-medium">{isEn ? 'Matte Sb %' : 'Sb锍品位%'}</th>
                          <th className="text-right py-2 px-2 font-medium">FeO/SiO₂</th>
                          <th className="text-right py-2 px-2 font-medium">CaO/SiO₂</th>
                          <th className="text-right py-2 px-2 font-medium">{isEn ? 'O₂ usage (kmol)' : 'O₂用量(kmol)'}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {productResult.trace.iterations.map((it) => (
                          <tr key={it.iter} className={dark ? 'border-b border-gray-700' : 'border-b border-gray-100'}>
                            <td className={`py-1.5 px-2 ${dark ? 'text-gray-300' : 'text-gray-700'}`}>{it.iter}</td>
                            <td className="text-right py-1.5 px-2 font-mono">{it.oxygenUtilization.toFixed(3)}</td>
                            <td className="text-right py-1.5 px-2 font-mono">{it.pO2_atm.toExponential(2)}</td>
                            <td className="text-right py-1.5 px-2 font-mono">{it.pS2_atm.toExponential(2)}</td>
                            <td className="text-right py-1.5 px-2 font-mono">{it.matteGradeSb.toFixed(2)}</td>
                            <td className="text-right py-1.5 px-2 font-mono">{it.slagFeO_SiO2.toFixed(3)}</td>
                            <td className="text-right py-1.5 px-2 font-mono">{it.slagCaO_SiO2.toFixed(3)}</td>
                            <td className="text-right py-1.5 px-2 font-mono">{it.o2UsedKmol.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* 悬浮产物元素分布表：与配料计算页入炉原料元素总表同一风格 */}
      {showFloatingTable && productResult && (
        <div
          className={`fixed top-0 left-0 right-0 z-50 max-h-[70vh] overflow-auto rounded-b-xl shadow-2xl border-b transition-opacity duration-200 ${
            dark ? 'bg-gray-800/65 border-gray-600/80 backdrop-blur-lg' : 'bg-white/70 border-gray-200/90 backdrop-blur-lg'
          }`}
          style={{ boxShadow: '0 12px 40px rgba(0,0,0,0.12)' }}
        >
          <div className="flex items-center justify-between px-4 py-2 border-b border-gray-500/30">
            <span className={`text-sm font-medium ${dark ? 'text-gray-200' : 'text-gray-700'}`}>
              {isEn ? 'Product Element Distribution Table' : '产物元素分布表'}
            </span>
            <button
              onClick={() => setPinned(!pinned)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                pinned
                  ? 'bg-blue-600 text-white'
                  : dark
                  ? 'bg-gray-600/80 text-gray-300 hover:bg-gray-600'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
              title={pinned ? (isEn ? 'Click to unpin' : '点击取消置顶') : (isEn ? 'Click to pin' : '点击置顶')}
            >
              {pinned ? (isEn ? 'Pinned' : '已置顶') : (isEn ? 'Pin' : '置顶')}
            </button>
          </div>
          <div className="p-4">
            <ProductElementTableCompact darkMode={dark} productResult={productResult} variant="floating" language={language} />
          </div>
        </div>
      )}
    </>
  )
}
