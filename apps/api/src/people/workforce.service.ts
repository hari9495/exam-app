import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import ExcelJS from 'exceljs';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { audit, CompanyContext, Tx } from '../org-structure/org-structure.service';
import { isoDate, todayIst } from '../org-structure/org-validation';
import { displayName, EmployeeHistoryService, Viewer, type RequestUser } from '../employee-history/employee-history.service';
import { has } from '../access/scope';
import { entitiesFor, payViewer, withPayScope } from '../payroll/pay-access';

// People › Directory on the designed screen (PPL-01, design audit step 2): the whole workforce in one list for the
// screen to filter, group and sort, the count cards with "vs last month" from monthly snapshots, saved views and export.
// Field classes as in the paged directory (P02 Q4, §4.3–4.4, YX-SEC-05): Public fields for every colleague; ID, joining
// date and status only where employee.profile.view reaches the person; phone only where employee.personal.view does.
// Consultants (payroll 5h) only for the consultant keys, never in a support session (P02 Q8). No pay (R1).

/** One flat list, like the org chart. */
// shortcut: 5,000 people in one response, page on the server when a company passes that.
const MAX = 5000;
export const EXPORT_COLUMNS = ['name', 'designation', 'department', 'location', 'legalEntity', 'manager', 'email', 'code', 'joined', 'status', 'phone'] as const;
export type ExportColumn = (typeof EXPORT_COLUMNS)[number];
type Status = 'Active' | 'Probation' | 'Notice period' | 'On leave';

export interface WorkforceRow {
  id: string;
  kind: 'employee' | 'consultant';
  name: string;
  designation: string | null;
  department: { id: string; name: string | null } | null;
  location: { id: string; name: string | null } | null;
  legalEntity: { id: string; name: string | null } | null;
  manager: { id: string; name: string | null } | null;
  workEmail: string | null;
  /** Internal: HR within its scope. */
  employeeCode?: string;
  joinedOn?: string;
  status?: Status;
  /** Personal: employee.personal.view within its scope. */
  phone?: string | null;
  /** Consultants: individual or firm. */
  via?: string | null;
}

interface Counts {
  employees: number;
  consultants: number;
  persons: number;
  employeePersons: number;
}

const monthStart = (d: string) => `${d.slice(0, 7)}-01`;
const previousMonth = (d: string) => {
  const x = new Date(`${d.slice(0, 7)}-01T00:00:00Z`);
  x.setUTCMonth(x.getUTCMonth() - 1);
  return x.toISOString().slice(0, 10);
};

@Injectable()
export class WorkforceService {
  constructor(
    private readonly history: EmployeeHistoryService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * The legal entities whose consultants the person may see: the consultant keys' reach (payroll keys, read through the
   * database pay guard). Never while acting for someone else (P02 YX-SEC-20, Q8).
   */
  private async consultantEntities(tx: Tx, c: CompanyContext, user: RequestUser): Promise<string[]> {
    const pv = await payViewer(this.prisma, this.tenantPrisma, user);
    return [...new Set([...(await entitiesFor(tx, c, pv, 'consultant.manage')), ...(await entitiesFor(tx, c, pv, 'consultant.invoice.approve'))])];
  }

  /** Head counts on a date for the company or one entity: the cards and the monthly snapshot use the same numbers. */
  private async counts(tx: Tx, org: string, date: string, legalEntityId: string | null): Promise<Counts> {
    const entity = (col: Prisma.Sql) => (legalEntityId ? Prisma.sql`AND ${col} = ${legalEntityId}::uuid` : Prisma.empty);
    const [r] = await tx.$queryRaw<{ employees: number; consultants: number; persons: number; employee_persons: number }[]>`
      WITH emp AS (
        SELECT e.person_id, lower(e.work_email::text) AS work, lower(p.primary_email::text) AS main
        FROM employees e
        JOIN employments m ON m.organization_id = e.organization_id AND m.employee_id = e.id
         AND m.joined_on <= ${date}::date AND (m.exited_on IS NULL OR m.exited_on >= ${date}::date) ${entity(Prisma.sql`m.legal_entity_id`)}
        LEFT JOIN persons p ON p.organization_id = e.organization_id AND p.id = e.person_id
        WHERE e.organization_id = ${org}::uuid),
      con AS (
        SELECT lower(k.email) AS email FROM consultants k
        WHERE k.organization_id = ${org}::uuid AND k.status = 'active' ${entity(Prisma.sql`k.legal_entity_id`)})
      SELECT (SELECT count(*) FROM emp)::int AS employees,
             (SELECT count(*) FROM con)::int AS consultants,
             (SELECT count(DISTINCT person_id) FROM emp)::int AS employee_persons,
             -- A consultant who is also an employee (same email) is one person with two roles.
             ((SELECT count(DISTINCT person_id) FROM emp) + (SELECT count(*) FROM con WHERE NOT EXISTS (SELECT 1 FROM emp WHERE con.email IN (emp.work, emp.main))))::int AS persons`;
    return { employees: r.employees, consultants: r.consultants, persons: r.persons, employeePersons: r.employee_persons };
  }

  /** Everyone in the workforce today, with the cards. */
  workforce(ctx: TenantContext, user: RequestUser, legalEntityId: string | null) {
    return this.history.viewer(user).then((v) =>
      this.history.run(ctx, async (tx, c) => {
        const own = await this.history.ownEmployeeId(tx, c, v);
        if (!has(v, 'employee.profile.view') && !own) throw new ForbiddenException('The directory is for employees of this company.');
        const today = todayIst();
        const reach = v.actingForOther ? [] : await this.consultantEntities(tx, c, user);
        const consultants = reach.length > 0;
        // Last month's snapshot counts every consultant: compare only when the person sees all the ones in this scope.
        const allEntities = (await tx.legalEntity.findMany({ where: { organizationId: c.organizationId }, select: { id: true } })).map((e) => e.id);
        const fullReach = legalEntityId ? reach.includes(legalEntityId) : allEntities.every((id) => reach.includes(id));
        const rows = await this.employeeRows(tx, c, v, today, legalEntityId, null);
        const { k, now } = await withPayScope(tx, reach, async () => ({ k: consultants ? await this.consultantRows(tx, c, legalEntityId, null) : [], now: await this.counts(tx, c.organizationId, today, legalEntityId) }));
        const snap = await tx.workforceSnapshot.findFirst({ where: { organizationId: c.organizationId, legalEntityId, month: new Date(`${previousMonth(today)}T00:00:00Z`) } });
        const prev = snap ? { ...snap, consultants: fullReach ? snap.consultants : null, persons: fullReach ? snap.persons : null } : null;
        const me = own ? rows.find((r) => r.id === own) : undefined;
        return {
          asOf: today,
          truncated: rows.length >= MAX,
          me: me ? { id: me.id, managerId: me.manager?.id ?? null, departmentId: me.department?.id ?? null, locationId: me.location?.id ?? null } : null,
          rows: [...rows, ...k],
          cards: {
            employees: { count: now.employees, previous: prev?.employees ?? null },
            consultants: consultants ? { count: now.consultants, previous: prev?.consultants ?? null } : null,
            persons: consultants
              ? { roles: now.employees + now.consultants, people: now.persons, previous: prev?.persons ?? null }
              : { roles: now.employees, people: now.employeePersons, previous: prev?.employeePersons ?? null },
          },
          previousMonth: prev ? previousMonth(today).slice(0, 7) : null,
        };
      }),
    );
  }

  private async employeeRows(tx: Tx, c: CompanyContext, v: Viewer, today: string, legalEntityId: string | null, ids: string[] | null): Promise<WorkforceRow[]> {
    const inScope = await this.history.scopeFilter(tx, c, v, 'employee.profile.view', Prisma.sql`e.id`, Prisma.sql`${today}::date`);
    const personal = await this.history.scopeFilter(tx, c, v, 'employee.personal.view', Prisma.sql`e.id`, Prisma.sql`${today}::date`);
    const rows = await tx.$queryRaw<
      { id: string; given_name: string; family_name: string | null; preferred_name: string | null; work_email: string | null; employee_code: string; joined_on: Date; legal_entity_id: string; location_id: string; department_id: string; designation_id: string; manager_employee_id: string | null; in_scope: boolean; phone: string | null; period_status: string | null; notice: boolean; on_leave: boolean }[]
    >`
      SELECT e.id::text, e.given_name, e.family_name, e.preferred_name, e.work_email::text, m.employee_code::text, m.joined_on, m.legal_entity_id::text,
             a.location_id::text, a.department_id::text, a.designation_id::text, a.manager_employee_id::text,
             (${inScope}) AS in_scope,
             CASE WHEN (${personal}) THEN p.primary_phone ELSE NULL END AS phone,
             CASE WHEN (${inScope}) THEN (SELECT sp.status FROM employment_status_periods sp WHERE sp.organization_id = m.organization_id AND sp.employment_id = m.id
               AND sp.superseded_at IS NULL AND ${today}::date <@ daterange(sp.valid_from, sp.valid_to, '[]') ORDER BY sp.valid_from DESC LIMIT 1) END AS period_status,
             (${inScope}) AND EXISTS (SELECT 1 FROM exit_cases x WHERE x.organization_id = m.organization_id AND x.employment_id = m.id AND x.status IN ('submitted', 'accepted', 'cleared')) AS notice,
             (${inScope}) AND EXISTS (SELECT 1 FROM leave_requests l WHERE l.organization_id = m.organization_id AND l.employee_id = e.id
               AND l.status IN ('approved', 'cancel_pending') AND ${today}::date BETWEEN l.from_on AND l.to_on) AS on_leave
      FROM employees e
      JOIN employments m ON m.organization_id = e.organization_id AND m.employee_id = e.id
       AND m.joined_on <= ${today}::date AND (m.exited_on IS NULL OR m.exited_on >= ${today}::date)
      JOIN employee_assignments a ON a.organization_id = m.organization_id AND a.employment_id = m.id AND a.superseded_at IS NULL
       AND ${today}::date <@ daterange(a.valid_from, a.valid_to, '[]')
      LEFT JOIN persons p ON p.organization_id = e.organization_id AND p.id = e.person_id
      WHERE e.organization_id = ${c.organizationId}::uuid
        ${legalEntityId ? Prisma.sql`AND m.legal_entity_id = ${legalEntityId}::uuid` : Prisma.empty}
        ${ids ? Prisma.sql`AND e.id = ANY(${ids}::uuid[])` : Prisma.empty}
      ORDER BY e.given_name, e.family_name NULLS FIRST, e.id
      LIMIT ${MAX}`;
    const org = { organizationId: c.organizationId };
    const uniq = (f: (r: (typeof rows)[number]) => string | null) => [...new Set(rows.map(f).filter((x): x is string => Boolean(x)))];
    const [locs, depts, desigs, ents, mgrs] = await Promise.all([
      tx.location.findMany({ where: { ...org, id: { in: uniq((r) => r.location_id) } }, select: { id: true, name: true } }),
      tx.department.findMany({ where: { ...org, id: { in: uniq((r) => r.department_id) } }, select: { id: true, name: true } }),
      tx.designation.findMany({ where: { ...org, id: { in: uniq((r) => r.designation_id) } }, select: { id: true, name: true } }),
      tx.legalEntity.findMany({ where: { ...org, id: { in: uniq((r) => r.legal_entity_id) } }, select: { id: true, name: true } }),
      tx.employee.findMany({ where: { ...org, id: { in: uniq((r) => r.manager_employee_id) } }, select: { id: true, givenName: true, familyName: true, preferredName: true } }),
    ]);
    const name = (list: { id: string; name: string }[]) => new Map(list.map((x) => [x.id, x.name]));
    const [L, D, G, E] = [name(locs), name(depts), name(desigs), name(ents)];
    const M = new Map(mgrs.map((m) => [m.id, displayName(m)]));
    const ref = (m: Map<string, string>, id: string | null) => (id ? { id, name: m.get(id) ?? null } : null);
    return rows.map((r) => ({
      id: r.id,
      kind: 'employee' as const,
      name: displayName({ givenName: r.given_name, familyName: r.family_name, preferredName: r.preferred_name }),
      designation: G.get(r.designation_id) ?? null,
      department: ref(D, r.department_id),
      location: ref(L, r.location_id),
      legalEntity: ref(E, r.legal_entity_id),
      manager: ref(M, r.manager_employee_id),
      workEmail: r.work_email,
      ...(r.in_scope
        ? { employeeCode: r.employee_code, joinedOn: isoDate(r.joined_on), status: (r.notice || r.period_status === 'notice' ? 'Notice period' : r.on_leave ? 'On leave' : r.period_status === 'probation' ? 'Probation' : 'Active') as Status }
        : {}),
      ...(r.phone !== null ? { phone: r.phone } : {}),
    }));
  }

  private async consultantRows(tx: Tx, c: CompanyContext, legalEntityId: string | null, ids: string[] | null): Promise<WorkforceRow[]> {
    const list = await tx.consultant.findMany({
      where: { organizationId: c.organizationId, status: 'active', ...(legalEntityId ? { legalEntityId } : {}), ...(ids ? { id: { in: ids } } : {}) },
      select: { id: true, name: true, kind: true, email: true, legalEntityId: true },
      orderBy: { name: 'asc' },
      take: MAX,
    });
    const ents = new Map((await tx.legalEntity.findMany({ where: { organizationId: c.organizationId, id: { in: [...new Set(list.map((k) => k.legalEntityId))] } }, select: { id: true, name: true } })).map((e) => [e.id, e.name]));
    return list.map((k) => ({
      id: k.id,
      kind: 'consultant' as const,
      name: k.name,
      designation: k.kind === 'firm' ? 'Consulting firm' : 'Consultant',
      department: null,
      location: null,
      legalEntity: { id: k.legalEntityId, name: ents.get(k.legalEntityId) ?? null },
      manager: null,
      workEmail: k.email,
      via: k.kind === 'firm' ? k.name : null,
    }));
  }

  /** CSV of the rows the person can see (all, or the selected ones), with only the fields they can see; recorded. */
  export(ctx: TenantContext, user: RequestUser, dto: { legalEntityId?: string | null; ids?: string[]; columns: ExportColumn[]; format?: 'csv' | 'xlsx' }): Promise<Buffer> {
    return this.history.viewer(user).then((v) =>
      this.history.run(ctx, async (tx, c) => {
        if (!has(v, 'employee.profile.view')) throw new ForbiddenException('Exporting the directory is for HR.');
        const entity = dto.legalEntityId ?? null;
        const reach = v.actingForOther ? [] : await this.consultantEntities(tx, c, user);
        const k = reach.length ? await withPayScope(tx, reach, () => this.consultantRows(tx, c, entity, dto.ids ?? null)) : [];
        const rows = [...(await this.employeeRows(tx, c, v, todayIst(), entity, dto.ids ?? null)), ...k];
        const cell: Record<ExportColumn, (r: WorkforceRow) => string> = {
          name: (r) => r.name,
          designation: (r) => r.designation ?? '',
          department: (r) => r.department?.name ?? '',
          location: (r) => r.location?.name ?? '',
          legalEntity: (r) => r.legalEntity?.name ?? '',
          manager: (r) => r.manager?.name ?? '',
          email: (r) => r.workEmail ?? '',
          code: (r) => r.employeeCode ?? '',
          joined: (r) => r.joinedOn ?? '',
          status: (r) => r.status ?? '',
          phone: (r) => r.phone ?? '',
        };
        const HEAD: Record<ExportColumn, string> = { name: 'Name', designation: 'Designation', department: 'Department', location: 'Location', legalEntity: 'Legal entity', manager: 'Manager', email: 'Work email', code: 'ID', joined: 'Joined', status: 'Status', phone: 'Phone' };
        await audit(tx, c, 'people.directory.exported', 'directory', 'people.directory', { rows: rows.length, columns: dto.columns, legalEntityId: entity, selected: Boolean(dto.ids), format: dto.format ?? 'csv' });
        if (dto.format === 'xlsx') {
          // Cells are written as text values, never formulas.
          const book = new ExcelJS.Workbook();
          const sheet = book.addWorksheet('Directory');
          sheet.addRow(dto.columns.map((k) => HEAD[k]));
          for (const r of rows) sheet.addRow(dto.columns.map((k) => cell[k](r)));
          sheet.getRow(1).font = { bold: true };
          return Buffer.from(await book.xlsx.writeBuffer());
        }
        // Quote every cell, and neutralise spreadsheet formulas (CSV injection, OWASP). A plain number (a +91 phone) is
        // not a formula and stays as it is.
        const esc = (v: string) => `"${(/^[=+\-@\t\r]/.test(v) && !/^[+-]?\d[\d .]*$/.test(v) ? `'${v}` : v).replace(/"/g, '""')}"`;
        return Buffer.from([dto.columns.map((k) => esc(HEAD[k])).join(','), ...rows.map((r) => dto.columns.map((k) => esc(cell[k](r))).join(','))].join('\r\n'), 'utf8');
      }),
    );
  }

  // ---------------- saved views ----------------

  private views(ctx: TenantContext, user: RequestUser) {
    if (!user.userId) throw new ForbiddenException('Sign in to save views.');
    return { c: ctx, me: user.userId };
  }

  listViews(ctx: TenantContext, user: RequestUser) {
    const { me } = this.views(ctx, user);
    return this.history.run(ctx, (tx, c) =>
      tx.savedView.findMany({ where: { organizationId: c.organizationId, page: 'people.directory', OR: [{ ownerUserId: me }, { shared: true }] }, orderBy: { name: 'asc' }, select: { id: true, name: true, shared: true, state: true, ownerUserId: true } }),
    ).then((list) => list.map(({ ownerUserId, ...x }) => ({ ...x, mine: ownerUserId === me })));
  }

  createView(ctx: TenantContext, user: RequestUser, dto: { name: string; shared: boolean; state: Record<string, unknown> }) {
    const { me } = this.views(ctx, user);
    if (user.actingSuperAdmin || user.impersonatorUserId) throw new ForbiddenException('Not available while acting for someone else');
    return this.history.run(ctx, async (tx, c) => {
      const row = await tx.savedView.create({ data: { organizationId: c.organizationId, ownerUserId: me, page: 'people.directory', name: dto.name.trim(), shared: dto.shared, state: dto.state as Prisma.InputJsonValue }, select: { id: true, name: true, shared: true, state: true } });
      if (dto.shared) await audit(tx, c, 'people.directory.view_shared', 'saved_view', row.id, { name: row.name });
      return { ...row, mine: true };
    });
  }

  deleteView(ctx: TenantContext, user: RequestUser, id: string) {
    const { me } = this.views(ctx, user);
    return this.history.run(ctx, async (tx, c) => {
      const { count } = await tx.savedView.deleteMany({ where: { id, organizationId: c.organizationId, ownerUserId: me } });
      if (!count) throw new NotFoundException('No such view of yours.');
      return { deleted: true };
    });
  }

  // ---------------- monthly snapshots ----------------

  /** This month's counts for the company and each entity (the last run in the month stands for the month). */
  snapshot(org: string): Promise<number> {
    return this.tenantPrisma.forTenant({ organizationId: org, isSuperAdmin: false }, async (tx) => {
      const today = todayIst();
      const month = monthStart(today);
      const entities = await tx.legalEntity.findMany({ where: { organizationId: org, archivedAt: null }, select: { id: true } });
      // The job counts every consultant: the pay guard is opened to all of the company's entities for this read only.
      const all = (await tx.legalEntity.findMany({ where: { organizationId: org }, select: { id: true } })).map((e) => e.id);
      let n = 0;
      for (const entity of [null, ...entities.map((e) => e.id)]) {
        const k = await withPayScope(tx as unknown as Tx, all, () => this.counts(tx as unknown as Tx, org, today, entity));
        await tx.$executeRaw`
          INSERT INTO workforce_snapshots (organization_id, legal_entity_id, month, employees, consultants, persons, employee_persons)
          VALUES (${org}::uuid, ${entity}::uuid, ${month}::date, ${k.employees}, ${k.consultants}, ${k.persons}, ${k.employeePersons})
          ON CONFLICT (organization_id, COALESCE(legal_entity_id, '00000000-0000-0000-0000-000000000000'::uuid), month)
          DO UPDATE SET employees = EXCLUDED.employees, consultants = EXCLUDED.consultants, persons = EXCLUDED.persons,
                        employee_persons = EXCLUDED.employee_persons, taken_at = now()`;
        n++;
      }
      return n;
    });
  }
}
