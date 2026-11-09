// Recruitment (M10), wired to the hiring API (M10-BUILD-DESIGN). Batch AT1: the jobs list.
// Import the stylesheet once: '@yukthix/ui/styles.css'.
export * from './types';
// HIR-01: the designed headcount plan board, live with its `live` prop (the stand-in is gone).
export { HeadcountPlanScreen, PlanEditorDrawer, type LiveHeadcountPlan, type LivePlan, type LivePlanLine, type PlanInput as HeadcountPlanInput, type PlanChoice } from '../hiring-plan';
export { ApprovalRoutesScreen, type ApprovalRoutesScreenProps } from './routes';
export { CareersSiteScreen, type CareersSiteScreenProps } from './careers';
export { JobBoardsScreen, type JobBoardsScreenProps } from './boards';
// HIR-05: the designed candidate record, merge, candidate list and retention, live with their `live` prop.
export { EmailDialog, STAGE } from '../candidate-dialogs';
export { CandidateRecordScreen, MergeDrawer, type LiveCandidateRecord, type LiveDuplicate, type LiveMergeDrawer, type MergeFieldRow } from '../hiring-pipeline';
export { CandidateListScreen, CandidateRetentionScreen, type CandidateListTab, type CandidateStatusFilter, type DataRequestMatch, type LiveCandidateList, type LiveRetention } from '../hiring-candidates';
export { TalentPoolsScreen, type TalentPoolsScreenProps } from './talent';
// HIR-04 follow-ups (answer 261): the Bulk actions and Add candidate sheets on the board, the job settings on the HIR-03
// workspace, and the application on the HIR-05 record (the old candidates list and application panel are gone).
export { AddCandidateSheet, BulkActionsSheet, RejectDialog, scorecardText, type AddCandidateInput, type BulkRow } from '../pipeline-sheets';
export { ApplicationDrawer, type ApplicationDrawerProps } from '../candidate-application';
export { JobSettingsPanel, StageTargetsSheet, type LiveJobSettings, type StageTarget, type StageTargetChange, type JobSettingsPatch } from '../job-settings';
export { MyInterviewsScreen, InterviewScreen, ScorecardTemplatesScreen, type MyInterviewsScreenProps, type InterviewScreenProps, type ScorecardTemplatesScreenProps } from './interviews';
// HIR-11 and HIR-12: the designed screens themselves (hiring-plan.tsx), made live with their `live` prop.
export { AllReferralsScreen, RecruitingCostsScreen, ReferralsScreen, type AllReferral, type LiveAllReferrals, type CostEntry, type CostInput, type LiveRecruitingCosts, type LiveReferrals, type ReferInput, type ReferJob, type Referral } from '../hiring-plan';
// HIR-02 and HIR-26: the designed requisitions list and rediscovery panel (hiring-plan.tsx), made live with `live`.
export { RediscoveryPanel, RequisitionsScreen, type LiveRediscovery, type LiveRequisitionRow, type LiveRequisitions, type RediscoveryMatch } from '../hiring-plan';
// HIR-04: the designed pipeline board itself, live with its `live` prop (the stand-in board is gone).
export { PipelineBoardScreen, type LivePipelineBoard, type LivePipelineCard, type LivePipelineStage } from '../hiring-pipeline';
export type { Score as PipelineScore } from '../hiring-kit';
// Settings 6.1 Hiring: the designed settings page made live with `live` (founder answers 291 and 302).
export { SettingsPageScreen, type LiveSettingsPage } from '../../settings/settings-screens';
export { SETTINGS_GROUPS } from '../../settings/settings-groups';
export { hiringSettingsPage, hiringSettingsChanges, type HiringSettingsData } from '../../settings/hiring-live';
