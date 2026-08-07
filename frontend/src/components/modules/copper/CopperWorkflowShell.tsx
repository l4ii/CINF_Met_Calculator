import { copperPageKindForSheet } from './shared/copperStageNavigation.tsx'
import CopperOxySideBlowSession, {
  type CopperOxySideBlowSessionProps,
} from './shared/CopperOxySideBlowSession.tsx'
import CopperCaseWorkspace from './CopperCaseWorkspace.tsx'
import SmeltingBatchCalcPage from './smelting/SmeltingBatchCalcPage.tsx'
import SmeltingEquipmentPage from './smelting/SmeltingEquipmentPage.tsx'
import ConvertingBatchCalcPage from './converting/ConvertingBatchCalcPage.tsx'
import ConvertingEquipmentPage from './converting/ConvertingEquipmentPage.tsx'
import RefiningPlaceholderPage from './refining/RefiningPlaceholderPage.tsx'
import CopperCaseSummaryPage from './summary/CopperCaseSummaryPage.tsx'

export { default as CopperCaseWorkspace } from './CopperCaseWorkspace.tsx'
export { default as SmeltingBatchCalcPage } from './smelting/SmeltingBatchCalcPage.tsx'
export { default as SmeltingEquipmentPage } from './smelting/SmeltingEquipmentPage.tsx'
export { default as ConvertingBatchCalcPage } from './converting/ConvertingBatchCalcPage.tsx'
export { default as ConvertingEquipmentPage } from './converting/ConvertingEquipmentPage.tsx'
export { default as RefiningPlaceholderPage } from './refining/RefiningPlaceholderPage.tsx'
export { default as CopperCaseSummaryPage } from './summary/CopperCaseSummaryPage.tsx'
export { buildSmeltingHeatBalanceSourceMaterials } from './smelting/smeltingHeatBalanceMaterials.ts'
export { buildConvertingHeatBalanceSourceMaterials } from './converting/convertingHeatBalanceMaterials.ts'
export {
  createConvertingProductConstraintConfig,
  ensureStageUsesConvertingProductPhases,
} from './converting/convertingProductConstraints.ts'

export type CopperWorkflowShellProps = Omit<CopperOxySideBlowSessionProps, 'forcedPageKind'>

/**
 * 铜火法富氧侧吹总壳：一页一文件挂载。
 * 熔炼/吹炼配料为独立锁定页面（模块级 cache 在 remount 时恢复）；其余页仍走 Session 早退分支。
 */
export default function CopperWorkflowShell(props: CopperWorkflowShellProps) {
  const kind = copperPageKindForSheet(props.activeSheet)
  switch (kind) {
    case 'workspace':
      return <CopperCaseWorkspace {...props} />
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
      return <CopperCaseSummaryPage {...props} />
    default:
      return <CopperOxySideBlowSession {...props} forcedPageKind={kind} />
  }
}
