import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { TenantContext, TenantPrismaService, AiApiKeyResolverService, AiNotConfiguredError } from '@exam-platform/shared';
import { QuotaService } from '../billing/quota.service';
import { InterviewQuestionsClient, GeneratedInterviewQuestion } from './interview-questions.client';
import { InterviewScorecardClient, GeneratedScorecard } from './interview-scorecard.client';

const DEFAULT_QUESTION_COUNT = 8;
const MAX_QUESTION_COUNT = 15;
const MAX_NOTES_CHARS = 8000;

@Injectable()
export class InterviewAiService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly aiApiKeyResolver: AiApiKeyResolverService,
    private readonly quota: QuotaService,
    private readonly questionsClient: InterviewQuestionsClient,
    private readonly scorecardClient: InterviewScorecardClient,
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

  async generateScorecard(context: TenantContext, interviewId: string, notes: string): Promise<GeneratedScorecard> {
    const orgId = context.organizationId as string;
    const trimmed = (notes ?? '').trim();
    if (!trimmed) throw new BadRequestException('notes are required to generate a scorecard');

    const job = await this.tenantPrisma.forTenant(context, async (tx) => {
      const interview = await tx.interview.findFirst({ where: { id: interviewId, organizationId: orgId } });
      if (!interview) throw new NotFoundException(`Interview ${interviewId} not found`);
      const entry = await tx.pipelineEntry.findFirst({ where: { id: interview.pipelineEntryId, organizationId: orgId } });
      const j = entry ? await tx.job.findFirst({ where: { id: entry.jobId, organizationId: orgId } }) : null;
      return { title: j?.title ?? 'the role', description: j?.description ?? null };
    });

    const aiProvider = await this.resolveProvider(orgId);
    await this.quota.assertWithinLimit(context, 'ai_credits');

    const scorecard = await this.scorecardClient.generate(
      { jobTitle: job.title, jobDescription: job.description, notes: trimmed.slice(0, MAX_NOTES_CHARS) },
      aiProvider,
    );
    await this.recordUsage(context, orgId, 'interview_scorecard', interviewId);
    return scorecard;
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
