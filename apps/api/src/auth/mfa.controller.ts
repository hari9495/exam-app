import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, HttpCode, Param, ParseUUIDPipe, Post, Req, Res, UnauthorizedException, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { SessionAssurance, TenantContext, stepUpWindowSeconds } from '@exam-platform/shared';
import { STRICT_AUTH_THROTTLE } from '../rate-limit-tiers';
import { JwtAuthGuard } from './jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentTenant } from './current-tenant.decorator';
import { AuthService } from './auth.service';
import { signInResponse } from './auth.controller';
import { MfaService, MfaUser } from './mfa.service';
import { MfaResetService } from './mfa-reset.service';
import { LoginProtectionService, TooManyLoginAttemptsException } from './login-protection.service';
import { resolveClientMeta } from './sessions.service';
import { RequireStepUp } from './step-up.decorator';
import { AuditService } from '@exam-platform/shared';
import { ConfirmTotpDto, MfaLoginDto, MfaProofDto, MfaTokenDto, RegisterPasskeyDto, RequestMfaResetDto } from './dto/mfa.dto';

interface RequestUser {
  userId: string;
  sessionId: string;
  impersonatorUserId?: string;
  session: SessionAssurance;
}

// Me › Security two-step verification, the second step of sign-in, step-up (YX-IAM-01/02/03/11)
// and admin MFA resets. Bearer-token authenticated (or, for the sign-in step, the pending-sign-in
// token bound to the device cookie): no cookie authenticates a state change here, so no CSRF.
@Controller()
export class MfaController {
  constructor(
    private readonly auth: AuthService,
    private readonly mfa: MfaService,
    private readonly resets: MfaResetService,
    private readonly loginProtection: LoginProtectionService,
    private readonly audit: AuditService,
  ) {}

  // ---- second step of sign-in (public) ----------------------------------------------------

  @Post('auth/mfa/passkey-options')
  @HttpCode(200)
  @Throttle(STRICT_AUTH_THROTTLE)
  loginPasskeyOptions(@Body() dto: MfaTokenDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.auth.mfaLoginPasskeyOptions(dto.mfaToken, resolveClientMeta(req, res));
  }

  @Post('auth/mfa/verify')
  @HttpCode(200)
  @Throttle(STRICT_AUTH_THROTTLE)
  async verifyLogin(@Body() dto: MfaLoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return signInResponse(await this.auth.completeMfaLogin(dto, resolveClientMeta(req, res)), res);
  }

  // ---- the signed-in user's own factors ---------------------------------------------------

  // Never while impersonating: "me" would be the target, and their factors are theirs alone.
  private async me(req: Request): Promise<{ me: RequestUser; user: MfaUser }> {
    const me = req.user as RequestUser;
    if (me.impersonatorUserId) {
      throw new ForbiddenException('Not available while impersonating');
    }
    const user = await this.mfa.loadUser(me.userId);
    if (!user) throw new UnauthorizedException();
    return { me, user };
  }

  @Get('auth/mfa')
  @UseGuards(JwtAuthGuard)
  async status(@Req() req: Request) {
    const { me, user } = await this.me(req);
    return this.mfa.status(user, me.session);
  }

  @Post('auth/mfa/totp/setup')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  async startTotp(@Req() req: Request) {
    const { me, user } = await this.me(req);
    return this.mfa.startTotp(user, me.session, me.sessionId);
  }

  @Post('auth/mfa/totp/confirm')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  async confirmTotp(@Req() req: Request, @Body() dto: ConfirmTotpDto) {
    const { me, user } = await this.me(req);
    return this.mfa.confirmTotp(user, me.session, me.sessionId, dto.code, dto.label);
  }

  @Post('auth/mfa/passkeys/registration-options')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  async passkeyRegistrationOptions(@Req() req: Request) {
    const { me, user } = await this.me(req);
    return this.mfa.passkeyRegistrationOptions(user, me.session, me.sessionId);
  }

  @Post('auth/mfa/passkeys')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  async registerPasskey(@Req() req: Request, @Body() dto: RegisterPasskeyDto) {
    const { me, user } = await this.me(req);
    return this.mfa.registerPasskey(user, me.session, me.sessionId, dto.credential, dto.label);
  }

  @Post('auth/mfa/recovery-codes')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequireStepUp()
  async regenerateRecoveryCodes(@Req() req: Request) {
    return this.mfa.regenerateRecoveryCodes((await this.me(req)).user);
  }

  @Delete('auth/mfa/authenticators/:id')
  @HttpCode(204)
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequireStepUp()
  async removeFactor(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    await this.mfa.removeFactor((await this.me(req)).user, id);
  }

  // ---- step-up (YX-IAM-02) ----------------------------------------------------------------

  @Post('auth/mfa/step-up/passkey-options')
  @HttpCode(200)
  @Throttle(STRICT_AUTH_THROTTLE)
  @UseGuards(JwtAuthGuard)
  async stepUpPasskeyOptions(@Req() req: Request) {
    const { me, user } = await this.me(req);
    return this.mfa.stepUpPasskeyOptions(user, me.sessionId);
  }

  // Re-verify with a second factor; step-up actions are then allowed for the step-up window.
  // Guessing shares the sign-in second-factor lockout for this account.
  @Post('auth/mfa/step-up')
  @HttpCode(200)
  @Throttle(STRICT_AUTH_THROTTLE)
  @UseGuards(JwtAuthGuard)
  async stepUp(@Req() req: Request, @Body() dto: MfaProofDto) {
    const { me, user } = await this.me(req);
    const ip = req.ip ?? null;
    const ctx = { organizationId: user.organizationId, isSuperAdmin: user.role === 'super_admin' };
    if (!(await this.mfa.hasFactor(user))) {
      throw new BadRequestException('Set up a passkey or an authenticator app first');
    }
    const block = await this.loginProtection.check('mfa', user.id, ip);
    if (block) throw new TooManyLoginAttemptsException(block.retryAfterSeconds);
    const challenge = dto.factor === 'passkey' ? await this.mfa.takeStepUpChallenge(me.sessionId) : null;
    const factor = await this.mfa.verifyProof(user, dto, challenge);
    if (!factor) {
      await this.loginProtection.registerFailure('mfa', user.id, ip);
      await this.audit.record(ctx, { actorUserId: user.id, action: 'mfa.step_up_failed', entityType: 'session', entityId: me.sessionId, metadata: { factor: dto.factor } });
      throw new UnauthorizedException('That verification did not work. Try again.');
    }
    await this.loginProtection.registerSuccess('mfa', user.id, ip);
    const verifiedAt = await this.mfa.elevateSession(user, me.sessionId, factor);
    await this.audit.record(ctx, { actorUserId: user.id, action: 'mfa.step_up', entityType: 'session', entityId: me.sessionId, metadata: { factor } });
    return { stepUpValidUntil: new Date(verifiedAt.getTime() + stepUpWindowSeconds() * 1000) };
  }

  // ---- admin MFA reset (YX-IAM-11) --------------------------------------------------------

  private actor(req: Request): RequestUser {
    const user = req.user as RequestUser;
    if (user.impersonatorUserId) throw new ForbiddenException('Not available while impersonating');
    return user;
  }

  @Get('security/mfa-resets')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('org:manage_users')
  listResets(@CurrentTenant() ctx: TenantContext) {
    return this.resets.listPending(ctx);
  }

  @Post('security/mfa-resets')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('org:manage_users')
  @RequireStepUp()
  requestReset(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: RequestMfaResetDto) {
    return this.resets.request(ctx, this.actor(req).userId, dto.userId, dto.reason);
  }

  @Post('security/mfa-resets/:id/approve')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('org:manage_users')
  @RequireStepUp()
  approveReset(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.resets.approve(ctx, this.actor(req).userId, id);
  }
}
