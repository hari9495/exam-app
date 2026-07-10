import { Queue } from 'bullmq';
import Redis from 'ioredis';

export const AI_JOBS_QUEUE = 'AI_JOBS_QUEUE';
export const AI_JOBS_QUEUE_NAME = 'ai-jobs';

export function createAiJobsQueue(connection: Redis): Queue {
  return new Queue(AI_JOBS_QUEUE_NAME, { connection });
}
