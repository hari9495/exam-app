import { ForbiddenException, Injectable } from '@nestjs/common';
import { TenantContext, TenantPrismaService, currentPeriodStart, isOverLimit } from '@exam-platform/shared';

@Injectable()
export class QuotaService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async assertAiCredits(context: TenantContext): Promise<void> {
    if (context.isSuperAdmin) return;
    const orgId = context.organizationId as string;
    const periodStart = currentPeriodStart(new Date());
    const { used, limit } = await this.tenantPrisma.forTenant(context, async (tx) => {
      const org = await tx.organization.findFirst({ where: { id: orgId }, include: { plan: true } });
      const agg = await tx.aiCreditUsage.aggregate({
        _sum: { credits: true },
        where: { organizationId: orgId, occurredAt: { gte: periodStart } },
      });
      return { used: agg._sum.credits ?? 0, limit: org?.plan.aiCreditLimit ?? Number.MAX_SAFE_INTEGER };
    });
    if (isOverLimit(used, limit)) {
      throw new ForbiddenException({
        error: 'quota_exceeded',
        dimension: 'ai_credits',
        used,
        limit,
        message: 'AI credit limit reached. Upgrade to continue.',
      });
    }
  }
}
