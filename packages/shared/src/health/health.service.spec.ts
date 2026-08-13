import { HealthService } from './health.service';

const ok = () => Promise.resolve(1);
const fail = () => Promise.reject(new Error('down'));

describe('HealthService', () => {
  it('returns true when every dependency responds', async () => {
    await expect(new HealthService({ checkDb: ok, checkRedis: ok }).check()).resolves.toBe(true);
  });

  it('returns false when the database is down', async () => {
    await expect(new HealthService({ checkDb: fail, checkRedis: ok }).check()).resolves.toBe(false);
  });

  it('returns false when redis is down', async () => {
    await expect(new HealthService({ checkDb: ok, checkRedis: fail }).check()).resolves.toBe(false);
  });

  it('returns false rather than hanging when a dependency never settles', async () => {
    const never = () => new Promise(() => undefined);
    const service = new HealthService({ checkDb: never, checkRedis: ok, timeoutMs: 10 });
    await expect(service.check()).resolves.toBe(false);
  });

  // The endpoint is public and touches the DB; without this cache it is a free
  // load-amplifier for anyone who finds the URL.
  it('checks dependencies once per cache window, not once per request', async () => {
    const checkDb = jest.fn(ok);
    let t = 0;
    const service = new HealthService({ checkDb, checkRedis: ok, now: () => t, cacheMs: 10_000 });
    await service.check();
    await service.check();
    await service.check();
    expect(checkDb).toHaveBeenCalledTimes(1);
    t += 10_000;
    await service.check();
    expect(checkDb).toHaveBeenCalledTimes(2);
  });
});
