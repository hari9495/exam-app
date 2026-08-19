import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
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
  @RequirePermissions('org:manage_billing')
  usage(@CurrentTenant() tenant: TenantContext) {
    return this.usageService.getUsage(tenant);
  }
}
