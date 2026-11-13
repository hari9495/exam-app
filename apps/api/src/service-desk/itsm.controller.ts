import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query, Req, Res, StreamableFile, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequireAnyPermission, RequirePermissions } from '../rbac/permissions.decorator';
import { DeskAccessService, assertOwnSession } from './desk-access';
import { ChangeCancelDto, ChangeDto, ChangeExportDto, ItsmReportDto, KnownErrorDto, ProblemCloseDto, ProblemDto, ProblemFixDto, ProblemLinkDto, ProblemUpdateDto, ChangeOutcomeDto, ChangeReviewDto, ChangeTasksDto, ChangeVersionDto, ChangesQueryDto, ItsmSettingsDto, ItsmWindowDto } from './dto-itsm';
import { ChangesService } from './changes.service';
import { ProblemsService } from './problems.service';
import { ItsmService } from './itsm.service';

// Helpdesk ITSM (docs/yukthix/helpdesk-itsm-plan.md; answers 1931-1943): changes and problems on IT desks. Routes
// declare their key (YX-SEC-01); the service checks the seat on the desk. Nothing is changed while acting for another.
@Controller('desk')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DeskItsmController {
  constructor(
    private readonly access: DeskAccessService,
    private readonly itsm: ItsmService,
    private readonly changes: ChangesService,
    private readonly problems: ProblemsService,
  ) {}

  // ---------------------------------------------------------------- ITSM-1 settings

  @Get('desks/:id/itsm-settings')
  @RequireAnyPermission('desk.settings.manage', 'desk.ticket.work')
  async settings(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.itsm.settings(await this.access.actor(req, t), id);
  }

  @Put('desks/:id/itsm-settings')
  @RequirePermissions('desk.settings.manage')
  async saveSettings(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ItsmSettingsDto) {
    assertOwnSession(req);
    return this.itsm.saveSettings(await this.access.actor(req, t), id, dto);
  }

  // A company-wide rule: the company's Service Desk owner (desk.desk.create) changes it, as with the knowledge interval.
  @Put('itsm/window')
  @RequirePermissions('desk.desk.create')
  async saveWindow(@Req() req: Request, @CurrentTenant() t: TenantContext, @Body() dto: ItsmWindowDto) {
    assertOwnSession(req);
    return this.itsm.saveWindow(await this.access.actor(req, t), dto);
  }

  // ---------------------------------------------------------------- ITSM-2 changes (answers 1932-1938, 1943)

  // Answer 1953: board members, application owners and approvers see the changes they are asked about without a desk
  // key or seat; the service decides what each person sees (nothing for anyone else).
  @Get('changes')
  async list(@Req() req: Request, @CurrentTenant() t: TenantContext, @Query() q: ChangesQueryDto) {
    return this.changes.list(await this.access.actor(req, t), q.deskId);
  }

  @Post('changes')
  @RequirePermissions('desk.ticket.work')
  async create(@Req() req: Request, @CurrentTenant() t: TenantContext, @Body() dto: ChangeDto) {
    assertOwnSession(req);
    return this.changes.create(await this.access.actor(req, t), dto);
  }

  /** The change audit export (answer 1943): every change raised in the period, with its approvals, outcome and review. */
  @Get('changes/export')
  @RequirePermissions('desk.ticket.view')
  async export(@Req() req: Request, @CurrentTenant() t: TenantContext, @Query() q: ChangeExportDto, @Res({ passthrough: true }) res: Response) {
    const out = await this.changes.export(await this.access.actor(req, t), q);
    res.setHeader('Content-Type', out.type);
    res.setHeader('Content-Disposition', `attachment; filename="${out.filename}"`);
    // A PDF is bytes: sent as a file, never as JSON.
    return typeof out.body === 'string' ? out.body : new StreamableFile(out.body);
  }

  @Get('changes/:id')
  async detail(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.changes.detail(await this.access.actor(req, t), id);
  }

  @Post('changes/:id/start')
  @HttpCode(200)
  @RequirePermissions('desk.ticket.work')
  async start(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ChangeVersionDto) {
    assertOwnSession(req);
    return this.changes.start(await this.access.actor(req, t), id, dto.version);
  }

  @Patch('changes/:id/tasks')
  @RequirePermissions('desk.ticket.work')
  async tasks(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ChangeTasksDto) {
    assertOwnSession(req);
    return this.changes.setTasks(await this.access.actor(req, t), id, dto);
  }

  @Post('changes/:id/outcome')
  @HttpCode(200)
  @RequirePermissions('desk.ticket.work')
  async outcome(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ChangeOutcomeDto) {
    assertOwnSession(req);
    return this.changes.outcome(await this.access.actor(req, t), id, dto);
  }

  // Leads and the change board review; a board member may hold no desk key, so the service checks who they are.
  @Post('changes/:id/review')
  @HttpCode(200)
  async review(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ChangeReviewDto) {
    assertOwnSession(req);
    return this.changes.saveReview(await this.access.actor(req, t), id, dto);
  }

  /** Answer 1951: cancel or withdraw before it starts (the person who raised it, or an IT lead). */
  @Post('changes/:id/cancel')
  @HttpCode(200)
  @RequirePermissions('desk.ticket.work')
  async cancel(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ChangeCancelDto) {
    assertOwnSession(req);
    return this.changes.cancel(await this.access.actor(req, t), id, dto);
  }

  /** ITSM-4: changes by kind and outcome, the failed-change rate, open problems by age, incidents per problem. */
  @Get('itsm/report')
  @RequirePermissions('desk.ticket.view')
  async report(@Req() req: Request, @CurrentTenant() t: TenantContext, @Query() q: ItsmReportDto) {
    return this.changes.report(await this.access.actor(req, t), q);
  }

  // ---------------------------------------------------------------- ITSM-3 problems (answers 1939-1941)

  @Get('problems')
  @RequirePermissions('desk.ticket.view')
  async problemList(@Req() req: Request, @CurrentTenant() t: TenantContext, @Query() q: ChangesQueryDto) {
    return this.problems.list(await this.access.actor(req, t), q.deskId);
  }

  @Post('problems')
  @RequirePermissions('desk.ticket.work')
  async problemCreate(@Req() req: Request, @CurrentTenant() t: TenantContext, @Body() dto: ProblemDto) {
    assertOwnSession(req);
    return this.problems.create(await this.access.actor(req, t), dto);
  }

  @Get('problems/:id')
  @RequirePermissions('desk.ticket.view')
  async problemDetail(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.problems.detail(await this.access.actor(req, t), id);
  }

  @Patch('problems/:id')
  @RequirePermissions('desk.ticket.work')
  async problemUpdate(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ProblemUpdateDto) {
    assertOwnSession(req);
    return this.problems.update(await this.access.actor(req, t), id, dto);
  }

  @Post('problems/:id/incidents')
  @HttpCode(200)
  @RequirePermissions('desk.ticket.work')
  async problemLink(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ProblemLinkDto) {
    assertOwnSession(req);
    return this.problems.link(await this.access.actor(req, t), id, dto);
  }

  @Post('problems/:id/known-error')
  @HttpCode(200)
  @RequirePermissions('desk.ticket.work')
  async problemKnownError(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: KnownErrorDto) {
    assertOwnSession(req);
    return this.problems.knownError(await this.access.actor(req, t), id, dto);
  }

  @Post('problems/:id/fix')
  @HttpCode(200)
  @RequirePermissions('desk.ticket.work')
  async problemFix(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ProblemFixDto) {
    assertOwnSession(req);
    return this.problems.fix(await this.access.actor(req, t), id, dto);
  }

  @Post('problems/:id/close')
  @HttpCode(200)
  @RequirePermissions('desk.ticket.work')
  async problemClose(@Req() req: Request, @CurrentTenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ProblemCloseDto) {
    assertOwnSession(req);
    return this.problems.close(await this.access.actor(req, t), id, dto);
  }
}
