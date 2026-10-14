/**
 * 侧吹炉数值仿真的后台默认参数。页面不显示这些值；修改后重新生成网格或重新开始计算生效。
 * 长度 m，时间 s，压力 Pa，粘度 Pa·s。
 */

export type FurnaceSimConfig = {
  mesh: {
    /** 目标流体单元数。不含风口/液面加密带时按此反推基础尺寸，加密后总数只增不减。 */
    targetCells: number
    /** 下限。targetCells 低于此值时仍按此值生成。 */
    minTargetCells: number
    /** 实际流体单元数允许偏离目标的比例 */
    countTolerance: number
    /** 相邻单元尺寸比上限 */
    growthRatio: number
    /** 风口区水平单元尺寸 = max(风口直径 × tuyereMinDiameters, 基础尺寸 × tuyereCellRatio) */
    tuyereCellRatio: number
    tuyereMinDiameters: number
    /** 风口高度上下各这么宽的竖向加密带 m */
    tuyereBandM: number
    /** 液面上下各这么宽的竖向加密带 m */
    surfaceBandM: number
    /** 加密带内竖向层厚 = 风嘴直径 × 此系数，且不超过基础尺寸 */
    bandCellDiameters: number
    /** 切割单元体积分数低于此值视为固体 */
    minVolumeFraction: number
    /** 面开口率低于此值视为闭合 */
    minAperture: number
    /** 切割单元每个方向的子采样点数 */
    cellSamples: number
    faceSamples: number
    /** 网格显示线段上限 */
    wireSegmentLimit: number
  }
  fluid: {
    liquidViscosityPaS: number
    gasViscosityPaS: number
    /** 喷枪出口实际状态，用于标态气量换算与气相密度 */
    normalTemperatureK: number
    normalPressurePa: number
    inletTemperatureK: number
    inletPressurePa: number
    gravity: number
  }
  numerics: {
    cfl: number
    /** 显式扩散数上限 ν·Δt/Δ² */
    diffusionNumber: number
    dtMinS: number
    dtMaxS: number
    dtGrowth: number
    pressureTolerance: number
    pressureMaxIterations: number
    /** THINC 界面陡度 */
    thincBeta: number
    /** 速度超过此值判定发散 */
    divergenceVelocityMs: number
    maxPhysicalTimeS: number
    /** 判定准稳态后再累计这么长时间的时均，然后自动停止 */
    averageAfterSteadyS: number
    /** 预热时间，之后开始累计时均场与准稳态判断 */
    warmupS: number
    steadyWindowS: number
    steadyTolerance: number
    /** Worker 每次连续计算的墙钟时间 ms */
    chunkMs: number
    statusIntervalMs: number
  }
  turbulence: {
    cMu: number
    c1: number
    c2: number
    sigmaK: number
    sigmaEps: number
    kappa: number
    wallE: number
    inletIntensity: number
    /** 入口湍流长度尺度 = 喷嘴直径 × inletLengthRatio */
    inletLengthRatio: number
    initialK: number
    initialEpsilon: number
    /** 湍流运动粘度上限 m²/s */
    nuTMax: number
    /** 生成项上限 = productionLimiter × ρε */
    productionLimiter: number
  }
  post: {
    intervalMs: number
    /** 等值面阈值默认位置，0～1，在场的 1%～99% 分位数之间取值；气液界面直接取 α */
    defaultIsoFraction: number
    defaultInterfaceAlpha: number
    bathSeeds: number
    seedsPerTuyere: number
    streamlineMaxSteps: number
    /** 流线步长 = 局部最小单元尺寸 × streamlineStepRatio */
    streamlineStepRatio: number
    /** 过程回放的采样间隔 s。帧数超限后会成倍加大 */
    historyIntervalS: number
    /** 回放帧数上限。超出后隔帧抽稀，仍覆盖从 0 到结束 */
    historyMaxFrames: number
    /** 循环播放时相邻两帧的最短停留 ms */
    playbackFrameMs: number
  }
}

export const FURNACE_SIM_CONFIG: FurnaceSimConfig = {
  mesh: {
    targetCells: 200_000,
    minTargetCells: 150_000,
    countTolerance: 0.25,
    growthRatio: 1.18,
    tuyereCellRatio: 0.75,
    tuyereMinDiameters: 2,
    tuyereBandM: 0.1,
    surfaceBandM: 0.1,
    bandCellDiameters: 1,
    minVolumeFraction: 0.2,
    minAperture: 0.05,
    cellSamples: 4,
    faceSamples: 4,
    wireSegmentLimit: 60_000,
  },
  fluid: {
    liquidViscosityPaS: 0.1,
    gasViscosityPaS: 2e-5,
    normalTemperatureK: 273.15,
    normalPressurePa: 101_325,
    inletTemperatureK: 293.15,
    inletPressurePa: 140_000,
    gravity: 9.81,
  },
  numerics: {
    cfl: 0.5,
    diffusionNumber: 0.15,
    dtMinS: 1e-6,
    dtMaxS: 2e-3,
    dtGrowth: 1.15,
    pressureTolerance: 1e-6,
    pressureMaxIterations: 80,
    thincBeta: 3.5,
    divergenceVelocityMs: 1000,
    maxPhysicalTimeS: 15,
    averageAfterSteadyS: 3,
    warmupS: 1,
    steadyWindowS: 0.5,
    steadyTolerance: 0.02,
    chunkMs: 60,
    statusIntervalMs: 250,
  },
  turbulence: {
    cMu: 0.09,
    c1: 1.44,
    c2: 1.92,
    sigmaK: 1,
    sigmaEps: 1.3,
    kappa: 0.41,
    wallE: 9.8,
    inletIntensity: 0.05,
    inletLengthRatio: 0.07,
    initialK: 1e-5,
    initialEpsilon: 1e-6,
    nuTMax: 0.2,
    productionLimiter: 10,
  },
  post: {
    intervalMs: 500,
    defaultIsoFraction: 0.5,
    defaultInterfaceAlpha: 0.5,
    bathSeeds: 80,
    seedsPerTuyere: 2,
    streamlineMaxSteps: 300,
    streamlineStepRatio: 0.5,
    historyIntervalS: 0.1,
    historyMaxFrames: 160,
    playbackFrameMs: 150,
  },
}

/** 实际采用的目标单元数，不低于配置下限。 */
export function resolveTargetCells(config: FurnaceSimConfig = FURNACE_SIM_CONFIG): number {
  return Math.max(config.mesh.minTargetCells, config.mesh.targetCells)
}
