import AntimonyOxySideBlowSession, {
  type AntimonyOxySideBlowSessionProps,
} from '../shared/AntimonyOxySideBlowSession.tsx'

export type RefiningPlaceholderPageProps = Omit<AntimonyOxySideBlowSessionProps, 'forcedPageKind'>

/** 锑火法富氧侧吹 — 精炼/精炼设备选型占位 */
export default function RefiningPlaceholderPage(props: RefiningPlaceholderPageProps) {
  return <AntimonyOxySideBlowSession {...props} forcedPageKind="refining-placeholder" />
}
