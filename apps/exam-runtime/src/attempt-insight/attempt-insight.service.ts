import { Injectable, Logger } from '@nestjs/common';
import { TenantPrismaService } from '@exam-platform/shared';
import { ClaudeInsightClient, TopicBreakdownEntry } from './claude-insight.client';

@Injectable()
export class AttemptInsightService {
  private readonly logger = new Logger(AttemptInsightService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly claudeInsightClient: ClaudeInsightClient,
  ) {}

  async analyze(attemptId: string): Promise<void> {
    try {
      const attempt = await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) =>
        tx.attempt.findUnique({
          where: { id: attemptId },
          include: { invitation: { include: { exam: true } }, result: true },
        }),
      );
      if (!attempt || !attempt.result) {
        this.logger.warn(`Attempt ${attemptId} not found or not yet graded, skipping insight generation`);
        return;
      }

      const organizationId = attempt.invitation.exam.organizationId;
      const { answer, proctoringAnalysis } = await this.tenantPrisma.forTenant(
        { organizationId, isSuperAdmin: false },
        async (tx) => ({
          answer: await tx.answer.findMany({ where: { attemptId }, include: { question: true } }),
          proctoringAnalysis: await tx.proctoringAnalysis.findUnique({ where: { attemptId } }),
        }),
      );

      const topicBreakdown = this.computeTopicBreakdown(answer);
      const proctoring =
        proctoringAnalysis && proctoringAnalysis.riskLevel && proctoringAnalysis.summary
          ? { riskLevel: proctoringAnalysis.riskLevel, summary: proctoringAnalysis.summary }
          : null;

      let result: { status: string; summary: string | null };
      try {
        const summary = await this.claudeInsightClient.generate({
          percentage: attempt.result.percentage,
          passFail: attempt.result.passFail,
          topicBreakdown,
          proctoring,
        });
        result = { status: 'completed', summary };
      } catch (error) {
        this.logger.error(`Insight generation failed for attempt ${attemptId}`, error as Error);
        result = { status: 'failed', summary: null };
      }

      await this.tenantPrisma.forTenant({ organizationId, isSuperAdmin: false }, (tx) =>
        tx.attemptInsight.upsert({
          where: { attemptId },
          create: { attemptId, ...result },
          update: { ...result, generatedAt: new Date() },
        }),
      );
    } catch (error) {
      this.logger.error(`Insight generation could not run for attempt ${attemptId}`, error as Error);
    }
  }

  private computeTopicBreakdown(
    answers: { isCorrect: boolean | null; question: { topic: string | null } }[],
  ): TopicBreakdownEntry[] {
    const byTopic = new Map<string, { correct: number; total: number }>();
    for (const answer of answers) {
      const topic = answer.question.topic;
      if (!topic) {
        continue;
      }
      const entry = byTopic.get(topic) ?? { correct: 0, total: 0 };
      entry.total += 1;
      if (answer.isCorrect) {
        entry.correct += 1;
      }
      byTopic.set(topic, entry);
    }
    return [...byTopic.entries()].map(([topic, counts]) => ({ topic, ...counts }));
  }
}
