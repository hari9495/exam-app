import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import { OrgSecretsCryptoService, TenantPrismaService } from '@exam-platform/shared';
import { REDIS_CONNECTION, logBullErrors } from '../jobs/redis-connection';
import { DeskAccessService, DeskActor, audit, canWork, deskSystem, emit } from './desk-access';
import { GmailPoller, GraphPoller, MailboxPoller, PollResult } from './mail-adapters';
import { readReplyToken } from './mail-auth';
import { MailOutService } from './mail-out.service';
import { parseEmail } from './mail-parse';
import { textToHtml } from './rich-text';
import { TicketsService } from './tickets.service';

// SD-2.24 (US-E-283, YX-INT-06): an agent's own mailbox (Microsoft 365 or Gmail) is read for threads that belong to a
// ticket, and only those: an email is taken when it answers or quotes a message of the ticket (In-Reply-To /
// References against our stored Message-IDs, incoming and outgoing) or carries the ticket's signed reply address. It
// lands as an internal note on the ticket (it takes the ticket's privacy: sensitive and private flags are copied by the
// database), once per ticket, and only on tickets the agent works on. Nothing else in the mailbox is read into YukthiX.
// The adapters are the desk mailbox ones (mail-adapters.ts) with the sent folder added. The grant is the agent's own;
// unlinking stops the sync at once and wipes the stored grant. Delegated sign-in with Microsoft / Google (instead of
// typed app credentials) is a go-live line.

export const AGENT_MAIL_QUEUE = 'sd-agent-mail';
const MAX_TEXT = 20_000;

type Mailbox = Prisma.SdAgentMailboxGetPayload<object>;

// DECISION NEEDED: US-E-283 also asks "send-as with my own grant"; not built: replies still go from the desk mailbox
// (one address, DKIM-signed). Also: an outsider who quotes a ticket's Message-ID in a mail to an agent adds an internal
// note (labelled with the real sender); keep, or import only mail from the requester, watchers and colleagues?
/** Development only: messages handed to a "dev" mailbox (tests and the local demo). */
export class DevMailboxPoller implements MailboxPoller {
  static readonly inbox = new Map<string, Buffer[]>();
  constructor(private readonly id: string) {}
  async poll(cursor: string | null): Promise<PollResult> {
    const all = DevMailboxPoller.inbox.get(this.id) ?? [];
    const from = Number(cursor ?? 0);
    return { messages: all.slice(from, from + 25).map((raw, i) => ({ id: String(from + i), raw })), cursor: String(Math.min(all.length, from + 25)) };
  }
}

@Injectable()
export class MailboxSyncService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MailboxSyncService.name);
  private readonly queue: Queue;
  private worker: Worker | null = null;

  constructor(
    @Inject(REDIS_CONNECTION) private readonly connection: Redis,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly crypto: OrgSecretsCryptoService,
    private readonly access: DeskAccessService,
    private readonly tickets: TicketsService,
    private readonly mailOut: MailOutService,
  ) {
    this.queue = logBullErrors(new Queue(AGENT_MAIL_QUEUE, { connection }), AGENT_MAIL_QUEUE);
  }

  async onModuleInit() {
    this.worker = logBullErrors(new Worker(AGENT_MAIL_QUEUE, () => this.syncAll(), { connection: this.connection, concurrency: 1 }), AGENT_MAIL_QUEUE);
    await this.queue.upsertJobScheduler('sd-agent-mail-sync', { every: 120_000 }, { name: 'sync', data: {} });
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue.close();
  }

  private requireAgent(a: DeskActor) {
    if (!has(a) || ![...a.roles.values()].some((r) => r === 'agent' || r === 'lead')) throw new ForbiddenException('Only agents link a mailbox.');
  }

  private view(m: Mailbox | null) {
    return m && m.status !== 'unlinked' ? { id: m.id, kind: m.kind, address: m.address, status: m.status, lastSyncAt: m.lastSyncAt, lastError: m.lastError, imported: m.imported, linkedAt: m.linkedAt } : null;
  }

  async mine(a: DeskActor) {
    const m = await this.tenantPrisma.forTenant(a.ctx, (tx) => tx.sdAgentMailbox.findFirst({ where: { organizationId: a.ctx.organizationId, userId: a.userId, status: { not: 'unlinked' } } }));
    return { mailbox: this.view(m), devAllowed: process.env.NODE_ENV !== 'production' && process.env.DESK_CHANNELS === 'dev-fake' };
  }

  /** The agent's own mailbox only: the address must be their sign-in email. */
  async link(a: DeskActor, dto: { kind: 'm365' | 'gmail' | 'dev'; config?: Record<string, unknown> }) {
    this.requireAgent(a);
    const org = a.ctx.organizationId;
    if (dto.kind === 'dev' && (process.env.NODE_ENV === 'production' || process.env.DESK_CHANNELS !== 'dev-fake')) throw new BadRequestException('Choose Microsoft 365 or Gmail.');
    return this.tenantPrisma.forTenant(a.ctx, async (tx) => {
      const me = await tx.user.findFirstOrThrow({ where: { organizationId: org, id: a.userId }, select: { email: true } });
      const address = me.email.toLowerCase();
      const c = dto.config ?? {};
      if (dto.kind === 'm365' && !(typeof c.tenantId === 'string' && typeof c.clientId === 'string' && typeof c.clientSecret === 'string')) throw new BadRequestException('Give the Microsoft 365 tenant id, client id and secret.');
      if (dto.kind === 'gmail' && !(typeof c.clientId === 'string' && typeof c.clientSecret === 'string' && typeof c.refreshToken === 'string')) throw new BadRequestException('Give the Google client id, secret and refresh token.');
      const config = dto.kind === 'dev' ? null : this.crypto.encrypt(JSON.stringify(dto.kind === 'm365' ? { tenantId: c.tenantId, clientId: c.clientId, clientSecret: c.clientSecret, user: address } : { clientId: c.clientId, clientSecret: c.clientSecret, refreshToken: c.refreshToken }));
      const row = await tx.sdAgentMailbox.create({ data: { organizationId: org, userId: a.userId, kind: dto.kind, address, configEncrypted: config } }).catch((e: unknown) => {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('Your mailbox is already linked. Unlink it first.');
        throw e;
      });
      await audit(tx, a, 'desk.agent_mailbox.linked', 'sd_agent_mailbox', row.id, { kind: row.kind });
      return this.view(row);
    });
  }

  /** Stops at once: the grant is wiped, the next run skips it, what was synced stays on its tickets. */
  async unlink(a: DeskActor) {
    const org = a.ctx.organizationId;
    return this.tenantPrisma.forTenant(a.ctx, async (tx) => {
      const m = await tx.sdAgentMailbox.findFirst({ where: { organizationId: org, userId: a.userId, status: { not: 'unlinked' } } });
      if (!m) throw new NotFoundException('No mailbox is linked.');
      await tx.sdAgentMailbox.update({ where: { id: m.id }, data: { status: 'unlinked', unlinkedAt: new Date(), configEncrypted: null, cursor: null } });
      await audit(tx, a, 'desk.agent_mailbox.unlinked', 'sd_agent_mailbox', m.id, { kind: m.kind });
      return { unlinked: true };
    });
  }

  /** Overridable in tests: the reader for one mailbox. */
  pollersFor(m: Mailbox): MailboxPoller[] {
    if (m.kind === 'dev') return [new DevMailboxPoller(m.id)];
    const c = JSON.parse(this.crypto.decrypt(m.configEncrypted!)) as Record<string, string>;
    if (m.kind === 'm365') {
      const g = { tenantId: c.tenantId, clientId: c.clientId, clientSecret: c.clientSecret, user: c.user };
      return [new GraphPoller(g), new GraphPoller(g, undefined, 'sentitems')];
    }
    return [new GmailPoller({ clientId: c.clientId, clientSecret: c.clientSecret, refreshToken: c.refreshToken }, undefined, '{in:inbox in:sent}')];
  }

  async syncAll() {
    const boxes = await deskSystem(this.tenantPrisma, { organizationId: null, isSuperAdmin: true }, (tx) => tx.sdAgentMailbox.findMany({ where: { status: { in: ['active', 'failing'] } }, take: 500 }));
    for (const m of boxes) await this.syncOne(m.organizationId, m.id).catch((e) => this.logger.warn(`Agent mailbox sync failed: ${(e as Error).message}`));
  }

  /** One mailbox: new mail from each folder, matched threads only. Returns how many notes were added. */
  async syncOne(org: string, id: string): Promise<number> {
    const ctx = { organizationId: org, isSuperAdmin: false };
    const m = await deskSystem(this.tenantPrisma, ctx, (tx) => tx.sdAgentMailbox.findFirst({ where: { organizationId: org, id, status: { in: ['active', 'failing'] } } }));
    if (!m) return 0;
    const a = await this.access.actorFor(org, m.userId);
    // Someone who left the company or every desk: nothing more is read.
    if (!a || ![...a.roles.values()].some((r) => r === 'agent' || r === 'lead')) return 0;
    const cursors = (() => {
      try {
        return JSON.parse(m.cursor ?? '[]') as (string | null)[];
      } catch {
        return [];
      }
    })();
    let added = 0;
    try {
      const pollers = this.pollersFor(m);
      for (const [i, p] of pollers.entries()) {
        const res = await p.poll(cursors[i] ?? null);
        for (const msg of res.messages) added += await this.take(a, m, msg.raw);
        cursors[i] = res.cursor;
      }
      await deskSystem(this.tenantPrisma, ctx, (tx) => tx.sdAgentMailbox.updateMany({ where: { id, status: { not: 'unlinked' } }, data: { cursor: JSON.stringify(cursors), lastSyncAt: new Date(), lastError: null, status: 'active', imported: { increment: added } } }));
    } catch (e) {
      await deskSystem(this.tenantPrisma, ctx, (tx) => tx.sdAgentMailbox.updateMany({ where: { id, status: { not: 'unlinked' } }, data: { status: 'failing', lastError: (e as Error).message.slice(0, 300), lastSyncAt: new Date() } }));
    }
    return added;
  }

  /** One email: a note on the matched ticket, or nothing. */
  private async take(a: DeskActor, m: Mailbox, raw: Buffer): Promise<number> {
    const org = m.organizationId;
    const p = await parseEmail(raw);
    const ids = [p.inReplyTo, ...p.references, p.messageId].filter((x): x is string => Boolean(x)).slice(0, 50);
    const run = deskSystem(this.tenantPrisma, a.ctx, async (tx) => {
      // Mail that is already in YukthiX (sent by the desk, or received by a desk mailbox) is not taken twice.
      if (p.messageId && (await tx.sdTicketMessage.findFirst({ where: { organizationId: org, emailMessageId: p.messageId, kind: { not: 'note' } }, select: { id: true } }))) return 0;
      let ticketId: string | null = null;
      if (ids.length) ticketId = (await tx.sdTicketMessage.findFirst({ where: { organizationId: org, emailMessageId: { in: ids }, kind: { not: 'note' } }, orderBy: { createdAt: 'desc' }, select: { ticketId: true } }))?.ticketId ?? null;
      if (!ticketId) {
        const n = readReplyToken(this.mailOut.tokenSecret(), org, [...p.to, ...p.cc]);
        if (n) ticketId = (await tx.sdTicket.findFirst({ where: { organizationId: org, number: n }, select: { id: true } }))?.id ?? null;
      }
      if (!ticketId) return 0;
      const t = await tx.sdTicket.findFirstOrThrow({ where: { organizationId: org, id: ticketId } });
      // Only onto tickets this agent works on today (never by role alone).
      if (!canWork(a, t.deskId) || t.mergedIntoId) return 0;
      const head = `Email in ${m.address}: from ${p.from?.address ?? 'unknown'} to ${[...p.to, ...p.cc].slice(0, 5).join(', ') || 'unknown'}${p.subject ? `, "${p.subject.slice(0, 150)}"` : ''}`;
      // The same email from another agent's mailbox (or an earlier run) is already on the ticket.
      if (await tx.sdTicketMessage.findFirst({ where: { organizationId: org, ticketId: t.id, kind: 'note', emailMessageId: p.messageId }, select: { id: true } })) return 0;
      const { bodyHtml, bodyText, found } = this.tickets.cleanMasked(textToHtml(`${head}\n\n${(p.text || p.fullText).slice(0, MAX_TEXT)}`));
      const note = await tx.sdTicketMessage.create({ data: { organizationId: org, deskId: t.deskId, ticketId: t.id, kind: 'note', side: 'agent', authorUserId: m.userId, bodyHtml, bodyText, channel: 'email', emailMessageId: p.messageId } });
      await this.tickets.keepPii(tx, t, note.id, found);
      await emit(tx, org, 'helpdesk.ticket.note_added', { ticketId: t.id, deskId: t.deskId, messageId: note.id, source: 'mailbox_sync' });
      await audit(tx, { ctx: a.ctx, userId: m.userId }, 'desk.agent_mailbox.synced', 'sd_ticket', t.id, { mailboxId: m.id, messageId: note.id });
      return 1;
    });
    // Two syncs of the same thread at once: the unique index keeps one; the other counts nothing.
    return run.catch((e: unknown) => {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return 0;
      throw e;
    });
  }
}

const has = (a: DeskActor) => a.keys.has('desk.ticket.work');
