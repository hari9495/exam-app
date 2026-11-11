import { ArgumentsHost, Catch, HttpException, HttpStatus, Logger, NotFoundException } from '@nestjs/common';
import { BaseExceptionFilter, HttpAdapterHost } from '@nestjs/core';
import { Request } from 'express';
import { TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { mintNotFoundRef } from './help/not-found-ref';

// The api's only other global filter is SystemEventsExceptionFilter, a @Catch() catch-all.
// Without a more specific HttpException filter, every deliberate HttpException (401 bad login,
// 403, 404, 400 validation) was reaching that catch-all and being emitted to the client as a
// blank 500 — so e.g. a wrong password surfaced as "Something went wrong on our side" instead
// of "Invalid credentials". Nest matches global filters in REVERSE registration order, so
// registering this @Catch(HttpException) filter AFTER the catch-all makes Nest route every
// HttpException here (emitted with its real status via BaseExceptionFilter), leaving the
// catch-all to record + report only genuine non-HTTP crashes. Mirrors exam-runtime's
// ServerBusyRetryAfterFilter, which already gives that app correct 4xx responses.
//
// Answer 947: a 404 to a signed-in person of a company carries a short reference support can look up. It is made the
// same way for a missing record and another company's record (both are this same 404), so it tells nothing apart.
@Catch(HttpException)
export class HttpExceptionFilter extends BaseExceptionFilter {
  private readonly log = new Logger(HttpExceptionFilter.name);

  constructor(
    httpAdapterHost: HttpAdapterHost,
    private readonly tenantPrisma?: TenantPrismaService,
  ) {
    super(httpAdapterHost.httpAdapter);
  }

  async catch(exception: HttpException, host: ArgumentsHost): Promise<void> {
    const req = host.getType() === 'http' ? host.switchToHttp().getRequest<Request>() : null;
    const user = req?.user as { organizationId?: string | null; userId?: string; role?: string; actingSuperAdmin?: boolean; supportSessionId?: string | null; permissionProfileId?: string | null } | undefined;
    if (exception.getStatus() !== HttpStatus.NOT_FOUND || !this.tenantPrisma || !user?.organizationId || !req || req.originalUrl.includes('/help/not-found')) {
      return super.catch(exception, host);
    }
    const ctx: TenantContext = { organizationId: user.organizationId, isSuperAdmin: false, supportSessionId: user.supportSessionId ?? null, userId: user.userId ?? null, role: user.role ?? null, permissionProfileId: user.permissionProfileId ?? null };
    const reference = await mintNotFoundRef(this.tenantPrisma, ctx, req.originalUrl).catch((e: unknown) => (this.log.error(e), null));
    if (!reference) return super.catch(exception, host);
    const body = exception.getResponse();
    super.catch(new NotFoundException({ ...(typeof body === 'object' ? body : { statusCode: 404, message: body }), reference }), host);
  }
}
