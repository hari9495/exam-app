import { Test } from '@nestjs/testing';
import { AttemptInsightService } from './attempt-insight.service';
import { ClaudeInsightClient } from './claude-insight.client';
import { TenantPrismaService, AiApiKeyResolverService } from '@exam-platform/shared';

describe('AttemptInsightService', () => {
  let service: AttemptInsightService;
  let tenantPrisma: { forTenant: jest.Mock };
  let claudeClient: { generate: jest.Mock };
  let aiApiKeyResolver: { resolve: jest.Mock };

  const attemptWithResult = {
    id: 'attempt-1',
    result: { percentage: 80, passFail: 'pass' },
    invitation: { exam: { organizationId: 'org-1' } },
  };

  beforeEach(async () => {
    tenantPrisma = { forTenant: jest.fn() };
    claudeClient = { generate: jest.fn() };
    aiApiKeyResolver = { resolve: jest.fn().mockResolvedValue('test-api-key') };
    const moduleRef = await Test.createTestingModule({
      providers: [
        AttemptInsightService,
        { provide: TenantPrismaService, useValue: tenantPrisma },
        { provide: ClaudeInsightClient, useValue: claudeClient },
        { provide: AiApiKeyResolverService, useValue: aiApiKeyResolver },
      ],
    }).compile();
    service = moduleRef.get(AttemptInsightService);
  });

  it('resolves without doing anything when the attempt cannot be found', async () => {
    tenantPrisma.forTenant.mockResolvedValueOnce(null);

    await expect(service.analyze('missing-attempt')).resolves.toBeUndefined();

    expect(tenantPrisma.forTenant).toHaveBeenCalledTimes(1);
    expect(claudeClient.generate).not.toHaveBeenCalled();
  });

  it('resolves without doing anything when the attempt has no Result yet', async () => {
    tenantPrisma.forTenant.mockResolvedValueOnce({ ...attemptWithResult, result: null });

    await expect(service.analyze('attempt-1')).resolves.toBeUndefined();

    expect(claudeClient.generate).not.toHaveBeenCalled();
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
      .mockImplementationOnce((_ctx, fn) => fn(readTx))
      .mockImplementationOnce((_ctx, fn) => fn(persistTx));
    claudeClient.generate.mockResolvedValue('Solid SQL performance.');

    await service.analyze('attempt-1');

    expect(claudeClient.generate).toHaveBeenCalledWith(
      {
        percentage: 80,
        passFail: 'pass',
        topicBreakdown: [{ topic: 'SQL', correct: 1, total: 2 }],
        proctoring: null,
      },
      'test-api-key',
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
      .mockImplementationOnce((_ctx, fn) => fn(readTx))
      .mockImplementationOnce((_ctx, fn) => fn(persistTx));
    claudeClient.generate.mockResolvedValue('Solid performance.');

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
      .mockImplementationOnce((_ctx, fn) => fn(readTx))
      .mockImplementationOnce((_ctx, fn) => fn(persistTx));
    claudeClient.generate.mockRejectedValue(new Error('rate limited'));

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
      .mockImplementationOnce((_ctx, fn) => fn(readTx))
      .mockImplementationOnce((_ctx, fn) => fn(persistTx));
    claudeClient.generate.mockResolvedValue('Solid, one flag.');

    await service.analyze('attempt-1');

    expect(claudeClient.generate).toHaveBeenCalledWith(
      expect.objectContaining({ proctoring: { riskLevel: 'medium', summary: 'One tab switch.' } }),
      'test-api-key',
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
      .mockImplementationOnce((_ctx, fn) => fn(readTx))
      .mockImplementationOnce((_ctx, fn) => fn(persistTx));
    claudeClient.generate.mockRejectedValue(new Error('rate limited'));

    await expect(service.analyze('attempt-1')).resolves.toBeUndefined();

    expect(persistTx.attemptInsight.upsert).toHaveBeenCalledWith({
      where: { attemptId: 'attempt-1' },
      create: { attemptId: 'attempt-1', status: 'failed', summary: null },
      update: { status: 'failed', summary: null, generatedAt: expect.any(Date) },
    });
  });

  it('never throws even if the bootstrap lookup itself rejects', async () => {
    tenantPrisma.forTenant.mockRejectedValueOnce(new Error('DB connection lost'));

    await expect(service.analyze('attempt-1')).resolves.toBeUndefined();
  });
});
