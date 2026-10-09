import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { CompanyContext, Tx, audit, inCompany } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { Viewer, buildViewer, has, tenantWide, type ScopeUser } from '../access/scope';
import { DayEngine } from './day-engine.service';
import { ScheduleBook } from './schedule';
import { TIME_KEYS, asDate, dateOf, factsOn, monthRange, num, settingOn, visibleSql } from './time-core';
import { addDays, daysBetween } from './time-maths';
import { payOfDay } from './time-rules';

// P08 attendance periods per legal entity and month (lock / unlock with a fresh second sign-in step, audited), the
// §B6 payroll feed (per person and period, frozen when the period locks; a stable read for payroll in step 5), and the
// statutory muster and leave registers of an establishment (P07 IN.REGISTERS formats per state; the law's columns are
// always there, YX-DOC-22), as PDF or XLSX.

const monthText = (month: string) => new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const PENDING = { leave: ['pending', 'cancel_pending'] };
/** Register day codes (the muster's legend). */
const DAY_CODE: Record<string, string> = { present: 'P', half_day: 'HD', absent: 'A', leave: 'L', holiday: 'H', weekly_off: 'WO', missing_in: 'MI', missing_out: 'MO', no_timesheet: 'NT', not_started: '' };

export interface FeedRow {
  employeeId: string;
  name: string;
  code: string | null;
  mode: string;
  calendarDays: number;
  paidDays: number;
  lopDays: number;
  otNormalMinutes: number;
  otWeeklyOffMinutes: number;
  otHolidayMinutes: number;
  nightShifts: number;
  compOffDays: number;
  timesheetMinutes: number;
  /** Days not evaluated yet (before go-live, or not yet run): neither paid nor loss of pay. */
  unevaluatedDays: number;
}

interface RegisterFormat {
  type: 'muster' | 'leave';
  title: string;
  form: string;
  columns: { key: string; label: string }[];
}

@Injectable()
export class PeriodsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly days: DayEngine,
  ) {}

  private viewer(user: ScopeUser): Promise<Viewer> {
    return buildViewer(this.prisma, this.tenantPrisma, user, [...TIME_KEYS]);
  }

  private async ownId(tx: Tx, c: CompanyContext, v: Viewer) {
    if (!v.userId || v.actingForOther) return null;
    return (await tx.employee.findFirst({ where: { organizationId: c.organizationId, userId: v.userId }, select: { id: true } }))?.id ?? null;
  }

  /** attendance.lock reaches a legal entity company-wide or through a grant on that entity. */
  private coversEntity(v: Viewer, entityId: string) {
    return tenantWide(v, 'attendance.lock') || (v.scopes.get('attendance.lock') ?? []).some((s) => s.type === 'legal_entity' && s.id === entityId);
  }

  // ------------------------------------------------------------------------------------------ periods

  /** The year's months per legal entity the viewer may lock, with their stage. */
  async periods(ctx: TenantContext, user: ScopeUser, year: string) {
    const v = await this.viewer(user);
    if (!has(v, 'attendance.lock')) throw new ForbiddenException('Locking attendance needs attendance.lock.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const entities = (await tx.legalEntity.findMany({ where: { organizationId: c.organizationId, archivedAt: null }, orderBy: { name: 'asc' }, select: { id: true, name: true } })).filter((e) => this.coversEntity(v, e.id));
      const locks = await tx.periodLock.findMany({ where: { organizationId: c.organizationId, legalEntityId: { in: entities.map((e) => e.id) }, periodStart: { gte: asDate(`${year}-01-01`), lte: asDate(`${year}-12-01`) } } });
      const users = new Map((await tx.user.findMany({ where: { organizationId: c.organizationId, id: { in: locks.map((l) => l.changedBy).filter((x): x is string => Boolean(x)) } }, select: { id: true, name: true, email: true } })).map((u) => [u.id, u.name || u.email]));
      const today = todayIst();
      return {
        year,
        today,
        entities: entities.map((e) => ({
          id: e.id,
          name: e.name,
          months: Array.from({ length: 12 }, (_, i) => {
            const month = `${year}-${String(i + 1).padStart(2, '0')}`;
            const l = locks.find((x) => x.legalEntityId === e.id && dateOf(x.periodStart) === `${month}-01`);
            return { month, stage: l?.stage ?? 'open', changedAt: l?.changedAt ?? null, changedBy: l?.changedBy ? (users.get(l.changedBy) ?? null) : null, reason: l?.reason ?? null, lockable: this.lockableFrom(month) <= today };
          }),
        })),
      };
    });
  }

  /** A month can be locked from the 2nd of the next month (so a night shift of its last day has ended). */
  private lockableFrom(month: string) {
    return addDays(monthRange(month).to, 2);
  }

  private async employeesOf(tx: Tx, org: string, entityId: string, from: string, to: string) {
    return tx.$queryRaw<{ id: string; name: string; code: string | null }[]>`
      SELECT e.id::text, concat_ws(' ', coalesce(e.preferred_name, e.given_name), e.family_name) AS name, max(m.employee_code::text) AS code
      FROM employees e
      JOIN employee_assignments a ON a.organization_id = e.organization_id AND a.employee_id = e.id AND a.superseded_at IS NULL AND a.legal_entity_id = ${entityId}::uuid
        AND daterange(a.valid_from, a.valid_to, '[]') && daterange(${from}::date, ${to}::date, '[]')
      JOIN employments m ON m.organization_id = e.organization_id AND m.id = a.employment_id
      WHERE e.organization_id = ${org}::uuid GROUP BY 1, 2 ORDER BY 2 LIMIT 5000`;
  }

  /** What stops a lock (P08 pre-flight): requests still waiting, and open exceptions where the group blocks (YX-LOCK-08). */
  private async preflightIn(tx: Tx, c: CompanyContext, entityId: string, month: string) {
    const org = c.organizationId;
    const { from, to } = monthRange(month);
    const people = (await this.employeesOf(tx, org, entityId, from, to)).map((p) => p.id);
    if (!people.length) return { people: 0, pending: [] as { kind: string; count: number }[], exceptions: 0 };
    const count = (sql: Prisma.Sql) => tx.$queryRaw<{ n: number }[]>(sql).then((r) => r[0]?.n ?? 0);
    const ids = Prisma.sql`${people}::uuid[]`;
    const pending = [
      { kind: 'Leave requests', count: await count(Prisma.sql`SELECT count(DISTINCT r.id)::int AS n FROM leave_requests r JOIN leave_request_days d ON d.organization_id = r.organization_id AND d.request_id = r.id WHERE r.organization_id = ${org}::uuid AND r.employee_id = ANY(${ids}) AND r.status = ANY(${PENDING.leave}::text[]) AND d.leave_on BETWEEN ${from}::date AND ${to}::date`) },
      { kind: 'Attendance fixes', count: await count(Prisma.sql`SELECT count(*)::int AS n FROM attendance_requests WHERE organization_id = ${org}::uuid AND employee_id = ANY(${ids}) AND status = 'pending' AND work_on BETWEEN ${from}::date AND ${to}::date`) },
      { kind: 'Overtime claims', count: await count(Prisma.sql`SELECT count(*)::int AS n FROM overtime_requests WHERE organization_id = ${org}::uuid AND employee_id = ANY(${ids}) AND status = 'pending' AND work_on BETWEEN ${from}::date AND ${to}::date`) },
      { kind: 'Shift swaps', count: await count(Prisma.sql`SELECT count(*)::int AS n FROM shift_swap_requests WHERE organization_id = ${org}::uuid AND employee_id = ANY(${ids}) AND status = 'pending' AND work_on BETWEEN ${from}::date AND ${to}::date`) },
      { kind: 'Timesheets', count: await count(Prisma.sql`SELECT count(*)::int AS n FROM timesheets WHERE organization_id = ${org}::uuid AND employee_id = ANY(${ids}) AND status = 'pending' AND week_start BETWEEN ${addDays(from, -6)}::date AND ${to}::date`) },
    ].filter((x) => x.count > 0);
    const open = await tx.attendanceDay.findMany({ where: { organizationId: org, employeeId: { in: people }, workOn: { gte: asDate(from), lte: asDate(to) }, status: { in: ['missing_in', 'missing_out', 'no_timesheet'] } } });
    let exceptions = 0;
    for (const d of open) {
      const f = await factsOn(tx, org, d.employeeId, dateOf(d.workOn));
      if (f && f.legalEntityId === entityId && (await settingOn(tx, c, 'attendance.missing_punch_effect', f, dateOf(d.workOn))) === 'block_payroll_approval') exceptions++;
    }
    return { people: people.length, pending, exceptions };
  }

  async preflight(ctx: TenantContext, user: ScopeUser, entityId: string, month: string) {
    const v = await this.viewer(user);
    if (!this.coversEntity(v, entityId)) throw new NotFoundException('Not found');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      if (!(await tx.legalEntity.findFirst({ where: { organizationId: c.organizationId, id: entityId } }))) throw new NotFoundException('Not found');
      return { month, lockableFrom: this.lockableFrom(month), ...(await this.preflightIn(tx, c, entityId, month)) };
    });
  }

  /**
   * Locks a month for a legal entity (P08): days brought up to date, the pre-flight must be clear, then the period is
   * locked and the payroll feed frozen, in one transaction. Step-up is checked by the guard.
   */
  async lock(ctx: TenantContext, user: ScopeUser, entityId: string, month: string) {
    const v = await this.viewer(user);
    if (v.actingForOther) throw new ForbiddenException('Not available while acting for someone else.');
    if (!this.coversEntity(v, entityId)) throw new NotFoundException('Not found');
    if (this.lockableFrom(month) > todayIst()) throw new BadRequestException(`${monthText(month)} can be locked from ${this.lockableFrom(month)}.`);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      if (!(await tx.legalEntity.findFirst({ where: { organizationId: org, id: entityId } }))) throw new NotFoundException('Not found');
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`lock:${org}:${entityId}:${month}`}))`;
      const { from, to } = monthRange(month);
      const current = await tx.periodLock.findFirst({ where: { organizationId: org, legalEntityId: entityId, periodType: 'attendance', periodStart: asDate(from) } });
      if (current?.stage === 'locked') throw new ConflictException(`${monthText(month)} is already locked.`);
      // Every day of the month evaluated with the inputs as they are now, before the check and the freeze.
      const people = await this.employeesOf(tx, org, entityId, from, to);
      const book = await ScheduleBook.load(tx, org);
      for (const p of people) await this.days.evaluate(tx, c, p.id, from, to, new Date(), book);
      const pre = await this.preflightIn(tx, c, entityId, month);
      if (pre.pending.length || pre.exceptions) {
        const parts = [...pre.pending.map((x) => `${x.count} ${x.kind.toLowerCase()} waiting`), ...(pre.exceptions ? [`${pre.exceptions} days with missing punches or timesheets`] : [])];
        throw new ConflictException({ statusCode: 409, code: 'LOCK_PREFLIGHT', message: `${monthText(month)} can't be locked yet: ${parts.join(', ')}. Decide or fix them first.`, preflight: pre });
      }
      const lock = current
        ? await tx.periodLock.update({ where: { id: current.id }, data: { stage: 'locked', changedBy: c.userId ?? null, changedAt: new Date(), reason: null } })
        : await tx.periodLock.create({ data: { organizationId: org, legalEntityId: entityId, periodStart: asDate(from), periodEnd: asDate(to), stage: 'locked', changedBy: c.userId ?? null } });
      const rows = await this.feedRows(tx, c, entityId, month);
      if (rows.length)
        await tx.payrollFeedRow.createMany({
          data: rows.map((r) => ({ organizationId: org, lockId: lock.id, legalEntityId: entityId, periodStart: asDate(from), employeeId: r.employeeId, mode: r.mode, calendarDays: r.calendarDays, paidDays: r.paidDays, lopDays: r.lopDays, otNormalMinutes: r.otNormalMinutes, otWeeklyOffMinutes: r.otWeeklyOffMinutes, otHolidayMinutes: r.otHolidayMinutes, nightShifts: r.nightShifts, compOffDays: r.compOffDays, timesheetMinutes: r.timesheetMinutes })),
        });
      // YX-AUD-09: what was seen and confirmed.
      await audit(tx, c, 'time.period.locked', 'period_lock', lock.id, { legalEntityId: entityId, month, people: rows.length, paidDays: rows.reduce((s, r) => s + r.paidDays, 0), lopDays: rows.reduce((s, r) => s + r.lopDays, 0) });
      return { id: lock.id, stage: 'locked', frozen: rows.length };
    });
  }

  /** Unlocks a month (step-up, reason, audited); the frozen feed is kept but superseded. */
  async unlock(ctx: TenantContext, user: ScopeUser, entityId: string, month: string, reason: string) {
    const v = await this.viewer(user);
    if (v.actingForOther) throw new ForbiddenException('Not available while acting for someone else.');
    if (!this.coversEntity(v, entityId)) throw new NotFoundException('Not found');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const { from } = monthRange(month);
      const l = await tx.periodLock.findFirst({ where: { organizationId: org, legalEntityId: entityId, periodType: 'attendance', periodStart: asDate(from) } });
      if (!l || l.stage !== 'locked') throw new ConflictException(`${monthText(month)} is not locked.`);
      // Founder decision 9 Oct 2026: unlock = step-up + a reason now; once payroll (step 5) exists it becomes the P08
      // two-approval reopen request (Payroll Admin and System Admin, refused after bank release).
      await tx.periodLock.update({ where: { id: l.id }, data: { stage: 'open', changedBy: c.userId ?? null, changedAt: new Date(), reason } });
      await tx.payrollFeedRow.updateMany({ where: { organizationId: org, lockId: l.id, supersededAt: null }, data: { supersededAt: new Date() } });
      await audit(tx, c, 'time.period.unlocked', 'period_lock', l.id, { legalEntityId: entityId, month, reason });
      return { id: l.id, stage: 'open' };
    });
  }

  // ------------------------------------------------------------------------------------------ the payroll feed (§B6)

  /** Live figures per person for an entity and month (frozen at lock). Approved OT and comp-off only (YX-AT-04). */
  async feedRows(tx: Tx, c: CompanyContext, entityId: string, month: string, only?: Set<string>): Promise<FeedRow[]> {
    const org = c.organizationId;
    const { from, to } = monthRange(month);
    const people = (await this.employeesOf(tx, org, entityId, from, to)).filter((p) => !only || only.has(p.id));
    if (!people.length) return [];
    const ids = people.map((p) => p.id);
    const days = await tx.attendanceDay.findMany({ where: { organizationId: org, employeeId: { in: ids }, workOn: { gte: asDate(from), lte: asDate(to) } } });
    const leavePaid = await tx.$queryRaw<{ employeeId: string; on: string; paid: boolean }[]>`
      SELECT d.employee_id::text AS "employeeId", d.leave_on::text AS on, bool_and(t.paid) AS paid FROM leave_request_days d
      JOIN leave_requests r ON r.organization_id = d.organization_id AND r.id = d.request_id AND r.status IN ('approved', 'cancel_pending')
      JOIN leave_types t ON t.organization_id = r.organization_id AND t.id = r.leave_type_id
      WHERE d.organization_id = ${org}::uuid AND d.employee_id = ANY(${ids}::uuid[]) AND d.active AND d.portion > 0 AND d.leave_on BETWEEN ${from}::date AND ${to}::date
      GROUP BY 1, 2`;
    const ot = await tx.overtimeRequest.findMany({ where: { organizationId: org, employeeId: { in: ids }, status: 'approved', workOn: { gte: asDate(from), lte: asDate(to) } } });
    const night = new Set((await tx.shift.findMany({ where: { organizationId: org, night: true }, select: { id: true } })).map((s) => s.id));
    const sheets = await tx.timesheet.findMany({ where: { organizationId: org, employeeId: { in: ids }, status: 'approved', weekStart: { gte: asDate(addDays(from, -6)), lte: asDate(to) } } });
    const lines = sheets.length ? await tx.timesheetLine.findMany({ where: { organizationId: org, timesheetId: { in: sheets.map((s) => s.id) } } }) : [];
    const out: FeedRow[] = [];
    for (const p of people) {
      let calendarDays = 0;
      let mode = 'punch';
      const mine = new Map(days.filter((d) => d.employeeId === p.id).map((d) => [dateOf(d.workOn), d]));
      let paid = 0;
      let lop = 0;
      let nights = 0;
      let unevaluated = 0;
      for (let on = from; on <= to; on = addDays(on, 1)) {
        const f = await factsOn(tx, org, p.id, on);
        if (!f || f.legalEntityId !== entityId || on < f.joinedOn || (f.exitedOn && on > f.exitedOn)) continue;
        calendarDays++;
        // The person's mode on the day (P01 scoped, dated), whether or not the day was worked out.
        mode = await settingOn(tx, c, 'attendance.mode', f, on);
        const d = mine.get(on);
        if (!d) {
          unevaluated++;
          continue;
        }
        const lp = leavePaid.find((x) => x.employeeId === p.id && x.on === on);
        const pay = payOfDay({ status: d.status, leavePart: d.leavePart as 'full' | 'first' | 'second' | null, leavePaid: lp ? lp.paid : null });
        paid += pay.paid;
        lop += pay.lop;
        if (d.shiftId && night.has(d.shiftId) && (d.status === 'present' || d.status === 'half_day')) nights++;
      }
      const myOt = ot.filter((x) => x.employeeId === p.id);
      const otOf = (cat: string) => myOt.filter((x) => x.category === cat && x.settle === 'pay').reduce((s, x) => s + x.payableMinutes + (x.overrideReason ? x.overCapMinutes : 0), 0);
      let tsMinutes = 0;
      for (const s of sheets.filter((x) => x.employeeId === p.id)) {
        const monday = dateOf(s.weekStart);
        for (let k = 0; k < 7; k++) {
          const on = addDays(monday, k);
          if (on < from || on > to) continue;
          tsMinutes += lines.filter((l) => l.timesheetId === s.id).reduce((sum, l) => sum + (l.minutes[k] ?? 0), 0);
        }
      }
      out.push({
        employeeId: p.id,
        name: p.name,
        code: p.code,
        mode,
        calendarDays,
        paidDays: Math.round(paid * 100) / 100,
        lopDays: Math.round(lop * 100) / 100,
        otNormalMinutes: otOf('normal'),
        otWeeklyOffMinutes: otOf('weekly_off'),
        otHolidayMinutes: otOf('holiday'),
        nightShifts: nights,
        compOffDays: myOt.filter((x) => x.settle === 'comp_off').reduce((s, x) => s + num(x.compOffDays), 0),
        timesheetMinutes: tsMinutes,
        unevaluatedDays: unevaluated,
      });
    }
    return out;
  }

  /**
   * The payroll feed for an entity and month (§B6). Locked: the frozen rows (the stable figures payroll uses). Open:
   * a live preview, marked not final. HR reads it with attendance.view over the people (explicit grants only).
   */
  async feed(ctx: TenantContext, user: ScopeUser, entityId: string, month: string) {
    const v = await this.viewer(user);
    if (!has(v, 'attendance.view')) throw new ForbiddenException('The payroll feed needs attendance.view.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const entity = await tx.legalEntity.findFirst({ where: { organizationId: org, id: entityId }, select: { id: true, name: true } });
      if (!entity) throw new NotFoundException('Not found');
      const { from, to } = monthRange(month);
      const own = await this.ownId(tx, c, v);
      const visible = new Set(
        (
          await tx.$queryRaw<{ id: string }[]>`SELECT e.id::text FROM employees e WHERE e.organization_id = ${org}::uuid AND ${await visibleSql(tx, c, v, own, 'attendance.view', Prisma.sql`e.id`, to, false)} AND (${own}::uuid IS NULL OR e.id <> ${own}::uuid)`
        ).map((r) => r.id),
      );
      const lock = await tx.periodLock.findFirst({ where: { organizationId: org, legalEntityId: entityId, periodType: 'attendance', periodStart: asDate(from) } });
      const frozen = lock?.stage === 'locked';
      let rows: (FeedRow & { frozenAt?: Date })[];
      if (frozen) {
        const people = new Map((await this.employeesOf(tx, org, entityId, from, to)).map((p) => [p.id, p]));
        rows = (await tx.payrollFeedRow.findMany({ where: { organizationId: org, lockId: lock!.id, supersededAt: null }, orderBy: { frozenAt: 'desc' } }))
          .filter((r) => visible.has(r.employeeId))
          .map((r) => ({ employeeId: r.employeeId, name: people.get(r.employeeId)?.name ?? '', code: people.get(r.employeeId)?.code ?? null, mode: r.mode, calendarDays: r.calendarDays, paidDays: num(r.paidDays), lopDays: num(r.lopDays), otNormalMinutes: r.otNormalMinutes, otWeeklyOffMinutes: r.otWeeklyOffMinutes, otHolidayMinutes: r.otHolidayMinutes, nightShifts: r.nightShifts, compOffDays: num(r.compOffDays), timesheetMinutes: r.timesheetMinutes, unevaluatedDays: 0, frozenAt: r.frozenAt }))
          .sort((a, b) => a.name.localeCompare(b.name));
      } else rows = await this.feedRows(tx, c, entityId, month, visible);
      await audit(tx, c, 'time.payroll_feed.viewed', 'legal_entity', entityId, { month, rows: rows.length, frozen });
      return { entity, month, frozen, lockedAt: frozen ? lock!.changedAt : null, rows };
    });
  }

  // ------------------------------------------------------------------------------------------ registers (P07 IN.REGISTERS)

  /** Establishments the viewer can export registers for, with the state's formats and the month's lock. */
  async registers(ctx: TenantContext, user: ScopeUser, month: string) {
    const v = await this.viewer(user);
    if (!has(v, 'attendance.view')) throw new ForbiddenException('Registers need attendance.view.');
    const { from, to } = monthRange(month);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const own = await this.ownId(tx, c, v);
      const locs = await tx.$queryRaw<{ id: string; name: string; state: string; entityId: string; entity: string; people: number }[]>`
        SELECT l.id::text, l.name::text, l.state, l.legal_entity_id::text AS "entityId", le.name::text AS entity, count(DISTINCT a.employee_id)::int AS people
        FROM locations l JOIN legal_entities le ON le.organization_id = l.organization_id AND le.id = l.legal_entity_id
        JOIN employee_assignments a ON a.organization_id = l.organization_id AND a.location_id = l.id AND a.superseded_at IS NULL AND daterange(a.valid_from, a.valid_to, '[]') && daterange(${from}::date, ${to}::date, '[]')
        WHERE l.organization_id = ${org}::uuid AND ${await visibleSql(tx, c, v, own, 'attendance.view', Prisma.sql`a.employee_id`, to, false)}
        GROUP BY 1, 2, 3, 4, 5 ORDER BY 2`;
      const out = [];
      for (const l of locs) {
        const formats = await this.formats(tx, l.state, from);
        const lock = await tx.periodLock.findFirst({ where: { organizationId: org, legalEntityId: l.entityId, periodType: 'attendance', periodStart: asDate(from) } });
        out.push({ ...l, locked: lock?.stage === 'locked', formats: formats.registers.map((r) => ({ type: r.type, title: r.title, form: r.form, columns: r.columns.map((x) => x.label) })), source: formats.source, verify: formats.verify });
      }
      return { month, locations: out };
    });
  }

  // The register formats and form numbers are P07 IN.REGISTERS data on the compliance verify list (founder decision
  // 9 Oct 2026).
  private async formats(tx: Tx, state: string, on: string): Promise<{ registers: RegisterFormat[]; source: string | null; verify: boolean }> {
    const rs = await tx.statutoryRuleSet.findFirst({ where: { statute: 'IN.REGISTERS', jurisdiction: state, validFrom: { lte: asDate(on) }, OR: [{ validTo: null }, { validTo: { gte: asDate(on) } }] }, orderBy: { validFrom: 'desc' } });
    return { registers: ((rs?.values ?? {}) as { registers?: RegisterFormat[] }).registers ?? [], source: rs?.source ?? null, verify: rs?.verify ?? true };
  }

  /** One register as a file. Every column the law's format lists is always there (YX-DOC-22); each export is audited. */
  async exportRegister(ctx: TenantContext, user: ScopeUser, type: 'muster' | 'leave', locationId: string, month: string, format: 'pdf' | 'xlsx'): Promise<{ file: Buffer; name: string; contentType: string }> {
    const v = await this.viewer(user);
    if (!has(v, 'attendance.view')) throw new ForbiddenException('Registers need attendance.view.');
    const { from, to } = monthRange(month);
    const data = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const loc = await tx.location.findFirst({ where: { organizationId: org, id: locationId } });
      if (!loc) throw new NotFoundException('Not found');
      const fmt = (await this.formats(tx, loc.state, from)).registers.find((r) => r.type === type);
      if (!fmt) throw new BadRequestException(`There is no ${type} register format for this state yet.`);
      const entity = await tx.legalEntity.findFirstOrThrow({ where: { organizationId: org, id: loc.legalEntityId }, select: { name: true, id: true } });
      const own = await this.ownId(tx, c, v);
      const people = await tx.$queryRaw<{ id: string; name: string; code: string | null; designation: string }[]>`
        SELECT e.id::text, concat_ws(' ', coalesce(e.preferred_name, e.given_name), e.family_name) AS name, max(m.employee_code::text) AS code, max(dg.name::text) AS designation
        FROM employees e
        JOIN employee_assignments a ON a.organization_id = e.organization_id AND a.employee_id = e.id AND a.superseded_at IS NULL AND a.location_id = ${locationId}::uuid
          AND daterange(a.valid_from, a.valid_to, '[]') && daterange(${from}::date, ${to}::date, '[]')
        JOIN employments m ON m.organization_id = e.organization_id AND m.id = a.employment_id
        JOIN designations dg ON dg.organization_id = a.organization_id AND dg.id = a.designation_id
        WHERE e.organization_id = ${org}::uuid AND ${await visibleSql(tx, c, v, own, 'attendance.view', Prisma.sql`e.id`, to, false)}
        GROUP BY 1, 2 ORDER BY 3, 2 LIMIT 5000`;
      if (!people.length) throw new NotFoundException('Not found');
      const lock = await tx.periodLock.findFirst({ where: { organizationId: org, legalEntityId: loc.legalEntityId, periodType: 'attendance', periodStart: asDate(from) } });
      const ids = people.map((p) => p.id);
      const rows: Record<string, string | number>[] = [];
      if (type === 'muster') {
        const days = await tx.attendanceDay.findMany({ where: { organizationId: org, employeeId: { in: ids }, workOn: { gte: asDate(from), lte: asDate(to) } } });
        const ot = await tx.overtimeRequest.findMany({ where: { organizationId: org, employeeId: { in: ids }, status: 'approved', workOn: { gte: asDate(from), lte: asDate(to) } } });
        people.forEach((p, i) => {
          const mine = days.filter((d) => d.employeeId === p.id);
          const by = new Map(mine.map((d) => [dateOf(d.workOn), d.status]));
          const daily: string[] = [];
          for (let on = from; on <= to; on = addDays(on, 1)) daily.push(by.has(on) ? DAY_CODE[by.get(on)!] ?? '' : '');
          rows.push({
            sl: i + 1,
            code: p.code ?? '',
            name: p.name,
            designation: p.designation,
            days: daily.join(' '),
            ...Object.fromEntries(daily.map((x, k) => [`d${k + 1}`, x])),
            present: mine.filter((d) => d.status === 'present').length + mine.filter((d) => d.status === 'half_day').length / 2,
            leave: mine.filter((d) => d.status === 'leave').length,
            absent: mine.filter((d) => d.status === 'absent' || d.status === 'missing_in' || d.status === 'missing_out' || d.status === 'no_timesheet').length,
            ot: Math.round((ot.filter((x) => x.employeeId === p.id).reduce((s, x) => s + x.payableMinutes + (x.overrideReason ? x.overCapMinutes : 0), 0) / 60) * 100) / 100,
          });
        });
      } else {
        const types = await tx.leaveType.findMany({ where: { organizationId: org }, orderBy: { code: 'asc' } });
        const ledger = await tx.leaveLedgerEntry.findMany({ where: { organizationId: org, employeeId: { in: ids }, entryOn: { lte: asDate(to) } } });
        const taken = await tx.$queryRaw<{ employeeId: string; typeId: string; on: string }[]>`
          SELECT d.employee_id::text AS "employeeId", r.leave_type_id::text AS "typeId", d.leave_on::text AS on FROM leave_request_days d
          JOIN leave_requests r ON r.organization_id = d.organization_id AND r.id = d.request_id AND r.status IN ('approved', 'cancel_pending')
          WHERE d.organization_id = ${org}::uuid AND d.employee_id = ANY(${ids}::uuid[]) AND d.active AND d.portion > 0 AND d.leave_on BETWEEN ${from}::date AND ${to}::date ORDER BY 3`;
        let sl = 0;
        for (const p of people)
          for (const t of types) {
            const mine = ledger.filter((l) => l.employeeId === p.id && l.leaveTypeId === t.id);
            const dates = taken.filter((x) => x.employeeId === p.id && x.typeId === t.id).map((x) => x.on.slice(8));
            if (!mine.length && !dates.length) continue;
            const sum = (pred: (l: (typeof mine)[number]) => boolean) => Math.round(mine.filter(pred).reduce((s, l) => s + num(l.days), 0) * 100) / 100;
            const inMonth = (l: (typeof mine)[number]) => dateOf(l.entryOn) >= from;
            rows.push({
              sl: ++sl,
              code: p.code ?? '',
              name: p.name,
              type: `${t.code} ${t.name}`,
              opening: sum((l) => !inMonth(l)),
              credited: sum((l) => inMonth(l) && num(l.days) > 0),
              taken: -sum((l) => inMonth(l) && num(l.days) < 0),
              dates: dates.join(', '),
              closing: sum(() => true),
            });
          }
      }
      await audit(tx, c, 'time.register.exported', 'location', locationId, { type, month, format, rows: rows.length, locked: lock?.stage === 'locked' });
      return { fmt, loc, entity, rows, locked: lock?.stage === 'locked', days: daysBetween(from, to) + 1 };
    });
    const name = `${type}-register-${data.loc.code}-${month}.${format}`;
    const head = { title: data.fmt.title, form: data.fmt.form, establishment: `${data.loc.name}, ${data.entity.name}`, period: monthText(month), draft: !data.locked };
    // The muster's "day by day" column is laid out as one column per date.
    const cols = data.fmt.columns.flatMap((col) => (type === 'muster' && col.key === 'days' ? Array.from({ length: data.days }, (_, k) => ({ key: `d${k + 1}`, label: String(k + 1) })) : [col]));
    return format === 'xlsx' ? { file: await this.xlsx(head, cols, data.rows), name, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' } : { file: await this.pdf(head, cols, data.rows), name, contentType: 'application/pdf' };
  }

  private async xlsx(head: { title: string; form: string; establishment: string; period: string; draft: boolean }, cols: { key: string; label: string }[], rows: Record<string, string | number>[]): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Register');
    ws.addRow([head.title]).font = { bold: true, size: 13 };
    ws.addRow([head.form]);
    ws.addRow([`Establishment: ${head.establishment}`]);
    ws.addRow([`Period: ${head.period}${head.draft ? ' · DRAFT: the month is not locked yet' : ''}`]);
    ws.addRow([]);
    ws.addRow(cols.map((c) => c.label)).font = { bold: true };
    for (const r of rows) ws.addRow(cols.map((c) => r[c.key] ?? ''));
    ws.columns.forEach((c, i) => (c.width = cols[i] && cols[i].key.startsWith('d') && /^d\d+$/.test(cols[i].key) ? 4 : 16));
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  private pdf(head: { title: string; form: string; establishment: string; period: string; draft: boolean }, cols: { key: string; label: string }[], rows: Record<string, string | number>[]): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 24 });
      const chunks: Buffer[] = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      doc.fontSize(13).text(head.title);
      doc.fontSize(8).text(head.form).text(`Establishment: ${head.establishment}`).text(`Period: ${head.period}${head.draft ? ' · DRAFT: the month is not locked yet' : ''}`);
      doc.moveDown(0.5);
      const width = doc.page.width - 48;
      const narrow = cols.filter((c) => /^d\d+$/.test(c.key)).length;
      const wide = cols.length - narrow;
      const nw = narrow ? 14 : 0;
      const ww = (width - nw * narrow) / Math.max(1, wide);
      const widths = cols.map((c) => (/^d\d+$/.test(c.key) ? nw : ww));
      const line = (cells: string[], bold = false) => {
        if (doc.y > doc.page.height - 40) doc.addPage();
        const y = doc.y;
        let x = 24;
        doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(6);
        let h = 0;
        cells.forEach((t, i) => {
          doc.text(t, x + 1, y, { width: widths[i] - 2, lineBreak: true });
          h = Math.max(h, doc.y - y);
          x += widths[i];
        });
        doc.y = y + Math.max(h, 8) + 2;
        doc.moveTo(24, doc.y - 1).lineTo(24 + width, doc.y - 1).lineWidth(0.3).stroke();
      };
      line(cols.map((c) => c.label), true);
      for (const r of rows) line(cols.map((c) => String(r[c.key] ?? '')));
      doc.moveDown(2).font('Helvetica').fontSize(8).text('Signature of the employer or manager: ____________________', 24);
      doc.end();
    });
  }
}
