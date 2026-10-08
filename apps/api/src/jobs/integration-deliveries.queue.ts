import { logBullErrors } from './redis-connection';
import { Queue } from 'bullmq';
import Redis from 'ioredis';

export const INTEGRATION_DELIVERIES_QUEUE = 'INTEGRATION_DELIVERIES_QUEUE';
export const INTEGRATION_DELIVERIES_QUEUE_NAME = 'integration-deliveries';

export function createIntegrationDeliveriesQueue(connection: Redis): Queue {
  return logBullErrors(new Queue(INTEGRATION_DELIVERIES_QUEUE_NAME, { connection }), INTEGRATION_DELIVERIES_QUEUE_NAME);
}
