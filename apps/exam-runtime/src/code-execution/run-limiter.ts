import { Injectable, OnApplicationShutdown, Optional } from '@nestjs/common';
import Redis from 'ioredis';

export const MAX_RUNS_PER_QUESTION = 30;
const RUN_COUNTER_TTL_SECONDS = 86400;

export interface RunCounterStore {
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
}

@Injectable()
export class RunLimiter implements OnApplicationShutdown {
  private readonly store: RunCounterStore;
  // Only a client this class created is its to close; an injected store belongs to the caller.
  private readonly ownedClient?: Redis;

  // RunCounterStore is a TypeScript interface, so Nest's DI has no runtime token to resolve it
  // against — with @Optional(), that's fine: Nest injects undefined here in normal app wiring
  // (no RunCounterStore provider is ever registered in attempt.module.ts), so this constructor
  // always falls through to a real ioredis connection when instantiated by Nest. Unit tests
  // bypass DI entirely and call `new RunLimiter(fakeStore)` directly (see run-limiter.spec.ts).
  constructor(@Optional() store?: RunCounterStore) {
    if (!store) {
      this.ownedClient = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
    }
    this.store = store ?? (this.ownedClient as Redis);
  }

  onApplicationShutdown(): void {
    this.ownedClient?.disconnect();
  }

  async checkAndIncrement(attemptId: string, questionId: string): Promise<{ allowed: boolean; remaining: number }> {
    const key = `code-run:${attemptId}:${questionId}`;
    const count = await this.store.incr(key);
    if (count === 1) {
      await this.store.expire(key, RUN_COUNTER_TTL_SECONDS);
    }
    return { allowed: count <= MAX_RUNS_PER_QUESTION, remaining: Math.max(0, MAX_RUNS_PER_QUESTION - count) };
  }
}
