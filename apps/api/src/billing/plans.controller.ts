import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { CurrentUserId } from '../auth/current-user-id.decorator';
import { TenantContext } from '@exam-platform/shared';
import { PlansService } from './plans.service';
import { UpsertPlanDto, AssignPlanDto } from './dto/plan.dto';

@Controller('platform')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PlansController {
  constructor(private readonly plans: PlansService) {}

  @Get('plans')
  @RequirePermissions('platform:manage_organizations')
  list() { return this.plans.list(); }

  @Post('plans')
  @RequirePermissions('platform:manage_organizations')
  create(@CurrentTenant() t: TenantContext, @CurrentUserId() uid: string, @Body() dto: UpsertPlanDto) { return this.plans.create(t, uid, dto); }

  @Patch('plans/:id')
  @RequirePermissions('platform:manage_organizations')
  update(@CurrentTenant() t: TenantContext, @CurrentUserId() uid: string, @Param('id') id: string, @Body() dto: UpsertPlanDto) { return this.plans.update(t, uid, id, dto); }

  @Patch('organizations/:id/plan')
  @RequirePermissions('platform:manage_organizations')
  assign(@CurrentTenant() t: TenantContext, @CurrentUserId() uid: string, @Param('id') id: string, @Body() dto: AssignPlanDto) { return this.plans.assignToOrg(t, uid, id, dto.planId); }
}
