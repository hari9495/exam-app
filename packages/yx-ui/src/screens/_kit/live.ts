// Designed screens made live (design audit): the app frame and Home (steps 0 and 1), People › Directory (step 2).
export { DesktopFrame, SCREEN_RAIL, type AreaId, type DesktopFrameProps, type LiveFrame, type PanelItem, type PanelSection } from './frames';
export { DirectoryPhone, DirectoryScreen, type DirectoryMe, type DirectorySavedView, type DirectoryViewState, type LiveDirectory, type WorkforceFilter } from '../people/directory';
export type { WorkforceRow } from '../people/people-data';
export { PALETTE_PLACEHOLDER, RoleHomeScreen, type LiveHome, type RoleHomeScreenProps } from '../platform-a/shell-home';
// The Home panel's pages (design audit step 2): notifications, search, my requests, delegation, notification preferences.
export { NotificationsInboxScreen, MyRequestsScreen, DelegationScreen, type LiveInbox, type LiveMyRequests, type LiveDelegation, type NotificationsInboxProps } from '../platform-a/inbox';
export { SearchResultsScreen, type LiveSearchResults, type SearchHit } from '../platform-a/shell-home';
export { NotificationPreferencesScreen, type DigestMode, type NotificationPreference, type NotificationPreferencesProps } from '../platform-a/preferences';
export type { MyRequest, NotifCategory, PlatformNotification } from '../platform-a/platform-data';
// People › person record (design audit step 3): PPL-03 with the live record.
// PPL-36 / PPL-37: possible same person, merge and unmerge.
export { MergeReview, SamePersonQueue, type LiveMerge, type LiveSamePerson, type LiveUnmerge, type MergeKeep, type SamePersonRow } from '../people/relations';
// PPL-44: trading pre-clearance (the person's own, and the compliance officer's decisions).
export { PreclearanceQueue, TradingPreclearance, type LivePreclearance, type LivePreclearanceQueue, type PreclearanceInput, type PreclearanceItem, type PreclearanceRules } from '../people/selfservice';
// PPL-43: BFSI annual declarations and the compliance officer's register.
export { BfsiComplianceList, BfsiDeclarations, type BfsiHolding, type BfsiRelated, type LiveBfsi, type LiveBfsiRegister } from '../people/selfservice';
// PPL-38: the disability declaration (the person's own, and the HR diversity role's list).
export { DisabilityDeclaration, type DisabilityInput, type LiveDisability, type LiveDisabilityList } from '../people/selfservice';
// PPL-46: the salary account abroad (HR's page and the person's own).
export { InternationalBankPhone, InternationalBankTab, type LiveIntlBank } from '../people/record';
export { PersonWorkspace, type LiveRecord, type LiveRecordPay, type RecordAsset, type RecordDoc, type RecordEvent, type RecordFact, type RecordPerformance, type RecordRole, type RecordTab } from '../people/record';
export type { FieldRow, JobChange } from '../people/people-data';
export { CustomFieldsDrawer, EmployeeFieldsScreen, CLASS_LABEL as CUSTOM_CLASS_LABEL, customValueText, type DataClass, type EmployeeFieldDef, type EmployeeFieldsScreenProps, type RecordCustomField } from '../people/custom-fields';
export type { CustomField as RecordCustomRow } from '../people/record';
export { ContactsDrawer, FamilyDrawer, type EmergencyContact, type FamilyMember, type Nomination, type RecordFamily } from '../people/family';
// PPL-02 Org chart and PPL-08 My team with live data.
export { OrgChartScreen, type LiveOrgChart } from '../people/directory';
export { TeamPage, type LiveTeam, type TeamMember as TeamPageMember } from '../people/directory';
// PPL-08 "Request a hire": the designed HIR-02 requisition sheet.
export { RequisitionSheet, type LiveRequisitionSheet } from '../hiring/hiring-plan';
export type { PlanLine } from '../hiring/hiring-logic';
// Onboarding (PPL-11 to PPL-17, PPL-41) with live data.
export { OnboardingBoard, joinerCard, type JoinerCard, type LiveBoard } from '../people/onboarding';
export type { KanbanColumn } from '../../components/kanban';
export { ReadyToOnboardQueue, type LiveReady, type ReadyRow } from '../people/onboarding';
export { PreboardingBatches, type BatchRow, type LiveBatches } from '../people/onboarding';
export { ProbationQueue, type LiveProbation, type ProbRow, type ProbationDraft, type ProbationOutcome } from '../people/onboarding';
export { JourneyRecord, type LiveJourney } from '../people/onboarding';
export { LifeEventsList, MyChecklistTasks } from '../people/checklists';
export { BulkChangesWizard, ChangeActionSheet, ScheduledChangesScreen, type LiveChangeAction, type LiveScheduled, type Sched as ScheduledRow } from '../people/changes';
export type { IncrementInput, IncrementResult, LiveIncrement } from '../people/increment';
export { ExitCasesList, type ExitRow as ExitListRow, type LiveExits } from '../people/exits';
export { ExitCaseWorkspace } from '../people/exits';
export { DeathInServiceFlow, type LiveDeath } from '../people/exits';
export { ProfileChangeRequest, type LiveProfileChange } from '../people/selfservice';
export { MyDataScreen, type LiveMyData } from '../people/selfservice';
export { ClearanceSignoffs, type LiveClearance } from '../people/exits';
export { AbscondingTimeline, type LiveAbsconding } from '../people/exits';
// PPL-22 F&F calculator with the live settlements (Payroll › Full and final).
export { FnfCalculator, type LiveFnf } from '../people/exits';
export { VrsScheme, type LiveVrs } from '../people/relations';
export { ReverificationCycles, type ReverifData, type ReverifRow, type ReverifRule, type ReverifRuleInput } from '../people/reverification';
export { UpcomingExits } from '../people/upcoming';
// PPL-50 Team pay access: the manager's request (from the Pay tab) and HR's two approvals.
export { PAY_ACCESS_DAYS, PayAccessDialog, PayAccessNote, PayAccessRequests, type PayAccessAskInput, type PayAccessDecision, type PayAccessRow } from '../people/pay-access';
export { DocumentVerificationQueue, type LiveDocQueue } from '../people/documents';
export { BulkLetterWizard, IssuedLettersRegister, type LiveBulkLetters, type LiveLetters } from '../people/documents';
export { LetterTemplatesList, type LiveLetterTemplates, type TemplateSpec } from '../people/documents';
// PPL-30 Me › Documents and letters: uploads, letters and pay documents in one list, with expiring share links.
export { MyDocuments, type LiveMyDocuments, type MyDocSource, type MyLetter, type MyPayDocument } from '../people/documents';
// PPL-31 Me › Request a certificate: the kinds the company switched on, made at once or sent to HR.
export { CertificateRequest, type LiveCertificateRequest, type MyCertificateKind } from '../people/documents';
export { AssetRegister, type Asset as AssetListRow, type LiveAssets } from '../people/assets';
// People › Import (PPL-07), Buddies (PPL-41), Succession (PPL-26) and Union register (PPL-39) with live data.
export { EmployeeImportWizard } from '../people/changes';
export type { ImportDraftState, ImportDraftSummary, ImportFile, ImportInput, ImportResult, LiveImport } from '../people/import';
export { BuddyPanel, type LiveBuddies } from '../people/onboarding';
export { SuccessionScreen, type LiveSuccession } from '../people/assets';
export { UnionRegister, type LiveUnionRegister } from '../people/relations';
// People › Restructure (PPL-09): the wizard, the record with approval and results, and the PPL-10 checklist.
export { RestructureWizard } from '../people/changes';
export { FinishedRestructuresScreen, RestructureRecord, type ContinuityItemData, type FinishedRestructure, type LiveRestructure, type RestructureDraftState, type RestructureInput, type RestructurePreview, type RestructureRecordData, type RestructureSetup, type RestructureSummary } from '../people/restructure';
