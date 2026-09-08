import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Prisma, Agency } from '@prisma/client';
import { TenantPrismaService, TenantContext, AuditService } from '@exam-platform/shared';
import { UpsertAgencyDto, UpdateAgencyDto } from './dto/upsert-agency.dto';

export interface AgencyWithStats {
  id: string;
  name: string;
  contactEmail: string | null;
  active: boolean;
  portalUrl: string;
  assignedJobCount: number;
  pendingSubmissionCount: number;
  jobIds: string[];
}

// Mirrors the offers/careers idiom: the agency portal is a Next PAGE
// (FRONTEND_URL), not an API route -- contrast job-boards' feedUrl, which is
// an API_ORIGIN route.
function buildPortalUrl(portalToken: string): string {
  return `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/agency/${portalToken}`;
}

function toDto(agency: Agency, assignedJobCount: number, pendingSubmissionCount: number, jobIds: string[]): AgencyWithStats {
  return {
    id: agency.id,
    name: agency.name,
    contactEmail: agency.contactEmail,
    active: agency.active,
    portalUrl: buildPortalUrl(agency.portalToken),
    assignedJobCount,
    pendingSubmissionCount,
    jobIds,
  };
}

@Injectable()
export class AgenciesService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(context: TenantContext): Promise<AgencyWithStats[]> {
    const orgId = context.organizationId as string;
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const agencies = await tx.agency.findMany({ where: { organizationId: orgId }, orderBy: { name: 'asc' } });
      if (agencies.length === 0) return [];
      const jobCounts = await tx.agencyJob.groupBy({ by: ['agencyId'], where: { organizationId: orgId }, _count: { _all: true } });
      const jobCountByAgency = new Map(jobCounts.map((c: { agencyId: string; _count: { _all: number } }) => [c.agencyId, c._count._all]));
      const subCounts = await tx.agencySubmission.groupBy({
        by: ['agencyId'],
        where: { organizationId: orgId, status: 'pending' },
        _count: { _all: true },
      });
      const subCountByAgency = new Map(subCounts.map((c: { agencyId: string; _count: { _all: number } }) => [c.agencyId, c._count._all]));
      // Actual per-agency job ids -- needed so the settings edit dialog can pre-check the
      // current allowlist instead of opening empty (see feedback: opening empty + full-replace
      // Save silently wipes an already-assigned agency's allowlist).
      const agencyJobRows = await tx.agencyJob.findMany({ where: { organizationId: orgId }, select: { agencyId: true, jobId: true } });
      const jobIdsByAgency = new Map<string, string[]>();
      for (const row of agencyJobRows as { agencyId: string; jobId: string }[]) {
        const list = jobIdsByAgency.get(row.agencyId);
        if (list) list.push(row.jobId);
        else jobIdsByAgency.set(row.agencyId, [row.jobId]);
      }
      return agencies.map((a: Agency) =>
        toDto(a, jobCountByAgency.get(a.id) ?? 0, subCountByAgency.get(a.id) ?? 0, jobIdsByAgency.get(a.id) ?? []),
      );
    });
  }

  async create(context: TenantContext, actorUserId: string, dto: UpsertAgencyDto): Promise<AgencyWithStats> {
    const name = dto.name.trim();
    if (!name) {
      throw new BadRequestException('Agency name is required');
    }
    const orgId = context.organizationId as string;
    const portalToken = randomUUID();
    let created: Agency;
    try {
      created = await this.tenantPrisma.forTenant(context, async (tx) => {
        const agency = await tx.agency.create({
          data: {
            organizationId: orgId,
            name,
            contactEmail: dto.contactEmail ?? null,
            active: dto.active ?? true,
            portalToken,
          },
        });
        if (dto.jobIds !== undefined) {
          await this.setAllowlist(tx, orgId, agency.id, dto.jobIds);
        }
        return agency;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(`An agency named "${name}" already exists`);
      }
      throw error;
    }
    await this.audit.record(context, { actorUserId, action: 'agency.created', entityType: 'agency', entityId: created.id, metadata: { name } });
    const createdJobIds = [...new Set(dto.jobIds ?? [])];
    return toDto(created, createdJobIds.length, 0, createdJobIds);
  }

  async update(context: TenantContext, actorUserId: string, id: string, dto: UpdateAgencyDto): Promise<AgencyWithStats> {
    const orgId = context.organizationId as string;
    let name: string | undefined;
    if (dto.name !== undefined) {
      name = dto.name.trim();
      if (!name) {
        throw new BadRequestException('Agency name is required');
      }
    }
    // Fetch-existence, the scalar update, and the allowlist reconcile all run inside ONE
    // forTenant transaction, so a concurrent delete/rename between the check and the write can't
    // slip through as an unhandled P2025 -- a missing agency surfaces as a clean 404 instead.
    let result: { agency: Agency; assignedJobCount: number; pendingSubmissionCount: number; jobIds: string[] };
    try {
      result = await this.tenantPrisma.forTenant(context, async (tx) => {
        const existing = await tx.agency.findFirst({ where: { id, organizationId: orgId } });
        if (!existing) {
          throw new NotFoundException(`Agency ${id} not found`);
        }
        const agency = await tx.agency.update({
          where: { id },
          data: {
            ...(name !== undefined ? { name } : {}),
            ...(dto.contactEmail !== undefined ? { contactEmail: dto.contactEmail } : {}),
            ...(dto.active !== undefined ? { active: dto.active } : {}),
          },
        });
        if (dto.jobIds !== undefined) {
          await this.setAllowlist(tx, orgId, id, dto.jobIds);
        }
        const jobRows = await tx.agencyJob.findMany({ where: { agencyId: id }, select: { jobId: true } });
        const jobIds = jobRows.map((r: { jobId: string }) => r.jobId);
        const assignedJobCount = await tx.agencyJob.count({ where: { agencyId: id } });
        const pendingSubmissionCount = await tx.agencySubmission.count({ where: { agencyId: id, status: 'pending' } });
        return { agency, assignedJobCount, pendingSubmissionCount, jobIds };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(`An agency named "${name}" already exists`);
      }
      throw error;
    }
    await this.audit.record(context, { actorUserId, action: 'agency.updated', entityType: 'agency', entityId: id, metadata: { name } });
    return toDto(result.agency, result.assignedJobCount, result.pendingSubmissionCount, result.jobIds);
  }

  async remove(context: TenantContext, actorUserId: string, id: string): Promise<{ id: string }> {
    const orgId = context.organizationId as string;
    // Existence check, the submission-count guard, and the delete all run inside ONE forTenant
    // transaction -- a submission inserted between the count-check and the delete can't slip
    // past the 409 guard.
    const existing = await this.tenantPrisma.forTenant(context, async (tx) => {
      const agency = await tx.agency.findFirst({ where: { id, organizationId: orgId } });
      if (!agency) {
        throw new NotFoundException(`Agency ${id} not found`);
      }
      const submissionCount = await tx.agencySubmission.count({ where: { agencyId: id } });
      if (submissionCount > 0) {
        throw new ConflictException('Cannot delete an agency with submissions');
      }
      // AgencyJob cascades via the FK (onDelete: Cascade, see T1) -- no manual cleanup.
      await tx.agency.delete({ where: { id } });
      return agency;
    });
    await this.audit.record(context, { actorUserId, action: 'agency.deleted', entityType: 'agency', entityId: id, metadata: { name: existing.name } });
    return { id };
  }

  async regenerateToken(context: TenantContext, actorUserId: string, id: string): Promise<{ portalUrl: string }> {
    const orgId = context.organizationId as string;
    const existing = await this.tenantPrisma.forTenant(context, (tx) => tx.agency.findFirst({ where: { id, organizationId: orgId } }));
    if (!existing) {
      throw new NotFoundException(`Agency ${id} not found`);
    }
    const portalToken = randomUUID();
    await this.tenantPrisma.forTenant(context, (tx) => tx.agency.update({ where: { id }, data: { portalToken } }));
    await this.audit.record(context, { actorUserId, action: 'agency.token_regenerated', entityType: 'agency', entityId: id });
    return { portalUrl: buildPortalUrl(portalToken) };
  }

  // Replace-set reconciliation: jobIds is the COMPLETE allowlist for this agency (mirrors
  // pipeline.service.ts's jobBoardIds handling). Validated against this org's jobs BEFORE any
  // write -- a cross-org/unknown id throws inside the caller's forTenant transaction, so nothing
  // persists. Empty array clears the allowlist.
  private async setAllowlist(tx: Prisma.TransactionClient, organizationId: string, agencyId: string, jobIds: string[]): Promise<void> {
    const uniqueIds = [...new Set(jobIds)];
    if (uniqueIds.length > 0) {
      const jobs = await tx.job.findMany({ where: { id: { in: uniqueIds }, organizationId }, select: { id: true } });
      if (jobs.length !== uniqueIds.length) {
        throw new BadRequestException('One or more jobs were not found');
      }
    }
    const existing = await tx.agencyJob.findMany({ where: { agencyId }, select: { jobId: true } });
    const existingIds = existing.map((e: { jobId: string }) => e.jobId);
    const toRemove = existingIds.filter((jobId: string) => !uniqueIds.includes(jobId));
    const toAdd = uniqueIds.filter((jobId) => !existingIds.includes(jobId));
    if (toRemove.length > 0) {
      await tx.agencyJob.deleteMany({ where: { agencyId, jobId: { in: toRemove } } });
    }
    if (toAdd.length > 0) {
      await tx.agencyJob.createMany({ data: toAdd.map((jobId) => ({ agencyId, jobId, organizationId })) });
    }
  }
}
