import { seconds } from '@nestjs/throttler';

// Jest sets NODE_ENV=test automatically (no explicit setting exists anywhere in this repo).
// Every e2e spec file in this suite shares one Redis-backed throttler store and calls through
// the same loopback IP -- roughly a dozen existing spec files each call /auth/staff/login as
// setup boilerplate, and Jest's default (non --runInBand) mode runs spec files in parallel
// worker processes, so production-realistic limits would make unrelated e2e suites collide on
// the shared auth tier. Limits are relaxed here under test so those suites run unaffected; the
// real limits are proven by the guard-mechanism e2e test (Task 2) and the live manual check
// (Task 3) instead.
const isTest = process.env.NODE_ENV === 'test';

export const DEFAULT_THROTTLE_LIMIT = isTest ? 10_000 : 100;

export const STRICT_AUTH_THROTTLE = { default: { limit: isTest ? 10_000 : 5, ttl: seconds(60) } };
// Sign-in endpoints (CredentialThrottlerGuard): per IP + account, and an IP-wide ceiling over all of
// them. Both sit above the brute-force controls (login-protection.service: account lock at 10
// failures, IP block at 30 in 15 min) so those always fire first; this only caps raw volume.
export const CREDENTIAL_THROTTLE_LIMITS = { perAccount: 10, perIp: 120, ttl: seconds(60) };
export const CREDENTIAL_THROTTLE = isTest ? { ...CREDENTIAL_THROTTLE_LIMITS, perAccount: 10_000, perIp: 10_000 } : CREDENTIAL_THROTTLE_LIMITS;
// POST /auth/refresh: per session (RefreshThrottlerGuard), so a shared office IP or several tabs keep their own budget.
export const REFRESH_THROTTLE = { default: { limit: isTest ? 10_000 : 30, ttl: seconds(60) } };
export const STRICT_AI_GENERATE_THROTTLE = { default: { limit: isTest ? 10_000 : 10, ttl: seconds(60) } };
export const MODERATE_UPLOAD_THROTTLE = { default: { limit: isTest ? 10_000 : 10, ttl: seconds(60) } };
export const PUBLIC_API_THROTTLE = { default: { limit: isTest ? 10_000 : 60, ttl: seconds(60) } };
// Service Desk inbound mail webhook: one mail provider posts every company's mail from a few addresses. Each post is
// signed per mailbox and each sender is limited (20 in 10 minutes), so this only caps raw volume per provider address.
export const INBOUND_MAIL_THROTTLE = { default: { limit: isTest ? 10_000 : 1200, ttl: seconds(60) } };
export const STRICT_WALK_IN_THROTTLE = { default: { limit: isTest ? 10_000 : 20, ttl: seconds(60) } };
