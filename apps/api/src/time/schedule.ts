import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Tx } from '../org-structure/org-structure.service';
import { SettingDef, resolveSetting } from '../org-structure/settings-registry';
import { Facts, LocationRule, asDate, dateOf, rulesFor } from './time-core';
import { isWeeklyOff } from './time-maths';
import { PatternDef, Scheduled, ShiftTimes, crossesMidnight, overlapsNight, patternCell, resolveDay } from './time-rules';

// Who works which shift on which date (M02 §B2, Q1): a published roster entry, else the shift pattern assigned by
// scope and date, else the location's default shift and weekly offs. One loader per request or job: the company's
// shifts, patterns and assignments are read once; roster entries per person and range.

const PATTERN_DEF: SettingDef = { label: 'Shift pattern', scopes: ['employee', 'department', 'location', 'legal_entity', 'tenant'], dated: true, values: [], default: '' };

export class ScheduleBook {
  private readonly rules = new Map<string, (on: string) => LocationRule>();
  private readonly roster = new Map<string, { shiftId: string | null; isOff: boolean } | null>();

  private constructor(
    private readonly tx: Tx,
    private readonly org: string,
    readonly shifts: Map<string, { id: string; code: string; name: string; night: boolean; colour: string; active: boolean; versions: { from: string; v: Prisma.ShiftVersionGetPayload<object> }[] }>,
    private readonly patterns: Map<string, PatternDef & { name: string }>,
    private readonly assignments: Prisma.ShiftPatternAssignmentGetPayload<object>[],
  ) {}

  static async load(tx: Tx, org: string): Promise<ScheduleBook> {
    const [shifts, versions, patterns, assignments] = await Promise.all([
      tx.shift.findMany({ where: { organizationId: org } }),
      tx.shiftVersion.findMany({ where: { organizationId: org }, orderBy: { validFrom: 'desc' } }),
      tx.shiftPattern.findMany({ where: { organizationId: org } }),
      tx.shiftPatternAssignment.findMany({ where: { organizationId: org } }),
    ]);
    return new ScheduleBook(
      tx,
      org,
      new Map(shifts.map((s) => [s.id, { id: s.id, code: s.code, name: s.name, night: s.night, colour: s.colour, active: s.active, versions: versions.filter((v) => v.shiftId === s.id).map((v) => ({ from: dateOf(v.validFrom), v })) }])),
      new Map(patterns.map((p) => [p.id, { kind: p.kind as PatternDef['kind'], cycle: p.cycle as (string | null)[], name: p.name }])),
      assignments,
    );
  }

  /** A shift's times in force on a date (P06), or null when it has no version yet. */
  shiftOn(shiftId: string, on: string): ShiftTimes | null {
    const s = this.shifts.get(shiftId);
    const v = s?.versions.find((x) => x.from <= on)?.v;
    if (!s || !v) return null;
    return { shiftId: s.id, name: s.name, night: s.night, shiftStart: v.startMinute, shiftEnd: v.endMinute, graceMinutes: v.graceMinutes, halfDayMinutes: v.halfDayMinutes, fullDayMinutes: v.fullDayMinutes, breakMinutes: v.breakMinutes, breakAboveMinutes: v.breakAboveMinutes };
  }

  /** Loads published roster entries for people and dates (else each day is read on its own). */
  async prime(employeeIds: string[], from: string, to: string) {
    const rows = employeeIds.length ? await this.tx.rosterEntry.findMany({ where: { organizationId: this.org, employeeId: { in: employeeIds }, workOn: { gte: asDate(from), lte: asDate(to) }, published: true } }) : [];
    const got = new Map(rows.map((r) => [`${r.employeeId}|${dateOf(r.workOn)}`, { shiftId: r.shiftId, isOff: r.isOff }]));
    for (const e of employeeIds) for (let d = from; d <= to; d = new Date(Date.parse(`${d}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10)) this.roster.set(`${e}|${d}`, got.get(`${e}|${d}`) ?? null);
  }

  private async rosterOf(employeeId: string, on: string) {
    const k = `${employeeId}|${on}`;
    if (!this.roster.has(k)) {
      const r = await this.tx.rosterEntry.findFirst({ where: { organizationId: this.org, employeeId, workOn: asDate(on), published: true } });
      this.roster.set(k, r ? { shiftId: r.shiftId, isOff: r.isOff } : null);
    }
    return this.roster.get(k)!;
  }

  /** The pattern cell for the person on a date: undefined when no pattern applies (then the location decides). */
  patternOn(f: Facts, on: string): { cell: string | null; patternId: string } | undefined {
    const r = resolveSetting(
      PATTERN_DEF,
      this.assignments.map((a) => ({ id: a.id, scopeType: a.scopeType, scopeId: a.scopeId, value: a.id, validFrom: dateOf(a.validFrom) })),
      { employee: f.employeeId, department: f.departmentId, location: f.locationId, legal_entity: f.legalEntityId, tenant: this.org },
      on,
    );
    const a = r.value ? this.assignments.find((x) => x.id === r.value) : undefined;
    const p = a ? this.patterns.get(a.patternId) : undefined;
    if (!a || !p) return undefined;
    return { cell: patternCell(p, dateOf(a.validFrom), a.offsetDays, on), patternId: a.patternId };
  }

  private async locationRule(locationId: string) {
    if (!this.rules.has(locationId)) this.rules.set(locationId, await rulesFor(this.tx, this.org, locationId, '9999-12-31'));
    return this.rules.get(locationId)!;
  }

  /** The location's default shift on a date, as a shift. */
  async locationDay(f: Facts, on: string): Promise<{ rule: ShiftTimes; weeklyOff: boolean; base: LocationRule }> {
    const base = (await this.locationRule(f.locationId))(on);
    return { rule: { ...base, shiftId: null, name: base.shiftName, night: crossesMidnight(base) }, weeklyOff: isWeeklyOff(on, base.weeklyOffs), base };
  }

  /** Q1: what the person works on a date (`roster` false: ignoring the roster, i.e. the pattern or location). */
  async day(f: Facts, on: string, roster = true): Promise<Scheduled & { guarded?: string }> {
    const d = resolveDay({ roster: roster ? await this.rosterOf(f.employeeId, on) : null, pattern: this.patternOn(f, on)?.cell, location: await this.locationDay(f, on), shiftOn: (id) => this.shiftOn(id, on) });
    // YX-AT-25 at the point of use: a pattern or an older publication never puts a protected person at night once their consent
    // is withdrawn or a safeguard lapsed; the day falls back to the location's shift and the planner sees why.
    // ponytail: the location's own default shift is assumed to be a day shift.
    const why = d.shift && d.source !== 'location' ? await this.guarded(f, on, d.shift) : null;
    if (!why) return d;
    const loc = await this.locationDay(f, on);
    return { shift: loc.weeklyOff ? null : loc.rule, weeklyOff: loc.weeklyOff, source: 'location', guarded: why };
  }

  private readonly osh = new Map<string, Promise<{ nightWindow: { start: number; end: number } }>>();
  private readonly covered = new Map<string, Promise<boolean>>();

  /** The night-work guard with the cheap checks cached (most shifts and most people never reach the queries). */
  private async guarded(f: Facts, on: string, shift: ShiftTimes): Promise<string | null> {
    if (!this.osh.has(f.state)) this.osh.set(f.state, oshOn(this.tx, f.state, on));
    if (!overlapsNight(shift, (await this.osh.get(f.state)!).nightWindow)) return null;
    if (!this.covered.has(f.employeeId)) this.covered.set(f.employeeId, nightProtected(this.tx, this.org, f.employeeId));
    if (!(await this.covered.get(f.employeeId)!)) return null;
    return nightGuard(this.tx, this.org, f, on, shift);
  }
}

// ------------------------------------------------------------------------------------------ period locks (P08)

const monthName = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });

/** The dates in a range that fall in a locked attendance period for this person (YX-LOCK-01). */
export async function lockedDates(tx: Tx, org: string, employeeId: string, from: string, to: string): Promise<Set<string>> {
  if (to < from) return new Set();
  const rows = await tx.$queryRaw<{ on: string }[]>`
    SELECT d::date::text AS on FROM generate_series(${from}::date, ${to}::date, interval '1 day') AS d
    WHERE yx_time_locked(${org}::uuid, ${employeeId}::uuid, d::date)`;
  return new Set(rows.map((r) => r.on));
}

/**
 * Refuses a change touching a locked month, in plain words (YX-LOCK-02: after the lock only HR corrections).
 * Founder decision 9 Oct 2026: late corrections on a locked month are refused; HR unlocks the month to correct. (P08 Q4
 * late requests with their effect in the next payroll wait for payroll, step 5.)
 */
export async function assertOpen(tx: Tx, org: string, employeeId: string, from: string, to: string = from): Promise<void> {
  const locked = [...(await lockedDates(tx, org, employeeId, from, to))].sort();
  if (locked.length) throw new ConflictException({ statusCode: 409, code: 'PERIOD_LOCKED', message: `${monthName(locked[0])} is locked for attendance and leave, so this can't change any more. Ask HR to record a correction.` });
}

// ------------------------------------------------------------------------------------------ night-work protection (YX-AT-25)

interface OshValues {
  nightWindow: { start: number; end: number };
  safeguards: { item: string; label: string }[];
}

/**
 * P07 IN.OSH for the state on a date (the state's own rule set, else the national one). The 7 pm–6 am window is P07
 * data on the compliance verify list (founder decision 9 Oct 2026).
 */
export async function oshOn(tx: Tx, state: string, on: string): Promise<OshValues & { source: string; verify: boolean }> {
  const rows = await tx.statutoryRuleSet.findMany({ where: { statute: 'IN.OSH', jurisdiction: { in: [state, 'IN'] }, validFrom: { lte: asDate(on) }, OR: [{ validTo: null }, { validTo: { gte: asDate(on) } }] }, orderBy: { validFrom: 'desc' } });
  const rs = rows.find((r) => r.jurisdiction === state) ?? rows[0];
  const v = (rs?.values ?? {}) as Partial<OshValues>;
  return { nightWindow: v.nightWindow ?? { start: 1140, end: 360 }, safeguards: v.safeguards ?? [], source: rs?.source ?? '', verify: rs?.verify ?? true };
}

/**
 * Who the night-work protection covers (founder decision 9 Oct 2026): people recorded as female or transgender, and
 * anyone who opted in to it themselves (Me › Attendance; only they can turn it off).
 */
export const NIGHT_PROTECTED_GENDERS = ['female', 'transgender'];

export async function nightProtected(tx: Tx, org: string, employeeId: string): Promise<boolean> {
  const [pd, optIn] = await Promise.all([
    tx.employeePersonalDetails.findFirst({ where: { organizationId: org, employeeId }, select: { gender: true } }),
    tx.nightWorkOptIn.findUnique({ where: { organizationId_employeeId: { organizationId: org, employeeId } } }),
  ]);
  return Boolean(optIn) || NIGHT_PROTECTED_GENDERS.includes(pd?.gender ?? '');
}

/**
 * The law guard: a protected person (above) may be placed on a shift touching the legal night window only with their
 * consent on record for that establishment and date, confirmed by them in the app with a one-time code (founder
 * decision 9 Oct 2026), and every safeguard attested and in date. No switch, no override. Null when allowed.
 */
export async function nightGuard(tx: Tx, org: string, f: Pick<Facts, 'employeeId' | 'locationId' | 'state' | 'name'>, on: string, shift: ShiftTimes | null): Promise<string | null> {
  if (!shift) return null;
  const osh = await oshOn(tx, f.state, on);
  if (!overlapsNight(shift, osh.nightWindow)) return null;
  if (!(await nightProtected(tx, org, f.employeeId))) return null;
  const consents = await tx.nightWorkConsent.findMany({ where: { organizationId: org, employeeId: f.employeeId, locationId: f.locationId, givenOn: { lte: asDate(on) }, OR: [{ withdrawnOn: null }, { withdrawnOn: { gt: asDate(on) } }] } });
  if (!consents.length) return `No night-work consent on file for ${f.name}`;
  if (!consents.some((x) => x.confirmedAt)) return `${f.name} has not yet confirmed the night-work consent in the app`;
  for (const s of osh.safeguards) {
    const a = await tx.nightWorkSafeguard.findFirst({ where: { organizationId: org, locationId: f.locationId, item: s.item, attestedOn: { lte: asDate(on) } }, orderBy: { attestedOn: 'desc' } });
    if (!a || dateOf(a.reviewDue) < on) return `Safeguards checklist lapsed: ${s.label.toLowerCase()}`;
  }
  return null;
}
