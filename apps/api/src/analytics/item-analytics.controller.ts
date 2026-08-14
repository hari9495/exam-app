import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { ItemAnalyticsService } from './item-analytics.service';

@Controller('analytics/questions')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ItemAnalyticsController {
  constructor(private readonly analytics: ItemAnalyticsService) {}

  // Declared BEFORE :id so the literal path is not swallowed by the parameter route.
  @Get('flagged')
  @RequirePermissions('question_bank:manage')
  flagged(@CurrentTenant() tenant: TenantContext) {
    return this.analytics.flagged(tenant);
  }

  @Get(':id')
  @RequirePermissions('question_bank:manage')
  forQuestion(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.analytics.forQuestion(tenant, id);
  }
}
