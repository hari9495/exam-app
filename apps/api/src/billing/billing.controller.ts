import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequireAnyPermission } from '../rbac/permissions.decorator';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { TenantContext } from '@exam-platform/shared';
import { UsageService } from './usage.service';

@Controller('organizations/billing')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class BillingController {
  // ponytail: param named usageService, not usage -- a param named `usage` collides with the
  // `usage()` method below (the parameter-property field shadows the prototype method).
  constructor(private readonly usageService: UsageService) {}

  @Get('usage')
  @RequireAnyPermission('org:manage_billing', 'results:view')
  usage(@CurrentTenant() tenant: TenantContext) {
    return this.usageService.getUsage(tenant);
  }
}
