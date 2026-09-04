import { Injectable } from '@nestjs/common';
import { TenantPrismaService, TenantContext, StageCategory } from '@exam-platform/shared';
import { computeHiringAnalytics, HiringAnalytics, EntryRow, JobMeta } from './pipeline-analytics';

// category is read via the status FK (the flat pipeline_entries.stage column is gone) -- the
// funnel pivots on the stage's category so custom/renamed stages still count (Task 10).
const ENTRY_SELECT = {
  rejected: true,
  enteredVia: true,
  createdAt: true,
  updatedAt: true,
  jobId: true,
  status: { select: { stage: { select: { category: true } } } },
} as const;

function toEntryRow(r: {
  status: { stage: { category: string } } | null;
  rejected: boolean;
  enteredVia: string;
  createdAt: Date;
  updatedAt: Date;
  jobId: string;
}): EntryRow {
  return {
    category: (r.status?.stage.category ?? 'active') as StageCategory,
    rejected: r.rejected,
    enteredVia: r.enteredVia,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    jobId: r.jobId,
  };
}

@Injectable()
export class PipelineAnalyticsService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async getHiring(context: TenantContext, filter: { from: Date; to: Date; jobId?: string }): Promise<HiringAnalytics> {
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const orgId = context.organizationId as string;
      const orgWindowWhere = { organizationId: orgId, createdAt: { gte: filter.from, lte: filter.to } };
      const filteredWhere = filter.jobId ? { ...orgWindowWhere, jobId: filter.jobId } : orgWindowWhere;

      const jobRows = await tx.job.findMany({ where: { organizationId: orgId }, select: { id: true, title: true, status: true } });
      const jobMeta = new Map<string, JobMeta>(jobRows.map((j: { id: string; title: string; status: string }) => [j.id, { title: j.title, status: j.status }]));

      // jobs table is always org-wide for the window: fetch a second cohort without the jobId
      // filter only when jobId narrows the first one, and use it solely for the jobs rollup.
      const [filtered, orgWide] = await Promise.all([
        tx.pipelineEntry.findMany({ where: filteredWhere, select: ENTRY_SELECT }),
        filter.jobId ? tx.pipelineEntry.findMany({ where: orgWindowWhere, select: ENTRY_SELECT }) : Promise.resolve(null),
      ]);

      const full = computeHiringAnalytics(filtered.map(toEntryRow), jobMeta);
      const jobsSource = orgWide ? computeHiringAnalytics(orgWide.map(toEntryRow), jobMeta) : full;
      return { funnel: full.funnel, timeToHire: full.timeToHire, sources: full.sources, jobs: jobsSource.jobs };
    });
  }
}
