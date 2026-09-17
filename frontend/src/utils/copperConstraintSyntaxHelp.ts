/**
 * 自定义约束表达式语法说明。
 * 供智能助手规则回复使用；本地模型未就绪时也能答。
 */

export type ConstraintSyntaxContext = {
  /** 熔炼 / 吹炼 / 精炼 */
  stageName: string
  /** Input. 后可用的流股名（即符号表 inputMass 的键） */
  inputNames: string[]
  /** Output. / OutputE. 后可用的产物名 */
  productNames: string[]
  /** 可直接引用的配置变量名，如 GMC */
  variableNames: string[]
  customConstraintCount: number
  /** 当前配置里的示例表达式，取前若干条 */
  exampleExprs: string[]
}

const SYNTAX_QUERY_PATTERN =
  /自定义约束|约束表达式|约束语法|约束怎么写|怎么写约束|如何写约束|约束式|Input\.|Output\.|OutputE/i

const INTENT_PATTERN =
  /怎么写|如何写|怎么填|如何填|语法|格式|写法|规则|支持|可用|有哪些|模板|示例|例子|举例|说明|是什么|含义|改不了|不生效|没生效|无效/

export function isConstraintSyntaxQuery(raw: string): boolean {
  const compact = raw.replace(/\s/g, '')
  if (!compact) return false
  if (!SYNTAX_QUERY_PATTERN.test(compact)) return false
  // 「自定义约束」这类明确指名的直接答；只提到 Input./Output. 的要带提问意图
  if (/自定义约束|约束表达式|约束语法|约束怎么写|怎么写约束|如何写约束/.test(compact)) return true
  return INTENT_PATTERN.test(compact)
}

function joinList(values: readonly string[], limit = 24): string {
  const shown = values.slice(0, limit)
  const suffix = values.length > shown.length ? ` 等 ${values.length} 项` : ''
  return `${shown.join('、')}${suffix}`
}

const SYNTAX_LINES = [
  '【自定义约束怎么写】',
  '一条约束就是一个等式：左边「约束」格填表达式，右边「数值」格填目标值，求解器会把表达式的值逼到目标值。表达式里不写等号，也不写大于小于。',
  '',
  '一、三个作用域前缀（大小写敏感，必须首字母大写）',
  '· Input.流股            → 该投入的质量 t/h',
  '· Input.流股.物相        → 该投入中某物相的质量 t/h',
  '· Input.流股.元素        → 该投入中某元素的质量 t/h',
  '· Input.流股.物相.元素    → 该物相里所含某元素的质量 t/h',
  '· Output.产物            → 该产出的总质量 t/h',
  '· Output.产物.物相        → 该产出中某物相的质量 t/h',
  '· Output.产物.物相.元素   → 该物相里所含某元素的质量 t/h',
  '· OutputE.产物.元素      → 该产出中某元素的总质量 t/h（必须三段）',
  '',
  '二、运算',
  '· 支持 + - * / 和小括号 ()，支持一元负号和小数，例如 (a + b) / 2、-0.125 * GMC / 100 + 0.292。',
  '· 不支持函数调用：没有 abs、min、max、sqrt、sum 这些。',
  '· 不支持比较符和条件表达式：目标值只能填在右边的「数值」格里。',
  '· 裸写的元素或化合物符号（如 S、SiO2、O2）表示其摩尔/原子质量 g/mol，通常用于把元素质量折算成化合物当量，例如 OutputE.熔炼渣.Si / Si * SiO2 就是 SiO₂ 当量质量。',
  '',
  '三、容易写错的四处',
  '1. 前缀必须是 Input / Output / OutputE。写成小写 input. 或 output. 不会报语法错，但求值恒为 0，约束等于没生效。',
  '2. 产物名分工序：熔炼写「熔炼渣、白铜锍、熔炼出炉烟气、烟气含尘」，吹炼写「吹炼渣、粗铜、吹炼出炉烟气、吹炼烟气含尘」。跨工序照抄会算成 0。',
  '3. Input.加料口漏风 的单位是 Nm³/h，不是 t/h；其余投入流股都是 t/h。',
  '4. 元素写短符号（Cu、S、Fe、SiO2、CaO、Al2O3），不写化验列全名；Si、Ca、Mg、Al 会分别按 SiO₂、CaO、MgO、Al₂O₃ 当量折算成单质。',
  '',
  '四、两个省事的入口',
  '· 表达式格支持输入补全：打 in 就会跳出 Input.，打完点号会列出当前页真实可用的流股、产物、物相和元素，↑↓ 选、Enter 插入。补全只列进了符号表的名字，跟着选就不会写出恒为 0 的路径。',
  '· 「自定义约束」表头的「约束模板」里是各工序默认配置中已发布的约束式，可整条复制或直接填入新增行再改目标值。',
]

export function buildConstraintSyntaxReply(context?: ConstraintSyntaxContext | null): string {
  const lines = [...SYNTAX_LINES]

  if (context) {
    lines.push('', `五、当前页（${context.stageName}）实际可用的名字`)
    if (context.inputNames.length > 0) {
      lines.push(`· Input. 可接：${joinList(context.inputNames)}`)
    }
    if (context.productNames.length > 0) {
      lines.push(`· Output. / OutputE. 可接：${joinList(context.productNames)}`)
    }
    if (context.variableNames.length > 0) {
      lines.push(`· 可直接引用的配置变量：${joinList(context.variableNames)}`)
    }
    lines.push(`· 当前自定义约束共 ${context.customConstraintCount} 条。`)
    if (context.exampleExprs.length > 0) {
      lines.push('· 本页现有约束示例：')
      for (const expr of context.exampleExprs) lines.push(`    ${expr}`)
    }
  } else {
    lines.push(
      '',
      '（打开某个工序的产出计算页、进入约束编辑区后再问，我可以列出该页实际可用的流股名与产物名。）'
    )
  }

  lines.push(
    '',
    '自定义约束是真正参与求解的：它会被编译成方程进牛顿迭代。标了 soft 的只作初值参考，不进硬方程。若结果页提示部分约束未收敛，通常是几条约束互相矛盾或目标值超出物料平衡能达到的范围。'
  )
  return lines.join('\n')
}
