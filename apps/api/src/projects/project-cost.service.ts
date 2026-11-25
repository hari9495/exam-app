import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { audit, CompanyContext, inCompany, Tx } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { buildViewer, has, type ScopeUser } from '../access/scope';
import { settingFor } from '../people/probation';
import { NotificationsService } from '../notifications/notifications.service';
import { escapeHtml } from '../notifications/notification-email-render';
import { withPayScope } from '../payroll/pay-access';
import { lineApproved } from '../time/line-rules';
import { costShown, marginPct, monthCost, restatedFrom, type RateOf } from './cost';
import { quarterMonths } from './billing';
import { toCsv } from '../performance/calibration-rules';
import { BURN_OVER, BURN_WARN, burnLevel, ProjectsService } from './projects.service';

// Projects P-5 (PRJ-04, founder answers 1412, 1413, 1419, 1445). A nightly job with payroll access works out each
// project's cost per month and stores ONLY the project totals: approved hours times each person's cost rate for the
// month, or their last final rate (provisional) until that month's payroll is final, then restated. No session ever
// reads a person's rate. Project expenses (approved claim lines naming the project) add to the month. Only Projects
// finance sees cost, fee and margin; a project's manager sees totals for their own projects, hidden for a month with
// fewer people than the company's limit (default 2). The job also raises cost burn alerts against the cost budget (1445).

const iso = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
const asDate = (s: string) => new Date(`${s}T00:00:00Z`);
const plus = (s: string, n: number) => new Date(Date.parse(`${s}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const monthStart = (s: string) => `${s.slice(0, 7)}-01`;
const nextMonth = (m: string) => plus(`${m.slice(0, 7)}-28`, 4).slice(0, 7) + '-01';
const prevMonth = (m: string) => plus(m, -1).slice(0, 7) + '-01';
const rupees = (p: bigint | number) => (Number(p) / 100).toFixed(2);
const paiseOf = (d: { toString(): string } | null | undefined) => (d == null ? 0 : Math.round(Number(d.toString()) * 100));
const APPROVED_CLAIMS = ['approved', 'partly_approved', 'approved_unpaid', 'paid'];

@Injectable()
export class ProjectCostService {
  private readonly logger = new Logger(ProjectCostService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly notifications: NotificationsService,
    private readonly projects: ProjectsService,
  ) {}

  /* ---------------- the nightly job (payroll access; totals only) ---------------- */

  /** Months to (re)compute: the last three, and any older month still provisional. */
  private async months(tx: Tx, org: string, today: string) {
    const out = new Set<string>();
    let m = monthStart(today);
    for (let i = 0; i < 3; i++, m = prevMonth(m)) out.add(m);
    for (const r of await tx.projectCost.findMany({ where: { organizationId: org, basis: 'provisional' }, select: { month: true }, distinct: ['month'] })) out.add(iso(r.month)!);
    return [...out].sort();
  }

  /** Recompute one company's months; returns the restated rows. Runs as the company with the pay guard opened. */
  private async computeCompany(tx: Tx, c: CompanyContext, today: string) {
    const org = c.organizationId;
    const entities = (await tx.legalEntity.findMany({ where: { organizationId: org }, select: { id: true } })).map((e) => e.id);
    const projects = await tx.timesheetProject.findMany({ where: { organizationId: org }, select: { id: true } });
    const restated: { projectId: string; month: string; from: bigint; to: number }[] = [];
    for (const m of await this.months(tx, org, today)) {
      const end = plus(nextMonth(m), -1);
      const sheets = await tx.timesheet.findMany({ where: { organizationId: org, status: 'approved', weekStart: { gte: asDate(plus(m, -6)), lte: asDate(end) } }, select: { id: true, employeeId: true, weekStart: true } });
      const lines = sheets.length ? await tx.timesheetLine.findMany({ where: { organizationId: org, timesheetId: { in: sheets.map((s) => s.id) } } }) : [];
      // Minutes per project and person inside the month.
      const minutes = new Map<string, Map<string, number>>();
      for (const s of sheets) {
        const monday = iso(s.weekStart)!;
        for (const l of lines.filter((x) => x.timesheetId === s.id)) {
          lineApproved(l).forEach((mins, k) => {
            const on = plus(monday, k);
            if (on < m || on > end || !mins) return;
            const per = minutes.get(l.projectId) ?? new Map<string, number>();
            per.set(s.employeeId, (per.get(s.employeeId) ?? 0) + mins);
            minutes.set(l.projectId, per);
          });
        }
      }
      // P-6 (1416): corrections of a locked month count in the month they were made (an adjustment).
      for (const a of await tx.projectCorrection.findMany({ where: { organizationId: org, adjustment: true, effectiveMonth: asDate(m) } })) {
        const per = minutes.get(a.projectId) ?? new Map<string, number>();
        per.set(a.employeeId, (per.get(a.employeeId) ?? 0) + a.afterMinutes - a.beforeMinutes);
        minutes.set(a.projectId, per);
      }
      const people = [...new Set([...minutes.values()].flatMap((x) => [...x.keys()]))];
      // The only place a person's rate is read: inside the job, with the pay guard opened; it never leaves this function.
      const rates = await withPayScope(tx, entities, () => tx.employeeCostRate.findMany({ where: { organizationId: org, employeeId: { in: people }, periodStart: { lte: asDate(m) } }, select: { employeeId: true, periodStart: true, rate: true, provisional: true }, orderBy: { periodStart: 'desc' } }));
      const rateFor = (eid: string): RateOf | null => {
        const own = rates.find((r) => r.employeeId === eid && iso(r.periodStart) === m && !r.provisional);
        if (own) return { rate: Number(own.rate.toString()), final: true };
        const last = rates.find((r) => r.employeeId === eid && iso(r.periodStart)! < m && !r.provisional);
        return last ? { rate: Number(last.rate.toString()), final: false } : null;
      };
      // Project expenses: approved lines naming the project, spent in the month (1419).
      const exp = await tx.$queryRaw<{ project_id: string; total: string; rebill: string }[]>`
        SELECT l.project_id::text, coalesce(sum(coalesce(l.approved, l.claimed)), 0)::text AS total,
               coalesce(sum(CASE WHEN l.rebill THEN coalesce(l.approved, l.claimed) ELSE 0 END), 0)::text AS rebill
        FROM expense_lines l JOIN expense_claims c ON c.organization_id = l.organization_id AND c.id = l.claim_id
        WHERE l.organization_id = ${org}::uuid AND l.project_id IS NOT NULL AND l.removed_at IS NULL
          AND c.status = ANY(${APPROVED_CLAIMS}::text[]) AND l.spent_on BETWEEN ${m}::date AND ${end}::date
        GROUP BY 1`;
      const existing = await tx.projectCost.findMany({ where: { organizationId: org, month: asDate(m) } });
      for (const p of projects) {
        const per = minutes.get(p.id);
        const e = exp.find((x) => x.project_id === p.id);
        const prev = existing.find((x) => x.projectId === p.id) ?? null;
        if (!per && !e && !prev) continue;
        const cost = monthCost([...(per ?? new Map()).entries()].map(([employeeId, mins]) => ({ employeeId, minutes: mins })), rateFor);
        const from = restatedFrom(prev, cost);
        const data = { minutes: cost.minutes, people: cost.people, costPaise: BigInt(cost.costPaise), expensesPaise: BigInt(paiseOf(e?.total)), rebillPaise: BigInt(paiseOf(e?.rebill)), basis: cost.basis, restatedFromPaise: from, computedAt: new Date() };
        if (prev) await tx.projectCost.update({ where: { id: prev.id }, data });
        else await tx.projectCost.create({ data: { organizationId: org, projectId: p.id, month: asDate(m), ...data } });
        if (from != null && prev?.restatedFromPaise == null) {
          restated.push({ projectId: p.id, month: m, from, to: cost.costPaise });
          await audit(tx, c, 'projects.cost.restated', 'timesheet_project', p.id, { month: m.slice(0, 7), from: rupees(from), to: rupees(cost.costPaise) });
        }
      }
    }
    return restated;
  }

  /** Answer 1445: cost against the cost budget, alerted once per level to the manager (enough people) and Projects finance. */
  private async costAlerts(tx: Tx, c: CompanyContext) {
    const org = c.organizationId;
    const warn = Number(await settingFor(tx, c, BURN_WARN, { legalEntityId: '' }));
    const over = Number(await settingFor(tx, c, BURN_OVER, { legalEntityId: '' }));
    const minPeople = Number(await settingFor(tx, c, 'projects.cost.min_people', { legalEntityId: '' }));
    const projects = await tx.timesheetProject.findMany({ where: { organizationId: org, status: 'active', budgetCost: { gt: 0 } } });
    const out: { p: (typeof projects)[number]; level: number; cost: number; to: string[] }[] = [];
    for (const p of projects) {
      const rows = await tx.projectCost.findMany({ where: { organizationId: org, projectId: p.id }, orderBy: { month: 'desc' } });
      const cost = rows.reduce((t, r) => t + Number(r.costPaise + r.expensesPaise), 0) / 100;
      const level = burnLevel(cost, Number(p.budgetCost!.toString()), warn, over);
      if (level === p.costAlertedPct) continue;
      const { count } = await tx.timesheetProject.updateMany({ where: { id: p.id, costAlertedPct: p.costAlertedPct }, data: { costAlertedPct: level } });
      if (!count || level < p.costAlertedPct || level === 0) continue;
      await audit(tx, c, 'projects.cost.alert', 'timesheet_project', p.id, { level, cost: cost.toFixed(2), budgetCost: p.budgetCost!.toString() });
      const finance = await this.projects.financeHolders(tx, org);
      const pmSees = p.managerUserId && (rows[0]?.people ?? 0) >= minPeople;
      out.push({ p, level, cost, to: [...new Set([...finance, ...(pmSees ? [p.managerUserId!] : [])])] });
    }
    return out;
  }

  /** The nightly sweep (scheduled 02:20): every company with Projects on. Returns how many project-months were written. */
  async costSweep(only?: string[], today = todayIst()): Promise<{ companies: number; restated: number; alerts: number }> {
    const orgs = await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) => tx.timesheetProject.groupBy({ by: ['organizationId'], ...(only ? { where: { organizationId: { in: only } } } : {}) }));
    let companies = 0;
    let restated = 0;
    let alerts = 0;
    for (const { organizationId: org } of orgs) {
      const ctx: TenantContext = { organizationId: org, isSuperAdmin: false };
      try {
        const res = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
          if (!(await ProjectsService.on(tx, c))) return null;
          return { restated: await this.computeCompany(tx, c, today), alerts: await this.costAlerts(tx, c) };
        });
        if (!res) continue;
        companies++;
        restated += res.restated.length;
        for (const a of res.alerts) {
          const text = `${a.p.code} ${a.p.name}: cost ₹${a.cost.toLocaleString('en-IN', { maximumFractionDigits: 0 })} is ${Math.round((a.cost / Number(a.p.budgetCost!.toString())) * 100)}% of the cost budget.`;
          await this.notifications
            .notifySystem(ctx, a.to, 'projects.cost', { entityType: 'timesheet_project', entityId: a.p.id, contextText: text, linkPath: `/yx/projects/${a.p.id}` }, { subject: `Cost burn ${a.level}%: ${a.p.code}`, html: `<p>${escapeHtml(text)}</p>` })
            .catch((e: unknown) => this.logger.error(e));
          alerts++;
        }
      } catch (e) {
        this.logger.error(`Project cost failed for ${org}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return { companies, restated, alerts };
  }

  /* ---------------- reading (totals only) ---------------- */

  private async who(user: ScopeUser) {
    if (user.impersonatorUserId || user.actingSuperAdmin) throw new ForbiddenException('Not available while acting for someone else.');
    const v = await buildViewer(this.prisma, this.tenantPrisma, user, ['projects.finance']);
    return { userId: user.userId!, finance: has(v, 'projects.finance') };
  }

  /**
   * Revenue over months (P-6, answer 1621): every billing model's billed revenue, the issued project invoice lines
   * (taxable value) dated in the period, less credit notes.
   */
  private async revenue(tx: Tx, org: string, months: string[], projectIds: string[]) {
    const from = months[0]!;
    const end = plus(nextMonth(months[months.length - 1]!), -1);
    const rows = projectIds.length
      ? await tx.$queryRaw<{ project_id: string; total: string }[]>`
      SELECT l.project_id::text, sum(CASE WHEN i.kind = 'credit_note' THEN -l.amount_paise ELSE l.amount_paise END)::text AS total
      FROM staffing_invoice_lines l JOIN staffing_invoices i ON i.organization_id = l.organization_id AND i.id = l.invoice_id
      WHERE l.organization_id = ${org}::uuid AND l.project_id = ANY(${projectIds}::uuid[]) AND i.status = 'issued'
        AND i.invoice_date BETWEEN ${from}::date AND ${end}::date
      GROUP BY 1`
      : [];
    return new Map(rows.map((r) => [r.project_id, Number(r.total)]));
  }

  /** The period asked for: a month (YYYY-MM, default last month) or a quarter (YYYY-Qn, answer 1622). */
  private period(monthIn?: string, quarterIn?: string) {
    if (quarterIn) return { label: quarterIn, months: quarterMonths(quarterIn) };
    const m = monthStart(monthIn ?? prevMonth(monthStart(todayIst())));
    return { label: m.slice(0, 7), months: [m] };
  }

  /** PRJ-04: a month's projects. Projects finance: everything; a project's manager: their projects' totals only. */
  async month(ctx: TenantContext, user: ScopeUser, monthIn?: string, quarterIn?: string) {
    const w = await this.who(user);
    const period = this.period(monthIn, quarterIn);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      if (!(await ProjectsService.on(tx, c))) throw new ForbiddenException({ statusCode: 403, code: 'PROJECTS_OFF', message: 'Projects is switched off for your company.' });
      const org = c.organizationId;
      const managed = (await tx.timesheetProject.findMany({ where: { organizationId: org, managerUserId: w.userId }, select: { id: true } })).map((p) => p.id);
      if (!w.finance && !managed.length) throw new ForbiddenException('You do not have access to project cost.');
      const minPeople = Number(await settingFor(tx, c, 'projects.cost.min_people', { legalEntityId: '' }));
      const raw = await tx.projectCost.findMany({ where: { organizationId: org, month: { in: period.months.map(asDate) }, ...(w.finance ? {} : { projectId: { in: managed } }) } });
      // A quarter adds its months per project (people: the largest month; provisional if any month is).
      const rows = [...new Set(raw.map((r) => r.projectId))].map((pid) => {
        const rs = raw.filter((r) => r.projectId === pid);
        const sum = (k: 'costPaise' | 'expensesPaise' | 'rebillPaise') => rs.reduce((t, r) => t + r[k], 0n);
        return { projectId: pid, minutes: rs.reduce((t, r) => t + r.minutes, 0), people: Math.max(...rs.map((r) => r.people)), costPaise: sum('costPaise'), expensesPaise: sum('expensesPaise'), rebillPaise: sum('rebillPaise'), basis: rs.some((r) => r.basis === 'provisional') ? 'provisional' : 'final', restatedFromPaise: rs.length === 1 ? rs[0]!.restatedFromPaise : null };
      });
      const projects = await tx.timesheetProject.findMany({ where: { organizationId: org, id: { in: rows.map((r) => r.projectId) } }, select: { id: true, code: true, name: true, clientId: true, managerUserId: true, fee: true } });
      const clients = await tx.staffingClient.findMany({ where: { organizationId: org, id: { in: projects.map((p) => p.clientId).filter((x): x is string => Boolean(x)) } }, select: { id: true, name: true } });
      const managers = await tx.user.findMany({ where: { organizationId: org, id: { in: projects.map((p) => p.managerUserId).filter((x): x is string => Boolean(x)) } }, select: { id: true, name: true, email: true } });
      const revenue = w.finance ? await this.revenue(tx, org, period.months, projects.map((p) => p.id)) : new Map<string, number>();
      return {
        month: period.label,
        finance: w.finance,
        minPeople,
        rows: rows
          .map((r) => {
            const p = projects.find((x) => x.id === r.projectId)!;
            const shown = costShown({ finance: w.finance, manager: p.managerUserId === w.userId, people: r.people, minPeople });
            const mgr = managers.find((u) => u.id === p.managerUserId);
            const total = Number(r.costPaise + r.expensesPaise);
            const rev = revenue.get(p.id) ?? 0;
            return {
              projectId: p.id,
              code: p.code,
              name: p.name,
              client: clients.find((x) => x.id === p.clientId)?.name ?? null,
              manager: mgr ? mgr.name?.trim() || mgr.email : null,
              hours: Math.round((r.minutes / 60) * 10) / 10,
              people: r.people,
              hidden: !shown,
              cost: shown ? rupees(r.costPaise) : null,
              expenses: shown ? rupees(r.expensesPaise) : null,
              rebill: w.finance ? rupees(r.rebillPaise) : null,
              revenue: w.finance && rev ? rupees(rev) : null,
              margin: w.finance ? marginPct(rev, total) : null,
              basis: r.basis,
              restatedFrom: w.finance && r.restatedFromPaise != null ? rupees(r.restatedFromPaise) : null,
            };
          })
          .sort((a, b) => a.code.localeCompare(b.code)),
      };
    });
  }

  /** The workspace: one project's months (finance; or its manager, months with enough people only). */
  async project(ctx: TenantContext, user: ScopeUser, id: string) {
    const w = await this.who(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const p = await tx.timesheetProject.findFirst({ where: { organizationId: org, id } });
      if (!p) throw new NotFoundException('No such project.');
      const manager = p.managerUserId === w.userId;
      if (!w.finance && !manager) throw new ForbiddenException('You do not have access to project cost.');
      const minPeople = Number(await settingFor(tx, c, 'projects.cost.min_people', { legalEntityId: '' }));
      const rows = await tx.projectCost.findMany({ where: { organizationId: org, projectId: id }, orderBy: { month: 'asc' } });
      const visible = rows.filter((r) => costShown({ finance: w.finance, manager, people: r.people, minPeople }));
      const total = visible.reduce((t, r) => t + Number(r.costPaise + r.expensesPaise), 0);
      return {
        finance: w.finance,
        hiddenMonths: rows.length - visible.length,
        provisional: visible.some((r) => r.basis === 'provisional'),
        total: rupees(total),
        months: visible.map((r) => ({ month: iso(r.month)!.slice(0, 7), cost: rupees(r.costPaise), expenses: rupees(r.expensesPaise), basis: r.basis, restatedFrom: w.finance && r.restatedFromPaise != null ? rupees(r.restatedFromPaise) : null })),
      };
    });
  }

  /**
   * Answer 1622: the project cost journal for a month (Projects finance), for the accounting system: people cost moved
   * from payroll to each project, and project expenses from employee expenses, with the project as the cost centre.
   * Totals only (never a person's rate). Audited, like every finance export.
   */
  async journal(ctx: TenantContext, user: ScopeUser, monthIn: string) {
    const w = await this.who(user);
    if (!w.finance) throw new ForbiddenException('Only Projects finance exports the cost journal.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      if (!(await ProjectsService.on(tx, c))) throw new ForbiddenException({ statusCode: 403, code: 'PROJECTS_OFF', message: 'Projects is switched off for your company.' });
      const org = c.organizationId;
      const m = monthStart(monthIn);
      const end = plus(nextMonth(m), -1);
      const rows = await tx.projectCost.findMany({ where: { organizationId: org, month: asDate(m) } });
      const projects = await tx.timesheetProject.findMany({ where: { organizationId: org, id: { in: rows.map((r) => r.projectId) } }, select: { id: true, code: true, name: true } });
      const out: unknown[][] = [];
      for (const r of [...rows].sort((a, b) => (projects.find((p) => p.id === a.projectId)?.code ?? '').localeCompare(projects.find((p) => p.id === b.projectId)?.code ?? ''))) {
        const p = projects.find((x) => x.id === r.projectId)!;
        const v = `PRJ-${m.slice(0, 7)}-${p.code}`;
        const note = `${p.code} ${p.name}, ${m.slice(0, 7)}${r.basis === 'provisional' ? ' (provisional)' : ''}`;
        if (r.costPaise > 0n) out.push([end, v, 'Project cost: people', p.code, rupees(r.costPaise), '', note], [end, v, 'Payroll cost clearing', p.code, '', rupees(r.costPaise), note]);
        if (r.expensesPaise > 0n) out.push([end, v, 'Project cost: expenses', p.code, rupees(r.expensesPaise), '', note], [end, v, 'Employee expenses clearing', p.code, '', rupees(r.expensesPaise), note]);
      }
      await audit(tx, c, 'projects.cost.journal_exported', 'organization', org, { month: m.slice(0, 7), lines: out.length });
      return { filename: `project-cost-journal-${m.slice(0, 7)}.csv`, buffer: Buffer.from(toCsv(['Date', 'Voucher', 'Account', 'Cost centre', 'Debit', 'Credit', 'Narration'], out), 'utf8') };
    });
  }

  /** The workspace Expenses tab: approved and waiting lines naming the project (anyone who can open the project). */
  async expenses(ctx: TenantContext, user: ScopeUser, id: string) {
    const w = await this.who(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const p = await tx.timesheetProject.findFirst({ where: { organizationId: org, id } });
      if (!p) throw new NotFoundException('No such project.');
      const v = await buildViewer(this.prisma, this.tenantPrisma, user, ['projects.view', 'projects.manage', 'projects.resource']);
      if (!w.finance && p.managerUserId !== w.userId && !['projects.view', 'projects.manage', 'projects.resource'].some((k) => has(v, k))) throw new NotFoundException('No such project.');
      const lines = await tx.expenseLine.findMany({ where: { organizationId: org, projectId: id, removedAt: null }, orderBy: { spentOn: 'desc' }, take: 500 });
      const claims = await tx.expenseClaim.findMany({ where: { organizationId: org, id: { in: lines.map((l) => l.claimId) } }, select: { id: true, employeeId: true, status: true } });
      const live = lines.filter((l) => { const s = claims.find((x) => x.id === l.claimId)?.status; return s && s !== 'draft' && s !== 'rejected'; });
      const people = await tx.employee.findMany({ where: { organizationId: org, id: { in: claims.map((x) => x.employeeId) } }, select: { id: true, givenName: true, familyName: true, preferredName: true } });
      const cats = await tx.expenseCategory.findMany({ where: { organizationId: org, code: { in: lines.map((l) => l.categoryCode) } }, select: { code: true, name: true } });
      return live.map((l) => {
        const cl = claims.find((x) => x.id === l.claimId)!;
        const e = people.find((x) => x.id === cl.employeeId);
        return { id: l.id, person: e ? [e.preferredName ?? e.givenName, e.familyName].filter(Boolean).join(' ') : 'Employee', what: [cats.find((x) => x.code === l.categoryCode)?.name ?? l.categoryCode, l.description ?? l.merchant].filter(Boolean).join(' · '), spentOn: iso(l.spentOn), amount: (l.approved ?? l.claimed).toFixed(2), rebill: l.rebill, status: APPROVED_CLAIMS.includes(cl.status) ? 'Approved' : 'Pending' };
      });
    });
  }
}
