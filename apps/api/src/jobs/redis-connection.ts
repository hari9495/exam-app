import Redis from 'ioredis';

export const REDIS_CONNECTION = 'REDIS_CONNECTION';

export function createRedisConnection(): Redis {
  const url = process.env.REDIS_URL ?? 'redis://localhost:6379';
  // BullMQ's blocking commands require maxRetriesPerRequest: null on the underlying
  // ioredis connection -- without it, BullMQ throws at startup.
  const client = new Redis(url, { maxRetriesPerRequest: null });
  // Nest runs lifecycle hooks on factory-provided values too, and onApplicationShutdown runs after
  // every onModuleDestroy (queues/workers are closed by then). Without this, an open Redis socket
  // keeps the process alive after app.close() / SIGTERM. disconnect() is a no-op on a connection a
  // worker already quit.
  return Object.assign(client, { onApplicationShutdown: () => client.disconnect() });
}
