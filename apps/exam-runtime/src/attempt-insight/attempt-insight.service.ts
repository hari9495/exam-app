import { Injectable, Logger } from '@nestjs/common';
import { TenantPrismaService, AiApiKeyResolverService, AiNotConfiguredError, AI_NOT_CONFIGURED_STATUS } from '@exam-platform/shared';
import { QuotaService } from '../billing/quota.service';
import { InsightClient, TopicBreakdownEntry } from './insight.client';

@Injectable()
export class AttemptInsightService {
  private readonly logger = new Logger(AttemptInsightService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly insightClient: InsightClient,
    private readonly aiApiKeyResolver: AiApiKeyResolverService,
    private readonly quota: QuotaService,
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

      // Claim the row as in-flight BEFORE the slow AI call. The internal endpoint that triggers
      // this returns immediately now (it used to time out at 5s), so without this a recruiter
      // who regenerates keeps seeing the PREVIOUS result with no sign anything is happening.
      await this.tenantPrisma.forTenant({ organizationId, isSuperAdmin: false }, (tx) =>
        tx.attemptInsight.upsert({
          where: { attemptId },
          create: { attemptId, status: 'processing', summary: null },
          update: { status: 'processing', summary: null },
        }),
      );

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
        await this.quota.assertAiCredits({ organizationId, isSuperAdmin: false });
        // Resolve the key as its own step so a MISSING key is recorded distinctly from a
        // provider error. Both used to collapse into `failed`, and the report then offered a
        // Retry for a condition retrying can never fix.
        const aiProvider = await this.aiApiKeyResolver.resolve(organizationId).catch((error) => {
          if (error instanceof AiNotConfiguredError) return null;
          throw error;
        });
        if (!aiProvider) {
          result = { status: AI_NOT_CONFIGURED_STATUS, summary: null };
        } else {
        const summary = await this.insightClient.generate(
          {
            percentage: attempt.result.percentage,
            // ponytail: Result.passFail can now be null (pending manual grade of a code question);
            // insight generation is narrative-only, so fall back to a plain label rather than gating it.
            passFail: attempt.result.passFail ?? 'pending',
            topicBreakdown,
            proctoring,
          },
          aiProvider,
        );
        result = { status: 'completed', summary };
        }
      } catch (error) {
        this.logger.error(`Insight generation failed for attempt ${attemptId}`, error as Error);
        result = { status: 'failed', summary: null };
      }

      await this.tenantPrisma.forTenant({ organizationId, isSuperAdmin: false }, async (tx) => {
        await tx.attemptInsight.upsert({
          where: { attemptId },
          create: { attemptId, ...result },
          update: { ...result, generatedAt: new Date() },
        });
        if (result.status === 'completed') {
          await tx.aiCreditUsage.create({
            data: { organizationId, source: 'insight_generation', credits: 1, sourceId: attemptId },
          });
        }
      });
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
