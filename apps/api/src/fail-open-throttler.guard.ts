import { ExecutionContext, HttpException, Injectable, Logger, SetMetadata } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

// Marks a controller/route as exempt from the app-wide IP-keyed throttler
// (FailOpenThrottlerGuard, registered as APP_GUARD) while leaving any
// route-level ThrottlerGuard subclass applied via @UseGuards() untouched.
//
// This is deliberately its own reflector key rather than @nestjs/throttler's
// built-in @SkipThrottle(): that decorator's skip metadata is read inside
// ThrottlerGuard.canActivate's per-named-throttler loop, which every guard
// instance shares (they all resolve the same ThrottlerModuleOptions) -- since
// this app registers a single throttler named 'default', @SkipThrottle()
// would skip that name for EVERY guard checking the route, including a
// route-level guard like PublicApiThrottlerGuard that also targets 'default'.
// shouldSkip(), by contrast, is a per-guard-subclass override point called
// once at the top of canActivate, so only guards that opt in (below) skip.
export const SKIP_GLOBAL_THROTTLE = 'skipGlobalThrottle';
export const SkipGlobalThrottle = () => SetMetadata(SKIP_GLOBAL_THROTTLE, true);

// This file has a byte-identical twin in the other app (apps/api and
// apps/exam-runtime each carry one copy, since monorepo apps don't
// cross-import internals) -- EXCEPT for the shouldSkip() override below,
// which is apps/api-only: exam-runtime has no route-level org-scoped
// throttler guard for the global tier to double up with. Keep the rest in
// sync; the unit spec lives in apps/api.
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

  protected async shouldSkip(context: ExecutionContext): Promise<boolean> {
    return this.reflector.getAllAndOverride<boolean>(SKIP_GLOBAL_THROTTLE, [context.getHandler(), context.getClass()]) ?? false;
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
