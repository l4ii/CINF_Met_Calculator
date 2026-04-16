/** 锑冶炼 - 原料与熔剂配置（参考 AntimonyMix Pro） */

export interface ElementRatios {
  [key: string]: number // 元素名: 百分比(0-100)
}

export interface BaseMaterial {
  id: number
  name: string
  ratios: ElementRatios
}

export const BASE_ELEMENTS: Record<number, BaseMaterial> = {
  1: {
    id: 1,
    name: '锑精矿',
    ratios: {
      'O (氧)': 7.74, 'N (氮)': 0, 'Sb(锑)': 59.18, 'S (硫)': 23.91,
      'Fe(铁)': 1.33, 'Pb(铅)': 0.33, 'As(砷)': 0.57, 'Zn(锌)': 0.07,
      'Cu(铜)': 0.02, 'Si(硅)': 3.25, 'Ca(钙)': 1.19, 'Al(铝)': 0.69,
      'Ag(银)': 0, 'Au(金)': 0, 'C (碳)': 0, 'Other(其他)': 1.72,
    },
  },
  2: {
    id: 2,
    name: '锑金精矿',
    ratios: {
      'O (氧)': 0, 'N (氮)': 0, 'Sb(锑)': 40, 'S (硫)': 20,
      'Fe(铁)': 20, 'Pb(铅)': 0, 'As(砷)': 0, 'Zn(锌)': 5,
      'Cu(铜)': 5, 'Si(硅)': 5, 'Ca(钙)': 0, 'Al(铝)': 0,
      'Ag(银)': 0, 'Au(金)': 0, 'C (碳)': 0, 'Other(其他)': 5,
    },
  },
  3: {
    id: 3,
    name: '锑锍',
    ratios: {
      'O (氧)': 0, 'N (氮)': 0, 'Sb(锑)': 30, 'S (硫)': 50,
      'Fe(铁)': 10, 'Pb(铅)': 0, 'As(砷)': 0, 'Zn(锌)': 0,
      'Cu(铜)': 5, 'Si(硅)': 5, 'Ca(钙)': 0, 'Al(铝)': 0,
      'Ag(银)': 0, 'Au(金)': 0, 'C (碳)': 0, 'Other(其他)': 0,
    },
  },
  4: {
    id: 4,
    name: '铅锑混合精矿',
    ratios: {
      'O (氧)': 2.44, 'N (氮)': 0, 'Sb(锑)': 34.72, 'S (硫)': 33.96,
      'Fe(铁)': 19.33, 'Pb(铅)': 0.2, 'As(砷)': 1.06, 'Zn(锌)': 0.66,
      'Cu(铜)': 0.26, 'Si(硅)': 1.63, 'Ca(钙)': 0.42, 'Al(铝)': 0.47,
      'Ag(银)': 0.07, 'Au(金)': 0.02, 'C (碳)': 0, 'Other(其他)': 4.76,
    },
  },
  5: {
    id: 5,
    name: '泡渣',
    ratios: {
      'O (氧)': 2.44, 'N (氮)': 0, 'Sb(锑)': 34.72, 'S (硫)': 33.96,
      'Fe(铁)': 19.33, 'Pb(铅)': 0.2, 'As(砷)': 1.06, 'Zn(锌)': 0.66,
      'Cu(铜)': 0.26, 'Si(硅)': 1.63, 'Ca(钙)': 0.42, 'Al(铝)': 0.47,
      'Ag(银)': 0.07, 'Au(金)': 0.02, 'C (碳)': 0, 'Other(其他)': 4.76,
    },
  },
}

/** 熔剂：Fe(铁)、SiO₂(二氧化硅)、CaO(氧化钙) 百分比 */
export const TWO_MATERIALS: Record<string, ElementRatios> = {
  石灰: { 'Fe(铁)': 0, 'SiO₂(二氧化硅)': 0, 'CaO(氧化钙)': 85.05 },
  铁矿石: { 'Fe(铁)': 59.94, 'SiO₂(二氧化硅)': 6, 'CaO(氧化钙)': 0 },
}

/** 原料默认单价 (万元/吨) */
export const RAW_MATERIAL_DEFAULT_PRICES: Record<string, number> = {
  锑精矿: 14,
  锑金精矿: 15,
  锑锍: 9,
  铅锑混合精矿: 8,
  泡渣: 0.8,
}

/** 熔剂默认单价 (元/吨) */
export const SOLVENT_DEFAULT_PRICES: Record<string, number> = {
  石灰: 550,
  铁矿石: 750,
}

/** 摩尔质量 (g/mol) */
export const MOLAR_MASS = {
  Sb: 121.76,
  Fe: 55.845,
  S: 32.06,
  Sb2S3: 339.69,
  FeS: 87.91,
  FeS2: 119.98,
  O2: 32,
  N2: 28.02,
}
