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
import { AccessService } from './access.service';
import { FromTemplateDto, GrantDecisionDto, GrantDto, GrantListDto, GrantReasonDto } from './dto';

// Settings › Roles & access (P02 §4.2–4.3, §4.6, §7). Every route needs access.role.manage (System Admin,
// MFA-sensitive, never a one-time code); every change needs a fresh second factor (P12 YX-IAM-02) and is the
// signed-in admin's own (never an impersonation or YukthiX staff acting in the company).
@Controller('access')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AccessController {
  constructor(private readonly access: AccessService) {}

  @Get('role-templates')
  @RequirePermissions('access.role.manage')
  templates() {
    return this.access.templates();
  }

  @Post('roles/from-template')
  @RequirePermissions('access.role.manage')
  @RequireStepUp()
  fromTemplate(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @CurrentUserId() userId: string, @Body() dto: FromTemplateDto) {
    ownSession(req);
    return this.access.fromTemplate(ctx, userId, dto.templateKey, dto.name);
  }

  @Get('roles')
  @RequirePermissions('access.role.manage')
  roles(@CurrentTenant() ctx: TenantContext) {
    return this.access.roles(ctx);
  }

  @Get('users')
  @RequirePermissions('access.role.manage')
  users(@CurrentTenant() ctx: TenantContext) {
    return this.access.users(ctx);
  }

  @Get('users/:id/effective')
  @RequirePermissions('access.role.manage')
  effective(@CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.access.effective(ctx, id);
  }

  @Get('grants')
  @RequirePermissions('access.role.manage')
  grants(@CurrentTenant() ctx: TenantContext, @Query() q: GrantListDto) {
    return this.access.grants(ctx, q);
  }

  @Post('grants')
  @RequirePermissions('access.role.manage')
  @RequireStepUp()
  create(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @CurrentUserId() userId: string, @Body() dto: GrantDto) {
    ownSession(req);
    return this.access.create(ctx, userId, dto);
  }

  @Post('grants/:id/approve')
  @RequirePermissions('access.role.manage')
  @RequireStepUp()
  approve(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: GrantDecisionDto) {
    ownSession(req);
    return this.access.decide(ctx, userId, id, 'active', dto.note);
  }

  @Post('grants/:id/reject')
  @RequirePermissions('access.role.manage')
  reject(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: GrantReasonDto) {
    ownSession(req);
    return this.access.decide(ctx, userId, id, 'rejected', dto.reason);
  }

  @Post('grants/:id/revoke')
  @RequirePermissions('access.role.manage')
  @RequireStepUp()
  revoke(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: GrantReasonDto) {
    ownSession(req);
    return this.access.revoke(ctx, userId, id, dto.reason);
  }
}
