import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequireAnyPermission, RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { CurrentUserId } from '../auth/current-user-id.decorator';
import { TenantContext } from '@exam-platform/shared';
import { UsageService } from './usage.service';
import { BillingCheckoutService } from './billing-checkout.service';
import { CreateCheckoutDto } from './dto/checkout.dto';

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

  // Public, purchasable plans for the self-serve picker (public + wired to a Stripe price).
  @Get('plans')
  @RequirePermissions('org:manage_billing')
  plans(@CurrentTenant() tenant: TenantContext) {
    return this.checkout.listPurchasablePlans(tenant);
  }

  // Start a Stripe-hosted Checkout to subscribe/upgrade; returns the redirect URL.
  @Post('checkout')
  @RequirePermissions('org:manage_billing')
  createCheckout(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Body() dto: CreateCheckoutDto) {
    return this.checkout.createCheckout(tenant, userId, dto.planId);
  }

  // Open the Stripe Billing Portal (change plan, update card, cancel, view invoices).
  @Post('portal')
  @RequirePermissions('org:manage_billing')
  createPortal(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string) {
    return this.checkout.createPortal(tenant, userId);
  }

  @Get('invoices')
  @RequirePermissions('org:manage_billing')
  invoices(@CurrentTenant() tenant: TenantContext) {
    return this.checkout.listInvoices(tenant);
  }
}
