/**
 * 共享计算数据：原料、混料结果、元素分布
 * 配料计算页写入，产物/热平衡页可读取（悬浮面板）
 */
import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from 'react'
import type { ElementRatios } from '../config/rawMaterialConfig'
import { phaseAnalysis, type ElementWeights } from '../utils/phaseAnalysis'

export interface MaterialEntry {
  id: string
  name: string
  ratios: ElementRatios
  weight: number
  type?: 'base' | 'solvent' | 'oxygen'
  /** 单价：base/solvent 为 元/t，oxygen 为 元/Nm³ */
  unitPrice?: number
  /** 富氧空气体积 Nm³/h（仅 type=oxygen 时有效，用于成本计算） */
  airVolume?: number
}

export interface MixResult {
  totalWeight: number
  elementWeights: ElementWeights
}

interface CalcContextValue {
  materials: MaterialEntry[]
  setMaterials: React.Dispatch<React.SetStateAction<MaterialEntry[]>>
  mixResult: MixResult | null
  /** 总配料成本 (元/h) */
  totalCost: number
  /** 入炉原料元素组成分析（用于表格展示） */
  elementTableRows: { name: string; weight: number; ratioPct: number; unitPrice?: number; cost?: number; elements: Record<string, number>; rowType?: 'base' | 'mixed' | 'solvent' | 'oxygen' | 'total'; detailRows?: { name: string; weight: number; ratioPct: number; elements: Record<string, number> }[] }[]
}

const CalcContext = createContext<CalcContextValue | null>(null)

const OXIDE_TO_ELEMENT: Record<string, { elem: string; ratio: number }[]> = {
  'SiO₂(二氧化硅)': [
    { elem: 'Si(硅)', ratio: 28.085 / 60.084 },
    { elem: 'O (氧)', ratio: 32 / 60.084 },
  ],
  'CaO(氧化钙)': [
    { elem: 'Ca(钙)', ratio: 40.078 / 56.077 },
    { elem: 'O (氧)', ratio: 16 / 56.077 },
  ],
  'Fe(铁)': [{ elem: 'Fe(铁)', ratio: 1 }],
}

function solventToElementRatios(ratios: ElementRatios): ElementRatios {
  const out: ElementRatios = {}
  for (const [comp, val] of Object.entries(ratios)) {
    const v = typeof val === 'number' ? val : parseFloat(String(val)) || 0
    const conv = OXIDE_TO_ELEMENT[comp]
    if (conv) {
      for (const { elem, ratio } of conv) {
        out[elem] = (out[elem] ?? 0) + v * ratio
      }
    } else {
      out[comp] = (out[comp] ?? 0) + v
    }
  }
  return out
}

export function CalcProvider({ children }: { children: ReactNode }) {
  const [materials, setMaterials] = useState<MaterialEntry[]>([])

  const totalCost = useMemo(() => {
    return materials.reduce((sum, m) => {
      if (m.type === 'oxygen') {
        return sum + (m.airVolume ?? 0) * (m.unitPrice ?? 0)
      }
      return sum + m.weight * (m.unitPrice ?? 0)
    }, 0)
  }, [materials])

  const mixResult = useMemo(() => {
    const baseMats = materials.filter((m) => m.type !== 'oxygen')
    if (baseMats.length === 0) return null
    const totalWeight = baseMats.reduce((s, m) => s + m.weight, 0)
    if (totalWeight <= 0) return null
    const elementWeights: ElementWeights = {}
    for (const mat of baseMats) {
      const ratios = mat.type === 'solvent' ? solventToElementRatios(mat.ratios) : mat.ratios
      for (const [elem, ratio] of Object.entries(ratios)) {
        const val = (ratio / 100) * mat.weight
        elementWeights[elem] = (elementWeights[elem] ?? 0) + val
      }
    }
    return { totalWeight, elementWeights }
  }, [materials])

  const elementTableRows = useMemo(() => {
    const baseMats = materials.filter((m) => m.type !== 'oxygen')
    const oxygenMats = materials.filter((m) => m.type === 'oxygen')
    const total = baseMats.reduce((s, m) => s + m.weight, 0)
    if (total <= 0) return []

    const baseOnly = materials.filter((m) => m.type === 'base')
    const solventMats = materials.filter((m) => m.type === 'solvent')
    const allElements = new Set<string>()

    const result: { name: string; weight: number; ratioPct: number; elements: Record<string, number>; rowType?: 'base' | 'mixed' | 'solvent' | 'oxygen' | 'total'; detailRows?: typeof result }[] = []

    const oxygenTotal = oxygenMats.reduce((s, m) => s + m.weight, 0)
    const solventTotal = solventMats.reduce((s, m) => s + m.weight, 0)
    const grandTotal = total + oxygenTotal
    // 熔剂占比计算的分母：不包括熔剂的总重量（base + oxygen）
    const solventRatioDenom = baseOnly.reduce((s, m) => s + m.weight, 0) + oxygenTotal
    // 其他行占比计算的分母：包括所有物料的总重量
    const ratioDenom = grandTotal > 0 ? grandTotal : total

    for (const mat of baseOnly) {
      const elements: Record<string, number> = {}
      for (const [elem, ratio] of Object.entries(mat.ratios)) {
        const pct = typeof ratio === 'number' ? ratio : parseFloat(String(ratio)) || 0
        elements[elem] = pct
        allElements.add(elem)
      }
      result.push({
        name: mat.name,
        weight: mat.weight,
        ratioPct: (mat.weight / ratioDenom) * 100,
        elements,
        rowType: 'base',
      })
    }

    if (baseOnly.length > 1 && mixResult) {
      const baseTotal = baseOnly.reduce((s, m) => s + m.weight, 0)
      const baseWeights: Record<string, number> = {}
      for (const mat of baseOnly) {
        for (const [elem, ratio] of Object.entries(mat.ratios)) {
          const val = (typeof ratio === 'number' ? ratio : parseFloat(String(ratio)) || 0) / 100 * mat.weight
          baseWeights[elem] = (baseWeights[elem] ?? 0) + val
        }
      }
      const mixRow: Record<string, number> = {}
      for (const elem of allElements) {
        mixRow[elem] = baseTotal > 0 ? ((baseWeights[elem] ?? 0) / baseTotal) * 100 : 0
      }
      const detailRows = result.filter((r) => r.rowType === 'base') as typeof result
      result.push({
        name: '混合矿',
        weight: baseTotal,
        ratioPct: (baseTotal / ratioDenom) * 100,
        elements: mixRow,
        rowType: 'mixed',
        detailRows,
      })
    }

    // 处理熔剂：如果有多个熔剂，创建折叠行（类似混合矿）
    if (solventMats.length > 0) {
      const solventDetailRows: typeof result = []
      const solventWeights: Record<string, number> = {}
      
      for (const mat of solventMats) {
        const ratios = solventToElementRatios(mat.ratios)
        const elements: Record<string, number> = {}
        for (const [elem, ratio] of Object.entries(ratios)) {
          const pct = typeof ratio === 'number' ? ratio : parseFloat(String(ratio)) || 0
          elements[elem] = pct
          allElements.add(elem)
          // 累计元素重量用于计算混合熔剂的元素百分比
          const elemWeight = (pct / 100) * mat.weight
          solventWeights[elem] = (solventWeights[elem] ?? 0) + elemWeight
        }
        solventDetailRows.push({
          name: mat.name,
          weight: mat.weight,
          ratioPct: solventRatioDenom > 0 ? (mat.weight / solventRatioDenom) * 100 : 0,
          elements,
          rowType: 'solvent',
        })
      }
      
      // 如果有多个熔剂，创建"熔剂"折叠行
      if (solventMats.length > 1) {
        const solventMixRow: Record<string, number> = {}
        for (const elem of allElements) {
          solventMixRow[elem] = solventTotal > 0 ? ((solventWeights[elem] ?? 0) / solventTotal) * 100 : 0
        }
        result.push({
          name: '熔剂',
          weight: solventTotal,
          ratioPct: solventRatioDenom > 0 ? (solventTotal / solventRatioDenom) * 100 : 0,
          elements: solventMixRow,
          rowType: 'solvent',
          detailRows: solventDetailRows,
        })
      } else {
        // 只有一个熔剂，直接添加
        result.push(...solventDetailRows)
      }
    }

    for (const mat of oxygenMats) {
      const ratios = mat.ratios
      const elements: Record<string, number> = {}
      for (const [elem, ratio] of Object.entries(ratios)) {
        const frac = typeof ratio === 'number' ? ratio : parseFloat(String(ratio)) || 0
        elements[elem] = frac * 100
        allElements.add(elem)
      }
      result.push({
        name: mat.name,
        weight: mat.weight,
        ratioPct: (mat.weight / ratioDenom) * 100,
        elements,
        rowType: 'oxygen',
      })
    }

    if (mixResult && total > 0) {
      const totalElemWeights: Record<string, number> = { ...mixResult.elementWeights }
      for (const om of oxygenMats) {
        for (const [elem, ratio] of Object.entries(om.ratios)) {
          const frac = typeof ratio === 'number' ? ratio : parseFloat(String(ratio)) || 0
          totalElemWeights[elem] = (totalElemWeights[elem] ?? 0) + frac * om.weight
        }
      }
      const elemSet = new Set([...allElements, ...Object.keys(totalElemWeights)])
      const totalRow: Record<string, number> = {}
      for (const elem of elemSet) {
        totalRow[elem] = grandTotal > 0 ? ((totalElemWeights[elem] ?? 0) / grandTotal) * 100 : 0
      }
      const totalLabel = '总计'
      result.push({
        name: totalLabel,
        weight: grandTotal,
        ratioPct: 100,
        elements: totalRow,
        rowType: 'total',
      })
    }

    return result
  }, [materials, mixResult])

  const value: CalcContextValue = useMemo(
    () => ({ materials, setMaterials, mixResult, totalCost, elementTableRows }),
    [materials, mixResult, totalCost, elementTableRows]
  )

  return <CalcContext.Provider value={value}>{children}</CalcContext.Provider>
}

export function useCalc() {
  const ctx = useContext(CalcContext)
  if (!ctx) throw new Error('useCalc must be used within CalcProvider')
  return ctx
}

export function useCalcOptional() {
  return useContext(CalcContext)
}
