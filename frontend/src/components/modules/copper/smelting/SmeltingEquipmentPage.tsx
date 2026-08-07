import CopperOxySideBlowSession, {
  type CopperOxySideBlowSessionProps,
} from '../shared/CopperOxySideBlowSession.tsx'

export type SmeltingEquipmentPageProps = Omit<CopperOxySideBlowSessionProps, 'forcedPageKind'>

/** 铜-火法-富氧侧吹-熔炼-设备选型 */
export default function SmeltingEquipmentPage(props: SmeltingEquipmentPageProps) {
  return <CopperOxySideBlowSession {...props} forcedPageKind="smelting-equipment" />
}
