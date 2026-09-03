import { QuotaExceededException } from './quota-exceeded.exception';
import { QuotaService } from './quota.service';

describe('QuotaService', () => {
  const ctx = { organizationId: 'org-1', isSuperAdmin: false };
  let usage: any; let tenantPrisma: any; let email: any; let tx: any; let service: QuotaService;

  beforeEach(() => {
    tx = { billingNotice: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({}) },
           organization: { findFirst: jest.fn().mockResolvedValue({ name: 'Acme', logoPath: null }) },
           user: { findMany: jest.fn().mockResolvedValue([{ email: 'admin@acme.test' }]) } };
    tenantPrisma = { forTenant: jest.fn(async (_c: any, fn: any) => fn(tx)) };
    usage = { getUsage: jest.fn() };
    email = { send: jest.fn().mockResolvedValue({ success: true }) };
    service = new QuotaService(usage, tenantPrisma, email);
  });

  describe('assertWithinLimit (hard)', () => {
    it('throws 402 QuotaExceededException at/over the limit', async () => {
      usage.getUsage.mockResolvedValue({ aiCredits: { used: 50, limit: 50 } });
      await expect(service.assertWithinLimit(ctx as any, 'ai_credits')).rejects.toBeInstanceOf(QuotaExceededException);
    });
    it('passes under the limit', async () => {
      usage.getUsage.mockResolvedValue({ aiCredits: { used: 49, limit: 50 } });
      await expect(service.assertWithinLimit(ctx as any, 'ai_credits')).resolves.toBeUndefined();
    });
    it('bypasses for super-admin', async () => {
      await expect(service.assertWithinLimit({ organizationId: null, isSuperAdmin: true } as any, 'ai_credits')).resolves.toBeUndefined();
      expect(usage.getUsage).not.toHaveBeenCalled();
    });
  });

  describe('checkSoftLimit (soft)', () => {
    it('never throws; returns warn+threshold and emails once when a threshold is first crossed', async () => {
      usage.getUsage.mockResolvedValue({ seats: { used: 5, limit: 5 } }); // ratio 1.0 -> 100
      const r = await service.checkSoftLimit(ctx as any, 'seats');
      expect(r).toEqual({ warn: true, threshold: 100, used: 5, limit: 5 });
      expect(tx.billingNotice.create).toHaveBeenCalled();
      expect(email.send).toHaveBeenCalled();
    });
    it('does not re-email when the notice already exists (dedup)', async () => {
      usage.getUsage.mockResolvedValue({ seats: { used: 5, limit: 5 } });
      tx.billingNotice.findFirst.mockResolvedValue({ id: 'existing' });
      const r = await service.checkSoftLimit(ctx as any, 'seats');
      expect(r.warn).toBe(true);
      expect(tx.billingNotice.create).not.toHaveBeenCalled();
      expect(email.send).not.toHaveBeenCalled();
    });
    it('returns warn=false below 80% and does not email', async () => {
      usage.getUsage.mockResolvedValue({ seats: { used: 3, limit: 5 } }); // 0.6
      const r = await service.checkSoftLimit(ctx as any, 'seats');
      expect(r.warn).toBe(false);
      expect(email.send).not.toHaveBeenCalled();
    });
    it('bypasses for super-admin (warn=false, no work)', async () => {
      const r = await service.checkSoftLimit({ organizationId: null, isSuperAdmin: true } as any, 'seats');
      expect(r.warn).toBe(false);
      expect(usage.getUsage).not.toHaveBeenCalled();
    });
  });
});
