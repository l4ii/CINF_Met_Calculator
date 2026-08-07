// 配料软件 - 冶炼类型、冶炼方法、Sheet 定义

/** Sheet ID（主内容区标签页） */
export type SheetId =
  | 'raw_material'
  | 'product'
  | 'heat_balance'
  | 'furnace'
  | 'cu_smelting'
  | 'cu_smelting_equipment'
  | 'cu_converting'
  | 'cu_converting_equipment'
  | 'cu_refining'
  | 'cu_refining_equipment'
  | 'cu_summary'
  | 'cu_equipment'

/** 冶炼方法 */
export interface SmeltMethod {
  id: string
  name: string
  smeltTypeId: string
  sectionId?: string
  /** 方法简介，结合长沙有色院业绩推广 */
  description?: string
}

/** 冶炼工艺分区 */
export interface SmeltSection {
  id: string
  name: string
  methods: SmeltMethod[]
}

/** 冶炼类型 */
export interface SmeltType {
  id: string
  name: string
  sections: SmeltSection[]
  methods?: SmeltMethod[]
}

/** 选中的冶炼方法（用于 Sidebar 与主内容） */
export interface SelectedMethod {
  smeltTypeId: string
  smeltTypeName: string
  sectionId?: string
  sectionName?: string
  smeltMethodId: string
  smeltMethodName: string
  description?: string
}

/** 预设冶炼配置 */
export const SMELT_TYPES: SmeltType[] = [
  {
    id: 'cu',
    name: '铜冶炼',
    sections: [
      {
        id: 'pyro',
        name: '火法冶炼',
        methods: [
          { id: 'side-blown', name: '侧吹炉', smeltTypeId: 'cu', sectionId: 'pyro' },
          { id: 'flash', name: '闪速炉', smeltTypeId: 'cu', sectionId: 'pyro' },
        ],
      },
      {
        id: 'hydro',
        name: '湿法冶炼',
        methods: [],
      },
    ],
  },
  {
    id: 'pb',
    name: '铅冶炼',
    sections: [
      {
        id: 'pyro',
        name: '火法冶炼',
        methods: [
          { id: 'side-blown', name: '侧吹炉', smeltTypeId: 'pb', sectionId: 'pyro' },
          { id: 'ausmelt', name: '奥斯麦特炉', smeltTypeId: 'pb', sectionId: 'pyro' },
          { id: 'flash', name: '闪速炉', smeltTypeId: 'pb', sectionId: 'pyro' },
          { id: 'kivcet', name: '基夫赛特炉', smeltTypeId: 'pb', sectionId: 'pyro' },
        ],
      },
    ],
  },
  {
    id: 'zn',
    name: '锌冶炼',
    sections: [
      {
        id: 'pyro',
        name: '火法冶炼',
        methods: [
          { id: 'isp', name: 'ISP炉', smeltTypeId: 'zn', sectionId: 'pyro' },
          { id: 'electric', name: '电炉', smeltTypeId: 'zn', sectionId: 'pyro' },
        ],
      },
      {
        id: 'hydro',
        name: '湿法冶炼',
        methods: [
          { id: 'pressure-leaching', name: '加压浸出', smeltTypeId: 'zn', sectionId: 'hydro' },
          { id: 'atmospheric-leaching', name: '常压浸出', smeltTypeId: 'zn', sectionId: 'hydro' },
        ],
      },
    ],
  },
  {
    id: 'sb',
    name: '锑冶炼',
    sections: [
      {
        id: 'pyro',
        name: '火法冶炼',
        methods: [
          { id: 'side-blown', name: '侧吹炉', smeltTypeId: 'sb', sectionId: 'pyro' },
        ],
      },
    ],
  },
]

export type SmeltAlgorithmKind = 'copper-side-blown' | 'antimony-side-blown' | 'none'

export function getSmeltTypeMethods(smeltType: SmeltType): SmeltMethod[] {
  return smeltType.sections.flatMap((section) => section.methods)
}

export function getSelectedSmeltAlgorithm(method?: Pick<SelectedMethod, 'smeltTypeId' | 'sectionId' | 'smeltMethodId'> | null): SmeltAlgorithmKind {
  if (!method) return 'none'
  const isPyro = method.sectionId == null || method.sectionId === 'pyro'
  const isSideBlown = method.smeltMethodId === 'side-blown' || method.smeltMethodId === 'oxy-side-blast'
  if (method.smeltTypeId === 'cu' && isPyro && isSideBlown) return 'copper-side-blown'
  if (method.smeltTypeId === 'sb' && isPyro && isSideBlown) return 'antimony-side-blown'
  return 'none'
}

/** Sheet 配置 */
export const SHEETS: { id: SheetId; name: string }[] = [
  { id: 'raw_material', name: '配矿计算' },
  { id: 'product', name: '产出计算' },
  { id: 'heat_balance', name: '热平衡计算' },
  { id: 'furnace', name: '炉型计算' },
]

export const COPPER_SHEETS: { id: SheetId; name: string }[] = [
  { id: 'cu_smelting', name: '熔炼' },
  { id: 'cu_smelting_equipment', name: '熔炼设备选型' },
  { id: 'cu_converting', name: '吹炼' },
  { id: 'cu_converting_equipment', name: '吹炼设备选型' },
  { id: 'cu_refining', name: '精炼' },
  { id: 'cu_refining_equipment', name: '精炼设备选型' },
  { id: 'cu_summary', name: '案例汇总' },
]
