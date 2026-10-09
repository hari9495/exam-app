import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { NotificationsService } from '../notifications/notifications.service';
import { CompanyContext, Tx, audit, inCompany } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { Viewer, buildViewer, has, tenantWide, type ScopeUser } from '../access/scope';
import { ApprovalsEngine, Notice } from '../workflow/approvals-engine.service';
import { DayEngine } from './day-engine.service';
import { ConsentDto, PatternAssignDto, PatternDto, RosterCellDto, SafeguardDto, ShiftDetailsDto, ShiftDto, ShiftTimesDto, SwapDto } from './dto';
import { ScheduleBook, assertOpen, lockedDates, nightGuard, oshOn } from './schedule';
import { TimeSetupService, SCOPE_MODEL } from './setup.service';
import { TIME_KEYS, Facts, asDate, dateOf, factsOn, holidaysFor, hrApprovers, leaveDays, mustSee, myEmployeeId, settingOn, visibleSql } from './time-core';
import { addDays } from './time-maths';
import { Conflict, ShiftTimes, mondayOf, restConflicts } from './time-rules';

// M02 §B2 shifts, patterns and the roster (Q1 / Q2, YX-AT-07), swaps through P03 (§B4), and the women's night-work
// law guard (OSH Code, YX-AT-25): no path places a woman on a shift touching the legal night window without her
// consent on record and the establishment's safeguards in date. Set-up is company configuration (leave.settings.manage
// held company-wide); planning reaches a manager's team (implicit, YX-SEC-04) and roster.manage holders in scope.

export const SHIFT_SWAP = 'time.shift_swap';
const fmt = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

@Injectable()
export class RosterService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly engine: ApprovalsEngine,
    private readonly days: DayEngine,
    private readonly setup: TimeSetupService,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit() {
    this.engine.register({ key: SHIFT_SWAP, label: 'Shift swap', risk: 'normal', autoActions: false, onDecided: (tx, req, outcome) => this.swapDecided(tx, req, outcome), requesterLink: () => '/yx/time/roster' });
  }

  private viewer(user: ScopeUser): Promise<Viewer> {
    return buildViewer(this.prisma, this.tenantPrisma, user, [...TIME_KEYS]);
  }

  private async ownId(tx: Tx, c: CompanyContext, v: Viewer) {
    if (!v.userId || v.actingForOther) return null;
    return (await tx.employee.findFirst({ where: { organizationId: c.organizationId, userId: v.userId }, select: { id: true } }))?.id ?? null;
  }

  // ------------------------------------------------------------------------------------------ set-up

  overview(ctx: TenantContext, user: ScopeUser) {
    return this.setup.run(ctx, user, false, async (tx, c) => {
      const org = c.organizationId;
      const today = todayIst();
      const book = await ScheduleBook.load(tx, org);
      const [patterns, assignments, otRules, projects, consents, safeguards, locations, departments, entities, people, users, types] = await Promise.all([
        tx.shiftPattern.findMany({ where: { organizationId: org }, orderBy: { name: 'asc' } }),
        tx.shiftPatternAssignment.findMany({ where: { organizationId: org }, orderBy: { validFrom: 'desc' } }),
        tx.overtimeRule.findMany({ where: { organizationId: org }, orderBy: { validFrom: 'desc' } }),
        tx.timesheetProject.findMany({ where: { organizationId: org }, orderBy: { code: 'asc' } }),
        tx.nightWorkConsent.findMany({ where: { organizationId: org }, orderBy: { givenOn: 'desc' } }),
        tx.nightWorkSafeguard.findMany({ where: { organizationId: org }, orderBy: { attestedOn: 'desc' } }),
        tx.location.findMany({ where: { organizationId: org, archivedAt: null }, orderBy: { name: 'asc' }, select: { id: true, name: true, state: true } }),
        tx.department.findMany({ where: { organizationId: org, archivedAt: null }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
        tx.legalEntity.findMany({ where: { organizationId: org, archivedAt: null }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
        tx.$queryRaw<{ id: string; name: string; code: string | null }[]>`
          SELECT e.id::text, concat_ws(' ', coalesce(e.preferred_name, e.given_name), e.family_name) AS name, m.employee_code::text AS code
          FROM employees e JOIN employments m ON m.organization_id = e.organization_id AND m.employee_id = e.id AND m.exited_on IS NULL
          WHERE e.organization_id = ${org}::uuid ORDER BY 2 LIMIT 1000`,
        tx.user.findMany({ where: { organizationId: org, status: 'active' }, orderBy: { name: 'asc' }, select: { id: true, name: true, email: true }, take: 500 }),
        tx.leaveType.findMany({ where: { organizationId: org, kind: 'comp_off', active: true }, select: { id: true } }),
      ]);
      const scopes = await this.setup.scopeNames(tx, org, [...assignments, ...otRules].map((a) => ({ type: a.scopeType, id: a.scopeId })));
      const scopeName = (t: string, id: string) => (t === 'tenant' ? 'Whole company' : (scopes.get(id) ?? ''));
      const names = new Map(people.map((p) => [p.id, p.name]));
      const locName = new Map(locations.map((l) => [l.id, l.name]));
      const night = await Promise.all(
        locations.map(async (l) => {
          const osh = await oshOn(tx, l.state, today);
          return {
            locationId: l.id,
            name: l.name,
            window: osh.nightWindow,
            items: osh.safeguards.map((s) => {
              const a = safeguards.find((x) => x.locationId === l.id && x.item === s.item && dateOf(x.attestedOn) <= today);
              return { item: s.item, label: s.label, attestedOn: a ? dateOf(a.attestedOn) : null, reviewDue: a ? dateOf(a.reviewDue) : null, note: a?.note ?? null, ok: Boolean(a && dateOf(a.reviewDue) >= today) };
            }),
          };
        }),
      );
      return {
        today,
        shifts: [...book.shifts.values()]
          .sort((a, b) => a.code.localeCompare(b.code))
          .map((s) => ({ id: s.id, code: s.code, name: s.name, colour: s.colour, night: s.night, active: s.active, versions: s.versions.map(({ from, v }) => ({ validFrom: from, start: v.startMinute, end: v.endMinute, graceMinutes: v.graceMinutes, halfDayMinutes: v.halfDayMinutes, fullDayMinutes: v.fullDayMinutes, breakMinutes: v.breakMinutes, breakAboveMinutes: v.breakAboveMinutes })) })),
        patterns: patterns.map((p) => ({
          id: p.id,
          name: p.name,
          kind: p.kind,
          cycle: p.cycle,
          active: p.active,
          assignments: assignments.filter((a) => a.patternId === p.id).map((a) => ({ id: a.id, scopeType: a.scopeType, scopeId: a.scopeId, scopeName: scopeName(a.scopeType, a.scopeId), validFrom: dateOf(a.validFrom), offsetDays: a.offsetDays, removable: dateOf(a.validFrom) > today })),
        })),
        otRules: otRules.map((r) => ({ id: r.id, name: r.name, scopeType: r.scopeType, scopeId: r.scopeId, scopeName: scopeName(r.scopeType, r.scopeId), validFrom: dateOf(r.validFrom), minMinutes: r.minMinutes, roundMinutes: r.roundMinutes, dailyCapMinutes: r.dailyCapMinutes, rateNormal: Number(r.rateNormal), rateWeeklyOff: Number(r.rateWeeklyOff), rateHoliday: Number(r.rateHoliday), needsApproval: r.needsApproval, settle: r.settle, compOffHalfMinutes: r.compOffHalfMinutes, compOffFullMinutes: r.compOffFullMinutes, removable: dateOf(r.validFrom) > today })),
        projects: projects.map((p) => ({ id: p.id, code: p.code, name: p.name, managerUserId: p.managerUserId, managerName: users.find((u) => u.id === p.managerUserId)?.name ?? null, billable: p.billable, activities: p.activities, active: p.active })),
        night: { locations: night, consents: consents.map((x) => ({ id: x.id, employeeId: x.employeeId, name: names.get(x.employeeId) ?? '', locationId: x.locationId, location: locName.get(x.locationId) ?? '', givenOn: dateOf(x.givenOn), withdrawnOn: x.withdrawnOn ? dateOf(x.withdrawnOn) : null, reference: x.reference })) },
        hasCompOffType: types.length > 0,
        locations,
        departments,
        entities,
        people,
        users: users.map((u) => ({ id: u.id, name: u.name || u.email })),
      };
    });
  }

  private checkTimes(dto: ShiftTimesDto) {
    if (dto.start === dto.end) throw new BadRequestException('A shift ends at a different time from when it starts.');
    if (dto.halfDayMinutes > dto.fullDayMinutes) throw new BadRequestException('A half day needs fewer minutes than a full day.');
    if (dto.validFrom < todayIst()) throw new BadRequestException('Shift times start today or later; what is already in force stays as it was.');
  }

  private times(dto: ShiftTimesDto) {
    return { validFrom: asDate(dto.validFrom), startMinute: dto.start, endMinute: dto.end, graceMinutes: dto.graceMinutes, halfDayMinutes: dto.halfDayMinutes, fullDayMinutes: dto.fullDayMinutes, breakMinutes: dto.breakMinutes, breakAboveMinutes: dto.breakAboveMinutes };
  }

  createShift(ctx: TenantContext, user: ScopeUser, dto: ShiftDto) {
    return this.setup.run(ctx, user, true, async (tx, c) => {
      this.checkTimes(dto);
      if (await tx.shift.findFirst({ where: { organizationId: c.organizationId, code: dto.code } })) throw new ConflictException(`The code ${dto.code} is already used.`);
      const s = await tx.shift.create({ data: { organizationId: c.organizationId, code: dto.code, name: dto.name, colour: dto.colour, night: dto.night, createdBy: c.userId ?? null } });
      await tx.shiftVersion.create({ data: { organizationId: c.organizationId, shiftId: s.id, ...this.times(dto), createdBy: c.userId ?? null } });
      await audit(tx, c, 'time.shift.created', 'shift', s.id, { code: dto.code, name: dto.name, start: hhmm(dto.start), end: hhmm(dto.end), validFrom: dto.validFrom });
      return { id: s.id };
    });
  }

  /** New times from a date (P06): a version in force never changes. */
  addShiftVersion(ctx: TenantContext, user: ScopeUser, id: string, dto: ShiftTimesDto) {
    return this.setup.run(ctx, user, true, async (tx, c) => {
      this.checkTimes(dto);
      const s = await tx.shift.findFirst({ where: { organizationId: c.organizationId, id } });
      if (!s) throw new NotFoundException('No such shift.');
      if (await tx.shiftVersion.findFirst({ where: { organizationId: c.organizationId, shiftId: id, validFrom: asDate(dto.validFrom) } })) throw new ConflictException('This shift already changes on that date. Choose another date.');
      await tx.shiftVersion.create({ data: { organizationId: c.organizationId, shiftId: id, ...this.times(dto), createdBy: c.userId ?? null } });
      await audit(tx, c, 'time.shift.version_added', 'shift', id, { code: s.code, validFrom: dto.validFrom, start: hhmm(dto.start), end: hhmm(dto.end), graceMinutes: dto.graceMinutes, breakMinutes: dto.breakMinutes });
      return { id };
    });
  }

  updateShift(ctx: TenantContext, user: ScopeUser, id: string, dto: ShiftDetailsDto) {
    return this.setup.run(ctx, user, true, async (tx, c) => {
      const s = await tx.shift.findFirst({ where: { organizationId: c.organizationId, id } });
      if (!s) throw new NotFoundException('No such shift.');
      await tx.shift.update({ where: { id }, data: { name: dto.name, colour: dto.colour, night: dto.night, active: dto.active, version: { increment: 1 }, updatedAt: new Date() } });
      await audit(tx, c, 'time.shift.changed', 'shift', id, { from: { name: s.name, colour: s.colour, night: s.night, active: s.active }, to: dto });
      return { id };
    });
  }

  createPattern(ctx: TenantContext, user: ScopeUser, dto: PatternDto) {
    return this.setup.run(ctx, user, true, async (tx, c) => {
      if (dto.kind === 'weekly' && dto.cycle.length !== 7) throw new BadRequestException('A weekly pattern has 7 days, Monday to Sunday.');
      if (dto.cycle.length < 1 || dto.cycle.length > 56) throw new BadRequestException('A cycle has 1 to 56 days.');
      const ids = new Set((await tx.shift.findMany({ where: { organizationId: c.organizationId, active: true }, select: { id: true } })).map((s) => s.id));
      if (dto.cycle.some((x) => x !== null && (typeof x !== 'string' || !ids.has(x)))) throw new BadRequestException('Each day is a shift of this company in use, or a weekly off.');
      if (dto.cycle.every((x) => x === null)) throw new BadRequestException('A pattern needs at least one working day.');
      const p = await tx.shiftPattern.create({ data: { organizationId: c.organizationId, name: dto.name, kind: dto.kind, cycle: dto.cycle as Prisma.InputJsonValue, createdBy: c.userId ?? null } });
      await audit(tx, c, 'time.pattern.created', 'shift_pattern', p.id, { name: dto.name, kind: dto.kind, cycle: dto.cycle });
      return { id: p.id };
    });
  }

  setPatternActive(ctx: TenantContext, user: ScopeUser, id: string, active: boolean) {
    return this.setup.run(ctx, user, true, async (tx, c) => {
      const p = await tx.shiftPattern.findFirst({ where: { organizationId: c.organizationId, id } });
      if (!p) throw new NotFoundException('No such pattern.');
      await tx.shiftPattern.update({ where: { id }, data: { active, updatedAt: new Date() } });
      await audit(tx, c, 'time.pattern.changed', 'shift_pattern', id, { active });
      return { id };
    });
  }

  /** Q2: a pattern for a scope from a date (YX-ORG-18 precedence), checked against the night-work guard first. */
  assignPattern(ctx: TenantContext, user: ScopeUser, patternId: string, dto: PatternAssignDto) {
    return this.setup.run(ctx, user, true, async (tx, c) => {
      const org = c.organizationId;
      const p = await tx.shiftPattern.findFirst({ where: { organizationId: org, id: patternId, active: true } });
      if (!p) throw new NotFoundException('No such pattern in use.');
      if (dto.validFrom < todayIst()) throw new BadRequestException('A pattern applies from today or later.');
      if (dto.scopeType === 'tenant' && dto.scopeId) throw new BadRequestException('A company-wide pattern has no scope id.');
      if (dto.scopeType !== 'tenant' && !dto.scopeId) throw new BadRequestException('Say who the pattern is for.');
      const scopeId = dto.scopeType === 'tenant' ? org : dto.scopeId!;
      const model = SCOPE_MODEL[dto.scopeType];
      if (model && !(await (tx[model] as unknown as { findFirst(a: unknown): Promise<unknown> }).findFirst({ where: { organizationId: org, id: scopeId } }))) throw new NotFoundException(`No such ${dto.scopeType.replace('_', ' ')} in this company.`);
      const at = { organizationId: org, scopeType: dto.scopeType, scopeId, validFrom: asDate(dto.validFrom) };
      const existing = await tx.shiftPatternAssignment.findFirst({ where: at });
      if (existing && dto.validFrom <= todayIst()) throw new ConflictException('A pattern is already in force there from that date. Add the change from a later date.');
      if (existing) await tx.shiftPatternAssignment.delete({ where: { id: existing.id } });
      const a = await tx.shiftPatternAssignment.create({ data: { ...at, patternId, offsetDays: dto.offsetDays, createdBy: c.userId ?? null } });
      // YX-AT-25: the pattern is a roster path; the people it now reaches are checked over its first four weeks.
      const book = await ScheduleBook.load(tx, org);
      const people = await this.peopleIn(tx, org, dto.scopeType, scopeId, dto.validFrom);
      for (const e of people) {
        for (let k = 0; k < 28; k++) {
          const on = addDays(dto.validFrom, k);
          const f = await factsOn(tx, org, e, on);
          if (!f || book.patternOn(f, on)?.patternId !== patternId) continue;
          const reason = await nightGuard(tx, org, f, on, (await book.day(f, on, false)).shift);
          if (reason) throw new ConflictException({ statusCode: 409, code: 'NIGHT_GUARD', message: `${reason} (${fmt(on)}). The pattern was not applied.` });
        }
      }
      await audit(tx, c, 'time.pattern.assigned', 'shift_pattern', patternId, { scopeType: dto.scopeType, scopeId, validFrom: dto.validFrom, offsetDays: dto.offsetDays, replaced: existing?.patternId ?? null });
      return { id: a.id };
    });
  }

  private async peopleIn(tx: Tx, org: string, scopeType: string, scopeId: string, on: string): Promise<string[]> {
    const col = { employee: 'employee_id', department: 'department_id', location: 'location_id', legal_entity: 'legal_entity_id' }[scopeType];
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT DISTINCT a.employee_id::text AS id FROM employee_assignments a
      WHERE a.organization_id = ${org}::uuid AND a.superseded_at IS NULL AND daterange(a.valid_from, a.valid_to, '[]') && daterange(${on}::date, ${addDays(on, 27)}::date, '[]')
        AND ${col ? Prisma.sql`${Prisma.raw(`a.${col}`)} = ${scopeId}::uuid` : Prisma.sql`TRUE`}
      LIMIT 2000`;
    return rows.map((r) => r.id);
  }

  removePatternAssignment(ctx: TenantContext, user: ScopeUser, id: string) {
    return this.setup.run(ctx, user, true, async (tx, c) => {
      const a = await tx.shiftPatternAssignment.findFirst({ where: { organizationId: c.organizationId, id } });
      if (!a) throw new NotFoundException('Not found');
      if (dateOf(a.validFrom) <= todayIst()) throw new ConflictException('That pattern is already in force. Add a new one from a later date instead.');
      await tx.shiftPatternAssignment.delete({ where: { id } });
      await audit(tx, c, 'time.pattern.unassigned', 'shift_pattern', a.patternId, { scopeType: a.scopeType, scopeId: a.scopeId, validFrom: dateOf(a.validFrom) });
    });
  }

  // ------------------------------------------------------------------------------------------ night work (YX-AT-25 / 26)

  addConsent(ctx: TenantContext, user: ScopeUser, dto: ConsentDto) {
    return this.setup.run(ctx, user, true, async (tx, c) => {
      const org = c.organizationId;
      if (!(await tx.employee.findFirst({ where: { organizationId: org, id: dto.employeeId } }))) throw new NotFoundException('No such person.');
      if (!(await tx.location.findFirst({ where: { organizationId: org, id: dto.locationId } }))) throw new NotFoundException('No such location.');
      const x = await tx.nightWorkConsent.create({ data: { organizationId: org, employeeId: dto.employeeId, locationId: dto.locationId, givenOn: asDate(dto.givenOn), reference: dto.reference, recordedBy: c.userId ?? null } });
      await audit(tx, c, 'time.night_consent.recorded', 'night_work_consent', x.id, { employeeId: dto.employeeId, locationId: dto.locationId, givenOn: dto.givenOn });
      return { id: x.id };
    });
  }

  /** A withdrawal applies from its date; it is never a ground for any adverse action (YX-AT-25). */
  withdrawConsent(ctx: TenantContext, user: ScopeUser, id: string, on: string) {
    return this.setup.run(ctx, user, true, async (tx, c) => {
      const x = await tx.nightWorkConsent.findFirst({ where: { organizationId: c.organizationId, id } });
      if (!x) throw new NotFoundException('Not found');
      if (x.withdrawnOn) throw new ConflictException('That consent is already withdrawn.');
      if (on < dateOf(x.givenOn)) throw new BadRequestException('A withdrawal is on or after the day the consent was given.');
      await tx.nightWorkConsent.update({ where: { id }, data: { withdrawnOn: asDate(on) } });
      await audit(tx, c, 'time.night_consent.withdrawn', 'night_work_consent', id, { employeeId: x.employeeId, on });
      return { id };
    });
  }

  attestSafeguard(ctx: TenantContext, user: ScopeUser, dto: SafeguardDto) {
    return this.setup.run(ctx, user, true, async (tx, c) => {
      const l = await tx.location.findFirst({ where: { organizationId: c.organizationId, id: dto.locationId } });
      if (!l) throw new NotFoundException('No such location.');
      const osh = await oshOn(tx, l.state, dto.attestedOn);
      if (!osh.safeguards.some((s) => s.item === dto.item)) throw new BadRequestException('Choose a safeguard on the checklist.');
      if (dto.reviewDue <= dto.attestedOn) throw new BadRequestException('The review date is after the date it was checked.');
      if (dto.attestedOn > todayIst()) throw new BadRequestException('A safeguard is attested once it has been checked, today or earlier.');
      const a = await tx.nightWorkSafeguard.create({ data: { organizationId: c.organizationId, locationId: l.id, item: dto.item, attestedOn: asDate(dto.attestedOn), reviewDue: asDate(dto.reviewDue), note: dto.note, attestedBy: c.userId ?? null } });
      await audit(tx, c, 'time.night_safeguard.attested', 'location', l.id, { item: dto.item, attestedOn: dto.attestedOn, reviewDue: dto.reviewDue });
      return { id: a.id };
    });
  }

  // ------------------------------------------------------------------------------------------ the roster planner (YX-AT-07)

  /** Planning reach: a manager's own team (implicit) or roster.manage in scope; never one's own roster. */
  private async mustPlan(tx: Tx, c: CompanyContext, v: Viewer, own: string | null, employeeId: string, on: string) {
    const rel = await mustSee(tx, c, v, own, 'roster.manage', employeeId, on);
    if (rel === 'self') throw new ForbiddenException('Your own shifts are planned by your manager or HR.');
  }

  /** The week (or two) for everyone the viewer plans, with published and draft values and conflicts. */
  async roster(ctx: TenantContext, user: ScopeUser, weekIn: string, span = 7) {
    const v = await this.viewer(user);
    const week = mondayOf(weekIn);
    const to = addDays(week, span - 1);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const own = await this.ownId(tx, c, v);
      const people = await tx.$queryRaw<{ id: string; name: string; code: string | null }[]>`
        SELECT e.id::text, concat_ws(' ', coalesce(e.preferred_name, e.given_name), e.family_name) AS name, m.employee_code::text AS code
        FROM employees e
        JOIN employee_assignments a ON a.organization_id = e.organization_id AND a.employee_id = e.id AND a.superseded_at IS NULL AND daterange(a.valid_from, a.valid_to, '[]') && daterange(${week}::date, ${to}::date, '[]')
        JOIN employments m ON m.organization_id = e.organization_id AND m.id = a.employment_id AND (m.exited_on IS NULL OR m.exited_on >= ${week}::date)
        WHERE e.organization_id = ${org}::uuid AND (${own}::uuid IS NULL OR e.id <> ${own}::uuid) AND ${await visibleSql(tx, c, v, own, 'roster.manage', Prisma.sql`e.id`, week)}
        GROUP BY 1, 2, 3 ORDER BY 2 LIMIT 200`;
      const book = await ScheduleBook.load(tx, org);
      const ids = people.map((p) => p.id);
      await book.prime(ids, addDays(week, -1), to);
      // From the day before the week: its draft decides the rest before the first day.
      const entries = ids.length ? await tx.rosterEntry.findMany({ where: { organizationId: org, employeeId: { in: ids }, workOn: { gte: asDate(addDays(week, -1)), lte: asDate(to) } } }) : [];
      const today = todayIst();
      const rows = [];
      for (const p of people) {
        const leave = await leaveDays(tx, org, p.id, week, to, ['pending', 'approved', 'cancel_pending']);
        const locked = await lockedDates(tx, org, p.id, week, to);
        const cells = [];
        const planned: { on: string; shift: ShiftTimes | null }[] = [];
        let holidays = new Map<string, { name: string }>();
        let f0: Facts | null = null;
        for (let k = -1; k < span; k++) {
          const on = addDays(week, k);
          const f = await factsOn(tx, org, p.id, on);
          if (!f) {
            if (k >= 0) cells.push({ on, employed: false });
            continue;
          }
          if (!f0) {
            f0 = f;
            holidays = (await holidaysFor(tx, org, f.locationId, week, to, p.id)).map;
          }
          const e = entries.find((x) => x.employeeId === p.id && dateOf(x.workOn) === on);
          const effective = await book.day(f, on);
          const base = await book.day(f, on, false);
          const draft = e?.draft ?? null;
          const plan = draft === null ? effective : draft === 'off' ? { shift: null, weeklyOff: true, source: 'roster' as const } : draft === 'pattern' ? base : { shift: book.shiftOn(draft, on), weeklyOff: false, source: 'roster' as const };
          planned.push({ on, shift: plan.shift });
          if (k < 0) continue;
          const conflicts: Conflict[] = [];
          if (plan.shift && leave.get(on)) conflicts.push({ on, kind: 'leave', message: leave.get(on) === 'full' ? 'On leave' : 'Half day on leave' });
          if (plan.shift && holidays.get(on)) conflicts.push({ on, kind: 'holiday', message: `Holiday: ${holidays.get(on)!.name}` });
          const night = await nightGuard(tx, org, f, on, plan.shift);
          if (night) conflicts.push({ on, kind: 'night', message: night });
          cells.push({
            on,
            employed: true,
            locked: locked.has(on),
            past: on < today,
            published: e?.published ? (e.isOff ? 'off' : e.shiftId) : null,
            draft,
            source: effective.source,
            effective: effective.shift ? { shiftId: effective.shift.shiftId, name: effective.shift.name, start: effective.shift.shiftStart, end: effective.shift.shiftEnd } : null,
            planned: plan.shift ? { shiftId: plan.shift.shiftId, name: plan.shift.name, start: plan.shift.shiftStart, end: plan.shift.shiftEnd } : null,
            conflicts,
          });
        }
        const minRest = f0 ? Number(await settingOn(tx, c, 'attendance.min_rest_hours', f0, week)) * 60 : 660;
        for (const r of restConflicts(planned, minRest)) (cells.find((x) => x.on === r.on) as { conflicts?: Conflict[] } | undefined)?.conflicts?.push(r);
        rows.push({ id: p.id, name: p.name, code: p.code, cells });
      }
      return {
        week,
        to,
        today,
        scope: tenantWide(v, 'roster.manage') ? 'company' : has(v, 'roster.manage') ? 'granted' : 'team',
        shifts: [...book.shifts.values()].filter((s) => s.active).map((s) => {
          const t = book.shiftOn(s.id, week) ?? book.shiftOn(s.id, to);
          return { id: s.id, code: s.code, name: s.name, colour: s.colour, night: s.night, start: t?.shiftStart ?? null, end: t?.shiftEnd ?? null };
        }),
        drafts: entries.filter((e) => e.draft !== null && dateOf(e.workOn) >= week).length,
        people: rows,
      };
    });
  }

  /** Planner edits as drafts (today or later, open periods); a law-guard refusal stops the whole save. */
  async setCells(ctx: TenantContext, user: ScopeUser, cells: RosterCellDto[]) {
    const v = await this.viewer(user);
    if (v.actingForOther) throw new ForbiddenException('Not available while acting for someone else.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const own = await this.ownId(tx, c, v);
      const today = todayIst();
      const book = await ScheduleBook.load(tx, org);
      const shiftIds = new Set([...book.shifts.values()].filter((s) => s.active).map((s) => s.id));
      for (const cell of cells) {
        if (cell.on < today) throw new BadRequestException('The roster can change from today on. Past days are fixed through attendance requests.');
        if (cell.on > addDays(today, 120)) throw new BadRequestException('Plan up to 120 days ahead.');
        await this.mustPlan(tx, c, v, own, cell.employeeId, cell.on);
        await assertOpen(tx, org, cell.employeeId, cell.on);
        const f = await factsOn(tx, org, cell.employeeId, cell.on);
        if (!f) throw new BadRequestException(`That person is not working here on ${fmt(cell.on)}.`);
        if (UUID.test(cell.value)) {
          if (!shiftIds.has(cell.value)) throw new BadRequestException('Choose a shift in use.');
          const reason = await nightGuard(tx, org, f, cell.on, book.shiftOn(cell.value, cell.on));
          if (reason) throw new ConflictException({ statusCode: 409, code: 'NIGHT_GUARD', message: `${reason} (${fmt(cell.on)}).` });
        }
        const key = { organizationId_employeeId_workOn: { organizationId: org, employeeId: cell.employeeId, workOn: asDate(cell.on) } };
        const row = await tx.rosterEntry.findUnique({ where: key });
        // Back to the pattern with nothing published: no row is needed.
        if (cell.value === 'pattern' && (!row || !row.published)) {
          if (row) await tx.rosterEntry.delete({ where: key });
          continue;
        }
        await tx.rosterEntry.upsert({ where: key, create: { organizationId: org, employeeId: cell.employeeId, workOn: asDate(cell.on), draft: cell.value, updatedBy: c.userId ?? null }, update: { draft: cell.value, updatedBy: c.userId ?? null, updatedAt: new Date() } });
      }
      await audit(tx, c, 'time.roster.drafted', 'roster', org, { cells: cells.length });
      return { saved: cells.length };
    });
  }

  /** Copies last week's plan into a week as drafts (leave and holidays then show as conflicts). */
  async copyWeek(ctx: TenantContext, user: ScopeUser, fromWeek: string, toWeek: string) {
    const from = mondayOf(fromWeek);
    const to = mondayOf(toWeek);
    if (from === to) throw new BadRequestException('Choose two different weeks.');
    const plan = await this.roster(ctx, user, from);
    const today = todayIst();
    const cells: RosterCellDto[] = [];
    for (const p of plan.people)
      for (const [k, cell] of (p.cells as { on: string; employed: boolean; planned?: { shiftId: string | null } | null }[]).entries()) {
        const on = addDays(to, k);
        if (!cell.employed || on < today) continue;
        cells.push({ employeeId: p.id, on, value: cell.planned ? (cell.planned.shiftId ?? 'pattern') : 'off' });
      }
    return cells.length ? this.setCells(ctx, user, cells) : { saved: 0 };
  }

  /** Publishes the viewer's drafts in a range (YX-AT-07): checked again, then in force, then the people are told. */
  async publish(ctx: TenantContext, user: ScopeUser, weekIn: string, span = 14) {
    const v = await this.viewer(user);
    if (v.actingForOther) throw new ForbiddenException('Not available while acting for someone else.');
    const week = mondayOf(weekIn);
    const to = addDays(week, span - 1);
    const told = new Set<string>();
    const res = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const own = await this.ownId(tx, c, v);
      const book = await ScheduleBook.load(tx, org);
      const drafts = await tx.rosterEntry.findMany({ where: { organizationId: org, draft: { not: null }, workOn: { gte: asDate(week), lte: asDate(to) } } });
      const today = todayIst();
      let n = 0;
      for (const e of drafts) {
        const on = dateOf(e.workOn);
        // Only the viewer's own reach is published; other planners' drafts stay theirs.
        try {
          await this.mustPlan(tx, c, v, own, e.employeeId, on);
        } catch {
          continue;
        }
        if (on < today) continue;
        await assertOpen(tx, org, e.employeeId, on);
        const key = { organizationId_employeeId_workOn: { organizationId: org, employeeId: e.employeeId, workOn: e.workOn } };
        if (e.draft === 'pattern') await tx.rosterEntry.delete({ where: key });
        else {
          const shiftId = e.draft === 'off' ? null : e.draft;
          if (shiftId) {
            const f = await factsOn(tx, org, e.employeeId, on);
            const reason = f ? await nightGuard(tx, org, f, on, book.shiftOn(shiftId, on)) : null;
            if (reason) throw new ConflictException({ statusCode: 409, code: 'NIGHT_GUARD', message: `${reason} (${fmt(on)}). Nothing was published.` });
          }
          await tx.rosterEntry.update({ where: key, data: { shiftId, isOff: shiftId === null, published: true, draft: null, source: 'manual', publishedAt: new Date(), publishedBy: c.userId ?? null, updatedAt: new Date() } });
        }
        told.add(e.employeeId);
        n++;
        if (on === today) await this.days.evaluate(tx, c, e.employeeId, on, on);
      }
      await audit(tx, c, 'time.roster.published', 'roster', org, { from: week, to, entries: n, people: told.size });
      const users = told.size ? (await tx.employee.findMany({ where: { organizationId: org, id: { in: [...told] } }, select: { userId: true } })).map((u) => u.userId).filter((x): x is string => Boolean(x)) : [];
      return { published: n, people: told.size, users };
    });
    // P04: the people whose shifts changed are told (after commit).
    if (res.users.length)
      await this.notifications
        .notifySystem(ctx, res.users, 'time.roster.published', { entityType: 'roster', entityId: ctx.organizationId as string, contextText: `Your shifts from ${fmt(week)} were published or changed`, linkPath: '/yx/time/roster' }, { subject: 'Your shifts were published', html: `<p>Your shifts from ${fmt(week)} were published or changed. Open YukthiX to see them.</p>` })
        .catch(() => undefined);
    return { published: res.published, people: res.people };
  }

  // ------------------------------------------------------------------------------------------ me: shifts and swaps

  /** My shifts for two weeks, teammates I could swap with, and my swap requests. */
  async mine(ctx: TenantContext, weekIn: string) {
    const week = mondayOf(weekIn);
    const to = addDays(week, 13);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const me = await myEmployeeId(tx, org, c.userId);
      const book = await ScheduleBook.load(tx, org);
      await book.prime([me], week, to);
      const days = [];
      for (let on = week; on <= to; on = addDays(on, 1)) {
        const f = await factsOn(tx, org, me, on);
        const d = f ? await book.day(f, on) : null;
        days.push({ on, shift: d?.shift ? { shiftId: d.shift.shiftId, name: d.shift.name, start: d.shift.shiftStart, end: d.shift.shiftEnd } : null, off: Boolean(d?.weeklyOff), employed: Boolean(f) });
      }
      const f = await factsOn(tx, org, me, todayIst());
      const mates = f?.managerEmployeeId
        ? await tx.$queryRaw<{ id: string; name: string }[]>`
            SELECT e.id::text, concat_ws(' ', coalesce(e.preferred_name, e.given_name), e.family_name) AS name FROM employees e
            JOIN employee_assignments a ON a.organization_id = e.organization_id AND a.employee_id = e.id AND a.superseded_at IS NULL AND ${todayIst()}::date <@ daterange(a.valid_from, a.valid_to, '[]')
            WHERE e.organization_id = ${org}::uuid AND a.manager_employee_id = ${f.managerEmployeeId}::uuid AND e.id <> ${me}::uuid ORDER BY 2 LIMIT 100`
        : [];
      const swaps = await tx.shiftSwapRequest.findMany({ where: { organizationId: org, OR: [{ employeeId: me }, { colleagueEmployeeId: me }] }, orderBy: { createdAt: 'desc' }, take: 30 });
      const names = new Map(mates.map((m) => [m.id, m.name]));
      return {
        week,
        days,
        colleagues: mates,
        swaps: swaps.map((s) => ({ id: s.id, on: dateOf(s.workOn), mine: s.employeeId === me, with: names.get(s.employeeId === me ? s.colleagueEmployeeId : s.employeeId) ?? 'A colleague', status: s.status, reason: s.employeeId === me ? s.reason : null })),
      };
    });
  }

  /** A swap of one day with a teammate (§B4): the colleague agrees, then the manager approves (P03). */
  async requestSwap(ctx: TenantContext, user: ScopeUser, dto: SwapDto) {
    if (user.impersonatorUserId || user.actingSuperAdmin) throw new ForbiddenException('Not available while acting for someone else.');
    const notices: Notice[] = [];
    const res = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const me = await myEmployeeId(tx, org, c.userId);
      if (dto.on < todayIst()) throw new BadRequestException('Swap a day that has not passed.');
      await assertOpen(tx, org, me, dto.on);
      const [mine, theirs] = await Promise.all([factsOn(tx, org, me, dto.on), factsOn(tx, org, dto.colleagueEmployeeId, dto.on)]);
      // Only a teammate (same manager): anyone else is "not found".
      if (!mine || !theirs || !mine.managerEmployeeId || mine.managerEmployeeId !== theirs.managerEmployeeId || theirs.employeeId === me) throw new NotFoundException('Choose a teammate who works for the same manager.');
      if (!theirs.userId) throw new BadRequestException(`${theirs.name} has no YukthiX login to agree to the swap. Ask your manager to change the roster.`);
      const book = await ScheduleBook.load(tx, org);
      const [a, b] = [await book.day(mine, dto.on), await book.day(theirs, dto.on)];
      if ((a.shift?.shiftId ?? null) === (b.shift?.shiftId ?? null) && Boolean(a.shift) === Boolean(b.shift)) throw new BadRequestException('You both have the same shift that day. Nothing to swap.');
      for (const [f, s] of [[mine, b.shift], [theirs, a.shift]] as const) {
        const reason = await nightGuard(tx, org, f, dto.on, s);
        if (reason) throw new ConflictException({ statusCode: 409, code: 'NIGHT_GUARD', message: `${reason}. This swap can't be made.` });
      }
      if (await tx.shiftSwapRequest.findFirst({ where: { organizationId: org, workOn: asDate(dto.on), status: 'pending', OR: [{ employeeId: me }, { colleagueEmployeeId: me }] } })) throw new ConflictException('A swap for that day is already waiting.');
      const r = await tx.shiftSwapRequest.create({ data: { organizationId: org, employeeId: me, colleagueEmployeeId: theirs.employeeId, workOn: asDate(dto.on), myShiftId: a.shift?.shiftId ?? null, theirShiftId: b.shift?.shiftId ?? null, reason: dto.reason, raisedBy: c.userId ?? null } });
      const label = (s: ShiftTimes | null) => (s ? `${s.name} ${hhmm(s.shiftStart)}–${hhmm(s.shiftEnd)}` : 'Weekly off');
      const hr = await hrApprovers(tx, org, me, todayIst(), mine.userId);
      const sub = await this.engine.submit(tx, c, {
        type: SHIFT_SWAP,
        subjectType: 'shift_swap',
        subjectId: r.id,
        title: `${mine.name} and ${theirs.name}: swap shifts on ${fmt(dto.on)}`,
        summary: [
          { label: 'Day', value: fmt(dto.on) },
          { label: mine.name, value: `${label(a.shift)} → ${label(b.shift)}` },
          { label: theirs.name, value: `${label(b.shift)} → ${label(a.shift)}` },
          { label: 'Why', value: dto.reason.slice(0, 300) },
        ],
        subjectPersonId: mine.personId,
        requesterUserId: c.userId ?? null,
        raisedByUserId: c.userId ?? null,
        steps: [
          { name: 'Colleague agrees', approvers: [{ kind: 'users', userIds: [theirs.userId] }], mode: 'any', remindAfterHours: 12 },
          { name: 'Manager', approvers: [{ kind: 'manager' }], mode: 'any', remindAfterHours: 24 },
        ],
        payload: {},
        payloadFields: [],
        fallbackUserIds: hr,
      });
      notices.push(...sub.notices);
      await tx.shiftSwapRequest.update({ where: { id: r.id }, data: { wfRequestId: sub.id } });
      await audit(tx, c, 'time.swap.requested', 'shift_swap', r.id, { on: dto.on, colleague: theirs.employeeId });
      return { id: r.id, status: 'pending' };
    });
    await this.engine.send(ctx, notices);
    return res;
  }

  async withdrawSwap(ctx: TenantContext, user: ScopeUser, id: string) {
    if (user.impersonatorUserId || user.actingSuperAdmin) throw new ForbiddenException('Not available while acting for someone else.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const me = await myEmployeeId(tx, c.organizationId, c.userId);
      const r = await tx.shiftSwapRequest.findFirst({ where: { organizationId: c.organizationId, id, employeeId: me } });
      if (!r) throw new NotFoundException('No such swap.');
      if (r.status !== 'pending') throw new ConflictException('Only a swap still waiting can be withdrawn.');
      if (r.wfRequestId) await this.engine.withdraw(tx, c, r.wfRequestId, c.userId ?? null, 'Withdrawn by the employee');
      await tx.shiftSwapRequest.update({ where: { id }, data: { status: 'withdrawn', decidedAt: new Date(), version: { increment: 1 }, updatedAt: new Date() } });
      return { id, status: 'withdrawn' };
    });
  }

  /** P03 effect, once: both days are written to the roster as published swap entries (checked again first). */
  private async swapDecided(tx: Tx, wf: Prisma.WfRequestGetPayload<object>, outcome: 'approved' | 'rejected') {
    const org = wf.organizationId;
    const r = await tx.shiftSwapRequest.findFirst({ where: { organizationId: org, id: wf.subjectId } });
    if (!r || r.status !== 'pending') return;
    const on = dateOf(r.workOn);
    if (outcome === 'approved') {
      const [a, b] = [await factsOn(tx, org, r.employeeId, on), await factsOn(tx, org, r.colleagueEmployeeId, on)];
      const book = await ScheduleBook.load(tx, org);
      for (const [f, sid] of [[a, r.theirShiftId], [b, r.myShiftId]] as const) {
        if (!f) continue;
        const reason = await nightGuard(tx, org, f, on, sid ? book.shiftOn(sid, on) : null);
        if (reason) throw new ConflictException({ statusCode: 409, code: 'NIGHT_GUARD', message: `${reason}. This swap can't be approved.` });
      }
      for (const [emp, sid] of [[r.employeeId, r.theirShiftId], [r.colleagueEmployeeId, r.myShiftId]] as const) {
        const key = { organizationId_employeeId_workOn: { organizationId: org, employeeId: emp, workOn: r.workOn } };
        const data = { shiftId: sid, isOff: sid === null, published: true, draft: null, source: 'swap', publishedAt: new Date(), updatedAt: new Date() };
        await tx.rosterEntry.upsert({ where: key, create: { organizationId: org, employeeId: emp, workOn: r.workOn, ...data }, update: data });
        if (on <= todayIst()) await this.days.evaluate(tx, { organizationId: org, isSuperAdmin: false }, emp, on, on);
      }
    }
    await tx.shiftSwapRequest.update({ where: { id: r.id }, data: { status: outcome, decidedAt: new Date(), version: { increment: 1 }, updatedAt: new Date() } });
  }
}
