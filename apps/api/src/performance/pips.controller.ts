import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import type { ScopeUser } from '../access/scope';
import { PipAcknowledgeDto, PipCheckinDto, PipExitDto, PipListQueryDto, PipOutcomeDto, PipProposeDto } from './review-dto';
import { PerformancePipsService } from './pips.service';

// Performance batch PM8 (M06-BUILD-DESIGN §19 "PIPs"). A plan is about one person: the employee, their manager chain and
// HR in scope (perf.pip.manage) read it, and the service decides each action; outcomes, letters and the exit link are
// HR's (perf.pip.manage); the exit itself also needs M01's lifecycle.exit.manage, checked by M01.
@Controller('performance')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PerformancePipsController {
  constructor(private readonly svc: PerformancePipsService) {}

  private user(req: Request) {
    return req.user as ScopeUser;
  }

  @Get('pips')
  list(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() q: PipListQueryDto) {
    return this.svc.list(ctx, this.user(req), q.view ?? 'team', q.legalEntityId);
  }

  @Post('pips')
  propose(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: PipProposeDto) {
    return this.svc.propose(ctx, this.user(req), dto);
  }

  @Get('pips/:id')
  get(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.get(ctx, this.user(req), id);
  }

  @Post('pips/:id/acknowledge')
  @HttpCode(200)
  acknowledge(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PipAcknowledgeDto) {
    return this.svc.acknowledge(ctx, this.user(req), id, dto.comment, dto.version);
  }

  @Post('pips/:id/checkins')
  @HttpCode(200)
  checkin(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PipCheckinDto) {
    return this.svc.checkin(ctx, this.user(req), id, dto);
  }

  @Post('pips/:id/letter')
  @HttpCode(200)
  @RequirePermissions('perf.pip.manage')
  letter(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.letter(ctx, this.user(req), id);
  }

  @Post('pips/:id/outcome')
  @HttpCode(200)
  @RequirePermissions('perf.pip.manage')
  outcome(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PipOutcomeDto) {
    return this.svc.outcome(ctx, this.user(req), id, dto);
  }

  @Post('pips/:id/start-exit')
  @HttpCode(200)
  @RequirePermissions('perf.pip.manage', 'lifecycle.exit.manage')
  startExit(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PipExitDto) {
    return this.svc.startExit(ctx, this.user(req), id, dto);
  }
}
