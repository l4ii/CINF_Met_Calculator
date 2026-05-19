/**
 * 目标渣型熔剂计算 - NSGA-II 多目标优化
 *
 * 步骤 1：定义优化问题
 *   - 决策变量：X = [石灰用量, 铁矿石用量]，取值 [0, maxSolvent]
 *   - 目标函数：F(X) = [cost(X), limestone(X), totalSlag(X)]，均最小化
 *   - 约束条件：Fe/SiO₂、CaO/SiO₂ 位于目标范围内
 *
 * 步骤 2：初始化种群
 *   - 以精确解为中心，确定性网格生成满足约束的初始解
 *
 * 步骤 3~6：NSGA-II 迭代
 *   - 非支配排序 + 拥挤度；选择、交叉、变异；种群进化直至收敛
 */
import type { ElementWeights } from './phaseAnalysis'
import type { MaterialEntry } from '../context/CalcContext'
import { TWO_MATERIALS } from '../config/rawMaterialConfig'

const SI_TO_SIO2 = 60.084 / 28.085
const CA_TO_CAO = 56.077 / 40.078

/** 熔剂三参数：Fe、SiO₂、CaO 百分比 */
export interface SolventComposition {
  'Fe(铁)': number
  'SiO₂(二氧化硅)': number
  'CaO(氧化钙)': number
}

export interface SolventSolution {
  /** 石灰用量 t/h */
  limestone: number
  /** 铁矿石用量 t/h */
  ironOre: number
  /**  achieved Fe/SiO₂ */
  feSiO2: number
  /** achieved CaO/SiO₂ */
  caOSiO2: number
  /** 配料总成本 元/h */
  cost: number
  /** 石灰用量（环保目标） */
  limestoneAmount: number
  /** 总渣量 t/h（原料+熔剂） */
  totalSlag: number
  /** 方案标签 */
  label?: string
}

export interface SolventCalcInput {
  elementWeights: ElementWeights
  targetFeSiO2: number
  targetCaOSiO2: number
  feSiO2FluctPct: number
  caOSiO2FluctPct: number
  baseMaterials: MaterialEntry[]
  limestoneComposition?: SolventComposition
  ironOreComposition?: SolventComposition
  limestonePrice?: number
  ironOrePrice?: number
}

function getSolventComp(
  custom: SolventComposition | undefined,
  key: '石灰' | '铁矿石'
): SolventComposition {
  const def = TWO_MATERIALS[key]
  if (custom) return custom
  return {
    'Fe(铁)': def['Fe(铁)'] ?? 0,
    'SiO₂(二氧化硅)': def['SiO₂(二氧化硅)'] ?? 0,
    'CaO(氧化钙)': def['CaO(氧化钙)'] ?? 0,
  }
}

/**
 * 精确解：解线性方程组求石灰、铁矿石用量，使 Fe/SiO₂、CaO/SiO₂ 精确达到目标
 */
export function solveExactSolvent(
  elementWeights: ElementWeights,
  targetFeSiO2: number,
  targetCaOSiO2: number,
  limestoneComp?: SolventComposition,
  ironOreComp?: SolventComposition
): { limestone: number; ironOre: number; feSiO2: number; caOSiO2: number; valid: boolean } {
  const feWeight = elementWeights['Fe(铁)'] ?? 0
  const siWeight = elementWeights['Si(硅)'] ?? 0
  const caWeight = elementWeights['Ca(钙)'] ?? 0
  const sio2Weight = siWeight * SI_TO_SIO2
  const caoWeight = caWeight * CA_TO_CAO

  const silica = getSolventComp(ironOreComp, '铁矿石')
  const limestone = getSolventComp(limestoneComp, '石灰')

  const A11 = (silica['Fe(铁)'] ?? 0) / 100 - targetFeSiO2 * (silica['SiO₂(二氧化硅)'] ?? 0) / 100
  const A12 = (limestone['Fe(铁)'] ?? 0) / 100 - targetFeSiO2 * (limestone['SiO₂(二氧化硅)'] ?? 0) / 100
  const A21 = (silica['CaO(氧化钙)'] ?? 0) / 100 - targetCaOSiO2 * (silica['SiO₂(二氧化硅)'] ?? 0) / 100
  const A22 = (limestone['CaO(氧化钙)'] ?? 0) / 100 - targetCaOSiO2 * (limestone['SiO₂(二氧化硅)'] ?? 0) / 100
  const b1 = targetFeSiO2 * sio2Weight - feWeight
  const b2 = targetCaOSiO2 * sio2Weight - caoWeight

  const det = A11 * A22 - A12 * A21
  if (Math.abs(det) < 1e-8) {
    return { limestone: 0, ironOre: 0, feSiO2: 0, caOSiO2: 0, valid: false }
  }

  const ironOre = (b1 * A22 - A12 * b2) / det
  const limestoneW = (A11 * b2 - b1 * A21) / det

  const { feSiO2: feSiO2R, caOSiO2: caOSiO2R } = computeRatios(
    elementWeights, Math.max(0, limestoneW), Math.max(0, ironOre), limestone, silica
  )
  const valid = ironOre >= -1e-6 && limestoneW >= -1e-6

  return { limestone: Math.max(0, limestoneW), ironOre: Math.max(0, ironOre), feSiO2: feSiO2R, caOSiO2: caOSiO2R, valid }
}

/** 计算给定熔剂用量下的 Fe/SiO₂、CaO/SiO₂ */
function computeRatios(
  elementWeights: ElementWeights,
  limestone: number,
  ironOre: number,
  limestoneComp: SolventComposition = TWO_MATERIALS['石灰'],
  silica: SolventComposition = TWO_MATERIALS['铁矿石']
): { feSiO2: number; caOSiO2: number } {
  const feWeight = elementWeights['Fe(铁)'] ?? 0
  const siWeight = elementWeights['Si(硅)'] ?? 0
  const caWeight = elementWeights['Ca(钙)'] ?? 0
  const sio2Weight = siWeight * SI_TO_SIO2
  const caoWeight = caWeight * CA_TO_CAO

  const totalFe = feWeight + ironOre * (silica['Fe(铁)'] ?? 0) / 100 + limestone * (limestoneComp['Fe(铁)'] ?? 0) / 100
  const totalSio2 = sio2Weight + ironOre * (silica['SiO₂(二氧化硅)'] ?? 0) / 100 + limestone * (limestoneComp['SiO₂(二氧化硅)'] ?? 0) / 100
  const totalCao = caWeight * CA_TO_CAO + ironOre * (silica['CaO(氧化钙)'] ?? 0) / 100 + limestone * (limestoneComp['CaO(氧化钙)'] ?? 0) / 100

  const feSiO2 = totalSio2 > 1e-10 ? totalFe / totalSio2 : 0
  const caOSiO2 = totalSio2 > 1e-10 ? totalCao / totalSio2 : 0
  return { feSiO2, caOSiO2 }
}

/** 计算成本 */
function computeCost(
  baseMaterials: MaterialEntry[],
  limestone: number,
  ironOre: number,
  limestonePrice: number,
  ironOrePrice: number
): number {
  const baseCost = baseMaterials.reduce((s, m) => s + m.weight * (m.unitPrice ?? 0), 0)
  return baseCost + limestone * limestonePrice + ironOre * ironOrePrice
}

/** 让出事件循环，便于 UI 更新进度 */
const yieldToUI = () => new Promise<void>((r) => setTimeout(r, 0))

export interface SolventProgress {
  percent: number
  stage: string
}

/** 多目标求解返回：5 个方案 + Pareto 前沿（用于可视化） */
export interface SolventResult {
  solutions: SolventSolution[]
  paretoFront: SolventSolution[]
}

/**
 * NSGA-II 风格多目标求解：在目标范围内采样，返回 Pareto 前沿解供用户选择
 * @param onProgress 可选回调，用于实时上报进度（percent 0-100，stage 当前阶段描述）
 */
export async function runNsga2Solvent(
  input: SolventCalcInput,
  onProgress?: (p: SolventProgress) => void
): Promise<SolventResult> {
  onProgress?.({ percent: 0, stage: '在准备参数…' })
  const {
    elementWeights,
    targetFeSiO2,
    targetCaOSiO2,
    feSiO2FluctPct,
    caOSiO2FluctPct,
    baseMaterials,
    limestoneComposition,
    ironOreComposition,
    limestonePrice = 550,
    ironOrePrice = 750,
  } = input

  const limeComp = getSolventComp(limestoneComposition, '石灰')
  const ironComp = getSolventComp(ironOreComposition, '铁矿石')

  const baseWeight = Object.values(elementWeights).reduce((a, b) => a + b, 0)
  onProgress?.({ percent: 5, stage: '在精准求解…' })
  await yieldToUI()
  const exact = solveExactSolvent(elementWeights, targetFeSiO2, targetCaOSiO2, limeComp, ironComp)

  const feMin = targetFeSiO2 * (1 - feSiO2FluctPct / 100)
  const feMax = targetFeSiO2 * (1 + feSiO2FluctPct / 100)
  const caMin = targetCaOSiO2 * (1 - caOSiO2FluctPct / 100)
  const caMax = targetCaOSiO2 * (1 + caOSiO2FluctPct / 100)
  const RANGE_EPS = 1e-9
  const withinRange = (value: number, min: number, max: number) =>
    value >= min - RANGE_EPS && value <= max + RANGE_EPS

  const solutions: SolventSolution[] = []

  // 1. 精确解（若有效且在范围内）
  if (exact.valid) {
    const inRange =
      withinRange(exact.feSiO2, feMin, feMax) && withinRange(exact.caOSiO2, caMin, caMax)
    if (inRange) {
      solutions.push({
        limestone: exact.limestone,
        ironOre: exact.ironOre,
        feSiO2: exact.feSiO2,
        caOSiO2: exact.caOSiO2,
        cost: computeCost(baseMaterials, exact.limestone, exact.ironOre, limestonePrice, ironOrePrice),
        limestoneAmount: exact.limestone,
        totalSlag: baseWeight + exact.limestone + exact.ironOre,
        label: '精准渣型解',
      })
    }
  }

  const silica = ironComp
  const limestoneComp = limeComp
  const maxSolvent = Math.max(baseWeight * 0.5, 2)

  const toSolution = (limestone: number, ironOre: number): SolventSolution => {
    const { feSiO2, caOSiO2 } = computeRatios(elementWeights, limestone, ironOre, limestoneComp, silica)
    return {
      limestone,
      ironOre,
      feSiO2,
      caOSiO2,
      cost: computeCost(baseMaterials, limestone, ironOre, limestonePrice, ironOrePrice),
      limestoneAmount: limestone,
      totalSlag: baseWeight + limestone + ironOre,
    }
  }
  const isFeasible = (s: SolventSolution) =>
    withinRange(s.feSiO2, feMin, feMax) && withinRange(s.caOSiO2, caMin, caMax)

  const centerL = exact.valid ? exact.limestone : maxSolvent * 0.1
  const centerI = exact.valid ? exact.ironOre : maxSolvent * 0.1
  const radius = Math.max(centerL, centerI, 0.1) * (1 + (feSiO2FluctPct + caOSiO2FluctPct) / 100)

  const dominates = (a: SolventSolution, b: SolventSolution) => {
    const noWorse = a.cost <= b.cost && a.limestoneAmount <= b.limestoneAmount && a.totalSlag <= b.totalSlag
    const better = a.cost < b.cost || a.limestoneAmount < b.limestoneAmount || a.totalSlag < b.totalSlag
    return noWorse && better
  }

  const nonDominatedSort = (pop: SolventSolution[]): SolventSolution[][] => {
    const fronts: SolventSolution[][] = []
    let remaining = [...pop]
    while (remaining.length > 0) {
      const front: SolventSolution[] = []
      for (const a of remaining) {
        let dominated = false
        for (const b of remaining) {
          if (a !== b && dominates(b, a)) { dominated = true; break }
        }
        if (!dominated) front.push(a)
      }
      remaining = remaining.filter((x) => !front.includes(x))
      if (front.length > 0) fronts.push(front)
    }
    return fronts
  }

  const crowdingDistance = (front: SolventSolution[]) => {
    const n = front.length
    const dist = new Map<SolventSolution, number>()
    front.forEach((s) => dist.set(s, 0))
    for (const key of ['cost', 'limestoneAmount', 'totalSlag'] as const) {
      const sorted = [...front].sort((a, b) => (a[key] as number) - (b[key] as number))
      const range = (sorted[n - 1][key] as number) - (sorted[0][key] as number) || 1
      dist.set(sorted[0], (dist.get(sorted[0]) ?? 0) + 1e10)
      dist.set(sorted[n - 1], (dist.get(sorted[n - 1]) ?? 0) + 1e10)
      for (let i = 1; i < n - 1; i++) {
        const d = ((sorted[i + 1][key] as number) - (sorted[i - 1][key] as number)) / range
        dist.set(sorted[i], (dist.get(sorted[i]) ?? 0) + d)
      }
    }
    return dist
  }

  const POP_SIZE = 60
  const MAX_GEN = 40
  const MUTATE_SIGMA = radius * 0.15

  let population: SolventSolution[] = []
  if (exact.valid && isFeasible(toSolution(exact.limestone, exact.ironOre))) {
    population.push(toSolution(exact.limestone, exact.ironOre))
  }
  for (let i = 0; i <= 20; i++) {
    for (let j = 0; j <= 20; j++) {
      const limestone = Math.max(0, centerL + ((i / 20) * 2 - 1) * radius)
      const ironOre = Math.max(0, centerI + ((j / 20) * 2 - 1) * radius)
      if (limestone < 1e-6 && ironOre < 1e-6) continue
      const s = toSolution(limestone, ironOre)
      if (isFeasible(s) && !population.some((d) => Math.abs(d.limestone - s.limestone) < 0.0001 && Math.abs(d.ironOre - s.ironOre) < 0.0001)) population.push(s)
    }
  }
  for (let k = 0; population.length < POP_SIZE && k < 500; k++) {
    if (population.length === 0) break
    const idx = k % Math.max(1, population.length)
    const p = population[idx]
    const t = (k * 7919 + 1) % 100 / 100
    const nl = Math.max(0, p.limestone + (t * 2 - 1) * MUTATE_SIGMA)
    const ni = Math.max(0, p.ironOre + (((k * 7877 + 1) % 100) / 100 * 2 - 1) * MUTATE_SIGMA)
    const ns = toSolution(nl, ni)
    if (isFeasible(ns) && !population.some((d) => Math.abs(d.limestone - ns.limestone) < 0.0001 && Math.abs(d.ironOre - ns.ironOre) < 0.0001)) population.push(ns)
  }
  population = population.slice(0, POP_SIZE)
  onProgress?.({ percent: 15, stage: '在初始化种群…' })
  await yieldToUI()

  for (let gen = 0; gen < MAX_GEN; gen++) {
    const fronts = nonDominatedSort(population)
    const combined: SolventSolution[] = [...population]
    for (let fi = 0; fi < Math.min(2, fronts.length); fi++) {
      const front = fronts[fi]
      for (let i = 0; i < front.length; i++) {
        const a = front[i]
        const b = front[(i + 1) % front.length]
        const cL = a.limestone * 0.6 + b.limestone * 0.4
        const cI = a.ironOre * 0.6 + b.ironOre * 0.4
        const mutL = Math.max(0, cL + (Math.floor((gen * 11111 + i * 22222) % 100) / 50 - 1) * MUTATE_SIGMA)
        const mutI = Math.max(0, cI + (Math.floor((gen * 33333 + i * 44444) % 100) / 50 - 1) * MUTATE_SIGMA)
        const child = toSolution(mutL, mutI)
        if (isFeasible(child)) combined.push(child)
      }
    }
    const combinedFronts = nonDominatedSort(combined)
    const next: SolventSolution[] = []
    for (const front of combinedFronts) {
      if (next.length + front.length <= POP_SIZE) {
        const cd = crowdingDistance(front)
        front.sort((a, b) => (cd.get(b) ?? 0) - (cd.get(a) ?? 0))
        next.push(...front)
      } else {
        const cd = crowdingDistance(front)
        front.sort((a, b) => (cd.get(b) ?? 0) - (cd.get(a) ?? 0))
        next.push(...front.slice(0, POP_SIZE - next.length))
        break
      }
    }
    population = next.slice(0, POP_SIZE)
    const pct = 15 + Math.floor(((gen + 1) / MAX_GEN) * 65)
    onProgress?.({ percent: pct, stage: `在 NSGA-II 进化第 ${gen + 1}/${MAX_GEN} 代…` })
    await yieldToUI()
  }

  onProgress?.({ percent: 85, stage: '在提取 Pareto 前沿…' })
  await yieldToUI()
  const allCandidates: SolventSolution[] = []
  for (const s of solutions) {
    if (s.label === '精准渣型解') allCandidates.push(s)
  }
  for (const s of population) {
    if (!allCandidates.some((d) => Math.abs(d.limestone - s.limestone) < 0.0001 && Math.abs(d.ironOre - s.ironOre) < 0.0001)) allCandidates.push(s)
  }
  const deduped = allCandidates.length > 0 ? allCandidates : population
  const anySol = deduped[0]
  if (!anySol || !Number.isFinite(anySol.limestone) || !Number.isFinite(anySol.ironOre)) {
    throw new Error('未找到可行解，请放宽 Fe/SiO₂、CaO/SiO₂ 目标范围')
  }

  // 从可行解中选出各目标最优解
  const exactSol = solutions.find((s) => s?.label === '精准渣型解')
  const minCostSol = [...deduped].sort((a, b) => a.cost - b.cost)[0]
  const minLimestoneSol = [...deduped].sort((a, b) => a.limestoneAmount - b.limestoneAmount)[0]
  const minSlagSol = [...deduped].sort((a, b) => a.totalSlag - b.totalSlag)[0]

  // NSGA-II 最优解：从第一层 Pareto 前沿中选"理想点最近解"（knee point），代表多目标折中
  const fronts = nonDominatedSort(population)
  const firstFront = fronts[0] ?? []
  const nsga2BestSol = (() => {
    if (firstFront.length === 0) return null
    if (firstFront.length === 1) return firstFront[0]
    const cMin = Math.min(...firstFront.map((s) => s.cost))
    const cMax = Math.max(...firstFront.map((s) => s.cost))
    const lMin = Math.min(...firstFront.map((s) => s.limestoneAmount))
    const lMax = Math.max(...firstFront.map((s) => s.limestoneAmount))
    const sMin = Math.min(...firstFront.map((s) => s.totalSlag))
    const sMax = Math.max(...firstFront.map((s) => s.totalSlag))
    const rC = (cMax - cMin) || 1
    const rL = (lMax - lMin) || 1
    const rS = (sMax - sMin) || 1
    let best = firstFront[0]
    let bestDist = Infinity
    for (const s of firstFront) {
      const d = ((s.cost - cMin) / rC) ** 2 + ((s.limestoneAmount - lMin) / rL) ** 2 + ((s.totalSlag - sMin) / rS) ** 2
      if (d < bestDist) { bestDist = d; best = s }
    }
    return best
  })()

  // 若无精确解（无效或超出范围），用最接近目标比值的解代替
  const closestToTarget = (candidates: SolventSolution[]) => {
    if (candidates.length === 0) return null
    let best = candidates[0]
    let bestDist = Math.abs(best.feSiO2 - targetFeSiO2) + Math.abs(best.caOSiO2 - targetCaOSiO2)
    for (const s of candidates) {
      const d = Math.abs(s.feSiO2 - targetFeSiO2) + Math.abs(s.caOSiO2 - targetCaOSiO2)
      if (d < bestDist) { bestDist = d; best = s }
    }
    return best
  }
  const exactFallback = exactSol ?? closestToTarget(deduped)
  const fallback = minCostSol ?? deduped[0] // 任一可行解作兜底

  onProgress?.({ percent: 100, stage: '完成' })
  const finalSolutions: SolventSolution[] = [
    { ...(exactFallback ?? fallback), label: '精准渣型解' },
    { ...(nsga2BestSol ?? fallback), label: '帕累托最优解' },
    { ...(minCostSol ?? fallback), label: '最小成本解' },
    { ...(minLimestoneSol ?? fallback), label: '最低能耗解' },
    { ...(minSlagSol ?? fallback), label: '最小渣量解' },
  ]
  // paretoFront 用于可视化：返回完整进化种群（与用户 Python 的 final_values=population 一致），显示所有 Pareto 前沿解
  return { solutions: finalSolutions, paretoFront: population }
}
