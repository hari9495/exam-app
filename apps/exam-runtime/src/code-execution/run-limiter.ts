import { Injectable, Optional } from '@nestjs/common';
import Redis from 'ioredis';

export const MAX_RUNS_PER_QUESTION = 30;
const RUN_COUNTER_TTL_SECONDS = 86400;

export interface RunCounterStore {
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
}

@Injectable()
export class RunLimiter {
  private readonly store: RunCounterStore;

  // RunCounterStore is a TypeScript interface, so Nest's DI has no runtime token to resolve it
  // against — with @Optional(), that's fine: Nest injects undefined here in normal app wiring
  // (no RunCounterStore provider is ever registered in attempt.module.ts), so this constructor
  // always falls through to a real ioredis connection when instantiated by Nest. Unit tests
  // bypass DI entirely and call `new RunLimiter(fakeStore)` directly (see run-limiter.spec.ts).
  constructor(@Optional() store?: RunCounterStore) {
    this.store = store ?? new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
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
