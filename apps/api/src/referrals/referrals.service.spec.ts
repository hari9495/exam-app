jest.mock('../candidates/recompute-global-stage', () => ({ recomputeGlobalStage: jest.fn().mockResolvedValue(undefined) }));

import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ReferralsService } from './referrals.service';

const ctx = { organizationId: 'org-1', isSuperAdmin: false } as any;

function makeService(tx: Record<string, any>) {
  const tenantPrisma = { forTenant: jest.fn((_c: unknown, fn: (t: unknown) => unknown) => fn(tx)) } as any;
  const blobStorage = { upload: jest.fn() } as any;
  const jobsService = { enqueue: jest.fn().mockResolvedValue({}) } as any;
  const audit = { record: jest.fn().mockResolvedValue(undefined) } as any;
  return new ReferralsService(tenantPrisma, blobStorage, jobsService, audit);
}

function baseTx(overrides: Record<string, any> = {}) {
  return {
    job: { findFirst: jest.fn().mockResolvedValue({ id: 'job-1', status: 'open', pipelineId: 'p1' }) },
    candidate: { findUnique: jest.fn().mockResolvedValue(null), upsert: jest.fn().mockResolvedValue({ id: 'cand-1' }) },
    candidateProfile: { upsert: jest.fn() },
    pipeline: { findFirst: jest.fn().mockResolvedValue({ stages: [{ category: 'active', statuses: [{ id: 'st-1' }] }] }) },
    pipelineEntry: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'entry-1' }), update: jest.fn().mockResolvedValue({ id: 'entry-1' }) },
    referral: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'ref-1' }) },
    ...overrides,
  };
}

const dto = { jobId: 'job-1', name: 'Al Referral', email: 'al@example.com' };

describe('ReferralsService.submit', () => {
  it('creates a referral pipeline entry (enteredVia=referral + referrer) and the referral row', async () => {
    const tx = baseTx();
    const res = await makeService(tx).submit(ctx, 'user-1', dto as any);
    expect(tx.pipelineEntry.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ jobId: 'job-1', candidateId: 'cand-1', enteredVia: 'referral', referrerUserId: 'user-1', statusId: 'st-1' }),
    }));
    expect(tx.referral.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ referrerUserId: 'user-1', jobId: 'job-1', candidateId: 'cand-1', entryId: 'entry-1' }),
    }));
    expect(res).toEqual({ id: 'ref-1' });
  });

  it('attributes an existing un-referred entry to the referrer instead of creating one', async () => {
    const tx = baseTx({ pipelineEntry: { findUnique: jest.fn().mockResolvedValue({ id: 'entry-9', referrerUserId: null }), create: jest.fn(), update: jest.fn().mockResolvedValue({ id: 'entry-9' }) } });
    await makeService(tx).submit(ctx, 'user-1', dto as any);
    expect(tx.pipelineEntry.create).not.toHaveBeenCalled();
    expect(tx.pipelineEntry.update).toHaveBeenCalledWith({ where: { id: 'entry-9' }, data: { referrerUserId: 'user-1' } });
    expect(tx.referral.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ entryId: 'entry-9' }) }));
  });

  it('rejects a duplicate referral for the same person + job', async () => {
    const tx = baseTx({ referral: { findUnique: jest.fn().mockResolvedValue({ id: 'existing' }), create: jest.fn() } });
    await expect(makeService(tx).submit(ctx, 'user-1', dto as any)).rejects.toBeInstanceOf(ConflictException);
    expect(tx.referral.create).not.toHaveBeenCalled();
  });

  it('rejects a job that is not open', async () => {
    const tx = baseTx({ job: { findFirst: jest.fn().mockResolvedValue({ id: 'job-1', status: 'closed', pipelineId: 'p1' }) } });
    await expect(makeService(tx).submit(ctx, 'user-1', dto as any)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an unknown job', async () => {
    const tx = baseTx({ job: { findFirst: jest.fn().mockResolvedValue(null) } });
    await expect(makeService(tx).submit(ctx, 'user-1', dto as any)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('ReferralsService.setReward', () => {
  it('updates the reward status', async () => {
    const tx = { referral: { findFirst: jest.fn().mockResolvedValue({ id: 'ref-1' }), update: jest.fn().mockResolvedValue({}) } };
    const res = await makeService(tx).setReward(ctx, 'user-1', 'ref-1', { rewardStatus: 'approved' } as any);
    expect(tx.referral.update).toHaveBeenCalledWith({ where: { id: 'ref-1' }, data: { rewardStatus: 'approved', rewardNote: null } });
    expect(res).toEqual({ id: 'ref-1', rewardStatus: 'approved' });
  });

  it('404s on a missing referral', async () => {
    const tx = { referral: { findFirst: jest.fn().mockResolvedValue(null), update: jest.fn() } };
    await expect(makeService(tx).setReward(ctx, 'user-1', 'nope', { rewardStatus: 'paid' } as any)).rejects.toBeInstanceOf(NotFoundException);
  });
});
