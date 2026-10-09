import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomBytes, timingSafeEqual } from 'crypto';
import ical, { ICalEventData } from 'ical-generator';
import { OrgSecretsCryptoService, PrismaService, TenantPrismaService, resolvePermissionGrants } from '@exam-platform/shared';
import { NotificationsService } from '../notifications/notifications.service';
import { Tx } from '../org-structure/org-structure.service';
import { addDays, todayIst } from '../org-structure/org-validation';
import { checkLoginLink } from '../people/persons';
import { buildViewer, tenantWide } from '../access/scope';
import { DeskActor, activeOn, audit, deskSystem, has, ticketAccess } from './desk-access';
import { ReminderDto } from './dto';
import { OPEN_STATES } from './tickets.service';

// SD-1.11 reminders, snooze and the personal calendar with its iCal feed (US-G-009); SD-1.13 the daily sd_agents meter
// and the agent list behind the bill (§6.3, D2, YX-BILL-02); the founder's 8 Oct 2026 "possible duplicate" list for HR.

const FEED_DAYS_BACK = 30;
const FEED_DAYS_AHEAD = 180;
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

@Injectable()
export class MeService {
  private readonly logger = new Logger(MeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly crypto: OrgSecretsCryptoService,
    private readonly notifications: NotificationsService,
  ) {}

  private tx<T>(a: DeskActor, fn: (tx: Tx) => Promise<T>) {
    return this.tenantPrisma.forTenant(a.ctx, fn);
  }

  private desking(a: DeskActor) {
    if (!has(a, 'desk.ticket.view') || !a.roles.size) throw new ForbiddenException('Only people working a desk keep desk reminders.');
  }

  // ------------------------------------------------------------------------------------------ reminders and snooze

  async reminders(a: DeskActor) {
    this.desking(a);
    return this.tx(a, async (tx) => {
      const rows = await tx.sdReminder.findMany({ where: { organizationId: a.ctx.organizationId, userId: a.userId, doneAt: null }, orderBy: { remindAt: 'asc' }, take: 200 });
      const tickets = await this.ticketLabels(tx, a.ctx.organizationId, rows.map((r) => r.ticketId));
      return rows.map((r) => ({ id: r.id, kind: r.kind, remindAt: r.remindAt, note: r.note, notifiedAt: r.notifiedAt, ticket: r.ticketId ? (tickets.get(r.ticketId) ?? null) : null }));
    });
  }

  /** Ticket number and (when not sensitive or private) subject, for tickets the person may still open. */
  private async ticketLabels(tx: Tx, org: string, ids: (string | null)[]) {
    const list = [...new Set(ids.filter((x): x is string => Boolean(x)))];
    const rows = list.length ? await tx.sdTicket.findMany({ where: { organizationId: org, id: { in: list } }, select: { id: true, number: true, subject: true, sensitive: true, private: true, deskId: true } }) : [];
    return new Map(rows.map((t) => [t.id, { id: t.id, number: t.number, subject: t.sensitive || t.private ? null : t.subject, deskId: t.deskId }]));
  }

  /** A ticket the person may open as an agent or collaborator (404 otherwise). */
  private async ticketFor(tx: Tx, a: DeskActor, ticketId: string) {
    // The same reach as opening the ticket (review fix): a collaborator seat alone does not reach every ticket of a desk.
    const t = await tx.sdTicket.findFirst({ where: { organizationId: a.ctx.organizationId, id: ticketId }, select: { id: true, deskId: true, sensitive: true, private: true } });
    if (!t || !(await ticketAccess(tx, a, t))) throw new NotFoundException('No such ticket.');
    return t;
  }

  async addReminder(a: DeskActor, dto: ReminderDto) {
    this.desking(a);
    const at = new Date(dto.remindAt);
    if (at.getTime() < Date.now() - 60_000) throw new BadRequestException('Choose a time from now on.');
    return this.tx(a, async (tx) => {
      const t = dto.ticketId ? await this.ticketFor(tx, a, dto.ticketId) : null;
      const r = await tx.sdReminder.create({ data: { organizationId: a.ctx.organizationId, userId: a.userId, deskId: t?.deskId ?? null, ticketId: t?.id ?? null, remindAt: at, note: dto.note || null } });
      await audit(tx, a, 'desk.reminder.added', 'sd_reminder', r.id, { ticketId: t?.id ?? null, remindAt: at });
      return { id: r.id };
    });
  }

  async doneReminder(a: DeskActor, id: string) {
    return this.tx(a, async (tx) => {
      const res = await tx.sdReminder.updateMany({ where: { organizationId: a.ctx.organizationId, userId: a.userId, id, doneAt: null }, data: { doneAt: new Date() } });
      if (!res.count) throw new NotFoundException('No such reminder.');
      return { done: true };
    });
  }

  /** US-G-009: the ticket leaves my queue until then and comes back by itself (with a notice). */
  async snooze(a: DeskActor, ticketId: string, until: string) {
    this.desking(a);
    const at = new Date(until);
    if (at.getTime() <= Date.now()) throw new BadRequestException('Snooze until a time from now on.');
    if (at.getTime() > Date.now() + 90 * 86_400_000) throw new BadRequestException('Snooze for at most 90 days.');
    return this.tx(a, async (tx) => {
      const t = await this.ticketFor(tx, a, ticketId);
      await tx.sdReminder.updateMany({ where: { organizationId: a.ctx.organizationId, userId: a.userId, ticketId: t.id, kind: 'snooze', doneAt: null }, data: { doneAt: new Date() } });
      const r = await tx.sdReminder.create({ data: { organizationId: a.ctx.organizationId, userId: a.userId, deskId: t.deskId, ticketId: t.id, kind: 'snooze', remindAt: at, note: 'Back from snooze' } });
      await audit(tx, a, 'desk.ticket.snoozed', 'sd_ticket', t.id, { until: at });
      return { id: r.id, until: at };
    });
  }

  async unsnooze(a: DeskActor, ticketId: string) {
    return this.tx(a, async (tx) => {
      await tx.sdReminder.updateMany({ where: { organizationId: a.ctx.organizationId, userId: a.userId, ticketId, kind: 'snooze', doneAt: null }, data: { doneAt: new Date() } });
      return { snoozed: false };
    });
  }

  /** Tickets this person snoozed and that are still asleep (the list leaves them out unless asked). */
  static async snoozedIds(tx: Tx, org: string, userId: string, now = new Date()): Promise<string[]> {
    return (await tx.sdReminder.findMany({ where: { organizationId: org, userId, kind: 'snooze', doneAt: null, remindAt: { gt: now } }, select: { ticketId: true } })).map((r) => r.ticketId!);
  }

  /** Job every minute: due reminders and ended snoozes send their notice once. */
  async fireReminders(now = new Date()): Promise<number> {
    const due = await deskSystem(this.tenantPrisma, { organizationId: null, isSuperAdmin: true }, (tx) =>
      tx.$queryRaw<{ id: string; organization_id: string }[]>`
        UPDATE sd_reminders SET notified_at = ${now} WHERE id IN (
          SELECT id FROM sd_reminders WHERE notified_at IS NULL AND done_at IS NULL AND remind_at <= ${now} ORDER BY remind_at LIMIT 500 FOR UPDATE SKIP LOCKED)
        RETURNING id, organization_id`,
    );
    for (const d of due) {
      try {
        const r = await deskSystem(this.tenantPrisma, { organizationId: d.organization_id, isSuperAdmin: false }, async (tx) => {
          const x = await tx.sdReminder.findFirstOrThrow({ where: { id: d.id } });
          const t = x.ticketId ? await tx.sdTicket.findFirst({ where: { organizationId: x.organizationId, id: x.ticketId }, select: { id: true, number: true, subject: true, sensitive: true, private: true } }) : null;
          if (x.kind === 'snooze') await tx.sdReminder.update({ where: { id: x.id }, data: { doneAt: now } });
          return { x, t };
        });
        const neutral = !r.t || r.t.sensitive || r.t.private;
        const text = r.x.kind === 'snooze' ? `${r.t?.number ?? 'A ticket'} is back in your queue` : `Reminder${r.t ? ` · ${r.t.number}` : ''}${neutral ? '' : `: ${r.t!.subject}`}${r.x.note && !neutral ? ` (${r.x.note})` : ''}`;
        await this.notifications.notifySystem({ organizationId: d.organization_id, isSuperAdmin: false }, [r.x.userId], 'helpdesk.reminder.due', { entityType: r.t ? 'sd_ticket' : 'sd_reminder', entityId: r.t?.id ?? r.x.id, contextText: text, linkPath: r.t ? `/yx/desk/tickets/${r.t.id}` : '/yx/desk/calendar' }, { subject: text, html: '<p>You asked YukthiX to remind you. Open the Service Desk to see it.</p>' });
      } catch (e) {
        this.logger.warn(`Reminder ${d.id} not sent: ${(e as Error).message}`);
      }
    }
    return due.length;
  }

  // ------------------------------------------------------------------------------------------ the personal calendar

  /** My reminders, my tasks with due dates and the resolution due times of tickets I own, between two dates. */
  async calendarItems(tx: Tx, org: string, userId: string, from: Date, to: Date) {
    const [reminders, tasks, owned] = await Promise.all([
      tx.sdReminder.findMany({ where: { organizationId: org, userId, doneAt: null, remindAt: { gte: from, lt: to } } }),
      tx.sdTask.findMany({ where: { organizationId: org, assigneeUserId: userId, state: { in: ['open', 'in_progress'] }, dueAt: { gte: from, lt: to } } }),
      tx.sdTicket.findMany({ where: { organizationId: org, assigneeUserId: userId, systemState: { in: OPEN_STATES } }, select: { id: true } }),
    ]);
    const due = owned.length ? await tx.sdSlaTimer.findMany({ where: { organizationId: org, ticketId: { in: owned.map((t) => t.id) }, metric: 'resolution', state: 'running', dueAt: { gte: from, lt: to } } }) : [];
    const labels = await this.ticketLabels(tx, org, [...reminders.map((r) => r.ticketId), ...tasks.map((k) => k.ticketId), ...due.map((x) => x.ticketId)]);
    const name = (id: string | null) => {
      const t = id ? labels.get(id) : null;
      return t ? `${t.number}${t.subject ? ` · ${t.subject}` : ''}` : null;
    };
    // Sensitive and private tickets show their number only (YX-SD-14); the feed leaves the app.
    return [
      ...reminders.map((r) => ({ id: `r-${r.id}`, kind: r.kind === 'snooze' ? 'snooze' : 'reminder', at: r.remindAt, title: r.kind === 'snooze' ? `Back from snooze: ${name(r.ticketId) ?? 'ticket'}` : `Reminder${name(r.ticketId) ? `: ${name(r.ticketId)}` : ''}${r.note && (!r.ticketId || labels.get(r.ticketId)?.subject) ? ` (${r.note})` : ''}`, ticketId: r.ticketId })),
      ...tasks.map((k) => ({ id: `t-${k.id}`, kind: 'task', at: k.dueAt!, title: `Task due: ${k.ticketId && !labels.get(k.ticketId)?.subject ? 'on a private ticket' : k.title}${name(k.ticketId) ? ` (${labels.get(k.ticketId!)!.number})` : ''}`, ticketId: k.ticketId })),
      ...due.map((x) => ({ id: `s-${x.id}`, kind: 'sla', at: x.dueAt!, title: `Resolve by: ${name(x.ticketId) ?? 'ticket'}`, ticketId: x.ticketId })),
      // Time off joins from M02 leave; changes from 3b-3 (US-G-009).
    ].sort((p, q) => p.at.getTime() - q.at.getTime());
  }

  async calendar(a: DeskActor, from: string, to: string) {
    this.desking(a);
    const f = new Date(from);
    const t = new Date(to);
    if (!(t > f) || t.getTime() - f.getTime() > 400 * 86_400_000) throw new BadRequestException('Choose a range of up to 400 days.');
    return this.tx(a, async (tx) => {
      const feed = await tx.sdCalendarFeed.findUnique({ where: { organizationId_userId: { organizationId: a.ctx.organizationId, userId: a.userId } } });
      return { items: await this.calendarItems(tx, a.ctx.organizationId, a.userId, f, t), feed: feed ? { createdAt: feed.createdAt } : null };
    });
  }

  private hash(org: string, token: string) {
    return this.crypto.hmac(`sd-ical:${org}`, token);
  }

  /** A new secret feed link (shown once); any older link stops working at once. */
  async newFeed(a: DeskActor) {
    this.desking(a);
    const token = randomBytes(32).toString('base64url');
    return this.tx(a, async (tx) => {
      const key = { organizationId_userId: { organizationId: a.ctx.organizationId, userId: a.userId } };
      await tx.sdCalendarFeed.upsert({ where: key, update: { tokenHash: this.hash(a.ctx.organizationId, token), createdAt: new Date() }, create: { organizationId: a.ctx.organizationId, userId: a.userId, tokenHash: this.hash(a.ctx.organizationId, token) } });
      await audit(tx, a, 'desk.calendar_feed.created', 'user', a.userId, {});
      return { path: `/desk/calendar-feed/${a.ctx.organizationId}/${a.userId}/${token}.ics` };
    });
  }

  async revokeFeed(a: DeskActor) {
    return this.tx(a, async (tx) => {
      const res = await tx.sdCalendarFeed.deleteMany({ where: { organizationId: a.ctx.organizationId, userId: a.userId } });
      await audit(tx, a, 'desk.calendar_feed.revoked', 'user', a.userId, { existed: res.count > 0 });
      return { revoked: true };
    });
  }

  /**
   * The public .ics (no session: calendar apps cannot sign in). The link's secret is the key; it is compared with its
   * keyed hash in constant time, and the feed reads as that person (their own RLS), so it never shows more than they
   * see. A revoked link, an inactive login or a person with no desk seat gets the same 404.
   */
  async feed(org: string, userId: string, token: string): Promise<string> {
    const nope = () => new NotFoundException('No such calendar.');
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw nope();
    const ctx = { organizationId: org, isSuperAdmin: false, userId };
    const items = await this.tenantPrisma.forTenant(ctx, async (tx) => {
      const f = await tx.sdCalendarFeed.findUnique({ where: { organizationId_userId: { organizationId: org, userId } } });
      const want = Buffer.from(this.hash(org, token));
      if (!f || f.tokenHash.length !== want.length || !timingSafeEqual(Buffer.from(f.tokenHash), want)) throw nope();
      const user = await tx.user.findFirst({ where: { organizationId: org, id: userId, status: 'active' }, select: { role: true, permissionProfileId: true } });
      if (!user) throw nope();
      const keys = await resolvePermissionGrants(this.prisma, this.tenantPrisma, { role: user.role, organizationId: org, permissionProfileId: user.permissionProfileId, userId }, ['desk.ticket.view']);
      const seat = await tx.sdDeskMember.findFirst({ where: { organizationId: org, userId, ...activeOn(todayIst()) }, select: { id: true } });
      if (!keys.has('desk.ticket.view') || !seat) throw nope();
      const now = Date.now();
      return this.calendarItems(tx, org, userId, new Date(now - FEED_DAYS_BACK * 86_400_000), new Date(now + FEED_DAYS_AHEAD * 86_400_000));
    }).catch((e) => {
      if (e instanceof NotFoundException) throw e;
      if (/invalid input syntax for type uuid/i.test(String((e as Error).message))) throw nope();
      throw e;
    });
    const cal = ical({ name: 'YukthiX Service Desk', prodId: { company: 'YukthiX', product: 'Service Desk', language: 'EN' }, ttl: 15 * 60 });
    const base = process.env.WEB_ORIGIN ?? process.env.FRONTEND_URL ?? '';
    for (const it of items) {
      const ev: ICalEventData = { id: `${it.id}@yukthix-desk`, start: it.at, end: new Date(it.at.getTime() + 15 * 60_000), summary: it.title, ...(it.ticketId && base ? { url: `${base}/yx/desk/tickets/${it.ticketId}` } : {}) };
      cal.createEvent(ev);
    }
    return cal.toString();
  }

  // ------------------------------------------------------------------------------------------ the agent meter (SD-1.13)

  /**
   * §6.3 L1–L6, D2: the paid agents of one company on one day: people holding an agent or lead seat on a desk of the
   * service_desk class. An HR desk inside YukthiX HR is free (L3); someone on HR and IT counts once (L2); collaborators,
   * requesters and set-up-only admins are free (L5); a same-day add-and-remove never counts (its range is empty).
   */
  static async paidAgentsOn(tx: Tx, org: string, onDay: string): Promise<string[]> {
    const rows = await tx.$queryRaw<{ user_id: string }[]>`
      SELECT DISTINCT m.user_id FROM sd_desk_members m JOIN sd_desks d ON d.organization_id = m.organization_id AND d.id = m.desk_id
      WHERE m.organization_id = ${org}::uuid AND m.role IN ('agent', 'lead') AND d.billing_class = 'service_desk'
        AND m.valid_from <= ${onDay}::date AND (m.valid_to IS NULL OR m.valid_to >= ${onDay}::date)
      ORDER BY m.user_id`;
    return rows.map((r) => r.user_id);
  }

  /** Daily job: yesterday's (and today's so far) meter row per company. Idempotent per company and day. */
  async meter(onDay = addDays(todayIst(), -1)): Promise<number> {
    // L6: the platform tenant (YukthiX's own support, SD-1.31) is never billed.
    const orgs = await deskSystem(this.tenantPrisma, { organizationId: null, isSuperAdmin: true }, (tx) => tx.$queryRaw<{ organization_id: string }[]>`
      SELECT DISTINCT m.organization_id FROM sd_desk_members m JOIN organizations o ON o.id = m.organization_id WHERE NOT o.is_platform`);
    let written = 0;
    for (const { organization_id: org } of orgs) {
      written += await deskSystem(this.tenantPrisma, { organizationId: org, isSuperAdmin: false }, async (tx) => {
        const ids = await MeService.paidAgentsOn(tx, org, onDay);
        const res = await tx.$executeRaw`
          INSERT INTO meter_events (organization_id, meter, on_day, quantity, subject_ids)
          VALUES (${org}::uuid, 'sd_agents', ${onDay}::date, ${ids.length}, ${ids}::uuid[]) ON CONFLICT DO NOTHING`;
        return res;
      });
    }
    return written;
  }

  /** YX-BILL-02: the month's paid agents (distinct people across its days, D2) and, apart, the free collaborators. */
  async billingAgents(a: DeskActor, month: string) {
    if (!has(a, 'desk.desk.create')) throw new ForbiddenException('Only a Service Desk admin sees the agent bill.');
    const from = `${month}-01`;
    const end = new Date(`${from}T00:00:00Z`);
    end.setUTCMonth(end.getUTCMonth() + 1);
    const to = end.toISOString().slice(0, 10);
    const org = a.ctx.organizationId;
    return this.tx(a, async (tx) => {
      const rows = await tx.meterEvent.findMany({ where: { organizationId: org, meter: 'sd_agents', onDay: { gte: day(from), lt: day(to) } }, orderBy: { onDay: 'asc' } });
      const days = new Map<string, number>();
      for (const r of rows) for (const u of r.subjectIds) days.set(u, (days.get(u) ?? 0) + 1);
      // Today is not metered yet: show who counts today too, so the month so far is complete.
      const today = todayIst();
      if (today >= from && today < to) for (const u of await MeService.paidAgentsOn(tx, org, today)) if (!rows.some((r) => r.onDay.toISOString().slice(0, 10) === today && r.subjectIds.includes(u))) days.set(u, (days.get(u) ?? 0) + 1);
      const collaborators = await tx.$queryRaw<{ user_id: string }[]>`
        SELECT DISTINCT user_id FROM sd_desk_members WHERE organization_id = ${org}::uuid AND role = 'collaborator'
          AND valid_from < ${to}::date AND (valid_to IS NULL OR valid_to >= ${from}::date)`;
      const users = new Map((await tx.user.findMany({ where: { organizationId: org, id: { in: [...days.keys(), ...collaborators.map((c) => c.user_id)] } }, select: { id: true, name: true, email: true } })).map((u) => [u.id, u]));
      const who = (id: string) => ({ userId: id, name: users.get(id)?.name || users.get(id)?.email || 'Someone', email: users.get(id)?.email ?? null });
      return {
        month,
        paidAgents: days.size,
        agents: [...days].map(([id, n]) => ({ ...who(id), days: n })).sort((x, y) => x.name.localeCompare(y.name)),
        // US-G-033: collaborators are listed apart; they are free (Q10).
        collaborators: collaborators.map((c) => who(c.user_id)).sort((x, y) => x.name.localeCompare(y.name)),
      };
    });
  }

  // ------------------------------------------------------------------------------------------ possible duplicates (founder decision 8 Oct 2026)

  /**
   * People made by the Service Desk for a login with no person of its own whose email matches another active person or an
   * employee's work email. Never linked by email on their own (YX-ORG-27): HR sees the list and links on purpose.
   */
  async duplicates(a: DeskActor) {
    if (!(await this.hrKey(a))) throw new ForbiddenException('Only HR links people.');
    return this.tx(a, async (tx) => {
      const rows = await tx.$queryRaw<{ person_id: string; given_name: string; family_name: string | null; email: string; user_id: string; match_id: string; match_given: string; match_family: string | null; employee_code: string | null; tickets: bigint }[]>`
        SELECT p.id AS person_id, p.given_name, p.family_name, u.email::text AS email, u.id AS user_id,
               m.id AS match_id, m.given_name AS match_given, m.family_name AS match_family,
               (SELECT em.employee_code::text FROM employments em WHERE em.organization_id = e.organization_id AND em.employee_id = e.id ORDER BY em.joined_on DESC LIMIT 1) AS employee_code,
               (SELECT count(*) FROM sd_tickets t WHERE t.organization_id = p.organization_id AND t.requester_person_id = p.id) AS tickets
        FROM persons p
        JOIN person_roles r ON r.organization_id = p.organization_id AND r.person_id = p.id AND r.role_type = 'login' AND r.source_table = 'users' AND r.end_on IS NULL
        JOIN users u ON u.organization_id = r.organization_id AND u.id = r.source_id
        LEFT JOIN employees e ON e.organization_id = p.organization_id AND lower(e.work_email::text) = lower(u.email::text) AND e.person_id <> p.id
        JOIN persons m ON m.organization_id = p.organization_id AND m.status = 'active' AND m.id <> p.id
          AND (m.id = e.person_id OR lower(m.primary_email::text) = lower(u.email::text))
        WHERE p.organization_id = ${a.ctx.organizationId}::uuid AND p.status = 'active' AND p.primary_email IS NULL
          AND NOT EXISTS (SELECT 1 FROM employees x WHERE x.organization_id = p.organization_id AND x.person_id = p.id)
        ORDER BY p.created_at DESC LIMIT 200`;
      return rows.map((r) => ({
        personId: r.person_id,
        name: [r.given_name, r.family_name].filter(Boolean).join(' '),
        loginEmail: r.email,
        tickets: Number(r.tickets),
        possibleMatch: { personId: r.match_id, name: [r.match_given, r.match_family].filter(Boolean).join(' '), employeeCode: r.employee_code },
      }));
    }).catch((e) => {
      // employments may not carry the code column in every build; fall back without it.
      throw e;
    });
  }

  /**
   * Linking people is a company-wide HR act: the list spans every desk-made person and a link can land on any employee,
   * so employee.change.manage must be held for the whole company, not for one entity, location or team (review fix).
   */
  private async hrKey(a: DeskActor) {
    const user = await this.tenantPrisma.forTenant(a.ctx, (tx) => tx.user.findFirst({ where: { organizationId: a.ctx.organizationId, id: a.userId }, select: { role: true, permissionProfileId: true } }));
    if (!user) return false;
    const viewer = await buildViewer(this.prisma, this.tenantPrisma, { role: user.role, organizationId: a.ctx.organizationId, permissionProfileId: user.permissionProfileId, userId: a.userId }, ['employee.change.manage']);
    return tenantWide(viewer, 'employee.change.manage');
  }

  /**
   * HR links the desk-made person to the right one: the login moves to that person (and to their employee record when it
   * has none and the work email matches), the desk-made person is marked merged into it, and their tickets follow
   * (requesters see records of persons merged into them). Logged in person_link_log and the audit log.
   */
  async linkDuplicate(a: DeskActor, personId: string, intoPersonId: string) {
    if (!(await this.hrKey(a))) throw new ForbiddenException('Only HR links people.');
    if (personId === intoPersonId) throw new BadRequestException('Choose another person.');
    return this.tx(a, async (tx) => {
      const org = a.ctx.organizationId;
      const p = await tx.person.findFirst({ where: { organizationId: org, id: personId, status: 'active' } });
      const into = await tx.person.findFirst({ where: { organizationId: org, id: intoPersonId, status: 'active' } });
      if (!p || !into) throw new NotFoundException('No such person.');
      const role = await tx.personRole.findFirst({ where: { organizationId: org, personId: p.id, roleType: 'login', sourceTable: 'users', endOn: null } });
      if (!role || p.primaryEmail || (await tx.employee.findFirst({ where: { organizationId: org, personId: p.id }, select: { id: true } }))) throw new BadRequestException('Only a person the Service Desk made for a login is linked here.');
      const user = await tx.user.findFirstOrThrow({ where: { organizationId: org, id: role.sourceId }, select: { id: true, email: true } });
      if (user.id === a.userId) throw new ForbiddenException('Someone else links your own login.');
      const emp = await tx.employee.findFirst({ where: { organizationId: org, personId: into.id } });
      // The same evidence the list showed: the login's email is the other person's email or work email.
      const same = (x: string | null | undefined) => Boolean(x && x.toLowerCase() === user.email.toLowerCase());
      if (!same(into.primaryEmail) && !same(emp?.workEmail)) throw new ConflictException('That person does not have this login\'s email. Link only a person with the same email.');
      if (emp && !emp.userId && same(emp.workEmail)) {
        await checkLoginLink(tx, { ...a.ctx, userId: a.userId }, user.id, emp.workEmail);
        await tx.employee.update({ where: { id: emp.id }, data: { userId: user.id } });
      }
      // A login has one login role (person_roles_source_key): the role itself moves to the right person.
      await tx.personRole.update({ where: { id: role.id }, data: { personId: into.id } });
      await tx.person.update({ where: { id: p.id }, data: { status: 'merged', mergedInto: into.id } });
      await tx.personLinkLog.create({ data: { organizationId: org, action: 'merge', personId: p.id, otherPersonId: into.id, roleId: role.id, basis: 'hr_confirmed', decidedBy: a.userId, reason: 'Service Desk possible duplicate' } });
      await audit(tx, a, 'person.duplicate_linked', 'person', p.id, { into: into.id, userId: user.id, employeeLinked: Boolean(emp && !emp.userId && same(emp.workEmail)) });
      return { linked: true };
    });
  }
}
