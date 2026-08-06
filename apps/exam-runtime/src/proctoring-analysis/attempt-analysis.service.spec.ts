import { Test } from '@nestjs/testing';
import { AttemptAnalysisService } from './attempt-analysis.service';
import { ProctoringRiskClient } from './proctoring-risk.client';
import { TenantPrismaService, AiApiKeyResolverService } from '@exam-platform/shared';

describe('AttemptAnalysisService', () => {
  let service: AttemptAnalysisService;
  let tenantPrisma: { forTenant: jest.Mock };
  let proctoringRiskClient: { assessRisk: jest.Mock };
  let aiApiKeyResolver: { resolve: jest.Mock };
  let aiProvider: { generateStructured: jest.Mock };

  const startedAt = new Date('2026-07-09T10:00:00Z');
  const attemptWithExam = {
    id: 'attempt-1',
    startedAt,
    invitation: { exam: { organizationId: 'org-1' } },
  };

  beforeEach(async () => {
    tenantPrisma = { forTenant: jest.fn() };
    proctoringRiskClient = { assessRisk: jest.fn() };
    aiProvider = { generateStructured: jest.fn() };
    aiApiKeyResolver = { resolve: jest.fn().mockResolvedValue(aiProvider) };
    const moduleRef = await Test.createTestingModule({
      providers: [
        AttemptAnalysisService,
        { provide: TenantPrismaService, useValue: tenantPrisma },
        { provide: ProctoringRiskClient, useValue: proctoringRiskClient },
        { provide: AiApiKeyResolverService, useValue: aiApiKeyResolver },
      ],
    }).compile();
    service = moduleRef.get(AttemptAnalysisService);
  });

  it('resolves without doing anything when the attempt cannot be found', async () => {
    tenantPrisma.forTenant.mockResolvedValueOnce(null);

    await expect(service.analyze('missing-attempt')).resolves.toBeUndefined();

    expect(tenantPrisma.forTenant).toHaveBeenCalledTimes(1);
    expect(proctoringRiskClient.assessRisk).not.toHaveBeenCalled();
  });

  it('skips the LLM call and records skipped_clean when there are no proctoring events', async () => {
    const readTx = { proctoringEvent: { findMany: jest.fn().mockResolvedValue([]) } };
    const persistTx = { proctoringAnalysis: { upsert: jest.fn() } };
    tenantPrisma.forTenant
      .mockResolvedValueOnce(attemptWithExam)
      // analyze() now claims the row as 'processing' before the slow AI call -- an extra
      // forTenant round-trip these ordered mocks must account for.
      .mockImplementationOnce((_ctx: unknown, fn: (tx: unknown) => unknown) => fn({ proctoringAnalysis: { upsert: jest.fn() } }))
      .mockImplementationOnce((_ctx, fn) => fn(readTx))
      .mockImplementationOnce((_ctx, fn) => fn(persistTx));

    await service.analyze('attempt-1');

    expect(proctoringRiskClient.assessRisk).not.toHaveBeenCalled();
    expect(persistTx.proctoringAnalysis.upsert).toHaveBeenCalledWith({
      where: { attemptId: 'attempt-1' },
      create: { attemptId: 'attempt-1', status: 'skipped_clean', riskLevel: 'low', summary: 'No proctoring events were recorded during this attempt.' },
      update: { status: 'skipped_clean', riskLevel: 'low', summary: 'No proctoring events were recorded during this attempt.', analyzedAt: expect.any(Date) },
    });
  });

  it('calls the LLM with elapsed-second timestamps and persists a completed analysis', async () => {
    const events = [{ eventType: 'tab_switch', severity: 'medium', occurredAt: new Date('2026-07-09T10:02:00Z') }];
    const readTx = { proctoringEvent: { findMany: jest.fn().mockResolvedValue(events) } };
    const persistTx = { proctoringAnalysis: { upsert: jest.fn() } };
    tenantPrisma.forTenant
      .mockResolvedValueOnce(attemptWithExam)
      // analyze() now claims the row as 'processing' before the slow AI call -- an extra
      // forTenant round-trip these ordered mocks must account for.
      .mockImplementationOnce((_ctx: unknown, fn: (tx: unknown) => unknown) => fn({ proctoringAnalysis: { upsert: jest.fn() } }))
      .mockImplementationOnce((_ctx, fn) => fn(readTx))
      .mockImplementationOnce((_ctx, fn) => fn(persistTx));
    proctoringRiskClient.assessRisk.mockResolvedValue({ riskLevel: 'medium', summary: 'One tab switch.' });

    await service.analyze('attempt-1');

    expect(proctoringRiskClient.assessRisk).toHaveBeenCalledWith([{ eventType: 'tab_switch', severity: 'medium', elapsedSeconds: 120 }], aiProvider);
    expect(persistTx.proctoringAnalysis.upsert).toHaveBeenCalledWith({
      where: { attemptId: 'attempt-1' },
      create: { attemptId: 'attempt-1', status: 'completed', riskLevel: 'medium', summary: 'One tab switch.' },
      update: { status: 'completed', riskLevel: 'medium', summary: 'One tab switch.', analyzedAt: expect.any(Date) },
    });
  });

  it('persists a failed analysis when the LLM client throws, and does not re-throw', async () => {
    const events = [{ eventType: 'tab_switch', severity: 'medium', occurredAt: new Date('2026-07-09T10:02:00Z') }];
    const readTx = { proctoringEvent: { findMany: jest.fn().mockResolvedValue(events) } };
    const persistTx = { proctoringAnalysis: { upsert: jest.fn() } };
    tenantPrisma.forTenant
      .mockResolvedValueOnce(attemptWithExam)
      // analyze() now claims the row as 'processing' before the slow AI call -- an extra
      // forTenant round-trip these ordered mocks must account for.
      .mockImplementationOnce((_ctx: unknown, fn: (tx: unknown) => unknown) => fn({ proctoringAnalysis: { upsert: jest.fn() } }))
      .mockImplementationOnce((_ctx, fn) => fn(readTx))
      .mockImplementationOnce((_ctx, fn) => fn(persistTx));
    proctoringRiskClient.assessRisk.mockRejectedValue(new Error('rate limited'));

    await expect(service.analyze('attempt-1')).resolves.toBeUndefined();

    expect(persistTx.proctoringAnalysis.upsert).toHaveBeenCalledWith({
      where: { attemptId: 'attempt-1' },
      create: { attemptId: 'attempt-1', status: 'failed', riskLevel: null, summary: null },
      update: { status: 'failed', riskLevel: null, summary: null, analyzedAt: expect.any(Date) },
    });
  });

  it('never throws even if the bootstrap lookup itself rejects', async () => {
    tenantPrisma.forTenant.mockRejectedValueOnce(new Error('DB connection lost'));

    await expect(service.analyze('attempt-1')).resolves.toBeUndefined();
  });
});
