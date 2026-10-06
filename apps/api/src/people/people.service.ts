import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { audit, CompanyContext, Tx } from '../org-structure/org-structure.service';
import { addDays, asDate, isoDate, todayIst } from '../org-structure/org-validation';
import { displayName, EmployeeHistoryService, Viewer } from '../employee-history/employee-history.service';
import { covers, has as holds, managerViewScope, tenantWide } from '../access/scope';
import { localToday } from '../employee-history/history-rules';
import { addRole, checkLoginLink } from './persons';
import { endAfterMonths, settingFor } from './probation';

// People core reads and record actions (P01 §4.4–4.5a; M01 §3.1–3.4, §3.10): directory, org chart,
// reporting subtrees, the manager's team, the person behind a record, employee codes, logins and probation.
// Everything runs in the caller's company under forced RLS (never the platform bypass), through the record
// scope engine (P02 §4.3, access/scope.ts): HR keys reach the people in their grants' scopes; everyone else
// sees colleagues' Public fields (P02 Q4) and their own team. No pay anywhere here (founder rule R1).

const has = (v: Viewer, k: string) => holds(v, k);
/** Holds the HR view key at some scope; which people it reaches is decided per row. */
const hr = (v: Viewer) => has(v, 'employee.profile.view');

/** One person in force on a date: Public fields plus the ids the screens resolve to names. */
interface ActiveRow {
  id: string;
  given_name: string;
  family_name: string | null;
  preferred_name: string | null;
  work_email: string | null;
  employee_code: string;
  legal_entity_id: string;
  joined_on: Date;
  location_id: string;
  department_id: string;
  designation_id: string;
  grade_id: string | null;
  manager_employee_id: string | null;
  dotted: string[];
  /** employee.profile.view reaches this person on the date (P02 §4.3): Internal fields and code search. */
  in_scope: boolean;
  total: bigint;
}

/** LIKE pattern for a user's search text: wildcards in the text match themselves. */
const like = (term: string) => `%${term.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;

@Injectable()
export class PeopleService {
  private readonly logger = new Logger(PeopleService.name);

  constructor(
    private readonly history: EmployeeHistoryService,
    private readonly tenantPrisma: TenantPrismaService,
  ) {}

  /** Everyone employed on `date`, with their assignment in force (current rows, P06 §4.2). */
  private active(tx: Tx, c: CompanyContext, date: string, where: Prisma.Sql = Prisma.empty, page?: { limit: number; offset: number }, inScope: Prisma.Sql = Prisma.sql`FALSE`) {
    return tx.$queryRaw<ActiveRow[]>`
      SELECT e.id::text, e.given_name, e.family_name, e.preferred_name, e.work_email::text, m.employee_code::text, m.legal_entity_id::text, m.joined_on,
             a.location_id::text, a.department_id::text, a.designation_id::text, a.grade_id::text, a.manager_employee_id::text,
             COALESCE((SELECT array_agg(d.manager_employee_id::text ORDER BY d.manager_employee_id) FROM assignment_dotted_line_managers d
                       WHERE d.organization_id = a.organization_id AND d.assignment_id = a.id), '{}') AS dotted,
             (${inScope}) AS in_scope,
             count(*) OVER () AS total
      FROM employees e
      JOIN employments m ON m.organization_id = e.organization_id AND m.employee_id = e.id
       AND m.joined_on <= ${date}::date AND (m.exited_on IS NULL OR m.exited_on >= ${date}::date)
      JOIN employee_assignments a ON a.organization_id = m.organization_id AND a.employment_id = m.id AND a.superseded_at IS NULL
       AND ${date}::date <@ daterange(a.valid_from, a.valid_to, '[]')
      WHERE e.organization_id = ${c.organizationId}::uuid ${where}
      ORDER BY e.given_name, e.family_name NULLS FIRST, e.id
      ${page ? Prisma.sql`LIMIT ${page.limit} OFFSET ${page.offset}` : Prisma.empty}`;
  }

  /** Names for the ids on the rows (masters, entities, managers). */
  private async labels(tx: Tx, c: CompanyContext, rows: ActiveRow[]) {
    const org = { organizationId: c.organizationId };
    const ids = (f: (r: ActiveRow) => (string | null)[]) => [...new Set(rows.flatMap(f).filter((x): x is string => Boolean(x)))];
    const pick = { id: true, name: true } as const;
    const [locations, departments, designations, entities, managers] = await Promise.all([
      tx.location.findMany({ where: { ...org, id: { in: ids((r) => [r.location_id]) } }, select: pick }),
      tx.department.findMany({ where: { ...org, id: { in: ids((r) => [r.department_id]) } }, select: pick }),
      tx.designation.findMany({ where: { ...org, id: { in: ids((r) => [r.designation_id]) } }, select: pick }),
      tx.legalEntity.findMany({ where: { ...org, id: { in: ids((r) => [r.legal_entity_id]) } }, select: pick }),
      tx.employee.findMany({ where: { ...org, id: { in: ids((r) => [r.manager_employee_id, ...r.dotted]) } }, select: { id: true, givenName: true, familyName: true, preferredName: true } }),
    ]);
    const map = <T extends { id: string; name: string }>(list: T[]) => new Map(list.map((x) => [x.id, x.name as string]));
    const people = new Map(managers.map((m) => [m.id, displayName(m)]));
    const ref = (m: Map<string, string>, id: string | null) => (id ? { id, name: m.get(id) ?? null } : null);
    const L = map(locations);
    const D = map(departments);
    const G = map(designations);
    const E = map(entities);
    return {
      location: (id: string) => ref(L, id),
      department: (id: string) => ref(D, id),
      designation: (id: string) => ref(G, id),
      entity: (id: string) => ref(E, id),
      person: (id: string | null) => ref(people, id),
    };
  }

  /** The viewer's own employee record in force today, or null (YX-SEC-04 implicit grants start here). */
  private own(tx: Tx, c: CompanyContext, v: Viewer) {
    return this.history.ownEmployeeId(tx, c, v);
  }

  // ================= directory (P02 Q4, YX-SEC-17; M01 §3.2) =================

  /**
   * The colleague directory: Public fields only (name, designation, department, location, work email,
   * manager), for HR and for anyone with an employee record in the company. A department filter covers its
   * subtree (P01 Q7). Employee codes and joining dates are for HR.
   */
  directory(ctx: TenantContext, v: Viewer, q: { q?: string; legalEntityId?: string; departmentId?: string; locationId?: string; limit?: number; offset?: number }) {
    return this.history.run(ctx, async (tx, c) => {
      if (!hr(v) && !(await this.own(tx, c, v))) throw new ForbiddenException('The directory is for employees of this company.');
      const today = todayIst();
      // Internal fields (code, joining date) only for the people HR's grants reach (P02 §4.3–4.4), and a code
      // search matches only them, so a search cannot find out who holds a code outside one's scope (YX-SEC-05).
      const inScope = await this.history.scopeFilter(tx, c, v, 'employee.profile.view', Prisma.sql`e.id`, Prisma.sql`${today}::date`);
      const term = q.q?.trim();
      const conditions: Prisma.Sql[] = [];
      if (term) {
        conditions.push(Prisma.sql`(e.given_name ILIKE ${like(term)} OR e.family_name ILIKE ${like(term)} OR e.preferred_name ILIKE ${like(term)}
          OR concat_ws(' ', e.given_name, e.family_name) ILIKE ${like(term)} OR e.work_email::text ILIKE ${like(term)}
          ${hr(v) ? Prisma.sql`OR (m.employee_code::text ILIKE ${like(term)} AND ${inScope})` : Prisma.empty})`);
      }
      if (q.legalEntityId) conditions.push(Prisma.sql`m.legal_entity_id = ${q.legalEntityId}::uuid`);
      if (q.locationId) conditions.push(Prisma.sql`a.location_id = ${q.locationId}::uuid`);
      if (q.departmentId) {
        conditions.push(Prisma.sql`a.department_id IN (SELECT s.id FROM departments s, departments root
          WHERE root.organization_id = ${c.organizationId}::uuid AND root.id = ${q.departmentId}::uuid
            AND s.organization_id = root.organization_id AND starts_with(s.path, root.path))`);
      }
      const where = conditions.length ? Prisma.sql`AND ${Prisma.join(conditions, ' AND ')}` : Prisma.empty;
      const limit = q.limit ?? 50;
      const offset = q.offset ?? 0;
      const rows = await this.active(tx, c, today, where, { limit, offset }, inScope);
      const n = await this.labels(tx, c, rows);
      return {
        total: rows.length ? Number(rows[0].total) : 0,
        limit,
        offset,
        people: rows.map((r) => ({
          id: r.id,
          name: displayName({ givenName: r.given_name, familyName: r.family_name, preferredName: r.preferred_name }),
          workEmail: r.work_email,
          designation: n.designation(r.designation_id),
          department: n.department(r.department_id),
          location: n.location(r.location_id),
          legalEntity: n.entity(r.legal_entity_id),
          manager: n.person(r.manager_employee_id),
          // Internal class: HR within its scope here (P02 §4.4).
          ...(r.in_scope ? { employeeCode: r.employee_code, joinedOn: isoDate(r.joined_on) } : {}),
        })),
      };
    });
  }

  // ================= org chart and reporting lines (M01 §3.2, Q5) =================

  /**
   * The org chart from the assignments in force on a date: every person with their manager and dotted
   * lines, for the screen to draw (search, expand / collapse, export). Public fields only. HR may look at
   * any date ("view as on", P06 §4.7); everyone else sees today's chart.
   */
  orgChart(ctx: TenantContext, v: Viewer, asOf: string | undefined) {
    return this.history.run(ctx, async (tx, c) => {
      const today = todayIst();
      if (!hr(v)) {
        if (!(await this.own(tx, c, v))) throw new ForbiddenException('The org chart is for employees of this company.');
        if (asOf && asOf !== today) throw new ForbiddenException('Only HR can see the org chart on another date.');
      }
      const date = asOf ?? today;
      const inScope = await this.history.scopeFilter(tx, c, v, 'employee.profile.view', Prisma.sql`e.id`, Prisma.sql`${date}::date`);
      // ponytail: one flat list for the whole company; page by subtree when a company passes ~5,000 people.
      const rows = await this.active(tx, c, date, Prisma.empty, { limit: 5000, offset: 0 }, inScope);
      const n = await this.labels(tx, c, rows);
      const present = new Set(rows.map((r) => r.id));
      const reports = new Map<string, number>();
      for (const r of rows) if (r.manager_employee_id) reports.set(r.manager_employee_id, (reports.get(r.manager_employee_id) ?? 0) + 1);
      return {
        asOf: date,
        truncated: rows.length ? Number(rows[0].total) > rows.length : false,
        nodes: rows.map((r) => ({
          id: r.id,
          name: displayName({ givenName: r.given_name, familyName: r.family_name, preferredName: r.preferred_name }),
          designation: n.designation(r.designation_id),
          department: n.department(r.department_id),
          location: n.location(r.location_id),
          legalEntity: n.entity(r.legal_entity_id),
          // A manager who is not employed on the date cannot be in force (YX-ORG-09), so ids always resolve.
          managerId: r.manager_employee_id && present.has(r.manager_employee_id) ? r.manager_employee_id : null,
          dottedLineManagerIds: r.dotted.filter((d) => present.has(d)),
          directReports: reports.get(r.id) ?? 0,
          ...(r.in_scope ? { employeeCode: r.employee_code } : {}),
        })),
      };
    });
  }

  /**
   * A person's reports today: direct, or the whole subtree with depth (recursive CTE; cycles are refused on
   * every write, YX-ORG-09, and the walk stops at 50 levels regardless). Open to HR, the person and the
   * managers above them now (P02 Q2: view = whole subtree).
   */
  reports(ctx: TenantContext, v: Viewer, employeeId: string, all: boolean) {
    return this.history.run(ctx, async (tx, c) => {
      const today = todayIst();
      const a = await this.history.access(tx, c, v, employeeId);
      if (!a.full && !covers(a.periods, today)) throw new NotFoundException('Employee not found');
      const found = await tx.$queryRaw<{ id: string; depth: number }[]>`
        WITH RECURSIVE down(id, depth) AS (
          SELECT a.employee_id, 1 FROM employee_assignments a
          WHERE a.organization_id = ${c.organizationId}::uuid AND a.manager_employee_id = ${employeeId}::uuid AND a.superseded_at IS NULL
            AND ${today}::date <@ daterange(a.valid_from, a.valid_to, '[]')
          UNION
          SELECT a.employee_id, down.depth + 1 FROM down JOIN employee_assignments a
            ON a.organization_id = ${c.organizationId}::uuid AND a.manager_employee_id = down.id AND a.superseded_at IS NULL
           AND ${today}::date <@ daterange(a.valid_from, a.valid_to, '[]')
          WHERE ${all} AND down.depth < 50
        )
        SELECT id::text, min(depth)::int AS depth FROM down GROUP BY id`;
      const depth = new Map(found.map((r) => [r.id, r.depth]));
      const rows = found.length ? await this.active(tx, c, today, Prisma.sql`AND e.id = ANY(${found.map((r) => r.id)}::uuid[])`) : [];
      const n = await this.labels(tx, c, rows);
      return rows
        .map((r) => ({
          id: r.id,
          name: displayName({ givenName: r.given_name, familyName: r.family_name, preferredName: r.preferred_name }),
          depth: depth.get(r.id)!,
          designation: n.designation(r.designation_id),
          department: n.department(r.department_id),
          location: n.location(r.location_id),
          manager: n.person(r.manager_employee_id),
        }))
        .sort((x, y) => x.depth - y.depth || x.name.localeCompare(y.name));
    });
  }

  // ================= the manager's team (M01 §3.10; P02 Q2, Q5) =================

  /**
   * The signed-in person's team today: their whole reporting subtree (view = subtree, P02 Q2) and their
   * dotted-line reports (view only, M01 Q5). Internal fields a manager may see (joining date, employment
   * status, probation end); never pay or Personal fields.
   */
  team(ctx: TenantContext, v: Viewer) {
    return this.history.run(ctx, (tx, c) => this.teamIn(tx, c, v));
  }

  private async teamIn(tx: Tx, c: CompanyContext, v: Viewer) {
    {
      const own = await this.own(tx, c, v);
      if (!own) return { managerId: null, members: [] };
      const today = todayIst();
      const found = await tx.$queryRaw<{ id: string; depth: number; dotted: boolean }[]>`
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
        SELECT id::text, min(depth)::int AS depth, false AS dotted FROM down WHERE id <> ${own}::uuid GROUP BY id
        UNION ALL
        SELECT a.employee_id::text, 1, true FROM assignment_dotted_line_managers d
        JOIN employee_assignments a ON a.organization_id = d.organization_id AND a.id = d.assignment_id AND a.superseded_at IS NULL
         AND ${today}::date <@ daterange(a.valid_from, a.valid_to, '[]')
        WHERE d.organization_id = ${c.organizationId}::uuid AND d.manager_employee_id = ${own}::uuid`;
      // Someone in the subtree who also has a dotted line keeps the stronger (reporting) relation.
      // P02 Q2: the company may narrow a manager's view to direct reports.
      const direct = (await managerViewScope(tx, c)) === 'direct_reports';
      const relation = new Map<string, { depth: number; dotted: boolean }>();
      for (const f of found) if ((f.dotted || !direct || f.depth === 1) && (!relation.has(f.id) || relation.get(f.id)!.dotted)) relation.set(f.id, f);
      const ids = [...relation.keys()];
      const rows = ids.length ? await this.active(tx, c, today, Prisma.sql`AND e.id = ANY(${ids}::uuid[])`) : [];
      const n = await this.labels(tx, c, rows);
      const employmentIds = await tx.employment.findMany({ where: { organizationId: c.organizationId, employeeId: { in: ids }, exitedOn: null }, select: { id: true, employeeId: true } });
      const byEmployee = new Map(employmentIds.map((e) => [e.employeeId, e.id]));
      const statuses = await tx.employmentStatusPeriod.findMany({
        where: { organizationId: c.organizationId, employmentId: { in: employmentIds.map((e) => e.id) }, supersededAt: null, validFrom: { lte: asDate(today) }, OR: [{ validTo: null }, { validTo: { gte: asDate(today) } }] },
      });
      const probations = await tx.probation.findMany({ where: { organizationId: c.organizationId, employmentId: { in: employmentIds.map((e) => e.id) } } });
      return {
        managerId: own,
        members: rows
          .map((r) => {
            const rel = relation.get(r.id)!;
            const employmentId = byEmployee.get(r.id);
            const status = statuses.find((s) => s.employmentId === employmentId)?.status ?? null;
            const probation = probations.find((p) => p.employmentId === employmentId);
            return {
              id: r.id,
              name: displayName({ givenName: r.given_name, familyName: r.family_name, preferredName: r.preferred_name }),
              employeeCode: r.employee_code,
              relation: rel.dotted ? ('dotted' as const) : rel.depth === 1 ? ('direct' as const) : ('indirect' as const),
              designation: n.designation(r.designation_id),
              department: n.department(r.department_id),
              location: n.location(r.location_id),
              manager: n.person(r.manager_employee_id),
              joinedOn: isoDate(r.joined_on),
              status,
              probationEndsOn: status === 'probation' && probation ? isoDate(probation.plannedEndOn) : null,
            };
          })
          .sort((x, y) => (x.relation === y.relation ? x.name.localeCompare(y.name) : ['direct', 'indirect', 'dotted'].indexOf(x.relation) - ['direct', 'indirect', 'dotted'].indexOf(y.relation))),
      };
    }
  }

  /** The signed-in person's own record (never while acting for someone else). */
  me(ctx: TenantContext, v: Viewer) {
    return this.history.run(ctx, async (tx, c) => {
      const own = await this.own(tx, c, v);
      if (!own) throw new NotFoundException('You have no employee record in this company.');
      const employee = await tx.employee.findFirstOrThrow({ where: { id: own, organizationId: c.organizationId } });
      return { employeeId: own, name: displayName(employee) };
    });
  }

  // ================= the person behind a record (P01 §4.5a, J15) =================

  /** The person and every role they hold in the company. Contact data: HR within its scope, or the person. */
  person(ctx: TenantContext, v: Viewer, employeeId: string) {
    return this.history.run(ctx, async (tx, c) => {
      const a = await this.history.access(tx, c, v, employeeId);
      if (!a.self && !a.hr) throw new NotFoundException('Employee not found');
      const employee = await tx.employee.findFirstOrThrow({ where: { id: employeeId, organizationId: c.organizationId } });
      const person = await tx.person.findFirstOrThrow({ where: { id: employee.personId, organizationId: c.organizationId } });
      const roles = await tx.personRole.findMany({ where: { organizationId: c.organizationId, personId: person.id }, orderBy: [{ startOn: 'asc' }, { createdAt: 'asc' }] });
      const employments = await tx.employment.findMany({ where: { organizationId: c.organizationId, id: { in: roles.filter((r) => r.sourceTable === 'employments').map((r) => r.sourceId) } } });
      const entities = await tx.legalEntity.findMany({ where: { organizationId: c.organizationId, id: { in: employments.map((e) => e.legalEntityId) } }, select: { id: true, name: true } });
      const users = await tx.user.findMany({ where: { organizationId: c.organizationId, id: { in: roles.filter((r) => r.sourceTable === 'users').map((r) => r.sourceId) } }, select: { id: true, email: true } });
      const label = (r: (typeof roles)[number]) => {
        if (r.sourceTable === 'employments') {
          const e = employments.find((x) => x.id === r.sourceId);
          return e ? `${e.employeeCode} · ${entities.find((x) => x.id === e.legalEntityId)?.name ?? ''}`.trim() : null;
        }
        if (r.sourceTable === 'users') return users.find((u) => u.id === r.sourceId)?.email ?? null;
        return null;
      };
      return {
        id: person.id,
        givenName: person.givenName,
        familyName: person.familyName,
        preferredName: person.preferredName,
        primaryEmail: person.primaryEmail,
        primaryPhone: person.primaryPhone,
        status: person.status,
        loginLinked: Boolean(employee.userId),
        roles: roles.map((r) => ({ id: r.id, roleType: r.roleType, startOn: isoDate(r.startOn), endOn: r.endOn ? isoDate(r.endOn) : null, label: label(r) })),
      };
    });
  }

  // ================= record actions =================

  private async openEmploymentOf(tx: Tx, c: CompanyContext, employeeId: string) {
    const e = await tx.employment.findFirst({ where: { organizationId: c.organizationId, employeeId, exitedOn: null } });
    if (!e) throw new NotFoundException('No open employment for that employee');
    return e;
  }

  /**
   * YX-ORG-16: an employee code can be corrected, with a reason, audited. (Once payroll locks its first
   * period for the person this will need a correction approval; payroll arrives in step 5.)
   */
  setCode(ctx: TenantContext, v: Viewer, employeeId: string, code: string, reason: string) {
    return this.history.run(ctx, async (tx, c) => {
      if ((await this.own(tx, c, v)) === employeeId) throw new ForbiddenException('Someone else changes your own employee code.');
      await this.history.mustReach(tx, c, v, 'employee.change.manage', employeeId, todayIst());
      const e = await this.openEmploymentOf(tx, c, employeeId);
      if (e.employeeCode === code) return { employeeCode: code };
      await tx.employment.update({ where: { id: e.id }, data: { employeeCode: code } });
      await audit(tx, c, 'employee.code.changed', 'employee', employeeId, { employmentId: e.id, from: e.employeeCode, to: code, reason: reason.trim() });
      return { employeeCode: code };
    });
  }

  /** P01 §4.5: give an employee record its login (self-service). Same rules as at hiring. */
  linkLogin(ctx: TenantContext, v: Viewer, employeeId: string, userId: string) {
    return this.history.run(ctx, async (tx, c) => {
      const employee = await tx.employee.findFirst({ where: { id: employeeId, organizationId: c.organizationId } });
      if (!employee) throw new NotFoundException('Employee not found');
      await this.history.mustReach(tx, c, v, 'employee.change.manage', employeeId, todayIst());
      if (employee.userId) throw new ConflictException('This record already has a login. Unlink it first.');
      await checkLoginLink(tx, c, userId, employee.workEmail);
      await tx.employee.update({ where: { id: employee.id }, data: { userId } });
      await addRole(tx, c, employee.personId, 'login', { table: 'users', id: userId }, asDate(todayIst()));
      await audit(tx, c, 'employee.login.linked', 'employee', employee.id, { userId });
      return { linked: true };
    });
  }

  /** The login stays a login (it is not deleted or merged); it just stops being this person's own view. */
  unlinkLogin(ctx: TenantContext, v: Viewer, employeeId: string, reason: string) {
    return this.history.run(ctx, async (tx, c) => {
      const employee = await tx.employee.findFirst({ where: { id: employeeId, organizationId: c.organizationId } });
      if (!employee?.userId) throw new NotFoundException('That record has no login');
      await this.history.mustReach(tx, c, v, 'employee.change.manage', employeeId, todayIst());
      if (employee.userId === c.userId) throw new ForbiddenException('Someone else unlinks your own login.');
      await tx.employee.update({ where: { id: employee.id }, data: { userId: null } });
      await tx.personRole.updateMany({ where: { organizationId: c.organizationId, personId: employee.personId, roleType: 'login', sourceId: employee.userId, endOn: null }, data: { endOn: asDate(todayIst()) } });
      await audit(tx, c, 'employee.login.unlinked', 'employee', employee.id, { userId: employee.userId, reason: reason.trim() });
      return { linked: false };
    });
  }

  // ================= probation (M01 §3.4, Q3; YX-LC-01) =================

  /** Is the employment confirmed (now or by an approved future change), or is a confirmation waiting? */
  private async probationState(tx: Tx, c: CompanyContext, employmentIds: string[]) {
    const confirmed = await tx.employmentStatusPeriod.findMany({ where: { organizationId: c.organizationId, employmentId: { in: employmentIds }, supersededAt: null, status: 'confirmed' }, select: { employmentId: true, validFrom: true } });
    const waiting = await tx.employeeChange.findMany({ where: { organizationId: c.organizationId, employmentId: { in: employmentIds }, status: 'pending', changeType: 'confirmation' }, select: { employmentId: true, id: true } });
    return {
      confirmedFrom: (id: string) => {
        const rows = confirmed.filter((r) => r.employmentId === id).map((r) => isoDate(r.validFrom));
        return rows.length ? rows.sort()[0] : null;
      },
      pendingChange: (id: string) => waiting.find((w) => w.employmentId === id)?.id ?? null,
    };
  }

  /**
   * Open probations: HR sees all; a manager sees their current team's (P02 Q2). Each row says where it
   * stands: running, review due (reminder lead before the end), overdue, extended, confirmation waiting or
   * confirmed from a date.
   */
  probations(ctx: TenantContext, v: Viewer) {
    return this.history.run(ctx, async (tx, c) => {
      const today = todayIst();
      let employeeIds: string[] | null = null;
      if (!tenantWide(v, 'employee.profile.view')) {
        const team = await this.teamIn(tx, c, v);
        const scoped = hr(v)
          ? (await tx.$queryRaw<{ id: string }[]>`SELECT e.id::text FROM employees e WHERE e.organization_id = ${c.organizationId}::uuid AND ${await this.history.scopeFilter(tx, c, v, 'employee.profile.view', Prisma.sql`e.id`, Prisma.sql`${today}::date`)}`).map((r) => r.id)
          : [];
        employeeIds = [...new Set([...team.members.filter((m) => m.relation !== 'dotted').map((m) => m.id), ...scoped])];
        if (!employeeIds.length) return { today, rows: [] };
      }
      const employments = await tx.employment.findMany({ where: { organizationId: c.organizationId, exitedOn: null, ...(employeeIds ? { employeeId: { in: employeeIds } } : {}) } });
      const plans = await tx.probation.findMany({ where: { organizationId: c.organizationId, employmentId: { in: employments.map((e) => e.id) } }, orderBy: { plannedEndOn: 'asc' } });
      const state = await this.probationState(tx, c, plans.map((p) => p.employmentId));
      const people = await tx.employee.findMany({ where: { organizationId: c.organizationId, id: { in: employments.map((e) => e.employeeId) } } });
      const rows = [];
      for (const p of plans) {
        const e = employments.find((x) => x.id === p.employmentId)!;
        const end = isoDate(p.plannedEndOn);
        const confirmedFrom = state.confirmedFrom(e.id);
        // Confirmed long ago: no longer an open probation.
        if (confirmedFrom && confirmedFrom < addDays(today, -30)) continue;
        const lead = Number(await settingFor(tx, c, 'probation.review_lead_days', { legalEntityId: e.legalEntityId }));
        const reviewDueOn = addDays(end, -lead);
        const person = people.find((x) => x.id === e.employeeId)!;
        const maxTotal = Number(await settingFor(tx, c, 'probation.max_total_months', { legalEntityId: e.legalEntityId }));
        rows.push({
          employeeId: e.employeeId,
          name: displayName(person),
          employeeCode: e.employeeCode,
          startOn: isoDate(p.startOn),
          originalEndOn: isoDate(p.originalEndOn),
          plannedEndOn: end,
          extendedMonths: p.extendedMonths,
          reviewDueOn,
          escalatedOn: p.escalatedOn ? isoDate(p.escalatedOn) : null,
          confirmedFrom,
          pendingConfirmationId: state.pendingChange(e.id),
          stage: confirmedFrom ? 'confirmed' : state.pendingChange(e.id) ? 'awaiting_approval' : end < today ? 'overdue' : today >= reviewDueOn ? 'review_due' : p.extendedMonths ? 'extended' : 'running',
          maxTotalMonths: maxTotal,
        });
      }
      return { today, rows };
    });
  }

  /**
   * M01 Q3: extend a running probation by whole months, with a reason, within the company's maximum total
   * (starter 12 months). The reminders start again for the new end date. A confirmed probation is not
   * extended; nobody extends their own.
   */
  extendProbation(ctx: TenantContext, v: Viewer, employeeId: string, months: number, reason: string) {
    return this.history.run(ctx, async (tx, c) => {
      if ((await this.own(tx, c, v)) === employeeId) throw new ForbiddenException('Someone else decides your own probation.');
      await this.history.mustReach(tx, c, v, 'employee.change.manage', employeeId, todayIst());
      const e = await this.openEmploymentOf(tx, c, employeeId);
      await this.history.lockEmployment(tx, c, e.id);
      const p = await tx.probation.findFirst({ where: { organizationId: c.organizationId, employmentId: e.id } });
      if (!p) throw new NotFoundException('That employee has no probation');
      const state = await this.probationState(tx, c, [e.id]);
      if (state.confirmedFrom(e.id)) throw new ConflictException('The probation is already confirmed.');
      if (state.pendingChange(e.id)) throw new ConflictException('A confirmation is waiting for approval. Reject or cancel it first.');
      const current = await tx.employeeAssignment.findFirst({
        where: { organizationId: c.organizationId, employmentId: e.id, supersededAt: null, validFrom: { lte: asDate(todayIst()) }, OR: [{ validTo: null }, { validTo: { gte: asDate(todayIst()) } }] },
      });
      const maxTotal = Number(await settingFor(tx, c, 'probation.max_total_months', { legalEntityId: e.legalEntityId, employmentTypeId: current?.employmentTypeId }));
      const newEnd = await endAfterMonths(tx, addDays(isoDate(p.plannedEndOn), 1), months);
      const limit = await endAfterMonths(tx, isoDate(p.startOn), maxTotal);
      if (newEnd > limit) throw new BadRequestException(`Probation may run at most ${maxTotal} months in total, until ${limit} (company rule).`);
      await tx.probation.update({
        where: { id: p.id },
        data: { plannedEndOn: asDate(newEnd), extendedMonths: p.extendedMonths + months, reviewRemindedOn: null, escalatedOn: null },
      });
      await audit(tx, c, 'employee.probation.extended', 'employee', employeeId, { employmentId: e.id, from: isoDate(p.plannedEndOn), to: newEnd, months, reason: reason.trim() });
      return { plannedEndOn: newEnd, extendedMonths: p.extendedMonths + months };
    });
  }

  /**
   * YX-LC-01, the daily job: N days before the end the review is due (reminder hook for P04 notifications),
   * on the end date an undecided probation escalates to HR, and only where the company switched it on is it
   * confirmed automatically N days later. Idempotent: each step is marked on the row once.
   */
  async probationSweep(now = new Date()): Promise<number> {
    const SUPER = { organizationId: null, isSuperAdmin: true };
    // Which companies have open plans: a read-only look across tenants; each is then handled in its own RLS context.
    const orgs = await this.tenantPrisma.forTenant(SUPER, (tx) => tx.$queryRaw<{ id: string }[]>`SELECT DISTINCT organization_id::text AS id FROM probations`);
    let actions = 0;
    for (const { id } of orgs) {
      try {
        actions += await this.history.run({ organizationId: id, isSuperAdmin: false, userId: null }, (tx, c) => this.sweepCompany(tx, c, now));
      } catch (e) {
        this.logger.error(`Probation sweep failed for ${id}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return actions;
  }

  private async sweepCompany(tx: Tx, c: CompanyContext, now: Date): Promise<number> {
    const plans = await tx.probation.findMany({ where: { organizationId: c.organizationId } });
    if (!plans.length) return 0;
    const employments = await tx.employment.findMany({ where: { organizationId: c.organizationId, id: { in: plans.map((p) => p.employmentId) }, exitedOn: null } });
    const state = await this.probationState(tx, c, employments.map((e) => e.id));
    let actions = 0;
    for (const p of plans) {
      const e = employments.find((x) => x.id === p.employmentId);
      if (!e || state.confirmedFrom(e.id) || state.pendingChange(e.id)) continue;
      const today = localToday(await this.history.timezoneOn(tx, c, e.id, todayIst(now)), now);
      const end = isoDate(p.plannedEndOn);
      const lead = Number(await settingFor(tx, c, 'probation.review_lead_days', { legalEntityId: e.legalEntityId }));
      const meta = { employmentId: e.id, plannedEndOn: end };
      if (!p.reviewRemindedOn && today >= addDays(end, -lead)) {
        await tx.probation.update({ where: { id: p.id }, data: { reviewRemindedOn: asDate(today) } });
        await audit(tx, c, 'employee.probation.review_due', 'employee', e.employeeId, meta);
        actions++;
      }
      if (!p.escalatedOn && today >= end) {
        await tx.probation.update({ where: { id: p.id }, data: { escalatedOn: asDate(today) } });
        await audit(tx, c, 'employee.probation.escalated', 'employee', e.employeeId, meta);
        actions++;
      }
      const auto = await settingFor(tx, c, 'probation.auto_confirm_after_days', { legalEntityId: e.legalEntityId });
      if (auto !== 'off' && today >= addDays(end, Number(auto))) {
        await this.autoConfirm(tx, c, e, addDays(end, 1), today);
        actions++;
      }
    }
    return actions;
  }

  /** The company's own rule confirms (Q3, opt-in): a confirmation change applied by the system, audited. */
  private async autoConfirm(tx: Tx, c: CompanyContext, e: Prisma.EmploymentGetPayload<object>, from: string, today: string) {
    await this.history.lockEmployment(tx, c, e.id);
    const ch = await tx.employeeChange.create({
      data: { organizationId: c.organizationId, employeeId: e.employeeId, employmentId: e.id, changeType: 'confirmation', effectiveDate: asDate(from), status: 'scheduled', payload: { status: 'confirmed' }, reason: 'Confirmed automatically by company rule', decidedAt: new Date() },
    });
    await this.history.rebuild(tx, c, e, from, ch.id);
    if (from <= today) await tx.employeeChange.update({ where: { id: ch.id }, data: { status: 'effective', appliedAt: new Date() } });
    await audit(tx, c, 'employee.probation.auto_confirmed', 'employee', e.employeeId, { employmentId: e.id, changeId: ch.id, effectiveDate: from });
    if (from <= today) await audit(tx, c, 'employee.change.effective', 'employee', e.employeeId, { changeId: ch.id, changeType: 'confirmation', effectiveDate: from });
  }
}
