import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequireAnyPermission, RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { CurrentUserId } from '../auth/current-user-id.decorator';
import { HiringRequisitionsService } from './requisitions.service';
import { PlanDto, PlanQueryDto, PlanVersionDto } from './hiring-dto';

// Recruitment batch AT2 (M10-BUILD-DESIGN §18.1): headcount plans (ats.headcount.manage) and the plan lines a
// requisition can draw on (anyone who raises or runs requisitions). Requisitions themselves are jobs (/jobs, AT1).
@Controller('hiring')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class HiringController {
  constructor(private readonly svc: HiringRequisitionsService) {}

  @Get('plans')
  @RequirePermissions('ats.headcount.manage')
  plans(@CurrentTenant() ctx: TenantContext, @Query() q: PlanQueryDto) {
    return this.svc.plans(ctx, q.fy);
  }

  @Post('plans')
  @RequirePermissions('ats.headcount.manage')
  create(@CurrentTenant() ctx: TenantContext, @CurrentUserId() userId: string, @Body() dto: PlanDto) {
    return this.svc.savePlan(ctx, userId, null, dto);
  }

  @Put('plans/:id')
  @RequirePermissions('ats.headcount.manage')
  update(@CurrentTenant() ctx: TenantContext, @CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PlanDto) {
    return this.svc.savePlan(ctx, userId, id, dto);
  }

  @Post('plans/:id/submit')
  @HttpCode(200)
  @RequirePermissions('ats.headcount.manage')
  submit(@CurrentTenant() ctx: TenantContext, @CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PlanVersionDto) {
    return this.svc.submitPlan(ctx, userId, id, dto.version);
  }

  @Get('plan-lines')
  @RequireAnyPermission('ats.headcount.manage', 'ats.requisition.raise', 'pipeline:manage')
  lines(@CurrentTenant() ctx: TenantContext, @Query() q: PlanQueryDto) {
    return this.svc.openLines(ctx, q.departmentId);
  }
}
