import type { CopperElementKey } from './copperWorkflowCalc.ts'

/** MetCal 元素/氧化物短名 → 本软件元素键 */
export const METCAL_TO_COPPER_ELEMENT: Record<string, CopperElementKey> = {
  Cu: 'Cu(铜)',
  Fe: 'Fe(铁)',
  S: 'S (硫)',
  SiO2: 'SiO₂(二氧化硅)',
  CaO: 'CaO(氧化钙)',
  MgO: 'MgO(氧化镁)',
  Al2O3: 'Al₂O₃(三氧化二铝)',
  Pb: 'Pb(铅)',
  Zn: 'Zn(锌)',
  As: 'As(砷)',
  Ag: 'Ag(银)',
  Au: 'Au(金)',
  Sb: 'Sb(锑)',
  Ni: 'Ni(镍)',
  Se: 'Se(硒)',
  Bi: 'Bi(铋)',
  Hg: 'Hg(汞)',
  Sn: 'Sn(锡)',
  Te: 'Te(碲)',
  Cd: 'Cd(镉)',
  H: 'H(氢)',
  O: 'O(氧)',
  N: 'N(氮)',
  C: 'C (碳)',
  Other: 'Other(其他)',
}

/** 本软件元素键 → MetCal 短名 */
export const COPPER_TO_METCAL_ELEMENT: Partial<Record<CopperElementKey, string>> = Object.fromEntries(
  Object.entries(METCAL_TO_COPPER_ELEMENT).map(([metcal, copper]) => [copper, metcal])
) as Partial<Record<CopperElementKey, string>>

export const METCAL_MIX_FEED_STREAM_NAMES = [
  '系统内精矿',
  '国内外购矿',
  '进口铜精矿',
  '边贸矿',
] as const

export type MetcalMixFeedStreamName = (typeof METCAL_MIX_FEED_STREAM_NAMES)[number]

/**
 * 熔炼入炉「其他」固体（渣精矿/吹炼渣等），放在混料下「其他」单列，不计入混合铜精矿。
 * 不含返尘/WHB 循环尘（易与产出含尘混淆）。
 */
export const METCAL_MIX_OTHER_STREAM_NAMES = ['渣精矿', '吹炼渣'] as const

export type MetcalMixOtherStreamName = (typeof METCAL_MIX_OTHER_STREAM_NAMES)[number]

export const METCAL_BLEND_STREAM_NAME = '混合铜精矿'
export const METCAL_MOISTURE_STREAM_NAME = '含水'

/**
 * 侧吹铜流程中可能出现的熔剂流名候选（导入时还需按熔炼单元投入名单过滤）。
 * 石灰石常只出现在吹炼投入，不应仅因文件中存在流定义就导入到熔炼配料。
 */
export const METCAL_SOLVENT_STREAM_NAMES = ['石英石', '石灰石', '石灰'] as const

/** 侧吹炉典型气体流名（导入时按熔炼单元投入过滤；吹炼「漏风」与熔炼「加料口漏风」区分） */
export const METCAL_GAS_STREAM_NAMES = ['空气', '氧气', '二次风', '加料口漏风', '漏风'] as const

/** 燃料流名：导入元素组成，不导入干基流量（按熔炼单元投入过滤） */
export const METCAL_FUEL_STREAM_NAMES = ['煤', '粉煤', '焦粉'] as const

export function mapMetcalElementTable(
  table: Record<string, string | number>
): Partial<Record<CopperElementKey, number>> {
  const out: Partial<Record<CopperElementKey, number>> = {}
  for (const [key, raw] of Object.entries(table)) {
    if (raw === 'x' || raw === '' || raw == null) continue
    const copperKey = METCAL_TO_COPPER_ELEMENT[key]
    if (!copperKey) continue
    const num = typeof raw === 'number' ? raw : Number.parseFloat(String(raw))
    if (!Number.isFinite(num)) continue
    out[copperKey] = num
  }
  return out
}
