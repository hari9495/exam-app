import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
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
import { BulkBoardDto, JobScorecardDto, MoveDto, RejectDto, ScorecardDto, ScorecardTemplateDto, SendOnStageDto } from './interviewing-dto';

const viewer = (req: Request): Viewer => {
  const u = req.user as { userId: string; role: string; organizationId?: string | null; permissionProfileId?: string | null };
  return { userId: u.userId, role: u.role, organizationId: u.organizationId, permissionProfileId: u.permissionProfileId };
};

// Recruitment batch AT5 (M10-BUILD-DESIGN §18.1): the pipeline board, rejection with undo, job interview settings,
// scorecard templates, and panellist scorecards (D7).
@Controller('hiring')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class InterviewingController {
  constructor(
    private readonly board: HiringBoardService,
    private readonly templates: ScorecardTemplatesService,
    private readonly scorecards: ScorecardsService,
  ) {}

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
  setJobScorecard(@CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: JobScorecardDto) {
    return this.board.setJobScorecard(ctx, id, dto.templateId ?? null);
  }

  @Put('jobs/:id/exams/:examId/send-on')
  @RequirePermissions('pipeline:manage')
  setSendOn(@CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Param('examId', ParseUUIDPipe) examId: string, @Body() dto: SendOnStageDto) {
    return this.board.setSendOn(ctx, id, examId, dto.stageId ?? null);
  }

  @Post('entries/:id/move')
  @HttpCode(200)
  @RequirePermissions('pipeline:manage')
  move(@CurrentTenant() ctx: TenantContext, @CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: MoveDto) {
    return this.board.move(ctx, userId, id, dto.statusId);
  }

  @Post('entries/:id/reject')
  @HttpCode(200)
  @RequirePermissions('pipeline:manage')
  reject(@CurrentTenant() ctx: TenantContext, @CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RejectDto) {
    return this.board.reject(ctx, userId, id, dto);
  }

  @Post('entries/:id/reject/undo')
  @HttpCode(200)
  @RequirePermissions('pipeline:manage')
  undo(@CurrentTenant() ctx: TenantContext, @CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.board.undo(ctx, userId, id);
  }

  @Post('entries/bulk')
  @HttpCode(200)
  @RequirePermissions('pipeline:manage')
  bulk(@CurrentTenant() ctx: TenantContext, @CurrentUserId() userId: string, @Body() dto: BulkBoardDto) {
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
  createTemplate(@CurrentTenant() ctx: TenantContext, @Body() dto: ScorecardTemplateDto) {
    return this.templates.save(ctx, null, dto);
  }

  @Put('scorecard-templates/:id')
  @RequirePermissions('pipelines:configure')
  updateTemplate(@CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ScorecardTemplateDto) {
    return this.templates.save(ctx, id, dto);
  }

  @Delete('scorecard-templates/:id')
  @RequirePermissions('pipelines:configure')
  archiveTemplate(@CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.templates.archive(ctx, id);
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
    return this.scorecards.save(ctx, id, viewer(req), dto, false);
  }

  @Post('interviews/:id/scorecard/submit')
  @HttpCode(200)
  @RequireAnyPermission('interview:view_assigned', 'pipeline:manage', 'results:view')
  submitScorecard(@CurrentTenant() ctx: TenantContext, @Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ScorecardDto) {
    return this.scorecards.save(ctx, id, viewer(req), dto, true);
  }
}
