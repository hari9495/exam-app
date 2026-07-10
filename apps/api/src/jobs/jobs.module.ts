import { Module } from '@nestjs/common';
import { REDIS_CONNECTION, createRedisConnection } from './redis-connection';
import { AI_JOBS_QUEUE, createAiJobsQueue } from './ai-jobs.queue';
import { AI_JOB_PROCESSORS } from './processors/job-processor.interface';
import { EchoProcessor } from './processors/echo.processor';
import { ClaudeQuestionGenerationClient } from './processors/claude-question-generation.client';
import { AiQuestionGenerationProcessor } from './processors/ai-question-generation.processor';
import { AiJobsWorkerService } from './ai-jobs.worker.service';
import { JobsService } from './jobs.service';
import { JobsController } from './jobs.controller';

@Module({
  controllers: [JobsController],
  providers: [
    { provide: REDIS_CONNECTION, useFactory: createRedisConnection },
    { provide: AI_JOBS_QUEUE, useFactory: createAiJobsQueue, inject: [REDIS_CONNECTION] },
    EchoProcessor,
    ClaudeQuestionGenerationClient,
    AiQuestionGenerationProcessor,
    {
      provide: AI_JOB_PROCESSORS,
      useFactory: (echo: EchoProcessor, aiQuestionGeneration: AiQuestionGenerationProcessor) => [echo, aiQuestionGeneration],
      inject: [EchoProcessor, AiQuestionGenerationProcessor],
    },
    AiJobsWorkerService,
    JobsService,
  ],
  exports: [JobsService],
})
export class JobsModule {}
