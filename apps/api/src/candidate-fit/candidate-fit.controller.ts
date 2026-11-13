import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequireAnyPermission, RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { CurrentUserId } from '../auth/current-user-id.decorator';
import { TenantContext } from '@exam-platform/shared';
import { CandidateFitService } from './candidate-fit.service';

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CandidateFitController {
  constructor(private readonly fit: CandidateFitService) {}

  @Post('jobs/:jobId/fit-assessments/score')
  @RequirePermissions('pipeline:manage')
  scoreJob(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Param('jobId') jobId: string) {
    return this.fit.scoreJob(tenant, userId, jobId);
  }

  @Post('pipeline/entries/:entryId/fit-assessment/score')
  @RequirePermissions('pipeline:manage')
  scoreEntry(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Param('entryId') entryId: string) {
    return this.fit.scoreEntry(tenant, userId, entryId);
  }

  // AS-0: candidate view is enough (the Interview coordinator reads jobs and candidates, never test results).
  @Get('pipeline/entries/:entryId/fit-assessment')
  @RequireAnyPermission('results:view', 'candidate:view')
  getForEntry(@CurrentTenant() tenant: TenantContext, @Param('entryId') entryId: string) {
    return this.fit.getForEntry(tenant, entryId);
  }

  @Get('jobs/:jobId/fit-assessments')
  @RequireAnyPermission('results:view', 'candidate:view')
  listForJob(@CurrentTenant() tenant: TenantContext, @Param('jobId') jobId: string) {
    return this.fit.listForJob(tenant, jobId);
  }
}
