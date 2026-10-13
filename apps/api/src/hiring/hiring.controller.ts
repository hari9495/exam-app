import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequireAnyPermission, RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { CurrentUserId } from '../auth/current-user-id.decorator';
import { HiringRequisitionsService } from './requisitions.service';
import { CareersEntityDto, ConsentNoticeDto, RecruitingCostDto, PlanDto, PlanQueryDto, PlanVersionDto } from './hiring-dto';
import { CareersAdminService } from './careers-admin.service';

// Recruitment batch AT2 (M10-BUILD-DESIGN §18.1): headcount plans (ats.headcount.manage) and the plan lines a
// requisition can draw on (anyone who raises or runs requisitions). Requisitions themselves are jobs (/jobs, AT1).
@Controller('hiring')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class HiringController {
  constructor(
    private readonly svc: HiringRequisitionsService,
    private readonly careers: CareersAdminService,
  ) {}

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

  // AT3: careers site settings (the same key as the company's other careers settings).
  @Get('consent-notices')
  @RequirePermissions('org:manage_settings')
  notices(@CurrentTenant() ctx: TenantContext) {
    return this.careers.notices(ctx);
  }

  @Post('consent-notices')
  @RequirePermissions('org:manage_settings')
  publishNotice(@CurrentTenant() ctx: TenantContext, @Body() dto: ConsentNoticeDto) {
    return this.careers.publishNotice(ctx, dto);
  }

  @Get('careers-entities')
  @RequirePermissions('org:manage_settings')
  entities(@CurrentTenant() ctx: TenantContext) {
    return this.careers.entities(ctx);
  }

  @Put('careers-entities/:legalEntityId')
  @RequirePermissions('org:manage_settings')
  saveEntity(@CurrentTenant() ctx: TenantContext, @Param('legalEntityId', ParseUUIDPipe) id: string, @Body() dto: CareersEntityDto) {
    return this.careers.saveEntity(ctx, id, dto);
  }

  @Delete('careers-entities/:legalEntityId')
  @RequirePermissions('org:manage_settings')
  removeEntity(@CurrentTenant() ctx: TenantContext, @Param('legalEntityId', ParseUUIDPipe) id: string) {
    return this.careers.removeEntity(ctx, id);
  }

  @Get('costs')
  @RequirePermissions('org:manage_settings')
  costs(@CurrentTenant() ctx: TenantContext) {
    return this.careers.costs(ctx);
  }

  @Post('costs')
  @RequirePermissions('org:manage_settings')
  addCost(@CurrentTenant() ctx: TenantContext, @Body() dto: RecruitingCostDto) {
    return this.careers.addCost(ctx, dto);
  }
}
