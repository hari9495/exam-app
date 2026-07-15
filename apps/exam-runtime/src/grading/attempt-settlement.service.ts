import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { Attempt, Prisma } from '@prisma/client';
import { gradeAnswer, computeResult, computeRemainingSeconds } from './grading';
import { ATTEMPT_STATUS_BROADCASTER, AttemptStatusBroadcaster } from '../monitoring/attempt-status-broadcaster';
import { AttemptAnalysisService } from '../proctoring-analysis/attempt-analysis.service';
import { AttemptInsightService } from '../attempt-insight/attempt-insight.service';

export interface SettlementExam {
  id: string;
  organizationId: string;
  durationMinutes: number;
  passCriteriaPercent: number;
}

@Injectable()
export class AttemptSettlementService {
  private readonly logger = new Logger(AttemptSettlementService.name);

  constructor(
    @Inject(ATTEMPT_STATUS_BROADCASTER) private readonly broadcaster: AttemptStatusBroadcaster,
    private readonly attemptAnalysis: AttemptAnalysisService,
    private readonly attemptInsight: AttemptInsightService,
  ) {}

  remainingSeconds(exam: Pick<SettlementExam, 'durationMinutes'>, attempt: { startedAt: Date }): number {
    return computeRemainingSeconds(exam.durationMinutes, attempt.startedAt);
  }

  private isExpired(exam: Pick<SettlementExam, 'durationMinutes'>, attempt: { startedAt: Date }): boolean {
    return this.remainingSeconds(exam, attempt) <= 0;
  }

  async settleIfExpired(tx: Prisma.TransactionClient, exam: SettlementExam, attempt: Attempt): Promise<Attempt> {
    if (attempt.status !== 'in_progress' || !this.isExpired(exam, attempt)) {
      return attempt;
    }
    return this.finalize(tx, exam, attempt, 'auto_submitted');
  }

  async finalize(
    tx: Prisma.TransactionClient,
    exam: SettlementExam,
    attempt: Attempt,
    status: 'submitted' | 'auto_submitted' | 'force_submitted',
  ): Promise<Attempt> {
    const existingResult = await tx.result.findUnique({ where: { attemptId: attempt.id } });
    if (existingResult) {
      // A concurrent settlement (e.g. another request racing on the same expired attempt) already
      // created the Result for this attempt. Don't grade/create again — just return the current attempt.
      return tx.attempt.findUniqueOrThrow({ where: { id: attempt.id } });
    }

    const questionIds: string[] = JSON.parse(attempt.questionOrderJson);
    const questions = await tx.question.findMany({ where: { id: { in: questionIds } }, include: { options: true } });
    const existingAnswers = await tx.answer.findMany({ where: { attemptId: attempt.id } });
    const answersByQuestionId = new Map(existingAnswers.map((answer) => [answer.questionId, answer]));

    const hasCodeQuestions = questions.some((question) => question.type === 'code');
    const gradedAnswers: { marksAwarded: number }[] = [];
    for (const question of questions) {
      if (question.type === 'code') {
        // Manual grading only — never auto-graded, never contributes to gradedAnswers until a
        // recruiter enters marks via finalizeManualGrade(). If the candidate never submitted
        // anything for this question, create a blank Answer row so it still surfaces in the
        // recruiter's grading queue instead of silently vanishing (no row = invisible question).
        if (!answersByQuestionId.has(question.id)) {
          await tx.answer.create({
            data: {
              attemptId: attempt.id,
              questionId: question.id,
              selectedOptionIdsJson: '[]',
              answerText: null,
            },
          });
        }
        continue;
      }
      const answer = answersByQuestionId.get(question.id);
      const selectedOptionIds: string[] = answer ? JSON.parse(answer.selectedOptionIdsJson) : [];
      const correctOptionIds = question.options.filter((option) => option.isCorrect).map((option) => option.id);
      const { isCorrect, marksAwarded } = gradeAnswer(
        { marks: question.marks, negativeMarks: question.negativeMarks, correctOptionIds },
        selectedOptionIds,
      );
      gradedAnswers.push({ marksAwarded });
      if (answer) {
        await tx.answer.update({ where: { id: answer.id }, data: { isCorrect, marksAwarded } });
      }
    }

    const scoredQuestions = hasCodeQuestions ? questions.filter((question) => question.type !== 'code') : questions;
    const summary = computeResult(gradedAnswers, scoredQuestions, exam.passCriteriaPercent);
    await tx.result.create({
      data: {
        attemptId: attempt.id,
        score: summary.score,
        maxScore: summary.maxScore,
        percentage: summary.percentage,
        passFail: hasCodeQuestions ? null : summary.passFail,
      },
    });

    const finalStatus = hasCodeQuestions ? 'pending_manual_grade' : status;
    const finalized = await tx.attempt.update({ where: { id: attempt.id }, data: { status: finalStatus, submittedAt: new Date() } });
    await tx.auditLog.create({
      data: {
        organizationId: exam.organizationId,
        actorUserId: null,
        action: 'attempt.settled',
        entityType: 'attempt',
        entityId: finalized.id,
        metadataJson: JSON.stringify({ status, score: summary.score, maxScore: summary.maxScore, percentage: summary.percentage, passFail: summary.passFail }),
      },
    });
    void this.broadcaster
      .emitAttemptStatus(attempt.examId, {
        attemptId: finalized.id,
        candidateId: attempt.candidateId,
        status: finalized.status,
      })
      .catch((error) => this.logger.error('Failed to broadcast attempt status', error as Error));
    void (async () => {
      try {
        await this.attemptAnalysis.analyze(finalized.id);
      } catch (error) {
        this.logger.error('Proctoring analysis failed to start', error as Error);
      }
      // Skip insight generation for attempts pending manual grading — at this point the Result
      // is computed from MCQ-only scoredQuestions (code questions excluded) and passFail is null,
      // so an insight generated now would reflect an artificially skewed percentage. It's
      // regenerated in finalizeManualGrade() once the full, correct score is known.
      if (!hasCodeQuestions) {
        try {
          await this.attemptInsight.analyze(finalized.id);
        } catch (error) {
          this.logger.error('Insight generation failed to start', error as Error);
        }
      }
    })();
    return finalized;
  }

  async finalizeManualGrade(tx: Prisma.TransactionClient, exam: SettlementExam, attempt: Attempt): Promise<Attempt> {
    if (attempt.status !== 'pending_manual_grade') {
      throw new BadRequestException(`Cannot finalize grading — attempt status is "${attempt.status}"`);
    }

    const questionIds: string[] = JSON.parse(attempt.questionOrderJson);
    const questions = await tx.question.findMany({ where: { id: { in: questionIds } } });
    const answers = await tx.answer.findMany({ where: { attemptId: attempt.id } });
    const answersByQuestionId = new Map(answers.map((answer) => [answer.questionId, answer]));

    const codeQuestions = questions.filter((question) => question.type === 'code');
    const ungraded = codeQuestions.filter((question) => {
      const answer = answersByQuestionId.get(question.id);
      return !answer || answer.marksAwarded === null;
    });
    if (ungraded.length > 0) {
      throw new BadRequestException(`${ungraded.length} code question(s) still need grading before this attempt can be finalized`);
    }

    const gradedAnswers = questions.map((question) => ({ marksAwarded: answersByQuestionId.get(question.id)?.marksAwarded ?? 0 }));
    const summary = computeResult(gradedAnswers, questions, exam.passCriteriaPercent);

    await tx.result.update({
      where: { attemptId: attempt.id },
      data: { score: summary.score, maxScore: summary.maxScore, percentage: summary.percentage, passFail: summary.passFail },
    });

    const finalized = await tx.attempt.update({ where: { id: attempt.id }, data: { status: 'submitted' } });
    await tx.auditLog.create({
      data: {
        organizationId: exam.organizationId,
        actorUserId: null,
        action: 'attempt.manually_graded',
        entityType: 'attempt',
        entityId: finalized.id,
        metadataJson: JSON.stringify({ score: summary.score, maxScore: summary.maxScore, percentage: summary.percentage, passFail: summary.passFail }),
      },
    });
    void this.broadcaster
      .emitAttemptStatus(attempt.examId, { attemptId: finalized.id, candidateId: attempt.candidateId, status: finalized.status })
      .catch((error) => this.logger.error('Failed to broadcast attempt status', error as Error));
    void (async () => {
      try {
        await this.attemptInsight.analyze(finalized.id);
      } catch (error) {
        this.logger.error('Insight generation failed to start', error as Error);
      }
    })();
    return finalized;
  }
}
