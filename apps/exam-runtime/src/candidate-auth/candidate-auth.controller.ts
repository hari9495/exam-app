import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CandidateAuthService } from './candidate-auth.service';
import { RedeemInvitationDto } from './dto/redeem-invitation.dto';
import { RefreshDto } from './dto/refresh.dto';
import { STRICT_AUTH_THROTTLE } from '../rate-limit-tiers';

@Controller('candidate-auth')
export class CandidateAuthController {
  constructor(private readonly candidateAuthService: CandidateAuthService) {}

  @Post('redeem')
  @HttpCode(200)
  @Throttle(STRICT_AUTH_THROTTLE)
  async redeem(@Body() dto: RedeemInvitationDto) {
    const tokens = await this.candidateAuthService.redeem(dto.token);
    return { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken };
  }

  @Post('refresh')
  @HttpCode(200)
  @Throttle(STRICT_AUTH_THROTTLE)
  async refresh(@Body() dto: RefreshDto) {
    const tokens = await this.candidateAuthService.refresh(dto.refreshToken);
    return { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken };
  }

  @Post('logout')
  @HttpCode(200)
  async logout(@Body() dto: RefreshDto) {
    await this.candidateAuthService.logout(dto.refreshToken);
    return { success: true };
  }
}
