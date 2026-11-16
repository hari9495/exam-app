import { notOnHold } from '../assessments/asmt-rules';
import { ProctoringRetentionService } from './proctoring-retention.service';

describe('ProctoringRetentionService', () => {
  let tenantPrisma: { forTenant: jest.Mock };
  let blobStorage: { deleteByUrl: jest.Mock };
  let findMany: jest.Mock;
  let update: jest.Mock;
  let settings: jest.Mock;
  let service: ProctoringRetentionService;
  // AS-2 (answer 2008): rows carry their company and time; 40 days old is past the default retention of 30.
  const OLD = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
  const ev = (id: string, metadataJson: string, org = 'org-a', occurredAt = OLD) => ({ id, metadataJson, organizationId: org, occurredAt });

  beforeEach(() => {
    findMany = jest.fn();
    update = jest.fn().mockResolvedValue({});
    settings = jest.fn().mockResolvedValue([]);
    tenantPrisma = { forTenant: jest.fn((_c: unknown, fn: (tx: unknown) => unknown) => fn({ proctoringEvent: { findMany, update }, setting: { findMany: settings } })) };
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
    // The shortest retention (30 days); each row is then checked against its company's own days.
    expect(where.occurredAt.lt).toEqual(new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000));
    // Legal hold (answer 2008).
    // AS-5: the shared legal-hold filter (its shape is tested in the as5 and as2 e2e suites against the database).
    expect(where.AND).toEqual([notOnHold(now)]);
    expect(where.OR).toEqual([{ metadataJson: { contains: '"snapshot"' } }, { metadataJson: { contains: '"screenshot"' } }]);
    expect(blobStorage.deleteByUrl).not.toHaveBeenCalled();
  });

  it('deletes both blobs and strips only the image URLs, preserving other metadata', async () => {
    findMany.mockResolvedValue([
      ev('e1', JSON.stringify({ snapshot: 'webcam-snapshots/a.jpg', screenshot: 'screen-captures/a.jpg', reason: 'no_face' })),
      ev('e2', JSON.stringify({ snapshot: 'webcam-snapshots/b.jpg' })),
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
    findMany.mockResolvedValue([ev('e1', JSON.stringify({ snapshot: 'x.jpg' }))]);
    blobStorage.deleteByUrl.mockRejectedValue(new Error('blob gone'));
    await service.prune();
    expect(update).toHaveBeenCalledWith({ where: { id: 'e1' }, data: { metadataJson: null } });
  });

  it('skips rows with unparseable metadata without throwing', async () => {
    findMany.mockResolvedValue([ev('e1', '{not json')]);
    const count = await service.prune();
    expect(count).toBe(0);
    expect(update).not.toHaveBeenCalled();
  });

  it('keeps evidence inside the retention its company chose (90 days) and purges another company at the default', async () => {
    settings.mockResolvedValue([{ organizationId: 'org-a', value: '90' }]);
    findMany.mockResolvedValue([ev('a', JSON.stringify({ snapshot: 'a.jpg' }), 'org-a'), ev('b', JSON.stringify({ snapshot: 'b.jpg' }), 'org-b')]);

    expect(await service.prune()).toBe(1);
    expect(blobStorage.deleteByUrl).toHaveBeenCalledWith('b.jpg');
    expect(blobStorage.deleteByUrl).not.toHaveBeenCalledWith('a.jpg');
  });

  it('negative: a stored value outside 30 to 365 never shortens retention below 30 days', async () => {
    settings.mockResolvedValue([{ organizationId: 'org-a', value: '1' }]);
    findMany.mockResolvedValue([ev('a', JSON.stringify({ snapshot: 'a.jpg' }), 'org-a', new Date(Date.now() - 10 * 24 * 60 * 60 * 1000))]);

    expect(await service.prune()).toBe(0);
  });

  it('never throws when the DB read fails (housekeeping)', async () => {
    tenantPrisma.forTenant.mockRejectedValueOnce(new Error('db down'));
    await expect(service.prune()).resolves.toBe(0);
  });
});
