import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { FailOpenThrottlerGuard } from '../fail-open-throttler.guard';

const jwt = new JwtService();

// POST /auth/refresh budget per SESSION, not per IP: an office behind one public address, or one
// person with several tabs, must not throw each other out. The key is the session (the refresh
// token's familyId, which survives rotation) and only from a token whose signature checks out, so a
// caller cannot mint fresh budgets with made-up tokens; anything else (no token, forged, expired)
// shares its IP's budget. Applied with @SkipGlobalThrottle() so the app-wide IP tier does not also
// count the route. Fails open on a Redis outage like the global tier: refresh is token-authenticated.
@Injectable()
export class RefreshThrottlerGuard extends FailOpenThrottlerGuard {
  protected async shouldSkip(): Promise<boolean> {
    return false;
  }

  protected async getTracker(req: Record<string, any>): Promise<string> {
    const token: unknown = req.body?.refreshToken ?? req.cookies?.refresh_token;
    if (typeof token === 'string' && token) {
      try {
        const { familyId } = jwt.verify<{ familyId?: string }>(token, { secret: process.env.JWT_REFRESH_SECRET });
        if (typeof familyId === 'string' && familyId) return `session:${familyId}`;
      } catch {
        // not a live refresh token: fall through to the IP
      }
    }
    return `ip:${await super.getTracker(req)}`;
  }
}
