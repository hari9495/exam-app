import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { CompanyContext, Tx, audit, inCompany } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { Viewer, buildViewer, has, inEntitySql, tenantWide, type ScopeUser } from '../access/scope';
import { DayEngine } from './day-engine.service';
import { ResolveDto, MarkPresentDto } from './ops-dto';
import { ScheduleBook, lockedDates } from './schedule';
import { TIME_KEYS, asDate, dateOf, factsOn, grantCovers, monthRange, mustSee, settingOn, todayIn, visibleSql } from './time-core';
import { FlexiRules, addDays, fromStart, lateFrom, minutesInto, partsOf } from './time-maths';

// Time ops, attendance side (29 Oct 2026):
//   TIM-01 Today board   a manager's team or HR's people (attendance.view in scope) today: who is in, late, not in, on
//                        leave, working from home or on duty, resting; who is on site now (for a roll call); field punches.
//   TIM-04 Exceptions    the month's days that need a decision (missing check-in / check-out, no attendance, no approved
//                        timesheet), with any waiting request and how each was resolved.
//   Resolve              HR (leave.approve over the person, never their own day) resolves days as present (times optional)
//                        or absent with a reason; TIM-03 "HrFix" and the TIM-02 bulk "mark present" are the same action.
//                        Today is never resolved (it is not over); frozen and locked months take a correction instead.

const EXCEPTION_STATUSES = ['missing_in', 'missing_out', 'no_timesheet', 'absent'];
const NOT_RESOLVABLE: Record<string, string> = { leave: 'is on leave', holiday: 'is a holiday', weekly_off: 'is a weekly off', strike: 'is marked as a strike', lockout: 'is marked as a lockout', layoff: 'is marked as a lay-off' };
const KIND: Record<string, string> = { missing_in: 'Missing check-in', missing_out: 'Missing check-out', no_timesheet: 'No approved timesheet', absent: 'No attendance' };
const hhmm = (m: number | null) => (m === null ? null : `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
/** Minutes of a shift inside the night window (7 pm to 6 am, P07 IN.OSH default), across midnight. */
export function nightMinutes(start: number, end: number, window = { start: 1140, end: 360 }): number {
  const e = end > start ? end : end + 1440;
  const spans: [number, number][] = [[window.start - 1440, window.end], [window.start, window.end + 1440], [window.start + 1440, window.end + 2880]];
  return spans.reduce((n, [a, b]) => n + Math.max(0, Math.min(e, b) - Math.max(start, a)), 0);
}
const fmt = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

@Injectable()
export class AttendanceOpsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly days: DayEngine,
  ) {}

  private viewer(user: ScopeUser): Promise<Viewer> {
    return buildViewer(this.prisma, this.tenantPrisma, user, [...TIME_KEYS]);
  }

  private async own(tx: Tx, c: CompanyContext, v: Viewer) {
    if (!v.userId || v.actingForOther) return null;
    return (await tx.employee.findFirst({ where: { organizationId: c.organizationId, userId: v.userId }, select: { id: true } }))?.id ?? null;
  }

  /** People the viewer may see on a date (their team, or attendance.view in scope), never themselves. */
  private async people(tx: Tx, c: CompanyContext, v: Viewer, own: string | null, on: string, entityId?: string | null, to: string = on) {
    return tx.$queryRaw<{ id: string; name: string; code: string | null; location: string; locationId: string; dept: string; role: string }[]>`
      SELECT e.id::text, concat_ws(' ', coalesce(e.preferred_name, e.given_name), e.family_name) AS name, m.employee_code::text AS code,
             l.name::text AS location, l.id::text AS "locationId", d.name::text AS dept, dg.name::text AS role
      FROM employees e
      JOIN employee_assignments a ON a.organization_id = e.organization_id AND a.employee_id = e.id AND a.superseded_at IS NULL AND ${to}::date <@ daterange(a.valid_from, a.valid_to, '[]')
      JOIN employments m ON m.organization_id = e.organization_id AND m.id = a.employment_id AND m.joined_on <= ${to}::date AND (m.exited_on IS NULL OR m.exited_on >= ${on}::date)
      JOIN locations l ON l.organization_id = e.organization_id AND l.id = a.location_id
      JOIN departments d ON d.organization_id = e.organization_id AND d.id = a.department_id
      JOIN designations dg ON dg.organization_id = e.organization_id AND dg.id = a.designation_id
      WHERE e.organization_id = ${c.organizationId}::uuid AND (${own}::uuid IS NULL OR e.id <> ${own}::uuid)
        AND ${await visibleSql(tx, c, v, own, 'attendance.view', Prisma.sql`e.id`, to)}
        AND ${inEntitySql(c, entityId, Prisma.sql`e.id`, Prisma.sql`${on}::date`, Prisma.sql`${to}::date`)}
      ORDER BY 2 LIMIT 2000`;
  }

  // ------------------------------------------------------------------------------------------ TIM-01 today board

  async today(ctx: TenantContext, user: ScopeUser, entityId?: string | null) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const own = await this.own(tx, c, v);
      const day = todayIst();
      const people = await this.people(tx, c, v, own, day, entityId);
      const ids = people.map((p) => p.id);
      const book = await ScheduleBook.load(tx, org);
      await book.prime(ids, addDays(day, -1), day);
      const yesterday = addDays(day, -1);
      const [rows, punches, nudges, leaves, wfh] = ids.length
        ? await Promise.all([
            tx.attendanceDay.findMany({ where: { organizationId: org, employeeId: { in: ids }, workOn: { in: [asDate(yesterday), asDate(day)] } } }),
            tx.punch.findMany({ where: { organizationId: org, employeeId: { in: ids }, workOn: asDate(day), accepted: true }, orderBy: { punchedAt: 'asc' } }),
            tx.nudge.findMany({ where: { organizationId: org, employeeId: { in: ids }, item: 'check_in', onDay: asDate(day) }, select: { employeeId: true } }),
            tx.$queryRaw<{ id: string; part: string }[]>`SELECT d.employee_id::text AS id, d.part FROM leave_request_days d JOIN leave_requests r ON r.organization_id = d.organization_id AND r.id = d.request_id AND r.status IN ('approved', 'cancel_pending') WHERE d.organization_id = ${org}::uuid AND d.employee_id = ANY(${ids}::uuid[]) AND d.active AND d.portion > 0 AND d.leave_on = ${day}::date`,
            tx.attendanceRequest.findMany({ where: { organizationId: org, employeeId: { in: ids }, workOn: asDate(day), kind: 'wfh', status: 'approved' }, select: { employeeId: true } }),
          ])
        : [[], [], [], [], []];
      const names = new Map((await tx.location.findMany({ where: { organizationId: org, id: { in: [...new Set(punches.map((p) => p.locationId).filter((x): x is string => Boolean(x)))] } }, select: { id: true, name: true } })).map((l) => [l.id, l.name]));
      const out = [];
      for (const p of people) {
        const f = await factsOn(tx, org, p.id, day);
        if (!f) continue;
        const sched = await book.day(f, day);
        const holiday = (await tx.$queryRaw<{ name: string }[]>`SELECT h.name::text FROM holidays h JOIN holiday_calendars hc ON hc.organization_id = h.organization_id AND hc.id = h.calendar_id WHERE h.organization_id = ${org}::uuid AND h.holiday_on = ${day}::date AND NOT h.half_day AND h.kind IN ('national', 'state', 'festival') AND (hc.location_id = ${f.locationId}::uuid OR (hc.location_id IS NULL AND NOT EXISTS (SELECT 1 FROM holiday_calendars x WHERE x.organization_id = ${org}::uuid AND x.location_id = ${f.locationId}::uuid))) LIMIT 1`)[0];
        const mode = await settingOn(tx, c, 'attendance.mode', f, day);
        const mine = punches.filter((x) => x.employeeId === p.id);
        const firstIn = mine.find((x) => x.kind === 'in');
        const last = mine.at(-1);
        const today = rows.find((r) => r.employeeId === p.id && dateOf(r.workOn) === day);
        const before = rows.find((r) => r.employeeId === p.id && dateOf(r.workOn) === yesterday);
        const leave = leaves.find((x) => x.id === p.id);
        const shift = sched.shift ?? (await book.locationDay(f, day)).rule;
        const inMinute = firstIn ? minutesInto(day, f.zone, firstIn.punchedAt) : null;
        // TIM-06: a flexi shift is late from core start (or never, company setting); a split from the part checked in for.
        const lateRef = inMinute === null ? null : lateFrom(shift, inMinute, shift.kind === 'flexi' ? ((await settingOn(tx, c, 'attendance.flexi.late_from', f, day)) as FlexiRules['late']) : undefined);
        const late = inMinute !== null && lateRef !== null && inMinute > lateRef + shift.graceMinutes;
        const field = mine.some((x) => x.verdict === 'field');
        const status = sched.weeklyOff
          ? 'off'
          : holiday
            ? 'rest'
            : leave?.part === 'full'
              ? 'leave'
              : wfh.some((x) => x.employeeId === p.id)
                ? 'wfh'
                : mode !== 'punch'
                  ? 'in'
                  : firstIn
                    ? field
                      ? 'od'
                      : late
                        ? 'late'
                        : before?.status === 'missing_out'
                          ? 'missing'
                          : 'in'
                    : leave
                      ? 'leave'
                      : 'not_in';
        const detail =
          status === 'off' ? 'Weekly off' : status === 'rest' ? holiday!.name : status === 'leave' ? (leave?.part === 'full' ? 'On leave' : 'On leave for half the day') : status === 'wfh' ? 'WFH today' : status === 'od' ? `On duty · ${last?.locationId ? (names.get(last.locationId) ?? 'away') : 'away from the office'}` : status === 'late' ? `Late by ${inMinute! - lateRef!} min` : status === 'not_in' ? `Shift ${hhmm(shift.shiftStart)}–${hhmm(shift.shiftEnd)}` : null;
        out.push({
          id: p.id,
          name: p.name,
          code: p.code,
          role: p.role,
          dept: p.dept,
          location: p.location,
          status,
          inAt: hhmm(inMinute),
          // On site now: checked in here and not checked out yet.
          onSite: Boolean(firstIn && last && last.kind !== 'out' && !field),
          site: firstIn?.locationId ? (names.get(firstIn.locationId) ?? p.location) : p.location,
          mode: mode === 'assumed_present' ? 'Assumed present' : mode === 'timesheet' ? 'Timesheet' : 'Punch',
          source: field ? 'field' : firstIn ? 'web' : null,
          detail,
          missedOutOn: before?.status === 'missing_out' ? yesterday : null,
          nudged: nudges.some((n) => n.employeeId === p.id),
          shiftStarted: inMinute !== null || minutesInto(day, f.zone, new Date()) >= shift.shiftStart,
          today: today?.status ?? null,
        });
      }
      const { from } = monthRange(day.slice(0, 7));
      const [{ n }] = ids.length
        ? await tx.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM attendance_days d WHERE d.organization_id = ${org}::uuid AND d.employee_id = ANY(${ids}::uuid[]) AND d.work_on BETWEEN ${from}::date AND ${day}::date AND d.status IN ('missing_in', 'missing_out', 'no_timesheet')`
        : [{ n: 0 }];
      return { today: day, at: new Date(), scope: tenantWide(v, 'attendance.view') ? 'company' : has(v, 'attendance.view') ? 'granted' : 'team', month: day.slice(0, 7), lockableFrom: addDays(monthRange(day.slice(0, 7)).to, 2), blocking: n, people: out };
    });
  }

  // ------------------------------------------------------------------------------------------ TIM-04 exceptions

  /**
   * One page of the month's exceptions in the viewer's scope (server-paged and filtered: holds up for 10,000 rows).
   * Open: a missing check-in / check-out, no approved timesheet or no attendance, not yet resolved by HR (a waiting fix
   * makes it "Request pending"). Resolved: the days HR resolved this month (the latest resolution). Newest day first.
   */
  async exceptions(ctx: TenantContext, user: ScopeUser, q: { month: string; legalEntityId?: string | null; status?: string[]; kind?: string[]; search?: string; page?: number; pageSize?: number }) {
    const { from, to } = monthRange(q.month);
    const v = await this.viewer(user);
    const page = Math.max(1, q.page ?? 1);
    const pageSize = q.pageSize ?? 50;
    const statuses = q.status?.length ? q.status : ['Open', 'Request pending', 'Resolved'];
    const kinds = q.kind?.length ? Object.entries(KIND).filter(([, k]) => q.kind!.includes(k)).map(([s]) => s) : null;
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const own = await this.own(tx, c, v);
      const today = todayIst();
      const last = to < today ? to : addDays(today, -1);
      const base = { month: q.month, today, scope: this.scope(v), canResolve: has(v, 'leave.approve') && !v.actingForOther, page, pageSize };
      const everyone = await this.people(tx, c, v, own, from, q.legalEntityId, to);
      const term = (q.search ?? '').trim().toLowerCase();
      const people = term ? everyone.filter((p) => p.name.toLowerCase().includes(term) || (p.code ?? '').toLowerCase().includes(term)) : everyone;
      if (!everyone.length || last < from) return { ...base, total: 0, blocking: 0, rows: [] };
      const all = everyone.map((p) => p.id);
      const ids = people.map((p) => p.id);
      const [{ blocking }] = await tx.$queryRaw<{ blocking: number }[]>`
        SELECT count(*)::int AS blocking FROM attendance_days d
        WHERE d.organization_id = ${org}::uuid AND d.employee_id = ANY(${all}::uuid[]) AND d.work_on BETWEEN ${from}::date AND ${last}::date
          AND d.status IN ('missing_in', 'missing_out', 'no_timesheet')
          AND NOT EXISTS (SELECT 1 FROM attendance_resolutions r WHERE r.organization_id = d.organization_id AND r.employee_id = d.employee_id AND r.work_on = d.work_on)`;
      const found = ids.length
        ? await tx.$queryRaw<{ employeeId: string; on: string; status: string | null; st: string; resolutionId: string | null; total: number }[]>`
          SELECT x.*, count(*) OVER()::int AS total FROM (
            SELECT d.employee_id::text AS "employeeId", d.work_on::text AS on, d.status,
                   CASE WHEN EXISTS (SELECT 1 FROM attendance_requests q WHERE q.organization_id = d.organization_id AND q.employee_id = d.employee_id AND q.work_on = d.work_on AND q.kind NOT IN ('wfh', 'permission') AND q.status = 'pending') THEN 'Request pending' ELSE 'Open' END AS st,
                   NULL::text AS "resolutionId"
            FROM attendance_days d
            WHERE d.organization_id = ${org}::uuid AND d.employee_id = ANY(${ids}::uuid[]) AND d.work_on BETWEEN ${from}::date AND ${last}::date
              AND d.status = ANY(${EXCEPTION_STATUSES}::text[])
              AND NOT EXISTS (SELECT 1 FROM attendance_resolutions r WHERE r.organization_id = d.organization_id AND r.employee_id = d.employee_id AND r.work_on = d.work_on)
            UNION ALL
            (SELECT DISTINCT ON (r.employee_id, r.work_on) r.employee_id::text, r.work_on::text, NULL, 'Resolved', r.id::text
             FROM attendance_resolutions r
             WHERE r.organization_id = ${org}::uuid AND r.employee_id = ANY(${ids}::uuid[]) AND r.work_on BETWEEN ${from}::date AND ${to}::date
             ORDER BY r.employee_id, r.work_on, r.created_at DESC)
          ) x
          WHERE x.st = ANY(${statuses}::text[]) AND (${kinds === null} OR x.status = ANY(${kinds ?? []}::text[]))
          ORDER BY x.on DESC, x."employeeId" LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`
        : [];
      const total = found[0]?.total ?? 0;
      const pageIds = [...new Set(found.map((r) => r.employeeId))];
      const days = found.length ? await tx.attendanceDay.findMany({ where: { organizationId: org, OR: found.filter((r) => r.status).map((r) => ({ employeeId: r.employeeId, workOn: asDate(r.on) })) } }) : [];
      const resolutions = found.some((r) => r.resolutionId) ? await tx.attendanceResolution.findMany({ where: { organizationId: org, id: { in: found.map((r) => r.resolutionId).filter((x): x is string => Boolean(x)) } } }) : [];
      const [requests, nudges, tasks] = await Promise.all([
        tx.attendanceRequest.findMany({ where: { organizationId: org, employeeId: { in: pageIds }, workOn: { gte: asDate(from), lte: asDate(to) }, kind: { notIn: ['wfh', 'permission'] }, status: 'pending' } }),
        tx.nudge.groupBy({ by: ['employeeId'], where: { organizationId: org, employeeId: { in: pageIds }, item: 'check_in', onDay: { gte: asDate(from), lte: asDate(to) } }, _count: { _all: true } }),
        v.userId ? tx.wfTask.findMany({ where: { organizationId: org, assigneeUserId: v.userId, status: 'open' }, select: { id: true, requestId: true } }) : Promise.resolve([]),
      ]);
      const byId = new Map(everyone.map((p) => [p.id, p]));
      const userNames = new Map((await tx.user.findMany({ where: { organizationId: org, id: { in: [...new Set(resolutions.map((r) => r.resolvedBy))] } }, select: { id: true, name: true, email: true } })).map((u) => [u.id, u.name || u.email]));
      const book = await ScheduleBook.load(tx, org);
      const rows: Record<string, unknown>[] = [];
      for (const x of found) {
        const p = byId.get(x.employeeId)!;
        const r = x.resolutionId ? resolutions.find((y) => y.id === x.resolutionId) : undefined;
        if (r) {
          rows.push({ id: `${x.employeeId}|${x.on}`, employeeId: x.employeeId, person: p.name, code: p.code, on: x.on, kind: 'Resolved by HR', status: 'Resolved', blocking: false, mode: 'Punch', detail: r.how === 'absent' ? 'Absent (unpaid)' : r.inMinute !== null ? `Present ${hhmm(r.inMinute)}–${hhmm(r.outMinute)}` : 'Present', firstIn: null, inAt: null, shiftEnd: null, nudged: 0, request: null, resolution: { how: r.how, reason: r.reason, by: userNames.get(r.resolvedBy) ?? null, at: r.createdAt } });
          continue;
        }
        const d = days.find((y) => y.employeeId === x.employeeId && dateOf(y.workOn) === x.on)!;
        const f = await factsOn(tx, org, x.employeeId, x.on);
        const zone = f?.zone ?? 'Asia/Kolkata';
        const effect = f ? await settingOn(tx, c, 'attendance.missing_punch_effect', f, x.on) : 'warning_only';
        const sh = f ? ((d.shiftId ? book.shiftOn(d.shiftId, x.on) : null) ?? (await book.locationDay(f, x.on)).rule) : null;
        const req = requests.find((y) => y.employeeId === x.employeeId && dateOf(y.workOn) === x.on);
        const task = req?.wfRequestId ? tasks.find((t) => t.requestId === req.wfRequestId) : undefined;
        const inAt = d.firstIn ? hhmm(minutesInto(x.on, zone, d.firstIn)) : null;
        rows.push({
          id: `${x.employeeId}|${x.on}`,
          employeeId: x.employeeId,
          person: p.name,
          code: p.code,
          on: x.on,
          kind: KIND[d.status],
          status: x.st,
          blocking: d.status !== 'absent' && effect === 'block_payroll_approval',
          mode: d.mode === 'timesheet' ? 'Timesheet' : 'Punch',
          detail: d.status === 'missing_out' ? `Checked in ${inAt ?? ''}, no check-out` : d.status === 'missing_in' ? 'Checked out, no check-in' : d.status === 'no_timesheet' ? 'No approved timesheet for the day' : 'No punches, leave or request',
          firstIn: d.firstIn,
          inAt,
          shiftEnd: sh ? hhmm(sh.shiftEnd) : null,
          nudged: nudges.find((n) => n.employeeId === x.employeeId)?._count._all ?? 0,
          request: req ? { id: req.id, kind: req.kind, inMinute: req.inMinute, outMinute: req.outMinute, reason: req.reason, taskId: task?.id ?? null } : null,
          resolution: null,
        });
      }
      return { ...base, total, blocking, rows };
    });
  }

  private scope(v: Viewer) {
    return tenantWide(v, 'attendance.view') ? 'company' : has(v, 'attendance.view') ? 'granted' : 'team';
  }

  // ------------------------------------------------------------------------------------------ resolve (TIM-04 / 03 / 02)

  /**
   * HR resolves days. Each day: HR holds leave.approve over the person (never their own day); the day has ended; the
   * month is still open (frozen and locked months take a correction for the next payroll); no fix of the person's is
   * waiting (decide it first); it is a working day. All days in one transaction: one refusal refuses them all.
   */
  async resolve(ctx: TenantContext, user: ScopeUser, dto: ResolveDto, source: 'exceptions' | 'bulk' = 'exceptions') {
    const v = await this.viewer(user);
    if (v.actingForOther) throw new ForbiddenException('Not available while acting for someone else.');
    if (!has(v, 'leave.approve')) throw new ForbiddenException('Resolving attendance needs leave.approve.');
    if ((dto.inMinute === undefined) !== (dto.outMinute === undefined)) throw new BadRequestException('Give both the check-in and the check-out time, or neither.');
    if (dto.how === 'absent' && dto.inMinute !== undefined) throw new BadRequestException('An absent day has no times.');
    if (dto.inMinute !== undefined && dto.inMinute === dto.outMinute) throw new BadRequestException('The check-out time is the same as the check-in time.');
    const keys = new Set(dto.days.map((d) => `${d.employeeId}|${d.on}`));
    if (keys.size !== dto.days.length) throw new BadRequestException('A day is listed twice.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const own = await this.own(tx, c, v);
      const batchId = dto.days.length > 1 ? randomUUID() : null;
      const done: { employeeId: string; on: string; from: string | null; to: string }[] = [];
      for (const d of [...dto.days].sort((a, b) => (a.employeeId + a.on).localeCompare(b.employeeId + b.on))) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`punch:${org}:${d.employeeId}`}))`;
        if (d.employeeId === own) throw new ForbiddenException('You cannot resolve your own attendance. Ask another HR person.');
        if (!(await grantCovers(tx, c, v, own, 'leave.approve', d.employeeId, d.on))) throw new NotFoundException('Not found');
        const f = await factsOn(tx, org, d.employeeId, d.on);
        if (!f || d.on < f.joinedOn || (f.exitedOn && d.on > f.exitedOn)) throw new BadRequestException(`${f?.name ?? 'This person'} was not working here on ${fmt(d.on)}.`);
        if (d.on >= todayIn(f.zone)) throw new BadRequestException(`${fmt(d.on)} is not over yet, so ${f.name}'s day is read only until tomorrow.`);
        if ((await lockedDates(tx, org, d.employeeId, d.on, d.on)).size) throw new ConflictException({ statusCode: 409, code: 'PERIOD_LOCKED', message: `${fmt(d.on)} is in a frozen or locked month. Record a correction for the next payroll instead.` });
        if (await tx.attendanceRequest.findFirst({ where: { organizationId: org, employeeId: d.employeeId, workOn: asDate(d.on), kind: { notIn: ['wfh', 'permission'] }, status: 'pending' }, select: { id: true } })) throw new ConflictException(`${f.name} asked to fix ${fmt(d.on)}. Approve or reject that request first.`);
        const day = await tx.attendanceDay.findUnique({ where: { organizationId_employeeId_workOn: { organizationId: org, employeeId: d.employeeId, workOn: asDate(d.on) } } });
        if (day && NOT_RESOLVABLE[day.status]) throw new ConflictException(`${fmt(d.on)} ${NOT_RESOLVABLE[day.status]} for ${f.name}; there is nothing to resolve.`);
        // Bulk "mark present" leaves days that already count as worked untouched.
        if (source === 'bulk' && day && (day.status === 'present' || day.status === 'half_day')) continue;
        const previous = await tx.attendanceResolution.findFirst({ where: { organizationId: org, employeeId: d.employeeId, workOn: asDate(d.on) }, orderBy: { createdAt: 'desc' } });
        // A repeat (double click, retry) within a minute is the same resolution, not a second one.
        if (previous && previous.how === dto.how && previous.inMinute === (dto.inMinute ?? null) && previous.outMinute === (dto.outMinute ?? null) && previous.reason === dto.reason && Date.now() - previous.createdAt.getTime() < 60_000) continue;
        await tx.attendanceResolution.create({ data: { organizationId: org, employeeId: d.employeeId, workOn: asDate(d.on), how: dto.how, inMinute: dto.inMinute ?? null, outMinute: dto.outMinute ?? null, reason: dto.reason, batchId, resolvedBy: c.userId! } });
        await this.days.evaluate(tx, c, d.employeeId, d.on, d.on);
        const after = await tx.attendanceDay.findUnique({ where: { organizationId_employeeId_workOn: { organizationId: org, employeeId: d.employeeId, workOn: asDate(d.on) } } });
        await audit(tx, c, source === 'bulk' ? 'attendance.marked_present' : 'attendance.resolved', 'employee', d.employeeId, { on: d.on, how: dto.how, inMinute: dto.inMinute ?? null, outMinute: dto.outMinute ?? null, reason: dto.reason, before: day?.status ?? null, after: after?.status ?? null, batchId });
        done.push({ employeeId: d.employeeId, on: d.on, from: day?.status ?? null, to: after?.status ?? dto.how });
      }
      return { resolved: done.length, unchanged: dto.days.length - done.length, days: done };
    });
  }

  /** TIM-02 bulk: HR marks the chosen people present on one past date of an open month, with a reason. */
  markPresent(ctx: TenantContext, user: ScopeUser, dto: MarkPresentDto) {
    if (new Set(dto.employeeIds).size !== dto.employeeIds.length) throw new BadRequestException('A person is listed twice.');
    return this.resolve(ctx, user, { days: dto.employeeIds.map((employeeId) => ({ employeeId, on: dto.on })), how: 'present', reason: dto.reason }, 'bulk');
  }

  // ------------------------------------------------------------------------------------------ TIM-16 reports

  /**
   * Late and early, overtime (TIM-16): per person in the viewer's scope (their team, or attendance.view): late marks,
   * early exits (checked out before the shift's end on a worked day), approved overtime hours and unpaid days. HR's page
   * adds them up by department and site; a manager's lists the people.
   */
  async attendanceReport(ctx: TenantContext, user: ScopeUser, month: string, entityId?: string | null) {
    const { from, to } = monthRange(month);
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const own = await this.own(tx, c, v);
      const today = todayIst();
      const people = await this.people(tx, c, v, own, from, entityId, to);
      const ids = people.map((p) => p.id);
      const upTo = to < today ? to : addDays(today, -1);
      const [days, ot, unpaid] = ids.length
        ? await Promise.all([
            tx.attendanceDay.findMany({ where: { organizationId: org, employeeId: { in: ids }, workOn: { gte: asDate(from), lte: asDate(upTo) } } }),
            tx.overtimeRequest.findMany({ where: { organizationId: org, employeeId: { in: ids }, status: 'approved', workOn: { gte: asDate(from), lte: asDate(to) } }, select: { employeeId: true, payableMinutes: true, overCapMinutes: true, overrideReason: true, settle: true } }),
            tx.$queryRaw<{ id: string; days: number }[]>`SELECT d.employee_id::text AS id, sum(CASE WHEN d.part = 'full' THEN 1 ELSE 0.5 END)::float AS days FROM leave_request_days d JOIN leave_requests r ON r.organization_id = d.organization_id AND r.id = d.request_id AND r.status IN ('approved', 'cancel_pending') JOIN leave_types t ON t.organization_id = r.organization_id AND t.id = r.leave_type_id AND NOT t.paid WHERE d.organization_id = ${org}::uuid AND d.employee_id = ANY(${ids}::uuid[]) AND d.active AND d.portion > 0 AND d.leave_on BETWEEN ${from}::date AND ${upTo}::date GROUP BY 1`,
          ])
        : [[], [], []];
      const book = await ScheduleBook.load(tx, org);
      const rows = [];
      for (const p of people) {
        const mine = days.filter((d) => d.employeeId === p.id);
        let early = 0;
        for (const d of mine.filter((x) => x.lastOut && (x.status === 'present' || x.status === 'half_day'))) {
          const on = dateOf(d.workOn);
          const f = await factsOn(tx, org, p.id, on);
          if (!f) continue;
          const shift = (d.shiftId ? book.shiftOn(d.shiftId, on) : null) ?? (await book.locationDay(f, on)).rule;
          // TIM-06: a flexi shift has no fixed end, so leaving before core hours end is early; a split ends with its second part.
          const end = shift.kind === 'flexi' && shift.coreEnd != null ? fromStart(shift, shift.coreEnd) : shift.shiftEnd > shift.shiftStart ? shift.shiftEnd : shift.shiftEnd + 1440;
          // The working half ends at the middle on a half-day leave.
          const workEnd = d.leavePart === 'second' ? Math.round((shift.shiftStart + end) / 2) : end;
          if (minutesInto(on, f.zone, d.lastOut!) < workEnd) early++;
        }
        const lop = mine.reduce((n, d) => n + (['absent', 'missing_in', 'missing_out', 'no_timesheet'].includes(d.status) ? 1 : d.status === 'half_day' ? 0.5 : 0), 0) + (unpaid.find((u) => u.id === p.id)?.days ?? 0);
        rows.push({
          id: p.id,
          name: p.name,
          code: p.code,
          dept: p.dept,
          location: p.location,
          late: mine.filter((d) => (d.lateMinutes ?? 0) > 0).length,
          early,
          otMinutes: ot.filter((x) => x.employeeId === p.id && x.settle === 'pay').reduce((n, x) => n + x.payableMinutes + (x.overrideReason ? x.overCapMinutes : 0), 0),
          lop,
        });
      }
      const lock = entityId ? await tx.payPeriod.findFirst({ where: { organizationId: org, legalEntityId: entityId, payGroupId: null, periodStart: asDate(from) }, select: { stage: true } }) : null;
      return { month, upTo, scope: this.scope(v), stage: lock?.stage ?? null, rows };
    });
  }

  /**
   * TIM-16 register of women night-shift workers (OSH Code / Factories Act s.66 as the state applies it; P07 IN.OSH night
   * window, default 7 pm to 6 am): women in scope who worked a night shift in the month, with their consent on file.
   * HR only (attendance.view): a manager's team view has no statutory registers.
   */
  async nightRegister(ctx: TenantContext, user: ScopeUser, month: string, entityId?: string | null) {
    const { from, to } = monthRange(month);
    const v = await this.viewer(user);
    if (!has(v, 'attendance.view')) throw new ForbiddenException('Registers need attendance.view.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const own = await this.own(tx, c, v);
      const women = (await this.people(tx, c, v, own, from, entityId, to)).filter((p) => p.id !== own);
      const ids = women.length ? (await tx.employeePersonalDetails.findMany({ where: { organizationId: org, employeeId: { in: women.map((p) => p.id) }, gender: 'female' }, select: { employeeId: true } })).map((x) => x.employeeId) : [];
      const nightShifts = (await tx.shift.findMany({ where: { organizationId: org, night: true }, select: { id: true } })).map((s) => s.id);
      const days = ids.length && nightShifts.length ? await tx.attendanceDay.findMany({ where: { organizationId: org, employeeId: { in: ids }, shiftId: { in: nightShifts }, status: { in: ['present', 'half_day'] }, workOn: { gte: asDate(from), lte: asDate(to) } } }) : [];
      const consents = ids.length ? await tx.nightWorkConsent.findMany({ where: { organizationId: org, employeeId: { in: ids } }, orderBy: { givenOn: 'desc' } }) : [];
      const book = await ScheduleBook.load(tx, org);
      const rows = [];
      for (const p of women.filter((w) => ids.includes(w.id))) {
        const mine = days.filter((d) => d.employeeId === p.id);
        if (!mine.length) continue;
        let minutes = 0;
        for (const d of mine) {
          const s = book.shiftOn(d.shiftId!, dateOf(d.workOn));
          // A split shift's gap is not work, so only its two parts count.
          if (s) minutes += partsOf(s).reduce((n, [a, b]) => n + nightMinutes(a % 1440, b % 1440), 0);
        }
        const consent = consents.find((x) => x.employeeId === p.id && dateOf(x.givenOn) <= to && (!x.withdrawnOn || dateOf(x.withdrawnOn) >= from));
        rows.push({ id: p.id, name: p.name, code: p.code, location: p.location, shifts: mine.length, nightMinutes: minutes, consent: consent ? { reference: consent.reference, givenOn: dateOf(consent.givenOn), withdrawnOn: consent.withdrawnOn ? dateOf(consent.withdrawnOn) : null, confirmed: Boolean(consent.confirmedAt) } : null });
      }
      const lock = entityId ? await tx.payPeriod.findFirst({ where: { organizationId: org, legalEntityId: entityId, payGroupId: null, periodStart: asDate(from) }, select: { stage: true } }) : null;
      await audit(tx, c, 'time.register.viewed', 'organization', org, { register: 'women_night_shift', month, rows: rows.length });
      return { month, stage: lock?.stage ?? null, rows };
    });
  }

  /** What the day card adds for HR (TIM-03 HrFix): whether this viewer may resolve the day, and why not. */
  async canResolveDay(tx: Tx, c: CompanyContext, v: Viewer, own: string | null, employeeId: string, on: string, zone: string): Promise<{ ok: boolean; why: string | null }> {
    if (v.actingForOther || employeeId === own || !(await grantCovers(tx, c, v, own, 'leave.approve', employeeId, on))) return { ok: false, why: null };
    if (on >= todayIn(zone)) return { ok: false, why: 'Today is read only until the day is over.' };
    if ((await lockedDates(tx, c.organizationId, employeeId, on, on)).size) return { ok: false, why: 'The month is frozen or locked: record a correction for the next payroll.' };
    return { ok: true, why: null };
  }

  /** Who may see a person's day (used by the day card): the same scope as the muster. */
  mustSee(tx: Tx, c: CompanyContext, v: Viewer, own: string | null, employeeId: string, on: string) {
    return mustSee(tx, c, v, own, 'attendance.view', employeeId, on);
  }
}
