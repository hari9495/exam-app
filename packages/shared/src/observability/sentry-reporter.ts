import { Logger } from '@nestjs/common';
import * as Sentry from '@sentry/node';
import type { SystemEventEntry } from '../system-events/system-events.service';
import { buildSentryPayload, classifySeverity, createRateLimiter } from './sentry-payload';

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

  // `service` names this process for both the default-tag scope below and the rate limiter's
  // caller; it's the same string each app.module.ts already passes to SystemEventsExceptionFilter.
  constructor(
    private readonly service: string,
    maxPerWindow = 20,
    windowMs = 60_000,
  ) {
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
        // Every event needs a severity_band or it matches neither alert rule and is collected
        // silently -- including events raised by the SDK's own default integrations, which never
        // pass through capture()/buildSentryPayload below. classifySeverity(service, false) is
        // exactly the "no attempt context" default it already computes for filter-routed events,
        // so exam-runtime defaults to 'immediate' and api to 'digest'. Tags passed to
        // captureException still override same-key scope tags, so filter-routed events keep their
        // computed band.
        initialScope: { tags: { service: this.service, severity_band: classifySeverity(this.service, false) } },
        // NOT optional: @sentry/node's default onUnhandledRejectionIntegration runs in 'warn'
        // mode, which attaches a process.on('unhandledRejection') listener that only logs. Node
        // treats an unhandled rejection as fatal ONLY when no listener is attached -- so the
        // moment a DSN is configured, that default silently turns a fatal, restart-triggering
        // condition into a warning. exam-runtime's fire-and-forget checkFaceMismatch() (see
        // attempt.service.ts) relies in writing on the crash: an uncaught rejection there is
        // meant to kill the process so pm2 restarts it, rather than leave a candidate-facing
        // service running in an unknown state while /health keeps returning 200. 'strict' mode
        // reports the rejection to Sentry AND lets Node's fatal behaviour proceed.
        integrations: [Sentry.onUnhandledRejectionIntegration({ mode: 'strict' })],
        // sendDefaultPii: false is NOT an off switch in @sentry/node v10 -- it maps to a
        // deny-list of header/query snippets that contains neither "email" nor "search", and
        // requestDataIntegration (a default integration) always attaches the request URL
        // regardless. Outgoing-request breadcrumbs record full query strings too, and one
        // outgoing target in this app is a customer-supplied webhook URL. Fail closed: strip
        // both structures wholesale rather than trying to enumerate what's safe inside them.
        // Tags already carry everything the backends need, so nothing of value is lost.
        beforeSend(event) {
          delete event.request;
          delete event.breadcrumbs;
          return event;
        },
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
