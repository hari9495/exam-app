import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService, TenantPrismaService } from '@exam-platform/shared';
import { companyContext } from '../org-structure/org-structure.service';
import { PLATFORM, platformRead } from './platform.service';

type Tx = Prisma.TransactionClient;
export const SALES_REPLY_KEY = 'sales.reply_hours';
export const SALES_REPLY_DEFAULT = 24;
export const TOPICS = ['migration', 'parallel_run', 'entities', 'pricing'] as const;
export const OUTCOMES = ['open', 'demo_booked', 'converted', 'lost'] as const;
/** "17 Nov 2026, 10:30 am" in India time, for a refusal that says when YukthiX replies. */
const formatIst = (d: Date) => new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(d);
const TOPIC_WORDS: Record<string, string> = { migration: 'moving data', parallel_run: 'payroll parallel run', entities: 'several legal entities', pricing: 'pricing for their size' };

/** The drawn size bands (counts only, never names). */
export function sizeBand(n: number): string {
  if (n < 50) return 'Under 50';
  if (n < 200) return '50–200';
  if (n < 500) return '200–500';
  if (n < 1000) return '500–1,000';
  if (n < 2500) return '1,000–2,500';
  return '2,500+';
}

/**
 * YukthiX console C-8, YX-13 (and answer 1210): the sales-assist queue. A company person presses Talk to us on a nudge
 * card shown to them; the request (company, feature, phone, what to discuss, size band and set-up share at the time) lands
 * in the staff queue with a reply due time. A staff member takes it (owner) and records the outcome. All audited, on the
 * platform log and (the request) on the company's own log.
 */
@Injectable()
export class SalesAssistService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  private async replyHours(tx: Tx) {
    const v = Number((await tx.platformSetting.findUnique({ where: { key: SALES_REPLY_KEY } }))?.value);
    return Number.isInteger(v) && v > 0 ? v : SALES_REPLY_DEFAULT;
  }

  // ------------------------------------------------------------------------------------------------ the company side

  /** Talk to us on a nudge card: only for a nudge this person was shown; one open request per company and feature. */
  async request(
    ctx: { organizationId: string | null; userId?: string | null; actingSuperAdmin?: boolean },
    dto: { nudgeId: string; phone: string; topics: string[]; note?: string },
    setupPct: (() => Promise<number | null>) | null,
  ) {
    if (!ctx.organizationId || !ctx.userId || ctx.actingSuperAdmin) throw new ForbiddenException('Only a company person can ask YukthiX to talk.');
    const c = companyContext({ organizationId: ctx.organizationId, isSuperAdmin: false, userId: ctx.userId });
    const known = await this.tenantPrisma.forTenant(c, async (tx) => {
      const seen = await tx.nudgeView.findFirst({ where: { organizationId: c.organizationId, userId: ctx.userId!, nudgeId: dto.nudgeId } });
      if (!seen) return null;
      const me = await tx.user.findFirst({ where: { id: ctx.userId!, organizationId: c.organizationId }, select: { name: true, email: true } });
      return { name: me?.name?.trim() || me?.email || '', employees: await tx.employee.count({ where: { organizationId: c.organizationId } }) };
    });
    if (!known) throw new NotFoundException('Nothing to ask about here.');
    const pct = setupPct ? await setupPct().catch(() => null) : null;
    const topics = [...new Set(dto.topics)];
    const made = await this.tenantPrisma.forTenant(PLATFORM, async (tx) => {
      const nudge = await tx.featureNudge.findUnique({ where: { id: dto.nudgeId }, select: { featureKey: true } });
      if (!nudge) throw new NotFoundException('Nothing to ask about here.');
      const open = await tx.salesAssistRequest.findFirst({ where: { organizationId: c.organizationId, featureKey: nudge.featureKey, status: 'open' }, select: { dueAt: true } });
      if (open) throw new ConflictException(`Your company already asked about this. YukthiX replies by ${open.dueAt.toISOString()}.`);
      const now = Date.now();
      const r = await tx.salesAssistRequest.create({
        data: { organizationId: c.organizationId, featureKey: nudge.featureKey, nudgeId: dto.nudgeId, topics, phone: dto.phone, note: dto.note?.trim() || null, requestedBy: ctx.userId!, requestedByName: known.name.slice(0, 200), employees: known.employees, setupPct: pct, dueAt: new Date(now + (await this.replyHours(tx)) * 3_600_000) },
      });
      await AuditService.recordIn(tx, PLATFORM, { actorUserId: null, action: 'platform.sales.requested', entityType: 'sales_assist_request', entityId: r.id, metadata: { organizationId: c.organizationId, featureKey: r.featureKey, topics } });
      return r;
    });
    // The company's own log: who asked, about what (not the phone).
    await this.tenantPrisma.forTenant(c, (tx) => AuditService.recordIn(tx, c, { actorUserId: ctx.userId!, action: 'help.talk_to_us.sent', entityType: 'sales_assist_request', entityId: made.id, metadata: { featureKey: made.featureKey, topics } }));
    return { dueAt: made.dueAt.toISOString() };
  }

  /**
   * Answer 2112: a sales request straight from an Ask YukthiX chat about buying (the assistant checks the person may
   * change the plan, the chat is theirs and about buying). Same queue, reply time and audit as Talk to us; the chat goes
   * with it, masked. Once per chat (also the database's unique index), and one open chat request per company (2135).
   */
  /** Answer 2146: the company's open sales request (any source), with when YukthiX sales reply; null when none. */
  async openFor(organizationId: string): Promise<{ dueAt: string } | null> {
    const open = await this.tenantPrisma.forTenant(PLATFORM, (tx) =>
      tx.salesAssistRequest.findFirst({ where: { organizationId, status: 'open' }, orderBy: { dueAt: 'asc' }, select: { dueAt: true } }),
    );
    return open ? { dueAt: open.dueAt.toISOString() } : null;
  }

  async requestFromChat(
    c: { organizationId: string; userId: string },
    dto: { phone: string; topics: string[]; note?: string },
    chat: { conversationId: string; text: string },
  ) {
    const ctx = companyContext({ organizationId: c.organizationId, isSuperAdmin: false, userId: c.userId });
    const known = await this.tenantPrisma.forTenant(ctx, async (tx) => {
      const me = await tx.user.findFirst({ where: { id: c.userId, organizationId: c.organizationId }, select: { name: true, email: true } });
      return { name: me?.name?.trim() || me?.email || '', employees: await tx.employee.count({ where: { organizationId: c.organizationId } }) };
    });
    const topics = [...new Set(dto.topics)];
    const made = await this.tenantPrisma.forTenant(PLATFORM, async (tx) => {
      if (await tx.salesAssistRequest.findFirst({ where: { conversationId: chat.conversationId }, select: { id: true } })) throw new ConflictException('A sales request was already sent from this chat.');
      // Answers 2135 and 2146: one open sales request per company at a time, from any source (the lock keeps two chats
      // from both passing); sales already reply about the open one.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`sales-chat:${c.organizationId}`}))`;
      const open = await tx.salesAssistRequest.findFirst({ where: { organizationId: c.organizationId, status: 'open' }, orderBy: { dueAt: 'asc' }, select: { dueAt: true, source: true } });
      if (open) throw new ConflictException(`Your company already asked YukthiX sales${open.source === 'assistant' ? ' from a chat' : ''}. They reply by ${formatIst(open.dueAt)}.`);
      const r = await tx.salesAssistRequest.create({
        data: { organizationId: c.organizationId, source: 'assistant', conversationId: chat.conversationId, chat: chat.text.slice(0, 10_000), topics, phone: dto.phone, note: dto.note?.trim() || null, requestedBy: c.userId, requestedByName: known.name.slice(0, 200), employees: known.employees, dueAt: new Date(Date.now() + (await this.replyHours(tx)) * 3_600_000) },
      });
      await AuditService.recordIn(tx, PLATFORM, { actorUserId: null, action: 'platform.sales.requested', entityType: 'sales_assist_request', entityId: r.id, metadata: { organizationId: c.organizationId, source: 'assistant', topics } });
      return r;
    });
    return { id: made.id, number: made.number, dueAt: made.dueAt.toISOString() };
  }

  // ------------------------------------------------------------------------------------------------ console (staff)

  /** The queue: every request with its company (an audited cross-company read). */
  async queue(actorUserId: string) {
    return platformRead(this.tenantPrisma, actorUserId, 'sales.queue', async (tx) => {
      const rows = await tx.salesAssistRequest.findMany({ orderBy: [{ status: 'asc' }, { dueAt: 'asc' }], take: 300 });
      const orgs = new Map((await tx.organization.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.organizationId))] } }, select: { id: true, name: true } })).map((o) => [o.id, o.name]));
      const owners = new Map((await tx.user.findMany({ where: { id: { in: rows.flatMap((r) => (r.ownerId ? [r.ownerId] : [])) } }, select: { id: true, name: true, email: true } })).map((u) => [u.id, u.name?.trim() || u.email]));
      const flags = new Map((await tx.featureFlag.findMany({ select: { key: true, label: true } })).map((f) => [f.key, f.label]));
      return {
        now: new Date().toISOString(),
        rows: rows.map((r) => ({
          id: r.id,
          ref: `SA-${String(r.number).padStart(3, '0')}`,
          company: orgs.get(r.organizationId) ?? '',
          band: sizeBand(r.employees),
          why: [r.source === 'assistant' ? 'Ask YukthiX: a buying question' : `Talk to us: ${r.featureKey ? (flags.get(r.featureKey) ?? r.featureKey) : 'upgrade'}`, ...r.topics.map((t) => TOPIC_WORDS[t] ?? t)].join(' · '),
          chat: r.chat,
          setupPct: r.setupPct,
          owner: r.ownerId ? (owners.get(r.ownerId) ?? '') : null,
          mine: r.ownerId === actorUserId,
          dueAt: r.dueAt.toISOString(),
          status: r.status,
          requestedBy: r.requestedByName,
          phone: r.phone,
          note: r.note,
          outcomeNote: r.outcomeNote,
          createdAt: r.createdAt.toISOString(),
          version: r.version,
        })),
      };
    });
  }

  /** Take an unowned request (the owner replies). */
  async take(actorUserId: string, id: string) {
    await this.tenantPrisma.forTenant(PLATFORM, async (tx) => {
      const done = await tx.salesAssistRequest.updateMany({ where: { id, ownerId: null }, data: { ownerId: actorUserId, version: { increment: 1 } } });
      if (!done.count) {
        if (!(await tx.salesAssistRequest.findUnique({ where: { id }, select: { id: true } }))) throw new NotFoundException('No such request.');
        throw new ConflictException('Someone else took this request.');
      }
      await AuditService.recordIn(tx, PLATFORM, { actorUserId, action: 'platform.sales.taken', entityType: 'sales_assist_request', entityId: id });
    });
    return this.queue(actorUserId);
  }

  /** The owner records the outcome; Lost needs a reason. */
  async outcome(actorUserId: string, id: string, dto: { status: (typeof OUTCOMES)[number]; note?: string; version: number }) {
    if (dto.status === 'lost' && !dto.note?.trim()) throw new BadRequestException('Say why it was lost.');
    await this.tenantPrisma.forTenant(PLATFORM, async (tx) => {
      const r = await tx.salesAssistRequest.findUnique({ where: { id } });
      if (!r) throw new NotFoundException('No such request.');
      if (r.ownerId !== actorUserId) throw new ForbiddenException('Take the request first: only its owner records the outcome.');
      const done = await tx.salesAssistRequest.updateMany({ where: { id, version: dto.version }, data: { status: dto.status, outcomeNote: dto.note?.trim() || null, decidedAt: dto.status === 'open' ? null : new Date(), version: { increment: 1 } } });
      if (!done.count) throw new ConflictException('Someone changed this request since you opened it. Open it again.');
      await AuditService.recordIn(tx, PLATFORM, { actorUserId, action: 'platform.sales.outcome', entityType: 'sales_assist_request', entityId: id, metadata: { from: r.status, to: dto.status, note: dto.note?.trim() || null } });
    });
    return this.queue(actorUserId);
  }
}
