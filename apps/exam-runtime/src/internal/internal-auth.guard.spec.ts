import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { InternalAuthGuard } from './internal-auth.guard';

describe('InternalAuthGuard', () => {
  let guard: InternalAuthGuard;

  beforeEach(() => {
    guard = new InternalAuthGuard();
    process.env.INTERNAL_SERVICE_SECRET = 'test-internal-secret';
  });

  function makeContext(headers: Record<string, string>): ExecutionContext {
    return {
      switchToHttp: () => ({ getRequest: () => ({ headers }) }),
    } as unknown as ExecutionContext;
  }

  it('allows a request with the correct secret header', () => {
    expect(guard.canActivate(makeContext({ 'x-internal-secret': 'test-internal-secret' }))).toBe(true);
  });

  it('rejects a request with a missing secret header', () => {
    expect(() => guard.canActivate(makeContext({}))).toThrow(UnauthorizedException);
  });

  it('rejects a request with the wrong secret', () => {
    expect(() => guard.canActivate(makeContext({ 'x-internal-secret': 'wrong' }))).toThrow(UnauthorizedException);
  });
});
