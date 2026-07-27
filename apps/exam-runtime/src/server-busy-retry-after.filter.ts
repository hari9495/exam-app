import { ArgumentsHost, Catch, HttpException } from '@nestjs/common';
import { BaseExceptionFilter, HttpAdapterHost } from '@nestjs/core';
import { POOL_EXHAUSTED_RETRY_AFTER_SECONDS } from '@exam-platform/shared';

// Puts a real `Retry-After` header on the 503 that TenantPrismaService raises
// when the connection pool is exhausted. That exception can only carry a body
// (HttpException has no header channel), so the retry hint the server already
// computes -- POOL_EXHAUSTED_RETRY_AFTER_SECONDS -- never reached the wire; the
// candidate client had to guess a backoff instead of being told one. See the
// note this replaces in tenant-prisma.service.ts's rethrowMappingPoolExhaustion.
//
// Keyed on the response body's `error` discriminator rather than on the status
// code, because 503 is not exclusively ours -- matching on status alone would
// stamp a 3-second hint onto any other SERVICE_UNAVAILABLE a dependency raises.
//
// Everything else is handed to BaseExceptionFilter untouched. This is the only
// exception filter in the app, so it must not change the response shape of any
// exception it isn't specifically here for.
@Catch(HttpException)
export class ServerBusyRetryAfterFilter extends BaseExceptionFilter {
  constructor(httpAdapterHost: HttpAdapterHost) {
    super(httpAdapterHost.httpAdapter);
  }

  catch(exception: HttpException, host: ArgumentsHost): void {
    // A global filter also sees the monitoring WebSocket gateway's exceptions,
    // where switchToHttp() yields no usable response object.
    if (host.getType() === 'http' && isServerBusy(exception)) {
      host.switchToHttp().getResponse().setHeader('Retry-After', String(POOL_EXHAUSTED_RETRY_AFTER_SECONDS));
    }
    super.catch(exception, host);
  }
}

function isServerBusy(exception: HttpException): boolean {
  const body = exception.getResponse();
  return typeof body === 'object' && body !== null && (body as { error?: unknown }).error === 'server_busy';
}
