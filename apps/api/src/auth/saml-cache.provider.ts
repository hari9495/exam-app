import { Inject, Injectable } from '@nestjs/common';
import type { CacheItem, CacheProvider } from '@node-saml/node-saml';
import Redis from 'ioredis';
import { REDIS_CONNECTION } from '../jobs/redis-connection';

// TTL matches this app's SAML response validity window -- a request ID only
// needs to be remembered long enough to detect a replay of the SAME
// authentication attempt, not indefinitely.
const REQUEST_ID_TTL_SECONDS = 300;

// What is remembered per AuthnRequest: node-saml's own value (the issue instant) and sha256 of the
// device cookie of the browser that started the sign-in, so the resulting sign-in code can be
// bound to that browser (login CSRF) although the IdP's cross-site POST carries no cookie.
interface Entry {
  v: string;
  d: string | null;
}

// The AuthnRequest IDs node-saml issues and later checks InResponseTo against (replay defence),
// one scope per identity provider. Built per request by SamlStrategy (forRequest).
@Injectable()
export class SamlCacheProvider {
  // Injected via the REDIS_CONNECTION string token, matching the existing
  // precedent in JobsModule (ai-jobs.worker.service.ts, webhook-delivery.worker.service.ts)
  // rather than a bare class-token, for consistency with how the rest of the
  // app wires up ioredis connections.
  constructor(@Inject(REDIS_CONNECTION) private readonly redis: Redis) {}

  // A view scoped to one identity provider. `deviceIdHash`: stored with each new request ID.
  // `onConsume`: receives the device hash stored with the request ID this response answered.
  forRequest(providerId: string, deviceIdHash: string | null = null, onConsume?: (deviceIdHash: string | null) => void): CacheProvider {
    const key = (id: string) => `saml:inresponseto:${providerId}:${id}`;
    const read = (raw: string | null): Entry | null => {
      if (raw === null) return null;
      try {
        return JSON.parse(raw) as Entry;
      } catch {
        return null;
      }
    };
    return {
      saveAsync: async (id: string, value: string): Promise<CacheItem | null> => {
        await this.redis.set(key(id), JSON.stringify({ v: value, d: deviceIdHash } satisfies Entry), 'EX', REQUEST_ID_TTL_SECONDS);
        return { createdAt: Date.now(), value };
      },
      getAsync: async (id: string): Promise<string | null> => read(await this.redis.get(key(id)))?.v ?? null,
      // Atomic (GETDEL): of two concurrent POSTs of one captured response, exactly one consumes the
      // request ID; the other throws, which node-saml turns into a rejected response (it ignores
      // the return value, so a null would not stop a replay).
      removeAsync: async (id: string | null): Promise<string | null> => {
        if (id === null) return null;
        const entry = read(await this.redis.getdel(key(id)));
        if (!entry) throw new Error('InResponseTo was already used');
        onConsume?.(entry.d);
        return entry.v;
      },
    };
  }
}
