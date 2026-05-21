import type { ElementRatios } from '../config/rawMaterialConfig'

export type LeadFlashCandidate = {
  id: string
  name: string
  enabled: boolean
  unitPrice: number
  ratios: ElementRatios
  priority: number
  annualMinDemand: number
}

export type LeadFlashTarget = {
  element: string
  enabled: boolean
  minPct: number
  maxPct: number
}

export type LeadFlashObjectiveWeights = {
  cost: number
  elementMatch: number
  priority: number
  annualDemand: number
}

export type LeadFlashBlendRequest = {
  candidates: LeadFlashCandidate[]
  targets: LeadFlashTarget[]
  totalFeedMass: number
  annualOperatingHours: number
  objectiveWeights: LeadFlashObjectiveWeights
}

export type LeadFlashBlendItem = {
  id: string
  name: string
  weight: number
  sharePct: number
  unitPrice: number
  cost: number
  priority: number
  annualUsage: number
  ratios: ElementRatios
}

export type LeadFlashBlendResult = {
  ok: boolean
  message?: string
  blend: LeadFlashBlendItem[]
  totalCost: number
  avgPrice: number
  composition: Record<string, number>
  targetErrors: { element: string; value: number; minPct: number; maxPct: number; deviationPct: number }[]
  annualShortages: { id: string; name: string; required: number; actual: number; shortage: number }[]
  objective: number
}

function emptyResult(message: string): LeadFlashBlendResult {
  return { ok: false, message, blend: [], totalCost: 0, avgPrice: 0, composition: {}, targetErrors: [], annualShortages: [], objective: 0 }
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}

function num(v: number, fallback = 0) {
  return Number.isFinite(v) ? v : fallback
}

function seededRandom(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

function buildInitialShares(candidates: LeadFlashCandidate[]) {
  const attractiveness = candidates.map((c) => {
    const priceScore = 1 / Math.max(c.unitPrice || 1, 1)
    const priorityScore = 0.2 + clamp(c.priority, 1, 5) / 5
    return priceScore * priorityScore
  })
  const totalAttr = attractiveness.reduce((sum, value) => sum + value, 0)
  if (totalAttr <= 0) return candidates.map(() => 1 / candidates.length)
  return attractiveness.map((value) => value / totalAttr)
}

function calcComposition(candidates: LeadFlashCandidate[], shares: number[]) {
  const composition: Record<string, number> = {}
  const keys = new Set<string>()
  candidates.forEach((c) => Object.keys(c.ratios).forEach((k) => keys.add(k)))
  for (const key of keys) {
    composition[key] = candidates.reduce((sum, c, i) => sum + (num(c.ratios[key]) * shares[i]), 0)
  }
  return composition
}

function targetPenalty(composition: Record<string, number>, targets: LeadFlashTarget[]) {
  let penalty = 0
  for (const target of targets) {
    if (!target.enabled) continue
    const minPct = Math.min(target.minPct, target.maxPct)
    const maxPct = Math.max(target.minPct, target.maxPct)
    const value = composition[target.element] ?? 0
    if (value >= minPct && value <= maxPct) continue
    const scale = Math.max((minPct + maxPct) / 2, 1)
    const diff = value < minPct ? minPct - value : value - maxPct
    penalty += (diff / scale) ** 2
  }
  return penalty
}

function annualPenalty(candidates: LeadFlashCandidate[], shares: number[], totalFeedMass: number, annualHours: number) {
  let penalty = 0
  for (let i = 0; i < candidates.length; i += 1) {
    const required = Math.max(0, candidates[i].annualMinDemand)
    if (required <= 0) continue
    const actual = shares[i] * totalFeedMass * annualHours
    if (actual >= required) continue
    penalty += ((required - actual) / required) ** 2
  }
  return penalty
}

function scoreShares(
  candidates: LeadFlashCandidate[],
  shares: number[],
  req: LeadFlashBlendRequest,
  maxPrice: number
) {
  const comp = calcComposition(candidates, shares)
  const avgPrice = candidates.reduce((sum, c, i) => sum + c.unitPrice * shares[i], 0)
  const priorityMean = candidates.reduce((sum, c, i) => sum + clamp(c.priority, 1, 5) * shares[i], 0)
  const costTerm = avgPrice / Math.max(maxPrice, 1)
  const elementTerm = targetPenalty(comp, req.targets)
  const priorityTerm = 1 - priorityMean / 5
  const annualTerm = annualPenalty(candidates, shares, req.totalFeedMass, req.annualOperatingHours)
  const w = req.objectiveWeights
  return (
    Math.max(0, w.cost) * costTerm +
    Math.max(0, w.elementMatch) * elementTerm +
    Math.max(0, w.priority) * priorityTerm +
    Math.max(0, w.annualDemand) * annualTerm
  )
}

function moveShare(shares: number[], from: number, to: number, amount: number) {
  const trial = shares.slice()
  const movable = Math.min(Math.max(trial[from], 0), amount)
  if (movable <= 1e-12) return shares
  trial[from] -= movable
  trial[to] += movable
  return trial
}

export function optimizeLeadFlashBlend(req: LeadFlashBlendRequest): LeadFlashBlendResult {
  const candidates = req.candidates.filter((c) => c.enabled)
  if (candidates.length === 0) return emptyResult('请至少启用一种候选原料。')
  if (!Number.isFinite(req.totalFeedMass) || req.totalFeedMass <= 0) return emptyResult('总投料量必须大于 0。')
  if (!Number.isFinite(req.annualOperatingHours) || req.annualOperatingHours <= 0) return emptyResult('年运行时间必须大于 0。')

  let shares = buildInitialShares(candidates)
  const maxPrice = Math.max(...candidates.map((c) => c.unitPrice), 1)
  let currentScore = scoreShares(candidates, shares, req, maxPrice)
  let bestScore = currentScore
  let bestShares = shares.slice()
  const rng = seededRandom(20260520)
  let step = 0.1

  for (let iter = 0; iter < 12000; iter += 1) {
    const from = Math.floor(rng() * candidates.length)
    let to = Math.floor(rng() * candidates.length)
    if (to === from) to = (to + 1) % candidates.length
    const amount = step * (0.15 + rng())
    const trial = moveShare(shares, from, to, amount)
    if (trial === shares) continue
    const trialScore = scoreShares(candidates, trial, req, maxPrice)
    const temperature = Math.max(0.00005, 0.018 * (1 - iter / 12000))
    const accept = trialScore < currentScore || Math.exp((currentScore - trialScore) / temperature) > rng()
    if (accept) {
      shares = trial
      currentScore = trialScore
      if (trialScore < bestScore) {
        bestScore = trialScore
        bestShares = trial.slice()
      }
    }
    if (iter % 300 === 0) step *= 0.9
  }
  shares = bestShares

  const composition = calcComposition(candidates, shares)
  const blend = candidates
    .map((c, i) => {
      const weight = shares[i] * req.totalFeedMass
      return {
        id: c.id,
        name: c.name,
        weight,
        sharePct: shares[i] * 100,
        unitPrice: c.unitPrice,
        cost: weight * c.unitPrice,
        priority: c.priority,
        annualUsage: weight * req.annualOperatingHours,
        ratios: c.ratios,
      }
    })
    .filter((item) => item.weight > 1e-6)
    .sort((a, b) => b.weight - a.weight)

  const targetErrors = req.targets
    .filter((t) => t.enabled)
    .map((t) => {
      const minPct = Math.min(t.minPct, t.maxPct)
      const maxPct = Math.max(t.minPct, t.maxPct)
      const value = composition[t.element] ?? 0
      const deviationPct = value < minPct ? value - minPct : value > maxPct ? value - maxPct : 0
      return { element: t.element, value, minPct, maxPct, deviationPct }
    })

  const annualShortages = candidates
    .map((c, i) => {
      const required = Math.max(0, c.annualMinDemand)
      const actual = shares[i] * req.totalFeedMass * req.annualOperatingHours
      return { id: c.id, name: c.name, required, actual, shortage: Math.max(0, required - actual) }
    })
    .filter((x) => x.required > 0 && x.shortage > 1e-6)

  const totalCost = blend.reduce((sum, item) => sum + item.cost, 0)
  return {
    ok: true,
    blend,
    totalCost,
    avgPrice: totalCost / req.totalFeedMass,
    composition,
    targetErrors,
    annualShortages,
    objective: bestScore,
  }
}
