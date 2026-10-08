import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { platformRead } from '../platform/platform.service';
import { SupportSessionsService } from '../platform/support-sessions.service';
import { CompanyContext, Tx } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { planFor } from './customers.service';
import { DeskActor, DeskRole, activeOn, audit, deskSystem, visibleTickets } from './desk-access';
import { ConsoleLinkDto, ConsoleMessageDto, SupportAccessDto, SupportRaiseDto, SupportReplyDto } from './dto-ops';
import { RequesterService } from './requester.service';
import { textToHtml } from './rich-text';
import { TicketsService } from './tickets.service';
import { WorkService } from './work.service';

// SD-1.31 YukthiX's own support (§3 use 2, US-B-116 … US-B-120; P14 YX-CONSOLE-01 … 05; P02 YX-SEC-20).
//
// A customer company's System Admin raises and follows tickets with YukthiX ONLY through the two SECURITY DEFINER
// functions sd_support_intake() / sd_support_my_tickets() (migration 20261018000000): their session never reads the
// platform tenant. What the intake function writes, the platform desk's own processing (a desk-system transaction in the
// platform tenant only) turns into a ticket or a reply.
//
// YukthiX staff work the YukthiX Support desk from the console as the platform-tenant desk user linked to their staff
// account (sd_console_agents): every read and write runs in the platform tenant's own context, so RLS keeps them there.
// The tenant panel shows account facts only (company, products, plan, health, billing state; never HR data) through the
// audited platformRead the console already uses. Looking inside the company needs a P02 support session the company
// approves, asked from the ticket ("Request access").

/** Severity → the platform desk's priority (Sev-1 = P1 …). */
const SEVERITY_LABEL = ['', 'Severity 1 (down)', 'Severity 2 (badly hurt)', 'Severity 3 (question or small problem)', 'Severity 4 (idea)'];
const CONSOLE_KEYS = new Set(['desk.ticket.view', 'desk.ticket.work', 'desk.ticket.note', 'desk.ticket.assign', 'desk.task.work', 'desk.kb.view_internal']);

export interface SupportTicketRow {
  id: string;
  number: string | null;
  subject: string;
  status: string;
  state: string;
  severity: number;
  created_at: string;
  updated_at: string;
}

/** Postgres errors raised by the bridge functions, as plain HTTP answers. */
function bridgeError(e: unknown): never {
  const msg = (e as { message?: string })?.message ?? '';
  const m = /SD_SUPPORT_(\w+): ([^"\n]+)/.exec(msg);
  if (m?.[1] === 'CALLER') throw new ForbiddenException(m[2]);
  if (m?.[1] === 'UNAVAILABLE') throw new ServiceUnavailableException(m[2]);
  if (m?.[1] === 'NOT_FOUND') throw new NotFoundException('No such ticket.');
  if (m?.[1] === 'INPUT') throw new BadRequestException(m[2]);
  throw e;
}

@Injectable()
export class SupportBridgeService {
  private readonly logger = new Logger(SupportBridgeService.name);
  private platformId: string | null = null;

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly tickets: TicketsService,
    private readonly requesters: RequesterService,
    private readonly work: WorkService,
    private readonly sessions: SupportSessionsService,
  ) {}

  /** The platform tenant (organizations.is_platform), or null when it is not set up here. */
  async platformOrg(): Promise<string | null> {
    if (this.platformId) return this.platformId;
    const o = await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) => tx.organization.findFirst({ where: { isPlatform: true }, select: { id: true } }));
    this.platformId = o?.id ?? null;
    return this.platformId;
  }

  private platformCtx(org: string, userId: string | null = null): CompanyContext {
    return { organizationId: org, isSuperAdmin: false, userId };
  }

  // ------------------------------------------------------------------------------------------ the customer company's side

  /** POST /desk/support/yukthix/tickets: through sd_support_intake() only. */
  async raise(ctx: TenantContext, dto: SupportRaiseDto) {
    const intakeId = await this.tenantPrisma
      .forTenant(ctx, async (tx) => (await tx.$queryRaw<{ id: string }[]>`SELECT sd_support_intake(${dto.subject}, ${dto.body}, ${dto.severity}::int, NULL::uuid, ${dto.screen ?? null}) AS id`)[0].id)
      .catch(bridgeError);
    const ticket = await this.process(intakeId);
    return { number: ticket?.number ?? null, sending: !ticket };
  }

  async reply(ctx: TenantContext, ticketId: string, dto: SupportReplyDto) {
    const intakeId = await this.tenantPrisma.forTenant(ctx, async (tx) => (await tx.$queryRaw<{ id: string }[]>`SELECT sd_support_intake(NULL, ${dto.body}, 3, ${ticketId}::uuid, NULL) AS id`)[0].id).catch(bridgeError);
    await this.process(intakeId);
    return { sent: true };
  }

  async list(ctx: TenantContext) {
    const rows = await this.tenantPrisma.forTenant(ctx, async (tx) => (await tx.$queryRaw<{ v: SupportTicketRow[] }[]>`SELECT sd_support_my_tickets(NULL) AS v`)[0].v).catch(bridgeError);
    return rows.map((r) => ({ ...r, severityLabel: SEVERITY_LABEL[r.severity] ?? '' }));
  }

  async get(ctx: TenantContext, ticketId: string) {
    const v = await this.tenantPrisma.forTenant(ctx, async (tx) => (await tx.$queryRaw<{ v: unknown }[]>`SELECT sd_support_my_tickets(${ticketId}::uuid) AS v`)[0].v).catch(bridgeError);
    if (!v) throw new NotFoundException('No such ticket.');
    return v;
  }

  // ------------------------------------------------------------------------------------------ the platform desk's processing

  /** Turns one intake row into a ticket (or a reply), in the platform tenant only. Idempotent. */
  async process(intakeId: string): Promise<{ id: string; number: string } | null> {
    const org = await this.platformOrg();
    if (!org) return null;
    const ctx = this.platformCtx(org);
    try {
      return await deskSystem(this.tenantPrisma, ctx, async (tx) => {
        const won = await tx.sdSupportIntake.updateMany({ where: { organizationId: org, id: intakeId, processedAt: null }, data: { processedAt: new Date() } });
        if (!won.count) return null;
        const it = await tx.sdSupportIntake.findUniqueOrThrow({ where: { id: intakeId } });
        const bridge = await tx.sdSupportBridge.findUnique({ where: { organizationId: org } });
        if (!bridge) throw new Error('The YukthiX Support desk is not chosen (sd_support_bridge).');
        const personId = await this.contactFor(tx, org, it.accountId, it.fromEmail, it.fromName ?? '');
        const who = { ctx, userId: null };
        if (it.ticketId) {
          const t = await tx.sdTicket.findFirstOrThrow({ where: { organizationId: org, id: it.ticketId, customerAccountId: it.accountId } });
          const r = await this.requesters.replyIn(tx, who, t, personId, textToHtml(it.bodyText), { channel: 'portal' });
          const result = r.followUp?.id ?? t.id;
          await tx.sdSupportIntake.update({ where: { id: it.id }, data: { resultTicketId: result } });
          return r.followUp ?? { id: t.id, number: t.number };
        }
        const t = await this.tickets.createIn(tx, who, {
          deskId: bridge.deskId,
          subject: it.subject!,
          bodyHtml: textToHtml(it.bodyText),
          requesterPersonId: personId,
          openedByUserId: null,
          channel: 'portal',
          side: 'requester',
          authorPersonId: personId,
          customerAccountId: it.accountId,
          priority: it.severity,
          tags: ['in-app'],
          custom: it.screen ? { screen: it.screen } : {},
        });
        await tx.sdSupportIntake.update({ where: { id: it.id }, data: { resultTicketId: t.id } });
        return { id: t.id, number: t.number };
      });
    } catch (e) {
      this.logger.warn(`Support intake ${intakeId} not processed: ${(e as Error).message}`);
      await deskSystem(this.tenantPrisma, ctx, (tx) => tx.sdSupportIntake.updateMany({ where: { id: intakeId }, data: { processedAt: null, error: (e as Error).message.slice(0, 300) } })).catch(() => undefined);
      return null;
    }
  }

  /** The caller as a contact of exactly the linked account (the function chose the account, never the caller). */
  private async contactFor(tx: Tx, org: string, accountId: string, email: string, name: string): Promise<string> {
    let person = await tx.person.findFirst({ where: { organizationId: org, status: 'active', primaryEmail: email.toLowerCase() }, select: { id: true } });
    if (!person) {
      const [given, ...rest] = (name.trim() || email.split('@')[0]).split(/\s+/);
      person = await tx.person.create({ data: { organizationId: org, givenName: given.slice(0, 100), familyName: rest.join(' ').slice(0, 100) || null, primaryEmail: email.toLowerCase() } });
    }
    if (!(await tx.sdCustomerContact.findFirst({ where: { organizationId: org, accountId, personId: person.id }, select: { id: true } }))) {
      const c = await tx.sdCustomerContact.create({ data: { organizationId: org, accountId, personId: person.id, role: 'technical' } });
      await tx.personRole.create({ data: { organizationId: org, personId: person.id, roleType: 'external_login', sourceTable: 'sd_customer_contacts', sourceId: c.id, startOn: new Date(`${todayIst()}T00:00:00Z`) } });
    }
    return person.id;
  }

  /** Job: anything the immediate processing missed (a restart, a short outage) is picked up within a minute. */
  async sweep(): Promise<number> {
    const org = await this.platformOrg();
    if (!org) return 0;
    const ids = await deskSystem(this.tenantPrisma, this.platformCtx(org), (tx) => tx.sdSupportIntake.findMany({ where: { organizationId: org, processedAt: null }, select: { id: true }, orderBy: { createdAt: 'asc' }, take: 50 }));
    let n = 0;
    for (const { id } of ids) if (await this.process(id)) n++;
    return n;
  }

  // ------------------------------------------------------------------------------------------ the console (YukthiX staff)

  /** The staff member as the platform desk user linked to them. Nobody else works the YukthiX Support desk. */
  async consoleActor(staffUserId: string): Promise<DeskActor> {
    const org = await this.platformOrg();
    if (!org) throw new ServiceUnavailableException('YukthiX support is not set up here.');
    const link = await this.tenantPrisma.forTenant(this.platformCtx(org), (tx) => tx.sdConsoleAgent.findFirst({ where: { organizationId: org, staffUserId } }));
    if (!link) throw new ForbiddenException('You are not a YukthiX Support agent. Ask the support lead to add you.');
    const ctx = this.platformCtx(org, link.userId);
    const seats = await this.tenantPrisma.forTenant(ctx, (tx) => tx.sdDeskMember.findMany({ where: { organizationId: org, userId: link.userId, ...activeOn(todayIst()) }, select: { deskId: true, role: true } }));
    return { ctx, userId: link.userId, keys: CONSOLE_KEYS, roles: new Map(seats.map((s) => [s.deskId, s.role as DeskRole])), accounts: null };
  }

  /**
   * US-B-116 / US-B-118: the queue. Severity first; within the same severity Priority Support before Standard
   * (YX-CONSOLE-04); then the response due time, then the oldest.
   */
  async queue(staffUserId: string, state: 'open' | 'all' = 'open') {
    const a = await this.consoleActor(staffUserId);
    const org = a.ctx.organizationId;
    return this.tenantPrisma.forTenant(a.ctx, async (tx) => {
      const bridge = await tx.sdSupportBridge.findUnique({ where: { organizationId: org } });
      if (!bridge) return [];
      const rows = await tx.sdTicket.findMany({ where: { AND: [await visibleTickets(tx, a), { deskId: bridge.deskId }, ...(state === 'open' ? [{ systemState: { in: ['new', 'open', 'pending', 'on_hold'] } }] : [])] }, take: 500, orderBy: { createdAt: 'asc' } });
      const accounts = new Map((await tx.sdCustomerAccount.findMany({ where: { organizationId: org, id: { in: rows.map((r) => r.customerAccountId).filter((x): x is string => Boolean(x)) } }, select: { id: true, name: true } })).map((x) => [x.id, x.name]));
      const due = new Map((await tx.sdSlaTimer.findMany({ where: { organizationId: org, ticketId: { in: rows.map((r) => r.id) }, kind: 'sla', metric: { in: ['first_response', 'next_response'] }, state: 'running' }, orderBy: { dueAt: 'asc' } })).map((x) => [x.ticketId, x]));
      const statuses = new Map((await tx.sdStatus.findMany({ where: { organizationId: org, deskId: bridge.deskId } })).map((s) => [s.id, s.label]));
      const users = await this.tickets.userNames(tx, org, rows.map((r) => r.assigneeUserId));
      const tierRank = (t: string | null) => (t === 'priority' ? 0 : 1);
      return rows
        .map((t) => ({
          id: t.id,
          number: t.number,
          subject: t.subject,
          company: t.customerAccountId ? (accounts.get(t.customerAccountId) ?? '') : null,
          tier: t.planTier ?? 'standard',
          severity: t.priority,
          status: statuses.get(t.statusId) ?? '',
          state: t.systemState,
          assignee: t.assigneeUserId ? (users.get(t.assigneeUserId) ?? null) : null,
          mine: t.assigneeUserId === a.userId,
          senderVerified: t.senderVerified,
          dueAt: due.get(t.id)?.dueAt ?? null,
          breached: Boolean(due.get(t.id)?.breachedAt),
          createdAt: t.createdAt,
        }))
        .sort((x, y) => x.severity - y.severity || tierRank(x.tier) - tierRank(y.tier) || (x.dueAt?.getTime() ?? Infinity) - (y.dueAt?.getTime() ?? Infinity) || x.createdAt.getTime() - y.createdAt.getTime());
    });
  }

  /** One ticket in the console: the conversation (with internal notes), the tenant panel and the support session state. */
  async ticket(staffUserId: string, id: string) {
    const a = await this.consoleActor(staffUserId);
    const full = (await this.tickets.get(a, id)) as Record<string, unknown> & { customerAccountId?: string | null; number: string };
    const t = await this.tenantPrisma.forTenant(a.ctx, (tx) => tx.sdTicket.findFirstOrThrow({ where: { organizationId: a.ctx.organizationId, id } }));
    const tenant = t.customerAccountId ? await this.tenantPanel(a, staffUserId, t.customerAccountId) : null;
    const accounts = t.customerAccountId ? [] : await this.tenantPrisma.forTenant(a.ctx, (tx) => tx.sdCustomerAccount.findMany({ where: { organizationId: a.ctx.organizationId, status: 'active' }, select: { id: true, name: true }, orderBy: { name: 'asc' }, take: 500 }));
    const session = tenant?.tenantId ? await this.sessionFor(staffUserId, tenant.tenantId, t.number) : null;
    return { ticket: full, severityLabel: SEVERITY_LABEL[t.priority] ?? '', tier: t.planTier ?? 'standard', tenant, session, linkable: accounts };
  }

  /** YX-CONSOLE-01: account facts only. Read across tenants through the audited platformRead (purpose recorded). */
  private async tenantPanel(a: DeskActor, staffUserId: string, accountId: string) {
    const org = a.ctx.organizationId;
    const acc = await this.tenantPrisma.forTenant(a.ctx, async (tx) => {
      const x = await tx.sdCustomerAccount.findFirst({ where: { organizationId: org, id: accountId } });
      const plan = x ? await planFor(tx, org, x.id) : null;
      const open = await tx.sdTicket.count({ where: { organizationId: org, customerAccountId: accountId, systemState: { in: ['new', 'open', 'pending', 'on_hold'] } } });
      const ratings = await tx.sdRating.findMany({ where: { organizationId: org, ticketId: { in: (await tx.sdTicket.findMany({ where: { organizationId: org, customerAccountId: accountId }, select: { id: true } })).map((r) => r.id) } }, select: { score: true } });
      const nps = await tx.sdSurveyResponse.findMany({ where: { organizationId: org, accountId }, select: { score: true }, orderBy: { createdAt: 'desc' }, take: 20 });
      return x ? { name: x.name, tenantId: x.linkedTenantId, plan: plan ? { name: plan.plan, tier: plan.tier } : null, open, csat: ratings.length ? Math.round((ratings.reduce((s, r) => s + r.score, 0) / ratings.length) * 10) / 10 : null, nps: nps.length ? Math.round(((nps.filter((n) => n.score >= 9).length - nps.filter((n) => n.score <= 6).length) / nps.length) * 100) : null } : null;
    });
    if (!acc) return null;
    const company = acc.tenantId
      ? await platformRead(this.tenantPrisma, staffUserId, 'support.tenant_panel', async (tx) => {
          const o = await tx.organization.findUnique({ where: { id: acc.tenantId! }, select: { name: true, slug: true, lifecycle: true, billingStatus: true, trialEndsAt: true, createdAt: true } });
          const products = await tx.organizationProduct.findMany({ where: { organizationId: acc.tenantId! }, select: { productCode: true } });
          const lastSignIn = await tx.user.findFirst({ where: { organizationId: acc.tenantId!, role: 'org_admin', lastLoginAt: { not: null } }, orderBy: { lastLoginAt: 'desc' }, select: { lastLoginAt: true } });
          return o ? { ...o, products: products.map((p) => p.productCode), adminLastSignIn: lastSignIn?.lastLoginAt ?? null } : null;
        })
      : null;
    // A simple health score from account signals only (P14 YX-CONSOLE-05 fills it from the tenant-health feed later).
    const factors: string[] = [];
    let health = 80;
    if (company?.lifecycle === 'suspended' || company?.billingStatus !== 'active') (health -= 30), factors.push('Billing or account is not in good standing');
    if (company?.lifecycle === 'trial') factors.push('In trial');
    const idle = company?.adminLastSignIn ? (Date.now() - new Date(company.adminLastSignIn).getTime()) / 86_400_000 : 99;
    if (idle > 30) (health -= 20), factors.push('No admin sign-in for 30 days');
    if (acc.open > 3) (health -= 10), factors.push(`${acc.open} open tickets`);
    if (acc.csat !== null && acc.csat < 3.5) (health -= 15), factors.push('Low ratings');
    if (acc.nps !== null && acc.nps < 0) (health -= 15), factors.push('More detractors than promoters');
    return { ...acc, company, health: Math.max(0, Math.min(100, health)), healthFactors: factors };
  }

  private async sessionFor(staffUserId: string, tenantId: string, ticketNumber: string) {
    const rows = await this.sessions.listForStaff(staffUserId, tenantId);
    const s = rows.find((r) => r.ticket === ticketNumber);
    return s ? { id: s.id, status: s.status, hours: s.hours, startsAt: s.startsAt, endsAt: s.endsAt, mine: s.mine, requestedBy: s.requestedBy, decidedBy: s.decidedBy, decisionNote: s.decisionNote } : null;
  }

  async post(staffUserId: string, id: string, dto: ConsoleMessageDto) {
    const a = await this.consoleActor(staffUserId);
    return this.tickets.post(a, id, { kind: dto.kind, bodyHtml: dto.bodyHtml } as never);
  }

  async assignToMe(staffUserId: string, id: string) {
    const a = await this.consoleActor(staffUserId);
    return this.tickets.assign(a, id, { userId: a.userId } as never);
  }

  async resolve(staffUserId: string, id: string, version: number, note?: string) {
    const a = await this.consoleActor(staffUserId);
    return this.work.resolve(a, id, { version, resolutionNote: note } as never);
  }

  /** US-B-120: an email from an unknown address is linked by an agent to the right company (only while it has none). */
  async link(staffUserId: string, id: string, dto: ConsoleLinkDto) {
    const a = await this.consoleActor(staffUserId);
    const org = a.ctx.organizationId;
    return this.tenantPrisma.forTenant(a.ctx, async (tx) => {
      const { t } = await this.tickets.load(tx, a, id);
      if (t.customerAccountId) throw new ConflictException('This ticket already belongs to a company.');
      const acc = await tx.sdCustomerAccount.findFirst({ where: { organizationId: org, id: dto.accountId, status: 'active' } });
      if (!acc) throw new BadRequestException('Choose an active company.');
      const plan = await planFor(tx, org, acc.id);
      await tx.sdTicket.update({ where: { id: t.id }, data: { customerAccountId: acc.id, planTier: plan?.tier ?? null, version: { increment: 1 } } });
      await this.tickets.event(tx, t, 'account_linked', null, acc.name, { by: a.userId, reason: 'Linked to the company by an agent' });
      await audit(tx, a, 'desk.ticket.account_linked', 'sd_ticket', t.id, { accountId: acc.id });
      await this.tickets.sla.sync(tx, t.id);
      return { linked: true };
    });
  }

  /** US-B-119: "Request access" asks the company for a P02 support session, with the ticket as the reason. */
  async requestAccess(staffUserId: string, id: string, dto: SupportAccessDto) {
    const a = await this.consoleActor(staffUserId);
    const t = await this.tenantPrisma.forTenant(a.ctx, async (tx) => (await this.tickets.load(tx, a, id)).t);
    const tenantId = t.customerAccountId ? (await this.tenantPrisma.forTenant(a.ctx, (tx) => tx.sdCustomerAccount.findFirst({ where: { organizationId: a.ctx.organizationId, id: t.customerAccountId! }, select: { linkedTenantId: true } })))?.linkedTenantId : null;
    if (!tenantId) throw new BadRequestException('This ticket is not linked to a YukthiX company.');
    const s = await this.sessions.request(staffUserId, tenantId, { reason: `${t.number}: ${dto.reason}`.slice(0, 500), ticket: t.number, hours: dto.hours });
    await this.tenantPrisma.forTenant(a.ctx, async (tx) => {
      await this.tickets.event(tx, t, 'access_requested', null, `${dto.hours} hours`, { by: a.userId, reason: 'Support session asked from the ticket' });
      await audit(tx, a, 'desk.ticket.access_requested', 'sd_ticket', t.id, { supportSessionId: s.id, hours: dto.hours });
    });
    return { id: s.id, status: s.status };
  }
}
