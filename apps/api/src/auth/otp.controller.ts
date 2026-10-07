import { Body, Controller, Delete, ForbiddenException, HttpCode, Post, Req, Res, UnauthorizedException, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { SessionAssurance } from '@exam-platform/shared';
import { STRICT_AUTH_THROTTLE } from '../rate-limit-tiers';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AuthService } from './auth.service';
import { signInResponse } from './auth.controller';
import { MfaService } from './mfa.service';
import { resolveClientMeta } from './sessions.service';
import { assertHuman } from './bot-challenge';
import { CompanyScopeService } from './company-scope';
import { MfaOtpSendDto, MobileCodeDto, MobileNumberDto, OtpStartDto, OtpVerifyDto } from './dto/otp.dto';
import { CredentialThrottle } from './credential-throttler.guard';

interface RequestUser {
  userId: string;
  sessionId: string;
  impersonatorUserId?: string;
  session: SessionAssurance;
}

// One-time codes (P12 §3, M04 Q2): sign-in by email / mobile number, the SMS / WhatsApp fallback
// second factor, and verifying the user's own mobile number. Public steps are bound to the device
// cookie and a token from the previous step; nothing here is authenticated by a cookie alone, so
// no CSRF exposure.
@Controller('auth')
export class OtpController {
  constructor(
    private readonly auth: AuthService,
    private readonly mfa: MfaService,
    private readonly scope: CompanyScopeService,
  ) {}

  @Post('otp/start')
  @HttpCode(200)
  @CredentialThrottle()
  async start(@Body() dto: OtpStartDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await assertHuman(dto.challengeToken, req.ip ?? null);
    const organizationSlug = await this.scope.slugFor(req, dto.organizationSlug);
    return this.auth.startOtpLogin({ ...dto, organizationSlug }, resolveClientMeta(req, res));
  }

  @Post('otp/verify')
  @HttpCode(200)
  @CredentialThrottle()
  async verify(@Body() dto: OtpVerifyDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const organizationSlug = await this.scope.slugFor(req, dto.organizationSlug);
    return signInResponse(await this.auth.completeOtpLogin({ ...dto, organizationSlug }, resolveClientMeta(req, res)), res);
  }

  @Post('mfa/otp/send')
  @HttpCode(200)
  @CredentialThrottle()
  sendMfaOtp(@Body() dto: MfaOtpSendDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.auth.sendMfaOtp(dto, resolveClientMeta(req, res));
  }

  // ---- the signed-in user's own mobile number --------------------------------------------

  private async me(req: Request) {
    const me = req.user as RequestUser;
    if (me.impersonatorUserId) throw new ForbiddenException('Not available while impersonating');
    const user = await this.mfa.loadUser(me.userId);
    if (!user) throw new UnauthorizedException();
    return { me, user };
  }

  @Post('otp/mobile')
  @HttpCode(200)
  @Throttle(STRICT_AUTH_THROTTLE)
  @UseGuards(JwtAuthGuard)
  async startMobile(@Req() req: Request, @Body() dto: MobileNumberDto) {
    const { me, user } = await this.me(req);
    return this.mfa.startMobileVerification(user, me.session, me.sessionId, dto.mobileNumber, dto.channel ?? 'sms', req.ip ?? null);
  }

  @Post('otp/mobile/verify')
  @HttpCode(200)
  @Throttle(STRICT_AUTH_THROTTLE)
  @UseGuards(JwtAuthGuard)
  async confirmMobile(@Req() req: Request, @Body() dto: MobileCodeDto) {
    const { me, user } = await this.me(req);
    return this.mfa.confirmMobile(user, me.session, me.sessionId, dto.code);
  }

  @Delete('otp/mobile')
  @HttpCode(204)
  @UseGuards(JwtAuthGuard)
  async removeMobile(@Req() req: Request) {
    const { me, user } = await this.me(req);
    await this.mfa.removeMobile(user, me.session);
  }
}
