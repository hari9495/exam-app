import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { CurrentUserId } from '../auth/current-user-id.decorator';
import { TenantContext } from '@exam-platform/shared';
import { PermissionProfilesService } from './permission-profiles.service';
import { UpsertPermissionProfileDto, UpdatePermissionProfileDto } from './dto/upsert-permission-profile.dto';

@Controller('organizations/permission-profiles')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PermissionProfilesController {
  constructor(private readonly profiles: PermissionProfilesService) {}

  @Get()
  @RequirePermissions('org:manage_users')
  list(@CurrentTenant() tenant: TenantContext) {
    return this.profiles.list(tenant);
  }

  @Get('assignable-permissions')
  @RequirePermissions('org:manage_users')
  assignablePermissions() {
    return this.profiles.assignablePermissions();
  }

  @Post()
  @RequirePermissions('org:manage_users')
  create(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Body() dto: UpsertPermissionProfileDto) {
    return this.profiles.create(tenant, userId, dto);
  }

  @Patch(':id')
  @RequirePermissions('org:manage_users')
  update(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Body() dto: UpdatePermissionProfileDto,
  ) {
    return this.profiles.update(tenant, userId, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('org:manage_users')
  remove(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Param('id') id: string) {
    return this.profiles.remove(tenant, userId, id);
  }
}
