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

  // Without single-flight, a burst of concurrent callers arriving during a cache miss would
  // each see `this.cached` as stale and each fire a real checkDb/checkRedis before any of
  // them resolves -- defeating the cache's job of capping load on this public endpoint.
  it('shares one in-flight check across concurrent callers on a cache miss', async () => {
    let resolveDb: (v: unknown) => void;
    const checkDb = jest.fn(() => new Promise((resolve) => (resolveDb = resolve)));
    const service = new HealthService({ checkDb, checkRedis: ok, now: () => 0 });

    const first = service.check();
    const second = service.check();
    resolveDb!(1);
    const [a, b] = await Promise.all([first, second]);

    expect(checkDb).toHaveBeenCalledTimes(1);
    expect(a).toBe(true);
    expect(b).toBe(true);
  });

  it('releases the in-flight slot once the shared check settles, so a later call outside the cache window checks again', async () => {
    const checkDb = jest.fn(ok);
    let t = 0;
    const service = new HealthService({ checkDb, checkRedis: ok, now: () => t, cacheMs: 10_000 });

    await Promise.all([service.check(), service.check()]);
    expect(checkDb).toHaveBeenCalledTimes(1);

    t += 10_000;
    await service.check();
    expect(checkDb).toHaveBeenCalledTimes(2);
  });

  it('resolves false rather than wedging forever if the underlying check machinery rejects', async () => {
    // settle() catches everything today, so run() never actually rejects in practice. This
    // forces the hypothetical anyway, via the private run() method, to prove the in-flight
    // slot is cleared unconditionally rather than only on the happy path.
    const service = new HealthService({ checkDb: ok, checkRedis: ok, now: () => 0 });
    const runSpy = jest
      .spyOn(service as unknown as { run: () => Promise<boolean> }, 'run')
      .mockRejectedValueOnce(new Error('boom'));

    await expect(service.check()).resolves.toBe(false);

    runSpy.mockRestore();
    await expect(service.check()).resolves.toBe(true);
  });
});
