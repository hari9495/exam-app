import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequireAnyPermission } from '../rbac/permissions.decorator';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { TenantContext } from '@exam-platform/shared';
import { DashboardService } from './dashboard.service';

const TREND_METRICS = ['candidates', 'invitations', 'attempts', 'pendingGrading'] as const;
const TREND_DAYS = [7, 14, 30, 90] as const;

const PERFORMANCE_LIMITS = ['5', '10', 'all'] as const;
const WINDOWS = ['all', '7d', '14d', '30d', '90d'] as const;

type TrendMetric = (typeof TREND_METRICS)[number];
type TrendDays = (typeof TREND_DAYS)[number];
type PerformanceLimit = 5 | 10 | 'all';
type Window = (typeof WINDOWS)[number];

@Controller('dashboard')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  @RequireAnyPermission('exam:manage', 'results:view')
  getSummary(@CurrentTenant() tenant: TenantContext, @Query('window') window?: string) {
    if (!window || !(WINDOWS as readonly string[]).includes(window)) {
      throw new BadRequestException(`window must be one of ${WINDOWS.join(', ')}`);
    }
    return this.dashboardService.getSummary(tenant, window as Window);
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

  @Get('exam-performance')
  @RequireAnyPermission('exam:manage', 'results:view')
  getExamPerformance(
    @CurrentTenant() tenant: TenantContext,
    @Query('limit') limit?: string,
    @Query('window') window?: string,
  ) {
    if (!limit || !(PERFORMANCE_LIMITS as readonly string[]).includes(limit)) {
      throw new BadRequestException(`limit must be one of ${PERFORMANCE_LIMITS.join(', ')}`);
    }
    if (!window || !(WINDOWS as readonly string[]).includes(window)) {
      throw new BadRequestException(`window must be one of ${WINDOWS.join(', ')}`);
    }
    const resolvedLimit: PerformanceLimit = limit === 'all' ? 'all' : (Number(limit) as 5 | 10);
    return this.dashboardService.getExamPerformance(tenant, resolvedLimit, window as Window);
  }

  @Get('funnel')
  @RequireAnyPermission('exam:manage', 'results:view')
  getFunnel(@CurrentTenant() tenant: TenantContext, @Query('examId') examId?: string, @Query('window') window?: string) {
    if (!examId) {
      throw new BadRequestException('examId query parameter is required');
    }
    if (!window || !(WINDOWS as readonly string[]).includes(window)) {
      throw new BadRequestException(`window must be one of ${WINDOWS.join(', ')}`);
    }
    return this.dashboardService.getFunnel(tenant, examId, window as Window);
  }

  @Get('analytics')
  @RequireAnyPermission('exam:manage', 'results:view')
  getAnalytics(@CurrentTenant() tenant: TenantContext, @Query('window') window?: string) {
    if (!window || !(WINDOWS as readonly string[]).includes(window)) {
      throw new BadRequestException(`window must be one of ${WINDOWS.join(', ')}`);
    }
    return this.dashboardService.getAnalytics(tenant, window as Window);
  }
}
