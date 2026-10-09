import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';

import { parse } from 'csv-parse/sync';
import { DateTime } from 'luxon';
import { TenantPrismaService } from '@exam-platform/shared';
import { Tx } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { DeskActor, activeOn, audit, deskSystem, has, isAgentOn, isLead, requireDesk } from './desk-access';
import { FORECAST_WEEKS, forecast, perHour, presenceMinutes } from './forecast';
import { OPEN_STATES } from './tickets.service';

// SD-2.25 (US-G-075): presence (online, away, busy, offline) with its history, each agent's capacity per kind of work,
// skills and languages on the seat; the live team view for leads. SD-2.26 (US-G-076, US-G-077): dated shifts (set one
// by one or from CSV), the staff forecast from the daily volume history (sd_kpi_daily "created", a seasonal moving
// average by weekday, no ML) and the availability and productivity report. Leads plan their own desk's team
// (desk.ticket.assign + a lead seat); the report needs desk.report.view and a seat on the desk.

export type Presence = 'available' | 'away' | 'busy' | 'offline';
const CHANNELS = ['ticket', 'chat', 'messaging'] as const;
const MAX_IMPORT = 500;
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const istDay = (d: Date) => DateTime.fromJSDate(d, { zone: 'Asia/Kolkata' }).toISODate()!;

/** Closes the open presence span and opens the new one (one open span per person, kept by a unique index). */
export async function logPresence(tx: Tx, org: string, userId: string, status: Presence, now = new Date()) {
  const open = await tx.sdAgentPresenceLog.findFirst({ where: { organizationId: org, userId, endedAt: null } });
  if (open?.status === status) return;
  if (open) await tx.sdAgentPresenceLog.update({ where: { id: open.id }, data: { endedAt: now } });
  await tx.sdAgentPresenceLog.create({ data: { organizationId: org, userId, status, startedAt: now } });
}

@Injectable()
export class TeamService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  private tx<T>(a: DeskActor, fn: (tx: Tx) => Promise<T>) {
    return this.tenantPrisma.forTenant({ ...a.ctx, userId: a.userId }, fn);
  }

  private requireLead(a: DeskActor, deskId: string) {
    if (has(a, 'desk.ticket.assign') && isLead(a, deskId)) return;
    if (!a.roles.has(deskId)) throw new NotFoundException('No such desk.');
    throw new ForbiddenException('Only a lead of this desk plans its team.');
  }

  private requireReport(a: DeskActor, deskId: string) {
    if (has(a, 'desk.report.view') && (isAgentOn(a, deskId) || a.roles.get(deskId) === 'admin')) return;
    if (!a.roles.has(deskId)) throw new NotFoundException('No such desk.');
    throw new ForbiddenException('You need the report view on this desk.');
  }

  // ------------------------------------------------------------------------------------------ presence (SD-2.25)

  async setPresence(a: DeskActor, dto: { status: Presence; awayUntil?: string | null }) {
    if (!has(a, 'desk.ticket.work') && !has(a, 'desk.chat.work')) throw new ForbiddenException('Only agents set their presence.');
    if (![...a.roles.values()].some((r) => r === 'agent' || r === 'lead')) throw new ForbiddenException('Only agents set their presence.');
    const org = a.ctx.organizationId;
    const awayUntil = dto.status === 'away' && dto.awayUntil ? new Date(dto.awayUntil) : null;
    if (awayUntil && awayUntil <= new Date()) throw new BadRequestException('"Away until" must be later than now.');
    return this.tx(a, async (tx) => {
      const s = await tx.sdAgentStatus.upsert({ where: { organizationId_userId: { organizationId: org, userId: a.userId } }, update: { status: dto.status, awayUntil }, create: { organizationId: org, userId: a.userId, status: dto.status, awayUntil } });
      await logPresence(tx, org, a.userId, dto.status);
      await audit(tx, a, 'desk.agent.presence_changed', 'user', a.userId, { status: dto.status, awayUntil });
      return { status: s.status, awayUntil: s.awayUntil };
    });
  }

  // ------------------------------------------------------------------------------------------ the live team (leads)

  async team(a: DeskActor, deskId: string) {
    if (!(isLead(a, deskId) || (has(a, 'desk.report.view') && a.roles.has(deskId)))) {
      if (!a.roles.has(deskId)) throw new NotFoundException('No such desk.');
      throw new ForbiddenException('Leads see the team.');
    }
    const org = a.ctx.organizationId;
    const now = new Date();
    return deskSystem(this.tenantPrisma, a.ctx, async (tx) => {
      await requireDesk(tx, a, deskId);
      const seats = await tx.sdDeskMember.findMany({ where: { organizationId: org, deskId, role: { in: ['agent', 'lead'] }, ...activeOn(todayIst()) }, select: { id: true, userId: true, role: true, skills: true, languages: true } });
      const ids = seats.map((s) => s.userId);
      const [users, statuses, caps, open, chats, shifts] = await Promise.all([
        tx.user.findMany({ where: { organizationId: org, id: { in: ids } }, select: { id: true, name: true, email: true } }),
        tx.sdAgentStatus.findMany({ where: { organizationId: org, userId: { in: ids } } }),
        tx.sdAgentCapacity.findMany({ where: { organizationId: org, userId: { in: ids } } }),
        tx.sdTicket.groupBy({ by: ['assigneeUserId'], where: { organizationId: org, deskId, assigneeUserId: { in: ids }, systemState: { in: OPEN_STATES } }, _count: { _all: true } }),
        tx.sdChatSession.groupBy({ by: ['agentUserId'], where: { organizationId: org, agentUserId: { in: ids }, state: 'active' }, _count: { _all: true } }),
        tx.sdShift.findMany({ where: { organizationId: org, deskId, userId: { in: ids }, startsAt: { lte: now }, endsAt: { gt: now } } }),
      ]);
      return seats
        .map((s) => {
          const st = statuses.find((x) => x.userId === s.userId);
          const away = st?.status === 'away' && st.awayUntil && st.awayUntil <= now ? 'available' : (st?.status ?? 'available');
          return {
            userId: s.userId,
            name: users.find((u) => u.id === s.userId)?.name ?? users.find((u) => u.id === s.userId)?.email ?? 'Agent',
            role: s.role,
            presence: away as Presence,
            awayUntil: st?.awayUntil ?? null,
            skills: s.skills,
            languages: s.languages,
            onShift: shifts.some((x) => x.userId === s.userId),
            openTickets: open.find((x) => x.assigneeUserId === s.userId)?._count._all ?? 0,
            activeChats: chats.find((x) => x.agentUserId === s.userId)?._count._all ?? 0,
            capacity: Object.fromEntries(CHANNELS.map((c) => [c, caps.find((x) => x.userId === s.userId && x.channel === c)?.maxOpen ?? null])) as Record<(typeof CHANNELS)[number], number | null>,
          };
        })
        .sort((x, y) => x.name.localeCompare(y.name));
    });
  }

  /**
   * A lead sets an agent's capacity per kind of work and languages (on their seat of this desk). Skills are part of the
   * dated seat (the database never rewrites them): they change by ending the seat and adding a new one.
   */
  async setRouting(a: DeskActor, deskId: string, userId: string, dto: { capacity?: Partial<Record<(typeof CHANNELS)[number], number | null>>; languages?: string[] }) {
    this.requireLead(a, deskId);
    const org = a.ctx.organizationId;
    return this.tx(a, async (tx) => {
      const seat = await tx.sdDeskMember.findFirst({ where: { organizationId: org, deskId, userId, role: { in: ['agent', 'lead'] }, ...activeOn(todayIst()) } });
      if (!seat) throw new NotFoundException('That person is not an agent of this desk.');
      if (dto.languages) await tx.sdDeskMember.update({ where: { id: seat.id }, data: { languages: tidy(dto.languages, 3).filter((l) => /^[a-z]{2,3}$/.test(l)) } });
      for (const [channel, max] of Object.entries(dto.capacity ?? {})) {
        if (!(CHANNELS as readonly string[]).includes(channel)) continue;
        if (max === null) await tx.sdAgentCapacity.deleteMany({ where: { organizationId: org, userId, channel } });
        else await tx.sdAgentCapacity.upsert({ where: { organizationId_userId_channel: { organizationId: org, userId, channel } }, update: { maxOpen: max!, updatedBy: a.userId, updatedAt: new Date() }, create: { organizationId: org, userId, channel, maxOpen: max!, updatedBy: a.userId } });
      }
      await audit(tx, a, 'desk.agent.routing_changed', 'user', userId, { deskId, ...dto });
      return { saved: true };
    });
  }

  // ------------------------------------------------------------------------------------------ shifts (SD-2.26)

  async shifts(a: DeskActor, deskId: string, from: string, to: string) {
    if (!a.roles.has(deskId)) throw new NotFoundException('No such desk.');
    const org = a.ctx.organizationId;
    // Everyone on the desk sees the roster (RLS: their own shifts; leads: their team's).
    return this.tx(a, async (tx) => {
      // Whole days in India time, both ends included.
      const start = DateTime.fromISO(from, { zone: 'Asia/Kolkata' }).toJSDate();
      const end = DateTime.fromISO(to, { zone: 'Asia/Kolkata' }).plus({ days: 1 }).toJSDate();
      const rows = await tx.sdShift.findMany({ where: { organizationId: org, deskId, startsAt: { lt: end }, endsAt: { gt: start } }, orderBy: [{ startsAt: 'asc' }] });
      const names = new Map((await tx.user.findMany({ where: { organizationId: org, id: { in: [...new Set(rows.map((r) => r.userId))] } }, select: { id: true, name: true, email: true } })).map((u) => [u.id, u.name ?? u.email]));
      return rows.map((r) => ({ id: r.id, userId: r.userId, name: names.get(r.userId) ?? 'Agent', startsAt: r.startsAt, endsAt: r.endsAt, note: r.note }));
    });
  }

  private async addShiftIn(tx: Tx, a: DeskActor, deskId: string, s: { userId: string; startsAt: Date; endsAt: Date; note?: string | null }) {
    const org = a.ctx.organizationId;
    if (!(s.endsAt > s.startsAt) || s.endsAt.getTime() - s.startsAt.getTime() > 16 * 3_600_000) throw new BadRequestException('A shift ends after it starts and lasts at most 16 hours.');
    const seat = await tx.sdDeskMember.findFirst({ where: { organizationId: org, deskId, userId: s.userId, role: { in: ['agent', 'lead'] }, ...activeOn(todayIst()) }, select: { id: true } });
    if (!seat) throw new BadRequestException('Shifts are for agents of this desk.');
    try {
      return await tx.sdShift.create({ data: { organizationId: org, deskId, userId: s.userId, startsAt: s.startsAt, endsAt: s.endsAt, note: s.note ?? null, createdBy: a.userId } });
    } catch (e) {
      if (String((e as Error).message).includes('overlapping shift')) throw new ConflictException('This shift overlaps another shift of the same person.');
      throw e;
    }
  }

  async addShift(a: DeskActor, deskId: string, dto: { userId: string; startsAt: string; endsAt: string; note?: string }) {
    this.requireLead(a, deskId);
    return this.tx(a, async (tx) => {
      const s = await this.addShiftIn(tx, a, deskId, { userId: dto.userId, startsAt: new Date(dto.startsAt), endsAt: new Date(dto.endsAt), note: dto.note });
      await audit(tx, a, 'desk.shift.added', 'sd_shift', s.id, { deskId, userId: s.userId, startsAt: s.startsAt, endsAt: s.endsAt });
      return { id: s.id };
    });
  }

  async removeShift(a: DeskActor, id: string) {
    const org = a.ctx.organizationId;
    return this.tx(a, async (tx) => {
      const s = await tx.sdShift.findFirst({ where: { organizationId: org, id } });
      if (!s) throw new NotFoundException('No such shift.');
      this.requireLead(a, s.deskId);
      await tx.sdShift.delete({ where: { id } });
      await audit(tx, a, 'desk.shift.removed', 'sd_shift', id, { deskId: s.deskId, userId: s.userId });
      return { removed: true };
    });
  }

  /**
   * CSV rows "email,start,end,note" (start and end as ISO date-times, or "YYYY-MM-DD HH:mm" in the given time zone).
   * All or nothing: one bad row and nothing is saved; the answer lists every problem by line.
   */
  async importShifts(a: DeskActor, deskId: string, dto: { csv: string; timeZone?: string }) {
    this.requireLead(a, deskId);
    const zone = dto.timeZone ?? 'Asia/Kolkata';
    if (!DateTime.local().setZone(zone).isValid) throw new BadRequestException('Choose a valid time zone.');
    let rows: string[][];
    try {
      rows = parse(dto.csv, { skip_empty_lines: true, trim: true, relax_column_count: true, to: MAX_IMPORT + 1 }) as string[][];
    } catch {
      throw new BadRequestException('The file is not valid CSV.');
    }
    if (rows[0]?.[0]?.toLowerCase() === 'email') rows = rows.slice(1);
    if (rows.length > MAX_IMPORT) throw new BadRequestException(`Import up to ${MAX_IMPORT} shifts at a time.`);
    const org = a.ctx.organizationId;
    const at = (v: string) => {
      const d = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}$/.test(v) ? DateTime.fromFormat(v.replace('T', ' '), 'yyyy-MM-dd HH:mm', { zone }) : DateTime.fromISO(v, { zone });
      return d.isValid ? d.toJSDate() : null;
    };
    return this.tx(a, async (tx) => {
      const emails = [...new Set(rows.map((r) => (r[0] ?? '').toLowerCase()))];
      const users = new Map((await tx.user.findMany({ where: { organizationId: org, email: { in: emails } }, select: { id: true, email: true } })).map((u) => [u.email.toLowerCase(), u.id]));
      const problems: string[] = [];
      let added = 0;
      for (const [i, r] of rows.entries()) {
        const userId = users.get((r[0] ?? '').toLowerCase());
        const startsAt = at(r[1] ?? '');
        const endsAt = at(r[2] ?? '');
        if (!userId) problems.push(`Line ${i + 1}: no colleague with that email.`);
        else if (!startsAt || !endsAt) problems.push(`Line ${i + 1}: the start or end is not a date and time.`);
        else {
          try {
            await this.addShiftIn(tx, a, deskId, { userId, startsAt, endsAt, note: r[3]?.slice(0, 200) ?? null });
            added++;
          } catch (e) {
            problems.push(`Line ${i + 1}: ${(e as Error).message}`);
          }
        }
      }
      if (problems.length) throw new BadRequestException({ statusCode: 400, code: 'IMPORT_PROBLEMS', message: 'Nothing was saved. Fix these lines and try again.', problems: problems.slice(0, 50) });
      await audit(tx, a, 'desk.shift.imported', 'sd_desk', deskId, { added });
      return { added };
    });
  }

  // ------------------------------------------------------------------------------------------ forecast and reports

  /** The next days' expected new tickets and staff needed, beside the people rostered each day. */
  async forecast(a: DeskActor, deskId: string, days = 14, perAgentPerDay = 20) {
    this.requireReport(a, deskId);
    const org = a.ctx.organizationId;
    const today = todayIst();
    const since = DateTime.fromISO(today).minus({ weeks: FORECAST_WEEKS }).toISODate()!;
    return deskSystem(this.tenantPrisma, a.ctx, async (tx) => {
      await requireDesk(tx, a, deskId);
      const hist = await tx.sdKpiDaily.findMany({ where: { organizationId: org, deskId, metric: 'created', day: { gte: day(since), lt: day(today) } }, orderBy: { day: 'asc' } });
      const history = hist.map((h) => ({ day: h.day.toISOString().slice(0, 10), created: Number(h.value) }));
      const out = forecast(history, today, Math.min(28, Math.max(1, days)), perAgentPerDay);
      const end = DateTime.fromISO(today).plus({ days: out.length }).toISODate()!;
      const shifts = await tx.sdShift.findMany({ where: { organizationId: org, deskId, startsAt: { gte: DateTime.fromISO(today, { zone: 'Asia/Kolkata' }).toJSDate(), lt: DateTime.fromISO(end, { zone: 'Asia/Kolkata' }).toJSDate() } }, select: { userId: true, startsAt: true } });
      const rostered = new Map<string, Set<string>>();
      for (const s of shifts) rostered.set(istDay(s.startsAt), (rostered.get(istDay(s.startsAt)) ?? new Set()).add(s.userId));
      return {
        perAgentPerDay,
        weeks: FORECAST_WEEKS,
        history,
        days: out.map((d) => ({ ...d, rostered: rostered.get(d.day)?.size ?? 0, short: Math.max(0, d.staffNeeded - (rostered.get(d.day)?.size ?? 0)) })),
      };
    });
  }

  /** US-G-077: per agent, time in each presence, replies and notes, tickets solved, replies per online hour, time logged. */
  async availability(a: DeskActor, deskId: string, from: string, to: string) {
    this.requireReport(a, deskId);
    const org = a.ctx.organizationId;
    const start = DateTime.fromISO(from, { zone: 'Asia/Kolkata' }).toJSDate();
    const end = DateTime.fromISO(to, { zone: 'Asia/Kolkata' }).plus({ days: 1 }).toJSDate();
    if (!(end > start) || end.getTime() - start.getTime() > 93 * 86_400_000) throw new BadRequestException('Choose up to three months.');
    // Counts only (no ticket words), read as the desk's job after the rights check above.
    return deskSystem(this.tenantPrisma, a.ctx, async (tx) => {
      await requireDesk(tx, a, deskId);
      const seats = await tx.sdDeskMember.findMany({ where: { organizationId: org, deskId, role: { in: ['agent', 'lead'] }, validFrom: { lte: day(to) }, OR: [{ validTo: null }, { validTo: { gte: day(from) } }] }, select: { userId: true } });
      const ids = [...new Set(seats.map((s) => s.userId))];
      const [users, spans, msgs, solved, time] = await Promise.all([
        tx.user.findMany({ where: { organizationId: org, id: { in: ids } }, select: { id: true, name: true, email: true } }),
        tx.sdAgentPresenceLog.findMany({ where: { organizationId: org, userId: { in: ids }, startedAt: { lt: end }, OR: [{ endedAt: null }, { endedAt: { gt: start } }] } }),
        tx.sdTicketMessage.groupBy({ by: ['authorUserId', 'kind'], where: { organizationId: org, deskId, authorUserId: { in: ids }, side: 'agent', kind: { in: ['reply', 'note'] }, createdAt: { gte: start, lt: end } }, _count: { _all: true } }),
        tx.$queryRaw<{ user_id: string; n: bigint; hours: number | null }[]>`
          SELECT assignee_user_id AS user_id, count(*) AS n, avg(extract(epoch FROM resolved_at - created_at) / 3600)::float8 AS hours
          FROM sd_tickets WHERE organization_id = ${org}::uuid AND desk_id = ${deskId}::uuid AND assignee_user_id = ANY(${ids}::uuid[])
            AND resolved_at >= ${start} AND resolved_at < ${end} GROUP BY assignee_user_id`,
        tx.sdTimeEntry.groupBy({ by: ['userId'], where: { organizationId: org, deskId, userId: { in: ids }, workedOn: { gte: day(from), lte: day(to) } }, _sum: { minutes: true } }),
      ]);
      return ids
        .map((u) => {
          const minutes = presenceMinutes(spans.filter((s) => s.userId === u), start, end);
          const replies = msgs.find((m) => m.authorUserId === u && m.kind === 'reply')?._count._all ?? 0;
          const s = solved.find((x) => x.user_id === u);
          return {
            userId: u,
            name: users.find((x) => x.id === u)?.name ?? users.find((x) => x.id === u)?.email ?? 'Agent',
            minutes,
            replies,
            notes: msgs.find((m) => m.authorUserId === u && m.kind === 'note')?._count._all ?? 0,
            solved: Number(s?.n ?? 0),
            avgHandleHours: s?.hours == null ? null : Math.round(s.hours * 10) / 10,
            repliesPerOnlineHour: perHour(replies, minutes.available + minutes.busy),
            timeLoggedMinutes: time.find((x) => x.userId === u)?._sum.minutes ?? 0,
          };
        })
        .sort((x, y) => x.name.localeCompare(y.name));
    });
  }
}

const tidy = (xs: string[], max: number) => [...new Set(xs.map((x) => x.trim().toLowerCase().slice(0, max)).filter(Boolean))].slice(0, 10);

