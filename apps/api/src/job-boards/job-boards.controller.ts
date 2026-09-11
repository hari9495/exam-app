import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { CurrentUserId } from '../auth/current-user-id.decorator';
import { TenantContext } from '@exam-platform/shared';
import { JobBoardsService } from './job-boards.service';
import { UpsertJobBoardDto } from './dto/upsert-job-board.dto';

@Controller('organizations/job-boards')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class JobBoardsController {
  constructor(private readonly service: JobBoardsService) {}

  @Get()
  @RequirePermissions('org:manage_settings')
  list(@CurrentTenant() tenant: TenantContext) {
    return this.service.list(tenant);
  }

  @Post()
  @RequirePermissions('org:manage_settings')
  create(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Body() dto: UpsertJobBoardDto) {
    return this.service.create(tenant, userId, dto);
  }

  @Patch(':id')
  @RequirePermissions('org:manage_settings')
  update(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Body() dto: UpsertJobBoardDto,
  ) {
    return this.service.update(tenant, userId, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('org:manage_settings')
  remove(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Param('id') id: string) {
    return this.service.remove(tenant, userId, id);
  }
}
