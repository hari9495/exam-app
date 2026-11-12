import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { audit, CompanyContext, inCompany, Tx } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { buildViewer, has, type ScopeUser } from '../access/scope';
import { settingFor } from '../people/probation';
import { NotificationsService } from '../notifications/notifications.service';
import { escapeHtml } from '../notifications/notification-email-render';
import { lineApproved } from '../time/line-rules';
import { lockedDates } from '../time/schedule';
import { ruleValues, StaffingBillingService } from '../staffing/billing.service';
import { StaffingService } from '../staffing/staffing.service';
import { toRupees } from '../staffing/staffing-rules';
import { correctionDocument, heldReason, hoursOf, minutesAmount, spreadMinutes } from './billing';
import { ProjectsService } from './projects.service';
import type { BillingDraftDto, CorrectionDto } from './dto';

// Projects P-6 (PRJ-05, PRJ-06; founder answers 1414 to 1416). One invoice engine (1414): the workbench lists the
// unbilled project work (time-and-material hours at the project's bill rate, fixed-fee milestones, monthly retainers,
// re-billed expenses) and makes drafts on the staffing desk's invoices, with each line naming its project; issued
// invoices live in the one Invoices list, the client portal, the PDF and the accounting export. project_billings keeps
// which item went on which invoice once (a unique source), so nothing is billed twice. 1415: the account manager's
// approval before finance issues is a company setting, off by default. 1416: correcting approved time makes a credit
// note (fewer billed hours) or a supplementary invoice (more), an adjustment in the current month when the week's month
// is locked, and pay recovery is a company setting (default none). Only Projects finance bills and corrects.

const iso = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
const asDate = (s: string) => new Date(`${s}T00:00:00Z`);
const plus = (s: string, n: number) => new Date(Date.parse(`${s}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const monthEnd = (m: string) => plus(plus(`${m.slice(0, 7)}-28`, 4).slice(0, 7) + '-01', -1);
const prevMonth = (m: string) => plus(`${m.slice(0, 7)}-01`, -1).slice(0, 7);
const APPROVED_CLAIMS = ['approved', 'partly_approved', 'approved_unpaid', 'paid'];
const SOURCE = { hours: 'Timesheet hours', milestone: 'Milestone', retainer: 'Retainer', expense: 'Expense rebill' } as const;
type SourceType = keyof typeof SOURCE;
const rupee = (p: bigint) => `₹${(Number(p) / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const nameOf = (e: { givenName: string | null; familyName: string | null; preferredName?: string | null } | undefined) => (e ? [e.preferredName ?? e.givenName, e.familyName].filter(Boolean).join(' ') : 'Employee');

/** One unbilled item of the workbench; `parts` are the sources it bills (each billed once). */
interface WipItem {
  id: string;
  type: SourceType;
  projectId: string;
  project: string;
  clientId: string | null;
  client: string;
  clientState: string;
  detail: string;
  minutes: number | null;
  ratePaise: bigint | null;
  amountPaise: bigint;
  held: string | null;
  parts: { sourceId: string; minutes: number | null; amountPaise: bigint }[];
  /** Answer 1734: the timesheet notes of the hours (finance reads them before billing). */
  notes?: string[];
}

@Injectable()
export class ProjectBillingService {
  private readonly logger = new Logger(ProjectBillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly notifications: NotificationsService,
    private readonly staffing: StaffingService,
    private readonly engine: StaffingBillingService,
  ) {}

  /** Projects finance only (never while acting); Projects switched on. */
  private async finance<T>(ctx: TenantContext, user: ScopeUser, fn: (tx: Tx, c: CompanyContext) => Promise<T>): Promise<T> {
    if (user.impersonatorUserId || user.actingSuperAdmin) throw new ForbiddenException('Not available while acting for someone else. Sign in as yourself.');
    const v = await buildViewer(this.prisma, this.tenantPrisma, user, ['projects.finance']);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      if (!(await ProjectsService.on(tx, c))) throw new ForbiddenException({ statusCode: 403, code: 'PROJECTS_OFF', message: 'Projects is switched off for your company.' });
      if (!has(v, 'projects.finance')) throw new ForbiddenException('Only Projects finance bills project work.');
      return fn(tx, c);
    });
  }

  /* ---------------- unbilled work (WIP) ---------------- */

  /** A line's minutes now: the latest correction's, else its approved minutes. */
  private current(line: Parameters<typeof lineApproved>[0], corrections: { lineId: string; afterMinutes: number; createdAt: Date }[]) {
    const last = corrections.filter((x) => x.lineId === (line as { id?: string }).id).sort((a, b) => +b.createdAt - +a.createdAt)[0];
    return last ? last.afterMinutes : lineApproved(line).reduce((s, m) => s + m, 0);
  }

  /** The month's billable work not yet billed (hours by their week's Monday, expenses by their date, the month's retainer) and every accepted milestone not yet billed. */
  private async wip(tx: Tx, org: string, month: string, only?: { projectId: string; allMonths: true }): Promise<WipItem[]> {
    const end = monthEnd(month);
    // The workspace Billing tab: one project, every month up to this one.
    const from = only ? '2000-01-01' : `${month.slice(0, 7)}-01`;
    const projects = await tx.timesheetProject.findMany({ where: { organizationId: org, billingModel: { not: 'non_billable' }, ...(only ? { id: only.projectId } : {}) } });
    if (!projects.length) return [];
    const clients = await tx.staffingClient.findMany({ where: { organizationId: org, id: { in: projects.map((p) => p.clientId).filter((x): x is string => Boolean(x)) } }, select: { id: true, name: true, state: true } });
    const billed = new Set((await tx.projectBilling.findMany({ where: { organizationId: org, projectId: { in: projects.map((p) => p.id) } }, select: { sourceType: true, sourceId: true } })).map((b) => `${b.sourceType}:${b.sourceId}`));
    const items: WipItem[] = [];
    const base = (p: (typeof projects)[number]) => {
      const cl = clients.find((x) => x.id === p.clientId);
      return { projectId: p.id, project: p.code, clientId: p.clientId, client: cl?.name ?? 'No client', clientState: cl?.state ?? '' };
    };

    // Time and material: approved lines (weeks counted in the month of their Monday) at the project's bill rate.
    const tm = projects.filter((p) => p.billingModel === 'time_material');
    if (tm.length) {
      const lines = await tx.timesheetLine.findMany({ where: { organizationId: org, projectId: { in: tm.map((p) => p.id) }, OR: [{ status: null }, { status: { in: ['approved', 'reduced', 'corrected'] } }] } });
      const sheets = await tx.timesheet.findMany({ where: { organizationId: org, id: { in: [...new Set(lines.map((l) => l.timesheetId))] }, status: 'approved', weekStart: { gte: asDate(from), lte: asDate(end) } }, select: { id: true, employeeId: true } });
      const open = lines.filter((l) => sheets.some((s) => s.id === l.timesheetId) && !billed.has(`hours:${l.id}`));
      const corrections = await tx.projectCorrection.findMany({ where: { organizationId: org, lineId: { in: open.map((l) => l.id) } }, select: { lineId: true, afterMinutes: true, createdAt: true } });
      const people = await tx.employee.findMany({ where: { organizationId: org, id: { in: [...new Set(sheets.map((s) => s.employeeId))] } }, select: { id: true, givenName: true, familyName: true, preferredName: true } });
      const groups = new Map<string, WipItem>();
      for (const l of open) {
        const mins = this.current(l, corrections);
        if (!mins) continue;
        const p = tm.find((x) => x.id === l.projectId)!;
        const eid = sheets.find((s) => s.id === l.timesheetId)!.employeeId;
        const held = heldReason({ clientId: p.clientId, clientStatus: p.clientApprovesHours ? l.clientStatus ?? 'waiting' : null, needsRate: true, ratePaise: p.billRatePaise });
        const key = `hours:${p.id}:${eid}${held ? ':held' : ''}`;
        const g = groups.get(key) ?? { id: key, type: 'hours' as const, ...base(p), detail: nameOf(people.find((x) => x.id === eid)), minutes: 0, ratePaise: p.billRatePaise, amountPaise: 0n, held, parts: [] };
        const amount = p.billRatePaise ? minutesAmount(mins, p.billRatePaise) : 0n;
        g.minutes! += mins;
        g.amountPaise += amount;
        g.parts.push({ sourceId: l.id, minutes: mins, amountPaise: amount });
        if (l.note?.trim()) (g.notes ??= []).push(l.note.trim());
        groups.set(key, g);
      }
      for (const g of groups.values()) items.push({ ...g, detail: `${g.detail}, ${hoursOf(g.minutes!)} h${g.ratePaise ? ` × ${rupee(g.ratePaise)}` : ''}` });
    }

    // Fixed fee: milestones accepted (ready) or completed and waiting for the client's acceptance (held).
    const ff = projects.filter((p) => p.billingModel === 'fixed_fee');
    if (ff.length) {
      const ms = await tx.projectMilestone.findMany({ where: { organizationId: org, projectId: { in: ff.map((p) => p.id) }, status: { in: ['completed', 'accepted', 'invoiced'] } }, orderBy: { dueOn: 'asc' } });
      for (const m of ms.filter((x) => !billed.has(`milestone:${x.id}`))) {
        const p = ff.find((x) => x.id === m.projectId)!;
        const fee = p.fee == null ? null : Number(p.fee.toString());
        const amount = fee ? BigInt(Math.round(fee * Number(m.pct.toString()))) : 0n; // fee × pct% in paise
        items.push({ id: `milestone:${m.id}`, type: 'milestone', ...base(p), detail: `${m.name} (${Number(m.pct.toString())}%)`, minutes: null, ratePaise: null, amountPaise: amount, held: heldReason({ clientId: p.clientId, milestoneStatus: m.status, needsFee: true, fee }), parts: [{ sourceId: m.id, minutes: null, amountPaise: amount }] });
      }
    }

    // Retainer: the project's monthly fee for this month, while the project runs.
    for (const p of projects.filter((x) => x.billingModel === 'retainer' && ['active', 'on_hold', 'closed'].includes(x.status))) {
      // shortcut: the Billing tab looks back at most 36 months, enough for a running retainer; widen if a client needs more.
      const months: string[] = [];
      for (let m = `${month.slice(0, 7)}-01`; months.length < (only ? 36 : 1) && m >= from; m = `${prevMonth(m)}-01`) months.unshift(m);
      for (const m of months) {
        const sid = `${p.id}:${m.slice(0, 7)}`;
        if (billed.has(`retainer:${sid}`)) continue;
        if ((p.startOn && iso(p.startOn)! > monthEnd(m)) || (p.endOn && iso(p.endOn)! < m)) continue;
        const fee = p.fee == null ? null : Number(p.fee.toString());
        const amount = fee ? BigInt(Math.round(fee * 100)) : 0n;
        const label = new Date(`${m}T00:00:00Z`).toLocaleString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
        items.push({ id: `retainer:${sid}`, type: 'retainer', ...base(p), detail: `${label} retainer`, minutes: null, ratePaise: null, amountPaise: amount, held: heldReason({ clientId: p.clientId, needsFee: true, fee }), parts: [{ sourceId: sid, minutes: null, amountPaise: amount }] });
      }
    }

    // Re-billed expenses (P-5, answer 1419): approved claim lines naming a billable project.
    const exp = await tx.$queryRaw<{ id: string; project_id: string; amount: string; spent_on: Date; what: string | null }[]>`
      SELECT l.id::text, l.project_id::text, coalesce(l.approved, l.claimed)::text AS amount, l.spent_on, coalesce(l.description, l.merchant, l.category_code) AS what
      FROM expense_lines l JOIN expense_claims c ON c.organization_id = l.organization_id AND c.id = l.claim_id
      WHERE l.organization_id = ${org}::uuid AND l.rebill AND l.removed_at IS NULL AND l.project_id = ANY(${projects.map((p) => p.id)}::uuid[])
        AND c.status = ANY(${APPROVED_CLAIMS}::text[]) AND l.spent_on BETWEEN ${from}::date AND ${end}::date
      ORDER BY l.spent_on`;
    for (const e of exp.filter((x) => !billed.has(`expense:${x.id}`))) {
      const p = projects.find((x) => x.id === e.project_id)!;
      const amount = BigInt(Math.round(Number(e.amount) * 100));
      if (!amount) continue;
      items.push({ id: `expense:${e.id}`, type: 'expense', ...base(p), detail: `${e.what ?? 'Expense'}, ${iso(e.spent_on)}`, minutes: null, ratePaise: null, amountPaise: amount, held: heldReason({ clientId: p.clientId }), parts: [{ sourceId: e.id, minutes: null, amountPaise: amount }] });
    }
    return items.sort((a, b) => a.client.localeCompare(b.client) || a.project.localeCompare(b.project) || a.id.localeCompare(b.id));
  }

  /** Draft project invoices: staffing invoices with a line naming a project, not yet issued. */
  private async drafts(tx: Tx, org: string) {
    const lines = await tx.staffingInvoiceLine.findMany({ where: { organizationId: org, projectId: { not: null }, invoice: { status: 'draft' } }, select: { invoiceId: true } });
    const invs = await tx.staffingInvoice.findMany({ where: { organizationId: org, id: { in: [...new Set(lines.map((l) => l.invoiceId))] } }, include: { lines: { orderBy: { position: 'asc' } } }, orderBy: { createdAt: 'asc' } });
    const clients = await tx.staffingClient.findMany({ where: { organizationId: org, id: { in: invs.map((i) => i.clientId) } }, select: { id: true, name: true } });
    const users = await tx.user.findMany({ where: { organizationId: org, id: { in: invs.map((i) => i.amApprovedBy).filter((x): x is string => Boolean(x)) } }, select: { id: true, name: true, email: true } });
    return invs.map((i) => {
      const u = users.find((x) => x.id === i.amApprovedBy);
      return {
        id: i.id,
        client: clients.find((x) => x.id === i.clientId)?.name ?? 'Client',
        createdAt: i.createdAt.toISOString(),
        lines: i.lines.map((l) => ({ description: l.description, amount: toRupees(l.amountPaise) })),
        taxable: toRupees(i.taxablePaise),
        cgst: toRupees(i.cgstPaise),
        sgst: toRupees(i.sgstPaise),
        igst: toRupees(i.igstPaise),
        total: toRupees(i.totalPaise),
        amApprovedBy: u ? u.name?.trim() || u.email : null,
        amApprovedAt: i.amApprovedAt?.toISOString() ?? null,
        version: i.version,
      };
    });
  }

  /**
   * PRJ-05: the month's unbilled work, the drafts made from it and the series to number from (Projects finance). An
   * account manager without Projects finance sees only the drafts to approve, when the company asks for it (1415).
   */
  async workbench(ctx: TenantContext, user: ScopeUser, monthIn?: string) {
    if (user.impersonatorUserId || user.actingSuperAdmin) throw new ForbiddenException('Not available while acting for someone else. Sign in as yourself.');
    const v = await buildViewer(this.prisma, this.tenantPrisma, user, ['projects.finance']);
    if (!has(v, 'projects.finance') && (await this.staffing.access(user)).manage) {
      const out = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
        if (!(await ProjectsService.on(tx, c))) throw new ForbiddenException({ statusCode: 403, code: 'PROJECTS_OFF', message: 'Projects is switched off for your company.' });
        const on = (await settingFor(tx, c, 'projects.billing.am_approval', { legalEntityId: '' })) === 'on';
        return { month: monthIn ?? prevMonth(todayIst()), approver: true, amApproval: on, series: [], wip: [], drafts: on ? await this.drafts(tx, c.organizationId) : [] };
      });
      return out;
    }
    return this.finance(ctx, user, async (tx, c) => {
      const org = c.organizationId;
      const month = monthIn ?? prevMonth(todayIst());
      const series = await tx.staffingInvoiceSeries.findMany({ where: { organizationId: org }, orderBy: [{ financialYear: 'desc' }, { prefix: 'asc' }] });
      return {
        month,
        approver: false,
        amApproval: (await settingFor(tx, c, 'projects.billing.am_approval', { legalEntityId: '' })) === 'on',
        series: series.map((s) => ({ id: s.id, label: `${s.prefix} · ${s.gstin} · ${s.financialYear}` })),
        wip: (await this.wip(tx, org, month)).map((w) => ({ id: w.id, client: w.client, clientState: w.clientState, project: w.project, projectId: w.projectId, source: SOURCE[w.type], detail: w.detail, hours: w.minutes == null ? null : hoursOf(w.minutes), amount: toRupees(w.amountPaise), held: w.held, notes: w.notes ?? [] })),
        drafts: await this.drafts(tx, org),
      };
    });
  }

  /** Drafts from the chosen items: one invoice per client on the staffing invoice engine; each source billed once. */
  draft(ctx: TenantContext, user: ScopeUser, dto: BillingDraftDto) {
    return this.finance(ctx, user, async (tx, c) => {
      const org = c.organizationId;
      const series = await tx.staffingInvoiceSeries.findFirst({ where: { id: dto.seriesId, organizationId: org } });
      if (!series) throw new BadRequestException('Choose an invoice series.');
      const wip = await this.wip(tx, org, dto.month);
      const ids = [...new Set(dto.items)];
      const chosen = wip.filter((w) => ids.includes(w.id));
      if (chosen.length !== ids.length) throw new ConflictException('Some of the chosen work is billed already or has changed. Reload the workbench.');
      const held = chosen.find((w) => w.held);
      if (held) throw new BadRequestException(`${held.project} · ${held.detail} is held: ${held.held}.`);
      const gst = await ruleValues<{ gstPct: string }>(tx, 'GST.STAFFING_RATE');
      const supplierState = await this.engine.supplierState(tx, series.gstin);
      const from = `${dto.month}-01`;
      const out: string[] = [];
      for (const clientId of [...new Set(chosen.map((w) => w.clientId!))]) {
        const lines = chosen.filter((w) => w.clientId === clientId);
        const client = await this.staffing.client(tx, c, clientId);
        const taxable = lines.reduce((s, l) => s + l.amountPaise, 0n);
        const t = this.engine.taxes(taxable, gst.gstPct, supplierState, client.state);
        const inv = await tx.staffingInvoice.create({
          data: {
            organizationId: org, clientId, seriesId: series.id, kind: 'staffing', periodStart: asDate(from), periodEnd: asDate(monthEnd(from)), supplierState, placeOfSupply: client.state, gstPct: gst.gstPct,
            taxablePaise: taxable, cgstPaise: t.cgst, sgstPaise: t.sgst, igstPaise: t.igst, totalPaise: t.total, po: dto.po?.trim() || null, createdBy: c.userId ?? null,
            lines: {
              create: lines.map((l, i) => ({
                organizationId: org, projectId: l.projectId, description: `${l.project} · ${SOURCE[l.type]} · ${l.detail}`.slice(0, 300),
                qtyCenti: l.minutes != null ? Math.round((l.minutes * 100) / 60) : 100, ratePaise: l.ratePaise ?? l.amountPaise, amountPaise: l.amountPaise, position: i + 1,
              })),
            },
          },
        });
        try {
          await tx.projectBilling.createMany({ data: lines.flatMap((l) => l.parts.map((p) => ({ organizationId: org, projectId: l.projectId, sourceType: l.type, sourceId: p.sourceId, invoiceId: inv.id, minutes: p.minutes, ratePaise: l.ratePaise, amountPaise: p.amountPaise }))) });
        } catch (e) {
          if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('Some of the chosen work was billed meanwhile. Reload the workbench.');
          throw e;
        }
        const milestones = lines.filter((l) => l.type === 'milestone').map((l) => l.parts[0]!.sourceId);
        if (milestones.length) await tx.projectMilestone.updateMany({ where: { organizationId: org, id: { in: milestones } }, data: { status: 'invoiced', version: { increment: 1 } } });
        out.push(inv.id);
      }
      await audit(tx, c, 'projects.billing.drafted', 'staffing_invoice_series', series.id, { month: dto.month, invoices: out, items: ids.length });
      return { ids: out };
    });
  }

  /** A project draft by id (404 for anything else). */
  private async projectDraft(tx: Tx, org: string, id: string) {
    const inv = await tx.staffingInvoice.findFirst({ where: { id, organizationId: org, lines: { some: { projectId: { not: null } } } } });
    if (!inv) throw new NotFoundException('No such project invoice.');
    return inv;
  }

  /** A draft goes away and its work is unbilled again (its billing rows go with it). */
  deleteDraft(ctx: TenantContext, user: ScopeUser, id: string) {
    return this.finance(ctx, user, async (tx, c) => {
      const inv = await this.projectDraft(tx, c.organizationId, id);
      if (inv.status !== 'draft') throw new ConflictException('An issued invoice is never deleted. Correct the hours to raise a credit note.');
      await tx.staffingInvoice.delete({ where: { id } });
      await audit(tx, c, 'projects.billing.draft_deleted', 'staffing_invoice', id, {});
      return { removed: true };
    });
  }

  /** Answer 1415: the account manager (Staffing desk manage key) approves a project draft when the company asks for it. */
  async approve(ctx: TenantContext, user: ScopeUser, id: string, version: number) {
    if (user.impersonatorUserId || user.actingSuperAdmin) throw new ForbiddenException('Not available while acting for someone else. Sign in as yourself.');
    const a = await this.staffing.access(user);
    if (!a.manage) throw new ForbiddenException('Only account managers approve project invoices.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      if (!(await ProjectsService.on(tx, c))) throw new ForbiddenException({ statusCode: 403, code: 'PROJECTS_OFF', message: 'Projects is switched off for your company.' });
      if ((await settingFor(tx, c, 'projects.billing.am_approval', { legalEntityId: '' })) !== 'on') throw new ConflictException('Your company does not ask the account manager to approve project invoices.');
      const inv = await this.projectDraft(tx, c.organizationId, id);
      if (inv.status !== 'draft') throw new ConflictException('This invoice is issued already.');
      if (inv.amApprovedAt) throw new ConflictException('This invoice is approved already.');
      const { count } = await tx.staffingInvoice.updateMany({ where: { id, version, status: 'draft' }, data: { amApprovedBy: c.userId ?? null, amApprovedAt: new Date(), version: { increment: 1 } } });
      if (!count) throw new ConflictException('Someone changed this invoice meanwhile. Reload it.');
      await audit(tx, c, 'projects.billing.am_approved', 'staffing_invoice', id, {});
      return { id, version: version + 1 };
    });
  }

  /** Finance issues a project draft through the one invoice engine (series number, e-invoice, portal, export). */
  issue(ctx: TenantContext, user: ScopeUser, id: string, version: number) {
    return this.finance(ctx, user, async (tx, c) => {
      await this.projectDraft(tx, c.organizationId, id);
      return this.engine.issueIn(tx, c, id, { version });
    });
  }

  /**
   * The workspace Billing tab (PRJ-01): one project's unbilled work (every month), the hours waiting for the client, what
   * was billed, and its invoices (links to Staffing desk › Invoices, never a copy). Projects finance and account managers.
   */
  async projectTab(ctx: TenantContext, user: ScopeUser, id: string) {
    if (user.impersonatorUserId || user.actingSuperAdmin) throw new ForbiddenException('Not available while acting for someone else. Sign in as yourself.');
    const v = await buildViewer(this.prisma, this.tenantPrisma, user, ['projects.finance']);
    if (!has(v, 'projects.finance') && !(await this.staffing.access(user)).manage) throw new ForbiddenException('Only Projects finance and account managers see project billing.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      if (!(await ProjectsService.on(tx, c))) throw new ForbiddenException({ statusCode: 403, code: 'PROJECTS_OFF', message: 'Projects is switched off for your company.' });
      const org = c.organizationId;
      const p = await tx.timesheetProject.findFirst({ where: { organizationId: org, id } });
      if (!p) throw new NotFoundException('No such project.');
      const wip = await this.wip(tx, org, todayIst(), { projectId: id, allMonths: true });
      const lines = await tx.staffingInvoiceLine.findMany({ where: { organizationId: org, projectId: id }, select: { invoiceId: true, amountPaise: true } });
      const invs = await tx.staffingInvoice.findMany({ where: { organizationId: org, id: { in: [...new Set(lines.map((l) => l.invoiceId))] } }, orderBy: [{ invoiceDate: { sort: 'desc', nulls: 'first' } }, { createdAt: 'desc' }] });
      const amountOf = (invoiceId: string) => lines.filter((l) => l.invoiceId === invoiceId).reduce((t, l) => t + l.amountPaise, 0n);
      const billed = invs.filter((i) => i.status === 'issued').reduce((t, i) => t + (i.kind === 'credit_note' ? -amountOf(i.id) : amountOf(i.id)), 0n);
      const ready = wip.filter((w) => !w.held);
      const waiting = wip.filter((w) => w.held === 'waiting for client approval');
      return {
        model: p.billingModel,
        fee: p.fee == null ? null : p.fee.toFixed(2),
        ready: toRupees(ready.reduce((t, w) => t + w.amountPaise, 0n)),
        readyHours: hoursOf(ready.reduce((t, w) => t + (w.minutes ?? 0), 0)),
        waitingHours: hoursOf(waiting.reduce((t, w) => t + (w.minutes ?? 0), 0)),
        billed: toRupees(billed),
        unbilled: wip.map((w) => ({ id: w.id, source: SOURCE[w.type], detail: w.detail, hours: w.minutes == null ? null : hoursOf(w.minutes), amount: toRupees(w.amountPaise), held: w.held })),
        invoices: invs.map((i) => ({ id: i.id, number: i.number, kind: i.kind === 'credit_note' ? 'Credit note' : 'Invoice', status: i.status, date: iso(i.invoiceDate), amount: toRupees(amountOf(i.id)) })),
      };
    });
  }

  /* ---------------- corrections (PRJ-06, answer 1416) ---------------- */

  private async lineFacts(tx: Tx, c: CompanyContext, lineId: string) {
    const org = c.organizationId;
    const line = await tx.timesheetLine.findFirst({ where: { organizationId: org, id: lineId } });
    if (!line) throw new NotFoundException('No such timesheet line.');
    const sheet = await tx.timesheet.findFirstOrThrow({ where: { organizationId: org, id: line.timesheetId } });
    if (sheet.status !== 'approved' || line.status === 'pending' || line.status === 'rejected') throw new ConflictException('Only approved time is corrected here. Time not yet approved changes on the timesheet.');
    const project = await tx.timesheetProject.findFirstOrThrow({ where: { organizationId: org, id: line.projectId } });
    const corrections = await tx.projectCorrection.findMany({ where: { organizationId: org, lineId }, orderBy: { createdAt: 'asc' } });
    const minutes = this.current(line, corrections);
    const billing = await tx.projectBilling.findFirst({ where: { organizationId: org, sourceType: 'hours', sourceId: lineId } });
    const invoice = billing ? await tx.staffingInvoice.findFirst({ where: { organizationId: org, id: billing.invoiceId } }) : null;
    const monday = iso(sheet.weekStart)!;
    const locked = (await lockedDates(tx, org, sheet.employeeId, monday, plus(monday, 6))).size > 0;
    const employee = await tx.employee.findFirst({ where: { organizationId: org, id: sheet.employeeId }, select: { id: true, userId: true, givenName: true, familyName: true, preferredName: true } });
    return { line, sheet, project, corrections, minutes, billing, invoice, monday, locked, employee };
  }

  /** The correctable lines of a time-and-material project in a month (weeks by their Monday), with what was billed. */
  lines(ctx: TenantContext, user: ScopeUser, projectId: string, month: string) {
    return this.finance(ctx, user, async (tx, c) => {
      const org = c.organizationId;
      const p = await tx.timesheetProject.findFirst({ where: { organizationId: org, id: projectId } });
      if (!p) throw new NotFoundException('No such project.');
      const sheets = await tx.timesheet.findMany({ where: { organizationId: org, status: 'approved', weekStart: { gte: asDate(`${month}-01`), lte: asDate(monthEnd(month)) } }, select: { id: true, employeeId: true, weekStart: true } });
      const lines = await tx.timesheetLine.findMany({ where: { organizationId: org, projectId, timesheetId: { in: sheets.map((s) => s.id) }, OR: [{ status: null }, { status: { in: ['approved', 'reduced', 'corrected'] } }] } });
      const corrections = await tx.projectCorrection.findMany({ where: { organizationId: org, lineId: { in: lines.map((l) => l.id) } }, select: { lineId: true, afterMinutes: true, createdAt: true } });
      const billings = await tx.projectBilling.findMany({ where: { organizationId: org, sourceType: 'hours', sourceId: { in: lines.map((l) => l.id) } } });
      const invoices = await tx.staffingInvoice.findMany({ where: { organizationId: org, id: { in: billings.map((b) => b.invoiceId) } }, select: { id: true, number: true, status: true } });
      const people = await tx.employee.findMany({ where: { organizationId: org, id: { in: sheets.map((s) => s.employeeId) } }, select: { id: true, givenName: true, familyName: true, preferredName: true } });
      return lines
        .map((l) => {
          const s = sheets.find((x) => x.id === l.timesheetId)!;
          const inv = invoices.find((i) => i.id === billings.find((b) => b.sourceId === l.id)?.invoiceId);
          return { lineId: l.id, person: nameOf(people.find((x) => x.id === s.employeeId)), week: iso(s.weekStart)!, hours: hoursOf(this.current(l, corrections)), invoice: inv ? { id: inv.id, number: inv.number, status: inv.status } : null, corrected: corrections.some((x) => x.lineId === l.id) };
        })
        .sort((a, b) => a.week.localeCompare(b.week) || a.person.localeCompare(b.person));
    });
  }

  /** PRJ-06: one line's facts before correcting it. */
  line(ctx: TenantContext, user: ScopeUser, lineId: string) {
    return this.finance(ctx, user, async (tx, c) => {
      const f = await this.lineFacts(tx, c, lineId);
      const org = c.organizationId;
      const m = `${f.monday.slice(0, 7)}-01`;
      const cost = await tx.projectCost.findFirst({ where: { organizationId: org, projectId: f.project.id, month: asDate(m) } });
      const revenue = await this.revenueOf(tx, org, f.project.id, m);
      const gst = f.invoice ? f.invoice.gstPct.toString() : (await ruleValues<{ gstPct: string }>(tx, 'GST.STAFFING_RATE')).gstPct;
      return {
        lineId,
        person: nameOf(f.employee ?? undefined),
        project: f.project.code,
        projectId: f.project.id,
        week: f.monday,
        hours: hoursOf(f.minutes),
        rate: toRupees(f.billing?.ratePaise ?? f.project.billRatePaise ?? 0n),
        gstPct: Number(gst),
        invoice: f.invoice ? { id: f.invoice.id, number: f.invoice.number, date: iso(f.invoice.invoiceDate), status: f.invoice.status } : null,
        locked: f.locked,
        recovery: (await settingFor(tx, c, 'projects.correction.pay_recovery', { legalEntityId: '' })) === 'next_payroll',
        month: m.slice(0, 7),
        monthRevenue: toRupees(revenue),
        monthCost: cost ? toRupees(cost.costPaise + cost.expensesPaise) : null,
        corrections: f.corrections.map((x) => ({ at: x.createdAt.toISOString(), from: hoursOf(x.beforeMinutes), to: hoursOf(x.afterMinutes), reason: x.reason, document: x.documentKind })),
      };
    });
  }

  /** Billed revenue of a project in a month: issued invoice lines less credit notes (answer 1621). */
  private async revenueOf(tx: Tx, org: string, projectId: string, m: string) {
    const r = await tx.$queryRaw<{ total: string | null }[]>`
      SELECT sum(CASE WHEN i.kind = 'credit_note' THEN -l.amount_paise ELSE l.amount_paise END)::text AS total
      FROM staffing_invoice_lines l JOIN staffing_invoices i ON i.organization_id = l.organization_id AND i.id = l.invoice_id
      WHERE l.organization_id = ${org}::uuid AND l.project_id = ${projectId}::uuid AND i.status = 'issued'
        AND i.invoice_date BETWEEN ${m}::date AND ${monthEnd(m)}::date`;
    return BigInt(r[0]?.total ?? '0');
  }

  /**
   * Answer 1416: correct approved time. An open month changes the line (status corrected, with the reason); a locked
   * month leaves it and records an adjustment in the current month. Billed time on an issued invoice makes a credit
   * note (fewer hours) or a supplementary draft (more); time on a draft waits for the draft. Pay recovery per the setting.
   */
  correct(ctx: TenantContext, user: ScopeUser, lineId: string, dto: CorrectionDto) {
    return this.finance(ctx, user, async (tx, c) => {
      const org = c.organizationId;
      const f = await this.lineFacts(tx, c, lineId);
      const after = Math.round(dto.hours * 60);
      if (after === f.minutes) throw new BadRequestException('The hours are the same. Enter the correct hours.');
      if (f.invoice && f.invoice.status === 'draft') throw new ConflictException(`These hours are on a draft invoice. Delete the draft in the billing workbench, or issue it first.`);
      const days = spreadMinutes(lineApproved(f.line), after);
      if (!days) throw new BadRequestException('The hours do not fit in the week.');
      const today = todayIst();
      const reason = dto.reason.trim();
      if (!f.locked) {
        const { count } = await tx.timesheetLine.updateMany({ where: { id: lineId, version: f.line.version }, data: { status: 'corrected', approvedMinutes: days, reason, decidedBy: c.userId ?? null, decidedAt: new Date(), version: { increment: 1 } } });
        if (!count) throw new ConflictException('Someone changed this line meanwhile. Reload it.');
      }
      const recovery = after < f.minutes && (await settingFor(tx, c, 'projects.correction.pay_recovery', { legalEntityId: '' })) === 'next_payroll' ? f.minutes - after : 0;
      const kind = correctionDocument(Boolean(f.invoice && f.invoice.status === 'issued'), f.minutes, after);
      const correction = await tx.projectCorrection.create({
        data: { organizationId: org, projectId: f.project.id, employeeId: f.sheet.employeeId, lineId, beforeMinutes: f.minutes, afterMinutes: after, adjustment: f.locked, effectiveMonth: asDate(f.locked ? `${today.slice(0, 7)}-01` : `${f.monday.slice(0, 7)}-01`), reason, documentKind: kind, recoveryMinutes: recovery, createdBy: c.userId ?? null },
      });
      let document: { kind: string; id: string; number: string | null } | null = null;
      if (kind) {
        const inv = f.invoice!;
        const rate = f.billing!.ratePaise ?? f.project.billRatePaise!;
        const amount = minutesAmount(Math.abs(after - f.minutes), rate);
        const text = `${f.project.code} · ${nameOf(f.employee ?? undefined)} · week of ${f.monday}: ${hoursOf(f.minutes)} h → ${hoursOf(after)} h. ${reason}`;
        if (kind === 'credit_note') {
          const cn = await this.engine.credit(tx, c, inv.id, amount, text, f.project.id);
          document = { kind, id: cn.id, number: cn.number };
        } else {
          const t = this.engine.taxes(amount, inv.gstPct.toString(), inv.supplierState, inv.placeOfSupply);
          const sup = await tx.staffingInvoice.create({
            data: {
              organizationId: org, clientId: inv.clientId, seriesId: inv.seriesId, kind: 'staffing', periodStart: inv.periodStart, periodEnd: inv.periodEnd, supplierState: inv.supplierState, placeOfSupply: inv.placeOfSupply, gstPct: inv.gstPct,
              taxablePaise: amount, cgstPaise: t.cgst, sgstPaise: t.sgst, igstPaise: t.igst, totalPaise: t.total, reason: `Supplementary to ${inv.number}`, po: inv.po, createdBy: c.userId ?? null,
              lines: { create: [{ organizationId: org, projectId: f.project.id, description: `Supplementary to ${inv.number}: ${text}`.slice(0, 300), qtyCenti: Math.round(((after - f.minutes) * 100) / 60), ratePaise: rate, amountPaise: amount, position: 1 }] },
            },
          });
          await tx.projectBilling.create({ data: { organizationId: org, projectId: f.project.id, sourceType: 'correction', sourceId: correction.id, invoiceId: sup.id, minutes: after - f.minutes, ratePaise: rate, amountPaise: amount } });
          document = { kind, id: sup.id, number: null };
        }
        await tx.projectCorrection.update({ where: { id: correction.id }, data: { documentId: document.id } });
      }
      await audit(tx, c, 'projects.time.corrected', 'timesheet_line', lineId, { projectId: f.project.id, from: hoursOf(f.minutes), to: hoursOf(after), adjustment: f.locked, document: document?.kind ?? null, documentId: document?.id ?? null, recoveryHours: hoursOf(recovery), reason });
      if (f.employee?.userId) {
        const msg = `Your ${f.project.code} hours for the week of ${f.monday} were corrected from ${hoursOf(f.minutes)} h to ${hoursOf(after)} h: ${reason}${recovery ? ` Pay for ${hoursOf(recovery)} h is recovered in the next payroll (company policy).` : ''}`;
        await this.notifications
          .notifySystem({ organizationId: org, isSuperAdmin: false }, [f.employee.userId], 'projects.correction', { entityType: 'timesheet_line', entityId: lineId, contextText: msg, linkPath: '/yx/time/timesheet' }, { subject: `Hours corrected: ${f.project.code}`, html: `<p>${escapeHtml(msg)}</p>` })
          .catch((e: unknown) => this.logger.error(e));
      }
      return { id: correction.id, adjustment: f.locked, document, recoveryHours: hoursOf(recovery) };
    });
  }
}
