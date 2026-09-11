import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { ApiUsageService } from './api-usage.service';
import { endpointLabel } from './endpoint-label';

// Counts PROCESSED public-API requests (authenticated + not throttled -- both guards already
// passed, else this interceptor never runs). Records on success AND on handler error (the caller
// consumed a request either way). Throttled (429) requests are counted separately in
// PublicApiThrottlerGuard, because a guard rejection short-circuits before any interceptor runs.
@Injectable()
export class ApiUsageInterceptor implements NestInterceptor {
  constructor(private readonly apiUsage: ApiUsageService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest();
    const orgId: string | undefined = req.apiKeyOrg?.organizationId;
    const endpoint = endpointLabel(req.method, req.route?.path);
    const recordOnce = () => {
      if (!orgId) return;
      void this.apiUsage.record({ organizationId: orgId, isSuperAdmin: false }, endpoint, 'request');
    };
    // tap fires its next/error callbacks exactly once for this request; record in both so a
    // handler that throws (4xx/5xx) is still counted as a processed request.
    return next.handle().pipe(tap({ next: recordOnce, error: recordOnce }));
  }
}
