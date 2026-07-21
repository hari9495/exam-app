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
}

export interface AuditLogEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  actorUserId: string | null;
  actorEmail: string | null;
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
  codeLanguage: CodeLanguage | null;
  starterCode: string | null;
  allowStdin: boolean;
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
  questions: { questionId: string }[];
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
  createdAt: string;
  sections: ExamSection[];
}

// GET /exams (list) returns counts but not sections — GET /exams/:id (detail) is the reverse.
export interface ExamListItem extends Omit<Exam, 'sections'> {
  invitationCount: number;
  attemptSettledCount: number;
  attemptTotalCount: number;
}

export interface Candidate {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  createdAt: string;
  erasedAt: string | null;
}

export interface Invitation {
  id: string;
  examId: string;
  candidateId: string;
  status: InvitationStatus;
  extraTimePercent: number;
  attempt: { id: string } | null;
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
  createdAt: string;
}

export interface WalkInExamOption {
  id: string;
  title: string;
  durationMinutes: number;
}

export interface SuperAdminSummary {
  id: string;
  email: string;
  createdAt: string;
}

export interface BrandingResponse {
  logoUrl: string | null;
  primaryColor: string | null;
  accentColor: string | null;
}

export interface IntegrationsResponse {
  smtpConfigured: boolean;
  aiKeyConfigured: boolean;
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
  | 'editor_paste';

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
}

export interface AttemptQuestion {
  id: string;
  text: string;
  type: QuestionType;
  marks: number;
  codeLanguage: CodeLanguage | null;
  starterCode: string | null;
  allowStdin: boolean;
  options: AttemptQuestionOption[];
}

export interface AttemptSection {
  title: string;
  targetDurationMinutes: number | null;
  questions: AttemptQuestion[];
}

export interface AttemptAnswerSummary {
  questionId: string;
  selectedOptionIds: string[];
  answerText: string | null;
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

export interface AttemptPreview {
  exam: {
    title: string;
    instructions: string | null;
    durationMinutes: number;
    schedulingEnabled: boolean;
    availabilityWindowStart: string | null;
    availabilityWindowEnd: string | null;
  };
  schedulingWindowState: 'not_open' | 'open' | 'closed' | null;
  sections: AttemptSectionSummary[];
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
  status: string;
  remainingSeconds: number;
  webcamViolationCount: number;
  exam: { title: string };
  sections: AttemptSection[];
  answers: AttemptAnswerSummary[];
  messages: AttemptMessageSummary[];
  feedback: AttemptFeedback | null;
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
}

export interface SectionScore {
  sectionId: string;
  title: string;
  score: number;
  maxScore: number;
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
}

export interface CandidateDetailSection extends SectionScore {
  questions: CandidateDetailQuestion[];
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
}

export interface CandidateComparisonRow {
  candidateId: string;
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
  funnel: {
    invited: number;
    started: number;
    submitted: number;
    passed: number;
  };
  upcomingExams: { examId: string; examTitle: string; availabilityWindowStart: string }[];
}
