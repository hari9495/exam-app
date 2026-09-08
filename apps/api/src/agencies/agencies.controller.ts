import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { CurrentUserId } from '../auth/current-user-id.decorator';
import { TenantContext } from '@exam-platform/shared';
import { AgenciesService } from './agencies.service';
import { UpsertAgencyDto, UpdateAgencyDto } from './dto/upsert-agency.dto';

@Controller('agencies')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AgenciesController {
  constructor(private readonly service: AgenciesService) {}

  @Get()
  @RequirePermissions('org:manage_settings')
  list(@CurrentTenant() tenant: TenantContext) {
    return this.service.list(tenant);
  }

  @Post()
  @RequirePermissions('org:manage_settings')
  create(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Body() dto: UpsertAgencyDto) {
    return this.service.create(tenant, userId, dto);
  }

  @Patch(':id')
  @RequirePermissions('org:manage_settings')
  update(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateAgencyDto,
  ) {
    return this.service.update(tenant, userId, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('org:manage_settings')
  remove(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Param('id') id: string) {
    return this.service.remove(tenant, userId, id);
  }

  @Post(':id/regenerate-token')
  @RequirePermissions('org:manage_settings')
  regenerateToken(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Param('id') id: string) {
    return this.service.regenerateToken(tenant, userId, id);
  }
}
