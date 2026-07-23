import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequireAnyPermission } from '../rbac/permissions.decorator';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { TenantContext } from '@exam-platform/shared';
import { DashboardService } from './dashboard.service';

const TREND_METRICS = ['candidates', 'invitations', 'attempts', 'pendingGrading'] as const;
const TREND_DAYS = [7, 14, 30] as const;

type TrendMetric = (typeof TREND_METRICS)[number];
type TrendDays = (typeof TREND_DAYS)[number];

@Controller('dashboard')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  @RequireAnyPermission('exam:manage', 'results:view')
  getSummary(@CurrentTenant() tenant: TenantContext) {
    return this.dashboardService.getSummary(tenant);
  }

  @Get('trend')
  @RequireAnyPermission('exam:manage', 'results:view')
  getTrend(@CurrentTenant() tenant: TenantContext, @Query('metric') metric?: string, @Query('days') days?: string) {
    if (!metric || !(TREND_METRICS as readonly string[]).includes(metric)) {
      throw new BadRequestException(`metric must be one of ${TREND_METRICS.join(', ')}`);
    }
    const parsedDays = Number(days);
    const resolvedDays: TrendDays = (TREND_DAYS as readonly number[]).includes(parsedDays) ? (parsedDays as TrendDays) : 14;
    return this.dashboardService.getTrend(tenant, metric as TrendMetric, resolvedDays);
  }
}
