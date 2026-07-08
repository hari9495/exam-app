import { Injectable } from '@nestjs/common';
import { Attempt, Prisma } from '@prisma/client';
import { gradeAnswer, computeResult, computeRemainingSeconds } from './grading';
import { MonitoringGateway } from '../monitoring/monitoring.gateway';

export interface SettlementExam {
  id: string;
  durationMinutes: number;
  passCriteriaPercent: number;
}

@Injectable()
export class AttemptSettlementService {
  constructor(private readonly monitoringGateway: MonitoringGateway) {}

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

    const gradedAnswers: { marksAwarded: number }[] = [];
    for (const question of questions) {
      const answer = answersByQuestionId.get(question.id);
      const selectedOptionIds: string[] = answer ? JSON.parse(answer.selectedOptionIdsJson) : [];
      const correctOptionIds = question.options.filter((option) => option.isCorrect).map((option) => option.id);
      const { isCorrect, marksAwarded } = gradeAnswer({ marks: question.marks, correctOptionIds }, selectedOptionIds);
      gradedAnswers.push({ marksAwarded });
      if (answer) {
        await tx.answer.update({ where: { id: answer.id }, data: { isCorrect, marksAwarded } });
      }
    }

    const summary = computeResult(gradedAnswers, questions, exam.passCriteriaPercent);
    await tx.result.create({
      data: {
        attemptId: attempt.id,
        score: summary.score,
        maxScore: summary.maxScore,
        percentage: summary.percentage,
        passFail: summary.passFail,
      },
    });

    const finalized = await tx.attempt.update({ where: { id: attempt.id }, data: { status, submittedAt: new Date() } });
    this.monitoringGateway.emitAttemptStatus(attempt.examId, {
      attemptId: finalized.id,
      candidateId: attempt.candidateId,
      status: finalized.status,
    });
    return finalized;
  }
}
