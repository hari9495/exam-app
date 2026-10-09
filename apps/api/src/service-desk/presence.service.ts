import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CONNECTION } from '../jobs/redis-connection';

// YX-SD-07 collision warning (US-B-090): each open ticket screen says "I am here (typing or not)" every 15 seconds;
// the answer is everyone else seen in the last 30 seconds. Kept in Redis only, never in the database.
// ponytail: polling; socket.io presence (D1) arrives with live chat in 3b-2 and can replace this call.

const TTL_SECONDS = 30;

@Injectable()
export class PresenceService {
  constructor(@Inject(REDIS_CONNECTION) private readonly redis: Redis) {}

  async beat(organizationId: string, ticketId: string, user: { id: string; name: string }, typing: boolean) {
    const key = `sd:presence:${organizationId}:${ticketId}`;
    const now = Date.now();
    await this.redis.multi().hset(key, user.id, JSON.stringify({ name: user.name, typing, at: now })).expire(key, TTL_SECONDS).exec();
    const all = await this.redis.hgetall(key);
    return Object.entries(all)
      .map(([userId, v]) => ({ userId, ...(JSON.parse(v) as { name: string; typing: boolean; at: number }) }))
      .filter((p) => p.userId !== user.id && now - p.at < TTL_SECONDS * 1000)
      .map(({ userId, name, typing }) => ({ userId, name, typing }));
  }
}
