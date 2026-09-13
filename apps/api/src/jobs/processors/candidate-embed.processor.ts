import { Injectable, Logger } from '@nestjs/common';
import {
  TenantContext,
  TenantPrismaService,
  EmbeddingResolverService,
  EmbeddingNotConfiguredError,
  EMBEDDING_NOT_CONFIGURED_STATUS,
  buildEmbeddingText,
  embeddingHash,
} from '@exam-platform/shared';
import { JobProcessor } from './job-processor.interface';
import { QuotaService } from '../../billing/quota.service';
import { QuotaExceededException } from '../../billing/quota-exceeded.exception';

interface CandidateEmbedInput {
  candidateId: string;
}

@Injectable()
export class CandidateEmbedProcessor implements JobProcessor {
  readonly type = 'candidate_embed';
  private readonly logger = new Logger(CandidateEmbedProcessor.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly embeddingResolver: EmbeddingResolverService,
    private readonly quota: QuotaService,
  ) {}

  async process(input: unknown, context: TenantContext): Promise<unknown> {
    const { candidateId } = input as CandidateEmbedInput;
    const orgId = context.organizationId as string;

    const profile = await this.tenantPrisma.forTenant(context, (tx) =>
      tx.candidateProfile.findUnique({ where: { candidateId } }),
    );
    if (!profile || profile.parseStatus !== 'done') return { skipped: 'no_parsed_profile' };

    const text = buildEmbeddingText(profile);
    if (!text) return { skipped: 'no_text' };

    let provider;
    try {
      provider = await this.embeddingResolver.resolve(orgId);
    } catch (error) {
      if (error instanceof EmbeddingNotConfiguredError) return { skipped: EMBEDDING_NOT_CONFIGURED_STATUS };
      throw error;
    }

    const hash = embeddingHash(text, provider.model);
    if (profile.embeddingHash === hash) return { skipped: 'unchanged' };

    try {
      await this.quota.assertWithinLimit(context, 'ai_credits');
      const [vector] = await provider.embed([text]);
      if (!vector?.length) throw new Error('embedding provider returned an empty vector');

      await this.tenantPrisma.forTenant(context, async (tx) => {
        await tx.candidateProfile.update({
          where: { candidateId },
          data: { embeddingJson: JSON.stringify(vector), embeddingModel: provider.model, embeddingHash: hash, embeddedAt: new Date() },
        });
        await tx.aiCreditUsage.create({ data: { organizationId: orgId, source: 'candidate_embed', credits: 1, sourceId: candidateId } });
      });
      return { ok: true, dims: vector.length };
    } catch (error) {
      // Quota exhaustion surfaces on the AiJob record (402), not a silent skip.
      if (error instanceof QuotaExceededException) throw error;
      this.logger.error(`Candidate embed failed for ${candidateId}`, error as Error);
      throw error;
    }
  }
}
