import { Prisma } from '@prisma/client';
import { RecycleBinRetentionService, RETENTION_DAYS } from './recycle-bin-retention.service';
import { TenantPrismaService } from '@exam-platform/shared';

function knownRequestError(code: string) {
  return new Prisma.PrismaClientKnownRequestError('mock prisma error', { code, clientVersion: 'test' });
}

// A delegate with configurable due rows + a delete that resolves unless the row id is in
// `blockedIds` (simulating a P2003 FK-constraint violation on that one row).
function makeDelegate(dueIds: string[], blockedIds: string[] = []) {
  return {
    findMany: jest.fn().mockResolvedValue(dueIds.map((id) => ({ id }))),
    delete: jest.fn().mockImplementation(({ where: { id } }: { where: { id: string } }) =>
      blockedIds.includes(id) ? Promise.reject(knownRequestError('P2003')) : Promise.resolve({ id }),
    ),
  };
}

describe('RecycleBinRetentionService', () => {
  let tenantPrisma: { forTenantIncludingDeleted: jest.Mock };
  let service: RecycleBinRetentionService;

  beforeEach(() => {
    tenantPrisma = { forTenantIncludingDeleted: jest.fn() };
    service = new RecycleBinRetentionService(tenantPrisma as unknown as TenantPrismaService);
  });

  it('purges all due rows across all four models under a cross-tenant super-admin context', async () => {
    const tx = {
      candidate: makeDelegate(['c1', 'c2']),
      job: makeDelegate(['j1']),
      pipeline: makeDelegate([]),
      walkInGroup: makeDelegate(['w1']),
      customFieldValue: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    };
    tenantPrisma.forTenantIncludingDeleted.mockImplementation((_ctx, fn) => fn(tx));

    const now = new Date('2026-09-07T00:00:00.000Z');
    const count = await service.prune(now);

    expect(count).toBe(4);
    expect(tenantPrisma.forTenantIncludingDeleted).toHaveBeenCalledWith({ organizationId: null, isSuperAdmin: true }, expect.any(Function));

    const cutoff = tx.candidate.findMany.mock.calls[0][0].where.deletedAt.lt as Date;
    expect(cutoff.toISOString()).toBe(new Date(now.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString());
    expect(tx.candidate.delete).toHaveBeenCalledWith({ where: { id: 'c1' } });
    expect(tx.candidate.delete).toHaveBeenCalledWith({ where: { id: 'c2' } });
    expect(tx.job.delete).toHaveBeenCalledWith({ where: { id: 'j1' } });
    expect(tx.walkInGroup.delete).toHaveBeenCalledWith({ where: { id: 'w1' } });
    // Job hard-delete only -- the EAV customFieldValue cleanup runs for the purged job and
    // nothing else (candidate/pipeline/walk-in-group have no such cleanup).
    expect(tx.customFieldValue.deleteMany).toHaveBeenCalledTimes(1);
    expect(tx.customFieldValue.deleteMany).toHaveBeenCalledWith({ where: { entityType: 'job', entityId: 'j1' } });
  });

  // Finding 2 (whole-branch review): CustomFieldValue is an EAV table keyed by (entityType,
  // entityId) with no FK to Job, so nothing else cleans these up on a final hard-delete.
  describe('job customFieldValue cleanup', () => {
    it('deletes each purged job\'s customFieldValue rows', async () => {
      const tx = {
        candidate: makeDelegate([]),
        job: makeDelegate(['j1', 'j2']),
        pipeline: makeDelegate([]),
        walkInGroup: makeDelegate([]),
        customFieldValue: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
      };
      tenantPrisma.forTenantIncludingDeleted.mockImplementation((_ctx, fn) => fn(tx));

      const count = await service.prune();

      expect(count).toBe(2);
      expect(tx.customFieldValue.deleteMany).toHaveBeenCalledWith({ where: { entityType: 'job', entityId: 'j1' } });
      expect(tx.customFieldValue.deleteMany).toHaveBeenCalledWith({ where: { entityType: 'job', entityId: 'j2' } });
    });

    it('still purges a job with no customFieldValue rows (deleteMany count 0 is not an error)', async () => {
      const tx = {
        candidate: makeDelegate([]),
        job: makeDelegate(['j1']),
        pipeline: makeDelegate([]),
        walkInGroup: makeDelegate([]),
        customFieldValue: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
      };
      tenantPrisma.forTenantIncludingDeleted.mockImplementation((_ctx, fn) => fn(tx));

      const count = await service.prune();

      expect(count).toBe(1);
    });

    // Best-effort: the job row is already gone once delegate.delete resolves, so a failure in
    // this secondary cleanup must not turn an actually-purged job into a "skipped" row.
    it('still counts the job as purged when its customFieldValue cleanup itself fails', async () => {
      const tx = {
        candidate: makeDelegate([]),
        job: makeDelegate(['j1']),
        pipeline: makeDelegate([]),
        walkInGroup: makeDelegate([]),
        customFieldValue: { deleteMany: jest.fn().mockRejectedValue(new Error('db blip')) },
      };
      tenantPrisma.forTenantIncludingDeleted.mockImplementation((_ctx, fn) => fn(tx));

      const count = await service.prune();

      expect(count).toBe(1);
      expect(tx.job.delete).toHaveBeenCalledWith({ where: { id: 'j1' } });
    });

    it('does not touch customFieldValue when purging candidates/pipelines/walk-in-groups', async () => {
      const tx = {
        candidate: makeDelegate(['c1']),
        job: makeDelegate([]),
        pipeline: makeDelegate(['p1']),
        walkInGroup: makeDelegate(['w1']),
        customFieldValue: { deleteMany: jest.fn() },
      };
      tenantPrisma.forTenantIncludingDeleted.mockImplementation((_ctx, fn) => fn(tx));

      await service.prune();

      expect(tx.customFieldValue.deleteMany).not.toHaveBeenCalled();
    });
  });

  // Carry-forward from T5 review: a single deleteMany per model would fail the WHOLE batch if any
  // one row is FK-blocked (Job.pipelineId->Pipeline, CandidateEmail.candidateId->Candidate are
  // onDelete: NoAction). Per-row delete + try/catch must skip only the blocked row and continue
  // purging every other due row, in the same model and in the other three.
  it('skips a row that is FK-blocked (P2003) without aborting the rest of the purge', async () => {
    const tx = {
      candidate: makeDelegate([]),
      job: makeDelegate([]),
      pipeline: makeDelegate(['p-blocked', 'p-ok'], ['p-blocked']),
      walkInGroup: makeDelegate(['w1']),
    };
    tenantPrisma.forTenantIncludingDeleted.mockImplementation((_ctx, fn) => fn(tx));

    const count = await service.prune();

    // p-blocked rejected -> not counted; p-ok and w1 still purged despite the earlier rejection.
    expect(count).toBe(2);
    expect(tx.pipeline.delete).toHaveBeenCalledWith({ where: { id: 'p-blocked' } });
    expect(tx.pipeline.delete).toHaveBeenCalledWith({ where: { id: 'p-ok' } });
    expect(tx.walkInGroup.delete).toHaveBeenCalledWith({ where: { id: 'w1' } });
  });

  it('returns 0 and never throws when the transaction itself fails', async () => {
    tenantPrisma.forTenantIncludingDeleted.mockRejectedValue(new Error('db down'));
    await expect(service.prune()).resolves.toBe(0);
  });

  it('starts and stops its daily timer with the module lifecycle', () => {
    jest.useFakeTimers();
    const pruneSpy = jest.spyOn(service, 'prune').mockResolvedValue(0);

    service.onModuleInit();
    expect(pruneSpy).toHaveBeenCalledTimes(1); // boot-time prune
    jest.advanceTimersByTime(24 * 60 * 60 * 1000);
    expect(pruneSpy).toHaveBeenCalledTimes(2);

    service.onModuleDestroy();
    jest.advanceTimersByTime(24 * 60 * 60 * 1000);
    expect(pruneSpy).toHaveBeenCalledTimes(2);
    jest.useRealTimers();
  });
});
