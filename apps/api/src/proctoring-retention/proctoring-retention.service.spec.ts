import { ProctoringRetentionService } from './proctoring-retention.service';

describe('ProctoringRetentionService', () => {
  let tenantPrisma: { forTenant: jest.Mock };
  let blobStorage: { deleteByUrl: jest.Mock };
  let findMany: jest.Mock;
  let update: jest.Mock;
  let service: ProctoringRetentionService;

  beforeEach(() => {
    findMany = jest.fn();
    update = jest.fn().mockResolvedValue({});
    tenantPrisma = { forTenant: jest.fn((_c: unknown, fn: (tx: unknown) => unknown) => fn({ proctoringEvent: { findMany, update } })) };
    blobStorage = { deleteByUrl: jest.fn().mockResolvedValue('deleted') };
    service = new ProctoringRetentionService(tenantPrisma as never, blobStorage as never);
  });

  it('queries only image-bearing events older than the cutoff, as super-admin', async () => {
    findMany.mockResolvedValue([]);
    const now = new Date('2026-09-13T00:00:00.000Z');
    const count = await service.prune(now);

    expect(count).toBe(0);
    expect(tenantPrisma.forTenant).toHaveBeenCalledWith({ organizationId: null, isSuperAdmin: true }, expect.any(Function));
    const where = findMany.mock.calls[0][0].where;
    expect(where.occurredAt.lt).toEqual(new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000));
    expect(where.OR).toEqual([{ metadataJson: { contains: '"snapshot"' } }, { metadataJson: { contains: '"screenshot"' } }]);
    expect(blobStorage.deleteByUrl).not.toHaveBeenCalled();
  });

  it('deletes both blobs and strips only the image URLs, preserving other metadata', async () => {
    findMany.mockResolvedValue([
      { id: 'e1', metadataJson: JSON.stringify({ snapshot: 'webcam-snapshots/a.jpg', screenshot: 'screen-captures/a.jpg', reason: 'no_face' }) },
      { id: 'e2', metadataJson: JSON.stringify({ snapshot: 'webcam-snapshots/b.jpg' }) },
    ]);
    const count = await service.prune();

    expect(count).toBe(2);
    expect(blobStorage.deleteByUrl).toHaveBeenCalledWith('webcam-snapshots/a.jpg');
    expect(blobStorage.deleteByUrl).toHaveBeenCalledWith('screen-captures/a.jpg');
    expect(blobStorage.deleteByUrl).toHaveBeenCalledWith('webcam-snapshots/b.jpg');
    // e1 keeps its non-image metadata; e2 had only an image so it nulls out
    expect(update).toHaveBeenCalledWith({ where: { id: 'e1' }, data: { metadataJson: JSON.stringify({ reason: 'no_face' }) } });
    expect(update).toHaveBeenCalledWith({ where: { id: 'e2' }, data: { metadataJson: null } });
  });

  it('still clears the DB reference when a blob delete fails', async () => {
    findMany.mockResolvedValue([{ id: 'e1', metadataJson: JSON.stringify({ snapshot: 'x.jpg' }) }]);
    blobStorage.deleteByUrl.mockRejectedValue(new Error('blob gone'));
    await service.prune();
    expect(update).toHaveBeenCalledWith({ where: { id: 'e1' }, data: { metadataJson: null } });
  });

  it('skips rows with unparseable metadata without throwing', async () => {
    findMany.mockResolvedValue([{ id: 'e1', metadataJson: '{not json' }]);
    const count = await service.prune();
    expect(count).toBe(0);
    expect(update).not.toHaveBeenCalled();
  });

  it('never throws when the DB read fails (housekeeping)', async () => {
    tenantPrisma.forTenant.mockRejectedValueOnce(new Error('db down'));
    await expect(service.prune()).resolves.toBe(0);
  });
});
