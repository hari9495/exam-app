import { Logger } from '@nestjs/common';
import * as Sentry from '@sentry/node';
import type { SystemEventEntry } from '../system-events/system-events.service';
import { buildSentryPayload, createRateLimiter } from './sentry-payload';

// Second sink alongside the system_events table. It exists because that table lives in the
// database that is often the failing dependency, nothing watches it, and it cannot alert.
//
// Every method here is defensive on purpose: this runs inside an exception filter, so a
// throw would convert a handled error into an unhandled one -- turning the monitoring into
// the outage.
export class SentryReporter {
  private readonly logger = new Logger(SentryReporter.name);
  private readonly allow: () => boolean;
  private active = false;
  private payloadFailureLogged = false;

  constructor(maxPerWindow = 20, windowMs = 60_000) {
    this.allow = createRateLimiter(maxPerWindow, windowMs, () => Date.now());
  }

  get enabled(): boolean {
    return this.active;
  }

  init(): void {
    const dsn = process.env.SENTRY_DSN;
    if (!dsn) {
      // Deliberate, and mirrors FaceEmbedderService: without this line a silently-inert
      // deployment is indistinguishable from "no errors have ever occurred".
      this.logger.warn('Sentry DSN not configured (SENTRY_DSN=unset); external error reporting is disabled');
      return;
    }
    try {
      Sentry.init({
        dsn,
        environment: process.env.SENTRY_ENVIRONMENT ?? 'production',
        // Never rely on the SDK default here: the filter is careful never to read request
        // bodies, headers or cookies, and default PII would attach them anyway.
        sendDefaultPii: false,
        tracesSampleRate: 0,
      });
      this.active = true;
    } catch (error) {
      this.logger.warn(`Sentry init failed; error reporting is disabled: ${String(error)}`);
    }
  }

  capture(entry: SystemEventEntry, exception: unknown): void {
    if (!this.active) return;
    try {
      // Payload built before the rate limit is checked, so a build failure (see catch below)
      // never burns a slot from the per-minute quota -- only events that are actually
      // sendable consume it. Both calls stay in this one try so a bug in either the builder
      // or the limiter is caught the same way.
      const payload = buildSentryPayload(entry);
      if (!this.allow()) return;
      Sentry.captureException(exception, { tags: payload.tags });
    } catch (error) {
      // Fail closed: drop the event rather than send something unmapped.
      //
      // Log once per process (not once per event) -- ponytail: a payload-building regression
      // fires on every event, and a per-event log would reproduce the exact flood this class
      // exists to contain; the upgrade path is a proper N-per-window if one-shot proves too
      // quiet in practice. Wrapped so the logging itself can never become a new throw source.
      if (!this.payloadFailureLogged) {
        this.payloadFailureLogged = true;
        try {
          this.logger.warn(`Sentry capture failed; dropping event(s): ${String(error)}`);
        } catch {
          // Logging must not become a new throw source.
        }
      }
    }
  }

  async flush(timeoutMs: number): Promise<void> {
    if (!this.active) return;
    try {
      await Sentry.flush(timeoutMs);
    } catch {
      // Shutdown must not fail because telemetry could not drain.
    }
  }
}
