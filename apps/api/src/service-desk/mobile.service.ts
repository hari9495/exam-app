import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantPrismaService } from '@exam-platform/shared';
import { Tx } from '../org-structure/org-structure.service';
import { DeskActor, audit, canWork, has, isLead, ticketAccess, visibleTickets } from './desk-access';
import { OPEN_STATES, TicketsService } from './tickets.service';

// SD-2.27 (US-G-068): the agent mobile app's API. The app uses the same ticket, reply and approval endpoints as the
// web; this adds what a phone needs on top:
//   - one small home call (my open work, unassigned on my desks, due soon and missed targets; leads also get their
//     desks' live counts) and a compact queue (no message bodies);
//   - drafts written offline, synced to the server so another device sees them. Two devices editing one draft: the
//     second save carries an old version and is refused with the server's copy (DRAFT_CHANGED). Sending a draft after
//     the ticket changed (new messages, or a change to the ticket itself, since the draft was based) is refused with
//     what changed (TICKET_CHANGED) until the agent looks and sends again with force;
//   - SLA warnings as pushes to the linked phone (MessagingService.slaPush), approvals through the P03 endpoints.

type Draft = Prisma.SdAgentDraftGetPayload<object>;
const DUE_SOON_MS = 2 * 3_600_000;

@Injectable()
export class MobileService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly tickets: TicketsService,
  ) {}

  private tx<T>(a: DeskActor, fn: (tx: Tx) => Promise<T>) {
    return this.tenantPrisma.forTenant({ ...a.ctx, userId: a.userId }, fn);
  }

  private requireAgent(a: DeskActor) {
    if (!has(a, 'desk.ticket.view') || ![...a.roles.values()].some((r) => r === 'agent' || r === 'lead')) throw new ForbiddenException('The mobile desk is for agents.');
  }

  async home(a: DeskActor) {
    this.requireAgent(a);
    const org = a.ctx.organizationId;
    const desks = [...a.roles].filter(([, r]) => r === 'agent' || r === 'lead').map(([d]) => d);
    return this.tx(a, async (tx) => {
      const visible = await visibleTickets(tx, a);
      const mine = { ...visible, assigneeUserId: a.userId, systemState: { in: OPEN_STATES } };
      const now = new Date();
      const [myOpen, unassigned, dueSoon, missed, approvals] = await Promise.all([
        tx.sdTicket.count({ where: mine }),
        tx.sdTicket.count({ where: { ...visible, deskId: { in: desks }, assigneeUserId: null, systemState: { in: OPEN_STATES } } }),
        tx.sdSlaTimer.count({ where: { organizationId: org, state: 'running', dueAt: { gt: now, lte: new Date(now.getTime() + DUE_SOON_MS) }, ticketId: { in: (await tx.sdTicket.findMany({ where: mine, select: { id: true }, take: 500 })).map((t) => t.id) } } }),
        tx.sdSlaTimer.count({ where: { organizationId: org, breachedAt: { not: null }, state: 'running', ticketId: { in: (await tx.sdTicket.findMany({ where: mine, select: { id: true }, take: 500 })).map((t) => t.id) } } }),
        tx.wfTask.count({ where: { organizationId: org, assigneeUserId: a.userId, status: 'open' } }),
      ]);
      // US-G-068: a lead sees the live counts of the desks they lead.
      const led = desks.filter((d) => isLead(a, d));
      const deskLive = led.length
        ? await Promise.all(
            led.map(async (d) => ({
              deskId: d,
              open: await tx.sdTicket.count({ where: { ...visible, deskId: d, systemState: { in: OPEN_STATES } } }),
              unassigned: await tx.sdTicket.count({ where: { ...visible, deskId: d, assigneeUserId: null, systemState: { in: OPEN_STATES } } }),
              missed: await tx.sdSlaTimer.count({ where: { organizationId: org, deskId: d, state: 'running', breachedAt: { not: null } } }),
            })),
          )
        : [];
      return { myOpen, unassigned, dueSoon, missed, approvals, desks: deskLive };
    });
  }

  /** My open tickets first, then unassigned ones on my desks; compact rows only (no message text). */
  async queue(a: DeskActor, scope: 'mine' | 'unassigned') {
    this.requireAgent(a);
    const desks = [...a.roles].filter(([, r]) => r === 'agent' || r === 'lead').map(([d]) => d);
    return this.tx(a, async (tx) => {
      const visible = await visibleTickets(tx, a);
      const rows = await tx.sdTicket.findMany({
        where: { ...visible, systemState: { in: OPEN_STATES }, ...(scope === 'mine' ? { assigneeUserId: a.userId } : { assigneeUserId: null, deskId: { in: desks } }) },
        orderBy: [{ priority: 'asc' }, { updatedAt: 'desc' }],
        take: 50,
        select: { id: true, number: true, subject: true, priority: true, systemState: true, deskId: true, sensitive: true, private: true, version: true, updatedAt: true, channel: true },
      });
      const due = await tx.sdSlaTimer.findMany({ where: { organizationId: a.ctx.organizationId, ticketId: { in: rows.map((r) => r.id) }, state: 'running' }, select: { ticketId: true, dueAt: true } });
      return rows.map((r) => ({ ...r, slaDueAt: due.filter((d) => d.ticketId === r.id && d.dueAt).map((d) => d.dueAt!).sort((x, y) => x.getTime() - y.getTime())[0] ?? null }));
    });
  }

  // ------------------------------------------------------------------------------------------ drafts

  private view(d: Draft) {
    return { clientRef: d.clientRef, ticketId: d.ticketId, kind: d.kind, bodyHtml: d.bodyHtml, baseTicketVersion: d.baseTicketVersion, version: d.version, updatedAt: d.updatedAt };
  }

  async drafts(a: DeskActor) {
    this.requireAgent(a);
    return this.tx(a, async (tx) => (await tx.sdAgentDraft.findMany({ where: { organizationId: a.ctx.organizationId, userId: a.userId }, orderBy: { updatedAt: 'desc' }, take: 100 })).map((d) => this.view(d)));
  }

  /** Save a draft. A new one needs no version; an existing one needs the version the device last saw. */
  async saveDraft(a: DeskActor, clientRef: string, dto: { ticketId: string; kind: 'reply' | 'note'; bodyHtml: string; baseTicketVersion: number; version?: number }) {
    this.requireAgent(a);
    const org = a.ctx.organizationId;
    return this.tx(a, async (tx) => {
      const { t, access } = await this.tickets.load(tx, a, dto.ticketId);
      if (dto.kind === 'reply' && access !== 'agent') throw new ForbiddenException('Only an agent of this desk replies.');
      const cur = await tx.sdAgentDraft.findUnique({ where: { organizationId_userId_clientRef: { organizationId: org, userId: a.userId, clientRef } } });
      if (!cur) {
        if (dto.version !== undefined) throw new ConflictException({ statusCode: 409, code: 'DRAFT_GONE', message: 'This draft was sent or removed on another device.' });
        const d = await tx.sdAgentDraft.create({ data: { organizationId: org, deskId: t.deskId, ticketId: t.id, userId: a.userId, clientRef, kind: dto.kind, bodyHtml: dto.bodyHtml, baseTicketVersion: dto.baseTicketVersion } });
        return this.view(d);
      }
      if (cur.ticketId !== t.id) throw new BadRequestException('This draft belongs to another ticket.');
      const res = await tx.sdAgentDraft.updateMany({ where: { id: cur.id, version: dto.version ?? -1 }, data: { kind: dto.kind, bodyHtml: dto.bodyHtml, baseTicketVersion: dto.baseTicketVersion, version: { increment: 1 }, updatedAt: new Date() } });
      if (!res.count) throw new ConflictException({ statusCode: 409, code: 'DRAFT_CHANGED', message: 'This draft changed on another device. Keep one of the two.', server: this.view(cur) });
      return this.view(await tx.sdAgentDraft.findFirstOrThrow({ where: { id: cur.id } }));
    });
  }

  async removeDraft(a: DeskActor, clientRef: string) {
    this.requireAgent(a);
    const n = await this.tx(a, (tx) => tx.sdAgentDraft.deleteMany({ where: { organizationId: a.ctx.organizationId, userId: a.userId, clientRef } }));
    if (!n.count) throw new NotFoundException('No such draft.');
    return { removed: true };
  }

  /**
   * Send a draft. Refused (TICKET_CHANGED, with what changed) when the ticket moved on since the draft was based on it,
   * unless force. A draft is sent once: it is removed in the same step as the message is written.
   */
  async sendDraft(a: DeskActor, clientRef: string, dto: { force?: boolean }) {
    this.requireAgent(a);
    const org = a.ctx.organizationId;
    const d = await this.tx(a, async (tx) => {
      const draft = await tx.sdAgentDraft.findUnique({ where: { organizationId_userId_clientRef: { organizationId: org, userId: a.userId, clientRef } } });
      if (!draft) throw new NotFoundException('No such draft. It may have been sent from another device.');
      const t = await tx.sdTicket.findFirst({ where: { organizationId: org, id: draft.ticketId } });
      if (!t || !(await ticketAccess(tx, a, t))) throw new NotFoundException('No such ticket.');
      if (draft.kind === 'reply' && !canWork(a, t.deskId)) throw new ForbiddenException('Only an agent of this desk replies.');
      const newer = await tx.sdTicketMessage.findMany({ where: { organizationId: org, ticketId: t.id, createdAt: { gt: draft.createdAt }, OR: [{ authorUserId: null }, { authorUserId: { not: a.userId } }], kind: { in: ['reply', 'note'] } }, orderBy: { createdAt: 'asc' }, take: 5, select: { kind: true, side: true, bodyText: true, createdAt: true } });
      if (!dto.force && (t.version !== draft.baseTicketVersion || newer.length)) {
        throw new ConflictException({
          statusCode: 409,
          code: 'TICKET_CHANGED',
          message: 'The ticket changed since you wrote this. Read what is new, then send again.',
          ticketVersion: t.version,
          stateNow: t.systemState,
          newMessages: newer.map((m) => ({ kind: m.kind, side: m.side, at: m.createdAt, text: m.bodyText.slice(0, 300) })),
        });
      }
      // Claim the draft (only one device's send wins).
      const gone = await tx.sdAgentDraft.deleteMany({ where: { id: draft.id, version: draft.version } });
      if (!gone.count) throw new ConflictException({ statusCode: 409, code: 'DRAFT_CHANGED', message: 'This draft changed on another device. Reload it.' });
      await audit(tx, a, 'desk.mobile.draft_sent', 'sd_ticket', t.id, { kind: draft.kind, forced: Boolean(dto.force) });
      return draft;
    });
    // The same path as the web (key and seat checks, timeline, SLA, mail and channel delivery).
    try {
      return await this.tickets.post(a, d.ticketId, { kind: d.kind as 'reply' | 'note', bodyHtml: d.bodyHtml });
    } catch (e) {
      // Not sent: the draft comes back so nothing written is lost.
      await this.tx(a, (tx) => tx.sdAgentDraft.create({ data: { organizationId: org, deskId: d.deskId, ticketId: d.ticketId, userId: a.userId, clientRef: d.clientRef, kind: d.kind, bodyHtml: d.bodyHtml, baseTicketVersion: d.baseTicketVersion } })).catch(() => undefined);
      throw e;
    }
  }
}
