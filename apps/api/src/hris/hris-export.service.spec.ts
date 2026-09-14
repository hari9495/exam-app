import { HrisExportService } from './hris-export.service';

describe('HrisExportService.exportOnHire', () => {
  let tenantPrisma: any;
  let queue: any;
  let service: HrisExportService;

  beforeEach(() => {
    tenantPrisma = { forTenant: jest.fn() };
    queue = { add: jest.fn().mockResolvedValue(undefined) };
    service = new HrisExportService(tenantPrisma, queue);
  });

  function mockOrgConfig(config: { hrisExportEnabled: boolean; hrisTargetUrl: string | null }) {
    tenantPrisma.forTenant.mockImplementationOnce((_c: unknown, fn: any) =>
      fn({ organization: { findUnique: jest.fn().mockResolvedValue(config) } }),
    );
  }

  it('is inert (no delivery, no enqueue) when HRIS export is disabled', async () => {
    mockOrgConfig({ hrisExportEnabled: false, hrisTargetUrl: 'https://h.example/in' });
    await service.exportOnHire('org-1', 'cand-1', 'job-1');
    expect(queue.add).not.toHaveBeenCalled();
    expect(tenantPrisma.forTenant).toHaveBeenCalledTimes(1); // only the config read
  });

  it('is inert when no target URL is set', async () => {
    mockOrgConfig({ hrisExportEnabled: true, hrisTargetUrl: null });
    await service.exportOnHire('org-1', 'cand-1', 'job-1');
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('snapshots a structured employee payload, records a delivery, and enqueues when enabled + configured', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'del-1' });
    mockOrgConfig({ hrisExportEnabled: true, hrisTargetUrl: 'https://h.example/in' });
    // second forTenant: the Promise.all of candidate/job/offer reads
    tenantPrisma.forTenant.mockImplementationOnce((_c: unknown, fn: any) =>
      fn({
        candidate: { findUnique: jest.fn().mockResolvedValue({ id: 'cand-1', name: 'Ada Lovelace', email: 'ada@x.io', phone: null }) },
        job: { findUnique: jest.fn().mockResolvedValue({ id: 'job-1', title: 'Engineer', department: 'R&D' }) },
        offer: { findFirst: jest.fn().mockResolvedValue({ compensation: '$100k', startDate: new Date('2026-10-01T00:00:00.000Z') }) },
      }),
    );
    // third forTenant: the delivery-row create
    tenantPrisma.forTenant.mockImplementationOnce((_c: unknown, fn: any) => fn({ hrisExportDelivery: { create } }));

    await service.exportOnHire('org-1', 'cand-1', 'job-1');

    expect(create).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(create.mock.calls[0][0].data.payloadJson);
    expect(payload).toMatchObject({
      event: 'candidate.hired',
      organizationId: 'org-1',
      candidate: { id: 'cand-1', name: 'Ada Lovelace', email: 'ada@x.io', phone: null },
      job: { id: 'job-1', title: 'Engineer', department: 'R&D' },
      offer: { compensation: '$100k', startDate: '2026-10-01T00:00:00.000Z' },
    });
    expect(queue.add).toHaveBeenCalledWith('export', { deliveryId: 'del-1' }, expect.objectContaining({ attempts: 3 }));
  });

  it('sends a null offer when the candidate has no accepted offer', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'del-2' });
    mockOrgConfig({ hrisExportEnabled: true, hrisTargetUrl: 'https://h.example/in' });
    tenantPrisma.forTenant.mockImplementationOnce((_c: unknown, fn: any) =>
      fn({
        candidate: { findUnique: jest.fn().mockResolvedValue({ id: 'cand-1', name: 'Ada', email: 'ada@x.io', phone: '+1' }) },
        job: { findUnique: jest.fn().mockResolvedValue({ id: 'job-1', title: 'Engineer', department: null }) },
        offer: { findFirst: jest.fn().mockResolvedValue(null) },
      }),
    );
    tenantPrisma.forTenant.mockImplementationOnce((_c: unknown, fn: any) => fn({ hrisExportDelivery: { create } }));

    await service.exportOnHire('org-1', 'cand-1', 'job-1');

    const payload = JSON.parse(create.mock.calls[0][0].data.payloadJson);
    expect(payload.offer).toBeNull();
    expect(payload.job.department).toBeNull();
  });
});
