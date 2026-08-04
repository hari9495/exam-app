import { SystemEventsRetentionService, RETENTION_DAYS } from './system-events-retention.service';
import { TenantPrismaService } from '@exam-platform/shared';

describe('SystemEventsRetentionService', () => {
  let deleteMany: jest.Mock;
  let tenantPrisma: { forTenant: jest.Mock };
  let service: SystemEventsRetentionService;

  beforeEach(() => {
    deleteMany = jest.fn().mockResolvedValue({ count: 3 });
    tenantPrisma = { forTenant: jest.fn().mockImplementation((_ctx, fn) => fn({ systemEvent: { deleteMany } })) };
    service = new SystemEventsRetentionService(tenantPrisma as unknown as TenantPrismaService);
  });

  it('deletes events older than the 30-day cutoff under a super-admin context', async () => {
    const now = new Date('2026-08-03T12:00:00.000Z');
    const count = await service.prune(now);

    expect(count).toBe(3);
    expect(tenantPrisma.forTenant).toHaveBeenCalledWith({ organizationId: null, isSuperAdmin: true }, expect.any(Function));
    const cutoff = deleteMany.mock.calls[0][0].where.occurredAt.lt as Date;
    expect(cutoff.toISOString()).toBe(new Date(now.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString());
  });

  it('returns 0 and never throws when the delete fails', async () => {
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
