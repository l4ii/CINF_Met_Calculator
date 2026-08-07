import CopperOxySideBlowSession, {
  type CopperOxySideBlowSessionProps,
} from '../shared/CopperOxySideBlowSession.tsx'

export type RefiningPlaceholderPageProps = Omit<CopperOxySideBlowSessionProps, 'forcedPageKind'>

/** 铜火法富氧侧吹 — 精炼/精炼设备选型占位 */
export default function RefiningPlaceholderPage(props: RefiningPlaceholderPageProps) {
  return <CopperOxySideBlowSession {...props} forcedPageKind="refining-placeholder" />
}
