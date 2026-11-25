import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { CurrentUserId } from '../auth/current-user-id.decorator';
import { RequireStepUp } from '../auth/step-up.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { ownSession } from '../org-structure/org-structure.controller';
import { AccessRequestsService } from './access-requests.service';
import { AccessRequestApproveDto, AccessRequestAskDto, AccessRequestMineDto, GrantReasonDto } from './dto';

// Answer 946: anyone signed in asks from a no-access page (their own session only, never while acting for someone);
// System Admins (access.role.manage) decide, approving with a fresh second factor like any grant.
@Controller('access/requests')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AccessRequestsController {
  constructor(private readonly requests: AccessRequestsService) {}

  @Get('mine')
  mine(@CurrentTenant() ctx: TenantContext, @CurrentUserId() userId: string, @Query() q: AccessRequestMineDto) {
    return this.requests.mine(ctx, userId, q.page);
  }

  @Post()
  ask(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @CurrentUserId() userId: string, @Body() dto: AccessRequestAskDto) {
    ownSession(req);
    return this.requests.ask(ctx, userId, dto);
  }

  @Get()
  @RequirePermissions('access.role.manage')
  list(@CurrentTenant() ctx: TenantContext) {
    return this.requests.list(ctx);
  }

  @Post(':id/approve')
  @RequirePermissions('access.role.manage')
  @RequireStepUp()
  approve(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AccessRequestApproveDto) {
    ownSession(req);
    return this.requests.approve(ctx, userId, id, dto);
  }

  @Post(':id/refuse')
  @RequirePermissions('access.role.manage')
  refuse(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: GrantReasonDto) {
    ownSession(req);
    return this.requests.refuse(ctx, userId, id, dto.reason);
  }
}
