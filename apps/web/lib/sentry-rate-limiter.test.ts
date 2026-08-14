import { createRateLimiter } from './sentry-rate-limiter';

describe('createRateLimiter (web copy)', () => {
  it('allows up to the cap then blocks within the same window', () => {
    const allow = createRateLimiter(3, 60_000);
    expect([allow(), allow(), allow()]).toEqual([true, true, true]);
    expect(allow()).toBe(false);
  });

  it('resets once the window elapses', () => {
    jest.useFakeTimers().setSystemTime(0);
    const allow = createRateLimiter(1, 60_000);
    expect(allow()).toBe(true);
    expect(allow()).toBe(false);
    jest.setSystemTime(60_000);
    expect(allow()).toBe(true);
    jest.useRealTimers();
  });
});
