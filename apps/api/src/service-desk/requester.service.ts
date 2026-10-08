import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request } from 'express';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { buildViewer, covers, grantPeriods } from '../access/scope';
import { CompanyContext, Tx } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { cleanHtml, htmlToText, textToHtml } from './rich-text';
import { DeskActor, audit, companyOf, emit } from './desk-access';
import { RaiseTicketDto, RequesterReplyDto, WatcherDto } from './dto';
import { Ticket, TicketsService } from './tickets.service';

// The requester's side (M14 §6.1 implicit role, YX-SD-16): raise, follow, reply and add watchers. No permission key:
// every route works only on the person's own records (requester, requested-for or watcher) and never returns internal
// notes, internal attachments, internal timeline entries or the desk's set-up beyond what the raise form needs.

export interface Requester {
  ctx: CompanyContext;
  userId: string;
  acting: boolean;
  user: { role: string; permissionProfileId?: string | null; organizationId?: string | null; userId?: string };
}

@Injectable()
export class RequesterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly tickets: TicketsService,
  ) {}

  who(req: Request, tenant: TenantContext): Requester {
    const user = req.user as { userId?: string; role: string; permissionProfileId?: string | null; impersonatorUserId?: string; actingSuperAdmin?: boolean };
    if (!user?.userId) throw new ForbiddenException('Not authenticated');
    // Someone acting for another person (impersonation, a YukthiX support session) never sees that person's own tickets.
    if (user.impersonatorUserId || user.actingSuperAdmin) throw new ForbiddenException('Not available while acting for someone else');
    return { ctx: companyOf(tenant), userId: user.userId, acting: Boolean(user.impersonatorUserId || user.actingSuperAdmin), user: { ...user, organizationId: tenant.organizationId } };
  }

  private tx<T>(r: Requester, fn: (tx: Tx) => Promise<T>) {
    return this.tenantPrisma.forTenant(r.ctx, fn);
  }

  /**
   * The person behind this login (P01 §4.5a login role). A login with no person gets one on its first ticket. An unlinked
   * person with the same email is never linked silently (YX-ORG-27), so the new person then has no email. Founder
   * decision 8 Oct 2026: HR sees such people in a "possible duplicate, link?" list and links them on purpose
   * (MeService.duplicates / linkDuplicate).
   */
  async personOf(tx: Tx, r: Requester, create: boolean): Promise<string | null> {
    const org = r.ctx.organizationId;
    const role = await tx.personRole.findFirst({ where: { organizationId: org, roleType: 'login', sourceTable: 'users', sourceId: r.userId, endOn: null }, select: { personId: true } });
    if (role || !create) return role?.personId ?? null;
    const user = await tx.user.findFirstOrThrow({ where: { organizationId: org, id: r.userId }, select: { name: true, email: true, createdAt: true } });
    const taken = await tx.person.findFirst({ where: { organizationId: org, status: 'active', primaryEmail: user.email }, select: { id: true } });
    const [given, ...rest] = (user.name?.trim() || user.email.split('@')[0]).split(/\s+/);
    const person = await tx.person.create({ data: { organizationId: org, givenName: given.slice(0, 100), familyName: rest.join(' ').slice(0, 100) || null, primaryEmail: taken ? null : user.email, createdBy: r.userId } });
    await tx.personRole.create({ data: { organizationId: org, personId: person.id, roleType: 'login', sourceTable: 'users', sourceId: r.userId, startOn: new Date(`${todayIst()}T00:00:00Z`) } });
    return person.id;
  }

  /** Records the person may follow: raised by them, for them, or watched by them. */
  private mine(org: string, ids: string[]): Prisma.SdTicketWhereInput {
    return { organizationId: org, OR: [{ requesterPersonId: { in: ids } }, { requestedForPersonId: { in: ids } }] };
  }

  private async visibleIds(tx: Tx, org: string, ids: string[]) {
    return (await tx.sdTicketWatcher.findMany({ where: { organizationId: org, personId: { in: ids } }, select: { ticketId: true } })).map((w) => w.ticketId);
  }

  /** The person and any persons HR merged into them (their earlier tickets stay theirs). */
  private async idsOf(tx: Tx, org: string, personId: string): Promise<string[]> {
    return [personId, ...(await tx.person.findMany({ where: { organizationId: org, mergedInto: personId }, select: { id: true } })).map((p) => p.id)];
  }

  /** May this person follow ticket t (raised by them, for them, or watched by them)? */
  private async follows(tx: Tx, org: string, ids: string[], t: { id: string; requesterPersonId: string; requestedForPersonId: string | null }) {
    if (ids.includes(t.requesterPersonId) || (t.requestedForPersonId && ids.includes(t.requestedForPersonId))) return true;
    return Boolean(await tx.sdTicketWatcher.findFirst({ where: { organizationId: org, ticketId: t.id, personId: { in: ids } }, select: { id: true } }));
  }

  // DECISION NEEDED: §5.7 lets only the requester and requested-for person see a sensitive or private ticket, so a
  // follower (watcher) loses it once it turns private or sensitive. Confirm, or add watchers to the SQL policy.
  async ownTicket(tx: Tx, r: Requester, id: string): Promise<{ t: Ticket; personId: string; ids: string[] }> {
    const org = r.ctx.organizationId;
    const personId = await this.personOf(tx, r, false);
    const t = personId ? await tx.sdTicket.findFirst({ where: { id, organizationId: org } }) : null;
    const ids = personId ? await this.idsOf(tx, org, personId) : [];
    if (!t || !personId || !(await this.follows(tx, org, ids, t))) throw new NotFoundException('No such ticket.');
    return { t, personId, ids };
  }

  /** Employee help desks the person can raise to, with the parts of their set-up the raise form shows. */
  async desks(r: Requester) {
    const org = r.ctx.organizationId;
    return this.tx(r, async (tx) => {
      const desks = await tx.sdDesk.findMany({ where: { organizationId: org, status: 'active', kind: { not: 'customer_support' } }, orderBy: { name: 'asc' } });
      const ids = desks.map((d) => d.id);
      const types = await tx.sdTicketType.findMany({ where: { organizationId: org, deskId: { in: ids }, active: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
      const cats = await tx.sdCategory.findMany({ where: { organizationId: org, deskId: { in: ids }, active: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
      return desks.map((d) => ({
        id: d.id,
        name: d.name,
        key: d.key,
        attachmentTypes: d.attachmentTypes,
        attachmentMaxMb: d.attachmentMaxMb,
        types: types.filter((t) => t.deskId === d.id).map((t) => ({ id: t.id, name: t.name })),
        categories: cats.filter((c) => c.deskId === d.id).map((c) => ({ id: c.id, name: c.name, parentId: c.parentId, sensitive: c.sensitive })),
      }));
    });
  }

  async raise(r: Requester, dto: RaiseTicketDto) {
    if (r.acting) throw new ForbiddenException('Not available while acting for someone else');
    const t = await this.tx(r, async (tx) => {
      const desk = await tx.sdDesk.findFirst({ where: { organizationId: r.ctx.organizationId, id: dto.deskId, status: 'active' }, select: { kind: true } });
      if (!desk || desk.kind === 'customer_support') throw new NotFoundException('No such desk.');
      const personId = (await this.personOf(tx, r, true))!;
      if (dto.requestedForPersonId) await this.checkOnBehalf(tx, r, dto.requestedForPersonId, personId);
      return this.tickets.createIn(tx, r, {
        deskId: dto.deskId,
        typeId: dto.typeId,
        categoryId: dto.categoryId,
        subject: dto.subject,
        bodyHtml: textToHtml(dto.description),
        impact: dto.impact,
        urgency: dto.urgency,
        requesterPersonId: personId,
        requestedForPersonId: dto.requestedForPersonId,
        openedByUserId: r.userId,
        channel: 'portal',
        private: dto.private,
        side: 'requester',
        authorPersonId: personId,
        // US-B-100: the screen the in-app help drawer was opened on.
        custom: dto.screen ? { screen: dto.screen } : undefined,
      });
    });
    return { id: t.id, number: t.number };
  }

  /** US-G-004 / P02: raising for someone else needs request.raise_on_behalf over that employee today. */
  private async checkOnBehalf(tx: Tx, r: Requester, forPersonId: string, me: string) {
    if (forPersonId === me) throw new BadRequestException('Leave "for someone else" empty when it is for you.');
    const viewer = await buildViewer(this.prisma, this.tenantPrisma, { ...r.user, userId: r.userId, organizationId: r.ctx.organizationId }, ['request.raise_on_behalf']);
    const target = await tx.employee.findFirst({ where: { organizationId: r.ctx.organizationId, personId: forPersonId }, select: { id: true } });
    const own = await tx.employee.findFirst({ where: { organizationId: r.ctx.organizationId, userId: r.userId }, select: { id: true } });
    const ok = target && covers(await grantPeriods(tx, r.ctx, viewer, 'request.raise_on_behalf', target.id, own?.id ?? null), todayIst());
    if (!ok) throw new ForbiddenException('You can raise tickets only for people in your team.');
  }

  async list(r: Requester) {
    const org = r.ctx.organizationId;
    return this.tx(r, async (tx) => {
      const personId = await this.personOf(tx, r, false);
      if (!personId) return [];
      const ids = await this.idsOf(tx, org, personId);
      const watched = await this.visibleIds(tx, org, ids);
      const rows = await tx.sdTicket.findMany({ where: { organizationId: org, OR: [...(this.mine(org, ids).OR ?? []), { id: { in: watched } }] }, orderBy: { updatedAt: 'desc' }, take: 200 });
      const statuses = new Map((await tx.sdStatus.findMany({ where: { organizationId: org, id: { in: rows.map((t) => t.statusId) } }, select: { id: true, label: true } })).map((s) => [s.id, s.label]));
      const desks = new Map((await tx.sdDesk.findMany({ where: { organizationId: org, id: { in: rows.map((t) => t.deskId) } }, select: { id: true, name: true } })).map((d) => [d.id, d.name]));
      return rows.map((t) => ({
        id: t.id,
        number: t.number,
        subject: t.subject,
        desk: desks.get(t.deskId) ?? '',
        status: statuses.get(t.statusId) ?? '',
        systemState: t.systemState,
        private: t.private || t.sensitive,
        role: ids.includes(t.requesterPersonId) ? 'requester' : t.requestedForPersonId && ids.includes(t.requestedForPersonId) ? 'requested_for' : 'watcher',
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      }));
    });
  }

  /** The requester's view: replies only (never notes), files sent to them or by them, and status changes. */
  async get(r: Requester, id: string) {
    const org = r.ctx.organizationId;
    return this.tx(r, async (tx) => {
      const { t, ids } = await this.ownTicket(tx, r, id);
      // YX-SD-08: tickets merged into this one show here, but only those this person followed themselves.
      const merged = [];
      for (const m of await tx.sdTicket.findMany({ where: { organizationId: org, mergedIntoId: t.id } })) if (await this.follows(tx, org, ids, m)) merged.push(m.id);
      const tickets = [t.id, ...merged];
      const messages = await tx.sdTicketMessage.findMany({ where: { organizationId: org, ticketId: { in: tickets }, kind: { in: ['reply', 'system'] } }, orderBy: { createdAt: 'asc' } });
      const replyIds = messages.map((m) => m.id);
      const files = await tx.sdAttachment.findMany({ where: { organizationId: org, ticketId: { in: tickets }, OR: [{ side: 'requester' }, { messageId: { in: replyIds } }] }, orderBy: { createdAt: 'asc' } });
      const due = await this.tickets.sla.requesterDue(tx, org, t.id);
      const desk0 = await tx.sdDesk.findFirstOrThrow({ where: { organizationId: org, id: t.deskId }, select: { reopenWindowDays: true, requesterCanReopen: true } });
      const reopenUntil = t.systemState === 'solved' && t.resolvedAt && desk0.requesterCanReopen ? new Date(t.resolvedAt.getTime() + desk0.reopenWindowDays * 86_400_000) : null;
      const events = await tx.sdTicketEvent.findMany({ where: { organizationId: org, ticketId: t.id, requesterVisible: true, kind: 'status_changed' }, orderBy: { at: 'asc' } });
      const [status, desk] = await Promise.all([tx.sdStatus.findFirst({ where: { organizationId: org, id: t.statusId } }), tx.sdDesk.findFirstOrThrow({ where: { organizationId: org, id: t.deskId } })]);
      const labels = new Map((await tx.sdStatus.findMany({ where: { organizationId: org, deskId: t.deskId } })).map((s) => [s.id, s.label]));
      const people = await this.tickets.personNames(tx, org, [t.requesterPersonId, t.requestedForPersonId, ...messages.map((m) => m.authorPersonId)]);
      const users = await this.tickets.userNames(tx, org, [t.assigneeUserId, ...messages.map((m) => m.authorUserId)]);
      return {
        id: t.id,
        number: t.number,
        subject: t.subject,
        desk: { name: desk.name, attachmentTypes: desk.attachmentTypes, attachmentMaxMb: desk.attachmentMaxMb },
        status: status?.label ?? '',
        systemState: t.systemState,
        private: t.private || t.sensitive,
        createdAt: t.createdAt,
        requester: people.get(t.requesterPersonId)?.name ?? null,
        requestedFor: t.requestedForPersonId ? (people.get(t.requestedForPersonId)?.name ?? null) : null,
        assignee: t.assigneeUserId ? (users.get(t.assigneeUserId) ?? null) : null,
        // A reply always goes through: within the reopen window it reopens this ticket, after it a follow-up starts.
        canReply: !t.mergedIntoId,
        replyStartsFollowUp: t.systemState === 'closed' || (t.systemState === 'solved' && (!reopenUntil || reopenUntil < new Date())),
        reopenUntil,
        mergedInto: t.mergedIntoId ? ((await tx.sdTicket.findFirst({ where: { organizationId: org, id: t.mergedIntoId }, select: { number: true } }))?.number ?? null) : null,
        // US-G-016: only when it should be resolved, never internal reasons.
        resolveBy: due?.resolveBy ?? null,
        targetPaused: due?.paused ?? false,
        messages: messages.map((m) => ({
          id: m.id,
          side: m.side,
          author: m.authorUserId ? (users.get(m.authorUserId) ?? 'Support') : m.authorPersonId ? (people.get(m.authorPersonId)?.name ?? 'You') : 'YukthiX',
          mine: Boolean(m.authorPersonId && ids.includes(m.authorPersonId)),
          bodyHtml: m.bodyHtml,
          createdAt: m.createdAt,
        })),
        attachments: files.map((x) => this.tickets.attachmentView(x)),
        history: events.map((e) => ({ at: e.at, from: e.fromValue ? (labels.get(e.fromValue) ?? null) : null, to: e.toValue ? (labels.get(e.toValue) ?? null) : null })),
      };
    });
  }

  /**
   * A requester reply moves a waiting ticket back to work. A resolved ticket reopens within the desk's reopen window
   * (YX-SD-10, starter 7 days) when the desk lets requesters reopen; after the window, or on a closed ticket, the reply
   * starts a follow-up ticket linked to the old one (US-G-008).
   */
  async reply(r: Requester, id: string, dto: RequesterReplyDto) {
    if (r.acting) throw new ForbiddenException('Not available while acting for someone else');
    return this.tx(r, async (tx) => {
      const { t, personId } = await this.ownTicket(tx, r, id);
      return this.replyIn(tx, r, t, personId, textToHtml(dto.text), { channel: 'portal', attachmentIds: dto.attachmentIds });
    });
  }

  /**
   * The requester's reply, by any channel (in-app, outside portal, email). A waiting ticket goes back to work; a
   * resolved one reopens within the desk's reopen window (YX-SD-10) when the desk lets requesters reopen; after the
   * window, or on a closed ticket, the reply starts a follow-up ticket linked to the old one (US-G-008).
   */
  async replyIn(
    tx: Tx,
    who: { ctx: CompanyContext; userId: string | null },
    t: Ticket,
    personId: string,
    html: string,
    o: { channel: 'portal' | 'email'; attachmentIds?: string[]; emailMessageId?: string | null; inboundEmailId?: string | null; senderVerified?: boolean },
  ): Promise<{ id: string | null; reopened: boolean; followUp: { id: string; number: string } | null }> {
    const org = who.ctx.organizationId;
    if (t.mergedIntoId) throw new ConflictException('This ticket was joined with another one. Reply there.');
    const { bodyHtml, bodyText, found } = this.tickets.cleanMasked(html);
    if (!bodyText) throw new BadRequestException('Write a message first.');
    const by = { ctx: who.ctx, userId: who.userId as string };
    const desk = await tx.sdDesk.findFirstOrThrow({ where: { organizationId: org, id: t.deskId } });
    const windowOpen = t.systemState === 'solved' && desk.requesterCanReopen && t.resolvedAt && t.resolvedAt.getTime() + desk.reopenWindowDays * 86_400_000 >= Date.now();
    if (t.systemState === 'closed' || (t.systemState === 'solved' && !windowOpen)) {
      if (o.attachmentIds?.length) throw new BadRequestException('Send files on the new ticket once it is made.');
      const n = await this.tickets.createIn(tx, who, { deskId: t.deskId, typeId: t.typeId, categoryId: t.categoryId ?? undefined, subject: `Follow-up: ${t.subject}`.slice(0, 200), bodyHtml, requesterPersonId: personId, openedByUserId: who.userId, channel: o.channel, private: t.private, side: 'requester', authorPersonId: personId, customerAccountId: t.customerAccountId, productId: t.productId, emailMessageId: o.emailMessageId, inboundEmailId: o.inboundEmailId, senderVerified: o.senderVerified });
      await tx.sdTicketLink.create({ data: { organizationId: org, fromTicketId: n.id, toTicketId: t.id, kind: 'follow_up', createdBy: who.userId } });
      await audit(tx, by, 'desk.ticket.follow_up_raised', 'sd_ticket', t.id, { followUpId: n.id, number: n.number, channel: o.channel });
      return { id: null, reopened: false, followUp: { id: n.id, number: n.number } };
    }
    const m = await tx.sdTicketMessage.create({ data: { organizationId: org, deskId: t.deskId, ticketId: t.id, kind: 'reply', side: 'requester', authorPersonId: personId, bodyHtml, bodyText, channel: o.channel, emailMessageId: o.emailMessageId ?? null, inboundEmailId: o.inboundEmailId ?? null, senderVerified: o.senderVerified ?? true } });
    await this.tickets.keepPii(tx, t, m.id, found);
    await this.tickets.attach(tx, by, t, m.id, o.attachmentIds ?? [], { personId });
    if (t.systemState === 'pending' || t.systemState === 'solved') {
      const open = await tx.sdStatus.findFirst({ where: { organizationId: org, deskId: t.deskId, systemState: 'open', active: true, OR: [{ ticketTypeId: t.typeId }, { ticketTypeId: null }] }, orderBy: [{ ticketTypeId: { sort: 'asc', nulls: 'last' } }, { sortOrder: 'asc' }] });
      if (open) await this.tickets.applyIn(tx, { ...by, keys: new Set(), roles: new Map() } as DeskActor, t, { statusId: open.id }, o.channel === 'email' ? 'The requester replied by email' : 'The requester replied');
    }
    // The next-response target starts (SD-1.14).
    await this.tickets.sla.sync(tx, t.id);
    await emit(tx, org, 'helpdesk.ticket.replied', { ticketId: t.id, deskId: t.deskId, messageId: m.id, side: 'requester', channel: o.channel });
    await audit(tx, by, 'desk.ticket.requester_replied', 'sd_ticket', t.id, { number: t.number, messageId: m.id, attachments: o.attachmentIds?.length ?? 0, channel: o.channel });
    return { id: m.id, reopened: t.systemState === 'solved', followUp: null };
  }

  /** US-G-004: a requester adds a colleague (by their email) to follow the ticket. */
  async addWatcher(r: Requester, id: string, dto: WatcherDto) {
    if (r.acting) throw new ForbiddenException('Not available while acting for someone else');
    if (!dto.email) throw new BadRequestException("Give your colleague's email.");
    const org = r.ctx.organizationId;
    return this.tx(r, async (tx) => {
      const { t, personId, ids } = await this.ownTicket(tx, r, id);
      // Only the requester and the person it is for choose who follows it; a follower cannot add more.
      if (!ids.includes(t.requesterPersonId) && !(t.requestedForPersonId && ids.includes(t.requestedForPersonId))) throw new ForbiddenException('Only the person who raised it, or the person it is for, adds followers.');
      const emp = await tx.employee.findFirst({ where: { organizationId: org, workEmail: dto.email }, select: { personId: true } });
      const person = emp?.personId ?? (await tx.person.findFirst({ where: { organizationId: org, status: 'active', primaryEmail: dto.email }, select: { id: true } }))?.id;
      // The same answer whether or not the email belongs to someone here, so it cannot be used to look people up.
      if (person) await this.tickets.addWatcherIn(tx, r, t, person, true, personId);
      return { added: true };
    });
  }
}
