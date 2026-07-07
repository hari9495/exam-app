import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { TenantContext } from '../prisma/tenant-context';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';

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
}
