import { UsageService } from './usage.service';

describe('UsageService', () => {
  const context = { organizationId: 'org-1', isSuperAdmin: false };
  let tx: any; let tenantPrisma: any; let service: UsageService;

  beforeEach(() => {
    tx = {
      organization: { findFirst: jest.fn().mockResolvedValue({ id: 'org-1', plan: { name: 'Trial', seatLimit: 5, candidateLimit: 100, aiCreditLimit: 50, proctoringMinutesLimit: 200 } }) },
      user: { count: jest.fn().mockResolvedValue(3) },
      candidate: { count: jest.fn().mockResolvedValue(42) },
      aiCreditUsage: { aggregate: jest.fn().mockResolvedValue({ _sum: { credits: 20 } }) },
      $queryRaw: jest.fn().mockResolvedValue([{ minutes: 75 }]),
    };
    tenantPrisma = { forTenant: jest.fn(async (_c: any, fn: any) => fn(tx)) };
    service = new UsageService(tenantPrisma);
  });

  it('returns all four dimensions with used + limit', async () => {
    const u = await service.getUsage(context as any);
    expect(u.planName).toBe('Trial');
    expect(u.seats).toEqual({ used: 3, limit: 5 });
    expect(u.candidates).toEqual({ used: 42, limit: 100 });
    expect(u.aiCredits).toEqual({ used: 20, limit: 50 });
    expect(u.proctoringMinutes).toEqual({ used: 75, limit: 200 });
    // active-only seats + non-erased candidates + period-filtered AI credits
    expect(tx.user.count).toHaveBeenCalledWith({ where: { organizationId: 'org-1', status: 'active' } });
    expect(tx.candidate.count).toHaveBeenCalledWith({ where: { organizationId: 'org-1', erasedAt: null } });
    expect(tx.aiCreditUsage.aggregate).toHaveBeenCalledWith(expect.objectContaining({ _sum: { credits: true }, where: expect.objectContaining({ organizationId: 'org-1', occurredAt: expect.objectContaining({ gte: expect.any(Date) }) }) }));
  });

  it('treats a null aiCredit sum and empty proctoring result as 0', async () => {
    tx.aiCreditUsage.aggregate.mockResolvedValue({ _sum: { credits: null } });
    tx.$queryRaw.mockResolvedValue([{ minutes: null }]);
    const u = await service.getUsage(context as any);
    expect(u.aiCredits.used).toBe(0);
    expect(u.proctoringMinutes.used).toBe(0);
  });
});
