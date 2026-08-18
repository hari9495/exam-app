import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Interview } from '@prisma/client';
import { TenantPrismaService, TenantContext, AuditService } from '@exam-platform/shared';
import { CreateInterviewDto } from './dto/create-interview.dto';

@Injectable()
export class InterviewsService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly audit: AuditService,
  ) {}

  async createInterview(
    context: TenantContext,
    actorUserId: string,
    entryId: string,
    dto: CreateInterviewDto,
  ): Promise<Interview> {
    if (!dto.slots?.length) throw new BadRequestException('At least one slot is required');

    return this.tenantPrisma.forTenant(context, async (tx) => {
      const orgId = context.organizationId as string;
      const entry = await tx.pipelineEntry.findFirst({ where: { id: entryId, organizationId: orgId } });
      if (!entry) throw new NotFoundException(`Pipeline entry ${entryId} not found`);

      if (dto.panelistUserIds.length) {
        const found = await tx.user.findMany({
          where: { id: { in: dto.panelistUserIds }, organizationId: orgId },
          select: { id: true },
        });
        if (found.length !== dto.panelistUserIds.length) {
          throw new BadRequestException('One or more panelists are not members of this organization');
        }
      }

      const interview = await tx.interview.create({
        data: {
          organizationId: orgId,
          pipelineEntryId: entryId,
          candidateId: entry.candidateId,
          status: 'proposed',
          location: dto.location,
          timeZone: dto.timeZone,
          recruiterNote: dto.recruiterNote ?? null,
          slots: {
            create: dto.slots.map((s) => ({ organizationId: orgId, startsAt: new Date(s.startsAt), endsAt: new Date(s.endsAt) })),
          },
          panelists: {
            create: dto.panelistUserIds.map((userId) => ({ organizationId: orgId, userId })),
          },
        },
        include: { slots: true, panelists: true },
      });

      await this.audit.record(context, {
        actorUserId,
        action: 'interview.created',
        entityType: 'interview',
        entityId: interview.id,
      });
      return interview;
    });
  }

  async listForEntry(context: TenantContext, entryId: string): Promise<Interview[]> {
    return this.tenantPrisma.forTenant(context, async (tx) =>
      tx.interview.findMany({
        where: { organizationId: context.organizationId as string, pipelineEntryId: entryId },
        include: { slots: true, panelists: true },
        orderBy: { createdAt: 'desc' },
      }),
    );
  }

  async listForCandidate(context: TenantContext, candidateId: string): Promise<Interview[]> {
    return this.tenantPrisma.forTenant(context, async (tx) =>
      tx.interview.findMany({
        where: { organizationId: context.organizationId as string, candidateId },
        include: { slots: true, panelists: true },
        orderBy: { createdAt: 'desc' },
      }),
    );
  }

  async listMine(context: TenantContext, userId: string): Promise<Interview[]> {
    return this.tenantPrisma.forTenant(context, async (tx) =>
      tx.interview.findMany({
        where: { organizationId: context.organizationId as string, panelists: { some: { userId } } },
        include: { slots: true },
        orderBy: { createdAt: 'desc' },
      }),
    );
  }

  async cancel(context: TenantContext, actorUserId: string, interviewId: string): Promise<Interview> {
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const orgId = context.organizationId as string;
      const interview = await tx.interview.findFirst({ where: { id: interviewId, organizationId: orgId } });
      if (!interview) throw new NotFoundException(`Interview ${interviewId} not found`);

      const updated = await tx.interview.update({ where: { id: interviewId }, data: { status: 'cancelled' } });
      await this.audit.record(context, {
        actorUserId,
        action: 'interview.cancelled',
        entityType: 'interview',
        entityId: interviewId,
      });
      return updated;
    });
  }
}
