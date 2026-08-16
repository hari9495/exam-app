import { Body, Controller, HttpCode, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import { authCookieSecure } from '@exam-platform/shared';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { CandidateAuthService } from './candidate-auth.service';
import { RedeemInvitationDto } from './dto/redeem-invitation.dto';
import { RefreshDto } from './dto/refresh.dto';
import { STRICT_AUTH_THROTTLE } from '../rate-limit-tiers';
import { resolveClientIp } from '../network/resolve-client-ip';

const CANDIDATE_REFRESH_COOKIE = 'candidate_refresh_token';

// Persistent (not session) cookie so a full browser close + reopen on the same machine
// silently resumes via /refresh, rather than forcing the candidate to re-click the email
// link (an email re-redeem also raises a spurious multi_login proctoring flag). maxAge
// mirrors the refresh token's own TTL so cookie and token expire together. Read at call
// time — the same way the service reads this env — so it honours a configured TTL
// regardless of import ordering.
//
// `secure` used to be `process.env.NODE_ENV === 'production'`, with a comment claiming it
// was on in production. NODE_ENV is not set on the production VM, so it was NOT on -- the
// candidate session cookie shipped without Secure. authCookieSecure() is on by default with
// an explicit INSECURE_COOKIES opt-out for local http dev and the e2e suite.
function refreshCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: authCookieSecure(),
    maxAge: Number(process.env.CANDIDATE_REFRESH_TOKEN_TTL_DAYS ?? 1) * 24 * 60 * 60 * 1000,
  };
}

@Controller('candidate-auth')
export class CandidateAuthController {
  constructor(private readonly candidateAuthService: CandidateAuthService) {}

  @Post('redeem')
  @HttpCode(200)
  @Throttle(STRICT_AUTH_THROTTLE)
  async redeem(@Body() dto: RedeemInvitationDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const tokens = await this.candidateAuthService.redeem(dto.token, resolveClientIp(req));
    res.cookie(CANDIDATE_REFRESH_COOKIE, tokens.refreshToken, refreshCookieOptions());
    return { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken };
  }

  @Post('refresh')
  @HttpCode(200)
  @Throttle(STRICT_AUTH_THROTTLE)
  async refresh(@Body() dto: RefreshDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = dto.refreshToken ?? req.cookies?.[CANDIDATE_REFRESH_COOKIE];
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token required');
    }
    const tokens = await this.candidateAuthService.refresh(refreshToken);
    res.cookie(CANDIDATE_REFRESH_COOKIE, tokens.refreshToken, refreshCookieOptions());
    return { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken };
  }

  @Post('logout')
  @HttpCode(200)
  async logout(@Body() dto: RefreshDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = dto.refreshToken ?? req.cookies?.[CANDIDATE_REFRESH_COOKIE];
    if (refreshToken) {
      await this.candidateAuthService.logout(refreshToken);
    }
    res.clearCookie(CANDIDATE_REFRESH_COOKIE);
    return { success: true };
  }
}
