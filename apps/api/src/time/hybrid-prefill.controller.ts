import { BadRequestException, Body, Controller, Get, HttpCode, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { MODERATE_UPLOAD_THROTTLE, PUBLIC_API_THROTTLE } from '../rate-limit-tiers';
import type { ScopeUser } from '../access/scope';
import { PlanDto, ProviderParamDto, RemindDto, WeekQueryDto } from './hybrid-prefill.dto';
import { HybridService } from './hybrid.service';
import { PrefillService } from './prefill.service';

// TIM-41 Hybrid office days and TIM-43 Timesheet pre-fill from my tools.
//   no key, checked in the service:  /time/hybrid/me (own), /time/hybrid/plan (own, the manager's team or roster.manage
//                                    in scope), /time/hybrid/team (own team), /time/hybrid/compliance and /remind (team or
//                                    attendance.view in scope), /time/tools/* (the signed-in person only)
//   org.settings.manage:             /time/hybrid/policy (read; changes go through PUT /org/settings)
@Controller('time')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class HybridPrefillController {
  constructor(
    private readonly hybrid: HybridService,
    private readonly prefill: PrefillService,
  ) {}

  private user(req: Request) {
    return req.user as ScopeUser;
  }

  @Get('hybrid/me')
  me(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() q: WeekQueryDto) {
    return this.hybrid.me(ctx, this.user(req), q.week);
  }

  @Put('hybrid/plan')
  plan(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: PlanDto) {
    return this.hybrid.plan(ctx, this.user(req), dto);
  }

  @Get('hybrid/team')
  team(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() q: WeekQueryDto) {
    return this.hybrid.team(ctx, this.user(req), q.week);
  }

  @Get('hybrid/compliance')
  compliance(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() q: WeekQueryDto) {
    return this.hybrid.compliance(ctx, this.user(req), q.week);
  }

  @Post('hybrid/remind')
  @HttpCode(200)
  @Throttle(MODERATE_UPLOAD_THROTTLE)
  remind(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: RemindDto) {
    return this.hybrid.remind(ctx, this.user(req), dto.employeeId, dto.week);
  }

  @Get('hybrid/policy')
  @RequirePermissions('org.settings.manage')
  policy(@CurrentTenant() ctx: TenantContext) {
    return this.hybrid.policy(ctx);
  }

  // ------------------------------------------------------------------------------------------ my work tools

  @Get('tools')
  tools(@CurrentTenant() ctx: TenantContext) {
    return this.prefill.connections(ctx);
  }

  @Post('tools/:provider/connect')
  @HttpCode(200)
  @Throttle(MODERATE_UPLOAD_THROTTLE)
  connect(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param() p: ProviderParamDto) {
    return this.prefill.connect(ctx, this.user(req), p.provider);
  }

  @Post('tools/:provider/disconnect')
  @HttpCode(200)
  disconnect(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param() p: ProviderParamDto) {
    return this.prefill.disconnect(ctx, this.user(req), p.provider);
  }

  @Get('tools/suggestions')
  @Throttle(PUBLIC_API_THROTTLE)
  suggestions(@CurrentTenant() ctx: TenantContext, @Query() q: WeekQueryDto) {
    if (!q.week) throw new BadRequestException('Give the week as the date of its Monday.');
    return this.prefill.suggestions(ctx, q.week);
  }
}
