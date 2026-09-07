import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { CurrentUserId } from '../auth/current-user-id.decorator';
import { TenantContext } from '@exam-platform/shared';
import { OrgSenderAddressesService } from './org-sender-addresses.service';
import { CreateSenderAddressDto } from './dto/create-sender-address.dto';
import { UpdateSenderAddressDto } from './dto/update-sender-address.dto';

@Controller('org-sender-addresses')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class OrgSenderAddressesController {
  constructor(private readonly senders: OrgSenderAddressesService) {}

  @Get()
  @RequirePermissions('org:manage_settings')
  list(@CurrentTenant() tenant: TenantContext) {
    return this.senders.list(tenant);
  }

  @Post()
  @RequirePermissions('org:manage_settings')
  create(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Body() dto: CreateSenderAddressDto) {
    return this.senders.create(tenant, userId, dto);
  }

  @Patch(':id')
  @RequirePermissions('org:manage_settings')
  update(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateSenderAddressDto,
  ) {
    return this.senders.update(tenant, userId, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('org:manage_settings')
  remove(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Param('id') id: string) {
    return this.senders.remove(tenant, userId, id);
  }
}
