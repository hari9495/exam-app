import { CallHandler, ExecutionContext } from '@nestjs/common';
import { Observable, of, throwError } from 'rxjs';
import { ApiUsageInterceptor } from './api-usage.interceptor';
import { ApiUsageService } from './api-usage.service';

describe('ApiUsageInterceptor', () => {
  function makeContext(request: Record<string, any>): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;
  }

  function makeHandler(observable: Observable<unknown>): CallHandler {
    return { handle: () => observable } as CallHandler;
  }

  it('records a request on handler success, using the route template as endpoint', (done) => {
    const apiUsage = { record: jest.fn().mockResolvedValue(undefined) } as unknown as ApiUsageService;
    const interceptor = new ApiUsageInterceptor(apiUsage);
    const context = makeContext({ apiKeyOrg: { organizationId: 'org-1' }, method: 'GET', route: { path: '/public/candidates' } });

    interceptor.intercept(context, makeHandler(of('ok'))).subscribe({
      next: () => {
        expect(apiUsage.record).toHaveBeenCalledTimes(1);
        expect(apiUsage.record).toHaveBeenCalledWith({ organizationId: 'org-1', isSuperAdmin: false }, 'GET /public/candidates', 'request');
        done();
      },
    });
  });

  it('records a request on handler error and still propagates the error', (done) => {
    const apiUsage = { record: jest.fn().mockResolvedValue(undefined) } as unknown as ApiUsageService;
    const interceptor = new ApiUsageInterceptor(apiUsage);
    const context = makeContext({ apiKeyOrg: { organizationId: 'org-1' }, method: 'GET', route: { path: '/public/candidates' } });

    interceptor.intercept(context, makeHandler(throwError(() => new Error('boom')))).subscribe({
      error: (err) => {
        expect(err.message).toBe('boom');
        expect(apiUsage.record).toHaveBeenCalledTimes(1);
        expect(apiUsage.record).toHaveBeenCalledWith({ organizationId: 'org-1', isSuperAdmin: false }, 'GET /public/candidates', 'request');
        done();
      },
    });
  });

  it('does not record when request.apiKeyOrg is absent', (done) => {
    const apiUsage = { record: jest.fn().mockResolvedValue(undefined) } as unknown as ApiUsageService;
    const interceptor = new ApiUsageInterceptor(apiUsage);
    const context = makeContext({ method: 'GET', route: { path: '/public/candidates' } });

    interceptor.intercept(context, makeHandler(of('ok'))).subscribe({
      next: () => {
        expect(apiUsage.record).not.toHaveBeenCalled();
        done();
      },
    });
  });
});
