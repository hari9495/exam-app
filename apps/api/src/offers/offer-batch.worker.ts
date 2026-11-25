import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import { REDIS_CONNECTION, bullOpts, logBullErrors } from '../jobs/redis-connection';
import type { ScopeUser } from '../access/scope';
import { OfferBatchService } from './offer-batch.service';

// Answer 405: bulk offers run in the background, one job per batch (the job id is the batch id, so a retry of the same
// batch key never runs it twice at once). The rows run exactly as before, one by one, each with every single-offer rule.
export const OFFER_BATCHES_QUEUE = 'OFFER_BATCHES_QUEUE';
export const OFFER_BATCHES_QUEUE_NAME = 'offer-batches';
export interface OfferBatchJob {
  batchId: string;
  organizationId: string;
  user: ScopeUser;
}

export function createOfferBatchesQueue(connection: Redis): Queue<OfferBatchJob> {
  return logBullErrors(new Queue<OfferBatchJob>(OFFER_BATCHES_QUEUE_NAME, bullOpts(connection)), OFFER_BATCHES_QUEUE_NAME);
}

@Injectable()
export class OfferBatchWorker implements OnModuleDestroy {
  private readonly logger = new Logger(OfferBatchWorker.name);
  private readonly worker: Worker<OfferBatchJob>;

  constructor(
    @Inject(REDIS_CONNECTION) connection: Redis,
    private readonly batches: OfferBatchService,
  ) {
    this.worker = logBullErrors(
      new Worker<OfferBatchJob>(OFFER_BATCHES_QUEUE_NAME, (job) => this.batches.runRows({ organizationId: job.data.organizationId, isSuperAdmin: false }, job.data.user, job.data.batchId), bullOpts(connection)),
      OFFER_BATCHES_QUEUE_NAME,
    );
    this.worker.on('failed', (job, err) => this.logger.error(`offer batch ${job?.data.batchId} stopped: ${err?.message}`));
  }

  async onModuleDestroy() {
    await this.worker.close();
  }
}
