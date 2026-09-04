import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { CurrentUserId } from '../auth/current-user-id.decorator';
import { TenantContext, GLOBAL_STAGES, GlobalStage } from '@exam-platform/shared';
import { CandidatesService } from './candidates.service';
import { CreateCandidateDto } from './dto/create-candidate.dto';
import { UpdateCandidateDto } from './dto/update-candidate.dto';
import { BulkUploadCandidatesDto } from './dto/bulk-upload-candidates.dto';

@Controller('candidates')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CandidatesController {
  constructor(private readonly candidatesService: CandidatesService) {}

  @Post()
  @RequirePermissions('candidate:manage')
  create(@CurrentTenant() tenant: TenantContext, @Body() dto: CreateCandidateDto) {
    return this.candidatesService.create(tenant, dto);
  }

  @Get()
  @RequirePermissions('candidate:manage')
  list(
    @CurrentTenant() tenant: TenantContext,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('globalStage') globalStage?: string,
  ) {
    if (globalStage !== undefined && !GLOBAL_STAGES.includes(globalStage as GlobalStage)) {
      throw new BadRequestException(`globalStage must be one of: ${GLOBAL_STAGES.join(', ')}`);
    }
    return this.candidatesService.list(tenant, { page, pageSize, search, status, globalStage });
  }

  @Patch(':id')
  @RequirePermissions('candidate:manage')
  update(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateCandidateDto,
  ) {
    return this.candidatesService.update(tenant, userId, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('candidate:manage')
  remove(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Param('id') id: string) {
    return this.candidatesService.remove(tenant, userId, id);
  }

  @Get('lookup')
  @RequirePermissions('candidate:data_rights')
  lookupByEmail(@CurrentTenant() tenant: TenantContext, @Query('email') email?: string) {
    if (!email) {
      throw new BadRequestException('email query parameter is required');
    }
    return this.candidatesService.lookupByEmail(tenant, email);
  }

  @Post('bulk')
  @RequirePermissions('candidate:manage')
  bulkUpload(@CurrentTenant() tenant: TenantContext, @Body() dto: BulkUploadCandidatesDto) {
    return this.candidatesService.bulkUpload(tenant, dto.csvContent);
  }

  @Get(':id/export')
  @RequirePermissions('candidate:data_rights')
  exportData(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Param('id') id: string) {
    return this.candidatesService.exportData(tenant, userId, id);
  }

  @Get(':id/profile')
  @RequirePermissions('results:view')
  getProfile(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.candidatesService.getProfile(tenant, id);
  }

  @Get(':id/resume')
  @RequirePermissions('results:view')
  getResumeUrl(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.candidatesService.getResumeUrl(tenant, id);
  }

  @Post(':id/erase')
  @RequirePermissions('candidate:data_rights')
  erase(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Param('id') id: string) {
    return this.candidatesService.erase(tenant, userId, id);
  }
}
