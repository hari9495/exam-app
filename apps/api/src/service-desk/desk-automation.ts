import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantPrismaService } from '@exam-platform/shared';
import { NotificationsService } from '../notifications/notifications.service';
import { Tx } from '../org-structure/org-structure.service';
import { FieldDef, RuleError } from '../rules-engine/conditions';
import { Action, AutomationService, Loaded, RecordTypeHandler, RuleInput, Trigger } from '../rules-engine/automation.service';
import { CatalogService, deskRobot } from './catalog.service';
import { DeskActor, audit, emit, has, requireDesk, requireSetUp } from './desk-access';
import { RuleDto, UpdateRuleDto } from './dto-esm';
import { OPEN_STATES, TicketsService } from './tickets.service';

// SD-2.12: desk automation on the shared P19 engine. The desk registers the record type "desk.ticket": the fields a
// rule may read (allow-listed, with the desk's own categories, types, statuses and teams as choices), the triggers
// (created, updated, assigned, and two time triggers), how to load a ticket, and its actions (assign, set a field, add a
// tag, notify, escalate, create a task; webhooks are the engine's). Rules are per desk; setting them up needs
// desk.rule.manage and the desk admin role on that desk (webhooks also desk.integration.manage).

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TAG = /^[\p{L}\p{N}][\p{L}\p{N} _-]{0,39}$/u;
const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const only = (a: Record<string, unknown>, keys: string[]) => {
  for (const k of Object.keys(a)) if (!keys.includes(k)) throw new RuleError(`An action has an unknown part "${k.slice(0, 20)}".`);
};
const yesNo = [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }];

export const DESK_TICKET = 'desk.ticket';

/** Ready rules shipped in code (US-G-051), installed as editable drafts. Ids of the desk are filled in at install. */
export const RECIPES = [
  { key: 'payroll_to_payroll_team', name: 'Payroll questions go to the payroll team', description: 'When a ticket in a payslip or pay category arrives, give it to the payroll team.' },
  { key: 'urgent_tell_leads', name: 'Tell the leads about urgent tickets', description: 'When a ticket is raised or changed to priority 1, the desk leads get a message.' },
  { key: 'idle_escalate', name: 'Escalate tickets with no update for a day', description: 'An open ticket with no change for 24 hours moves to L2.' },
  { key: 'vip_priority', name: 'VIP requesters get priority 2', description: 'When a VIP raises a ticket with priority 3 or 4, raise it to 2.' },
] as const;

@Injectable()
export class DeskAutomation implements RecordTypeHandler, OnModuleInit {
  readonly key = DESK_TICKET;
  readonly module = 'desk';
  readonly triggers = [
    { key: 'created', label: 'A ticket is raised' },
    { key: 'updated', label: 'A ticket is changed' },
    { key: 'assigned', label: 'A ticket is assigned' },
    { key: 'idle', label: 'An open ticket has no change for some hours', time: true },
    { key: 'open_for', label: 'A ticket is still open some hours after it was raised', time: true },
  ];
  private readonly logger = new Logger(DeskAutomation.name);

  constructor(
    private readonly engine: AutomationService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly tickets: TicketsService,
    private readonly catalog: CatalogService,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit() {
    this.engine.register(this);
  }

  // ------------------------------------------------------------------------------------------ the record type

  async fields(tx: Tx, org: string, deskId: string | null): Promise<FieldDef[]> {
    const where = { organizationId: org, deskId: deskId ?? '00000000-0000-0000-0000-000000000000' };
    const [cats, types, groups, items, depts, locs] = await Promise.all([
      tx.sdCategory.findMany({ where: { ...where, active: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
      tx.sdTicketType.findMany({ where: { ...where, active: true }, select: { id: true, name: true } }),
      tx.sdGroup.findMany({ where: { ...where, active: true }, select: { id: true, name: true } }),
      tx.sdCatalogItem.findMany({ where: { ...where }, select: { id: true, name: true } }),
      tx.department.findMany({ where: { organizationId: org, archivedAt: null }, select: { id: true, name: true } }),
      tx.location.findMany({ where: { organizationId: org, archivedAt: null }, select: { id: true, name: true } }),
    ]);
    const o = (rows: { id: string; name: string }[]) => rows.map((r) => ({ value: r.id, label: r.name }));
    return [
      { key: 'category', label: 'Category', type: 'choice', options: o(cats) },
      { key: 'type', label: 'Ticket type', type: 'choice', options: o(types) },
      { key: 'state', label: 'Status', type: 'choice', options: ['new', 'open', 'pending', 'on_hold', 'solved', 'closed'].map((v) => ({ value: v, label: { new: 'New', open: 'In progress', pending: 'Waiting on requester', on_hold: 'On hold', solved: 'Resolved', closed: 'Closed' }[v]! })) },
      { key: 'priority', label: 'Priority (1 highest)', type: 'number' },
      { key: 'group', label: 'Team', type: 'choice', options: o(groups) },
      { key: 'assigned', label: 'Has an owner', type: 'choice', options: yesNo },
      { key: 'tier', label: 'Tier', type: 'choice', options: ['L1', 'L2', 'L3'].map((v) => ({ value: v, label: v })) },
      { key: 'channel', label: 'Came in by', type: 'choice', options: [{ value: 'portal', label: 'Help centre' }, { value: 'email', label: 'Email' }, { value: 'agent', label: 'An agent' }, { value: 'api', label: 'API' }] },
      { key: 'subject', label: 'Subject', type: 'text' },
      { key: 'tags', label: 'Tags', type: 'text' },
      { key: 'vip', label: 'Requester is a VIP', type: 'choice', options: yesNo },
      { key: 'sensitive', label: 'Sensitive', type: 'choice', options: yesNo },
      { key: 'catalog_item', label: 'Ordered item', type: 'choice', options: o(items) },
      { key: 'requester.department', label: 'Requester department', type: 'choice', options: o(depts) },
      { key: 'requester.location', label: 'Requester location', type: 'choice', options: o(locs) },
      { key: 'hours_since_update', label: 'Hours since the last change', type: 'number' },
      { key: 'hours_open', label: 'Hours since it was raised', type: 'number' },
    ];
  }

  fromEvent(type: string, p: Record<string, unknown>) {
    const id = typeof p.ticketId === 'string' && UUID.test(p.ticketId) ? p.ticketId : null;
    if (!id) return null;
    if (type === 'helpdesk.ticket.created') return { recordId: id, trigger: 'created' };
    if (type === 'helpdesk.ticket.assigned') return { recordId: id, trigger: 'assigned', changed: ['assigned'] };
    if (type === 'helpdesk.ticket.updated') return { recordId: id, trigger: 'updated', changed: Array.isArray(p.fields) ? p.fields.filter((f): f is string => typeof f === 'string') : [] };
    return null;
  }

  async system(tx: Tx) {
    await tx.$executeRaw`SELECT set_config('app.sd_system', 'on', true)`;
  }

  async load(tx: Tx, org: string, id: string): Promise<Loaded | null> {
    const t = await tx.sdTicket.findFirst({ where: { organizationId: org, id, mergedIntoId: null } });
    if (!t) return null;
    const profile = await this.catalog.profileOf(tx, org, t.requestedForPersonId ?? t.requesterPersonId);
    const items = await tx.sdRequestItem.findMany({ where: { organizationId: org, ticketId: t.id }, select: { itemId: true } });
    const now = Date.now();
    return {
      scopeId: t.deskId,
      hide: t.sensitive || t.private,
      label: t.number,
      values: {
        category: t.categoryId,
        type: t.typeId,
        state: t.systemState,
        priority: t.priority,
        group: t.groupId,
        assigned: t.assigneeUserId ? 'yes' : 'no',
        tier: t.tier,
        channel: t.channel,
        subject: t.subject,
        tags: t.tags,
        vip: t.vip ? 'yes' : 'no',
        sensitive: t.sensitive ? 'yes' : 'no',
        catalog_item: items.map((i) => i.itemId),
        'requester.department': profile['requester.department'] ?? null,
        'requester.location': profile['requester.location'] ?? null,
        hours_since_update: Math.floor((now - t.updatedAt.getTime()) / 3_600_000),
        hours_open: Math.floor((now - t.createdAt.getTime()) / 3_600_000),
      },
    };
  }

  async parseAction(tx: Tx, org: string, deskId: string | null, a: Record<string, unknown>): Promise<Action> {
    const desk = { organizationId: org, deskId: deskId ?? '' };
    const group = async (id: unknown) => {
      if (typeof id !== 'string' || !(await tx.sdGroup.findFirst({ where: { ...desk, id, active: true }, select: { id: true } }))) throw new RuleError('Choose a team of this desk.');
      return id;
    };
    switch (a.type) {
      case 'assign': {
        only(a, ['type', 'groupId', 'userId']);
        if (!a.groupId && !a.userId) throw new RuleError('Choose a team or a person to assign to.');
        const out: Action = { type: 'assign' };
        if (a.groupId) out.groupId = await group(a.groupId);
        if (a.userId) {
          if (typeof a.userId !== 'string' || !(await this.tickets.seatHeld(tx, org, desk.deskId, a.userId))) throw new RuleError('Choose an agent of this desk.');
          out.userId = a.userId;
        }
        return out;
      }
      case 'set_field': {
        only(a, ['type', 'field', 'value']);
        if (a.field === 'priority') {
          if (!Number.isInteger(a.value) || (a.value as number) < 1 || (a.value as number) > 4) throw new RuleError('Priority is 1 to 4.');
          return { type: 'set_field', field: 'priority', value: a.value };
        }
        const table = a.field === 'category' ? tx.sdCategory : a.field === 'type' ? tx.sdTicketType : a.field === 'status' ? tx.sdStatus : null;
        if (!table || typeof a.value !== 'string' || !UUID.test(a.value)) throw new RuleError('Choose a field (priority, category, type or status) and its new value.');
        const ok = await (table as unknown as { findFirst(q: unknown): Promise<unknown> }).findFirst({ where: { ...desk, id: a.value, active: true }, select: { id: true } });
        if (!ok) throw new RuleError(`Choose a ${a.field} of this desk.`);
        return { type: 'set_field', field: a.field, value: a.value };
      }
      case 'add_tag':
        only(a, ['type', 'tag']);
        if (typeof a.tag !== 'string' || !TAG.test(a.tag.trim())) throw new RuleError('A tag is 1 to 40 letters, digits, spaces, _ or -.');
        return { type: 'add_tag', tag: a.tag.trim() };
      case 'notify': {
        only(a, ['type', 'to', 'userId', 'message']);
        if (!['assignee', 'group', 'leads', 'user'].includes(a.to as string)) throw new RuleError('Choose who gets the message.');
        const message = typeof a.message === 'string' ? a.message.trim() : '';
        if (!message || message.length > 300) throw new RuleError('Write the message (up to 300 characters).');
        const out: Action = { type: 'notify', to: a.to, message };
        if (a.to === 'user') {
          if (typeof a.userId !== 'string' || !(await tx.sdDeskMember.findFirst({ where: { ...desk, userId: a.userId, validTo: null }, select: { id: true } }))) throw new RuleError('Choose someone with a seat on this desk.');
          out.userId = a.userId;
        }
        return out;
      }
      case 'escalate': {
        only(a, ['type', 'tier', 'groupId']);
        if (a.tier !== 'L2' && a.tier !== 'L3') throw new RuleError('Escalate to L2 or L3.');
        return { type: 'escalate', tier: a.tier, ...(a.groupId ? { groupId: await group(a.groupId) } : {}) };
      }
      case 'create_task': {
        only(a, ['type', 'title', 'groupId', 'olaHours']);
        const title = typeof a.title === 'string' ? a.title.trim() : '';
        if (!title || title.length > 200) throw new RuleError('Name the task (up to 200 characters).');
        if (a.olaHours !== undefined && (!Number.isInteger(a.olaHours) || (a.olaHours as number) < 1 || (a.olaHours as number) > 720)) throw new RuleError('The task time is 1 to 720 hours.');
        return { type: 'create_task', title, ...(a.groupId ? { groupId: await group(a.groupId) } : {}), ...(a.olaHours ? { olaHours: a.olaHours } : {}) };
      }
      default:
        throw new RuleError('Choose what each action does.');
    }
  }

  async execute(tx: Tx, org: string, id: string, a: Action, rule: { id: string; name: string }): Promise<string> {
    let t = await tx.sdTicket.findFirstOrThrow({ where: { organizationId: org, id } });
    const robot = deskRobot({ ctx: { organizationId: org, isSuperAdmin: false } }, t.deskId);
    const why = `Rule "${rule.name}"`;
    switch (a.type) {
      case 'assign': {
        // An agent picked earlier may have lost their seat since: then only the team is set.
        const user = a.userId && (await this.tickets.seatHeld(tx, org, t.deskId, a.userId as string)) ? (a.userId as string) : undefined;
        if (a.groupId && a.groupId !== t.groupId) t = await this.tickets.applyIn(tx, robot, t, { groupId: a.groupId as string }, why);
        const owner = user ?? (a.groupId ? await this.tickets.pickAssignee(tx, org, t.deskId, a.groupId as string) : null);
        if (owner && owner !== t.assigneeUserId) t = await this.tickets.assignIn(tx, robot, t, owner, undefined, why);
        return `Team ${a.groupId ? 'set' : 'kept'}${owner ? ', owner set' : ''}`;
      }
      case 'set_field': {
        // §5.7: a rule never takes a sensitive ticket out of its sensitive category (that would show it to more people).
        if (a.field === 'category' && t.sensitive) {
          const to = await tx.sdCategory.findFirst({ where: { organizationId: org, deskId: t.deskId, id: a.value as string }, select: { sensitive: true } });
          if (!to?.sensitive) return 'Not changed: a rule keeps a sensitive ticket in a sensitive category';
        }
        const c = a.field === 'priority' ? { priority: a.value as number, priorityReason: why } : a.field === 'category' ? { categoryId: a.value as string } : a.field === 'type' ? { typeId: a.value as string } : { statusId: a.value as string };
        await this.tickets.applyIn(tx, robot, t, c, why);
        return `${a.field} set`;
      }
      case 'add_tag':
        if (t.tags.includes(a.tag as string)) return 'Tag already there';
        await this.tickets.applyIn(tx, robot, t, { tags: [...t.tags, a.tag as string] }, why);
        return `Tag "${a.tag}" added`;
      case 'escalate': {
        if (t.tier === a.tier && !a.groupId) return `Already at ${a.tier}`;
        await tx.sdTicket.update({ where: { id: t.id }, data: { tier: a.tier as string, version: { increment: 1 } } });
        await this.tickets.event(tx, t, 'tier_changed', t.tier, a.tier as string, { by: null, reason: why });
        await emit(tx, org, 'helpdesk.ticket.escalated', { ticketId: t.id, deskId: t.deskId, from: t.tier, to: a.tier });
        if (a.groupId && a.groupId !== t.groupId) await this.tickets.applyIn(tx, robot, await tx.sdTicket.findFirstOrThrow({ where: { id: t.id } }), { groupId: a.groupId as string }, why);
        await audit(tx, robot, 'desk.ticket.escalated', 'sd_ticket', t.id, { from: t.tier, to: a.tier, rule: rule.id });
        return `Escalated to ${a.tier}`;
      }
      case 'create_task': {
        const k = await tx.sdTask.create({ data: { organizationId: org, deskId: t.deskId, ticketId: t.id, title: a.title as string, groupId: (a.groupId as string | undefined) ?? null, dueAt: a.olaHours ? new Date(Date.now() + (a.olaHours as number) * 3_600_000) : null } });
        await this.tickets.event(tx, t, 'task_added', null, k.title.slice(0, 100), { by: null, reason: why });
        await this.tickets.sla.sync(tx, t.id);
        await audit(tx, robot, 'desk.task.created', 'sd_task', k.id, { ticketId: t.id, rule: rule.id });
        return 'Task added';
      }
      case 'notify': {
        const to =
          a.to === 'assignee' ? [t.assigneeUserId] : a.to === 'user' ? (await tx.sdDeskMember.findMany({ where: { organizationId: org, deskId: t.deskId, userId: a.userId as string, validTo: null }, select: { userId: true } })).map((m) => m.userId) : a.to === 'group' ? (t.groupId ? (await tx.sdGroupMember.findMany({ where: { organizationId: org, groupId: t.groupId }, select: { userId: true } })).map((m) => m.userId) : []) : (await tx.sdDeskMember.findMany({ where: { organizationId: org, deskId: t.deskId, role: 'lead', validTo: null }, select: { userId: true } })).map((m) => m.userId);
        const ids = [...new Set(to.filter((x): x is string => Boolean(x)))];
        // In-app only, in the run's own transaction; a sensitive or private ticket is named by its number only (YX-SD-14).
        const context = `${t.sensitive || t.private ? t.number : `${t.number} · ${t.subject}`} · ${a.message as string}`.slice(0, 500);
        for (const u of ids) await tx.userNotification.create({ data: { organizationId: org, recipientUserId: u, actorUserId: null, type: 'helpdesk.rule.notify', entityType: 'sd_ticket', entityId: t.id, contextText: context, linkPath: `/yx/desk/tickets/${t.id}` } });
        return ids.length ? `Told ${ids.length} ${ids.length > 1 ? 'people' : 'person'}` : 'Nobody to tell';
      }
      default:
        throw new Error(`Unknown action ${a.type}`);
    }
  }

  async timeCandidates(tx: Tx, org: string, deskId: string | null, t: Trigger, now: Date) {
    const cut = new Date(now.getTime() - (t.hours ?? 24) * 3_600_000);
    const rows = await tx.sdTicket.findMany({
      where: { organizationId: org, deskId: deskId ?? '', systemState: { in: OPEN_STATES }, mergedIntoId: null, ...(t.type === 'idle' ? { updatedAt: { lte: cut } } : { createdAt: { lte: cut } }) },
      select: { id: true, updatedAt: true, createdAt: true },
      orderBy: { updatedAt: 'asc' },
      take: 100,
    });
    return rows.map((r) => ({ id: r.id, since: t.type === 'idle' ? r.updatedAt : r.createdAt }));
  }

  async recent(tx: Tx, org: string, deskId: string | null, limit: number) {
    return (await tx.sdTicket.findMany({ where: { organizationId: org, deskId: deskId ?? '', mergedIntoId: null }, orderBy: { createdAt: 'desc' }, take: limit, select: { id: true } })).map((t) => t.id);
  }

  webhookBody(l: Loaded, id: string) {
    // Ids and plain fields only: no subject or message text leaves the company through a webhook (YX-API-10).
    const v = l.values;
    return { ticket: { id, number: l.label, deskId: l.scopeId, state: v.state, priority: v.priority, categoryId: v.category, groupId: v.group, tier: v.tier, sensitive: v.sensitive === 'yes' } };
  }

  async tellAdmins(org: string, deskId: string | null, ruleId: string, name: string, why: string) {
    const ctx = { organizationId: org, isSuperAdmin: false };
    try {
      const to = await this.tenantPrisma.forTenant(ctx, async (tx) => {
        const admins = (await tx.sdDeskMember.findMany({ where: { organizationId: org, deskId: deskId ?? '', role: 'admin', validTo: null }, select: { userId: true } })).map((m) => m.userId);
        const rule = await tx.rule.findFirst({ where: { organizationId: org, id: ruleId }, select: { createdBy: true } });
        await emit(tx, org, 'helpdesk.rule.failed', { ruleId, deskId, reason: why.slice(0, 200) });
        return [...admins, ...(rule?.createdBy ? [rule.createdBy] : [])];
      });
      await this.notifications.notifySystem(ctx, to, 'helpdesk.rule.failed', { entityType: 'rule', entityId: ruleId, contextText: `${name}: ${why}`.slice(0, 300), linkPath: `/yx/desk/setup?tab=rules&rule=${ruleId}` }, { subject: `A desk rule needs a look: ${name}`.slice(0, 150), html: `<p>${name.replace(/[&<>"']/g, '')}: ${why.replace(/[&<>"']/g, '')}</p>` });
    } catch (e) {
      this.logger.warn(`rule notice not sent: ${(e as Error).message}`);
    }
  }

  // ------------------------------------------------------------------------------------------ admin (desk.rule.manage)

  private tx<T>(a: DeskActor, fn: (tx: Tx) => Promise<T>) {
    return this.tenantPrisma.forTenant(a.ctx, fn);
  }

  private async rule(tx: Tx, a: DeskActor, id: string) {
    const r = await tx.rule.findFirst({ where: { organizationId: a.ctx.organizationId, id, recordType: DESK_TICKET } });
    if (!r?.scopeId) throw new NotFoundException('No such rule.');
    requireSetUp(a, r.scopeId, 'desk.rule.manage');
    return r;
  }

  private can(a: DeskActor) {
    return { integrations: has(a, 'desk.integration.manage') };
  }

  async list(a: DeskActor, deskId: string) {
    requireSetUp(a, deskId, 'desk.rule.manage');
    return this.tx(a, async (tx) => {
      await requireDesk(tx, a, deskId);
      const rules = await tx.rule.findMany({ where: { organizationId: a.ctx.organizationId, recordType: DESK_TICKET, scopeId: deskId, status: { not: 'retired' } }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
      const last = await tx.automationRun.groupBy({ by: ['ruleId', 'outcome'], where: { organizationId: a.ctx.organizationId, ruleId: { in: rules.map((r) => r.id) }, at: { gte: new Date(Date.now() - 7 * 86_400_000) } }, _count: { _all: true } });
      return Promise.all(
        rules.map(async (r) => ({
          ...(await this.engine.view(tx, a.ctx.organizationId, r.id)),
          lastWeek: Object.fromEntries(last.filter((x) => x.ruleId === r.id).map((x) => [x.outcome, x._count._all])),
        })),
      );
    });
  }

  async schema(a: DeskActor, deskId: string) {
    requireSetUp(a, deskId, 'desk.rule.manage');
    return this.tx(a, async (tx) => {
      await requireDesk(tx, a, deskId);
      const org = a.ctx.organizationId;
      const [fields, groups, agents, categories, types, statuses, webhooks] = await Promise.all([
        this.fields(tx, org, deskId),
        tx.sdGroup.findMany({ where: { organizationId: org, deskId, active: true }, select: { id: true, name: true } }),
        tx.sdDeskMember.findMany({ where: { organizationId: org, deskId, validTo: null }, select: { userId: true, role: true } }),
        tx.sdCategory.findMany({ where: { organizationId: org, deskId, active: true }, select: { id: true, name: true } }),
        tx.sdTicketType.findMany({ where: { organizationId: org, deskId, active: true }, select: { id: true, name: true } }),
        tx.sdStatus.findMany({ where: { organizationId: org, deskId, active: true }, select: { id: true, label: true } }),
        has(a, 'desk.integration.manage') ? this.engine.webhooks(tx, org) : Promise.resolve([]),
      ]);
      const names = await this.tickets.userNames(tx, org, agents.map((m) => m.userId));
      return {
        triggers: this.triggers,
        fields,
        groups,
        people: agents.map((m) => ({ id: m.userId, name: names.get(m.userId) ?? '', role: m.role })),
        categories,
        types,
        statuses: statuses.map((s) => ({ id: s.id, name: s.label })),
        webhooks: webhooks.filter((w) => w.active),
        canUseWebhooks: has(a, 'desk.integration.manage'),
        recipes: RECIPES,
      };
    });
  }

  async create(a: DeskActor, dto: RuleDto) {
    requireSetUp(a, dto.deskId, 'desk.rule.manage');
    return this.tx(a, async (tx) => {
      await requireDesk(tx, a, dto.deskId);
      const r = await this.engine.create(tx, a.ctx, a.userId, this, dto.deskId, dto as RuleInput, this.can(a));
      return this.engine.view(tx, a.ctx.organizationId, r.id);
    });
  }

  async update(a: DeskActor, id: string, dto: UpdateRuleDto) {
    return this.tx(a, async (tx) => {
      await this.rule(tx, a, id);
      const { version, ...rest } = dto;
      await this.engine.update(tx, a.ctx, a.userId, this, id, version, rest, this.can(a));
      return this.engine.view(tx, a.ctx.organizationId, id);
    });
  }

  async setStatus(a: DeskActor, id: string, version: number, status: 'active' | 'paused' | 'retired') {
    return this.tx(a, async (tx) => {
      const r = await this.rule(tx, a, id);
      // A rule that calls a webhook is switched on only by someone who may use webhooks.
      const v = await tx.ruleVersion.findFirstOrThrow({ where: { organizationId: a.ctx.organizationId, ruleId: id, version: r.currentVersion } });
      if (status === 'active' && (v.actions as unknown as Action[]).some((x) => x.type === 'webhook') && !has(a, 'desk.integration.manage')) throw new ForbiddenException('Switching on a rule that calls a webhook needs desk.integration.manage.');
      await this.engine.setStatus(tx, a.ctx, a.userId, this, id, version, status);
      return this.engine.view(tx, a.ctx.organizationId, id);
    });
  }

  async runs(a: DeskActor, id: string) {
    return this.tx(a, async (tx) => {
      await this.rule(tx, a, id);
      const runs = await this.engine.runs(tx, a.ctx.organizationId, id);
      const numbers = new Map((await tx.sdTicket.findMany({ where: { organizationId: a.ctx.organizationId, id: { in: runs.map((r) => r.recordId) } }, select: { id: true, number: true } })).map((t) => [t.id, t.number]));
      // A run on a ticket the reader cannot open (sensitive, private, restricted desk) shows only that it ran: no
      // ticket, no condition results, no outcome (they would give away what the ticket says).
      return runs.map((r) => {
        const ticket = numbers.get(r.recordId) ?? null;
        return ticket
          ? { id: r.id, at: r.at, ruleVersion: r.ruleVersion, trigger: r.trigger, ticketId: r.recordId, ticket, outcome: r.outcome, depth: r.depth, trace: r.trace, actions: r.actions, error: r.error }
          : { id: r.id, at: r.at, ruleVersion: r.ruleVersion, trigger: r.trigger, ticketId: null, ticket: null, outcome: 'hidden', depth: r.depth, trace: [], actions: [], error: null };
      });
    });
  }

  /**
   * The dry run reads tickets as the person running it (no system rights): a desk admin who may not open sensitive or
   * private tickets never learns which of them a condition would match.
   */
  async dryRun(a: DeskActor, id: string) {
    return this.tx(a, async (tx) => {
      await this.rule(tx, a, id);
      return this.engine.dryRun(tx, a.ctx.organizationId, this, id);
    });
  }

  /** US-G-051: a recipe installs in one click as a draft rule, filled in with this desk's own teams and categories. */
  async install(a: DeskActor, key: string, deskId: string) {
    requireSetUp(a, deskId, 'desk.rule.manage');
    const recipe = RECIPES.find((r) => r.key === key);
    if (!recipe) throw new NotFoundException('No such recipe.');
    return this.tx(a, async (tx) => {
      await requireDesk(tx, a, deskId);
      const org = a.ctx.organizationId;
      const groups = await tx.sdGroup.findMany({ where: { organizationId: org, deskId, active: true }, select: { id: true, name: true } });
      const cats = await tx.sdCategory.findMany({ where: { organizationId: org, deskId, active: true }, select: { id: true, name: true } });
      let input: RuleInput;
      if (recipe.key === 'payroll_to_payroll_team') {
        const pay = cats.filter((c) => /pay|salar/i.test(c.name));
        const team = groups.find((g) => /payroll/i.test(g.name)) ?? groups[0];
        if (!pay.length || !team) throw new BadRequestException('This desk needs a pay category and a team for this recipe.');
        input = { name: recipe.name, description: recipe.description, trigger: { type: 'created' }, condition: { id: 'g', join: 'and', items: [{ id: 'c1', field: 'category', operator: 'one_of', value: pay.map((c) => c.id) }] }, actions: [{ type: 'assign', groupId: team.id }] };
      } else if (recipe.key === 'urgent_tell_leads') {
        input = { name: recipe.name, description: recipe.description, trigger: { type: 'updated', fields: ['priority'] }, condition: { id: 'g', join: 'and', items: [{ id: 'c1', field: 'priority', operator: 'is', value: 1 }] }, actions: [{ type: 'notify', to: 'leads', message: 'An urgent ticket needs a look.' }] };
      } else if (recipe.key === 'idle_escalate') {
        input = { name: recipe.name, description: recipe.description, trigger: { type: 'idle', hours: 24 }, condition: { id: 'g', join: 'and', items: [{ id: 'c1', field: 'tier', operator: 'is', value: 'L1' }] }, actions: [{ type: 'escalate', tier: 'L2' }] };
      } else {
        input = { name: recipe.name, description: recipe.description, trigger: { type: 'created' }, condition: { id: 'g', join: 'and', items: [{ id: 'c1', field: 'vip', operator: 'is', value: 'yes' }, { id: 'c2', field: 'priority', operator: 'gt', value: 2 }] }, actions: [{ type: 'set_field', field: 'priority', value: 2 }] };
      }
      const r = await this.engine.create(tx, a.ctx, a.userId, this, deskId, input, this.can(a), recipe.key);
      return this.engine.view(tx, org, r.id);
    });
  }

  // Webhooks are company-wide: desk.integration.manage (with a fresh security check on the route).
  async webhooks(a: DeskActor) {
    if (!has(a, 'desk.integration.manage')) throw new ForbiddenException('You need desk.integration.manage.');
    return this.tx(a, (tx) => this.engine.webhooks(tx, a.ctx.organizationId));
  }

  async createWebhook(a: DeskActor, name: string, url: string) {
    if (!has(a, 'desk.integration.manage')) throw new ForbiddenException('You need desk.integration.manage.');
    return this.tx(a, (tx) => this.engine.createWebhook(tx, a.ctx, a.userId, name, url));
  }

  async setWebhookActive(a: DeskActor, id: string, active: boolean) {
    if (!has(a, 'desk.integration.manage')) throw new ForbiddenException('You need desk.integration.manage.');
    return this.tx(a, (tx) => this.engine.setWebhookActive(tx, a.ctx, a.userId, id, active));
  }
}

export type DeskRuleRow = Prisma.RuleGetPayload<object>;
