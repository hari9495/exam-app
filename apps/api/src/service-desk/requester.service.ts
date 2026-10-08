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
    return { ctx: companyOf(tenant), userId: user.userId, acting: Boolean(user.impersonatorUserId || user.actingSuperAdmin), user: { ...user, organizationId: tenant.organizationId } };
  }

  private tx<T>(r: Requester, fn: (tx: Tx) => Promise<T>) {
    return this.tenantPrisma.forTenant(r.ctx, fn);
  }

  /**
   * The person behind this login (P01 §4.5a login role). A login with no person gets one on its first ticket. An unlinked
   * person with the same email is never linked silently (YX-ORG-27), so the new person then has no email.
   */
  // DECISION NEEDED: should HR be asked to link a login to an existing person with the same email, instead of a new person?
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
  private mine(org: string, personId: string): Prisma.SdTicketWhereInput {
    return { organizationId: org, OR: [{ requesterPersonId: personId }, { requestedForPersonId: personId }] };
  }

  private async visibleIds(tx: Tx, org: string, personId: string) {
    return (await tx.sdTicketWatcher.findMany({ where: { organizationId: org, personId }, select: { ticketId: true } })).map((w) => w.ticketId);
  }

  async ownTicket(tx: Tx, r: Requester, id: string): Promise<{ t: Ticket; personId: string }> {
    const personId = await this.personOf(tx, r, false);
    const t = personId ? await tx.sdTicket.findFirst({ where: { id, organizationId: r.ctx.organizationId } }) : null;
    const watching = t && personId ? Boolean(await tx.sdTicketWatcher.findFirst({ where: { organizationId: r.ctx.organizationId, ticketId: t.id, personId }, select: { id: true } })) : false;
    if (!t || !personId || !(t.requesterPersonId === personId || t.requestedForPersonId === personId || watching)) throw new NotFoundException('No such ticket.');
    return { t, personId };
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
      const watched = await this.visibleIds(tx, org, personId);
      const rows = await tx.sdTicket.findMany({ where: { organizationId: org, OR: [...(this.mine(org, personId).OR ?? []), { id: { in: watched } }] }, orderBy: { updatedAt: 'desc' }, take: 200 });
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
        role: t.requesterPersonId === personId ? 'requester' : t.requestedForPersonId === personId ? 'requested_for' : 'watcher',
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      }));
    });
  }

  /** The requester's view: replies only (never notes), files sent to them or by them, and status changes. */
  async get(r: Requester, id: string) {
    const org = r.ctx.organizationId;
    return this.tx(r, async (tx) => {
      const { t, personId } = await this.ownTicket(tx, r, id);
      const messages = await tx.sdTicketMessage.findMany({ where: { organizationId: org, ticketId: t.id, kind: 'reply' }, orderBy: { createdAt: 'asc' } });
      const replyIds = messages.map((m) => m.id);
      const files = await tx.sdAttachment.findMany({ where: { organizationId: org, ticketId: t.id, OR: [{ side: 'requester' }, { messageId: { in: replyIds } }] }, orderBy: { createdAt: 'asc' } });
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
        canReply: t.systemState !== 'closed',
        messages: messages.map((m) => ({
          id: m.id,
          side: m.side,
          author: m.authorUserId ? (users.get(m.authorUserId) ?? 'Support') : m.authorPersonId ? (people.get(m.authorPersonId)?.name ?? 'You') : 'YukthiX',
          mine: m.authorPersonId === personId,
          bodyHtml: m.bodyHtml,
          createdAt: m.createdAt,
        })),
        attachments: files.map((x) => this.tickets.attachmentView(x)),
        history: events.map((e) => ({ at: e.at, from: e.fromValue ? (labels.get(e.fromValue) ?? null) : null, to: e.toValue ? (labels.get(e.toValue) ?? null) : null })),
      };
    });
  }

  /** A requester reply moves a waiting or resolved ticket back to work; a closed ticket takes no more replies. */
  async reply(r: Requester, id: string, dto: RequesterReplyDto) {
    if (r.acting) throw new ForbiddenException('Not available while acting for someone else');
    const org = r.ctx.organizationId;
    return this.tx(r, async (tx) => {
      const { t, personId } = await this.ownTicket(tx, r, id);
      if (t.systemState === 'closed') throw new ConflictException('This ticket is closed. Raise a new ticket.');
      const bodyHtml = cleanHtml(textToHtml(dto.text));
      const bodyText = htmlToText(bodyHtml);
      if (!bodyText) throw new BadRequestException('Write a message first.');
      const m = await tx.sdTicketMessage.create({ data: { organizationId: org, deskId: t.deskId, ticketId: t.id, kind: 'reply', side: 'requester', authorPersonId: personId, bodyHtml, bodyText, channel: 'portal' } });
      await this.tickets.attach(tx, r, t, m.id, dto.attachmentIds ?? [], { personId });
      if (t.systemState === 'pending' || t.systemState === 'solved') {
        const open = await tx.sdStatus.findFirst({ where: { organizationId: org, deskId: t.deskId, systemState: 'open', active: true, OR: [{ ticketTypeId: t.typeId }, { ticketTypeId: null }] }, orderBy: [{ ticketTypeId: { sort: 'asc', nulls: 'last' } }, { sortOrder: 'asc' }] });
        if (open) await this.tickets.applyIn(tx, { ctx: r.ctx, userId: r.userId, keys: new Set(), roles: new Map() } as DeskActor, t, { statusId: open.id }, 'The requester replied');
      }
      await emit(tx, org, 'helpdesk.ticket.replied', { ticketId: t.id, deskId: t.deskId, messageId: m.id, side: 'requester' });
      await audit(tx, r, 'desk.ticket.requester_replied', 'sd_ticket', t.id, { number: t.number, messageId: m.id, attachments: dto.attachmentIds?.length ?? 0 });
      return { id: m.id, reopened: t.systemState === 'solved' };
    });
  }

  /** US-G-004: a requester adds a colleague (by their email) to follow the ticket. */
  async addWatcher(r: Requester, id: string, dto: WatcherDto) {
    if (r.acting) throw new ForbiddenException('Not available while acting for someone else');
    if (!dto.email) throw new BadRequestException("Give your colleague's email.");
    const org = r.ctx.organizationId;
    return this.tx(r, async (tx) => {
      const { t, personId } = await this.ownTicket(tx, r, id);
      const emp = await tx.employee.findFirst({ where: { organizationId: org, workEmail: dto.email }, select: { personId: true } });
      const person = emp?.personId ?? (await tx.person.findFirst({ where: { organizationId: org, status: 'active', primaryEmail: dto.email }, select: { id: true } }))?.id;
      if (!person) throw new BadRequestException('Nobody in the company has that email.');
      await this.tickets.addWatcherIn(tx, r, t, person, true, personId);
      return { added: true };
    });
  }
}
