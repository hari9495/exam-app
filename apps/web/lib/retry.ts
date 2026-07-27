import { CandidateApiError } from './candidate-api-client';

export const RETRY_ATTEMPTS = 3;
const BASE_DELAY_MS = 500;
// Retry-After tells every client the same number, so a thousand candidates
// rejected by the same burst would come back in the same millisecond and
// re-create it. Spreading each client's wake-up over a window breaks that
// synchronisation; +/-25% is enough to smear the herd without making any
// individual candidate wait meaningfully longer.
const JITTER_RATIO = 0.25;

// Retry only what a retry can actually fix: 5xx (the server is briefly unable,
// including the 503 that TenantPrismaService raises on pool exhaustion) and a
// fetch rejection, which means no response arrived at all. Everything else is
// the server's considered answer -- a 410 on a spent invitation, a 403, a 400 --
// and repeating the request just burns the endpoint's per-IP rate-limit budget
// on a guaranteed failure. 429 is deliberately excluded: being throttled is
// itself the signal to stop, and retrying is what the limit exists to prevent.
export function isRetryableError(error: unknown): boolean {
  if (error instanceof CandidateApiError) return error.status >= 500;
  // fetch() rejects with a TypeError when the request never got a response
  // (offline, DNS failure, connection reset, CORS preflight refusal).
  return error instanceof TypeError;
}

// `failureCount` is 1-based on the first failure, matching react-query's
// retryDelay contract so the same function serves both callers.
export function retryDelayMs(failureCount: number, error: unknown): number {
  const hinted = error instanceof CandidateApiError ? error.retryAfterSeconds : undefined;
  const base = hinted !== undefined ? hinted * 1000 : BASE_DELAY_MS * 2 ** (failureCount - 1);
  return Math.round(base * (1 + (Math.random() * 2 - 1) * JITTER_RATIO));
}

// Imperative counterpart to the react-query mutation defaults, for the two
// call sites that don't go through .mutate(): the debounced answer autosave
// and the invite redeem on /start.
export async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt >= RETRY_ATTEMPTS || !isRetryableError(error)) throw error;
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs(attempt, error)));
    }
  }
}
