import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { OrgSecretsCryptoService, TenantPrismaService } from '@exam-platform/shared';
import { Tx } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { textToHtml } from './rich-text';
import { DeskActor, SEAT_REQUIRED, activeOn, audit, canLead, canWork, deskSystem, emit, has, isAgentOn, isLead, requireSetUp, requireWork } from './desk-access';
import { EscalateDto, LinkDto, MergeDto, ResolutionCodeDto, ResolveDto, SideConversationDto, SplitDto, StandaloneTaskDto, TaskDto, TemplateDto, UpdateTaskDto } from './dto';
import { OPEN_STATES, Ticket, TicketsService } from './tickets.service';

// SD-1.09 merge, link, parent / child, split, side conversations and trackers (US-B-092, US-G-005, US-G-220);
// SD-1.10 tasks and checklists, templates, resolution codes, tier escalation, auto-close (US-G-006…008, YX-SD-10…12);
// SD-1.12 unmask and the read log (YX-SD-15, YX-SD-17). Every write: key + seat checked on the server, one transaction
// with its timeline event, outbox event and audit row.

const LINK_WORDS: Record<string, string> = { related: 'Related to', duplicate: 'Duplicate of', blocks: 'Blocks', caused_by: 'Caused by', tracked_by: 'Tracked by', follow_up: 'Follow-up of' };

@Injectable()
export class WorkService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly tickets: TicketsService,
    private readonly crypto: OrgSecretsCryptoService,
  ) {}

  private tx<T>(a: DeskActor, fn: (tx: Tx) => Promise<T>) {
    return this.tenantPrisma.forTenant(a.ctx, fn);
  }

  /** The ticket as an agent who may work it (404 if it is not visible, 403 without a seat). */
  private async working(tx: Tx, a: DeskActor, id: string): Promise<Ticket> {
    const { t, access } = await this.tickets.load(tx, a, id);
    if (access !== 'agent') throw new ForbiddenException(SEAT_REQUIRED);
    requireWork(a, t.deskId);
    return t;
  }

  // ------------------------------------------------------------------------------------------ the work panel

  /** Everything around a ticket the workspace shows: family, links, side threads, tasks, SLA, my reminders, masked values. */
  async overview(a: DeskActor, id: string) {
    return this.tx(a, async (tx) => {
      const { t, access } = await this.tickets.load(tx, a, id);
      const org = a.ctx.organizationId;
      const brief = { id: true, number: true, subject: true, systemState: true, deskId: true, tracker: true } as const;
      const [parent, children, merged, mergedInto, out, inbound, threads, tasks, reminders, masked] = await Promise.all([
        t.parentId ? tx.sdTicket.findFirst({ where: { organizationId: org, id: t.parentId }, select: brief }) : null,
        tx.sdTicket.findMany({ where: { organizationId: org, parentId: t.id }, select: brief, orderBy: { createdAt: 'asc' } }),
        tx.sdTicket.findMany({ where: { organizationId: org, mergedIntoId: t.id }, select: brief }),
        t.mergedIntoId ? tx.sdTicket.findFirst({ where: { organizationId: org, id: t.mergedIntoId }, select: brief }) : null,
        tx.sdTicketLink.findMany({ where: { organizationId: org, fromTicketId: t.id } }),
        tx.sdTicketLink.findMany({ where: { organizationId: org, toTicketId: t.id } }),
        tx.sdSideConversation.findMany({ where: { organizationId: org, ticketId: t.id }, orderBy: { createdAt: 'asc' } }),
        tx.sdTask.findMany({ where: { organizationId: org, ticketId: t.id }, orderBy: [{ checklist: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }] }),
        tx.sdReminder.findMany({ where: { organizationId: org, userId: a.userId, ticketId: t.id, doneAt: null }, orderBy: { remindAt: 'asc' } }),
        access === 'agent' ? tx.sdSensitiveValue.findMany({ where: { organizationId: org, ticketId: t.id }, select: { id: true, kind: true, masked: true, messageId: true } }) : [],
      ]);
      // Linked tickets the viewer cannot see are simply not listed (the link policy hides them, §5.7).
      const otherIds = [...out.map((l) => l.toTicketId), ...inbound.map((l) => l.fromTicketId)];
      const others = new Map((await tx.sdTicket.findMany({ where: { organizationId: org, id: { in: otherIds } }, select: brief })).map((x) => [x.id, x]));
      const threadMessages = threads.length ? await tx.sdTicketMessage.findMany({ where: { organizationId: org, ticketId: t.id, kind: 'side' }, orderBy: { createdAt: 'asc' } }) : [];
      const childTickets = new Map((await tx.sdTicket.findMany({ where: { organizationId: org, id: { in: threads.map((s) => s.childTicketId).filter((x): x is string => Boolean(x)) } }, select: brief })).map((x) => [x.id, x]));
      const users = await this.tickets.userNames(tx, org, [...threadMessages.map((m) => m.authorUserId), ...tasks.map((k) => k.assigneeUserId), ...threads.map((s) => s.createdBy)]);
      const sla = await this.tickets.sla.ticketView(tx, a, t);
      return {
        parent,
        children,
        merged,
        mergedInto,
        links: [
          ...out.filter((l) => others.has(l.toTicketId)).map((l) => ({ id: l.id, kind: l.kind, words: LINK_WORDS[l.kind], ticket: others.get(l.toTicketId)!, direction: 'out' as const })),
          ...inbound.filter((l) => others.has(l.fromTicketId)).map((l) => ({ id: l.id, kind: l.kind, words: l.kind === 'tracked_by' ? 'Tracks' : l.kind === 'follow_up' ? 'Followed up by' : l.kind === 'duplicate' ? 'Merged here' : LINK_WORDS[l.kind], ticket: others.get(l.fromTicketId)!, direction: 'in' as const })),
        ],
        sideConversations: threads.map((s) => ({
          id: s.id,
          channel: s.channel,
          subject: s.subject,
          withWhom: s.withWhom,
          state: s.state,
          createdBy: users.get(s.createdBy) ?? 'Someone',
          createdAt: s.createdAt,
          childTicket: s.childTicketId ? (childTickets.get(s.childTicketId) ?? null) : null,
          messages: threadMessages.filter((m) => m.sideConversationId === s.id).map((m) => ({ id: m.id, author: (m.authorUserId && users.get(m.authorUserId)) || 'Someone', bodyHtml: m.bodyHtml, createdAt: m.createdAt })),
        })),
        tasks: tasks.map((k) => this.taskView(k, users)),
        sla,
        reminders: reminders.map((r) => ({ id: r.id, kind: r.kind, remindAt: r.remindAt, note: r.note })),
        maskedValues: masked,
        canUnmask: access === 'agent' && has(a, 'desk.pii.unmask'),
        canSeeReads: has(a, 'desk.audit.view') && access === 'agent',
        canExclude: isLead(a, t.deskId) && canWork(a, t.deskId),
        canMerge: canLead(a, t.deskId, 'desk.ticket.merge'),
      };
    });
  }

  private taskView(k: Prisma.SdTaskGetPayload<object>, users: Map<string, string>) {
    return { id: k.id, ticketId: k.ticketId, deskId: k.deskId, title: k.title, note: k.note, checklist: k.checklist, state: k.state, assigneeUserId: k.assigneeUserId, assignee: k.assigneeUserId ? (users.get(k.assigneeUserId) ?? 'Someone') : null, groupId: k.groupId, dueAt: k.dueAt, version: k.version, doneAt: k.doneAt };
  }

  // ------------------------------------------------------------------------------------------ links, parent, tracker (SD-1.09)

  async link(a: DeskActor, id: string, dto: LinkDto) {
    return this.tx(a, async (tx) => {
      const t = await this.working(tx, a, id);
      // The other ticket must be one this agent may see too (404 otherwise: no confirming ids across desks).
      const { t: other } = await this.tickets.load(tx, a, dto.ticketId);
      if (other.id === t.id) throw new BadRequestException('A ticket cannot be linked to itself.');
      if (dto.kind === 'tracked_by') {
        if (!other.tracker) throw new BadRequestException('Mark the other ticket as a tracker first.');
        if (other.deskId !== t.deskId) throw new BadRequestException('A tracker follows tickets of its own desk.');
      }
      try {
        const l = await tx.sdTicketLink.create({ data: { organizationId: a.ctx.organizationId, fromTicketId: t.id, toTicketId: other.id, kind: dto.kind, createdBy: a.userId } });
        await this.tickets.event(tx, t, 'linked', null, other.number, { by: a.userId, reason: LINK_WORDS[dto.kind] });
        await audit(tx, a, 'desk.ticket.linked', 'sd_ticket', t.id, { to: other.id, kind: dto.kind });
        return { id: l.id };
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('These tickets are already linked that way.');
        throw e;
      }
    });
  }

  async unlink(a: DeskActor, id: string, linkId: string) {
    return this.tx(a, async (tx) => {
      const t = await this.working(tx, a, id);
      const l = await tx.sdTicketLink.findFirst({ where: { organizationId: a.ctx.organizationId, id: linkId, OR: [{ fromTicketId: t.id }, { toTicketId: t.id }] } });
      if (!l) throw new NotFoundException('No such link.');
      if (l.kind === 'duplicate' || l.kind === 'follow_up') throw new BadRequestException('This link records a merge or a follow-up and stays.');
      await tx.sdTicketLink.delete({ where: { id: l.id } });
      await this.tickets.event(tx, t, 'unlinked', LINK_WORDS[l.kind], null, { by: a.userId });
      await audit(tx, a, 'desk.ticket.unlinked', 'sd_ticket', t.id, { linkId: l.id, kind: l.kind });
      return { removed: true };
    });
  }

  /** US-B-092: make this ticket a child of another (one level), or free it. */
  async setParent(a: DeskActor, id: string, parentId: string | null) {
    return this.tx(a, async (tx) => {
      const t = await this.working(tx, a, id);
      let number: string | null = null;
      if (parentId) {
        const { t: p } = await this.tickets.load(tx, a, parentId);
        if (p.id === t.id) throw new BadRequestException('A ticket cannot be its own parent.');
        if (p.parentId) throw new BadRequestException('That ticket is itself a child; choose its parent instead.');
        if (await tx.sdTicket.count({ where: { organizationId: a.ctx.organizationId, parentId: t.id } })) throw new BadRequestException('This ticket has children of its own.');
        number = p.number;
      }
      await tx.sdTicket.update({ where: { id: t.id }, data: { parentId, version: { increment: 1 } } });
      await this.tickets.event(tx, t, 'parent_changed', null, number, { by: a.userId });
      await audit(tx, a, 'desk.ticket.parent_changed', 'sd_ticket', t.id, { parentId });
      return { parentId };
    });
  }

  /** US-G-220: a tracker gathers many customer tickets about one fault. */
  async setTracker(a: DeskActor, id: string, tracker: boolean) {
    return this.tx(a, async (tx) => {
      const t = await this.working(tx, a, id);
      if (!tracker && (await tx.sdTicketLink.count({ where: { organizationId: a.ctx.organizationId, toTicketId: t.id, kind: 'tracked_by' } }))) throw new BadRequestException('Unlink the tickets it tracks first.');
      await tx.sdTicket.update({ where: { id: t.id }, data: { tracker, version: { increment: 1 } } });
      await this.tickets.event(tx, t, 'tracker_changed', String(t.tracker), String(tracker), { by: a.userId });
      await audit(tx, a, 'desk.ticket.tracker_changed', 'sd_ticket', t.id, { tracker });
      return { tracker };
    });
  }

  // ------------------------------------------------------------------------------------------ merge (YX-SD-08)

  /**
   * Merges this ticket into another: its messages, files and followers stay with the surviving ticket (shown there), its
   * requester follows the survivor and is told, it closes with a link, and its timers stop. Both desks need the merge
   * right; a sensitive or private ticket only merges into one at least as closed.
   */
  async merge(a: DeskActor, id: string, dto: MergeDto) {
    return this.tx(a, async (tx) => {
      const org = a.ctx.organizationId;
      const src = await this.working(tx, a, id);
      await this.tickets.checkVersion(tx, a, src, dto.version);
      const { t: into, access } = await this.tickets.load(tx, a, dto.intoTicketId);
      if (access !== 'agent') throw new ForbiddenException(SEAT_REQUIRED);
      if (into.id === src.id) throw new BadRequestException('A ticket cannot be merged into itself.');
      for (const deskId of new Set([src.deskId, into.deskId])) if (!canLead(a, deskId, 'desk.ticket.merge')) throw new ForbiddenException('Only a team lead of both desks merges tickets.');
      if (src.mergedIntoId || into.mergedIntoId) throw new ConflictException('One of these tickets was already merged.');
      if (!OPEN_STATES.includes(into.systemState)) throw new ConflictException('Merge into an open ticket.');
      if ((src.sensitive && !into.sensitive) || (src.private && !into.private && !into.sensitive)) throw new BadRequestException('A sensitive or private ticket merges only into one that is as private.');
      if (await tx.sdTicket.count({ where: { organizationId: org, mergedIntoId: src.id } })) throw new BadRequestException('Tickets were merged into this one; merge the other way round.');
      // Its people follow the survivor.
      for (const p of [src.requesterPersonId, src.requestedForPersonId]) if (p && p !== into.requesterPersonId) await this.tickets.addWatcherIn(tx, a, into, p, false);
      for (const w of await tx.sdTicketWatcher.findMany({ where: { organizationId: org, ticketId: src.id } })) if (w.personId !== into.requesterPersonId) await this.tickets.addWatcherIn(tx, a, into, w.personId, false);
      // The merged requester is told, on their own ticket, where the work continues.
      const closed = await tx.sdStatus.findFirst({ where: { organizationId: org, deskId: src.deskId, systemState: 'closed', active: true, OR: [{ ticketTypeId: src.typeId }, { ticketTypeId: null }] }, orderBy: [{ ticketTypeId: { sort: 'asc', nulls: 'last' } }, { sortOrder: 'asc' }] });
      if (!closed) throw new BadRequestException('This desk has no "closed" status. Ask the desk admin to add one.');
      await tx.sdTicketMessage.create({ data: { organizationId: org, deskId: src.deskId, ticketId: src.id, kind: 'system', side: 'system', bodyHtml: textToHtml(`This ticket was joined with ${into.number}. Follow that ticket for updates.`), bodyText: `This ticket was joined with ${into.number}. Follow that ticket for updates.`, channel: 'system' } });
      await tx.sdTicket.update({ where: { id: src.id }, data: { mergedIntoId: into.id, statusId: closed.id, closedAt: new Date(), version: { increment: 1 } } });
      await tx.sdTicketLink.create({ data: { organizationId: org, fromTicketId: src.id, toTicketId: into.id, kind: 'duplicate', createdBy: a.userId } });
      await this.tickets.event(tx, src, 'merged', null, into.number, { by: a.userId, requesterVisible: true });
      await this.tickets.event(tx, into, 'merged_in', null, src.number, { by: a.userId });
      await this.tickets.sla.sync(tx, src.id);
      await emit(tx, org, 'helpdesk.ticket.merged', { ticketId: src.id, intoTicketId: into.id, deskId: src.deskId });
      await audit(tx, a, 'desk.ticket.merged', 'sd_ticket', src.id, { from: src.number, into: into.number, intoId: into.id });
      return { id: into.id, number: into.number };
    });
  }

  // ------------------------------------------------------------------------------------------ split (US-G-005)

  /** A new linked ticket for the same requester, from one message the requester already saw, with its own SLA. */
  async split(a: DeskActor, id: string, dto: SplitDto) {
    return this.tx(a, async (tx) => {
      const t = await this.working(tx, a, id);
      let body = dto.text ? textToHtml(dto.text) : null;
      if (dto.messageId) {
        const m = await tx.sdTicketMessage.findFirst({ where: { organizationId: a.ctx.organizationId, ticketId: t.id, id: dto.messageId } });
        if (!m) throw new NotFoundException('No such message.');
        // Notes and side threads are internal: they never become a message the requester sees (YX-SD-13).
        if (m.kind !== 'reply') throw new BadRequestException('Only a message the requester already saw can start a new ticket.');
        body = m.bodyHtml;
      }
      if (!body) throw new BadRequestException('Choose a message or write what the new ticket is about.');
      const n = await this.tickets.createIn(tx, a, { deskId: t.deskId, typeId: t.typeId, categoryId: t.categoryId ?? undefined, subject: dto.subject, bodyHtml: body, requesterPersonId: t.requesterPersonId, requestedForPersonId: t.requestedForPersonId ?? undefined, openedByUserId: a.userId, channel: 'agent', private: t.private, side: 'agent' });
      await tx.sdTicketLink.create({ data: { organizationId: a.ctx.organizationId, fromTicketId: n.id, toTicketId: t.id, kind: 'related', createdBy: a.userId } });
      await this.tickets.event(tx, t, 'split', null, n.number, { by: a.userId });
      await audit(tx, a, 'desk.ticket.split', 'sd_ticket', t.id, { newTicketId: n.id, number: n.number, messageId: dto.messageId ?? null });
      return { id: n.id, number: n.number };
    });
  }

  // ------------------------------------------------------------------------------------------ side conversations (US-G-005)

  /**
   * An internal thread on the ticket, or a child ticket raised with another team (the agent is its requester, so the
   * original requester never sees it). Email and Teams threads join with the email slices (SD-1.19) on the same table.
   */
  async startSide(a: DeskActor, id: string, dto: SideConversationDto) {
    return this.tx(a, async (tx) => {
      const t = await this.working(tx, a, id);
      const org = a.ctx.organizationId;
      const clean = this.tickets.cleanMasked(dto.bodyHtml);
      if (!clean.bodyText) throw new BadRequestException('Write a message first.');
      let childId: string | null = null;
      let childNumber: string | null = null;
      if (dto.channel === 'child_ticket') {
        if (!dto.deskId) throw new BadRequestException('Choose the team (desk) to ask.');
        if (t.parentId) throw new BadRequestException('This ticket is itself a child; start the thread from its parent.');
        const desk = await tx.sdDesk.findFirst({ where: { organizationId: org, id: dto.deskId, status: 'active', kind: { not: 'customer_support' } }, select: { id: true } });
        if (!desk) throw new NotFoundException('No such desk.');
        const me = await this.agentPerson(tx, a);
        // A sensitive or private ticket's child stays private on the other desk too.
        const child = await this.tickets.createIn(tx, a, { deskId: desk.id, typeId: dto.typeId, categoryId: dto.categoryId, subject: dto.subject, bodyHtml: dto.bodyHtml, requesterPersonId: me, openedByUserId: a.userId, channel: 'agent', private: t.private || t.sensitive, side: 'requester', authorPersonId: me, parentId: t.id });
        childId = child.id;
        childNumber = child.number;
      }
      const s = await tx.sdSideConversation.create({ data: { organizationId: org, deskId: t.deskId, ticketId: t.id, channel: dto.channel, subject: dto.subject, withWhom: dto.withWhom ?? null, childTicketId: childId, createdBy: a.userId } });
      if (dto.channel === 'note_thread') {
        const m = await tx.sdTicketMessage.create({ data: { organizationId: org, deskId: t.deskId, ticketId: t.id, kind: 'side', side: 'agent', authorUserId: a.userId, bodyHtml: clean.bodyHtml, bodyText: clean.bodyText, channel: 'agent', sideConversationId: s.id } });
        await this.tickets.keepPii(tx, t, m.id, clean.found);
      }
      await this.tickets.event(tx, t, 'side_started', null, childNumber ?? dto.subject.slice(0, 100), { by: a.userId });
      await audit(tx, a, 'desk.ticket.side_started', 'sd_ticket', t.id, { sideConversationId: s.id, channel: dto.channel, childTicketId: childId });
      return { id: s.id, childTicketId: childId, childNumber };
    });
  }

  /** The agent's own person record (P01 login role), made on first need like a requester's. */
  private async agentPerson(tx: Tx, a: DeskActor): Promise<string> {
    const role = await tx.personRole.findFirst({ where: { organizationId: a.ctx.organizationId, roleType: 'login', sourceTable: 'users', sourceId: a.userId, endOn: null }, select: { personId: true } });
    if (role) return role.personId;
    const user = await tx.user.findFirstOrThrow({ where: { organizationId: a.ctx.organizationId, id: a.userId }, select: { name: true, email: true } });
    const [given, ...rest] = (user.name?.trim() || user.email.split('@')[0]).split(/\s+/);
    const p = await tx.person.create({ data: { organizationId: a.ctx.organizationId, givenName: given.slice(0, 100), familyName: rest.join(' ').slice(0, 100) || null, createdBy: a.userId } });
    await tx.personRole.create({ data: { organizationId: a.ctx.organizationId, personId: p.id, roleType: 'login', sourceTable: 'users', sourceId: a.userId, startOn: new Date(`${todayIst()}T00:00:00Z`) } });
    return p.id;
  }

  async sideMessage(a: DeskActor, id: string, sideId: string, bodyHtml: string) {
    return this.tx(a, async (tx) => {
      const { t, access } = await this.tickets.load(tx, a, id);
      if (!((access === 'agent' && canWork(a, t.deskId)) || (access === 'collaborator' && has(a, 'desk.ticket.note')))) throw new ForbiddenException('You cannot write in this thread.');
      const s = await tx.sdSideConversation.findFirst({ where: { organizationId: a.ctx.organizationId, ticketId: t.id, id: sideId } });
      if (!s) throw new NotFoundException('No such thread.');
      if (s.channel !== 'note_thread') throw new BadRequestException('Write on the child ticket itself.');
      if (s.state === 'closed') throw new ConflictException('This thread is closed.');
      const clean = this.tickets.cleanMasked(bodyHtml);
      if (!clean.bodyText) throw new BadRequestException('Write a message first.');
      const m = await tx.sdTicketMessage.create({ data: { organizationId: a.ctx.organizationId, deskId: t.deskId, ticketId: t.id, kind: 'side', side: 'agent', authorUserId: a.userId, bodyHtml: clean.bodyHtml, bodyText: clean.bodyText, channel: 'agent', sideConversationId: s.id } });
      await this.tickets.keepPii(tx, t, m.id, clean.found);
      await audit(tx, a, 'desk.ticket.side_message', 'sd_ticket', t.id, { sideConversationId: s.id, messageId: m.id });
      return { id: m.id };
    });
  }

  async closeSide(a: DeskActor, id: string, sideId: string) {
    return this.tx(a, async (tx) => {
      const t = await this.working(tx, a, id);
      const res = await tx.sdSideConversation.updateMany({ where: { organizationId: a.ctx.organizationId, ticketId: t.id, id: sideId, state: 'open' }, data: { state: 'closed', closedAt: new Date() } });
      if (!res.count) throw new NotFoundException('No such open thread.');
      await audit(tx, a, 'desk.ticket.side_closed', 'sd_ticket', t.id, { sideConversationId: sideId });
      return { closed: true };
    });
  }

  // ------------------------------------------------------------------------------------------ tasks (US-G-006, SD-1.17)

  /** Who may be given a task on this desk: anyone with a seat today except an admin-only seat. */
  private async checkAssignee(tx: Tx, a: DeskActor, deskId: string, userId: string | null | undefined, t: Ticket | null) {
    if (!userId) return;
    const seat = await tx.sdDeskMember.findFirst({ where: { organizationId: a.ctx.organizationId, deskId, userId, role: { in: ['agent', 'lead', 'collaborator'] }, ...activeOn(todayIst()) }, select: { role: true } });
    if (!seat) throw new BadRequestException('Give tasks to people with a seat on this desk.');
    // A collaborator works the tasks given to them, so they are added to the ticket (Q10: collaborators are free).
    if (seat.role === 'collaborator' && t) {
      await tx.sdTicketCollaborator.upsert({ where: { ticketId_userId: { ticketId: t.id, userId } }, update: {}, create: { organizationId: a.ctx.organizationId, deskId, ticketId: t.id, userId, addedBy: a.userId } });
    }
  }

  async addTask(a: DeskActor, id: string, dto: TaskDto) {
    return this.tx(a, async (tx) => {
      const t = await this.working(tx, a, id);
      if (!OPEN_STATES.includes(t.systemState)) throw new ConflictException('Reopen the ticket to add tasks.');
      return this.createTask(tx, a, t.deskId, t, dto);
    });
  }

  /** US-G-006: a task with no ticket, in a desk's task list. */
  async addStandalone(a: DeskActor, dto: StandaloneTaskDto) {
    if (!has(a, 'desk.task.work') || !isAgentOn(a, dto.deskId)) throw new ForbiddenException(SEAT_REQUIRED);
    return this.tx(a, (tx) => this.createTask(tx, a, dto.deskId, null, { ...dto, checklist: false }));
  }

  private async createTask(tx: Tx, a: DeskActor, deskId: string, t: Ticket | null, dto: TaskDto) {
    const org = a.ctx.organizationId;
    await this.checkAssignee(tx, a, deskId, dto.assigneeUserId, t);
    if (dto.groupId && !(await tx.sdGroup.findFirst({ where: { organizationId: org, deskId, id: dto.groupId, active: true }, select: { id: true } }))) throw new BadRequestException('Choose a group of this desk.');
    const k = await tx.sdTask.create({ data: { organizationId: org, deskId, ticketId: t?.id ?? null, title: dto.title, note: dto.note || null, checklist: Boolean(dto.checklist), assigneeUserId: dto.assigneeUserId ?? null, groupId: dto.groupId ?? null, dueAt: dto.dueAt ? new Date(dto.dueAt) : null, createdBy: a.userId } });
    if (t) {
      await this.tickets.event(tx, t, 'task_added', null, k.title.slice(0, 100), { by: a.userId });
      await this.tickets.sla.sync(tx, t.id);
    }
    if (k.assigneeUserId) await emit(tx, org, 'helpdesk.task.assigned', { taskId: k.id, ticketId: k.ticketId, deskId, assigneeUserId: k.assigneeUserId });
    await audit(tx, a, 'desk.task.created', 'sd_task', k.id, { ticketId: k.ticketId, deskId, assigneeUserId: k.assigneeUserId, groupId: k.groupId, checklist: k.checklist });
    return { id: k.id };
  }

  /** Agents change any task of their desk; a collaborator changes only the state of a task given to them. */
  async updateTask(a: DeskActor, taskId: string, dto: UpdateTaskDto) {
    return this.tx(a, async (tx) => {
      const org = a.ctx.organizationId;
      const k = await tx.sdTask.findFirst({ where: { organizationId: org, id: taskId } });
      if (!k) throw new NotFoundException('No such task.');
      const t = k.ticketId ? (await this.tickets.load(tx, a, k.ticketId)).t : null;
      const agent = canWork(a, k.deskId) && has(a, 'desk.task.work');
      const mine = k.assigneeUserId === a.userId && has(a, 'desk.task.work') && a.roles.has(k.deskId);
      if (!agent && !mine) throw new NotFoundException('No such task.');
      if (!agent && Object.keys(dto).some((x) => !['version', 'state', 'note'].includes(x))) throw new ForbiddenException('You can only update the state of tasks given to you.');
      if (dto.assigneeUserId !== undefined) await this.checkAssignee(tx, a, k.deskId, dto.assigneeUserId, t);
      const done = dto.state === 'done' || dto.state === 'cancelled';
      const res = await tx.sdTask.updateMany({
        where: { organizationId: org, id: k.id, version: dto.version },
        data: {
          ...(dto.title !== undefined ? { title: dto.title } : {}),
          ...(dto.note !== undefined ? { note: dto.note || null } : {}),
          ...(dto.state ? { state: dto.state, doneAt: done ? new Date() : null, doneBy: done ? a.userId : null } : {}),
          ...(dto.assigneeUserId !== undefined ? { assigneeUserId: dto.assigneeUserId } : {}),
          ...(dto.dueAt !== undefined ? { dueAt: dto.dueAt ? new Date(dto.dueAt) : null } : {}),
          version: { increment: 1 },
        },
      });
      if (!res.count) throw new ConflictException('Someone else changed this task. Reload to see the latest.');
      if (t) {
        if (dto.state && dto.state !== k.state) await this.tickets.event(tx, t, 'task_changed', k.state, dto.state, { by: a.userId, reason: k.title.slice(0, 200) });
        await this.tickets.sla.sync(tx, t.id);
      }
      if (dto.state === 'done' && k.state !== 'done') await emit(tx, org, 'helpdesk.task.completed', { taskId: k.id, ticketId: k.ticketId, deskId: k.deskId });
      if (dto.assigneeUserId && dto.assigneeUserId !== k.assigneeUserId) await emit(tx, org, 'helpdesk.task.assigned', { taskId: k.id, ticketId: k.ticketId, deskId: k.deskId, assigneeUserId: dto.assigneeUserId });
      await audit(tx, a, 'desk.task.updated', 'sd_task', k.id, { ticketId: k.ticketId, changes: dto });
      return { id: k.id };
    });
  }

  /** My open tasks across desks plus the standalone tasks of desks I work on. */
  async taskList(a: DeskActor) {
    return this.tx(a, async (tx) => {
      const org = a.ctx.organizationId;
      const agentDesks = [...a.roles].filter(([, r]) => r === 'agent' || r === 'lead').map(([d]) => d);
      const rows = await tx.sdTask.findMany({
        where: { organizationId: org, state: { in: ['open', 'in_progress'] }, OR: [{ assigneeUserId: a.userId, deskId: { in: [...a.roles.keys()] } }, { ticketId: null, deskId: { in: agentDesks } }] },
        orderBy: [{ dueAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
        take: 200,
      });
      const users = await this.tickets.userNames(tx, org, rows.map((k) => k.assigneeUserId));
      // Tasks of tickets the person may no longer open are hidden by the visibility policy (§5.7).
      const tickets = new Map((await tx.sdTicket.findMany({ where: { organizationId: org, id: { in: rows.map((k) => k.ticketId).filter((x): x is string => Boolean(x)) } }, select: { id: true, number: true, sensitive: true, private: true, subject: true } })).map((x) => [x.id, x]));
      return rows.map((k) => {
        const t = k.ticketId ? tickets.get(k.ticketId) : null;
        return { ...this.taskView(k, users), ticket: t ? { id: t.id, number: t.number, subject: t.sensitive || t.private ? null : t.subject } : null };
      });
    });
  }

  // ------------------------------------------------------------------------------------------ templates, resolution codes (desk set-up)

  async templates(a: DeskActor, deskId: string) {
    if (!a.roles.has(deskId) && !has(a, 'desk.desk.create')) throw new NotFoundException('No such desk.');
    return this.tx(a, async (tx) => ({
      templates: (await tx.sdTemplate.findMany({ where: { organizationId: a.ctx.organizationId, deskId }, orderBy: { name: 'asc' } })).map((x) => ({ id: x.id, name: x.name, ticketTypeId: x.ticketTypeId, defaults: x.defaults, checklist: x.checklist, active: x.active })),
      resolutionCodes: (await tx.sdResolutionCode.findMany({ where: { organizationId: a.ctx.organizationId, deskId }, orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }] })).map((x) => ({ id: x.id, code: x.code, label: x.label, active: x.active })),
    }));
  }

  async saveTemplate(a: DeskActor, deskId: string, id: string | null, dto: TemplateDto) {
    requireSetUp(a, deskId, 'desk.settings.manage');
    const org = a.ctx.organizationId;
    try {
      return await this.tx(a, async (tx) => {
        const d = dto.defaults;
        if (dto.ticketTypeId && !(await tx.sdTicketType.findFirst({ where: { organizationId: org, deskId, id: dto.ticketTypeId }, select: { id: true } }))) throw new BadRequestException('Choose a ticket type of this desk.');
        if (d.categoryId && !(await tx.sdCategory.findFirst({ where: { organizationId: org, deskId, id: d.categoryId }, select: { id: true } }))) throw new BadRequestException('Choose a category of this desk.');
        if (d.groupId && !(await tx.sdGroup.findFirst({ where: { organizationId: org, deskId, id: d.groupId }, select: { id: true } }))) throw new BadRequestException('Choose a group of this desk.');
        const data = { name: dto.name, ticketTypeId: dto.ticketTypeId ?? null, defaults: d as unknown as Prisma.InputJsonValue, checklist: dto.checklist.map((x) => x.trim()).filter(Boolean), ...(dto.active !== undefined ? { active: dto.active } : {}) };
        const x = id
          ? (await tx.sdTemplate.updateMany({ where: { organizationId: org, deskId, id }, data })).count
            ? { id }
            : null
          : await tx.sdTemplate.create({ data: { organizationId: org, deskId, ...data, createdBy: a.userId } });
        if (!x) throw new NotFoundException('No such template.');
        await audit(tx, a, id ? 'desk.template.updated' : 'desk.template.created', 'sd_template', x.id, { deskId, name: dto.name });
        return { id: x.id };
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('A template with that name exists.');
      throw e;
    }
  }

  /** Applies a template: its field defaults and a checklist task per line. */
  async applyTemplate(a: DeskActor, id: string, templateId: string, version: number) {
    return this.tx(a, async (tx) => {
      const t = await this.working(tx, a, id);
      await this.tickets.checkVersion(tx, a, t, version);
      const x = await tx.sdTemplate.findFirst({ where: { organizationId: a.ctx.organizationId, deskId: t.deskId, id: templateId, active: true } });
      if (!x) throw new NotFoundException('No such template on this desk.');
      const d = x.defaults as { categoryId?: string; groupId?: string; priority?: number; tags?: string[] };
      await this.tickets.applyIn(tx, a, t, { categoryId: d.categoryId, groupId: d.groupId, priority: d.priority, priorityReason: d.priority ? `Template: ${x.name}` : undefined, tags: d.tags ? [...new Set([...t.tags, ...d.tags])] : undefined }, `Template: ${x.name}`);
      let order = await tx.sdTask.count({ where: { organizationId: a.ctx.organizationId, ticketId: t.id } });
      for (const title of x.checklist) await tx.sdTask.create({ data: { organizationId: a.ctx.organizationId, deskId: t.deskId, ticketId: t.id, title, checklist: true, sortOrder: order++, createdBy: a.userId } });
      await audit(tx, a, 'desk.ticket.template_applied', 'sd_ticket', t.id, { templateId: x.id, name: x.name, checklist: x.checklist.length });
      return { applied: true };
    });
  }

  async saveResolutionCode(a: DeskActor, deskId: string, id: string | null, dto: ResolutionCodeDto) {
    requireSetUp(a, deskId, 'desk.settings.manage');
    const org = a.ctx.organizationId;
    try {
      return await this.tx(a, async (tx) => {
        if (!(await tx.sdDesk.findFirst({ where: { organizationId: org, id: deskId }, select: { id: true } }))) throw new NotFoundException('No such desk.');
        const data = { code: dto.code, label: dto.label, ...(dto.active !== undefined ? { active: dto.active } : {}) };
        const x = id ? ((await tx.sdResolutionCode.updateMany({ where: { organizationId: org, deskId, id }, data })).count ? { id } : null) : await tx.sdResolutionCode.create({ data: { organizationId: org, deskId, ...data } });
        if (!x) throw new NotFoundException('No such resolution code.');
        await audit(tx, a, 'desk.resolution_code.saved', 'sd_desk', deskId, { id: x.id, ...data });
        return { id: x.id };
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('That code exists on this desk.');
      throw e;
    }
  }

  // ------------------------------------------------------------------------------------------ resolve, escalate (YX-SD-11, YX-SD-12)

  async resolve(a: DeskActor, id: string, dto: ResolveDto) {
    return this.tx(a, async (tx) => {
      const t = await this.working(tx, a, id);
      await this.tickets.checkVersion(tx, a, t, dto.version);
      if (!OPEN_STATES.includes(t.systemState)) throw new ConflictException('This ticket is already resolved or closed.');
      const solved = await tx.sdStatus.findFirst({ where: { organizationId: a.ctx.organizationId, deskId: t.deskId, systemState: 'solved', active: true, OR: [{ ticketTypeId: t.typeId }, { ticketTypeId: null }] }, orderBy: [{ ticketTypeId: { sort: 'asc', nulls: 'last' } }, { sortOrder: 'asc' }] });
      if (!solved) throw new BadRequestException('This desk has no "resolved" status. Ask the desk admin to add one.');
      const after = await this.tickets.applyIn(tx, a, t, { statusId: solved.id, resolutionCode: dto.resolutionCode || null, resolutionNote: dto.resolutionNote?.trim() || null, linkedReplyHtml: dto.linkedReplyHtml ?? null });
      return this.tickets.summary(after);
    });
  }

  /** YX-SD-12: a move between L1, L2 and L3 is a timeline event with its reason (and optionally a new group). */
  async escalate(a: DeskActor, id: string, dto: EscalateDto) {
    return this.tx(a, async (tx) => {
      const t = await this.working(tx, a, id);
      if (dto.tier === t.tier && !dto.groupId) throw new BadRequestException(`The ticket is already at ${dto.tier}.`);
      if (dto.groupId) {
        const g = await tx.sdGroup.findFirst({ where: { organizationId: a.ctx.organizationId, deskId: t.deskId, id: dto.groupId, active: true } });
        if (!g) throw new BadRequestException('Choose a group of this desk.');
        if (g.tier && g.tier !== dto.tier) throw new BadRequestException(`That group works at ${g.tier}.`);
      }
      await tx.sdTicket.update({ where: { id: t.id }, data: { tier: dto.tier, version: { increment: 1 } } });
      await this.tickets.event(tx, t, 'tier_changed', t.tier, dto.tier, { by: a.userId, reason: dto.reason });
      let cur = await tx.sdTicket.findUniqueOrThrow({ where: { id: t.id } });
      if (dto.groupId && dto.groupId !== t.groupId) {
        cur = await this.tickets.applyIn(tx, a, cur, { groupId: dto.groupId }, dto.reason);
        // The new group's own method picks an owner (YX-SD-04); otherwise it waits in that group's queue.
        const owner = await this.tickets.pickAssignee(tx, a.ctx.organizationId, t.deskId, dto.groupId);
        if (cur.assigneeUserId && cur.assigneeUserId !== owner) {
          cur = await tx.sdTicket.update({ where: { id: t.id }, data: { assigneeUserId: owner, version: { increment: 1 } } });
          await this.tickets.event(tx, t, 'assigned', t.assigneeUserId, owner, { by: a.userId, reason: dto.reason });
        } else if (!cur.assigneeUserId && owner) {
          cur = await tx.sdTicket.update({ where: { id: t.id }, data: { assigneeUserId: owner, version: { increment: 1 } } });
          await this.tickets.event(tx, t, 'assigned', null, owner, { by: null, reason: 'Assigned automatically' });
        }
        await this.tickets.sla.sync(tx, t.id);
      }
      await emit(tx, a.ctx.organizationId, 'helpdesk.ticket.escalated', { ticketId: t.id, deskId: t.deskId, from: t.tier, to: dto.tier });
      await audit(tx, a, 'desk.ticket.escalated', 'sd_ticket', t.id, { from: t.tier, to: dto.tier, groupId: dto.groupId ?? null, reason: dto.reason });
      return this.tickets.summary(cur);
    });
  }

  // ------------------------------------------------------------------------------------------ auto-close (YX-SD-10)

  /** Job every 15 minutes: resolved tickets with no reply for the desk's wait close by themselves. */
  async autoClose(now = new Date()): Promise<number> {
    const due = await deskSystem(this.tenantPrisma, { organizationId: null, isSuperAdmin: true }, (tx) =>
      tx.$queryRaw<{ id: string; organization_id: string }[]>`
        SELECT t.id, t.organization_id FROM sd_tickets t JOIN sd_desks d ON d.organization_id = t.organization_id AND d.id = t.desk_id
        WHERE t.system_state = 'solved' AND d.auto_close_days IS NOT NULL AND t.merged_into_id IS NULL
          AND t.resolved_at < ${now}::timestamptz - make_interval(days => d.auto_close_days)
        ORDER BY t.resolved_at LIMIT 500`,
    );
    let closed = 0;
    for (const r of due) {
      closed += await deskSystem(this.tenantPrisma, { organizationId: r.organization_id, isSuperAdmin: false }, async (tx) => {
        const t = await tx.sdTicket.findFirst({ where: { organizationId: r.organization_id, id: r.id, systemState: 'solved' } });
        if (!t) return 0;
        const s = await tx.sdStatus.findFirst({ where: { organizationId: t.organizationId, deskId: t.deskId, systemState: 'closed', active: true, OR: [{ ticketTypeId: t.typeId }, { ticketTypeId: null }] }, orderBy: [{ ticketTypeId: { sort: 'asc', nulls: 'last' } }, { sortOrder: 'asc' }] });
        if (!s) return 0;
        await tx.sdTicket.update({ where: { id: t.id }, data: { statusId: s.id, closedAt: now, version: { increment: 1 } } });
        await this.tickets.event(tx, t, 'status_changed', t.statusId, s.id, { by: null, reason: 'Closed by itself after the wait', requesterVisible: true });
        await emit(tx, t.organizationId, 'helpdesk.ticket.closed', { ticketId: t.id, deskId: t.deskId, auto: true });
        await audit(tx, { ctx: { organizationId: t.organizationId, isSuperAdmin: false }, userId: null as unknown as string }, 'desk.ticket.auto_closed', 'sd_ticket', t.id, { number: t.number });
        await this.tickets.sla.sync(tx, t.id, now);
        return 1;
      });
    }
    return closed;
  }

  // ------------------------------------------------------------------------------------------ PII unmask and the read log (SD-1.12)

  /** YX-SD-15: shows one masked value to an agent of the desk with desk.pii.unmask, after step-up; every view audited. */
  async unmask(a: DeskActor, id: string, valueId: string) {
    if (!has(a, 'desk.pii.unmask')) throw new ForbiddenException('You cannot show masked values.');
    return this.tx(a, async (tx) => {
      const { t, access } = await this.tickets.load(tx, a, id);
      if (access !== 'agent') throw new ForbiddenException(SEAT_REQUIRED);
      const v = await tx.sdSensitiveValue.findFirst({ where: { organizationId: a.ctx.organizationId, ticketId: t.id, id: valueId } });
      if (!v) throw new NotFoundException('No such value.');
      await audit(tx, a, 'desk.pii.unmasked', 'sd_ticket', t.id, { valueId: v.id, kind: v.kind, messageId: v.messageId });
      return { value: this.crypto.decrypt(v.valueEncrypted), kind: v.kind };
    });
  }

  /** US-G-030: who read this ticket, when and from where (desk.audit.view, and only on a ticket the viewer may open). */
  async reads(a: DeskActor, ticketId: string) {
    if (!has(a, 'desk.audit.view')) throw new ForbiddenException('You cannot see who read tickets.');
    return this.tx(a, async (tx) => {
      const { t, access } = await this.tickets.load(tx, a, ticketId);
      if (access !== 'agent') throw new ForbiddenException(SEAT_REQUIRED);
      const rows = await tx.sdTicketRead.findMany({ where: { organizationId: a.ctx.organizationId, ticketId: t.id }, orderBy: { readAt: 'desc' }, take: 500 });
      const users = await this.tickets.userNames(tx, a.ctx.organizationId, rows.map((r) => r.userId));
      return rows.map((r) => ({ who: users.get(r.userId) ?? 'Someone', userId: r.userId, access: r.access, ip: r.ip, at: r.readAt }));
    });
  }
}
