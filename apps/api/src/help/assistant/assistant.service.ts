import { ConflictException, ForbiddenException, Inject, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService, PrismaService, TenantContext, TenantPrismaService, resolvePermissionGrants } from '@exam-platform/shared';
import { KbService } from '../../service-desk/kb.service';
import { SupportBridgeService } from '../../service-desk/support-bridge.service';
import { maskPii } from '../../service-desk/pii';
import { IncidentsService } from '../../platform/incidents.service';
import { PLATFORM } from '../../platform/platform.service';
import { todayIst } from '../../org-structure/org-validation';
import { WhatsNewService } from '../whats-new.service';
import { ASK_CLIENT, type AskClient } from './assistant-client';
import { ASK_MODEL_DEFAULT, ASK_MODEL_KEY, ASK_MODEL_PATTERN, ASK_SETTINGS, type AskSettingKey } from './assistant-settings';
import { buildRequest, readReply, type Asker, type Outcome, type Source, type Turn } from './assistant-prompt';

type Tx = Prisma.TransactionClient;

/** The signed-in person asking (their own session: the controller refuses while acting for someone else). */
export interface Me {
  organizationId: string;
  userId: string;
  role: string;
  permissionProfileId: string | null;
}

/** Keys that tell the assistant which areas the person can open (answer 2107: answers follow the person's role). */
const AREA_KEYS: Record<string, string> = {
  'org:manage_settings': 'Company settings (System Admin)',
  'employee.profile.view': 'People records',
  'lifecycle.onboarding.manage': 'Onboarding',
  'leave.settings.manage': 'Leave set-up',
  'leave.approve': 'Approving leave',
  'attendance.view': 'Attendance',
  'payroll.run.prepare': 'Running payroll',
  'expense.policy.manage': 'Expense policies',
  'ats.job.manage': 'Hiring',
  'desk.ticket.work': 'Service Desk tickets',
  'billing.view': 'Plan and invoices',
  'org.yukthix_support.raise': 'Contacting YukthiX support',
};
const RAISE_KEY = 'org.yukthix_support.raise';
/** Outcomes that count as unhelpful toward offering a person (answer 2104). */
const UNHELPFUL: Outcome[] = ['not_covered', 'needs_person', 'refused', 'error'];
const HISTORY_TURNS = 6;

/**
 * What YukthiX staff see of a question from another company: the service desk masking (cards, Aadhaar, PAN, bank,
 * passwords, health) plus email addresses and phone numbers, which a staff review never needs.
 */
export function reviewMask(text: string): string {
  return maskPii(text)
    .text.replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[email hidden]')
    .replace(/(?:\+?91[\s-]?)?(?<!\d)[6-9]\d{4}[\s-]?\d{5}(?!\d)/g, '[phone hidden]');
}

const ctxOf = (me: Me): TenantContext => ({ organizationId: me.organizationId, isSuperAdmin: false, userId: me.userId, role: me.role, permissionProfileId: me.permissionProfileId });

/**
 * Ask YukthiX (answers 2101 to 2108). Answers questions about YukthiX from approved YukthiX help content only (help
 * articles marked "Use in assistant answers", What's new, the current known issue, the product list), citing them; the
 * model sees the question, those documents and the person's role and areas, never company records. It cannot act: a
 * hand-over is the person pressing "Raise support ticket" (the Contact YukthiX ticket, its key) or "Send feature
 * request". Questions are limited per person per India day, counted atomically in the database.
 */
@Injectable()
export class AssistantService {
  private readonly logger = new Logger(AssistantService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly prisma: PrismaService,
    private readonly kb: KbService,
    private readonly news: WhatsNewService,
    private readonly incidents: IncidentsService,
    private readonly support: SupportBridgeService,
    @Optional() @Inject(ASK_CLIENT) private readonly client: AskClient | null,
  ) {}

  /** A platform setting (its default when not set), read in the platform context. */
  async setting(key: AskSettingKey): Promise<number> {
    const v = Number((await this.tenantPrisma.forTenant(PLATFORM, (tx) => tx.platformSetting.findUnique({ where: { key } })))?.value);
    return Number.isInteger(v) && v > 0 ? v : ASK_SETTINGS[key].default;
  }

  private async model(): Promise<string> {
    const v = (await this.tenantPrisma.forTenant(PLATFORM, (tx) => tx.platformSetting.findUnique({ where: { key: ASK_MODEL_KEY } })))?.value;
    return v && ASK_MODEL_PATTERN.test(v) ? v : ASK_MODEL_DEFAULT;
  }

  private async keys(me: Me, keys: string[]): Promise<Set<string>> {
    return resolvePermissionGrants(this.prisma, this.tenantPrisma, { role: me.role, organizationId: me.organizationId, permissionProfileId: me.permissionProfileId, userId: me.userId }, keys);
  }

  /** Switched on or not, today's questions left, whether the person may raise a YukthiX ticket, and the latest chat. */
  async state(me: Me) {
    const [limit, granted] = await Promise.all([this.setting('help.assistant.daily_questions'), this.keys(me, [RAISE_KEY])]);
    return this.tenantPrisma.forTenant(ctxOf(me), async (tx) => {
      const used = (await tx.assistantDailyCount.findUnique({ where: { userId_day: { userId: me.userId, day: new Date(`${todayIst()}T00:00:00Z`) } } }))?.questions ?? 0;
      const last = await tx.assistantConversation.findFirst({ where: { organizationId: me.organizationId, userId: me.userId }, orderBy: { lastAt: 'desc' }, include: { messages: { orderBy: { createdAt: 'asc' } } } });
      return { on: Boolean(this.client), limit, remaining: Math.max(0, limit - used), canRaiseTicket: granted.has(RAISE_KEY), conversation: last ? await this.view(last) : null };
    });
  }

  private async view(c: Prisma.AssistantConversationGetPayload<{ include: { messages: true } }>) {
    const handover = await this.setting('help.assistant.unhelpful_handover');
    return {
      id: c.id,
      ticketRef: c.ticketRef,
      featureRequestSent: Boolean(c.featureRequestId),
      offerPerson: c.unhelpful >= handover,
      messages: c.messages.map((m) => ({ id: m.id, role: m.role as 'user' | 'assistant', text: m.text, sources: m.sources as unknown as { title: string; href: string | null }[], outcome: m.outcome, feedback: m.feedback })),
    };
  }

  /** One question: counted (refused past the day's limit), answered from approved content, both kept in the chat. */
  async ask(me: Me, question: string, conversationId?: string) {
    if (!this.client) return { on: false as const };
    const limit = await this.setting('help.assistant.daily_questions');
    const ctx = ctxOf(me);
    const day = todayIst();
    const { conversation, history } = await this.tenantPrisma.forTenant(ctx, async (tx) => {
      // Atomic: one upsert that adds the question only while under the limit (two tabs cannot both pass at 49).
      const counted = await tx.$queryRaw<{ questions: number }[]>`
        INSERT INTO assistant_daily_counts (organization_id, user_id, day, questions) VALUES (${me.organizationId}::uuid, ${me.userId}::uuid, ${day}::date, 1)
        ON CONFLICT (user_id, day) DO UPDATE SET questions = assistant_daily_counts.questions + 1 WHERE assistant_daily_counts.questions < ${limit}
        RETURNING questions`;
      if (!counted.length) throw new ConflictException(`You have asked ${limit} questions today, the most in one day. Ask again tomorrow, or raise a support ticket.`);
      const conversation = conversationId
        ? await tx.assistantConversation.findFirst({ where: { id: conversationId, organizationId: me.organizationId, userId: me.userId } })
        : await tx.assistantConversation.create({ data: { organizationId: me.organizationId, userId: me.userId } });
      if (!conversation) throw new NotFoundException('No such conversation.');
      const earlier = await tx.assistantMessage.findMany({ where: { conversationId: conversation.id }, orderBy: { createdAt: 'desc' }, take: HISTORY_TURNS, select: { role: true, text: true } });
      await tx.assistantMessage.create({ data: { organizationId: me.organizationId, userId: me.userId, conversationId: conversation.id, role: 'user', text: question } });
      return { conversation, history: earlier.reverse().map((m): Turn => ({ role: m.role as Turn['role'], text: m.text })) };
    });

    const [sources, asker, model] = await Promise.all([this.sources(me, question), this.asker(me), this.model()]);
    let reply: { text: string; sources: Source[]; outcome: Outcome };
    try {
      reply = readReply(await this.client.create(buildRequest(model, history, question, sources, asker)), sources);
    } catch (e) {
      // Never the key or the request: only that the call failed, and why in the SDK's words.
      this.logger.warn(`Ask YukthiX call failed: ${e instanceof Error ? e.message.slice(0, 200) : 'unknown error'}`);
      reply = { text: 'Something went wrong while answering. Try again, or raise a support ticket.', sources: [], outcome: 'error' };
    }

    return this.tenantPrisma.forTenant(ctx, async (tx) => {
      if (reply.outcome === 'error') {
        // A failed answer gives the question back.
        await tx.$executeRaw`UPDATE assistant_daily_counts SET questions = questions - 1 WHERE user_id = ${me.userId}::uuid AND day = ${day}::date AND questions > 0`;
      }
      const saved = await tx.assistantMessage.create({
        data: { organizationId: me.organizationId, userId: me.userId, conversationId: conversation.id, role: 'assistant', text: reply.text, outcome: reply.outcome, sources: reply.sources.map((s) => ({ title: s.title, href: s.href })) as Prisma.InputJsonValue },
      });
      const c = await tx.assistantConversation.update({ where: { id: conversation.id }, data: { lastAt: new Date(), ...(UNHELPFUL.includes(reply.outcome) ? { unhelpful: { increment: 1 } } : {}) }, include: { messages: { orderBy: { createdAt: 'asc' } } } });
      const used = (await tx.assistantDailyCount.findUnique({ where: { userId_day: { userId: me.userId, day: new Date(`${day}T00:00:00Z`) } } }))?.questions ?? 0;
      return { on: true as const, answerId: saved.id, outcome: reply.outcome, remaining: Math.max(0, limit - used), conversation: await this.view(c) };
    });
  }

  /** Approved content for this question, each with a ref the answer cites (A: articles, W: What's new, K: known issue). */
  private async sources(me: Me, question: string): Promise<Source[]> {
    const ctx = ctxOf(me);
    const [articles, news, issue] = await Promise.all([
      this.kb.assistantSources(question),
      this.news.mine(ctx, { userId: me.userId, role: me.role, permissionProfileId: me.permissionProfileId }).catch(() => ({ entries: [] as { title: string; body: string; date: string }[] })),
      this.incidents.current(ctx).catch(() => null),
    ]);
    return [
      ...articles.map((a, i): Source => ({ ref: `A${i + 1}`, kind: 'article', title: a.title, href: a.href, text: a.text })),
      ...news.entries.slice(0, 5).map((e, i): Source => ({ ref: `W${i + 1}`, kind: 'whats_new', title: `What's new: ${e.title}`, href: null, text: `${e.date}: ${e.body}` })),
      ...(issue ? [{ ref: 'K1', kind: 'known_issue' as const, title: `Known issue: ${issue.title}`, href: null, text: `${issue.impact}\n${issue.action}` }] : []),
    ];
  }

  private async asker(me: Me): Promise<Asker> {
    const granted = await this.keys(me, Object.keys(AREA_KEYS));
    return { role: me.role, areas: Object.entries(AREA_KEYS).filter(([k]) => granted.has(k)).map(([, v]) => v) };
  }

  /** Thumbs on one of the assistant's answers in the person's own chat; thumbs down counts toward offering a person. */
  async feedback(me: Me, messageId: string, value: 'up' | 'down') {
    return this.tenantPrisma.forTenant(ctxOf(me), async (tx) => {
      const m = await tx.assistantMessage.findFirst({ where: { id: messageId, organizationId: me.organizationId, userId: me.userId, role: 'assistant' } });
      if (!m) throw new NotFoundException('No such answer.');
      if (m.feedback === value) return { feedback: value };
      await tx.assistantMessage.update({ where: { id: m.id }, data: { feedback: value } });
      const delta = (value === 'down' ? 1 : 0) - (m.feedback === 'down' ? 1 : 0);
      if (delta) await tx.assistantConversation.update({ where: { id: m.conversationId }, data: { unhelpful: { increment: delta } } });
      return { feedback: value };
    });
  }

  private async mine(tx: Tx, me: Me, id: string) {
    const c = await tx.assistantConversation.findFirst({ where: { id, organizationId: me.organizationId, userId: me.userId }, include: { messages: { orderBy: { createdAt: 'asc' } } } });
    if (!c) throw new NotFoundException('No such conversation.');
    if (!c.messages.length) throw new ConflictException('Ask a question first.');
    return c;
  }

  /** The chat as text for a person to read (the newest part when it is long; the ticket body takes 10,000 characters). */
  private transcript(messages: { role: string; text: string }[]): string {
    const lines = messages.map((m) => `${m.role === 'user' ? 'Asked' : 'Ask YukthiX'}: ${m.text}`);
    let body = `From Ask YukthiX (the in-app help assistant):\n\n${lines.join('\n\n')}`;
    if (body.length > 10_000) body = `From Ask YukthiX (latest part of the chat):\n\n…${lines.join('\n\n').slice(-9_900)}`;
    return body;
  }

  /**
   * Answer 2104: "Raise support ticket": a Contact YukthiX ticket with the chat attached, through the existing service
   * (the controller requires its key, org.yukthix_support.raise). Once per chat; audited.
   */
  async raiseTicket(me: Me, conversationId: string) {
    if (!(await this.keys(me, [RAISE_KEY])).has(RAISE_KEY)) throw new ForbiddenException('Your System Admin raises tickets with YukthiX support. Ask them, or send this as a feature request.');
    const c = await this.tenantPrisma.forTenant(ctxOf(me), (tx) => this.mine(tx, me, conversationId));
    if (c.ticketRef) throw new ConflictException(`A ticket was already raised from this chat (${c.ticketRef}).`);
    const first = c.messages.find((m) => m.role === 'user')!.text;
    const subject = `Ask YukthiX: ${first.replace(/\s+/g, ' ').trim()}`.slice(0, 200);
    const out = await this.support.raise(ctxOf(me), { subject, body: this.transcript(c.messages), severity: 3 });
    const ref = out.number ? String(out.number) : 'sending';
    await this.tenantPrisma.forTenant(ctxOf(me), async (tx) => {
      await tx.assistantConversation.update({ where: { id: c.id }, data: { ticketRef: ref, handedOverAt: new Date() } });
      await AuditService.recordIn(tx, ctxOf(me), { actorUserId: me.userId, action: 'help.assistant.ticket_raised', entityType: 'assistant_conversation', entityId: c.id, metadata: { ticket: out.number, messages: c.messages.length } });
    });
    return { ticket: out.number, sending: out.sending };
  }

  /** Answer 2105: "Send feature request" from this chat: to the staff Feature requests list. Once per chat; audited. */
  async sendFeatureRequest(me: Me, conversationId: string, title: string, details: string) {
    return this.tenantPrisma.forTenant(ctxOf(me), async (tx) => {
      const c = await this.mine(tx, me, conversationId);
      if (c.featureRequestId) throw new ConflictException('A feature request was already sent from this chat.');
      const name = (await tx.user.findUnique({ where: { id: me.userId }, select: { name: true, email: true } })) ?? { name: null, email: '' };
      const fr = await tx.featureRequest.create({ data: { organizationId: me.organizationId, requestedBy: me.userId, requestedByName: (name.name || name.email || 'Someone').slice(0, 200), title, details, conversationId: c.id } });
      await tx.assistantConversation.update({ where: { id: c.id }, data: { featureRequestId: fr.id, handedOverAt: c.handedOverAt ?? new Date() } });
      await AuditService.recordIn(tx, ctxOf(me), { actorUserId: me.userId, action: 'help.assistant.feature_requested', entityType: 'feature_request', entityId: fr.id, metadata: { number: fr.number, conversationId: c.id } });
      return { number: fr.number };
    });
  }

  // ------------------------------------------------------------------------------------------------ YukthiX staff

  /** The staff view: questions, answers by outcome, thumbs, unanswered questions (masked) and chats that became tickets. */
  async review(days: number) {
    const since = new Date(Date.now() - days * 86_400_000);
    return this.tenantPrisma.forTenant(PLATFORM, async (tx) => {
      const outcomes = await tx.assistantMessage.groupBy({ by: ['outcome'], where: { role: 'assistant', createdAt: { gte: since } }, _count: { _all: true } });
      const thumbs = await tx.assistantMessage.groupBy({ by: ['feedback'], where: { role: 'assistant', createdAt: { gte: since }, feedback: { not: null } }, _count: { _all: true } });
      const misses = await tx.assistantMessage.findMany({ where: { role: 'assistant', createdAt: { gte: since }, OR: [{ outcome: { in: ['not_covered', 'needs_person'] } }, { feedback: 'down' }] }, orderBy: { createdAt: 'desc' }, take: 100, select: { conversationId: true, createdAt: true, outcome: true, feedback: true } });
      const questions = await Promise.all(
        misses.map(async (m) => {
          const q = await tx.assistantMessage.findFirst({ where: { conversationId: m.conversationId, role: 'user', createdAt: { lte: m.createdAt } }, orderBy: { createdAt: 'desc' }, select: { text: true } });
          return { question: reviewMask(q?.text ?? ''), outcome: m.outcome, feedback: m.feedback, at: m.createdAt.toISOString() };
        }),
      );
      const tickets = await tx.assistantConversation.findMany({ where: { ticketRef: { not: null }, handedOverAt: { gte: since } }, orderBy: { handedOverAt: 'desc' }, take: 100, select: { ticketRef: true, handedOverAt: true, organizationId: true } });
      const orgs = new Map((await tx.organization.findMany({ where: { id: { in: [...new Set(tickets.map((t) => t.organizationId))] } }, select: { id: true, name: true } })).map((o) => [o.id, o.name]));
      const count = (o: string) => outcomes.find((x) => x.outcome === o)?._count._all ?? 0;
      return {
        days,
        answers: outcomes.reduce((n, x) => n + x._count._all, 0),
        byOutcome: Object.fromEntries(['answered', 'not_covered', 'needs_person', 'feature_request', 'buying', 'refused', 'error'].map((o) => [o, count(o)])),
        thumbsUp: thumbs.find((t) => t.feedback === 'up')?._count._all ?? 0,
        thumbsDown: thumbs.find((t) => t.feedback === 'down')?._count._all ?? 0,
        unanswered: questions,
        tickets: tickets.map((t) => ({ ticket: t.ticketRef, company: orgs.get(t.organizationId) ?? '', at: t.handedOverAt!.toISOString() })),
      };
    });
  }

  /** Nightly: chats whose last message is older than help.assistant.keep_days go, and day counts older than a week. */
  async sweep(now = new Date()) {
    const keep = await this.setting('help.assistant.keep_days');
    return this.tenantPrisma.forTenant(PLATFORM, async (tx) => {
      const chats = await tx.assistantConversation.deleteMany({ where: { lastAt: { lt: new Date(now.getTime() - keep * 86_400_000) } } });
      const counts = await tx.assistantDailyCount.deleteMany({ where: { day: { lt: new Date(now.getTime() - 7 * 86_400_000) } } });
      return { chats: chats.count, counts: counts.count };
    });
  }

  /** Refuses while staff are acting as the person (the controller checks too; this keeps the rule in the service). */
  static assertOwn(user: { impersonatorUserId?: string | null; actingSuperAdmin?: boolean | null }) {
    if (user.impersonatorUserId || user.actingSuperAdmin) throw new ForbiddenException('Not available while acting for someone else.');
  }
}
