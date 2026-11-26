import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import type { ScopeUser } from '../access/scope';
import { CascadeDto, CheckinDto, DecideGoalsDto, DropDto, GoalDto, GoalImportDto, GoalListDto, GoalTemplateDto, GoalPeriodDto, GoalRemindDto, PeriodQueryDto, SubmitGoalsDto, SuggestParentDto } from './dto';
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

  // Batch F item 30 (answer 2575): my own team's people with no goals or goals not updated, and a once-a-day Remind.
  @Get('goals/team-gaps')
  teamGaps(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() q: PeriodQueryDto) {
    return this.goals.teamGaps(ctx, this.user(req), q.period);
  }

  @Post('goals/team-gaps/:employeeId/remind')
  @HttpCode(200)
  remindGap(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('employeeId', ParseUUIDPipe) employeeId: string, @Body() dto: GoalRemindDto) {
    return this.goals.remindGap(ctx, this.user(req), dto.period, employeeId, dto.kind);
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

  /** T2-C item 71 (answer 2844): goal templates; reading is for anyone (the service picks the ones that fit), changing is HR's. */
  @Get('goal-templates')
  goalTemplates(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.goals.goalTemplates(ctx, req.user as ScopeUser);
  }

  @Post('goal-templates')
  @RequirePermissions('perf.setup.manage')
  addGoalTemplate(@CurrentTenant() ctx: TenantContext, @Body() dto: GoalTemplateDto) {
    return this.goals.saveGoalTemplate(ctx, null, dto);
  }

  @Put('goal-templates/:id')
  @RequirePermissions('perf.setup.manage')
  updateGoalTemplate(@CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: GoalTemplateDto) {
    return this.goals.saveGoalTemplate(ctx, id, dto);
  }

  @Delete('goal-templates/:id')
  @RequirePermissions('perf.setup.manage')
  deleteGoalTemplate(@CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.goals.deleteGoalTemplate(ctx, id);
  }

  /** CSV import for holders of the goal-setting key; each row must be in their scope (the service checks). */
  @Post('goals/import')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @RequirePermissions('perf.goal.manage')
  importGoals(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: GoalImportDto) {
    return this.goals.importGoals(ctx, req.user as ScopeUser, dto);
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

  /** PRF-02: the manager approves or sends back a person's goals; the service checks the approval task is theirs. */
  @Post('goals/decide')
  @HttpCode(200)
  decide(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: DecideGoalsDto) {
    return this.goals.decide(ctx, this.user(req), dto);
  }

  /** PRF-03: HR suggests a parent for a person's goal; the owner is notified. */
  @Post('goals/:id/suggest-parent')
  @HttpCode(200)
  @RequirePermissions('perf.goal.manage')
  suggestParent(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SuggestParentDto) {
    return this.goals.suggestParent(ctx, this.user(req), id, dto.parentGoalId);
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
