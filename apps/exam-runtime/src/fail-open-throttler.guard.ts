import { ExecutionContext, HttpException, Injectable, Logger } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { candidateThrottleKey } from './candidate-throttle-key';

// A near-twin of apps/api's FailOpenThrottlerGuard (monorepo apps don't
// cross-import internals). The fail-open behaviour below is shared; the
// getTracker override is exam-runtime-only, because only this app serves
// candidates who share an office/exam-hall IP. Keep the fail-open half in sync.
//
// ThrottlerGuard awaits the Redis-backed storage on every request with no
// fallback, which would turn a Redis outage into a 500 on every route. A
// rate limiter is a protection layer, not a dependency the whole API should
// die for -- so storage failures fail open (request allowed, warning logged),
// while genuine throttling rejections (ThrottlerException -> 429, an
// HttpException) still propagate.
@Injectable()
export class FailOpenThrottlerGuard extends ThrottlerGuard {
  private readonly failOpenLogger = new Logger(FailOpenThrottlerGuard.name);

  // Bucket candidate requests by candidate identity, not client IP, so an office
  // full of candidates behind one NAT each get their own allowance instead of
  // sharing the office's single IP bucket (which would reject nearly every
  // request once a cohort is polling). Anonymous/foreign traffic still keys on
  // IP via super.getTracker. See candidate-throttle-key.ts and ADO #6823.
  protected async getTracker(req: Record<string, unknown>): Promise<string> {
    return candidateThrottleKey(req) ?? (await super.getTracker(req));
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      return await super.canActivate(context);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      this.failOpenLogger.warn(`Rate-limit storage unavailable, allowing request: ${message}`);
      return true;
    }
  }
}
