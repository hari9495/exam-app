import { BadRequestException, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { CurrentUserId } from '../auth/current-user-id.decorator';
import { TenantContext } from '@exam-platform/shared';
import { AgencySubmissionsService, AgencySubmissionStatus } from './agency-submissions.service';

const STATUSES: readonly AgencySubmissionStatus[] = ['pending', 'accepted', 'rejected'];

@Controller('agency-submissions')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AgencySubmissionsController {
  constructor(private readonly agencySubmissions: AgencySubmissionsService) {}

  @Get()
  @RequirePermissions('pipeline:manage')
  list(@CurrentTenant() tenant: TenantContext, @Query('status') status?: string) {
    const resolved = status ?? 'pending';
    if (!STATUSES.includes(resolved as AgencySubmissionStatus)) {
      throw new BadRequestException(`status must be one of: ${STATUSES.join(', ')}`);
    }
    return this.agencySubmissions.list(tenant, resolved as AgencySubmissionStatus);
  }

  @Post(':id/accept')
  @RequirePermissions('pipeline:manage')
  accept(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Param('id') id: string) {
    return this.agencySubmissions.accept(tenant, id, userId);
  }

  @Post(':id/reject')
  @RequirePermissions('pipeline:manage')
  reject(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Param('id') id: string) {
    return this.agencySubmissions.reject(tenant, id, userId);
  }
}
