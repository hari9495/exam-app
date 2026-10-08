import { Logger } from '@nestjs/common';
import Redis from 'ioredis';

export const REDIS_CONNECTION = 'REDIS_CONNECTION';

const log = new Logger('Jobs');

/**
 * BullMQ queues and workers are event emitters: an 'error' event with no listener (Redis dropped, a lost lock) throws
 * and takes the whole API down. Every queue and worker goes through here so such errors are logged and BullMQ retries.
 */
export function logBullErrors<T>(emitter: T, name: string): T {
  (emitter as unknown as NodeJS.EventEmitter).on('error', (e: Error) => log.error(`Queue ${name}: ${e?.message ?? e}`));
  return emitter;
}

export function createRedisConnection(): Redis {
  const url = process.env.REDIS_URL ?? 'redis://localhost:6379';
  // BullMQ's blocking commands require maxRetriesPerRequest: null on the underlying
  // ioredis connection -- without it, BullMQ throws at startup.
  const client = new Redis(url, { maxRetriesPerRequest: null });
  // ioredis reconnects by itself; without a listener every refused connect is printed as an unhandled error event.
  client.on('error', (e) => log.warn(`Redis: ${e.message}`));
  // Nest runs lifecycle hooks on factory-provided values too, and onApplicationShutdown runs after
  // every onModuleDestroy (queues/workers are closed by then). Without this, an open Redis socket
  // keeps the process alive after app.close() / SIGTERM. disconnect() is a no-op on a connection a
  // worker already quit.
  return Object.assign(client, { onApplicationShutdown: () => client.disconnect() });
}
