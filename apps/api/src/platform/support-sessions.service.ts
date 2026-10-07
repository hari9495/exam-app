import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService, TenantContext, TenantPrismaService, isOrganizationActive } from '@exam-platform/shared';
import { SessionsService } from '../auth/sessions.service';
import { appUrl, button, details, text } from '../email/account-emails';
import { PLATFORM, platformRead, staffActor } from './platform.service';
import { REQUEST_LAPSES_HOURS } from './support-session-access';
import { SupportApproveDto, SupportRequestDto } from './dto';

// P02 Q8 / YX-SEC-20 support sessions. Staff ask in the console (reason, ticket, hours ≤ 72); a System Admin of the
// company approves (the window starts then, never longer than asked), declines, or ends it early; staff may cancel a
// request or end their own session. Every step is in the company's audit log under entity support_session, so the
// company sees the request, the decision and everything done in the session (P08).

type Tx = Prisma.TransactionClient;
const HOUR = 3_600_000;

export interface SupportSessionView {
  id: string;
  organizationId: string;
  company?: string;
  requestedBy: string;
  requestedByEmail: string;
  mine?: boolean;
  reason: string;
  ticket: string | null;
  hours: number;
  status: string;
  decidedBy: string | null;
  decidedAt: Date | null;
  decisionNote: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
  endedBy: string | null;
  endedAt: Date | null;
  createdAt: Date;
}

type Row = Prisma.SupportSessionGetPayload<object>;
const view = (r: Row): SupportSessionView => ({
  id: r.id,
  organizationId: r.organizationId,
  requestedBy: r.requestedByName,
  requestedByEmail: r.requestedByEmail,
  reason: r.reason,
  ticket: r.ticket,
  hours: r.hours,
  status: r.status,
  decidedBy: r.decidedByName,
  decidedAt: r.decidedAt,
  decisionNote: r.decisionNote,
  startsAt: r.startsAt,
  endsAt: r.endsAt,
  endedBy: r.endedByName,
  endedAt: r.endedAt,
  createdAt: r.createdAt,
});

/** Sessions past their window, and requests nobody answered in time, are closed for good. */
function expireStale(tx: Tx, organizationId: string | null) {
  const now = new Date();
  return tx.supportSession.updateMany({
    where: { ...(organizationId ? { organizationId } : {}), OR: [{ status: 'approved', endsAt: { lte: now } }, { status: 'requested', createdAt: { lte: new Date(now.getTime() - REQUEST_LAPSES_HOURS * HOUR) } }] },
    data: { status: 'expired' },
  });
}

@Injectable()
export class SupportSessionsService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly sessions: SessionsService,
  ) {}

  // ---- YukthiX staff (platform console) ----

  async request(actorUserId: string, organizationId: string, dto: SupportRequestDto): Promise<SupportSessionView> {
    const org = await this.tenantPrisma.forTenant(PLATFORM, (tx) => tx.organization.findUnique({ where: { id: organizationId }, select: { name: true, status: true } }));
    if (!org) throw new NotFoundException('Company not found');
    // Its System Admins must be able to sign in to approve.
    if (!isOrganizationActive(org.status)) throw new ConflictException('This company is suspended or closed, so nobody there can approve a support session.');
    const actor = await staffActor(this.tenantPrisma, actorUserId);
    const ctx: TenantContext = { organizationId, isSuperAdmin: false };
    const row = await this.tenantPrisma
      .forTenant(ctx, async (tx) => {
        await expireStale(tx, organizationId);
        const created = await tx.supportSession.create({
          data: { organizationId, requestedBy: actorUserId, requestedByName: actor.label.slice(0, 200), requestedByEmail: actor.email ?? '', reason: dto.reason.trim(), ticket: dto.ticket ?? null, hours: dto.hours },
        });
        await AuditService.recordIn(tx, ctx, { actorUserId, actor, action: 'support_session.requested', entityType: 'support_session', entityId: created.id, metadata: { reason: dto.reason.trim(), ticket: dto.ticket ?? null, hours: dto.hours } });
        return created;
      })
      .catch((e: unknown) => {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('You already have an open request or session for this company.');
        throw e;
      });
    this.sessions.notifyAdmins(organizationId, 'YukthiX support asks to see your company data', 'A support session needs your approval', [
      text(`${actor.label} from YukthiX support asks to look at ${org.name} for up to ${dto.hours} hours. Nothing is visible until a System Admin approves.`),
      details([['Reason', dto.reason.trim()], ...(dto.ticket ? ([['Ticket', dto.ticket]] as [string, string][]) : [])]),
      text('Pay, identity and bank details stay hidden. The session is read-only and everything done is listed for you. The request lapses in 24 hours if nobody answers.'),
      button('Review the request', appUrl('/yx/settings/support-access')),
    ]);
    return view(row);
  }

  /** Every company's sessions (or one company's), newest first. */
  async listForStaff(actorUserId: string, organizationId?: string): Promise<SupportSessionView[]> {
    return platformRead(this.tenantPrisma, actorUserId, 'support_sessions.list', async (tx) => {
      await expireStale(tx, null);
      const rows = await tx.supportSession.findMany({ where: organizationId ? { organizationId } : {}, orderBy: { createdAt: 'desc' }, take: 200 });
      const names = await tx.organization.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.organizationId))] } }, select: { id: true, name: true } });
      return rows.map((r) => ({ ...view(r), company: names.find((n) => n.id === r.organizationId)?.name ?? 'Unknown company', mine: r.requestedBy === actorUserId }));
    });
  }

  /** Staff withdraw their own unanswered request, or end their own session early. */
  async closeByStaff(actorUserId: string, id: string, how: 'cancel' | 'end'): Promise<SupportSessionView> {
    const found = await this.tenantPrisma.forTenant(PLATFORM, (tx) => tx.supportSession.findFirst({ where: { id, requestedBy: actorUserId }, select: { organizationId: true } }));
    if (!found) throw new NotFoundException('Support session not found');
    const actor = await staffActor(this.tenantPrisma, actorUserId);
    const ctx: TenantContext = { organizationId: found.organizationId, isSuperAdmin: false };
    return this.tenantPrisma.forTenant(ctx, async (tx) => {
      await expireStale(tx, found.organizationId);
      const from = how === 'cancel' ? 'requested' : 'approved';
      const now = new Date();
      const data = how === 'cancel' ? { status: 'cancelled' } : { status: 'ended', endedBy: actorUserId, endedByName: actor.label.slice(0, 200), endedAt: now };
      const { count } = await tx.supportSession.updateMany({ where: { id, requestedBy: actorUserId, status: from }, data });
      if (!count) throw new ConflictException(how === 'cancel' ? 'Only a request still waiting for the company can be withdrawn.' : 'This session is not running.');
      await AuditService.recordIn(tx, ctx, { actorUserId, actor, action: how === 'cancel' ? 'support_session.cancelled' : 'support_session.ended', entityType: 'support_session', entityId: id, metadata: { by: 'yukthix' } });
      return view(await tx.supportSession.findUniqueOrThrow({ where: { id } }));
    });
  }

  // ---- the company (Settings › Support access, PLT-17) ----

  async listForCompany(ctx: TenantContext): Promise<SupportSessionView[]> {
    const c = company(ctx);
    return this.tenantPrisma.forTenant(c, async (tx) => {
      await expireStale(tx, c.organizationId);
      return (await tx.supportSession.findMany({ where: { organizationId: c.organizationId }, orderBy: { createdAt: 'desc' }, take: 200 })).map(view);
    });
  }

  /** The window starts now and is never longer than asked (Q8: default 24 h, at most 72 h). */
  async approve(ctx: TenantContext, actorUserId: string, id: string, dto: SupportApproveDto): Promise<SupportSessionView> {
    return this.decide(ctx, actorUserId, id, 'requested', async (tx, row, name) => {
      const hours = Math.min(dto.hours ?? row.hours, row.hours);
      const now = new Date();
      return {
        data: { status: 'approved', decidedBy: actorUserId, decidedByName: name, decidedAt: now, decisionNote: dto.note || null, startsAt: now, endsAt: new Date(now.getTime() + hours * HOUR) },
        action: 'support_session.approved',
        metadata: { hours, note: dto.note || null },
      };
    });
  }

  async decline(ctx: TenantContext, actorUserId: string, id: string, note?: string): Promise<SupportSessionView> {
    return this.decide(ctx, actorUserId, id, 'requested', async (_tx, _row, name) => ({
      data: { status: 'declined', decidedBy: actorUserId, decidedByName: name, decidedAt: new Date(), decisionNote: note || null },
      action: 'support_session.declined',
      metadata: { note: note || null },
    }));
  }

  /** Ending takes effect on the staff member's very next request (JwtStrategy re-checks the session). */
  async endByCompany(ctx: TenantContext, actorUserId: string, id: string, note?: string): Promise<SupportSessionView> {
    return this.decide(ctx, actorUserId, id, 'approved', async (_tx, _row, name) => ({
      data: { status: 'ended', endedBy: actorUserId, endedByName: name, endedAt: new Date() },
      action: 'support_session.ended',
      metadata: { by: 'company', note: note || null },
    }));
  }

  private decide(
    ctx: TenantContext,
    actorUserId: string,
    id: string,
    from: 'requested' | 'approved',
    change: (tx: Tx, row: Row, actorName: string) => Promise<{ data: Prisma.SupportSessionUpdateManyMutationInput; action: string; metadata: Record<string, unknown> }>,
  ): Promise<SupportSessionView> {
    const c = company(ctx);
    return this.tenantPrisma.forTenant(c, async (tx) => {
      await expireStale(tx, c.organizationId);
      const row = await tx.supportSession.findFirst({ where: { id, organizationId: c.organizationId } });
      if (!row) throw new NotFoundException('Support request not found');
      const me = await tx.user.findFirst({ where: { id: actorUserId, organizationId: c.organizationId }, select: { name: true, email: true } });
      if (!me) throw new NotFoundException('Support request not found');
      const { data, action, metadata } = await change(tx, row, (me.name?.trim() || me.email).slice(0, 200));
      const { count } = await tx.supportSession.updateMany({ where: { id, organizationId: c.organizationId, status: from }, data });
      if (!count) throw new ConflictException(from === 'requested' ? `This request is already ${row.status}.` : 'This session is not running.');
      await AuditService.recordIn(tx, c, { actorUserId, action, entityType: 'support_session', entityId: id, metadata });
      return view(await tx.supportSession.findUniqueOrThrow({ where: { id } }));
    });
  }

  /** Everything recorded about one session: request, decision, each page opened, leaving, end. */
  async activity(ctx: TenantContext, id: string) {
    const c = company(ctx);
    return this.tenantPrisma.forTenant(c, async (tx) => {
      if (!(await tx.supportSession.findFirst({ where: { id, organizationId: c.organizationId }, select: { id: true } }))) throw new NotFoundException('Support request not found');
      const rows = await tx.auditLog.findMany({
        where: { organizationId: c.organizationId, entityType: 'support_session', entityId: id },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: 1000,
        select: { id: true, action: true, actorName: true, actorEmail: true, actorRole: true, metadataJson: true, createdAt: true },
      });
      return rows.map((r) => {
        const meta = r.metadataJson ? (JSON.parse(r.metadataJson) as Record<string, unknown>) : {};
        return { id: r.id, at: r.createdAt, action: r.action, by: r.actorName || r.actorEmail || 'YukthiX', byYukthix: r.actorRole === 'super_admin', method: typeof meta.method === 'string' ? meta.method : null, path: typeof meta.path === 'string' ? meta.path : null };
      });
    });
  }
}

/** The caller's own company, without the RLS bypass. */
function company(ctx: TenantContext): TenantContext & { organizationId: string } {
  if (!ctx.organizationId) throw new NotFoundException('Sign in to a company');
  return { organizationId: ctx.organizationId, isSuperAdmin: false, userId: ctx.userId ?? null, role: ctx.role ?? null };
}
