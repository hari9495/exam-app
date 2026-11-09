import { Body, Controller, Delete, ForbiddenException, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { assertOwnSession } from '../service-desk/desk-access';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequireAnyPermission, RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { CurrentUserId } from '../auth/current-user-id.decorator';
import { CurrentUserRole } from '../auth/current-user-role.decorator';
import { HiringBoardService } from './hiring-board.service';
import { ScorecardTemplatesService } from './scorecard-templates.service';
import { ScorecardsService, type Viewer } from './scorecards.service';
import { BoardRejectDto, BulkBoardDto, InterviewDayDto, InterviewRangeDto, JobScorecardDto, MoveDto, NotetakerConsentDto, NotetakerTranscriptDto, ScorecardCommentDto, ScorecardDto, ScorecardTemplateDto, SendOnStageDto } from './interviewing-dto';
import { InterviewDaysService } from './interview-days.service';
import { NotetakerService } from './notetaker.service';

const viewer = (req: Request): Viewer => {
  const u = req.user as { userId: string; role: string; organizationId?: string | null; permissionProfileId?: string | null };
  return { userId: u.userId, role: u.role, organizationId: u.organizationId, permissionProfileId: u.permissionProfileId };
};

/** HIR-04: moving and rejecting candidates is the person's own act, never done while acting for someone else. */
function notActing(req: Request, what = 'Candidates cannot be moved or rejected'): void {
  const u = req.user as { impersonatorUserId?: string; actingSuperAdmin?: boolean } | undefined;
  if (u?.impersonatorUserId || u?.actingSuperAdmin) throw new ForbiddenException(`${what} while acting for someone else. Sign in as yourself.`);
}
// Answer 345: scorecard templates are company settings (Settings 6.1), never changed while acting for someone else.
const TEMPLATES = 'Scorecard templates cannot be changed';
const DAYS = 'An interview day cannot be planned or sent';

// Recruitment batch AT5 (M10-BUILD-DESIGN §18.1): the pipeline board, rejection with undo, job interview settings,
// scorecard templates, and panellist scorecards (D7).
@Controller('hiring')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class InterviewingController {
  constructor(
    private readonly board: HiringBoardService,
    private readonly templates: ScorecardTemplatesService,
    private readonly scorecards: ScorecardsService,
    private readonly days: InterviewDaysService,
    private readonly notetaker: NotetakerService,
  ) {}

  // HIR-27 bulk interview day: recruiting (the key that schedules interviews). Planning, assigning and sending are the
  // person's own acts, never done while acting for someone else; another company's day reads as not found.
  @Get('interview-days')
  @RequirePermissions('pipeline:manage')
  listDays(@CurrentTenant() ctx: TenantContext) {
    return this.days.list(ctx);
  }

  @Get('interview-days/options')
  @RequirePermissions('pipeline:manage')
  dayOptions(@CurrentTenant() ctx: TenantContext) {
    return this.days.options(ctx);
  }

  @Post('interview-days')
  @RequirePermissions('pipeline:manage')
  createDay(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: InterviewDayDto) {
    notActing(req, DAYS);
    return this.days.create(ctx, dto);
  }

  @Get('interview-days/:id')
  @RequirePermissions('pipeline:manage')
  getDay(@CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.days.get(ctx, id);
  }

  @Post('interview-days/:id/assign')
  @HttpCode(200)
  @RequirePermissions('pipeline:manage')
  assignDay(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    notActing(req, DAYS);
    return this.days.assign(ctx, id);
  }

  @Post('interview-days/:id/send')
  @HttpCode(200)
  @RequirePermissions('pipeline:manage')
  sendDay(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    notActing(req, DAYS);
    return this.days.send(ctx, userId, id);
  }

  @Get('jobs/:id/board')
  @RequirePermissions('results:view')
  getBoard(@CurrentTenant() ctx: TenantContext, @CurrentUserRole() role: string, @CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.board.board(ctx, id, role, userId);
  }

  @Get('jobs/:id/interview-settings')
  @RequirePermissions('results:view')
  jobSettings(@CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.board.jobSettings(ctx, id);
  }

  @Put('jobs/:id/scorecard')
  @RequirePermissions('pipeline:manage')
  setJobScorecard(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: JobScorecardDto) {
    // HIR-04 answer 261: the job settings moved onto the HIR-03 workspace; like every write there, not while acting.
    assertOwnSession(req);
    return this.board.setJobScorecard(ctx, id, dto.templateId ?? null);
  }

  @Put('jobs/:id/exams/:examId/send-on')
  @RequirePermissions('pipeline:manage')
  setSendOn(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Param('examId', ParseUUIDPipe) examId: string, @Body() dto: SendOnStageDto) {
    assertOwnSession(req);
    return this.board.setSendOn(ctx, id, examId, dto.stageId ?? null);
  }

  @Post('entries/:id/move')
  @HttpCode(200)
  @RequirePermissions('pipeline:manage')
  move(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: MoveDto) {
    notActing(req);
    return this.board.move(ctx, userId, id, dto.statusId, dto.fromStatusId);
  }

  @Post('entries/:id/reject')
  @HttpCode(200)
  @RequirePermissions('pipeline:manage')
  reject(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: BoardRejectDto) {
    notActing(req);
    return this.board.reject(ctx, userId, id, dto);
  }

  @Post('entries/:id/reject/undo')
  @HttpCode(200)
  @RequirePermissions('pipeline:manage')
  undo(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    notActing(req);
    return this.board.undo(ctx, userId, id);
  }

  @Post('entries/bulk')
  @HttpCode(200)
  @RequirePermissions('pipeline:manage')
  bulk(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @CurrentUserId() userId: string, @Body() dto: BulkBoardDto) {
    notActing(req);
    return this.board.bulk(ctx, userId, dto);
  }

  @Get('scorecard-templates')
  @RequireAnyPermission('pipeline:manage', 'pipelines:configure')
  listTemplates(@CurrentTenant() ctx: TenantContext) {
    return this.templates.list(ctx);
  }

  @Get('scorecard-competencies')
  @RequireAnyPermission('pipeline:manage', 'pipelines:configure')
  competencies(@CurrentTenant() ctx: TenantContext) {
    return this.templates.competencies(ctx);
  }

  @Post('scorecard-templates')
  @RequirePermissions('pipelines:configure')
  createTemplate(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: ScorecardTemplateDto) {
    notActing(req, TEMPLATES);
    return this.templates.save(ctx, null, dto);
  }

  @Put('scorecard-templates/:id')
  @RequirePermissions('pipelines:configure')
  updateTemplate(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ScorecardTemplateDto) {
    notActing(req, TEMPLATES);
    return this.templates.save(ctx, id, dto);
  }

  @Delete('scorecard-templates/:id')
  @RequirePermissions('pipelines:configure')
  archiveTemplate(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    notActing(req, TEMPLATES);
    return this.templates.archive(ctx, id);
  }

  @Get('interviews/mine')
  @RequireAnyPermission('interview:view_assigned', 'pipeline:manage', 'results:view')
  myInterviews(@CurrentTenant() ctx: TenantContext, @CurrentUserId() userId: string) {
    return this.scorecards.mine(ctx, userId);
  }

  // HIR-06 calendar: recruiters (pipeline:manage) see the company's interviews; anyone else only those they are on, or
  // for jobs they are the hiring manager of.
  @Get('interviews')
  @RequireAnyPermission('interview:view_assigned', 'pipeline:manage', 'results:view')
  interviewRange(@CurrentTenant() ctx: TenantContext, @Req() req: Request, @Query() q: InterviewRangeDto) {
    return this.scorecards.range(ctx, viewer(req), new Date(q.from), new Date(q.to));
  }

  // Panellists (interview:view_assigned) and recruiters; the service applies D7 per viewer.
  @Get('interviews/:id')
  @RequireAnyPermission('interview:view_assigned', 'pipeline:manage', 'results:view')
  interview(@CurrentTenant() ctx: TenantContext, @Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    return this.scorecards.get(ctx, id, viewer(req));
  }

  @Put('interviews/:id/scorecard')
  @RequireAnyPermission('interview:view_assigned', 'pipeline:manage', 'results:view')
  saveScorecard(@CurrentTenant() ctx: TenantContext, @Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ScorecardDto) {
    // HIR-07: a scorecard is the interviewer's own judgement, never written while acting for someone else.
    assertOwnSession(req);
    return this.scorecards.save(ctx, id, viewer(req), dto, false);
  }

  @Post('interviews/:id/scorecard/submit')
  @HttpCode(200)
  @RequireAnyPermission('interview:view_assigned', 'pipeline:manage', 'results:view')
  submitScorecard(@CurrentTenant() ctx: TenantContext, @Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ScorecardDto) {
    assertOwnSession(req);
    return this.scorecards.save(ctx, id, viewer(req), dto, true);
  }

  // HIR-07 answer 322: an append-only comment under a submitted scorecard; whoever may read it; never while acting.
  @Post('interviews/:id/scorecards/:scorecardId/comments')
  @RequireAnyPermission('interview:view_assigned', 'pipeline:manage', 'results:view')
  commentScorecard(@CurrentTenant() ctx: TenantContext, @Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Param('scorecardId', ParseUUIDPipe) scorecardId: string, @Body() dto: ScorecardCommentDto) {
    assertOwnSession(req);
    return this.scorecards.comment(ctx, id, scorecardId, viewer(req), dto);
  }

  // HIR-25 interview notetaker (founder decision 2): the panel and the job's overseers see it; every write is the
  // person's own act (refused while acting for someone else). Another company's interview is 404.
  @Get('interviews/:id/notetaker')
  @RequireAnyPermission('interview:view_assigned', 'pipeline:manage', 'results:view')
  notetakerView(@CurrentTenant() ctx: TenantContext, @Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    return this.notetaker.view(ctx, id, viewer(req));
  }

  @Put('interviews/:id/notetaker/consent')
  @RequireAnyPermission('interview:view_assigned', 'pipeline:manage', 'results:view')
  notetakerConsent(@CurrentTenant() ctx: TenantContext, @Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() dto: NotetakerConsentDto) {
    assertOwnSession(req);
    return this.notetaker.consent(ctx, id, viewer(req), dto.participant, dto.consent);
  }

  @Put('interviews/:id/notetaker/transcript')
  @RequireAnyPermission('interview:view_assigned', 'pipeline:manage', 'results:view')
  notetakerTranscript(@CurrentTenant() ctx: TenantContext, @Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() dto: NotetakerTranscriptDto) {
    assertOwnSession(req);
    return this.notetaker.addTranscript(ctx, id, viewer(req), dto.text);
  }

  @Post('interviews/:id/notetaker/draft')
  @RequireAnyPermission('interview:view_assigned', 'pipeline:manage', 'results:view')
  notetakerDraft(@CurrentTenant() ctx: TenantContext, @Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    assertOwnSession(req);
    return this.notetaker.draft(ctx, id, viewer(req));
  }

  @Get('interviews/:id/notetaker/draft')
  @RequireAnyPermission('interview:view_assigned', 'pipeline:manage', 'results:view')
  notetakerMyDraft(@CurrentTenant() ctx: TenantContext, @Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    return this.notetaker.myDraft(ctx, id, viewer(req));
  }
}
