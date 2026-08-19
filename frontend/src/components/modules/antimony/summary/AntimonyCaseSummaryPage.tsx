import AntimonyOxySideBlowSession, {
  type AntimonyOxySideBlowSessionProps,
} from '../shared/AntimonyOxySideBlowSession.tsx'

export type AntimonyCaseSummaryPageProps = Omit<AntimonyOxySideBlowSessionProps, 'forcedPageKind'>

/** 锑火法富氧侧吹 — 案例汇总 */
export default function AntimonyCaseSummaryPage(props: AntimonyCaseSummaryPageProps) {
  return <AntimonyOxySideBlowSession {...props} forcedPageKind="summary" />
}
