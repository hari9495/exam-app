import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { CurrentUserId } from '../auth/current-user-id.decorator';
import { TenantContext } from '@exam-platform/shared';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { SuperAdminEmailDto } from './dto/super-admin-email.dto';

@Controller('users')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @RequirePermissions('org:manage_users')
  create(@CurrentTenant() tenant: TenantContext, @Body() dto: CreateUserDto) {
    return this.usersService.create(tenant, dto);
  }

  @Get()
  @RequirePermissions('org:view')
  list(
    @CurrentTenant() tenant: TenantContext,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('search') search?: string,
  ) {
    return this.usersService.list(tenant, { page, pageSize, search });
  }

  @Get('directory')
  @RequirePermissions('platform:manage_organizations')
  listDirectory(
    @CurrentTenant() tenant: TenantContext,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('search') search?: string,
  ) {
    return this.usersService.listDirectory(tenant, { page, pageSize, search });
  }

  @Get('super-admins')
  @RequirePermissions('platform:manage_organizations')
  listSuperAdmins(
    @CurrentTenant() tenant: TenantContext,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('search') search?: string,
  ) {
    return this.usersService.listSuperAdmins(tenant, { page, pageSize, search });
  }

  @Post('super-admins/invite')
  @RequirePermissions('platform:manage_organizations')
  inviteSuperAdmin(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Body() dto: SuperAdminEmailDto) {
    return this.usersService.inviteSuperAdmin(tenant, userId, dto);
  }

  @Post('super-admins/promote')
  @RequirePermissions('platform:manage_organizations')
  promoteSuperAdmin(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Body() dto: SuperAdminEmailDto) {
    return this.usersService.promoteSuperAdmin(tenant, userId, dto);
  }

  @Get('me')
  getMe(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string) {
    return this.usersService.getMe(tenant, userId);
  }

  @Patch('me')
  updateMe(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Body() dto: UpdateProfileDto) {
    return this.usersService.updateMe(tenant, userId, dto);
  }

  @Patch(':id')
  @RequirePermissions('org:manage_users')
  update(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.usersService.update(tenant, id, dto);
  }

  @Post('me/change-password')
  @HttpCode(200)
  async changePassword(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUserId() userId: string,
    @Body() dto: ChangePasswordDto,
    @Req() req: Request,
  ) {
    await this.usersService.changePassword(tenant, userId, dto, req.cookies?.['refresh_token']);
    return { success: true };
  }
}
