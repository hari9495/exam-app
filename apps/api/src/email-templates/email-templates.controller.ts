import { Body, Controller, Delete, ForbiddenException, Get, HttpCode, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { STRICT_AUTH_THROTTLE } from '../rate-limit-tiers';
import { BrandingDto, DraftDto, WordingDto } from './dto';
import { EmailTemplatesService } from './email-templates.service';

// PermissionsGuard reads each handler's own metadata, so every route names the key.
const KEY = 'notification.template.manage';

// Settings › Notifications › Email (P04 Q5, §4 Editing & Branding): the company's branding and wording of the account
// emails YukthiX sends its people. Bearer-token only (no CSRF surface); never while impersonating; every change audited.
@Controller('notifications/email')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class EmailTemplatesController {
  constructor(private readonly templates: EmailTemplatesService) {}

  private actor(req: Request): string {
    const user = req.user as { userId: string; impersonatorUserId?: string };
    if (user.impersonatorUserId) throw new ForbiddenException('Not available while impersonating');
    return user.userId;
  }

  @Get()
  @RequirePermissions(KEY)
  overview(@CurrentTenant() ctx: TenantContext) {
    return this.templates.overview(ctx);
  }

  @Put('branding')
  @RequirePermissions(KEY)
  saveBranding(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: BrandingDto) {
    return this.templates.saveBranding(ctx, this.actor(req), dto);
  }

  @Put('templates/:type')
  @RequirePermissions(KEY)
  saveTemplate(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('type') type: string, @Body() dto: WordingDto) {
    return this.templates.saveTemplate(ctx, this.actor(req), type, dto);
  }

  /** Reset to the YukthiX wording. */
  @Delete('templates/:type')
  @RequirePermissions(KEY)
  resetTemplate(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('type') type: string) {
    return this.templates.resetTemplate(ctx, this.actor(req), type);
  }

  @Post('templates/:type/preview')
  @RequirePermissions(KEY)
  @HttpCode(200)
  preview(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('type') type: string, @Body() dto: DraftDto) {
    return this.templates.preview(ctx, (req.user as { userId: string }).userId, type, dto);
  }

  // Only to the signed-in admin's own address, so it can't be used to email anyone else.
  @Post('templates/:type/test')
  @RequirePermissions(KEY)
  @HttpCode(200)
  @Throttle(STRICT_AUTH_THROTTLE)
  sendTest(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('type') type: string, @Body() dto: DraftDto) {
    return this.templates.sendTest(ctx, this.actor(req), type, dto);
  }
}
