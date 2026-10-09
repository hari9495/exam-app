import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { DEFAULT_SECURITY_POLICY, TENANT_SECURITY_FLOOR } from '@exam-platform/shared';
import { SKIP_GLOBAL_THROTTLE } from '../fail-open-throttler.guard';
import { CREDENTIAL_THROTTLE_LIMITS, PUBLIC_API_THROTTLE } from '../rate-limit-tiers';
import { CredentialThrottlerGuard, credentialSubject } from './credential-throttler.guard';
import { IP_LOCK_THRESHOLD, IP_WINDOW_SECONDS } from './login-protection.service';
import { AuthController } from './auth.controller';
import { MfaController } from './mfa.controller';
import { OtpController } from './otp.controller';
import { SocialController } from './social.controller';
import { SsoController } from './sso.controller';

describe('CredentialThrottlerGuard', () => {
  it('keys on the normalised email or mobile number first', () => {
    expect(credentialSubject({ body: { email: ' Asha@Kaveri.TEST ' } })).toBe('account:asha@kaveri.test');
    expect(credentialSubject({ body: { identifier: 'asha@kaveri.test', password: 'x' } })).toBe('account:asha@kaveri.test');
    const mobile = credentialSubject({ body: { identifier: '98450 12345' } });
    expect(mobile).toBe('account:+919845012345');
    expect(credentialSubject({ body: { identifier: '+91-98450-12345' } })).toBe(mobile);
  });

  it('else the token of the sign-in in progress, else this browser, else nothing (the IP alone)', () => {
    const a = credentialSubject({ body: { mfaToken: 'a'.repeat(43), code: '123456' } });
    expect(a).toMatch(/^token:[0-9a-f]{64}$/);
    expect(credentialSubject({ body: { mfaToken: 'b'.repeat(43) } })).not.toBe(a);
    expect(credentialSubject({ body: { selectionToken: 's' } })).toMatch(/^token:/);
    expect(credentialSubject({ body: {}, cookies: { yx_device: 'dev-1' } })).toMatch(/^device:[0-9a-f]{64}$/);
    expect(credentialSubject({ body: undefined })).toBe('');
    // Not a string (guards run before validation): ignored, never thrown on.
    expect(credentialSubject({ body: { email: ['a@b.test'], mfaToken: { $ne: 1 } } })).toBe('');
  });

  it('production limits sit above the lockout, so the lockout (with its email) always fires first', () => {
    // Account: locked at its Nth failure (YukthiX default 10; companies may only go lower).
    expect(CREDENTIAL_THROTTLE_LIMITS.perAccount).toBeGreaterThanOrEqual(DEFAULT_SECURITY_POLICY.maxFailedAttempts);
    expect(CREDENTIAL_THROTTLE_LIMITS.perAccount).toBeGreaterThanOrEqual(TENANT_SECURITY_FLOOR.maxFailedAttempts.max);
    // IP: blocked at 30 failures in 15 minutes, reachable inside one minute of the ceiling.
    expect(CREDENTIAL_THROTTLE_LIMITS.perIp).toBeGreaterThan(IP_LOCK_THRESHOLD);
    expect(IP_WINDOW_SECONDS).toBeGreaterThanOrEqual(CREDENTIAL_THROTTLE_LIMITS.ttl / 1000);
  });

  it('is never skipped by @SkipGlobalThrottle (which it is applied with)', async () => {
    const guard = Object.create(CredentialThrottlerGuard.prototype) as { shouldSkip(): Promise<boolean> };
    expect(await guard.shouldSkip()).toBe(false);
  });

  const reflector = new Reflector();
  const credentialRoutes: [string, (...args: never[]) => unknown][] = [
    ['staff/login', AuthController.prototype.login],
    ['platform/login', AuthController.prototype.platformLogin],
    ['staff/select-company', AuthController.prototype.selectCompany],
    ['passkey/options', AuthController.prototype.passkeyOptions],
    ['passkey/verify', AuthController.prototype.passkeySignIn],
    ['forgot-password', AuthController.prototype.forgotPassword],
    ['sso/exchange', AuthController.prototype.ssoExchange],
    ['mfa/passkey-options', MfaController.prototype.loginPasskeyOptions],
    ['mfa/verify', MfaController.prototype.verifyLogin],
    ['otp/start', OtpController.prototype.start],
    ['otp/verify', OtpController.prototype.verify],
    ['mfa/otp/send', OtpController.prototype.sendMfaOtp],
    ['social/:provider/start', SocialController.prototype.start],
    ['social/exchange', SocialController.prototype.exchange],
    ['identify (email-first)', SsoController.prototype.identify],
    ['sso/start', SsoController.prototype.start],
  ];
  it.each(credentialRoutes)('%s uses it instead of the global IP tier', (_name, handler) => {
    expect(reflector.get(GUARDS_METADATA, handler)).toContain(CredentialThrottlerGuard);
    expect(reflector.get(SKIP_GLOBAL_THROTTLE, handler)).toBe(true);
  });

  it.each([
    ['sign-in-options', SocialController.prototype.options],
    ['remembered-company', AuthController.prototype.rememberedCompany],
  ])('%s (read on every sign-in page load) stays on the public tier', (_name, handler) => {
    expect(reflector.get(GUARDS_METADATA, handler)).toBeUndefined();
    expect(reflector.get('THROTTLER:LIMITdefault', handler)).toBe(PUBLIC_API_THROTTLE.default.limit);
  });
});
