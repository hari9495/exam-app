import { Queue } from 'bullmq';
import Redis from 'ioredis';

export const HRIS_EXPORTS_QUEUE = 'HRIS_EXPORTS_QUEUE';
export const HRIS_EXPORTS_QUEUE_NAME = 'hris-exports';

export function createHrisExportsQueue(connection: Redis): Queue {
  return new Queue(HRIS_EXPORTS_QUEUE_NAME, { connection });
}
