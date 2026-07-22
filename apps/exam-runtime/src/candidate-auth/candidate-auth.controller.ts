import { Body, Controller, HttpCode, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { CandidateAuthService } from './candidate-auth.service';
import { RedeemInvitationDto } from './dto/redeem-invitation.dto';
import { RefreshDto } from './dto/refresh.dto';
import { STRICT_AUTH_THROTTLE } from '../rate-limit-tiers';
import { resolveClientIp } from '../network/resolve-client-ip';

const CANDIDATE_REFRESH_COOKIE = 'candidate_refresh_token';

@Controller('candidate-auth')
export class CandidateAuthController {
  constructor(private readonly candidateAuthService: CandidateAuthService) {}

  @Post('redeem')
  @HttpCode(200)
  @Throttle(STRICT_AUTH_THROTTLE)
  async redeem(@Body() dto: RedeemInvitationDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const tokens = await this.candidateAuthService.redeem(dto.token, resolveClientIp(req));
    res.cookie(CANDIDATE_REFRESH_COOKIE, tokens.refreshToken, { httpOnly: true, sameSite: 'lax', secure: false });
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
    res.cookie(CANDIDATE_REFRESH_COOKIE, tokens.refreshToken, { httpOnly: true, sameSite: 'lax', secure: false });
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
