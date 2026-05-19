# 配料计算逻辑说明书

本文档按当前程序实现，对“配料计算”模块进行工程化梳理。说明内容覆盖原料添加、低成本配方优化、目标渣型与熔剂求解、方案应用、物相分析、富氧空气计算、总成本与元素总表等功能，并说明每一步的计算边界、输入输出、约束条件和主要公式。

> 说明：本文档描述的是当前软件代码中的计算逻辑，不等同于最终工艺设计文件。正式工程使用时仍需结合原料波动、生产制度、设备能力、热平衡、烟气系统、环保约束和现场经验复核。

## 1. 模块计算边界

配料计算模块的核心目标是：在用户给定原料组成、投料量、价格、目标渣型、物相假设和富氧空气参数后，形成一套可追溯的入炉物料计算链路。

当前模块主要处理以下对象：

- 基础原料：锑精矿、锑金精矿、锑锍、铅锑混合精矿、泡渣，以及用户自定义原料。
- 熔剂：石灰、铁矿石。
- 目标渣型：`Fe/SiO2` 与 `CaO/SiO2`。
- 物相：`Sb2S3`、`FeS`、`FeS2` 及剩余 `Sb`、`Fe`、`S`。
- 富氧空气：按硫化物氧化反应计算理论耗氧、实际耗氧、空气体积与空气质量。
- 成本：基础原料和熔剂按质量计价，富氧空气按体积计价。

不在当前模块内完整求解的内容：

- 热平衡。
- 产物分配。
- 炉型能力校核。
- 烟气系统详细计算。
- 熔剂、返料和烟尘循环的闭路平衡。
- 原料库存、粒度、水分和生产操作约束。

## 2. 数据单位与统一口径

### 2.1 物料数据结构

每一条进入计算的物料保存为统一结构：

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

字段含义：

- `name`：物料名称。
- `ratios`：元素或氧化物组成。
- `weight`：质量流量，按 t/h 使用。
- `type = 'base'`：基础原料。
- `type = 'solvent'`：熔剂。
- `type = 'oxygen'`：富氧空气。
- `unitPrice`：单价。基础原料和熔剂为元/t，富氧空气为元/Nm3。
- `airVolume`：富氧空气体积，按 Nm3/h 使用。

### 2.2 价格单位

基础原料在界面输入为“万元/吨”，保存时统一换算为元/t：

```text
基础原料内部单价 = 界面输入单价 * 10000
```

熔剂价格直接按元/t输入和保存。

富氧空气价格按元/Nm3输入和保存。

### 2.3 成分比例

基础原料成分通常按元素百分比保存，例如：

```text
Sb(锑), S(硫), Fe(铁), Si(硅), Ca(钙), O(氧)
```

熔剂成分按氧化物或元素保存，例如：

```text
Fe(铁), SiO2(二氧化硅), CaO(氧化钙)
```

熔剂进入混合元素总表时，会将 `SiO2`、`CaO` 换算为 `Si`、`Ca` 和 `O`。

## 3. 总体计算流程

当前配料计算的主流程如下：

1. 添加基础原料。
2. 可选执行低成本配方优化。
3. 输入或修正熔剂参数。
4. 输入目标渣型。
5. 求解熔剂加入量。
6. 选择并应用熔剂方案。
7. 形成基础原料 + 熔剂的混合结果。
8. 进行物相分析。
9. 计算富氧空气。
10. 汇总元素组成、物料质量和总成本。

数据依赖关系：

```text
基础原料
  -> 低成本配方优化
  -> 目标渣型 + 熔剂参数
  -> 熔剂求解
  -> 基础原料 + 熔剂混合结果
  -> 物相分析
  -> 富氧空气计算
  -> 总表与总成本
```

## 4. 原料添加

### 4.1 功能目的

原料添加用于建立配料计算的基础边界。用户通过选择内置原料或录入自定义原料，确定当前入炉基础原料的质量、价格和元素组成。

该步骤的输出是 `type = 'base'` 的物料集合，后续低成本优化、渣型求解和成本计算均以该集合为基础。

### 4.2 输入内容

用户需要输入：

- 原料名称。
- 投料量，单位 t/h。
- 单价，单位万元/t。
- 元素组成，单位 %。

内置原料会自动带出默认元素组成和默认单价，用户仍可在界面上修改。

### 4.3 输入校验

程序会执行以下校验：

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

根据 `ratioSum` 分三类处理：

1. `ratioSum` 约等于 `100%`

   直接加入原料。

2. `ratioSum > 100%`

   弹出比例调整窗口，用户可选择归一化：

   ```text
   ratio_i' = ratio_i / ratioSum * 100
   ```

3. `ratioSum < 100%`

   用户可选择归一化，也可将缺失部分计入 `Other(其他)`：

   ```text
   Other = 100 - ratioSum
   ```

### 4.4 原料质量与元素质量

对任一基础原料 `m`，元素 `e` 的质量为：

```text
elementWeight_m,e = materialWeight_m * ratio_m,e / 100
```

基础原料集合中某元素总量：

```text
baseElementWeight_e = Σ elementWeight_m,e
```

基础原料总质量：

```text
baseTotalWeight = Σ materialWeight_m
```

### 4.5 原料成本

基础原料成本：

```text
baseCost_m = materialWeight_m * unitPrice_m
```

总基础原料成本：

```text
baseCost = Σ baseCost_m
```

其中：

```text
unitPrice_m = 界面输入单价(万元/t) * 10000
```

## 5. 低成本配方优化

### 5.1 功能定位

低成本配方优化是附加功能。用户不点击该功能时，当前配方保持不变；用户点击后，系统只给出建议配方，不会自动替换原料。

该功能的工程含义是：在当前基础原料总质量不变的前提下，使用内置原料库寻找满足核心元素偏差约束的最低成本混合矿配方。

当前优化仅处理基础原料：

```text
materials.filter(type === 'base')
```

熔剂和富氧空气不参与该优化，也不会在应用推荐配方时被删除。

### 5.2 目标总质量

设当前基础原料总质量为：

```text
W = Σ weight_i
```

优化后推荐配方仍保持：

```text
Σ x_i = W
```

其中：

- `x_i`：推荐使用的第 `i` 种内置原料质量。

### 5.3 目标元素总量

当前基础原料形成的目标元素总量为：

```text
targetWeight_e = Σ weight_i * ratio_i,e / 100
```

目标元素质量分数：

```text
targetComp_e = targetWeight_e / W
```

### 5.4 优化变量

程序使用内置原料库作为候选集合，变量为各候选原料质量占比：

```text
y_i = x_i / W
```

约束：

```text
y_i >= 0
Σ y_i = 1
```

候选配方达成的元素质量分数：

```text
achievedComp_e = Σ candidateRatio_i,e * y_i
```

推荐质量：

```text
x_i = y_i * W
```

### 5.5 核心元素约束

当前将以下元素作为低成本配方优化的核心校核元素：

```text
Sb, S, Fe, Si, Ca
```

核心元素相对偏差：

```text
relErr_e = (achievedWeight_e - targetWeight_e) / targetWeight_e * 100%
```

当前硬校核阈值为：

```text
|relErr_e| <= 5%
```

即：

```text
targetComp_e * 0.95 <= achievedComp_e <= targetComp_e * 1.05
```

该约束用于避免优化结果只追求低价，而偏离当前混合矿的关键元素组成。

### 5.6 成本目标

在满足核心元素偏差 `≤5%` 的可行配方中，系统选择成本最低的方案：

```text
minimize Σ x_i * price_i
```

等价地，由于 `W` 固定：

```text
minimize Σ y_i * price_i
```

### 5.7 求解方式

当前核心约束和成本目标均为线性形式，因此程序按线性规划思路处理：

1. 固定总质量，即 `Σ y_i = 1`。
2. 建立非负约束 `y_i >= 0`。
3. 对核心元素建立上下限约束：

   ```text
   targetComp_e * 0.95 <= achievedComp_e <= targetComp_e * 1.05
   ```

4. 枚举可行域顶点。
5. 在可行顶点中选择成本最低的配比。
6. 若成本相同或极接近，再比较元素匹配评分。

若内置原料库无法形成满足 `≤5%` 核心偏差的配方，则程序退回到“元素匹配优先”的近似配方，并在界面提示：

```text
未找到满足核心元素偏差≤5%的可行配方
```

该近似方案仅用于人工参考，不允许直接作为满足约束的方案使用。

### 5.8 界面交互

用户点击“低成本配方优化”后：

1. 右侧抽屉打开。
2. 显示约 1 秒加载动画。
3. 加载文案为：

   ```text
   原料配比计算中...
   ```

4. 显示推荐配方、成本对比和元素达成校核。

应用推荐配方时：

```text
新物料表 = 推荐基础原料 + 原有熔剂 + 原有富氧空气
```

也就是只替换 `type = 'base'` 的原料行。

## 6. 熔剂参数输入

### 6.1 功能目的

熔剂参数用于描述石灰和铁矿石的有效成分及价格，为后续目标渣型求解提供边界条件。

### 6.2 输入内容

石灰和铁矿石均输入：

- `Fe(铁)`，%
- `SiO2(二氧化硅)`，%
- `CaO(氧化钙)`，%
- 单价，元/t

### 6.3 成分校验

程序会检查：

```text
各组分 >= 0
至少有一个组分 > 0
```

组分合计大于 `100%` 时，提示用户归一化：

```text
component_i' = component_i / componentSum * 100
```

组分合计小于 `100%` 时，缺失部分记录为 `Other(其他)`：

```text
Other = 100 - componentSum
```

### 6.4 参数行与实际加入量

在熔剂参数阶段，程序可将石灰和铁矿石作为参数行加入总表，但初始加入量为：

```text
weight = 0
```

真正加入多少石灰和铁矿石，由目标渣型求解结果决定。

## 7. 目标渣型输入

### 7.1 功能目的

目标渣型输入用于定义熔剂加入后的渣相组成约束。当前使用两个比值控制渣型：

```text
Fe / SiO2
CaO / SiO2
```

### 7.2 精确模式

如果用户输入精确目标值：

```text
min = target
max = target
fluctPct = 0
```

### 7.3 范围模式

如果用户输入上下限：

```text
min = min(inputA, inputB)
max = max(inputA, inputB)
target = (min + max) / 2
```

波动百分比：

```text
fluctPct = (max - min) / (min + max) * 100
```

程序允许用户上下限输反，并自动按小到大处理。

## 8. 目标渣型熔剂求解

### 8.1 功能目的

熔剂求解用于计算为了达到目标渣型，需要加入多少石灰和铁矿石。该步骤输出多个可选方案，供用户按成本、熔剂量、渣量等指标选择。

求解输入只使用基础原料：

```text
baseMaterials = materials.filter(type === 'base')
```

此时不包含已有熔剂，也不包含富氧空气。

### 8.2 基础原料元素汇总

基础原料中元素 `e` 的总量：

```text
elementWeight_e = Σ weight_i * ratio_i,e / 100
```

后续重点使用：

```text
Fe, Si, Ca
```

### 8.3 元素到氧化物换算

由于目标渣型使用 `SiO2` 和 `CaO`，程序将基础原料中的 `Si`、`Ca` 换算为对应氧化物质量：

```text
SiO2_0 = Si_0 * 60.084 / 28.085
CaO_0  = Ca_0 * 56.077 / 40.078
```

其中：

- `60.084`：`SiO2` 摩尔质量。
- `28.085`：`Si` 摩尔质量。
- `56.077`：`CaO` 摩尔质量。
- `40.078`：`Ca` 摩尔质量。

### 8.4 变量定义

设：

```text
I = 铁矿石加入量
L = 石灰加入量
```

基础原料已有组分：

```text
Fe0, SiO2_0, CaO_0
```

铁矿石组分质量分数：

```text
Fe_i, SiO2_i, CaO_i
```

石灰组分质量分数：

```text
Fe_l, SiO2_l, CaO_l
```

目标比值：

```text
R_fe = 目标 Fe / SiO2
R_ca = 目标 CaO / SiO2
```

### 8.5 精确渣型方程

加入熔剂后的比值要求为：

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

系数：

```text
A11 = Fe_i  - R_fe * SiO2_i
A12 = Fe_l  - R_fe * SiO2_l
A21 = CaO_i - R_ca * SiO2_i
A22 = CaO_l - R_ca * SiO2_l
```

右端项：

```text
b1 = R_fe * SiO2_0 - Fe0
b2 = R_ca * SiO2_0 - CaO_0
```

行列式：

```text
det = A11*A22 - A12*A21
```

若 `det` 接近 `0`，说明该组参数下方程病态或无法唯一求解。

若可求解：

```text
I = (b1*A22 - A12*b2) / det
L = (A11*b2 - b1*A21) / det
```

有效方案要求：

```text
I >= 0
L >= 0
```

### 8.6 候选方案复算

对任意候选方案 `(L, I)`，重新计算：

```text
totalFe   = Fe0     + I*Fe_i   + L*Fe_l
totalSiO2 = SiO2_0  + I*SiO2_i + L*SiO2_l
totalCaO  = CaO_0   + I*CaO_i  + L*CaO_l
```

渣型比值：

```text
Fe/SiO2  = totalFe / totalSiO2
CaO/SiO2 = totalCaO / totalSiO2
```

方案必须落入用户设定的范围内，才视为可行。

### 8.7 方案成本

基础原料成本：

```text
baseCost = Σ baseWeight_i * baseUnitPrice_i
```

熔剂成本：

```text
solventCost = L * limestonePrice + I * ironOrePrice
```

方案总成本：

```text
totalCost = baseCost + solventCost
```

### 8.8 多目标筛选

程序会在精确解附近构造候选集合，并进行多目标筛选。当前目标包括：

```text
目标1：总成本越低越好
目标2：石灰加入量越低越好
目标3：总熔剂/渣量越低越好
```

当前输出方案类型：

- 精准渣型解：优先采用精确方程解。
- 帕累托最优解：综合成本、石灰量、总渣量后的折中方案。
- 最小成本解：总成本最低的可行方案。
- 最低能耗解：当前代码中以石灰加入量最小作为近似指标。
- 最小渣量解：总熔剂/渣量最低的可行方案。

注意：当前“最低能耗解”还没有建立完整热平衡模型，不能等同于严格热耗最低。

## 9. 熔剂方案应用

### 9.1 功能目的

方案应用用于将用户选中的熔剂求解结果写回物料表，形成后续物相分析和富氧空气计算所需的入炉混合物。

### 9.2 应用逻辑

用户点击应用某个方案后，程序执行：

```text
删除旧石灰、旧铁矿石熔剂行
加入新石灰行，weight = L
加入新铁矿石行，weight = I
```

新增熔剂行：

```text
type = 'solvent'
```

若某一熔剂加入量接近 `0`，则可不写入该熔剂行。

### 9.3 应用后的数据状态

应用熔剂后，当前物料表包含：

```text
基础原料 + 熔剂
```

此时尚未加入富氧空气。

## 10. 混合结果与元素总表

### 10.1 混合结果计算范围

`mixResult` 计算时排除富氧空气：

```text
baseMats = materials.filter(type !== 'oxygen')
```

因此：

```text
mixResult.totalWeight = 基础原料质量 + 熔剂质量
```

富氧空气不参与 `mixResult.totalWeight`。

### 10.2 熔剂氧化物换算

熔剂进入元素总表前，将氧化物换算为元素：

```text
SiO2 -> Si + O
CaO  -> Ca + O
Fe   -> Fe
```

换算示例：

```text
Si = SiO2 * 28.085 / 60.084
O_from_SiO2 = SiO2 * 32 / 60.084
```

```text
Ca = CaO * 40.078 / 56.077
O_from_CaO = CaO * 16 / 56.077
```

### 10.3 元素重量汇总

对每个非富氧物料：

```text
componentWeight = material.weight * ratio / 100
```

汇总为：

```text
elementWeights_e = Σ componentWeight_e
```

### 10.4 混合矿行

若基础原料多于一种，界面生成“混合矿”汇总行。

混合矿只统计基础原料，不包含熔剂：

```text
baseTotal = Σ baseWeight_i
mixedRatio_e = Σ baseElementWeight_e / baseTotal * 100
```

### 10.5 熔剂行

多种熔剂可汇总为“熔剂”行：

```text
solventTotal = Σ solventWeight_i
solventRatio_e = Σ solventComponentWeight_e / solventTotal * 100
```

### 10.6 总计行

总计行用于展示当前所有物料对元素总量的贡献，包括：

- 基础原料。
- 熔剂。
- 富氧空气。

其中，富氧空气中的 `O` 和 `N` 会进入总计行显示。

## 11. 物相分析

### 11.1 功能目的

物相分析用于根据混合后入炉物料中的 `Sb`、`Fe`、`S` 估算主要硫化物物相，为富氧空气耗氧计算提供反应物基础。

物相分析的输入为：

```text
mixResult.elementWeights
```

即已包含基础原料和熔剂，但不包含富氧空气。

### 11.2 质量到物质的量

输入元素质量单位为 t/h。程序先换算为 g/h：

```text
Sb_g = Sb_t * 1,000,000
Fe_g = Fe_t * 1,000,000
S_g  = S_t  * 1,000,000
```

再换算为物质的量：

```text
nSb = Sb_g / 121.76
nFe = Fe_g / 55.845
nS  = S_g  / 32.06
```

### 11.3 优先生成 Sb2S3

当前物相分配优先让 Sb 与 S 生成 `Sb2S3`：

```text
nSb2S3 = min(nSb / 2, nS / 3)
```

消耗：

```text
Sb_consumed = 2 * nSb2S3
S_consumed  = 3 * nSb2S3
```

剩余：

```text
restSb = nSb - 2*nSb2S3
restS  = nS  - 3*nSb2S3
restFe = nFe
```

### 11.4 Fe-S 物相分配

剩余 `Fe` 和 `S` 可按不同算法分配为 `FeS` 和 `FeS2`。

#### 11.4.1 FeS2 优先

```text
nFeS2 = min(restFe, restS / 2)
```

再用剩余部分生成：

```text
nFeS = min(restFe_remaining, restS_remaining)
```

#### 11.4.2 FeS 优先

```text
nFeS = min(restFe, restS)
```

再用剩余部分生成 `FeS2`。

#### 11.4.3 线性分配

根据守恒关系：

```text
nFeS + nFeS2 = restFe
nFeS + 2*nFeS2 = restS
```

求得：

```text
nFeS  = 2*restFe - restS
nFeS2 = restS - restFe
```

若计算结果非负，则同时生成两种物相；若超出边界，则退回到单一硫化铁分配。

#### 11.4.4 自适应分配

按 `S/Fe` 比值判断：

```text
S/Fe >= 2      -> 优先 FeS2
1 < S/Fe < 2   -> 线性分配
S/Fe <= 1      -> 主要生成 FeS
```

### 11.5 物相质量

物相质量换算：

```text
Sb2S3_t = nSb2S3 * 339.69 / 1,000,000
FeS_t   = nFeS   * 87.91  / 1,000,000
FeS2_t  = nFeS2  * 119.98 / 1,000,000
```

剩余元素质量：

```text
Sb_residue_t = restSb * 121.76 / 1,000,000
Fe_residue_t = restFe * 55.845 / 1,000,000
S_residue_t  = restS  * 32.06  / 1,000,000
```

物相分析结果保存为 `phaseData`，供富氧空气计算使用。

## 12. 富氧空气计算

### 12.1 功能目的

富氧空气计算根据物相分析得到的硫化物质量，按氧化反应计量关系计算理论耗氧量，再结合用户输入的过剩系数和氧气浓度，计算实际供氧量、富氧空气体积、富氧空气质量和成本。

该功能必须在物相分析完成后执行。

### 12.2 输入参数

用户输入：

- 氧气浓度 `oxyPurity`，单位 %。
- 氧气过剩系数 `excessRatio`。
- 富氧空气单价 `oxyUnitPrice`，单位元/Nm3。

校验：

```text
0 < oxyPurity <= 100
0.01 <= excessRatio <= 25
oxyUnitPrice >= 0
```

### 12.3 氧化反应

当前采用以下反应关系：

```text
Sb2S3 + 4.5O2 -> Sb2O3 + 3SO2
```

```text
2FeS2 + 5.5O2 -> Fe2O3 + 4SO2
```

因此：

```text
1 mol FeS2 需要 2.75 mol O2
```

```text
2FeS + 3.5O2 -> Fe2O3 + 2SO2
```

因此：

```text
1 mol FeS 需要 1.75 mol O2
```

### 12.4 物相质量换算

```text
nSb2S3 = Sb2S3_t * 1,000,000 / 339.69
nFeS2  = FeS2_t  * 1,000,000 / 119.98
nFeS   = FeS_t   * 1,000,000 / 87.91
```

### 12.5 理论耗氧

```text
O2_theoretical = nSb2S3 * 4.5
               + nFeS2  * 2.75
               + nFeS   * 1.75
```

### 12.6 实际耗氧

```text
O2_actual = O2_theoretical * excessRatio
```

氧气浓度：

```text
oxygenPurity = oxyPurity / 100
```

富氧空气总量：

```text
airMoles = O2_actual / oxygenPurity
```

氮气量：

```text
N2_moles = airMoles - O2_actual
```

### 12.7 富氧空气质量与体积

氧气质量：

```text
O2_mass = O2_actual * 32 / 1,000,000
```

氮气质量：

```text
N2_mass = N2_moles * 28.02 / 1,000,000
```

富氧空气质量：

```text
airMass = O2_mass + N2_mass
```

富氧空气体积：

```text
airVolume = airMoles * 22.4
```

### 12.8 写入富氧空气物料行

计算完成后，程序新增或更新“富氧空气”物料行：

```ts
{
  name: '富氧空气',
  type: 'oxygen',
  weight: O2_mass + N2_mass,
  ratios: {
    'O (氧)': O2_mass / (O2_mass + N2_mass),
    'N (氮)': N2_mass / (O2_mass + N2_mass)
  },
  unitPrice: oxyUnitPrice,
  airVolume
}
```

注意：富氧空气行中的 `ratios` 以小数保存，界面显示时乘以 `100`。

## 13. 总成本计算

### 13.1 基础原料与熔剂

基础原料和熔剂按质量计价：

```text
cost = weight * unitPrice
```

其中 `unitPrice` 为元/t。

### 13.2 富氧空气

富氧空气按体积计价：

```text
oxygenCost = airVolume * oxyUnitPrice
```

其中：

- `airVolume`：Nm3/h。
- `oxyUnitPrice`：元/Nm3。

### 13.3 总成本

```text
totalCost = Σ baseAndSolvent(weight * unitPrice)
          + Σ oxygen(airVolume * unitPrice)
```

## 14. 当前关键实现口径

1. 基础原料、熔剂和富氧空气使用同一张物料表管理，但不同 `type` 的成本和参与计算范围不同。

2. 低成本配方优化只处理基础原料，不处理熔剂和富氧空气。

3. 低成本配方优化的核心约束是：

   ```text
   Sb、S、Fe、Si、Ca 的相对偏差均需 ≤5%
   ```

4. 若内置原料库无法满足 `≤5%` 约束，程序展示近似方案并提示人工复核，不将其视为满足约束的可行低成本配方。

5. 目标渣型熔剂求解以基础原料为起点，求解石灰和铁矿石加入量。

6. 熔剂应用后，`mixResult` 包含基础原料和熔剂，不包含富氧空气。

7. 物相分析使用熔剂应用后的 `mixResult.elementWeights`。

8. 富氧空气必须在物相分析之后计算。

9. 富氧空气成本按体积计算，不按质量计算。

10. 最终总计行会显示富氧空气中的 `O` 和 `N`，但富氧空气不参与 `mixResult.totalWeight`。

## 15. 推荐的人工复核点

为了使软件结果更适合工程使用，建议用户重点复核：

- 原料化验值是否代表当前生产批次。
- 内置原料库是否足够覆盖实际可选原料。
- 低成本配方是否同时满足核心元素、杂质元素和现场配料限制。
- 石灰和铁矿石有效成分是否取自实际批次化验。
- 目标渣型范围是否符合工艺制度。
- 熔剂加入量是否在设备和操作允许范围内。
- 物相分析策略是否符合当前炉况和原料矿物学特征。
- 富氧空气浓度、过剩系数和单价是否符合当前供氧系统条件。
- 后续产出计算、热平衡和烟气计算是否与本模块结果一致。

