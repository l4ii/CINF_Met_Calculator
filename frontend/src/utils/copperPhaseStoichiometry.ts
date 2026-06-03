import {
  COMPOUND_MOLAR_MASS,
  ELEMENT_N_TO_N2,
  ELEMENT_O_TO_O2,
  atomicMass,
  compoundMolarMass,
  elementMassFraction,
  type FormulaComposition,
} from './atomicMass.ts'
const MM = COMPOUND_MOLAR_MASS

export type BuiltinPhaseKey =
  | 'Cu2S'
  | 'FeS'
  | 'S'
  | 'Cu2O'
  | 'FeO'
  | 'Fe2O3'
  | 'Fe3O4'
  | 'SiO2'
  | 'CaO'
  | 'Al2O3'
  | 'PbO'
  | 'As2O3'
  | 'Sb2O3'
  | 'ZnO'
  | 'C'

/** 物相中主元素/化合物质量分数（基于统一原子质量库） */
export const COPPER_BUILTIN_PHASE_FRACTIONS: Record<string, Partial<Record<string, number>>> = {
  Cu2S: {
    'Cu(铜)': elementMassFraction({ Cu: 2, S: 1 }, 'Cu'),
    'S (硫)': elementMassFraction({ Cu: 2, S: 1 }, 'S'),
  },
  FeS: {
    'Fe(铁)': elementMassFraction({ Fe: 1, S: 1 }, 'Fe'),
    'S (硫)': elementMassFraction({ Fe: 1, S: 1 }, 'S'),
  },
  S: { 'S (硫)': 1 },
  Cu2O: {
    'Cu(铜)': elementMassFraction({ Cu: 2, O: 1 }, 'Cu'),
    'O(氧)': elementMassFraction({ Cu: 2, O: 1 }, 'O'),
  },
  FeO: {
    'Fe(铁)': elementMassFraction({ Fe: 1, O: 1 }, 'Fe'),
    'O(氧)': elementMassFraction({ Fe: 1, O: 1 }, 'O'),
  },
  Fe2O3: {
    'Fe(铁)': elementMassFraction({ Fe: 2, O: 3 }, 'Fe'),
    'O(氧)': elementMassFraction({ Fe: 2, O: 3 }, 'O'),
  },
  Fe3O4: {
    'Fe(铁)': elementMassFraction({ Fe: 3, O: 4 }, 'Fe'),
    'O(氧)': elementMassFraction({ Fe: 3, O: 4 }, 'O'),
  },
  SiO2: { 'SiO₂(二氧化硅)': 1 },
  CaO: { 'CaO(氧化钙)': 1 },
  Al2O3: { 'Al₂O₃(三氧化二铝)': 1 },
  PbO: {
    'Pb(铅)': elementMassFraction({ Pb: 1, O: 1 }, 'Pb'),
    'O(氧)': elementMassFraction({ Pb: 1, O: 1 }, 'O'),
  },
  As2O3: {
    'As(砷)': elementMassFraction({ As: 2, O: 3 }, 'As'),
    'O(氧)': elementMassFraction({ As: 2, O: 3 }, 'O'),
  },
  Sb2O3: {
    'Sb(锑)': elementMassFraction({ Sb: 2, O: 3 }, 'Sb'),
    'O(氧)': elementMassFraction({ Sb: 2, O: 3 }, 'O'),
  },
  ZnO: {
    'Zn(锌)': elementMassFraction({ Zn: 1, O: 1 }, 'Zn'),
    'O(氧)': elementMassFraction({ Zn: 1, O: 1 }, 'O'),
  },
  C: { 'C (碳)': 1 },
}

/** 物相中氧质量分数（SiO₂/CaO/Al₂O₃ 中的氧不计入 O₂ 列） */
export const COPPER_PHASE_O2_FACTORS: Partial<Record<string, number>> = {
  Cu2O: COPPER_BUILTIN_PHASE_FRACTIONS.Cu2O['O(氧)'] ?? 0,
  FeO: COPPER_BUILTIN_PHASE_FRACTIONS.FeO['O(氧)'] ?? 0,
  Fe2O3: COPPER_BUILTIN_PHASE_FRACTIONS.Fe2O3['O(氧)'] ?? 0,
  Fe3O4: COPPER_BUILTIN_PHASE_FRACTIONS.Fe3O4['O(氧)'] ?? 0,
  PbO: COPPER_BUILTIN_PHASE_FRACTIONS.PbO['O(氧)'] ?? 0,
  As2O3: COPPER_BUILTIN_PHASE_FRACTIONS.As2O3['O(氧)'] ?? 0,
  Sb2O3: COPPER_BUILTIN_PHASE_FRACTIONS.Sb2O3['O(氧)'] ?? 0,
  ZnO: COPPER_BUILTIN_PHASE_FRACTIONS.ZnO['O(氧)'] ?? 0,
}

export const COPPER_PHASE_SULFUR_FRACTIONS: Partial<Record<string, number>> = {
  Cu2S: COPPER_BUILTIN_PHASE_FRACTIONS.Cu2S['S (硫)'] ?? 0,
  FeS: COPPER_BUILTIN_PHASE_FRACTIONS.FeS['S (硫)'] ?? 0,
  S: 1,
}

export {
  MM as COPPER_PHASE_MOLAR_MASS,
  atomicMass,
  compoundMolarMass,
  elementMassFraction,
  ELEMENT_O_TO_O2,
  ELEMENT_N_TO_N2,
}

export function oxideMassFraction(oxideComposition: FormulaComposition, elementSymbol: string, elementCount = 1) {
  const oxideM = compoundMolarMass(oxideComposition)
  const elemM = atomicMass(elementSymbol)
  if (oxideM <= 0 || elemM <= 0) return 0
  return (elemM * elementCount) / oxideM
}

export const SI_TO_SIO2 = MM.SiO2 / atomicMass('Si')
export const CA_TO_CAO = MM.CaO / atomicMass('Ca')
export const AL_TO_AL2O3 = MM.Al2O3 / (2 * atomicMass('Al'))
