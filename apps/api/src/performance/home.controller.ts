import { Controller, Get, ParseUUIDPipe, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import type { ScopeUser } from '../access/scope';
import { PerformanceHomeService } from './home.service';
import { PerformanceExpectationsService } from './expectations.service';

// PRF-01 Performance home. Open to the implicit grants: each part is what the viewer may already read (their own goals
// and reviews, their team's through the manager chain); HR's company figures need perf.cycle.manage company-wide.
@Controller('performance')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PerformanceHomeController {
  constructor(
    private readonly svc: PerformanceHomeService,
    private readonly expected: PerformanceExpectationsService,
  ) {}

  @Get('home')
  home(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.svc.home(ctx, req.user as ScopeUser);
  }

  /** T2-C item 68 (answer 2842): What is expected of me, read-only; a manager reads it for a report (the service decides). */
  @Get('expectations')
  expectations(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query('employeeId', new ParseUUIDPipe({ optional: true })) employeeId?: string) {
    return this.expected.expectations(ctx, req.user as ScopeUser, employeeId);
  }
}
