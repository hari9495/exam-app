import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Req, Res, UnauthorizedException, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { createHash, timingSafeEqual } from 'crypto';
import { PrismaService, TenantPrismaService, isOrganizationActive, ORGANIZATION_INACTIVE_MESSAGE, authCookieSecure } from '@exam-platform/shared';
import { AuthService, LoginOutcome, isPending } from './auth.service';
import { LoginDto, PlatformLoginDto, SelectCompanyDto } from './dto/login.dto';
import { CompanyScopeService, REMEMBERED_COMPANY_COOKIE, clearRememberedCompany, setRememberedCompany } from './company-scope';
import { RefreshDto } from './dto/refresh.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { SsoExchangeDto } from './dto/sso-exchange.dto';
import { PasskeySignInDto } from './dto/mfa.dto';
import { PUBLIC_API_THROTTLE, REFRESH_THROTTLE, STRICT_AUTH_THROTTLE } from '../rate-limit-tiers';
import { SkipGlobalThrottle } from '../fail-open-throttler.guard';
import { RefreshThrottlerGuard } from './refresh-throttler.guard';
import { JwtAuthGuard } from './jwt-auth.guard';
import { MfaRequiredException, PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentUserId } from './current-user-id.decorator';
import { SessionsService, resolveClientMeta } from './sessions.service';
import { SensitiveRoleAction } from './step-up.decorator';
import { assertHuman } from './bot-challenge';
import { CredentialThrottle } from './credential-throttler.guard';

const REFRESH_COOKIE = 'refresh_token';
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const sameHash = (a: string | null, b: string) => a !== null && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

// One definition for all three set-cookie sites. `secure` was previously hardcoded false at
// each of them; see authCookieSecure() for why it is now on by default with an explicit
// local-dev opt-out rather than an environment-detection opt-in.
export function refreshCookieOptions() {
  return { httpOnly: true, sameSite: 'lax' as const, secure: authCookieSecure() };
}

// A finished sign-in sets the refresh cookie (and remembers the company on this device); a pending
// one (second factor or company choice owed) sets nothing.
export function signInResponse(outcome: LoginOutcome, res: Response) {
  if (isPending(outcome)) {
    return outcome;
  }
  res.cookie(REFRESH_COOKIE, outcome.refreshToken, refreshCookieOptions());
  if (outcome.rememberCompany) setRememberedCompany(res, outcome.rememberCompany);
  return { accessToken: outcome.accessToken, ...(outcome.mfa ? { mfa: outcome.mfa } : {}) };
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly sessions: SessionsService,
    private readonly scope: CompanyScopeService,
  ) {}

  // The company comes from orgSlug, the web address or the remembered company; none = email-first.
  @Post('staff/login')
  @HttpCode(200)
  @CredentialThrottle()
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await assertHuman(dto.challengeToken, req.ip ?? null);
    const organizationSlug = await this.scope.slugFor(req, dto.organizationSlug);
    return signInResponse(await this.authService.login({ ...dto, organizationSlug }, resolveClientMeta(req, res)), res);
  }

  // YukthiX platform staff only (P12 Q7, W-005). The company sign-in above never reaches a staff
  // account, and this one never reaches a company account.
  @Post('platform/login')
  @HttpCode(200)
  @CredentialThrottle()
  async platformLogin(@Body() dto: PlatformLoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await assertHuman(dto.challengeToken, req.ip ?? null);
    return signInResponse(await this.authService.loginPlatformStaff(dto, resolveClientMeta(req, res)), res);
  }

  // The company picked when one credential matched several (single-use token from staff/login or otp/verify).
  @Post('staff/select-company')
  @HttpCode(200)
  @CredentialThrottle()
  async selectCompany(@Body() dto: SelectCompanyDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return signInResponse(await this.authService.selectCompany(dto, resolveClientMeta(req, res)), res);
  }

  // "Sign in with a passkey" (founder decision 7 Oct 2026): a challenge for this device, then the
  // assertion. A user-verifying passkey is the whole sign-in at AAL2 (no password, no second step).
  @Post('passkey/options')
  @HttpCode(200)
  @CredentialThrottle()
  passkeyOptions(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.authService.passkeySignInOptions(resolveClientMeta(req, res));
  }

  @Post('passkey/verify')
  @HttpCode(200)
  @CredentialThrottle()
  async passkeySignIn(@Body() dto: PasskeySignInDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const meta = resolveClientMeta(req, res);
    return signInResponse(await this.authService.passkeySignIn(dto.credential, (await this.scope.slugFor(req)) ?? null, meta), res);
  }

  // "Signing in to <company>": name and logo of the company this device last signed in to, nothing
  // else. An altered cookie is dropped.
  @Get('remembered-company')
  // Read on every sign-in page load: the public tier, like sign-in-options (an office behind one IP).
  @Throttle(PUBLIC_API_THROTTLE)
  async rememberedCompany(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const org = await this.scope.remembered(req);
    if (!org && req.cookies?.[REMEMBERED_COMPANY_COOKIE] !== undefined) clearRememberedCompany(res);
    return { company: org ? await this.scope.card(org) : null };
  }

  // "Not your company?": forget it on this device (back to email-first).
  @Delete('remembered-company')
  @HttpCode(204)
  forgetCompany(@Res({ passthrough: true }) res: Response) {
    clearRememberedCompany(res);
  }

  @Post('forgot-password')
  @HttpCode(200)
  @CredentialThrottle()
  async forgotPassword(@Body() dto: ForgotPasswordDto, @Req() req: Request) {
    await this.authService.forgotPassword({ ...dto, organizationSlug: await this.scope.slugFor(req, dto.organizationSlug) }, !dto.organizationSlug);
    return { message: 'If an account with that email exists, a reset link has been sent.' };
  }

  @Post('reset-password')
  @HttpCode(200)
  @Throttle(STRICT_AUTH_THROTTLE)
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.authService.resetPassword(dto);
    return { success: true };
  }

  @Post('refresh')
  @HttpCode(200)
  @Throttle(REFRESH_THROTTLE)
  @SkipGlobalThrottle()
  @UseGuards(RefreshThrottlerGuard)
  async refresh(@Body() dto: RefreshDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = dto.refreshToken ?? req.cookies?.[REFRESH_COOKIE];
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token required');
    }
    const tokens = await this.authService.refresh(refreshToken, req.ip ?? null);
    res.cookie(REFRESH_COOKIE, tokens.refreshToken, refreshCookieOptions());
    return { accessToken: tokens.accessToken };
  }

  @Post('sso/exchange')
  @HttpCode(200)
  @CredentialThrottle()
  async ssoExchange(@Body() dto: SsoExchangeDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const meta = resolveClientMeta(req, res);
    const codeHash = createHash('sha256').update(dto.code).digest('hex');
    // `sso_login_codes` itself carries no RLS policy (it's not org-scoped --
    // the code is the only credential at this point), so this plain lookup is
    // fine. Its `user` relation, however, points at `users`, which IS
    // RLS-protected; resolving it via Prisma's `include` on this
    // tenant-unscoped `this.prisma` would hit the RLS block predicate (no
    // session context set) and Prisma would throw "Field user is required to
    // return data, got null instead" instead of the intended 401 -- so the
    // user is looked up separately below, through the same super_admin
    // bypass AuthService.refresh() already uses for this exact "caller has
    // proven identity via a token/code, not an org-scoped session yet" case.
    const record = await this.prisma.ssoLoginCode.findUnique({ where: { codeHash } });

    // Single-use: delete on every lookup attempt, regardless of outcome. deleteMany + count: of two
    // concurrent redemptions exactly one wins.
    const won = record ? (await this.prisma.ssoLoginCode.deleteMany({ where: { id: record.id } })).count === 1 : false;
    // Only the browser that started the sign-in may redeem it (login CSRF; a code leaked through
    // history or logs is useless elsewhere).
    const sameDevice = Boolean(record && sameHash(record.deviceIdHash, sha256(meta.deviceId)));
    if (!record || !won || record.expiresAt < new Date() || !sameDevice) {
      const reason = record && won && record.expiresAt >= new Date() ? 'sso_device_mismatch' : 'invalid_sso_code';
      await this.sessions.recordLoginEvent({ organizationId: null, result: 'failed', method: record?.method === 'oidc' ? 'oidc' : 'saml', reason, meta });
      throw new UnauthorizedException('This sign-in link is invalid or has expired');
    }

    const user = await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) =>
      tx.user.findUnique({ where: { id: record.userId } }),
    );
    if (!user) {
      throw new UnauthorizedException('This sign-in link is invalid or has expired');
    }

    const method = record.method === 'oidc' ? 'oidc' : 'saml';
    const failed = (reason: string) =>
      this.sessions.recordLoginEvent({
        organizationId: user.organizationId,
        userId: user.id,
        identifier: user.email.toLowerCase(),
        result: 'failed',
        method,
        reason,
        meta,
      });
    if (user.status !== 'active') {
      await failed('account_inactive');
      throw new UnauthorizedException('This account has been deactivated');
    }

    if (user.organizationId) {
      const org = await this.prisma.organization.findUnique({ where: { id: user.organizationId } });
      if (!isOrganizationActive(org?.status)) {
        await failed('organization_inactive');
        throw new UnauthorizedException(ORGANIZATION_INACTIVE_MESSAGE);
      }
    }

    const outcome = await this.authService.issueTokensForSso(
      { id: user.id, email: user.email, organizationId: user.organizationId, role: user.role, permissionProfileId: user.permissionProfileId ?? null },
      meta,
      { method, mfaAsserted: record.mfaAsserted, identityProviderId: record.identityProviderId },
    );
    return signInResponse(outcome, res);
  }

  @Post('logout')
  @HttpCode(200)
  async logout(@Body() dto: RefreshDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = dto.refreshToken ?? req.cookies?.[REFRESH_COOKIE];
    if (refreshToken) {
      await this.authService.logout(refreshToken);
    }
    // Same attributes as the set. A browser only honours a clearing Set-Cookie whose
    // attributes match the original -- and now that the cookie is Secure, a bare clear was
    // silently ignored, leaving the session cookie in place after logout.
    res.clearCookie(REFRESH_COOKIE, refreshCookieOptions());
    return { success: true };
  }

  // Only from the staff member's own platform session (not from inside a company or an impersonation), with the key.
  @Post('super-admin/switch-into/:orgId')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('platform.support.request')
  async switchIntoOrg(@CurrentUserId() userId: string, @Param('orgId', ParseUUIDPipe) orgId: string, @Req() req: Request) {
    const user = req.user as { sessionId: string; organizationId: string | null; actingSuperAdmin?: boolean; impersonatorUserId?: string; session?: { assuranceLevel: string } };
    if (user.organizationId || user.actingSuperAdmin || user.impersonatorUserId) throw new BadRequestException('Leave the company you are in first');
    // Staff reach company data only with their security key proven on this session (P12 Q7), never in the enrolment grace.
    if (user.session?.assuranceLevel !== 'aal2') throw new MfaRequiredException();
    const accessToken = await this.authService.switchIntoOrg(userId, orgId, user.sessionId);
    return { accessToken };
  }

  @Post('super-admin/switch-out')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  async switchOutOfOrg(@CurrentUserId() userId: string, @Req() req: Request) {
    const user = req.user as { organizationId: string | null; actingSuperAdmin?: boolean; supportSessionId?: string | null };
    await this.authService.recordSwitchOut(userId, user.actingSuperAdmin ? user.organizationId : null, user.supportSessionId);
    return { success: true };
  }

  // Acting as another user is an admin capability: AAL2 once the enrolment grace is over (YX-IAM-01).
  @Post('impersonate/:userId')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @SensitiveRoleAction()
  async impersonate(@Req() req: Request, @Param('userId') userId: string) {
    const caller = req.user as { userId: string; organizationId: string | null; role: string; impersonatorUserId?: string; sessionId: string };
    const accessToken = await this.authService.impersonate(caller, userId);
    return { accessToken };
  }

  @Post('impersonate/stop')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  async stopImpersonating(@Req() req: Request) {
    const user = req.user as { userId: string; impersonatorUserId?: string };
    if (user.impersonatorUserId) {
      await this.authService.recordImpersonationStop(user.impersonatorUserId, user.userId);
    }
    return { success: true };
  }
}
