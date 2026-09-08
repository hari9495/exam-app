import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Prisma, JobBoard } from '@prisma/client';
import { TenantPrismaService, TenantContext, AuditService } from '@exam-platform/shared';
import { UpsertJobBoardDto } from './dto/upsert-job-board.dto';

export type JobBoardWithStats = JobBoard & { feedUrl: string; publishedJobCount: number };

function buildFeedUrl(feedToken: string): string {
  const baseUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';
  return `${baseUrl}/public/job-boards/${feedToken}/feed.xml`;
}

@Injectable()
export class JobBoardsService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(context: TenantContext): Promise<JobBoardWithStats[]> {
    const orgId = context.organizationId as string;
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const boards = await tx.jobBoard.findMany({ where: { organizationId: orgId }, orderBy: { name: 'asc' } });
      if (boards.length === 0) return [];
      const counts = await tx.jobBoardPublication.groupBy({ by: ['jobBoardId'], where: { organizationId: orgId }, _count: { _all: true } });
      const countByBoard = new Map(counts.map((c: { jobBoardId: string; _count: { _all: number } }) => [c.jobBoardId, c._count._all]));
      return boards.map((b: JobBoard) => ({ ...b, feedUrl: buildFeedUrl(b.feedToken), publishedJobCount: countByBoard.get(b.id) ?? 0 }));
    });
  }

  async create(context: TenantContext, actorUserId: string, dto: UpsertJobBoardDto): Promise<JobBoardWithStats> {
    const name = dto.name?.trim();
    if (!name) {
      throw new BadRequestException('Board name is required');
    }
    const orgId = context.organizationId as string;
    const feedToken = randomUUID();
    let created: JobBoard;
    try {
      created = await this.tenantPrisma.forTenant(context, (tx) =>
        tx.jobBoard.create({ data: { organizationId: orgId, name, feedToken } }),
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(`A job board named "${name}" already exists`);
      }
      throw error;
    }
    await this.audit.record(context, { actorUserId, action: 'job_board.created', entityType: 'job_board', entityId: created.id, metadata: { name } });
    return { ...created, feedUrl: buildFeedUrl(created.feedToken), publishedJobCount: 0 };
  }

  async update(context: TenantContext, actorUserId: string, id: string, dto: UpsertJobBoardDto): Promise<JobBoardWithStats> {
    const orgId = context.organizationId as string;
    const existing = await this.tenantPrisma.forTenant(context, (tx) => tx.jobBoard.findFirst({ where: { id, organizationId: orgId } }));
    if (!existing) {
      throw new NotFoundException(`Job board ${id} not found`);
    }
    let name: string | undefined;
    if (dto.name !== undefined) {
      name = dto.name.trim();
      if (!name) {
        throw new BadRequestException('Board name is required');
      }
    }
    let updated: JobBoard;
    try {
      updated = await this.tenantPrisma.forTenant(context, (tx) =>
        tx.jobBoard.update({ where: { id }, data: { ...(name !== undefined ? { name } : {}) } }),
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(`A job board named "${name}" already exists`);
      }
      throw error;
    }
    await this.audit.record(context, { actorUserId, action: 'job_board.updated', entityType: 'job_board', entityId: id, metadata: { name } });
    const publishedJobCount = await this.tenantPrisma.forTenant(context, (tx) => tx.jobBoardPublication.count({ where: { jobBoardId: id } }));
    return { ...updated, feedUrl: buildFeedUrl(updated.feedToken), publishedJobCount };
  }

  async remove(context: TenantContext, actorUserId: string, id: string): Promise<{ id: string }> {
    const orgId = context.organizationId as string;
    const existing = await this.tenantPrisma.forTenant(context, (tx) => tx.jobBoard.findFirst({ where: { id, organizationId: orgId } }));
    if (!existing) {
      throw new NotFoundException(`Job board ${id} not found`);
    }
    // JobBoardPublication rows cascade via the FK (onDelete: Cascade, see T1) -- no manual cleanup.
    await this.tenantPrisma.forTenant(context, (tx) => tx.jobBoard.delete({ where: { id } }));
    await this.audit.record(context, { actorUserId, action: 'job_board.deleted', entityType: 'job_board', entityId: id, metadata: { name: existing.name } });
    return { id };
  }
}
