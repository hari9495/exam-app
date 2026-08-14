// ponytail: deliberate copy of createRateLimiter from
// packages/shared/src/observability/sentry-payload.ts, not a shared import -- apps/web cannot
// import @exam-platform/shared at runtime (Next.js standalone output only bundles what each
// entrypoint actually imports, and the shared package isn't part of that graph). Small enough
// that duplicating it beats wiring up a build-time-only workaround.
//
// Used as a beforeSend gate: the backends cap sends at 20/minute per process via
// SentryReporter; apps/web has no equivalent without this, and the browser sink is the
// unbounded one -- a render-loop error multiplied across concurrent candidates can exhaust the
// org-wide monthly free-tier quota and blind the backends too.
export function createRateLimiter(maxPerWindow: number, windowMs: number): () => boolean {
  let windowStart = Date.now();
  let count = 0;
  return function allow(): boolean {
    const t = Date.now();
    if (t - windowStart >= windowMs) {
      windowStart = t;
      count = 0;
    }
    if (count >= maxPerWindow) return false;
    count += 1;
    return true;
  };
}
