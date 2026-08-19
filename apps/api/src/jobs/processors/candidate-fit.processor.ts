import { Injectable, Logger } from '@nestjs/common';
import {
  TenantContext,
  TenantPrismaService,
  AiApiKeyResolverService,
  AiNotConfiguredError,
  AiProvider,
  AuditService,
} from '@exam-platform/shared';
import { JobProcessor } from './job-processor.interface';
import { QuotaService } from '../../billing/quota.service';
import {
  parseRubric,
  buildFitToolSchema,
  buildFitPrompt,
  validateFitResult,
  computeCriteriaHash,
  FitResult,
} from '../../candidate-fit/candidate-fit.core';

interface CandidateFitInput {
  entryId: string;
}

@Injectable()
export class CandidateFitProcessor implements JobProcessor {
  readonly type = 'candidate_fit';
  private readonly logger = new Logger(CandidateFitProcessor.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly aiApiKeyResolver: AiApiKeyResolverService,
    private readonly audit: AuditService,
    private readonly quota: QuotaService,
  ) {}

  async process(input: unknown, context: TenantContext, aiJobId: string): Promise<unknown> {
    const { entryId } = input as CandidateFitInput;

    // Phase 1: read entry + job + profile (+ the enqueuing user, carried on the AiJob row).
    const loaded = await this.tenantPrisma.forTenant(context, async (tx) => {
      const entry = await tx.pipelineEntry.findFirst({ where: { id: entryId, organizationId: context.organizationId as string } });
      if (!entry) return null;
      const job = await tx.job.findFirst({ where: { id: entry.jobId, organizationId: context.organizationId as string } });
      const profile = await tx.candidateProfile.findFirst({ where: { candidateId: entry.candidateId, organizationId: context.organizationId as string } });
      const aiJob = await tx.aiJob.findUnique({ where: { id: aiJobId } });
      return { entry, job, profile, scoredByUserId: aiJob?.createdBy ?? null };
    });

    if (!loaded || !loaded.job) {
      // The entry (or its job) vanished between enqueue and processing — nothing to score.
      return { ok: false, status: 'skipped_no_resume' };
    }
    const { entry, job, profile, scoredByUserId } = loaded;

    if (!profile || profile.parseStatus !== 'done') {
      await this.setStatus(context, entryId, 'skipped_no_resume');
      return { ok: false, status: 'skipped_no_resume' };
    }

    // Resolve the provider as its own step so a MISSING key is recorded distinctly from a genuine
    // failure (retrying can never fix a missing key) — same reasoning as ResumeParseProcessor.
    const aiProvider = await this.aiApiKeyResolver.resolve(context.organizationId as string).catch((error) => {
      if (error instanceof AiNotConfiguredError) return null;
      throw error;
    });
    if (!aiProvider) {
      await this.setStatus(context, entryId, 'skipped_no_ai_key');
      return { ok: false, status: 'skipped_no_ai_key' };
    }

    // Hard quota: block the AI spend when the org has exhausted its monthly AI credits.
    // Deliberately outside the try/catch below so QuotaExceededException propagates as-is to the
    // worker (which fails the AiJob with the 402 message) instead of being folded into the
    // generic candidateFitAssessment `failed` status.
    await this.quota.assertWithinLimit(context, 'ai_credits');

    try {
      const rubric = parseRubric(job.fitRubric);
      const jobInput = { title: job.title, description: job.description, fitCriteria: job.fitCriteria, fitRubric: job.fitRubric };
      const profileInput = {
        parsedSummary: profile.parsedSummary,
        parsedSkills: safeSkills(profile.parsedSkills),
        parsedTitle: profile.parsedTitle,
        parsedYearsExperience: profile.parsedYearsExperience,
      };

      // Phase 2: AI call — OUTSIDE any forTenant tx.
      const result = await this.callAi(aiProvider, jobInput, profileInput, rubric);

      // Phase 3: persist done + credit usage + audit.
      const criteriaHash = computeCriteriaHash(jobInput);
      await this.tenantPrisma.forTenant(context, async (tx) => {
        await tx.candidateFitAssessment.update({
          where: { entryId },
          data: {
            status: 'done',
            overallScore: result.overallScore,
            summary: result.summary,
            strengths: JSON.stringify(result.strengths),
            concerns: JSON.stringify(result.concerns),
            dimensionScores: result.dimensionScores ? JSON.stringify(result.dimensionScores) : null,
            criteriaHash,
            modelUsed: 'standard',
            scoredByUserId,
            scoredAt: new Date(),
            aiJobId,
            error: null,
          },
        });
        await tx.aiCreditUsage.create({
          data: { organizationId: context.organizationId as string, source: 'candidate_fit', credits: 1, sourceId: entryId },
        });
      });
      await this.audit.record(context, {
        actorUserId: scoredByUserId,
        action: 'candidate_fit.scored',
        entityType: 'candidate_fit_assessment',
        entityId: entryId,
      });
      return { ok: true, overallScore: result.overallScore };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Candidate fit scoring failed for entry ${entryId} (job ${aiJobId}): ${message}`);
      await this.setStatus(context, entryId, 'failed', message);
      return { ok: false, status: 'failed' };
    }
  }

  private async callAi(
    aiProvider: AiProvider,
    job: { title: string; description: string | null; fitCriteria: string | null; fitRubric: string | null },
    profile: { parsedSummary: string | null; parsedSkills: string[]; parsedTitle: string | null; parsedYearsExperience: number | null },
    rubric: { label: string; weight: number }[],
  ): Promise<FitResult> {
    const raw = await aiProvider.generateStructured({
      modelTier: 'standard',
      maxTokens: 1024,
      prompt: buildFitPrompt(job, profile, rubric),
      tool: {
        name: 'report_candidate_fit',
        description: 'Report how well the candidate fits this specific role.',
        // ponytail: buildFitToolSchema is typed `object` (Task 2's pure core stays provider-agnostic);
        // narrow here at the one call site that needs AiProvider's stricter shape.
        schema: buildFitToolSchema(rubric) as { type: 'object'; properties: Record<string, unknown>; required: string[] },
      },
    });
    return validateFitResult(raw, rubric);
  }

  private setStatus(context: TenantContext, entryId: string, status: string, error?: string) {
    return this.tenantPrisma.forTenant(context, (tx) =>
      tx.candidateFitAssessment.update({ where: { entryId }, data: { status, error: error ?? null } }),
    );
  }
}

function safeSkills(parsedSkills: string | null): string[] {
  if (!parsedSkills) return [];
  try {
    const arr = JSON.parse(parsedSkills);
    return Array.isArray(arr) ? arr.filter((s): s is string => typeof s === 'string') : [];
  } catch {
    return [];
  }
}
