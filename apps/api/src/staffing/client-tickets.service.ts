import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { audit, CompanyContext, Tx } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { settingFor } from '../people/probation';
import { TicketsService } from '../service-desk/tickets.service';
import { RequesterService } from '../service-desk/requester.service';
import { deskRobot } from '../service-desk/catalog.service';
import { DeskAccessService, canWork } from '../service-desk/desk-access';
import { textToHtml } from '../service-desk/rich-text';
import { ClientPortalService } from './client-portal.service';
import type { PortalTicketDto, PortalTicketReplyDto } from './staffing-dto';

/** The portal's own categories (the drawn Raise a ticket dialog). */
export const CLIENT_TICKET_CATEGORIES = ['Replacement', 'Billing', 'Timesheets', 'Access', 'Complaint about a worker', 'Other'] as const;
const PRIORITY: Record<number, string> = { 1: 'Urgent', 2: 'High', 3: 'Normal', 4: 'Low' };

/** What the contact sees of a ticket's state: waiting on them, resolved, or open. */
export function contactStatus(systemState: string): 'Waiting for you' | 'Resolved' | 'Open' {
  return systemState === 'pending' ? 'Waiting for you' : systemState === 'solved' || systemState === 'closed' ? 'Resolved' : 'Open';
}

/**
 * Answer 491: a client contact raises and follows tickets in the staffing client portal. The tickets are the Helpdesk's
 * own (TicketsService.createIn, RequesterService.replyIn): never a second ticket model. staffing_client_tickets says which
 * client and contact a ticket belongs to: every contact of the client sees the client's tickets; another client's is
 * not found. Routing (Settings 6.2): the client's account manager (default: assigned to them on a help desk where they can work tickets, else that desk's queue) or a
 * chosen Helpdesk team (its queue). Desk work runs as the desk system after the portal session is checked.
 */
@Injectable()
export class ClientTicketsService {
  constructor(
    private readonly portal: ClientPortalService,
    private readonly tickets: TicketsService,
    private readonly requesters: RequesterService,
    private readonly access: DeskAccessService,
  ) {}

  private desk(tx: Tx) {
    return tx.$executeRaw`SELECT set_config('app.sd_system', 'on', true)`;
  }

  /** The contact as a Helpdesk person (found by email; made once). */
  private async personOf(tx: Tx, org: string, contact: { name: string; email: string }) {
    const found = await tx.person.findFirst({ where: { organizationId: org, status: 'active', primaryEmail: contact.email }, orderBy: { createdAt: 'asc' }, select: { id: true } });
    if (found) return found.id;
    const [given, ...rest] = contact.name.trim().split(/\s+/);
    return (await tx.person.create({ data: { organizationId: org, givenName: (given || contact.email).slice(0, 100), familyName: rest.join(' ').slice(0, 100) || null, primaryEmail: contact.email } })).id;
  }

  /** Where a new ticket goes: the team set in 6.2, else the account manager on their help desk, else the company's desk. */
  private async target(tx: Tx, org: string, managerUserId: string | null): Promise<{ deskId: string; groupId?: string; assignee?: string; why: string }> {
    const team = await settingFor(tx, { organizationId: org, isSuperAdmin: false } as CompanyContext, 'staffing.portal.tickets_team', { legalEntityId: '' });
    if (team && team !== 'account_manager') {
      const g = await tx.sdGroup.findFirst({ where: { organizationId: org, id: team, active: true }, select: { id: true, deskId: true } });
      const live = g && (await tx.sdDesk.findFirst({ where: { organizationId: org, id: g.deskId, status: 'active' }, select: { id: true } }));
      if (g && live) return { deskId: g.deskId, groupId: g.id, why: 'Client portal: the team set in Settings › Staffing desk' };
    }
    const today = new Date(`${todayIst()}T00:00:00Z`);
    if (managerUserId) {
      const seats = await tx.sdDeskMember.findMany({ where: { organizationId: org, userId: managerUserId, role: { in: ['agent', 'lead'] }, endedAt: null, validFrom: { lte: today }, OR: [{ validTo: null }, { validTo: { gte: today } }] }, orderBy: { createdAt: 'asc' }, select: { deskId: true } });
      const desks = seats.length ? await tx.sdDesk.findMany({ where: { organizationId: org, status: 'active', id: { in: seats.map((s) => s.deskId) } }, orderBy: { createdAt: 'asc' }, select: { id: true } }) : [];
      // Answer 921: only a desk where the account manager can work tickets (seat and the Helpdesk work right); else the queue.
      const actor = desks.length ? await this.access.actorFor(org, managerUserId) : null;
      const desk = actor && desks.find((d) => canWork(actor, d.id));
      if (desk) return { deskId: desk.id, assignee: managerUserId, why: "Client portal: the client's account manager" };
      if (desks.length) return { deskId: desks[0]!.id, why: 'Client portal: the account manager cannot work tickets on their help desk (its queue)' };
    }
    const fallback = (await tx.sdDesk.findFirst({ where: { organizationId: org, status: 'active', kind: 'customer_support' }, orderBy: { createdAt: 'asc' }, select: { id: true } })) ?? (await tx.sdDesk.findFirst({ where: { organizationId: org, status: 'active' }, orderBy: { createdAt: 'asc' }, select: { id: true } }));
    if (!fallback) throw new ConflictException('Tickets are not set up yet. Write to your account manager.');
    return { deskId: fallback.id, why: managerUserId ? 'Client portal: the account manager has no seat on a help desk' : 'Client portal: the client has no account manager' };
  }

  /** The client's tickets, newest first. */
  list(slug: string, token: string | undefined) {
    return this.portal.inPortal(slug, token, async (tx, s) => {
      await this.desk(tx);
      const links = await tx.staffingClientTicket.findMany({ where: { organizationId: s.org, clientId: s.clientId }, orderBy: { createdAt: 'desc' }, take: 200 });
      const rows = await tx.sdTicket.findMany({ where: { organizationId: s.org, id: { in: links.map((l) => l.ticketId) } } });
      const dues = new Map(await Promise.all(rows.map(async (t) => [t.id, await this.tickets.sla.requesterDue(tx, s.org, t.id)] as const)));
      return links.flatMap((l) => {
        const t = rows.find((r) => r.id === l.ticketId);
        if (!t) return [];
        const due = dues.get(t.id);
        return [{ id: t.id, number: t.number, subject: t.subject, category: l.category, priority: PRIORITY[t.priority] ?? 'Normal', raisedOn: t.createdAt.toISOString(), resolveBy: due?.resolveBy?.toISOString() ?? null, paused: Boolean(due?.paused), status: contactStatus(t.systemState) }];
      });
    });
  }

  /** Raise a ticket: the Helpdesk's own create path, then routed to the team or the account manager. Audited. */
  raise(slug: string, token: string | undefined, dto: PortalTicketDto) {
    return this.portal.inPortal(slug, token, async (tx, s) => {
      await this.desk(tx);
      const contact = await tx.staffingClientContact.findFirstOrThrow({ where: { id: s.contactId }, select: { name: true, email: true } });
      const client = await tx.staffingClient.findFirstOrThrow({ where: { id: s.clientId, organizationId: s.org }, select: { name: true, accountManagerUserId: true } });
      const to = await this.target(tx, s.org, client.accountManagerUserId);
      const personId = await this.personOf(tx, s.org, contact);
      const ctx = { organizationId: s.org, isSuperAdmin: false } as CompanyContext;
      const subject = dto.subject.trim();
      let t = await this.tickets.createIn(tx, { ctx, userId: null }, {
        deskId: to.deskId,
        subject,
        bodyHtml: textToHtml(dto.details?.trim() || subject),
        requesterPersonId: personId,
        openedByUserId: null,
        channel: 'portal',
        side: 'requester',
        authorPersonId: personId,
        tags: ['client-portal'],
      });
      const robot = deskRobot({ ctx }, to.deskId);
      if (to.groupId) t = await this.tickets.applyIn(tx, robot, t, { groupId: to.groupId }, to.why);
      if (to.assignee) t = await this.tickets.assignIn(tx, robot, t, to.assignee, undefined, to.why);
      if (!to.groupId && !to.assignee) await this.tickets.event(tx, t, 'routing', null, null, { by: null, reason: to.why });
      await tx.staffingClientTicket.create({ data: { organizationId: s.org, clientId: s.clientId, contactId: s.contactId, ticketId: t.id, category: dto.category } });
      await audit(tx, ctx, 'staffing.portal.ticket_raised', 'staffing_client', s.clientId, { ticketId: t.id, number: t.number, contactId: s.contactId, category: dto.category, routedTo: to.groupId ? 'team' : to.assignee ? 'account_manager' : 'desk' });
      return { id: t.id, number: t.number };
    });
  }

  /** A ticket of the contact's own client (any other: not found). */
  private async own(tx: Tx, s: { org: string; clientId: string }, id: string) {
    const link = await tx.staffingClientTicket.findFirst({ where: { organizationId: s.org, clientId: s.clientId, ticketId: id } });
    const t = link && (await tx.sdTicket.findFirst({ where: { organizationId: s.org, id } }));
    if (!link || !t) throw new NotFoundException('Ticket not found.');
    return { link, t };
  }

  /** One ticket with its public conversation (never internal notes). */
  get(slug: string, token: string | undefined, id: string) {
    return this.portal.inPortal(slug, token, async (tx, s) => {
      await this.desk(tx);
      const { link, t } = await this.own(tx, s, id);
      const messages = await tx.sdTicketMessage.findMany({ where: { organizationId: s.org, ticketId: t.id, kind: { in: ['reply', 'system'] }, private: false }, orderBy: { createdAt: 'asc' } });
      const people = await this.tickets.personNames(tx, s.org, [t.requesterPersonId, ...messages.map((m) => m.authorPersonId)]);
      const users = await this.tickets.userNames(tx, s.org, messages.map((m) => m.authorUserId));
      const due = await this.tickets.sla.requesterDue(tx, s.org, t.id);
      return {
        id: t.id,
        number: t.number,
        subject: t.subject,
        category: link.category,
        priority: PRIORITY[t.priority] ?? 'Normal',
        status: contactStatus(t.systemState),
        raisedOn: t.createdAt.toISOString(),
        raisedBy: people.get(t.requesterPersonId)?.name ?? '',
        resolveBy: due?.resolveBy?.toISOString() ?? null,
        canReply: !t.mergedIntoId,
        // Agents show by first name only to the client.
        messages: messages.map((m) => ({ id: m.id, side: m.side, author: m.authorUserId ? ((users.get(m.authorUserId) ?? 'Support').split(/\s+/)[0] ?? 'Support') : m.authorPersonId ? (people.get(m.authorPersonId)?.name ?? '') : 'Support', bodyHtml: m.bodyHtml, at: m.createdAt.toISOString() })),
      };
    });
  }

  /** The contact replies (a solved ticket in its reopen window reopens; a closed one gets a follow-up, as on the help centre). */
  reply(slug: string, token: string | undefined, id: string, dto: PortalTicketReplyDto) {
    return this.portal.inPortal(slug, token, async (tx, s) => {
      await this.desk(tx);
      const { t } = await this.own(tx, s, id);
      const contact = await tx.staffingClientContact.findFirstOrThrow({ where: { id: s.contactId }, select: { name: true, email: true } });
      const personId = await this.personOf(tx, s.org, contact);
      const r = await this.requesters.replyIn(tx, { ctx: { organizationId: s.org, isSuperAdmin: false } as CompanyContext, userId: null }, t, personId, textToHtml(dto.text), { channel: 'portal' });
      if (r.followUp) await tx.staffingClientTicket.create({ data: { organizationId: s.org, clientId: s.clientId, contactId: s.contactId, ticketId: r.followUp.id, category: (await this.own(tx, s, id)).link.category } });
      return r;
    });
  }
}
