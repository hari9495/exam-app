// Stub BullMQ so constructing the service does not open a real Redis connection (the Worker is
// created in the constructor; these tests exercise deliver() directly).
jest.mock('bullmq', () => ({
  Worker: jest.fn().mockImplementation(() => ({ on: jest.fn(), close: jest.fn() })),
}));

import { HrisExportWorkerService } from './hris-export.worker.service';

describe('HrisExportWorkerService.deliver', () => {
  const crypto = { decrypt: jest.fn((b: string) => b.replace('enc:', '')) } as any;
  const tenantPrisma = { forTenant: jest.fn() } as any;
  let txStub: any;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    txStub = { hrisExportDelivery: { update: jest.fn() } };
    tenantPrisma.forTenant = jest.fn(async (_c: unknown, fn: any) => fn(txStub));
    fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200 });
    (global as any).fetch = fetchMock;
  });

  function svc() { return new HrisExportWorkerService({} as any, tenantPrisma, crypto); }

  const delivery = { id: 'd1', organizationId: 'o1', payloadJson: '{"event":"candidate.hired"}' };
  // public IP literal so the allowlist + DNS SSRF guard pass without real DNS.
  const org = { hrisExportEnabled: true, hrisTargetUrl: 'https://93.184.216.34/in', hrisAuthHeaderEncrypted: 'enc:Bearer tok' };

  it('POSTs the snapshot payload with the decrypted Authorization header and marks delivered', async () => {
    await svc().deliver(delivery as any, org as any);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://93.184.216.34/in',
      expect.objectContaining({
        method: 'POST',
        redirect: 'error',
        headers: expect.objectContaining({ 'Content-Type': 'application/json', Authorization: 'Bearer tok' }),
        body: '{"event":"candidate.hired"}',
      }),
    );
    expect(txStub.hrisExportDelivery.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'delivered', httpStatusCode: 200 }) }),
    );
  });

  it('omits the Authorization header when no auth token is configured', async () => {
    await svc().deliver(delivery as any, { ...org, hrisAuthHeaderEncrypted: null } as any);
    const headers = (fetchMock.mock.calls[0][1] as any).headers;
    expect(headers.Authorization).toBeUndefined();
  });

  it('throws on a non-2xx response so BullMQ retries', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });
    await expect(svc().deliver(delivery as any, org as any)).rejects.toThrow(/status 500/);
    expect(txStub.hrisExportDelivery.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'delivered' }) }),
    );
  });

  it('refuses an internal/non-public target without calling fetch (SSRF guard)', async () => {
    await expect(svc().deliver(delivery as any, { ...org, hrisTargetUrl: 'https://10.0.0.1/in' } as any)).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
