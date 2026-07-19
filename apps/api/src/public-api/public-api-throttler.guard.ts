import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class PublicApiThrottlerGuard extends ThrottlerGuard {
  // Keyed by the resolved organization, not IP -- a per-org public API must not be
  // limited by shared egress infrastructure on the caller's side. Requires
  // ApiKeyAuthGuard to have already run and set request.apiKeyOrg (guard order
  // matters: @UseGuards(ApiKeyAuthGuard, PublicApiThrottlerGuard), never reversed).
  // Deliberately does NOT extend FailOpenThrottlerGuard -- that guard fails open by
  // design for the staff console; a public-facing surface should fail closed.
  protected async getTracker(req: Record<string, any>): Promise<string> {
    return req.apiKeyOrg?.organizationId ?? req.ip;
  }
}
