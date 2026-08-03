import { ArgumentsHost, Catch, HttpException } from '@nestjs/common';
import { BaseExceptionFilter, HttpAdapterHost } from '@nestjs/core';
import { SystemEventsService, SystemEventService } from './system-events.service';

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
  ) {
    super(httpAdapterHost.httpAdapter);
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const isHttp = exception instanceof HttpException;
    const status = isHttp ? exception.getStatus() : 500;
    if (!isHttp || status >= 500) {
      // Fire-and-forget: record() never throws, and the response must not wait on it.
      void this.systemEvents.record({
        organizationId: this.organizationIdFrom(host),
        service: this.serviceName,
        severity: 'error',
        message: exception instanceof Error ? `${exception.name}: ${exception.message}` : String(exception),
        context: this.contextFrom(host, status, exception),
      });
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
        user?: { invitationId?: unknown; userId?: unknown; sub?: unknown };
      };
      if (req.method) context.method = req.method;
      if (req.originalUrl) context.route = req.originalUrl;
      if (typeof req.user?.invitationId === 'string') context.invitationId = req.user.invitationId;
      const userId = req.user?.userId ?? req.user?.sub;
      if (typeof userId === 'string') context.userId = userId;
    }
    if (exception instanceof Error && exception.stack) {
      context.stack = exception.stack.slice(0, 1500);
    }
    return context;
  }
}
