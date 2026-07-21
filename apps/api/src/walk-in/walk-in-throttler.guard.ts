import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class WalkInThrottlerGuard extends ThrottlerGuard {
  // Keyed by the org slug route param, not IP -- a walk-in event is a crowd of candidates
  // sharing one venue's WiFi/NAT, so IP-keyed throttling would make them all share a single
  // org's budget. Falls back to req.ip if the param is somehow missing (malformed request),
  // same fail-safe spirit as PublicApiThrottlerGuard's req.ip fallback.
  // Deliberately does NOT extend FailOpenThrottlerGuard -- this is a public-facing surface,
  // which should fail closed, same reasoning as PublicApiThrottlerGuard.
  protected async getTracker(req: Record<string, any>): Promise<string> {
    return req.params?.orgSlug ?? req.ip;
  }
}
