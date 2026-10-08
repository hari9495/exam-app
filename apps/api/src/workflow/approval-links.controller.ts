import { Body, ConflictException, Controller, Delete, ForbiddenException, Get, GoneException, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Prisma } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Request } from 'express';
import { AuditService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { CompanyContext } from '../org-structure/org-structure.service';
import { MODERATE_UPLOAD_THROTTLE, PUBLIC_API_THROTTLE } from '../rate-limit-tiers';
import { ApprovalsEngine } from './approvals-engine.service';
import { ApprovalCards, FakeChannelTransport, Provider } from './approval-channels';

// SD-2.06: the page behind an approval card's link (single-use action token) and a person's own linked chat apps and
// phones. See approval-channels.ts for the cards and the token rules.

export class LinkDecideDto {
  @IsIn(['approve', 'reject'])
  decision!: 'approve' | 'reject';

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

export class ChannelLinkDto {
  @IsIn(['teams', 'slack', 'push'])
  provider!: Provider;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  externalRef!: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(100)
  label?: string;
}

/**
 * The page behind a card's link. No sign-in: the token is the only key, bound to one task and one person, short-lived,
 * single use, refused when the task moved on, the person is no longer active, or the request is sensitive or high risk.
 */
@Controller('workflow/act')
export class ActionLinkController {
  constructor(
    private readonly cards: ApprovalCards,
    private readonly engine: ApprovalsEngine,
    private readonly tenantPrisma: TenantPrismaService,
  ) {}

  private async load(token: string) {
    const c = this.cards.verify(token);
    const ctx: CompanyContext = { organizationId: c.o, isSuperAdmin: false, userId: c.u };
    return this.tenantPrisma.forTenant(ctx, async (tx) => {
      const row = await tx.wfActionToken.findFirst({ where: { organizationId: c.o, id: c.k } });
      if (!row || row.userId !== c.u) throw new NotFoundException('This link is not valid. Open your approvals in YukthiX.');
      if (row.usedAt) throw new GoneException({ statusCode: 410, code: 'LINK_USED', message: 'This link was already used. Open your approvals in YukthiX.' });
      if (row.expiresAt <= new Date()) throw new GoneException({ statusCode: 410, code: 'LINK_EXPIRED', message: 'This link has expired. Open your approvals in YukthiX.' });
      const user = await tx.user.findFirst({ where: { organizationId: c.o, id: c.u, status: 'active' }, select: { id: true } });
      const task = await tx.wfTask.findFirst({ where: { organizationId: c.o, id: row.taskId } });
      const req = task && (await tx.wfRequest.findFirst({ where: { organizationId: c.o, id: task.requestId } }));
      if (!user || !task || !req || task.assigneeUserId !== c.u) throw new NotFoundException('This link is not valid. Open your approvals in YukthiX.');
      const open = task.status === 'open' && req.status === 'pending' && task.step === req.currentStep;
      await tx.$executeRaw`SELECT set_config('app.sd_system', 'on', true)`;
      const neutral = req.risk === 'high' || (await this.engine.previewOf(tx, req)) !== 'full';
      return { ctx, row, task, req, open, neutral };
    });
  }

  @Get(':token')
  @Throttle(PUBLIC_API_THROTTLE)
  async view(@Param('token') token: string) {
    const x = await this.load(token);
    if (x.neutral) return { state: 'sign_in', title: 'An approval is waiting for you', summary: [], expiresAt: x.row.expiresAt };
    return { state: x.open ? 'open' : 'closed', title: x.req.title, summary: x.req.summary, expiresAt: x.row.expiresAt };
  }

  @Post(':token')
  @HttpCode(200)
  @Throttle(MODERATE_UPLOAD_THROTTLE)
  async decide(@Param('token') token: string, @Body() dto: LinkDecideDto) {
    const x = await this.load(token);
    if (x.neutral) throw new ForbiddenException({ statusCode: 403, code: 'SIGN_IN_TO_DECIDE', message: 'Sign in to YukthiX to decide this one.' });
    if (!x.open) throw new ConflictException('This approval is already closed.');
    if (dto.decision === 'reject' && !dto.reason?.trim()) throw new ConflictException({ statusCode: 409, code: 'REASON_REQUIRED', message: 'Say why you are not approving it.' });
    // Single use: the first request to mark it wins; any other gets "already used", even at the same moment.
    const won = await this.tenantPrisma.forTenant(x.ctx, async (tx) => {
      const res = await tx.wfActionToken.updateMany({ where: { organizationId: x.ctx.organizationId, id: x.row.id, usedAt: null, expiresAt: { gt: new Date() } }, data: { usedAt: new Date() } });
      if (res.count) await AuditService.recordIn(tx, x.ctx, { actorUserId: x.row.userId, action: 'workflow.action_link.used', entityType: 'wf_request', entityId: x.req.id, metadata: { taskId: x.task.id, channel: x.row.channel, decision: dto.decision } });
      return res.count === 1;
    });
    if (!won) throw new GoneException({ statusCode: 410, code: 'LINK_USED', message: 'This link was already used. Open your approvals in YukthiX.' });
    const channel = x.row.channel === 'email' ? 'web' : (x.row.channel as Provider);
    return this.engine.decide(x.ctx, x.row.userId, x.task.id, dto.decision, dto.reason?.trim() || null, channel);
  }
}

/** The person's own linked chat apps and phones (US-E-282: cards go only to linked people). */
@Controller('workflow/channel-links')
@UseGuards(JwtAuthGuard)
export class ChannelLinksController {
  constructor(
    private readonly cards: ApprovalCards,
    private readonly tenantPrisma: TenantPrismaService,
  ) {}

  private me(req: Request, t: TenantContext, write = false): CompanyContext & { userId: string } {
    const user = req.user as { userId?: string; impersonatorUserId?: string; actingSuperAdmin?: boolean } | undefined;
    if (!user?.userId || !t.organizationId) throw new ForbiddenException('Sign in to a company first.');
    if (write && (user.impersonatorUserId || user.actingSuperAdmin)) throw new ForbiddenException('Not available while acting for someone else');
    return { ...t, organizationId: t.organizationId, isSuperAdmin: false, userId: user.userId };
  }

  @Get()
  async list(@Req() req: Request, @CurrentTenant() t: TenantContext) {
    const m = this.me(req, t);
    const rows = await this.tenantPrisma.forTenant(m, (tx) => tx.channelLink.findMany({ where: { organizationId: m.organizationId, userId: m.userId }, orderBy: { createdAt: 'asc' } }));
    return { typedLinksAllowed: this.cards.typedLinksAllowed, links: rows.map((r) => ({ id: r.id, provider: r.provider, label: r.label, createdAt: r.createdAt })) };
  }

  /**
   * Local demo only (the dev transport): the cards sent to my own linked apps, newest first, so a person can open a
   * card's link without a real Teams or Slack. Never available with a real transport.
   */
  @Get('sent')
  async sent(@Req() req: Request, @CurrentTenant() t: TenantContext) {
    const m = this.me(req, t);
    const fake = this.cards.transport as FakeChannelTransport | null;
    if (!fake || fake.name !== 'dev-fake') throw new NotFoundException('Not available.');
    const mine = await this.tenantPrisma.forTenant(m, (tx) => tx.channelLink.findMany({ where: { organizationId: m.organizationId, userId: m.userId }, select: { provider: true, externalRef: true } }));
    const refs = new Set(mine.map((l) => `${l.provider}:${l.externalRef}`));
    return fake.sent
      .filter((x) => refs.has(`${x.provider}:${x.externalRef}`))
      .slice(-20)
      .reverse()
      .map((x) => {
        const p = x.payload as { title?: string; text?: string; body?: { text?: string }[] };
        const url = JSON.stringify(x.payload).match(/https?:\/\/[^"]+/)?.[0] ?? null;
        return { provider: x.provider, at: x.at, title: p.body?.[0]?.text ?? p.text ?? p.title ?? '', url };
      });
  }

  /**
   * A phone registers its push token for its own signed-in person. Teams and Slack link through the provider's sign-in in
   * production (go-live); typing an id is for the local demo only, so nobody can point their cards at someone else.
   */
  @Post()
  @Throttle(MODERATE_UPLOAD_THROTTLE)
  async add(@Req() req: Request, @CurrentTenant() t: TenantContext, @Body() dto: ChannelLinkDto) {
    const m = this.me(req, t, true);
    if (dto.provider !== 'push' && !this.cards.typedLinksAllowed) throw new ForbiddenException(`Link ${dto.provider === 'teams' ? 'Microsoft Teams' : 'Slack'} from the YukthiX app in ${dto.provider === 'teams' ? 'Teams' : 'Slack'}.`);
    return this.tenantPrisma.forTenant(m, async (tx) => {
      await tx.channelLink.deleteMany({ where: { organizationId: m.organizationId, userId: m.userId, provider: dto.provider } });
      const row = await tx.channelLink.create({ data: { organizationId: m.organizationId, userId: m.userId, provider: dto.provider, externalRef: dto.externalRef, label: dto.label ?? null } }).catch((e: unknown) => {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('That account is already linked to someone.');
        throw e;
      });
      await AuditService.recordIn(tx, m, { actorUserId: m.userId, action: 'workflow.channel_link.added', entityType: 'channel_link', entityId: row.id, metadata: { provider: dto.provider } });
      return { id: row.id, provider: row.provider, label: row.label };
    });
  }

  @Delete(':id')
  async remove(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    const m = this.me(req, t, true);
    return this.tenantPrisma.forTenant(m, async (tx) => {
      const n = await tx.channelLink.deleteMany({ where: { organizationId: m.organizationId, userId: m.userId, id } });
      if (!n.count) throw new NotFoundException('No such link.');
      await AuditService.recordIn(tx, m, { actorUserId: m.userId, action: 'workflow.channel_link.removed', entityType: 'channel_link', entityId: id });
      return { removed: true };
    });
  }
}
