import { WalkInThrottlerGuard } from './walk-in-throttler.guard';

// NOTE: WalkInController's @SkipGlobalThrottle() was removed as part of the throttle-bypass
// fix (see final-review-fix-report.md) -- the app-wide IP-keyed FailOpenThrottlerGuard
// (APP_GUARD) now runs ahead of this guard on every walk-in request, providing a volumetric
// per-IP backstop regardless of what orgSlug value is sent. That composition is exercised by
// Nest's guard pipeline at request time, not unit-testable without booting the full app, so
// it isn't covered here. This spec only covers getTracker(), which is unchanged.
describe('WalkInThrottlerGuard', () => {
  function makeGuard() {
    return Object.create(WalkInThrottlerGuard.prototype) as WalkInThrottlerGuard & {
      getTracker: (req: Record<string, any>) => Promise<string>;
    };
  }

  it('keys the throttle bucket by the orgSlug route param', async () => {
    const guard = makeGuard();
    await expect(guard.getTracker({ params: { orgSlug: 'acme-corp' }, ip: '203.0.113.5' })).resolves.toBe(
      'acme-corp',
    );
  });

  it('falls back to req.ip when orgSlug is missing from params', async () => {
    const guard = makeGuard();
    await expect(guard.getTracker({ params: {}, ip: '203.0.113.5' })).resolves.toBe('203.0.113.5');
  });

  it('falls back to req.ip when params itself is missing', async () => {
    const guard = makeGuard();
    await expect(guard.getTracker({ ip: '203.0.113.5' })).resolves.toBe('203.0.113.5');
  });
});
