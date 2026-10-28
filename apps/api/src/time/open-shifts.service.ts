import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type OpenShift } from '@prisma/client';
import { DateTime } from 'luxon';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { NotificationsService } from '../notifications/notifications.service';
import { CompanyContext, Tx, audit, inCompany } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { SETTINGS, resolveSetting } from '../org-structure/settings-registry';
import { Viewer, buildViewer, type ScopeUser } from '../access/scope';
import { DayEngine } from './day-engine.service';
import { ScheduleBook, assertOpen } from './schedule';
import { TIME_KEYS, asDate, dateOf, leaveDays, mustSee, myEmployeeId, todayIn, visibleSql } from './time-core';
import { addDays } from './time-maths';
import { mondayOf, scheduledMinutes } from './time-rules';
import { RosterGuard } from './roster-guard';
import { GUARD_CODE, licenceValid } from './roster-rules';
import { fairOrder, startsAt } from './roster-extras-rules';
import type { AwardDto, CancelOpenShiftDto, OpenShiftDto } from './roster-extras.dto';

// TIM-35 Open shifts and bids (feature sheet rule 9 in docs/yukthix/time-design-map.md).
//   Who: offer, list, award, cancel = a planner: a manager for their own team (implicit) or roster.manage in scope, at a
//   location where they plan someone; the winner must be someone they plan, never themselves. Claim, bid, withdraw and
//   "my open shifts" = the signed-in person only. Nothing here while acting for someone else. Another company's ids: 404.
//   Eligible = employed at that location that day, not on approved leave, off that day, holds the open shift's licence,
//   and the placement adds no rule break (rules 1–4 and 8 through RosterGuard). First come: the first eligible claim wins
//   (row lock; a second claim gets 409). Manager picks: bids until closes_at, fair order suggested, award re-checked.

export const MAX_DAYS_AHEAD = 120;
const MAX_ROWS = 200;
const fmt = (iso: string) => DateTime.fromISO(iso, { zone: 'utc' }).toFormat('d LLL yyyy');
const hhmm = (m: number) => `${String(Math.floor((m % 1440) / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const ACTING = 'Not available while acting for someone else.';

export type Refusal = { code: string; why: string };
interface BidRow { id: string; employeeId: string; name: string; code: string | null; status: string; bidAt: string; eligible: boolean; why: string | null; code409: string | null; won30: number; weekMinutes: number; rank: number | null }

/** Who the viewer may plan: a manager's own team or roster.manage in scope (shared with standby). */
export class Planning {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
  ) {}

  viewer(user: ScopeUser): Promise<Viewer> {
    return buildViewer(this.prisma, this.tenantPrisma, user, [...TIME_KEYS]);
  }

  async ownId(tx: Tx, c: CompanyContext, v: Viewer) {
    if (!v.userId || v.actingForOther) return null;
    return (await tx.employee.findFirst({ where: { organizationId: c.organizationId, userId: v.userId }, select: { id: true } }))?.id ?? null;
  }

  /** Planning reach for one person on a day; never one's own row (403); out of reach or another company: 404. */
  async mustPlan(tx: Tx, c: CompanyContext, v: Viewer, own: string | null, employeeId: string, on: string) {
    const rel = await mustSee(tx, c, v, own, 'roster.manage', employeeId, on);
    if (rel === 'self') throw new ForbiddenException('Your own shifts are planned by your manager or HR.');
  }

  /** The people (and their location) the viewer plans on `on`, never themselves. */
  async reach(tx: Tx, c: CompanyContext, v: Viewer, own: string | null, on: string, limit = 500) {
    const cond = await visibleSql(tx, c, v, own, 'roster.manage', Prisma.sql`e.id`, on);
    return tx.$queryRaw<{ id: string; locationId: string }[]>`
      SELECT e.id::text, a.location_id::text AS "locationId" FROM employees e
      JOIN employee_assignments a ON a.organization_id = e.organization_id AND a.employee_id = e.id AND a.superseded_at IS NULL AND ${on}::date <@ daterange(a.valid_from, a.valid_to, '[]')
      JOIN employments m ON m.organization_id = e.organization_id AND m.id = a.employment_id AND m.joined_on <= ${on}::date AND (m.exited_on IS NULL OR m.exited_on >= ${on}::date)
      WHERE e.organization_id = ${c.organizationId}::uuid AND (${own}::uuid IS NULL OR e.id <> ${own}::uuid) AND ${cond}
      ORDER BY 1 LIMIT ${limit}`;
  }

  async locations(tx: Tx, c: CompanyContext, v: Viewer, own: string | null, on: string) {
    return [...new Set((await this.reach(tx, c, v, own, on)).map((r) => r.locationId))];
  }
}

/** Writes one published day (rule 5 entries: the source says where it came from; the reason when it was late). */
export async function placeDay(tx: Tx, c: CompanyContext, days: DayEngine, employeeId: string, on: string, shiftId: string | null, source: 'open' | 'callout', reason: string | null) {
  const key = { organizationId_employeeId_workOn: { organizationId: c.organizationId, employeeId, workOn: asDate(on) } };
  const data = { shiftId, isOff: shiftId === null, published: true, draft: null, source, publishedAt: new Date(), publishedBy: c.userId ?? null, changeReason: reason, updatedBy: c.userId ?? null, updatedAt: new Date() };
  await tx.rosterEntry.upsert({ where: key, create: { organizationId: c.organizationId, employeeId, workOn: asDate(on), ...data }, update: data });
  if (on <= todayIst()) await days.evaluate(tx, c, employeeId, on, on);
}

export async function userIdsOf(tx: Tx, org: string, employeeIds: string[]) {
  if (!employeeIds.length) return [];
  return (await tx.employee.findMany({ where: { organizationId: org, id: { in: employeeIds } }, select: { userId: true } })).map((e) => e.userId).filter((x): x is string => Boolean(x));
}

@Injectable()
export class OpenShiftsService {
  private readonly planning: Planning;

  constructor(
    prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly days: DayEngine,
    private readonly notifications: NotificationsService,
  ) {
    this.planning = new Planning(prisma, tenantPrisma);
  }

  private tell(ctx: TenantContext, users: string[], id: string, text: string, link: string) {
    if (!users.length) return Promise.resolve();
    return this.notifications.notifySystem(ctx, users, 'time.open_shift', { entityType: 'open_shift', entityId: id, contextText: text, linkPath: link }, { subject: text, html: `<p>${text.replace(/[<>&]/g, '')}. Open YukthiX to see your shifts.</p>` }).catch(() => undefined);
  }

  private async zoneOf(tx: Tx, org: string, locationId: string) {
    return (await tx.location.findFirst({ where: { organizationId: org, id: locationId }, select: { timezone: true } }))?.timezone ?? 'Asia/Kolkata';
  }

  /** Rule 9 eligibility for one person; a refusal carries the guard's code. */
  private async eligibility(tx: Tx, c: CompanyContext, guard: RosterGuard, os: OpenShift, employeeId: string): Promise<Refusal | null> {
    const on = dateOf(os.workOn);
    const f = await guard.factsOn(employeeId, on);
    if (!f || f.locationId !== os.locationId) return { code: 'NOT_ELIGIBLE', why: 'Does not work at this location that day' };
    if ((await leaveDays(tx, c.organizationId, employeeId, on, on)).size) return { code: 'ON_LEAVE', why: 'On approved leave that day' };
    const now = (await guard.book.day(f, on)).shift;
    if (now) return { code: 'ALREADY_WORKING', why: `Already on the ${now.name} shift that day` };
    if (os.licenceTypeId) {
      const held = await tx.employeeLicence.findMany({ where: { organizationId: c.organizationId, employeeId, licenceTypeId: os.licenceTypeId, removedAt: null } });
      if (!licenceValid(held.map((h) => ({ licenceTypeId: h.licenceTypeId, validFrom: dateOf(h.validFrom), expiresOn: h.expiresOn ? dateOf(h.expiresOn) : null })), os.licenceTypeId, on)) {
        const t = await tx.licenceType.findFirst({ where: { organizationId: c.organizationId, id: os.licenceTypeId }, select: { name: true } });
        return { code: 'LICENCE_GUARD', why: `No valid ${t?.name ?? 'licence'} on this day` };
      }
    }
    const added = await guard.added(employeeId, new Map([[on, os.shiftId]]));
    if (added.length) return { code: GUARD_CODE[added[0].kind], why: added[0].message };
    return null;
  }

  private refuse(name: string, r: Refusal, tail: string): never {
    throw new ConflictException({ statusCode: 409, code: r.code, message: `${name}: ${r.why}. ${tail}` });
  }

  /** The company's rule for a location (roster.open_shift_rule, most specific scope). */
  private async ruleAt(tx: Tx, c: CompanyContext, loc: { id: string; legalEntityId: string }) {
    const rows = await tx.setting.findMany({ where: { organizationId: c.organizationId, key: 'roster.open_shift_rule' } });
    return String(resolveSetting(SETTINGS['roster.open_shift_rule'], rows.map((r) => ({ id: r.id, scopeType: r.scopeType, scopeId: r.scopeId, value: r.value, validFrom: r.validFrom ? dateOf(r.validFrom) : null })), { tenant: c.organizationId, location: loc.id, legal_entity: loc.legalEntityId }, null).value) as 'manager_picks' | 'first_come';
  }

  private shiftView(book: ScheduleBook, shiftId: string, on: string) {
    const s = book.shiftOn(shiftId, on);
    return s ? { id: shiftId, name: s.name, start: hhmm(s.shiftStart), end: hhmm(s.shiftEnd), night: s.night } : { id: shiftId, name: 'Shift', start: null, end: null, night: false };
  }

  // ------------------------------------------------------------------------------------------ the planner

  /** Open shifts at the locations the viewer plans, with each bid's eligibility and the fair order; set-up lists for the offer form. */
  async list(ctx: TenantContext, user: ScopeUser, show: 'open' | 'all' = 'open') {
    const v = await this.planning.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const own = await this.planning.ownId(tx, c, v);
      const today = todayIst();
      const locIds = await this.planning.locations(tx, c, v, own, today);
      if (!locIds.length) throw new ForbiddenException('You plan no one, so there are no open shifts for you to manage.');
      const book = await ScheduleBook.load(tx, org);
      const guard = await RosterGuard.load(tx, c, book);
      const [locs, shifts, licences, rows] = await Promise.all([
        tx.location.findMany({ where: { organizationId: org, id: { in: locIds } }, select: { id: true, name: true, legalEntityId: true, timezone: true }, orderBy: { name: 'asc' } }),
        tx.shift.findMany({ where: { organizationId: org, active: true }, orderBy: { code: 'asc' } }),
        tx.licenceType.findMany({ where: { organizationId: org, active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
        tx.openShift.findMany({ where: { organizationId: org, locationId: { in: locIds }, ...(show === 'open' ? { status: 'open', workOn: { gte: asDate(today) } } : { workOn: { gte: asDate(addDays(today, -30)) } }) }, orderBy: [{ workOn: 'asc' }, { createdAt: 'asc' }], take: MAX_ROWS }),
      ]);
      const bids = rows.length ? await tx.openShiftBid.findMany({ where: { organizationId: org, openShiftId: { in: rows.map((r) => r.id) } }, orderBy: { createdAt: 'asc' } }) : [];
      const locName = new Map(locs.map((l) => [l.id, l.name]));
      const licName = new Map(licences.map((l) => [l.id, l.name]));
      const out = [];
      for (const os of rows) {
        const on = dateOf(os.workOn);
        const monday = mondayOf(on);
        const list: BidRow[] = [];
        for (const b of bids.filter((x) => x.openShiftId === os.id)) {
          const f = await guard.factsOn(b.employeeId, on);
          const name = f?.name ?? 'Someone who has left';
          let refusal: Refusal | null = null;
          let won30 = 0;
          let weekMinutes = 0;
          if (os.status === 'open' && b.status === 'waiting') {
            refusal = await this.eligibility(tx, c, guard, os, b.employeeId);
            if (!refusal) {
              try {
                await this.planning.mustPlan(tx, c, v, own, b.employeeId, on);
              } catch {
                refusal = { code: 'NOT_YOURS', why: 'Planned by another manager' };
              }
            }
            won30 = await tx.openShift.count({ where: { organizationId: org, awardedEmployeeId: b.employeeId, status: 'awarded', workOn: { gte: asDate(addDays(on, -30)), lt: asDate(on) } } });
            weekMinutes = (await guard.plan(b.employeeId, monday, addDays(monday, 6))).reduce((n, d) => n + (d.employed && d.shift ? scheduledMinutes(d.shift) : 0), 0);
          }
          list.push({ id: b.id, employeeId: b.employeeId, name, code: f?.code ?? null, status: b.status, bidAt: b.createdAt.toISOString(), eligible: b.status === 'waiting' && os.status === 'open' && !refusal, why: refusal?.why ?? null, code409: refusal?.code ?? null, won30, weekMinutes, rank: null });
        }
        const ranked = fairOrder(list.filter((b) => b.eligible).map((b) => ({ ...b, bidAt: new Date(b.bidAt) })));
        ranked.forEach((b, i) => (list.find((x) => x.id === b.id)!.rank = i + 1));
        list.sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9) || a.bidAt.localeCompare(b.bidAt));
        const awarded = os.awardedEmployeeId ? await guard.factsOn(os.awardedEmployeeId, on) : null;
        out.push({
          id: os.id,
          on,
          location: { id: os.locationId, name: locName.get(os.locationId) ?? 'Location' },
          shift: this.shiftView(book, os.shiftId, on),
          licence: os.licenceTypeId ? { id: os.licenceTypeId, name: licName.get(os.licenceTypeId) ?? 'Licence' } : null,
          rule: os.rule,
          status: os.status,
          closesAt: os.closesAt?.toISOString() ?? null,
          note: os.note,
          awarded: os.awardedEmployeeId ? { employeeId: os.awardedEmployeeId, name: awarded?.name ?? 'Someone' } : null,
          version: os.version,
          bids: list.map(({ code409: _c, ...b }) => ({ ...b, refusalCode: _c })),
        });
      }
      return {
        today,
        maxDaysAhead: MAX_DAYS_AHEAD,
        locations: await Promise.all(locs.map(async (l) => ({ id: l.id, name: l.name, rule: await this.ruleAt(tx, c, l) }))),
        shifts: shifts.map((s) => this.shiftView(book, s.id, today)).filter((s) => s.start !== null),
        licenceTypes: licences,
        rows: out,
      };
    });
  }

  async offer(ctx: TenantContext, user: ScopeUser, dto: OpenShiftDto) {
    const v = await this.planning.viewer(user);
    if (v.actingForOther) throw new ForbiddenException(ACTING);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const own = await this.planning.ownId(tx, c, v);
      const loc = await tx.location.findFirst({ where: { organizationId: org, id: dto.locationId }, select: { id: true, name: true, legalEntityId: true, timezone: true } });
      if (!loc) throw new NotFoundException('No such location.');
      const zone = loc.timezone ?? 'Asia/Kolkata';
      const today = todayIn(zone);
      if (dto.on < today) throw new BadRequestException('Offer a day from today on.');
      if (dto.on > addDays(today, MAX_DAYS_AHEAD)) throw new BadRequestException(`Offer a day within the next ${MAX_DAYS_AHEAD} days.`);
      // Only where the planner plans someone that day: anywhere else is "not found".
      if (!(await this.planning.locations(tx, c, v, own, dto.on)).includes(loc.id)) throw new NotFoundException('No such location.');
      const shift = await tx.shift.findFirst({ where: { organizationId: org, id: dto.shiftId, active: true } });
      if (!shift) throw new NotFoundException('No such shift.');
      const book = await ScheduleBook.load(tx, org);
      const times = book.shiftOn(shift.id, dto.on);
      if (!times) throw new BadRequestException(`${shift.name} has no times on ${fmt(dto.on)}. Pick another day or shift.`);
      const begins = startsAt(dto.on, times.shiftStart, zone);
      if (begins.getTime() <= Date.now()) throw new BadRequestException('That shift has already started. Offer a later one.');
      if (dto.licenceTypeId && !(await tx.licenceType.findFirst({ where: { organizationId: org, id: dto.licenceTypeId, active: true } }))) throw new NotFoundException('No such licence type.');
      let closesAt: Date | null = null;
      if (dto.closesAt) {
        closesAt = new Date(dto.closesAt);
        if (closesAt.getTime() <= Date.now() || closesAt.getTime() > begins.getTime()) throw new BadRequestException('Bids must close after now and no later than the shift starts.');
      }
      const rule = dto.rule ?? (await this.ruleAt(tx, c, loc));
      const os = await tx.openShift.create({ data: { organizationId: org, locationId: loc.id, shiftId: shift.id, workOn: asDate(dto.on), licenceTypeId: dto.licenceTypeId ?? null, rule, closesAt, note: dto.note?.trim() || null, createdBy: c.userId ?? null } });
      await audit(tx, c, 'time.open_shift.offered', 'open_shift', os.id, { on: dto.on, locationId: loc.id, shiftId: shift.id, licenceTypeId: dto.licenceTypeId ?? null, rule, closesAt: closesAt?.toISOString() ?? null });
      return { id: os.id, rule, status: os.status, version: os.version };
    });
  }

  async award(ctx: TenantContext, user: ScopeUser, id: string, dto: AwardDto) {
    const v = await this.planning.viewer(user);
    if (v.actingForOther) throw new ForbiddenException(ACTING);
    const res = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const own = await this.planning.ownId(tx, c, v);
      const os = await tx.openShift.findFirst({ where: { organizationId: org, id } });
      const on = os ? dateOf(os.workOn) : '';
      if (!os || !(await this.planning.locations(tx, c, v, own, on)).includes(os.locationId)) throw new NotFoundException('No such open shift.');
      await this.planning.mustPlan(tx, c, v, own, dto.employeeId, on);
      if (os.status !== 'open') throw new ConflictException({ statusCode: 409, code: 'ALREADY_DONE', message: `This open shift was already ${os.status}. Reload to see who has it.` });
      if (os.version !== dto.version) throw new ConflictException({ statusCode: 409, code: 'STALE', message: 'Someone changed this open shift since you opened it. Reload and try again.' });
      const zone = await this.zoneOf(tx, org, os.locationId);
      const book = await ScheduleBook.load(tx, org);
      const times = book.shiftOn(os.shiftId, on);
      if (!times || startsAt(on, times.shiftStart, zone).getTime() <= Date.now()) throw new ConflictException({ statusCode: 409, code: 'TOO_LATE', message: 'This shift has started, so it can no longer be awarded. Cancel it instead.' });
      const bid = await tx.openShiftBid.findFirst({ where: { organizationId: org, openShiftId: os.id, employeeId: dto.employeeId, status: 'waiting' } });
      if (!bid) throw new NotFoundException('This person has no waiting bid for the shift.');
      // Checked again now: the roster may have changed since the bid.
      const guard = await RosterGuard.load(tx, c, book);
      const r = await this.eligibility(tx, c, guard, os, dto.employeeId);
      const name = (await guard.factsOn(dto.employeeId, on))?.name ?? 'This person';
      if (r) this.refuse(name, r, 'The shift was not awarded.');
      await assertOpen(tx, org, dto.employeeId, on);
      const n = await tx.openShift.updateMany({ where: { organizationId: org, id: os.id, version: dto.version, status: 'open' }, data: { status: 'awarded', awardedEmployeeId: dto.employeeId, decidedBy: c.userId ?? null, decidedAt: new Date(), version: { increment: 1 } } });
      if (!n.count) throw new ConflictException({ statusCode: 409, code: 'STALE', message: 'Someone changed this open shift since you opened it. Reload and try again.' });
      await placeDay(tx, c, this.days, dto.employeeId, on, os.shiftId, 'open', null);
      await tx.openShiftBid.update({ where: { id: bid.id }, data: { status: 'won' } });
      const losers = await tx.openShiftBid.findMany({ where: { organizationId: org, openShiftId: os.id, status: 'waiting' } });
      await tx.openShiftBid.updateMany({ where: { organizationId: org, openShiftId: os.id, status: 'waiting' }, data: { status: 'lost' } });
      await audit(tx, c, 'time.open_shift.awarded', 'open_shift', os.id, { on, employeeId: dto.employeeId, before: 'off', after: os.shiftId, lost: losers.map((l) => l.employeeId) });
      return { on, shift: times.name, name, winner: await userIdsOf(tx, org, [dto.employeeId]), losers: await userIdsOf(tx, org, losers.map((l) => l.employeeId)) };
    });
    // The people are told after the commit.
    await this.tell(ctx, res.winner, id, `You got the open ${res.shift} shift on ${fmt(res.on)}`, '/yx/time/shifts');
    await this.tell(ctx, res.losers, id, `The open ${res.shift} shift on ${fmt(res.on)} went to someone else`, '/yx/time/shifts');
    return { id, status: 'awarded', employeeId: dto.employeeId };
  }

  async cancel(ctx: TenantContext, user: ScopeUser, id: string, dto: CancelOpenShiftDto) {
    const v = await this.planning.viewer(user);
    if (v.actingForOther) throw new ForbiddenException(ACTING);
    const res = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const own = await this.planning.ownId(tx, c, v);
      const os = await tx.openShift.findFirst({ where: { organizationId: org, id } });
      if (!os || !(await this.planning.locations(tx, c, v, own, dateOf(os.workOn))).includes(os.locationId)) throw new NotFoundException('No such open shift.');
      if (os.status !== 'open') throw new ConflictException({ statusCode: 409, code: 'ALREADY_DONE', message: `This open shift was already ${os.status}.` });
      const n = await tx.openShift.updateMany({ where: { organizationId: org, id, version: dto.version, status: 'open' }, data: { status: 'cancelled', decidedBy: c.userId ?? null, decidedAt: new Date(), version: { increment: 1 } } });
      if (!n.count) throw new ConflictException({ statusCode: 409, code: 'STALE', message: 'Someone changed this open shift since you opened it. Reload and try again.' });
      const waiting = await tx.openShiftBid.findMany({ where: { organizationId: org, openShiftId: id, status: 'waiting' } });
      await tx.openShiftBid.updateMany({ where: { organizationId: org, openShiftId: id, status: 'waiting' }, data: { status: 'lost' } });
      await audit(tx, c, 'time.open_shift.cancelled', 'open_shift', id, { on: dateOf(os.workOn), reason: dto.reason?.trim() || null, bids: waiting.length });
      return { on: dateOf(os.workOn), users: await userIdsOf(tx, org, waiting.map((w) => w.employeeId)) };
    });
    await this.tell(ctx, res.users, id, `The open shift on ${fmt(res.on)} you bid for was cancelled`, '/yx/time/shifts');
    return { id, status: 'cancelled' };
  }

  // ------------------------------------------------------------------------------------------ me

  /** Open shifts I can take (or have bid for / won), from today. */
  async mine(ctx: TenantContext) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const me = await myEmployeeId(tx, org, c.userId);
      const today = todayIst();
      const book = await ScheduleBook.load(tx, org);
      const guard = await RosterGuard.load(tx, c, book);
      const [rows, bids] = await Promise.all([
        tx.openShift.findMany({ where: { organizationId: org, workOn: { gte: asDate(today), lte: asDate(addDays(today, MAX_DAYS_AHEAD)) }, OR: [{ status: 'open' }, { awardedEmployeeId: me }] }, orderBy: { workOn: 'asc' }, take: MAX_ROWS }),
        tx.openShiftBid.findMany({ where: { organizationId: org, employeeId: me } }),
      ]);
      const locs = new Map((await tx.location.findMany({ where: { organizationId: org, id: { in: [...new Set(rows.map((r) => r.locationId))] } }, select: { id: true, name: true } })).map((l) => [l.id, l.name]));
      const out = [];
      for (const os of rows) {
        const on = dateOf(os.workOn);
        const f = await guard.factsOn(me, on);
        if (!f || f.locationId !== os.locationId) continue;
        const bid = bids.find((b) => b.openShiftId === os.id) ?? null;
        const refusal = os.status === 'open' && bid?.status !== 'waiting' ? await this.eligibility(tx, c, guard, os, me) : null;
        if (refusal && !bid) continue;
        out.push({ id: os.id, on, location: locs.get(os.locationId) ?? 'Location', shift: this.shiftView(book, os.shiftId, on), rule: os.rule, status: os.status, closesAt: os.closesAt?.toISOString() ?? null, note: os.note, myBid: os.awardedEmployeeId === me ? 'won' : (bid?.status ?? null), eligible: !refusal, why: refusal?.why ?? null });
      }
      return { today, rows: out };
    });
  }

  /** First come: the first eligible claim takes it (row lock). Manager picks: a bid until the close. */
  async claim(ctx: TenantContext, user: ScopeUser, id: string) {
    if (user.impersonatorUserId || user.actingSuperAdmin) throw new ForbiddenException(ACTING);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const me = await myEmployeeId(tx, org, c.userId);
      // Two claims at once: the second waits here, then sees the shift taken.
      const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id::text FROM open_shifts WHERE organization_id = ${org}::uuid AND id = ${id}::uuid FOR UPDATE`;
      const os = locked.length ? await tx.openShift.findFirst({ where: { organizationId: org, id } }) : null;
      const on = os ? dateOf(os.workOn) : '';
      const book = await ScheduleBook.load(tx, org);
      const guard = await RosterGuard.load(tx, c, book);
      const f = os ? await guard.factsOn(me, on) : null;
      if (!os || !f || f.locationId !== os.locationId) throw new NotFoundException('No such open shift.');
      const bid = await tx.openShiftBid.findFirst({ where: { organizationId: org, openShiftId: id, employeeId: me } });
      if (os.status === 'awarded') throw new ConflictException({ statusCode: 409, code: 'TAKEN', message: os.awardedEmployeeId === me ? 'This shift is already yours.' : 'Someone else got this shift first.' });
      if (os.status === 'cancelled') throw new ConflictException({ statusCode: 409, code: 'CANCELLED', message: 'This open shift was cancelled.' });
      if (bid?.status === 'waiting') return { id, status: 'waiting' };
      const times = book.shiftOn(os.shiftId, on);
      const zone = await this.zoneOf(tx, org, os.locationId);
      if (!times || startsAt(on, times.shiftStart, zone).getTime() <= Date.now()) throw new ConflictException({ statusCode: 409, code: 'TOO_LATE', message: 'This shift has started.' });
      if (os.closesAt && os.closesAt.getTime() <= Date.now()) throw new ConflictException({ statusCode: 409, code: 'CLOSED', message: `Bids for this shift closed on ${DateTime.fromJSDate(os.closesAt, { zone }).toFormat('d LLL yyyy, h:mm a')}.` });
      const r = await this.eligibility(tx, c, guard, os, me);
      if (r) this.refuse('You can’t take this shift', r, 'Nothing was sent.');
      const key = { organizationId_openShiftId_employeeId: { organizationId: org, openShiftId: id, employeeId: me } };
      if (os.rule === 'first_come') {
        await assertOpen(tx, org, me, on);
        await tx.openShift.update({ where: { id }, data: { status: 'awarded', awardedEmployeeId: me, decidedAt: new Date(), version: { increment: 1 } } });
        await tx.openShiftBid.upsert({ where: key, create: { organizationId: org, openShiftId: id, employeeId: me, status: 'won' }, update: { status: 'won' } });
        await placeDay(tx, c, this.days, me, on, os.shiftId, 'open', null);
        await audit(tx, c, 'time.open_shift.claimed', 'open_shift', id, { on, employeeId: me, before: 'off', after: os.shiftId });
        return { id, status: 'won' };
      }
      await tx.openShiftBid.upsert({ where: key, create: { organizationId: org, openShiftId: id, employeeId: me }, update: { status: 'waiting', createdAt: new Date() } });
      await audit(tx, c, 'time.open_shift.bid', 'open_shift', id, { on, employeeId: me });
      return { id, status: 'waiting' };
    });
  }

  async withdraw(ctx: TenantContext, user: ScopeUser, id: string) {
    if (user.impersonatorUserId || user.actingSuperAdmin) throw new ForbiddenException(ACTING);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const me = await myEmployeeId(tx, org, c.userId);
      const bid = await tx.openShiftBid.findFirst({ where: { organizationId: org, openShiftId: id, employeeId: me } });
      if (!bid) throw new NotFoundException('You have no bid for this shift.');
      if (bid.status !== 'waiting') throw new ConflictException({ statusCode: 409, code: 'ALREADY_DONE', message: 'Only a bid still waiting can be withdrawn.' });
      await tx.openShiftBid.update({ where: { id: bid.id }, data: { status: 'withdrawn' } });
      await audit(tx, c, 'time.open_shift.bid_withdrawn', 'open_shift', id, { employeeId: me });
      return { id, status: 'withdrawn' };
    });
  }
}
