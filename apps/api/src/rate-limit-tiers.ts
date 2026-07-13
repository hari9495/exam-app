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
export const STRICT_AI_GENERATE_THROTTLE = { default: { limit: isTest ? 10_000 : 10, ttl: seconds(60) } };
export const MODERATE_UPLOAD_THROTTLE = { default: { limit: isTest ? 10_000 : 10, ttl: seconds(60) } };
