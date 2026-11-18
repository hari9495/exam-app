import { PipelineAnalyticsService } from './pipeline-analytics.service';
import { TenantContext } from '@exam-platform/shared';

const context = { organizationId: 'org-1', isSuperAdmin: false } as TenantContext;

function serviceWith(tx: { pipelineEntry: { findMany: jest.Mock }; job: { findMany: jest.Mock }; offer?: { groupBy: jest.Mock } }) {
  tx.offer ??= { groupBy: jest.fn().mockResolvedValue([]) };
  const tenantPrisma = { forTenant: jest.fn((_c: unknown, fn: (tx: unknown) => unknown) => fn(tx)) };
  return { service: new PipelineAnalyticsService(tenantPrisma as never), tenantPrisma };
}

describe('PipelineAnalyticsService.getHiring', () => {
  it('fetches the org-scoped createdAt-window cohort and returns computed analytics', async () => {
    const findMany = jest.fn().mockResolvedValue([
      { status: { stage: { category: 'hired' } }, rejected: false, enteredVia: 'manual', createdAt: new Date('2026-08-01'), updatedAt: new Date('2026-08-04'), jobId: 'job-1' },
    ]);
    const jobFindMany = jest.fn().mockResolvedValue([{ id: 'job-1', title: 'Backend', status: 'open' }]);
    const { service } = serviceWith({ pipelineEntry: { findMany }, job: { findMany: jobFindMany } });
    const from = new Date('2026-08-01');
    const to = new Date('2026-08-31');
    const out = await service.getHiring(context, { from, to });

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { organizationId: 'org-1', archivedAt: null, createdAt: { gte: from, lte: to } },
      select: {
        rejected: true,
        enteredVia: true,
        createdAt: true,
        updatedAt: true,
        jobId: true,
        status: { select: { stage: { select: { category: true } } } },
      },
    }));
    expect(jobFindMany).toHaveBeenCalledWith({
      where: { organizationId: 'org-1' },
      select: { id: true, title: true, status: true },
    });
    expect(out.timeToHire.hiredCount).toBe(1);
    expect(out.jobs[0].title).toBe('Backend');
  });

  it('applies jobId to the filtered cohort while the jobs table stays org-wide for the window', async () => {
    const findMany = jest.fn().mockResolvedValue([
      { status: { stage: { category: 'hired' } }, rejected: false, enteredVia: 'manual', createdAt: new Date('2026-08-01'), updatedAt: new Date('2026-08-04'), jobId: 'job-1' },
      { status: { stage: { category: 'active' } }, rejected: false, enteredVia: 'referral', createdAt: new Date('2026-08-02'), updatedAt: new Date('2026-08-02'), jobId: 'job-2' },
    ]);
    const jobFindMany = jest.fn().mockResolvedValue([
      { id: 'job-1', title: 'Backend', status: 'open' },
      { id: 'job-2', title: 'Frontend', status: 'open' },
    ]);
    const { service } = serviceWith({ pipelineEntry: { findMany }, job: { findMany: jobFindMany } });
    const from = new Date('2026-08-01');
    const to = new Date('2026-08-31');
    const out = await service.getHiring(context, { from, to, jobId: 'job-1' });

    // Two cohort fetches: filtered-by-job for funnel/timeToHire/sources, org-wide window for jobs table.
    expect(findMany).toHaveBeenCalledTimes(2);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { organizationId: 'org-1', archivedAt: null, createdAt: { gte: from, lte: to }, jobId: 'job-1' },
    }));
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { organizationId: 'org-1', archivedAt: null, createdAt: { gte: from, lte: to } },
    }));

    // funnel reflects only job-1's single hired entry.
    expect(out.timeToHire.hiredCount).toBe(1);
    // jobs table still lists both jobs seen in the window.
    expect(out.jobs.map((j) => j.jobId).sort()).toEqual(['job-1', 'job-2']);
  });

  it('returns a zeroed shape for an empty cohort', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const jobFindMany = jest.fn().mockResolvedValue([]);
    const { service } = serviceWith({ pipelineEntry: { findMany }, job: { findMany: jobFindMany } });
    const out = await service.getHiring(context, { from: new Date('2026-08-01'), to: new Date('2026-08-31') });

    expect(out.timeToHire).toEqual({ avgDays: null, medianDays: null, hiredCount: 0 });
    expect(out.sources).toEqual([]);
    expect(out.jobs).toEqual([]);
    expect(out.funnel.every((f) => f.reached === 0)).toBe(true);
  });

  it('an entry on a custom-named stage with a known category is still counted (falls back to active for a null status)', async () => {
    const findMany = jest.fn().mockResolvedValue([
      { status: { stage: { category: 'offer' } }, rejected: false, enteredVia: 'manual', createdAt: new Date('2026-08-01'), updatedAt: new Date('2026-08-04'), jobId: 'job-1' },
      { status: null, rejected: false, enteredVia: 'manual', createdAt: new Date('2026-08-01'), updatedAt: new Date('2026-08-04'), jobId: 'job-1' },
    ]);
    const jobFindMany = jest.fn().mockResolvedValue([{ id: 'job-1', title: 'Backend', status: 'open' }]);
    const { service } = serviceWith({ pipelineEntry: { findMany }, job: { findMany: jobFindMany } });
    const out = await service.getHiring(context, { from: new Date('2026-08-01'), to: new Date('2026-08-31') });

    expect(out.funnel.find((f) => f.stage === 'offer')!.reached).toBe(1);
    // null status falls back to 'active' category, so it's still counted at the active step.
    expect(out.funnel.find((f) => f.stage === 'active')!.reached).toBe(2);
  });
});

describe('PipelineAnalyticsService.getHiring: ANL-02 dashboard figures (answer 2432)', () => {
  it('counts open jobs now and the offers answered in the window, for one job when asked', async () => {
    const groupBy = jest.fn().mockResolvedValue([{ status: 'accepted', _count: { _all: 9 } }, { status: 'declined', _count: { _all: 3 } }]);
    const { service } = serviceWith({
      pipelineEntry: { findMany: jest.fn().mockResolvedValue([]) },
      job: { findMany: jest.fn().mockResolvedValue([{ id: 'j1', title: 'A', status: 'open' }, { id: 'j2', title: 'B', status: 'closed' }, { id: 'j3', title: 'C', status: 'open' }]) },
      offer: { groupBy },
    });
    const from = new Date('2026-08-01');
    const to = new Date('2026-08-31');
    const out = await service.getHiring(context, { from, to, jobId: 'j1' });
    expect(out).toMatchObject({ openJobs: 2, offers: { accepted: 9, declined: 3 } });
    expect(groupBy).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId: 'org-1', status: { in: ['accepted', 'declined'] }, respondedAt: { gte: from, lte: to }, pipelineEntry: { jobId: 'j1' } } }));
  });
});
