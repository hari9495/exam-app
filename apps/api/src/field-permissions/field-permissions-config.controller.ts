import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { CurrentUserId } from '../auth/current-user-id.decorator';
import { TenantContext } from '@exam-platform/shared';
import { FieldPermissionsService } from './field-permissions.service';
import { UpdateFieldPermissionsDto } from './dto/update-field-permissions.dto';

@Controller('organizations/field-permissions')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class FieldPermissionsConfigController {
  constructor(private readonly fieldPermissionsService: FieldPermissionsService) {}

  @Get()
  @RequirePermissions('org:manage_settings')
  getConfig(@CurrentTenant() tenant: TenantContext) {
    return this.fieldPermissionsService.getConfig(tenant);
  }

  @Put()
  @RequirePermissions('org:manage_settings')
  setConfig(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Body() dto: UpdateFieldPermissionsDto) {
    return this.fieldPermissionsService.setConfig(tenant, userId, dto.config);
  }
}
