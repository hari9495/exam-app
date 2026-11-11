import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { CurrentUserId } from '../auth/current-user-id.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { ownSession } from '../org-structure/org-structure.controller';
import { PlatformStaffGuard } from '../platform/platform-staff.guard';
import { WhatsNewEntryDto, WhatsNewReadDto, WhatsNewUpdateDto } from './whats-new.dto';
import { WhatsNewService, type NewsReader } from './whats-new.service';

const reader = (req: Request): NewsReader => {
  ownSession(req); // a support session or impersonation never reads or marks someone's What's new (403)
  const u = req.user as { userId: string; role?: string; permissionProfileId?: string | null };
  return { userId: u.userId, role: u.role, permissionProfileId: u.permissionProfileId ?? null };
};

/** Help H-4 (answer 943): the signed-in person's What's new, for the Help drawer's tab. Every signed-in person; no key. */
@Controller('help/whats-new')
@UseGuards(JwtAuthGuard)
export class WhatsNewController {
  constructor(private readonly news: WhatsNewService) {}

  @Get()
  mine(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.news.mine(ctx, reader(req));
  }

  @Post('read')
  @HttpCode(200)
  read(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: WhatsNewReadDto) {
    return this.news.markRead(ctx, reader(req), dto.ids);
  }
}

/** Console › What's new (answer 943): YukthiX staff write the entries; every change is in the platform audit log. */
@Controller('platform/whats-new')
@UseGuards(JwtAuthGuard, PlatformStaffGuard, PermissionsGuard)
export class WhatsNewStaffController {
  constructor(private readonly news: WhatsNewService) {}

  @Get()
  @RequirePermissions('platform.news.manage')
  list() {
    return this.news.list();
  }

  @Post()
  @RequirePermissions('platform.news.manage')
  create(@CurrentUserId() actor: string, @Body() dto: WhatsNewEntryDto) {
    return this.news.create(actor, dto);
  }

  @Patch(':id')
  @RequirePermissions('platform.news.manage')
  update(@CurrentUserId() actor: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: WhatsNewUpdateDto) {
    return this.news.update(actor, id, dto);
  }

  @Post(':id/withdraw')
  @HttpCode(200)
  @RequirePermissions('platform.news.manage')
  withdraw(@CurrentUserId() actor: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.news.withdraw(actor, id);
  }
}
