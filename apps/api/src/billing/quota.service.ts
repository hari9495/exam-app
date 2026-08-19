import { Injectable } from '@nestjs/common';
import { TenantContext, TenantPrismaService, usageRatio, warnThreshold, isOverLimit, currentPeriodStart } from '@exam-platform/shared';
import { EmailService } from '../email/email.service';
import { buildCandidateEmailHtml } from '../candidate-emails/candidate-email-render';
import { UsageService, DimensionUsage } from './usage.service';
import { QuotaExceededException } from './quota-exceeded.exception';

const USAGE_KEY = {
  ai_credits: 'aiCredits',
  proctoring_minutes: 'proctoringMinutes',
  seats: 'seats',
  candidates: 'candidates',
} as const;

@Injectable()
export class QuotaService {
  constructor(
    private readonly usage: UsageService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly email: EmailService,
  ) {}

  async assertWithinLimit(context: TenantContext, dimension: 'ai_credits' | 'proctoring_minutes'): Promise<void> {
    if (context.isSuperAdmin) return;
    const u = await this.usage.getUsage(context);
    const d = (u as any)[USAGE_KEY[dimension]] as DimensionUsage;
    if (isOverLimit(d.used, d.limit)) throw new QuotaExceededException(dimension, d.used, d.limit);
  }

  async checkSoftLimit(
    context: TenantContext,
    dimension: 'seats' | 'candidates',
  ): Promise<{ warn: boolean; threshold: 80 | 100 | null; used: number; limit: number }> {
    if (context.isSuperAdmin) return { warn: false, threshold: null, used: 0, limit: 0 };
    const u = await this.usage.getUsage(context);
    const d = (u as any)[USAGE_KEY[dimension]] as DimensionUsage;
    const threshold = warnThreshold(usageRatio(d.used, d.limit));
    if (threshold === null) return { warn: false, threshold: null, used: d.used, limit: d.limit };

    await this.maybeNotify(context, dimension, threshold, d.used, d.limit);
    return { warn: true, threshold, used: d.used, limit: d.limit };
  }

  // Dedup: insert one BillingNotice per (org, dimension, threshold, period) and email the admins
  // only on first crossing. Email is outside the notice write (EmailService never throws).
  private async maybeNotify(context: TenantContext, dimension: string, threshold: 80 | 100, used: number, limit: number): Promise<void> {
    const periodStart = currentPeriodStart(new Date());
    const orgId = context.organizationId as string;

    const created = await this.tenantPrisma.forTenant(context, async (tx) => {
      const existing = await tx.billingNotice.findFirst({ where: { organizationId: orgId, dimension, threshold, periodStart } });
      if (existing) return false;
      await tx.billingNotice.create({ data: { organizationId: orgId, dimension, threshold, periodStart } });
      return true;
    });
    if (!created) return;

    const recipients = await this.tenantPrisma.forTenant(context, async (tx) => {
      const org = await tx.organization.findFirst({ where: { id: orgId }, select: { name: true } });
      const admins = await tx.user.findMany({ where: { organizationId: orgId, role: 'org_admin', status: 'active' }, select: { email: true } });
      return { orgName: org?.name ?? null, emails: admins.map((a) => a.email) };
    });

    for (const to of recipients.emails) {
      await this.email.send({
        to,
        subject: `Usage alert: ${dimension} at ${threshold}% of your plan`,
        html: buildCandidateEmailHtml({
          logoUrl: null,
          orgName: recipients.orgName,
          bodyText: `Your organization has reached ${threshold}% of its ${dimension} limit (${used} of ${limit}). Consider upgrading your plan.`,
        }),
        organizationId: orgId,
      });
    }
  }
}
