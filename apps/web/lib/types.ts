export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export type QuestionType = 'single_mcq' | 'multi_mcq' | 'true_false' | 'code';
export type Difficulty = 'easy' | 'medium' | 'hard';
export type ExamStatus = 'draft' | 'published' | 'archived';
export type InvitationStatus = 'invited' | 'revoked';
// 'none' = no invite email is part of this invitation's lifecycle (walk-in registration).
export type InvitationEmailStatus = 'pending' | 'sent' | 'failed' | 'none';

export const CODE_LANGUAGE_OPTIONS = ['javascript', 'typescript', 'python', 'java', 'csharp', 'cpp', 'go', 'ruby'] as const;
export type CodeLanguage = (typeof CODE_LANGUAGE_OPTIONS)[number];

export interface Tag {
  id: string;
  name: string;
}

export interface StaffUser {
  id: string;
  organizationId: string | null;
  email: string;
  name: string | null;
  role: string;
  status: string;
  lastLoginAt: string | null;
  createdAt: string;
  // Only the /users/me endpoints return this -- the list endpoints deliberately omit it rather
  // than hand out raw private-container blob paths, so it is absent (not null) there.
  avatarUrl?: string | null;
}

export interface DirectoryUser extends StaffUser {
  organizationName: string | null;
}

export interface AuditLogEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  entityName: string | null;
  actorUserId: string | null;
  actorEmail: string | null;
  actorName: string | null;
  actorRole: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface CandidateDataExport {
  candidate: { id: string; email: string; name: string; phone: string | null; createdAt: string };
  invitations: { id: string; examTitle: string; status: string; invitedAt: string; expiresAt: string; revokedAt: string | null }[];
  attempts: {
    id: string;
    examTitle: string;
    status: string;
    startedAt: string;
    submittedAt: string | null;
    deviceFingerprint: string | null;
    result: { score: number; maxScore: number; percentage: number; passFail: string } | null;
    answers: { questionText: string; selectedOptions: string[]; isCorrect: boolean | null; marksAwarded: number | null }[];
    proctoringEvents: { eventType: string; severity: string; occurredAt: string; metadata: Record<string, unknown> | null }[];
    proctoringAnalysis: { status: string; riskLevel: string | null; summary: string | null } | null;
    insight: { status: string; summary: string | null } | null;
    messages: { body: string; sentAt: string; readAt: string | null }[];
  }[];
}

export interface QuestionOption {
  id: string;
  text: string;
  isCorrect: boolean;
  imageUrl: string | null;
}

export interface Question {
  id: string;
  type: QuestionType;
  text: string;
  topic: string | null;
  category: string | null;
  difficulty: Difficulty;
  marks: number;
  negativeMarks: number;
  status: 'active' | 'archived';
  aiGenerated: boolean;
  languageMode: 'fixed' | 'any';
  allowedLanguages: string[];
  starterCode: string | null;
  allowStdin: boolean;
  snippetCode: string | null;
  snippetLanguage: CodeLanguage | null;
  imageUrl: string | null;
  createdAt: string;
  options: QuestionOption[];
  tags?: Tag[];
}

export interface ExamSection {
  id: string;
  examId: string;
  title: string;
  orderIndex: number;
  selectionMode: 'fixed' | 'pool';
  poolSize: number | null;
  poolDifficulty: Difficulty | null;
  targetDurationMinutes: number | null;
  // This section's share of the exam's grade, independent of its questions' raw marks. Must sum
  // to 100 across an exam's sections before it can be published.
  weightPercent: number;
  /** null = every question must be answered. Otherwise the candidate answers any N. */
  requiredCount: number | null;
  // The exam detail endpoint embeds the full question (options included), not
  // just a summary -- widened to match so callers like the exam preview page
  // don't need a second, separately-filtered fetch to render a question.
  questions: { questionId: string; question?: Question }[];
  // Only meaningful when selectionMode is 'pool' -- the AND-combined tag filter a candidate
  // question must match every one of. Absent/empty for a fixed-mode section.
  poolTags?: { tagId: string; tag: Tag }[];
}

// A pool section draws a random subset fresh at every attempt-start and never stores which
// questions it picked (see the backend's previewSectionPool) -- this is what "preview" returns:
// what the pool would currently draw from, capped at a sane list length, plus the real total
// so a recruiter can see whether there are even enough matching questions to fill poolSize.
export interface PoolPreview {
  poolSize: number;
  poolDifficulty: Difficulty | null;
  poolTags: Tag[];
  totalMatching: number;
  questions: { id: string; text: string; type: QuestionType; difficulty: Difficulty; marks: number }[];
}

export type FeedbackVisibility = 'none' | 'pass_fail' | 'score' | 'breakdown';

export interface Exam {
  id: string;
  title: string;
  instructions: string | null;
  status: ExamStatus;
  durationMinutes: number;
  passCriteriaPercent: number;
  randomizeOrder: boolean;
  feedbackVisibility: FeedbackVisibility;
  schedulingEnabled: boolean;
  availabilityWindowStart: string | null;
  availabilityWindowEnd: string | null;
  walkInEnabled: boolean;
  walkInListed: boolean;
  allowedIpRange: string | null;
  enableAntiCheating: boolean;
  webcamProctoringEnabled: boolean;
  webcamRecordOnly: boolean;
  proctoringEnforcement: 'warn' | 'block';
  proctoringStrikeLimit: number;
  disabledProctoringSignalsJson: string | null;
  screenCaptureEnabled: boolean;
  lockdownRequired: boolean;
  createdAt: string;
  sections: ExamSection[];
  invitationCount: number;
  hasStartedAttempts: boolean;
  /** True only when the exam could ever produce a code question needing manual
   *  grading (a fixed section has one, a pool section currently matches one, or an
   *  attempt is already sitting in pending_manual_grade) -- gates the Grading tab. */
  requiresManualGrading: boolean;
}

// GET /exams (list) also returns attempt-progress counts that GET /exams/:id (detail) omits.
export interface ExamListItem extends Omit<Exam, 'sections'> {
  attemptSettledCount: number;
  attemptTotalCount: number;
}

export type CandidateStatus = 'active' | 'inactive';

export interface Candidate {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  status: CandidateStatus;
  createdAt: string;
  erasedAt: string | null;
  invitationCount?: number;
}

export interface Invitation {
  id: string;
  examId: string;
  candidateId: string;
  status: InvitationStatus;
  emailStatus: InvitationEmailStatus;
  resendCount: number;
  extraTimePercent: number;
  attempt: { id: string; status: string } | null;
  invitedAt: string;
  expiresAt: string;
  revokedAt: string | null;
  candidate: Candidate;
}

export interface BulkInviteResult {
  created: (Invitation & { token: string })[];
  skipped: { candidateId: string; reason: string }[];
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  region: string;
  // Deliberately not an `OrganizationStatus` alias: @exam-platform/shared exports
  // a type by that name with a third member, 'deleted'. Deleted organizations are
  // filtered out server-side and never reach the client, and two same-named types
  // with different members is how a wrong guard gets written later.
  status: 'active' | 'suspended';
  createdAt: string;
  /** Earliest org_admin. Null when the org has none, or when they have not set
   *  their name yet -- creation stores only the email. */
  primaryAdminName: string | null;
  primaryAdminEmail: string | null;
  userCount: number;
  examCount: number;
}

export interface WalkInExamOption {
  id: string;
  title: string;
  durationMinutes: number;
  walkInListed: boolean;
}

export interface WalkInGroupExamSummary {
  id: string;
  title: string;
}

export interface WalkInGroup {
  id: string;
  name: string;
  createdAt: string;
  exams: WalkInGroupExamSummary[];
}

// Every walk-in-enabled exam in the org, whichever group it's currently in (or none) --
// the pool a "manage members" picker offers, so an exam can be moved between groups.
export interface EligibleWalkInExam {
  id: string;
  title: string;
  walkInGroupId: string | null;
}

export interface SuperAdminSummary {
  id: string;
  email: string;
  createdAt: string;
}

export interface BrandingResponse {
  name: string;
  logoUrl: string | null;
  primaryColor: string | null;
  accentColor: string | null;
  textColor: string | null;
}

export interface IntegrationsResponse {
  smtpConfigured: boolean;
  aiKeyConfigured: boolean;
  aiProvider: 'anthropic' | 'openai-compatible';
  aiBaseUrl: string | null;
  aiModelFast: string | null;
  aiModelStandard: string | null;
  smtpHost: string | null;
  smtpPort: number | null;
  emailFromAddress: string | null;
  apiKeyConfigured: boolean;
  apiKeyPrefix: string | null;
  apiKeyCreatedAt: string | null;
  webhookConfigured: boolean;
  webhookUrl: string | null;
}

export interface SsoSettingsResponse {
  samlEnabled: boolean;
  samlIdpEntityId: string | null;
  samlIdpSsoUrl: string | null;
  samlIdpCertificate: string | null;
}

export interface WebhookDeliveryRow {
  id: string;
  eventType: string;
  status: string;
  httpStatusCode: number | null;
  createdAt: string;
}

export type ProctoringEventType =
  | 'tab_switch'
  | 'fullscreen_exit'
  | 'copy_paste'
  | 'right_click'
  | 'dev_tools_detected'
  | 'refresh_warning'
  | 'idle_timeout'
  | 'editor_paste'
  | 'window_blur'
  | 'multi_monitor_detected'
  | 'looking_down';

export interface ProctoringEvent {
  id: string;
  attemptId: string;
  eventType: ProctoringEventType;
  severity: string;
  occurredAt: string;
  metadataJson: string | null;
}

export interface AnswerTelemetry {
  keystrokeChars: number;
  pastedChars: number;
  pasteCount: number;
  largestPasteChars: number;
  secondsToFirstEdit: number;
  activeSeconds: number;
  runCount: number;
}

export interface AttemptQuestionOption {
  id: string;
  text: string;
  imageUrl: string | null;
}

export interface AttemptQuestion {
  id: string;
  text: string;
  type: QuestionType;
  marks: number;
  languageMode: 'fixed' | 'any';
  allowedLanguages: string[];
  starterCode: string | null;
  allowStdin: boolean;
  snippetCode: string | null;
  snippetLanguage: CodeLanguage | null;
  imageUrl: string | null;
  options: AttemptQuestionOption[];
}

export interface AttemptSection {
  title: string;
  targetDurationMinutes: number | null;
  /** null = every question must be answered. Otherwise the candidate may answer any N. */
  requiredCount: number | null;
  questions: AttemptQuestion[];
}

export interface AttemptAnswerSummary {
  questionId: string;
  selectedOptionIds: string[];
  answerText: string | null;
  codeLanguage: string | null;
  isMarkedForReview: boolean;
}

export interface AttemptMessageSummary {
  id: string;
  body: string;
  sentAt: string;
}

export interface AttemptSectionSummary {
  title: string;
  questionCount: number;
}

export interface ExamProctoringConfig {
  enableAntiCheating: boolean;
  webcamEnabled: boolean;
  webcamRecordOnly: boolean;
  enforcement: 'warn' | 'block';
  strikeLimit: number;
  disabledSignals: string[];
  screenCaptureEnabled: boolean;
  lockdownRequired: boolean;
}

export interface AttemptPreview {
  candidateName: string;
  exam: {
    title: string;
    instructions: string | null;
    durationMinutes: number;
    schedulingEnabled: boolean;
    availabilityWindowStart: string | null;
    availabilityWindowEnd: string | null;
    proctoring: ExamProctoringConfig;
  };
  schedulingWindowState: 'not_open' | 'open' | 'closed' | null;
  sections: AttemptSectionSummary[];
  organizationName: string | null;
  organizationLogoUrl: string | null;
  organizationPrimaryColor: string | null;
}

export interface AttemptSectionFeedback {
  title: string;
  score: number;
  maxScore: number;
}

export interface AttemptFeedback {
  status: 'pending_review' | 'settled';
  visibility: 'none' | 'pass_fail' | 'score' | 'breakdown';
  passFail: 'pass' | 'fail' | null;
  percentage: number | null;
  sections: AttemptSectionFeedback[] | null;
}

export interface AttemptState {
  candidateName: string;
  status: string;
  remainingSeconds: number;
  webcamViolationCount: number;
  browserActivityViolationCount: number;
  // Server-authoritative owner of the current pause -- use this instead of guessing from the
  // violation counters. Null if not paused/blocked, or for a pause predating this field.
  pausedReason: 'webcam' | 'browser_activity' | 'screen_share' | null;
  exam: { title: string; proctoring: ExamProctoringConfig };
  // Server-authoritative "must maintain a share to avoid the block" gate -- distinct from
  // exam.proctoring.screenCaptureEnabled, which a bypass deliberately leaves true (a bypass
  // narrows what is punished, never what is watched). Deliberately excludes "is currently
  // sharing"; the client composes that itself from useScreenCapture's own live state.
  screenShareRequired: boolean;
  sections: AttemptSection[];
  answers: AttemptAnswerSummary[];
  messages: AttemptMessageSummary[];
  feedback: AttemptFeedback | null;
  organizationName: string | null;
  organizationLogoUrl: string | null;
  organizationPrimaryColor: string | null;
}

export type AttemptCurrent = AttemptPreview | AttemptState;

export function isAttemptStarted(current: AttemptCurrent): current is AttemptState {
  return 'status' in current;
}

export interface ScoreDistributionBucket {
  rangeLabel: string;
  count: number;
}

export interface AttemptDurationStats {
  avgMinutes: number;
  minMinutes: number;
  maxMinutes: number;
}

export interface ExamResultsSummary {
  totalCandidates: number;
  settledCount: number;
  inProgressCount: number;
  notStartedCount: number;
  passRate: number;
  averagePercentage: number;
  scoreDistribution: ScoreDistributionBucket[];
  attemptDuration: AttemptDurationStats | null;
}

export interface QuestionAccuracyRow {
  questionId: string;
  questionText: string;
  timesIncluded: number;
  timesAttempted: number;
  timesSkipped: number;
  timesCorrect: number;
  accuracyPercentage: number;
}

export interface ProctoringAnalysisSummary {
  status: string;
  riskLevel: string | null;
  summary: string | null;
}

export interface IntegrityFlag {
  type: string;
  severity: string;
  detail: string;
  questionId?: string | null;
  counterpartAttemptId?: string | null;
  similarity?: number | null;
}

export interface IntegritySummary {
  status: string;
  level: string | null;
  flags: IntegrityFlag[];
  narrative: string | null;
}

export interface ExamResultRow {
  candidateId: string;
  candidateName: string;
  invitationId: string;
  attemptId: string | null;
  status: string;
  score: number | null;
  maxScore: number | null;
  percentage: number | null;
  passFail: string | null;
  submittedAt: string | null;
  proctoringAnalysis: ProctoringAnalysisSummary | null;
  integrityLevel: string | null;
  integrityFlagCount: number;
  /** The invite created by advancing this candidate out of this exam, or null if never advanced. */
  nextRound: { examTitle: string; emailStatus: InvitationEmailStatus; invitedAt: string } | null;
}

export interface SectionScore {
  sectionId: string;
  title: string;
  score: number;
  maxScore: number;
  // The weight frozen into this attempt's snapshot at start time. 0 for attempts that predate
  // section weighting, which were scored flat.
  weightPercent: number;
  requiredCount: number | null;
}

export interface CandidateDetailQuestion {
  questionId: string;
  questionText: string;
  type: string;
  marks: number;
  negativeMarks: number;
  options: { id: string; text: string }[];
  selectedOptionIds: string[];
  correctOptionIds: string[];
  isCorrect: boolean | null;
  marksAwarded: number | null;
  counted: boolean;
}

export interface CandidateDetailSection extends SectionScore {
  questions: CandidateDetailQuestion[];
}

export interface WebcamTimelineEntry {
  occurredAt: string;
  kind: 'violation' | 'periodic';
  reason?: string;
  strike?: number;
  snapshot: string;
  screenshot?: string;
  screenshotCapReached?: boolean;
}

export interface CandidateDetail {
  candidateId: string;
  candidateName: string;
  status: string;
  score: number | null;
  maxScore: number | null;
  percentage: number | null;
  passFail: string | null;
  submittedAt: string | null;
  proctoringAnalysis: ProctoringAnalysisSummary | null;
  integrityAnalysis: IntegritySummary | null;
  sections: CandidateDetailSection[];
  webcamTimeline: WebcamTimelineEntry[];
}

export interface CandidateComparisonRow {
  candidateId: string;
  invitationId: string;
  candidateName: string;
  status: string;
  score: number | null;
  maxScore: number | null;
  percentage: number | null;
  passFail: string | null;
  proctoringAnalysis: ProctoringAnalysisSummary | null;
  integrityAnalysis: IntegritySummary | null;
  sectionScores: SectionScore[];
}

export interface AttemptInsight {
  id: string;
  attemptId: string;
  status: string;
  summary: string | null;
  generatedAt: string;
}

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

export interface RosterRow {
  candidateId: string;
  candidateName: string;
  invitationId: string;
  attemptId: string | null;
  status: string;
  online: boolean;
  remainingSeconds: number | null;
  answeredCount: number | null;
  totalQuestions: number | null;
  proctoringBypassed: boolean;
}

export interface ProctoringFlag {
  attemptId: string;
  candidateId: string;
  eventType: string;
  severity: string;
  occurredAt: string;
}

export interface RecruiterLeaderboardRow {
  rank: number;
  candidateId: string;
  candidateName: string;
  correctCount: number;
  totalAutoGradableQuestions: number;
  status: string;
  timeTakenSeconds: number;
  /** Null once the attempt has finished -- there is no "time left" for it anymore. */
  remainingSeconds: number | null;
  /** Null until a Result exists (still in progress, or awaiting manual grading of a
   *  code question). */
  score: number | null;
  maxScore: number | null;
  percentage: number | null;
  passFail: 'pass' | 'fail' | null;
  /** "Scored better than N% of participants", 0-100. */
  percentile: number;
}

export interface CandidateLeaderboardRow {
  rank: number;
  correctCount: number;
  label: string;
  isYou: boolean;
}

export interface CandidateLeaderboardResponse {
  you: { rank: number; correctCount: number } | null;
  top: CandidateLeaderboardRow[];
}

export interface PendingGradingCodeQuestion {
  questionId: string;
  questionText: string;
  starterCode: string | null;
  codeLanguage: CodeLanguage | null;
  answerText: string | null;
  marks: number;
  marksAwarded: number | null;
  gradingFeedback: string | null;
}

export interface PendingGradingRow {
  attemptId: string;
  candidateId: string;
  candidateName: string;
  codeQuestions: PendingGradingCodeQuestion[];
}

export interface CodeAnswerReview {
  id: string;
  answerId: string;
  status: string;
  suggestedMarks: number | null;
  summary: string | null;
  generatedAt: string;
}

export interface DashboardSummary {
  stats: {
    totalCandidates: number;
    invitationsSent: number;
    attemptsInProgress: number;
    pendingGradingCount: number;
  };
  attention: {
    pendingGrading: { examId: string; examTitle: string; count: number }[];
    recentProctoringFlags: { examId: string; examTitle: string; occurredAt: string }[];
    staleInvitationCount: number;
  };
  activity: { id: string; description: string; occurredAt: string }[];
  upcomingExams: { examId: string; examTitle: string; availabilityWindowStart: string }[];
}

export type DashboardTrendMetric = 'candidates' | 'invitations' | 'attempts' | 'pendingGrading';
export type DashboardTrendDays = 7 | 14 | 30 | 90;
export type DashboardPerformanceLimit = 5 | 10 | 'all';
export type DashboardWindow = 'all' | '7d' | '14d' | '30d' | '90d';

export interface DashboardTrend {
  points: { date: string; value: number }[];
}

export interface DashboardExamPerformance {
  exams: { examId: string; examTitle: string; passRate: number; avgScore: number; candidateCount: number }[];
}

export interface DashboardFunnel {
  invited: number;
  started: number;
  submitted: number;
  passed: number;
}

export interface DashboardAnalytics {
  scores: {
    count: number;
    passRate: number | null;
    avg: number | null;
    median: number | null;
    p25: number | null;
    p75: number | null;
    distribution: { bucket: string; count: number }[];
  };
  integrity: {
    submittedAttempts: number;
    cleanAttempts: number;
    flaggedAttempts: number;
    flaggedRate: number;
    byType: { type: string; count: number }[];
    bySeverity: { severity: string; count: number }[];
  };
  funnel: DashboardFunnel & { completionRate: number; abandoned: number };
  timing: {
    avgMinutes: number | null;
    medianMinutes: number | null;
    distribution: { bucket: string; count: number }[];
  };
  examQuality: {
    examId: string;
    examTitle: string;
    candidateCount: number;
    avgScore: number;
    passRate: number;
    scoreSpread: number;
    avgMinutes: number | null;
    allottedMinutes: number;
  }[];
  questionDifficulty: { questionId: string; text: string; correctRate: number; answered: number }[];
}
