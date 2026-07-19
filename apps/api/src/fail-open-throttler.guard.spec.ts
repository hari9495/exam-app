import { ExecutionContext, HttpException } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { FailOpenThrottlerGuard } from './fail-open-throttler.guard';

describe('FailOpenThrottlerGuard', () => {
  // The prototype-juggling approach (spreading FailOpenThrottlerGuard.prototype to splice in
  // a fake super.canActivate) is fragile in practice: class methods are non-enumerable, so a
  // `{...prototype}` spread silently drops them and the fake `canActivate` ends up shadowing
  // the real subclass method entirely, bypassing the try/catch under test. Spying directly on
  // ThrottlerGuard.prototype.canActivate keeps FailOpenThrottlerGuard's own method intact while
  // still controlling what "the real throttling logic" does in each scenario -- the DI graph
  // (storage, reflector, options) is irrelevant to the fail-open semantics under test.
  function makeGuard() {
    const guard = Object.create(FailOpenThrottlerGuard.prototype) as FailOpenThrottlerGuard;
    (guard as unknown as { failOpenLogger: { warn: jest.Mock } }).failOpenLogger = { warn: jest.fn() };
    return guard;
  }

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('allows the request and logs a warning when storage fails', async () => {
    jest
      .spyOn(ThrottlerGuard.prototype, 'canActivate')
      .mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:6379'));
    const guard = makeGuard();
    await expect(guard.canActivate({} as never)).resolves.toBe(true);
    expect((guard as unknown as { failOpenLogger: { warn: jest.Mock } }).failOpenLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('ECONNREFUSED'),
    );
  });

  it('rethrows genuine throttling rejections (HttpException / 429)', async () => {
    jest
      .spyOn(ThrottlerGuard.prototype, 'canActivate')
      .mockRejectedValue(new HttpException('Too Many Requests', 429));
    const guard = makeGuard();
    await expect(guard.canActivate({} as never)).rejects.toBeInstanceOf(HttpException);
  });

  it('passes through the underlying verdict when nothing fails', async () => {
    jest.spyOn(ThrottlerGuard.prototype, 'canActivate').mockResolvedValue(true);
    const guard = makeGuard();
    await expect(guard.canActivate({} as never)).resolves.toBe(true);
  });

  describe('shouldSkip', () => {
    // shouldSkip is called once by the base ThrottlerGuard.canActivate before its
    // per-throttler-name loop runs -- so a guard-level true here means this guard
    // does no throttling check at all for the route, regardless of throttler names
    // (see SkipGlobalThrottle's doc comment for why this beats @SkipThrottle()).
    function makeGuardWithReflector(getAllAndOverride: jest.Mock) {
      const guard = Object.create(FailOpenThrottlerGuard.prototype) as FailOpenThrottlerGuard;
      (guard as unknown as { reflector: { getAllAndOverride: jest.Mock } }).reflector = { getAllAndOverride };
      return guard as unknown as { shouldSkip: (context: ExecutionContext) => Promise<boolean> };
    }

    const fakeContext = { getHandler: () => undefined, getClass: () => undefined } as unknown as ExecutionContext;

    it('skips when the route carries SkipGlobalThrottle metadata', async () => {
      const guard = makeGuardWithReflector(jest.fn().mockReturnValue(true));
      await expect(guard.shouldSkip(fakeContext)).resolves.toBe(true);
    });

    it('does not skip when the route has no SkipGlobalThrottle metadata', async () => {
      const guard = makeGuardWithReflector(jest.fn().mockReturnValue(undefined));
      await expect(guard.shouldSkip(fakeContext)).resolves.toBe(false);
    });
  });
});
