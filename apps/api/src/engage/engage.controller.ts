import { BadRequestException, Body, Controller, ForbiddenException, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, Req, Res, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { assertOwnSession } from '../service-desk/desk-access';
import type { ScopeUser } from '../access/scope';
import { ActionPlanDto, AnnouncementDto, CelebrationPrefsDto, AnswersDto, AudienceDto, CommentDto, FeedQueryDto, KudosDto, KudosQueryDto, ModerateDto, PeopleQueryDto, PostDto, ResultsQueryDto, SpaceApprovalDto, SurveyDto, VoteDto } from './dto';
import { SurveysService } from './surveys.service';
import { CelebrationsService } from './celebrations.service';
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
    private readonly surveys: SurveysService,
    private readonly celebrations: CelebrationsService,
  ) {}

  // Batch G2 item 76: today's celebrations, and my own choices.
  @Get('celebrations')
  celebrationsToday(@CurrentTenant() ctx: TenantContext) {
    return this.celebrations.today(ctx);
  }

  @Get('celebrations/mine')
  myCelebrations(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.celebrations.mine(ctx, req.user as ScopeUser);
  }

  @Put('celebrations/mine')
  setMyCelebrations(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: CelebrationPrefsDto) {
    assertOwnSession(req);
    return this.celebrations.setMine(ctx, req.user as ScopeUser, dto);
  }

  // Batch G2 item 75: a vote on a poll.
  @Post('posts/:id/vote')
  vote(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: VoteDto) {
    assertOwnSession(req);
    return this.feedSvc.vote(ctx, req.user as ScopeUser, id, dto.option);
  }

  // Batch G2 item 74: my open surveys, taking one; a manager's own team results and action plan.
  @Get('surveys')
  mySurveys(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.surveys.mine(ctx, req.user as ScopeUser);
  }

  @Get('surveys/:id')
  toTake(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.surveys.toTake(ctx, req.user as ScopeUser, id);
  }

  @Post('surveys/:id/answers')
  answer(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AnswersDto) {
    assertOwnSession(req);
    return this.surveys.answer(ctx, req.user as ScopeUser, id, dto);
  }

  @Get('team-surveys')
  teamSurveys(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.surveys.teamSurveys(ctx, req.user as ScopeUser);
  }

  @Get('team-surveys/:id')
  teamResults(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.surveys.teamResults(ctx, req.user as ScopeUser, id);
  }

  @Get('team-surveys/:id/plan')
  myPlan(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.surveys.myPlan(ctx, req.user as ScopeUser, id);
  }

  @Put('team-surveys/:id/plan')
  savePlan(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ActionPlanDto) {
    assertOwnSession(req);
    return this.surveys.savePlan(ctx, req.user as ScopeUser, id, dto);
  }

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

  // Answer 2666: Route to HR (the author and the count, never the words).
  @Post(':target/:id/route-to-hr')
  @RequirePermissions('engage.moderate')
  async routeToHr(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('target') target: string, @Param('id', ParseUUIDPipe) id: string) {
    assertOwnSession(req);
    await this.gate(req);
    if (target !== 'posts' && target !== 'comments') throw new BadRequestException('Route a post or a comment.');
    return this.feedSvc.routeToHr(ctx, target === 'posts' ? 'post' : 'comment', id);
  }

  @Put('spaces/:id')
  @RequirePermissions('engage.moderate')
  async space(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SpaceApprovalDto) {
    assertOwnSession(req);
    await this.gate(req);
    return this.feedSvc.setApproval(ctx, id, dto.approval);
  }
}

// Batch G2 item 74: engage.survey.manage (held for the whole company) builds, launches and closes surveys and reads
// company results and every action plan.
@Controller('engage/surveys')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SurveysController {
  constructor(private readonly surveys: SurveysService) {}

  private async gate(req: Request) {
    if (!(await this.surveys.companyWide(req.user as ScopeUser))) throw new ForbiddenException('Surveys cover the whole company: this needs the key for the whole company.');
  }

  @Get()
  @RequirePermissions('engage.survey.manage')
  async list(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    await this.gate(req);
    return this.surveys.list(ctx);
  }

  @Get('options')
  @RequirePermissions('engage.survey.manage')
  async options(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    await this.gate(req);
    return this.surveys.options(ctx);
  }

  @Post()
  @RequirePermissions('engage.survey.manage')
  async create(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: SurveyDto) {
    assertOwnSession(req);
    await this.gate(req);
    return this.surveys.create(ctx, dto);
  }

  @Get(':id')
  @RequirePermissions('engage.survey.manage')
  async detail(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    await this.gate(req);
    return this.surveys.detail(ctx, id);
  }

  @Put(':id')
  @RequirePermissions('engage.survey.manage')
  async update(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SurveyDto) {
    assertOwnSession(req);
    await this.gate(req);
    return this.surveys.update(ctx, id, dto);
  }

  @Post(':id/launch')
  @RequirePermissions('engage.survey.manage')
  async launch(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    assertOwnSession(req);
    await this.gate(req);
    return this.surveys.launch(ctx, id);
  }

  @Post(':id/close')
  @RequirePermissions('engage.survey.manage')
  async close(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    assertOwnSession(req);
    await this.gate(req);
    return this.surveys.close(ctx, id);
  }

  @Get(':id/results')
  @RequirePermissions('engage.survey.manage')
  async results(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Query() q: ResultsQueryDto) {
    await this.gate(req);
    return this.surveys.results(ctx, id, q.departmentId);
  }

  // Answer 2668: the shown results as CSV (groups at or above the smallest group only).
  @Get(':id/results/csv')
  @RequirePermissions('engage.survey.manage')
  async resultsCsv(@Req() req: Request, @Res({ passthrough: true }) res: Response, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    await this.gate(req);
    const out = await this.surveys.resultsCsv(ctx, id);
    res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="survey-results-${id.slice(0, 8)}.csv"`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    return out.csv;
  }

  @Get(':id/plans')
  @RequirePermissions('engage.survey.manage')
  async plans(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    await this.gate(req);
    return this.surveys.plans(ctx, id);
  }
}
