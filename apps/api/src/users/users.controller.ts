import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { CurrentUserId } from '../auth/current-user-id.decorator';
import { TenantContext } from '@exam-platform/shared';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';

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
  list(@CurrentTenant() tenant: TenantContext) {
    return this.usersService.list(tenant);
  }

  @Get('me')
  getMe(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string) {
    return this.usersService.getMe(tenant, userId);
  }

  @Patch('me')
  updateMe(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Body() dto: UpdateProfileDto) {
    return this.usersService.updateMe(tenant, userId, dto);
  }
}
