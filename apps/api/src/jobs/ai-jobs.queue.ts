import { logBullErrors } from './redis-connection';
import { Queue } from 'bullmq';
import Redis from 'ioredis';

export const AI_JOBS_QUEUE = 'AI_JOBS_QUEUE';
export const AI_JOBS_QUEUE_NAME = 'ai-jobs';

export function createAiJobsQueue(connection: Redis): Queue {
  return logBullErrors(new Queue(AI_JOBS_QUEUE_NAME, { connection }), AI_JOBS_QUEUE_NAME);
}
