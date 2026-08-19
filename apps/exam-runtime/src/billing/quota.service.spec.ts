import { QuotaService } from './quota.service';

describe('exam-runtime QuotaService.assertAiCredits', () => {
  const ctx = { organizationId: 'org-1', isSuperAdmin: false };
  let tx: any;
  let tenantPrisma: any;
  let service: QuotaService;

  beforeEach(() => {
    tx = {
      organization: { findFirst: jest.fn().mockResolvedValue({ plan: { aiCreditLimit: 50 } }) },
      aiCreditUsage: { aggregate: jest.fn().mockResolvedValue({ _sum: { credits: 50 } }) },
    };
    tenantPrisma = { forTenant: jest.fn(async (_c: any, fn: any) => fn(tx)) };
    service = new QuotaService(tenantPrisma);
  });

  it('throws at/over the limit', async () => {
    await expect(service.assertAiCredits(ctx as any)).rejects.toBeTruthy();
  });

  it('passes under', async () => {
    tx.aiCreditUsage.aggregate.mockResolvedValue({ _sum: { credits: 49 } });
    await expect(service.assertAiCredits(ctx as any)).resolves.toBeUndefined();
  });

  it('bypasses super-admin', async () => {
    await expect(service.assertAiCredits({ organizationId: null, isSuperAdmin: true } as any)).resolves.toBeUndefined();
    expect(tenantPrisma.forTenant).not.toHaveBeenCalled();
  });
});
