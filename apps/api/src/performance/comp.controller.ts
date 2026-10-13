import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequireAnyPermission, RequirePermissions } from '../rbac/permissions.decorator';
import { RequireStepUp } from '../auth/step-up.decorator';
import type { ScopeUser } from '../access/scope';
import { VersionDto } from './dto';
import { BudgetsDto, CompCycleDto, EquityQueryDto, MatrixDto, ProposalDto } from './review-dto';
import { PerformanceCompService } from './comp.service';

// Performance batch PM7 (M06-BUILD-DESIGN §19 "Comp"). Matrices, cycles, budgets and apply need perf.comp.manage (for
// the entity; applying also a fresh second sign-in step); finance reads with perf.comp.approve; a manager reads and
// changes their own team's proposals inside a cycle (the service decides); my pay band is mine only.
@Controller('performance')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PerformanceCompController {
  constructor(private readonly svc: PerformanceCompService) {}

  private user(req: Request) {
    return req.user as ScopeUser;
  }

  @Get('comp-matrices')
  @RequirePermissions('perf.comp.manage')
  matrices(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.svc.matrices(ctx, this.user(req));
  }

  @Post('comp-matrices/from-starter')
  @RequirePermissions('perf.comp.manage')
  starter(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.svc.starterMatrix(ctx, this.user(req));
  }

  @Post('comp-matrices')
  @RequirePermissions('perf.comp.manage')
  createMatrix(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: MatrixDto) {
    return this.svc.saveMatrix(ctx, this.user(req), null, dto);
  }

  @Put('comp-matrices/:id')
  @RequirePermissions('perf.comp.manage')
  updateMatrix(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: MatrixDto) {
    return this.svc.saveMatrix(ctx, this.user(req), id, dto);
  }

  @Get('comp-cycles')
  cycles(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.svc.cycles(ctx, this.user(req));
  }

  @Post('comp-cycles')
  @RequirePermissions('perf.comp.manage')
  create(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: CompCycleDto) {
    return this.svc.createCycle(ctx, this.user(req), dto);
  }

  @Put('comp-cycles/:id/budgets')
  @RequirePermissions('perf.comp.manage')
  budgets(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: BudgetsDto) {
    return this.svc.setBudgets(ctx, this.user(req), id, dto);
  }

  @Post('comp-cycles/:id/open')
  @HttpCode(200)
  @RequirePermissions('perf.comp.manage')
  open(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: VersionDto) {
    return this.svc.open(ctx, this.user(req), id, dto.version);
  }

  @Get('comp-cycles/:id/sheet')
  sheet(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.sheet(ctx, this.user(req), id);
  }

  @Put('comp-proposals/:id')
  updateProposal(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ProposalDto) {
    return this.svc.updateProposal(ctx, this.user(req), id, dto);
  }

  @Post('comp-cycles/:id/submit')
  @HttpCode(200)
  submit(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.submit(ctx, this.user(req), id);
  }

  @Post('comp-cycles/:id/apply')
  @HttpCode(200)
  @RequirePermissions('perf.comp.manage')
  @RequireStepUp()
  apply(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: VersionDto) {
    return this.svc.apply(ctx, this.user(req), id, dto.version);
  }

  @Get('comp-cycles/:id/pay-equity')
  @RequireAnyPermission('perf.comp.manage', 'perf.comp.approve')
  payEquity(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Query() q: EquityQueryDto) {
    return this.svc.payEquity(ctx, this.user(req), id, q.dimension);
  }

  @Get('me/pay-band')
  myPayBand(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.svc.myPayBand(ctx, this.user(req));
  }
}
