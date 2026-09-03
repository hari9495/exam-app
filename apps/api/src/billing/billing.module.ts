import { Module } from '@nestjs/common';
import { EmailModule } from '../email/email.module';
import { UsageService } from './usage.service';
import { QuotaService } from './quota.service';
import { BillingController } from './billing.controller';
import { PlansService } from './plans.service';
import { PlansController } from './plans.controller';

@Module({
  imports: [EmailModule], // QuotaService injects EmailService
  controllers: [BillingController, PlansController],
  providers: [UsageService, QuotaService, PlansService],
  exports: [UsageService, QuotaService], // consumed by processors / other modules for enforcement
})
export class BillingModule {}
