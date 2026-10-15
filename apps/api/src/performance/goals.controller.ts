import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import type { ScopeUser } from '../access/scope';
import { CascadeDto, CheckinDto, DropDto, GoalDto, GoalListDto, GoalPeriodDto, PeriodQueryDto, SubmitGoalsDto } from './dto';
import { PerformanceGoalsService } from './goals.service';

// Performance batch PM2 (M06-BUILD-DESIGN §19 "Goals"). Goals are open to the implicit grants (my own goals, my
// team's through the manager chain); the service decides per goal. Periods and the company map need their keys.
@Controller('performance')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PerformanceGoalsController {
  constructor(private readonly goals: PerformanceGoalsService) {}

  private user(req: Request) {
    return req.user as ScopeUser;
  }

  @Get('goal-periods')
  periods(@CurrentTenant() ctx: TenantContext) {
    return this.goals.periods(ctx);
  }

  @Post('goal-periods')
  @RequirePermissions('perf.goal.manage')
  addPeriod(@CurrentTenant() ctx: TenantContext, @Body() dto: GoalPeriodDto) {
    return this.goals.addPeriod(ctx, dto);
  }

  @Post('goal-periods/:id/close')
  @HttpCode(200)
  @RequirePermissions('perf.goal.manage')
  closePeriod(@CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.goals.closePeriod(ctx, id);
  }

  @Get('goals')
  list(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() q: GoalListDto) {
    return this.goals.list(ctx, this.user(req), q.period, q.view, q.employeeId);
  }

  @Get('goal-map')
  @RequirePermissions('perf.goal.view')
  map(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() q: PeriodQueryDto) {
    return this.goals.map(ctx, this.user(req), q.period);
  }

  @Get('goals/align-options')
  alignOptions(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() q: PeriodQueryDto) {
    return this.goals.alignOptions(ctx, this.user(req), q.period);
  }

  @Get('goals/:id')
  get(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.goals.get(ctx, this.user(req), id);
  }

  @Post('goals')
  create(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: GoalDto) {
    return this.goals.create(ctx, this.user(req), dto);
  }

  @Put('goals/:id')
  update(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: GoalDto) {
    return this.goals.update(ctx, this.user(req), id, dto);
  }

  @Post('goals/submit')
  @HttpCode(200)
  submit(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: SubmitGoalsDto) {
    return this.goals.submit(ctx, this.user(req), dto.periodId);
  }

  @Post('goals/:id/checkins')
  checkIn(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CheckinDto) {
    return this.goals.checkIn(ctx, this.user(req), id, dto);
  }

  @Post('goals/:id/drop')
  @HttpCode(200)
  drop(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DropDto) {
    return this.goals.drop(ctx, this.user(req), id, dto.reason);
  }

  @Post('goals/:id/cascade')
  cascade(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CascadeDto) {
    return this.goals.cascade(ctx, this.user(req), id, dto);
  }
}
