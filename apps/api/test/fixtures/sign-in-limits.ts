import Redis from 'ioredis';

// Each e2e file signs in from its database's own loopback address (fixtures/e2e-database.ts). Wrong-password and
// wrong-code tests in earlier files of the same run add to that address's counters (30 failures in 15 min lock it for
// 15 min; OTP codes per address per hour), so a later file could see 429 on every sign-in, then pass alone once the
// lock ran out. Each file starts with its own address's counters cleared; no limit changes, and other databases'
// addresses (other worktrees on the same Redis) are never touched.
beforeAll(async () => {
  const ip = process.env.E2E_CLIENT_IP;
  if (!ip) return;
  const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', { lazyConnect: true });
  try {
    await redis.connect();
    await redis.del(`auth:lp:ip:fail:${ip}`, `auth:lp:ip:block:${ip}`, `auth:otp:ip:${ip}`);
  } catch {
    // Best effort: without Redis the suites fail on their own, with a clearer message.
  } finally {
    redis.disconnect();
  }
});
