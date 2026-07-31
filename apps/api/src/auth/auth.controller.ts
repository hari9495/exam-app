import { Body, Controller, HttpCode, Param, Post, Req, Res, UnauthorizedException, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { createHash } from 'crypto';
import { PrismaService, TenantPrismaService, isOrganizationActive, ORGANIZATION_INACTIVE_MESSAGE } from '@exam-platform/shared';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { SsoExchangeDto } from './dto/sso-exchange.dto';
import { STRICT_AUTH_THROTTLE } from '../rate-limit-tiers';
import { JwtAuthGuard } from './jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentUserId } from './current-user-id.decorator';

const REFRESH_COOKIE = 'refresh_token';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
  ) {}

  @Post('staff/login')
  @HttpCode(200)
  @Throttle(STRICT_AUTH_THROTTLE)
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const tokens = await this.authService.login(dto);
    res.cookie(REFRESH_COOKIE, tokens.refreshToken, { httpOnly: true, sameSite: 'lax', secure: false });
    return { accessToken: tokens.accessToken };
  }

  @Post('forgot-password')
  @HttpCode(200)
  @Throttle(STRICT_AUTH_THROTTLE)
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.authService.forgotPassword(dto);
    return { message: 'If an account with that organization and email exists, a reset link has been sent.' };
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
  @Throttle(STRICT_AUTH_THROTTLE)
  async refresh(@Body() dto: RefreshDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = dto.refreshToken ?? req.cookies?.[REFRESH_COOKIE];
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token required');
    }
    const tokens = await this.authService.refresh(refreshToken);
    res.cookie(REFRESH_COOKIE, tokens.refreshToken, { httpOnly: true, sameSite: 'lax', secure: false });
    return { accessToken: tokens.accessToken };
  }

  @Post('sso/exchange')
  @HttpCode(200)
  @Throttle(STRICT_AUTH_THROTTLE)
  async ssoExchange(@Body() dto: SsoExchangeDto, @Res({ passthrough: true }) res: Response) {
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

    // Single-use: delete on every lookup attempt, regardless of outcome.
    if (record) {
      await this.prisma.ssoLoginCode.delete({ where: { id: record.id } });
    }
    if (!record || record.expiresAt < new Date()) {
      throw new UnauthorizedException('This sign-in link is invalid or has expired');
    }

    const user = await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) =>
      tx.user.findUnique({ where: { id: record.userId } }),
    );
    if (!user) {
      throw new UnauthorizedException('This sign-in link is invalid or has expired');
    }

    if (user.status !== 'active') {
      throw new UnauthorizedException('This account has been deactivated');
    }

    if (user.organizationId) {
      const org = await this.prisma.organization.findUnique({ where: { id: user.organizationId } });
      if (!isOrganizationActive(org?.status)) {
        throw new UnauthorizedException(ORGANIZATION_INACTIVE_MESSAGE);
      }
    }

    const tokens = await this.authService.issueTokensForSso(user.id, user.organizationId, user.role);
    res.cookie(REFRESH_COOKIE, tokens.refreshToken, { httpOnly: true, sameSite: 'lax', secure: false });
    return { accessToken: tokens.accessToken };
  }

  @Post('logout')
  @HttpCode(200)
  async logout(@Body() dto: RefreshDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = dto.refreshToken ?? req.cookies?.[REFRESH_COOKIE];
    if (refreshToken) {
      await this.authService.logout(refreshToken);
    }
    res.clearCookie(REFRESH_COOKIE);
    return { success: true };
  }

  @Post('super-admin/switch-into/:orgId')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('platform:manage_organizations')
  async switchIntoOrg(@CurrentUserId() userId: string, @Param('orgId') orgId: string) {
    const accessToken = await this.authService.switchIntoOrg(userId, orgId);
    return { accessToken };
  }

  @Post('super-admin/switch-out')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  async switchOutOfOrg(@CurrentUserId() userId: string, @Req() req: Request) {
    const user = req.user as { organizationId: string | null; actingSuperAdmin?: boolean };
    await this.authService.recordSwitchOut(userId, user.actingSuperAdmin ? user.organizationId : null);
    return { success: true };
  }

  @Post('impersonate/:userId')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  async impersonate(@Req() req: Request, @Param('userId') userId: string) {
    const caller = req.user as { userId: string; organizationId: string | null; role: string; impersonatorUserId?: string };
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
