import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DateTime } from 'luxon';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { NotificationsService } from '../notifications/notifications.service';
import { audit, inCompany } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { SETTINGS, resolveSetting } from '../org-structure/settings-registry';
import type { ScopeUser } from '../access/scope';
import { DayEngine } from './day-engine.service';
import { ScheduleBook, assertOpen } from './schedule';
import { settingOn, todayIn, type Facts } from './time-core';
import { addDays, instantAt } from './time-maths';
import { mondayOf } from './time-rules';
import { RosterGuard } from './roster-guard';
import { insideNotice } from './roster-rules';
import { MAX_SLOT_MINUTES, localDay, minutesBetween, nextShift, paidMinutes, slotSpanError, startsAt } from './roster-extras-rules';
import { Planning, placeDay, userIdsOf } from './open-shifts.service';
import type { CallOutDto, MoveShiftDto, SlotDto } from './roster-extras.dto';

// TIM-38 Standby and call-out (feature sheet rule 10 in docs/yukthix/time-design-map.md).
//   Who: everything here = a planner (a manager for their own team, or roster.manage in scope), never for their own row,
//   never while acting for someone else. Another company's ids: 404.
//   A slot is at most 24 h, never overlaps another planned slot of the person, and sits at the person's location; only a
//   slot that has not started can be cancelled. A call-out starts inside a planned slot of the person, is logged after it
//   ends, and is paid at least standby.call_out_minimum_hours (2) whatever was worked; the same client_ref twice returns
//   the first. The log shows the rest left before the person's next shift (rule 1, attendance.min_rest_hours); moving
//   that shift is a published change (rule 5: a reason inside roster.change_notice_hours), checked by RosterGuard first.
//   Standby allowance and call-out pay rates belong to payroll (PAY on-call rules): no money here.

const ACTING = 'Not available while acting for someone else.';
const IST = 'Asia/Kolkata';
const fmt = (iso: string) => DateTime.fromISO(iso, { zone: 'utc' }).toFormat('d LLL yyyy');
const hhmm = (m: number) => `${String(Math.floor((m % 1440) / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const LATE_MS = 5 * 60_000;

@Injectable()
export class StandbyService {
  private readonly planning: Planning;

  constructor(
    prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly days: DayEngine,
    private readonly notifications: NotificationsService,
  ) {
    this.planning = new Planning(prisma, tenantPrisma);
  }

  private async facts(guard: RosterGuard, employeeId: string, at: Date): Promise<Facts> {
    const f = await guard.factsOn(employeeId, localDay(at, IST));
    if (!f) throw new NotFoundException('Not found');
    return f;
  }

  /** Rule 1 after a call-out: the person's next shift (published) and the rest left before it. */
  private async restAfter(guard: RosterGuard, f: Facts, ended: Date) {
    const day = localDay(ended, f.zone);
    const plan = await guard.plan(f.employeeId, addDays(day, -1), addDays(day, 7));
    const next = nextShift(plan.filter((d) => d.employed), f.zone, ended);
    const minRestMinutes = (await guard.limits(f, day)).minRestMinutes;
    if (!next) return { next: null, restMinutes: null, minRestMinutes, short: false };
    const restMinutes = minutesBetween(ended, next.at);
    return { next: { on: next.on, shiftId: next.shift.shiftId, name: next.shift.name, start: hhmm(next.shift.shiftStart), end: hhmm(next.shift.shiftEnd), startsAt: next.at.toISOString() }, restMinutes, minRestMinutes, short: restMinutes < minRestMinutes };
  }

  /** The week's standby slots and call-outs for the people the viewer plans, the rest check on each call-out, and the lists for the dialogs. */
  async week(ctx: TenantContext, user: ScopeUser, weekIn?: string) {
    const v = await this.planning.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const own = await this.planning.ownId(tx, c, v);
      const today = todayIst();
      const week = mondayOf(weekIn ?? today);
      const reach = await this.planning.reach(tx, c, v, own, today);
      if (!reach.length) throw new ForbiddenException('You plan no one, so there is no standby for you to manage.');
      const ids = reach.map((r) => r.id);
      // shortcut: the week runs Monday to Monday in IST; a location in another zone sees its slots by IST days.
      const [from, to] = [instantAt(week, IST, 0), instantAt(addDays(week, 7), IST, 0)];
      const [slots, callOuts, shifts, settingRows] = await Promise.all([
        tx.standbySlot.findMany({ where: { organizationId: org, employeeId: { in: ids }, startsAt: { lt: to }, endsAt: { gt: from } }, orderBy: { startsAt: 'asc' } }),
        tx.callOut.findMany({ where: { organizationId: org, employeeId: { in: ids }, startedAt: { gte: from, lt: to } }, orderBy: { startedAt: 'desc' }, take: 200 }),
        tx.shift.findMany({ where: { organizationId: org }, orderBy: { code: 'asc' } }),
        tx.setting.findMany({ where: { organizationId: org, key: 'standby.call_out_minimum_hours', scopeType: 'tenant' } }),
      ]);
      const book = await ScheduleBook.load(tx, org);
      const guard = await RosterGuard.load(tx, c, book);
      const codeOf = new Map(shifts.map((s) => [s.id, s.code]));
      const name = async (id: string) => (await guard.factsOn(id, today))?.name ?? (await guard.factsOn(id, week))?.name ?? 'Someone';
      // The grid: everyone with a slot this week, their published shifts and which days hold a standby start.
      const people = [];
      for (const id of [...new Set(slots.map((s) => s.employeeId))]) {
        const plan = await guard.plan(id, week, addDays(week, 6));
        const f = await guard.factsOn(id, today);
        const zone = f?.zone ?? IST;
        people.push({
          employeeId: id,
          name: await name(id),
          days: plan.map((d) => ({ on: d.on, employed: d.employed, shift: d.shift ? { id: d.shift.shiftId, code: d.shift.shiftId ? (codeOf.get(d.shift.shiftId) ?? null) : null, name: d.shift.name, start: hhmm(d.shift.shiftStart), end: hhmm(d.shift.shiftEnd) } : null, standby: slots.some((s) => s.employeeId === id && s.status === 'planned' && localDay(s.startsAt, zone) === d.on) })),
        });
      }
      const log: ({ id: string; employeeId: string } & Record<string, unknown>)[] = [];
      for (const co of callOuts) {
        const f = await this.facts(guard, co.employeeId, co.startedAt).catch(() => null);
        log.push({
          id: co.id,
          employeeId: co.employeeId,
          name: await name(co.employeeId),
          startedAt: co.startedAt.toISOString(),
          endedAt: co.endedAt.toISOString(),
          workedMinutes: co.workedMinutes,
          paidMinutes: co.paidMinutes,
          minimumApplied: co.paidMinutes > co.workedMinutes,
          reason: co.reason,
          ...(f ? await this.restAfter(guard, f, co.endedAt) : { next: null, restMinutes: null, minRestMinutes: null, short: false }),
        });
      }
      // The latest call-out of each person is the one that sets their rest; only it offers "Move next shift".
      const latest = new Set<string>();
      for (const r of log) if (![...latest].some((id) => log.find((x) => x.id === id)!.employeeId === r.employeeId)) latest.add(r.id);
      return {
        week,
        today,
        minimumHours: Number(resolveSetting(SETTINGS['standby.call_out_minimum_hours'], settingRows.map((r) => ({ id: r.id, scopeType: r.scopeType, scopeId: r.scopeId, value: r.value, validFrom: null })), { tenant: org }, null).value),
        planned: await Promise.all(reach.slice(0, 200).map(async (r) => ({ employeeId: r.id, name: await name(r.id) }))),
        shifts: shifts.filter((s) => s.active).flatMap((s) => {
          const t = book.shiftOn(s.id, today);
          return t ? [{ id: s.id, code: s.code, name: t.name, start: hhmm(t.shiftStart), end: hhmm(t.shiftEnd) }] : [];
        }),
        slots: await Promise.all(slots.map(async (s) => ({ id: s.id, employeeId: s.employeeId, name: await name(s.employeeId), startsAt: s.startsAt.toISOString(), endsAt: s.endsAt.toISOString(), status: s.status, started: s.startsAt.getTime() <= Date.now() }))),
        people,
        callOuts: log.map((r) => ({ ...r, latest: latest.has(r.id) })),
      };
    });
  }

  async setSlot(ctx: TenantContext, user: ScopeUser, dto: SlotDto) {
    const v = await this.planning.viewer(user);
    if (v.actingForOther) throw new ForbiddenException(ACTING);
    const [start, end] = [new Date(dto.startsAt), new Date(dto.endsAt)];
    const bad = slotSpanError(start, end);
    if (bad) throw new BadRequestException(bad);
    if (end.getTime() <= Date.now()) throw new BadRequestException('Set standby for a time still to come.');
    if (start.getTime() > Date.now() + 120 * 86_400_000) throw new BadRequestException('Set standby within the next 120 days.');
    const res = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const own = await this.planning.ownId(tx, c, v);
      const guard = await RosterGuard.load(tx, c);
      const f = await this.facts(guard, dto.employeeId, start);
      await this.planning.mustPlan(tx, c, v, own, dto.employeeId, localDay(start, f.zone));
      // Two planners at once: one slot set for a person at a time.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`standby:${org}:${dto.employeeId}`}))`;
      const clash = await tx.standbySlot.findFirst({ where: { organizationId: org, employeeId: dto.employeeId, status: 'planned', startsAt: { lt: end }, endsAt: { gt: start } } });
      if (clash) throw new ConflictException({ statusCode: 409, code: 'OVERLAP', message: `${f.name} is already on standby ${DateTime.fromJSDate(clash.startsAt, { zone: f.zone }).toFormat('d LLL, h:mm a')} – ${DateTime.fromJSDate(clash.endsAt, { zone: f.zone }).toFormat('d LLL, h:mm a')}. Change that slot first.` });
      const s = await tx.standbySlot.create({ data: { organizationId: org, employeeId: dto.employeeId, locationId: f.locationId, startsAt: start, endsAt: end, createdBy: c.userId ?? null } });
      await audit(tx, c, 'time.standby.slot_set', 'standby_slot', s.id, { employeeId: dto.employeeId, startsAt: start.toISOString(), endsAt: end.toISOString(), locationId: f.locationId });
      return { id: s.id, users: await userIdsOf(tx, org, [dto.employeeId]), when: `${DateTime.fromJSDate(start, { zone: f.zone }).toFormat('d LLL yyyy, h:mm a')} – ${DateTime.fromJSDate(end, { zone: f.zone }).toFormat('d LLL, h:mm a')}` };
    });
    await this.notifications.notifySystem(ctx, res.users, 'time.standby', { entityType: 'standby_slot', entityId: res.id, contextText: `You are on standby ${res.when}`, linkPath: '/yx/time/shifts' }, { subject: 'You are on standby', html: `<p>You are on standby ${res.when}.</p>` }).catch(() => undefined);
    return { id: res.id, status: 'planned' };
  }

  async cancelSlot(ctx: TenantContext, user: ScopeUser, id: string) {
    const v = await this.planning.viewer(user);
    if (v.actingForOther) throw new ForbiddenException(ACTING);
    const res = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const own = await this.planning.ownId(tx, c, v);
      const s = await tx.standbySlot.findFirst({ where: { organizationId: org, id } });
      if (!s) throw new NotFoundException('No such standby slot.');
      await this.planning.mustPlan(tx, c, v, own, s.employeeId, localDay(s.startsAt, IST));
      if (s.status === 'cancelled') throw new ConflictException({ statusCode: 409, code: 'ALREADY_DONE', message: 'This standby slot was already cancelled.' });
      if (s.startsAt.getTime() <= Date.now()) throw new ConflictException({ statusCode: 409, code: 'TOO_LATE', message: 'This standby has started, so it can no longer be cancelled.' });
      await tx.standbySlot.update({ where: { id }, data: { status: 'cancelled' } });
      await audit(tx, c, 'time.standby.slot_cancelled', 'standby_slot', id, { employeeId: s.employeeId, startsAt: s.startsAt.toISOString(), endsAt: s.endsAt.toISOString() });
      return { users: await userIdsOf(tx, org, [s.employeeId]) };
    });
    await this.notifications.notifySystem(ctx, res.users, 'time.standby', { entityType: 'standby_slot', entityId: id, contextText: 'A standby slot of yours was cancelled', linkPath: '/yx/time/shifts' }, { subject: 'Your standby was cancelled', html: '<p>A standby slot of yours was cancelled.</p>' }).catch(() => undefined);
    return { id, status: 'cancelled' };
  }

  /** Logs a call-out (idempotent by client_ref) and answers with the rest left before the next shift. */
  async logCallOut(ctx: TenantContext, user: ScopeUser, dto: CallOutDto) {
    const v = await this.planning.viewer(user);
    if (v.actingForOther) throw new ForbiddenException(ACTING);
    const [start, end] = [new Date(dto.startedAt), new Date(dto.endedAt)];
    if (end.getTime() <= start.getTime()) throw new BadRequestException('The end must be after the start.');
    const worked = minutesBetween(start, end);
    if (worked < 1) throw new BadRequestException('A call-out lasts at least a minute.');
    if (worked > MAX_SLOT_MINUTES) throw new BadRequestException('A call-out is at most 24 hours.');
    if (end.getTime() > Date.now() + LATE_MS) throw new BadRequestException('Log a call-out after it ends.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const own = await this.planning.ownId(tx, c, v);
      const guard = await RosterGuard.load(tx, c);
      const f = await this.facts(guard, dto.employeeId, start);
      await this.planning.mustPlan(tx, c, v, own, dto.employeeId, localDay(start, f.zone));
      // A repeat (double click, retry) returns the first call-out; one person's call-outs are logged one at a time.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`callout:${org}:${dto.employeeId}`}))`;
      const view = async (co: { id: string; startedAt: Date; endedAt: Date; workedMinutes: number; paidMinutes: number; reason: string }, repeat: boolean) => ({
        id: co.id,
        repeat,
        employeeId: dto.employeeId,
        name: f.name,
        startedAt: co.startedAt.toISOString(),
        endedAt: co.endedAt.toISOString(),
        workedMinutes: co.workedMinutes,
        paidMinutes: co.paidMinutes,
        minimumApplied: co.paidMinutes > co.workedMinutes,
        reason: co.reason,
        ...(await this.restAfter(guard, f, co.endedAt)),
      });
      const again = await tx.callOut.findFirst({ where: { organizationId: org, clientRef: dto.clientRef } });
      if (again) {
        if (again.employeeId !== dto.employeeId) throw new ConflictException({ statusCode: 409, code: 'REF_USED', message: 'This request id was already used for another call-out. Reload and log it again.' });
        return view(again, true);
      }
      const slot = await tx.standbySlot.findFirst({ where: { organizationId: org, employeeId: dto.employeeId, status: 'planned', startsAt: { lte: start }, endsAt: { gt: start } } });
      if (!slot) throw new ConflictException({ statusCode: 409, code: 'NO_STANDBY', message: `${f.name} was not on standby when this call-out started. Check the start time, or set the standby slot first.` });
      const clash = await tx.callOut.findFirst({ where: { organizationId: org, employeeId: dto.employeeId, startedAt: { lt: end }, endedAt: { gt: start } } });
      if (clash) throw new ConflictException({ statusCode: 409, code: 'OVERLAP', message: `This overlaps the call-out already logged from ${DateTime.fromJSDate(clash.startedAt, { zone: f.zone }).toFormat('h:mm a')}.` });
      const minimum = Number(await settingOn(tx, c, 'standby.call_out_minimum_hours', f, localDay(start, f.zone)));
      const co = await tx.callOut.create({ data: { organizationId: org, employeeId: dto.employeeId, standbySlotId: slot.id, startedAt: start, endedAt: end, workedMinutes: worked, paidMinutes: paidMinutes(worked, minimum), reason: dto.reason.trim(), clientRef: dto.clientRef, loggedBy: c.userId ?? null } });
      await audit(tx, c, 'time.standby.call_out_logged', 'call_out', co.id, { employeeId: dto.employeeId, startedAt: start.toISOString(), endedAt: end.toISOString(), workedMinutes: worked, paidMinutes: co.paidMinutes, minimumHours: minimum, reason: co.reason });
      return view(co, false);
    });
  }

  /** Moves (or takes off) one published day after a call-out: rule 5 change, checked by the guard first. */
  async moveShift(ctx: TenantContext, user: ScopeUser, dto: MoveShiftDto) {
    const v = await this.planning.viewer(user);
    if (v.actingForOther) throw new ForbiddenException(ACTING);
    const res = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const own = await this.planning.ownId(tx, c, v);
      const book = await ScheduleBook.load(tx, org);
      const guard = await RosterGuard.load(tx, c, book);
      const f = await guard.factsOn(dto.employeeId, dto.on);
      if (!f) {
        // Out of reach and not employed that day look the same: not found.
        await this.planning.mustPlan(tx, c, v, own, dto.employeeId, todayIst());
        throw new NotFoundException('Not employed on that day.');
      }
      await this.planning.mustPlan(tx, c, v, own, dto.employeeId, dto.on);
      if (dto.on < todayIn(f.zone)) throw new BadRequestException('Past days never change here.');
      await assertOpen(tx, org, dto.employeeId, dto.on);
      const before = (await book.day(f, dto.on)).shift;
      let after = null;
      if (dto.shiftId) {
        if (!(await tx.shift.findFirst({ where: { organizationId: org, id: dto.shiftId, active: true } }))) throw new NotFoundException('No such shift.');
        after = book.shiftOn(dto.shiftId, dto.on);
        if (!after) throw new BadRequestException('That shift has no times on this day.');
        if (startsAt(dto.on, after.shiftStart, f.zone).getTime() <= Date.now()) throw new BadRequestException('The new shift would start in the past. Pick a later one.');
      }
      if ((before?.shiftId ?? null) === (after?.shiftId ?? null) && Boolean(before) === Boolean(after)) throw new BadRequestException('That is already the shift on this day.');
      if (before && startsAt(dto.on, before.shiftStart, f.zone).getTime() <= Date.now()) throw new ConflictException({ statusCode: 409, code: 'TOO_LATE', message: 'That shift has already started, so it can no longer move.' });
      // Rules 1–4 and 8: the move may not add a break.
      await guard.assert(dto.employeeId, new Map([[dto.on, dto.shiftId]]), 'The shift was not moved.');
      const notice = Number(await settingOn(tx, c, 'roster.change_notice_hours', f, dto.on));
      const late = insideNotice(dto.on, [before?.shiftStart ?? null, after?.shiftStart ?? null], f.zone, notice, new Date());
      const reason = dto.reason?.trim() || null;
      if (late && !reason) throw new BadRequestException({ statusCode: 400, code: 'NOTICE_REASON', message: `This change starts sooner than the ${notice} h notice ${f.name} is owed. Give a reason; they are told at once.` });
      await placeDay(tx, c, this.days, dto.employeeId, dto.on, dto.shiftId, 'callout', reason);
      const label = (s: typeof before) => (s ? `${s.name} ${hhmm(s.shiftStart)}–${hhmm(s.shiftEnd)}` : 'off');
      await audit(tx, c, 'time.roster.moved_after_call_out', 'roster', dto.employeeId, { employeeId: dto.employeeId, on: dto.on, before: label(before), after: label(after), late, reason });
      return { users: await userIdsOf(tx, org, [dto.employeeId]), text: `Your shift on ${fmt(dto.on)} changed: now ${label(after)}`, shift: after ? { id: after.shiftId, name: after.name, start: hhmm(after.shiftStart), end: hhmm(after.shiftEnd) } : null };
    });
    await this.notifications.notifySystem(ctx, res.users, 'time.roster.published', { entityType: 'roster', entityId: dto.employeeId, contextText: res.text, linkPath: '/yx/time/shifts' }, { subject: 'Your shift changed', html: `<p>${res.text}.</p>` }).catch(() => undefined);
    return { employeeId: dto.employeeId, on: dto.on, shift: res.shift };
  }
}

