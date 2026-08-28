import LeadKivcetOxySideBlowSession, {
  type LeadKivcetOxySideBlowSessionProps,
} from './shared/LeadKivcetOxySideBlowSession.tsx'
import { leadToCopperSheet, copperToLeadSheet, copperPageKindForLeadSheet } from './shared/leadKivcetStageNavigation.ts'

export type LeadKivcetCaseWorkspaceProps = Omit<LeadKivcetOxySideBlowSessionProps, 'forcedPageKind'>

export default function LeadKivcetCaseWorkspace(props: LeadKivcetCaseWorkspaceProps) {
  return (
    <LeadKivcetOxySideBlowSession
      {...props}
      activeSheet={leadToCopperSheet(props.activeSheet)}
      onStageSelect={(sheet) => props.onStageSelect(copperToLeadSheet(sheet))}
      forcedPageKind={copperPageKindForLeadSheet('raw_material')}
    />
  )
}
