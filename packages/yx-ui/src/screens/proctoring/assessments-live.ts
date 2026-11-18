// Assessments AS-1 (answers 2009, 2010, 2017): the designed question bank screens, live with their `live` prop.
// Import the stylesheet once: '@yukthix/ui/styles.css'.
export { ItemAnalysisScreen, QuestionBankScreen, QuestionEditorScreen, QuestionReviewQueueScreen, ScoreReportScreen, TestBuilderScreen } from './bank-tests';

// AS-2 (answers 2007, 2008): the test builder and the score report.

export { MODE_WORDS, poolShort, type BuilderTestView, type ChoiceFilter, type QuestionChoice, type LiveScoreReport, type LiveTestBuilder, type ProctorMode, type TestCheck, type TestDetails, type TestListRow, type TestSection } from './tests-live';
export {
  LANGUAGE_NAME,
  STATUS_LABEL,
  TYPE_LABEL,
  missingAlt,
  type BankContent,
  type BankLanguage,
  type BankLoad,
  type BankQuestion,
  type BankRow,
  type BankSettings,
  type BankStatus,
  type BankTranslation,
  type ItemRow,
  type ItemStats,
  type LiveBank,
  type LiveEditor,
  type LiveItemAnalysis,
  type LiveReviews,
  type ReviewChange,
  type ReviewTranslation,
} from './bank-live';

// Assessments AS-4a (PRC-26, PRC-27): the designed test runner and result page, live with their `live` prop.
export { ResultAppealScreen, TestRunnerScreen, type LiveAssistant, type LiveIntegrityDecision, type LiveResult, type LiveRunner, type LiveRunnerPause, type LiveRunnerQuestion } from './candidate';

// Assessments AS-3 (PRC-07, PRC-21, PRC-32): invitations and drives, the candidate's tests, using an earlier result.
export { CampusKitScreen, CoordinatorPortalScreen, InvitationsScreen } from './delivery';
export { CandidatePortalHomeScreen, ResultReuseScreen } from './candidate';
export { DEFAULT_CAMPUS_SETTINGS, INVITATION_TONE, MY_TEST_BADGE, bulkWords, campusProblem, canRemind, canRevoke, type BulkOutcome, type CampusFieldMode, type CampusResultsVisibility, type InstitutionImportResult, type LiveCampusKit, type LiveCampusSettings, type LiveCollegeRow, type LiveCoordinator, type LiveCoordinatorView, type LiveInstitution, type LiveInstitutionInput, type LiveRegistrant, type LiveCandidateTestStatus, type LiveDriveRow, type LiveInvitationRow, type LiveInvitationStatus, type LiveInvitations, type LiveMyTest, type LivePortal, type LiveReuse, type LiveReuseOffer } from './delivery-live';
export type { CandidateBrand } from './proctoring-shared';
// Assessments AS-4b (answers 2011, 2164): help before the test, the accommodation queue and connectivity above the cap.
export { AccommodationQueueScreen, ConnectivityPanelScreen } from './delivery';
export { AccommodationRequestScreen } from './candidate';
export { HELP_LABEL, approvedForYou, type AccommodationView, type CandidateHelpView, type ConnectivityView, type HelpKind, type LiveAccommodationQueue, type LiveAccommodationRequest, type LiveConnectivity } from './before-test-live';
export { ReadinessCheckScreen, ReadyToStartScreen, type LiveReadiness, type LiveReadyToStart } from './candidate';
// AS-4a part 2 (answer 2201): the designed consent (PRC-24) and selfie (PRC-25) on /welcome.
export { ConsentScreen, IdentityCheckScreen, type LiveConsent, type LiveSelfie, type ManualIdentityCheck } from './candidate';
// AS-5 part 1 (answers 2006, 2008, 2012): integrity review and appeals.
export { AppealsScreen, IncidentWorkspaceScreen, IntegrityQueueScreen, IntegrityReportsScreen } from './integrity';
export type { LiveIntegrityReportData, LiveIntegrityReports } from './integrity-live';
// AS-5 part 3 (PRC-28): the candidate's privacy centre.
export { PrivacyCentreScreen, type LivePrivacy } from './candidate';
// AS-5 part 2 (PRC-13): the live console.
export { LiveConsoleScreen } from './live';
export type { LiveConsole, LiveThreadMessage } from './live-console-live';
export type { LiveTileData } from './proctoring-logic';
export { scoreFromFlags } from './proctoring-logic';
export type { LiveAppealRow, LiveAppeals, LiveIncident, LiveIncidentRow, LiveIncidentWorkspace, LiveIntegrityQueue } from './integrity-live';
export type { SystemCheck } from './proctoring-kit';

// AS-6 (answer 2237): the legal links on live candidate pages.
export { CandidateLegalContext, type CandidateLegal } from './proctoring-shared';

// AS-6 (PRC-19, answers 2019, 2165): marking and fairness.
export { EvaluatorConsoleScreen, FairnessScreen } from './integrity';
export type { FairnessData, FairnessRow, LiveEvaluator, LiveFairness, MarkStatus, MarkingItem } from './marking-live';
// Answer 2234: the candidate's own Run output under the code editor on /exam.
export { CodeRunOutput, type CodeRun } from './proctoring-kit';

// Decision 2398 (step 4): the invitation link (/start) and "session ended" pages.
export { CandidateLinkScreen, type LiveCandidateLink } from './candidate-link';

// Answer 2437: the Results tab of a test page.
export { INTEGRITY_WORDS, RESULT_STATUS, TestResultsPanel, TestResultsScreen, type CompareResult, type LiveResultsPage, type LiveTestResults, type TestResultRow, type TestResultsSummary } from './tests-results';

// Answer 2432: the ANL-02 Recruiter dashboard, live.
export { HIRING_PERIODS, HiringDashboardScreen, type HiringPeriod, type LiveHiringDashboard } from './analytics-live';
