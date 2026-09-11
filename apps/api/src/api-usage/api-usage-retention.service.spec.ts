import { ApiUsageRetentionService, API_USAGE_RETENTION_DAYS } from './api-usage-retention.service';
import { utcDay } from './api-usage.service';
import { TenantPrismaService } from '@exam-platform/shared';

describe('ApiUsageRetentionService', () => {
  let tenantPrisma: { forTenant: jest.Mock };
  let service: ApiUsageRetentionService;

  beforeEach(() => {
    tenantPrisma = { forTenant: jest.fn() };
    service = new ApiUsageRetentionService(tenantPrisma as unknown as TenantPrismaService);
  });

  it('deletes api_usage_daily rows older than 365 days under the all-org super-admin bypass', async () => {
    const deleteMany = jest.fn().mockResolvedValue({ count: 3 });
    const tx = { apiUsageDaily: { deleteMany } };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    const now = new Date('2026-09-08T00:00:00.000Z');
    const count = await service.prune(now);

    expect(count).toBe(3);
    expect(tenantPrisma.forTenant).toHaveBeenCalledWith({ organizationId: null, isSuperAdmin: true }, expect.any(Function));
    const expectedCutoff = utcDay(new Date(now.getTime() - API_USAGE_RETENTION_DAYS * 24 * 60 * 60 * 1000));
    expect(deleteMany).toHaveBeenCalledWith({ where: { day: { lt: expectedCutoff } } });
  });

  it('returns 0 and never throws when forTenant rejects', async () => {
    tenantPrisma.forTenant.mockRejectedValue(new Error('db down'));
    await expect(service.prune()).resolves.toBe(0);
  });

  it('starts and stops its daily timer with the module lifecycle', () => {
    jest.useFakeTimers();
    const pruneSpy = jest.spyOn(service, 'prune').mockResolvedValue(0);

    service.onModuleInit();
    expect(pruneSpy).toHaveBeenCalledTimes(1); // boot-time prune
    jest.advanceTimersByTime(24 * 60 * 60 * 1000);
    expect(pruneSpy).toHaveBeenCalledTimes(2);

    service.onModuleDestroy();
    jest.advanceTimersByTime(24 * 60 * 60 * 1000);
    expect(pruneSpy).toHaveBeenCalledTimes(2);
    jest.useRealTimers();
  });
});
