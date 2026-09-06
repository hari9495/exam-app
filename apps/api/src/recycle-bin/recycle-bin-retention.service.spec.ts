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
