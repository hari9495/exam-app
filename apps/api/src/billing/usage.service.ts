import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantContext, TenantPrismaService, currentPeriodStart } from '@exam-platform/shared';

export interface DimensionUsage { used: number; limit: number }
export interface OrgUsage {
  planName: string;
  periodStart: Date;
  seats: DimensionUsage;
  candidates: DimensionUsage;
  aiCredits: DimensionUsage;
  proctoringMinutes: DimensionUsage;
}

@Injectable()
export class UsageService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async getUsage(context: TenantContext): Promise<OrgUsage> {
    const orgId = context.organizationId as string;
    const periodStart = currentPeriodStart(new Date());

    return this.tenantPrisma.forTenant(context, async (tx) => {
      const org = await tx.organization.findFirst({ where: { id: orgId }, include: { plan: true } });
      if (!org) throw new NotFoundException('Organization not found');
      const plan = org.plan;

      const [seats, candidates, aiAgg, proctoringRows] = await Promise.all([
        tx.user.count({ where: { organizationId: orgId, status: 'active' } }),
        tx.candidate.count({ where: { organizationId: orgId, erasedAt: null } }),
        tx.aiCreditUsage.aggregate({ _sum: { credits: true }, where: { organizationId: orgId, occurredAt: { gte: periodStart } } }),
        // Proctoring minutes: attempts of anti-cheating-enabled exams, completed this period.
        // Attempt has no direct org column -> join via exam. datediff in minutes; NULL -> 0.
        tx.$queryRaw<{ minutes: number | null }[]>(Prisma.sql`
          SELECT COALESCE(SUM(DATEDIFF(MINUTE, a.[started_at], a.[submitted_at])), 0) AS minutes
          FROM [dbo].[attempts] a
          JOIN [dbo].[exams] e ON e.[id] = a.[exam_id]
          WHERE e.[organization_id] = ${orgId}
            AND e.[enable_anti_cheating] = 1
            AND a.[submitted_at] IS NOT NULL
            AND a.[submitted_at] >= ${periodStart}
        `),
      ]);

      return {
        planName: plan.name,
        periodStart,
        seats: { used: seats, limit: plan.seatLimit },
        candidates: { used: candidates, limit: plan.candidateLimit },
        aiCredits: { used: aiAgg._sum.credits ?? 0, limit: plan.aiCreditLimit },
        proctoringMinutes: { used: Number(proctoringRows[0]?.minutes ?? 0), limit: plan.proctoringMinutesLimit },
      };
    });
  }
}
