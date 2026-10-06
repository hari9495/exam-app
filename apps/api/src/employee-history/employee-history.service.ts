import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService, TenantContext, TenantPrismaService, resolvePermissionGrants } from '@exam-platform/shared';
import { audit, CompanyContext, companyContext, mapDbError, Tx } from '../org-structure/org-structure.service';
import { addDays, asDate, isCurrency, isoDate, todayIst } from '../org-structure/org-validation';
import { SETTINGS, resolveSetting } from '../org-structure/settings-registry';
import { ChangeEditDto, ChangeRequestDto, EmployeeCreateDto } from './dto';
import { addRole, checkLoginLink, personForEmployee } from '../people/persons';
import { startProbation } from '../people/probation';
import {
  affectedMonths,
  AssignmentValues,
  ChangePayload,
  ChangeType,
  CompensationValues,
  Fact,
  FACTS,
  fold,
  FoldChange,
  FoldError,
  fyStart,
  label,
  localToday,
  payloadProblem,
  reach,
  Reach,
  Segment,
  StatusValues,
} from './history-rules';

// P06 effective-dated history on the P01 employee core. One write path (YX-HIS-01): an employee change
// is requested, approved by someone else (YX-SEC-11), then materialised into dated rows. Rows are
// materialised at approval, also for future dates, so "as on a future date" reads and rebasing work from
// the same rows; the daily job marks a scheduled change effective at 00:00 in the employee's location
// (YX-HIS-04/05). Any rewrite supersedes rows and inserts new ones, never edits or deletes (YX-HIS-07).
// Everything runs in the caller's company under forced RLS, never the super-admin bypass.

export const HISTORY_KEYS = [
  'employee.profile.view',
  'employee.change.manage',
  'employee.change.approve',
  'employee.change.retro',
  'employee.change.retro_override',
  'employee.salary.view',
  'employee.salary.manage',
  // P02 YX-SEC-27 / M01 §3.10: managers raise job changes for their team (never approve them).
  'request.raise_on_behalf',
] as const;
type Key = (typeof HISTORY_KEYS)[number];

export interface RequestUser {
  userId?: string;
  role: string;
  organizationId?: string | null;
  permissionProfileId?: string | null;
  actingSuperAdmin?: boolean;
  impersonatorUserId?: string;
}

/** Who is asking: their grants (as the permissions guard resolves them) and whether it is really them. */
export interface Viewer {
  userId: string | null;
  grants: ReadonlySet<string>;
  /** Impersonation or YukthiX staff in a company: no pay, no writes (P02 YX-SEC-20). */
  actingForOther: boolean;
}

export interface Access {
  /** employee.profile.view: every change, whatever its state. */
  hr: boolean;
  /** HR or the person themselves: every date. */
  full: boolean;
  self: boolean;
  /** Manager: the periods they were above the person (YX-SEC-06), [from, to | null]. */
  periods: [string, string | null][];
  pay: boolean;
}

type Employment = Prisma.EmploymentGetPayload<object>;
type ChangeRow = Prisma.EmployeeChangeGetPayload<object>;
type AssignmentRow = Prisma.EmployeeAssignmentGetPayload<object> & { costCentres: { costCentreId: string; percent: Prisma.Decimal }[]; dottedLines: { managerEmployeeId: string }[] };
type StatusRow = Prisma.EmploymentStatusPeriodGetPayload<object>;
type CompRow = Prisma.CompensationGetPayload<object>;
type FactRow = AssignmentRow | StatusRow | CompRow;
type Facts = { assignment: AssignmentValues | null; status: StatusValues | null; compensation: CompensationValues | null };

const ACTIVE = ['scheduled', 'effective'];
const iso = (d: Date | null) => (d ? isoDate(d) : null);
const has = (v: Viewer, k: Key) => v.grants.has(k);
/** M01 §3.10: the job changes a manager may raise for their team (salary only with the pay grant, R1). */
const ON_BEHALF_TYPES: readonly ChangeType[] = ['promotion', 'transfer', 'redesignation', 'manager_change'];
/** HR-side change rights: everything else is a manager raising on behalf (YX-SEC-27). */
const changeDesk = (v: Viewer) => has(v, 'employee.profile.view') || has(v, 'employee.change.manage') || has(v, 'employee.change.approve');
const covers = (from: string, to: string | null, date: string) => from <= date && (to === null || date <= to);

function assignmentValues(r: AssignmentRow): AssignmentValues {
  return {
    locationId: r.locationId,
    departmentId: r.departmentId,
    designationId: r.designationId,
    gradeId: r.gradeId,
    employmentTypeId: r.employmentTypeId,
    managerEmployeeId: r.managerEmployeeId,
    costCentres: r.costCentres.map((x) => ({ costCentreId: x.costCentreId, percent: x.percent.toFixed(2) })).sort((a, b) => a.costCentreId.localeCompare(b.costCentreId)),
    dottedLineManagerIds: r.dottedLines.map((x) => x.managerEmployeeId).sort(),
  };
}
const values = (fact: Fact, r: FactRow): unknown =>
  fact === 'assignment' ? assignmentValues(r as AssignmentRow) : fact === 'status' ? { status: (r as StatusRow).status } : { currency: (r as CompRow).currency, annualCtc: (r as CompRow).annualCtc.toFixed(2) };

/** Thrown inside a transaction to roll it back and hand a result out (previews). */
class Rollback<T> extends Error {
  constructor(readonly result: T) {
    super('rollback');
  }
}

@Injectable()
export class EmployeeHistoryService {
  private readonly logger = new Logger(EmployeeHistoryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
  ) {}

  async viewer(user: RequestUser): Promise<Viewer> {
    const grants = await resolvePermissionGrants(this.prisma, this.tenantPrisma, { role: user.role, organizationId: user.organizationId ?? null, permissionProfileId: user.permissionProfileId }, [...HISTORY_KEYS]);
    return { userId: user.userId ?? null, grants, actingForOther: Boolean(user.impersonatorUserId || user.actingSuperAdmin) };
  }

  async run<T>(ctx: TenantContext, fn: (tx: Tx, c: CompanyContext) => Promise<T>): Promise<T> {
    const c = companyContext(ctx);
    try {
      return await this.tenantPrisma.forTenant(c, (tx) => fn(tx, c));
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const model = String(e.meta?.modelName ?? '');
        if (model === 'Employment') throw new ConflictException('That employee code is already used (YX-ORG-16).');
        if (model === 'Employee') throw new ConflictException('That login already belongs to an employee.');
      }
      if (e instanceof FoldError) throw new BadRequestException(e.message);
      if (e instanceof Error && /exclusion constraint|23P01/.test(e.message)) throw new ConflictException('Those dates overlap another row (YX-HIS-02).');
      throw mapDbError(e);
    }
  }

  /** Runs `fn` in a transaction that is always rolled back, returning its result (P06 §4.3 impact preview). */
  async preview<T>(ctx: TenantContext, fn: (tx: Tx, c: CompanyContext) => Promise<T>): Promise<T> {
    try {
      await this.run(ctx, async (tx, c) => {
        throw new Rollback(await fn(tx, c));
      });
    } catch (e) {
      if (e instanceof Rollback) return e.result as T;
      throw e;
    }
    throw new Error('unreachable');
  }

  // ================= who may see whom (P02 §4.3, YX-SEC-06, YX-HIS-10) =================

  async ownEmployeeId(tx: Tx, c: CompanyContext, v: Viewer): Promise<string | null> {
    if (!v.userId || v.actingForOther) return null;
    return (await tx.employee.findFirst({ where: { organizationId: c.organizationId, userId: v.userId }, select: { id: true } }))?.id ?? null;
  }

  /**
   * The periods in which `above` sat anywhere above `subject` in the reporting chain, from current rows:
   * the chain is walked over date ranges, intersecting as it climbs (PostgreSQL ranges, no date maths here).
   */
  async chainPeriods(tx: Tx, c: CompanyContext, subject: string, above: string): Promise<[string, string | null][]> {
    const rows = await tx.$queryRaw<{ from: string; to: string | null }[]>`
      WITH RECURSIVE up(manager_id, period, depth) AS (
        SELECT a.manager_employee_id, daterange(a.valid_from, a.valid_to, '[]'), 1
        FROM employee_assignments a
        WHERE a.organization_id = ${c.organizationId}::uuid AND a.employee_id = ${subject}::uuid
          AND a.superseded_at IS NULL AND a.manager_employee_id IS NOT NULL
        UNION ALL
        SELECT a.manager_employee_id, up.period * daterange(a.valid_from, a.valid_to, '[]'), up.depth + 1
        FROM up JOIN employee_assignments a
          ON a.organization_id = ${c.organizationId}::uuid AND a.employee_id = up.manager_id
         AND a.superseded_at IS NULL AND a.manager_employee_id IS NOT NULL
         AND daterange(a.valid_from, a.valid_to, '[]') && up.period
        WHERE up.depth < 50 AND up.manager_id <> ${above}::uuid AND up.manager_id <> ${subject}::uuid
      )
      SELECT lower(r)::text AS "from", (upper(r) - 1)::text AS "to"
      FROM unnest((SELECT range_agg(period) FROM up WHERE manager_id = ${above}::uuid)) AS r
      ORDER BY 1`;
    return rows.map((r) => [r.from, r.to]);
  }

  async access(tx: Tx, c: CompanyContext, v: Viewer, employeeId: string): Promise<Access> {
    const employee = await tx.employee.findFirst({ where: { id: employeeId, organizationId: c.organizationId }, select: { id: true } });
    const own = await this.ownEmployeeId(tx, c, v);
    const self = own === employeeId;
    const hr = has(v, 'employee.profile.view');
    const periods = employee && !hr && !self && own ? await this.chainPeriods(tx, c, employeeId, own) : [];
    // Not found, or not theirs to see: the same answer, so existence is not leaked.
    if (!employee || (!hr && !self && periods.length === 0)) throw new NotFoundException('Employee not found');
    // Founder rule R1: pay only with pay access, or one's own; never while acting for someone else.
    return { hr, full: hr || self, self, periods, pay: !v.actingForOther && (self || has(v, 'employee.salary.view')) };
  }

  private visibleOn(a: Access, date: string): boolean {
    return a.full || a.periods.some(([f, t]) => covers(f, t, date));
  }

  private async auditPayView(tx: Tx, c: CompanyContext, a: Access, employeeId: string, what: string) {
    // YX-SEC-09: someone else's Confidential data viewed.
    if (a.pay && !a.self) await audit(tx, c, 'employee.pay.viewed', 'employee', employeeId, { what });
  }

  // ================= reading (P06 §4.7) =================

  private async employmentOf(tx: Tx, c: CompanyContext, employeeId: string): Promise<Employment> {
    const e = await tx.employment.findFirst({ where: { organizationId: c.organizationId, employeeId }, orderBy: { joinedOn: 'desc' } });
    if (!e) throw new NotFoundException('Employee not found');
    return e;
  }

  /** Rows of every fact for an employment; current only unless `recordedAt` asks what was believed then (Q1). */
  async rows(tx: Tx, c: CompanyContext, employmentId: string, opts: { recordedAt?: Date; includeSuperseded?: boolean } = {}) {
    // The same filter fits all three dated tables (common columns, P06 §4.2).
    const when: { recordedAt?: { lte: Date }; supersededAt?: null; OR?: ({ supersededAt: null } | { supersededAt: { gt: Date } })[] } = opts.includeSuperseded
      ? {}
      : opts.recordedAt
        ? { recordedAt: { lte: opts.recordedAt }, OR: [{ supersededAt: null }, { supersededAt: { gt: opts.recordedAt } }] }
        : { supersededAt: null };
    const where = { organizationId: c.organizationId, employmentId, ...when };
    const order = [{ validFrom: 'asc' as const }, { recordedAt: 'asc' as const }];
    const assignments = await tx.employeeAssignment.findMany({ where, orderBy: order });
    const children = { where: { organizationId: c.organizationId, assignmentId: { in: assignments.map((a) => a.id) } } };
    const shares = assignments.length ? await tx.assignmentCostCentre.findMany(children) : [];
    const dotted = assignments.length ? await tx.assignmentDottedLineManager.findMany(children) : [];
    return {
      assignment: assignments.map((a) => ({ ...a, costCentres: shares.filter((s) => s.assignmentId === a.id), dottedLines: dotted.filter((d) => d.assignmentId === a.id) })) as AssignmentRow[],
      status: (await tx.employmentStatusPeriod.findMany({ where, orderBy: order })) as StatusRow[],
      compensation: (await tx.compensation.findMany({ where, orderBy: order })) as CompRow[],
    };
  }

  private factsOn(rows: Awaited<ReturnType<EmployeeHistoryService['rows']>>, date: string): Facts {
    const on = <R extends FactRow>(list: R[]) => list.find((r) => covers(isoDate(r.validFrom), iso(r.validTo), date));
    const a = on(rows.assignment);
    const s = on(rows.status);
    const p = on(rows.compensation);
    return {
      assignment: a ? assignmentValues(a) : null,
      status: s ? { status: s.status as StatusValues['status'] } : null,
      compensation: p ? (values('compensation', p) as CompensationValues) : null,
    };
  }

  /** Names for the ids the screens show (masters, locations, managers, cost centres). */
  async names(tx: Tx, c: CompanyContext, rows: AssignmentValues[]) {
    const ids = (k: keyof AssignmentValues) => [...new Set(rows.map((r) => r[k]).filter((x): x is string => typeof x === 'string'))];
    const org = { organizationId: c.organizationId };
    const pick = { id: true, name: true, code: true } as const;
    const [locations, departments, designations, grades, types, managers, ccs] = await Promise.all([
      tx.location.findMany({ where: { ...org, id: { in: ids('locationId') } }, select: { ...pick, state: true, timezone: true } }),
      tx.department.findMany({ where: { ...org, id: { in: ids('departmentId') } }, select: pick }),
      tx.designation.findMany({ where: { ...org, id: { in: ids('designationId') } }, select: pick }),
      tx.grade.findMany({ where: { ...org, id: { in: ids('gradeId') } }, select: pick }),
      tx.employmentType.findMany({ where: { ...org, id: { in: ids('employmentTypeId') } }, select: pick }),
      tx.employee.findMany({ where: { ...org, id: { in: [...ids('managerEmployeeId'), ...rows.flatMap((r) => r.dottedLineManagerIds)] } }, select: { id: true, givenName: true, familyName: true, preferredName: true } }),
      tx.costCentre.findMany({ where: { ...org, id: { in: rows.flatMap((r) => r.costCentres.map((x) => x.costCentreId)) } }, select: pick }),
    ]);
    const by = <T extends { id: string }>(list: T[]) => new Map(list.map((x) => [x.id, x]));
    return { locations: by(locations), departments: by(departments), designations: by(designations), grades: by(grades), types: by(types), managers: by(managers), ccs: by(ccs) };
  }

  describe(a: AssignmentValues, n: Awaited<ReturnType<EmployeeHistoryService['names']>>) {
    const ref = (m: Map<string, { id: string; name: string; code: string }>, id: string | null) => (id ? { id, name: m.get(id)?.name ?? null, code: m.get(id)?.code ?? null } : null);
    const loc = n.locations.get(a.locationId);
    const mgr = a.managerEmployeeId ? n.managers.get(a.managerEmployeeId) : undefined;
    return {
      location: { id: a.locationId, name: loc?.name ?? null, state: loc?.state ?? null, timezone: loc?.timezone ?? null },
      department: ref(n.departments, a.departmentId),
      designation: ref(n.designations, a.designationId),
      grade: ref(n.grades, a.gradeId),
      employmentType: ref(n.types, a.employmentTypeId),
      manager: a.managerEmployeeId ? { id: a.managerEmployeeId, name: mgr ? displayName(mgr) : null } : null,
      costCentres: a.costCentres.map((x) => ({ ...ref(n.ccs, x.costCentreId)!, percent: x.percent })),
      dottedLineManagers: a.dottedLineManagerIds.map((m) => ({ id: m, name: n.managers.get(m) ? displayName(n.managers.get(m)!) : null })),
    };
  }

  private async header(tx: Tx, c: CompanyContext, employeeId: string, e: Employment) {
    const person = await tx.employee.findFirstOrThrow({ where: { id: employeeId, organizationId: c.organizationId } });
    const entity = await tx.legalEntity.findFirst({ where: { id: e.legalEntityId, organizationId: c.organizationId }, select: { id: true, name: true } });
    return { id: person.id, name: displayName(person), employeeCode: e.employeeCode, legalEntity: entity, joinedOn: isoDate(e.joinedOn), exitedOn: iso(e.exitedOn) };
  }

  /** P06 §4.7 asOf(employee, date): the dated facts in force, as corrected now or as recorded at T (Q1). */
  asOf(ctx: TenantContext, v: Viewer, employeeId: string, date: string | undefined, recordedAt: string | undefined, withPay = false) {
    return this.run(ctx, async (tx, c) => {
      const a = await this.access(tx, c, v, employeeId);
      const on = date ?? todayIst();
      // YX-SEC-06: a manager sees only the periods they managed the person.
      if (!this.visibleOn(a, on)) throw new NotFoundException('Employee not found');
      const e = await this.employmentOf(tx, c, employeeId);
      const rows = await this.rows(tx, c, e.id, { recordedAt: recordedAt ? new Date(recordedAt) : undefined });
      const facts = this.factsOn(rows, on);
      const row = rows.assignment.find((r) => covers(isoDate(r.validFrom), iso(r.validTo), on));
      const st = rows.status.find((r) => covers(isoDate(r.validFrom), iso(r.validTo), on));
      const pay = rows.compensation.find((r) => covers(isoDate(r.validFrom), iso(r.validTo), on));
      const showPay = a.pay && withPay;
      if (showPay && pay) await this.auditPayView(tx, c, a, employeeId, 'as_of');
      return {
        employee: await this.header(tx, c, employeeId, e),
        asOf: on,
        recordedAt: recordedAt ?? null,
        assignment: facts.assignment && row ? { validFrom: isoDate(row.validFrom), validTo: iso(row.validTo), changeId: row.changeId, ...this.describe(facts.assignment, await this.names(tx, c, [facts.assignment])) } : null,
        status: st ? { status: st.status, validFrom: isoDate(st.validFrom), validTo: iso(st.validTo), changeId: st.changeId } : null,
        payAccess: a.pay,
        compensation: showPay && pay ? { currency: pay.currency, annualCtc: pay.annualCtc.toFixed(2), validFrom: isoDate(pay.validFrom), validTo: iso(pay.validTo), changeId: pay.changeId } : null,
      };
    });
  }

  /**
   * The timeline (P06 §7): every change, and every row of every fact with who superseded it and why
   * (YX-HIS-07). A manager sees only current rows and changes inside the periods they managed.
   */
  history(ctx: TenantContext, v: Viewer, employeeId: string, withPay = false) {
    return this.run(ctx, async (tx, c) => {
      const a = await this.access(tx, c, v, employeeId);
      const e = await this.employmentOf(tx, c, employeeId);
      const rows = await this.rows(tx, c, e.id, { includeSuperseded: a.full });
      const overlaps = (from: Date, to: Date | null) => a.full || a.periods.some(([f, t]) => (t === null || isoDate(from) <= t) && (to === null || f <= isoDate(to)));
      // Requests still being decided (or turned down) are HR's business; the person and their managers see
      // approved changes only, a manager only inside the periods they managed.
      const all = await tx.employeeChange.findMany({ where: { organizationId: c.organizationId, employmentId: e.id }, orderBy: [{ effectiveDate: 'asc' }, { seq: 'asc' }] });
      const changes = all.filter((ch) => a.hr || ((ch.status === 'effective' || ch.status === 'scheduled') && this.visibleOn(a, isoDate(ch.effectiveDate))));
      const names = await this.names(tx, c, rows.assignment.map(assignmentValues));
      const byId = new Map(all.map((ch) => [ch.id, ch]));
      const common = (r: FactRow) => ({
        id: r.id,
        validFrom: isoDate(r.validFrom),
        validTo: iso(r.validTo),
        changeId: r.changeId,
        recordedAt: r.recordedAt,
        supersededAt: r.supersededAt,
        supersededBy: r.supersededByChangeId ? { changeId: r.supersededByChangeId, type: byId.get(r.supersededByChangeId)?.changeType ?? null, reason: byId.get(r.supersededByChangeId)?.reason ?? null } : null,
      });
      const showPay = a.pay && withPay;
      if (showPay && rows.compensation.length) await this.auditPayView(tx, c, a, employeeId, 'history');
      return {
        employee: await this.header(tx, c, employeeId, e),
        payAccess: a.pay,
        // An impact speaks about other dates (later changes it recalculated): HR only.
        changes: changes.map((ch) => ({ ...this.changeView(ch, showPay), ...(a.hr ? {} : { impact: null }) })),
        assignment: rows.assignment.filter((r) => overlaps(r.validFrom, r.validTo)).map((r) => ({ ...common(r), ...this.describe(assignmentValues(r), names) })),
        status: rows.status.filter((r) => overlaps(r.validFrom, r.validTo)).map((r) => ({ ...common(r), status: r.status })),
        compensation: showPay ? rows.compensation.map((r) => ({ ...common(r), currency: r.currency, annualCtc: r.annualCtc.toFixed(2) })) : [],
      };
    });
  }

  /**
   * P06 §4.6 segments(employee, from, to): the periods within [from, to] in which every fact is constant,
   * for payroll proration, attendance and leave (YX-HIS-13 decides how each module uses them). HR only.
   */
  segments(ctx: TenantContext, v: Viewer, employeeId: string, from: string, to: string) {
    if (to < from) throw new BadRequestException('The end date is before the start date.');
    if (Date.parse(to) - Date.parse(from) > 400 * 86_400_000) throw new BadRequestException('Ask for at most 400 days at a time.');
    return this.run(ctx, async (tx, c) => {
      const a = await this.access(tx, c, v, employeeId);
      if (!has(v, 'employee.profile.view')) throw new ForbiddenException('Missing required permission(s): employee.profile.view');
      const e = await this.employmentOf(tx, c, employeeId);
      const rows = await this.rows(tx, c, e.id);
      const starts = new Set([from]);
      for (const list of [rows.assignment, rows.status, a.pay ? rows.compensation : []] as FactRow[][]) {
        for (const r of list) {
          const f = isoDate(r.validFrom);
          if (f > from && f <= to) starts.add(f);
          const t = iso(r.validTo);
          if (t && t >= from && t < to) starts.add(addDays(t, 1));
        }
      }
      const sorted = [...starts].sort();
      if (a.pay && rows.compensation.length) await this.auditPayView(tx, c, a, employeeId, 'segments');
      const all = sorted.map((s) => this.factsOn(rows, s));
      const names = await this.names(tx, c, all.flatMap((f) => (f.assignment ? [f.assignment] : [])));
      return {
        employee: await this.header(tx, c, employeeId, e),
        payAccess: a.pay,
        segments: sorted.map((s, i) => {
          const f = all[i];
          return {
            from: s,
            to: i + 1 < sorted.length ? addDays(sorted[i + 1], -1) : to,
            assignment: f.assignment ? this.describe(f.assignment, names) : null,
            status: f.status?.status ?? null,
            compensation: a.pay ? f.compensation : null,
          };
        }),
      };
    });
  }

  /** People the viewer may open: everyone for HR, else themselves and their current team (P02 §4.3). */
  listEmployees(ctx: TenantContext, v: Viewer, q: string | undefined) {
    return this.run(ctx, async (tx, c) => {
      const today = todayIst();
      let ids: string[] | null = null;
      if (!has(v, 'employee.profile.view')) {
        const own = await this.ownEmployeeId(tx, c, v);
        if (!own) return [];
        const team = await tx.$queryRaw<{ id: string }[]>`
          WITH RECURSIVE down(id, depth) AS (
            SELECT a.employee_id, 1 FROM employee_assignments a
            WHERE a.organization_id = ${c.organizationId}::uuid AND a.manager_employee_id = ${own}::uuid AND a.superseded_at IS NULL
              AND ${today}::date <@ daterange(a.valid_from, a.valid_to, '[]')
            UNION
            SELECT a.employee_id, down.depth + 1 FROM down JOIN employee_assignments a
              ON a.organization_id = ${c.organizationId}::uuid AND a.manager_employee_id = down.id AND a.superseded_at IS NULL
             AND ${today}::date <@ daterange(a.valid_from, a.valid_to, '[]')
            WHERE down.depth < 50
          )
          SELECT DISTINCT id::text FROM down`;
        ids = [own, ...team.map((t) => t.id)];
      }
      const term = q?.trim();
      const people = await tx.employee.findMany({
        where: {
          organizationId: c.organizationId,
          ...(ids ? { id: { in: ids } } : {}),
          ...(term ? { OR: [{ givenName: { contains: term, mode: 'insensitive' } }, { familyName: { contains: term, mode: 'insensitive' } }, { preferredName: { contains: term, mode: 'insensitive' } }] } : {}),
        },
        orderBy: [{ givenName: 'asc' }, { familyName: 'asc' }],
        take: 500,
      });
      const employments = await tx.employment.findMany({ where: { organizationId: c.organizationId, employeeId: { in: people.map((p) => p.id) } }, orderBy: { joinedOn: 'desc' } });
      const current = await tx.employeeAssignment.findMany({
        where: { organizationId: c.organizationId, employeeId: { in: people.map((p) => p.id) }, supersededAt: null, validFrom: { lte: asDate(today) }, OR: [{ validTo: null }, { validTo: { gte: asDate(today) } }] },
      });
      const names = await this.names(tx, c, current.map((r) => assignmentValues({ ...r, costCentres: [], dottedLines: [] })));
      return people.map((p) => {
        const e = employments.find((x) => x.employeeId === p.id);
        const a = current.find((x) => x.employeeId === p.id);
        return {
          id: p.id,
          name: displayName(p),
          employeeCode: e?.employeeCode ?? null,
          legalEntityId: e?.legalEntityId ?? null,
          joinedOn: e ? isoDate(e.joinedOn) : null,
          designation: a ? (names.designations.get(a.designationId)?.name ?? null) : null,
          department: a ? (names.departments.get(a.departmentId)?.name ?? null) : null,
          location: a ? (names.locations.get(a.locationId)?.name ?? null) : null,
        };
      });
    });
  }

  // ================= changes: the only write path (P06 §4.3) =================

  changeView(ch: ChangeRow, pay: boolean) {
    const payload = ch.payload as ChangePayload;
    const impact = ch.impact as Record<string, unknown> | null;
    return {
      id: ch.id,
      employeeId: ch.employeeId,
      changeType: ch.changeType,
      effectiveDate: isoDate(ch.effectiveDate),
      status: ch.status,
      reason: ch.reason,
      overrideReason: ch.overrideReason,
      // A change dated before the day it was raised rewrites the past (P06 §4.5, shown as a correction).
      retro: isoDate(ch.effectiveDate) < isoDate(ch.requestedAt),
      requestedBy: ch.requestedBy,
      requestedAt: ch.requestedAt,
      decidedBy: ch.decidedBy,
      decidedAt: ch.decidedAt,
      decisionNote: ch.decisionNote,
      appliedAt: ch.appliedAt,
      // R1: pay values only with pay access; others learn only that pay is part of the change.
      touchesPay: Boolean(payload.compensation),
      batchId: ch.batchId,
      payload: pay ? payload : { ...payload, compensation: undefined },
      impact: impact ? (pay ? impact : redactImpact(impact)) : null,
    };
  }

  async lockEmployment(tx: Tx, c: CompanyContext, employmentId: string) {
    // One writer per employment at a time: concurrent changes rebuild the same rows.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`employment:${c.organizationId}:${employmentId}`}))`;
  }

  private async openEmployment(tx: Tx, c: CompanyContext, employeeId: string): Promise<Employment> {
    const e = await tx.employment.findFirst({ where: { organizationId: c.organizationId, employeeId, exitedOn: null } });
    if (!e) throw new NotFoundException('No open employment for that employee');
    return e;
  }

  /** YX-HIS-12: limit from the company setting, default the start of the entity's financial year. */
  async retroLimit(tx: Tx, c: CompanyContext, legalEntityId: string, today: string): Promise<string> {
    const entity = await tx.legalEntity.findFirstOrThrow({ where: { id: legalEntityId, organizationId: c.organizationId }, select: { fyStartMonth: true } });
    const rows = await tx.setting.findMany({ where: { organizationId: c.organizationId, key: 'employee_change.retro_limit' } });
    const { value } = resolveSetting(SETTINGS['employee_change.retro_limit'], rows.map((r) => ({ id: r.id, scopeType: r.scopeType, scopeId: r.scopeId, value: r.value, validFrom: null })), { tenant: c.organizationId }, null);
    return fyStart(today, entity.fyStartMonth, value === 'previous_fy' ? 1 : 0);
  }

  /** Who may make a change reaching this far back (YX-HIS-12 tiers 1 and 3; tier 2 arrives with payroll). */
  async checkReach(tx: Tx, c: CompanyContext, v: Viewer, e: Employment, date: string, overrideReason: string | null | undefined): Promise<Reach> {
    const today = todayIst();
    const r = reach(date, today, await this.retroLimit(tx, c, e.legalEntityId, today));
    if (r === 'retro' && !has(v, 'employee.change.retro')) throw new ForbiddenException('A past-dated change needs employee.change.retro (YX-HIS-12).');
    if (r === 'before_limit') {
      if (!has(v, 'employee.change.retro_override')) throw new ForbiddenException('A change before the retro limit needs employee.change.retro_override (YX-HIS-12).');
      if (!overrideReason) throw new BadRequestException('Give the reason for going back before the retro limit (YX-HIS-12).');
    }
    return r;
  }

  /**
   * Every id in the payload belongs to this company, is live, and is open to the employment's legal entity
   * (YX-ORG-04, YX-ORG-08, YX-ORG-15). The database proves the entity again through composite keys.
   */
  private async checkRefs(tx: Tx, c: CompanyContext, e: Employment, p: ChangePayload) {
    const org = c.organizationId;
    const entity = e.legalEntityId;
    const a = p.assignment;
    if (a) {
      const usable = (m: { archivedAt: Date | null; ownerLegalEntityId: string | null; appliesToEntities: string[] } | null, what: string) => {
        if (!m) throw new BadRequestException(`No such ${what} in this company.`);
        if (m.archivedAt) throw new BadRequestException(`That ${what} is archived (YX-ORG-04).`);
        if (m.ownerLegalEntityId ? m.ownerLegalEntityId !== entity : m.appliesToEntities.length > 0 && !m.appliesToEntities.includes(entity)) {
          throw new BadRequestException(`That ${what} is not available to the employee's legal entity (YX-ORG-15).`);
        }
      };
      const sel = { archivedAt: true, ownerLegalEntityId: true, appliesToEntities: true } as const;
      if (a.departmentId) usable(await tx.department.findFirst({ where: { id: a.departmentId, organizationId: org }, select: sel }), 'department');
      if (a.designationId) usable(await tx.designation.findFirst({ where: { id: a.designationId, organizationId: org }, select: sel }), 'designation');
      if (a.gradeId) usable(await tx.grade.findFirst({ where: { id: a.gradeId, organizationId: org }, select: sel }), 'grade');
      if (a.employmentTypeId) usable(await tx.employmentType.findFirst({ where: { id: a.employmentTypeId, organizationId: org }, select: sel }), 'employment type');
      if (a.locationId) {
        const loc = await tx.location.findFirst({ where: { id: a.locationId, organizationId: org } });
        if (!loc) throw new BadRequestException('No such location in this company.');
        if (loc.archivedAt) throw new BadRequestException('That location is archived (YX-ORG-04).');
        if (loc.legalEntityId !== entity) throw new BadRequestException("The location belongs to another legal entity (YX-ORG-08).");
      }
      for (const share of a.costCentres ?? []) {
        const cc = await tx.costCentre.findFirst({ where: { id: share.costCentreId, organizationId: org } });
        if (!cc) throw new BadRequestException('No such cost centre in this company.');
        if (cc.archivedAt) throw new BadRequestException('That cost centre is archived (YX-ORG-04).');
        if (cc.legalEntityId !== entity) throw new BadRequestException('The cost centre belongs to another legal entity (YX-ORG-08).');
      }
      for (const managerId of [...(a.managerEmployeeId ? [a.managerEmployeeId] : []), ...(a.dottedLineManagerIds ?? [])]) {
        if (managerId === e.employeeId) throw new BadRequestException('Nobody reports to themselves (YX-ORG-09).');
        const m = await tx.employee.findFirst({ where: { id: managerId, organizationId: org }, select: { id: true } });
        if (!m) throw new BadRequestException('No such manager in this company (YX-ORG-09).');
      }
    }
    if (p.compensation?.currency && !isCurrency(p.compensation.currency)) throw new BadRequestException('Unknown currency');
  }

  private checkPayload(type: ChangeType, p: ChangePayload, v: Viewer) {
    const problem = payloadProblem(type, p);
    if (problem) throw new BadRequestException(problem);
    // R1: only pay access may set pay.
    if (p.compensation && (!has(v, 'employee.salary.manage') || v.actingForOther)) throw new ForbiddenException('Changing pay needs employee.salary.manage.');
  }

  /**
   * Re-materialise an employment's dated rows from `from` (P06 §4.3-4.5): supersede every current row that
   * reaches `from`, keep the part before it, and fold every approved change dated `from` or later on top.
   * A later scheduled change is thereby rebased onto the new values (YX-HIS-06). Public for the demo seed,
   * which writes its history through the same path.
   */
  async rebuild(tx: Tx, c: CompanyContext, e: Employment, from: string, byChangeId: string) {
    const org = c.organizationId;
    const [{ now }] = await tx.$queryRaw<{ now: Date }[]>`SELECT now()::timestamptz(3) AS now`;
    const changes: FoldChange[] = (
      await tx.employeeChange.findMany({ where: { organizationId: org, employmentId: e.id, status: { in: ACTIVE }, effectiveDate: { gte: asDate(from) } }, orderBy: [{ effectiveDate: 'asc' }, { seq: 'asc' }] })
    ).map((ch) => ({ id: ch.id, effectiveDate: isoDate(ch.effectiveDate), payload: ch.payload as ChangePayload }));
    const current = await this.rows(tx, c, e.id);
    const insert = async (fact: Fact, seg: Segment<unknown>) => {
      const base = { organizationId: org, employmentId: e.id, validFrom: asDate(seg.from), validTo: seg.to ? asDate(seg.to) : null, changeId: seg.changeId, recordedAt: now };
      if (fact === 'assignment') {
        const v = seg.values as AssignmentValues;
        const { costCentres, dottedLineManagerIds, ...cols } = v;
        const row = await tx.employeeAssignment.create({ data: { ...base, ...cols, legalEntityId: e.legalEntityId, employeeId: e.employeeId } });
        if (costCentres.length) {
          await tx.assignmentCostCentre.createMany({ data: costCentres.map((x) => ({ organizationId: org, legalEntityId: e.legalEntityId, assignmentId: row.id, costCentreId: x.costCentreId, percent: x.percent })) });
        }
        if (dottedLineManagerIds.length) {
          await tx.assignmentDottedLineManager.createMany({ data: dottedLineManagerIds.map((m) => ({ organizationId: org, employeeId: e.employeeId, assignmentId: row.id, managerEmployeeId: m })) });
        }
      } else if (fact === 'status') {
        await tx.employmentStatusPeriod.create({ data: { ...base, status: (seg.values as StatusValues).status } });
      } else {
        await tx.compensation.create({ data: { ...base, ...(seg.values as CompensationValues) } });
      }
    };
    for (const fact of FACTS) {
      // The rows in force on or after the day before `from`: the first of them is the base the fold continues.
      const reaching = (current[fact] as FactRow[]).filter((r) => !r.validTo || isoDate(r.validTo) >= addDays(from, -1));
      const before = reaching.find((r) => isoDate(r.validFrom) < from);
      const segments = fold(fact, before ? { from: isoDate(before.validFrom), to: null, changeId: before.changeId, values: values(fact, before) } : null, changes);
      // Nothing moves for this fact: keep its rows as they are.
      const same =
        segments.length === reaching.length &&
        segments.every((s, i) => s.from === isoDate(reaching[i].validFrom) && s.to === iso(reaching[i].validTo) && s.changeId === reaching[i].changeId && JSON.stringify(s.values) === JSON.stringify(values(fact, reaching[i])));
      if (same) continue;
      if (reaching.length) {
        const supersede = { where: { id: { in: reaching.map((r) => r.id) } }, data: { supersededAt: now, supersededByChangeId: byChangeId } };
        if (fact === 'assignment') await tx.employeeAssignment.updateMany(supersede);
        else if (fact === 'status') await tx.employmentStatusPeriod.updateMany(supersede);
        else await tx.compensation.updateMany(supersede);
      }
      for (const seg of segments) await insert(fact, seg);
    }
    await this.checkInvariants(tx, c, e);
  }

  /** YX-HIS-03 continuity and YX-ORG-09 managers, proven on the stored rows with range aggregates. */
  private async checkInvariants(tx: Tx, c: CompanyContext, e: Employment) {
    const org = c.organizationId;
    const [cover] = await tx.$queryRaw<{ assignment: string | null; status: string | null; compensation: string | null }[]>`
      SELECT
        (SELECT range_agg(daterange(valid_from, valid_to, '[]'))::text FROM employee_assignments WHERE organization_id = ${org}::uuid AND employment_id = ${e.id}::uuid AND superseded_at IS NULL) AS assignment,
        (SELECT range_agg(daterange(valid_from, valid_to, '[]'))::text FROM employment_status_periods WHERE organization_id = ${org}::uuid AND employment_id = ${e.id}::uuid AND superseded_at IS NULL) AS status,
        (SELECT range_agg(daterange(valid_from, valid_to, '[]'))::text FROM compensations WHERE organization_id = ${org}::uuid AND employment_id = ${e.id}::uuid AND superseded_at IS NULL) AS compensation`;
    const end = e.exitedOn ? `${addDays(isoDate(e.exitedOn), 1)})` : ')';
    const whole = `{[${isoDate(e.joinedOn)},${end}}`;
    if (cover.assignment !== whole || cover.status !== whole) throw new ConflictException('The assignment and status must cover every day from joining, with no gaps (YX-HIS-03, YX-ORG-07).');
    if (cover.compensation !== null && !/^\{\[\d{4}-\d{2}-\d{2},(\d{4}-\d{2}-\d{2})?\)\}$/.test(cover.compensation)) throw new ConflictException('Pay must run without gaps once set (YX-HIS-03).');
    // YX-ORG-09: the manager is employed on every day they manage the person ...
    const [orphan] = await tx.$queryRaw<{ from: string }[]>`
      SELECT a.valid_from::text AS "from" FROM employee_assignments a
      WHERE a.organization_id = ${org}::uuid AND a.employment_id = ${e.id}::uuid AND a.superseded_at IS NULL AND a.manager_employee_id IS NOT NULL
        AND NOT daterange(a.valid_from, a.valid_to, '[]') <@ COALESCE((
          SELECT range_agg(daterange(m.valid_from, m.valid_to, '[]')) FROM employee_assignments m
          WHERE m.organization_id = ${org}::uuid AND m.employee_id = a.manager_employee_id AND m.superseded_at IS NULL), '{}'::datemultirange)
      LIMIT 1`;
    if (orphan) throw new BadRequestException(`The manager is not employed on every day from ${orphan.from} (YX-ORG-09).`);
    // Dotted-line managers too (M01 Q5): an employee of the company on every day of the assignment.
    const [dottedOrphan] = await tx.$queryRaw<{ from: string }[]>`
      SELECT a.valid_from::text AS "from" FROM employee_assignments a
      JOIN assignment_dotted_line_managers d ON d.organization_id = a.organization_id AND d.assignment_id = a.id
      WHERE a.organization_id = ${org}::uuid AND a.employment_id = ${e.id}::uuid AND a.superseded_at IS NULL
        AND NOT daterange(a.valid_from, a.valid_to, '[]') <@ COALESCE((
          SELECT range_agg(daterange(m.valid_from, m.valid_to, '[]')) FROM employee_assignments m
          WHERE m.organization_id = ${org}::uuid AND m.employee_id = d.manager_employee_id AND m.superseded_at IS NULL), '{}'::datemultirange)
      LIMIT 1`;
    if (dottedOrphan) throw new BadRequestException(`A dotted-line manager is not employed on every day from ${dottedOrphan.from} (YX-ORG-09).`);
    // ... and the reporting chain never loops back to the person.
    const loop = await this.chainPeriods(tx, c, e.employeeId, e.employeeId);
    if (loop.length) throw new BadRequestException(`That would make a reporting loop from ${loop[0][0]} (YX-ORG-09).`);
  }

  /** P06 §4.3 / YX-HIS-11: what changes on the effective date, and which later changes are rebased. */
  private async applyWithImpact(tx: Tx, c: CompanyContext, e: Employment, ch: ChangeRow, from: string, today: string) {
    const date = isoDate(ch.effectiveDate);
    const later = await tx.employeeChange.findMany({
      where: { organizationId: c.organizationId, employmentId: e.id, status: { in: ACTIVE }, effectiveDate: { gt: ch.effectiveDate }, NOT: { id: ch.id } },
      orderBy: [{ effectiveDate: 'asc' }, { seq: 'asc' }],
    });
    const dates = [date, ...new Set(later.map((l) => isoDate(l.effectiveDate)))];
    const beforeRows = await this.rows(tx, c, e.id);
    const before = dates.map((d) => this.factsOn(beforeRows, d));
    await this.rebuild(tx, c, e, from, ch.id);
    const afterRows = await this.rows(tx, c, e.id);
    const after = dates.map((d) => this.factsOn(afterRows, d));
    const names = await this.names(tx, c, [...before, ...after].flatMap((f) => (f.assignment ? [f.assignment] : [])));
    const own = this.diff(before[0], after[0], names);
    const rebased = later
      .map((l) => {
        const i = dates.indexOf(isoDate(l.effectiveDate));
        return { changeId: l.id, changeType: l.changeType, effectiveDate: dates[i], ...this.diff(before[i], after[i], names) };
      })
      .filter((r) => r.facts.length || r.pay.length);
    return {
      effectiveDate: date,
      ...own,
      rebased,
      // P06 §4.5: past periods the change touches, for payroll arrears / recoveries (Q4).
      retro: date < today ? { from: date, months: affectedMonths(date, today) } : null,
    };
  }

  private diff(b: Facts, a: Facts, n: Awaited<ReturnType<EmployeeHistoryService['names']>>) {
    const facts: { fact: string; from: string | null; to: string | null }[] = [];
    const push = (fact: string, from: string | null | undefined, to: string | null | undefined) => {
      if ((from ?? null) !== (to ?? null)) facts.push({ fact, from: from ?? null, to: to ?? null });
    };
    const da = b.assignment ? this.describe(b.assignment, n) : null;
    const db = a.assignment ? this.describe(a.assignment, n) : null;
    push('Location', da?.location.name, db?.location.name);
    // Derived effects the location carries (P06 §4.3): professional tax / LWF state and the clock it runs on.
    push('State (professional tax, LWF, holidays)', da?.location.state, db?.location.state);
    push('Time zone', da?.location.timezone, db?.location.timezone);
    push('Department', da?.department?.name, db?.department?.name);
    push('Designation', da?.designation?.name, db?.designation?.name);
    push('Grade', da?.grade?.name, db?.grade?.name);
    push('Employment type', da?.employmentType?.name, db?.employmentType?.name);
    push('Manager (approvals route here)', da?.manager?.name, db?.manager?.name);
    const dotted = (d: typeof da) => d?.dottedLineManagers.map((x) => x.name ?? x.id).join(', ') || null;
    push('Dotted-line managers (visibility only)', dotted(da), dotted(db));
    const ccs = (d: typeof da) => d?.costCentres.map((x) => `${x.code} ${x.percent}%`).join(', ') || null;
    push('Cost centres', ccs(da), ccs(db));
    push('Employment status', b.status?.status, a.status?.status);
    const money = (p: CompensationValues | null) => (p ? `${p.currency} ${p.annualCtc}` : null);
    const pay = (money(b.compensation) ?? null) !== (money(a.compensation) ?? null) ? [{ fact: 'Annual CTC', from: money(b.compensation), to: money(a.compensation) }] : [];
    return { facts, pay };
  }

  /**
   * P02 YX-SEC-27 / M01 §3.10: without employee.change.manage, a holder of request.raise_on_behalf may raise a
   * promotion, transfer, re-designation or manager change for someone in their current reporting subtree
   * (never themselves). They can never approve it (YX-SEC-11 covers the requester).
   */
  async checkOnBehalf(tx: Tx, c: CompanyContext, v: Viewer, type: ChangeType, subjectId: string) {
    if (!has(v, 'request.raise_on_behalf') || v.actingForOther) throw new ForbiddenException('Missing required permission(s): employee.change.manage');
    if (!ON_BEHALF_TYPES.includes(type)) throw new ForbiddenException('Managers raise promotions, transfers, re-designations and manager changes; HR raises the rest.');
    const own = await this.ownEmployeeId(tx, c, v);
    const today = todayIst();
    const periods = own && own !== subjectId ? await this.chainPeriods(tx, c, subjectId, own) : [];
    // Not in their team today: the same answer as an unknown person (no existence leak).
    if (!periods.some(([f, t]) => covers(f, t, today))) throw new NotFoundException('No open employment for that employee');
  }

  /** Validate and store a requested change (pending). */
  async createChange(tx: Tx, c: CompanyContext, v: Viewer, dto: ChangeRequestDto) {
    const payload = toPayload(dto.payload);
    this.checkPayload(dto.changeType, payload, v);
    const e = await this.openEmployment(tx, c, dto.employeeId);
    await this.lockEmployment(tx, c, e.id);
    if (!has(v, 'employee.change.manage')) await this.checkOnBehalf(tx, c, v, dto.changeType, e.employeeId);
    if (dto.effectiveDate < isoDate(e.joinedOn)) throw new BadRequestException('The effective date is before the employee joined.');
    await this.checkReach(tx, c, v, e, dto.effectiveDate, dto.overrideReason);
    await this.checkRefs(tx, c, e, payload);
    const ch = await tx.employeeChange.create({
      data: {
        organizationId: c.organizationId,
        employeeId: e.employeeId,
        employmentId: e.id,
        changeType: dto.changeType,
        effectiveDate: asDate(dto.effectiveDate),
        status: 'pending',
        payload: payload as Prisma.InputJsonObject,
        reason: dto.reason.trim(),
        overrideReason: dto.overrideReason?.trim() ?? null,
        requestedBy: c.userId,
      },
    });
    return { ch, e };
  }

  /** Approve (or simulate approving) a pending change: materialise it and compute its impact. */
  async approveIn(tx: Tx, c: CompanyContext, v: Viewer, ch: ChangeRow, e: Employment, opts: { confirmRebase: boolean; note?: string; simulate: boolean }) {
    const payload = ch.payload as ChangePayload;
    const date = isoDate(ch.effectiveDate);
    if (!opts.simulate) {
      // YX-SEC-11: no self-approval, neither by the requester nor by the person the change is about.
      if (ch.requestedBy && ch.requestedBy === c.userId) throw new ForbiddenException('You raised this change, so someone else approves it (YX-SEC-11).');
      if ((await this.ownEmployeeId(tx, c, v)) === ch.employeeId) throw new ForbiddenException('A change about yourself is approved by someone else (YX-SEC-11).');
      // R1: the approver sees what they approve.
      if (payload.compensation && !has(v, 'employee.salary.view')) throw new ForbiddenException('This change includes pay: approving it needs employee.salary.view.');
      // A change approved after its date reaches back from the approval day (YX-HIS-12).
      await this.checkReach(tx, c, v, e, date, ch.overrideReason);
    }
    await this.checkRefs(tx, c, e, payload);
    const today = todayIst();
    const status = 'scheduled';
    await tx.employeeChange.update({ where: { id: ch.id }, data: { status, decidedBy: c.userId, decidedAt: new Date(), decisionNote: opts.note?.trim() || null } });
    const impact = await this.applyWithImpact(tx, c, e, ch, date, today);
    // YX-HIS-04: effective now when the day has started in the employee's location.
    const tz = await this.timezoneOn(tx, c, e.id, date);
    const effectiveNow = date <= localToday(tz);
    if (!opts.simulate && impact.rebased.length && !opts.confirmRebase) {
      throw new ConflictException({ statusCode: 409, code: 'REBASE_CONFIRMATION_REQUIRED', message: 'Later changes are recalculated on the new values. Review them and confirm (YX-HIS-06).', impact: this.changeImpactView(impact, has(v, 'employee.salary.view') && !v.actingForOther) });
    }
    const updated = await tx.employeeChange.update({
      where: { id: ch.id },
      data: { impact: impact as unknown as Prisma.InputJsonObject, ...(effectiveNow ? { status: 'effective', appliedAt: new Date() } : {}) },
    });
    return { updated, impact, effectiveNow };
  }

  changeImpactView(impact: object, pay: boolean) {
    return pay ? impact : redactImpact(impact as Record<string, unknown>);
  }

  async timezoneOn(tx: Tx, c: CompanyContext, employmentId: string, date: string): Promise<string> {
    const a = await tx.employeeAssignment.findFirst({
      where: { organizationId: c.organizationId, employmentId, supersededAt: null, validFrom: { lte: asDate(date) }, OR: [{ validTo: null }, { validTo: { gte: asDate(date) } }] },
      select: { locationId: true },
    });
    const loc = a ? await tx.location.findFirst({ where: { id: a.locationId, organizationId: c.organizationId }, select: { timezone: true } }) : null;
    return loc?.timezone ?? 'Asia/Kolkata';
  }

  async afterApply(tx: Tx, c: CompanyContext, ch: ChangeRow, impact: { retro: unknown }, effectiveNow: boolean) {
    await audit(tx, c, 'employee.change.approved', 'employee', ch.employeeId, { changeId: ch.id, changeType: ch.changeType, effectiveDate: isoDate(ch.effectiveDate) });
    // YX-HIS-05: the employee.change.effective event (P04 notifications, P09 metrics, P02 grants).
    if (effectiveNow) await audit(tx, c, 'employee.change.effective', 'employee', ch.employeeId, { changeId: ch.id, changeType: ch.changeType, effectiveDate: isoDate(ch.effectiveDate) });
    // P06 §4.5: the downstream signal for payroll arrears / recoveries.
    if (impact.retro) await audit(tx, c, 'employee.change.retro_applied', 'employee', ch.employeeId, { changeId: ch.id, ...(impact.retro as object) });
  }

  /** P06 §4.3 impact preview of a change not yet saved (YX-HIS-11). Nothing is kept. */
  previewRequest(ctx: TenantContext, v: Viewer, dto: ChangeRequestDto) {
    return this.preview(ctx, async (tx, c) => {
      const { ch, e } = await this.createChange(tx, c, v, dto);
      const { impact } = await this.approveIn(tx, c, v, ch, e, { confirmRebase: true, simulate: true });
      return { reach: reach(dto.effectiveDate, todayIst(), await this.retroLimit(tx, c, e.legalEntityId, todayIst())), impact: this.changeImpactView(impact, has(v, 'employee.salary.view') && !v.actingForOther) };
    });
  }

  requestChange(ctx: TenantContext, v: Viewer, dto: ChangeRequestDto) {
    return this.run(ctx, async (tx, c) => {
      const { ch } = await this.createChange(tx, c, v, dto);
      await audit(tx, c, 'employee.change.requested', 'employee', ch.employeeId, { changeId: ch.id, changeType: ch.changeType, effectiveDate: dto.effectiveDate, touchesPay: Boolean(dto.payload.compensation) });
      return this.changeView(ch, has(v, 'employee.salary.view') && !v.actingForOther);
    });
  }

  async changeOr404(tx: Tx, c: CompanyContext, id: string): Promise<ChangeRow> {
    const ch = await tx.employeeChange.findFirst({ where: { id, organizationId: c.organizationId } });
    if (!ch) throw new NotFoundException('Change not found');
    return ch;
  }

  async employmentById(tx: Tx, c: CompanyContext, id: string): Promise<Employment> {
    return tx.employment.findFirstOrThrow({ where: { id, organizationId: c.organizationId } });
  }

  listChanges(ctx: TenantContext, v: Viewer, q: { status?: string; employeeId?: string; from?: string; to?: string }) {
    return this.run(ctx, async (tx, c) => {
      const rows = await tx.employeeChange.findMany({
        where: {
          organizationId: c.organizationId,
          // A manager raising on behalf sees the changes they raised, nothing else (P02 §4.3).
          ...(changeDesk(v) ? {} : { requestedBy: v.userId ?? '00000000-0000-0000-0000-000000000000' }),
          ...(q.status ? { status: q.status } : {}),
          ...(q.employeeId ? { employeeId: q.employeeId } : {}),
          ...(q.from || q.to ? { effectiveDate: { ...(q.from ? { gte: asDate(q.from) } : {}), ...(q.to ? { lte: asDate(q.to) } : {}) } } : {}),
        },
        orderBy: [{ effectiveDate: 'asc' }, { seq: 'asc' }],
        take: 500,
      });
      const people = await tx.employee.findMany({ where: { organizationId: c.organizationId, id: { in: [...new Set(rows.map((r) => r.employeeId))] } } });
      const pay = has(v, 'employee.salary.view') && !v.actingForOther;
      return rows.map((r) => {
        const p = people.find((x) => x.id === r.employeeId);
        return { ...this.changeView(r, pay), employeeName: p ? displayName(p) : null };
      });
    });
  }

  getChange(ctx: TenantContext, v: Viewer, id: string) {
    return this.run(ctx, async (tx, c) => {
      const ch = await this.changeOr404(tx, c, id);
      if (!changeDesk(v) && ch.requestedBy !== v.userId) throw new NotFoundException('Change not found');
      return this.changeView(ch, has(v, 'employee.salary.view') && !v.actingForOther);
    });
  }

  /** M01 §3.3: a change raised in a bulk batch is approved, rejected and changed with its batch while that is open. */
  async notInOpenBatch(tx: Tx, c: CompanyContext, ch: ChangeRow) {
    if (!ch.batchId) return;
    const batch = await tx.employeeChangeBatch.findFirst({ where: { id: ch.batchId, organizationId: c.organizationId }, select: { status: true } });
    if (batch?.status === 'pending') throw new ConflictException('This change is part of a bulk change still waiting for approval: decide it with its batch.');
  }

  /** The impact of approving a pending change, without approving it. */
  previewChange(ctx: TenantContext, v: Viewer, id: string) {
    return this.preview(ctx, async (tx, c) => {
      const ch = await this.changeOr404(tx, c, id);
      if (ch.status !== 'pending') throw new ConflictException('Only a pending change can be previewed.');
      const e = await this.employmentById(tx, c, ch.employmentId);
      await this.lockEmployment(tx, c, e.id);
      const { impact } = await this.approveIn(tx, c, v, ch, e, { confirmRebase: true, simulate: true });
      return this.changeImpactView(impact, has(v, 'employee.salary.view') && !v.actingForOther);
    });
  }

  approve(ctx: TenantContext, v: Viewer, id: string, confirmRebase: boolean, note?: string) {
    return this.run(ctx, async (tx, c) => {
      const ch = await this.changeOr404(tx, c, id);
      const e = await this.employmentById(tx, c, ch.employmentId);
      await this.lockEmployment(tx, c, e.id);
      const fresh = await this.changeOr404(tx, c, id);
      if (fresh.status !== 'pending') throw new ConflictException(`This change is ${fresh.status}.`);
      await this.notInOpenBatch(tx, c, fresh);
      if (e.exitedOn) throw new ConflictException('The employment has ended.');
      const { updated, impact, effectiveNow } = await this.approveIn(tx, c, v, fresh, e, { confirmRebase, note, simulate: false });
      await this.afterApply(tx, c, updated, impact, effectiveNow);
      return this.changeView(updated, has(v, 'employee.salary.view') && !v.actingForOther);
    });
  }

  reject(ctx: TenantContext, v: Viewer, id: string, reason: string) {
    return this.run(ctx, async (tx, c) => {
      const ch = await this.changeOr404(tx, c, id);
      if (ch.status !== 'pending') throw new ConflictException(`This change is ${ch.status}.`);
      await this.notInOpenBatch(tx, c, ch);
      if (ch.requestedBy && ch.requestedBy === c.userId) throw new ForbiddenException('You raised this change: cancel it instead.');
      const updated = await tx.employeeChange.update({ where: { id }, data: { status: 'rejected', decidedBy: c.userId, decidedAt: new Date(), decisionNote: reason.trim() } });
      await audit(tx, c, 'employee.change.rejected', 'employee', ch.employeeId, { changeId: id });
      return this.changeView(updated, has(v, 'employee.salary.view') && !v.actingForOther);
    });
  }

  /**
   * Q7: a pending or scheduled change can be edited until it takes effect. Changing its date or values
   * sends a scheduled change back for approval (its rows are withdrawn); a new reason alone just saves.
   */
  edit(ctx: TenantContext, v: Viewer, id: string, dto: ChangeEditDto) {
    return this.run(ctx, async (tx, c) => {
      const ch = await this.changeOr404(tx, c, id);
      const e = await this.employmentById(tx, c, ch.employmentId);
      await this.lockEmployment(tx, c, e.id);
      const fresh = await this.changeOr404(tx, c, id);
      if (fresh.status !== 'pending' && fresh.status !== 'scheduled') throw new ConflictException(`A ${fresh.status} change cannot be edited; raise a correction instead.`);
      await this.notInOpenBatch(tx, c, fresh);
      const oldDate = isoDate(fresh.effectiveDate);
      const date = dto.effectiveDate ?? oldDate;
      const payload = dto.payload ? toPayload(dto.payload) : (fresh.payload as ChangePayload);
      const routing = date !== oldDate || (dto.payload !== undefined && JSON.stringify(payload) !== JSON.stringify(fresh.payload));
      // R1: pay already on the change, or put on it, is only touched with pay access.
      if (((fresh.payload as ChangePayload).compensation || payload.compensation) && (!has(v, 'employee.salary.manage') || v.actingForOther)) {
        throw new ForbiddenException('This change includes pay: editing it needs employee.salary.manage.');
      }
      if (routing) {
        this.checkPayload(fresh.changeType as ChangeType, payload, v);
        if (date < isoDate(e.joinedOn)) throw new BadRequestException('The effective date is before the employee joined.');
        await this.checkReach(tx, c, v, e, date, dto.overrideReason ?? fresh.overrideReason);
        await this.checkRefs(tx, c, e, payload);
      }
      const updated = await tx.employeeChange.update({
        where: { id },
        data: {
          effectiveDate: asDate(date),
          payload: payload as Prisma.InputJsonObject,
          ...(dto.reason ? { reason: dto.reason.trim() } : {}),
          ...(dto.overrideReason ? { overrideReason: dto.overrideReason.trim() } : {}),
          // YX-SEC-11: whoever rewrites the change has made it, so they cannot approve it.
          ...(routing ? { status: 'pending', requestedBy: c.userId, decidedBy: null, decidedAt: null, impact: Prisma.DbNull } : {}),
        },
      });
      // Back to approval: withdraw its rows; later changes fall back onto the values before it.
      if (routing && fresh.status === 'scheduled') await this.rebuild(tx, c, e, oldDate, id);
      await audit(tx, c, 'employee.change.edited', 'employee', ch.employeeId, { changeId: id, backToApproval: routing && fresh.status === 'scheduled', fields: Object.keys(dto) });
      return this.changeView(updated, has(v, 'employee.salary.view') && !v.actingForOther);
    });
  }

  /** Q7: cancel a pending or scheduled change, with a reason; a scheduled one's rows are withdrawn. */
  cancel(ctx: TenantContext, v: Viewer, id: string, reason: string, confirmRebase: boolean) {
    return this.run(ctx, async (tx, c) => {
      const ch = await this.changeOr404(tx, c, id);
      const e = await this.employmentById(tx, c, ch.employmentId);
      await this.lockEmployment(tx, c, e.id);
      const fresh = await this.changeOr404(tx, c, id);
      if (fresh.status !== 'pending' && fresh.status !== 'scheduled') throw new ConflictException(`A ${fresh.status} change cannot be cancelled; raise a correction instead.`);
      await this.notInOpenBatch(tx, c, fresh);
      // A manager raising on behalf withdraws only their own request, before it is decided (YX-SEC-27).
      if (!has(v, 'employee.change.manage') && (fresh.requestedBy !== c.userId || fresh.status !== 'pending')) throw new NotFoundException('Change not found');
      if ((fresh.payload as ChangePayload).compensation && (!has(v, 'employee.salary.manage') || v.actingForOther)) throw new ForbiddenException('This change includes pay: cancelling it needs employee.salary.manage.');
      const updated = await tx.employeeChange.update({ where: { id }, data: { status: 'cancelled', decisionNote: reason.trim(), decidedBy: c.userId, decidedAt: new Date() } });
      if (fresh.status === 'scheduled') {
        const date = isoDate(fresh.effectiveDate);
        const later = await tx.employeeChange.findMany({ where: { organizationId: c.organizationId, employmentId: e.id, status: { in: ACTIVE }, effectiveDate: { gt: fresh.effectiveDate } } });
        const beforeRows = await this.rows(tx, c, e.id);
        const before = later.map((l) => this.factsOn(beforeRows, isoDate(l.effectiveDate)));
        await this.rebuild(tx, c, e, date, id);
        const afterRows = await this.rows(tx, c, e.id);
        const changed = later.filter((l, i) => JSON.stringify(this.factsOn(afterRows, isoDate(l.effectiveDate))) !== JSON.stringify(before[i]));
        if (changed.length && !confirmRebase) {
          throw new ConflictException({ statusCode: 409, code: 'REBASE_CONFIRMATION_REQUIRED', message: 'Later changes are recalculated without this one. Confirm (YX-HIS-06).', rebased: changed.map((l) => ({ changeId: l.id, changeType: l.changeType, effectiveDate: isoDate(l.effectiveDate) })) });
        }
      }
      // ponytail: approvers are told through the audit trail until the P04 notification engine lands.
      await audit(tx, c, 'employee.change.cancelled', 'employee', ch.employeeId, { changeId: id, wasStatus: fresh.status, reason: reason.trim() });
      return this.changeView(updated, has(v, 'employee.salary.view') && !v.actingForOther);
    });
  }

  // ================= hiring an employee: the join change (P01 §4.4, P06 §8) =================

  /**
   * A new employee, their employment and its first dated rows, written by a join change that takes effect
   * on the joining date. Hiring approvals belong to onboarding (M01 wave 4); the join is applied directly
   * by HR and audited.
   */
  createEmployee(ctx: TenantContext, v: Viewer, dto: EmployeeCreateDto) {
    const payload = toPayload({ assignment: dto.assignment, status: dto.status, compensation: dto.compensation });
    this.checkPayload('join', payload, v);
    return this.run(ctx, async (tx, c) => {
      const entity = await tx.legalEntity.findFirst({ where: { id: dto.legalEntityId, organizationId: c.organizationId } });
      if (!entity) throw new BadRequestException('No such legal entity in this company.');
      if (entity.archivedAt) throw new BadRequestException('That legal entity is archived.');
      // The login gives its holder the person's own view, pay included (P01 §4.5).
      if (dto.userId) await checkLoginLink(tx, c, dto.userId, dto.workEmail ?? null);
      // P01 §4.5a: the person behind the record (YX-ORG-26/27).
      const personId = await personForEmployee(tx, c, { givenName: dto.givenName, familyName: dto.familyName, preferredName: dto.preferredName, email: dto.workEmail, phone: dto.mobilePhone, personId: dto.personId });
      const person = await tx.employee.create({
        data: {
          organizationId: c.organizationId,
          personId,
          userId: dto.userId ?? null,
          givenName: dto.givenName.trim(),
          familyName: dto.familyName?.trim() || null,
          preferredName: dto.preferredName?.trim() || null,
          workEmail: dto.workEmail ?? null,
          createdBy: c.userId,
        },
      });
      // YX-ORG-16: codes are unique per legal entity or across the company (setting), generated if blank.
      const scopeRows = await tx.setting.findMany({ where: { organizationId: c.organizationId, key: 'employee_code.scope' } });
      const scope = resolveSetting(SETTINGS['employee_code.scope'], scopeRows.map((r) => ({ id: r.id, scopeType: r.scopeType, scopeId: r.scopeId, value: r.value, validFrom: null })), { tenant: c.organizationId }, null).value;
      const codeScopeKey = scope === 'tenant' ? c.organizationId : entity.id;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`employee-code:${c.organizationId}:${codeScopeKey}`}))`;
      const employeeCode = dto.employeeCode ?? (await this.nextCode(tx, c, codeScopeKey));
      const e = await tx.employment.create({
        data: { organizationId: c.organizationId, employeeId: person.id, legalEntityId: entity.id, employeeCode, codeScopeKey, joinedOn: asDate(dto.joinedOn), createdBy: c.userId },
      });
      await this.checkRefs(tx, c, e, payload);
      await addRole(tx, c, personId, 'employee', { table: 'employments', id: e.id }, e.joinedOn);
      if (dto.userId) await addRole(tx, c, personId, 'login', { table: 'users', id: dto.userId }, e.joinedOn);
      // M01 §3.4: a joiner on probation gets the company's probation plan.
      if (dto.status === 'probation') await startProbation(tx, c, e.id, dto.joinedOn, { legalEntityId: entity.id, employmentTypeId: payload.assignment?.employmentTypeId, gradeId: payload.assignment?.gradeId });
      const join = await tx.employeeChange.create({
        data: {
          organizationId: c.organizationId,
          employeeId: person.id,
          employmentId: e.id,
          changeType: 'join',
          effectiveDate: asDate(dto.joinedOn),
          status: 'scheduled',
          payload: payload as Prisma.InputJsonObject,
          reason: dto.reason.trim(),
          requestedBy: c.userId,
          decidedBy: c.userId,
          decidedAt: new Date(),
        },
      });
      await this.rebuild(tx, c, e, dto.joinedOn, join.id);
      const effectiveNow = dto.joinedOn <= localToday(await this.timezoneOn(tx, c, e.id, dto.joinedOn));
      if (effectiveNow) await tx.employeeChange.update({ where: { id: join.id }, data: { status: 'effective', appliedAt: new Date() } });
      await audit(tx, c, 'employee.created', 'employee', person.id, { employmentId: e.id, legalEntityId: entity.id, employeeCode, joinedOn: dto.joinedOn, changeId: join.id, withPay: Boolean(payload.compensation) });
      if (effectiveNow) await audit(tx, c, 'employee.change.effective', 'employee', person.id, { changeId: join.id, changeType: 'join', effectiveDate: dto.joinedOn });
      return { id: person.id, employmentId: e.id, employeeCode, changeId: join.id };
    });
  }

  private async nextCode(tx: Tx, c: CompanyContext, scopeKey: string): Promise<string> {
    const [{ n }] = await tx.$queryRaw<{ n: number | null }[]>`
      SELECT max(substring(employee_code::text FROM '^E([0-9]{1,9})$')::int) AS n
      FROM employments WHERE organization_id = ${c.organizationId}::uuid AND code_scope_key = ${scopeKey}::uuid`;
    return `E${String((n ?? 0) + 1).padStart(4, '0')}`;
  }

  // ================= the daily job (YX-HIS-04 / 05) =================

  /**
   * Marks scheduled changes effective once their date has begun in the employee's location time zone,
   * and emits employee.change.effective. Idempotent: only 'scheduled' rows move, so a re-run does nothing.
   */
  async applyDue(now = new Date()): Promise<number> {
    const SUPER = { organizationId: null, isSuperAdmin: true };
    // Which companies have work: a read-only look across tenants; each company is then handled inside its own RLS context.
    const orgs = await this.tenantPrisma.forTenant(SUPER, (tx) =>
      tx.$queryRaw<{ id: string }[]>`SELECT DISTINCT organization_id::text AS id FROM employee_changes WHERE status = 'scheduled' AND effective_date <= (${now}::timestamptz AT TIME ZONE 'UTC')::date + 1`,
    );
    let applied = 0;
    for (const { id } of orgs) {
      try {
        applied += await this.run({ organizationId: id, isSuperAdmin: false, userId: null }, async (tx, c) => {
          const due = await tx.$queryRaw<{ id: string; employee_id: string; change_type: string; effective_date: string }[]>`
            UPDATE employee_changes ch SET status = 'effective', applied_at = now(), updated_at = now()
            FROM employee_assignments a JOIN locations l ON l.organization_id = a.organization_id AND l.id = a.location_id
            WHERE ch.organization_id = ${c.organizationId}::uuid AND ch.status = 'scheduled'
              AND a.organization_id = ch.organization_id AND a.employment_id = ch.employment_id AND a.superseded_at IS NULL
              AND ch.effective_date <@ daterange(a.valid_from, a.valid_to, '[]')
              AND ch.effective_date <= (${now}::timestamptz AT TIME ZONE l.timezone)::date
            RETURNING ch.id::text, ch.employee_id::text, ch.change_type, ch.effective_date::text`;
          for (const ch of due) await audit(tx, c, 'employee.change.effective', 'employee', ch.employee_id, { changeId: ch.id, changeType: ch.change_type, effectiveDate: ch.effective_date });
          return due.length;
        });
      } catch (e) {
        this.logger.error(`Applying scheduled changes failed for ${id}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    if (applied) this.logger.log(`Applied ${applied} scheduled employee change(s)`);
    return applied;
  }
}

export function displayName(p: { givenName: string; familyName: string | null; preferredName: string | null }): string {
  return p.preferredName || [p.givenName, p.familyName].filter(Boolean).join(' ');
}

/** The DTO as a plain payload (class instances and undefined keys dropped). */
function toPayload(p: { assignment?: object; status?: string; compensation?: object }): ChangePayload {
  return JSON.parse(JSON.stringify(p)) as ChangePayload;
}

/** R1: an impact without pay values. */
export function redactImpact(impact: Record<string, unknown>): Record<string, unknown> {
  const strip = (x: Record<string, unknown>) => ({ ...x, pay: Array.isArray(x.pay) && x.pay.length ? 'hidden' : [] });
  return { ...strip(impact), rebased: Array.isArray(impact.rebased) ? (impact.rebased as Record<string, unknown>[]).map(strip) : [] };
}
