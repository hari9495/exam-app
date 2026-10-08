import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { stringify } from 'csv-stringify/sync';
import { TenantPrismaService } from '@exam-platform/shared';
import { Tx } from '../org-structure/org-structure.service';
import { DeskActor, audit, canLead, has, visibleTickets } from './desk-access';
import { TicketFiltersDto, TicketListQueryDto, ViewDto } from './dto';
import { MeService } from './me.service';

// SD-1.07 agent desk lists (US-B-089, US-G-002, US-G-010): filters, saved views, the board, CSV export. Every list
// starts from the visibility filter (§5.7), so a search, a count or an export never holds a ticket the person may
// not open.

const ORDER: Record<string, Prisma.SdTicketOrderByWithRelationInput[]> = {
  updated_desc: [{ updatedAt: 'desc' }, { id: 'asc' }],
  created_desc: [{ createdAt: 'desc' }, { id: 'asc' }],
  created_asc: [{ createdAt: 'asc' }, { id: 'asc' }],
  priority_asc: [{ priority: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
  number_desc: [{ seq: 'desc' }, { id: 'asc' }],
};
const EXPORT_CAP = 5000;

/** A spreadsheet must never run a cell as a formula (CSV injection). */
const safeCell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
};

@Injectable()
export class TicketListsService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  private tx<T>(a: DeskActor, fn: (tx: Tx) => Promise<T>) {
    return this.tenantPrisma.forTenant(a.ctx, fn);
  }

  private async where(tx: Tx, a: DeskActor, f: TicketFiltersDto): Promise<Prisma.SdTicketWhereInput> {
    const and: Prisma.SdTicketWhereInput[] = [await visibleTickets(tx, a)];
    if (f.deskIds?.length) and.push({ deskId: { in: f.deskIds } });
    if (f.states?.length) and.push({ systemState: { in: f.states } });
    if (f.statusIds?.length) and.push({ statusId: { in: f.statusIds } });
    if (f.priorities?.length) and.push({ priority: { in: f.priorities } });
    if (f.groupIds?.length) and.push({ groupId: { in: f.groupIds } });
    if (f.categoryIds?.length) and.push({ categoryId: { in: f.categoryIds } });
    if (f.tags?.length) and.push({ tags: { hasSome: f.tags } });
    if (f.vip !== undefined) and.push({ vip: f.vip });
    const snoozed = await MeService.snoozedIds(tx, a.ctx.organizationId, a.userId);
    if (f.snoozed === 'only') and.push({ id: { in: snoozed } });
    else if (f.snoozed !== 'show' && snoozed.length) and.push({ id: { notIn: snoozed } });
    if (f.breaching) {
      const soon = await tx.sdSlaTimer.findMany({ where: { organizationId: a.ctx.organizationId, kind: 'sla', state: { in: ['running', 'paused'] }, OR: [{ breachedAt: { not: null } }, { dueAt: { lte: new Date(Date.now() + 4 * 3_600_000) } }] }, select: { ticketId: true }, take: 5000 });
      and.push({ id: { in: [...new Set(soon.map((x) => x.ticketId))] } });
    }
    if (f.assignee === 'me') and.push({ assigneeUserId: a.userId });
    else if (f.assignee === 'none') and.push({ assigneeUserId: null });
    else if (f.assignee) and.push({ assigneeUserId: f.assignee });
    if (f.search) {
      // Words as prefixes over number + subject (the GIN tsvector), plus the number typed in full.
      const words = f.search.split(/[^\p{L}\p{N}]+/u).filter(Boolean).slice(0, 8);
      const ids = words.length
        ? (await tx.$queryRaw<{ id: string }[]>`
            SELECT id FROM sd_tickets WHERE organization_id = ${a.ctx.organizationId}::uuid
              AND search @@ to_tsquery('simple', ${words.map((w) => `${w}:*`).join(' & ')}) LIMIT 2000`).map((r) => r.id)
        : [];
      and.push({ OR: [{ id: { in: ids } }, { number: { equals: f.search, mode: 'insensitive' } }] });
    }
    return { AND: and };
  }

  private async viewFilters(tx: Tx, a: DeskActor, viewId: string): Promise<{ filters: TicketFiltersDto; sort: string | null }> {
    const v = await tx.sdView.findFirst({ where: { organizationId: a.ctx.organizationId, id: viewId } });
    if (!v || !(v.ownerUserId === a.userId || (v.shared && v.deskId && a.roles.has(v.deskId)))) throw new NotFoundException('No such view.');
    return { filters: v.filters as TicketFiltersDto, sort: v.sort };
  }

  async list(a: DeskActor, q: TicketListQueryDto) {
    return this.tx(a, async (tx) => {
      const { viewId, sort, limit = 50, cursor, ...rest } = q;
      const view = viewId ? await this.viewFilters(tx, a, viewId) : null;
      const filters = { ...(view?.filters ?? {}), ...rest };
      const where = await this.where(tx, a, filters);
      const skip = cursor ? Number(cursor) : 0;
      const [rows, total] = await Promise.all([
        tx.sdTicket.findMany({ where, orderBy: ORDER[sort ?? view?.sort ?? 'updated_desc'] ?? ORDER.updated_desc, skip, take: limit }),
        tx.sdTicket.count({ where }),
      ]);
      // ponytail: offset cursor; a keyset cursor per sort when lists pass ~10k open tickets.
      return { items: await this.enrich(tx, a, rows), total, nextCursor: skip + rows.length < total ? String(skip + rows.length) : null };
    });
  }

  private async enrich(tx: Tx, a: DeskActor, rows: Prisma.SdTicketGetPayload<object>[]) {
    const org = a.ctx.organizationId;
    const pick = <K extends keyof (typeof rows)[number]>(k: K) => [...new Set(rows.map((r) => r[k]).filter(Boolean))] as string[];
    const [desks, statuses, types, cats, groups, people, users] = await Promise.all([
      tx.sdDesk.findMany({ where: { organizationId: org, id: { in: pick('deskId') } }, select: { id: true, name: true, key: true } }),
      tx.sdStatus.findMany({ where: { organizationId: org, id: { in: pick('statusId') } }, select: { id: true, label: true } }),
      tx.sdTicketType.findMany({ where: { organizationId: org, id: { in: pick('typeId') } }, select: { id: true, name: true } }),
      tx.sdCategory.findMany({ where: { organizationId: org, id: { in: pick('categoryId') } }, select: { id: true, name: true } }),
      tx.sdGroup.findMany({ where: { organizationId: org, id: { in: pick('groupId') } }, select: { id: true, name: true } }),
      tx.person.findMany({ where: { organizationId: org, id: { in: [...pick('requesterPersonId'), ...pick('requestedForPersonId')] } }, select: { id: true, givenName: true, familyName: true, preferredName: true } }),
      tx.user.findMany({ where: { organizationId: org, id: { in: pick('assigneeUserId') } }, select: { id: true, name: true, email: true } }),
    ]);
    // The nearest live response target of each ticket (US-G-016 on the list: due time and missed or not).
    const timers = rows.length ? await tx.sdSlaTimer.findMany({ where: { organizationId: org, kind: 'sla', ticketId: { in: rows.map((r) => r.id) }, state: { in: ['running', 'paused'] } }, select: { ticketId: true, dueAt: true, breachedAt: true, state: true } }) : [];
    const sla = new Map<string, { dueAt: Date | null; breached: boolean; paused: boolean }>();
    for (const x of timers) {
      const cur = sla.get(x.ticketId);
      const breached = Boolean(x.breachedAt) || Boolean(cur?.breached);
      const dueAt = [cur?.dueAt, x.state === 'running' ? x.dueAt : null].filter((d): d is Date => Boolean(d)).sort((p, q) => p.getTime() - q.getTime())[0] ?? null;
      sla.set(x.ticketId, { dueAt, breached, paused: x.state === 'paused' && (cur?.paused ?? true) });
    }
    const m = <T extends { id: string }>(xs: T[]) => new Map(xs.map((x) => [x.id, x]));
    const [D, S, T, C, G, P, U] = [m(desks), m(statuses), m(types), m(cats), m(groups), m(people), m(users)];
    const person = (id: string | null) => {
      const p = id ? P.get(id) : undefined;
      return p ? [p.preferredName || p.givenName, p.familyName].filter(Boolean).join(' ') : null;
    };
    return rows.map((t) => ({
      id: t.id,
      number: t.number,
      subject: t.subject,
      deskId: t.deskId,
      desk: D.get(t.deskId)?.name ?? '',
      type: T.get(t.typeId)?.name ?? '',
      statusId: t.statusId,
      status: S.get(t.statusId)?.label ?? '',
      systemState: t.systemState,
      priority: t.priority,
      category: t.categoryId ? (C.get(t.categoryId)?.name ?? null) : null,
      group: t.groupId ? (G.get(t.groupId)?.name ?? null) : null,
      requester: person(t.requesterPersonId),
      requestedFor: person(t.requestedForPersonId),
      assigneeUserId: t.assigneeUserId,
      assignee: t.assigneeUserId ? (U.get(t.assigneeUserId)?.name || U.get(t.assigneeUserId)?.email || null) : null,
      tags: t.tags,
      vip: t.vip,
      sensitive: t.sensitive,
      private: t.private,
      version: t.version,
      tier: t.tier,
      channel: t.channel,
      customerAccountId: t.customerAccountId,
      senderVerified: t.senderVerified,
      sla: sla.get(t.id) ?? null,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      // Lead-only actions show only to those who may do them.
      canBulk: canLead(a, t.deskId, 'desk.ticket.bulk'),
    }));
  }

  /** US-G-002: the CSV holds only tickets and fields the person may see. Audited. */
  async exportCsv(a: DeskActor, q: TicketListQueryDto): Promise<string> {
    if (![...a.roles.values()].some((r) => r === 'agent' || r === 'lead') || !has(a, 'desk.ticket.export')) throw new ForbiddenException('Only agents export ticket lists.');
    return this.tx(a, async (tx) => {
      const { viewId, sort, limit: _l, cursor: _c, ...rest } = q;
      const view = viewId ? await this.viewFilters(tx, a, viewId) : null;
      const where = await this.where(tx, a, { ...(view?.filters ?? {}), ...rest });
      const rows = await tx.sdTicket.findMany({ where, orderBy: ORDER[sort ?? view?.sort ?? 'updated_desc'], take: EXPORT_CAP });
      const items = await this.enrich(tx, a, rows);
      await audit(tx, a, 'desk.ticket.exported', 'sd_ticket', a.userId, { rows: items.length, filters: { ...(view?.filters ?? {}), ...rest } });
      // US-G-030: an export counts as reading every ticket in it.
      if (rows.length) await tx.sdTicketRead.createMany({ data: rows.map((t) => ({ organizationId: t.organizationId, deskId: t.deskId, ticketId: t.id, userId: a.userId, access: 'export' })) });
      const header = ['Number', 'Subject', 'Desk', 'Type', 'Status', 'Priority', 'Category', 'Group', 'Requester', 'Requested for', 'Assignee', 'Tags', 'VIP', 'Raised', 'Updated'];
      const body = items.map((t) => [t.number, t.subject, t.desk, t.type, t.status, `P${t.priority}`, t.category, t.group, t.requester, t.requestedFor, t.assignee, t.tags.join(' '), t.vip ? 'Yes' : 'No', t.createdAt.toISOString(), t.updatedAt.toISOString()].map(safeCell));
      return stringify([header, ...body]);
    });
  }

  // ------------------------------------------------------------------------------------------ saved views

  async views(a: DeskActor) {
    return this.tx(a, (tx) =>
      tx.sdView.findMany({
        where: { organizationId: a.ctx.organizationId, OR: [{ ownerUserId: a.userId }, { shared: true, deskId: { in: [...a.roles.keys()] } }] },
        orderBy: { name: 'asc' },
      }),
    ).then((vs) => vs.map((v) => ({ id: v.id, name: v.name, deskId: v.deskId, shared: v.shared, mine: v.ownerUserId === a.userId, filters: v.filters, columns: v.columns, sort: v.sort, layout: v.layout })));
  }

  /** Personal views for anyone who sees tickets; a view shared with a desk is a team lead's (desk.ticket.bulk). */
  private checkView(a: DeskActor, dto: ViewDto) {
    if (!has(a, 'desk.ticket.view')) throw new ForbiddenException('You cannot see tickets.');
    if (dto.deskId && !a.roles.has(dto.deskId)) throw new BadRequestException('No such desk.');
    if (dto.shared && !(dto.deskId && canLead(a, dto.deskId, 'desk.ticket.bulk'))) throw new ForbiddenException('Only a team lead of the desk shares a view.');
  }

  async saveView(a: DeskActor, id: string | null, dto: ViewDto) {
    this.checkView(a, dto);
    const data = {
      name: dto.name,
      deskId: dto.deskId ?? null,
      shared: Boolean(dto.shared),
      filters: { ...dto.filters } as Prisma.InputJsonValue,
      columns: dto.columns ?? [],
      sort: dto.sort ?? null,
      layout: dto.layout ?? 'list',
    };
    return this.tx(a, async (tx) => {
      let viewId = id;
      if (viewId) {
        const v = await tx.sdView.findFirst({ where: { organizationId: a.ctx.organizationId, id: viewId } });
        if (!v || !(v.ownerUserId === a.userId || (v.shared && v.deskId && canLead(a, v.deskId, 'desk.ticket.bulk')))) throw new NotFoundException('No such view.');
        await tx.sdView.update({ where: { id: v.id }, data });
      } else {
        viewId = (await tx.sdView.create({ data: { organizationId: a.ctx.organizationId, ownerUserId: a.userId, ...data } })).id;
      }
      await audit(tx, a, id ? 'desk.view.updated' : 'desk.view.created', 'sd_view', viewId, { name: dto.name, shared: data.shared });
      return { id: viewId };
    });
  }

  async deleteView(a: DeskActor, id: string) {
    return this.tx(a, async (tx) => {
      const v = await tx.sdView.findFirst({ where: { organizationId: a.ctx.organizationId, id } });
      if (!v || !(v.ownerUserId === a.userId || (v.shared && v.deskId && canLead(a, v.deskId, 'desk.ticket.bulk')))) throw new NotFoundException('No such view.');
      await tx.sdView.delete({ where: { id: v.id } });
      await audit(tx, a, 'desk.view.deleted', 'sd_view', v.id, { name: v.name });
      return { deleted: true };
    });
  }
}
