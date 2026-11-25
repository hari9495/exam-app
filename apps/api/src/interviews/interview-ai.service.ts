import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { TenantContext, TenantPrismaService, AiApiKeyResolverService, AiNotConfiguredError } from '@exam-platform/shared';
import { QuotaService } from '../billing/quota.service';
import { InterviewQuestionsClient, GeneratedInterviewQuestion } from './interview-questions.client';

const DEFAULT_QUESTION_COUNT = 8;
const MAX_QUESTION_COUNT = 15;

@Injectable()
export class InterviewAiService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly aiApiKeyResolver: AiApiKeyResolverService,
    private readonly quota: QuotaService,
    private readonly questionsClient: InterviewQuestionsClient,
  ) {}

  async generateQuestions(
    context: TenantContext,
    entryId: string,
    opts: { count?: number; focus?: string | null },
  ): Promise<{ questions: GeneratedInterviewQuestion[] }> {
    const orgId = context.organizationId as string;
    const ctx = await this.tenantPrisma.forTenant(context, async (tx) => {
      const entry = await tx.pipelineEntry.findFirst({ where: { id: entryId, organizationId: orgId } });
      if (!entry) throw new NotFoundException(`Pipeline entry ${entryId} not found`);
      const job = await tx.job.findFirst({ where: { id: entry.jobId, organizationId: orgId } });
      if (!job) throw new NotFoundException(`Job ${entry.jobId} not found`);
      const profile = await tx.candidateProfile.findFirst({ where: { candidateId: entry.candidateId, organizationId: orgId } });
      return {
        title: job.title,
        description: job.description,
        fitCriteria: job.fitCriteria,
        candidateSummary: profile?.parseStatus === 'done' ? profile.parsedSummary : null,
      };
    });

    const count = Math.min(Math.max(opts.count ?? DEFAULT_QUESTION_COUNT, 1), MAX_QUESTION_COUNT);
    const aiProvider = await this.resolveProvider(orgId);
    await this.quota.assertWithinLimit(context, 'ai_credits');

    const questions = await this.questionsClient.generate({ ...ctx, focus: opts.focus ?? null }, count, aiProvider);
    await this.recordUsage(context, orgId, 'interview_questions', entryId);
    return { questions };
  }

  // Interactive endpoints (unlike the best-effort public autofill) surface a clear, actionable
  // error when the org has no AI key, so the user knows to configure one.
  private async resolveProvider(orgId: string) {
    try {
      return await this.aiApiKeyResolver.resolve(orgId);
    } catch (error) {
      if (error instanceof AiNotConfiguredError) {
        throw new BadRequestException('AI is not configured for your organization. Add an API key in Settings → Integrations.');
      }
      throw error;
    }
  }

  private recordUsage(context: TenantContext, organizationId: string, source: string, sourceId: string): Promise<unknown> {
    return this.tenantPrisma.forTenant(context, (tx) =>
      tx.aiCreditUsage.create({ data: { organizationId, source, credits: 1, sourceId } }),
    );
  }
}
