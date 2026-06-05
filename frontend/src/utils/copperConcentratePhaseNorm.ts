import { atomicMass, COMPOUND_MOLAR_MASS, compoundMolarMass, elementMassFraction } from './atomicMass.ts'
import type { CopperElementKey, CopperRatios } from './copperWorkflowCalc.ts'
import { normalizeCopperRatios } from './copperWorkflowCalc.ts'

const MM = COMPOUND_MOLAR_MASS

export type ConcentratePhaseKey =
  | 'CuFeS2'
  | 'CuS'
  | 'Cu2S'
  | 'FeS2'
  | 'FeS'
  | 'SiO2'
  | 'CaCO3'
  | 'CaO'
  | 'MgCO3'
  | 'MgO'
  | 'Al2O3'
  | 'PbS'
  | 'ZnS'
  | 'NiS'
  | 'Se'
  | 'Bi2S3'
  | 'Sb2S3'
  | 'As2S3'
  | 'Hg'
  | 'Cd'
  | 'Au'
  | 'Ag'
  | 'Sn'
  | 'Te'
  | 'Other'

export const CONCENTRATE_NORM_PHASE_ORDER: ConcentratePhaseKey[] = [
  'CuFeS2',
  'CuS',
  'Cu2S',
  'FeS2',
  'FeS',
  'SiO2',
  'CaCO3',
  'CaO',
  'MgCO3',
  'MgO',
  'Al2O3',
  'PbS',
  'ZnS',
  'NiS',
  'Se',
  'Bi2S3',
  'Sb2S3',
  'As2S3',
  'Hg',
  'Cd',
  'Au',
  'Ag',
  'Sn',
  'Te',
  'Other',
]

/** 精矿默认物相行（不含 H2O，由 UI 单独追加） */
export const CONCENTRATE_DEFAULT_PHASE_FORMULAS = [
  'CuFeS2',
  'CuS',
  'Cu2S',
  'FeS2',
  'FeS',
  'SiO2',
  'CaCO3',
  'CaO',
  'MgCO3',
  'MgO',
  'Al2O3',
  'PbS',
  'ZnS',
  'NiS',
  'Se',
  'Bi2S3',
  'Sb2S3',
  'As2S3',
  'Hg',
  'Cd',
  'Au',
  'Ag',
  'Sn',
  'Te',
  'Other',
] as const

type Pool = {
  Cu: number
  Fe: number
  S: number
  SiO2: number
  CaO: number
  MgO: number
  Al2O3: number
  Pb: number
  Zn: number
  Ni: number
  Se: number
  Bi: number
  Sb: number
  As: number
  Hg: number
  Cd: number
  Au: number
  Ag: number
  Sn: number
  Te: number
  C: number
}

function feMassFromFeO(feoPct: number) {
  return feoPct * elementMassFraction({ Fe: 1, O: 1 }, 'Fe')
}

function displayRatiosToPool(ratios: CopperRatios): Pool {
  const r = normalizeCopperRatios(ratios)
  return {
    Cu: r['Cu(铜)'] ?? 0,
    Fe: (r['Fe(铁)'] ?? 0) + feMassFromFeO(r['FeO(氧化亚铁)'] ?? 0),
    S: r['S (硫)'] ?? 0,
    SiO2: r['SiO₂(二氧化硅)'] ?? 0,
    CaO: r['CaO(氧化钙)'] ?? 0,
    MgO: r['MgO(氧化镁)'] ?? 0,
    Al2O3: r['Al₂O₃(三氧化二铝)'] ?? 0,
    Pb: r['Pb(铅)'] ?? 0,
    Zn: r['Zn(锌)'] ?? 0,
    Ni: r['Ni(镍)'] ?? 0,
    Se: r['Se(硒)'] ?? 0,
    Bi: r['Bi(铋)'] ?? 0,
    Sb: r['Sb(锑)'] ?? 0,
    As: r['As(砷)'] ?? 0,
    Hg: r['Hg(汞)'] ?? 0,
    Cd: r['Cd(镉)'] ?? 0,
    Au: r['Au(金)'] ?? 0,
    Ag: r['Ag(银)'] ?? 0,
    Sn: r['Sn(锡)'] ?? 0,
    Te: r['Te(碲)'] ?? 0,
    C: r['C (碳)'] ?? 0,
  }
}

function phaseMassFromElement(elementMass: number, phaseFormula: keyof typeof MM, elementSymbol: string, elementCount = 1) {
  if (elementMass <= 0) return 0
  const elemM = atomicMass(elementSymbol)
  const phaseM = MM[phaseFormula]
  if (elemM <= 0 || phaseM <= 0) return 0
  return elementMass * (phaseM / (elementCount * elemM))
}

function subtractPhaseConsumption(pool: Pool, phaseMass: number, fractions: Partial<Record<keyof Pool, number>>) {
  for (const [key, frac] of Object.entries(fractions) as [keyof Pool, number][]) {
    if (!frac || frac <= 0) continue
    pool[key] = Math.max(0, pool[key] - phaseMass * frac)
  }
}

function phaseElementFractions(formula: Record<string, number>): Partial<Record<keyof Pool, number>> {
  const mm = compoundMolarMass(formula)
  if (mm <= 0) return {}
  const out: Partial<Record<keyof Pool, number>> = {}
  if (formula.Cu) out.Cu = (atomicMass('Cu') * formula.Cu) / mm
  if (formula.Fe) out.Fe = (atomicMass('Fe') * formula.Fe) / mm
  if (formula.S) out.S = (atomicMass('S') * formula.S) / mm
  if (formula.Si) out.SiO2 = MM.SiO2 / mm
  if (formula.Ca && formula.O && !formula.C) out.CaO = MM.CaO / mm
  if (formula.Mg && formula.O && !formula.C) out.MgO = MM.MgO / mm
  if (formula.Al) out.Al2O3 = MM.Al2O3 / mm
  if (formula.Pb) out.Pb = (atomicMass('Pb') * formula.Pb) / mm
  if (formula.Zn) out.Zn = (atomicMass('Zn') * formula.Zn) / mm
  if (formula.Ni) out.Ni = (atomicMass('Ni') * formula.Ni) / mm
  if (formula.Se) out.Se = (atomicMass('Se') * formula.Se) / mm
  if (formula.Bi) out.Bi = (atomicMass('Bi') * formula.Bi) / mm
  if (formula.Sb) out.Sb = (atomicMass('Sb') * formula.Sb) / mm
  if (formula.As) out.As = (atomicMass('As') * formula.As) / mm
  if (formula.Hg) out.Hg = (atomicMass('Hg') * formula.Hg) / mm
  if (formula.Cd) out.Cd = (atomicMass('Cd') * formula.Cd) / mm
  if (formula.Au) out.Au = (atomicMass('Au') * formula.Au) / mm
  if (formula.Ag) out.Ag = (atomicMass('Ag') * formula.Ag) / mm
  if (formula.Sn) out.Sn = (atomicMass('Sn') * formula.Sn) / mm
  if (formula.Te) out.Te = (atomicMass('Te') * formula.Te) / mm
  if (formula.C && formula.Ca) {
    out.C = (atomicMass('C') * formula.C) / mm
    out.CaO = (atomicMass('Ca') * formula.Ca) / mm
  }
  if (formula.C && formula.Mg) {
    out.C = (atomicMass('C') * formula.C) / mm
    out.MgO = (atomicMass('Mg') * formula.Mg) / mm
  }
  return out
}

const PHASE_FORMULAS: Record<ConcentratePhaseKey, Record<string, number>> = {
  CuFeS2: { Cu: 1, Fe: 1, S: 2 },
  CuS: { Cu: 1, S: 1 },
  Cu2S: { Cu: 2, S: 1 },
  FeS2: { Fe: 1, S: 2 },
  FeS: { Fe: 1, S: 1 },
  SiO2: { Si: 1, O: 2 },
  CaCO3: { Ca: 1, C: 1, O: 3 },
  CaO: { Ca: 1, O: 1 },
  MgCO3: { Mg: 1, C: 1, O: 3 },
  MgO: { Mg: 1, O: 1 },
  Al2O3: { Al: 2, O: 3 },
  PbS: { Pb: 1, S: 1 },
  ZnS: { Zn: 1, S: 1 },
  NiS: { Ni: 1, S: 1 },
  Se: { Se: 1 },
  Bi2S3: { Bi: 2, S: 3 },
  Sb2S3: { Sb: 2, S: 3 },
  As2S3: { As: 2, S: 3 },
  Hg: { Hg: 1 },
  Cd: { Cd: 1 },
  Au: { Au: 1 },
  Ag: { Ag: 1 },
  Sn: { Sn: 1 },
  Te: { Te: 1 },
  Other: {},
}

function solve3x3(matrix: number[][], vector: number[]): [number, number, number] | null {
  const det =
    matrix[0]![0]! * (matrix[1]![1]! * matrix[2]![2]! - matrix[1]![2]! * matrix[2]![1]!) -
    matrix[0]![1]! * (matrix[1]![0]! * matrix[2]![2]! - matrix[1]![2]! * matrix[2]![0]!) +
    matrix[0]![2]! * (matrix[1]![0]! * matrix[2]![1]! - matrix[1]![1]! * matrix[2]![0]!)
  if (Math.abs(det) < 1e-12) return null
  const replaceCol = (colIndex: number, col: number[]) => {
    const m = matrix.map((row) => [...row])
    for (let i = 0; i < 3; i++) m[i]![colIndex] = col[i]!
    return m
  }
  const detCol = (colIndex: number) => {
    const m = replaceCol(colIndex, vector)
    return (
      m[0]![0]! * (m[1]![1]! * m[2]![2]! - m[1]![2]! * m[2]![1]!) -
      m[0]![1]! * (m[1]![0]! * m[2]![2]! - m[1]![2]! * m[2]![0]!) +
      m[0]![2]! * (m[1]![0]! * m[2]![1]! - m[1]![1]! * m[2]![0]!)
    )
  }
  return [detCol(0) / det, detCol(1) / det, detCol(2) / det]
}

function solveCuFeS(
  pool: Pool,
  usePyrite: boolean
): { CuFeS2: number; Cu2S: number; CuS: number; FeS2: number; FeS: number } {
  const fCuFeS2 = phaseElementFractions(PHASE_FORMULAS.CuFeS2)
  const fCu2S = phaseElementFractions(PHASE_FORMULAS.Cu2S)
  const fFeS = phaseElementFractions(PHASE_FORMULAS.FeS)
  const fFeS2 = phaseElementFractions(PHASE_FORMULAS.FeS2)

  if (!usePyrite) {
    const matrix = [
      [fCuFeS2.Cu ?? 0, fCu2S.Cu ?? 0, 0],
      [fCuFeS2.Fe ?? 0, 0, fFeS.Fe ?? 0],
      [fCuFeS2.S ?? 0, fCu2S.S ?? 0, fFeS.S ?? 0],
    ]
    const sol = solve3x3(matrix, [pool.Cu, pool.Fe, pool.S])
    if (!sol) return { CuFeS2: 0, Cu2S: 0, CuS: 0, FeS2: 0, FeS: 0 }
    const [x, y, z] = sol
    if (x >= -1e-9 && y >= -1e-9 && z >= -1e-9) {
      return { CuFeS2: Math.max(0, x), Cu2S: Math.max(0, y), CuS: 0, FeS2: 0, FeS: Math.max(0, z) }
    }
  }

  const matrix = [
    [fCuFeS2.Cu ?? 0, 0, 0],
    [fCuFeS2.Fe ?? 0, fFeS2.Fe ?? 0, fFeS.Fe ?? 0],
    [fCuFeS2.S ?? 0, fFeS2.S ?? 0, fFeS.S ?? 0],
  ]
  const sol = solve3x3(matrix, [pool.Cu, pool.Fe, pool.S])
  if (!sol) return { CuFeS2: 0, Cu2S: 0, CuS: 0, FeS2: 0, FeS: 0 }
  const [x, y, z] = sol
  return {
    CuFeS2: Math.max(0, x),
    Cu2S: 0,
    CuS: 0,
    FeS2: Math.max(0, y),
    FeS: Math.max(0, z),
  }
}

/** 是否应采用精矿规范化物相分配（含 FeO 列或西南铜内置精矿） */
export function shouldUseConcentrateNormativeAllocator(ratios: CopperRatios): boolean {
  const r = normalizeCopperRatios(ratios)
  return (r['FeO(氧化亚铁)'] ?? 0) !== 0 || (r['MgO(氧化镁)'] ?? 0) > 0
}

export function allocateConcentratePhases(ratios: CopperRatios): Record<ConcentratePhaseKey, number> {
  const out = Object.fromEntries(CONCENTRATE_NORM_PHASE_ORDER.map((k) => [k, 0])) as Record<ConcentratePhaseKey, number>
  const pool = displayRatiosToPool(ratios)
  const originalOther = normalizeCopperRatios(ratios)['Other(其他)'] ?? 0

  const alloc = (key: ConcentratePhaseKey, elementMass: number, elementSymbol: string, phaseKey: keyof typeof MM, count = 1) => {
    const mass = phaseMassFromElement(elementMass, phaseKey, elementSymbol, count)
    if (mass <= 0) return
    out[key] = mass
    subtractPhaseConsumption(pool, mass, phaseElementFractions(PHASE_FORMULAS[key]))
  }

  alloc('PbS', pool.Pb, 'Pb', 'PbS')
  alloc('ZnS', pool.Zn, 'Zn', 'ZnS')
  alloc('NiS', pool.Ni, 'Ni', 'NiS')
  alloc('Bi2S3', pool.Bi, 'Bi', 'Bi2S3', 2)
  alloc('Sb2S3', pool.Sb, 'Sb', 'Sb2S3', 2)
  alloc('As2S3', pool.As, 'As', 'As2S3', 2)
  if (pool.Se > 0) {
    out.Se = pool.Se
    pool.Se = 0
  }
  if (pool.Hg > 0) {
    out.Hg = pool.Hg
    pool.Hg = 0
  }
  if (pool.Cd > 0) {
    out.Cd = pool.Cd
    pool.Cd = 0
  }
  if (pool.Au > 0) {
    out.Au = pool.Au
    pool.Au = 0
  }
  if (pool.Ag > 0) {
    out.Ag = pool.Ag
    pool.Ag = 0
  }
  if (pool.Sn > 0) {
    out.Sn = pool.Sn
    pool.Sn = 0
  }
  if (pool.Te > 0) {
    out.Te = pool.Te
    pool.Te = 0
  }

  const caInCao = pool.CaO * elementMassFraction({ Ca: 1, O: 1 }, 'Ca')
  const mgInMgo = pool.MgO * elementMassFraction({ Mg: 1, O: 1 }, 'Mg')
  const caMol = caInCao / atomicMass('Ca')
  const mgMol = mgInMgo / atomicMass('Mg')
  const cMol = pool.C / atomicMass('C')
  const denom = caMol + mgMol
  const caShare = denom > 1e-12 ? caMol / denom : 1
  const caco3Mol = cMol * caShare
  const mgco3Mol = cMol * (1 - caShare)
  if (caco3Mol > 0) {
    const mass = caco3Mol * MM.CaCO3
    out.CaCO3 = mass
    pool.C = Math.max(0, pool.C - mass * elementMassFraction({ Ca: 1, C: 1, O: 3 }, 'C'))
    pool.CaO = Math.max(0, pool.CaO - mass * elementMassFraction({ Ca: 1, C: 1, O: 3 }, 'Ca') * (MM.CaO / atomicMass('Ca')))
  }
  if (mgco3Mol > 0) {
    const mass = mgco3Mol * MM.MgCO3
    out.MgCO3 = mass
    pool.C = Math.max(0, pool.C - mass * elementMassFraction({ Mg: 1, C: 1, O: 3 }, 'C'))
    pool.MgO = Math.max(0, pool.MgO - mass * elementMassFraction({ Mg: 1, C: 1, O: 3 }, 'Mg') * (MM.MgO / atomicMass('Mg')))
  }
  if (pool.CaO > 0) {
    out.CaO = pool.CaO
    pool.CaO = 0
  }
  if (pool.MgO > 0) {
    out.MgO = pool.MgO
    pool.MgO = 0
  }
  pool.C = 0

  if (pool.SiO2 > 0) {
    out.SiO2 = pool.SiO2
    pool.SiO2 = 0
  }
  if (pool.Al2O3 > 0) {
    out.Al2O3 = pool.Al2O3
    pool.Al2O3 = 0
  }

  let cuFeS = solveCuFeS(pool, false)
  if (cuFeS.Cu2S < -1e-6) {
    cuFeS = solveCuFeS(pool, true)
  }
  out.CuFeS2 = cuFeS.CuFeS2
  out.Cu2S = cuFeS.Cu2S
  out.CuS = cuFeS.CuS
  out.FeS2 = cuFeS.FeS2
  out.FeS = cuFeS.FeS

  const phaseSum = CONCENTRATE_NORM_PHASE_ORDER.reduce((s, k) => (k === 'Other' ? s : s + out[k]), 0)
  const residual = Math.max(0, 100 - phaseSum)
  out.Other = Math.max(originalOther, residual)

  const total = CONCENTRATE_NORM_PHASE_ORDER.reduce((s, k) => s + out[k], 0)
  if (total > 1e-9 && Math.abs(total - 100) > 1e-6) {
    const scale = 100 / total
    for (const key of CONCENTRATE_NORM_PHASE_ORDER) {
      out[key] *= scale
    }
  }

  return out
}

/** 规范化物相 w% → 物相行 id 映射（custom:Formula 与 builtin 键） */
export function concentratePhasesToRowContents(
  phases: Record<ConcentratePhaseKey, number>
): Record<string, number> {
  const contents: Record<string, number> = {}
  for (const [key, value] of Object.entries(phases) as [ConcentratePhaseKey, number][]) {
    if (value <= 1e-12) continue
    if (key === 'Other') {
      contents.Other = value
      continue
    }
    contents[`custom:${key}`] = value
  }
  return contents
}

export function concentratePhaseFractionsForFormula(
  formula: string
): Partial<Record<CopperElementKey, number>> {
  const key = formula.trim() as ConcentratePhaseKey
  if (!(key in PHASE_FORMULAS)) return {}
  const mm = compoundMolarMass(PHASE_FORMULAS[key])
  if (mm <= 0) return {}
  const fractions: Partial<Record<CopperElementKey, number>> = {}
  const f = PHASE_FORMULAS[key]
  if (f.Cu) fractions['Cu(铜)'] = (atomicMass('Cu') * f.Cu) / mm
  if (f.Fe) fractions['Fe(铁)'] = (atomicMass('Fe') * f.Fe) / mm
  if (f.S) fractions['S (硫)'] = (atomicMass('S') * f.S) / mm
  if (f.Si) fractions['SiO₂(二氧化硅)'] = MM.SiO2 / mm
  if (f.Ca && f.C && f.O) {
    fractions['CaO(氧化钙)'] = (atomicMass('Ca') * f.Ca) / mm * (MM.CaO / atomicMass('Ca'))
    fractions['C (碳)'] = (atomicMass('C') * f.C) / mm
  } else if (f.Ca) {
    fractions['CaO(氧化钙)'] = MM.CaO / mm
  }
  if (f.Mg && f.C) {
    fractions['MgO(氧化镁)'] = (atomicMass('Mg') * f.Mg) / mm * (MM.MgO / atomicMass('Mg'))
    fractions['C (碳)'] = (atomicMass('C') * f.C) / mm
  } else if (f.Mg) {
    fractions['MgO(氧化镁)'] = MM.MgO / mm
  }
  if (f.Al) fractions['Al₂O₃(三氧化二铝)'] = MM.Al2O3 / mm
  if (f.Pb) fractions['Pb(铅)'] = (atomicMass('Pb') * f.Pb) / mm
  if (f.Zn) fractions['Zn(锌)'] = (atomicMass('Zn') * f.Zn) / mm
  if (f.Ni) fractions['Ni(镍)'] = (atomicMass('Ni') * f.Ni) / mm
  if (f.Se) fractions['Se(硒)'] = (atomicMass('Se') * f.Se) / mm
  if (f.Bi) fractions['Bi(铋)'] = (atomicMass('Bi') * f.Bi) / mm
  if (f.Sb) fractions['Sb(锑)'] = (atomicMass('Sb') * f.Sb) / mm
  if (f.As) fractions['As(砷)'] = (atomicMass('As') * f.As) / mm
  if (f.Hg) fractions['Hg(汞)'] = (atomicMass('Hg') * f.Hg) / mm
  if (f.Cd) fractions['Cd(镉)'] = (atomicMass('Cd') * f.Cd) / mm
  if (f.Au) fractions['Au(金)'] = (atomicMass('Au') * f.Au) / mm
  if (f.Ag) fractions['Ag(银)'] = (atomicMass('Ag') * f.Ag) / mm
  if (f.Sn) fractions['Sn(锡)'] = (atomicMass('Sn') * f.Sn) / mm
  if (f.Te) fractions['Te(碲)'] = (atomicMass('Te') * f.Te) / mm
  return fractions
}
