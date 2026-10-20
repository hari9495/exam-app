import { ForbiddenException, Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Prisma } from '@prisma/client';
import { PrismaService, TenantContext, TenantPrismaService, resolvePermissionGrants } from '@exam-platform/shared';
import { inCompany } from '../org-structure/org-structure.service';
import { buildViewer, employeesInEntity, tenantWide } from '../access/scope';
import { EmployeeHistoryService, type RequestUser } from '../employee-history/employee-history.service';
import { PeopleService } from '../people/people.service';
import { todayIst } from '../org-structure/org-validation';
import { addDays } from '../time/time-maths';
import { AttendanceService } from '../time/attendance.service';
import { PeriodsService } from '../time/periods.service';
import { PayRunsService } from '../payroll/runs.service';
import { withPayScope } from '../payroll/pay-access';
import { JoinersService } from '../lifecycle/joiners.service';
import { ExitsService } from '../lifecycle/exits.service';
import { ExitExtrasService } from '../lifecycle/exit-extras.service';
import { HiringHomeService, type HiringHome } from '../interviewing/hiring-home.service';
import { ApprovalsEngine } from '../workflow/approvals-engine.service';
import { DeskAccessService, visibleTickets } from '../service-desk/desk-access';

export interface SearchHit {
  id: string;
  label: string;
  secondary: string;
  href: string;
}

export interface SearchResult {
  people: SearchHit[];
  requests: SearchHit[];
  candidates: SearchHit[];
  tickets: SearchHit[];
}

const LIMIT = 5;
const REQUEST_STATUS: Record<string, string> = { pending: 'Waiting', approved: 'Approved', rejected: 'Rejected', withdrawn: 'Withdrawn', cancelled: 'Cancelled' };
const TICKET_STATUS: Record<string, string> = { new: 'New', open: 'In progress', pending: 'Waiting on requester', on_hold: 'On hold', solved: 'Resolved', closed: 'Closed' };

/** The type in front ("Overtime · …") unless the line already says it ("Casual leave, …" is plainly leave). */
export const withType = (type: string, line: string) => (line.toLowerCase().includes(type.toLowerCase()) ? line : `${type} · ${line}`);

/** A request's reference: the start of its id, as My requests shows it (and search finds it). */
export const requestRef = (id: string) => id.slice(0, 8).toUpperCase();

/**
 * PLT-20 "Casual leave · Arjun Mehta · Waiting": what it is, whose it is and where it stands. Leave titles start with
 * the person's name ("Arjun Mehta: Casual leave, 1 Oct – 2 Oct (2 days)"), so the name is moved, never repeated.
 */
export function requestLine(title: string, person: string | null, status: string): string {
  // No login for the person (most leave is applied for employees without one): their name leads the title.
  const name = person?.trim() || (/^([^:]{2,80}): ./.exec(title)?.[1] ?? '');
  const what = name && title.startsWith(`${name}: `) ? title.slice(name.length + 2) : title;
  return [what, name && !what.includes(name) ? name : '', REQUEST_STATUS[status] ?? status].filter(Boolean).join(' · ');
}
const like = (t: string) => `%${t.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
const enc = encodeURIComponent;

/** The keys the counts and search sections need; each section shows only what its key reaches. */
const KEYS = ['candidate:view', 'candidate:manage', 'document.manage', 'lifecycle.exit.manage', 'lifecycle.exit.view', 'payroll.query.handle', 'desk.ticket.work', 'lifecycle.onboarding.view', 'lifecycle.onboarding.manage'] as const;

/** Home (PLT-02) widgets for the HR, payroll and manager homes. A widget is absent when the person may not see it. */
export interface HomeWidgets {
  month: string;
  attendanceExceptions?: number;
  /** noRun: the person prepares payroll but the month has no open run yet. */
  notReadyForPayroll?: { notReady: number; people: number; runId: string | null; noRun?: boolean };
  openCases?: number;
  dueLocks?: { month: string; entityId: string; entityName: string; lockableFrom: string; exceptions: number; waiting: number }[];
  probationsDue?: { count: number; firstDue: string | null };
  joiners?: { id: string; name: string; on: string; department: string | null; location: string; openTasks: number; pendingTasks: string[] }[];
  leavers?: { id: string; name: string; on: string; clearanceOpen: number; pendingClearance: string[] }[];
  /** Joining in the chosen month (invited, accepted or joined). */
  joining?: number;
  /** Fixed-term contracts ending in the next 30 days. */
  contractsEnding?: { count: number; lastOn: string };
  /** Last month's numbers, only where one is on record and covers exactly what the person sees now. */
  previous?: { month: string; attendanceExceptions?: number; notReadyForPayroll?: number; openCases?: number; joining?: number };
  /** "Coming up": birthdays and work anniversaries in the person's circle this coming week. */
  celebrations?: { id: string; name: string; kind: 'birthday' | 'anniversary'; on: string; years?: number }[];
  /** People who hold a hiring key: what waits for them, today's interviews, this week and their open jobs. */
  hiring?: HiringHome;
}

// The YukthiX app frame (design audit step 1, PLT-01 / PLT-20): the global search behind Ctrl K and the counts on
// the side menu. Every section runs inside the company's RLS context and applies the same rule as the page it links
// to, so a search or a count never shows what the person could not open (P02 §4.3, YX-SEC-05).
@Injectable()
export class WorkspaceService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly prisma: PrismaService,
    private readonly history: EmployeeHistoryService,
    private readonly people: PeopleService,
    private readonly moduleRef: ModuleRef,
  ) {}

  // Each widget asks the module that owns the data, with that module's own permission and scope rules.
  private service<T>(type: new (...args: never[]) => T): T {
    return this.moduleRef.get(type, { strict: false });
  }

  /**
   * Home widgets (design audit step 2): attendance exceptions, people not ready for payroll, open cases, due dates
   * (attendance lock, probation confirmations) and this week's joiners and leavers. Follows the company and period
   * chosen in the top bar. Counts only, never trends: there is no history to compare with yet.
   */
  async home(ctx: TenantContext, user: RequestUser, month: string, entityId: string | null): Promise<HomeWidgets> {
    const out: HomeWidgets = { month };
    if (!ctx.organizationId || !user.userId) return out;
    const keys = await this.granted(user);
    const support = Boolean(user.actingSuperAdmin);
    const today = todayIst();
    const dow = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7; // Monday = 0
    const week = { from: addDays(today, -dow), to: addDays(today, 6 - dow) };
    const inWeek = (d: string | null | undefined) => Boolean(d && d >= week.from && d <= week.to);
    const prevMonth = addDays(`${month}-01`, -1).slice(0, 7);
    const previous = await this.snapshotsFor(ctx, prevMonth);
    const prev: NonNullable<HomeWidgets['previous']> = { month: prevMonth };

    const exceptions = await this.service(AttendanceService).exceptionCount(ctx, user, month, entityId);
    if (exceptions !== null) {
      out.attendanceExceptions = exceptions;
      // The stored number counts the whole company (or entity): compare only for someone who sees all of it.
      const sv = await buildViewer(this.prisma, this.tenantPrisma, user, ['attendance.view']);
      const p = previous.get(`attendance_exceptions:${entityId ?? ''}`);
      if (p !== undefined && tenantWide(sv, 'attendance.view') && !sv.actingForOther) prev.attendanceExceptions = p;
    }
    const payroll = support ? [] : await this.service(PayRunsService).preparesFor(ctx, user);
    if (payroll.length) {
      out.notReadyForPayroll = (await this.service(PayRunsService).notReady(ctx, user, month, entityId)) ?? { notReady: 0, people: 0, runId: null, noRun: true };
      const all = await this.entityIds(ctx);
      const p = previous.get(`not_ready_payroll:${entityId ?? ''}`);
      if (p !== undefined && (entityId ? payroll.includes(entityId) : all.every((id) => payroll.includes(id)))) prev.notReadyForPayroll = p;
    }
    const locks = await this.service(PeriodsService).dueLocks(ctx, user, entityId);
    if (locks?.length) out.dueLocks = locks;

    const v = await this.history.viewer(user);
    if (v.grants.has('employee.profile.view') || v.grants.has('employee.change.manage')) {
      const soon = addDays(today, 14);
      const due = (await this.people.probations(ctx, v)).rows.filter((r) => !r.confirmedFrom && !r.pendingConfirmationId && r.plannedEndOn <= soon);
      if (due.length) out.probationsDue = { count: due.length, firstDue: due.map((r) => r.plannedEndOn).sort()[0] ?? null };
    }
    if (keys.has('lifecycle.onboarding.view') || keys.has('lifecycle.onboarding.manage')) {
      const board = await this.service(JoinersService).board(ctx, user);
      out.joiners = board.joiners
        .filter((j) => inWeek(j.joiningOn) && (!entityId || j.legalEntityId === entityId))
        .map((j) => ({ id: j.id, name: j.name, on: j.joiningOn, department: j.department, location: j.location, openTasks: j.openTasks, pendingTasks: j.pendingTasks }));
      const joining = await this.service(JoinersService).joining(ctx, user, month, entityId);
      if (joining) {
        out.joining = joining.count;
        const p = previous.get(`joining:${entityId ?? ''}`);
        if (p !== undefined && joining.full) prev.joining = p;
      }
    }
    if (keys.has('lifecycle.exit.view') || keys.has('lifecycle.exit.manage')) {
      const rows = (await this.service(ExitsService).list(ctx, user)).rows.filter((k) => inWeek(k.lastDay));
      const inEntity = entityId ? await inCompany(this.tenantPrisma, ctx, (tx, c) => employeesInEntity(tx, c, entityId, rows.map((r) => r.employeeId))) : null;
      const shown = rows.filter((k) => !inEntity || inEntity.has(k.employeeId));
      // Which departments still have to clear each leaver (the list above already applied the exit rule).
      const open = shown.length
        ? await inCompany(this.tenantPrisma, ctx, (tx, c) => tx.clearanceItem.findMany({ where: { organizationId: c.organizationId, exitCaseId: { in: shown.map((k) => k.id) }, status: 'open' }, select: { exitCaseId: true, department: true } }))
        : [];
      out.leavers = shown.map((k) => ({ id: k.id, name: k.name, on: k.lastDay, clearanceOpen: k.clearance.open, pendingClearance: [...new Set(open.filter((i) => i.exitCaseId === k.id).map((i) => i.department))] }));
      const until = addDays(today, 30);
      const ending = (await this.service(ExitExtrasService).upcoming(ctx, user)).rows.filter((r) => r.kind === 'contract_end' && r.on <= until);
      if (ending.length) out.contractsEnding = { count: ending.length, lastOn: ending[ending.length - 1].on };
    }
    if (!support && keys.has('desk.ticket.work')) {
      // Open tickets on the desks the person works today (the queue their Tickets page shows), desk by desk.
      const desks = await inCompany(this.tenantPrisma, ctx, (tx, c) =>
        tx.$queryRaw<{ desk: string; n: number }[]>(Prisma.sql`SELECT m.desk_id::text AS desk,
            (SELECT count(*)::int FROM sd_tickets t WHERE t.organization_id = m.organization_id AND t.desk_id = m.desk_id AND t.system_state NOT IN ('solved', 'closed')) AS n
          FROM sd_desk_members m WHERE m.organization_id = ${c.organizationId}::uuid AND m.user_id = ${user.userId}::uuid
            AND m.ended_at IS NULL AND m.valid_from <= ${today}::date AND (m.valid_to IS NULL OR m.valid_to >= ${today}::date)
          GROUP BY m.desk_id, m.organization_id`),
      );
      out.openCases = desks.reduce((n, d) => n + d.n, 0);
      const before = desks.map((d) => previous.get(`open_cases:${d.desk}`));
      if (desks.length && before.every((x) => x !== undefined)) prev.openCases = before.reduce((n: number, x) => n + (x ?? 0), 0);
    }
    if (Object.keys(prev).length > 1) out.previous = prev;
    const celebrations = await this.celebrations(ctx, user);
    if (celebrations) out.celebrations = celebrations;
    const hiring = await this.service(HiringHomeService).home(ctx, user);
    if (hiring) out.hiring = hiring;
    return out;
  }

  private entityIds(ctx: TenantContext) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => (await tx.legalEntity.findMany({ where: { organizationId: c.organizationId, archivedAt: null }, select: { id: true } })).map((e) => e.id));
  }

  /** A month's stored Home numbers, keyed "metric:scope" ('' = the whole company). */
  private snapshotsFor(ctx: TenantContext, month: string) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) =>
      new Map((await tx.homeSnapshot.findMany({ where: { organizationId: c.organizationId, month: new Date(`${month}-01T00:00:00Z`) } })).map((r) => [`${r.metric}:${r.scopeId ?? ''}`, r.value])),
    );
  }

  /** Daily: this month's Home numbers for the company, each entity and each help desk (the last run in a month stands). */
  async snapshot(org: string): Promise<number> {
    const month = todayIst().slice(0, 7);
    return inCompany(this.tenantPrisma, { organizationId: org, isSuperAdmin: false }, async (tx, c) => {
      const entities = (await tx.legalEntity.findMany({ where: { organizationId: org, archivedAt: null }, select: { id: true } })).map((e) => e.id);
      const rows: [string, string | null, number][] = [];
      for (const entity of [null, ...entities]) {
        rows.push(['attendance_exceptions', entity, await this.service(AttendanceService).exceptionTotal(tx, c, month, entity)]);
        rows.push(['joining', entity, await this.service(JoinersService).joiningTotal(tx, org, month, entity)]);
        // The job reads the runs of the entities it counts: the pay guard opens to those, for this read only.
        const ids = entity ? [entity] : entities;
        const r = await withPayScope(tx, ids, () => this.service(PayRunsService).notReadyIn(tx, org, ids, month));
        if (r) rows.push(['not_ready_payroll', entity, r.notReady]);
      }
      const desks = await tx.$queryRaw<{ desk: string; n: number }[]>`SELECT d.id::text AS desk,
          (SELECT count(*)::int FROM sd_tickets t WHERE t.organization_id = d.organization_id AND t.desk_id = d.id AND t.system_state NOT IN ('solved', 'closed')) AS n
        FROM sd_desks d WHERE d.organization_id = ${org}::uuid`;
      for (const d of desks) rows.push(['open_cases', d.desk, d.n]);
      for (const [metric, scope, value] of rows)
        await tx.$executeRaw`
          INSERT INTO home_snapshots (organization_id, metric, scope_id, month, value) VALUES (${org}::uuid, ${metric}, ${scope}::uuid, ${`${month}-01`}::date, ${value})
          ON CONFLICT (organization_id, metric, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid), month)
          DO UPDATE SET value = EXCLUDED.value, taken_at = now()`;
      return rows.length;
    });
  }

  private granted(user: RequestUser) {
    return resolvePermissionGrants(this.prisma, this.tenantPrisma, { role: user.role, organizationId: user.organizationId ?? null, permissionProfileId: user.permissionProfileId, userId: user.userId ?? null }, [...KEYS]);
  }

  async search(ctx: TenantContext, user: RequestUser, raw: string): Promise<SearchResult> {
    const q = raw.trim().slice(0, 100);
    const empty: SearchResult = { people: [], requests: [], candidates: [], tickets: [] };
    if (q.length < 2 || !ctx.organizationId || !user.userId) return empty;
    const keys = await this.granted(user);
    // A YukthiX support session never sees hiring or tickets (D14); people stay as the directory shows them.
    const support = Boolean(user.actingSuperAdmin);
    const [people, rest] = await Promise.all([
      this.searchPeople(ctx, user, q),
      inCompany(this.tenantPrisma, ctx, async (tx, c) => {
        const me = user.userId!;
        const org = c.organizationId;
        // Requests the person raised, asked for, or holds (held) a task on: ApprovalsEngine.view's rule. Found by
        // reference, title or the requester's name (PLT-20 "arjun" finds Arjun's leave), never wider than that rule.
        const requests = await tx.$queryRaw<{ id: string; title: string; request_type: string; status: string; mine: boolean; person: string | null }[]>`
          SELECT r.id::text, r.title, r.request_type, r.status, u.name AS person,
            (r.requester_user_id IS NOT DISTINCT FROM ${me}::uuid OR r.raised_by_user_id IS NOT DISTINCT FROM ${me}::uuid) AS mine
          FROM wf_requests r LEFT JOIN users u ON u.id = r.requester_user_id AND u.organization_id = r.organization_id
          WHERE r.organization_id = ${org}::uuid
            AND (r.requester_user_id = ${me}::uuid OR r.raised_by_user_id = ${me}::uuid
              OR EXISTS (SELECT 1 FROM wf_tasks t WHERE t.request_id = r.id AND (t.assignee_user_id = ${me}::uuid OR t.on_behalf_of_user_id = ${me}::uuid)))
            AND (r.title ILIKE ${like(q)} OR r.id::text ILIKE ${`${q.toLowerCase()}%`} OR u.name ILIKE ${like(q)})
          ORDER BY r.created_at DESC LIMIT ${LIMIT}`;
        const candidates = !support && (keys.has('candidate:view') || keys.has('candidate:manage'))
          ? await tx.$queryRaw<{ id: string; name: string; email: string }[]>`
              SELECT c.id::text, c.name, c.email::text FROM candidates c
              WHERE c.organization_id = ${org}::uuid AND c.erased_at IS NULL AND c.merged_into_id IS NULL AND c.deleted_at IS NULL
                AND (c.name ILIKE ${like(q)} OR c.email::text ILIKE ${like(q)})
              ORDER BY c.created_at DESC LIMIT ${LIMIT}`
          : [];
        // Tickets the person raised (as a requester): the ones their Help page shows.
        const tickets = support ? [] : await tx.$queryRaw<{ id: string; number: string; subject: string; state: string }[]>`
          SELECT t.id::text, t.number, t.subject, t.system_state AS state FROM sd_tickets t
          WHERE t.organization_id = ${org}::uuid
            AND t.requester_person_id IN (SELECT pr.person_id FROM person_roles pr WHERE pr.organization_id = ${org}::uuid
              AND pr.role_type = 'login' AND pr.source_table = 'users' AND pr.source_id = ${me}::uuid AND pr.end_on IS NULL)
            AND (t.number ILIKE ${like(q)} OR t.subject ILIKE ${like(q)})
          ORDER BY t.created_at DESC LIMIT ${LIMIT}`;
        return { requests, candidates, tickets };
      }),
    ]);
    const engine = this.service(ApprovalsEngine);
    const own = rest.tickets.map((t) => ({ id: t.id, label: t.number, secondary: `${t.subject} · Ticket · ${TICKET_STATUS[t.state] ?? t.state}`, href: `/yx/desk/help/${enc(t.id)}` }));
    const worked = support ? [] : (await this.workedTickets(ctx, user, q)).filter((t) => !own.some((o) => o.id === t.id));
    return {
      people,
      requests: rest.requests.map((r) => ({
        id: r.id,
        label: requestRef(r.id),
        secondary: withType(engine.typeLabel(r.request_type), requestLine(r.title, r.person, r.status)),
        // Your own requests open in My requests; ones you approve (or approved) in Approvals.
        href: r.mine ? '/yx/me/requests' : '/yx/approvals',
      })),
      candidates: rest.candidates.map((c) => ({ id: c.id, label: c.name, secondary: `Candidate · ${c.email}`, href: `/yx/hiring/candidates/${enc(c.id)}` })),
      tickets: [...own, ...worked].slice(0, LIMIT),
    };
  }

  /** Tickets the person works as an agent: exactly the Service Desk's own list rule (desk seats, privacy, shares). */
  private async workedTickets(ctx: TenantContext, user: RequestUser, q: string): Promise<SearchHit[]> {
    let actor;
    try {
      actor = await this.service(DeskAccessService).actorOf(user, { ...ctx, organizationId: ctx.organizationId! });
    } catch {
      return []; // e.g. a desk seat that needs two-step sign-in first: the desk would refuse too
    }
    if (!actor.roles.size) return [];
    const seen = actor;
    return this.tenantPrisma.forTenant(ctx, async (tx) => {
      const rows = await tx.sdTicket.findMany({
        where: { AND: [await visibleTickets(tx, seen), { OR: [{ number: { contains: q, mode: 'insensitive' } }, { subject: { contains: q, mode: 'insensitive' } }] }] },
        select: { id: true, number: true, subject: true, systemState: true },
        orderBy: { createdAt: 'desc' },
        take: LIMIT,
      });
      return rows.map((t) => ({ id: t.id, label: t.number, secondary: `${t.subject} · Ticket · ${TICKET_STATUS[t.systemState] ?? t.systemState}`, href: `/yx/desk/tickets/${enc(t.id)}` }));
    });
  }

  /** People exactly as the Directory shows them to this person (Public fields; codes only within HR's scope). */
  private async searchPeople(ctx: TenantContext, user: RequestUser, q: string): Promise<SearchHit[]> {
    try {
      const v = await this.history.viewer(user);
      const page = await this.people.directory(ctx, v, { q, limit: LIMIT });
      return page.people.map((p) => {
        const hr = 'employeeCode' in p;
        const parts = [hr ? (p as { employeeCode?: string | null }).employeeCode : null, p.designation?.name, p.department?.name].filter(Boolean);
        return { id: p.id, label: p.name, secondary: parts.join(' · '), href: hr ? `/yx/people/profile?person=${enc(p.id)}` : `/yx/people/directory?q=${enc(p.name)}` };
      });
    } catch (e) {
      // No employee record and no HR key: the directory is not for them, so neither is a people search.
      if (e instanceof ForbiddenException) return [];
      throw e;
    }
  }

  /**
   * "Coming up" (PLT-02): birthdays and work anniversaries in the next 7 days among the person's circle (their manager,
   * the people who share that manager, and their own direct reports). Day and month only, never the year of birth, and
   * never for someone who hid their birthday (P02 Q4, YX-SEC-17). Null for someone with no employee record.
   */
  private async celebrations(ctx: TenantContext, user: RequestUser): Promise<HomeWidgets['celebrations'] | null> {
    if (user.actingSuperAdmin || user.impersonatorUserId) return null;
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const today = todayIst();
      const me = await tx.employee.findFirst({ where: { organizationId: org, userId: user.userId }, select: { id: true } });
      if (!me) return null;
      const rows = await tx.$queryRaw<{ id: string; given_name: string; family_name: string | null; preferred_name: string | null; dob: Date | null; hide: boolean | null; joined_on: Date | null }[]>`
        WITH cur AS (
          SELECT a.employee_id, a.manager_employee_id FROM employee_assignments a
          WHERE a.organization_id = ${org}::uuid AND a.superseded_at IS NULL AND ${today}::date <@ daterange(a.valid_from, a.valid_to, '[]')),
        mine AS (SELECT manager_employee_id AS boss FROM cur WHERE employee_id = ${me.id}::uuid),
        circle AS (
          SELECT boss AS id FROM mine WHERE boss IS NOT NULL
          UNION SELECT cur.employee_id FROM cur, mine WHERE mine.boss IS NOT NULL AND cur.manager_employee_id = mine.boss
          UNION SELECT employee_id FROM cur WHERE manager_employee_id = ${me.id}::uuid)
        SELECT e.id::text, e.given_name, e.family_name, e.preferred_name, d.date_of_birth AS dob, d.hide_birthday AS hide,
               (SELECT min(m.joined_on) FROM employments m WHERE m.organization_id = e.organization_id AND m.employee_id = e.id AND m.exited_on IS NULL) AS joined_on
        FROM employees e JOIN circle ON circle.id = e.id
        LEFT JOIN employee_personal_details d ON d.organization_id = e.organization_id AND d.employee_id = e.id
        WHERE e.organization_id = ${org}::uuid AND e.id <> ${me.id}::uuid
          AND EXISTS (SELECT 1 FROM employments m WHERE m.organization_id = e.organization_id AND m.employee_id = e.id AND m.exited_on IS NULL)`;
      const days = Array.from({ length: 7 }, (_, i) => addDays(today, i));
      const out: NonNullable<HomeWidgets['celebrations']> = [];
      for (const r of rows) {
        const name = r.preferred_name || [r.given_name, r.family_name].filter(Boolean).join(' ');
        const md = (d: Date) => d.toISOString().slice(5, 10);
        const birthday = r.dob && !r.hide ? days.find((d) => d.slice(5) === md(r.dob!)) : undefined;
        if (birthday) out.push({ id: `b-${r.id}`, name, kind: 'birthday', on: birthday });
        const anniversary = r.joined_on ? days.find((d) => d.slice(5) === md(r.joined_on!) && d.slice(0, 4) > r.joined_on!.toISOString().slice(0, 4)) : undefined;
        if (anniversary) out.push({ id: `a-${r.id}`, name, kind: 'anniversary', on: anniversary, years: Number(anniversary.slice(0, 4)) - r.joined_on!.getUTCFullYear() });
      }
      return out.sort((a, b) => a.on.localeCompare(b.on));
    });
  }

  /** Counts for the side menu, each only for someone who may open the page it sits on. */
  async counts(ctx: TenantContext, user: RequestUser): Promise<Record<string, number>> {
    if (!ctx.organizationId || !user.userId) return {};
    const keys = await this.granted(user);
    const support = Boolean(user.actingSuperAdmin);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const me = user.userId!;
      const org = c.organizationId;
      const one = (sql: Prisma.Sql) => tx.$queryRaw<{ n: bigint }[]>(sql).then((r) => Number(r[0]?.n ?? 0));
      const out: Record<string, number> = {};
      out.approvals = await one(Prisma.sql`SELECT count(*) AS n FROM wf_tasks t JOIN wf_requests r ON r.id = t.request_id
        WHERE t.organization_id = ${org}::uuid AND t.assignee_user_id = ${me}::uuid AND t.status = 'open' AND r.status = 'pending' AND r.current_step = t.step`);
      out.notifications = await tx.userNotification.count({ where: { organizationId: org, recipientUserId: me, readAt: null } });
      if (keys.has('document.manage')) out.documentsToVerify = await tx.document.count({ where: { organizationId: org, status: 'uploaded' } });
      if (keys.has('lifecycle.exit.manage') || keys.has('lifecycle.exit.view')) out.exitCases = await tx.exitCase.count({ where: { organizationId: org, status: { in: ['submitted', 'accepted', 'cleared'] } } });
      if (!support && keys.has('payroll.query.handle')) out.payslipQueries = await tx.payslipQuery.count({ where: { organizationId: org, status: 'open' } });
      if (!support && keys.has('desk.ticket.work')) out.myTickets = await one(Prisma.sql`SELECT count(*) AS n FROM sd_tickets t WHERE t.organization_id = ${org}::uuid AND t.assignee_user_id = ${me}::uuid AND t.system_state NOT IN ('solved', 'closed')`);
      // Scorecards I owe on interviews that have happened (M10 AT5).
      if (!support) out.scorecardsToDo = await one(Prisma.sql`SELECT count(*) AS n FROM interview_panelists p JOIN interviews i ON i.id = p.interview_id
        JOIN interview_slots s ON s.id = i.confirmed_slot_id JOIN pipeline_entries pe ON pe.id = i.pipeline_entry_id JOIN jobs j ON j.id = pe.job_id
        WHERE p.organization_id = ${org}::uuid AND p.user_id = ${me}::uuid AND i.status <> 'cancelled' AND s.ends_at <= now()
          AND COALESCE(i.scorecard_template_id, j.scorecard_template_id) IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM scorecards sc WHERE sc.interview_id = i.id AND sc.panelist_user_id = p.user_id AND sc.status = 'submitted')`);
      return out;
    });
  }
}
