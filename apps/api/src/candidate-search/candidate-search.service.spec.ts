import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TenantPrismaService, EmbeddingResolverService, EmbeddingNotConfiguredError } from '@exam-platform/shared';
import { QuotaService } from '../billing/quota.service';
import { JobsService } from '../jobs/jobs.service';
import { CandidateSearchService } from './candidate-search.service';

describe('CandidateSearchService', () => {
  let service: CandidateSearchService;
  let tenantPrisma: { forTenant: jest.Mock };
  let resolver: { resolve: jest.Mock };
  let quota: { assertWithinLimit: jest.Mock };
  let jobs: { enqueue: jest.Mock };
  const context = { organizationId: 'org-1', isSuperAdmin: false };
  const provider = { model: 'm', embed: jest.fn() };

  const rows = [
    { candidateId: 'a', embeddingJson: JSON.stringify([1, 0]), parsedTitle: 'Dev', candidate: { name: 'Ada' } },
    { candidateId: 'b', embeddingJson: JSON.stringify([0, 1]), parsedTitle: 'PM', candidate: { name: 'Bev' } },
  ];

  beforeEach(async () => {
    jest.clearAllMocks();
    tenantPrisma = { forTenant: jest.fn() };
    resolver = { resolve: jest.fn().mockResolvedValue(provider) };
    quota = { assertWithinLimit: jest.fn().mockResolvedValue(undefined) };
    jobs = { enqueue: jest.fn().mockResolvedValue({}) };
    provider.embed.mockResolvedValue([[1, 0]]);
    const moduleRef = await Test.createTestingModule({
      providers: [
        CandidateSearchService,
        { provide: TenantPrismaService, useValue: tenantPrisma },
        { provide: EmbeddingResolverService, useValue: resolver },
        { provide: QuotaService, useValue: quota },
        { provide: JobsService, useValue: jobs },
      ],
    }).compile();
    service = moduleRef.get(CandidateSearchService);
  });

  describe('search', () => {
    it('rejects an empty query', async () => {
      await expect(service.search(context, '   ')).rejects.toThrow(BadRequestException);
    });

    it('maps a missing embeddings provider to BadRequest without charging', async () => {
      resolver.resolve.mockRejectedValue(new EmbeddingNotConfiguredError('no config'));
      await expect(service.search(context, 'node engineers')).rejects.toThrow(BadRequestException);
      expect(quota.assertWithinLimit).not.toHaveBeenCalled();
    });

    it('embeds the query, ranks candidates by cosine, and records usage', async () => {
      const create = jest.fn();
      // first forTenant call loads profiles; second records usage
      tenantPrisma.forTenant
        .mockImplementationOnce((_c, fn) => fn({ candidateProfile: { findMany: jest.fn().mockResolvedValue(rows) } }))
        .mockImplementationOnce((_c, fn) => fn({ aiCreditUsage: { create } }));

      const { results } = await service.search(context, 'someone like Ada', 5);
      expect(provider.embed).toHaveBeenCalledWith(['someone like Ada']);
      expect(results[0].candidateId).toBe('a'); // query [1,0] closest to Ada [1,0]
      expect(results[0].score).toBeGreaterThan(results[1].score);
      expect(create).toHaveBeenCalledWith({ data: { organizationId: 'org-1', source: 'candidate_search', credits: 1, sourceId: null } });
    });
  });

  describe('findSimilar', () => {
    it('returns not_embedded when the target has no vector (no provider call)', async () => {
      tenantPrisma.forTenant.mockImplementation((_c, fn) => fn({ candidateProfile: { findUnique: jest.fn().mockResolvedValue({ embeddingJson: null }), findMany: jest.fn() } }));
      const out = await service.findSimilar(context, 'cand-x');
      expect(out).toEqual({ results: [], status: 'not_embedded' });
      expect(provider.embed).not.toHaveBeenCalled();
    });

    it('throws NotFound when the candidate has no profile', async () => {
      tenantPrisma.forTenant.mockImplementation((_c, fn) => fn({ candidateProfile: { findUnique: jest.fn().mockResolvedValue(null), findMany: jest.fn() } }));
      await expect(service.findSimilar(context, 'nope')).rejects.toThrow(NotFoundException);
    });

    it('ranks other candidates against the target vector', async () => {
      tenantPrisma.forTenant.mockImplementation((_c, fn) =>
        fn({ candidateProfile: { findUnique: jest.fn().mockResolvedValue({ embeddingJson: JSON.stringify([1, 0]) }), findMany: jest.fn().mockResolvedValue(rows) } }),
      );
      const out = await service.findSimilar(context, 'cand-target', 5);
      expect(out.status).toBe('ok');
      expect(out.results[0].candidateId).toBe('a');
    });
  });

  describe('backfill', () => {
    it('enqueues a candidate_embed job per parsed profile', async () => {
      tenantPrisma.forTenant.mockImplementation((_c, fn) => fn({ candidateProfile: { findMany: jest.fn().mockResolvedValue([{ candidateId: 'a' }, { candidateId: 'b' }]) } }));
      const out = await service.backfill(context, 'user-1');
      expect(out).toEqual({ queued: 2 });
      expect(jobs.enqueue).toHaveBeenCalledTimes(2);
      expect(jobs.enqueue).toHaveBeenCalledWith(context, 'candidate_embed', JSON.stringify({ candidateId: 'a' }), 'user-1');
    });
  });
});
