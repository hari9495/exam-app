import { Injectable } from '@nestjs/common';
import { TenantPrismaService, TenantContext } from '@exam-platform/shared';
import { ExamsService, ExamResultRow } from '../exams/exams.service';

export const SETTLED_ATTEMPT_STATUSES = ['submitted', 'auto_submitted', 'force_submitted'];

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

@Injectable()
export class ReportsService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly examsService: ExamsService,
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
}
