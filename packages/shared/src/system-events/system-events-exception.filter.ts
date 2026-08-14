import { ArgumentsHost, Catch, HttpException } from '@nestjs/common';
import { BaseExceptionFilter, HttpAdapterHost } from '@nestjs/core';
import { SystemEventsService, SystemEventService } from './system-events.service';
import { SentryReporter } from '../observability/sentry-reporter';

// Records unhandled exceptions as system_events so production 500s are diagnosable from
// the admin console instead of requiring SSH access to pm2 logs. Response behavior is
// untouched -- everything delegates to BaseExceptionFilter.
//
// What gets recorded: non-HttpException crashes (the blank "Internal server error" class,
// which is exactly what was undiagnosable before) and deliberate HttpExceptions with
// status >= 500. 4xx responses are expected request outcomes, not system failures.
//
// Registered via useFactory in each app's module (the service name differs per app). In
// exam-runtime this must be registered BEFORE ServerBusyRetryAfterFilter in the providers
// array: Nest matches global filters in reverse registration order, so the later, more
// specific @Catch(HttpException) filter keeps handling HttpExceptions (including its
// Retry-After header) and this catch-all only sees what that one doesn't match.
@Catch()
export class SystemEventsExceptionFilter extends BaseExceptionFilter {
  constructor(
    httpAdapterHost: HttpAdapterHost,
    private readonly systemEvents: SystemEventsService,
    private readonly serviceName: Extract<SystemEventService, 'api' | 'exam-runtime'>,
    // Optional so every existing 3-arg construction keeps compiling, and so a deployment
    // with no DSN needs no wiring change at all.
    private readonly reporter?: SentryReporter,
  ) {
    super(httpAdapterHost.httpAdapter);
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const isHttp = exception instanceof HttpException;
    const status = isHttp ? exception.getStatus() : 500;
    if (!isHttp || status >= 500) {
      const entry = {
        organizationId: this.organizationIdFrom(host),
        service: this.serviceName,
        severity: 'error' as const,
        message: exception instanceof Error ? `${exception.name}: ${exception.message}` : String(exception),
        context: this.contextFrom(host, status, exception),
      };
      // Fire-and-forget: record() never throws, and the response must not wait on it.
      void this.systemEvents.record(entry);
      // Second sink. Wrapped because the two must not be able to fail each other: a Sentry
      // outage must not stop the audit trail, and a database outage -- the case where
      // external reporting matters most -- must not stop the Sentry send.
      try {
        this.reporter?.capture(entry, exception);
      } catch {
        // SentryReporter.capture already swallows; this is belt-and-braces for the
        // constructor-injected fake and for any future reporter implementation.
      }
    }
    super.catch(exception, host);
  }

  private organizationIdFrom(host: ArgumentsHost): string | null {
    if (host.getType() !== 'http') return null;
    const user = host.switchToHttp().getRequest().user as { organizationId?: unknown } | undefined;
    return typeof user?.organizationId === 'string' ? user.organizationId : null;
  }

  private contextFrom(host: ArgumentsHost, status: number, exception: unknown): Record<string, unknown> {
    const context: Record<string, unknown> = { status };
    // A global filter also sees WebSocket gateway exceptions, where switchToHttp()
    // yields no usable request object.
    if (host.getType() === 'http') {
      const req = host.switchToHttp().getRequest() as {
        method?: string;
        originalUrl?: string;
        user?: { invitationId?: unknown; userId?: unknown; sub?: unknown; attemptId?: unknown };
      };
      if (req.method) context.method = req.method;
      // originalUrl includes the query string (?email=..., ?search=...), which can carry
      // candidate PII (lookup-by-email) or recruiter-typed names. route is allow-listed
      // downstream and forwarded verbatim to Sentry as a tag, so the query must never reach
      // this object in the first place -- stripping here fixes both the Sentry sink and the
      // system_events DB row in one place.
      if (req.originalUrl) context.route = req.originalUrl.split('?')[0];
      if (typeof req.user?.invitationId === 'string') context.invitationId = req.user.invitationId;
      // Added for severity banding: an error carrying an attemptId is hurting a candidate
      // mid-exam. Opaque id, consistent with the rest of this allow-list.
      if (typeof req.user?.attemptId === 'string') context.attemptId = req.user.attemptId;
      const userId = req.user?.userId ?? req.user?.sub;
      if (typeof userId === 'string') context.userId = userId;
    }
    if (exception instanceof Error && exception.stack) {
      context.stack = exception.stack.slice(0, 1500);
    }
    return context;
  }
}
