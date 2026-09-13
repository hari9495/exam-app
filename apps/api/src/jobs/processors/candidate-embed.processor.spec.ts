import { EmbeddingNotConfiguredError, EMBEDDING_NOT_CONFIGURED_STATUS, embeddingHash, buildEmbeddingText } from '@exam-platform/shared';
import { CandidateEmbedProcessor } from './candidate-embed.processor';

describe('CandidateEmbedProcessor', () => {
  let processor: CandidateEmbedProcessor;
  let tenantPrisma: { forTenant: jest.Mock };
  let resolver: { resolve: jest.Mock };
  let quota: { assertWithinLimit: jest.Mock };
  const context = { organizationId: 'org-1', isSuperAdmin: false };
  const provider = { model: 'text-embedding-3-small', embed: jest.fn() };

  const doneProfile = { candidateId: 'cand-1', parseStatus: 'done', parsedSummary: '5y Node', parsedSkills: '["Node"]', parsedTitle: 'Dev', embeddingHash: null as string | null };

  function forTenantReturning(profile: unknown, update = jest.fn(), create = jest.fn()) {
    tenantPrisma.forTenant.mockImplementation((_ctx: unknown, fn: (tx: unknown) => unknown) =>
      fn({ candidateProfile: { findUnique: jest.fn().mockResolvedValue(profile), update }, aiCreditUsage: { create } }),
    );
  }

  beforeEach(() => {
    jest.clearAllMocks();
    tenantPrisma = { forTenant: jest.fn() };
    resolver = { resolve: jest.fn().mockResolvedValue(provider) };
    quota = { assertWithinLimit: jest.fn().mockResolvedValue(undefined) };
    provider.embed.mockResolvedValue([[0.1, 0.2, 0.3]]);
    processor = new CandidateEmbedProcessor(tenantPrisma as never, resolver as never, quota as never);
  });

  it('skips when the profile is not parsed', async () => {
    forTenantReturning({ candidateId: 'c', parseStatus: 'pending' });
    expect(await processor.process({ candidateId: 'c' }, context)).toEqual({ skipped: 'no_parsed_profile' });
    expect(resolver.resolve).not.toHaveBeenCalled();
  });

  it('skips (not configured) without charging when no embeddings provider is set', async () => {
    forTenantReturning(doneProfile);
    resolver.resolve.mockRejectedValue(new EmbeddingNotConfiguredError('no config'));
    expect(await processor.process({ candidateId: 'cand-1' }, context)).toEqual({ skipped: EMBEDDING_NOT_CONFIGURED_STATUS });
    expect(quota.assertWithinLimit).not.toHaveBeenCalled();
  });

  it('skips when the content hash is unchanged (no re-embed)', async () => {
    const hash = embeddingHash(buildEmbeddingText(doneProfile), provider.model);
    forTenantReturning({ ...doneProfile, embeddingHash: hash });
    expect(await processor.process({ candidateId: 'cand-1' }, context)).toEqual({ skipped: 'unchanged' });
    expect(provider.embed).not.toHaveBeenCalled();
  });

  it('embeds, stores the vector + model + hash, and records usage', async () => {
    const update = jest.fn();
    const create = jest.fn();
    forTenantReturning(doneProfile, update, create);
    const out = await processor.process({ candidateId: 'cand-1' }, context);

    expect(quota.assertWithinLimit).toHaveBeenCalledWith(context, 'ai_credits');
    expect(provider.embed).toHaveBeenCalledWith([buildEmbeddingText(doneProfile)]);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      where: { candidateId: 'cand-1' },
      data: expect.objectContaining({ embeddingJson: JSON.stringify([0.1, 0.2, 0.3]), embeddingModel: provider.model }),
    }));
    expect(create).toHaveBeenCalledWith({ data: { organizationId: 'org-1', source: 'candidate_embed', credits: 1, sourceId: 'cand-1' } });
    expect(out).toEqual({ ok: true, dims: 3 });
  });
});
