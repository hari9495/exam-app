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
  status: 'active' | 'draft' | 'archived';
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
  faceVerificationEnabled: boolean;
  /** allow_unenrolled | retry_then_allow | require_enrolment */
  faceEnrolmentPolicy: string;
  /** flag | warn | pause | block -- stage 2 ships flag-only, see ExamDetailsForm's note */
  faceMismatchAction: string;
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
  jobId: string | null;
}

export type JobStatus = 'open' | 'closed';
export type PipelineStage = 'applied' | 'screened' | 'interview' | 'offer' | 'hired';

export const PIPELINE_STAGES: PipelineStage[] = ['applied', 'screened', 'interview', 'offer', 'hired'];
export const STAGE_LABEL: Record<PipelineStage, string> = {
  applied: 'Applied',
  screened: 'Screened',
  interview: 'Interview',
  offer: 'Offer',
  hired: 'Hired',
};

// Public, unauthenticated candidate-facing shapes -- served by /public/jobs/:applyToken and
// /public/applications/:statusToken, consumed by the apply/status pages via plain fetch.
export interface PublicJob {
  jobTitle: string;
  jobDescription: string | null;
  orgName: string;
  orgLogo: string | null;
}

export interface ApplicationStatus {
  jobTitle: string;
  appliedAt: string;
  statusBucket: string;
}

export interface JobListItem {
  id: string;
  title: string;
  status: JobStatus;
  createdAt: string;
  stageCounts: Record<PipelineStage, number> & { rejected: number };
}

// Mirrors apps/api/src/analytics/pipeline-analytics.ts HiringAnalytics exactly.
export interface HiringFunnelRow {
  stage: PipelineStage;
  reached: number;
  conversionFromPrev: number | null;
}
export interface HiringTimeToHire {
  avgDays: number | null;
  medianDays: number | null;
  hiredCount: number;
}
export interface HiringSourceRow {
  source: string;
  entered: number;
  hired: number;
  hireRate: number;
}
export interface HiringJobRow {
  jobId: string;
  title: string;
  // Mirrors the backend's actual (wider) type: pipeline-analytics.ts falls back to 'unknown'
  // when a cohort entry's job has no meta, so this is not narrowed to JobStatus.
  status: string;
  entered: number;
  hired: number;
  conversionPct: number;
  avgTimeToHireDays: number | null;
}
export interface HiringAnalytics {
  funnel: HiringFunnelRow[];
  timeToHire: HiringTimeToHire;
  sources: HiringSourceRow[];
  jobs: HiringJobRow[];
}

// GET /jobs/:id returns the Job row plus linkedExams -- no stageCounts (that's JobListItem,
// from the list endpoint only). See pipeline.service.ts getJob.
export interface JobDetail {
  id: string;
  title: string;
  description: string | null;
  status: JobStatus;
  createdById: string;
  createdAt: string;
  closedAt: string | null;
  linkedExams: { examId: string; title: string }[];
  publicApplyEnabled: boolean;
  applyToken: string | null;
  fitCriteria?: string | null;
  fitRubric?: string | null;
}

export type CandidateParseStatus = 'pending' | 'parsing' | 'done' | 'failed' | 'unavailable';

export interface CandidateProfile {
  resumePath: string | null;
  parseStatus: CandidateParseStatus;
  parsedSummary: string | null;
  parsedSkills: string | null;
  parsedTitle: string | null;
  parsedYearsExperience: number | null;
}

export interface EntryExamResult {
  examId: string;
  examTitle: string;
  passFail: 'pass' | 'fail' | null;
  score: number | null;
}

export interface BoardRow {
  entryId: string;
  candidateId: string;
  candidateName: string;
  candidateEmail: string;
  stage: PipelineStage;
  enteredVia: string;
  rejectedReason: string | null;
  examResults: EntryExamResult[];
  avgRating: number | null;
  feedbackCount: number;
  fitScore: number | null;
  fitStatus: string | null;
  fitStale: boolean;
}

export interface RubricDimension {
  label: string;
  weight: number;
}

export interface FitAssessment {
  entryId: string;
  status: string;
  overallScore: number | null;
  summary: string | null;
  strengths: string[];
  concerns: string[];
  dimensionScores: { label: string; weight: number; score: number }[] | null;
  scoredAt: string | null;
  error: string | null;
  stale: boolean;
}

export interface PipelineBoard {
  stages: Record<PipelineStage, BoardRow[]>;
  rejected: BoardRow[];
}

export interface FeedbackRow {
  id: string;
  authorUserId: string;
  authorName: string | null;
  note: string | null;
  rating: number | null;
  createdAt: string;
}

// Mirrors apps/api/src/pipeline/pipeline.service.ts's Prisma PipelineEntry -- only the fields
// the web app needs off the raw row (the patch-entry response embeds the full row, not a
// trimmed view like BoardRow).
export interface PipelineEntry {
  id: string;
  jobId: string;
  candidateId: string;
  stage: PipelineStage;
  rejected: boolean;
  rejectedReason: string | null;
  rejectedAt: string | null;
  enteredVia: string;
  applicationToken: string | null;
  createdAt: string;
  updatedAt: string;
}

// A stage move can trigger a 'prompt' template -- the server renders nothing and instead hands
// back the raw (token-filled) subject/body for a recruiter to review/edit in SendMessageModal
// before it actually sends. Mirrors apps/api/src/pipeline/pipeline.service.ts PendingMessage.
export interface PendingMessage {
  templateId: string | null;
  subject: string;
  body: string;
}

// PATCH /entries/:id's response shape -- changed from a bare PipelineEntry to this envelope so
// a stage move can carry an optional pendingMessage alongside the updated entry.
export interface PatchEntryResult {
  entry: PipelineEntry;
  pendingMessage?: PendingMessage;
}

// Mirrors apps/api/prisma/schema.prisma CandidateEmail -- only the fields the web app renders
// (the raw row also carries organizationId/candidateId/pipelineEntryId/templateId/errorDetail,
// which the timeline UI doesn't need).
export interface CandidateEmail {
  id: string;
  toEmail: string;
  subject: string;
  renderedBody: string;
  status: 'sent' | 'failed';
  source: string;
  sentByUserId: string | null;
  createdAt: string;
}

// GET /candidate-email-templates -- saved templates plus code defaults for triggerEvents with
// no saved override. Mirrors apps/api/src/candidate-emails/candidate-email-templates.service.ts
// TemplateView.
export interface CandidateEmailTemplate {
  id: string | null;
  name: string;
  triggerEvent: string | null;
  triggerMode: 'manual' | 'prompt' | 'auto';
  subject: string;
  body: string;
  enabled: boolean;
  isDefault: boolean;
}

export type OfferStatus = 'draft' | 'sent' | 'accepted' | 'declined' | 'expired' | 'withdrawn';

// Mirrors apps/api's Offer row -- see offers.service.ts.
export interface Offer {
  id: string;
  status: OfferStatus;
  compensation: string;
  startDate: string;
  expiresAt: string;
  sentAt: string | null;
  respondedAt: string | null;
  pdfPath: string | null;
  createdAt: string;
}

// GET /offer-template -- the org's saved offer letter override, or the code default (id: null).
export interface OfferTemplate {
  id: string | null;
  subject: string;
  body: string;
}

// GET /public/offers/:token -- unauthenticated, deliberately thin (no offer id, no org internals).
export interface PublicOffer {
  jobTitle: string;
  orgName: string;
  compensation: string;
  startDate: string;
  expiresAt: string;
  status: OfferStatus;
  pdfUrl: string | null;
}

export type InterviewStatus = 'proposed' | 'confirmed' | 'declined' | 'reschedule_requested' | 'cancelled';

export interface InterviewSlot {
  id: string;
  startsAt: string;
  endsAt: string;
}

// Mirrors apps/api's Interview row -- see interviews.service.ts.
export interface Interview {
  id: string;
  status: InterviewStatus;
  location: string;
  timeZone: string;
  recruiterNote?: string | null;
  confirmedSlotId?: string | null;
  sentAt?: string | null;
  respondedAt?: string | null;
  createdAt: string;
  slots: InterviewSlot[];
  panelists: { userId: string }[];
}

// GET /public/interviews/:token -- unauthenticated, mirrors InterviewsService.getPublicInterview.
export interface PublicInterview {
  jobTitle: string;
  orgName: string;
  slots: InterviewSlot[];
  location: string;
  timeZone: string;
  panel: string[];
  status: InterviewStatus;
  confirmedSlotId: string | null;
}

export type DriveSessionStatus = 'scheduled' | 'live' | 'ended';

export interface DriveSession {
  id: string;
  organizationId: string;
  walkInGroupId: string;
  name: string;
  startsAt: string;
  endsAt: string;
  createdAt: string;
}

export interface DriveListItem extends DriveSession {
  status: DriveSessionStatus;
}

export type DriveRosterState = 'registered' | 'in_progress' | 'submitted' | 'passed' | 'failed';

export interface DriveRosterRow {
  invitationId: string;
  // candidateId + examId back the per-candidate report link (/reports/[examId]/candidates/
  // [candidateId]); the board's click-through needs both. attemptId stays optional -- the
  // report route works without it and buildRoster does not return it.
  candidateId: string;
  examId: string;
  candidateName: string;
  examTitle: string;
  state: DriveRosterState;
  startedAt: string | null;
  score: number | null;
  attemptId?: string | null;
}

export interface DriveRoster {
  rows: DriveRosterRow[];
  counts: { registered: number; inProgress: number; submitted: number; passed: number; failed: number };
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

// Mirrors apps/api/src/billing/usage.service.ts OrgUsage -- what GET /organizations/billing/usage
// returns for the org-admin Billing page (plan name, per-dimension used/limit, and the period
// this usage was accrued in).
export interface DimensionUsage {
  used: number;
  limit: number;
}

export interface OrgUsage {
  planName: string;
  periodStart: string;
  seats: DimensionUsage;
  candidates: DimensionUsage;
  aiCredits: DimensionUsage;
  proctoringMinutes: DimensionUsage;
}

// Mirrors apps/api/src/billing/dto/plan.dto.ts UpsertPlanDto + the Prisma Plan model, as returned
// by GET/POST/PATCH /platform/plans (super-admin plan catalog).
export interface Plan {
  id: string;
  name: string;
  seatLimit: number;
  candidateLimit: number;
  aiCreditLimit: number;
  proctoringMinutesLimit: number;
  priceLabel: string | null;
  isPublic: boolean;
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
  faceVerificationEnabled: boolean;
  /** allow_unenrolled | retry_then_allow | require_enrolment */
  faceEnrolmentPolicy: string;
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
  faceEnrolmentStatus: string | null;
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

export interface TabActivityEventTypeSummary {
  eventType: string;
  count: number;
  toolCounts?: Record<string, number>;
}

export interface QuestionTabActivityEntry {
  eventType: string;
  occurredAt: string;
  toolName?: string;
  reasoning?: string;
  screenshot?: string;
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
  /** Code questions only -- null for every other type. See reports.service.ts. */
  answerText: string | null;
  codeLanguage: string | null;
  gradingFeedback: string | null;
  /** Estimated from answer-save timing, not an exact link -- see tab-activity.ts. */
  tabActivity: QuestionTabActivityEntry[];
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

export interface CandidateFaceEnrolment {
  status: string;
  referenceImageUrl: string | null;
  capturedAt: string | null;
}

// One confirmed face_mismatch ProctoringEvent -- score alongside the (signed) snapshot, meant
// to be rendered next to CandidateFaceEnrolment.referenceImageUrl so a recruiter can compare
// the two faces the system thought were different. See reports.service.ts.
export interface FaceMismatchEntry {
  occurredAt: string;
  score: number | null;
  snapshotUrl: string | null;
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
  tabActivitySummary: TabActivityEventTypeSummary[];
  faceEnrolment: CandidateFaceEnrolment | null;
  faceMismatches: FaceMismatchEntry[];
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
  /** easy | medium | hard, from the question bank. */
  difficulty: string;
  starterCode: string | null;
  codeLanguage: CodeLanguage | null;
  answerText: string | null;
  marks: number;
  marksAwarded: number | null;
  gradingFeedback: string | null;
  /** Estimated from answer-save timing, not an exact link -- see tab-activity.ts. */
  tabActivity: QuestionTabActivityEntry[];
}

export interface PendingGradingRow {
  attemptId: string;
  candidateId: string;
  candidateName: string;
  proctoringAnalysis: ProctoringAnalysisSummary | null;
  tabActivitySummary: TabActivityEventTypeSummary[];
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
    highConcern: number;
    review: number;
    clear: number;
    unanalyzed: number;
    highConcernRate: number;
    byType: { type: string; count: number }[];
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
