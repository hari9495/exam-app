import { Queue } from 'bullmq';
import Redis from 'ioredis';

export const WEBHOOK_DELIVERIES_QUEUE = 'WEBHOOK_DELIVERIES_QUEUE';
export const WEBHOOK_DELIVERIES_QUEUE_NAME = 'webhook-deliveries';

export function createWebhookDeliveriesQueue(connection: Redis): Queue {
  return new Queue(WEBHOOK_DELIVERIES_QUEUE_NAME, { connection });
}
