import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Job, Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import { TenantPrismaService } from '@exam-platform/shared';
import { REDIS_CONNECTION } from './redis-connection';
import { AI_JOBS_QUEUE, AI_JOBS_QUEUE_NAME } from './ai-jobs.queue';
import { AI_JOB_PROCESSORS, JobProcessor } from './processors/job-processor.interface';

interface AiJobPayload {
  aiJobId: string;
  organizationId: string;
  type: string;
}

@Injectable()
export class AiJobsWorkerService implements OnModuleDestroy {
  private readonly logger = new Logger(AiJobsWorkerService.name);
  private readonly worker: Worker;
  private readonly processorsByType: Map<string, JobProcessor>;

  constructor(
    @Inject(REDIS_CONNECTION) private readonly connection: Redis,
    @Inject(AI_JOBS_QUEUE) private readonly queue: Queue,
    private readonly tenantPrisma: TenantPrismaService,
    @Inject(AI_JOB_PROCESSORS) processors: JobProcessor[],
  ) {
    this.processorsByType = new Map(processors.map((processor) => [processor.type, processor]));
    this.worker = new Worker(AI_JOBS_QUEUE_NAME, (job) => this.handle(job), { connection: this.connection });
  }

  private async handle(job: Job<AiJobPayload>): Promise<unknown> {
    const { aiJobId, organizationId, type } = job.data;
    const context = { organizationId, isSuperAdmin: false };

    const aiJob = await this.tenantPrisma.forTenant(context, (tx) =>
      tx.aiJob.update({ where: { id: aiJobId }, data: { status: 'processing' } }),
    );

    const processor = this.processorsByType.get(type);
    if (!processor) {
      const error = `No processor registered for job type "${type}"`;
      this.logger.error(error);
      await this.tenantPrisma.forTenant(context, (tx) =>
        tx.aiJob.update({ where: { id: aiJobId }, data: { status: 'failed', error } }),
      );
      throw new Error(error);
    }

    try {
      const output = await processor.process(JSON.parse(aiJob.inputJson));
      await this.tenantPrisma.forTenant(context, (tx) =>
        tx.aiJob.update({
          where: { id: aiJobId },
          data: { status: 'completed', outputJson: JSON.stringify(output) },
        }),
      );
      return output;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`AI job ${aiJobId} (type "${type}") failed: ${message}`);
      await this.tenantPrisma.forTenant(context, (tx) =>
        tx.aiJob.update({ where: { id: aiJobId }, data: { status: 'failed', error: message } }),
      );
      throw error;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker.close();
    await this.queue.close();
    await this.connection.quit();
  }
}
