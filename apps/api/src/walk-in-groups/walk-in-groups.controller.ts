import { Body, Controller, Delete, Get, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { CurrentUserId } from '../auth/current-user-id.decorator';
import { TenantContext } from '@exam-platform/shared';
import { WalkInGroupsService } from './walk-in-groups.service';
import { CreateWalkInGroupDto } from './dto/create-walk-in-group.dto';
import { RenameWalkInGroupDto } from './dto/rename-walk-in-group.dto';
import { SetWalkInGroupExamsDto } from './dto/set-walk-in-group-exams.dto';

@Controller('walk-in-groups')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class WalkInGroupsController {
  constructor(private readonly walkInGroupsService: WalkInGroupsService) {}

  @Get()
  @RequirePermissions('exam:manage')
  list(@CurrentTenant() tenant: TenantContext) {
    return this.walkInGroupsService.list(tenant);
  }

  // Every walk-in-enabled exam in the org (whichever group it's in, or none) -- the pool
  // the "manage members" picker offers, so an exam already in another group can be moved.
  @Get('eligible-exams')
  @RequirePermissions('exam:manage')
  listEligibleExams(@CurrentTenant() tenant: TenantContext) {
    return this.walkInGroupsService.listEligibleExams(tenant);
  }

  @Post()
  @RequirePermissions('exam:manage')
  create(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Body() dto: CreateWalkInGroupDto) {
    return this.walkInGroupsService.create(tenant, userId, dto.name);
  }

  @Patch(':id')
  @RequirePermissions('exam:manage')
  rename(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Body() dto: RenameWalkInGroupDto,
  ) {
    return this.walkInGroupsService.rename(tenant, userId, id, dto.name);
  }

  @Delete(':id')
  @RequirePermissions('exam:manage')
  remove(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Param('id') id: string) {
    return this.walkInGroupsService.remove(tenant, userId, id);
  }

  @Put(':id/exams')
  @RequirePermissions('exam:manage')
  setExams(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Body() dto: SetWalkInGroupExamsDto,
  ) {
    return this.walkInGroupsService.setExams(tenant, userId, id, dto.examIds);
  }
}
