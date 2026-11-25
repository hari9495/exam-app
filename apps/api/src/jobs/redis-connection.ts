import { Logger } from '@nestjs/common';
import Redis from 'ioredis';

export const REDIS_CONNECTION = 'REDIS_CONNECTION';

const log = new Logger('Jobs');

/**
 * BullMQ queues and workers are event emitters: an 'error' event with no listener (Redis dropped, a lost lock) throws
 * and takes the whole API down. Every queue and worker goes through here so such errors are logged and BullMQ retries.
 */
export function logBullErrors<T>(emitter: T, name: string): T {
  type Bull = NodeJS.EventEmitter & {
    close(...args: unknown[]): Promise<void>;
    connection?: NodeJS.EventEmitter;
    blockingConnection?: NodeJS.EventEmitter;
    onModuleDestroy?: () => Promise<void>;
  };
  const bull = emitter as unknown as Bull;
  bull.on('error', (e: Error) => log.error(`Queue ${name}: ${e?.message ?? e}`));
  // close() strips every listener from BullMQ's internal connections (removeAllListeners), but one still
  // connecting when the app stops rejects later, once the shared Redis connection is closed, and emits 'error'
  // with nobody listening: an unhandled error. Whatever strips them, an 'error' listener stays; at shutdown
  // that rejection is expected.
  for (const c of [bull.connection, bull.blockingConnection]) {
    if (!c) continue;
    const strip = c.removeAllListeners.bind(c);
    const afterClose = (e: Error) => log.debug(`Queue ${name} after close: ${e?.message ?? e}`);
    c.removeAllListeners = (...args: Parameters<NodeJS.EventEmitter['removeAllListeners']>) => strip(...args).on('error', afterClose);
  }
  // Queues provided by a factory have no owner to close them: Nest runs this hook on factory values, before
  // the shared connection's onApplicationShutdown. For queues a service owns, a second close is a no-op.
  if (typeof bull.close === 'function') bull.onModuleDestroy ??= () => bull.close();
  return emitter;
}

/**
 * Options for every BullMQ queue and worker. BULLMQ_PREFIX unset keeps BullMQ's own key prefix ("bull"), so production
 * is unchanged; the e2e bootstrap sets one per test file so parallel test apps never take each other's jobs.
 */
export function bullOpts(connection: Redis): { connection: Redis; prefix?: string } {
  const prefix = process.env.BULLMQ_PREFIX;
  return prefix ? { connection, prefix } : { connection };
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

/**
 * Resolves once a Redis client is connected, or after `ms` without it. A command sent before the connection is ready
 * fails (offline queue off), or times out (the sign-in stores' 2 s command timeout) when connecting is slow, and the
 * sign-in stores fail closed with 503: a fresh API (or e2e test app) could refuse its first sign-ins. Waiting at start
 * closes that gap; after `ms` the app starts anyway (it is designed to run without Redis) and each command keeps its own
 * fail-closed or fail-open handling for a real outage.
 */
export function whenReady(client: Pick<Redis, 'status' | 'once' | 'off'>, ms = 10_000): Promise<void> {
  if (client.status === 'ready') return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      client.off('ready', done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    client.once('ready', done);
  });
}
