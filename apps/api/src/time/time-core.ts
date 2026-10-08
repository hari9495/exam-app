import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CompanyContext, Tx } from '../org-structure/org-structure.service';
import { ScopeContext, SETTINGS, SettingDef, resolveSetting } from '../org-structure/settings-registry';
import { Viewer, has, implicitSql, inScopeSql, tenantWide } from '../access/scope';
import { DayRule, Floor, HolidayOn, WeeklyOffRule, eachDay, localDate } from './time-maths';

// Shared loaders for leave and attendance: the employee's dated facts, the location's calendar and rules, the
// policy in force (scoped and dated, YX-ORG-18), statutory floors (P07) and who may see whom (P02).

export const TIME_KEYS = ['leave.settings.manage', 'leave.view', 'leave.balance.adjust', 'leave.approve', 'leave.medical.view', 'attendance.view'] as const;
export type TimeKey = (typeof TIME_KEYS)[number];

const iso = (d: Date) => d.toISOString().slice(0, 10);
export const asDate = (s: string) => new Date(`${s}T00:00:00.000Z`);
export const dateOf = iso;
export const num = (d: Prisma.Decimal | number | null | undefined) => (d === null || d === undefined ? 0 : Number(d));

// ------------------------------------------------------------------------------------------ leave type rules

export const LEAVE_KINDS = ['earned', 'casual', 'sick', 'lop', 'comp_off', 'maternity', 'paternity', 'other'] as const;
export type LeaveKind = (typeof LEAVE_KINDS)[number];

/** Types without a balance (YX-LV-14): unpaid leave shows "taken this year"; maternity / paternity are per event. */
export const hasBalance = (kind: string) => !['lop', 'maternity', 'paternity'].includes(kind);

export interface LeaveRules {
  sandwich: 'none' | 'sandwich' | 'always';
  sandwichOn: 'weekly_offs' | 'holidays' | 'both';
  sandwichHalfDays: boolean;
  halfDays: boolean;
  minDays: number | null;
  maxDays: number | null;
  noticeDays: number;
  /** A certificate is needed when a request is longer than this many days (null: never). */
  certificateAfterDays: number | null;
  /** The reason and certificate are Special data (YX-LV-09). */
  medical: boolean;
  /** L6: how far below zero the balance may go. */
  negativeLimit: number;
  /** L5 encashment flag (payroll later). */
  encashable: boolean;
  /** HR approves after the manager when a request is longer than this many days (0: always; null: never). */
  hrApprovalAboveDays: number | null;
}

export const DEFAULT_RULES: LeaveRules = { sandwich: 'none', sandwichOn: 'both', sandwichHalfDays: false, halfDays: true, minDays: null, maxDays: null, noticeDays: 0, certificateAfterDays: null, medical: false, negativeLimit: 0, encashable: false, hrApprovalAboveDays: null };

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const halfStep = (n: unknown, lo: number, hi: number) => typeof n === 'number' && Number.isFinite(n) && n >= lo && n <= hi && Math.round(n * 2) === n * 2;

/** Checks a type's rules from outside; plain messages (no errors while typing: the screen shows them on save). */
export function parseRules(input: unknown): LeaveRules {
  if (input === undefined || input === null) return { ...DEFAULT_RULES };
  if (!isObj(input)) throw new BadRequestException('The leave rules are not in the expected shape.');
  for (const k of Object.keys(input)) if (!(k in DEFAULT_RULES)) throw new BadRequestException(`Unknown leave rule "${k.slice(0, 30)}".`);
  const r = { ...DEFAULT_RULES, ...input } as LeaveRules;
  if (!['none', 'sandwich', 'always'].includes(r.sandwich)) throw new BadRequestException('Choose how weekends and holidays between leave days count.');
  if (!['weekly_offs', 'holidays', 'both'].includes(r.sandwichOn)) throw new BadRequestException('Choose whether the sandwich rule covers weekly offs, holidays or both.');
  for (const k of ['sandwichHalfDays', 'halfDays', 'medical', 'encashable'] as const) if (typeof r[k] !== 'boolean') throw new BadRequestException('Use yes or no for the switches.');
  for (const k of ['minDays', 'maxDays', 'certificateAfterDays', 'hrApprovalAboveDays'] as const) {
    if (r[k] !== null && !halfStep(r[k], 0, 366)) throw new BadRequestException('Days are 0 to 366, in half days.');
  }
  if (!Number.isInteger(r.noticeDays) || r.noticeDays < 0 || r.noticeDays > 90) throw new BadRequestException('Notice is 0 to 90 days.');
  if (!halfStep(r.negativeLimit, 0, 30)) throw new BadRequestException('The balance may go below zero by 0 to 30 days.');
  if (r.minDays !== null && r.maxDays !== null && r.minDays > r.maxDays) throw new BadRequestException('The least days per request is more than the most.');
  return r;
}

// ------------------------------------------------------------------------------------------ policy lines

export interface PolicyLine {
  leaveTypeId: string;
  annualDays: number;
  frequency: 'yearly' | 'monthly';
  proRata: boolean;
  rounding: number;
  /** Days carried into the next leave year (null: all); the rest lapses (YX-LV-07). */
  carryForwardMax: number | null;
}

export function parseLines(input: unknown, typeIds: ReadonlySet<string>): PolicyLine[] {
  if (!Array.isArray(input) || input.length > 20) throw new BadRequestException('Add up to 20 leave types to a policy.');
  const seen = new Set<string>();
  return input.map((x, i) => {
    if (!isObj(x)) throw new BadRequestException(`Line ${i + 1} is not in the expected shape.`);
    for (const k of Object.keys(x)) if (!['leaveTypeId', 'annualDays', 'frequency', 'proRata', 'rounding', 'carryForwardMax'].includes(k)) throw new BadRequestException(`Line ${i + 1} has an unknown part "${k.slice(0, 20)}".`);
    const id = String(x.leaveTypeId);
    if (!typeIds.has(id)) throw new BadRequestException(`Line ${i + 1}: choose a leave type of this company.`);
    if (seen.has(id)) throw new BadRequestException('Each leave type appears once in a policy.');
    seen.add(id);
    if (!halfStep(x.annualDays, 0, 366)) throw new BadRequestException(`Line ${i + 1}: days a year are 0 to 366, in half days.`);
    if (x.frequency !== 'yearly' && x.frequency !== 'monthly') throw new BadRequestException(`Line ${i + 1}: credit monthly or once a year.`);
    if (typeof x.proRata !== 'boolean') throw new BadRequestException(`Line ${i + 1}: say whether joiners get a share.`);
    if (![0, 0.25, 0.5, 1].includes(x.rounding as number)) throw new BadRequestException(`Line ${i + 1}: round to none, 0.25, 0.5 or 1 day.`);
    const cf = x.carryForwardMax ?? null;
    if (cf !== null && !halfStep(cf, 0, 366)) throw new BadRequestException(`Line ${i + 1}: carry forward is 0 to 366 days.`);
    return { leaveTypeId: id, annualDays: x.annualDays as number, frequency: x.frequency, proRata: x.proRata, rounding: x.rounding as number, carryForwardMax: cf as number | null };
  });
}

// ------------------------------------------------------------------------------------------ the employee's facts

export interface Facts {
  employeeId: string;
  personId: string;
  userId: string | null;
  name: string;
  code: string | null;
  joinedOn: string;
  exitedOn: string | null;
  legalEntityId: string;
  locationId: string;
  departmentId: string;
  designationId: string;
  gradeId: string | null;
  employmentTypeId: string;
  managerEmployeeId: string | null;
  zone: string;
  state: string;
}

/** The employee's assignment and location on `on` (P06: as of that date). Null when not employed on it. */
export async function factsOn(tx: Tx, org: string, employeeId: string, on: string): Promise<Facts | null> {
  const rows = await tx.$queryRaw<(Omit<Facts, 'joinedOn' | 'exitedOn'> & { joinedOn: Date; exitedOn: Date | null })[]>`
    SELECT e.id::text AS "employeeId", e.person_id::text AS "personId", e.user_id::text AS "userId",
           concat_ws(' ', coalesce(e.preferred_name, e.given_name), e.family_name) AS name, m.employee_code::text AS code,
           m.joined_on AS "joinedOn", m.exited_on AS "exitedOn", a.legal_entity_id::text AS "legalEntityId",
           a.location_id::text AS "locationId", a.department_id::text AS "departmentId", a.designation_id::text AS "designationId",
           a.grade_id::text AS "gradeId", a.employment_type_id::text AS "employmentTypeId", a.manager_employee_id::text AS "managerEmployeeId",
           l.timezone AS zone, l.state
    FROM employees e
    JOIN employee_assignments a ON a.organization_id = e.organization_id AND a.employee_id = e.id AND a.superseded_at IS NULL
      AND ${on}::date <@ daterange(a.valid_from, a.valid_to, '[]')
    JOIN employments m ON m.organization_id = e.organization_id AND m.id = a.employment_id
    JOIN locations l ON l.organization_id = e.organization_id AND l.id = a.location_id
    WHERE e.organization_id = ${org}::uuid AND e.id = ${employeeId}::uuid
    ORDER BY a.valid_from DESC LIMIT 1`;
  const r = rows[0];
  if (!r) return null;
  return { ...r, joinedOn: iso(r.joinedOn), exitedOn: r.exitedOn ? iso(r.exitedOn) : null };
}

/** The signed-in person's employee record, or 404 in plain words. */
export async function myEmployeeId(tx: Tx, org: string, userId: string | null | undefined): Promise<string> {
  const e = userId ? await tx.employee.findFirst({ where: { organizationId: org, userId }, select: { id: true } }) : null;
  if (!e) throw new NotFoundException('You have no employee record in this company. Ask HR to link your login.');
  return e.id;
}

export const todayIn = (zone: string, now = new Date()) => localDate(now, zone);

// ------------------------------------------------------------------------------------------ scoped, dated settings

const scopeContext = (c: CompanyContext, f: Facts): ScopeContext => ({
  tenant: c.organizationId,
  employee: f.employeeId,
  designation: f.designationId,
  grade: f.gradeId ?? undefined,
  employment_type: f.employmentTypeId,
  department: f.departmentId,
  location: f.locationId,
  legal_entity: f.legalEntityId,
});

/** A registered setting for the employee on a date (YX-ORG-18: most specific scope, dated keys as of that date). */
export async function settingOn(tx: Tx, c: CompanyContext, key: string, f: Facts, on: string): Promise<string> {
  const def = SETTINGS[key];
  const rows = await tx.setting.findMany({ where: { organizationId: c.organizationId, key } });
  return String(resolveSetting(def, rows.map((r) => ({ id: r.id, scopeType: r.scopeType, scopeId: r.scopeId, value: r.value, validFrom: r.validFrom ? iso(r.validFrom) : null })), scopeContext(c, f), on).value);
}

// DECISION NEEDED: the brief lists policy precedence as grade > employment type > entity > location > company; the
// shared P01 order (YX-ORG-18, settings-registry SCOPE_ORDER) puts a location above its legal entity (a location
// belongs to one entity, so it is the more specific scope). Leave policies follow the shared order until decided.
const POLICY_DEF: SettingDef = { label: 'Leave policy', scopes: ['employee', 'designation', 'grade', 'employment_type', 'department', 'location', 'legal_entity', 'tenant'], dated: true, values: [], default: '' };

/** The policy version in force for the employee on `on`, with its lines; null when no policy applies. */
export async function policyOn(tx: Tx, c: CompanyContext, f: Facts, on: string): Promise<{ policyId: string; name: string; lines: PolicyLine[] } | null> {
  const rows = await tx.leavePolicyAssignment.findMany({ where: { organizationId: c.organizationId } });
  const r = resolveSetting(POLICY_DEF, rows.map((a) => ({ id: a.id, scopeType: a.scopeType, scopeId: a.scopeId, value: a.policyId, validFrom: iso(a.validFrom) })), scopeContext(c, f), on);
  if (!r.value) return null;
  const policyId = String(r.value);
  const [policy, version] = await Promise.all([
    tx.leavePolicy.findFirst({ where: { organizationId: c.organizationId, id: policyId } }),
    tx.leavePolicyVersion.findFirst({ where: { organizationId: c.organizationId, policyId, validFrom: { lte: asDate(on) } }, orderBy: { validFrom: 'desc' } }),
  ]);
  if (!policy || !version) return null;
  return { policyId, name: policy.name, lines: version.lines as unknown as PolicyLine[] };
}

/** P07 Shops and Establishments floors for a state on a date (YX-STAT-05: the rule set valid on that date). */
export async function statutoryOn(tx: Tx, state: string, on: string): Promise<{ floors: Floor[]; carry: Record<string, number>; source: string | null; verify: boolean }> {
  const rs = await tx.statutoryRuleSet.findFirst({ where: { statute: 'IN.SE', jurisdiction: state, validFrom: { lte: asDate(on) }, OR: [{ validTo: null }, { validTo: { gte: asDate(on) } }] }, orderBy: { validFrom: 'desc' } });
  const v = (rs?.values ?? {}) as { floors?: Floor[]; carry?: Record<string, number> };
  return { floors: v.floors ?? [], carry: v.carry ?? {}, source: rs?.source ?? null, verify: rs?.verify ?? false };
}

/** IN.LEAVE maternity weeks (P07), the most a maternity request may run. */
export async function maternityDays(tx: Tx, on: string): Promise<number> {
  const rs = await tx.statutoryRuleSet.findFirst({ where: { statute: 'IN.LEAVE', jurisdiction: 'IN', validFrom: { lte: asDate(on) } }, orderBy: { validFrom: 'desc' } });
  return Number((rs?.values as { maternityWeeks?: number } | undefined)?.maternityWeeks ?? 26) * 7;
}

// ------------------------------------------------------------------------------------------ calendars and shifts

/** Holidays of the location's calendar (or the company calendar) in a range, with the employee's chosen optional ones. */
export async function holidaysFor(tx: Tx, org: string, locationId: string, from: string, to: string, employeeId?: string): Promise<{ map: Map<string, HolidayOn>; calendarId: string | null }> {
  const cal = (await tx.holidayCalendar.findFirst({ where: { organizationId: org, locationId } })) ?? (await tx.holidayCalendar.findFirst({ where: { organizationId: org, locationId: null } }));
  const map = new Map<string, HolidayOn>();
  if (!cal) return { map, calendarId: null };
  const rows = await tx.holiday.findMany({ where: { organizationId: org, calendarId: cal.id, holidayOn: { gte: asDate(from), lte: asDate(to) } } });
  const chosen = employeeId ? new Set((await tx.optionalHolidayChoice.findMany({ where: { organizationId: org, employeeId, holidayId: { in: rows.map((r) => r.id) } } })).map((x) => x.holidayId)) : new Set<string>();
  for (const h of rows) {
    if ((h.kind === 'optional' || h.kind === 'restricted') && !chosen.has(h.id)) continue;
    map.set(iso(h.holidayOn), { name: h.name, halfDay: h.halfDay, openHalf: cal.halfDayOpenHalf as 'first' | 'second' });
  }
  return { map, calendarId: cal.id };
}

export interface LocationRule extends DayRule {
  shiftName: string;
  weeklyOffs: WeeklyOffRule[];
  checkIn: 'restricted' | 'field';
  alsoAllowed: string[];
}

export const DEFAULT_RULE: LocationRule = { shiftName: 'General', shiftStart: 570, shiftEnd: 1110, graceMinutes: 10, halfDayMinutes: 240, fullDayMinutes: 480, breakMinutes: 30, breakAboveMinutes: 300, weeklyOffs: [{ weekday: 7 }], checkIn: 'restricted', alsoAllowed: [] };

/** The location's dated rules in force on each date of a range (the latest valid_from on or before the date). */
export async function rulesFor(tx: Tx, org: string, locationId: string, to: string): Promise<(on: string) => LocationRule> {
  const rows = await tx.locationAttendanceRule.findMany({ where: { organizationId: org, locationId, validFrom: { lte: asDate(to) } }, orderBy: { validFrom: 'desc' } });
  const list = rows.map((r) => ({ from: iso(r.validFrom), rule: { shiftName: r.shiftName, shiftStart: r.shiftStart, shiftEnd: r.shiftEnd, graceMinutes: r.graceMinutes, halfDayMinutes: r.halfDayMinutes, fullDayMinutes: r.fullDayMinutes, breakMinutes: r.breakMinutes, breakAboveMinutes: r.breakAboveMinutes, weeklyOffs: r.weeklyOffs as unknown as WeeklyOffRule[], checkIn: r.checkIn as LocationRule['checkIn'], alsoAllowed: r.alsoAllowed } }));
  return (on: string) => list.find((r) => r.from <= on)?.rule ?? DEFAULT_RULE;
}

/** Approved (or pending, when asked) leave of one employee per date, as the part of the day away. */
export async function leaveDays(tx: Tx, org: string, employeeId: string, from: string, to: string, statuses: string[] = ['approved', 'cancel_pending']): Promise<Map<string, 'full' | 'first' | 'second'>> {
  const rows = await tx.$queryRaw<{ on: string; part: string }[]>`
    SELECT d.leave_on::text AS on, d.part FROM leave_request_days d
    JOIN leave_requests r ON r.organization_id = d.organization_id AND r.id = d.request_id
    WHERE d.organization_id = ${org}::uuid AND d.employee_id = ${employeeId}::uuid AND d.active AND d.portion > 0
      AND d.leave_on BETWEEN ${from}::date AND ${to}::date AND r.status = ANY(${statuses}::text[])`;
  const out = new Map<string, 'full' | 'first' | 'second'>();
  for (const r of rows) {
    const prev = out.get(r.on);
    // Two half days on one date (a first-half and a second-half request) make a full day away.
    out.set(r.on, prev && prev !== r.part ? 'full' : (r.part as 'full' | 'first' | 'second'));
  }
  return out;
}

export { eachDay };

// ------------------------------------------------------------------------------------------ who may see whom (P02)

/** SQL: employee `emp` is visible today to the viewer: themselves, their team (implicit, YX-SEC-04), or `key` in scope. */
export async function visibleSql(tx: Tx, c: CompanyContext, v: Viewer, own: string | null, key: TimeKey, emp: Prisma.Sql, date: string, team = true): Promise<Prisma.Sql> {
  const self = own ? Prisma.sql`${emp} = ${own}::uuid` : Prisma.sql`FALSE`;
  const implicit = team ? await implicitSql(tx, c, own, emp, Prisma.sql`${date}::date`) : Prisma.sql`FALSE`;
  const granted = v.actingForOther && !tenantWide(v, key) ? Prisma.sql`FALSE` : inScopeSql(c, v, key, emp, Prisma.sql`${date}::date`, own);
  return Prisma.sql`(${self} OR ${implicit} OR ${granted})`;
}

/** One employee: visible as self, team or through `key`? (404 otherwise: the same answer as an unknown person.) */
export async function mustSee(tx: Tx, c: CompanyContext, v: Viewer, own: string | null, key: TimeKey, employeeId: string, date: string, team = true): Promise<'self' | 'team' | 'granted'> {
  if (own === employeeId) return 'self';
  // A company-wide grant matches any id: the employee must exist in this company first (RLS-bound read).
  if (!(await tx.employee.findFirst({ where: { organizationId: c.organizationId, id: employeeId }, select: { id: true } }))) throw new NotFoundException('Not found');
  const [row] = await tx.$queryRaw<{ team: boolean; granted: boolean }[]>`
    SELECT ${team ? await implicitSql(tx, c, own, Prisma.sql`${employeeId}::uuid`, Prisma.sql`${date}::date`) : Prisma.sql`FALSE`} AS team,
           ${has(v, key) ? inScopeSql(c, v, key, Prisma.sql`${employeeId}::uuid`, Prisma.sql`${date}::date`, own) : Prisma.sql`FALSE`} AS granted`;
  if (row?.granted) return 'granted';
  if (row?.team) return 'team';
  throw new NotFoundException('Not found');
}

/** Holds `key` over this employee today (explicit grant, never the implicit manager view). */
export async function grantCovers(tx: Tx, c: CompanyContext, v: Viewer, own: string | null, key: TimeKey, employeeId: string, date: string): Promise<boolean> {
  if (!has(v, key)) return false;
  if (!(await tx.employee.findFirst({ where: { organizationId: c.organizationId, id: employeeId }, select: { id: true } }))) return false;
  if (tenantWide(v, key)) return true;
  const [row] = await tx.$queryRaw<{ ok: boolean }[]>`SELECT ${inScopeSql(c, v, key, Prisma.sql`${employeeId}::uuid`, Prisma.sql`${date}::date`, own)} AS ok`;
  return Boolean(row?.ok);
}

/**
 * Active users who hold `key` over the employee today: through their own role profile (company-wide) or a role grant
 * whose scope covers the employee (P02 §4.3). Used for the HR step of leave and regularisation approvals.
 */
export async function holdersOf(tx: Tx, org: string, key: TimeKey, employeeId: string, today: string): Promise<string[]> {
  const like = `%"${key}"%`;
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT u.id::text FROM users u JOIN permission_profiles p ON p.organization_id = u.organization_id AND p.id = u.permission_profile_id
    WHERE u.organization_id = ${org}::uuid AND u.status = 'active' AND p.permissions_json LIKE ${like}
    UNION
    SELECT g.user_id::text FROM role_grants g
    JOIN permission_profiles p ON p.organization_id = g.organization_id AND p.id = g.permission_profile_id
    JOIN users u ON u.organization_id = g.organization_id AND u.id = g.user_id AND u.status = 'active'
    LEFT JOIN employees own ON own.organization_id = g.organization_id AND own.user_id = g.user_id
    WHERE g.organization_id = ${org}::uuid AND g.status = 'active' AND p.permissions_json LIKE ${like}
      AND g.valid_from <= ${today}::date AND (g.valid_to IS NULL OR g.valid_to >= ${today}::date)
      AND yx_scope_periods(${org}::uuid, ${employeeId}::uuid, g.scope_type, COALESCE(g.legal_entity_id, g.location_id, g.department_id), own.id) @> ${today}::date
    LIMIT 25`;
  return rows.map((r) => r.id);
}

/**
 * Who approves the HR step (and anything no manager can): holders of leave.approve over the employee; else the
 * company's leave set-up holders; else its System Admins, so a request never lacks an approver.
 */
export async function hrApprovers(tx: Tx, org: string, employeeId: string, today: string): Promise<string[]> {
  const hr = await holdersOf(tx, org, 'leave.approve', employeeId, today);
  if (hr.length) return hr;
  const setup = await holdersOf(tx, org, 'leave.settings.manage', employeeId, today);
  if (setup.length) return setup;
  return (await tx.user.findMany({ where: { organizationId: org, role: 'org_admin', status: 'active' }, select: { id: true }, take: 25 })).map((u) => u.id);
}

/** Dates of a month (yyyy-mm). */
export function monthRange(month: string): { from: string; to: string } {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new BadRequestException('Give the month as yyyy-mm.');
  const from = `${month}-01`;
  const d = new Date(`${from}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(0);
  return { from, to: iso(d) };
}

/**
 * Approved leave of people by login, per date and part (full / first / second half). The Service Desk reads it for
 * assignment and personal OLA clocks (US-G-011, the "leave seam"); a first-half and a second-half request on one date
 * make a full day.
 */
export async function approvedLeaveOfUsers(tx: Tx, org: string, userIds: readonly string[], from: string, to: string): Promise<{ userId: string; on: string; part: 'full' | 'first' | 'second' }[]> {
  if (!userIds.length) return [];
  const rows = await tx.$queryRaw<{ userId: string; on: string; parts: string[] }[]>`
    SELECT e.user_id::text AS "userId", d.leave_on::text AS on, array_agg(DISTINCT d.part) AS parts
    FROM leave_request_days d
    JOIN leave_requests r ON r.organization_id = d.organization_id AND r.id = d.request_id AND r.status IN ('approved', 'cancel_pending')
    JOIN employees e ON e.organization_id = d.organization_id AND e.id = d.employee_id
    WHERE d.organization_id = ${org}::uuid AND e.user_id = ANY(${[...userIds]}::uuid[]) AND d.active AND d.portion > 0
      AND d.leave_on BETWEEN ${from}::date AND ${to}::date
    GROUP BY 1, 2`;
  return rows.map((r) => ({ userId: r.userId, on: r.on, part: r.parts.length > 1 || r.parts[0] === 'full' ? 'full' : (r.parts[0] as 'first' | 'second') }));
}
