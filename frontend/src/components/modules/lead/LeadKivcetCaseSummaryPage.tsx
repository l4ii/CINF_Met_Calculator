import LeadKivcetOxySideBlowSession, {
  type LeadKivcetOxySideBlowSessionProps,
} from './shared/LeadKivcetOxySideBlowSession.tsx'
import { leadToCopperSheet, copperToLeadSheet, copperPageKindForLeadSheet } from './shared/leadKivcetStageNavigation.ts'

export type LeadKivcetCaseSummaryPageProps = Omit<LeadKivcetOxySideBlowSessionProps, 'forcedPageKind'>

export default function LeadKivcetCaseSummaryPage(props: LeadKivcetCaseSummaryPageProps) {
  return (
    <LeadKivcetOxySideBlowSession
      {...props}
      activeSheet={leadToCopperSheet(props.activeSheet)}
      onStageSelect={(sheet) => props.onStageSelect(copperToLeadSheet(sheet))}
      forcedPageKind={copperPageKindForLeadSheet('pb_kivcet_summary')}
    />
  )
}
