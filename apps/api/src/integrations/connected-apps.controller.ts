import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequireAnyPermission } from '../rbac/permissions.decorator';
import { RequireStepUp } from '../auth/step-up.decorator';
import { OwnSessionGuard } from '../auth/own-session.guard';
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
  @RequireAnyPermission('org:manage_settings', 'integration.manage')
  list(@CurrentTenant() tenant: TenantContext) {
    return this.service.list(tenant);
  }

  @Post('connected-apps')
  @RequireAnyPermission('org:manage_settings', 'integration.manage')
  @RequireStepUp()
  @UseGuards(OwnSessionGuard)
  create(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Body() dto: CreateConnectedAppDto) {
    return this.service.create(tenant, userId, dto);
  }

  @Patch('connected-apps/:id')
  @RequireAnyPermission('org:manage_settings', 'integration.manage')
  @RequireStepUp()
  @UseGuards(OwnSessionGuard)
  update(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateConnectedAppDto) {
    return this.service.update(tenant, userId, id, dto);
  }

  @Delete('connected-apps/:id')
  @RequireAnyPermission('org:manage_settings', 'integration.manage')
  @RequireStepUp()
  @UseGuards(OwnSessionGuard)
  remove(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(tenant, userId, id);
  }

  @Post('connected-apps/:id/test')
  @RequireAnyPermission('org:manage_settings', 'integration.manage')
  test(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.test(tenant, id);
  }

  @Get('connected-apps/:id/deliveries')
  @RequireAnyPermission('org:manage_settings', 'integration.manage')
  deliveries(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.deliveries(tenant, id);
  }
}
