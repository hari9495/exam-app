import { Injectable } from '@nestjs/common';
import { TenantPrismaService, TenantContext } from '@exam-platform/shared';
import { computeHiringAnalytics, HiringAnalytics, EntryRow, JobMeta } from './pipeline-analytics';

const ENTRY_SELECT = { stage: true, rejected: true, enteredVia: true, createdAt: true, updatedAt: true, jobId: true } as const;

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

      const full = computeHiringAnalytics(filtered as EntryRow[], jobMeta);
      const jobsSource = orgWide ? computeHiringAnalytics(orgWide as EntryRow[], jobMeta) : full;
      return { funnel: full.funnel, timeToHire: full.timeToHire, sources: full.sources, jobs: jobsSource.jobs };
    });
  }
}
