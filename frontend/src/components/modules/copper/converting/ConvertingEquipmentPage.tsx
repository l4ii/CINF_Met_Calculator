import CopperOxySideBlowSession, {
  type CopperOxySideBlowSessionProps,
} from '../shared/CopperOxySideBlowSession.tsx'

export type ConvertingEquipmentPageProps = Omit<CopperOxySideBlowSessionProps, 'forcedPageKind'>

/** 铜-火法-富氧侧吹-吹炼-设备选型 */
export default function ConvertingEquipmentPage(props: ConvertingEquipmentPageProps) {
  return <CopperOxySideBlowSession {...props} forcedPageKind="converting-equipment" />
}
