import { Injectable, Logger } from '@nestjs/common';
import { TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { DashboardService } from '../dashboard/dashboard.service';
import { EmailService } from '../email/email.service';
import { renderDigestHtml, renderDigestCsv } from './report-digest';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const SUPER_ADMIN = { organizationId: null, isSuperAdmin: true };

// Weekly scheduled-report digest. The sweep runs nightly (scheduled by ScheduledSweepsModule) but
// sends per org only when its last send was 7+ days ago — so the cadence is weekly and a restart or
// a duplicate run can't re-send the same week. Opt-in per org.
// ponytail: fixed 7-day cadence, no configurable day/frequency; add a cadence column if needed.
@Injectable()
export class ScheduledReportsService {
  private readonly logger = new Logger(ScheduledReportsService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly dashboard: DashboardService,
    private readonly email: EmailService,
  ) {}

  async sweep(now = new Date()): Promise<void> {
    let orgs: { id: string; name: string; scheduledReportRecipientsJson: string | null; scheduledReportLastSentAt: Date | null }[] = [];
    try {
      orgs = await this.tenantPrisma.forTenant(SUPER_ADMIN, (tx) =>
        tx.organization.findMany({
          where: { scheduledReportEnabled: true, status: 'active' },
          select: { id: true, name: true, scheduledReportRecipientsJson: true, scheduledReportLastSentAt: true },
        }),
      );
    } catch (e) {
      this.logger.warn(`Scheduled reports: failed to list orgs: ${msg(e)}`);
      return;
    }
    for (const org of orgs) {
      if (org.scheduledReportLastSentAt && now.getTime() - org.scheduledReportLastSentAt.getTime() < WEEK_MS) continue; // not due yet
      const recipientIds = parseIds(org.scheduledReportRecipientsJson);
      if (recipientIds.length === 0) continue;
      try {
        await this.sendForOrg(org.id, org.name, recipientIds, now);
      } catch (e) {
        this.logger.warn(`Scheduled report failed for org ${org.id}: ${msg(e)}`);
      }
    }
  }

  private async sendForOrg(organizationId: string, orgName: string, recipientIds: string[], now: Date): Promise<void> {
    const ctx: TenantContext = { organizationId, isSuperAdmin: false };
    const [analytics, summary, recipients] = await Promise.all([
      this.dashboard.getAnalytics(ctx, { window: '7d' }),
      this.dashboard.getSummary(ctx, '7d'),
      this.tenantPrisma.forTenant(ctx, (tx) =>
        tx.user.findMany({ where: { id: { in: recipientIds }, organizationId, status: 'active' }, select: { email: true } }),
      ),
    ]);
    const emails = recipients.map((r: { email: string }) => r.email).filter(Boolean);
    if (emails.length === 0) return; // configured recipients no longer valid — don't stamp lastSentAt, retry next run

    const html = renderDigestHtml(orgName, analytics, summary);
    const csv = renderDigestCsv(analytics);
    const subject = `Weekly hiring digest — ${orgName}`;
    const attachments = [{ filename: 'weekly-report.csv', content: Buffer.from(csv, 'utf8') }];

    const results = await Promise.allSettled(
      emails.map((to: string) => this.email.send({ to, subject, html, organizationId, attachments })),
    );
    const delivered = results.some((r) => r.status === 'fulfilled');
    if (!delivered) throw new Error('all digest sends failed'); // leave lastSentAt unset so it retries next daily tick

    // Stamp only after a successful send so the 7-day cadence (and restart-dedup) is anchored to
    // real delivery, not to a failed attempt.
    await this.tenantPrisma.forTenant(SUPER_ADMIN, (tx) =>
      tx.organization.update({ where: { id: organizationId }, data: { scheduledReportLastSentAt: now } }),
    );
    this.logger.log(`Scheduled report sent for org ${organizationId} to ${emails.length} recipient(s)`);
  }
}

function parseIds(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
