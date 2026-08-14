// Server/edge Sentry init. Next.js calls register() once on boot, for both the
// nodejs and edge runtimes -- see https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation
//
// Inert without SENTRY_DSN: production has no DSN configured today, and this
// must not call Sentry.init() at all in that state (not init-with-empty-dsn).
import * as Sentry from '@sentry/nextjs';
import { createRateLimiter } from './lib/sentry-rate-limiter';

const allow = createRateLimiter(20, 60_000);

export async function register(): Promise<void> {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    // Mirrors SentryReporter: without this line a silently-inert deployment is
    // indistinguishable from "no errors have ever occurred" -- and this is the app whose
    // 18-minute unnoticed outage motivated the whole feature.
    console.warn('Sentry DSN not configured (SENTRY_DSN=unset); external error reporting is disabled');
    return;
  }

  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT ?? 'production',
    // Candidate names, emails, and answer text pass through this server.
    // Never fall back to the SDK default.
    sendDefaultPii: false,
    // No APM, per spec.
    tracesSampleRate: 0,
    // Every event needs a severity_band or it matches neither alert rule. Per-event tags set
    // by callers (there are none server-side today) would still override this default.
    initialScope: { tags: { service: 'web', severity_band: 'digest' } },
    // apps/web has no per-process send cap like the backends' SentryReporter -- see
    // lib/sentry-rate-limiter.ts for why.
    //
    // sendDefaultPii: false is a deny-list in @sentry/node v10, not an off switch -- it
    // doesn't cover "email" or "search", and requestDataIntegration always attaches the
    // request URL regardless. Strip both wholesale as a fail-closed backstop, same as
    // SentryReporter. Only reached once the rate limiter has already decided to keep the
    // event, so a dropped event never pays for work that gets thrown away.
    beforeSend: (event) => {
      if (!allow()) return null;
      delete event.request;
      delete event.breadcrumbs;
      return event;
    },
  });
}

export const onRequestError = Sentry.captureRequestError;
