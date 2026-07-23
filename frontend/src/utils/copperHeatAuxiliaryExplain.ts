/**
 * 热平衡相关参数算法说明。
 * 供详情弹窗与智能助手规则回复共用。
 */
import {
  formatAuxiliaryParam,
  METCAL_ANNUAL_OPERATING_HOURS,
  type CopperHeatAuxiliaryParams,
  type CopperHeatAuxiliaryTrace,
  type OxygenEnrichmentGasTrace,
} from './copperHeatAuxiliaryParams.ts'

export type HeatAuxiliaryParamKey =
  | 'oxygenEnrichmentPct'
  | 'flueDustContentGm3'
  | 'totalDustRatePct'
  | 'flueSulfurAnnualTa'
  | 'flueAsContentGm3'
  | 'mechanicalDustPct'

export type HeatAuxiliaryExplainItem = {
  key: HeatAuxiliaryParamKey
  label: string
  unit: string
  source: string
  formula: string
  detail: string
  aliases: string[]
}

export const HEAT_AUXILIARY_EXPLAIN_ITEMS: HeatAuxiliaryExplainItem[] = [
  {
    key: 'oxygenEnrichmentPct',
    label: '富氧风浓度',
    unit: '%',
    source: '投入物相/气列中的「空气」「氧气」流量，及其 O₂、N₂、H₂O 物相质量',
    formula: '一次风湿基 O₂ 体积分数 × 100',
    detail:
      '由空气与氧气列的 O₂/N₂/H₂O 物相质量换算为摩尔流量后，计算 (空气O₂+氧气O₂)/(空气+氧气 总摩尔)。湿基含水分。对应 MetCal 侧吹熔炼炉辅助公式。',
    aliases: ['富氧风浓度', '富氧浓度'],
  },
  {
    key: 'flueDustContentGm3',
    label: '熔炼烟气含尘',
    unit: 'g/m³',
    source: '产出「烟尘」总质量 ÷ 产出「熔炼出炉烟气」标态体积',
    formula: '烟尘质量(t/h) × 10⁶ / 烟气标态体积(Nm³/h)',
    detail: '烟尘取产出「烟尘」总质量；烟气体积由烟气各气相物相按标态体积合计。',
    aliases: ['熔炼烟气含尘', '烟气含尘'],
  },
  {
    key: 'totalDustRatePct',
    label: '熔炼总尘率',
    unit: '%',
    source: '产出「烟尘」总质量 ÷ 入炉「混合铜精矿」干基质量',
    formula: '烟尘质量 / 混合铜精矿质量 × 100',
    detail: '烟尘占混合铜精矿的百分数，对应 MetCal 侧吹熔炼炉辅助公式中的总尘率。',
    aliases: ['熔炼总尘率', '总尘率'],
  },
  {
    key: 'flueSulfurAnnualTa',
    label: '熔炼烟气总含S',
    unit: 't/a',
    source: `产出烟气元素 S 质量流(t/h) × 年操作小时(${METCAL_ANNUAL_OPERATING_HOURS}=24×330)`,
    formula: `烟气元素 S(t/h) × 年操作小时(${METCAL_ANNUAL_OPERATING_HOURS}=24×330)`,
    detail: '年操作小时与 MetCal 西南铜案例一致：日作业 24 h、年作业 330 天。',
    aliases: ['熔炼烟气总含S', '烟气总含S', '烟气含S'],
  },
  {
    key: 'flueAsContentGm3',
    label: '烟气含As',
    unit: 'g/m³',
    source: '产出烟气元素 As 质量流 ÷ 烟气标态体积',
    formula: '烟气元素 As(t/h) × 10⁶ / 烟气标态体积(Nm³/h)',
    detail: 'As 取烟气元素质量流；体积同「熔炼烟气含尘」。',
    aliases: ['烟气含As', '含As'],
  },
  {
    key: 'mechanicalDustPct',
    label: '机械尘',
    unit: '%',
    source: '产出烟尘物相中扣除 PbO、ZnO、As₂O₃ 后的质量 ÷ 混合铜精矿干基',
    formula: '(烟尘 − PbO − ZnO − As₂O₃) / 混合铜精矿 × 100',
    detail:
      '主挥发氧化物 PbO/ZnO/As₂O₃ 以外的烟尘占精矿百分数，与 MetCal「机械尘」定义一致。',
    aliases: ['机械尘'],
  },
]

function formatGasWalkthrough(name: string, gas: OxygenEnrichmentGasTrace): string {
  return [
    `  ${name}：干基 ${formatAuxiliaryParam(gas.dryWeightTh, 3)} t/h，`,
    `O₂=${formatAuxiliaryParam(gas.o2MassTh, 4)}、N₂=${formatAuxiliaryParam(gas.n2MassTh, 4)}、H₂O=${formatAuxiliaryParam(gas.h2oMassTh, 4)} t/h`,
    `→ O₂ ${formatAuxiliaryParam(gas.o2Kmolh, 4)}、N₂ ${formatAuxiliaryParam(gas.n2Kmolh, 4)}、H₂O ${formatAuxiliaryParam(gas.h2oKmolh, 4)} kmol/h，`,
    `合计 ${formatAuxiliaryParam(gas.totalKmolh, 4)} kmol/h`,
  ].join('')
}

function formatHeatAuxiliaryWalkthrough(
  item: HeatAuxiliaryExplainItem,
  trace: CopperHeatAuxiliaryTrace | null | undefined
): string[] {
  if (!trace) return []

  const lines: string[] = []

  switch (item.key) {
    case 'oxygenEnrichmentPct': {
      if (trace.air) lines.push(formatGasWalkthrough('空气', trace.air))
      if (trace.oxygen) lines.push(formatGasWalkthrough('氧气', trace.oxygen))
      if (
        trace.combinedO2Kmolh != null &&
        trace.combinedTotalKmolh != null &&
        trace.combinedTotalKmolh > 0
      ) {
        const pct = (trace.combinedO2Kmolh / trace.combinedTotalKmolh) * 100
        lines.push(
          `  (空气O₂+氧气O₂) / (空气+氧气 总摩尔) × 100 = ${formatAuxiliaryParam(pct, 2)} %`
        )
      }
      break
    }
    case 'flueDustContentGm3': {
      if (trace.dustMassTh != null && trace.flueVolumeNm3h != null && trace.flueVolumeNm3h > 0) {
        const result = (trace.dustMassTh * 1e6) / trace.flueVolumeNm3h
        lines.push(`  烟尘质量 = ${formatAuxiliaryParam(trace.dustMassTh, 4)} t/h`)
        lines.push(`  烟气标态体积 = ${formatAuxiliaryParam(trace.flueVolumeNm3h, 2)} Nm³/h`)
        lines.push(
          `  ${formatAuxiliaryParam(trace.dustMassTh, 4)} × 10⁶ / ${formatAuxiliaryParam(trace.flueVolumeNm3h, 2)} = ${formatAuxiliaryParam(result, 2)} g/m³`
        )
      }
      break
    }
    case 'totalDustRatePct': {
      if (trace.dustMassTh != null && trace.concentrateMassTh > 0) {
        const result = (trace.dustMassTh / trace.concentrateMassTh) * 100
        lines.push(`  烟尘质量 = ${formatAuxiliaryParam(trace.dustMassTh, 4)} t/h`)
        lines.push(`  混合铜精矿 = ${formatAuxiliaryParam(trace.concentrateMassTh, 3)} t/h`)
        lines.push(
          `  ${formatAuxiliaryParam(trace.dustMassTh, 4)} / ${formatAuxiliaryParam(trace.concentrateMassTh, 3)} × 100 = ${formatAuxiliaryParam(result, 2)} %`
        )
      }
      break
    }
    case 'flueSulfurAnnualTa': {
      if (trace.flueSTh != null) {
        const result = trace.flueSTh * trace.annualOperatingHours
        lines.push(`  烟气元素 S = ${formatAuxiliaryParam(trace.flueSTh, 4)} t/h`)
        lines.push(`  年操作小时 = ${trace.annualOperatingHours} h/a`)
        lines.push(
          `  ${formatAuxiliaryParam(trace.flueSTh, 4)} × ${trace.annualOperatingHours} = ${formatAuxiliaryParam(result, 2)} t/a`
        )
      }
      break
    }
    case 'flueAsContentGm3': {
      if (trace.flueAsTh != null && trace.flueVolumeNm3h != null && trace.flueVolumeNm3h > 0) {
        const result = (trace.flueAsTh * 1e6) / trace.flueVolumeNm3h
        lines.push(`  烟气元素 As = ${formatAuxiliaryParam(trace.flueAsTh, 6)} t/h`)
        lines.push(`  烟气标态体积 = ${formatAuxiliaryParam(trace.flueVolumeNm3h, 2)} Nm³/h`)
        lines.push(
          `  ${formatAuxiliaryParam(trace.flueAsTh, 6)} × 10⁶ / ${formatAuxiliaryParam(trace.flueVolumeNm3h, 2)} = ${formatAuxiliaryParam(result, 4)} g/m³`
        )
      }
      break
    }
    case 'mechanicalDustPct': {
      if (
        trace.dustMassTh != null &&
        trace.pbOMassTh != null &&
        trace.znOMassTh != null &&
        trace.as2O3MassTh != null &&
        trace.mechanicalDustMassTh != null &&
        trace.concentrateMassTh > 0
      ) {
        const result = (trace.mechanicalDustMassTh / trace.concentrateMassTh) * 100
        lines.push(`  烟尘 = ${formatAuxiliaryParam(trace.dustMassTh, 4)} t/h`)
        lines.push(
          `  PbO = ${formatAuxiliaryParam(trace.pbOMassTh, 4)}、ZnO = ${formatAuxiliaryParam(trace.znOMassTh, 4)}、As₂O₃ = ${formatAuxiliaryParam(trace.as2O3MassTh, 4)} t/h`
        )
        lines.push(
          `  机械尘 = ${formatAuxiliaryParam(trace.dustMassTh, 4)} − ${formatAuxiliaryParam(trace.pbOMassTh, 4)} − ${formatAuxiliaryParam(trace.znOMassTh, 4)} − ${formatAuxiliaryParam(trace.as2O3MassTh, 4)} = ${formatAuxiliaryParam(trace.mechanicalDustMassTh, 4)} t/h`
        )
        lines.push(`  混合铜精矿 = ${formatAuxiliaryParam(trace.concentrateMassTh, 3)} t/h`)
        lines.push(
          `  ${formatAuxiliaryParam(trace.mechanicalDustMassTh, 4)} / ${formatAuxiliaryParam(trace.concentrateMassTh, 3)} × 100 = ${formatAuxiliaryParam(result, 2)} %`
        )
      }
      break
    }
  }

  if (lines.length === 0) return []
  return lines
}

export function findHeatAuxiliaryExplainItem(query: string): HeatAuxiliaryExplainItem | null {
  const compact = query.replace(/\s/g, '')
  let best: HeatAuxiliaryExplainItem | null = null
  let bestLen = 0
  for (const item of HEAT_AUXILIARY_EXPLAIN_ITEMS) {
    for (const alias of item.aliases) {
      const token = alias.replace(/\s/g, '')
      if (token && compact.includes(token) && token.length > bestLen) {
        best = item
        bestLen = token.length
      }
    }
  }
  return best
}

export function formatHeatAuxiliaryExplainBlock(
  item: HeatAuxiliaryExplainItem,
  liveValue?: number | null,
  trace?: CopperHeatAuxiliaryTrace | null
): string {
  const lines = [
    `【${item.label}】单位：${item.unit}`,
    `来源：${item.source}`,
    `公式：${item.formula}`,
    `说明：${item.detail}`,
  ]

  const walkthrough = formatHeatAuxiliaryWalkthrough(item, trace)
  if (walkthrough.length > 0) {
    lines.push('演算：')
    lines.push(...walkthrough)
  }

  if (liveValue !== undefined) {
    lines.push(`当前计算值：${formatAuxiliaryParam(liveValue, 2)} ${item.unit}`)
  }
  return lines.join('\n')
}

export function buildHeatAuxiliaryExplainReply(params?: {
  focusKey?: HeatAuxiliaryParamKey | null
  focusLabel?: string | null
  live?: CopperHeatAuxiliaryParams | null
  trace?: CopperHeatAuxiliaryTrace | null
}): string {
  const live = params?.live ?? null
  const trace = params?.trace ?? null
  const focus =
    (params?.focusKey
      ? HEAT_AUXILIARY_EXPLAIN_ITEMS.find((item) => item.key === params.focusKey)
      : null) ??
    (params?.focusLabel ? findHeatAuxiliaryExplainItem(params.focusLabel) : null)

  if (focus) {
    const lines = [
      formatHeatAuxiliaryExplainBlock(focus, live ? live[focus.key] : undefined, trace),
    ]
    if (!live || live[focus.key] == null) {
      lines.push(
        '',
        '（若未显示当前计算值与演算，请先完成产出计算并打开热平衡结果页，再点对应问号。）'
      )
    }
    lines.push('', '如需了解其余指标，可再问「总尘率怎么算」或点击对应问号按钮。')
    return lines.join('\n')
  }

  const blocks = HEAT_AUXILIARY_EXPLAIN_ITEMS.map((item) =>
    formatHeatAuxiliaryExplainBlock(item, live ? live[item.key] : undefined, trace)
  )
  return blocks.join('\n\n')
}

export function isHeatAuxiliaryExplainQuery(raw: string): boolean {
  const compact = raw.replace(/\s/g, '')
  if (!compact) return false
  if (/热平衡相关参数|辅助计算/.test(compact)) return true
  const focus = findHeatAuxiliaryExplainItem(raw)
  if (!focus) return false
  return /怎么算|如何计算|怎样计算|计算公式|算法|怎么来的|如何得出|如何得到|解释|详情|说明|是什么|含义/.test(
    compact
  )
}
