// Performance (M06), wired to the API (M06-BUILD-DESIGN §20). Batch PM1: Settings › Performance (6.3, PRF-14).
// Import the stylesheet once: '@yukthix/ui/styles.css'.
export * from './types';
export { PerformanceSetupScreen, type PerformanceSetupScreenProps } from './setup';
export { FeedbackTasksScreen, PeerFormScreen, ReviewerBlocksScreen, type FeedbackTasksScreenProps, type PeerFormScreenProps, type ReviewerBlocksScreenProps } from './peer';
// Designed screens made live (builder 2): PRF-08 Quick feedback, PRF-11 1:1s.
export { QuickFeedbackScreen, VISIBILITY as FEEDBACK_VISIBILITY, type FeedbackAsk, type FeedbackItem as QuickFeedbackItem, type FeedbackVisibility, type LiveQuickFeedback } from '../../growth/perf-people';
export { OneOnOneScreen, cadenceLabel, type Cadence, type LiveOneOnOnes, type OneOnOne as OneOnOneRow } from '../../growth/perf-people';
export { CalibrationSessions, CalibrationListScreen, PerformanceReportsScreen, type PerformanceReportsScreenProps, type ReportKind } from './calibration';
// PRF-09 Calibration board and 9-box, the designed screen made live (builder 2).
export { CalibrationScreen, type CalibrationChange, type CalibrationPerson, type LiveCalibration } from '../../growth/perf-talent';
// The PRF-01 … 06 designs, rendered by the live pages with `live` (performance builder 1).
export { PerformanceHomeScreen, MyGoalsScreen, CompanyGoalMapScreen, GoalCheckInSheet } from '../../growth/perf-goals';
export { CycleSetupScreen, CycleControlRoomScreen, ReviewWorkspaceScreen, ReviewAcknowledgeScreen } from '../../growth/perf-reviews';
export { PERF_LINKS, checkinInput, type LiveHome, type LiveMyGoals, type LiveGoalMap } from '../../growth/perf-goals-live';
export { scoreSoFar, type LiveCycleSetup, type LiveControlRoom, type LiveReviewWorkspace, type LiveAcknowledge, type StagePerson } from '../../growth/perf-reviews-live';
export { toGoal, type GoalItem, type PerfHome } from '../../growth/perf-live-data';
export { CompCyclesScreen, type CompCyclesScreenProps } from './comp';
// PRF-10 Comp review sheet, the designed screen made live (builder 2).
export { CompReviewScreen, MarketDataScreen, MARKET_TEMPLATE, type CompProposalInput, type CompRow as CompReviewRow, type LiveCompReview, type MarketDataProps, type MarketSurveyRow, type MarketVersion } from '../../growth/perf-talent';
export { PipsScreen, type PipsScreenProps } from './pips';
// PRF-07 360° nominations, PRF-12 PIP record: the designed screens made live (builder 2).
export { NominationsScreen, type LiveNominations, type Nomination as NominationRow } from '../../growth/perf-reviews';
export { PipRecordScreen, type LivePip, type Pip as PipRecord, type PipRating } from '../../growth/perf-people';
// Performance builder 3 (PRF-13 … PRF-17): the designed growth screens with their `live` paths.
export { HandoverListScreen, CompetencyFrameworkScreen, SuggestedAgendaPanel, type HandoverRow, type HandoverDecision, type LiveHandover, type Competency as FrameworkCompetency, type CompetencySave, type LiveCompetencies, type HandoverAuditEntry, type ImportProblem, type QuestionTagChoice } from '../../growth/perf-people';
export { DisputeRaiseScreen, DisputeRecordScreen, DisputeListScreen, ReviewAssistantPanel, type DisputeCase, type DisputeRow, type LiveDisputeRaise, type LiveDisputeRecord, type LiveReviewAssistant } from '../../growth/perf-reviews';
export { ManagerCoachHome, type LiveCoach } from '../../growth/perf-goals';
export type { CoachNudge } from '../../growth/growth-kit';
export type { BiasFlag } from '../../growth/growth-logic';
export type { ApprovalStep } from '../../../components/timeline';
export { PerfNoAccessScreen, type PerfNoAccessProps } from '../../growth/perf-access';
