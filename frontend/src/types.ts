// 配料软件 - 冶炼类型、冶炼方法、Sheet 定义

/** Sheet ID（主内容区标签页） */
export type SheetId = 'raw_material' | 'product' | 'heat_balance' | 'furnace'

/** 冶炼方法 */
export interface SmeltMethod {
  id: string
  name: string
  smeltTypeId: string
  /** 方法简介，结合长沙有色院业绩推广 */
  description?: string
}

/** 冶炼类型 */
export interface SmeltType {
  id: string
  name: string
  methods: SmeltMethod[]
}

/** 选中的冶炼方法（用于 Sidebar 与主内容） */
export interface SelectedMethod {
  smeltTypeId: string
  smeltTypeName: string
  smeltMethodId: string
  smeltMethodName: string
  description?: string
}

/** 预设冶炼配置 */
export const SMELT_TYPES: SmeltType[] = [
  {
    id: 'cu',
    name: '铜冶炼',
    methods: [
      { id: 'oxy-side-blast', name: '富氧侧吹法', smeltTypeId: 'cu' },
    ],
  },
  {
    id: 'pb',
    name: '铅冶炼',
    methods: [
      { id: 'oxy-side-blast', name: '富氧侧吹法', smeltTypeId: 'pb' },
      { id: 'flash', name: '闪速熔炼法', smeltTypeId: 'pb' },
    ],
  },
  {
    id: 'zn',
    name: '锌冶炼',
    methods: [
      { id: 'oxy-side-blast', name: '富氧侧吹法', smeltTypeId: 'zn' },
    ],
  },
  {
    id: 'sb',
    name: '锑冶炼',
    methods: [
      { id: 'oxy-side-blast', name: '富氧侧吹法', smeltTypeId: 'sb' },
    ],
  },
]

/** Sheet 配置 */
export const SHEETS: { id: SheetId; name: string }[] = [
  { id: 'raw_material', name: '配料计算' },
  { id: 'product', name: '产出计算' },
  { id: 'heat_balance', name: '热平衡计算' },
  { id: 'furnace', name: '炉型计算' },
]
