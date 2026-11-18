import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { CompanyContext, Tx, audit, inCompany } from '../org-structure/org-structure.service';
import { Viewer, buildViewer, inEntitySql, inScopeSql, tenantWide, has, type ScopeUser } from '../access/scope';
import { ApprovalsEngine, Notice, StepSpec } from '../workflow/approvals-engine.service';
import { NotificationsService } from '../notifications/notifications.service';
import { escapeHtml } from '../notifications/notification-email-render';
import { DayEngine } from './day-engine.service';
import { OnDutyDto, PermissionDto, PunchDto, RegulariseDto, WfhDto } from './dto';
import { clockText, minutesText, onDutyProblem, overlaps, permissionProblem } from './on-duty-rules';
import { TIME_KEYS, asDate, dateOf, factsOn, holdersOf, holidaysFor, hrApprovers, leaveDays, monthRange, mustSee, myEmployeeId, rulesFor, settingOn, todayIn, visibleSql, type Facts } from './time-core';
import { teamTodayState } from './team-today';
import { addDays, checkInVerdict, fencesOf, ipInRanges, minutesInto, type Fence } from './time-maths';
import { ScheduleBook, assertOpen, lockedDates } from './schedule';
import { OvertimeService } from './overtime.service';
import { PeriodsService } from './periods.service';
import { grantCovers, inReportingLine } from './time-core';
import { todayIst } from '../org-structure/org-validation';
import { settingFor } from '../people/probation';
import { dayPlace, placeOf, workOnForPunch, type DayPlaceRule, type WorkPlace } from './time-rules';
import { describeDevice } from '../email/account-emails';

// M02 Part B basics: web punches with the geofence / allowed-network check (Q6, YX-AT-01, every refused attempt
// logged, YX-AT-23), my days and the team / HR muster (YX-AT-14, read-only in batch 1), and regularisation through
// P03 with the monthly limit (Q5: beyond it HR approves too).

export const REGULARISE = 'attendance.regularise';
export const WFH = 'attendance.wfh';
export const ON_DUTY = 'attendance.on_duty';
export const PERMISSION = 'attendance.permission';
/** Requests that are not a fix of the day: they never count towards, or block, regularisation. */
const NOT_FIX = ['wfh', 'on_duty', 'permission'];
const KIND_TEXT: Record<string, string> = { missed_in: 'Missed check-in', missed_out: 'Missed check-out', wrong_time: 'Wrong time', full_day: 'Present all day' };
const ALREADY: Record<PunchDto['kind'], string> = { in: 'Already checked in', out: 'Already checked out', break_start: 'Break already started', break_end: 'Break already ended' };
const DONE: Record<PunchDto['kind'], string> = { in: 'Checked in', out: 'Checked out', break_start: 'Break started', break_end: 'Break ended' };
const hhmm = (m: number | null) => (m === null ? '' : `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
const clock = (m: number) => {
  const x = ((m % 1440) + 1440) % 1440;
  const h = Math.floor(x / 60);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(x % 60).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
};
/** Is this computer on one of the person's office networks (before any punch)? See me(). */
export function networkOf(fences: Fence[], ip: string | null, checkIn: string): 'inside' | 'outside' | 'unknown' {
  if (checkIn === 'field' || !fences.some((x) => x.ipRanges.length)) return 'unknown';
  if (fences.some((x) => ipInRanges(ip, x.ipRanges))) return 'inside';
  return fences.some((x) => x.lat !== null && x.lng !== null && x.radiusM) ? 'unknown' : 'outside';
}
const fmt = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

@Injectable()
export class AttendanceService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly engine: ApprovalsEngine,
    private readonly days: DayEngine,
    private readonly notifications: NotificationsService,
    private readonly overtime: OvertimeService,
    private readonly periods: PeriodsService,
  ) {}

  onModuleInit() {
    this.engine.register({ key: REGULARISE, label: 'Attendance fix', risk: 'normal', quickApprove: true, autoActions: false, onDecided: (tx, req, outcome) => this.decided(tx, req, outcome), requesterLink: () => '/yx/time/attendance' });
    this.engine.register({ key: WFH, label: 'Work from home', risk: 'normal', quickApprove: true, autoActions: false, onDecided: (tx, req, outcome) => this.decided(tx, req, outcome), requesterLink: () => '/yx/time/attendance' });
    this.engine.register({ key: PERMISSION, label: 'Hourly permission', risk: 'normal', quickApprove: true, autoActions: false, onDecided: (tx, req, outcome) => this.decided(tx, req, outcome), requesterLink: () => '/yx/time/attendance' });
    this.engine.register({
      key: ON_DUTY,
      label: 'On duty',
      risk: 'normal',
      quickApprove: true,
      autoActions: false,
      onDecided: (tx, req, outcome) => this.decided(tx, req, outcome),
      requesterLink: () => '/yx/time/attendance',
      sendBack: { allowed: (tx, req) => this.onDutySendBackAllowed(tx, req), apply: (tx, req, reason) => this.onDutySentBack(tx, req, reason) },
    });
  }

  private viewer(user: ScopeUser): Promise<Viewer> {
    return buildViewer(this.prisma, this.tenantPrisma, user, [...TIME_KEYS]);
  }

  private async meFacts(tx: Tx, c: CompanyContext): Promise<{ f: Facts; today: string }> {
    const id = await myEmployeeId(tx, c.organizationId, c.userId);
    const f = await factsOn(tx, c.organizationId, id, new Date().toISOString().slice(0, 10));
    if (!f) throw new NotFoundException({ statusCode: 404, code: 'NO_EMPLOYEE_RECORD', message: 'You have no job assignment today. Ask HR to check your record.' });
    const today = todayIn(f.zone);
    return { f: (await factsOn(tx, c.organizationId, id, today)) ?? f, today };
  }

  private async fences(tx: Tx, org: string, ids: string[]): Promise<Fence[]> {
    const rows = await tx.location.findMany({ where: { organizationId: org, id: { in: ids }, archivedAt: null } });
    return rows.flatMap(fencesOf);
  }

  /**
   * Extra · today DeviceNotApproved: with attendance.web_device_approval on, web clock-in only from a computer HR
   * approved for the person. `hash` is the SHA-256 of the sign-in device cookie (yx_device); the raw value is never kept.
   */
  private async webDevice(tx: Tx, c: CompanyContext, f: Facts, today: string, hash: string | null) {
    if ((await settingOn(tx, c, 'attendance.web_device_approval', f, today)) !== 'on') return { required: false, approved: true, requested: false, id: null as string | null };
    const rows = hash ? await tx.timeDevice.findMany({ where: { organizationId: c.organizationId, kind: 'web', employeeId: f.employeeId, installHash: hash, status: { in: ['active', 'pending'] } } }) : [];
    const active = rows.find((d) => d.status === 'active');
    return { required: true, approved: Boolean(active), requested: rows.some((d) => d.status === 'pending'), id: active?.id ?? null };
  }

  /** "Ask HR to approve" this computer (DeviceNotApproved). Asking again for the same computer answers the same request. */
  async requestWebDevice(ctx: TenantContext, user: ScopeUser, hash: string, userAgent: string | null) {
    if (user.impersonatorUserId || user.actingSuperAdmin) throw new ForbiddenException('Not available while acting for someone else.');
    const out = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const { f, today } = await this.meFacts(tx, c);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`device:${org}:${f.employeeId}`}))`;
      if ((await settingOn(tx, c, 'attendance.web_device_approval', f, today)) !== 'on') throw new ConflictException('Your company lets you clock in from any computer. There is nothing to approve.');
      const mine = await tx.timeDevice.findMany({ where: { organizationId: org, kind: 'web', employeeId: f.employeeId, status: { in: ['active', 'pending'] } } });
      if (mine.some((d) => d.status === 'active' && d.installHash === hash)) throw new ConflictException('This computer is already approved for clock-in.');
      const same = mine.find((d) => d.status === 'pending' && d.installHash === hash);
      // A repeat of the same request tells no one again.
      if (same) return { id: same.id, status: 'pending', tell: null };
      if (mine.some((d) => d.status === 'pending')) throw new ConflictException('You already asked HR to approve another computer. Wait for HR to decide that one first.');
      const model = (describeDevice(userAgent) ?? 'Web browser').slice(0, 100);
      const d = await tx.timeDevice.create({ data: { organizationId: org, kind: 'web', employeeId: f.employeeId, model, installHash: hash, status: 'pending', createdBy: c.userId ?? null } });
      await audit(tx, c, 'time.web_device.requested', 'time_device', d.id, { employeeId: f.employeeId, model });
      // Founder answer 4: HR admins (company set-up holders who reach the person; else the company admins) hear of it,
      // never the person asking.
      const others = (ids: string[]) => ids.filter((x) => x !== c.userId);
      let hr = others(await holdersOf(tx, org, 'leave.settings.manage', f.employeeId, today));
      if (!hr.length) hr = others((await tx.user.findMany({ where: { organizationId: org, role: 'org_admin', status: 'active' }, select: { id: true }, take: 25 })).map((u) => u.id));
      return { id: d.id, status: 'pending', tell: { to: hr, name: f.name, model } };
    });
    if (out.tell?.to.length) {
      const text = `${out.tell.name} asked to clock in on the web from a new computer (${out.tell.model}).`;
      await this.notifications.notifySystem(
        ctx,
        out.tell.to,
        'time.web_device.requested',
        { entityType: 'time_device', entityId: out.id, contextText: text, linkPath: '/yx/time/setup/devices' },
        { subject: 'A computer is waiting for approval', html: `<p>${escapeHtml(text)}</p><p>Open Time › Devices and kiosks › New device requests to approve or reject it.</p>` },
        user.userId ?? null,
      );
    }
    return { id: out.id, status: out.status };
  }

  private punchView(p: Prisma.PunchGetPayload<object>, names: Map<string, string>) {
    return { id: p.id, kind: p.kind, at: p.punchedAt, source: p.source, accepted: p.accepted, refusal: p.refusal, verdict: p.verdict, distanceM: p.distanceM, accuracyM: p.accuracyM, note: p.note, where: p.locationId ? (names.get(p.locationId) ?? null) : null, place: this.placeOfRow(p) };
  }

  /** A9: the place stored at punch time; punches from before it was stored are worked out the same way from their verdict. */
  private placeOfRow(p: Pick<Prisma.PunchGetPayload<object>, 'workPlace' | 'source' | 'verdict' | 'accepted'>): WorkPlace {
    return (p.workPlace as WorkPlace | null) ?? placeOf(p);
  }

  /** A9 (answer 2312): each day's office / remote / unknown from its accepted punches, by the company's rule for mixed days. */
  private async dayPlaces(tx: Tx, c: CompanyContext, f: Facts, from: string, to: string): Promise<Map<string, WorkPlace>> {
    const rule = (await settingOn(tx, c, 'attendance.day_place_rule', f, to)) as DayPlaceRule;
    const rows = await tx.punch.findMany({ where: { organizationId: c.organizationId, employeeId: f.employeeId, accepted: true, workOn: { gte: asDate(from), lte: asDate(to) } }, orderBy: { punchedAt: 'asc' }, select: { workOn: true, workPlace: true, source: true, verdict: true, accepted: true } });
    const by = new Map<string, WorkPlace[]>();
    for (const r of rows) by.set(dateOf(r.workOn), [...(by.get(dateOf(r.workOn)) ?? []), this.placeOfRow(r)]);
    return new Map([...by].map(([on, list]) => [on, dayPlace(list, rule)]));
  }

  /**
   * Me › Attendance: today's shift, the allowed places, my punches today, my month and my fixes. `ip` (the request's)
   * tells the clock card before any punch whether this computer is on the office network (Extra · today OutsideNetwork).
   */
  me(ctx: TenantContext, month: string, ip: string | null = null, deviceHash: string | null = null) {
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
      const used = await tx.attendanceRequest.count({ where: { organizationId: org, employeeId: f.employeeId, kind: { notIn: NOT_FIX }, status: { in: ['pending', 'approved'] }, workOn: { gte: asDate(`${today.slice(0, 7)}-01`), lte: asDate(today) } } });
      const thisMonth = monthRange(today.slice(0, 7));
      const wfhUsed = await tx.attendanceRequest.count({ where: { organizationId: org, employeeId: f.employeeId, kind: 'wfh', status: { in: ['pending', 'approved'] }, workOn: { gte: asDate(thisMonth.from), lte: asDate(thisMonth.to) } } });
      const opens = await settingOn(tx, c, 'attendance.check_in_opens_minutes', f, today);
      const manager = f.managerEmployeeId ? await tx.employee.findFirst({ where: { organizationId: org, id: f.managerEmployeeId }, select: { preferredName: true, givenName: true, familyName: true } }) : null;
      return {
        employee: { id: f.employeeId, name: f.name },
        today,
        zone: f.zone,
        mode: await settingOn(tx, c, 'attendance.mode', f, today),
        // Today's shift from the roster / pattern / location (Q1); null on a weekly off.
        // ShiftNotStarted: check-in opens `opensBefore` minutes before the shift (null: any time; the server refuses earlier).
        shift: { ...(day.shift ? { name: day.shift.name, start: day.shift.shiftStart, end: day.shift.shiftEnd, grace: day.shift.graceMinutes, checkIn: rule.checkIn, off: false, reclockIn: day.shift.reclockIn ?? rule.reclockIn } : { name: 'Weekly off', start: rule.shiftStart, end: rule.shiftEnd, grace: rule.graceMinutes, checkIn: rule.checkIn, off: true }), opensBefore: opens === 'any' ? null : Number(opens) },
        // OutsideNetwork: "inside" on an office network; "outside" when only networks decide and this one isn't one of
        // them; "unknown" when the location (geofence) decides at the punch, or nothing restricts it.
        network: networkOf(fences, ip, rule.checkIn),
        // DeviceNotApproved: whether this computer may clock in, and whether HR was already asked to approve it.
        device: await this.webDevice(tx, c, f, today, deviceHash).then(({ id: _id, ...d }) => d),
        manager: manager ? [manager.preferredName ?? manager.givenName, manager.familyName].filter(Boolean).join(' ') : null,
        fences: fences.filter((x) => x.lat !== null).map((x) => ({ name: x.name, ...(x.point ? { point: x.point } : {}), lat: x.lat, lng: x.lng, radiusM: x.radiusM })),
        punches: punches.map((p) => this.punchView(p, names)),
        // Working or on a break: the next punch closes the day (a break still open ends at check-out).
        next: accepted.length && accepted[accepted.length - 1].kind !== 'out' ? 'out' : 'in',
        onBreak: accepted.at(-1)?.kind === 'break_start',
        days: await this.dayPlaces(tx, c, f, from, to).then((places) => days.map((d) => ({ on: dateOf(d.workOn), status: d.status, leavePart: d.leavePart, firstIn: d.firstIn, lastOut: d.lastOut, workedMinutes: d.workedMinutes, lateMinutes: d.lateMinutes, regularised: d.regularised, place: places.get(dateOf(d.workOn)) ?? 'unknown' }))),
        requests: await this.withSentBack(tx, org, requests).then((notes) => requests.map((r) => ({ id: r.id, on: dateOf(r.workOn), kind: r.kind, inMinute: r.inMinute, outMinute: r.outMinute, reason: r.reason, status: r.status, place: r.place, sentBack: notes.get(r.id) ?? null }))),
        regularise: { limit, used },
        // Work from home (TIM-07): this month's days asked for or approved, and whether today is an approved one.
        wfh: { limit: Number(await settingOn(tx, c, 'attendance.wfh_monthly_limit', f, today)), used: wfhUsed },
        onDuty: { aheadDays: Number(await settingOn(tx, c, 'attendance.on_duty.ahead_days', f, today)), backDays: Number(await settingOn(tx, c, 'attendance.on_duty.back_days', f, today)) },
        // Batch A item 7 (B4): hourly permissions this month (asked for or approved) and the company's limits.
        permission: { limit: Number(await settingOn(tx, c, 'attendance.permission.monthly_limit', f, today)), maxMinutes: Number(await settingOn(tx, c, 'attendance.permission.max_minutes', f, today)), used: await tx.attendanceRequest.count({ where: { organizationId: org, employeeId: f.employeeId, kind: 'permission', status: { in: ['pending', 'approved'] }, workOn: { gte: asDate(thisMonth.from), lte: asDate(thisMonth.to) } } }) },
        // TIM-07 Ot: overtime asked for ahead (waiting ones show with the requests; withdrawn on My attendance).
        otPlans: (await tx.overtimePlan.findMany({ where: { organizationId: org, employeeId: f.employeeId, workOn: { gte: asDate(addDays(today, -31)) } }, orderBy: { workOn: 'desc' }, take: 30 })).map((x) => ({ id: x.id, on: dateOf(x.workOn), minutes: x.plannedMinutes, takeAs: x.takeAs, reason: x.reason, status: x.status })),
        otAheadDays: Number(await settingOn(tx, c, 'attendance.overtime.plan_ahead_days', f, today)),
        wfhToday: requests.some((r) => r.kind === 'wfh' && r.status === 'approved' && dateOf(r.workOn) === today),
        // ChoseWfh: the company lets people clock in as work from home on the day; today's request still waiting.
        wfhSameDay: (await settingOn(tx, c, 'attendance.wfh_same_day', f, today)) === 'on',
        wfhPendingToday: requests.some((r) => r.kind === 'wfh' && r.status === 'pending' && dateOf(r.workOn) === today),
        // TIM-07 / Extra Locked: days of this month in a frozen or locked period take a late correction (paid next payroll).
        locked: [...(await lockedDates(tx, org, f.employeeId, from, to < today ? to : today))].sort(),
        lateRequestMaxDays: Number(await settingFor(tx, c, 'payroll.late_request_max_days', { legalEntityId: f.legalEntityId })),
      };
    });
  }

  /** Web punch (YX-AT-01 / 23 / Q6): accepted or refused, always recorded; duplicates within a minute are ignored. */
  async punch(ctx: TenantContext, user: ScopeUser, dto: PunchDto, ip: string | null, device: string | null, deviceHash: string | null = null) {
    if (user.impersonatorUserId || user.actingSuperAdmin) throw new ForbiddenException('Not available while acting for someone else.');
    const pinGiven = dto.lat !== undefined && dto.lng !== undefined;
    if ((dto.lat === undefined) !== (dto.lng === undefined)) throw new BadRequestException('Send both latitude and longitude, or neither.');
    if (dto.wfh && dto.kind !== 'in') throw new BadRequestException('Only clocking in starts a work-from-home day.');
    const notices: Notice[] = [];
    const res = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const { f, today } = await this.meFacts(tx, c);
      // DeviceNotApproved: refused before anything else; the refusal is audited (the transaction still commits).
      const dev = await this.webDevice(tx, c, f, today, deviceHash);
      if (!dev.approved) {
        await audit(tx, c, 'time.web_device.punch_refused', 'employee', f.employeeId, { kind: dto.kind, requested: dev.requested, userAgent: device?.slice(0, 200) ?? null });
        return null;
      }
      if (dev.id) await tx.timeDevice.updateMany({ where: { id: dev.id, OR: [{ lastSeenAt: null }, { lastSeenAt: { lt: new Date(Date.now() - 60_000) } }] }, data: { lastSeenAt: new Date() } });
      // ChoseWfh: outside the office, clock in as work from home today; the request goes to the manager with it.
      if (dto.wfh) {
        if ((await settingOn(tx, c, 'attendance.wfh_same_day', f, today)) !== 'on') throw new BadRequestException('Your company asks for work from home ahead. Request it, then clock in once it is approved.');
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`punch:${c.organizationId}:${f.employeeId}`}))`;
        const asked = await tx.attendanceRequest.findFirst({ where: { organizationId: c.organizationId, employeeId: f.employeeId, workOn: asDate(today), kind: 'wfh', status: { in: ['pending', 'approved'] } }, select: { id: true } });
        if (!asked) notices.push(...(await this.raiseWfh(tx, c, f, today, today, 'Clocked in from outside the office as work from home')).notices);
      }
      const { punchId: _id, ...out } = await this.record(tx, c, f, { kind: dto.kind, at: new Date(), source: 'web', pin: pinGiven ? { lat: dto.lat!, lng: dto.lng!, accuracyM: dto.accuracyM } : null, ip, device, note: dto.note });
      return out;
    });
    if (res === null) throw new ForbiddenException({ statusCode: 403, code: 'DEVICE_NOT_APPROVED', message: "This computer isn't approved for clock-in. Use your approved device, or ask HR to approve this one." });
    await this.engine.send(ctx, notices);
    return res;
  }

  /**
   * One punch of a person through the shared day, shift and break rules: the web punch (now), and the kiosk and phone
   * punches of TIM-12 / 13 (`at` may be up to 72 h old when a device syncs; a locked month is refused). A kiosk's
   * place decides where it was (its location must be one of the person's places, unless they work in the field).
   */
  async record(tx: Tx, c: CompanyContext, f: Facts, p: { kind: PunchDto['kind']; at: Date; source: 'web' | 'kiosk' | 'mobile'; pin: { lat: number; lng: number; accuracyM?: number } | null; wifi?: string | null; ip: string | null; device: string | null; kioskLocationId?: string; note?: string }) {
    const org = c.organizationId;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`punch:${org}:${f.employeeId}`}))`;
    const now = p.at;
    const today = todayIn(f.zone, now);
    const rule = (await rulesFor(tx, org, f.locationId, today))(today);
    // A night shift's morning punch belongs to the day the shift started (YX-AT-13).
    const book = await ScheduleBook.load(tx, org);
    await book.prime([f.employeeId], addDays(today, -1), today);
    const shifts = new Map<string, Awaited<ReturnType<ScheduleBook['day']>>['shift']>();
    for (const d of [addDays(today, -1), today]) shifts.set(d, (await book.day(f, d)).shift);
    // The latest punch up to this one (a device's offline punch may arrive after later ones).
    const last = await tx.punch.findFirst({ where: { organizationId: org, employeeId: f.employeeId, accepted: true, punchedAt: { lte: now } }, orderBy: { punchedAt: 'desc' } });
    if (last && last.kind === p.kind && now.getTime() - last.punchedAt.getTime() < 60_000) return { accepted: true, duplicate: true, kind: p.kind, at: last.punchedAt, verdict: last.verdict, message: ALREADY[p.kind], distanceM: last.distanceM, note: last.note, punchId: last.id };
    // A break belongs to the day a check-out now would close (a break across midnight stays on the night shift's
    // day). It starts while working that day and ends while on it.
    const workOn = workOnForPunch(now, f.zone, p.kind === 'in' ? 'in' : 'out', (d) => shifts.get(d) ?? null);
    if (p.source !== 'web') await assertOpen(tx, org, f.employeeId, workOn);
    const state = last && dateOf(last.workOn) === workOn ? last.kind : null;
    // ShiftNotStarted: check-in opens a set time before the shift (setting; "any" never refuses).
    const own = shifts.get(workOn);
    if (p.kind === 'in' && state === null && own) {
      const opens = await settingOn(tx, c, 'attendance.check_in_opens_minutes', f, workOn);
      if (opens !== 'any' && minutesInto(workOn, f.zone, now) < own.shiftStart - Number(opens)) throw new ConflictException(`Your ${own.name} shift starts at ${clock(own.shiftStart)}. Check-in opens at ${clock(own.shiftStart - Number(opens))}.`);
    }
    if (p.kind === 'break_start' && state !== 'in' && state !== 'break_end') throw new ConflictException(state === 'break_start' ? 'You are already on a break.' : 'Check in before you start a break.');
    if (p.kind === 'break_end' && state !== 'break_start') throw new ConflictException('You are not on a break.');
    // Answer 2477: clocking in again after clocking out only where HR allows it on the day's shift (else the location's).
    // Web only: kiosks and phones (also offline syncs) record what happened; the day engine decides what counts (question 2490).
    if (p.source === 'web' && p.kind === 'in' && state === 'out' && !(own?.reclockIn ?? rule.reclockIn)) throw new ConflictException("You have already clocked out today. To change today's times, regularise the day.");
    // An approved work-from-home day (or one waiting, when the company lets people clock in as WFH on the day): the punch
    // records where the person is and is never refused for the place. Not approved, those punches stop counting.
    const sameDay = (await settingOn(tx, c, 'attendance.wfh_same_day', f, workOn)) === 'on';
    const wfh = Boolean(await tx.attendanceRequest.findFirst({ where: { organizationId: org, employeeId: f.employeeId, workOn: asDate(workOn), kind: 'wfh', status: { in: sameDay ? ['approved', 'pending'] : ['approved'] } }, select: { id: true } }));
    const fences = await this.fences(tx, org, [f.locationId, ...rule.alsoAllowed]);
    let v: ReturnType<typeof checkInVerdict>;
    if (p.kioskLocationId) {
      const here = (await this.fences(tx, org, [p.kioskLocationId]))[0];
      const ok = fences.some((x) => x.locationId === p.kioskLocationId) || rule.checkIn === 'field' || wfh;
      v = ok ? { accepted: true, verdict: 'inside', distanceM: null, locationId: p.kioskLocationId, message: `At the ${here?.name ?? 'site'} kiosk` } : { accepted: false, verdict: 'outside', distanceM: null, locationId: p.kioskLocationId, message: `This kiosk is not at one of your work places. Check in at ${fences[0]?.name ?? 'your own site'}.` };
    } else {
      v = checkInVerdict({ fences, pin: p.pin ? { lat: p.pin.lat, lng: p.pin.lng, accuracyM: p.pin.accuracyM ?? 9999 } : null, ip: p.ip, wifi: p.wifi, mode: wfh ? 'field' : rule.checkIn });
      if (wfh && v.verdict === 'field') v.message = 'Working from home today, location recorded';
    }
    const row = await tx.punch.create({
      data: {
        organizationId: org,
        employeeId: f.employeeId,
        punchedAt: now,
        workOn: asDate(workOn),
        kind: p.kind,
        source: p.source,
        accepted: v.accepted,
        refusal: v.accepted ? null : v.message,
        lat: p.pin ? p.pin.lat : null,
        lng: p.pin ? p.pin.lng : null,
        accuracyM: p.pin?.accuracyM === undefined ? null : Math.round(p.pin.accuracyM),
        distanceM: v.distanceM,
        verdict: v.verdict,
        workPlace: placeOf({ source: p.source, verdict: v.verdict, accepted: v.accepted }),
        locationId: v.locationId,
        ip: p.ip?.slice(0, 45) ?? null,
        device: p.device?.slice(0, 200) ?? null,
        note: p.note ?? null,
      },
    });
    if (v.accepted) await this.days.evaluate(tx, c, f.employeeId, workOn, workOn, new Date());
    return { accepted: v.accepted, duplicate: false, kind: p.kind, at: now, verdict: v.verdict, message: v.accepted ? `${DONE[p.kind]}. ${v.message}` : v.message, distanceM: v.distanceM, note: row.note, punchId: row.id };
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
      if (await tx.attendanceRequest.findFirst({ where: { organizationId: org, employeeId: f.employeeId, workOn: asDate(dto.on), kind: { notIn: NOT_FIX }, status: 'pending' } })) throw new ConflictException('A fix for that day is already waiting for approval.');
      const limit = Number(await settingOn(tx, c, 'attendance.regularise_monthly_limit', f, dto.on));
      const used = await tx.attendanceRequest.count({ where: { organizationId: org, employeeId: f.employeeId, kind: { notIn: NOT_FIX }, status: { in: ['pending', 'approved'] }, workOn: { gte: asDate(monthRange(dto.on.slice(0, 7)).from), lte: asDate(monthRange(dto.on.slice(0, 7)).to) } } });
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
      const { f: now, today } = await this.meFacts(tx, c);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`punch:${c.organizationId}:${now.employeeId}`}))`;
      const out = await this.raiseWfh(tx, c, now, today, dto.on, dto.reason);
      notices.push(...out.notices);
      return { id: out.id, status: out.status, hrStep: out.hrStep };
    });
    await this.engine.send(ctx, notices);
    return res;
  }

  /** One work-from-home request through P03 (TIM-07, and ChoseWfh when clocking in from outside on the day). */
  private async raiseWfh(tx: Tx, c: CompanyContext, now: Facts, today: string, on: string, reason: string) {
    const org = c.organizationId;
    const notices: Notice[] = [];
    const dto = { on, reason };
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
    return { id: r.id, status: (await tx.attendanceRequest.findFirstOrThrow({ where: { id: r.id } })).status, hrStep: used >= limit, notices };
  }

  /**
   * On duty (TIM-07 OnDuty, Nov 2026): a day, or part of it, away from the office at a named place, through P03 to the
   * manager (who may approve, turn it down or send it back for changes). Approved, its time counts as worked in the day
   * engine (a full day is present; part of one joins the office hours). Up to attendance.on_duty.ahead_days ahead and
   * back_days back; never a locked month, a day of full-day leave, or a time that overlaps another on-duty request.
   */
  async requestOnDuty(ctx: TenantContext, user: ScopeUser, dto: OnDutyDto) {
    if (user.impersonatorUserId || user.actingSuperAdmin) throw new ForbiddenException('Not available while acting for someone else.');
    const notices: Notice[] = [];
    const res = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const { f: now, today } = await this.meFacts(tx, c);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`punch:${org}:${now.employeeId}`}))`;
      const f = await factsOn(tx, org, now.employeeId, dto.on);
      if (!f || dto.on < f.joinedOn || (f.exitedOn && dto.on > f.exitedOn)) throw new BadRequestException('You are not working here on that day.');
      const problem = onDutyProblem({ on: dto.on, today, aheadDays: Number(await settingOn(tx, c, 'attendance.on_duty.ahead_days', f, today)), backDays: Number(await settingOn(tx, c, 'attendance.on_duty.back_days', f, today)), inMinute: dto.inMinute, outMinute: dto.outMinute });
      if (problem) throw new BadRequestException({ statusCode: 400, message: problem.message, field: problem.field });
      if ((await lockedDates(tx, org, f.employeeId, dto.on, dto.on)).size) throw new ConflictException(`${fmt(dto.on)} is in a locked month. Ask HR to record a correction.`);
      const leave = await tx.$queryRaw<{ part: string }[]>`
        SELECT d.part FROM leave_request_days d JOIN leave_requests r ON r.organization_id = d.organization_id AND r.id = d.request_id
        WHERE d.organization_id = ${org}::uuid AND d.employee_id = ${f.employeeId}::uuid AND d.active AND d.portion > 0 AND d.leave_on = ${dto.on}::date
          AND r.status IN ('pending', 'approved', 'cancel_pending') LIMIT 1`;
      if (leave[0]?.part === 'full') throw new ConflictException(`You have leave on ${fmt(dto.on)}. Cancel it first if you were on duty instead.`);
      const old = dto.resendOf ? await tx.attendanceRequest.findFirst({ where: { organizationId: org, id: dto.resendOf, employeeId: f.employeeId, kind: 'on_duty' }, select: { id: true, status: true } }) : null;
      if (dto.resendOf && !old) throw new NotFoundException('No such request.');
      if (old && old.status !== 'sent_back') throw new ConflictException(old.status === 'resent' ? 'You already sent this request again.' : 'Only a request sent back for changes can be sent again.');
      const same = await tx.attendanceRequest.findMany({ where: { organizationId: org, employeeId: f.employeeId, workOn: asDate(dto.on), kind: 'on_duty', status: { in: ['pending', 'approved'] } } });
      const clash = same.find((x) => x.inMinute !== null && x.outMinute !== null && overlaps({ inMinute: x.inMinute, outMinute: x.outMinute }, dto));
      if (clash) throw new ConflictException(`You already asked for on duty on ${fmt(dto.on)} from ${clockText(clash.inMinute!)} to ${clockText(clash.outMinute!)}.`);
      if (old) await tx.attendanceRequest.update({ where: { id: old.id }, data: { status: 'resent', version: { increment: 1 }, updatedAt: new Date() } });
      const r = await tx.attendanceRequest.create({ data: { organizationId: org, employeeId: f.employeeId, workOn: asDate(dto.on), kind: 'on_duty', inMinute: dto.inMinute, outMinute: dto.outMinute, place: dto.place, reason: dto.reason, raisedBy: c.userId ?? null } });
      const hr = await hrApprovers(tx, org, f.employeeId, today, f.userId);
      const sub = await this.engine.submit(tx, c, {
        type: ON_DUTY,
        subjectType: 'attendance_request',
        subjectId: r.id,
        title: `${f.name}: on duty on ${fmt(dto.on)}`,
        summary: [
          { label: 'Day', value: fmt(dto.on) },
          { label: 'Where', value: dto.place },
          { label: 'Time', value: `${clockText(dto.inMinute)} to ${clockText(dto.outMinute)}` },
          { label: 'Why', value: dto.reason.slice(0, 300) },
          ...(old ? [{ label: 'Note', value: 'Sent again after changes' }] : []),
        ],
        subjectPersonId: f.personId,
        requesterUserId: c.userId ?? null,
        raisedByUserId: c.userId ?? null,
        steps: [{ name: 'Manager', approvers: [{ kind: 'manager' }], mode: 'any', remindAfterHours: 24 }],
        payload: {},
        payloadFields: [],
        fallbackUserIds: hr,
      });
      notices.push(...sub.notices);
      await tx.attendanceRequest.update({ where: { id: r.id }, data: { wfRequestId: sub.id } });
      await audit(tx, c, 'attendance.on_duty.submitted', 'attendance_request', r.id, { employeeId: f.employeeId, on: dto.on, inMinute: dto.inMinute, outMinute: dto.outMinute, place: dto.place, ...(old ? { resendOf: old.id } : {}) });
      return { id: r.id, status: (await tx.attendanceRequest.findFirstOrThrow({ where: { id: r.id } })).status };
    });
    await this.engine.send(ctx, notices);
    return res;
  }

  /**
   * Hourly permission (batch A item 7, attendance-leave B4, answer 2310): a from and to time on one working day, through
   * P03 to the manager. It never uses leave. The company sets how many a month (attendance.permission.monthly_limit,
   * default 2) and how long each (attendance.permission.max_minutes, default 120); past either it is refused with the
   * reason. Approved, its time joins the day's hours in the day engine, so the day stays present.
   */
  async requestPermission(ctx: TenantContext, user: ScopeUser, dto: PermissionDto) {
    if (user.impersonatorUserId || user.actingSuperAdmin) throw new ForbiddenException('Not available while acting for someone else.');
    const notices: Notice[] = [];
    const res = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const { f: now, today } = await this.meFacts(tx, c);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`punch:${org}:${now.employeeId}`}))`;
      const f = await factsOn(tx, org, now.employeeId, dto.on);
      if (!f || dto.on < f.joinedOn || (f.exitedOn && dto.on > f.exitedOn)) throw new BadRequestException('You are not working here on that day.');
      const month = monthRange(dto.on.slice(0, 7));
      const used = await tx.attendanceRequest.count({ where: { organizationId: org, employeeId: f.employeeId, kind: 'permission', status: { in: ['pending', 'approved'] }, workOn: { gte: asDate(month.from), lte: asDate(month.to) } } });
      const limit = Number(await settingOn(tx, c, 'attendance.permission.monthly_limit', f, dto.on));
      const maxMinutes = Number(await settingOn(tx, c, 'attendance.permission.max_minutes', f, dto.on));
      const monthName = new Date(`${dto.on}T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', timeZone: 'UTC' });
      const problem = permissionProblem({ on: dto.on, today, aheadDays: Number(await settingOn(tx, c, 'attendance.on_duty.ahead_days', f, today)), backDays: Number(await settingOn(tx, c, 'attendance.on_duty.back_days', f, today)), inMinute: dto.inMinute, outMinute: dto.outMinute, maxMinutes, limit, used, month: monthName });
      if (problem) {
        const body = { statusCode: problem.status, message: problem.message, field: problem.field };
        throw problem.status === 409 ? new ConflictException(body) : new BadRequestException(body);
      }
      if ((await (await ScheduleBook.load(tx, org)).day(f, dto.on)).weeklyOff) throw new BadRequestException({ statusCode: 400, message: `${fmt(dto.on)} is your weekly off: no permission needed.`, field: 'on' });
      const holiday = (await holidaysFor(tx, org, f.locationId, dto.on, dto.on, f.employeeId)).map.get(dto.on);
      if (holiday && !holiday.halfDay) throw new BadRequestException({ statusCode: 400, message: `${fmt(dto.on)} is a holiday (${holiday.name}): no permission needed.`, field: 'on' });
      if ((await lockedDates(tx, org, f.employeeId, dto.on, dto.on)).size) throw new ConflictException(`${fmt(dto.on)} is in a locked month. Ask HR to record a correction.`);
      const leave = await tx.$queryRaw<{ part: string }[]>`
        SELECT d.part FROM leave_request_days d JOIN leave_requests r ON r.organization_id = d.organization_id AND r.id = d.request_id
        WHERE d.organization_id = ${org}::uuid AND d.employee_id = ${f.employeeId}::uuid AND d.active AND d.portion > 0 AND d.leave_on = ${dto.on}::date
          AND r.status IN ('pending', 'approved', 'cancel_pending') LIMIT 1`;
      if (leave[0]?.part === 'full') throw new ConflictException(`You have leave on ${fmt(dto.on)}: no permission needed.`);
      const same = await tx.attendanceRequest.findMany({ where: { organizationId: org, employeeId: f.employeeId, workOn: asDate(dto.on), kind: 'permission', status: { in: ['pending', 'approved'] } } });
      const clash = same.find((x) => overlaps({ inMinute: x.inMinute!, outMinute: x.outMinute! }, dto));
      if (clash) throw new ConflictException(`You already asked for permission on ${fmt(dto.on)} from ${clockText(clash.inMinute!)} to ${clockText(clash.outMinute!)}.`);
      const r = await tx.attendanceRequest.create({ data: { organizationId: org, employeeId: f.employeeId, workOn: asDate(dto.on), kind: 'permission', inMinute: dto.inMinute, outMinute: dto.outMinute, reason: dto.reason, raisedBy: c.userId ?? null } });
      const hr = await hrApprovers(tx, org, f.employeeId, today, f.userId);
      const sub = await this.engine.submit(tx, c, {
        type: PERMISSION,
        subjectType: 'attendance_request',
        subjectId: r.id,
        title: `${f.name}: permission on ${fmt(dto.on)}`,
        summary: [
          { label: 'Day', value: fmt(dto.on) },
          { label: 'Time', value: `${clockText(dto.inMinute)} to ${clockText(dto.outMinute)} (${minutesText(dto.outMinute - dto.inMinute)})` },
          { label: 'Permissions this month', value: `${used + 1} of ${limit}` },
          { label: 'Why', value: dto.reason.slice(0, 300) },
        ],
        subjectPersonId: f.personId,
        requesterUserId: c.userId ?? null,
        raisedByUserId: c.userId ?? null,
        steps: [{ name: 'Manager', approvers: [{ kind: 'manager' }], mode: 'any', remindAfterHours: 24 }],
        payload: {},
        payloadFields: [],
        fallbackUserIds: hr,
      });
      notices.push(...sub.notices);
      await tx.attendanceRequest.update({ where: { id: r.id }, data: { wfRequestId: sub.id } });
      await audit(tx, c, 'attendance.permission.submitted', 'attendance_request', r.id, { employeeId: f.employeeId, on: dto.on, inMinute: dto.inMinute, outMinute: dto.outMinute, used: used + 1, limit });
      return { id: r.id, status: (await tx.attendanceRequest.findFirstOrThrow({ where: { id: r.id } })).status, used: used + 1, limit };
    });
    await this.engine.send(ctx, notices);
    return res;
  }

  /** Send back is on for on duty unless the company turned it off (attendance.on_duty.send_back). */
  private async onDutySendBackAllowed(tx: Tx, wf: Prisma.WfRequestGetPayload<object>): Promise<boolean> {
    const r = await tx.attendanceRequest.findFirst({ where: { organizationId: wf.organizationId, id: wf.subjectId }, select: { employeeId: true, status: true } });
    if (!r || r.status !== 'pending') return false;
    const today = todayIn('Asia/Kolkata');
    const f = await factsOn(tx, wf.organizationId, r.employeeId, today);
    return Boolean(f) && (await settingOn(tx, { organizationId: wf.organizationId, isSuperAdmin: false }, 'attendance.on_duty.send_back', f!, today)) === 'on';
  }

  /** Sent back for changes: the request waits for the employee to change it and send it again (or withdraw it). */
  private async onDutySentBack(tx: Tx, wf: Prisma.WfRequestGetPayload<object>, reason: string) {
    const done = await tx.attendanceRequest.updateMany({ where: { organizationId: wf.organizationId, id: wf.subjectId, status: 'pending' }, data: { status: 'sent_back', decidedAt: new Date(), version: { increment: 1 }, updatedAt: new Date() } });
    if (!done.count) return;
    await audit(tx, { organizationId: wf.organizationId, isSuperAdmin: false, userId: null }, 'attendance.on_duty.sent_back', 'attendance_request', wf.subjectId, { wfRequestId: wf.id, reason });
  }

  async withdraw(ctx: TenantContext, user: ScopeUser, id: string) {
    if (user.impersonatorUserId || user.actingSuperAdmin) throw new ForbiddenException('Not available while acting for someone else.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const mine = await myEmployeeId(tx, c.organizationId, c.userId);
      const r = await tx.attendanceRequest.findFirst({ where: { organizationId: c.organizationId, id, employeeId: mine } });
      if (!r) throw new NotFoundException('No such request.');
      // On duty sent back for changes can also be withdrawn (it is no longer with the manager).
      if (r.status !== 'pending' && !(r.kind === 'on_duty' && r.status === 'sent_back')) throw new ConflictException('Only a request still waiting for approval can be withdrawn.');
      if (r.wfRequestId && r.status === 'pending') await this.engine.withdraw(tx, c, r.wfRequestId, c.userId ?? null, 'Withdrawn by the employee');
      await tx.attendanceRequest.update({ where: { id: r.id }, data: { status: 'withdrawn', decidedAt: new Date(), version: { increment: 1 }, updatedAt: new Date() } });
      if (r.kind === 'wfh') await this.dropWfhPunches(tx, c, r.employeeId, dateOf(r.workOn));
      return { id: r.id, status: 'withdrawn' };
    });
  }

  private async decided(tx: Tx, wf: Prisma.WfRequestGetPayload<object>, outcome: 'approved' | 'rejected') {
    const r = await tx.attendanceRequest.findFirst({ where: { organizationId: wf.organizationId, id: wf.subjectId } });
    if (!r || r.status !== 'pending') return;
    await tx.attendanceRequest.update({ where: { id: r.id }, data: { status: outcome, decidedAt: new Date(), version: { increment: 1 }, updatedAt: new Date() } });
    const on = dateOf(r.workOn);
    const c = { organizationId: wf.organizationId, isSuperAdmin: false };
    if (outcome === 'approved') await this.days.evaluate(tx, c, r.employeeId, on, on);
    else if (r.kind === 'wfh') await this.dropWfhPunches(tx, c, r.employeeId, on);
  }

  /** What the manager asked to change, for on duty sent back (P03 send-back reason). */
  private async withSentBack(tx: Tx, org: string, reqs: { id: string; status: string; wfRequestId: string | null }[]): Promise<Map<string, string>> {
    const back = reqs.filter((r) => r.status === 'sent_back' && r.wfRequestId);
    if (!back.length) return new Map();
    const acts = await tx.wfAction.findMany({ where: { organizationId: org, requestId: { in: back.map((r) => r.wfRequestId!) }, action: 'sent_back' }, orderBy: { createdAt: 'asc' } });
    return new Map(back.map((r) => [r.id, acts.filter((a) => a.requestId === r.wfRequestId).pop()?.reason ?? '']));
  }

  /**
   * ChoseWfh: work from home not approved (or withdrawn): the day is worked out again, and the day engine leaves out the
   * web punches taken from outside under it (punches are append-only, so they stay as recorded).
   */
  private async dropWfhPunches(tx: Tx, c: CompanyContext, employeeId: string, on: string) {
    await this.days.evaluate(tx, c, employeeId, on, on);
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

  /**
   * Keka ideas (2026-11), "My team today": my direct reports today (my own record as their manager on today's job, never
   * the wider reporting line or an HR grant), each with one state: on leave, off, on duty, working from home, late, in,
   * or not in yet. Only people I may see today (visibleSql); nothing while acting for someone else.
   */
  async teamToday(ctx: TenantContext, user: ScopeUser) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const today = todayIst();
      const own = v.userId && !v.actingForOther ? ((await tx.employee.findFirst({ where: { organizationId: c.organizationId, userId: v.userId }, select: { id: true } }))?.id ?? null) : null;
      if (!own) return { date: today, people: [] };
      const people = await tx.$queryRaw<{ id: string; name: string }[]>`
        SELECT DISTINCT e.id::text, concat_ws(' ', coalesce(e.preferred_name, e.given_name), e.family_name) AS name
        FROM employee_assignments a JOIN employees e ON e.organization_id = a.organization_id AND e.id = a.employee_id
        WHERE a.organization_id = ${c.organizationId}::uuid AND a.manager_employee_id = ${own}::uuid AND a.superseded_at IS NULL
          AND a.employee_id <> ${own}::uuid AND ${today}::date <@ daterange(a.valid_from, a.valid_to, '[]')
          AND ${await visibleSql(tx, c, v, own, 'attendance.view', Prisma.sql`e.id`, today)}
        ORDER BY 2 LIMIT 200`;
      const ids = people.map((p) => p.id);
      const days = ids.length ? await tx.attendanceDay.findMany({ where: { organizationId: c.organizationId, employeeId: { in: ids }, workOn: asDate(today) }, select: { employeeId: true, status: true, firstIn: true, lateMinutes: true } }) : [];
      const requests = ids.length ? await tx.attendanceRequest.findMany({ where: { organizationId: c.organizationId, employeeId: { in: ids }, status: 'approved', kind: { in: ['wfh', 'on_duty'] }, workOn: asDate(today) }, select: { employeeId: true, kind: true } }) : [];
      // Nudge (PLT-02): already reminded to check in today.
      const nudged = ids.length ? await tx.nudge.findMany({ where: { organizationId: c.organizationId, employeeId: { in: ids }, item: 'check_in', onDay: asDate(today) }, select: { employeeId: true } }) : [];
      const out = [];
      for (const p of people) {
        const d = days.find((x) => x.employeeId === p.id);
        const leave = (await leaveDays(tx, c.organizationId, p.id, today, today)).get(today) ?? null;
        const state = teamTodayState({ status: d?.status, leave, firstIn: d?.firstIn, lateMinutes: d?.lateMinutes, wfh: requests.some((r) => r.employeeId === p.id && r.kind === 'wfh'), onDuty: requests.some((r) => r.employeeId === p.id && r.kind === 'on_duty') });
        out.push({ id: p.id, name: p.name, state, lateMinutes: state === 'late' ? (d?.lateMinutes ?? 0) : null, reminded: nudged.some((n) => n.employeeId === p.id) });
      }
      return { date: today, people: out };
    });
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
      const ots = ids.length ? await tx.overtimeRequest.findMany({ where: { organizationId: c.organizationId, employeeId: { in: ids }, workOn: { gte: asDate(from), lte: asDate(to) }, status: { in: ['pending', 'approved'] } }, select: { employeeId: true, workOn: true, payableMinutes: true, status: true, settle: true } }) : [];
      // TIM-02: the month's stage for the legal entity it is about (the one picked, else the company's only one).
      const ent = await this.periods.musterEntity(tx, c, user, entityId);
      const period = ent.id ? await this.periods.musterPeriod(tx, c, ent.v, ent.id, month) : null;
      // TIM-02 Pre-approve overtime (founder 2 Nov 2026): for the viewer's reporting line only, what the sheet needs.
      const today = todayIst();
      const line = v.actingForOther ? new Set<string>() : await inReportingLine(tx, c, own, ids, today);
      const otHints = new Map<string, { aheadDays: number; factoriesAct: boolean }>();
      for (const id of line) {
        const f = await factsOn(tx, c.organizationId, id, today);
        if (f) otHints.set(id, await this.overtime.planHints(tx, c.organizationId, f, today));
      }
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
        period,
        // Bulk "mark present" (TIM-02) is HR's: leave.approve, checked again per person on the server.
        canMarkPresent: has(v, 'leave.approve') && !v.actingForOther,
        people: people.map((p) => ({
          id: p.id,
          name: p.name,
          code: p.code,
          location: p.location,
          me: p.id === own,
          mode: modes.get(p.id)?.mode ?? 'punch',
          missingPunchEffect: modes.get(p.id)?.effect ?? 'block_payroll_approval',
          remindedOn: nudges.filter((n) => n.employeeId === p.id).map((n) => dateOf(n.onDay)),
          ...(otHints.has(p.id) ? { ot: otHints.get(p.id) } : {}),
          days: days.filter((d) => d.employeeId === p.id).map((d) => ({ on: dateOf(d.workOn), status: d.status, leavePart: d.leavePart, firstIn: d.firstIn, lateMinutes: d.lateMinutes, workedMinutes: d.workedMinutes, regularised: d.regularised, otMinutes: ots.find((o) => o.employeeId === p.id && dateOf(o.workOn) === dateOf(d.workOn))?.payableMinutes ?? 0, otStatus: ots.find((o) => o.employeeId === p.id && dateOf(o.workOn) === dateOf(d.workOn))?.status ?? null })),
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
      const [place, role] = await Promise.all([
        tx.location.findFirst({ where: { organizationId: org, id: f.locationId }, select: { name: true } }),
        tx.designation.findFirst({ where: { organizationId: org, id: f.designationId }, select: { name: true } }),
      ]);
      return {
        month,
        // Extra · Attendance calendar, Manager · one person: who, every day of the month, waiting fixes and locked days.
        employee: { id: f.employeeId, name: f.name, code: f.code, role: role?.name ?? null, location: place?.name ?? null },
        today,
        zone: f.zone,
        days: await this.dayPlaces(tx, c, f, from, to).then((places) => days.map((d) => ({ on: dateOf(d.workOn), status: d.status, leavePart: d.leavePart, firstIn: d.firstIn, lastOut: d.lastOut, workedMinutes: d.workedMinutes, lateMinutes: d.lateMinutes, regularised: d.regularised, place: places.get(dateOf(d.workOn)) ?? 'unknown' }))),
        requests: fixes.filter((r) => r.status === 'pending').map((r) => ({ id: r.id, on: dateOf(r.workOn), kind: r.kind, status: r.status })),
        locked: from <= today ? [...(await lockedDates(tx, org, employeeId, from, to < today ? to : today))].sort() : [],
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
      // The day's shift (the day card's shift bar and late mark); null on a weekly off.
      const shift = (await (await ScheduleBook.load(tx, c.organizationId)).day(f, on)).shift;
      const org = c.organizationId;
      const month = monthRange(on.slice(0, 7));
      // Batch C item 6: waived late marks stay visible on their day ("waived") but do not count towards the penalty.
      const waivers = await tx.lateMarkWaiver.findMany({ where: { organizationId: org, employeeId, undoneAt: null, workOn: { gte: asDate(month.from), lte: asDate(on) } } });
      const lateMarks = (await tx.attendanceDay.count({ where: { organizationId: org, employeeId, workOn: { gte: asDate(month.from), lte: asDate(on) }, lateMinutes: { gt: 0 } } })) - waivers.length;
      const waiver = waivers.find((w) => dateOf(w.workOn) === on);
      const waivedBy = waiver ? await tx.user.findFirst({ where: { organizationId: org, id: waiver.waivedBy }, select: { name: true, email: true } }) : null;
      // TIM-03 HrFix: HR (leave.approve over the person, never their own day) may resolve a past day of an open month.
      const hr = !v.actingForOther && employeeId !== own && (await grantCovers(tx, c, v, own, 'leave.approve', employeeId, on));
      const locked = (await lockedDates(tx, org, employeeId, on, on)).size > 0;
      const resolution = await tx.attendanceResolution.findFirst({ where: { organizationId: org, employeeId, workOn: asDate(on) }, orderBy: { createdAt: 'desc' } });
      const resolver = resolution ? await tx.user.findFirst({ where: { organizationId: org, id: resolution.resolvedBy }, select: { name: true, email: true } }) : null;
      return {
        person: { name: f.name, code: f.code },
        on,
        zone: f.zone,
        ot: day?.workedMinutes ? await this.overtime.dayOt(tx, org, employeeId, on) : null,
        lateMarks: { month: Math.max(0, lateMarks), free: Number(await settingOn(tx, c, 'attendance.late_marks_free', f, on)) },
        lateWaived: waiver ? { reason: waiver.reason, by: waivedBy?.name || waivedBy?.email || null, at: waiver.waivedAt.toISOString() } : null,
        locked,
        hrFix: hr ? (on >= todayIn(f.zone) ? { ok: false, why: 'Today is read only until the day is over.' } : locked ? { ok: false, why: 'The month is frozen or locked: record a correction for the next payroll.' } : { ok: true, why: null }) : null,
        onDuty: await tx.attendanceRequest.findFirst({ where: { organizationId: org, employeeId, workOn: asDate(on), kind: 'on_duty', status: { in: ['approved', 'pending'] } }, orderBy: [{ status: 'asc' }, { createdAt: 'desc' }] }).then((x) => (x ? { id: x.id, place: x.place ?? '', inMinute: x.inMinute!, outMinute: x.outMinute!, reason: x.reason, status: x.status as 'approved' | 'pending' } : null)),
        resolution: resolution ? { how: resolution.how, inMinute: resolution.inMinute, outMinute: resolution.outMinute, reason: resolution.reason, by: resolver?.name || resolver?.email || null, at: resolution.createdAt } : null,
        shift: shift ? { name: shift.name, start: shift.shiftStart, end: shift.shiftEnd, grace: shift.graceMinutes } : null,
        day: day ? { status: day.status, leavePart: day.leavePart, workedMinutes: day.workedMinutes, lateMinutes: day.lateMinutes, regularised: day.regularised } : null,
        // The raw network address is not shown (it identifies a home connection); the verdict says enough.
        punches: punches.map((p) => ({ ...this.punchView(p, names), minute: minutesInto(on, f.zone, p.punchedAt) })),
        // A9: the day's place by the company's rule for a day with both office and remote punches.
        place: (await this.dayPlaces(tx, c, f, on, on)).get(on) ?? 'unknown',
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
