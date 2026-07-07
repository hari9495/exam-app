import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { CandidateAuthService } from './candidate-auth.service';
import { RedeemInvitationDto } from './dto/redeem-invitation.dto';
import { RefreshDto } from '../auth/dto/refresh.dto';

@Controller('candidate-auth')
export class CandidateAuthController {
  constructor(private readonly candidateAuthService: CandidateAuthService) {}

  @Post('redeem')
  @HttpCode(200)
  redeem(@Body() dto: RedeemInvitationDto) {
    return this.candidateAuthService.redeem(dto.token);
  }

  @Post('refresh')
  @HttpCode(200)
  refresh(@Body() dto: RefreshDto) {
    return this.candidateAuthService.refresh(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(200)
  async logout(@Body() dto: RefreshDto) {
    await this.candidateAuthService.logout(dto.refreshToken);
    return { success: true };
  }
}
