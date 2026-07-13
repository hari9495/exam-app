import { ExecutionContext, HttpException, Injectable, Logger } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

// ThrottlerGuard awaits the Redis-backed storage on every request with no
// fallback, which would turn a Redis outage into a 500 on every route. A
// rate limiter is a protection layer, not a dependency the whole API should
// die for -- so storage failures fail open (request allowed, warning logged),
// while genuine throttling rejections (ThrottlerException -> 429, an
// HttpException) still propagate.
@Injectable()
export class FailOpenThrottlerGuard extends ThrottlerGuard {
  private readonly failOpenLogger = new Logger(FailOpenThrottlerGuard.name);

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
