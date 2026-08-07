import CopperOxySideBlowSession, {
  type CopperOxySideBlowSessionProps,
} from '../shared/CopperOxySideBlowSession.tsx'

export type CopperCaseSummaryPageProps = Omit<CopperOxySideBlowSessionProps, 'forcedPageKind'>

/** 铜火法富氧侧吹 — 案例汇总 */
export default function CopperCaseSummaryPage(props: CopperCaseSummaryPageProps) {
  return <CopperOxySideBlowSession {...props} forcedPageKind="summary" />
}
