import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Job, Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import { createHash, randomBytes, randomUUID } from 'crypto';
import ipaddr from 'ipaddr.js';
import { OrgSecretsCryptoService, TenantPrismaService } from '@exam-platform/shared';
import { REDIS_CONNECTION, logBullErrors } from '../jobs/redis-connection';
import { NotificationsService } from '../notifications/notifications.service';
import { Tx } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { AttachmentsService } from './attachments.service';
import { ensureContact, isInternal } from './customers.service';
import { DeskAccessService, DeskActor, activeOn, audit, canWork, deskSystem, emit, requireSetUp } from './desk-access';
import { EmailRuleDto, MailboxDto, UpdateMailboxDto } from './dto-channels';
import { MailboxPoller, WebhookEnvelope, pollerFor, verifyWebhook } from './mail-adapters';
import { AuthFacts, DnsResolver, autoReplyReason, checkSender, readReplyToken, senderVerdict } from './mail-auth';
import { MailOutService, SD_DNS_RESOLVER } from './mail-out.service';
import { ParsedEmail, parseEmail } from './mail-parse';
import { COMMAND_HELP, EmailCommand, readCommands, runRules } from './mail-rules';
import { RequesterService } from './requester.service';
import { textToHtml } from './rich-text';
import { OPEN_STATES, Ticket, TicketsService } from './tickets.service';

// SD-1.19 / SD-1.20 email in (US-B-101, US-B-102, US-G-017 … US-G-019; §9.1, §14.3, §14.4). One pipeline for every
// adapter, one message at a time on BullMQ (sd-mail-in), idempotent on (mailbox, Message-ID):
//   store raw → bounce reports → own-address loops → SPF / DKIM / DMARC / ARC (mailauth, ourselves) → auto replies →
//   per-sender limit (20 in 10 minutes) → spam flag → email rules → threading (signed token, then In-Reply-To /
//   References, then the ticket number in the subject only for a proven requester or watcher) → commands → the
//   ticket or the reply, CCs as watchers, files through the virus scan → acknowledgement with suggested articles.
// Founder rule: spoofed mail never becomes a trusted requester. A sender who is not proven is never linked to a known
// person, never threads onto a ticket, never runs a command and never gets an automatic reply.

export const MAIL_IN_QUEUE = 'sd-mail-in';
const SENDER_LIMIT = 20;
const SENDER_WINDOW_MS = 10 * 60_000;
const MAX_RAW = 25 * 1024 * 1024;
const sha256 = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');

type Verdict = 'accepted' | 'held' | 'rejected' | 'loop' | 'spam' | 'bounce';
interface Outcome {
  verdict: Verdict;
  reason?: string | null;
  ticketId?: string | null;
  messageRowId?: string | null;
  ack?: { ticketId: string; html: string } | null;
  help?: { ticketId: string; html: string; to: string } | null;
  scan?: string[];
  heldDeskId?: string;
  followUpOf?: string;
}

@Injectable()
export class MailInService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MailInService.name);
  private readonly queue: Queue;
  private worker: Worker | null = null;

  constructor(
    @Inject(REDIS_CONNECTION) private readonly connection: Redis,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly crypto: OrgSecretsCryptoService,
    private readonly files: AttachmentsService,
    private readonly tickets: TicketsService,
    private readonly out: MailOutService,
    private readonly access: DeskAccessService,
    private readonly requesters: RequesterService,
    private readonly notifications: NotificationsService,
    @Inject(SD_DNS_RESOLVER) private readonly resolver: DnsResolver,
  ) {
    this.queue = logBullErrors(new Queue(MAIL_IN_QUEUE, { connection }), MAIL_IN_QUEUE);
  }

  async onModuleInit() {
    this.worker = logBullErrors(new Worker(MAIL_IN_QUEUE, (job) => this.run(job), { connection: this.connection, concurrency: 1 }), MAIL_IN_QUEUE);
    // Company mailboxes (Microsoft 365, Gmail, IMAP) every minute; raw mail older than 30 days removed daily.
    await this.queue.upsertJobScheduler('sd-mail-poll', { every: 60_000 }, { name: 'poll', data: {} });
    await this.queue.upsertJobScheduler('sd-mail-purge', { pattern: '15 3 * * *', tz: 'Asia/Kolkata' }, { name: 'purge', data: {} });
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue.close();
  }

  private async run(job: Job<{ organizationId?: string; inboundId?: string }>) {
    if (job.name === 'poll') return this.pollAll();
    if (job.name === 'purge') return this.purge();
    if (job.data.organizationId && job.data.inboundId) await this.process(job.data.organizationId, job.data.inboundId);
  }

  // ------------------------------------------------------------------------------------------ intake

  /**
   * POST /desk/inbound/email/:org/:token (hosted and forwarded mail). No session: the token in the path finds the
   * mailbox, its own secret signs the body (5-minute replay window), and SD_INBOUND_ALLOWED_IPS can pin the provider.
   * Every refusal looks the same, so the endpoint says nothing about which mailboxes exist.
   */
  async webhook(organizationId: string, token: string, headers: Record<string, string | string[] | undefined>, raw: Buffer, callerIp: string | null) {
    const refuse = () => new ForbiddenException('Not accepted.');
    const allowed = (process.env.SD_INBOUND_ALLOWED_IPS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    if (allowed.length && !(callerIp && allowed.some((r) => ipInRange(callerIp, r)))) throw refuse();
    if (!/^[A-Za-z0-9_-]{30,100}$/.test(token) || !raw.length) throw refuse();
    if (raw.length > MAX_RAW) throw new BadRequestException('The email is too large.');
    const h = (k: string) => {
      const v = headers[k];
      return (Array.isArray(v) ? v[0] : v)?.slice(0, 500) ?? '';
    };
    const env: WebhookEnvelope = { ip: h('x-envelope-ip'), helo: h('x-envelope-helo'), mailFrom: h('x-envelope-from'), rcptTo: h('x-envelope-to') };
    if (!ipaddr.isValid(env.ip)) throw refuse();
    const ctx = { organizationId, isSuperAdmin: false };
    const box = await this.tenantPrisma.forTenant(ctx, (tx) => tx.sdMailbox.findFirst({ where: { organizationId, tokenHash: sha256(token), kind: { in: ['hosted', 'forward'] } } }));
    if (!box?.signingSecretEncrypted || !verifyWebhook(this.crypto.decrypt(box.signingSecretEncrypted), h('x-yukthix-timestamp'), h('x-yukthix-signature'), env, raw)) throw refuse();
    if (box.status === 'paused') throw new ServiceUnavailableException('This mailbox is paused.');
    return this.accept(organizationId, box, raw, env);
  }

  /** Stores the raw mail and its row (once per Message-ID) and queues it. */
  async accept(organizationId: string, box: { id: string; deskId: string }, raw: Buffer, env: Partial<WebhookEnvelope> & { trustReceived?: boolean }) {
    const head = raw.subarray(0, 64 * 1024).toString('latin1');
    const mid = /^message-id:\s*(<[^<>\s]{1,290}>)/im.exec(head)?.[1] ?? `<${sha256(raw)}@no-message-id.invalid>`;
    const id = randomUUID();
    const ctx = { organizationId, isSuperAdmin: false };
    const created = await this.tenantPrisma.forTenant(ctx, (tx) =>
      tx.sdInboundEmail.createMany({ data: [{ id, organizationId, mailboxId: box.id, deskId: box.deskId, messageId: mid, remoteIp: env.ip || null }], skipDuplicates: true }),
    );
    // A provider retry of the same email: already here, nothing more to do.
    if (!created.count) return { accepted: true, duplicate: true };
    const key = await this.files.put(`desk-mail/${organizationId}/${box.id}/${id}.eml`, raw, 'message/rfc822');
    await this.tenantPrisma.forTenant(ctx, (tx) => tx.sdInboundEmail.update({ where: { id }, data: { rawBlobKey: key } }));
    await this.envelopes.set(id, { ip: env.ip ?? '', helo: env.helo ?? '', mailFrom: env.mailFrom ?? '', trustReceived: Boolean(env.trustReceived) });
    await this.queue.add('mail', { organizationId, inboundId: id }, { jobId: `mail-${id}`, attempts: 5, backoff: { type: 'exponential', delay: 10_000 }, removeOnComplete: true, removeOnFail: 200 });
    return { accepted: true, duplicate: false, id };
  }

  /** The SMTP envelope the provider saw, kept beside the row (Redis, a day) for the SPF check. */
  private readonly envelopes = {
    set: (id: string, e: object) => this.connection.set(`sd:mail-env:${id}`, JSON.stringify(e), 'EX', 86_400),
    get: async (id: string): Promise<{ ip: string; helo: string; mailFrom: string; trustReceived: boolean } | null> => {
      const v = await this.connection.get(`sd:mail-env:${id}`);
      return v ? JSON.parse(v) : null;
    },
  };

  // ------------------------------------------------------------------------------------------ the pipeline

  /** One inbound email, start to end. release: a desk admin let a held email through (no auth hold, no limit). */
  async process(organizationId: string, inboundId: string, release: { by: string } | null = null): Promise<Outcome | null> {
    const ctx = { organizationId, isSuperAdmin: false };
    const row = await deskSystem(this.tenantPrisma, ctx, (tx) => tx.sdInboundEmail.findFirst({ where: { organizationId, id: inboundId } }));
    if (!row?.rawBlobKey || (release ? !['held', 'spam'].includes(row.verdict) : row.verdict !== 'pending')) return null;
    const raw = await this.files.get(row.rawBlobKey);
    const p = await parseEmail(raw);
    let facts: AuthFacts | null = null;
    if (!release && p.from && !p.report) {
      const env = (await this.envelopes.get(row.id)) ?? { ip: row.remoteIp ?? '', helo: '', mailFrom: '', trustReceived: true };
      facts = await checkSender(raw, { ip: env.ip, helo: env.helo, mailFrom: env.mailFrom || p.from.address, trustReceived: env.trustReceived }, p.from.address, this.resolver).catch((e) => {
        this.logger.warn(`Sender check failed: ${(e as Error).message}`);
        return null;
      });
    }
    const outcome = await deskSystem(this.tenantPrisma, ctx, (tx) => this.decide(tx, organizationId, row, p, facts, release), { timeout: 60_000 });
    // After commit: scans, automatic mail, notices.
    for (const id of outcome.scan ?? []) await this.files.enqueue(organizationId, id);
    if (outcome.ack) await this.out.sendForTicket(ctx, outcome.ack.ticketId, 'ack', { html: outcome.ack.html });
    if (outcome.help) await this.out.sendForTicket(ctx, outcome.help.ticketId, 'help', { html: outcome.help.html, to: outcome.help.to });
    if (outcome.heldDeskId) void this.tellAdmins(organizationId, outcome.heldDeskId, row.id, outcome.reason ?? 'Held');
    return outcome;
  }

  private async decide(tx: Tx, org: string, row: Prisma.SdInboundEmailGetPayload<object>, p: ParsedEmail, facts: AuthFacts | null, release: { by: string } | null): Promise<Outcome> {
    const box = await tx.sdMailbox.findFirstOrThrow({ where: { organizationId: org, id: row.mailboxId } });
    const desk = await tx.sdDesk.findFirstOrThrow({ where: { organizationId: org, id: box.deskId } });
    const flags = new Set<string>(row.flags);
    const finish = async (o: Outcome): Promise<Outcome> => {
      await tx.sdInboundEmail.update({
        where: { id: row.id },
        data: {
          verdict: o.verdict,
          reason: o.reason?.slice(0, 300) ?? null,
          ticketId: o.ticketId ?? row.ticketId,
          messageRowId: o.messageRowId ?? null,
          processedAt: new Date(),
          flags: [...flags],
          ...(release ? { releasedBy: release.by, releasedAt: new Date() } : {}),
        },
      });
      if (o.verdict === 'held') {
        await emit(tx, org, 'helpdesk.email.held', { inboundId: row.id, deskId: desk.id });
        o.heldDeskId = desk.id;
      }
      if (o.verdict === 'rejected') await emit(tx, org, 'helpdesk.email.rejected', { inboundId: row.id, deskId: desk.id });
      return o;
    };

    // Facts for the list, first time only.
    if (!release) {
      await tx.sdInboundEmail.update({
        where: { id: row.id },
        data: {
          fromAddress: p.from?.address ?? null,
          fromName: p.from?.name || null,
          toAddresses: [...p.to, ...p.cc].slice(0, 20),
          subject: p.subject || null,
          ...(facts ? { spf: facts.spf, dkim: facts.dkim, dmarc: facts.dmarc, dmarcPolicy: facts.dmarcPolicy, arc: facts.arc } : {}),
        },
      });
    }

    // 1. Delivery reports update the bounce list (US-G-017).
    if (p.report) {
      for (const a of p.report.recipients) await this.out.suppress(tx, org, a, p.report.kind, p.report.detail, box.id);
      return finish({ verdict: 'bounce', reason: `${p.report.kind === 'bounce' ? 'Bounce' : 'Complaint'} for ${p.report.recipients.join(', ')}`.slice(0, 300) });
    }
    if (!p.from) return finish({ verdict: 'rejected', reason: 'No sender address' });
    const from = p.from.address;

    // 2. Our own mail coming back (a loop).
    const own = await tx.sdMailbox.findMany({ where: { organizationId: org }, select: { address: true } });
    if (own.some((o) => o.address.toLowerCase() === from)) return finish({ verdict: 'loop', reason: 'Sent from one of our own desk addresses' });

    // 3. Who sent it (§14.3).
    const ownDomains = [...new Set([...own.map((o) => o.address.split('@')[1].toLowerCase()), ...(await tx.sdSendingDomain.findMany({ where: { organizationId: org }, select: { domain: true } })).map((d) => d.domain.toLowerCase())])];
    let verified = Boolean(release) || row.senderVerified;
    let signed = row.signed;
    if (!release) {
      if (!facts) return finish({ verdict: 'held', reason: 'The sender could not be checked' });
      const v = senderVerdict(facts, { ownDomains, trustedForwarders: box.trustedForwarders });
      verified = v.verified;
      signed = v.signed;
      if (!verified) flags.add('sender_not_verified');
      await tx.sdInboundEmail.update({ where: { id: row.id }, data: { senderVerified: v.verified, signed: v.signed } });
      if (v.action === 'reject') return finish({ verdict: 'rejected', reason: v.reason });
      if (v.action === 'hold') return finish({ verdict: 'held', reason: v.reason });
      // Display-name trick: an outside address using the name of someone in the company.
      if (p.from.name && (await this.looksInternal(tx, org, p.from.name, from))) flags.add('display_name_lookalike');
    }

    // 4. Automatic mail never makes a ticket and never gets an answer (loops, out of office, lists).
    const auto = autoReplyReason(p.headers, from);
    if (auto && !release) return finish({ verdict: 'loop', reason: `Automatic email (${auto})` });

    // 5. Per-sender limit (§14.4: 20 in 10 minutes, then held).
    if (!release) {
      const recent = await tx.sdInboundEmail.count({ where: { organizationId: org, fromAddress: from, receivedAt: { gt: new Date(Date.now() - SENDER_WINDOW_MS) } } });
      if (recent > SENDER_LIMIT) return finish({ verdict: 'held', reason: `More than ${SENDER_LIMIT} emails from this sender in 10 minutes` });
      if (/^yes/i.test(p.headers.get('x-spam-flag') ?? '') || /^yes/i.test(p.headers.get('x-spam-status') ?? '')) return finish({ verdict: 'spam', reason: 'Marked as spam by the receiving server' });
    }

    // 6. Email rules (US-G-018).
    const rules = await tx.sdEmailRule.findMany({ where: { organizationId: org, mailboxId: box.id, active: true }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
    const r = runRules(rules, { from, to: [...p.to, ...p.cc, ...p.deliveredTo], subject: p.subject, body: p.text, headers: p.headers });
    if (r.reject) return finish({ verdict: 'rejected', reason: r.reject });
    if (r.spam && !release) return finish({ verdict: 'spam', reason: r.spam });

    // 7. Threading.
    const thread = await this.findThread(tx, org, desk.id, p, verified);
    if (thread) return finish(await this.onThread(tx, org, row, p, thread, { verified, signed, released: Boolean(release) }));

    // 8. A new ticket.
    return finish(await this.newTicket(tx, org, row, p, box, desk, r, { verified, released: Boolean(release) }));
  }

  /** §14.3 display-name check: the name matches someone in the company but the address is not theirs. */
  private async looksInternal(tx: Tx, org: string, name: string, address: string): Promise<boolean> {
    const parts = name.trim().split(/\s+/);
    if (parts.length < 2) return false;
    const match = await tx.person.findFirst({ where: { organizationId: org, status: 'active', givenName: { equals: parts[0], mode: 'insensitive' }, familyName: { equals: parts.slice(1).join(' '), mode: 'insensitive' }, NOT: { primaryEmail: address } }, select: { id: true } });
    return Boolean(match && (await isInternal(tx, org, match.id)));
  }

  /** §9.1 step 6: (a) our signed token, (b) In-Reply-To / References, (c) the number in the subject, proven senders only. */
  private async findThread(tx: Tx, org: string, deskId: string, p: ParsedEmail, verified: boolean): Promise<Ticket | null> {
    const follow = async (t: Ticket | null): Promise<Ticket | null> => {
      for (let i = 0; t?.mergedIntoId && i < 3; i++) t = await tx.sdTicket.findFirst({ where: { organizationId: org, id: t.mergedIntoId } });
      return t;
    };
    const number = readReplyToken(this.out.tokenSecret(), org, [...p.to, ...p.cc, ...p.deliveredTo]);
    if (number) {
      const t = await tx.sdTicket.findFirst({ where: { organizationId: org, number } });
      if (t) return follow(t);
    }
    const ids = [...new Set([p.inReplyTo, ...p.references].filter((x): x is string => Boolean(x)))];
    if (ids.length) {
      const m = await tx.sdTicketMessage.findFirst({ where: { organizationId: org, emailMessageId: { in: ids } }, orderBy: { createdAt: 'desc' }, select: { ticketId: true } });
      const viaInbound = m ? null : await tx.sdInboundEmail.findFirst({ where: { organizationId: org, messageId: { in: ids }, ticketId: { not: null } }, select: { ticketId: true } });
      const id = m?.ticketId ?? viaInbound?.ticketId;
      if (id) return follow(await tx.sdTicket.findFirst({ where: { organizationId: org, id } }));
    }
    if (!verified || !p.from) return null;
    const desk = await tx.sdDesk.findFirstOrThrow({ where: { organizationId: org, id: deskId }, select: { numberPrefix: true, numberSuffix: true } });
    const re = new RegExp(`\\b(${desk.numberPrefix.replace(/[^A-Z0-9-]/g, '')}\\d{1,10}${desk.numberSuffix.replace(/[^A-Z0-9-]/g, '')})\\b`, 'i');
    const n = re.exec(p.subject)?.[1]?.toUpperCase();
    if (!n) return null;
    const t = await follow(await tx.sdTicket.findFirst({ where: { organizationId: org, deskId, number: n } }));
    if (!t) return null;
    const persons = await this.personIdsByEmail(tx, org, p.from.address);
    const watches = persons.length ? await tx.sdTicketWatcher.findFirst({ where: { organizationId: org, ticketId: t.id, personId: { in: persons } }, select: { id: true } }) : null;
    return persons.includes(t.requesterPersonId) || (t.requestedForPersonId && persons.includes(t.requestedForPersonId)) || watches ? t : null;
  }

  /** Persons with this email: a person's own email or an employee's work email. */
  private async personIdsByEmail(tx: Tx, org: string, email: string): Promise<string[]> {
    const [p, e] = await Promise.all([
      tx.person.findMany({ where: { organizationId: org, status: 'active', primaryEmail: email }, select: { id: true } }),
      tx.employee.findMany({ where: { organizationId: org, workEmail: email }, select: { personId: true } }),
    ]);
    return [...new Set([...p.map((x) => x.id), ...e.map((x) => x.personId).filter((x): x is string => Boolean(x))])];
  }

  // ------------------------------------------------------------------------------------------ replies on a ticket

  private async onThread(tx: Tx, org: string, row: { id: string }, p: ParsedEmail, t: Ticket, s: { verified: boolean; signed: boolean; released: boolean }): Promise<Outcome> {
    const from = p.from!.address;
    if (!s.verified) return { verdict: 'held', reason: `A reply to ${t.number} from a sender that is not proven` };
    // An agent of the desk (their work login's email) writing into the thread: commands and an internal note.
    const user = await tx.user.findFirst({ where: { organizationId: org, email: from, status: 'active' }, select: { id: true } });
    if (user && (await tx.sdDeskMember.findFirst({ where: { organizationId: org, deskId: t.deskId, userId: user.id, role: { in: ['agent', 'lead'] }, ...activeOn(todayIst()) }, select: { id: true } }))) {
      // US-G-019: commands only from a proven agent whose email is signed by their domain (DKIM).
      if (!s.signed && !s.released) return { verdict: 'held', reason: `An agent email to ${t.number} that is not signed (DKIM)` };
      return this.agentMail(tx, org, row, p, t, user.id);
    }
    const persons = await this.personIdsByEmail(tx, org, from);
    const isRequester = persons.includes(t.requesterPersonId) || Boolean(t.requestedForPersonId && persons.includes(t.requestedForPersonId));
    const watcher = persons.length ? await tx.sdTicketWatcher.findFirst({ where: { organizationId: org, ticketId: t.id, personId: { in: persons } } }) : null;
    let personId = isRequester ? (persons.includes(t.requesterPersonId) ? t.requesterPersonId : t.requestedForPersonId!) : (watcher?.personId ?? null);
    if (!personId) {
      if (!s.released) return { verdict: 'held', reason: `A reply to ${t.number} from someone who is not on the ticket` };
      // A desk admin let it in: the sender follows the ticket from now on.
      personId = persons[0] ?? (await ensureContact(tx, org, from, p.from!.name, null)).personId;
      await this.tickets.addWatcherIn(tx, { ctx: { organizationId: org, isSuperAdmin: false } }, t, personId, false);
    }
    const { commands, rest } = readCommands(p.text);
    if (commands.length) {
      const known = commands.filter((c) => c.name === 'close' && isRequester);
      if (known.length !== commands.length) return { ...(await this.append(tx, org, row, p, t, personId, rest)), help: { ticketId: t.id, to: from, html: helpHtml(commands) } };
      const closed = await this.requesterClose(tx, org, t);
      const res = rest ? await this.append(tx, org, row, p, t, personId, rest) : { verdict: 'accepted' as const, ticketId: t.id };
      return closed ? res : { ...res, help: { ticketId: t.id, to: from, html: '<p>We could not close the ticket by email. Open it in the help centre to close it.</p>' } };
    }
    return this.append(tx, org, row, p, t, personId, p.text);
  }

  /** The requester's email reply, exactly like a portal reply: reopens within the window, else a linked follow-up. */
  private async append(tx: Tx, org: string, row: { id: string }, p: ParsedEmail, t: Ticket, personId: string, text: string): Promise<Outcome> {
    const ctx = { organizationId: org, isSuperAdmin: false };
    const res = await this.requesters.replyIn(tx, { ctx, userId: null }, t, personId, textToHtml(text || '(no text)'), { channel: 'email', emailMessageId: p.messageId || null, inboundEmailId: row.id });
    if (res.followUp) {
      const n = await tx.sdTicket.findFirstOrThrow({ where: { organizationId: org, id: res.followUp.id } });
      const first = await tx.sdTicketMessage.findFirst({ where: { organizationId: org, ticketId: n.id }, orderBy: { createdAt: 'asc' }, select: { id: true } });
      return { verdict: 'accepted', reason: `Follow-up of ${t.number}`, ticketId: n.id, messageRowId: first?.id ?? null, scan: await this.saveFiles(tx, org, n, first?.id ?? null, p, personId) };
    }
    return { verdict: 'accepted', ticketId: t.id, messageRowId: res.id, scan: await this.saveFiles(tx, org, t, res.id, p, personId) };
  }

  /** "#close" from the requester: solves the ticket when the desk's rules allow it. */
  private async requesterClose(tx: Tx, org: string, t: Ticket): Promise<boolean> {
    if (!OPEN_STATES.includes(t.systemState)) return true;
    const solved = await tx.sdStatus.findFirst({ where: { organizationId: org, deskId: t.deskId, systemState: 'solved', active: true, OR: [{ ticketTypeId: t.typeId }, { ticketTypeId: null }] }, orderBy: [{ ticketTypeId: { sort: 'asc', nulls: 'last' } }, { sortOrder: 'asc' }] });
    if (!solved) return false;
    try {
      await tx.$executeRaw`SAVEPOINT sd_close`;
      await this.tickets.applyIn(tx, systemActor(org), t, { statusId: solved.id }, 'The requester closed it by email');
      await tx.$executeRaw`RELEASE SAVEPOINT sd_close`;
      return true;
    } catch {
      await tx.$executeRaw`ROLLBACK TO SAVEPOINT sd_close`;
      return false;
    }
  }

  /** A proven, signed agent email: commands run as that agent with their own rights; the rest is an internal note. */
  private async agentMail(tx: Tx, org: string, row: { id: string }, p: ParsedEmail, t: Ticket, userId: string): Promise<Outcome> {
    const a = await this.access.actorFor(org, userId);
    if (!a || !canWork(a, t.deskId)) return { verdict: 'held', reason: `${p.from!.address} cannot work tickets on this desk` };
    const { commands, rest } = readCommands(p.text);
    const failed: string[] = [];
    let cur = t;
    for (const c of commands) {
      try {
        await tx.$executeRaw`SAVEPOINT sd_cmd`;
        cur = await this.runAgentCommand(tx, a, cur, c);
        await tx.$executeRaw`RELEASE SAVEPOINT sd_cmd`;
      } catch (e) {
        await tx.$executeRaw`ROLLBACK TO SAVEPOINT sd_cmd`;
        failed.push(`#${c.name}${c.arg ? ` ${c.arg}` : ''}: ${(e as { response?: { message?: string } }).response?.message ?? (e as Error).message}`);
      }
    }
    let messageRowId: string | null = null;
    if (rest) {
      const { bodyHtml, bodyText, found } = this.tickets.cleanMasked(textToHtml(rest));
      const m = await tx.sdTicketMessage.create({ data: { organizationId: org, deskId: t.deskId, ticketId: t.id, kind: 'note', side: 'agent', authorUserId: userId, bodyHtml, bodyText, channel: 'email', emailMessageId: p.messageId || null, inboundEmailId: row.id } });
      await this.tickets.keepPii(tx, t, m.id, found);
      messageRowId = m.id;
      await emit(tx, org, 'helpdesk.ticket.note_added', { ticketId: t.id, deskId: t.deskId, messageId: m.id, channel: 'email' });
    }
    await audit(tx, a, 'desk.ticket.email_commands', 'sd_ticket', t.id, { number: t.number, commands: commands.map((c) => c.name), failed: failed.length, inboundId: row.id });
    return {
      verdict: 'accepted',
      ticketId: t.id,
      messageRowId,
      help: failed.length ? { ticketId: t.id, to: p.from!.address, html: `<p>Some commands did not run:</p><ul>${failed.map((f) => `<li>${escapeHtml(f)}</li>`).join('')}</ul><p>${escapeHtml(COMMAND_HELP)}</p>` } : null,
    };
  }

  private async runAgentCommand(tx: Tx, a: DeskActor, t: Ticket, c: EmailCommand): Promise<Ticket> {
    const org = a.ctx.organizationId;
    if (c.name === 'status') {
      const want = c.arg.toLowerCase();
      const s = (await tx.sdStatus.findMany({ where: { organizationId: org, deskId: t.deskId, active: true, OR: [{ ticketTypeId: null }, { ticketTypeId: t.typeId }] } })).find((x) => x.label.toLowerCase() === want || x.systemState === want.replace(/\s+/g, '_'));
      if (!s) throw new BadRequestException('No such status on this desk.');
      return this.tickets.applyIn(tx, a, t, { statusId: s.id }, 'Email command');
    }
    if (c.name === 'priority') {
      const n = Number(c.arg.replace(/^p/i, ''));
      if (!Number.isInteger(n) || n < 1 || n > 4) throw new BadRequestException('Priority is 1 to 4.');
      return this.tickets.applyIn(tx, a, t, { priority: n, priorityReason: 'Email command' });
    }
    if (c.name === 'assign') {
      const target = c.arg.toLowerCase() === 'me' ? a.userId : (await tx.user.findFirst({ where: { organizationId: org, email: c.arg.toLowerCase(), status: 'active' }, select: { id: true } }))?.id;
      if (!target) throw new BadRequestException('No such colleague.');
      return this.tickets.assignIn(tx, a, t, target, undefined, 'Email command');
    }
    if (c.name === 'tag') {
      if (!/^[\p{L}\p{N}][\p{L}\p{N} _-]{0,39}$/u.test(c.arg)) throw new BadRequestException('A tag is one short word.');
      return this.tickets.applyIn(tx, a, t, { tags: [...new Set([...t.tags, c.arg])] }, 'Email command');
    }
    if (c.name === 'note') return t;
    throw new BadRequestException('Unknown command.');
  }

  // ------------------------------------------------------------------------------------------ new tickets

  private async newTicket(
    tx: Tx,
    org: string,
    row: { id: string },
    p: ParsedEmail,
    box: Prisma.SdMailboxGetPayload<object>,
    desk: Prisma.SdDeskGetPayload<object>,
    r: ReturnType<typeof runRules>,
    s: { verified: boolean; released: boolean },
  ): Promise<Outcome> {
    const from = p.from!.address;
    const ctx = { organizationId: org, isSuperAdmin: false };
    const customer = desk.kind === 'customer_support';
    const known = await this.personIdsByEmail(tx, org, from);
    let personId: string;
    if (known.length) {
      // Never link mail that is not proven to someone we know (founder rule, 8 Oct 2026).
      if (!s.verified && !s.released) return { verdict: 'held', reason: 'Uses the address of someone we know, but the sender is not proven' };
      personId = known[0];
      if (!customer && !(await isInternal(tx, org, personId))) return { verdict: 'held', reason: 'Not someone in your company' };
    } else if (!customer) {
      return { verdict: 'held', reason: 'Not someone in your company' };
    } else if (s.verified || s.released) {
      personId = (await ensureContact(tx, org, from, p.from!.name, null)).personId;
    } else {
      // An unknown outside sender who is not proven: a new person, kept out of any account, ticket marked "not verified".
      const [given, ...rest] = (p.from!.name || from.split('@')[0]).split(/\s+/);
      const person = await tx.person.create({ data: { organizationId: org, givenName: given.slice(0, 100), familyName: rest.join(' ').slice(0, 100) || null, primaryEmail: from } });
      personId = person.id;
      const c = await tx.sdCustomerContact.create({ data: { organizationId: org, personId } });
      await tx.personRole.create({ data: { organizationId: org, personId, roleType: 'external_login', sourceTable: 'sd_customer_contacts', sourceId: c.id, startOn: new Date(`${todayIst()}T00:00:00Z`) } });
    }
    // A rule may route to another category of this desk only.
    const categoryId = r.categoryId && (await tx.sdCategory.findFirst({ where: { organizationId: org, deskId: desk.id, id: r.categoryId, active: true }, select: { id: true } })) ? r.categoryId : (box.defaultCategoryId ?? undefined);
    const template = box.defaultTemplateId ? await tx.sdTemplate.findFirst({ where: { organizationId: org, deskId: desk.id, id: box.defaultTemplateId, active: true } }) : null;
    const defaults = (template?.defaults ?? {}) as { categoryId?: string; priority?: number; tags?: string[] };
    const t = await this.tickets.createIn(tx, { ctx, userId: null }, {
      deskId: desk.id,
      typeId: box.defaultTypeId ?? template?.ticketTypeId ?? undefined,
      categoryId: categoryId ?? defaults.categoryId,
      subject: p.subject || '(no subject)',
      bodyHtml: textToHtml(p.text || p.fullText.slice(0, 20_000) || '(no text)'),
      requesterPersonId: personId,
      openedByUserId: null,
      channel: 'email',
      side: 'requester',
      authorPersonId: personId,
      tags: [...r.tags, ...(defaults.tags ?? [])],
      priority: r.priority ?? defaults.priority,
      custom: Object.keys(r.fields).length ? r.fields : undefined,
      senderVerified: s.verified,
      emailMessageId: p.messageId || null,
      inboundEmailId: row.id,
    });
    for (const [i, title] of (template?.checklist ?? []).entries()) await tx.sdTask.create({ data: { organizationId: org, deskId: desk.id, ticketId: t.id, title, checklist: true, sortOrder: i } });
    // CCs follow the ticket (US-G-004): only from a proven sender, only people we know or (customer desks) new contacts.
    if (s.verified) {
      const ours = new Set((await tx.sdMailbox.findMany({ where: { organizationId: org }, select: { address: true } })).map((m) => m.address.toLowerCase()));
      for (const cc of [...new Set([...p.to, ...p.cc])].filter((x) => x !== from && !ours.has(x) && !/\+t\./.test(x)).slice(0, 10)) {
        const ids = await this.personIdsByEmail(tx, org, cc);
        const watcher = ids[0] ?? (customer ? (await ensureContact(tx, org, cc, '', null)).personId : null);
        if (watcher && watcher !== personId && (customer || (await isInternal(tx, org, watcher)))) await this.tickets.addWatcherIn(tx, { ctx }, t, watcher, false);
      }
    }
    const first = await tx.sdTicketMessage.findFirst({ where: { organizationId: org, ticketId: t.id }, orderBy: { createdAt: 'asc' }, select: { id: true } });
    const scan = await this.saveFiles(tx, org, t, first?.id ?? null, p, personId);
    if (!s.verified) await this.tickets.event(tx, t, 'sender_not_verified', null, null, { by: null, reason: 'The email did not pass the sender checks (SPF, DKIM, DMARC)' });
    // US-G-019: an acknowledgement with the number and suggested articles. Never to a sender who is not proven, never
    // to an address on the bounce list (MailOutService checks), never for a held plan.
    const ack = box.autoAck && s.verified && t.systemState !== 'on_hold' ? { ticketId: t.id, html: await this.out.ackHtml(tx, org, t, box.ackText) } : null;
    return { verdict: 'accepted', ticketId: t.id, messageRowId: first?.id ?? null, ack, scan };
  }

  /** Files from the email: the desk's type list, real type from the bytes, then the virus scan (§14.2). */
  private async saveFiles(tx: Tx, org: string, t: Ticket, messageId: string | null, p: ParsedEmail, personId: string): Promise<string[]> {
    const ok: string[] = [];
    const refused: string[] = [];
    for (const f of p.attachments) {
      try {
        await tx.$executeRaw`SAVEPOINT sd_file`;
        const row = await this.files.store(tx, { organizationId: org }, t, { originalname: f.fileName, buffer: f.content }, 'requester', { personId });
        if (messageId) await tx.sdAttachment.update({ where: { id: row.id }, data: { messageId } });
        await tx.$executeRaw`RELEASE SAVEPOINT sd_file`;
        ok.push(row.id);
      } catch (e) {
        await tx.$executeRaw`ROLLBACK TO SAVEPOINT sd_file`;
        refused.push(`${f.fileName.slice(0, 80)}: ${(e as { response?: { message?: string } }).response?.message ?? 'not accepted'}`);
      }
    }
    if (p.droppedAttachments) refused.push(`${p.droppedAttachments} more file(s): at most 10 files per email`);
    if (refused.length) {
      const text = `Some files in the email were not added:\n${refused.join('\n')}`;
      await tx.sdTicketMessage.create({ data: { organizationId: org, deskId: t.deskId, ticketId: t.id, kind: 'system', side: 'system', bodyHtml: textToHtml(text), bodyText: text, channel: 'system' } });
    }
    return ok;
  }

  private async tellAdmins(organizationId: string, deskId: string, inboundId: string, reason: string) {
    try {
      const ctx = { organizationId, isSuperAdmin: false };
      const admins = await this.tenantPrisma.forTenant(ctx, (tx) => tx.sdDeskMember.findMany({ where: { organizationId, deskId, role: 'admin', ...activeOn(todayIst()) }, select: { userId: true } }));
      await this.notifications.notifySystem(ctx, admins.map((x) => x.userId), 'helpdesk.email.held', { entityType: 'sd_inbound_email', entityId: inboundId, contextText: `Email held: ${reason}`.slice(0, 200), linkPath: `/yx/desk/setup?tab=email&held=${inboundId}` }, { subject: 'An email to your desk is held', html: `<p>An email to your desk was held for a check (${escapeHtml(reason)}). Open the desk set-up to look at it.</p>` });
    } catch (e) {
      this.logger.warn(`Held-mail notice not sent: ${(e as Error).message}`);
    }
  }

  // ------------------------------------------------------------------------------------------ polling and purge

  async pollAll(make: (kind: string, config: unknown) => MailboxPoller | null = pollerFor) {
    const boxes = await deskSystem(this.tenantPrisma, { organizationId: null, isSuperAdmin: true }, (tx) => tx.sdMailbox.findMany({ where: { kind: { in: ['imap', 'm365_oauth', 'gmail_oauth'] }, status: 'active', configEncrypted: { not: null } } }));
    for (const box of boxes) {
      const ctx = { organizationId: box.organizationId, isSuperAdmin: false };
      try {
        const poller = make(box.kind, JSON.parse(this.crypto.decrypt(box.configEncrypted!)));
        if (!poller) continue;
        const res = await poller.poll(box.pollCursor);
        for (const m of res.messages) await this.accept(box.organizationId, box, m.raw, { trustReceived: true });
        await this.tenantPrisma.forTenant(ctx, (tx) => tx.sdMailbox.update({ where: { id: box.id }, data: { pollCursor: res.cursor, lastPolledAt: new Date(), lastError: null, status: 'active' } }));
      } catch (e) {
        this.logger.warn(`Mailbox ${box.id} poll failed: ${(e as Error).message}`);
        await this.tenantPrisma.forTenant(ctx, (tx) => tx.sdMailbox.update({ where: { id: box.id }, data: { lastError: (e as Error).message.slice(0, 500), lastPolledAt: new Date() } })).catch(() => undefined);
      }
    }
  }

  /** §5.2: the raw mail is kept 30 days for proof, then only the row's facts. */
  async purge() {
    const rows = await deskSystem(this.tenantPrisma, { organizationId: null, isSuperAdmin: true }, (tx) => tx.sdInboundEmail.findMany({ where: { rawBlobKey: { not: null }, rawPurgeAfter: { lt: new Date() } }, select: { id: true, organizationId: true, rawBlobKey: true }, take: 1000 }));
    for (const r of rows) {
      await this.files.drop(r.rawBlobKey!).catch((e) => this.logger.warn(`Raw mail ${r.id} not removed: ${(e as Error).message}`));
      await deskSystem(this.tenantPrisma, { organizationId: r.organizationId, isSuperAdmin: false }, (tx) => tx.sdInboundEmail.update({ where: { id: r.id }, data: { rawBlobKey: null } }));
    }
    return rows.length;
  }

  // ------------------------------------------------------------------------------------------ set-up (desk.mailbox.manage)

  private view(b: Prisma.SdMailboxGetPayload<object>) {
    const config = b.configEncrypted ? (JSON.parse(this.crypto.decrypt(b.configEncrypted)) as Record<string, unknown>) : null;
    // Secrets never leave the server: only which settings are filled in.
    const shown = config ? Object.fromEntries(Object.entries(config).map(([k, v]) => [k, /secret|password|token/i.test(k) ? Boolean(v) : v])) : null;
    return {
      id: b.id,
      deskId: b.deskId,
      address: b.address,
      kind: b.kind,
      displayName: b.displayName,
      sendingDomainId: b.sendingDomainId,
      defaultCategoryId: b.defaultCategoryId,
      defaultTypeId: b.defaultTypeId,
      defaultTemplateId: b.defaultTemplateId,
      autoAck: b.autoAck,
      ackText: b.ackText,
      trustedForwarders: b.trustedForwarders,
      status: b.status,
      lastPolledAt: b.lastPolledAt,
      lastError: b.lastError,
      config: shown,
      version: b.version,
    };
  }

  async mailboxes(a: DeskActor, deskId: string) {
    requireSetUp(a, deskId, 'desk.mailbox.manage');
    return this.tenantPrisma.forTenant(a.ctx, async (tx) => {
      const rows = await tx.sdMailbox.findMany({ where: { organizationId: a.ctx.organizationId, deskId }, orderBy: { createdAt: 'asc' } });
      // The desk sends from its first active mailbox; from its own address only when the domain checks pass (US-G-017).
      const sender = await this.out.sender(tx, a.ctx.organizationId, deskId);
      return rows.map((b) => ({ ...this.view(b), sendsMail: sender?.box.id === b.id, sendsFromOwnDomain: sender?.box.id === b.id && Boolean(sender?.ownDomain) }));
    });
  }

  private checkConfig(kind: string, config: Record<string, unknown> | undefined) {
    const need: Record<string, string[]> = { imap: ['host', 'user', 'password'], m365_oauth: ['tenantId', 'clientId', 'clientSecret', 'user'], gmail_oauth: ['clientId', 'clientSecret', 'refreshToken'] };
    if (!need[kind]) return;
    const missing = need[kind].filter((k) => !config?.[k]);
    if (missing.length) throw new BadRequestException(`Fill in ${missing.join(', ')}.`);
    if (kind === 'imap' && (!/^[a-z0-9.-]{3,253}$/i.test(String(config!.host)) || /^\d+\.\d+\.\d+\.\d+$/.test(String(config!.host)))) throw new BadRequestException('The IMAP server is a host name like imap.example.com.');
  }

  private secrets() {
    const token = randomBytes(32).toString('base64url');
    const secret = randomBytes(32).toString('base64url');
    return { token, secret };
  }

  private hookUrl(org: string, token: string) {
    return `${(process.env.API_ORIGIN ?? 'http://localhost:3001').replace(/\/$/, '')}/api/v1/desk/inbound/email/${org}/${token}`;
  }

  /** A new mailbox. Hosted and forwarded ones get their webhook address and signing secret, shown once. */
  async createMailbox(a: DeskActor, deskId: string, dto: MailboxDto) {
    requireSetUp(a, deskId, 'desk.mailbox.manage');
    this.checkConfig(dto.kind, dto.config);
    const hosted = dto.kind === 'hosted' || dto.kind === 'forward';
    const { token, secret } = this.secrets();
    try {
      return await this.tenantPrisma.forTenant(a.ctx, async (tx) => {
        const org = a.ctx.organizationId;
        if (!(await tx.sdDesk.findFirst({ where: { organizationId: org, id: deskId }, select: { id: true } }))) throw new NotFoundException('No such desk.');
        await this.out.checkDomainOf(tx, org, dto.address, dto.sendingDomainId);
        const b = await tx.sdMailbox.create({
          data: {
            organizationId: org,
            deskId,
            address: dto.address,
            kind: dto.kind,
            displayName: dto.displayName ?? null,
            tokenHash: hosted ? sha256(token) : null,
            signingSecretEncrypted: hosted ? this.crypto.encrypt(secret) : null,
            configEncrypted: !hosted && dto.config ? this.crypto.encrypt(JSON.stringify(dto.config)) : null,
            sendingDomainId: dto.sendingDomainId ?? null,
            defaultCategoryId: dto.defaultCategoryId ?? null,
            defaultTypeId: dto.defaultTypeId ?? null,
            defaultTemplateId: dto.defaultTemplateId ?? null,
            autoAck: dto.autoAck ?? true,
            ackText: dto.ackText || null,
            trustedForwarders: dto.trustedForwarders ?? [],
            createdBy: a.userId,
          },
        });
        await audit(tx, a, 'desk.mailbox.created', 'sd_mailbox', b.id, { deskId, address: b.address, kind: b.kind, credentials: Boolean(dto.config) });
        return { ...this.view(b), ...(hosted ? { webhookUrl: this.hookUrl(org, token), signingSecret: secret } : {}) };
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('That address is already a desk mailbox.');
      throw e;
    }
  }

  async updateMailbox(a: DeskActor, deskId: string, id: string, dto: UpdateMailboxDto) {
    requireSetUp(a, deskId, 'desk.mailbox.manage');
    return this.tenantPrisma.forTenant(a.ctx, async (tx) => {
      const org = a.ctx.organizationId;
      const b = await tx.sdMailbox.findFirst({ where: { organizationId: org, deskId, id } });
      if (!b) throw new NotFoundException('No such mailbox.');
      if (b.version !== dto.version) throw new ConflictException({ statusCode: 409, code: 'MAILBOX_CHANGED', message: 'Someone changed this mailbox. Reload to see the latest.' });
      if (dto.config) this.checkConfig(b.kind, dto.config);
      if (dto.sendingDomainId !== undefined) await this.out.checkDomainOf(tx, org, b.address, dto.sendingDomainId);
      const { version: _v, config, ...rest } = dto;
      const after = await tx.sdMailbox.update({
        where: { id: b.id },
        data: { ...rest, ackText: rest.ackText === undefined ? undefined : rest.ackText || null, ...(config && !['hosted', 'forward'].includes(b.kind) ? { configEncrypted: this.crypto.encrypt(JSON.stringify(config)), pollCursor: null } : {}), version: { increment: 1 } },
      });
      await audit(tx, a, 'desk.mailbox.updated', 'sd_mailbox', b.id, { changes: Object.keys(rest), credentials: Boolean(config) });
      return this.view(after);
    });
  }

  /** A new webhook address and secret (the old ones stop at once). */
  async rotateMailbox(a: DeskActor, deskId: string, id: string) {
    requireSetUp(a, deskId, 'desk.mailbox.manage');
    const { token, secret } = this.secrets();
    return this.tenantPrisma.forTenant(a.ctx, async (tx) => {
      const org = a.ctx.organizationId;
      const res = await tx.sdMailbox.updateMany({ where: { organizationId: org, deskId, id, kind: { in: ['hosted', 'forward'] } }, data: { tokenHash: sha256(token), signingSecretEncrypted: this.crypto.encrypt(secret), version: { increment: 1 } } });
      if (!res.count) throw new NotFoundException('No such mailbox.');
      await audit(tx, a, 'desk.mailbox.secret_rotated', 'sd_mailbox', id);
      return { webhookUrl: this.hookUrl(org, token), signingSecret: secret };
    });
  }

  private async box(tx: Tx, a: DeskActor, deskId: string, mailboxId: string) {
    const b = await tx.sdMailbox.findFirst({ where: { organizationId: a.ctx.organizationId, deskId, id: mailboxId }, select: { id: true } });
    if (!b) throw new NotFoundException('No such mailbox.');
  }

  async rules(a: DeskActor, deskId: string, mailboxId: string) {
    requireSetUp(a, deskId, 'desk.mailbox.manage');
    return this.tenantPrisma.forTenant(a.ctx, async (tx) => {
      await this.box(tx, a, deskId, mailboxId);
      return tx.sdEmailRule.findMany({ where: { organizationId: a.ctx.organizationId, mailboxId }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
    });
  }

  async saveRule(a: DeskActor, deskId: string, mailboxId: string, ruleId: string | null, dto: EmailRuleDto) {
    requireSetUp(a, deskId, 'desk.mailbox.manage');
    const v = (dto.actionValue ?? {}) as Record<string, unknown>;
    if (dto.action === 'route' && typeof v.categoryId !== 'string') throw new BadRequestException('Choose the category to route to.');
    if (dto.action === 'tag' && !(typeof v.tag === 'string' && /^[\p{L}\p{N}][\p{L}\p{N} _-]{0,39}$/u.test(v.tag))) throw new BadRequestException('Give the tag to add.');
    if (dto.action === 'priority' && !(Number.isInteger(v.priority) && Number(v.priority) >= 1 && Number(v.priority) <= 4)) throw new BadRequestException('Priority is 1 to 4.');
    if (dto.action === 'parse_field' && !(typeof v.key === 'string' && v.key.length <= 60 && typeof v.field === 'string' && /^[a-z][a-z0-9_]{0,39}$/.test(v.field))) throw new BadRequestException('Give the line name to look for and the field to fill.');
    return this.tenantPrisma.forTenant(a.ctx, async (tx) => {
      const org = a.ctx.organizationId;
      await this.box(tx, a, deskId, mailboxId);
      if (dto.action === 'route' && !(await tx.sdCategory.findFirst({ where: { organizationId: org, deskId, id: String(v.categoryId) }, select: { id: true } }))) throw new BadRequestException('Choose a category of this desk.');
      const data = { name: dto.name, field: dto.field, headerName: dto.field === 'header' ? (dto.headerName ?? '').toLowerCase() : null, op: dto.op, value: dto.value, action: dto.action, actionValue: (dto.actionValue ?? {}) as Prisma.InputJsonValue, stop: dto.stop ?? false, active: dto.active ?? true, sortOrder: dto.sortOrder ?? 0 };
      const rule = ruleId ? ((await tx.sdEmailRule.updateMany({ where: { organizationId: org, mailboxId, id: ruleId }, data })).count ? { id: ruleId } : null) : await tx.sdEmailRule.create({ data: { organizationId: org, mailboxId, ...data, createdBy: a.userId } });
      if (!rule) throw new NotFoundException('No such rule.');
      await audit(tx, a, ruleId ? 'desk.email_rule.updated' : 'desk.email_rule.created', 'sd_email_rule', rule.id, { mailboxId, ...data });
      return { id: rule.id };
    });
  }

  async deleteRule(a: DeskActor, deskId: string, mailboxId: string, ruleId: string) {
    requireSetUp(a, deskId, 'desk.mailbox.manage');
    return this.tenantPrisma.forTenant(a.ctx, async (tx) => {
      await this.box(tx, a, deskId, mailboxId);
      const res = await tx.sdEmailRule.deleteMany({ where: { organizationId: a.ctx.organizationId, mailboxId, id: ruleId } });
      if (!res.count) throw new NotFoundException('No such rule.');
      await audit(tx, a, 'desk.email_rule.deleted', 'sd_email_rule', ruleId, { mailboxId });
      return { deleted: true };
    });
  }

  /** Held, spam, rejected, loop and bounce emails of a desk (accepted ones show the ticket number only). */
  async inbound(a: DeskActor, deskId: string, verdict = 'held') {
    requireSetUp(a, deskId, 'desk.mailbox.manage');
    return this.tenantPrisma.forTenant(a.ctx, async (tx) => {
      const rows = await tx.sdInboundEmail.findMany({ where: { organizationId: a.ctx.organizationId, deskId, ...(verdict === 'all' ? {} : { verdict }) }, orderBy: { receivedAt: 'desc' }, take: 200 });
      return rows.map((r) => ({
        id: r.id,
        receivedAt: r.receivedAt,
        from: r.fromAddress,
        fromName: r.fromName,
        // An accepted email's subject is the ticket's business: show the number only.
        subject: r.verdict === 'accepted' ? null : r.subject,
        verdict: r.verdict,
        reason: r.reason,
        checks: { spf: r.spf, dkim: r.dkim, dmarc: r.dmarc, dmarcPolicy: r.dmarcPolicy, arc: r.arc, verified: r.senderVerified, signed: r.signed },
        flags: r.flags,
        ticketId: r.ticketId,
        released: Boolean(r.releasedAt),
      }));
    });
  }

  /** "Show original" for one held email: headers that matter and the text (never its HTML). */
  async inboundOne(a: DeskActor, deskId: string, id: string) {
    requireSetUp(a, deskId, 'desk.mailbox.manage');
    const row = await this.tenantPrisma.forTenant(a.ctx, (tx) => tx.sdInboundEmail.findFirst({ where: { organizationId: a.ctx.organizationId, deskId, id } }));
    if (!row) throw new NotFoundException('No such email.');
    if (row.verdict === 'accepted') throw new NotFoundException('Open the ticket to read this email.');
    const p = row.rawBlobKey ? await parseEmail(await this.files.get(row.rawBlobKey)) : null;
    await this.tenantPrisma.forTenant(a.ctx, (tx) => audit(tx, a, 'desk.inbound_email.opened', 'sd_inbound_email', id));
    return { id: row.id, from: row.fromAddress, fromName: row.fromName, to: row.toAddresses, subject: row.subject, verdict: row.verdict, reason: row.reason, flags: row.flags, receivedAt: row.receivedAt, text: p?.fullText.slice(0, 20_000) ?? null, files: p?.attachments.map((f) => f.fileName) ?? [] };
  }

  /** A desk admin lets a held (or spam) email through: it is processed as if its sender were proven (audited). */
  async release(a: DeskActor, deskId: string, id: string) {
    requireSetUp(a, deskId, 'desk.mailbox.manage');
    const row = await this.tenantPrisma.forTenant(a.ctx, (tx) => tx.sdInboundEmail.findFirst({ where: { organizationId: a.ctx.organizationId, deskId, id } }));
    if (!row) throw new NotFoundException('No such email.');
    if (!['held', 'spam'].includes(row.verdict)) throw new ConflictException('Only held or spam emails can be let through.');
    await this.tenantPrisma.forTenant(a.ctx, (tx) => audit(tx, a, 'desk.inbound_email.released', 'sd_inbound_email', id, { from: row.fromAddress, reason: row.reason }));
    const o = await this.process(a.ctx.organizationId, id, { by: a.userId });
    return { verdict: o?.verdict ?? row.verdict, ticketId: o?.ticketId ?? null, reason: o?.reason ?? null };
  }
}

/** The desk itself acting (status changes from email replies); never holds keys or seats. */
const systemActor = (org: string): DeskActor => ({ ctx: { organizationId: org, isSuperAdmin: false }, userId: null as unknown as string, keys: new Set(), roles: new Map() });

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function helpHtml(commands: EmailCommand[]) {
  return `<p>We did not understand ${commands.map((c) => `#${escapeHtml(c.name)}`).join(', ')}, so nothing changed.</p><p>${escapeHtml(COMMAND_HELP)}</p>`;
}

function ipInRange(ip: string, range: string): boolean {
  try {
    const a = ipaddr.process(ip);
    if (!range.includes('/')) return a.toString() === ipaddr.process(range).toString();
    const [net, bits] = ipaddr.parseCIDR(range);
    return a.kind() === net.kind() && (a as ipaddr.IPv4).match(net as ipaddr.IPv4, bits);
  } catch {
    return false;
  }
}
