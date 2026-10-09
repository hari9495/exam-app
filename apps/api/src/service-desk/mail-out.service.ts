import { forAcknowledgement } from './kb-search';
import { BadRequestException, ConflictException, Inject, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Job, Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import { Prisma } from '@prisma/client';
import { generateKeyPairSync, randomUUID } from 'crypto';
import { promises as dns } from 'dns';
import { OrgSecretsCryptoService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { EmailService } from '../email/email.service';
import { REDIS_CONNECTION, logBullErrors } from '../jobs/redis-connection';
import { Tx } from '../org-structure/org-structure.service';
import { DeskActor, audit, deskSystem, has } from './desk-access';
import { DnsResolver, replyToken, resolverFromEnv, withToken } from './mail-auth';
import { REPLY_MARKER } from './mail-parse';
import { htmlToText } from './rich-text';
import { isInternal } from './customers.service';

export const MAIL_OUT_QUEUE = 'sd-mail-out';

// SD-1.18 email out (US-G-017, §9.2). Desk mail goes through the existing nodemailer SMTP transport (EmailService):
//   - From the desk mailbox when the company sends from its own domain and that domain's SPF and DKIM checks pass,
//     signed with the company's DKIM key; otherwise from YukthiX's address with the desk name (the set-up screen says so);
//   - Reply-To the mailbox with a signed ticket token, plus Message-ID / In-Reply-To / References for threading;
//   - "Auto-Submitted: auto-replied" on every automatic mail (acknowledgements, help replies), so other systems never
//     answer them;
//   - never to an address on the bounce list; no read receipts, tracking pixels or tracked links (D9: plain cleaned
//     HTML, no images at all).

export const SD_DNS_RESOLVER = 'SD_DNS_RESOLVER';
export const defaultResolver: DnsResolver = (name, type) => dns.resolve(name, type as 'TXT') as Promise<string[][]>;
export const dnsResolverFactory = (): DnsResolver => resolverFromEnv() ?? defaultResolver;

/** Our SPF include, published by the YukthiX sending service (GO-LIVE-CHECKLIST: desk email). */
export const spfInclude = () => process.env.SD_SPF_INCLUDE || '_spf.yukthix.com';
const webOrigin = () => (process.env.WEB_ORIGIN ?? 'http://localhost:3000').replace(/\/$/, '');

export interface DnsRecord {
  type: 'TXT';
  host: string;
  value: string;
  ok: boolean;
  what: string;
}

type Kind = 'reply' | 'ack' | 'help' | 'notice';
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

@Injectable()
export class MailOutService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MailOutService.name);
  private readonly queue: Queue;
  private worker: Worker | null = null;

  constructor(
    @Inject(REDIS_CONNECTION) private readonly connection: Redis,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly email: EmailService,
    private readonly crypto: OrgSecretsCryptoService,
    @Inject(SD_DNS_RESOLVER) private readonly resolve: DnsResolver,
  ) {
    this.queue = logBullErrors(new Queue(MAIL_OUT_QUEUE, { connection }), MAIL_OUT_QUEUE);
  }

  async onModuleInit() {
    this.worker = logBullErrors(new Worker(MAIL_OUT_QUEUE, (job) => this.run(job), { connection: this.connection }), MAIL_OUT_QUEUE);
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue.close();
  }

  /**
   * An agent's reply goes out by email (to the requester of an email ticket, or a notice to an outside contact) on a
   * job, so a reply written inside a bigger change (tracker solved, scenario) is sent only once it is committed.
   */
  async queueReply(organizationId: string, ticketId: string, messageId: string) {
    await this.queue.add('reply', { organizationId, ticketId, messageId }, { jobId: `reply-${messageId}`, delay: 1_000, attempts: 3, backoff: { type: 'exponential', delay: 5_000 }, removeOnComplete: true, removeOnFail: 100 }).catch((e) => this.logger.warn(`Desk reply mail not queued: ${(e as Error).message}`));
  }

  private async run(job: Job<{ organizationId: string; ticketId: string; messageId: string }>) {
    const { organizationId, ticketId, messageId } = job.data;
    const ctx = { organizationId, isSuperAdmin: false };
    const m = await deskSystem(this.tenantPrisma, ctx, (tx) => tx.sdTicketMessage.findFirst({ where: { organizationId, id: messageId, ticketId, kind: 'reply', side: 'agent' } }));
    // Not committed yet (or rolled back): try again shortly; after three tries it is dropped.
    if (!m) throw new Error('reply not found');
    if (m.emailMessageId) return;
    await this.sendForTicket(ctx, ticketId, 'reply', { messageId, html: m.bodyHtml });
  }

  /** The secret that signs reply tokens, derived from the org-secrets key (never stored). */
  tokenSecret(): string {
    return this.crypto.hmac('sd-reply-token', 'v1');
  }

  // ------------------------------------------------------------------------------------------ sending domains

  private requireMailbox(a: DeskActor) {
    if (!has(a, 'desk.mailbox.manage') || !(has(a, 'desk.desk.create') || [...a.roles.values()].includes('admin'))) {
      throw new NotFoundException('No such page.');
    }
  }

  records(d: { domain: string; dkimSelector: string; dkimPublicKey: string; spfOk: boolean; dkimOk: boolean; dmarcOk: boolean }): DnsRecord[] {
    return [
      { type: 'TXT', host: d.domain, value: `v=spf1 include:${spfInclude()} ~all`, ok: d.spfOk, what: 'SPF: lets YukthiX send for this domain (add the include to your existing SPF record if you have one)' },
      { type: 'TXT', host: `${d.dkimSelector}._domainkey.${d.domain}`, value: `v=DKIM1; k=rsa; p=${d.dkimPublicKey}`, ok: d.dkimOk, what: 'DKIM: proves the mail really comes from you' },
      { type: 'TXT', host: `_dmarc.${d.domain}`, value: 'v=DMARC1; p=quarantine; adkim=r; aspf=r', ok: d.dmarcOk, what: 'DMARC: tells other servers to distrust mail that fails the checks (recommended)' },
    ];
  }

  private domainView(d: Prisma.SdSendingDomainGetPayload<object>) {
    return { id: d.id, domain: d.domain, status: d.status, lastCheckedAt: d.lastCheckedAt, records: this.records(d) };
  }

  async domains(a: DeskActor) {
    this.requireMailbox(a);
    return this.tenantPrisma.forTenant(a.ctx, async (tx) => (await tx.sdSendingDomain.findMany({ where: { organizationId: a.ctx.organizationId }, orderBy: { domain: 'asc' } })).map((d) => this.domainView(d)));
  }

  /** A new sending domain gets its own 2048-bit DKIM key; the private half is kept encrypted, the public half shown. */
  async addDomain(a: DeskActor, domain: string) {
    this.requireMailbox(a);
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    try {
      return await this.tenantPrisma.forTenant(a.ctx, async (tx) => {
        const d = await tx.sdSendingDomain.create({
          data: {
            organizationId: a.ctx.organizationId,
            domain,
            dkimPrivateKeyEncrypted: this.crypto.encrypt(privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()),
            dkimPublicKey: publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
            createdBy: a.userId,
          },
        });
        await audit(tx, a, 'desk.sending_domain.added', 'sd_sending_domain', d.id, { domain });
        return this.domainView(d);
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('That domain is already added.');
      throw e;
    }
  }

  private async txt(name: string): Promise<string[]> {
    try {
      return ((await this.resolve(name, 'TXT')) as string[][]).map((r) => (Array.isArray(r) ? r.join('') : String(r)));
    } catch {
      return [];
    }
  }

  /** US-G-017 wizard: looks the three records up and says which are right. */
  async verifyDomain(a: DeskActor, id: string) {
    this.requireMailbox(a);
    return this.tenantPrisma.forTenant(a.ctx, async (tx) => {
      const d = await tx.sdSendingDomain.findFirst({ where: { organizationId: a.ctx.organizationId, id } });
      if (!d) throw new NotFoundException('No such domain.');
      const [root, key, dmarc] = await Promise.all([this.txt(d.domain), this.txt(`${d.dkimSelector}._domainkey.${d.domain}`), this.txt(`_dmarc.${d.domain}`)]);
      const spfOk = root.some((r) => /^v=spf1\s/i.test(r) && r.toLowerCase().includes(`include:${spfInclude().toLowerCase()}`));
      const dkimOk = key.some((r) => r.replace(/\s+/g, '').includes(`p=${d.dkimPublicKey}`));
      const dmarcOk = dmarc.some((r) => /^v=DMARC1/i.test(r.trim()));
      const status = spfOk && dkimOk ? 'verified' : 'failed';
      const after = await tx.sdSendingDomain.update({ where: { id: d.id }, data: { spfOk, dkimOk, dmarcOk, status, lastCheckedAt: new Date(), checkDetail: { spf: root.slice(0, 5), dkim: key.length > 0, dmarc: dmarc.slice(0, 2) } } });
      await audit(tx, a, 'desk.sending_domain.checked', 'sd_sending_domain', d.id, { domain: d.domain, spfOk, dkimOk, dmarcOk });
      return this.domainView(after);
    });
  }

  // ------------------------------------------------------------------------------------------ bounce list

  async bounces(a: DeskActor) {
    this.requireMailbox(a);
    return this.tenantPrisma.forTenant(a.ctx, (tx) => tx.sdEmailSuppression.findMany({ where: { organizationId: a.ctx.organizationId, clearedAt: null }, orderBy: { createdAt: 'desc' }, take: 500, select: { id: true, address: true, kind: true, reason: true, createdAt: true } }));
  }

  async clearBounce(a: DeskActor, id: string) {
    this.requireMailbox(a);
    return this.tenantPrisma.forTenant(a.ctx, async (tx) => {
      const res = await tx.sdEmailSuppression.updateMany({ where: { organizationId: a.ctx.organizationId, id, clearedAt: null }, data: { clearedAt: new Date(), clearedBy: a.userId } });
      if (!res.count) throw new NotFoundException('No such address on the list.');
      await audit(tx, a, 'desk.bounce.cleared', 'sd_email_suppression', id);
      return { cleared: true };
    });
  }

  /** Called by the inbound pipeline for delivery reports (bounces, complaints). */
  async suppress(tx: Tx, organizationId: string, address: string, kind: 'bounce' | 'complaint', reason: string, mailboxId: string) {
    await tx.$executeRaw`
      INSERT INTO sd_email_suppressions (organization_id, address, kind, reason, mailbox_id)
      VALUES (${organizationId}::uuid, ${address}, ${kind}, ${reason.slice(0, 300)}, ${mailboxId}::uuid)
      ON CONFLICT (organization_id, address) WHERE cleared_at IS NULL DO NOTHING`;
  }

  // ------------------------------------------------------------------------------------------ sending

  /** The mailbox a desk sends from (its first active one) with its domain, or null (then we never email). */
  async sender(tx: Tx, organizationId: string, deskId: string) {
    const box = await tx.sdMailbox.findFirst({ where: { organizationId, deskId, status: { in: ['active', 'error'] } }, orderBy: { createdAt: 'asc' } });
    if (!box) return null;
    const domain = box.sendingDomainId ? await tx.sdSendingDomain.findFirst({ where: { organizationId, id: box.sendingDomainId } }) : null;
    const desk = await tx.sdDesk.findFirstOrThrow({ where: { organizationId, id: deskId }, select: { name: true } });
    const ownDomain = domain?.status === 'verified' && box.address.toLowerCase().endsWith(`@${domain.domain.toLowerCase()}`) ? domain : null;
    return { box, desk, ownDomain };
  }

  /**
   * Sends one desk email for a ticket after its transaction committed. Fire and forget: a refused SMTP server only logs
   * (the dev server's 1026 has nothing listening). Returns whether it went.
   */
  async sendForTicket(ctx: TenantContext & { organizationId: string }, ticketId: string, kind: Kind, o: { messageId?: string; html?: string; to?: string } = {}): Promise<boolean> {
    try {
      const mail = await deskSystem(this.tenantPrisma, ctx, (tx) => this.compose(tx, ctx.organizationId, ticketId, kind, o));
      if (!mail) return false;
      const res = await this.email.send({ ...mail, organizationId: ctx.organizationId });
      if (!res.success) this.logger.warn(`Desk ${kind} mail for ticket ${ticketId} was not sent`);
      return res.success;
    } catch (e) {
      this.logger.warn(`Desk ${kind} mail for ticket ${ticketId} failed: ${(e as Error).message}`);
      return false;
    }
  }

  private async compose(tx: Tx, org: string, ticketId: string, kind: Kind, o: { messageId?: string; html?: string; to?: string }) {
    const t = await tx.sdTicket.findFirst({ where: { organizationId: org, id: ticketId } });
    if (!t) return null;
    const from = await this.sender(tx, org, t.deskId);
    if (!from) return null;
    // §11.2: the requester hears by the channel the ticket came from. Colleagues follow portal tickets in the app.
    if (kind === 'reply' && t.channel !== 'email' && (await isInternal(tx, org, t.requesterPersonId))) return null;
    const person = await tx.person.findFirst({ where: { organizationId: org, id: t.requesterPersonId }, select: { primaryEmail: true, givenName: true } });
    const to = (o.to ?? person?.primaryEmail ?? '').toLowerCase();
    if (!to) return null;
    if (await tx.sdEmailSuppression.findFirst({ where: { organizationId: org, address: to, clearedAt: null }, select: { id: true } })) {
      this.logger.warn(`Desk mail to a bounced address skipped (ticket ${t.number})`);
      return null;
    }
    const domainPart = from.ownDomain?.domain ?? from.box.address.split('@')[1];
    const msgId = `<sd.${o.messageId ?? randomUUID()}@${domainPart}>`;
    // Our Message-ID on the message row, so a reply that quotes it threads back here (§9.1 step 6b).
    if (o.messageId) await tx.sdTicketMessage.updateMany({ where: { organizationId: org, id: o.messageId, emailMessageId: null }, data: { emailMessageId: msgId } });
    // The thread: every Message-ID on this ticket (theirs and ours), newest last.
    const thread = (await tx.sdTicketMessage.findMany({ where: { organizationId: org, ticketId: t.id, emailMessageId: { not: null } }, orderBy: { createdAt: 'asc' }, select: { emailMessageId: true, side: true } })).filter((m) => m.emailMessageId !== msgId);
    const lastTheirs = [...thread].reverse().find((m) => m.side === 'requester')?.emailMessageId ?? thread[thread.length - 1]?.emailMessageId;
    const neutral = t.sensitive || t.private;
    const link = `${webOrigin()}/yx/desk/help/${t.id}`;
    const portal = await tx.sdPortalDesk.findFirst({ where: { organizationId: org, deskId: t.deskId } });
    const portalLink = portal ? await this.portalLink(tx, org, portal.portalId, t.id) : link;
    let body: string;
    let subject = `[${t.number}] ${neutral ? 'Your ticket' : t.subject}`;
    // An email ticket gets the reply itself; a portal ticket's outside requester gets a notice with the portal link.
    if (kind === 'reply' && !neutral && o.html && t.channel === 'email') {
      body = o.html;
    } else if (kind === 'reply' || kind === 'notice') {
      body = `<p>There is a new reply on your ticket ${esc(t.number)}.</p><p><a href="${esc(portalLink)}">Open your ticket</a></p>`;
    } else if (kind === 'ack') {
      body = o.html ?? `<p>Thank you. We got your email and made ticket ${esc(t.number)}. We will reply soon.</p>`;
      subject = `[${t.number}] We got your email`;
    } else {
      body = o.html ?? '<p>We could not understand that command, so nothing changed.</p>';
      subject = `[${t.number}] About your command`;
    }
    const html = `<p style="color:#6b7280;font-size:12px">${REPLY_MARKER}</p>${body}<hr /><p style="color:#6b7280;font-size:12px">${esc(from.desk.name)} · ticket ${esc(t.number)}. Reply to this email to add to your ticket.</p>`;
    const replyTo = withToken(from.box.address, replyToken(this.tokenSecret(), org, t.number));
    const automatic = kind === 'ack' || kind === 'help';
    return {
      to,
      subject: subject.slice(0, 250),
      html,
      text: `${REPLY_MARKER}\n\n${htmlToText(body)}\n\n${from.desk.name} · ticket ${t.number}`,
      fromAddress: from.ownDomain ? from.box.address : undefined,
      fromName: from.box.displayName ?? from.desk.name,
      replyTo,
      messageId: msgId,
      inReplyTo: lastTheirs ?? undefined,
      references: thread.map((m) => m.emailMessageId!).slice(-10),
      headers: automatic ? { 'Auto-Submitted': 'auto-replied', 'X-Auto-Response-Suppress': 'All' } : undefined,
      dkim: from.ownDomain
        ? { domainName: from.ownDomain.domain, keySelector: from.ownDomain.dkimSelector, privateKey: this.crypto.decrypt(from.ownDomain.dkimPrivateKeyEncrypted) }
        : undefined,
    };
  }

  private async portalLink(tx: Tx, org: string, portalId: string, ticketId: string) {
    const [p, o] = await Promise.all([tx.sdPortal.findFirst({ where: { organizationId: org, id: portalId }, select: { slug: true } }), tx.organization.findUnique({ where: { id: org }, select: { slug: true } })]);
    return p && o ? `${webOrigin()}/yx/portal/${o.slug}/${p.slug}?ticket=${ticketId}` : `${webOrigin()}/yx/desk/help/${ticketId}`;
  }

  /** Suggested help articles for an acknowledgement (YX-HD-04, US-G-019): public or the desk's requester articles. */
  async suggestedArticles(tx: Tx, org: string, deskId: string, text: string): Promise<{ title: string; url: string }[]> {
    return forAcknowledgement(tx, org, deskId, text);
  }

  /** The acknowledgement body: the mailbox's own words (with {{ticket.number}}) and up to three articles. */
  async ackHtml(tx: Tx, org: string, t: { number: string; deskId: string; subject: string }, ackText: string | null) {
    const words = (ackText?.trim() || 'Thank you. We got your email and made ticket {{ticket.number}}. We will reply soon.').replace(/\{\{\s*ticket\.number\s*\}\}/g, t.number);
    const articles = (await this.suggestedArticles(tx, org, t.deskId, t.subject)).slice(0, 3);
    const list = articles.length ? `<p>These articles may help now:</p><ul>${articles.map((x) => `<li><a href="${esc(x.url)}">${esc(x.title)}</a></li>`).join('')}</ul>` : '';
    return `${words
      .split(/\n{2,}/)
      .map((p) => `<p>${esc(p).replace(/\n/g, '<br />')}</p>`)
      .join('')}${list}`;
  }

  /** Guards the domain a mailbox may send from: it must be one of the company's own sending domains. */
  async checkDomainOf(tx: Tx, org: string, address: string, sendingDomainId: string | null | undefined) {
    if (!sendingDomainId) return;
    const d = await tx.sdSendingDomain.findFirst({ where: { organizationId: org, id: sendingDomainId } });
    if (!d) throw new BadRequestException('Choose one of your sending domains.');
    if (!address.toLowerCase().endsWith(`@${d.domain.toLowerCase()}`)) throw new BadRequestException(`The address must end with @${d.domain} to send from that domain.`);
  }
}
