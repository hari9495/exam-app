import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, WalkInGroup } from '@prisma/client';
import { TenantPrismaService, TenantContext, AuditService } from '@exam-platform/shared';

export interface WalkInGroupExamSummary {
  id: string;
  title: string;
}

export type WalkInGroupWithExams = WalkInGroup & { exams: WalkInGroupExamSummary[] };

export interface EligibleWalkInExam {
  id: string;
  title: string;
  walkInGroupId: string | null;
}

@Injectable()
export class WalkInGroupsService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(context: TenantContext): Promise<WalkInGroupWithExams[]> {
    return this.tenantPrisma.forTenant(context, (tx) =>
      tx.walkInGroup.findMany({
        where: { organizationId: context.organizationId as string },
        include: { exams: { select: { id: true, title: true } } },
        orderBy: { name: 'asc' },
      }),
    );
  }

  // Every walk-in-enabled exam in the org, regardless of current group membership --
  // this is the pool a recruiter picks a group's members from (see setExams), so it must
  // include exams already in another group too, to make moving one between groups possible.
  async listEligibleExams(context: TenantContext): Promise<EligibleWalkInExam[]> {
    return this.tenantPrisma.forTenant(context, (tx) =>
      tx.exam.findMany({
        where: { organizationId: context.organizationId as string, walkInEnabled: true },
        select: { id: true, title: true, walkInGroupId: true },
        orderBy: { title: 'asc' },
      }),
    );
  }

  async create(context: TenantContext, actorUserId: string, name: string): Promise<WalkInGroup> {
    const trimmed = name.trim();
    if (!trimmed) {
      throw new BadRequestException('Group name is required');
    }
    let created: WalkInGroup;
    try {
      created = await this.tenantPrisma.forTenant(context, (tx) =>
        tx.walkInGroup.create({ data: { organizationId: context.organizationId as string, name: trimmed } }),
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(`A group named "${trimmed}" already exists`);
      }
      throw error;
    }
    await this.audit.record(context, {
      actorUserId,
      action: 'walk_in_group.created',
      entityType: 'walk_in_group',
      entityId: created.id,
      metadata: { name: trimmed },
    });
    return created;
  }

  async rename(context: TenantContext, actorUserId: string, id: string, name: string): Promise<WalkInGroup> {
    const trimmed = name.trim();
    if (!trimmed) {
      throw new BadRequestException('Group name is required');
    }
    const existing = await this.tenantPrisma.forTenant(context, (tx) =>
      tx.walkInGroup.findFirst({ where: { id, organizationId: context.organizationId as string } }),
    );
    if (!existing) {
      throw new NotFoundException(`Walk-in group ${id} not found`);
    }
    let updated: WalkInGroup;
    try {
      updated = await this.tenantPrisma.forTenant(context, (tx) => tx.walkInGroup.update({ where: { id }, data: { name: trimmed } }));
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(`A group named "${trimmed}" already exists`);
      }
      throw error;
    }
    await this.audit.record(context, {
      actorUserId,
      action: 'walk_in_group.updated',
      entityType: 'walk_in_group',
      entityId: id,
      metadata: { name: trimmed },
    });
    return updated;
  }

  async remove(context: TenantContext, actorUserId: string, id: string): Promise<{ success: true }> {
    const existing = await this.tenantPrisma.forTenant(context, (tx) =>
      tx.walkInGroup.findFirst({ where: { id, organizationId: context.organizationId as string } }),
    );
    if (!existing) {
      throw new NotFoundException(`Walk-in group ${id} not found`);
    }
    // onDelete: SetNull on Exam.walkInGroupId -- member exams simply become ungrouped,
    // still walk-in-enabled, still reachable via their own exam-specific link.
    await this.tenantPrisma.forTenant(context, (tx) => tx.walkInGroup.delete({ where: { id } }));
    await this.audit.record(context, {
      actorUserId,
      action: 'walk_in_group.deleted',
      entityType: 'walk_in_group',
      entityId: id,
      metadata: { name: existing.name },
    });
    return { success: true };
  }

  // Full replacement, mirroring replaceSectionQuestions -- the caller sends the complete
  // desired membership, not a diff. Every exam is in at most one group, so adding one here
  // silently moves it out of whatever group it was in before.
  async setExams(context: TenantContext, actorUserId: string, id: string, examIds: string[]): Promise<WalkInGroupWithExams> {
    const uniqueIds = [...new Set(examIds)];
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const group = await tx.walkInGroup.findFirst({ where: { id, organizationId: context.organizationId as string } });
      if (!group) {
        throw new NotFoundException(`Walk-in group ${id} not found`);
      }
      if (uniqueIds.length > 0) {
        const matchingCount = await tx.exam.count({ where: { id: { in: uniqueIds }, organizationId: context.organizationId as string } });
        if (matchingCount !== uniqueIds.length) {
          throw new BadRequestException('One or more exams were not found');
        }
      }
      const currentMembers = await tx.exam.findMany({ where: { walkInGroupId: id }, select: { id: true } });
      const toRemove = currentMembers.map((exam) => exam.id).filter((examId) => !uniqueIds.includes(examId));
      if (toRemove.length > 0) {
        await tx.exam.updateMany({ where: { id: { in: toRemove } }, data: { walkInGroupId: null } });
      }
      if (uniqueIds.length > 0) {
        await tx.exam.updateMany({
          where: { id: { in: uniqueIds }, organizationId: context.organizationId as string },
          data: { walkInGroupId: id },
        });
      }
      await this.audit.record(context, {
        actorUserId,
        action: 'walk_in_group.updated',
        entityType: 'walk_in_group',
        entityId: id,
        metadata: { examCount: uniqueIds.length },
      });
      return tx.walkInGroup.findFirstOrThrow({ where: { id }, include: { exams: { select: { id: true, title: true } } } });
    });
  }
}
