import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { CurrentUserId } from '../auth/current-user-id.decorator';
import { TenantContext } from '@exam-platform/shared';
import { NotificationsService } from './notifications.service';

// Every route is the CURRENT user's own inbox -- no extra permission beyond being authenticated;
// the service scopes every query to recipientUserId so one staffer never sees another's inbox.
@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

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
}
