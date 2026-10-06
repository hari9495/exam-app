import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { RequireStepUp } from '../auth/step-up.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequireAnyPermission, RequirePermissions } from '../rbac/permissions.decorator';
import { ownSession } from '../org-structure/org-structure.controller';
import { ApproveDto, AsOfQueryDto, ChangeEditDto, ChangeListQueryDto, ChangeRequestDto, DecisionDto, EmployeeCreateDto, EmployeeListQueryDto, HistoryQueryDto, SegmentsQueryDto } from './dto';
import { EmployeeHistoryService, RequestUser } from './employee-history.service';

// People › job history and changes (P06 §4.3–4.7, §7; M01 §3.3). Permissions (P02 YX-SEC-01):
//   employee.profile.view           every employee's record and history (HR)
//   employee.change.manage          raise, edit and cancel changes; add employees
//   employee.change.approve         approve or reject (never one's own, YX-SEC-11)
//   employee.change.retro           past-dated changes (YX-HIS-12 tier 1)
//   employee.change.retro_override  before the company's retro limit, with a reason (tier 3)
//   employee.salary.view / .manage  pay facts (founder rule R1)
// Reading one person's record is also open to the implicit grants (P02 YX-SEC-04): the person themselves
// and the managers above them for the periods they managed (YX-SEC-06). The service checks those.
@Controller('people')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class EmployeeHistoryController {
  constructor(private readonly history: EmployeeHistoryService) {}

  private viewer(req: Request) {
    return this.history.viewer(req.user as RequestUser);
  }

  /** Implicit grants: HR sees everyone, others themselves and their team. */
  @Get('employees')
  async list(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() q: EmployeeListQueryDto) {
    return this.history.listEmployees(ctx, await this.viewer(req), q.q);
  }

  @Post('employees')
  @RequirePermissions('employee.change.manage')
  async create(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: EmployeeCreateDto) {
    ownSession(req);
    return this.history.createEmployee(ctx, await this.viewer(req), dto);
  }

  /** Implicit grants (self, managers in their periods) or employee.profile.view. */
  @Get('employees/:id/as-of')
  async asOf(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Query() q: AsOfQueryDto) {
    return this.history.asOf(ctx, await this.viewer(req), id, q.date, q.recordedAt, q.pay === 'true');
  }

  /** Implicit grants (self, managers in their periods) or employee.profile.view. */
  @Get('employees/:id/history')
  async timeline(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Query() q: HistoryQueryDto) {
    return this.history.history(ctx, await this.viewer(req), id, q.pay === 'true');
  }

  @Get('employees/:id/segments')
  @RequirePermissions('employee.profile.view')
  async segments(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Query() q: SegmentsQueryDto) {
    return this.history.segments(ctx, await this.viewer(req), id, q.from, q.to);
  }

  // ---- changes ----

  @Get('changes')
  @RequireAnyPermission('employee.profile.view', 'employee.change.manage', 'employee.change.approve')
  async changes(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() q: ChangeListQueryDto) {
    return this.history.listChanges(ctx, await this.viewer(req), q);
  }

  @Post('changes/preview')
  @RequirePermissions('employee.change.manage')
  async previewRequest(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: ChangeRequestDto) {
    ownSession(req);
    return this.history.previewRequest(ctx, await this.viewer(req), dto);
  }

  @Post('changes')
  @RequirePermissions('employee.change.manage')
  async request(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: ChangeRequestDto) {
    ownSession(req);
    return this.history.requestChange(ctx, await this.viewer(req), dto);
  }

  @Get('changes/:id')
  @RequireAnyPermission('employee.profile.view', 'employee.change.manage', 'employee.change.approve')
  async get(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.history.getChange(ctx, await this.viewer(req), id);
  }

  @Get('changes/:id/preview')
  @RequireAnyPermission('employee.change.manage', 'employee.change.approve')
  async previewChange(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    ownSession(req);
    return this.history.previewChange(ctx, await this.viewer(req), id);
  }

  @Put('changes/:id')
  @RequirePermissions('employee.change.manage')
  async edit(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ChangeEditDto) {
    ownSession(req);
    return this.history.edit(ctx, await this.viewer(req), id, dto);
  }

  /** Approving rewrites employment facts: a fresh second factor (P12 YX-IAM-02). */
  @Post('changes/:id/approve')
  @RequirePermissions('employee.change.approve')
  @RequireStepUp()
  async approve(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ApproveDto) {
    ownSession(req);
    return this.history.approve(ctx, await this.viewer(req), id, dto.confirmRebase === true, dto.note);
  }

  @Post('changes/:id/reject')
  @RequirePermissions('employee.change.approve')
  async reject(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DecisionDto) {
    ownSession(req);
    return this.history.reject(ctx, await this.viewer(req), id, dto.reason);
  }

  @Post('changes/:id/cancel')
  @RequirePermissions('employee.change.manage')
  async cancel(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DecisionDto) {
    ownSession(req);
    return this.history.cancel(ctx, await this.viewer(req), id, dto.reason, dto.confirmRebase === true);
  }
}
