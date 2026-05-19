# 配矿计算逻辑说明书（新版）

本文档按当前程序实现，对配矿计算模块进行工程化梳理。说明内容覆盖原料添加、原料成本最优方案、目标渣型与熔剂求解、方案应用、物相分析、富氧空气计算、元素总表和成本汇总。

> 本文档描述软件当前计算逻辑，用于功能核对、工程复核和后续开发沟通；正式工程设计仍需结合原料化验、生产制度、热平衡、烟气系统、环保约束和现场经验校核。

## 1. 总体流程

当前配矿计算按以下顺序推进：

1. 添加基础原料。
2. 可选执行原料成本最优方案。
3. 输入熔剂参数。
4. 输入目标渣型。
5. 求解熔剂加入量。
6. 选择并应用熔剂方案。
7. 汇总基础原料 + 熔剂的混合结果。
8. 进行物相分析。
9. 计算富氧空气。
10. 汇总总质量、元素组成和成本。

数据依赖关系：

```text
基础原料
  -> 原料成本最优方案
  -> 熔剂参数 + 目标渣型
  -> 熔剂求解
  -> 基础原料 + 熔剂混合结果
  -> 物相分析
  -> 富氧空气计算
  -> 总表与总成本
```

## 2. 数据口径

每条物料保存为：

```ts
{
  id: string,
  name: string,
  ratios: Record<string, number>,
  weight: number,
  type?: 'base' | 'solvent' | 'oxygen',
  unitPrice?: number,
  airVolume?: number
}
```

口径说明：

- `type = 'base'`：基础原料。
- `type = 'solvent'`：熔剂。
- `type = 'oxygen'`：富氧空气。
- 基础原料质量单位为 t/h，界面单价为万元/t，内部保存为元/t。
- 熔剂质量单位为 t/h，单价为元/t。
- 富氧空气质量单位为 t/h，体积为 Nm3/h，单价为元/Nm3。

基础原料价格换算：

```text
unitPrice_yuan_per_t = unitPrice_wan_yuan_per_t * 10000
```

基础原料和熔剂成本：

```text
cost = weight * unitPrice
```

富氧空气成本：

```text
oxygenCost = airVolume * unitPrice
```

## 3. 原料添加

### 3.1 功能目的

原料添加用于建立当前配矿计算的基础边界。用户通过内置原料或自定义原料，确定基础原料的投料量、价格和元素组成。

### 3.2 输入校验

程序校验：

```text
原料名称不能为空
投料量 > 0
单价为有效数字
元素比例为有效数字
```

元素比例合计：

```text
ratioSum = Σ ratio_i
```

若 `ratioSum` 接近 100%，直接加入。

若 `ratioSum > 100%`，提示归一化：

```text
ratio_i' = ratio_i / ratioSum * 100
```

若 `ratioSum < 100%`，用户可选择归一化，或将缺失部分计入 `Other(其他)`：

```text
Other = 100 - ratioSum
```

### 3.3 元素质量

任一基础原料中元素 `e` 的质量：

```text
elementWeight_m,e = materialWeight_m * ratio_m,e / 100
```

基础原料集合中元素总量：

```text
baseElementWeight_e = Σ elementWeight_m,e
```

基础原料总质量：

```text
baseTotalWeight = Σ materialWeight_m
```

## 4. 原料成本最优方案

### 4.1 功能定位

原料成本最优方案是附加功能。用户不点击时，当前配方不变；用户点击后，系统只展示建议方案，必须由用户确认后才会替换基础原料。

优化范围只包含：

```text
materials.filter(type === 'base')
```

熔剂和富氧空气不参与该优化，也不会在应用推荐方案时被删除。

### 4.2 原料库数量

可用原料库数量不是固定值。程序按当前 `BASE_ELEMENTS` 配置动态读取候选原料，界面显示的“当前可参与优化 N 种”会随着原料库扩充自动变化。

### 4.3 优化目标

设当前基础原料总质量：

```text
W = Σ weight_i
```

推荐方案保持总质量不变：

```text
Σ x_i = W
```

当前基础原料形成的目标元素总量：

```text
targetWeight_e = Σ weight_i * ratio_i,e / 100
```

目标元素质量分数：

```text
targetComp_e = targetWeight_e / W
```

优化变量为候选原料占比：

```text
y_i = x_i / W
y_i >= 0
Σ y_i = 1
```

候选方案达成的元素质量分数：

```text
achievedComp_e = Σ candidateRatio_i,e * y_i
```

### 4.4 核心元素约束

当前核心校核元素为：

```text
Sb, S, Fe, Si, Ca
```

核心元素相对偏差：

```text
relErr_e = (achievedWeight_e - targetWeight_e) / targetWeight_e * 100%
```

硬约束为：

```text
|relErr_e| <= 5%
```

即：

```text
targetComp_e * 0.95 <= achievedComp_e <= targetComp_e * 1.05
```

### 4.5 成本目标

在满足核心元素偏差 `≤5%` 的可行方案中，选择成本最低方案：

```text
minimize Σ x_i * price_i
```

由于 `W` 固定，等价为：

```text
minimize Σ y_i * price_i
```

若当前原料库无法形成满足 `≤5%` 约束的可行方案，程序会展示元素匹配度最高的近似方案，并提示人工复核；该方案不作为满足约束的原料成本最优可行方案。

## 5. 熔剂参数输入

熔剂参数描述石灰和铁矿石的有效成分及价格。每种熔剂输入：

- `Fe(铁)`，%
- `SiO2(二氧化硅)`，%
- `CaO(氧化钙)`，%
- 单价，元/t

校验规则：

```text
各组分 >= 0
至少有一个组分 > 0
```

合计大于 100% 时提示归一化；合计小于 100% 时，缺失部分计入 `Other(其他)`。

熔剂参数加入总表时，初始 `weight = 0`。真实加入量由目标渣型求解结果决定。

## 6. 目标渣型

当前目标渣型由两个比值控制：

```text
Fe / SiO2
CaO / SiO2
```

范围模式：

```text
min = min(inputA, inputB)
max = max(inputA, inputB)
target = (min + max) / 2
fluctPct = (max - min) / (min + max) * 100
```

精确模式：

```text
min = target
max = target
fluctPct = 0
```

“范围 / 精确”是输入方式切换，不改变渣型求解本身的化学计量逻辑。

## 7. 熔剂求解

### 7.1 求解输入

熔剂求解只以基础原料为起点：

```text
baseMaterials = materials.filter(type === 'base')
```

先汇总基础原料中 `Fe`、`Si`、`Ca` 的质量。

### 7.2 元素到氧化物换算

```text
SiO2_0 = Si_0 * 60.084 / 28.085
CaO_0  = Ca_0 * 56.077 / 40.078
```

### 7.3 精确渣型方程

设：

```text
I = 铁矿石加入量
L = 石灰加入量
R_fe = 目标 Fe / SiO2
R_ca = 目标 CaO / SiO2
```

加入熔剂后的方程：

```text
(Fe0 + I*Fe_i + L*Fe_l) / (SiO2_0 + I*SiO2_i + L*SiO2_l) = R_fe
```

```text
(CaO_0 + I*CaO_i + L*CaO_l) / (SiO2_0 + I*SiO2_i + L*SiO2_l) = R_ca
```

整理为二元一次方程：

```text
A11 * I + A12 * L = b1
A21 * I + A22 * L = b2
```

其中：

```text
A11 = Fe_i  - R_fe * SiO2_i
A12 = Fe_l  - R_fe * SiO2_l
A21 = CaO_i - R_ca * SiO2_i
A22 = CaO_l - R_ca * SiO2_l

b1 = R_fe * SiO2_0 - Fe0
b2 = R_ca * SiO2_0 - CaO_0
```

行列式：

```text
det = A11*A22 - A12*A21
```

若 `det` 不接近 0：

```text
I = (b1*A22 - A12*b2) / det
L = (A11*b2 - b1*A21) / det
```

有效方案要求：

```text
I >= 0
L >= 0
```

### 7.4 方案复算

```text
totalFe   = Fe0    + I*Fe_i   + L*Fe_l
totalSiO2 = SiO2_0 + I*SiO2_i + L*SiO2_l
totalCaO  = CaO_0  + I*CaO_i  + L*CaO_l
```

```text
Fe/SiO2  = totalFe / totalSiO2
CaO/SiO2 = totalCaO / totalSiO2
```

方案必须落入用户设定的范围，才视为可行。

### 7.5 方案筛选

程序会生成候选方案，并按多目标筛选：

```text
目标1：总成本越低越好
目标2：石灰加入量越低越好
目标3：总熔剂/渣量越低越好
```

输出方案包括：

- 精准渣型解。
- 帕累托最优解。
- 最小成本解。
- 最低能耗解，当前代码以石灰加入量最小作为近似指标。
- 最小渣量解。

## 8. 熔剂方案应用

用户应用方案后，程序执行：

```text
删除旧石灰、旧铁矿石熔剂行
加入新石灰行，weight = L
加入新铁矿石行，weight = I
```

新增熔剂行：

```text
type = 'solvent'
```

应用后，当前混合物为：

```text
基础原料 + 熔剂
```

## 9. 混合结果与元素总表

`mixResult` 计算时排除富氧空气：

```text
materials.filter(type !== 'oxygen')
```

所以：

```text
mixResult.totalWeight = 基础原料质量 + 熔剂质量
```

熔剂进入元素表时，将氧化物换算为元素：

```text
Si = SiO2 * 28.085 / 60.084
O_from_SiO2 = SiO2 * 32 / 60.084
```

```text
Ca = CaO * 40.078 / 56.077
O_from_CaO = CaO * 16 / 56.077
```

总计行会显示基础原料、熔剂和富氧空气对元素的贡献；但富氧空气不参与 `mixResult.totalWeight`。

## 10. 物相分析

### 10.1 功能定位

物相分析用于根据含硫基础原料中的 `Sb`、`Fe`、`S` 估算主要硫化物物相，为富氧空气耗氧计算提供反应物基础。

当前模型是用于耗氧估算的简化物相假设，不表示所有实际炉况均严格按该顺序生成物相。实际工程需要结合矿物学分析、炉况和生产经验复核。

当前实现已将物相输入从 `mixResult.elementWeights` 调整为“仅含硫基础原料”的元素量汇总：

```text
phaseInput = materials.filter(type === 'base' 且 S > 0)
```

因此，石灰、铁矿石等熔剂不参与 FeS/FeS2 分配；铁矿石中的 Fe 按氧化物熔剂处理，不再被误判为可生成硫化铁的 Fe。

这是最低限度修正。更完整的 MetCal 式口径应进一步把输入从“元素组成”升级为“组分/矿物组成”或“反应/分配表”，例如允许原料输入 `Sb2S3`、`Sb2O3`、`Sb`、`FeS`、`FeS2`、`FeO`、`Fe2O3`、`Fe3O4`、`SiO2`、`CaO`、`S_sulfide`、`S_sulfate` 等组分。若用户只有元素化验值，则当前模式应理解为“按元素守恒反推的估算物相”，不代表真实矿物学分析。

### 10.2 质量到物质的量

```text
nSb = Sb_t * 1,000,000 / 121.76
nFe = Fe_t * 1,000,000 / 55.845
nS  = S_t  * 1,000,000 / 32.06
```

其中 `Sb_t`、`Fe_t`、`S_t` 均来自含硫基础原料，不来自熔剂。

### 10.3 Sb2S3 分配

程序先按 Sb 与 S 的计量可反应量分配 `Sb2S3`；若 Sb 或 S 不足，则由限制元素决定生成量，最低可为 0：

```text
nSb2S3 = min(nSb / 2, nS / 3)
```

剩余：

```text
restSb = nSb - 2*nSb2S3
restS  = nS  - 3*nSb2S3
restFe = nFe
```

### 10.4 Fe-S 分配策略

自适应：

```text
S/Fe >= 2      -> 优先 FeS2
1 < S/Fe < 2   -> 线性方程
S/Fe <= 1      -> 主要 FeS
```

线性方程：

```text
nFeS + nFeS2 = restFe
nFeS + 2*nFeS2 = restS
```

因此：

```text
nFeS  = 2*restFe - restS
nFeS2 = restS - restFe
```

FeS2 优先：先尽可能生成 `FeS2`，再用剩余 Fe、S 生成 `FeS`。

FeS 优先：先尽可能生成 `FeS`，再用剩余 Fe、S 生成 `FeS2`。

### 10.5 物相质量

```text
Sb2S3_t = nSb2S3 * 339.69 / 1,000,000
FeS_t   = nFeS   * 87.91  / 1,000,000
FeS2_t  = nFeS2  * 119.98 / 1,000,000
```

## 11. 富氧空气计算

### 11.1 功能定位

富氧空气计算以物相分析得到的硫化物量作为反应基础。`Sb2S3` 固定按氧化生成 `Sb2O3` 计；`FeS`、`FeS2` 的耗氧系数随用户选择的铁氧化终产物联动，可选 `FeO`、`Fe2O3`、`Fe3O4` 或自定义系数。随后结合供氧系数与富氧空气氧浓度，折算实际供氧量、富氧空气体积、O2/N2 质量贡献及供氧成本。

### 11.2 氧化反应

```text
Sb2S3 + 4.5O2 -> Sb2O3 + 3SO2
```

```text
FeS2 + aO2 -> FeOx + 2SO2
```

```text
FeS + bO2 -> FeOx + SO2
```

铁氧化终产物与耗氧系数：

```text
FeO:
FeS  + 1.5O2 -> FeO + SO2
FeS2 + 2.5O2 -> FeO + 2SO2
```

```text
Fe2O3:
2FeS  + 3.5O2 -> Fe2O3 + 2SO2
2FeS2 + 5.5O2 -> Fe2O3 + 4SO2
```

```text
Fe3O4:
3FeS  + 5O2 -> Fe3O4 + 3SO2
3FeS2 + 8O2 -> Fe3O4 + 6SO2
```

### 11.3 理论耗氧

```text
nSb2S3_kmol = Sb2S3_t * 1,000 / 339.69
nFeS2_kmol  = FeS2_t  * 1,000 / 119.98
nFeS_kmol   = FeS_t   * 1,000 / 87.91
```

```text
O2_theoretical_kmol = nSb2S3_kmol * 4.5
                    + nFeS2_kmol  * coeff_FeS2
                    + nFeS_kmol   * coeff_FeS
```

其中默认按 `FeO` 入渣计：

```text
coeff_FeS  = 1.5
coeff_FeS2 = 2.5
```

若选择 `Fe2O3`，则 `coeff_FeS = 1.75`、`coeff_FeS2 = 2.75`；若选择 `Fe3O4`，则 `coeff_FeS = 5/3`、`coeff_FeS2 = 8/3`。自定义模式下由用户直接输入两个系数。

### 11.4 实际供氧与富氧空气

```text
O2_actual_kmol = O2_theoretical_kmol * oxygenCoefficient
oxygenPurity = oxyPurity / 100
air_kmol = O2_actual_kmol / oxygenPurity
N2_kmol = air_kmol - O2_actual_kmol
```

`oxygenCoefficient` 为供氧系数，即实际供氧量 / 理论需氧量。`oxygenCoefficient = 1` 表示理论供氧，`> 1` 表示过量供氧，`< 1` 表示不足供氧或部分氧化模拟；因此它不再命名为“过剩系数”。

```text
O2_mass = O2_actual_kmol * 32 / 1,000
N2_mass = N2_kmol * 28.02 / 1,000
airMass = O2_mass + N2_mass
airVolume = air_kmol * 22.4
```

说明：这里全程以 `kmol/h` 作为物质的量单位；`22.4` 的含义是 `Nm3/kmol`。如果先算成 `mol/h` 再直接乘以 `22.4`，会把富氧空气体积和按体积计价的富氧空气成本放大 1000 倍。

计算完成后，程序新增或更新“富氧空气”行：

```ts
{
  name: '富氧空气',
  type: 'oxygen',
  weight: O2_mass + N2_mass,
  ratios: {
    'O (氧)': O2_mass / (O2_mass + N2_mass) * 100,
    'N (氮)': N2_mass / (O2_mass + N2_mass) * 100
  },
  unitPrice: oxyUnitPrice,
  airVolume
}
```

耗氧结果面板会显示本次选择的 `ironProduct` 以及 `FeS_O2_coeff`、`FeS2_O2_coeff`，用于复核铁硫化物耗氧假设；这些参数不作为物料行元素组成参与总表加和。

注意：富氧空气行中的 `ratios` 也以百分数 0-100 保存，与基础原料和熔剂保持同一口径。元素总表统一按 `componentWeight = material.weight * ratio / 100` 求元素质量，避免富氧空气 O、N 被低估 100 倍。

## 12. 总成本

```text
totalCost = Σ baseAndSolvent(weight * unitPrice)
          + Σ oxygen(airVolume * unitPrice)
```

其中：

- 基础原料和熔剂按质量计价。
- 富氧空气按体积计价。

## 13. 关键复核点

- 原料库是否覆盖当前实际可用原料。
- 原料成本最优方案是否满足核心元素、杂质元素和现场配料限制。
- 目标渣型范围是否符合工艺制度。
- 熔剂成分和价格是否取自当前批次。
- 物相分析策略是否符合矿物学特征和炉况。
- 富氧空气氧浓度、供氧系数和单价是否符合供氧系统条件。
- 后续产出计算、热平衡和烟气计算是否与本模块结果一致。
