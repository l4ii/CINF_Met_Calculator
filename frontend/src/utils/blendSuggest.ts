/**
 * 在用户当前入炉原料的元素总量约束下，用内置几种标准原料配比逼近该组成，并尽量降低原料成本。
 * 方法：先在核心元素偏差约束内求最低成本可行配方；若原料库无可行解，再退回到元素匹配优先的近似配方。
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
/** 低成本配方优化的核心元素相对偏差校核阈值 */
export const BLEND_CORE_REL_ERR_LIMIT_PCT = 5

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

function solveLinearSystem(a: number[][], b: number[]): number[] | null {
  const n = b.length
  const m = a.map((row, i) => [...row, b[i]])

  for (let col = 0; col < n; col++) {
    let pivot = col
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(m[row][col]) > Math.abs(m[pivot][col])) pivot = row
    }
    if (Math.abs(m[pivot][col]) < 1e-10) return null
    if (pivot !== col) {
      const tmp = m[col]
      m[col] = m[pivot]
      m[pivot] = tmp
    }

    const div = m[col][col]
    for (let j = col; j <= n; j++) m[col][j] /= div

    for (let row = 0; row < n; row++) {
      if (row === col) continue
      const factor = m[row][col]
      if (Math.abs(factor) < 1e-14) continue
      for (let j = col; j <= n; j++) m[row][j] -= factor * m[col][j]
    }
  }

  return m.map((row) => row[n])
}

function combinations(total: number, pick: number): number[][] {
  if (pick < 0 || pick > total) return []
  if (pick === 0) return [[]]
  const out: number[][] = []
  const cur: number[] = []
  const dfs = (start: number) => {
    if (cur.length === pick) {
      out.push([...cur])
      return
    }
    for (let i = start; i <= total - (pick - cur.length); i++) {
      cur.push(i)
      dfs(i + 1)
      cur.pop()
    }
  }
  dfs(0)
  return out
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

  const targetComp: number[] = keys.map((e) => (targetElementWeights[e] ?? 0) / W)
  const scaleComp = targetComp.map((te) => {
    const absTarget = Math.abs(te)
    if (absTarget > 1e-9) return Math.max(absTarget, 0.005)
    return 0.002
  })
  const elementWeights = keys.map(elemMatchWeight)
  const priceMax = Math.max(...p, 1)
  const priceNorm = p.map((price) => price / priceMax)
  const coreKeyIndexes = keys
    .map((key, index) => ({ key, index }))
    .filter(({ key, index }) => BLEND_CORE_ELEMENTS.has(key) && Math.abs(targetComp[index]) > 1e-9)
    .map(({ index }) => index)
  const coreTolerance = BLEND_CORE_REL_ERR_LIMIT_PCT / 100
  // 成本只作为近似匹配方案之间的次级排序项，不能压过元素匹配。
  const COST_TIE_BREAKER_WEIGHT = 1e-5

  const calcAchievedComp = (y: number[]) =>
    keys.map((_, j) => {
      let s = 0
      for (let i = 0; i < n; i++) s += R[i][j] * y[i]
      return s
    })

  const calcMatchScore = (y: number[]) => {
    const achievedComp = calcAchievedComp(y)
    let score = 0
    for (let j = 0; j < keys.length; j++) {
      const diff = (achievedComp[j] - targetComp[j]) / scaleComp[j]
      score += elementWeights[j] * diff * diff
    }
    return score
  }

  const calcCostPerTon = (y: number[]) => y.reduce((s, share, i) => s + share * p[i], 0)

  const isCoreFeasible = (y: number[]) => {
    for (const j of coreKeyIndexes) {
      const achieved = R.reduce((sum, row, i) => sum + row[j] * y[i], 0)
      const target = targetComp[j]
      const lower = target * (1 - coreTolerance)
      const upper = target * (1 + coreTolerance)
      const eps = Math.max(Math.abs(target) * 1e-6, 1e-9)
      if (achieved < lower - eps || achieved > upper + eps) return false
    }
    return true
  }

  const solveLowestCostFeasible = (): number[] | null => {
    if (n === 1) {
      const single = [1]
      return isCoreFeasible(single) ? single : null
    }

    type Constraint = { coeffs: number[]; value: number }
    const activeConstraints: Constraint[] = []
    for (let i = 0; i < n; i++) {
      const coeffs = new Array(n).fill(0)
      coeffs[i] = 1
      activeConstraints.push({ coeffs, value: 0 })
    }
    for (const j of coreKeyIndexes) {
      const coeffs = R.map((row) => row[j])
      const target = targetComp[j]
      activeConstraints.push({ coeffs, value: target * (1 - coreTolerance) })
      activeConstraints.push({ coeffs, value: target * (1 + coreTolerance) })
    }

    const feasible: number[][] = []
    const addIfFeasible = (raw: number[] | null) => {
      if (!raw || raw.some((v) => !Number.isFinite(v))) return
      const sum = raw.reduce((s, v) => s + v, 0)
      if (!Number.isFinite(sum) || Math.abs(sum - 1) > 1e-5) return
      const yCandidate = raw.map((v) => (Math.abs(v) < 1e-9 ? 0 : v))
      if (yCandidate.some((v) => v < -1e-7)) return
      const cleaned = yCandidate.map((v) => Math.max(v, 0))
      const cleanedSum = cleaned.reduce((s, v) => s + v, 0)
      if (cleanedSum <= 0) return
      const normalized = cleaned.map((v) => v / cleanedSum)
      if (!isCoreFeasible(normalized)) return
      const key = normalized.map((v) => v.toFixed(9)).join('|')
      if (!feasible.some((item) => item.map((v) => v.toFixed(9)).join('|') === key)) feasible.push(normalized)
    }

    const activeNeeded = n - 1
    for (const combo of combinations(activeConstraints.length, activeNeeded)) {
      const matrix = [new Array(n).fill(1)]
      const rhs = [1]
      for (const idx of combo) {
        matrix.push(activeConstraints[idx].coeffs)
        rhs.push(activeConstraints[idx].value)
      }
      addIfFeasible(solveLinearSystem(matrix, rhs))
    }

    if (feasible.length === 0) return null
    feasible.sort((a, b) => {
      const costDiff = calcCostPerTon(a) - calcCostPerTon(b)
      if (Math.abs(costDiff) > 1e-7) return costDiff
      return calcMatchScore(a) - calcMatchScore(b)
    })
    return feasible[0]
  }

  const hessian: number[][] = Array.from({ length: n }, () => new Array(n).fill(0))
  for (let i = 0; i < n; i++) {
    for (let l = 0; l < n; l++) {
      let v = 0
      for (let j = 0; j < keys.length; j++) {
        v += (2 * elementWeights[j] * R[i][j] * R[l][j]) / (scaleComp[j] * scaleComp[j])
      }
      hessian[i][l] = v
    }
  }
  let power = new Array(n).fill(1 / Math.sqrt(n))
  let lipschitz = 1
  for (let iter = 0; iter < 30; iter++) {
    const hp = new Array(n).fill(0)
    for (let i = 0; i < n; i++) {
      for (let l = 0; l < n; l++) hp[i] += hessian[i][l] * power[l]
    }
    const norm = Math.sqrt(hp.reduce((s, v) => s + v * v, 0))
    if (norm <= 1e-12) break
    power = hp.map((v) => v / norm)
    lipschitz = norm
  }

  let y = solveLowestCostFeasible()
  const foundFeasibleWithinCoreLimit = Boolean(y)

  if (!y) {
    y = new Array(n).fill(1 / n)
    y = projectSimplex(y, 1)

    const grad = () => {
      const g = new Array(n).fill(0)
      for (let j = 0; j < keys.length; j++) {
        let ae = 0
        for (let i = 0; i < n; i++) ae += R[i][j] * y![i]
        const sig = scaleComp[j]
        const wEl = elemMatchWeight(keys[j])
        const diff = ae - targetComp[j]
        const denom = sig * sig
        if (denom < 1e-20) continue
        const fac = (2 * wEl * diff) / denom
        for (let i = 0; i < n; i++) g[i] += fac * R[i][j]
      }
      for (let i = 0; i < n; i++) g[i] += COST_TIE_BREAKER_WEIGHT * priceNorm[i]
      return g
    }

    const step = 1 / Math.max(lipschitz + COST_TIE_BREAKER_WEIGHT, 1e-6)
    for (let iter = 0; iter < 2500; iter++) {
      const g = grad()
      y = projectSimplex(
        y.map((yi, i) => yi - step * g[i]),
        1
      )
    }
  }

  const cleaned = y.map((share) => (share < 1e-5 ? 0 : share))
  const cleanedTotal = cleaned.reduce((s, v) => s + v, 0)
  if (cleanedTotal > 0) {
    y = cleaned.map((v) => v / cleanedTotal)
  }

  const x = y.map((share) => share * W)
  const achievedComp = calcAchievedComp(y)
  const achieved: number[] = achievedComp.map((v) => v * W)
  const matchScore = calcMatchScore(y)

  const achievedVsTarget = keys.map((element, j) => {
    const target = targetElementWeights[element] ?? 0
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
  if (!foundFeasibleWithinCoreLimit && maxCore > BLEND_CORE_REL_ERR_LIMIT_PCT) {
    warn =
      ` 未找到满足核心元素偏差≤${BLEND_CORE_REL_ERR_LIMIT_PCT}%的可行配方；当前展示为元素匹配度最高的近似方案，请补充原料库或人工复核。`
  } else if (matchScore > 0.02) {
    warn =
      ` 推荐方案已满足核心元素偏差≤${BLEND_CORE_REL_ERR_LIMIT_PCT}%校核，非核心或低含量元素仍可能存在偏差，请结合生产约束复核。`
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
