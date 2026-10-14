# 富氧侧吹炉 VOF + 标准 k-ε 仿真 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 用前端 Worker 内的结构化交错网格 VOF + 标准 k-ε 求解器替换不收敛的四面体求解器，后处理改为等值面与流线，页面精简。

**Spec:** `docs/superpowers/specs/2026-10-12-furnace-vof-ke-design.md`

**Tech Stack:** TypeScript, Web Worker, React, Three.js, Vite；测试用 `node --experimental-strip-types`。

## Global Constraints

- 计算代码不依赖 DOM，可在 Node 中直接导入 `.ts`。
- 所有数值参数来自 `frontend/src/config/furnaceSimConfig.ts`。
- 每步预分配数组，不在时间步内新建大数组。
- α ∈ [0,1]，k、ε 为正，压力每步收敛到配置残差或报告未收敛。

---

### Task 1: 后台配置

- [x] 新建 `frontend/src/config/furnaceSimConfig.ts`：网格档位（粗 4 万、中 10 万、细 25 万）、渐变比、加密尺寸、物性、数值参数、k-ε 与壁面函数常数、后处理参数。

### Task 2: 网格

- [x] `furnaceFluidDomain.ts` 增加网格锚点。
- [x] 新建 `furnaceSim/mesh.ts`：渐变轴、档位反推、切割单元、入口与出口面、连通性、统计、线框。

### Task 3: 压力

- [x] 新建 `furnaceSim/pressure.ts`：系数层级、红黑 Gauss-Seidel、V 循环、PCG。

### Task 4: VOF 与动量

- [x] 新建 `furnaceSim/vof.ts`、`furnaceSim/momentum.ts`。

### Task 5: 湍流

- [x] 新建 `furnaceSim/turbulence.ts`。

### Task 6: 时间推进

- [x] 新建 `furnaceSim/solver.ts`：状态、单步、Δt、监控、时均、准稳态、发散。

### Task 7: 后处理

- [x] 新建 `furnaceSim/post.ts`：节点插值、Marching Cubes、流线、截面、色标。

### Task 8: Worker

- [x] 新建 `furnaceSim/protocol.ts`，重写 `workers/furnaceSideBlowSolver.worker.ts`。

### Task 9: 场景与视口

- [x] `furnaceModelScene.ts` 删除贴图切片；`ParametricFurnaceViewport.tsx` 渲染后处理缓冲与色标；更新 `SmeltingFurnaceViewer.tsx`。

### Task 10: 页面

- [x] 精简 `FurnaceFlowShowcase.tsx`，清理 `index.css`。

### Task 11: 清理

- [x] 删除 `furnaceTetMesh.ts`、`furnaceTetSolver.ts`、`furnaceSideBlowSolver.ts`，新增 `furnaceGasInlet.ts`。

### Task 12: 验证

- [x] 重写 `frontend/scripts/test-furnace-solver.mjs`：网格、静水、溃坝、守恒、趋势、后处理、Worker 协议、性能报告。
- [x] `vite build`，启动 dev 检查页面。
