/**
 * 元素标准原子质量 (g/mol)，IUPAC 2021，精确到小数点后 4 位。
 * 全软件原子质量与化合物摩尔质量均从此库调取。
 */
export const ATOMIC_MASS: Record<string, number> = {
  H: 1.0080,
  He: 4.0026,
  Li: 6.9400,
  Be: 9.0122,
  B: 10.8100,
  C: 12.0110,
  N: 14.0070,
  O: 15.9990,
  F: 18.9980,
  Ne: 20.1800,
  Na: 22.9900,
  Mg: 24.3050,
  Al: 26.9820,
  Si: 28.0850,
  P: 30.9740,
  S: 32.0660,
  Cl: 35.4500,
  Ar: 39.9480,
  K: 39.0980,
  Ca: 40.0780,
  Sc: 44.9560,
  Ti: 47.8670,
  V: 50.9420,
  Cr: 51.9960,
  Mn: 54.9380,
  Fe: 55.8450,
  Co: 58.9330,
  Ni: 58.6930,
  Cu: 63.5460,
  Zn: 65.3800,
  Ga: 69.7230,
  Ge: 72.6300,
  As: 74.9220,
  Se: 78.9710,
  Br: 79.9040,
  Kr: 83.7980,
  Rb: 85.4680,
  Sr: 87.6200,
  Y: 88.9060,
  Zr: 91.2240,
  Nb: 92.9060,
  Mo: 95.9500,
  Tc: 98.0000,
  Ru: 101.0700,
  Rh: 102.9100,
  Pd: 106.4200,
  Ag: 107.8680,
  Cd: 112.4140,
  In: 114.8180,
  Sn: 118.7100,
  Sb: 121.7600,
  Te: 127.6000,
  I: 126.9040,
  Xe: 131.2930,
  Cs: 132.9050,
  Ba: 137.3270,
  La: 138.9050,
  Ce: 140.1160,
  Pr: 140.9080,
  Nd: 144.2420,
  Pm: 145.0000,
  Sm: 150.3600,
  Eu: 151.9640,
  Gd: 157.2500,
  Tb: 158.9250,
  Dy: 162.5000,
  Ho: 164.9300,
  Er: 167.2590,
  Tm: 168.9340,
  Yb: 173.0450,
  Lu: 174.9670,
  Hf: 178.4900,
  Ta: 180.9480,
  W: 183.8400,
  Re: 186.2070,
  Os: 190.2300,
  Ir: 192.2170,
  Pt: 195.0840,
  Au: 196.9670,
  Hg: 200.5920,
  Tl: 204.3800,
  Pb: 207.2000,
  Bi: 208.9800,
  Po: 209.0000,
  At: 210.0000,
  Rn: 222.0000,
  Fr: 223.0000,
  Ra: 226.0000,
  Ac: 227.0000,
  Th: 232.0380,
  Pa: 231.0360,
  U: 238.0290,
  Np: 237.0000,
  Pu: 244.0000,
  Am: 243.0000,
  Cm: 247.0000,
  Bk: 247.0000,
  Cf: 251.0000,
  Es: 252.0000,
  Fm: 257.0000,
  Md: 258.0000,
  No: 259.0000,
  Lr: 266.0000,
  Rf: 267.0000,
  Db: 268.0000,
  Sg: 269.0000,
  Bh: 270.0000,
  Hs: 269.0000,
  Mt: 278.0000,
  Ds: 281.0000,
  Rg: 282.0000,
  Cn: 285.0000,
  Nh: 286.0000,
  Fl: 289.0000,
  Mc: 289.0000,
  Lv: 293.0000,
  Ts: 294.0000,
  Og: 294.0000,
}

export const ELEMENT_SYMBOLS = Object.keys(ATOMIC_MASS).sort((a, b) => b.length - a.length)

export function atomicMass(symbol: string): number {
  const canonical = ELEMENT_SYMBOLS.find((s) => s.toLowerCase() === symbol.toLowerCase())
  return canonical ? ATOMIC_MASS[canonical] : 0
}

export type FormulaComposition = Record<string, number>

export function compoundMolarMass(composition: FormulaComposition): number {
  let total = 0
  for (const [symbol, count] of Object.entries(composition)) {
    total += atomicMass(symbol) * count
  }
  return total
}

/** 元素在化合物中的质量分数 (0–1) */
export function elementMassFraction(composition: FormulaComposition, elementSymbol: string): number {
  const mm = compoundMolarMass(composition)
  if (mm <= 0) return 0
  const canonical = ELEMENT_SYMBOLS.find((s) => s.toLowerCase() === elementSymbol.toLowerCase())
  if (!canonical) return 0
  const count = composition[canonical] ?? composition[elementSymbol] ?? 0
  return (atomicMass(canonical) * count) / mm
}

/** 单质/化合物摩尔质量快捷表（由原子质量推导，供配料模型高频使用） */
export const COMPOUND_MOLAR_MASS = {
  CuFeS2: compoundMolarMass({ Cu: 1, Fe: 1, S: 2 }),
  CuS: compoundMolarMass({ Cu: 1, S: 1 }),
  Cu2S: compoundMolarMass({ Cu: 2, S: 1 }),
  FeS: compoundMolarMass({ Fe: 1, S: 1 }),
  FeS2: compoundMolarMass({ Fe: 1, S: 2 }),
  CaCO3: compoundMolarMass({ Ca: 1, C: 1, O: 3 }),
  MgCO3: compoundMolarMass({ Mg: 1, C: 1, O: 3 }),
  MgO: compoundMolarMass({ Mg: 1, O: 1 }),
  PbS: compoundMolarMass({ Pb: 1, S: 1 }),
  ZnS: compoundMolarMass({ Zn: 1, S: 1 }),
  NiS: compoundMolarMass({ Ni: 1, S: 1 }),
  Bi2S3: compoundMolarMass({ Bi: 2, S: 3 }),
  As2S3: compoundMolarMass({ As: 2, S: 3 }),
  Cu2O: compoundMolarMass({ Cu: 2, O: 1 }),
  CuO: compoundMolarMass({ Cu: 1, O: 1 }),
  FeO: compoundMolarMass({ Fe: 1, O: 1 }),
  Fe2O3: compoundMolarMass({ Fe: 2, O: 3 }),
  Fe3O4: compoundMolarMass({ Fe: 3, O: 4 }),
  SiO2: compoundMolarMass({ Si: 1, O: 2 }),
  CaO: compoundMolarMass({ Ca: 1, O: 1 }),
  Al2O3: compoundMolarMass({ Al: 2, O: 3 }),
  Sb2S3: compoundMolarMass({ Sb: 2, S: 3 }),
  PbO: compoundMolarMass({ Pb: 1, O: 1 }),
  As2O3: compoundMolarMass({ As: 2, O: 3 }),
  Sb2O3: compoundMolarMass({ Sb: 2, O: 3 }),
  ZnO: compoundMolarMass({ Zn: 1, O: 1 }),
  SO2: compoundMolarMass({ S: 1, O: 2 }),
  CO2: compoundMolarMass({ C: 1, O: 2 }),
  O2: compoundMolarMass({ O: 2 }),
  N2: compoundMolarMass({ N: 2 }),
} as const

/** 元素质量 → 氧化物质量（elementCount 个该元素原子 per 分子） */
export function oxideMassFromElement(
  elementMass: number,
  elementSymbol: string,
  oxideComposition: FormulaComposition,
  elementCount = 1
) {
  if (elementMass <= 0) return 0
  const elemM = atomicMass(elementSymbol)
  const oxideM = compoundMolarMass(oxideComposition)
  if (elemM <= 0 || oxideM <= 0) return 0
  return elementMass * (oxideM / (elementCount * elemM))
}

/** 元素氧质量分数 → O₂ 分子质量分数（O₂ 中 O 占 16/32） */
export const ELEMENT_O_TO_O2 = COMPOUND_MOLAR_MASS.O2 / atomicMass('O')

/** 元素氮质量分数 → N₂ 分子质量分数 */
export const ELEMENT_N_TO_N2 = COMPOUND_MOLAR_MASS.N2 / atomicMass('N')

// Common oxide conversion factors used across modules.
export const SI_TO_SIO2 = COMPOUND_MOLAR_MASS.SiO2 / atomicMass('Si')
export const CA_TO_CAO = COMPOUND_MOLAR_MASS.CaO / atomicMass('Ca')
export const FE_TO_FEO = COMPOUND_MOLAR_MASS.FeO / atomicMass('Fe')
