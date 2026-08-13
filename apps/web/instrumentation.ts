// Server/edge Sentry init. Next.js calls register() once on boot, for both the
// nodejs and edge runtimes -- see https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation
//
// Inert without SENTRY_DSN: production has no DSN configured today, and this
// must not call Sentry.init() at all in that state (not init-with-empty-dsn).
import * as Sentry from '@sentry/nextjs';

export async function register(): Promise<void> {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    // Candidate names, emails, and answer text pass through this server.
    // Never fall back to the SDK default.
    sendDefaultPii: false,
    // No APM, per spec.
    tracesSampleRate: 0,
  });
}

export const onRequestError = Sentry.captureRequestError;
