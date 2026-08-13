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
      // Rate-limited inside the try so a limiter bug cannot escape either. Over the cap the
      // event is dropped from the SEND only -- SystemEventsService.record() has already
      // logged and persisted it, so nothing is lost, only quota is saved.
      if (!this.allow()) return;
      const payload = buildSentryPayload(entry);
      Sentry.captureException(exception, { tags: payload.tags });
    } catch {
      // Fail closed: drop the event rather than send something unmapped.
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
