/**
 * 铜火法富氧侧吹入口（兼容 MainContent lazy import）。
 * 实际按页面拆分见 copper/ 目录：
 * - CopperWorkflowShell
 * - smelting/SmeltingBatchCalcPage · SmeltingEquipmentPage
 * - converting/ConvertingBatchCalcPage · ConvertingEquipmentPage
 * - CopperCaseWorkspace · summary/CopperCaseSummaryPage · refining/RefiningPlaceholderPage
 */
export { default } from './copper/CopperWorkflowShell.tsx'
export { default as CopperWorkflowShell } from './copper/CopperWorkflowShell.tsx'
