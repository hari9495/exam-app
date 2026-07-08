import { Test } from '@nestjs/testing';
import { AttemptAnalysisService } from './attempt-analysis.service';
import { ClaudeProctoringClient } from './claude-proctoring.client';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';

describe('AttemptAnalysisService', () => {
  let service: AttemptAnalysisService;
  let tenantPrisma: { forTenant: jest.Mock };
  let claudeClient: { assessRisk: jest.Mock };

  const startedAt = new Date('2026-07-09T10:00:00Z');
  const attemptWithExam = {
    id: 'attempt-1',
    startedAt,
    invitation: { exam: { organizationId: 'org-1' } },
  };

  beforeEach(async () => {
    tenantPrisma = { forTenant: jest.fn() };
    claudeClient = { assessRisk: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        AttemptAnalysisService,
        { provide: TenantPrismaService, useValue: tenantPrisma },
        { provide: ClaudeProctoringClient, useValue: claudeClient },
      ],
    }).compile();
    service = moduleRef.get(AttemptAnalysisService);
  });

  it('resolves without doing anything when the attempt cannot be found', async () => {
    tenantPrisma.forTenant.mockResolvedValueOnce(null);

    await expect(service.analyze('missing-attempt')).resolves.toBeUndefined();

    expect(tenantPrisma.forTenant).toHaveBeenCalledTimes(1);
    expect(claudeClient.assessRisk).not.toHaveBeenCalled();
  });

  it('skips the LLM call and records skipped_clean when there are no proctoring events', async () => {
    const scopedTx = { proctoringEvent: { findMany: jest.fn().mockResolvedValue([]) }, proctoringAnalysis: { upsert: jest.fn() } };
    tenantPrisma.forTenant.mockResolvedValueOnce(attemptWithExam).mockImplementationOnce((_ctx, fn) => fn(scopedTx));

    await service.analyze('attempt-1');

    expect(claudeClient.assessRisk).not.toHaveBeenCalled();
    expect(scopedTx.proctoringAnalysis.upsert).toHaveBeenCalledWith({
      where: { attemptId: 'attempt-1' },
      create: { attemptId: 'attempt-1', status: 'skipped_clean', riskLevel: 'low', summary: 'No proctoring events were recorded during this attempt.' },
      update: { status: 'skipped_clean', riskLevel: 'low', summary: 'No proctoring events were recorded during this attempt.', analyzedAt: expect.any(Date) },
    });
  });

  it('calls the LLM with elapsed-second timestamps and persists a completed analysis', async () => {
    const events = [{ eventType: 'tab_switch', severity: 'medium', occurredAt: new Date('2026-07-09T10:02:00Z') }];
    const scopedTx = {
      proctoringEvent: { findMany: jest.fn().mockResolvedValue(events) },
      proctoringAnalysis: { upsert: jest.fn() },
    };
    tenantPrisma.forTenant.mockResolvedValueOnce(attemptWithExam).mockImplementationOnce((_ctx, fn) => fn(scopedTx));
    claudeClient.assessRisk.mockResolvedValue({ riskLevel: 'medium', summary: 'One tab switch.' });

    await service.analyze('attempt-1');

    expect(claudeClient.assessRisk).toHaveBeenCalledWith([{ eventType: 'tab_switch', severity: 'medium', elapsedSeconds: 120 }]);
    expect(scopedTx.proctoringAnalysis.upsert).toHaveBeenCalledWith({
      where: { attemptId: 'attempt-1' },
      create: { attemptId: 'attempt-1', status: 'completed', riskLevel: 'medium', summary: 'One tab switch.' },
      update: { status: 'completed', riskLevel: 'medium', summary: 'One tab switch.', analyzedAt: expect.any(Date) },
    });
  });

  it('persists a failed analysis when the LLM client throws, and does not re-throw', async () => {
    const events = [{ eventType: 'tab_switch', severity: 'medium', occurredAt: new Date('2026-07-09T10:02:00Z') }];
    const scopedTx = {
      proctoringEvent: { findMany: jest.fn().mockResolvedValue(events) },
      proctoringAnalysis: { upsert: jest.fn() },
    };
    tenantPrisma.forTenant.mockResolvedValueOnce(attemptWithExam).mockImplementationOnce((_ctx, fn) => fn(scopedTx));
    claudeClient.assessRisk.mockRejectedValue(new Error('rate limited'));

    await expect(service.analyze('attempt-1')).resolves.toBeUndefined();

    expect(scopedTx.proctoringAnalysis.upsert).toHaveBeenCalledWith({
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
