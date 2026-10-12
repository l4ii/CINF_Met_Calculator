/**
 * 侧吹炉数值仿真的后台默认参数。页面不显示这些值；修改后重新生成网格或重新开始计算生效。
 * 长度 m，时间 s，压力 Pa，粘度 Pa·s。
 */

export type MeshLevel = 'coarse' | 'medium' | 'fine'

export const MESH_LEVEL_LABELS: Record<MeshLevel, string> = { coarse: '粗', medium: '中', fine: '细' }

export type FurnaceSimConfig = {
  mesh: {
    /** 各档位目标流体单元数 */
    levels: Record<MeshLevel, number>
    defaultLevel: MeshLevel
    /** 实际流体单元数允许偏离目标的比例 */
    countTolerance: number
    /** 相邻单元尺寸比上限 */
    growthRatio: number
    /** 风口区单元尺寸 = max(风口直径 × tuyereMinDiameters, 基础尺寸 × tuyereCellRatio) */
    tuyereCellRatio: number
    tuyereMinDiameters: number
    /** 液面带竖向尺寸 = 基础尺寸 × surfaceCellRatio，带厚为液面上下各 surfaceBandCells 个基础尺寸 */
    surfaceCellRatio: number
    surfaceBandCells: number
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
  }
}

export const FURNACE_SIM_CONFIG: FurnaceSimConfig = {
  mesh: {
    levels: { coarse: 25_000, medium: 50_000, fine: 120_000 },
    defaultLevel: 'medium',
    countTolerance: 0.25,
    growthRatio: 1.18,
    tuyereCellRatio: 0.75,
    tuyereMinDiameters: 2,
    surfaceCellRatio: 0.7,
    surfaceBandCells: 2,
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
    pressureMaxIterations: 50,
    thincBeta: 3.5,
    divergenceVelocityMs: 1000,
    maxPhysicalTimeS: 30,
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
  },
}
