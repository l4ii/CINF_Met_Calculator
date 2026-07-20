/**
 * 由 walkthrough-user-case-output.json 生成 Copper_Oxy_Walkthrough_案例.md
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const JSON_PATH = join(__dirname, 'walkthrough-user-case-output.json')
const MD_PATH = join(__dirname, '..', '..', 'Copper_Oxy_Walkthrough_案例.md')

const data = JSON.parse(readFileSync(JSON_PATH, 'utf8'))

function mdTable(headers, rows) {
  const sep = headers.map(() => '---')
  return [
    `| ${headers.join(' | ')} |`,
    `| ${sep.join(' | ')} |`,
    ...rows.map((r) => `| ${r.join(' | ')} |`),
  ].join('\n')
}

function fmt(n, d = 4) {
  if (n == null || !Number.isFinite(n)) return '—'
  return Number(n).toFixed(d)
}

function phaseTable(phases, limit = 12) {
  const rows = phases.slice(0, limit).map((p) => [p.key, fmt(p.mass, 4), fmt(p.pct, 3)])
  return mdTable(['物相', '质量 t/h', '占比 %'], rows)
}

function compTable(comp, keys) {
  const rows = keys
    .filter((k) => (comp[k] ?? 0) > 1e-4)
    .map((k) => [k, fmt(comp[k], 3)])
  return rows.length ? mdTable(['元素/化合物', 'w%'], rows) : '_（无显著含量）_'
}

const inp = data.inputs
const ch2 = data.chapter2_phaseResults
const blend = data.chapter3_blendPhaseMass
const ch4 = data.chapter4_composition
const ch5 = data.chapter5_hardConstraints
const ch6 = data.chapter6_solver
const ch7 = data.chapter7_recommended
const ch8 = data.chapter8_validation
const products = ch6.products

const keyBlendPhases = ['CuFeS2', 'Cu2S', 'FeS', 'FeS2', 'SiO2', 'CaO', 'Al2O3', 'PbS', 'ZnS']
const keyElements = ['Cu(铜)', 'Fe(铁)', 'S (硫)', 'SiO₂(二氧化硅)', 'CaO(氧化钙)', 'Al₂O₃(三氧化二铝)']

const summaryRows = [
  ['熔炼渣', fmt(products.smeltingSlag.mass, 2), `Cu ${fmt(products.smeltingSlag.composition['Cu(铜)'], 2)}%`],
  ['白铜锍', fmt(products.matte.mass, 2), `Cu ${fmt(products.matte.composition['Cu(铜)'], 2)}%`],
  ['熔炼出炉烟气', fmt(products.flueGas.mass, 2), `SO₂ 相 ${fmt(products.flueGas.phases[0]?.mass, 2)} t/h`],
  ['烟气含尘', fmt(products.dust.mass, 2), `Cu ${fmt(products.dust.composition['Cu(铜)'], 2)}%`],
  ['无组织排放', fmt(products.fugitive.mass, 2), '—'],
  ['损失', fmt(products.loss.mass, 2), '—'],
  ['**合计**', fmt(ch6.totalProductMass, 2), '—'],
]

let md = `# 铜冶炼富氧侧吹 — 用户案例完整演算

> 生成时间：${data.generatedAt}  
> 计算引擎：\`solveOxySideBlowProducts\`（与 UI 产出计算一致）  
> 约束配置：\`copperOxySideBlowConstraints.json\`，GMC = ${inp.gmc}

---

## 输入摘要

${mdTable(
  ['原料', '干量 t/h', '水分 %', '含水 t/h', '湿量 t/h'],
  inp.materials.map((m) => [m.name, fmt(m.dryTh, 2), fmt(m.moisturePct, 2), fmt(m.waterTh, 3), fmt(m.wetTh, 3)])
)}

- 混合铜精矿干量合计：**${fmt(inp.concentrateMass, 2)} t/h**
- 合计含水：**${fmt(inp.totalWaterTh, 3)} t/h**，加权干基水分：**${fmt(inp.weightedMoisturePct, 2)}%**
- 四矿湿基合计：**${fmt(inp.totalWetTh, 3)} t/h**
- 默认辅料：煤（C ${fmt(inp.fuelAssay['C (碳)'], 2)}%）、石英石熔剂、空气/氧气/二次风/加料口漏风

## 最终产出摘要

${mdTable(['产物', '质量 t/h', '备注'], summaryRows)}

求解状态：\`converged=${ch6.converged}\`，\`valid=${ch6.valid}\`，迭代 ${ch6.iterations} 次，最大相对残差 ${fmt(ch8.maxRelativeResidual, 6)}

推荐回填：煤 **${fmt(ch7.fuelWeight, 4)} t/h**，石英石 **${fmt(ch7.solventWeights['石英石'], 4)} t/h**，二次风 **${fmt(ch7.gasWeights['二次风'], 4)} t/h**

---

## 第 1 章 输入与含水换算

**定义**：干量 \`weight\` 为 t/h 干基投料；水分按干基百分数录入。

**公式**：

\`\`\`
含水质量 water = dry × moisture% / 100
湿基质量 wet = dry + water
\`\`\`

**逐矿演算**：

${inp.materials
  .map((m) => {
    const calc = (m.dryTh * m.moisturePct) / 100
    return `### ${m.name}

- 代入：\`${fmt(m.dryTh, 2)} × ${fmt(m.moisturePct, 2)} / 100 = ${fmt(calc, 3)} t/h\`
- 湿量：\`${fmt(m.dryTh, 2)} + ${fmt(calc, 3)} = ${fmt(m.wetTh, 3)} t/h\``
  })
  .join('\n\n')}

**合计**：

- 干量：${fmt(inp.concentrateMass, 2)} t/h
- 含水：${fmt(inp.totalWaterTh, 3)} t/h
- 湿基：${fmt(inp.totalWetTh, 3)} t/h

---

## 第 2 章 各原料化验与物相分解

精矿含 FeO/MgO 时走 **精矿规范分配器**（\`allocateConcentratePhases\`）：先分配伴生硫化物/碳酸盐/氧化物，再用剩余 Cu–Fe–S 求解 CuFeS₂/Cu₂S/FeS₂/FeS。

**单矿物相质量流**：\`M_j = W × x_j% / 100\`（t/h）

${ch2
  .map((m) => {
    const topPhases = Object.entries(m.normativePhasesPct)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([k, v]) => {
        const mass = (v / 100) * m.dryWeight
        return `| ${k} | ${fmt(v, 4)} | ${fmt(mass, 4)} |`
      })
    return `### ${m.materialName}（干量 ${fmt(m.dryWeight, 2)} t/h）

**内置化验（关键项，w%）**

${compTable(m.assay, keyElements)}

**规范物相分配（前 10 项）**

| 物相 | w% | 质量流 t/h |
| --- | --- | --- |
${topPhases.join('\n')}

**闭合未知量**：O = ${fmt(m.unknowns['O(氧)'], 4)}%，C = ${fmt(m.unknowns['C (碳)'], 4)}%，Other = ${fmt(m.unknowns['Other(其他)'], 4)}%`
  })
  .join('\n\n')}

---

## 第 3 章 混合铜精矿物相质量流

**公式**：\`M_blend(phase) = Σ_i M_i(phase)\`

${mdTable(
  ['物相', '混合质量流 t/h'],
  keyBlendPhases
    .filter((k) => blend[k] != null)
    .map((k) => [k, fmt(blend[k], 4)])
)}

其余物相：${Object.entries(blend)
  .filter(([k]) => !keyBlendPhases.includes(k))
  .map(([k, v]) => `${k} ${fmt(v, 4)}`)
  .join('；')}

> 上述 CuFeS₂、FeS₂ 质量流用于二次风供氧系数与硫耗公式。

---

## 第 4 章 混料元素组成

**公式**（湿基加权）：

\`\`\`
E_flow = Σ (dry_i × w%_i / 100) + 水分按 H₂O 拆分为 H、O
混料 w% = E_flow / 湿基总质量 × 100
\`\`\`

### 4.1 仅四矿（rawBlend）

- 湿基总质量：**${fmt(ch4.rawBlend.totalWeightTh, 4)} t/h**

${mdTable(
  ['元素', '质量流 t/h', '湿基 w%'],
  keyElements.map((k) => [k, fmt(ch4.rawBlend.elementWeights[k], 4), fmt(ch4.rawBlend.ratios[k], 4)])
)}

### 4.2 求解后入炉混料（含熔剂、煤、工艺气）

- 湿基总质量：**${fmt(ch4.furnaceFeedAfterSolve.totalWeightTh, 4)} t/h**

${mdTable(
  ['元素', '质量流 t/h', '湿基 w%'],
  ['Cu(铜)', 'S (硫)', 'Fe(铁)', 'SiO₂(二氧化硅)', 'C (碳)', 'O(氧)', 'N(氮)'].map((k) => [
    k,
    fmt(ch4.furnaceFeedAfterSolve.elementWeights[k], 4),
    fmt(ch4.furnaceFeedAfterSolve.ratios[k], 4),
  ])
)}

---

## 第 5 章 约束演算

### 5.1 煤/精矿比（软约束，目标 0.013）

**说明**：\`Input.煤 / Input.混合铜精矿 = 0.013\` 为**预估目标**，由牛顿迭代与其他守恒方程联立求解，**不再**在 \`applyHardInputMassConstraints\` 中强制覆写煤量。

**初值估算**：

\`\`\`
煤初值 ≈ ${fmt(ch5.coalRatio.concentrateMass, 2)} × ${ch5.coalRatio.fuelRatioTarget} = ${fmt(ch5.coalRatio.initialFuelEstimate, 4)} t/h
\`\`\`

**求解结果**：

- 求解器推荐煤量：**${fmt(ch5.coalRatio.solvedFuelMass, 4)} t/h**
- 实际比值：**${fmt(ch5.coalRatio.solvedRatio, 6)}**
- 约束残差（煤/精矿 − 0.013）：见第 8 章

### 5.2 加料口漏风（硬约束）

\`\`\`
加料口漏风 = 5.73 t/h（固定）
\`\`\`

### 5.3 二次风供氧（硬约束）

**公式**：

\`\`\`
O₂_mol = (CuFeS₂中S / 4 + FeS₂中S / 2 × 0.7) / M_S + 煤中C / M_C × 0.7
二次风质量 = O₂_mol × 1.02 × M_O2 / w_O(二次风)
\`\`\`

**代入**（初值估算阶段，煤按 0.013 比）：

| 项 | 数值 |
| --- | --- |
| CuFeS₂ 质量流 | ${fmt(ch5.secondaryAir.cuFeS2MassTh, 4)} t/h |
| FeS₂ 质量流 | ${fmt(ch5.secondaryAir.feS2MassTh, 4)} t/h |
| 煤中碳（估算） | ${fmt(ch5.secondaryAir.fuelCarbonMassTh, 4)} t/h |
| 理论 O₂ 摩尔 | ${fmt(ch5.secondaryAir.oxygenMolesTarget, 4)} kmol/h |
| 二次风（矫正后） | ${fmt(ch7.gasWeights['二次风'], 4)} t/h |

### 5.4 白铜锍 GMC 经验式（硬约束物相矫正）

GMC = ${ch5.matteGmc.gmc}

\`\`\`
S% = -0.125 × GMC/100 + 0.292 = ${fmt(ch5.matteGmc.matteSPercent, 3)}%
Fe% = -0.825 × GMC/100 + 0.633 = ${fmt(ch5.matteGmc.matteFePercent, 3)}%
Cu W% = GMC = ${ch5.matteGmc.matteCuWPercent}%
\`\`\`

求解锍化验：Cu ${fmt(products.matte.composition['Cu(铜)'], 3)}%，S ${fmt(products.matte.composition['S (硫)'], 3)}%，Fe ${fmt(products.matte.composition['Fe(铁)'], 3)}%

### 5.5 渣型与其他硬约束

- 熔炼渣 Fe/SiO₂ 质量比目标 = 2（\`ensureSlagFeOSiO2\`）
- 渣中 Fe₃O₄ 占渣量 15%；Cu₂S/Cu₂O = 2
- 富氧度：\`((空气.O2+氧气.O2)/32×22.4)/(空气+氧气) = 0.85\`（O₂ 为 kg，气体为 Nm³）
- 烟气残氧：出炉 O₂ / 入炉总 O₂ = 5%

---

## 第 6 章 元素分配与六类产物

### 6.1 W% / D% 含义

- **W%**：元素在某产物质量中的质量分数（如锍中 Cu = GMC%）
- **D%**：入炉该元素分配到某产物的比例（%）

主要分配规则（摘自约束配置）：

| 元素 | 规则摘要 |
| --- | --- |
| Cu | 渣 W%=2；锍 W%=GMC；烟尘 D%=1；损失 D%=0.25% |
| S | 渣 W%=0.6；烟尘 D%=0.2；损失 D%=3% |
| Fe | 烟尘 D%=0.55%（其余入渣/锍由平衡确定） |
| Pb/Zn/As | 渣与锍按配置 D% 分配 |

### 6.2 熔炼渣 — ${fmt(products.smeltingSlag.mass, 2)} t/h

${phaseTable(products.smeltingSlag.phases)}

**主要化验（w%）**：${compTable(products.smeltingSlag.composition, keyElements)}

### 6.3 白铜锍 — ${fmt(products.matte.mass, 2)} t/h

${phaseTable(products.matte.phases, 8)}

**化验（w%）**：Cu ${fmt(products.matte.composition['Cu(铜)'], 3)}%，S ${fmt(products.matte.composition['S (硫)'], 3)}%，Fe ${fmt(products.matte.composition['Fe(铁)'], 3)}%

### 6.4 熔炼出炉烟气 — ${fmt(products.flueGas.mass, 2)} t/h

${phaseTable(products.flueGas.phases)}

### 6.5 烟气含尘 — ${fmt(products.dust.mass, 2)} t/h

${phaseTable(products.dust.phases, 8)}

### 6.6 无组织排放 — ${fmt(products.fugitive.mass, 2)} t/h

（本案例求解结果为 0）

### 6.7 损失 — ${fmt(products.loss.mass, 2)} t/h

${phaseTable(products.loss.phases)}

---

## 第 7 章 推荐配比回填值

${mdTable(
  ['项目', '推荐量 t/h'],
  [
    ['燃料煤（干基）', fmt(ch7.fuelWeight, 4)],
    ['石英石', fmt(ch7.solventWeights['石英石'], 4)],
    ['空气', fmt(ch7.gasWeights['空气'], 4)],
    ['氧气', fmt(ch7.gasWeights['氧气'], 4)],
    ['二次风', fmt(ch7.gasWeights['二次风'], 4)],
    ['加料口漏风', fmt(ch7.gasWeights['加料口漏风'], 4)],
  ]
)}

---

## 第 8 章 收敛与平衡校验

| 指标 | 值 |
| --- | --- |
| converged | ${ch6.converged} |
| valid | ${ch6.valid} |
| iterations | ${ch6.iterations} |
| maxRelativeResidual | ${fmt(ch8.maxRelativeResidual, 6)} |
| 总产物质量 | ${fmt(ch6.totalProductMass, 2)} t/h |
| 求解后入炉湿基 | ${fmt(ch4.furnaceFeedAfterSolve.totalWeightTh, 4)} t/h |

### 主要约束残差（按相对残差排序）

${mdTable(
  ['约束', '计算值', '目标', '残差', '相对残差'],
  ch8.constraintResiduals.slice(0, 10).map((r) => [
    r.expr.length > 40 ? r.expr.slice(0, 40) + '…' : r.expr,
    fmt(r.value, 6),
    fmt(r.target, 6),
    fmt(r.residual, 6),
    fmt(r.relativeResidual, 6),
  ])
)}

### 元素平衡残差（|残差| > 1e-4）

${ch8.elementBalanceResiduals.length ? mdTable(
  ['元素', '入炉', '已分配', '残差'],
  ch8.elementBalanceResiduals.map((r) => [r.element, fmt(r.feed, 4), fmt(r.allocated, 4), fmt(r.residual, 4)])
) : '_各元素守恒残差均 < 1e-4 t/h_'}

---

## 附录：复现命令

\`\`\`bash
cd frontend
node scripts/walkthrough-user-case.mjs
node scripts/render-walkthrough-doc.mjs
\`\`\`

中间量 JSON：\`frontend/scripts/walkthrough-user-case-output.json\`
`

writeFileSync(MD_PATH, md, 'utf8')
console.log(`Wrote ${MD_PATH}`)
