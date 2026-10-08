import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { OrgSecretsCryptoService, TenantPrismaService } from '@exam-platform/shared';
import { Tx } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { NotificationsService } from '../notifications/notifications.service';
import { chooseAgent, isAvailable, onLeaveNow } from './assignment';
import { cleanHtml, htmlToText } from './rich-text';
import { PiiFound, maskPii, maskPiiHtml, unmaskHealth } from './pii';
import { SlaService } from './sla.service';
import { MailOutService } from './mail-out.service';
import { contactAccount, planFor, planUsedUp } from './customers.service';
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
  /** US-G-220: what the tickets linked to a tracker are told when it is solved. */
  linkedReplyHtml?: string | null;
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
  channel: 'portal' | 'agent' | 'api' | 'email';
  private?: boolean;
  tags?: string[];
  /** Who wrote the first message: the requester (portal) or an agent raising it for them. */
  side: 'requester' | 'agent';
  authorPersonId?: string | null;
  /** SD-1.09: a child of this ticket (side conversation with another team). */
  parentId?: string;
  /** SD-1.28: the customer account and product; the plan tier is read from the account's plan when not given. */
  customerAccountId?: string | null;
  productId?: string | null;
  /** SD-1.19: an email whose sender was not proven (§14.3). */
  senderVerified?: boolean;
  /** An email rule's priority (US-G-018). */
  priority?: number;
  /** Values parsed from the email by rules (US-G-018), and the screen the help drawer was opened on (US-B-100). */
  custom?: Record<string, string>;
  /** The first message's email Message-ID and inbound row (threading, "show original"). */
  emailMessageId?: string | null;
  inboundEmailId?: string | null;
  /** The plan check, worked out beforehand by a caller that cannot count the account's tickets itself (the portal). */
  usedUp?: boolean;
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
    readonly sla: SlaService,
    private readonly crypto: OrgSecretsCryptoService,
    readonly mailOut: MailOutService,
  ) {}

  // ------------------------------------------------------------------------------------------ PII (SD-1.12, YX-SD-15)

  /** Cleans rich text and masks personal data in it; the masked text is all that is ever stored in the message. */
  cleanMasked(html: string): { bodyHtml: string; bodyText: string; found: PiiFound[] } {
    const { html: bodyHtml, found } = maskPiiHtml(cleanHtml(html));
    return { bodyHtml, bodyText: htmlToText(bodyHtml), found };
  }

  /** The originals of masked values, encrypted, for a step-up unmask (each view audited). */
  async keepPii(tx: Tx, t: { organizationId: string; deskId: string; id: string }, messageId: string | null, found: PiiFound[]) {
    if (!found.length) return;
    await tx.sdSensitiveValue.createMany({ data: found.map((f, seq) => ({ organizationId: t.organizationId, deskId: t.deskId, ticketId: t.id, messageId, kind: f.kind, masked: f.masked.slice(0, 40), valueEncrypted: this.crypto.encrypt(f.value), seq })) });
  }

  tx<T>(a: { ctx: DeskActor['ctx'] }, fn: (tx: Tx) => Promise<T>) {
    return this.tenantPrisma.forTenant(a.ctx, fn);
  }

  // ------------------------------------------------------------------------------------------ creating

  /** The shared create path (portal, agent, API): numbering, routing, assignment, first message (YX-SD-01/03/04). */
  async createIn(tx: Tx, a: { ctx: DeskActor['ctx']; userId: string | null }, input: CreateInput): Promise<Ticket> {
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
    let priority = input.priority ?? (input.impact && input.urgency ? await this.matrix(tx, org, desk.id, input.impact, input.urgency) : null) ?? cat?.defaultPriority ?? 3;
    if (vip && desk.vipRaisesPriority) priority = Math.max(1, priority - 1);

    const [counter] = await tx.$queryRaw<{ n: bigint }[]>`
      UPDATE sd_counters SET next_number = next_number + 1
      WHERE organization_id = ${org}::uuid AND desk_id = ${desk.id}::uuid
      RETURNING next_number - 1 AS n`;
    if (!counter) throw new ConflictException('This desk has no ticket numbering. Ask the desk admin to check its settings.');
    const n = counter.n;
    const groupId = cat?.groupId ?? null;
    const assigneeUserId = groupId ? await this.pickAssignee(tx, org, desk.id, groupId) : null;
    const { bodyHtml, bodyText, found } = this.cleanMasked(input.bodyHtml);
    if (!bodyText) throw new BadRequestException('Describe the issue.');
    const subject = maskPii(input.subject);
    // SD-1.28: a customer desk ticket carries the contact's account and the account's plan tier as it is today.
    const accountId = desk.kind === 'customer_support' ? (input.customerAccountId !== undefined ? input.customerAccountId : await contactAccount(tx, org, input.requesterPersonId)) : null;
    const plan = accountId ? await planFor(tx, org, accountId) : null;
    if (input.productId && !(await tx.sdProduct.findFirst({ where: { organizationId: org, id: input.productId, active: true, OR: [{ deskId: null }, { deskId: desk.id }] }, select: { id: true } }))) {
      throw new BadRequestException('Choose a product of this desk.');
    }
    const usedUp = plan ? (input.usedUp ?? (await planUsedUp(tx, org, accountId!, plan))) : false;
    const holdState = usedUp && plan?.whenUsedUp === 'hold' ? await tx.sdStatus.findFirst({ where: { organizationId: org, deskId: desk.id, systemState: 'on_hold', active: true, OR: [{ ticketTypeId: type.id }, { ticketTypeId: null }] }, orderBy: [{ sortOrder: 'asc' }] }) : null;

    const t = await tx.sdTicket.create({
      data: {
        organizationId: org,
        deskId: desk.id,
        seq: n,
        number: `${desk.numberPrefix}${n}${desk.numberSuffix}`,
        typeId: type.id,
        statusId: holdState?.id ?? status.id,
        priority,
        impact: input.impact ?? null,
        urgency: input.urgency ?? null,
        categoryId: cat?.id ?? null,
        subject: subject.text,
        requesterPersonId: input.requesterPersonId,
        parentId: input.parentId ?? null,
        requestedForPersonId: input.requestedForPersonId ?? null,
        openedByUserId: input.openedByUserId,
        assigneeUserId,
        groupId,
        channel: input.channel,
        sensitive: Boolean(cat?.sensitive),
        private: Boolean(input.private),
        vip,
        tags: [...new Set([...(input.tags ?? []), ...(usedUp ? ['plan-used-up'] : [])])].slice(0, 20),
        custom: input.custom ?? {},
        customerAccountId: accountId,
        productId: input.productId ?? null,
        planTier: plan?.tier ?? null,
        senderVerified: input.senderVerified ?? true,
        createdBy: a.userId,
      },
    });
    const first = await tx.sdTicketMessage.create({
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
        emailMessageId: input.emailMessageId ?? null,
        inboundEmailId: input.inboundEmailId ?? null,
        senderVerified: input.senderVerified ?? true,
      },
    });
    await this.keepPii(tx, t, null, subject.found);
    await this.keepPii(tx, t, first.id, found);
    await this.event(tx, t, 'created', null, t.number, { by: a.userId, requesterVisible: true });
    if (assigneeUserId) await this.event(tx, t, 'assigned', null, assigneeUserId, { by: null, reason: 'Assigned automatically' });
    if (input.requestedForPersonId) await this.addWatcherIn(tx, a, t, input.requestedForPersonId, false);
    await emit(tx, org, 'helpdesk.ticket.created', { ticketId: t.id, deskId: desk.id, number: t.number, channel: input.channel });
    if (assigneeUserId) await emit(tx, org, 'helpdesk.ticket.assigned', { ticketId: t.id, deskId: desk.id, assigneeUserId });
    if (usedUp) await this.event(tx, t, 'plan_used_up', null, plan!.plan, { by: null, reason: plan!.whenUsedUp === 'hold' ? 'Held: the plan is used up' : 'The plan is used up' });
    await audit(tx, { ctx: a.ctx, userId: a.userId as string }, 'desk.ticket.created', 'sd_ticket', t.id, { number: t.number, deskId: desk.id, channel: input.channel, assigneeUserId, priority, vip, sensitive: t.sensitive, maskedValues: found.length + subject.found.length, accountId, planTier: plan?.tier ?? null, senderVerified: input.senderVerified ?? true });
    await this.sla.sync(tx, t.id);
    return tx.sdTicket.findUniqueOrThrow({ where: { id: t.id } });
  }

  /** An agent raises a ticket for a requester (§12.1 POST /tickets). */
  async createByAgent(a: DeskActor, dto: AgentCreateTicketDto) {
    requireWork(a, dto.deskId);
    const t = await this.tx(a, async (tx) => {
      for (const p of [dto.requesterPersonId, dto.requestedForPersonId]) {
        if (p && !(await this.deskPerson(tx, a, dto.deskId, p))) throw new BadRequestException('No such person in this company.');
      }
      return this.createIn(tx, a, {
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
      });
    });
    if (t.assigneeUserId) void this.notify(a, { type: 'helpdesk.ticket.assigned', to: [t.assigneeUserId], ticket: t });
    return { id: t.id, number: t.number };
  }

  /**
   * People an agent may raise for or add as followers: colleagues (an employee or a login of the company). Applicants and
   * other P01 persons are never reachable through the desk (customer contacts arrive with SD-1.28).
   */
  async internalPerson(tx: Tx, org: string, personId: string): Promise<boolean> {
    const [row] = await tx.$queryRaw<{ ok: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM persons p JOIN person_roles r ON r.organization_id = p.organization_id AND r.person_id = p.id
        WHERE p.organization_id = ${org}::uuid AND p.id = ${personId}::uuid AND p.status = 'active'
          AND r.role_type IN ('employee', 'login') AND (r.end_on IS NULL OR r.end_on >= (now() AT TIME ZONE 'Asia/Kolkata')::date)) AS ok`;
    return Boolean(row?.ok);
  }

  /**
   * SD-1.28: on a Customer support desk an agent also raises for (and adds as followers) the desk's outside contacts,
   * within the accounts the agent is limited to (US-G-037).
   */
  async deskPerson(tx: Tx, a: DeskActor, deskId: string, personId: string): Promise<boolean> {
    if (await this.internalPerson(tx, a.ctx.organizationId, personId)) return true;
    const desk = await tx.sdDesk.findFirst({ where: { organizationId: a.ctx.organizationId, id: deskId }, select: { kind: true } });
    if (desk?.kind !== 'customer_support') return false;
    const contacts = await tx.sdCustomerContact.findMany({ where: { organizationId: a.ctx.organizationId, personId, status: 'active' }, select: { accountId: true } });
    return contacts.some((c) => !a.accounts || (c.accountId !== null && a.accounts.includes(c.accountId)));
  }

  /** Name / email search over colleagues, plus outside contacts for agents of Customer support desks. */
  async searchPeople(a: DeskActor, search: string) {
    const org = a.ctx.organizationId;
    // LIKE wildcards typed by the agent are matched literally.
    const like = `%${search.replace(/[\\%_]/g, (c) => '\\' + c)}%`;
    return this.tx(a, async (tx) => {
      const customerSeat = (await tx.sdDesk.findMany({ where: { organizationId: org, kind: 'customer_support' }, select: { id: true } })).some((d) => ['agent', 'lead'].includes(a.roles.get(d.id) ?? ''));
      const outside = customerSeat && search ? await this.searchContacts(tx, a, like) : [];
      const rows = await tx.$queryRaw<{ id: string; given_name: string; family_name: string | null; preferred_name: string | null; primary_email: string | null }[]>`
        SELECT p.id, p.given_name, p.family_name, p.preferred_name, p.primary_email FROM persons p
        WHERE p.organization_id = ${org}::uuid AND p.status = 'active'
          AND EXISTS (SELECT 1 FROM person_roles r WHERE r.organization_id = p.organization_id AND r.person_id = p.id
                      AND r.role_type IN ('employee', 'login') AND (r.end_on IS NULL OR r.end_on >= (now() AT TIME ZONE 'Asia/Kolkata')::date))
          AND (${search} = '' OR p.given_name ILIKE ${like} OR p.family_name ILIKE ${like} OR p.primary_email::text ILIKE ${like})
        ORDER BY p.given_name, p.family_name LIMIT 20`;
      return [...rows.map((p) => ({ id: p.id, name: [p.preferred_name || p.given_name, p.family_name].filter(Boolean).join(' '), email: p.primary_email, customer: false })), ...outside].slice(0, 30);
    });
  }

  private async searchContacts(tx: Tx, a: DeskActor, like: string) {
    const rows = await tx.$queryRaw<{ id: string; given_name: string; family_name: string | null; primary_email: string | null; account_id: string | null }[]>`
      SELECT p.id, p.given_name, p.family_name, p.primary_email, c.account_id FROM persons p
      JOIN sd_customer_contacts c ON c.organization_id = p.organization_id AND c.person_id = p.id AND c.status = 'active'
      WHERE p.organization_id = ${a.ctx.organizationId}::uuid AND p.status = 'active'
        AND (p.given_name ILIKE ${like} OR p.family_name ILIKE ${like} OR p.primary_email::text ILIKE ${like})
      ORDER BY p.given_name, p.family_name LIMIT 20`;
    const seen = new Set<string>();
    return rows
      .filter((c) => !a.accounts || (c.account_id !== null && a.accounts.includes(c.account_id)))
      .filter((c) => !seen.has(c.id) && Boolean(seen.add(c.id)))
      .map((p) => ({ id: p.id, name: [p.given_name, p.family_name].filter(Boolean).join(' '), email: p.primary_email, customer: true }));
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
    // ponytail: counted under the caller's own visibility (§5.7), so a requester's raise does not count sensitive tickets
    // they cannot see; load balancing is then slightly off for them. A counts-only SQL function fixes it if it matters.
    const counts = await tx.sdTicket.groupBy({ by: ['assigneeUserId'], where: { organizationId: org, assigneeUserId: { in: free }, systemState: { in: OPEN_STATES } }, _count: { _all: true } });
    const open = new Map(counts.map((c) => [c.assigneeUserId!, c._count._all]));
    const chosen = chooseAgent(group.assignment_method as 'round_robin' | 'load', free.map((userId) => ({ userId, open: open.get(userId) ?? 0 })), group.last_assigned_user_id, group.max_open_per_agent);
    if (chosen) await tx.sdGroup.update({ where: { id: groupId }, data: { lastAssignedUserId: chosen } });
    return chosen;
  }

  /**
   * US-G-011 approved leave from YukthiX HR (M02). Founder decision 8 Oct 2026: a half-day leave makes the agent away
   * only for that half (before or after 13:00 in the agent's shift zone, India time when no shift is set). M02 leave is
   * not built yet, so leaveToday() returns nothing; when it lands, only that seam changes.
   */
  private async onApprovedLeave(tx: Tx, org: string, userIds: string[], now: Date): Promise<Set<string>> {
    const leave = await this.leaveToday(tx, org, userIds, now);
    const zones = new Map((await tx.sdAgentStatus.findMany({ where: { organizationId: org, userId: { in: userIds } }, select: { userId: true, shiftTimeZone: true } })).map((s) => [s.userId, s.shiftTimeZone]));
    return new Set(leave.filter((l) => onLeaveNow(l.part, zones.get(l.userId) ?? 'Asia/Kolkata', now)).map((l) => l.userId));
  }

  /** Seam until M02: approved leave covering today, per agent, as a full day or one half. */
  async leaveToday(_tx: Tx, _org: string, _userIds: string[], _now: Date): Promise<{ userId: string; part: 'full' | 'first' | 'second' }[]> {
    return [];
  }

  // ------------------------------------------------------------------------------------------ reading

  async load(tx: Tx, a: DeskActor, id: string): Promise<{ t: Ticket; access: TicketAccess }> {
    const t = await tx.sdTicket.findFirst({ where: { organizationId: a.ctx.organizationId, id } });
    const access = t ? await ticketAccess(tx, a, t) : null;
    if (!t || !access) throw new NotFoundException('No such ticket.');
    return { t, access };
  }

  /** The agent's (or collaborator's, or desk admin's read-only) view of one ticket. */
  /**
   * YX-SD-17 / US-G-030 read log: who opened which ticket, when and from where, one row per viewer and ticket per 30
   * minutes. Opening a sensitive or private ticket also writes its audit row (batch 1), now on the same 30-minute rule.
   */
  async logRead(tx: Tx, a: DeskActor, t: Ticket, access: TicketAccess | 'export', ip?: string | null) {
    const recent = await tx.sdTicketRead.findFirst({ where: { organizationId: a.ctx.organizationId, ticketId: t.id, userId: a.userId, readAt: { gt: new Date(Date.now() - 30 * 60_000) } }, select: { id: true } });
    if (recent) return;
    await tx.sdTicketRead.create({ data: { organizationId: a.ctx.organizationId, deskId: t.deskId, ticketId: t.id, userId: a.userId, access, ip: ip?.slice(0, 45) ?? null } });
    if (t.sensitive || t.private) await audit(tx, a, 'desk.ticket.opened', 'sd_ticket', t.id, { number: t.number, access });
  }

  async get(a: DeskActor, id: string, ip?: string | null) {
    return this.tx(a, async (tx) => {
      const { t, access } = await this.load(tx, a, id);
      const org = a.ctx.organizationId;
      await this.logRead(tx, a, t, access, ip);
      const [messages, attachments, watchers, collaborators, time, desk, type, status, cat, group] = await Promise.all([
        // Merged tickets' conversations stay on the surviving ticket (YX-SD-08); side threads have their own panel.
        tx.sdTicketMessage.findMany({ where: { organizationId: org, ticketId: { in: [t.id, ...(await this.mergedIds(tx, org, t.id))] }, kind: { not: 'side' } }, orderBy: { createdAt: 'asc' } }),
        tx.sdAttachment.findMany({ where: { organizationId: org, ticketId: { in: [t.id, ...(await this.mergedIds(tx, org, t.id))] } }, orderBy: { createdAt: 'asc' } }),
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
      const health = await this.healthWords(tx, a, t, desk.kind, access);
      const [account, product] = await Promise.all([
        t.customerAccountId ? tx.sdCustomerAccount.findFirst({ where: { organizationId: org, id: t.customerAccountId }, select: { id: true, name: true } }) : null,
        t.productId ? tx.sdProduct.findFirst({ where: { organizationId: org, id: t.productId }, select: { id: true, name: true } }) : null,
      ]);
      return {
        ...this.summary(t),
        subject: health.get('subject') ? unmaskHealth(t.subject, health.get('subject')!) : t.subject,
        customer: account ? { account, plan: t.planTier } : null,
        product,
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
          fromTicketId: m.ticketId === t.id ? null : m.ticketId,
          kind: m.kind,
          side: m.side,
          author: who(m),
          mine: m.authorUserId === a.userId,
          bodyHtml: health.get(m.id) ? unmaskHealth(m.bodyHtml, health.get(m.id)!) : m.bodyHtml,
          channel: m.channel,
          senderVerified: m.senderVerified,
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

  /**
   * Founder decision 8 Oct 2026: on an HR desk the desk's own agents see health words on a ticket that is already
   * restricted (sensitive or private). Nobody else, and never Aadhaar, PAN, card, bank or passwords. Per message id
   * ('subject' for the subject), the original words in order.
   */
  private async healthWords(tx: Tx, a: DeskActor, t: Ticket, deskKind: string, access: TicketAccess): Promise<Map<string, string[]>> {
    const out = new Map<string, string[]>();
    if (deskKind !== 'hr' || access !== 'agent' || !(t.sensitive || t.private) || !canWork(a, t.deskId)) return out;
    const rows = await tx.sdSensitiveValue.findMany({ where: { organizationId: a.ctx.organizationId, ticketId: t.id, kind: 'health' }, orderBy: [{ createdAt: 'asc' }, { seq: 'asc' }] });
    // An edited note or subject was masked again: only its latest batch matches the text stored now.
    const latest = new Map<string, number>();
    for (const r of rows) latest.set(r.messageId ?? 'subject', r.createdAt.getTime());
    for (const r of rows) {
      const k = r.messageId ?? 'subject';
      if (r.createdAt.getTime() === latest.get(k)) out.set(k, [...(out.get(k) ?? []), this.crypto.decrypt(r.valueEncrypted)]);
    }
    return out;
  }

  /** Tickets merged into this one (their messages and files stay theirs, shown here). */
  async mergedIds(tx: Tx, org: string, id: string): Promise<string[]> {
    return (await tx.sdTicket.findMany({ where: { organizationId: org, mergedIntoId: id }, select: { id: true } })).map((x) => x.id);
  }

  summary(t: Ticket) {
    return {
      id: t.id,
      tier: t.tier,
      parentId: t.parentId,
      mergedIntoId: t.mergedIntoId,
      tracker: t.tracker,
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
      customerAccountId: t.customerAccountId,
      productId: t.productId,
      planTier: t.planTier,
      senderVerified: t.senderVerified,
      screen: (t.custom as Record<string, unknown>)?.screen ?? null,
      fields: t.custom,
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
      if ((s.systemState === 'solved' || s.systemState === 'closed') && OPEN_STATES.includes(t.systemState)) await this.checkResolvable(tx, t, c);
      if (s.systemState === 'solved' && t.systemState !== 'solved') {
        data.resolvedAt = new Date();
        data.resolvedTier = t.tier;
      }
      if (s.systemState === 'closed') data.closedAt = new Date();
      if (wasDone && OPEN_STATES.includes(s.systemState)) {
        data.reopenCount = { increment: 1 };
        data.resolvedAt = null;
        data.closedAt = null;
      }
    }
    if (c.subject !== undefined && c.subject !== t.subject) {
      // YX-SD-15: personal data in a new subject is masked like message text (review fix).
      const masked = maskPii(c.subject);
      data.subject = masked.text;
      await this.keepPii(tx, t, null, masked.found);
      // A sensitive or private ticket's subject is never copied into the timeline or the audit log.
      const hide = t.sensitive || t.private;
      log.push(['subject_changed', hide ? null : t.subject, hide ? null : masked.text, true]);
    }
    if (c.categoryId !== undefined && c.categoryId !== t.categoryId) {
      const cat = c.categoryId ? await this.category(tx, org, t.deskId, c.categoryId, true) : null;
      if (t.sensitive && !cat?.sensitive) this.requireLead(a, t, 'Only a team lead moves a sensitive ticket out of its sensitive category.');
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
      if (!c.private) this.requireLead(a, t, 'Only a team lead makes a private ticket visible to more people.');
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
    // A status, priority, category, type or group change can pause, resume, stop or re-target SLA timers (§8.3).
    await this.sla.sync(tx, t.id);
    if (state === 'solved' && after.tracker && t.systemState !== 'solved') await this.solveTracked(tx, a, after, c.linkedReplyHtml ?? null);
    return tx.sdTicket.findUniqueOrThrow({ where: { id: t.id } });
  }

  /**
   * YX-SD-11 and US-G-006: resolving needs every task done or cancelled, and a resolution code and note when the desk
   * asks for them (codes from the desk's own list).
   */
  private async checkResolvable(tx: Tx, t: Ticket, c: Changes) {
    const org = t.organizationId;
    const open = await tx.sdTask.count({ where: { organizationId: org, ticketId: t.id, state: { in: ['open', 'in_progress'] } } });
    if (open) throw new ConflictException({ statusCode: 409, code: 'TASKS_OPEN', message: `Finish or cancel the ${open} open task${open > 1 ? 's' : ''} first.` });
    const desk = await tx.sdDesk.findFirstOrThrow({ where: { organizationId: org, id: t.deskId }, select: { resolutionRequired: true } });
    const code = c.resolutionCode !== undefined ? c.resolutionCode : t.resolutionCode;
    const note = c.resolutionNote !== undefined ? c.resolutionNote : t.resolutionNote;
    if (code && !(await tx.sdResolutionCode.findFirst({ where: { organizationId: org, deskId: t.deskId, code, active: true }, select: { id: true } }))) throw new BadRequestException('Choose a resolution code of this desk.');
    if (desk.resolutionRequired && (!code || !note?.trim())) throw new BadRequestException({ statusCode: 400, code: 'RESOLUTION_REQUIRED', message: 'This desk needs a resolution code and a note to resolve a ticket.' });
  }

  /**
   * US-G-220: when a tracker is solved, every open ticket linked to it gets one reply and is solved too (a reply from
   * its requester reopens it). Only tickets on the tracker's own desk are linked (the solving agent answers them).
   */
  private async solveTracked(tx: Tx, a: DeskActor, tracker: Ticket, html: string | null) {
    const org = tracker.organizationId;
    const links = await tx.sdTicketLink.findMany({ where: { organizationId: org, toTicketId: tracker.id, kind: 'tracked_by' } });
    const text = html && htmlToText(cleanHtml(html)) ? html : `<p>Good news: the problem you reported (${tracker.number}) is fixed. Reply here if you still see it.</p>`;
    for (const l of links) {
      let linked = await tx.sdTicket.findFirst({ where: { organizationId: org, id: l.fromTicketId, deskId: tracker.deskId, systemState: { in: OPEN_STATES } } });
      if (!linked) continue;
      const { bodyHtml, bodyText, found } = this.cleanMasked(text);
      const m = await tx.sdTicketMessage.create({ data: { organizationId: org, deskId: linked.deskId, ticketId: linked.id, kind: 'reply', side: 'agent', authorUserId: a.userId, bodyHtml, bodyText, channel: 'agent' } });
      await this.keepPii(tx, linked, m.id, found);
      await this.mailOut.queueReply(org, linked.id, m.id);
      if (!linked.firstResponseAt) linked = await tx.sdTicket.update({ where: { id: linked.id }, data: { firstResponseAt: new Date() } });
      const solved = await this.firstStatus(tx, org, linked.deskId, linked.typeId, 'solved');
      await this.applyIn(tx, a, linked, { statusId: solved.id, resolutionCode: tracker.resolutionCode, resolutionNote: tracker.resolutionNote }, `Tracker ${tracker.number} solved`);
    }
  }

  private requireLead(a: DeskActor, t: Ticket, message: string) {
    if (a.roles.get(t.deskId) !== 'lead') throw new ForbiddenException(message);
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
      const after = await this.applyIn(tx, a, t, { typeId: dto.typeId }, dto.reason ?? 'Type changed');
      // YX-SD-09: response targets start again under the new type.
      await this.sla.restart(tx, t.id, 'Ticket type changed');
      return this.summary(after);
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
    await this.sla.sync(tx, t.id);
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
      if (t.mergedIntoId) throw new ConflictException('This ticket was merged. Write on the ticket it was merged into.');
      const { bodyHtml, bodyText, found } = this.cleanMasked(dto.bodyHtml);
      if (!bodyText) throw new BadRequestException('Write a message first.');
      const mentions = dto.kind === 'note' ? await this.mentionable(tx, a, t, access, dto.mentions ?? []) : [];
      const m = await tx.sdTicketMessage.create({
        data: { organizationId: org, deskId: t.deskId, ticketId: t.id, kind: dto.kind, side: 'agent', authorUserId: a.userId, bodyHtml, bodyText, mentions, channel: 'agent' },
      });
      await this.keepPii(tx, t, m.id, found);
      await this.attach(tx, a, t, m.id, dto.attachmentIds ?? []);
      let after = t;
      if (dto.kind === 'reply' && !t.firstResponseAt) after = await tx.sdTicket.update({ where: { id: t.id }, data: { firstResponseAt: new Date() } });
      if (dto.statusId) {
        if (access !== 'agent' || !canWork(a, t.deskId)) throw new ForbiddenException(SEAT_REQUIRED);
        after = await this.applyIn(tx, a, after, { statusId: dto.statusId });
      }
      // A reply meets the first / next response targets.
      if (dto.kind === 'reply') await this.sla.sync(tx, t.id);
      await emit(tx, org, dto.kind === 'reply' ? 'helpdesk.ticket.replied' : 'helpdesk.ticket.note_added', { ticketId: t.id, deskId: t.deskId, messageId: m.id });
      await audit(tx, a, dto.kind === 'reply' ? 'desk.ticket.replied' : 'desk.ticket.note_added', 'sd_ticket', t.id, { number: t.number, messageId: m.id, attachments: dto.attachmentIds?.length ?? 0, mentions });
      if (mentions.length) notices.push({ type: 'helpdesk.note.mention', to: mentions, ticket: after });
      return { id: m.id, ticket: this.summary(after) };
    });
    for (const n of notices) void this.notify(a, n);
    // SD-1.18: the requester of an email ticket (or an outside contact) hears by email, once the reply is committed.
    if (dto.kind === 'reply') await this.mailOut.queueReply(a.ctx.organizationId, result.ticket.id, result.id);
    return result;
  }

  /**
   * People who may be mentioned: anyone with a seat on the desk or already on the record. A mentioned desk collaborator
   * is added to the record, which is how a collaborator reaches it (§5.2).
   */
  private async mentionable(tx: Tx, a: DeskActor, t: Ticket, access: TicketAccess, ids: string[]): Promise<string[]> {
    if (!ids.length) return [];
    const org = a.ctx.organizationId;
    const seats = await tx.sdDeskMember.findMany({ where: { organizationId: org, deskId: t.deskId, userId: { in: ids }, ...activeOn(todayIst()) }, select: { userId: true, role: true } });
    const collabs = await tx.sdTicketCollaborator.findMany({ where: { organizationId: org, ticketId: t.id, userId: { in: ids } }, select: { userId: true } });
    // An agent may bring desk colleagues in; a collaborator may only mention people who already see the ticket.
    const onTicket = seats.filter((s) => s.role === 'agent' || s.role === 'lead').map((s) => s.userId);
    const ok = new Set([...(access === 'agent' ? seats.map((s) => s.userId) : onTicket), ...collabs.map((c) => c.userId)]);
    const bad = ids.filter((u) => !ok.has(u));
    if (bad.length) throw new BadRequestException(access === 'agent' ? 'You can mention only people on this desk or on this ticket.' : 'You can mention only people already on this ticket.');
    if (access !== 'agent') return ids;
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
      const { bodyHtml, bodyText, found } = this.cleanMasked(dto.bodyHtml);
      if (!bodyText) throw new BadRequestException('Write the note first.');
      await tx.sdTicketMessage.update({ where: { id: m.id }, data: { bodyHtml, bodyText, editedAt: new Date() } });
      await this.keepPii(tx, t, m.id, found);
      await audit(tx, a, 'desk.ticket.note_edited', 'sd_ticket', t.id, { messageId: m.id, beforeLength: m.bodyText.length, afterLength: bodyText.length });
      return { id: m.id };
    });
  }

  // ------------------------------------------------------------------------------------------ watchers, collaborators (SD-1.04)

  async addWatcherIn(tx: Tx, a: { ctx: DeskActor['ctx']; userId?: string | null }, t: Ticket, personId: string, fromRequester: boolean, addedByPersonId?: string) {
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
      if (!(await this.deskPerson(tx, a, t.deskId, dto.personId!))) throw new BadRequestException('No such person in this company.');
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
      const clean = this.cleanMasked(html);
      const m = await tx.sdTicketMessage.create({ data: { organizationId: a.ctx.organizationId, deskId: t.deskId, ticketId: t.id, kind, side: 'agent', authorUserId: a.userId, bodyHtml: clean.bodyHtml, bodyText: clean.bodyText, channel: 'agent' } });
      await this.keepPii(tx, t, m.id, clean.found);
      if (kind === 'reply') await this.mailOut.queueReply(a.ctx.organizationId, t.id, m.id);
      if (kind === 'reply' && !cur.firstResponseAt) cur = await tx.sdTicket.update({ where: { id: t.id }, data: { firstResponseAt: new Date() } });
    }
    if (x.reply) await this.sla.sync(tx, t.id);
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
