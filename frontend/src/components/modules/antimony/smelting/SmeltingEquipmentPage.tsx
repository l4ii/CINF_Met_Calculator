import AntimonyOxySideBlowSession, {
  type AntimonyOxySideBlowSessionProps,
} from '../shared/AntimonyOxySideBlowSession.tsx'

export type SmeltingEquipmentPageProps = Omit<AntimonyOxySideBlowSessionProps, 'forcedPageKind'>

/** 锑-火法-富氧侧吹-熔炼-设备选型 */
export default function SmeltingEquipmentPage(props: SmeltingEquipmentPageProps) {
  return <AntimonyOxySideBlowSession {...props} forcedPageKind="smelting-equipment" />
}
