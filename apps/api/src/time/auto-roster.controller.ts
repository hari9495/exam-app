import { Body, Controller, Get, HttpCode, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { MODERATE_UPLOAD_THROTTLE, STRICT_AI_GENERATE_THROTTLE } from '../rate-limit-tiers';
import type { ScopeUser } from '../access/scope';
import { AutoRosterQueryDto, DemandDto, GenerateDto } from './auto-roster.dto';
import { AutoRosterService } from './auto-roster.service';

// TIM-34 Auto-roster. No route key: every check is in the service. A planner only (a manager's own team, or
// roster.manage in scope), at a location where they plan someone; another company's or an unplanned location: 404;
// someone who plans no one: 403; changes never while acting for someone else (403).
//   GET  /time/auto-roster?locationId&week   demand, the latest run's result, the week's draft
//   PUT  /time/auto-roster/demand            people needed per shift and weekday (audited before → after)
//   POST /time/auto-roster/generate          drafts the week's empty days (strict throttle: it is costly)
// Publishing is the roster's own POST /time/roster/publish, which checks every rule again.
@Controller('time/auto-roster')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AutoRosterController {
  constructor(private readonly auto: AutoRosterService) {}

  @Get()
  overview(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() q: AutoRosterQueryDto) {
    return this.auto.overview(ctx, req.user as ScopeUser, q);
  }

  @Put('demand')
  @Throttle(MODERATE_UPLOAD_THROTTLE)
  demand(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: DemandDto) {
    return this.auto.setDemand(ctx, req.user as ScopeUser, dto);
  }

  @Post('generate')
  @HttpCode(200)
  @Throttle(STRICT_AI_GENERATE_THROTTLE)
  generate(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: GenerateDto) {
    return this.auto.generate(ctx, req.user as ScopeUser, dto);
  }
}
