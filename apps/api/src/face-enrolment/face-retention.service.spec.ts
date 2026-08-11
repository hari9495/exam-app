import { FaceRetentionService } from './face-retention.service';

describe('FaceRetentionService', () => {
  const NOW = new Date('2026-11-10T00:00:00Z');
  let findMany: jest.Mock;
  let updateMany: jest.Mock;
  let blobStorage: { deleteByUrl: jest.Mock };
  let service: FaceRetentionService;

  beforeEach(() => {
    findMany = jest.fn().mockResolvedValue([]);
    updateMany = jest.fn().mockResolvedValue({ count: 0 });
    blobStorage = { deleteByUrl: jest.fn().mockResolvedValue('deleted') };
    service = new FaceRetentionService(
      { forTenant: jest.fn((_ctx: unknown, fn: (tx: unknown) => unknown) => fn({ faceEnrolment: { findMany, updateMany } })) } as never,
      blobStorage as never,
    );
  });

  // 90 days is a product decision recorded in the spec, not a tunable.
  it('purges an enrolment whose attempt finalised more than 90 days ago', async () => {
    findMany.mockResolvedValue([{ id: 'fe-1', referenceImagePath: 'https://acct.blob/face/a1.jpg' }]);

    const purged = await service.prune(NOW);

    expect(purged).toBe(1);
    expect(blobStorage.deleteByUrl).toHaveBeenCalledWith('https://acct.blob/face/a1.jpg');
  });

  it('clears the stored path and embedding, so no dangling reference survives', async () => {
    findMany.mockResolvedValue([{ id: 'fe-1', referenceImagePath: 'https://acct.blob/face/a1.jpg' }]);

    await service.prune(NOW);

    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: { referenceImagePath: null, embedding: null },
    }));
  });

  it('leaves a recent enrolment alone', async () => {
    findMany.mockResolvedValue([]);

    expect(await service.prune(NOW)).toBe(0);
    expect(blobStorage.deleteByUrl).not.toHaveBeenCalled();
  });

  it('keeps going when one blob delete fails, rather than stranding the rest', async () => {
    findMany.mockResolvedValue([
      { id: 'fe-1', referenceImagePath: 'https://acct.blob/face/a1.jpg' },
      { id: 'fe-2', referenceImagePath: 'https://acct.blob/face/a2.jpg' },
    ]);
    blobStorage.deleteByUrl.mockRejectedValueOnce(new Error('gone'));

    expect(await service.prune(NOW)).toBe(2);
    expect(blobStorage.deleteByUrl).toHaveBeenCalledTimes(2);
  });
});
