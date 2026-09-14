import { Queue } from 'bullmq';
import Redis from 'ioredis';

// Mirrors apps/api/src/hris/hris-exports.queue.ts. One job per batch; the job data carries the
// resolved pipeline-entry ids plus the org context so the worker can rebuild a tenant context.
export const CANDIDATE_EMAIL_BATCHES_QUEUE = 'CANDIDATE_EMAIL_BATCHES_QUEUE';
export const CANDIDATE_EMAIL_BATCHES_QUEUE_NAME = 'candidate-email-batches';

export function createCandidateEmailBatchesQueue(connection: Redis): Queue {
  return new Queue(CANDIDATE_EMAIL_BATCHES_QUEUE_NAME, { connection });
}
