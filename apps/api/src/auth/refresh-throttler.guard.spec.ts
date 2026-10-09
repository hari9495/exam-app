import { GUARDS_METADATA } from '@nestjs/common/constants';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { SKIP_GLOBAL_THROTTLE } from '../fail-open-throttler.guard';
import { AuthController } from './auth.controller';
import { RefreshThrottlerGuard } from './refresh-throttler.guard';

describe('RefreshThrottlerGuard', () => {
  const secret = 'refresh-guard-spec-secret';
  const saved = process.env.JWT_REFRESH_SECRET;
  beforeAll(() => (process.env.JWT_REFRESH_SECRET = secret));
  afterAll(() => (saved === undefined ? delete process.env.JWT_REFRESH_SECRET : (process.env.JWT_REFRESH_SECRET = saved)));

  const guard = Object.create(RefreshThrottlerGuard.prototype) as { getTracker(req: Record<string, unknown>): Promise<string>; shouldSkip(): Promise<boolean> };
  const sign = (familyId: string, key = secret) => new JwtService().sign({ sub: 'u1', familyId }, { secret: key, expiresIn: '1h' });
  const ip = { ip: '203.0.113.7', ips: [] };

  it('keys a live refresh token on its session, the same across rotation (cookie or body)', async () => {
    const first = await guard.getTracker({ ...ip, cookies: { refresh_token: sign('fam-a') } });
    expect(first).toBe('session:fam-a');
    expect(await guard.getTracker({ ...ip, body: { refreshToken: sign('fam-a') } })).toBe(first);
    expect(await guard.getTracker({ ...ip, cookies: { refresh_token: sign('fam-b') } })).toBe('session:fam-b');
  });

  it('falls back to the IP for no token, a forged one or garbage', async () => {
    expect(await guard.getTracker({ ...ip })).toBe('ip:203.0.113.7');
    expect(await guard.getTracker({ ...ip, cookies: { refresh_token: sign('fam-x', 'not-the-secret') } })).toBe('ip:203.0.113.7');
    expect(await guard.getTracker({ ...ip, body: { refreshToken: 'garbage' } })).toBe('ip:203.0.113.7');
  });

  it('is never skipped, and /auth/refresh uses it instead of the global IP tier', async () => {
    expect(await guard.shouldSkip()).toBe(false);
    const handler = AuthController.prototype.refresh;
    expect(new Reflector().get(GUARDS_METADATA, handler)).toContain(RefreshThrottlerGuard);
    expect(new Reflector().get(SKIP_GLOBAL_THROTTLE, handler)).toBe(true);
  });
});
