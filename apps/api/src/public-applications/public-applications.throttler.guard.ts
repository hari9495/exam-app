import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class PublicApplicationsThrottlerGuard extends ThrottlerGuard {
  // Keyed by the applyToken (or offer token) route param, not IP -- same reasoning as
  // WalkInThrottlerGuard: this is a public unauthenticated surface, and IP-keyed throttling
  // would let candidates behind a shared NAT/WiFi exhaust each other's budget. Also reused by
  // PublicOffersController's :token param (accept/decline), which gets its own token-scoped
  // budget the same way. The status route has neither (it uses statusToken instead), so it
  // falls back to a fixed 'status' bucket shared by all status lookups rather than trusting an
  // unvalidated route param as a per-caller key.
  // Deliberately does NOT extend FailOpenThrottlerGuard -- public-facing surface, fail closed.
  // Token-less routes (status lookups, the jobs-feed) fall back to their route PATTERN, so each
  // gets its own shared bucket instead of colliding in one 'status' pool -- otherwise a burst of
  // status checks and an aggregator polling the feed would 429 each other.
  protected async getTracker(req: Record<string, any>): Promise<string> {
    return req.params?.applyToken ?? req.params?.token ?? req.route?.path ?? 'status';
  }
}
