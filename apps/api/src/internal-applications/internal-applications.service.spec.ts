jest.mock('../candidates/recompute-global-stage', () => ({ recomputeGlobalStage: jest.fn().mockResolvedValue(undefined) }));

import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { InternalApplicationsService } from './internal-applications.service';

const ctx = { organizationId: 'org-1', isSuperAdmin: false } as any;

function makeService(tx: Record<string, any>) {
  const tenantPrisma = { forTenant: jest.fn((_c: unknown, fn: (t: unknown) => unknown) => fn(tx)) } as any;
  const audit = { record: jest.fn().mockResolvedValue(undefined) } as any;
  return new InternalApplicationsService(tenantPrisma, audit);
}

function baseTx(overrides: Record<string, any> = {}) {
  return {
    user: { findUnique: jest.fn().mockResolvedValue({ email: 'sam@acme.com', name: 'Sam Staff' }) },
    job: { findFirst: jest.fn().mockResolvedValue({ id: 'job-1', status: 'open', pipelineId: 'p1' }) },
    candidate: { upsert: jest.fn().mockResolvedValue({ id: 'cand-1' }) },
    pipeline: { findFirst: jest.fn().mockResolvedValue({ stages: [{ category: 'active', statuses: [{ id: 'st-1' }] }] }) },
    pipelineEntry: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'entry-1' }) },
    ...overrides,
  };
}

describe('InternalApplicationsService.apply', () => {
  it('lands a self-application as a pipeline entry (enteredVia=internal, applicant attributed)', async () => {
    const tx = baseTx();
    const res = await makeService(tx).apply(ctx, 'user-1', { jobId: 'job-1' });
    // Candidate is upserted on the SESSION user's email, not any client-supplied value.
    expect(tx.candidate.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { organizationId_email: { organizationId: 'org-1', email: 'sam@acme.com' } },
    }));
    expect(tx.pipelineEntry.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ jobId: 'job-1', candidateId: 'cand-1', enteredVia: 'internal', referrerUserId: 'user-1', statusId: 'st-1' }),
    }));
    expect(res).toEqual({ id: 'entry-1' });
  });

  it('blocks a re-apply when the person is already in the job pipeline', async () => {
    const tx = baseTx({ pipelineEntry: { findUnique: jest.fn().mockResolvedValue({ id: 'entry-9' }), create: jest.fn() } });
    await expect(makeService(tx).apply(ctx, 'user-1', { jobId: 'job-1' })).rejects.toBeInstanceOf(ConflictException);
    expect(tx.pipelineEntry.create).not.toHaveBeenCalled();
  });

  it('rejects a job that is not open', async () => {
    const tx = baseTx({ job: { findFirst: jest.fn().mockResolvedValue({ id: 'job-1', status: 'closed', pipelineId: 'p1' }) } });
    await expect(makeService(tx).apply(ctx, 'user-1', { jobId: 'job-1' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an unknown job', async () => {
    const tx = baseTx({ job: { findFirst: jest.fn().mockResolvedValue(null) } });
    await expect(makeService(tx).apply(ctx, 'user-1', { jobId: 'job-1' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects when the staff user has no email on file', async () => {
    const tx = baseTx({ user: { findUnique: jest.fn().mockResolvedValue({ email: null, name: 'X' }) } });
    await expect(makeService(tx).apply(ctx, 'user-1', { jobId: 'job-1' })).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('InternalApplicationsService.myApplications', () => {
  it('returns the staff member’s own internal applications with role + status', async () => {
    const tx = {
      pipelineEntry: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'e1', jobId: 'job-1', createdAt: new Date('2026-09-15T00:00:00Z'), rejected: false, archivedAt: null, status: { name: 'Screen', stage: { name: 'Screening' } } },
        ]),
      },
      job: { findMany: jest.fn().mockResolvedValue([{ id: 'job-1', title: 'Senior Engineer' }]) },
    };
    const rows = await makeService(tx as any).myApplications(ctx, 'user-1');
    expect(tx.pipelineEntry.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { referrerUserId: 'user-1', enteredVia: 'internal' },
    }));
    expect(rows).toEqual([{ entryId: 'e1', jobTitle: 'Senior Engineer', status: 'Screening', appliedAt: new Date('2026-09-15T00:00:00Z') }]);
  });
});
