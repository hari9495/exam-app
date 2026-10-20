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
export { PersonWorkspace, type LiveRecord, type LiveRecordPay, type RecordAsset, type RecordDoc, type RecordEvent, type RecordFact, type RecordRole, type RecordTab } from '../people/record';
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
export { ChangeActionSheet, ScheduledChangesScreen, type LiveChangeAction, type LiveScheduled, type Sched as ScheduledRow } from '../people/changes';
