import { Module } from '@nestjs/common';
import { EmailModule } from '../email/email.module';
import { UsageService } from './usage.service';
import { QuotaService } from './quota.service';
import { BillingController } from './billing.controller';

@Module({
  imports: [EmailModule], // QuotaService injects EmailService
  controllers: [BillingController],
  providers: [UsageService, QuotaService],
  exports: [UsageService, QuotaService], // consumed by processors / other modules for enforcement
})
export class BillingModule {}
