import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import type { ScopeUser } from '../access/scope';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { CurrentUserId } from '../auth/current-user-id.decorator';
import { TenantContext } from '@exam-platform/shared';
import { NotificationsService } from './notifications.service';
import { PushService } from './push.service';
import { PushChoicesDto, PushEndpointDto, PushSubscriptionDto } from './dto/push.dto';
import { UpdateNotificationPreferenceDto } from './dto/update-notification-preference.dto';
import { UpdateDigestModeDto } from './dto/update-digest-mode.dto';

// Every route is the CURRENT user's own inbox -- no extra permission beyond being authenticated;
// the service scopes every query to recipientUserId so one staffer never sees another's inbox.
@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(
    private readonly service: NotificationsService,
    private readonly push: PushService,
  ) {}

  @Get()
  list(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string) {
    return this.service.list(tenant, userId);
  }

  @Get('unread-count')
  unreadCount(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string) {
    return this.service.unreadCount(tenant, userId);
  }

  @Post(':id/read')
  markRead(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Param('id') id: string) {
    return this.service.markRead(tenant, userId, id);
  }

  @Post('read-all')
  markAllRead(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string) {
    return this.service.markAllRead(tenant, userId);
  }

  @Get('preferences')
  getPreferences(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string) {
    return this.service.getPreferences(tenant, userId);
  }

  @Patch('preferences')
  updatePreference(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUserId() userId: string,
    @Body() dto: UpdateNotificationPreferenceDto,
  ) {
    return this.service.setPreference(tenant, userId, dto.type, dto.emailEnabled, dto.pushEnabled);
  }

  /** T2-E 52 (2875, 2877): whether push can be used, the public key to subscribe with, Pause push and quiet hours. */
  @Get('push')
  pushStatus(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string) {
    return this.push.status(tenant, userId);
  }

  @Patch('push')
  pushChoices(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Body() dto: PushChoicesDto) {
    return this.push.setChoices(tenant, userId, dto);
  }

  /** This device's subscription (one per device; a device of someone else of the company moves to me). */
  @Put('push/subscription')
  subscribe(@Req() req: Request, @CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Body() dto: PushSubscriptionDto) {
    const u = req.user as ScopeUser;
    return this.push.subscribe(tenant, userId, Boolean(u.impersonatorUserId || u.actingSuperAdmin), dto);
  }

  /** Sign-out, or push off for this device. */
  @Delete('push/subscription')
  @HttpCode(200)
  unsubscribe(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Body() dto: PushEndpointDto) {
    return this.push.unsubscribe(tenant, userId, dto.endpoint);
  }

  @Get('digest')
  getDigestMode(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string) {
    return this.service.getDigestMode(tenant, userId);
  }

  @Patch('digest')
  setDigestMode(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Body() dto: UpdateDigestModeDto) {
    return this.service.setDigestMode(tenant, userId, dto.mode);
  }
}
