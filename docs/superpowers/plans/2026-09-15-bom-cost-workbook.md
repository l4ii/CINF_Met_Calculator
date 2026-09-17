# BOM 与工程造价工作簿实施计划

**Goal:** 交付可编辑、可保存、可导出的 BOM 与工程造价分表，支持后续原料成本算法接入。

**Architecture:** 清单共享类型和组件；纯函数造价计算；工作簿 UI 通过现有案例状态保存。计价单位为元，分离建设投资和年运行费用。

**Tech Stack:** TypeScript、React、现有 ExcelJS、Node 断言脚本。

**Spec:** ../specs/2026-09-15-bom-cost-workbook-design.md

## Tasks

- [ ] BOM：共享类型、采购范围、来源、分组/筛选、水套数量；修正吹炼完成标记失效对象。负责文件 copperEquipmentBom.ts、EquipmentBomTable.tsx 和两个设备入口的 BOM 段。
- [ ] 计价模型：projectCostWorkbook.ts；手算验证 `2 × 100.25 = 200.50`、包含项不叠加、空值待询价、明确零价有效；运行 validate-project-cost-workbook.mjs。
- [ ] 工作簿界面：替换 ProjectCostTable.tsx，支持底部 Sheet、可编辑数值、增删行、独立造价汇总、物料价格来源及优化基准/候选编辑。
- [ ] 保存与回读：四个铜工序页面和共享案例类型保存 projectCostWorkbooks、equipmentBomSnapshots，导入进行规范化，切换工序保持隔离，汇总读取生成快照。
- [ ] 导出：projectCostWorkbookXlsx.ts，复用 ExcelJS，分表公式、小计、固定表头、缺价说明和来源；验证输出可重新读取并核对公式与缓存值。
- [ ] 检查：针对计算和导出执行脚本、前端构建、针对本次修改的类型检查、浏览器查看与编辑、独立代码审查。

## Decisions

- 本次按建设用材和生产配料两类原料设计，分别计入建设投资和年运行费用。
- 原料优化提供数据、边界和候选成本比较；完整工艺约束求解器待后续算法接入。
- 当前已有未提交修改在原工作区局部扩展，不提交或回退其他工作。
