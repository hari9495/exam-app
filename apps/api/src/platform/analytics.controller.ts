import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUserId } from '../auth/current-user-id.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { PlatformStaffGuard } from './platform-staff.guard';
import { AnalyticsService } from './analytics.service';

// YukthiX console C-8, YX-09: product analytics, counts only. Staff only, on their own platform session with their
// security key, behind the analytics key (staff role: Customer success, answers 1058 and 1086).
@Controller('platform/analytics')
@UseGuards(JwtAuthGuard, PlatformStaffGuard, PermissionsGuard)
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get()
  @RequirePermissions('platform.analytics.view')
  overview(@CurrentUserId() actor: string) {
    return this.analytics.overview(actor);
  }
}
