import { BadRequestException, ConflictException, ForbiddenException, GoneException, Inject, Injectable, Logger, NotFoundException, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import Redis from 'ioredis';
import { createHash, randomBytes, randomInt } from 'crypto';
import { NON_STEP_UP_MFA_METHODS, OrgSecretsCryptoService, TenantPrismaService } from '@exam-platform/shared';
import { REDIS_CONNECTION } from '../jobs/redis-connection';
import { escapeHtml } from '../notifications/notification-email-render';
import { NotificationsService } from '../notifications/notifications.service';
import { todayIst } from '../org-structure/org-validation';
import { CompanyContext, Tx } from '../org-structure/org-structure.service';
import { AutomationService } from '../rules-engine/automation.service';
import { publicHttpsFetch } from '../common/ssrf';
import { getChannelProvider } from '../sms/providers';
import { PUBLIC_GATEWAY_NET } from '../sms-channel/sms-channel.service';
import { ApprovalCards } from '../workflow/approval-channels';
import { DeskAccessService, DeskActor, activeOn, audit, canWork, deskSystem, requireDesk, requireSetUp } from './desk-access';
import { forAcknowledgement } from './kb-search';
import { detectLanguage } from './language';
import { MailOutService } from './mail-out.service';
import { AGENT_HELP, Headers, InboundMessage, MsgKind, Outgoing, REQUESTER_HELP, Scheme, Template, agentCommand, fresh, keyword, maskPhone, outgoing, parseInbound, signYukthix, verifySignature } from './messaging';
import { Requester, RequesterService } from './requester.service';
import { textToHtml } from './rich-text';
import { OPEN_STATES, TicketsService, asDeskJob } from './tickets.service';

// SD-2.21 … SD-2.23 (US-B-133, US-B-134, US-G-057, US-G-058, US-E-282; §9.4, §14.4, P04): WhatsApp, two-way SMS, and
// the Teams / Slack app on a desk. One line per channel kind per company lands on one desk.
//   - Who may write: only a linked person. A phone links by sending "JOIN <code>" from the app's code (that message is
//     the opt-in, kept in channel_consents with its evidence, YX-NTF-14); Teams / Slack people link through channel_links
//     (SD-2.06). An unknown sender gets nothing back (no spam, nothing to learn).
//   - Webhooks: no session. The path token finds a company's line and its own secret; YukthiX's shared number and app
//     post to /shared/<kind> signed with YukthiX's secrets. Every request is signature-checked in constant time with a
//     replay window; each message id is taken once; per company and per sender limits.
//   - In: a message adds to the person's open request from this channel, or makes a new one (with up to three help
//     articles, YX-HD-04); STOP / START / HELP / JOIN / NEW are understood. Agents in Teams / Slack can list, view,
//     claim, reply and note (US-G-057), only within their own seats.
//   - Out: an agent's reply goes back on the request's channel after it is committed (the reply job). WhatsApp writes
//     freely only within 24 hours of the person's last message, otherwise an approved template; SMS always uses the
//     registered (DLT) template. A sensitive or private ticket's words never leave the app (YX-NTF-04). Every send is
//     logged once in notification_deliveries (idempotent per message and channel).
// Real provider registrations (Meta app and number, Teams / Slack apps, DLT templates) are go-live lines; the dev
// transport (DESK_CHANNELS=dev-fake, never in production) keeps what would be sent in memory.

export const INBOUND_MSG_PATH = '/api/v1/desk/inbound/msg';
const JOIN_MINUTES = 15;
const SEEN_SECONDS = 7 * 86_400;
const ORG_PER_MINUTE = 600;
const SENDER_PER_MINUTE = 20;
const THREAD_DAYS = 7;
/** Founder decision 9 Oct 2026: agent actions from Teams / Slack need a YukthiX second factor this recent. */
export const CHAT_MFA_HOURS = 12;
/** Founder decision 9 Oct 2026: an SMS reply is a link to read it, working once and for this long. */
const READ_LINK_HOURS = Number(process.env.DESK_REPLY_LINK_HOURS ?? 24);
const READ_LINK_RE = /^[A-Za-z0-9_-]{22}$/;
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

type Channel = Prisma.SdMsgChannelGetPayload<object>;
export interface OutboundMsg {
  kind: MsgKind;
  to: string;
  text: string;
  template?: { name?: string; language?: string; dltTemplateId?: string | null; params: string[] };
  account: { provider: string; config: Record<string, unknown>; sender: string | null; dltEntityId: string | null } | null;
}
export interface MsgTransport {
  readonly name: string;
  send(m: OutboundMsg): Promise<{ ok: boolean; providerMsgId?: string; error?: string }>;
}

/** Development only: keeps what would be sent (tests and the local demo read it), never leaves the server. */
export class FakeMsgTransport implements MsgTransport {
  readonly name = 'dev-fake';
  readonly sent: { kind: MsgKind; to: string; text: string; template: string | null; at: Date }[] = [];
  private readonly logger = new Logger('DeskMessages');
  private n = 0;
  async send(m: OutboundMsg) {
    this.sent.push({ kind: m.kind, to: m.to, text: m.text, template: m.template?.name ?? m.template?.dltTemplateId ?? null, at: new Date() });
    if (this.sent.length > 500) this.sent.shift();
    this.logger.log(`[dev-fake] ${m.kind} to ${m.kind === 'whatsapp' || m.kind === 'sms' ? maskPhone(m.to) : m.to.slice(0, 40)}${m.template ? ' (template)' : ''}`);
    return { ok: true, providerMsgId: `dev-${++this.n}` };
  }
}

/**
 * The real providers. WhatsApp: Meta's Cloud API (the company's own number and token, or YukthiX's from the
 * environment); SMS: the P04 gateway adapters (DLT template); Slack: chat.postMessage with the app's bot token; Teams
 * needs the YukthiX Bot Framework registration (go-live), so it says so instead of sending.
 */
export class LiveMsgTransport implements MsgTransport {
  readonly name = 'live';
  async send(m: OutboundMsg): Promise<{ ok: boolean; providerMsgId?: string; error?: string }> {
    try {
      if (m.kind === 'whatsapp') {
        const phoneId = String(m.account?.config.phoneNumberId ?? process.env.YX_WHATSAPP_PHONE_NUMBER_ID ?? '');
        const token = String(m.account?.config.accessToken ?? process.env.YX_WHATSAPP_ACCESS_TOKEN ?? '');
        if (!/^\d{5,30}$/.test(phoneId) || !token) return { ok: false, error: 'WhatsApp number not connected' };
        const body = m.template
          ? { messaging_product: 'whatsapp', to: m.to.slice(1), type: 'template', template: { name: m.template.name, language: { code: m.template.language ?? 'en' }, components: [{ type: 'body', parameters: m.template.params.map((p) => ({ type: 'text', text: p })) }] } }
          : { messaging_product: 'whatsapp', to: m.to.slice(1), type: 'text', text: { body: m.text, preview_url: false } };
        const res = await publicHttpsFetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
        const json = (await res.json().catch(() => ({}))) as { messages?: { id?: string }[] };
        return res.ok ? { ok: true, providerMsgId: json.messages?.[0]?.id } : { ok: false, error: `Meta answered ${res.status}` };
      }
      if (m.kind === 'sms') {
        const adapter = m.account && getChannelProvider(m.account.provider);
        if (!m.account || !adapter) return { ok: false, error: 'No SMS account' };
        const r = await adapter.send(m.account.config, { to: m.to, body: m.text, sender: m.account.sender, dltEntityId: m.account.dltEntityId, dltTemplateId: m.template?.dltTemplateId ?? null, vars: m.template?.params }, m.account.provider === 'http' ? PUBLIC_GATEWAY_NET.fetch : undefined);
        return r.ok ? { ok: true, providerMsgId: r.providerMsgId } : { ok: false, error: r.error ?? 'failed' };
      }
      if (m.kind === 'slack') {
        const token = process.env.YX_SLACK_BOT_TOKEN;
        const user = m.to.split(':')[1];
        if (!token || !user) return { ok: false, error: 'Slack app not installed' };
        const res = await publicHttpsFetch('https://slack.com/api/chat.postMessage', { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json; charset=utf-8' }, body: JSON.stringify({ channel: user, text: m.text, unfurl_links: false, unfurl_media: false }) });
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean; ts?: string; error?: string };
        return json.ok ? { ok: true, providerMsgId: json.ts } : { ok: false, error: `Slack: ${json.error ?? res.status}` };
      }
      return { ok: false, error: 'The Teams app is not registered yet' };
    } catch (e) {
      return { ok: false, error: (e as Error).message.slice(0, 200) };
    }
  }
}

const devTransport = () => process.env.DESK_CHANNELS === 'dev-fake' && process.env.NODE_ENV !== 'production';

@Injectable()
export class MessagingService implements OnModuleInit {
  private readonly logger = new Logger(MessagingService.name);
  readonly transport: MsgTransport = devTransport() ? new FakeMsgTransport() : new LiveMsgTransport();

  constructor(
    @Inject(REDIS_CONNECTION) private readonly redis: Redis,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly crypto: OrgSecretsCryptoService,
    private readonly tickets: TicketsService,
    private readonly requesters: RequesterService,
    private readonly access: DeskAccessService,
    private readonly mailOut: MailOutService,
    private readonly automation: AutomationService,
    private readonly cards: ApprovalCards,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit() {
    // An agent's reply goes back on the request's own channel once committed (the same job that sends reply mail).
    this.mailOut.replyHooks.push((org, ticketId, messageId) => this.deliverReply(org, ticketId, messageId));
    // US-G-068: SLA warnings and breaches reach the owner's phone (number only: a push shows on a locked screen).
    this.automation.subscribe(async (ev) => {
      if (ev.type !== 'helpdesk.ticket.sla_warning' && ev.type !== 'helpdesk.ticket.sla_breached') return;
      await this.slaPush(ev.organizationId, String(ev.payload.ticketId ?? ''), ev.type === 'helpdesk.ticket.sla_breached', String(ev.id));
    });
  }

  get isDev() {
    return this.transport.name === 'dev-fake';
  }

  addressHash(e164: string) {
    return this.crypto.hmac('desk-msg-address', e164);
  }

  // ------------------------------------------------------------------------------------------ set-up (desk.channel.manage)

  private channelView(c: Channel, accounts: Map<string, { name: string; sender: string | null }>) {
    const t = (c.templates ?? {}) as Record<string, Template>;
    return {
      id: c.id,
      deskId: c.deskId,
      kind: c.kind as MsgKind,
      name: c.name,
      account: c.accountId ? { id: c.accountId, name: accounts.get(c.accountId)?.name ?? 'Company account', sender: accounts.get(c.accountId)?.sender ?? null } : null,
      templates: t,
      state: c.state,
      version: c.version,
      sharedPath: `${apiOrigin()}${INBOUND_MSG_PATH}/shared/${c.kind}`,
    };
  }

  async channels(a: DeskActor, deskId: string) {
    requireSetUp(a, deskId, 'desk.channel.manage');
    return this.tenantPrisma.forTenant(a.ctx, async (tx) => {
      await requireDesk(tx, a, deskId);
      const org = a.ctx.organizationId;
      const rows = await tx.sdMsgChannel.findMany({ where: { organizationId: org }, orderBy: { kind: 'asc' } });
      const accounts = await tx.channelAccount.findMany({ where: { organizationId: org, channel: { in: ['sms', 'whatsapp'] } }, select: { id: true, name: true, sender: true, channel: true, provider: true, status: true } });
      const byId = new Map(accounts.map((x) => [x.id, x]));
      return {
        // One line per kind per company: lines on other desks show so the admin knows where they land.
        channels: rows.map((c) => ({ ...this.channelView(c, byId), onThisDesk: c.deskId === deskId })),
        accounts: accounts.map((x) => ({ id: x.id, name: x.name, channel: x.channel, sender: x.sender, active: x.status === 'active' })),
        devTransport: this.isDev,
      };
    });
  }

  private secrets() {
    const token = randomBytes(32).toString('base64url');
    const secret = randomBytes(32).toString('base64url');
    return { token, secret, tokenHash: sha256(token), signingSecretEncrypted: this.crypto.encrypt(secret), webhookUrl: (org: string) => `${apiOrigin()}${INBOUND_MSG_PATH}/${org}/${token}` };
  }

  async createChannel(a: DeskActor, deskId: string, dto: { kind: MsgKind; name: string; accountId?: string | null; templates?: Record<string, Template> }) {
    requireSetUp(a, deskId, 'desk.channel.manage');
    const s = this.secrets();
    return this.tenantPrisma.forTenant(a.ctx, async (tx) => {
      await requireDesk(tx, a, deskId);
      const org = a.ctx.organizationId;
      await this.checkAccount(tx, org, dto.kind, dto.accountId ?? null);
      const row = await tx.sdMsgChannel
        .create({ data: { organizationId: org, deskId, kind: dto.kind, name: dto.name, accountId: dto.accountId ?? null, tokenHash: s.tokenHash, signingSecretEncrypted: s.signingSecretEncrypted, templates: cleanTemplates(dto.kind, dto.templates) as Prisma.InputJsonValue, createdBy: a.userId } })
        .catch((e: unknown) => {
          if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException(`Your company already has a ${KIND_LABEL[dto.kind]} line. Move it to this desk instead.`);
          throw e;
        });
      await audit(tx, a, 'desk.msg_channel.created', 'sd_msg_channel', row.id, { deskId, kind: dto.kind, accountId: row.accountId });
      // The webhook address and secret are shown once.
      return { ...this.channelView(row, new Map()), webhookUrl: s.webhookUrl(org), secret: s.secret };
    });
  }

  async updateChannel(a: DeskActor, id: string, dto: { version: number; name?: string; deskId?: string; accountId?: string | null; templates?: Record<string, Template>; state?: 'active' | 'paused' }) {
    return this.tenantPrisma.forTenant(a.ctx, async (tx) => {
      const org = a.ctx.organizationId;
      const c = await tx.sdMsgChannel.findFirst({ where: { organizationId: org, id } });
      if (!c) throw new NotFoundException('No such channel.');
      requireSetUp(a, c.deskId, 'desk.channel.manage');
      if (dto.deskId && dto.deskId !== c.deskId) {
        requireSetUp(a, dto.deskId, 'desk.channel.manage');
        await requireDesk(tx, a, dto.deskId);
      }
      if (dto.accountId !== undefined) await this.checkAccount(tx, org, c.kind as MsgKind, dto.accountId);
      const res = await tx.sdMsgChannel.updateMany({
        where: { organizationId: org, id, version: dto.version },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.deskId ? { deskId: dto.deskId } : {}),
          ...(dto.accountId !== undefined ? { accountId: dto.accountId } : {}),
          ...(dto.templates ? { templates: cleanTemplates(c.kind as MsgKind, dto.templates) as Prisma.InputJsonValue } : {}),
          ...(dto.state ? { state: dto.state } : {}),
          version: { increment: 1 },
          updatedAt: new Date(),
        },
      });
      if (!res.count) throw new ConflictException('Someone else changed this channel. Reload and try again.');
      await audit(tx, a, 'desk.msg_channel.updated', 'sd_msg_channel', id, { changed: Object.keys(dto).filter((k) => k !== 'version') });
      return this.channelView(await tx.sdMsgChannel.findFirstOrThrow({ where: { id } }), new Map());
    });
  }

  /** A new webhook address and signing secret, shown once (the old ones stop at once). */
  async rotate(a: DeskActor, id: string) {
    const s = this.secrets();
    return this.tenantPrisma.forTenant(a.ctx, async (tx) => {
      const org = a.ctx.organizationId;
      const c = await tx.sdMsgChannel.findFirst({ where: { organizationId: org, id } });
      if (!c) throw new NotFoundException('No such channel.');
      requireSetUp(a, c.deskId, 'desk.channel.manage');
      await tx.sdMsgChannel.update({ where: { id }, data: { tokenHash: s.tokenHash, signingSecretEncrypted: s.signingSecretEncrypted, version: { increment: 1 }, updatedAt: new Date() } });
      await audit(tx, a, 'desk.msg_channel.rotated', 'sd_msg_channel', id, { kind: c.kind });
      return { webhookUrl: s.webhookUrl(org), secret: s.secret };
    });
  }

  private async checkAccount(tx: Tx, org: string, kind: MsgKind, accountId: string | null) {
    if (!accountId) return;
    if (kind !== 'whatsapp' && kind !== 'sms') throw new BadRequestException('Teams and Slack use the YukthiX app.');
    const acc = await tx.channelAccount.findFirst({ where: { organizationId: org, id: accountId, channel: kind } });
    if (!acc) throw new BadRequestException(`Choose one of your company's ${KIND_LABEL[kind]} accounts.`);
  }

  // ------------------------------------------------------------------------------------------ a person links a phone

  private who(r: Requester): CompanyContext & { userId: string } {
    return { ...r.ctx, userId: r.userId };
  }

  /** The person's channels: which lines the company has, what they linked, how to link. */
  async mine(r: Requester) {
    const org = r.ctx.organizationId;
    return this.tenantPrisma.forTenant(this.who(r), async (tx) => {
      const lines = await tx.sdMsgChannel.findMany({ where: { organizationId: org, state: 'active' } });
      const ids = await tx.sdMsgIdentity.findMany({ where: { organizationId: org, userId: r.userId, state: 'active' } });
      const chats = await tx.channelLink.findMany({ where: { organizationId: org, userId: r.userId, provider: { in: ['teams', 'slack'] } } });
      const senders = new Map((await tx.channelAccount.findMany({ where: { organizationId: org, id: { in: lines.map((l) => l.accountId).filter((x): x is string => Boolean(x)) } }, select: { id: true, sender: true } })).map((x) => [x.id, x.sender]));
      return {
        devTransport: this.isDev,
        lines: lines.map((l) => ({
          kind: l.kind as MsgKind,
          name: l.name,
          // Where to write: the company's own number, or YukthiX's shared one.
          sendTo: l.accountId ? (senders.get(l.accountId) ?? null) : sharedNumber(l.kind as MsgKind),
          linked:
            l.kind === 'whatsapp' || l.kind === 'sms'
              ? (ids.find((i) => i.kind === l.kind) ? { masked: ids.find((i) => i.kind === l.kind)!.addressMasked, since: ids.find((i) => i.kind === l.kind)!.linkedAt } : null)
              : chats.find((c) => c.provider === l.kind)
                ? { masked: chats.find((c) => c.provider === l.kind)!.label ?? 'Linked', since: chats.find((c) => c.provider === l.kind)!.createdAt }
                : null,
        })),
      };
    });
  }

  /** A code to send from the phone ("JOIN <code>"), valid 15 minutes, once. Sending it is the opt-in. */
  async joinCode(r: Requester, kind: 'whatsapp' | 'sms') {
    if (r.acting) throw new ForbiddenException('Not available while acting for someone else');
    const org = r.ctx.organizationId;
    const line = await this.tenantPrisma.forTenant(this.who(r), (tx) => tx.sdMsgChannel.findFirst({ where: { organizationId: org, kind, state: 'active' } }));
    if (!line) throw new NotFoundException(`Your company has not turned on ${KIND_LABEL[kind]} help.`);
    if (!(await this.limit(`sd:msg:join-rl:${org}:${r.userId}`, 5, 3600))) throw new ConflictException('Too many codes. Try again in an hour.');
    const code = Array.from({ length: 8 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[randomInt(0, 32)]).join('');
    await this.redis.set(`sd:msg:join:${kind}:${code}`, JSON.stringify({ org, userId: r.userId }), 'EX', JOIN_MINUTES * 60);
    return { code, text: `JOIN ${code}`, expiresInMinutes: JOIN_MINUTES };
  }

  /** Stops the channel for this person at once: the opt-in is withdrawn, nothing more is sent. */
  async unlink(r: Requester, kind: 'whatsapp' | 'sms') {
    if (r.acting) throw new ForbiddenException('Not available while acting for someone else');
    const org = r.ctx.organizationId;
    const done = await deskSystem(this.tenantPrisma, this.who(r), async (tx) => {
      const id = await tx.sdMsgIdentity.findFirst({ where: { organizationId: org, userId: r.userId, kind, state: 'active' } });
      if (!id) return false;
      await this.stopIn(tx, id, 'me_settings');
      await audit(tx, { ctx: r.ctx, userId: r.userId }, 'desk.msg_identity.unlinked', 'sd_msg_identity', id.id, { kind });
      return true;
    });
    if (!done) throw new NotFoundException('Nothing is linked.');
    return { unlinked: true };
  }

  private async stopIn(tx: Tx, id: Prisma.SdMsgIdentityGetPayload<object>, source: 'stop_keyword' | 'me_settings') {
    await tx.sdMsgIdentity.update({ where: { id: id.id }, data: { state: 'stopped', stoppedAt: new Date() } });
    await tx.channelConsent.updateMany({ where: { id: id.consentId, withdrawnAt: null }, data: { withdrawnAt: new Date(), withdrawalSource: source } });
  }

  // ------------------------------------------------------------------------------------------ webhooks in

  /**
   * POST /desk/inbound/msg/:org/:token (a company line) or /desk/inbound/msg/shared/:kind (YukthiX's number and apps).
   * Every refusal looks the same; what we accept is answered 200 at once (providers retry anything else).
   */
  async webhook(path: { org: string; token: string } | { shared: MsgKind }, raw: Buffer, headers: Headers): Promise<{ ok: true; challenge?: string; taken: number }> {
    const refuse = () => new UnauthorizedException('Not accepted.');
    let line: Channel | null = null;
    let scheme: Scheme;
    let secret: string | null = null;
    let kind: MsgKind;
    if ('token' in path) {
      if (!/^[A-Za-z0-9_-]{40,50}$/.test(path.token)) throw refuse();
      line = await this.tenantPrisma.forTenant({ organizationId: path.org, isSuperAdmin: false }, (tx) => tx.sdMsgChannel.findFirst({ where: { organizationId: path.org, tokenHash: sha256(path.token) } }));
      if (!line) throw refuse();
      kind = line.kind as MsgKind;
      const acc = line.accountId ? await this.account(line.organizationId, line.accountId) : null;
      // A company's own Meta app signs with its app secret; everything else on a company line is signed our way.
      if (acc?.provider === 'meta') {
        scheme = 'meta';
        secret = typeof acc.config.appSecret === 'string' ? acc.config.appSecret : null;
      } else {
        scheme = 'yukthix';
        secret = this.crypto.decrypt(line.signingSecretEncrypted);
      }
    } else {
      kind = path.shared;
      const env = SHARED_SECRETS[kind];
      scheme = env.scheme;
      secret = process.env[env.secret] ?? null;
    }
    if (!verifySignature(scheme, secret, raw, headers)) throw refuse();
    let body: unknown;
    try {
      body = JSON.parse(raw.toString('utf8'));
    } catch {
      throw new BadRequestException('The body is not JSON.');
    }
    const { messages, challenge } = parseInbound(kind, scheme, body);
    if (challenge) return { ok: true, challenge, taken: 0 };
    if (line?.state === 'paused') return { ok: true, taken: 0 };
    let taken = 0;
    for (const m of messages) {
      if (!fresh(m.at, scheme)) continue;
      // Each provider message id once (a replayed or retried delivery is a no-op).
      if (!(await this.redis.set(`sd:msg:seen:${kind}:${sha256(m.id)}`, '1', 'EX', SEEN_SECONDS, 'NX'))) continue;
      try {
        if (await this.receive(kind, line, m)) taken++;
      } catch (e) {
        this.logger.warn(`${kind} message not taken: ${(e as Error).message}`);
      }
    }
    return { ok: true, taken };
  }

  private async limit(key: string, max: number, seconds: number) {
    const [[, n]] = (await this.redis.multi().incr(key).expire(key, seconds, 'NX').exec()) as [[null, number], unknown];
    return n <= max;
  }

  /** One message from a sender. Returns whether it was taken (false: unknown sender, a limit, a paused line). */
  private async receive(kind: MsgKind, line: Channel | null, m: InboundMessage): Promise<boolean> {
    const phone = kind === 'whatsapp' || kind === 'sms';
    const word = phone ? keyword(m.text) : null;
    // Who: a linked phone (any company on the shared number; this company on its own line) or a linked chat account.
    let org: string | null = line?.organizationId ?? null;
    let userId: string | null = null;
    let identity: Prisma.SdMsgIdentityGetPayload<object> | null = null;
    if (phone) {
      const hash = this.addressHash(m.from);
      identity = await deskSystem(this.tenantPrisma, { organizationId: null, isSuperAdmin: true }, (tx) => tx.sdMsgIdentity.findFirst({ where: { kind, addressHash: hash, state: 'active', ...(org ? { organizationId: org } : {}) } }));
      if (!identity && word?.kind === 'join') return this.join(kind, line, m, word.code);
      if (!identity && word?.kind === 'start') return this.restart(kind, line, m);
      if (!identity) return false;
      org = identity.organizationId;
      userId = identity.userId;
    } else {
      const links = await deskSystem(this.tenantPrisma, { organizationId: null, isSuperAdmin: true }, (tx) => tx.channelLink.findMany({ where: { provider: kind, externalRef: m.from, ...(org ? { organizationId: org } : {}) }, take: 2 }));
      // The same chat account linked in two companies: we cannot tell which one, so nothing happens.
      if (links.length !== 1) return false;
      org = links[0].organizationId;
      userId = links[0].userId;
    }
    if (!org || !userId) return false;
    const ctx: CompanyContext & { userId: string } = { organizationId: org, isSuperAdmin: false, userId };
    const ch = line ?? (await this.tenantPrisma.forTenant(ctx, (tx) => tx.sdMsgChannel.findFirst({ where: { organizationId: org!, kind, accountId: null } })));
    if (!ch || ch.state !== 'active') return false;
    // Per company and per sender limits (§14.4): a flood is dropped, never queued.
    if (!(await this.limit(`sd:msg:rl:${org}:${kind}`, ORG_PER_MINUTE, 60)) || !(await this.limit(`sd:msg:rl:${org}:${kind}:${sha256(m.from)}`, SENDER_PER_MINUTE, 60))) return false;
    const user = await this.tenantPrisma.forTenant(ctx, (tx) => tx.user.findFirst({ where: { organizationId: org!, id: userId!, status: 'active' }, select: { id: true, role: true, permissionProfileId: true } }));
    if (!user) return false;
    if (identity) await deskSystem(this.tenantPrisma, ctx, (tx) => tx.sdMsgIdentity.update({ where: { id: identity!.id }, data: { lastInboundAt: m.at } }));
    const to = m.from;

    if (word?.kind === 'stop' && identity) {
      await deskSystem(this.tenantPrisma, ctx, async (tx) => {
        await this.stopIn(tx, identity!, 'stop_keyword');
        await audit(tx, { ctx, userId: ctx.userId }, 'desk.msg_identity.stopped', 'sd_msg_identity', identity!.id, { kind, by: 'keyword' });
      });
      // The one confirmation carriers expect; nothing after it.
      await this.send(ch, to, { mode: 'text', text: 'You will get no more messages here. Send START to start again.' }, `stop:${m.id}`, 'desk_notice', userId, true);
      return true;
    }
    if (word?.kind === 'help' || (!phone && /^help$/i.test(m.text.trim()))) {
      const agent = !phone && (await this.access.actorFor(org, userId));
      await this.send(ch, to, { mode: 'text', text: agent && [...agent.roles.values()].some((r) => r === 'agent' || r === 'lead') ? `${REQUESTER_HELP}\n${AGENT_HELP}` : REQUESTER_HELP }, `help:${m.id}`, 'desk_notice', userId);
      return true;
    }
    if (word?.kind === 'join' || word?.kind === 'start') {
      await this.send(ch, to, { mode: 'text', text: 'This phone is already linked. Write your question any time.' }, `dup:${m.id}`, 'desk_notice', userId);
      return true;
    }
    // US-G-057: an agent's command in Teams / Slack, within their own seats.
    if (!phone) {
      const cmd = agentCommand(m.text);
      if (cmd) {
        const a = await this.access.actorFor(org, userId);
        if (a && [...a.roles.values()].some((r) => r === 'agent' || r === 'lead')) {
          // Founder decision 9 Oct 2026: claim, reply and note act on a ticket, so they need a recent YukthiX second
          // factor (the chat app's own sign-in is not ours). Reading (list, view, help) stays as it is.
          if ((cmd.kind === 'claim' || cmd.kind === 'reply' || cmd.kind === 'note') && !(await this.recentMfa(org, userId))) {
            await deskSystem(this.tenantPrisma, ctx, (tx) => audit(tx, { ctx, userId }, 'desk.msg.agent_command_refused', 'sd_msg_channel', ch.id, { kind, command: cmd.kind, reason: 'no_recent_mfa' }));
            await this.send(ch, to, { mode: 'text', text: `Nothing was done. To ${cmd.kind} from ${KIND_LABEL[kind]}, confirm it is you in YukthiX first (needed every ${CHAT_MFA_HOURS} hours): ${webOrigin()}/yx/desk/confirm-chat` }, `cmd:${m.id}`, 'desk_notice', userId);
            return true;
          }
          const answer = await this.agentDo(a, cmd).catch((e: Error) => (e instanceof NotFoundException || e instanceof ForbiddenException || e instanceof ConflictException || e instanceof BadRequestException ? e.message : 'That did not work. Try again in YukthiX.'));
          await this.send(ch, to, { mode: 'text', text: answer }, `cmd:${m.id}`, 'desk_notice', userId);
          return true;
        }
      }
    }
    const r: Requester = { ctx, userId, acting: false, user: { role: user.role, permissionProfileId: user.permissionProfileId, organizationId: org, userId } };
    const forceNew = word?.kind === 'new';
    const body = forceNew ? word.text : m.text;
    const out = await this.tenantPrisma.forTenant(ctx, async (tx) => {
      const personId = (await this.requesters.personOf(tx, r, true))!;
      const since = new Date(Date.now() - THREAD_DAYS * 86_400_000);
      const open = forceNew ? null : await tx.sdTicket.findFirst({ where: { organizationId: org!, deskId: ch.deskId, requesterPersonId: personId, channel: kind, systemState: { in: [...OPEN_STATES, 'solved'] }, updatedAt: { gt: since } }, orderBy: { updatedAt: 'desc' } });
      if (open) {
        const res = await this.requesters.replyIn(tx, r, open, personId, textToHtml(body), { channel: kind });
        await audit(tx, { ctx, userId: ctx.userId }, 'desk.msg.received', 'sd_ticket', open.id, { kind, created: false });
        return { ticket: open, created: false, followUp: res.followUp };
      }
      const language = await this.languageOf(tx, org!, ch.deskId, personId, body);
      const t = await this.tickets.createIn(tx, r, { deskId: ch.deskId, subject: subjectOf(body), bodyHtml: textToHtml(body), requesterPersonId: personId, openedByUserId: userId, channel: kind, side: 'requester', authorPersonId: personId, language });
      const articles = t.sensitive || t.private ? [] : await forAcknowledgement(tx, org!, ch.deskId, `${t.subject} ${body}`);
      await audit(tx, { ctx, userId: ctx.userId }, 'desk.msg.received', 'sd_ticket', t.id, { kind, created: true });
      return { ticket: t, created: true, followUp: null, articles };
    });
    if (out.created || out.followUp) {
      const n = out.followUp?.number ?? out.ticket.number;
      const list = 'articles' in out && out.articles?.length ? `\nThese may help now:\n${out.articles.map((x) => `- ${x.title}: ${x.url}`).join('\n')}` : '';
      await this.send(ch, to, { mode: 'text', text: `Thank you. We made request ${n}. We will reply here.${list}` }, `ack:${m.id}`, 'desk_notice', userId);
    }
    return true;
  }

  /**
   * Founder decision 9 Oct 2026: the language of a WhatsApp / SMS / chat ticket is the contact's saved one, otherwise
   * the one its first message is written in when the desk's agents answer in it and the guess is clear (language.ts).
   */
  private languageOf(tx: Tx, org: string, deskId: string, personId: string, text: string): Promise<string | null> {
    return asDeskJob(tx, async () => {
      const saved = (await tx.sdRequesterFlag.findUnique({ where: { organizationId_personId: { organizationId: org, personId } }, select: { language: true } }))?.language;
      if (saved) return saved;
      const seats = await tx.sdDeskMember.findMany({ where: { organizationId: org, deskId, role: { in: ['agent', 'lead'] }, ...activeOn(todayIst()) }, select: { languages: true } });
      return detectLanguage(text, [...new Set(seats.flatMap((x) => x.languages))]);
    });
  }

  /** The person proved a YukthiX second factor (not an emailed code or their identity provider) in the last 12 hours. */
  private async recentMfa(org: string, userId: string): Promise<boolean> {
    const since = new Date(Date.now() - CHAT_MFA_HOURS * 3_600_000);
    const s = await this.tenantPrisma.forTenant({ organizationId: org, isSuperAdmin: false, userId }, (tx) =>
      tx.session.findFirst({ where: { organizationId: org, userId, assuranceLevel: 'aal2', mfaVerifiedAt: { gte: since }, mfaMethod: { notIn: [...NON_STEP_UP_MFA_METHODS] } }, select: { id: true } }),
    );
    return Boolean(s);
  }

  /**
   * "JOIN <code>" from a phone: the code names the company and person; the message is the opt-in. Founder decision
   * 9 Oct 2026: one phone belongs to one person in one company, so the newest JOIN wins (in any company) and the
   * company that lost the link is told (bell and email to that desk's admins; the number masked, no message words).
   */
  private async join(kind: MsgKind, line: Channel | null, m: InboundMessage, code: string): Promise<boolean> {
    const key = `sd:msg:join:${kind}:${code}`;
    const raw = await this.redis.get(key);
    if (!raw) return false;
    const { org, userId } = JSON.parse(raw) as { org: string; userId: string };
    // A code from one company never links a phone on another company's own line (and that try does not use it up).
    if (line && line.organizationId !== org) return false;
    // Used once: only the first message that removes it links.
    if (!(await this.redis.del(key))) return false;
    const ctx: CompanyContext & { userId: string } = { organizationId: org, isSuperAdmin: false, userId };
    const ch = line ?? (await this.tenantPrisma.forTenant(ctx, (tx) => tx.sdMsgChannel.findFirst({ where: { organizationId: org, kind, accountId: null, state: 'active' } })));
    if (!ch) return false;
    const hash = this.addressHash(m.from);
    const user = await this.tenantPrisma.forTenant(ctx, (tx) => tx.user.findFirst({ where: { organizationId: org, id: userId, status: 'active' }, select: { role: true, permissionProfileId: true } }));
    if (!user) return false;
    const r: Requester = { ctx, userId, acting: false, user: { role: user.role, permissionProfileId: user.permissionProfileId, organizationId: org, userId } };
    // The newest link of a number wins, in any company (one person per phone); a person keeps one phone per channel.
    const moved = await deskSystem(this.tenantPrisma, { organizationId: null, isSuperAdmin: true }, async (tx) => {
      const olds = await tx.sdMsgIdentity.findMany({ where: { kind, state: 'active', OR: [{ addressHash: hash }, { organizationId: org, userId }] } });
      for (const old of olds) await this.stopIn(tx, old, 'me_settings');
      return olds.filter((o) => o.organizationId !== org);
    });
    for (const old of moved) await this.tellLinkEnded(old);
    await deskSystem(this.tenantPrisma, ctx, async (tx) => {
      const personId = (await this.requesters.personOf(tx, r, true))!;
      const consent = await tx.channelConsent.create({
        data: { organizationId: org, recipientType: 'user', recipientId: userId, channel: kind, addressHash: hash, addressMasked: maskPhone(m.from), scope: 'all_service', source: `${kind}_join`, textVersion: 'desk-join-v1', language: 'en', capturedBy: userId, evidence: { messageId: m.id, at: m.at.toISOString(), line: ch.id } },
      });
      const id = await tx.sdMsgIdentity.create({ data: { organizationId: org, kind, userId, personId, addressHash: hash, addressMasked: maskPhone(m.from), addressEncrypted: this.crypto.encrypt(m.from), consentId: consent.id, lastInboundAt: m.at } });
      await audit(tx, { ctx, userId: ctx.userId }, 'desk.msg_identity.linked', 'sd_msg_identity', id.id, { kind, consentId: consent.id, masked: maskPhone(m.from) });
    });
    await this.send(ch, m.from, { mode: 'text', text: 'Your phone is linked. Write your question here any time. Send STOP to stop.' }, `join:${m.id}`, 'desk_notice', userId);
    return true;
  }

  /** The company whose link a newer JOIN elsewhere ended: its line's desk admins get a bell and an email. */
  private async tellLinkEnded(old: Prisma.SdMsgIdentityGetPayload<object>) {
    const org = old.organizationId;
    const ctx = { organizationId: org, isSuperAdmin: false };
    try {
      const admins = await deskSystem(this.tenantPrisma, ctx, async (tx) => {
        await audit(tx, { ctx, userId: null as unknown as string }, 'desk.msg_identity.moved', 'sd_msg_identity', old.id, { kind: old.kind, masked: old.addressMasked });
        const line = await tx.sdMsgChannel.findFirst({ where: { organizationId: org, kind: old.kind }, select: { deskId: true } });
        if (!line) return [];
        return (await tx.sdDeskMember.findMany({ where: { organizationId: org, deskId: line.deskId, role: 'admin', ...activeOn(todayIst()) }, select: { userId: true } })).map((x) => x.userId);
      });
      const label = KIND_LABEL[old.kind as MsgKind];
      const text = `A phone linked to your ${label} help (${old.addressMasked}) was linked again somewhere else, so its link here ended.`;
      await this.notifications.notifySystem(ctx, admins, 'helpdesk.msg.link_ended', { entityType: 'sd_msg_identity', entityId: old.id, contextText: text.slice(0, 200), linkPath: '/yx/desk/setup' }, { subject: `A ${label} link to your desk ended`, html: `<p>${escapeHtml(text)} The person can link it again with a new code from YukthiX.</p>` });
    } catch (e) {
      this.logger.warn(`Link-ended notice not sent: ${(e as Error).message}`);
    }
  }

  /** "START" from a phone that sent STOP before: the same person's link comes back with a fresh opt-in. */
  private async restart(kind: MsgKind, line: Channel | null, m: InboundMessage): Promise<boolean> {
    const hash = this.addressHash(m.from);
    const old = await deskSystem(this.tenantPrisma, { organizationId: null, isSuperAdmin: true }, (tx) => tx.sdMsgIdentity.findFirst({ where: { kind, addressHash: hash, state: 'stopped', ...(line ? { organizationId: line.organizationId } : {}) }, orderBy: { stoppedAt: 'desc' } }));
    if (!old) return false;
    const ctx: CompanyContext & { userId: string } = { organizationId: old.organizationId, isSuperAdmin: false, userId: old.userId };
    const ch = line ?? (await this.tenantPrisma.forTenant(ctx, (tx) => tx.sdMsgChannel.findFirst({ where: { organizationId: old.organizationId, kind, accountId: null, state: 'active' } })));
    if (!ch) return false;
    const taken = await deskSystem(this.tenantPrisma, ctx, async (tx) => {
      if (await tx.sdMsgIdentity.findFirst({ where: { organizationId: old.organizationId, kind, userId: old.userId, state: 'active' }, select: { id: true } })) return false;
      const consent = await tx.channelConsent.create({
        data: { organizationId: old.organizationId, recipientType: 'user', recipientId: old.userId, channel: kind, addressHash: hash, addressMasked: old.addressMasked, scope: 'all_service', source: `${kind}_start`, textVersion: 'desk-join-v1', language: 'en', capturedBy: old.userId, evidence: { messageId: m.id, at: m.at.toISOString(), line: ch.id } },
      });
      const id = await tx.sdMsgIdentity.create({ data: { organizationId: old.organizationId, kind, userId: old.userId, personId: old.personId, addressHash: hash, addressMasked: old.addressMasked, addressEncrypted: old.addressEncrypted, consentId: consent.id, lastInboundAt: m.at } });
      await audit(tx, { ctx, userId: ctx.userId }, 'desk.msg_identity.linked', 'sd_msg_identity', id.id, { kind, consentId: consent.id, by: 'start' });
      return true;
    });
    if (taken) await this.send(ch, m.from, { mode: 'text', text: 'Messages are on again. Write your question here any time.' }, `start:${m.id}`, 'desk_notice', old.userId);
    return taken;
  }

  // ------------------------------------------------------------------------------------------ agents in Teams / Slack

  private async agentDo(a: DeskActor, cmd: NonNullable<ReturnType<typeof agentCommand>>): Promise<string> {
    if (cmd.kind === 'agent_help') return AGENT_HELP;
    const org = a.ctx.organizationId;
    if (cmd.kind === 'list') {
      const rows = await this.tenantPrisma.forTenant(a.ctx, async (tx) => {
        const list = await tx.sdTicket.findMany({ where: { organizationId: org, assigneeUserId: a.userId, systemState: { in: OPEN_STATES } }, orderBy: [{ priority: 'asc' }, { updatedAt: 'desc' }], take: 10 });
        return Promise.all(list.map(async (t) => ({ t, hide: await wordsStayIn(tx, t) })));
      });
      if (!rows.length) return 'You have no open tickets.';
      return `Your open tickets:\n${rows.map(({ t, hide }) => `${t.number} · P${t.priority} · ${hide ? 'Private ticket' : t.subject}`).join('\n')}`;
    }
    const t = await this.tenantPrisma.forTenant(a.ctx, (tx) => tx.sdTicket.findFirst({ where: { organizationId: org, number: cmd.number } }));
    // Only tickets the agent works (never by role alone): anything else reads as not found.
    if (!t || !canWork(a, t.deskId)) throw new NotFoundException(`No ticket ${cmd.number} that you work on.`);
    if (cmd.kind === 'view') {
      // A private or sensitive ticket's words stay in the app.
      if (await this.tenantPrisma.forTenant(a.ctx, (tx) => wordsStayIn(tx, t))) return `${t.number} is private. Open it in YukthiX: ${webOrigin()}/yx/desk/tickets/${t.id}`;
      const last = await this.tenantPrisma.forTenant(a.ctx, (tx) => tx.sdTicketMessage.findMany({ where: { organizationId: org, ticketId: t.id, kind: 'reply' }, orderBy: { createdAt: 'desc' }, take: 3 }));
      return `${t.number} · ${t.subject} · P${t.priority} · ${t.systemState}\n${last
        .reverse()
        .map((x) => `${x.side === 'agent' ? 'Agent' : 'Requester'}: ${x.bodyText.slice(0, 300)}`)
        .join('\n')}\n${webOrigin()}/yx/desk/tickets/${t.id}`;
    }
    if (cmd.kind === 'claim') {
      await this.tickets.assign(a, t.id, { userId: a.userId });
      return `${t.number} is yours now.`;
    }
    await this.tickets.post(a, t.id, { kind: cmd.kind, bodyHtml: textToHtml(cmd.text) });
    return cmd.kind === 'reply' ? `Reply sent on ${t.number}.` : `Note added to ${t.number}.`;
  }

  // ------------------------------------------------------------------------------------------ out

  private async account(org: string | null, id: string | null): Promise<OutboundMsg['account'] & { id: string } | null> {
    if (!id) return null;
    const row = await this.tenantPrisma.forTenant(org ? { organizationId: org, isSuperAdmin: false } : { organizationId: null, isSuperAdmin: true }, (tx) => tx.channelAccount.findFirst({ where: { id, organizationId: org, status: 'active' } }));
    if (!row) return null;
    let config: Record<string, unknown> = {};
    try {
      config = JSON.parse(this.crypto.decrypt(row.configEncrypted)) as Record<string, unknown>;
    } catch {
      config = {};
    }
    return { id: row.id, provider: row.provider, config, sender: row.sender, dltEntityId: row.dltEntityId };
  }

  /** YukthiX's shared SMS account (the P04 default), for a line with no company account. */
  private async sharedSms(): Promise<OutboundMsg['account'] | null> {
    const row = await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) => tx.channelAccount.findFirst({ where: { organizationId: null, channel: 'sms', status: 'active' }, orderBy: { priority: 'asc' } }));
    return row ? this.account(null, row.id) : null;
  }

  /**
   * One message out on a line, logged once per idempotency key. Phones need an active opt-in (except the STOP
   * confirmation); chat apps need the person's link.
   */
  private async send(ch: Channel, to: string, out: Outgoing, key: string, kind: 'desk_reply' | 'desk_notice', userId: string, afterStop = false): Promise<'sent' | 'failed' | 'skipped' | 'duplicate'> {
    const org = ch.organizationId;
    const channel = ch.kind as MsgKind;
    const ctx = { organizationId: org, isSuperAdmin: false };
    const phone = channel === 'whatsapp' || channel === 'sms';
    // SMS can only carry registered templates (DLT): plain notices go only when the line has an approved "notice" template.
    let msg = out;
    if (channel === 'sms' && out.mode === 'text') {
      const tpl = ((ch.templates ?? {}) as Record<string, Template>).notice;
      msg = tpl?.status === 'approved' && tpl.body ? { mode: 'template', template: tpl, params: [out.text], text: tpl.body.replace(/\{#var#\}/, out.text.slice(0, 30)) } : { mode: 'none', reason: 'no_approved_template' };
    }
    // The delivery log (read by company admins) never shows a chat account's id, only its kind.
    const masked = phone ? maskPhone(to) : `${KIND_LABEL[channel]} account`.slice(0, 40);
    let deliveryId: string;
    try {
      deliveryId = (await this.tenantPrisma.forTenant(ctx, (tx) => tx.notificationDelivery.create({ data: { organizationId: org, channel, kind, idempotencyKey: `desk:${channel}:${key}`.slice(0, 128), addressMasked: masked, addressHash: phone ? this.addressHash(to) : sha256(to) }, select: { id: true } }))).id;
    } catch (e) {
      if ((e as { code?: string }).code === 'P2002') return 'duplicate';
      throw e;
    }
    const finish = (data: Prisma.NotificationDeliveryUncheckedUpdateInput) => this.tenantPrisma.forTenant(ctx, (tx) => tx.notificationDelivery.update({ where: { id: deliveryId }, data }));
    if (msg.mode === 'none') {
      await finish({ status: 'fallback', error: msg.reason });
      return 'skipped';
    }
    if (phone && !afterStop) {
      const ok = await deskSystem(this.tenantPrisma, ctx, async (tx) => {
        const id = await tx.sdMsgIdentity.findFirst({ where: { organizationId: org, kind: channel, userId, state: 'active', addressHash: this.addressHash(to) }, select: { consentId: true } });
        return Boolean(id && (await tx.channelConsent.findFirst({ where: { id: id.consentId, withdrawnAt: null }, select: { id: true } })));
      });
      if (!ok) {
        await finish({ status: 'opted_out', error: 'no active opt-in' });
        return 'skipped';
      }
    }
    const account = ch.accountId ? await this.account(org, ch.accountId) : channel === 'sms' && !this.isDev ? await this.sharedSms() : null;
    const res = await this.transport.send({ kind: channel, to, text: msg.text, template: msg.mode === 'template' ? { ...msg.template, params: msg.params } : undefined, account });
    await finish(res.ok ? { status: 'sent', attempts: 1, provider: this.transport.name.slice(0, 16), providerMsgId: res.providerMsgId?.slice(0, 200) ?? null, sentAt: new Date() } : { status: 'failed', attempts: 1, error: (res.error ?? 'failed').slice(0, 500) });
    if (!res.ok) this.logger.warn(`${channel} message not sent: ${res.error}`);
    return res.ok ? 'sent' : 'failed';
  }

  /** The reply job's hook: an agent's reply on a messaging ticket goes back on its channel. */
  async deliverReply(org: string, ticketId: string, messageId: string) {
    const ctx = { organizationId: org, isSuperAdmin: false };
    const found = await deskSystem(this.tenantPrisma, ctx, async (tx) => {
      const t = await tx.sdTicket.findFirst({ where: { organizationId: org, id: ticketId } });
      if (!t || !['whatsapp', 'sms', 'teams', 'slack'].includes(t.channel)) return null;
      const m = await tx.sdTicketMessage.findFirst({ where: { organizationId: org, id: messageId, ticketId, kind: 'reply', side: 'agent' } });
      const ch = await tx.sdMsgChannel.findFirst({ where: { organizationId: org, kind: t.channel, state: 'active' } });
      const login = await tx.personRole.findFirst({ where: { organizationId: org, personId: t.requesterPersonId, roleType: 'login', sourceTable: 'users', endOn: null }, select: { sourceId: true } });
      if (!m || !ch || !login?.sourceId) return null;
      const agentName = m.authorUserId ? ((await this.tickets.userNames(tx, org, [m.authorUserId])).get(m.authorUserId) ?? 'The desk') : 'The desk';
      const neutral = await wordsStayIn(tx, t);
      if (t.channel === 'whatsapp' || t.channel === 'sms') {
        const id = await tx.sdMsgIdentity.findFirst({ where: { organizationId: org, kind: t.channel, userId: login.sourceId, state: 'active' } });
        return id ? { t, m, ch, userId: login.sourceId, to: this.crypto.decrypt(id.addressEncrypted), lastInbound: id.lastInboundAt, agentName, neutral } : null;
      }
      const link = await tx.channelLink.findFirst({ where: { organizationId: org, userId: login.sourceId, provider: t.channel } });
      return link ? { t, m, ch, userId: login.sourceId, to: link.externalRef, lastInbound: null, agentName, neutral } : null;
    });
    if (!found) return;
    const { t, m, ch } = found;
    const tpl = ((ch.templates ?? {}) as Record<string, Template>).reply_notice ?? null;
    // Founder decision 9 Oct 2026: SMS never carries (or cuts) the words: a single-use, short-lived link to read them;
    // a private or sensitive ticket's link opens YukthiX (sign-in) instead.
    const link = ch.kind !== 'sms' ? null : found.neutral ? `${webOrigin()}/yx/desk/help/${t.id}` : await this.readLink(org, t.id, m.id, found.userId);
    const out = outgoing(ch.kind as MsgKind, { number: t.number, agentName: found.agentName, replyText: m.bodyText, neutral: found.neutral, lastInbound: found.lastInbound, template: tpl, link });
    await this.send(ch, found.to, out, `reply:${m.id}`, 'desk_reply', found.userId);
  }

  /** A link that shows one reply once (the random part is the key; only its hash is kept, for READ_LINK_HOURS). */
  private async readLink(org: string, ticketId: string, messageId: string, userId: string): Promise<string> {
    const token = randomBytes(16).toString('base64url');
    await this.redis.set(`sd:msg:read:${sha256(token)}`, JSON.stringify({ org, ticketId, messageId, userId }), 'EX', Math.max(60, Math.round(READ_LINK_HOURS * 3600)));
    return `${webOrigin()}/yx/m/${token}`;
  }

  private readonly linkGone = () => new GoneException({ statusCode: 410, code: 'LINK_GONE', message: 'This link was used or has expired. Sign in to YukthiX to read your request.' });

  /** GET /desk/reply-link/:token: what the page shows before the person asks to read (link previews consume nothing). */
  async readLinkInfo(token: string) {
    if (!READ_LINK_RE.test(token)) throw new NotFoundException('This link is not valid.');
    const raw = await this.redis.get(`sd:msg:read:${sha256(token)}`);
    if (!raw) throw this.linkGone();
    const c = JSON.parse(raw) as { org: string; ticketId: string };
    const t = await deskSystem(this.tenantPrisma, { organizationId: c.org, isSuperAdmin: false }, (tx) => tx.sdTicket.findFirst({ where: { organizationId: c.org, id: c.ticketId }, select: { number: true } }));
    if (!t) throw new NotFoundException('This link is not valid.');
    return { number: t.number };
  }

  /** POST /desk/reply-link/:token: the reply's words, once. Reading uses the link up, whatever happens next. */
  async readLinkOpen(token: string) {
    if (!READ_LINK_RE.test(token)) throw new NotFoundException('This link is not valid.');
    const raw = await this.redis.getdel(`sd:msg:read:${sha256(token)}`);
    if (!raw) throw this.linkGone();
    const c = JSON.parse(raw) as { org: string; ticketId: string; messageId: string; userId: string };
    const ctx = { organizationId: c.org, isSuperAdmin: false };
    return deskSystem(this.tenantPrisma, ctx, async (tx) => {
      const t = await tx.sdTicket.findFirst({ where: { organizationId: c.org, id: c.ticketId } });
      const m = t && (await tx.sdTicketMessage.findFirst({ where: { organizationId: c.org, ticketId: t.id, id: c.messageId, kind: 'reply', side: 'agent' } }));
      const user = await tx.user.findFirst({ where: { organizationId: c.org, id: c.userId, status: 'active' }, select: { id: true } });
      if (!t || !m || !user) throw new NotFoundException('This link is not valid.');
      await audit(tx, { ctx, userId: c.userId }, 'desk.msg.reply_link_opened', 'sd_ticket', t.id, { messageId: m.id });
      const signIn = `${webOrigin()}/yx/desk/help/${t.id}`;
      // The ticket may have become private since: then only where to read it.
      if (await wordsStayIn(tx, t)) return { number: t.number, agentName: null, text: null, signIn };
      const agentName = m.authorUserId ? ((await this.tickets.userNames(tx, c.org, [m.authorUserId])).get(m.authorUserId) ?? 'The desk') : 'The desk';
      return { number: t.number, agentName, text: m.bodyText, signIn };
    });
  }

  /** A push to the owner's linked phone when a target is near or missed. The ticket number only. */
  private async slaPush(org: string, ticketId: string, breached: boolean, eventId: string) {
    if (!this.cards.transport || !ticketId) return;
    const ctx = { organizationId: org, isSuperAdmin: false };
    const hit = await deskSystem(this.tenantPrisma, ctx, async (tx) => {
      const t = await tx.sdTicket.findFirst({ where: { organizationId: org, id: ticketId }, select: { id: true, number: true, assigneeUserId: true } });
      if (!t?.assigneeUserId) return null;
      const link = await tx.channelLink.findFirst({ where: { organizationId: org, userId: t.assigneeUserId, provider: 'push' } });
      return link ? { t, link } : null;
    });
    if (!hit) return;
    try {
      await this.tenantPrisma.forTenant(ctx, (tx) => tx.notificationDelivery.create({ data: { organizationId: org, channel: 'push', kind: 'sla_alert', idempotencyKey: `desk:push:sla:${eventId}`.slice(0, 128), addressMasked: 'phone', addressHash: sha256(hit.link.externalRef), status: 'sent', sentAt: new Date(), provider: this.cards.transport!.name.slice(0, 16) } }));
    } catch {
      return; // already pushed for this event
    }
    await this.cards.transport.post('push', hit.link.externalRef, { title: breached ? 'Target missed' : 'Target close', body: `${hit.t.number} ${breached ? 'missed its target' : 'is close to its target'}.`, data: { url: `${webOrigin()}/yx/desk/tickets/${hit.t.id}` } }).catch((e: Error) => this.logger.warn(`SLA push not sent: ${e.message}`));
  }

  // ------------------------------------------------------------------------------------------ dev transport only

  /** The messages the dev transport kept for this person's own linked phones and chat accounts. */
  async devOutbox(r: Requester) {
    const fake = this.transport as FakeMsgTransport;
    if (!this.isDev) throw new NotFoundException('Not available.');
    const org = r.ctx.organizationId;
    const mine = await deskSystem(this.tenantPrisma, this.who(r), async (tx) => {
      const ids = await tx.sdMsgIdentity.findMany({ where: { organizationId: org, userId: r.userId, state: 'active' } });
      const links = await tx.channelLink.findMany({ where: { organizationId: org, userId: r.userId, provider: { in: ['teams', 'slack'] } } });
      return new Set([...ids.map((i) => `${i.kind}:${this.crypto.decrypt(i.addressEncrypted)}`), ...links.map((l) => `${l.provider}:${l.externalRef}`)]);
    });
    return fake.sent
      .filter((x) => mine.has(`${x.kind}:${x.to}`))
      .slice(-30)
      .reverse()
      .map((x) => ({ kind: x.kind, text: x.text, template: x.template, at: x.at }));
  }

  /**
   * The local demo's "phone": a message from the person's own linked phone (or a JOIN from a phone they type), signed
   * with the line's secret and sent through the same webhook path as a provider. Dev transport only.
   */
  async devSend(r: Requester, dto: { kind: MsgKind; text: string; phone?: string }) {
    if (!this.isDev) throw new NotFoundException('Not available.');
    const org = r.ctx.organizationId;
    const line = await this.tenantPrisma.forTenant(this.who(r), (tx) => tx.sdMsgChannel.findFirst({ where: { organizationId: org, kind: dto.kind, state: 'active' } }));
    if (!line) throw new NotFoundException('This line is off.');
    let from: string | null;
    if (dto.kind === 'whatsapp' || dto.kind === 'sms') {
      const id = await deskSystem(this.tenantPrisma, this.who(r), (tx) => tx.sdMsgIdentity.findFirst({ where: { organizationId: org, kind: dto.kind, userId: r.userId, state: 'active' } }));
      // Only your own linked phone, or a JOIN with a code from your own app.
      from = id ? this.crypto.decrypt(id.addressEncrypted) : keyword(dto.text)?.kind === 'join' ? (dto.phone ?? null) : null;
    } else {
      from = (await this.tenantPrisma.forTenant(this.who(r), (tx) => tx.channelLink.findFirst({ where: { organizationId: org, userId: r.userId, provider: dto.kind } })))?.externalRef ?? null;
    }
    if (!from) throw new BadRequestException(dto.kind === 'whatsapp' || dto.kind === 'sms' ? 'Link your phone first: get a code, then send JOIN and the code.' : 'Link your chat app first.');
    const raw = Buffer.from(JSON.stringify({ id: `dev-${randomBytes(8).toString('hex')}`, from, text: dto.text, at: Date.now() }));
    const ts = String(Math.floor(Date.now() / 1000));
    return this.webhookFor(line, raw, { 'x-yukthix-timestamp': ts, 'x-yukthix-signature': signYukthix(this.crypto.decrypt(line.signingSecretEncrypted), ts, raw) });
  }

  /** The company-line webhook for a line already found (the dev phone uses it; the token path finds the line first). */
  private async webhookFor(line: Channel, raw: Buffer, headers: Headers) {
    if (!verifySignature('yukthix', this.crypto.decrypt(line.signingSecretEncrypted), raw, headers)) throw new UnauthorizedException('Not accepted.');
    const { messages } = parseInbound(line.kind as MsgKind, 'yukthix', JSON.parse(raw.toString('utf8')));
    let taken = 0;
    for (const m of messages) {
      if (!(await this.redis.set(`sd:msg:seen:${line.kind}:${sha256(m.id)}`, '1', 'EX', SEEN_SECONDS, 'NX'))) continue;
      if (await this.receive(line.kind as MsgKind, line, m)) taken++;
    }
    return { ok: true as const, taken };
  }
}

/**
 * Security review fix (9 Oct 2026): the words of a ticket stay in the app when it is sensitive or private, and also for
 * every ticket on a restricted desk or an HR desk (HR content never goes to WhatsApp, SMS, Teams or Slack, YX-NTF-04).
 */
export async function wordsStayIn(tx: Tx, t: { organizationId: string; deskId: string; sensitive: boolean; private: boolean }): Promise<boolean> {
  if (t.sensitive || t.private) return true;
  const d = await tx.sdDesk.findFirst({ where: { organizationId: t.organizationId, id: t.deskId }, select: { privacy: true, kind: true } });
  return !d || d.privacy === 'restricted' || d.kind === 'hr';
}

export const KIND_LABEL: Record<MsgKind, string> = { whatsapp: 'WhatsApp', sms: 'SMS', teams: 'Microsoft Teams', slack: 'Slack' };

/** Where each shared path is verified (YukthiX's own registrations, go-live). */
const SHARED_SECRETS: Record<MsgKind, { scheme: Scheme; secret: string }> = {
  whatsapp: { scheme: 'meta', secret: 'YX_WHATSAPP_APP_SECRET' },
  sms: { scheme: 'yukthix', secret: 'YX_SMS_INBOUND_SECRET' },
  slack: { scheme: 'slack', secret: 'YX_SLACK_SIGNING_SECRET' },
  // Bot Framework JWTs need the YukthiX Teams registration (go-live): until then nothing verifies, so nothing is taken.
  teams: { scheme: 'yukthix', secret: 'YX_TEAMS_DEV_SECRET_NEVER_SET' },
};

// Founder decision 9 Oct 2026 (P04 Q2): YukthiX's shared number is the default; a company's own number is optional (one
// line per kind per company, on one desk). The 24 Sep decision-log line "each company's own number" is superseded.
const sharedNumber = (kind: MsgKind) => (kind === 'whatsapp' ? (process.env.YX_WHATSAPP_DISPLAY_NUMBER ?? (devTransport() ? '+91 80000 00000 (demo)' : null)) : kind === 'sms' ? (process.env.YX_SMS_DISPLAY_NUMBER ?? (devTransport() ? '+91 80000 00001 (demo)' : null)) : null);
const apiOrigin = () => (process.env.API_ORIGIN ?? 'http://localhost:3001').replace(/\/$/, '');
const webOrigin = () => (process.env.WEB_ORIGIN ?? 'http://localhost:3000').replace(/\/$/, '');
const subjectOf = (text: string) => {
  const line = text.split(/\r?\n/).find((l) => l.trim()) ?? text;
  return line.trim().length > 80 ? `${line.trim().slice(0, 77)}…` : line.trim() || 'Message';
};

/** Only the template fields we use, plain text, bounded. */
function cleanTemplates(kind: MsgKind, t: Record<string, Template> | undefined): Record<string, Template> {
  const out: Record<string, Template> = {};
  for (const [name, v] of Object.entries(t ?? {})) {
    if (!['reply_notice', 'notice'].includes(name) || typeof v !== 'object' || v === null) continue;
    const status = ['approved', 'pending', 'rejected'].includes(String(v.status)) ? String(v.status) : 'pending';
    if (kind === 'whatsapp') {
      if (!/^[a-z0-9_]{1,512}$/.test(String(v.name ?? ''))) throw new BadRequestException('A WhatsApp template name is lower-case letters, digits and _.');
      out[name] = { name: String(v.name), language: /^[a-z]{2}(_[A-Z]{2})?$/.test(String(v.language ?? '')) ? String(v.language) : 'en', status };
    } else if (kind === 'sms') {
      const body = String(v.body ?? '').slice(0, 500);
      if (!/\{#var#\}/.test(body)) throw new BadRequestException('An SMS template needs {#var#} for the request number.');
      if (name === 'reply_notice' && (body.match(/\{#var#\}/g) ?? []).length !== 2) throw new BadRequestException('An SMS reply template has two {#var#}: the request number, then the link to read the reply.');
      if (v.dltTemplateId != null && !/^\d{1,30}$/.test(String(v.dltTemplateId))) throw new BadRequestException('The DLT template id is digits only.');
      out[name] = { body, dltTemplateId: v.dltTemplateId ? String(v.dltTemplateId) : null, status };
    }
  }
  return out;
}
