import { Body, Controller, ForbiddenException, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { assertOwnSession } from '../service-desk/desk-access';
import type { ScopeUser } from '../access/scope';
import { AnnouncementDto, AudienceDto, CommentDto, FeedQueryDto, KudosDto, KudosQueryDto, ModerateDto, PeopleQueryDto, PostDto, SpaceApprovalDto } from './dto';
import { KudosService } from './kudos.service';
import { FeedService } from './feed.service';
import { AnnouncementsService } from './announcements.service';

// Batch G2 (M09 Engage). Keys (P02 YX-SEC-01):
//   engage.announce   write, publish and track announcements (held for the whole company)
//   engage.moderate   the moderation queue and its actions; approval on a space (held for the whole company)
//   no key (self)     the feed of my spaces: posts, likes, comments, reports; my announcements and acknowledging them
//                     (writing is never done while acting for someone else)
@Controller('engage/announcements')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AnnouncementsController {
  constructor(private readonly svc: AnnouncementsService) {}

  @Get()
  @RequirePermissions('engage.announce')
  async list(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    await this.svc.companyWide(req.user as ScopeUser);
    return this.svc.list(ctx);
  }

  @Get('options')
  @RequirePermissions('engage.announce')
  async options(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    await this.svc.companyWide(req.user as ScopeUser);
    return this.svc.options(ctx);
  }

  @Post('reach')
  @HttpCode(200)
  @RequirePermissions('engage.announce')
  async reach(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: AudienceDto) {
    await this.svc.companyWide(req.user as ScopeUser);
    return this.svc.reach(ctx, dto);
  }

  @Post()
  @RequirePermissions('engage.announce')
  async create(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: AnnouncementDto) {
    assertOwnSession(req);
    await this.svc.companyWide(req.user as ScopeUser);
    return this.svc.create(ctx, dto);
  }

  @Get(':id')
  @RequirePermissions('engage.announce')
  async detail(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    await this.svc.companyWide(req.user as ScopeUser);
    return this.svc.detail(ctx, id);
  }

  @Post(':id/remind')
  @RequirePermissions('engage.announce')
  async remind(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    assertOwnSession(req);
    await this.svc.companyWide(req.user as ScopeUser);
    return this.svc.remind(ctx, id);
  }
}

@Controller('engage/my')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class MyEngageController {
  constructor(
    private readonly svc: AnnouncementsService,
    private readonly feedSvc: FeedService,
    private readonly kudosSvc: KudosService,
  ) {}

  // Batch G2 item 73: kudos (badges only) and the recognition wall.
  @Get('kudos/options')
  kudosOptions(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() q: PeopleQueryDto) {
    return this.kudosSvc.options(ctx, req.user as ScopeUser, q.q);
  }

  @Post('kudos')
  giveKudos(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: KudosDto) {
    assertOwnSession(req);
    return this.kudosSvc.give(ctx, req.user as ScopeUser, dto);
  }

  @Get('kudos')
  wall(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() q: KudosQueryDto) {
    return this.kudosSvc.wall(ctx, req.user as ScopeUser, q.value);
  }

  // Batch G2 item 100: the feed of my spaces, the spaces directory, posting, likes, comments and reports.
  @Get('feed')
  feed(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() q: FeedQueryDto) {
    return this.feedSvc.feed(ctx, req.user as ScopeUser, q.spaceId);
  }

  @Get('spaces')
  spaces(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.feedSvc.directory(ctx, req.user as ScopeUser);
  }

  @Post('posts')
  post(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: PostDto) {
    assertOwnSession(req);
    return this.feedSvc.post(ctx, req.user as ScopeUser, dto);
  }

  @Post('posts/:id/like')
  like(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    assertOwnSession(req);
    return this.feedSvc.like(ctx, req.user as ScopeUser, id);
  }

  @Get('posts/:id/comments')
  comments(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.feedSvc.comments(ctx, req.user as ScopeUser, id);
  }

  @Post('posts/:id/comments')
  comment(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CommentDto) {
    assertOwnSession(req);
    return this.feedSvc.comment(ctx, req.user as ScopeUser, id, dto);
  }

  @Post('posts/:id/report')
  reportPost(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    assertOwnSession(req);
    return this.feedSvc.report(ctx, req.user as ScopeUser, 'post', id);
  }

  @Post('comments/:id/report')
  reportComment(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    assertOwnSession(req);
    return this.feedSvc.report(ctx, req.user as ScopeUser, 'comment', id);
  }

  @Get('announcements')
  announcements(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.svc.mine(ctx, req.user as ScopeUser);
  }

  @Post('announcements/:id/acknowledge')
  acknowledge(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    assertOwnSession(req);
    return this.svc.acknowledge(ctx, req.user as ScopeUser, id);
  }
}

@Controller('engage/moderation')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ModerationController {
  constructor(private readonly feedSvc: FeedService) {}

  /** The key must be held for the whole company. */
  private async gate(req: Request) {
    if (!(await this.feedSvc.companyWide(req.user as ScopeUser, 'engage.moderate'))) throw new ForbiddenException('Moderation covers the whole company: this needs the key for the whole company.');
  }

  @Get()
  @RequirePermissions('engage.moderate')
  async queue(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    await this.gate(req);
    return this.feedSvc.queue(ctx);
  }

  @Post('posts/:id')
  @RequirePermissions('engage.moderate')
  async post(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ModerateDto) {
    assertOwnSession(req);
    await this.gate(req);
    return this.feedSvc.moderate(ctx, 'post', id, dto);
  }

  @Post('comments/:id')
  @RequirePermissions('engage.moderate')
  async comment(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ModerateDto) {
    assertOwnSession(req);
    await this.gate(req);
    return this.feedSvc.moderate(ctx, 'comment', id, dto);
  }

  @Put('spaces/:id')
  @RequirePermissions('engage.moderate')
  async space(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SpaceApprovalDto) {
    assertOwnSession(req);
    await this.gate(req);
    return this.feedSvc.setApproval(ctx, id, dto.approval);
  }
}
