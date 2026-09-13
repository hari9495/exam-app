import { Body, Controller, Delete, Get, Param, Put, UseGuards } from '@nestjs/common';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from './permissions.guard';
import { RequirePermissions } from './permissions.decorator';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { CurrentUserId } from '../auth/current-user-id.decorator';
import { RolePermissionsService } from './role-permissions.service';
import { PutRolePermissionsDto } from './dto/put-role-permissions.dto';

// Salesforce-style per-org role editing. Gated by org:manage_users (same as permission profiles) --
// changing what a role can do is an account-administration action.
@Controller('organizations/role-permissions')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class RolePermissionsController {
  constructor(private readonly service: RolePermissionsService) {}

  @Get()
  @RequirePermissions('org:manage_users')
  getMatrix(@CurrentTenant() tenant: TenantContext) {
    return this.service.getMatrix(tenant);
  }

  @Put(':role')
  @RequirePermissions('org:manage_users')
  setRole(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUserId() userId: string,
    @Param('role') role: string,
    @Body() dto: PutRolePermissionsDto,
  ) {
    return this.service.setRolePermissions(tenant, userId, role, dto.permissions);
  }

  @Delete(':role')
  @RequirePermissions('org:manage_users')
  resetRole(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Param('role') role: string) {
    return this.service.resetRole(tenant, userId, role);
  }
}
