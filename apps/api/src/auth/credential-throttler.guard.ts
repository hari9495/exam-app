import { applyDecorators, Injectable, UseGuards } from '@nestjs/common';
import { createHash } from 'crypto';
import { SkipGlobalThrottle, FailOpenThrottlerGuard } from '../fail-open-throttler.guard';
import { CREDENTIAL_THROTTLE } from '../rate-limit-tiers';
import { ipBucket } from './login-protection.service';
import { parseOtpIdentifier } from './otp.service';
import { DEVICE_COOKIE } from './sessions.service';

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

// Body fields naming who is signing in, best first: the email / mobile number (normalised, so
// "98450 12345" and "+919845012345" share a budget), else the single-use token of the sign-in in
// progress (second step, company choice, code exchange).
const ACCOUNT_FIELDS = ['email', 'identifier'] as const;
const TOKEN_FIELDS = ['mfaToken', 'selectionToken', 'otpToken', 'code'] as const;

/** Who a sign-in request is for: an account, a sign-in in progress, this browser, or (none) the IP alone. */
export function credentialSubject(req: Record<string, any>): string {
  const body = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
  for (const field of ACCOUNT_FIELDS) {
    const raw = body[field];
    if (typeof raw === 'string' && raw.trim()) return `account:${parseOtpIdentifier(raw.slice(0, 320))?.value ?? raw.trim().toLowerCase().slice(0, 320)}`;
  }
  for (const field of TOKEN_FIELDS) {
    const raw = body[field];
    if (typeof raw === 'string' && raw) return `token:${sha256(raw.slice(0, 512))}`;
  }
  const device: unknown = req.cookies?.[DEVICE_COOKIE];
  return typeof device === 'string' && device ? `device:${sha256(device.slice(0, 128))}` : '';
}

// The sign-in endpoints (password incl. email-first and staff, codes, second step, passkey, company
// choice, forgot password, Google / Microsoft / SSO code exchange). The brute-force control is
// LoginProtectionService (account lock at 10 failures with an email, IP block at 30 in 15 min);
// this throttle only bounds volume, and must never fire before those:
//   * 'credential': per IP + who (CREDENTIAL_THROTTLE.perAccount a minute), so people in one office
//     behind one address each keep their own budget. Who is taken from the request as sent; making
//     up names only spends the IP-wide ceiling below.
//   * 'credential-ip': per IP (IPv6 /64) across all of these endpoints together.
// Applied with @SkipGlobalThrottle() (the app-wide IP tier does not also count the route). Buckets
// are shared across the endpoints (the key leaves out the route), so one sign-in's steps share one
// budget. Fails open on a Redis outage like the global tier: LoginProtectionService does not.
@Injectable()
export class CredentialThrottlerGuard extends FailOpenThrottlerGuard {
  protected async shouldSkip(): Promise<boolean> {
    return false;
  }

  async onModuleInit(): Promise<void> {
    await super.onModuleInit();
    const { perAccount, perIp, ttl } = CREDENTIAL_THROTTLE;
    const generateKey = (_context: unknown, tracker: string, name: string) => sha256(`${name}:${tracker}`);
    const ip = (req: Record<string, any>) => ipBucket(req.ip ?? null);
    this.throttlers = [
      { name: 'credential', limit: perAccount, ttl, generateKey, getTracker: (req) => `${ip(req)}|${credentialSubject(req)}` },
      { name: 'credential-ip', limit: perIp, ttl, generateKey, getTracker: ip },
    ];
  }
}

/** Sign-in endpoint throttling (see CredentialThrottlerGuard) instead of the app-wide IP tier. */
export const CredentialThrottle = () => applyDecorators(SkipGlobalThrottle(), UseGuards(CredentialThrottlerGuard));
