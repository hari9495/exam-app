// Designed screens made live (design audit): the app frame and Home (steps 0 and 1), People › Directory (step 2).
export { DesktopFrame, SCREEN_RAIL, type AreaId, type DesktopFrameProps, type LiveFrame, type PanelItem, type PanelSection } from './frames';
export { DirectoryPhone, DirectoryScreen, type DirectoryMe, type DirectorySavedView, type DirectoryViewState, type LiveDirectory, type WorkforceFilter } from '../people/directory';
export type { WorkforceRow } from '../people/people-data';
export { PALETTE_PLACEHOLDER, RoleHomeScreen, type LiveHome, type RoleHomeScreenProps } from '../platform-a/shell-home';
// The Home panel's pages (design audit step 2): notifications, search, my requests, delegation, notification preferences.
export { NotificationsInboxScreen, MyRequestsScreen, DelegationScreen, ApprovalsInboxScreen, type LiveInbox, type LiveMyRequests, type LiveDelegation, type LiveApprovals, type NotificationsInboxProps } from '../platform-a/inbox';
export type { ApprovalRow } from '../platform-a/platform-data';
export type { ApprovalStep } from '../../components/timeline';
export { SearchResultsScreen, type LiveSearchResults, type SearchHit } from '../platform-a/shell-home';
export { NotificationPreferencesScreen, type DigestMode, type NotificationPreference, type NotificationPreferencesProps } from '../platform-a/preferences';
export type { MyRequest, NotifCategory, PlatformNotification } from '../platform-a/platform-data';
// People › person record (design audit step 3): PPL-03 with the live record.
// PPL-36 / PPL-37: possible same person, merge and unmerge.
export { MergeReview, SamePersonQueue, type LiveMerge, type LiveSamePerson, type LiveUnmerge, type MergeKeep, type SamePersonRow } from '../people/relations';
// PPL-44: trading pre-clearance (the person's own, and the compliance officer's decisions).
export { PreclearanceQueue, TradingPreclearance, type LivePreclearance, type LivePreclearanceQueue, type PreclearanceInput, type PreclearanceItem, type PreclearanceRules, type TradingWindow, type TradingWindowInput } from '../people/selfservice';
// PPL-43: BFSI annual declarations and the compliance officer's register.
export { BfsiComplianceList, BfsiDeclarations, type BfsiHolding, type BfsiRelated, type LiveBfsi, type LiveBfsiRegister } from '../people/selfservice';
// PPL-38: the disability declaration (the person's own, and the HR diversity role's list).
export { DeclarationsSwitch, DisabilityDeclaration, type DeclarationsPage, type DisabilityInput, type LiveDisability, type LiveDisabilityList } from '../people/selfservice';
// PPL-46: the salary account abroad (HR's page and the person's own).
export { InternationalBankPhone, InternationalBankTab, type LiveIntlBank, type LiveSplit, type SplitLineInput } from '../people/record';
export { PersonWorkspace, type LiveRecord, type LiveRecordPay, type RecordAsset, type RecordDoc, type RecordEvent, type RecordFact, type RecordLearning, type RecordPerformance, type RecordRole, type RecordTab } from '../people/record';
export type { FieldRow, JobChange } from '../people/people-data';
export { CustomFieldsDrawer, EmployeeFieldsScreen, CLASS_LABEL as CUSTOM_CLASS_LABEL, customValueText, type DataClass, type EmployeeFieldDef, type EmployeeFieldsScreenProps, type FieldEntity, type RecordCustomField } from '../people/custom-fields';
export type { CustomField as RecordCustomRow } from '../people/record';
export { ContactsDrawer, FamilyDrawer, type EmergencyContact, type FamilyMember, type Nomination, type RecordFamily } from '../people/family';
// PPL-02 Org chart and PPL-08 My team with live data.
export { OrgChartScreen, type LiveOrgChart } from '../people/directory';
export { TeamPage, type LiveTeam, type TeamMember as TeamPageMember } from '../people/directory';
// PPL-08 "Request a hire": the designed HIR-02 requisition sheet.
export { RequisitionSheet, type LiveRequisitionSheet } from '../hiring/hiring-plan';
// HIR-03 Jobs list and job workspace, HIR-24 job pay range (the designed screens with `live`).
export { CreateJobSheet, JobPayRangePanel, JobsScreen, JobWorkspaceScreen, type CreateJobChoices, type LiveJobRow, type LiveJobs, type LiveJobWorkspace, type LivePayRange, type LivePosting, type NewJob, type PayPeriod, type PayRangeInput } from '../hiring/hiring-plan';
export type { Job as HiringJobRow } from '../hiring/hiring-data';
export type { PayLaw } from '../hiring/hiring-logic';
export type { PlanLine } from '../hiring/hiring-logic';
// Onboarding (PPL-11 to PPL-17, PPL-41) with live data.
export { OnboardingBoard, joinerCard, type JoinerCard, type LiveBoard } from '../people/onboarding';
export type { KanbanColumn } from '../../components/kanban';
export { ReadyToOnboardQueue, type LiveReady, type ReadyRow } from '../people/onboarding';
export { PreboardingBatches, type BatchRow, type LiveBatches } from '../people/onboarding';
export { ProbationQueue, type LiveProbation, type ProbRow, type ProbationDraft, type ProbationOutcome } from '../people/onboarding';
export { JourneyRecord, type LiveJourney } from '../people/onboarding';
export { LifeEventsList, MyChecklistTasks } from '../people/checklists';
export { BulkChangesWizard, ChangeActionSheet, ChangeActionDrawer, ScheduledChangesScreen, type LiveChangeAction, type LiveScheduled, type Sched as ScheduledRow } from '../people/changes';
export type { IncrementInput, IncrementResult, LiveIncrement } from '../people/increment';
export { ExitCasesList, type ExitRow as ExitListRow, type LiveExits } from '../people/exits';
export { ExitCaseWorkspace } from '../people/exits';
export { ResignationSheet, type LiveResignation } from '../people/exits';
export { ExitInterview, type LiveExitInterview } from '../people/exits';
export { DeathInServiceFlow, type LiveDeath } from '../people/exits';
export { ProfileChangeRequest, type LiveProfileChange } from '../people/selfservice';
export { MyDataScreen, type CorrectionInput, type LiveMyData, type NomineeInput, type PrivacyNominee } from '../people/selfservice';
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
export { AssetPageScreen, type AssetPageData, type AssetDetailsInput, type LiveAssetPage } from '../people/asset-page';
// IT assets part 3 (answer 2716): the IT and Admin supplier list.
export { AssetSuppliersScreen, type LiveSuppliers, type SupplierInput, type SupplierRow } from '../people/asset-suppliers';
// Answer 2717: asset contracts.
export { AssetContractsScreen, type ContractInput, type ContractRow, type LiveContracts } from '../people/asset-contracts';
// Answer 2718: software licences and their seats.
export { AssetLicencesScreen, type LicenceInput, type LicenceRow, type LiveLicences, type SeatTarget } from '../people/asset-licences';
// IT assets part 1 (answer 2712): Settings 2.8 Assets, the company's asset categories.
export { AssetCategoryDrawer, assetSettingsPage, type AssetCategoryInput, type AssetCategoryRow } from '../settings/asset-settings-live';
// People › Import (PPL-07), Buddies (PPL-41), Succession (PPL-26) and Union register (PPL-39) with live data.
export { EmployeeImportWizard } from '../people/changes';
export type { ImportDraftState, ImportDraftSummary, ImportFile, ImportInput, ImportResult, LiveImport } from '../people/import';
export { BuddyPanel, type LiveBuddies } from '../people/onboarding';
export { SuccessionScreen, type LiveSuccession } from '../people/assets';
export { UnionRegister, type LiveUnionRegister } from '../people/relations';
// People › Restructure (PPL-09): the wizard, the record with approval and results, and the PPL-10 checklist.
export { RestructureWizard } from '../people/changes';
export { MassUpdateDrawer, PositionRecordScreen, PositionsScreen, PositionsSwitchOnScreen, SeatChangeDrawer, seatStatusBadge, type SeatChangeInput, type SeatList, type SeatOptions, type SeatRecord, type SeatRow, type SeatValues, type SwitchOnData } from '../people/positions';
export { FinishedRestructuresScreen, RestructureRecord, type ContinuityItemData, type FinishedRestructure, type LiveRestructure, type RestructureDraftState, type RestructureInput, type RestructurePreview, type RestructureRecordData, type RestructureSetup, type RestructureSummary } from '../people/restructure';
export { AskDocumentDialog, SendBackDialog, UploadForPersonDialog, WorkPhoneDialog, workPhoneOk, type AskableType } from '../people/record-dialogs';
export { DispatchProofDialog, StartAbscondingDialog, StopAbscondingDialog } from '../people/exits';
export { SetupHubScreen, type LiveSetupHub, type ModuleCard, type SetupHubProps } from '../platform-a/setup-admin';
// Learning (the core): My learning and catalogue, the player, courses and the builder, assignment rules, compliance, the team.
export { MyLearningScreen, CoursePlayerScreen, type Course as LearningCourse } from '../growth/learn-me';
export { CourseBuilderScreen, AssignmentRulesScreen, ComplianceDashboardScreen, SessionsScreen, TrainerQrScreen } from '../growth/learn-admin';
export {
  CoursesListScreen,
  TeamLearningScreen,
  fromConditions,
  type CourseDetails,
  type CourseRow,
  type BuilderLiveItem,
  type LiveBuilder,
  type LiveCertificate,
  type LiveCompliance,
  type LiveComplianceData,
  type LiveCourses,
  type LiveEnrolment,
  type LiveExternal,
  type ExternalInput,
  type LiveMyLearning,
  type LivePlayer,
  type LivePlayerItem,
  type LiveRule,
  type LiveRules,
  type LiveTeamLearning,
  type RuleInput as LearningRuleInput,
  type TeamLearningData,
} from '../growth/learn-live';
// Learning sessions (LRN-04, 05, 06).
export {
  LiveSessionsScreen,
  LiveSessionPageScreen,
  LiveTrainerQrScreen,
  CheckInScreen,
  type LiveSessions,
  type LiveSessionRow,
  type LiveTrainerRow,
  type LiveSessionPage,
  type LiveSessionPageData,
  type LiveTrainerQr,
  type ScheduleInput,
  type TrainerInput,
  type SessionOption,
} from '../growth/learn-sessions-live';
// LRN-12: a session's rating and the manager's training check (ported onto the sessions above).
export { TrainingFeedbackScreen } from '../growth/learn-me';
export type { LiveFeedback } from '../growth/learn-feedback-live';
// G3d: skills (LRN-09, 10, 15), training needs and budgets (LRN-11), and the committees' counts (answer 2620).
export { SkillsProfileScreen, SkillSuggestionsScreen } from '../growth/learn-me';
export { TeamSkillsMatrixScreen, TrainingNeedsScreen } from '../growth/learn-admin';
export type { LiveNeedRow, LiveSkillProfileData, LiveSkillSuggestions, LiveSkillsProfile, LiveTeamSkills, LiveTeamSkillsData, LiveTrainingNeeds, NeedInput, PoshCounts } from '../growth/learn-skills-live';
// G4: the report library (ANL-06) and company documents (PPL-51).
export { ReportLibraryScreen } from '../proctoring/analytics';
export type { LiveReportLibrary, LiveReportRow } from '../proctoring/report-library-live';
export { CompanyDocumentsScreen } from '../people/company-docs';
export type { CompanyDocRow, CompanyDocsData, LiveCompanyDocs, UploadInput } from '../people/company-docs';
// G4 (2690-2692): scheduled report emails and the export log (ANL-08).
export { SchedulesScreen } from '../proctoring/analytics';
export type { LiveExportRow, LiveReportSchedules, LiveScheduleRow, ScheduleFrequency } from '../proctoring/report-schedules-live';
