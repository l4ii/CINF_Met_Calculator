# 富氧侧吹炉第一版真实气液两相演示 Implementation Plan

> **已被取代：** 见 `docs/superpowers/plans/2026-10-12-furnace-vof-ke.md` 与 `docs/superpowers/specs/2026-10-12-furnace-vof-ke-design.md`。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在现有炉体页面加入可复算的二维不可压气液混合物求解，输出速度、压力、液相分数和标准 k–ε 场，并接入三维演示视图。

**Architecture:** Worker 中运行均匀有限体积/交错速度网格的二维瞬态模型。压力、液相分数、k、ε 位于单元中心，u/v 位于面中心；变密度压力投影后用守恒面通量更新液相与湍流量。前端沿用现有参数和 Three.js，按炉长风口站位生成独立计算切片，并显示残差和质量指标。

**Tech Stack:** TypeScript, Web Worker, React, Three.js, Vite。

**Spec:** 方案演示：快速展示三维流场及变化趋势；模型明确为低分辨率演示，不作为工业级 CFD 验证。

## Global Constraints

- 使用真实炉宽/高度/液位/风口半径和气量；标态气量需按温压换算成实际速度。
- 必须保持液相分数在 [0,1]，k、epsilon、nu_t 有限且非负。
- 结果协议包含 pressure、k、epsilon、residual、divergence、mass error 及物理单位。
- 不实现热耦合、表面张力、化学反应或气泡滑移。

---

### Task 1: 求解器内核

- [ ] 重写 `frontend/src/utils/furnaceSideBlowSolver.ts`，保留 `inletSpeedMs` API，并新增 `FlowGrid` 字段、入口状态换算、守恒 alpha 更新、压力投影、k–epsilon 更新和指标计算。
- [ ] 导出 `createFlowGrid`、`stepFlowGrid`，用纯函数检查默认工况能运行且数组有限。

### Task 2: Worker 协议

- [ ] 更新 `frontend/src/workers/furnaceSideBlowSolver.worker.ts`，为每个 inlet side 单独计算，发布 `physicalTime`、`dt`、`pressureResidual`、`divergence`、`massError`、`iterations`。

### Task 3: 三维场协议和页面

- [ ] 更新 `furnaceModelScene.ts` 的字段类型与纹理映射，增加 pressure/k/epsilon 选择，避免复用不存在字段。
- [ ] 更新 `FurnaceFlowShowcase.tsx` 显示模型说明和实时指标，新增 k/epsilon/pressure 选项及气量换算说明。
- [ ] 保持已有风口、液位、氧枪和暂停交互。

### Task 4: 验证

- [ ] 运行 TypeScript 构建。
- [ ] 运行 Node 纯函数烟测：数组无 NaN、alpha 有界、k/epsilon 非负、气量单调、结果包含新增字段。
- [ ] 启动 Vite 并确认入口可加载。
