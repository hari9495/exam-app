import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Job, Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import { AuditService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { NotificationsService } from '../notifications/notifications.service';
import { REDIS_CONNECTION, logBullErrors } from '../jobs/redis-connection';
import { Tx } from '../org-structure/org-structure.service';
import { addDays, todayIst } from '../org-structure/org-validation';
import { approvedLeaveOfUsers } from '../time/time-core';
import { CalendarSpec, businessSecondsBetween } from './business-time';
import { DeskActor, activeOn, audit, deskSystem, emit, has, isLead, requireSetUp, requireWork } from './desk-access';
import { ComplianceTargetsDto, SlaPolicyDto, SlaVersionDto, UpdateSlaPolicyDto } from './dto';
import {
  Clock,
  Metric,
  OLA_METRICS,
  SLA_METRICS,
  Scope,
  Target,
  TicketFacts,
  actionsAt,
  dueMilestones,
  elapsed,
  nextMilestone,
  reachesAt,
  scopeMatches,
  segments,
  targetSeconds,
} from './sla-engine';

// SD-1.14 … SD-1.17 SLA and OLA engine (M14 §8). Policies with effective-dated versions; one timer per measure; pauses
// by system state; milestones as BullMQ delayed jobs (one per running timer, job id carries job_version) plus a sweep
// every minute for jobs lost in a Redis restart; a milestone runs once (unique timer event). Breach escalation,
// breach reasons, lead-approved exclusions, monthly compliance targets, OLA timers on group hand-offs and tasks.

export const SLA_QUEUE = 'sd-sla';
type Timer = Prisma.SdSlaTimerGetPayload<object>;
type Version = Prisma.SdSlaPolicyVersionGetPayload<object>;
type TicketRow = Prisma.SdTicketGetPayload<object>;
const H24: CalendarSpec = { zone: 'UTC', hours: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, startMinute: 0, endMinute: 1440, validFrom: '2000-01-01', validTo: null })), holidays: [] };
const LIVE = ['running', 'paused'];
const DONE = ['solved', 'closed'];
const iso = (d: Date) => d.toISOString().slice(0, 10);
export const METRIC_LABEL: Record<Metric, string> = { assign: 'Time to assign', first_response: 'First response', next_response: 'Next response', resolution: 'Resolution', group: 'Team hand-off (OLA)', task: 'Task (OLA)' };

interface Notice {
  org: string;
  to: string[];
  ticket: TicketRow;
  type: 'helpdesk.ticket.sla_warning' | 'helpdesk.ticket.sla_breached';
  text: string;
}

@Injectable()
export class SlaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SlaService.name);
  private readonly queue: Queue;
  private worker: Worker | null = null;

  constructor(
    @Inject(REDIS_CONNECTION) private readonly connection: Redis,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly notifications: NotificationsService,
  ) {
    this.queue = logBullErrors(new Queue(SLA_QUEUE, { connection }), SLA_QUEUE);
  }

  async onModuleInit() {
    this.worker = logBullErrors(new Worker(SLA_QUEUE, (job) => this.onJob(job), { connection: this.connection }), SLA_QUEUE);
    await this.queue.upsertJobScheduler('sd-sla-sweep', { every: 60_000 }, { name: 'sweep', data: {} });
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue.close();
  }

  private async onJob(job: Job<{ org?: string; timerId?: string; v?: number }>) {
    if (job.name === 'sweep') return void (await this.sweep());
    if (job.data.org && job.data.timerId && job.data.v !== undefined) await this.fire(job.data.org, job.data.timerId, job.data.v);
  }

  // ------------------------------------------------------------------------------------------ calendars

  async calendarSpec(tx: Tx, org: string, calendarId: string | null, cache = new Map<string, CalendarSpec>()): Promise<CalendarSpec> {
    if (!calendarId) return H24;
    const hit = cache.get(calendarId);
    if (hit) return hit;
    const cal = await tx.businessCalendar.findFirst({ where: { organizationId: org, id: calendarId } });
    if (!cal) return H24;
    const [hours, holidays] = await Promise.all([
      tx.businessCalendarHours.findMany({ where: { organizationId: org, calendarId } }),
      tx.businessCalendarHoliday.findMany({ where: { organizationId: org, calendarId } }),
    ]);
    const spec: CalendarSpec = {
      zone: cal.timeZone,
      halfDayOpen: cal.halfDayOpenHalf === 'second' ? 'second' : 'first',
      hours: hours.map((h) => ({ weekday: h.weekday, startMinute: h.startMinute, endMinute: h.endMinute, validFrom: iso(h.validFrom), validTo: h.validTo ? iso(h.validTo) : null })),
      holidays: holidays.map((h) => ({ on: iso(h.holidayOn), halfDay: h.halfDay })),
    };
    cache.set(calendarId, spec);
    return spec;
  }

  /**
   * M02 approved leave of one person (full or half days), a year either side of today. A task OLA that follows a
   * person then skips the half they are away (founder decision 8 Oct 2026).
   */
  async leaveOf(tx: Tx, org: string, userId: string | null): Promise<CalendarSpec['leave']> {
    if (!userId) return [];
    const today = todayIst();
    return (await approvedLeaveOfUsers(tx, org, [userId], addDays(today, -366), addDays(today, 366))).map((l) => ({ on: l.on, part: l.part }));
  }

  private async versionCalendar(tx: Tx, t: TicketRow, v: Version): Promise<string | null> {
    if (v.calendarSource === 'calendar') return v.calendarId;
    // 'requester_location' falls back to the desk calendar until locations carry their own calendars (P01 seam).
    return (await tx.sdDesk.findFirst({ where: { organizationId: t.organizationId, id: t.deskId }, select: { calendarId: true } }))?.calendarId ?? null;
  }

  // ------------------------------------------------------------------------------------------ policy choice (§8.3)

  private facts(t: TicketRow): TicketFacts {
    return { priority: t.priority, categoryId: t.categoryId, typeId: t.typeId, kind: t.kind, channel: t.channel, groupId: t.groupId, vip: t.vip, tags: t.tags, planTier: t.planTier, productId: t.productId, customerAccountId: t.customerAccountId };
  }

  /** First policy in order whose scope fits; a policy the ticket already uses keeps its pinned version. */
  private async choose(tx: Tx, t: TicketRow, kind: 'sla' | 'ola', pinned: Version | null, now: Date): Promise<Version | null> {
    const policies = await tx.sdSlaPolicy.findMany({ where: { organizationId: t.organizationId, deskId: t.deskId, kind, active: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
    for (const p of policies) {
      let v = pinned?.policyId === p.id ? pinned : null;
      // The version in force when the ticket was raised; a policy added later applies from its first version.
      v ??= await tx.sdSlaPolicyVersion.findFirst({ where: { organizationId: t.organizationId, policyId: p.id, validFrom: { lte: t.createdAt } }, orderBy: { version: 'desc' } });
      v ??= await tx.sdSlaPolicyVersion.findFirst({ where: { organizationId: t.organizationId, policyId: p.id, validFrom: { lte: now } }, orderBy: { version: 'asc' } });
      if (v && scopeMatches(v.scope as unknown as Scope, this.facts(t))) return v;
    }
    return null;
  }

  // ------------------------------------------------------------------------------------------ timers (§8.4)

  private clock(x: Timer): Clock {
    return { state: x.state as Clock['state'], resumedAt: x.resumedAt, usedSeconds: x.usedSeconds, targetSeconds: x.targetSeconds };
  }

  private targetOf(v: Version, metric: string): Target | undefined {
    return (v.targets as unknown as Target[]).find((t) => t.metric === metric);
  }

  private async fired(tx: Tx, x: Timer): Promise<number[]> {
    return (await tx.sdSlaTimerEvent.findMany({ where: { organizationId: x.organizationId, timerId: x.id, kind: 'milestone' }, select: { percent: true } })).map((e) => e.percent!);
  }

  private async specFor(tx: Tx, x: { organizationId: string; calendarId: string | null; taskId: string | null }, cache?: Map<string, CalendarSpec>) {
    const spec = await this.calendarSpec(tx, x.organizationId, x.calendarId, cache);
    if (!x.taskId) return spec;
    const task = await tx.sdTask.findFirst({ where: { organizationId: x.organizationId, id: x.taskId }, select: { assigneeUserId: true } });
    return { ...spec, leave: await this.leaveOf(tx, x.organizationId, task?.assigneeUserId ?? null) };
  }

  /** Writes a timer change, then recomputes its due time and next milestone and schedules the milestone job. */
  private async save(tx: Tx, x: Timer, patch: Prisma.SdSlaTimerUncheckedUpdateInput, v: Version, cache?: Map<string, CalendarSpec>): Promise<Timer> {
    const merged = { ...x, ...patch } as Timer;
    const cal = await this.specFor(tx, merged, cache);
    const c = this.clock(merged);
    const target = this.targetOf(v, merged.metric) ?? { metric: merged.metric as Metric, minutes: [] };
    const next = merged.state === 'running' ? nextMilestone(cal, c, target, await this.fired(tx, merged)) : null;
    const due = merged.state === 'running' ? reachesAt(cal, c, 100) : merged.state === 'paused' ? null : merged.dueAt;
    const after = await tx.sdSlaTimer.update({
      where: { id: x.id },
      data: { ...patch, dueAt: merged.breachedAt ?? due, nextMilestonePercent: next?.percent ?? null, nextMilestoneAt: next?.at ?? null, jobVersion: { increment: 1 } },
    });
    if (next) await this.schedule(after, next.at);
    return after;
  }

  private async schedule(x: Timer, at: Date) {
    try {
      await this.queue.add('fire', { org: x.organizationId, timerId: x.id, v: x.jobVersion }, { jobId: `${x.id}-${x.jobVersion}`, delay: Math.max(0, at.getTime() - Date.now()), removeOnComplete: true, removeOnFail: 100 });
    } catch (e) {
      // The sweep picks the timer up within a minute.
      this.logger.warn(`SLA job not queued for ${x.id}: ${(e as Error).message}`);
    }
  }

  private async log(tx: Tx, x: Timer, kind: string, o: { percent?: number; reason?: string | null; by?: string | null; at?: Date } = {}) {
    await tx.sdSlaTimerEvent.create({ data: { organizationId: x.organizationId, deskId: x.deskId, ticketId: x.ticketId, timerId: x.id, kind, percent: o.percent ?? null, jobVersion: x.jobVersion, reason: o.reason?.slice(0, 500) ?? null, byUserId: o.by ?? null, ...(o.at ? { at: o.at } : {}) } });
  }

  private async start(tx: Tx, t: TicketRow, v: Version, metric: Metric, secs: number, o: { startedAt: Date; used?: number; groupId?: string | null; taskId?: string | null; paused?: string | null; now: Date; cache: Map<string, CalendarSpec> }) {
    const calendarId = await this.versionCalendar(tx, t, v);
    const policy = await tx.sdSlaPolicy.findFirstOrThrow({ where: { organizationId: t.organizationId, id: v.policyId }, select: { kind: true } });
    const x = await tx.sdSlaTimer.create({
      data: {
        organizationId: t.organizationId,
        deskId: t.deskId,
        ticketId: t.id,
        policyVersionId: v.id,
        kind: policy.kind,
        metric,
        groupId: o.groupId ?? null,
        taskId: o.taskId ?? null,
        calendarId,
        state: o.paused ? 'paused' : 'running',
        startedAt: o.startedAt,
        resumedAt: o.paused ? null : o.now,
        usedSeconds: o.used ?? 0,
        targetSeconds: secs,
        pausedSince: o.paused ? o.now : null,
        pauseReason: o.paused ?? null,
      },
    });
    await this.log(tx, x, 'start', { at: o.startedAt });
    if (o.paused) await this.log(tx, x, 'pause', { reason: o.paused, at: o.now });
    return this.save(tx, x, {}, v, o.cache);
  }

  private async stop(tx: Tx, x: Timer, v: Version, how: 'met' | 'cancelled', now: Date, reason: string, cache: Map<string, CalendarSpec>) {
    const cal = await this.specFor(tx, x, cache);
    const used = elapsed(cal, this.clock(x), now);
    const late = how === 'met' && !x.breachedAt && used > x.targetSeconds ? reachesAt(cal, this.clock(x), 100) : null;
    await this.save(tx, x, { state: how, usedSeconds: used, resumedAt: null, pausedSince: null, ...(how === 'met' ? { metAt: now } : { cancelledAt: now, cancelReason: reason.slice(0, 100) }), ...(late ? { breachedAt: late } : {}) }, v, cache);
    await this.log(tx, x, how === 'met' ? 'met' : 'cancel', { reason, at: now });
    if (how === 'met') await emit(tx, x.organizationId, 'helpdesk.ticket.sla_met', { ticketId: x.ticketId, deskId: x.deskId, timerId: x.id, metric: x.metric, late: Boolean(x.breachedAt ?? late) });
  }

  /**
   * Brings a ticket's timers in line with the ticket as it is now (§8.3, §8.4). Called in the same transaction after
   * every change that matters: create, status, priority / category / type / group, first and later replies, merge.
   * Idempotent: calling it twice changes nothing.
   */
  async sync(tx: Tx, ticketId: string, now = new Date()): Promise<void> {
    const t = await tx.sdTicket.findFirst({ where: { id: ticketId } });
    if (!t) return;
    const org = t.organizationId;
    const cache = new Map<string, CalendarSpec>();
    const timers = await tx.sdSlaTimer.findMany({ where: { organizationId: org, ticketId: t.id }, orderBy: { createdAt: 'asc' } });
    const versions = new Map<string, Version>();
    for (const id of [...new Set(timers.map((x) => x.policyVersionId))]) versions.set(id, await tx.sdSlaPolicyVersion.findFirstOrThrow({ where: { organizationId: org, id } }));
    const live = timers.filter((x) => LIVE.includes(x.state));
    if (t.mergedIntoId) {
      for (const x of live) await this.stop(tx, x, versions.get(x.policyVersionId)!, 'cancelled', now, 'Merged into another ticket', cache);
      return;
    }
    const replies = await tx.sdTicketMessage.groupBy({ by: ['side'], where: { organizationId: org, ticketId: t.id, kind: 'reply' }, _max: { createdAt: true } });
    const lastRequester = replies.find((r) => r.side === 'requester')?._max.createdAt ?? null;
    const lastAgent = replies.find((r) => r.side === 'agent')?._max.createdAt ?? null;
    const resolved = DONE.includes(t.systemState);
    const awaiting = Boolean(t.firstResponseAt && lastRequester && (!lastAgent || lastRequester > lastAgent) && !resolved);
    const pausedBy = async (v: Version) => (v.pauseStates.includes(t.systemState) ? ((await tx.sdStatus.findFirst({ where: { organizationId: org, id: t.statusId }, select: { label: true } }))?.label ?? t.systemState) : null);

    for (const kind of ['sla', 'ola'] as const) {
      const mine = timers.filter((x) => x.kind === kind && x.state !== 'cancelled');
      const pinned = mine.length ? versions.get(mine[mine.length - 1].policyVersionId)! : null;
      const v = await this.choose(tx, t, kind, pinned, now);
      const old = live.filter((x) => x.kind === kind);
      const carried = new Map<string, number>();
      if (pinned && v?.id !== pinned.id) {
        // §8.3 a different policy: stop the old timers; the new ones keep the time used (or count from the start).
        for (const x of old) {
          carried.set(x.metric, elapsed(await this.specFor(tx, x, cache), this.clock(x), now));
          await this.stop(tx, x, versions.get(x.policyVersionId)!, 'cancelled', now, v ? 'Another policy applies now' : 'No policy applies now', cache);
        }
      }
      if (!v) continue;
      versions.set(v.id, v);
      const pause = await pausedBy(v);
      const current = (await tx.sdSlaTimer.findMany({ where: { organizationId: org, ticketId: t.id, kind, policyVersionId: v.id } })).filter((x) => x.state !== 'cancelled');
      const late = !pinned && v.recount === 'retroactive';
      const usedFor = async (metric: string, from: Date) => carried.get(metric) ?? (v.recount === 'retroactive' || late ? businessSecondsBetween(await this.calendarSpec(tx, org, await this.versionCalendar(tx, t, v), cache), from, now) : 0);

      for (const target of v.targets as unknown as Target[]) {
        const metric = target.metric;
        if (!(kind === 'sla' ? (SLA_METRICS as readonly string[]) : (OLA_METRICS as readonly string[])).includes(metric) || metric === 'task') continue;
        const secs = targetSeconds(target, t.priority);
        const forMetric = current.filter((x) => x.metric === metric);
        const running = forMetric.find((x) => LIVE.includes(x.state));
        const done =
          metric === 'assign' ? Boolean(t.assigneeUserId) || resolved
          : metric === 'first_response' ? Boolean(t.firstResponseAt) || resolved
          : metric === 'next_response' ? !awaiting
          : metric === 'group' ? !t.groupId || resolved
          : resolved;
        if (!secs) {
          if (running) await this.stop(tx, running, v, 'cancelled', now, 'No target for this priority', cache);
          continue;
        }
        if (running && metric === 'group' && running.groupId !== t.groupId) {
          // An OLA ends when the group hands the ticket on.
          await this.stop(tx, running, v, 'met', now, 'Handed to another group', cache);
          if (!done) await this.start(tx, t, v, metric, secs, { startedAt: now, groupId: t.groupId, paused: pause, now, cache });
          continue;
        }
        if (running) {
          if (done) {
            await this.stop(tx, running, v, 'met', now, metric === 'resolution' ? 'Resolved' : 'Done', cache);
            continue;
          }
          let x = running;
          if (x.targetSeconds !== secs) {
            x = await this.save(tx, x, { targetSeconds: secs }, v, cache);
            await this.log(tx, x, 'target', { reason: `Target now ${Math.round(secs / 60)} min (priority P${t.priority})`, at: now });
          }
          if (pause && x.state === 'running') {
            const used = elapsed(await this.specFor(tx, x, cache), this.clock(x), now);
            x = await this.save(tx, x, { state: 'paused', usedSeconds: used, resumedAt: null, pausedSince: now, pauseReason: pause.slice(0, 100) }, v, cache);
            await this.log(tx, x, 'pause', { reason: pause, at: now });
          } else if (!pause && x.state === 'paused') {
            x = await this.save(tx, x, { state: 'running', resumedAt: now, pausedSince: null, pauseReason: null }, v, cache);
            await this.log(tx, x, 'resume', { at: now });
          }
          continue;
        }
        if (done) continue;
        const reopened = forMetric.find((x) => x.state === 'met' && (metric === 'resolution' || metric === 'assign'));
        if (reopened) {
          // A reopened ticket: the same promise continues from where it stopped.
          const x = await this.save(tx, reopened, { state: pause ? 'paused' : 'running', resumedAt: pause ? null : now, metAt: null, pausedSince: pause ? now : null, pauseReason: pause }, v, cache);
          await this.log(tx, x, 'restart', { reason: 'Reopened', at: now });
          continue;
        }
        if (metric !== 'next_response' && metric !== 'group' && forMetric.length) continue;
        const startedAt = metric === 'next_response' ? lastRequester! : metric === 'group' ? now : t.createdAt;
        if (metric === 'next_response' && forMetric.some((x) => x.startedAt.getTime() === startedAt.getTime())) continue;
        await this.start(tx, t, v, metric, secs, { startedAt, used: await usedFor(metric, startedAt), groupId: metric === 'group' ? t.groupId : null, paused: pause, now, cache });
      }
    }
    await this.syncTasks(tx, t, now, cache);
  }

  /** YX-SD-09: a converted ticket starts its targets again under the new type (the old ones stay in its history). */
  async restart(tx: Tx, ticketId: string, reason: string, now = new Date()) {
    const live = await tx.sdSlaTimer.findMany({ where: { ticketId, state: { in: LIVE } } });
    const cache = new Map<string, CalendarSpec>();
    for (const x of live) await this.stop(tx, x, await tx.sdSlaPolicyVersion.findFirstOrThrow({ where: { organizationId: x.organizationId, id: x.policyVersionId } }), 'cancelled', now, reason, cache);
    await this.sync(tx, ticketId, now);
  }

  /** SD-1.17: an OLA timer for each open task given to a group; it stops when the task is done or cancelled. */
  private async syncTasks(tx: Tx, t: TicketRow, now: Date, cache: Map<string, CalendarSpec>) {
    const org = t.organizationId;
    const tasks = await tx.sdTask.findMany({ where: { organizationId: org, ticketId: t.id, groupId: { not: null } } });
    const live = await tx.sdSlaTimer.findMany({ where: { organizationId: org, ticketId: t.id, metric: 'task', state: { in: LIVE } } });
    const v = tasks.length ? await this.choose(tx, t, 'ola', null, now) : null;
    for (const task of tasks) {
      const x = live.find((y) => y.taskId === task.id);
      const open = task.state === 'open' || task.state === 'in_progress';
      if (x && !open) {
        const xv = await tx.sdSlaPolicyVersion.findFirstOrThrow({ where: { organizationId: org, id: x.policyVersionId } });
        await this.stop(tx, x, xv, task.state === 'done' ? 'met' : 'cancelled', now, task.state === 'done' ? 'Task done' : 'Task cancelled', cache);
      }
      if (x || !open || !v) continue;
      const target = this.targetOf(v, 'task');
      const secs = target ? targetSeconds(target, t.priority) : null;
      if (!secs) continue;
      const already = await tx.sdSlaTimer.findFirst({ where: { organizationId: org, ticketId: t.id, metric: 'task', taskId: task.id }, select: { id: true } });
      if (!already) await this.start(tx, t, v, 'task', secs, { startedAt: task.createdAt, groupId: task.groupId, taskId: task.id, now, cache });
    }
  }

  // ------------------------------------------------------------------------------------------ milestone jobs (§8.5)

  /** Runs the milestones a timer has reached. Locked and version-checked: a stale or duplicate job does nothing. */
  async fire(org: string, timerId: string, version: number, now = new Date()): Promise<number[]> {
    const notices: Notice[] = [];
    const ran = await deskSystem(this.tenantPrisma, { organizationId: org, isSuperAdmin: false }, async (tx) => {
      await tx.$queryRaw`SELECT id FROM sd_sla_timers WHERE organization_id = ${org}::uuid AND id = ${timerId}::uuid FOR UPDATE`;
      const x = await tx.sdSlaTimer.findFirst({ where: { organizationId: org, id: timerId } });
      if (!x || x.state !== 'running' || x.jobVersion !== version) return [];
      const v = await tx.sdSlaPolicyVersion.findFirstOrThrow({ where: { organizationId: org, id: x.policyVersionId } });
      const target = this.targetOf(v, x.metric) ?? { metric: x.metric as Metric, minutes: [] };
      const cal = await this.specFor(tx, x);
      const due = dueMilestones(cal, this.clock(x), target, await this.fired(tx, x), now);
      const t = await tx.sdTicket.findFirstOrThrow({ where: { organizationId: org, id: x.ticketId } });
      const done: number[] = [];
      let breachedAt = x.breachedAt;
      for (const percent of due) {
        // The exactly-once lock: a second runner for the same milestone stops here.
        const inserted = await tx.$executeRaw`
          INSERT INTO sd_sla_timer_events (organization_id, desk_id, ticket_id, timer_id, kind, percent, job_version, reason)
          VALUES (${org}::uuid, ${x.deskId}::uuid, ${x.ticketId}::uuid, ${x.id}::uuid, 'milestone', ${percent}, ${x.jobVersion}, ${`${METRIC_LABEL[x.metric as Metric]} at ${percent} %`})
          ON CONFLICT DO NOTHING`;
        if (!inserted) continue;
        done.push(percent);
        const breach = percent >= 100 && !breachedAt;
        if (breach) {
          breachedAt = reachesAt(cal, this.clock(x), 100) ?? now;
          await this.log(tx, x, 'breach', { percent, at: breachedAt });
          await emit(tx, org, 'helpdesk.ticket.sla_breached', { ticketId: t.id, deskId: t.deskId, timerId: x.id, metric: x.metric, kind: x.kind });
        } else if (percent < 100) {
          await emit(tx, org, 'helpdesk.ticket.sla_warning', { ticketId: t.id, deskId: t.deskId, timerId: x.id, metric: x.metric, percent });
        }
        // US-G-014: every milestone and its actions show on the ticket's timeline.
        await tx.sdTicketEvent.create({ data: { organizationId: org, deskId: t.deskId, ticketId: t.id, kind: percent >= 100 ? 'sla_breached' : 'sla_milestone', toValue: `${percent} %`, reason: METRIC_LABEL[x.metric as Metric] } });
        await this.act(tx, t, x, actionsAt(target, percent), percent, notices);
      }
      await this.save(tx, x, breachedAt !== x.breachedAt ? { breachedAt } : {}, v);
      return done;
    });
    for (const n of notices) await this.tell(n);
    return ran;
  }

  private async leads(tx: Tx, t: TicketRow, groupId: string | null, deskWide: boolean): Promise<string[]> {
    const org = t.organizationId;
    const seats = (await tx.sdDeskMember.findMany({ where: { organizationId: org, deskId: t.deskId, role: 'lead', ...activeOn(todayIst()) }, select: { userId: true } })).map((s) => s.userId);
    if (deskWide || !groupId) return seats;
    const inGroup = (await tx.sdGroupMember.findMany({ where: { organizationId: org, groupId, userId: { in: seats } }, select: { userId: true } })).map((m) => m.userId);
    return inGroup.length ? inGroup : seats;
  }

  private async act(tx: Tx, t: TicketRow, x: Timer, actions: { type: string; groupId?: string }[], percent: number, notices: Notice[]) {
    const org = t.organizationId;
    const type = percent >= 100 ? 'helpdesk.ticket.sla_breached' : 'helpdesk.ticket.sla_warning';
    const what = `${METRIC_LABEL[x.metric as Metric]} ${percent >= 100 ? `target missed (${percent} %)` : `at ${percent} % of its target`}`;
    for (const a of actions) {
      if (a.type === 'notify_assignee') {
        const task = x.taskId ? await tx.sdTask.findFirst({ where: { organizationId: org, id: x.taskId }, select: { assigneeUserId: true } }) : null;
        const who = task?.assigneeUserId ?? t.assigneeUserId;
        if (who) notices.push({ org, to: [who], ticket: t, type, text: what });
      } else if (a.type === 'notify_group_leads' || a.type === 'notify_desk_leads') {
        notices.push({ org, to: await this.leads(tx, t, x.groupId ?? t.groupId, a.type === 'notify_desk_leads'), ticket: t, type, text: what });
      } else if (a.type === 'raise_priority' && t.priority > 1) {
        await tx.sdTicket.update({ where: { id: t.id }, data: { priority: t.priority - 1, version: { increment: 1 } } });
        await tx.sdTicketEvent.create({ data: { organizationId: org, deskId: t.deskId, ticketId: t.id, kind: 'priority_changed', fromValue: String(t.priority), toValue: String(t.priority - 1), reason: `SLA: ${what}` } });
        await AuditService.recordIn(tx, { organizationId: org, isSuperAdmin: false }, { actorUserId: null, action: 'desk.ticket.updated', entityType: 'sd_ticket', entityId: t.id, metadata: { changes: [{ kind: 'priority_changed', from: t.priority, to: t.priority - 1 }], reason: 'SLA milestone' } });
      } else if (a.type === 'move_to_group' && a.groupId && a.groupId !== t.groupId) {
        const g = await tx.sdGroup.findFirst({ where: { organizationId: org, deskId: t.deskId, id: a.groupId, active: true }, select: { id: true } });
        if (!g) continue;
        await tx.sdTicket.update({ where: { id: t.id }, data: { groupId: g.id, version: { increment: 1 } } });
        await tx.sdTicketEvent.create({ data: { organizationId: org, deskId: t.deskId, ticketId: t.id, kind: 'group_changed', fromValue: t.groupId, toValue: g.id, reason: `SLA: ${what}` } });
        await AuditService.recordIn(tx, { organizationId: org, isSuperAdmin: false }, { actorUserId: null, action: 'desk.ticket.updated', entityType: 'sd_ticket', entityId: t.id, metadata: { changes: [{ kind: 'group_changed', from: t.groupId, to: g.id }], reason: 'SLA milestone' } });
      }
    }
  }

  /** In-app notice (and email per preference). Sensitive and private tickets: neutral words only (YX-SD-14). */
  private async tell(n: Notice) {
    if (!n.to.length) return;
    const neutral = n.ticket.sensitive || n.ticket.private;
    const contextText = neutral ? `Ticket ${n.ticket.number}: a response target needs attention` : `${n.ticket.number} · ${n.text}`;
    try {
      await this.notifications.notifySystem({ organizationId: n.org, isSuperAdmin: false }, n.to, n.type, { entityType: 'sd_ticket', entityId: n.ticket.id, contextText, linkPath: `/yx/desk/tickets/${n.ticket.id}` }, { subject: neutral ? `Ticket ${n.ticket.number} needs attention` : `${n.ticket.number}: ${n.text}`, html: `<p>${neutral ? 'A response target on one of your tickets needs attention.' : escapeHtml(contextText)}</p><p>Open it in YukthiX to see more.</p>` });
    } catch (e) {
      this.logger.warn(`SLA notice not sent: ${(e as Error).message}`);
    }
  }

  /** §8.5 safety sweep: timers whose milestone is due but whose job was lost (Redis restart). */
  async sweep(now = new Date()): Promise<number> {
    const due = await deskSystem(this.tenantPrisma, { organizationId: null, isSuperAdmin: true }, (tx) =>
      tx.$queryRaw<{ id: string; organization_id: string; job_version: number }[]>`
        SELECT id, organization_id, job_version FROM sd_sla_timers
        WHERE state = 'running' AND next_milestone_at <= ${now} ORDER BY next_milestone_at LIMIT 1000 FOR UPDATE SKIP LOCKED`,
    );
    for (const d of due) {
      try {
        await this.fire(d.organization_id, d.id, d.job_version, now);
      } catch (e) {
        this.logger.warn(`SLA sweep: timer ${d.id} failed: ${(e as Error).message}`);
      }
    }
    return due.length;
  }

  // ------------------------------------------------------------------------------------------ set-up (SD-1.14)

  private checkTargets(kind: 'sla' | 'ola', dto: SlaVersionDto) {
    const allowed: readonly string[] = kind === 'sla' ? SLA_METRICS : OLA_METRICS;
    const seen = new Set<string>();
    for (const t of dto.targets) {
      if (!allowed.includes(t.metric)) throw new BadRequestException(`${kind === 'sla' ? 'An SLA' : 'An OLA'} cannot measure "${t.metric}".`);
      if (seen.has(t.metric)) throw new BadRequestException('Each measure appears once in a policy.');
      seen.add(t.metric);
      if (t.minutes.length !== 4 || t.minutes.some((m) => m !== null && (!Number.isInteger(m) || m < 1 || m > 525600))) throw new BadRequestException('Give minutes for P1 to P4 (1 to 525600), or leave one empty.');
      if (t.minutes.every((m) => m === null)) throw new BadRequestException('Give a target for at least one priority.');
      if (new Set((t.milestones ?? []).map((m) => m.percent)).size !== (t.milestones ?? []).length) throw new BadRequestException('Each milestone percent appears once.');
    }
    if (dto.calendarSource === 'calendar' && !dto.calendarId) throw new BadRequestException('Choose the calendar.');
  }

  private async checkRefs(tx: Tx, org: string, deskId: string, dto: SlaVersionDto) {
    if (dto.calendarSource === 'calendar' && !(await tx.businessCalendar.findFirst({ where: { organizationId: org, id: dto.calendarId }, select: { id: true } }))) throw new BadRequestException('No such calendar.');
    const groups = dto.targets.flatMap((t) => (t.milestones ?? []).flatMap((m) => m.actions.filter((a) => a.type === 'move_to_group').map((a) => a.groupId)));
    for (const g of groups) if (!g || !(await tx.sdGroup.findFirst({ where: { organizationId: org, deskId, id: g }, select: { id: true } }))) throw new BadRequestException('Choose a group of this desk to move tickets to.');
  }

  private versionData(dto: SlaVersionDto) {
    return {
      scope: dto.scope as unknown as Prisma.InputJsonValue,
      calendarSource: dto.calendarSource,
      calendarId: dto.calendarSource === 'calendar' ? dto.calendarId! : null,
      targets: dto.targets.map((t) => ({ metric: t.metric, minutes: t.minutes, ...(t.milestones?.length ? { milestones: t.milestones.map((m) => ({ percent: m.percent, actions: m.actions.map((a) => ({ type: a.type, ...(a.groupId ? { groupId: a.groupId } : {}) })) })) } : {}) })) as unknown as Prisma.InputJsonValue,
      pauseStates: dto.pauseStates ?? ['pending', 'on_hold'],
      recount: dto.recount ?? 'keep',
    };
  }

  async policies(a: DeskActor, deskId: string) {
    requireSetUp(a, deskId, 'desk.sla.manage');
    return this.tenantPrisma.forTenant(a.ctx, async (tx) => {
      const org = a.ctx.organizationId;
      const list = await tx.sdSlaPolicy.findMany({ where: { organizationId: org, deskId }, orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }] });
      const versions = await tx.sdSlaPolicyVersion.findMany({ where: { organizationId: org, deskId }, orderBy: { version: 'desc' } });
      const targets = await tx.sdSlaComplianceTarget.findMany({ where: { organizationId: org, deskId } });
      return {
        policies: list.map((p) => ({ id: p.id, name: p.name, kind: p.kind, sortOrder: p.sortOrder, active: p.active, version: p.version, versions: versions.filter((v) => v.policyId === p.id).map((v) => ({ id: v.id, version: v.version, validFrom: v.validFrom, scope: v.scope, calendarSource: v.calendarSource, calendarId: v.calendarId, targets: v.targets, pauseStates: v.pauseStates, recount: v.recount })) })),
        complianceTargets: targets.map((t) => ({ metric: t.metric, priority: t.priority, targetPercent: Number(t.targetPercent) })),
      };
    });
  }

  async createPolicy(a: DeskActor, deskId: string, dto: SlaPolicyDto) {
    requireSetUp(a, deskId, 'desk.sla.manage');
    this.checkTargets(dto.kind, dto);
    const org = a.ctx.organizationId;
    try {
      return await this.tenantPrisma.forTenant(a.ctx, async (tx) => {
        if (!(await tx.sdDesk.findFirst({ where: { organizationId: org, id: deskId }, select: { id: true } }))) throw new NotFoundException('No such desk.');
        await this.checkRefs(tx, org, deskId, dto);
        const p = await tx.sdSlaPolicy.create({ data: { organizationId: org, deskId, name: dto.name, kind: dto.kind, sortOrder: dto.sortOrder ?? 0, createdBy: a.userId } });
        const v = await tx.sdSlaPolicyVersion.create({ data: { organizationId: org, deskId, policyId: p.id, version: 1, validFrom: this.from(dto.validFrom), ...this.versionData(dto), createdBy: a.userId } });
        await audit(tx, a, 'desk.sla.policy_created', 'sd_sla_policy', p.id, { deskId, name: p.name, kind: p.kind, versionId: v.id, targets: dto.targets.map((t) => ({ metric: t.metric, minutes: t.minutes })) });
        return { id: p.id, versionId: v.id };
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('A policy with that name exists on this desk.');
      throw e;
    }
  }

  private from(validFrom?: string): Date {
    const d = validFrom ? new Date(validFrom) : new Date();
    if (d.getTime() < Date.now() - 60_000) throw new BadRequestException('A new version starts now or later; tickets already running keep theirs.');
    return d;
  }

  /** §5.6: a change is a new version from a moment on; open tickets keep the version they started with. */
  async addVersion(a: DeskActor, policyId: string, dto: SlaVersionDto) {
    const org = a.ctx.organizationId;
    return this.tenantPrisma.forTenant(a.ctx, async (tx) => {
      const p = await tx.sdSlaPolicy.findFirst({ where: { organizationId: org, id: policyId } });
      if (!p) throw new NotFoundException('No such policy.');
      requireSetUp(a, p.deskId, 'desk.sla.manage');
      this.checkTargets(p.kind as 'sla' | 'ola', dto);
      await this.checkRefs(tx, org, p.deskId, dto);
      const last = await tx.sdSlaPolicyVersion.findFirstOrThrow({ where: { organizationId: org, policyId }, orderBy: { version: 'desc' } });
      const validFrom = this.from(dto.validFrom);
      if (validFrom <= last.validFrom) throw new BadRequestException('The new version must start after the current one.');
      const v = await tx.sdSlaPolicyVersion.create({ data: { organizationId: org, deskId: p.deskId, policyId, version: last.version + 1, validFrom, ...this.versionData(dto), createdBy: a.userId } });
      await audit(tx, a, 'desk.sla.version_added', 'sd_sla_policy', p.id, { version: v.version, validFrom, targets: dto.targets.map((t) => ({ metric: t.metric, minutes: t.minutes })) });
      return { id: v.id, version: v.version };
    });
  }

  async updatePolicy(a: DeskActor, policyId: string, dto: UpdateSlaPolicyDto) {
    const org = a.ctx.organizationId;
    return this.tenantPrisma.forTenant(a.ctx, async (tx) => {
      const p = await tx.sdSlaPolicy.findFirst({ where: { organizationId: org, id: policyId } });
      if (!p) throw new NotFoundException('No such policy.');
      requireSetUp(a, p.deskId, 'desk.sla.manage');
      const { version, ...fields } = dto;
      const res = await tx.sdSlaPolicy.updateMany({ where: { organizationId: org, id: policyId, version }, data: { ...fields, version: { increment: 1 } } });
      if (!res.count) throw new ConflictException('Someone else changed this policy. Reload.');
      await audit(tx, a, 'desk.sla.policy_updated', 'sd_sla_policy', p.id, { changed: fields });
      return { id: p.id };
    });
  }

  async setComplianceTargets(a: DeskActor, deskId: string, dto: ComplianceTargetsDto) {
    requireSetUp(a, deskId, 'desk.sla.manage');
    const org = a.ctx.organizationId;
    const keys = dto.targets.map((t) => `${t.metric}:${t.priority ?? '*'}`);
    if (new Set(keys).size !== keys.length) throw new BadRequestException('Each measure and priority appears once.');
    return this.tenantPrisma.forTenant(a.ctx, async (tx) => {
      if (!(await tx.sdDesk.findFirst({ where: { organizationId: org, id: deskId }, select: { id: true } }))) throw new NotFoundException('No such desk.');
      await tx.sdSlaComplianceTarget.deleteMany({ where: { organizationId: org, deskId } });
      if (dto.targets.length) await tx.sdSlaComplianceTarget.createMany({ data: dto.targets.map((t) => ({ organizationId: org, deskId, metric: t.metric, priority: t.priority, targetPercent: t.targetPercent, createdBy: a.userId })) });
      await audit(tx, a, 'desk.sla.targets_set', 'sd_desk', deskId, { targets: dto.targets });
      return { saved: dto.targets.length };
    });
  }

  // ------------------------------------------------------------------------------------------ on the ticket (SD-1.16)

  /** The SLA timeline of one ticket: each measure with its stretches, pauses with reasons, breach, reason, exclusion. */
  async ticketView(tx: Tx, a: DeskActor, t: TicketRow, now = new Date()) {
    const org = a.ctx.organizationId;
    const timers = await tx.sdSlaTimer.findMany({ where: { organizationId: org, ticketId: t.id }, orderBy: { createdAt: 'asc' } });
    const events = await tx.sdSlaTimerEvent.findMany({ where: { organizationId: org, ticketId: t.id }, orderBy: { at: 'asc' } });
    const groups = new Map((await tx.sdGroup.findMany({ where: { organizationId: org, deskId: t.deskId }, select: { id: true, name: true } })).map((g) => [g.id, g.name]));
    const cache = new Map<string, CalendarSpec>();
    const out = [];
    for (const x of timers) {
      const mine = events.filter((e) => e.timerId === x.id);
      const used = elapsed(await this.specFor(tx, x, cache), this.clock(x), now);
      const stoppedAt = x.metAt ?? x.cancelledAt;
      out.push({
        id: x.id,
        kind: x.kind,
        metric: x.metric,
        label: METRIC_LABEL[x.metric as Metric] + (x.groupId && x.metric === 'group' ? ` · ${groups.get(x.groupId) ?? ''}` : ''),
        state: x.state,
        breached: Boolean(x.breachedAt),
        startedAt: x.startedAt,
        dueAt: x.dueAt,
        breachedAt: x.breachedAt,
        metAt: x.metAt,
        targetSeconds: x.targetSeconds,
        usedSeconds: used,
        percent: Math.round((used * 100) / x.targetSeconds),
        pauseReason: x.pauseReason,
        breachReason: x.breachReason,
        excluded: x.excluded,
        exclusionReason: x.exclusionReason,
        cancelReason: x.cancelReason,
        segments: segments(mine, x.breachedAt, stoppedAt ?? now).map((s) => ({ from: s.from, to: s.to, state: s.state, reason: s.reason ?? null })),
        events: mine.map((e) => ({ kind: e.kind, at: e.at, percent: e.percent, reason: e.reason })),
      });
    }
    return out;
  }

  /** US-G-015: the agent says why a target was missed. */
  async breachReason(tx: Tx, a: DeskActor, t: TicketRow, timerId: string, reason: string) {
    requireWork(a, t.deskId);
    const x = await tx.sdSlaTimer.findFirst({ where: { organizationId: a.ctx.organizationId, ticketId: t.id, id: timerId } });
    if (!x) throw new NotFoundException('No such target on this ticket.');
    if (!x.breachedAt) throw new BadRequestException('This target was not missed.');
    await tx.sdSlaTimer.update({ where: { id: x.id }, data: { breachReason: reason, breachReasonBy: a.userId } });
    await this.log(tx, x, 'reason', { reason, by: a.userId });
    await audit(tx, a, 'desk.sla.breach_reason', 'sd_ticket', t.id, { timerId: x.id, metric: x.metric, reason });
    return { saved: true };
  }

  /** US-G-015: a team lead leaves a missed target out of the SLA counts (audited); never their own call alone in reports. */
  async exclude(tx: Tx, a: DeskActor, t: TicketRow, timerId: string, reason: string) {
    if (!isLead(a, t.deskId) || !has(a, 'desk.ticket.work')) throw new ForbiddenException('Only a team lead of this desk approves an exclusion.');
    const x = await tx.sdSlaTimer.findFirst({ where: { organizationId: a.ctx.organizationId, ticketId: t.id, id: timerId } });
    if (!x) throw new NotFoundException('No such target on this ticket.');
    if (!x.breachedAt) throw new BadRequestException('Only a missed target can be left out.');
    if (x.excluded) throw new ConflictException('Already left out.');
    await tx.sdSlaTimer.update({ where: { id: x.id }, data: { excluded: true, exclusionReason: reason, excludedBy: a.userId, excludedAt: new Date() } });
    await this.log(tx, x, 'exclusion', { reason, by: a.userId });
    await audit(tx, a, 'desk.sla.exclusion_approved', 'sd_ticket', t.id, { timerId: x.id, metric: x.metric, reason });
    return { excluded: true };
  }

  /** The requester sees only when their ticket should be resolved, never internal reasons (US-G-016). */
  async requesterDue(tx: Tx, org: string, ticketId: string): Promise<{ resolveBy: Date | null; paused: boolean } | null> {
    const x = await tx.sdSlaTimer.findFirst({ where: { organizationId: org, ticketId, kind: 'sla', metric: 'resolution', state: { in: LIVE } } });
    return x ? { resolveBy: x.state === 'running' ? x.dueAt : null, paused: x.state === 'paused' } : null;
  }

  // ------------------------------------------------------------------------------------------ compliance (US-G-015)

  /**
   * One month on one desk: per measure and priority, how many promises were kept on time, against the target, with an
   * at-risk flag when the open promises due this month could pull the month below it. Counts only, no ticket content,
   * so it counts every ticket of the desk (sensitive ones too) through the system context.
   */
  async compliance(a: DeskActor, deskId: string, month: string) {
    const seat = a.roles.get(deskId);
    if (!has(a, 'desk.report.view') && !has(a, 'desk.sla.manage')) throw new ForbiddenException('You cannot see desk reports.');
    if (!(seat === 'lead' || seat === 'admin' || has(a, 'desk.desk.create'))) throw new NotFoundException('No such desk.');
    const from = new Date(`${month}-01T00:00:00+05:30`);
    const to = new Date(from);
    to.setUTCMonth(to.getUTCMonth() + 1);
    const org = a.ctx.organizationId;
    return deskSystem(this.tenantPrisma, a.ctx, async (tx) => {
      const rows = await tx.$queryRaw<{ metric: string; priority: number; kept: bigint; missed: bigint; open_due: bigint; excluded: bigint }[]>`
        SELECT x.metric, t.priority,
          count(*) FILTER (WHERE x.state = 'met' AND x.breached_at IS NULL AND NOT x.excluded) AS kept,
          count(*) FILTER (WHERE x.breached_at IS NOT NULL AND NOT x.excluded) AS missed,
          count(*) FILTER (WHERE x.state IN ('running', 'paused') AND x.breached_at IS NULL) AS open_due,
          count(*) FILTER (WHERE x.excluded) AS excluded
        FROM sd_sla_timers x JOIN sd_tickets t ON t.organization_id = x.organization_id AND t.id = x.ticket_id
        WHERE x.organization_id = ${org}::uuid AND x.desk_id = ${deskId}::uuid AND x.kind = 'sla' AND x.state <> 'cancelled'
          AND ((x.met_at >= ${from} AND x.met_at < ${to})
            OR (x.breached_at >= ${from} AND x.breached_at < ${to} AND x.met_at IS NULL)
            OR (x.state IN ('running', 'paused') AND x.breached_at IS NULL AND (x.due_at IS NULL OR x.due_at < ${to})))
        GROUP BY x.metric, t.priority`;
      const targets = await tx.sdSlaComplianceTarget.findMany({ where: { organizationId: org, deskId } });
      const keys = new Set([...rows.map((r) => `${r.metric}:${r.priority}`), ...targets.map((t) => `${t.metric}:${t.priority ?? '*'}`)]);
      const lines = [...keys].map((k) => {
        const [metric, p] = k.split(':');
        const sel = rows.filter((r) => r.metric === metric && (p === '*' || r.priority === Number(p)));
        const kept = sel.reduce((s, r) => s + Number(r.kept), 0);
        const missed = sel.reduce((s, r) => s + Number(r.missed), 0);
        const open = sel.reduce((s, r) => s + Number(r.open_due), 0);
        const excluded = sel.reduce((s, r) => s + Number(r.excluded), 0);
        const target = targets.find((t) => t.metric === metric && String(t.priority ?? '*') === p);
        const counted = kept + missed;
        const percent = counted ? Math.round((kept * 1000) / counted) / 10 : null;
        const goal = target ? Number(target.targetPercent) : null;
        // At risk: already below target, or below it if the open promises due this month are all missed.
        const worst = counted + open ? (kept * 100) / (counted + open) : null;
        return { metric, label: METRIC_LABEL[metric as Metric], priority: p === '*' ? null : Number(p), kept, missed, open, excluded, percent, target: goal, atRisk: goal !== null && ((percent !== null && percent < goal) || (worst !== null && worst < goal)) };
      });
      return { month, lines: lines.filter((l) => l.target !== null || l.priority !== null).sort((x, y) => x.metric.localeCompare(y.metric) || (x.priority ?? 0) - (y.priority ?? 0)) };
    });
  }
}

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
