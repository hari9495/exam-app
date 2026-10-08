import { Body, Controller, Delete, ForbiddenException, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from './jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentTenant } from './current-tenant.decorator';
import { SessionsService, resolveClientMeta } from './sessions.service';
import { LoginEventsQueryDto, MyLoginHistoryQueryDto, SessionsQueryDto, UnlockAccountDto } from './dto/session-queries.dto';
import { RequireStepUp } from './step-up.decorator';

interface RequestUser {
  userId: string;
  sessionId: string;
  impersonatorUserId?: string;
}

// Me › Security (sessions, login history) and Admin › Login activity (P12 §7, YX-IAM-06/10).
// Bearer-token authenticated only -- no cookie auth, so no CSRF surface.
@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SessionsController {
  constructor(private readonly sessions: SessionsService) {}

  // While impersonating, "me" is the target user: managing their sessions or reading their
  // sign-in history from someone else's session is exactly what impersonation must not grant.
  private self(req: Request): RequestUser {
    const user = req.user as RequestUser;
    if (user.impersonatorUserId) {
      throw new ForbiddenException('Not available while impersonating');
    }
    return user;
  }

  @Get('auth/sessions')
  listMine(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    const me = this.self(req);
    return this.sessions.listMine(ctx, me.userId, me.sessionId);
  }

  @Delete('auth/sessions/:id')
  @HttpCode(204)
  async revokeMine(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    await this.sessions.revokeMine(ctx, this.self(req).userId, id);
  }

  @Post('auth/sessions/revoke-others')
  @HttpCode(200)
  revokeOthers(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    const me = this.self(req);
    return this.sessions.revokeMyOthers(ctx, me.userId, me.sessionId);
  }

  @Get('auth/login-history')
  loginHistory(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() query: MyLoginHistoryQueryDto) {
    return this.sessions.myLoginHistory(ctx, this.self(req).userId, query);
  }

  @Get('security/sessions')
  @RequirePermissions('org:manage_users')
  adminList(@CurrentTenant() ctx: TenantContext, @Query() query: SessionsQueryDto) {
    return this.sessions.adminListSessions(ctx, query);
  }

  @Delete('security/sessions/:id')
  @HttpCode(204)
  @RequirePermissions('org:manage_users')
  async adminRevoke(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    await this.sessions.adminRevoke(ctx, (req.user as RequestUser).userId, id);
  }

  // Admin › Login activity › Unlock (YX-IAM-07): clears a person's account lock in this tenant.
  // A step-up action; never while impersonating; the per-IP lock and MFA are untouched.
  @Post('security/users/:id/unlock')
  @HttpCode(200)
  @RequirePermissions('org:manage_users')
  @RequireStepUp()
  unlockAccount(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UnlockAccountDto,
  ) {
    return this.sessions.unlockAccount(ctx, this.self(req).userId, id, dto.reason.trim(), resolveClientMeta(req, res));
  }

  @Get('security/login-events')
  @RequirePermissions('audit:view')
  loginEvents(@CurrentTenant() ctx: TenantContext, @Query() query: LoginEventsQueryDto) {
    return this.sessions.listLoginEvents(ctx, query, { lockState: true });
  }
}
