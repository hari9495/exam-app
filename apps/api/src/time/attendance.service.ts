import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { CompanyContext, Tx, audit, inCompany } from '../org-structure/org-structure.service';
import { Viewer, buildViewer, tenantWide, has, type ScopeUser } from '../access/scope';
import { ApprovalsEngine, Notice, StepSpec } from '../workflow/approvals-engine.service';
import { DayEngine } from './day-engine.service';
import { PunchDto, RegulariseDto } from './dto';
import { TIME_KEYS, asDate, dateOf, factsOn, hrApprovers, monthRange, mustSee, myEmployeeId, rulesFor, settingOn, todayIn, visibleSql, type Facts } from './time-core';
import { addDays, checkInVerdict, minutesInto, workOnFor, type Fence } from './time-maths';

// M02 Part B basics: web punches with the geofence / allowed-network check (Q6, YX-AT-01, every refused attempt
// logged, YX-AT-23), my days and the team / HR muster (YX-AT-14, read-only in batch 1), and regularisation through
// P03 with the monthly limit (Q5: beyond it HR approves too).

export const REGULARISE = 'attendance.regularise';
const KIND_TEXT: Record<string, string> = { missed_in: 'Missed check-in', missed_out: 'Missed check-out', wrong_time: 'Wrong time', full_day: 'Present all day' };
const hhmm = (m: number | null) => (m === null ? '' : `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
const fmt = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

@Injectable()
export class AttendanceService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly engine: ApprovalsEngine,
    private readonly days: DayEngine,
  ) {}

  onModuleInit() {
    this.engine.register({ key: REGULARISE, label: 'Attendance fix', risk: 'normal', autoActions: false, onDecided: (tx, req, outcome) => this.decided(tx, req, outcome), requesterLink: () => '/yx/time/attendance' });
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
      const fences = await this.fences(tx, org, [f.locationId, ...rule.alsoAllowed]);
      const names = new Map(fences.map((x) => [x.locationId, x.name]));
      const punches = await tx.punch.findMany({ where: { organizationId: org, employeeId: f.employeeId, workOn: asDate(today) }, orderBy: { punchedAt: 'asc' } });
      const accepted = punches.filter((p) => p.accepted);
      const days = await tx.attendanceDay.findMany({ where: { organizationId: org, employeeId: f.employeeId, workOn: { gte: asDate(from), lte: asDate(to) } }, orderBy: { workOn: 'asc' } });
      const requests = await tx.attendanceRequest.findMany({ where: { organizationId: org, employeeId: f.employeeId, workOn: { gte: asDate(addDays(from, -31)) } }, orderBy: { workOn: 'desc' }, take: 60 });
      const limit = Number(await settingOn(tx, c, 'attendance.regularise_monthly_limit', f, today));
      const used = await tx.attendanceRequest.count({ where: { organizationId: org, employeeId: f.employeeId, status: { in: ['pending', 'approved'] }, workOn: { gte: asDate(`${today.slice(0, 7)}-01`), lte: asDate(today) } } });
      return {
        employee: { id: f.employeeId, name: f.name },
        today,
        zone: f.zone,
        mode: await settingOn(tx, c, 'attendance.mode', f, today),
        shift: { name: rule.shiftName, start: rule.shiftStart, end: rule.shiftEnd, grace: rule.graceMinutes, checkIn: rule.checkIn },
        fences: fences.filter((x) => x.lat !== null).map((x) => ({ name: x.name, lat: x.lat, lng: x.lng, radiusM: x.radiusM })),
        punches: punches.map((p) => this.punchView(p, names)),
        next: accepted.length && accepted[accepted.length - 1].kind === 'in' ? 'out' : 'in',
        days: days.map((d) => ({ on: dateOf(d.workOn), status: d.status, leavePart: d.leavePart, firstIn: d.firstIn, lastOut: d.lastOut, workedMinutes: d.workedMinutes, lateMinutes: d.lateMinutes, regularised: d.regularised })),
        requests: requests.map((r) => ({ id: r.id, on: dateOf(r.workOn), kind: r.kind, inMinute: r.inMinute, outMinute: r.outMinute, reason: r.reason, status: r.status })),
        regularise: { limit, used },
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
      const workOn = workOnFor(now, f.zone, rule);
      const last = await tx.punch.findFirst({ where: { organizationId: org, employeeId: f.employeeId, accepted: true }, orderBy: { punchedAt: 'desc' } });
      if (last && last.kind === dto.kind && now.getTime() - last.punchedAt.getTime() < 60_000) return { accepted: true, duplicate: true, kind: dto.kind, at: last.punchedAt, verdict: last.verdict, message: dto.kind === 'in' ? 'Already checked in' : 'Already checked out', distanceM: last.distanceM };
      const v = checkInVerdict({ fences: await this.fences(tx, org, [f.locationId, ...rule.alsoAllowed]), pin: pinGiven ? { lat: dto.lat!, lng: dto.lng!, accuracyM: dto.accuracyM ?? 9999 } : null, ip, mode: rule.checkIn });
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
      return { accepted: v.accepted, duplicate: false, kind: dto.kind, at: now, verdict: v.verdict, message: v.accepted ? (dto.kind === 'in' ? `Checked in. ${v.message}` : `Checked out. ${v.message}`) : v.message, distanceM: v.distanceM };
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
      // Q5 look-back: the current and the previous month (P08 locks arrive later).
      if (dto.on < addDays(`${today.slice(0, 7)}-01`, -31)) throw new BadRequestException('That day is too far back to fix here. Ask HR.');
      const f = await factsOn(tx, org, now.employeeId, dto.on);
      if (!f || dto.on < f.joinedOn) throw new BadRequestException('You were not working here on that day.');
      const needIn = dto.kind === 'missed_in' || dto.kind === 'wrong_time';
      const needOut = dto.kind === 'missed_out' || dto.kind === 'wrong_time';
      if (needIn && dto.inMinute === undefined) throw new BadRequestException('Give the time you started.');
      if (needOut && dto.outMinute === undefined) throw new BadRequestException('Give the time you finished.');
      if (dto.kind === 'wrong_time' && dto.outMinute! <= dto.inMinute!) throw new BadRequestException('The finish time is before the start time.');
      if (await tx.attendanceRequest.findFirst({ where: { organizationId: org, employeeId: f.employeeId, workOn: asDate(dto.on), status: 'pending' } })) throw new ConflictException('A fix for that day is already waiting for approval.');
      const limit = Number(await settingOn(tx, c, 'attendance.regularise_monthly_limit', f, dto.on));
      const used = await tx.attendanceRequest.count({ where: { organizationId: org, employeeId: f.employeeId, status: { in: ['pending', 'approved'] }, workOn: { gte: asDate(monthRange(dto.on.slice(0, 7)).from), lte: asDate(monthRange(dto.on.slice(0, 7)).to) } } });
      const r = await tx.attendanceRequest.create({
        data: { organizationId: org, employeeId: f.employeeId, workOn: asDate(dto.on), kind: dto.kind, inMinute: needIn ? dto.inMinute! : null, outMinute: needOut ? dto.outMinute! : null, reason: dto.reason, raisedBy: c.userId ?? null },
      });
      const hr = await hrApprovers(tx, org, f.employeeId, today);
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

  async withdraw(ctx: TenantContext, user: ScopeUser, id: string) {
    if (user.impersonatorUserId || user.actingSuperAdmin) throw new ForbiddenException('Not available while acting for someone else.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const mine = await myEmployeeId(tx, c.organizationId, c.userId);
      const r = await tx.attendanceRequest.findFirst({ where: { organizationId: c.organizationId, id, employeeId: mine } });
      if (!r) throw new NotFoundException('No such request.');
      if (r.status !== 'pending') throw new ConflictException('Only a fix still waiting for approval can be withdrawn.');
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

  // ------------------------------------------------------------------------------------------ the muster (TIM-02)

  /** Days of everyone the viewer may see (YX-AT-14: team for a manager, attendance.view scope for HR), read-only. */
  async muster(ctx: TenantContext, user: ScopeUser, month: string) {
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
        ORDER BY 2 LIMIT 300`;
      const ids = people.map((p) => p.id);
      const days = ids.length ? await tx.attendanceDay.findMany({ where: { organizationId: c.organizationId, employeeId: { in: ids }, workOn: { gte: asDate(from), lte: asDate(to) } } }) : [];
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
          days: days.filter((d) => d.employeeId === p.id).map((d) => ({ on: dateOf(d.workOn), status: d.status, leavePart: d.leavePart, lateMinutes: d.lateMinutes, workedMinutes: d.workedMinutes, regularised: d.regularised })),
        })),
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
      for (const e of ids) n += await this.days.evaluate(tx, c, e.id, addDays(today, -1), addDays(today, 1), now);
      return n;
    });
  }
}
