import { Module } from '@nestjs/common';
import { EmailModule } from '../email/email.module';
import { UsageService } from './usage.service';
import { QuotaService } from './quota.service';
import { BillingController } from './billing.controller';
import { PlansService } from './plans.service';
import { PlansController } from './plans.controller';
import { StripeClient } from './stripe.client';
import { BillingCheckoutService } from './billing-checkout.service';
import { StripeWebhookController } from './stripe-webhook.controller';

@Module({
  imports: [EmailModule], // QuotaService injects EmailService
  controllers: [BillingController, PlansController, StripeWebhookController],
  providers: [UsageService, QuotaService, PlansService, StripeClient, BillingCheckoutService],
  exports: [UsageService, QuotaService], // consumed by processors / other modules for enforcement
})
export class BillingModule {}
