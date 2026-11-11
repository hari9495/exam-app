import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { audit, CompanyContext, inCompany, Tx } from '../org-structure/org-structure.service';
import { isoDate, todayIst } from '../org-structure/org-validation';
import { NotificationsService } from '../notifications/notifications.service';
import { ApprovalsEngine, InboxItem } from '../workflow/approvals-engine.service';
import { settingFor } from '../people/probation';
import { AccessService } from './access.service';
import { AccessRequestApproveDto, AccessRequestAskDto } from './dto';

// Answer 946 (11 Nov 2026): on any "You don't have access" page a person asks for access with a reason and how long
// (up to access.request.max_days; access.request.allowed turns it off). Whoever can grant access (access.role.manage,
// the System Admins) approves it with a role grant, through every rule of Give access: a Confidential role waits for
// a second admin who neither granted nor receives it, a grant over many people asks for the risk confirmation. The
// grant always has a last day within the company's longest access, so it ends by itself. Nobody decides their own
// request. Everything is audited; the person is told either way. Payroll's own request (pay access) stays as it is.

const KEY = 'access.role.manage';
type Row = Prisma.AccessRequestGetPayload<object>;

const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;

@Injectable()
export class AccessRequestsService implements OnModuleInit {
  private readonly logger = new Logger(AccessRequestsService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly access: AccessService,
    private readonly notifications: NotificationsService,
    private readonly engine?: ApprovalsEngine,
  ) {}

  onModuleInit() {
    this.engine?.registerInboxSource((tx, c, userId) => this.waitingFor(tx, c, userId));
  }

  private async rules(tx: Tx, c: CompanyContext) {
    return {
      allowed: (await settingFor(tx, c, 'access.request.allowed', { legalEntityId: '' })) === 'on',
      maxDays: Number(await settingFor(tx, c, 'access.request.max_days', { legalEntityId: '' })),
    };
  }

  /** The company's rules and the person's latest request from this page (the no-access state shows it). */
  mine(ctx: TenantContext, userId: string, page: string) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const row = await tx.accessRequest.findFirst({ where: { organizationId: c.organizationId, requestedBy: userId, page }, orderBy: { createdAt: 'desc' } });
      return { ...(await this.rules(tx, c)), sent: row ? (await this.views(tx, c, [row]))[0] : null };
    });
  }

  async ask(ctx: TenantContext, userId: string, dto: AccessRequestAskDto) {
    const out = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const { allowed, maxDays } = await this.rules(tx, c);
      if (!allowed) throw new ForbiddenException('Your company does not take access requests. Ask your System Admin.');
      if (dto.days > maxDays) throw new BadRequestException(`Ask for ${maxDays} days or fewer.`);
      const page = dto.page.split('?')[0]!;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`access-request:${c.organizationId}:${userId}:${page}`}))`;
      if (await tx.accessRequest.findFirst({ where: { organizationId: c.organizationId, requestedBy: userId, page, status: 'pending' }, select: { id: true } })) {
        throw new ConflictException('You already asked for access to this page. A System Admin will decide it.');
      }
      const row = await tx.accessRequest.create({ data: { organizationId: c.organizationId, requestedBy: userId, page, what: dto.what.trim(), reason: dto.reason.trim(), days: dto.days } });
      await audit(tx, c, 'access.request.sent', 'access_request', row.id, { page, what: row.what, days: row.days });
      return { row, view: (await this.views(tx, c, [row]))[0], to: (await this.granters(tx, c)).filter((id) => id !== userId) };
    });
    await this.tell(ctx, userId, out.to, 'access.request.waiting', out.row.id, `${out.view.user.name} asks for access to ${out.row.what} for ${out.row.days} ${out.row.days === 1 ? 'day' : 'days'}`);
    return out.view;
  }

  /** Every request, newest first, for the people who decide them. */
  list(ctx: TenantContext) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const rows = await tx.accessRequest.findMany({ where: { organizationId: c.organizationId }, orderBy: { createdAt: 'desc' }, take: 200 });
      return { ...(await this.rules(tx, c)), rows: await this.views(tx, c, rows) };
    });
  }

  private async pending(tx: Tx, c: CompanyContext, actor: string, id: string) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`access-request:${c.organizationId}:${id}`}))`;
    const r = await tx.accessRequest.findFirst({ where: { organizationId: c.organizationId, id } });
    if (!r) throw new NotFoundException('Request not found');
    if (r.status !== 'pending') throw new ConflictException(`This request is already ${r.status}.`);
    if (r.requestedBy === actor) throw new ForbiddenException('You asked for this, so another System Admin decides it.');
    return r;
  }

  /** Approve: a role grant for the person who asked, with every rule of Give access, ending within the longest access. */
  async approve(ctx: TenantContext, actor: string, id: string, dto: AccessRequestApproveDto) {
    const out = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const r = await this.pending(tx, c, actor, id);
      const { maxDays } = await this.rules(tx, c);
      const from = dto.validFrom ?? todayIst();
      if (!dto.validTo) throw new BadRequestException('Choose the last day: access from a request always ends.');
      if (dto.validTo >= from && daysBetween(from, dto.validTo) > maxDays) throw new BadRequestException(`Access from a request lasts at most ${maxDays} days.`);
      const granted = await this.access.grantIn(tx, c, actor, { ...dto, userId: r.requestedBy, validFrom: from });
      const row = await tx.accessRequest.update({ where: { id }, data: { status: 'approved', decidedBy: actor, decidedAt: new Date(), grantId: granted.view.id, decisionNote: null } });
      await audit(tx, c, 'access.request.approved', 'access_request', id, { grantId: granted.view.id, role: granted.view.role.name, scopeType: dto.scopeType, validFrom: from, validTo: dto.validTo, waitsForSecondAdmin: granted.pending });
      return { row, granted, view: (await this.views(tx, c, [row]))[0] };
    });
    await this.access.tellAdmins(ctx, actor, out.granted);
    const until = out.view.validTo ? ` until ${out.view.validTo}` : '';
    await this.tell(ctx, actor, [out.row.requestedBy], 'access.request.decided', id, out.granted.pending ? `Your access to ${out.row.what} was approved; it opens once a second System Admin approves the role.` : `You now have access to ${out.row.what}${until}.`);
    return out.view;
  }

  async refuse(ctx: TenantContext, actor: string, id: string, reason: string) {
    const why = reason.trim();
    if (!why) throw new BadRequestException('Say why you refuse it.');
    const view = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await this.pending(tx, c, actor, id);
      const row = await tx.accessRequest.update({ where: { id }, data: { status: 'refused', decidedBy: actor, decidedAt: new Date(), decisionNote: why } });
      await audit(tx, c, 'access.request.refused', 'access_request', id, { reason: why });
      return (await this.views(tx, c, [row]))[0];
    });
    await this.tell(ctx, actor, [view.user.id], 'access.request.decided', id, `Your request for access to ${view.what} was refused: ${why}`);
    return view;
  }

  /**
   * Who can grant access: active System Admins, and anyone whose role or in-date grant holds access.role.manage (a
   * company-wide key). shortcut: reads the role JSON with LIKE, as holdersOf does; index it if a company has thousands of roles.
   */
  private async granters(tx: Tx, c: CompanyContext): Promise<string[]> {
    const today = todayIst();
    const like = `%"${KEY}"%`;
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT u.id::text FROM users u WHERE u.organization_id = ${c.organizationId}::uuid AND u.status = 'active' AND u.role = 'org_admin'
      UNION
      SELECT u.id::text FROM users u JOIN permission_profiles p ON p.organization_id = u.organization_id AND p.id = u.permission_profile_id
      WHERE u.organization_id = ${c.organizationId}::uuid AND u.status = 'active' AND p.permissions_json LIKE ${like}
      UNION
      SELECT g.user_id::text FROM role_grants g
      JOIN permission_profiles p ON p.organization_id = g.organization_id AND p.id = g.permission_profile_id
      JOIN users u ON u.organization_id = g.organization_id AND u.id = g.user_id AND u.status = 'active'
      WHERE g.organization_id = ${c.organizationId}::uuid AND g.status = 'active' AND p.permissions_json LIKE ${like}
        AND g.valid_from <= ${today}::date AND (g.valid_to IS NULL OR g.valid_to >= ${today}::date)`;
    return rows.map((r) => r.id);
  }

  /** Waiting requests join the Approvals inbox of everyone who can grant access, except the person who asked. */
  async waitingFor(tx: Tx, c: CompanyContext, userId: string): Promise<InboxItem[]> {
    const rows = await tx.accessRequest.findMany({ where: { organizationId: c.organizationId, status: 'pending', requestedBy: { not: userId } }, orderBy: { createdAt: 'asc' }, take: 100 });
    if (!rows.length) return [];
    const granters = await this.granters(tx, c);
    if (!granters.includes(userId)) return [];
    const views = await this.views(tx, c, rows);
    return rows.map((r, i) => ({
      taskId: r.id,
      requestId: r.id,
      type: 'Access request',
      title: `${views[i]!.user.name}: access to ${r.what}`,
      summary: [
        { label: 'For', value: `${r.days} ${r.days === 1 ? 'day' : 'days'}` },
        { label: 'Reason', value: r.reason },
      ],
      requester: views[i]!.user.name,
      raisedBy: null,
      onBehalfOf: null,
      person: views[i]!.user.name,
      step: { index: 1, of: 1, name: 'System Admin', need: 1, approvers: granters.filter((g) => g !== r.requestedBy).length },
      dueAt: null,
      submittedAt: r.createdAt,
      decideAt: '/yx/settings/access?view=requests',
    }));
  }

  private async tell(ctx: TenantContext, actor: string, to: string[], type: string, id: string, text: string) {
    if (!to.length) return;
    await this.notifications.notify(ctx, actor, to, type, { entityType: 'access_request', entityId: id, contextText: text, linkPath: type === 'access.request.waiting' ? '/yx/settings/access?view=requests' : '/yx/notifications' }).catch((e: unknown) => this.logger.error(e));
  }

  private async views(tx: Tx, c: CompanyContext, rows: Row[]) {
    if (!rows.length) return [];
    const today = todayIst();
    const userIds = [...new Set(rows.flatMap((r) => [r.requestedBy, r.decidedBy]).filter((x): x is string => Boolean(x)))];
    const grantIds = rows.map((r) => r.grantId).filter((x): x is string => Boolean(x));
    const [users, grants] = await Promise.all([
      tx.user.findMany({ where: { organizationId: c.organizationId, id: { in: userIds } }, select: { id: true, name: true, email: true } }),
      grantIds.length ? tx.roleGrant.findMany({ where: { organizationId: c.organizationId, id: { in: grantIds } }, select: { id: true, status: true, validTo: true } }) : [],
    ]);
    const who = (id: string | null) => {
      const u = users.find((x) => x.id === id);
      return u ? u.name?.trim() || u.email : null;
    };
    return rows.map((r) => {
      const g = grants.find((x) => x.id === r.grantId);
      const validTo = g?.validTo ? isoDate(g.validTo) : null;
      // The grant decides: waiting for a second admin, open until its last day, or over (ended, revoked or rejected).
      const state = r.status === 'pending' ? 'waiting' : r.status === 'refused' ? 'refused' : g?.status === 'pending' ? 'approval' : g?.status === 'active' && (!validTo || validTo >= today) ? 'open' : 'ended';
      return {
        id: r.id,
        user: { id: r.requestedBy, name: who(r.requestedBy) ?? 'A former user' },
        page: r.page,
        what: r.what,
        reason: r.reason,
        days: r.days,
        askedAt: r.createdAt.toISOString(),
        state: state as 'waiting' | 'approval' | 'open' | 'refused' | 'ended',
        validTo,
        decidedBy: who(r.decidedBy),
        decisionNote: r.decisionNote,
      };
    });
  }
}
