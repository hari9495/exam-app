import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { CompanyContext, Tx, audit, inCompany } from '../org-structure/org-structure.service';
import { Viewer, buildViewer, inEntitySql, inScopeSql, tenantWide, has, type ScopeUser } from '../access/scope';
import { ApprovalsEngine, Notice, StepSpec } from '../workflow/approvals-engine.service';
import { NotificationsService } from '../notifications/notifications.service';
import { escapeHtml } from '../notifications/notification-email-render';
import { DayEngine } from './day-engine.service';
import { PunchDto, RegulariseDto, WfhDto } from './dto';
import { TIME_KEYS, asDate, dateOf, factsOn, holidaysFor, hrApprovers, monthRange, mustSee, myEmployeeId, rulesFor, settingOn, todayIn, visibleSql, type Facts } from './time-core';
import { addDays, checkInVerdict, minutesInto, type Fence } from './time-maths';
import { ScheduleBook, assertOpen } from './schedule';
import { workOnForPunch } from './time-rules';

// M02 Part B basics: web punches with the geofence / allowed-network check (Q6, YX-AT-01, every refused attempt
// logged, YX-AT-23), my days and the team / HR muster (YX-AT-14, read-only in batch 1), and regularisation through
// P03 with the monthly limit (Q5: beyond it HR approves too).

export const REGULARISE = 'attendance.regularise';
export const WFH = 'attendance.wfh';
const KIND_TEXT: Record<string, string> = { missed_in: 'Missed check-in', missed_out: 'Missed check-out', wrong_time: 'Wrong time', full_day: 'Present all day' };
const ALREADY: Record<PunchDto['kind'], string> = { in: 'Already checked in', out: 'Already checked out', break_start: 'Break already started', break_end: 'Break already ended' };
const DONE: Record<PunchDto['kind'], string> = { in: 'Checked in', out: 'Checked out', break_start: 'Break started', break_end: 'Break ended' };
const hhmm = (m: number | null) => (m === null ? '' : `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
const fmt = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

@Injectable()
export class AttendanceService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly engine: ApprovalsEngine,
    private readonly days: DayEngine,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit() {
    this.engine.register({ key: REGULARISE, label: 'Attendance fix', risk: 'normal', autoActions: false, onDecided: (tx, req, outcome) => this.decided(tx, req, outcome), requesterLink: () => '/yx/time/attendance' });
    this.engine.register({ key: WFH, label: 'Work from home', risk: 'normal', autoActions: false, onDecided: (tx, req, outcome) => this.decided(tx, req, outcome), requesterLink: () => '/yx/time/attendance' });
  }

  private viewer(user: ScopeUser): Promise<Viewer> {
    return buildViewer(this.prisma, this.tenantPrisma, user, [...TIME_KEYS]);
  }

  private async meFacts(tx: Tx, c: CompanyContext): Promise<{ f: Facts; today: string }> {
    const id = await myEmployeeId(tx, c.organizationId, c.userId);
    const f = await factsOn(tx, c.organizationId, id, new Date().toISOString().slice(0, 10));
    if (!f) throw new NotFoundException('You have no job assignment today. Ask HR to check your record.');
    const today = todayIn(f.zone);
    return { f: (await factsOn(tx, c.organizationId, id, today)) ?? f, today };
  }

  private async fences(tx: Tx, org: string, ids: string[]): Promise<Fence[]> {
    const rows = await tx.location.findMany({ where: { organizationId: org, id: { in: ids }, archivedAt: null } });
    return rows.map((l) => ({ locationId: l.id, name: l.name, lat: l.geoLat === null ? null : Number(l.geoLat), lng: l.geoLng === null ? null : Number(l.geoLng), radiusM: l.geoRadiusM, ipRanges: l.ipRanges }));
  }

  private punchView(p: Prisma.PunchGetPayload<object>, names: Map<string, string>) {
    return { id: p.id, kind: p.kind, at: p.punchedAt, source: p.source, accepted: p.accepted, refusal: p.refusal, verdict: p.verdict, distanceM: p.distanceM, accuracyM: p.accuracyM, where: p.locationId ? (names.get(p.locationId) ?? null) : null };
  }

  /** Me › Attendance: today's shift, the allowed places, my punches today, my month and my fixes. */
  me(ctx: TenantContext, month: string) {
    const { from, to } = monthRange(month);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const { f, today } = await this.meFacts(tx, c);
      const rule = (await rulesFor(tx, org, f.locationId, today))(today);
      const day = await (await ScheduleBook.load(tx, org)).day(f, today);
      const fences = await this.fences(tx, org, [f.locationId, ...rule.alsoAllowed]);
      const names = new Map(fences.map((x) => [x.locationId, x.name]));
      const punches = await tx.punch.findMany({ where: { organizationId: org, employeeId: f.employeeId, workOn: asDate(today) }, orderBy: { punchedAt: 'asc' } });
      const accepted = punches.filter((p) => p.accepted);
      const days = await tx.attendanceDay.findMany({ where: { organizationId: org, employeeId: f.employeeId, workOn: { gte: asDate(from), lte: asDate(to) } }, orderBy: { workOn: 'asc' } });
      const requests = await tx.attendanceRequest.findMany({ where: { organizationId: org, employeeId: f.employeeId, workOn: { gte: asDate(addDays(from, -31)) } }, orderBy: { workOn: 'desc' }, take: 60 });
      const limit = Number(await settingOn(tx, c, 'attendance.regularise_monthly_limit', f, today));
      const used = await tx.attendanceRequest.count({ where: { organizationId: org, employeeId: f.employeeId, kind: { not: 'wfh' }, status: { in: ['pending', 'approved'] }, workOn: { gte: asDate(`${today.slice(0, 7)}-01`), lte: asDate(today) } } });
      const thisMonth = monthRange(today.slice(0, 7));
      const wfhUsed = await tx.attendanceRequest.count({ where: { organizationId: org, employeeId: f.employeeId, kind: 'wfh', status: { in: ['pending', 'approved'] }, workOn: { gte: asDate(thisMonth.from), lte: asDate(thisMonth.to) } } });
      return {
        employee: { id: f.employeeId, name: f.name },
        today,
        zone: f.zone,
        mode: await settingOn(tx, c, 'attendance.mode', f, today),
        // Today's shift from the roster / pattern / location (Q1); null on a weekly off.
        shift: day.shift ? { name: day.shift.name, start: day.shift.shiftStart, end: day.shift.shiftEnd, grace: day.shift.graceMinutes, checkIn: rule.checkIn, off: false } : { name: 'Weekly off', start: rule.shiftStart, end: rule.shiftEnd, grace: rule.graceMinutes, checkIn: rule.checkIn, off: true },
        fences: fences.filter((x) => x.lat !== null).map((x) => ({ name: x.name, lat: x.lat, lng: x.lng, radiusM: x.radiusM })),
        punches: punches.map((p) => this.punchView(p, names)),
        // Working or on a break: the next punch closes the day (a break still open ends at check-out).
        next: accepted.length && accepted[accepted.length - 1].kind !== 'out' ? 'out' : 'in',
        onBreak: accepted.at(-1)?.kind === 'break_start',
        days: days.map((d) => ({ on: dateOf(d.workOn), status: d.status, leavePart: d.leavePart, firstIn: d.firstIn, lastOut: d.lastOut, workedMinutes: d.workedMinutes, lateMinutes: d.lateMinutes, regularised: d.regularised })),
        requests: requests.map((r) => ({ id: r.id, on: dateOf(r.workOn), kind: r.kind, inMinute: r.inMinute, outMinute: r.outMinute, reason: r.reason, status: r.status })),
        regularise: { limit, used },
        // Work from home (TIM-07): this month's days asked for or approved, and whether today is an approved one.
        wfh: { limit: Number(await settingOn(tx, c, 'attendance.wfh_monthly_limit', f, today)), used: wfhUsed },
        wfhToday: requests.some((r) => r.kind === 'wfh' && r.status === 'approved' && dateOf(r.workOn) === today),
      };
    });
  }

  /** Web punch (YX-AT-01 / 23 / Q6): accepted or refused, always recorded; duplicates within a minute are ignored. */
  async punch(ctx: TenantContext, user: ScopeUser, dto: PunchDto, ip: string | null, device: string | null) {
    if (user.impersonatorUserId || user.actingSuperAdmin) throw new ForbiddenException('Not available while acting for someone else.');
    const pinGiven = dto.lat !== undefined && dto.lng !== undefined;
    if ((dto.lat === undefined) !== (dto.lng === undefined)) throw new BadRequestException('Send both latitude and longitude, or neither.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const { f } = await this.meFacts(tx, c);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`punch:${org}:${f.employeeId}`}))`;
      const now = new Date();
      const today = todayIn(f.zone, now);
      const rule = (await rulesFor(tx, org, f.locationId, today))(today);
      // A night shift's morning punch belongs to the day the shift started (YX-AT-13).
      const book = await ScheduleBook.load(tx, org);
      await book.prime([f.employeeId], addDays(today, -1), today);
      const shifts = new Map<string, Awaited<ReturnType<ScheduleBook['day']>>['shift']>();
      for (const d of [addDays(today, -1), today]) shifts.set(d, (await book.day(f, d)).shift);
      const last = await tx.punch.findFirst({ where: { organizationId: org, employeeId: f.employeeId, accepted: true }, orderBy: { punchedAt: 'desc' } });
      if (last && last.kind === dto.kind && now.getTime() - last.punchedAt.getTime() < 60_000) return { accepted: true, duplicate: true, kind: dto.kind, at: last.punchedAt, verdict: last.verdict, message: ALREADY[dto.kind], distanceM: last.distanceM };
      // A break belongs to the day a check-out now would close (a break across midnight stays on the night shift's
      // day). It starts while working that day and ends while on it.
      const workOn = workOnForPunch(now, f.zone, dto.kind === 'in' ? 'in' : 'out', (d) => shifts.get(d) ?? null);
      const state = last && dateOf(last.workOn) === workOn ? last.kind : null;
      if (dto.kind === 'break_start' && state !== 'in' && state !== 'break_end') throw new ConflictException(state === 'break_start' ? 'You are already on a break.' : 'Check in before you start a break.');
      if (dto.kind === 'break_end' && state !== 'break_start') throw new ConflictException('You are not on a break.');
      // An approved work-from-home day: the punch records where the person is and is never refused for the place.
      const wfh = Boolean(await tx.attendanceRequest.findFirst({ where: { organizationId: org, employeeId: f.employeeId, workOn: asDate(workOn), kind: 'wfh', status: 'approved' }, select: { id: true } }));
      const v = checkInVerdict({ fences: await this.fences(tx, org, [f.locationId, ...rule.alsoAllowed]), pin: pinGiven ? { lat: dto.lat!, lng: dto.lng!, accuracyM: dto.accuracyM ?? 9999 } : null, ip, mode: wfh ? 'field' : rule.checkIn });
      if (wfh && v.verdict === 'field') v.message = 'Working from home today, location recorded';
      await tx.punch.create({
        data: {
          organizationId: org,
          employeeId: f.employeeId,
          punchedAt: now,
          workOn: asDate(workOn),
          kind: dto.kind,
          source: 'web',
          accepted: v.accepted,
          refusal: v.accepted ? null : v.message,
          lat: pinGiven ? dto.lat : null,
          lng: pinGiven ? dto.lng : null,
          accuracyM: dto.accuracyM === undefined ? null : Math.round(dto.accuracyM),
          distanceM: v.distanceM,
          verdict: v.verdict,
          locationId: v.locationId,
          ip: ip?.slice(0, 45) ?? null,
          device: device?.slice(0, 200) ?? null,
        },
      });
      if (v.accepted) await this.days.evaluate(tx, c, f.employeeId, workOn, workOn, now);
      return { accepted: v.accepted, duplicate: false, kind: dto.kind, at: now, verdict: v.verdict, message: v.accepted ? `${DONE[dto.kind]}. ${v.message}` : v.message, distanceM: v.distanceM };
    });
  }

  /** A fix for a day (M02 §B4, Q5), through P03: the manager, and HR too beyond the monthly limit. */
  async regularise(ctx: TenantContext, user: ScopeUser, dto: RegulariseDto) {
    if (user.impersonatorUserId || user.actingSuperAdmin) throw new ForbiddenException('Not available while acting for someone else.');
    const notices: Notice[] = [];
    const res = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const { f: now, today } = await this.meFacts(tx, c);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`punch:${org}:${now.employeeId}`}))`;
      if (dto.on > today) throw new BadRequestException('You can fix a day once it has started.');
      // Q5 look-back: any day of a period still open (P08); a locked month takes an HR correction (YX-LOCK-02).
      await assertOpen(tx, org, now.employeeId, dto.on);
      const f = await factsOn(tx, org, now.employeeId, dto.on);
      if (!f || dto.on < f.joinedOn) throw new BadRequestException('You were not working here on that day.');
      const needIn = dto.kind === 'missed_in' || dto.kind === 'wrong_time';
      const needOut = dto.kind === 'missed_out' || dto.kind === 'wrong_time';
      if (needIn && dto.inMinute === undefined) throw new BadRequestException('Give the time you started.');
      if (needOut && dto.outMinute === undefined) throw new BadRequestException('Give the time you finished.');
      if (dto.kind === 'wrong_time' && dto.outMinute! <= dto.inMinute!) throw new BadRequestException('The finish time is before the start time.');
      if (await tx.attendanceRequest.findFirst({ where: { organizationId: org, employeeId: f.employeeId, workOn: asDate(dto.on), kind: { not: 'wfh' }, status: 'pending' } })) throw new ConflictException('A fix for that day is already waiting for approval.');
      const limit = Number(await settingOn(tx, c, 'attendance.regularise_monthly_limit', f, dto.on));
      const used = await tx.attendanceRequest.count({ where: { organizationId: org, employeeId: f.employeeId, kind: { not: 'wfh' }, status: { in: ['pending', 'approved'] }, workOn: { gte: asDate(monthRange(dto.on.slice(0, 7)).from), lte: asDate(monthRange(dto.on.slice(0, 7)).to) } } });
      const r = await tx.attendanceRequest.create({
        data: { organizationId: org, employeeId: f.employeeId, workOn: asDate(dto.on), kind: dto.kind, inMinute: needIn ? dto.inMinute! : null, outMinute: needOut ? dto.outMinute! : null, reason: dto.reason, raisedBy: c.userId ?? null },
      });
      const hr = await hrApprovers(tx, org, f.employeeId, today, f.userId);
      const steps: StepSpec[] = [{ name: 'Manager', approvers: [{ kind: 'manager' }], mode: 'any', remindAfterHours: 24 }];
      if (used >= limit) steps.push({ name: 'HR', approvers: [{ kind: 'users', userIds: hr }], mode: 'any', remindAfterHours: 24 });
      const fix = dto.kind === 'full_day' ? 'Present all day' : [needIn ? `in ${hhmm(dto.inMinute!)}` : '', needOut ? `out ${hhmm(dto.outMinute!)}` : ''].filter(Boolean).join(', ');
      const sub = await this.engine.submit(tx, c, {
        type: REGULARISE,
        subjectType: 'attendance_request',
        subjectId: r.id,
        title: `${f.name}: fix ${fmt(dto.on)} (${KIND_TEXT[dto.kind].toLowerCase()})`,
        summary: [
          { label: 'Day', value: fmt(dto.on) },
          { label: 'Fix', value: `${KIND_TEXT[dto.kind]}: ${fix}` },
          { label: 'Fixes this month', value: `${used + 1} of ${limit} without HR` },
          { label: 'Why', value: dto.reason.slice(0, 300) },
        ],
        subjectPersonId: f.personId,
        requesterUserId: c.userId ?? null,
        raisedByUserId: c.userId ?? null,
        steps,
        payload: {},
        payloadFields: [],
        fallbackUserIds: hr,
      });
      notices.push(...sub.notices);
      await tx.attendanceRequest.update({ where: { id: r.id }, data: { wfRequestId: sub.id } });
      await audit(tx, c, 'attendance.fix.submitted', 'attendance_request', r.id, { employeeId: f.employeeId, on: dto.on, kind: dto.kind, hrStep: used >= limit });
      return { id: r.id, status: (await tx.attendanceRequest.findFirstOrThrow({ where: { id: r.id } })).status, hrStep: used >= limit };
    });
    await this.engine.send(ctx, notices);
    return res;
  }

  /**
   * Work from home on one day (TIM-07, 19 Oct 2026), through P03: the manager, and HR too beyond the monthly limit
   * (attendance.wfh_monthly_limit). Today or a later working day: never a weekly off or a holiday, one request a day.
   * Approved, the day counts as present and web check-in records where the person is (never refused for the place).
   */
  async requestWfh(ctx: TenantContext, user: ScopeUser, dto: WfhDto) {
    if (user.impersonatorUserId || user.actingSuperAdmin) throw new ForbiddenException('Not available while acting for someone else.');
    const notices: Notice[] = [];
    const res = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const { f: now, today } = await this.meFacts(tx, c);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`punch:${org}:${now.employeeId}`}))`;
      if (dto.on < today) throw new BadRequestException('Pick today or a later date.');
      const f = await factsOn(tx, org, now.employeeId, dto.on);
      if (!f || dto.on < f.joinedOn || (f.exitedOn && dto.on > f.exitedOn)) throw new BadRequestException('You are not working here on that day.');
      if ((await (await ScheduleBook.load(tx, org)).day(f, dto.on)).weeklyOff) throw new BadRequestException(`${fmt(dto.on)} is your weekly off.`);
      const holiday = (await holidaysFor(tx, org, f.locationId, dto.on, dto.on, f.employeeId)).map.get(dto.on);
      if (holiday && !holiday.halfDay) throw new BadRequestException(`${fmt(dto.on)} is a holiday (${holiday.name}).`);
      if (await tx.attendanceRequest.findFirst({ where: { organizationId: org, employeeId: f.employeeId, workOn: asDate(dto.on), kind: 'wfh', status: { in: ['pending', 'approved'] } } })) throw new ConflictException('You have already asked to work from home on that day.');
      const limit = Number(await settingOn(tx, c, 'attendance.wfh_monthly_limit', f, dto.on));
      const month = monthRange(dto.on.slice(0, 7));
      const used = await tx.attendanceRequest.count({ where: { organizationId: org, employeeId: f.employeeId, kind: 'wfh', status: { in: ['pending', 'approved'] }, workOn: { gte: asDate(month.from), lte: asDate(month.to) } } });
      const r = await tx.attendanceRequest.create({ data: { organizationId: org, employeeId: f.employeeId, workOn: asDate(dto.on), kind: 'wfh', reason: dto.reason, raisedBy: c.userId ?? null } });
      const hr = await hrApprovers(tx, org, f.employeeId, today, f.userId);
      const steps: StepSpec[] = [{ name: 'Manager', approvers: [{ kind: 'manager' }], mode: 'any', remindAfterHours: 24 }];
      if (used >= limit) steps.push({ name: 'HR', approvers: [{ kind: 'users', userIds: hr }], mode: 'any', remindAfterHours: 24 });
      const sub = await this.engine.submit(tx, c, {
        type: WFH,
        subjectType: 'attendance_request',
        subjectId: r.id,
        title: `${f.name}: work from home on ${fmt(dto.on)}`,
        summary: [
          { label: 'Day', value: fmt(dto.on) },
          { label: 'Work from home this month', value: `Day ${used + 1} of ${limit} without HR` },
          { label: 'Why', value: dto.reason.slice(0, 300) },
        ],
        subjectPersonId: f.personId,
        requesterUserId: c.userId ?? null,
        raisedByUserId: c.userId ?? null,
        steps,
        payload: {},
        payloadFields: [],
        fallbackUserIds: hr,
      });
      notices.push(...sub.notices);
      await tx.attendanceRequest.update({ where: { id: r.id }, data: { wfRequestId: sub.id } });
      await audit(tx, c, 'attendance.wfh.submitted', 'attendance_request', r.id, { employeeId: f.employeeId, on: dto.on, hrStep: used >= limit });
      return { id: r.id, status: (await tx.attendanceRequest.findFirstOrThrow({ where: { id: r.id } })).status, hrStep: used >= limit };
    });
    await this.engine.send(ctx, notices);
    return res;
  }

  async withdraw(ctx: TenantContext, user: ScopeUser, id: string) {
    if (user.impersonatorUserId || user.actingSuperAdmin) throw new ForbiddenException('Not available while acting for someone else.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const mine = await myEmployeeId(tx, c.organizationId, c.userId);
      const r = await tx.attendanceRequest.findFirst({ where: { organizationId: c.organizationId, id, employeeId: mine } });
      if (!r) throw new NotFoundException('No such request.');
      if (r.status !== 'pending') throw new ConflictException('Only a request still waiting for approval can be withdrawn.');
      if (r.wfRequestId) await this.engine.withdraw(tx, c, r.wfRequestId, c.userId ?? null, 'Withdrawn by the employee');
      await tx.attendanceRequest.update({ where: { id: r.id }, data: { status: 'withdrawn', decidedAt: new Date(), version: { increment: 1 }, updatedAt: new Date() } });
      return { id: r.id, status: 'withdrawn' };
    });
  }

  private async decided(tx: Tx, wf: Prisma.WfRequestGetPayload<object>, outcome: 'approved' | 'rejected') {
    const r = await tx.attendanceRequest.findFirst({ where: { organizationId: wf.organizationId, id: wf.subjectId } });
    if (!r || r.status !== 'pending') return;
    await tx.attendanceRequest.update({ where: { id: r.id }, data: { status: outcome, decidedAt: new Date(), version: { increment: 1 }, updatedAt: new Date() } });
    if (outcome === 'approved') {
      const on = dateOf(r.workOn);
      await this.days.evaluate(tx, { organizationId: wf.organizationId, isSuperAdmin: false }, r.employeeId, on, on);
    }
  }

  /**
   * Nudge (PLT-02 Team today): a manager or HR reminds someone who has not checked in today. Only for a person the
   * nudger sees on the muster (their team, or the attendance.view grant), never themselves, and only while it is still
   * waiting (a working day with no check-in yet). One nudge per item per person per day, whoever sends it. An in-app
   * notification naming the item, and an email when the person's notification preferences allow it.
   */
  async nudge(ctx: TenantContext, user: ScopeUser, employeeId: string) {
    if (user.impersonatorUserId || user.actingSuperAdmin) throw new ForbiddenException('Not available while acting for someone else.');
    const v = await this.viewer(user);
    const out = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const own = v.userId && !v.actingForOther ? ((await tx.employee.findFirst({ where: { organizationId: org, userId: v.userId }, select: { id: true } }))?.id ?? null) : null;
      const zoneOf = await factsOn(tx, org, employeeId, new Date().toISOString().slice(0, 10));
      if (!zoneOf) throw new NotFoundException('Not found');
      const today = todayIn(zoneOf.zone);
      if ((await mustSee(tx, c, v, own, 'attendance.view', employeeId, today)) === 'self') throw new BadRequestException('You cannot remind yourself.');
      const f = (await factsOn(tx, org, employeeId, today)) ?? zoneOf;
      if (!f.userId) throw new ConflictException(`${f.name} has no sign-in to remind.`);
      const day = await tx.attendanceDay.findUnique({ where: { organizationId_employeeId_workOn: { organizationId: org, employeeId, workOn: asDate(today) } } });
      if (day && ['leave', 'holiday', 'weekly_off'].includes(day.status)) throw new ConflictException(`${f.name} is not working today.`);
      if (await tx.punch.findFirst({ where: { organizationId: org, employeeId, workOn: asDate(today), kind: 'in', accepted: true }, select: { id: true } })) throw new ConflictException(`${f.name} has already checked in today.`);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`nudge:${org}:${employeeId}:${today}`}))`;
      if (await tx.nudge.findFirst({ where: { organizationId: org, employeeId, item: 'check_in', onDay: asDate(today) }, select: { id: true } })) throw new ConflictException(`${f.name} was already reminded today. You can remind them again tomorrow.`);
      const row = await tx.nudge.create({ data: { organizationId: org, employeeId, item: 'check_in', onDay: asDate(today), sentBy: c.userId! } });
      await audit(tx, c, 'attendance.nudge.sent', 'employee', employeeId, { item: 'check_in', on: today });
      const sender = (await tx.user.findFirst({ where: { organizationId: org, id: c.userId! }, select: { name: true } }))?.name || 'Your manager';
      return { id: row.id, userId: f.userId, name: f.name, sender, today };
    });
    const text = `${out.sender} reminded you to check in today (${fmt(out.today)}).`;
    await this.notifications.notifySystem(
      ctx,
      [out.userId],
      'nudge.reminder',
      { entityType: 'nudge', entityId: out.id, contextText: text, linkPath: '/yx/time/attendance' },
      { subject: 'Reminder: check in today', html: `<p>${escapeHtml(text)}</p><p>Open YukthiX to check in.</p>` },
    );
    return { sent: true, to: out.name, item: 'check_in', on: out.today };
  }

  // ------------------------------------------------------------------------------------------ the muster (TIM-02)

  /** Days of everyone the viewer may see (YX-AT-14: team for a manager, attendance.view scope for HR), read-only. */
  /**
   * Home (PLT-02 "Attendance exceptions"): days in `month` with a missing punch or timesheet among the people the
   * explicit attendance.view grant reaches (a manager's own team stays on the muster). Null without the key.
   */
  async exceptionCount(ctx: TenantContext, user: ScopeUser, month: string, entityId?: string | null): Promise<number | null> {
    const v = await this.viewer(user);
    if (!has(v, 'attendance.view') || (v.actingForOther && !tenantWide(v, 'attendance.view'))) return null;
    const { from, to } = monthRange(month);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const own = v.userId && !v.actingForOther ? ((await tx.employee.findFirst({ where: { organizationId: c.organizationId, userId: v.userId }, select: { id: true } }))?.id ?? null) : null;
      return countExceptions(tx, c, from, to, entityId, inScopeSql(c, v, 'attendance.view', Prisma.sql`d.employee_id`, Prisma.sql`d.work_on`, own));
    });
  }

  /** The whole company's (or one entity's) exceptions in a month, for the monthly Home snapshot (no viewer). */
  exceptionTotal(tx: Tx, c: CompanyContext, month: string, entityId: string | null): Promise<number> {
    const { from, to } = monthRange(month);
    return countExceptions(tx, c, from, to, entityId, Prisma.sql`TRUE`);
  }

  async muster(ctx: TenantContext, user: ScopeUser, month: string, entityId?: string | null) {
    const { from, to } = monthRange(month);
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const own = v.userId && !v.actingForOther ? ((await tx.employee.findFirst({ where: { organizationId: c.organizationId, userId: v.userId }, select: { id: true } }))?.id ?? null) : null;
      const people = await tx.$queryRaw<{ id: string; name: string; code: string | null; location: string }[]>`
        SELECT e.id::text, concat_ws(' ', coalesce(e.preferred_name, e.given_name), e.family_name) AS name, m.employee_code::text AS code, l.name::text AS location
        FROM employees e
        JOIN employee_assignments a ON a.organization_id = e.organization_id AND a.employee_id = e.id AND a.superseded_at IS NULL AND ${to}::date <@ daterange(a.valid_from, a.valid_to, '[]')
        JOIN employments m ON m.organization_id = e.organization_id AND m.id = a.employment_id AND (m.exited_on IS NULL OR m.exited_on >= ${from}::date)
        JOIN locations l ON l.organization_id = e.organization_id AND l.id = a.location_id
        WHERE e.organization_id = ${c.organizationId}::uuid AND ${await visibleSql(tx, c, v, own, 'attendance.view', Prisma.sql`e.id`, to)}
          AND ${inEntitySql(c, entityId, Prisma.sql`e.id`, Prisma.sql`${from}::date`, Prisma.sql`${to}::date`)}
        ORDER BY 2 LIMIT 300`;
      const ids = people.map((p) => p.id);
      const days = ids.length ? await tx.attendanceDay.findMany({ where: { organizationId: c.organizationId, employeeId: { in: ids }, workOn: { gte: asDate(from), lte: asDate(to) } } }) : [];
      // Nudge (PLT-02): the days each person was already reminded, so Home shows "Reminded" after a reload too.
      const nudges = ids.length ? await tx.nudge.findMany({ where: { organizationId: c.organizationId, employeeId: { in: ids }, item: 'check_in', onDay: { gte: asDate(from), lte: asDate(to) } }, select: { employeeId: true, onDay: true } }) : [];
      const modes = new Map<string, { mode: string; effect: string }>();
      for (const id of ids) {
        const f = await factsOn(tx, c.organizationId, id, to);
        if (f) modes.set(id, { mode: await settingOn(tx, c, 'attendance.mode', f, to), effect: await settingOn(tx, c, 'attendance.missing_punch_effect', f, to) });
      }
      return {
        month,
        from,
        to,
        scope: tenantWide(v, 'attendance.view') ? 'company' : has(v, 'attendance.view') ? 'granted' : 'team',
        people: people.map((p) => ({
          id: p.id,
          name: p.name,
          code: p.code,
          location: p.location,
          me: p.id === own,
          mode: modes.get(p.id)?.mode ?? 'punch',
          missingPunchEffect: modes.get(p.id)?.effect ?? 'block_payroll_approval',
          remindedOn: nudges.filter((n) => n.employeeId === p.id).map((n) => dateOf(n.onDay)),
          days: days.filter((d) => d.employeeId === p.id).map((d) => ({ on: dateOf(d.workOn), status: d.status, leavePart: d.leavePart, firstIn: d.firstIn, lateMinutes: d.lateMinutes, workedMinutes: d.workedMinutes, regularised: d.regularised })),
        })),
      };
    });
  }

  /**
   * PPL-03 Time tab: one person's month as the muster shows it (same scope: the person, their managers, attendance.view
   * in scope): present days, late marks, missing punches with their regularisation, and the shift pattern this week.
   */
  async personMonth(ctx: TenantContext, user: ScopeUser, employeeId: string, month: string) {
    const { from, to } = monthRange(month);
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const own = v.userId && !v.actingForOther ? ((await tx.employee.findFirst({ where: { organizationId: org, userId: v.userId }, select: { id: true } }))?.id ?? null) : null;
      await mustSee(tx, c, v, own, 'attendance.view', employeeId, to);
      const f = (await factsOn(tx, org, employeeId, to)) ?? (await factsOn(tx, org, employeeId, from));
      if (!f) throw new NotFoundException('Not found');
      const today = todayIn(f.zone);
      const days = await tx.attendanceDay.findMany({ where: { organizationId: org, employeeId, workOn: { gte: asDate(from), lte: asDate(to < today ? to : today) } }, orderBy: { workOn: 'asc' } });
      const fixes = await tx.attendanceRequest.findMany({ where: { organizationId: org, employeeId, workOn: { gte: asDate(from), lte: asDate(to) }, status: { in: ['pending', 'approved', 'rejected'] } }, orderBy: { createdAt: 'desc' } });
      const missing = days.filter((d) => d.status === 'missing_in' || d.status === 'missing_out' || d.regularised);
      const on = to < today ? to : today;
      const book = await ScheduleBook.load(tx, org);
      const p = book.patternOn(f, on);
      const monday = addDays(on, -((new Date(`${on}T00:00:00Z`).getUTCDay() + 6) % 7));
      const day = await book.day(f, on);
      return {
        month,
        present: days.reduce((n, d) => n + (d.status === 'present' ? 1 : d.status === 'half_day' ? 0.5 : 0), 0),
        late: days.filter((d) => (d.lateMinutes ?? 0) > 0).map((d) => dateOf(d.workOn)),
        missing: missing.map((d) => {
          const fix = fixes.find((r) => dateOf(r.workOn) === dateOf(d.workOn));
          return { on: dateOf(d.workOn), regularisation: d.regularised ? 'approved' : (fix?.status ?? null) };
        }),
        shift: { pattern: p ? book.patternName(p.patternId) : null, weekOf: monday, name: day.shift?.name ?? null, start: day.shift?.shiftStart ?? null, end: day.shift?.shiftEnd ?? null },
      };
    });
  }

  /** A day card (TIM-03, YX-AT-15): punches with source, distance and verdict, to viewers in scope. */
  async dayCard(ctx: TenantContext, user: ScopeUser, employeeId: string, on: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const own = v.userId && !v.actingForOther ? ((await tx.employee.findFirst({ where: { organizationId: c.organizationId, userId: v.userId }, select: { id: true } }))?.id ?? null) : null;
      await mustSee(tx, c, v, own, 'attendance.view', employeeId, on);
      const f = await factsOn(tx, c.organizationId, employeeId, on);
      if (!f) throw new NotFoundException('Not found');
      const punches = await tx.punch.findMany({ where: { organizationId: c.organizationId, employeeId, workOn: asDate(on) }, orderBy: { punchedAt: 'asc' } });
      const names = new Map((await tx.location.findMany({ where: { organizationId: c.organizationId, id: { in: punches.map((p) => p.locationId).filter((x): x is string => Boolean(x)) } }, select: { id: true, name: true } })).map((l) => [l.id, l.name]));
      const day = await tx.attendanceDay.findUnique({ where: { organizationId_employeeId_workOn: { organizationId: c.organizationId, employeeId, workOn: asDate(on) } } });
      return {
        person: { name: f.name, code: f.code },
        on,
        zone: f.zone,
        day: day ? { status: day.status, leavePart: day.leavePart, workedMinutes: day.workedMinutes, lateMinutes: day.lateMinutes, regularised: day.regularised } : null,
        // The raw network address is not shown (it identifies a home connection); the verdict says enough.
        punches: punches.map((p) => ({ ...this.punchView(p, names), minute: minutesInto(on, f.zone, p.punchedAt) })),
      };
    });
  }

  // ------------------------------------------------------------------------------------------ the job

  /** Hourly: yesterday and today for everyone employed (the day engine also runs whenever an input changes). */
  async evaluateCompany(org: string, now = new Date()): Promise<number> {
    const c: CompanyContext = { organizationId: org, isSuperAdmin: false };
    return this.tenantPrisma.forTenant(c, async (tx) => {
      const today = now.toISOString().slice(0, 10);
      const ids = await tx.$queryRaw<{ id: string }[]>`
        SELECT DISTINCT a.employee_id::text AS id FROM employee_assignments a JOIN employments m ON m.organization_id = a.organization_id AND m.id = a.employment_id
        WHERE a.organization_id = ${org}::uuid AND a.superseded_at IS NULL AND m.exited_on IS NULL
          AND daterange(a.valid_from, a.valid_to, '[]') && daterange(${addDays(today, -1)}::date, ${addDays(today, 1)}::date, '[]')`;
      let n = 0;
      const book = await ScheduleBook.load(tx, org);
      for (const e of ids) n += await this.days.evaluate(tx, c, e.id, addDays(today, -1), addDays(today, 1), now, book);
      return n;
    });
  }
}

async function countExceptions(tx: Tx, c: CompanyContext, from: string, to: string, entityId: string | null | undefined, inScope: Prisma.Sql): Promise<number> {
  const [r] = await tx.$queryRaw<{ n: number }[]>`
    SELECT count(*)::int AS n FROM attendance_days d
    WHERE d.organization_id = ${c.organizationId}::uuid AND d.work_on BETWEEN ${from}::date AND ${to}::date AND d.status IN ('missing_in', 'missing_out', 'no_timesheet')
      AND ${inScope}
      AND ${inEntitySql(c, entityId, Prisma.sql`d.employee_id`, Prisma.sql`d.work_on`)}`;
  return r?.n ?? 0;
}
