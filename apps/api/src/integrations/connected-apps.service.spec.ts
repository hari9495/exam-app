import { NotFoundException, BadRequestException } from '@nestjs/common';
import { ConnectedAppsService } from './connected-apps.service';

describe('ConnectedAppsService', () => {
  let tx: any;
  let prisma: any;
  let crypto: { encrypt: jest.Mock; decrypt: jest.Mock };
  let audit: { record: jest.Mock };
  let integrationEvents: { enqueueTest: jest.Mock };
  const ctx = { organizationId: 'org-1', isSuperAdmin: false } as any;

  beforeEach(() => {
    tx = {
      orgIntegration: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      integrationDelivery: { findMany: jest.fn() },
    };
    prisma = { forTenant: jest.fn(async (_c: unknown, fn: any) => fn(tx)) };
    crypto = { encrypt: jest.fn((s: string) => `enc(${s})`), decrypt: jest.fn() };
    audit = { record: jest.fn() };
    integrationEvents = { enqueueTest: jest.fn() };
  });

  const service = () => new ConnectedAppsService(prisma, crypto as any, audit as any, integrationEvents as any);

  describe('create', () => {
    it('encrypts the URL, stores events JSON, audits, and returns a masked view', async () => {
      tx.orgIntegration.create.mockImplementation(async ({ data }: any) => ({ id: 'i1', ...data }));
      const view = await service().create(ctx, 'user-1', {
        type: 'slack',
        label: '#rec',
        targetUrl: 'https://hooks.slack.com/services/T/B/xyz',
        events: ['attempt.settled'],
      });

      expect(crypto.encrypt).toHaveBeenCalledWith('https://hooks.slack.com/services/T/B/xyz');
      expect(tx.orgIntegration.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organizationId: 'org-1',
          type: 'slack',
          label: '#rec',
          targetUrlEncrypted: 'enc(https://hooks.slack.com/services/T/B/xyz)',
          events: JSON.stringify(['attempt.settled']),
          status: 'active',
        }),
      });
      expect(view).not.toHaveProperty('targetUrl');
      expect(view).not.toHaveProperty('targetUrlEncrypted');
      expect(view.urlHint).toMatch(/\*\*\*\*/);
      expect(audit.record).toHaveBeenCalledWith(
        ctx,
        expect.objectContaining({ actorUserId: 'user-1', action: 'integration.connected', entityId: 'i1' }),
      );
    });

    it('rejects an off-allowlist URL before persisting', async () => {
      await expect(
        service().create(ctx, 'user-1', {
          type: 'slack',
          label: 'x',
          targetUrl: 'https://evil.example.com',
          events: ['attempt.settled'],
        }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service().create(ctx, 'user-1', {
          type: 'slack',
          label: 'x',
          targetUrl: 'https://evil.example.com',
          events: ['attempt.settled'],
        }),
      ).rejects.toThrow(/not an allowed/i);
      expect(tx.orgIntegration.create).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('rejects an msteams URL that is not https', async () => {
      await expect(
        service().create(ctx, 'user-1', {
          type: 'msteams',
          label: 'x',
          targetUrl: 'http://webhook.office.com/x',
          events: ['attempt.settled'],
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('list', () => {
    it('never returns the encrypted URL and parses events from JSON', async () => {
      tx.orgIntegration.findMany.mockResolvedValue([
        {
          id: 'i1',
          type: 'slack',
          label: '#r',
          events: '["attempt.settled"]',
          status: 'active',
          lastDeliveryAt: null,
          lastError: null,
          targetUrlEncrypted: 'enc',
        },
      ]);
      const rows = await service().list(ctx);
      expect(JSON.stringify(rows)).not.toContain('enc');
      expect(rows[0].events).toEqual(['attempt.settled']);
    });
  });

  describe('update', () => {
    it('re-validates the host allowlist and re-encrypts when targetUrl changes', async () => {
      tx.orgIntegration.findUnique.mockResolvedValue({ id: 'i1', type: 'slack' });
      tx.orgIntegration.update.mockImplementation(async ({ data }: any) => ({
        id: 'i1',
        type: 'slack',
        label: 'x',
        events: '[]',
        status: 'active',
        lastDeliveryAt: null,
        lastError: null,
        ...data,
      }));
      await service().update(ctx, 'user-1', 'i1', { targetUrl: 'https://hooks.slack.com/services/new' });
      expect(crypto.encrypt).toHaveBeenCalledWith('https://hooks.slack.com/services/new');
      expect(audit.record).toHaveBeenCalledWith(ctx, expect.objectContaining({ action: 'integration.updated', entityId: 'i1' }));
    });

    it('rejects an off-allowlist replacement URL and does not persist', async () => {
      tx.orgIntegration.findUnique.mockResolvedValue({ id: 'i1', type: 'msteams' });
      await expect(service().update(ctx, 'user-1', 'i1', { targetUrl: 'https://evil.example.com' })).rejects.toThrow(
        BadRequestException,
      );
      expect(tx.orgIntegration.update).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when changing the URL of a missing app', async () => {
      tx.orgIntegration.findUnique.mockResolvedValue(null);
      await expect(service().update(ctx, 'user-1', 'missing', { targetUrl: 'https://hooks.slack.com/x' })).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('deletes and audits', async () => {
      const result = await service().remove(ctx, 'user-1', 'i1');
      expect(tx.orgIntegration.delete).toHaveBeenCalledWith({ where: { id: 'i1' } });
      expect(audit.record).toHaveBeenCalledWith(ctx, expect.objectContaining({ action: 'integration.removed', entityId: 'i1' }));
      expect(result).toEqual({ ok: true });
    });
  });

  describe('test', () => {
    it('enqueues a test delivery when the integration is found for the tenant', async () => {
      tx.orgIntegration.findUnique.mockResolvedValue({ id: 'i1', type: 'slack' });
      const result = await service().test(ctx, 'i1');
      expect(tx.orgIntegration.findUnique).toHaveBeenCalledWith({ where: { id: 'i1' } });
      expect(integrationEvents.enqueueTest).toHaveBeenCalledWith('org-1', 'i1');
      expect(result).toEqual({ queued: true });
    });

    it('throws NotFoundException and does not enqueue when the id does not resolve under the tenant (cross-tenant IDOR guard)', async () => {
      tx.orgIntegration.findUnique.mockResolvedValue(null);
      await expect(service().test(ctx, 'other-org-integration')).rejects.toThrow(NotFoundException);
      expect(integrationEvents.enqueueTest).not.toHaveBeenCalled();
    });
  });

  describe('deliveries', () => {
    it('returns the most recent deliveries for the integration', async () => {
      tx.integrationDelivery.findMany.mockResolvedValue([{ id: 'd1' }]);
      const result = await service().deliveries(ctx, 'i1');
      expect(tx.integrationDelivery.findMany).toHaveBeenCalledWith({
        where: { integrationId: 'i1' },
        orderBy: { createdAt: 'desc' },
        take: 20,
      });
      expect(result).toEqual([{ id: 'd1' }]);
    });
  });
});
