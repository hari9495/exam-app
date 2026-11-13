import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequireAnyPermission, RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { TenantContext } from '@exam-platform/shared';
import { UsageService } from './usage.service';
import { BillingCheckoutService } from './billing-checkout.service';

// Answer 1971: YukthiX sets the plan; no payment happens here, so the self-serve checkout, plan picker and billing
// portal routes are gone. Stripe's webhook stays for subscriptions that already exist.
@Controller('organizations/billing')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class BillingController {
  // ponytail: param named usageService, not usage -- a param named `usage` collides with the
  // `usage()` method below (the parameter-property field shadows the prototype method).
  constructor(
    private readonly usageService: UsageService,
    private readonly checkout: BillingCheckoutService,
  ) {}

  @Get('usage')
  @RequireAnyPermission('org:manage_billing', 'results:view')
  usage(@CurrentTenant() tenant: TenantContext) {
    return this.usageService.getUsage(tenant);
  }

  @Get('invoices')
  @RequirePermissions('org:manage_billing')
  invoices(@CurrentTenant() tenant: TenantContext) {
    return this.checkout.listInvoices(tenant);
  }
}
