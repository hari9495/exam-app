import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { audit, inCompany } from '../org-structure/org-structure.service';
import { ScopeUser, Viewer, buildViewer, has } from '../access/scope';
import { EmailService } from '../email/email.service';
import { ExpenseReportsService, REPORTS as EXPENSE_REPORTS, toCsv, type ReportKind as ExpenseKind } from '../expenses/reports.service';
import { LearningReportsService } from '../learning/learning-reports.service';
import { CATALOGUE_KEYS, REPORT_CATALOGUE, type CatalogueEntry } from './report-catalogue';

// G4 (answers 2690-2692): scheduled report emails and the export log.
// A schedule sends one library report daily, on weekdays, weekly (Mondays) or monthly (the 1st), at 07:00 India time.
// Each recipient's copy is built with their own rights when it is sent; anyone who no longer opens the report gets
// nothing. Confidential reports (pay, performance) are never attached: the email links to YukthiX, where the person
// signs in to see them (2691). Internal reports attach a CSV when the area can build one for the recipient; otherwise
// the email links too.
export const FREQUENCIES = ['daily', 'weekdays', 'weekly', 'monthly'] as const;
export type Frequency = (typeof FREQUENCIES)[number];
const webOrigin = () => (process.env.WEB_ORIGIN ?? 'http://localhost:3000').replace(/\/$/, '');
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const WORD: Record<Frequency, string> = { daily: 'daily', weekdays: 'weekday', weekly: 'weekly', monthly: 'monthly' };

/** The next 07:00 India time after `from` for the frequency (weekdays skip Saturday and Sunday; weekly is Monday). */
export function nextRunAt(freq: Frequency, from: Date): Date {
  const at = (day: string) => new Date(`${day}T07:00:00+05:30`);
  const ist = new Date(from.getTime() + 5.5 * 3_600_000);
  let day = ist.toISOString().slice(0, 10);
  const step = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
  if (at(day) <= from) day = step(day, 1);
  if (freq === 'monthly') {
    if (day.slice(8) !== '01') {
      const [y, m] = day.split('-').map(Number);
      day = `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}-01`;
    }
    return at(day);
  }
  const dow = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay();
  if (freq === 'weekdays') while (dow(day) === 0 || dow(day) === 6) day = step(day, 1);
  if (freq === 'weekly') while (dow(day) !== 1) day = step(day, 1);
  return at(day);
}

@Injectable()
export class ReportSchedulesService {
  private readonly logger = new Logger(ReportSchedulesService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly email: EmailService,
    private readonly expenses: ExpenseReportsService,
    private readonly learning: LearningReportsService,
  ) {}

  private opens(v: Viewer, r: CatalogueEntry) {
    return r.keys.some((k) => has(v, k)) && !v.actingForOther;
  }

  private async userAs(org: string, userId: string): Promise<ScopeUser | null> {
    const u = await this.tenantPrisma.forTenant({ organizationId: org, isSuperAdmin: false }, (tx) => tx.user.findFirst({ where: { organizationId: org, id: userId, status: 'active' }, select: { id: true, role: true, permissionProfileId: true } }));
    return u ? { userId: u.id, role: u.role, organizationId: org, permissionProfileId: u.permissionProfileId } : null;
  }

  /** My schedules, the reports I may schedule (key-based ones), and the people of the company. */
  async list(ctx: TenantContext, user: ScopeUser) {
    const v = await buildViewer(this.prisma, this.tenantPrisma, user, CATALOGUE_KEYS);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const rows = await tx.reportSchedule.findMany({ where: { organizationId: c.organizationId, createdBy: c.userId!, active: true }, orderBy: { createdAt: 'desc' } });
      const users = await tx.user.findMany({ where: { organizationId: c.organizationId, status: 'active' }, select: { id: true, name: true, email: true }, orderBy: { name: 'asc' }, take: 1000 });
      const name = (id: string) => users.find((u) => u.id === id)?.name ?? users.find((u) => u.id === id)?.email ?? 'Someone who has left';
      return {
        schedules: rows.map((s) => {
          const r = REPORT_CATALOGUE.find((x) => x.id === s.reportId);
          return { id: s.id, reportId: s.reportId, target: r?.name ?? s.reportId, frequency: s.frequency, recipients: s.recipients.map(name), recipientIds: s.recipients, delivery: r?.sensitivity === 'Confidential' ? 'Email · link to sign in' : 'Email · CSV attached', sensitivity: r?.sensitivity ?? 'Internal', nextRunAt: s.nextRunAt.toISOString(), lastRunAt: s.lastRunAt?.toISOString() ?? null, lastResult: s.lastResult };
        }),
        reports: REPORT_CATALOGUE.filter((r) => r.keys.length && this.opens(v, r)).map((r) => ({ id: r.id, name: r.name, sensitivity: r.sensitivity })),
        people: users.map((u) => ({ id: u.id, name: u.name ?? u.email })),
      };
    });
  }

  async create(ctx: TenantContext, user: ScopeUser, dto: { reportId: string; frequency: Frequency; recipientIds: string[] }) {
    const r = REPORT_CATALOGUE.find((x) => x.id === dto.reportId && x.keys.length);
    const v = await buildViewer(this.prisma, this.tenantPrisma, user, CATALOGUE_KEYS);
    if (!r || !this.opens(v, r)) throw new NotFoundException('No such report.');
    const ids = [...new Set(dto.recipientIds)];
    // Each recipient must open the report today; at send time it is checked again.
    for (const id of ids) {
      const u = await this.userAs(ctx.organizationId!, id);
      const rv = u ? await buildViewer(this.prisma, this.tenantPrisma, u, r.keys) : null;
      if (!rv || !r.keys.some((k) => has(rv, k))) throw new BadRequestException('Each recipient must be someone who may open this report.');
    }
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const s = await tx.reportSchedule.create({ data: { organizationId: c.organizationId, reportId: r.id, frequency: dto.frequency, recipients: ids, nextRunAt: nextRunAt(dto.frequency, new Date()), createdBy: c.userId! } });
      await audit(tx, c, 'library.report.scheduled', 'report_schedule', s.id, { reportId: r.id, frequency: dto.frequency, recipients: ids.length });
      return { id: s.id, nextRunAt: s.nextRunAt.toISOString() };
    });
  }

  async end(ctx: TenantContext, id: string) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const s = await tx.reportSchedule.findFirst({ where: { organizationId: c.organizationId, id, createdBy: c.userId!, active: true } });
      if (!s) throw new NotFoundException('No such schedule of yours.');
      await tx.reportSchedule.update({ where: { id }, data: { active: false } });
      await audit(tx, c, 'library.report.schedule_ended', 'report_schedule', id, { reportId: s.reportId });
      return { ended: true };
    });
  }

  /** The CSV this recipient may see, for the Internal reports whose area can build it; null means "link only". */
  private async attachment(r: CatalogueEntry, org: string, u: ScopeUser): Promise<{ name: string; csv: string } | null> {
    if (r.sensitivity === 'Confidential') return null;
    const ctx: TenantContext = { organizationId: org, isSuperAdmin: false, userId: u.userId, role: u.role, permissionProfileId: u.permissionProfileId };
    if (r.id.startsWith('exp.')) {
      const kind = r.id.slice(4) as ExpenseKind;
      if (!(EXPENSE_REPORTS as readonly string[]).includes(kind)) return null;
      const rep = await this.expenses.report(ctx, u, kind);
      return { name: `expenses-${kind}-${rep.from}-to-${rep.to}.csv`, csv: toCsv(rep) };
    }
    if (r.id === 'learning.compliance') return { name: 'compliance-training.csv', csv: await this.learning.exportCsv(ctx, u, null) };
    return null;
  }

  /** Job: due schedules; each recipient gets their own copy (or nothing, if they lost the report). */
  async sendDue(now = new Date()): Promise<number> {
    const due = await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) => tx.reportSchedule.findMany({ where: { active: true, nextRunAt: { lte: now } }, take: 100 }));
    let sent = 0;
    for (const d of due) {
      // Claim the run first, so two API instances never send the same one twice.
      const claimed = await this.tenantPrisma.forTenant({ organizationId: d.organizationId, isSuperAdmin: false }, (tx) => tx.reportSchedule.updateMany({ where: { id: d.id, active: true, nextRunAt: d.nextRunAt }, data: { nextRunAt: nextRunAt(d.frequency as Frequency, now), lastRunAt: now } }));
      if (!claimed.count) continue;
      const r = REPORT_CATALOGUE.find((x) => x.id === d.reportId);
      let ok = 0;
      for (const userId of r ? d.recipients : []) {
        try {
          const u = await this.userAs(d.organizationId, userId);
          if (!u) continue;
          const v = await buildViewer(this.prisma, this.tenantPrisma, u, r!.keys);
          if (!r!.keys.some((k) => has(v, k))) continue;
          const to = await this.tenantPrisma.forTenant({ organizationId: d.organizationId, isSuperAdmin: false }, (tx) => tx.user.findFirst({ where: { id: userId }, select: { email: true } }));
          if (!to) continue;
          const file = await this.attachment(r!, d.organizationId, u);
          const link = `${webOrigin()}${r!.href}`;
          const word = WORD[d.frequency as Frequency];
          await this.email.send({
            to: to.email,
            organizationId: d.organizationId,
            subject: `Your ${word} report: ${r!.name}`,
            html: file ? `<p>Your ${word} report "${esc(r!.name)}" is attached. It holds only what you may see.</p>` : `<p>Your ${word} report "${esc(r!.name)}" is ready. ${r!.sensitivity === 'Confidential' ? 'It holds confidential data, so it is not attached. ' : ''}<a href="${esc(link)}">Sign in to YukthiX to open it</a>.</p>`,
            text: file ? `Your ${word} report "${r!.name}" is attached.` : `Your ${word} report "${r!.name}" is ready. Sign in to YukthiX to open it: ${link}`,
            ...(file ? { attachments: [{ filename: file.name, content: Buffer.from(file.csv) }] } : {}),
          });
          ok++;
        } catch (e) {
          this.logger.warn(`Scheduled report not sent: ${(e as Error).message}`);
        }
      }
      sent += ok;
      await this.tenantPrisma.forTenant({ organizationId: d.organizationId, isSuperAdmin: false }, async (tx) => {
        await tx.reportSchedule.update({ where: { id: d.id }, data: { lastResult: `Sent to ${ok} of ${d.recipients.length}` } });
        await audit(tx, { organizationId: d.organizationId, isSuperAdmin: false, userId: null }, 'library.report.schedule_sent', 'report_schedule', d.id, { reportId: d.reportId, sent: ok, recipients: d.recipients.length });
      });
    }
    return sent;
  }
}

// ------------------------------------------------------------------------------------------ the export log (2692)

/** The audit actions that are an export of company data (personal downloads of one's own payslip or review are not). */
export const EXPORT_ACTIONS: Record<string, { what: string; sensitivity: 'Internal' | 'Confidential' }> = {
  'payroll.report.exported': { what: 'Payroll report', sensitivity: 'Confidential' },
  'payroll.journal.exported': { what: 'Payroll journal', sensitivity: 'Confidential' },
  'payroll.journal.export': { what: 'Payroll journal', sensitivity: 'Confidential' },
  'payroll.file.downloaded': { what: 'Payroll bank or statutory file', sensitivity: 'Confidential' },
  'statutory.register.downloaded': { what: 'Statutory register', sensitivity: 'Confidential' },
  'time.register.exported': { what: 'Attendance register', sensitivity: 'Internal' },
  'leave.report.exported': { what: 'Leave report', sensitivity: 'Internal' },
  'expense.journal.exported': { what: 'Expense journal', sensitivity: 'Internal' },
  'expense.payout.downloaded': { what: 'Expense payout file', sensitivity: 'Confidential' },
  'people.directory.exported': { what: 'People directory', sensitivity: 'Internal' },
  'employee.data.exported': { what: 'Employee data', sensitivity: 'Confidential' },
  'learning.report.exported': { what: 'Training compliance', sensitivity: 'Internal' },
  'learning.budgets.exported': { what: 'Training budgets', sensitivity: 'Internal' },
  'perf.dispute.exported': { what: 'Performance disputes', sensitivity: 'Confidential' },
  'desk.ticket.exported': { what: 'Helpdesk tickets', sensitivity: 'Internal' },
  'desk.ticket.export': { what: 'Helpdesk tickets', sensitivity: 'Internal' },
  'desk.change.exported': { what: 'Changes (ITSM)', sensitivity: 'Internal' },
  'desk.setup.exported': { what: 'Helpdesk set-up', sensitivity: 'Internal' },
  'staffing.invoices.exported': { what: 'Staffing invoices', sensitivity: 'Internal' },
  'clra.client_pack.downloaded': { what: 'Contract labour client pack', sensitivity: 'Internal' },
  'consultant.payout.downloaded': { what: 'Consultant payout file', sensitivity: 'Confidential' },
  'asmt.integrity_report.exported': { what: 'Test integrity report', sensitivity: 'Internal' },
  'audit.exported': { what: 'Audit log', sensitivity: 'Confidential' },
  'audit.export': { what: 'Audit log', sensitivity: 'Confidential' },
  'account.export.downloaded': { what: 'Company data export', sensitivity: 'Confidential' },
  'exports.log.downloaded': { what: 'Export log', sensitivity: 'Internal' },
};

@Injectable()
export class ExportLogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
  ) {}

  private async must(user: ScopeUser) {
    const v = await buildViewer(this.prisma, this.tenantPrisma, user, ['exports.log.view']);
    if (!has(v, 'exports.log.view') || v.actingForOther) throw new ForbiddenException('The export log needs exports.log.view.');
  }

  /** The last 500 exports (newest first), optionally from a day on. */
  async list(ctx: TenantContext, user: ScopeUser, from?: string) {
    await this.must(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const rows = await tx.auditLog.findMany({ where: { organizationId: c.organizationId, action: { in: Object.keys(EXPORT_ACTIONS) }, ...(from ? { createdAt: { gte: new Date(`${from}T00:00:00+05:30`) } } : {}) }, orderBy: { createdAt: 'desc' }, take: 500, select: { id: true, action: true, actorName: true, actorEmail: true, metadataJson: true, createdAt: true } });
      return rows.map((r) => {
        let meta: Record<string, unknown> = {};
        try {
          meta = r.metadataJson ? (JSON.parse(r.metadataJson) as Record<string, unknown>) : {};
        } catch {
          meta = {};
        }
        const a = EXPORT_ACTIONS[r.action]!;
        const rows_ = typeof meta.rows === 'number' ? meta.rows : typeof meta.count === 'number' ? meta.count : null;
        return { id: r.id, at: r.createdAt.toISOString(), who: r.actorName ?? r.actorEmail ?? 'System', what: a.what, detail: typeof meta.kind === 'string' ? meta.kind : typeof meta.report === 'string' ? meta.report : null, rows: rows_, sensitivity: a.sensitivity };
      });
    });
  }

  async csv(ctx: TenantContext, user: ScopeUser, from?: string) {
    const rows = await this.list(ctx, user, from);
    const cell = (v: string | number | null) => {
      const t = v == null ? '' : typeof v === 'string' && /^[=+\-@\t\r]/.test(v) ? `'${v}` : String(v);
      return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
    };
    await inCompany(this.tenantPrisma, ctx, (tx, c) => audit(tx, c, 'exports.log.downloaded', 'organization', c.organizationId, { rows: rows.length }));
    return [['When', 'Who', 'What', 'Detail', 'Rows', 'Sensitivity'], ...rows.map((r) => [r.at, r.who, r.what, r.detail, r.rows, r.sensitivity])].map((l) => l.map(cell).join(',')).join('\r\n') + '\r\n';
  }
}
