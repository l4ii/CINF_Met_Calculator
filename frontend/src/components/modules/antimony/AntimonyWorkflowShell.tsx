import { antimonyPageKindForSheet } from './shared/antimonyStageNavigation.tsx'
import AntimonyOxySideBlowSession, {
  type AntimonyOxySideBlowSessionProps,
} from './shared/AntimonyOxySideBlowSession.tsx'
import AntimonyCaseWorkspace from './AntimonyCaseWorkspace.tsx'
import SmeltingBatchCalcPage from './smelting/SmeltingBatchCalcPage.tsx'
import SmeltingEquipmentPage from './smelting/SmeltingEquipmentPage.tsx'
import ConvertingBatchCalcPage from './converting/ConvertingBatchCalcPage.tsx'
import ConvertingEquipmentPage from './converting/ConvertingEquipmentPage.tsx'
import RefiningPlaceholderPage from './refining/RefiningPlaceholderPage.tsx'
import AntimonyCaseSummaryPage from './summary/AntimonyCaseSummaryPage.tsx'

export { default as AntimonyCaseWorkspace } from './AntimonyCaseWorkspace.tsx'
export { default as SmeltingBatchCalcPage } from './smelting/SmeltingBatchCalcPage.tsx'
export { default as SmeltingEquipmentPage } from './smelting/SmeltingEquipmentPage.tsx'
export { default as ConvertingBatchCalcPage } from './converting/ConvertingBatchCalcPage.tsx'
export { default as ConvertingEquipmentPage } from './converting/ConvertingEquipmentPage.tsx'
export { default as RefiningPlaceholderPage } from './refining/RefiningPlaceholderPage.tsx'
export { default as AntimonyCaseSummaryPage } from './summary/AntimonyCaseSummaryPage.tsx'
export { buildSmeltingHeatBalanceSourceMaterials } from './smelting/smeltingHeatBalanceMaterials.ts'
export { buildConvertingHeatBalanceSourceMaterials } from './converting/convertingHeatBalanceMaterials.ts'
export {
  createConvertingProductConstraintConfig,
  ensureStageUsesConvertingProductPhases,
} from './converting/convertingProductConstraints.ts'

export type AntimonyWorkflowShellProps = Omit<AntimonyOxySideBlowSessionProps, 'forcedPageKind'>

/**
 * 锑火法富氧侧吹总壳：一页一文件挂载。
 * 熔炼/吹炼配料为独立锁定页面（模块级 cache 在 remount 时恢复）；其余页仍走 Session 早退分支。
 */
export default function AntimonyWorkflowShell(props: AntimonyWorkflowShellProps) {
  const kind = antimonyPageKindForSheet(props.activeSheet)
  switch (kind) {
    case 'workspace':
      return <AntimonyCaseWorkspace {...props} />
    case 'smelting-batch':
      return <SmeltingBatchCalcPage key="smelting-batch" {...props} />
    case 'smelting-equipment':
      return <SmeltingEquipmentPage {...props} />
    case 'converting-batch':
      return <ConvertingBatchCalcPage key="converting-batch" {...props} />
    case 'converting-equipment':
      return <ConvertingEquipmentPage {...props} />
    case 'refining-placeholder':
      return <RefiningPlaceholderPage {...props} />
    case 'summary':
      return <AntimonyCaseSummaryPage {...props} />
    default:
      return <AntimonyOxySideBlowSession {...props} forcedPageKind={kind} />
  }
}
