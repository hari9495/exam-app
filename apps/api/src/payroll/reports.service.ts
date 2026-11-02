import { BadRequestException, ConflictException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { CompanyContext, Tx, audit, inCompany } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { addDays } from '../time/time-maths';
import { REPORTS_READ_ROLE } from '../access/role-templates';
import { settingFor } from '../people/probation';
import type { ScopeUser } from '../access/scope';
import { toCsv } from '../expenses/reports.service';
import { StatutoryRulesService } from '../statutory/statutory.service';
import { inForce, serviceYears } from '../statutory/evaluator';
import { ApprovalsEngine, type Notice } from '../workflow/approvals-engine.service';
import { entitiesFor, payScope, payViewer, requireSelf, roleGranters, systemAdmins } from './pay-access';

// PAY-25 payroll reports (RPT-PAY-01 … 12, APX-C §1.1): read only, from approved payslips and the payroll records they
// came from. One key, payroll.reports.view, scoped to legal entities; the database pay guard is opened to exactly those
// entities, so a query can never read another entity's pay. Every figure is added up in SQL (numeric, never floats) and
// leaves as a decimal string. Row reports are paged; the totals always cover every row of the filters. A CSV export
// holds the same rows (every page) and is audited.
//   register   one row per approved payslip in the months, one column per component (earnings, deductions, employer)
//   recon      the month against the month before (regular runs): people, gross, deductions, net, employer cost, and
//              the gross bridge: joiners, leavers, changes for people paid both months; the last six months as a trend
//   variance   people whose net pay changed by more than the company's threshold against their last paid month
//   ctc        cost to company by department: gross, employer contributions, total
//   arrears    approved arrears worksheets paid in the months
//   ytd        tax year (April to March) to the month: per person, months paid, gross, TDS, deductions and net
//   bank       approved, unheld, bank-mode payslips: IFSC, the last four digits of the salary account, amount, status
//   holds      salaries held today, by age and by reason
//   gratuity   per person paid in the month: service, the month's provision and the provision to date
//   loans      per loan: opening balance, recovered in the months and closing balance, from the system's own balance

export const PAY_REPORTS = ['register', 'recon', 'variance', 'ctc', 'arrears', 'ytd', 'bank', 'holds', 'gratuity', 'loans'] as const;
export type PayReportKind = (typeof PAY_REPORTS)[number];
const KEY = 'payroll.reports.view';
/** PAY-25: the approvals-engine type of a request for payroll reports access. */
const REPORTS_ACCESS = 'payroll.reports_access';
/** At most this many months in one report. */
const MAX_MONTHS = 36;
/** A CSV export holds at most this many rows (narrow the filters for more). */
const EXPORT_LIMIT = 50_000;
/** The variance compares with the last paid month within this many months. */
const LOOKBACK = 12;

export interface ReportQuery {
  legalEntityId?: string;
  from?: string;
  to?: string;
  departmentId?: string;
  locationId?: string;
}
interface Filters {
  org: string;
  entities: string[];
  legalEntityId: string | null;
  from: string;
  to: string;
  departmentId: string | null;
  locationId: string | null;
}
type Paging = { page: number; pageSize: number } | null;
type Cols = { key: string; label: string }[];
type Row = Record<string, string | number | boolean | null>;

const D = (x: Prisma.Decimal.Value | null | undefined) => new Prisma.Decimal(x ?? 0);
const money = (x: Prisma.Decimal.Value | null | undefined) => D(x).toFixed(2);
const day = (m: string) => `${m}-01`;
const addMonths = (m: string, n: number) => {
  const [y, mm] = m.split('-').map(Number);
  const t = y * 12 + mm - 1 + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
};
const monthsBetween = (a: string, b: string) => {
  const [y1, m1] = a.split('-').map(Number);
  const [y2, m2] = b.split('-').map(Number);
  return (y2 - y1) * 12 + (m2 - m1) + 1;
};
const monthEnd = (m: string) => {
  const [y, mm] = m.split('-').map(Number);
  return new Date(Date.UTC(y, mm, 0)).toISOString().slice(0, 10);
};
const month = (d: Date | string) => (typeof d === 'string' ? d : d.toISOString()).slice(0, 7);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const NAME = Prisma.sql`concat_ws(' ', e.given_name, e.family_name)`;

@Injectable()
export class PayReportsService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly statutory: StatutoryRulesService,
    private readonly engine: ApprovalsEngine,
  ) {}

  onModuleInit() {
    // PAY-25 NoAccess: asking for payroll reports access goes to someone who grants roles; they set it up in Roles & access.
    this.engine.register({
      key: REPORTS_ACCESS,
      label: 'Payroll reports access',
      risk: 'normal',
      autoActions: false,
      distinctSteps: true,
      onDecided: async (tx, req, outcome) => {
        const c = { organizationId: req.organizationId, isSuperAdmin: false } as CompanyContext;
        await audit(tx, c, `payroll.reports_access.${outcome}`, 'user', req.requesterUserId ?? req.subjectId, { requestId: req.id });
        if (outcome === 'approved') await this.grantReports(tx, c, req);
      },
      requesterLink: () => '/yx/payroll/reports',
    });
  }

  /**
   * Founder answer 2 (2 Nov 2026): an approved request gives the requester a read-only payroll reports role for the legal
   * entity asked for, from today for the company's number of days (setting payroll.reports_access.days, default 90). It is
   * an ordinary role grant: it ends by itself, shows in Roles & access with its end date, and can be ended there early.
   */
  private async grantReports(tx: Tx, c: CompanyContext, req: Prisma.WfRequestGetPayload<object>) {
    const org = c.organizationId;
    // The request's subject is the legal entity asked for (older requests named the person: nothing to grant).
    const entityId = req.subjectType === 'legal_entity' ? req.subjectId : null;
    if (!entityId || !req.requesterUserId) return;
    const by = (await tx.wfAction.findFirst({ where: { organizationId: org, requestId: req.id, action: { in: ['approved', 'self_approved'] } }, orderBy: { createdAt: 'desc' }, select: { actorUserId: true } }))?.actorUserId ?? null;
    const days = Number(await settingFor(tx, c, 'payroll.reports_access.days', { legalEntityId: entityId }));
    const today = todayIst();
    const validTo = addDays(today, days - 1);
    const role = await this.reportsRole(tx, org);
    const grant = await tx.roleGrant.create({
      data: { organizationId: org, userId: req.requesterUserId, permissionProfileId: role, scopeType: 'legal_entity', legalEntityId: entityId, validFrom: new Date(`${today}T00:00:00Z`), validTo: new Date(`${validTo}T00:00:00Z`), status: 'active', reason: `Payroll reports access asked for and approved (request ${req.id}).`, grantedBy: null, decidedBy: by, decidedAt: new Date() },
    });
    await audit(tx, { ...c, userId: by } as CompanyContext, 'access.grant.created', 'role_grant', grant.id, { userId: req.requesterUserId, role: 'Payroll reports (read only)', scopeType: 'legal_entity', legalEntityId: entityId, validFrom: today, validTo, days, status: 'active', reportsAccessRequestId: req.id });
  }

  /** The company role these grants use (payroll.reports.view only), made once. */
  private async reportsRole(tx: Tx, org: string): Promise<string> {
    const keys = JSON.stringify(['payroll.reports.view']);
    const found = await tx.permissionProfile.findFirst({ where: { organizationId: org, templateKey: REPORTS_READ_ROLE }, select: { id: true } });
    if (found) return found.id;
    return (await tx.permissionProfile.create({ data: { organizationId: org, name: 'Payroll reports (read only, on request)', permissionsJson: keys, templateKey: REPORTS_READ_ROLE, templateChecked: true } })).id;
  }

  /** PAY-25: the person's latest request for payroll reports access (none = null), with the access it gave. */
  async myAccessRequest(ctx: TenantContext, user: ScopeUser) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const r = await tx.wfRequest.findFirst({ where: { organizationId: c.organizationId, requestType: REPORTS_ACCESS, requesterUserId: v.userId! }, orderBy: { createdAt: 'desc' }, select: { id: true, status: true, createdAt: true, subjectType: true, subjectId: true } });
      if (!r) return null;
      const entityId = r.subjectType === 'legal_entity' ? r.subjectId : null;
      const entity = entityId ? await tx.legalEntity.findFirst({ where: { organizationId: c.organizationId, id: entityId }, select: { name: true } }) : null;
      const g = r.status === 'approved' ? await tx.roleGrant.findFirst({ where: { organizationId: c.organizationId, userId: v.userId!, reason: { contains: r.id } }, select: { validTo: true, status: true } }) : null;
      return { id: r.id, status: r.status, askedAt: r.createdAt, legalEntity: entity?.name ?? null, ...(g ? { grant: { validTo: g.validTo!.toISOString().slice(0, 10), status: g.validTo! < new Date(`${todayIst()}T00:00:00Z`) ? 'ended' : g.status } } : {}) };
    });
  }

  /**
   * PAY-25 "Request access": through the approvals engine to the people who grant roles (access.role.manage; a System
   * Admin when nobody holds it), never the requester. One open request at a time; the reason is kept and audited.
   */
  async requestAccess(ctx: TenantContext, user: ScopeUser, reason: string, legalEntityId?: string) {
    const v = await this.viewer(user);
    if (v.grants.has('payroll.reports.view')) throw new ConflictException('You already have payroll reports access.');
    const notices: Notice[] = [];
    const out = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const me = v.userId!;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`reports-access:${me}`}))`;
      if (await tx.wfRequest.findFirst({ where: { organizationId: org, requestType: REPORTS_ACCESS, requesterUserId: me, status: 'pending' } })) throw new ConflictException('Your request for payroll reports access is already waiting for approval.');
      const granters = (await roleGranters(tx, org)).filter((u) => u !== me);
      const approvers = granters.length ? granters : (await systemAdmins(tx, org)).filter((u) => u !== me);
      if (!approvers.length) throw new BadRequestException('No one else can give this access. Ask your System Admin.');
      const who = await tx.user.findFirst({ where: { organizationId: org, id: me }, select: { name: true, email: true } });
      // Founder answer 2: scoped to what was asked: the entity named, else the entity of the person's current job.
      const today = todayIst();
      const own = legalEntityId
        ? null
        : await tx.employeeAssignment.findFirst({
            where: { organizationId: org, supersededAt: null, validFrom: { lte: new Date(`${today}T00:00:00Z`) }, OR: [{ validTo: null }, { validTo: { gte: new Date(`${today}T00:00:00Z`) } }], employeeId: { in: (await tx.employee.findMany({ where: { organizationId: org, userId: me }, select: { id: true } })).map((e) => e.id) } },
            orderBy: { validFrom: 'desc' },
            select: { legalEntityId: true },
          });
      const entityId = legalEntityId ?? own?.legalEntityId ?? null;
      const entity = entityId ? await tx.legalEntity.findFirst({ where: { organizationId: org, id: entityId }, select: { id: true, name: true } }) : null;
      if (!entity) { if (legalEntityId) throw new NotFoundException('Not found'); throw new BadRequestException('Say which legal entity you need payroll reports for.'); }
      const days = await settingFor(tx, c, 'payroll.reports_access.days', { legalEntityId: entity.id });
      const sub = await this.engine.submit(tx, c, {
        type: REPORTS_ACCESS,
        subjectType: 'legal_entity',
        subjectId: entity.id,
        title: `Payroll reports access for ${who?.name || who?.email || 'a colleague'}`,
        summary: [
          { label: 'Asked for', value: `Payroll reports (read only), ${entity.name}` },
          { label: 'Why', value: reason.slice(0, 300) },
          { label: 'If you approve', value: `The access is given at once for ${days} days and ends by itself (Roles & access shows it).` },
        ],
        subjectPersonId: null,
        requesterUserId: me,
        raisedByUserId: me,
        steps: [{ name: 'Access', approvers: [{ kind: 'users', userIds: approvers }], mode: 'any', remindAfterHours: 48 }],
        payload: {},
        payloadFields: [],
        fallbackUserIds: [],
      });
      notices.push(...sub.notices);
      await audit(tx, c, 'payroll.reports_access.requested', 'user', me, { requestId: sub.id, reason, legalEntityId: entity.id });
      return { id: sub.id, status: 'pending' };
    });
    await this.engine.send(ctx, notices);
    return out;
  }

  private async viewer(user: ScopeUser) {
    const v = await payViewer(this.prisma, this.tenantPrisma, user);
    requireSelf(v);
    return v;
  }

  /** The entities the key reaches, the pay guard opened to them. */
  private async reach(tx: Tx, c: CompanyContext, user: Awaited<ReturnType<PayReportsService['viewer']>>) {
    const ents = await entitiesFor(tx, c, user, KEY);
    await payScope(tx, ents);
    return ents;
  }

  /** The filter choices: entities in scope, departments, their locations and the months that have approved payslips. */
  async options(ctx: TenantContext, user: ScopeUser) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const ents = await this.reach(tx, c, v);
      const [entities, departments, locations, months] = await Promise.all([
        tx.legalEntity.findMany({ where: { organizationId: org, id: { in: ents }, archivedAt: null }, select: { id: true, name: true, shortName: true }, orderBy: { name: 'asc' } }),
        tx.department.findMany({ where: { organizationId: org, archivedAt: null }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
        tx.location.findMany({ where: { organizationId: org, legalEntityId: { in: ents }, archivedAt: null }, select: { id: true, name: true, legalEntityId: true }, orderBy: { name: 'asc' } }),
        tx.$queryRaw<{ m: string }[]>`
          SELECT DISTINCT to_char(period_start, 'YYYY-MM') AS m FROM payslips
          WHERE organization_id = ${org}::uuid AND legal_entity_id = ANY(${ents}::uuid[]) AND status = 'approved'
          ORDER BY 1 DESC LIMIT ${MAX_MONTHS}`,
      ]);
      return { entities, departments, locations, months: months.map((r) => r.m), today: todayIst() };
    });
  }

  /** A report as JSON (one page of rows when paged). */
  async report(ctx: TenantContext, user: ScopeUser, kind: PayReportKind, q: ReportQuery, paging: Paging) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const f = await this.filters(tx, c, v, q);
      const out = await this.build(tx, c, kind, f, paging);
      return { ...out.data, filters: this.publicFilters(f) };
    });
  }

  /** Every row of a report as CSV, with the same scope and filters; audited. */
  async exportCsv(ctx: TenantContext, user: ScopeUser, kind: PayReportKind, q: ReportQuery) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const f = await this.filters(tx, c, v, q);
      const out = await this.build(tx, c, kind, f, null);
      if (out.rows.length > EXPORT_LIMIT) throw new BadRequestException(`This export has more than ${EXPORT_LIMIT.toLocaleString('en-IN')} rows. Choose fewer months or one legal entity.`);
      await audit(tx, c, 'payroll.report.exported', 'payroll_report', kind, { ...this.publicFilters(f), rows: out.rows.length });
      const range = kind === 'holds' ? todayIst() : f.from === f.to ? f.to : `${f.from}-to-${f.to}`;
      return { file: Buffer.from(toCsv({ columns: out.columns, rows: out.rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, x]) => [k, typeof x === 'boolean' ? (x ? 'Yes' : 'No') : x]))) }), 'utf8'), name: `payroll-${kind}-${range}.csv` };
    });
  }

  private publicFilters(f: Filters) {
    return { legalEntityId: f.legalEntityId, from: f.from, to: f.to, departmentId: f.departmentId, locationId: f.locationId };
  }

  private async filters(tx: Tx, c: CompanyContext, v: Awaited<ReturnType<PayReportsService['viewer']>>, q: ReportQuery): Promise<Filters> {
    const org = c.organizationId;
    const reach = await this.reach(tx, c, v);
    // Another entity, or one in another company, is "not found" (never revealing it exists).
    if (q.legalEntityId && !reach.includes(q.legalEntityId)) throw new NotFoundException('Not found');
    if (q.departmentId && !(await tx.department.findFirst({ where: { organizationId: org, id: q.departmentId }, select: { id: true } }))) throw new NotFoundException('Not found');
    if (q.locationId && !(await tx.location.findFirst({ where: { organizationId: org, id: q.locationId, legalEntityId: { in: reach } }, select: { id: true } }))) throw new NotFoundException('Not found');
    const entities = q.legalEntityId ? [q.legalEntityId] : reach;
    let to = q.to ?? q.from;
    if (!to) {
      const [last] = await tx.$queryRaw<{ m: string | null }[]>`
        SELECT to_char(max(period_start), 'YYYY-MM') AS m FROM payslips WHERE organization_id = ${org}::uuid AND legal_entity_id = ANY(${entities}::uuid[]) AND status = 'approved'`;
      // No approved payslips in scope yet: last month (the page shows the same default).
      to = last?.m ?? addMonths(todayIst().slice(0, 7), -1);
    }
    const from = q.from ?? to;
    if (from > to) throw new BadRequestException('The first month is after the last month.');
    if (monthsBetween(from, to) > MAX_MONTHS) throw new BadRequestException(`Choose at most ${MAX_MONTHS} months.`);
    return { org, entities, legalEntityId: q.legalEntityId ?? null, from, to, departmentId: q.departmentId ?? null, locationId: q.locationId ?? null };
  }

  // ------------------------------------------------------------------------------------------ SQL pieces

  /** The person's assignment on a day (latest dated one from that day or before). */
  private asg(f: Filters, employment: Prisma.Sql, on: Prisma.Sql) {
    return Prisma.sql`LEFT JOIN LATERAL (
      SELECT a.department_id, a.location_id, a.employment_type_id FROM employee_assignments a
      WHERE a.organization_id = ${f.org}::uuid AND a.employment_id = ${employment} AND a.superseded_at IS NULL AND a.valid_from <= ${on}
      ORDER BY a.valid_from DESC LIMIT 1) asg ON true`;
  }

  /** The department (with the departments under it) and location filters on `asg`. */
  private where(f: Filters) {
    return Prisma.sql`
      AND (${f.departmentId}::uuid IS NULL OR asg.department_id IN (
        SELECT d.id FROM departments d WHERE d.organization_id = ${f.org}::uuid
          AND d.path LIKE (SELECT d2.path FROM departments d2 WHERE d2.organization_id = ${f.org}::uuid AND d2.id = ${f.departmentId}::uuid) || '%'))
      AND (${f.locationId}::uuid IS NULL OR asg.location_id = ${f.locationId}::uuid)`;
  }

  /** Approved payslips in the months and filters, with the person's department, location and employment type. */
  private slips(f: Filters, from: string, to: string, regularOnly = false) {
    return Prisma.sql`s AS (
      SELECT p.id, p.employment_id, p.employee_id, p.legal_entity_id, p.period_start, p.sub_period, p.run_type, p.gross, p.deductions, p.net,
             p.employer_cost, p.held, p.payment_status, asg.department_id, asg.location_id, asg.employment_type_id
      FROM payslips p
      ${this.asg(f, Prisma.sql`p.employment_id`, Prisma.sql`(p.period_start + interval '1 month' - interval '1 day')::date`)}
      WHERE p.organization_id = ${f.org}::uuid AND p.legal_entity_id = ANY(${f.entities}::uuid[]) AND p.status = 'approved'
        AND p.period_start >= ${day(from)}::date AND p.period_start <= ${day(to)}::date
        ${regularOnly ? Prisma.sql`AND p.run_type = 'regular'` : Prisma.empty}
        ${this.where(f)}
    )`;
  }

  /** Component codes the company maps to a statutory line, plus the default code. */
  private codesOf(f: Filters, statutory: string) {
    return Prisma.sql`(SELECT lower(pc.code::text) FROM pay_components pc WHERE pc.organization_id = ${f.org}::uuid AND pc.statutory = ${statutory} UNION SELECT ${statutory})`;
  }

  private page(p: Paging) {
    return p ? Prisma.sql`LIMIT ${p.pageSize} OFFSET ${(p.page - 1) * p.pageSize}` : Prisma.sql`LIMIT ${EXPORT_LIMIT + 1}`;
  }

  private paged(p: Paging, total: number) {
    return p ? { total, page: p.page, pageSize: p.pageSize } : { total, page: 1, pageSize: total };
  }

  // ------------------------------------------------------------------------------------------ the reports

  private async build(tx: Tx, c: CompanyContext, kind: PayReportKind, f: Filters, p: Paging): Promise<{ data: Record<string, unknown>; columns: Cols; rows: Row[] }> {
    switch (kind) {
      case 'register':
        return this.register(tx, f, p);
      case 'recon':
        return this.recon(tx, f);
      case 'variance':
        return this.variance(tx, c, f, p);
      case 'ctc':
        return this.ctc(tx, f);
      case 'arrears':
        return this.arrears(tx, f, p);
      case 'ytd':
        return this.ytd(tx, f, p);
      case 'bank':
        return this.bank(tx, f, p);
      case 'holds':
        return this.holds(tx, f, p);
      case 'gratuity':
        return this.gratuity(tx, f, p);
      case 'loans':
        return this.loans(tx, f, p);
    }
  }

  private async register(tx: Tx, f: Filters, p: Paging) {
    const s = this.slips(f, f.from, f.to);
    const [[sum], comps, rows] = await Promise.all([
      tx.$queryRaw<{ n: number; gross: string; deductions: string; net: string; employer: string }[]>`
        WITH ${s} SELECT count(*)::int AS n, coalesce(sum(gross), 0)::text AS gross, coalesce(sum(deductions), 0)::text AS deductions,
          coalesce(sum(net), 0)::text AS net, coalesce(sum(employer_cost), 0)::text AS employer FROM s`,
      tx.$queryRaw<{ code: string; name: string; kind: string; amount: string }[]>`
        WITH ${s} SELECT l.component_code AS code, min(l.name) AS name, min(l.kind) AS kind, sum(l.amount)::text AS amount
        FROM s JOIN payslip_lines l ON l.organization_id = ${f.org}::uuid AND l.payslip_id = s.id
        WHERE l.kind IN ('earning', 'deduction', 'employer', 'reimbursement')
        GROUP BY l.component_code
        ORDER BY array_position(ARRAY['earning', 'reimbursement', 'deduction', 'employer'], min(l.kind)), min(l.position), l.component_code`,
      tx.$queryRaw<{ id: string; employee_id: string; name: string; code: string; department: string | null; m: string; run_type: string; gross: string; deductions: string; net: string; employer: string }[]>`
        WITH ${s} SELECT s.id::text, s.employee_id::text, ${NAME} AS name, em.employee_code::text AS code, d.name::text AS department,
          to_char(s.period_start, 'YYYY-MM') AS m, s.run_type, s.gross::text, s.deductions::text, s.net::text, s.employer_cost::text AS employer
        FROM s JOIN employments em ON em.organization_id = ${f.org}::uuid AND em.id = s.employment_id
        JOIN employees e ON e.organization_id = ${f.org}::uuid AND e.id = s.employee_id
        LEFT JOIN departments d ON d.organization_id = ${f.org}::uuid AND d.id = s.department_id
        ORDER BY name, em.employee_code, s.period_start, s.sub_period, s.id ${this.page(p)}`,
    ]);
    const lines = rows.length
      ? await tx.$queryRaw<{ payslip_id: string; code: string; amount: string }[]>`
          SELECT payslip_id::text, component_code AS code, sum(amount)::text AS amount FROM payslip_lines
          WHERE organization_id = ${f.org}::uuid AND payslip_id = ANY(${rows.map((r) => r.id)}::uuid[]) AND kind IN ('earning', 'deduction', 'employer', 'reimbursement')
          GROUP BY 1, 2`
      : [];
    const by = new Map<string, Record<string, string>>();
    for (const l of lines) by.set(l.payslip_id, { ...(by.get(l.payslip_id) ?? {}), [l.code]: money(l.amount) });
    const out = rows.map((r) => ({ id: r.id, employeeId: r.employee_id, name: r.name, code: r.code, department: r.department, month: r.m, runType: r.run_type, gross: money(r.gross), deductions: money(r.deductions), net: money(r.net), employerCost: money(r.employer), lines: by.get(r.id) ?? {} }));
    const components = comps.map((x) => ({ code: x.code, name: x.name, kind: x.kind }));
    const columns: Cols = [
      { key: 'name', label: 'Employee' },
      { key: 'code', label: 'Code' },
      { key: 'department', label: 'Department' },
      { key: 'month', label: 'Month' },
      { key: 'runType', label: 'Run' },
      ...components.map((x) => ({ key: `c:${x.code}`, label: x.name })),
      { key: 'gross', label: 'Gross' },
      { key: 'deductions', label: 'Deductions' },
      { key: 'net', label: 'Net' },
      { key: 'employerCost', label: 'Cost to company' },
    ];
    const flat = out.map(({ lines: ls, ...r }) => ({ ...r, ...Object.fromEntries(components.map((x) => [`c:${x.code}`, ls[x.code] ?? '0.00'])) }));
    return {
      data: { kind: 'register', components, rows: out, totals: { gross: money(sum.gross), deductions: money(sum.deductions), net: money(sum.net), employerCost: money(sum.employer), lines: Object.fromEntries(comps.map((x) => [x.code, money(x.amount)])) }, ...this.paged(p, sum.n) },
      columns,
      rows: flat,
    };
  }

  private async recon(tx: Tx, f: Filters) {
    const cur = f.to;
    const prev = addMonths(cur, -1);
    const [months, [b], trend] = await Promise.all([
      tx.$queryRaw<{ m: string; people: number; gross: string; deductions: string; net: string; employer: string }[]>`
        WITH ${this.slips(f, prev, cur, true)} SELECT to_char(period_start, 'YYYY-MM') AS m, count(DISTINCT employment_id)::int AS people, sum(gross)::text AS gross,
          sum(deductions)::text AS deductions, sum(net)::text AS net, sum(employer_cost)::text AS employer FROM s GROUP BY 1`,
      tx.$queryRaw<{ joiners: number; joiners_gross: string; leavers: number; leavers_gross: string; changed: number; changed_gross: string }[]>`
        WITH ${this.slips(f, prev, cur, true)},
        per AS (SELECT employment_id, period_start, sum(gross) AS g FROM s GROUP BY 1, 2),
        a AS (SELECT * FROM per WHERE period_start = ${day(prev)}::date),
        b AS (SELECT * FROM per WHERE period_start = ${day(cur)}::date)
        SELECT count(*) FILTER (WHERE a.employment_id IS NULL)::int AS joiners, coalesce(sum(b.g) FILTER (WHERE a.employment_id IS NULL), 0)::text AS joiners_gross,
          count(*) FILTER (WHERE b.employment_id IS NULL)::int AS leavers, coalesce(sum(a.g) FILTER (WHERE b.employment_id IS NULL), 0)::text AS leavers_gross,
          count(*) FILTER (WHERE a.employment_id IS NOT NULL AND b.employment_id IS NOT NULL AND a.g <> b.g)::int AS changed,
          coalesce(sum(b.g - a.g) FILTER (WHERE a.employment_id IS NOT NULL AND b.employment_id IS NOT NULL), 0)::text AS changed_gross
        FROM a FULL JOIN b ON a.employment_id = b.employment_id`,
      tx.$queryRaw<{ m: string; gross: string; net: string }[]>`
        WITH ${this.slips(f, addMonths(cur, -5), cur, true)} SELECT to_char(period_start, 'YYYY-MM') AS m, sum(gross)::text AS gross, sum(net)::text AS net FROM s GROUP BY 1 ORDER BY 1`,
    ]);
    const at = (m: string) => months.find((x) => x.m === m);
    const [pa, cu] = [at(prev), at(cur)];
    const item = (key: string, label: string, a: Prisma.Decimal.Value | undefined, c: Prisma.Decimal.Value | undefined, isMoney = true) => ({
      item: key,
      label,
      previous: isMoney ? money(a) : String(a ?? 0),
      current: isMoney ? money(c) : String(c ?? 0),
      difference: isMoney ? D(c).sub(D(a)).toFixed(2) : String(Number(c ?? 0) - Number(a ?? 0)),
    });
    const rows = [
      item('employees', 'Employees', pa?.people, cu?.people, false),
      item('gross', 'Gross', pa?.gross, cu?.gross),
      item('deductions', 'Deductions', pa?.deductions, cu?.deductions),
      item('net', 'Net', pa?.net, cu?.net),
      item('employerCost', 'Cost to company', pa?.employer, cu?.employer),
    ];
    const bridge = {
      joiners: { count: b.joiners, gross: money(b.joiners_gross) },
      leavers: { count: b.leavers, gross: D(b.leavers_gross).neg().toFixed(2) },
      changed: { count: b.changed, gross: money(b.changed_gross) },
    };
    return {
      data: { kind: 'recon', month: cur, previous: prev, rows, bridge, trend: trend.map((t) => ({ month: t.m, gross: money(t.gross), net: money(t.net) })) },
      columns: [
        { key: 'label', label: 'Item' },
        { key: 'previous', label: prev },
        { key: 'current', label: cur },
        { key: 'difference', label: 'Difference' },
      ],
      rows: [
        ...rows,
        { label: 'Gross change: joiners', previous: '', current: '', difference: bridge.joiners.gross },
        { label: 'Gross change: leavers', previous: '', current: '', difference: bridge.leavers.gross },
        { label: 'Gross change: people paid both months', previous: '', current: '', difference: bridge.changed.gross },
      ] as Row[],
    };
  }

  private async variance(tx: Tx, c: CompanyContext, f: Filters, p: Paging) {
    const cur = f.to;
    // The company's threshold per legal entity (Settings › Payroll, default 10%).
    const pcts = await Promise.all(f.entities.map((id) => settingFor(tx, c, 'payroll.variance_threshold_pct', { legalEntityId: id })));
    const v = Prisma.sql`${this.slips(f, addMonths(cur, -LOOKBACK), cur, true)},
      per AS (SELECT employment_id, employee_id, legal_entity_id, period_start, sum(net) AS n FROM s GROUP BY 1, 2, 3, 4),
      cur AS (SELECT * FROM per WHERE period_start = ${day(cur)}::date),
      prev AS (SELECT DISTINCT ON (employment_id) employment_id, n FROM per WHERE period_start < ${day(cur)}::date ORDER BY employment_id, period_start DESC),
      t AS (SELECT * FROM unnest(${f.entities}::uuid[], ${pcts}::numeric[]) AS t(id, pct)),
      v AS (SELECT cur.employment_id, cur.employee_id, cur.n, prev.n AS prev_n, t.pct AS threshold,
              CASE WHEN prev.n = 0 THEN NULL ELSE (cur.n - prev.n) * 100 / prev.n END AS change
            FROM cur JOIN prev ON prev.employment_id = cur.employment_id JOIN t ON t.id = cur.legal_entity_id)`;
    const [[bk], rows] = await Promise.all([
      tx.$queryRaw<{ below: number; down: number; up: number; above: number; flagged: number }[]>`
        WITH ${v} SELECT count(*) FILTER (WHERE change < -threshold)::int AS below, count(*) FILTER (WHERE change >= -threshold AND change < 0)::int AS down,
          count(*) FILTER (WHERE change >= 0 AND change <= threshold)::int AS up, count(*) FILTER (WHERE change > threshold)::int AS above,
          count(*) FILTER (WHERE abs(change) > threshold)::int AS flagged FROM v`,
      tx.$queryRaw<{ id: string; employee_id: string; name: string; code: string; prev_n: string; n: string; change: string; cause: string | null }[]>`
        WITH ${v} SELECT v.employment_id::text AS id, v.employee_id::text, ${NAME} AS name, em.employee_code::text AS code, v.prev_n::text, v.n::text, round(v.change, 1)::text AS change,
          (SELECT string_agg(coalesce(fl.note, fl.detail), ' · ' ORDER BY fl.kind) FROM variance_flags fl JOIN payslips p2 ON p2.organization_id = fl.organization_id AND p2.id = fl.payslip_id
            WHERE fl.organization_id = ${f.org}::uuid AND p2.employment_id = v.employment_id AND p2.period_start = ${day(cur)}::date AND p2.status = 'approved'
              AND (fl.note IS NOT NULL OR fl.kind <> 'net_change')) AS cause
        FROM v JOIN employments em ON em.organization_id = ${f.org}::uuid AND em.id = v.employment_id
        JOIN employees e ON e.organization_id = ${f.org}::uuid AND e.id = v.employee_id
        WHERE abs(v.change) > v.threshold
        ORDER BY abs(v.change) DESC, name, v.employment_id ${this.page(p)}`,
    ]);
    const same = [...new Set(pcts)];
    const out = rows.map((r) => ({ id: r.id, employeeId: r.employee_id, name: r.name, code: r.code, previous: money(r.prev_n), current: money(r.n), difference: D(r.n).sub(D(r.prev_n)).toFixed(2), change: r.change, cause: r.cause }));
    return {
      data: { kind: 'variance', month: cur, threshold: same.length === 1 ? same[0] : null, buckets: { below: bk.below, down: bk.down, up: bk.up, above: bk.above }, rows: out, ...this.paged(p, bk.flagged) },
      columns: [
        { key: 'name', label: 'Employee' },
        { key: 'code', label: 'Code' },
        { key: 'previous', label: 'Last paid month' },
        { key: 'current', label: cur },
        { key: 'difference', label: 'Difference' },
        { key: 'change', label: 'Change (%)' },
        { key: 'cause', label: 'Cause' },
      ],
      rows: out,
    };
  }

  private async ctc(tx: Tx, f: Filters) {
    const rows = await tx.$queryRaw<{ id: string | null; department: string | null; people: number; gross: string; employer: string; ctc: string }[]>`
      WITH ${this.slips(f, f.from, f.to)} SELECT s.department_id::text AS id, d.name::text AS department, count(DISTINCT s.employment_id)::int AS people,
        sum(s.gross)::text AS gross, sum(s.employer_cost - s.gross)::text AS employer, sum(s.employer_cost)::text AS ctc
      FROM s LEFT JOIN departments d ON d.organization_id = ${f.org}::uuid AND d.id = s.department_id
      GROUP BY 1, 2 ORDER BY 2 NULLS LAST`;
    const out = rows.map((r) => ({ id: r.id ?? 'none', department: r.department, people: r.people, gross: money(r.gross), employer: money(r.employer), ctc: money(r.ctc) }));
    const total = (k: 'gross' | 'employer' | 'ctc') => out.reduce((t, r) => t.add(r[k]), D(0)).toFixed(2);
    return {
      data: { kind: 'ctc', rows: out, totals: { gross: total('gross'), employer: total('employer'), ctc: total('ctc') } },
      columns: [
        { key: 'department', label: 'Department' },
        { key: 'people', label: 'People paid' },
        { key: 'gross', label: 'Gross' },
        { key: 'employer', label: 'Employer contributions' },
        { key: 'ctc', label: 'Cost to company' },
      ],
      rows: out,
    };
  }

  private async arrears(tx: Tx, f: Filters, p: Paging) {
    const w = Prisma.sql`w AS (
      SELECT w.* FROM arrears_worksheets w
      ${this.asg(f, Prisma.sql`w.employment_id`, Prisma.sql`(w.pay_month + interval '1 month' - interval '1 day')::date`)}
      WHERE w.organization_id = ${f.org}::uuid AND w.legal_entity_id = ANY(${f.entities}::uuid[]) AND w.status = 'approved'
        AND w.pay_month >= ${day(f.from)}::date AND w.pay_month <= ${day(f.to)}::date ${this.where(f)})`;
    const [[sum], rows] = await Promise.all([
      tx.$queryRaw<{ n: number; amount: string; employer: string }[]>`WITH ${w} SELECT count(*)::int AS n, coalesce(sum(total), 0)::text AS amount, coalesce(sum(employer_cost), 0)::text AS employer FROM w`,
      tx.$queryRaw<{ id: string; employee_id: string; name: string; code: string; from_m: string; to_m: string; pay_m: string; reason: string; total: string; employer: string; run_status: string | null }[]>`
        WITH ${w} SELECT w.id::text, w.employee_id::text, ${NAME} AS name, em.employee_code::text AS code, to_char(w.from_month, 'YYYY-MM') AS from_m,
          to_char(w.to_month, 'YYYY-MM') AS to_m, to_char(w.pay_month, 'YYYY-MM') AS pay_m, w.reason, w.total::text, w.employer_cost::text AS employer, r.status AS run_status
        FROM w JOIN employments em ON em.organization_id = ${f.org}::uuid AND em.id = w.employment_id
        JOIN employees e ON e.organization_id = ${f.org}::uuid AND e.id = w.employee_id
        LEFT JOIN payroll_runs r ON r.organization_id = ${f.org}::uuid AND r.id = w.run_id
        ORDER BY w.pay_month, name, w.id ${this.page(p)}`,
    ]);
    const out = rows.map((r) => ({ id: r.id, employeeId: r.employee_id, name: r.name, code: r.code, fromMonth: r.from_m, toMonth: r.to_m, payMonth: r.pay_m, reason: r.reason, amount: money(r.total), employerCost: money(r.employer), runStatus: r.run_status }));
    return {
      data: { kind: 'arrears', rows: out, totals: { amount: money(sum.amount), employerCost: money(sum.employer) }, ...this.paged(p, sum.n) },
      columns: [
        { key: 'name', label: 'Employee' },
        { key: 'code', label: 'Code' },
        { key: 'fromMonth', label: 'From month' },
        { key: 'toMonth', label: 'To month' },
        { key: 'payMonth', label: 'Paid in' },
        { key: 'reason', label: 'Cause' },
        { key: 'amount', label: 'Arrears' },
        { key: 'employerCost', label: 'Employer cost' },
      ],
      rows: out,
    };
  }

  private async ytd(tx: Tx, f: Filters, p: Paging) {
    // The Indian tax year: April to March.
    const [y, m] = f.to.split('-').map(Number);
    const start = `${m >= 4 ? y : y - 1}-04`;
    const base = Prisma.sql`${this.slips(f, start, f.to)},
      tds AS (SELECT l.payslip_id, sum(l.amount) AS a FROM payslip_lines l
        WHERE l.organization_id = ${f.org}::uuid AND l.payslip_id IN (SELECT id FROM s) AND l.kind = 'deduction' AND lower(l.component_code) IN ${this.codesOf(f, 'tds')}
        GROUP BY 1),
      per AS (SELECT s.employment_id, s.employee_id, count(DISTINCT s.period_start) FILTER (WHERE s.run_type = 'regular')::int AS months,
          sum(s.gross) AS gross, sum(coalesce(tds.a, 0)) AS tds, sum(s.deductions) AS deductions, sum(s.net) AS net
        FROM s LEFT JOIN tds ON tds.payslip_id = s.id GROUP BY 1, 2)`;
    const [[sum], rows, trend] = await Promise.all([
      tx.$queryRaw<{ n: number; gross: string; tds: string; deductions: string; net: string }[]>`
        WITH ${base} SELECT count(*)::int AS n, coalesce(sum(gross), 0)::text AS gross, coalesce(sum(tds), 0)::text AS tds, coalesce(sum(deductions), 0)::text AS deductions, coalesce(sum(net), 0)::text AS net FROM per`,
      tx.$queryRaw<{ id: string; employee_id: string; name: string; code: string; months: number; gross: string; tds: string; deductions: string; net: string }[]>`
        WITH ${base} SELECT per.employment_id::text AS id, per.employee_id::text, ${NAME} AS name, em.employee_code::text AS code, per.months, per.gross::text, per.tds::text, per.deductions::text, per.net::text
        FROM per JOIN employments em ON em.organization_id = ${f.org}::uuid AND em.id = per.employment_id
        JOIN employees e ON e.organization_id = ${f.org}::uuid AND e.id = per.employee_id
        ORDER BY name, em.employee_code ${this.page(p)}`,
      tx.$queryRaw<{ m: string; gross: string; net: string }[]>`
        WITH ${this.slips(f, start, f.to)} SELECT to_char(period_start, 'YYYY-MM') AS m, sum(gross)::text AS gross, sum(net)::text AS net FROM s GROUP BY 1 ORDER BY 1`,
    ]);
    let [g, n] = [D(0), D(0)];
    const cumulative = trend.map((t) => {
      g = g.add(t.gross);
      n = n.add(t.net);
      return { month: t.m, gross: g.toFixed(2), net: n.toFixed(2) };
    });
    const out = rows.map((r) => ({ id: r.id, employeeId: r.employee_id, name: r.name, code: r.code, months: r.months, gross: money(r.gross), tds: money(r.tds), deductions: money(r.deductions), net: money(r.net) }));
    return {
      data: { kind: 'ytd', yearStart: start, rows: out, totals: { gross: money(sum.gross), tds: money(sum.tds), deductions: money(sum.deductions), net: money(sum.net) }, trend: cumulative, ...this.paged(p, sum.n) },
      columns: [
        { key: 'name', label: 'Employee' },
        { key: 'code', label: 'Code' },
        { key: 'months', label: 'Months paid' },
        { key: 'gross', label: 'Gross' },
        { key: 'tds', label: 'TDS' },
        { key: 'deductions', label: 'All deductions' },
        { key: 'net', label: 'Net' },
      ],
      rows: out,
    };
  }

  private async bank(tx: Tx, f: Filters, p: Paging) {
    // Bank mode on the last day of the month: the latest approved payment mode from that day or before, else bank.
    const b = Prisma.sql`${this.slips(f, f.from, f.to)},
      x AS (SELECT s.*, coalesce(pm.mode, 'bank') AS mode FROM s
        LEFT JOIN LATERAL (SELECT m.mode FROM employee_payment_modes m WHERE m.organization_id = ${f.org}::uuid AND m.employment_id = s.employment_id AND m.status = 'approved'
          AND m.valid_from <= (s.period_start + interval '1 month' - interval '1 day')::date ORDER BY m.valid_from DESC, m.created_at DESC LIMIT 1) pm ON true),
      bk AS (SELECT * FROM x WHERE NOT x.held AND x.mode = 'bank' AND x.net > 0)`;
    const [[sum], rows] = await Promise.all([
      tx.$queryRaw<{ n: number; amount: string; left_out: number }[]>`
        WITH ${b} SELECT (SELECT count(*) FROM bk)::int AS n, (SELECT coalesce(sum(net), 0) FROM bk)::text AS amount, (SELECT count(*) FROM x WHERE x.net > 0) ::int - (SELECT count(*) FROM bk)::int AS left_out`,
      tx.$queryRaw<{ id: string; employee_id: string; name: string; code: string; m: string; ifsc: string | null; last4: string | null; net: string; status: string }[]>`
        WITH ${b} SELECT bk.id::text, bk.employee_id::text, ${NAME} AS name, em.employee_code::text AS code, to_char(bk.period_start, 'YYYY-MM') AS m, ba.ifsc::text, ba.account_last4::text AS last4, bk.net::text, bk.payment_status AS status
        FROM bk JOIN employments em ON em.organization_id = ${f.org}::uuid AND em.id = bk.employment_id
        JOIN employees e ON e.organization_id = ${f.org}::uuid AND e.id = bk.employee_id
        LEFT JOIN employee_bank_accounts ba ON ba.organization_id = ${f.org}::uuid AND ba.employee_id = bk.employee_id AND ba.purpose = 'salary' AND ba.valid_to IS NULL
        ORDER BY name, em.employee_code, bk.period_start, bk.id ${this.page(p)}`,
    ]);
    const out = rows.map((r) => ({ id: r.id, employeeId: r.employee_id, name: r.name, code: r.code, month: r.m, ifsc: r.ifsc, account: r.last4, amount: money(r.net), status: r.status }));
    return {
      data: { kind: 'bank', rows: out, totals: { count: sum.n, amount: money(sum.amount) }, left: sum.left_out, ...this.paged(p, sum.n) },
      columns: [
        { key: 'name', label: 'Employee' },
        { key: 'code', label: 'Code' },
        { key: 'month', label: 'Month' },
        { key: 'ifsc', label: 'IFSC' },
        { key: 'account', label: 'Account (last 4 digits)' },
        { key: 'amount', label: 'Amount' },
        { key: 'status', label: 'Payment status' },
      ],
      rows: out,
    };
  }

  private async holds(tx: Tx, f: Filters, p: Paging) {
    const today = todayIst();
    // A hold without its own amount holds the net pay of the run it stopped.
    const h = Prisma.sql`h AS (
      SELECT w.id, w.employee_id, w.employment_id, w.reason_code, (w.created_at AT TIME ZONE 'Asia/Kolkata')::date AS since,
        ${today}::date - (w.created_at AT TIME ZONE 'Asia/Kolkata')::date AS age,
        coalesce(w.amount, (SELECT sum(p.net) FROM payslips p WHERE p.organization_id = w.organization_id AND p.run_id = w.held_run_id AND p.employment_id = w.employment_id AND p.status = 'approved')) AS amount
      FROM payroll_withholds w
      ${this.asg(f, Prisma.sql`w.employment_id`, Prisma.sql`${today}::date`)}
      WHERE w.organization_id = ${f.org}::uuid AND w.legal_entity_id = ANY(${f.entities}::uuid[]) AND w.released_at IS NULL ${this.where(f)})`;
    const [[sum], buckets, reasons, rows] = await Promise.all([
      tx.$queryRaw<{ n: number; amount: string }[]>`WITH ${h} SELECT count(*)::int AS n, coalesce(sum(amount), 0)::text AS amount FROM h`,
      tx.$queryRaw<{ b: string; n: number; amount: string }[]>`
        WITH ${h} SELECT CASE WHEN age <= 30 THEN '0-30' WHEN age <= 60 THEN '31-60' ELSE '61+' END AS b, count(*)::int AS n, coalesce(sum(amount), 0)::text AS amount FROM h GROUP BY 1`,
      tx.$queryRaw<{ reason: string; n: number; amount: string }[]>`WITH ${h} SELECT reason_code AS reason, count(*)::int AS n, coalesce(sum(amount), 0)::text AS amount FROM h GROUP BY 1 ORDER BY sum(amount) DESC NULLS LAST, 1`,
      tx.$queryRaw<{ id: string; employee_id: string; name: string; code: string; reason: string; since: Date; age: number; amount: string | null }[]>`
        WITH ${h} SELECT h.id::text, h.employee_id::text, ${NAME} AS name, em.employee_code::text AS code, h.reason_code AS reason, h.since, h.age, h.amount::text
        FROM h JOIN employments em ON em.organization_id = ${f.org}::uuid AND em.id = h.employment_id
        JOIN employees e ON e.organization_id = ${f.org}::uuid AND e.id = h.employee_id
        ORDER BY h.age DESC, name, h.id ${this.page(p)}`,
    ]);
    const band = (id: string) => buckets.find((x) => x.b === id);
    const out = rows.map((r) => ({ id: r.id, employeeId: r.employee_id, name: r.name, code: r.code, reason: r.reason, since: iso(r.since), ageDays: r.age, amount: r.amount == null ? null : money(r.amount) }));
    return {
      data: {
        kind: 'holds',
        asOn: today,
        buckets: ['0-30', '31-60', '61+'].map((id) => ({ id, count: band(id)?.n ?? 0, amount: money(band(id)?.amount) })),
        reasons: reasons.map((r) => ({ reason: r.reason, count: r.n, amount: money(r.amount) })),
        rows: out,
        totals: { count: sum.n, amount: money(sum.amount) },
        ...this.paged(p, sum.n),
      },
      columns: [
        { key: 'name', label: 'Employee' },
        { key: 'code', label: 'Code' },
        { key: 'reason', label: 'Reason' },
        { key: 'since', label: 'Held since' },
        { key: 'ageDays', label: 'Days held' },
        { key: 'amount', label: 'Amount held' },
      ],
      rows: out,
    };
  }

  private async gratuity(tx: Tx, f: Filters, p: Paging) {
    const cur = f.to;
    const end = monthEnd(cur);
    const g = Prisma.sql`${this.slips(f, cur, cur, true)},
      emp AS (SELECT DISTINCT ON (employment_id) employment_id, employee_id, employment_type_id FROM s ORDER BY employment_id, sub_period DESC),
      g AS (SELECT p.employment_id, sum(l.amount) FILTER (WHERE p.period_start = ${day(cur)}::date) AS this_month, sum(l.amount) AS to_date
        FROM payslips p JOIN payslip_lines l ON l.organization_id = p.organization_id AND l.payslip_id = p.id
        WHERE p.organization_id = ${f.org}::uuid AND p.legal_entity_id = ANY(${f.entities}::uuid[]) AND p.status = 'approved' AND p.period_start <= ${day(cur)}::date
          AND p.employment_id IN (SELECT employment_id FROM emp) AND l.kind = 'employer' AND lower(l.component_code) IN ${this.codesOf(f, 'gratuity_provision')}
        GROUP BY 1)`;
    const [[sum], rows, rules] = await Promise.all([
      tx.$queryRaw<{ n: number; this_month: string; to_date: string }[]>`
        WITH ${g} SELECT (SELECT count(*) FROM emp)::int AS n, coalesce(sum(this_month), 0)::text AS this_month, coalesce(sum(to_date), 0)::text AS to_date FROM g`,
      tx.$queryRaw<{ id: string; employee_id: string; name: string; code: string; joined: Date; category: string | null; this_month: string | null; to_date: string | null }[]>`
        WITH ${g} SELECT emp.employment_id::text AS id, emp.employee_id::text, ${NAME} AS name, em.employee_code::text AS code,
          coalesce(em.continuous_service_from, em.joined_on) AS joined, et.category, g.this_month::text, g.to_date::text
        FROM emp JOIN employments em ON em.organization_id = ${f.org}::uuid AND em.id = emp.employment_id
        JOIN employees e ON e.organization_id = ${f.org}::uuid AND e.id = emp.employee_id
        LEFT JOIN employment_types et ON et.organization_id = ${f.org}::uuid AND et.id = emp.employment_type_id
        LEFT JOIN g ON g.employment_id = emp.employment_id
        ORDER BY name, em.employee_code ${this.page(p)}`,
      this.statutory.published(),
    ]);
    // The minimum service before gratuity is payable comes from the gratuity rule in force (fixed-term has its own).
    const rs = inForce(rules, 'IN.SS-CODE', ['IN'], end) ?? inForce(rules, 'IN.GRATUITY', ['IN'], end);
    const vals = rs?.values.kind === 'gratuity' ? rs.values : null;
    const minYears = vals ? Number(vals.minYears) : null;
    const out = rows.map((r) => {
      const s = serviceYears(iso(r.joined), end);
      const min = vals && r.category === 'fixed_term' && vals.fixedTermMinYears != null ? Number(vals.fixedTermMinYears) : minYears;
      return { id: r.id, employeeId: r.employee_id, name: r.name, code: r.code, joined: iso(r.joined), serviceMonths: Math.max(0, s.months), eligible: min == null ? null : s.completed >= min, thisMonth: money(r.this_month), toDate: money(r.to_date) };
    });
    return {
      data: { kind: 'gratuity', month: cur, minYears, rows: out, totals: { thisMonth: money(sum.this_month), toDate: money(sum.to_date) }, ...this.paged(p, sum.n) },
      columns: [
        { key: 'name', label: 'Employee' },
        { key: 'code', label: 'Code' },
        { key: 'joined', label: 'Service from' },
        { key: 'serviceMonths', label: 'Service (months)' },
        { key: 'eligible', label: 'Payable now' },
        { key: 'thisMonth', label: `Provision ${cur}` },
        { key: 'toDate', label: 'Provision to date' },
      ],
      rows: out,
    };
  }

  private async loans(tx: Tx, f: Filters, p: Paging) {
    // Balances work back from each loan's own outstanding today: recoveries after the months are added back, so a
    // loan with interest stays exact. Only recoveries on approved payslips count.
    const l = Prisma.sql`r AS (
        SELECT lr.loan_id, sum(lr.amount) FILTER (WHERE p.period_start >= ${day(f.from)}::date AND p.period_start <= ${day(f.to)}::date) AS during,
          sum(lr.amount) FILTER (WHERE p.period_start > ${day(f.to)}::date) AS after
        FROM loan_repayments lr JOIN payslips p ON p.organization_id = lr.organization_id AND p.id = lr.payslip_id AND p.status = 'approved'
        WHERE lr.organization_id = ${f.org}::uuid AND lr.legal_entity_id = ANY(${f.entities}::uuid[]) GROUP BY 1),
      l AS (SELECT ln.*, ln.outstanding + coalesce(r.after, 0) AS closing, coalesce(r.during, 0) AS recovered FROM loans ln
        LEFT JOIN r ON r.loan_id = ln.id
        ${this.asg(f, Prisma.sql`ln.employment_id`, Prisma.sql`${monthEnd(f.to)}::date`)}
        WHERE ln.organization_id = ${f.org}::uuid AND ln.legal_entity_id = ANY(${f.entities}::uuid[]) AND ln.status IN ('active', 'paused', 'closed')
          AND ln.first_month <= ${day(f.to)}::date ${this.where(f)})`;
    const [[sum], rows] = await Promise.all([
      tx.$queryRaw<{ n: number; principal: string; opening: string; recovered: string; closing: string }[]>`
        WITH ${l} SELECT count(*)::int AS n, coalesce(sum(principal), 0)::text AS principal, coalesce(sum(closing + recovered), 0)::text AS opening,
          coalesce(sum(recovered), 0)::text AS recovered, coalesce(sum(closing), 0)::text AS closing FROM l`,
      tx.$queryRaw<{ id: string; employee_id: string; name: string; code: string; loan_type: string; principal: string; emi: string; recovered: string; closing: string; status: string }[]>`
        WITH ${l} SELECT l.id::text, l.employee_id::text, ${NAME} AS name, em.employee_code::text AS code, l.loan_type, l.principal::text, l.emi::text, l.recovered::text, l.closing::text, l.status
        FROM l JOIN employments em ON em.organization_id = ${f.org}::uuid AND em.id = l.employment_id
        JOIN employees e ON e.organization_id = ${f.org}::uuid AND e.id = l.employee_id
        ORDER BY name, l.first_month, l.id ${this.page(p)}`,
    ]);
    // A closed loan that ended before the months shows nothing moving; it stays so the ledger adds up.
    const out = rows.map((r) => ({ id: r.id, employeeId: r.employee_id, name: r.name, code: r.code, type: r.loan_type, principal: money(r.principal), emi: money(r.emi), opening: D(r.closing).add(D(r.recovered)).toFixed(2), recovered: money(r.recovered), closing: money(r.closing), status: r.status }));
    return {
      data: { kind: 'loans', rows: out, totals: { principal: money(sum.principal), opening: money(sum.opening), recovered: money(sum.recovered), closing: money(sum.closing) }, ...this.paged(p, sum.n) },
      columns: [
        { key: 'name', label: 'Employee' },
        { key: 'code', label: 'Code' },
        { key: 'type', label: 'Type' },
        { key: 'principal', label: 'Amount lent' },
        { key: 'emi', label: 'Instalment' },
        { key: 'opening', label: 'Opening balance' },
        { key: 'recovered', label: 'Recovered' },
        { key: 'closing', label: 'Closing balance' },
        { key: 'status', label: 'Status' },
      ],
      rows: out,
    };
  }
}

export const isPayReport = (k: string): k is PayReportKind => (PAY_REPORTS as readonly string[]).includes(k);
