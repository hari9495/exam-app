import { BadRequestException, ConflictException, ForbiddenException, HttpException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { CompanyContext, Tx, audit, inCompany } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import type { ScopeUser, Viewer } from '../access/scope';
import { ScheduleBook, lockedDates } from './schedule';
import { asDate, dateOf, holidaysFor, leaveDays, todayIn, visibleSql } from './time-core';
import { addDays } from './time-maths';
import { mondayOf, scheduledMinutes } from './time-rules';
import { RosterGuard } from './roster-guard';
import { BLOCKING } from './roster-rules';
import { Planning } from './open-shifts.service';
import { Candidate, Slot, SkipKind, coverage, fill } from './auto-roster-plan';
import type { DemandDto, GenerateDto } from './auto-roster.dto';

// TIM-34 Auto-roster (feature sheet rule 11 in docs/yukthix/time-design-map.md).
//   Who: a planner (a manager for their own team, implicit, or roster.manage in scope), at a location where they plan
//   someone; never their own row; nothing that changes data while acting for someone else. Another company's ids: 404.
//   Demand: people needed per shift and ISO weekday at a location (0..500); shared by the planners of that location.
//   Generate: for the people the planner plans who work at the location that week (at most MAX_PEOPLE, said in the result),
//   fills only EMPTY days (no draft and no published entry; the pattern / location default is not a choice and may be
//   replaced) from today on, as drafts. A person whose pattern already puts them on a demanded shift that day is counted
//   there and not moved. Each placement must pass the RosterGuard (rest, overlap, hours a day / week, spread-over, weekly
//   off, licence, night work) and is never on leave (approved or waiting), a holiday or a locked day. Fair order: fewest
//   scheduled hours that week, then fewest nights, then employee code. One run per location week at a time (partial
//   unique index; a second gets 409); a re-run only fills what is still empty. The planner reviews and publishes through
//   POST /time/roster/publish, which checks everything again.

export const MAX_PEOPLE = 200;
const MAX_DAYS_AHEAD = 120;
/** A run still "running" after this long is taken as stopped (server restart), so the week is never stuck. */
const STALE_MS = 10 * 60_000;
const ACTING = 'Not available while acting for someone else.';
const STOPPED = 'Stopped before it finished (it ran too long or the server restarted). Run it again.';
const FAILED = 'Something went wrong while generating. Nothing was saved. Try again.';
const WD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const weekday = (on: string) => ((new Date(`${on}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;
const RULE_TO_SKIP: Record<string, SkipKind> = { rest: 'rest', overlap: 'overlap', hours: 'hours', spread: 'spread', week: 'week', weekly_off: 'weekly_off', licence: 'licence', night: 'night' };

interface Person { id: string; name: string; code: string | null }

@Injectable()
export class AutoRosterService {
  private readonly planning: Planning;
  private readonly log = new Logger(AutoRosterService.name);

  constructor(
    prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
  ) {
    this.planning = new Planning(prisma, tenantPrisma);
  }

  /** The locations the viewer plans someone at (today, or this week's first or last day). */
  private async locations(tx: Tx, c: CompanyContext, v: Viewer, own: string | null, week: string) {
    const today = todayIst();
    const ids = new Set<string>();
    for (const on of new Set([today, week, addDays(week, 6)])) for (const l of await this.planning.locations(tx, c, v, own, on)) ids.add(l);
    return ids;
  }

  /** The people the viewer plans at the location on each day of the week (never themselves), first MAX_PEOPLE by code. */
  private async peopleAt(tx: Tx, c: CompanyContext, v: Viewer, own: string | null, locationId: string, week: string) {
    const byDay = new Map<string, string[]>();
    const all = new Map<string, Person>();
    for (let k = 0; k < 7; k++) {
      const on = addDays(week, k);
      const cond = await visibleSql(tx, c, v, own, 'roster.manage', Prisma.sql`e.id`, on);
      const rows = await tx.$queryRaw<Person[]>`
        SELECT e.id::text, concat_ws(' ', coalesce(e.preferred_name, e.given_name), e.family_name) AS name, max(m.employee_code)::text AS code
        FROM employees e
        JOIN employee_assignments a ON a.organization_id = e.organization_id AND a.employee_id = e.id AND a.superseded_at IS NULL AND ${on}::date <@ daterange(a.valid_from, a.valid_to, '[]') AND a.location_id = ${locationId}::uuid
        JOIN employments m ON m.organization_id = e.organization_id AND m.id = a.employment_id AND m.joined_on <= ${on}::date AND (m.exited_on IS NULL OR m.exited_on >= ${on}::date)
        WHERE e.organization_id = ${c.organizationId}::uuid AND (${own}::uuid IS NULL OR e.id <> ${own}::uuid) AND ${cond}
        GROUP BY 1, 2 ORDER BY 3 NULLS LAST, 1 LIMIT ${MAX_PEOPLE * 2}`;
      byDay.set(on, rows.map((r) => r.id));
      for (const r of rows) all.set(r.id, r);
    }
    const sorted = [...all.values()].sort((a, b) => (a.code ?? '￿').localeCompare(b.code ?? '￿', 'en', { numeric: true }) || a.id.localeCompare(b.id));
    const used = new Set(sorted.slice(0, MAX_PEOPLE).map((p) => p.id));
    for (const [on, ids] of byDay) byDay.set(on, ids.filter((id) => used.has(id)));
    return { byDay, people: sorted.slice(0, MAX_PEOPLE), total: sorted.length };
  }

  private async location(tx: Tx, c: CompanyContext, v: Viewer, own: string | null, id: string, week: string) {
    const loc = await tx.location.findFirst({ where: { organizationId: c.organizationId, id }, select: { id: true, name: true, timezone: true } });
    // Only where the viewer plans someone: anywhere else (or another company) is "not found".
    if (!loc || !(await this.locations(tx, c, v, own, week)).has(loc.id)) throw new NotFoundException('No such location.');
    return { ...loc, zone: loc.timezone ?? 'Asia/Kolkata' };
  }

  private shiftsView(book: ScheduleBook, week: string) {
    return [...book.shifts.values()]
      .filter((s) => s.active)
      .map((s) => {
        const t = book.shiftOn(s.id, week) ?? book.shiftOn(s.id, addDays(week, 6));
        return { id: s.id, code: s.code, name: s.name, colour: s.colour, night: s.night, start: t?.shiftStart ?? null, end: t?.shiftEnd ?? null };
      })
      .filter((s) => s.start !== null)
      .sort((a, b) => a.start! - b.start! || a.code.localeCompare(b.code));
  }

  // ------------------------------------------------------------------------------------------ read

  /** Demand, the latest run and the week's draft at one location the viewer plans. */
  async overview(ctx: TenantContext, user: ScopeUser, q: { locationId?: string; week?: string }) {
    const v = await this.planning.viewer(user);
    const week = mondayOf(q.week ?? todayIst());
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const own = await this.planning.ownId(tx, c, v);
      const locIds = await this.locations(tx, c, v, own, week);
      if (!locIds.size) throw new ForbiddenException('You plan no one, so there is no auto-roster for you.');
      const locs = await tx.location.findMany({ where: { organizationId: org, id: { in: [...locIds] } }, select: { id: true, name: true, timezone: true }, orderBy: { name: 'asc' } });
      const loc = q.locationId ? locs.find((l) => l.id === q.locationId) : locs[0];
      if (!loc) throw new NotFoundException('No such location.');
      const book = await ScheduleBook.load(tx, org);
      const guard = await RosterGuard.load(tx, c, book);
      const { people, total } = await this.peopleAt(tx, c, v, own, loc.id, week);
      const [demand, run, entries] = await Promise.all([
        tx.rosterDemand.findMany({ where: { organizationId: org, locationId: loc.id }, orderBy: [{ shiftId: 'asc' }, { weekday: 'asc' }] }),
        tx.autoRosterRun.findFirst({ where: { organizationId: org, locationId: loc.id, week: asDate(week) }, orderBy: { startedAt: 'desc' } }),
        people.length ? tx.rosterEntry.findMany({ where: { organizationId: org, employeeId: { in: people.map((p) => p.id) }, workOn: { gte: asDate(week), lte: asDate(addDays(week, 6)) } } }) : Promise.resolve([]),
      ]);
      const code = (id: string | null) => (id ? (book.shifts.get(id)?.code ?? null) : null);
      // What each day will be once published: a shift code, OFF, or null (the pattern or the location's usual shift).
      const days = (id: string) =>
        Array.from({ length: 7 }, (_, k) => {
          const e = entries.find((x) => x.employeeId === id && dateOf(x.workOn) === addDays(week, k));
          if (e?.draft) return e.draft === 'off' ? 'OFF' : e.draft === 'pattern' ? null : code(e.draft);
          if (e?.published) return e.isOff ? 'OFF' : code(e.shiftId);
          return null;
        });
      const f0 = people.length ? ((await guard.factsOn(people[0].id, week)) ?? (await guard.factsOn(people[0].id, addDays(week, 6)))) : null;
      const limits = f0 ? await guard.limits(f0, week) : null;
      const stale = run?.status === 'running' && Date.now() - run.startedAt.getTime() > STALE_MS;
      return {
        today: todayIn(loc.timezone ?? 'Asia/Kolkata'),
        week,
        to: addDays(week, 6),
        maxPeople: MAX_PEOPLE,
        locations: locs.map((l) => ({ id: l.id, name: l.name })),
        location: { id: loc.id, name: loc.name },
        shifts: this.shiftsView(book, week),
        demand: demand.map((d) => ({ shiftId: d.shiftId, weekday: d.weekday, need: d.need })),
        people: { count: total, used: people.length },
        rules: limits && { minRestHours: limits.minRestMinutes / 60, maxDailyHours: limits.dailyMinutes / 60, maxWeeklyHours: limits.weeklyMinutes / 60, maxSpreadOverHours: limits.spreadMinutes / 60, minWeeklyOffs: limits.minWeeklyOffs },
        drafts: entries.filter((e) => e.draft !== null).length,
        draft: people.map((p) => ({ id: p.id, name: p.name, code: p.code, days: days(p.id) })),
        run: run && {
          id: run.id,
          status: stale ? 'failed' : run.status,
          startedAt: run.startedAt.toISOString(),
          finishedAt: run.finishedAt?.toISOString() ?? null,
          error: stale ? STOPPED : run.error,
          result: run.result,
        },
      };
    });
  }

  // ------------------------------------------------------------------------------------------ demand

  /** Sets demand cells (need 0 removes a cell); audited before → after. */
  async setDemand(ctx: TenantContext, user: ScopeUser, dto: DemandDto) {
    const v = await this.planning.viewer(user);
    if (v.actingForOther) throw new ForbiddenException(ACTING);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const own = await this.planning.ownId(tx, c, v);
      const loc = await this.location(tx, c, v, own, dto.locationId, mondayOf(todayIst()));
      const seen = new Set<string>();
      for (const r of dto.rows) {
        const k = `${r.shiftId}|${r.weekday}`;
        if (seen.has(k)) throw new BadRequestException('Each shift and weekday is given once.');
        seen.add(k);
      }
      const shiftIds = new Set((await tx.shift.findMany({ where: { organizationId: org, active: true }, select: { id: true } })).map((s) => s.id));
      if (dto.rows.some((r) => !shiftIds.has(r.shiftId))) throw new BadRequestException('Choose a shift in use.');
      const before = new Map((await tx.rosterDemand.findMany({ where: { organizationId: org, locationId: loc.id } })).map((d) => [`${d.shiftId}|${d.weekday}`, d.need]));
      const changes: { shiftId: string; weekday: number; before: number; after: number }[] = [];
      for (const r of dto.rows) {
        const was = before.get(`${r.shiftId}|${r.weekday}`) ?? 0;
        if (was === r.need) continue;
        changes.push({ shiftId: r.shiftId, weekday: r.weekday, before: was, after: r.need });
        const key = { organizationId_locationId_shiftId_weekday: { organizationId: org, locationId: loc.id, shiftId: r.shiftId, weekday: r.weekday } };
        if (r.need === 0) await tx.rosterDemand.deleteMany({ where: { organizationId: org, locationId: loc.id, shiftId: r.shiftId, weekday: r.weekday } });
        else await tx.rosterDemand.upsert({ where: key, create: { organizationId: org, locationId: loc.id, shiftId: r.shiftId, weekday: r.weekday, need: r.need, updatedBy: c.userId ?? null }, update: { need: r.need, updatedBy: c.userId ?? null, updatedAt: new Date() } });
      }
      if (changes.length) await audit(tx, c, 'time.auto_roster.demand_set', 'location', loc.id, { changes });
      return { changed: changes.length };
    });
  }

  // ------------------------------------------------------------------------------------------ generate

  /** Drafts the week's empty days to meet the demand; the run is recorded running → done / failed. */
  async generate(ctx: TenantContext, user: ScopeUser, dto: GenerateDto) {
    const v = await this.planning.viewer(user);
    if (v.actingForOther) throw new ForbiddenException(ACTING);
    const week = mondayOf(dto.week);
    const runId = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const own = await this.planning.ownId(tx, c, v);
      const loc = await this.location(tx, c, v, own, dto.locationId, week);
      const today = todayIn(loc.zone);
      if (addDays(week, 6) < today) throw new BadRequestException('That week has passed. Choose this week or a later one.');
      if (week > addDays(today, MAX_DAYS_AHEAD)) throw new BadRequestException(`Plan up to ${MAX_DAYS_AHEAD} days ahead.`);
      if (!(await tx.rosterDemand.count({ where: { organizationId: org, locationId: loc.id, need: { gt: 0 } } }))) throw new ConflictException({ statusCode: 409, code: 'NO_DEMAND', message: `No demand is set for ${loc.name} yet. Set the people needed per shift on the Demand tab first.` });
      await tx.autoRosterRun.updateMany({ where: { organizationId: org, locationId: loc.id, week: asDate(week), status: 'running', startedAt: { lt: new Date(Date.now() - STALE_MS) } }, data: { status: 'failed', error: STOPPED, finishedAt: new Date() } });
      // The partial unique index lets only one run of a location week be "running": a second Generate inserts nothing.
      const [row] = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO auto_roster_runs (organization_id, location_id, week, started_by) VALUES (${org}::uuid, ${loc.id}::uuid, ${week}::date, ${c.userId ?? null}::uuid)
        ON CONFLICT DO NOTHING RETURNING id::text`;
      if (!row) throw new ConflictException({ statusCode: 409, code: 'RUNNING', message: `The auto-roster for ${loc.name}, week of ${week}, is already running. Wait for it to finish, then look at the result.` });
      return row.id;
    });
    try {
      return await inCompany(this.tenantPrisma, ctx, (tx, c) => this.work(tx, c, v, runId, dto.locationId, week), { timeout: 180_000 });
    } catch (e) {
      if (!(e instanceof HttpException)) this.log.error(`auto-roster run ${runId} failed`, e instanceof Error ? e.stack : String(e));
      const error = e instanceof HttpException ? String((e.getResponse() as { message?: unknown }).message ?? e.message).slice(0, 500) : FAILED;
      await inCompany(this.tenantPrisma, ctx, (tx, c) => tx.autoRosterRun.updateMany({ where: { organizationId: c.organizationId, id: runId, status: 'running' }, data: { status: 'failed', error, finishedAt: new Date() } })).catch(() => undefined);
      throw e;
    }
  }

  private async work(tx: Tx, c: CompanyContext, v: Viewer, runId: string, locationId: string, week: string) {
    const org = c.organizationId;
    const own = await this.planning.ownId(tx, c, v);
    const loc = await this.location(tx, c, v, own, locationId, week);
    const to = addDays(week, 6);
    const today = todayIn(loc.zone);
    const book = await ScheduleBook.load(tx, org);
    const guard = await RosterGuard.load(tx, c, book);
    const { byDay, people, total } = await this.peopleAt(tx, c, v, own, loc.id, week);
    const ids = people.map((p) => p.id);
    await book.prime(ids, addDays(week, -1), addDays(to, 1));
    const demand = await tx.rosterDemand.findMany({ where: { organizationId: org, locationId: loc.id, need: { gt: 0 } } });
    const entries = ids.length ? await tx.rosterEntry.findMany({ where: { organizationId: org, employeeId: { in: ids }, workOn: { gte: asDate(week), lte: asDate(to) } } }) : [];
    const taken = new Set(entries.filter((e) => e.published || e.draft !== null).map((e) => `${e.employeeId}|${dateOf(e.workOn)}`));

    // Each person's week as it stands (published, drafts, pattern): hours and nights for the fair order, and who already
    // counts on each shift.
    const plans = new Map<string, Map<string, { id: string | null; minutes: number; night: boolean }>>();
    const pool = new Map<string, Candidate>();
    for (const p of people) {
      const plan = await guard.plan(p.id, week, to, { drafts: true });
      plans.set(p.id, new Map(plan.map((d) => [d.on, d.employed && d.shift ? { id: d.shift.shiftId ?? '', minutes: scheduledMinutes(d.shift), night: d.shift.night } : { id: null, minutes: 0, night: false }])));
      pool.set(p.id, { employeeId: p.id, name: p.name, code: p.code, minutes: plan.reduce((n, d) => n + (d.employed && d.shift ? scheduledMinutes(d.shift) : 0), 0), nights: plan.filter((d) => d.employed && d.shift?.night).length });
    }
    const wanted = new Map<string, Set<string>>();
    for (const d of demand) for (let k = 0; k < 7; k++) if (weekday(addDays(week, k)) === d.weekday) wanted.set(addDays(week, k), new Set([...(wanted.get(addDays(week, k)) ?? []), d.shiftId]));

    const slots: (Slot & { closed: 'past' | 'no_times' | null; name: string; end: number })[] = [];
    for (const d of demand) {
      const on = addDays(week, d.weekday - 1);
      const t = book.shiftOn(d.shiftId, on);
      const s = book.shifts.get(d.shiftId);
      if (!s?.active) continue;
      const here = byDay.get(on) ?? [];
      const had = here.filter((id) => plans.get(id)?.get(on)?.id === d.shiftId).length;
      const closed = on < today || on > addDays(today, MAX_DAYS_AHEAD) ? 'past' : !t ? 'no_times' : null;
      slots.push({ on, shiftId: d.shiftId, code: s.code, name: s.name, start: t?.shiftStart ?? 0, end: t?.shiftEnd ?? 0, minutes: t ? scheduledMinutes(t) : 0, night: s.night, need: d.need, had, candidates: closed ? [] : here, closed });
    }

    // Per person, read once: leave (approved or waiting), holidays, locked days.
    const facts = new Map<string, { leave: Map<string, string>; holidays: Map<string, { name: string }>; locked: Set<string> }>();
    const factsOf = async (id: string) => {
      if (!facts.has(id)) facts.set(id, { leave: await leaveDays(tx, org, id, week, to, ['pending', 'approved', 'cancel_pending']), holidays: (await holidaysFor(tx, org, loc.id, week, to, id)).map, locked: await lockedDates(tx, org, id, week, to) });
      return facts.get(id)!;
    };
    const shiftName = (id: string) => book.shifts.get(id)?.name ?? 'usual';

    const results = await fill(
      slots,
      pool,
      async (cand, slot) => {
        const on = slot.on;
        if (taken.has(`${cand.employeeId}|${on}`)) return { kind: 'planned', why: 'Already has a draft or published shift that day' };
        const base = plans.get(cand.employeeId)?.get(on)?.id;
        if (base && wanted.get(on)?.has(base)) return { kind: 'planned', why: base === slot.shiftId ? 'Already on this shift by their pattern' : `Works the ${shiftName(base)} shift that day by their pattern (counted there)` };
        const f = await factsOf(cand.employeeId);
        const leave = f.leave.get(on);
        if (leave) return { kind: 'leave', why: leave === 'full' ? 'On leave that day (approved or waiting)' : 'On leave for half the day (approved or waiting)' };
        const hol = f.holidays.get(on);
        if (hol) return { kind: 'holiday', why: `Holiday: ${hol.name}` };
        if (f.locked.has(on)) return { kind: 'locked', why: 'The attendance month is locked' };
        const change = new Map([[on, slot.shiftId]]);
        const added = await guard.added(cand.employeeId, change, { drafts: true });
        // Also never onto a day that already breaks a rule once the shift is there (an old rest break stays a break).
        const span = RosterGuard.span([on]);
        const hit = added[0] ?? (await guard.breaks(cand.employeeId, await guard.plan(cand.employeeId, span.from, span.to, { drafts: true, changes: change }))).find((b) => b.on === on && BLOCKING.includes(b.kind));
        return hit ? { kind: RULE_TO_SKIP[hit.kind] ?? 'hours', why: hit.message } : null;
      },
      async (cand, slot) => {
        const where = { organizationId: org, employeeId: cand.employeeId, workOn: asDate(slot.on) };
        // Never over a draft or a published day: an empty leftover row is reused, otherwise a new row only if none exists.
        const reused = await tx.rosterEntry.updateMany({ where: { ...where, draft: null, published: false }, data: { draft: slot.shiftId, source: 'auto', updatedBy: c.userId ?? null, updatedAt: new Date() } });
        const made = reused.count ? reused : await tx.rosterEntry.createMany({ data: [{ ...where, draft: slot.shiftId, source: 'auto', updatedBy: c.userId ?? null }], skipDuplicates: true });
        if (!made.count) return false;
        taken.add(`${cand.employeeId}|${slot.on}`);
        // The placement replaces the pattern / usual shift of that day: fill() then adds the new shift's hours and night.
        const was = plans.get(cand.employeeId)?.get(slot.on);
        cand.minutes -= was?.minutes ?? 0;
        if (was?.night) cand.nights -= 1;
        return true;
      },
    );

    const bySlot = new Map(slots.map((s) => [`${s.on}|${s.shiftId}`, s]));
    const placed = results.flatMap((r) => r.placed.map((p) => ({ employeeId: p.employeeId, on: r.on, shiftId: r.shiftId })));
    const nights = [...pool.values()].filter((p) => p.nights > 0);
    const most = nights.sort((a, b) => b.nights - a.nights || a.name.localeCompare(b.name))[0];
    const result = {
      week,
      to,
      location: { id: loc.id, name: loc.name },
      generatedAt: new Date().toISOString(),
      people: total,
      capped: total > MAX_PEOPLE ? { total, used: MAX_PEOPLE } : null,
      placed: placed.length,
      coverage: coverage(results),
      nights: nights.length ? { min: nights[nights.length - 1].nights, max: most.nights, most: most.name } : null,
      slots: results.map((r) => {
        const s = bySlot.get(`${r.on}|${r.shiftId}`)!;
        return { ...r, weekday: WD[weekday(r.on) - 1], code: s.code, name: s.name, start: s.start, end: s.end, night: s.night, closed: s.closed };
      }),
    };
    await tx.autoRosterRun.update({ where: { id: runId }, data: { status: 'done', result: result as unknown as Prisma.InputJsonValue, finishedAt: new Date() } });
    await audit(tx, c, 'time.auto_roster.generated', 'auto_roster_run', runId, { locationId: loc.id, week, people: total, placed: placed.length, coverage: result.coverage, placements: placed.slice(0, 200) });
    return { id: runId, status: 'done', result };
  }
}
