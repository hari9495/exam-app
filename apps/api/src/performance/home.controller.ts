import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import type { ScopeUser } from '../access/scope';
import { PerformanceHomeService } from './home.service';

// PRF-01 Performance home. Open to the implicit grants: each part is what the viewer may already read (their own goals
// and reviews, their team's through the manager chain); HR's company figures need perf.cycle.manage company-wide.
@Controller('performance')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PerformanceHomeController {
  constructor(private readonly svc: PerformanceHomeService) {}

  @Get('home')
  home(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.svc.home(ctx, req.user as ScopeUser);
  }
}
