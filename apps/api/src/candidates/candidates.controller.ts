import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { TenantContext } from '@exam-platform/shared';
import { CandidatesService } from './candidates.service';
import { CreateCandidateDto } from './dto/create-candidate.dto';
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
  list(@CurrentTenant() tenant: TenantContext, @Query('limit') limit?: string, @Query('cursor') cursor?: string) {
    return this.candidatesService.list(tenant, { limit: limit ? parseInt(limit, 10) : undefined, cursor });
  }

  @Post('bulk')
  @RequirePermissions('candidate:manage')
  bulkUpload(@CurrentTenant() tenant: TenantContext, @Body() dto: BulkUploadCandidatesDto) {
    return this.candidatesService.bulkUpload(tenant, dto.csvContent);
  }
}
