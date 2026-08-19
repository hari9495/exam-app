import { Queue } from 'bullmq';
import Redis from 'ioredis';

export const INTEGRATION_DELIVERIES_QUEUE = 'INTEGRATION_DELIVERIES_QUEUE';
export const INTEGRATION_DELIVERIES_QUEUE_NAME = 'integration-deliveries';

export function createIntegrationDeliveriesQueue(connection: Redis): Queue {
  return new Queue(INTEGRATION_DELIVERIES_QUEUE_NAME, { connection });
}
