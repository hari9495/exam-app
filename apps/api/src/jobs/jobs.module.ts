import { Module } from '@nestjs/common';
import { CryptoModule, StorageModule, AuditModule } from '@exam-platform/shared';
import { BillingModule } from '../billing/billing.module';
import { REDIS_CONNECTION, createRedisConnection } from './redis-connection';
import { AI_JOBS_QUEUE, createAiJobsQueue } from './ai-jobs.queue';
import { AI_JOB_PROCESSORS } from './processors/job-processor.interface';
import { EchoProcessor } from './processors/echo.processor';
import { QuestionGenerationClient } from './processors/question-generation.client';
import { AiQuestionGenerationProcessor } from './processors/ai-question-generation.processor';
import { ResumeParseProcessor } from './processors/resume-parse.processor';
import { CandidateFitProcessor } from './processors/candidate-fit.processor';
import { AiJobsWorkerService } from './ai-jobs.worker.service';
import { WEBHOOK_DELIVERIES_QUEUE, createWebhookDeliveriesQueue } from './webhook-deliveries.queue';
import { WebhookDeliveryWorkerService } from './webhook-delivery.worker.service';
import { INTEGRATION_DELIVERIES_QUEUE, createIntegrationDeliveriesQueue } from './integration-deliveries.queue';
import { IntegrationDeliveryWorkerService } from './integration-delivery.worker.service';
import { WebhooksService } from '../webhooks/webhooks.service';
import { JobsService } from './jobs.service';
import { JobsController } from './jobs.controller';

@Module({
  // BillingModule imported explicitly (not @Global) so CandidateFitProcessor / ResumeParseProcessor /
  // AiQuestionGenerationProcessor can inject QuotaService -- see the prod DI crash this exact pattern
  // caused before AuditModule was added here for the same reason.
  imports: [CryptoModule, StorageModule, AuditModule, BillingModule],
  controllers: [JobsController],
  providers: [
    { provide: REDIS_CONNECTION, useFactory: createRedisConnection },
    { provide: AI_JOBS_QUEUE, useFactory: createAiJobsQueue, inject: [REDIS_CONNECTION] },
    { provide: WEBHOOK_DELIVERIES_QUEUE, useFactory: createWebhookDeliveriesQueue, inject: [REDIS_CONNECTION] },
    { provide: INTEGRATION_DELIVERIES_QUEUE, useFactory: createIntegrationDeliveriesQueue, inject: [REDIS_CONNECTION] },
    EchoProcessor,
    QuestionGenerationClient,
    AiQuestionGenerationProcessor,
    ResumeParseProcessor,
    CandidateFitProcessor,
    {
      provide: AI_JOB_PROCESSORS,
      useFactory: (
        echo: EchoProcessor,
        aiQuestionGeneration: AiQuestionGenerationProcessor,
        resumeParse: ResumeParseProcessor,
        candidateFit: CandidateFitProcessor,
      ) => [echo, aiQuestionGeneration, resumeParse, candidateFit],
      inject: [EchoProcessor, AiQuestionGenerationProcessor, ResumeParseProcessor, CandidateFitProcessor],
    },
    AiJobsWorkerService,
    WebhookDeliveryWorkerService,
    IntegrationDeliveryWorkerService,
    JobsService,
    WebhooksService,
  ],
  exports: [JobsService, WebhooksService],
})
export class JobsModule {}
