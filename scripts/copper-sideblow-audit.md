# Copper oxygen-enriched side-blow audit

Generated: 2026-08-12T08:15:35.486Z

This is a read-only diagnostic. A failed software solve means the fresh UI case would not fill results back; candidate values below are retained only for diagnosis.

## 西南铜(吴).flo

### Reference inputs

| Material | Role | Mass t/h | Water t/h | Nm3/h |
|---|---|---:|---:|---:|
| 系统内精矿 | concentrate | 37.136 | 4.580 | - |
| 国内外购矿 | concentrate | 27.448 | 2.878 | - |
| 进口铜精矿 | concentrate | 127.688 | 11.674 | - |
| 边贸矿 | concentrate | 6.383 | 0.669 | - |
| 渣精矿 | other-solid | 12.488 | 0.000 | - |
| 吹炼渣 | other-solid | 4.472 | 0.000 | - |
| 石英石 | solvent | 13.097 | 0.000 | - |
| 煤 | fuel | 3.095 | 0.000 | - |
| 空气 | gas | - | - | 8583.808 |
| 氧气 | gas | - | - | 38143.006 |
| 二次风 | gas | - | - | 39243.907 |
| 加料口漏风 | gas | - | - | 4500.000 |

Inputs present in the Flo furnace unit but omitted by the current importer:

| Material | Mass t/h |
|---|---:|
| 吹炼WHB尘 | 0.402 |
| 熔炼WHB尘 | 1.827 |
| 吹炼返尘 | 0.250 |
| 熔炼返尘 | 1.626 |
| 黑铜粉 | 0.842 |

### Reference vs software

Software acceptance: **failed**; maximum relative residual: **1.000000**.

| Product | Reference t/h | Software candidate t/h | Delta t/h | Delta % |
|---|---:|---:|---:|---:|
| 白铜锍 | 62.470 | 90.470 | 28.000 | 44.821 |
| 熔炼渣 | 145.838 | 85.471 | -60.367 | -41.393 |
| 熔炼出炉烟气 | 172.438 | 159.922 | -12.516 | -7.259 |
| 熔炼锅炉尘+熔炼白烟尘 | 3.643 | 2.831 | -0.813 | -22.303 |
| 损失 | 0.131 | 0.140 | 0.009 | 6.991 |

Top hard residuals:

| Constraint | Actual | Target | Relative residual |
|---|---:|---:|---:|
| Input.冷却水 / Output.冷却水 | 0.000000 | 1.000000 | 1.000000 |
| Input.冷却水 / ( 3000*1000 ) | 0.000000 | 1.000000 | 1.000000 |
| 元素守恒 SiO₂(二氧化硅) | 17.206077 | 30.261297 | 0.431416 |
| 元素守恒 Fe(铁) | 34.654214 | 60.764654 | 0.429698 |
| 元素守恒 Cu(铜) | 70.089682 | 49.324358 | 0.420995 |
| 元素守恒 Other(其他) | 11.466116 | 16.848693 | 0.319466 |
| D% S (硫) → 烟气含尘 = 0.2% | 0.253762 | 0.200000 | 0.268810 |
| D% Cu(铜) → 烟气含尘 = 1% | 0.872318 | 1.000000 | 0.127682 |

Reference phases absent from the current product configuration:

- smeltingSlag: Fe2SiO4 54.114%, Na 0.016%
- dust: CuSO4 3.856%, FeSO4 2.453%, PbSO4 4.764%, ZnSO4 11.555%, NiSO4 0.006%, HgO 0.001%

