import { Body, Controller, Delete, ForbiddenException, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { INestApplication } from '@nestjs/common';
import { Request, raw } from 'express';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { RequireStepUp } from '../auth/step-up.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { PUBLIC_API_THROTTLE, STRICT_AUTH_THROTTLE } from '../rate-limit-tiers';
import { CreateSmsAccountDto, DeliveriesQueryDto, UpdateSmsAccountDto, UpdateSmsPolicyDto } from './dto';
import { SmsAccountsService } from './sms-accounts.service';
import { SmsChannelService } from './sms-channel.service';

export const SMS_CALLBACK_PATH = '/api/v1/notifications/sms/callbacks';

/** Callbacks are verified over their exact bytes (HMAC): mount before any JSON / form body parser. */
export function mountSmsCallbackBody(app: INestApplication): void {
  app.use(SMS_CALLBACK_PATH, raw({ type: () => true, limit: '256kb' }));
}

// Settings › Notifications › SMS (P04 §7). Bearer-token only (no CSRF surface). Saving an account carries
// gateway credentials: step-up (P12 §3), never while impersonating, always audited. Companies only.
@Controller('notifications/sms')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SmsSettingsController {
  constructor(private readonly accounts: SmsAccountsService) {}

  /** A company's own settings; the YukthiX shared account is managed in the platform console (/platform/channels). */
  private company(ctx: TenantContext): TenantContext {
    if (!ctx.organizationId) throw new ForbiddenException('The YukthiX shared SMS account is managed in the platform console');
    return ctx;
  }

  private actor(req: Request): string {
    const user = req.user as { userId: string; impersonatorUserId?: string };
    if (user.impersonatorUserId) throw new ForbiddenException('Not available while impersonating');
    return user.userId;
  }

  @Get()
  @RequirePermissions('org:manage_settings')
  overview(@CurrentTenant() ctx: TenantContext) {
    return this.accounts.overview(this.company(ctx));
  }

  @Patch('policy')
  @RequirePermissions('org:manage_settings')
  updatePolicy(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: UpdateSmsPolicyDto) {
    return this.accounts.updatePolicy(this.company(ctx), this.actor(req), dto);
  }

  @Post('accounts')
  @RequirePermissions('org:manage_settings')
  @RequireStepUp()
  create(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: CreateSmsAccountDto) {
    return this.accounts.create(this.company(ctx), this.actor(req), dto);
  }

  @Patch('accounts/:id')
  @RequirePermissions('org:manage_settings')
  @RequireStepUp()
  update(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSmsAccountDto) {
    return this.accounts.update(this.company(ctx), this.actor(req), id, dto);
  }

  @Delete('accounts/:id')
  @HttpCode(204)
  @RequirePermissions('org:manage_settings')
  @RequireStepUp()
  async remove(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    await this.accounts.remove(this.company(ctx), this.actor(req), id);
  }

  // Only to the admin's own verified number, so it can't be used to message anyone else.
  @Post('accounts/:id/test')
  @HttpCode(200)
  @Throttle(STRICT_AUTH_THROTTLE)
  @RequirePermissions('org:manage_settings')
  test(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.accounts.test(this.company(ctx), this.actor(req), id);
  }

  @Get('deliveries')
  @RequirePermissions('org:manage_settings')
  deliveries(@CurrentTenant() ctx: TenantContext, @Query() query: DeliveriesQueryDto) {
    return this.accounts.deliveries(this.company(ctx), query.before);
  }
}

// Delivery reports and opt-outs from gateways (YX-NTF-10/11). Public, but every request must carry the
// account's own secret (token or HMAC, constant-time); anything else is a bare 401.
@Controller('notifications/sms/callbacks')
export class SmsCallbacksController {
  constructor(private readonly channel: SmsChannelService) {}

  @Post(':accountId')
  @HttpCode(200)
  @Throttle(PUBLIC_API_THROTTLE)
  post(@Param('accountId', ParseUUIDPipe) accountId: string, @Req() req: Request, @Body() body: unknown) {
    return this.handle(accountId, req, body);
  }

  // Some gateways (e.g. Gupshup) report by GET with query parameters.
  @Get(':accountId')
  @Throttle(PUBLIC_API_THROTTLE)
  get(@Param('accountId', ParseUUIDPipe) accountId: string, @Req() req: Request) {
    return this.handle(accountId, req, undefined);
  }

  private async handle(accountId: string, req: Request, body: unknown) {
    const rawBody = Buffer.isBuffer(body) ? body : Buffer.alloc(0);
    const { updated } = await this.channel.handleCallback(accountId, { rawBody, headers: req.headers, query: req.query as Record<string, unknown> });
    return { ok: true, updated };
  }
}
