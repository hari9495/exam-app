import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { TenantContext, TenantPrismaService, AuditService } from '@exam-platform/shared';
import { recomputeGlobalStage } from '../candidates/recompute-global-stage';
import { ApplyInternalDto } from './dto/internal-application.dto';

export interface InternalApplicationRow {
  entryId: string;
  jobTitle: string;
  status: string;
  appliedAt: Date;
}

// Internal-mobility self-apply: a signed-in staff member applies to an open internal role themselves.
// Sibling of the referral portal -- same ingestion primitives, but the applicant IS the candidate
// (upserted on their own work email) and the attribution (referrerUserId) is the applicant. Lands as
// a pipeline entry enteredVia='internal'. No new table/column: reuses referrerUserId to attribute the
// applicant, and enteredVia to mark it (the board suppresses the "referred by" label for it).
@Injectable()
export class InternalApplicationsService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly audit: AuditService,
  ) {}

  // Open roles a staff member can apply to (all open jobs -- internal apply, like referral, ignores
  // publicApplyEnabled/listOnCareers; there is no internal-only visibility flag today).
  async openJobs(context: TenantContext) {
    return this.tenantPrisma.forTenant(context, (tx) =>
      tx.job.findMany({
        where: { status: 'open' },
        orderBy: { createdAt: 'desc' },
        select: { id: true, title: true, location: true, department: true },
      }),
    );
  }

  async apply(context: TenantContext, userId: string, dto: ApplyInternalDto) {
    const orgId = context.organizationId as string;

    const { entryId } = await this.tenantPrisma.forTenant(context, async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId }, select: { email: true, name: true } });
      if (!user?.email) throw new BadRequestException('Your account has no email on file');

      const job = await tx.job.findFirst({ where: { id: dto.jobId }, select: { id: true, status: true, pipelineId: true } });
      if (!job) throw new NotFoundException('Job not found');
      if (job.status !== 'open') throw new BadRequestException('That role is not open for applications');

      // Upsert the applicant as a candidate on their own work email. Anti-tamper: never overwrite an
      // existing candidate's stored name/phone (matches referrals.submit).
      const candidate = await tx.candidate.upsert({
        where: { organizationId_email: { organizationId: orgId, email: user.email } },
        create: { organizationId: orgId, email: user.email, name: user.name ?? user.email, portalToken: randomUUID() },
        update: { deletedAt: null, deletedByUserId: null },
      });

      // First active-category stage's first status (same rule as apply()/referral).
      const pipeline = job.pipelineId
        ? await tx.pipeline.findFirst({ where: { id: job.pipelineId }, include: { stages: { orderBy: { position: 'asc' }, include: { statuses: { orderBy: { position: 'asc' } } } } } })
        : null;
      const activeStage = pipeline?.stages.find((s: { category: string }) => s.category === 'active') ?? pipeline?.stages[0];
      const statusId = activeStage?.statuses[0]?.id;

      // Block a re-apply: if the person is already in this job's pipeline (via any source), don't
      // create a second entry -- one application per role.
      const existingEntry = await tx.pipelineEntry.findUnique({ where: { jobId_candidateId: { jobId: job.id, candidateId: candidate.id } } });
      if (existingEntry) throw new ConflictException('You have already applied to this role');

      const entry = await tx.pipelineEntry.create({
        data: { organizationId: orgId, jobId: job.id, candidateId: candidate.id, enteredVia: 'internal', applicationToken: randomUUID(), statusId, referrerUserId: userId },
      });
      await recomputeGlobalStage(tx, orgId, candidate.id);
      return { entryId: entry.id };
    });

    await this.audit.record(context, { actorUserId: userId, action: 'internal_application.submitted', entityType: 'pipeline_entry', entityId: entryId, metadata: { jobId: dto.jobId } });
    return { id: entryId };
  }

  // The staff member's own internal applications (their self-apply entries), with the role + current
  // pipeline status. Filtered to enteredVia='internal' so referrals they made don't show here.
  async myApplications(context: TenantContext, userId: string): Promise<InternalApplicationRow[]> {
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const entries = await tx.pipelineEntry.findMany({
        where: { referrerUserId: userId, enteredVia: 'internal' },
        orderBy: { createdAt: 'desc' },
        take: 200,
        select: {
          id: true,
          jobId: true,
          createdAt: true,
          rejected: true,
          archivedAt: true,
          status: { select: { name: true, stage: { select: { name: true } } } },
        },
      });
      if (entries.length === 0) return [];
      const jobs = (await tx.job.findMany({ where: { id: { in: [...new Set(entries.map((e) => e.jobId))] } }, select: { id: true, title: true } })) as { id: string; title: string }[];
      const jobById = new Map(jobs.map((j) => [j.id, j]));
      return entries.map((e) => ({
        entryId: e.id,
        jobTitle: jobById.get(e.jobId)?.title ?? '(role removed)',
        status: e.rejected ? 'Not selected' : e.archivedAt ? 'Archived' : e.status?.stage?.name ?? e.status?.name ?? 'In review',
        appliedAt: e.createdAt,
      }));
    });
  }
}
