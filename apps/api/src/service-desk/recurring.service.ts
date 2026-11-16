import { BadRequestException, ConflictException, ForbiddenException, HttpException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService, TenantPrismaService } from '@exam-platform/shared';
import { CompanyContext, Tx } from '../org-structure/org-structure.service';
import { deskRobot } from './catalog.service';
import { DeskActor, SEAT_REQUIRED, activeOn, audit, deskSystem, emit, requireDesk, requireSetUp, requireWork } from './desk-access';
import { ScheduleError, dueBetween, nextRun, preview } from './recurrence';
import { RequesterService } from './requester.service';
import { cleanHtml, htmlToText } from './rich-text';
import { OPEN_STATES, TicketsService } from './tickets.service';
import { ChangesService, Owner } from './changes.service';
import { NotificationsService } from '../notifications/notifications.service';
import { todayIst } from '../org-structure/org-validation';
import { Notice } from '../workflow/approvals-engine.service';
import { checkPlace } from './facilities.service';

// SD-2.13 (US-G-052, US-G-053). Recurring records: a template and an RFC 5545 rule; the job makes each due ticket once
// (a run row per due time), marks one made after an outage as "late" and an earlier one still open when the next comes
// as "missed"; a schedule can be paused, resumed or ended. Timed message sequences: steps that reply to the requester
// after set hours, from the agent who started it; a reply from the requester, a resolved or closed ticket, or the agent
// leaving the desk stops it. Replies go out like any agent reply (email only as the person's preferences allow).

const MAX_CATCH_UP = 10;
const LATE_MS = 15 * 60_000;
interface Template {
  subject: string;
  bodyHtml: string;
  typeId?: string | null;
  categoryId?: string | null;
  groupId?: string | null;
  assigneeUserId?: string | null;
  priority?: number | null;
  requesterPersonId: string;
  /** Helpdesk plan item 4: maintenance of one piece of equipment of this desk. */
  equipmentId?: string | null;
  /**
   * ITSM answer 1952: each run raises a standard change from this pre-approved template (one schedule per template), its
   * window starting this many hours after the run and lasting these minutes.
   */
  standard?: { templateId: string; startAfterHours: number; minutes: number } | null;
}
interface Step {
  afterHours: number;
  bodyHtml: string;
}

const plain = (fn: () => unknown) => {
  try {
    return fn();
  } catch (e) {
    if (e instanceof ScheduleError) throw new BadRequestException(e.message);
    throw e;
  }
};

@Injectable()
export class RecurringService {
  private readonly logger = new Logger(RecurringService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly tickets: TicketsService,
    private readonly requesters: RequesterService,
    private readonly notifications: NotificationsService,
    private readonly changes: ChangesService,
  ) {}

  private tx<T>(a: DeskActor, fn: (tx: Tx) => Promise<T>) {
    return this.tenantPrisma.forTenant(a.ctx, fn);
  }

  // ------------------------------------------------------------------------------------------ recurring: set-up

  private async template(tx: Tx, a: DeskActor, deskId: string, x: Partial<Template>, requesterPersonId: string, scheduleId: string | null = null): Promise<Template> {
    const org = a.ctx.organizationId;
    const subject = (x.subject ?? '').trim();
    if (!subject || subject.length > 200) throw new BadRequestException('Give the ticket a subject (up to 200 characters).');
    const standard = x.standard ? await this.standardOf(tx, org, deskId, x.standard, scheduleId) : null;
    const bodyHtml = cleanHtml(x.bodyHtml || (standard ? `<p>Standard change: ${subject.replace(/[<>&]/g, '')}</p>` : ''));
    if (!htmlToText(bodyHtml)) throw new BadRequestException('Describe what has to be done.');
    if (x.typeId && !(await tx.sdTicketType.findFirst({ where: { organizationId: org, deskId, id: x.typeId, active: true }, select: { id: true } }))) throw new BadRequestException('Choose a ticket type of this desk.');
    if (x.categoryId && !(await tx.sdCategory.findFirst({ where: { organizationId: org, deskId, id: x.categoryId, active: true }, select: { id: true } }))) throw new BadRequestException('Choose a category of this desk.');
    if (x.groupId && !(await tx.sdGroup.findFirst({ where: { organizationId: org, deskId, id: x.groupId, active: true }, select: { id: true } }))) throw new BadRequestException('Choose a team of this desk.');
    if (x.assigneeUserId && !(await this.tickets.seatHeld(tx, org, deskId, x.assigneeUserId))) throw new BadRequestException('Choose an agent of this desk.');
    if (x.priority !== undefined && x.priority !== null && (!Number.isInteger(x.priority) || x.priority < 1 || x.priority > 4)) throw new BadRequestException('Priority is 1 to 4.');
    if (x.equipmentId && !(await tx.sdEquipment.findFirst({ where: { organizationId: org, deskId, id: x.equipmentId, status: 'active' }, select: { id: true } }))) throw new BadRequestException("Choose active equipment of this desk's register.");
    return { standard, equipmentId: x.equipmentId ?? null, subject, bodyHtml, typeId: x.typeId ?? null, categoryId: x.categoryId ?? null, groupId: x.groupId ?? null, assigneeUserId: x.assigneeUserId ?? null, priority: x.priority ?? null, requesterPersonId };
  }

  /** Answer 1952: a pre-approved change template of this IT desk, on at most one schedule; a sensible window. */
  private async standardOf(tx: Tx, org: string, deskId: string, x: NonNullable<Template['standard']>, scheduleId: string | null) {
    const desk = await tx.sdDesk.findFirst({ where: { organizationId: org, id: deskId }, select: { kind: true } });
    if (desk?.kind !== 'it') throw new BadRequestException('Standard changes repeat on IT desks only.');
    const tpl = typeof x.templateId === 'string' ? await tx.sdTemplate.findFirst({ where: { organizationId: org, deskId, id: x.templateId, active: true, preApproved: true } }) : null;
    if (!tpl) throw new BadRequestException('Choose a pre-approved standard change of this desk.');
    const startAfterHours = Number(x.startAfterHours);
    const minutes = Number(x.minutes);
    if (!Number.isInteger(startAfterHours) || startAfterHours < 0 || startAfterHours > 168) throw new BadRequestException('Start the window 0 to 168 hours after the schedule time.');
    if (!Number.isInteger(minutes) || minutes < 15 || minutes > 720) throw new BadRequestException('A window lasts 15 to 720 minutes.');
    const others = await tx.sdRecurring.findMany({ where: { organizationId: org, deskId, state: { not: 'ended' }, ...(scheduleId ? { id: { not: scheduleId } } : {}) }, select: { template: true } });
    if (others.some((o) => (o.template as unknown as Template).standard?.templateId === tpl.id)) throw new ConflictException(`"${tpl.name}" already repeats on another schedule. Change that one instead.`);
    return { templateId: tpl.id, startAfterHours, minutes };
  }

  async list(a: DeskActor, deskId: string) {
    requireSetUp(a, deskId, 'desk.rule.manage');
    return this.tx(a, async (tx) => {
      await requireDesk(tx, a, deskId);
      const rows = await tx.sdRecurring.findMany({ where: { organizationId: a.ctx.organizationId, deskId }, orderBy: { name: 'asc' } });
      const runs = await tx.sdRecurringRun.findMany({ where: { organizationId: a.ctx.organizationId, recurringId: { in: rows.map((r) => r.id) } }, orderBy: { dueAt: 'desc' }, take: 200 });
      return rows.map((r) => ({
        id: r.id,
        name: r.name,
        template: r.template,
        rrule: r.rrule,
        timeZone: r.timeZone,
        startsAt: r.startsAt,
        nextRunAt: r.nextRunAt,
        lastRunAt: r.lastRunAt,
        state: r.state,
        version: r.version,
        upcoming: r.state === 'active' ? preview({ rule: r.rrule, zone: r.timeZone, startsAt: r.startsAt }, 3) : [],
        runs: runs.filter((x) => x.recurringId === r.id).slice(0, 10).map((x) => ({ dueAt: x.dueAt, ticketId: x.ticketId, late: x.late, missed: x.missed })),
      }));
    });
  }

  async create(a: DeskActor, dto: { deskId: string; name: string; rrule: string; timeZone: string; startsAt: string; template: Partial<Template> }) {
    requireSetUp(a, dto.deskId, 'desk.rule.manage');
    try {
      return await this.tx(a, async (tx) => {
        await requireDesk(tx, a, dto.deskId);
        const me = (await this.requesters.personOf(tx, { ctx: a.ctx, userId: a.userId, acting: false, user: { role: a.user?.role ?? 'panel' } }, true))!;
        const template = await this.template(tx, a, dto.deskId, dto.template, me);
        const startsAt = new Date(dto.startsAt);
        const next = plain(() => nextRun({ rule: dto.rrule, zone: dto.timeZone, startsAt }, new Date(Math.max(Date.now(), startsAt.getTime()) - 1))) as Date | null;
        if (!next) throw new BadRequestException('This schedule never happens. Check the start and end.');
        const r = await tx.sdRecurring.create({ data: { organizationId: a.ctx.organizationId, deskId: dto.deskId, name: dto.name, template: template as unknown as Prisma.InputJsonValue, rrule: dto.rrule.trim().toUpperCase().replace(/^RRULE:/, ''), timeZone: dto.timeZone, startsAt, nextRunAt: next, createdBy: a.userId } });
        await audit(tx, a, 'desk.recurring.created', 'sd_recurring', r.id, { deskId: dto.deskId, name: dto.name, rrule: r.rrule, timeZone: r.timeZone, nextRunAt: next });
        return { id: r.id, nextRunAt: next, version: r.version };
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('A schedule with that name exists on this desk.');
      throw e;
    }
  }

  /** Pause, resume or end; or change the rule or template (the next run is worked out again). */
  async update(a: DeskActor, id: string, dto: { version: number; state?: 'active' | 'paused' | 'ended'; rrule?: string; timeZone?: string; template?: Partial<Template> }) {
    return this.tx(a, async (tx) => {
      const org = a.ctx.organizationId;
      const r = await tx.sdRecurring.findFirst({ where: { organizationId: org, id } });
      if (!r) throw new NotFoundException('No such schedule.');
      requireSetUp(a, r.deskId, 'desk.rule.manage');
      if (r.state === 'ended') throw new ConflictException('This schedule has ended. Make a new one.');
      const rule = dto.rrule ?? r.rrule;
      const zone = dto.timeZone ?? r.timeZone;
      const template = dto.template ? await this.template(tx, a, r.deskId, dto.template, (r.template as unknown as Template).requesterPersonId, r.id) : undefined;
      const state = dto.state ?? r.state;
      const next = state === 'active' ? (plain(() => nextRun({ rule, zone, startsAt: r.startsAt }, new Date())) as Date | null) : null;
      const res = await tx.sdRecurring.updateMany({
        where: { id, version: dto.version },
        data: { rrule: rule.trim().toUpperCase().replace(/^RRULE:/, ''), timeZone: zone, state: state === 'active' && !next ? 'ended' : state, nextRunAt: next, ...(template ? { template: template as unknown as Prisma.InputJsonValue } : {}), version: { increment: 1 }, updatedAt: new Date() },
      });
      if (!res.count) throw new ConflictException('Someone changed this schedule. Reload to see the latest.');
      await audit(tx, a, 'desk.recurring.updated', 'sd_recurring', id, { state, rrule: rule, timeZone: zone, nextRunAt: next });
      return { id, state: state === 'active' && !next ? 'ended' : state, nextRunAt: next, version: dto.version + 1 };
    });
  }

  // ------------------------------------------------------------------------------------------ recurring: the job

  /** Job every 5 minutes: each due time of each active schedule makes one ticket (claimed with SKIP LOCKED). */
  async tick(now = new Date()): Promise<number> {
    const due = await deskSystem(this.tenantPrisma, { organizationId: null, isSuperAdmin: true }, (tx) =>
      tx.sdRecurring.findMany({ where: { state: 'active', nextRunAt: { lte: now } }, select: { id: true, organizationId: true }, take: 200 }),
    );
    let n = 0;
    const paused: Paused[] = [];
    for (const d of due) {
      try {
        const after: (() => Promise<void>)[] = [];
        const mine: Paused[] = []; // kept only once this desk's run is saved
        n += await deskSystem(this.tenantPrisma, { organizationId: d.organizationId, isSuperAdmin: false }, (tx) => this.runOne(tx, { organizationId: d.organizationId, isSuperAdmin: false }, d.id, now, mine, after), { timeout: 30_000 });
        paused.push(...mine);
        // A standard change's notices leave only once the run is saved.
        for (const fn of after) await fn().catch((e) => this.logger.warn(`recurring notice: ${(e as Error).message}`));
      } catch (e) {
        this.logger.warn(`recurring ${d.id}: ${(e as Error).message}`);
      }
    }
    // Answer 1913: after the change is saved, the desk's admins hear that a schedule paused (once: it is no longer active).
    for (const p of paused) {
      if (!p.adminIds.length) continue;
      await this.notifications
        .notifySystem({ organizationId: p.organizationId, isSuperAdmin: false }, p.adminIds, 'helpdesk.recurring.paused', { entityType: 'sd_recurring', entityId: p.recurringId, contextText: `${p.name} paused: ${p.equipment} was retired`, linkPath: '/yx/desk/setup?tab=schedules' }, { subject: `Maintenance paused: ${p.name}`, html: `<p>The maintenance schedule ${esc(p.name)} paused because ${esc(p.equipment)} was retired. Point it at other equipment and resume it, or end it.</p>` })
        .catch((e) => this.logger.warn(`Paused-schedule notice not sent: ${(e as Error).message}`));
    }
    return n;
  }

  private async runOne(tx: Tx, ctx: CompanyContext, id: string, now: Date, paused: Paused[] = [], after: (() => Promise<void>)[] = []): Promise<number> {
    const org = ctx.organizationId;
    const [locked] = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM sd_recurring WHERE organization_id = ${org}::uuid AND id = ${id}::uuid AND state = 'active' FOR UPDATE SKIP LOCKED`;
    if (!locked) return 0;
    const r = await tx.sdRecurring.findFirstOrThrow({ where: { id } });
    if (!r.nextRunAt || r.nextRunAt > now) return 0;
    const s = { rule: r.rrule, zone: r.timeZone, startsAt: r.startsAt };
    // Every due time since the last run (an outage), oldest first, at most ten; the run row makes each one once.
    const times = dueBetween(s, new Date((r.lastRunAt ?? new Date(r.startsAt.getTime() - 1)).getTime()), now, MAX_CATCH_UP);
    if (!times.length) times.push(r.nextRunAt);
    const tpl = r.template as unknown as Template;
    // Helpdesk plan item 4: maintenance of equipment that was retired stops (paused) instead of making tickets.
    let place: { locationId: string | null; areaId: string | null; equipmentId: string | null } | null = null;
    if (tpl.equipmentId) {
      try {
        place = await checkPlace(tx, org, { equipmentId: tpl.equipmentId });
      } catch {
        await tx.sdRecurring.update({ where: { id: r.id }, data: { state: 'paused', updatedAt: new Date() } });
        await emit(tx, org, 'helpdesk.recurring.paused', { recurringId: r.id, deskId: r.deskId, reason: 'equipment_retired' });
        await audit(tx, { ctx, userId: null as unknown as string }, 'desk.recurring.paused', 'sd_recurring', r.id, { reason: 'equipment_retired', equipmentId: tpl.equipmentId });
        const eq = await tx.sdEquipment.findFirst({ where: { organizationId: org, id: tpl.equipmentId }, select: { name: true, tag: true } });
        const adminIds = (await tx.sdDeskMember.findMany({ where: { organizationId: org, deskId: r.deskId, role: 'admin', ...activeOn(todayIst()) }, select: { userId: true } })).map((m) => m.userId);
        paused.push({ organizationId: org, recurringId: r.id, name: r.name, equipment: eq ? `${eq.name} (${eq.tag})` : 'its equipment', adminIds: [...new Set(adminIds)] });
        return 0;
      }
    }
    let made = 0;
    for (const at of times) {
      const run = await tx.sdRecurringRun.createMany({ data: [{ organizationId: org, deskId: r.deskId, recurringId: r.id, dueAt: at, late: now.getTime() - at.getTime() > LATE_MS }], skipDuplicates: true });
      if (!run.count) continue;
      // US-G-052: the previous one still not done when the next is due shows as missed.
      const prev = await tx.sdRecurringRun.findFirst({ where: { organizationId: org, recurringId: r.id, dueAt: { lt: at }, ticketId: { not: null } }, orderBy: { dueAt: 'desc' } });
      const prevTicket = prev?.ticketId ? await tx.sdTicket.findFirst({ where: { organizationId: org, id: prev.ticketId }, select: { systemState: true } }) : null;
      if (prev && prevTicket && OPEN_STATES.includes(prevTicket.systemState)) await tx.sdRecurringRun.update({ where: { id: prev.id }, data: { missed: true } });
      if (tpl.standard) {
        made += await this.standardRun(tx, ctx, r, tpl, at, after);
        continue;
      }
      const robot = deskRobot({ ctx }, r.deskId);
      let t = await this.tickets.createIn(tx, { ctx, userId: null }, {
        deskId: r.deskId,
        typeId: tpl.typeId ?? undefined,
        categoryId: tpl.categoryId ?? undefined,
        subject: tpl.subject,
        bodyHtml: tpl.bodyHtml,
        priority: tpl.priority ?? undefined,
        requesterPersonId: tpl.requesterPersonId,
        openedByUserId: null,
        channel: 'api',
        side: 'requester',
        authorPersonId: tpl.requesterPersonId,
        tags: ['recurring'],
        ...(place ?? {}),
      });
      if (tpl.groupId || tpl.assigneeUserId) {
        const owner = tpl.assigneeUserId && (await this.tickets.seatHeld(tx, org, r.deskId, tpl.assigneeUserId)) ? tpl.assigneeUserId : null;
        t = await this.tickets.assignIn(tx, robot, t, owner ?? t.assigneeUserId, tpl.groupId ?? undefined, `Recurring: ${r.name}`);
      }
      await tx.sdRecurringRun.updateMany({ where: { organizationId: org, recurringId: r.id, dueAt: at }, data: { ticketId: t.id } });
      await emit(tx, org, 'helpdesk.recurring.created', { ticketId: t.id, deskId: r.deskId, recurringId: r.id });
      made++;
    }
    const next = nextRun(s, now);
    await tx.sdRecurring.update({ where: { id: r.id }, data: { lastRunAt: times[times.length - 1], nextRunAt: next, state: next ? 'active' : 'ended', updatedAt: new Date() } });
    return made;
  }

  /**
   * Answer 1952: one run raises the standard change (scheduled at once, as any standard change). A window the change
   * rules refuse (a freeze, outside the change window) skips that run and says why; a template that lost its
   * pre-approval pauses the schedule.
   */
  private async standardRun(tx: Tx, ctx: CompanyContext, r: Prisma.SdRecurringGetPayload<object>, tpl: Template, at: Date, after: (() => Promise<void>)[]) {
    const org = ctx.organizationId;
    const st = tpl.standard!;
    const template = await tx.sdTemplate.findFirst({ where: { organizationId: org, id: st.templateId, active: true, preApproved: true }, select: { name: true } });
    if (!template || !r.createdBy) {
      await tx.sdRecurring.update({ where: { id: r.id }, data: { state: 'paused', updatedAt: new Date() } });
      await emit(tx, org, 'helpdesk.recurring.paused', { recurringId: r.id, deskId: r.deskId, reason: 'not_pre_approved' });
      return 0;
    }
    const from = new Date(at.getTime() + st.startAfterHours * 3_600_000);
    const notices: Notice[] = [];
    const owner: Owner = { to: [] };
    try {
      await tx.$executeRaw`SAVEPOINT sd_recurring_change`;
      const c = await this.changes.createIn(tx, { ctx, userId: r.createdBy }, { deskId: r.deskId, kind: 'standard', templateId: st.templateId, title: tpl.subject, service: r.name, from: from.toISOString(), to: new Date(from.getTime() + st.minutes * 60_000).toISOString(), backout: `As in the pre-approved template "${template.name}".`, banner: true }, notices, owner, true);
      await tx.$executeRaw`RELEASE SAVEPOINT sd_recurring_change`;
      const ticketId = (await tx.sdChange.findUniqueOrThrow({ where: { id: c.id }, select: { ticketId: true } })).ticketId;
      await tx.sdRecurringRun.updateMany({ where: { organizationId: org, recurringId: r.id, dueAt: at }, data: { ticketId } });
      await emit(tx, org, 'helpdesk.recurring.created', { ticketId, deskId: r.deskId, recurringId: r.id });
      after.push(() => this.changes.afterRaise(ctx, notices, owner));
      return 1;
    } catch (e) {
      await tx.$executeRaw`ROLLBACK TO SAVEPOINT sd_recurring_change`;
      // The rule that refused it (a freeze, the window) in plain words; anything else stays in the server log.
      const reason = e instanceof HttpException ? (e as Error).message.slice(0, 300) : 'It could not be raised; see the server log.';
      if (!(e instanceof HttpException)) this.logger.warn(`recurring standard change ${r.id}: ${(e as Error).message}`);
      await emit(tx, org, 'helpdesk.recurring.skipped', { recurringId: r.id, deskId: r.deskId, dueAt: at.toISOString(), reason });
      await AuditService.recordIn(tx, ctx, { actorUserId: null, action: 'desk.recurring.skipped', entityType: 'sd_recurring', entityId: r.id, metadata: { dueAt: at.toISOString(), reason } });
      // Answer 2054: the desk's IT leads are told (once the skip is saved).
      const leads = (await tx.sdDeskMember.findMany({ where: { organizationId: org, deskId: r.deskId, role: 'lead', ...activeOn(todayIst()) }, select: { userId: true } })).map((m) => m.userId);
      const text = `${r.name}: the standard change due ${at.toISOString().slice(0, 10)} was not raised. ${reason}`.slice(0, 300);
      if (leads.length)
        after.push(() =>
          this.notifications.notifySystem(ctx, leads, 'helpdesk.recurring.skipped', { entityType: 'sd_recurring', entityId: r.id, contextText: text, linkPath: `/yx/desk/setup?tab=schedules` }, { subject: `A scheduled standard change was not raised: ${r.name}`.slice(0, 150), html: `<p>${text.replace(/[<>&]/g, '')}</p><p>Raise it by hand if it is still needed, or change the schedule.</p>` }),
        );
      this.logger.log(`recurring standard change ${r.id} skipped: ${reason}`);
      return 0;
    }
  }

  // ------------------------------------------------------------------------------------------ sequences: set-up

  private steps(x: unknown): Step[] {
    if (!Array.isArray(x) || !x.length || x.length > 10) throw new BadRequestException('Add 1 to 10 messages.');
    return x.map((s, i) => {
      const o = s as Record<string, unknown>;
      const afterHours = Number(o?.afterHours);
      if (!Number.isInteger(afterHours) || afterHours < 1 || afterHours > 720) throw new BadRequestException(`Message ${i + 1}: send it after 1 to 720 hours.`);
      const bodyHtml = cleanHtml(String(o?.bodyHtml ?? ''));
      if (!htmlToText(bodyHtml)) throw new BadRequestException(`Message ${i + 1}: write the message.`);
      return { afterHours, bodyHtml };
    });
  }

  async sequences(a: DeskActor, deskId: string) {
    if (!a.roles.has(deskId)) throw new NotFoundException('No such desk.');
    return this.tx(a, async (tx) => {
      const rows = await tx.sdSequence.findMany({ where: { organizationId: a.ctx.organizationId, deskId }, orderBy: { name: 'asc' } });
      return rows.map((s) => ({ id: s.id, name: s.name, steps: s.steps, active: s.active, version: s.version }));
    });
  }

  async saveSequence(a: DeskActor, id: string | null, dto: { deskId?: string; name?: string; steps?: unknown; active?: boolean; version?: number }) {
    const steps = dto.steps === undefined ? undefined : this.steps(dto.steps);
    try {
      return await this.tx(a, async (tx) => {
        const org = a.ctx.organizationId;
        if (!id) {
          requireSetUp(a, dto.deskId!, 'desk.rule.manage');
          await requireDesk(tx, a, dto.deskId!);
          if (!steps) throw new BadRequestException('Add 1 to 10 messages.');
          const s = await tx.sdSequence.create({ data: { organizationId: org, deskId: dto.deskId!, name: dto.name!, steps: steps as unknown as Prisma.InputJsonValue, createdBy: a.userId } });
          await audit(tx, a, 'desk.sequence.created', 'sd_sequence', s.id, { deskId: s.deskId, name: s.name, steps: steps.length });
          return { id: s.id, version: s.version };
        }
        const s = await tx.sdSequence.findFirst({ where: { organizationId: org, id } });
        if (!s) throw new NotFoundException('No such sequence.');
        requireSetUp(a, s.deskId, 'desk.rule.manage');
        const res = await tx.sdSequence.updateMany({ where: { id, version: dto.version }, data: { name: dto.name, active: dto.active, ...(steps ? { steps: steps as unknown as Prisma.InputJsonValue } : {}), version: { increment: 1 }, updatedAt: new Date() } });
        if (!res.count) throw new ConflictException('Someone changed this sequence. Reload to see the latest.');
        await audit(tx, a, 'desk.sequence.saved', 'sd_sequence', id, { name: dto.name, active: dto.active, steps: steps?.length });
        return { id, version: (dto.version ?? 0) + 1 };
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('A sequence with that name exists on this desk.');
      throw e;
    }
  }

  // ------------------------------------------------------------------------------------------ sequences: on a ticket

  async startOn(a: DeskActor, ticketId: string, sequenceId: string) {
    return this.tx(a, async (tx) => {
      const org = a.ctx.organizationId;
      const { t, access } = await this.tickets.load(tx, a, ticketId);
      if (access !== 'agent') throw new ForbiddenException(SEAT_REQUIRED);
      requireWork(a, t.deskId);
      if (!OPEN_STATES.includes(t.systemState)) throw new ConflictException('Start a sequence on an open ticket.');
      const s = await tx.sdSequence.findFirst({ where: { organizationId: org, deskId: t.deskId, id: sequenceId, active: true } });
      if (!s) throw new BadRequestException('Choose a sequence of this desk.');
      const first = (s.steps as unknown as Step[])[0];
      try {
        const run = await tx.sdSequenceRun.create({ data: { organizationId: org, deskId: t.deskId, ticketId: t.id, sequenceId: s.id, sequenceVersion: s.version, startedBy: a.userId, nextAt: new Date(Date.now() + first.afterHours * 3_600_000) } });
        await this.tickets.event(tx, t, 'sequence_started', null, s.name, { by: a.userId });
        await audit(tx, a, 'desk.sequence.started', 'sd_ticket', t.id, { sequenceId: s.id, runId: run.id });
        return { id: run.id, nextAt: run.nextAt };
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('This sequence is already running on this ticket.');
        throw e;
      }
    });
  }

  async runsOn(a: DeskActor, ticketId: string) {
    return this.tx(a, async (tx) => {
      const { t } = await this.tickets.load(tx, a, ticketId);
      const runs = await tx.sdSequenceRun.findMany({ where: { organizationId: a.ctx.organizationId, ticketId: t.id }, orderBy: { createdAt: 'desc' } });
      const names = new Map((await tx.sdSequence.findMany({ where: { organizationId: a.ctx.organizationId, id: { in: runs.map((r) => r.sequenceId) } }, select: { id: true, name: true } })).map((s) => [s.id, s.name]));
      return runs.map((r) => ({ id: r.id, sequence: names.get(r.sequenceId) ?? '', step: r.step, state: r.state, nextAt: r.nextAt, stopReason: r.stopReason }));
    });
  }

  async stop(a: DeskActor, ticketId: string, runId: string) {
    return this.tx(a, async (tx) => {
      const { t, access } = await this.tickets.load(tx, a, ticketId);
      if (access !== 'agent') throw new ForbiddenException(SEAT_REQUIRED);
      requireWork(a, t.deskId);
      const res = await tx.sdSequenceRun.updateMany({ where: { organizationId: a.ctx.organizationId, ticketId: t.id, id: runId, state: 'running' }, data: { state: 'stopped', stopReason: 'Stopped by an agent', nextAt: null, updatedAt: new Date() } });
      if (!res.count) throw new ConflictException('This sequence is not running.');
      await audit(tx, a, 'desk.sequence.stopped', 'sd_ticket', t.id, { runId });
      return { stopped: true };
    });
  }

  /** Job: send each due step, or stop when the requester replied, the ticket is done, or the agent left the desk. */
  async sequenceTick(now = new Date()): Promise<number> {
    const due = await deskSystem(this.tenantPrisma, { organizationId: null, isSuperAdmin: true }, (tx) =>
      tx.sdSequenceRun.findMany({ where: { state: 'running', nextAt: { lte: now } }, select: { id: true, organizationId: true }, take: 500 }),
    );
    let n = 0;
    for (const d of due) {
      const ctx = { organizationId: d.organizationId, isSuperAdmin: false };
      try {
        const sent = await deskSystem(this.tenantPrisma, ctx, async (tx) => {
          const [locked] = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM sd_sequence_runs WHERE organization_id = ${d.organizationId}::uuid AND id = ${d.id}::uuid AND state = 'running' FOR UPDATE SKIP LOCKED`;
          if (!locked) return null;
          const run = await tx.sdSequenceRun.findFirstOrThrow({ where: { id: d.id } });
          const t = await tx.sdTicket.findFirstOrThrow({ where: { organizationId: d.organizationId, id: run.ticketId } });
          const stop = (why: string) => tx.sdSequenceRun.update({ where: { id: run.id }, data: { state: 'stopped', stopReason: why, nextAt: null, updatedAt: new Date() } }).then(() => null);
          if (!OPEN_STATES.includes(t.systemState) || t.mergedIntoId) return stop('The ticket is resolved or closed');
          if (await tx.sdTicketMessage.findFirst({ where: { organizationId: d.organizationId, ticketId: t.id, side: 'requester', createdAt: { gt: run.createdAt } }, select: { id: true } })) return stop('The requester replied');
          if (!(await this.tickets.seatHeld(tx, d.organizationId, t.deskId, run.startedBy))) return stop('The agent who started it left the desk');
          const seq = await tx.sdSequence.findFirstOrThrow({ where: { organizationId: d.organizationId, id: run.sequenceId } });
          const steps = seq.steps as unknown as Step[];
          const step = steps[run.step];
          if (!step) return stop('No more messages');
          const { bodyHtml, bodyText, found } = this.tickets.cleanMasked(step.bodyHtml);
          const m = await tx.sdTicketMessage.create({ data: { organizationId: d.organizationId, deskId: t.deskId, ticketId: t.id, kind: 'reply', side: 'agent', authorUserId: run.startedBy, bodyHtml, bodyText, channel: 'agent' } });
          await this.tickets.keepPii(tx, t, m.id, found);
          const more = steps[run.step + 1];
          await tx.sdSequenceRun.update({ where: { id: run.id }, data: { step: run.step + 1, state: more ? 'running' : 'done', nextAt: more ? new Date(now.getTime() + more.afterHours * 3_600_000) : null, updatedAt: new Date() } });
          await this.tickets.event(tx, t, 'sequence_message', null, seq.name, { by: run.startedBy, reason: `Message ${run.step + 1} of ${steps.length}` });
          return { ticketId: t.id, messageId: m.id };
        });
        if (sent) {
          await this.tickets.mailOut.queueReply(d.organizationId, sent.ticketId, sent.messageId);
          n++;
        }
      } catch (e) {
        this.logger.warn(`sequence ${d.id}: ${(e as Error).message}`);
      }
    }
    return n;
  }
}

/** Answer 1913: a schedule paused in this tick, told to its desk's admins once the change is saved. */
interface Paused {
  organizationId: string;
  recurringId: string;
  name: string;
  equipment: string;
  adminIds: string[];
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
