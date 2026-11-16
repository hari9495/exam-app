// The YukthiX platform console (P14 §7; YukthiX staff only) and support sessions (P02 Q8).
// Import the stylesheet once: '@yukthix/ui/styles.css'.
export * from './types';
export { ConsoleShell, CONSOLE_LINKS, type ConsoleShellProps, type ConsolePageId } from './console-shell';
export { CompaniesScreen, slugFrom, type CompaniesScreenProps } from './companies';
// C-5 (answer 1053): New company is the PLT-09 company wizard.
export { TenantWizardScreen } from '../platform-a/setup-admin';
export { wizardInput, type LiveTenantWizard, type WizardInput, type WizardProduct } from '../platform-a/tenant-wizard-live';
// C-5 (answers 948, 1053): planned maintenance (the designed YX-10 screen, live).
export { IncidentComposerScreen, HelpEditorScreen, NudgeEditorScreen } from '../portals/console-ops';
// C-8 (YX-12): nudges per feature switch, and the card a company person sees.
export { NudgeCard } from '../portals/console-nudges-live';
// C-8 (YX-13): the sales-assist queue.
export { SalesAssistScreen, ProductAnalyticsScreen } from '../portals/console-ops';
export type { LiveAnalytics } from '../portals/console-analytics-live';
export type { LiveSales, SalesLiveRow, SalesOutcome } from '../portals/console-sales-live';
export type { LiveNudges, NudgeRow, NudgeKind } from '../portals/console-nudges-live';
// C-8 (YX-11): the help-centre editor.
export type { LiveHelpCentre, HelpRow, HelpDetail, HelpInput, HelpSettingRow } from '../portals/console-helpcentre-live';
export type { LiveMaintenance, MaintenanceRow, MaintenanceSettingRow, CurrentMaintenance } from '../portals/console-maintenance-live';
// C-8 (YX-10): incidents.
export type { LiveIncidents, IncidentLiveRow, IncidentUpdateRow, ContainmentChoice, IncidentOpenInput, IncidentUpdateInput } from '../portals/console-incidents-live';
export { CompanyScreen, supportInput, type CompanyScreenProps } from './company';
export { CompanySettingsScreen, type CompanySettingsScreenProps } from './company-settings';
export { PlansScreen, priceInput, type PlansScreenProps } from './plans';
// C-2 (answers 1047, 1048): the designed YX-04 Customer success screen, live.
export { CustomerSuccessScreen } from '../portals/console-ops';
export type { LiveCustomerSuccess, CsHealthRow, CsMessageRow, CsSettingRow, CsFollowup } from '../portals/console-cs-live';
export { WhatsNewConsoleScreen, newsInput, NEWS_AUDIENCES, type WhatsNewConsoleScreenProps, type NewsEntryRow, type NewsInput } from './whats-new';
export { SupportSessionsScreen, type SupportSessionsScreenProps } from './support';
export { PlatformAuditScreen, type PlatformAuditScreenProps } from './audit';
export { LIFECYCLE_LABEL, SUPPORT_LABEL, actionWords, ConsolePage } from './console-kit';
// Batch 4: YukthiX support
export { SupportDeskQueueScreen, SupportDeskTicketScreen, TenantPanel, textToParagraphs, sessionWords, type SupportDeskQueueScreenProps, type SupportDeskTicketScreenProps, type DeskQueueRow, type DeskConsoleTicket, type DeskConsoleMessage, type DeskTenantPanel, type DeskConsoleSession } from './support-desk';
// Console C-1 (answers 1041 to 1044): the drawn YX-01 to YX-03 screens, live with `live`.
export { RuleSetEditorScreen, GoldenCasesScreen, PublishSchedulerScreen, type LiveRuleEditor, type LiveGolden, type LivePublish } from '../portals/console-rules';
export type { LiveRuleRow, LiveRuleDetail, LiveGoldenRun, LiveImpact, RuleUpdateInput, RuleState } from '../portals/console-rules-live';
// Console C-4 (answers 1049, 1050): the drawn YX-04 Flags and YX-18 Contain tenant, made live.
export { ContainTenantScreen, ContainedBanner, FeatureFlagsScreen, type ContainView, type LiveContain, type LiveFeatureFlags, type LiveFlag } from '../portals/console-ops';
// Answer 1125: Console › Platform settings.
export { PlatformSettingsScreen, type PlatformSettingRow, type PlatformSettingsScreenProps } from './platform-settings';
// Staff roles (answers 1058, 1086).
export { StaffRolesScreen, KEY_WORDS, rolesInput, type StaffRolesScreenProps, type StaffRoleDef, type StaffRoleId, type StaffRow } from './staff';
export { AssistantReviewConsoleScreen, type AssistantReviewScreenProps, FeatureRequestsConsoleScreen, FEATURE_STATUS_LABEL, type FeatureRequestsScreenProps, type FeatureRequestRow, type FeatureStatus, type AssistantReview } from './feature-requests';
