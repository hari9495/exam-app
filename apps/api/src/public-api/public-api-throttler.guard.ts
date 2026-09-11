import { ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { getOptionsToken, getStorageToken, ThrottlerGuard, ThrottlerLimitDetail, ThrottlerModuleOptions, ThrottlerStorage } from '@nestjs/throttler';
import { ApiUsageService } from '../api-usage/api-usage.service';
import { endpointLabel } from '../api-usage/endpoint-label';

@Injectable()
export class PublicApiThrottlerGuard extends ThrottlerGuard {
  // Keyed by the resolved organization, not IP -- a per-org public API must not be
  // limited by shared egress infrastructure on the caller's side. Requires
  // ApiKeyAuthGuard to have already run and set request.apiKeyOrg (guard order
  // matters: @UseGuards(ApiKeyAuthGuard, PublicApiThrottlerGuard), never reversed).
  // Deliberately does NOT extend FailOpenThrottlerGuard -- that guard fails open by
  // design for the staff console; a public-facing surface should fail closed.
  constructor(
    @Inject(getOptionsToken()) options: ThrottlerModuleOptions,
    @Inject(getStorageToken()) storageService: ThrottlerStorage,
    reflector: Reflector,
    private readonly apiUsage: ApiUsageService,
  ) {
    super(options, storageService, reflector);
  }

  protected async getTracker(req: Record<string, any>): Promise<string> {
    return req.apiKeyOrg?.organizationId ?? req.ip;
  }

  // A 429 is thrown here, inside a guard -- before any interceptor runs -- so this is the only
  // place a throttled request can be counted. Record (fire-and-forget) then throw as before.
  protected async throwThrottlingException(context: ExecutionContext, throttlerLimitDetail: ThrottlerLimitDetail): Promise<void> {
    const req = context.switchToHttp().getRequest();
    const orgId: string | undefined = req.apiKeyOrg?.organizationId;
    if (orgId) {
      void this.apiUsage.record({ organizationId: orgId, isSuperAdmin: false }, endpointLabel(req.method, req.route?.path), 'throttled');
    }
    return super.throwThrottlingException(context, throttlerLimitDetail);
  }
}
