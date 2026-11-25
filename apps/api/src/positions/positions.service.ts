import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { buildViewer, has, tenantWide, type ScopeUser, type Viewer } from '../access/scope';
import { CompanyContext, Tx, audit, inCompany } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { holdersOf } from '../time/time-core';
import { EmployeeHistoryService, HISTORY_KEYS, displayName } from '../employee-history/employee-history.service';
import { ApprovalsEngine, type Notice } from '../workflow/approvals-engine.service';
import { incumbentsOn, positionsOn } from './seat-rules';
import { withPayScope } from '../payroll/pay-access';
import { checkSeatValues, groupForSwitchOn, nextStatus, type SeatValues, type SwitchOnPerson } from './position-rules';

// Enterprise E1 (founder answers 2340, 2341, 2641-2643; Oracle O1-O6, O8, O9):
//   seat          one position (headcount 1 or more) in a legal entity; its details are dated (position_versions)
//   changes       create, change, freeze, activate and eliminate, one or many at once (mass update), from today or a later
//                 day; approved through P03 'org.position_change' by another holder of org.position.manage (else the
//                 company's admins); the requester never approves (YX-SEC-11). One open change per seat.
//   switch-on     a plan that builds one seat per group of current assignments (same entity, department, location,
//                 designation and grade); sent by one person and approved by another HR person, who then links every
//                 person to their seat with a dated correction (all or nothing per person) and turns positions on
//   view          org.structure.view or org.position.manage in scope; the entry salary needs pay.range.view and the
//                 budget ats.headcount.manage
export const POSITION_TYPE = 'org.position_change';
export const SEAT_KEYS = ['org.structure.view', 'org.position.manage', 'pay.range.view', 'ats.headcount.manage', 'payroll.cost_rate.view', 'employee.change.manage', 'employee.change.approve'] as const;
const MAX_ITEMS = 100;

type Kind = 'create' | 'change' | 'freeze' | 'activate' | 'eliminate';
export interface ChangeItem {
  kind: Kind;
  positionId?: string;
  legalEntityId?: string;
  effectiveOn: string;
  values?: Partial<SeatValues> & { status?: 'proposed' | 'active' };
}
type VersionRow = Prisma.PositionVersionGetPayload<object>;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const num = (d: Prisma.Decimal | null) => (d === null ? null : Number(d.toString()));
const valuesOf = (v: VersionRow): SeatValues => ({
  title: v.title,
  departmentId: v.departmentId,
  locationId: v.locationId,
  designationId: v.designationId,
  gradeIds: v.gradeIds,
  defaultGradeId: v.defaultGradeId,
  fte: Number(v.fte.toString()),
  headcount: v.headcount,
  supervisorPositionId: v.supervisorPositionId,
  costCentreId: v.costCentreId,
  entrySalary: num(v.entrySalary),
});

@Injectable()
export class PositionsService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly history: EmployeeHistoryService,
    private readonly engine: ApprovalsEngine,
  ) {}

  onModuleInit() {
    this.engine.register({
      key: POSITION_TYPE,
      label: 'Position change',
      risk: 'normal',
      autoActions: false,
      distinctSteps: true,
      onDecided: (tx, req, o) => this.decided(tx, req, o),
      requesterLink: () => '/yx/people/positions',
    });
  }

  /** The seat keys and the job-change keys (the switch-on links people through the job-change engine). */
  viewer(user: ScopeUser) {
    return buildViewer(this.prisma, this.tenantPrisma, user, [...new Set<string>([...HISTORY_KEYS, ...SEAT_KEYS])]);
  }

  // ------------------------------------------------------------------------------------------ reading

  /** Who may see a seat: company-wide, or a legal entity, location or department scope of a seat key. */
  private sees(v: Viewer, s: { legalEntityId: string; locationId: string; departmentId: string }) {
    return ['org.structure.view', 'org.position.manage'].some((k) =>
      (v.scopes.get(k) ?? []).some((x) => x.type === 'tenant' || (x.type === 'legal_entity' && x.id === s.legalEntityId) || (x.type === 'location' && x.id === s.locationId) || (x.type === 'department_subtree' && x.id === s.departmentId)),
    );
  }

  /** Every version of the given seats (or all), oldest first. */
  private async versions(tx: Tx, org: string, ids?: string[]) {
    return tx.positionVersion.findMany({ where: { organizationId: org, ...(ids ? { positionId: { in: ids } } : {}) }, orderBy: [{ positionId: 'asc' }, { validFrom: 'asc' }] });
  }

  private inForce(all: VersionRow[], date: string) {
    const out = new Map<string, VersionRow>();
    for (const v of all) if (iso(v.validFrom) <= date) out.set(v.positionId, v);
    return out;
  }

  private async names(tx: Tx, org: string, vs: VersionRow[], entityIds: string[]) {
    const ids = (f: (v: VersionRow) => (string | null)[]) => [...new Set(vs.flatMap(f).filter((x): x is string => Boolean(x)))];
    const [entities, departments, locations, designations, grades, ccs] = await Promise.all([
      tx.legalEntity.findMany({ where: { organizationId: org, id: { in: entityIds } }, select: { id: true, name: true } }),
      tx.department.findMany({ where: { organizationId: org, id: { in: ids((v) => [v.departmentId]) } }, select: { id: true, name: true } }),
      tx.location.findMany({ where: { organizationId: org, id: { in: ids((v) => [v.locationId]) } }, select: { id: true, name: true } }),
      tx.designation.findMany({ where: { organizationId: org, id: { in: ids((v) => [v.designationId]) } }, select: { id: true, name: true } }),
      tx.grade.findMany({ where: { organizationId: org, id: { in: ids((v) => v.gradeIds) } }, select: { id: true, name: true } }),
      tx.costCentre.findMany({ where: { organizationId: org, id: { in: ids((v) => [v.costCentreId]) } }, select: { id: true, name: true } }),
    ]);
    const n = (list: { id: string; name: string }[]) => (id: string | null) => (id ? (list.find((x) => x.id === id) ?? null) : null);
    return { entity: n(entities), department: n(departments), location: n(locations), designation: n(designations), grade: n(grades), costCentre: n(ccs) };
  }

  /** Approved headcount-plan budget per seat for the financial year of `date` (lines that name the seat). */
  private async budgets(tx: Tx, org: string, ids: string[], date: string) {
    const fy = Number(date.slice(5, 7)) >= 4 ? Number(date.slice(0, 4)) : Number(date.slice(0, 4)) - 1;
    const rows = await tx.$queryRaw<{ position_id: string; budget: Prisma.Decimal | null; count: number }[]>`
      SELECT l.position_id, sum(l.budget) AS budget, sum(l.count)::int AS count FROM headcount_plan_lines l
      JOIN headcount_plans p ON p.organization_id = l.organization_id AND p.id = l.plan_id
      WHERE l.organization_id = ${org}::uuid AND l.position_id = ANY(${ids}::uuid[]) AND p.status = 'approved' AND p.fy_start = ${fy}
      GROUP BY l.position_id`;
    return new Map(rows.map((r) => [r.position_id, { budget: num(r.budget), count: r.count }]));
  }

  /**
   * Answer 2682 (with E4 costing): what the people in each seat cost a year, from their latest employer cost per month
   * (payroll's cost rates, behind the pay guard). Only for payroll.cost_rate.view; empty seats cost nothing.
   */
  private async costs(tx: Tx, org: string, seats: { id: string; legalEntityId: string }[], date: string) {
    const people = await tx.$queryRaw<{ position_id: string; employee_id: string }[]>`
      SELECT DISTINCT ON (employment_id) position_id, employee_id FROM employee_assignments
      WHERE organization_id = ${org}::uuid AND position_id = ANY(${seats.map((s) => s.id)}::uuid[]) AND superseded_at IS NULL
        AND valid_from <= ${date}::date AND (valid_to IS NULL OR valid_to >= ${date}::date)`;
    if (!people.length) return new Map<string, number>();
    const entities = [...new Set(seats.map((s) => s.legalEntityId))];
    const rates = await withPayScope(tx, entities, () =>
      tx.employeeCostRate.findMany({ where: { organizationId: org, employeeId: { in: people.map((p) => p.employee_id) }, periodStart: { lte: new Date(`${date}T00:00:00Z`) } }, orderBy: { periodStart: 'desc' }, select: { employeeId: true, employerCost: true } }),
    );
    const latest = new Map<string, number>();
    for (const r of rates) if (!latest.has(r.employeeId)) latest.set(r.employeeId, Number(r.employerCost.toString()));
    const out = new Map<string, number>();
    for (const p of people) if (latest.has(p.employee_id)) out.set(p.position_id, Math.round(((out.get(p.position_id) ?? 0) + latest.get(p.employee_id)! * 12) * 100) / 100);
    return out;
  }

  async list(ctx: TenantContext, v: Viewer, q: { asOf?: string; status?: string; legalEntityId?: string; q?: string }) {
    return this.history.run(ctx, async (tx, c) => {
      const org = c.organizationId;
      const date = q.asOf ?? todayIst();
      const seats = await tx.position.findMany({ where: { organizationId: org, ...(q.legalEntityId ? { legalEntityId: q.legalEntityId } : {}) }, orderBy: { code: 'asc' } });
      const all = await this.versions(tx, org, seats.map((s) => s.id));
      const now = this.inForce(all, date);
      const visible = seats.filter((s) => now.has(s.id) && this.sees(v, { legalEntityId: s.legalEntityId, ...now.get(s.id)! }));
      const n = await this.names(tx, org, visible.map((s) => now.get(s.id)!), [...new Set(visible.map((s) => s.legalEntityId))]);
      const filled = await incumbentsOn(tx, org, date, visible.map((s) => s.id));
      const open = await tx.positionChange.findMany({ where: { organizationId: org, status: 'submitted', positionId: { in: visible.map((s) => s.id) } }, select: { positionId: true } });
      const budgets = has(v, 'ats.headcount.manage') ? await this.budgets(tx, org, visible.map((s) => s.id), date) : null;
      const costs = has(v, 'payroll.cost_rate.view') ? await this.costs(tx, org, visible, date) : null;
      const supervisors = new Map(seats.map((s) => [s.id, { id: s.id, code: s.code, title: now.get(s.id)?.title ?? s.code }]));
      const text = q.q?.trim().toLowerCase();
      const rows = visible
        .map((s) => {
          const x = now.get(s.id)!;
          const f = filled.get(s.id) ?? 0;
          return {
            id: s.id,
            code: s.code,
            title: x.title,
            status: x.status,
            legalEntity: n.entity(s.legalEntityId),
            department: n.department(x.departmentId),
            location: n.location(x.locationId),
            designation: n.designation(x.designationId),
            grades: x.gradeIds.map((g) => n.grade(g)).filter(Boolean),
            fte: Number(x.fte.toString()),
            headcount: x.headcount,
            filled: f,
            vacant: x.status === 'active' ? Math.max(0, x.headcount - f) : 0,
            supervisor: x.supervisorPositionId ? (supervisors.get(x.supervisorPositionId) ?? null) : null,
            costCentre: n.costCentre(x.costCentreId),
            pendingChange: open.some((o) => o.positionId === s.id),
            ...(has(v, 'pay.range.view') ? { entrySalary: num(x.entrySalary) } : {}),
            ...(budgets ? { budget: budgets.get(s.id)?.budget ?? null, budgetCount: budgets.get(s.id)?.count ?? null } : {}),
            ...(costs ? { yearlyCost: costs.get(s.id) ?? null } : {}),
          };
        })
        .filter((r) => !q.status || r.status === q.status)
        .filter((r) => !text || `${r.code} ${r.title} ${r.department?.name ?? ''} ${r.location?.name ?? ''}`.toLowerCase().includes(text));
      const on = await positionsOn(tx, c, '');
      return {
        asOf: date,
        enabled: on,
        canManage: has(v, 'org.position.manage') && !v.actingForOther,
        totals: { seats: rows.length, headcount: rows.reduce((t, r) => t + (r.status === 'active' ? r.headcount : 0), 0), filled: rows.reduce((t, r) => t + r.filled, 0), vacant: rows.reduce((t, r) => t + r.vacant, 0) },
        rows,
      };
    });
  }

  async get(ctx: TenantContext, v: Viewer, id: string, asOf?: string) {
    return this.history.run(ctx, async (tx, c) => {
      const org = c.organizationId;
      const date = asOf ?? todayIst();
      const s = await tx.position.findFirst({ where: { organizationId: org, id } });
      if (!s) throw new NotFoundException('No such position.');
      const all = await this.versions(tx, org, [id]);
      const x = this.inForce(all, date).get(id) ?? all[0];
      if (!x || !this.sees(v, { legalEntityId: s.legalEntityId, ...x })) throw new NotFoundException('No such position.');
      const n = await this.names(tx, org, all, [s.legalEntityId]);
      const people = await tx.$queryRaw<{ employee_id: string; employment_id: string; since: Date; code: string; given_name: string; family_name: string | null; preferred_name: string | null }[]>`
        SELECT DISTINCT ON (a.employment_id) a.employee_id, a.employment_id, a.valid_from AS since, em.employee_code AS code, e.given_name, e.family_name, e.preferred_name
        FROM employee_assignments a JOIN employments em ON em.organization_id = a.organization_id AND em.id = a.employment_id
        JOIN employees e ON e.organization_id = a.organization_id AND e.id = a.employee_id
        WHERE a.organization_id = ${org}::uuid AND a.position_id = ${id}::uuid AND a.superseded_at IS NULL
          AND a.valid_from <= ${date}::date AND (a.valid_to IS NULL OR a.valid_to >= ${date}::date)
        ORDER BY a.employment_id, a.valid_from`;
      const jobs = await tx.job.findMany({ where: { organizationId: org, positionId: id, deletedAt: null }, select: { id: true, title: true, status: true, headcount: true }, orderBy: { createdAt: 'desc' }, take: 20 });
      const changes = await tx.positionChange.findMany({ where: { organizationId: org, positionId: id }, orderBy: { createdAt: 'desc' }, take: 20 });
      const sup = x.supervisorPositionId ? await tx.position.findFirst({ where: { organizationId: org, id: x.supervisorPositionId }, select: { id: true, code: true } }) : null;
      const reports = await tx.$queryRaw<{ id: string; code: string; title: string }[]>`
        SELECT DISTINCT ON (v.position_id) v.position_id AS id, p.code, v.title FROM position_versions v JOIN positions p ON p.organization_id = v.organization_id AND p.id = v.position_id
        WHERE v.organization_id = ${org}::uuid AND v.valid_from <= ${date}::date AND v.supervisor_position_id = ${id}::uuid ORDER BY v.position_id, v.valid_from DESC`;
      const money = has(v, 'pay.range.view');
      const view = (r: VersionRow) => ({
        validFrom: iso(r.validFrom),
        status: r.status,
        title: r.title,
        department: n.department(r.departmentId),
        location: n.location(r.locationId),
        designation: n.designation(r.designationId),
        grades: r.gradeIds.map((g) => n.grade(g)).filter(Boolean),
        defaultGradeId: r.defaultGradeId,
        fte: Number(r.fte.toString()),
        headcount: r.headcount,
        supervisorPositionId: r.supervisorPositionId,
        costCentre: n.costCentre(r.costCentreId),
        ...(money ? { entrySalary: num(r.entrySalary) } : {}),
      });
      return {
        id,
        code: s.code,
        legalEntity: n.entity(s.legalEntityId),
        asOf: date,
        current: { ...view(x), values: { ...valuesOf(x), ...(money ? {} : { entrySalary: null }) } },
        supervisor: sup ? { id: sup.id, code: sup.code, title: (await this.versions(tx, org, [sup.id])).filter((r) => iso(r.validFrom) <= date).pop()?.title ?? sup.code } : null,
        reports: reports.filter((r) => r.id !== id),
        filled: people.length,
        vacant: x.status === 'active' ? Math.max(0, x.headcount - people.length) : 0,
        incumbents: people.map((p) => ({ employeeId: p.employee_id, name: displayName({ givenName: p.given_name, familyName: p.family_name, preferredName: p.preferred_name }), code: p.code, since: iso(p.since) })),
        history: all.map(view).reverse(),
        requisitions: jobs,
        changes: changes.map((ch) => ({ id: ch.id, batchId: ch.batchId, kind: ch.kind, effectiveOn: iso(ch.effectiveOn), status: ch.status, reason: ch.reason, createdAt: ch.createdAt.toISOString(), mine: ch.requestedBy === c.userId })),
        canManage: has(v, 'org.position.manage') && !v.actingForOther,
      };
    });
  }

  // ------------------------------------------------------------------------------------------ changes (P03)

  async request(ctx: TenantContext, v: Viewer, dto: { items: ChangeItem[]; reason: string }) {
    if (v.actingForOther) throw new ForbiddenException('Not available while acting for someone else.');
    const reason = dto.reason?.trim() ?? '';
    if (reason.length < 10 || reason.length > 500) throw new BadRequestException('Give a reason of 10 to 500 characters.');
    if (!Array.isArray(dto.items) || dto.items.length < 1 || dto.items.length > MAX_ITEMS) throw new BadRequestException(`Send 1 to ${MAX_ITEMS} position changes at a time.`);
    let notices: Notice[] = [];
    const out = await this.history.run(ctx, async (tx, c) => {
      const org = c.organizationId;
      const today = todayIst();
      const batchId = randomUUID();
      const seen = new Set<string>();
      const rows: Prisma.PositionChangeCreateManyInput[] = [];
      for (const [i, it] of dto.items.entries()) {
        const at = `Change ${i + 1}: `;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(it.effectiveOn ?? '') || it.effectiveOn < today) throw new BadRequestException(`${at}choose today or a later day.`);
        if (it.kind === 'create') {
          if (!it.legalEntityId) throw new BadRequestException(`${at}choose the legal entity.`);
          if (!this.sees(v, { legalEntityId: it.legalEntityId, locationId: it.values?.locationId ?? '', departmentId: it.values?.departmentId ?? '' }) || !this.manages(v, it.legalEntityId)) throw new ForbiddenException(`${at}you cannot add seats in that legal entity.`);
          const values = await checkSeatValues(tx, org, it.legalEntityId, it.values ?? {}, null, it.effectiveOn, (m) => `${at}${m}`);
          rows.push({ organizationId: org, batchId, kind: 'create', positionId: null, legalEntityId: it.legalEntityId, effectiveOn: new Date(`${it.effectiveOn}T00:00:00Z`), values: { ...values, status: it.values?.status === 'proposed' ? 'proposed' : 'active' } as unknown as Prisma.InputJsonObject, reason, requestedBy: c.userId! });
          continue;
        }
        if (!['change', 'freeze', 'activate', 'eliminate'].includes(it.kind)) throw new BadRequestException(`${at}unknown kind of change.`);
        if (!it.positionId) throw new BadRequestException(`${at}choose the seat.`);
        if (seen.has(it.positionId)) throw new BadRequestException(`${at}one change per seat at a time.`);
        seen.add(it.positionId);
        const s = await tx.position.findFirst({ where: { organizationId: org, id: it.positionId } });
        const all = s ? await this.versions(tx, org, [s.id]) : [];
        const cur = this.inForce(all, it.effectiveOn).get(it.positionId);
        if (!s || !cur || !this.sees(v, { legalEntityId: s.legalEntityId, ...cur })) throw new NotFoundException(`${at}no such seat.`);
        if (!this.manages(v, s.legalEntityId)) throw new ForbiddenException(`${at}you cannot change seats in that legal entity.`);
        if (all.some((x) => iso(x.validFrom) >= it.effectiveOn)) throw new ConflictException(`${at}the seat already has a change on or after that day. Choose a later day.`);
        if (await tx.positionChange.findFirst({ where: { organizationId: org, positionId: s.id, status: 'submitted' } })) throw new ConflictException(`${at}${s.code} already has a change waiting for approval.`);
        const status = nextStatus(cur.status, it.kind);
        if (!status) throw new ConflictException(`${at}a ${cur.status} seat cannot be ${it.kind === 'change' ? 'changed' : `${it.kind}d`}.`);
        let values: SeatValues = valuesOf(cur);
        if (it.kind === 'change') values = await checkSeatValues(tx, org, s.legalEntityId, { ...values, ...(it.values ?? {}) }, s.id, it.effectiveOn, (m) => `${at}${m}`);
        if (it.kind === 'change' && values.headcount < ((await incumbentsOn(tx, org, it.effectiveOn, [s.id])).get(s.id) ?? 0)) throw new ConflictException(`${at}the headcount cannot go below the people in the seat.`);
        if (it.kind === 'eliminate' && (await incumbentsOn(tx, org, it.effectiveOn, [s.id])).get(s.id)) throw new ConflictException(`${at}move the people out of ${s.code} before it is eliminated.`);
        rows.push({ organizationId: org, batchId, kind: it.kind, positionId: s.id, legalEntityId: s.legalEntityId, effectiveOn: new Date(`${it.effectiveOn}T00:00:00Z`), values: { ...values, status } as unknown as Prisma.InputJsonObject, reason, requestedBy: c.userId! });
      }
      await tx.positionChange.createMany({ data: rows });
      const approvers = await this.approvers(tx, org, [c.userId ?? null]);
      const first = rows[0];
      const sub = await this.engine.submit(tx, c, {
        type: POSITION_TYPE,
        subjectType: 'position_batch',
        subjectId: batchId,
        title: rows.length === 1 ? `Position ${first.kind}: ${(first.values as { title?: string }).title ?? ''}`.trim() : `${rows.length} position changes`,
        summary: [{ label: 'Changes', value: String(rows.length) }, { label: 'From', value: [...new Set(rows.map((r) => iso(r.effectiveOn as Date)))].sort()[0] }, { label: 'Reason', value: reason.slice(0, 120) }],
        subjectPersonId: null,
        requesterUserId: c.userId ?? null,
        raisedByUserId: c.userId ?? null,
        steps: [{ name: 'Positions', approvers: [{ kind: 'users', userIds: approvers.slice(0, 25) }], mode: 'any', selfApproval: 'never' }],
        payload: {},
        payloadFields: [],
        fallbackUserIds: await this.admins(tx, org, [c.userId ?? null]),
        fallbackWording: { who: 'the company admins', check: 'Check who approves position changes' },
      });
      notices = sub.notices;
      await tx.positionChange.updateMany({ where: { organizationId: org, batchId }, data: { wfRequestId: sub.id } });
      await audit(tx, c, 'org.position.change_requested', 'position_batch', batchId, { items: rows.map((r) => ({ kind: r.kind, positionId: r.positionId, effectiveOn: iso(r.effectiveOn as Date) })) });
      return { batchId, requestId: sub.id, count: rows.length };
    });
    if (notices.length) await this.engine.send(ctx, notices);
    return out;
  }

  private manages(v: Viewer, legalEntityId: string) {
    return (v.scopes.get('org.position.manage') ?? []).some((s) => s.type === 'tenant' || (s.type === 'legal_entity' && s.id === legalEntityId));
  }

  private async admins(tx: Tx, org: string, not: (string | null)[]) {
    return (await tx.user.findMany({ where: { organizationId: org, role: 'org_admin', status: 'active' }, select: { id: true }, take: 25 })).map((u) => u.id).filter((u) => !not.includes(u));
  }

  /** Answer 2681: other holders of org.position.manage, else the company's admins. */
  private async approvers(tx: Tx, org: string, not: (string | null)[]) {
    const holders = (await holdersOf(tx, org, 'org.position.manage', '00000000-0000-0000-0000-000000000000', todayIst())).filter((u) => !not.includes(u));
    return holders.length ? holders : this.admins(tx, org, not);
  }

  /** Approved: each change becomes the seat's version from its day (a new seat gets the next code). */
  private async decided(tx: Tx, req: Prisma.WfRequestGetPayload<object>, outcome: 'approved' | 'rejected') {
    const org = req.organizationId;
    const rows = await tx.positionChange.findMany({ where: { organizationId: org, wfRequestId: req.id, status: 'submitted' }, orderBy: { createdAt: 'asc' } });
    if (outcome === 'rejected') {
      await tx.positionChange.updateMany({ where: { organizationId: org, wfRequestId: req.id, status: 'submitted' }, data: { status: 'rejected', decidedAt: new Date() } });
      return;
    }
    for (const ch of rows) {
      const { status, ...values } = ch.values as unknown as SeatValues & { status: string };
      let positionId = ch.positionId;
      if (ch.kind === 'create') {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`position-code:${org}`}))`;
        const code = await nextCode(tx, org);
        positionId = (await tx.position.create({ data: { organizationId: org, legalEntityId: ch.legalEntityId, code, createdBy: ch.requestedBy } })).id;
      }
      await tx.positionVersion.create({
        data: {
          organizationId: org,
          positionId: positionId!,
          validFrom: ch.effectiveOn,
          status,
          title: values.title,
          departmentId: values.departmentId,
          locationId: values.locationId,
          designationId: values.designationId,
          gradeIds: values.gradeIds,
          defaultGradeId: values.defaultGradeId,
          fte: values.fte,
          headcount: values.headcount,
          supervisorPositionId: values.supervisorPositionId,
          costCentreId: values.costCentreId,
          entrySalary: values.entrySalary,
          changeId: ch.id,
          recordedBy: ch.requestedBy,
        },
      });
      await tx.positionChange.update({ where: { id: ch.id }, data: { status: 'approved', positionId, decidedAt: new Date() } });
    }
  }

  /** The requester withdraws a change still waiting (the P03 request is cancelled with it). */
  async withdraw(ctx: TenantContext, v: Viewer, batchId: string) {
    return this.history.run(ctx, async (tx, c) => {
      const rows = await tx.positionChange.findMany({ where: { organizationId: c.organizationId, batchId } });
      if (!rows.length) throw new NotFoundException('No such change.');
      if (rows[0].requestedBy !== c.userId) throw new ForbiddenException('Only the person who asked can withdraw it.');
      if (rows.some((r) => r.status !== 'submitted')) throw new ConflictException('This change is already decided.');
      if (rows[0].wfRequestId) await this.engine.withdraw(tx, c, rows[0].wfRequestId, c.userId ?? null, 'Withdrawn by the requester');
      await tx.positionChange.updateMany({ where: { organizationId: c.organizationId, batchId }, data: { status: 'withdrawn', decidedAt: new Date() } });
      await audit(tx, c, 'org.position.change_withdrawn', 'position_batch', batchId, {});
      return { batchId, status: 'withdrawn' };
    });
  }

  // ------------------------------------------------------------------------------------------ switch-on (answer 2642)

  private async switchOnPeople(tx: Tx, c: CompanyContext, date: string): Promise<SwitchOnPerson[]> {
    const rows = await tx.$queryRaw<{ employment_id: string; employee_id: string; legal_entity_id: string; department_id: string; location_id: string; designation_id: string; grade_id: string | null; manager_employee_id: string | null; cost_centres: string[] | null; given_name: string; family_name: string | null; preferred_name: string | null }[]>`
      SELECT a.employment_id, a.employee_id, a.legal_entity_id, a.department_id, a.location_id, a.designation_id, a.grade_id, a.manager_employee_id,
        (SELECT array_agg(cc.cost_centre_id::text) FROM assignment_cost_centres cc WHERE cc.assignment_id = a.id AND cc.percent = 100) AS cost_centres,
        e.given_name, e.family_name, e.preferred_name
      FROM employee_assignments a
      JOIN employments em ON em.organization_id = a.organization_id AND em.id = a.employment_id
      JOIN employees e ON e.organization_id = a.organization_id AND e.id = a.employee_id
      WHERE a.organization_id = ${c.organizationId}::uuid AND a.superseded_at IS NULL AND a.valid_from <= ${date}::date AND (a.valid_to IS NULL OR a.valid_to >= ${date}::date)
        AND em.joined_on <= ${date}::date AND (em.exited_on IS NULL OR em.exited_on >= ${date}::date)
      ORDER BY a.employment_id`;
    return rows.map((r) => ({
      employmentId: r.employment_id,
      employeeId: r.employee_id,
      name: displayName({ givenName: r.given_name, familyName: r.family_name, preferredName: r.preferred_name }),
      legalEntityId: r.legal_entity_id,
      departmentId: r.department_id,
      locationId: r.location_id,
      designationId: r.designation_id,
      gradeId: r.grade_id,
      managerEmployeeId: r.manager_employee_id,
      costCentreId: r.cost_centres?.length === 1 ? r.cost_centres[0] : null,
    }));
  }

  /** The seats the plan would make today, and the plan waiting for approval, if any. */
  async switchOnPreview(ctx: TenantContext, v: Viewer) {
    return this.history.run(ctx, async (tx, c) => {
      const date = todayIst();
      const on = await positionsOn(tx, c, '');
      const people = on ? [] : await this.switchOnPeople(tx, c, date);
      const groups = groupForSwitchOn(people);
      const designations = await tx.designation.findMany({ where: { organizationId: c.organizationId, id: { in: [...new Set(groups.map((g) => g.designationId))] } }, select: { id: true, name: true } });
      const departments = await tx.department.findMany({ where: { organizationId: c.organizationId, id: { in: [...new Set(groups.map((g) => g.departmentId))] } }, select: { id: true, name: true } });
      const locations = await tx.location.findMany({ where: { organizationId: c.organizationId, id: { in: [...new Set(groups.map((g) => g.locationId))] } }, select: { id: true, name: true } });
      const pending = await tx.positionChange.findFirst({ where: { organizationId: c.organizationId, kind: 'switch_on', status: { in: ['submitted', 'approved'] } }, orderBy: { createdAt: 'desc' } });
      return {
        enabled: on,
        date,
        people: people.length,
        seats: groups.map((g) => ({
          key: g.key,
          title: designations.find((d) => d.id === g.designationId)?.name ?? 'Seat',
          department: departments.find((d) => d.id === g.departmentId)?.name ?? null,
          location: locations.find((d) => d.id === g.locationId)?.name ?? null,
          headcount: g.people.length,
          people: g.people.slice(0, 5).map((p) => p.name),
          supervisorKey: g.supervisorKey,
        })),
        plan: pending && pending.status === 'submitted' ? { batchId: pending.batchId, effectiveOn: iso(pending.effectiveOn), reason: pending.reason, mine: pending.requestedBy === c.userId, sentAt: pending.createdAt.toISOString() } : null,
        result: pending?.status === 'approved' ? pending.result : null,
        canSend: has(v, 'org.position.manage') && has(v, 'employee.change.manage') && !v.actingForOther,
        canApprove: has(v, 'org.position.manage') && has(v, 'employee.change.manage') && has(v, 'employee.change.approve') && !v.actingForOther,
      };
    });
  }

  async switchOnSend(ctx: TenantContext, v: Viewer, dto: { reason: string }) {
    if (v.actingForOther) throw new ForbiddenException('Not available while acting for someone else.');
    if (!has(v, 'employee.change.manage') || !tenantWide(v, 'org.position.manage')) throw new ForbiddenException('Switching positions on needs company-wide org.position.manage and employee.change.manage.');
    const reason = dto.reason?.trim() ?? '';
    if (reason.length < 10 || reason.length > 500) throw new BadRequestException('Give a reason of 10 to 500 characters.');
    return this.history.run(ctx, async (tx, c) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`positions-switch-on:${c.organizationId}`}))`;
      if (await positionsOn(tx, c, '')) throw new ConflictException('Positions are already on.');
      if (await tx.positionChange.findFirst({ where: { organizationId: c.organizationId, kind: 'switch_on', status: 'submitted' } })) throw new ConflictException('A switch-on plan is already waiting for approval.');
      const people = await this.switchOnPeople(tx, c, todayIst());
      if (!people.length) throw new BadRequestException('There is nobody to give a seat to yet.');
      const batchId = randomUUID();
      await tx.positionChange.create({ data: { organizationId: c.organizationId, batchId, kind: 'switch_on', positionId: null, legalEntityId: people[0].legalEntityId, effectiveOn: new Date(`${todayIst()}T00:00:00Z`), values: {}, reason, requestedBy: c.userId! } });
      await audit(tx, c, 'org.position.switch_on_sent', 'position_batch', batchId, { people: people.length });
      return { batchId };
    });
  }

  async switchOnDecline(ctx: TenantContext, v: Viewer, batchId: string, dto: { reason: string }) {
    if (v.actingForOther) throw new ForbiddenException('Not available while acting for someone else.');
    const reason = dto.reason?.trim() ?? '';
    if (reason.length < 10) throw new BadRequestException('Give a reason of at least 10 characters.');
    return this.history.run(ctx, async (tx, c) => {
      const p = await tx.positionChange.findFirst({ where: { organizationId: c.organizationId, batchId, kind: 'switch_on' } });
      if (!p) throw new NotFoundException('No such plan.');
      if (p.status !== 'submitted') throw new ConflictException('This plan is already decided.');
      if (p.requestedBy !== c.userId && !(has(v, 'employee.change.approve') && has(v, 'org.position.manage'))) throw new ForbiddenException('You cannot decline this plan.');
      await tx.positionChange.update({ where: { id: p.id }, data: { status: p.requestedBy === c.userId ? 'withdrawn' : 'rejected', decidedBy: c.userId, decidedAt: new Date(), result: { reason } } });
      await audit(tx, c, 'org.position.switch_on_declined', 'position_batch', batchId, { reason });
      return { batchId, status: p.requestedBy === c.userId ? 'withdrawn' : 'rejected' };
    });
  }

  /**
   * Another HR person approves: the seats are made from today's assignments (as the preview shows), positions go on, and
   * each person is linked to their seat by a dated correction from the sender, approved by the approver (YX-SEC-11),
   * person by person: one person's problem never stops the others, and its reason is kept.
   */
  async switchOnApprove(ctx: TenantContext, v: Viewer, batchId: string) {
    if (v.actingForOther) throw new ForbiddenException('Not available while acting for someone else.');
    if (!has(v, 'org.position.manage') || !has(v, 'employee.change.manage') || !has(v, 'employee.change.approve')) throw new ForbiddenException('Approving needs org.position.manage, employee.change.manage and employee.change.approve.');
    const plan = await this.history.run(ctx, async (tx, c) => {
      const p = await tx.positionChange.findFirst({ where: { organizationId: c.organizationId, batchId, kind: 'switch_on' } });
      if (!p) throw new NotFoundException('No such plan.');
      if (p.status !== 'submitted') throw new ConflictException('This plan is already decided.');
      if (p.requestedBy === c.userId) throw new ForbiddenException('You sent this plan, so someone else in HR approves it.');
      return p;
    });
    const sender = await this.viewerOf(ctx, plan.requestedBy);
    const result = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`positions-switch-on:${org}`}))`;
      const fresh = await tx.positionChange.findFirstOrThrow({ where: { id: plan.id } });
      if (fresh.status !== 'submitted') throw new ConflictException('This plan is already decided.');
      const date = todayIst();
      const people = await this.switchOnPeople(tx, c, date);
      const groups = groupForSwitchOn(people);
      const seatOf = new Map<string, string>();
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`position-code:${org}`}))`;
      const designations = await tx.designation.findMany({ where: { organizationId: org, id: { in: [...new Set(groups.map((g) => g.designationId))] } }, select: { id: true, name: true } });
      for (const g of groups) {
        const s = await tx.position.create({ data: { organizationId: org, legalEntityId: g.legalEntityId, code: await nextCode(tx, org), createdBy: plan.requestedBy } });
        seatOf.set(g.key, s.id);
      }
      for (const g of groups) {
        await tx.positionVersion.create({
          data: {
            organizationId: org,
            positionId: seatOf.get(g.key)!,
            validFrom: new Date(`${date}T00:00:00Z`),
            status: 'active',
            title: (designations.find((d) => d.id === g.designationId)?.name ?? 'Seat').slice(0, 120),
            departmentId: g.departmentId,
            locationId: g.locationId,
            designationId: g.designationId,
            gradeIds: g.gradeId ? [g.gradeId] : [],
            defaultGradeId: g.gradeId,
            fte: 1,
            headcount: g.people.length,
            supervisorPositionId: g.supervisorKey ? (seatOf.get(g.supervisorKey) ?? null) : null,
            costCentreId: g.costCentreId,
            changeId: plan.id,
            recordedBy: plan.requestedBy,
          },
        });
      }
      await tx.setting.create({ data: { organizationId: org, key: 'org.positions.enabled', scopeType: 'tenant', scopeId: org, validFrom: null, value: 'on', updatedBy: c.userId } });
      const linked: string[] = [];
      const failed: { employeeId: string; name: string; reason: string }[] = [];
      for (const g of groups) {
        for (const p of g.people) {
          try {
            await tx.$executeRaw`SAVEPOINT seat_link`;
            const { ch, e } = await this.history.createChange(tx, { ...c, userId: plan.requestedBy }, sender, { employeeId: p.employeeId, changeType: 'correction', effectiveDate: date, payload: { assignment: { positionId: seatOf.get(g.key)! } }, reason: `Positions switched on: ${plan.reason}`.slice(0, 1000) });
            const applied = await this.history.approveIn(tx, c, v, ch, e, { confirmRebase: true, simulate: false });
            await this.history.afterApply(tx, c, applied.updated, applied.impact, applied.effectiveNow);
            await tx.$executeRaw`RELEASE SAVEPOINT seat_link`;
            linked.push(p.employeeId);
          } catch (err) {
            await tx.$executeRaw`ROLLBACK TO SAVEPOINT seat_link`;
            failed.push({ employeeId: p.employeeId, name: p.name, reason: ((err as Error).message ?? 'Failed').slice(0, 300) });
          }
        }
      }
      const out = { seats: groups.length, linked: linked.length, failed };
      await tx.positionChange.update({ where: { id: plan.id }, data: { status: 'approved', decidedBy: c.userId, decidedAt: new Date(), result: out as unknown as Prisma.InputJsonObject } });
      await audit(tx, c, 'org.position.switched_on', 'position_batch', batchId, { seats: groups.length, linked: linked.length, failed: failed.length });
      return out;
    }, { timeout: 120_000 });
    return result;
  }

  private async viewerOf(ctx: TenantContext, userId: string): Promise<Viewer> {
    const u = await this.history.run(ctx, (tx) => tx.user.findFirst({ where: { id: userId }, select: { id: true, role: true, organizationId: true, permissionProfileId: true } }));
    if (!u) return { userId, grants: new Set(), scopes: new Map(), actingForOther: false };
    return this.viewer({ userId: u.id, role: u.role, organizationId: u.organizationId, permissionProfileId: u.permissionProfileId } as ScopeUser);
  }
}

/** The next free code, POS-00001 upward (callers hold the company's position-code lock). */
async function nextCode(tx: Tx, org: string) {
  const [{ n }] = await tx.$queryRaw<{ n: number }[]>`SELECT COALESCE(max(substring(code FROM 5)::int), 0)::int + 1 AS n FROM positions WHERE organization_id = ${org}::uuid AND code ~ '^POS-[0-9]+$'`;
  return `POS-${String(n).padStart(5, '0')}`;
}
