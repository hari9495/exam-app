// Recruitment (M10), wired to the hiring API (M10-BUILD-DESIGN). Batch AT1: the jobs list.
// Import the stylesheet once: '@yukthix/ui/styles.css'.
export * from './types';
// HIR-01: the designed headcount plan board, live with its `live` prop (the stand-in is gone).
export { HeadcountPlanScreen, PlanEditorDrawer, type LiveHeadcountPlan, type LivePlan, type LivePlanLine, type PlanInput as HeadcountPlanInput, type PlanChoice } from '../hiring-plan';
export { ApprovalRoutesScreen, type ApprovalRoutesScreenProps } from './routes';
export { CareersSiteScreen, type CareersSiteScreenProps } from './careers';
export { JobBoardsScreen, type JobBoardsScreenProps } from './boards';
export { HiringCandidatesScreen, EmailDialog, STAGE, type HiringCandidatesScreenProps, type CandidateStatusFilter } from './candidates';
export { CandidateProfileScreen, type CandidateProfileScreenProps } from './profile';
export { DuplicatesScreen, TalentPoolsScreen, CandidateRetentionScreen, type DuplicatesScreenProps, type TalentPoolsScreenProps, type CandidateRetentionScreenProps } from './talent';
export { JobWorkspaceScreen, RejectDialog, scorecardText, type JobWorkspaceScreenProps } from './job-workspace';
export { ApplicationPanel, type ApplicationPanelProps } from './application';
export { MyInterviewsScreen, InterviewScreen, ScorecardTemplatesScreen, type MyInterviewsScreenProps, type InterviewScreenProps, type ScorecardTemplatesScreenProps } from './interviews';
