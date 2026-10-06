import { Body, Controller, Delete, ForbiddenException, Get, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from './jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentTenant } from './current-tenant.decorator';
import { RequireStepUp } from './step-up.decorator';
import { IdentityProvidersService } from './identity-providers.service';
import { CreateIdentityProviderDto, UpdateIdentityProviderDto } from './dto/identity-provider.dto';

// Settings › People & Access › Security › SSO providers (P12 §7; YX-IAM-04/05). Bearer-token
// authenticated only (no cookie auth, no CSRF surface). Changing an identity provider is
// "change security settings": step-up (P12 §3), never while impersonating, always audited.
// Whoever controls a provider can sign in as the people at its domains, so changing one also
// needs org:manage_users: a settings-only admin cannot use it to become a user admin.
@Controller('security/identity-providers')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class IdentityProvidersController {
  constructor(private readonly providers: IdentityProvidersService) {}

  private actor(req: Request): string {
    const user = req.user as { userId: string; impersonatorUserId?: string };
    if (user.impersonatorUserId) throw new ForbiddenException('Not available while impersonating');
    return user.userId;
  }

  @Get()
  @RequirePermissions('org:manage_settings')
  list(@CurrentTenant() ctx: TenantContext) {
    return this.providers.list(ctx);
  }

  @Post()
  @RequirePermissions('org:manage_settings', 'org:manage_users')
  @RequireStepUp()
  create(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: CreateIdentityProviderDto) {
    return this.providers.create(ctx, this.actor(req), dto);
  }

  @Patch(':id')
  @RequirePermissions('org:manage_settings', 'org:manage_users')
  @RequireStepUp()
  update(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateIdentityProviderDto) {
    return this.providers.update(ctx, this.actor(req), id, dto);
  }

  @Delete(':id')
  @RequirePermissions('org:manage_settings', 'org:manage_users')
  @RequireStepUp()
  remove(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.providers.remove(ctx, this.actor(req), id);
  }
}
