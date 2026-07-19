import { Inject, Injectable } from '@nestjs/common';
import type { CacheItem, CacheProvider } from '@node-saml/node-saml';
import Redis from 'ioredis';
import { REDIS_CONNECTION } from '../jobs/redis-connection';

// TTL matches this app's SAML response validity window -- a request ID only
// needs to be remembered long enough to detect a replay of the SAME
// authentication attempt, not indefinitely.
const REQUEST_ID_TTL_SECONDS = 300;

@Injectable()
export class SamlCacheProvider implements CacheProvider {
  // Injected via the REDIS_CONNECTION string token, matching the existing
  // precedent in JobsModule (ai-jobs.worker.service.ts, webhook-delivery.worker.service.ts)
  // rather than a bare class-token, for consistency with how the rest of the
  // app wires up ioredis connections.
  constructor(@Inject(REDIS_CONNECTION) private readonly redis: Redis) {}

  private key(id: string): string {
    return `saml:inresponseto:${id}`;
  }

  async saveAsync(key: string, value: string): Promise<CacheItem | null> {
    await this.redis.set(this.key(key), value, 'EX', REQUEST_ID_TTL_SECONDS);
    return { createdAt: Date.now(), value };
  }

  async getAsync(key: string): Promise<string | null> {
    return this.redis.get(this.key(key));
  }

  async removeAsync(key: string | null): Promise<string | null> {
    if (key === null) {
      return null;
    }
    const value = await this.redis.get(this.key(key));
    await this.redis.del(this.key(key));
    return value;
  }
}
