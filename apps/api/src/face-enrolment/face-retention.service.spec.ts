import { notOnHold } from '../assessments/asmt-rules';
import { FaceRetentionService } from './face-retention.service';

describe('FaceRetentionService', () => {
  const NOW = new Date('2026-11-10T00:00:00Z');
  const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);
  // A row as the query returns it: its company and when its attempt finalised.
  const row = (id: string, referenceImagePath: string | null, submittedDaysAgo = 40, org = 'org-a') => ({
    id,
    referenceImagePath,
    organizationId: org,
    attempt: { submittedAt: daysAgo(submittedDaysAgo), startedAt: daysAgo(submittedDaysAgo + 1) },
  });
  let findMany: jest.Mock;
  let updateMany: jest.Mock;
  let settings: jest.Mock;
  let blobStorage: { deleteByUrl: jest.Mock };
  let service: FaceRetentionService;

  beforeEach(() => {
    findMany = jest.fn().mockResolvedValue([]);
    updateMany = jest.fn().mockResolvedValue({ count: 0 });
    settings = jest.fn().mockResolvedValue([]);
    blobStorage = { deleteByUrl: jest.fn().mockResolvedValue('deleted') };
    service = new FaceRetentionService(
      { forTenant: jest.fn((_ctx: unknown, fn: (tx: unknown) => unknown) => fn({ faceEnrolment: { findMany, updateMany }, setting: { findMany: settings } })) } as never,
      blobStorage as never,
    );
  });

  // AS-2 (answer 2008): the company's retention (asmt.retention), 30 days unless it chose more.
  it('purges an enrolment whose attempt finalised more than 30 days ago (the default)', async () => {
    findMany.mockResolvedValue([row('fe-1', 'https://acct.blob/face/a1.jpg', 31)]);

    const purged = await service.prune(NOW);

    expect(purged).toBe(1);
    expect(blobStorage.deleteByUrl).toHaveBeenCalledWith('https://acct.blob/face/a1.jpg');
  });

  it('keeps it while inside the retention the company chose (180 days), and purges past it', async () => {
    settings.mockResolvedValue([{ organizationId: 'org-a', value: '180' }]);
    findMany.mockResolvedValue([row('fe-1', 'https://acct.blob/face/a1.jpg', 120), row('fe-2', 'https://acct.blob/face/a2.jpg', 181)]);

    expect(await service.prune(NOW)).toBe(1);
    expect(blobStorage.deleteByUrl).toHaveBeenCalledWith('https://acct.blob/face/a2.jpg');
    expect(blobStorage.deleteByUrl).not.toHaveBeenCalledWith('https://acct.blob/face/a1.jpg');
  });

  it('negative: one company\'s longer retention never keeps another company\'s data longer', async () => {
    settings.mockResolvedValue([{ organizationId: 'org-a', value: '365' }]);
    findMany.mockResolvedValue([row('fe-b', 'https://acct.blob/face/b.jpg', 31, 'org-b')]);

    expect(await service.prune(NOW)).toBe(1);
  });

  it('negative: the face data of a held result is never selected (legal hold: an open integrity incident or appeal, or a verdict still open to appeal)', async () => {
    await service.prune(NOW);

    // AS-5: the shared legal-hold filter (its shape is tested in the as5 and as2 e2e suites against the database).
    expect(findMany.mock.calls[0][0].where.AND).toEqual([notOnHold(NOW)]);
  });

  it('clears the stored path and embedding, so no dangling reference survives', async () => {
    findMany.mockResolvedValue([row('fe-1', 'https://acct.blob/face/a1.jpg')]);

    await service.prune(NOW);

    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: { referenceImagePath: null, embedding: null },
    }));
  });

  // A blocked or abandoned attempt never gets a submittedAt, so a query keyed only on that
  // column kept those reference images forever -- for exactly the candidates most likely to
  // have been flagged. Asserted on the query rather than on rows because the row set here is a
  // mock: the where clause IS the behaviour under test.
  it('also purges an attempt that never finalised, once it is old enough', async () => {
    await service.prune(NOW);

    const cutoff = daysAgo(30);
    const { OR } = findMany.mock.calls[0][0].where.attempt;
    expect(OR).toContainEqual({ submittedAt: null, startedAt: { lt: cutoff } });
    // ...without losing the finalised case it already handled.
    expect(OR).toContainEqual({ submittedAt: { lt: cutoff } });
  });

  it('ages a never-finalised attempt from when it started', async () => {
    findMany.mockResolvedValue([{ id: 'fe-1', referenceImagePath: null, organizationId: 'org-a', attempt: { submittedAt: null, startedAt: daysAgo(35) } }]);

    expect(await service.prune(NOW)).toBe(1);
  });

  it('leaves a recent enrolment alone', async () => {
    findMany.mockResolvedValue([]);

    expect(await service.prune(NOW)).toBe(0);
    expect(blobStorage.deleteByUrl).not.toHaveBeenCalled();
  });

  // Finding 1: a declined-consent update nulls referenceImagePath but keeps a previously-stored
  // embedding (see attempt.service.ts's recordFaceEnrolment). A row in that shape must still be
  // a prune candidate, or the encrypted biometric template is retained forever, past the
  // purpose limitation the whole service exists to enforce. findMany is a mock -- it returns
  // whatever a test hands it regardless of the where clause -- so, same as the never-finalised
  // test above, the where clause IS the behaviour under test here, not the returned rows.
  it('includes a row with a null referenceImagePath but a live embedding in the prune query (declined-consent shape)', async () => {
    await service.prune(NOW);

    const { OR } = findMany.mock.calls[0][0].where;
    expect(OR).toContainEqual({ referenceImagePath: { not: null } });
    expect(OR).toContainEqual({ embedding: { not: null } });
  });

  it('clears both columns for a row selected purely on its embedding, with no image to delete', async () => {
    findMany.mockResolvedValue([row('fe-1', null)]);

    const purged = await service.prune(NOW);

    expect(purged).toBe(1);
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: { in: ['fe-1'] } },
      data: { referenceImagePath: null, embedding: null },
    }));
  });

  it('does not throw, and does not call deleteByUrl, when the prune candidate has no image', async () => {
    findMany.mockResolvedValue([row('fe-1', null)]);

    await expect(service.prune(NOW)).resolves.toBe(1);
    expect(blobStorage.deleteByUrl).not.toHaveBeenCalled();
  });

  it('keeps going when one blob delete fails, rather than stranding the rest', async () => {
    findMany.mockResolvedValue([row('fe-1', 'https://acct.blob/face/a1.jpg'), row('fe-2', 'https://acct.blob/face/a2.jpg')]);
    blobStorage.deleteByUrl.mockRejectedValueOnce(new Error('gone'));

    expect(await service.prune(NOW)).toBe(2);
    expect(blobStorage.deleteByUrl).toHaveBeenCalledTimes(2);
  });
});
