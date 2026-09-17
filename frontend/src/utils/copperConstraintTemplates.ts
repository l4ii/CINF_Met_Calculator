/**
 * 自定义约束模板。
 *
 * 模板不另写一份，而是直接取各工序默认约束配置里已发布的条目：
 * 这些表达式是求解器真正支持（部分还有专用硬投影）的写法，
 * 复制出去改个目标值就能用，也不会出现只在文档里存在的语法。
 */
import type {
  CustomConstraintEntry,
  OxyProductDisplayStage,
  OxySideBlowConstraintConfig,
} from './copperConstraintConfig.ts'
import {
  DUST_CONCENTRATE_RATIO_EXPR,
  isFuelConcentrateRatioExpr,
  isOxygenEnrichmentExpr,
  MATTE_FE_GMC_EXPR,
  MATTE_S_GMC_EXPR,
  SECONDARY_AIR_OXYGEN_SUPPLY_EXPR,
  SLAG_FE_SIO2_EXPR,
} from './copperProcessParameters.ts'

export type ConstraintTemplate = {
  id: string
  name: string
  expr: string
  target: number
  soft?: boolean
  /** 默认配置里的约束逻辑说明，缺省时由表达式形态推断 */
  description: string
}

function compact(expr: string): string {
  return expr.replace(/\s+/g, '')
}

/** 【解读】…【业务】…【执行】… 里取第一段作为简述 */
function summarizeNote(note: string): string {
  const match = note.match(/【解读】([^【]*)/)
  return (match?.[1] ?? note).trim()
}

type NamingRule = {
  name: string | ((groups: string[]) => string)
  test: (normalizedExpr: string) => boolean | RegExpMatchArray | null
  description?: string
}

const NAMING_RULES: NamingRule[] = [
  {
    name: '一次风富氧率',
    test: (expr) => isOxygenEnrichmentExpr(expr),
    description: '空气与氧气混合后的湿基 O₂ 体积分数，目标按小数填（0.85 = 85%）。',
  },
  {
    name: '煤/精矿比',
    test: (expr) => isFuelConcentrateRatioExpr(expr),
    description: '燃料煤干重 ÷ 混合铜精矿干重；煤量由该比值派生，不作为牛顿未知量。',
  },
  {
    name: '二次风供氧系数',
    test: (expr) => expr === compact(SECONDARY_AIR_OXYGEN_SUPPLY_EXPR),
    description: '二次风 O₂ 摩尔量 ÷ 精矿硫与煤碳需氧摩尔量，按精矿物相实时重算二次风。',
  },
  {
    name: '渣 Fe/SiO₂ 质量比',
    test: (expr) => expr === compact(SLAG_FE_SIO2_EXPR),
    description: '渣中 Fe 质量 ÷ SiO₂ 当量质量，与关键参数面板的 Fe/SiO₂ 联动。',
  },
  {
    name: '白铜锍 S 经验式（GMC）',
    test: (expr) => expr === compact(MATTE_S_GMC_EXPR),
    description: 'S% = -0.125×GMC/100+0.292；标 soft，只作初值参考不进硬方程。',
  },
  {
    name: '白铜锍 Fe 经验式（GMC）',
    test: (expr) => expr === compact(MATTE_FE_GMC_EXPR),
    description: 'Fe% = -0.825×GMC/100+0.633；标 soft，只作初值参考不进硬方程。',
  },
  {
    name: '烟尘率（烟尘/精矿）',
    test: (expr) => expr === compact(DUST_CONCENTRATE_RATIO_EXPR),
    description: '烟气含尘量 ÷ 混合铜精矿干量。',
  },
  {
    name: '加料口漏风量',
    test: (expr) => /^Input\.加料口漏风\/[\d.]+$/.test(expr),
    description: '加料口漏风体积流量，分母即目标风量 Nm³/h，目标值填 1。',
  },
  {
    name: (groups) => `${groups[0]} Cu₂S/Cu₂O 物相比`,
    test: (expr) => expr.match(/^Output\.([^.]+)\.Cu2S\/Output\.\1\.Cu2O$/),
    description: '该产物中铜硫化物与铜氧化物的质量比。',
  },
  {
    name: (groups) => `${groups[0]} 磁性铁质量分数`,
    test: (expr) => expr.match(/^Output\.([^.]+)\.Fe3O4\/Output\.\1$/),
    description: 'Fe₃O₄ 质量 ÷ 该产物总质量。',
  },
  {
    name: (groups) => `${groups[0]} 磁性铁占全铁比`,
    test: (expr) => expr.match(/^Output\.([^.]+)\.Fe3O4\.Fe\/OutputE\.\1\.Fe$/),
    description: 'Fe₃O₄ 中的 Fe 质量 ÷ 该产物全铁质量。',
  },
  {
    name: (groups) => `${groups[2]} 在${groups[0]}的分配率`,
    test: (expr) => expr.match(/^Output\.([^.]+)\.(\w+)\.(\w+)\/\(Output\./),
    description: '该元素在两个产出之间的分配比例，目标按小数填。',
  },
  {
    name: '烟气残氧率',
    test: (expr) => /^Output\.[^.]+\.O2\/\(Input\./.test(expr),
    description: '出炉烟气 O₂ 质量 ÷ 入炉总 O₂ 质量。',
  },
  {
    name: '氧气过剩系数',
    test: (expr) => /^\(Input\.空气\.O2.*\)\/\(\(Input\.空气\.O2.*-Output\./.test(expr),
    description: '入炉 O₂ ÷ 实际消耗 O₂，反映过剩空气量。',
  },
  {
    name: (groups) => `${groups[0]} CaO/Fe 质量比`,
    test: (expr) => expr.match(/^\(OutputE\.([^.]+)\.Ca\/Ca\*CaO\)\/OutputE\.\1\.Fe$/),
    description: '渣中 CaO 当量质量 ÷ Fe 质量。',
  },
]

function nameAndDescription(entry: CustomConstraintEntry): { name: string; description: string } {
  const normalizedExpr = compact(entry.expr)
  for (const rule of NAMING_RULES) {
    const outcome = rule.test(normalizedExpr)
    if (!outcome) continue
    const groups = Array.isArray(outcome) ? outcome.slice(1) : []
    return {
      name: typeof rule.name === 'function' ? rule.name(groups) : rule.name,
      description: entry.note ? summarizeNote(entry.note) : rule.description ?? '',
    }
  }
  return {
    name: '自定义比值约束',
    description: entry.note ? summarizeNote(entry.note) : '默认配置中的约束式，可改目标值后套用。',
  }
}

export function buildConstraintTemplates(
  defaultConfig: OxySideBlowConstraintConfig,
  stage: OxyProductDisplayStage
): ConstraintTemplate[] {
  const seen = new Set<string>()
  const templates: ConstraintTemplate[] = []
  for (const entry of defaultConfig.customConstraints) {
    const key = compact(entry.expr)
    if (!key || seen.has(key)) continue
    seen.add(key)
    const { name, description } = nameAndDescription(entry)
    templates.push({
      id: `${stage}-${templates.length}`,
      name,
      expr: entry.expr,
      target: entry.target,
      soft: entry.soft,
      description,
    })
  }
  return templates
}

/** 表达式是否已存在于当前约束表（忽略空白差异） */
export function constraintExprAlreadyUsed(
  config: OxySideBlowConstraintConfig,
  expr: string
): boolean {
  const needle = compact(expr)
  return config.customConstraints.some((entry) => compact(entry.expr) === needle)
}
