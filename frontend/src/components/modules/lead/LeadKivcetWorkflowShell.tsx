import LeadKivcetOxySideBlowSession, {
  type LeadKivcetOxySideBlowSessionProps,
} from './shared/LeadKivcetOxySideBlowSession.tsx'
import {
  copperPageKindForLeadSheet,
  leadToCopperSheet,
  copperToLeadSheet,
} from './shared/leadKivcetStageNavigation.ts'

export type LeadKivcetWorkflowProps = Omit<LeadKivcetOxySideBlowSessionProps, 'forcedPageKind'>

export default function LeadKivcetWorkflowShell(props: LeadKivcetWorkflowProps) {
  const copperSheet = leadToCopperSheet(props.activeSheet)
  const copperPageKind = copperPageKindForLeadSheet(props.activeSheet)
  return (
    <LeadKivcetOxySideBlowSession
      {...props}
      activeSheet={copperSheet}
      onStageSelect={(nextSheet) => props.onStageSelect(copperToLeadSheet(nextSheet))}
      forcedPageKind={copperPageKind}
    />
  )
}
