import { Test } from '@nestjs/testing';
import { AttemptInsightService } from './attempt-insight.service';
import { InsightClient } from './insight.client';
import { TenantPrismaService, AiApiKeyResolverService, AiNotConfiguredError } from '@exam-platform/shared';
import { QuotaService } from '../billing/quota.service';

describe('AttemptInsightService', () => {
  let service: AttemptInsightService;
  let tenantPrisma: { forTenant: jest.Mock };
  let insightClient: { generate: jest.Mock };
  let aiApiKeyResolver: { resolve: jest.Mock };
  let quota: { assertAiCredits: jest.Mock };
  const fakeAiProvider = { generateStructured: jest.fn() };

  const attemptWithResult = {
    id: 'attempt-1',
    result: { percentage: 80, passFail: 'pass' },
    invitation: { exam: { organizationId: 'org-1' } },
  };

  beforeEach(async () => {
    tenantPrisma = { forTenant: jest.fn() };
    insightClient = { generate: jest.fn() };
    aiApiKeyResolver = { resolve: jest.fn().mockResolvedValue(fakeAiProvider) };
    quota = { assertAiCredits: jest.fn().mockResolvedValue(undefined) };
    const moduleRef = await Test.createTestingModule({
      providers: [
        AttemptInsightService,
        { provide: TenantPrismaService, useValue: tenantPrisma },
        { provide: InsightClient, useValue: insightClient },
        { provide: AiApiKeyResolverService, useValue: aiApiKeyResolver },
        { provide: QuotaService, useValue: quota },
      ],
    }).compile();
    service = moduleRef.get(AttemptInsightService);
  });

  it('resolves without doing anything when the attempt cannot be found', async () => {
    tenantPrisma.forTenant.mockResolvedValueOnce(null);

    await expect(service.analyze('missing-attempt')).resolves.toBeUndefined();

    expect(tenantPrisma.forTenant).toHaveBeenCalledTimes(1);
    expect(insightClient.generate).not.toHaveBeenCalled();
  });

  it('resolves without doing anything when the attempt has no Result yet', async () => {
    tenantPrisma.forTenant.mockResolvedValueOnce({ ...attemptWithResult, result: null });

    await expect(service.analyze('attempt-1')).resolves.toBeUndefined();

    expect(insightClient.generate).not.toHaveBeenCalled();
  });

  it('computes a per-topic breakdown, excludes untopic-ed questions, and persists a completed insight', async () => {
    const readTx = {
      answer: {
        findMany: jest.fn().mockResolvedValue([
          { isCorrect: true, question: { topic: 'SQL' } },
          { isCorrect: false, question: { topic: 'SQL' } },
          { isCorrect: true, question: { topic: null } },
        ]),
      },
      proctoringAnalysis: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const persistTx = { attemptInsight: { upsert: jest.fn() }, aiCreditUsage: { create: jest.fn() } };
    tenantPrisma.forTenant
      .mockResolvedValueOnce(attemptWithResult)
      // analyze() now claims the row as 'processing' before the slow AI call -- an extra
      // forTenant round-trip these ordered mocks must account for.
      .mockImplementationOnce((_ctx: unknown, fn: (tx: unknown) => unknown) => fn({ attemptInsight: { upsert: jest.fn() } }))
      .mockImplementationOnce((_ctx, fn) => fn(readTx))
      .mockImplementationOnce((_ctx, fn) => fn(persistTx));
    insightClient.generate.mockResolvedValue('Solid SQL performance.');

    await service.analyze('attempt-1');

    expect(insightClient.generate).toHaveBeenCalledWith(
      {
        percentage: 80,
        passFail: 'pass',
        topicBreakdown: [{ topic: 'SQL', correct: 1, total: 2 }],
        proctoring: null,
      },
      fakeAiProvider,
    );
    expect(persistTx.attemptInsight.upsert).toHaveBeenCalledWith({
      where: { attemptId: 'attempt-1' },
      create: { attemptId: 'attempt-1', status: 'completed', summary: 'Solid SQL performance.' },
      update: { status: 'completed', summary: 'Solid SQL performance.', generatedAt: expect.any(Date) },
    });
  });

  it('records AiCreditUsage with a flat 1 credit when generation succeeds', async () => {
    const readTx = {
      answer: { findMany: jest.fn().mockResolvedValue([]) },
      proctoringAnalysis: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const persistTx = { attemptInsight: { upsert: jest.fn() }, aiCreditUsage: { create: jest.fn() } };
    tenantPrisma.forTenant
      .mockResolvedValueOnce(attemptWithResult)
      // analyze() now claims the row as 'processing' before the slow AI call -- an extra
      // forTenant round-trip these ordered mocks must account for.
      .mockImplementationOnce((_ctx: unknown, fn: (tx: unknown) => unknown) => fn({ attemptInsight: { upsert: jest.fn() } }))
      .mockImplementationOnce((_ctx, fn) => fn(readTx))
      .mockImplementationOnce((_ctx, fn) => fn(persistTx));
    insightClient.generate.mockResolvedValue('Solid performance.');

    await service.analyze('attempt-1');

    expect(persistTx.aiCreditUsage.create).toHaveBeenCalledWith({
      data: { organizationId: 'org-1', source: 'insight_generation', credits: 1, sourceId: 'attempt-1' },
    });
  });

  it('does not record AiCreditUsage when the LLM client throws', async () => {
    const readTx = {
      answer: { findMany: jest.fn().mockResolvedValue([]) },
      proctoringAnalysis: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const persistTx = { attemptInsight: { upsert: jest.fn() }, aiCreditUsage: { create: jest.fn() } };
    tenantPrisma.forTenant
      .mockResolvedValueOnce(attemptWithResult)
      // analyze() now claims the row as 'processing' before the slow AI call -- an extra
      // forTenant round-trip these ordered mocks must account for.
      .mockImplementationOnce((_ctx: unknown, fn: (tx: unknown) => unknown) => fn({ attemptInsight: { upsert: jest.fn() } }))
      .mockImplementationOnce((_ctx, fn) => fn(readTx))
      .mockImplementationOnce((_ctx, fn) => fn(persistTx));
    insightClient.generate.mockRejectedValue(new Error('rate limited'));

    await service.analyze('attempt-1');

    expect(persistTx.aiCreditUsage.create).not.toHaveBeenCalled();
  });

  it('passes the ProctoringAnalysis result as plain context when it exists', async () => {
    const readTx = {
      answer: { findMany: jest.fn().mockResolvedValue([]) },
      proctoringAnalysis: {
        findUnique: jest.fn().mockResolvedValue({ status: 'completed', riskLevel: 'medium', summary: 'One tab switch.' }),
      },
    };
    const persistTx = { attemptInsight: { upsert: jest.fn() }, aiCreditUsage: { create: jest.fn() } };
    tenantPrisma.forTenant
      .mockResolvedValueOnce(attemptWithResult)
      // analyze() now claims the row as 'processing' before the slow AI call -- an extra
      // forTenant round-trip these ordered mocks must account for.
      .mockImplementationOnce((_ctx: unknown, fn: (tx: unknown) => unknown) => fn({ attemptInsight: { upsert: jest.fn() } }))
      .mockImplementationOnce((_ctx, fn) => fn(readTx))
      .mockImplementationOnce((_ctx, fn) => fn(persistTx));
    insightClient.generate.mockResolvedValue('Solid, one flag.');

    await service.analyze('attempt-1');

    expect(insightClient.generate).toHaveBeenCalledWith(
      expect.objectContaining({ proctoring: { riskLevel: 'medium', summary: 'One tab switch.' } }),
      fakeAiProvider,
    );
  });

  it('persists a failed insight when the LLM client throws, and does not re-throw', async () => {
    const readTx = {
      answer: { findMany: jest.fn().mockResolvedValue([]) },
      proctoringAnalysis: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const persistTx = { attemptInsight: { upsert: jest.fn() } };
    tenantPrisma.forTenant
      .mockResolvedValueOnce(attemptWithResult)
      // analyze() now claims the row as 'processing' before the slow AI call -- an extra
      // forTenant round-trip these ordered mocks must account for.
      .mockImplementationOnce((_ctx: unknown, fn: (tx: unknown) => unknown) => fn({ attemptInsight: { upsert: jest.fn() } }))
      .mockImplementationOnce((_ctx, fn) => fn(readTx))
      .mockImplementationOnce((_ctx, fn) => fn(persistTx));
    insightClient.generate.mockRejectedValue(new Error('rate limited'));

    await expect(service.analyze('attempt-1')).resolves.toBeUndefined();

    expect(persistTx.attemptInsight.upsert).toHaveBeenCalledWith({
      where: { attemptId: 'attempt-1' },
      create: { attemptId: 'attempt-1', status: 'failed', summary: null },
      update: { status: 'failed', summary: null, generatedAt: expect.any(Date) },
    });
  });

  it('records skipped_no_ai_key -- not failed -- when the org has no AI key, and never calls the LLM', async () => {
    // Audit finding F2: an entire 104-candidate round at one org persisted as bare `failed`,
    // and the report offered a Retry that could never succeed. A missing key is a distinct,
    // permanent, user-fixable condition and must be recorded as one.
    const readTx = {
      answer: { findMany: jest.fn().mockResolvedValue([]) },
      proctoringAnalysis: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const persistTx = { attemptInsight: { upsert: jest.fn() } };
    tenantPrisma.forTenant
      .mockResolvedValueOnce(attemptWithResult)
      .mockImplementationOnce((_ctx: unknown, fn: (tx: unknown) => unknown) => fn({ attemptInsight: { upsert: jest.fn() } }))
      .mockImplementationOnce((_ctx, fn) => fn(readTx))
      .mockImplementationOnce((_ctx, fn) => fn(persistTx));
    aiApiKeyResolver.resolve.mockRejectedValue(new AiNotConfiguredError('no key'));

    await expect(service.analyze('attempt-1')).resolves.toBeUndefined();

    expect(insightClient.generate).not.toHaveBeenCalled();
    expect(persistTx.attemptInsight.upsert).toHaveBeenCalledWith({
      where: { attemptId: 'attempt-1' },
      create: { attemptId: 'attempt-1', status: 'skipped_no_ai_key', summary: null },
      update: { status: 'skipped_no_ai_key', summary: null, generatedAt: expect.any(Date) },
    });
  });

  it('never throws even if the bootstrap lookup itself rejects', async () => {
    tenantPrisma.forTenant.mockRejectedValueOnce(new Error('DB connection lost'));

    await expect(service.analyze('attempt-1')).resolves.toBeUndefined();
  });

  it('skips the AI call and records no credit usage when the org is over its AI-credit quota', async () => {
    const readTx = {
      answer: { findMany: jest.fn().mockResolvedValue([]) },
      proctoringAnalysis: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const persistTx = { attemptInsight: { upsert: jest.fn() } };
    tenantPrisma.forTenant
      .mockResolvedValueOnce(attemptWithResult)
      .mockImplementationOnce((_ctx: unknown, fn: (tx: unknown) => unknown) => fn({ attemptInsight: { upsert: jest.fn() } }))
      .mockImplementationOnce((_ctx, fn) => fn(readTx))
      .mockImplementationOnce((_ctx, fn) => fn(persistTx));
    quota.assertAiCredits.mockRejectedValue(new Error('quota_exceeded'));

    await expect(service.analyze('attempt-1')).resolves.toBeUndefined();

    expect(insightClient.generate).not.toHaveBeenCalled();
    expect(persistTx.attemptInsight.upsert).toHaveBeenCalledWith({
      where: { attemptId: 'attempt-1' },
      create: { attemptId: 'attempt-1', status: 'failed', summary: null },
      update: { status: 'failed', summary: null, generatedAt: expect.any(Date) },
    });
  });
});
