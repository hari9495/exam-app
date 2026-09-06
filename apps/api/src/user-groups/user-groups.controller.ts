import { Body, Controller, Delete, Get, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { CurrentUserId } from '../auth/current-user-id.decorator';
import { UserGroupsService } from './user-groups.service';
import { CreateUserGroupDto } from './dto/create-user-group.dto';
import { UpdateUserGroupDto } from './dto/update-user-group.dto';
import { SetMembersDto } from './dto/set-members.dto';

@Controller('user-groups')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class UserGroupsController {
  constructor(private readonly service: UserGroupsService) {}

  // Staff-readable (pickers/filters) -- NOTE these two must precede ':id' style routes below.
  @Get('directory')
  @RequirePermissions('results:view')
  directory(@CurrentTenant() tenant: TenantContext) {
    return this.service.directory(tenant);
  }

  @Get('mine')
  @RequirePermissions('results:view')
  mine(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string) {
    return this.service.mine(tenant, userId);
  }

  // Admin (manage) surface.
  @Get()
  @RequirePermissions('users:manage_groups')
  list(@CurrentTenant() tenant: TenantContext) {
    return this.service.list(tenant);
  }

  @Post()
  @RequirePermissions('users:manage_groups')
  create(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Body() dto: CreateUserGroupDto) {
    return this.service.create(tenant, userId, dto);
  }

  @Patch(':id')
  @RequirePermissions('users:manage_groups')
  update(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateUserGroupDto,
  ) {
    return this.service.update(tenant, userId, id, dto);
  }

  @Put(':id/members')
  @RequirePermissions('users:manage_groups')
  setMembers(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Body() dto: SetMembersDto,
  ) {
    return this.service.setMembers(tenant, userId, id, dto.userIds);
  }

  @Delete(':id')
  @RequirePermissions('users:manage_groups')
  remove(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Param('id') id: string) {
    return this.service.remove(tenant, userId, id);
  }
}
