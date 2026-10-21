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
export { PersonWorkspace, type LiveRecord, type LiveRecordPay, type RecordAsset, type RecordDoc, type RecordEvent, type RecordFact, type RecordLearning, type RecordPerformance, type RecordRole, type RecordTab } from '../people/record';
export type { FieldRow, JobChange } from '../people/people-data';
// PPL-02 Org chart and PPL-08 My team with live data.
export { OrgChartScreen, type LiveOrgChart } from '../people/directory';
export { TeamPage, type LiveTeam, type TeamMember as TeamPageMember } from '../people/directory';
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
export { ClearanceSignoffs, type LiveClearance } from '../people/exits';
export { AbscondingTimeline, type LiveAbsconding } from '../people/exits';
export { VrsScheme, type LiveVrs } from '../people/relations';
export { UpcomingExits } from '../people/upcoming';
export { DocumentVerificationQueue, type LiveDocQueue } from '../people/documents';
export { IssuedLettersRegister, type LiveLetters } from '../people/documents';
export { AssetRegister, type Asset as AssetListRow, type LiveAssets } from '../people/assets';
// Learning (the core): My learning and catalogue, the player, courses and the builder, assignment rules, compliance, the team.
export { MyLearningScreen, CoursePlayerScreen, type Course as LearningCourse } from '../growth/learn-me';
export { CourseBuilderScreen, AssignmentRulesScreen, ComplianceDashboardScreen } from '../growth/learn-admin';
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
