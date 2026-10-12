import Redis from 'ioredis';

// The per-file BullMQ prefix (bull-prefix.ts) would leave its keys behind in Redis; remove them once the file is done.
afterAll(async () => {
  const prefix = process.env.BULLMQ_PREFIX;
  if (!prefix?.startsWith('e2e-')) return;
  const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', { lazyConnect: true });
  try {
    await redis.connect();
    let cursor = '0';
    do {
      const [next, keys] = await redis.scan(cursor, 'MATCH', `${prefix}:*`, 'COUNT', 500);
      if (keys.length) await redis.del(...keys);
      cursor = next;
    } while (cursor !== '0');
  } catch {
    // Best effort: a test run never fails on cleanup.
  } finally {
    redis.disconnect();
  }
});
