import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService, TenantContext, BlobStorageService, selectCountedAnswers } from '@exam-platform/shared';
import { ExamsService, ExamResultRow, SETTLED_ATTEMPT_STATUSES } from '../exams/exams.service';
import { signProctoringEvidence } from '../common/sign-proctoring-evidence';
import { computeTabActivity, TAB_ACTIVITY_EVENT_TYPES, TabActivityEvent, TabActivityEventTypeSummary, QuestionTabActivityEntry } from './tab-activity';

const SCORE_DISTRIBUTION_BUCKETS = [
  { rangeLabel: '0-20', min: 0, max: 20 },
  { rangeLabel: '20-40', min: 20, max: 40 },
  { rangeLabel: '40-60', min: 40, max: 60 },
  { rangeLabel: '60-80', min: 60, max: 80 },
  { rangeLabel: '80-100', min: 80, max: 100 },
];

export interface ExamResultsSummary {
  totalCandidates: number;
  settledCount: number;
  inProgressCount: number;
  notStartedCount: number;
  passRate: number;
  averagePercentage: number;
  scoreDistribution: { rangeLabel: string; count: number }[];
  attemptDuration: { avgMinutes: number; minMinutes: number; maxMinutes: number } | null;
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

export interface ExportResultRow extends ExamResultRow {
  durationMinutes: number | null;
}

export interface SectionScore {
  sectionId: string;
  title: string;
  score: number;
  maxScore: number;
  weightPercent: number;
  /** null = every question counted. Otherwise only the best N were scored, out of N. */
  requiredCount: number | null;
}

interface SectionSnapshotEntryShape {
  sectionId: string;
  title: string;
  // Absent on attempts that started before section weighting shipped -- those are scored flat,
  // so they report 0 here rather than a weight that never applied to them.
  weightPercent?: number;
  requiredCount?: number | null;
  questionIds: string[];
}

interface CandidateDetailQuestion {
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
  // Code questions only. Once an attempt is finalized its status leaves pending_manual_grade,
  // so the grading queue stops listing it and the submitted code had nowhere left to be read.
  // Carrying it on the report keeps the work reviewable after grading, which is when a second
  // opinion is actually wanted. Null for every other question type.
  answerText: string | null;
  codeLanguage: string | null;
  gradingFeedback: string | null;
  tabActivity: QuestionTabActivityEntry[];
}

interface CandidateDetailSection extends SectionScore {
  questions: CandidateDetailQuestion[];
}

export interface IntegrityFlagDto {
  type: string;
  severity: string;
  detail: string;
  questionId?: string;
  counterpartAttemptId?: string;
  similarity?: number;
}

export type IntegritySummary = {
  status: string;
  level: string | null;
  flags: IntegrityFlagDto[];
  narrative: string | null;
} | null;

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

export interface CandidateDetail {
  candidateId: string;
  candidateName: string;
  status: string;
  score: number | null;
  maxScore: number | null;
  percentage: number | null;
  passFail: string | null;
  submittedAt: Date | null;
  proctoringAnalysis: { status: string; riskLevel: string | null; summary: string | null } | null;
  integrityAnalysis: IntegritySummary;
  sections: CandidateDetailSection[];
  webcamTimeline: WebcamTimelineEntry[];
  tabActivitySummary: TabActivityEventTypeSummary[];
  faceEnrolment: CandidateFaceEnrolment | null;
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
  proctoringAnalysis: { status: string; riskLevel: string | null; summary: string | null } | null;
  integrityAnalysis: IntegritySummary;
  sectionScores: SectionScore[];
}

@Injectable()
export class ReportsService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly examsService: ExamsService,
    private readonly blobStorage: BlobStorageService,
  ) {}

  async getSummary(context: TenantContext, examId: string): Promise<ExamResultsSummary> {
    const rows = await this.examsService.getResults(context, examId);

    const settledRows = rows.filter((row) => SETTLED_ATTEMPT_STATUSES.includes(row.status));
    const inProgressRows = rows.filter((row) => row.status === 'in_progress');
    const notStartedCount = rows.length - settledRows.length - inProgressRows.length;

    const passCount = settledRows.filter((row) => row.passFail === 'pass').length;
    const passRate = settledRows.length > 0 ? (passCount / settledRows.length) * 100 : 0;
    const averagePercentage = settledRows.length > 0
      ? settledRows.reduce((sum, row) => sum + (row.percentage ?? 0), 0) / settledRows.length
      : 0;

    const scoreDistribution = SCORE_DISTRIBUTION_BUCKETS.map((bucket) => ({
      rangeLabel: bucket.rangeLabel,
      count: settledRows.filter((row) => {
        const percentage = row.percentage ?? 0;
        return bucket.max === 100
          ? percentage >= bucket.min && percentage <= bucket.max
          : percentage >= bucket.min && percentage < bucket.max;
      }).length,
    }));

    const attemptDuration = await this.computeAttemptDuration(context, settledRows);

    return {
      totalCandidates: rows.length,
      settledCount: settledRows.length,
      inProgressCount: inProgressRows.length,
      notStartedCount,
      passRate,
      averagePercentage,
      scoreDistribution,
      attemptDuration,
    };
  }

  private async computeAttemptDuration(
    context: TenantContext,
    settledRows: ExamResultRow[],
  ): Promise<{ avgMinutes: number; minMinutes: number; maxMinutes: number } | null> {
    const attemptIds = settledRows.map((row) => row.attemptId).filter((id): id is string => id !== null);
    const startedAtById = await this.fetchStartedAtByAttemptId(context, attemptIds);

    const durationsMinutes = settledRows
      .map((row) => {
        const startedAt = row.attemptId ? startedAtById.get(row.attemptId) : undefined;
        if (!startedAt || !row.submittedAt) {
          return null;
        }
        return (row.submittedAt.getTime() - startedAt.getTime()) / 60_000;
      })
      .filter((duration): duration is number => duration !== null);

    if (durationsMinutes.length === 0) {
      return null;
    }

    return {
      avgMinutes: durationsMinutes.reduce((sum, duration) => sum + duration, 0) / durationsMinutes.length,
      minMinutes: Math.min(...durationsMinutes),
      maxMinutes: Math.max(...durationsMinutes),
    };
  }

  private async fetchStartedAtByAttemptId(context: TenantContext, attemptIds: string[]): Promise<Map<string, Date>> {
    if (attemptIds.length === 0) {
      return new Map();
    }
    const attempts = await this.tenantPrisma.forTenant(context, (tx) =>
      tx.attempt.findMany({ where: { id: { in: attemptIds } }, select: { id: true, startedAt: true } }),
    );
    return new Map(attempts.map((attempt) => [attempt.id, attempt.startedAt]));
  }

  async getQuestionAccuracy(context: TenantContext, examId: string): Promise<QuestionAccuracyRow[]> {
    const rows = await this.examsService.getResults(context, examId);
    const settledAttemptIds = rows
      .filter((row) => row.attemptId !== null && SETTLED_ATTEMPT_STATUSES.includes(row.status))
      .map((row) => row.attemptId as string);

    if (settledAttemptIds.length === 0) {
      return [];
    }

    return this.tenantPrisma.forTenant(context, async (tx) => {
      const attempts = await tx.attempt.findMany({
        where: { id: { in: settledAttemptIds } },
        select: { id: true, questionOrderJson: true },
      });
      const answers = await tx.answer.findMany({
        where: { attemptId: { in: settledAttemptIds } },
        select: { questionId: true, selectedOptionIdsJson: true, isCorrect: true },
      });

      const timesIncludedByQuestion = new Map<string, number>();
      for (const attempt of attempts) {
        const questionIds: string[] = JSON.parse(attempt.questionOrderJson);
        for (const questionId of questionIds) {
          timesIncludedByQuestion.set(questionId, (timesIncludedByQuestion.get(questionId) ?? 0) + 1);
        }
      }

      const timesAttemptedByQuestion = new Map<string, number>();
      const timesCorrectByQuestion = new Map<string, number>();
      for (const answer of answers) {
        const selectedOptionIds: string[] = JSON.parse(answer.selectedOptionIdsJson);
        if (selectedOptionIds.length > 0) {
          timesAttemptedByQuestion.set(answer.questionId, (timesAttemptedByQuestion.get(answer.questionId) ?? 0) + 1);
        }
        if (answer.isCorrect) {
          timesCorrectByQuestion.set(answer.questionId, (timesCorrectByQuestion.get(answer.questionId) ?? 0) + 1);
        }
      }

      const questionIds = [...timesIncludedByQuestion.keys()];
      const questions = await tx.question.findMany({
        where: { id: { in: questionIds }, organizationId: context.organizationId as string },
        select: { id: true, text: true },
      });
      const textById = new Map(questions.map((question) => [question.id, question.text]));

      return questionIds.map((questionId) => {
        const timesIncluded = timesIncludedByQuestion.get(questionId) ?? 0;
        const timesAttempted = timesAttemptedByQuestion.get(questionId) ?? 0;
        const timesCorrect = timesCorrectByQuestion.get(questionId) ?? 0;
        return {
          questionId,
          questionText: textById.get(questionId) ?? '',
          timesIncluded,
          timesAttempted,
          timesSkipped: timesIncluded - timesAttempted,
          timesCorrect,
          accuracyPercentage: timesIncluded > 0 ? (timesCorrect / timesIncluded) * 100 : 0,
        };
      });
    });
  }

  async getExportRows(context: TenantContext, examId: string, invitationIds?: string[]): Promise<ExportResultRow[]> {
    const allRows = await this.examsService.getResults(context, examId);
    // Scoped export (a recruiter selected specific rows before exporting): an empty
    // or omitted list means "export everything", matching every other list/filter
    // in the product where no selection defaults to the full set, not an empty file.
    // Keyed by invitationId, not candidateId -- a re-invited candidate has multiple
    // rows sharing one candidateId, so a candidateId-keyed filter would export every
    // invitation for that candidate instead of just the one the recruiter checked.
    const invitationIdSet = invitationIds && invitationIds.length > 0 ? new Set(invitationIds) : null;
    const rows = invitationIdSet ? allRows.filter((row) => invitationIdSet.has(row.invitationId)) : allRows;
    const attemptIds = rows.map((row) => row.attemptId).filter((id): id is string => id !== null);
    const startedAtById = await this.fetchStartedAtByAttemptId(context, attemptIds);

    return rows.map((row) => {
      const startedAt = row.attemptId ? startedAtById.get(row.attemptId) : undefined;
      const durationMinutes = startedAt && row.submittedAt
        ? (row.submittedAt.getTime() - startedAt.getTime()) / 60_000
        : null;
      return { ...row, durationMinutes };
    });
  }

  async getCandidateDetail(
    context: TenantContext,
    examId: string,
    candidateId: string,
    attemptId?: string,
  ): Promise<CandidateDetail> {
    const rows = await this.examsService.getResults(context, examId);
    // getResults returns one row per invitation, so a candidate re-invited to the same
    // exam has several. Without attemptId this falls back to whichever invitation
    // getResults ordered first (most recently invited) -- fine for a candidate with
    // only one invitation, but silently wrong for a re-invited one: it could return a
    // still-unsettled invitation's (blank) data instead of the specific attempt the
    // caller is looking at. Callers that already know which attempt (the results list,
    // which links each row's own attemptId) should always pass it.
    const row = attemptId
      ? rows.find((resultRow) => resultRow.candidateId === candidateId && resultRow.attemptId === attemptId)
      : rows.find((resultRow) => resultRow.candidateId === candidateId);
    if (!row) {
      throw new NotFoundException(`Candidate ${candidateId} not found on exam ${examId}`);
    }

    const base = {
      candidateId: row.candidateId,
      candidateName: row.candidateName,
      status: row.status,
      score: row.score,
      maxScore: row.maxScore,
      percentage: row.percentage,
      passFail: row.passFail,
      submittedAt: row.submittedAt,
      proctoringAnalysis: row.proctoringAnalysis,
      integrityAnalysis: this.toIntegritySummary(row),
    };

    if (!row.attemptId) {
      return { ...base, sections: [], webcamTimeline: [], tabActivitySummary: [], faceEnrolment: null };
    }

    return this.tenantPrisma.forTenant(context, async (tx) => {
      const attempt = await tx.attempt.findFirst({
        where: { id: row.attemptId as string },
        select: { sectionSnapshotJson: true, answers: true, faceEnrolment: true },
      });
      if (!attempt) {
        return { ...base, sections: [], webcamTimeline: [], tabActivitySummary: [], faceEnrolment: null };
      }

      const webcamEvents = await tx.proctoringEvent.findMany({
        where: { attemptId: row.attemptId as string, eventType: { startsWith: 'webcam_' } },
        orderBy: { occurredAt: 'asc' },
      });
      const webcamTimeline: WebcamTimelineEntry[] = await Promise.all(
        webcamEvents.map(async (e) => {
          // metadataJson is a raw DB column: malformed/legacy rows must not break the whole
          // timeline over one bad event, so a parse failure degrades to an empty object.
          let parsed: unknown = {};
          if (e.metadataJson) {
            try {
              parsed = JSON.parse(e.metadataJson);
            } catch {
              parsed = {};
            }
          }
          // signProctoringEvidence short-circuits non-object input (including JSON `null`,
          // which JSON.parse accepts without throwing) back to that same non-object value --
          // `?? {}` catches that so `meta.snapshot` etc. below can't throw a TypeError over one
          // bad row, same as the malformed-JSON case above.
          const meta = ((await signProctoringEvidence(this.blobStorage, parsed)) ?? {}) as {
            snapshot?: string;
            screenshot?: string;
            screenshotCapReached?: boolean;
            strike?: number;
          };
          if (e.eventType === 'webcam_snapshot') {
            return {
              occurredAt: e.occurredAt.toISOString(),
              kind: 'periodic' as const,
              snapshot: meta.snapshot ?? '',
              screenshot: meta.screenshot,
              screenshotCapReached: meta.screenshotCapReached === true ? true : undefined,
            };
          }
          return {
            occurredAt: e.occurredAt.toISOString(),
            kind: 'violation' as const,
            reason: e.eventType.replace(/^webcam_/, ''),
            strike: meta.strike,
            snapshot: meta.snapshot ?? '',
            screenshot: meta.screenshot,
            screenshotCapReached: meta.screenshotCapReached === true ? true : undefined,
          };
        }),
      );

      const tabActivityEvents = await tx.proctoringEvent.findMany({
        where: { attemptId: row.attemptId as string, eventType: { in: [...TAB_ACTIVITY_EVENT_TYPES] } },
        orderBy: { occurredAt: 'asc' },
      });
      const signedTabActivityEvents: TabActivityEvent[] = await Promise.all(
        tabActivityEvents.map(async (e) => {
          let parsed: unknown = {};
          if (e.metadataJson) {
            try {
              parsed = JSON.parse(e.metadataJson);
            } catch {
              parsed = {};
            }
          }
          const signed = ((await signProctoringEvidence(this.blobStorage, parsed)) ?? {}) as Record<string, unknown>;
          return { eventType: e.eventType, occurredAt: e.occurredAt, metadata: signed };
        }),
      );
      const tabActivity = computeTabActivity(
        signedTabActivityEvents,
        attempt.answers.map((answer) => ({ questionId: answer.questionId, answeredAt: answer.answeredAt })),
      );

      const sectionSnapshot: SectionSnapshotEntryShape[] = JSON.parse(attempt.sectionSnapshotJson);
      const allQuestionIds = sectionSnapshot.flatMap((section) => section.questionIds);
      const questions = await tx.question.findMany({
        where: { id: { in: allQuestionIds }, organizationId: context.organizationId as string },
        include: { options: true },
      });
      const questionsById = new Map(questions.map((question) => [question.id, question]));
      const answersByQuestionId = new Map(attempt.answers.map((answer) => [answer.questionId, answer]));
      const marksAwardedByQuestionId = new Map(
        attempt.answers.filter((answer) => answer.marksAwarded !== null).map((answer) => [answer.questionId, answer.marksAwarded as number]),
      );
      const marksByQuestionId = new Map(questions.map((question) => [question.id, question.marks]));

      const sectionScores = this.computeSectionScores(sectionSnapshot, marksAwardedByQuestionId, marksByQuestionId);
      const sectionScoreById = new Map(sectionScores.map((score) => [score.sectionId, score]));

      const sections: CandidateDetailSection[] = sectionSnapshot.map((section) => {
        const scoreEntry = sectionScoreById.get(section.sectionId)!;
        const countedIds = new Set(
          selectCountedAnswers(
            section.questionIds.map((questionId) => ({
              questionId,
              marks: marksByQuestionId.get(questionId) ?? 0,
              marksAwarded: marksAwardedByQuestionId.get(questionId) ?? 0,
            })),
            section.requiredCount,
          ).countedQuestionIds,
        );
        return {
          sectionId: section.sectionId,
          title: section.title,
          score: scoreEntry.score,
          maxScore: scoreEntry.maxScore,
          weightPercent: scoreEntry.weightPercent,
          requiredCount: scoreEntry.requiredCount,
          questions: section.questionIds.map((questionId) => {
            const question = questionsById.get(questionId);
            const answer = answersByQuestionId.get(questionId);
            return {
              questionId,
              questionText: question?.text ?? '',
              type: question?.type ?? '',
              marks: question?.marks ?? 0,
              negativeMarks: question?.negativeMarks ?? 0,
              options: question?.options.map((option) => ({ id: option.id, text: option.text })) ?? [],
              selectedOptionIds: answer ? JSON.parse(answer.selectedOptionIdsJson) : [],
              correctOptionIds: question?.options.filter((option) => option.isCorrect).map((option) => option.id) ?? [],
              isCorrect: answer?.isCorrect ?? null,
              marksAwarded: answer?.marksAwarded ?? null,
              counted: countedIds.has(questionId),
              // Only for code: an MCQ's "answer" is already fully described by selectedOptionIds,
              // and answerText is unused there, so sending it would be noise on every row.
              answerText: question?.type === 'code' ? (answer?.answerText ?? null) : null,
              codeLanguage: question?.type === 'code' ? (answer?.codeLanguage ?? null) : null,
              gradingFeedback: question?.type === 'code' ? (answer?.gradingFeedback ?? null) : null,
              tabActivity: tabActivity.byQuestionId.get(questionId) ?? [],
            };
          }),
        };
      });

      const faceEnrolment: CandidateFaceEnrolment | null = attempt.faceEnrolment
        ? {
            status: attempt.faceEnrolment.status,
            // The container is private: sign on read, and never persist the signed value.
            referenceImageUrl: (await this.blobStorage.signIfOurs(attempt.faceEnrolment.referenceImagePath)) as string | null,
            capturedAt: attempt.faceEnrolment.capturedAt?.toISOString() ?? null,
          }
        : null;

      return { ...base, sections, webcamTimeline, tabActivitySummary: tabActivity.summary, faceEnrolment };
    });
  }

  async compareCandidates(context: TenantContext, examId: string, invitationIdsParam: string): Promise<CandidateComparisonRow[]> {
    const invitationIds = invitationIdsParam.split(',').map((id) => id.trim()).filter((id) => id.length > 0);
    if (invitationIds.length < 2) {
      throw new BadRequestException('At least 2 invitationIds are required to compare');
    }

    const rows = await this.examsService.getResults(context, examId);
    // Keyed by invitationId, not candidateId -- a re-invited candidate has multiple rows
    // sharing one candidateId, and a candidateId-keyed Map would silently drop to whichever
    // of those rows getResults returned last, comparing the wrong attempt's data.
    const rowByInvitationId = new Map(rows.map((row) => [row.invitationId, row]));
    const missingIds = invitationIds.filter((id) => !rowByInvitationId.has(id));
    if (missingIds.length > 0) {
      throw new BadRequestException(`Invitation(s) not found on this exam: ${missingIds.join(', ')}`);
    }
    const selectedRows = invitationIds.map((id) => rowByInvitationId.get(id)!);
    const attemptIds = selectedRows.map((row) => row.attemptId).filter((id): id is string => id !== null);

    if (attemptIds.length === 0) {
      return selectedRows.map((row) => ({
        candidateId: row.candidateId,
        invitationId: row.invitationId,
        candidateName: row.candidateName,
        status: row.status,
        score: row.score,
        maxScore: row.maxScore,
        percentage: row.percentage,
        passFail: row.passFail,
        proctoringAnalysis: row.proctoringAnalysis,
        integrityAnalysis: this.toIntegritySummary(row),
        sectionScores: [],
      }));
    }

    return this.tenantPrisma.forTenant(context, async (tx) => {
      const attempts = await tx.attempt.findMany({ where: { id: { in: attemptIds } }, select: { id: true, sectionSnapshotJson: true, answers: true } });
      const attemptById = new Map(attempts.map((attempt) => [attempt.id, attempt]));

      const allQuestionIds = new Set<string>();
      for (const attempt of attempts) {
        const snapshot: SectionSnapshotEntryShape[] = JSON.parse(attempt.sectionSnapshotJson);
        snapshot.forEach((section) => section.questionIds.forEach((questionId) => allQuestionIds.add(questionId)));
      }
      const questions = allQuestionIds.size === 0
        ? []
        : await tx.question.findMany({
            where: { id: { in: [...allQuestionIds] }, organizationId: context.organizationId as string },
            select: { id: true, marks: true },
          });
      const marksByQuestionId = new Map(questions.map((question) => [question.id, question.marks]));

      return selectedRows.map((row) => {
        const base = {
          candidateId: row.candidateId,
          invitationId: row.invitationId,
          candidateName: row.candidateName,
          status: row.status,
          score: row.score,
          maxScore: row.maxScore,
          percentage: row.percentage,
          passFail: row.passFail,
          proctoringAnalysis: row.proctoringAnalysis,
          integrityAnalysis: this.toIntegritySummary(row),
        };
        const attempt = row.attemptId ? attemptById.get(row.attemptId) : undefined;
        if (!attempt) {
          return { ...base, sectionScores: [] };
        }
        const sectionSnapshot: SectionSnapshotEntryShape[] = JSON.parse(attempt.sectionSnapshotJson);
        const marksAwardedByQuestionId = new Map(
          attempt.answers.filter((answer) => answer.marksAwarded !== null).map((answer) => [answer.questionId, answer.marksAwarded as number]),
        );
        const sectionScores = this.computeSectionScores(sectionSnapshot, marksAwardedByQuestionId, marksByQuestionId);
        return { ...base, sectionScores };
      });
    });
  }

  // Parses flagsJson defensively — it's LLM-produced, so a malformed row must degrade to
  // an empty flags list rather than 500 the report.
  private toIntegritySummary(row: ExamResultRow): IntegritySummary {
    if (!row.integrityAnalysis) {
      return null;
    }
    let flags: IntegrityFlagDto[] = [];
    try {
      const parsed = JSON.parse(row.integrityAnalysis.flagsJson ?? '[]');
      if (Array.isArray(parsed)) {
        flags = parsed;
      }
    } catch {
      flags = [];
    }
    return {
      status: row.integrityAnalysis.status,
      level: row.integrityAnalysis.level,
      flags,
      narrative: row.integrityAnalysis.narrative,
    };
  }

  private computeSectionScores(
    sectionSnapshot: SectionSnapshotEntryShape[],
    marksAwardedByQuestionId: Map<string, number>,
    marksByQuestionId: Map<string, number>,
  ): SectionScore[] {
    return sectionSnapshot.map((section) => {
      // Same helper the exam-runtime settlement path uses. Two independent copies of the best-N
      // rule would let a recruiter see a section score that contradicts the per-question marks
      // listed directly underneath it.
      const counted = selectCountedAnswers(
        section.questionIds.map((questionId) => ({
          questionId,
          marks: marksByQuestionId.get(questionId) ?? 0,
          marksAwarded: marksAwardedByQuestionId.get(questionId) ?? 0,
        })),
        section.requiredCount,
      );
      return {
        sectionId: section.sectionId,
        title: section.title,
        score: counted.score,
        maxScore: counted.maxScore,
        weightPercent: section.weightPercent ?? 0,
        requiredCount: section.requiredCount ?? null,
      };
    });
  }
}
