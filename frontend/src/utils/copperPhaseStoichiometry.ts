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
  CuFeS2: {
    'Cu(铜)': elementMassFraction({ Cu: 1, Fe: 1, S: 2 }, 'Cu'),
    'Fe(铁)': elementMassFraction({ Cu: 1, Fe: 1, S: 2 }, 'Fe'),
    'S (硫)': elementMassFraction({ Cu: 1, Fe: 1, S: 2 }, 'S'),
  },
  CuS: {
    'Cu(铜)': elementMassFraction({ Cu: 1, S: 1 }, 'Cu'),
    'S (硫)': elementMassFraction({ Cu: 1, S: 1 }, 'S'),
  },
  FeS: {
    'Fe(铁)': elementMassFraction({ Fe: 1, S: 1 }, 'Fe'),
    'S (硫)': elementMassFraction({ Fe: 1, S: 1 }, 'S'),
  },
  FeS2: {
    'Fe(铁)': elementMassFraction({ Fe: 1, S: 2 }, 'Fe'),
    'S (硫)': elementMassFraction({ Fe: 1, S: 2 }, 'S'),
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
  // —— 侧吹炉产出物相扩展 ——
  NiO: {
    'Ni(镍)': elementMassFraction({ Ni: 1, O: 1 }, 'Ni'),
    'O(氧)': elementMassFraction({ Ni: 1, O: 1 }, 'O'),
  },
  SeO2: {
    'Se(硒)': elementMassFraction({ Se: 1, O: 2 }, 'Se'),
    'O(氧)': elementMassFraction({ Se: 1, O: 2 }, 'O'),
  },
  Bi2O3: {
    'Bi(铋)': elementMassFraction({ Bi: 2, O: 3 }, 'Bi'),
    'O(氧)': elementMassFraction({ Bi: 2, O: 3 }, 'O'),
  },
  SnO: {
    'Sn(锡)': elementMassFraction({ Sn: 1, O: 1 }, 'Sn'),
    'O(氧)': elementMassFraction({ Sn: 1, O: 1 }, 'O'),
  },
  MgO: { 'MgO(氧化镁)': 1 },
  PbS: {
    'Pb(铅)': elementMassFraction({ Pb: 1, S: 1 }, 'Pb'),
    'S (硫)': elementMassFraction({ Pb: 1, S: 1 }, 'S'),
  },
  ZnS: {
    'Zn(锌)': elementMassFraction({ Zn: 1, S: 1 }, 'Zn'),
    'S (硫)': elementMassFraction({ Zn: 1, S: 1 }, 'S'),
  },
  As2S3: {
    'As(砷)': elementMassFraction({ As: 2, S: 3 }, 'As'),
    'S (硫)': elementMassFraction({ As: 2, S: 3 }, 'S'),
  },
  Fe2SiO4: {
    'Fe(铁)': elementMassFraction({ Fe: 2, Si: 1, O: 4 }, 'Fe'),
    'SiO₂(二氧化硅)': elementMassFraction({ Fe: 2, Si: 1, O: 4 }, 'Si') * (MM.SiO2 / atomicMass('Si')),
    'O(氧)': elementMassFraction({ Fe: 2, Si: 1, O: 4 }, 'O'),
  },
  CaSiO3: {
    'CaO(氧化钙)': elementMassFraction({ Ca: 1, Si: 1, O: 3 }, 'Ca') * (MM.CaO / atomicMass('Ca')),
    'SiO₂(二氧化硅)': elementMassFraction({ Ca: 1, Si: 1, O: 3 }, 'Si') * (MM.SiO2 / atomicMass('Si')),
    'O(氧)': elementMassFraction({ Ca: 1, Si: 1, O: 3 }, 'O'),
  },
  MgSiO3: {
    'MgO(氧化镁)': elementMassFraction({ Mg: 1, Si: 1, O: 3 }, 'Mg') * (MM.MgO / atomicMass('Mg')),
    'SiO₂(二氧化硅)': elementMassFraction({ Mg: 1, Si: 1, O: 3 }, 'Si') * (MM.SiO2 / atomicMass('Si')),
    'O(氧)': elementMassFraction({ Mg: 1, Si: 1, O: 3 }, 'O'),
  },
  Mullite: {
    'Al₂O₃(三氧化二铝)':
      elementMassFraction({ Al: 6, Si: 2, O: 13 }, 'Al') * (MM.Al2O3 / (2 * atomicMass('Al'))),
    'SiO₂(二氧化硅)': elementMassFraction({ Al: 6, Si: 2, O: 13 }, 'Si') * (MM.SiO2 / atomicMass('Si')),
    'O(氧)': elementMassFraction({ Al: 6, Si: 2, O: 13 }, 'O'),
  },
  SO2: {
    'S (硫)': elementMassFraction({ S: 1, O: 2 }, 'S'),
    'O(氧)': elementMassFraction({ S: 1, O: 2 }, 'O'),
  },
  SO3: {
    'S (硫)': elementMassFraction({ S: 1, O: 3 }, 'S'),
    'O(氧)': elementMassFraction({ S: 1, O: 3 }, 'O'),
  },
  CO2: {
    'C (碳)': elementMassFraction({ C: 1, O: 2 }, 'C'),
    'O(氧)': elementMassFraction({ C: 1, O: 2 }, 'O'),
  },
  O2: { 'O(氧)': 1 },
  N2: { 'N(氮)': 1 },
  H2O: {
    'H(氢)': elementMassFraction({ H: 2, O: 1 }, 'H'),
    'O(氧)': elementMassFraction({ H: 2, O: 1 }, 'O'),
  },
  Hg: { 'Hg(汞)': 1 },
  Cu: { 'Cu(铜)': 1 },
  Ni: { 'Ni(镍)': 1 },
  Pb: { 'Pb(铅)': 1 },
  Zn: { 'Zn(锌)': 1 },
  Se: { 'Se(硒)': 1 },
  Bi: { 'Bi(铋)': 1 },
  Sb: { 'Sb(锑)': 1 },
  Cd: { 'Cd(镉)': 1 },
  Sn: { 'Sn(锡)': 1 },
  Au: { 'Au(金)': 1 },
  Ag: { 'Ag(银)': 1 },
  Te: { 'Te(碲)': 1 },
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
