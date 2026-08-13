// Browser Sentry init. Next.js loads this automatically on the client -- see
// https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation-client
// (replaces the older sentry.client.config.ts convention).
//
// Inert without NEXT_PUBLIC_SENTRY_DSN: production has no DSN configured
// today, and this must not call Sentry.init() at all in that state.
import * as Sentry from '@sentry/nextjs';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

// Required export regardless of DSN presence -- the SDK wires this into
// Next.js's router itself; it's a no-op when Sentry.init() was never called.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;

if (dsn) {
  Sentry.init({
    dsn,
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
  });
}
