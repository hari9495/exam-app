import { ServiceUnavailableException } from '@nestjs/common';
import { LoginProtectionService, accountBlockSeconds, ipBucket } from './login-protection.service';

describe('accountBlockSeconds (progressive delay + temporary lock, YX-IAM-07)', () => {
  it('lets the first two failures through with no wait', () => {
    expect([0, 1, 2].map(accountBlockSeconds)).toEqual([0, 0, 0]);
  });

  it('doubles the wait from the 3rd failure, capped at 60 s', () => {
    expect([3, 4, 5, 6, 7, 8, 9].map(accountBlockSeconds)).toEqual([1, 2, 4, 8, 16, 32, 60]);
    expect(accountBlockSeconds(15)).toBe(60);
  });

  it('locks for 15 min on the 10th failure, doubling per further lock up to 24 h', () => {
    expect(accountBlockSeconds(10)).toBe(15 * 60);
    expect(accountBlockSeconds(20)).toBe(30 * 60);
    expect(accountBlockSeconds(30)).toBe(60 * 60);
    expect(accountBlockSeconds(1000)).toBe(24 * 60 * 60);
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

describe('LoginProtectionService fails closed', () => {
  it('refuses sign-in (503) when its counter store is unreachable, instead of allowing unlimited guesses', async () => {
    const down = () => Promise.reject(new Error('ECONNREFUSED'));
    const redis = { pttl: down, del: down, multi: () => ({ incr: () => redis.multi(), expire: () => redis.multi(), set: () => redis.multi(), exec: down }) };
    const service = new LoginProtectionService(redis as any);

    await expect(service.check('org', 'a@b.test', '203.0.113.9')).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(service.registerFailure('org', 'a@b.test', '203.0.113.9')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('never puts the raw email in a Redis key', async () => {
    const keys: string[] = [];
    const redis = { pttl: jest.fn(async (k: string) => (keys.push(k), -2)) };
    await new LoginProtectionService(redis as any).check('org', 'victim@corp.test', '203.0.113.9');
    expect(keys.join(' ')).not.toContain('victim');
  });
});
