import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { CurrentUserId } from '../auth/current-user-id.decorator';
import { TenantContext } from '@exam-platform/shared';
import { DrivesService } from './drives.service';
import { CreateDriveDto } from './dto/create-drive.dto';

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DrivesController {
  constructor(private readonly drivesService: DrivesService) {}

  @Post('walk-in-groups/:groupId/drives')
  @RequirePermissions('exam:manage')
  create(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUserId() userId: string,
    @Param('groupId') groupId: string,
    @Body() dto: CreateDriveDto,
  ) {
    return this.drivesService.create(tenant, userId, groupId, dto);
  }

  @Get('walk-in-groups/:groupId/drives')
  @RequirePermissions('exam:manage')
  listForGroup(@CurrentTenant() tenant: TenantContext, @Param('groupId') groupId: string) {
    return this.drivesService.listForGroup(tenant, groupId);
  }

  @Get('drives/:id')
  @RequirePermissions('results:view')
  getDrive(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.drivesService.getDrive(tenant, id);
  }

  @Delete('drives/:id')
  @RequirePermissions('exam:manage')
  remove(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Param('id') id: string) {
    return this.drivesService.remove(tenant, userId, id);
  }

  @Get('drives/:id/live')
  @RequirePermissions('results:view')
  liveRoster(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.drivesService.liveRoster(tenant, id);
  }

  @Get('drives/:id/results')
  @RequirePermissions('results:view')
  results(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.drivesService.results(tenant, id);
  }
}
