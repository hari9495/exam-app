import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantPrismaService } from '@exam-platform/shared';
import { Tx } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { NotificationsService } from '../notifications/notifications.service';
import { chooseAgent, isAvailable } from './assignment';
import { cleanHtml, htmlToText } from './rich-text';
import {
  DeskActor,
  SEAT_REQUIRED,
  TicketAccess,
  activeOn,
  audit,
  canLead,
  canWork,
  emit,
  has,
  requireWork,
  ticketAccess,
} from './desk-access';
import { AgentCreateTicketDto, AssignDto, BulkActionDto, CollaboratorDto, ConvertDto, EditNoteDto, MessageDto, TimeEntryDto, UpdateTicketDto, WatcherDto } from './dto';

// SD-1.03 ticket core, SD-1.04 requesters, SD-1.06 assignment and SD-1.08 the ticket workspace (M14 §7, §12.1).
// Every write: server-side key + seat check, one transaction with its timeline event, outbox event and audit row.
// Optimistic locking (YX-SD-07): a save on a stale version is refused with who changed it.

export type Ticket = Prisma.SdTicketGetPayload<object>;
export const OPEN_STATES = ['new', 'open', 'pending', 'on_hold'];
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

export interface Changes {
  subject?: string;
  statusId?: string;
  priority?: number;
  priorityReason?: string;
  impact?: number;
  urgency?: number;
  categoryId?: string | null;
  groupId?: string | null;
  tags?: string[];
  private?: boolean;
  resolutionCode?: string | null;
  resolutionNote?: string | null;
  typeId?: string;
}

export interface CreateInput {
  deskId: string;
  typeId?: string;
  categoryId?: string;
  subject: string;
  bodyHtml: string;
  impact?: number;
  urgency?: number;
  requesterPersonId: string;
  requestedForPersonId?: string;
  openedByUserId: string | null;
  channel: 'portal' | 'agent' | 'api';
  private?: boolean;
  tags?: string[];
  /** Who wrote the first message: the requester (portal) or an agent raising it for them. */
  side: 'requester' | 'agent';
  authorPersonId?: string | null;
}

interface Notice {
  type: 'helpdesk.note.mention' | 'helpdesk.ticket.assigned';
  to: string[];
  ticket: Ticket;
}

@Injectable()
export class TicketsService {
  private readonly logger = new Logger(TicketsService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  tx<T>(a: { ctx: DeskActor['ctx'] }, fn: (tx: Tx) => Promise<T>) {
    return this.tenantPrisma.forTenant(a.ctx, fn);
  }

  // ------------------------------------------------------------------------------------------ creating

  /** The shared create path (portal, agent, API): numbering, routing, assignment, first message (YX-SD-01/03/04). */
  async createIn(tx: Tx, a: { ctx: DeskActor['ctx']; userId: string }, input: CreateInput): Promise<Ticket> {
    const org = a.ctx.organizationId;
    const desk = await tx.sdDesk.findFirst({ where: { organizationId: org, id: input.deskId, status: 'active' } });
    if (!desk) throw new NotFoundException('No such desk.');
    const type = input.typeId
      ? await tx.sdTicketType.findFirst({ where: { organizationId: org, deskId: desk.id, id: input.typeId, active: true } })
      : await tx.sdTicketType.findFirst({ where: { organizationId: org, deskId: desk.id, active: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
    if (!type) throw new BadRequestException('Choose a ticket type of this desk.');
    const cat = input.categoryId ? await this.category(tx, org, desk.id, input.categoryId, true) : null;
    const status = await this.firstStatus(tx, org, desk.id, type.id, 'new');
    for (const p of [input.requesterPersonId, input.requestedForPersonId]) {
      if (p && !(await tx.person.findFirst({ where: { organizationId: org, id: p, status: 'active' }, select: { id: true } }))) throw new BadRequestException('No such person in this company.');
    }
    const forWhom = input.requestedForPersonId ?? input.requesterPersonId;
    const vip = Boolean((await tx.sdRequesterFlag.findUnique({ where: { organizationId_personId: { organizationId: org, personId: forWhom } } }))?.vip);
    let priority = (input.impact && input.urgency ? await this.matrix(tx, org, desk.id, input.impact, input.urgency) : null) ?? cat?.defaultPriority ?? 3;
    if (vip && desk.vipRaisesPriority) priority = Math.max(1, priority - 1);

    const [{ n }] = await tx.$queryRaw<{ n: bigint }[]>`
      UPDATE sd_counters SET next_number = next_number + 1
      WHERE organization_id = ${org}::uuid AND desk_id = ${desk.id}::uuid
      RETURNING next_number - 1 AS n`;
    const groupId = cat?.groupId ?? null;
    const assigneeUserId = groupId ? await this.pickAssignee(tx, org, desk.id, groupId) : null;
    const bodyHtml = cleanHtml(input.bodyHtml);
    const bodyText = htmlToText(bodyHtml);
    if (!bodyText) throw new BadRequestException('Describe the issue.');

    const t = await tx.sdTicket.create({
      data: {
        organizationId: org,
        deskId: desk.id,
        seq: n,
        number: `${desk.numberPrefix}${n}${desk.numberSuffix}`,
        typeId: type.id,
        statusId: status.id,
        priority,
        impact: input.impact ?? null,
        urgency: input.urgency ?? null,
        categoryId: cat?.id ?? null,
        subject: input.subject,
        requesterPersonId: input.requesterPersonId,
        requestedForPersonId: input.requestedForPersonId ?? null,
        openedByUserId: input.openedByUserId,
        assigneeUserId,
        groupId,
        channel: input.channel,
        sensitive: Boolean(cat?.sensitive),
        private: Boolean(input.private),
        vip,
        tags: input.tags ?? [],
        createdBy: a.userId,
      },
    });
    await tx.sdTicketMessage.create({
      data: {
        organizationId: org,
        deskId: desk.id,
        ticketId: t.id,
        kind: 'reply',
        side: input.side,
        authorUserId: input.side === 'agent' ? a.userId : null,
        authorPersonId: input.authorPersonId ?? null,
        bodyHtml,
        bodyText,
        channel: input.channel,
      },
    });
    await this.event(tx, t, 'created', null, t.number, { by: a.userId, requesterVisible: true });
    if (assigneeUserId) await this.event(tx, t, 'assigned', null, assigneeUserId, { by: null, reason: 'Assigned automatically' });
    if (input.requestedForPersonId) await this.addWatcherIn(tx, a, t, input.requestedForPersonId, false);
    await emit(tx, org, 'helpdesk.ticket.created', { ticketId: t.id, deskId: desk.id, number: t.number, channel: input.channel });
    if (assigneeUserId) await emit(tx, org, 'helpdesk.ticket.assigned', { ticketId: t.id, deskId: desk.id, assigneeUserId });
    await audit(tx, a, 'desk.ticket.created', 'sd_ticket', t.id, { number: t.number, deskId: desk.id, channel: input.channel, assigneeUserId, priority, vip, sensitive: t.sensitive });
    return tx.sdTicket.findUniqueOrThrow({ where: { id: t.id } });
  }

  /** An agent raises a ticket for a requester (§12.1 POST /tickets). */
  async createByAgent(a: DeskActor, dto: AgentCreateTicketDto) {
    requireWork(a, dto.deskId);
    const t = await this.tx(a, (tx) =>
      this.createIn(tx, a, {
        deskId: dto.deskId,
        typeId: dto.typeId,
        categoryId: dto.categoryId,
        subject: dto.subject,
        bodyHtml: dto.bodyHtml,
        impact: dto.impact,
        urgency: dto.urgency,
        requesterPersonId: dto.requesterPersonId,
        requestedForPersonId: dto.requestedForPersonId,
        openedByUserId: a.userId,
        channel: dto.channel ?? 'agent',
        private: dto.private,
        tags: dto.tags,
        side: 'agent',
      }),
    );
    if (t.assigneeUserId) void this.notify(a, { type: 'helpdesk.ticket.assigned', to: [t.assigneeUserId], ticket: t });
    return { id: t.id, number: t.number };
  }

  private async category(tx: Tx, org: string, deskId: string, id: string, activeOnly: boolean) {
    const c = await tx.sdCategory.findFirst({ where: { organizationId: org, deskId, id, ...(activeOnly ? { active: true } : {}) } });
    if (!c) throw new BadRequestException('Choose a category of this desk.');
    const parent = c.parentId ? await tx.sdCategory.findFirst({ where: { organizationId: org, id: c.parentId } }) : null;
    return { id: c.id, sensitive: c.sensitive || Boolean(parent?.sensitive), groupId: c.defaultGroupId ?? parent?.defaultGroupId ?? null, defaultPriority: c.defaultPriority ?? parent?.defaultPriority ?? null };
  }

  private async firstStatus(tx: Tx, org: string, deskId: string, typeId: string, state: string) {
    const s = await tx.sdStatus.findFirst({
      where: { organizationId: org, deskId, systemState: state, active: true, OR: [{ ticketTypeId: typeId }, { ticketTypeId: null }] },
      orderBy: [{ ticketTypeId: { sort: 'asc', nulls: 'last' } }, { sortOrder: 'asc' }],
    });
    if (!s) throw new BadRequestException(`This desk has no "${state}" status. Ask the desk admin to add one.`);
    return s;
  }

  private async matrix(tx: Tx, org: string, deskId: string, impact: number, urgency: number) {
    return (await tx.sdPriorityMatrix.findFirst({ where: { organizationId: org, deskId, impact, urgency } }))?.priority ?? null;
  }

  // ------------------------------------------------------------------------------------------ assignment (SD-1.06)

  /**
   * YX-SD-04/05: the group's method picks an owner among members who hold an agent seat today, are not away, are inside
   * their shift and are not on approved leave. The group row is locked so two tickets never race for the same turn.
   */
  async pickAssignee(tx: Tx, org: string, deskId: string, groupId: string, now = new Date()): Promise<string | null> {
    const [group] = await tx.$queryRaw<{ assignment_method: string; max_open_per_agent: number | null; last_assigned_user_id: string | null; active: boolean }[]>`
      SELECT assignment_method, max_open_per_agent, last_assigned_user_id, active FROM sd_groups
      WHERE organization_id = ${org}::uuid AND desk_id = ${deskId}::uuid AND id = ${groupId}::uuid FOR UPDATE`;
    if (!group?.active || group.assignment_method === 'manual') return null;
    const members = (await tx.sdGroupMember.findMany({ where: { organizationId: org, groupId }, select: { userId: true } })).map((m) => m.userId);
    if (!members.length) return null;
    const seated = (await tx.sdDeskMember.findMany({ where: { organizationId: org, deskId, userId: { in: members }, role: { in: ['agent', 'lead'] }, ...activeOn(todayIst()) }, select: { userId: true } })).map((m) => m.userId);
    const statuses = new Map((await tx.sdAgentStatus.findMany({ where: { organizationId: org, userId: { in: seated } } })).map((s) => [s.userId, s]));
    const onLeave = await this.onApprovedLeave(tx, org, seated, now);
    const free = seated.filter((u) => isAvailable(statuses.get(u), now) && !onLeave.has(u));
    if (!free.length) return null;
    const counts = await tx.sdTicket.groupBy({ by: ['assigneeUserId'], where: { organizationId: org, assigneeUserId: { in: free }, systemState: { in: OPEN_STATES } }, _count: { _all: true } });
    const open = new Map(counts.map((c) => [c.assigneeUserId!, c._count._all]));
    const chosen = chooseAgent(group.assignment_method as 'round_robin' | 'load', free.map((userId) => ({ userId, open: open.get(userId) ?? 0 })), group.last_assigned_user_id, group.max_open_per_agent);
    if (chosen) await tx.sdGroup.update({ where: { id: groupId }, data: { lastAssignedUserId: chosen } });
    return chosen;
  }

  /**
   * US-G-011 approved leave from YukthiX HR (M02). M02 leave is not built yet, so nobody is on leave here; when it
   * lands, this reads its approved leave for `now` and nothing else changes.
   */
  // DECISION NEEDED: confirm half-day leave counts as away for the whole day once M02 exists.
  private async onApprovedLeave(_tx: Tx, _org: string, _userIds: string[], _now: Date): Promise<Set<string>> {
    return new Set();
  }

  // ------------------------------------------------------------------------------------------ reading

  async load(tx: Tx, a: DeskActor, id: string): Promise<{ t: Ticket; access: TicketAccess }> {
    const t = await tx.sdTicket.findFirst({ where: { organizationId: a.ctx.organizationId, id } });
    const access = t ? await ticketAccess(tx, a, t) : null;
    if (!t || !access) throw new NotFoundException('No such ticket.');
    return { t, access };
  }

  /** The agent's (or collaborator's, or desk admin's read-only) view of one ticket. */
  async get(a: DeskActor, id: string) {
    return this.tx(a, async (tx) => {
      const { t, access } = await this.load(tx, a, id);
      const org = a.ctx.organizationId;
      const [messages, attachments, watchers, collaborators, time, desk, type, status, cat, group] = await Promise.all([
        tx.sdTicketMessage.findMany({ where: { organizationId: org, ticketId: t.id }, orderBy: { createdAt: 'asc' } }),
        tx.sdAttachment.findMany({ where: { organizationId: org, ticketId: t.id }, orderBy: { createdAt: 'asc' } }),
        tx.sdTicketWatcher.findMany({ where: { organizationId: org, ticketId: t.id } }),
        tx.sdTicketCollaborator.findMany({ where: { organizationId: org, ticketId: t.id } }),
        tx.sdTimeEntry.findMany({ where: { organizationId: org, ticketId: t.id }, orderBy: { workedOn: 'desc' } }),
        tx.sdDesk.findFirstOrThrow({ where: { organizationId: org, id: t.deskId } }),
        tx.sdTicketType.findFirst({ where: { organizationId: org, id: t.typeId } }),
        tx.sdStatus.findFirst({ where: { organizationId: org, id: t.statusId } }),
        t.categoryId ? tx.sdCategory.findFirst({ where: { organizationId: org, id: t.categoryId } }) : null,
        t.groupId ? tx.sdGroup.findFirst({ where: { organizationId: org, id: t.groupId } }) : null,
      ]);
      const people = await this.personNames(tx, org, [t.requesterPersonId, t.requestedForPersonId, ...watchers.map((w) => w.personId), ...messages.map((m) => m.authorPersonId)]);
      const users = await this.userNames(tx, org, [t.assigneeUserId, t.openedByUserId, ...messages.map((m) => m.authorUserId), ...collaborators.map((c) => c.userId), ...time.map((e) => e.userId)]);
      const who = (m: { authorUserId: string | null; authorPersonId: string | null }) => (m.authorUserId ? users.get(m.authorUserId) : m.authorPersonId ? people.get(m.authorPersonId)?.name : null) ?? 'YukthiX';
      return {
        ...this.summary(t),
        access,
        canWork: access === 'agent' && canWork(a, t.deskId),
        canNote: (access === 'agent' || access === 'collaborator') && has(a, 'desk.ticket.note'),
        canAssignOthers: canLead(a, t.deskId, 'desk.ticket.assign'),
        desk: { id: desk.id, key: desk.key, name: desk.name, audience: desk.kind === 'customer_support' ? 'customer' : 'employee' },
        type: type ? { id: type.id, name: type.name } : null,
        status: status ? { id: status.id, label: status.label } : null,
        category: cat ? { id: cat.id, name: cat.name } : null,
        group: group ? { id: group.id, name: group.name } : null,
        requester: people.get(t.requesterPersonId) ?? null,
        requestedFor: t.requestedForPersonId ? (people.get(t.requestedForPersonId) ?? null) : null,
        assignee: t.assigneeUserId ? { id: t.assigneeUserId, name: users.get(t.assigneeUserId) ?? 'Someone' } : null,
        openedBy: t.openedByUserId ? users.get(t.openedByUserId) ?? null : null,
        messages: messages.map((m) => ({
          id: m.id,
          kind: m.kind,
          side: m.side,
          author: who(m),
          mine: m.authorUserId === a.userId,
          bodyHtml: m.bodyHtml,
          channel: m.channel,
          createdAt: m.createdAt,
          editedAt: m.editedAt,
        })),
        attachments: attachments.map((x) => this.attachmentView(x)),
        watchers: watchers.map((w) => ({ id: w.id, personId: w.personId, name: people.get(w.personId)?.name ?? 'Someone', email: people.get(w.personId)?.email ?? null, external: w.external })),
        collaborators: collaborators.map((c) => ({ userId: c.userId, name: users.get(c.userId) ?? 'Someone' })),
        time: { totalMinutes: time.reduce((s, e) => s + e.minutes, 0), entries: time.map((e) => ({ id: e.id, minutes: e.minutes, note: e.note, workedOn: e.workedOn.toISOString().slice(0, 10), who: users.get(e.userId) ?? 'Someone', mine: e.userId === a.userId })) },
      };
    });
  }

  summary(t: Ticket) {
    return {
      id: t.id,
      number: t.number,
      deskId: t.deskId,
      subject: t.subject,
      kind: t.kind,
      systemState: t.systemState,
      statusId: t.statusId,
      typeId: t.typeId,
      categoryId: t.categoryId,
      groupId: t.groupId,
      priority: t.priority,
      impact: t.impact,
      urgency: t.urgency,
      assigneeUserId: t.assigneeUserId,
      channel: t.channel,
      sensitive: t.sensitive,
      private: t.private,
      vip: t.vip,
      tags: t.tags,
      firstResponseAt: t.firstResponseAt,
      resolvedAt: t.resolvedAt,
      closedAt: t.closedAt,
      resolutionCode: t.resolutionCode,
      resolutionNote: t.resolutionNote,
      reopenCount: t.reopenCount,
      version: t.version,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    };
  }

  attachmentView(x: Prisma.SdAttachmentGetPayload<object>) {
    return { id: x.id, fileName: x.fileName, contentType: x.contentType, sizeBytes: x.sizeBytes, scanStatus: x.scanStatus, side: x.side, messageId: x.messageId, createdAt: x.createdAt };
  }

  async personNames(tx: Tx, org: string, ids: (string | null)[]) {
    const list = [...new Set(ids.filter((x): x is string => Boolean(x)))];
    const rows = list.length ? await tx.person.findMany({ where: { organizationId: org, id: { in: list } }, select: { id: true, givenName: true, familyName: true, preferredName: true, primaryEmail: true } }) : [];
    return new Map(rows.map((p) => [p.id, { id: p.id, name: [p.preferredName || p.givenName, p.familyName].filter(Boolean).join(' '), email: p.primaryEmail }]));
  }

  async userNames(tx: Tx, org: string, ids: (string | null)[]) {
    const list = [...new Set(ids.filter((x): x is string => Boolean(x)))];
    const rows = list.length ? await tx.user.findMany({ where: { organizationId: org, id: { in: list } }, select: { id: true, name: true, email: true } }) : [];
    return new Map(rows.map((u) => [u.id, u.name || u.email]));
  }

  async timeline(a: DeskActor, id: string) {
    return this.tx(a, async (tx) => {
      const { t } = await this.load(tx, a, id);
      const events = await tx.sdTicketEvent.findMany({ where: { organizationId: a.ctx.organizationId, ticketId: t.id }, orderBy: { at: 'asc' } });
      const users = await this.userNames(tx, a.ctx.organizationId, events.flatMap((e) => [e.byUserId, ...(e.kind === 'assigned' ? [e.fromValue, e.toValue] : [])]));
      const label = async (kind: string, v: string | null) => {
        if (!v) return null;
        if (kind === 'assigned') return users.get(v) ?? 'Someone';
        if (kind === 'status_changed') return (await tx.sdStatus.findFirst({ where: { organizationId: a.ctx.organizationId, id: v } }))?.label ?? v;
        if (kind === 'type_changed') return (await tx.sdTicketType.findFirst({ where: { organizationId: a.ctx.organizationId, id: v } }))?.name ?? v;
        return v;
      };
      return Promise.all(events.map(async (e) => ({ id: e.id, kind: e.kind, from: await label(e.kind, e.fromValue), to: await label(e.kind, e.toValue), reason: e.reason, by: e.byUserId ? (users.get(e.byUserId) ?? 'Someone') : 'YukthiX', at: e.at })));
    });
  }

  /** US-G-003: who is asking and what else they asked, limited to tickets this agent may see (YX-HD-03). */
  async context(a: DeskActor, id: string, visible: Prisma.SdTicketWhereInput) {
    return this.tx(a, async (tx) => {
      const { t } = await this.load(tx, a, id);
      const org = a.ctx.organizationId;
      const person = (await this.personNames(tx, org, [t.requesterPersonId])).get(t.requesterPersonId) ?? null;
      const [employee] = await tx.$queryRaw<{ code: string | null; designation: string | null; department: string | null; location: string | null }[]>`
        SELECT m.employee_code::text AS code, d.name AS designation, dp.name AS department, l.name AS location
        FROM employees e
        JOIN employee_assignments a ON a.organization_id = e.organization_id AND a.employee_id = e.id AND a.superseded_at IS NULL
          AND a.valid_from <= (now() AT TIME ZONE 'Asia/Kolkata')::date AND (a.valid_to IS NULL OR a.valid_to >= (now() AT TIME ZONE 'Asia/Kolkata')::date)
        JOIN employments m ON m.organization_id = a.organization_id AND m.id = a.employment_id
        LEFT JOIN designations d ON d.organization_id = a.organization_id AND d.id = a.designation_id
        LEFT JOIN departments dp ON dp.organization_id = a.organization_id AND dp.id = a.department_id
        LEFT JOIN locations l ON l.organization_id = a.organization_id AND l.id = a.location_id
        WHERE e.organization_id = ${org}::uuid AND e.person_id = ${t.requesterPersonId}::uuid
        LIMIT 1`;
      const others = await tx.sdTicket.findMany({
        where: { AND: [visible, { OR: [{ requesterPersonId: t.requesterPersonId }, { requestedForPersonId: t.requesterPersonId }] }, { id: { not: t.id } }] },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { id: true, number: true, subject: true, systemState: true, createdAt: true },
      });
      const vip = Boolean((await tx.sdRequesterFlag.findUnique({ where: { organizationId_personId: { organizationId: org, personId: t.requesterPersonId } } }))?.vip);
      return {
        person,
        vip,
        // Public directory fields only (P02 Q4): code, designation, department, location.
        employee: employee ?? null,
        otherTickets: others,
        // Assets and CIs join in phase 3b-3 (US-G-003).
        assets: [],
      };
    });
  }

  // ------------------------------------------------------------------------------------------ changing (SD-1.03)

  /** Field changes with their timeline, outbox and audit rows. The caller checked the version and the rights. */
  async applyIn(tx: Tx, a: DeskActor, t: Ticket, c: Changes, why?: string): Promise<Ticket> {
    const org = a.ctx.organizationId;
    const data: Prisma.SdTicketUncheckedUpdateInput = {};
    const log: [string, string | null, string | null, boolean][] = [];
    const typeId = c.typeId ?? t.typeId;
    if (c.typeId && c.typeId !== t.typeId) {
      const type = await tx.sdTicketType.findFirst({ where: { organizationId: org, deskId: t.deskId, id: c.typeId, active: true } });
      if (!type) throw new BadRequestException('Choose a ticket type of this desk.');
      data.typeId = type.id;
      log.push(['type_changed', t.typeId, type.id, false]);
      // YX-SD-09: a label made only for the old type moves to the new type's label for the same system state.
      const cur = await tx.sdStatus.findFirstOrThrow({ where: { organizationId: org, id: t.statusId } });
      if (cur.ticketTypeId && !c.statusId) c.statusId = (await this.firstStatus(tx, org, t.deskId, type.id, cur.systemState)).id;
    }
    let state = t.systemState;
    if (c.statusId && c.statusId !== t.statusId) {
      const s = await tx.sdStatus.findFirst({ where: { organizationId: org, deskId: t.deskId, id: c.statusId, active: true, OR: [{ ticketTypeId: null }, { ticketTypeId: typeId }] } });
      if (!s) throw new BadRequestException('Choose a status of this desk.');
      data.statusId = s.id;
      state = s.systemState;
      log.push(['status_changed', t.statusId, s.id, true]);
      const wasDone = t.systemState === 'solved' || t.systemState === 'closed';
      if (s.systemState === 'solved' && t.systemState !== 'solved') data.resolvedAt = new Date();
      if (s.systemState === 'closed') data.closedAt = new Date();
      if (wasDone && OPEN_STATES.includes(s.systemState)) {
        data.reopenCount = { increment: 1 };
        data.resolvedAt = null;
        data.closedAt = null;
      }
    }
    if (c.subject !== undefined && c.subject !== t.subject) {
      data.subject = c.subject;
      log.push(['subject_changed', t.subject, c.subject, true]);
    }
    if (c.categoryId !== undefined && c.categoryId !== t.categoryId) {
      const cat = c.categoryId ? await this.category(tx, org, t.deskId, c.categoryId, true) : null;
      data.categoryId = cat?.id ?? null;
      // §5.7: a sensitive category makes the ticket visible only to the desk's agents.
      data.sensitive = Boolean(cat?.sensitive);
      log.push(['category_changed', t.categoryId, cat?.id ?? null, false]);
    }
    let priority = t.priority;
    if (c.priority !== undefined && c.priority !== t.priority) {
      if (!c.priorityReason && !why) throw new BadRequestException('Give a reason for changing the priority by hand.');
      priority = c.priority;
    } else if ((c.impact !== undefined || c.urgency !== undefined) && c.priority === undefined) {
      const impact = c.impact ?? t.impact;
      const urgency = c.urgency ?? t.urgency;
      if (impact && urgency) priority = (await this.matrix(tx, org, t.deskId, impact, urgency)) ?? t.priority;
      data.impact = impact;
      data.urgency = urgency;
    }
    if (priority !== t.priority) {
      data.priority = priority;
      log.push(['priority_changed', String(t.priority), String(priority), false]);
    }
    if (c.groupId !== undefined && c.groupId !== t.groupId) {
      if (c.groupId && !(await tx.sdGroup.findFirst({ where: { organizationId: org, deskId: t.deskId, id: c.groupId, active: true }, select: { id: true } }))) throw new BadRequestException('Choose a group of this desk.');
      data.groupId = c.groupId;
      log.push(['group_changed', t.groupId, c.groupId, false]);
    }
    if (c.tags !== undefined) {
      const tags = [...new Set(c.tags.map((x) => x.trim()))].slice(0, 20);
      if (tags.join('\u0000') !== t.tags.join('\u0000')) {
        data.tags = tags;
        log.push(['tags_changed', t.tags.join(', ') || null, tags.join(', ') || null, false]);
      }
    }
    if (c.private !== undefined && c.private !== t.private) {
      data.private = c.private;
      log.push(['privacy_changed', String(t.private), String(c.private), false]);
    }
    if (c.resolutionCode !== undefined) data.resolutionCode = c.resolutionCode;
    if (c.resolutionNote !== undefined) data.resolutionNote = c.resolutionNote;
    if (!Object.keys(data).length) return t;

    data.version = { increment: 1 };
    const after = await tx.sdTicket.update({ where: { id: t.id }, data });
    const reason = c.priorityReason ?? why ?? null;
    for (const [kind, from, to, visible] of log) await this.event(tx, t, kind, from, to, { by: a.userId, reason: kind === 'priority_changed' ? reason : (why ?? null), requesterVisible: visible });
    if (data.statusId) {
      await emit(tx, org, 'helpdesk.ticket.status_changed', { ticketId: t.id, deskId: t.deskId, from: t.systemState, to: state });
      if (state === 'solved') await emit(tx, org, 'helpdesk.ticket.resolved', { ticketId: t.id, deskId: t.deskId });
      if (state === 'closed') await emit(tx, org, 'helpdesk.ticket.closed', { ticketId: t.id, deskId: t.deskId });
      if (data.reopenCount) await emit(tx, org, 'helpdesk.ticket.reopened', { ticketId: t.id, deskId: t.deskId });
    }
    if (data.priority) await emit(tx, org, 'helpdesk.ticket.priority_changed', { ticketId: t.id, deskId: t.deskId, from: t.priority, to: priority });
    await audit(tx, a, 'desk.ticket.updated', 'sd_ticket', t.id, { number: t.number, changes: log.map(([kind, from, to]) => ({ kind, from, to })), reason });
    return after;
  }

  /** PATCH /tickets/:id (version checked, YX-SD-07). */
  async update(a: DeskActor, id: string, dto: UpdateTicketDto) {
    return this.tx(a, async (tx) => {
      const { t, access } = await this.load(tx, a, id);
      if (access !== 'agent') throw new ForbiddenException(SEAT_REQUIRED);
      requireWork(a, t.deskId);
      await this.checkVersion(tx, a, t, dto.version);
      const { version: _v, ...changes } = dto;
      return this.summary(await this.applyIn(tx, a, t, changes));
    });
  }

  async checkVersion(tx: Tx, a: DeskActor, t: Ticket, version: number) {
    if (t.version === version) return;
    const last = await tx.sdTicketEvent.findFirst({ where: { organizationId: a.ctx.organizationId, ticketId: t.id, byUserId: { not: null } }, orderBy: { at: 'desc' }, select: { byUserId: true } });
    const by = last?.byUserId ? (await this.userNames(tx, a.ctx.organizationId, [last.byUserId])).get(last.byUserId) : null;
    throw new ConflictException({ statusCode: 409, code: 'TICKET_CHANGED', message: `${by ?? 'Someone'} changed this ticket. Reload to see the latest.` });
  }

  async convert(a: DeskActor, id: string, dto: ConvertDto) {
    return this.tx(a, async (tx) => {
      const { t, access } = await this.load(tx, a, id);
      if (access !== 'agent') throw new ForbiddenException(SEAT_REQUIRED);
      requireWork(a, t.deskId);
      if (dto.typeId === t.typeId) throw new BadRequestException('The ticket already has that type.');
      // SLA targets restart under the new type when SLA timers arrive (SD-1.14/1.15).
      return this.summary(await this.applyIn(tx, a, t, { typeId: dto.typeId }, dto.reason ?? 'Type changed'));
    });
  }

  // ------------------------------------------------------------------------------------------ assignment by hand

  async seatHeld(tx: Tx, org: string, deskId: string, userId: string) {
    return Boolean(await tx.sdDeskMember.findFirst({ where: { organizationId: org, deskId, userId, role: { in: ['agent', 'lead'] }, ...activeOn(todayIst()) }, select: { id: true } }));
  }

  /** Taking a ticket needs a seat; giving it to someone else needs the lead's assign right (§6.1). */
  async assignIn(tx: Tx, a: DeskActor, t: Ticket, userId: string | null, groupId?: string | null, why?: string): Promise<Ticket> {
    const org = a.ctx.organizationId;
    const self = userId === a.userId || (userId === null && t.assigneeUserId === a.userId);
    if (!canWork(a, t.deskId)) throw new ForbiddenException(SEAT_REQUIRED);
    if (!self && !canLead(a, t.deskId, 'desk.ticket.assign')) throw new ForbiddenException('Only a team lead assigns tickets to others.');
    if (userId && !(await this.seatHeld(tx, org, t.deskId, userId))) throw new ForbiddenException(SEAT_REQUIRED);
    let cur = t;
    if (groupId !== undefined && groupId !== t.groupId) cur = await this.applyIn(tx, a, cur, { groupId }, why);
    if (userId === cur.assigneeUserId) return cur;
    const after = await tx.sdTicket.update({ where: { id: t.id }, data: { assigneeUserId: userId, version: { increment: 1 } } });
    await this.event(tx, t, 'assigned', cur.assigneeUserId, userId, { by: a.userId, reason: why ?? null });
    await emit(tx, org, 'helpdesk.ticket.assigned', { ticketId: t.id, deskId: t.deskId, assigneeUserId: userId });
    await audit(tx, a, 'desk.ticket.assigned', 'sd_ticket', t.id, { number: t.number, from: cur.assigneeUserId, to: userId });
    return after;
  }

  async assign(a: DeskActor, id: string, dto: AssignDto) {
    const t = await this.tx(a, async (tx) => {
      const { t, access } = await this.load(tx, a, id);
      if (access !== 'agent') throw new ForbiddenException(SEAT_REQUIRED);
      return this.assignIn(tx, a, t, dto.userId, dto.groupId);
    });
    if (t.assigneeUserId && t.assigneeUserId !== a.userId) void this.notify(a, { type: 'helpdesk.ticket.assigned', to: [t.assigneeUserId], ticket: t });
    return this.summary(t);
  }

  // ------------------------------------------------------------------------------------------ messages (SD-1.08)

  /** Reply (agents only, YX-SD-06) or internal note (agents and the record's collaborators, YX-SD-13). */
  async post(a: DeskActor, id: string, dto: MessageDto) {
    const notices: Notice[] = [];
    const result = await this.tx(a, async (tx) => {
      const { t, access } = await this.load(tx, a, id);
      const org = a.ctx.organizationId;
      if (dto.kind === 'reply') {
        if (access !== 'agent') throw new ForbiddenException(SEAT_REQUIRED);
        requireWork(a, t.deskId);
        if (dto.mentions?.length) throw new BadRequestException('Mention colleagues in an internal note, not in a reply to the requester.');
      } else if (!((access === 'agent' || access === 'collaborator') && has(a, 'desk.ticket.note'))) {
        throw new ForbiddenException('You cannot add notes to this ticket.');
      }
      const bodyHtml = cleanHtml(dto.bodyHtml);
      const bodyText = htmlToText(bodyHtml);
      if (!bodyText) throw new BadRequestException('Write a message first.');
      const mentions = dto.kind === 'note' ? await this.mentionable(tx, a, t, dto.mentions ?? []) : [];
      const m = await tx.sdTicketMessage.create({
        data: { organizationId: org, deskId: t.deskId, ticketId: t.id, kind: dto.kind, side: 'agent', authorUserId: a.userId, bodyHtml, bodyText, mentions, channel: 'agent' },
      });
      await this.attach(tx, a, t, m.id, dto.attachmentIds ?? []);
      let after = t;
      if (dto.kind === 'reply' && !t.firstResponseAt) after = await tx.sdTicket.update({ where: { id: t.id }, data: { firstResponseAt: new Date() } });
      if (dto.statusId) {
        if (access !== 'agent' || !canWork(a, t.deskId)) throw new ForbiddenException(SEAT_REQUIRED);
        after = await this.applyIn(tx, a, after, { statusId: dto.statusId });
      }
      await emit(tx, org, dto.kind === 'reply' ? 'helpdesk.ticket.replied' : 'helpdesk.ticket.note_added', { ticketId: t.id, deskId: t.deskId, messageId: m.id });
      await audit(tx, a, dto.kind === 'reply' ? 'desk.ticket.replied' : 'desk.ticket.note_added', 'sd_ticket', t.id, { number: t.number, messageId: m.id, attachments: dto.attachmentIds?.length ?? 0, mentions });
      if (mentions.length) notices.push({ type: 'helpdesk.note.mention', to: mentions, ticket: after });
      return { id: m.id, ticket: this.summary(after) };
    });
    for (const n of notices) void this.notify(a, n);
    return result;
  }

  /**
   * People who may be mentioned: anyone with a seat on the desk or already on the record. A mentioned desk collaborator
   * is added to the record, which is how a collaborator reaches it (§5.2).
   */
  private async mentionable(tx: Tx, a: DeskActor, t: Ticket, ids: string[]): Promise<string[]> {
    if (!ids.length) return [];
    const org = a.ctx.organizationId;
    const seats = await tx.sdDeskMember.findMany({ where: { organizationId: org, deskId: t.deskId, userId: { in: ids }, ...activeOn(todayIst()) }, select: { userId: true, role: true } });
    const collabs = await tx.sdTicketCollaborator.findMany({ where: { organizationId: org, ticketId: t.id, userId: { in: ids } }, select: { userId: true } });
    const ok = new Set([...seats.map((s) => s.userId), ...collabs.map((c) => c.userId)]);
    const bad = ids.filter((u) => !ok.has(u));
    if (bad.length) throw new BadRequestException('You can mention only people on this desk or on this ticket.');
    for (const s of seats) {
      // Admins see standard tickets anyway; collaborators reach a record only when added. Never on a private one by mention
      // unless the agent chose to (they wrote the note).
      if (s.role === 'collaborator' && !collabs.some((c) => c.userId === s.userId)) await this.addCollaboratorIn(tx, a, t, s.userId);
    }
    return ids;
  }

  /** Files uploaded to this ticket by this person and not sent yet go with the message. */
  async attach(tx: Tx, a: { ctx: DeskActor['ctx'] }, t: Ticket, messageId: string, ids: string[], by: { userId?: string; personId?: string } = {}) {
    if (!ids.length) return;
    const owner = by.personId ? { uploadedByPersonId: by.personId } : { uploadedByUserId: by.userId ?? (a as DeskActor).userId };
    const res = await tx.sdAttachment.updateMany({ where: { organizationId: a.ctx.organizationId, ticketId: t.id, id: { in: ids }, messageId: null, ...owner }, data: { messageId } });
    if (res.count !== ids.length) throw new BadRequestException('Some files are not yours, not on this ticket or already sent.');
  }

  async editNote(a: DeskActor, id: string, messageId: string, dto: EditNoteDto) {
    return this.tx(a, async (tx) => {
      const { t } = await this.load(tx, a, id);
      const m = await tx.sdTicketMessage.findFirst({ where: { organizationId: a.ctx.organizationId, ticketId: t.id, id: messageId } });
      if (!m) throw new NotFoundException('No such message.');
      if (m.kind !== 'note') throw new BadRequestException('A reply sent to the requester cannot be edited.');
      if (m.authorUserId !== a.userId) throw new ForbiddenException('Only the author edits a note.');
      const bodyHtml = cleanHtml(dto.bodyHtml);
      const bodyText = htmlToText(bodyHtml);
      if (!bodyText) throw new BadRequestException('Write the note first.');
      await tx.sdTicketMessage.update({ where: { id: m.id }, data: { bodyHtml, bodyText, editedAt: new Date() } });
      await audit(tx, a, 'desk.ticket.note_edited', 'sd_ticket', t.id, { messageId: m.id, beforeLength: m.bodyText.length, afterLength: bodyText.length });
      return { id: m.id };
    });
  }

  // ------------------------------------------------------------------------------------------ watchers, collaborators (SD-1.04)

  async addWatcherIn(tx: Tx, a: { ctx: DeskActor['ctx']; userId?: string }, t: Ticket, personId: string, fromRequester: boolean, addedByPersonId?: string) {
    const org = a.ctx.organizationId;
    if (personId === t.requesterPersonId) return null;
    const internal = await tx.personRole.findFirst({ where: { organizationId: org, personId, roleType: { in: ['employee', 'login'] }, endOn: null }, select: { id: true } });
    const w = await tx.sdTicketWatcher.upsert({
      where: { organizationId_ticketId_personId: { organizationId: org, ticketId: t.id, personId } },
      update: {},
      create: { organizationId: org, deskId: t.deskId, ticketId: t.id, personId, external: !internal, addedByUserId: fromRequester ? null : (a.userId ?? null), addedByPersonId: addedByPersonId ?? null },
    });
    await this.event(tx, t, 'watcher_added', null, personId, { by: a.userId ?? null, byPerson: addedByPersonId ?? null, requesterVisible: true });
    if (a.userId) await audit(tx, a as DeskActor, 'desk.ticket.watcher_added', 'sd_ticket', t.id, { personId });
    return w;
  }

  async addWatcher(a: DeskActor, id: string, dto: WatcherDto) {
    if (!dto.personId) throw new BadRequestException('Choose a person.');
    return this.tx(a, async (tx) => {
      const { t, access } = await this.load(tx, a, id);
      if (access !== 'agent') throw new ForbiddenException(SEAT_REQUIRED);
      requireWork(a, t.deskId);
      if (!(await tx.person.findFirst({ where: { organizationId: a.ctx.organizationId, id: dto.personId, status: 'active' }, select: { id: true } }))) throw new BadRequestException('No such person in this company.');
      const w = await this.addWatcherIn(tx, a, t, dto.personId!, false);
      return { id: w?.id ?? null };
    });
  }

  async removeWatcher(a: DeskActor, id: string, watcherId: string) {
    return this.tx(a, async (tx) => {
      const { t, access } = await this.load(tx, a, id);
      if (access !== 'agent') throw new ForbiddenException(SEAT_REQUIRED);
      requireWork(a, t.deskId);
      const w = await tx.sdTicketWatcher.findFirst({ where: { organizationId: a.ctx.organizationId, ticketId: t.id, id: watcherId } });
      if (!w) throw new NotFoundException('No such watcher.');
      await tx.sdTicketWatcher.delete({ where: { id: w.id } });
      await this.event(tx, t, 'watcher_removed', w.personId, null, { by: a.userId });
      await audit(tx, a, 'desk.ticket.watcher_removed', 'sd_ticket', t.id, { personId: w.personId });
      return { removed: true };
    });
  }

  private async addCollaboratorIn(tx: Tx, a: DeskActor, t: Ticket, userId: string) {
    await tx.sdTicketCollaborator.upsert({
      where: { ticketId_userId: { ticketId: t.id, userId } },
      update: {},
      create: { organizationId: a.ctx.organizationId, deskId: t.deskId, ticketId: t.id, userId, addedBy: a.userId },
    });
    await this.event(tx, t, 'collaborator_added', null, userId, { by: a.userId });
    await audit(tx, a, 'desk.ticket.collaborator_added', 'sd_ticket', t.id, { userId });
  }

  /** A colleague with a seat on the desk (usually a collaborator seat) is added to one record. */
  async addCollaborator(a: DeskActor, id: string, dto: CollaboratorDto) {
    return this.tx(a, async (tx) => {
      const { t, access } = await this.load(tx, a, id);
      if (access !== 'agent') throw new ForbiddenException(SEAT_REQUIRED);
      requireWork(a, t.deskId);
      const seat = await tx.sdDeskMember.findFirst({ where: { organizationId: a.ctx.organizationId, deskId: t.deskId, userId: dto.userId, ...activeOn(todayIst()) }, select: { role: true } });
      if (!seat) throw new BadRequestException('Add people who have a seat on this desk.');
      if (seat.role === 'agent' || seat.role === 'lead') throw new BadRequestException('Agents of this desk already see the ticket.');
      await this.addCollaboratorIn(tx, a, t, dto.userId);
      return { added: true };
    });
  }

  async removeCollaborator(a: DeskActor, id: string, userId: string) {
    return this.tx(a, async (tx) => {
      const { t, access } = await this.load(tx, a, id);
      if (access !== 'agent') throw new ForbiddenException(SEAT_REQUIRED);
      requireWork(a, t.deskId);
      const res = await tx.sdTicketCollaborator.deleteMany({ where: { organizationId: a.ctx.organizationId, ticketId: t.id, userId } });
      if (!res.count) throw new NotFoundException('Not a collaborator on this ticket.');
      await this.event(tx, t, 'collaborator_removed', userId, null, { by: a.userId });
      await audit(tx, a, 'desk.ticket.collaborator_removed', 'sd_ticket', t.id, { userId });
      return { removed: true };
    });
  }

  // ------------------------------------------------------------------------------------------ time (US-B-091)

  async addTime(a: DeskActor, id: string, dto: TimeEntryDto) {
    return this.tx(a, async (tx) => {
      const { t, access } = await this.load(tx, a, id);
      if (access !== 'agent') throw new ForbiddenException(SEAT_REQUIRED);
      requireWork(a, t.deskId);
      if (t.systemState === 'closed' && a.roles.get(t.deskId) !== 'lead') throw new ForbiddenException('Time on a closed ticket is changed only by a team lead.');
      const workedOn = dto.workedOn ?? todayIst();
      if (workedOn > todayIst()) throw new BadRequestException('Time is logged for today or earlier.');
      const e = await tx.sdTimeEntry.create({ data: { organizationId: a.ctx.organizationId, deskId: t.deskId, ticketId: t.id, userId: a.userId, minutes: dto.minutes, note: dto.note || null, workedOn: day(workedOn) } });
      await audit(tx, a, 'desk.ticket.time_logged', 'sd_ticket', t.id, { entryId: e.id, minutes: dto.minutes, workedOn });
      return { id: e.id };
    });
  }

  async updateTime(a: DeskActor, id: string, entryId: string, dto: TimeEntryDto) {
    return this.tx(a, async (tx) => {
      const { t, access } = await this.load(tx, a, id);
      if (access !== 'agent') throw new ForbiddenException(SEAT_REQUIRED);
      requireWork(a, t.deskId);
      const e = await tx.sdTimeEntry.findFirst({ where: { organizationId: a.ctx.organizationId, ticketId: t.id, id: entryId } });
      if (!e) throw new NotFoundException('No such time entry.');
      const lead = a.roles.get(t.deskId) === 'lead';
      if ((t.systemState === 'closed' || e.userId !== a.userId) && !lead) throw new ForbiddenException('Only a team lead changes this time entry.');
      await tx.sdTimeEntry.update({ where: { id: e.id }, data: { minutes: dto.minutes, note: dto.note ?? e.note, ...(dto.workedOn ? { workedOn: day(dto.workedOn) } : {}), updatedBy: a.userId } });
      await audit(tx, a, 'desk.ticket.time_changed', 'sd_ticket', t.id, { entryId: e.id, from: e.minutes, to: dto.minutes });
      return { id: e.id };
    });
  }

  // ------------------------------------------------------------------------------------------ scenarios and bulk (SD-1.07)

  /** US-G-002: run a scenario's changes, note and reply together. Assigning to someone else still needs the lead right. */
  async runScenarioIn(tx: Tx, a: DeskActor, t: Ticket, scenarioId: string): Promise<Ticket> {
    const s = await tx.sdScenario.findFirst({ where: { organizationId: a.ctx.organizationId, deskId: t.deskId, id: scenarioId, active: true } });
    if (!s) throw new BadRequestException('No such scenario on this desk.');
    const x = s.actions as { statusId?: string; priority?: number; groupId?: string; assignee?: string | null; addTags?: string[]; note?: string; reply?: string };
    const why = `Scenario: ${s.name}`;
    let cur = await this.applyIn(tx, a, t, { statusId: x.statusId, priority: x.priority, groupId: x.groupId, tags: x.addTags ? [...new Set([...t.tags, ...x.addTags])] : undefined }, why);
    if (x.assignee !== undefined) cur = await this.assignIn(tx, a, cur, x.assignee === 'me' ? a.userId : x.assignee, undefined, why);
    for (const [kind, html] of [['note', x.note], ['reply', x.reply]] as const) {
      if (!html) continue;
      const bodyText = htmlToText(html);
      if (!bodyText) continue;
      await tx.sdTicketMessage.create({ data: { organizationId: a.ctx.organizationId, deskId: t.deskId, ticketId: t.id, kind, side: 'agent', authorUserId: a.userId, bodyHtml: cleanHtml(html), bodyText, channel: 'agent' } });
      if (kind === 'reply' && !cur.firstResponseAt) cur = await tx.sdTicket.update({ where: { id: t.id }, data: { firstResponseAt: new Date() } });
    }
    await audit(tx, a, 'desk.ticket.scenario_run', 'sd_ticket', t.id, { scenarioId, name: s.name });
    return cur;
  }

  async runScenario(a: DeskActor, id: string, scenarioId: string, version: number) {
    return this.tx(a, async (tx) => {
      const { t, access } = await this.load(tx, a, id);
      if (access !== 'agent') throw new ForbiddenException(SEAT_REQUIRED);
      requireWork(a, t.deskId);
      await this.checkVersion(tx, a, t, version);
      return this.summary(await this.runScenarioIn(tx, a, t, scenarioId));
    });
  }

  /** YX-SD-18: every ticket goes through the same checks as a single edit, in its own transaction; failures are listed. */
  async bulk(a: DeskActor, ids: string[], action: BulkActionDto) {
    const done: string[] = [];
    const failed: { id: string; reason: string }[] = [];
    for (const id of ids) {
      try {
        await this.tx(a, async (tx) => {
          const { t, access } = await this.load(tx, a, id);
          if (access !== 'agent' || !canLead(a, t.deskId, 'desk.ticket.bulk')) throw new ForbiddenException('Only a team lead of this desk changes many tickets at once.');
          let cur = await this.applyIn(
            tx,
            a,
            t,
            {
              statusId: action.statusId,
              priority: action.priority,
              priorityReason: action.priorityReason,
              tags: action.addTags || action.removeTags ? t.tags.filter((x) => !(action.removeTags ?? []).includes(x)).concat((action.addTags ?? []).filter((x) => !t.tags.includes(x))) : undefined,
            },
            'Bulk change',
          );
          if (action.assignee !== undefined) cur = await this.assignIn(tx, a, cur, action.assignee === 'me' ? a.userId : action.assignee, undefined, 'Bulk change');
          if (action.scenarioId) await this.runScenarioIn(tx, a, cur, action.scenarioId);
        });
        done.push(id);
      } catch (e) {
        failed.push({ id, reason: (e as { response?: { message?: string } }).response?.message ?? (e instanceof NotFoundException ? 'No such ticket.' : 'Could not change it.') });
      }
    }
    return { done, failed };
  }

  // ------------------------------------------------------------------------------------------ shared bits

  async event(tx: Tx, t: Ticket, kind: string, from: string | null, to: string | null, o: { by: string | null; byPerson?: string | null; reason?: string | null; requesterVisible?: boolean }) {
    await tx.sdTicketEvent.create({
      data: { organizationId: t.organizationId, deskId: t.deskId, ticketId: t.id, kind, fromValue: from?.slice(0, 300) ?? null, toValue: to?.slice(0, 300) ?? null, reason: o.reason ?? null, requesterVisible: Boolean(o.requesterVisible), byUserId: o.by, byPersonId: o.byPerson ?? null },
    });
  }

  /** In-app (and per preference, email) notice. Neutral wording for sensitive and private tickets (YX-SD-14). */
  private async notify(a: DeskActor, n: Notice) {
    try {
      const neutral = n.ticket.sensitive || n.ticket.private;
      await this.notifications.notify(a.ctx, a.userId, n.to, n.type, {
        entityType: 'sd_ticket',
        entityId: n.ticket.id,
        contextText: neutral ? `Ticket ${n.ticket.number}` : `${n.ticket.number} · ${n.ticket.subject}`,
        linkPath: `/yx/desk/tickets/${n.ticket.id}`,
      });
    } catch (e) {
      this.logger.warn(`Desk notice not sent: ${(e as Error).message}`);
    }
  }

}
