import { WebhookDeliveryWorkerService } from './webhook-delivery.worker.service';
import { TenantPrismaService, OrgSecretsCryptoService } from '@exam-platform/shared';
import { createHmac } from 'crypto';

describe('WebhookDeliveryWorkerService', () => {
  let worker: WebhookDeliveryWorkerService;
  let tenantPrisma: { forTenant: jest.Mock };
  let cryptoService: { decrypt: jest.Mock };
  const originalFetch = global.fetch;

  beforeEach(() => {
    tenantPrisma = { forTenant: jest.fn() };
    cryptoService = { decrypt: jest.fn().mockReturnValue('plaintext-secret') };
    worker = new WebhookDeliveryWorkerService({} as any, tenantPrisma as any, cryptoService as any);
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('signs the payload with HMAC-SHA256 of the decrypted secret and posts it', async () => {
    const delivery = {
      id: 'delivery-1', payloadJson: JSON.stringify({ id: 'inv-1' }),
      organization: { webhookUrl: 'https://example.com/hook', webhookSecretEncrypted: 'encrypted-blob' },
    };
    const tx = { webhookDelivery: { findUniqueOrThrow: jest.fn().mockResolvedValue(delivery), update: jest.fn() } };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 });

    await (worker as any).handle({ data: { deliveryId: 'delivery-1' } });

    const expectedSignature = createHmac('sha256', 'plaintext-secret').update(delivery.payloadJson).digest('hex');
    expect(global.fetch).toHaveBeenCalledWith('https://example.com/hook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Webhook-Signature': expectedSignature },
      body: delivery.payloadJson,
    });
    expect(tx.webhookDelivery.update).toHaveBeenCalledWith({
      where: { id: 'delivery-1' },
      data: { status: 'delivered', httpStatusCode: 200, attemptCount: { increment: 1 }, lastAttemptAt: expect.any(Date) },
    });
  });

  it('records status pending (not failed) and throws on a non-2xx response, to let BullMQ retry', async () => {
    const delivery = { id: 'delivery-1', payloadJson: '{}', organization: { webhookUrl: 'https://example.com/hook', webhookSecretEncrypted: 'blob' } };
    const tx = { webhookDelivery: { findUniqueOrThrow: jest.fn().mockResolvedValue(delivery), update: jest.fn() } };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 });

    await expect((worker as any).handle({ data: { deliveryId: 'delivery-1' } })).rejects.toThrow('500');
    expect(tx.webhookDelivery.update).toHaveBeenCalledWith({
      where: { id: 'delivery-1' },
      data: { status: 'pending', httpStatusCode: 500, attemptCount: { increment: 1 }, lastAttemptAt: expect.any(Date) },
    });
  });

  it('marks a delivery permanently failed only once BullMQ has exhausted all retries', async () => {
    const updateMock = jest.fn();
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn({ webhookDelivery: { update: updateMock } }));

    await (worker as any).markFailed('delivery-1');

    expect(updateMock).toHaveBeenCalledWith({ where: { id: 'delivery-1' }, data: { status: 'failed' } });
  });
});
