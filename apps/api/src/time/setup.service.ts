import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { CompanyContext, Tx, audit, inCompany } from '../org-structure/org-structure.service';
import { buildViewer, tenantWide, type ScopeUser } from '../access/scope';
import { todayIst } from '../org-structure/org-validation';
import { AssignPolicyDto, AttendanceRuleDto, CalendarDto, HolidayDto, LeaveTypeDto, PolicyDto, PolicyVersionDto } from './dto';
import { LeaveService } from './leave.service';
import { DEFAULT_RULE, LeaveRules, asDate, dateOf, parseLines, parseRules } from './time-core';
import { WeeklyOffRule } from './time-maths';

// HR › Leave set-up (TIM-26 / 27 / 28) and the attendance basics of each location: company configuration, so the
// key must be held company-wide (a scoped holder is refused). Every change is audited; dated rows (policy versions,
// assignments, location rules) never change once in force (P06 YX-HIS-07): a later row supersedes them.

export const SCOPE_MODEL: Record<string, 'employee' | 'designation' | 'grade' | 'employmentType' | 'department' | 'location' | 'legalEntity' | null> = {
  employee: 'employee',
  designation: 'designation',
  grade: 'grade',
  employment_type: 'employmentType',
  department: 'department',
  location: 'location',
  legal_entity: 'legalEntity',
  tenant: null,
};

@Injectable()
export class TimeSetupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly leave: LeaveService,
  ) {}

  /** Set-up is company-wide configuration: the key must be held for the whole company, never acting for someone. */
  async run<T>(ctx: TenantContext, user: ScopeUser, write: boolean, fn: (tx: Tx, c: CompanyContext) => Promise<T>): Promise<T> {
    const v = await buildViewer(this.prisma, this.tenantPrisma, user, ['leave.settings.manage']);
    if (!tenantWide(v, 'leave.settings.manage') && !user.actingSuperAdmin) throw new ForbiddenException('Leave set-up applies to the whole company: it needs leave.settings.manage for the whole company.');
    if (write && v.actingForOther) throw new ForbiddenException('Not available while acting for someone else.');
    return inCompany(this.tenantPrisma, ctx, fn);
  }

  overview(ctx: TenantContext, user: ScopeUser) {
    return this.run(ctx, user, false, async (tx, c) => {
      const org = c.organizationId;
      const [types, policies, versions, assignments, calendars, holidays, locations, rules, statutory, entities] = await Promise.all([
        tx.leaveType.findMany({ where: { organizationId: org }, orderBy: [{ active: 'desc' }, { code: 'asc' }] }),
        tx.leavePolicy.findMany({ where: { organizationId: org }, orderBy: { name: 'asc' } }),
        tx.leavePolicyVersion.findMany({ where: { organizationId: org }, orderBy: { validFrom: 'desc' } }),
        tx.leavePolicyAssignment.findMany({ where: { organizationId: org }, orderBy: { validFrom: 'desc' } }),
        tx.holidayCalendar.findMany({ where: { organizationId: org }, orderBy: { name: 'asc' } }),
        tx.holiday.findMany({ where: { organizationId: org }, orderBy: { holidayOn: 'asc' } }),
        tx.location.findMany({ where: { organizationId: org, archivedAt: null }, orderBy: { name: 'asc' } }),
        tx.locationAttendanceRule.findMany({ where: { organizationId: org }, orderBy: { validFrom: 'desc' } }),
        tx.statutoryRuleSet.findMany({ where: { statute: 'IN.SE' }, orderBy: { jurisdiction: 'asc' } }),
        tx.legalEntity.findMany({ where: { organizationId: org, archivedAt: null }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
      ]);
      const scopeName = await this.scopeNames(tx, org, assignments.map((a) => ({ type: a.scopeType, id: a.scopeId })));
      const today = todayIst();
      return {
        today,
        types: types.map((t) => ({ id: t.id, code: t.code, name: t.name, kind: t.kind, paid: t.paid, colour: t.colour, active: t.active, rules: t.rules as unknown as LeaveRules, version: t.version })),
        policies: policies.map((p) => ({
          id: p.id,
          name: p.name,
          archived: Boolean(p.archivedAt),
          versions: versions.filter((v) => v.policyId === p.id).map((v) => ({ id: v.id, validFrom: dateOf(v.validFrom), lines: v.lines, note: v.note })),
          assignments: assignments.filter((a) => a.policyId === p.id).map((a) => ({ id: a.id, scopeType: a.scopeType, scopeId: a.scopeId, scopeName: a.scopeType === 'tenant' ? 'Whole company' : (scopeName.get(a.scopeId) ?? ''), validFrom: dateOf(a.validFrom), removable: dateOf(a.validFrom) > today })),
        })),
        calendars: calendars.map((cal) => ({
          id: cal.id,
          name: cal.name,
          locationId: cal.locationId,
          halfDayOpenHalf: cal.halfDayOpenHalf,
          optionalLimit: cal.optionalLimit,
          holidays: holidays.filter((h) => h.calendarId === cal.id).map((h) => ({ id: h.id, on: dateOf(h.holidayOn), name: h.name, kind: h.kind, halfDay: h.halfDay })),
        })),
        locations: locations.map((l) => {
          const mine = rules.filter((r) => r.locationId === l.id);
          const now = mine.find((r) => dateOf(r.validFrom) <= today);
          return {
            id: l.id,
            name: l.name,
            state: l.state,
            timezone: l.timezone,
            geofence: l.geoLat !== null && l.geoRadiusM ? { lat: Number(l.geoLat), lng: Number(l.geoLng), radiusM: l.geoRadiusM } : null,
            ipRanges: l.ipRanges,
            rule: now ? this.ruleView(now) : { ...DEFAULT_RULE, validFrom: null, starter: true },
            upcoming: mine.filter((r) => dateOf(r.validFrom) > today).map((r) => this.ruleView(r)),
          };
        }),
        entities,
        statutory: statutory.map((s) => ({ jurisdiction: s.jurisdiction, version: s.version, validFrom: dateOf(s.validFrom), values: s.values, source: s.source, verify: s.verify })),
      };
    });
  }

  private ruleView(r: Prisma.LocationAttendanceRuleGetPayload<object>) {
    return { validFrom: dateOf(r.validFrom), shiftName: r.shiftName, shiftStart: r.shiftStart, shiftEnd: r.shiftEnd, graceMinutes: r.graceMinutes, halfDayMinutes: r.halfDayMinutes, fullDayMinutes: r.fullDayMinutes, breakMinutes: r.breakMinutes, breakAboveMinutes: r.breakAboveMinutes, weeklyOffs: r.weeklyOffs, checkIn: r.checkIn, alsoAllowed: r.alsoAllowed, starter: false };
  }

  async scopeNames(tx: Tx, org: string, scopes: { type: string; id: string }[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    for (const s of scopes) {
      if (out.has(s.id) || s.type === 'tenant') continue;
      if (s.type === 'employee') {
        const e = await tx.employee.findFirst({ where: { organizationId: org, id: s.id }, select: { givenName: true, familyName: true } });
        out.set(s.id, e ? [e.givenName, e.familyName].filter(Boolean).join(' ') : '');
        continue;
      }
      const model = SCOPE_MODEL[s.type];
      const row = model ? await (tx[model] as unknown as { findFirst(a: unknown): Promise<{ name: string } | null> }).findFirst({ where: { organizationId: org, id: s.id }, select: { name: true } }) : null;
      out.set(s.id, row?.name ?? '');
    }
    return out;
  }

  // ------------------------------------------------------------------------------------------ leave types (TIM-27)

  createType(ctx: TenantContext, user: ScopeUser, dto: LeaveTypeDto) {
    return this.run(ctx, user, true, async (tx, c) => {
      const rules = this.checkType(dto);
      if (await tx.leaveType.findFirst({ where: { organizationId: c.organizationId, code: dto.code } })) throw new ConflictException(`The code ${dto.code} is already used.`);
      const t = await tx.leaveType.create({ data: { organizationId: c.organizationId, code: dto.code, name: dto.name, kind: dto.kind, paid: dto.paid, colour: dto.colour ?? 'blue', rules: rules as unknown as Prisma.InputJsonValue, active: dto.active ?? true, createdBy: c.userId ?? null } });
      await audit(tx, c, 'leave.type.created', 'leave_type', t.id, { code: t.code, kind: t.kind, rules });
      return { id: t.id };
    });
  }

  updateType(ctx: TenantContext, user: ScopeUser, id: string, dto: LeaveTypeDto) {
    return this.run(ctx, user, true, async (tx, c) => {
      const t = await tx.leaveType.findFirst({ where: { organizationId: c.organizationId, id } });
      if (!t) throw new NotFoundException('No such leave type.');
      if (dto.code !== t.code) throw new BadRequestException('A leave type keeps its code. Add a new type instead.');
      if (dto.kind !== t.kind) throw new BadRequestException('A leave type keeps its kind. Add a new type instead.');
      const rules = this.checkType(dto);
      await tx.leaveType.update({ where: { id: t.id }, data: { name: dto.name, paid: dto.paid, colour: dto.colour ?? t.colour, rules: rules as unknown as Prisma.InputJsonValue, active: dto.active ?? t.active, version: { increment: 1 }, updatedAt: new Date() } });
      await audit(tx, c, 'leave.type.changed', 'leave_type', t.id, { code: t.code, from: { name: t.name, paid: t.paid, rules: t.rules, active: t.active }, to: { name: dto.name, paid: dto.paid, rules, active: dto.active ?? t.active } });
      return { id: t.id };
    });
  }

  private checkType(dto: LeaveTypeDto): LeaveRules {
    const rules = parseRules(dto.rules);
    if (dto.kind === 'lop' && dto.paid) throw new BadRequestException('Leave without pay is unpaid.');
    // YX-LV-14: an unpaid type carries no balance, so it has nothing to go below zero.
    if (dto.kind === 'lop' && rules.negativeLimit) throw new BadRequestException('Leave without pay has no balance, so it cannot go below zero.');
    return rules;
  }

  // ------------------------------------------------------------------------------------------ policies (TIM-28)

  createPolicy(ctx: TenantContext, user: ScopeUser, dto: PolicyDto) {
    return this.run(ctx, user, true, async (tx, c) => {
      const p = await tx.leavePolicy.create({ data: { organizationId: c.organizationId, name: dto.name, createdBy: c.userId ?? null } });
      await audit(tx, c, 'leave.policy.created', 'leave_policy', p.id, { name: dto.name });
      return { id: p.id };
    });
  }

  /** A new dated version (P06): a version already in force never changes; the same date may be redone while future. */
  addVersion(ctx: TenantContext, user: ScopeUser, policyId: string, dto: PolicyVersionDto) {
    return this.run(ctx, user, true, async (tx, c) => {
      const p = await tx.leavePolicy.findFirst({ where: { organizationId: c.organizationId, id: policyId } });
      if (!p) throw new NotFoundException('No such policy.');
      const ids = new Set((await tx.leaveType.findMany({ where: { organizationId: c.organizationId }, select: { id: true } })).map((t) => t.id));
      const lines = parseLines(dto.lines, ids);
      if (await tx.leavePolicyVersion.findFirst({ where: { organizationId: c.organizationId, policyId, validFrom: asDate(dto.validFrom) } })) throw new ConflictException('This policy already has a version from that date. Choose a later date.');
      const v = await tx.leavePolicyVersion.create({ data: { organizationId: c.organizationId, policyId, validFrom: asDate(dto.validFrom), lines: lines as unknown as Prisma.InputJsonValue, note: dto.note ?? null, createdBy: c.userId ?? null } });
      await audit(tx, c, 'leave.policy.version_added', 'leave_policy', p.id, { validFrom: dto.validFrom, lines });
      return { id: v.id };
    });
  }

  /** Assigns a policy to a scope from a date (YX-ORG-18 precedence, dated). */
  assign(ctx: TenantContext, user: ScopeUser, policyId: string, dto: AssignPolicyDto) {
    return this.run(ctx, user, true, async (tx, c) => {
      const org = c.organizationId;
      const p = await tx.leavePolicy.findFirst({ where: { organizationId: org, id: policyId, archivedAt: null } });
      if (!p) throw new NotFoundException('No such policy.');
      if (dto.scopeType === 'tenant' && dto.scopeId) throw new BadRequestException('A company-wide policy has no scope id.');
      if (dto.scopeType !== 'tenant' && !dto.scopeId) throw new BadRequestException('Say which record the policy is for.');
      const scopeId = dto.scopeType === 'tenant' ? org : dto.scopeId!;
      const model = SCOPE_MODEL[dto.scopeType];
      if (model && !(await (tx[model] as unknown as { findFirst(a: unknown): Promise<unknown> }).findFirst({ where: { organizationId: org, id: scopeId } }))) throw new NotFoundException(`No such ${dto.scopeType.replace('_', ' ')} in this company.`);
      const at = { organizationId: org, scopeType: dto.scopeType, scopeId, validFrom: asDate(dto.validFrom) };
      const existing = await tx.leavePolicyAssignment.findFirst({ where: at });
      if (existing && dto.validFrom <= todayIst()) throw new ConflictException('A policy is already in force there from that date. Add the change from a later date.');
      if (existing) await tx.leavePolicyAssignment.delete({ where: { id: existing.id } });
      const a = await tx.leavePolicyAssignment.create({ data: { ...at, policyId, createdBy: c.userId ?? null } });
      await audit(tx, c, 'leave.policy.assigned', 'leave_policy', policyId, { scopeType: dto.scopeType, scopeId, validFrom: dto.validFrom, replaced: existing?.policyId ?? null });
      return { id: a.id };
    });
  }

  removeAssignment(ctx: TenantContext, user: ScopeUser, id: string) {
    return this.run(ctx, user, true, async (tx, c) => {
      const a = await tx.leavePolicyAssignment.findFirst({ where: { organizationId: c.organizationId, id } });
      if (!a) throw new NotFoundException('Not found');
      if (dateOf(a.validFrom) <= todayIst()) throw new ConflictException('That assignment is already in force. Add a new one from a later date instead.');
      await tx.leavePolicyAssignment.delete({ where: { id } });
      await audit(tx, c, 'leave.policy.unassigned', 'leave_policy', a.policyId, { scopeType: a.scopeType, scopeId: a.scopeId, validFrom: dateOf(a.validFrom) });
    });
  }

  // ------------------------------------------------------------------------------------------ holidays (TIM-26)

  createCalendar(ctx: TenantContext, user: ScopeUser, dto: CalendarDto) {
    return this.run(ctx, user, true, async (tx, c) => {
      if (dto.locationId && !(await tx.location.findFirst({ where: { organizationId: c.organizationId, id: dto.locationId } }))) throw new NotFoundException('No such location.');
      if (await tx.holidayCalendar.findFirst({ where: { organizationId: c.organizationId, locationId: dto.locationId ?? null } })) throw new ConflictException(dto.locationId ? 'That location already has a holiday calendar.' : 'The company calendar already exists.');
      const cal = await tx.holidayCalendar.create({ data: { organizationId: c.organizationId, name: dto.name, locationId: dto.locationId ?? null, halfDayOpenHalf: dto.halfDayOpenHalf ?? 'first', optionalLimit: dto.optionalLimit ?? 2, createdBy: c.userId ?? null } });
      await audit(tx, c, 'holiday.calendar.created', 'holiday_calendar', cal.id, { name: dto.name, locationId: dto.locationId ?? null });
      return { id: cal.id };
    });
  }

  updateCalendar(ctx: TenantContext, user: ScopeUser, id: string, dto: CalendarDto) {
    return this.run(ctx, user, true, async (tx, c) => {
      const cal = await tx.holidayCalendar.findFirst({ where: { organizationId: c.organizationId, id } });
      if (!cal) throw new NotFoundException('No such calendar.');
      if ((dto.locationId ?? null) !== cal.locationId) throw new BadRequestException('A calendar stays with its location.');
      await tx.holidayCalendar.update({ where: { id }, data: { name: dto.name, halfDayOpenHalf: dto.halfDayOpenHalf ?? cal.halfDayOpenHalf, optionalLimit: dto.optionalLimit ?? cal.optionalLimit, version: { increment: 1 }, updatedAt: new Date() } });
      await audit(tx, c, 'holiday.calendar.changed', 'holiday_calendar', id, { name: dto.name, halfDayOpenHalf: dto.halfDayOpenHalf, optionalLimit: dto.optionalLimit });
      return { id };
    });
  }

  addHoliday(ctx: TenantContext, user: ScopeUser, calendarId: string, dto: HolidayDto) {
    return this.run(ctx, user, true, async (tx, c) => {
      const cal = await tx.holidayCalendar.findFirst({ where: { organizationId: c.organizationId, id: calendarId } });
      if (!cal) throw new NotFoundException('No such calendar.');
      if (dto.halfDay && (dto.kind === 'optional' || dto.kind === 'restricted')) throw new BadRequestException('An optional holiday is a whole day.');
      if (await tx.holiday.findFirst({ where: { organizationId: c.organizationId, calendarId, holidayOn: asDate(dto.on) } })) throw new ConflictException('That date is already a holiday on this calendar.');
      const h = await tx.holiday.create({ data: { organizationId: c.organizationId, calendarId, holidayOn: asDate(dto.on), name: dto.name, kind: dto.kind, halfDay: dto.halfDay ?? false, createdBy: c.userId ?? null } });
      await audit(tx, c, 'holiday.added', 'holiday', h.id, { calendarId, on: dto.on, name: dto.name, kind: dto.kind, halfDay: dto.halfDay ?? false });
      return { id: h.id };
    });
  }

  removeHoliday(ctx: TenantContext, user: ScopeUser, id: string) {
    return this.run(ctx, user, true, async (tx, c) => {
      const h = await tx.holiday.findFirst({ where: { organizationId: c.organizationId, id } });
      if (!h) throw new NotFoundException('Not found');
      // A holiday already passed has shaped balances and attendance; it stays.
      if (dateOf(h.holidayOn) < todayIst()) throw new ConflictException('That holiday has passed, so it stays on the calendar.');
      await tx.holiday.delete({ where: { id } });
      await audit(tx, c, 'holiday.removed', 'holiday', id, { calendarId: h.calendarId, on: dateOf(h.holidayOn), name: h.name });
    });
  }

  // ------------------------------------------------------------------------------------------ attendance basics per location

  setRule(ctx: TenantContext, user: ScopeUser, locationId: string, dto: AttendanceRuleDto) {
    return this.run(ctx, user, true, async (tx, c) => {
      const org = c.organizationId;
      if (!(await tx.location.findFirst({ where: { organizationId: org, id: locationId } }))) throw new NotFoundException('No such location.');
      if (dto.validFrom < todayIst()) throw new BadRequestException('Shift and weekly-off changes start today or later.');
      const offs = this.parseOffs(dto.weeklyOffs);
      if (dto.shiftStart === dto.shiftEnd) throw new BadRequestException('The shift ends at a different time from when it starts.');
      const at = { organizationId: org, locationId, validFrom: asDate(dto.validFrom) };
      if (await tx.locationAttendanceRule.findFirst({ where: at })) throw new ConflictException('There is already a change from that date. Choose another date.');
      const r = await tx.locationAttendanceRule.create({ data: { ...at, shiftName: dto.shiftName ?? 'General', shiftStart: dto.shiftStart, shiftEnd: dto.shiftEnd, graceMinutes: dto.graceMinutes, weeklyOffs: offs as unknown as Prisma.InputJsonValue, checkIn: dto.checkIn, createdBy: c.userId ?? null } });
      await audit(tx, c, 'attendance.rule.added', 'location', locationId, { validFrom: dto.validFrom, shiftStart: dto.shiftStart, shiftEnd: dto.shiftEnd, graceMinutes: dto.graceMinutes, weeklyOffs: offs, checkIn: dto.checkIn });
      return { id: r.id };
    });
  }

  parseOffs(input: unknown[]): WeeklyOffRule[] {
    if (input.length > 7) throw new BadRequestException('Choose up to 7 weekly-off days.');
    const seen = new Set<number>();
    return input.map((x) => {
      const o = x as { weekday?: unknown; nth?: unknown };
      if (typeof o !== 'object' || o === null || !Number.isInteger(o.weekday) || (o.weekday as number) < 1 || (o.weekday as number) > 7) throw new BadRequestException('Choose weekdays Monday to Sunday.');
      if (seen.has(o.weekday as number)) throw new BadRequestException('Each weekday appears once.');
      seen.add(o.weekday as number);
      if (o.nth === undefined || (Array.isArray(o.nth) && !o.nth.length)) return { weekday: o.weekday as number };
      if (!Array.isArray(o.nth) || o.nth.some((n) => !Number.isInteger(n) || n < 1 || n > 5)) throw new BadRequestException('Weeks of the month are 1 to 5.');
      return { weekday: o.weekday as number, nth: [...new Set(o.nth as number[])].sort() };
    });
  }

  // ------------------------------------------------------------------------------------------ year end (TIM-29, YX-LV-07)

  yearEndPreview(ctx: TenantContext, user: ScopeUser, yearEnd: string) {
    return this.run(ctx, user, false, async (tx, c) => {
      const rows = await this.leave.yearEndRows(tx, c, yearEnd);
      return { yearEnd, rows, lapses: rows.filter((r) => r.lapse > 0).length };
    });
  }

  /** Checked here; the posting runs on the BullMQ worker (idempotent by period key). */
  async yearEndCheck(ctx: TenantContext, user: ScopeUser, yearEnd: string) {
    if (yearEnd > todayIst()) throw new BadRequestException('Run year end on or after the last day of the leave year.');
    return this.run(ctx, user, true, async (tx, c) => {
      await audit(tx, c, 'leave.year_end.requested', 'leave_year_end', c.organizationId, { yearEnd });
      return { organizationId: c.organizationId, userId: c.userId ?? null };
    });
  }
}
