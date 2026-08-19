import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { CurrentUserId } from '../auth/current-user-id.decorator';
import { ConnectedAppsService } from './connected-apps.service';
import { CreateConnectedAppDto } from './dto/create-connected-app.dto';
import { UpdateConnectedAppDto } from './dto/update-connected-app.dto';

@Controller('organizations/integrations')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ConnectedAppsController {
  constructor(private readonly service: ConnectedAppsService) {}

  @Get('connected-apps')
  @RequirePermissions('org:manage_settings')
  list(@CurrentTenant() tenant: TenantContext) {
    return this.service.list(tenant);
  }

  @Post('connected-apps')
  @RequirePermissions('org:manage_settings')
  create(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Body() dto: CreateConnectedAppDto) {
    return this.service.create(tenant, userId, dto);
  }

  @Patch('connected-apps/:id')
  @RequirePermissions('org:manage_settings')
  update(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Param('id') id: string, @Body() dto: UpdateConnectedAppDto) {
    return this.service.update(tenant, userId, id, dto);
  }

  @Delete('connected-apps/:id')
  @RequirePermissions('org:manage_settings')
  remove(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Param('id') id: string) {
    return this.service.remove(tenant, userId, id);
  }

  @Post('connected-apps/:id/test')
  @RequirePermissions('org:manage_settings')
  test(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.service.test(tenant, id);
  }

  @Get('connected-apps/:id/deliveries')
  @RequirePermissions('org:manage_settings')
  deliveries(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.service.deliveries(tenant, id);
  }
}
