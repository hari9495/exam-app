import { Module } from '@nestjs/common';
import { StorageModule } from '@exam-platform/shared';
import { EmailModule } from '../email/email.module';
import { JobsModule } from '../jobs/jobs.module';
import { ApprovalsModule } from '../approvals/approvals.module';
import { OffersController } from './offers.controller';
import { PublicOffersController } from './public-offers.controller';
import { OffersService } from './offers.service';
import { OfferTemplatesService } from './offer-templates.service';

@Module({
  // ApprovalsModule -> the offer gate (getChains/submit/isConfigurer/cancelForSubject), same
  // wiring as PipelineModule's requisition gate.
  imports: [EmailModule, StorageModule, JobsModule, ApprovalsModule],
  controllers: [OffersController, PublicOffersController],
  providers: [OffersService, OfferTemplatesService],
  exports: [OffersService],
})
export class OffersModule {}
