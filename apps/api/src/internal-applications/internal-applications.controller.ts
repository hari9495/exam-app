import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { CurrentUserId } from '../auth/current-user-id.decorator';
import { TenantContext } from '@exam-platform/shared';
import { InternalApplicationsService } from './internal-applications.service';
import { ApplyInternalDto } from './dto/internal-application.dto';

// Internal-mobility self-apply. All routes are open to ANY authenticated staff member (PermissionsGuard
// is a no-op without @RequirePermissions) -- internal mobility is a self-service benefit for every
// employee, not a recruiter tool. Internal applicants surface in the normal pipeline board (tagged
// enteredVia='internal'), so no separate recruiter route is needed.
@Controller('internal-applications')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class InternalApplicationsController {
  constructor(private readonly internal: InternalApplicationsService) {}

  @Get('jobs')
  jobs(@CurrentTenant() tenant: TenantContext) {
    return this.internal.openJobs(tenant);
  }

  @Post()
  apply(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Body() dto: ApplyInternalDto) {
    return this.internal.apply(tenant, userId, dto);
  }

  @Get('mine')
  mine(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string) {
    return this.internal.myApplications(tenant, userId);
  }
}
