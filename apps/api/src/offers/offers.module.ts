import { Module } from '@nestjs/common';
import { DocumentsModule } from '../documents/documents.module';
import { StorageModule } from '@exam-platform/shared';
import { EmailModule } from '../email/email.module';
import { JobsModule } from '../jobs/jobs.module';
import { ApprovalsModule } from '../approvals/approvals.module';
import { AuthModule } from '../auth/auth.module';
import { WorkflowModule } from '../workflow/workflow.module';
import { PayrollModule } from '../payroll/payroll.module';
import { InternalApplicationsModule } from '../internal-applications/internal-applications.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OffersController } from './offers.controller';
import { PublicOffersController } from './public-offers.controller';
import { OfferBuilderController } from './offer-builder.controller';
import { OffersService } from './offers.service';
import { OfferTemplatesService } from './offer-templates.service';
import { OfferBuilderService } from './offer-builder.service';
import { OfferBatchService } from './offer-batch.service';
import { OfferBatchController } from './offer-batch.controller';
import { OFFER_BATCHES_QUEUE, OfferBatchWorker, createOfferBatchesQueue } from './offer-batch.worker';
import { REDIS_CONNECTION, createRedisConnection } from '../jobs/redis-connection';

@Module({
  // ApprovalsModule -> the offer gate (getChains/isConfigurer/cancelForSubject), same wiring as PipelineModule's
  // requisition gate. HIR-09: WorkflowModule (offers run on the P03 engine), PayrollModule (the CTC breakup),
  // AuthModule (the e-sign one-time code).
  imports: [EmailModule, StorageModule, JobsModule, ApprovalsModule, AuthModule, WorkflowModule, PayrollModule, NotificationsModule, InternalApplicationsModule, DocumentsModule],
  controllers: [OffersController, PublicOffersController, OfferBuilderController, OfferBatchController],
  providers: [
    OffersService,
    OfferTemplatesService,
    OfferBuilderService,
    OfferBatchService,
    // Answer 405: bulk offers on a job queue.
    { provide: REDIS_CONNECTION, useFactory: createRedisConnection },
    { provide: OFFER_BATCHES_QUEUE, useFactory: createOfferBatchesQueue, inject: [REDIS_CONNECTION] },
    OfferBatchWorker,
  ],
  exports: [OffersService, OfferBuilderService],
})
export class OffersModule {}
