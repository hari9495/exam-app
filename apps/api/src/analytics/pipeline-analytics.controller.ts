import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { TenantContext } from '@exam-platform/shared';
import { PipelineAnalyticsService } from './pipeline-analytics.service';

@Controller('analytics/hiring')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PipelineAnalyticsController {
  constructor(private readonly service: PipelineAnalyticsService) {}

  @Get()
  @RequirePermissions('results:view')
  getHiring(
    @CurrentTenant() tenant: TenantContext,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('jobId') jobId?: string,
  ) {
    // Default window: last 90 days.
    const toDate = to ? new Date(to) : new Date();
    const fromDate = from ? new Date(from) : new Date(toDate.getTime() - 90 * 86_400_000);
    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
      throw new BadRequestException('Invalid from/to date');
    }
    return this.service.getHiring(tenant, { from: fromDate, to: toDate, jobId });
  }
}
