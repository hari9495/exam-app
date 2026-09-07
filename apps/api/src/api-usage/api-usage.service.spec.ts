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
});
