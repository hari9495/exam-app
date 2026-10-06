import { ServiceUnavailableException } from '@nestjs/common';
import { LoginProtectionService, accountBlockSeconds, ipBucket } from './login-protection.service';

describe('accountBlockSeconds (progressive delay + temporary lock, YX-IAM-07)', () => {
  it('lets the first two failures through with no wait', () => {
    expect([0, 1, 2].map((n) => accountBlockSeconds(n))).toEqual([0, 0, 0]);
  });

  it('doubles the wait from the 3rd failure, capped at 60 s', () => {
    expect([3, 4, 5, 6, 7, 8, 9].map((n) => accountBlockSeconds(n))).toEqual([1, 2, 4, 8, 16, 32, 60]);
    expect(accountBlockSeconds(15)).toBe(60);
  });

  it('locks for 15 min on the 10th failure, doubling per further lock up to 24 h', () => {
    expect(accountBlockSeconds(10)).toBe(15 * 60);
    expect(accountBlockSeconds(20)).toBe(30 * 60);
    expect(accountBlockSeconds(30)).toBe(60 * 60);
    expect(accountBlockSeconds(1000)).toBe(24 * 60 * 60);
  });

  it('a lock-exempt (break-glass) account gets the delay but never the long lock', () => {
    expect(accountBlockSeconds(10, true)).toBe(60);
    expect(accountBlockSeconds(1000, true)).toBe(60);
  });
});

describe('ipBucket', () => {
  it('keys IPv4 (and IPv4-mapped IPv6) by address', () => {
    expect(ipBucket('203.0.113.9')).toBe('203.0.113.9');
    expect(ipBucket('::ffff:203.0.113.9')).toBe('203.0.113.9');
  });

  it('collapses IPv6 to its /64 so rotating addresses inside one subscriber prefix does not reset the count', () => {
    expect(ipBucket('2001:db8:1:2:aaaa::1')).toBe(ipBucket('2001:db8:1:2:bbbb::2'));
    expect(ipBucket('2001:db8:1:2::1')).not.toBe(ipBucket('2001:db8:1:3::1'));
  });

  it('puts missing or garbage addresses in one shared bucket rather than none', () => {
    expect(ipBucket(null)).toBe('unknown');
    expect(ipBucket('not-an-ip')).toBe('unknown');
  });
});

// The counting itself runs as one Lua script in Redis; its behaviour under a parallel burst is
// proven against a real Redis in test/login-protection.e2e-spec.ts.
describe('LoginProtectionService', () => {
  const attempt = { block: null, failures: 1, lockExempt: false };

  it('refuses sign-in (503) when its counter store is unreachable, instead of allowing unlimited guesses', async () => {
    const down = () => Promise.reject(new Error('ECONNREFUSED'));
    const multi = () => ({ set: multi, incr: multi, exec: down });
    const redis = { pttl: down, del: down, eval: down, exists: down, multi };
    const service = new LoginProtectionService(redis as any);

    await expect(service.check('org', 'a@b.test', '203.0.113.9')).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(service.reserve('org', 'a@b.test', '203.0.113.9')).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(service.registerFailure('org', 'a@b.test', '203.0.113.9', attempt)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('never puts the raw email or device id in a Redis key', async () => {
    const keys: string[] = [];
    const redis = {
      pttl: jest.fn(async (k: string) => (keys.push(k), -2)),
      exists: jest.fn(async (k: string) => (keys.push(k), 0)),
      eval: jest.fn(async (_script: string, _n: number, ...args: string[]) => (keys.push(...args), ['ok', 1])),
    };
    const service = new LoginProtectionService(redis as any);
    await service.check('org', 'victim@corp.test', '203.0.113.9', 'device-secret-value');
    await service.reserve('org', 'victim@corp.test', '203.0.113.9', { deviceId: 'device-secret-value' });
    expect(keys.join(' ')).not.toMatch(/victim|device-secret-value/);
  });

  it('reports a block from the script, and the attempt number otherwise', async () => {
    const redis = { eval: jest.fn().mockResolvedValueOnce(['account', 2500]).mockResolvedValueOnce(['ok', 4]) };
    const service = new LoginProtectionService(redis as any);
    expect(await service.reserve('org', 'a@b.test', null)).toEqual({ block: { scope: 'account', retryAfterSeconds: 3 }, failures: 0, lockExempt: false });
    expect(await service.reserve('org', 'a@b.test', null, { lockExempt: true })).toEqual({ block: null, failures: 4, lockExempt: true });
  });

  it('reports the lock on the 10th reserved failure', async () => {
    const multi = () => ({ set: multi, incr: multi, exec: async () => [[null, 'OK'], [null, 1]] });
    const service = new LoginProtectionService({ multi } as any);
    expect(await service.registerFailure('org', 'a@b.test', null, { block: null, failures: 10, lockExempt: false })).toEqual({ failures: 10, locked: true });
    expect(await service.registerFailure('org', 'a@b.test', null, { block: null, failures: 9, lockExempt: false })).toEqual({ failures: 9, locked: false });
  });
});
