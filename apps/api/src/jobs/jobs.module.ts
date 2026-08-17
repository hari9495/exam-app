import { Module } from '@nestjs/common';
import { CryptoModule, StorageModule } from '@exam-platform/shared';
import { REDIS_CONNECTION, createRedisConnection } from './redis-connection';
import { AI_JOBS_QUEUE, createAiJobsQueue } from './ai-jobs.queue';
import { AI_JOB_PROCESSORS } from './processors/job-processor.interface';
import { EchoProcessor } from './processors/echo.processor';
import { QuestionGenerationClient } from './processors/question-generation.client';
import { AiQuestionGenerationProcessor } from './processors/ai-question-generation.processor';
import { ResumeParseProcessor } from './processors/resume-parse.processor';
import { AiJobsWorkerService } from './ai-jobs.worker.service';
import { WEBHOOK_DELIVERIES_QUEUE, createWebhookDeliveriesQueue } from './webhook-deliveries.queue';
import { WebhookDeliveryWorkerService } from './webhook-delivery.worker.service';
import { WebhooksService } from '../webhooks/webhooks.service';
import { JobsService } from './jobs.service';
import { JobsController } from './jobs.controller';

@Module({
  imports: [CryptoModule, StorageModule],
  controllers: [JobsController],
  providers: [
    { provide: REDIS_CONNECTION, useFactory: createRedisConnection },
    { provide: AI_JOBS_QUEUE, useFactory: createAiJobsQueue, inject: [REDIS_CONNECTION] },
    { provide: WEBHOOK_DELIVERIES_QUEUE, useFactory: createWebhookDeliveriesQueue, inject: [REDIS_CONNECTION] },
    EchoProcessor,
    QuestionGenerationClient,
    AiQuestionGenerationProcessor,
    ResumeParseProcessor,
    {
      provide: AI_JOB_PROCESSORS,
      useFactory: (echo: EchoProcessor, aiQuestionGeneration: AiQuestionGenerationProcessor, resumeParse: ResumeParseProcessor) => [
        echo,
        aiQuestionGeneration,
        resumeParse,
      ],
      inject: [EchoProcessor, AiQuestionGenerationProcessor, ResumeParseProcessor],
    },
    AiJobsWorkerService,
    WebhookDeliveryWorkerService,
    JobsService,
    WebhooksService,
  ],
  exports: [JobsService, WebhooksService],
})
export class JobsModule {}
