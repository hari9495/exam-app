import { Test } from '@nestjs/testing';
import { TenantPrismaService } from '@exam-platform/shared';
import { ApiUsageService } from './api-usage.service';

describe('ApiUsageService', () => {
  let service: ApiUsageService;
  let tenantPrisma: { forTenant: jest.Mock };
  const context = { organizationId: 'org-1', isSuperAdmin: false };

  beforeEach(async () => {
    tenantPrisma = { forTenant: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [ApiUsageService, { provide: TenantPrismaService, useValue: tenantPrisma }],
    }).compile();
    service = moduleRef.get(ApiUsageService);
  });

  it('upserts request counts: create with requestCount 1 / update increments requestCount', async () => {
    const tx = { apiUsageDaily: { upsert: jest.fn().mockResolvedValue({}) } };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await service.record(context, 'GET /public/candidates', 'request');

    expect(tx.apiUsageDaily.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId_day_endpoint: { organizationId: 'org-1', day: expect.any(Date), endpoint: 'GET /public/candidates' } },
        create: expect.objectContaining({ organizationId: 'org-1', endpoint: 'GET /public/candidates', requestCount: 1, throttledCount: 0 }),
        update: { requestCount: { increment: 1 } },
      }),
    );
  });

  it('upserts throttled counts: create with throttledCount 1 / update increments throttledCount', async () => {
    const tx = { apiUsageDaily: { upsert: jest.fn().mockResolvedValue({}) } };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await service.record(context, 'GET /public/candidates', 'throttled');

    expect(tx.apiUsageDaily.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId_day_endpoint: { organizationId: 'org-1', day: expect.any(Date), endpoint: 'GET /public/candidates' } },
        create: expect.objectContaining({ organizationId: 'org-1', endpoint: 'GET /public/candidates', requestCount: 0, throttledCount: 1 }),
        update: { throttledCount: { increment: 1 } },
      }),
    );
  });

  it('swallows a rejecting forTenant instead of throwing', async () => {
    tenantPrisma.forTenant.mockRejectedValue(new Error('db down'));

    await expect(service.record(context, 'GET /x', 'request')).resolves.toBeUndefined();
  });

  describe('report', () => {
    const now = new Date('2026-09-08T12:00:00.000Z');

    it('queries forTenant with a gte window inclusive of today', async () => {
      const tx = { apiUsageDaily: { findMany: jest.fn().mockResolvedValue([]) } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await service.report(context, 30, now);

      expect(tenantPrisma.forTenant).toHaveBeenCalledWith(context, expect.any(Function));
      expect(tx.apiUsageDaily.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { day: { gte: new Date('2026-08-10T00:00:00.000Z') } } }),
      );
    });

    it('sums totals, groups byEndpoint desc by requests, groups byDay ascending as YYYY-MM-DD', async () => {
      const rows = [
        { day: new Date('2026-09-07T00:00:00.000Z'), endpoint: 'GET /a', requestCount: 5, throttledCount: 1 },
        { day: new Date('2026-09-07T00:00:00.000Z'), endpoint: 'GET /b', requestCount: 20, throttledCount: 0 },
        { day: new Date('2026-09-08T00:00:00.000Z'), endpoint: 'GET /a', requestCount: 3, throttledCount: 0 },
        { day: new Date('2026-09-08T00:00:00.000Z'), endpoint: 'GET /b', requestCount: 2, throttledCount: 2 },
      ];
      const tx = { apiUsageDaily: { findMany: jest.fn().mockResolvedValue(rows) } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const report = await service.report(context, 30, now);

      expect(report.window).toBe(30);
      expect(report.totals).toEqual({ requests: 30, throttled: 3 });
      expect(report.byEndpoint).toEqual([
        { endpoint: 'GET /b', requests: 22, throttled: 2 },
        { endpoint: 'GET /a', requests: 8, throttled: 1 },
      ]);
      expect(report.byDay).toEqual([
        { day: '2026-09-07', requests: 25, throttled: 1 },
        { day: '2026-09-08', requests: 5, throttled: 2 },
      ]);
    });
  });
});
