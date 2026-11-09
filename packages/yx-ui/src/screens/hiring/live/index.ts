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
export { JobWorkspaceScreen, RejectDialog, scorecardText, type JobWorkspaceScreenProps } from './job-workspace';
export { ApplicationPanel, type ApplicationPanelProps } from './application';
export { MyInterviewsScreen, InterviewScreen, ScorecardTemplatesScreen, type MyInterviewsScreenProps, type InterviewScreenProps, type ScorecardTemplatesScreenProps } from './interviews';
// HIR-11 and HIR-12: the designed screens themselves (hiring-plan.tsx), made live with their `live` prop.
export { AllReferralsScreen, RecruitingCostsScreen, ReferralsScreen, type AllReferral, type LiveAllReferrals, type CostEntry, type CostInput, type LiveRecruitingCosts, type LiveReferrals, type ReferInput, type ReferJob, type Referral } from '../hiring-plan';
// HIR-04: the designed pipeline board itself, live with its `live` prop (the stand-in board is gone).
export { PipelineBoardScreen, type LivePipelineBoard, type LivePipelineCard, type LivePipelineStage } from '../hiring-pipeline';
export type { Score as PipelineScore } from '../hiring-kit';
