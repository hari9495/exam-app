import Redis from 'ioredis';

export const REDIS_CONNECTION = 'REDIS_CONNECTION';

export function createRedisConnection(): Redis {
  const url = process.env.REDIS_URL ?? 'redis://localhost:6379';
  // BullMQ's blocking commands require maxRetriesPerRequest: null on the underlying
  // ioredis connection -- without it, BullMQ throws at startup.
  return new Redis(url, { maxRetriesPerRequest: null });
}
