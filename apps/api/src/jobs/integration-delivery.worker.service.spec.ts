// Stub BullMQ so constructing the service does not open a real Redis connection
// (the Worker is created in the constructor; these tests exercise deliver() directly).
jest.mock('bullmq', () => ({
  Worker: jest.fn().mockImplementation(() => ({ on: jest.fn(), close: jest.fn() })),
}));

import { IntegrationDeliveryWorkerService } from './integration-delivery.worker.service';

describe('IntegrationDeliveryWorkerService.deliver', () => {
  const crypto = { decrypt: jest.fn((b: string) => b.replace('enc:', '')) } as any;
  const prisma = { forTenant: jest.fn(async (_c: unknown, fn: any) => fn(txStub)) } as any;
  let txStub: any;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    txStub = { integrationDelivery: { update: jest.fn() }, orgIntegration: { update: jest.fn() } };
    prisma.forTenant = jest.fn(async (_c: unknown, fn: any) => fn(txStub));
    fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200 });
    (global as any).fetch = fetchMock;
    process.env.APP_BASE_URL = 'https://app.example.com';
  });

  function svc() { return new IntegrationDeliveryWorkerService({} as any, prisma, crypto); }

  const integration = { id: 'i1', organizationId: 'o1', type: 'slack', targetUrlEncrypted: 'enc:https://hooks.slack.com/services/A/B/c', status: 'active' };
  const delivery = { id: 'd1', organizationId: 'o1', integrationId: 'i1', eventType: 'attempt.submitted' };

  it('POSTs to the decrypted Slack URL and marks delivered', async () => {
    await svc().deliver(delivery as any, integration as any, 'attempt.submitted', { subject: 'Ada', linkPath: '/candidates/9' });
    expect(fetchMock).toHaveBeenCalledWith('https://hooks.slack.com/services/A/B/c', expect.objectContaining({ method: 'POST', redirect: 'error' }));
    expect(txStub.integrationDelivery.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'delivered', httpStatusCode: 200 }) }));
    expect(txStub.orgIntegration.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ lastDeliveryAt: expect.any(Date), lastError: null }) }));
  });

  it('rejects an off-allowlist URL without calling fetch', async () => {
    const bad = { ...integration, targetUrlEncrypted: 'enc:https://evil.example.com/x' };
    await expect(svc().deliver(delivery as any, bad as any, 'attempt.submitted', { subject: 'Ada', linkPath: '/candidates/9' })).rejects.toThrow(/not an allowed/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('throws on non-2xx so BullMQ retries', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });
    await expect(svc().deliver(delivery as any, integration as any, 'attempt.submitted', { subject: 'Ada', linkPath: '/candidates/9' })).rejects.toThrow(/status 500/);
  });

  it('treats a redirect (fetch rejects under redirect:error) as a failed delivery, never following it (SSRF guard)', async () => {
    // undici rejects with a redirect error when redirect:'error' and the endpoint 3xx-redirects
    fetchMock.mockRejectedValue(new Error('unexpected redirect'));
    await expect(svc().deliver(delivery as any, integration as any, 'attempt.submitted', { subject: 'Ada', linkPath: '/candidates/9' })).rejects.toThrow(/redirect/i);
    expect(txStub.integrationDelivery.update).not.toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'delivered' }) }));
  });

  const webhookIntegration = { id: 'i2', organizationId: 'o1', type: 'webhook', targetUrlEncrypted: 'enc:https://93.184.216.34/hook', status: 'active' };

  it('posts a raw-JSON body (not Slack blocks) for a generic webhook type', async () => {
    await svc().deliver(delivery as any, webhookIntegration as any, 'attempt.submitted', { subject: 'Ada', examTitle: 'Backend', linkPath: '/candidates/9' });
    const body = JSON.parse((fetchMock.mock.calls[0][1] as any).body);
    expect(body).toMatchObject({ event: 'attempt.submitted', data: { Candidate: 'Ada', Exam: 'Backend' } });
    expect(body.blocks).toBeUndefined();
  });

  it('refuses a generic webhook whose hostname resolves to an internal address (delivery-time SSRF)', async () => {
    const dns = require('node:dns').promises;
    const spy = jest.spyOn(dns, 'lookup').mockResolvedValue([{ address: '169.254.169.254', family: 4 }]);
    const bad = { ...webhookIntegration, targetUrlEncrypted: 'enc:https://sneaky.example.com/hook' };
    await expect(svc().deliver(delivery as any, bad as any, 'attempt.submitted', { subject: 'Ada', linkPath: '/x' })).rejects.toThrow(/non-public/i);
    expect(fetchMock).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
