import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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

  async assertProctoringMinutes(context: TenantContext): Promise<void> {
    if (context.isSuperAdmin) return;
    const orgId = context.organizationId as string;
    const periodStart = currentPeriodStart(new Date());
    const { used, limit } = await this.tenantPrisma.forTenant(context, async (tx) => {
      const org = await tx.organization.findFirst({ where: { id: orgId }, include: { plan: true } });
      const rows = await tx.$queryRaw<{ minutes: number | null }[]>(Prisma.sql`
        SELECT COALESCE(SUM(DATEDIFF(MINUTE, a.[started_at], a.[submitted_at])), 0) AS minutes
        FROM [dbo].[attempts] a
        JOIN [dbo].[exams] e ON e.[id] = a.[exam_id]
        WHERE e.[organization_id] = ${orgId}
          AND e.[enable_anti_cheating] = 1
          AND a.[submitted_at] IS NOT NULL
          AND a.[submitted_at] >= ${periodStart}
      `);
      return { used: Number(rows[0]?.minutes ?? 0), limit: org?.plan.proctoringMinutesLimit ?? Number.MAX_SAFE_INTEGER };
    });
    if (isOverLimit(used, limit)) {
      throw new ForbiddenException({
        error: 'quota_exceeded',
        dimension: 'proctoring_minutes',
        used,
        limit,
        message: 'Proctoring minutes limit reached. Upgrade to continue.',
      });
    }
  }
}
