import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { TenantContext } from '@exam-platform/shared';
import { JobsService } from './jobs.service';

@Controller('ai-jobs')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Get(':id')
  @RequirePermissions('ai_jobs:view')
  getById(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.jobsService.getById(tenant, id);
  }
}
