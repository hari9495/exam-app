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
    // HIR-12 company settings: none set, so the defaults (₹25,000, 90 days) apply.
    setting: { findMany: jest.fn().mockResolvedValue([]) },
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
      data: expect.objectContaining({ referrerUserId: 'user-1', jobId: 'job-1', candidateId: 'cand-1', entryId: 'entry-1', bonusInr: 25000 }),
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
  // One referral, its application in a stage of the given category, and (when hired) an accepted offer starting `start`.
  const rewardTx = (category: string, start: Date | null, rewardStatus = 'pending') => ({
    referral: { findFirst: jest.fn().mockResolvedValue({ id: 'ref-1', organizationId: 'org-1', candidateId: 'c1', jobId: 'job-1', entryId: 'e1', referrerUserId: 'u1', note: null, rewardStatus, rewardNote: null, bonusInr: 20000, createdAt: new Date('2026-01-01') }), update: jest.fn().mockResolvedValue({}) },
    candidate: { findMany: jest.fn().mockResolvedValue([{ id: 'c1', name: 'Kiran Rao', email: 'k@x.in' }]) },
    job: { findMany: jest.fn().mockResolvedValue([{ id: 'job-1', title: 'Accountant' }]) },
    pipelineEntry: { findMany: jest.fn().mockResolvedValue([{ id: 'e1', rejected: false, archivedAt: null, job: { pipelineId: 'p1' }, status: { name: 'Joined', stage: { name: 'Hired', category, position: 5 } } }]) },
    pipelineStage: { findMany: jest.fn().mockResolvedValue([{ pipelineId: 'p1', position: 1 }]) },
    offer: { findMany: jest.fn().mockResolvedValue(start ? [{ id: 'o1', pipelineEntryId: 'e1', startDate: start }] : []) },
    preboarding: { findMany: jest.fn().mockResolvedValue([]) },
    exitCase: { findMany: jest.fn().mockResolvedValue([]) },
    setting: { findMany: jest.fn().mockResolvedValue([]) },
    recruitingCost: { create: jest.fn().mockResolvedValue({}), deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
  });

  it('updates the reward status', async () => {
    const tx = rewardTx('active', null);
    const res = await makeService(tx).setReward(ctx, 'user-1', 'ref-1', { rewardStatus: 'approved' } as any);
    expect(tx.referral.update).toHaveBeenCalledWith({ where: { id: 'ref-1' }, data: { rewardStatus: 'approved', rewardNote: null } });
    expect(tx.recruitingCost.create).not.toHaveBeenCalled();
    expect(res).toEqual({ id: 'ref-1', rewardStatus: 'approved' });
  });

  it('paid, once due (hired 90+ days ago), posts one read-only referral-bonus cost in rupees', async () => {
    const tx = rewardTx('hired', new Date('2026-01-05T00:00:00Z'));
    await makeService(tx).setReward(ctx, 'user-1', 'ref-1', { rewardStatus: 'paid' } as any);
    expect(tx.recruitingCost.create).toHaveBeenCalledWith({ data: expect.objectContaining({ origin: 'payroll', sourceRef: 'referral:ref-1', costType: 'referral_bonus', amount: 20000, currency: 'INR', source: 'Referral: Kiran Rao' }) });
  });

  it('refuses paid before the bonus is due, and when not hired (409)', async () => {
    const soon = rewardTx('hired', new Date(Date.now() - 10 * 86_400_000));
    await expect(makeService(soon).setReward(ctx, 'user-1', 'ref-1', { rewardStatus: 'paid' } as any)).rejects.toBeInstanceOf(ConflictException);
    const notHired = rewardTx('active', null);
    await expect(makeService(notHired).setReward(ctx, 'user-1', 'ref-1', { rewardStatus: 'paid' } as any)).rejects.toBeInstanceOf(ConflictException);
    expect(soon.recruitingCost.create).not.toHaveBeenCalled();
    expect(soon.referral.update).not.toHaveBeenCalled();
  });

  it('moving away from paid takes the posted cost back', async () => {
    const tx = rewardTx('hired', new Date('2026-01-05T00:00:00Z'), 'paid');
    await makeService(tx).setReward(ctx, 'user-1', 'ref-1', { rewardStatus: 'approved' } as any);
    expect(tx.recruitingCost.deleteMany).toHaveBeenCalledWith({ where: { organizationId: 'org-1', origin: 'payroll', sourceRef: 'referral:ref-1' } });
  });

  it('404s on a missing referral', async () => {
    const tx = { referral: { findFirst: jest.fn().mockResolvedValue(null), update: jest.fn() } };
    await expect(makeService(tx).setReward(ctx, 'user-1', 'nope', { rewardStatus: 'paid' } as any)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('ReferralsService.submit: own application (founder answer 201)', () => {
  const recent = (via: string, daysAgo: number) => ({ id: 'entry-9', referrerUserId: null, enteredVia: via, createdAt: new Date(Date.now() - daysAgo * 86_400_000) });
  it('refuses credit for an own application within 90 days (default)', async () => {
    const tx = baseTx({ pipelineEntry: { findUnique: jest.fn().mockResolvedValue(recent('application', 89)), create: jest.fn(), update: jest.fn() } });
    await expect(makeService(tx).submit(ctx, 'user-1', dto as any)).rejects.toThrow("applied for this job on their own in the last 90 days");
    expect(tx.referral.create).not.toHaveBeenCalled();
  });
  it('credits an own application older than the days, or one the company added', async () => {
    for (const e of [recent('application', 91), recent('manual', 1)]) {
      const tx = baseTx({ pipelineEntry: { findUnique: jest.fn().mockResolvedValue(e), create: jest.fn(), update: jest.fn().mockResolvedValue({ id: 'entry-9' }) } });
      await makeService(tx).submit(ctx, 'user-1', dto as any);
      expect(tx.referral.create).toHaveBeenCalled();
    }
  });
});
