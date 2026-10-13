import { Body, Controller, Get, Header, HttpCode, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions, RequireAnyPermission } from '../rbac/permissions.decorator';
import type { ScopeUser } from '../access/scope';
import { CalibrationChangeDto, ReportQueryDto, SessionDto } from './review-dto';
import { PerformanceCalibrationService } from './calibration.service';
import { PerformanceReportsService, type ReportKind } from './reports.service';

// Performance batch PM6 (M06-BUILD-DESIGN §19 "Calibration", "Reports"). Opening a session needs perf.cycle.manage; the
// board is open to its facilitator, HR and the managers of the people in it (the service decides); reports need
// perf.report.view and show only people in scope.
@Controller('performance')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PerformanceCalibrationController {
  constructor(
    private readonly svc: PerformanceCalibrationService,
    private readonly reports: PerformanceReportsService,
  ) {}

  private user(req: Request) {
    return req.user as ScopeUser;
  }

  @Get('cycles/:id/calibrations')
  @RequireAnyPermission('perf.cycle.manage', 'perf.calibration.facilitate')
  sessions(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.sessions(ctx, this.user(req), id);
  }

  @Get('calibrations')
  @RequireAnyPermission('perf.cycle.manage', 'perf.calibration.facilitate')
  mine(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.svc.sessions(ctx, this.user(req), null);
  }

  @Get('report-cycles')
  @RequirePermissions('perf.report.view')
  reportCycles(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.reports.cycles(ctx, this.user(req));
  }

  @Get('calibration-facilitators')
  @RequirePermissions('perf.cycle.manage')
  facilitators(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.svc.facilitators(ctx, this.user(req));
  }

  @Post('cycles/:id/calibrations')
  @RequirePermissions('perf.cycle.manage')
  create(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SessionDto) {
    return this.svc.create(ctx, this.user(req), id, dto);
  }

  @Get('calibrations/:id')
  board(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.board(ctx, this.user(req), id);
  }

  @Post('calibrations/:id/changes')
  @HttpCode(200)
  @RequirePermissions('perf.calibration.facilitate')
  change(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CalibrationChangeDto) {
    return this.svc.change(ctx, this.user(req), id, dto);
  }

  @Post('calibrations/:id/sign-off')
  @HttpCode(200)
  @RequirePermissions('perf.calibration.facilitate')
  signOff(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.signOff(ctx, this.user(req), id);
  }

  @Get('reports/:kind')
  @RequirePermissions('perf.report.view')
  report(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('kind') kind: string, @Query() q: ReportQueryDto) {
    return this.reports.report(ctx, this.user(req), kind as ReportKind, q.cycle);
  }

  @Get('reports/:kind/csv')
  @RequirePermissions('perf.report.view')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  csv(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('kind') kind: string, @Query() q: ReportQueryDto) {
    return this.reports.csv(ctx, this.user(req), kind as ReportKind, q.cycle);
  }
}
