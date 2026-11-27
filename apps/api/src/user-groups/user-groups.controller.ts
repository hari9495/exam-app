import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequireAnyPermission } from '../rbac/permissions.decorator';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { CurrentUserId } from '../auth/current-user-id.decorator';
import { OwnSessionChangesGuard } from '../auth/own-session.guard';
import { UserGroupsService } from './user-groups.service';
import { CreateUserGroupDto } from './dto/create-user-group.dto';
import { UpdateUserGroupDto } from './dto/update-user-group.dto';
import { SetMembersDto } from './dto/set-members.dto';

/** T2-G 42 (answer 2745): HR's groups key, besides the older System Admin key. */
const MANAGE = ['users:manage_groups', 'people.group.manage'] as const;
/** Who picks a group as an audience or approver: the group keepers and the people who send, survey, assign learning or set approvals. */
const PICK = [...MANAGE, 'engage.announce', 'engage.survey.manage', 'learning.manage', 'org.settings.manage'] as const;

@Controller('user-groups')
// Answer 2430: no change while acting for someone else (reads stay open).
@UseGuards(JwtAuthGuard, PermissionsGuard, OwnSessionChangesGuard)
export class UserGroupsController {
  constructor(private readonly service: UserGroupsService) {}

  // Staff-readable (pickers/filters) -- NOTE these two must precede ':id' style routes below.
  // AS-0: candidate view is enough (the Interview coordinator reads jobs and candidates, never test results).
  @Get('directory')
  @RequireAnyPermission('results:view', 'candidate:view')
  directory(@CurrentTenant() tenant: TenantContext) {
    return this.service.directory(tenant);
  }

  @Get('mine')
  @RequireAnyPermission('results:view', 'candidate:view')
  mine(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string) {
    return this.service.mine(tenant, userId);
  }

  /** T2-G 42: the groups an audience or approver picker offers. */
  @Get('options')
  @RequireAnyPermission(...PICK)
  options(@CurrentTenant() tenant: TenantContext) {
    return this.service.options(tenant);
  }

  // Admin (manage) surface.
  @Get()
  @RequireAnyPermission(...MANAGE)
  list(@CurrentTenant() tenant: TenantContext) {
    return this.service.list(tenant);
  }

  @Post()
  @RequireAnyPermission(...MANAGE)
  create(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Body() dto: CreateUserGroupDto) {
    return this.service.create(tenant, userId, dto);
  }

  @Patch(':id')
  @RequireAnyPermission(...MANAGE)
  update(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateUserGroupDto,
  ) {
    return this.service.update(tenant, userId, id, dto);
  }

  @Put(':id/members')
  @RequireAnyPermission(...MANAGE)
  setMembers(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Body() dto: SetMembersDto,
  ) {
    return this.service.setMembers(tenant, userId, id, dto.userIds);
  }

  /** T2-G 42: work a rule group's members out now (also done on save and every night). */
  @Post(':id/refresh')
  @RequireAnyPermission(...MANAGE)
  refresh(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.refresh(tenant, userId, id);
  }

  @Delete(':id')
  @RequireAnyPermission(...MANAGE)
  remove(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Param('id') id: string) {
    return this.service.remove(tenant, userId, id);
  }
}
