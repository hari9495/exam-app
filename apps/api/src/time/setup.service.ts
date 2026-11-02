import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { CompanyContext, Tx, audit, inCompany } from '../org-structure/org-structure.service';
import { buildViewer, tenantWide, type ScopeUser } from '../access/scope';
import { isCidr, todayIst } from '../org-structure/org-validation';
import { SETTINGS, resolveSetting } from '../org-structure/settings-registry';
import { AssignPolicyDto, AttendanceRuleDto, CalendarDto, HolidayDto, LeaveTypeDto, PolicyDto, PolicyVersionDto } from './dto';
import { LeaveService } from './leave.service';
import { DEFAULT_RULE, LeaveRules, asDate, dateOf, parseLines, parseRules, maternityValues, policyFor, statutoryMinimum, yearChangeFor } from './time-core';
import { leaveYearWith, monthsIn, shortYearEnd, statutoryProblem, yearChangeProblem } from './leave-rules';
import { addDays } from './time-maths';

const fullDay = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
import { FEED_STATES } from './holiday-feed.provider';

const MOVE_KEY = 'leave.optional_holiday.prorate_on_move';
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
      const grades = await tx.grade.findMany({ where: { organizationId: org }, orderBy: { name: 'asc' }, select: { id: true, name: true } });
      const [moveRows, drafts, feedWaiting] = await Promise.all([
        tx.setting.findMany({ where: { organizationId: org, key: MOVE_KEY } }),
        tx.holidayDraft.findMany({ where: { organizationId: org }, orderBy: { holidayOn: 'asc' } }),
        tx.holidayFeedChange.groupBy({ by: ['calendarId'], where: { organizationId: org, status: 'waiting' }, _count: { _all: true } }),
      ]);
      // Founder decision 2: the notice a type without its own number asks for (company value; sick leave 0).
      const noticeRows = await tx.setting.findMany({ where: { organizationId: org, key: 'leave.notice_days.default' } });
      const noticeDefault = Number(resolveSetting(SETTINGS['leave.notice_days.default'], noticeRows.map((r) => ({ id: r.id, scopeType: r.scopeType, scopeId: r.scopeId, value: r.value, validFrom: null })), { tenant: org }, today).value);
      // TIM-27 Statutory: what the law fixes for maternity (and paternity where a state rule gives it).
      const law = { maternity: await statutoryMinimum(tx, org, 'maternity', today), paternity: await statutoryMinimum(tx, org, 'paternity', today) };
      return {
        today,
        types: types.map((t) => ({ id: t.id, code: t.code, name: t.name, kind: t.kind, paid: t.paid, colour: t.colour, active: t.active, rules: t.rules as unknown as LeaveRules, version: t.version, statutory: law[t.kind as keyof typeof law] ?? null })),
        maternity: await maternityValues(tx, today),
        policies: policies.map((p) => ({
          id: p.id,
          name: p.name,
          archived: Boolean(p.archivedAt),
          versions: versions.filter((v) => v.policyId === p.id).map((v) => ({ id: v.id, validFrom: dateOf(v.validFrom), lines: v.lines, note: v.note })),
          assignments: assignments.filter((a) => a.policyId === p.id).map((a) => ({ id: a.id, scopeType: a.scopeType, scopeId: a.scopeId, scopeName: a.scopeType === 'tenant' ? 'Whole company' : (scopeName.get(a.scopeId) ?? ''), validFrom: dateOf(a.validFrom), removable: dateOf(a.validFrom) > today })),
        })),
        calendars: calendars.map((cal) => {
          const loc = locations.find((l) => l.id === cal.locationId);
          return {
            id: cal.id,
            name: cal.name,
            locationId: cal.locationId,
            halfDayOpenHalf: cal.halfDayOpenHalf,
            optionalLimit: cal.optionalLimit,
            onWeeklyOff: cal.onWeeklyOff,
            // Founder decision (TIM-26): optional holidays after a move, per location (the company value until set).
            onMove: resolveSetting(SETTINGS[MOVE_KEY], moveRows.map((r) => ({ id: r.id, scopeType: r.scopeType, scopeId: r.scopeId, value: r.value, validFrom: null })), { tenant: org, ...(loc ? { location: loc.id, legal_entity: loc.legalEntityId ?? undefined } : {}) }, today).value === 'no' ? 'reset' : 'share',
            publishedAt: cal.publishedAt,
            waitingFeedChanges: feedWaiting.find((w) => w.calendarId === cal.id)?._count._all ?? 0,
            holidays: holidays.filter((h) => h.calendarId === cal.id).map((h) => ({ id: h.id, on: dateOf(h.holidayOn), name: h.name, kind: h.kind, halfDay: h.halfDay })),
            drafts: drafts.filter((h) => h.calendarId === cal.id).map((h) => ({ id: h.id, on: dateOf(h.holidayOn), name: h.name, kind: h.kind, halfDay: h.halfDay, confirm: h.confirm, source: h.source })),
          };
        }),
        templates: Object.fromEntries(locations.filter((l) => FEED_STATES[l.state]).map((l) => [l.id, FEED_STATES[l.state]])),
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
        grades,
        ...(await this.coverage(tx, org, today, assignments, policies)),
        noticeDefault,
        // TIM-27: the company values a type follows until it sets its own (named in the editor's helpers).
        leaveDefaults: Object.fromEntries(
          await Promise.all(
            ['leave.encashment.max_days', 'leave.encashment.min_left', 'leave.encashment.divisor', 'leave.notice_period.leave', 'leave.long_absence.accrues'].map(async (key) => {
              const rows = await tx.setting.findMany({ where: { organizationId: org, key } });
              return [key, String(resolveSetting(SETTINGS[key], rows.map((r) => ({ id: r.id, scopeType: r.scopeType, scopeId: r.scopeId, value: r.value, validFrom: null })), { tenant: org }, today).value)];
            }),
          ),
        ),
        statutory: statutory.map((s) => ({ jurisdiction: s.jurisdiction, version: s.version, validFrom: dateOf(s.validFrom), values: s.values, source: s.source, verify: s.verify })),
      };
    });
  }

  /**
   * TIM-28: who each policy covers today (with the saved order), the per-person overrides, the people no policy covers
   * (first 50 by joining date), and the order today and any saved for later.
   */
  private async coverage(tx: Tx, org: string, today: string, assignments: Prisma.LeavePolicyAssignmentGetPayload<object>[], policies: { id: string; archivedAt: Date | null }[]) {
    const orders = await tx.leavePolicyOrder.findMany({ where: { organizationId: org }, orderBy: { validFrom: 'desc' } });
    const now = orders.find((o) => dateOf(o.validFrom) <= today) ?? null;
    const later = orders.find((o) => dateOf(o.validFrom) > today) ?? null;
    const people = await tx.$queryRaw<{ id: string; name: string; code: string | null; joinedOn: Date; entity: string; location: string; department: string; designation: string; grade: string | null; type: string }[]>`
      SELECT DISTINCT ON (e.id) e.id::text, concat_ws(' ', coalesce(e.preferred_name, e.given_name), e.family_name) AS name, m.employee_code::text AS code,
             m.joined_on AS "joinedOn", a.legal_entity_id::text AS entity, a.location_id::text AS location, a.department_id::text AS department,
             a.designation_id::text AS designation, a.grade_id::text AS grade, a.employment_type_id::text AS type
      FROM employees e
      JOIN employee_assignments a ON a.organization_id = e.organization_id AND a.employee_id = e.id AND a.superseded_at IS NULL AND ${today}::date <@ daterange(a.valid_from, a.valid_to, '[]')
      JOIN employments m ON m.organization_id = e.organization_id AND m.id = a.employment_id AND (m.exited_on IS NULL OR m.exited_on >= ${today}::date)
      WHERE e.organization_id = ${org}::uuid
      ORDER BY e.id, a.valid_from DESC`;
    const count = new Map<string, number>();
    const uncovered: { id: string; name: string; code: string | null; joinedOn: string }[] = [];
    for (const p of people) {
      const ctx = { tenant: org, employee: p.id, designation: p.designation, grade: p.grade ?? undefined, employment_type: p.type, department: p.department, location: p.location, legal_entity: p.entity };
      const id = policyFor(assignments, now?.policyIds ?? null, ctx, today);
      if (id) count.set(id, (count.get(id) ?? 0) + 1);
      else uncovered.push({ id: p.id, name: p.name, code: p.code, joinedOn: dateOf(p.joinedOn) });
    }
    uncovered.sort((a, b) => b.joinedOn.localeCompare(a.joinedOn));
    const overrides = new Map<string, number>();
    for (const a of assignments) if (a.scopeType === 'employee' && dateOf(a.validFrom) <= today) overrides.set(a.policyId, (overrides.get(a.policyId) ?? 0) + 1);
    const live = new Set(policies.filter((p) => !p.archivedAt).map((p) => p.id));
    return {
      coverage: Object.fromEntries([...live].map((id) => [id, { people: count.get(id) ?? 0, overrides: overrides.get(id) ?? 0 }])),
      covered: people.length - uncovered.length,
      uncovered: { count: uncovered.length, people: uncovered.slice(0, 50) },
      order: { current: now ? now.policyIds.filter((id) => live.has(id)) : null, currentFrom: now ? dateOf(now.validFrom) : null, upcoming: later ? { validFrom: dateOf(later.validFrom), policyIds: later.policyIds.filter((id) => live.has(id)) } : null },
    };
  }

  /** TIM-28: the policy order from a date; a saved later order may be redone, one in force never changes (P06). */
  saveOrder(ctx: TenantContext, user: ScopeUser, dto: { policyIds: string[]; validFrom: string }) {
    return this.run(ctx, user, true, async (tx, c) => {
      const org = c.organizationId;
      const today = todayIst();
      if (dto.validFrom < today) throw new BadRequestException('Choose today or a later date: earlier months stay as they were.');
      if (new Set(dto.policyIds).size !== dto.policyIds.length) throw new BadRequestException('Each policy appears once in the order.');
      const live = await tx.leavePolicy.findMany({ where: { organizationId: org, archivedAt: null }, select: { id: true } });
      if (dto.policyIds.length !== live.length || dto.policyIds.some((id) => !live.some((p) => p.id === id))) throw new BadRequestException('The order must list every policy once. Reload the page and try again.');
      const existing = await tx.leavePolicyOrder.findFirst({ where: { organizationId: org, validFrom: asDate(dto.validFrom) } });
      if (existing && dto.validFrom <= today) throw new ConflictException('An order is already in force from today. Save the change from a later date.');
      if (existing) await tx.leavePolicyOrder.update({ where: { id: existing.id }, data: { policyIds: dto.policyIds, createdBy: c.userId ?? null } });
      else await tx.leavePolicyOrder.create({ data: { organizationId: org, validFrom: asDate(dto.validFrom), policyIds: dto.policyIds, createdBy: c.userId ?? null } });
      await audit(tx, c, 'leave.policy.order_saved', 'leave_policy', org, { validFrom: dto.validFrom, policyIds: dto.policyIds, replaced: existing?.policyIds ?? null });
      return { validFrom: dto.validFrom, policyIds: dto.policyIds };
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
      const rules = await this.checkType(tx, c, dto);
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
      // G1 (gap pass T1): the leave type screen does not show pay steps yet, so an edit that leaves them out keeps them.
      const old = t.rules as Record<string, unknown>;
      const rules = await this.checkType(tx, c, { ...dto, rules: { paySteps: old.paySteps ?? null, payWindow: old.payWindow ?? 'leave_year', ...(dto.rules ?? {}) } });
      await tx.leaveType.update({ where: { id: t.id }, data: { name: dto.name, paid: dto.paid, colour: dto.colour ?? t.colour, rules: rules as unknown as Prisma.InputJsonValue, active: dto.active ?? t.active, version: { increment: 1 }, updatedAt: new Date() } });
      await audit(tx, c, 'leave.type.changed', 'leave_type', t.id, { code: t.code, from: { name: t.name, paid: t.paid, rules: t.rules, active: t.active }, to: { name: dto.name, paid: dto.paid, rules, active: dto.active ?? t.active } });
      return { id: t.id };
    });
  }

  private async checkType(tx: Tx, c: CompanyContext, dto: LeaveTypeDto): Promise<LeaveRules> {
    const rules = parseRules(dto.rules);
    if (dto.kind === 'lop' && dto.paid) throw new BadRequestException('Leave without pay is unpaid.');
    // YX-LV-14: an unpaid type carries no balance, so it has nothing to go below zero.
    if (dto.kind === 'lop' && rules.negativeLimit) throw new BadRequestException('Leave without pay has no balance, so it cannot go below zero.');
    if (!dto.paid && rules.paySteps) throw new BadRequestException('Only paid leave has pay steps.');
    // TIM-27 Year end: cash-in limits and the payout only mean something for a type that can be cashed in.
    if (!rules.encashable && (rules.encashMaxDays !== null || rules.encashMinLeft !== null || rules.encashDivisor !== null)) throw new BadRequestException('Turn on "Can be cashed in" before setting cash-in limits or the payout.');
    // TIM-27 Statutory: a kind the law sets can't be made shorter or less paid than the law (a company may give more).
    const problem = statutoryProblem(await statutoryMinimum(tx, c.organizationId, dto.kind, todayIst()), { name: dto.name, paid: dto.paid, active: dto.active ?? true, rules });
    if (problem) throw new BadRequestException(problem);
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
      await tx.holidayCalendar.update({ where: { id }, data: { name: dto.name, halfDayOpenHalf: dto.halfDayOpenHalf ?? cal.halfDayOpenHalf, optionalLimit: dto.optionalLimit ?? cal.optionalLimit, onWeeklyOff: dto.onWeeklyOff ?? cal.onWeeklyOff, version: { increment: 1 }, updatedAt: new Date() } });
      if (dto.onMove) {
        // "When someone moves" is the location's value of the company setting (TIM-23 prorating), kept per location.
        if (!cal.locationId) throw new BadRequestException('The company calendar follows the company setting for moves. Change it in Settings.');
        const where = { organizationId: c.organizationId, key: MOVE_KEY, scopeType: 'location', scopeId: cal.locationId };
        const row = await tx.setting.findFirst({ where });
        const value = dto.onMove === 'share' ? 'yes' : 'no';
        if (row) await tx.setting.update({ where: { id: row.id }, data: { value, updatedBy: c.userId ?? null } });
        else await tx.setting.create({ data: { ...where, value, updatedBy: c.userId ?? null } });
      }
      await audit(tx, c, 'holiday.calendar.changed', 'holiday_calendar', id, { name: dto.name, halfDayOpenHalf: dto.halfDayOpenHalf, optionalLimit: dto.optionalLimit, onWeeklyOff: dto.onWeeklyOff, onMove: dto.onMove });
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

  /** TIM-31: the office networks of a location (the same field Settings › Locations edits), each line a valid range. */
  setNetworks(ctx: TenantContext, user: ScopeUser, locationId: string, input: string[]) {
    const lines = input.map((r) => r.trim());
    const bad = lines.findIndex((r) => r !== '' && !isCidr(r));
    if (bad >= 0) throw new BadRequestException(`Line ${bad + 1}: ${lines[bad]} is not a valid range. Each part must be 0–255, e.g. 10.20.4.0/24.`);
    const ipRanges = [...new Set(lines.filter(Boolean))];
    return this.run(ctx, user, true, async (tx, c) => {
      const row = await tx.location.findFirst({ where: { organizationId: c.organizationId, id: locationId, archivedAt: null } });
      if (!row) throw new NotFoundException('No such location.');
      await tx.location.update({ where: { id: locationId }, data: { ipRanges } });
      await audit(tx, c, 'org.location.networks_changed', 'location', locationId, { before: row.ipRanges, after: ipRanges });
      return { id: locationId, ipRanges };
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
      const posted = await this.postedRuns(tx, c, yearEnd);
      // TIM-29: requests still waiting with days in the closing year are listed to decide first.
      return { yearEnd, rows, lapses: rows.filter((r) => r.lapse > 0).length, payOuts: rows.filter((r) => r.encash > 0).length, posted, pending: await this.leave.yearEndPending(tx, c, yearEnd) };
    });
  }

  /** Year ends already posted for the date: who posted, when, for which policies. */
  private async postedRuns(tx: Tx, c: CompanyContext, yearEnd: string) {
    const runs = await tx.leaveYearRun.findMany({ where: { organizationId: c.organizationId, yearEnd: asDate(yearEnd) }, orderBy: { postedAt: 'asc' } });
    if (!runs.length) return null;
    const by = runs[0].postedBy ? await tx.user.findFirst({ where: { organizationId: c.organizationId, id: runs[0].postedBy }, select: { name: true, email: true } }) : null;
    return { at: runs[0].postedAt, by: by?.name || by?.email || null, policies: runs.length };
  }

  /**
   * Checked and recorded here (once per policy and last day: a second run is refused), then the posting runs on the
   * BullMQ worker (safe to re-run by period key).
   */
  async yearEndCheck(ctx: TenantContext, user: ScopeUser, yearEnd: string, acknowledgePending = false) {
    if (yearEnd > todayIst()) throw new BadRequestException('Run year end on or after the last day of the leave year.');
    return this.run(ctx, user, true, async (tx, c) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`year-end:${c.organizationId}:${yearEnd}`}))`;
      const done = await this.postedRuns(tx, c, yearEnd);
      if (done) throw new ConflictException({ statusCode: 409, code: 'YEAR_END_POSTED', message: `Year end for ${fullDay(yearEnd)} was already posted${done.by ? ` by ${done.by}` : ''}. Correct a balance with an adjustment instead.` });
      // TIM-29: pending requests block posting unless HR posts anyway (they stay pending into the new year).
      const pending = await this.leave.yearEndPending(tx, c, yearEnd);
      if (pending.length && !acknowledgePending) throw new ConflictException({ statusCode: 409, code: 'YEAR_END_PENDING', message: `${pending.length} leave ${pending.length === 1 ? 'request is' : 'requests are'} still waiting. Decide ${pending.length === 1 ? 'it' : 'them'} first, or post anyway and ${pending.length === 1 ? 'it stays' : 'they stay'} pending in the new year.`, pending: pending.length });
      const rows = await this.leave.yearEndRows(tx, c, yearEnd);
      const policies = [...new Set(rows.map((r) => r.policyId))];
      for (const policyId of policies) {
        const mine = rows.filter((r) => r.policyId === policyId);
        const sum = (k: 'carry' | 'encash' | 'lapse') => Math.round(mine.reduce((x, r) => x + r[k], 0) * 100) / 100;
        await tx.leaveYearRun.create({ data: { organizationId: c.organizationId, yearEnd: asDate(yearEnd), policyId, totals: { people: new Set(mine.map((r) => r.employeeId)).size, carried: sum('carry'), paidOut: sum('encash'), lapsed: sum('lapse') }, postedBy: c.userId ?? null } });
      }
      await audit(tx, c, 'leave.year_end.requested', 'leave_year_end', c.organizationId, { yearEnd, pendingCarried: pending.length, policies: policies.length });
      return { organizationId: c.organizationId, userId: c.userId ?? null };
    });
  }

  // ------------------------------------------------------------------------------------------ TIM-29 leave-year change

  /** The entity's leave year today and the change it would get: from the first day of its next leave year. */
  private async yearChangePlan(tx: Tx, c: CompanyContext, legalEntityId: string, newStartMonth: number) {
    const org = c.organizationId;
    const entity = await tx.legalEntity.findFirst({ where: { organizationId: org, id: legalEntityId, archivedAt: null }, select: { id: true, name: true } });
    if (!entity) throw new NotFoundException('No such legal entity.');
    const today = todayIst();
    const rows = await tx.setting.findMany({ where: { organizationId: org, key: 'leave.year_start_month' } });
    const setMonth = Number(resolveSetting(SETTINGS['leave.year_start_month'], rows.map((r) => ({ id: r.id, scopeType: r.scopeType, scopeId: r.scopeId, value: r.value, validFrom: null })), { tenant: org, legal_entity: legalEntityId }, today).value);
    const change = await yearChangeFor(tx, org, legalEntityId, today);
    const year = leaveYearWith(today, setMonth, change);
    const scheduled = change && change.fromOn > today ? change : null;
    const fromOn = addDays(year.end, 1);
    const oldStartMonth = Number(fromOn.slice(5, 7));
    const shortEnd = shortYearEnd(fromOn, newStartMonth);
    return { entity, today, year, fromOn, oldStartMonth, shortEnd, scheduled, months: monthsIn(fromOn, shortEnd) };
  }

  /** GET setup/year-change: the preview per person, and any change already scheduled for the entity. */
  yearChangePreview(ctx: TenantContext, user: ScopeUser, legalEntityId: string, newStartMonth: number) {
    return this.run(ctx, user, false, async (tx, c) => {
      const plan = await this.yearChangePlan(tx, c, legalEntityId, newStartMonth);
      const problem = plan.scheduled ? null : plan.year.short ? 'A short year is running now. Change the leave year again after it ends.' : yearChangeProblem(plan.fromOn, plan.oldStartMonth, newStartMonth, plan.today);
      const rows = problem || plan.scheduled ? [] : await this.leave.transitionRows(tx, c, legalEntityId, plan.fromOn, plan.shortEnd, plan.today);
      return { entity: plan.entity, oldStartMonth: plan.oldStartMonth, newStartMonth, fromOn: plan.fromOn, shortEnd: plan.shortEnd, months: plan.months, problem, scheduled: plan.scheduled ? { ...plan.scheduled, shortEnd: shortYearEnd(plan.scheduled.fromOn, plan.scheduled.newStartMonth) } : null, rows };
    });
  }

  /**
   * POST setup/year-change: schedules the change (once per entity and date; a second one while one waits is refused).
   * Nothing is posted now: from that date the accrual job credits the short year and its year end applies the caps.
   */
  scheduleYearChange(ctx: TenantContext, user: ScopeUser, legalEntityId: string, newStartMonth: number) {
    return this.run(ctx, user, true, async (tx, c) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`year-change:${c.organizationId}:${legalEntityId}`}))`;
      const plan = await this.yearChangePlan(tx, c, legalEntityId, newStartMonth);
      if (plan.scheduled) throw new ConflictException({ statusCode: 409, code: 'YEAR_CHANGE_SCHEDULED', message: `${plan.entity.name} already moves to a new leave year on ${fullDay(plan.scheduled.fromOn)}. Only one change can wait at a time.` });
      if (plan.year.short) throw new ConflictException('A short year is running now. Change the leave year again after it ends.');
      const problem = yearChangeProblem(plan.fromOn, plan.oldStartMonth, newStartMonth, plan.today);
      if (problem) throw new BadRequestException(problem);
      const row = await tx.leaveYearChange.create({ data: { organizationId: c.organizationId, legalEntityId, fromOn: asDate(plan.fromOn), oldStartMonth: plan.oldStartMonth, newStartMonth, createdBy: c.userId ?? null } });
      await audit(tx, c, 'leave.year_change.scheduled', 'legal_entity', legalEntityId, { fromOn: plan.fromOn, shortYearEnd: plan.shortEnd, from: plan.oldStartMonth, to: newStartMonth, changeId: row.id });
      return { id: row.id, fromOn: plan.fromOn, shortEnd: plan.shortEnd, months: plan.months };
    });
  }
}
