import { seconds } from '@nestjs/throttler';

// See apps/api/src/rate-limit-tiers.ts for the full rationale: Jest sets NODE_ENV=test
// automatically, and this app's e2e coverage (exercised via apps/api's dual-app.ts harness)
// shares the same Redis-backed throttler store and loopback IP across spec files.
const isTest = process.env.NODE_ENV === 'test';

export const DEFAULT_THROTTLE_LIMIT = isTest ? 10_000 : 100;

export const STRICT_AUTH_THROTTLE = { default: { limit: isTest ? 10_000 : 5, ttl: seconds(60) } };
export const MODERATE_ATTEMPT_THROTTLE = { default: { limit: isTest ? 10_000 : 30, ttl: seconds(60) } };
export const STRICT_CODE_RUN_THROTTLE = { default: { limit: isTest ? 10_000 : 10, ttl: seconds(60) } };
