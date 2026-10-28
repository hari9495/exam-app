import { ConflictException } from '@nestjs/common';
import { Tx, CompanyContext } from '../org-structure/org-structure.service';
import { ScheduleBook, nightGuard } from './schedule';
import { Facts, asDate, dateOf, factsOn, settingOn } from './time-core';
import { addDays } from './time-maths';
import { mondayOf } from './time-rules';
import { BLOCKING, GUARD_CODE, Held, Limits, Override, PlanDay, Requirement, RuleBreak, addedBreaks, licenceValid, licencesNeeded, timeBreaks } from './roster-rules';

/** What a day becomes in a "what if": a shift id, null for off, or 'base' for the person's own pattern / location shift. */
export type Change = string | null | 'base';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * The roster's rule guard over the database (feature sheet rules 1–4 and 8): one per request or job. It builds a person's
 * plan over a range (published, or with drafts), checks it, and answers "what does this change add?". Every path that
 * places a person on a shift calls it: drafts, publish, swaps, open shifts, standby moves and the auto-roster.
 */
export class RosterGuard {
  private readonly facts = new Map<string, Promise<Facts | null>>();
  private readonly limitsOf = new Map<string, Promise<Limits>>();
  private readonly licences = new Map<string, Promise<{ held: Held[]; overrides: Override[] }>>();
  private reqs: Promise<Requirement[]> | null = null;
  private readonly names = new Map<string, string>();

  private constructor(
    private readonly tx: Tx,
    private readonly c: CompanyContext,
    readonly book: ScheduleBook,
  ) {}

  static async load(tx: Tx, c: CompanyContext, book?: ScheduleBook) {
    return new RosterGuard(tx, c, book ?? (await ScheduleBook.load(tx, c.organizationId)));
  }

  factsOn(employeeId: string, on: string) {
    const k = `${employeeId}|${on}`;
    if (!this.facts.has(k)) this.facts.set(k, factsOn(this.tx, this.c.organizationId, employeeId, on));
    return this.facts.get(k)!;
  }

  /** The company's working-time limits for the person (settings, most specific scope). */
  limits(f: Facts, on: string): Promise<Limits> {
    if (!this.limitsOf.has(f.employeeId))
      this.limitsOf.set(
        f.employeeId,
        (async () => {
          const n = async (key: string) => Number(await settingOn(this.tx, this.c, key, f, on));
          return { minRestMinutes: (await n('attendance.min_rest_hours')) * 60, dailyMinutes: (await n('roster.max_daily_hours')) * 60, weeklyMinutes: (await n('roster.max_weekly_hours')) * 60, spreadMinutes: Math.round((await n('roster.max_spread_over_hours')) * 60), minWeeklyOffs: await n('roster.min_weekly_offs') };
        })(),
      );
    return this.limitsOf.get(f.employeeId)!;
  }

  private requirements() {
    this.reqs ??= this.tx.shiftLicenceRequirement.findMany({ where: { organizationId: this.c.organizationId } }).then((rows) => rows.map((r) => ({ licenceTypeId: r.licenceTypeId, shiftId: r.shiftId, designationId: r.designationId, locationId: r.locationId })));
    return this.reqs;
  }

  private held(employeeId: string) {
    if (!this.licences.has(employeeId))
      this.licences.set(
        employeeId,
        (async () => {
          const org = this.c.organizationId;
          const [rows, ov] = await Promise.all([this.tx.employeeLicence.findMany({ where: { organizationId: org, employeeId, removedAt: null } }), this.tx.licenceOverride.findMany({ where: { organizationId: org, employeeId } })]);
          return { held: rows.map((r) => ({ licenceTypeId: r.licenceTypeId, validFrom: dateOf(r.validFrom), expiresOn: r.expiresOn ? dateOf(r.expiresOn) : null })), overrides: ov.map((o) => ({ licenceTypeId: o.licenceTypeId, until: dateOf(o.until) })) };
        })(),
      );
    return this.licences.get(employeeId)!;
  }

  private async typeName(id: string) {
    if (!this.names.has(id)) this.names.set(id, (await this.tx.licenceType.findFirst({ where: { organizationId: this.c.organizationId, id }, select: { name: true } }))?.name ?? 'licence');
    return this.names.get(id)!;
  }

  /** Rule 8 for one placement: the licence types missing (expired, not held). Overrides count only for company licences. */
  async licenceBreak(f: Facts, on: string, shiftId: string | null): Promise<RuleBreak | null> {
    if (!shiftId) return null;
    const need = licencesNeeded(await this.requirements(), { shiftId, designationId: f.designationId, locationId: f.locationId });
    if (!need.length) return null;
    const { held, overrides } = await this.held(f.employeeId);
    for (const t of need) {
      const legal = (await this.tx.licenceType.findFirst({ where: { organizationId: this.c.organizationId, id: t }, select: { legal: true } }))?.legal ?? true;
      if (!licenceValid(held, t, on, legal ? [] : overrides)) return { on, kind: 'licence', message: `${f.name} has no valid ${await this.typeName(t)} on this day` };
    }
    return null;
  }

  /**
   * The person's plan over [from, to]: published (and the pattern / location) by default; `drafts` also applies unpublished
   * drafts; `changes` overrides single days last.
   */
  async plan(employeeId: string, from: string, to: string, opts: { drafts?: boolean; changes?: Map<string, Change> } = {}): Promise<PlanDay[]> {
    const org = this.c.organizationId;
    const drafts = opts.drafts ? new Map((await this.tx.rosterEntry.findMany({ where: { organizationId: org, employeeId, draft: { not: null }, workOn: { gte: asDate(from), lte: asDate(to) } } })).map((e) => [dateOf(e.workOn), e.draft!])) : new Map<string, string>();
    const out: PlanDay[] = [];
    for (let on = from; on <= to; on = addDays(on, 1)) {
      const f = await this.factsOn(employeeId, on);
      if (!f) {
        out.push({ on, shift: null, employed: false });
        continue;
      }
      let shift = (await this.book.day(f, on)).shift;
      const d = drafts.get(on);
      if (d === 'off') shift = null;
      else if (d === 'pattern') shift = (await this.book.day(f, on, false)).shift;
      else if (d && UUID.test(d)) shift = this.book.shiftOn(d, on);
      if (opts.changes?.has(on)) {
        const ch = opts.changes.get(on)!;
        shift = ch === null ? null : ch === 'base' ? (await this.book.day(f, on, false)).shift : this.book.shiftOn(ch, on);
      }
      out.push({ on, shift, employed: true });
    }
    return out;
  }

  /** Every break (time rules, licences, night work) in a plan for one person. */
  async breaks(employeeId: string, days: PlanDay[]): Promise<RuleBreak[]> {
    const first = days.find((d) => d.employed);
    if (!first) return [];
    const f0 = (await this.factsOn(employeeId, first.on))!;
    const out = timeBreaks(days, await this.limits(f0, first.on));
    for (const d of days) {
      if (!d.employed || !d.shift?.shiftId) continue;
      const f = (await this.factsOn(employeeId, d.on))!;
      const lic = await this.licenceBreak(f, d.on, d.shift.shiftId);
      if (lic) out.push(lic);
      const night = await nightGuard(this.tx, this.c.organizationId, f, d.on, d.shift);
      if (night) out.push({ on: d.on, kind: 'night', message: night });
    }
    return out;
  }

  /** The range a change to these days is judged over: whole Monday–Sunday weeks, plus a day each side for rest. */
  static span(days: string[]): { from: string; to: string } {
    const sorted = [...days].sort();
    return { from: addDays(mondayOf(sorted[0]), -1), to: addDays(mondayOf(sorted[sorted.length - 1]), 7) };
  }

  /** The blocking breaks a change ADDS for one person (base: published, or published + drafts). */
  async added(employeeId: string, changes: Map<string, Change>, opts: { drafts?: boolean } = {}): Promise<RuleBreak[]> {
    if (!changes.size) return [];
    const { from, to } = RosterGuard.span([...changes.keys()]);
    const before = await this.breaks(employeeId, await this.plan(employeeId, from, to, opts));
    const after = await this.breaks(employeeId, await this.plan(employeeId, from, to, { ...opts, changes }));
    return addedBreaks(before, after).filter((b) => BLOCKING.includes(b.kind));
  }

  /** Refuses (409) when the change adds a break; `who` names the person in the message. */
  async assert(employeeId: string, changes: Map<string, Change>, tail: string, opts: { drafts?: boolean } = {}) {
    const added = await this.added(employeeId, changes, opts);
    if (!added.length) return;
    const who = (await this.factsOn(employeeId, [...changes.keys()][0]))?.name ?? 'This person';
    throw new ConflictException({ statusCode: 409, code: GUARD_CODE[added[0].kind], message: `${who}: ${added[0].message}. ${tail}`, breaks: added });
  }
}
