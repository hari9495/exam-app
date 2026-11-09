import { Module } from '@nestjs/common';
import { StorageModule } from '@exam-platform/shared';
import { EmailModule } from '../email/email.module';
import { JobsModule } from '../jobs/jobs.module';
import { ApprovalsModule } from '../approvals/approvals.module';
import { AuthModule } from '../auth/auth.module';
import { WorkflowModule } from '../workflow/workflow.module';
import { PayrollModule } from '../payroll/payroll.module';
import { OffersController } from './offers.controller';
import { PublicOffersController } from './public-offers.controller';
import { OfferBuilderController } from './offer-builder.controller';
import { OffersService } from './offers.service';
import { OfferTemplatesService } from './offer-templates.service';
import { OfferBuilderService } from './offer-builder.service';

@Module({
  // ApprovalsModule -> the offer gate (getChains/isConfigurer/cancelForSubject), same wiring as PipelineModule's
  // requisition gate. HIR-09: WorkflowModule (offers run on the P03 engine), PayrollModule (the CTC breakup),
  // AuthModule (the e-sign one-time code).
  imports: [EmailModule, StorageModule, JobsModule, ApprovalsModule, AuthModule, WorkflowModule, PayrollModule],
  controllers: [OffersController, PublicOffersController, OfferBuilderController],
  providers: [OffersService, OfferTemplatesService, OfferBuilderService],
  exports: [OffersService, OfferBuilderService],
})
export class OffersModule {}
