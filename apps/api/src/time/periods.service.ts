import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { lineApproved } from './line-rules';
import { Prisma } from '@prisma/client';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { writeText } from '../documents/pdf-text';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { CompanyContext, Tx, audit, inCompany } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { Viewer, buildViewer, has, tenantWide, type ScopeUser } from '../access/scope';
import { DayEngine } from './day-engine.service';
import { ScheduleBook } from './schedule';
import { TIME_KEYS, asDate, dateOf, factsOn, monthRange, num, settingOn, visibleSql } from './time-core';
import { addDays, daysBetween } from './time-maths';
import { industrialPay, lateMarkDays, payOfDay, type IndustrialKind, type Legality } from './time-rules';
import { PayPeriodsService } from '../payroll/periods.service';
import { settingFor } from '../people/probation';

// P08 attendance periods per legal entity and month (lock / unlock with a fresh second sign-in step, audited), the
// §B6 payroll feed (per person and period, frozen when the period locks; a stable read for payroll in step 5), and the
// statutory muster and leave registers of an establishment (P07 IN.REGISTERS formats per state; the law's columns are
// always there, YX-DOC-22), as PDF or XLSX.

/** TIM-11 two-step lock: payroll approves the month HR sent (founder decision 5, 29 Oct 2026: its own key, Payroll role by default). */
const PAYROLL_APPROVE = 'attendance.lock.approve';
const HR_FREEZE = 'Inputs frozen by HR';
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
  /** TIM-37: legal lay-off days (payroll pays the lay-off compensation) and days on hold while legality is undetermined. */
  layoffDays: number;
  heldDays: number;
  /** Late marks over the free number turned into unpaid days (already inside lopDays). */
  lateLopDays: number;
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
    private readonly payPeriods: PayPeriodsService,
  ) {}

  private viewer(user: ScopeUser): Promise<Viewer> {
    return buildViewer(this.prisma, this.tenantPrisma, user, [...TIME_KEYS, PAYROLL_APPROVE]);
  }

  private async ownId(tx: Tx, c: CompanyContext, v: Viewer) {
    if (!v.userId || v.actingForOther) return null;
    return (await tx.employee.findFirst({ where: { organizationId: c.organizationId, userId: v.userId }, select: { id: true } }))?.id ?? null;
  }

  /** attendance.lock (or the payroll approval key) reaches a legal entity company-wide or through a grant on that entity. */
  private coversEntity(v: Viewer, entityId: string, key: string = 'attendance.lock') {
    return !v.actingForOther && (tenantWide(v, key) || (v.scopes.get(key) ?? []).some((s) => s.type === 'legal_entity' && s.id === entityId));
  }

  private lockFlow(tx: Tx, c: CompanyContext, entityId: string) {
    return settingFor(tx, c, 'attendance.lock_flow', { legalEntityId: entityId }) as Promise<'one_step' | 'two_step'>;
  }

  // ------------------------------------------------------------------------------------------ periods

  /** The year's months per legal entity the viewer may lock, with their stage. */
  async periods(ctx: TenantContext, user: ScopeUser, year: string, entityId?: string | null) {
    const v = await this.viewer(user);
    if (!has(v, 'attendance.lock') && !has(v, PAYROLL_APPROVE)) throw new ForbiddenException('Attendance periods need "Lock attendance" (HR) or "Approve attendance lock" (payroll). Ask your admin.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const entities = (await tx.legalEntity.findMany({ where: { organizationId: c.organizationId, archivedAt: null, ...(entityId ? { id: entityId } : {}) }, orderBy: { name: 'asc' }, select: { id: true, name: true } })).filter((e) => this.coversEntity(v, e.id) || this.coversEntity(v, e.id, PAYROLL_APPROVE));
      const locks = await tx.payPeriod.findMany({ where: { organizationId: c.organizationId, legalEntityId: { in: entities.map((e) => e.id) }, periodStart: { gte: asDate(`${year}-01-01`), lte: asDate(`${year}-12-01`) } } });
      const users = new Map((await tx.user.findMany({ where: { organizationId: c.organizationId, id: { in: locks.flatMap((l) => [l.changedBy, l.lockRequestedBy]).filter((x): x is string => Boolean(x)) } }, select: { id: true, name: true, email: true } })).map((u) => [u.id, u.name || u.email]));
      const flows = new Map<string, string>();
      for (const e of entities) flows.set(e.id, await this.lockFlow(tx, c, e.id));
      // PAY-1.02: "unlock" asks to reopen; a month with a request waiting shows it.
      const asked = new Set((await tx.periodReopenRequest.findMany({ where: { organizationId: c.organizationId, payPeriodId: { in: locks.map((l) => l.id) }, status: 'pending' }, select: { payPeriodId: true } })).map((r) => r.payPeriodId));
      const today = todayIst();
      return {
        year,
        today,
        entities: entities.map((e) => ({
          id: e.id,
          name: e.name,
          // TIM-11: one step (attendance.lock locks) or two (HR sends, payroll approves); what this viewer may do here.
          flow: flows.get(e.id) as 'one_step' | 'two_step',
          canLock: this.coversEntity(v, e.id),
          canApprove: this.coversEntity(v, e.id, PAYROLL_APPROVE),
          months: Array.from({ length: 12 }, (_, i) => {
            const month = `${year}-${String(i + 1).padStart(2, '0')}`;
            const l = locks.find((x) => x.legalEntityId === e.id && x.payGroupId === null && dateOf(x.periodStart) === `${month}-01`);
            return { month, stage: l?.stage ?? 'open', reopenAsked: Boolean(l && asked.has(l.id)), changedAt: l?.changedAt ?? null, changedBy: l?.changedBy ? (users.get(l.changedBy) ?? null) : null, reason: l?.reason ?? null, lockable: this.lockableFrom(month) <= today, lockableFrom: this.lockableFrom(month), sentAt: l?.lockRequestedAt ?? null, sentBy: l?.lockRequestedBy ? (users.get(l.lockRequestedBy) ?? null) : null, sentByMe: Boolean(l?.lockRequestedBy && l.lockRequestedBy === v.userId) };
          }),
        })),
      };
    });
  }

  /**
   * Home (PLT-02 "Due dates"): last month's attendance per legal entity the viewer may lock, while it is still open,
   * with what stops the lock today. Null without attendance.lock.
   */
  async dueLocks(ctx: TenantContext, user: ScopeUser, entityId?: string | null) {
    const v = await this.viewer(user);
    if (!has(v, 'attendance.lock') || v.actingForOther) return null;
    const today = todayIst();
    const month = addDays(`${today.slice(0, 7)}-01`, -1).slice(0, 7);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const entities = (await tx.legalEntity.findMany({ where: { organizationId: c.organizationId, archivedAt: null, ...(entityId ? { id: entityId } : {}) }, orderBy: { name: 'asc' }, select: { id: true, name: true } })).filter((e) => this.coversEntity(v, e.id));
      const locked = await tx.payPeriod.findMany({ where: { organizationId: c.organizationId, legalEntityId: { in: entities.map((e) => e.id) }, payGroupId: null, periodStart: asDate(`${month}-01`), stage: { not: 'open' } }, select: { legalEntityId: true } });
      const out = [];
      for (const e of entities.filter((x) => !locked.some((l) => l.legalEntityId === x.id))) {
        const pre = await this.preflightIn(tx, c, e.id, month);
        if (!pre.people) continue;
        out.push({ month, entityId: e.id, entityName: e.name, lockableFrom: this.lockableFrom(month), exceptions: pre.exceptions, waiting: pre.pending.reduce((n, x) => n + x.count, 0) });
      }
      return out;
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
  async preflightIn(tx: Tx, c: CompanyContext, entityId: string, month: string) {
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
      if (!f || f.legalEntityId !== entityId || (await settingOn(tx, c, 'attendance.missing_punch_effect', f, dateOf(d.workOn))) !== 'block_payroll_approval') continue;
      // A frozen day can't change: a correction recorded for it (waiting or approved) settles it for the next payroll.
      if (await tx.payCorrection.findFirst({ where: { organizationId: org, employeeId: d.employeeId, workOn: d.workOn, status: { in: ['pending', 'approved'] } }, select: { id: true } })) continue;
      exceptions++;
    }
    return { people: people.length, pending, exceptions };
  }

  async preflight(ctx: TenantContext, user: ScopeUser, entityId: string, month: string) {
    const v = await this.viewer(user);
    if (!this.coversEntity(v, entityId) && !this.coversEntity(v, entityId, PAYROLL_APPROVE)) throw new NotFoundException('Not found');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      if (!(await tx.legalEntity.findFirst({ where: { organizationId: c.organizationId, id: entityId } }))) throw new NotFoundException('Not found');
      return { month, lockableFrom: this.lockableFrom(month), ...(await this.preflightIn(tx, c, entityId, month)) };
    });
  }

  /**
   * Locks a month for a legal entity (P08), one-step flow: whoever holds attendance.lock over the entity. In the two-step
   * flow (setting attendance.lock_flow) HR sends the month and payroll approves the lock (approveLock). Step-up is
   * checked by the guard.
   */
  async lock(ctx: TenantContext, user: ScopeUser, entityId: string, month: string) {
    const v = await this.viewer(user);
    if (v.actingForOther) throw new ForbiddenException('Not available while acting for someone else.');
    if (!this.coversEntity(v, entityId)) throw new NotFoundException('Not found');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      if ((await this.lockFlow(tx, c, entityId)) === 'two_step') throw new ConflictException({ statusCode: 409, code: 'LOCK_TWO_STEP', message: 'This company locks attendance in two steps: send the month for payroll approval, and payroll locks it.' });
      return this.lockIn(tx, c, entityId, month, null);
    });
  }

  /** TIM-11 two-step flow: payroll (attendance.lock.approve over the entity) approves the lock HR sent; never the sender. */
  async approveLock(ctx: TenantContext, user: ScopeUser, entityId: string, month: string) {
    const v = await this.viewer(user);
    if (v.actingForOther) throw new ForbiddenException('Not available while acting for someone else.');
    if (!this.coversEntity(v, entityId, PAYROLL_APPROVE)) throw new NotFoundException('Not found');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      if ((await this.lockFlow(tx, c, entityId)) !== 'two_step') throw new ConflictException('This company locks attendance in one step: HR locks it on the Periods page.');
      return this.lockIn(tx, c, entityId, month, v.userId);
    });
  }

  private async lockIn(tx: Tx, c: CompanyContext, entityId: string, month: string, approver: string | null) {
    const org = c.organizationId;
    if (this.lockableFrom(month) > todayIst()) throw new BadRequestException(`${monthText(month)} can be locked from ${this.lockableFrom(month)}.`);
    if (!(await tx.legalEntity.findFirst({ where: { organizationId: org, id: entityId } }))) throw new NotFoundException('Not found');
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`lock:${org}:${entityId}:${month}`}))`;
    const { from, to } = monthRange(month);
    const current = await tx.payPeriod.findFirst({ where: { organizationId: org, legalEntityId: entityId, payGroupId: null, periodStart: asDate(from) } });
    if (current && (current.stage === 'locked' || current.stage === 'filed')) throw new ConflictException(`${monthText(month)} is already locked.`);
    if (approver) {
      if (!current?.lockRequestedBy) throw new ConflictException(`HR has not sent ${monthText(month)} for approval yet.`);
      if (current.lockRequestedBy === approver) throw new ForbiddenException('You sent this month, so someone else in payroll must approve the lock.');
    }
    // Every day of the month evaluated with the inputs as they are now, before the check and the freeze.
    const people = await this.employeesOf(tx, org, entityId, from, to);
    const book = await ScheduleBook.load(tx, org);
    // D2: a frozen month's days are already fixed (the database refuses changes to them); they are locked as they are.
    if (current?.stage !== 'frozen') for (const p of people) await this.days.evaluate(tx, c, p.id, from, to, new Date(), book);
    const pre = await this.preflightIn(tx, c, entityId, month);
    if (pre.pending.length || pre.exceptions) {
      const parts = [...pre.pending.map((x) => `${x.count} ${x.kind.toLowerCase()} waiting`), ...(pre.exceptions ? [`${pre.exceptions} days with missing punches or timesheets`] : [])];
      throw new ConflictException({ statusCode: 409, code: 'LOCK_PREFLIGHT', message: `${monthText(month)} can't be locked yet: ${parts.join(', ')}. Decide or fix them first.`, preflight: pre });
    }
    const lock = current
      ? await tx.payPeriod.update({ where: { id: current.id }, data: { stage: 'locked', changedBy: c.userId ?? null, changedAt: new Date(), reason: null, lockedAt: new Date(), lockedBy: c.userId ?? null, version: { increment: 1 } } })
      : await tx.payPeriod.create({ data: { organizationId: org, legalEntityId: entityId, periodStart: asDate(from), periodEnd: asDate(to), stage: 'locked', changedBy: c.userId ?? null, lockedAt: new Date(), lockedBy: c.userId ?? null } });
    await tx.periodLockEvent.create({ data: { organizationId: org, payPeriodId: lock.id, fromStage: current?.stage ?? 'open', toStage: 'locked', byUser: c.userId ?? null, reason: approver ? 'Lock approved by payroll' : null } });
    const rows = await this.feedRows(tx, c, entityId, month);
    if (rows.length)
      await tx.payrollFeedRow.createMany({
        data: rows.map((r) => ({ organizationId: org, payPeriodId: lock.id, legalEntityId: entityId, periodStart: asDate(from), employeeId: r.employeeId, mode: r.mode, calendarDays: r.calendarDays, paidDays: r.paidDays, lopDays: r.lopDays, otNormalMinutes: r.otNormalMinutes, otWeeklyOffMinutes: r.otWeeklyOffMinutes, otHolidayMinutes: r.otHolidayMinutes, nightShifts: r.nightShifts, compOffDays: r.compOffDays, timesheetMinutes: r.timesheetMinutes, layoffDays: r.layoffDays, heldDays: r.heldDays, lateLopDays: r.lateLopDays })),
      });
    // YX-AUD-09: what was seen and confirmed.
    await audit(tx, c, 'time.period.locked', 'pay_period', lock.id, { legalEntityId: entityId, month, people: rows.length, paidDays: rows.reduce((s, r) => s + r.paidDays, 0), lopDays: rows.reduce((s, r) => s + r.lopDays, 0), sentBy: current?.lockRequestedBy ?? null, approvedBy: approver });
    return { id: lock.id, stage: 'locked', frozen: rows.length };
  }

  /**
   * TIM-02 "Freeze inputs" (HR, attendance.lock): from the day the month may be locked, every day is worked out once more
   * and then fixed (founder decision D2: the database refuses changes to frozen days; employees use a late request).
   * Requests still waiting must be decided first, because a frozen day can no longer take their answer.
   */
  async freeze(ctx: TenantContext, user: ScopeUser, entityId: string, month: string) {
    const v = await this.viewer(user);
    if (v.actingForOther) throw new ForbiddenException('Not available while acting for someone else.');
    if (!this.coversEntity(v, entityId)) throw new NotFoundException('Not found');
    return inCompany(this.tenantPrisma, ctx, (tx, c) => this.freezeIn(tx, c, entityId, month));
  }

  private async freezeIn(tx: Tx, c: CompanyContext, entityId: string, month: string) {
    const org = c.organizationId;
    if (this.lockableFrom(month) > todayIst()) throw new BadRequestException(`${monthText(month)} can be frozen from ${this.lockableFrom(month)}, once its last night shift has ended.`);
    if (!(await tx.legalEntity.findFirst({ where: { organizationId: org, id: entityId } }))) throw new NotFoundException('Not found');
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`lock:${org}:${entityId}:${month}`}))`;
    const { from, to } = monthRange(month);
    const current = await tx.payPeriod.findFirst({ where: { organizationId: org, legalEntityId: entityId, payGroupId: null, periodStart: asDate(from) } });
    if (current && current.stage !== 'open') throw new ConflictException(`${monthText(month)} is already ${current.stage}.`);
    const book = await ScheduleBook.load(tx, org);
    for (const p of await this.employeesOf(tx, org, entityId, from, to)) await this.days.evaluate(tx, c, p.id, from, to, new Date(), book);
    const pre = await this.preflightIn(tx, c, entityId, month);
    if (pre.pending.length) throw new ConflictException({ statusCode: 409, code: 'FREEZE_PENDING', message: `${monthText(month)} can't be frozen yet: ${pre.pending.map((x) => `${x.count} ${x.kind.toLowerCase()} waiting`).join(', ')}. Decide them first; after the freeze they could not change the month.`, preflight: pre });
    const row = current
      ? await tx.payPeriod.update({ where: { id: current.id }, data: { stage: 'frozen', changedBy: c.userId ?? null, changedAt: new Date(), reason: null, version: { increment: 1 } } })
      : await tx.payPeriod.create({ data: { organizationId: org, legalEntityId: entityId, periodStart: asDate(from), periodEnd: asDate(to), stage: 'frozen', changedBy: c.userId ?? null } });
    await tx.periodLockEvent.create({ data: { organizationId: org, payPeriodId: row.id, fromStage: 'open', toStage: 'frozen', byUser: c.userId ?? null, reason: HR_FREEZE } });
    await audit(tx, c, 'time.period.frozen', 'pay_period', row.id, { legalEntityId: entityId, month, people: pre.people, exceptions: pre.exceptions });
    return { id: row.id, stage: 'frozen', exceptions: pre.exceptions };
  }

  /**
   * Opens a month HR froze again, with a reason (attendance.lock, and the second sign-in step: founder decision 7a,
   * 29 Oct 2026). Not when payroll froze it for a run; a month sent for approval goes back to HR too.
   */
  async unfreeze(ctx: TenantContext, user: ScopeUser, entityId: string, month: string, reason: string) {
    const v = await this.viewer(user);
    if (v.actingForOther) throw new ForbiddenException('Not available while acting for someone else.');
    if (!this.coversEntity(v, entityId)) throw new NotFoundException('Not found');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      if (!(await tx.legalEntity.findFirst({ where: { organizationId: org, id: entityId }, select: { id: true } }))) throw new NotFoundException('Not found');
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`lock:${org}:${entityId}:${month}`}))`;
      const p = await tx.payPeriod.findFirst({ where: { organizationId: org, legalEntityId: entityId, payGroupId: null, periodStart: asDate(monthRange(month).from) } });
      if (!p || p.stage !== 'frozen') throw new ConflictException(`${monthText(month)} is not frozen.`);
      const last = await tx.periodLockEvent.findFirst({ where: { organizationId: org, payPeriodId: p.id, toStage: 'frozen' }, orderBy: { createdAt: 'desc' } });
      if (last?.reason !== HR_FREEZE) throw new ConflictException(`Payroll froze ${monthText(month)} for its run, so only payroll can open it.`);
      await tx.payPeriod.update({ where: { id: p.id }, data: { stage: 'open', changedBy: c.userId ?? null, changedAt: new Date(), reason, lockRequestedBy: null, lockRequestedAt: null, version: { increment: 1 } } });
      await tx.periodLockEvent.create({ data: { organizationId: org, payPeriodId: p.id, fromStage: 'frozen', toStage: 'open', byUser: c.userId ?? null, reason } });
      await audit(tx, c, 'time.period.unfrozen', 'pay_period', p.id, { legalEntityId: entityId, month, reason, wasSent: Boolean(p.lockRequestedBy) });
      return { id: p.id, stage: 'open' };
    });
  }

  /**
   * TIM-11 two-step flow: HR sends the month for payroll approval. It is frozen first (if it is not yet) and must pass
   * the pre-lock checks, so payroll only confirms. Sending twice is a no-op.
   */
  async send(ctx: TenantContext, user: ScopeUser, entityId: string, month: string) {
    const v = await this.viewer(user);
    if (v.actingForOther) throw new ForbiddenException('Not available while acting for someone else.');
    if (!this.coversEntity(v, entityId)) throw new NotFoundException('Not found');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      if ((await this.lockFlow(tx, c, entityId)) !== 'two_step') throw new ConflictException('This company locks attendance in one step: lock the month instead.');
      const from = monthRange(month).from;
      let p = await tx.payPeriod.findFirst({ where: { organizationId: org, legalEntityId: entityId, payGroupId: null, periodStart: asDate(from) } });
      if (p && (p.stage === 'locked' || p.stage === 'filed')) throw new ConflictException(`${monthText(month)} is already locked.`);
      if (p?.lockRequestedBy) return { id: p.id, stage: p.stage, sentAt: p.lockRequestedAt, repeat: true };
      if (!p || p.stage === 'open') await this.freezeIn(tx, c, entityId, month);
      const pre = await this.preflightIn(tx, c, entityId, month);
      if (pre.pending.length || pre.exceptions) {
        const parts = [...pre.pending.map((x) => `${x.count} ${x.kind.toLowerCase()} waiting`), ...(pre.exceptions ? [`${pre.exceptions} days with missing punches or timesheets`] : [])];
        throw new ConflictException({ statusCode: 409, code: 'LOCK_PREFLIGHT', message: `${monthText(month)} can't be sent yet: ${parts.join(', ')}. Resolve them first.`, preflight: pre });
      }
      p = await tx.payPeriod.findFirstOrThrow({ where: { organizationId: org, legalEntityId: entityId, payGroupId: null, periodStart: asDate(from) } });
      await tx.payPeriod.update({ where: { id: p.id }, data: { lockRequestedBy: c.userId ?? null, lockRequestedAt: new Date(), version: { increment: 1 } } });
      await audit(tx, c, 'time.period.sent_for_lock', 'pay_period', p.id, { legalEntityId: entityId, month, people: pre.people });
      return { id: p.id, stage: 'frozen', sentAt: new Date(), repeat: false };
    });
  }

  /** The muster's period card (TIM-02): stage, when it may be frozen or locked, what blocks it, what the viewer may do. */
  async musterPeriod(tx: Tx, c: CompanyContext, v: Viewer, entityId: string, month: string) {
    const p = await tx.payPeriod.findFirst({ where: { organizationId: c.organizationId, legalEntityId: entityId, payGroupId: null, periodStart: asDate(monthRange(month).from) } });
    const pre = await this.preflightIn(tx, c, entityId, month);
    const entity = await tx.legalEntity.findFirst({ where: { organizationId: c.organizationId, id: entityId }, select: { name: true } });
    return {
      legalEntityId: entityId,
      entityName: entity?.name ?? '',
      stage: (p?.stage ?? 'open') as 'open' | 'frozen' | 'locked' | 'filed',
      lockableFrom: this.lockableFrom(month),
      lockable: this.lockableFrom(month) <= todayIst(),
      flow: await this.lockFlow(tx, c, entityId),
      sentAt: p?.lockRequestedAt ?? null,
      lockedAt: p?.lockedAt ?? null,
      exceptions: pre.exceptions,
      pending: pre.pending,
      canLock: this.coversEntity(v, entityId),
      canApprove: this.coversEntity(v, entityId, PAYROLL_APPROVE),
    };
  }

  /** The legal entity a muster's month is about: the one asked for, else the company's only one. */
  async musterEntity(tx: Tx, c: CompanyContext, user: ScopeUser, entityId: string | null | undefined): Promise<{ v: Viewer; id: string | null }> {
    const v = await this.viewer(user);
    if (entityId) return { v, id: (await tx.legalEntity.findFirst({ where: { organizationId: c.organizationId, id: entityId }, select: { id: true } }))?.id ?? null };
    const all = await tx.legalEntity.findMany({ where: { organizationId: c.organizationId, archivedAt: null }, select: { id: true } });
    return { v, id: all.length === 1 ? all[0].id : null };
  }

  /**
   * "Unlock" asks to reopen the month (founder decision 9 Oct 2026: unlock was step-up + a reason until payroll existed;
   * now it is the P08 two-approval reopen request, PAY-1.02). The month stays locked until both approvals are given.
   */
  unlock(ctx: TenantContext, user: ScopeUser, entityId: string, month: string, reason: string) {
    return this.payPeriods.requestReopen(ctx, user, entityId, month, reason, 'attendance.lock');
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
      -- Answer 2477: whether the type is paid on each leave day (its version in force that day); unpaid during notice pays nothing.
      SELECT d.employee_id::text AS "employeeId", d.leave_on::text AS on, bool_and(coalesce((SELECT v.paid FROM leave_type_versions v WHERE v.organization_id = r.organization_id AND v.leave_type_id = r.leave_type_id AND v.valid_from <= d.leave_on ORDER BY v.valid_from DESC LIMIT 1), t.paid) AND NOT r.unpaid_in_notice) AS paid FROM leave_request_days d
      JOIN leave_requests r ON r.organization_id = d.organization_id AND r.id = d.request_id AND r.status IN ('approved', 'cancel_pending')
      JOIN leave_types t ON t.organization_id = r.organization_id AND t.id = r.leave_type_id
      WHERE d.organization_id = ${org}::uuid AND d.employee_id = ANY(${ids}::uuid[]) AND d.active AND d.portion > 0 AND d.leave_on BETWEEN ${from}::date AND ${to}::date
      GROUP BY 1, 2`;
    const ot = await tx.overtimeRequest.findMany({ where: { organizationId: org, employeeId: { in: ids }, status: 'approved', workOn: { gte: asDate(from), lte: asDate(to) } } });
    const night = new Set((await tx.shift.findMany({ where: { organizationId: org, night: true }, select: { id: true } })).map((s) => s.id));
    const sheets = await tx.timesheet.findMany({ where: { organizationId: org, employeeId: { in: ids }, status: 'approved', weekStart: { gte: asDate(addDays(from, -6)), lte: asDate(to) } } });
    const lines = sheets.length ? await tx.timesheetLine.findMany({ where: { organizationId: org, timesheetId: { in: sheets.map((s) => s.id) } } }) : [];
    const events = await tx.industrialActionEvent.findMany({ where: { organizationId: org, legalEntityId: entityId, status: 'active', fromOn: { lte: asDate(to) }, toOn: { gte: asDate(from) } } });
    const out: FeedRow[] = [];
    for (const p of people) {
      let layoff = 0;
      let held = 0;
      let lateMarks = 0;
      let lastFacts: Awaited<ReturnType<typeof factsOn>> = null;
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
        lastFacts = f;
        if (d.status === 'strike' || d.status === 'lockout' || d.status === 'layoff') {
          const e = events.find((x) => x.kind === d.status && x.locationId === f.locationId && (!x.departmentId || x.departmentId === f.departmentId) && dateOf(x.fromOn) <= on && dateOf(x.toOn) >= on);
          const ip = industrialPay(d.status as IndustrialKind, (e?.legality ?? 'undetermined') as Legality);
          paid += ip.paid;
          lop += ip.lop;
          layoff += ip.layoff;
          held += ip.held;
          continue;
        }
        if ((d.lateMinutes ?? 0) > 0) lateMarks++;
        const lp = leavePaid.find((x) => x.employeeId === p.id && x.on === on);
        const pay = payOfDay({ status: d.status, leavePart: d.leavePart as 'full' | 'first' | 'second' | null, leavePaid: lp ? lp.paid : null });
        paid += pay.paid;
        lop += pay.lop;
        if (d.shiftId && night.has(d.shiftId) && (d.status === 'present' || d.status === 'half_day')) nights++;
      }
      // Late marks over the free number cost unpaid days (company settings; default: no deduction). Never below zero paid.
      const lateLop = lastFacts ? Math.min(paid, lateMarkDays(lateMarks, Number(await settingOn(tx, c, 'attendance.late_marks_free', lastFacts, to)), Number(await settingOn(tx, c, 'attendance.late_mark_penalty', lastFacts, to)))) : 0;
      paid -= lateLop;
      lop += lateLop;
      const myOt = ot.filter((x) => x.employeeId === p.id);
      const otOf = (cat: string) => myOt.filter((x) => x.category === cat && x.settle === 'pay').reduce((s, x) => s + x.payableMinutes + (x.overrideReason ? x.overCapMinutes : 0), 0);
      let tsMinutes = 0;
      for (const s of sheets.filter((x) => x.employeeId === p.id)) {
        const monday = dateOf(s.weekStart);
        for (let k = 0; k < 7; k++) {
          const on = addDays(monday, k);
          if (on < from || on > to) continue;
          tsMinutes += lines.filter((l) => l.timesheetId === s.id).reduce((sum, l) => sum + (lineApproved(l)[k] ?? 0), 0);
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
        layoffDays: layoff,
        heldDays: held,
        lateLopDays: lateLop,
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
      const lock = await tx.payPeriod.findFirst({ where: { organizationId: org, legalEntityId: entityId, periodStart: asDate(from) } });
      const frozen = lock?.stage === 'locked';
      let rows: (FeedRow & { frozenAt?: Date })[];
      if (frozen) {
        const people = new Map((await this.employeesOf(tx, org, entityId, from, to)).map((p) => [p.id, p]));
        rows = (await tx.payrollFeedRow.findMany({ where: { organizationId: org, payPeriodId: lock!.id, supersededAt: null }, orderBy: { frozenAt: 'desc' } }))
          .filter((r) => visible.has(r.employeeId))
          .map((r) => ({ employeeId: r.employeeId, name: people.get(r.employeeId)?.name ?? '', code: people.get(r.employeeId)?.code ?? null, mode: r.mode, calendarDays: r.calendarDays, paidDays: num(r.paidDays), lopDays: num(r.lopDays), otNormalMinutes: r.otNormalMinutes, otWeeklyOffMinutes: r.otWeeklyOffMinutes, otHolidayMinutes: r.otHolidayMinutes, nightShifts: r.nightShifts, compOffDays: num(r.compOffDays), timesheetMinutes: r.timesheetMinutes, unevaluatedDays: 0, layoffDays: num(r.layoffDays), heldDays: num(r.heldDays), lateLopDays: num(r.lateLopDays), frozenAt: r.frozenAt }))
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
        const lock = await tx.payPeriod.findFirst({ where: { organizationId: org, legalEntityId: l.entityId, periodStart: asDate(from) } });
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
      const lock = await tx.payPeriod.findFirst({ where: { organizationId: org, legalEntityId: loc.legalEntityId, periodStart: asDate(from) } });
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
      writeText(doc.fontSize(8).text(head.form), `Establishment: ${head.establishment}`).text(`Period: ${head.period}${head.draft ? ' · DRAFT: the month is not locked yet' : ''}`);
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
          writeText(doc, t, x + 1, y, { width: widths[i] - 2, lineBreak: true });
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
