import { Injectable } from '@nestjs/common';
import { PrismaService, AuditService, TenantContext } from '@exam-platform/shared';
import { UpsertPlanDto } from './dto/plan.dto';

@Injectable()
export class PlansService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  list() {
    return this.prisma.plan.findMany({ orderBy: { name: 'asc' } });
  }

  async create(context: TenantContext, actorUserId: string, dto: UpsertPlanDto) {
    const plan = await this.prisma.plan.create({
      data: {
        name: dto.name, seatLimit: dto.seatLimit, candidateLimit: dto.candidateLimit,
        aiCreditLimit: dto.aiCreditLimit, proctoringMinutesLimit: dto.proctoringMinutesLimit,
        priceLabel: dto.priceLabel ?? null, isPublic: dto.isPublic ?? true,
      },
    });
    await this.audit.record(context, { actorUserId, action: 'plan.created', entityType: 'plan', entityId: plan.id, metadata: { name: dto.name } });
    return plan;
  }

  async update(context: TenantContext, actorUserId: string, id: string, dto: UpsertPlanDto) {
    const plan = await this.prisma.plan.update({
      where: { id },
      data: {
        name: dto.name, seatLimit: dto.seatLimit, candidateLimit: dto.candidateLimit,
        aiCreditLimit: dto.aiCreditLimit, proctoringMinutesLimit: dto.proctoringMinutesLimit,
        priceLabel: dto.priceLabel ?? null, isPublic: dto.isPublic ?? true,
      },
    });
    await this.audit.record(context, { actorUserId, action: 'plan.updated', entityType: 'plan', entityId: id, metadata: { ...dto } });
    return plan;
  }

  async assignToOrg(context: TenantContext, actorUserId: string, orgId: string, planId: string) {
    const org = await this.prisma.organization.update({ where: { id: orgId }, data: { planId } });
    await this.audit.record(context, { actorUserId, action: 'org.plan_assigned', entityType: 'organization', entityId: orgId, metadata: { planId } });
    return org;
  }
}
