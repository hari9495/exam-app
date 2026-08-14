// Browser Sentry init. Next.js loads this automatically on the client -- see
// https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation-client
// (replaces the older sentry.client.config.ts convention).
//
// Inert without NEXT_PUBLIC_SENTRY_DSN: production has no DSN configured
// today, and this must not call Sentry.init() at all in that state.
import * as Sentry from '@sentry/nextjs';
import { createRateLimiter } from './lib/sentry-rate-limiter';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
const allow = createRateLimiter(20, 60_000);

// Required export regardless of DSN presence -- the SDK wires this into
// Next.js's router itself; it's a no-op when Sentry.init() was never called.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? 'production',
    // The exam page's DOM and network payloads carry candidate names,
    // emails, and answer text. Never fall back to the SDK default.
    sendDefaultPii: false,
    // No APM, per spec.
    tracesSampleRate: 0,
    // Session Replay stays off: it records the DOM, which on the exam page
    // is question text and candidate answers. This is the single highest
    // PII risk in the whole feature, so both rates are pinned at 0 even
    // though the Replay integration isn't added below either.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    // Every event needs a severity_band or it matches neither alert rule -- this is the class
    // of event (browser errors, including the SDK's own default integrations) the feature most
    // needed to make visible.
    initialScope: { tags: { service: 'web', severity_band: 'digest' } },
    // The browser sink is unbounded unlike the backends' SentryReporter -- a render-loop error
    // multiplied across concurrent candidates could exhaust the org-wide quota. See
    // lib/sentry-rate-limiter.ts.
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
} else {
  // Mirrors SentryReporter and instrumentation.ts: without this line a silently-inert
  // deployment is indistinguishable from "no errors have ever occurred".
  console.warn('Sentry DSN not configured (NEXT_PUBLIC_SENTRY_DSN=unset); external error reporting is disabled');
}
