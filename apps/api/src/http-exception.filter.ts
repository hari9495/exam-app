import { ArgumentsHost, Catch, HttpException } from '@nestjs/common';
import { BaseExceptionFilter, HttpAdapterHost } from '@nestjs/core';

// The api's only other global filter is SystemEventsExceptionFilter, a @Catch() catch-all.
// Without a more specific HttpException filter, every deliberate HttpException (401 bad login,
// 403, 404, 400 validation) was reaching that catch-all and being emitted to the client as a
// blank 500 — so e.g. a wrong password surfaced as "Something went wrong on our side" instead
// of "Invalid credentials". Nest matches global filters in REVERSE registration order, so
// registering this @Catch(HttpException) filter AFTER the catch-all makes Nest route every
// HttpException here (emitted with its real status via BaseExceptionFilter), leaving the
// catch-all to record + report only genuine non-HTTP crashes. Mirrors exam-runtime's
// ServerBusyRetryAfterFilter, which already gives that app correct 4xx responses.
@Catch(HttpException)
export class HttpExceptionFilter extends BaseExceptionFilter {
  constructor(httpAdapterHost: HttpAdapterHost) {
    super(httpAdapterHost.httpAdapter);
  }

  catch(exception: HttpException, host: ArgumentsHost): void {
    super.catch(exception, host);
  }
}
