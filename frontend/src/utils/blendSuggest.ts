/**
 * 在用户当前入炉原料的元素总量约束下，用内置几种标准原料配比逼近该组成，并尽量降低原料成本。
 * 方法：投影梯度下降（总投料量固定、非负）最小化 成本 + λ×加权相对元素偏差²
 */
import {
  BASE_ELEMENTS,
  RAW_MATERIAL_DEFAULT_PRICES,
  type ElementRatios,
} from '../config/rawMaterialConfig'
import type { ElementWeights } from './phaseAnalysis'
import type { MaterialEntry } from '../context/CalcContext'

export interface BuiltinBlendItem {
  id: number
  name: string
  weight: number
  unitPriceYuanPerTon: number
  ratios: ElementRatios
}

export interface BlendSuggestResult {
  ok: boolean
  message?: string
  /** 建议配方（仅内置料，投料量之和 = 用户原料总重） */
  blend: BuiltinBlendItem[]
  suggestedCostYuanPerH: number
  /** 用户当前原料行（仅 base）总成本 元/h */
  currentCostYuanPerH: number
  /** 核心元素最大相对偏差 %（Sb/S/Fe/Si/Ca 中有目标的） */
  maxCoreRelErrPct: number
  /** 各元素达成量 vs 目标量（t/h） */
  achievedVsTarget: { element: string; target: number; achieved: number; relErrPct: number }[]
}

/** 欧氏投影到 { x >= 0, sum x = z } */
function projectSimplex(v: number[], z: number): number[] {
  const n = v.length
  if (n === 0) return []
  if (z <= 0) return v.map(() => 0)
  const u = [...v].sort((a, b) => b - a)
  const cum: number[] = []
  let s = -z
  for (let j = 0; j < n; j++) {
    s += u[j]
    cum.push(s)
  }
  let rho = 1
  for (let j = 0; j < n; j++) {
    if (u[j] - cum[j] / (j + 1) > 0) rho = j + 1
  }
  const theta = cum[rho - 1] / rho
  return v.map((vi) => Math.max(vi - theta, 0))
}

/** 渣型/主金属相关，匹配权重更高 */
export const BLEND_CORE_ELEMENTS = new Set(['Sb(锑)', 'S (硫)', 'Fe(铁)', 'Si(硅)', 'Ca(钙)'])

function elemMatchWeight(el: string): number {
  if (BLEND_CORE_ELEMENTS.has(el)) return 4
  if (el === 'O (氧)' || el === 'N (氮)') return 0.15
  if (el.includes('Other')) return 0.1
  return 0.6
}

function buildCandidates(): { id: number; name: string; ratios: ElementRatios; price: number }[] {
  const list = Object.values(BASE_ELEMENTS)
  return list.map((m) => ({
    id: m.id,
    name: m.name,
    ratios: m.ratios,
    price: (RAW_MATERIAL_DEFAULT_PRICES[m.name] ?? 0) * 10000,
  }))
}

/**
 * 从当前「仅原料 base」的元素量与总重，求内置料低成本近似配方。
 */
export function suggestBuiltinCheaperBlend(
  targetElementWeights: ElementWeights,
  totalBaseWeight: number
): BlendSuggestResult {
  const W = totalBaseWeight
  if (!Number.isFinite(W) || W <= 1e-12) {
    return { ok: false, message: '请先添加原料并填写投料量。', blend: [], suggestedCostYuanPerH: 0, currentCostYuanPerH: 0, maxCoreRelErrPct: 0, achievedVsTarget: [] }
  }

  const candidates = buildCandidates()
  const n = candidates.length
  if (n === 0) {
    return { ok: false, message: '无内置原料配置。', blend: [], suggestedCostYuanPerH: 0, currentCostYuanPerH: 0, maxCoreRelErrPct: 0, achievedVsTarget: [] }
  }

  const allKeys = new Set<string>()
  for (const c of candidates) {
    for (const k of Object.keys(c.ratios)) allKeys.add(k)
  }
  for (const k of Object.keys(targetElementWeights)) allKeys.add(k)
  const keys = [...allKeys]

  const R: number[][] = []
  const p: number[] = []
  for (let i = 0; i < n; i++) {
    p.push(candidates[i].price)
    const row: number[] = []
    for (const e of keys) {
      const r = candidates[i].ratios[e]
      row.push(((typeof r === 'number' ? r : parseFloat(String(r))) || 0) / 100)
    }
    R.push(row)
  }

  const T: number[] = keys.map((e) => targetElementWeights[e] ?? 0)
  const totalT = T.reduce((a, b) => a + Math.abs(b), 0)
  const scaleE = keys.map((_, j) => {
    const te = T[j]
    if (te > 1e-12) return Math.max(te, 1e-9)
    return Math.max(W * 0.005, 1e-9)
  })

  const lambda =
    (Math.max(...p, 1) / Math.max(W * W * 0.0001, 1e-6)) * (totalT > 1e-9 ? 800 : 200)

  let x = new Array(n).fill(W / n)
  x = projectSimplex(x, W)

  const grad = () => {
    const g = new Array(n).fill(0)
    for (let i = 0; i < n; i++) g[i] = p[i]
    for (let j = 0; j < keys.length; j++) {
      let ae = 0
      for (let i = 0; i < n; i++) ae += R[i][j] * x[i]
      const te = T[j]
      const sig = scaleE[j]
      const wEl = elemMatchWeight(keys[j])
      const diff = ae - te
      const denom = sig * sig
      if (denom < 1e-20) continue
      const fac = (2 * lambda * wEl * diff) / denom
      for (let i = 0; i < n; i++) g[i] += fac * R[i][j]
    }
    return g
  }

  let lr = Math.min(W * 0.05, 2)
  for (let iter = 0; iter < 4000; iter++) {
    const g = grad()
    const gnorm = Math.sqrt(g.reduce((s, v) => s + v * v, 0))
    if (gnorm > 1e-6) {
      const step = lr / Math.sqrt(1 + iter / 500)
      const nx = projectSimplex(
        x.map((xi, i) => xi - step * g[i]),
        W
      )
      x = nx
    }
    if (iter % 800 === 799) lr *= 0.65
  }

  const achieved: number[] = keys.map((_, j) => {
    let s = 0
    for (let i = 0; i < n; i++) s += R[i][j] * x[i]
    return s
  })

  const achievedVsTarget = keys.map((element, j) => {
    const target = T[j]
    const ach = achieved[j]
    const relErrPct =
      Math.abs(target) > 1e-9 ? ((ach - target) / target) * 100 : ach > 1e-9 ? 999 : 0
    return { element, target, achieved: ach, relErrPct }
  })

  let maxCore = 0
  for (const row of achievedVsTarget) {
    if (BLEND_CORE_ELEMENTS.has(row.element) && Math.abs(row.target) > 1e-9) {
      maxCore = Math.max(maxCore, Math.abs(row.relErrPct))
    }
  }

  const blend: BuiltinBlendItem[] = []
  for (let i = 0; i < n; i++) {
    if (x[i] > 1e-8) {
      blend.push({
        id: candidates[i].id,
        name: candidates[i].name,
        weight: x[i],
        unitPriceYuanPerTon: candidates[i].price,
        ratios: { ...candidates[i].ratios },
      })
    }
  }

  const suggestedCostYuanPerH = blend.reduce((s, b) => s + b.weight * b.unitPriceYuanPerTon, 0)

  let warn = ''
  if (maxCore > 8) {
    warn =
      ' 内置五种料无法非常接近您的元素组成（核心元素偏差较大），以下配方为成本与匹配度的折中，请人工核对。'
  }

  return {
    ok: true,
    message: warn || undefined,
    blend,
    suggestedCostYuanPerH,
    currentCostYuanPerH: 0,
    maxCoreRelErrPct: maxCore,
    achievedVsTarget,
  }
}

/** 汇总用户当前 base 原料的元素量与成本 */
export function aggregateBaseMaterials(materials: MaterialEntry[]): {
  targetElementWeights: ElementWeights
  totalWeight: number
  currentCostYuanPerH: number
} {
  const onlyBase = materials.filter((m) => m.type === 'base')
  const targetElementWeights: ElementWeights = {}
  let totalWeight = 0
  let currentCostYuanPerH = 0

  for (const m of onlyBase) {
    totalWeight += m.weight
    currentCostYuanPerH += m.weight * (m.unitPrice ?? 0)
    for (const [elem, ratio] of Object.entries(m.ratios)) {
      const pct = typeof ratio === 'number' ? ratio : parseFloat(String(ratio)) || 0
      targetElementWeights[elem] = (targetElementWeights[elem] ?? 0) + (pct / 100) * m.weight
    }
  }

  return { targetElementWeights, totalWeight, currentCostYuanPerH }
}
